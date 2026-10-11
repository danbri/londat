// Geometry of the Three.js port of the Docklands 3D page (docklands/): area.js (DOCKLANDS_AREA) -> three.js
// BufferGeometry. The builders keep the vertex layout of the WebGL page (index.html MeshF: f = [x y z u packed-rgba],
// g = [centre x, centre z, base m OD, night kind]) so that roofs-layer.js (DocklandsRoofs.prism) and look-layer.js
// (DocklandsLook.paint) work on them unchanged; toGeometry() then splits them into three.js attributes.
// Skill: docklands-3d-page, "Three.js port".
import * as THREE from 'three/webgpu';

export const A = globalThis.DOCKLANDS_AREA;
export const earcut = globalThis.earcut && (globalThis.earcut.default || globalThis.earcut);
export const MFP = `${A.buildings.length}:${Array.from(A.buildings[0].p.slice(0, 6)).join('.')}:${Array.from(A.buildings.at(-1).p.slice(0, 6)).join('.')}`;

// running sums of whole decimetres (tools/lib.mjs enc)
export function dec(q, stride = 2) { const o = new Float32Array(q.length), acc = new Array(stride).fill(0); for (let i = 0; i < q.length; i++) { acc[i % stride] += q[i]; o[i] = acc[i % stride] / 10; } return o; }
// three.js lights the faces, so the builders' face shading is the identity (the WebGL page bakes it into the colour)
export const shade = col => [col[0], col[1], col[2]];
const hex = v => [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16) / 255);
// the page's CSS colours (index.html :root)
export const C = Object.fromEntries(Object.entries({ ell: '#ff8a3d', eliz: '#9b6cff', jub: '#c9ced6', dlr: '#2cc3b5', rail: '#d9544d', road: '#5c636b', water: '#3f8fc0', bld: '#b9bec4', bldlv: '#e0b25a' }).map(([k, v]) => [k, hex(v)]));
C.ground = [.38, .41, .40]; C.green = [.30, .42, .31];

// MeshF of index.html: 5 numbers a vertex in f, 4 in g; plus the model index of each vertex (picking)
export class MeshF {
  constructor() { this.f = []; this.idx = []; this.n = 0; this.g = []; this.bi = []; this.cur = [0, 0, 0]; this.kind = 0; this.hold = false; this.model = -1; }
  v(x, y, z, u, c, a = 1) { this.g.push(this.cur[0], this.cur[1], this.cur[2], this.kind); this.bi.push(this.model); this.f.push(x, y, z, u, ((c[0] * 255) | 0) | (((c[1] * 255) | 0) << 8) | (((c[2] * 255) | 0) << 16) | (((a * 255) | 0) << 24)); return this.n++; }
  tri(a, b, c) { this.idx.push(a, b, c); }
}
// a plain mesh (terrain, water, lines): position + colour
export class Mesh {
  constructor() { this.p = []; this.c = []; this.idx = []; this.n = 0; }
  v(x, y, z, c) { this.p.push(x, y, z); this.c.push(c[0], c[1], c[2]); return this.n++; }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(p0, p1, p2, p3, col) { const i = this.v(...p0, col), j = this.v(...p1, col), k = this.v(...p2, col), l = this.v(...p3, col); this.tri(i, j, k); this.tri(i, k, l); }
  geometry() {
    const G = new THREE.BufferGeometry();
    G.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    G.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    G.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    G.computeVertexNormals(); G.computeBoundingSphere(); return G;
  }
}
// MeshF -> BufferGeometry: position, col (rgba bytes; the alpha byte is the material code, never opacity), uw (u), gk (g)
export function toGeometry(M) {
  const n = M.n, pos = new Float32Array(n * 3), uw = new Float32Array(n), col = new Uint8Array(n * 4), f = M.f;
  for (let i = 0; i < n; i++) { pos[3 * i] = f[5 * i]; pos[3 * i + 1] = f[5 * i + 1]; pos[3 * i + 2] = f[5 * i + 2]; uw[i] = f[5 * i + 3]; const c = f[5 * i + 4] >>> 0; col[4 * i] = c & 255; col[4 * i + 1] = (c >>> 8) & 255; col[4 * i + 2] = (c >>> 16) & 255; col[4 * i + 3] = c >>> 24; }
  const G = new THREE.BufferGeometry();
  G.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  G.setAttribute('uw', new THREE.BufferAttribute(uw, 1));
  G.setAttribute('col', new THREE.BufferAttribute(col, 4, true));
  G.setAttribute('gk', new THREE.BufferAttribute(new Float32Array(M.g), 4));
  G.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(M.idx, 1) : new THREE.Uint16BufferAttribute(M.idx, 1));
  G.computeVertexNormals(); G.computeBoundingSphere(); G.computeBoundingBox();
  G.userData.bi = Int32Array.from(M.bi);   // model index of each vertex: the tap on a face names its building
  return G;
}

