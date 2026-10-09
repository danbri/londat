// WebXR headset mode of the Three.js port (layer "xr", layers/xr.js): a port of the WebGL page's xr-layer.js
// (https://danbri.github.io/londat/cwplans/docklands/?xr=preview&go). The city as a table model (1:1500, relief 2.5x) or at
// street level (1:1), panels round you (Places in view, What's on in view, a Focus card, the control bar), controller and
// hand rays, one-hand grab, two-hand pinch (turn and size), passthrough (immersive-ar), and the one-eye preview for screens
// with no WebXR (?xr=preview, ?xr=preview&go starts it). Headset sessions run on the WebGL 2 backend: on a WebGPU page the
// headset button reloads the page with ?webgl&xr=1 and asks for one more tap.
// The model is NOT moved: the scene stays in model metres (the TSL graphs read positionWorld for the water depth, the
// window grid and the cut-away), and the eye camera is a child of a rig whose matrix is W^-1, W = T(O) Ry(yaw) S(s, s r, s)
// T(-c) (reference space <- model). The view of each eye is then pose^-1 W, the same as a scaled scene group.
// Panels, labels and rays are children of the rig in reference-space metres. main.js calls ctx.xrFrame from its animation
// loop while a session or the preview runs. Skill: docklands-3d-page, "WebXR" and "Three.js port".
import * as THREE from 'three/webgpu';
import { geoOf, inBoxOf, RMesh } from './overlay-kit.js';

// ---------- 4x4 column-major matrices (xr-layer.js)
const M = {
  mul(a, b) { const o = new Float32Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  T(x, y, z) { const o = M.I(); o[12] = x; o[13] = y; o[14] = z; return o; },
  I() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  Ry(a) { const o = M.I(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
  S(x, y = x, z = x) { const o = M.I(); o[0] = x; o[5] = y; o[10] = z; return o; },
  ap(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; },
  dir(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]]; },
  persp(fy, a, n, f) { const t = 1 / Math.tan(fy / 2), o = new Float32Array(16); o[0] = t / a; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mulv = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const DEG = Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = id => document.getElementById(id);

let C = null, THREEr = null;
const XR = { active: false };

// ---------- state (xr-layer.js S; no drone, ride or photo here)
const S = {
  session: null, ref: null, preview: false, ar: false, mode: 'table', s: 1 / 1500, c: [0, 0, 0], O: [0, .78, -1], yaw: 0, lift: 0, floorY: 0,
  W: M.I(), Wi: M.I(), head: [0, 1.6, 0], headF: [0, 0, -1], placed: false, base: { a: 0, p: [0, 1.6, 0] },
  cats: new Set(), openNow: false, win: 7, works: false, focus: null, lead: null, hover: new Map(), press: new Map(), lastRay: new Map(), two: null, sky: true, view: -1, btn: new Map(), hidePanels: false, pads: false, relief: 2.5,
  data: null, loading: null, inView: { cats: {}, events: [], works: [], markets: [] }, listT: 0, hiDirty: true, labels: [], panels: [], saved: null,
};
// relief: the vertical exaggeration of the table (2.5x by default; the bar's Relief button: 1, 1.5, 2.5, 4); street is 1.
// Owner, 2026-10-08 (WebGL page): "in Quest3 city still looks flat".
const RELIEFS = [1, 1.5, 2.5, 4];
const reliefNow = () => S.mode === 'table' ? S.relief : 1;
function setW() {
  const s = S.s, r = reliefNow(), c = S.c, O = S.mode === 'street' ? [S.O[0], S.floorY - S.lift, S.O[2]] : S.O;
  S.W = M.mul(M.T(...O), M.mul(M.Ry(S.yaw), M.mul(M.S(s, s * r, s), M.T(-c[0], -c[1], -c[2]))));
  S.Wi = M.mul(M.T(...c), M.mul(M.S(1 / s, 1 / (s * r), 1 / s), M.mul(M.Ry(-S.yaw), M.T(-O[0], -O[1], -O[2]))));
}
function applyRelief() { if (S.mode === 'table') S.c = [S.c[0], groundY(S.c[0], S.c[2]), S.c[2]]; S.hiDirty = true; }
const toUser = (x, y, z) => M.ap(S.W, [x, y, z]);
const groundY = (x, z) => C.groundAt(x, z);

// ---------- data: places by category, events, markets, works (model metres; xr-layer.js loadData)
const CAT_LABEL = { finance: 'Finance', shop: 'Shops', catering: 'Food and drink', leisure: 'Leisure', entertainment: 'Entertainment', bar: 'Pubs and bars',
  education: 'Education', health: 'Health', sport: 'Sport', arts: 'Arts', charity: 'Charities', venues: 'Cultural venues' };
const GLOW = { finance: [1, .19, .19], shop: [.72, 1, .18], catering: [1, .63, .25], leisure: [.36, 1, .48], entertainment: [1, .31, .85], bar: [1, .83, 0], education: [1, .95, .42], health: [.97, .97, 1], sport: [.85, .6, .35], arts: [.7, .42, 1], charity: [.45, 1, .85], venues: [.4, .82, 1] };
const colOf = k => GLOW[k] || [.8, .8, .8];
const hex = c => '#' + c.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
const EVENT_SRC = new Set(['venue-events', 'planning', 'th-licences']), WORK_SRC = new Set(['street-manager', 'street-manager-activities', 'tfl-road', 'tfl-bus']);
let geo = null, inBox = null, CW = '';
const topOf = i => { const b = C.A.buildings[i]; return b ? b.b + b.h : null; };
async function loadData() {
  if (S.data) return S.data; if (S.loading) return S.loading;
  S.loading = (async () => {
    const j = p => C.loadJSON(CW + p);
    const R = C.registry, AT = R ? await R.ready : null;
    const [pois, venues, works] = await Promise.all([j('registry/model-box-pois.json').catch(() => null), j('feeds/london-datastore/cultural-infrastructure/cultural-infrastructure.geojson').catch(() => null), j('feeds/works/works.json').catch(() => null)]);
    const places = [];
    if (AT) AT.buildings.forEach((b, k) => { if (!b.cat) return; const t = b.mi && b.mi.length ? Math.max(...b.mi.map(topOf).filter(v => v != null)) : null;
      for (const [cat, n] of Object.entries(b.cat)) places.push({ src: 'registry', k, id: b.id, name: b.n || `${CAT_LABEL[cat === 'alcohol' ? 'bar' : cat] || cat} (${n})`, cat: cat === 'alcohol' ? 'bar' : cat, n, x: b.x, z: b.z, top: t ?? C.groundAt(b.x, b.z) + 10 }); });
    if (pois) for (const p of pois.pois) { if (p.in_registry_box) continue; const [x, z] = geo(p.lon, p.lat); if (!inBox(x, z, 0)) continue;
      const cl = Object.keys(p.classes)[0], what = Object.values(p.classes)[0].split('=').pop().replace(/_/g, ' ');
      places.push({ src: 'osm', osm: p.osm, name: p.name || what, cat: cl === 'alcohol' ? 'bar' : cl, n: 1, x, z, top: C.groundAt(x, z) + 9 }); }
    if (venues) for (const f of venues.features) { const g = f.geometry && f.geometry.coordinates; if (!g) continue; const [x, z] = geo(g[0], g[1]); if (!inBox(x, z, 0)) continue;
      places.push({ src: 'gla', name: f.properties.name, kind: String(f.properties.layer || '').replace(/^cultural_venues_CIM 2023 /, ''), cat: 'venues', n: 1, x, z, top: C.groundAt(x, z) + 9 }); }
    const events = [], markets = [], worksL = [];
    if (works) for (const it of works.items) { if (it.lat == null || it.lon == null) continue; const [x, z] = geo(it.lon, it.lat); if (!inBox(x, z, 0)) continue;
      const base = { id: it.id, title: it.title, where: it.location || it.venue || it.street || '', x, z, url: it.url, src: it.source, kind: it.kind };
      if (it.source === 'markets') markets.push({ ...base, hours: it.opening_hours || it.recurring });
      else if (EVENT_SRC.has(it.source)) events.push({ ...base, t0: it.start ? Date.parse(it.start.length === 10 ? it.start + 'T00:00:00Z' : it.start) : null, allDay: !!it.start && it.start.length === 10, t1: it.end ? Date.parse(it.end) : null });
      else if (WORK_SRC.has(it.source)) worksL.push({ ...base, t0: it.start ? Date.parse(it.start) : null, t1: it.end ? Date.parse(it.end) : null }); }
    const totals = {}; for (const p of places) totals[p.cat] = (totals[p.cat] || 0) + 1;
    S.data = { places, events, markets, works: worksL, totals, fetched: works && works.meta ? (works.meta.built || works.meta.fetched || '') : '' };
    S.hiDirty = true; dirtyAll(); return S.data;
  })();
  return S.loading;
}
// open now: the registry occupants of a building in a category (categories.json names -> buildings.json hours, as the card)
let OPEN = null;
const ohOf = o => o.web && o.web.opening_hours && o.web.scope !== 'chain' ? { h: o.web.opening_hours } : o.opening_hours ? { h: o.opening_hours } : o.web && o.web.opening_hours ? { h: o.web.opening_hours } : null;
async function loadOpen() {
  if (OPEN) return OPEN; const [reg, cats] = await Promise.all([C.loadJSON(CW + 'registry/buildings.json'), C.loadJSON(CW + 'registry/categories.json')]);
  OPEN = { reg: new Map(reg.buildings.map(b => [b.id, b])), cats, cache: new Map() }; return OPEN;
}
function openIn(p) {
  if (!OPEN || p.src !== 'registry') return null; const key = p.id + '|' + p.cat; if (OPEN.cache.has(key)) return OPEN.cache.get(key);
  const b = OPEN.reg.get(p.id), names = new Set(((OPEN.cats.buildings[p.id] || {})[p.cat] || []).map(e => e.name)); let st = null;
  if (b && globalThis.OpeningHours) for (const o of b.occupants || []) { if (!names.has(o.name)) continue; const h = ohOf(o); if (!h) continue; const s = OpeningHours.openState(h.h, new Date(now())); if (!s) continue; st = st || s.open; if (s.open) break; }
  OPEN.cache.set(key, st); return st;
}
const now = () => C.clock || Date.now();

// ---------- in view: horizontal angle from the head's forward direction (and a range at street level)
function viewTest(x, z, y) {
  const p = toUser(x, y, z), d = sub(p, S.head), dh = Math.hypot(d[0], d[2]); if (dh < 1e-6) return null;
  const f = S.headF, fh = Math.hypot(f[0], f[2]) || 1, ca = (d[0] * f[0] + d[2] * f[2]) / (dh * fh), side = (f[0] * d[2] - f[2] * d[0]) / (dh * fh);
  const ang = Math.atan2(side, ca), md = len(sub(M.ap(S.Wi, S.head), [x, y, z]));
  return { ok: Math.abs(ang) < 52 * DEG && (S.mode === 'table' ? true : md < 4500), ang, p, dist: S.mode === 'street' ? md : Math.hypot(x - S.c[0], z - S.c[2]) };
}
const arrow = a => a < -60 * DEG ? '←' : a < -20 * DEG ? '↖' : a <= 20 * DEG ? '↑' : a <= 60 * DEG ? '↗' : '→';
const km = m => m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
const fmtT = (t, allDay) => { const d = new Date(t), o = { timeZone: 'Europe/London' }; const day = d.toLocaleDateString('en-GB', { ...o, weekday: 'short', day: 'numeric', month: 'short' }); return allDay ? day : day + ' ' + d.toLocaleTimeString('en-GB', { ...o, hour: '2-digit', minute: '2-digit' }); };
function nextOpen(h) {
  if (!globalThis.OpeningHours || !h) return null; const t = now();
  for (let k = 0; k < 8; k++) { const d = new Date(k ? Math.floor(t / 864e5) * 864e5 + k * 864e5 + 60e3 : t), s = OpeningHours.openState(h, d); if (!s) return null;
    if (s.open) return { open: !k, label: k ? fmtT(d.getTime(), true) : 'open now' + (s.until ? ' to ' + s.until : '') };
    if (s.from) return { open: false, label: (k ? fmtT(d.getTime(), true) : 'today') + ' ' + s.from }; }
  return null;
}
function updateLists() {
  const D = S.data; if (!D) return; const t = now(), end = t + S.win * 864e5, todayEnd = (() => { const d = new Date(t); d.setHours(23, 59, 59, 999); return d.getTime(); })(), until = S.win === 1 ? todayEnd : end;
  const cats = {}; for (const k of Object.keys(CAT_LABEL)) cats[k] = 0;
  for (const p of D.places) { const v = viewTest(p.x, p.z, p.top); p.v = v; if (v && v.ok) cats[p.cat] = (cats[p.cat] || 0) + 1; }
  const ev = []; for (const e of D.events) { if (e.t0 == null || e.t0 > until || (e.t1 ? e.t1 : e.t0 + (e.allDay ? 864e5 : 3 * 3600e3)) < t) continue; const v = viewTest(e.x, e.z, C.groundAt(e.x, e.z)); if (v && v.ok) ev.push({ ...e, v }); }
  ev.sort((a, b) => a.t0 - b.t0);
  const mk = []; for (const m of D.markets) { const v = viewTest(m.x, m.z, C.groundAt(m.x, m.z)); if (v && v.ok) mk.push({ ...m, v, next: nextOpen(m.hours) }); }
  const wk = []; for (const w of D.works) { if ((w.t0 && w.t0 > t) || (w.t1 && w.t1 < t)) continue; const v = viewTest(w.x, w.z, C.groundAt(w.x, w.z)); if (v && v.ok) wk.push({ ...w, v }); }
  wk.sort((a, b) => a.v.dist - b.v.dist);
  const sig = JSON.stringify([cats, ev.slice(0, 9).map(e => e.id + e.v.ang.toFixed(1)), mk.length, wk.length, S.win]);
  S.inView = { cats, events: ev, markets: mk, works: wk };
  if (sig !== S.listSig) { S.listSig = sig; P.places.dirty = P.whatson.dirty = true; S.hiDirty = true; }
}

// ---------- three.js objects: the rig (W^-1) with the eye camera and the reference-space UI; the beacons in model space
let rig = null, eyeCam = null, prevCam = null, ui = null, beacons = null, beaconMat = null, labMesh = null, rayLines = null, dots = [];
function makeObjects() {
  rig = new THREE.Group(); rig.name = 'xr-rig'; rig.matrixAutoUpdate = false;
  eyeCam = new THREE.PerspectiveCamera(80, 1, .08, 60); eyeCam.matrixAutoUpdate = false; rig.add(eyeCam);
  prevCam = new THREE.PerspectiveCamera(66, 1, .08, 60); prevCam.matrixAutoUpdate = false; prevCam.matrixWorldAutoUpdate = false;
  ui = new THREE.Group(); ui.name = 'xr-ui'; rig.add(ui);
  beaconMat = new THREE.MeshBasicNodeMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  // r186: a mesh first drawn with an empty geometry is never drawn again, so the beacons start with one small triangle and hide
  const bm = new RMesh(); bm.tri(bm.v(0, -1e4, 0, [0, 0, 0]), bm.v(1, -1e4, 0, [0, 0, 0]), bm.v(0, -1e4, 1, [0, 0, 0]));
  beacons = new THREE.Mesh(bm.geometry(), beaconMat); beacons.visible = false; beacons.frustumCulled = false; beacons.name = 'xr-beacons';
  // labels: one atlas canvas (2 x 32 slots of 1024 x 64 px), up to 64 billboards facing the head
  LAB.cv = document.createElement('canvas'); LAB.cv.width = 2048; LAB.cv.height = 2048;
  LAB.tex = new THREE.CanvasTexture(LAB.cv); LAB.tex.flipY = false; LAB.tex.colorSpace = THREE.SRGBColorSpace;
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(64 * 18), 3).setUsage(THREE.DynamicDrawUsage)); lg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(64 * 12), 2).setUsage(THREE.DynamicDrawUsage));
  labMesh = new THREE.Mesh(lg, new THREE.MeshBasicNodeMaterial({ map: LAB.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  labMesh.frustumCulled = false; labMesh.renderOrder = 5; ui.add(labMesh);
  // rays and the leader line: 3 segments; the ray ends: a small sphere each
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6 * 3), 3).setUsage(THREE.DynamicDrawUsage)); rg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(6 * 4), 4).setUsage(THREE.DynamicDrawUsage));
  rayLines = new THREE.LineSegments(rg, new THREE.LineBasicNodeMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  rayLines.frustumCulled = false; rayLines.renderOrder = 7; ui.add(rayLines);
  for (let k = 0; k < 2; k++) { const d = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshBasicNodeMaterial({ color: 0xffffff, transparent: true, opacity: .9, depthTest: false, fog: false, toneMapped: false })); d.renderOrder = 8; d.visible = false; ui.add(d); dots.push(d); }
}
function syncRig() { rig.matrix.fromArray(S.Wi); rig.matrixWorldNeedsUpdate = true; rig.updateMatrixWorld(true); }

