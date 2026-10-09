// Clock check of the Three.js port (docklands/): sets the page clock to historical times and compares what the page
// computes (sun, moon, phase, the sun light's direction, night, the tide, the wind, the weather, London time to UTC) with
// references that do not use the page's code: the sun and the moon by Meeus (Astronomical Algorithms, ch. 25 and 47,
// truncated; about 0.01 and 0.2 degrees), published facts (sunrise and sunset times and azimuths for London, the moon of the
// owner's photo of 3 October 2026, full and new moon times), Environment Agency tide readings (the committed snapshot
// cwplans/docklands/data/sky/tide-2026-10-03.json; with --live the last 4 weeks from the EA API) and Open-Meteo (the
// committed snapshot weather-2026-10-03.json; with --live the archive API, ERA5). Prints a table; exits 1 when a value is
// outside its stated tolerance. Run from the repository root with a server on it:
//   python3 -m http.server 8251 --bind 127.0.0.1 &
//   node docklands/test/clock-check.mjs [--base http://127.0.0.1:8251] [--live] [--render] [--out dir] [--webgpu]
// --live: asks the EA and Open-Meteo APIs (one request each per station or range; set NODE_USE_ENV_PROXY=1 behind a proxy);
// --render: screenshots (the shadow of a 300 m test pole, the moon in a narrow view) and checks them by pixels.
// Skill: docklands-sky, "Three.js port clock".
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8251'), LIVE = process.argv.includes('--live'), RENDER = process.argv.includes('--render'), WEBGPU = process.argv.includes('--webgpu');
const OUT = arg('--out', 'docklands/test/out/clock'); mkdirSync(OUT, { recursive: true });
const D2R = Math.PI / 180, R2D = 180 / Math.PI, norm = a => ((a % 360) + 360) % 360, dAng = (a, b) => { const d = norm(a - b); return d > 180 ? d - 360 : d; };
const SKY = 'cwplans/docklands/data/sky/';

// ---------- the observer: as sky3.js (area.js meta.geo lon0 + 0.07, lat0 + 0.03), and true north in the model frame
const area = readFileSync('cwplans/docklands/data/area.js', 'utf8'), G = JSON.parse(/"geo":(\{[^{}]*\})/.exec(area)[1]);
const LON = G.lon0 + 0.07, LAT = G.lat0 + 0.03, HGT = 10;
const geo = (lon, lat) => { const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; };
const [x0, z0] = geo(LON, LAT), [xn, zn] = geo(LON, LAT + 1e-4), nl = Math.hypot(xn - x0, zn - z0), NORTH = [(xn - x0) / nl, 0, (zn - z0) / nl], EAST = [-NORTH[2], 0, NORTH[0]];
const CONV = Math.atan2(NORTH[0], -NORTH[2]) * R2D;   // grid bearing of true north
const dirOf = (az, alt) => { const c = Math.cos(alt * D2R); return [0, 1, 2].map(i => NORTH[i] * c * Math.cos(az * D2R) + EAST[i] * c * Math.sin(az * D2R) + (i === 1 ? Math.sin(alt * D2R) : 0)); };

