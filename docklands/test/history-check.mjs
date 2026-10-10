// History check of the Three.js port's tide, wind and weather sources against observations that the page does not use:
// - tide: docklands/tide.js prediction (cwplans/docklands/data/sky/tide-harmonics.json) vs Environment Agency 15-minute
//   readings (OGL v3.0) on HELD-OUT days: EA daily archive files of days that the fit did not read (the fit read the API's
//   last weeks and one archive day in seven, at 10, 17, 24 ... days before 2026-10-09; here days 42, 77, ... before it),
//   plus the API's last 4 weeks (in the fit: reported apart). Rms, max, high- and low-water time and height errors.
// - tide nowcast: the page's level (tide.js nowcast: readings, else prediction + the nearest reading's residual, fading)
//   with readings up to a cut-off, against the prediction alone, by lead time; high and low waters in the next 12 h.
// - wind and cloud: the page's data sources for a clock time (the committed snapshot weather-2026-10-03.json, the hourly
//   cache runs cwplans/cache/runs/, the Open-Meteo forecast API past hours, the Open-Meteo archive ERA5) vs the METARs of
//   London City Airport (EGLC, 2 km east of Canary Wharf) from the Iowa Environmental Mesonet ASOS archive. Wind speed and
//   direction errors, cloud class agreement, rain agreement.
// - tide history: cwplans/docklands/data/sky/tide-history.json against the readings fetched here on their own, and the
//   page's level from it on the held-out days.
// Node only (no browser; the page's interpolation is checked by clock-check.mjs). Raw answers are cached in
// docklands/test/out/history-cache/ (git-ignored). Run from the repository root:
//   NODE_USE_ENV_PROXY=1 node docklands/test/history-check.mjs [--json docklands/test/out/audit/history.json]
// Results and their reading: docklands/AUDIT.md, item 1. Skill: docklands-sky, "Three.js port clock".
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { predict, extremes, extremesNear, nowcast, mergeReadings, historyReadings, SURGE } from '../tide.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CACHE = 'docklands/test/out/history-cache'; mkdirSync(CACHE, { recursive: true });
const UA = 'londat docklands history-check (https://github.com/danbri/londat)';
const D2R = Math.PI / 180, norm = a => ((a % 360) + 360) % 360, dAng = (a, b) => { const d = norm(a - b); return d > 180 ? d - 360 : d; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rms = e => Math.sqrt(e.reduce((s, v) => s + v * v, 0) / e.length), mae = e => e.reduce((s, v) => s + Math.abs(v), 0) / e.length, mean = e => e.reduce((s, v) => s + v, 0) / e.length;
const r2 = v => Math.round(v * 100) / 100;
async function cached(name, url, { text = false } = {}) {
  const f = `${CACHE}/${name}`; if (existsSync(f)) return text ? readFileSync(f, 'utf8') : JSON.parse(readFileSync(f, 'utf8'));
  for (let k = 0; k < 3; k++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } }).catch(e => ({ ok: false, status: String(e.cause?.code || e.message) }));
    if (r.ok) { const b = await r.text(); writeFileSync(f, b); return text ? b : JSON.parse(b); }
    if (r.status === 429 || r.status === 404) { const why = r.text ? (await r.text()).slice(0, 160) : ''; return { _error: `HTTP ${r.status} ${why}` }; }
    await sleep(2000 * (k + 1));
  }
  return { _error: 'no answer' };
}
const OUT = {};

