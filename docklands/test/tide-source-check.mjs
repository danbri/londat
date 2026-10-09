// Which level the tide layer of the Three.js port shows, and from which source, at clock times inside and outside the EA
// readings: 3 hours ago (hourly cache or EA API: readings), 2 and 6 hours ahead (prediction + fading residual), 10 days ago
// (EA API: readings), 9 January 2026 (no readings: prediction), 3 October 2026 (snapshot: readings); and the same with
// ?ea=0. Prints STATS.tide.now (level, source, residual, next high water) and fails on a page error or a wrong source kind.
//   node docklands/test/tide-source-check.mjs --base http://127.0.0.1:8937 [--webgpu]
// Skill: docklands-sky, "Tide surge".
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
  { name: '9 Jan 2026 15:00Z (held-out winter day)', t: Date.parse('2026-01-09T15:00Z'), want: 'prediction' },
  { name: '3 Oct 2026 22:30Z (snapshot)', t: Date.parse('2026-10-03T22:30Z'), want: 'reading' },
];
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
      const n = D.STATS.tide.now, K = __tide3.levelsAt(t).K; return { ...n, kinds: K.map(k => k.kind) }; }, c.t);
    const kind = r.kinds.includes('reading') && r.kinds.every(k => k === 'reading') ? 'reading' : r.kinds.includes('residual') || r.kinds.includes('reading') ? 'residual' : 'prediction';
    const want = ea ? c.want : (c.name.startsWith('10 days') ? 'prediction' : c.want);
    const ok = kind === want || (want === 'reading' && kind === 'residual' && c.name === '3 h ago');   // the cache may end later than the EA API answer
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(40)} ${iso(c.t)}  ${r.level} m OD  kinds ${r.kinds.join('/')}  residual ${r.residualCentre} m  from ${r.fromReadingH ?? '-'} h  HW ${r.nextHW && r.nextHW.join(' ')}  (${r.source})${r.eaError ? ' EA error: ' + r.eaError : ''}`);
  }
  if (errors.length) { bad++; console.log('page errors:', errors); }
  await page.close();
}
await browser.close();
console.log(bad ? `${bad} failed` : 'all ok'); process.exit(bad ? 1 : 0);
