// The Three.js port of the Docklands 3D page (experimental): https://danbri.github.io/londat/docklands/
// three.js r186 from third_party/three (vendored), WebGPURenderer: WebGPU where the browser has it, else the WebGL 2
// backend (?webgl forces it). The same TSL node materials compile for both. The data are the WebGL page's own files
// (cwplans/docklands/data/*.js, *.json) read unchanged; roofs-layer.js and look-layer.js are reused through the mesh-builder interface
// of build.js. URL switches: ?view=, ?t=, ?night, ?webgl, ?look=real, ?ground=rgb2008|night2012|intensity2020,
// ?shadows=0|1, ?bloom=0|1, #at=x,z[,dist], and the WebGL page's share hash #v=1&c=tx,tz,ty,dist,yaw,pitch.
// Skill: docklands-3d-page, "Three.js port".
import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { A, MFP, dec, buildBuildings, terrainGeometry, waterGeometry, greensGeometry, linesGeometry, groundAt, inside } from './build.js';
import { U, buildingMaterial, terrainMaterial, waterMaterial, vertexColourMaterial } from './materials.js';
import { Sky3, fromLondon } from './sky3.js';
import { makeUi, initMenu } from './menu.js';
import { initCarousel } from './carousel.js';
import { predict } from './tide.js';

const $ = id => document.getElementById(id), hud = $('hud'), qs = new URLSearchParams(location.search);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const flag = (k, dflt) => qs.has(k) ? !/^(0|false|off|no)$/i.test(qs.get(k)) : dflt;
const WEBGL = '../cwplans/docklands/', DATA = WEBGL + 'data/';   // the WebGL page and its data
const loadJSON = async u => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
const say = t => { hud.textContent = t; };
let need = true;
const londonDate = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });   // YYYY-MM-DD on the London wall clock (the UTC date was the day before from 00:00 to 01:00 BST)
function draw() { need = true; }   // the render loop draws a frame when asked (and while the camera moves)

// ---------- renderer: WebGPU, else WebGL 2
// three.js r186 passes swizzle: 'rgba' (the identity) in every texture view descriptor; Chromium 141 knows an older form
// of the member and throws a TypeError, so every frame fails. Retry such a call without the member (it changes nothing).
if (globalThis.GPUTexture) { const cv = GPUTexture.prototype.createView;
  GPUTexture.prototype.createView = function (d) { if (!d || d.swizzle !== 'rgba') return cv.call(this, d); try { return cv.call(this, d); } catch (e) { if (!(e instanceof TypeError)) throw e; const { swizzle, ...rest } = d; return cv.call(this, rest); } }; }
const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: flag('webgl', false), powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
$('view').appendChild(renderer.domElement);
try { await renderer.init(); } catch (e) { say('This browser has neither WebGPU nor WebGL 2: ' + e.message); throw e; }
const GPU = !!renderer.backend.isWebGPUBackend, BACKEND = GPU ? 'WebGPU' : 'WebGL 2';
$('backend').textContent = BACKEND;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45.8, innerWidth / innerHeight, 2, 30000);
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: false, screenSpacePanning: false, minDistance: 10, maxDistance: 16000, maxPolarAngle: Math.PI - 0.05, zoomToCursor: true });   // its own input is off: main.js "navigation" moves the camera
controls.listenToKeyEvents(window);
// vertical exaggeration (Look > Model settings, ?vz=1 to 5; index.html vz: gl_Position = m * (x, y * vz, z)): the scene stays
// in model metres (the TSL graphs read positionWorld) and the camera's world matrix takes a y scale of 1 / VZ, so the view
// matrix is V x diag(1, VZ, 1). The orbit (camera.position, controls.target) is in the exaggerated space, as the WebGL
// page's T = (tx, ty x VZ, tz); everything that reads camera.matrixWorld (Raycaster.setFromCamera, Vector3.project, the
// cameraPosition node, frustum culling) then works in model metres. r186 Camera.updateMatrixWorld and updateWorldMatrix
// rebuild matrixWorldInverse without scale, so both are wrapped. Not in a headset session (layers/xr.js draws those at
// vz 1: vzNow()). Other cameras get the same wrapper with ctx.vzCamera (styles.js pixel art); the water mirror
// (layers/water.js) mirrors the rigid camera in the exaggerated space and applies the scale to its virtual camera.
let VZ = 1;
const SINV = new THREE.Matrix4();
const vzNow = () => VZ === 1 || ctx.xrFrame ? 1 : VZ;   // the scale in use: 1 in a headset session (ctx exists once VZ is not 1)
const vzCams = new WeakSet();
function vzCamera(cam) {   // a camera whose world matrix takes the y scale 1 / vz (its position and orbit stay in the exaggerated space)
  if (vzCams.has(cam)) return cam; vzCams.add(cam);   // (not userData: Object3D.clone copies it, never the wrapper)
  let rigid = false;   // inside lookAt: Object3D.lookAt reads the eye from matrixWorld, which must then be the unscaled one
  const fix = () => { if (!rigid && vzNow() !== 1) { cam.matrixWorld.premultiply(SINV); cam.matrixWorldInverse.copy(cam.matrixWorld).invert(); } };
  const umw = cam.updateMatrixWorld, uwm = cam.updateWorldMatrix, la = cam.lookAt;
  cam.updateMatrixWorld = function (force) { umw.call(this, force); fix(); };
  cam.updateWorldMatrix = function (up, down) { uwm.call(this, up, down); fix(); };
  cam.lookAt = function (...a) { if (vzNow() === 1) return la.apply(this, a); rigid = true; try { la.apply(this, a); } finally { rigid = false; } this.updateMatrixWorld(); };
  return cam;
}
vzCamera(camera);
// zoom to the cursor (OrbitControls zoomToCursor): the pointer ray in the exaggerated space (unproject gives model metres)
{ const uzp = controls._updateZoomParameters;
  if (uzp) controls._updateZoomParameters = function (x, y) { uzp.call(this, x, y); const v = vzNow(); if (v !== 1 && this.zoomToCursor) { const d = this._dollyDirection.set(this._mouse.x, this._mouse.y, 1).unproject(this.object); d.y *= v; d.sub(this.object.position).normalize(); } }; }
function setVz(v) {
  v = THREE.MathUtils.clamp(+v || 1, 1, 5); if (v === VZ) return;
  if (HFOV) { const off = camera.position.y - controls.target.y; camera.position.y = camera.position.y / VZ * v; controls.target.y = camera.position.y - off; }   // a photo lens: the eye keeps its true height above the water, the view its tilt (index.html scales T.y and puts the eye under the water)
  else { const ty = controls.target.y; controls.target.y = ty / VZ * v; camera.position.y += controls.target.y - ty; }   // the eye keeps its offset from the target (index.html T.y = ty x VZ)
  VZ = v; SINV.makeScale(1, 1 / v, 1); sky.setVz(v); camera.updateMatrixWorld(); draw(); writeHash();
}
const eyeM = new THREE.Vector3();   // the eye in model metres

// ---------- static layers
say('Building the model...');
const box = (await loadJSON(DATA + 'tex/textures.json').catch(() => null))?.box || { x0: A.meta.extent.x0, x1: A.meta.extent.x1, z0: A.meta.extent.z0, z1: A.meta.extent.z1 };
const tmat = terrainMaterial(), terrain = new THREE.Mesh(terrainGeometry(box), tmat); terrain.receiveShadow = true; scene.add(terrain);
const water = new THREE.Mesh(waterGeometry(), waterMaterial()); water.receiveShadow = true; scene.add(water);
const greens = new THREE.Mesh(greensGeometry(), vertexColourMaterial({ cut: false })); greens.receiveShadow = true; scene.add(greens);
const LN = linesGeometry(), lineMat = vertexColourMaterial(), rail = new THREE.Mesh(LN.rail, lineMat), roads = new THREE.Mesh(LN.road, lineMat); scene.add(rail, roads);
roads.visible = flag('roads', true);
// keep the flat layers above the ground in the depth buffer (the WebGL page offsets them by 0.1 to 0.4 m)
for (const m of [water.material, greens.material, lineMat]) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4; }

const bmat = buildingMaterial(), buildings = new THREE.Group(); scene.add(buildings);
let TOWERS = null, ROOFS = null, LOOK = null, BMOD = null, FACADE = null, FACADES_ON = true;   // FACADE(i): the photo facade slot of model building i, or null; Menu > Look > Photo facades
const skip = new Set();
function rebuildBuildings() {
  for (const m of buildings.children) m.geometry.dispose(); buildings.clear();
  const t0 = performance.now();
  for (const G of buildBuildings({ towers: TOWERS, roofs: ROOFS, look: LOOK, skip, facadeOf: FACADES_ON ? FACADE : null, ...buildOpts })) { const m = new THREE.Mesh(G, bmat); m.castShadow = m.receiveShadow = true; m.userData.tile = true; buildings.add(m); }
  const tris = buildings.children.reduce((s, m) => s + m.geometry.index.count / 3, 0);
  STATS.buildings = { tiles: buildings.children.length, triangles: tris, ms: Math.round(performance.now() - t0) };
  draw();
}
const STATS = {}, buildOpts = {};   // buildOpts: options a layer adds to buildBuildings (layers/skyline.js: heightOf, colourOf, towers: null)
rebuildBuildings();

