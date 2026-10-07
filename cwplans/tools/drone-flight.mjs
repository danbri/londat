#!/usr/bin/env node
// drone-flight.mjs: a synthetic drone flight over the Canary Wharf 3D model (docklands/data/area.js), for
// Gaussian-splat training captures (drone-capture.mjs renders it). Module and CLI.
//
//   node cwplans/tools/drone-flight.mjs                      # plan, check, print statistics
//   node cwplans/tools/drone-flight.mjs --out path.json      # also write the 30 fps path
//   node cwplans/tools/drone-flight.mjs --svg plan.svg       # top-down plan of the path
//   node cwplans/tools/drone-flight.mjs --coverage 480       # estimate building coverage for 480 frames
//
// Coordinates are model metres: x = E - 537550 (east), y = m above Ordnance Datum (up), z = -(N - 180300) (south).
// The flight: centripetal Catmull-Rom splines through eye and look-target waypoints; speed limited by turn rate,
// lateral and along-track acceleration; yaw and pitch smoothed in time and rate-checked; every point at least
// CLEAR m from every building prism and MIN_AGL m above the terrain (waypoints are raised until that holds).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CW = path.resolve(HERE, '..');
export const D2R = Math.PI / 180, R2D = 180 / Math.PI;
// The Canary Wharf Group estate (Westferry Circus to Wood Wharf, North Dock to South Dock) and the neighbourhood around it.
// Outline (x, z) of the estate as flown here: the North Dock and Crossrail Place, Westferry Circus and Canary Riverside, Cabot
// Square, Newfoundland, Heron Quays and Bank Street (to the South Dock quay), Churchill Place, Wood Wharf (to the South Dock
// and Blackwall Basin). Landmark Pinnacle and Marsh Wall are outside it, in the neighbourhood ring.
export const ESTATE_POLY = [[-640, -260], [500, -260], [500, -20], [770, -20], [770, 355], [370, 355], [300, 292], [-370, 292], [-370, 140], [-640, 120]];
export function inEstate(x, z) { let c = false; const P = ESTATE_POLY; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; }
export const ESTATE = { x0: -640, x1: 770, z0: -260, z1: 355 };
export const MARGIN = 300;
export const NEAR = { x0: ESTATE.x0 - MARGIN, x1: ESTATE.x1 + MARGIN, z0: ESTATE.z0 - MARGIN, z1: ESTATE.z1 + MARGIN };
export const LIMITS = { CLEAR: 30, MIN_AGL: 15, ALT_MIN: 40, ALT_MAX: 350, PITCH_MIN: 10, PITCH_MAX: 70, YAW_RATE: 15, ACC_LONG: 0.6, ACC_LAT: 1.5, TURN_RATE: 10 };

// ---------- model
export function dec(q, stride = 2) { const o = new Float64Array(q.length), acc = new Array(stride).fill(0); for (let i = 0; i < q.length; i++) { acc[i % stride] += q[i]; o[i] = acc[i % stride] / 10; } return o; }

let MODEL = null;
export function loadModel() {
  if (MODEL) return MODEL;
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(CW, 'docklands/data/area.js'), 'utf8'), ctx);
  const A = ctx.DOCKLANDS_AREA, T = A.terrain;
  const groundAt = (x, z) => {   // bilinear over the 20 m DTM grid
    const fx = Math.max(0, Math.min(T.nx - 1.001, (x - T.x0) / T.cell)), fz = Math.max(0, Math.min(T.nz - 1.001, (z - T.z0) / T.cell)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, h = (a, b) => T.dm[b * T.nx + a] / 10;
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };
  const bld = A.buildings.map((b, i) => {
    const f = dec(b.p), nv = f.length / 2; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let k = 0; k < nv; k++) { x0 = Math.min(x0, f[2 * k]); x1 = Math.max(x1, f[2 * k]); z0 = Math.min(z0, f[2 * k + 1]); z1 = Math.max(z1, f[2 * k + 1]); }
    return { i, f, nv, starts: [0, ...(b.holes || []), nv], y0: b.b + (b.mh || 0), y1: b.b + b.h, s: b.s, x0, x1, z0, z1 };
  });
  // 50 m grid index of building bounding boxes
  const G = 50, grid = new Map(), key = (i, j) => i * 100003 + j;
  for (const b of bld) for (let i = Math.floor(b.x0 / G); i <= Math.floor(b.x1 / G); i++) for (let j = Math.floor(b.z0 / G); j <= Math.floor(b.z1 / G); j++) { const k = key(i, j); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(b); }
  const near = (x, z, r) => { const out = new Set(); for (let i = Math.floor((x - r) / G); i <= Math.floor((x + r) / G); i++) for (let j = Math.floor((z - r) / G); j <= Math.floor((z + r) / G); j++) for (const b of grid.get(key(i, j)) || []) if (b.x0 - r <= x && b.x1 + r >= x && b.z0 - r <= z && b.z1 + r >= z) out.add(b); return out; };
  MODEL = { A, T, groundAt, bld, near };
  return MODEL;
}
export function loadRegistry() { return JSON.parse(fs.readFileSync(path.join(CW, 'atlas/data/atlas.json'), 'utf8')); }

