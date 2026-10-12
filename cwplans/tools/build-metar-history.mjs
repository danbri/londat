// Build cwplans/docklands/data/sky/metar-history.json: the London City Airport (EGLC) METAR reports of the last year
// (wind, visibility, weather, cloud layers, temperature, dew point, ), decoded to compact integer columns, so that the
// Three.js port (docklands/layers/wind.js, layers/weather.js) shows the MEASURED surface wind and basic weather for clock
// times older than the live-cache branch keeps (24 hours). Source: the Iowa Environmental Mesonet ASOS/METAR archive
// (Iowa State University; "The materials found on this website are in the public domain"). Method: pipeline.json activity
// "build-metar-history"; the reasons, the licence finding and the faults: skill docklands-sky, "METAR history".
//
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/build-metar-history.mjs [--region docklands | --station ICAO] [--days 375] [--end YYYY-MM-DD] [--no-fetch]
//
// Two stages. 1, fetch (network): ONE request to asos.py for the whole period (IEM asks for few large requests and
// throttles to one a second per address), the repository's User-Agent, retries 2, 4, 8, 16 s; the answer is cached in
// data/raw/sky/ (gitignored) and not fetched again. 2, build (no network, a function of the cached file, whose SHA-256 is
// written into the output): each report is decoded from its text (the main body only: trend groups after NOSIG, BECMG,
// TEMPO and remarks after RMK are not read); a correction (COR) or a later report with the same time replaces the earlier.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { TOOLS, UA } from './lib.mjs';
import { REGIONS } from '../../docklands/geo/regions/index.js';

