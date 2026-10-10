// Fit tidal harmonic constituents to the Environment Agency 15-minute tidal levels at Tower Pier (0007), Charlton (0003)
// and Silvertown (0001), and write docklands/data/sky/tide-harmonics.json: our own tide prediction for the 3D pages (the
// EA publishes readings only; PLA and UKHO predictions are not open). Method and rules: pipeline.json activity
// "fit-tide-harmonics"; the reasons, the fit quality and the faults: skill docklands-sky, "Tide prediction".
//
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/fit-tide-harmonics.mjs [--archive-days 371] [--archive-step 7] [--archive-weekday 2|all] [--no-fetch]
//
// Two stages. 1, fetch (network, one request at a time): the flood-monitoring API readings (it keeps about four weeks)
// and, for a longer span, one EA daily archive file (readings-YYYY-MM-DD.csv, all stations, about 60 MB, streamed and
// filtered to the three measures) every --archive-step days back to --archive-days; raw lines are cached in
// data/raw/river/tide/ (gitignored) and not fetched again. 2, fit (no network, a function of the cached readings, whose
// SHA-256 is written into the output): cleaning, least squares, validation on held-out days, the output file.
// The astronomy and the nodal corrections are imported from docklands/tide.js, the page's own prediction code.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { TOOLS } from './lib.mjs';
import { RAWD, STATIONS, API, getRetry, fetchArchive as fetchArchiveDay } from './ea-tide-archive.mjs';
import { CONSTITUENTS, argsAt, predict, extremes } from '../../docklands/tide.js';

const OUT = join(TOOLS, '..', 'docklands', 'data', 'sky', 'tide-harmonics.json');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARCH_DAYS = +arg('--archive-days', 371), ARCH_STEP = +arg('--archive-step', 7), FETCH = !process.argv.includes('--no-fetch');
// the fit reads only archive days of one weekday (default 2, Tuesday: the days of the committed fit, k mod 7 = 3 before
// 2026-10-09), so that days cached by build-tide-history.mjs (every day) and the held-out days of history-check.mjs stay
// out of the fit; --archive-weekday all reads every cached day
const WEEKDAY = arg('--archive-weekday', '2');
const day = t => new Date(t).toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const onWeekday = d => WEEKDAY === 'all' || new Date(d + 'T00:00Z').getUTCDay() === +WEEKDAY;

// ---------- 1. fetch
async function fetchApi() {
  const today = day(Date.now()), f = join(RAWD, `api-${today}.json`);
  if (existsSync(f)) return; const out = { fetched: new Date().toISOString(), stations: {} };
  for (const id of Object.keys(STATIONS)) {
    const s = JSON.parse(await getRetry(`${API}/id/stations/${id}`)).items;
    const u = `${API}/id/measures/${id}-level-tidal_level-i-15_min-mAOD/readings?startdate=${day(Date.now() - 45 * 864e5)}&enddate=${today}&_sorted&_limit=10000`;
    const R = JSON.parse(await getRetry(u)).items.map(x => [x.dateTime, x.value]);
    out.stations[id] = { name: STATIONS[id], lat: s.lat, lon: s.long, url: u, readings: R };
    console.log(`api ${id} ${STATIONS[id]}: ${R.length} readings`); await sleep(500);
  }
  writeFileSync(f, JSON.stringify(out));
}
// one archive day (ea-tide-archive.mjs: streamed, filtered to the three measures, cached)
async function fetchArchive(d) { const n = await fetchArchiveDay(d); if (n !== 'cached') console.log(`archive ${d}: ${n === 'none' ? 'none' : n + ' lines'}`); }
if (FETCH) {
  await fetchApi();
  for (let k = 10, n = 0; k <= ARCH_DAYS; k++) { const d = day(Date.now() - k * 864e5); if (WEEKDAY === 'all' ? (k - 10) % ARCH_STEP === 0 : onWeekday(d) && n++ % Math.max(1, ARCH_STEP / 7) === 0) await fetchArchive(d); }
}