// ---------- Meeus: sun and moon (independent of Astronomy Engine)
const jd = t => t / 864e5 + 2440587.5;
function obliq(T) { return 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - 0.001813 * T))) / 60) / 60; }
function gmst(t) { const J = jd(t), T = (J - 2451545) / 36525; return norm(280.46061837 + 360.98564736629 * (J - 2451545) + 0.000387933 * T * T - T * T * T / 38710000); }
function toHorizon(t, ra, dec) {   // degrees -> { az, alt } geometric
  const H = (gmst(t) + LON - ra) * D2R, d = dec * D2R, p = LAT * D2R;
  const alt = Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H)) * R2D;
  const az = norm(Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(p) - Math.tan(d) * Math.cos(p)) * R2D + 180);
  return { az, alt };
}
const refr = h => h < -1 ? 0 : 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R) / 60;   // Saemundsson: geometric -> apparent (standard air), none below -1 deg
function sunRef(t) {
  const T = (jd(t) - 2451545) / 36525, L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T, M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * D2R;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const Om = (125.04 - 1934.136 * T) * D2R, lam = (L0 + C - 0.00569 - 0.00478 * Math.sin(Om)) * D2R, eps = (obliq(T) + 0.00256 * Math.cos(Om)) * D2R;
  const ra = norm(Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) * R2D), dec = Math.asin(Math.sin(eps) * Math.sin(lam)) * R2D;
  const h = toHorizon(t, ra, dec); return { az: h.az, alt: h.alt + refr(h.alt), geo: h.alt, lam: lam * R2D };
}
const ML = [[0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968], [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733], [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0], [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824], [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403], [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056], [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884]];
const MB = [[0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324], [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211], [2, -1, -1, -1, 2065]];
function moonRef(t) {
  const T = (jd(t) - 2451545) / 36525, Lp = 218.3164477 + 481267.88123421 * T, D = 297.8501921 + 445267.1114034 * T, M = 357.5291092 + 35999.0502909 * T, Mp = 134.9633964 + 477198.8675055 * T, F = 93.2720950 + 483202.0175233 * T;
  const E = 1 - 0.002516 * T, e = m => Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
  let sl = 0, sr = 0, sb = 0;
  for (const [d, m, mp, f, l, r] of ML) { const a = (d * D + m * M + mp * Mp + f * F) * D2R; sl += l * e(m) * Math.sin(a); sr += r * e(m) * Math.cos(a); }
  for (const [d, m, mp, f, b] of MB) sb += b * e(m) * Math.sin((d * D + m * M + mp * Mp + f * F) * D2R);
  const A1 = (119.75 + 131.849 * T) * D2R, A2 = (53.09 + 479264.29 * T) * D2R, A3 = (313.45 + 481266.484 * T) * D2R, Lr = Lp * D2R, Fr = F * D2R, Mpr = Mp * D2R;
  sl += 3958 * Math.sin(A1) + 1962 * Math.sin(Lr - Fr) + 318 * Math.sin(A2);
  sb += -2235 * Math.sin(Lr) + 382 * Math.sin(A3) + 175 * Math.sin(A1 - Fr) + 175 * Math.sin(A1 + Fr) + 127 * Math.sin(Lr - Mpr) - 115 * Math.sin(Lr + Mpr);
  const Om = (125.04452 - 1934.136261 * T) * D2R, dpsi = -0.00478 * Math.sin(Om);
  const lam = (Lp + sl / 1e6 + dpsi) * D2R, bet = sb / 1e6 * D2R, dist = 385000.56 + sr / 1000, eps = (obliq(T) + 0.00256 * Math.cos(Om)) * D2R;
  const ra = norm(Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(bet) * Math.sin(eps), Math.cos(lam)) * R2D), dec = Math.asin(Math.sin(bet) * Math.cos(eps) + Math.cos(bet) * Math.sin(eps) * Math.sin(lam)) * R2D;
  const h = toHorizon(t, ra, dec), par = Math.asin(6378.14 / dist) * R2D, altT = h.alt - par * Math.cos(h.alt * D2R);   // topocentric (parallax in altitude)
  // phase: elongation from the sun, phase angle, illuminated fraction (Meeus ch. 48)
  const S = sunRef(t), psi = Math.acos(Math.cos(bet) * Math.cos(lam - S.lam * D2R)), R = 149597870.7, i = Math.atan2(R * Math.sin(psi), dist - R * Math.cos(psi));
  return { az: h.az, alt: altT + refr(altT), geo: altT, frac: (1 + Math.cos(i)) / 2, dist };
}

// ---------- London wall clock -> UTC: the expected answers (Europe/London rules: last Sunday of March and of October, 01:00 UTC)
const DST = [['2026-03-29T00:30', '2026-03-29T00:30Z'], ['2026-03-29T01:30', '2026-03-29T01:30Z', 'skipped hour: 02:30 BST'], ['2026-03-29T03:00', '2026-03-29T02:00Z'],
  ['2026-10-24T12:00', '2026-10-24T11:00Z'], ['2026-10-25T01:30', '2026-10-25T00:30Z', 'repeated hour: the first (BST)'], ['2026-10-25T02:00', '2026-10-25T02:00Z'], ['2026-10-26T12:00', '2026-10-26T12:00Z'],
  ['2026-06-21T04:43', '2026-06-21T03:43Z'], ['2025-12-21T15:53', '2025-12-21T15:53Z']];