export function inPoly(b, x, z) {
  let c = false; const f = b.f;
  for (let r = 0; r < b.starts.length - 1; r++) for (let k = b.starts[r], m = b.starts[r + 1] - 1; k < b.starts[r + 1]; m = k++) {
    const xa = f[2 * k], za = f[2 * k + 1], xb = f[2 * m], zb = f[2 * m + 1];
    if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) c = !c;
  }
  return c;
}
function edgeDist(b, x, z) {
  let d = 1e9; const f = b.f;
  for (let r = 0; r < b.starts.length - 1; r++) for (let k = b.starts[r], m = b.starts[r + 1] - 1; k < b.starts[r + 1]; m = k++) {
    const ax = f[2 * m], az = f[2 * m + 1], ex = f[2 * k] - ax, ez = f[2 * k + 1] - az, l2 = ex * ex + ez * ez || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)); d = Math.min(d, Math.hypot(x - ax - t * ex, z - az - t * ez));
  }
  return d;
}
// distance from a point to the nearest building prism (within r; returns r when none is nearer)
export function clearance(M, p, r = 80) {
  let best = r, who = null;
  for (const b of M.near(p[0], p[2], r)) {
    const dh = inPoly(b, p[0], p[2]) ? 0 : edgeDist(b, p[0], p[2]), dv = p[1] > b.y1 ? p[1] - b.y1 : p[1] < b.y0 ? b.y0 - p[1] : 0, d = Math.hypot(dh, dv);
    if (d < best) { best = d; who = b; }
  }
  return { d: best, b: who };
}

// ---------- splines
const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]), mulS = (a, s) => a.map(v => v * s), len = a => Math.hypot(...a), nrm = a => { const l = len(a) || 1; return a.map(v => v / l); }, lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// centripetal Catmull-Rom (alpha 0.5, Barry-Goldman), open: the end points are reflected
export function catmull(P) {
  const n = P.length, Q = [sub(mulS(P[0], 2), P[1]), ...P, sub(mulS(P[n - 1], 2), P[n - 2])];
  const knots = [0]; for (let i = 1; i < Q.length; i++) knots.push(knots[i - 1] + Math.max(1e-2, Math.sqrt(len(sub(Q[i], Q[i - 1])))));
  return (seg, u) => {   // seg 0..n-2, u 0..1: from P[seg] to P[seg+1]
    const i = seg + 1, [t0, t1, t2, t3] = [knots[i - 1], knots[i], knots[i + 1], knots[i + 2]], [p0, p1, p2, p3] = [Q[i - 1], Q[i], Q[i + 1], Q[i + 2]], t = t1 + (t2 - t1) * u;
    const A1 = lerp(p0, p1, (t - t0) / (t1 - t0)), A2 = lerp(p1, p2, (t - t1) / (t2 - t1)), A3 = lerp(p2, p3, (t - t2) / (t3 - t2));
    const B1 = lerp(A1, A2, (t - t0) / (t2 - t0)), B2 = lerp(A2, A3, (t - t1) / (t3 - t1));
    return lerp(B1, B2, (t - t1) / (t2 - t1));
  };
}