// ---------- 2. fit (from the cached files only)
const files = readdirSync(RAWD).filter(f => /^(api|archive)-\d{4}-\d\d-\d\d\.(json|csv)$/.test(f) && (f.startsWith('api-') || onWeekday(f.slice(8, 18)))).sort();
const apiFile = files.filter(f => f.startsWith('api-')).pop(); if (!apiFile) throw new Error('no API readings cached: run without --no-fetch');
const hash = createHash('sha256'), R = {}, meta = {};
for (const id of Object.keys(STATIONS)) R[id] = new Map();
const api = JSON.parse(readFileSync(join(RAWD, apiFile), 'utf8')); hash.update(readFileSync(join(RAWD, apiFile)));
for (const [id, s] of Object.entries(api.stations)) { meta[id] = { name: s.name, lat: s.lat, lon: s.lon }; for (const [t, v] of s.readings) if (typeof v === 'number') R[id].set(Date.parse(t), v); }
const archiveDays = [];
for (const f of files.filter(f => f.startsWith('archive-'))) {
  const txt = readFileSync(join(RAWD, f), 'utf8'); hash.update(txt); if (!txt.trim()) continue; archiveDays.push(f.slice(8, 18));
  for (const L of txt.split('\n')) { const [t, m, v] = L.split(','); if (!m) continue; const id = m.match(/measures\/(\d{4})-/)?.[1], x = parseFloat(v); if (id && R[id] && isFinite(x) && !R[id].has(Date.parse(t))) R[id].set(Date.parse(t), x); }
}
const rawSha = hash.digest('hex');
// cleaning 1: the gauge-comparison rule of docklands/sky.js cleanGauges (fault F21): drop a reading whose difference from
// the nearest other gauge departs more than 0.45 m from the median of that difference over 2 h either side
const ll = id => [meta[id].lat, meta[id].lon * 0.62];
const nearest = id => Object.keys(STATIONS).filter(k => k !== id).sort((a, b) => { const p = ll(id), q = ll(a), r = ll(b); return ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2) - ((p[0] - r[0]) ** 2 + (p[1] - r[1]) ** 2); })[0];
const clean = {}, dropped = {};
for (const id of Object.keys(STATIONS)) {
  const ref = R[nearest(id)], T = [...R[id].keys()].sort((a, b) => a - b), d = T.map(t => ref.has(t) ? R[id].get(t) - ref.get(t) : null);
  const keep = []; let j0 = 0;
  for (let i = 0; i < T.length; i++) {
    if (d[i] == null) { keep.push([T[i], R[id].get(T[i])]); continue; }
    while (T[j0] < T[i] - 72e5) j0++; const w = []; for (let j = j0; j < T.length && T[j] <= T[i] + 72e5; j++) if (d[j] != null) w.push(d[j]);
    w.sort((a, b) => a - b); if (Math.abs(d[i] - w[w.length >> 1]) <= 0.45) keep.push([T[i], R[id].get(T[i])]);
  }
  clean[id] = keep; dropped[id] = { gauge_compare: T.length - keep.length };
}
// constituents: in priority order; one is kept only if it is separated from every kept one over the span (Rayleigh, R = 1)
const SPEED = [14.4920521, 0.5490165, 0.0410686, 0.0046418, 0.0022064, 0.0000020];   // deg/h of tau, s, h, p, N', p1
const speed = k => { const C = CONSTITUENTS[k]; if (C.c) return Object.entries(C.c).reduce((s, [m, n]) => s + n * speed(m), 0); return C.d.reduce((s, n, i) => s + n * SPEED[i], 0); };
const PRIORITY = ['M2', 'S2', 'N2', 'K1', 'O1', 'M4', 'MS4', 'MN4', 'M6', 'K2', 'P1', 'L2', 'NU2', 'MU2', '2N2', 'Q1', 'MK4', 'S4', '2MS6', '2MN6', 'M3', 'MK3', 'MO3', 'J1', 'OO1', 'M8', '3MS8', '2SM6', 'T2', 'MSf', 'Mf', 'Mm', 'Ssa', 'Sa'];
const REQUIRED = ['M2', 'S2', 'N2', 'K2', 'K1', 'O1', 'P1', 'M4', 'MS4', 'MN4', 'M6'];
function pick(spanH) { const kept = []; const why = {};
  for (const k of PRIORITY) { const bad = kept.find(m => Math.abs(speed(k) - speed(m)) * spanH < 360); if (bad) why[k] = `not separated from ${bad} over ${(spanH / 24).toFixed(0)} days`; else kept.push(k); }
  return { kept, why }; }