// ---------- the building rules of index.html (prismF, towerF, bmodF), unchanged but for the shading
const alOf = mat => mat == null ? 1 : mat < 0 ? (100 + (-1 - mat)) / 255 : (200 + mat * 8) / 255;
export function prismF(M, o, y0, y1, col, bottom, mat) {
  const al = alOf(mat);
  if (!M.hold) { const fx = dec(o.p); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < fx.length; i += 2) { x0 = Math.min(x0, fx[i]); x1 = Math.max(x1, fx[i]); z0 = Math.min(z0, fx[i + 1]); z1 = Math.max(z1, fx[i + 1]); } M.cur = [(x0 + x1) / 2, (z0 + z1) / 2, o.b ?? y0]; }
  const f = dec(o.p), holes = o.holes || [], nv = f.length / 2, tris = earcut(f, holes.length ? holes : undefined, 2), top = col, base = M.n, ru = -(1 + (y1 - y0));
  for (let i = 0; i < nv; i++) M.v(f[2 * i], y1, f[2 * i + 1], ru, top, al);
  for (let k = 0; k < tris.length; k += 3) M.tri(base + tris[k], base + tris[k + 2], base + tris[k + 1]);   // counter-clockwise from above (three.js front faces)
  if (bottom) { const b2 = M.n, bs = col.map(c => c * .6); for (let i = 0; i < nv; i++) M.v(f[2 * i], y0, f[2 * i + 1], -1, bs, al); for (let k = 0; k < tris.length; k += 3) M.tri(b2 + tris[k], b2 + tris[k + 1], b2 + tris[k + 2]); }
  const starts = [0, ...holes, nv];
  for (let r = 0; r < starts.length - 1; r++) { let along = 0;
    for (let k = starts[r]; k < starts[r + 1]; k++) {
      const k2 = k + 1 < starts[r + 1] ? k + 1 : starts[r], x0 = f[2 * k], z0 = f[2 * k + 1], x1 = f[2 * k2], z1 = f[2 * k2 + 1], len = Math.hypot(x1 - x0, z1 - z0);
      const i = M.v(x0, y0, z0, along, col, al), j = M.v(x1, y0, z1, along + len, col, al), kk = M.v(x1, y1, z1, along + len, col, al), l = M.v(x0, y1, z0, along, col, al); M.tri(i, j, kk); M.tri(i, kk, l); along += len;
    } }
}
const encRings = rings => { const p = [], holes = []; let px = 0, pz = 0, n = 0; rings.forEach((r, k) => { if (k) holes.push(n); for (const [x, z] of r) { const X = Math.round(x * 10), Z = Math.round(z * 10); p.push(X - px, Z - pz); px = X; pz = Z; n++; } }); return { p, holes }; };
export function towerF(M, t, col, mat) {
  const r0 = t.tiers[0].ring; M.cur = [r0.reduce((a, p) => a + p[0], 0) / r0.length, r0.reduce((a, p) => a + p[1], 0) / r0.length, t.base_m_od ?? t.tiers[0].y0]; M.hold = true;
  t.tiers.forEach((tr, k) => {
    const last = k === t.tiers.length - 1, pyr = last && t.top && t.top.kind === 'pyramid' && t.top.apex;
    if (!pyr) { prismF(M, encRings([tr.ring, ...(tr.holes || [])]), tr.y0, tr.y1, col, false, mat); return; }
    const [ax, ay, az] = t.top.apex, r = tr.ring, ru = -(1 + (ay - tr.y0)), al = alOf(mat);
    for (let i = 0; i < r.length; i++) { const [x0, z0] = r[i], [x1, z1] = r[(i + 1) % r.length]; M.tri(M.v(x0, tr.y0, z0, ru, col, al), M.v(x1, tr.y0, z1, ru, col, al), M.v(ax, ay, az, ru, col, al)); }
  });
  M.hold = false;
}
export const towerTop = t => Math.max(...t.tiers.filter((tr, k) => !(k === t.tiers.length - 1 && t.top && t.top.kind === 'pyramid' && t.top.apex)).map(tr => tr.y1));
const nightKind = (use, top) => use * 1000 + Math.max(0, Math.min(999, top));

// all buildings into tiles of TILE metres (frustum culling and faster picking); opts: { towers, roofs, look, skip (Set of
// model indexes drawn by a detailed model), heightOf(b, i) (a height in place of b.h, e.g. a skyline year; <= 0: not drawn),
// colourOf(b, i) (a colour [r, g, b] in place of the data colour, or null), facadeOf(i) (a photo facade slot, or null) }
export const TILE = 800;
export function buildBuildings(opts = {}) {
  const tiles = new Map(), tileOf = (x, z) => { const k = Math.floor(x / TILE) + ',' + Math.floor(z / TILE); if (!tiles.has(k)) tiles.set(k, new MeshF()); return tiles.get(k); };
  const towerOf = new Map(); for (const t of opts.towers || []) for (const mi of t.model_buildings) towerOf.set(mi, t);
  const RF = opts.roofs, LK = opts.look, R = globalThis.DocklandsRoofs, helpers = { dec, shade, earcut };
  const colourOf = (b, i) => (opts.colourOf && opts.colourOf(b, i)) || (LK ? [1, 1, 1] : (b.s === 1 || b.s === 4 ? C.bldlv : C.bld)), hOf = (b, i) => opts.heightOf ? opts.heightOf(b, i) : b.h;
  // a photo facade tile (opts.facadeOf(i) -> slot or null; index.html facSlot): colour 0.9, alpha 100 + slot, not painted by the look;
  // none while a layer colours or re-heights the buildings (skyline years)
  const facOf = i => opts.facadeOf && !opts.heightOf && !opts.colourOf ? opts.facadeOf(i) : null;
  A.buildings.forEach((b, i) => {
    const h = hOf(b, i); if (towerOf.has(i) || (opts.skip && opts.skip.has(i)) || !(h > 0)) return;
    const M = tileOf(b.p[0] / 10, b.p[1] / 10), rf = !opts.heightOf && RF && RF.get(i), n0 = M.n, sl = facOf(i), mat = sl != null ? -1 - sl : null, c = sl != null ? [.9, .9, .9] : colourOf(b, i);
    M.model = i; M.kind = nightKind(opts.useOf ? opts.useOf(i) : 0, b.b + (rf ? rf.ridge : h));
    if (rf && R) { const t0 = M.idx.length; R.prism(M, b, rf, c, alOf(mat), helpers); flip(M, t0); } else prismF(M, b, b.b + (b.mh || 0), b.b + h, c, !!b.mh, mat);
    if (LK && sl == null) LK.paint(M, n0, i, !!rf);
  });
  for (const t of opts.towers || []) { const mi = t.model_buildings[0], b = A.buildings[mi], r0 = t.tiers[0].ring, M = tileOf(r0[0][0], r0[0][1]), n0 = M.n, sl = facOf(mi);
    M.model = mi; M.kind = nightKind(t.name === 'One Canada Square' ? 5 : t.name === 'Newfoundland' ? 4 : opts.useOf ? opts.useOf(mi) : 0, towerTop(t)); towerF(M, t, sl != null ? [.9, .9, .9] : colourOf(b, mi), sl != null ? -1 - sl : null); if (LK && sl == null) LK.paint(M, n0, mi, false); }
  return [...tiles.values()].filter(M => M.n).map(toGeometry);
}
// roofs-layer.js winds its triangles clockwise from above (the WebGL page draws both sides): turn them for three.js
function flip(M, t0) { const I = M.idx; for (let k = t0; k < I.length; k += 3) { const a = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = a; } }