// ---------- beacons (model space): lit categories, events in view, markets, works, the focus (xr-layer.js buildHighlights)
function buildHighlights() {
  S.hiDirty = false; const D = S.data; if (!D) { beacons.visible = false; return; }
  const Mh = new RMesh(), tbl = S.mode === 'table', vz = reliefNow(), wb = tbl ? .0025 / S.s : 1.4, hb = tbl ? .045 / S.s : 45, labels = [];
  const beacon = (x, z, y0, h, w, col) => { const y1 = y0 + h / vz, q = [[x - w, z - w], [x + w, z - w], [x + w, z + w], [x - w, z + w]];
    for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = col.map(v => v * (i % 2 ? .78 : 1)); Mh.tri(Mh.v(a[0], y0, a[1], c), Mh.v(b[0], y0, b[1], c), Mh.v(b[0], y1, b[1], c)); Mh.tri(Mh.v(a[0], y0, a[1], c), Mh.v(b[0], y1, b[1], c), Mh.v(a[0], y1, a[1], c)); }
    const r = w * 3, ym = y1 + r / vz, top = [x, ym + r / vz, z], bot = [x, ym - r / vz, z], ring = [[x + r, ym, z], [x, ym, z + r], [x - r, ym, z], [x, ym, z - r]];
    for (let i = 0; i < 4; i++) { const a = ring[i], b = ring[(i + 1) % 4]; Mh.tri(Mh.v(...a, col), Mh.v(...b, col), Mh.v(...top, col)); const d = col.map(v => v * .7); Mh.tri(Mh.v(...a, d), Mh.v(...b, d), Mh.v(...bot, d)); }
    return ym + 2 * r / vz; };
  const lit = [];
  for (const p of D.places) { if (!S.cats.has(p.cat)) continue; if (S.openNow && openIn(p) !== true) continue; lit.push(p); }
  for (const p of lit) p.yl = beacon(p.x, p.z, p.top, hb, wb, colOf(p.cat));
  const nearest = lit.filter(p => p.v && p.v.ok).sort((a, b) => a.v.dist - b.v.dist).slice(0, 40);
  const f0 = S.focus, seen = new Set(f0 && f0.x != null ? [Math.round(f0.x) + ',' + Math.round(f0.z)] : []);
  const placeLabels = nearest.filter(p => { const k = Math.round(p.x) + ',' + Math.round(p.z); if (seen.has(k) || (f0 && f0.x != null && Math.hypot(p.x - f0.x, p.z - f0.z) < 25)) return false; seen.add(k); return true; }).map(p => ({ x: p.x, z: p.z, y: p.yl, text: p.name, col: colOf(p.cat) }));
  const venues = new Map(); for (const e of S.inView.events) { const k = Math.round(e.x / 30) + ',' + Math.round(e.z / 30); if (!venues.has(k)) venues.set(k, e); }
  for (const e of venues.values()) { const yt = beacon(e.x, e.z, C.groundAt(e.x, e.z) + (tbl ? 30 : 8), hb * 1.5, wb * 1.3, [1, .84, .3]); labels.push({ x: e.x, z: e.z, y: yt, text: `${fmtT(e.t0, e.allDay)} · ${e.title}`, col: [1, .84, .3], ev: true }); }
  for (const m of S.inView.markets.slice(0, 8)) { const yt = beacon(m.x, m.z, C.groundAt(m.x, m.z) + 2, hb * .8, wb, [.55, .95, .55]); labels.push({ x: m.x, z: m.z, y: yt, text: m.title.replace(/:.*$/, '') + (m.next ? ' · ' + m.next.label : ''), col: [.55, .95, .55], mk: m.id }); }
  if (S.works) for (const w of S.inView.works.slice(0, 60)) beacon(w.x, w.z, C.groundAt(w.x, w.z), hb * .35, wb * .8, [1, .5, .15]);
  const f = S.focus; if (f && f.x != null) { const yt = beacon(f.x, f.z, (f.top ?? C.groundAt(f.x, f.z)) + 1, hb * 1.8, wb * 1.6, [1, 1, 1]); labels.push({ x: f.x, z: f.z, y: yt, text: f.title, col: [1, 1, 1], focus: true }); }
  if (Mh.n) { beacons.geometry.dispose(); beacons.geometry = Mh.geometry(); beacons.visible = true; } else beacons.visible = false;
  setLabels([...labels.filter(l => l.focus), ...labels.filter(l => !l.focus), ...placeLabels]);
}

