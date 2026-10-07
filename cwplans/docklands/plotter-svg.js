// Plotter SVG of the 3D page's current view (Menu > views > "Plotter SVG"): lines only, hidden lines removed, one
// numbered pen layer per kind of line ("1 Buildings and credit" ...: the iDraw and AxiDraw "plot layer N" convention),
// millimetres on A4/A3/A2 paper, the credit in single-stroke text. Edges are rebuilt from the page's data; visibility
// comes from a CPU z-buffer of the same solids. index.html calls DocklandsPlot.init(ctx).
// Skill: docklands-3d-page, "Plotter SVG" (and what the iDraw 2.0 software does with the file).
// The credit font is Hershey Roman Simplex (futural.jhf). The Hershey Fonts were originally created by Dr. A. V. Hershey
// while working at the U. S. National Bureau of Standards. The format of the Font data in this distribution was
// originally created by James Hurt, Cognition, Inc., 900 Technology Park Drive, Billerica, MA 01821.
(() => {
let C = null;
const $ = id => document.getElementById(id);
const PAPER = { A4: [297, 210], A3: [420, 297], A2: [594, 420] }, MARGIN = 12, PEN = 0.3;
// id, layer number and label, stroke colour (blue only for water); the numbers stay the same when a layer is empty
const LAYERS = [
  ['bld', '1 Buildings and credit', '#000000'], ['water', '2 Water', '#1f5fbf'], ['green', '3 Parks and greens', '#2e8b3a'],
  ['road', '4 Roads', '#777777'], ['rail', '5 Railways', '#c0392b'], ['path', '6 Paths with a level', '#a0784a'],
  ['under', '7 Underground (tunnels, stations)', '#d35400']];

// ---------- camera
function camera(W, H) {
  const M = C.MVP(), VZ = C.VZ(), E = C.CAM().eye;
  const clip = (x, y, z) => { const Y = y * VZ; return [M[0] * x + M[4] * Y + M[8] * z + M[12], M[1] * x + M[5] * Y + M[9] * z + M[13], M[2] * x + M[6] * Y + M[10] * z + M[14], M[3] * x + M[7] * Y + M[11] * z + M[15]]; };
  const scr = c => [(c[0] / c[3] * .5 + .5) * W, (1 - (c[1] / c[3] * .5 + .5)) * H, c[2] / c[3]];
  // a point moved towards the eye by a depth tolerance: an edge on a face must win against that face
  const toward = (x, y, z) => { const dx = E[0] - x, dy = E[1] - y * VZ, dz = E[2] - z, d = Math.hypot(dx, dy, dz) || 1, e = Math.max(.35, d * .003) / d; return [x + dx * e, y + dy * e / VZ, z + dz * e]; };
  return { clip, scr, toward };
}
const nearOK = c => c[2] + c[3] > 1e-6;   // inside the near plane (clip z >= -w)

// ---------- z-buffer
function zbuffer(W, H) { const z = new Float32Array(W * H).fill(2); return { W, H, z }; }
function rasterTri(Z, a, b, c) {   // a, b, c: screen [x, y, ndcz]
  const minx = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxx = Math.min(Z.W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const miny = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxy = Math.min(Z.H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  if (minx > maxx || miny > maxy) return;
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); if (Math.abs(area) < 1e-9) return;
  for (let y = miny; y <= maxy; y++) { const py = y + .5;
    for (let x = minx; x <= maxx; x++) { const px = x + .5;
      const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area, w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const d = w0 * a[2] + w1 * b[2] + w2 * c[2], k = y * Z.W + x; if (d < Z.z[k]) Z.z[k] = d;
    }
  }
}
function clipPoly(P, inside, cross) {   // Sutherland-Hodgman against one plane
  const out = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a); if (ia !== ib) out.push(cross(a, b)); } return out;
}
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// ---------- scene: the edges of each layer, from the page's data. opt.emit(layer, a, b, g) takes each edge, g = [size m,
// rank] for the real-time size rule (rank 0 roof outline, 1 base or corner edge, 2 ground outline or kerb; no g: always
// drawn); opt.small(box) gives 0 (all edges), 1 (roof outline only) or 2 (none) for a building's box [x0 y0 z0 x1 y1 z1];
// opt.tri(a, b, c) takes each solid that hides lines (none made without it); opt.under adds the underground edges and the
// paths below ground with no cut. line-styles.js draws the same edges in real time.
function scene(P, opt) {
  const cutY = P.cut < 250 ? P.cut : Infinity, seen = new Set(), nop = () => {};
  const tri = opt.tri || nop, small = opt.small || (() => 0);
  const seg = (L, a, b, dedupe, g) => {
    if (dedupe) { const k1 = a.map(v => Math.round(v * 5)).join() + '|' + b.map(v => Math.round(v * 5)).join(), k2 = k1.split('|').reverse().join('|'); if (seen.has(k1) || seen.has(k2)) return; seen.add(k1); }
    opt.emit(L, a, b, g);
  };
  const ringsOf = (f, holes) => { const starts = [0, ...(holes || []), f.length / 2], R = []; for (let r = 0; r < starts.length - 1; r++) { const ring = []; for (let i = starts[r]; i < starts[r + 1]; i++) ring.push([f[2 * i], f[2 * i + 1]]); R.push(ring); } return R; };
  const boxOf = (ring, y0, y1) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of ring) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } return [x0, y0, z0, x1, y1, z1]; };
  const prism = (rings, y0, y1, roof = true) => {
    if (y0 >= cutY) return; const cut = y1 > cutY; if (cut) y1 = cutY;
    const box = boxOf(rings[0], y0, y1), sz = small(box), size = Math.max(box[3] - box[0], box[5] - box[2], y1 - y0);
    const segB = sz === 2 ? nop : (L, a, b, d) => seg(L, a, b, d, [size, 0]), segD = sz ? nop : (L, a, b, d) => seg(L, a, b, d, [size, 1]);   // 1: roof outline only
    for (const ring of rings) { const n = ring.length;
      for (let i = 0; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n], o = ring[(i + n - 1) % n];
        tri([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]]); tri([p[0], y0, p[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]);
        segB('bld', [p[0], y1, p[1]], [q[0], y1, q[1]], true); segD('bld', [p[0], y0, p[1]], [q[0], y0, q[1]], true);
        const t1 = Math.atan2(p[1] - o[1], p[0] - o[0]), t2 = Math.atan2(q[1] - p[1], q[0] - p[0]); let d = Math.abs(t2 - t1); if (d > Math.PI) d = 2 * Math.PI - d;
        if (d > .45) segD('bld', [p[0], y0, p[1]], [p[0], y1, p[1]], true);   // a corner of more than about 26 degrees: a vertical edge
      } }
    if (roof && !cut && opt.tri) { const flatv = [], holes = []; for (const r of rings) { if (flatv.length) holes.push(flatv.length / 2); for (const p of r) flatv.push(p[0], p[1]); }
      const t = C.earcut(flatv, holes.length ? holes : undefined, 2); for (let k = 0; k < t.length; k += 3) tri(...[t[k], t[k + 1], t[k + 2]].map(i => [flatv[2 * i], y1, flatv[2 * i + 1]])); }
  };
  // buildings and fitted towers, as the page draws them
  const T = C.TOWERS(), useT = !!T;
  C.A.buildings.forEach((b, i) => { if (useT && C.towerOf.has(i)) return; const h = C.heightOf(b, i); if (!(h > 0)) return; prism(ringsOf(C.dec(b.p), b.holes), b.b + (b.mh || 0), b.b + h); });
  if (useT) for (const t of T) t.tiers.forEach((tr, k) => {
    const pyr = k === t.tiers.length - 1 && t.top && t.top.kind === 'pyramid' && t.top.apex;
    if (!pyr) { prism([tr.ring, ...(tr.holes || [])], tr.y0, tr.y1); return; }
    const [ax, ay, az] = t.top.apex, r = tr.ring; if (tr.y0 >= cutY) return;
    for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; tri([p[0], tr.y0, p[1]], [q[0], tr.y0, q[1]], [ax, ay, az]); seg('bld', [p[0], tr.y0, p[1]], [q[0], tr.y0, q[1]], true); seg('bld', [p[0], tr.y0, p[1]], [ax, ay, az], true); }
  });
  // terrain: an occluder only when the model is not cut open (the page then draws the ground faint)
  if (cutY === Infinity && opt.tri) { const G = C.A.terrain, h = (i, j) => G.dm[j * G.nx + i] / 10;
    for (let j = 0; j < G.nz - 1; j++) for (let i = 0; i < G.nx - 1; i++) { const x0 = G.x0 + i * G.cell, z0 = G.z0 + j * G.cell, x1 = x0 + G.cell, z1 = z0 + G.cell;
      const a = [x0, h(i, j), z0], b = [x1, h(i + 1, j), z0], c = [x0, h(i, j + 1), z1], d = [x1, h(i + 1, j + 1), z1]; tri(a, b, c); tri(b, d, c); } }
  // Lines on the ground (water and green outlines, kerbs, railways) are draped on the same triangles as the terrain
  // occluder: a point every half cell, at its own height or on the ground if that is higher (bridges keep theirs), plus a
  // lift. Straight lines across many 20 m cells were cut into dashes where the ground bulged above them.
  const G = C.A.terrain, gh = (i, j) => G.dm[Math.max(0, Math.min(G.nz - 1, j)) * G.nx + Math.max(0, Math.min(G.nx - 1, i))] / 10;
  const surfY = (x, z) => {
    const u = (x - G.x0) / G.cell, v = (z - G.z0) / G.cell, i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j;
    if (fx + fz <= 1) return gh(i, j) + (gh(i + 1, j) - gh(i, j)) * fx + (gh(i, j + 1) - gh(i, j)) * fz;
    return gh(i + 1, j + 1) + (gh(i, j + 1) - gh(i + 1, j + 1)) * (1 - fx) + (gh(i + 1, j) - gh(i + 1, j + 1)) * (1 - fz);
  };
  const along = (a, b, out) => { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / (G.cell / 2)));
    for (let s = out.length ? 1 : 0; s <= n; s++) out.push(lerp(a, b, s / n)); return out; };
  const onGround = (p, lift) => [p[0], Math.max(p[1], surfY(p[0], p[2])) + lift, p[2]];
  const polyline = (L, P, lift, g) => { for (let i = 1; i < P.length; i++) seg(L, onGround(P[i - 1], lift), onGround(P[i], lift), false, g); };
  // water and greens: outlines on the surface
  const outline = (L, o, y0, lift) => { const R = ringsOf(C.dec(o.p), o.holes), bx = boxOf(R[0], 0, 0), g = [Math.max(bx[3] - bx[0], bx[5] - bx[2]), 2];
    for (const ring of R) for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length];
      if (p[1] === q[1] && p[0] === q[0]) continue; polyline(L, along([p[0], y0, p[1]], [q[0], y0, q[1]], []), lift, g); } };
  for (const w of C.A.water) outline('water', w, w.level, .1);
  for (const g of C.A.greens) outline('green', g, -1e4, .3);
  // roads (both kerbs) and open railways (centre line). A kerb point at a bend lies on the mitre (the mean of the two
  // segment normals, at most 2 w out), so the kerb pieces of the two segments meet there: one pen stroke, no notch
  const nrm = (a, b) => { const dx = b[0] - a[0], dz = b[2] - a[2], n = Math.hypot(dx, dz) || 1; return [-dz / n, dx / n]; };
  for (const l of C.A.lines) if (!l.tunnel) { const q = C.dec(l.q, 3), road = l.k === 'road', w = road ? [0, 10, 7, 4][l.c] / 2 : 0;
    if (road && !w) continue;
    const V0 = [];
    for (let i = 0; i < q.length; i += 3) { const p = [q[i], q[i + 2], q[i + 1]], o = V0[V0.length - 1]; if (!o || o[0] !== p[0] || o[2] !== p[2]) V0.push(p); }
    if (V0.length < 2) continue;
    // open track heights come from the LiDAR surface and jump between the viaduct deck and the ground (fault F50): the plot
    // uses the drone's tube rule, a moving average over 5 points, so the track is drawn where the train mode rides it
    if (!road) { const y = V0.map(p => p[1]); V0.forEach((p, i) => { let t = 0, n = 0; for (let j = Math.max(0, i - 2); j <= Math.min(y.length - 1, i + 2); j++) { t += y[j]; n++; } p[1] = t / n; }); }
    const V = []; for (let i = 1; i < V0.length; i++) along(V0[i - 1], V0[i], V);
    if (!road) { polyline('rail', V, .3); continue; }
    const off = V.map((p, i) => {
      const n1 = i ? nrm(V[i - 1], p) : null, n2 = i < V.length - 1 ? nrm(p, V[i + 1]) : null;
      if (!n1 || !n2) { const n = n1 || n2; return [n[0] * w, n[1] * w]; }
      const mx = n1[0] + n2[0], mz = n1[1] + n2[1], ml = Math.hypot(mx, mz);
      if (ml < 1e-6) return [n1[0] * w, n1[1] * w];
      const s = w / Math.max(.5, (mx * n1[0] + mz * n1[1]) / ml) / ml;
      return [mx * s, mz * s];
    });
    for (const sg of [1, -1]) polyline('road', V.map((p, i) => [p[0] + sg * off[i][0], p[1], p[2] + sg * off[i][1]]), .3, [2 * w, 2]);
  }
  // paths and corridors with a level tag, at the page's heights (station models: measured floors)
  const ST = globalThis.DocklandsStations, U = globalThis.DOCKLANDS_UNDER;
  if (U && $('showUnder') && $('showUnder').checked) for (const o of U.indoor) if (o.line) { const f = C.dec(o.line);
    if (ST && ST.inside(f[0], f[1])) continue;
    for (const lv of o.lv) { const ly = lv < 0 && ST ? ST.levelY(f[0], f[1], lv, o.g) : null, y = ly ?? o.g + lv * P.storey + .2; if (y < C.groundAt(f[0], f[1]) - 1 && cutY === Infinity && !opt.under) continue;
      for (let i = 2; i < f.length; i += 2) seg('path', [f[i - 2], y, f[i - 1]], [f[i], y, f[i + 1]]); } }
  // underground: tunnels and the station models, drawn when the model is cut open
  if (cutY < Infinity || opt.under) {
    for (const l of C.A.lines) if (l.tunnel) for (let i = 1; i < l.pts.length; i++) { const a = l.pts[i - 1], b = l.pts[i];
      for (const [s, e] of ST ? ST.outside(a[0], a[1], b[0], b[1]) : [[0, 1]]) { const ya = C.tunnelY(l, a, P) + 3, yb = C.tunnelY(l, b, P) + 3;
        seg('under', [a[0] + (b[0] - a[0]) * s, ya + (yb - ya) * s, a[1] + (b[1] - a[1]) * s], [a[0] + (b[0] - a[0]) * e, ya + (yb - ya) * e, a[1] + (b[1] - a[1]) * e]); } }
    if (ST && ST.S.doc && $('showStations') && $('showStations').checked) stationEdges(ST.S.doc, seg, tri);
  }
  return { cutY };
}
// a building's size on the screen from its box: 0 draw all edges, 1 (under 3 minPx) roof outline only, 2 (under minPx) none
function smallOf(cam, minPx, b) {
  const [x0, y0, z0, x1, y1, z1] = b; let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
  for (const q of [[x0, y0, z0], [x1, y1, z1], [x0, y1, z1], [x1, y0, z0], [x0, y1, z0], [x1, y1, z0]]) { const c = cam.clip(...q); if (!nearOK(c) || c[3] <= 0) return 0; const s = cam.scr(c);
    sx0 = Math.min(sx0, s[0]); sx1 = Math.max(sx1, s[0]); sy0 = Math.min(sy0, s[1]); sy1 = Math.max(sy1, s[1]); }
  const sz = Math.max(sx1 - sx0, sy1 - sy0); return sz < minPx ? 2 : sz < 3 * minPx ? 1 : 0;
}
function stationEdges(doc, seg, tri) {   // feature edges: a boundary, or two faces more than 30 degrees apart
  const GLASS = new Set(['box', 'hall', 'canopy']);
  for (const o of doc.objects) { if (o.cls === 'tunnel') continue; const t = o.t, p = o.p, P = k => [t[0] + p[3 * k] / 100, t[1] + p[3 * k + 1] / 100, t[2] + p[3 * k + 2] / 100];
    const nrm = [], edges = new Map();
    for (let k = 0; k < o.i.length; k += 3) { const a = P(o.i[k]), b = P(o.i[k + 1]), c = P(o.i[k + 2]);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1;
      nrm.push(n.map(x => x / l)); if (!GLASS.has(o.cls)) tri(a, b, c);
      for (const [i, j] of [[o.i[k], o.i[k + 1]], [o.i[k + 1], o.i[k + 2]], [o.i[k + 2], o.i[k]]]) { const key = i < j ? i + ',' + j : j + ',' + i; (edges.get(key) || edges.set(key, []).get(key)).push(k / 3); } }
    for (const [key, fs] of edges) { const feature = fs.length === 1 || fs.some(f => { const a = nrm[fs[0]], b = nrm[f]; return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] < .866; });
      if (feature) { const [i, j] = key.split(',').map(Number); seg('under', P(i), P(j)); } }
  }
}