const arg0 = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
// the station: services.metar of --region (docklands/geo/regions/; default docklands), or --station
const REGION = arg0('--region', 'docklands'), RG = REGIONS[REGION];
if (!RG && !arg0('--station')) throw new Error('unknown --region; known: ' + Object.keys(REGIONS).join(', '));
const STATION = arg0('--station', RG && RG.services && RG.services.metar);
if (!STATION) throw new Error(`region ${REGION} has no services.metar; give --station`);
const OUT = join(TOOLS, '..', 'docklands', 'data', 'sky', REGION === 'docklands' ? 'metar-history.json' : `metar-history-${REGION}.json`);
const RAW = join(TOOLS, '..', 'data', 'raw', 'sky');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = +arg('--days', 375), FETCH = !process.argv.includes('--no-fetch');
const day = t => new Date(t).toISOString().slice(0, 10);
const END = Date.parse(arg('--end', day(Date.now())) + 'T00:00Z'), START = END - DAYS * 864e5;   // [START, END)
const URL_ = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${STATION}&data=metar&sts=${new Date(START).toISOString().slice(0, 16)}Z&ets=${new Date(END).toISOString().slice(0, 16)}Z&tz=Etc/UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3&report_type=4`;
const CACHE = join(RAW, `metar-${STATION}-${day(START)}-${day(END - 864e5)}.csv`);

// ---------- 1. fetch
if (!existsSync(CACHE)) {
  if (!FETCH) { console.error(`no cached file ${CACHE}; run without --no-fetch`); process.exit(1); }
  mkdirSync(RAW, { recursive: true });
  let txt = null;
  for (const wait of [0, 2, 4, 8, 16]) {
    if (wait) { console.log(`retry in ${wait} s`); await new Promise(r => setTimeout(r, wait * 1000)); }
    try { const r = await fetch(URL_, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error('HTTP ' + r.status);
      txt = await r.text(); if (!/^station,valid,metar/.test(txt)) throw new Error('not the expected CSV: ' + txt.slice(0, 80)); break;
    } catch (e) { console.log(`asos.py: ${e.message}`); }
  }
  if (!txt) { console.error('asos.py: no answer'); process.exit(1); }
  writeFileSync(CACHE, txt); console.log(`fetched ${txt.length} bytes -> ${CACHE}`);
}

// ---------- 2. build (from the cached file only)
const rawText = readFileSync(CACHE, 'utf8'), rawSha = createHash('sha256').update(rawText).digest('hex');
const WX = /^(?:RE)?(?:[-+]|VC)?(?:MI|PR|BC|DR|BL|SH|TS|FZ)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)*$/;
const COVER = { FEW: 1, SCT: 2, BKN: 3, OVC: 4, VV: 4 };
const fault = { no_wind: 0, no_vis: 0, no_temp: 0, unknown_tokens: {} };
function decode(text) {
  const tok = text.trim().split(/\s+/), o = { wd: null, ws: null, wg: 0, vis: null, wx: [], cl: [], T: null, Td: null, q: null, cor: false };
  let i = 0; while (i < 4 && /^(METAR|SPECI|COR)$|^\d{6}Z$/.test(tok[i]) || tok[i] === STATION) { if (tok[i] === 'COR') o.cor = true; i++; }   // IEM writes "COR EGLC ddhhmmZ" for a corrected report
  for (; i < tok.length; i++) {
    const s = tok[i]; let m;
    if (/^(RMK|NOSIG|BECMG|TEMPO)$/.test(s)) break;
    if (s === 'AUTO' || s === 'NIL') continue;
    if (s === 'COR') { o.cor = true; continue; }
    if ((m = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT$/.exec(s))) { o.wd = m[1] === 'VRB' ? -1 : +m[1]; o.ws = +m[2]; o.wg = m[3] ? +m[3] : 0; continue; }
    if (/^\/{3}\d{2}KT$|^\/{5}KT$/.test(s)) continue;                          // wind not available
    if (/^\d{3}V\d{3}$/.test(s)) continue;                                       // direction varies between: not kept
    if (s === 'CAVOK') { o.vis = 10000; o.cl.push('CAVOK'); continue; }
    if ((m = /^(\d{4})(NDV)?$/.exec(s)) && o.vis == null) { o.vis = +m[1] === 9999 ? 10000 : +m[1]; continue; }
    if (/^\d{4}(N|NE|E|SE|S|SW|W|NW)$/.test(s)) continue;                       // minimum visibility by direction
    if (/^R\d{2}[LCR]?\//.test(s)) continue;                                     // runway visual range
    if ((m = /^(FEW|SCT|BKN|OVC)(\d{3}|\/{3})(CB|TCU|\/{3})?$/.exec(s))) { o.cl.push(s); continue; }
    if (/^VV(\d{3}|\/{3})$/.test(s) || /^\/{6}(CB|TCU)?$/.test(s) || /^(NSC|NCD|CLR|SKC)$/.test(s)) { o.cl.push(s); continue; }
    if ((m = /^(M?\d{2})\/(M?\d{2})?$/.exec(s))) { const n = v => v == null ? null : v[0] === 'M' ? -+v.slice(1) : +v; o.T = n(m[1]); o.Td = n(m[2]); continue; }
    if ((m = /^Q(\d{4})$/.exec(s))) { o.q = +m[1]; continue; }
    if (/^Q\/{4}$|^\/{1,4}$|^\/\/\/\/\/\/$/.test(s)) continue;
    if (s.length >= 2 && WX.test(s)) { o.wx.push(s); continue; }
    if (/^WS\b|^W\d|^NSW$/.test(s)) continue;
    fault.unknown_tokens[s] = (fault.unknown_tokens[s] || 0) + 1;
  }
  return o;
}
const byT = new Map();
for (const line of rawText.split('\n').slice(1)) {
  const c = line.split(','); if (c.length < 3 || c[0] !== STATION) continue;
  const t = Date.parse(c[1].replace(' ', 'T') + 'Z'); if (!(t >= START && t < END)) continue;
  const o = decode(c.slice(2).join(',')); o.t = t; byT.set(t, o);   // later lines (COR, SPECI at the same minute) replace
}
const obs = [...byT.values()].sort((a, b) => a.t - b.t);
// columns on a 30-minute grid from the first report (EGLC reports at hh:20 and hh:50; a slot with no report is null in
// every column); a report off the grid (none in the first build) goes to off_grid with its decoded fields
const STEP = 30 * 6e4, T0 = obs[0].t, N = Math.round((obs.at(-1).t - T0) / STEP) + 1, slots = new Array(N).fill(null), offGrid = [];
for (const o of obs) { const k = (o.t - T0) / STEP; if (Number.isInteger(k)) slots[k] = o; else offGrid.push(o); }
const dict = (key) => { const D = [''], ix = new Map([['', 0]]); return { D, col: slots.map(o => { if (!o) return null; const k = key(o); if (!ix.has(k)) { ix.set(k, D.length); D.push(k); } return ix.get(k); }) }; };
const cl = dict(o => o.cl.join(' ')), wx = dict(o => o.wx.join(' '));
const ceilOf = str => { let b = null; for (const s of str.split(' ')) { const m = /^(BKN|OVC|VV)(\d{3})/.exec(s); if (m && (b == null || +m[2] < b)) b = +m[2]; } return b; };
const covOf = str => { if (!str) return null; const g = str.split(' '); if (g.some(s => /^(NSC|NCD|CLR|SKC|CAVOK)$/.test(s))) return 0; let c = null; for (const s of g) { const m = /^(FEW|SCT|BKN|OVC|VV)/.exec(s); if (m) c = Math.max(c ?? 0, COVER[m[1]]); } return c; };
const col = f => slots.map(o => o ? f(o) : null);
for (const o of obs) { if (o.ws == null) fault.no_wind++; if (o.vis == null) fault.no_vis++; if (o.T == null) fault.no_temp++; }
const missingSlots = slots.filter(o => !o).length;
// gaps over 60 minutes between reports
const gaps = []; for (let k = 1; k < obs.length; k++) { const g = (obs[k].t - obs[k - 1].t) / 6e4; if (g > 60) gaps.push([new Date(obs[k - 1].t).toISOString().slice(0, 16) + 'Z', g]); }
const unknown = Object.entries(fault.unknown_tokens).sort((a, b) => b[1] - a[1]);
const out = {
  station: STATION, name: 'London City Airport', lat: 51.505, lon: 0.055,
  source: 'Iowa Environmental Mesonet (Iowa State University), ASOS/METAR archive, cgi-bin/request/asos.py (data=metar, routine and special reports)',
  url: URL_, licence: 'public domain',
  licence_text: 'IEM disclaimer (https://mesonet.agron.iastate.edu/disclaimer.php, read 2026-10-12): "The materials found on this website are in the public domain and may be used freely by anyone for any lawful purpose. Attributing the Iowa Environmental Mesonet of Iowa State University would be appreciated." The reports are made by the UK Met Office for the aerodrome and exchanged through the WMO (essential data, WMO Resolution 40); review with source awc-metar before anything leaves the prototyping phase.',
  attribution: `METAR ${STATION}: Iowa Environmental Mesonet, Iowa State University (ASOS/METAR archive)`,
  produced_by: 'cwplans/tools/build-metar-history.mjs', made: new Date().toISOString(), raw_sha256: rawSha,
  raw_sha256_note: `SHA-256 of the cached asos.py answer (data/raw/sky/${CACHE.split('/').pop()})`,
  period: { from: new Date(START).toISOString(), to: new Date(END).toISOString(), days: DAYS, first: new Date(obs[0].t).toISOString(), last: new Date(obs.at(-1).t).toISOString() },
  count: obs.length, missing_slots: missingSlots, gaps_over_60_min: gaps, gaps_note: '[time of the report before the gap (UTC), minutes to the next report]',
  decode_faults: { reports_without_wind: fault.no_wind, reports_without_visibility: fault.no_vis, reports_without_temperature: fault.no_temp, unknown_tokens: Object.fromEntries(unknown.slice(0, 40)) },
  t0: new Date(T0).toISOString(), step_min: 30, n: N,
  columns: {
    _: 'one value per 30-minute slot from t0 (slot k = t0 + 30 k minutes, UTC); null in every column = no report in that slot',
    wd: 'wind direction, tens of degrees true (METAR reports to 10 degrees); -1 = VRB (variable); 0 with ws 0 = calm; null = not reported',
    ws: 'mean wind speed, knots (10-minute mean at 10 m); null = not reported',
    wg: 'gust, knots; 0 = no gust reported',
    vis: 'prevailing visibility, hundreds of metres, rounded (100 = 9999 or CAVOK, meaning 10 km or more); null = not reported',
    wx: 'index into wx_dict: present and recent (RE) weather groups as reported, e.g. "-RA BR"; 0 = none',
    cl: 'index into cloud_dict: cloud groups as reported (FEW/SCT/BKN/OVC + base in hundreds of ft above the aerodrome, CB/TCU; VV; NSC, NCD, CLR, SKC, CAVOK; ////// = not detected by the automatic station); 0 = no group. cloud_ceil[i]: lowest BKN, OVC or VV base of entry i, hundreds of ft (null none); cloud_cov[i]: largest cover, 0 none (NSC, NCD, CLR, SKC, CAVOK), 1 FEW, 2 SCT, 3 BKN, 4 OVC or VV, null no group',
    T: 'temperature, degrees C', Td: 'dew point, degrees C',
  },
  wx_dict: wx.D, cloud_dict: cl.D, cloud_ceil: cl.D.map(ceilOf), cloud_cov: cl.D.map(covOf),
  wd: col(o => o.wd == null ? null : o.wd < 0 ? -1 : Math.round(o.wd / 10)), ws: col(o => o.ws), wg: col(o => o.wg),
  vis: col(o => o.vis == null ? null : Math.round(o.vis / 100)), wx: wx.col, cl: cl.col, T: col(o => o.T), Td: col(o => o.Td),
  off_grid: offGrid.map(o => ({ t: new Date(o.t).toISOString(), wd: o.wd, ws: o.ws, wg: o.wg, vis: o.vis, wx: o.wx.join(' '), cl: o.cl.join(' '), T: o.T, Td: o.Td })),
};
const txt = JSON.stringify(out) + '\n'; writeFileSync(OUT, txt);
console.log(`wrote docklands/data/sky/metar-history.json (${(txt.length / 1024).toFixed(0)} KB): ${obs.length} reports, ${out.period.first} to ${out.period.last}, ${N} slots (${missingSlots} empty, ${offGrid.length} reports off the grid); gaps over 60 min: ${gaps.length}${gaps.length ? ' (longest ' + Math.max(...gaps.map(g => g[1])) + ' min)' : ''}; raw sha256 ${rawSha.slice(0, 16)}`);
console.log(`  without wind ${fault.no_wind}, visibility ${fault.no_vis}, temperature ${fault.no_temp}; ${wx.D.length - 1} weather strings, ${cl.D.length - 1} cloud strings; unknown tokens: ${unknown.slice(0, 12).map(([k, n]) => k + ' ' + n).join(', ') || 'none'}`);