// ---------- sky and light
const sky = new Sky3(scene);
const focus = new THREE.Vector3();
let clock = qs.get('t') ? fromLondon(qs.get('t')) : Date.now(); if (!isFinite(clock)) clock = Date.now();
if (qs.has('night') && !qs.get('t')) clock = fromLondon(londonDate(Date.now()) + 'T22:00');
let NIGHT = false;
const clockHooks = [];   // carousel.js: redraw the wheels when the clock changes
let TSHARE = null;   // the London wall-clock time the visitor chose (wheels, slider, day or night): in the share hash as t=
let DRIVE = !!qs.get('t');   // the visitor (or ?t=, a hash t=) set the clock: the WebGL page's sky.js S.drive (never reset; "Now" does not set it)
const londonStr = t => `${londonDate(t)}T${new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t))}`;
function setClockUser(t, live = false) {   // a clock the visitor set: it replaces ?t= (so views may change day and night again) and goes in the hash
  if (qs.has('t')) { qs.delete('t'); const q = new URLSearchParams(location.search); q.delete('t'); history.replaceState(null, '', location.pathname + (q.size ? '?' + q : '') + location.hash); }
  TSHARE = live ? null : londonStr(t); if (!live) DRIVE = true; setClock(t); writeHash();
}
function setClock(t) {
  clock = t; const s = sky.setTime(t, focus); NIGHT = s.night;
  U.night.value = THREE.MathUtils.clamp((-s.sun.alt - 2) / 6, 0, 1);
  // scene.background (dark by night, lit by the city under cloud) is set by sky.setTime and sky.setWeather (sky3.js)
  bmat.roughness = NIGHT ? 0.5 : 0.82;
  syncClockUi(); syncPost(); for (const f of clockHooks) f(t); draw();
}

// ---------- shadows (cascaded, WebGPU by default) and bloom (by night, WebGPU by default)
let csm = null;
function setShadows(on) {
  sky.sun.castShadow = on;
  if (on && !csm) { const sh = sky.sun.shadow; sh.mapSize.set(2048, 2048); sh.camera.near = 1; sh.camera.far = 9000; sh.bias = -0.0004; sh.normalBias = 0.6;
    csm = new CSMShadowNode(sky.sun, { cascades: 3, maxFar: 7000, mode: 'practical', lightMargin: 600 }); csm.fade = true; sh.shadowNode = csm; }
  $('shadows').checked = on; draw();
}
const pipe = new THREE.RenderPipeline(renderer), scenePass = pass(scene, camera), scol = scenePass.getTextureNode('output');
const bloomNode = bloom(scol, 0.9, 0.45, 0.6);
let BLOOM = flag('bloom', GPU);
function syncPost() { pipe.outputNode = BLOOM && U.night.value > 0.01 ? scol.add(bloomNode) : scol; pipe.needsUpdate = true; $('bloom').checked = BLOOM; }

// ---------- camera: the WebGL page's (target, yaw, pitch, dist), eye = target + dist (sin yaw cos pitch, sin pitch, cos yaw cos pitch)
const VIEWS = {
  area: { tx: -1400, ty: 0, tz: 800, yaw: .35, pitch: .62, dist: 8200 },
  cw: { tx: 50, ty: 0, tz: 40, yaw: .7, pitch: .5, dist: 1500 },
  under: { tx: 40, ty: -10, tz: 20, yaw: .75, pitch: .42, dist: 750 },
  plan: { tx: -1400, ty: 0, tz: 800, yaw: 0, pitch: 1.55, dist: 9500 },
  // more places (owner, 2026-10-09: "under Places add a few other interesting camera positions"); BNG to model frame
  towerbridge: { tx: -3900, ty: 0, tz: 40, yaw: 2.2, pitch: .42, dist: 700 },      // Tower Bridge, E 533650 N 180260
  limehouse: { tx: -1150, ty: 0, tz: -600, yaw: 1.3, pitch: .55, dist: 650 },      // Limehouse Basin, E 536400 N 180900
  canadawater: { tx: -2250, ty: 0, tz: 700, yaw: -.6, pitch: .5, dist: 800 },      // Canada Water and Surrey Docks, E 535300 N 179600
  mudchute: { tx: 750, ty: 0, tz: 1600, yaw: .2, pitch: .45, dist: 700 },         // Mudchute Park and Farm, E 538300 N 178700
  greenwich: { tx: 750, ty: 0, tz: 2600, yaw: 3.0, pitch: .4, dist: 900 },         // Cutty Sark and the Old Royal Naval College, E 538300 N 177700
  o2: { tx: 1750, ty: 0, tz: 0, yaw: -.9, pitch: .45, dist: 1100 },                // the O2 and Blackwall, E 539300 N 180300
  rotherhithe: eyeView([-896, 6.9, 1150], 43.3, -1, 42),
  greenland: eyeView([-825, 5.3, 1160], 39.7, 3.5, 44),
  pier: eyeView([-740, 6, 140], 83.6, 11, 69),
  greenlandday: { ...eyeView([-830, 4.5, 1158], 51.9, 6.45, 99.9), night: false },
  plane: { ...eyeView([211, 802, -845], 223.84, -13.56, 56.9), roll: 9.18, night: false },
};
function eyeView(E, az, lp, hfov, D = 1200) {   // index.html eyeView: a photo's camera, orbiting a point 1.2 km along the line of sight
  const a = az * Math.PI / 180, p = lp * Math.PI / 180;
  return { tx: E[0] + D * Math.sin(a) * Math.cos(p), ty: E[1] + D * Math.sin(p), tz: E[2] - D * Math.cos(a) * Math.cos(p), yaw: -a, pitch: -p, dist: D, hfov: hfov * Math.PI / 180, night: true };
}
let HFOV = null, FOVY = null, ROLL = 0, VIEWNAME = null;   // the lens: horizontal field (a photo view), else vertical field (radians); roll (degrees); the view button
// c.hfov, c.fov, c.roll set the lens; without them, c.lens (from camState) keeps it (styles.js, xr.js, kml.js, locate.js restore a camState)
function setCam(c) {
  const L = ('hfov' in c || 'fov' in c || 'roll' in c) ? c : (c.lens || c);
  HFOV = L.hfov || null; FOVY = HFOV ? null : L.fov || null; ROLL = L.roll || 0; camera.fov = FOVY ? FOVY * 180 / Math.PI : 45.8;
  const ce = Math.cos(c.pitch), off = c.dist * Math.sin(c.pitch);
  // ty in model metres; the orbit is in the exaggerated space. A photo lens keeps the eye (ty + off) at its true height under ?vz
  const ty = HFOV && VZ !== 1 ? ((c.ty || 0) + off) * VZ - off : (c.ty || 0) * VZ; controls.target.set(c.tx, ty, c.tz);
  camera.position.set(c.tx + c.dist * Math.sin(c.yaw) * ce, ty + off, c.tz + c.dist * Math.cos(c.yaw) * ce);
  // a photo view looks up or level: let the orbit go below the horizontal for it
  controls.maxPolarAngle = Math.PI - 0.05; controls.minDistance = 10;   // the pitch limits and the ground limit are main.js "navigation" (navGuard); 10 m everywhere (the WebGL page: 80): close to a tree or a door; the near plane follows the eye's height
  resize(); controls.update(); draw();
}
function camState() {
  const d = camera.position.clone().sub(controls.target), dist = d.length();
  return { tx: controls.target.x, ty: HFOV ? camera.position.y / VZ - d.y : controls.target.y / VZ, tz: controls.target.z, dist, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(THREE.MathUtils.clamp(d.y / dist, -1, 1)), lens: { hfov: HFOV, fov: FOVY, roll: ROLL } };
}
function setView(k) {
  const v = VIEWS[k]; if (!v) return; setCam(v); VIEWNAME = k;
  if (v.night && !qs.get('t')) setClock(fromLondon(londonDate(clock) + 'T21:30'));
  if (v.night === false && NIGHT && !qs.get('t')) setClock(fromLondon(londonDate(clock) + 'T14:00'));
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === k)));
}