// ---------- the plan: waypoints (eye x, z, height above ground, speed, look target)
// The order flies one continuous route: a high overview loop spiralling in to a mid loop that turns its view all the way
// round, a low pass along the North Dock, round Poplar and Blackwall Basin, a low pass along the South Dock, an orbit
// climbing round Newfoundland and Landmark Pinnacle, a high diagonal crossing over One Canada Square, an orbit round
// Wood Wharf, two orbits round the Canada Square towers (high, then lower and wider), a low north-south crossing over
// Cabot Square and the Eden (Middle) Dock, and a ring round the neighbourhood looking in at the estate.
export function plan(M) {
  const W = [], g = (x, z) => M.groundAt(x, z);
  const wp = (x, z, agl, v, look, tag) => W.push({ e: [x, g(x, z) + agl, z], v, look, tag });
  const C = [60, 50];
  const at = (x, y, z) => ({ p: [x, y, z] });
  // 1. overview, clockwise (north up, east right), 12 points, 270-340 m, looking in and down at the estate
  for (let k = 0; k <= 11; k++) {
    const a = Math.PI + k / 12 * 2 * Math.PI, x = C[0] + 1050 * Math.cos(a), z = C[1] + 700 * Math.sin(a), f = .3 + .15 * Math.sin(3 * a);
    wp(x, z, 305 + 35 * Math.sin(2 * a), 14, at(C[0] + (x - C[0]) * f + 120 * Math.sin(a * 2), 10, C[1] + (z - C[1]) * f), 'overview');
  }
  // 2. spiral in to a mid loop, 14 points, 300 -> 150 m; the view turns from inward through forward and outward to backward
  for (let k = 0; k <= 13; k++) {
    const s = k / 13, a = Math.PI + s * 2 * Math.PI, rx = 1050 - 380 * s, rz = 700 - 260 * s, x = C[0] + rx * Math.cos(a), z = C[1] + rz * Math.sin(a);
    const th = Math.PI - s * 1.6 * Math.PI, rad = nrm([C[0] - x, 0, C[1] - z]), c = Math.cos(th), sn = Math.sin(th), dir = [rad[0] * c - rad[2] * sn, 0, rad[0] * sn + rad[2] * c];   // th = angle from the radial (inward)
    const d = 260 + 120 * s, ty = th > Math.PI / 2 ? 40 : 5;
    wp(x, z, 300 - 150 * s, 12, at(x + dir[0] * d, ty, z + dir[2] * d), 'mid-loop');
  }
  // 3. low pass east along the North Dock (centreline from about (-300,-198) to (430,-95)), looking ahead and to the towers
  wp(-420, -260, 110, 11, at(-150, 20, -180), 'north-dock');
  wp(-260, -195, 70, 10, at(0, 40, -110), 'north-dock');
  wp(-60, -168, 55, 10, at(120, 60, -60), 'north-dock');
  wp(150, -138, 50, 10, at(300, 40, -80), 'north-dock');
  wp(360, -108, 60, 10, at(560, 10, -60), 'north-dock');
  // 4. round Poplar Dock and Blackwall Basin, then into the South Dock from the east
  wp(600, -110, 90, 11, at(760, 5, 40), 'blackwall');
  wp(820, 30, 110, 11, at(620, 10, 120), 'blackwall');
  wp(840, 260, 100, 11, at(600, 60, 300), 'blackwall');
  wp(700, 470, 80, 10, at(450, 30, 400), 'south-dock');
  // 5. low pass west along the South Dock (centreline (600,432) -> (-250,250))
  wp(500, 405, 55, 9, at(300, 40, 300), 'south-dock');
  wp(300, 362, 45, 9, at(100, 50, 280), 'south-dock');
  wp(80, 330, 45, 9, at(-120, 40, 250), 'south-dock');
  wp(-120, 300, 50, 9, at(-300, 50, 220), 'south-dock');
  // 6. orbit round Newfoundland and Landmark Pinnacle, clockwise from the south, climbing 120 -> 220 m
  { const c = [-400, 165], r = 240; for (let k = 0; k <= 10; k++) { const a = Math.PI / 2 + k / 8 * 2 * Math.PI, x = c[0] + r * Math.cos(a), z = c[1] + r * 0.9 * Math.sin(a); wp(x, z, 120 + 100 * k / 10, 9, at(c[0] + 20 * Math.cos(a * 2), 70 + 40 * Math.sin(a), c[1]), 'orbit-newfoundland'); } }
  // 7. high diagonal crossing over Westferry Circus, One Canada Square and Bank Street to Wood Wharf
  wp(-560, -160, 240, 12, at(-300, 20, -60), 'crossing-high');
  wp(-280, -170, 275, 12, at(-50, 30, -20), 'crossing-high');
  wp(-30, -60, 300, 12, at(150, 20, 120), 'crossing-high');
  wp(230, 140, 285, 12, at(420, 30, 300), 'crossing-high');
  wp(500, 420, 230, 12, at(600, 40, 330), 'crossing-high');
  // 8. orbit round Wood Wharf, anticlockwise from the south-east, 1.375 turns at about 200 m; leaves at the north heading west
  { const c = [590, 300], r = 230; for (let k = 0; k <= 11; k++) { const a = Math.PI / 4 - k / 8 * 2 * Math.PI, x = c[0] + r * Math.cos(a), z = c[1] + r * Math.sin(a); wp(x, z, 200 + 25 * Math.sin(2 * a), 9, at(c[0] - 20 + 30 * Math.cos(a), 60, c[1]), 'orbit-woodwharf'); } }
  // 8b. a loop over Churchill Place (r 110 m, about 215 m) looking down into the plaza between One Churchill Place and
  //     25 Churchill Place, whose low buildings the wider passes cannot see past the towers; anticlockwise from the east
  { const c = [365, 45]; for (let k = 0; k <= 8; k++) { const a = -k / 8 * 2 * Math.PI, x = c[0] + 110 * Math.cos(a), z = c[1] + 110 * Math.sin(a); wp(x, z, 210 + 10 * Math.sin(a), 8, at(c[0], 10, c[1]), 'loop-churchill-place'); } }
  // 9. 2.5 turns round the Canada Square towers, anticlockwise from the east: high (r 330 about (70,40), 280 m), then wider
  //    and lower (r 430 about (120,40), down to 170 m); joins from the Churchill Place loop, leaves at the west heading south
  { for (let k = 1; k <= 25; k++) { const s = k / 25, a = -s * 5 * Math.PI, m = Math.min(1, Math.max(0, (s - .4) * 3)), c = [70 + 50 * m, 40], r = 330 + 100 * m, h = 280 + 15 * Math.sin(3 * a) * (1 - m) - 110 * m;
    const x = c[0] + r * Math.cos(a), z = c[1] + r * 0.85 * Math.sin(a); wp(x, z, h, 10, at(c[0] + 40 * Math.sin(a), 110 - 40 * m, c[1] + 30 * Math.cos(a)), 'orbit-canada-square'); } }
  // 10. down over Heron Quays and the west end of the South Dock to Millwall
  wp(-260, 260, 120, 10, at(-120, 30, 420), 'crossing-low');
  wp(-150, 450, 100, 10, at(40, 20, 560), 'crossing-low');
  wp(50, 620, 110, 11, at(250, 20, 650), 'crossing-low');
  // 11. neighbourhood ring, anticlockwise (Millwall, Cubitt Town, Blackwall, Poplar, Limehouse, the river), 90-140 m, looking in
  { const pts = [[150, 720], [550, 690], [950, 470], [1080, 120], [1000, -300], [650, -560], [200, -600], [-300, -580], [-780, -430], [-990, -120], [-800, -20], [-730, 120], [-910, 330], [-700, 640], [-300, 730]];
    pts.forEach(([x, z], k) => { const f = .55, h = 95 + 45 * Math.abs(Math.sin(k * 1.3));
      if (x === -800 || x === -730) wp(x, z, 70, 9, at(-560, 5, x === -800 ? -40 : 0), 'ring');   // a dip in over the river front at Westferry Circus and Canary Riverside
      else wp(x, z, h, 13, at(C[0] + (x - C[0]) * f, 20, C[1] + (z - C[1]) * f), 'ring'); }); }
  // 12. low south-north crossing over Heron Quays, the Eden (Middle) Dock, Cabot Square and the North Dock
  wp(-170, 520, 120, 10, at(-200, 20, 300), 'crossing-low');
  wp(-205, 260, 110, 10, at(-230, 20, 60), 'crossing-low');
  wp(-220, -40, 110, 10, at(-180, 20, -230), 'crossing-low');
  wp(-200, -250, 115, 10, at(-100, 20, -420), 'crossing-low');
  wp(-60, -420, 140, 11, at(150, 30, -480), 'crossing-low');
  // end: climb out to the north-east looking back south at the towers
  wp(120, -560, 220, 12, at(60, 60, -60), 'exit');
  wp(300, -620, 300, 10, at(80, 40, 20), 'exit');
  return W;
}