// ---------- the cases: London wall times; pub: published facts with their source
const CASES = [
  { t: '2026-10-03T22:30', why: 'the owner\'s photo evening' },
  { t: '2026-10-03T23:56', why: 'photo time (moon solved from the photo, docklands-sky skill)', pub: { moonAlt: [7.25, 0.4], moonAz: [57.85, 0.4], frac: [0.46, 0.02], limb: [227, 6] } },
  { t: '2026-10-04T12:00', why: 'noon, day photo day' },
  { t: '2026-06-21T04:43', why: 'sunrise, timeanddate London: 04:43 BST, 49 deg', pub: { sunAlt: [-0.27, 0.3], sunAz: [49, 1.2] } },
  { t: '2025-12-21T15:53', why: 'sunset, timeanddate London: 15:53 GMT, 231 deg', pub: { sunAlt: [-0.27, 0.3], sunAz: [231, 1.2] } },
  { t: '2026-09-26T17:49', why: 'full moon 26 Sep 2026 16:49 UTC', pub: { frac: [1.0, 0.01] } },
  { t: '2026-09-26T22:00', why: 'full moon night' },
  { t: '2026-10-10T16:50', why: 'new moon 10 Oct 2026 15:50 UTC', pub: { frac: [0.0, 0.01] } },
  { t: '2026-10-10T22:00', why: 'new moon night' },
  { t: '2026-09-29T12:00', why: 'spring tide day (EA range 6.7 m at Charlton)' },
  { t: '2026-09-20T12:00', why: 'neap tide day (EA range 3.4 m at Charlton)' },
  { t: '2026-10-25T12:00', why: 'first day of GMT' },
];
// tide: the harmonic prediction has no surge; tolerances from its held-out errors (docklands-sky skill, "Tide prediction":
// rms 0.19 to 0.26 m, high water 23 to 31 min out over the last 48 h) with a margin for surge days. Wind and cloud against
// ERA5: two models, so wide; the snapshot rows (the same data the page reads) are tight.
const TOL = { sun: 0.1, moon: 0.35, frac: 0.02, light: 0.2, tideRms: 0.5, tideMax: 1.25, hwMin: 60, hwM: 0.6, windSpeed: 1.5, windDir: 45, cloud: 35 };
// EA readings known to be faulty (fault F21 of the curation skill: Tower Pier 4 Oct 2026 00:00 to 01:15 UTC, left out by sky.js)
const BAD = [['0007', Date.parse('2026-10-04T00:00Z'), Date.parse('2026-10-04T01:30Z')]];