// ======================= 1. tide
const H = JSON.parse(readFileSync('cwplans/docklands/data/sky/tide-harmonics.json', 'utf8'));
const ST = { '0007': 'Tower Pier', '0003': 'Charlton', '0001': 'Silvertown' };
const FIT_REF = Date.parse('2026-10-09T00:00Z');
const heldOut = [42, 77, 126, 175, 224, 273, 329].map(k => new Date(FIT_REF - k * 864e5).toISOString().slice(0, 10));   // k mod 7 = 0: never a fit day (k mod 7 = 3)
const days = {};   // day -> id -> [[t, v]]
for (const d of heldOut) {
  const f = `${CACHE}/ea-archive-${d}.csv`;
  if (!existsSync(f)) {
    const r = await fetch(`https://environment.data.gov.uk/flood-monitoring/archive/readings-${d}.csv`, { headers: { 'User-Agent': UA } });
    if (!r.ok) { console.log(`EA archive ${d}: HTTP ${r.status}`); continue; }
    const dec = new TextDecoder(); let buf = '', keep = [];
    for await (const ch of r.body) { buf += dec.decode(ch, { stream: true }); let i; while ((i = buf.indexOf('\n')) >= 0) { const L = buf.slice(0, i); buf = buf.slice(i + 1); if (/\/(0007|0003|0001)-level-tidal_level-i-15_min-mAOD,/.test(L)) keep.push(L.trim()); } }
    writeFileSync(f, keep.join('\n') + '\n');
  }
  days[d] = {};
  for (const L of readFileSync(f, 'utf8').split('\n')) { const [t, m, v] = L.split(','); const id = m && m.match(/measures\/(\d{4})-/)?.[1], x = parseFloat(v); if (id && isFinite(x)) (days[d][id] ||= []).push([Date.parse(t), x]); }
}
// the API's last 4 weeks (inside the fit's period)
const since = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10), api = {};
for (const id of Object.keys(ST)) {
  const J = await cached(`ea-api-${id}-${since}.json`, `https://environment.data.gov.uk/flood-monitoring/id/measures/${id}-level-tidal_level-i-15_min-mAOD/readings?since=${since}T00:00:00Z&_sorted&_limit=10000`);
  if (J._error) { console.log(`EA API ${id}: ${J._error}`); continue; }
  for (const it of J.items) if (typeof it.value === 'number') { const t = Date.parse(it.dateTime), d = new Date(t).toISOString().slice(0, 10); ((api[d] ||= {})[id] ||= []).push([t, it.value]); }
}
// faulty readings: the gauge-comparison rule of the fit (difference from the nearest gauge more than 0.45 m off its 4 h median)
function clean(D) {
  const ids = Object.keys(D).filter(id => D[id].length > 40); const M = Object.fromEntries(ids.map(id => [id, new Map(D[id])]));
  const nb = { '0007': '0001', '0001': '0003', '0003': '0001' }, out = {};
  for (const id of ids) { const o = nb[id]; if (!M[o]) { out[id] = D[id]; continue; }
    const diff = D[id].map(([t, v]) => [t, M[o].has(t) ? v - M[o].get(t) : null]);
    out[id] = D[id].filter(([t], i) => { const w = diff.filter(([s, x]) => x != null && Math.abs(s - t) <= 2 * 36e5).map(x => x[1]).sort((a, b) => a - b); if (!w.length || diff[i][1] == null) return true; return Math.abs(diff[i][1] - w[w.length >> 1]) <= 0.45; }); }
  return out;
}
function tideDay(D) {
  const C = clean(D), res = {};
  for (const [id, r] of Object.entries(C)) {
    const S = H.stations[id]; if (!S || r.length < 60) continue;
    const e = r.map(([t, v]) => predict(S, t) - v);
    // extremes of the readings: a local max or min over +-4 readings (1 h), then a parabola; the prediction's own extremes
    const ext = []; for (let i = 4; i < r.length - 4; i++) { const v = r[i][1], w = [-4, -3, -2, -1, 1, 2, 3, 4].map(k => r[i + k][1]);   // +-1 h: a stand or a gauge wobble is not a second high water
      if (r[i + 4][0] - r[i - 4][0] > 135 * 6e4) continue;
      const hw = w.every(x => v >= x), lw = w.every(x => v <= x); if (!hw && !lw) continue;
      const a = r[i - 1][1], c = r[i + 1][1], den = a - 2 * v + c, dx = den ? 0.5 * (a - c) / den : 0; ext.push({ t: r[i][0] + dx * 15 * 6e4, v: v - 0.25 * (a - c) * dx, hw }); }
    const ex = []; for (const x of ext) if (!ex.some(y => y.hw === x.hw && Math.abs(y.t - x.t) < 3 * 36e5)) ex.push(x);
    const P = extremes(S, r[0][0] - 3 * 36e5, r[r.length - 1][0] + 3 * 36e5), hwT = [], hwH = [], lwT = [], lwH = [];
    for (const x of ex) { const p = P.filter(q => q.hw === x.hw).sort((a, b) => Math.abs(a.t - x.t) - Math.abs(b.t - x.t))[0]; if (!p || Math.abs(p.t - x.t) > 3 * 36e5) continue;
      (x.hw ? hwT : lwT).push((p.t - x.t) / 6e4); (x.hw ? hwH : lwH).push(p.v - x.v); }
    const vals = r.map(x => x[1]);
    res[id] = { n: r.length, dropped: D[id].length - r.length, range: r2(Math.max(...vals) - Math.min(...vals)), rms: r2(rms(e)), bias: r2(mean(e)), max: r2(e.reduce((a, v) => Math.abs(v) > Math.abs(a) ? v : a, 0)),
      hw: hwT.length ? { n: hwT.length, timeMaeMin: Math.round(mae(hwT)), timeMaxMin: Math.round(Math.max(...hwT.map(Math.abs))), heightMae: r2(mae(hwH)) } : null,
      lw: lwT.length ? { n: lwT.length, timeMaeMin: Math.round(mae(lwT)), timeMaxMin: Math.round(Math.max(...lwT.map(Math.abs))), heightMae: r2(mae(lwH)) } : null };
  }
  return res;
}
for (const D of [...Object.values(api), ...Object.values(days)]) for (const r of Object.values(D)) r.sort((a, b) => a[0] - b[0]);   // the API's _sorted is newest first; the archive files are not in time order
OUT.tideHeldOut = {}; for (const [d, D] of Object.entries(days)) OUT.tideHeldOut[d] = tideDay(D);
OUT.tideApi = {}; for (const [d, D] of Object.entries(api)) if (Object.values(D).every(r => r.length >= 90)) OUT.tideApi[d] = tideDay(D);
function summ(block) {
  const all = Object.values(block).flatMap(o => Object.entries(o)), by = {};
  for (const [id, x] of all) { const b = (by[ST[id]] ||= { days: 0, rms: [], max: 0, hwT: [], hwH: [], lwT: [], lwH: [], hwTmax: 0 });
    b.days++; b.rms.push(x.rms); if (Math.abs(x.max) > Math.abs(b.max)) b.max = x.max;
    if (x.hw) { b.hwT.push(x.hw.timeMaeMin); b.hwH.push(x.hw.heightMae); b.hwTmax = Math.max(b.hwTmax, x.hw.timeMaxMin); } if (x.lw) { b.lwT.push(x.lw.timeMaeMin); b.lwH.push(x.lw.heightMae); } }
  return Object.fromEntries(Object.entries(by).map(([k, b]) => [k, { days: b.days, rmsMean: r2(mean(b.rms)), rmsWorst: r2(Math.max(...b.rms)), maxAbs: b.max, hwTimeMaeMin: Math.round(mean(b.hwT)), hwTimeWorstMin: b.hwTmax, hwHeightMae: r2(mean(b.hwH)), lwTimeMaeMin: Math.round(mean(b.lwT)), lwHeightMae: r2(mean(b.lwH)) }]));
}
OUT.tideSummary = { heldOut: summ(OUT.tideHeldOut), api4weeks: summ(OUT.tideApi) };