// ---------- build the path
function resolveTargets(W) { return W.map(w => w.look.p); }

export function buildPath(opts = {}) {
  const M = loadModel(), fps = opts.fps || 30, L = { ...LIMITS, ...(opts.limits || {}) };
  const W = opts.waypoints || plan(M);
  let log = [];
  // repair: raise waypoints until every dense sample clears buildings and terrain
  for (let iter = 0; iter < 60; iter++) {
    const E = catmull(W.map(w => w.e)); let bad = 0; const raise = new Float64Array(W.length);
    for (let s = 0; s < W.length - 1; s++) for (let k = 0; k <= 60; k++) {
      const u = k / 60, p = E(s, u), c = clearance(M, p, L.CLEAR + 5), agl = p[1] - M.groundAt(p[0], p[2]);
      let need = 0; if (c.d < L.CLEAR + 2) need = Math.max(need, c.b && p[1] > c.b.y0 ? Math.max(4, c.b.y1 + L.CLEAR - p[1]) * .5 + 2 : 6); if (agl < L.ALT_MIN) need = Math.max(need, L.ALT_MIN - agl + 1);
      if (need > 0) { bad++; raise[s] = Math.max(raise[s], need * (1 - u) + 1); raise[s + 1] = Math.max(raise[s + 1], need * u + 1); }
    }
    if (!bad) break;
    log.push(`repair ${iter}: ${bad} samples too close; raising ${[...raise].filter(r => r > 0).length} waypoints`);
    W.forEach((w, i) => { if (raise[i] > 0) w.e[1] += Math.min(25, raise[i]); });
  }
  const E = catmull(W.map(w => w.e)), Tg = catmull(resolveTargets(W));
  // dense arc-length table, 1 m nominal
  const tab = []; let S = 0, prev = null;
  for (let s = 0; s < W.length - 1; s++) {
    const n = Math.max(8, Math.ceil(len(sub(W[s + 1].e, W[s].e)) / 0.5));
    for (let k = (s ? 1 : 0); k <= n; k++) { const u = k / n, p = E(s, u); if (prev) S += len(sub(p, prev)); tab.push({ s: S, seg: s, u, p }); prev = p; }
  }
  // curvature and speed limits
  for (let i = 0; i < tab.length; i++) {
    const a = tab[Math.max(0, i - 8)], b = tab[i], c = tab[Math.min(tab.length - 1, i + 8)], d1 = sub(b.p, a.p), d2 = sub(c.p, b.p), l1 = len(d1), l2 = len(d2);
    let kap = 0; if (l1 > 0.1 && l2 > 0.1) { const h1 = nrm([d1[0], 0, d1[2]]), h2 = nrm([d2[0], 0, d2[2]]); kap = Math.acos(Math.max(-1, Math.min(1, dot(h1, h2)))) / ((l1 + l2) / 2); }
    b.kap = kap;
    const w0 = W[b.seg], w1 = W[b.seg + 1], sm = b.u * b.u * (3 - 2 * b.u), vn = w0.v + (w1.v - w0.v) * sm;
    b.v = Math.min(vn, kap > 1e-6 ? Math.min(Math.sqrt(L.ACC_LAT / kap), L.TURN_RATE * D2R / kap) : 99);
  }
  // smooth the speed over 60 m, then the along-track acceleration limits, start and end from hover
  { const v = tab.map(t => t.v), out = v.slice(), R = 60;
    // windowed min-then-mean keeps the limit honest: first a running minimum over +-R/2, then a mean over +-R
    const idxAt = s => { let lo = 0, hi = tab.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (tab[m].s < s) lo = m + 1; else hi = m; } return lo; };
    const mn = v.map((_, i) => { let m = 99; for (let j = idxAt(tab[i].s - R / 2); j < tab.length && tab[j].s <= tab[i].s + R / 2; j++) m = Math.min(m, v[j]); return m; });
    const pre = [0]; for (let i = 0; i < mn.length; i++) pre.push(pre[i] + mn[i]);
    for (let i = 0; i < mn.length; i++) { const a = idxAt(tab[i].s - R), b = Math.min(tab.length - 1, idxAt(tab[i].s + R)); out[i] = Math.min(mn[i], (pre[b + 1] - pre[a]) / (b + 1 - a)); }
    out[0] = 0.4; out[out.length - 1] = 0.4;
    for (let i = 1; i < out.length; i++) out[i] = Math.min(out[i], Math.sqrt(out[i - 1] ** 2 + 2 * L.ACC_LONG * (tab[i].s - tab[i - 1].s)));
    for (let i = out.length - 2; i >= 0; i--) out[i] = Math.min(out[i], Math.sqrt(out[i + 1] ** 2 + 2 * L.ACC_LONG * (tab[i + 1].s - tab[i].s)));
    tab.forEach((t, i) => { t.v = out[i]; }); }
  // time along the table, then frames at fps
  tab[0].t = 0; for (let i = 1; i < tab.length; i++) tab[i].t = tab[i - 1].t + (tab[i].s - tab[i - 1].s) / Math.max(0.2, (tab[i].v + tab[i - 1].v) / 2);
  const dur = tab[tab.length - 1].t, N = Math.floor(dur * fps) + 1, F = [];
  let j = 0;
  for (let f = 0; f < N; f++) {
    const t = f / fps; while (j < tab.length - 2 && tab[j + 1].t < t) j++;
    const a = tab[j], b = tab[j + 1], ds = b.s - a.s || 1e-9, ac = (b.v * b.v - a.v * a.v) / (2 * ds), tau = Math.max(0, t - a.t), w = Math.max(0, Math.min(1, (a.v * tau + .5 * ac * tau * tau) / ds));   // constant acceleration within each table step
    const seg = a.seg === b.seg ? a.seg : b.seg, u = a.seg === b.seg ? a.u + (b.u - a.u) * w : (w < 1 ? b.u * w : b.u);
    const e = E(seg, u), tg = Tg(seg, u);
    F.push({ t, e, raw: tg, seg, tag: W[seg].tag, s: a.s + (b.s - a.s) * w });
  }
  // orientation: yaw (from +x towards +z... we use atan2(dx, -dz): 0 = north, 90 = east) and pitch (down positive)
  const yaw = [], pitch = [], dist = [];
  for (const fr of F) { const d = sub(fr.raw, fr.e), h = Math.hypot(d[0], d[2]); yaw.push(Math.atan2(d[0], -d[2])); pitch.push(Math.atan2(-d[1], h)); dist.push(len(d)); }
  for (let i = 1; i < yaw.length; i++) { while (yaw[i] - yaw[i - 1] > Math.PI) yaw[i] -= 2 * Math.PI; while (yaw[i] - yaw[i - 1] < -Math.PI) yaw[i] += 2 * Math.PI; }
  const clampP = p => Math.max((L.PITCH_MIN + 2) * D2R, Math.min((L.PITCH_MAX - 2) * D2R, p));
  const gauss = (a, sig) => { const R = Math.ceil(3 * sig), k = []; for (let i = -R; i <= R; i++) k.push(Math.exp(-i * i / (2 * sig * sig))); const ks = k.reduce((x, y) => x + y); return a.map((_, i) => { let s = 0; for (let q = -R; q <= R; q++) s += a[Math.max(0, Math.min(a.length - 1, i + q))] * k[q + R]; return s / ks; }); };
  let sig = 1.5 * fps, Y, P, maxYawRate = 0, maxPitchRate = 0;
  // gentle extra variation of the view: yaw +-8 deg over 23 s, pitch +-5 deg over 31 s
  const vy = F.map(fr => 8 * D2R * Math.sin(2 * Math.PI * fr.t / 23)), vp = F.map(fr => 5 * D2R * Math.sin(2 * Math.PI * fr.t / 31 + 1));
  for (let it = 0; it < 12; it++) {
    Y = gauss(yaw.map((y, i) => y + vy[i]), sig); P = gauss(pitch.map((p, i) => clampP(p) + vp[i]), sig).map(clampP);
    maxYawRate = 0; maxPitchRate = 0;
    for (let i = 1; i < F.length; i++) { maxYawRate = Math.max(maxYawRate, Math.abs(Y[i] - Y[i - 1]) * fps * R2D); maxPitchRate = Math.max(maxPitchRate, Math.abs(P[i] - P[i - 1]) * fps * R2D); }
    if (maxYawRate < L.YAW_RATE * .95 && maxPitchRate < 8) break;
    sig *= 1.3;
  }
  const D = gauss(dist, sig).map(d => Math.max(60, Math.min(3000, d)));
  F.forEach((fr, i) => { const cp = Math.cos(P[i]), dir = [Math.sin(Y[i]) * cp, -Math.sin(P[i]), -Math.cos(Y[i]) * cp]; fr.target = add(fr.e, mulS(dir, D[i])); fr.yaw = ((Y[i] * R2D) % 360 + 360) % 360; fr.pitch = P[i] * R2D; });
  const stats = pathStats(M, F, fps, L);
  stats.smoothingSeconds = +(sig / fps).toFixed(2); stats.repairs = log;
  return { fps, frames: F, waypoints: W, stats };
}