// ---------- terrain, water, greens, lines
export const groundAt = (x, z) => { const T = A.terrain, i = Math.max(0, Math.min(T.nx - 1, Math.round((x - T.x0) / T.cell))), j = Math.max(0, Math.min(T.nz - 1, Math.round((z - T.z0) / T.cell))); return T.dm[j * T.nx + i] / 10; };
// The LiDAR ground over the river and the docks is the water surface of the survey: it would hide the water polygons
// (index.html sinks it only while a measured tide is set). terrainModel() (computed once) decides, for each 20 m grid point,
// in which water polygon it is (even-odd scanlines, as before) and the height of the ground there:
//  - in a water polygon that is not tidal: 1.5 m below that water's level (or the LiDAR, when lower);
//  - in the tidal water (w.tidal: the Thames, the creeks, the Lea): the river bed, so that the bed shows as the tide falls:
//    0.4 m under the UKHO soundings (A.riverbed, inverse-distance mean within 40 m, as water.js), at most -0.5 m OD, where
//    there are some; else -5 m OD (below the lowest low water). layers/tide.js draws the foreshore (mud, shingle, walls)
//    over the squares that touch the tidal water. out.tidal marks those points.
// Dock edges follow the outlines (2026-10-11, owner: "why does greenland dock not have straight sides?"; fault F54): until
// then the ground sank only more than one cell inside a dock, so the land at quay height covered up to 20 m of water along
// each wall and the visible edge was the saw-tooth of the 20 m triangles. Now each terrain triangle that an outline edge
// crosses is cut along the outline (each crossing edge splits the convex pieces it passes through along its line; every
// piece is then wholly on one side and is classed by the parity of the outline edges between its centre and a grid corner
// of known side). Land pieces lie on the triangle's plane through the LAND heights LH; water pieces on the plane through
// the sunk heights of that water; along the outline a vertical quay wall joins the two (uv.y = 2: terrainMaterial colours
// it as dock wall stone, materials.js). LH is the LiDAR, except at the grid corners of the cut squares: a corner in the
// water (its LiDAR is the water surface) and a land corner of a non-tidal water whose LiDAR is under that water's level +
// 0.3 m (a water return) take the highest LiDAR of the land points round it (3 x 3, then 5 x 5) that are at least 0.3 m over
// the water, kept within level + 0.3 to level + 3 m; with none, level + 0.5 m. So the quay top does not dip towards the
// water. Only the squares that an outline crosses are cut (a spatial index: outline edges by square).
let TM = null;
export function terrainModel() {
  if (TM) return TM;
  const t0 = performance.now(), T = A.terrain, N = T.nx * T.nz, SX = T.nx - 1, SZ = T.nz - 1, dm = i => T.dm[i] / 10;
  const wid = new Int32Array(N).fill(-1), multi = new Map(), tm = new Uint8Array(N), sink = new Float32Array(N).fill(NaN);
  const rings = A.water.map(w => { const f = dec(w.p); return { w, f, st: [0, ...(w.holes || []), f.length / 2] }; });
  rings.forEach(({ w, f, st }, wi) => { const rows = new Map();
    for (let r = 0; r < st.length - 1; r++) for (let i = st[r]; i < st[r + 1]; i++) { const j = i + 1 < st[r + 1] ? i + 1 : st[r], x0 = f[2 * i], z0 = f[2 * i + 1], x1 = f[2 * j], z1 = f[2 * j + 1];
      for (let jj = Math.max(0, Math.ceil((Math.min(z0, z1) - T.z0) / T.cell)); jj <= Math.min(T.nz - 1, Math.floor((Math.max(z0, z1) - T.z0) / T.cell)); jj++) { const zc = T.z0 + jj * T.cell; if ((z0 > zc) === (z1 > zc)) continue; if (!rows.has(jj)) rows.set(jj, []); rows.get(jj).push(x0 + (zc - z0) / (z1 - z0) * (x1 - x0)); } }
    for (const [jj, xs] of rows) { xs.sort((a, b) => a - b); for (let k = 0; k + 1 < xs.length; k += 2) for (let ii = Math.max(0, Math.ceil((xs[k] - T.x0) / T.cell)); ii <= Math.min(T.nx - 1, Math.floor((xs[k + 1] - T.x0) / T.cell)); ii++) { const q = jj * T.nx + ii;
      if (wid[q] >= 0 && wid[q] !== wi) { if (!multi.has(q)) multi.set(q, [wid[q]]); multi.get(q).push(wi); }
      wid[q] = wi; if (w.tidal) tm[q] = 1; } } });
  const inW = (k, wi) => wid[k] === wi || (multi.has(k) && multi.get(k).includes(wi));
  // the bed under the tidal water: soundings in 40 m buckets
  const B = 40, bk = new Map(), key = (a, b) => a * 100003 + b;
  for (const r of A.riverbed || []) { const q = dec(r.q, 3); for (let i = 0; i < q.length; i += 3) { const kk = key(Math.floor(q[i] / B), Math.floor(q[i + 1] / B)); if (!bk.has(kk)) bk.set(kk, []); bk.get(kk).push(q[i], q[i + 1], q[i + 2]); } }
  const bedAt = (x, z) => { const bx = Math.floor(x / B), bz = Math.floor(z / B); let sw = 0, sb = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const L = bk.get(key(bx + a, bz + b)); if (!L) continue; for (let s = 0; s < L.length; s += 3) { const d2 = (L[s] - x) ** 2 + (L[s + 1] - z) ** 2; if (d2 > B * B) continue; const wt = 1 / (d2 + 25); sw += wt; sb += wt * L[s + 2]; } }
    return sw ? Math.min(sb / sw - 0.4, -0.5) : -5; };
  const gx = k => T.x0 + (k % T.nx) * T.cell, gz = k => T.z0 + Math.floor(k / T.nx) * T.cell;
  for (let k = 0; k < N; k++) { if (tm[k]) sink[k] = bedAt(gx(k), gz(k)); else if (wid[k] >= 0) sink[k] = Math.min(dm(k), A.water[wid[k]].level - 1.5); }
  // the outline edges, by the squares they cross (Liang-Barsky against each square of their box)
  const seg = [], bySq = new Map();
  rings.forEach(({ f, st }, wi) => { for (let r = 0; r < st.length - 1; r++) for (let i = st[r]; i < st[r + 1]; i++) { const j = i + 1 < st[r + 1] ? i + 1 : st[r], ax = f[2 * i], az = f[2 * i + 1], bx = f[2 * j], bz = f[2 * j + 1];
    if (Math.hypot(bx - ax, bz - az) < 1e-4) continue; const s = seg.length / 5; seg.push(ax, az, bx, bz, wi);
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - T.x0) / T.cell)), i1 = Math.min(SX - 1, Math.floor((Math.max(ax, bx) - T.x0) / T.cell)), j0 = Math.max(0, Math.floor((Math.min(az, bz) - T.z0) / T.cell)), j1 = Math.min(SZ - 1, Math.floor((Math.max(az, bz) - T.z0) / T.cell));
    for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) { const x0 = T.x0 + ii * T.cell, z0 = T.z0 + jj * T.cell;
      if (!segInRect(ax, az, bx, bz, x0, z0, x0 + T.cell, z0 + T.cell)) continue;
      const q = jj * SX + ii; if (!bySq.has(q)) bySq.set(q, []); bySq.get(q).push(s); } } });
  // land heights: the LiDAR, raised at the corners of the cut squares (see above)
  const LH = new Float32Array(N); for (let k = 0; k < N; k++) LH[k] = dm(k);
  const sub = new Map(), lsub = (k, lev) => { const i = k % T.nx, j = Math.floor(k / T.nx); let best = -1e9;
    for (const R of [1, 2]) { for (let b = -R; b <= R; b++) for (let a = -R; a <= R; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= T.nx || jj >= T.nz) continue; const q = jj * T.nx + ii; if (wid[q] < 0 && dm(q) >= lev + 0.3) best = Math.max(best, dm(q)); } if (best > -1e9) break; }
    return best > -1e9 ? Math.max(lev + 0.3, Math.min(lev + 3, best)) : lev + 0.5; };
  for (const [q, L] of bySq) { const i = q % SX, j = Math.floor(q / SX), a = j * T.nx + i, corners = [a, a + 1, a + T.nx, a + T.nx + 1];
    let levDock = -1e9; for (const s of L) { const w = A.water[seg[5 * s + 4]]; if (!w.tidal) levDock = Math.max(levDock, w.level); }
    for (const k of corners) { if (sub.has(k)) continue;
      if (wid[k] >= 0) sub.set(k, lsub(k, A.water[wid[k]].level));
      else if (levDock > -1e9 && dm(k) < levDock + 0.3) sub.set(k, lsub(k, levDock)); } }
  for (const [k, v] of sub) LH[k] = v;
  TM = { wid, multi, inW, tm, sink, LH, seg: Float64Array.from(seg), bySq, bedAt, ms: performance.now() - t0 };
  return TM;
}
// does the segment a-b pass through the rectangle [x0, x1] x [z0, z1] (Liang-Barsky)
function segInRect(ax, az, bx, bz, x0, z0, x1, z1) { let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
  for (let e = 0; e < 4; e++) { const p = e === 0 ? -dx : e === 1 ? dx : e === 2 ? -dz : dz, q = e === 0 ? ax - x0 : e === 1 ? x1 - ax : e === 2 ? az - z0 : z1 - az;
    if (p === 0) { if (q < 0) return false; continue; } const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
  return t1 - t0 > 1e-9; }
// the part [t0, t1] of the segment a-b inside the convex polygon P (flat [x, z, ...], counter-clockwise in x, z), or null
function segInPoly(P, ax, az, bx, bz) { let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az, n = P.length;
  for (let k = 0; k < n; k += 2) { const px = P[k], pz = P[k + 1], qx = P[(k + 2) % n], qz = P[(k + 3) % n], ex = qx - px, ez = qz - pz;
    const v0 = ex * (az - pz) - ez * (ax - px), dv = ex * dz - ez * dx;   // > 0 inside (left of the edge)
    if (Math.abs(dv) < 1e-12) { if (v0 < 0) return null; continue; }
    const t = -v0 / dv; if (dv > 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t; if (t0 > t1) return null; }
  return t1 - t0 > 1e-9 ? [t0, t1] : null; }
// split the convex polygon P (flat) by the line through a-b; pushes the parts with some area into out
function splitInto(out, P, ax, az, bx, bz) { const L = [], R = [], n = P.length, ex = bx - ax, ez = bz - az;
  for (let k = 0; k < n; k += 2) { const px = P[k], pz = P[k + 1], qx = P[(k + 2) % n], qz = P[(k + 3) % n], sp = ex * (pz - az) - ez * (px - ax), sq = ex * (qz - az) - ez * (qx - ax);
    if (sp >= 0) L.push(px, pz); if (sp <= 0) R.push(px, pz);
    if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) { const t = sp / (sp - sq), mx = px + t * (qx - px), mz = pz + t * (qz - pz); L.push(mx, mz); R.push(mx, mz); } }
  if (L.length >= 6 && area2(L) > 2e-4) out.push(L); if (R.length >= 6 && area2(R) > 2e-4) out.push(R); }
function area2(P) { let s = 0; const n = P.length; for (let k = 0; k < n; k += 2) s += P[k] * P[(k + 3) % n] - P[(k + 2) % n] * P[k + 1]; return s; }
// the water polygon (index) at (px, pz) in a cut square, or -1 (land): from the corner C (grid index c, at cx, cz) of known
// side, the parity of the outline edges of each polygon crossed on the way (a vertex on the ray counts on one side only)
function classifyAt(px, pz, SEG, L, W, c, cx, cz, inW) { const dx = cx - px, dz = cz - pz;
  for (let w = 0; w < W.length; w++) { const wi = W[w]; let odd = inW(c, wi);
    for (let k = 0; k < L.length; k++) { const o = 5 * L[k]; if (SEG[o + 4] !== wi) continue; const ax = SEG[o], az = SEG[o + 1], bx = SEG[o + 2], bz = SEG[o + 3];
      if ((dx * (az - pz) - dz * (ax - px) > 0) === (dx * (bz - pz) - dz * (bx - px) > 0)) continue;
      const ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-12) continue; const t = ((ax - px) * ez - (az - pz) * ex) / den; if (t >= 0 && t <= 1) odd = !odd; }
    if (odd) return wi; }
  return -1; }

