// Which level the tide layer of the Three.js port shows, and from which source, at clock times inside and outside the EA
// readings: 3 hours ago (hourly cache or EA API: readings), 2 and 6 hours ahead (prediction + fading residual), 10 days ago
// (EA API: readings), 9 January 2026 (EA archive readings since tide-history.json; before it: prediction), 3 October 2026
// (snapshot: readings), about 6 months ago at three times (EA archive readings: the source note says so and the levels
// equal the values of cwplans/docklands/data/sky/tide-history.json); and the same with ?ea=0 (prediction). Prints STATS.tide.now (level, source, residual, next high water) and fails on a page error or a wrong source kind.
//   node docklands/test/tide-source-check.mjs --base http://127.0.0.1:8937 [--webgpu]
// Skill: docklands-sky, "Tide surge".
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8937'), WEBGPU = process.argv.includes('--webgpu');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...(WEBGPU ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-webgpu-adapter=swiftshader'] : [])] });
const now = Date.now(), H = 36e5, iso = t => new Date(t).toISOString().slice(0, 16) + 'Z';
const CASES = [
  { name: '3 h ago', t: now - 3 * H, want: 'reading' },
  { name: '2 h ahead', t: now + 2 * H, want: 'residual' },
  { name: '6 h ahead', t: now + 6 * H, want: 'residual' },
  { name: '10 days ago', t: now - 10 * 24 * H, want: 'reading' },
  // EA archive readings at Tower Pier and Silvertown; Charlton has none from 3 to 15 Jan 2026 (gauge out), so it is the prediction
  { name: '9 Jan 2026 15:00Z (held-out winter day)', t: Date.parse('2026-01-09T15:00Z'), want: 'residual', eaOnly: true },
  { name: '3 Oct 2026 22:30Z (snapshot)', t: Date.parse('2026-10-03T22:30Z'), want: 'reading' },
];
// about 6 months ago: EA daily archive readings (data/sky/tide-history.json); three times on one day, each 7 minutes after a
// 15-minute reading that all three gauges have (with the next one), so the page's level must equal the archive values
// interpolated (to 0.006 m: the file holds whole cm)
const HST = JSON.parse(readFileSync('cwplans/docklands/data/sky/tide-history.json', 'utf8')), hT0 = Date.parse(HST.start), hSt = HST.step_min * 60e3, hIds = Object.keys(HST.stations);
for (const h of [3, 11, 19]) {
  let i = Math.round((Math.floor((now - 182 * 24 * H) / (24 * H)) * 24 * H + h * H - hT0) / hSt);
  while (i < HST.stations[hIds[0]].v.length - 1 && !hIds.every(id => HST.stations[id].v[i] != null && HST.stations[id].v[i + 1] != null)) i++;
  const t = hT0 + i * hSt + 7 * 60e3, f = 7 / HST.step_min;
  CASES.push({ name: `~6 months ago, ${h}h (EA archive)`, t, want: 'reading', archive: Object.fromEntries(hIds.map(id => { const v = HST.stations[id].v; return [id, (v[i] + (v[i + 1] - v[i]) * f) / 100]; })) });
}
let bad = 0;
for (const ea of [true, false]) {
  const page = await browser.newPage({ viewport: { width: 480, height: 360 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/docklands/?layers=tide&animate=0&weather=0${WEBGPU ? '' : '&webgl'}${ea ? '' : '&ea=0'}&view=greenland`, { timeout: 180000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && __docklands3.STATS.tide, null, { timeout: 300000 });
  console.log(`--- ${ea ? 'EA API on (default)' : '?ea=0'}; backend ${await page.evaluate(() => __docklands3.backend)}`);
  for (const c of CASES) {
    const r = await page.evaluate(async t => { const D = __docklands3; D.setClock(t);
      // the EA answers arrive later: update until the kinds have not changed for 3 s
      let last = '', same = 0; for (let k = 0; k < 40 && same < 6; k++) { await new Promise(r => setTimeout(r, 500)); __tide3.update(); D.draw(); const s = __tide3.levelsAt(t).K.map(x => x.kind).join(); same = s === last ? same + 1 : 0; last = s; }
      __tide3.update();
      const n = D.STATS.tide.now, K = __tide3.levelsAt(t).K; return { ...n, kinds: K.map(k => k.kind), ids: __tide3.model.st.map(s => s.id), L: K.map(k => k.v) }; }, c.t);
    const kind = r.kinds.includes('reading') && r.kinds.every(k => k === 'reading') ? 'reading' : r.kinds.includes('residual') || r.kinds.includes('reading') ? 'residual' : 'prediction';
    const want = ea ? c.want : (c.name.startsWith('10 days') || c.archive || c.eaOnly ? 'prediction' : c.want);
    let ok = kind === want || (want === 'reading' && kind === 'residual' && c.name === '3 h ago')   // the cache may end later than the EA API answer
      || (!ea && c.name.startsWith('10 days') && kind === 'residual' && r.fromReadingH > 24);   // the fit file's last 7 days can be within 48 h of it
    if (c.name.startsWith('9 Jan') && ea && !/archive readings at .*no reading/.test(r.source)) ok = false;   // the note names the archive and the gauge without readings
    if (c.name.startsWith('3 Oct') && /archive/.test(r.source)) ok = false;   // inside the EA API window the note says "EA readings"
    let extra = '';
    if (c.archive && ea) {   // the source note names the archive, and the levels are the archive values
      const d = r.ids.map((id, i) => Math.abs(r.L[i] - c.archive[id])), dm = Math.max(...d);
      if (!/^EA archive readings$/.test(r.source) || !r.archive || dm > 0.006) ok = false;
      extra = `  archive ${r.ids.map(id => c.archive[id].toFixed(3)).join('/')} page ${r.L.map(v => v.toFixed(3)).join('/')} max diff ${dm.toFixed(4)} m`;
    }
    if (c.archive && !ea && /archive/.test(r.source)) ok = false;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(40)} ${iso(c.t)}  ${r.level} m OD  kinds ${r.kinds.join('/')}  residual ${r.residualCentre} m  from ${r.fromReadingH ?? '-'} h  HW ${r.nextHW && r.nextHW.join(' ')}  (${r.source})${r.eaError ? ' EA error: ' + r.eaError : ''}${extra}`);
  }
  if (errors.length) { bad++; console.log('page errors:', errors); }
  await page.close();
}
await browser.close();
console.log(bad ? `${bad} failed` : 'all ok'); process.exit(bad ? 1 : 0);
