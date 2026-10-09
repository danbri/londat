// Headless load test of the Three.js port (docklands/): opens the page in Chromium at two sizes, waits for
// the model, fails on any page error, and writes screenshots. WebGL 2 runs in SwiftShader (software); --webgpu also
// tries the WebGPU backend in software (Dawn's SwiftShader adapter; it falls back to WebGL 2 where that fails, and the
// output says which backend ran). Run from the repository root with a server on the root:
//   python3 -m http.server 8188 --bind 127.0.0.1 &
//   node docklands/test/load.mjs [--base http://127.0.0.1:8188] [--out dir] [--webgpu] [--query 'view=rotherhithe']
// Skill: docklands-3d-page, "Three.js port".
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8188'), OUT = arg('--out', 'docklands/test/out'), WEBGPU = process.argv.includes('--webgpu'), ANIM = process.argv.includes('--animate');
const QUERIES = (arg('--query', '') ? [arg('--query')] : ['view=cw', 'view=rotherhithe', 'view=area&ground=rgb2008']);
mkdirSync(OUT, { recursive: true });
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
let failed = 0;
for (const [w, h, dpr] of [[1280, 800, 1], [390, 844, 2]]) for (const q of QUERIES) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }), errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
  const t0 = Date.now();
  const [qq, hh] = q.split('#');   // &webgl goes in the query, before a share hash
  // animate=0: since 2026-10-09 the page draws every frame (moving water); in software one WebGPU frame can take seconds and the
  // screenshot waits for a free frame and times out. --animate keeps the moving water.
  await page.goto(`${BASE}/docklands/?${qq}${WEBGPU ? '' : '&webgl'}${ANIM ? '' : '&animate=0'}${hh ? '#' + hh : ''}`);
  const ok = await page.waitForFunction(() => globalThis.__docklands3 && globalThis.__docklands3.ready, null, { timeout: 180000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(4000);
  const info = ok ? await page.evaluate(() => ({ backend: __docklands3.backend, stats: __docklands3.STATS, night: __docklands3.night, cam: __docklands3.camState(), hash: __docklands3.shareHash() })) : null;
  const file = `${OUT}/${q.replace(/[^a-z0-9]+/gi, '-')}-${w}x${h}@${dpr}${WEBGPU ? '-webgpu' : ''}.png`;
  await page.screenshot({ path: file });
  const bad = !ok || errors.length; if (bad) failed++;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${q} ${w}x${h}@${dpr} ${((Date.now() - t0) / 1000).toFixed(1)} s ${info ? info.backend + ' ' + JSON.stringify(info.stats) + ' night=' + info.night : 'not ready'} -> ${file}`);
  for (const e of errors.slice(0, 8)) console.log('     ' + e.slice(0, 400));
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
