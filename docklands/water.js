// Water of the Three.js port of the Docklands 3D page (docklands/): the water depth map, made once at load time, and the
// uniforms of the water material (materials.js waterMaterial; the mirror is layers/water.js).
// Depth = water level (each polygon's w.level in area.js) minus the bed, on a 10 m grid over the model extent, as an R8
// texture (0.1 m a step, 0 to 25.5 m; linear filtering; land 0, so the depth falls to 0 at every shore over one cell).
// The bed:
//   - tidal polygons (w.tidal: the Thames, Deptford Creek, the Lea and their inlets): the UKHO soundings of area.js
//     (A.riverbed, m OD, 25 m spacing; OGL v3.0, not for navigation), inverse-distance mean of the soundings within 30 m;
//     where there is none (foreshore, creeks), depth = distance to the shore / 8, 0.5 to 4 m (a stated default);
//   - North Dock: the published bed level in data/under.js (DOCKLANDS_UNDER.structures, bed -5.365 m OD, Canal & River
//     Trust); the only dock with one;
//   - other enclosed docks and basins (not tidal, a name with Dock or Basin or Entrance or Cut, or 20,000 m2 and more):
//     10 m (a stated default; North Dock is 9.4 m below the LiDAR level);
//   - ponds, lakes, fountains and the rest: 2 m (a stated default).
// Skill: docklands-3d-page, "Three.js port" (Water).
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { A, dec } from './build.js';

export const DEPTH = { cell: 10, dock: 10, pond: 2, creekMax: 4, creekSlope: 8, soundR: 30, scale: 25.5 };
export const WU = {
  reflect: uniform(0),           // 1 while the mirror (reflector) feeds the material
  ripple: uniform(1),            // strength of the ripple normals
  skyZenith: uniform(new THREE.Color(0.09, 0.22, 0.58)),   // linear: the sky colour by fresnel when there is no mirror (by day; U.night darkens it)
  skyHorizon: uniform(new THREE.Color(0.42, 0.60, 0.86)),
};

const area = (f, n) => { let s = 0; for (let k = 0, j = n - 1; k < n; j = k++) s += (f[2 * j] - f[2 * k]) * (f[2 * j + 1] + f[2 * k + 1]) / 2; return Math.abs(s); };
const DOCK_NAME = /Dock|Basin|Entrance|Cut\b|Cutting|Lock|Passage|Quay/i, POND_NAME = /Pond|Lake|Fountain|Square/i;

