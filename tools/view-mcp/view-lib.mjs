// view-lib — the camera model, landmarks and least-squares camera solve behind tools/view-mcp/server.mjs.
// Also usable on its own: import { solveCamera, project, landmarks } from './view-lib.mjs'.
// Model metres of the Docklands 3D page: x = E - 537550, z = -(N - 180300) (north is -z), y = metres above ODN.
// The method, the error budget and what fails: the photo-view-reconstruction skill
// (magpie/cwplans/docklands/skills/photo-view-reconstruction/SKILL.md).
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const DOCK = join(REPO, 'magpie/cwplans/docklands');
const D = Math.PI / 180;

// ---------- the model data (loaded once)
let AREA = null, TOWERS = null, EXTRA = null;
export function area() {
  if (!AREA) { const ctx = {}; createContext(ctx); runInContext(readFileSync(join(DOCK, 'data/area.js'), 'utf8').replace('globalThis.DOCKLANDS_AREA', 'this.A'), ctx); AREA = ctx.A; }
  return AREA;
}
export function towers() { return TOWERS ||= JSON.parse(readFileSync(join(DOCK, 'data/towers.json'), 'utf8')).buildings; }
// hand-identified points that are not in area.js or towers.json (dock corners, bridges, the box's far landmarks)
export function extraPoints() { return EXTRA ||= JSON.parse(readFileSync(join(DOCK, 'reference/landmarks-extra.json'), 'utf8')).points; }
export function dec(q, stride = 2) { const o = [], acc = new Array(stride).fill(0); for (let i = 0; i < q.length; i++) { acc[i % stride] += q[i]; o.push(acc[i % stride] / 10); } return o; }

// WGS84 -> model metres: the page's own quadratic fit (meta.geo, max error 0.03 m), and its inverse by Newton steps
export function geo(lon, lat) { const G = area().meta.geo, a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; }
export function lonlat(x, z) {
  let lon = -0.02, lat = 51.5;
  for (let k = 0; k < 8; k++) {
    const [x0, z0] = geo(lon, lat), [x1] = geo(lon + 1e-5, lat), [, z2] = geo(lon, lat + 1e-5);
    lon += (x - x0) / ((x1 - x0) / 1e-5); lat += (z - z0) / ((z2 - z0) / 1e-5);
  }
  return [lon, lat];
}
export function inBox(x, z, m = 0) { const E = area().meta.extent; return x >= E.x0 - m && x <= E.x1 + m && z >= E.z0 - m && z <= E.z1 + m; }
export function groundAt(x, z) {
  const T = area().terrain, gx = (x - T.x0) / T.cell, gz = (z - T.z0) / T.cell;
  const i = Math.max(0, Math.min(T.nx - 2, Math.floor(gx))), j = Math.max(0, Math.min(T.nz - 2, Math.floor(gz))), fx = Math.min(1, Math.max(0, gx - i)), fz = Math.min(1, Math.max(0, gz - j));
  const h = (a, b) => T.dm[b * T.nx + a] / 10;
  return (h(i, j) * (1 - fx) + h(i + 1, j) * fx) * (1 - fz) + (h(i, j + 1) * (1 - fx) + h(i + 1, j + 1) * fx) * fz;
}