// ======================= 1b. nowcast: the page's level with readings up to a cut-off time T0 (docklands/tide.js nowcast:
// readings in range, else prediction + the nearest reading's residual, fading) against the prediction alone, at the times
// after T0. API set: a cut-off every 2 h over the 4 weeks, leads to 48 h. Held-out days: cut-offs 06, 09 and 12 UTC, leads to
// the day's end. High and low waters within 12 h after T0: time and height errors (the page's rule: tide.js extremesNear).
// In range: every other reading left out, the page's interpolation of the rest at the left-out times (30-minute gaps).
const BINS = [[0, 1], [1, 3], [3, 6], [6, 12], [12, 24], [24, 48]];
function readingExtremes(r) {   // as tideDay: +-1 h local extremes of the readings, parabola
  const ext = []; for (let i = 4; i < r.length - 4; i++) { const v = r[i][1], w = [-4, -3, -2, -1, 1, 2, 3, 4].map(k => r[i + k][1]); if (r[i + 4][0] - r[i - 4][0] > 135 * 6e4) continue;
    const hw = w.every(x => v >= x), lw = w.every(x => v <= x); if (!hw && !lw) continue; const a = r[i - 1][1], c = r[i + 1][1], den = a - 2 * v + c, dx = den ? 0.5 * (a - c) / den : 0; ext.push({ t: r[i][0] + dx * 15 * 6e4, v: v - 0.25 * (a - c) * dx, hw }); }
  const ex = []; for (const x of ext) if (!ex.some(y => y.hw === x.hw && Math.abs(y.t - x.t) < 3 * 36e5)) ex.push(x); return ex; }