// ---------- panels: a canvas each (a CanvasTexture on a plane), drawn when dirty, placed round the user
const PX = 1024, FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
class Panel {
  constructor(key, w, h, place, draw) {
    Object.assign(this, { key, w, h, place, drawFn: draw, dirty: true, hits: [] }); this.cv = document.createElement('canvas'); this.cv.width = PX; this.cv.height = Math.round(PX * h / w);
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicNodeMaterial({ map: this.tex, transparent: true, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    this.mesh.matrixAutoUpdate = false; this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; this.mesh.name = 'xr-panel-' + key;
  }
  // far (base.far): the preview on a narrow screen sets the panels back (same directions, smaller angles)
  layout(base) {
    const [a, r0, dy0, tilt] = this.place, A = base.a + a * DEG, k = base.far || 1, r = r0 * k, dy = dy0 * k;
    this.c = [base.p[0] + r * Math.sin(A), base.p[1] + dy, base.p[2] - r * Math.cos(A)]; this.orient(A, tilt);
  }
  orient(A, tilt) {
    const n = [-Math.sin(A), 0, Math.cos(A)], R = [Math.cos(A), 0, Math.sin(A)], U = [0, 1, 0], t = (tilt || 0) * DEG;
    this.n = nrm(add(mulv(n, Math.cos(t)), mulv(U, Math.sin(t)))); this.R = R; this.U = nrm(sub(mulv(U, Math.cos(t)), mulv(n, Math.sin(t)))); this.sync();
  }
  sync() { if (!this.c) return; const v = (a) => new THREE.Vector3(...a); this.mesh.matrix.makeBasis(v(this.R), v(this.U), v(this.n)).setPosition(...this.c); this.mesh.matrixWorldNeedsUpdate = true; }
  // a dragged panel: its centre where the hand puts it, turned to face the head (same tilt)
  moveTo(c) { this.c = c; this.orient(Math.atan2(c[0] - S.head[0], -(c[2] - S.head[2])), this.place[3]); }
  grabZone(px, py) { return this.key === 'bar' ? px < 70 : py < 125; }
  redraw() { const g = this.cv.getContext('2d'); g.clearRect(0, 0, this.cv.width, this.cv.height); this.hits = []; this.drawFn(g, this); this.tex.needsUpdate = true; this.dirty = false; }
  hit(o, d) {
    const dn = dot(d, this.n); if (Math.abs(dn) < 1e-6 || !this.mesh.visible) return null; const t = dot(sub(this.c, o), this.n) / dn; if (t <= 0) return null;
    const p = add(o, mulv(d, t)), q = sub(p, this.c), x = dot(q, this.R), y = dot(q, this.U);
    if (Math.abs(x) > this.w / 2 || Math.abs(y) > this.h / 2) return null; const px = (x / this.w + .5) * this.cv.width, py = (.5 - y / this.h) * this.cv.height;
    return { t, p, px, py, item: this.hits.find(h => px >= h[0] && px <= h[2] && py >= h[1] && py <= h[3]) || null };
  }
  btn(g, x, y, w, h, text, on, act, col) {
    g.fillStyle = on ? (col || '#2f6fdf') : 'rgba(255,255,255,.09)'; rr(g, x, y, w, h, h / 2.6); g.fill(); if (this.hov === act) { g.strokeStyle = '#fff'; g.lineWidth = 3; rr(g, x, y, w, h, h / 2.6); g.stroke(); }
    g.fillStyle = '#eef2f6'; let fs = Math.round(h * .42); g.font = `600 ${fs}px ${FONT}`; while (fs > 14 && g.measureText(text).width > w - 18) { fs -= 2; g.font = `600 ${fs}px ${FONT}`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x + w / 2, y + h / 2 + 1); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; this.hits.push([x, y, x + w, y + h, act]);
  }
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function frame(g, pn, title, sub_) {
  const W = pn.cv.width, H = pn.cv.height; g.fillStyle = 'rgba(13,16,21,.88)'; rr(g, 0, 0, W, H, 34); g.fill(); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 3; rr(g, 1.5, 1.5, W - 3, H - 3, 33); g.stroke();
  g.fillStyle = '#f2f5f8'; g.font = `700 50px ${FONT}`; g.fillText(title, 40, 74); if (sub_) { g.fillStyle = '#9aa4ae'; g.font = `400 28px ${FONT}`; g.fillText(sub_, 40, 114); }
}
function clip(g, s, w) { s = String(s ?? ''); if (g.measureText(s).width <= w) return s; let a = 0, b = s.length; while (a < b) { const m = (a + b + 1) >> 1; if (g.measureText(s.slice(0, m) + '…').width <= w) a = m; else b = m - 1; } return s.slice(0, a) + '…'; }
const P = {};
const VIEWS = [['cw', 'Canary Wharf'], ['rotherhithe', 'Rotherhithe'], ['greenland', 'Greenland'], ['pier', 'Pier'], ['area', 'Area']];
const lookOn = () => !!($('look') && $('look').checked);
function makePanels() {
  P.places = new Panel('places', .62, .9, [-62, 1.2, -.1, 0], (g, pn) => {
    frame(g, pn, 'Places in view', S.data ? 'Tap a category: beacons light its buildings' : 'Loading places…');
    pn.btn(g, 40, 140, 300, 64, S.openNow ? '● Open now' : '○ Open now', S.openNow, 'open', '#1f8f55'); pn.btn(g, 360, 140, 300, 64, 'All off', false, 'catsoff');
    g.fillStyle = '#9aa4ae'; g.font = `400 24px ${FONT}`; g.fillText(S.openNow ? 'Hours: Canary Wharf registry only' : 'in view / in the model', 690, 182);
    let y = 240;
    for (const k of Object.keys(CAT_LABEL)) { const on = S.cats.has(k), n = S.inView.cats[k] || 0, tot = S.data ? S.data.totals[k] || 0 : 0, col = hex(colOf(k)), h = 88;
      g.fillStyle = on ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.035)'; rr(g, 30, y, PX - 60, h - 10, 20); g.fill();
      if (pn.hov === 'cat:' + k) { g.strokeStyle = '#fff'; g.lineWidth = 3; rr(g, 30, y, PX - 60, h - 10, 20); g.stroke(); }
      g.fillStyle = col; g.beginPath(); g.arc(80, y + (h - 10) / 2, on ? 22 : 15, 0, 7); g.fill(); if (!on) { g.fillStyle = 'rgba(13,16,21,.88)'; g.beginPath(); g.arc(80, y + (h - 10) / 2, 9, 0, 7); g.fill(); }
      g.fillStyle = on ? '#fff' : '#d5dbe1'; g.font = `${on ? 700 : 500} 38px ${FONT}`; g.fillText(CAT_LABEL[k], 125, y + 52);
      g.textAlign = 'right'; g.font = `600 36px ${FONT}`; g.fillStyle = n ? '#fff' : '#6c7680'; g.fillText(String(n), PX - 190, y + 52); g.font = `400 26px ${FONT}`; g.fillStyle = '#7f8993'; g.fillText('/ ' + tot, PX - 60, y + 52); g.textAlign = 'left';
      const bw = tot ? Math.max(4, (PX - 260) * Math.min(1, n / Math.max(1, Math.max(...Object.values(S.inView.cats))))) : 0; g.fillStyle = col; g.globalAlpha = .55; g.fillRect(125, y + 64, bw, 6); g.globalAlpha = 1;
      pn.hits.push([30, y, PX - 30, y + h - 10, 'cat:' + k]); y += h; }
    g.fillStyle = '#7f8993'; g.font = `400 22px ${FONT}`;
    ['Canary Wharf: registry occupants by category (OSM, FSA, CWG directory).', 'Elsewhere: OSM points (bars, sport, health, education, arts) and', 'GLA Cultural Infrastructure Map venues. © OpenStreetMap contributors.'].forEach((s, i) => g.fillText(s, 40, y + 30 + i * 30));
  });
  P.whatson = new Panel('whatson', .62, .9, [62, 1.2, -.1, 0], (g, pn) => {
    frame(g, pn, "What's on in view", S.data ? `${S.inView.events.length} events · ${S.inView.markets.length} markets · ${S.inView.works.length} works now` : 'Loading listings…');
    [[1, 'Today'], [7, '7 days'], [30, '30 days']].forEach(([d, t], i) => pn.btn(g, 40 + i * 200, 140, 184, 64, t, S.win === d, 'win:' + d));
    pn.btn(g, 660, 140, 324, 64, S.works ? '● Roadworks' : '○ Roadworks', S.works, 'works', '#c76a1c');
    let y = 236; const ev = S.inView.events.slice(0, 8);
    if (!ev.length) { g.fillStyle = '#9aa4ae'; g.font = `400 32px ${FONT}`; g.fillText(S.data ? 'No dated events in view in this window.' : '', 44, y + 50); g.font = `400 26px ${FONT}`; g.fillText(S.data ? 'Turn round, or choose 30 days.' : '', 44, y + 92); y += 140; }
    for (const e of ev) { const h = 96, sel = S.focus && S.focus.kind === 'event' && S.focus.id === e.id;
      g.fillStyle = sel ? 'rgba(255,214,80,.20)' : 'rgba(255,255,255,.04)'; rr(g, 30, y, PX - 60, h - 10, 20); g.fill(); if (pn.hov === 'ev:' + e.id) { g.strokeStyle = '#fff'; g.lineWidth = 3; rr(g, 30, y, PX - 60, h - 10, 20); g.stroke(); }
      g.fillStyle = '#ffd650'; g.font = `700 28px ${FONT}`; g.fillText(fmtT(e.t0, e.allDay), 50, y + 36);
      g.fillStyle = '#9aa4ae'; g.font = `400 26px ${FONT}`; g.textAlign = 'right'; g.fillText(`${arrow(e.v.ang)} ${km(e.v.dist)}`, PX - 50, y + 36); g.textAlign = 'left';
      g.fillStyle = '#f2f5f8'; g.font = `600 32px ${FONT}`; g.fillText(clip(g, e.title, PX - 110), 50, y + 74);
      pn.hits.push([30, y, PX - 30, y + h - 10, 'ev:' + e.id]); y += h; }
    if (S.inView.events.length > ev.length) { g.fillStyle = '#9aa4ae'; g.font = `400 26px ${FONT}`; g.fillText(`and ${S.inView.events.length - ev.length} more in view`, 50, y + 24); y += 40; }
    const mk = S.inView.markets.slice(0, 2); if (mk.length) { g.fillStyle = '#8fe08f'; g.font = `700 28px ${FONT}`; g.fillText('Markets', 44, y + 34); y += 46;
      for (const m of mk) { g.fillStyle = '#dfe5ea'; g.font = `500 28px ${FONT}`; g.fillText(clip(g, `${m.title.replace(/:.*$/, '')} · ${m.next ? m.next.label : m.hours}`, PX - 100), 50, y + 26); pn.hits.push([30, y, PX - 30, y + 38, 'mk:' + m.id]); y += 40; } }
    g.fillStyle = '#7f8993'; g.font = `400 22px ${FONT}`; g.fillText(clip(g, `Listings from venue, council and TfL feeds (feeds/works, ${S.data && S.data.fetched ? 'built ' + S.data.fetched : 'snapshot'}); titles and dates as facts.`, PX - 80), 40, pn.cv.height - 30);
  });
  P.focus = new Panel('focus', .95, .36, [0, 1.55, .38, 0], (g, pn) => {
    const f = S.focus; frame(g, pn, f ? clip(g, f.title, PX - 80) : 'Select something', f ? clip(g, f.sub || '', PX - 80) : 'Point and press (or pinch) at a building, a beacon or a list row');
    if (!f) { g.fillStyle = '#c9d1d9'; g.font = `400 27px ${FONT}`; ['Pinch (or press) on empty space and drag: move the city. Up and down: raise or lower it.', 'Both hands pinched: turn it and change its size.', 'Drag a panel by its title (the bar by its left end) to move it.', 'A short pinch on a row, a label or a building selects it.', 'Controllers: A Table/Street · B Night · X Recentre · Y side panels · sticks move, turn, zoom.'].forEach((s, i) => g.fillText(clip(g, s, PX - 80), 40, 160 + i * 38)); return; }
    let y = 150; g.font = `400 26px ${FONT}`;
    for (const line of (f.lines || []).slice(0, 7)) { g.fillStyle = /^(open|Open)/.test(line) ? '#7dff9b' : '#d5dbe1'; g.fillText(clip(g, line, PX - 300), 40, y); y += 34; }
    if (f.x != null) { pn.btn(g, PX - 250, 140, 210, 62, S.mode === 'street' ? 'Go there' : 'Stand there', false, 'go'); pn.btn(g, PX - 250, 216, 210, 62, 'Centre', false, 'centre'); }
  });
  P.bar = new Panel('bar', .66, .29, [-28, .78, -.3, 22], (g, pn) => {
    const W = pn.cv.width, H = pn.cv.height; g.fillStyle = 'rgba(13,16,21,.92)'; rr(g, 0, 0, W, H, 34); g.fill();
    g.fillStyle = pn.hov === 'grab' ? '#fff' : '#6c7680'; for (let k = 0; k < 6; k++) for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(24 + j * 18, H / 2 - 50 + k * 20, 5, 0, 7); g.fill(); }
    const st = S.mode === 'street', style = globalThis.__docklandsStyles ? globalThis.__docklandsStyles.mode : 'map';
    const rows = [[['Table', S.mode === 'table', 'mode:table'], ['Street', st, 'mode:street'], [st ? 'Lower' : '−', false, 'minus'], [st ? 'Higher' : '+', false, 'plus'], ['⟲', false, 'turnL'], ['⟳', false, 'turnR'], ['Exit', false, 'exit']],
      [['Floor ▲', false, 'floorUp'], ['Floor ▼', false, 'floorDn'], ['Look: ' + (lookOn() ? 'Real' : 'Map'), lookOn(), 'look'], ['Sky: ' + (S.sky ? 'On' : 'Off'), false, 'sky'], [C.night ? 'Day' : 'Night', false, 'night'], ['Recentre', false, 'recentre']],
      [['View: ' + (VIEWS[S.view] ? VIEWS[S.view][1] : '—'), false, 'view'], [S.mode === 'table' ? `Relief ${S.relief}×` : 'Relief 1×', S.mode === 'table' && S.relief > 1, 'relief'], ['Style: ' + ({ map: 'Map', pixel: 'Pixel', lines: 'Lines', vectrex: 'CRT' }[style] || style), style !== 'map', 'style'], [S.hidePanels ? 'Panels: off' : 'Panels: on', !S.hidePanels, 'panels']]];
    const x0 = 64, bh = (H - 56) / 3; rows.forEach((row, r) => { const bw = (W - x0 - 14) / row.length; row.forEach(([t, on, a], i) => pn.btn(g, x0 + i * bw + 4, 14 + r * (bh + 14), bw - 8, bh, t, on, a, a === 'exit' ? '#9c2b2b' : null)); });
    pn.hits.push([0, 0, 60, H, 'grab']);
  });
  S.panels = [P.places, P.whatson, P.focus, P.bar];
  for (const p of S.panels) ui.add(p.mesh);
}
const dirtyAll = () => { for (const p of S.panels) p.dirty = true; };
const sidePanel = p => p === P.places || p === P.whatson;

// ---------- labels: billboards facing the head (xr-layer.js setLabels, labelVerts)
const LAB = { cv: null, tex: null, items: [] };
function setLabels(list) {
  const g = LAB.cv.getContext('2d'); g.clearRect(0, 0, 2048, 2048); LAB.items = [];
  list.slice(0, 64).forEach((l, i) => { const sx = (i % 2) * 1024, sy = (i >> 1) * 64; g.font = `${l.focus || l.ev ? 700 : 600} 40px ${FONT}`; const t = clip(g, l.text, 960), w = Math.min(1016, g.measureText(t).width + 40);
    g.fillStyle = 'rgba(10,12,16,.82)'; rr(g, sx + 2, sy + 4, w, 56, 18); g.fill(); g.fillStyle = hex(l.col); g.fillRect(sx + 10, sy + 16, 8, 32); g.fillStyle = '#fff'; g.fillText(t, sx + 28, sy + 46);
    LAB.items.push({ ...l, u0: sx / 2048, v0: sy / 2048, u1: (sx + w + 4) / 2048, v1: (sy + 64) / 2048, aspect: (w + 4) / 64 }); });
  LAB.tex.needsUpdate = true;
}
// greedy in list order (focus, events, markets, then the nearest places): a label whose angular box overlaps a placed one is left out
function labelVerts() {
  const pos = labMesh.geometry.attributes.position, uv = labMesh.geometry.attributes.uv, placed = [], f = S.headF, fy = Math.atan2(f[0], -f[2]); let n = 0;
  for (const l of LAB.items) { const p = toUser(l.x, l.y, l.z), d = sub(S.head, p), dist = len(d); if (dist < .05) continue;
    const q = mulv(d, -1), az = Math.atan2(q[0], -q[2]) - fy, el = Math.atan2(q[1], Math.hypot(q[0], q[2])), ah = clamp(dist * .024, .006, 60) / dist, aw = ah * l.aspect;
    const box = [az - aw / 2, el, az + aw / 2, el + ah * 1.1]; if (!l.focus && placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue; placed.push(box);
    const h = clamp(dist * .024, .006, 60), w = h * l.aspect, r = nrm([d[2], 0, -d[0]]), up = [0, 1, 0], b = add(p, mulv(up, h * .25)), R = mulv(r, w / 2), U = mulv(up, h);
    const bl = sub(b, R), br = add(b, R), tl = add(bl, U), tr = add(br, U);
    const V = [[tl, l.u0, l.v0], [bl, l.u0, l.v1], [br, l.u1, l.v1], [tl, l.u0, l.v0], [br, l.u1, l.v1], [tr, l.u1, l.v0]];
    for (const [pp, u, v] of V) { pos.setXYZ(n, ...pp); uv.setXY(n, u, v); n++; } }
  pos.needsUpdate = uv.needsUpdate = true; labMesh.geometry.setDrawRange(0, n); labMesh.visible = n > 0;
}

// ---------- the reference-space overlay of a frame: rays, the leader line, the ray ends
function overlay() {
  const pos = rayLines.geometry.attributes.position, col = rayLines.geometry.attributes.color; let n = 0;
  const seg = (a, b, ca, cb) => { if (n >= 6) return; pos.setXYZ(n, ...a); col.setXYZW(n, ...ca); n++; pos.setXYZ(n, ...b); col.setXYZW(n, ...cb); n++; };
  let k = 0; for (const d of dots) d.visible = false;
  for (const [, h] of S.hover) { const e = add(h.o, mulv(h.d, h.len)); seg(h.o, e, [1, 1, 1, .2], [1, 1, 1, .9]); const dm = dots[k++]; if (dm) { dm.visible = true; dm.position.set(...e); dm.scale.setScalar(.006 + h.len * .004); } }
  if (S.lead) seg(S.lead.a, toUser(S.lead.x, S.lead.y, S.lead.z), [1, .84, .3, .95], [1, .84, .3, .95]);
  pos.needsUpdate = col.needsUpdate = true; rayLines.geometry.setDrawRange(0, n); rayLines.visible = n > 0;
  for (const p of S.panels) p.mesh.visible = !(S.hidePanels && sidePanel(p));
}

// ---------- input: rays from controllers, hands and gaze-and-pinch; select acts, squeeze grabs the table
function rayOf(fr, src) { const p = fr.getPose(src.targetRaySpace, S.ref); if (!p) return null; const m = p.transform.matrix; return { o: [m[12], m[13], m[14]], d: nrm([-m[8], -m[9], -m[10]]) }; }
function hitPanels(o, d) { let best = null; for (const p of S.panels) { if (S.hidePanels && sidePanel(p)) continue; const h = p.hit(o, d); if (h && (!best || h.t < best.h.t)) best = { p, h }; } return best; }
const ray = new THREE.Raycaster();
// the building under a model-space ray (main.js pickHit: building tiles and detailed models)
function pickRay(o, d) {
  ray.set(new THREE.Vector3(...o), new THREE.Vector3(...d)); ray.far = 40000;
  const hit = ray.intersectObjects([...C.meshes.buildings.children, ...C.meshes.models.children], true).find(h => C.U.cut.value >= 250 || h.point.y <= C.U.cut.value); if (!hit) return -1;
  let ob = hit.object; while (ob && ob.userData.model == null && ob.parent) ob = ob.parent;
  return ob && ob.userData.model != null ? ob.userData.model : hit.object.geometry.userData.bi ? hit.object.geometry.userData.bi[hit.face.a] : -1;
}
function click(r) {
  const hp = hitPanels(r.o, r.d);
  if (hp) { if (hp.h.item) act(hp.h.item[4], hp.p); return; }
  const mo = M.ap(S.Wi, r.o), md = nrm(M.dir(S.Wi, r.d));
  const near = nearestMarker(r.o, r.d); if (near) { if (near.kind !== 'building') focusOn(near); return; }
  const i = pickRay(mo, md); if (i >= 0) return focusBuilding(i);
  const g = groundHit(mo, md); if (g) { if (S.mode === 'table') { S.c = [g[0], groundY(g[0], g[2]), g[2]]; setW(); S.hiDirty = true; } else teleport(g[0], g[2]); }
}
// a label within a small angle of the ray (the labels are the targets you see)
function nearestMarker(o, d) {
  let best = null; for (const l of LAB.items) { const p = toUser(l.x, l.y, l.z), q = sub(p, o), t = dot(q, d); if (t <= 0) continue; const off = len(sub(q, mulv(d, t))) / t; if (off < .045 && (!best || off < best.off)) best = { off, l }; }
  if (!best) return null; const l = best.l; if (l.focus) return null;
  if (l.mk) { const m = S.inView.markets.find(m => m.id === l.mk); if (m) return marketFocus(m); }
  if (l.ev) { const e = S.inView.events.find(e => Math.abs(e.x - l.x) < 1 && Math.abs(e.z - l.z) < 1); if (e) return eventFocus(e); }
  const p = S.data.places.find(p => p.x === l.x && p.z === l.z); return p ? placeFocus(p) : null;
}
function groundHit(o, d) { if (d[1] >= 0) return null; let t = 0, step = S.mode === 'table' ? 4 : 2; for (let k = 0; k < 6000; k++) { t += step; const p = add(o, mulv(d, t)); if (p[1] <= groundY(p[0], p[2])) return p; if (t > 30000) break; step *= 1.004; } return null; }
function teleport(x, z, face) {
  S.c = [x, groundY(x, z), z]; S.O = [S.head[0], 0, S.head[2]];
  // a bearing turns by -yaw: face the target
  if (face) { const a = Math.atan2(S.headF[0], -S.headF[2]), pm = Math.atan2(face[0] - x, -(face[1] - z)); S.yaw = pm - a; }
  setW(); S.hiDirty = true; S.listSig = '';
}
// open ground near a point: the first spot on rings of 15 m steps that no model building outline holds
function freeSpot(x, z) {
  const near = []; for (const b of C.A.buildings) { const p = b.p; if (Math.abs(p[0] / 10 - x) < 400 && Math.abs(p[1] / 10 - z) < 400) near.push(C.dec(p)); }
  const inside = (px, pz) => near.some(f => { let c = false; for (let k = 0, j = f.length / 2 - 1; k < f.length / 2; j = k++) { const ax = f[2 * k], az = f[2 * k + 1], bx = f[2 * j], bz = f[2 * j + 1]; if ((az > pz) !== (bz > pz) && px < (bx - ax) * (pz - az) / (bz - az) + ax) c = !c; } return c; });
  for (let r = 18; r < 260; r += 15) for (let k = 0; k < 16; k++) { const a = k / 16 * 2 * Math.PI + r, px = x + r * Math.sin(a), pz = z + r * Math.cos(a); if (!inside(px, pz) && !inside(px + 3, pz) && !inside(px - 3, pz) && !inside(px, pz + 3) && !inside(px, pz - 3)) return [px, pz]; }
  return [x + 30, z + 30];
}
const D3 = () => globalThis.__docklands3;
function act(a, pn = P.bar) {
  const [k, v] = a.split(':');
  if (k === 'cat') { S.cats.has(v) ? S.cats.delete(v) : S.cats.add(v); S.hiDirty = true; pn.dirty = true; }
  else if (a === 'catsoff') { S.cats.clear(); S.hiDirty = true; pn.dirty = true; }
  else if (a === 'open') { S.openNow = !S.openNow; pn.dirty = true; loadOpen().then(() => { if (OPEN) OPEN.cache.clear(); S.hiDirty = true; pn.dirty = true; }).catch(e => console.warn('xr: opening hours', e)); }
  else if (k === 'win') { S.win = +v; S.listSig = ''; updateLists(); }
  else if (a === 'works') { S.works = !S.works; S.hiDirty = true; pn.dirty = true; }
  else if (k === 'ev') { const e = S.inView.events.find(e => e.id === a.slice(3)); if (e) { focusOn(eventFocus(e)); const hit = pn.hits.find(h => h[4] === a); if (hit) S.lead = { a: add(pn.c, add(mulv(pn.R, -pn.w / 2), mulv(pn.U, (.5 - (hit[1] + hit[3]) / 2 / pn.cv.height) * pn.h))), x: e.x, y: C.groundAt(e.x, e.z) + 20, z: e.z }; } }
  else if (k === 'mk') { const m = S.inView.markets.find(m => m.id === a.slice(3)); if (m) focusOn(marketFocus(m)); }
  else if (k === 'mode') setMode(v);
  else if (a === 'plus' || a === 'minus') { const up = a === 'plus'; if (S.mode === 'table') { S.s = clamp(S.s * (up ? 1.5 : 1 / 1.5), 1 / 20000, 1 / 40); S.sTable = S.s; } else S.lift = clamp(S.lift + (up ? 30 : -30), 0, 600); setW(); S.hiDirty = true; }
  else if (a === 'turnL' || a === 'turnR') { S.yaw += (a === 'turnL' ? -1 : 1) * 30 * DEG; setW(); S.listSig = ''; }
  else if (a === 'night') { const b = $('nightBtn'); if (b) b.click(); pn.dirty = true; }
  else if (a === 'recentre') { S.placed = false; }
  else if (a === 'floorUp' || a === 'floorDn') { const d = a === 'floorUp' ? .1 : -.1; if (S.mode === 'table') { S.O = [S.O[0], S.O[1] + d, S.O[2]]; S.Otable = S.O; } else S.lift = clamp(S.lift - d * 10, 0, 600); setW(); }
  else if (a === 'sky') { S.sky = !S.sky; pn.dirty = true; }
  else if (a === 'look') { const el = $('look'); if (el) { el.checked = !el.checked; el.dispatchEvent(new Event('change')); } setTimeout(() => { pn.dirty = true; }, 50); pn.dirty = true; }
  // the drawing styles (Pixel art, Line drawing, Vector CRT) are passes of the screen pipeline (styles.js), not drawn in a headset session yet
  else if (a === 'style') { const St = globalThis.__docklandsStyles; if (St && St.mode !== 'map') St.setStyle('map').catch(() => {}); focusOn({ kind: 'note', title: 'Styles', sub: 'Pixel art, Line drawing and Vector CRT: on the screen only', lines: ['They are passes of the screen pipeline (styles.js).', 'A headset session draws the Map look; Look: Real gives the Realistic colours.'] }); pn.dirty = true; }
  else if (a === 'panels') { S.hidePanels = !S.hidePanels; pn.dirty = true; }
  else if (a === 'relief') { S.relief = RELIEFS[(RELIEFS.indexOf(S.relief) + 1) % RELIEFS.length]; if (S.mode === 'table') { applyRelief(); setW(); } pn.dirty = true; }
  else if (a === 'view') { S.view = (S.view + 1) % VIEWS.length; goView(VIEWS[S.view][0]); pn.dirty = true; }
  else if (a === 'exit') S.session.end();
  else if (a === 'go') { const f = S.focus; if (f && f.x != null) { if (S.mode !== 'street') setMode('street', f); else { const [x, z] = freeSpot(f.x, f.z); teleport(x, z, [f.x, f.z]); } } }
  else if (a === 'centre') { const f = S.focus; if (f && f.x != null) { S.c = [f.x, groundY(f.x, f.z), f.z]; setW(); S.hiDirty = true; } }
}
function marketFocus(m) { return { kind: 'market', id: m.id, title: m.title.replace(/:.*$/, ''), sub: `Market · ${m.where}`, lines: [m.next ? (m.next.open ? 'Open now' : 'Next: ' + m.next.label) : '', 'Hours: ' + m.hours, 'Source: OpenStreetMap (© OpenStreetMap contributors)', ...eventsNear(m.x, m.z)].filter(Boolean), x: m.x, z: m.z }; }
function focusOn(f) { S.focus = f; if (f.kind !== 'event') S.lead = null; S.hiDirty = true; P.focus.dirty = P.whatson.dirty = true; }
function eventFocus(e) {
  const same = S.data.events.filter(x => Math.abs(x.x - e.x) < 60 && Math.abs(x.z - e.z) < 60 && x.t0 != null && x.t0 >= now() - 3 * 3600e3 && x.id !== e.id).sort((a, b) => a.t0 - b.t0).slice(0, 3);
  return { kind: 'event', id: e.id, title: e.title, sub: `${fmtT(e.t0, e.allDay)} · ${e.where}`, x: e.x, z: e.z, lines: [`${km(e.v ? e.v.dist : 0)} away · listing: ${e.src}`, e.url ? 'Link: ' + e.url.replace(/^https?:\/\//, '') : '', ...(same.length ? ['Also here:', ...same.map(x => `  ${fmtT(x.t0, x.allDay)} · ${x.title}`)] : [])].filter(Boolean) };
}
function placeFocus(p) {
  if (p.src === 'registry') { const AT = C.registry && C.registry.AT, b = AT && AT.buildings[p.k]; if (b && b.mi && b.mi.length) return focusBuilding(b.mi[0]); }
  return { kind: 'place', title: p.name, sub: `${CAT_LABEL[p.cat]}${p.kind ? ' · ' + p.kind : ''} · ${p.src === 'osm' ? 'OpenStreetMap ' + p.osm : 'GLA Cultural Infrastructure Map'}`, x: p.x, z: p.z, top: p.top, lines: eventsNear(p.x, p.z) };
}
function eventsNear(x, z) {
  if (!S.data) return []; const t = now(), ev = S.data.events.filter(e => e.t0 != null && e.t0 >= t - 3 * 3600e3 && Math.hypot(e.x - x, e.z - z) < 150).sort((a, b) => a.t0 - b.t0).slice(0, 3);
  return ev.length ? ['Coming up here:', ...ev.map(e => `  ${fmtT(e.t0, e.allDay)} · ${e.title}`)] : [];
}
// the page's own card (registry or OpenStreetMap, main.js selectModel) is the source of truth: read its text
function focusBuilding(i) {
  const b = C.A.buildings[i], fx = (() => { const f = C.dec(b.p); let x = 0, z = 0; for (let k = 0; k < f.length; k += 2) { x += f[k]; z += f[k + 1]; } return [x / (f.length / 2), z / (f.length / 2)]; })();
  const f = { kind: 'building', i, title: 'Building', sub: 'Reading its card…', x: fx[0], z: fx[1], top: b.b + b.h, lines: [] }; focusOn(f);
  const sel = D3() && D3().selectModel ? D3().selectModel(i) : null;
  const read = () => { if (S.focus !== f) return; const el = $('cardBody'); if (!el) return; const t = el.innerText.split('\n').map(s => s.trim()).filter(s => s && !/^(Loading the record|Route (from|to) here|clear|Share)/.test(s));
    if (!t.length) return; f.title = t[0]; f.sub = t[1] || ''; f.lines = [...t.slice(2, 9), ...eventsNear(f.x, f.z)]; P.focus.dirty = true; S.hiDirty = true; };
  Promise.resolve(sel).then(read).catch(() => {}); setTimeout(read, 300); setTimeout(read, 1500); setTimeout(read, 4000); return f;
}
function setMode(m, at) {
  S.mode = m; const f = at || S.focus; applyRelief();
  if (m === 'street') { S.s = 1; S.lift = 0; if (f && f.x != null) { const [x, z] = freeSpot(f.x, f.z); teleport(x, z, [f.x, f.z]); } else { const [x, z] = freeSpot(S.c[0], S.c[2]); teleport(x, z); } }
  else { S.s = S.sTable || 1 / 1500; S.O = S.Otable || S.O; if (f && f.x != null) S.c = [f.x, groundY(f.x, f.z), f.z]; }
  if (m === 'table') S.sTable = S.s; depthRange(); setW(); S.hiDirty = true; S.listSig = ''; if (P.bar) P.bar.dirty = true;
}
// the eye's depth range (metres of the reference space): the table 0.08 to 60 m; street 0.25 to 16 km. three.js passes the
// eye camera's near and far to session.updateRenderState
function depthRange() { const st = S.mode === 'street'; eyeCam.near = st ? .25 : .08; eyeCam.far = st ? 16000 : 60; if (S.preview) S.session.updateRenderState({ depthNear: eyeCam.near, depthFar: eyeCam.far }); }
// the page's named views: the table centred on the view's target
function goView(k) { const D = D3(); if (!D || !D.setView) return; D.setView(k); const c = D.camState(); setMode('table'); S.c = [c.tx, groundY(c.tx, c.tz), c.tz]; S.yaw = -S.base.a * DEG - c.yaw; setW(); S.hiDirty = true; S.listSig = ''; }

// ---------- presses: a short press is a click (on the ray of the frame before the pinch); a press that moves drags.
// On empty space one hand moves the city (up and down too), two hands turn it and change its size; on a panel's
// title (the bar's left end) the hand moves the panel. Hands, controllers and gaze-and-pinch all give selectstart/end.
const handPos = (fr, src) => { const p = fr.getPose(src.gripSpace || src.targetRaySpace, S.ref); if (!p) return null; const m = p.transform.matrix; return [m[12], m[13], m[14]]; };
const bearing = v => Math.atan2(v[0], -v[2]);
function onPressStart(ev) {
  const src = ev.inputSource, r = S.lastRay.get(src) || rayOf(ev.frame, src) || null; if (!r) return; const pos = handPos(ev.frame, src) || r.o, hp = hitPanels(r.o, r.d);
  const rec = { src, r, t0: performance.now(), pos0: pos, pos, moved: 0, drag: false };
  if (hp && hp.p.grabZone(hp.h.px, hp.h.py)) Object.assign(rec, { kind: 'panel', panel: hp.p, dist: hp.h.t, off: sub(hp.h.p, hp.p.c) });
  else if (hp) rec.kind = 'ui';
  else Object.assign(rec, { kind: 'world', O0: S.O.slice(), c0: S.c.slice() });
  S.press.set(src, rec); twoStart();
}
function onPressEnd(ev) {
  const rec = S.press.get(ev.inputSource); S.press.delete(ev.inputSource); if (!rec) return;
  if (S.two) { S.two = null; for (const o of S.press.values()) if (o.kind === 'world') Object.assign(o, { pos0: o.pos, O0: S.O.slice(), c0: S.c.slice(), drag: true }); return; }
  if (!rec.drag && performance.now() - rec.t0 < 900) { click(rec.r); buzz(rec.src, .35, 30); }
  if (rec.kind === 'world' && rec.drag) { S.hiDirty = true; S.listSig = ''; }
}
function twoStart() {
  const w = [...S.press.values()].filter(o => o.kind === 'world'); if (w.length !== 2) return;
  const [a, b] = w, mid = mulv(add(a.pos, b.pos), .5); a.drag = b.drag = true;
  S.two = { a, b, d0: Math.max(.02, len(sub(b.pos, a.pos))), ang0: bearing(sub(b.pos, a.pos)), s0: S.s, yaw0: S.yaw, m0: M.ap(S.Wi, mid) };
}
function drags(fr) {
  for (const rec of S.press.values()) { const p = handPos(fr, rec.src); if (!p) continue; rec.pos = p; rec.moved = Math.max(rec.moved, len(sub(p, rec.pos0))); if (rec.moved > .025) rec.drag = true; }
  const T = S.two;
  if (T) { const a = T.a.pos, b = T.b.pos, mid = mulv(add(a, b), .5), k = len(sub(b, a)) / T.d0, dA = bearing(sub(b, a)) - T.ang0;
    S.yaw = T.yaw0 - dA;
    if (S.mode === 'table') { S.s = clamp(T.s0 * k, 1 / 30000, 1 / 30); S.sTable = S.s; const r = reliefNow(), d = sub(T.m0, S.c), v = M.dir(M.Ry(S.yaw), [d[0] * S.s, d[1] * S.s * r, d[2] * S.s]); S.O = sub(mid, v); S.Otable = S.O; }
    setW(); S.hiDirty = true; return; }
  for (const rec of S.press.values()) {
    if (!rec.drag) continue;
    if (rec.kind === 'panel') { const r = rayOf(fr, rec.src); if (!r) continue; rec.panel.moveTo(sub(add(r.o, mulv(r.d, rec.dist)), rec.off)); continue; }
    if (rec.kind !== 'world') continue; const d = sub(rec.pos, rec.pos0);
    if (S.mode === 'table') { S.O = add(rec.O0, d); S.Otable = S.O; }
    else { const g = 30, v = M.dir(M.Ry(-S.yaw), [d[0], 0, d[2]]); S.c = [rec.c0[0] - v[0] * g, 0, rec.c0[2] - v[2] * g]; S.c[1] = groundY(S.c[0], S.c[2]); }
    setW();
  }
}

// ---------- the frame (main.js calls ctx.xrFrame from its animation loop while a session or the preview runs)
function place(pose) {
  const m = pose.transform.matrix, f = nrm([-m[8], 0, -m[10]]), a = Math.atan2(f[0], -f[2]), cv = C.renderer.domElement;
  S.base = { a: a / DEG, p: [m[12], m[13], m[14]], far: S.preview && cv.clientWidth < cv.clientHeight * 1.2 ? 1.35 : 1 };
  for (const p of S.panels) { p.layout(S.base); p.dirty = true; }
  const camYaw = D3() ? D3().camState().yaw : 0;
  if (S.mode === 'table') { S.O = [m[12] + f[0] * 1.05, S.floor ? .76 : m[13] - .85, m[14] + f[2] * 1.05]; S.Otable = S.O; }
  S.yaw = -a - camYaw;
  S.floorY = S.floor ? 0 : m[13] - 1.6; setW(); S.placed = true; S.listSig = '';
}
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
function onFrame(t, fr, hooks) {
  const s = S.session; if (!s || !fr) return;
  const pose = fr.getViewerPose(S.ref); if (!pose) return; const m = pose.transform.matrix;
  S.head = [m[12], m[13], m[14]]; S.headF = nrm([-m[8], -m[9], -m[10]]);
  if (!S.placed) place(pose);
  for (const [src, h] of S.hover) S.lastRay.set(src, h); S.hover.clear(); drags(fr);
  for (const src of s.inputSources) { const r = rayOf(fr, src); if (!r) continue; const hp = hitPanels(r.o, r.d); S.hover.set(src, { ...r, len: hp ? hp.h.t : 3 });
    for (const p of S.panels) { const hv = hp && hp.p === p && hp.h.item ? hp.h.item[4] : null; if (p.hov !== hv) { p.hov = hv; p.dirty = true; if (hv) buzz(src, .12, 12); } }
    const gp = src.gamepad; if (gp) pad(gp, src); }
  if (t - S.listT > 450) { S.listT = t; updateLists(); }
  if (S.hiDirty) buildHighlights();
  for (const p of S.panels) if (p.dirty) p.redraw();
  syncRig(); labelVerts(); overlay();
  // the page camera follows the head in model metres (layers place their levels of detail by ctx.camera.position)
  const head = M.ap(S.Wi, S.head), fw = nrm(M.dir(S.Wi, S.headF)), cam = C.camera;
  cam.position.set(...head); _v.set(head[0] + fw[0], head[1] + fw[1], head[2] + fw[2]); cam.up.set(0, 1, 0); cam.lookAt(_v); cam.updateMatrixWorld();
  // sky and sun: round the head; the sun's light over the table centre; the sky and stars as the Sky button says (passthrough: off by day)
  const sky = C.sky, showSky = S.sky && !(S.ar && !C.night);
  sky.sky.visible = showSky; if (sky.stars) sky.stars.visible = showSky; sky.sky.position.set(...head); if (sky.stars) sky.stars.position.set(...head);
  _v.set(S.c[0], S.c[1], S.c[2]); sky.sun.position.copy(sky.sky.sunPosition.value).multiplyScalar(4000).add(_v); sky.sun.target.position.copy(_v); sky.sun.target.updateMatrixWorld();
  C.scene.background = showSky ? S.saved.background : S.ar ? null : S.tableBg;
  for (const f of hooks) { try { f(); } catch (e) { console.warn('xr frame hook', e); } }
  // draw: the headset's eyes through renderer.xr (the eye camera's parent is the rig); the preview: one eye on the page canvas
  // r186 Camera.updateMatrixWorld leaves the scale out of the view matrix ("glTF conform"), so the preview's camera is outside
  // the scene with its matrices set here (the scale of W is the table's scale); renderer.xr sets its eye cameras' views in full
  if (S.preview) { const v = pose.views[0]; prevCam.matrix.fromArray(v.transform.matrix); prevCam.matrixWorld.multiplyMatrices(rig.matrixWorld, prevCam.matrix); prevCam.matrixWorldInverse.copy(prevCam.matrixWorld).invert();
    // three.js makes the projection (its depth convention and clip space) from the preview's field and the depth range
    const cv = C.renderer.domElement; Object.assign(prevCam, { fov: S.session.fov() / DEG, aspect: cv.clientWidth / cv.clientHeight, near: eyeCam.near, far: eyeCam.far }); prevCam.updateProjectionMatrix(); }
  C.renderer.render(C.scene, S.preview ? prevCam : eyeCam);
  S.frames = (S.frames || 0) + 1;
}
// controllers (xr-standard mapping): right stick turns and zooms (table) or snap-turns and walks (street); left stick
// moves over the map or strafes; A Table/Street, B Night/Day, X Recentre, Y hide or show the side panels; a pulse on hover and on a click
let stickT = 0;
function buzz(src, k, ms) { const h = src && src.gamepad && src.gamepad.hapticActuators && src.gamepad.hapticActuators[0]; try { if (h && h.pulse) h.pulse(k, ms); } catch { /* no haptics */ } }
function pad(gp, src) {
  S.pads = true; const B = gp.buttons || [], was = S.btn.get(src) || [], down = B.map(b => !!(b && b.pressed)); S.btn.set(src, down);
  const hit = i => down[i] && !was[i], right = src.handedness !== 'left';
  if (hit(4)) act(right ? (S.mode === 'table' ? 'mode:street' : 'mode:table') : 'recentre', P.bar);
  if (hit(5)) { if (right) act('night', P.bar); else { S.hidePanels = !S.hidePanels; P.bar.dirty = true; } }
  if (gp.axes && gp.axes.length >= 4) { if (right) stick(gp.axes[2], gp.axes[3]); else move(gp.axes[2], gp.axes[3]); }
}
function move(x, y) {
  const dz = .2; if (Math.abs(x) < dz && Math.abs(y) < dz) return;
  const f = [S.headF[0], 0, S.headF[2]], fl = Math.hypot(f[0], f[2]) || 1, fw = [f[0] / fl, 0, f[2] / fl], rt = [-fw[2], 0, fw[0]];
  const k = S.mode === 'table' ? .012 : .9, v = add(mulv(fw, -y * k), mulv(rt, x * k)), d = M.dir(S.Wi, v);
  S.c = [S.c[0] + d[0], 0, S.c[2] + d[2]]; S.c[1] = groundY(S.c[0], S.c[2]); setW(); S.listT = 0;
}
function stick(x, y) {
  const dz = .25; if (Math.abs(x) < dz && Math.abs(y) < dz) return;
  if (S.mode === 'table') { S.yaw += x * .03; if (Math.abs(y) > dz) S.s = clamp(S.s * (1 - y * .02), 1 / 20000, 1 / 40); S.sTable = S.s; setW(); S.hiDirty = Math.abs(y) > dz || S.hiDirty; return; }
  const n = performance.now(); if (Math.abs(x) > .7 && n - stickT > 350) { stickT = n; S.yaw += Math.sign(x) * 30 * DEG; setW(); S.listSig = ''; }
  if (Math.abs(y) > dz) { const f = nrm(M.dir(S.Wi, [S.headF[0], 0, S.headF[2]])), sp = -y * 6; S.c = [S.c[0] + f[0] * sp, 0, S.c[2] + f[2] * sp]; S.c[1] = groundY(S.c[0], S.c[2]); setW(); }
}

// ---------- sessions: a real one (immersive-vr or immersive-ar, WebGL 2 backend) or the preview on the page canvas
async function start(kind) {
  if (S.session) return; const prev = kind === 'preview', R = C.renderer;
  if (!prev && C.GPU) { reloadForHeadset(); return; }
  // a real session is asked for first, while the tap still counts as a user gesture
  const session = prev ? null : await navigator.xr.requestSession(kind, { optionalFeatures: ['local-floor', 'hand-tracking'] });
  if (!rig) { makeObjects(); makePanels(); }
  const D = D3();
  // the page state that a session changes, restored at Exit
  S.saved = { cam: D ? D.camState() : null, controls: C.controls.enabled, shadows: C.sky.sun.castShadow, background: C.scene.background, look: lookOn(), sky: C.sky.sky.visible, stars: C.sky.stars ? C.sky.stars.visible : null, clearAlpha: R.getClearAlpha(), clear: R.getClearColor(new THREE.Color()) };
  S.tableBg = new THREE.Color(.075, .085, .1);
  const St = globalThis.__docklandsStyles; if (St && St.mode !== 'map') await St.setStyle('map').catch(() => {});
  // the headset starts with the Realistic look (owner, WebGL page: ordinary buildings "painfully flat and samey"); the page's own look comes back at Exit
  if (!S.saved.look && $('look')) { $('look').checked = true; $('look').dispatchEvent(new Event('change')); }
  if (prev) S.session = new PreviewSession();
  else {
    R.xr.enabled = true; R.xr.setReferenceSpaceType('local-floor');
    try { await R.xr.setSession(session); } catch (e) { R.xr.setReferenceSpaceType('local'); await R.xr.setSession(session); }
  }
  const ses = S.session = prev ? S.session : session; S.preview = prev; S.ar = kind === 'immersive-ar';
  if (prev) { S.ref = await ses.requestReferenceSpace('local-floor'); S.floor = true; }
  else { S.ref = R.xr.getReferenceSpace(); S.floor = R.xr.getReferenceSpaceType() === 'local-floor'; }
  if (S.ar) R.setClearColor(0x000000, 0);
  if (C.sky.sun.castShadow && D && D.setShadows) D.setShadows(false);
  C.controls.enabled = false;
  S.mode = 'table'; S.s = 1 / 1500; S.sTable = S.s; S.Otable = null; const T = S.saved.cam ? [S.saved.cam.tx, S.saved.cam.tz] : [0, 0]; S.c = [T[0], groundY(T[0], T[1]), T[1]]; S.placed = false; S.frames = 0;
  depthRange(); setW();
  C.scene.add(rig, beacons);
  ses.addEventListener('selectstart', onPressStart); ses.addEventListener('selectend', onPressEnd);
  ses.addEventListener('squeezestart', onPressStart); ses.addEventListener('squeezeend', ev => { const rec = S.press.get(ev.inputSource); if (rec) rec.drag = true; onPressEnd(ev); });
  ses.addEventListener('end', () => {
    C.xrFrame = null; S.session = null; XR.active = false; S.press.clear(); S.two = null; S.hover.clear();
    if (!prev) R.xr.enabled = false;
    C.scene.remove(rig, beacons); C.scene.background = S.saved.background; C.sky.sky.visible = S.saved.sky; if (C.sky.stars && S.saved.stars != null) C.sky.stars.visible = S.saved.stars;
    R.setClearColor(S.saved.clear, S.saved.clearAlpha); C.controls.enabled = S.saved.controls;
    if (S.saved.shadows && D && D.setShadows) D.setShadows(true);
    if (!S.saved.look && $('look') && $('look').checked) { $('look').checked = false; $('look').dispatchEvent(new Event('change')); }
    if (D && S.saved.cam) D.setCam(S.saved.cam);
    if ($('labels')) $('labels').style.visibility = ''; C.draw();
  });
  XR.active = true; if ($('labels')) $('labels').style.visibility = 'hidden';
  loadData().catch(e => console.warn('xr: listings did not load', e));
  // main.js: while ctx.xrFrame is set, its animation loop (the session's frames under renderer.xr, else the window's) calls it
  C.xrFrame = (t, fr, hooks) => { if (S.preview) { if (!S.session.due()) return; fr = S.session.frameObj(); } onFrame(t, fr, hooks); };
  C.draw();
}
// WebXR on the WebGPU backend needs the "webgpu" session feature, XRGPUBinding and an adapter asked for with xrCompatible at
// start-up (three.js r186 XRManager); the Quest browser has WebGPU but not that binding. The headset runs on WebGL 2: reload so.
function reloadForHeadset() {
  const q = new URLSearchParams(location.search); q.set('webgl', ''); q.set('xr', '1'); q.delete('xrgo'); q.delete('go');
  const h = D3() && D3().shareHash ? D3().shareHash() : location.hash;
  location.href = location.pathname + '?' + q.toString().replace(/=(&|$)/g, '$1') + h;
}
// one eye on the page canvas: drag to look round, tap to select, the wheel: + and -; Exit or Esc ends it
class PreviewSession {
  constructor() {
    this.ev = {}; this.inputSources = []; this.renderState = { depthNear: .08, depthFar: 60 }; this.yaw = 0; this.pitch = -.42; this.dirty = true; this.last = 0;
    const cv = C.renderer.domElement;
    const ray = (cx, cy) => { const r = cv.getBoundingClientRect(), nx = (cx - r.left) / r.width * 2 - 1, ny = 1 - (cy - r.top) / r.height * 2, fy = this.fov(), a = r.width / r.height, t = Math.tan(fy / 2);
      const d = [nx * t * a, ny * t, -1], H = this.headM(); return { o: [H[12], H[13], H[14]], d: nrm(M.dir(H, d)) }; };
    this.ptr = null; const block = e => { e.stopImmediatePropagation(); e.preventDefault(); };
    this.h = { down: e => { if (e.target !== cv) return; block(e); this.ptr = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; },
      move: e => { if (!this.ptr) { if (e.target === cv) { this.hoverRay = ray(e.clientX, e.clientY); this.dirty = true; } return; } block(e); this.yaw -= (e.clientX - this.ptr.x) * .004; this.pitch = clamp(this.pitch - (e.clientY - this.ptr.y) * .004, -1.4, 1.2); this.ptr.x = e.clientX; this.ptr.y = e.clientY; this.dirty = true; },
      up: e => { if (!this.ptr) return; block(e); const tap = Math.hypot(e.clientX - this.ptr.x0, e.clientY - this.ptr.y0) < 8; this.ptr = null; if (tap) this.fire('select', ray(e.clientX, e.clientY)); this.dirty = true; },
      wheel: e => { if (e.target !== cv) return; block(e); act(e.deltaY < 0 ? 'plus' : 'minus', P.bar); this.dirty = true; },
      key: e => { if (e.key === 'Escape') this.end(); }, click: e => { if (e.target === cv) block(e); } };
    for (const [n, f] of PREV_EV) window.addEventListener(n, this.h[f], { capture: true, passive: false });
    this.btn = document.createElement('button'); this.btn.textContent = 'Exit headset preview'; this.btn.style.cssText = 'position:fixed;z-index:50;left:50%;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top));padding:10px 16px;border-radius:20px;border:0;background:#9c2b2b;color:#fff;font:600 15px system-ui';
    this.btn.onclick = () => this.end(); document.body.appendChild(this.btn);
  }
  fov() { const cv = C.renderer.domElement; return cv.clientWidth < cv.clientHeight ? 1.45 : 1.15; }
  headM() { const c = Math.cos(this.pitch), s = Math.sin(this.pitch), X = M.I(); X[5] = c; X[6] = s; X[9] = -s; X[10] = c; return M.mul(M.T(0, 1.6, 0), M.mul(M.Ry(this.yaw), X)); }
  fire(n, r) { const src = { targetRayMode: 'screen', handedness: 'none', targetRaySpace: { r } }, fr = this.frameObj(); if (n === 'select') { for (const k of ['selectstart', 'selectend']) for (const f of this.ev[k] || []) f({ inputSource: src, frame: fr }); return; } for (const f of this.ev[n] || []) f({ inputSource: src, frame: fr }); }
  frameObj() {
    const H = this.headM(), inv = new THREE.Matrix4().fromArray(H).invert().elements, cv = C.renderer.domElement, a = cv.clientWidth / cv.clientHeight;
    const view = { eye: 'none', projectionMatrix: M.persp(this.fov(), a, this.renderState.depthNear, this.renderState.depthFar), transform: { matrix: H, inverse: { matrix: inv } } };
    this.inputSources = this.hoverRay ? [{ targetRayMode: 'screen', targetRaySpace: { r: this.hoverRay } }] : [];
    return { getViewerPose: () => ({ transform: { matrix: H }, views: [view] }), getPose: sp => { const r = sp.r; const z = nrm(mulv(r.d, -1)), x = nrm(cross([0, 1, 0], z)), y = cross(z, x); return { transform: { matrix: new Float32Array([...x, 0, ...y, 0, ...z, 0, ...r.o, 1]) } }; } };
  }
  // the preview draws when something changed (or every 0.9 s for the clock and the lists), not every animation frame
  due() { const n = performance.now(), d = this.dirty || S.hiDirty || S.panels.some(p => p.dirty) || n - this.last > 900; if (d) { this.dirty = false; this.last = n; } return d; }
  updateRenderState(s) { Object.assign(this.renderState, s); this.dirty = true; }
  requestReferenceSpace(t) { return Promise.resolve({ t }); }
  addEventListener(n, f) { (this.ev[n] ||= []).push(f); }
  end() { if (this.ended) return; this.ended = true; for (const [n, f] of PREV_EV) window.removeEventListener(n, this.h[f], { capture: true }); this.btn.remove(); for (const f of this.ev.end || []) f({}); }
}
const PREV_EV = [['pointerdown', 'down'], ['pointermove', 'move'], ['pointerup', 'up'], ['wheel', 'wheel'], ['click', 'click'], ['keydown', 'key']];

// ---------- the button (shown when the browser has WebXR; ?xr=preview also offers the preview)
const ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 8.5C3 7.1 4.1 6 5.5 6h13C19.9 6 21 7.1 21 8.5v6c0 1.4-1.1 2.5-2.5 2.5h-3.2c-.8 0-1.5-.4-1.9-1.1l-.6-1c-.4-.7-1.2-.7-1.6 0l-.6 1c-.4.7-1.1 1.1-1.9 1.1H5.5C4.1 17 3 15.9 3 14.5z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="11.5" r="1.6" fill="currentColor"/><circle cx="16" cy="11.5" r="1.6" fill="currentColor"/></svg>';
export async function init(ctx) {
  C = ctx; THREEr = ctx.THREE; geo = geoOf(ctx.A); inBox = inBoxOf(ctx.A); CW = ctx.WEBGL.replace(/docklands\/$/, '');
  const qs = ctx.qs, xr = navigator.xr, vr = xr && await xr.isSessionSupported('immersive-vr').catch(() => false), ar = xr && await xr.isSessionSupported('immersive-ar').catch(() => false);
  const wantPrev = /^preview/.test(qs.get('xr') || ''), back = qs.get('xr') === '1';
  const api = { renderNow() { if (S.preview && S.session) { S.session.dirty = true; C.xrFrame(performance.now(), undefined, []); } }, S, P, act, LAB, toUser, setMode, start, loadData, updateLists, reliefNow, get active() { return XR.active; }, get rig() { return rig; }, get eyeCam() { return eyeCam; }, get panels() { return S.panels; } };
  globalThis.DocklandsXR3 = api;
  if (!vr && !ar && !wantPrev) return api;
  // the button box of layers/locate.js (made after that layer's init); without it, a box of our own at the same place
  let box = $('locBtns'); for (let k = 0; !box && k < 20; k++) { await new Promise(r => setTimeout(r, 100)); box = $('locBtns'); }
  if (!box) { box = document.createElement('div'); box.id = 'xrBtns'; box.style.cssText = 'position:fixed;z-index:5;right:10px;bottom:calc(40px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:10px'; document.body.appendChild(box); }
  const label = vr || ar ? 'View in a headset (WebXR)' : 'Headset preview';
  const b = document.createElement('button'); b.type = 'button'; b.id = 'xrBtn'; b.setAttribute('aria-label', label); b.title = label; b.innerHTML = ICON;
  b.style.cssText = 'width:44px;height:44px;border-radius:50%;border:0;background:var(--panel);color:#c9ced6;cursor:pointer;display:grid;place-items:center';
  box.prepend(b);
  const kinds = [vr && ['immersive-vr', 'Headset: virtual room'], ar && ['immersive-ar', 'Headset: your own room (passthrough)'], ['preview', 'Preview on this screen']].filter(Boolean);
  const go = k => start(k).catch(e => { console.warn('xr', e); alert('Headset view did not start: ' + e.message); });
  b.onclick = () => {
    if (kinds.length === 1) return go(kinds[0][0]);
    const m = document.createElement('div'); m.id = 'xrMenu'; m.style.cssText = 'position:fixed;z-index:60;right:64px;bottom:120px;display:flex;flex-direction:column;gap:8px;background:#11151b;border:1px solid #2a313a;border-radius:14px;padding:10px';
    for (const [k, t] of kinds) { const x = document.createElement('button'); x.textContent = t + (k !== 'preview' && ctx.GPU ? ' (reloads on WebGL 2)' : ''); x.dataset.kind = k; x.style.cssText = 'padding:10px 14px;border-radius:10px;border:0;background:#1f2731;color:#eef2f6;font:500 15px system-ui;text-align:left'; x.onclick = () => { m.remove(); go(k); }; m.appendChild(x); }
    document.body.appendChild(m); setTimeout(() => window.addEventListener('pointerdown', function off(e) { if (!m.contains(e.target)) { m.remove(); window.removeEventListener('pointerdown', off, true); } }, true), 0);
  };
  // back from the reload (?webgl&xr=1): a session needs a tap, so offer one large button
  if (back && (vr || ar) && !ctx.GPU) {
    const big = document.createElement('button'); big.id = 'xrEnter'; big.textContent = 'Enter the headset view'; big.style.cssText = 'position:fixed;z-index:55;left:50%;top:50%;transform:translate(-50%,-50%);padding:18px 26px;border-radius:24px;border:0;background:#2f6fdf;color:#fff;font:600 20px system-ui;box-shadow:0 6px 30px #0008';
    big.onclick = () => { big.remove(); b.click(); }; document.body.appendChild(big);
  }
  if ((wantPrev && (qs.has('go') || /go/.test(qs.get('xr')))) || qs.has('xrgo')) (async () => { for (let k = 0; k < 600 && !(D3() && D3().ready); k++) await new Promise(r => setTimeout(r, 100)); go('preview'); })();
  return api;
}
export default { id: 'xr', label: null, on: true, reveal: false, init };
