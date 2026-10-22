// Headless check of issue #12 (KR1.5): the readout (#blNotes: the wind note #surfNote), describeView and getView show only
// the live data of the place in view. For each case the page opens at the place with a fixture live cache (?livecache=:
// metar.json of the model's station and metar-places.json of the others, reports 10 and 40 minutes old, made here) and a
// fixture Open-Meteo answer (routed; the latitude and longitude asked are recorded), then:
//   away from London (Dublin, Berlin, Stuttgart, Schloss Dagstuhl, León, Sarajevo, York): the readout, describeView (text and JSON) and
//     getView().weather do not contain "London", "Thames" or "EGLC"; the wind comes from the expected station (the place's
//     own, or for York the nearest within 50 km: Leeds Bradford); no water current; Open-Meteo is asked at the place
//     (not at the model's point);
//   the Docklands model (?view=cw): London City Airport METAR (EGLC) and the Thames current in the readout, getView and
//     describeView;
//   the globe from 5,000 km over London: no wind note and no weather in getView (no place in view).
// Screenshots: docklands/test/out/site-<case>.png (look at the readout at the bottom left).
//   python3 -m http.server 8190 --bind 127.0.0.1 &      (from the repository root)
//   node docklands/test/site-check.mjs [--base http://127.0.0.1:8190] [--cases dublin,berlin,...]
// Places held in docklandia (Dublin, the German places, the UK lite set) are served from local copies in
// docklands/test/out/places/<id> (symlinks; see place-check.mjs) when present. Skill: docklands-sky, "Live data of the
// place in view".
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8190'), OUT = 'docklands/test/out';
// test data (tests may name places): the deep links, the station each place should show, the Open-Meteo point
const CASES = {
  dublin: { q: 'll=53.34725,-6.25916,1500&ht=0,55', station: 'EIDW', near: [53.35, -6.26] },
  berlin: { q: 'll=52.5170,13.3940,1500&ht=80,55', station: 'EDDB', near: [52.52, 13.38] },
  dagstuhl: { q: 'll=49.5307,6.8986,600&ht=20,60', station: 'EDDR', near: [49.53, 6.90] },
  leon: { q: 'll=42.59732,-5.56654,1500&ht=0,55', station: 'LELN', near: [42.60, -5.57] },
  stuttgart: { q: 'll=48.7784,9.1797,1500&ht=200,55', station: 'EDDS', near: [48.78, 9.18] },
  sarajevo: { q: 'll=43.85917,18.43335,1500&ht=0,55', station: 'LQSA', near: [43.86, 18.43] },
  york: { q: 'll=53.9600,-1.0810,1500&ht=0,55', station: 'EGNM', near: [53.96, -1.08] },
  docklands: { q: 'view=cw', station: 'EGLC', london: true },
  far: { q: 'll=51.5,-0.12,5000000&ht=0,0', none: true },
};
const ONLY = arg('--cases', null), LIST = ONLY ? ONLY.split(',') : Object.keys(CASES);
// fixture stations (positions as the NOAA AWC answer gives them, 2026-10-22)
const ST = { EGLC: ['London City Arpt, EN, GB', 51.505, 0.055], EIDW: ['Dublin Arpt, L, IE', 53.422, -6.298], EDDB: ['Berlin/Brandenburg Intl, BR, DE', 52.3807, 13.5306],
  EDDR: ['Saarbrücken Arpt, SL, DE', 49.213, 7.108], ELLX: ['Luxembourg/Findel Arpt, LL, LU', 49.626, 6.204], LELN: ['León Arpt, CL, ES', 42.588, -5.651],
  EDDS: ['Stuttgart Arpt, BW, DE', 48.69, 9.222], LQSA: ['Sarajevo Intl, BI, BA', 43.825, 18.331],
  EGNM: ['Leeds Bradford Intl, EN, GB', 53.862, -1.665], EGXE: ['Leeming, EN, GB', 54.297, -1.533], EGLL: ['London/Heathrow Intl, EN, GB', 51.477, -0.461] };