// ---------- references from the net (--live): EA readings (28 days) and the Open-Meteo archive
const CACHE = tmpdir() + '/docklands-clock-check'; mkdirSync(CACHE, { recursive: true });
async function getJSON(url, file) {
  const f = CACHE + '/' + file; if (existsSync(f) && Date.now() - JSON.parse(readFileSync(f, 'utf8'))._at < 6 * 36e5) return JSON.parse(readFileSync(f, 'utf8'));
  for (let k = 0; k < 3; k++) { try { const r = await fetch(url, { headers: { 'User-Agent': 'londat docklands clock-check (https://github.com/danbri/londat)' } }); if (!r.ok) throw new Error('HTTP ' + r.status); const J = await r.json(); J._at = Date.now(); writeFileSync(f, JSON.stringify(J)); return J; } catch (e) { if (k === 2) throw e; await new Promise(r => setTimeout(r, 2000)); } }
}
const stationsEA = { '0007': 'Tower Pier', '0003': 'Charlton', '0001': 'Silvertown' };
async function eaReadings() {
  const out = {}, snap = JSON.parse(readFileSync(SKY + 'tide-2026-10-03.json', 'utf8'));
  for (const [id, s] of Object.entries(snap.stations)) out[id] = s.readings.map(([t, v]) => [Date.parse(t), v]);
  if (LIVE) { const since = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
    for (const id of Object.keys(stationsEA)) { const J = await getJSON(`https://environment.data.gov.uk/flood-monitoring/id/stations/${id}/readings?since=${since}T00:00:00Z&_sorted&_limit=10000`, `ea-${id}.json`);
      const m = new Map(out[id].map(r => [r[0], r[1]])); for (const it of J.items) if (typeof it.value === 'number') m.set(Date.parse(it.dateTime), it.value);
      out[id] = [...m].sort((a, b) => a[0] - b[0]); await new Promise(r => setTimeout(r, 1000)); } }
  return out;
}
async function meteoArchive() {
  const snap = JSON.parse(readFileSync(SKY + 'weather-2026-10-03.json', 'utf8')), rows = {};
  const add = (t, o) => { rows[t] = { ...(rows[t] || {}), ...o }; };
  const tl = s => Date.parse(s + ':00Z') - (/^2026-10-0[34]/.test(s) ? 36e5 : 0);   // snapshot hours are BST
  snap.hourly.time.forEach((s, i) => add(tl(s), { snap: { speed: snap.hourly.wind_speed_10m[i] / 3.6, dir: snap.hourly.wind_direction_10m[i], cloud: snap.hourly.cloud_cover[i], low: snap.hourly.cloud_cover_low[i], vis: snap.hourly.visibility[i] } }));
  if (LIVE) { const end = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    const J = await getJSON(`https://archive-api.open-meteo.com/v1/archive?latitude=51.505&longitude=-0.02&start_date=2025-12-20&end_date=${end}&hourly=wind_speed_10m,wind_direction_10m,cloud_cover,cloud_cover_low,precipitation&wind_speed_unit=ms&timeformat=unixtime&timezone=GMT`, 'meteo-archive.json');
    J.hourly.time.forEach((s, i) => add(s * 1000, { era5: { speed: J.hourly.wind_speed_10m[i], dir: J.hourly.wind_direction_10m[i], cloud: J.hourly.cloud_cover[i], low: J.hourly.cloud_cover_low[i], precip: J.hourly.precipitation[i] } })); }
  return t => { const a = Math.floor(t / 36e5) * 36e5, f = (t - a) / 36e5, A = rows[a], B = rows[a + 36e5]; if (!A) return {}; const o = {};
    for (const k of ['snap', 'era5']) if (A[k] && B && B[k]) { const p = A[k], q = B[k], L = x => p[x] == null ? null : p[x] + ((q[x] ?? p[x]) - p[x]) * f;
      const va = [p.speed * Math.sin(p.dir * D2R), p.speed * Math.cos(p.dir * D2R)], vb = [q.speed * Math.sin(q.dir * D2R), q.speed * Math.cos(q.dir * D2R)];
      o[k] = { speed: L('speed'), dir: norm(Math.atan2(va[0] + (vb[0] - va[0]) * f, va[1] + (vb[1] - va[1]) * f) * R2D), cloud: L('cloud'), low: L('low'), vis: L('vis') }; }
    return o; };
}

// ---------- the page
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } }), errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|GL Driver/.test(m.text())) errors.push(m.text()); });
await page.goto(`${BASE}/docklands/?layers=tide,wind,weather&animate=0${WEBGPU ? '' : '&webgl'}${RENDER ? '&shadows=1' : ''}`);
await page.waitForFunction(() => globalThis.__docklands3 && globalThis.__docklands3.ready && globalThis.__tide3, null, { timeout: 240000 });
// three drawn frames after a change (a frame can take seconds in software): the layers' frame hooks evaluate the new clock,
// their asynchronous answers ask for another frame
const settle = (n = 3) => page.evaluate(async n => { const D = __docklands3; if (D.__frames == null) { D.__frames = 0; D.ctx.onFrame(() => D.__frames++); }
  const n0 = D.__frames, t0 = performance.now(); while (D.__frames < n0 + n && performance.now() - t0 < 60000) { D.draw(); await new Promise(r => setTimeout(r, 150)); } }, n);
async function readAt(s) {
  await page.evaluate(s => { const D = __docklands3; D.setClock(D.fromLondon(s)); }, s); await settle();
  return page.evaluate(() => { const D = __docklands3, st = D.sky.state, L = D.sky.sun.position.clone().sub(D.sky.sun.target.position).normalize();
    return { utc: D.ctx.clock, sun: st.sun, moon: st.moon, frac: st.moonPhase, limb: st.moonLimb, night: st.night, light: [L.x, L.y, L.z], moonDisc: D.sky.moonDisc.visible,
      tide: D.STATS.tide && D.STATS.tide.now, wind: D.STATS.surface && D.STATS.surface.wind, weather: D.STATS.weather && D.STATS.weather.now }; });
}