// ---------- share hash (the WebGL page's #v=1&c=…, nav.js): open the same view on either page
const parseHash = h => { const m = {}; for (const part of String(h || '').replace(/^#/, '').split('&')) { const i = part.indexOf('='); if (i > 0) try { m[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1)); } catch { /* bad escape */ } } return m; };
function shareHash() {
  const c = camState(), r = (x, k = 1) => Math.round(x * k) / k;   // nav.js shareState: c= to 0.1 m and 1e-4 rad, f= the lens (h + horizontal field, or the vertical field), rl= roll, vw= the view
  return `#v=1&c=${[r(c.tx, 10), r(c.tz, 10), r(c.ty, 10), r(c.dist), r(c.yaw, 1e4), r(c.pitch, 1e4)].join(',')}${HFOV ? '&f=h' + r(HFOV, 1e4) : FOVY ? '&f=' + r(FOVY, 1e4) : ''}${ROLL ? '&rl=' + r(ROLL, 1e4) : ''}${VIEWNAME ? '&vw=' + VIEWNAME : ''}${NIGHT ? '&n=1' : ''}${TSHARE || qs.get('t') ? '&t=' + encodeURIComponent(TSHARE || qs.get('t')) : ''}${SEL >= 0 && KEYS ? '&id=osm:' + KEYS.ids[SEL] : ''}`;
}
let hashTimer = 0;
const writeHash = () => { clearTimeout(hashTimer); hashTimer = setTimeout(() => { history.replaceState(null, '', location.pathname + location.search + shareHash()); const q = new URLSearchParams(location.search); for (const k of ['webgl', 'shadows', 'bloom', 'look', 'ground', 'roads', 'towers', 'roofs']) q.delete(k); $('glLink').href = WEBGL + (q.size ? '?' + q : '') + shareHash(); }, 400); };

// ---------- picking and the record card
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), zr = new THREE.Raycaster();   // zr: the zoom stop (controls.update)
let SEL = -1, KEYS = null, keysLoading = null;
const keys = () => keysLoading || (keysLoading = loadJSON(DATA + 'building-keys.json').then(J => { if (J.model && J.model.fp !== MFP) { console.warn('building-keys.json is for another area.js'); return null; } J.ids = J.ids.split(','); return (KEYS = J); }).catch(e => { console.warn(e); return null; }));
const selMat = new THREE.MeshBasicNodeMaterial({ color: 0xffd34d, transparent: true, opacity: 0.35, depthTest: true, side: THREE.DoubleSide }), sel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), selMat);
sel.visible = false; sel.renderOrder = 2; scene.add(sel);
function aim(x, y) { const r = renderer.domElement.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray; }
function pickHit() {   // the building or detailed model under the ray: { i: model index, d: distance } or null
  const hit = ray.intersectObjects([...buildings.children, ...models.children], true).find(h => U.cut.value >= 250 || h.point.y <= U.cut.value); if (!hit) return null;   // a part cut away cannot be tapped
  let o = hit.object; while (o && o.userData.model == null && o.parent) o = o.parent;
  const i = o && o.userData.model != null ? o.userData.model : hit.object.geometry.userData.bi ? hit.object.geometry.userData.bi[hit.face.a] : -1;
  return i >= 0 ? { i, d: hit.distance } : null;
}
function pickAt(x, y) { aim(x, y); const h = pickHit(); return h ? h.i : -1; }
// a tap: the nearest of the building under the ray and what the layers' pick hooks find (ctx.addPick(ray => null | { distance, open() }))
const pickHooks = [];
function tap(x, y) {
  aim(x, y); const b = pickHit(); let best = b ? { distance: b.d, open: () => selectModel(b.i) } : null;
  for (const f of pickHooks) { let r = null; try { r = f(ray); } catch (e) { console.warn('pick', e); } if (r && (!best || r.distance < best.distance)) best = r; }
  if (!best) { selectModel(-1); return; }
  if (!b || best.distance !== b.d) { SEL = -1; highlight(-1); writeHash(); }
  best.open();
}
// building mode: 'ghost' (see-through, no depth write) while any layer asks for it (floors), else solid
const ghosts = new Set();
function setBuildingMode(mode, who) {
  if (mode === 'ghost') ghosts.add(who); else ghosts.delete(who); const g = ghosts.size > 0;
  if (bmat.transparent !== g) { Object.assign(bmat, g ? { transparent: true, opacity: .22, depthWrite: false } : { transparent: false, opacity: 1, depthWrite: true }); bmat.needsUpdate = true; } draw();
}
function highlight(i) {   // the picked building's outline as a translucent prism
  if (i < 0) { sel.visible = false; return; }   // r186 WebGPURenderer: a mesh first drawn with an empty geometry is never drawn again, so it keeps a geometry and hides
  sel.geometry.dispose(); sel.visible = true;
  const b = A.buildings[i], f = dec(b.p), n = b.holes && b.holes.length ? b.holes[0] : f.length / 2, sh = new THREE.Shape();
  for (let k = 0; k < n; k++) sh[k ? 'lineTo' : 'moveTo'](f[2 * k], -f[2 * k + 1]);
  const G = new THREE.ExtrudeGeometry(sh, { depth: b.h + 0.6, bevelEnabled: false }); G.rotateX(-Math.PI / 2); G.translate(0, b.b - 0.3, 0); sel.geometry = G;
}
const cardHooks = [];   // ctx.addCard(i => html | Promise<html> | null)
async function selectModel(i) {
  SEL = i; highlight(i); writeHash(); draw();
  const card = $('card'); if (i < 0) { card.hidden = true; return; }
  const b = A.buildings[i]; card.hidden = false;
  $('cardBody').innerHTML = `<h2>Building ${i}</h2><p class="small">Loading the record...</p>`;
  for (const f of cardHooks) { let h = null; try { h = await f(i); } catch (e) { console.warn('card', e); } if (SEL !== i) return; if (h) { $('cardBody').innerHTML = h; writeHash(); return; } }   // a layer's card first (layers/registry.js: the registry card)
  const K = await keys(); if (SEL !== i) return;
  const id = K ? K.ids[i] : null, o = (K && K.osm[id]) || {}, osmUrl = id ? `https://www.openstreetmap.org/${id[0] === 'w' ? 'way' : 'relation'}/${id.slice(1)}` : null;
  const name = o.n || o.h || o.a || (id ? `OpenStreetMap ${id}` : `Building ${i}`), rf = ROOFS && ROOFS.get(i), dm = BMOD && BMOD.find(m => m.mi.includes(i));
  $('cardBody').innerHTML = `<h2>${esc(name)}</h2>` +
    `<p>${[o.a && o.n ? esc(o.a) : '', o.pc ? esc(o.pc) : '', o.b ? 'type ' + esc(o.b) : '', o.l ? esc(o.l) + ' levels' : ''].filter(Boolean).join(' · ')}</p>` +
    `<p>Ground ${b.b.toFixed(1)} m OD, height ${b.h.toFixed(1)} m${b.mh ? `, from ${b.mh.toFixed(1)} m` : ''}, top ${(b.b + b.h).toFixed(1)} m OD${rf ? `; roof ${esc(rf.shape === 'parts' ? 'in parts' : rf.shape)}, ridge ${(b.b + rf.ridge).toFixed(1)} m OD` : ''}${dm ? `; detailed model (glTF): ${esc(dm.name)}` : ''}.</p>` +
    `<p class="small">Model index ${i}${id ? ` · <a href="${osmUrl}" target="_blank" rel="noopener">OpenStreetMap ${esc(id)}</a>` : ''} · <a href="${WEBGL}${id ? '#v=1&id=osm:' + id + '&c=' + shareHash().split('c=')[1].split('&')[0] : ''}">open in the WebGL page</a></p>`;
  writeHash();
}
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
renderer.domElement.addEventListener('pointerup', e => { if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); if (moved < 6 && performance.now() - down.t < 500) tap(e.clientX, e.clientY); down = null; });
$('cardX').onclick = () => selectModel(-1);

// ---------- labels: the named places of area.js, nearest first, at most one in a 150 x 30 px cell, 36 at most
const labels = A.places.filter(p => p.name).map(p => { const el = document.createElement('div'); el.className = 'lab'; el.textContent = p.name; $('labels').appendChild(el); return { p, el, v: new THREE.Vector3(p.x, (p.g ?? groundAt(p.x, p.z)) + (p.h || 20), p.z) }; });
const tmp = new THREE.Vector3();
function placeLabels() {
  const W = innerWidth, H = innerHeight, used = new Set(), cam = eyeM, on = $('showLabels').checked && U.cut.value >= 250;   // no place names while the model is cut away (the below-ground view)
  const order = labels.map(l => [l, l.v.distanceToSquared(cam)]).sort((a, b) => a[1] - b[1]);
  let shown = 0;
  for (const [l, d2] of order) {
    tmp.copy(l.v).project(camera); const x = (tmp.x + 1) / 2 * W, y = (1 - tmp.y) / 2 * H, cell = Math.floor(x / 150) + ',' + Math.floor(y / 30);
    const vis = on && tmp.z < 1 && x > 0 && x < W && y > 40 && y < H && d2 < 6000 * 6000 && !used.has(cell) && shown < 36;
    if (vis) { used.add(cell); shown++; l.el.style.transform = `translate(${x | 0}px,${y | 0}px) translate(-50%,-100%)`; }
    if (l.el.hidden === vis) l.el.hidden = !vis;
  }
}

// ---------- detailed building models: the glTF binary files beside their descriptions (tools/build-building-models.mjs)
const models = new THREE.Group(); scene.add(models);
async function loadModels() {
  const J = await loadJSON(DATA + 'building-models.json').catch(() => null); if (!J) return;
  BMOD = Object.values(J.models).filter(m => m.model_fp === MFP && m.mi && m.mi.length);
  const gl = new GLTFLoader();
  for (const m of BMOD) {
    const url = WEBGL + 'models/' + m.source.glb.split('/').pop();
    try { const g = await gl.loadAsync(url); g.scene.position.set(...m.t); g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); g.scene.userData.model = m.mi[0]; models.add(g.scene); for (const i of m.mi) skip.add(i); }
    catch (e) { console.warn('model', url, e); }
  }
  if (skip.size) rebuildBuildings();
}

