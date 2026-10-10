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
// (index.html sinks it only while a measured tide is set). Inside each water polygon that is not tidal, the ground more
// than one 20 m cell from its edge sinks 1.5 m below that water's level (the edge cells stay: the bank). Inside the tidal
// water (w.tidal: the Thames, the creeks, the Lea) every grid point sinks to the river bed, so that the bed shows as the
// tide falls: 0.4 m under the UKHO soundings (A.riverbed, inverse-distance mean within 40 m, as water.js), at most -0.5 m
// OD, where there are some; else -5 m OD (below the lowest low water). layers/tide.js draws the foreshore (mud, shingle,
// walls) over it, from the edge down to the bed (skill docklands-sky, "Tide prediction"). out.tidal marks those points.
function waterSink() {
  const T = A.terrain, N = T.nx * T.nz, m = new Float32Array(N).fill(NaN), tm = new Uint8Array(N), out = new Float32Array(N).fill(NaN);
  for (const w of A.water) { const f = dec(w.p), st = [0, ...(w.holes || []), f.length / 2], rows = new Map();
    for (let r = 0; r < st.length - 1; r++) for (let i = st[r]; i < st[r + 1]; i++) { const j = i + 1 < st[r + 1] ? i + 1 : st[r], x0 = f[2 * i], z0 = f[2 * i + 1], x1 = f[2 * j], z1 = f[2 * j + 1];
      for (let jj = Math.max(0, Math.ceil((Math.min(z0, z1) - T.z0) / T.cell)); jj <= Math.min(T.nz - 1, Math.floor((Math.max(z0, z1) - T.z0) / T.cell)); jj++) { const zc = T.z0 + jj * T.cell; if ((z0 > zc) === (z1 > zc)) continue; if (!rows.has(jj)) rows.set(jj, []); rows.get(jj).push(x0 + (zc - z0) / (z1 - z0) * (x1 - x0)); } }
    for (const [jj, xs] of rows) { xs.sort((a, b) => a - b); for (let k = 0; k + 1 < xs.length; k += 2) for (let ii = Math.max(0, Math.ceil((xs[k] - T.x0) / T.cell)); ii <= Math.min(T.nx - 1, Math.floor((xs[k + 1] - T.x0) / T.cell)); ii++) { const q = jj * T.nx + ii; if (w.tidal) tm[q] = 1; else m[q] = w.level - 1.5; } } }
  for (let j = 1; j < T.nz - 1; j++) for (let i = 1; i < T.nx - 1; i++) { const k = j * T.nx + i; if (!isNaN(m[k]) && !isNaN(m[k - 1]) && !isNaN(m[k + 1]) && !isNaN(m[k - T.nx]) && !isNaN(m[k + T.nx])) out[k] = m[k]; }
  // the bed under the tidal water: soundings in 40 m buckets
  const B = 40, bk = new Map(), key = (a, b) => a * 100003 + b;
  for (const r of A.riverbed || []) { const q = dec(r.q, 3); for (let i = 0; i < q.length; i += 3) { const kk = key(Math.floor(q[i] / B), Math.floor(q[i + 1] / B)); if (!bk.has(kk)) bk.set(kk, []); bk.get(kk).push(q[i], q[i + 1], q[i + 2]); } }
  for (let k = 0; k < N; k++) { if (!tm[k]) continue; const x = T.x0 + (k % T.nx) * T.cell, z = T.z0 + Math.floor(k / T.nx) * T.cell, bx = Math.floor(x / B), bz = Math.floor(z / B); let sw = 0, sb = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const L = bk.get(key(bx + a, bz + b)); if (!L) continue; for (let s = 0; s < L.length; s += 3) { const d2 = (L[s] - x) ** 2 + (L[s + 1] - z) ** 2; if (d2 > B * B) continue; const wt = 1 / (d2 + 25); sw += wt; sb += wt * L[s + 2]; } }
    out[k] = sw ? Math.min(sb / sw - 0.4, -0.5) : -5; }
  out.tidal = tm;
  return out;
}
export function terrainGeometry(box) {   // box: data/tex/textures.json box, for the ground image's uv
  const T = A.terrain, n = T.nx * T.nz, sink = waterSink(), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array((T.nx - 1) * (T.nz - 1) * 6);
  for (let j = 0; j < T.nz; j++) for (let i = 0; i < T.nx; i++) { const k = j * T.nx + i, x = T.x0 + i * T.cell, z = T.z0 + j * T.cell;
    pos[3 * k] = x; pos[3 * k + 1] = isNaN(sink[k]) ? T.dm[k] / 10 : sink.tidal[k] ? sink[k] : Math.min(T.dm[k] / 10, sink[k]); pos[3 * k + 2] = z; uv[2 * k] = (x - box.x0) / (box.x1 - box.x0); uv[2 * k + 1] = 1 - (z - box.z0) / (box.z1 - box.z0); }
  let o = 0; for (let j = 0; j < T.nz - 1; j++) for (let i = 0; i < T.nx - 1; i++) { const a = j * T.nx + i; idx[o++] = a; idx[o++] = a + T.nx; idx[o++] = a + 1; idx[o++] = a + 1; idx[o++] = a + T.nx; idx[o++] = a + T.nx + 1; }
  const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.BufferAttribute(pos, 3)); G.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); G.setIndex(new THREE.BufferAttribute(idx, 1)); G.computeVertexNormals(); G.computeBoundingSphere();
  G.userData.tidal = sink.tidal;   // 1 where the grid point is in the tidal water (sunk to the bed)
  return G;
}
export function flat(M, o, y, col) { const f = dec(o.p), holes = o.holes || [], tris = earcut(f, holes.length ? holes : undefined, 2), base = M.n; for (let i = 0; i < f.length / 2; i++) M.v(f[2 * i], typeof y === 'function' ? y(f[2 * i], f[2 * i + 1]) : y, f[2 * i + 1], col); for (let k = 0; k < tris.length; k += 3) M.tri(base + tris[k], base + tris[k + 2], base + tris[k + 1]); }
// the water polygons, each flat at its level + 0.1 m; attributes 'tidal' (1 for a tidal polygon) and 'tbase' (the height it
// was built at): layers/tide.js moves the tidal ones to the tide's level on the GPU (docklands/tide.js tideOffset), no rebuild
export function waterGeometry() {
  const M = new Mesh(), tidal = [], tbase = [];
  for (const w of A.water) { const n0 = M.n; flat(M, w, w.level + .1, C.water); for (let i = n0; i < M.n; i++) { tidal.push(w.tidal ? 1 : 0); tbase.push(w.level + .1); } }
  const G = M.geometry(); G.setAttribute('tidal', new THREE.Float32BufferAttribute(tidal, 1)); G.setAttribute('tbase', new THREE.Float32BufferAttribute(tbase, 1)); return G;
}
// the height of the terrain mesh (terrainGeometry's triangles, without the water sink) at x, z: exact on its surface
export const surfaceAt = (x, z) => { const T = A.terrain, u = Math.max(0, Math.min(T.nx - 1.000001, (x - T.x0) / T.cell)), w = Math.max(0, Math.min(T.nz - 1.000001, (z - T.z0) / T.cell)),
  i = Math.floor(u), j = Math.floor(w), fx = u - i, fz = w - j, a = j * T.nx + i, h00 = T.dm[a] / 10, h10 = T.dm[a + 1] / 10, h01 = T.dm[a + T.nx] / 10, h11 = T.dm[a + T.nx + 1] / 10;
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