function nowcastSet(name, sets) {   // sets: [{ id, R (cleaned, sorted), cuts }]
  const acc = BINS.map(() => ({ p: [], n: [] })), hw = { pT: [], nT: [], pH: [], nH: [] }, lw = { pT: [], nT: [], pH: [], nH: [] }, gap = [];
  for (const { id, R, cuts } of sets) { const S = H.stations[id];
    for (let i = 1; i + 1 < R.length; i += 2) { const sub = [R[i - 1], R[i + 1]]; if (sub[1][0] - sub[0][0] > 31 * 6e4) continue; gap.push(nowcast(S, sub, R[i][0]).v - R[i][1]); }
    const ex = readingExtremes(R);
    for (const T0 of cuts) { const known = R.filter(x => x[0] <= T0); if (known.length < 20 || T0 - known[known.length - 1][0] > 30 * 6e4) continue;
      for (const [t, v] of R) { if (t <= T0) continue; const L = (t - T0) / 36e5, b = BINS.findIndex(([a, c]) => L > a && L <= c); if (b < 0) continue; acc[b].p.push(predict(S, t) - v); acc[b].n.push(nowcast(S, known, t).v - v); }
      const PE = extremes(S, T0, T0 + 13 * 36e5), NE = extremesNear(t => nowcast(S, known, t).v, PE);
      for (const x of ex) { if (x.t <= T0 + 15 * 6e4 || x.t > T0 + 12 * 36e5) continue; const near = L => L.filter(q => q.hw === x.hw).sort((a, b) => Math.abs(a.t - x.t) - Math.abs(b.t - x.t))[0];
        const p = near(PE), n = near(NE); if (!p || !n || Math.abs(p.t - x.t) > 3 * 36e5 || Math.abs(n.t - x.t) > 3 * 36e5) continue; const o = x.hw ? hw : lw;
        o.pT.push((p.t - x.t) / 6e4); o.nT.push((n.t - x.t) / 6e4); o.pH.push(p.v - x.v); o.nH.push(n.v - x.v); } } }
  const ext = o => o.pT.length ? { n: o.pT.length, timeMaeMin: [Math.round(mae(o.pT)), Math.round(mae(o.nT))], heightMae: [r2(mae(o.pH)), r2(mae(o.nH))], heightBias: [r2(mean(o.pH)), r2(mean(o.nH))], heightWorst: [r2(Math.max(...o.pH.map(Math.abs))), r2(Math.max(...o.nH.map(Math.abs)))] } : null;
  return { set: name, inRangeRms30min: gap.length ? r2(rms(gap) * 100) / 100 : null, inRangeN: gap.length,
    leads: Object.fromEntries(BINS.map(([a, c], b) => [`${a}-${c} h`, acc[b].p.length ? { n: acc[b].p.length, rmsPrediction: r2(rms(acc[b].p) * 1000) / 1000, rmsPage: r2(rms(acc[b].n) * 1000) / 1000 } : null]).filter(([, v]) => v)),
    hw12h: ext(hw), lw12h: ext(lw), note: '[prediction, page]' };
}
{ const apiSets = [], dSets = [];
  for (const id of Object.keys(ST)) { const R = mergeReadings(H.stations[id], ...Object.values(api).map(D => D[id] || [])); if (R.length) apiSets.push({ id, R, cuts: R.filter((x, i) => i % 8 === 0).map(x => x[0]) }); }
  for (const [d, D] of Object.entries(days)) { const C = clean(D); for (const [id, r] of Object.entries(C)) if (H.stations[id]) { const R = mergeReadings(H.stations[id], r); dSets.push({ id, R, cuts: [6, 9, 12].map(h => Date.parse(d + 'T00:00Z') + h * 36e5) }); } }
  OUT.nowcast = { params: { ...SURGE }, api4weeks: nowcastSet('EA API last 4 weeks (in the fit period)', apiSets), heldOut: nowcastSet('held-out EA archive days', dSets),
    winter: nowcastSet('held-out winter days (14 Nov, 9 Jan, 27 Feb)', dSets.filter((s, i) => /^(2025-11-14|2026-01-09|2026-02-27)/.test(new Date(s.cuts[0]).toISOString()))) }; }