// ---------- optional data: towers, roof shapes, realistic look (on by default since 2026-10-09; ?look=0 for flat), ground images
async function loadOptional() {
  const jobs = [], towersP = loadJSON(DATA + 'towers.json');
  if (flag('towers', true)) jobs.push(towersP.then(T => { TOWERS = Object.values(T.buildings).filter(t => t.tiers && t.tiers.length && t.status === 'fitted'); }).catch(e => console.warn('towers', e)));
  if (flag('roofs', true) && globalThis.DocklandsRoofs) jobs.push(loadJSON(DATA + 'roofs.json').then(T => { ROOFS = DocklandsRoofs.decode(T, MFP); }).catch(e => console.warn('roofs', e)));
  if (!/^(0|off|flat|no)$/i.test(qs.get('look') || '') && globalThis.DocklandsLook) jobs.push(loadJSON(DATA + 'materials.json').then(J => { const t = DocklandsLook.decode(J, MFP); if (t) { DocklandsLook.attach(t); LOOK = DocklandsLook; } }).catch(e => console.warn('materials', e)));
  // photo facades (index.html facSlot; ?facades=0 off): data/tex/facades.json gives a slot and the tile size in metres by registry id
  // (the tower's model buildings, towers.json) or by OSM key (mi, while model_fp matches this area.js); facades.jpg is the atlas
  if (flag('facades', true)) jobs.push(Promise.all([loadJSON(DATA + 'tex/facades.json'), towersP.catch(() => null), texLoader.loadAsync(DATA + 'tex/facades.jpg')]).then(([F, T, tex]) => {
    const by = new Map(), slots = [];
    for (const [key, f] of Object.entries(F.buildings)) { slots[f.slot] = [f.w_m, f.h_m];
      const mi = /^cwb-/.test(key) ? (T && T.buildings[key] ? T.buildings[key].model_buildings : []) : f.model_fp === MFP && f.mi ? f.mi : (console.warn('facades.json', key, 'is for another area.js'), []);
      for (const i of mi) by.set(i, f.slot); }
    tex.colorSpace = THREE.SRGBColorSpace; bmat.setFacades(tex, slots); FACADE = i => by.has(i) ? by.get(i) : null; STATS.facades = { buildings: by.size, slots: slots.filter(Boolean).length };
  }).catch(e => console.warn('facades', e)));
  await Promise.all(jobs); rebuildBuildings();
  $('look').checked = !!LOOK;
}
const texLoader = new THREE.TextureLoader(), texCache = {};
async function setGround(k) {
  $('ground').value = k;
  if (k === 'none') { tmat.setGround(null); draw(); return; }
  const t = texCache[k] || (texCache[k] = await texLoader.loadAsync(DATA + 'tex/' + k + '.jpg'));
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; tmat.setGround(t); draw();
}

// ---------- UI
$('animate').checked = flag('animate', true);   // moving water by default (owner, 2026-10-09); ?animate=0 draws only on a change
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
$('shadows').onchange = e => setShadows(e.target.checked);
$('bloom').onchange = e => { BLOOM = e.target.checked; syncPost(); draw(); };
$('showLabels').onchange = () => draw();
// Share this view (Menu > Views; the WebGL page's nav.js share()): the page URL with the share hash; the system share
// sheet on a touch screen, else the clipboard; the link also shows under the button to copy by hand
$('shareBtn').onclick = async () => {
  const url = location.origin + location.pathname + location.search + shareHash(), out = $('shareOut');
  history.replaceState(null, '', url); out.hidden = false; out.textContent = url;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title: document.title, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  let copied = false; try { await navigator.clipboard.writeText(url); copied = true; } catch {}
  $('shareBtn').textContent = copied ? 'Link copied' : 'Share this view'; setTimeout(() => { $('shareBtn').textContent = 'Share this view'; }, 2500);
};
$('showRoads').checked = roads.visible; $('showRoads').onchange = e => { roads.visible = e.target.checked; draw(); };
$('ground').onchange = e => setGround(e.target.value);
$('facades').onchange = e => { FACADES_ON = e.target.checked; rebuildBuildings(); };
$('look').onchange = async e => { if (e.target.checked && !LOOK) { const J = await loadJSON(DATA + 'materials.json'); const t = DocklandsLook.decode(J, MFP); if (t) { DocklandsLook.attach(t); LOOK = DocklandsLook; } } else if (!e.target.checked) LOOK = null; rebuildBuildings(); };
const hourOf = t => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t)); return p; };
function syncClockUi() { const s = sky.state; $('clock').textContent = `${new Date(clock).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' })} ${hourOf(clock)} London · sun ${s ? s.sun.alt.toFixed(1) : '?'}°`; const [hh, mm] = hourOf(clock).split(':').map(Number); $('hour').value = hh + mm / 60; }
$('hour').oninput = e => { const d = new Date(clock).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }), v = +e.target.value, hh = Math.floor(v), mm = Math.round((v - hh) * 60); setClockUser(fromLondon(`${d}T${String(hh).padStart(2, '0')}:${String(Math.min(59, mm)).padStart(2, '0')}`)); };
$('nightBtn').onclick = () => { const d = new Date(clock).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); setClockUser(fromLondon(d + (NIGHT ? 'T13:00' : 'T22:00'))); };
$('tNight').onclick = () => $('nightBtn').click();
const clockNow = () => setClockUser(Date.now(), true);
$('tNow').onclick = clockNow;

// ---------- layers: one module each in layers/ (export default { id, label, on, async init(ctx) -> { object, setVisible(on) } });
// a module that is missing is skipped. The list is the order in the menu. Skill: docklands-3d-page, "Three.js port".
// ?layers=a,b loads only those (a layer under development is tested that way before it joins the list; ?layers= loads none)
const LAYER_IDS = (qs.get('layers') ?? 'trees,ring,walls,riverbed,floors,under,water,tide,stations,skyline,placenames,registry,keys,search,routes,nightlights,ships,piers,planes,wildlife,wind,weather,sky-extra,drone,plotter,music,splats,overlays,river,kml,locate,model,xr').split(',').filter(Boolean);
// a test link (?layers=, &planecam=) limits the page: say so, with a link to the full page at the same view (owner,
// 2026-10-09, opened a close-up link with ?layers=planes and saw no trees or data layers)
if (qs.has('layers') || qs.has('planecam')) {
  const q = new URLSearchParams(location.search); for (const k of [...q.keys()]) if (k === 'layers' || k.startsWith('planecam')) q.delete(k);
  const hash0 = location.hash, n = document.createElement('div'); n.id = 'testNote';
  n.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(132px + env(safe-area-inset-top, 0px));z-index:6;background:var(--panel);color:var(--fg, #eee);font-size:12px;padding:4px 10px;border-radius:6px;max-width:calc(100vw - 24px);text-align:center';
  n.innerHTML = `Test view: ${qs.has('layers') ? 'only the layers ' + (qs.get('layers') || 'none').replace(/[<>&"]/g, '') : 'the camera follows an aircraft'}. <a id="testAll" href="#">Show the full page</a>`;
  document.body.appendChild(n);
  n.querySelector('#testAll').onclick = e => { e.preventDefault(); location.href = location.pathname + (q.size ? '?' + q : '') + (qs.has('planecam') ? hash0 : shareHash()); };   // the camera followed an aircraft: go back to the link's own view
}
const LAYERS = {}, frameHooks = [];
// where each layer's controls go in the menu (menu.js; the Menu map in README.md): a pane ('look', 'go', 'time', 'about')
// or a group of the Layers pane ('layers/city' ...). A module may say { menu: '...' } itself; the default is 'layers/city'.
const MENU_PLACE = { trees: 'layers/city', ring: 'layers/city', skyline: 'layers/city', nightlights: 'layers/city', registry: 'layers/city', keys: 'layers/city',
  floors: 'layers/below', under: 'layers/below', stations: 'layers/below', walls: 'layers/water', riverbed: 'layers/water', river: 'layers/water', piers: 'layers/water',
  ships: 'layers/live', planes: 'layers/sim', wildlife: 'layers/sim', overlays: 'layers/overlays', kml: 'layers/kml',
  water: 'look', splats: 'look', music: 'look', tide: 'time', wind: 'time', weather: 'time', plotter: 'about', routes: 'go', search: 'go', drone: 'go', locate: 'go', xr: 'go' };
const ui = makeUi(draw);
const ctx = {
  THREE, scene, camera, renderer, controls, A, U, DATA, WEBGL, GPU, BACKEND, sky, qs, flag, ui, loadJSON, dec, groundAt, draw, esc,
  materials: { vertexColourMaterial }, buildOpts, stats: STATS, meshes: { terrain, water, greens, rail, roads, buildings, models }, rebuildBuildings: () => rebuildBuildings(), onFrame: f => frameHooks.push(f),
  addPick: f => pickHooks.push(f), addCard: f => cardHooks.push(f), setBuildingMode, setVz, get vz() { return VZ; }, vzNow, vzCamera, SINV,
  showCard(html) { $('card').hidden = false; $('cardBody').innerHTML = html; }, get night() { return NIGHT; }, get clock() { return clock; },
};
async function loadLayers() {
  for (const id of LAYER_IDS) {
    let mod; try { mod = (await import(`./layers/${id}.js`)).default; } catch (e) { if (!/Failed to fetch|Importing a module script failed|error loading dynamically imported module/i.test(e.message)) console.warn('layer', id, e); continue; }
    ui.tab(mod.menu || MENU_PLACE[id] || 'layers/city');
    const mark = document.createComment(id); ui.host().appendChild(mark);   // the layer's own on/off goes first, above its controls
    try { const on = flag(id, mod.on !== false), L = (await mod.init(ctx, on)) || {}; LAYERS[id] = { mod, api: L, on };   // api kept as returned: its getters stay live
      if (L.object) { L.object.visible = on; scene.add(L.object); }
      // the falling sheet (reveal.js): when the visitor ticks a layer on; at page load only with ?reveal=load (start time)
      const sheet = () => { if (L.object && mod.reveal !== false) import('./reveal.js').then(R => R.reveal(ctx, { object: L.object, label: mod.label || id, draw2d: mod.draw2d, alive: () => LAYERS[id].on })).catch(e => console.warn('reveal', id, e)); };
      if (on && qs.get('reveal') === 'load') sheet();
      if (mod.label && !L.ownUi) { const i = ui.toggle(mod.label, on, v => { LAYERS[id].on = v; if (L.setVisible) L.setVisible(v); else if (L.object) L.object.visible = v; if (v) sheet(); }); if (mark.parentNode) mark.replaceWith(i.parentNode); }
    } catch (e) { console.warn('layer', id, e); }
    mark.remove();
  }
  STATS.layers = Object.keys(LAYERS); menu.finish(); draw();
}

// ---------- render loop: on demand (a frame while the camera moves or a clock changes), always while the water moves
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h;
  if (HFOV) camera.fov = photoFovY();
  camera.updateProjectionMatrix(); draw();
}
addEventListener('resize', resize);
controls.addEventListener('change', () => { draw(); writeHash(); });
controls.addEventListener('start', () => { VIEWNAME = null; document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', 'false')); leavePhoto(); });   // a drag leaves the named view (nav.js: no vw=)
// a wheel over a label button (traffic cameras) zooms the map as over the canvas
$('labels').addEventListener('wheel', e => { e.preventDefault(); renderer.domElement.dispatchEvent(new WheelEvent('wheel', e)); }, { passive: false });
// a touch that starts on a label button ("cam", place names) goes to the map too, so a pinch or drag that begins there works;
// a short still tap (under 300 ms and 10 px) still opens the label (owner, 2026-10-09: a pinch on a "cam" label did nothing)
{ const taps = new Map();   // pointerId -> { el, x, y, t }
  $('labels').addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' || !e.target.closest('button,.lab,.pnl')) return;
    e.preventDefault(); taps.set(e.pointerId, { el: e.target.closest('button,.lab,.pnl'), x: e.clientX, y: e.clientY, t: performance.now() });
    renderer.domElement.dispatchEvent(new PointerEvent('pointerdown', e)); }, { passive: false });
  // the moves and the lift of each such finger go to the map as well (the canvas did not capture these pointers)
  const fwd = e => { if (taps.has(e.pointerId) && e.target !== renderer.domElement) renderer.domElement.dispatchEvent(new PointerEvent(e.type, e)); };
  addEventListener('pointermove', fwd, true);
  addEventListener('pointerup', e => { const T = taps.get(e.pointerId); if (!T) return; fwd(e); taps.delete(e.pointerId);
    if (!taps.size && performance.now() - T.t < 300 && Math.hypot(e.clientX - T.x, e.clientY - T.y) < 10) T.el.click(); }, true);
  addEventListener('pointercancel', e => { if (taps.has(e.pointerId)) { fwd(e); taps.delete(e.pointerId); } }, true); }
