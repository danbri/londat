// Terrain of London for the Docklands 3D page (Layers > Show > "Hills of London"): a coarse ground of Greater London
// (data/london-terrain.json, EU-DEM v1.1 at 250 m, tools/fetch-london-terrain.mjs) drawn OUTSIDE the model box, where
// the page has its 20 m LiDAR ground (A.terrain). A strip joins the box edge (every LiDAR edge point, its own height) to
// the first coarse grid line outside, so there is no gap and no step; within BLEND m of the box the coarse heights take
// the LiDAR-minus-EU-DEM offset of the nearest edge point (smoothed along the edge). Far ground fades into the
// background (vertex alpha) as haze. index.html calls DocklandsRing.init(ctx), DocklandsRing.draw(alpha, dim) in
// render() after the terrain, and DocklandsRing.far() for the far plane. Skill: docklands-3d-page, "Terrain of London".
(() => {
let C = null;
const BLEND = 2500, SMOOTH = 7, FAR = 60000, RELIEF = 6;   // m of blend outside the box; +/- edge points (20 m) averaged; far plane (m); slope factor of the shading (250 m cells shade too flat)
const tint = (c, y) => { const k = 1 + .45 * Math.min(1, Math.max(0, (y - 10) / 150)); return c.map(v => Math.min(1, v * k)); };   // the ground colour, lighter with height above 10 m (hills read as hills)
const S = { D: null, mesh: null, key: '', loading: null, error: null, n: 0 };
const $ = id => document.getElementById(id), on = () => { const e = $('showHills'); return !e || e.checked; };

function build() {
  const D = S.D, T = C.A.terrain, col = C.ground(), M = new C.Mesh();
  const bx0 = T.x0, bx1 = T.x0 + (T.nx - 1) * T.cell, bz0 = T.z0, bz1 = T.z0 + (T.nz - 1) * T.cell;
  const eu = (x, z) => {   // EU-DEM, bilinear, m
    const fi = Math.max(0, Math.min(D.nx - 1.001, (x - D.x0) / D.cell)), fj = Math.max(0, Math.min(D.nz - 1.001, (z - D.z0) / D.cell)), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, g = (a, b) => D.dm[b * D.nx + a] / 10;
    return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - v) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * v;
  };
  const lid = (i, j) => T.dm[j * T.nx + i] / 10;
  // the inner loop: every LiDAR edge point, clockwise from the north-west corner (north edge eastward, east edge
  // southward, south edge westward, west edge northward); t = side + fraction along it
  const inner = [];
  for (let i = 0; i < T.nx - 1; i++) inner.push([i, 0, i / (T.nx - 1)]);
  for (let j = 0; j < T.nz - 1; j++) inner.push([T.nx - 1, j, 1 + j / (T.nz - 1)]);
  for (let i = T.nx - 1; i > 0; i--) inner.push([i, T.nz - 1, 3 - i / (T.nx - 1)]);
  for (let j = T.nz - 1; j > 0; j--) inner.push([0, j, 4 - j / (T.nz - 1)]);
  const P = inner.map(([i, j, t]) => ({ x: T.x0 + i * T.cell, z: T.z0 + j * T.cell, y: lid(i, j), t, i, j }));
  const raw = P.map(p => p.y - eu(p.x, p.z)), n = P.length, off = raw.map((_, k) => { let s = 0; for (let d = -SMOOTH; d <= SMOOTH; d++) s += raw[(k + d + n) % n]; return s / (2 * SMOOTH + 1); });
  const offAt = (x, z) => {   // offset of the nearest edge point, faded out over BLEND m from the box
    const cx = Math.max(bx0, Math.min(bx1, x)), cz = Math.max(bz0, Math.min(bz1, z)), d = Math.hypot(x - cx, z - cz); if (d >= BLEND) return 0;
    const a = Math.round((cx - bx0) / T.cell), b = Math.round((cz - bz0) / T.cell);
    const k = b === 0 ? a : a === T.nx - 1 ? T.nx - 1 + b : b === T.nz - 1 ? 2 * (T.nx - 1) + T.nz - 1 - a : 2 * (T.nx - 1) + 2 * (T.nz - 1) - b;
    const w = 1 - d / BLEND; return off[k % n] * w * w * (3 - 2 * w);
  };
  const hz = (x, z) => { const cx = Math.max(bx0, Math.min(bx1, x)), cz = Math.max(bz0, Math.min(bz1, z)), d = Math.hypot(x - cx, z - cz), f = Math.min(1, Math.max(0, (d - 2500) / 35000)); return 1 - .8 * f * f * (3 - 2 * f); };   // haze: alpha by the distance from the box
  // the coarse grid, heights blended near the box
  const H = new Float32Array(D.nx * D.nz);
  for (let j = 0; j < D.nz; j++) for (let i = 0; i < D.nx; i++) { const x = D.x0 + i * D.cell, z = D.z0 + j * D.cell; H[j * D.nx + i] = D.dm[j * D.nx + i] / 10 + offAt(x, z); }
  const h = (i, j) => H[Math.max(0, Math.min(D.nz - 1, j)) * D.nx + Math.max(0, Math.min(D.nx - 1, i))];
  const ia0 = Math.floor((bx0 - D.x0) / D.cell), ia1 = Math.ceil((bx1 - D.x0) / D.cell), ja0 = Math.floor((bz0 - D.z0) / D.cell), ja1 = Math.ceil((bz1 - D.z0) / D.cell);
  const idx = new Int32Array(D.nx * D.nz).fill(-1), vtx = (i, j) => { const k = j * D.nx + i; if (idx[k] < 0) { const x = D.x0 + i * D.cell, z = D.z0 + j * D.cell;
    idx[k] = M.v(x, H[k], z, C.shade(tint(col, H[k]), RELIEF * (h(i - 1, j) - h(i + 1, j)), 2 * D.cell, RELIEF * (h(i, j - 1) - h(i, j + 1))), hz(x, z)); } return idx[k]; };
  for (let j = 0; j < D.nz - 1; j++) for (let i = 0; i < D.nx - 1; i++) {
    if (i >= ia0 && i < ia1 && j >= ja0 && j < ja1) continue;   // the hole: the model box and the strip round it
    const a = vtx(i, j), b = vtx(i + 1, j), c = vtx(i, j + 1), d = vtx(i + 1, j + 1); M.tri(a, b, c); M.tri(b, d, c);
  }
  // the outer loop: the coarse grid points round the hole, in the same order and parameter as the inner loop
  const outer = [], W = ia1 - ia0, Hh = ja1 - ja0;
  for (let i = ia0; i < ia1; i++) outer.push([i, ja0, (i - ia0) / W]);
  for (let j = ja0; j < ja1; j++) outer.push([ia1, j, 1 + (j - ja0) / Hh]);
  for (let i = ia1; i > ia0; i--) outer.push([i, ja1, 3 - (i - ia0) / W]);
  for (let j = ja1; j > ja0; j--) outer.push([ia0, j, 4 - (j - ja0) / Hh]);
  const lv = (i, j) => { const nx = lid(Math.max(0, i - 1), j) - lid(Math.min(T.nx - 1, i + 1), j), nz = lid(i, Math.max(0, j - 1)) - lid(i, Math.min(T.nz - 1, j + 1)); return C.shade(col, nx, 2 * T.cell, nz); };
  const A = P.map(p => M.v(p.x, p.y, p.z, lv(p.i, p.j), 1)), B = outer.map(([i, j]) => vtx(i, j)), tA = P.map(p => p.t), tB = outer.map(o => o[2]);
  A.push(A[0]); tA.push(4); B.push(B[0]); tB.push(4);   // close both loops
  let a = 0, b = 0;   // zip the two loops: advance the one whose next point comes first
  while (a < A.length - 1 || b < B.length - 1) {
    if (b === B.length - 1 || (a < A.length - 1 && tA[a + 1] <= tB[b + 1])) { M.tri(A[a], A[a + 1], B[b]); a++; } else { M.tri(A[a], B[b + 1], B[b]); b++; }
  }
  if (S.mesh) S.mesh.free(); S.n = M.n; S.mesh = M.upload(); S.key = col.join();
}
// alpha: as the page's terrain; dim: the page's night dimming. Two passes: depth first, then colour on the nearest
// surface only, so a near hill hides the hill behind it although the ground is drawn see-through.
function draw(alpha, dim) {
  if (!on() || !S.D) return; if (!S.mesh || S.key !== C.ground().join()) build();
  const gl = C.gl; C.setDim(dim);
  gl.colorMask(false, false, false, false); gl.depthMask(true); C.drawMesh(S.mesh, alpha);
  gl.colorMask(true, true, true, true); gl.depthMask(false); gl.depthFunc(gl.LEQUAL); C.drawMesh(S.mesh, alpha); gl.depthFunc(gl.LESS);
}
const far = () => on() && S.D ? FAR : 0;
function load() {
  if (S.D || S.loading) return S.loading;
  S.loading = C.loadJSON('data/london-terrain.json').then(d => { S.D = d; C.draw(); }).catch(e => { S.error = e.message; const el = $('hillsNote'); if (el) el.textContent = 'Terrain of London did not load: ' + e.message; });
  return S.loading;
}
function injectUi() {
  const m = $('showModels'); if (m) m.parentElement.insertAdjacentHTML('afterend', '<label><input type="checkbox" id="showHills" checked> Hills of London</label>');
  const hb = $('showHills'); if (hb) hb.onchange = () => { if (on()) load(); C.draw(); };
  const g = [...document.querySelectorAll('#credits h3')].find(h => /Ground, heights/.test(h.textContent));
  if (g && g.nextElementSibling) g.nextElementSibling.insertAdjacentHTML('beforeend', '<li>Terrain of London outside the model (Hills of London): produced using Copernicus data and information funded by the European Union, EU-DEM v1.1 (<a href="https://land.copernicus.eu/en/data-policy">Copernicus data policy</a>), through the <a href="https://www.opentopodata.org/datasets/eudem/">OpenTopoData</a> API; resampled to 250 m and joined to the LiDAR ground at the model edge. Not endorsed by the European Union.</li>');
}
function init(ctx) { C = ctx; injectUi(); if (on()) load(); }
globalThis.DocklandsRing = { init, draw, far, load, get S() { return S; } };
})();
