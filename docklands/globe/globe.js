// The globe of the Three.js port (OKR O2, KR2.1 first step, KR2.2, KR2.7; https://github.com/danbri/londat/issues/7): a
// planet-shaped WGS84 world with terrain, land and sea, a graticule, coastlines, borders, regions, rivers, lakes, seas and
// places from Natural Earth, lit by the sun of the page clock; search, fly-to, a "where am I" readout, Home and North
// buttons; and a hand-over to the Docklands model (flat, in its own frame) with no jump of the camera.
//
// Frames (docs/planet-architecture.md, "Frames"): positions are WGS84 / ECEF in doubles on the CPU. The globe scene is
// drawn in a floating frame: its origin is the eye (ECEF) and its axes are east, up and south at the eye, so the camera
// sits at (0, 0, 0) and every mesh (a terrain patch, a line chunk) gets a world matrix R (C - O) computed in doubles each
// frame: the GPU sees float32 numbers no bigger than the distance to what it draws. Depth: logarithmic in each globe
// material (one frame holds 1 m to 40,000 km). The model is NOT re-projected: it stays flat in its frame (BNG metres,
// north -z, y = m above ODN), placed on the globe by the region (the ENU frame at the region origin) and the region
// adapter's fixed model-frame transform (geo/adapters/uk-os.js modelFrame; error 0.086 m in the box). Curvature over the
// box (up to 3.1 m at 6.3 km from the origin) is left out of the model, as before.
//
// Modes. "model": the existing scene and navigation (main.js); above HANDOVER.bg (3 km) eye height the globe is drawn
// into a render target and shown as the model scene's background (the model's sky dome is hidden), so the world goes on
// beyond the model's ground. "globe": this file draws and moves the camera (orbit about a target on the ground: lon, lat,
// range, heading, tilt). Hand-over: globe -> model when the orbit range is under HANDOVER.range (36 km) and the target is
// over the model box (1 km margin); model -> globe when a zoom out passes the model's limit (NV.DMAX, set to
// HANDOVER.out, 40 km) or the target leaves the box by more than 3 km. Each hand-over converts the camera exactly (eye
// and view direction through the region transform), so the picture does not jump; only the content changes, and that
// change cross-fades over 500 ms (crossFade).
// Skill: docklands-3d-page, "Three.js port: globe and world skeleton (2026-10-13)". Data: cwplans/docklands/data/world/.
import * as THREE from 'three/webgpu';
import { uniform, texture, screenUV, vec3, vec4, float, normalize, dot, max, smoothstep, pow, length, positionWorld, positionView, cameraNear, cameraFar, viewZToLogarithmicDepth } from 'three/tsl';
import { geodeticToEcef, ecefToGeodetic, enuBasis, WGS84, D2R, R2D, surfaceDistance } from '../geo/ellipsoid.js';
import { REGION } from '../geo/current.js';
import { REGIONS } from '../geo/regions/index.js';
import { makeWorld, pickLang, fmtDist, fmtLatLon, compass, linesOf, labelPoint, bearingDeg } from './world.js';
import { Terrain, terrainMaterial, makeSampler } from './terrain.js';
import { buildLines, lineMaterial, graticule, rebuildLines } from './vectors.js';
import { makeLabels } from './labels.js';