export function pathStats(M, F, fps, L = LIMITS) {
  const st = { frames: F.length, duration_s: +(F.length / fps).toFixed(1), length_m: Math.round(F[F.length - 1].s) };
  let vmin = 1e9, vmax = 0, hmin = 1e9, hmax = 0, amax = 0, along = 0, yawR = 0, pitchR = 0, altMin = 1e9, altMax = -1e9, clr = 1e9, clrAt = null, aglMin = 1e9, pmin = 90, pmax = -90, yMin = 1e9, yMax = -1e9;
  const cruise = []; const W = Math.round(fps / 10) || 1;
  for (let i = 0; i < F.length; i++) {
    const f = F[i]; altMin = Math.min(altMin, f.e[1] - M.groundAt(f.e[0], f.e[2])); altMax = Math.max(altMax, f.e[1] - M.groundAt(f.e[0], f.e[2])); yMin = Math.min(yMin, f.e[1]); yMax = Math.max(yMax, f.e[1]);
    pmin = Math.min(pmin, f.pitch); pmax = Math.max(pmax, f.pitch);
    if (i % 3 === 0) { const c = clearance(M, f.e, 80); if (c.d < clr) { clr = c.d; clrAt = i; } }
    if (i > 0) { const d = sub(f.e, F[i - 1].e), v = len(d) * fps, h = Math.hypot(d[0], d[2]) * fps; f.speed = v; if (i > fps * 30 && i < F.length - fps * 30) { vmin = Math.min(vmin, v); hmin = Math.min(hmin, h); cruise.push(v); } vmax = Math.max(vmax, v); hmax = Math.max(hmax, h);
      let dy = F[i].yaw - F[i - 1].yaw; dy = ((dy + 540) % 360) - 180; yawR = Math.max(yawR, Math.abs(dy) * fps); pitchR = Math.max(pitchR, Math.abs(F[i].pitch - F[i - 1].pitch) * fps); }
    if (i >= W && i < F.length - W) { const a = mulS(add(sub(F[i + W].e, f.e), sub(F[i - W].e, f.e)), (fps / W) ** 2); amax = Math.max(amax, len(a));
      const v1 = len(sub(F[i + W].e, f.e)) * fps / W, v0 = len(sub(f.e, F[i - W].e)) * fps / W; along = Math.max(along, Math.abs(v1 - v0) * fps / W); }
  }
  // exact clearance near the closest sampled frame
  for (let i = Math.max(0, clrAt - 3); i < Math.min(F.length, clrAt + 4); i++) { const c = clearance(M, F[i].e, 80); if (c.d < clr) { clr = c.d; } }
  cruise.sort((a, b) => a - b);
  Object.assign(st, {
    speed_mps: { min_cruise: +vmin.toFixed(2), p5: +cruise[Math.floor(cruise.length * .05)].toFixed(2), median: +cruise[Math.floor(cruise.length / 2)].toFixed(2), max: +vmax.toFixed(2), ground_max: +hmax.toFixed(2), ground_min_cruise: +hmin.toFixed(2) },
    accel_mps2: { max_total: +amax.toFixed(2), max_along_track: +along.toFixed(2) },
    yaw_rate_dps_max: +yawR.toFixed(2), pitch_rate_dps_max: +pitchR.toFixed(2), pitch_down_deg: [+pmin.toFixed(1), +pmax.toFixed(1)],
    height_above_ground_m: [+altMin.toFixed(1), +altMax.toFixed(1)], height_od_m: [+yMin.toFixed(1), +yMax.toFixed(1)],
    min_building_clearance_m: +clr.toFixed(1),
  });
  return st;
}

