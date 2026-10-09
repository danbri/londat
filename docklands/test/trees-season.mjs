// Trees of the Three.js port through the year: the same views at noon on 15 January, 15 April, 15 July and 15 October
// 2026 (?t=), only the trees layer, WebGL 2 in software; a strip of the four, the share of foliage-green and of
// autumn-coloured pixels among the pixels that the trees change (a frame with the layer hidden is the baseline).
//   node docklands/test/trees-season.mjs --base http://127.0.0.1:8613 [--out docklands/test/out/audit/trees]
// Results: docklands/AUDIT.md, item 5. Skill: docklands-3d-page, "Three.js port" (Trees: species and seasons).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8613'), OUT = arg('--out', 'docklands/test/out/audit/trees'); mkdirSync(OUT, { recursive: true });
const DATES = ['2026-01-15T12:00', '2026-04-15T12:00', '2026-07-15T12:00', '2026-10-15T12:00'];
const VIEWS = { mudchute: 'v=1&c=520,1560,2,300,2.4,0.5&n=0', mudchuteclose: 'v=1&c=560,1500,2,120,2.4,0.35&n=0' };
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { createCanvas, loadImage } = await import('@napi-rs/canvas');
const res = {};
for (const [v, h] of Object.entries(VIEWS)) {
  const page = await browser.newPage({ viewport: { width: 640, height: 420 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/docklands/?webgl&animate=0&weather=0&wheels=0&look=0&layers=trees&t=${DATES[0]}#${h}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && __docklands3.layers.trees && __docklands3.layers.trees.api, null, { timeout: 300000 });
  await page.evaluate(() => { for (const e of document.querySelectorAll('body > *')) if (e.tagName !== 'CANVAS' && !e.querySelector('canvas') && !/^(SCRIPT|STYLE)$/.test(e.tagName)) e.style.visibility = 'hidden'; });
  res[v] = { dates: {} };
  for (const t of DATES) {
    await page.evaluate(async t => { const D = __docklands3; D.setClock(D.fromLondon(t)); for (let k = 0; k < 4; k++) { D.draw(); await new Promise(r => setTimeout(r, 500)); } }, t);
    const px = async png => { const im = await loadImage(png), c = createCanvas(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
    await page.evaluate(async () => { __docklands3.layers.trees.api.setVisible(false); for (let k = 0; k < 2; k++) { __docklands3.draw(); await new Promise(r => setTimeout(r, 400)); } });
    const d0 = await px(await page.screenshot({ timeout: 180000 }));
    await page.evaluate(async () => { __docklands3.layers.trees.api.setVisible(true); for (let k = 0; k < 3; k++) { __docklands3.draw(); await new Promise(r => setTimeout(r, 400)); } });
    const png = await page.screenshot({ timeout: 180000 }); writeFileSync(`${OUT}/${v}-${t.slice(5, 7)}.png`, png); const d = await px(png);
    let green = 0, autumn = 0, other = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (Math.abs(r - d0[i]) + Math.abs(gg - d0[i + 1]) + Math.abs(b - d0[i + 2]) < 24) continue; n++;
      if (gg > r * 1.08 && gg > b * 1.08) green++; else if (r > gg * 1.12 && r > b * 1.3) autumn++; else other++; }
    res[v].dates[t] = { treePixels: n, green: +(green / n).toFixed(3), autumn: +(autumn / n).toFixed(3), bareOrOther: +(other / n).toFixed(3) };
    console.log(v, t, JSON.stringify(res[v].dates[t]));
  }
  res[v].errors = errors; await page.close();
}
await browser.close();
writeFileSync(`${OUT}/trees.json`, JSON.stringify(res, null, 1));