let cached = null;
// { tex, x0, z0, w, h, nx, nz, stats }: the depth texture over A.meta.extent
export function waterDepth(refresh = false) {
  if (cached && !(refresh && globalThis.DOCKLANDS_UNDER && !cached.under)) return cached;
  const t0 = performance.now(), E = A.meta.extent, c = DEPTH.cell, nx = Math.ceil((E.x1 - E.x0) / c), nz = Math.ceil((E.z1 - E.z0) / c), N = nx * nz;
  const level = new Float32Array(N).fill(NaN), kind = new Uint8Array(N), bedFix = new Float32Array(N).fill(NaN);   // kind: 1 tidal, 2 dock, 3 pond
  // published dock beds: DOCKLANDS_UNDER.structures with bed (their p is the water polygon's p)
  const beds = new Map();
  for (const s of (globalThis.DOCKLANDS_UNDER && globalThis.DOCKLANDS_UNDER.structures) || []) if (s.bed != null && s.p) beds.set(s.p.slice(0, 6).join(','), s.bed);
  if (!globalThis.DOCKLANDS_UNDER) beds.set('north-dock', -5.365);   // under.js not loaded: the one published level, by name
  let polys = { tidal: 0, dock: 0, pond: 0, bed: 0 };
  // rasterise each polygon (even-odd over all rings) at the cell centres; later polygons win where they overlap
  for (const w of A.water) {
    const f = dec(w.p), st = [0, ...(w.holes || []), f.length / 2], rows = new Map(), n0 = st[1];
    const ar = area(f, n0), name = w.n || '';
    const pub = beds.get(w.p.slice(0, 6).join(',')) ?? (name === 'North Dock' ? beds.get('north-dock') : undefined);
    const k = w.tidal ? 1 : (pub != null || (!POND_NAME.test(name) && (DOCK_NAME.test(name) || ar >= 20000)) && w.level < 6) ? 2 : 3;
    polys[k === 1 ? 'tidal' : k === 2 ? 'dock' : 'pond']++; if (pub != null) polys.bed++;
    for (let r = 0; r < st.length - 1; r++) for (let i = st[r]; i < st[r + 1]; i++) {
      const j = i + 1 < st[r + 1] ? i + 1 : st[r], x0 = f[2 * i], z0 = f[2 * i + 1], x1 = f[2 * j], z1 = f[2 * j + 1];
      const ja = Math.max(0, Math.ceil((Math.min(z0, z1) - E.z0) / c - 0.5)), jb = Math.min(nz - 1, Math.floor((Math.max(z0, z1) - E.z0) / c - 0.5));
      for (let jj = ja; jj <= jb; jj++) { const zc = E.z0 + (jj + 0.5) * c; if ((z0 > zc) === (z1 > zc)) continue; if (!rows.has(jj)) rows.set(jj, []); rows.get(jj).push(x0 + (zc - z0) / (z1 - z0) * (x1 - x0)); }
    }
    for (const [jj, xs] of rows) { xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) for (let ii = Math.max(0, Math.ceil((xs[q] - E.x0) / c - 0.5)); ii <= Math.min(nx - 1, Math.floor((xs[q + 1] - E.x0) / c - 0.5)); ii++) {
        const m = jj * nx + ii; level[m] = w.level; kind[m] = k; bedFix[m] = pub != null ? pub : NaN; } }
  }
  // distance to the shore in cells (chamfer 3-4), for the creek default
  const D = new Float32Array(N); for (let m = 0; m < N; m++) D[m] = isNaN(level[m]) ? 0 : 1e9;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const m = j * nx + i; if (!D[m]) continue; let v = D[m];
    if (i > 0) v = Math.min(v, D[m - 1] + 3); if (j > 0) { v = Math.min(v, D[m - nx] + 3); if (i > 0) v = Math.min(v, D[m - nx - 1] + 4); if (i < nx - 1) v = Math.min(v, D[m - nx + 1] + 4); } D[m] = v; }
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const m = j * nx + i; if (!D[m]) continue; let v = D[m];
    if (i < nx - 1) v = Math.min(v, D[m + 1] + 3); if (j < nz - 1) { v = Math.min(v, D[m + nx] + 3); if (i < nx - 1) v = Math.min(v, D[m + nx + 1] + 4); if (i > 0) v = Math.min(v, D[m + nx - 1] + 4); } D[m] = v; }
  // soundings in 30 m buckets
  const B = DEPTH.soundR, bk = new Map(), key = (a, b) => a * 100003 + b; let ns = 0;
  for (const r of A.riverbed || []) { const q = dec(r.q, 3); for (let i = 0; i < q.length; i += 3) { const kk = key(Math.floor(q[i] / B), Math.floor(q[i + 1] / B)); if (!bk.has(kk)) bk.set(kk, []); bk.get(kk).push(q[i], q[i + 1], q[i + 2]); ns++; } }
  const data = new Uint8Array(N); let cells = 0, sounded = 0, maxD = 0, sumD = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const m = j * nx + i; if (isNaN(level[m])) continue; cells++;
    const x = E.x0 + (i + 0.5) * c, z = E.z0 + (j + 0.5) * c; let d;
    if (kind[m] === 1) {
      let sw = 0, sb = 0; const bx = Math.floor(x / B), bz = Math.floor(z / B);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const L = bk.get(key(bx + a, bz + b)); if (!L) continue;
        for (let s = 0; s < L.length; s += 3) { const d2 = (L[s] - x) ** 2 + (L[s + 1] - z) ** 2; if (d2 > B * B) continue; const wt = 1 / (d2 + 25); sw += wt; sb += wt * L[s + 2]; } }
      if (sw) { d = level[m] - sb / sw; sounded++; } else d = Math.min(DEPTH.creekMax, Math.max(0.5, D[m] / 3 * c / DEPTH.creekSlope));
    } else if (kind[m] === 2) d = isNaN(bedFix[m]) ? DEPTH.dock : level[m] - bedFix[m];
    else d = DEPTH.pond;
    d = Math.max(0.3, d); maxD = Math.max(maxD, d); sumD += d;
    data[m] = Math.min(255, Math.round(d / DEPTH.scale * 255));
  }
  if (cached) { cached.tex.image.data.set(data); cached.tex.needsUpdate = true; }   // a refresh (under.js has loaded): same texture
  const tex = cached ? cached.tex : new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = false; tex.needsUpdate = true;
  cached = { tex, under: !!globalThis.DOCKLANDS_UNDER, x0: E.x0, z0: E.z0, w: nx * c, h: nz * c, nx, nz,
    stats: { grid: `${nx} x ${nz} at ${c} m`, waterCells: cells, soundedCells: sounded, soundings: ns, polygons: polys, meanDepth: +(sumD / Math.max(1, cells)).toFixed(1), maxDepth: +maxD.toFixed(1), ms: Math.round(performance.now() - t0) } };
  return cached;
}

// the level of the one mirror plane: the area-weighted mean level of the river and dock polygons (2 to 5 m OD)
export function mirrorLevel() {
  let s = 0, a = 0;
  for (const w of A.water) { if (!(w.level >= 2 && w.level <= 5)) continue; const f = dec(w.p), n = w.holes && w.holes.length ? w.holes[0] : f.length / 2, ar = area(f, n); s += ar * w.level; a += ar; }
  return a ? s / a : 3;
}
