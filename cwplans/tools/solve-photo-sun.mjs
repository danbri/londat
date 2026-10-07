// Solve a daytime photo's camera and time from tower tops and shadows on a level deck.
// Run: node cwplans/tools/solve-photo-sun.mjs [cwplans/docklands/reference/day-2026-10-04/points.json]
// Reads the points file (landmark pixels, shadow foot/tip pixels, eye), docklands/data/towers.json (tower tops) and the
// vendored astronomy-engine (docklands/vendor/astronomy.browser.min.js). Prints JSON: the fitted pinhole camera
// (heading from grid north, tilt, roll, focal length), the residuals, the sun azimuth from each shadow, and the UTC times
// at which the sun had each azimuth. No network. Method, results and the uncertainty: docklands-sky skill, "Photo time
// from shadows", and docklands/reference/day-2026-10-04/README.md.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), CW = join(HERE, '..');
const D = Math.PI / 180;

export function loadAstronomy() {
  const ctx = {}; createContext(ctx);
  runInContext(readFileSync(join(CW, 'docklands/vendor/astronomy.browser.min.js'), 'utf8'), ctx);
  // the library checks `instanceof Date` in its own realm: hand it that realm's Date
  const A = ctx.Astronomy; A.RealmDate = runInContext('Date', ctx); return A;
}

