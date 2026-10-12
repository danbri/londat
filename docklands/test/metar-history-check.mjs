// METAR history check of the Three.js port (docklands/): the surface wind and the basic weather for past clock times come
// from the London City Airport METAR archive (cwplans/docklands/data/sky/metar-history.json, made by
// cwplans/tools/build-metar-history.mjs from the Iowa Environmental Mesonet ASOS archive).
//   1. The file against an independent decode: IEM's own decoded fields (asos.py data=drct,sknt,gust,vsby,skyc1,skyl1,
//      one request for the 3 test days, cached 24 h in the temporary directory) for every report of the 3 days.
//   2. The page on 3 past days: at 3 report times a day the wind on the page equals the reference (speed within 0.5 m/s,
//      direction within 10 degrees when the speed is over 1 m/s), and at a time between two reports it equals the vector
//      interpolation of the two; the wind note on screen (#surfNote) and STATS.surface.wind.source name "London City METAR
//      (archive)"; the weather source names it too.
//   3. ?metar=0: the old behaviour (no METAR source: Open-Meteo or the stated default).
//   4. Open-Meteo answers HTTP 429 (Playwright route): the wind is the METAR archive wind, not the default, and the weather
//      is the METAR alone; with ?metar=0 as well the default wind and no weather come back (shown as info).
// Run from the repository root with a server on it:
//   python3 -m http.server 8252 --bind 127.0.0.1 &
//   NODE_USE_ENV_PROXY=1 node docklands/test/metar-history-check.mjs [--base http://127.0.0.1:8252] [--webgpu]
// Skill: docklands-sky, "METAR history".
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8252'), WEBGPU = process.argv.includes('--webgpu');
const DAYS = (arg('--days', '2025-12-21,2026-04-11,2026-08-28')).split(',');
const KN = 0.514444, D2R = Math.PI / 180, norm = a => ((a % 360) + 360) % 360, dAng = (a, b) => { const d = norm(a - b); return d > 180 ? d - 360 : d; };
const rows = []; let bad = 0;
const row = (ok, name, val, note = '') => { rows.push([ok === null ? 'info' : ok ? 'ok' : 'FAIL', name, val, note]); if (ok === false) bad++; };

// ---------- 1. reference: IEM decoded fields for the 3 days (independent of the tool's decoder)
const F = JSON.parse(readFileSync('cwplans/docklands/data/sky/metar-history.json', 'utf8')), FT0 = Date.parse(F.t0), FST = F.step_min * 6e4;
const sorted = [...DAYS].sort(), cacheF = `${tmpdir()}/docklands-metar-ref-${sorted.join('_')}.csv`;
let csv;
if (existsSync(cacheF) && Date.now() - JSON.parse(readFileSync(cacheF + '.at', 'utf8')) < 864e5) csv = readFileSync(cacheF, 'utf8');
else {
  const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=EGLC&data=drct&data=sknt&data=gust&data=vsby&data=skyc1&data=skyl1&data=wxcodes&sts=${sorted[0]}T00:00Z&ets=${new Date(Date.parse(sorted.at(-1)) + 864e5).toISOString().slice(0, 10)}T00:00Z&tz=Etc/UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3&report_type=4`;
  for (const w of [0, 2, 4, 8, 16]) { if (w) await new Promise(r => setTimeout(r, w * 1000));
    try { const r = await fetch(url, { headers: { 'User-Agent': 'glitchcan-cwplans/0.1 (https://github.com/danbri/londat) metar-history-check' } }); if (!r.ok) throw new Error('HTTP ' + r.status); csv = await r.text(); break; } catch (e) { console.log('IEM:', e.message); } }
  if (!csv) { console.log('no reference from IEM'); process.exit(1); }
  writeFileSync(cacheF, csv); writeFileSync(cacheF + '.at', JSON.stringify(Date.now()));
}
const head = csv.split('\n')[0].split(','), REF = new Map();
for (const line of csv.trim().split('\n').slice(1)) { const c = line.split(','), o = Object.fromEntries(head.map((h, i) => [h, c[i]])); const t = Date.parse(o.valid.replace(' ', 'T') + 'Z');
  if (!DAYS.includes(o.valid.slice(0, 10))) continue; REF.set(t, { t, drct: o.drct === 'M' ? null : +o.drct, sknt: o.sknt === 'M' ? null : +o.sknt, gust: o.gust === 'M' ? null : +o.gust, vsby: o.vsby === 'M' ? null : +o.vsby, skyc1: o.skyc1, skyl1: o.skyl1 === 'M' ? null : +o.skyl1, wx: o.wxcodes }); }
{ let n = 0, d = 0; const diffs = [];
  for (const R of REF.values()) { const k = (R.t - FT0) / FST; if (!Number.isInteger(k)) { diffs.push(`${new Date(R.t).toISOString()} off the file's grid`); continue; } n++;
    const wd = F.wd[k] == null ? null : F.wd[k] < 0 ? 'VRB' : F.wd[k] * 10, refWd = R.drct;   // IEM gives VRB as M (no direction)
    const ok = F.ws[k] === R.sknt && (wd === 'VRB' ? refWd == null : wd === refWd) && (F.wg[k] || null) === (R.gust || null)
      && (R.vsby == null ? F.vis[k] == null : Math.abs(F.vis[k] * 100 - Math.min(10000, R.vsby * 1609.344)) <= Math.max(150, 0.08 * F.vis[k] * 100) || (F.vis[k] === 100 && R.vsby >= 6.2));
    const cl = F.cloud_dict[F.cl[k]].split(' ')[0] || '', m = /^(FEW|SCT|BKN|OVC|VV)(\d{3})/.exec(cl), okC = m ? (R.skyc1 === m[1] && R.skyl1 === +m[2] * 100) : true;
    if (!ok || !okC) { d++; if (diffs.length < 8) diffs.push(`${new Date(R.t).toISOString().slice(0, 16)} file ${wd}/${F.ws[k]}G${F.wg[k]} vis ${F.vis[k]} ${cl} | IEM ${R.drct}/${R.sknt}G${R.gust} vsby ${R.vsby} ${R.skyc1}${R.skyl1}`); } }
  row(d === 0 && n >= 40 * DAYS.length, `file vs IEM decoded fields, ${DAYS.join(', ')}`, `${n} reports, ${d} differ`, diffs.join('; ')); }

