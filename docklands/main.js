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
Object.assign(controls, { enableDamping: true, dampingFactor: 0.12, screenSpacePanning: false, minDistance: 10, maxDistance: 16000, maxPolarAngle: Math.PI / 2 - 0.02, zoomToCursor: true });
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
  controls.maxPolarAngle = c.pitch < 0.05 ? Math.PI - 0.05 : Math.PI / 2 - 0.02; controls.minDistance = 10;   // 10 m everywhere (the WebGL page: 80): close to a tree or a door; the near plane follows the eye's height
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
  requestAnimationFrame(step); controls.maxPolarAngle = Math.PI / 2 - 0.02;   // the photo view's limit (pi - 0.05) let a drag up take the eye under the water and the ground (white flashes on the horizon, 2026-10-09)
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
// zoom in towards the pointer (wheel, or the centre of a pinch): eye and target move together along the pointer ray, so
// the view does not turn and the point under the pointer stays under it, up to 10 m from the ground, water or sky
// point under the pointer. three.js r186 OrbitControls (zoomToCursor) stops at minDistance from the orbit target and, near
// the horizontal, turns the camera to that target: after a photo view (target 1.2 km out, eye 2 to 7 m above the water)
// the visitor could not get near anything off the centre line. Zoom out stays as three.js does it.
{ const ou = controls.update.bind(controls), dir = new THREE.Vector3();
  const roll = r => { if (ROLL && controls.enabled) { camera.rotateZ(ROLL * Math.PI / 180); camera.updateMatrixWorld(); } return r; };   // OrbitControls.update turns the camera to its target with no roll: put the photo's roll back at once, so labels and picking between frames see it
  controls.update = function (dt) {
    const sc = this._scale; if (!(this.zoomToCursor && this._performCursorZoom && sc < 1 && this.enabled)) { const r = ou(dt), p = camera.position, lift = HFOV ? 0 : (groundAt(p.x, p.z) + 1.6) * vzNow() - p.y;
      if (r && lift > 0) { p.y += lift; camera.lookAt(this.target); camera.updateMatrixWorld(); }   // an orbit never takes the eye under the ground (or under the water: the ground there is 1.5 m below it)
      return roll(r); }
    dir.copy(this._dollyDirection); this._performCursorZoom = false; this._scale = 1; ou(dt);   // rotation and pan as usual, no zoom
    const v = vzNow(), p = camera.position, m = new THREE.Vector3(dir.x, dir.y / v, dir.z), ml = m.length(); m.divideScalar(ml);   // the pointer ray in model metres
    // the stop point: where the ray is 3 m under the ground (a bank or a kerb a little above a low eye does not stop it)
    let hit = 400; for (let s = 2; s <= 5000; s += s < 100 ? 1 : 5) { const x = p.x + m.x * s, z = p.z + m.z * s; if (p.y / v + m.y * s <= groundAt(x, z) - 3) { hit = s; break; } }
    // and the first building or detailed model on the ray (the ground test alone let the zoom fly into towers; 2026-10-09)
    zr.ray.origin.set(p.x, p.y / v, p.z); zr.ray.direction.copy(m); zr.far = hit; zr.near = 0;
    const bh = zr.intersectObjects([...buildings.children, ...models.children], true).find(h => U.cut.value >= 250 || h.point.y <= U.cut.value); if (bh) hit = Math.min(hit, bh.distance);
    const k = 1 / ml;   // exaggerated length per model metre along this ray
    const step = Math.max(0, Math.min(hit * (1 - sc), hit - 10)) * k;
    if (step > 1e-4) { p.addScaledVector(dir, step); this.target.addScaledVector(dir, step);
      const lift = (groundAt(p.x, p.z) + 1.6) * v - p.y; if (lift > 0) { p.y += lift; this.target.y += lift; }   // the eye walks over a bank, 1.6 m above the ground
      camera.updateMatrixWorld(); draw(); writeHash(); }
    return roll(step > 1e-4);
  }; }
let frames = 0, fpsT = performance.now(), fps = 0;
renderer.setAnimationLoop((time, xrFrame) => {
  sky.setVz(vzNow());   // the sky dome, stars and moon undo the view's y scale (1 in a headset session)
  if (ctx.xrFrame) { ctx.xrFrame(time, xrFrame, frameHooks); return; }   // layers/xr.js: a headset session (renderer.xr) or its one-eye preview draws the frame
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
globalThis.__docklands3 = { THREE, renderer, scene, camera, controls, backend: BACKEND, STATS, setView, setCam, camState, setClock, setClockUser, fromLondon, menu, wheels, get clock() { return clock; }, pickAt, selectModel, setShadows, setGround, sky, U, get night() { return NIGHT; }, ready: true, draw, shareHash, layers: LAYERS, ctx, tap, setVz, get vz() { return VZ; }, get drive() { return DRIVE; } };
