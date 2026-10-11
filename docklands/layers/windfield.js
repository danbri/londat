// Layer "windfield" of the Three.js port (docklands/): the wind in 3D, drawn as thin, soft streamlines that drift with it
// (owner, 2026-10-11: "making wind markers visible in a more cool way would be nice. Something subtle and evocative. Do we
// have wind vectors that differ at different altitudes? Or could we automatically guess different wind direction for
// street level somehow? Very approximately, so wind is more 3D?"). Menu > Time ("Wind in 3D (streamlines)"), ?windfield=0|1.
//
// The field (all in model metres; directions FROM, degrees, on the model grid as WU.windDir; vectors point where the air goes):
// 1. Wind by height. The 10 m wind is WU.windSpeed / WU.windDir (layers/wind.js: METAR, Open-Meteo, the cache or the
//    default; this layer never picks its own 10 m wind). Its change with height is the shape of the Open-Meteo profile for
//    the clock's hour (../meteo.js, the shared request: 10, 80, 120, 180 m and the pressure levels 1000 to 850 hPa at their
//    geopotential heights less the model's ground elevation; levels below 185 m are left out), interpolated as vectors in
//    the vertical and between the hours, as a speed ratio to 10 m and a turn from 10 m (so a METAR at 10 m keeps its value).
//    Without a profile (Open-Meteo refused or blocked, ?weather=0, days over 85 back or 15 ahead, ?windprofile=est) the
//    shape is a STATED ESTIMATE: speed x (z / 10 m)^0.3 (power law for a city, held above 500 m) and a veer of +15 degrees
//    clockwise from 10 m to 500 m (Ekman turning). Below 10 m: the same power law (z at least 2 m) in both cases.
// 2. Street level (a MODEL, not a measurement). A 25 m grid over the model extent, made once (it does not depend on the
//    wind): the building footprints rasterised at 5 m (plan area share lambda, area-weighted mean height H; also a 5 m roof
//    raster that keeps the particles out of the buildings), the street axis from a structure tensor (doubled angles) of
//    the OSM road and footway segments (weight 4 x 0.8 to 1.6 by class) and the building edges (0.6 x min(1, h / 12 m): the
//    four walls of a block nearly cancel, so the roads lead), blurred 1-2-1 (lambda and H: 3 x 3 box);
//    coherence = |sum| / weight; canyon width W = 25 m x (1 - lambda), 8 to 40 m; aspect = H / W. For each wind:
//    direction = the 10 m wind turned towards the street axis (the axis direction closest to the wind) by
//    k = coherence^0.7 x smoothstep(0.25, 1.5, aspect) x 0.9; speed = the 10 m speed x (0.9 to 0.3 by lambda 0.05 to 0.5) x
//    (1 - k + k (0.55 + 0.45 cos(wind, axis))). Water (river and docks), cells with lambda under 0.04 or H under 4 m: the
//    free profile. Height blend: the street flow below 0.6 H, the profile above 1.5 H (smoothstep between).
// 3. Drawing: N particles (2,400; ?windfieldn=) seeded round the camera (a disc ahead of the eye, radius 2.5 x the eye's
//    height + 150 m, 250 to 2,000 m; half at street level, a quarter in the roof band, a quarter 80 m and up; with the eye
//    under 40 m: 75 %, 25 %, none), advected on the
//    CPU at 12 steps a second of display time for a life of 2.5 to 6.5 s, with a small turbulent wobble (stronger in the
//    street), a time scale of 1.5 + eye height / 40 m (1.5 to 8: from high up the motion would be too slow to see), out of the
//    buildings (a blocked step turns +-50 or +-95 degrees, else the particle ends). Each keeps a trail of T = 18 steps in a
//    ring buffer of quads (slot-major, so one step uploads one contiguous range); the TSL vertex stage expands each quad to
//    a line 1 to 2.2 CSS px wide (0.06 m at the distance) with a 1 px soft edge, in a quad 2 px wider, the head grows and the tail shrinks with the step fraction.
//    One draw call, one material, no labels, no arrows; pale blue (slow) to white (fast), alpha 0.55 by day, faint and
//    slightly warm at night (U.night), discarded above U.cut; vz through the camera's view matrix; faded near the eye
//    (3 to 12 m), with the distance from the eye (0.7 to 1.5 region radii) and steeply above the eye (more than 15 m
//    over the eye, a rise of 0.1 to 0.3 a metre: from the ground, lines overhead read as rain); the main camera only (not the water mirror).
// 4. Tiers (OKR O3): full (2,400 particles) or lite (40 %: ?windfield=lite, 4 cores or fewer, 2 GB or less, or the layer's
//    own CPU time a frame over 2 ms, median of 120 frames). Indices are particle-major, so a tier is a draw range.
// 5. Text: api.describe() (also STATS.windfield.describe and a line in the menu) gives the wind at 2 m round the place in
//    view and at 150 m in words, stated as a model. Machine interface: __docklands3.layers.windfield.api (describe,
//    sample, cell, profile, setTier, warm, bench, stats). Check: docklands/test/windfield-check.mjs.
// Skill: docklands-3d-page, "Three.js port: wind in 3D (2026-10-11)".
import * as THREE from 'three/webgpu';
import { Fn, attribute, uniform, float, vec2, vec3, vec4, clamp, max, abs, length, select, mix, smoothstep, pow, varyingProperty, Discard, cameraViewMatrix, cameraProjectionMatrix } from 'three/tsl';
import { WU, waterDepth } from '../water.js';
import { A, dec, groundAt } from '../build.js';
import { GRID_CONV } from '../sky3.js';
import { forecastDay, LEVELS_HPA } from '../meteo.js';