// ---------- landmarks: named 3D points with ids
// tower tops (towers.json: the apex, else the centre of the top tier), named places (area.js places, at ground level),
// and the hand-identified extra points. Ids: cwb-xxxx (tower top), place:<name>, x:<id> (extra).
export function landmarks({ near, radius = 1e9, bbox, kinds } = {}) {
  const out = [];
  for (const [id, t] of Object.entries(towers())) {
    if (!t.tiers?.length) continue;
    const r = t.tiers.at(-1).ring, c = [r.reduce((a, q) => a + q[0], 0) / r.length, r.reduce((a, q) => a + q[1], 0) / r.length];
    const top = t.top?.apex || [c[0], t.tiers.at(-1).y1, c[1]];
    out.push({ id, kind: 'tower-top', name: t.name + (t.top?.apex ? ', apex' : ', top tier centre'), xyz: top.map(v => +v.toFixed(1)), height_m_od: +top[1].toFixed(1), source: 'docklands/data/towers.json (EA LiDAR DSM fit)' });
  }
  for (const p of area().places) out.push({ id: 'place:' + p.name, kind: 'place', name: p.name, xyz: [+p.x.toFixed(1), +(p.g ?? groundAt(p.x, p.z)).toFixed(1), +p.z.toFixed(1)], height_m_od: p.g, source: 'area.js places (OSM and Wikidata)' });
  try { for (const p of extraPoints()) out.push({ id: 'x:' + p.id, kind: p.kind || 'point', name: p.name, xyz: p.xyz, height_m_od: p.xyz[1], source: p.source, note: p.note }); } catch { /* no extra file */ }
  return out.filter(l => {
    if (kinds && !kinds.includes(l.kind)) return false;
    if (near && Math.hypot(l.xyz[0] - near[0], l.xyz[2] - near[1]) > radius) return false;
    if (bbox && (l.xyz[0] < bbox[0] || l.xyz[0] > bbox[2] || l.xyz[2] < bbox[1] || l.xyz[2] > bbox[3])) return false;
    return true;
  });
}
export function landmarkById(id) { return landmarks().find(l => l.id === id); }