// a photo view keeps the photo's horizontal field, but on a portrait screen the vertical field is capped at PHOTO_VMAX
// (390 x 844: Rotherhithe 79 deg, Greenland day 138 deg uncapped, a fisheye); the landscape frame is the WebGL page's
const PHOTO_VMAX = 70;
function photoFovY() { const f = 2 * Math.atan(Math.tan(HFOV / 2) / camera.aspect) * 180 / Math.PI; return camera.aspect < 1 ? Math.min(f, PHOTO_VMAX) : f; }
// the visitor moves the camera after a photo view: the lens eases back to the normal 45.8 deg in 0.6 s, the roll goes,
// and the orbit target moves to the ground (or water) under the screen centre, so a zoom goes towards what they see
// (a photo view orbits a point 1.2 km along the line of sight, often in the air or across the river)
function leavePhoto() {
  if (!HFOV && !ROLL) return;
  const f0 = camera.fov, t0 = performance.now(); HFOV = null; FOVY = null; ROLL = 0; camera.up.set(0, 1, 0);
  const step = () => { const k = Math.min(1, (performance.now() - t0) / 600), e = k * k * (3 - 2 * k); camera.fov = f0 + (45.8 - f0) * e; camera.updateProjectionMatrix(); draw(); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);   // (the photo view's old orbit limit, pi - 0.05, let a drag up take the eye under the water: white flashes on the horizon, 2026-10-09; now navGuard keeps the eye 1 m over it)
  controls.target.copy(centreGround(3000, Math.min(400, camera.position.distanceTo(controls.target)))); controls.update(); writeHash();
}
// the ground (or water) point under the screen centre within maxS m of the eye, else the point at s0 m along the centre
// ray; in the orbit's (exaggerated) space
function centreGround(maxS, s0) {
  camera.updateMatrixWorld(); const o = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld), d = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld);   // matrixWorld holds the 1 / vz scale: model metres
  let hit = null; for (let s = 2; s <= maxS; s += s < 100 ? 2 : 5) { const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s; if (y <= groundAt(x, z)) { hit = new THREE.Vector3(x, groundAt(x, z), z); break; } }
  if (!hit) hit = o.clone().addScaledVector(d, s0);
  hit.y *= vzNow(); return hit;
}
// ---------- navigation: the WebGL page's gestures (index.html gMove) and nav.js (momentum, the ground limit, the pass
// below ground), on the orbit state s = { tx, tz, ty (model m), yaw, pitch, ld = ln dist }. OrbitControls stays as the
// holder of camera and target (other modules read controls.target, controls.enabled) but its own input is off: its pan
// and rotate went with the distance to the orbit target (1.5 km out after a pointer-ray zoom left the eye 10 m over the
// ground: 1.5 m of pan a pixel), its damping is by frame (a 0.13 s lag at 60 frames a second, 3.9 s at 2) and a touch did
// not stop it. Numbers before and after, the tests: skill docklands-3d-page, "Three.js port: navigation".
// One finger or the left button: turn and tilt (0.006 rad a pixel). Right button, Shift or Ctrl drag: move, the ground
// under the pointer stays under it. Two fingers: move, pinch (about the point between the fingers), twist. Wheel: zoom
// in about the point under the pointer (exp(-0.001 dy): 9.5 % of the distance a notch), out about the orbit target.
// Pixel art (index.html): drag moves, right or Shift drag turns and tilts, two fingers up or down tilt (0.003 rad a pixel).
const NV = { ROT: .006, TILT2: .003, WHEEL: .001, TAU: .35, T_END: 3.2, PMAX: 1.5695, DMIN: 10, DMAX: 16000, W: 1, PMIN_UNDER: -1.35, PUSH_MS: 600, PUSH_PX: 480, STOP: 10, UNDER_EYE: 1.5, LOOK_UP: -.2 };
const NS = { moving: false, v: null, t0: 0, t: 0, last: null, manual: false, samples: [], flings: 0, ptrs: new Map(), g: null, lift: null, hold: false, holdW: 0, push: null, cool: 0, passes: 0, pushes: 0, lastPass: null, vibrated: null, wheelT: -1e9, range: null, P: null };
Object.assign(controls, { enableRotate: false, enableZoom: false, enablePan: false, enableDamping: false, maxPolarAngle: Math.PI - 0.05 });
const clampN = THREE.MathUtils.clamp;
const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const underApi = () => LAYERS.under?.api;
const isPix = () => globalThis.__docklandsStyles?.mode === 'pixel';
const navUnder = () => { const u = underApi(); return !!u && (!!(u.gaugeOn && u.gaugeOn()) || u.cutLevel() < 250); };   // nav.js isUnder: the gauge open or a cut set
const pitchMin = () => isPix() ? .2 : navUnder() ? NV.PMIN_UNDER : -.6;
const navOff = () => !controls.enabled || !!ctx.xrFrame;   // the drone or a headset owns the camera
const followMode = () => /^(centred|heading|eye)$/.test(LAYERS.locate?.api?.state?.mode || '');
// the ground for the limit: bilinear on the 20 m DTM (build.js groundAt is the nearest cell: steps of metres at cell edges)
function groundB(x, z) {
  const T = A.terrain, fx = clampN((x - T.x0) / T.cell, 0, T.nx - 1.001), fz = clampN((z - T.z0) / T.cell, 0, T.nz - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, h = (a, b) => T.dm[b * T.nx + a] / 10;
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
}
const nvo = new THREE.Vector3(), eyeNow = () => { camera.updateMatrixWorld(); return new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld); };
function navGet() { const v = vzNow(), d = nvo.copy(camera.position).sub(controls.target), dist = Math.max(1e-6, d.length()); return { tx: controls.target.x, tz: controls.target.z, ty: controls.target.y / v, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(clampN(d.y / dist, -1, 1)), ld: Math.log(dist) }; }
function navPut(s) {
  const v = vzNow(), d = Math.exp(s.ld), ce = Math.cos(s.pitch);
  controls.target.set(s.tx, s.ty * v, s.tz); camera.position.set(s.tx + d * Math.sin(s.yaw) * ce, s.ty * v + d * Math.sin(s.pitch), s.tz + d * Math.cos(s.yaw) * ce);
  NS.own = true; try { controls.update(); } finally { NS.own = false; } draw();   // own: the update's lift leaves it to navGuard (else the lift ate every push)
}
const eyeOf = s => { const d = Math.exp(s.ld), cp = Math.cos(s.pitch); return [s.tx + d * Math.sin(s.yaw) * cp, s.ty + d * Math.sin(s.pitch) / vzNow(), s.tz + d * Math.cos(s.yaw) * cp]; };
const clr = s => { const e = eyeOf(s); return e[1] - groundB(e[0], e[2]); };