// ---------- camera maths shared with drone-capture.mjs
export function intrinsics(w, h, fovY) { const fy = (h / 2) / Math.tan(fovY / 2); return { fl_x: fy, fl_y: fy, cx: w / 2, cy: h / 2, w, h }; }
// camera-to-world, OpenGL camera (x right, y up, looks along -z), the same lookAt the page uses (up = +y)
export function c2w(eye, target) {
  const z = nrm(sub(eye, target)), x = nrm(cross([0, 1, 0], z)), y = cross(z, x);
  return [[x[0], y[0], z[0], eye[0]], [x[1], y[1], z[1], eye[1]], [x[2], y[2], z[2], eye[2]], [0, 0, 0, 1]];
}
// world point -> pixel (u right, v down, pixel centres at +0.5) and depth; null behind the camera
export function project(Tm, K, p) {
  const d = [p[0] - Tm[0][3], p[1] - Tm[1][3], p[2] - Tm[2][3]];
  const xc = Tm[0][0] * d[0] + Tm[1][0] * d[1] + Tm[2][0] * d[2], yc = Tm[0][1] * d[0] + Tm[1][1] * d[1] + Tm[2][1] * d[2], zc = Tm[0][2] * d[0] + Tm[1][2] * d[1] + Tm[2][2] * d[2];
  if (zc > -1) return null;
  return { u: K.cx + K.fl_x * xc / -zc, v: K.cy - K.fl_y * yc / -zc, depth: -zc };
}