// ======================= 1c. archive history: cwplans/docklands/data/sky/tide-history.json (build-tide-history.mjs, the EA
// daily archive files, whole cm) against the readings fetched here on their own (the held-out archive days above, the API's
// last 4 weeks): same-time differences; and the page's level on the held-out days from the history alone (every other
// reading left out, tide.js nowcast at the left-out times) against the prediction alone at the same times.
if (existsSync('cwplans/docklands/data/sky/tide-history.json')) {
  const HS = JSON.parse(readFileSync('cwplans/docklands/data/sky/tide-history.json', 'utf8')), hist = {}, cmp = { heldOut: [], api4weeks: [] }, pageE = [], predE = [];
  for (const id of Object.keys(ST)) hist[id] = new Map(historyReadings(HS, id));
  const diff = (D, into) => { for (const [id, r] of Object.entries(D)) for (const [t, v] of r) if (hist[id] && hist[id].has(t)) into.push(hist[id].get(t) - v); };
  for (const D of Object.values(days)) diff(D, cmp.heldOut); for (const D of Object.values(api)) diff(D, cmp.api4weeks);
  for (const [d, D] of Object.entries(days)) for (const [id, r] of Object.entries(clean(D))) { const S = H.stations[id]; if (!S) continue;
    const a = Date.parse(d + 'T00:00Z') - 864e5, b = a + 3 * 864e5, HR = historyReadings(HS, id).filter(([t]) => t >= a && t < b);
    const keep = mergeReadings(S, HR.filter(([t]) => Math.round(t / 9e5) % 2 === 0));
    for (const [t, v] of r) if (Math.round(t / 9e5) % 2 === 1) { pageE.push(nowcast(S, keep, t).v - v); predE.push(predict(S, t) - v); } }
  const st = e => e.length ? { n: e.length, rms: Math.round(rms(e) * 1000) / 1000, maxAbs: Math.round(Math.max(...e.map(Math.abs)) * 1000) / 1000 } : null;
  OUT.tideHistory = { file: { from: HS.days.from, to: HS.days.to, archive_missing: HS.days.archive_missing, raw_sha256: HS.raw_sha256,
      gauges: Object.fromEntries(Object.entries(HS.stations).map(([id, s]) => [id, { readings: s.readings, share: s.share, longest_gap_h: s.longest_gap_h, days_without_readings: s.days_without_readings.length }])) },
    vsIndependent: { heldOut: st(cmp.heldOut), api4weeks: st(cmp.api4weeks) },
    heldOutPage: { note: 'the page level from the history with every other reading left out, at the left-out times (m)', page: st(pageE), prediction: st(predE) } };
}

