// Headless check of vertical exaggeration (?vz=) and the water reflections in the Three.js port (docklands/) against the
// WebGL page (cwplans/docklands/) at the same share hash: for each case it opens both pages, waits for the model,
// fails on a page error, writes the two screenshots side by side in --out, and prints the port's state (the camera, the
// mirror plane and its water body, the moon glitter path, the pixel-art camera). Run from the repository root:
//   python3 -m http.server 8931 --bind 127.0.0.1 &
//   node docklands/test/vz-check.mjs [--base http://127.0.0.1:8931] [--webgpu] [--only name] [--noref]
// Skill: docklands-3d-page, "Three.js port".
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8931'), OUT = arg('--out', 'docklands/test/out/vz'), WEBGPU = process.argv.includes('--webgpu'), ONLY = arg('--only', ''), NOREF = process.argv.includes('--noref');
mkdirSync(OUT, { recursive: true });
// [name, port query, hash (both pages), WebGL page query]
const L = 'layers=water,tide,sky-extra,nightlights,drone,kml,locate,planes&weather=0';
const CASES = [
  ['cw-vz3', `view=cw&vz=3&${L}&t=2026-10-08T13:00`, '', 'view=cw&t=2026-10-08T13:00'],
  ['cw-vz3-pixel', `view=cw&vz=3&style=pixel&${L}&t=2026-10-08T13:00`, '', 'view=cw&pixel&t=2026-10-08T13:00'],
  ['rotherhithe-vz2-night', `view=rotherhithe&vz=2&${L}&t=2026-10-03T23:56`, '', 'view=rotherhithe&t=2026-10-03T23:56'],
  ['rotherhithe-night', `view=rotherhithe&${L}&t=2026-10-03T23:56`, '', 'view=rotherhithe&t=2026-10-03T23:56'],
  ['greenland-sky-vz3', `view=greenlandday&vz=3&${L}&t=2026-10-08T17:30`, '', 'view=greenlandday&t=2026-10-08T17:30'],
  ['dock-night', `${L}&t=2026-10-03T22:30`, '#v=1&c=-840,1320,4,600,2.2,0.12&n=1&t=2026-10-03T22%3A30', ''],
  ['dock-night-vz2', `vz=2&${L}&t=2026-10-03T22:30`, '#v=1&c=-840,1320,4,600,2.2,0.12&n=1&t=2026-10-03T22%3A30', ''],
  ['moon-glitter-nomirror', `view=rotherhithe&water=0&${L}&t=2026-10-03T23:56`, '', 'view=rotherhithe&t=2026-10-03T23:56'],
];
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
let failed = 0;
async function open(url, ready) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 1 }), errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|open-meteo|429/i.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(/api\.open-meteo\.com/, r => r.abort());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const ok = await page.waitForFunction(ready, null, { timeout: 240000 }).then(() => true).catch(() => false);
  return { page, errors, ok };
}
for (const [name, q, hash, ref] of CASES) {
  if (ONLY && !name.includes(ONLY)) continue;
  const t0 = Date.now(), file = `${OUT}/${name}${WEBGPU ? '-webgpu' : ''}`;
  const P = await open(`${BASE}/docklands/?${q}${WEBGPU ? '' : '&webgl'}&animate=0${hash}`, () => globalThis.__docklands3 && __docklands3.ready && __docklands3.STATS.layers);
  await P.page.waitForTimeout(5000);
  const info = P.ok ? await P.page.evaluate(async () => { const D = __docklands3; D.draw(); await new Promise(r => setTimeout(r, 1500));
    const e = new D.THREE.Vector3().setFromMatrixPosition(D.camera.matrixWorld);
    return { backend: D.backend, vz: D.vz, cam: D.camState(), eye: e.toArray().map(v => +v.toFixed(1)), hash: D.shareHash(), water: D.STATS.water && { mirror: D.STATS.water.mirror, level: D.STATS.water.mirrorLevel, body: D.STATS.water.mirrorBody, glitter: D.STATS.water.moonGlitter },
      style: globalThis.__docklandsStyles && __docklandsStyles.mode, night: D.night }; }) : null;
  await P.page.screenshot({ path: file + '-port.png', timeout: 240000 });
  const bad = !P.ok || P.errors.length; if (bad) failed++;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${name} port ${((Date.now() - t0) / 1000).toFixed(1)} s ${JSON.stringify(info)}`);
  for (const e of P.errors.slice(0, 6)) console.log('     ' + e.slice(0, 300));
  const shareHash = info ? info.hash : hash;
  await P.page.close();
  if (NOREF) continue;
  const vz = (/vz=([\d.]+)/.exec(q) || [])[1];
  const R = await open(`${BASE}/cwplans/docklands/?${ref}${hash || shareHash}`, () => globalThis.__docklands && document.getElementById('c'));
  await R.page.waitForTimeout(8000);
  if (vz) await R.page.evaluate(v => { const el = document.getElementById('vz'); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } }, vz);
  await R.page.waitForTimeout(3000);
  await R.page.screenshot({ path: file + '-webgl.png', timeout: 240000 });
  console.log(`     webgl page ${R.ok ? 'ok' : 'not ready'} ${R.errors.length} errors -> ${file}-webgl.png`);
  await R.page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