// ---------- visibility and polylines
function visibleRuns(Z, cam, cutY, a, b, out) {
  if (a[1] > cutY && b[1] > cutY) return; if (a[1] > cutY || b[1] > cutY) { const t = (cutY - a[1]) / (b[1] - a[1]); if (a[1] > cutY) a = lerp(a, b, t); else b = lerp(a, b, t); }
  let ca = cam.clip(...a), cb = cam.clip(...b), ta = cam.clip(...cam.toward(...a)), tb = cam.clip(...cam.toward(...b));
  const da = ca[2] + ca[3], db = cb[2] + cb[3]; if (da < 0 && db < 0) return;
  if (da < 0 || db < 0) { const t = da / (da - db); if (da < 0) { ca = lerp(ca, cb, t); ta = lerp(ta, tb, t); } else { cb = lerp(ca, cb, t); tb = lerp(ta, tb, t); } }
  if (!nearOK(ca) || !nearOK(cb) || ca[3] <= 0 || cb[3] <= 0) return;
  const A = cam.scr(ca), B = cam.scr(cb), TA = cam.scr(ta), TB = cam.scr(tb), len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if ((A[0] < 0 && B[0] < 0) || (A[0] > Z.W && B[0] > Z.W) || (A[1] < 0 && B[1] < 0) || (A[1] > Z.H && B[1] > Z.H)) return;
  const n = Math.max(1, Math.ceil(len / .75)); let run = null;
  for (let s = 0; s <= n; s++) { const t = s / n, x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t, inView = x >= 0 && y >= 0 && x < Z.W && y < Z.H;
    let vis = false; if (inView) { const d = TA[2] + (TB[2] - TA[2]) * t, px = Math.min(Z.W - 1, x | 0), py = Math.min(Z.H - 1, y | 0); vis = d <= Z.z[py * Z.W + px] + 1e-6; }
    if (vis) { if (!run) run = [[x, y]]; else run[1] = [x, y]; } else if (run) { if (run.length > 1) out.push(run); run = null; } }
  if (run && run.length > 1) out.push(run);
}
function chain(segs) {   // join runs that meet end to start (within 0.6 px) into polylines
  const key = p => Math.round(p[0] / .6) + ',' + Math.round(p[1] / .6), starts = new Map(), used = new Uint8Array(segs.length), lines = [];
  segs.forEach((s, i) => { const k = key(s[0]); (starts.get(k) || starts.set(k, []).get(k)).push(i); });
  for (let i = 0; i < segs.length; i++) { if (used[i]) continue; used[i] = 1; const L = [segs[i][0], segs[i][1]];
    for (;;) { const c = (starts.get(key(L[L.length - 1])) || []).find(j => !used[j]); if (c == null) break; used[c] = 1; L.push(segs[c][1]); }
    lines.push(L); }
  return lines;
}
// Douglas-Peucker. When the two ends of a span meet (a closed outline: a fully visible roof, base or shore ring) the
// distance is to that point, not to a line of zero length: with the line, every distance was 0 and the whole ring went
function simplify(pts, tol) {
  if (pts.length < 3) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i, j] = st.pop(), [ax, ay] = pts[i], [bx, by] = pts[j], L = Math.hypot(bx - ax, by - ay); let best = -1, bd = tol;
    for (let k = i + 1; k < j; k++) {
      const d = L > 1e-9 ? Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / L : Math.hypot(pts[k][0] - ax, pts[k][1] - ay);
      if (d > bd) { bd = d; best = k; }
    }
    if (best > 0) { keep[best] = 1; st.push([i, best], [best, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}
// Fewer pen lifts: lines whose ends lie near the same point become one trail. Nodes are clusters of line ends (every end
// within r of the cluster's first end, so a bridge drawn with the pen down is at most 2 r: the pen width); edges are the
// lines. Each connected part needs max(1, odd nodes / 2) trails: the odd nodes are paired by virtual edges, an Euler
// circuit is walked (Hierholzer), and the circuit is cut at the virtual edges.
function join(lines, r) {
  const cell = new Map(), lead = [];
  const node = p => {
    const cx = Math.floor(p[0] / r), cy = Math.floor(p[1] / r); let best = -1, bd = r;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const k of cell.get((cx + dx) + ',' + (cy + dy)) || []) {
      const d = Math.hypot(p[0] - lead[k][0], p[1] - lead[k][1]); if (d <= bd) { bd = d; best = k; } }
    if (best < 0) { best = lead.length; lead.push(p); const key = cx + ',' + cy; (cell.get(key) || cell.set(key, []).get(key)).push(best); }
    return best;
  };
  const E = lines.map(L => [node(L[0]), node(L[L.length - 1])]), n = lead.length, nl = lines.length;
  const par = Int32Array.from({ length: n }, (_, i) => i), find = a => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  const deg = new Int32Array(n);
  for (const [u, v] of E) { par[find(u)] = find(v); deg[u]++; deg[v]++; }
  const oddOf = new Map();
  for (let v = 0; v < n; v++) if (deg[v] & 1) { const c = find(v), o = oddOf.get(c); if (o == null) oddOf.set(c, v); else { E.push([o, v]); oddOf.delete(c); } }
  const adj = Array.from({ length: n }, () => []);
  E.forEach(([u, v], e) => { adj[u].push(e); adj[v].push(e); });
  const used = new Uint8Array(E.length), ptr = new Int32Array(n), out = [];
  for (let s = 0; s < n; s++) {
    const st = [[s, -1, 0]], cir = [];
    while (st.length) {
      const top = st[st.length - 1], v = top[0]; let e = -1;
      while (ptr[v] < adj[v].length) { const c = adj[v][ptr[v]++]; if (!used[c]) { e = c; break; } }
      if (e < 0) { st.pop(); if (top[1] >= 0) cir.push(top); continue; }
      used[e] = 1; const fwd = E[e][0] === v; st.push([fwd ? E[e][1] : E[e][0], e, fwd ? 0 : 1]);
    }
    if (!cir.length) continue;
    cir.reverse();
    const k0 = cir.findIndex(c => c[1] >= nl), seq = k0 < 0 ? cir : [...cir.slice(k0 + 1), ...cir.slice(0, k0 + 1)];
    let cur = null;
    for (const [, e, rev] of seq) {
      if (e >= nl) { cur = null; continue; }
      const pts = rev ? lines[e].slice().reverse() : lines[e];
      if (!cur) { out.push(cur = pts.slice()); continue; }
      const a = cur[cur.length - 1];
      for (let i = a[0] === pts[0][0] && a[1] === pts[0][1] ? 1 : 0; i < pts.length; i++) cur.push(pts[i]);
    }
  }
  return out;
}

// Single-stroke text in Hershey Roman Simplex (futural.jhf, ASCII 32 to 127; acknowledgement in the header): one string
// per glyph, its left and right edges then x y pairs, each a character minus 'R'; " R" lifts the pen. Cap height 21 units,
// baseline at y = 9.
const HERSHEY = ["JZ","MWRFRT RRYQZR[SZRY","JZNFNM RVFVM","H]SBLb RYBRb RLOZO RKUYU","H\\PBP_ RTBT_ RYIWGTFPFMGKIKKLMMNOOUQWRXSYUYXWZT[P[MZKX","F^[FI[ RNFPHPJOLMMKMIKIIJGLFNFPGSHVHYG[F RWTUUTWTYV[X[ZZ[X[VYTWT","E_\\O\\N[MZMYNXPVUTXRZP[L[JZIYHWHUISJRQNRMSKSIRGPFNGMIMKNNPQUXWZY[[[\\Z\\Y","MWRHQGRFSGSIRKQL","KYVBTDRGPKOPOTPYR]T`Vb","KYNBPDRGTKUPUTTYR]P`Nb","JZRLRX RMOWU RWOMU","E_RIR[ RIR[R","NVSWRXQWRVSWSYQ[","E_IR[R","NVRVQWRXSWRV","G][BIb","H\\QFNGLJKOKRLWNZQ[S[VZXWYRYOXJVGSFQF","H\\NJPISFS[","H\\LKLJMHNGPFTFVGWHXJXLWNUQK[Y[","H\\MFXFRNUNWOXPYSYUXXVZS[P[MZLYKW","H\\UFKTZT RUFU[","H\\WFMFLOMNPMSMVNXPYSYUXXVZS[P[MZLYKW","H\\XIWGTFRFOGMJLOLTMXOZR[S[VZXXYUYTXQVOSNRNOOMQLT","H\\YFO[ RKFYF","H\\PFMGLILKMMONSOVPXRYTYWXYWZT[P[MZLYKWKTLRNPQOUNWMXKXIWGTFPF","H\\XMWPURRSQSNRLPKMKLLINGQFRFUGWIXMXRWWUZR[P[MZLX","NVROQPRQSPRO RRVQWRXSWRV","NVROQPRQSPRO RSWRXQWRVSWSYQ[","F^ZIJRZ[","E_IO[O RIU[U","F^JIZRJ[","I[LKLJMHNGPFTFVGWHXJXLWNVORQRT RRYQZR[SZRY","E`WNVLTKQKOLNMMPMSNUPVSVUUVS RQKOMNPNSOUPV RWKVSVUXVZV\\T]Q]O\\L[JYHWGTFQFNGLHJJILHOHRIUJWLYNZQ[T[WZYYZX RXKWSWUXV","I[RFJ[ RRFZ[ RMTWT","G\\KFK[ RKFTFWGXHYJYLXNWOTP RKPTPWQXRYTYWXYWZT[K[","H]ZKYIWGUFQFOGMILKKNKSLVMXOZQ[U[WZYXZV","G\\KFK[ RKFRFUGWIXKYNYSXVWXUZR[K[","H[LFL[ RLFYF RLPTP RL[Y[","HZLFL[ RLFYF RLPTP","H]ZKYIWGUFQFOGMILKKNKSLVMXOZQ[U[WZYXZVZS RUSZS","G]KFK[ RYFY[ RKPYP","NVRFR[","JZVFVVUYTZR[P[NZMYLVLT","G\\KFK[ RYFKT RPOY[","HYLFL[ RL[X[","F^JFJ[ RJFR[ RZFR[ RZFZ[","G]KFK[ RKFY[ RYFY[","G]PFNGLIKKJNJSKVLXNZP[T[VZXXYVZSZNYKXIVGTFPF","G\\KFK[ RKFTFWGXHYJYMXOWPTQKQ","G]PFNGLIKKJNJSKVLXNZP[T[VZXXYVZSZNYKXIVGTFPF RSWY]","G\\KFK[ RKFTFWGXHYJYLXNWOTPKP RRPY[","H\\YIWGTFPFMGKIKKLMMNOOUQWRXSYUYXWZT[P[MZKX","JZRFR[ RKFYF","G]KFKULXNZQ[S[VZXXYUYF","I[JFR[ RZFR[","F^HFM[ RRFM[ RRFW[ R\\FW[","H\\KFY[ RYFK[","I[JFRPR[ RZFRP","H\\YFK[ RKFYF RK[Y[","KYOBOb RPBPb ROBVB RObVb","KYKFY^","KYTBTb RUBUb RNBUB RNbUb","JZRDJR RRDZR","I[Ib[b","NVSKQMQORPSORNQO","I\\XMX[ RXPVNTMQMONMPLSLUMXOZQ[T[VZXX","H[LFL[ RLPNNPMSMUNWPXSXUWXUZS[P[NZLX","I[XPVNTMQMONMPLSLUMXOZQ[T[VZXX","I\\XFX[ RXPVNTMQMONMPLSLUMXOZQ[T[VZXX","I[LSXSXQWOVNTMQMONMPLSLUMXOZQ[T[VZXX","MYWFUFSGRJR[ ROMVM","I\\XMX]W`VaTbQbOa RXPVNTMQMONMPLSLUMXOZQ[T[VZXX","I\\MFM[ RMQPNRMUMWNXQX[","NVQFRGSFREQF RRMR[","MWRFSGTFSERF RSMS^RaPbNb","IZMFM[ RWMMW RQSX[","NVRFR[","CaGMG[ RGQJNLMOMQNRQR[ RRQUNWMZM\\N]Q][","I\\MMM[ RMQPNRMUMWNXQX[","I\\QMONMPLSLUMXOZQ[T[VZXXYUYSXPVNTMQM","H[LMLb RLPNNPMSMUNWPXSXUWXUZS[P[NZLX","I\\XMXb RXPVNTMQMONMPLSLUMXOZQ[T[VZXX","KXOMO[ ROSPPRNTMWM","J[XPWNTMQMNNMPNRPSUTWUXWXXWZT[Q[NZMX","MYRFRWSZU[W[ ROMVM","I\\MMMWNZP[S[UZXW RXMX[","JZLMR[ RXMR[","G]JMN[ RRMN[ RRMV[ RZMV[","J[MMX[ RXMM[","JZLMR[ RXMR[P_NaLbKb","J[XMM[ RMMXM RM[X[","KYTBRCQDPFPHQJRKSMSOQQ RRCQEQGRISJTLTNSPORSTTVTXSZR[Q]Q_Ra RQSSUSWRYQZP\\P^Q`RaTb","NVRBRb","KYPBRCSDTFTHSJRKQMQOSQ RRCSESGRIQJPLPNQPURQTPVPXQZR[S]S_Ra RSSQUQWRYSZT\\T^S`RaPb","F^IUISJPLONOPPTSVTXTZS[Q RISJQLPNPPQTTVUXUZT[Q[O","JZJFJ[K[KFLFL[M[MFNFN[O[OFPFP[Q[QFRFR[S[SFTFT[U[UFVFV[W[WFXFX[Y[YFZFZ["];
// polylines in mm for one line of text: x0 left, y0 baseline, cap height in mm; "©" is a circle round a small c
function strokeText(str, x0, y0, cap) {
  const s = cap / 21, lines = []; let x = x0;
  const glyph = (g, gx, gy, gs) => { const L = g.charCodeAt(0) - 82; let cur = null;
    for (let i = 2; i < g.length; i += 2) { if (g[i] === ' ' && g[i + 1] === 'R') { cur = null; continue; }
      if (!cur) lines.push(cur = []); cur.push([gx + (g.charCodeAt(i) - 82 - L) * gs, gy + (g.charCodeAt(i + 1) - 82 - 9) * gs]); }
    return (g.charCodeAt(1) - 82 - L) * gs; };
  for (const ch of str) {
    if (ch === '©') { const R = 11, cx = x + (R + 2) * s, cy = y0 - 10.5 * s, ring = [];
      for (let i = 0; i <= 24; i++) ring.push([cx + R * s * Math.cos(i * Math.PI / 12), cy + R * s * Math.sin(i * Math.PI / 12)]);
      lines.push(ring); glyph(HERSHEY[67], cx - 5.4 * s, cy + 4.2 * s, s * .6); x += (2 * R + 4) * s; continue; }
    x += glyph(HERSHEY[ch.charCodeAt(0) - 32] || HERSHEY[0], x, y0, s);
  }
  return { lines, width: x - x0 };
}

function order(lines) {   // greedy nearest start (either end) to cut pen-up travel
  const out = [], left = lines.slice(); let at = [0, 0];
  while (left.length) { let bi = 0, bd = Infinity, rev = false;
    for (let i = 0; i < left.length; i++) { const L = left[i], d0 = (L[0][0] - at[0]) ** 2 + (L[0][1] - at[1]) ** 2, d1 = (L[L.length - 1][0] - at[0]) ** 2 + (L[L.length - 1][1] - at[1]) ** 2;
      if (d0 < bd) { bd = d0; bi = i; rev = false; } if (d1 < bd) { bd = d1; bi = i; rev = true; } }
    let L = left.splice(bi, 1)[0]; if (rev) L = L.slice().reverse(); out.push(L); at = L[L.length - 1]; }
  return out;
}

// ---------- the SVG
function make(opts = {}) {
  const t0 = performance.now(), cv = $('c'), W0 = cv.clientWidth, H0 = cv.clientHeight, s = Math.min(2, 2400 / Math.max(W0, H0)), W = Math.round(W0 * s), H = Math.round(H0 * s);
  const [pw0, ph0] = PAPER[opts.paper || 'A3'], land = W >= H, PW = land ? pw0 : ph0, PH = land ? ph0 : pw0;
  const k = Math.min((PW - 2 * MARGIN) / W, (PH - 2 * MARGIN - 6) / H), ox = (PW - W * k) / 2, oy = MARGIN + (PH - 2 * MARGIN - 6 - H * k) / 2;
  const P = C.par(), cam = camera(W, H), Z = zbuffer(W, H), O = [], E = Object.fromEntries(LAYERS.map(l => [l[0], []])), minPx = (opts.minMm ?? 1) / k;
  const { cutY } = scene(P, { small: b => smallOf(cam, minPx, b), emit: (L, a, b) => E[L].push(a, b), tri: (a, b, c) => O.push(a, b, c) });
  // occluders: clip to the cut level and the near plane, then fill the z-buffer
  let nTri = 0;
  for (let k = 0; k < O.length; k += 3) { let poly = [O[k], O[k + 1], O[k + 2]];
    if (cutY < Infinity) { poly = clipPoly(poly, p => p[1] <= cutY, (a, b) => lerp(a, b, (cutY - a[1]) / (b[1] - a[1]))); if (poly.length < 3) continue; }
    let cp = poly.map(p => cam.clip(...p)); if (cp.every(c => c[0] > c[3]) || cp.every(c => c[0] < -c[3]) || cp.every(c => c[1] > c[3]) || cp.every(c => c[1] < -c[3])) continue;
    cp = clipPoly(cp, c => c[2] + c[3] >= 1e-6, (a, b) => { const da = a[2] + a[3], db = b[2] + b[3]; return lerp(a, b, da / (da - db)); }); if (cp.length < 3) continue;
    const sp = cp.map(cam.scr); for (let i = 1; i < sp.length - 1; i++) { rasterTri(Z, sp[0], sp[i], sp[i + 1]); nTri++; } }
  // edges -> visible polylines -> trails (ends within the pen width joined, fewer pen lifts) -> nearest-end order, mm on the paper
  const tol = .08 / k, stats = {}, out = {}, len = L => L.reduce((a, p, i) => i ? a + Math.hypot(p[0] - L[i - 1][0], p[1] - L[i - 1][1]) : 0, 0);
  for (const [id] of LAYERS) {
    const runs = [], segs = E[id];
    for (let i = 0; i < segs.length; i += 2) visibleRuns(Z, cam, cutY, segs[i], segs[i + 1], runs);
    const lines = order(join(chain(runs).map(L => simplify(L, tol)).filter(L => L.length > 1), PEN / 2 / k).filter(L => len(L) * k > .25));
    stats[id] = lines.length; out[id] = lines.map(L => L.map(p => [ox + p[0] * k, oy + p[1] * k]));
  }
  // the credit in single-stroke text, in layer 1 (plotter software skips SVG text): under the drawing from its left edge
  // when it fits the drawing's width (a preview that fits the page height cuts the side margins), else from the margin;
  // one row, or two when one is too wide
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const parts = [`Docklands 3D, ${when} UTC.`, '© OpenStreetMap contributors (ODbL).', 'Heights: Environment Agency LiDAR (OGL v3.0).'], credit = parts.join(' ');
  const cw = t => strokeText(t, 0, 0, 2.2).width, two = [parts[0], parts.slice(1).join(' ')], page = PW - 2 * MARGIN;
  const [rows, x0, room] = [[[credit], ox, W * k], [two, ox, W * k], [[credit], MARGIN, page]].find(([r, , w]) => Math.max(...r.map(cw)) <= w) || [two, MARGIN, page];
  const cap = 2.2 * Math.min(1, room / Math.max(...rows.map(cw)));
  const creditLines = rows.flatMap((t, i) => strokeText(t, x0, PH - MARGIN + 1 - (rows.length - 1 - i) * cap * 1.6, cap).lines);
  stats.credit = creditLines.length;
  const d = ls => ls.map(L => 'M' + L.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('L')).join('');
  // the page's share link of this view, in the description only (not plotted): with the screen size it gives the same plot
  const xml = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;'), N = globalThis.DocklandsNav;
  let view = location.href; try { if (N && N.shareUrl) view = N.shareUrl().url; } catch { /* keep the page address */ }
  const groups = LAYERS.filter(([id]) => out[id].length || id === 'bld').map(([id, label, col]) =>
    `<g id="${id}" inkscape:groupmode="layer" inkscape:label="${label}" fill="none" stroke="${col}" stroke-width="${PEN}" stroke-linecap="round" stroke-linejoin="round">` +
    (out[id].length ? `<path d="${d(out[id])}"/>` : '') + (id === 'bld' ? `<path id="credit" d="${d(creditLines)}"/>` : '') + '</g>');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${PW}mm" height="${PH}mm" viewBox="0 0 ${PW} ${PH}">\n` +
    `<title>Docklands 3D: plotter drawing of the current view</title><desc>${xml(credit)} Hidden lines removed. View: ${xml(view)} (screen ${W0} x ${H0} CSS px).</desc>\n${groups.join('\n')}\n</svg>\n`;
  return { svg, stats, ms: Math.round(performance.now() - t0), raster: [W, H], occluders: nTri, paper: [PW, PH] };
}
function download() {
  const paper = ($('plotPaper') || {}).value || 'A3'; C.toast('Drawing the plot…');
  setTimeout(() => { try { const r = make({ paper }), url = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' })), a = document.createElement('a');
    a.href = url; a.download = `docklands-plot-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${paper}.svg`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    C.toast(`Plotter SVG saved (${paper}, ${Object.values(r.stats).reduce((a, b) => a + b, 0).toLocaleString()} lines, ${(r.svg.length / 1024).toFixed(0)} kB).`);
  } catch (e) { C.toast('Plot failed: ' + e.message); } }, 30);
}
function injectUi() {
  const sb = $('shareOut') || $('shareBtn'); if (!sb) return false;
  const row = document.createElement('div'); row.id = 'plotRow'; row.className = 'row';
  row.innerHTML = '<button type="button" id="plotBtn">Plotter SVG of this view</button> <select id="plotPaper" aria-label="Paper size"><option>A4</option><option selected>A3</option><option value="A2">A2 (larger than an A3 plotter)</option></select>';
  sb.after(row); $('plotBtn').onclick = download; return true;
}
function init(ctx) { C = ctx; if (!injectUi()) document.addEventListener('DOMContentLoaded', injectUi, { once: true }); }
globalThis.DocklandsPlot = { init, make, download, scene, LAYERS };
if (globalThis.DocklandsPlotCtx) init(globalThis.DocklandsPlotCtx);
})();
