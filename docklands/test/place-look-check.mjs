// Headless check that the places on the globe are drawn like the Docklands model (owner, 2026-10-22: "why do Leon and
// Sarajevo look so different to London?"; docklands/globe/place-look.js): for each place, a close view at local noon and
// after the Night button (local 22:00), the Map look (Look > Realistic buildings off) and the styles (pixel art, Painted,
// Map); checks the state the place reports (G.placeLook: look, night, light rig, sky, trees and water drawn) and the
// pictures (mean luma; lit window pixels by night), and that there is no page error. Then the same times in London (the
// model, ?view=cw), and side-by-side images of the three for the day and the night.
//   python3 -m http.server 8190 --bind 127.0.0.1 &      (from the repository root)
//   node docklands/test/place-look-check.mjs [--base http://127.0.0.1:8190] [--places leon,sarajevo] [--size 1280x800@1] [--webgpu] [--no-london] [--out docklands/test/out]
// Output: <out>/look-<place>-{day,night,map,pixel}.png, look-london-{day,night}.png, look-compare-{day,night}.png (out is git-ignored).
// Skill: docklands-3d-page, "Three.js port: places look like the model (2026-10-22)".
import { chromium } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8190'), OUT = arg('--out', 'docklands/test/out'), WEBGPU = process.argv.includes('--webgpu');
const PLACES = arg('--places', 'leon,sarajevo').split(','), [W, H, DPR] = (/^(\d+)x(\d+)@([\d.]+)$/.exec(arg('--size', '1280x800@1')) || [0, 1280, 800, 1]).slice(1).map(Number);
const DATE = arg('--date', '2026-10-12');
// the views (test data: tests may name places): León, Plaza Mayor; Sarajevo, Baščaršija (Sebilj) toward the Miljacka
const VIEWS = {
  leon: { ll: '42.59732,-5.56654,1500', go: { lon: -5.56654, lat: 42.59732, range_m: 520, tilt_deg: 70, heading_deg: 30 } },
  sarajevo: { ll: '43.85966,18.43113,1500', go: { lon: 18.43113, lat: 43.85966, range_m: 520, tilt_deg: 70, heading_deg: 200 } },
};
mkdirSync(OUT, { recursive: true });
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
let failed = 0;
const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ' · ' + detail : ''}`); };
// mean luma (Rec. 709 of sRGB values) and the share of bright warm pixels (lit windows) of a PNG, under the top bar and above the readout
async function stats(file) {
  const im = await loadImage(file), cv = createCanvas(im.width, im.height), c = cv.getContext('2d'); c.drawImage(im, 0, 0);
  const y0 = Math.round(im.height * 0.18), y1 = Math.round(im.height * 0.88), d = c.getImageData(0, y0, im.width, y1 - y0).data; let s = 0, lit = 0;
  for (let i = 0; i < d.length; i += 4) { const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; s += l; if (l > 0.45 && d[i] >= d[i + 2]) lit++; }
  return { luma: +(s / (d.length / 4)).toFixed(4), lit: +(lit / (d.length / 4)).toFixed(5) };
}
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR }), page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  page.on('response', r => { if (r.status() >= 400 && !/favicon|\/cache\/runs\/|api\.github\.com|open-meteo/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
  await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  return { ctx, page, errors };
}
// frames until the place's tile tree has settled (and a little more)
const settle = (page, id) => page.evaluate(async id => { const G = __docklands3.globe, t0 = performance.now();
  while (performance.now() - t0 < 400000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); const st = G.placesStats().find(x => x.id === id); if (st && st.settled && performance.now() - t0 > 2500) break; }
  for (let k = 0; k < 4; k++) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }
  return G.placeLook(); }, id);
const shots = {};
for (const id of PLACES) {
  const V = VIEWS[id]; if (!V) { console.log('no view for', id); continue; }
  console.log(`--- ${id} ${W}x${H}@${DPR}${WEBGPU ? ' WebGPU' : ' WebGL 2'}`);
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}/docklands/?ll=${V.ll}&ht=0,55${WEBGPU ? '' : '&webgl'}&animate=0&weather=0&t=${DATE}T12:00`);
  await page.waitForFunction(p => { const G = window.__docklands3?.globe; if (!(G && G.mode === 'globe' && G.placesStats && window.docklands)) return false; G.dirty = true; return G.placesStats().find(x => x.id === p)?.settled; }, id, { timeout: 600000, polling: 500 });
  await page.evaluate(go => docklands.goTo(go), V.go);
  let L = await settle(page, id);
  check(L && L.place === id, 'the place reports its look (G.placeLook)', JSON.stringify(L && { look: L.look, sun: L.sun_altitude_deg, night: L.night, sky: L.sky, lights: L.lights }));
  check(L && /^Realistic/.test(L.look) && L.night === 0 && L.lights.sun > 1 && L.sky, 'day: Realistic look, no night windows, sun and sky on', `sun ${L?.sun_altitude_deg} deg up`);
  check(L && L.trees_drawn.near + L.trees_drawn.far > 0, 'trees drawn (the model\'s tree system)', JSON.stringify(L?.trees_drawn) + ' ' + JSON.stringify(L?.greens));
  const wt = await page.evaluate(id => __docklands3.globe.places.find(p => p.id === id).nodes.filter(n => n.decorated?.water).length, id);
  check(wt > 0, 'water polygons drawn on core tiles', `${wt} tiles with water; named in view: ${L?.water_named?.join(', ') || '-'}`);
  const d = await page.evaluate(() => docklands.describeView());
  check(/Drawn as the model/.test(d.text), 'describeView says how the place is drawn', (d.text.match(/Drawn as the model[^.]*\./) || [''])[0].slice(0, 200));
  let f = `${OUT}/look-${id}-day.png`; await page.screenshot({ path: f }); const sd = await stats(f); shots[id] = { day: f }; console.log('     ', f, JSON.stringify(sd));
  // the Map look (Look > Realistic buildings off)
  await page.evaluate(() => { const b = document.getElementById('look'); b.checked = false; b.dispatchEvent(new Event('change')); });
  L = await settle(page, id); check(/^Map/.test(L.look), 'Look > Realistic buildings off: the Map look', L.look);
  f = `${OUT}/look-${id}-map.png`; await page.screenshot({ path: f }); console.log('     ', f, JSON.stringify(await stats(f)));
  await page.evaluate(() => { const b = document.getElementById('look'); b.checked = true; b.dispatchEvent(new Event('change')); });
  // the styles: pixel art (flat colours), Painted and back to the Map style
  const sty = await page.evaluate(async () => { const S = window.__docklandsStyles; if (!S) return null; await S.setStyle('pixel'); return S.mode; });
  if (sty) { L = await settle(page, id); check(/^pixel/.test(L.look) && L.style === 'pixel', 'pixel art: the place takes the flat colours', L.look);
    f = `${OUT}/look-${id}-pixel.png`; await page.screenshot({ path: f }); console.log('     ', f);
    await page.evaluate(async () => { await __docklandsStyles.setStyle('paint'); }); L = await settle(page, id); check(/^Realistic/.test(L.look) && L.style === 'paint', 'Painted: the place keeps the Realistic look', L.style);
    await page.evaluate(async () => { await __docklandsStyles.setStyle('map'); }); L = await settle(page, id); check(L.style === 'map', 'back to the Map style'); }
  else check(false, 'styles module present');
  // Night: the Night button (main.js: 22:00 local of the view's day)
  await page.evaluate(() => document.getElementById('nightBtn').click());
  L = await settle(page, id);
  check(L.night > 0.99 && !L.sky && L.lights.sun === 0 && L.night_windows, 'Night button: night windows lit by the local hour, no sun, no day sky', JSON.stringify({ night: L.night, sun: L.sun_altitude_deg, windows: L.night_windows }));
  f = `${OUT}/look-${id}-night.png`; await page.screenshot({ path: f }); const sn = await stats(f); shots[id].night = f; console.log('     ', f, JSON.stringify(sn));
  check(sn.luma < sd.luma * 0.5 && sn.lit > 0.0005, 'night picture: darker, with lit windows', `luma ${sd.luma} -> ${sn.luma}; lit window pixels ${(sn.lit * 100).toFixed(2)} %`);
  check(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
  await ctx.close();
}
// London (the model) at the same local times, for the comparison
if (!process.argv.includes('--no-london')) {
  for (const [k, t] of [['day', '12:00'], ['night', '22:00']]) {
    const { ctx, page, errors } = await newPage();
    await page.goto(`${BASE}/docklands/?view=cw${WEBGPU ? '' : '&webgl'}&animate=0&weather=0&t=${DATE}T${t}`);
    await page.waitForFunction(() => window.__docklands3?.ready, null, { timeout: 600000 });
    await page.evaluate(async () => { for (let k = 0; k < 3; k++) { __docklands3.frameNow(); await new Promise(r => setTimeout(r, 200)); } });
    await page.waitForTimeout(3000);
    const f = `${OUT}/look-london-${k}.png`; await page.screenshot({ path: f, timeout: 300000 }); (shots.london ||= {})[k] = f; console.log('     ', f, JSON.stringify(await stats(f)));
    check(errors.length === 0, `London ${k}: no page errors`, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
}
// side by side: León, Sarajevo, London (each scaled to a third of the width)
for (const k of ['day', 'night']) {
  const files = ['leon', 'sarajevo', 'london'].map(p => shots[p]?.[k]).filter(f => f && existsSync(f)); if (files.length < 2) continue;
  const ims = await Promise.all(files.map(f => loadImage(f))), w = 640, h = Math.round(ims[0].height * w / ims[0].width), cv = createCanvas(w * ims.length, h + 28), c = cv.getContext('2d');
  c.fillStyle = '#111'; c.fillRect(0, 0, cv.width, cv.height); c.font = '16px sans-serif'; c.fillStyle = '#eee';
  ims.forEach((im, i) => { c.drawImage(im, i * w, 28, w, h); c.fillText(files[i].replace(/^.*look-|\.png$/g, ''), i * w + 8, 20); });
  const f = `${OUT}/look-compare-${k}.png`; (await import('node:fs')).writeFileSync(f, cv.toBuffer('image/png')); console.log('     side by side', f);
}
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