// the manifests of layer sets in the globe's contract (world.js header). The UK skeleton adds its manifest here.
export const MANIFESTS = ['../cwplans/docklands/data/world/layers.json'];
// skeleton sets (format skeleton-1, docklands/geo/skeleton.js), drawn through skeleton-layers.js
// (the world detail set first: a finer set's "where" answer, merged after it, wins; cwplans/tools/build-detail-skeleton.mjs)
export const SKELETONS = ['../cwplans/docklands/data/world-detail/', '../cwplans/docklands/data/uk/', '../cwplans/docklands/data/es-nw/', '../cwplans/docklands/data/ba/'];
export const HANDOVER = { range: 36000, out: 40000, marginM: 1000, leaveM: 3000, bg: 3000 };
const A_ = WGS84.a, MAXR = 4.2e7, MINALT = 25;
const v3 = (a = 0, b = 0, c = 0) => new THREE.Vector3(a, b, c);
const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]], addS = (p, q, s) => [p[0] + q[0] * s, p[1] + q[1] * s, p[2] + q[2] * s];
const dot3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2], len = p => Math.hypot(p[0], p[1], p[2]), nrm = p => { const l = len(p) || 1; return [p[0] / l, p[1] / l, p[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapLon = l => ((l + 540) % 360) - 180;

export async function createGlobe(H) {
  const { renderer, camera, controls, qs } = H, $ = id => document.getElementById(id);
  const G = { mode: 'model', ready: false, loading: null, stats: {}, HANDOVER, version: '1.0.0' };
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  // ---------- the model link: the region's ENU frame and the adapter's fixed model-frame transform (geo/adapters/*)
  const ad = REGION.adapters.find(a => a.modelFrame && a.module);
  let MF = null;
  if (ad) { try { const mod = await import('../' + ad.module.replace(/^docklands\//, '')); MF = mod.modelFrame(ad.modelFrame); } catch (e) { console.warn('globe: model frame', e); } }
  const ENU = REGION.enu;
  const modelToEcef = p => ENU.enuToEcef(MF.toEnu(p));          // model metres [x, y, z] -> ECEF
  const ecefToModel = P => MF.fromEnu(ENU.ecefToEnu(P));        // ECEF -> model metres [x, y, z]
  const [bw, bs, be, bn] = REGION.bbox;
  const inBox = (lon, lat, m = 0) => { const dl = m / 111320 / Math.cos(lat * D2R), db = m / 110574; return lon >= bw - dl && lon <= be + dl && lat >= bs - db && lat <= bn + db; };

  // ---------- the scene, camera, uniforms
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000); G.scene = scene;   // (G.scene: tests count its buffers, docklands/test/heap-holders.mjs)
  const gcam = new THREE.PerspectiveCamera(camera.fov, camera.aspect, 1, 1e8); gcam.matrixAutoUpdate = false;
  const U = { exag: uniform(clamp(+(qs.get('gx') || 1), 1, 50)), relief: uniform(5), haze: uniform(0.9), sun: uniform(v3(1, 0, 0)), W: 4096, H: 2048 };
  const exag = U.exag.value;
  let world = null, sampler = null, terrain = null, layers = [], labels = null, atmo = null, rt = null, bgOn = false, earthC = uniform(v3());

  // ---------- frame state: O (eye ECEF), R (rows: east, up, -north at the eye)
  const F = { O: [A_, 0, 0], R: [[0, 1, 0], [0, 0, 1], [1, 0, 0]], eyeGeo: { lon: 0, lat: 0, h: 0 } };
  function setFrame(O) {
    F.O = O; const g = ecefToGeodetic(...O), b = enuBasis(g.lon, g.lat); F.eyeGeo = g;
    F.R = [b.east, b.up, [-b.north[0], -b.north[1], -b.north[2]]];
  }
  const toF = P => { const d = sub(P, F.O), R = F.R; return [dot3(R[0], d), dot3(R[1], d), dot3(R[2], d)]; };
  const dirToF = d => [dot3(F.R[0], d), dot3(F.R[1], d), dot3(F.R[2], d)];
  const dirFromF = d => { const R = F.R; return [R[0][0] * d[0] + R[1][0] * d[1] + R[2][0] * d[2], R[0][1] * d[0] + R[1][1] * d[1] + R[2][1] * d[2], R[0][2] * d[0] + R[1][2] * d[1] + R[2][2] * d[2]]; };
  function place(mesh) { const t = toF(mesh.userData.C), R = F.R; mesh.matrixWorld.set(R[0][0], R[0][1], R[0][2], t[0], R[1][0], R[1][1], R[1][2], t[1], R[2][0], R[2][1], R[2][2], t[2], 0, 0, 0, 1); }
  // the camera: eye O, forward f, up u (ECEF unit vectors)
  const mtmp = new THREE.Matrix4();
  function setCamera(O, f, u) {
    setFrame(O); const f3 = dirToF(f), u3 = dirToF(u);
    mtmp.lookAt(v3(0, 0, 0), v3(...f3), v3(...u3)); gcam.matrixWorld.copy(mtmp); gcam.matrixWorldInverse.copy(mtmp).invert();
    gcam.fov = camera.fov; gcam.aspect = camera.aspect;
    const g = F.eyeGeo, Rs = len(geodeticToEcef(g.lon, g.lat, 0)), ground = sampler ? sampler.ell(g.lon, g.lat) : 0, altT = Math.max(0.5, g.h - ground);
    gcam.near = clamp(altT * 0.3, 0.3, 2e6); gcam.far = Math.sqrt(Math.max(0, len(O) ** 2 - Rs * Rs)) + 3e6 + altT; gcam.updateProjectionMatrix();
    G.horizon = Math.acos(clamp(Rs / Math.max(Rs + 1, len(O)), -1, 1)); G.altT = altT;
    earthC.value.set(...toF([0, 0, 0]));
  }
  const projV = new THREE.Vector3();
  function project(P) { const p = toF(P); projV.set(p[0], p[1], p[2]).applyMatrix4(gcam.matrixWorldInverse); if (projV.z > -gcam.near) return null; projV.applyMatrix4(gcam.projectionMatrix);
    if (projV.x < -1.2 || projV.x > 1.2 || projV.y < -1.2 || projV.y > 1.2) return null; return [(projV.x + 1) / 2 * innerWidth, (1 - projV.y) / 2 * innerHeight]; }
  const frustum = new THREE.Frustum(), fm = new THREE.Matrix4(), sph = new THREE.Sphere();
  const inFrustum = (C, r) => { sph.center.set(...toF(C)); sph.radius = r; return frustum.intersectsSphere(sph); };
  // the ray under a screen point (CSS px), in ECEF; and where it meets the ground (an ellipsoid at height h, then the terrain)
  function rayAt(x, y) { projV.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1, 0.5).applyMatrix4(gcam.projectionMatrixInverse).applyMatrix4(gcam.matrixWorld).normalize(); return { o: F.O, d: dirFromF([projV.x, projV.y, projV.z]) }; }
  function hitEllipsoid(o, d, h = 0) {   // the first hit of the ray with the ellipsoid raised by h (a scaled-sphere solve)
    const a = A_ + h, b = A_ * (1 - WGS84.f) + h, ox = o[0] / a, oy = o[1] / a, oz = o[2] / b, dx = d[0] / a, dy = d[1] / a, dz = d[2] / b;
    const A2 = dx * dx + dy * dy + dz * dz, B2 = 2 * (ox * dx + oy * dy + oz * dz), C2 = ox * ox + oy * oy + oz * oz - 1, D = B2 * B2 - 4 * A2 * C2;
    if (D < 0) return null; const t = (-B2 - Math.sqrt(D)) / (2 * A2); return t > 0 ? t : null;
  }
  function groundHit(o, d) {
    let h = 0, t = hitEllipsoid(o, d, 0); if (t == null) return null;
    for (let k = 0; k < 3 && sampler; k++) { const g = ecefToGeodetic(...addS(o, d, t)); h = sampler.ell(g.lon, g.lat); const t2 = hitEllipsoid(o, d, h); if (t2 == null) break; t = t2; }
    const P = addS(o, d, t), g = ecefToGeodetic(...P); return { P, t, lon: g.lon, lat: g.lat, h: g.h };
  }
  // (the camera brought up to date with the orbit first: an API call or a gesture can come before the next frame)
  const syncCam = () => { if (G.mode === 'globe') { const c = orbitCam(orbit); setCamera(c.eye, c.f, c.u); } };
  const pick = (x, y) => { syncCam(); const r = rayAt(x, y); return groundHit(r.o, r.d); };

  // ---------- the orbit (globe navigation state): target lon, lat, h (on the ground), range (m), heading (rad, true, of the
  // view direction), tilt (rad from straight down)
  let orbit = { lon: REGION.origin.lon, lat: REGION.origin.lat, h: 0, range: 1.2e7, heading: 0, tilt: 0 };
  function orbitCam(o) {
    const T = geodeticToEcef(o.lon, o.lat, o.h), b = enuBasis(o.lon, o.lat), ch = Math.cos(o.heading), sh = Math.sin(o.heading), ct = Math.cos(o.tilt), st = Math.sin(o.tilt);
    const hz = [b.north[0] * ch + b.east[0] * sh, b.north[1] * ch + b.east[1] * sh, b.north[2] * ch + b.east[2] * sh];
    const d = [-b.up[0] * ct + hz[0] * st, -b.up[1] * ct + hz[1] * st, -b.up[2] * ct + hz[2] * st];
    const u = [b.up[0] * st + hz[0] * ct, b.up[1] * st + hz[1] * ct, b.up[2] * st + hz[2] * ct];
    return { T, eye: addS(T, d, -o.range), f: d, u };
  }
  // an orbit from an eye and a target (ECEF): exact (orbitCam of the result gives the same eye)
  function orbitFrom(eye, T) {
    const g = ecefToGeodetic(...T), b = enuBasis(g.lon, g.lat), r = len(sub(T, eye)), d = nrm(sub(T, eye));
    return { lon: g.lon, lat: g.lat, h: g.h, range: r, tilt: Math.acos(clamp(-dot3(d, b.up), -1, 1)), heading: Math.atan2(dot3(d, b.east), dot3(d, b.north)) };
  }
  const maxTilt = r => clamp(80 - 22 * Math.log10(Math.max(1, r / 2e5)), 15, 80) * D2R;
  // keep the eye above the ground: lengthen the range until it is MINALT m up (or keep the target lower)
  function guard(o) {
    o.lat = clamp(o.lat, -89.9, 89.9); o.lon = wrapLon(o.lon); o.range = clamp(o.range, 30, MAXR); o.tilt = clamp(o.tilt, 0, maxTilt(o.range));
    if (sampler) o.h = sampler.ell(o.lon, o.lat);
    for (let k = 0; k < 8 && sampler; k++) { const c = orbitCam(o), g = ecefToGeodetic(...c.eye), gr = sampler.ell(g.lon, g.lat); if (g.h - gr >= MINALT) break; o.range *= 1.25; }
    return o;
  }

  // ---------- model camera <-> orbit (exact through the region transform)
  function modelCamToOrbit(c) {   // c: camState-like { tx, ty, tz, dist, yaw, pitch } in model metres
    const cp = Math.cos(c.pitch), e = [c.tx + c.dist * Math.sin(c.yaw) * cp, c.ty + c.dist * Math.sin(c.pitch), c.tz + c.dist * Math.cos(c.yaw) * cp];
    return orbitFrom(modelToEcef(e), modelToEcef([c.tx, c.ty, c.tz]));
  }
  function orbitToModel(o, first = G.mode !== 'model') {   // sets the model camera to the orbit's eye and view direction; the model target is the ground on the view ray
    const c = orbitCam(o), E = ecefToModel(c.eye), T = ecefToModel(c.T), d = nrm(sub(T, E));
    let s = len(sub(T, E));
    if (H.groundB) for (let k = 1; k < 45000; k += k < 100 ? 1 : k < 2000 ? 5 : 25) { const x = E[0] + d[0] * k, z = E[2] + d[2] * k; if (E[1] + d[1] * k <= H.groundB(x, z)) { s = k; break; } }
    s = Math.min(s, HANDOVER.out - 500);
    const t = addS(E, d, s);
    const c2 = { tx: t[0], ty: t[1], tz: t[2], dist: s, yaw: Math.atan2(-d[0], -d[2]), pitch: Math.asin(clamp(-d[1], -1, 1)) };
    // the first time: setCam (it resets the lens and the limits); then the navigation's own put (no resize each frame)
    if (first) H.setCam({ ...c2, hfov: null, fov: null, roll: 0 }); else H.navPut({ tx: c2.tx, ty: c2.ty, tz: c2.tz, yaw: c2.yaw, pitch: c2.pitch, ld: Math.log(c2.dist) });
  }
  const modelOrbit = () => modelCamToOrbit(H.camState());
  const canModel = o => !!MF && o.range < HANDOVER.range && inBox(o.lon, o.lat, HANDOVER.marginM) && !H.blocked();

  // ---------- modes
  const ui = {}; let freeT = 0;
  function setMode(m, o) {   // o: the orbit of the hand-over (the camera of the cross-fade's last globe frame)
    if (G.mode === m) return; crossFade(G.mode, o); G.mode = m; const on = m === 'globe';
    clearTimeout(freeT); if (on) freeT = setTimeout(freeModel, 3000); else reupStart();
    document.body.classList.toggle('globeMode', on);
    controls.enabled = !on; if (ui.btns) ui.btns.hidden = !on;
    if (!on) { if (labels) labels.update({ visible: false, project, eye: F.O, zoom: 0, W: innerWidth, H: innerHeight }); }
    dispatchEvent(new CustomEvent('docklands-globe-mode', { detail: { mode: m } }));
    syncUrl(true);
    G.dirty = true; H.draw();
  }
  // memory: 3 s after the globe takes the view, the model scene's large meshes give back their GPU buffers (the CPU copies
  // stay; three.js uploads them again when the model is drawn next). Owner, 2026-10-14: "As we move out can we reduce
  // level of detail in memory for Canary Wharf?" (an iPhone tab restarted after Home, probably from memory). ?free=0 off.
  function freeModel() {
    if (G.mode !== 'globe' || qs.get('free') === '0' || !H.scene) return; let n = 0, v = 0;
    H.scene.traverse(o => { const g = o.isMesh || o.isLine || o.isPoints ? o.geometry : null; const c = g?.attributes?.position?.count || 0;
      if (c > 20000 && !g.userData.freed) { g.dispose(); g.userData.freed = true; n++; v += c; } });
    G.freed = { meshes: n, vertices: v, at: Date.now() };
  }
  function enterGlobe(o) { orbit = guard(onGround({ ...o })); setMode('globe'); }
  // the eye and the view ray kept, the target moved along the ray onto the globe's ground (guard puts the target at the
  // globe's ground height, 9.8 km cells: from the model's ground that moved the eye 34 m at the zoom-out hand-over)
  function onGround(o) {
    if (!sampler) return o; const c = orbitCam(o), E = c.eye, d = c.f, f = s => { const g = ecefToGeodetic(...addS(E, d, s)); return g.h - sampler.ell(g.lon, g.lat); };
    let lo = o.range * 0.5, hi = o.range * 2; if (!(f(lo) > 0 && f(hi) < 0)) return o;
    for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
    return orbitFrom(E, addS(E, d, (lo + hi) / 2));
  }
  function enterModel(o) { orbitToModel(o, true); setMode('model', o); }
  // apply an orbit in whichever mode suits it (flights)
  function applyOrbit(o) { o = guard(o); if (canModel(o)) { const first = G.mode !== 'model'; if (first) setMode('model', o); orbitToModel(o, first); orbit = o; } else { orbit = o; if (G.mode !== 'globe') setMode('globe'); } G.dirty = true; }

  // ---------- the hand-over cross-fade (owner, 2026-10-14: "zooming out there is an overly abrupt switch to planetary
  // geography - can we make that smoother?"). At each hand-over the old mode draws its last frame once more (the same
  // camera: the hand-over converts it exactly), a 2D canvas over the 3D canvas takes a copy (CSS pixels, at most 1.3 MB
  // on a phone; freed after), and it fades out over the new mode in FADE_MS. The copy is taken in the same task as the
  // draw (a WebGL or WebGPU canvas keeps its picture until the task ends). None with prefers-reduced-motion, during the
  // boot screen or with ?fade=0. State for tests: G.fade { from, at, ms, anim }.
  const FADE_MS = 500; let fadeCv = null;
  function crossFade(from, o) {
    const boot = $('boot'); if (reduced() || qs.get('fade') === '0' || !G.ready || !MF || (boot && !boot.hidden && !boot.classList.contains('done'))) return;
    try {
      if (from === 'globe') { const c = orbitCam(o || orbit); drawGlobe(c.eye, c.f, c.u, null); }
      else if (!H.renderModel || !H.renderModel()) return;   // (no model frame drawn yet)
      const src = renderer.domElement, w = Math.max(2, Math.round(innerWidth)), h = Math.max(2, Math.round(innerHeight));
      if (!fadeCv) { fadeCv = document.createElement('canvas'); fadeCv.id = 'handoverFade'; fadeCv.setAttribute('aria-hidden', 'true'); fadeCv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;opacity:0'; src.parentNode.insertBefore(fadeCv, src.nextSibling); }
      if (G.fade && G.fade.anim) G.fade.anim.cancel();
      fadeCv.width = w; fadeCv.height = h; fadeCv.getContext('2d').drawImage(src, 0, 0, w, h);
      const anim = fadeCv.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-in-out' });
      anim.onfinish = () => { if (G.fade && G.fade.anim === anim) { fadeCv.width = fadeCv.height = 1; G.fade.anim = null; } };   // (the copy's memory back)
      G.fade = { from, at: performance.now(), ms: FADE_MS, anim };
    } catch (e) { console.warn('globe: cross-fade', e); }
  }

  // ---------- memory at the return to the model (owner, 2026-10-14: Home from orbit "started to zoom in then said it was
  // starting 3D mode ... almost like the rendering crashed and rebooted": iOS ended the tab). freeModel gave back the
  // model's large buffers; they used to come back all in the first model frame (153 MB more GPU memory in one frame,
  // measured at 390 x 844 @2, docklands/test/lod-memory.mjs). Now: the first model frame draws none of them, then every
  // second frame brings back REUP vertices (hidden meanwhile by layers.mask = 0, so nothing else changes their state), and
  // on a frame that uploads the globe behind the model is not drawn again (its target keeps the last picture).
  const REUP = 600000; let reup = [], reupN = 0;
  function reupStart() {
    reup = []; reupN = 0; if (!H.scene) return;
    H.scene.traverse(x => { if (x.geometry?.userData?.freed) { if (x.userData.reupMask == null) x.userData.reupMask = x.layers.mask; x.layers.mask = 0; reup.push(x); } });
    G.reup = reup.length ? { meshes: reup.length, frames: 0, done: false } : null;
  }
  function stepReup() {   // -> the vertices brought back in this frame
    if (!reup.length) return 0; reupN++; G.reup.frames = reupN; if (reupN % 2) return 0;   // frames 1, 3, 5: the globe behind; 2, 4, 6: uploads
    let v = 0; while (reup.length && v < REUP) { const x = reup.shift(), g = x.geometry; x.layers.mask = x.userData.reupMask ?? 1; delete x.userData.reupMask; if (g) { g.userData.freed = false; v += g.attributes.position?.count || 0; } }   // (arrays given up by main.js cpu-copies.js come back as three.js makes the buffers)
    if (!reup.length) G.reup.done = true; H.draw(); return v;
  }

  // the globe rests while the model holds the view near the ground (no globe behind it) for REST_MS: the patches not drawn
  // in the last frame are dropped, the other globe buffers, its terrain and geoid textures (about 45 MB with mipmaps) and
  // the background target are given back, and the label elements are removed. The CPU copies stay: three.js uploads them
  // again at the next globe draw. ?free=0 turns this and freeModel off. State: G.rested, G.rests.
  const REST_MS = 8000; let lowSince = 0;
  function restGlobe() {
    if (qs.get('free') === '0' || !G.ready || G.rested) return; let n = 0, v = 0, dropped = 0;
    for (const nd of terrain.cache.values()) if (nd.mesh && nd.used < terrain.frame) { scene.remove(nd.mesh); nd.mesh.geometry.dispose(); nd.mesh = null; dropped++; }
    scene.traverse(x => { const g = x.isMesh || x.isLine || x.isPoints ? x.geometry : null; if (g) { g.dispose(); n++; v += g.attributes.position?.count || 0; } });
    for (const t of G.textures || []) t.dispose();
    if (G.baseRest) G.baseRest();   // the base imagery tiles (globe/base-tiles.js)
    if (rt) { if (bgOn) setBg(false); rt.dispose(); rt = null; G.bgNode = null; }
    if (labels) for (const c of labels.candidates) if (c.el) { c.el.remove(); c.el = null; }
    G.rested = { meshes: n, vertices: v, patchesDropped: dropped, at: Date.now() }; G.rests = (G.rests || 0) + 1;
  }

  // ---------- data: manifests at once (small); textures, layers and labels on the first need (ensure)
  const fetchJson = async u => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
  const lang = qs.get('lang') || pickLang(navigator.languages || [navigator.language], ['ar', 'bn', 'de', 'el', 'en', 'es', 'fa', 'fr', 'he', 'hi', 'hu', 'id', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'ru', 'sv', 'tr', 'uk', 'ur', 'vi', 'zh', 'zht']);
  world = makeWorld({ fetchJson, lang });
  const manifestsP = Promise.all(MANIFESTS.map(u => world.addManifest(new URL(u, location.href).href).catch(e => { console.warn('globe: manifest', u, e); return null; })));
  // the regions of the project (region configs) are places in the gazetteer: the model's region first
  world.addGazetteer(Object.values(REGIONS).map(r => ({ name: r.name, names: [r.id, r.name.split(',').pop()], kind: r.id === REGION.id ? 'model' : 'region-config', prio: r.id === REGION.id ? 0 : 0.5, lon: r.origin.lon, lat: r.origin.lat, rank: 1e9, id: 'region:' + r.id,
    view: r.id === REGION.id ? 'cw' : null, alt_m: r.id === REGION.id ? null : 2500, facts: [{ label: 'Project place', value: `region config ${r.id} (time zone ${r.timeZone}, locale ${r.locale})`, source: 'docklands/geo/regions/' + r.id + '.js' }] })));
  let gazP = null;
  let skP = null;
  G.skeletons = () => skP || (skP = import('./skeleton-layers.js').then(m => Promise.all(SKELETONS.map(b => m.addSkeleton(G, new URL(b, location.href).href).catch(e => { console.warn('globe: skeleton', b, e); return null; })))));
  G.gazetteer = () => gazP || (gazP = Promise.all([manifestsP.then(() => world.loadAll(l => !!l.gazetteer || !!l.lookup || l.nearest)), G.skeletons()]).then(() => true));

  async function loadImage(url) { const tl = new THREE.TextureLoader(); const t = await tl.loadAsync(url); return t; }
  function pixels(img, w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(img, 0, 0, w, h); return { w, h, d: c.getImageData(0, 0, w, h).data }; }
  G.ensure = () => G.loading || (G.loading = (async () => {
    const t0 = performance.now(); await manifestsP; const M = world.manifests.find(m => m && m.terrain);
    if (!M) throw new Error('no terrain in the manifests');
    const base = M.base, [tex, gtex] = await Promise.all([loadImage(new URL(M.terrain.url, base).href), loadImage(new URL(M.terrain.geoid.url, base).href)]);
    for (const t of [tex, gtex]) { t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; }
    tex.wrapS = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4;
    gtex.minFilter = gtex.magFilter = THREE.LinearFilter; gtex.generateMipmaps = false;
    U.W = M.terrain.width; U.H = M.terrain.height;
    sampler = makeSampler(pixels(tex.image, 2048, 1024), pixels(gtex.image, 361, 181)); G.textures = [tex, gtex];
    terrain = new Terrain(scene, terrainMaterial(tex, gtex, U), U);
    // the world base tiles (imagery, and heights round the testbeds), loaded by view as the patches ask (globe/base-tiles.js)
    if (qs.get('base') !== '0') G.baseP = import('./base-tiles.js').then(m => m.attachBase(G, { terrain, sampler, U, tex, gtex, terrainMaterial })).catch(e => { console.warn('globe: base tiles', e); return null; });
    atmo = atmosphere(); scene.add(atmo);
    labels = makeLabels(ui.labels);
    await G.gazetteer();
    const heightAt = (lon, lat) => sampler.h(lon, lat) * exag + sampler.geoid(lon, lat);
    // graticules (made here, not data): 10 degrees always, 1 degree below 1,500 km
    addLineLayer({ key: 'graticule', label: 'Graticule (10°)', style: { color: '#8fa3b8', opacity: 0.35 } }, graticule(10), heightAt, 'globe');
    addLineLayer({ key: 'graticule1', label: 'Graticule (1°, close up)', style: { color: '#8fa3b8', opacity: 0.22, maxAlt: 1.5e6 } }, graticule(1), heightAt, 'globe');
    G.heightAt = heightAt;
    for (const L of world.layerList()) await buildLayer(L.key);
    for (const it of world.gaz.filter(e => !e.L && e.kind !== 'river')) { const P = geodeticToEcef(it.lon, it.lat, heightAt(it.lon, it.lat) + 30);
      labels.add({ id: it.id, text: it.name, cls: 'model', P, up: enuBasis(it.lon, it.lat).up, minZ: 4.5, rank: 0, ref: { entry: it } }); }
    layerUi();
    G.ready = true; G.stats.loadMs = Math.round(performance.now() - t0); G.dirty = true; H.draw();
    dispatchEvent(new CustomEvent('docklands-globe-ready', { detail: { ms: G.stats.loadMs } }));
    return true;
  })().catch(e => { console.warn('globe: load', e); G.loading = null; throw e; }));

  // one layer of the world (a manifest's or one added by addLayer): its lines and its labels
  const built = new Set();
  async function buildLayer(key) {
    if (built.has(key)) return; built.add(key);
    await world.loadLayer(key); const L = world.layers.get(key), heightAt = G.heightAt;
    if ((L.kind === 'lines' || L.kind === 'polygons') && L.draw !== false) addLineLayer({ key, label: L.label, style: L.style || {} }, L.features.flatMap(f => linesOf(f.geometry)), heightAt, L.manifest.id);
    if (L.labels) addLabels(L, heightAt);
    if (L.kind === 'points' && !L.labels && L.label) addLabels(Object.assign(L, { labels: { text: 'name', class: 'extra' } }), heightAt);
  }
  function addLineLayer(spec, lines, heightAt, set) {
    const mat = lineMaterial(spec.style.color || '#ffffff', spec.style.opacity ?? 0.8), meshes = buildLines(lines, heightAt, mat, spec.style.lift || 0);
    for (const m of meshes) { m.visible = false; scene.add(m); }
    const on = qs.has('g.' + spec.key) ? !/^(0|false|off)$/.test(qs.get('g.' + spec.key)) : spec.style.on !== false;
    const lay = { key: spec.key, label: spec.label, meshes, style: spec.style, on, set, segments: meshes.reduce((s, m) => s + m.userData.segments, 0) };
    layers.push(lay); return lay;
  }
  function addLabels(L, heightAt) {
    const s = L.labels, at = (f, p) => s.at ? [p[s.at[0]], p[s.at[1]]] : f.geometry.type === 'Point' ? f.geometry.coordinates : labelPoint(f.geometry);
    const num = (v, p) => v == null ? null : typeof v === 'number' ? v : +p[v];
    L.features.forEach((f, i) => { const p = f.properties, xy = at(f, p), text = world.nameOf(L, i, f); if (!xy || !text || !isFinite(xy[0])) return;
      const P = geodeticToEcef(xy[0], xy[1], heightAt(xy[0], xy[1]) + 30), mz = num(s.minZoom, p);
      labels.add({ id: L.id + i, text, cls: s.class || L.id, P, up: enuBasis(xy[0], xy[1]).up, minZ: mz == null || !isFinite(mz) ? null : mz + (s.zoomAdd || 0), maxZ: num(s.maxZoom, p) || null, rank: +p[s.rank] || 0, pop: +p.pop || 0,
        title: world.localName(L, i, f) !== text ? world.localName(L, i, f) : undefined, ref: { L, i } }); });
  }

  // ---------- the atmosphere: a shell 100 km up, drawn from inside (back faces), glow by how close the view ray passes the earth
  function atmosphere() {
    const Rsh = A_ + 100000, g = new THREE.SphereGeometry(Rsh, 128, 64); g.rotateX(Math.PI / 2);   // poles on ECEF z
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const v = normalize(positionWorld), t = dot(earthC, v).max(0), cl = v.mul(t).sub(earthC), d = length(cl);
    const glow = pow(smoothstep(float(Rsh), float(A_ - 15000), d), 1.6);
    const sunK = smoothstep(-0.25, 0.35, dot(normalize(cl), U.sun));
    m.colorNode = vec4(vec3(0.30, 0.55, 1.0).mul(glow).mul(sunK.mul(0.92).add(0.04)).mul(0.9), 1);
    m.depthNode = viewZToLogarithmicDepth(positionView.z, cameraNear, cameraFar);
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false; mesh.userData.C = [0, 0, 0]; mesh.renderOrder = 3;
    return mesh;
  }

  // ---------- the sun of the page clock (Astronomy Engine): the subsolar point -> a unit vector (ECEF)
  let sunT = NaN, sunE = [1, 0, 0];
  function sunEcef() {
    const t = H.clock(); if (t === sunT) return sunE; sunT = t; const AE = globalThis.Astronomy; if (!AE) return sunE;
    try { const d = new Date(t), eq = AE.Equator('Sun', d, new AE.Observer(0, 0, 0), true, true), gst = AE.SiderealTime(d), lon = (eq.ra - gst) * 15 * D2R, lat = eq.dec * D2R;
      sunE = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]; G.subsolar = { lon: wrapLon(lon * R2D), lat: lat * R2D }; } catch (e) { console.warn('globe: sun', e); }
    return sunE;
  }

  // ---------- draw the globe scene for a camera (eye, f, u in ECEF); target null = the screen (else a render target)
  let lastLab = 0, lastWhere = 0;
  function drawGlobe(eye, f, u, target = null) {
    G.rested = null; setCamera(eye, f, u);
    fm.multiplyMatrices(gcam.projectionMatrix, gcam.matrixWorldInverse); frustum.setFromProjectionMatrix(fm, gcam.coordinateSystem);
    const s = sunEcef(); U.sun.value.set(...dirToF(s));
    // terrain patches
    const K = innerHeight / (2 * Math.tan(gcam.fov * D2R / 2)), sel = terrain.select(eye, { inFrustum, K, horizon: G.horizon });
    const want = new Set(sel.map(n => n.k));
    for (const nd of terrain.cache.values()) if (nd.mesh) { const on = want.has(nd.k); if (on) { if (!nd.mesh.parent) scene.add(nd.mesh); place(nd.mesh); } nd.mesh.visible = on; }
    for (const nd of sel) { const m = terrain.mesh(nd); if (!m.parent) scene.add(m); place(m); m.visible = true; }
    // lines by eye altitude
    const alt = F.eyeGeo.h;
    // (line chunks outside the view frustum are not drawn: fewer draw calls; a chunk's radius is in geometry.userData.r)
    const seen = m => { const r = m.geometry.userData.r; return !r || inFrustum(m.userData.C, r); };
    for (const L of layers) { const vis = L.on && alt >= (L.style.minAlt || 0) && alt <= (L.style.maxAlt || Infinity); for (const m of L.meshes) { m.visible = vis && seen(m); if (m.visible) place(m); } }
    for (const L of cellLayers) for (const c of L.cells.values()) for (const m of c.meshes) { if (m.userData.on === undefined) m.userData.on = m.visible; if (m.userData.on) { m.visible = seen(m); if (m.visible) place(m); } else m.visible = false; }
    place(atmo); atmo.visible = alt > 2000;
    if (G.onFrame) G.onFrame(eye);   // places as 3D Tiles (globe/places.js): load, free, place the tiles, cut the hole
    // background: black space, sky blue near the ground by day
    const dayK = clamp((dot3(ecefNormalAt(F.eyeGeo), s) + 0.1) / 0.3, 0, 1), skyK = clamp(1 - Math.log10(Math.max(1, alt / 1000)) / 1.9, 0, 1) * dayK;
    scene.background.setRGB(0.18 * skyK, 0.36 * skyK, 0.72 * skyK);
    renderer.setRenderTarget(target); const t0 = performance.now(); renderer.render(scene, gcam); const ms = performance.now() - t0; renderer.setRenderTarget(null);
    const info = renderer.info.render; G.stats.frame = { patches: sel.length, triangles: info.triangles, calls: info.drawCalls ?? info.calls, ms: Math.round(ms * 10) / 10 };
    return ms;
  }
  const ecefNormalAt = g => enuBasis(g.lon, g.lat).up;
  // the view's zoom in web-map terms (256 px tiles, 156,543 m a pixel at zoom 0 on the equator) at the target
  function viewZoom() { const mpp = 2 * orbit.range * Math.tan(gcam.fov * D2R / 2) / innerHeight; return Math.log2(156543.03 * Math.cos(orbit.lat * D2R) / Math.max(1e-3, mpp)); }

  // ---------- flights: target along the great circle, range up and down in log space, heading and tilt eased
  let flight = null;
  function flyTo(o1, opt = {}) {
    if (!G.ready) { G.ensure().then(() => flyTo(o1, opt)).catch(() => {}); return; }
    const o0 = G.mode === 'globe' ? { ...orbit } : modelOrbit();
    o1 = { ...o0, heading: 0, tilt: 0, ...o1 }; if (sampler) o1.h = sampler.ell(o1.lon, o1.lat);
    if (!o1.view && !opt.view && !inBox(o1.lon, o1.lat, HANDOVER.marginM) && !G.detailAt?.(o1.lon, o1.lat)) o1.range = Math.max(o1.range, floorAt(o1.lon, o1.lat) / Math.max(0.1, Math.cos(o1.tilt)));   // the floor away from the model (G.goTo)
    const dist = surfaceDistance(o0.lon, o0.lat, o1.lon, o1.lat), peak = Math.min(MAXR * 0.5, Math.max(o0.range, o1.range, dist * 1.1));
    const ms = opt.ms ?? (reduced() || opt.instant ? 0 : clamp(1200 + 900 * Math.log10(1 + dist / 20000), 1200, 5500));
    flight = { o0, o1, peak, t0: performance.now(), ms, view: opt.view || null, done: opt.done || null, card: opt.card || null };
    if (!ms) stepFlight(performance.now() + 1);
    H.draw();
  }
  function slerpLL(a, b, t) {
    // on the ellipsoid normals (geodetic up vectors), so the latitude that comes back is geodetic (a slerp of ECEF positions
    // gives geocentric latitude: 0.19 degree south at London, the first version's fault)
    const u = enuBasis(a.lon, a.lat).up, v = enuBasis(b.lon, b.lat).up, om = Math.acos(clamp(dot3(u, v), -1, 1));
    if (om < 1e-9) return { lon: b.lon, lat: b.lat };
    const s0 = Math.sin((1 - t) * om) / Math.sin(om), s1 = Math.sin(t * om) / Math.sin(om), w = [u[0] * s0 + v[0] * s1, u[1] * s0 + v[1] * s1, u[2] * s0 + v[2] * s1];
    return { lon: Math.atan2(w[1], w[0]) * R2D, lat: Math.atan2(w[2], Math.hypot(w[0], w[1])) * R2D };
  }
  function stepFlight(now) {
    const F0 = flight; if (!F0) return;
    const t = F0.ms ? clamp((now - F0.t0) / F0.ms, 0, 1) : 1, e = t * t * (3 - 2 * t), { o0, o1 } = F0;
    const ll = slerpLL(o0, o1, e), lr0 = Math.log(o0.range), lr1 = Math.log(o1.range), bump = Math.max(0, Math.log(F0.peak) - Math.max(lr0, lr1));
    let dh = o1.heading - o0.heading; dh = ((dh + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const o = { lon: ll.lon, lat: ll.lat, h: 0, range: Math.exp(lr0 + (lr1 - lr0) * e + bump * 4 * e * (1 - e)), heading: o0.heading + dh * e, tilt: o0.tilt + (o1.tilt - o0.tilt) * e };
    if (t >= 1) { flight = null; if (F0.view && H.VIEWS[F0.view] && canModel(o1)) { if (G.mode !== 'model') setMode('model'); H.setView(F0.view); } else applyOrbit({ ...o1 }); if (F0.card) showEntry(F0.card); if (F0.done) F0.done(); return; }
    applyOrbit(o);
  }
  G.stopFlight = () => { flight = null; };
  G.isFlying = () => !!flight;

  // ---------- the Kármán line (100 km): a green aurora flash over the whole view and a short vibration as the eye crosses
  // it, either way (owner, 2026-10-13). Over in 250 ms, so the view never rests green. Each crossing resets a 10 s
  // recharge: strength = time since the last crossing / 10 s (a recrossing at 1 s gives 0.1, at 9 s gives 0.9).
  // A crossing more than 1,000 km from the last one counts as fresh (full strength), as if 10 s had passed.
  let kAlt = NaN, kLast = -Infinity, kEl = null, kAt = null;
  function karman(h, now) {
    const prev = kAlt; kAlt = h; if (!isFinite(prev) || (prev < 1e5) === (h < 1e5)) return;
    const here = { lon: F.eyeGeo.lon, lat: F.eyeGeo.lat }, far = !kAt || surfaceDistance(kAt.lon, kAt.lat, here.lon, here.lat) > 1e6; kAt = here;
    const s = far ? 1 : clamp((now - kLast) / 10000, 0, 1); kLast = now; G.karman = { strength: s, up: h >= 1e5, at: now };
    if (s < 0.02 || reduced()) return;
    if (!kEl) { kEl = document.createElement('div'); kEl.id = 'karmanFlash'; kEl.setAttribute('aria-hidden', 'true');
      kEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;background:radial-gradient(130% 70% at 30% 0%,#7dffb8 0%,#2bff8fcc 35%,transparent 75%),radial-gradient(100% 60% at 75% 15%,#3fffd0 0%,#00d48add 40%,transparent 80%),linear-gradient(180deg,#5cff9e 0%,#00c86ecc 50%,#00a05a88 100%)';
      document.body.appendChild(kEl); }
    kEl.animate([{ opacity: 0 }, { opacity: 0.95 * Math.sqrt(s), offset: 0.2 }, { opacity: 0 }], { duration: 250, easing: 'ease-out' });
    try { navigator.vibrate?.(Math.round(10 + 30 * s)); } catch { /* no vibration */ }
    H.say?.(`${h >= 1e5 ? 'Above' : 'Below'} the Kármán line (100 km)`);
  }

  // ---------- per frame: tick (flights and hand-overs, both modes); frame (globe mode: draw); background (model mode)
  let wantOut = false;
  G.wantOut = () => { if (!MF || H.blocked()) return; if (!G.ready) { H.say?.('Loading the world...'); G.ensure().then(() => { wantOut = true; H.draw(); }).catch(() => {}); return; } wantOut = true; H.draw(); };
  G.tick = function (now) {
    if (flight) stepFlight(now);
    if (fl) { if (G.mode !== 'globe' || flight || ptrs.size) fl = null; else stepFling(now); }
    if (G.mode === 'model' && now - lastWhere > 400) { lastWhere = now; if (MF) readout(); }
    if (G.mode === 'model' && MF && !flight) {
      // (the eye is kept: the range stays as it is, at least 3 % over the hand-over in, so the globe does not hand back)
      if (wantOut && G.ready) { wantOut = false; const o = modelOrbit(); o.range = Math.max(o.range, HANDOVER.range * 1.03); enterGlobe(o); }
      else if (G.ready && !H.blocked()) { const c = H.camState(), ll = ecefToGeodetic(...modelToEcef([c.tx, c.ty, c.tz])); if (!inBox(ll.lon, ll.lat, HANDOVER.leaveM)) enterGlobe(modelOrbit()); }
    }
    if (G.mode === 'globe' && !flight && canModel(orbit) && !ptrs.size) enterModel(orbit);
    if (G.mode === 'model' && G.ready && !bgOn && !G.rested) { if (!lowSince) lowSince = now; else if (now - lowSince > REST_MS) restGlobe(); } else lowSince = 0;
  };
  G.frame = function (now, asked) {
    if (G.mode !== 'globe') return null;
    if (!G.ready) { G.ensure().catch(() => {}); return null; }
    const c = orbitCam(orbit), moved = !G.lastEye || len(sub(c.eye, G.lastEye)) > 1e-3 || Math.abs(dot3(c.f, G.lastF) - 1) > 1e-12;
    if (!(asked || moved || G.dirty || flight)) return null;
    G.dirty = false; G.lastEye = c.eye; G.lastF = c.f;
    const ms = drawGlobe(c.eye, c.f, c.u, null);
    karman(F.eyeGeo.h, now);
    updateCells(now);
    if (now - lastLab > 90 || !moved) { lastLab = now; labels.update({ project, eye: c.eye, zoom: viewZoom(), W: innerWidth, H: innerHeight, visible: labelsOn(), filter: lb => !lb.off }); }
    if (now - lastWhere > 250) { lastWhere = now; readout(); }
    if (ui.north) ui.north.style.transform = `rotate(${-orbit.heading * R2D}deg)`;
    syncUrl();
    return ms;
  };
  // model mode: the globe as the model scene's background when the eye is high (the sky dome is hidden then)
  let rtDrawn = false;
  G.background = function () {
    if (G.mode !== 'model' || !G.ready || !MF) { if (bgOn) setBg(false); return; }
    const up = stepReup();
    camera.updateMatrixWorld(); const e = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld), high = e.y > HANDOVER.bg && !H.blocked();
    if (!high) { if (bgOn) setBg(false); return; }
    if (!bgOn) setBg(true);
    for (const o of [H.sky.sky, H.sky.stars, H.sky.moonDisc]) if (o) o.visible = false;   // (the sky's own updates may show them again)
    const fw = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld), E = modelToEcef([e.x, e.y, e.z]), P = modelToEcef([e.x + fw.x * 1000, e.y + fw.y * 1000, e.z + fw.z * 1000]);
    const f = nrm(sub(P, E)), upE = ecefNormalAt(ecefToGeodetic(...E)), u = nrm(sub(upE, f.map(v => v * dot3(upE, f))));
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2()); const bw = Math.max(4, Math.round(sz.x / 2)), bh = Math.max(4, Math.round(sz.y / 2)); if (rt.width !== bw || rt.height !== bh) { rt.setSize(bw, bh); rtDrawn = false; }   // half size: the globe behind the model is far and soft; a full HalfFloat target at DPR 3 costs about 40 MB on a phone (owner, 2026-10-14: the tab restarted after Home)
    orbit = orbitFrom(E, addS(E, f, 1000));   // (for the readout)
    if (up && rtDrawn) return;   // a frame that uploads model buffers: the globe target keeps its last picture
    drawGlobe(E, f, u, rt); rtDrawn = true;
    const now = performance.now(); if (now - lastWhere > 250) { lastWhere = now; readout(); }
  };
  function setBg(on) {
    bgOn = on; const sc = H.scene;
    if (on && !rt) { rt = new THREE.RenderTarget(4, 4, { type: THREE.HalfFloatType }); G.bgNode = texture(rt.texture, H.webgpu ? screenUV : screenUV.flipY()); rtDrawn = false; }
    sc.backgroundNode = on ? G.bgNode : null;
    for (const o of [H.sky.sky, H.sky.stars, H.sky.moonDisc]) if (o) { if (on) { o.userData.globeWas = o.visible; o.visible = false; } else o.visible = o.userData.globeWas ?? true; }
    H.draw();
  }

  // ---------- input in globe mode: one finger or the left button drags the ground (Google Earth); right button, Shift or
  // Ctrl drag turns (x) and tilts (y); two fingers: pinch to zoom, twist to turn, move together to drag; the wheel zooms
  // to the pointer; double click zooms in there; keys: arrows move, + and - zoom, N north up
  const cv = renderer.domElement, ptrs = new Map(); let grab = null, two = null, lastNav = 0;
  const touched = () => { lastNav = performance.now(); flight = null; G.dirty = true; H.draw(); };
  // move the orbit target (heading, tilt and range kept) so that the ground point P comes under the screen point (x, y).
  // The camera is brought up to date before each ray (a phone sends 2 to 4 moves a frame; a ray from the last drawn
  // frame's camera counts the same move again and throws the map off screen). A change of target longitude is a turn
  // about the polar axis, so the longitude error goes to 0 in one step; latitude needs 2 or 3.
  function anchor(P, x, y) {
    const R0 = len(P), g0 = ecefToGeodetic(...P);
    for (let k = 0; k < 4; k++) {
      syncCam(); const r = rayAt(x, y), b = 2 * dot3(r.o, r.d), c = dot3(r.o, r.o) - R0 * R0, D = b * b - 4 * c;
      if (D < 0) return; const t = (-b - Math.sqrt(D)) / 2; if (t <= 0) return;
      const g = ecefToGeodetic(...addS(r.o, r.d, t)), dl = ((g0.lon - g.lon + 540) % 360) - 180, db = g0.lat - g.lat;
      orbit.lon = wrapLon(orbit.lon + dl); orbit.lat = clamp(orbit.lat + db, -89.9, 89.9); guard(orbit);
      if (Math.abs(dl) + Math.abs(db) < 1e-9) break;
    }
  }
  function dragTo(x, y) { if (!grab || !grab.g) return; anchor(grab.g.P, x, y); touched();
    const t = performance.now(); fsamp.push({ t, lon: orbit.lon, lat: orbit.lat }); while (fsamp.length && t - fsamp[0].t > 120) fsamp.shift(); }
  // momentum after a fling (owner, 2026-10-13): the drag's speed over its last 120 ms, slowing with a 400 ms time constant
  let fsamp = [], fl = null;
  function release() {
    const n = fsamp.length, now = performance.now(); if (n < 2 || now - fsamp[n - 1].t > 60) { fsamp = []; return; }
    const a = fsamp[0], b = fsamp[n - 1], dt = Math.max(8, b.t - a.t), vl = (((b.lon - a.lon + 540) % 360) - 180) / dt, vb = (b.lat - a.lat) / dt;
    fsamp = []; if (Math.hypot(vl, vb) * 1000 > 1e-6 * orbit.range / 1000) { fl = { vl, vb, t: now }; H.draw(); }
  }
  function stepFling(now) {
    const dt = Math.min(50, now - fl.t); fl.t = now; const k = Math.exp(-dt / 400);
    orbit.lon = wrapLon(orbit.lon + fl.vl * dt); orbit.lat = clamp(orbit.lat + fl.vb * dt, -89.9, 89.9); guard(orbit);
    fl.vl *= k; fl.vb *= k; G.dirty = true; H.draw();
    if (Math.hypot(fl.vl, fl.vb) * 111320 * 16 < 0.3 * orbit.range / 1000) fl = null;   // under about 0.3 px a frame
  }
  cv.addEventListener('pointerdown', e => {
    if (G.mode !== 'globe') return; flight = null; fl = null; fsamp = [];
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, alt: e.button === 2 || e.shiftKey || e.ctrlKey, x0: e.clientX, y0: e.clientY });
    try { cv.setPointerCapture(e.pointerId); } catch { /* gone */ }
    if (ptrs.size === 1) grab = { g: pick(e.clientX, e.clientY) }; else if (ptrs.size === 2) { const q = [...ptrs.values()]; two = { d: Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y), a: Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x), m: [(q[0].x + q[1].x) / 2, (q[0].y + q[1].y) / 2] }; grab = { g: pick(two.m[0], two.m[1]) }; }
    touched();
  });
  cv.addEventListener('pointermove', e => {
    let p = ptrs.get(e.pointerId); if (G.mode !== 'globe') return;
    // a drag that began in the model and crossed the hand-over: the globe takes the same finger on (no dead gesture)
    if (!p) { if (!e.buttons || ptrs.size) return; p = { x: e.clientX, y: e.clientY, alt: (e.buttons & 2) > 0 || e.shiftKey || e.ctrlKey, x0: e.clientX, y0: e.clientY }; ptrs.set(e.pointerId, p); grab = { g: pick(e.clientX, e.clientY) }; return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; if (!dx && !dy) return;
    if (ptrs.size === 1) { if (p.alt) { orbit.heading += dx * 0.006; orbit.tilt = clamp(orbit.tilt - dy * 0.006, 0, maxTilt(orbit.range)); guard(orbit); touched(); } else dragTo(e.clientX, e.clientY); }
    else if (ptrs.size === 2 && two) {
      const q = [...ptrs.values()], d = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y), a = Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x), m = [(q[0].x + q[1].x) / 2, (q[0].y + q[1].y) / 2];
      const dmy = m[1] - two.m[1], same = Math.sign(q[0].y - q[0].y0) === Math.sign(q[1].y - q[1].y0) && Math.abs(d - two.d) < 4;
      if (same && Math.abs(dmy) > Math.abs(m[0] - two.m[0])) { orbit.tilt = clamp(orbit.tilt - dmy * 0.004, 0, maxTilt(orbit.range)); }
      else { orbit.range *= two.d / Math.max(1, d); let da = a - two.a; da = ((da + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; orbit.heading -= da; guard(orbit); dragTo(m[0], m[1]); }   // the map turns with the fingers (as the model)
      two = { d, a, m }; guard(orbit); touched();
    }
  });
  const end = e => { if (!ptrs.delete(e.pointerId)) return; if (!ptrs.size && !two && e.type === 'pointerup') release(); else fsamp = []; two = null; if (ptrs.size === 1) { const q = [...ptrs.values()][0]; grab = { g: pick(q.x, q.y) }; } else grab = null; lastNav = performance.now(); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  function zoomAt(f, x, y) {   // in and out about the point under (x, y): it stays under the pointer
    const g = x != null ? pick(x, y) : null;
    orbit.range *= f; guard(orbit); if (g) anchor(g.P, x, y); touched();
  }
  // the wheel: one notch (100 px) = x 1.16; a trackpad flick can send 1,000 px in one event: limited to x 1.45
  cv.addEventListener('wheel', e => { if (G.mode !== 'globe') return; e.preventDefault(); const dy = clamp(e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1), -250, 250); zoomAt(Math.exp(dy * 0.0015), e.clientX, e.clientY); }, { passive: false });
  cv.addEventListener('dblclick', e => { if (G.mode === 'globe') zoomAt(0.45, e.clientX, e.clientY); });
  addEventListener('keydown', e => {
    if (G.mode !== 'globe' || e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof Element && e.target.closest('input,select,textarea,[role=slider]'))) return;
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (k) { e.preventDefault(); const m = orbit.range * 0.12, b = orbit.heading, de = m * (k[0] * Math.cos(b) - k[1] * -Math.sin(b)), dn = m * (k[1] * Math.cos(b) - k[0] * Math.sin(b));
      orbit.lat = clamp(orbit.lat + dn / 110574, -89.9, 89.9); orbit.lon = wrapLon(orbit.lon + de / (111320 * Math.max(0.05, Math.cos(orbit.lat * D2R)))); guard(orbit); touched(); }
    else if (e.key === '+' || e.key === '=') zoomAt(0.7); else if (e.key === '-') zoomAt(1 / 0.7);
    else if (e.key === 'n' || e.key === 'N') G.northUp();
  });

  // ---------- taps: a label opens its card; the ground opens "what is here"
  G.tap = function (x, y) {
    if (!G.ready) return; const lab = labels.at(x, y);
    if (!lab && G.placeTap) { syncCam(); if (G.placeTap(x, y, gcam)) return; }   // a building of a place (globe/places.js)
    if (lab) { const r = lab.ref; showEntry(r.entry ? (r.entry.L || r.entry.texts ? world.entry(r.entry) : r.entry) : world.entry({ L: r.L, i: r.i, kind: r.L.gazetteer?.kind || r.L.id, lon: 0, lat: 0, ...posOf(r.L, r.i) })); return; }
    const g = pick(x, y); if (!g) return; showCard(featuresAt(g.lon, g.lat));
  };
  const posOf = (L, i) => { const f = L.features[i], p = f.properties, s = L.gazetteer || L.labels || {}; const xy = s.at ? [p[s.at[0]], p[s.at[1]]] : f.geometry.type === 'Point' ? f.geometry.coordinates : labelPoint(f.geometry); return xy ? { lon: xy[0], lat: xy[1] } : {}; };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function showCard(e) {
    if (!e) return; const facts = (e.facts || []).map(f => `<tr><td>${esc(f.label)}</td><td>${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.value)}</a>` : esc(f.value)}</td><td class="small">${esc(f.source || '')}</td></tr>`).join('');
    const sub2 = [e.kind, e.region, e.country].filter(Boolean).map(esc).join(' · ');
    H.showCard(`<h2>${esc(e.name || 'Here')}</h2>${e.local_name ? `<p class="small">${esc(e.local_name)}</p>` : ''}<p class="small">${sub2}${e.lon != null ? ` · ${fmtLatLon(e.lat, e.lon, 3)}` : ''}</p>${facts ? `<div class="tw"><table>${facts}</table></div>` : ''}${e.text ? `<p class="small">${esc(e.text)}</p>` : ''}<p class="small">${CREDIT}</p>`);
  }
  G.showCard = showCard;
  // (the world base and the detail sets: imagery CC BY 4.0, GeoNames CC BY 4.0, OpenStreetMap ODbL; cwplans/data-register.json)
  const CREDIT = 'Map data: Natural Earth (public domain); GeoNames (CC BY 4.0); <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> (ODbL, regional roads, rivers and places). Imagery: Sentinel-2 cloudless 2016 by EOX IT Services GmbH (CC BY 4.0, contains modified Copernicus Sentinel data 2016). Terrain: ETOPO 2022 (NOAA, public domain); Copernicus DEM GLO-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA.';
  // a card, then the extra facts (a place card of a skeleton set) when they come
  async function showEntry(e) { showCard(e); if (e && e.more) { const f = await e.more().catch(() => null); if (f && f.length) showCard({ ...e, facts: [...(e.facts || []).filter(x => x.label !== 'Kind'), ...f], more: null }); } }
  G.showEntry = showEntry;

  // ---------- what is at a point; the view in words; the view as numbers
  function featuresAt(lon, lat) {
    const w = world.where(lon, lat), near = world.nearestPlaces(lon, lat, 3), h = sampler ? Math.round(sampler.h(lon, lat)) : null;
    const name = w.lake?.name || w.admin1?.name || w.country?.name || w.sea?.name || 'Open water';
    const facts = [];
    if (w.country) facts.push({ label: 'Country', value: w.country.name, source: 'Natural Earth' });
    if (w.admin1) facts.push({ label: 'Region', value: w.admin1.name, source: 'Natural Earth' });
    if (w.sea) facts.push({ label: w.sea.near ? 'Nearest sea' : 'Sea', value: w.sea.name, source: 'Natural Earth' });
    if (w.lake) facts.push({ label: 'Lake', value: w.lake.name, source: 'Natural Earth' });
    if (h != null) facts.push({ label: h >= 0 ? 'Height above sea level (about)' : 'Depth (about)', value: `${Math.abs(h).toLocaleString('en')} m`, source: sampler && sampler.demH && sampler.demH(lon, lat) != null ? 'Copernicus DEM GLO-90 (world base tile, box mean)' : 'ETOPO 2022 (box mean of about 10 km)' });
    for (const p of near) facts.push({ label: 'Near', value: `${p.name}${p.country ? ' (' + p.country + ')' : ''}, ${fmtDist(p.dist_m)} ${p.direction}`, source: 'Natural Earth' });
    return { name, kind: 'point', lon, lat, country: w.country?.name || null, region: w.admin1?.name || null, sea: w.sea?.name || null, lake: w.lake?.name || null, height_m: h, nearest: near, facts };
  }
  G.featuresAt = (lon, lat) => G.gazetteer().then(() => G.ensure()).then(async () => { const r = featuresAt(lon, lat), more = await G.whereMore(lon, lat); if (Object.keys(more).length) r.more = more; return r; });
  function centreHit() { return pick(innerWidth / 2, innerHeight / 2); }
  G.getView = function () {
    const c = orbitCam(orbit), e = ecefToGeodetic(...c.eye), ground = sampler ? sampler.ell(e.lon, e.lat) : 0, msl = sampler ? e.h - sampler.geoid(e.lon, e.lat) : null;
    return { mode: G.mode, eye: { lon: r6(e.lon), lat: r6(e.lat), height_m: Math.round(e.h), height_datum: 'WGS84 ellipsoid', above_sea_level_m: msl != null ? Math.round(msl) : null, above_ground_m: Math.round(e.h - ground) },
      target: { lon: r6(orbit.lon), lat: r6(orbit.lat) }, range_m: Math.round(orbit.range), heading_deg: r1(((orbit.heading * R2D) % 360 + 360) % 360), heading_name: compass(orbit.heading * R2D), tilt_deg: r1(orbit.tilt * R2D), pitch_deg: r1(-(90 - orbit.tilt * R2D)),
      fov_deg: { vertical: r1(camera.fov), horizontal: r1(2 * Math.atan(Math.tan(camera.fov * D2R / 2) * camera.aspect) * R2D) }, zoom: r1(viewZoom()) };
  };
  const r6 = v => Math.round(v * 1e6) / 1e6, r1 = v => Math.round(v * 10) / 10;
  G.describe = async function (o = {}) {
    await G.ensure(); const c = orbitCam(orbit), e = ecefToGeodetic(...c.eye); drawGlobeIfNeeded();
    const ctr = centreHit(), samples = [];
    for (let j = 1; j <= 5; j++) for (let i = 1; i <= 7; i++) { const g = pick(innerWidth * i / 8, innerHeight * j / 6); if (g) samples.push(g); }
    const inView = (lon, lat) => { const P = geodeticToEcef(lon, lat, 0), up = enuBasis(lon, lat).up; if (dot3(sub(c.eye, P), up) < 0) return false; return !!project(P); };
    const sun = G.subsolar ? { altitude_deg: r1(90 - surfaceDistance(ctr ? ctr.lon : e.lon, ctr ? ctr.lat : e.lat, G.subsolar.lon, G.subsolar.lat) / 111195) } : null;
    const more = ctr ? await G.whereMore(ctr.lon, ctr.lat) : {};
    const d = world.describe({ eye: { lon: r6(e.lon), lat: r6(e.lat), alt_m: Math.round(e.h) }, centre: ctr ? { lon: r6(ctr.lon), lat: r6(ctr.lat) } : null, heading_deg: ((orbit.heading * R2D) % 360 + 360) % 360, tilt_deg: orbit.tilt * R2D, samples, inView, sun, maxItems: o.maxItems || 8, time: o.time || null });
    if (Object.keys(more).length) { d.centre.more = more; const parts = [more.builtUp, more.district, more.county !== more.district ? more.county : null, more.region, more.country].filter(Boolean);
      if (parts.length) d.text += ` In detail (${more.source}): ${[...new Set(parts)].join(', ')}${more.nationalPark ? '; in ' + more.nationalPark : ''}${more.nearest ? `; the nearest place is ${more.nearest.name}, ${fmtDist(more.nearest.dist_m)} away` : ''}.`; }
    const pl = G.placesDescribe ? G.placesDescribe(ctr ? { lon: ctr.lon, lat: ctr.lat } : null) : [];   // places as 3D Tiles (globe/places.js)
    if (pl.length) { d.places = pl; d.text += ' ' + pl.map(x => x.text).join(' '); }
    return d;
  };
  function drawGlobeIfNeeded() { if (G.mode === 'globe' && !G.lastEye) { const c = orbitCam(orbit); setCamera(c.eye, c.f, c.u); } }
  G.search = (q, n = 10) => world.search(q, n);
  // a link to this globe view: ?ll=lat,lon,alt (the eye's height above the target) and &ht=heading,tilt (degrees)
  function globeQuery() { const q = new URLSearchParams(location.search); for (const k of ['view', 'll', 'ht']) q.delete(k);
    q.set('ll', `${orbit.lat.toFixed(5)},${orbit.lon.toFixed(5)},${Math.round(orbit.range * Math.cos(orbit.tilt))}`); q.set('ht', `${Math.round(((orbit.heading * R2D) % 360 + 360) % 360)},${Math.round(orbit.tilt * R2D)}`);
    return '?' + q.toString().replace(/%2C/g, ','); }
  G.shareLink = () => location.origin + location.pathname + globeQuery();
  // the address bar follows the globe view (a reload opens it again); back in the model, the model's share hash takes over
  let urlT = 0;
  function syncUrl(force) { const now = performance.now(); if (!force && now - urlT < 1000) return; urlT = now;
    if (G.mode === 'globe') history.replaceState(null, '', location.pathname + globeQuery());
    else { const q = new URLSearchParams(location.search); let ch = false; for (const k of ['ll', 'ht']) if (q.has(k)) { q.delete(k); ch = true; } if (q.get('view') === 'globe') { q.delete('view'); ch = true; }
      if (ch) history.replaceState(null, '', location.pathname + (q.size ? '?' + q.toString().replace(/%2C/g, ',') : '') + location.hash); } }
  G.orbit = () => ({ ...orbit });

  // the lowest eye away from the model and the places: 60 km over the world texture only; lower where the base has finer
  // imagery and heights (level 11: about 19 m a pixel; level 9 and 10; level 7 and 8)
  const floorAt = (lon, lat) => { const L = G.baseDetailAt ? G.baseDetailAt(lon, lat) : 0; return L >= 11 ? 2000 : L >= 9 ? 8000 : L >= 7 ? 25000 : 60000; };
  // ---------- going places
  // goTo({ lon, lat, alt_m | range_m, heading_deg, tilt_deg | pitch_deg, animate }): anywhere on earth; in the model box and
  // below the hand-over the model takes the view
  G.goTo = async function (t, opt = {}) {
    await G.ensure(); await G.placesReady;
    const tilt = t.tilt_deg != null ? +t.tilt_deg * D2R : t.pitch_deg != null ? (90 - clamp(+t.pitch_deg, 1, 90)) * D2R : 0;
    const range = +(t.range_m ?? ((t.alt_m ?? t.alt ?? 1.5e6) / Math.max(0.1, Math.cos(tilt))));
    // outside the model box the globe has only coarse world data (terrain 9.8 km a pixel): an eye under 60 km sees one
    // flat colour (owner, 2026-10-13: the Sarajevo link opened on "pure beige"), so the eye goes no lower than 60 km there
    // (over a place built as 3D Tiles, globe/places.js, a 300 m floor instead)
    // (round the testbeds the base tiles are finer, globe/base-tiles.js: a lower floor there, floorAt)
    const minR = inBox(+t.lon, +t.lat, HANDOVER.marginM) ? 0 : (G.detailAt?.(+t.lon, +t.lat) ? 300 : floorAt(+t.lon, +t.lat)) / Math.max(0.1, Math.cos(tilt));
    const o = { lon: +t.lon, lat: +t.lat, h: 0, range: Math.max(range, minR), heading: (+t.heading_deg || 0) * D2R, tilt };
    if (!isFinite(o.lon) || !isFinite(o.lat) || Math.abs(o.lat) > 90) throw new Error('goTo needs lon and lat in WGS84 degrees');
    await new Promise(ok => flyTo(o, { ms: opt.animate ? undefined : 0, view: t.view || null, done: ok, card: opt.card || null }));
    return G.getView();
  };
  G.flyToEntry = (e, opt = {}) => {
    if (e.view && H.VIEWS[e.view]) return G.home(opt);
    const big = e.kind === 'country' ? 2.6e6 : e.kind === 'region' ? 9e5 : e.kind === 'sea' ? 3e6 : e.kind === 'lake' || e.kind === 'river' ? 6e5 : e.kind === 'region-config' ? 25000 : 6e4;
    flyTo({ lon: e.lon, lat: e.lat, range: e.alt_m || big, heading: 0, tilt: e.kind === 'place' || e.kind === 'region-config' ? 40 * D2R : 0 }, { card: e, ...opt });
  };
  // Home: the Docklands view of the page (VIEWS.cw), reached by a flight that ends in the model exactly where ?view=cw puts it
  G.home = (opt = {}) => { const v = H.VIEWS.cw, o = modelCamToOrbit({ tx: v.tx, ty: v.ty || 0, tz: v.tz, dist: v.dist, yaw: v.yaw, pitch: v.pitch }); flyTo(o, { view: 'cw', ...opt }); };
  // the whole globe in view: on a portrait phone the horizontal field decides (390 x 844: about 27,000 km out)
  const worldRange = () => { const hf = 2 * Math.atan(Math.tan(camera.fov * D2R / 2) * Math.min(1, camera.aspect)); return Math.max(1.25e7, A_ / Math.sin(hf / 2) * 1.08 - A_); };
  G.worldRange = worldRange;
  G.world = (opt = {}) => { const o = G.mode === 'globe' ? orbit : modelOrbit(); flyTo({ lon: o.lon, lat: o.lat, range: worldRange(), heading: 0, tilt: 0 }, opt); };
  G.northUp = () => { const o = G.mode === 'globe' ? orbit : modelOrbit(); flyTo({ ...o, heading: 0, tilt: 0 }, { ms: reduced() ? 0 : 700 }); };

  // ---------- the "where am I" readout (all modes): the centre of the view, the eye height, country or sea, the nearest place
  function readout() {
    const el = ui.where; if (!el) return;
    let lon, lat, alt;
    if (G.mode === 'globe') { const c = orbitCam(orbit), e = ecefToGeodetic(...c.eye); lon = orbit.lon; lat = orbit.lat; alt = e.h - (sampler ? sampler.geoid(e.lon, e.lat) : 0); }
    else { const c = H.camState(), cp = Math.cos(c.pitch), E = [c.tx + c.dist * Math.sin(c.yaw) * cp, c.ty + c.dist * Math.sin(c.pitch), c.tz + c.dist * Math.cos(c.yaw) * cp], g = ecefToGeodetic(...modelToEcef([c.tx, c.ty, c.tz])); lon = g.lon; lat = g.lat; alt = E[1]; }
    let where = '', near = '';
    if (world.lookups.size) { const w = world.where(lon, lat); where = w.country ? (w.admin1 && G.mode === 'globe' && orbit.range < 3e6 ? w.admin1.name + ', ' : '') + w.country.name : w.lake ? w.lake.name : w.sea ? w.sea.name : '';
      const n = world.nearestPlaces(lon, lat, 1, { maxKm: 400 })[0]; if (n) near = `near ${n.name} ${fmtDist(n.dist_m)}`;
      // a skeleton set's finer answer (district, county, country; the nearest place of its gazetteer) where it has one
      const m = searchProviders.length && !(G.mode === 'globe' && orbit.range > 1.5e6) ? G.whereCached(lon, lat) : null;   // (from far out: the country is enough)
      if (m && (m.district || m.county || m.country)) { where = [m.builtUp && m.builtUp !== m.district ? m.builtUp : null, m.district, m.county !== m.district ? m.county : null, m.country].filter(Boolean).join(', ');
        if (m.nearest && (!n || m.nearest.dist_m < n.dist_m)) near = `near ${m.nearest.name} ${fmtDist(m.nearest.dist_m)}`; } }
    const txt = [fmtLatLon(lat, lon, alt < 2e4 ? 4 : 2), `eye ${fmtDist(Math.max(0, alt))} up`, where, near].filter(Boolean).join(' · ');
    if (el.textContent !== txt) el.textContent = txt;
  }
  G.readout = readout;

  // ---------- UI: the readout, the globe buttons (globe mode), Menu > Go > Globe, Menu > Layers > World, the labels' host
  const css = document.createElement('style');
  css.textContent = `#globeLabels{position:fixed;inset:0;pointer-events:none;overflow:hidden;display:none}
body.globeMode #globeLabels{display:block}body.globeMode #labels{display:none}
body.noLabels #globeLabels,body.noLabels #whereAmI{visibility:hidden!important}
.glab{position:absolute;left:0;top:0;padding:1px 5px;border-radius:4px;color:#f3f5f7;font:12px/1.25 system-ui,sans-serif;white-space:nowrap;text-shadow:0 0 3px #000,0 0 6px #000;will-change:transform}
.glab.country{font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:11px;color:#ffe7a8}
.glab.sea{font-style:italic;color:#a9d6ff}.glab.admin1{color:#e3d2a8;font-size:11px}
.glab.place::before{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;background:#fff;margin-right:4px;vertical-align:1px;box-shadow:0 0 2px #000}
.glab.model{color:#7ff3e6;font-weight:700;background:rgba(10,14,18,.55)}
#whereAmI{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(30px + var(--safe));max-width:min(92vw,720px);z-index:4;pointer-events:none;font:12px/1.3 system-ui,sans-serif;color:#e8eaec;background:#0d1013c0;padding:3px 10px;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:600px){#whereAmI{bottom:calc(58px + var(--safe));font-size:11px}}
@media (min-width:900px){#whereAmI{left:auto;right:44px;transform:none;bottom:calc(6px + var(--safe));max-width:min(46vw,620px)}}   /* clear of the notes at the bottom left */
#globeBtns{position:fixed;right:10px;top:calc(140px + var(--top));display:flex;flex-direction:column;gap:8px;z-index:5}
#globeBtns[hidden]{display:none}
#globeBtns button{width:44px;height:44px;border-radius:50%;border:0;background:var(--panel);color:var(--fg);font:600 16px system-ui,sans-serif;cursor:pointer}
#globeBtns #gNorth span{display:inline-block;transition:transform .2s}`;
  document.head.appendChild(css);
  ui.labels = document.createElement('div'); ui.labels.id = 'globeLabels'; ui.labels.setAttribute('aria-hidden', 'true'); document.body.appendChild(ui.labels);
  ui.where = document.createElement('div'); ui.where.id = 'whereAmI'; document.body.appendChild(ui.where);
  ui.btns = document.createElement('div'); ui.btns.id = 'globeBtns'; ui.btns.hidden = true; ui.btns.setAttribute('role', 'group'); ui.btns.setAttribute('aria-label', 'Globe');
  ui.btns.innerHTML = `<button type="button" id="gHome" title="Back to the Docklands model" aria-label="Home: back to the Docklands">⌂</button><button type="button" id="gNorth" title="North up, look straight down" aria-label="North up"><span>N</span></button><button type="button" id="gWorld" title="The whole world" aria-label="Zoom out to the whole world">◯</button>`;
  document.body.appendChild(ui.btns); ui.north = ui.btns.querySelector('#gNorth span');
  ui.btns.querySelector('#gHome').onclick = () => G.home(); ui.btns.querySelector('#gNorth').onclick = () => G.northUp(); ui.btns.querySelector('#gWorld').onclick = () => G.world();
  const goHost = $('ext-go');
  if (goHost) { const h = document.createElement('h3'); h.textContent = 'Globe'; const row = document.createElement('div'); row.className = 'btnrow'; row.id = 'globeGo';
    row.innerHTML = '<button type="button" id="goWorld">World</button><button type="button" id="goHome">Home (Docklands)</button><button type="button" id="goNorth">North up</button>';
    const note = document.createElement('p'); note.className = 'small'; note.innerHTML = 'Zoom out past the model, or tap World, to see the whole planet. On the globe: drag to move, two fingers or the wheel to zoom, right or Shift drag to turn and tilt. Search (top of this menu) finds any country, region, sea or city. Map data: Natural Earth (public domain), GeoNames (CC BY 4.0), © OpenStreetMap contributors (ODbL); imagery: Sentinel-2 cloudless 2016 by EOX (CC BY 4.0); terrain: ETOPO 2022 (NOAA, public domain), Copernicus DEM GLO-90.';
    goHost.prepend(h, row, note);
    const closeMenu = () => { if (innerWidth < 900 && !$('drawer').hidden) $('drawerX')?.click(); };
    row.querySelector('#goWorld').onclick = () => { closeMenu(); G.world(); }; row.querySelector('#goHome').onclick = () => { closeMenu(); G.home(); }; row.querySelector('#goNorth').onclick = () => { closeMenu(); G.northUp(); }; }
  const uiDone = new Set();
  function layerUi(more) {
    if (!H.ui) return; const prev = H.ui.tab('layers/world');
    if (!more) H.ui.note('The world on the globe (shown when you zoom out past the model). Natural Earth 5.1.2 and ETOPO 2022, public domain; imagery Sentinel-2 cloudless 2016 by EOX (CC BY 4.0); terrain near the testbeds Copernicus DEM GLO-90; GeoNames (CC BY 4.0); regional roads, rivers and places © OpenStreetMap contributors (ODbL).');
    for (const L of [...layers, ...cellLayers]) { if (uiDone.has(L) || !L.label) continue; uiDone.add(L); H.ui.toggle(L.label, L.on, v => { L.on = v; G.dirty = true; H.draw(); }); }
    if (!more) { H.ui.toggle('Place names on the globe', true, v => { G.labelsShown = v; G.dirty = true; H.draw(); }); G.labelsShown = true; }
    H.ui.tab(prev);
  }
  const labelsOn = () => G.labelsShown !== false && !document.body.classList.contains('noLabels');
  addEventListener('resize', () => { G.dirty = true; });

  // ---------- the layer contract for code (the UK skeleton and later sets; world.js has the manifest form):
  // addLayer({ id, label, kind: 'lines' | 'polygons' | 'points', features: GeoJSON Feature[] | FeatureCollection, or url,
  //            style: { color, opacity, minAlt, maxAlt, on }, labels, gazetteer, lookup, nearest, set }) -> Promise
  G.addLayer = async function (spec) {
    const { features, url, set = 'extra', ...rest } = spec, data = features ? (Array.isArray(features) ? { type: 'FeatureCollection', features } : features) : null;
    const M = await world.addManifest(url ? new URL(url, location.href).href : location.href + '#' + set + ':' + spec.id, { id: set, name: spec.setName || set, credit: spec.credit || '', layers: [{ ...rest, ...(data ? { data } : { url }) }] });
    const key = set + ':' + spec.id; await world.loadLayer(key);
    if (G.ready) { await buildLayer(key); labels.sorted = false; layerUi(true); G.dirty = true; H.draw(); }
    return M;
  };
  G.addGazetteer = items => world.addGazetteer(items);
  // cell layers, streamed by view (the geodetic quadtree of docs/planet-architecture.md: level L cells of 180 / 2^L degrees,
  // x from -180 east, y from -90 north): addCellLayer({ id, label, kind, style, labels?, levels: [[maxEyeAltM, level], ...]
  // (the first whose altitude is above the eye), query: async (bbox [w, s, e, n], level, [x, y]) -> GeoJSON Feature[] })
  const cellLayers = [];
  G.addCellLayer = function (spec) { const L = { ...spec, cells: new Map(), on: spec.style?.on !== false, mat: lineMaterial(spec.style?.color || '#ffffff', spec.style?.opacity ?? 0.8) }; cellLayers.push(L); if (G.ready) layerUi(true); G.dirty = true; return L; };
  let cellT = 0;
  function updateCells(now) {
    if (!cellLayers.length || now - cellT < 300) return; cellT = now;
    const alt = F.eyeGeo.h, half = clamp(orbit.range * 1.4 / 111000, 0.05, 60), b = [orbit.lon - half / Math.max(0.2, Math.cos(orbit.lat * D2R)), orbit.lat - half, orbit.lon + half / Math.max(0.2, Math.cos(orbit.lat * D2R)), orbit.lat + half];
    for (const L of cellLayers) {
      const lv = (L.levels || [[Infinity, 3]]).find(([a]) => alt <= a); const want = new Set();
      if (L.on && lv && G.mode === 'globe' && alt >= (L.style?.minAlt || 0) && alt <= (L.style?.maxAlt || Infinity)) {
        const level = lv[1], sz = 180 / 2 ** level;
        for (let x = Math.floor((Math.max(-180, b[0]) + 180) / sz); x <= Math.floor((Math.min(179.999, b[2]) + 180) / sz); x++) for (let y = Math.floor((Math.max(-90, b[1]) + 90) / sz); y <= Math.floor((Math.min(89.999, b[3]) + 90) / sz); y++) {
          const k = level + '/' + x + '/' + y; want.add(k); if (L.cells.has(k)) continue;
          const cell = { k, meshes: [], labels: [], used: 0 }; L.cells.set(k, cell);
          Promise.resolve(L.query([-180 + x * sz, -90 + y * sz, -180 + (x + 1) * sz, -90 + (y + 1) * sz], level, [x, y])).then(fs => {
            const feats = (fs && fs.features) || fs || [];
            if (L.kind !== 'points') { cell.meshes = buildLines(feats.flatMap(f => linesOf(f.geometry)), G.heightAt, L.mat, L.style?.lift || 0); for (const m of cell.meshes) { m.visible = false; scene.add(m); } }
            if (L.labels || L.kind === 'points') for (const f of feats) { const p = f.properties || {}, xy = f.geometry?.type === 'Point' ? f.geometry.coordinates : labelPoint(f.geometry), text = p[(L.labels && L.labels.text) || 'name']; if (!xy || !text) continue;
              const lb = L.labels || {}, fn = (v, d) => typeof v === 'function' ? v(p) : v ?? d;
              cell.labels.push(labels.add({ id: L.id + k + text, text, cls: lb.class || 'extra', P: geodeticToEcef(xy[0], xy[1], G.heightAt(xy[0], xy[1]) + 30), up: enuBasis(xy[0], xy[1]).up, minZ: fn(lb.minZoom, null), rank: typeof lb.rank === 'function' ? lb.rank(p) : +p[lb.rank || 'rank'] || 5, pop: +p.pop || 0,
                ref: { entry: { name: text, kind: p.kind || L.id, lon: xy[0], lat: xy[1], facts: [], ...(L.entry ? L.entry(f) : {}) } } })); }
            G.dirty = true; H.draw();
          }).catch(e => console.warn('globe: cell layer', L.id, k, e));
        }
      }
      for (const [k, c] of L.cells) { const on = want.has(k); for (const m of c.meshes) { m.userData.on = on; m.visible = on; } for (const lb of c.labels) lb.off = !on; if (on) c.used = now; }
      if (L.cells.size > 300) for (const [k, c] of [...L.cells].sort((a, b) => a[1].used - b[1].used).slice(0, L.cells.size - 250)) { if (want.has(k)) continue; for (const m of c.meshes) { scene.remove(m); m.geometry.dispose(); } labels.clear(x => c.labels.includes(x)); L.cells.delete(k); }
    }
  }
  // new ground heights (base height tiles loaded over area a = [w, s, e, n]): the line chunks over it again on the new
  // ground, when the eye is low enough to see the difference (globe/base-tiles.js calls this, at most every 1.2 s)
  G.onBaseDem = a => {
    if (!G.ready || F.eyeGeo.h > 1.2e6) return; let n = 0, v = 0; const t0 = performance.now();
    const meets = b => b && b[0] <= a[2] && b[2] >= a[0] && b[1] <= a[3] && b[3] >= a[1];
    const re = m => { if (!meets(m.userData.bbox)) return; const k = rebuildLines(m, G.heightAt, a); if (k) { n++; v += k; } };
    for (const L of layers) for (const m of L.meshes) re(m);
    for (const L of cellLayers) for (const c of L.cells.values()) for (const m of c.meshes) re(m);
    G.stats.relines = { chunks: n, vertices: v, ms: Math.round(performance.now() - t0) }; if (n) { G.dirty = true; H.draw(); }
  };
  const searchProviders = [], whereProviders = [];
  G.addSearchProvider = fn => searchProviders.push(fn);   // async (q, limit) -> [{ name, kind, lon, lat, country?, facts? }]
  G.addWhereProvider = fn => whereProviders.push(fn);     // async (lon, lat) -> { ...facts } (in featuresAt and describe as "more")
  // the world's gazetteer and the providers' (near the centre of the view), merged by match quality (exact, start, word)
  G.searchAll = async (q, n = 10) => { const out = world.search(q, n), near = viewCentre();
    for (const f of searchProviders) { try { out.push(...((await f(q, n, near)) || [])); } catch (e) { console.warn('globe: search provider', e); } }
    return out.map((r, i) => [r, i]).sort((a, b) => (b[0].score || 0) - (a[0].score || 0) || a[1] - b[1]).map(x => x[0]).slice(0, n); };
  G.hasProviders = () => searchProviders.length > 0;
  function viewCentre() { if (G.mode === 'globe' || !MF) return [orbit.lon, orbit.lat]; const c = H.camState(), g = ecefToGeodetic(...modelToEcef([c.tx, c.ty, c.tz])); return [g.lon, g.lat]; }
  // the providers' answer for a point, cached by 0.001 degree (the readout asks often)
  let whereKey = '', whereVal = null, whereP = null;
  G.whereCached = (lon, lat) => { const k = lon.toFixed(3) + ',' + lat.toFixed(3); if (k !== whereKey && !whereP) { whereKey = k; whereP = G.whereMore(lon, lat).then(v => { whereVal = v; whereP = null; G.dirty = true; }).catch(() => { whereP = null; }); } return whereVal; };
  G.whereMore = async (lon, lat) => { const out = {}; for (const f of whereProviders) { try { Object.assign(out, await f(lon, lat)); } catch (e) { console.warn('globe: where provider', e); } } return out; };

  // ---------- start: ?view=globe opens on the planet (over the region); every other link starts in the model as before
  if (qs.get('view') === 'globe') G.ensure().then(() => enterGlobe({ lon: REGION.origin.lon, lat: REGION.origin.lat, range: worldRange(), heading: 0, tilt: 0 })).catch(() => {});
  G.enterGlobe = o => G.ensure().then(() => enterGlobe(o));
  G.enterModel = () => enterModel(orbit);
  G.leave = () => { flight = null; setMode('model'); };   // the caller sets the model camera (main.js setView)
  G.modelToEcef = modelToEcef; G.ecefToModel = ecefToModel;
  G.inBox = inBox; G.modelOrbit = modelOrbit; G.orbitCam = orbitCam; G.world_ = world; G.layers = layers; G.labels = () => labels; G.sampler = () => sampler; G.frameState = F; G.pick = pick; G.project = project;
  G.lang = lang;
  // places built as 3D Tiles (cwplans/tools/build-place-tiles.mjs; globe/places.js): loaded near the eye
  G.cull = { inFrustum, K: () => innerHeight / (2 * Math.tan(gcam.fov * D2R / 2)), renderer, camera: gcam };   // places.js: frustum and screen-space error of its tiles
  G.U = U; G.placesReady = import('./places.js').then(m => m.attachPlaces(G, H, { scene, U })).catch(e => { console.warn('globe: places', e); return []; });
  return G;
}
