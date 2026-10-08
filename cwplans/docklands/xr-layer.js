// WebXR for the Docklands 3D page (the headset button, bottom right; ?xr=preview on any screen): the city as a table
// model or at street level, with panels round you that use the room a headset gives: Places in view by category
// (beacons on the buildings), What's on in view (dated events, markets, works), a Focus card for what you select,
// and a control bar. index.html draws each eye (render() with DocklandsXR.view) and calls after() for this layer's
// beacons, labels, rays and panels. Preview: the same code with a one-eye session on the page canvas (drag to look,
// tap to select), for screens with no WebXR (iPhone). Skill: docklands-3d-page, "WebXR".
(() => {
const XR = globalThis.DocklandsXR = { active: false, view: null };
let C = null, gl = null;
const $ = id => document.getElementById(id);
// ---------- 4x4 column-major matrices
const M = {
  mul(a, b) { const o = new Float32Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  T(x, y, z) { const o = M.I(); o[12] = x; o[13] = y; o[14] = z; return o; },
  I() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  Ry(a) { const o = M.I(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
  S(s) { const o = M.I(); o[0] = o[5] = o[10] = s; return o; },
  ap(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; },
  dir(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]]; },
  persp(fy, a, n, f) { const t = 1 / Math.tan(fy / 2), o = new Float32Array(16); o[0] = t / a; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mulv = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const DEG = Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- state. W: model (x, y x VZ, z) -> the reference space in metres: T(O) Ry(yaw) S(s) T(-c)
const S = {
  session: null, ref: null, preview: false, ar: false, mode: 'table', s: 1 / 1500, c: [0, 0, 0], O: [0, .78, -1], yaw: 0, lift: 0, floorY: 0,
  W: M.I(), Wi: M.I(), head: [0, 1.6, 0], headF: [0, 0, -1], placed: false, base: { a: 0, p: [0, 1.6, 0] },
  cats: new Set(), openNow: false, win: 7, works: false, focus: null, lead: null, hover: new Map(), grab: null, press: new Map(), lastRay: new Map(), two: null, sky: 'auto', photos: [], snap: false, ride: true, view: -1, droneT: 0, btn: new Map(), hidePanels: false, pads: false,
  data: null, loading: null, inView: { cats: {}, events: [], works: [], markets: [] }, listT: 0, hiDirty: true, hiMesh: null, labels: [], panels: [],
};
function setW() {
  const s = S.s, c = S.c, O = S.mode === 'ride' ? S.rideO : S.mode === 'street' ? [S.O[0], S.floorY - S.lift, S.O[2]] : S.O;
  S.W = M.mul(M.T(...O), M.mul(M.Ry(S.yaw), M.mul(M.S(s), M.T(-c[0], -c[1], -c[2]))));
  S.Wi = M.mul(M.T(...c), M.mul(M.S(1 / s), M.mul(M.Ry(-S.yaw), M.T(-O[0], -O[1], -O[2]))));
}
const vz = () => C.VZ();
const toUser = (x, y, z) => M.ap(S.W, [x, y * vz(), z]);
const groundY = (x, z) => C.groundAt(x, z) * vz();

// ---------- data: places by category, events, markets, works (all positioned in model metres)
const CAT_LABEL = { finance: 'Finance', shop: 'Shops', catering: 'Food and drink', leisure: 'Leisure', entertainment: 'Entertainment', bar: 'Pubs and bars',
  education: 'Education', health: 'Health', sport: 'Sport', arts: 'Arts', charity: 'Charities', venues: 'Cultural venues' };
const CAT_EXTRA = { venues: [.4, .82, 1] };
const colOf = k => (C.GLOW[k] || CAT_EXTRA[k] || [.8, .8, .8]);
const hex = c => '#' + c.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
const EVENT_SRC = new Set(['venue-events', 'planning', 'th-licences']), WORK_SRC = new Set(['street-manager', 'street-manager-activities', 'tfl-road', 'tfl-bus']);
async function loadData() {
  if (S.data) return S.data; if (S.loading) return S.loading;
  S.loading = (async () => {
    const url = p => globalThis.CwData ? CwData.url(p) : '../' + p, j = p => fetch(url(p)).then(r => { if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); });
    const [pois, venues, works] = await Promise.all([j('registry/model-box-pois.json').catch(() => null), j('feeds/london-datastore/cultural-infrastructure/cultural-infrastructure.geojson').catch(() => null), j('feeds/works/works.json').catch(() => null)]);
    const AT = C.AT(), A = C.A, places = [], top = i => { const b = A.buildings[i]; return b ? b.b + C.heightOf(b, i) : null; };
    if (AT) AT.buildings.forEach((b, k) => { if (!b.cat) return; const t = b.mi && b.mi.length ? Math.max(...b.mi.map(top).filter(v => v != null)) : null;
      for (const [cat, n] of Object.entries(b.cat)) places.push({ src: 'registry', k, id: b.id, name: b.n || `${CAT_LABEL[cat === 'alcohol' ? 'bar' : cat] || cat} (${n})`, cat: cat === 'alcohol' ? 'bar' : cat, n, x: b.x, z: b.z, top: t ?? C.groundAt(b.x, b.z) + 10 }); });
    if (pois) for (const p of pois.pois) { if (p.in_registry_box) continue; const [x, z] = C.geo(p.lon, p.lat); if (!C.inBox(x, z, 0)) continue;
      const cl = Object.keys(p.classes)[0], what = Object.values(p.classes)[0].split('=').pop().replace(/_/g, ' ');
      places.push({ src: 'osm', osm: p.osm, name: p.name || what, cat: cl === 'alcohol' ? 'bar' : cl, n: 1, x, z, top: C.groundAt(x, z) + 9 }); }
    if (venues) for (const f of venues.features) { const g = f.geometry && f.geometry.coordinates; if (!g) continue; const [x, z] = C.geo(g[0], g[1]); if (!C.inBox(x, z, 0)) continue;
      places.push({ src: 'gla', name: f.properties.name, kind: String(f.properties.layer || '').replace(/^cultural_venues_CIM 2023 /, ''), cat: 'venues', n: 1, x, z, top: C.groundAt(x, z) + 9 }); }
    const events = [], markets = [], worksL = [];
    if (works) for (const it of works.items) { if (it.lat == null || it.lon == null) continue; const [x, z] = C.geo(it.lon, it.lat); if (!C.inBox(x, z, 0)) continue;
      const base = { id: it.id, title: it.title, where: it.location || it.venue || it.street || '', x, z, url: it.url, src: it.source, kind: it.kind };
      if (it.source === 'markets') markets.push({ ...base, hours: it.opening_hours || it.recurring });
      else if (EVENT_SRC.has(it.source)) events.push({ ...base, t0: it.start ? Date.parse(it.start.length === 10 ? it.start + 'T00:00:00Z' : it.start) : null, allDay: !!it.start && it.start.length === 10, t1: it.end ? Date.parse(it.end) : null });
      else if (WORK_SRC.has(it.source)) worksL.push({ ...base, t0: it.start ? Date.parse(it.start) : null, t1: it.end ? Date.parse(it.end) : null }); }
    const totals = {}; for (const p of places) totals[p.cat] = (totals[p.cat] || 0) + 1;
    S.data = { places, events, markets, works: worksL, totals, fetched: works && works.meta ? (works.meta.built || works.meta.fetched || '') : '', counts: { pois: pois ? pois.pois.length : 0, venues: venues ? venues.features.length : 0 } };
    S.hiDirty = true; dirtyAll(); return S.data;
  })();
  return S.loading;
}
// open now: the registry occupants of a building in a category (categories.json names -> buildings.json hours, as the card)
let OPEN = null;
async function loadOpen() {
  if (OPEN) return OPEN; const [reg, cats] = await Promise.all([C.getReg(), C.getCats()]); OPEN = { reg, cats, cache: new Map() }; return OPEN;
}
function openIn(p) {
  if (!OPEN || p.src !== 'registry') return null; const key = p.id + '|' + p.cat; if (OPEN.cache.has(key)) return OPEN.cache.get(key);
  const b = OPEN.reg.get(p.id), names = new Set(((OPEN.cats.buildings[p.id] || {})[p.cat] || []).map(e => e.name)); let st = null;
  if (b && globalThis.OpeningHours) for (const o of b.occupants || []) { if (!names.has(o.name)) continue; const h = C.ohOf(o); if (!h) continue; const s = OpeningHours.openState(h.h, new Date(now())); if (!s) continue; st = st || s.open; if (s.open) break; }
  OPEN.cache.set(key, st); return st;
}
const now = () => { const K = globalThis.DocklandsSky; return K && K.S && !K.S.live ? K.S.t : Date.now(); };

// ---------- in view: horizontal angle from the head's forward direction (and a range at street level)
function viewTest(x, z, y) {
  const p = toUser(x, y, z), d = sub(p, S.head), dh = Math.hypot(d[0], d[2]); if (dh < 1e-6) return null;
  const f = S.headF, fh = Math.hypot(f[0], f[2]) || 1, ca = (d[0] * f[0] + d[2] * f[2]) / (dh * fh), side = (f[0] * d[2] - f[2] * d[0]) / (dh * fh);
  const ang = Math.atan2(side, ca), md = len(sub(M.ap(S.Wi, S.head), [x, y * vz(), z])) / (S.mode === 'street' ? 1 : 1);
  const range = S.mode === 'street' ? 4500 : 1e9;
  return { ok: Math.abs(ang) < 52 * DEG && (S.mode === 'table' ? true : md < range), ang, p, dist: S.mode === 'street' ? md : Math.hypot(x - S.c[0], z - S.c[2]) };
}
const arrow = a => a < -60 * DEG ? '←' : a < -20 * DEG ? '↖' : a <= 20 * DEG ? '↑' : a <= 60 * DEG ? '↗' : '→';
const km = m => m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
const fmtT = (t, allDay) => { const d = new Date(t), o = { timeZone: 'Europe/London' }; const day = d.toLocaleDateString('en-GB', { ...o, weekday: 'short', day: 'numeric', month: 'short' }); return allDay ? day : day + ' ' + d.toLocaleTimeString('en-GB', { ...o, hour: '2-digit', minute: '2-digit' }); };
function nextOpen(h) {   // a market's next opening from its opening hours
  if (!globalThis.OpeningHours) return null; const t = now();
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
  const mk = []; for (const m of D.markets) { const v = viewTest(m.x, m.z, C.groundAt(m.x, m.z)); if (v && v.ok) { const n = nextOpen(m.hours); mk.push({ ...m, v, next: n }); } }
  const wk = []; for (const w of D.works) { if ((w.t0 && w.t0 > t) || (w.t1 && w.t1 < t)) continue; const v = viewTest(w.x, w.z, C.groundAt(w.x, w.z)); if (v && v.ok) wk.push({ ...w, v }); }
  wk.sort((a, b) => a.v.dist - b.v.dist);
  const sig = JSON.stringify([cats, ev.slice(0, 9).map(e => e.id + e.v.ang.toFixed(1)), mk.length, wk.length, S.win]);
  S.inView = { cats, events: ev, markets: mk, works: wk };
  if (sig !== S.listSig) { S.listSig = sig; P.places.dirty = P.whatson.dirty = true; S.hiDirty = true; }
}

// ---------- beacons (model space, drawn with the page's own program): lit categories, events in view, the focus
function buildHighlights() {
  S.hiDirty = false; if (S.hiMesh) { S.hiMesh.free(); S.hiMesh = null; } const D = S.data; if (!D) return;
  const Mh = new C.Mesh(), tbl = S.mode === 'table', wb = tbl ? .0025 / S.s : 1.4, hb = tbl ? .045 / S.s : 45, labels = [];
  const beacon = (x, z, y0, h, w, col) => { const y1 = y0 + h / vz(), q = [[x - w, z - w], [x + w, z - w], [x + w, z + w], [x - w, z + w]];
    for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = col.map(v => v * (i % 2 ? .78 : 1)); Mh.tri(Mh.v(a[0], y0, a[1], c), Mh.v(b[0], y0, b[1], c), Mh.v(b[0], y1, b[1], c)); Mh.tri(Mh.v(a[0], y0, a[1], c), Mh.v(b[0], y1, b[1], c), Mh.v(a[0], y1, a[1], c)); }
    const r = w * 3, ym = y1 + r / vz(), top = [x, ym + r / vz(), z], bot = [x, ym - r / vz(), z], ring = [[x + r, ym, z], [x, ym, z + r], [x - r, ym, z], [x, ym, z - r]];
    for (let i = 0; i < 4; i++) { const a = ring[i], b = ring[(i + 1) % 4]; Mh.tri(Mh.v(...a, col), Mh.v(...b, col), Mh.v(...top, col)); const d = col.map(v => v * .7); Mh.tri(Mh.v(...a, d), Mh.v(...b, d), Mh.v(...bot, d)); }
    return ym + 2 * r / vz(); };
  const lit = [];
  for (const p of D.places) { if (!S.cats.has(p.cat)) continue; if (S.openNow) { const o = openIn(p); if (o !== true) continue; } lit.push(p); }
  for (const p of lit) { const yt = beacon(p.x, p.z, p.top, hb, wb, colOf(p.cat)); p.yl = yt; }
  const nearest = lit.filter(p => p.v && p.v.ok).sort((a, b) => a.v.dist - b.v.dist).slice(0, 40);
  const f0 = S.focus, seen = new Set(f0 && f0.x != null ? [Math.round(f0.x) + ',' + Math.round(f0.z)] : []), placeLabels = nearest.filter(p => { const k = Math.round(p.x) + ',' + Math.round(p.z); if (seen.has(k) || (f0 && f0.x != null && Math.hypot(p.x - f0.x, p.z - f0.z) < 25)) return false; seen.add(k); return true; }).map(p => ({ x: p.x, z: p.z, y: p.yl, text: p.name, col: colOf(p.cat) }));
  const venues = new Map(); for (const e of S.inView.events) { const k = Math.round(e.x / 30) + ',' + Math.round(e.z / 30); if (!venues.has(k)) venues.set(k, e); }
  for (const e of venues.values()) { const yt = beacon(e.x, e.z, C.groundAt(e.x, e.z) + (tbl ? 30 : 8), hb * 1.5, wb * 1.3, [1, .84, .3]); labels.push({ x: e.x, z: e.z, y: yt, text: `${fmtT(e.t0, e.allDay)} · ${e.title}`, col: [1, .84, .3], ev: true }); }
  for (const m of S.inView.markets.slice(0, 8)) { const yt = beacon(m.x, m.z, C.groundAt(m.x, m.z) + 2, hb * .8, wb, [.55, .95, .55]); labels.push({ x: m.x, z: m.z, y: yt, text: m.title.replace(/:.*$/, '') + (m.next ? ' · ' + m.next.label : ''), col: [.55, .95, .55], mk: m.id }); }
  if (S.works) for (const w of S.inView.works.slice(0, 60)) beacon(w.x, w.z, C.groundAt(w.x, w.z), hb * .35, wb * .8, [1, .5, .15]);
  const f = S.focus; if (f && f.x != null) { const yt = beacon(f.x, f.z, (f.top ?? C.groundAt(f.x, f.z)) + 1, hb * 1.8, wb * 1.6, [1, 1, 1]); labels.push({ x: f.x, z: f.z, y: yt, text: f.title, col: [1, 1, 1], focus: true }); }
  S.hiMesh = Mh.n ? Mh.upload() : null; setLabels([...labels.filter(l => l.focus), ...labels.filter(l => !l.focus), ...placeLabels]);
}

// ---------- GL: a textured-quad program (panels, labels) and a coloured-line program (rays, leader lines)
let TP = null, LP = null, QB = null, LB = null;
function progs() {
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const mk = (vs, fs, at) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); at.forEach((a, i) => gl.bindAttribLocation(p, i, a)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
  TP = mk('attribute vec3 p;attribute vec2 t;uniform mat4 m;varying vec2 v;void main(){v=t;gl_Position=m*vec4(p,1.);}',
    'precision mediump float;uniform sampler2D s;uniform float a;varying vec2 v;void main(){vec4 c=texture2D(s,v);gl_FragColor=vec4(c.rgb,c.a*a);}', ['p', 't']);
  LP = mk('attribute vec3 p;attribute vec4 c;uniform mat4 m;varying vec4 v;void main(){v=c;gl_Position=m*vec4(p,1.);}', 'precision mediump float;varying vec4 v;void main(){gl_FragColor=v;}', ['p', 'c']);
  TP.m = gl.getUniformLocation(TP, 'm'); TP.s = gl.getUniformLocation(TP, 's'); TP.a = gl.getUniformLocation(TP, 'a'); LP.m = gl.getUniformLocation(LP, 'm');
  QB = gl.createBuffer(); LB = gl.createBuffer();
}
function attribs(n) { const max = gl.getParameter(gl.MAX_VERTEX_ATTRIBS); for (let i = 0; i < Math.min(max, 8); i++) if (i < n) gl.enableVertexAttribArray(i); else gl.disableVertexAttribArray(i); }
function quads(mvp, tex, verts, alpha = 1) {   // verts: [x y z u v] x 6 per quad
  if (!verts.length) return; gl.useProgram(TP); attribs(2); gl.uniformMatrix4fv(TP.m, false, mvp); gl.uniform1f(TP.a, alpha); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(TP.s, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, QB); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
  gl.drawArrays(gl.TRIANGLES, 0, verts.length / 5);
}
function lines(mvp, verts, mode = gl.LINES) {   // verts: [x y z r g b a]
  if (!verts.length) return; gl.useProgram(LP); attribs(2); gl.uniformMatrix4fv(LP.m, false, mvp);
  gl.bindBuffer(gl.ARRAY_BUFFER, LB); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
  gl.drawArrays(mode, 0, verts.length / 7);
}
const newTex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
const upload = (tex, canvas) => { gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); };

// ---------- panels: a canvas each, drawn when dirty, placed round the user (angle from forward, distance, height, tilt)
const PX = 1024, FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
class Panel {
  constructor(key, w, h, place, draw) { Object.assign(this, { key, w, h, w0: w, h0: h, place, drawFn: draw, dirty: true, hits: [] }); this.cv = document.createElement('canvas'); this.cv.width = PX; this.cv.height = Math.round(PX * h / w); this.k = this.cv.width / w; }
  // far (base.far): the preview on a narrow screen sets the panels back (same directions, smaller angles)
  layout(base) { const [a, r0, dy0, tilt] = this.place, A = base.a + a * DEG, k = base.far || 1, r = r0 * k, dy = dy0 * k;
    this.c = [base.p[0] + r * Math.sin(A), base.p[1] + dy, base.p[2] - r * Math.cos(A)];
    const n = [-Math.sin(A), 0, Math.cos(A)], R = [Math.cos(A), 0, Math.sin(A)], U = [0, 1, 0], t = (tilt || 0) * DEG;
    this.n = nrm(add(mulv(n, Math.cos(t)), mulv(U, Math.sin(t)))); this.R = R; this.U = nrm(sub(mulv(U, Math.cos(t)), mulv(n, Math.sin(t)))); }
  orient(A, tilt) { const n = [-Math.sin(A), 0, Math.cos(A)], R = [Math.cos(A), 0, Math.sin(A)], U = [0, 1, 0], t = (tilt || 0) * DEG;
    this.n = nrm(add(mulv(n, Math.cos(t)), mulv(U, Math.sin(t)))); this.R = R; this.U = nrm(sub(mulv(U, Math.cos(t)), mulv(n, Math.sin(t)))); }
  // a dragged panel: its centre where the hand puts it, turned to face the head (same tilt)
  moveTo(c) { this.c = c; this.orient(Math.atan2(c[0] - S.head[0], -(c[2] - S.head[2])), this.place[3]); }
  grabZone(px, py) { return this.key === 'bar' ? px < 70 : py < 125; }
  redraw() { const g = this.cv.getContext('2d'); g.clearRect(0, 0, this.cv.width, this.cv.height); this.hits = []; this.drawFn(g, this); if (!this.tex) this.tex = newTex(); upload(this.tex, this.cv); this.dirty = false; }
  verts() { const c = this.c, R = mulv(this.R, this.w / 2), U = mulv(this.U, this.h / 2), tl = add(sub(c, R), U), tr = add(add(c, R), U), bl = sub(sub(c, R), U), br = sub(add(c, R), U);
    return [...tl, 0, 0, ...bl, 0, 1, ...br, 1, 1, ...tl, 0, 0, ...br, 1, 1, ...tr, 1, 0]; }
  hit(o, d) { const dn = dot(d, this.n); if (Math.abs(dn) < 1e-6) return null; const t = dot(sub(this.c, o), this.n) / dn; if (t <= 0) return null; const p = add(o, mulv(d, t)), q = sub(p, this.c), x = dot(q, this.R), y = dot(q, this.U);
    if (Math.abs(x) > this.w / 2 || Math.abs(y) > this.h / 2) return null; const px = (x / this.w + .5) * this.cv.width, py = (.5 - y / this.h) * this.cv.height;
    return { t, p, px, py, item: this.hits.find(h => px >= h[0] && px <= h[2] && py >= h[1] && py <= h[3]) || null }; }
  btn(g, x, y, w, h, text, on, act, col) { g.fillStyle = on ? (col || '#2f6fdf') : 'rgba(255,255,255,.09)'; rr(g, x, y, w, h, h / 2.6); g.fill(); if (this.hov === act) { g.strokeStyle = '#fff'; g.lineWidth = 3; rr(g, x, y, w, h, h / 2.6); g.stroke(); }
    g.fillStyle = '#eef2f6'; let fs = Math.round(h * .42); g.font = `600 ${fs}px ${FONT}`; while (fs > 14 && g.measureText(text).width > w - 18) { fs -= 2; g.font = `600 ${fs}px ${FONT}`; } g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x + w / 2, y + h / 2 + 1); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; this.hits.push([x, y, x + w, y + h, act]); }
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function frame(g, pn, title, sub_) { const W = pn.cv.width, H = pn.cv.height; g.fillStyle = 'rgba(13,16,21,.88)'; rr(g, 0, 0, W, H, 34); g.fill(); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 3; rr(g, 1.5, 1.5, W - 3, H - 3, 33); g.stroke();
  g.fillStyle = '#f2f5f8'; g.font = `700 50px ${FONT}`; g.fillText(title, 40, 74); if (sub_) { g.fillStyle = '#9aa4ae'; g.font = `400 28px ${FONT}`; g.fillText(sub_, 40, 114); } }
function clip(g, s, w) { if (g.measureText(s).width <= w) return s; let a = 0, b = s.length; while (a < b) { const m = (a + b + 1) >> 1; if (g.measureText(s.slice(0, m) + '…').width <= w) a = m; else b = m - 1; } return s.slice(0, a) + '…'; }
const P = {};
function makePanels() {
  P.places = new Panel('places', .62, .9, [-62, 1.2, -.1, 0], (g, pn) => {
    frame(g, pn, 'Places in view', S.data ? 'Tap a category: beacons light its buildings' : 'Loading places…');
    pn.btn(g, 40, 140, 300, 64, S.openNow ? '● Open now' : '○ Open now', S.openNow, 'open', '#1f8f55'); pn.btn(g, 360, 140, 300, 64, 'All off', false, 'catsoff');
    g.fillStyle = '#9aa4ae'; g.font = `400 24px ${FONT}`; g.fillText(S.openNow ? 'Hours: Canary Wharf registry only' : 'in view / in the model', 690, 182);
    const keys = Object.keys(CAT_LABEL); let y = 240;
    for (const k of keys) { const on = S.cats.has(k), n = S.inView.cats[k] || 0, tot = S.data ? S.data.totals[k] || 0 : 0, col = hex(colOf(k)), h = 88;
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
    const st = S.mode === 'street', style = C.lineOn() ? (globalThis.DocklandsLines.mode === 'vectrex' ? 'CRT' : 'Lines') : 'Map', sky = { auto: 'Dark', city: 'City', off: 'Off' }[S.sky];
    const rows = [[['Table', S.mode === 'table', 'mode:table'], ['Street', st, 'mode:street'], [st ? 'Lower' : '−', false, 'minus'], [st ? 'Higher' : '+', false, 'plus'], ['⟲', false, 'turnL'], ['⟳', false, 'turnR'], ['Exit', false, 'exit']],
      [['Floor ▲', false, 'floorUp'], ['Floor ▼', false, 'floorDn'], ['Style: ' + style, false, 'style'], ['Sky: ' + sky, false, 'sky'], [C.NIGHT().on ? 'Day' : 'Night', false, 'night'], [`Photo${S.photos.length ? ' ' + S.photos.length : ''}`, false, 'photo'], ['Recentre', false, 'recentre']],
      [['Drone: ' + droneName(), droneOn(), 'drone'], [S.ride ? 'Ride' : 'Watch', S.mode === 'ride', 'ride'], ['View: ' + (VIEWS[S.view] ? VIEWS[S.view][1] : '—'), false, 'view']]];
    const x0 = 64, bh = (H - 56) / 3; rows.forEach((row, r) => { const bw = (W - x0 - 14) / row.length; row.forEach(([t, on, a], i) => pn.btn(g, x0 + i * bw + 4, 14 + r * (bh + 14), bw - 8, bh, t, on, a, a === 'exit' ? '#9c2b2b' : a === 'drone' ? '#1b8a8a' : null)); });
    pn.hits.push([0, 0, 60, H, 'grab']);
  });
  S.panels = [P.places, P.whatson, P.focus, P.bar];
}
const dirtyAll = () => { for (const p of S.panels) p.dirty = true; };

// ---------- labels: one atlas canvas (2 x 32 slots of 1024 x 64 px), billboards facing the head
const LAB = { cv: null, tex: null, items: [] };
function setLabels(list) {
  if (!LAB.cv) { LAB.cv = document.createElement('canvas'); LAB.cv.width = 2048; LAB.cv.height = 2048; }
  const g = LAB.cv.getContext('2d'); g.clearRect(0, 0, 2048, 2048); LAB.items = [];
  list.slice(0, 64).forEach((l, i) => { const sx = (i % 2) * 1024, sy = (i >> 1) * 64; g.font = `${l.focus || l.ev ? 700 : 600} 40px ${FONT}`; const t = clip(g, l.text, 960), w = Math.min(1016, g.measureText(t).width + 40);
    g.fillStyle = 'rgba(10,12,16,.82)'; rr(g, sx + 2, sy + 4, w, 56, 18); g.fill(); g.fillStyle = hex(l.col); g.fillRect(sx + 10, sy + 16, 8, 32); g.fillStyle = '#fff'; g.fillText(t, sx + 28, sy + 46);
    LAB.items.push({ ...l, u0: sx / 2048, v0: sy / 2048, u1: (sx + w + 4) / 2048, v1: (sy + 64) / 2048, aspect: (w + 4) / 64 }); });
  if (!LAB.tex) LAB.tex = newTex(); upload(LAB.tex, LAB.cv);
}
function labelVerts() {   // greedy in list order (focus, events, markets, then the nearest places): a label whose angular box overlaps a placed one is left out
  const out = [], placed = [], f = S.headF, fy = Math.atan2(f[0], -f[2]);
  for (const l of LAB.items) { const p = toUser(l.x, l.y, l.z), d = sub(S.head, p), dist = len(d); if (dist < .05) continue;
    const q = mulv(d, -1), az = Math.atan2(q[0], -q[2]) - fy, el = Math.atan2(q[1], Math.hypot(q[0], q[2])), ah = clamp(dist * .024, .006, 60) / dist, aw = ah * l.aspect;
    const box = [az - aw / 2, el, az + aw / 2, el + ah * 1.1]; if (!l.focus && placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue; placed.push(box);
    const h = clamp(dist * .024, .006, 60), w = h * l.aspect, r = nrm([d[2], 0, -d[0]]), up = [0, 1, 0], b = add(p, mulv(up, h * .25)), R = mulv(r, w / 2), U = mulv(up, h);
    const bl = sub(b, R), br = add(b, R), tl = add(bl, U), tr = add(br, U); out.push(...tl, l.u0, l.v0, ...bl, l.u0, l.v1, ...br, l.u1, l.v1, ...tl, l.u0, l.v0, ...br, l.u1, l.v1, ...tr, l.u1, l.v0); }
  return out;
}

// ---------- the overlay of one eye: beacons (model space, the page's MVP), then labels, panels and rays (reference space)
function after(v) {
  if (S.hiMesh) C.drawModelMesh(S.hiMesh);
  const mvp = M.mul(v.projectionMatrix, v.transform.inverse.matrix);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.DEPTH_TEST); gl.depthMask(false);
  if (LAB.tex) quads(mvp, LAB.tex, labelVerts());
  gl.depthMask(true); for (const p of S.panels) if (p.tex && !(S.hidePanels && (p === P.places || p === P.whatson))) quads(mvp, p.tex, p.verts(), 1);
  const L = [];
  for (const [, h] of S.hover) { const e = add(h.o, mulv(h.d, h.len)); L.push(...h.o, 1, 1, 1, .2, ...e, 1, 1, 1, .9); }
  if (S.lead) { const a = S.lead.a, b = toUser(S.lead.x, S.lead.y, S.lead.z); L.push(...a, 1, .84, .3, .95, ...b, 1, .84, .3, .95); }
  gl.depthMask(false); lines(mvp, L); droneMarker(mvp); const dots = []; for (const [, h] of S.hover) { const e = add(h.o, mulv(h.d, h.len)), s = .006 + h.len * .004; for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) dots.push(e[0] + dx * s, e[1] + dy * s, e[2], 1, 1, 1, .9); }
  gl.disable(gl.DEPTH_TEST); lines(mvp, dots, gl.TRIANGLES); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
  attribs(0); gl.enableVertexAttribArray(C.aP); gl.enableVertexAttribArray(C.aC); gl.useProgram(C.pr);
}

// ---------- input: rays from controllers, hands and gaze-and-pinch (transient pointers); select acts, squeeze grabs the table
function rayOf(frame, src) { const p = frame.getPose(src.targetRaySpace, S.ref); if (!p) return null; const m = p.transform.matrix; return { o: [m[12], m[13], m[14]], d: nrm([-m[8], -m[9], -m[10]]) }; }
function hitPanels(o, d) { let best = null; for (const p of S.panels) { if (S.hidePanels && (p === P.places || p === P.whatson)) continue; const h = p.hit(o, d); if (h && (!best || h.t < best.h.t)) best = { p, h }; } return best; }
function onSelect(ev) { const r = rayOf(ev.frame, ev.inputSource); if (r) click(r); }
function click(r) {
  const hp = hitPanels(r.o, r.d);
  if (hp) { if (hp.h.item) act(hp.h.item[4], hp.p, hp.h); return; }
  const mo = M.ap(S.Wi, r.o), md = nrm(M.dir(S.Wi, r.d));
  const near = nearestMarker(r.o, r.d); if (near) { if (near.kind !== 'building') focusOn(near); return; }
  const i = C.pickRay(mo, md); if (i >= 0) return focusBuilding(i);
  const g = groundHit(mo, md); if (g) { if (S.mode === 'table') { S.c = [g[0], groundY(g[0], g[2]), g[2]]; setW(); S.hiDirty = true; } else teleport(g[0], g[2]); }
}
function nearestMarker(o, d) {   // a label or beacon top within a small angle of the ray (the labels are the targets you see)
  let best = null; for (const l of LAB.items) { const p = toUser(l.x, l.y, l.z), q = sub(p, o), t = dot(q, d); if (t <= 0) continue; const off = len(sub(q, mulv(d, t))) / t; if (off < .045 && (!best || off < best.off)) best = { off, l }; }
  if (!best) return null; const l = best.l; if (l.focus) return null;
  if (l.mk) { const m = S.inView.markets.find(m => m.id === l.mk); if (m) return marketFocus(m); }
  if (l.ev) { const e = S.inView.events.find(e => Math.abs(e.x - l.x) < 1 && Math.abs(e.z - l.z) < 1); if (e) return eventFocus(e); }
  const p = S.data.places.find(p => p.x === l.x && p.z === l.z); return p ? placeFocus(p) : null;
}
function groundHit(o, d) { if (d[1] >= 0) return null; let t = 0, step = S.mode === 'table' ? 4 : 2; for (let k = 0; k < 6000; k++) { t += step; const p = add(o, mulv(d, t)); if (p[1] <= groundY(p[0], p[2])) return p; if (t > 30000) break; step *= 1.004; } return null; }
function teleport(x, z, face) { S.c = [x, groundY(x, z), z]; S.O = [S.head[0], 0, S.head[2]];
  if (face) { const a = Math.atan2(S.headF[0], -S.headF[2]), pm = Math.atan2(face[0] - x, -(face[1] - z)); S.yaw = pm - a; }   // a bearing turns by -yaw: face the target
  setW(); S.hiDirty = true; S.listSig = ''; }
// open ground near a point: the first spot on rings of 15 m steps that no model building outline holds
function freeSpot(x, z) {
  const A = C.A, near = []; for (const b of A.buildings) { const p = b.p; if (Math.abs(p[0] / 10 - x) < 400 && Math.abs(p[1] / 10 - z) < 400) near.push(C.dec(p)); }
  const inside = (px, pz) => near.some(f => { let c = false; for (let k = 0, j = f.length / 2 - 1; k < f.length / 2; j = k++) { const ax = f[2 * k], az = f[2 * k + 1], bx = f[2 * j], bz = f[2 * j + 1]; if ((az > pz) !== (bz > pz) && px < (bx - ax) * (pz - az) / (bz - az) + ax) c = !c; } return c; });
  for (let r = 18; r < 260; r += 15) for (let k = 0; k < 16; k++) { const a = k / 16 * 2 * Math.PI + r, px = x + r * Math.sin(a), pz = z + r * Math.cos(a); if (!inside(px, pz) && !inside(px + 3, pz) && !inside(px - 3, pz) && !inside(px, pz + 3) && !inside(px, pz - 3)) return [px, pz]; }
  return [x + 30, z + 30];
}
function act(a, pn) {
  const [k, v] = a.split(':');
  if (k === 'cat') { S.cats.has(v) ? S.cats.delete(v) : S.cats.add(v); S.hiDirty = true; pn.dirty = true; }
  else if (a === 'catsoff') { S.cats.clear(); S.hiDirty = true; pn.dirty = true; }
  else if (a === 'open') { S.openNow = !S.openNow; pn.dirty = true; loadOpen().then(() => { if (OPEN) OPEN.cache.clear(); S.hiDirty = true; pn.dirty = true; }).catch(e => C.toast('Opening hours did not load: ' + e.message)); }
  else if (k === 'win') { S.win = +v; S.listSig = ''; updateLists(); }
  else if (a === 'works') { S.works = !S.works; S.hiDirty = true; pn.dirty = true; }
  else if (k === 'ev') { const e = S.inView.events.find(e => e.id === a.slice(3)); if (e) { focusOn(eventFocus(e)); const hit = pn.hits.find(h => h[4] === a); if (hit) S.lead = { a: add(pn.c, add(mulv(pn.R, -pn.w / 2), mulv(pn.U, (.5 - (hit[1] + hit[3]) / 2 / pn.cv.height) * pn.h))), x: e.x, y: C.groundAt(e.x, e.z) + 20, z: e.z }; } }
  else if (k === 'mk') { const m = S.inView.markets.find(m => m.id === a.slice(3)); if (m) focusOn(marketFocus(m)); }
  else if (k === 'mode') setMode(v);
  else if (a === 'plus' || a === 'minus') { const up = a === 'plus'; if (S.mode === 'table') { S.s = clamp(S.s * (up ? 1.5 : 1 / 1.5), 1 / 20000, 1 / 40); } else S.lift = clamp(S.lift + (up ? 30 : -30), 0, 600); setW(); S.hiDirty = true; }
  else if (a === 'turnL' || a === 'turnR') { S.yaw += (a === 'turnL' ? -1 : 1) * 30 * DEG; setW(); S.listSig = ''; }
  else if (a === 'night') { C.setNight(!C.NIGHT().on); pn.dirty = true; }
  else if (a === 'recentre') { S.placed = false; }
  else if (a === 'floorUp' || a === 'floorDn') { const d = a === 'floorUp' ? .1 : -.1; if (S.mode === 'table') { S.O = [S.O[0], S.O[1] + d, S.O[2]]; S.Otable = S.O; } else S.lift = clamp(S.lift - d * 10, 0, 600); setW(); }
  else if (a === 'style') { const LS = globalThis.DocklandsLines, cur = C.lineOn() ? LS.mode : 'normal', next = { normal: 'lines', lines: 'vectrex', vectrex: 'normal' }[cur]; C.setStyle(next).then(() => { pn.dirty = true; S.hiDirty = true; }); }
  else if (a === 'sky') { S.sky = { auto: 'city', city: 'off', off: 'auto' }[S.sky]; pn.dirty = true; }
  else if (a === 'photo') { S.snap = true; }
  // Drone: a press always moves on round the vehicles (one that cannot start here does not hold the cycle)
  else if (a === 'drone') { const Dr = globalThis.DocklandsDrone; if (!Dr) return; S.dIdx = droneOn() ? ((S.dIdx || 0) + 1) % DRONES.length : 1; const next = DRONES[S.dIdx];
    if (!next) { Dr.stop(); if (S.mode === 'ride') setMode('table'); } else { Dr.manual(true); if (!Dr.on) { const cam = C.cam; delete cam.eye; delete cam.target; Object.assign(cam, { tx: S.c[0], tz: S.c[2], ty: 0, dist: 400, pitch: .5, yaw: -S.yaw - S.base.a * DEG }); }
    Dr.start(next).then(ok => { if (ok === false) C.toast('That vehicle cannot start here'); else if (S.ride) startRide(); pn.dirty = true; }); } pn.dirty = true; }
  else if (a === 'ride') { S.ride = !S.ride; if (droneOn()) { if (S.ride) startRide(); else if (S.mode === 'ride') setMode('table'); } pn.dirty = true; }
  else if (a === 'view') { S.view = (S.view + 1) % VIEWS.length; goView(VIEWS[S.view][0]); pn.dirty = true; }
  else if (a === 'exit') S.session.end();
  else if (a === 'go') { const f = S.focus; if (f) { if (S.mode !== 'street') setMode('street', f); else { const [x, z] = freeSpot(f.x, f.z); teleport(x, z, [f.x, f.z]); } } }
  else if (a === 'centre') { const f = S.focus; if (f) { S.c = [f.x, groundY(f.x, f.z), f.z]; setW(); S.hiDirty = true; } }
}
function marketFocus(m) { return { kind: 'market', id: m.id, title: m.title.replace(/:.*$/, ''), sub: `Market · ${m.where}`, lines: [m.next ? (m.next.open ? 'Open now' : 'Next: ' + m.next.label) : '', 'Hours: ' + m.hours, 'Source: OpenStreetMap (© OpenStreetMap contributors)', ...eventsNear(m.x, m.z)].filter(Boolean), x: m.x, z: m.z }; }
function focusOn(f) { S.focus = f; if (f.kind !== 'event') S.lead = null; S.hiDirty = true; P.focus.dirty = P.whatson.dirty = true; }
function eventFocus(e) { const same = S.data.events.filter(x => Math.abs(x.x - e.x) < 60 && Math.abs(x.z - e.z) < 60 && x.t0 != null && x.t0 >= now() - 3 * 3600e3 && x.id !== e.id).sort((a, b) => a.t0 - b.t0).slice(0, 3);
  return { kind: 'event', id: e.id, title: e.title, sub: `${fmtT(e.t0, e.allDay)} · ${e.where}`, x: e.x, z: e.z, lines: [`${km(e.v ? e.v.dist : 0)} away · listing: ${e.src}`, e.url ? 'Link: ' + e.url.replace(/^https?:\/\//, '') : '', ...(same.length ? ['Also here:', ...same.map(x => `  ${fmtT(x.t0, x.allDay)} · ${x.title}`)] : [])].filter(Boolean) }; }
function placeFocus(p) { if (p.src === 'registry') { const b = C.AT().buildings[p.k]; if (b && b.mi && b.mi.length) return focusBuilding(b.mi[0]); }
  return { kind: 'place', title: p.name, sub: `${CAT_LABEL[p.cat]}${p.kind ? ' · ' + p.kind : ''} · ${p.src === 'osm' ? 'OpenStreetMap ' + p.osm : 'GLA Cultural Infrastructure Map'}`, x: p.x, z: p.z, top: p.top, lines: [eventsNear(p.x, p.z)].flat().filter(Boolean) }; }
function eventsNear(x, z) { if (!S.data) return []; const t = now(), ev = S.data.events.filter(e => e.t0 != null && e.t0 >= t - 3 * 3600e3 && Math.hypot(e.x - x, e.z - z) < 150).sort((a, b) => a.t0 - b.t0).slice(0, 3);
  return ev.length ? ['Coming up here:', ...ev.map(e => `  ${fmtT(e.t0, e.allDay)} · ${e.title}`)] : []; }
function focusBuilding(i) {   // the page's own card (registry or OpenStreetMap) is the source of truth: read its text
  const b = C.A.buildings[i], fx = (() => { const f = C.dec(b.p); let x = 0, z = 0; for (let k = 0; k < f.length; k += 2) { x += f[k]; z += f[k + 1]; } return [x / (f.length / 2), z / (f.length / 2)]; })();
  const f = { kind: 'building', i, title: 'Building', sub: 'Reading its card…', x: fx[0], z: fx[1], top: b.b + C.heightOf(b, i), lines: [] }; focusOn(f); C.selectModel(i);
  const read = () => { if (S.focus !== f) return; const el = $('info'); if (!el) return; const t = el.innerText.split('\n').map(s => s.trim()).filter(s => s && !/^(Route (from|to) here|OSM|clear|Share)/.test(s));
    if (!t.length) return; f.title = t[0].replace(/\s+(OSM (way|relation) \d+.*|cwb-\d+.*)$/, ''); f.sub = t[0].slice(f.title.length).replace(/^ · /, '').trim() || t[1] || ''; f.lines = [...t.slice(1, 9), ...eventsNear(f.x, f.z)]; P.focus.dirty = true; S.hiDirty = true; };
  setTimeout(read, 300); setTimeout(read, 1500); setTimeout(read, 4000); return f;
}
function setMode(m, at) {
  if (S.mode === 'ride' && m !== 'ride' && S.preRide) S.s = S.preRide.s;
  S.mode = m; const f = at || S.focus;
  if (m === 'street') { S.s = 1; S.lift = 0; if (f && f.x != null) { const [x, z] = freeSpot(f.x, f.z); teleport(x, z, [f.x, f.z]); } else { const [x, z] = freeSpot(S.c[0], S.c[2]); teleport(x, z); } }
  else { S.s = S.sTable || 1 / 1500; S.O = S.Otable || S.O; if (f && f.x != null) S.c = [f.x, groundY(f.x, f.z), f.z]; }
  if (m === 'table') S.sTable = S.s; renderState(); setW(); S.hiDirty = true; S.listSig = ''; P.bar.dirty = true;
}
function renderState() { const st = S.mode === 'street' || S.mode === 'ride'; try { S.session.updateRenderState({ depthNear: st ? .25 : .08, depthFar: st ? 16000 : 60 }); } catch { /* preview */ } }

// ---------- presses: a short press is a click (on the ray of the frame before the pinch); a press that moves drags.
// On empty space one hand moves the city (up and down too), two hands turn it and change its size; on a panel's
// title (the bar's left end) the hand moves the panel. Hands, controllers and gaze-and-pinch all give selectstart/end.
const handPos = (frame, src) => { const p = frame.getPose(src.gripSpace || src.targetRaySpace, S.ref); if (!p) return null; const m = p.transform.matrix; return [m[12], m[13], m[14]]; };
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
  S.two = { a, b, a0: a.pos, b0: b.pos, d0: Math.max(.02, len(sub(b.pos, a.pos))), ang0: bearing(sub(b.pos, a.pos)), s0: S.s, yaw0: S.yaw, m0: M.ap(S.Wi, mid), c0: S.c.slice() };
}
function drags(frame) {
  for (const rec of S.press.values()) { const p = handPos(frame, rec.src); if (!p) continue; rec.pos = p; rec.moved = Math.max(rec.moved, len(sub(p, rec.pos0))); if (rec.moved > .025) rec.drag = true; }
  const T = S.two;
  if (T) { const a = T.a.pos, b = T.b.pos, mid = mulv(add(a, b), .5), k = len(sub(b, a)) / T.d0, dA = bearing(sub(b, a)) - T.ang0;
    S.yaw = T.yaw0 - dA;
    if (S.mode === 'table') { S.s = clamp(T.s0 * k, 1 / 30000, 1 / 30); S.sTable = S.s; const v = M.dir(M.Ry(S.yaw), mulv(sub(T.m0, S.c), S.s)); S.O = sub(mid, v); S.Otable = S.O; }
    setW(); S.hiDirty = true; return; }
  for (const rec of S.press.values()) {
    if (!rec.drag) continue;
    if (rec.kind === 'panel') { const r = rayOf(frame, rec.src); if (!r) continue; rec.panel.moveTo(sub(add(r.o, mulv(r.d, rec.dist)), rec.off)); continue; }
    if (rec.kind !== 'world') continue; const d = sub(rec.pos, rec.pos0);
    if (S.mode === 'table') { S.O = add(rec.O0, d); S.Otable = S.O; }
    else if (S.mode === 'ride') continue;
    else { const g = 30, v = M.dir(M.Ry(-S.yaw), [d[0], 0, d[2]]); S.c = [rec.c0[0] - v[0] * g, 0, rec.c0[2] - v[2] * g]; S.c[1] = groundY(S.c[0], S.c[2]); }
    setW();
  }
}
// Drone (drone.js): stepped from the headset frame (the window's own animation loop pauses in an immersive session).
// Watch: the drone flies over the table, marked; Ride: you sit at its eye at full scale, the world turning with its heading.
const DRONES = [null, 'copter', 'plane', 'boat', 'tube', 'walk', 'under'], droneOn = () => !!(globalThis.DocklandsDrone && DocklandsDrone.on);
const droneName = () => droneOn() ? DocklandsDrone.S.mode.replace(/^./, c => c.toUpperCase()) : 'Off';
function startRide() { if (S.mode !== 'ride') { S.preRide = { s: S.s }; } S.mode = 'ride'; S.s = 1; S.rideO = [S.base.p[0], S.head[1], S.base.p[2]]; renderState(); rideFollow(1); S.hiDirty = true; P.bar.dirty = true; }
function rideFollow(k) { const Dr = DocklandsDrone.S, p = Dr.p, h = Dr.h + (Dr.ly || 0); S.c = [p[0], p[1] * vz(), p[2]];
  const want = Math.atan2(Math.sin(h), -Math.cos(h)) - S.base.a * DEG; let d = want - S.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); S.yaw += d * k; setW(); }
function droneFrame(t) {
  if (!droneOn()) { if (S.mode === 'ride') setMode('table'); S.droneT = t; return; }
  const dt = clamp((t - (S.droneT || t)) / 1000, 0, .1); S.droneT = t; DocklandsDrone.step(dt, 120);
  if (S.mode === 'ride') rideFollow(1 - Math.exp(-dt / .35));
}
// the page's named views: a photo view (an eye point) puts you at street level there; the others centre the table
const VIEWS = [['cw', 'Canary Wharf'], ['rotherhithe', 'Rotherhithe night'], ['greenland', 'Greenland'], ['pier', 'Pier'], ['greenlandday', 'Greenland day'], ['plane', 'Plane'], ['area', 'Area']];
function goView(k) {
  const D = window.__docklands; if (!D || !D.setView) return; D.setView(k); const cam = C.cam;
  if (cam.eye) { const [ex, ey, ez] = cam.eye, g = C.groundAt(ex, ez); setMode('street'); teleport(ex, ez, cam.target ? [cam.target[0], cam.target[2]] : null); S.lift = clamp(ey - g - S.head[1], 0, 600); setW(); }
  else { setMode('table'); S.c = [cam.tx, groundY(cam.tx, cam.tz), cam.tz]; setW(); }
  S.hiDirty = true; S.listSig = '';
}
// a marker for the drone over the table (Watch): a small diamond in the reference space
function droneMarker(mvp) { if (!droneOn() || S.mode === 'ride') return; const p = DocklandsDrone.S.p, q = toUser(p[0], p[1], p[2]), r = .012, c = [.3, 1, 1, .95], v = [];
  const pts = [[r, 0, 0], [0, 0, r], [-r, 0, 0], [0, 0, -r]]; for (let i = 0; i < 4; i++) { const a = add(q, pts[i]), b = add(q, pts[(i + 1) % 4]); for (const tip of [add(q, [0, r * 1.4, 0]), add(q, [0, -r * 1.4, 0])]) v.push(...a, ...c, ...b, ...c, ...tip, ...c); }
  lines(mvp, v, gl.TRIANGLES); }
// the sky's view: the eye's rotation and the model's yaw, no scale and no translation (the table is 1:1500)
function skyViewOf(v) { const m = new Float32Array(v.transform.inverse.matrix); m[12] = m[13] = m[14] = 0; return M.mul(m, M.Ry(S.yaw)); }
// a picture of the left eye, kept until the session ends (the page offers them then)
function snapshot(fb, vp) {
  try { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); const w = vp.width, h = vp.height, px = new Uint8Array(w * h * 4); gl.readPixels(vp.x, vp.y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), im = g.createImageData(w, h);
    for (let y = 0; y < h; y++) im.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); for (let i = 3; i < im.data.length; i += 4) im.data[i] = 255; g.putImageData(im, 0, 0);
    cv.toBlob(b => { if (b) { S.photos.push({ url: URL.createObjectURL(b), t: new Date() }); P.bar.dirty = true; } }, 'image/png'); }
  catch (e) { C.toast('Photo failed: ' + e.message); }
}
function offerPhotos() {
  if (!S.photos.length) return; const box = document.createElement('div'); box.style.cssText = 'position:fixed;z-index:60;left:50%;transform:translateX(-50%);bottom:90px;background:#11151b;border:1px solid #2a313a;border-radius:14px;padding:12px 14px;color:#eef2f6;font:500 15px system-ui;max-width:90vw';
  box.innerHTML = `<div style="margin-bottom:6px">Headset photos: ${S.photos.length}</div>` + S.photos.map((p, i) => `<a style="color:#8cc4ff;margin-right:10px" download="docklands-headset-${p.t.toISOString().slice(0, 19).replace(/:/g, '')}.png" href="${p.url}">Photo ${i + 1}</a>`).join('') + ' <button style="margin-left:8px">Close</button>';
  box.querySelector('button').onclick = () => box.remove(); document.body.appendChild(box);
}

// ---------- the frame loop
function place(pose) {
  const m = pose.transform.matrix, f = nrm([-m[8], 0, -m[10]]), a = Math.atan2(f[0], -f[2]); S.base = { a: a / DEG, p: [m[12], m[13], m[14]], far: S.preview && C.cv.width < C.cv.height * 1.2 ? 1.35 : 1 };
  for (const p of S.panels) { p.layout(S.base); p.dirty = true; }
  if (S.mode === 'table') { S.O = [m[12] + f[0] * 1.05, S.floor ? .76 : m[13] - .85, m[14] + f[2] * 1.05]; S.Otable = S.O; S.yaw = -a - C.cam.yaw; } else S.yaw = -a - C.cam.yaw;
  S.floorY = S.floor ? 0 : m[13] - 1.6; setW(); S.placed = true; S.listSig = '';
}
function onFrame(t, frame) {
  const s = S.session; if (!s) return; s.requestAnimationFrame(onFrame);
  const pose = frame.getViewerPose(S.ref); if (!pose) return; const m = pose.transform.matrix;
  S.head = [m[12], m[13], m[14]]; S.headF = nrm([-m[8], -m[9], -m[10]]);
  if (!S.placed) place(pose);
  droneFrame(t);
  for (const [src, h] of S.hover) S.lastRay.set(src, h); S.hover.clear(); drags(frame);
  for (const src of s.inputSources) { const r = rayOf(frame, src); if (!r) continue; const hp = hitPanels(r.o, r.d); S.hover.set(src, { ...r, len: hp ? hp.h.t : 3 });
    for (const p of S.panels) { const hv = hp && hp.p === p && hp.h.item ? hp.h.item[4] : null; if (p.hov !== hv) { p.hov = hv; p.dirty = true; if (hv) buzz(src, .12, 12); } }
    const gp = src.gamepad; if (gp) pad(gp, src);
    if (S.grab && S.grab.src === src && S.mode === 'table') { S.O = add(S.grab.O, sub(r.o, S.grab.o)); S.Otable = S.O; setW(); } }
  if (t - S.listT > 450) { S.listT = t; updateLists(); }
  if (S.hiDirty) buildHighlights();
  for (const p of S.panels) if (p.dirty) p.redraw();
  const L = s.renderState.baseLayer, tbl = S.mode === 'table', night = C.NIGHT().on, noSky = S.sky === 'off' || (S.ar && !night), K = globalThis.DocklandsSky;
  // Sky: Dark (the default: the dark-site sky with the Milky Way, also over passthrough at night), City (London's sky glow), Off
  if (K && K.S) K.S.dark = S.sky === 'auto';
  let first = true;
  for (const v of pose.views) {
    const vp = L.getViewport(v), view = M.mul(v.transform.inverse.matrix, S.W), vm = v.transform.matrix, eye = M.ap(S.Wi, [vm[12], vm[13], vm[14]]), fw = nrm(M.dir(S.Wi, [-vm[8], -vm[9], -vm[10]]));
    XR.view = { fb: L.framebuffer, x: vp.x, y: vp.y, w: vp.width, h: vp.height, proj: v.projectionMatrix, view, eye, target: add(eye, mulv(fw, 100)), noSky, skyView: skyViewOf(v), clear: S.ar && noSky ? [0, 0, 0, 0] : tbl ? [.075, .085, .1, 1] : null, after: () => after(v) };
    try { C.render(); } finally { XR.view = null; }
    if (first && S.snap) { S.snap = false; snapshot(L.framebuffer, vp); } first = false;
  }
  if (S.preview) S.prevDrawn = true;
}
let stickT = 0;
// controllers (xr-standard mapping): right stick turns and zooms (table) or snap-turns and walks (street); left stick
// moves over the map or strafes; A Table/Street, B Night/Day, X Recentre, Y hide or show the side panels,
// right stick press Photo; a pulse on hover and on a click
function buzz(src, k, ms) { const h = src && src.gamepad && src.gamepad.hapticActuators && src.gamepad.hapticActuators[0]; try { if (h && h.pulse) h.pulse(k, ms); } catch { /* no haptics */ } }
function pad(gp, src) {
  S.pads = true; const B = gp.buttons || [], was = S.btn.get(src) || [], down = B.map(b => !!(b && b.pressed)); S.btn.set(src, down);
  const hit = i => down[i] && !was[i], right = src.handedness !== 'left';
  if (hit(4)) act(right ? (S.mode === 'table' ? 'mode:street' : 'mode:table') : 'recentre', P.bar);
  if (hit(5)) { if (right) act('night', P.bar); else { S.hidePanels = !S.hidePanels; } }
  if (hit(3) && right) act('photo', P.bar);
  if (gp.axes && gp.axes.length >= 4) { if (right) stick(gp.axes[2], gp.axes[3]); else move(gp.axes[2], gp.axes[3]); }
}
function move(x, y) {
  const dz = .2; if (Math.abs(x) < dz && Math.abs(y) < dz) return; if (S.mode === 'ride') return;
  const f = [S.headF[0], 0, S.headF[2]], fl = Math.hypot(f[0], f[2]) || 1, fw = [f[0] / fl, 0, f[2] / fl], rt = [-fw[2], 0, fw[0]];
  const k = S.mode === 'table' ? .012 : .9, v = add(mulv(fw, -y * k), mulv(rt, x * k)), d = M.dir(S.Wi, v);
  S.c = [S.c[0] + d[0], 0, S.c[2] + d[2]]; S.c[1] = groundY(S.c[0], S.c[2]); setW(); S.listT = 0;
}
function stick(x, y) {
  if (S.mode === 'ride' && droneOn()) { DocklandsDrone.stick(Math.abs(x) > .2 ? x : 0, Math.abs(y) > .2 ? -y : 0); return; }
  const dz = .25; if (Math.abs(x) < dz && Math.abs(y) < dz) return;
  if (S.mode === 'table') { S.yaw += x * .03; if (Math.abs(y) > dz) S.s = clamp(S.s * (1 - y * .02), 1 / 20000, 1 / 40); S.sTable = S.s; setW(); S.hiDirty = Math.abs(y) > dz || S.hiDirty; return; }
  const n = performance.now(); if (Math.abs(x) > .7 && n - stickT > 350) { stickT = n; S.yaw += Math.sign(x) * 30 * DEG; setW(); S.listSig = ''; }
  if (Math.abs(y) > dz) { const f = nrm(M.dir(S.Wi, [S.headF[0], 0, S.headF[2]])), sp = -y * 6; S.c = [S.c[0] + f[0] * sp, 0, S.c[2] + f[2] * sp]; S.c[1] = groundY(S.c[0], S.c[2]); setW(); }
}

// ---------- sessions: a real one (immersive-vr or immersive-ar) or the preview on the page canvas
async function start(kind) {
  if (S.session) return; const prev = kind === 'preview';
  if (C.PIX().on) await C.setStyle('normal');
  const tr = $('showTrees'); if (tr && !tr.checked) { tr.checked = true; tr.onchange(); }
  if (!TP) progs(); if (!S.panels.length) makePanels();
  let session;
  if (prev) session = new PreviewSession();
  else { await gl.makeXRCompatible(); session = await navigator.xr.requestSession(kind, { optionalFeatures: ['local-floor', 'hand-tracking'] }); }
  S.session = session; S.preview = prev; S.ar = kind === 'immersive-ar';
  if (!prev) session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl, { antialias: true, alpha: S.ar, depth: true, stencil: true }) });
  try { S.ref = await session.requestReferenceSpace('local-floor'); S.floor = true; } catch { S.ref = await session.requestReferenceSpace('local'); S.floor = false; }
  S.mode = 'table'; S.s = 1 / 1500; const T = [C.cam.tx, C.cam.tz]; S.c = [T[0], groundY(T[0], T[1]), T[1]]; S.placed = false; renderState();
  session.addEventListener('selectstart', onPressStart); session.addEventListener('selectend', onPressEnd);
  session.addEventListener('squeezestart', onPressStart); session.addEventListener('squeezeend', ev => { const rec = S.press.get(ev.inputSource); if (rec) rec.drag = true; onPressEnd(ev); });
  const K0 = globalThis.DocklandsSky, dark0 = K0 && K0.S ? K0.S.dark : null;
  session.addEventListener('end', () => { if (dark0 != null) K0.S.dark = dark0; if (droneOn()) DocklandsDrone.manual(false); S.session = null; XR.active = false; XR.view = null; S.grab = null; S.press.clear(); S.two = null; offerPhotos(); gl.bindFramebuffer(gl.FRAMEBUFFER, null); if ($('labels')) $('labels').style.visibility = ''; C.draw(); });
  XR.active = true; if ($('labels')) $('labels').style.visibility = 'hidden';
  loadData().catch(e => C.toast('Listings did not load: ' + e.message));
  session.requestAnimationFrame(onFrame);
}
// one eye on the page canvas: drag to look round, tap to select, the pad: the control bar; Exit or Esc ends it
class PreviewSession {
  constructor() { this.ev = {}; this.inputSources = []; this.renderState = { baseLayer: { framebuffer: null, getViewport: () => ({ x: 0, y: 0, width: C.cv.width, height: C.cv.height }) }, depthNear: .02, depthFar: 80 };
    this.yaw = 0; this.pitch = -.42; this.cb = null; this.dirty = true; const cv = C.cv, sel = [];
    const ray = (cx, cy) => { const r = cv.getBoundingClientRect(), nx = (cx - r.left) / r.width * 2 - 1, ny = 1 - (cy - r.top) / r.height * 2, fy = this.fov(), a = cv.width / cv.height, t = Math.tan(fy / 2);
      const d = [nx * t * a, ny * t, -1], H = this.headM(); return { o: [H[12], H[13], H[14]], d: nrm(M.dir(H, d)) }; };
    this.ptr = null; const block = e => { e.stopImmediatePropagation(); e.preventDefault(); };
    this.h = { down: e => { if (e.target !== cv) return; block(e); this.ptr = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; },
      move: e => { if (!this.ptr) { if (e.target === cv) { const r = ray(e.clientX, e.clientY); this.hoverRay = r; this.dirty = true; } return; } block(e); this.yaw -= (e.clientX - this.ptr.x) * .004; this.pitch = clamp(this.pitch - (e.clientY - this.ptr.y) * .004, -1.4, 1.2); this.ptr.x = e.clientX; this.ptr.y = e.clientY; this.dirty = true; },
      up: e => { if (!this.ptr) return; block(e); const tap = Math.hypot(e.clientX - this.ptr.x0, e.clientY - this.ptr.y0) < 8; this.ptr = null; if (tap) { const r = ray(e.clientX, e.clientY); this.fire('select', r); } this.dirty = true; },
      wheel: e => { if (e.target !== cv) return; block(e); act(e.deltaY < 0 ? 'plus' : 'minus', P.bar); this.dirty = true; },
      key: e => { if (e.key === 'Escape') this.end(); }, click: e => { if (e.target === cv) block(e); } };
    for (const [n, f] of [['pointerdown', 'down'], ['pointermove', 'move'], ['pointerup', 'up'], ['wheel', 'wheel'], ['click', 'click'], ['keydown', 'key']]) window.addEventListener(n, this.h[f], { capture: true, passive: false });
    this.btn = document.createElement('button'); this.btn.textContent = 'Exit headset preview'; this.btn.style.cssText = 'position:fixed;z-index:50;left:50%;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top));padding:10px 16px;border-radius:20px;border:0;background:#9c2b2b;color:#fff;font:600 15px system-ui';
    this.btn.onclick = () => this.end(); document.body.appendChild(this.btn); this.loop(); }
  fov() { return C.cv.width < C.cv.height ? 1.45 : 1.15; }
  headM() { return M.mul(M.T(0, 1.6, 0), M.mul(M.Ry(this.yaw), (() => { const o = M.I(), c = Math.cos(this.pitch), s = Math.sin(this.pitch); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; })())); }
  fire(n, r) { const src = { targetRayMode: 'screen', handedness: 'none', targetRaySpace: { r } }, fr = this.frameObj(); if (n === 'select') { for (const k of ['selectstart', 'selectend']) for (const f of this.ev[k] || []) f({ inputSource: src, frame: fr }); return; } for (const f of this.ev[n] || []) f({ inputSource: src, frame: fr }); }
  frameObj() { const H = this.headM(), inv = inverseRigid(H), a = C.cv.width / C.cv.height, view = { eye: 'none', projectionMatrix: M.persp(this.fov(), a, this.renderState.depthNear, this.renderState.depthFar), transform: { matrix: H, inverse: { matrix: inv } } };
    return { getViewerPose: () => ({ transform: { matrix: H }, views: [view] }), getPose: sp => { const r = sp.r; const z = nrm(mulv(r.d, -1)), x = nrm(cross([0, 1, 0], z)), y = cross(z, x); return { transform: { matrix: new Float32Array([...x, 0, ...y, 0, ...z, 0, ...r.o, 1]) } }; } }; }
  loop() { if (this.ended) return; requestAnimationFrame(() => this.loop()); if (!this.cb) return; const due = this.dirty || S.hiDirty || droneOn() || S.panels.some(p => p.dirty) || performance.now() - (this.last || 0) > 900; if (!due) return;
    this.dirty = false; this.last = performance.now(); const cb = this.cb; this.cb = null; this.inputSources = this.hoverRay ? [{ targetRayMode: 'screen', targetRaySpace: { r: this.hoverRay } }] : []; cb(performance.now(), this.frameObj()); }
  requestAnimationFrame(cb) { this.cb = cb; return 1; }
  updateRenderState(s) { Object.assign(this.renderState, s); this.dirty = true; }
  requestReferenceSpace(t) { return t === 'local-floor' ? Promise.resolve({ t }) : Promise.resolve({ t }); }
  addEventListener(n, f) { (this.ev[n] ||= []).push(f); }
  end() { if (this.ended) return; this.ended = true; for (const [n, f] of [['pointerdown', 'down'], ['pointermove', 'move'], ['pointerup', 'up'], ['wheel', 'wheel'], ['click', 'click'], ['keydown', 'key']]) window.removeEventListener(n, this.h[f], { capture: true });
    this.btn.remove(); for (const f of this.ev.end || []) f({}); }
}
function inverseRigid(m) { const o = new Float32Array(16); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[c * 4 + r] = m[r * 4 + c]; for (let r = 0; r < 3; r++) o[12 + r] = -(o[r] * m[12] + o[4 + r] * m[13] + o[8 + r] * m[14]); o[15] = 1; return o; }