// ---------- the camera
// cam = { eye:[x,y,z] model metres, heading_deg (from grid north, clockwise), pitch_deg (up +), roll_deg (+ = the horizon
// falls to the right in the image), focal_px, k1 (radial: r_d = r (1 + k1 r^2), r in focal units), width, height, cx, cy }
export function axes(H, P, R) {
  const fw = [Math.sin(H) * Math.cos(P), Math.sin(P), -Math.cos(H) * Math.cos(P)];
  const r0 = [Math.cos(H), 0, Math.sin(H)];
  const u0 = [r0[1] * fw[2] - r0[2] * fw[1], r0[2] * fw[0] - r0[0] * fw[2], r0[0] * fw[1] - r0[1] * fw[0]];
  const c = Math.cos(R), s = Math.sin(R);
  return { fw, rt: r0.map((x, i) => c * x + s * u0[i]), up: u0.map((x, i) => c * x - s * r0[i]) };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function camAxes(cam) { return axes(cam.heading_deg * D, cam.pitch_deg * D, (cam.roll_deg || 0) * D); }
// a 3D point -> pixel [u, v] (v down), or null behind the camera. Earth curvature: the drop d^2 / (2 R) * (1 - 0.13 refraction)
export function project(cam, p, A = camAxes(cam)) {
  const dx = p[0] - cam.eye[0], dz = p[2] - cam.eye[2], hd = Math.hypot(dx, dz);
  const d = [dx, p[1] - cam.eye[1] - hd * hd / (2 * 6371000) * 0.87, dz];
  const z = dot(d, A.fw); if (z <= 1e-6) return null;
  let a = dot(d, A.rt) / z, b = dot(d, A.up) / z;
  if (cam.k1) { const f = 1 + cam.k1 * (a * a + b * b); a *= f; b *= f; }
  const cx = cam.cx ?? cam.width / 2, cy = cam.cy ?? cam.height / 2;
  return [cx + cam.focal_px * a, cy - cam.focal_px * b];
}
// pixel -> unit ray (model axes), undoing k1 by fixed-point steps
export function ray(cam, u, v, A = camAxes(cam)) {
  const cx = cam.cx ?? cam.width / 2, cy = cam.cy ?? cam.height / 2;
  let a = (u - cx) / cam.focal_px, b = -(v - cy) / cam.focal_px; const a0 = a, b0 = b;
  if (cam.k1) for (let k = 0; k < 20; k++) { const f = 1 + cam.k1 * (a * a + b * b); a = a0 / f; b = b0 / f; }
  const d = A.fw.map((x, i) => x + a * A.rt[i] + b * A.up[i]), n = Math.hypot(...d); return d.map(x => x / n);
}
// pixel -> ground point at height y (m OD)
export function groundPoint(cam, u, v, y = 2) { const r = ray(cam, u, v); if (r[1] >= 0) return null; const t = (y - cam.eye[1]) / r[1]; return [cam.eye[0] + r[0] * t, y, cam.eye[2] + r[2] * t]; }
// the elevation (deg) of the sea-level horizon seen from height h m (dip, with standard refraction k = 0.13)
export const horizonDipDeg = h => -Math.sqrt(2 * Math.max(0, h) / (6371000 / (1 - 0.13))) / D;
export function hfov(cam) { return 2 * Math.atan(cam.width / 2 / cam.focal_px) / D; }

// ---------- the solve: Levenberg-Marquardt over the free parameters, numeric Jacobian
const PARAMS = ['x', 'y', 'z', 'heading_deg', 'pitch_deg', 'roll_deg', 'focal_px', 'k1'];
function toCam(base, names, v) { const c = { ...base, eye: [...base.eye] }; names.forEach((n, i) => { if (n === 'x') c.eye[0] = v[i]; else if (n === 'y') c.eye[1] = v[i]; else if (n === 'z') c.eye[2] = v[i]; else c[n] = v[i]; }); return c; }
function fromCam(c, names) { return names.map(n => n === 'x' ? c.eye[0] : n === 'y' ? c.eye[1] : n === 'z' ? c.eye[2] : (c[n] || 0)); }
function solveLinear(M, b) {   // Gaussian elimination with partial pivoting
  const n = b.length, A = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; if (Math.abs(A[c][c]) < 1e-15) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map((r, i) => r[n] / r[i]);
}
function invert(M) { const n = M.length; return M.map((_, j) => solveLinear(M, M.map((__, i) => +(i === j)))).reduce((o, col, j) => { if (!col) return null; col.forEach((v, i) => { o[i][j] = v; }); return o; }, M.map(() => new Array(n).fill(0))); }

// an outline: 'water:<index>' (an area.js water polygon at its level), 'water:<name>', 'water:tidal' (every tidal polygon:
// the Thames, the creeks) or [[x,y,z], ...] (null breaks the line)
export function outline3d(o) {
  if (Array.isArray(o)) return o;
  const m = /^water:(.+)$/.exec(o); if (!m) throw new Error('outline must be water:<index|name> or a list of [x,y,z]');
  const W = area().water, ws = m[1] === 'tidal' ? W.filter(v => v.tidal) : [/^\d+$/.test(m[1]) ? W[+m[1]] : W.find(v => v.n === m[1])]; if (!ws[0]) throw new Error('no water ' + m[1]);
  const r = []; for (const w of ws) { const p = dec(w.p); for (let i = 0; i < p.length; i += 2) r.push([p[i], w.level ?? 2.5, p[i + 1]]); r.push([p[0], w.level ?? 2.5, p[1]], null); } return r;
}
export function distToPolyline(px, Q) {
  let best = 1e4;
  for (let i = 1; i < Q.length; i++) { const a = Q[i - 1], b = Q[i]; if (!a || !b) continue; const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px[0] - a[0]) * dx + (px[1] - a[1]) * dy) / L)) : 0; best = Math.min(best, Math.hypot(a[0] + t * dx - px[0], a[1] + t * dy - px[1])); }
  return best;
}
// correspondences: [{ px:[u,v] | px:[u,null] (u only), id: landmark id | xyz:[x,y,z] | lonlat:[lon,lat,alt m OD] | outline (a pixel
//   anywhere on a shoreline: the residual is its distance to the projected outline), w?: weight, holdout?: true }]
// horizon: [[u,v], ...] pixels on the visible sea-level horizon (optional; constrains pitch and roll)
// free: which parameters to fit (default all but k1); fixed values come from initial
export function solveCamera({ width, height, correspondences, horizon = [], horizon_elev_deg, initial, free }) {
  const pts = correspondences.map(c => {
    let xyz = c.xyz; if (!xyz && c.id) { const l = landmarkById(c.id); if (!l) throw new Error('unknown landmark ' + c.id); xyz = l.xyz; }
    if (!xyz && c.lonlat) { const [x, z] = geo(c.lonlat[0], c.lonlat[1]); xyz = [x, c.lonlat[2] ?? groundAt(x, z), z]; }
    return { ...c, xyz, w: c.w ?? 1, line: c.outline ? outline3d(c.outline) : null };
  });
  const fit = pts.filter(p => !p.holdout), held = pts.filter(p => p.holdout);
  const base = { width, height, cx: width / 2, cy: height / 2, k1: 0, roll_deg: 0, ...initial };
  const names = free || PARAMS.filter(n => n !== 'k1');
  const resid = c => {
    const r = [], A = camAxes(c);
    for (const p of fit) { if (p.line) { r.push(distToPolyline(p.px, p.line.map(v => v && project(c, v, A))) * p.w); continue; } const q = project(c, p.xyz, A); if (!q) { r.push(1e4, 1e4); continue; } r.push((q[0] - p.px[0]) * p.w); if (p.px[1] != null) r.push((q[1] - p.px[1]) * p.w); }
    const he = horizon_elev_deg ?? horizonDipDeg(c.eye[1]);
    for (const h of horizon) { const d = ray(c, h[0], h[1], A); r.push((Math.asin(d[1]) / D - he) * D * c.focal_px * .5); }
    return r;
  };
  let v = fromCam(base, names), lam = 1e-3, r = resid(toCam(base, names, v)), cost = r.reduce((s, x) => s + x * x, 0), J = null;
  const steps = names.map(n => n === 'focal_px' ? 0.5 : n === 'k1' ? 1e-4 : /deg/.test(n) ? 1e-3 : 0.05);
  for (let it = 0; it < 200; it++) {
    J = names.map((_, k) => { const v2 = [...v]; v2[k] += steps[k]; const r2 = resid(toCam(base, names, v2)); return r2.map((x, i) => (x - r[i]) / steps[k]); });
    const JtJ = names.map((_, a) => names.map((__, b) => J[a].reduce((s, x, i) => s + x * J[b][i], 0))), Jtr = names.map((_, a) => J[a].reduce((s, x, i) => s + x * r[i], 0));
    let improved = false;
    for (let t = 0; t < 12; t++) {
      const M = JtJ.map((row, a) => row.map((x, b) => a === b ? x * (1 + lam) + 1e-12 : x)), dv = solveLinear(M, Jtr.map(x => -x));
      if (!dv) { lam *= 10; continue; }
      const v2 = v.map((x, k) => x + dv[k]), r2 = resid(toCam(base, names, v2)), c2 = r2.reduce((s, x) => s + x * x, 0);
      if (c2 < cost) { const done = cost - c2 < 1e-9 * cost; v = v2; r = r2; cost = c2; lam = Math.max(1e-9, lam / 3); improved = true; if (done) it = 1e9; break; }
      lam *= 10;
    }
    if (!improved) break;
  }
  const cam = toCam(base, names, v), nObs = r.length, dof = Math.max(1, nObs - names.length), s2 = cost / dof;
  const JtJ = names.map((_, a) => names.map((__, b) => J[a].reduce((s, x, i) => s + x * J[b][i], 0))), cov = invert(JtJ);
  const sigma = Object.fromEntries(names.map((n, k) => [n, cov ? +Math.sqrt(Math.max(0, cov[k][k] * s2)).toPrecision(3) : null]));
  const A = camAxes(cam), per = p => { if (p.line) { const e = distToPolyline(p.px, p.line.map(v => v && project(cam, v, A))); return { outline: p.outline, name: p.name || null, photo: p.px, err_px: +e.toFixed(1) }; } const q = project(cam, p.xyz, A); return { id: p.id || null, name: p.name || landmarkById(p.id)?.name || null, photo: p.px, model: q && q.map(x => +x.toFixed(1)), err_px: q ? +Math.hypot(q[0] - p.px[0], p.px[1] == null ? 0 : q[1] - p.px[1]).toFixed(1) : null, range_m: Math.round(Math.hypot(p.xyz[0] - cam.eye[0], p.xyz[1] - cam.eye[1], p.xyz[2] - cam.eye[2])) }; };
  const [lon, lat] = lonlat(cam.eye[0], cam.eye[2]);
  return {
    camera: { eye: cam.eye.map(x => +x.toFixed(1)), heading_deg: +cam.heading_deg.toFixed(2), pitch_deg: +cam.pitch_deg.toFixed(2), roll_deg: +cam.roll_deg.toFixed(2), focal_px: +cam.focal_px.toFixed(1), k1: +(cam.k1 || 0).toFixed(4), width, height, cx: cam.cx, cy: cam.cy },
    eye_wgs84: { lon: +lon.toFixed(5), lat: +lat.toFixed(5), alt_m_od: +cam.eye[1].toFixed(0), alt_ft: Math.round(cam.eye[1] / .3048) },
    hfov_deg: +hfov(cam).toFixed(1), rms_px: +Math.sqrt(cost / Math.max(1, nObs)).toFixed(2), rms_px_dof: +Math.sqrt(s2).toFixed(2), n_obs: nObs, n_params: names.length, free: names, sigma,
    residuals: fit.map(per), holdout: held.map(per),
  };
}