// ======================= 2. wind and cloud vs EGLC METAR
const WDAYS = ['2025-12-21', '2026-03-15', '2026-06-21', '2026-08-28', '2026-09-12', '2026-09-20', '2026-09-29', '2026-10-03', '2026-10-04', '2026-10-06', '2026-10-08'];
const cover = c => ({ NCD: 0, NSC: 0, CLR: 0, SKC: 0, CAVOK: 0, VV: 100, FEW: 19, SCT: 44, BKN: 75, OVC: 100 })[c];
async function metar(d) {
  const [y, m, dd] = d.split('-').map(Number), e = new Date(Date.parse(d) + 864e5);
  const txt = await cached(`metar-EGLC-${d}.csv`, `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=EGLC&data=sknt&data=drct&data=skyc1&data=skyc2&data=skyc3&data=wxcodes&year1=${y}&month1=${m}&day1=${dd}&year2=${e.getUTCFullYear()}&month2=${e.getUTCMonth() + 1}&day2=${e.getUTCDate()}&tz=Etc/UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3`, { text: true });
  if (typeof txt !== 'string') return [];
  return txt.trim().split('\n').slice(1).map(L => L.split(',')).map(([, valid, sknt, drct, c1, c2, c3, wx]) => {
    const cs = [c1, c2, c3].map(cover).filter(v => v != null);
    return { t: Date.parse(valid.replace(' ', 'T') + 'Z'), speed: sknt === 'M' ? null : +sknt * 0.514444, dir: drct === 'M' ? null : +drct, cloud: cs.length ? Math.max(...cs) : null, rain: /RA|DZ|SN|SH/.test(wx || '') };
  }).filter(o => isFinite(o.t));
}
// hourly series -> value at t, as wind.js interp (vector for the wind) and weather.js interp (linear)
function at(rows, t) {
  const k = rows.findIndex(r => r.t > t); if (k < 1) return null; const a = rows[k - 1], b = rows[k]; if (b.t - a.t > 2 * 36e5) return null; const f = (t - a.t) / (b.t - a.t);
  const L = x => a[x] == null ? null : b[x] == null ? a[x] : a[x] + (b[x] - a[x]) * f;
  let dir = null; if (a.dir != null && b.dir != null) { const va = [a.speed * Math.sin(a.dir * D2R), a.speed * Math.cos(a.dir * D2R)], vb = [b.speed * Math.sin(b.dir * D2R), b.speed * Math.cos(b.dir * D2R)]; dir = norm(Math.atan2(va[0] + (vb[0] - va[0]) * f, va[1] + (vb[1] - va[1]) * f) / D2R); }
  return { speed: L('speed'), dir, cloud: L('cloud'), low: L('low'), precip: L('precip'), code: a.code };
}
const fromH = (J, tOf) => J.hourly.time.map((s, i) => ({ t: tOf(s), speed: J.hourly.wind_speed_10m?.[i], dir: J.hourly.wind_direction_10m?.[i], cloud: J.hourly.cloud_cover?.[i], low: J.hourly.cloud_cover_low?.[i], precip: J.hourly.precipitation?.[i], code: J.hourly.weather_code?.[i] }));
const snapJ = JSON.parse(readFileSync('cwplans/docklands/data/sky/weather-2026-10-03.json', 'utf8'));
const bst = s => Date.parse(s + ':00Z') - 36e5;   // the snapshot's hours are London time (BST on 3 and 4 Oct)
const snap = fromH(snapJ, bst).map(r => ({ ...r, speed: r.speed / 3.6 }));
// the hourly cache (cwplans/cache/latest.json theme weather: its series of past runs, wind speed and total cloud, no direction;
// the current hour with direction). The page uses it within 90 minutes of its latest hour only.
const cacheRows = [];
{ const w = JSON.parse(readFileSync('cwplans/cache/latest.json', 'utf8')).themes?.weather;
  if (w) { const c = w.series.cols, ix = k => c.indexOf(k); for (const r of w.series.rows) cacheRows.push({ t: Date.parse(r[ix('time')]), speed: r[ix('wind_kmh')] / 3.6, dir: null, cloud: r[ix('cloud_pct')], precip: r[ix('precip_mm')] });
    const k = cacheRows.findIndex(r => r.t === Date.parse(w.time)); const cur = { t: Date.parse(w.time), speed: w.current.wind_kmh / 3.6, dir: w.current.wind_dir, cloud: w.current.cloud_pct, precip: w.current.precip_mm };
    if (k >= 0) cacheRows[k] = cur; else cacheRows.push(cur); } }