const now = Date.now() / 1000, p2 = n => String(n).padStart(2, '0');
const rep = (id, t, k) => { const d = new Date(t * 1000), dir = 100 + 20 * k, kt = 5 + k;
  return { t, raw: `METAR ${id} ${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}Z ${dir}${p2(kt)}KT 9999 SCT030 12/06 Q1010`, wdir: dir, wspd_kt: kt, wgst_kt: null, vis_m: 10000, clouds: [{ cover: 'SCT', base_ft: 3000 }], temp_c: 12, dewp_c: 6 }; };
const obsOf = (id, k) => [rep(id, Math.floor(now - 2400), k), rep(id, Math.floor(now - 600), k)];
const FIX = `${OUT}/site-livecache`; mkdirSync(FIX, { recursive: true });
writeFileSync(`${FIX}/metar.json`, JSON.stringify({ v: 1, station: { icao: 'EGLC', name: ST.EGLC[0], lat: ST.EGLC[1], lon: ST.EGLC[2] }, obs: obsOf('EGLC', 0) }));
writeFileSync(`${FIX}/metar-places.json`, JSON.stringify({ v: 1, stations: Object.fromEntries(Object.entries(ST).filter(([id]) => id !== 'EGLC').map(([id, [name, lat, lon]], k) => [id, { icao: id, name, lat, lon, obs: obsOf(id, k + 1) }])) }));
// the places held in another repository, from local copies (as place-check.mjs)
const IX = JSON.parse(readFileSync('cwplans/docklands/data/places/index.json', 'utf8')).places;
const PB = IX.filter(q => q.tileBase && existsSync(`${OUT}/places/${q.id}/features.json`)).map(q => `&placebase=${q.id}:${encodeURIComponent(`${BASE}/${OUT}/places/${q.id}/`)}`).join('');
// a fixture Open-Meteo answer: 48 hourly rows from start_date, wind 6 m/s from 300 degrees, cloud 50 %
function meteo(url) {
  const u = new URL(url), t0 = Date.parse(u.searchParams.get('start_date') + 'T00:00:00Z') / 1000, n = 48, rep2 = v => Array(n).fill(v), H = { time: Array.from({ length: n }, (_, i) => t0 + 3600 * i) };
  for (const v of (u.searchParams.get('hourly') || '').split(',')) H[v] = /direction/.test(v) ? rep2(300) : /wind_speed|gusts/.test(v) ? rep2(6) : /geopotential/.test(v) ? rep2(500) : /cloud/.test(v) ? rep2(50) : /visibility/.test(v) ? rep2(20000) : /temperature/.test(v) ? rep2(10) : /humidity/.test(v) ? rep2(70) : rep2(0);
  return { latitude: +u.searchParams.get('latitude'), longitude: +u.searchParams.get('longitude'), hourly: H };
}