const D2R = Math.PI / 180;
export const WF = { cell: 25, occ: 5, T: 18, hz: 12, n: 2400, alpha: 0.55, widthM: 0.06, powerA: 0.3, powerTop: 500, veer: 15, veerTop: 500, dz: 5, top: 1500, lite: 0.4, budget: 2 };
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rng = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ---------- the street grid (once)
function buildGrid() {
  const t0 = performance.now(), E = A.meta.extent, C = WF.cell, O = WF.occ;
  const nx = Math.ceil((E.x1 - E.x0) / C), nz = Math.ceil((E.z1 - E.z0) / C), N = nx * nz, ox = nx * (C / O), oz = nz * (C / O);
  const occ = new Uint16Array(ox * oz);   // roof top of the 5 m sample, dm above -100 m OD (0: no building)
  const area = new Float32Array(N), sumH = new Float32Array(N), jc = new Float32Array(N), js = new Float32Array(N), jw = new Float32Array(N);
  const addSeg = (x0, z0, x1, z1, w) => {
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz; if (L2 < 0.25) return;
    const L = Math.sqrt(L2), c2 = (dx * dx - dz * dz) / L2, s2 = 2 * dx * dz / L2, n = Math.ceil(L / C * 2), ww = w * L / n;
    for (let k = 0; k < n; k++) { const f = (k + 0.5) / n, i = Math.floor((x0 + dx * f - E.x0) / C), j = Math.floor((z0 + dz * f - E.z0) / C);
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue; const m = j * nx + i; jc[m] += ww * c2; js[m] += ww * s2; jw[m] += ww; }
  };
  let nb = 0, samples = 0;
  for (const b of A.buildings) {
    const h = b.h; if (!(h > 0)) continue; nb++;
    const f = dec(b.p), nv = f.length / 2, st = [0, ...(b.holes || []), nv], we = 0.6 * Math.min(1, h / 12), rows = new Map();
    for (let r = 0; r < st.length - 1; r++) for (let i = st[r]; i < st[r + 1]; i++) {
      const j = i + 1 < st[r + 1] ? i + 1 : st[r], x0 = f[2 * i], z0 = f[2 * i + 1], x1 = f[2 * j], z1 = f[2 * j + 1];
      addSeg(x0, z0, x1, z1, we);
      const ja = Math.max(0, Math.ceil((Math.min(z0, z1) - E.z0) / O - 0.5)), jb = Math.min(oz - 1, Math.floor((Math.max(z0, z1) - E.z0) / O - 0.5));
      for (let jj = ja; jj <= jb; jj++) { const zc = E.z0 + (jj + 0.5) * O; if ((z0 > zc) === (z1 > zc)) continue; let R = rows.get(jj); if (!R) rows.set(jj, R = []); R.push(x0 + (zc - z0) / (z1 - z0) * (x1 - x0)); }
    }
    const tv = Math.max(1, Math.min(65535, Math.round((b.b + h + 100) * 10)));
    for (const [jj, xs] of rows) { xs.sort((a, c) => a - c);
      for (let q = 0; q + 1 < xs.length; q += 2) for (let ii = Math.max(0, Math.ceil((xs[q] - E.x0) / O - 0.5)), ie = Math.min(ox - 1, Math.floor((xs[q + 1] - E.x0) / O - 0.5)); ii <= ie; ii++) {
        const k = jj * ox + ii; if (tv > occ[k]) occ[k] = tv;
        const m = Math.floor(jj * O / C) * nx + Math.floor(ii * O / C); area[m] += O * O; sumH[m] += O * O * h; samples++; } }
  }
  let nr = 0;
  for (const l of A.lines) { if ((l.k !== 'road' && l.k !== 'foot') || l.tunnel || !l.q) continue; const q = dec(l.q, 3), w = 4 * (l.k === 'foot' ? 0.8 : ([1, 1.6, 1.3, 1][l.c] || 1)); nr++;
    for (let i = 3; i < q.length; i += 3) addSeg(q[i - 3], q[i - 2], q[i], q[i + 1], w); }
  // 3 x 3 blur: a box for the plan area and height, a tent (1 2 1) for the street tensor (keeps it local)
  const blur = (a, tent) => { const o = new Float32Array(N), wt = tent ? [1, 2, 1] : [1, 1, 1], sum = tent ? 16 : 9;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let b = -1; b <= 1; b++) { const jj = j + b; if (jj < 0 || jj >= nz) continue; for (let c = -1; c <= 1; c++) { const ii = i + c; if (ii >= 0 && ii < nx) s += a[jj * nx + ii] * wt[b + 1] * wt[c + 1]; } } o[j * nx + i] = s / sum; }
    return o; };
  const areaB = blur(area), sumHB = blur(sumH), jcB = blur(jc, 1), jsB = blur(js, 1), jwB = blur(jw, 1);
  // water (river and docks) from the depth map (10 m cells): the share of the 25 m cell's 3 x 3 sample points on water
  const D = waterDepth(), ax = new Float32Array(N), az = new Float32Array(N), coh = new Float32Array(N), lam = new Float32Array(N), H = new Float32Array(N), asp = new Float32Array(N), open = new Uint8Array(N);
  let nWater = 0, nOpen = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const m = j * nx + i; let wet = 0;
    for (const a of [0.2, 0.5, 0.8]) for (const b of [0.2, 0.5, 0.8]) { const di = Math.floor((E.x0 + (i + a) * C - D.x0) / D.cell), dj = Math.floor((E.z0 + (j + b) * C - D.z0) / D.cell);
      if (di >= 0 && dj >= 0 && di < D.nx && dj < D.nz) { const k = D.kind[dj * D.nx + di]; if (k === 1 || k === 2) wet++; } }
    lam[m] = Math.min(1, areaB[m] / (C * C)); H[m] = areaB[m] > 1 ? sumHB[m] / areaB[m] : 0;
    const th = 0.5 * Math.atan2(jsB[m], jcB[m]); ax[m] = Math.cos(th); az[m] = Math.sin(th); coh[m] = jwB[m] > 0 ? Math.hypot(jcB[m], jsB[m]) / jwB[m] : 0;
    asp[m] = H[m] / Math.max(8, Math.min(40, C * (1 - lam[m])));
    const water = wet >= 5; if (water) nWater++;
    open[m] = water || lam[m] < 0.04 || H[m] < 4 ? 1 : 0; if (open[m]) nOpen++;
  }
  return { E, C, O, nx, nz, N, ox, oz, occ, ax, az, coh, lam, H, asp, open,
    stats: { grid: `${nx} x ${nz} at ${C} m`, occGrid: `${ox} x ${oz} at ${O} m`, buildings: nb, samples, roadLines: nr, waterCells: nWater, openCells: nOpen, ms: Math.round(performance.now() - t0) } };
}