const rows = [], fails = [], warns = [];
const check = (name, err, tol, unit = '', note = '') => { const ok = Math.abs(err) <= tol; rows.push([name, (err >= 0 ? '+' : '') + err.toFixed(unit === 'm' ? 2 : unit === '%' ? 0 : 2) + unit, '±' + tol + unit, ok ? 'ok' : 'FAIL', note]); if (!ok) fails.push(name); };
const info = (name, val, note = '') => rows.push([name, val, '', 'info', note]);
const warn = (name, val, note = '') => { rows.push([name, val, '', 'WARN', note]); warns.push(name); };

// 1. London time to UTC
for (const [s, want, note] of DST) { const got = await page.evaluate(s => __docklands3.fromLondon(s), s); const e = (got - Date.parse(want)) / 6e4; check(`DST ${s} -> ${want}`, e, 0, ' min', note || ''); }

// 2. sun, moon, light, night, wind, weather at each case
const wx = await meteoArchive();
for (const c of CASES) {
  const P = await readAt(c.t), t = P.utc, S = sunRef(t), M = moonRef(t), k = c.t;
  check(`${k} sun az`, dAng(P.sun.az, S.az), TOL.sun, '°', c.why); check(`${k} sun alt (no refraction)`, P.sun.altGeo - S.geo, TOL.sun, '°', `apparent: page ${P.sun.alt.toFixed(2)}°, reference ${S.alt.toFixed(2)}°`);
  check(`${k} moon az`, dAng(P.moon.az, M.az), TOL.moon, '°'); check(`${k} moon alt (no refraction)`, P.moon.altGeo - M.geo, TOL.moon, '°'); check(`${k} moon lit fraction`, P.frac - M.frac, TOL.frac, '', `page ${(P.frac * 100).toFixed(1)}%`);
  if (c.pub) for (const [q, [v, tol]] of Object.entries(c.pub)) { const got = { sunAlt: P.sun.alt, sunAz: P.sun.az, moonAlt: P.moon.alt, moonAz: P.moon.az, frac: P.frac, limb: P.limb }[q]; check(`${k} ${q} vs published ${v}`, /Az|limb/.test(q) ? dAng(got, v) : got - v, tol, /frac/.test(q) ? '' : '°'); }
  const want = dirOf(S.az, S.alt > -1 ? S.alt : P.sun.alt), cos = P.light.reduce((s, v, i) => s + v * want[i], 0); check(`${k} sun light direction`, Math.acos(Math.min(1, cos)) * R2D, TOL.light, '°', `grid az ${norm(Math.atan2(P.light[0], -P.light[2]) * R2D).toFixed(2)} (true ${S.az.toFixed(2)}, convergence ${CONV.toFixed(2)})`);
  if (Math.abs(S.geo + 6) > 0.2) { const ok = P.night === S.geo < -6; rows.push([`${k} night`, String(P.night), 'sun < -6°', ok ? 'ok' : 'FAIL', `sun ${S.geo.toFixed(1)}° (no refraction)`]); if (!ok) fails.push(k + ' night'); }
  rows.push([`${k} moon disc drawn`, String(P.moonDisc), '', P.moonDisc === M.alt > -0.6 ? 'ok' : 'FAIL', `moon ${M.alt.toFixed(1)}°`]); if (P.moonDisc !== M.alt > -0.6) fails.push(k + ' moon disc');
  const W = wx(t), w = P.wind;
  if (!w) warn(`${k} wind`, 'no wind hook');
  else if (/^default/.test(w.source)) warn(`${k} wind`, `${w.speed} m/s from ${w.dir}°`, `the port's default: ${w.source}${W.era5 ? `; ERA5 ${W.era5.speed.toFixed(1)} m/s from ${Math.round(W.era5.dir)}°` : ''}`);
  else for (const [rk, R] of Object.entries(W)) { check(`${k} wind speed vs ${rk}`, w.speed - R.speed, rk === 'snap' ? 0.15 : TOL.windSpeed, ' m/s', w.source); if (R.speed > 2 && w.speed > 2) check(`${k} wind dir vs ${rk}`, dAng(w.dir, R.dir), rk === 'snap' ? 3 : TOL.windDir, '°'); }
  const we = P.weather;
  if (!we) { if (W.era5 || W.snap) warn(`${k} weather`, 'none (fair sky drawn)', `${W.snap ? `snapshot cloud ${Math.round(W.snap.cloud)}%` : ''}${W.era5 ? ` ERA5 cloud ${Math.round(W.era5.cloud)}%, low ${Math.round(W.era5.low)}%` : ''}: no weather data at the page without Open-Meteo ticked`); else info(`${k} weather`, 'none', 'no data'); }
  else for (const [rk, R] of Object.entries(W)) { if (rk === 'snap') check(`${k} cloud vs snap`, we.cover - R.cloud, 1, '%', we.source); else { const e = we.cover - R.cloud; (Math.abs(e) <= TOL.cloud ? info : warn)(`${k} cloud vs era5`, (e >= 0 ? '+' : '') + e.toFixed(0) + '%', `two models: the page shows ${we.source}`); } }
}