// ---------- the sun (astronomy-engine, vendored)
let ASTRO = null;
export function astronomy() {
  if (ASTRO) return ASTRO; const ctx = {}; createContext(ctx);
  runInContext(readFileSync(join(DOCK, 'vendor/astronomy.browser.min.js'), 'utf8'), ctx);
  ASTRO = ctx.Astronomy; ASTRO.RealmDate = runInContext('Date', ctx); return ASTRO;
}
export function sunAt(iso, lat = 51.5, lon = -0.02, h = 10, body = 'Sun') {
  const A = astronomy(), t = new A.RealmDate(Date.parse(iso)), obs = new A.Observer(lat, lon, h);
  const eq = A.Equator(A.Body[body], t, obs, true, true), hz = A.Horizon(t, obs, eq.ra, eq.dec, 'normal');
  return { utc: new Date(Date.parse(iso)).toISOString(), body, azimuth_true_deg: +hz.azimuth.toFixed(2), altitude_deg: +hz.altitude.toFixed(2) };
}
// the times on a date at which the body has the given azimuth (and, if given, the altitude nearest to it); scans in 1-minute steps
export function timeFromSun({ date, azimuth_deg, altitude_deg, lat = 51.5, lon = -0.02, body = 'Sun' }) {
  const t0 = Date.parse(date + 'T00:00:00Z'), out = [];
  let prev = null;
  for (let m = 0; m <= 1440; m++) {
    const s = sunAt(new Date(t0 + m * 60e3).toISOString(), lat, lon, 10, body), da = ((s.azimuth_true_deg - (azimuth_deg ?? s.azimuth_true_deg) + 540) % 360) - 180;
    if (azimuth_deg != null && prev && Math.sign(prev.da) !== Math.sign(da) && Math.abs(da - prev.da) < 90) out.push({ ...s, by: 'azimuth' });
    if (altitude_deg != null && prev && Math.sign(prev.s.altitude_deg - altitude_deg) !== Math.sign(s.altitude_deg - altitude_deg)) out.push({ ...s, by: 'altitude' });
    prev = { da, s };
  }
  return out;
}