// least squares by the normal equations (Cholesky); columns 1, f cos(V+u), f sin(V+u)
function fit(obs, names) {
  const n = 1 + 2 * names.length, M = new Float64Array(n * n), b = new Float64Array(n), row = new Float64Array(n);
  for (const [t, v] of obs) {
    const A = argsAt(t, names); row[0] = 1; names.forEach((k, i) => { const a = A[k].V * Math.PI / 180; row[1 + 2 * i] = A[k].f * Math.cos(a); row[2 + 2 * i] = A[k].f * Math.sin(a); });
    for (let i = 0; i < n; i++) { const ri = row[i]; b[i] += ri * v; for (let j = 0; j <= i; j++) M[i * n + j] += ri * row[j]; }
  }
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = M[i * n + j]; for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k]; if (i === j) { if (s <= 0) throw new Error('singular fit'); L[i * n + i] = Math.sqrt(s); } else L[i * n + j] = s / L[j * n + j]; }
  const y = new Float64Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  const x = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  const h = {}; names.forEach((k, i) => { const c = x[1 + 2 * i], s = x[2 + 2 * i]; h[k] = [+Math.hypot(c, s).toFixed(4), +(((Math.atan2(s, c) * 180 / Math.PI) % 360 + 360) % 360).toFixed(2)]; });
  return { z0: +x[0].toFixed(4), h };
}
const stats = (S, obs) => { let s2 = 0, mx = 0; const res = []; for (const [t, v] of obs) { const r = v - predict(S, t); s2 += r * r; mx = Math.max(mx, Math.abs(r)); res.push(Math.abs(r)); } res.sort((a, b) => a - b);
  return { n: obs.length, rms: +Math.sqrt(s2 / Math.max(1, obs.length)).toFixed(3), max: +mx.toFixed(3), p95: +(res[Math.floor(0.95 * (res.length - 1))] || 0).toFixed(3) }; };
// high and low waters in the readings (a local extreme over 3 h either side; a parabola through three readings) against the prediction
function extremeErrors(S, obs) {
  const E = []; let j0 = 0, j1 = 0;
  for (let i = 0; i < obs.length; i++) { const [t, v] = obs[i]; while (obs[j0][0] < t - 3 * 36e5) j0++; while (j1 + 1 < obs.length && obs[j1 + 1][0] <= t + 3 * 36e5) j1++;
    if (obs[j0][0] > t - 2.5 * 36e5 || obs[j1][0] < t + 2.5 * 36e5) continue;   // the whole window must have readings
    let hi = true, lo = true; for (let j = j0; j <= j1; j++) { if (obs[j][1] > v) hi = false; if (obs[j][1] < v) lo = false; }
    if (hi || lo) E.push({ t, v, hw: hi }); }
  const P = extremes(S, obs[0][0] - 36e5, obs[obs.length - 1][0] + 36e5), out = { hw: [], lw: [] };
  for (const e of E.filter((e, i) => !E[i - 1] || E[i - 1].hw !== e.hw || e.t - E[i - 1].t > 4 * 36e5)) {
    const p = P.filter(q => q.hw === e.hw).sort((a, b) => Math.abs(a.t - e.t) - Math.abs(b.t - e.t))[0]; if (!p || Math.abs(p.t - e.t) > 3 * 36e5) continue;
    (e.hw ? out.hw : out.lw).push([(p.t - e.t) / 60e3, p.v - e.v]);
  }
  const mae = (a, k) => a.length ? +(a.reduce((s, q) => s + Math.abs(q[k]), 0) / a.length).toFixed(k ? 3 : 0) : null;
  return { hw_n: out.hw.length, hw_time_mae_min: mae(out.hw, 0), hw_height_mae_m: mae(out.hw, 1), lw_n: out.lw.length, lw_time_mae_min: mae(out.lw, 0), lw_height_mae_m: mae(out.lw, 1) };
}
// held-out windows: 3 and 4 October 2026 (the owner's photo evening; the snapshot tide-2026-10-03.json) and the last 48 h
const lastT = Math.max(...Object.values(clean).map(o => o.length ? o[o.length - 1][0] : 0));
const HOLD = [[Date.parse('2026-10-03T00:00Z'), Date.parse('2026-10-05T00:00Z')], [lastT - 48 * 36e5, lastT + 1]];
const held = t => HOLD.some(([a, b]) => t >= a && t < b);
const out = { source: 'Environment Agency real-time flood-monitoring API, tidal level readings (15-minute instantaneous, m AOD): the API readings and the daily archive files',
  url: 'https://environment.data.gov.uk/flood-monitoring/doc/reference', licence: 'OGL v3.0', attribution: 'This uses Environment Agency flood and river level data from the real-time data API (Beta)',
  produced_by: 'cwplans/tools/fit-tide-harmonics.mjs', made: new Date().toISOString(), raw_sha256: rawSha,
  method: 'Least squares fit of a mean (z0) and harmonic constituents to the cleaned readings of each gauge; equilibrium arguments from mean longitudes (Meeus), tau = 15 deg/h x UT + h - s; nodal factors f and u by the formulas of Pugh (1987, table 4.3, after Schureman), compound tides as sums and products of their parts, L2 with the M2 factors (a simplification); phases g are lags on these arguments (not Admiralty phases). Level = z0 + sum f H cos(V + u - g). Not a prediction of surges or river flow: the residual is the weather and the river.',
  cleaning: 'A reading is dropped when its difference from the nearest other gauge departs more than 0.45 m from the median of that difference over 2 h either side (docklands/sky.js cleanGauges, fault F21), and after a first fit when its residual is over 1.2 m (gauge faults; also removes the largest surges).',
  validation_note: 'Held-out windows: 3 and 4 October 2026 (UTC) and the last 48 h of readings; the fit for validation leaves them out, the constituents in this file use all readings.',
  stations: {}, check: [] };