// ---------- the button (shown when the browser has WebXR; ?xr=preview also offers the preview), and the hooks
async function init(ctx) {
  C = ctx; gl = ctx.gl;
  const xr = navigator.xr, vr = xr && await xr.isSessionSupported('immersive-vr').catch(() => false), ar = xr && await xr.isSessionSupported('immersive-ar').catch(() => false), wantPrev = /[?&]xr=preview\b/.test(location.search);
  if (!vr && !ar && !wantPrev) return;
  let box = $('locBtns'); for (let k = 0; !box && k < 100; k++) { await new Promise(r => setTimeout(r, 100)); box = $('locBtns'); }   // locate.js makes the button box
  if (!box) return;
  box.insertAdjacentHTML('afterbegin', `<button class="ib" id="xrBtn" type="button" aria-label="${vr || ar ? 'View in a headset (WebXR)' : 'Headset preview'}" title="${vr || ar ? 'View in a headset (WebXR)' : 'Headset preview'}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 8.5C3 7.1 4.1 6 5.5 6h13C19.9 6 21 7.1 21 8.5v6c0 1.4-1.1 2.5-2.5 2.5h-3.2c-.8 0-1.5-.4-1.9-1.1l-.6-1c-.4-.7-1.2-.7-1.6 0l-.6 1c-.4.7-1.1 1.1-1.9 1.1H5.5C4.1 17 3 15.9 3 14.5z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="11.5" r="1.6" class="f"/><circle cx="16" cy="11.5" r="1.6" class="f"/></svg></button>`);
  $('xrBtn').onclick = () => { const kinds = [vr && ['immersive-vr', 'Headset: virtual room'], ar && ['immersive-ar', 'Headset: your own room (passthrough)'], ['preview', 'Preview on this screen']].filter(Boolean);
    if (kinds.length === 1) return start(kinds[0][0]).catch(e => C.toast('Headset view did not start: ' + e.message));
    const m = document.createElement('div'); m.style.cssText = 'position:fixed;z-index:60;right:64px;bottom:120px;display:flex;flex-direction:column;gap:8px;background:#11151b;border:1px solid #2a313a;border-radius:14px;padding:10px';
    for (const [k, t] of kinds) { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'padding:10px 14px;border-radius:10px;border:0;background:#1f2731;color:#eef2f6;font:500 15px system-ui;text-align:left'; b.onclick = () => { m.remove(); start(k).catch(e => C.toast('Headset view did not start: ' + e.message)); }; m.appendChild(b); }
    document.body.appendChild(m); setTimeout(() => window.addEventListener('pointerdown', function off(e) { if (!m.contains(e.target)) { m.remove(); window.removeEventListener('pointerdown', off, true); } }, true), 0); };
  if (wantPrev && /[?&]xr=preview&?go\b|[?&]xrgo\b/.test(location.search)) start('preview');
}
Object.assign(XR, { init, start, S, P, act, onSelect, updateLists, loadData, LAB, toUser, setMode, get panels() { return S.panels; } });
if (globalThis.DocklandsXRCtx) init(globalThis.DocklandsXRCtx);
})();