export function terrainGeometry(box) {   // box: data/tex/textures.json box, for the ground image's uv
  const t0 = performance.now(), T = A.terrain, n = T.nx * T.nz, SX = T.nx - 1, M = terrainModel(), { wid, tm, sink, LH, seg: SEG, bySq, inW, bedAt } = M;
  // vertices: the grid points first (layers/tide.js reads them by grid index), then the pieces' and walls' own
  let P = new Float32Array(n * 6), UV = new Float32Array(n * 4), nv = 0;
  const add = (x, y, z, u, v) => { if (3 * nv + 3 > P.length) { const P2 = new Float32Array(P.length * 2), U2 = new Float32Array(UV.length * 2); P2.set(P); U2.set(UV); P = P2; UV = U2; }
    P[3 * nv] = x; P[3 * nv + 1] = y; P[3 * nv + 2] = z; UV[2 * nv] = u; UV[2 * nv + 1] = v; return nv++; };
  const bu = 1 / (box.x1 - box.x0), bv = 1 / (box.z1 - box.z0), addG = (x, y, z) => add(x, y, z, (x - box.x0) * bu, 1 - (z - box.z0) * bv);
  for (let j = 0; j < T.nz; j++) for (let i = 0; i < T.nx; i++) { const k = j * T.nx + i; addG(T.x0 + i * T.cell, wid[k] >= 0 ? sink[k] : LH[k], T.z0 + j * T.cell); }
  const cut = new Map(), bedC = new Map(), stats = { squares_cut: 0, pieces: 0, wall_faces: 0, wall_m: 0 };
  // shared vertices of the pieces: an open-addressing hash on (x, z) in mm, then y within 1 mm
  const HB = 1 << 18, HM = HB - 1, hv = new Int32Array(HB).fill(-1), hx = new Int32Array(HB), hz = new Int32Array(HB);
  const vtx = (x, z, y) => { const gi = (x - T.x0) / T.cell, gj = (z - T.z0) / T.cell;
    if (Number.isInteger(gi) && Number.isInteger(gj)) { const k = gj * T.nx + gi; if (Math.abs(P[3 * k + 1] - y) < 1e-4) return k; }
    const ix = Math.round((x - T.x0) * 1000), iz = Math.round((z - T.z0) * 1000); let h = (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663)) & HM;
    for (; hv[h] >= 0; h = (h + 1) & HM) if (hx[h] === ix && hz[h] === iz && Math.abs(P[3 * hv[h] + 1] - y) < 1e-3) return hv[h];
    const v = addG(x, y, z); hv[h] = v; hx[h] = ix; hz[h] = iz; return v; };
  // the water height at grid point k for the pieces of polygon wi: tidal, the bed; else the sunk height (1.5 m under the level)
  const wh = (k, wi) => { const w = A.water[wi]; if (w.tidal) { if (tm[k]) return sink[k]; let b = bedC.get(k); if (b === undefined) { b = bedAt(T.x0 + (k % T.nx) * T.cell, T.z0 + Math.floor(k / T.nx) * T.cell); bedC.set(k, b); } return b; }
    return inW(k, wi) && !tm[k] ? sink[k] : w.level - 1.5; };
  const tris = [], H = [0, 0, 0], HL = [0, 0, 0], HR = [0, 0, 0];
  // the triangle being cut: its corners' grid indexes, first corner and barycentric coefficients (set per triangle; one
  // function each, called per square, so that the engine optimises them early: the page builds this once, cold)
  let k0 = 0, k1 = 0, k2 = 0, X0 = 0, Z0 = 0, ua = 0, ub = 0, va = 0, vb = 0;
  const hAt = (cls, x, z, h) => { if (cls < 0) { h[0] = LH[k0]; h[1] = LH[k1]; h[2] = LH[k2]; } else { h[0] = wh(k0, cls); h[1] = wh(k1, cls); h[2] = wh(k2, cls); }
    const u = (x - X0) * ua + (z - Z0) * ub, v = (x - X0) * va + (z - Z0) * vb; return h[0] + u * (h[1] - h[0]) + v * (h[2] - h[0]); };
  const cutSquare = (q, L) => {
    const i = q % SX, j = Math.floor(q / SX), a = j * T.nx + i, x0 = T.x0 + i * T.cell, z0 = T.z0 + j * T.cell, x1 = x0 + T.cell, z1 = z0 + T.cell;
    // the corner farthest from the outline: the start of the parity rays
    let c = a, cx = x0, cz = z0, cd = -1;
    for (let e = 0; e < 4; e++) { const k = a + (e & 1) + (e >> 1) * T.nx, px = e & 1 ? x1 : x0, pz = e >> 1 ? z1 : z0; let d = 1e18;
      for (let m = 0; m < L.length; m++) { const o = 5 * L[m], dx = SEG[o + 2] - SEG[o], dz = SEG[o + 3] - SEG[o + 1], t = Math.max(0, Math.min(1, ((px - SEG[o]) * dx + (pz - SEG[o + 1]) * dz) / (dx * dx + dz * dz))), qx = SEG[o] + t * dx - px, qz = SEG[o + 1] + t * dz - pz; d = Math.min(d, qx * qx + qz * qz); }
      if (d > cd) { cd = d; c = k; cx = px; cz = pz; } }
    const W = []; for (let m = 0; m < L.length; m++) { const w = SEG[5 * L[m] + 4]; if (!W.includes(w)) W.push(w); }
    if (wid[c] >= 0 && !W.includes(wid[c])) W.push(wid[c]); if (M.multi.has(c)) for (const w of M.multi.get(c)) if (!W.includes(w)) W.push(w);
    tris.length = 0;
    for (let half = 0; half < 2; half++) {
      // the triangle (counter-clockwise in x, z) and its corners' grid indexes; heights: a plane through three corner values
      k0 = half ? a + 1 : a; k1 = half ? a + T.nx + 1 : a + 1; k2 = a + T.nx; X0 = half ? x1 : x0; Z0 = z0; const X1 = x1, Z1 = half ? z1 : z0, X2 = x0, Z2 = z1;
      const det = (X1 - X0) * (Z2 - Z0) - (X2 - X0) * (Z1 - Z0); ua = (Z2 - Z0) / det; ub = -(X2 - X0) / det; va = -(Z1 - Z0) / det; vb = (X1 - X0) / det;
      let pieces = [[X0, Z0, X1, Z1, X2, Z2]];
      for (let m = 0; m < L.length; m++) { const o = 5 * L[m], ax = SEG[o], az = SEG[o + 1], bx = SEG[o + 2], bz = SEG[o + 3], ex = bx - ax, ez = bz - az, sl = Math.hypot(ex, ez), next = [];
        for (const Pc of pieces) { let pos = 0, neg = 0; for (let k = 0; k < Pc.length; k += 2) { const d = ex * (Pc[k + 1] - az) - ez * (Pc[k] - ax); if (d > 1e-9) pos++; else if (d < -1e-9) neg++; }
          if (!pos || !neg) { next.push(Pc); continue; }   // the line misses the piece
          const tt = segInPoly(Pc, ax, az, bx, bz); if (!tt || (tt[1] - tt[0]) * sl < 1e-3) { next.push(Pc); continue; }
          splitInto(next, Pc, ax, az, bx, bz); }
        pieces = next; }
      for (const Pc of pieces) { let mx = 0, mz = 0; const nn = Pc.length / 2; for (let k = 0; k < Pc.length; k += 2) { mx += Pc[k]; mz += Pc[k + 1]; }
        const cls = classifyAt(mx / nn, mz / nn, SEG, L, W, c, cx, cz, inW), I0 = vtx(Pc[0], Pc[1], hAt(cls, Pc[0], Pc[1], H));
        let Ip = vtx(Pc[2], Pc[3], hAt(cls, Pc[2], Pc[3], H));
        for (let k = 4; k < Pc.length; k += 2) { const Ik = vtx(Pc[k], Pc[k + 1], hAt(cls, Pc[k], Pc[k + 1], H)); tris.push(I0, Ik, Ip); Ip = Ik; }   // counter-clockwise (x, z) turned, as the grid triangles
        stats.pieces++; }
      // the quay walls: each outline edge's part in this triangle, from the higher side down to the lower
      const TRI = [X0, Z0, X1, Z1, X2, Z2];
      for (let m = 0; m < L.length; m++) { const o = 5 * L[m], sx = SEG[o], sz = SEG[o + 1], ex = SEG[o + 2] - sx, ez = SEG[o + 3] - sz, tt = segInPoly(TRI, sx, sz, sx + ex, sz + ez); if (!tt) continue;
        const l = Math.hypot(ex, ez), len = (tt[1] - tt[0]) * l; if (len < 0.01) continue;
        const ax = sx + tt[0] * ex, az = sz + tt[0] * ez, bx = sx + tt[1] * ex, bz = sz + tt[1] * ez, mx = (ax + bx) / 2, mz = (az + bz) / 2, nx = -ez / l * 0.01, nz = ex / l * 0.01;
        if (!(mx + nx > x0 && mx + nx < x1 && mz + nz > z0 && mz + nz < z1 && mx - nx > x0 && mx - nx < x1 && mz - nz > z0 && mz - nz < z1)) continue;   // on the square's side (the model box)
        const cl = classifyAt(mx + nx, mz + nz, SEG, L, W, c, cx, cz, inW), cr = classifyAt(mx - nx, mz - nz, SEG, L, W, c, cx, cz, inW); if (cl === cr) continue;
        const la = hAt(cl, ax, az, HL), lb = hAt(cl, bx, bz, HL), ra = hAt(cr, ax, az, HR), rb = hAt(cr, bx, bz, HR); if (Math.abs(la - ra) < 0.02 && Math.abs(lb - rb) < 0.02) continue;
        const ta = Math.max(la, ra), tb = Math.max(lb, rb), ba = Math.min(la, ra), bb = Math.min(lb, rb), v = nv;
        add(ax, ta, az, 0, 2); add(bx, tb, bz, len, 2); add(bx, bb, bz, len, 2 + (tb - bb)); add(ax, ba, az, 0, 2 + (ta - ba));
        // front face towards the lower side (the terrain material draws one side): v, v+1, v+2 faces the right of a-b (-n)
        if (la + lb > ra + rb) tris.push(v, v + 1, v + 2, v, v + 2, v + 3); else tris.push(v, v + 2, v + 1, v, v + 3, v + 2);
        stats.wall_faces++; stats.wall_m += len; } }
    cut.set(q, Uint32Array.from(tris)); stats.squares_cut++; };
  const tg = performance.now(); for (const [q, L] of bySq) cutSquare(q, L); stats.cut_ms = Math.round(performance.now() - tg);
  const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.BufferAttribute(P.slice(0, 3 * nv), 3)); G.setAttribute('uv', new THREE.BufferAttribute(UV.slice(0, 2 * nv), 2));
  G.userData.tidal = tm;   // 1 where the grid point is in the tidal water (sunk to the bed); grid points are the first nx x nz vertices
  G.userData.cut = cut;    // square index (j (nx - 1) + i) -> its triangles (pieces and quay walls), for terrainIndexWithout
  const tn = performance.now(); const idx = terrainIndexWithout(G); G.setIndex(new THREE.BufferAttribute(idx, 1)); G.setAttribute('normal', new THREE.BufferAttribute(normalsOf(P, nv, idx), 3)); stats.index_normals_ms = Math.round(performance.now() - tn);
  { let y0 = 1e9, y1 = -1e9; for (let k = 1; k < 3 * nv; k += 3) { const y = P[k]; if (y < y0) y0 = y; if (y > y1) y1 = y; }   // the sphere round the box (computeBoundingSphere: 90 ms cold)
    const cx = T.x0 + SX * T.cell / 2, cz = T.z0 + (T.nz - 1) * T.cell / 2; G.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, (y0 + y1) / 2, cz), Math.hypot(SX * T.cell / 2, (T.nz - 1) * T.cell / 2, (y1 - y0) / 2)); }
  stats.wall_m = Math.round(stats.wall_m); stats.vertices = nv; stats.triangles = idx.length / 3; stats.model_ms = Math.round(M.ms); stats.ms = Math.round(performance.now() - t0);
  G.userData.stats = stats;
  return G;
}
// smooth vertex normals (area-weighted face normals; as BufferGeometry.computeVertexNormals, on the arrays: 4 x faster)
function normalsOf(P, nv, I) { const N = new Float32Array(3 * nv);
  for (let k = 0; k < I.length; k += 3) { const a = 3 * I[k], b = 3 * I[k + 1], c = 3 * I[k + 2], ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;   // (b - a) x (c - a), as three.js (cb x ab)
    N[a] += nx; N[a + 1] += ny; N[a + 2] += nz; N[b] += nx; N[b + 1] += ny; N[b + 2] += nz; N[c] += nx; N[c + 1] += ny; N[c + 2] += nz; }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N; }