for (const id of Object.keys(STATIONS)) {
  const all = clean[id]; if (all.length < 96 * 10) { console.log(`${id}: too few readings (${all.length})`); continue; }
  const span = (all[all.length - 1][0] - all[0][0]) / 36e5, { kept, why } = pick(span);
  for (const k of REQUIRED) if (!kept.includes(k)) console.log(`${id}: required constituent ${k} left out: ${why[k]}`);
  let S = fit(all.filter(o => !held(o[0])), kept);
  const train0 = all.filter(o => !held(o[0])), res = train0.filter(([t, v]) => Math.abs(v - predict(S, t)) > 1.2).length;
  const keep = all.filter(([t, v]) => Math.abs(v - predict(S, t)) <= 1.2); dropped[id].residual_over_1_2m = all.length - keep.length;
  S = fit(keep.filter(o => !held(o[0])), kept);
  const val = HOLD.map(([a, b]) => { const o = keep.filter(q => q[0] >= a && q[0] < b); return o.length ? { from: new Date(a).toISOString().slice(0, 16) + 'Z', to: new Date(Math.min(b, lastT)).toISOString().slice(0, 16) + 'Z', ...stats(S, o), ...extremeErrors(S, o) } : null; }).filter(Boolean);
  const F = fit(keep, kept), st = stats(F, keep);
  const days = new Set(keep.map(o => day(o[0])));
  out.stations[id] = { name: meta[id].name, lat: meta[id].lat, lon: meta[id].lon, z0: F.z0, h: F.h,
    fit: { from: new Date(keep[0][0]).toISOString().slice(0, 16) + 'Z', to: new Date(keep[keep.length - 1][0]).toISOString().slice(0, 16) + 'Z', days_with_readings: days.size, readings: keep.length, dropped: dropped[id], ...st, ...extremeErrors(F, keep), constituents: kept.length, left_out: why },
    validation: val };
  console.log(`${id} ${meta[id].name}: ${keep.length} readings on ${days.size} days, ${kept.length} constituents, rms ${st.rms} m, max ${st.max} m; M2 ${F.h.M2}, S2 ${F.h.S2}; held out: ${val.map(v => `${v.from} rms ${v.rms} max ${v.max} HW ${v.hw_height_mae_m} m ${v.hw_time_mae_min} min`).join('; ')}`);
}
// recent readings (the last 7 days, cleaned) so the page shows a measured level where it has one; and check values of the page's code
const r0 = Math.floor((lastT - 7 * 864e5) / 9e5) * 9e5;
out.recent = { start: new Date(r0).toISOString(), step_min: 15, note: 'cleaned readings, m AOD; null = none', stations: {} };
for (const id of Object.keys(out.stations)) { const m = new Map(clean[id]), v = []; for (let t = r0; t <= lastT; t += 9e5) v.push(m.has(t) ? m.get(t) : null); out.recent.stations[id] = v; }
for (let t = Date.parse('2026-10-10T00:00Z'); t <= Date.parse('2026-10-11T00:00Z'); t += 6 * 36e5) out.check.push([new Date(t).toISOString(), ...Object.keys(out.stations).map(id => +predict(out.stations[id], t).toFixed(4))]);
out.check_columns = ['time', ...Object.keys(out.stations)];
writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(`wrote docklands/data/sky/tide-harmonics.json (${(JSON.stringify(out).length / 1024).toFixed(1)} KB); raw sha256 ${rawSha.slice(0, 16)}`);
