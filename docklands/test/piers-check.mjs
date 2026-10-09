// Piers layer of the Three.js port: what the page builds from piers.json (piers, pontoons, gangways, vessels) and the
// SIMULATED boats alongside at several clock times (TfL timetable calls, the tour operators' frequencies), plus two
// screenshots (Tower Pier and HMS Belfast; Canary Wharf Pier) with ?piers=all (a boat at every berth). WebGL 2, software.
//   node docklands/test/piers-check.mjs --base http://127.0.0.1:8613 [--out docklands/test/out/audit/piers]
// Results: docklands/AUDIT.md, item 3. Skills: docklands-3d-page ("Three.js port"), cwplans-river-and-water.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8613'), OUT = arg('--out', 'docklands/test/out/audit/piers'); mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const res = { times: {}, shots: {} };
async function open(q, hash = '') {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|GL Driver/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}/docklands/?webgl&animate=0&weather=0&wheels=0&${q}${hash}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && __docklands3.STATS.piers, null, { timeout: 300000 });
  return { page, errors };
}
const settle = page => page.evaluate(async () => { for (let k = 0; k < 3; k++) { __docklands3.draw(); await new Promise(r => setTimeout(r, 400)); } });
// 1. boats alongside by time (Thursday 8 Oct 2026, Saturday 10 Oct, a winter evening)
{ const { page, errors } = await open('layers=tide,piers&t=2026-10-08T12:00');
  res.build = await page.evaluate(() => ({ ...__docklands3.STATS.piers }));
  for (const t of ['2026-10-08T07:30', '2026-10-08T08:10', '2026-10-08T12:00', '2026-10-08T12:20', '2026-10-08T17:45', '2026-10-08T23:30', '2026-10-10T14:00', '2026-10-10T14:05', '2026-12-15T16:30']) {
    await page.evaluate(t => { const D = __docklands3; D.setClock(D.fromLondon(t)); }, t); await settle(page);
    res.times[t] = await page.evaluate(() => { const s = __docklands3.STATS.piers; return { boats: s.boats, aisSkip: s.aisSkip }; });
    console.log(t, JSON.stringify(res.times[t]));
  }
  res.errors = errors; await page.close(); }
console.log('build', JSON.stringify(res.build));
// 2. screenshots with a boat at every berth, day
const VIEWS = { tower: 'v=1&c=-4250,-130,4,420,2.6,0.45&n=0', canarywharf: 'v=1&c=-640,-30,4,260,2.2,0.5&n=0' };
for (const [name, h] of Object.entries(VIEWS)) {
  const { page, errors } = await open('layers=tide,piers&piers=all&look=0&t=2026-10-08T12:00', '#' + h + '&t=2026-10-08T12:00');
  await settle(page); await page.waitForTimeout(2000);
  await page.evaluate(() => { for (const e of document.querySelectorAll('body > *')) if (e.tagName !== 'CANVAS' && !e.querySelector('canvas') && !/^(SCRIPT|STYLE)$/.test(e.tagName)) e.style.visibility = 'hidden'; });
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot({ timeout: 180000 }));
  res.shots[name] = { boats: await page.evaluate(() => __docklands3.STATS.piers.boats), errors };
  console.log(name, JSON.stringify(res.shots[name])); await page.close();
}
await browser.close();
writeFileSync(`${OUT}/piers.json`, JSON.stringify(res, null, 1));