// ---------- 2-4. the page
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
async function open(query, meteo429) {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (meteo429) await page.route(/open-meteo\.com/, r => r.fulfill({ status: 429, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: true, reason: 'Too many requests (simulated HTTP 429)' }) }));
  await page.goto(`${BASE}/docklands/?layers=wind,weather&animate=0&debris=0${WEBGPU ? '' : '&webgl'}${query}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && __docklands3.STATS.surface && __docklands3.STATS.weather, null, { timeout: 300000 });
  return { page, errors };
}
// set the clock and draw until the wind layer and the weather layer have evaluated that time (STATS.surface.wind.at,
// STATS.weather.at; they answer asynchronously), at most 90 s
const readAt = (page, t) => page.evaluate(async t => { const D = __docklands3; D.setClock(t);
  for (let k = 0; k < 360; k++) { D.draw(); await new Promise(r => setTimeout(r, 250)); const w = D.STATS.surface.wind; if (w && w.at === D.ctx.clock && D.STATS.weather.at === D.ctx.clock) break; }
  const w = D.STATS.surface.wind, n = document.getElementById('surfNote');
  return { wind: w, note: n ? n.textContent : '', weather: D.STATS.weather.now, weatherErr: D.STATS.weather.error }; }, t);
const refWind = (a, b, f) => { const da = a.drct ?? b.drct ?? 0, db = b.drct ?? a.drct ?? 0, sa = a.sknt * KN, sb = b.sknt * KN;
  const x = (sa || 1e-6) * Math.sin(da * D2R) * (1 - f) + (sb || 1e-6) * Math.sin(db * D2R) * f, y = (sa || 1e-6) * Math.cos(da * D2R) * (1 - f) + (sb || 1e-6) * Math.cos(db * D2R) * f;
  return { speed: sa + (sb - sa) * f, dir: norm(Math.atan2(x, y) / D2R) }; };
const ARCH = /London City METAR \(archive\)/;

{ const { page, errors } = await open('', false);
  console.log(`--- default (METAR on); backend ${await page.evaluate(() => __docklands3.backend)}`);
  for (const day of DAYS) {
    const at = s => Date.parse(`${day}T${s}Z`), cases = [['06:20', 0], ['12:50', 0], ['18:20', 0], ['12:35', 0.5]];
    for (const [hhmm, f] of cases) {
      const t = at(hhmm), a = f ? REF.get(t - 15 * 6e4) : REF.get(t), b = f ? REF.get(t + 15 * 6e4) : REF.get(t);
      if (!a || !b || a.sknt == null || b.sknt == null) { row(null, `${day} ${hhmm}Z`, 'no reference report'); continue; }
      const P = await readAt(page, t), w = P.wind, R = refWind(a, b, f);
      const okS = w && Math.abs(w.speed - R.speed) <= 0.5, okD = w && (R.speed <= 1 || Math.abs(dAng(w.dir, R.dir)) <= 10), okN = w && ARCH.test(w.source) && ARCH.test(P.note), okW = P.weather && ARCH.test(P.weather.source);
      row(okS && okD && okN, `${day} ${hhmm}Z wind${f ? ' (between two reports)' : ''}`, w ? `page ${w.speed} m/s from ${w.dir}° | METAR ${R.speed.toFixed(2)} m/s from ${Math.round(R.dir)}°` : 'none',
        `${w ? w.source : ''}${!okN ? ' | NOTE: ' + P.note : ''}`);
      row(!!okW, `${day} ${hhmm}Z weather source`, P.weather ? `cloud ${Math.round(P.weather.cover)}% (low ${Math.round(P.weather.low ?? -1)}), vis ${P.weather.vis != null ? (P.weather.vis / 1000).toFixed(1) + ' km' : '-'}, ${P.weather.precip ? P.weather.precip.toFixed(1) + ' mm/h' : 'dry'}` : 'none', P.weather ? P.weather.source : P.weatherErr || '');
    }
  }
  // labels off: the wind note is hidden (index.html body.noLabels #blNotes)
  const hidden = await page.evaluate(() => { const c = document.getElementById('showLabels'); if (!c) return null; c.click(); const n = document.getElementById('blNotes'), h = n ? getComputedStyle(n).display === 'none' : null; c.click(); return h; });
  row(hidden === null ? null : hidden, 'labels off hides the wind note', String(hidden));
  if (errors.length) row(false, 'page errors (default)', errors.slice(0, 3).join(' | '));
  await page.close(); }

{ const { page, errors } = await open('&metar=0', false); console.log('--- ?metar=0');
  for (const day of DAYS) { const t = Date.parse(`${day}T12:50Z`), P = await readAt(page, t), w = P.wind;
    row(!!w && !/METAR/.test(w.source) && !(P.weather && /METAR/.test(P.weather.source)), `${day} 12:50Z ?metar=0`, w ? `${w.speed} m/s from ${w.dir}°` : 'none', `${w ? w.source : ''} | weather: ${P.weather ? P.weather.source : 'none (' + (P.weatherErr || '') + ')'}`); }
  if (errors.length) row(false, 'page errors (?metar=0)', errors.slice(0, 3).join(' | '));
  await page.close(); }

for (const q of ['', '&metar=0']) {
  const { page, errors } = await open(q, true); console.log(`--- Open-Meteo answers HTTP 429${q ? ', ?metar=0' : ''}`);
  for (const day of DAYS) { const t = Date.parse(`${day}T12:50Z`), P = await readAt(page, t), w = P.wind, R = REF.get(t), ref = R && refWind(R, R, 0);
    if (!q) row(!!w && ARCH.test(w.source) && !/^default/.test(w.source) && ref && Math.abs(w.speed - ref.speed) <= 0.5 && !!P.weather && /^London City METAR \(archive\)/.test(P.weather.source),
      `${day} 12:50Z, Open-Meteo 429`, w ? `${w.speed} m/s from ${w.dir}°${ref ? ` (METAR ${ref.speed.toFixed(2)} from ${Math.round(ref.dir)}°)` : ''}` : 'none', `${w ? w.source : ''} | weather: ${P.weather ? P.weather.source : 'none (' + (P.weatherErr || '') + ')'}`);
    else row(null, `${day} 12:50Z, Open-Meteo 429, ?metar=0`, w ? `${w.speed} m/s from ${w.dir}°` : 'none', `${w ? w.source : ''} | weather: ${P.weather ? P.weather.source : 'none (' + (P.weatherErr || '') + ')'}`); }
  if (errors.length) row(false, `page errors (429${q})`, errors.slice(0, 3).join(' | '));
  await page.close();
}
await browser.close();
for (const r of rows) console.log(`${r[0].padEnd(4)} ${r[1].padEnd(52)} ${r[2]}${r[3] ? '  [' + r[3] + ']' : ''}`);
console.log(`${rows.length} rows, ${bad} failed`); process.exit(bad ? 1 : 0);
