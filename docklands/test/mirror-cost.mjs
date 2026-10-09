// Headless cost of the water mirror in the Three.js port (docklands/): frames drawn in a fixed time with the mirror on and
// off (Look > Water mirror), at the same view, with the page drawing every frame. Software rendering (SwiftShader), so
// the numbers compare the two states; they are not a phone's frame rate. Run from the repository root:
//   python3 -m http.server 8931 --bind 127.0.0.1 &
//   node docklands/test/mirror-cost.mjs [--base http://127.0.0.1:8931] [--webgpu] [--query 'view=rotherhithe&layers=...'] [--secs 15]
// Skill: docklands-3d-page, "Three.js port".
import { chromium } from '@playwright/test';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8931'), WEBGPU = process.argv.includes('--webgpu'), SECS = +arg('--secs', 15);
const Q = arg('--query', 'view=rotherhithe&t=2026-10-03T23:56&layers=trees,water,tide,nightlights,walls&weather=0');
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 1 }), errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route(/api\.open-meteo\.com/, r => r.abort());
await page.goto(`${BASE}/docklands/?${Q}${WEBGPU ? '' : '&webgl'}&animate=0`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && __docklands3.STATS.layers, null, { timeout: 240000 });
await page.waitForTimeout(4000);
const run = on => page.evaluate(async ([on, secs]) => {
  const D = __docklands3, W = D.layers.water; if (W && W.api.setVisible) W.api.setVisible(on);
  const a = document.getElementById('animate'); a.checked = true; D.draw();
  await new Promise(r => setTimeout(r, 3000));   // the first frames compile the shaders
  let n = 0; const t0 = performance.now(); await new Promise(r => { const f = () => { n++; if (performance.now() - t0 < secs * 1000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
  const ms = (performance.now() - t0) / n; a.checked = false;
  return { mirror: D.STATS.water && D.STATS.water.mirror, frames: n, msPerFrame: +ms.toFixed(1), backend: D.backend };
}, [on, SECS]);
const off = await run(false), on = await run(true), off2 = await run(false);
console.log(JSON.stringify({ query: Q, off, on, off2, errors }));
await browser.close();