// 3. night begins at civil dusk (sun -6°): the page's flag against the reference, 3 October 2026, to the minute
{ const day = '2026-10-03'; let lo = await page.evaluate(d => __docklands3.fromLondon(d + 'T18:00'), day), hi = lo + 3 * 36e5;
  const nightAt = t => page.evaluate(t => { __docklands3.setClock(t); return __docklands3.night; }, t);
  while (hi - lo > 6e4) { const m = Math.round((lo + hi) / 2 / 6e4) * 6e4; if (await nightAt(m)) hi = m; else lo = m; }
  let r0 = lo - 30 * 6e4; while (sunRef(r0).geo > -6 && r0 < hi + 3e6) r0 += 6e4;   // civil dusk: the centre 6 degrees below, no refraction
  check(`night starts ${day} (civil dusk)`, (hi - r0) / 6e4, 1, ' min', `page ${new Date(hi).toISOString().slice(11, 16)}Z, reference ${new Date(r0).toISOString().slice(11, 16)}Z`); }

// 4. tide: the page's level (readings where it has them, else its prediction) and its prediction alone, against EA readings
const EA = await eaReadings();
const days = new Set(); for (const [t] of EA['0003']) days.add(new Date(t).toISOString().slice(0, 10));
const full = [...days].filter(d => EA['0003'].filter(([t]) => new Date(t).toISOString().startsWith(d)).length >= 90);
const rangeOf = d => { const v = EA['0003'].filter(([t]) => new Date(t).toISOString().startsWith(d)).map(r => r[1]); return Math.max(...v) - Math.min(...v); };
const sorted = full.sort((a, b) => rangeOf(b) - rangeOf(a)), tideDays = [...new Set([sorted[0], sorted[sorted.length - 1], '2026-10-03', '2026-10-04'].filter(d => d && full.includes(d)))];
for (const d of tideDays) {
  const t0 = Date.parse(d + 'T00:00Z'), pts = Object.fromEntries(Object.entries(EA).map(([id, r]) => [id, r.filter(([t]) => t >= t0 && t < t0 + 864e5 && !BAD.some(([b, a, z]) => b === id && t >= a && t <= z))]));
  const R = await page.evaluate(({ pts }) => { const T = __tide3, out = {};
    for (const [id, r] of Object.entries(pts)) { const i = T.model.st.findIndex(s => s.id === id); if (i < 0) continue;
      out[id] = r.map(([t, v]) => [t, v, T.model.levels(t)[i], T.levelsAt(t).L[i]]); }
    return out; }, { pts });
  for (const [id, r] of Object.entries(R)) {
    if (!r.length) continue; const ePred = r.map(x => x[2] - x[1]), ePage = r.map(x => x[3] - x[1]), rms = e => Math.sqrt(e.reduce((s, v) => s + v * v, 0) / e.length), mx = e => e.reduce((a, v) => Math.abs(v) > Math.abs(a) ? v : a, 0);
    const name = `${d} ${stationsEA[id]} (range ${rangeOf(d).toFixed(1)} m at Charlton)`;
    check(`${name} prediction (no surge) rms`, rms(ePred), TOL.tideRms, ' m'); check(`${name} prediction (no surge) max`, mx(ePred), TOL.tideMax, ' m');
    info(`${name} page level rms`, rms(ePage).toFixed(2) + ' m', 'the page shows readings where its data hold them');
    // high and low waters: parabola through the reading extremes vs the prediction's (6-minute steps)
    const ext = (s, f) => { const o = []; for (let i = 2; i < s.length - 2; i++) { const v = f(s[i]); if ([-2, -1, 1, 2].every(k => (v >= f(s[i + k])))) o.push([s[i][0], v, 1]); if ([-2, -1, 1, 2].every(k => (v <= f(s[i + k])))) o.push([s[i][0], v, 0]); } return o; };
    const eR = ext(r, x => x[1]), eP = ext(r, x => x[2]);
    for (const e of eR) { const p = eP.filter(q => q[2] === e[2]).sort((a, b) => Math.abs(a[0] - e[0]) - Math.abs(b[0] - e[0]))[0]; if (!p || Math.abs(p[0] - e[0]) > 3 * 36e5) continue;
      const lbl = `${name} ${e[2] ? 'HW' : 'LW'} ${new Date(e[0]).toISOString().slice(11, 16)}Z ${e[1].toFixed(2)} m`;
      check(`${lbl} time`, (p[0] - e[0]) / 6e4, TOL.hwMin, ' min', '15-minute readings: ±8 min resolution'); check(`${lbl} height`, p[1] - e[1], TOL.hwM, ' m'); }
  }
}