// ---------- momentum (nav.js): the release velocity from the last 80 ms of moves, s0 + v TAU (1 - e^(-t/TAU)) by time
function navStop() { NS.moving = false; NS.v = null; }
function fling(v, t) {
  if (reducedMotion() || navOff() || followMode()) return false;
  if (!isFinite(t) || Math.abs(t - performance.now()) > 1000) t = performance.now();   // an event time on another clock
  NS.v = { ...v }; NS.t0 = NS.t = t; NS.last = navGet(); NS.moving = true; NS.flings++; return true;
}
function navTick(now) {
  if (!NS.moving) return;
  const l = NS.last, c = navGet();
  if (Math.abs(c.tx - l.tx) > 1e-3 || Math.abs(c.tz - l.tz) > 1e-3 || Math.abs(angDiff(c.yaw, l.yaw)) > 1e-6 || Math.abs(c.pitch - l.pitch) > 1e-6 || Math.abs(c.ld - l.ld) > 1e-6 || Math.abs(c.ty - l.ty) > 1e-3) return navStop();   // something else moved the camera
  if (followMode() || navOff() || document.hidden) return navStop();
  const te = Math.min(now, NS.t0 + NV.T_END * 1000), dt = Math.max(0, (te - NS.t) / 1000); NS.t = te;
  if (dt > 0) {
    const e = Math.exp(-dt / NV.TAU), k = NV.TAU * (1 - e), v = NS.v;
    const s = { ...c, tx: c.tx + v.tx * k, tz: c.tz + v.tz * k, yaw: c.yaw + v.yaw * k, pitch: c.pitch + v.pitch * k, ld: c.ld + v.ld * k };
    const pm = pitchMin(); if (s.pitch < pm || s.pitch > NV.PMAX) { s.pitch = clampN(s.pitch, pm, NV.PMAX); v.pitch = 0; }
    if (s.ld < Math.log(NV.DMIN) || s.ld > Math.log(NV.DMAX)) { s.ld = clampN(s.ld, Math.log(NV.DMIN), Math.log(NV.DMAX)); v.ld = 0; }
    navPut(s); const g = navGuard(c, false); if (g.r < 1) { v.pitch *= g.r; v.ld *= g.r; } if (g.blocked) { v.pitch = 0; v.ld = 0; }
    for (const key of ['tx', 'tz', 'yaw', 'pitch', 'ld']) v[key] *= e;
    NS.last = navGet();
  }
  if (te >= NS.t0 + NV.T_END * 1000) navStop();
}
const sample = t => { if (NS.hold) return; NS.samples.push({ t, ...navGet() }); if (NS.samples.length > 40) NS.samples.shift(); };
function release(tUp) {
  const sm = NS.samples; NS.samples = [];
  if (sm.length < 2 || navOff() || followMode()) return;
  const last = sm[sm.length - 1]; if (tUp - last.t > 60) return;   // the finger stopped before it lifted: no momentum
  let a = sm.find(s => s.t >= last.t - 80); if (a === last) a = sm[sm.length - 2];
  const dt = (last.t - a.t) / 1000; if (dt < .008 || dt > .25) return;
  const d = Math.exp(last.ld), v = { tx: (last.tx - a.tx) / dt, tz: (last.tz - a.tz) / dt, yaw: angDiff(last.yaw, a.yaw) / dt, pitch: (last.pitch - a.pitch) / dt, ld: (last.ld - a.ld) / dt };
  const ps = Math.hypot(v.tx, v.tz) / d;   // slow parts get none (a careful placement stays put); fast ones are capped
  if (ps < .25) { v.tx = v.tz = 0; } else if (ps > 3) { v.tx *= 3 / ps; v.tz *= 3 / ps; }
  if (Math.abs(v.yaw) < .3) v.yaw = 0; else v.yaw = clampN(v.yaw, -5, 5);
  if (Math.abs(v.pitch) < .3) v.pitch = 0; else v.pitch = clampN(v.pitch, -2, 2);
  if (Math.abs(v.ld) < .4) v.ld = 0; else v.ld = clampN(v.ld, -3, 3);
  if (v.tx || v.tz || v.yaw || v.pitch || v.ld) fling(v, tUp);
}

// ---------- the ground limit (nav.js guard): the eye stays NV.W (1 m) above the ground or water under it; towards it every
// tilt and zoom slows over max(6 m, 2 % of the distance) and stops at 1 m. A push that goes on (0.6 s and 3 blocked
// moves, or 480 px of finger travel) clicks (vibrate 15 ms, the ring) and passes Below ground (layers/under.js: the cut at
// street level, the gauge) with the eye 1.5 m under the surface looking up; below ground the same push brings it back up.
function navGuard(s0, user, dpx = 0, t = performance.now()) {
  const res = { blocked: false, r: 1 }; if (navOff() || isPix() || HFOV) return res;
  const s1 = navGet(), under = navUnder(), c0 = clr(s0);
  let sg; if (!under) sg = 1; else if (c0 < 0) sg = -1; else return res;   // Below ground with the eye above the surface: free
  const a0 = sg * c0, a1 = sg * clr(s1), Z = Math.max(6, Math.exp(s0.ld) * .02);
  if (a1 >= a0 - 1e-9 || (a0 >= NV.W + Z && a1 >= NV.W)) { if (user) NS.push = null; return res; }   // not towards the surface, or still far from it
  const r = Math.max(.06, Math.min(1, (a0 - NV.W) / Z));
  let s = { ...s1, pitch: s0.pitch, ld: s0.ld, ty: s0.ty };   // the sideways part (pan, turn) keeps going unless it alone runs into rising ground
  if (sg * clr(s) < Math.min(NV.W, a0)) s = { ...s, tx: s0.tx, tz: s0.tz, yaw: s0.yaw };
  const at = k => ({ ...s, pitch: s0.pitch + (s1.pitch - s0.pitch) * k, ld: s0.ld + (s1.ld - s0.ld) * k, ty: s0.ty + (s1.ty - s0.ty) * k });
  let k = r;
  if (sg * clr(at(k)) < NV.W) { if (sg * clr(at(0)) < NV.W) k = 0; else { let lo = 0, hi = k; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (sg * clr(at(m)) >= NV.W) lo = m; else hi = m; } k = lo; } }
  navPut(at(k)); res.r = k; res.blocked = a1 < NV.W; res.sg = sg;
  if (user && res.blocked) navPush(sg, dpx, t);
  return res;
}
function navPush(sg, dpx, t) {
  if (t < NS.cool || !underApi()) return;   // no pass without layers/under.js (a ?layers= test page): the wall only
  // a push is one gesture: with a finger or button down the push goes on however far apart the moves are (pointer events come
  // once a frame: 0.5 to 5 s apart in software rendering); a wheel push ends after 350 ms with no notch (nav.js)
  const P = NS.push; if (!P || (!NS.ptrs.size && t - P.last > 350) || P.sg !== sg) NS.push = { t0: t, last: t, px: 0, n: 0, sg }; else P.last = t;
  NS.push.px += dpx; NS.push.n++; NS.pushes++;
  cue(sg, Math.min(1, Math.max((t - NS.push.t0) / NV.PUSH_MS, NS.push.px / NV.PUSH_PX)));
  if ((t - NS.push.t0 >= NV.PUSH_MS && NS.push.n >= 3) || NS.push.px >= NV.PUSH_PX) navPass(sg, t);
}
function navPlace(c, lim) {   // the eye at clearance c by turning the pitch towards lim; if the pitch cannot reach it, move the target
  const s = navGet(), f = p => clr({ ...s, pitch: p }) - c, f0 = f(s.pitch), fl = f(lim);
  if (Math.sign(f0) === Math.sign(fl)) { s.pitch = lim; s.ty -= fl; } else { let lo = s.pitch, hi = lim; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (Math.sign(f(m)) === Math.sign(f0)) lo = m; else hi = m; } s.pitch = hi; }
  navPut(s);
}
function navPass(sg, t = performance.now()) {
  const u = underApi(); if (!u) return false;
  NS.push = null; NS.cool = t + 900; NS.hold = true; NS.samples = []; navStop();   // no fling from the moves before the pass   // hold: the rest of this gesture does not tilt or zoom on
  if (sg > 0) {   // down: Below ground on, the model cut at street level unless a level is set
    const e = eyeOf(navGet()), g = groundB(e[0], e[2]);
    if (u.cutLevel() >= 250) u.setCut(clampN(Math.round(g) - 1, -40, 60));
    u.showGauge(true); navPlace(-NV.UNDER_EYE, NV.PMIN_UNDER);
    // nav.js stops the pitch where the eye reaches -1.5 m (often near level); here the view then turns up to NV.LOOK_UP
    // (-0.2 rad) about the eye (the target goes up in front): the owner's "snap to go upside down". Steeper (-0.5) showed
    // only sky through the cut; at -0.2 the tunnels and basements below the horizon show too
    { const s = navGet(); if (s.pitch > NV.LOOK_UP) { const v = vzNow(), d = Math.exp(s.ld), E = eyeOf(s); s.pitch = NV.LOOK_UP; s.tx = E[0] - d * Math.sin(s.yaw) * Math.cos(s.pitch); s.tz = E[2] - d * Math.cos(s.yaw) * Math.cos(s.pitch); s.ty = E[1] - d * Math.sin(s.pitch) / v; navPut(s); } }
  } else { u.showGauge(false); navPlace(NV.UNDER_EYE, NV.PMAX); }   // up: the gauge closes and takes the cut away
  NS.passes++; NS.lastPass = sg > 0 ? 'under' : 'above';
  let buzz = false; try { buzz = !!(navigator.vibrate && navigator.vibrate(15)); } catch { /* not allowed */ }
  NS.vibrated = buzz; cue(sg, 1, true); syncDig();
  dispatchEvent(new CustomEvent('docklands-nav-pass', { detail: { to: NS.lastPass, vibrated: buzz } }));
  return true;
}
// the visual click (iOS has no navigator.vibrate): a ring that fills while the push lasts and snaps when the eye passes
let cueTimer = 0, cueTT = 0;
function cue(sg, p, snap) {
  const el = $('navCue'), tx = $('navCueT'); if (!el) return;
  clearTimeout(cueTimer); el.style.setProperty('--p', p.toFixed(3)); el.classList.remove('snap');
  if (snap) { void el.offsetWidth; el.classList.add('snap'); el.classList.remove('on'); clearTimeout(cueTT);
    tx.textContent = sg > 0 ? 'Below ground. Push up to come back.' : 'Above ground'; tx.classList.add('on'); cueTT = setTimeout(() => tx.classList.remove('on'), 2200); return; }
  el.classList.add('on'); cueTimer = setTimeout(() => el.classList.remove('on'), 400);
}

