// Tones of the Three.js port against the owner's CC0 photos: opens the photo's view at the photo time, takes a screenshot at
// the photo's size (1288 x 966 at DPR 2 = 2576 x 1932), and prints the median sRGB colour and luma (Rec. 709) of named
// regions of both images. Chromium draws the photo into a canvas with its embedded Display P3 profile converted to sRGB
// (fault F51 in the curation skill). Open-Meteo is blocked (no clouds drawn). Exit 1 when the preset's gated region (a
// clear-sky band) has a luma more than 0.08 from the photo's; the other regions are printed only. A preset with a reference
// region (ref) also prints each luma divided by the reference's luma in the same image, which removes the phone's exposure.
// Presets (--set):
//   greenlanddock (default): 2026-10-11 12:45 BST, Greenland Dock looking east, sun 31 deg up behind the camera
//     (data/images/contrib/greenlanddock/); also counts the simulated birds on the west basin (the photo shows 18).
//   greenlandpier: 2026-11-23 09:13 GMT, the Greenland Pier pontoon looking east-south-east into the sun, 10.8 deg up
//     (data/images/contrib/greenlandpier/). No gate: the phone exposed for the sun (the sky 0.29, the shore 0.10), so the
//     absolute lumas are not comparable; the ratios to sky_near_sun are.
// Run from the repository root with a server on the root:
//   python3 -m http.server 8188 --bind 127.0.0.1 &
//   node docklands/test/photo-tones.mjs [--set greenlandpier] [--base http://127.0.0.1:8188] [--out docklands/test/out/photo-tones.png] [--query 'style=paint']
// Chromium: $PW_CHROME, else /opt/pw-browsers/chromium-1194/chrome-linux/chrome if present, else Playwright's own.
// Skill: photo-view-reconstruction, "Greenland Dock by day (2026-10-11)" and "Greenland Pier, low sun (2026-11-23)".
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SET = arg('--set', 'greenlanddock'), BASE = arg('--base', 'http://127.0.0.1:8188'), EXTRA = arg('--query', '');
// regions in photo pixels (2576 x 1932): x0, y0, x1, y1; gate: the region whose luma difference fails the run
const PRESETS = {
  greenlanddock: { photo: 'data/images/contrib/greenlanddock/2026-10-11-gd-01-greenland-dock-east.jpg', view: 'greenlanddock', t: '2026-10-11T12:45', gate: 'sky_top',
    R: { sky_top: [1300, 0, 2500, 120], sky_mid: [1500, 420, 1800, 560], sky_low: [1700, 700, 2100, 760], water_mid: [900, 1050, 2400, 1350],
      water_near: [700, 1450, 1400, 1700], trees_far_right: [2000, 720, 2500, 900], trees_left_row: [0, 780, 420, 1000] } },
  greenlandpier: { photo: 'data/images/contrib/greenlandpier/2026-11-23-gp-01-thames-east-morning-sun.jpg', view: 'greenlandpier', t: '2026-11-23T09:13', gate: null, ref: 'sky_near_sun',
    R: { sky_top_left: [100, 0, 1300, 120], sky_mid_left: [100, 600, 700, 760], sky_near_sun: [2150, 480, 2450, 600], sky_low_sun_side: [1900, 840, 2040, 920],
      shore_shade: [1000, 1000, 1200, 1075], water_glitter: [1950, 1150, 2150, 1500], water_mid_left: [100, 1250, 1300, 1500], water_near: [300, 1600, 1500, 1850] } },
};
const P = PRESETS[SET]; if (!P) { console.log('unknown --set ' + SET + '; one of ' + Object.keys(PRESETS).join(', ')); process.exit(2); }
const OUT = arg('--out', `docklands/test/out/photo-tones${SET === 'greenlanddock' ? '' : '-' + SET}.png`), PHOTO = P.photo, R = P.R;
const CHROME = process.env.PW_CHROME || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
mkdirSync(dirname(OUT), { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: CHROME,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1288, height: 966 }, deviceScaleFactor: 2 }), errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.route(/open-meteo/, r => r.abort());
await page.goto(`${BASE}/docklands/?view=${P.view}&t=${P.t}&labels=0&webgl&animate=0${EXTRA ? '&' + EXTRA : ''}`);
await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready, null, { timeout: 240000 });
await page.waitForTimeout(8000);
const birds = SET !== 'greenlanddock' ? null : await page.evaluate(() => { const L = __docklands3.layers.wildlife; if (!L || !L.api) return null; const a = L.api.animals.filter(o => o.x > -1700 && o.x < -1420 && o.z > 1120 && o.z < 1350);
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
console.log('region            photo rgb (luma)          render rgb (luma)         d luma' + (P.ref ? `   photo/render luma ÷ ${P.ref}` : ''));
for (const k of Object.keys(R)) {
  const p = stats.photo[k], r = stats.render[k], d = r.luma - p.luma;
  if (k === P.gate && Math.abs(d) > 0.08) bad++;
  const rel = P.ref ? `   ${(p.luma / stats.photo[P.ref].luma).toFixed(2)} / ${(r.luma / stats.render[P.ref].luma).toFixed(2)}` : '';
  console.log(`${k.padEnd(17)} ${JSON.stringify(p.rgb).padEnd(16)} (${p.luma.toFixed(3)})   ${JSON.stringify(r.rgb).padEnd(16)} (${r.luma.toFixed(3)})   ${d >= 0 ? '+' : ''}${d.toFixed(3)}${rel}`);
}
if (birds) console.log('birds on the west basin: photo 18 (12 gulls, 6 coots or ducks); simulation', JSON.stringify(birds));
for (const e of errors) console.log(e.slice(0, 300));
console.log((bad ? 'FAIL' : 'ok') + ' -> ' + OUT);
process.exit(bad ? 1 : 0);