const VARS = 'wind_speed_10m,wind_direction_10m,cloud_cover,cloud_cover_low,precipitation,weather_code';
const SRC = {}, compare = {};
for (const d of WDAYS) {
  const M = await metar(d); if (!M.length) { console.log(`METAR ${d}: none`); continue; }
  const age = (Date.now() - Date.parse(d)) / 864e5, end = new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10), q = `latitude=51.505&longitude=-0.02&start_date=${d}&end_date=${end}&hourly=${VARS}&wind_speed_unit=ms&timeformat=unixtime&timezone=GMT`;
  const series = {};
  if (Date.parse(d) >= Date.parse('2026-10-03') && Date.parse(d) <= Date.parse('2026-10-04')) series.snapshot = snap;
  if (age <= 85) { const J = await cached(`om-forecast-${d}.json`, `https://api.open-meteo.com/v1/forecast?${q}`); if (J._error) SRC[`forecast ${d}`] = J._error; else series.forecastApi = fromH(J, s => s * 1000); await sleep(400); }
  const A = await cached(`om-archive-${d}.json`, `https://archive-api.open-meteo.com/v1/archive?${q}`); if (A._error) SRC[`archive ${d}`] = A._error; else series.era5 = fromH(A, s => s * 1000).filter(r => r.speed != null); await sleep(400);
  const cr = cacheRows.filter(r => Math.abs(r.t - Date.parse(d + 'T12:00Z')) < 18 * 36e5);
  for (const [name, rows] of Object.entries(series)) {
    const sp = [], dir = [], cl = [], rain = [];
    for (const o of M) { const v = at(rows, o.t); if (!v || v.speed == null) continue;
      if (o.speed != null) sp.push(v.speed - o.speed);
      if (o.dir != null && o.speed >= 2 && v.speed >= 2) dir.push(dAng(v.dir, o.dir));
      if (o.cloud != null && v.cloud != null) { const pc = v.low != null ? v.low : v.cloud; cl.push([pc, o.cloud, v.cloud]); }
      rain.push([(v.precip || 0) >= 0.05 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(v.code), o.rain]); }
    const cls = x => x < 25 ? 0 : x < 75 ? 1 : 2;
    (compare[name] ||= []).push({ day: d, n: sp.length, speedBias: r2(mean(sp)), speedMae: r2(mae(sp)), speedRms: r2(rms(sp)), dirN: dir.length, dirMae: dir.length ? Math.round(mae(dir)) : null, dirBias: dir.length ? Math.round(mean(dir)) : null,
      cloudN: cl.length, cloudLowClassAgree: cl.length ? Math.round(100 * cl.filter(([p, o]) => cls(p) === cls(o)).length / cl.length) : null, cloudTotalMinusMetarMean: cl.length ? Math.round(mean(cl.map(([, o, tot]) => tot - o))) : null,
      rainHours: rain.filter(x => x[1]).length, rainHit: rain.filter(x => x[0] && x[1]).length, rainFalse: rain.filter(x => x[0] && !x[1]).length });
  }
  if (cr.length) { const sp = [], dir = [], cl = [];
    for (const c of cr) { const o = M.reduce((b, m) => Math.abs(m.t - c.t) < Math.abs(b.t - c.t) ? m : b, M[0]); if (Math.abs(o.t - c.t) > 40 * 6e4) continue;
      if (o.speed != null) sp.push(c.speed - o.speed); if (c.dir != null && o.dir != null && o.speed >= 2) dir.push(dAng(c.dir, o.dir)); if (o.cloud != null) cl.push(c.cloud - o.cloud); }
    if (sp.length) (compare.hourlyCache ||= []).push({ day: d, n: sp.length, speedBias: r2(mean(sp)), speedMae: r2(mae(sp)), dirMae: dir.length ? Math.round(mae(dir)) : null, cloudTotalMinusMetarMean: cl.length ? Math.round(mean(cl)) : null }); }
}
// the cache runs on days not in WDAYS
for (const c of cacheRows) { const d = new Date(c.t).toISOString().slice(0, 10); if (!WDAYS.includes(d)) { const M = await metar(d); const o = M.reduce((b, m) => !b || Math.abs(m.t - c.t) < Math.abs(b.t - c.t) ? m : b, null); if (!o || Math.abs(o.t - c.t) > 40 * 6e4) continue;
  (compare.hourlyCacheRuns ||= []).push({ src: 'cache', t: new Date(c.t).toISOString().slice(0, 16), speed: r2(c.speed), metarSpeed: r2(o.speed), dir: c.dir, metarDir: o.dir, cloud: c.cloud, metarCloud: o.cloud }); } }
