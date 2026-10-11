// Tones of the Three.js port against the owner's photo of Greenland Dock (2026-10-11 12:45 BST, CC0,
// data/images/contrib/greenlanddock/): opens ?view=greenlanddock at the photo time, takes a screenshot at the photo's size
// (1288 x 966 at DPR 2 = 2576 x 1932), and prints the median sRGB colour and luma (Rec. 709) of named regions of both
// images. Chromium draws the photo into a canvas with its embedded Display P3 profile converted to sRGB (fault F51 in the
// curation skill). Also counts the simulated birds on the west basin of the dock (the photo shows 18). Open-Meteo is
// blocked (no clouds drawn). Exit 1 when the top sky band's luma is more than 0.08 from the photo's (the middle and
// low bands of the photo hold cirrus and cumulus: printed only). Run from the repository root with a server on the root:
//   python3 -m http.server 8188 --bind 127.0.0.1 &
//   node docklands/test/photo-tones.mjs [--base http://127.0.0.1:8188] [--out docklands/test/out/photo-tones.png] [--query 'style=paint']
// Skill: photo-view-reconstruction, "Greenland Dock by day (2026-10-11)".
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8188'), OUT = arg('--out', 'docklands/test/out/photo-tones.png'), EXTRA = arg('--query', '');
const PHOTO = 'data/images/contrib/greenlanddock/2026-10-11-gd-01-greenland-dock-east.jpg';
// regions in photo pixels (2576 x 1932): x0, y0, x1, y1
const R = { sky_top: [1300, 0, 2500, 120], sky_mid: [1500, 420, 1800, 560], sky_low: [1700, 700, 2100, 760], water_mid: [900, 1050, 2400, 1350],
  water_near: [700, 1450, 1400, 1700], trees_far_right: [2000, 720, 2500, 900], trees_left_row: [0, 780, 420, 1000] };
mkdirSync(dirname(OUT), { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1288, height: 966 }, deviceScaleFactor: 2 }), errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.route(/open-meteo/, r => r.abort());
await page.goto(`${BASE}/docklands/?view=greenlanddock&t=2026-10-11T12:45&labels=0&webgl&animate=0${EXTRA ? '&' + EXTRA : ''}`);
await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready, null, { timeout: 240000 });
await page.waitForTimeout(8000);
const birds = await page.evaluate(() => { const L = __docklands3.layers.wildlife; if (!L || !L.api) return null; const a = L.api.animals.filter(o => o.x > -1700 && o.x < -1420 && o.z > 1120 && o.z < 1350);
  const by = {}; for (const o of a) by[o.id] = (by[o.id] || 0) + 1; return { westBasin: a.length, by }; });
await page.screenshot({ path: OUT, timeout: 240000 });
// measure both images in a blank page (canvas readback is sRGB)
const m = await browser.newPage();
const stats = await m.evaluate(async ({ photo, shot, R }) => {
  const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  const out = {};
  for (const [k, src] of [['photo', photo], ['render', shot]]) {
    const img = await load(src), c = new OffscreenCanvas(2576, 1932), g = c.getContext('2d'); g.drawImage(img, 0, 0, 2576, 1932);
    out[k] = {};
    for (const [name, [x0, y0, x1, y1]] of Object.entries(R)) {
      const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data, ch = [[], [], []];
      for (let i = 0; i < d.length; i += 16) for (let j = 0; j < 3; j++) ch[j].push(d[i + j]);
      const med = ch.map(a => a.sort((p, q) => p - q)[a.length >> 1]);
      out[k][name] = { rgb: med, luma: +((0.2126 * med[0] + 0.7152 * med[1] + 0.0722 * med[2]) / 255).toFixed(3) };
    }
  }
  return out;
}, { photo: 'data:image/jpeg;base64,' + readFileSync(PHOTO).toString('base64'), shot: 'data:image/png;base64,' + readFileSync(OUT).toString('base64'), R });
await browser.close();
let bad = errors.length;
console.log('region            photo rgb (luma)          render rgb (luma)         d luma');
for (const k of Object.keys(R)) {
  const p = stats.photo[k], r = stats.render[k], d = r.luma - p.luma;
  if (k === 'sky_top' && Math.abs(d) > 0.08) bad++;
  console.log(`${k.padEnd(17)} ${JSON.stringify(p.rgb).padEnd(16)} (${p.luma.toFixed(3)})   ${JSON.stringify(r.rgb).padEnd(16)} (${r.luma.toFixed(3)})   ${d >= 0 ? '+' : ''}${d.toFixed(3)}`);
}
console.log('birds on the west basin: photo 18 (12 gulls, 6 coots or ducks); simulation', JSON.stringify(birds));
for (const e of errors) console.log(e.slice(0, 300));
console.log((bad ? 'FAIL' : 'ok') + ' -> ' + OUT);
process.exit(bad ? 1 : 0);