// the terrain's index without the squares where drop(i, j) is true (layers/tide.js: the squares its foreshore replaces);
// a cut square gives its pieces and quay walls, the others their two grid triangles
export function terrainIndexWithout(G, drop) {
  const T = A.terrain, SX = T.nx - 1, cut = G.userData.cut, keep = new Uint8Array(SX * (T.nz - 1)); let len = 0;
  for (let j = 0; j < T.nz - 1; j++) for (let i = 0; i < SX; i++) { if (drop && drop(i, j)) continue; const q = j * SX + i, c = cut && cut.get(q); keep[q] = 1; len += c ? c.length : 6; }
  const out = new Uint32Array(len); let o = 0;
  for (let q = 0; q < keep.length; q++) { if (!keep[q]) continue; const c = cut && cut.get(q); if (c) { out.set(c, o); o += c.length; continue; }
    const a = Math.floor(q / SX) * T.nx + q % SX; out[o++] = a; out[o++] = a + T.nx; out[o++] = a + 1; out[o++] = a + 1; out[o++] = a + T.nx; out[o++] = a + T.nx + 1; }
  return out;
}
export function flat(M, o, y, col) { const f = dec(o.p), holes = o.holes || [], tris = earcut(f, holes.length ? holes : undefined, 2), base = M.n; for (let i = 0; i < f.length / 2; i++) M.v(f[2 * i], typeof y === 'function' ? y(f[2 * i], f[2 * i + 1]) : y, f[2 * i + 1], col); for (let k = 0; k < tris.length; k += 3) M.tri(base + tris[k], base + tris[k + 2], base + tris[k + 1]); }
// the water polygons, each flat at its level + 0.1 m; attributes 'tidal' (1 for a tidal polygon) and 'tbase' (the height it
// was built at): layers/tide.js moves the tidal ones to the tide's level on the GPU (docklands/tide.js tideOffset), no rebuild
export function waterGeometry() {
  const M = new Mesh(), tidal = [], tbase = [];
  for (const w of A.water) { const n0 = M.n; flat(M, w, w.level + .1, C.water); for (let i = n0; i < M.n; i++) { tidal.push(w.tidal ? 1 : 0); tbase.push(w.level + .1); } }
  const G = M.geometry(); G.setAttribute('tidal', new THREE.Float32BufferAttribute(tidal, 1)); G.setAttribute('tbase', new THREE.Float32BufferAttribute(tbase, 1)); return G;
}
// the height of the terrain mesh's LAND surface at x, z (terrainGeometry's triangles through the land heights LH of
// terrainModel: the LiDAR, raised at the corners of the squares a water outline cuts; without the water sink): exact on
// the land part of the mesh. Over water it is the LiDAR water surface (or the quay height next to an outline).
export const surfaceAt = (x, z) => { const T = A.terrain, LH = terrainModel().LH, u = Math.max(0, Math.min(T.nx - 1.000001, (x - T.x0) / T.cell)), w = Math.max(0, Math.min(T.nz - 1.000001, (z - T.z0) / T.cell)),
  i = Math.floor(u), j = Math.floor(w), fx = u - i, fz = w - j, a = j * T.nx + i, h00 = LH[a], h10 = LH[a + 1], h01 = LH[a + T.nx], h11 = LH[a + T.nx + 1];
  return fx + fz <= 1 ? h00 + fx * (h10 - h00) + fz * (h01 - h00) : h11 + (1 - fx) * (h01 - h11) + (1 - fz) * (h10 - h11); };