// ---------- the profile: per hour a list of levels [h m above ground, speed m/s, dir FROM true] -> ratio and turn tables
function hoursOf(J) {
  const H = J && J.hourly; if (!H || !H.time || !H.wind_speed_10m) return null;
  const elev = typeof J.elevation === 'number' ? J.elevation : 5, have = k => Array.isArray(H[k]);
  const fixed = [[10, '10m'], [80, '80m'], [120, '120m'], [180, '180m']].filter(([, s]) => have('wind_speed_' + s) && have('wind_direction_' + s));
  const levels = LEVELS_HPA.filter(p => have(`wind_speed_${p}hPa`) && have(`wind_direction_${p}hPa`) && have(`geopotential_height_${p}hPa`));
  const rows = H.time.map((t, i) => {
    const L = [];
    for (const [h, s] of fixed) { const sp = H['wind_speed_' + s][i], d = H['wind_direction_' + s][i]; if (sp != null && d != null) L.push([h, sp, d]); }
    for (const p of levels) { const sp = H[`wind_speed_${p}hPa`][i], d = H[`wind_direction_${p}hPa`][i], g = H[`geopotential_height_${p}hPa`][i]; if (sp != null && d != null && g != null && g - elev > 185 && g - elev < 2500) L.push([g - elev, sp, d]); }
    L.sort((a, b) => a[0] - b[0]); return { t: t * 1000, L: L[0] && L[0][0] === 10 && L.length > 1 ? L : null };
  }).filter(r => r.L);
  return rows.length ? { rows, levels: [...new Set(rows.flatMap(r => r.L.map(l => Math.round(l[0]))))].length, fixed: fixed.map(f => f[0]), hpa: levels } : null;
}
// vector (east, north) of a level list at height z (linear between levels, held beyond)
function vecAt(L, z) {
  const v = l => [l[1] * Math.sin(l[2] * D2R), l[1] * Math.cos(l[2] * D2R)];   // FROM vector; ratios and turns do not care
  if (z <= L[0][0]) return v(L[0]); if (z >= L[L.length - 1][0]) return v(L[L.length - 1]);
  let k = 1; while (L[k][0] < z) k++; const a = v(L[k - 1]), b = v(L[k]), f = (z - L[k - 1][0]) / (L[k][0] - L[k - 1][0]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

export default {
  id: 'windfield', label: 'Wind in 3D (streamlines)', on: true, reveal: false,
  async init(ctx, on) {
    const { qs, camera, controls, renderer, U, stats, ui } = ctx;
    const G = buildGrid(), { E, C, nx, nz, O, ox, oz } = G;
    // ---------- profile tables: ratio R(z) and turn V(z) (degrees, + clockwise) from 10 m, every WF.dz m to WF.top
    const NZ = Math.round(WF.top / WF.dz) + 1, RT = new Float32Array(NZ), VT = new Float32Array(NZ);
    const PX = new Float32Array(NZ), PZ = new Float32Array(NZ);   // the profile now: vector (where the air goes), m/s, grid
    const prof = { src: 'estimate', day: null, hours: null, err: null, at: null };
    const meteoOn = !/^(0|off|no)$/i.test(qs.get('weather') || '') && qs.get('windprofile') !== 'est';
    function estimate() {
      for (let k = 0; k < NZ; k++) { const z = Math.max(2, k * WF.dz); RT[k] = Math.pow(Math.min(z, WF.powerTop) / 10, WF.powerA); VT[k] = z > 10 ? WF.veer * Math.min(1, (z - 10) / (WF.veerTop - 10)) : 0; }
      prof.src = 'estimate';
    }
    function fromHours(t) {
      const R = prof.hours.rows; let k = R.findIndex(r => r.t > t);
      if (k < 0) k = R.length - 1; const a = R[Math.max(0, k - 1)], b = R[k], f = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
      if (Math.abs(t - (f < 0.5 ? a.t : b.t)) > 3 * 3600e3) return false;   // the clock is not within the day's hours
      const v10 = (() => { const p = vecAt(a.L, 10), q = vecAt(b.L, 10); return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]; })(), s10 = Math.hypot(v10[0], v10[1]), a10 = Math.atan2(v10[0], v10[1]);
      for (let k2 = 0; k2 < NZ; k2++) { const z = k2 * WF.dz;
        if (z <= 10) { RT[k2] = Math.pow(Math.max(2, z) / 10, WF.powerA); VT[k2] = 0; continue; }
        const p = vecAt(a.L, z), q = vecAt(b.L, z), v = [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f], s = Math.hypot(v[0], v[1]);
        let r = s10 > 0.3 ? s / s10 : Math.pow(Math.min(z, WF.powerTop) / 10, WF.powerA), turn = s10 > 0.3 && s > 0.3 ? ((Math.atan2(v[0], v[1]) - a10) / D2R + 540) % 360 - 180 : WF.veer * Math.min(1, (z - 10) / (WF.veerTop - 10));
        if (s10 < 1) { const w = s10; r = r * w + Math.pow(Math.min(z, WF.powerTop) / 10, WF.powerA) * (1 - w); }   // a near calm at 10 m: the ratio means little
        RT[k2] = Math.max(0.3, Math.min(5, r)); VT[k2] = turn;
      }
      prof.src = 'Open-Meteo'; prof.at = f < 0.5 ? a.t : b.t; return true;
    }
    let profT = null, profBusy = false;
    async function evalProfile() {
      const t = ctx.clock; profT = t; if (profBusy) return; profBusy = true;
      try {
        const day = new Date(t).toISOString().slice(0, 10), age = (Date.now() - t) / 864e5;
        if (meteoOn && age <= 85 && age >= -15 && prof.day !== day) { prof.day = day; prof.hours = null;
          try { prof.hours = hoursOf(await forecastDay(day)); prof.err = prof.hours ? null : 'no wind by height in the answer'; } catch (e) { prof.err = e.message; console.warn('windfield: Open-Meteo', e.message); } }
        if (!(meteoOn && prof.hours && prof.day === day && fromHours(t))) estimate();
      } finally { profBusy = false; }
      key = ''; showNote(); ctx.draw();
    }
    estimate();
    // ---------- the wind now: profile vectors and the street flow of each cell (on a change of WU or the profile)
    const NC = G.N, SVX = new Float32Array(NC), SVZ = new Float32Array(NC), HH = new Float32Array(NC);
    let key = '', applyMs = 0;
    function applyWind() {
      const s10 = WU.windSpeed.value, d10 = WU.windDir.value, k = `${s10.toFixed(2)},${d10.toFixed(1)},${prof.src},${prof.at}`;
      if (k === key) return false; key = k; const t0 = performance.now();
      for (let i = 0; i < NZ; i++) { const fr = (d10 + VT[i]) * D2R, s = s10 * RT[i]; PX[i] = -Math.sin(fr) * s; PZ[i] = Math.cos(fr) * s; }   // FROM -> to
      const i10 = Math.round(10 / WF.dz), vx = PX[i10], vz = PZ[i10], dx = s10 > 1e-3 ? vx / s10 : 0, dz = s10 > 1e-3 ? vz / s10 : 0;
      for (let m = 0; m < NC; m++) {
        if (G.open[m]) { SVX[m] = vx; SVZ[m] = vz; HH[m] = 0; continue; }
        let a = G.ax[m], b = G.az[m], cA = a * dx + b * dz; if (cA < 0) { a = -a; b = -b; cA = -cA; }
        const kk = Math.pow(G.coh[m], 0.7) * ss(0.25, 1.5, G.asp[m]) * 0.9;
        let ux = dx * (1 - kk) + a * kk, uz = dz * (1 - kk) + b * kk; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
        const f = (0.9 + (0.3 - 0.9) * ss(0.05, 0.5, G.lam[m])) * (1 - kk + kk * (0.55 + 0.45 * cA));
        SVX[m] = ux * f * s10; SVZ[m] = uz * f * s10; HH[m] = G.H[m];
      }
      applyMs = +(performance.now() - t0).toFixed(1); return true;
    }
    // the surface the air flows over: the ground, or the water level of a river or dock cell (water.js waterDepth, 10 m;
    // the ground under water is the sunk bed, and particles seeded from it were under the water)
    const WD = waterDepth(), surfAt = (x, z) => { const g = groundAt(x, z), i = Math.floor((x - WD.x0) / WD.cell), j = Math.floor((z - WD.z0) / WD.cell);
      if (i < 0 || j < 0 || i >= WD.nx || j >= WD.nz) return g; const l = WD.level[j * WD.nx + i]; return l > g ? l : g; };
    // the field at (x, y m OD, z): out = [vx, vy, vz, street weight 0..1, surface (ground or water level)]
    const out5 = new Float32Array(5);
    function field(x, y, z, o = out5) {
      const g = surfAt(x, z), za = y - g;
      const fx = Math.max(0, Math.min(nx - 1.001, (x - E.x0) / C - 0.5)), fz = Math.max(0, Math.min(nz - 1.001, (z - E.z0) / C - 0.5));
      const i = Math.min(nx - 2, fx | 0), j = Math.min(nz - 2, fz | 0), u = fx - i, v = fz - j, m = j * nx + i;
      const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
      const sx = SVX[m] * w00 + SVX[m + 1] * w10 + SVX[m + nx] * w01 + SVX[m + nx + 1] * w11, sz = SVZ[m] * w00 + SVZ[m + 1] * w10 + SVZ[m + nx] * w01 + SVZ[m + nx + 1] * w11;
      const h = HH[m] * w00 + HH[m + 1] * w10 + HH[m + nx] * w01 + HH[m + nx + 1] * w11;
      const kz = Math.max(0, Math.min(NZ - 1.001, za / WF.dz)), k0 = kz | 0, fk = kz - k0, px = PX[k0] + (PX[k0 + 1] - PX[k0]) * fk, pz = PZ[k0] + (PZ[k0 + 1] - PZ[k0]) * fk;
      const w = h < 4 ? 1 : ss(0.6 * h, 1.5 * h, za);
      o[0] = sx + (px - sx) * w; o[1] = 0; o[2] = sz + (pz - sz) * w; o[3] = 1 - w; o[4] = g; return o;
    }
    const roofAt = (x, z) => { const i = Math.floor((x - E.x0) / O), j = Math.floor((z - E.z0) / O); if (i < 0 || j < 0 || i >= ox || j >= oz) return -1e9; const v = G.occ[j * ox + i]; return v ? v / 10 - 100 : -1e9; };
    const cellOf = (x, z) => { const i = Math.max(0, Math.min(nx - 1, Math.floor((x - E.x0) / C))), j = Math.max(0, Math.min(nz - 1, Math.floor((z - E.z0) / C))); return j * nx + i; };

    // ---------- particles and the ring buffer of trail quads
    const NP = Math.max(100, Math.min(20000, +qs.get('windfieldn') || WF.n)), T = WF.T, rand = rng(20261011);
    const PXs = new Float32Array(NP), PYs = new Float32Array(NP), PZs = new Float32Array(NP), LIFE = new Float32Array(NP), MAXL = new Float32Array(NP), PH = new Float32Array(NP);
    const NV = NP * T * 4, F = 8, data = new Float32Array(NV * F), se = new Float32Array(NV * 2), idx = new Uint32Array(NP * T * 6);
    // vertices slot-major (one step uploads one contiguous range), indices particle-major (the first NA particles are one
    // draw range: the lower tier draws fewer without a new buffer)
    for (let q = 0; q < NP * T; q++) se.set([-1, 1, 1, 1, -1, 0, 1, 0], q * 8);
    for (let p = 0, o6 = 0; p < NP; p++) for (let sl = 0; sl < T; sl++, o6 += 6) { const v = (sl * NP + p) * 4; idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], o6); }
    // tiers (OKR O3, low-end devices): full NP; lite LITE x NP, chosen by ?windfield=lite, by a small device (4 cores or
    // fewer, 2 GB or less), or once the layer's own CPU time a frame (median of 120 frames with animation) passes WF.budget ms
    const qTier = (qs.get('windfield') || '').toLowerCase(), smallDevice = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 2;
    let tier = qTier === 'lite' || (qTier !== 'full' && smallDevice) ? 'lite' : 'full', tierWhy = qTier === 'lite' ? '?windfield=lite' : tier === 'lite' ? 'small device' : qTier === 'full' ? '?windfield=full' : 'default';
    let NA = tier === 'lite' ? Math.max(100, Math.round(NP * WF.lite)) : NP;
    const ib = new THREE.InterleavedBuffer(data, F).setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('wa', new THREE.InterleavedBufferAttribute(ib, 4, 0));
    geo.setAttribute('wb', new THREE.InterleavedBufferAttribute(ib, 4, 4));
    geo.setAttribute('wse', new THREE.BufferAttribute(se, 2));
    geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));   // (bounds only; the vertex stage reads wa)
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    // ---------- material (TSL; one graph for WebGPU and WebGL 2)
    const uStep = uniform(1e4), uFrac = uniform(0.99), uVp = uniform(new THREE.Vector2(1, 1)), uDpr = uniform(1), uAlpha = uniform(WF.alpha), uWm = uniform(WF.widthM);
    const uEye = uniform(new THREE.Vector3()), uC = uniform(new THREE.Vector3()), uR = uniform(500);
    const vA = varyingProperty('float', 'wfA'), vS = varyingProperty('float', 'wfS'), vW = varyingProperty('vec2', 'wfW'), vY = varyingProperty('float', 'wfY'), vC = varyingProperty('vec3', 'wfC');
    const mat = new THREE.NodeMaterial();
    mat.vertexNode = Fn(() => {
      const a = attribute('wa', 'vec4'), b = attribute('wb', 'vec4'), sd = attribute('wse', 'vec2');
      const age = uStep.add(uFrac).sub(a.w);   // quad age in steps: frac (the newest) to T - 1 + frac (the oldest)
      const P = a.xyz.toVar();
      P.assign(select(age.lessThan(1).and(sd.y.lessThan(0.5)), mix(b.xyz, a.xyz, uFrac), P));   // the head grows
      P.assign(select(age.greaterThan(T - 1).and(sd.y.greaterThan(0.5)), mix(a.xyz, b.xyz, uFrac), P));   // the tail shrinks
      const uu = clamp(max(age.sub(1).add(sd.y), 0).div(T - 1), 0, 1);
      const along = smoothstep(0, 0.12, uu).mul(pow(uu.oneMinus(), 1.3));
      const V = cameraViewMatrix, Pm = cameraProjectionMatrix;
      const cA = Pm.mul(V.mul(vec4(P, 1))), cB = Pm.mul(V.mul(vec4(b.xyz, 1)));
      const sA = cA.xy.div(cA.w).mul(uVp), sB = cB.xy.div(max(cB.w, 0.05)).mul(uVp), dd = sB.sub(sA), dir = dd.div(max(length(dd), 1e-4)).mul(select(sd.y.greaterThan(0.5), 1, -1));
      const nrm = vec2(dir.y.negate(), dir.x);
      const focal = Pm.element(1).y.mul(uVp.y).mul(0.5), w0 = uWm.mul(focal).div(max(cA.w, 0.1));
      const wpx = clamp(w0, uDpr, uDpr.mul(2.2)), thin = clamp(w0.div(uDpr), 0.55, 1);
      const wg = wpx.add(uDpr.mul(2));   // the quad is 2 CSS px wider than the line: a 1 px line drawn as a 1 px quad breaks into dashes (pixel centres)
      const off = nrm.mul(wg.mul(sd.x)).div(uVp).mul(cA.w);
      // fades: near the eye (a line 3 m away would be a white scratch over the view), at the edge of the region, with the
      // distance from the eye (far lines pile up into parallel scan lines), and steeply above the eye (from the ground,
      // lines high overhead read as rain on the sky)
      const dE = length(P.sub(uEye)), near = smoothstep(3, 12, dE), far = smoothstep(0.8, 1.15, length(P.xz.sub(uC.xz)).div(uR)).oneMinus()
        .mul(smoothstep(0.7, 1.5, dE.div(uR)).oneMinus()).mul(smoothstep(0.1, 0.3, max(P.y.sub(uEye.y).sub(15), 0).div(max(dE, 1))).oneMinus());
      const spd = b.w.floor().div(10), env = b.w.fract();
      const day = mix(vec3(0.50, 0.64, 0.90), vec3(0.92, 0.95, 1.0), smoothstep(1.5, 9, spd));
      const col = mix(day, mix(day.mul(0.35), vec3(0.60, 0.50, 0.36), 0.35), U.night);   // night: faint, a little warm (city light)
      vA.assign(uAlpha.mul(env).mul(along).mul(thin).mul(near).mul(far).mul(mix(1, 0.5, U.night)));
      vS.assign(sd.x); vW.assign(vec2(wg.mul(0.5), wpx.mul(0.5))); vY.assign(P.y); vC.assign(col);
      return select(cA.w.lessThan(0.3), vec4(2, 2, 2, 1), vec4(cA.xy.add(off), cA.z, cA.w));
    })();
    mat.fragmentNode = Fn(() => { Discard(vY.greaterThan(U.cut)); const d = abs(vS).mul(vW.x), cov = clamp(vW.y.add(0.5).sub(d), 0, 1);   // px from the centre line; a line of half width vW.y px with a 1 px soft edge
      return vec4(vC, vA.mul(smoothstep(0, 1, cov))); })();
    Object.assign(mat, { transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.NormalBlending });
    const mesh = new THREE.Mesh(geo, mat);
    Object.assign(mesh, { name: 'windfield', frustumCulled: false, renderOrder: 6, castShadow: false, receiveShadow: false }); mesh.raycast = () => {};
    mesh.onBeforeRender = (r, s, cam) => { geo.setDrawRange(0, cam === camera ? NA * T * 6 : 0); };   // the main camera only (not the water mirror)

    // ---------- the region round the camera, spawning and stepping
    const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), reg = { cx: 0, cz: 0, R: 500, hEye: 50, k: 2, x0: NaN, z0: NaN };
    function region() {
      camera.updateMatrixWorld(); eye.setFromMatrixPosition(camera.matrixWorld);   // model metres (matrixWorld holds 1 / vz)
      fwd.set(0, 0, -1).transformDirection(camera.matrixWorld); const fl = Math.hypot(fwd.x, fwd.z) || 1;
      const hEye = Math.max(1, eye.y - surfAt(eye.x, eye.z)), R = Math.max(250, Math.min(2000, hEye * 2.5 + 150)), ahead = 0.55 * R;
      reg.hEye = hEye; reg.R = R; reg.cx = eye.x + fwd.x / fl * ahead; reg.cz = eye.z + fwd.z / fl * ahead; reg.k = Math.max(1.5, Math.min(8, 1.5 + hEye / 40));
      uEye.value.copy(eye); uC.value.set(reg.cx, 0, reg.cz); uR.value = R;
    }
    function spawn(p) {
      for (let tries = 0; tries < 6; tries++) {
        const r = reg.R * Math.pow(rand(), 0.6), a = rand() * Math.PI * 2, x = reg.cx + r * Math.cos(a), z = reg.cz + r * Math.sin(a), g = surfAt(x, z), m = cellOf(x, z), h = G.open[m] ? 0 : G.H[m], band = rand();
        let za; const low = reg.hEye < 40, b1 = low ? 0.75 : 0.5, b2 = low ? 1 : 0.75;   // a low eye: none of the high particles (seen from below they streak the sky like rain)
        if (band < b1) za = 1.5 + rand() * Math.max(12, Math.min(0.9 * h, 35));
        else if (band < b2) za = Math.max(10, h) + 3 + rand() * (Math.max(10, h) + 50);
        else za = 80 + Math.pow(rand(), 1.6) * Math.min(1200, Math.max(250, reg.hEye * 1.5));
        const y = g + za; if (y < roofAt(x, z) + 0.5) continue;
        PXs[p] = x; PYs[p] = y; PZs[p] = z; MAXL[p] = Math.round((2.5 + rand() * 4) * WF.hz); LIFE[p] = 0; PH[p] = rand() * 100; return true;
      }
      LIFE[p] = MAXL[p] = 1; return false;
    }
    let step = 1e4, simT = 0, ranges = 0;
    const o = new Float32Array(5), turns = [50, -50, 95, -95].map(t => [Math.cos(t * D2R), Math.sin(t * D2R)]);
    // turbulence: four slow sines a particle (angle, angle, speed, vertical) with its own phases, by angle addition (no
    // Math.sin in the loop): sin(w t + k ph) = sin(w t) cos(k ph) + cos(w t) sin(k ph)
    const OM = [0.9, 2.3, 1.7, 1.1], PC = new Float32Array(NP * 8);
    const phases = p => { for (let q = 0; q < 4; q++) { PC[p * 8 + 2 * q] = Math.cos((q + 1) * PH[p]); PC[p * 8 + 2 * q + 1] = Math.sin((q + 1) * PH[p]); } };
    function stepAll() {
      step++; const slot = step % T, dt = 1 / WF.hz, k = reg.k, dk = dt * k, R2 = (reg.R * 1.2) ** 2, cx = reg.cx, cz = reg.cz; simT += dt;
      const sw0 = Math.sin(OM[0] * simT), cw0 = Math.cos(OM[0] * simT), sw1 = Math.sin(OM[1] * simT), cw1 = Math.cos(OM[1] * simT), sw2 = Math.sin(OM[2] * simT), cw2 = Math.cos(OM[2] * simT), sw3 = Math.sin(OM[3] * simT), cw3 = Math.cos(OM[3] * simT);
      for (let p = 0; p < NA; p++) {
        let x0 = PXs[p], y0 = PYs[p], z0 = PZs[p], reborn = false;
        if (LIFE[p] >= MAXL[p] || (x0 - cx) * (x0 - cx) + (z0 - cz) * (z0 - cz) > R2) { spawn(p); phases(p); x0 = PXs[p]; y0 = PYs[p]; z0 = PZs[p]; reborn = true; }
        field(x0, y0, z0, o);
        const q = p * 8, street = o[3], amp = 0.08 + 0.3 * street;
        const ang = amp * (sw0 * PC[q] + cw0 * PC[q + 1]) + 0.5 * amp * (sw1 * PC[q + 2] + cw1 * PC[q + 3]), sf = 1 + (0.06 + 0.14 * street) * (sw2 * PC[q + 4] + cw2 * PC[q + 5]);
        const a2 = ang * ang, ca = 1 - a2 * 0.5 + a2 * a2 / 24, sa = ang - a2 * ang / 6;   // |ang| < 0.6 rad
        const vx = (o[0] * ca - o[2] * sa) * sf, vz = (o[0] * sa + o[2] * ca) * sf, sp = Math.sqrt(vx * vx + vz * vz), vy = sp * (0.03 + 0.05 * street) * (sw3 * PC[q + 6] + cw3 * PC[q + 7]);
        let x1 = x0 + vx * dk, y1 = y0 + vy * dk, z1 = z0 + vz * dk;
        if (y1 < roofAt(x1, z1) + 0.3) {   // a wall ahead: turn along it, else end
          let ok = false; for (const t of turns) { const c = t[0], s = t[1], tx = x0 + (vx * c - vz * s) * dk, tz = z0 + (vx * s + vz * c) * dk; if (y1 >= roofAt(tx, tz) + 0.3) { x1 = tx; z1 = tz; ok = true; break; } }
          if (!ok) { x1 = x0; z1 = z0; LIFE[p] = MAXL[p]; }
        }
        if (y1 < o[4] + 0.8) y1 = o[4] + 0.8;
        PXs[p] = x1; PYs[p] = y1; PZs[p] = z1; LIFE[p]++;
        const lf = LIFE[p] / MAXL[p], env = reborn ? 0 : Math.min(0.999, ss(0, 0.2, lf) * ss(1, 0.75, lf)), w = Math.min(600, Math.round(sp * 10)) + env;
        if (reborn) { x0 = x1; y0 = y1; z0 = z1; }
        const b = ((slot * NP + p) * 4) * F;   // quad: two vertices at the older point (other = the newer), two at the newer
        data[b] = data[b + 8] = x0; data[b + 1] = data[b + 9] = y0; data[b + 2] = data[b + 10] = z0; data[b + 3] = data[b + 11] = step;
        data[b + 4] = data[b + 12] = x1; data[b + 5] = data[b + 13] = y1; data[b + 6] = data[b + 14] = z1; data[b + 7] = data[b + 15] = w;
        data[b + 16] = data[b + 24] = x1; data[b + 17] = data[b + 25] = y1; data[b + 18] = data[b + 26] = z1; data[b + 19] = data[b + 27] = step;
        data[b + 20] = data[b + 28] = x0; data[b + 21] = data[b + 29] = y0; data[b + 22] = data[b + 30] = z0; data[b + 23] = data[b + 31] = w;
      }
      ib.addUpdateRange(slot * NP * 4 * F, NA * 4 * F); ranges++;
    }
    function warm(n = T + 2, respawn = true) {
      const t0 = performance.now(); region(); applyWind();
      if (respawn) for (let p = 0; p < NA; p++) { spawn(p); phases(p); LIFE[p] = Math.floor(rand() * MAXL[p] * 0.6); }
      for (let s = 0; s < n; s++) stepAll();
      ib.needsUpdate = true; uStep.value = step; uFrac.value = 0.99; reg.x0 = reg.cx; reg.z0 = reg.cz; ctx.draw();
      return +(performance.now() - t0).toFixed(1);
    }

    // ---------- the text description (screen readers, LLMs; OKRS.md architecture rule 4): the wind round the place in view
    // at 2 m above the ground (a 7 x 7 grid of points over half the region, points inside buildings left out) and the
    // profile at 150 m. Directions are true bearings (FROM), speeds m/s.
    const COMPASS = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east', 'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'];
    const fromTrue = (vx, vz) => ((Math.atan2(-vx, vz) / D2R - GRID_CONV) % 360 + 360) % 360;
    function describe() {
      if (!visible) return 'Wind in 3D is off.';
      region(); applyWind();
      let sx = 0, sz = 0, ss2 = 0, n = 0, turn = 0, nStreet = 0; const r = new Float32Array(5), i10 = Math.round(10 / WF.dz), fx = PX[i10], fz = PZ[i10];
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
        const x = reg.cx + a / 3 * reg.R * 0.5, z = reg.cz + b / 3 * reg.R * 0.5, g = surfAt(x, z); if (g + 2 < roofAt(x, z)) continue;
        field(x, g + 2, z, r); const sp = Math.hypot(r[0], r[2]); sx += r[0]; sz += r[2]; ss2 += sp; n++;
        if (r[3] > 0.5 && sp > 0.2) { nStreet++; turn += Math.abs(((Math.atan2(r[0], r[2]) - Math.atan2(fx, fz)) / D2R + 540) % 360 - 180); }
      }
      const k150 = Math.round(150 / WF.dz), v150 = Math.hypot(PX[k150], PZ[k150]), d150 = Math.round(fromTrue(PX[k150], PZ[k150]));
      const src = prof.src === 'Open-Meteo' ? 'Open-Meteo forecast by height' : 'an estimate (power law and veer), no forecast by height';
      if (!n) return `Wind at 150 m: ${v150.toFixed(0)} m/s from ${d150} degrees (${src}).`;
      const ms = ss2 / n, dGround = fromTrue(sx, sz), street = nStreet / n, mt = nStreet ? turn / nStreet : 0;
      const how = street > 0.3 && mt > 12 ? ', turning along the streets and slowed between the buildings' : street > 0.3 ? ', slowed between the buildings' : ' over open ground or water';
      return `Wind at street level about ${ms < 1 ? ms.toFixed(1) : ms.toFixed(0)} m/s from the ${COMPASS[Math.round(dGround / 22.5) % 16]}${how}; at 150 m, ${v150.toFixed(0)} m/s from ${d150} degrees. `
        + `Street level is a model from the building and street layout, not a measurement; the wind above it is ${src}.`;
    }

    // ---------- menu note and stats
    const note = ui.note('');
    function showNote() {
      const src = prof.src === 'Open-Meteo'
        ? `Wind by height: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0) at 10, 80, 120 and 180 m and ${prof.hours ? prof.hours.hpa.length : 0} pressure levels, for ${new Date(prof.at).toISOString().slice(11, 16)} UTC, as a shape scaled to the 10 m wind of Water surface.`
        : `Wind by height: an ESTIMATE (no Open-Meteo profile${prof.err ? ': ' + String(prof.err).replace(/[<>&]/g, '') : meteoOn ? '' : ', switched off'}): the 10 m wind x (height / 10 m)^0.3, with a turn of +15° clockwise up to 500 m.`;
      const html = `${src} Street level is a MODEL, not a measurement: the wind is turned along the street axis (OSM roads and building edges) and slowed by building density between the towers; over water, parks and open ground the free wind; above the roofs it joins the profile. Lines move faster than the wind when seen from high up. ${tier === 'lite' ? `Fewer lines (lower tier: ${tierWhy}).` : ''}`;
      if (note.innerHTML !== html) note.innerHTML = html;
    }
    showNote();
    const now = ui.note('');   // the text description, kept fresh (every 3 s while shown; not aria-live: it changes as the camera moves)
    let nowT = 0; const showNow = () => { const t = describe(); if (now.textContent !== t) now.textContent = t; };
    const frameMs = [];
    const st = stats.windfield = { grid: G.stats, particles: NP, get active() { return NA; }, get tier() { return { tier, why: tierWhy }; }, trail: T, get quads() { return NA * T; }, get profile() { return { source: prof.src, error: prof.err, hourAt: prof.at, levels: prof.hours && prof.hours.levels, hpa: prof.hours && prof.hours.hpa }; },
      get applyMs() { return applyMs; }, get frameMs() { if (!frameMs.length) return null; const s = [...frameMs].sort((a, b) => a - b); return { median: +s[s.length >> 1].toFixed(2), p90: +s[Math.floor(s.length * 0.9)].toFixed(2), n: s.length }; },
      get region() { return { cx: Math.round(reg.cx), cz: Math.round(reg.cz), R: Math.round(reg.R), hEye: +reg.hEye.toFixed(1), timeScale: +reg.k.toFixed(2) }; }, get steps() { return step - 1e4; }, get describe() { return describe(); }, get uploads() { return ranges; } };

    // ---------- each frame
    let visible = on, tPrev = performance.now(), acc = 0, tierCheck = 0;
    const anim = () => { const a = document.getElementById('animate'); return !a || a.checked; };
    const vpv = new THREE.Vector2();
    ctx.onFrame(() => {
      if (!visible) return;
      const t0 = performance.now(), dtR = Math.min(0.25, (t0 - tPrev) / 1000); tPrev = t0;
      if (profT == null || Math.abs(ctx.clock - profT) > 5 * 6e4) evalProfile();
      renderer.getDrawingBufferSize(vpv); uVp.value.copy(vpv); uDpr.value = renderer.getPixelRatio();
      region();
      applyWind();
      if (t0 - nowT > 3000) { nowT = t0; showNow(); }
      if (Math.hypot(reg.cx - reg.x0, reg.cz - reg.z0) > reg.R * 0.9 || !(reg.x0 === reg.x0)) warm(T + 2, true);   // the camera jumped: new particles with grown trails
      else if (anim()) {
        acc += dtR * WF.hz; let n = 0; while (acc >= 1 && n < 3) { stepAll(); acc -= 1; n++; } if (acc >= 1) acc = 0.999;   // a slow frame slows the wind, not the frame
        if (n) ib.needsUpdate = true; uStep.value = step; uFrac.value = acc;
      }
      frameMs.push(performance.now() - t0); if (frameMs.length > 120) frameMs.shift();
      if (tier === 'full' && qTier !== 'full' && anim() && frameMs.length === 120 && ++tierCheck % 60 === 0) {   // measured too slow: the lower tier
        const s = [...frameMs].sort((a, b) => a - b), med = s[60]; if (med > WF.budget) { tier = 'lite'; tierWhy = `measured ${med.toFixed(1)} ms a frame`; NA = Math.max(100, Math.round(NP * WF.lite)); frameMs.length = 0; showNote(); } }
    });
    evalProfile();
    // test hook: the field and the street grid
    const api = {
      object: mesh, setVisible: v => { visible = v; mesh.visible = v; if (v) { tPrev = performance.now(); warm(); } },
      warm, region: () => { region(); return st.region; },
      bench(n = 60) { region(); applyWind(); const t0 = performance.now(); for (let k = 0; k < n; k++) stepAll(); ib.needsUpdate = true; uStep.value = step; ctx.draw(); return +((performance.now() - t0) / n).toFixed(3); },   // ms a step (the NA active particles)
      sample(x, y, z) { applyWind(); const r = field(x, y, z, new Float32Array(5)), s = Math.hypot(r[0], r[2]), dir = (Math.atan2(-r[0], r[2]) / D2R + 360) % 360;   // FROM, grid
        return { speed: +s.toFixed(2), dir: +dir.toFixed(1), dirTrue: +((dir - GRID_CONV + 360) % 360).toFixed(1), street: +r[3].toFixed(2), ground: +r[4].toFixed(1), roof: +roofAt(x, z).toFixed(1) }; },
      cell(x, z) { const m = cellOf(x, z); return { axis: +((Math.atan2(G.ax[m], -G.az[m]) / D2R + 360) % 180).toFixed(1), coherence: +G.coh[m].toFixed(2), lambda: +G.lam[m].toFixed(2), H: +G.H[m].toFixed(1), aspect: +G.asp[m].toFixed(2), open: !!G.open[m] }; },   // axis: grid bearing 0 to 180
      profile: (hs = [2, 5, 10, 30, 80, 150, 300, 500, 1000, 1500]) => { applyWind(); return hs.map(z => { const k = Math.min(NZ - 1, Math.round(z / WF.dz)); return { z, speed: +Math.hypot(PX[k], PZ[k]).toFixed(2), dir: +((Math.atan2(-PX[k], PZ[k]) / D2R + 360) % 360).toFixed(1), ratio: +RT[k].toFixed(2), turn: +VT[k].toFixed(1) }; }); },
      evalProfile, get stats() { return st; },
      setTier(t) { tier = t === 'lite' ? 'lite' : 'full'; tierWhy = 'api'; NA = tier === 'lite' ? Math.max(100, Math.round(NP * WF.lite)) : NP; frameMs.length = 0; showNote(); warm(); return st.tier; },
      describe,
    };
    if (on) warm();
    return api;
  },
};
