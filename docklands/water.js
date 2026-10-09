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
import { uniform, uniformArray } from 'three/tsl';
import { A, dec } from './build.js';

export const DEPTH = { cell: 10, dock: 10, pond: 2, creekMax: 4, creekSlope: 8, soundR: 30, scale: 25.5 };
export const WU = {
  reflect: uniform(0),           // 1 while the mirror (reflector) feeds the material
  ripple: uniform(1),            // strength of the ripple normals
  skyZenith: uniform(new THREE.Color(0.09, 0.22, 0.58)),   // linear: the sky colour by fresnel when there is no mirror (by day; U.night darkens it)
  skyHorizon: uniform(new THREE.Color(0.42, 0.60, 0.86)),
  // shared contract (2026-10-09) between the tide layer (writes), the surface material (reads) and the ships layer (writes):
  tideLevel: uniform(2.8),       // m OD: the Thames surface now (layers/tide.js; the tidal polygons follow it)
  tideRate: uniform(0),          // m an hour, + rising (flood: the river runs upstream, west), - falling (ebb: downstream, east)
  windSpeed: uniform(4),         // m/s at 10 m (weather data; layers/tide.js or a weather layer writes it)
  windDir: uniform(240),         // degrees FROM which the wind blows (meteorological), grid north = -z
};
// boat wakes: up to MAXW boats, written by the ships layer through setWakes(); read by the water material (an analytic
// Kelvin wake per boat, summed into the ripple normals). Each boat is two vec4: [x, z, heading rad (0 = grid north, -z;
// clockwise), speed m/s] and [length m, acceleration m/s2, 0, 0]; unused slots have speed 0.
export const MAXW = 16;
export const wakeA = uniformArray(Array.from({ length: MAXW }, () => new THREE.Vector4()), 'vec4');
export const wakeB = uniformArray(Array.from({ length: MAXW }, () => new THREE.Vector4()), 'vec4');
export function setWakes(list) {
  for (let k = 0; k < MAXW; k++) { const b = list[k], a = wakeA.array[k], c = wakeB.array[k];
    if (b) { a.set(b.x, b.z, b.heading, b.speed); c.set(b.len || 20, b.accel || 0, 0, 0); } else { a.set(0, 0, 0, 0); c.set(0, 0, 0, 0); } }
}

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
  cached = { tex, under: !!globalThis.DOCKLANDS_UNDER, x0: E.x0, z0: E.z0, w: nx * c, h: nz * c, nx, nz, cell: c, kind, level,   // level: each water cell's polygon level (m OD; NaN on land), for layers/water.js mirrorBody
    stats: { grid: `${nx} x ${nz} at ${c} m`, waterCells: cells, soundedCells: sounded, soundings: ns, polygons: polys, meanDepth: +(sumD / Math.max(1, cells)).toFixed(1), maxDepth: +maxD.toFixed(1), ms: Math.round(performance.now() - t0) } };
  return cached;
}

// the water body nearest to (x, z) for the mirror plane (layers/water.js): { tidal, level, d } from the depth map's cells
// (kind 1 tidal, 2 dock; ponds are left out: a fountain beside the eye must not set the plane for the river), searched in
// square rings of 10 m cells out to maxR m; null when there is none
export function mirrorBody(x, z, maxR = 3000) {
  const D = waterDepth(), c = D.cell, i0 = Math.floor((x - D.x0) / c), j0 = Math.floor((z - D.z0) / c), R = Math.ceil(maxR / c);
  const at = (i, j) => { if (i < 0 || j < 0 || i >= D.nx || j >= D.nz) return 0; const k = D.kind[j * D.nx + i]; return k === 1 || k === 2 ? j * D.nx + i + 1 : 0; };
  for (let r = 0; r <= R; r++) { let best = 0, bd = Infinity;
    for (let a = -r; a <= r; a++) for (const [i, j] of r ? [[i0 + a, j0 - r], [i0 + a, j0 + r], [i0 - r, j0 + a], [i0 + r, j0 + a]] : [[i0, j0]]) {
      const m = at(i, j); if (!m) continue; const d = (i - i0) ** 2 + (j - j0) ** 2; if (d < bd) { bd = d; best = m; } }
    if (best) return { tidal: D.kind[best - 1] === 1, level: D.level[best - 1], d: Math.sqrt(bd) * c };
  }
  return null;
}
// the level of the one mirror plane: the area-weighted mean level of the river and dock polygons (2 to 5 m OD)
export function mirrorLevel() {
  let s = 0, a = 0;
  for (const w of A.water) { if (!(w.level >= 2 && w.level <= 5)) continue; const f = dec(w.p), n = w.holes && w.holes.length ? w.holes[0] : f.length / 2, ar = area(f, n); s += ar * w.level; a += ar; }
  return a ? s / a : 3;
}