// 5. renders: the shadow of a test pole and the moon in a narrow view
if (RENDER) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const px = async buf => { const im = await loadImage(buf), c = createCanvas(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height); };
  const shot = async name => { const b = await page.screenshot({ timeout: 180000 }); writeFileSync(`${OUT}/${name}.png`, b); return px(b); };
  await page.evaluate(() => { for (const id of ['hud', 'bar', 'drawer', 'card', 'surfNote']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } document.querySelectorAll('.label,#labels').forEach(e => e.style.visibility = 'hidden'); });
  // weather off for the renders (cloud dims the shadow and hides the moon: on 4 Oct at noon the snapshot has 66% low cloud)
  await page.evaluate(() => { const W = __docklands3.layers.weather; if (W && W.api.setVisible) W.api.setVisible(false); });
  // a 300 m pole at Mudchute; plan view straight down, north (grid) up
  const T = '2026-10-04T12:00', X = 508, Z = 1589;
  await page.evaluate(({ T, X, Z }) => { const D = __docklands3, g = D.ctx.groundAt(X, Z); D.setClock(D.fromLondon(T)); D.setShadows(true);
    const m = new D.THREE.Mesh(new D.THREE.BoxGeometry(6, 300, 6), new D.THREE.MeshStandardNodeMaterial({ color: 0xff00ff })); m.position.set(X, g + 150, Z); m.castShadow = true; m.name = 'pole'; m.visible = false; D.scene.add(m);
    D.setCam({ tx: X, tz: Z, ty: g, dist: 1400, yaw: 0, pitch: Math.PI / 2 - 1e-4 }); }, { T, X, Z });
  await settle(); const a = await shot('shadow-without-pole');
  await page.evaluate(() => { __docklands3.scene.getObjectByName('pole').visible = true; }); await settle(); const b = await shot('shadow-with-pole');
  const base = await page.evaluate(({ X, Z }) => { const D = __docklands3, v = new D.THREE.Vector3(X, D.ctx.groundAt(X, Z), Z).project(D.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, { X, Z });
  // darker pixels (shadow added by the pole) 30 to 600 px from its foot, by bearing in 2-degree bins: the fullest bin
  const S = sunRef(Date.parse('2026-10-04T11:00Z')), want = norm(S.az + 180 + CONV), bins = new Float64Array(180); let n = 0;
  for (let y = 60; y < a.height - 40; y++) for (let x = 0; x < a.width; x++) { const i = 4 * (y * a.width + x), la = a.data[i] + a.data[i + 1] + a.data[i + 2], lb = b.data[i] + b.data[i + 1] + b.data[i + 2], d = Math.hypot(x - base[0], y - base[1]);
    if (lb < la - 12 && d > 30 && d < 600) { n++; bins[Math.floor(norm(Math.atan2(x - base[0], -(y - base[1])) * R2D) / 2)]++; } }
  const kmax = bins.indexOf(Math.max(...bins));
  if (n > 30) { let sw = 0, sa = 0; for (let k = -2; k <= 2; k++) { const j = (kmax + k + 180) % 180; sw += bins[j]; sa += bins[j] * (2 * (kmax + k) + 1); } const got = norm(sa / sw);
    check(`shadow of a 300 m pole ${T} bearing (grid)`, dAng(got, want), 3, '°', `${n} px darker; ${Math.round(bins[kmax])} in the fullest 2° bin; expected ${want.toFixed(1)}°, length ${(300 / Math.tan(S.alt * D2R)).toFixed(0)} m`); }
  else { rows.push([`shadow of a 300 m pole ${T}`, `${n} px`, '', 'FAIL', 'no shadow found']); fails.push('shadow'); }
  // the moon: a camera 600 m up at Canary Wharf looking at the computed moon, vertical field 4°
  for (const MT of ['2026-09-26T22:00', '2026-10-03T23:56', '2026-10-04T12:00']) {
    const P = await readAt(MT), d = dirOf(P.moon.az, P.moon.alt), dist = 1000, E = [0, 600, 0];
    await page.evaluate(({ d, dist, E }) => { __docklands3.setCam({ tx: E[0] + d[0] * dist, ty: E[1] + d[1] * dist, tz: E[2] + d[2] * dist, dist, yaw: Math.atan2(-d[0], -d[2]), pitch: Math.asin(-d[1]), fov: 4 * Math.PI / 180 }); }, { d, dist, E });
    await settle(); const im = await shot(`moon-${MT.replace(/[:]/g, '')}`);
    // the disc: pixels that differ from the median of the view by more than 12 (of 765), within 150 px of the centre (not the
    // buttons and notes at the edges); its centroid (the lit part pulls it towards the bright limb by up to 0.13 degrees)
    const L = []; for (let y = 150; y < 450; y++) for (let x = 250; x < 550; x++) { const i = 4 * (y * im.width + x); L.push(im.data[i] + im.data[i + 1] + im.data[i + 2]); }
    const med = [...L].sort((p, q) => p - q)[L.length >> 1]; let sx = 0, sy = 0, sw = 0;
    for (let y = 150; y < 450; y++) for (let x = 250; x < 550; x++) { const i = 4 * (y * im.width + x), l = im.data[i] + im.data[i + 1] + im.data[i + 2]; if (Math.abs(l - med) > 12 && Math.hypot(x - 400, y - 300) < 150) { sx += x; sy += y; sw++; } }
    const pxDeg = im.height / 4, ex = sw ? (sx / sw - im.width / 2) / pxDeg : NaN, ey = sw ? (sy / sw - im.height / 2) / pxDeg : NaN;
    if (sw) { const off = Math.hypot(ex, ey); check(`moon drawn at the computed place ${MT}`, off, 0.2, '°', `disc centroid ${ex.toFixed(2)}°, ${ey.toFixed(2)}° from the view centre; ${(P.frac * 100).toFixed(0)}% lit, limb ${P.limb.toFixed(0)}° ${sw} px`); }
    else { rows.push([`moon drawn ${MT}`, 'no disc', '', 'FAIL', '']); fails.push('moon ' + MT); }
  }
}

await browser.close();
// ---------- table
const W = [0, 1, 2, 3].map(i => Math.max(...rows.map(r => String(r[i]).length)));
for (const r of rows) console.log(`${String(r[3]).padEnd(W[3])}  ${String(r[0]).padEnd(W[0])}  ${String(r[1]).padStart(W[1])}  ${String(r[2]).padEnd(W[2])}  ${r[4] || ''}`);
if (errors.length) { console.log('page errors:'); for (const e of errors.slice(0, 10)) console.log('  ' + e.slice(0, 300)); }
console.log(`\n${rows.length} rows, ${fails.length} failed, ${warns.length} warnings${LIVE ? '' : ' (offline: snapshots only; --live adds 4 weeks of EA readings and the Open-Meteo archive)'}. Observer ${LAT.toFixed(3)} N ${(-LON).toFixed(3)} W, grid convergence ${CONV.toFixed(2)}°.`);
process.exit(fails.length || errors.length ? 1 : 0);
