// The falling sheet (docklands/reveal.js) of the Three.js port, frame by frame: the page opens with the Data overlays layer
// and no part on (?ov=), the test ticks "Conservation areas" in the menu, and the reveal clock is stepped by hand
// (__docklandsReveal.manual, step) to fixed times; at each: a screenshot, and from the sheet's mesh its height above its
// floor, its width (squash and stretch), the share of vertices that have landed, and whether the layer itself is shown.
// A strip of the frames is written as JPEG. WebGL 2 by default, --webgpu for WebGPU on Dawn's SwiftShader adapter.
//   node docklands/test/reveal-frames.mjs --base http://127.0.0.1:8613 [--webgpu] [--out docklands/test/out/audit/reveal]
// Results: docklands/AUDIT.md, item 6. Skill: docklands-3d-page, "Three.js port".
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8613'), WEBGPU = process.argv.includes('--webgpu'), OUT = arg('--out', 'docklands/test/out/audit/reveal'); mkdirSync(OUT, { recursive: true });
const TAG = WEBGPU ? 'webgpu' : 'webgl2', PART = arg('--part', 'Conservation areas');
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
const page = await browser.newPage({ viewport: { width: 640, height: 420 } }), errors = [];
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|GL Driver/.test(m.text())) errors.push(m.text()); });
await page.goto(`${BASE}/docklands/?animate=0&weather=0&wheels=0&look=0&layers=overlays&ov=&view=area&t=2026-10-04T12:00${WEBGPU ? '' : '&webgl'}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && __docklands3.ctx.overlays, null, { timeout: 400000 });
const backend = await page.evaluate(() => __docklands3.backend);
await page.evaluate(() => { for (const e of document.querySelectorAll('body > *')) if (e.tagName !== 'CANVAS' && !e.querySelector('canvas') && !/^(SCRIPT|STYLE)$/.test(e.tagName)) e.style.visibility = 'hidden'; });
// the same module instance as the page's dynamic import; the reveal clock by hand from now on
await page.evaluate(async () => { await import(new URL('reveal.js', location.href).href); globalThis.__docklandsReveal.manual(true); });
// tick the part in the menu (its checkbox row)
const ticked = await page.evaluate(part => { const l = [...document.querySelectorAll('label.row')].find(l => l.textContent.trim() === part); if (!l) return false; const i = l.querySelector('input'); i.click(); return i.checked; }, PART);
await page.waitForFunction(() => globalThis.__docklandsReveal.active > 0, null, { timeout: 120000 });
const TIMES = [0, 0.4, 0.8, 1.1, 1.22, 1.3, 1.4, 1.6, 2.0, 2.4, 2.9];
const frames = []; let tPrev = 0;
for (const t of TIMES) {
  const s = await page.evaluate(async ({ dt, part }) => { const R = globalThis.__docklandsReveal, D = __docklands3; R.step(dt);
    for (let k = 0; k < 2; k++) { D.draw(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 150))); }
    const m = D.scene.getObjectByName('reveal:' + part), grp = D.ctx.overlays.parts.cons.group;
    if (!m) return { sheet: false, active: R.active, layerShown: !!(grp && grp.visible) };
    const p = m.geometry.attributes.position.array; let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9, ys = 0; const n = p.length / 3;
    for (let i = 0; i < n; i++) { const x = p[3 * i], y = p[3 * i + 1]; y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); ys += y; }
    return { sheet: true, yMin: Math.round(y0), yMax: Math.round(y1), yMean: Math.round(ys / n), width: Math.round(x1 - x0), layerShown: !!(grp && grp.visible), active: R.active };
  }, { dt: t - tPrev, part: PART });
  tPrev = t; s.t = t;
  const png = await page.screenshot({ timeout: 240000 }); writeFileSync(`${OUT}/${TAG}-${String(t.toFixed(2)).replace('.', '_')}.png`, png);
  frames.push(s); console.log(TAG, JSON.stringify(s));
}
const stats = await page.evaluate(() => JSON.parse(JSON.stringify(globalThis.__docklandsReveal.stats)));
await browser.close();
// the width at rest is the width at the end of the fall's squash (1 at landing): report the relative widths
const W0 = frames.find(f => f.sheet)?.width; for (const f of frames) if (f.sheet && W0) f.widthRel = +(f.width / W0).toFixed(4);
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify({ backend, ticked, stats, frames, errors }, null, 1));
console.log(TAG, 'backend', backend, 'ticked', ticked, 'stats', JSON.stringify(stats), 'errors', errors.slice(0, 3));