// ---------- picking for the gestures: the point under a pixel. The ground by a march along the ray (cheap: every move);
// with buildings: the first building or detailed model on the ray (Raycaster: once a gesture or a wheel step)
const nray = new THREE.Raycaster(), nndc = new THREE.Vector2();
function pixRay(x, y) { camera.updateMatrixWorld(); const r = renderer.domElement.getBoundingClientRect(); nndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); nray.setFromCamera(nndc, camera); return nray.ray; }   // model metres (matrixWorld holds 1 / vz)
function groundRange(o, d, maxS = 6000, under = 0) { for (let s = .5; s <= maxS; s += s < 50 ? .5 : s < 400 ? 2 : 6) { const x = o.x + d.x * s, z = o.z + d.z * s; if (o.y + d.y * s <= groundB(x, z) - under) return s; } return null; }
function pointUnder(x, y, buildingsToo = true, under = 3) {   // { p: model point, range } or null; the zoom stop uses the ground 3 m under the surface (a kerb ahead of a low eye does not stop it)
  const R = pixRay(x, y); let s = groundRange(R.origin, R.direction, 6000, under);
  if (buildingsToo) { zr.ray.copy(R); zr.near = 0; zr.far = s ?? 6000; const bh = zr.intersectObjects([...buildings.children, ...models.children], true).find(h => U.cut.value >= 250 || h.point.y <= U.cut.value); if (bh) s = bh.distance; }
  return s == null ? null : { p: R.origin.clone().addScaledVector(R.direction, s), range: s, dir: R.direction.clone() };
}
// the orbit target to the ground under the screen centre when that is nearer than the target (the view does not change:
// the target moves along the line of sight), so a turn pivots on what is in the middle of the screen
function repivot() {
  if (isPix() || HFOV) return; const s = navGet(), d = Math.exp(s.ld); camera.updateMatrixWorld();
  const o = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld), dir = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld);
  const r = groundRange(o, dir, d * .98); if (r == null) return;
  const k = Math.max(NV.DMIN, r) * ((dir.clone().multiply(new THREE.Vector3(1, vzNow(), 1))).length());   // the same point in the orbit's (exaggerated) space
  if (k >= d) return; nvo.copy(controls.target).sub(camera.position).setLength(k); controls.target.copy(camera.position).add(nvo); controls.update();
}
// zoom about a model point P by f (the eye and the target both: P stays under the pointer); in by at most to NV.STOP of P
function zoomAbout(P, f, range) {
  const v = vzNow(), Pe = new THREE.Vector3(P.x, P.y * v, P.z);
  if (f < 1) { if (range <= NV.STOP) return; f = Math.max(f, NV.STOP / range); }
  const t1 = controls.target.clone().sub(Pe).multiplyScalar(f).add(Pe), e1 = camera.position.clone().sub(Pe).multiplyScalar(f).add(Pe);
  let d = e1.distanceTo(t1); if (d > NV.DMAX) return;
  if (d < NV.DMIN) t1.sub(e1).setLength(NV.DMIN).add(e1);   // the orbit radius stays 10 m or more: the target moves on along the line of sight
  controls.target.copy(t1); camera.position.copy(e1); NS.own = true; try { controls.update(); } finally { NS.own = false; }
}
const zoomTarget = (s, f) => { s.ld = clampN(s.ld + Math.log(f), Math.log(NV.DMIN), Math.log(NV.DMAX)); };
function panPx(dx, dy) {   // the ground under the gesture's start point stays under the finger (index.html pan, with the range to that point)
  const s = navGet(), H = renderer.domElement.clientHeight || innerHeight;
  let k = Math.exp(s.ld) * .0012, kd = 1;
  if (isPix()) k = Math.exp(s.ld) * .84 / H;   // styles.js: the orthographic half height is 0.42 x the orbit distance
  else if (NS.range) { k = NS.range.range * 2 * Math.tan(camera.fov * Math.PI / 360) / H; kd = 1 / Math.max(.3, NS.range.dep); }   // dep: sine of the ray's angle below the horizontal (ground foreshortening)
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw); s.tx -= (c * dx + sn * dy * kd) * k; s.tz -= (-sn * dx + c * dy * kd) * k; navPut(s);
}
function rangeAt(x, y) {   // for panPx: the distance to the ground or building under (x, y) and the ray's depression
  const h = pointUnder(x, y, true, 0); if (!h) return null; const dep = Math.max(0, -h.dir.y);
  return { range: Math.min(h.range, Math.exp(navGet().ld) * 3), dep };
}
const mid = () => { const v = [...NS.ptrs.values()]; return [(v[0].x + v[1].x) / 2, (v[0].y + v[1].y) / 2, Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y), Math.atan2(v[1].y - v[0].y, v[1].x - v[0].x)]; };
function gestureStart() {   // the first finger or button down, or a wheel after a pause: leave a named view and a photo lens
  navStop(); NS.hold = false; NS.samples = []; NS.push = null;
  controls.dispatchEvent({ type: 'start' }); repivot();
}
function afterMove(s0, dpx, t) {
  if (NS.hold) { navPut({ ...navGet(), pitch: s0.pitch, ld: s0.ld, ty: s0.ty }); return; }   // after a pass, this gesture does not tilt or zoom on
  navGuard(s0, true, dpx, t);
}
{ const cv = renderer.domElement;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('pointerdown', () => navStop(), true);   // any touch stops the momentum (nav.js)
  addEventListener('wheel', () => navStop(), { capture: true, passive: true });
  addEventListener('keydown', e => { if (e.key === 'Escape') navStop(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) navStop(); });
  cv.addEventListener('pointerdown', e => {
    if (navOff() || NS.ptrs.has(e.pointerId)) return;
    if (!NS.ptrs.size) gestureStart();
    NS.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, alt: e.button === 2 || e.shiftKey || e.ctrlKey });
    try { cv.setPointerCapture(e.pointerId); } catch { /* a forwarded event of a pointer that is gone */ }
    if (NS.ptrs.size === 1 && !isPix()) NS.range = rangeAt(e.clientX, e.clientY);
    if (NS.ptrs.size === 2) { NS.g = mid(); NS.P = isPix() ? null : pointUnder(NS.g[0], NS.g[1]); NS.range = NS.P ? { range: Math.min(NS.P.range, Math.exp(navGet().ld) * 3), dep: Math.max(0, -NS.P.dir.y) } : null; }
  });
  cv.addEventListener('pointermove', e => {
    const p = NS.ptrs.get(e.pointerId); if (!p || navOff()) return;
    const s0 = navGet(), dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; if (!dx && !dy) return;
    if (NS.ptrs.size === 2 && NS.g) {
      const m = mid(), g = NS.g, f = g[2] / Math.max(1, m[2]);
      if (isPix()) { const s = navGet(); zoomTarget(s, f); navPut(s); } else if (NS.P) zoomAbout(NS.P.p, f, NS.P.p.distanceTo(eyeNow())); else { const s = navGet(); zoomTarget(s, f); navPut(s); }
      const s = navGet(); s.yaw += angDiff(m[3], g[3]);   // twist: the scene turns with the fingers
      if (isPix()) { s.pitch = clampN(s.pitch + (m[1] - g[1]) * NV.TILT2, .2, NV.PMAX); navPut(s); } else { navPut(s); panPx(m[0] - g[0], m[1] - g[1]); }
      NS.g = m;
    } else if (NS.ptrs.size === 1) {
      if (p.alt !== isPix()) panPx(dx, dy);
      else { const s = navGet(); s.yaw -= dx * NV.ROT; s.pitch = clampN(s.pitch + dy * NV.ROT, pitchMin(), NV.PMAX); navPut(s); }
    } else return;
    afterMove(s0, Math.hypot(dx, dy), e.timeStamp); sample(e.timeStamp);
  });
  const end = e => { if (!NS.ptrs.delete(e.pointerId)) return; NS.g = null;
    if (NS.ptrs.size) { const q = [...NS.ptrs.values()]; if (NS.ptrs.size === 1) NS.range = rangeAt(q[0].x, q[0].y); if (e.type === 'pointerup') { NS.lift = { sm: NS.samples, t: e.timeStamp }; NS.samples = []; } return; }   // one finger of a pinch lifted: keep its motion for a moment
    if (e.type !== 'pointerup') { NS.samples = []; NS.hold = false; return; }
    if (NS.samples.length < 2 && NS.lift && e.timeStamp - NS.lift.t < 80) { NS.samples = NS.lift.sm; NS.lift = null; release(NS.samples.length ? Math.min(e.timeStamp, NS.samples[NS.samples.length - 1].t + 16) : e.timeStamp); }   // both fingers lifted together
    else { NS.lift = null; release(e.timeStamp); }
    NS.hold = false; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', e => {
    e.preventDefault(); if (navOff()) return;
    const t = e.timeStamp, dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1); if (!dy) return;
    if (t - NS.wheelT > 400 && !NS.ptrs.size) gestureStart(); NS.wheelT = t;
    const s0 = navGet();
    if (NS.hold && !NS.ptrs.size) { if (t - NS.holdW < 400) { NS.holdW = t; return; } NS.hold = false; }   // after a pass, the wheel rests until it pauses
    const f = Math.exp(dy * NV.WHEEL);
    if (f < 1 && !isPix()) { const h = pointUnder(e.clientX, e.clientY); if (h) zoomAbout(h.p, f, h.range); else { const s = navGet(); zoomTarget(s, f); navPut(s); } }
    else { const s = navGet(); zoomTarget(s, f); navPut(s); }
    navGuard(s0, true, Math.min(120, Math.abs(dy)) * .6, t); if (NS.hold) NS.holdW = t;
  }, { passive: false });
  // keys: arrows move the view (40 px a press), + and - zoom (as one wheel notch at the centre of the screen)
  addEventListener('keydown', e => {
    if (navOff() || e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof Element && e.target.closest('input,select,textarea,[role=slider]'))) return;
    const k = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key];
    if (k) { e.preventDefault(); gestureStart(); const s0 = navGet(); NS.range = rangeAt(innerWidth / 2, innerHeight / 2); panPx(k[0], k[1]); navGuard(s0, false); return; }
    if (e.key === '+' || e.key === '=' || e.key === '-') { gestureStart(); const s0 = navGet(), s = navGet(); zoomTarget(s, Math.exp((e.key === '-' ? 100 : -100) * NV.WHEEL)); navPut(s); navGuard(s0, false); }
  });
}
// the round Below ground button (index.html #digBtn; the WebGL page's Menu button of that name): the depth gauge on or off
let digKey = '';
function syncDig() { const b = $('digBtn'), u = underApi(); if (!b) return; const h = !u || isPix() || navOff(), on = !!u && navUnder(), k = h + ',' + on; if (k === digKey) return; digKey = k; b.hidden = h; b.setAttribute('aria-pressed', String(on)); }
$('digBtn')?.addEventListener('click', () => { const u = underApi(); if (!u) return; const on = navUnder(); u.showGauge(!on); if (on) { const s = navGet(); if (clr(s) < NV.W) { navPlace(NV.UNDER_EYE, NV.PMAX); } } syncDig(); });
// OrbitControls.update turns the camera to its target with no roll: put the photo's roll back at once, so labels and
// picking between frames see it. An update never leaves the eye under the ground or the water outside Below ground
// (the flash fault of 2026-10-09: an orbit after a photo view took the eye under the water)
{ const ou = controls.update.bind(controls);
  const roll = r => { if (ROLL && controls.enabled) { camera.rotateZ(ROLL * Math.PI / 180); camera.updateMatrixWorld(); } return r; };
  controls.update = function (dt) {
    const r = ou(dt), p = camera.position, lift = HFOV || !this.enabled || NS.own || navUnder() ? 0 : (groundB(p.x, p.z) + NV.W) * vzNow() - p.y;
    if (r && lift > 1e-6) { p.y += lift; camera.lookAt(this.target); camera.updateMatrixWorld(); }
    return roll(r);
  }; }