function towerTop(T, id) {
  const b = T[id]; if (!b) throw new Error(`no tower ${id} in towers.json`);
  if (b.top?.apex) return b.top.apex;
  const r = b.tiers.at(-1).ring;
  return [r.reduce((a, q) => a + q[0], 0) / r.length, b.tiers.at(-1).y1, r.reduce((a, q) => a + q[1], 0) / r.length];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// camera = [heading from grid north, tilt up, roll, focal px]; model axes x east, y up, z south
function axes([H, P, R]) {
  const fw = [Math.sin(H) * Math.cos(P), Math.sin(P), -Math.cos(H) * Math.cos(P)];
  const r0 = [Math.cos(H), 0, Math.sin(H)];
  const u0 = [r0[1] * fw[2] - r0[2] * fw[1], r0[2] * fw[0] - r0[0] * fw[2], r0[0] * fw[1] - r0[1] * fw[0]];
  const c = Math.cos(R), s = Math.sin(R);
  return { fw, rt: r0.map((x, i) => c * x + s * u0[i]), up: u0.map((x, i) => c * x - s * r0[i]) };
}
function project(cam, pp, d) { const { fw, rt, up } = axes(cam), z = dot(d, fw); return [pp[0] + cam[3] * dot(d, rt) / z, pp[1] - cam[3] * dot(d, up) / z]; }
function nelderMead(f, x0, step, iters = 6000) {
  const n = x0.length;
  let S = [x0, ...x0.map((_, i) => x0.map((v, j) => v + (i === j ? step[i] : 0)))].map(p => [p, f(p)]);
  for (let k = 0; k < iters; k++) {
    S.sort((a, b) => a[1] - b[1]);
    const c = x0.map((_, j) => S.slice(0, n).reduce((a, p) => a + p[0][j], 0) / n), w = S[n][0];
    const r = c.map((v, j) => 2 * v - w[j]), fr = f(r);
    if (fr < S[0][1]) { const e = c.map((v, j) => 3 * v - 2 * w[j]), fe = f(e); S[n] = fe < fr ? [e, fe] : [r, fr]; }
    else if (fr < S[n - 1][1]) S[n] = [r, fr];
    else { const q = c.map((v, j) => (v + w[j]) / 2), fq = f(q); if (fq < S[n][1]) S[n] = [q, fq]; else S = S.map((p, i) => i ? p[0].map((v, j) => (v + S[0][0][j]) / 2) : p[0]).map(p => [p, f(p)]); }
  }
  S.sort((a, b) => a[1] - b[1]); return S[0];
}

export function solve(cfg) {
  const T = JSON.parse(readFileSync(join(CW, 'docklands/data/towers.json'), 'utf8')).buildings;
  const E = cfg.eye.xyz, pp = cfg.principal_point;
  const dirTo = p => { const v = [p[0] - E[0], p[1] - E[1], p[2] - E[2]], n = Math.hypot(...v); return v.map(x => x / n); };
  const L = cfg.landmarks.map(l => ({ ...l, d: dirTo(towerTop(T, l.id)) }));
  let nObs = 0; for (const l of L) nObs += l.px[1] == null ? 1 : 2;
  const cost = c => { let s = 0; for (const l of L) { const [x, y] = project(c, pp, l.d); s += (x - l.px[0]) ** 2; if (l.px[1] != null) s += (y - l.px[1]) ** 2; } return s; };
  const [cam, c2] = nelderMead(cost, [45 * D, 0, 0, pp[0]], [10 * D, 3 * D, 2 * D, 300]);
  const camera = { heading_grid_deg: +(cam[0] / D).toFixed(2), tilt_deg: +(cam[1] / D).toFixed(2), roll_deg: +(cam[2] / D).toFixed(2), focal_px: +cam[3].toFixed(0),
    hfov_deg: +(2 * Math.atan(pp[0] / cam[3]) / D).toFixed(1), rms_px: +Math.sqrt(c2 / Math.max(1, nObs - 4)).toFixed(1),
    residuals: L.map(l => { const p = project(cam, pp, l.d); return { id: l.id, photo: l.px, model: p.map(v => +v.toFixed(1)) }; }) };
  // back-project to the deck plane Hc below the eye; the azimuth of a shadow does not depend on Hc, its length does
  const ground = (px, py, Hc) => { const { fw, rt, up } = axes(cam), a = (px - pp[0]) / cam[3], b = -(py - pp[1]) / cam[3]; const d = fw.map((v, i) => v + a * rt[i] + b * up[i]); const t = -Hc / d[1]; return [d[0] * t, d[2] * t]; };
  const A = loadAstronomy(), obs = new A.Observer(cfg.observer.lat, cfg.observer.lon, cfg.observer.height_m);
  const sunAt = t => { t = new A.RealmDate(+t); const eq = A.Equator(A.Body.Sun, t, obs, true, true); return A.Horizon(t, obs, eq.ra, eq.dec, 'normal'); };
  const day0 = Date.parse(cfg.date + 'T00:00:00Z');
  // the sun's azimuth rises through the day: bisection between 06:00 and 18:00 UTC
  const timeForAz = az => { let lo = day0 + 6 * 3600e3, hi = day0 + 18 * 3600e3; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (sunAt(new Date(m)).azimuth < az) lo = m; else hi = m; } return new Date((lo + hi) / 2); };
  const shadows = cfg.shadows.map(s => {
    const f = ground(...s.foot, 1.5), t = ground(...s.tip, 1.5), dx = t[0] - f[0], dz = t[1] - f[1];
    const sunGrid = (Math.atan2(dx, -dz) / D + 180 + 360) % 360, sunTrue = sunGrid + cfg.grid_to_true_deg;
    const when = timeForAz(sunTrue), sun = sunAt(when);
    return { name: s.name, sun_azimuth_true_deg: +sunTrue.toFixed(1), utc: when.toISOString().slice(11, 16), sun_altitude_then_deg: +sun.altitude.toFixed(1),
      shadow_length_m_per_camera_height: cfg.camera_height_above_deck_m.map(h => +(Math.hypot(dx, dz) * h / 1.5).toFixed(2)) };
  });
  const az = shadows.map(s => s.sun_azimuth_true_deg), mean = az.reduce((a, b) => a + b, 0) / az.length;
  const tm = timeForAz(mean), tlo = timeForAz(Math.min(...az)), thi = timeForAz(Math.max(...az));
  return { photo: cfg.photo, camera, shadows, result: { sun_azimuth_true_mean_deg: +mean.toFixed(1), utc: tm.toISOString().slice(11, 16), utc_range: [tlo.toISOString().slice(11, 16), thi.toISOString().slice(11, 16)], sun_altitude_deg: +sunAt(tm).altitude.toFixed(1) } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const f = process.argv[2] || join(CW, 'docklands/reference/day-2026-10-04/points.json');
  console.log(JSON.stringify(solve(JSON.parse(readFileSync(f, 'utf8'))), null, 1));
}