// ---------- the water surface (2026-10-09): what moves it. Made at load time on the depth map's grid (10 m cells, same uv):
//   flowTex (RGBA8): RG the flow direction of the tidal Thames x a speed factor (128 = 0, 1.5 at 255), B the fetch in 10 m
//     steps (the open water upwind of the cell, for the wind direction now; setFetch), A 255 on tidal water;
//   wallTex (RGBA8): RG the normal of the nearest water edge (into the water, 128 = 0), B the distance to it (0.25 m steps,
//     to 63.75 m), A its reflectivity: EA wall, flood gate or bridge abutment within 15 m 0.9, pier 0.8, embankment 0.35,
//     natural foreshore 0.08; dock edges (quays) 0.9, pond edges 0.4;
//   noiseTex (RGBA8, 256 x 256, tiles, mipmapped): the gradient of a band-limited wave field, a sum of 40 sinusoids with
//     integer wave vectors (7 to 13 cycles a tile): RG waves spread +-75 degrees about +x (wind waves), BA all directions.
// SU: the surface uniforms that are not in the shared contract. Skill: docklands-3d-page, "Three.js port" (Water surface).
export const SU = {
  current: uniform(0.08),   // m/s along the flow field, + downstream (ebb, east); layers/wind.js sets it each frame from WU.tideRate
  gust: uniform(0.5),       // 0 steady to 1 gusty: the contrast of the moving cat's-paw patches (gust / mean speed - 1)
};
const WALLR = { wall: 0.9, pier: 0.8, revetment: 0.35, natural: 0.08, dock: 0.9, pond: 0.4 };
const DEF_KIND = { Wall: 'wall', 'Flood Gate': 'wall', 'Bridge Abutment': 'wall', Embankment: 'revetment', 'Engineered High Ground': 'revetment' };
let surf = null;
export function surfaceData() {
  if (surf) return surf;
  const t0 = performance.now(), D = waterDepth(), { nx, nz, cell: c, x0, z0 } = D, N = nx * nz, K = D.kind;
  const flow = new Uint8Array(N * 4), wall = new Uint8Array(N * 4);
  for (let m = 0; m < N; m++) { flow[4 * m] = flow[4 * m + 1] = 128; flow[4 * m + 3] = K[m] === 1 ? 255 : 0; wall[4 * m] = wall[4 * m + 1] = 128; wall[4 * m + 2] = 255; }
  const cellOf = (x, z) => { const i = Math.floor((x - x0) / c), j = Math.floor((z - z0) / c); return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i; };
  // EA defences in 30 m buckets
  const DB = 30, dh = new Map(), dk = (a, b) => a * 100003 + b;
  for (const d of A.defences || []) { const kd = DEF_KIND[d.t]; if (!kd) continue; const q = dec(d.q, 3);
    for (let i = 3; i < q.length; i += 3) { const s = [q[i - 3], q[i - 2], q[i], q[i + 1], kd], k = dk(Math.floor((s[0] + s[2]) / 2 / DB), Math.floor((s[1] + s[3]) / 2 / DB)); if (!dh.has(k)) dh.set(k, []); dh.get(k).push(s); } }
  const segD = (px, pz, ax, az, bx, bz) => { const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1e-9, u = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)), cx = ax + u * vx, cz = az + u * vz; return [Math.hypot(px - cx, pz - cz), cx, cz]; };
  const defNear = (x, z) => { let best = null, bd = 15; const bx = Math.floor(x / DB), bz = Math.floor(z / DB);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const s of dh.get(dk(bx + a, bz + b)) || []) { const [d] = segD(x, z, s[0], s[1], s[2], s[3]); if (d < bd) { bd = d; best = s[4]; } }
    return best; };
  // the edges of every water polygon in pieces of 10 m at most, typed; edges with water on both sides (locks, joins) skipped
  const EB = 20, enx = Math.ceil(nx * c / EB) + 1, enz = Math.ceil(nz * c / EB) + 1, eh = new Array(enx * enz), ebk = (x, z) => { const i = Math.floor((x - x0) / EB), j = Math.floor((z - z0) / EB); return i < 0 || j < 0 || i >= enx || j >= enz ? -1 : j * enx + i; };
  let pieces = 0; const plen = {};
  for (const w of A.water) { const f = dec(w.p), st = [0, ...(w.holes || []), f.length / 2];
    for (let r = 0; r < st.length - 1; r++) { let s2 = 0; for (let i = st[r], j = st[r + 1] - 1; i < st[r + 1]; j = i++) s2 += (f[2 * j] - f[2 * i]) * (f[2 * j + 1] + f[2 * i + 1]);
      for (let i = st[r]; i < st[r + 1]; i++) { const j = i + 1 < st[r + 1] ? i + 1 : st[r], ax = f[2 * i], az = f[2 * i + 1], bx = f[2 * j], bz = f[2 * j + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
        const n = Math.ceil(L / 10);
        for (let k = 0; k < n; k++) { const px = ax + (bx - ax) * k / n, pz = az + (bz - az) * k / n, qx = ax + (bx - ax) * (k + 1) / n, qz = az + (bz - az) * (k + 1) / n, mx = (px + qx) / 2, mz = (pz + qz) / 2;
          let ox = (qz - pz) / (L / n), oz = -(qx - px) / (L / n);   // a normal; made to point to the land below
          const ia = cellOf(mx + ox * 6, mz + oz * 6), ib = cellOf(mx - ox * 6, mz - oz * 6); if ((ia >= 0 && K[ia]) && !(ib >= 0 && K[ib])) { ox = -ox; oz = -oz; } else if (!(ia >= 0 && K[ia]) === !(ib >= 0 && K[ib])) { if ((s2 > 0) === (r === 0)) { ox = -ox; oz = -oz; } }
          const out = cellOf(mx + ox * 14, mz + oz * 14), inn = cellOf(mx - ox * 6, mz - oz * 6);
          let kind;
          if (r > 0) kind = 'pier';
          else if (out >= 0 && K[out]) continue;   // water beyond: a lock gate or a join between polygons
          else if (w.tidal) kind = defNear(mx, mz) || 'natural';
          else kind = inn >= 0 && K[inn] === 3 ? 'pond' : 'dock';
          plen[kind] = (plen[kind] || 0) + L / n; pieces++;
          const e = [px, pz, qx, qz, WALLR[kind], -ox, -oz], kk = ebk(mx, mz); if (kk >= 0) (eh[kk] || (eh[kk] = [])).push(e); } } } }
  // each water cell: the nearest edge piece within 64 m
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const m = j * nx + i; if (!K[m]) continue;
    const x = x0 + (i + 0.5) * c, z = z0 + (j + 0.5) * c, bx = Math.floor((x - x0) / EB), bz = Math.floor((z - z0) / EB); let bd = 64, be = null, bcx = 0, bcz = 0;
    for (let b = Math.max(0, bz - 3); b <= Math.min(enz - 1, bz + 3); b++) for (let a = Math.max(0, bx - 3); a <= Math.min(enx - 1, bx + 3); a++) { const L = eh[b * enx + a]; if (L) for (const e of L) { const [d, cx, cz] = segD(x, z, e[0], e[1], e[2], e[3]); if (d < bd) { bd = d; be = e; bcx = cx; bcz = cz; } } }
    if (!be) continue;
    let ux = be[5], uz = be[6]; if (bd > 0.5) { ux = (x - bcx) / bd; uz = (z - bcz) / bd; }
    wall[4 * m] = Math.round(128 + 127 * ux); wall[4 * m + 1] = Math.round(128 + 127 * uz); wall[4 * m + 2] = Math.min(255, Math.round(bd * 4)); wall[4 * m + 3] = Math.round(be[4] * 255); }
  const mk = (data, w, h, mip) => { const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter; t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.generateMipmaps = !!mip; t.wrapS = t.wrapT = mip ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; if (mip) t.anisotropy = 4; t.needsUpdate = true; return t; };
  const wallMs = Math.round(performance.now() - t0), t1 = performance.now();
  surf = { flow, wall, flowTex: mk(flow, nx, nz), wallTex: mk(wall, nx, nz), noiseTex: mk(noiseField(), 256, 256, true), fetchDir: null,
    stats: { edgePieces: pieces, edgeMetres: Object.fromEntries(Object.entries(plen).map(([k, v]) => [k, Math.round(v)])), wallMs, noiseMs: Math.round(performance.now() - t1), flowMs: null, fetchMs: null, flowCells: 0 } };
  return surf;
}
// the fetch for a wind from dir (degrees, meteorological): open water upwind of each cell, in 10 m steps (at most 2,550 m)
export function setFetch(dir) {
  const S = surfaceData(); if (S.fetchDir != null && Math.abs(((dir - S.fetchDir + 540) % 360) - 180) < 4) return;
  const t0 = performance.now(), D = waterDepth(), { nx, nz, cell: c, x0, z0 } = D, K = D.kind, a = dir * Math.PI / 180, sx = Math.sin(a), sz = -Math.cos(a);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const m = j * nx + i; if (!K[m]) continue; let k = 1;
    for (; k < 255; k++) { const ii = Math.floor(i + 0.5 + sx * k), jj = Math.floor(j + 0.5 + sz * k); if (ii < 0 || jj < 0 || ii >= nx || jj >= nz || !K[jj * nx + ii]) break; }
    S.flow[4 * m + 2] = k; }
  S.flowTex.needsUpdate = true; S.fetchDir = dir; S.stats.fetchMs = Math.round(performance.now() - t0);
}
// the flow field of the tidal Thames from its centreline (data/river.json: thames [x, z, distance to the bank], west to
// east = downstream, every 20 m): each tidal cell gets the tangent at the nearest centreline point x a speed factor
// (narrower = faster, sqrt(130 m / half width), 0.7 to 1.4; slower towards the banks; nothing in inlets more than 10 to 80 m
// beyond the half width: creeks, docks entrances)
export function setRiver(R) {
  const S = surfaceData(), P = R && R.thames; if (!P || P.length < 3) return;
  const t0 = performance.now(), D = waterDepth(), { nx, nz, cell: c, x0, z0 } = D, K = D.kind, n = P.length, N = nx * nz;
  const hw = P.map((_, i) => { let s = 0, w = 0; for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 3); k++) { s += P[k][2]; w++; } return Math.max(20, s / w); });
  // the nearest centreline point of every cell: seeds at the points' cells, then two raster passes (8 neighbours)
  const near = new Int32Array(N).fill(-1), nd = new Float32Array(N).fill(1e18), cx = i => x0 + (i % nx + 0.5) * c, cz = i => z0 + (Math.floor(i / nx) + 0.5) * c;
  for (let i = 0; i < n; i++) { const ii = Math.floor((P[i][0] - x0) / c), jj = Math.floor((P[i][1] - z0) / c); if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const m = jj * nx + ii, d = (P[i][0] - cx(m)) ** 2 + (P[i][1] - cz(m)) ** 2; if (d < nd[m]) { nd[m] = d; near[m] = i; } }
  const relax = (m, o) => { const q = near[o]; if (q < 0) return; const d = (P[q][0] - cx(m)) ** 2 + (P[q][1] - cz(m)) ** 2; if (d < nd[m]) { nd[m] = d; near[m] = q; } };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const m = j * nx + i; if (i > 0) relax(m, m - 1); if (j > 0) { relax(m, m - nx); if (i > 0) relax(m, m - nx - 1); if (i < nx - 1) relax(m, m - nx + 1); } }
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const m = j * nx + i; if (i < nx - 1) relax(m, m + 1); if (j < nz - 1) { relax(m, m + nx); if (i < nx - 1) relax(m, m + nx + 1); if (i > 0) relax(m, m + nx - 1); } }
  let cells = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const m = j * nx + i; if (K[m] !== 1) continue;
    let bi = near[m], bd = nd[m];
    if (bi < 0) continue; bd = Math.sqrt(bd);
    const a0 = P[Math.max(0, bi - 1)], a1 = P[Math.min(n - 1, bi + 1)], tl = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) || 1, h = hw[bi];
    const fade = Math.max(0, Math.min(1, (h + 80 - bd) / 70)), s = Math.min(1.4, Math.max(0.7, Math.sqrt(130 / h))) * Math.max(0.3, 1 - 0.5 * Math.min(1, bd / h) ** 2) * fade;
    if (s > 0) cells++;
    S.flow[4 * m] = Math.round(128 + 127 * Math.max(-1, Math.min(1, (a1[0] - a0[0]) / tl * s / 1.5))); S.flow[4 * m + 1] = Math.round(128 + 127 * Math.max(-1, Math.min(1, (a1[1] - a0[1]) / tl * s / 1.5))); }
  S.flowTex.needsUpdate = true; S.stats.flowMs = Math.round(performance.now() - t0); S.stats.flowCells = cells;
}
// RG: directional (+-75 degrees about +x, amplitude cos^2), BA: isotropic; each the gradient normalised to an rms length of 1,
// stored / 3 (decode: (v * 2 - 1) * 3). Separable: cos(A(x) + B(y)) from two tables of 256 a wave.
function noiseField() {
  const S = 256, out = new Uint8Array(S * S * 4), gx = new Float32Array(S * S * 2), gy = new Float32Array(S * S * 2);
  let seed = 20261009; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let set = 0; set < 2; set++) { const used = new Set();
    for (let w = 0; w < 40; w++) {
      let kx, ky, amp;
      for (let tries = 0; ; tries++) { const th = set ? rnd() * Math.PI * 2 : (rnd() - 0.5) * 2 * 1.31, km = 7 + rnd() * 6; kx = Math.round(km * Math.cos(th)); ky = Math.round(km * Math.sin(th));
        amp = (set ? 1 : Math.cos(th) ** 2) * (0.6 + 0.4 * rnd()) / km; if (!used.has(kx + ',' + ky) || tries > 20) break; }
      used.add(kx + ',' + ky); const ph = rnd() * Math.PI * 2, ca = new Float32Array(S), sa = new Float32Array(S), cb = new Float32Array(S), sb = new Float32Array(S);
      for (let i = 0; i < S; i++) { const A1 = 2 * Math.PI * kx * i / S + ph, B1 = 2 * Math.PI * ky * i / S; ca[i] = Math.cos(A1); sa[i] = Math.sin(A1); cb[i] = Math.cos(B1); sb[i] = Math.sin(B1); }
      const ax = amp * 2 * Math.PI * kx / S * S / 10, ay = amp * 2 * Math.PI * ky / S * S / 10;   // per tile/10 (one wavelength about 1)
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const cs = ca[x] * cb[y] - sa[x] * sb[y], m = (y * S + x) * 2 + set; gx[m] += ax * cs; gy[m] += ay * cs; } } }
  for (let set = 0; set < 2; set++) { let s2 = 0; for (let m = set; m < S * S * 2; m += 2) s2 += gx[m] ** 2 + gy[m] ** 2; const f = 1 / Math.sqrt(s2 / (S * S));
    for (let p = 0; p < S * S; p++) { const m = p * 2 + set; out[p * 4 + set * 2] = Math.max(0, Math.min(255, Math.round(127.5 + 127.5 * gx[m] * f / 3))); out[p * 4 + set * 2 + 1] = Math.max(0, Math.min(255, Math.round(127.5 + 127.5 * gy[m] * f / 3))); } }
  return out;
}