const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ' · ' + detail : ''}`); };
// London words; the IANA zone name "Europe/London" is not London data (it is York's own zone) and is left out first
const LONDON0 = /London|Thames|EGLC/, LONDON = { test: s => LONDON0.test(String(s).replace(/Europe\/London/g, '')) };
for (const id of LIST) {
  const C = CASES[id]; if (!C) throw new Error('no case ' + id);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage(), errors = [], asked = [];
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.route(/open-meteo\.com/, r => { const u = new URL(r.request().url()); asked.push([+u.searchParams.get('latitude'), +u.searchParams.get('longitude')]); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(meteo(r.request().url())) }); });
  await page.route(/adsb\.lol|openwaters|aisstream|aviationweather|raw\.githubusercontent\.com\/danbri\/londat\/live-cache/, r => r.fulfill({ status: 404, body: '' }));
  await page.goto(`${BASE}/docklands/?${C.q}&webgl&animate=0&livecache=${encodeURIComponent(`${BASE}/${FIX}/`)}${PB}`);
  // wait for the wind layer to have worked out the site in view (or, with no place, for the layers to load)
  const st = await page.waitForFunction(() => { const D = globalThis.__docklands3, S = D && D.STATS && D.STATS.surface; if (!S || !window.docklands) return false;
    const w = S.wind, s = S.site; return (w && s && w.site === s.key) || (!s && D.layers?.wind !== undefined) || (!s && performance.now() > 90000) ? { wind: w, site: s, current: S.current, water: S.water } : false; }, null, { timeout: 240000, polling: 1000 }).then(h => h.jsonValue()).catch(e => ({ err: e.message }));
  await page.waitForTimeout(C.london || C.none ? 3000 : 25000);   // (places: let the core tiles draw before the screenshot)
  const P = await page.evaluate(async () => { const n = document.getElementById('surfNote'); const d = await window.docklands.describeView().catch(e => ({ text: 'ERR ' + e.message })), v = window.docklands.getView();
    return { note: n && !n.hidden ? n.textContent : '', notes: [...document.querySelectorAll('#blNotes > *')].filter(e => !e.hidden).map(e => e.textContent).join(' | '), describe: d, view: v }; });
  await page.screenshot({ path: `${OUT}/site-${id}.png`, timeout: 120000 }).catch(e => console.log('screenshot', e.message));
  console.log(`--- ${id}: site ${JSON.stringify(st.site || null)} · note "${P.note}"`);
  const djson = JSON.stringify(P.describe), vjson = JSON.stringify(P.view.weather || null);
  if (C.none) {
    check(!P.note, `${id}: no wind note with no place in view`, P.note);
    check(!P.view.weather, `${id}: getView().weather is null`, vjson);
  } else if (C.london) {
    check(/London City Airport METAR \(EGLC\)/.test(P.note), `${id}: the readout names the London City Airport METAR (EGLC)`, P.note);
    check(/Thames current \d/.test(P.note), `${id}: the readout gives the Thames current`, P.note);
    check(P.view.weather && P.view.weather.wind && P.view.weather.wind.station === 'EGLC' && P.view.weather.water_current && P.view.weather.water_current.water === 'Thames', `${id}: getView().weather: EGLC wind and the Thames current`, vjson);
    check(P.describe.weather && P.describe.weather.wind && P.describe.weather.wind.station === 'EGLC', `${id}: describeView().weather: EGLC`, JSON.stringify(P.describe.weather || null));
  } else {
    check(!LONDON.test(P.notes), `${id}: the readout names no London, Thames or EGLC`, P.notes);
    check(!LONDON.test(P.describe.text || ''), `${id}: describeView text names no London, Thames or EGLC`, (P.describe.text || '').replace(/Europe\/London/g, '').match(/.{0,60}(London|Thames|EGLC).{0,60}/)?.[0] || '');
    check(!LONDON.test(JSON.stringify(P.describe.weather || null)) && !LONDON.test(vjson), `${id}: describeView().weather and getView().weather name no London, Thames or EGLC`, vjson);
    check(new RegExp(`METAR \\(${C.station}\\)`).test(P.note), `${id}: the readout gives the METAR of ${C.station}`, P.note);
    check(!/current/.test(P.note) && st.current == null, `${id}: no water current`, `current ${st.current}`);
    check(P.view.weather && P.view.weather.wind && P.view.weather.wind.station === C.station, `${id}: getView().weather.wind.station is ${C.station}`, vjson);
    check(/Live weather here: wind/.test(P.describe.text || ''), `${id}: describeView text gives the live weather here`, (P.describe.text || '').match(/Live weather here:.*$/)?.[0] || '');
    const placeAsk = asked.filter(([la, lo]) => Math.abs(la - C.near[0]) < 0.1 && Math.abs(lo - C.near[1]) < 0.1).length, modelAsk = asked.filter(([la]) => Math.abs(la - 51.505) < 0.01).length;
    check(placeAsk > 0, `${id}: Open-Meteo asked at the place`, JSON.stringify(asked.slice(0, 6)));
    // (the model's 3D wind layer, windfield.js, still asks at the model's point: it draws only the model's air)
    if (modelAsk) console.log(`note ${id}: Open-Meteo also asked ${modelAsk} times at the model's point (windfield.js, the model's 3D wind)`);
  }
  // the text describes the actual place: any London words in the wider text are from other faults (issues #13-#15); listed
  const extra = (P.describe.text || '').replace(/Europe\/London/g, '').match(/[^.]*(London)[^.]*\./g);
  if (extra && !C.london && !C.none) console.log(`note ${id}: describeView text also has: ${extra.join(' ')}`);
  check(!errors.length, `${id}: no page errors`, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exitCode = failed ? 1 : 0;
