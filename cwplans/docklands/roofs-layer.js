// Roof shapes of the Docklands 3D page (Layers > Show > "Roof shapes"): gabled, hipped, pyramidal and skillion roofs for
// the low model buildings in data/roofs.json (tools/build-roofs.mjs: EA LiDAR fits and OSM roof tags), drawn into the
// building mesh in place of the flat prism top. An outline with wings (an L, a T, a rear outrigger) comes as parts: the
// ring cut by chords (pieces(), the same split as tools/lidar-roofs.py), each part with its own roof; a gable that ends
// against a crossing wing runs on into it to that wing's ridge, so the two roofs meet in a valley. index.html calls
// DocklandsRoofs.decode(json, MFP) once the file is loaded and DocklandsRoofs.prism(M, b, roof, col, al, C) from
// buildBld() for each building that has a roof; the pick pass, Line drawing, the plotter and Drone keep the extruded
// outline. Skill: docklands-3d-page, "Roof shapes".
(() => {
const CODES = ['f', 'g', 'h', 'p', 'k'];   // parts: flat, gabled, hipped, pyramidal, skillion
// roofs.json -> Map(model index -> roof); null when the file is for another area.js (fingerprint)
function decode(T, MFP) {
  if (!T || !T.model || T.model.fp !== MFP) { console.warn('roofs.json is for another area.js: no roof shapes'); return null; }
  const s = T.s.split(','), r = T.r, out = new Map(); let i = 0;
  for (let k = 0; k < s.length; k++) { const q = r.slice(8 * k, 8 * k + 8); i += q[0];
    out.set(i, { shape: s[k], x: q[1] / 10, z: q[2] / 10, bearing: q[3] / 10, eave: q[4] / 100, ridge: q[5] / 100, hs: q[6] / 10, hl: q[7] < 0 ? null : q[7] / 10 }); }
  const m = T.m || []; i = 0;
  for (let o = 0; o < m.length;) {
    i += m[o]; const nc = m[o + 1]; o += 2; const cuts = [], parts = [];
    for (let c = 0; c < nc; c++, o += 5) cuts.push(m.slice(o, o + 5));
    for (let p = 0; p <= nc; p++, o += 10) { const q = m.slice(o, o + 10);
      parts.push({ shape: CODES[q[0]], x: q[1] / 10, z: q[2] / 10, bearing: q[3] / 10, eave: q[4] / 100, ridge: q[5] / 100, hs: q[6] / 10, hl: q[7] < 0 ? null : q[7] / 10, e0: q[8] / 10, e1: q[9] / 10 }); }
    out.set(i, { shape: 'parts', cuts, parts, eave: Math.min(...parts.map(p => p.eave)), ridge: Math.max(...parts.map(p => p.ridge)) });
  }
  return out;
}
// the roof planes as height above the base: y = a x + b z + c (page metres); the roof is their lower envelope, never
// below the eave or above the ridge. Gable: two planes falling from the ridge line; hipped and pyramidal: also from the
// ends of the ridge; skillion: one plane falling from the ridge line (its high edge) to the side n; flat: none.
function planes(R) {
  if (R.shape === 'f') return [];
  const t = R.bearing * Math.PI / 180, d = [Math.sin(t), -Math.cos(t)], n = [-d[1], d[0]], k = (R.ridge - R.eave) / R.hs, out = [];
  const pl = (ax, az, dist0) => ({ a: -k * ax, b: -k * az, c: R.ridge + k * (ax * R.x + az * R.z + dist0) });   // R.ridge - k (p.axis - c.axis - dist0)
  out.push(pl(n[0], n[1], 0)); if (R.shape !== 'k') out.push(pl(-n[0], -n[1], 0));
  if (R.hl != null) out.push(pl(d[0], d[1], R.hl), pl(-d[0], -d[1], R.hl));
  return out;
}
const at = (P, x, z) => P.a * x + P.b * z + P.c;
const envelope = (P, R) => (x, z) => { let h = Infinity; for (const p of P) h = Math.min(h, at(p, x, z)); return h === Infinity ? R.ridge : Math.max(R.eave, Math.min(R.ridge, h)); };
// Sutherland-Hodgman: the part of polygon pts (x, z pairs) where f(x, z) <= 0, f linear
function clip(pts, f) {
  const out = [];
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length], fp = f(p[0], p[1]), fq = f(q[0], q[1]);
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } }
  return out;
}
// the same with a flag a vertex: true when the edge from it lies on a clip line (an inner edge of the result)
function clipF(pts, F, f) {
  const P = [], G = [];
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length], fp = f(p[0], p[1]), fq = f(q[0], q[1]);
    const X = () => { const t = fp / (fp - fq); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
    if (fp <= 0 && fq <= 0) { P.push(p); G.push(F[i]); }
    else if (fp <= 0) { P.push(p); G.push(fp < 0 ? F[i] : true); if (fp < 0) { P.push(X()); G.push(true); } }
    else if (fq < 0) { P.push(X()); G.push(F[i]); }
    else if (fq === 0) { /* q goes in on the next edge */ }
  }
  return [P, G];
}
// ---- pieces: the ring cut by chords, as tools/lidar-roofs.py (split_ring, dedupe, pieces_of). A cut is
// [piece, edge, t x 10000, edge, t x 10000]: the piece is replaced by the part from the first point on, the rest is appended.
function dedupe(P, F) {
  P = P.slice(); F = F.slice(); let k = 0;
  while (k < P.length && P.length > 2) { const q = P[(k + 1) % P.length];
    if (Math.abs(P[k][0] - q[0]) < 1e-3 && Math.abs(P[k][1] - q[1]) < 1e-3) { P.splice(k, 1); F.splice(k, 1); } else k++; }
  return [P, F];
}
function splitRing(P, F, j1, t1, j2, t2) {
  const n = P.length; if (j1 > j2) [j1, t1, j2, t2] = [j2, t2, j1, t1];
  const lerp = (j, t) => [P[j][0] + (P[(j + 1) % n][0] - P[j][0]) * t, P[j][1] + (P[(j + 1) % n][1] - P[j][1]) * t], A = lerp(j1, t1), B = lerp(j2, t2);
  const p1 = [A], f1 = []; for (let k = j1 + 1; k <= j2; k++) p1.push(P[k]); p1.push(B); for (let k = j1; k <= j2; k++) f1.push(F[k]); f1.push(true);
  const p2 = [B], f2 = [F[j2]]; for (let m = 0, M = ((j1 - j2) % n + n) % n; m < M; m++) { const k = (j2 + 1 + m) % n; p2.push(P[k]); f2.push(F[k]); } p2.push(A); f2.push(true);
  return [dedupe(p1, f1), dedupe(p2, f2)];
}
function pieces(ring, cuts) {
  const out = [[ring, ring.map(() => false)]];
  for (const [k, j1, t1, j2, t2] of cuts) { const [P, F] = out[k], [a, b] = splitRing(P, F, j1, t1 / 1e4, j2, t2 / 1e4); out[k] = a; out.push(b); }
  return out;
}
const area2 = P => { let s = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += p[0] * q[1] - q[0] * p[1]; } return s; };
function inPoly(P, x, z) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
  return c;
}
// the cut edges of a gable part's piece that cross its ridge line, one at each end: { 0: start, 1: end } -> { k: edge,
// sc: where the ridge line meets it (metres along the ridge from the ridge centre) }
function gableEnds(pg, F, R) {
  const t = R.bearing * Math.PI / 180, d = [Math.sin(t), -Math.cos(t)], n = [-d[1], d[0]], out = {};
  const S = (x, z) => (x - R.x) * d[0] + (z - R.z) * d[1], T = (x, z) => (x - R.x) * n[0] + (z - R.z) * n[1];
  let sm = 0; for (const [x, z] of pg) sm += S(x, z) / pg.length;
  for (let k = 0; k < pg.length; k++) { if (!F[k]) continue; const a = pg[k], b = pg[(k + 1) % pg.length], ta = T(...a), tb = T(...b);
    if (ta * tb > 0 || ta === tb) continue; const w = ta / (ta - tb), sc = S(a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w), end = sc > sm ? 1 : 0;
    if (!out[end] || (end ? sc > out[end].sc : sc < out[end].sc)) out[end] = { k, sc }; }
  return out;
}
// the run of a gable part past a cut end (e0 at the start, e1 at the end, metres along the ridge from where the ridge
// line meets the cut): the outline clipped to the band of the piece across the ridge, beyond the cut line, up to the run
function extensions(ring, piece, R) {
  const out = [], [pg, F] = piece; if (R.shape !== 'g' || !(R.e0 > 0 || R.e1 > 0) || pg.length < 3) return out;
  const t = R.bearing * Math.PI / 180, d = [Math.sin(t), -Math.cos(t)], n = [-d[1], d[0]];
  const S = (x, z) => (x - R.x) * d[0] + (z - R.z) * d[1], T = (x, z) => (x - R.x) * n[0] + (z - R.z) * n[1];
  let t0 = Infinity, t1 = -Infinity, cx = 0, cz = 0; for (const [x, z] of pg) { const w = T(x, z); t0 = Math.min(t0, w); t1 = Math.max(t1, w); cx += x / pg.length; cz += z / pg.length; }
  const ends = gableEnds(pg, F, R);
  for (const end of [0, 1]) { const e = end ? R.e1 : R.e0, g = ends[end]; if (!(e > 0) || !g) continue;
    const a = pg[g.k], b = pg[(g.k + 1) % pg.length], side = (x, z) => (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]), sg = Math.sign(side(cx, cz)) || 1;
    let P = ring, G = ring.map(() => false);
    for (const f of [(x, z) => sg * side(x, z), end ? (x, z) => S(x, z) - (g.sc + e) : (x, z) => (g.sc - e) - S(x, z), (x, z) => t0 - T(x, z), (x, z) => T(x, z) - t1]) { if (P.length < 3) break; [P, G] = clipF(P, G, f); }
    if (P.length >= 3 && Math.abs(area2(P)) > 0.02) out.push([P, G]);
  }
  return out;
}
// walls up to the roof (gable ends come out as the walls' sloped tops) and one face a plane; u as prismF: metres along the
// ring on walls, -(1 + height) on the roof, so the shader treats the faces as roof (window grid off, ground image on)
function prism(M, b, R, col, al, C) {
  if (R.shape === 'parts') return prismParts(M, b, R, col, al, C);
  const f = C.dec(b.p), nv = f.length / 2, y0 = b.b, P = planes(R), ru = -(1 + R.ridge);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < nv; i++) { x0 = Math.min(x0, f[2 * i]); x1 = Math.max(x1, f[2 * i]); z0 = Math.min(z0, f[2 * i + 1]); z1 = Math.max(z1, f[2 * i + 1]); }
  if (!M.hold) M.cur = [(x0 + x1) / 2, (z0 + z1) / 2, y0];
  const H = envelope(P, R);
  // walls: each edge split where the lower envelope changes plane or meets the eave
  let along = 0;
  for (let k = 0; k < nv; k++) {
    const k2 = (k + 1) % nv, ax = f[2 * k], az = f[2 * k + 1], bx = f[2 * k2], bz = f[2 * k2 + 1], len = Math.hypot(bx - ax, bz - az), ts = [0, 1];
    breaks(P, R, ax, az, bx, bz, ts); ts.sort((p, q) => p - q);
    const s = C.shade(col, bz - az, 0, -(bx - ax)).map(c => c * .9);
    for (let m = 0; m + 1 < ts.length; m++) { const ta = ts[m], tb = ts[m + 1]; if (tb - ta < 1e-6) continue;
      const xa = ax + (bx - ax) * ta, za = az + (bz - az) * ta, xb = ax + (bx - ax) * tb, zb = az + (bz - az) * tb, ua = along + len * ta, ub = along + len * tb;
      const i = M.v(xa, y0, za, ua, s, al), j = M.v(xb, y0, zb, ub, s, al), kk = M.v(xb, y0 + H(xb, zb), zb, ub, s, al), l = M.v(xa, y0 + H(xa, za), za, ua, s, al);
      M.tri(i, j, kk); M.tri(i, kk, l); }
    along += len;
  }
  const ring = []; for (let i = 0; i < nv; i++) ring.push([f[2 * i], f[2 * i + 1]]);
  faces(M, y0, ring, P, R, H, col, al, C);
}
// where along a -> b (t in 0..1) the envelope of planes P changes plane or meets the eave or the ridge
function breaks(P, R, ax, az, bx, bz, ts) {
  const lin = p => [at(p, ax, az), at(p, bx, bz)];
  for (let i = 0; i < P.length; i++) { const [pa, pb] = lin(P[i]);
    for (const lv of [R.eave, R.ridge]) if ((pa - lv) * (pb - lv) < 0) ts.push((pa - lv) / (pa - pb));
    for (let j = i + 1; j < P.length; j++) { const [qa, qb] = lin(P[j]), da = pa - qa, db = pb - qb; if (da * db < 0) ts.push(da / (da - db)); } }
}
// roof faces over polygon poly: the region where each plane is the lowest, cut at the eave (below it the roof is flat at the eave)
function faces(M, y0, poly, P, R, H, col, al, C) {
  const top = col.map(c => Math.min(1, c * 1.05)), ru = -(1 + R.ridge);
  const put = (pg, s) => { if (pg.length < 3) return; const tris = C.earcut(pg.flat(), undefined, 2), base = M.n;
    for (const [x, z] of pg) M.v(x, y0 + H(x, z), z, ru, s, al);
    for (let k = 0; k < tris.length; k += 3) M.tri(base + tris[k], base + tris[k + 1], base + tris[k + 2]); };
  if (!P.length) { put(poly, C.shade(top, 0, 1, 0)); return; }
  for (let i = 0; i < P.length; i++) {
    let pg = poly; const A = P[i];
    for (let j = 0; j < P.length && pg.length >= 3; j++) if (j !== i) { const B = P[j]; pg = clip(pg, (x, z) => at(A, x, z) - at(B, x, z)); }
    if (pg.length < 3) continue;
    put(clip(clip(pg, (x, z) => R.eave - at(A, x, z)), (x, z) => at(A, x, z) - R.ridge), C.shade(top, -A.a, 1, -A.b));
    put(clip(pg, (x, z) => at(A, x, z) - R.eave), C.shade(top, 0, 1, 0));
  }
}
// a building in parts: walls of the outline up to the highest roof over each point; between parts, the walls where one
// roof stands above the next (a taller wing's gable end); each part's faces over its piece and its extensions (the depth
// test gives the union of the roofs, so a crossing gable makes a valley)
function prismParts(M, b, R, col, al, C) {
  const f = C.dec(b.p), nv = f.length / 2, y0 = b.b, ring = [];
  for (let i = 0; i < nv; i++) ring.push([f[2 * i], f[2 * i + 1]]);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  if (!M.hold) M.cur = [(x0 + x1) / 2, (z0 + z1) / 2, y0];
  const PC = pieces(ring, R.cuts), sg = Math.sign(area2(ring)) || 1;
  const parts = R.parts.map((q, i) => { const P = planes(q), piece = PC[i] || [[], []]; return { q, P, H: envelope(P, q), polys: [piece, ...extensions(ring, piece, q)].filter(c => c[0].length >= 3) }; });
  const covers = [];   // each part's piece and its extensions, with a bounding box
  for (const p of parts) for (const [pg, F] of p.polys) { let a = 1e9, b2 = -1e9, c = 1e9, d = -1e9; for (const [x, z] of pg) { a = Math.min(a, x); b2 = Math.max(b2, x); c = Math.min(c, z); d = Math.max(d, z); } covers.push({ p, pg, F, bb: [a, b2, c, d] }); }
  const covered = (cv, x, z) => { const B = cv.bb; return x >= B[0] - 1e-6 && x <= B[1] + 1e-6 && z >= B[2] - 1e-6 && z <= B[3] + 1e-6 && inPoly(cv.pg, x, z); };
  // the highest roof over a -> b among the covers other than skip, membership tested at points moved by (ox, oz):
  // sub-intervals [ta, tb, ha, hb] on which every height is linear (-Infinity: no roof)
  const profile = (ax, az, bx, bz, ox, oz, skip) => {
    const ts = [0, 1];
    for (const p of parts) breaks(p.P, p.q, ax, az, bx, bz, ts);
    for (const cv of covers) { if (cv === skip) continue; const pg = cv.pg;
      for (let k = 0; k < pg.length; k++) { const c = pg[k], d = pg[(k + 1) % pg.length];
        const ex = bx - ax, ez = bz - az, fx = d[0] - c[0], fz = d[1] - c[1], den = ex * fz - ez * fx; if (Math.abs(den) < 1e-12) continue;
        const wx = c[0] - ax, wz = c[1] - az, t = (wx * fz - wz * fx) / den, s = (wx * ez - wz * ex) / den; if (t > 0 && t < 1 && s >= 0 && s <= 1) ts.push(t); } }
    ts.sort((p, q) => p - q); const out = [];
    for (let m = 0; m + 1 < ts.length; m++) { const ta = ts[m], tb = ts[m + 1]; if (tb - ta < 1e-6) continue;
      const tm = (ta + tb) / 2, mx = ax + (bx - ax) * tm + ox, mz = az + (bz - az) * tm + oz;
      const act = [...new Set(covers.filter(cv => cv !== skip && covered(cv, mx, mz)).map(cv => cv.p))];
      const hv = t => { const x = ax + (bx - ax) * t, z = az + (bz - az) * t; let h = -Infinity; for (const p of act) h = Math.max(h, p.H(x, z)); return h; };
      const sub = [ta, tb];   // split where two active roofs cross
      for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
        const xa = ax + (bx - ax) * ta, za = az + (bz - az) * ta, xb = ax + (bx - ax) * tb, zb = az + (bz - az) * tb;
        const ha = act[i].H(xa, za) - act[j].H(xa, za), hb = act[i].H(xb, zb) - act[j].H(xb, zb);
        if (ha * hb < 0) sub.push(ta + (tb - ta) * ha / (ha - hb)); }
      sub.sort((p, q) => p - q);
      for (let k = 0; k + 1 < sub.length; k++) if (sub[k + 1] - sub[k] > 1e-7) out.push([sub[k], sub[k + 1], hv(sub[k]), hv(sub[k + 1])]);
    }
    return out;
  };
  const quad = (ax, az, bx, bz, ta, tb, la, lb, ha, hb, ua, ub, s) => {
    const xa = ax + (bx - ax) * ta, za = az + (bz - az) * ta, xb = ax + (bx - ax) * tb, zb = az + (bz - az) * tb;
    const i = M.v(xa, y0 + la, za, ua, s, al), j = M.v(xb, y0 + lb, zb, ub, s, al), k = M.v(xb, y0 + hb, zb, ub, s, al), l = M.v(xa, y0 + ha, za, ua, s, al);
    M.tri(i, j, k); M.tri(i, k, l); };
  // the outline's walls: from the ground to the highest roof (membership tested 2 cm inside)
  let along = 0;
  for (let k = 0; k < nv; k++) {
    const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % nv], len = Math.hypot(bx - ax, bz - az); if (len < 1e-6) continue;
    const ix = -sg * (bz - az) / len * .02, iz = sg * (bx - ax) / len * .02, s = C.shade(col, bz - az, 0, -(bx - ax)).map(c => c * .9);
    for (const [ta, tb, ha, hb] of profile(ax, az, bx, bz, ix, iz, null)) if (ha > -Infinity && hb > -Infinity) quad(ax, az, bx, bz, ta, tb, 0, 0, ha, hb, along + len * ta, along + len * tb, s);
    along += len;
  }
  // inner walls: each part's edges on a cut or an extension boundary, where its roof stands above the others (2 cm outside)
  for (const cv of covers) { const { p, pg, F } = cv; for (let k = 0; k < pg.length; k++) { if (!F[k]) continue;
    const [ax, az] = pg[k], [bx, bz] = pg[(k + 1) % pg.length], len = Math.hypot(bx - ax, bz - az); if (len < 1e-3) continue;
    const ox = sg * (bz - az) / len * .02, oz = -sg * (bx - ax) / len * .02, s = C.shade(col, sg * (bz - az), 0, -sg * (bx - ax)).map(c => c * .9);
    for (const [ta, tb, la0, lb0] of profile(ax, az, bx, bz, ox, oz, cv)) {
      const la = la0 > -Infinity ? la0 : 0, lb = lb0 > -Infinity ? lb0 : 0, ha = p.H(ax + (bx - ax) * ta, az + (bz - az) * ta), hb = p.H(ax + (bx - ax) * tb, az + (bz - az) * tb);
      const da = ha - la, db = hb - lb; if (da <= 1e-4 && db <= 1e-4) continue;
      if (da > 1e-4 && db > 1e-4) { quad(ax, az, bx, bz, ta, tb, la, lb, ha, hb, len * ta, len * tb, s); continue; }
      const tc = ta + (tb - ta) * da / (da - db), lc = la + (lb - la) * (tc - ta) / (tb - ta);
      if (da > 1e-4) quad(ax, az, bx, bz, ta, tc, la, lc, ha, lc, len * ta, len * tc, s); else quad(ax, az, bx, bz, tc, tb, lc, lb, lc, hb, len * tc, len * tb, s);
    } } }
  for (const cv of covers) faces(M, y0, cv.pg, cv.p.P, cv.p.q, cv.p.H, col, al, C);
}
globalThis.DocklandsRoofs = { decode, prism, planes, pieces, splitRing, extensions, gableEnds };
})();