// ---------- coverage estimate on the CPU: 2 m height field, frustum, facing walls, ray march for occlusion
export function areaBuildings(AT) { return AT.buildings.filter(b => b.mi.length && inEstate(b.x, b.z)); }
export function coverageCPU(M, AT, frames, K, opts = {}) {
  const box = opts.box || { x0: NEAR.x0 - 400, x1: NEAR.x1 + 400, z0: NEAR.z0 - 400, z1: NEAR.z1 + 400 }, cs = 2, nx = Math.ceil((box.x1 - box.x0) / cs), nz = Math.ceil((box.z1 - box.z0) / cs), hf = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) hf[j * nx + i] = M.groundAt(box.x0 + (i + .5) * cs, box.z0 + (j + .5) * cs);
  let hmax = 0;
  for (const b of M.bld) { if (b.x1 < box.x0 || b.x0 > box.x1 || b.z1 < box.z0 || b.z0 > box.z1) continue; if (b.y0 > 30) continue; hmax = Math.max(hmax, b.y1);
    for (let i = Math.max(0, Math.floor((b.x0 - box.x0) / cs)); i <= Math.min(nx - 1, Math.floor((b.x1 - box.x0) / cs)); i++) for (let j = Math.max(0, Math.floor((b.z0 - box.z0) / cs)); j <= Math.min(nz - 1, Math.floor((b.z1 - box.z0) / cs)); j++)
      if (inPoly(b, box.x0 + (i + .5) * cs, box.z0 + (j + .5) * cs)) hf[j * nx + i] = Math.max(hf[j * nx + i], b.y1); }
  const occluded = (p, e) => { const d = sub(e, p), L = len(d); for (let s = 3; s < L; s += 2) { const q = [p[0] + d[0] * s / L, p[1] + d[1] * s / L, p[2] + d[2] * s / L]; if (q[1] > hmax) return false; const i = Math.floor((q[0] - box.x0) / cs), j = Math.floor((q[2] - box.z0) / cs); if (i < 0 || j < 0 || i >= nx || j >= nz) return false; if (q[1] < hf[j * nx + i] - .3) return true; } return false; };
  const list = opts.buildings || areaBuildings(AT);
  const pts = list.map(rb => { const out = []; for (const mi of rb.mi) { const b = M.bld[mi]; if (!b) continue; let cx = 0, cz = 0; for (let k = 0; k < b.starts[1]; k++) { cx += b.f[2 * k]; cz += b.f[2 * k + 1]; } cx /= b.starts[1]; cz /= b.starts[1];
    if (inPoly(b, cx, cz)) out.push({ p: [cx, b.y1 + .2, cz], n: [0, 1, 0], size: Math.max(b.x1 - b.x0, b.z1 - b.z0) });
    let area = 0; for (let k = 0, m = b.starts[1] - 1; k < b.starts[1]; m = k++) area += b.f[2 * m] * b.f[2 * k + 1] - b.f[2 * k] * b.f[2 * m + 1];
    const edges = []; for (let k = 0, m = b.starts[1] - 1; k < b.starts[1]; m = k++) edges.push([m, k, Math.hypot(b.f[2 * k] - b.f[2 * m], b.f[2 * k + 1] - b.f[2 * m + 1])]);
    edges.sort((a, c) => c[2] - a[2]);
    for (const [m, k, l] of edges.slice(0, 8)) { if (l < 3) continue; const ex = b.f[2 * k] - b.f[2 * m], ez = b.f[2 * k + 1] - b.f[2 * m + 1]; let n = [ez / l, 0, -ex / l]; if (area < 0) n = n.map(v => -v);
      out.push({ p: [(b.f[2 * m] + b.f[2 * k]) / 2 + n[0] * .8, (b.y0 + b.y1) / 2, (b.f[2 * m + 1] + b.f[2 * k + 1]) / 2 + n[2] * .8], n, size: Math.max(l, b.y1 - b.y0) }); } }
    return out; });
  const res = list.map(() => ({ frames: 0, sectors: new Set() }));
  for (const fr of frames) {
    const Tm = c2w(fr.e, fr.target);
    list.forEach((rb, bi) => {
      for (const q of pts[bi]) {
        const pr = project(Tm, K, q.p); if (!pr || pr.u < 0 || pr.v < 0 || pr.u > K.w || pr.v > K.h || pr.depth > 2500) continue;
        if (q.size * K.fl_y / pr.depth < 8) continue;
        const to = sub(fr.e, q.p); if (dot(to, q.n) <= 0) continue;
        if (occluded(q.p, fr.e)) continue;
        res[bi].frames++; res[bi].sectors.add(Math.floor((((Math.atan2(fr.e[0] - rb.x, -(fr.e[2] - rb.z)) * R2D) + 360 + 22.5) % 360) / 45)); break;
      }
    });
  }
  return list.map((rb, i) => ({ id: rb.id, n: rb.n, x: rb.x, z: rb.z, frames: res[i].frames, directions: res[i].sectors.size }));
}

export function pickFrames(path, n, every) {
  const N = path.frames.length, k = every || Math.max(1, Math.floor((N - 1) / Math.max(1, n - 1)));
  const out = []; for (let i = 0; i < N && out.length < n; i += k) out.push(i); return out;
}