function wsum(list) { if (!list) return null; const n = list.reduce((s, x) => s + x.n, 0), w = k => list.filter(x => x[k] != null);
  return { days: list.length, n, speedBias: r2(list.reduce((s, x) => s + x.speedBias * x.n, 0) / n), speedMae: r2(list.reduce((s, x) => s + x.speedMae * x.n, 0) / n),
    dirMae: w('dirMae').length ? Math.round(w('dirMae').reduce((s, x) => s + x.dirMae * (x.dirN || x.n), 0) / w('dirMae').reduce((s, x) => s + (x.dirN || x.n), 0)) : null,
    cloudLowClassAgree: w('cloudLowClassAgree').length ? Math.round(mean(w('cloudLowClassAgree').map(x => x.cloudLowClassAgree))) : null }; }
OUT.wind = compare; OUT.windSummary = Object.fromEntries(Object.entries(compare).filter(([k]) => k !== 'hourlyCacheRuns').map(([k, v]) => [k, wsum(v)])); OUT.sourceErrors = SRC;

// ======================= print
console.log('TIDE, held-out EA archive days', heldOut.join(' '));
for (const [d, o] of Object.entries(OUT.tideHeldOut)) for (const [id, x] of Object.entries(o)) console.log(`  ${d} ${ST[id].padEnd(10)} range ${x.range.toFixed(1)} m  rms ${x.rms.toFixed(2)}  bias ${x.bias.toFixed(2)}  max ${x.max.toFixed(2)}  HW ${x.hw ? `${x.hw.n}x ${x.hw.timeMaeMin} min (worst ${x.hw.timeMaxMin}) ${x.hw.heightMae} m` : '-'}  LW ${x.lw ? `${x.lw.n}x ${x.lw.timeMaeMin} min ${x.lw.heightMae} m` : '-'}  (n ${x.n}, dropped ${x.dropped})`);
console.log('TIDE summary', JSON.stringify(OUT.tideSummary, null, 1));
console.log('NOWCAST (readings up to T0, then prediction + fading residual) [prediction, page]'); for (const k of ['api4weeks', 'heldOut', 'winter']) console.log(' ', k, JSON.stringify(OUT.nowcast[k]));
if (OUT.tideHistory) console.log('TIDE HISTORY (EA archive file)', JSON.stringify(OUT.tideHistory, null, 1));
console.log('WIND / CLOUD vs EGLC METAR'); for (const [k, v] of Object.entries(compare)) { console.log(' ', k); for (const x of v) console.log('   ', JSON.stringify(x)); }
console.log('WIND summary', JSON.stringify(OUT.windSummary, null, 1)); if (Object.keys(SRC).length) console.log('source errors', SRC);
const J = arg('--json'); if (J) { mkdirSync(J.replace(/\/[^/]*$/, ''), { recursive: true }); writeFileSync(J, JSON.stringify(OUT, null, 1)); }