// the green areas, 0.4 m over the terrain: each polygon triangle is cut on the terrain mesh's triangles (two a 20 m cell,
// diagonal from (i+1, j) to (i, j+1)), so every piece lies on one terrain plane. Before 2026-10-10 each polygon was flat at
// the ground under its first vertex: Greenwich Park (on a hill) hung in the air through the treetops (owner's photo).
export function greensGeometry() {
  const T = A.terrain, M = new Mesh(), clip = (P, ax, az, bx, bz) => { const out = [], side = (p) => (bx - ax) * (p[1] - az) - (bz - az) * (p[0] - ax);
    for (let k = 0; k < P.length; k++) { const p = P[k], q = P[(k + 1) % P.length], sp = side(p), sq = side(q); if (sp >= 0) out.push(p); if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); } }
    return out; },
    ccw = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0 ? [a, b, c] : [a, c, b],
    // a triangle is kept whole when the terrain under it is within 0.1 m of the plane through its corners (at the grid
    // points inside it and every 2 m along its sides): the 0.4 m lift then still clears the ground
    planar = t => { const h = t.map(p => surfaceAt(p[0], p[1])), d = (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1]); if (Math.abs(d) < 1e-6) return true;
      const pl = (x, z) => { const a = ((x - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (z - t[0][1])) / d, b = ((t[1][0] - t[0][0]) * (z - t[0][1]) - (x - t[0][0]) * (t[1][1] - t[0][1])) / d; return [a, b, h[0] + a * (h[1] - h[0]) + b * (h[2] - h[0])]; };
      for (let e = 0; e < 3; e++) { const p = t[e], q = t[(e + 1) % 3], n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 2); for (let s = 1; s < n; s++) { const x = p[0] + (q[0] - p[0]) * s / n, z = p[1] + (q[1] - p[1]) * s / n; if (Math.abs(pl(x, z)[2] - surfaceAt(x, z)) > .1) return false; } }
      const xs = t.map(p => p[0]), zs = t.map(p => p[1]);
      for (let j = Math.ceil((Math.min(...zs) - T.z0) / T.cell); j <= Math.floor((Math.max(...zs) - T.z0) / T.cell); j++) for (let i = Math.ceil((Math.min(...xs) - T.x0) / T.cell); i <= Math.floor((Math.max(...xs) - T.x0) / T.cell); i++) {
        const x = T.x0 + i * T.cell, z = T.z0 + j * T.cell, [a, b, y] = pl(x, z); if (a < 0 || b < 0 || a + b > 1) continue; if (Math.abs(y - surfaceAt(x, z)) > .1) return false; }
      return true; };
  for (const g of A.greens) { const f = dec(g.p), holes = g.holes || [], tris = earcut(f, holes.length ? holes : undefined, 2);
    for (let k = 0; k < tris.length; k += 3) { const t = [tris[k], tris[k + 1], tris[k + 2]].map(n => [f[2 * n], f[2 * n + 1]]);
      if (planar(t)) { const base = M.n; for (const p of ccw(...t)) M.v(p[0], surfaceAt(p[0], p[1]) + .4, p[1], C.green); M.tri(base, base + 2, base + 1); continue; }
      const i0 = Math.max(0, Math.floor((Math.min(t[0][0], t[1][0], t[2][0]) - T.x0) / T.cell)), i1 = Math.min(T.nx - 2, Math.floor((Math.max(t[0][0], t[1][0], t[2][0]) - T.x0) / T.cell)),
        j0 = Math.max(0, Math.floor((Math.min(t[0][1], t[1][1], t[2][1]) - T.z0) / T.cell)), j1 = Math.min(T.nz - 2, Math.floor((Math.max(t[0][1], t[1][1], t[2][1]) - T.z0) / T.cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x0 = T.x0 + i * T.cell, z0 = T.z0 + j * T.cell, x1 = x0 + T.cell, z1 = z0 + T.cell;
        for (const G of [ccw([x0, z0], [x1, z0], [x0, z1]), ccw([x1, z0], [x1, z1], [x0, z1])]) {
          let P = ccw(...t); for (let e = 0; e < 3 && P.length >= 3; e++) P = clip(P, G[e][0], G[e][1], G[(e + 1) % 3][0], G[(e + 1) % 3][1]);
          if (P.length < 3) continue; const base = M.n; for (const p of P) M.v(p[0], surfaceAt(p[0], p[1]) + .4, p[1], C.green);
          for (let q = 1; q + 1 < P.length; q++) M.tri(base, base + q + 1, base + q); } } } }
  return M.geometry();
}
function beam(M, a, b, w, h, col) {
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, ox = -dz / l * w / 2, oz = dx / l * w / 2, H = h / 2;
  const P = (q, sx, sy) => [q[0] + ox * sx, q[1] + H * sy, q[2] + oz * sx];
  const a00 = P(a, -1, -1), a10 = P(a, 1, -1), a11 = P(a, 1, 1), a01 = P(a, -1, 1), b00 = P(b, -1, -1), b10 = P(b, 1, -1), b11 = P(b, 1, 1), b01 = P(b, -1, 1);
  M.quad(a01, b01, b11, a11, col); M.quad(a00, a10, b10, b00, col); M.quad(a00, b00, b01, a01, col); M.quad(a10, a11, b11, b10, col);
}
export const lineColour = l => {
  const n = (l.name || '') + ' ' + l.k;
  if (l.k === 'road' || l.k === 'foot') return C.road;
  if (/Jubilee/i.test(n)) return C.jub; if (/Elizabeth|Crossrail/i.test(n)) return C.eliz; if (l.k === 'light_rail' || /Docklands Light/i.test(n)) return C.dlr;
  if (/East London|Overground/i.test(n)) return C.ell; return C.rail;
};
export function linesGeometry() {   // open-air rail and roads as beams (index.html buildLines)
  const rail = new Mesh(), road = new Mesh();
  for (const l of A.lines) if (!l.tunnel) { const q = dec(l.q, 3), rd = l.k === 'road', w = rd ? [0, 10, 7, 4][l.c] : 3.5; if (rd && !w) continue;
    for (let i = 3; i < q.length; i += 3) beam(rd ? road : rail, [q[i - 3], q[i - 1] + (rd ? .3 : .8), q[i - 2]], [q[i], q[i + 2] + (rd ? .3 : .8), q[i + 1]], w, rd ? .4 : 1.4, lineColour(l)); }
  return { rail: rail.geometry(), road: road.geometry() };
}
// is the point (x, z) inside the outer ring of model building i
export function inside(i, x, z) { const b = A.buildings[i], f = dec(b.p), n = b.holes && b.holes.length ? b.holes[0] : f.length / 2; let c = false; for (let k = 0, j = n - 1; k < n; j = k++) { const ax = f[2 * k], az = f[2 * k + 1], bx = f[2 * j], bz = f[2 * j + 1]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; } return c; }