// Below ground closed another way (the gauge's cross, a view) with the eye still under the surface: put it 1.5 m above
let wasUnder = false;
function navUnderEdge() {
  const u = navUnder(); syncDig(); if (u !== wasUnder) { wasUnder = u; if (!u && controls.enabled && !HFOV && !isPix() && clr(navGet()) < 0) navPlace(NV.UNDER_EYE, NV.PMAX); }
}
let frames = 0, fpsT = performance.now(), fps = 0;
renderer.setAnimationLoop((time, xrFrame) => {
  sky.setVz(vzNow());   // the sky dome, stars and moon undo the view's y scale (1 in a headset session)
  if (ctx.xrFrame) { ctx.xrFrame(time, xrFrame, frameHooks); return; }   // layers/xr.js: a headset session (renderer.xr) or its one-eye preview draws the frame
  navTick(performance.now()); navUnderEdge();
  if (controls.update()) need = true;
  if (!need && !$('animate').checked) return; need = false;
  const d = camera.position.distanceTo(controls.target);
  const above = camera.position.y - groundAt(camera.position.x, camera.position.z) * VZ; camera.near = THREE.MathUtils.clamp(Math.min(d / 400, above / 2), 0.5, 40); camera.far = Math.max(d * 6 + 6000, 20000); camera.updateProjectionMatrix();
  if (ROLL) { camera.up.set(0, 1, 0); camera.lookAt(controls.target); camera.rotateZ(ROLL * Math.PI / 180); }   // index.html rolledUp: up = cos(roll) u - sin(roll) r, a turn of +roll about the camera's z
  camera.updateMatrixWorld(); eyeM.setFromMatrixPosition(camera.matrixWorld);   // the eye in model metres (= camera.position while VZ is 1)
  focus.copy(controls.target); focus.y /= VZ; sky.sun.position.copy(sky.sky.sunPosition.value).multiplyScalar(4000).add(focus); sky.sun.target.position.copy(focus);
  if (sky.stars) sky.stars.position.copy(eyeM);
  sky.sky.position.copy(eyeM);
  // the cut-away view: a dark backdrop until the visitor sets the clock (index.html, sky.js DocklandsSky.day = S.drive && sun > -6)
  sky.setCutDark(U.cut.value < 250 && !DRIVE);
  placeLabels();
  for (const f of frameHooks) f();
  const t0 = performance.now(); pipe.render(); const ms = performance.now() - t0;
  if (globalThis.__d3snap) { const f = globalThis.__d3snap; globalThis.__d3snap = null; try { f(renderer.domElement.toDataURL('image/png')); } catch (e) { f(null); } }   // Share > Print: the frame just drawn (the drawing buffer is cleared after it)
  frames++; const now = performance.now(); if (now - fpsT > 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }
  $('fps').textContent = `${BACKEND} · ${ms.toFixed(1)} ms to submit a frame${$('animate').checked ? ` · ${fps.toFixed(0)} fps` : ''}`;
});

// ---------- drawing styles (styles.js, ?style=map|pixel|lines|vectrex): the hook gives a style the pipeline (it sets
// pipe.outputNode in an onFrame hook), the pick ray (pixel art casts it from its orthographic camera) and the camera functions
export const styleHook = { pipe, scenePass, ray, syncPost, setCam, camState, setClock, setShadows, ctx };
import('./styles.js').then(m => m.init(styleHook)).catch(e => console.warn('styles', e));

// ---------- the menu (menu.js) and the time wheels (carousel.js)
const menu = initMenu({ setView, layers: () => LAYERS });

// ---------- start
setShadows(flag('shadows', GPU));
const H = parseHash(location.hash), c = (H.c || '').split(',').map(Number), at = /^#at=(-?[\d.]+),(-?[\d.]+)(?:,([\d.]+))?/.exec(location.hash);
if (H.t || qs.get('t')) { const t = fromLondon(H.t || qs.get('t')); if (isFinite(t)) { clock = t; DRIVE = true; } if (H.t && isFinite(t)) TSHARE = H.t; }
setClock(H.n === '1' && !H.t && !qs.get('t') ? fromLondon(londonDate(Date.now()) + 'T22:00') : clock);
if (c.length >= 6 && c.every(isFinite)) {   // nav.js restore: f=h<horizontal field> or f=<vertical field> (radians), rl=<roll degrees>, vw=<view>
  const f = H.f || '', hf = /^h[\d.]+$/.test(f) ? +f.slice(1) : NaN, vf = +f, rl = +H.rl, ok = x => x > .05 && x < 3.1;
  setCam({ tx: c[0], tz: c[1], ty: c[2], dist: c[3], yaw: c[4], pitch: c[5], hfov: ok(hf) ? hf : null, fov: !ok(hf) && f && ok(vf) ? vf : null, roll: isFinite(rl) && Math.abs(rl) < 90 ? rl : 0 });
  if (H.vw in VIEWS) { VIEWNAME = H.vw; document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === H.vw))); }
}
else if (at) setCam({ tx: +at[1], tz: +at[2], ty: 0, dist: +(at[3] || 900), yaw: .6, pitch: .6 });
else setView(qs.get('view') in VIEWS ? qs.get('view') : 'cw');
if (qs.has('vz')) setVz(qs.get('vz'));   // vertical exaggeration (layers/model.js has the slider)
if (qs.get('ground') !== 's2') setGround(qs.get('ground') || 'none');   // s2 (Satellite 2026): layers/model.js
const wheels = initCarousel({ clock: () => clock, setClock: t => setClockUser(t), now: clockNow, fromLondon, A, flag, predict, tide: () => LAYERS.tide?.api?.harmonics || null });
clockHooks.push(() => wheels.draw());
say(`${A.buildings.length.toLocaleString()} buildings · ${BACKEND}`);
sky.loadStars(DATA + 'sky/stars.json').then(draw).catch(e => console.warn('stars', e));
await loadOptional(); $('facades').checked = FACADES_ON = flag('facades', true); $('facades').disabled = !FACADE; await loadModels();
await loadLayers();
if (H.id && /^osm:[wr]\d+$/.test(H.id)) { const K = await keys(); const i = K ? K.ids.indexOf(H.id.slice(4)) : -1; if (i >= 0) selectModel(i); }
say(`${A.buildings.length.toLocaleString()} buildings · ${STATS.buildings.triangles.toLocaleString()} triangles · ${BACKEND}`);
setTimeout(() => $('hud').classList.add('fade'), 4000);
menu.creditsStart();

// test hooks (the WebGL page has window.__docklands)
globalThis.__docklands3 = { THREE, renderer, scene, camera, controls, backend: BACKEND, STATS, setView, setCam, camState, setClock, setClockUser, fromLondon, menu, wheels, get clock() { return clock; }, pickAt, selectModel, setShadows, setGround, sky, U, get night() { return NIGHT; }, ready: true, draw, shareHash, layers: LAYERS, ctx, tap, setVz, get vz() { return VZ; }, get drive() { return DRIVE; },
  nav: { state: NS, NV, get: navGet, put: navPut, guard: navGuard, pass: navPass, stop: navStop, fling, tick: navTick, release, clearance: () => clr(navGet()), isUnder: navUnder, pitchMin, groundB, syncDig } };