export function svgPlan(M, P) {
  const b = { x0: NEAR.x0 - 250, x1: NEAR.x1 + 250, z0: NEAR.z0 - 250, z1: NEAR.z1 + 250 }, s = 0.5, W = (b.x1 - b.x0) * s, H = (b.z1 - b.z0) * s, X = x => ((x - b.x0) * s).toFixed(1), Z = z => ((z - b.z0) * s).toFixed(1);
  let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#111"/>`;
  for (const w of M.A.water) { const f = dec(w.p); const pts = []; for (let k = 0; k < f.length; k += 2) pts.push(X(f[k]) + ',' + Z(f[k + 1])); o += `<polygon points="${pts.join(' ')}" fill="#1d3b55"/>`; }
  for (const bb of M.bld) { if (bb.x1 < b.x0 || bb.x0 > b.x1 || bb.z1 < b.z0 || bb.z0 > b.z1) continue; const pts = []; for (let k = 0; k < bb.starts[1]; k++) pts.push(X(bb.f[2 * k]) + ',' + Z(bb.f[2 * k + 1])); const g = Math.min(255, 70 + bb.y1 * .8) | 0; o += `<polygon points="${pts.join(' ')}" fill="rgb(${g},${g},${g})"/>`; }
  o += `<polygon points="${ESTATE_POLY.map(([x, z]) => X(x) + ',' + Z(z)).join(' ')}" fill="none" stroke="#ffd26f" stroke-dasharray="6 4"/>`;
  o += `<rect x="${X(NEAR.x0)}" y="${Z(NEAR.z0)}" width="${(NEAR.x1 - NEAR.x0) * s}" height="${(NEAR.z1 - NEAR.z0) * s}" fill="none" stroke="#888" stroke-dasharray="3 5"/>`;
  const F = P.frames; for (let i = 15; i < F.length; i += 15) { const a = F[i - 15].e, c = F[i].e, agl = c[1], hue = Math.round(240 - 240 * Math.min(1, agl / 350)); o += `<line x1="${X(a[0])}" y1="${Z(a[2])}" x2="${X(c[0])}" y2="${Z(c[2])}" stroke="hsl(${hue},90%,55%)" stroke-width="2"/>`; }
  for (let i = 0; i < F.length; i += 30 * 20) { const f = F[i]; o += `<line x1="${X(f.e[0])}" y1="${Z(f.e[2])}" x2="${X(f.e[0] + (f.target[0] - f.e[0]) * .25)}" y2="${Z(f.e[2] + (f.target[2] - f.e[2]) * .25)}" stroke="#fff" stroke-width="1" opacity=".7"/>`; }
  P.waypoints.forEach((w, i) => { o += `<circle cx="${X(w.e[0])}" cy="${Z(w.e[2])}" r="3" fill="none" stroke="#fff"/><text x="${+X(w.e[0]) + 4}" y="${+Z(w.e[2]) - 4}" fill="#ccc" font-size="9" font-family="sans-serif">${i}</text>`; });
  o += `<text x="8" y="16" fill="#eee" font-size="13" font-family="sans-serif">Drone path (colour = height OD, blue low, red high); white ticks = view direction every 20 s; yellow = CWG estate, grey box = estate box + ${MARGIN} m. North up.</text></svg>`;
  return o;
}

export function pathJSON(P) {
  const { repairs, ...st } = P.stats;
  return { generator: 'cwplans/tools/drone-flight.mjs', fps: P.fps, coordinates: 'model metres: x = E - 537550 (east), y = m above OD (up), z = -(N - 180300) (south)', stats: st, repairs,
    waypoints: P.waypoints.map(w => ({ eye: w.e.map(v => +v.toFixed(2)), target: w.look.p, speed: w.v, part: w.tag })),
    frames: P.frames.map(f => ({ t: +f.t.toFixed(3), eye: f.e.map(v => +v.toFixed(3)), target: f.target.map(v => +v.toFixed(3)), yaw: +f.yaw.toFixed(3), pitch: +f.pitch.toFixed(3), part: f.tag })) };
}

// ---------- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
  const t0 = Date.now(), M = loadModel(), P = buildPath({ fps: +(opt('fps') || 30) });
  console.log(P.stats.repairs.join('\n'));
  const { repairs, ...st } = P.stats; console.log(JSON.stringify(st, null, 1));
  const segs = {}; for (const f of P.frames) segs[f.tag] = (segs[f.tag] || 0) + 1; console.log('seconds per part:', Object.entries(segs).map(([k, v]) => `${k} ${Math.round(v / P.fps)}`).join(', '));
  if (opt('out')) { const out = pathJSON(P);
    fs.mkdirSync(path.dirname(path.resolve(opt('out'))), { recursive: true }); fs.writeFileSync(opt('out'), JSON.stringify(out)); console.log('wrote', opt('out')); }
  if (opt('svg')) { fs.writeFileSync(opt('svg'), svgPlan(M, P)); console.log('wrote', opt('svg')); }
  if (opt('coverage')) {
    const n = +opt('coverage'), fov = +(opt('fov') || 60) * D2R, [w, h] = (opt('size') || '960x540').split('x').map(Number), K = intrinsics(w, h, fov), AT = loadRegistry();
    const idx = pickFrames(P, n), cov = coverageCPU(M, AT, idx.map(i => P.frames[i]), K);
    const few = cov.filter(c => c.directions < 3);
    console.log(`coverage estimate (CPU), ${idx.length} frames: ${cov.length} registry buildings in the estate; directions histogram`, JSON.stringify(cov.reduce((m, c) => (m[c.directions] = (m[c.directions] || 0) + 1, m), {})), `; under 3 directions: ${few.length}`);
    for (const c of few.slice(0, 60)) console.log('  ', c.id, c.n, c.x, c.z, 'frames', c.frames, 'dirs', c.directions);
  }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
