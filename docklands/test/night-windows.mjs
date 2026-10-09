// Night windows: the Three.js port (docklands/) with ?nightstyle=old and with the new patterns, side by side with the owner's
// night photos of 3 October 2026 (cwplans/docklands/reference/night-2026-10-03/), at the photo views and the photo time, and
// numbers for each frame in one region of the skyline: share of lit pixels, lit spots (4-connected) and their size, colour
// temperature of the lit pixels (McCamy, from sRGB), luma histogram. Writes <out>/<view>-{old,new,photo}.png, a side-by-side
// <view>-compare.png and <out>/night-windows.json. Run from the repository root with a server on the root:
//   python3 -m http.server 8188 --bind 127.0.0.1 &
//   node docklands/test/night-windows.mjs [--base http://127.0.0.1:8188] [--out dir] [--views rotherhithe,greenland,pier]
//        [--styles old,new] [--layers registry,nightlights,water,trees | all] [--t 2026-10-03T23:56] [--webgpu] [--measure-only]
// Skill: docklands-3d-page, "Night windows by use and hour".
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8188'), OUT = arg('--out', 'docklands/test/out/night'), T = arg('--t', '2026-10-03T23:56');
const LAYERS = arg('--layers', 'registry,nightlights,water,trees');   // the layers that light the night; data overlays (works in progress boxes) off, or their colours count as lit
const VIEWS = arg('--views', 'rotherhithe,greenland,pier').split(','), STYLES = arg('--styles', 'old,new').split(','), WEBGPU = process.argv.includes('--webgpu');
const REF = 'cwplans/docklands/reference/night-2026-10-03/';
const PHOTO = { rotherhithe: 'promenade-skyline-railing.jpg', greenland: 'promenade-skyline-bollard.jpg', pier: 'clipper-canary-wharf-pier.jpg' };
// the region measured, as fractions of the frame (x0, y0, x1, y1): the skyline above the far bank, the same box in photo and render
const ROI = { rotherhithe: [0, 0.08, 1, 0.45], greenland: [0, 0.08, 1, 0.45], pier: [0.38, 0.0, 1, 0.62] };
const W = 1400, H = 1050;   // the photos' 4:3
mkdirSync(OUT, { recursive: true });
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
const errors = [];
if (!process.argv.includes('--measure-only')) for (const view of VIEWS) for (const st of STYLES) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(`${view} ${st}: pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${view} ${st}: console: ${m.text()}`); });
  const t0 = Date.now();
  await page.goto(`${BASE}/docklands/?view=${view}&t=${T}&weather=0&animate=0${WEBGPU ? '' : '&webgl'}&nightstyle=${st}${LAYERS === 'all' ? '' : '&layers=' + LAYERS}`);
  await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && __docklands3.ctx.buildOpts.useOf, null, { timeout: 300000 });
  await page.waitForTimeout(6000);   // the rebuild with the registry's uses, the facade atlas
  await page.evaluate(() => { document.querySelectorAll('body > *:not(canvas)').forEach(e => { if (!e.contains(document.querySelector('canvas'))) e.style.visibility = 'hidden'; }); __docklands3.draw(); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${view}-${st}.png`, timeout: 300000 });
  console.log(`${view} ${st}: ${((Date.now() - t0) / 1000).toFixed(0)} s, ${await page.evaluate(() => __docklands3.backend)}`);
  await page.close();
}
// measure in a page: the photo (scaled to W x H) and each render
const page = await browser.newPage({ viewport: { width: W * 2, height: H * 2 } });
const res = {};
for (const view of VIEWS) {
  const imgs = { photo: 'data:image/jpeg;base64,' + readFileSync(REF + PHOTO[view]).toString('base64') };
  for (const st of STYLES) if (existsSync(`${OUT}/${view}-${st}.png`)) imgs[st] = 'data:image/png;base64,' + readFileSync(`${OUT}/${view}-${st}.png`).toString('base64');
  res[view] = await page.evaluate(async ([imgs, roi, W, H]) => {
    const out = {}, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true });
    const lin = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    const strip = document.createElement('canvas'); strip.width = W * Object.keys(imgs).length / 2; strip.height = H / 2; const sg = strip.getContext('2d'); let k = 0;
    for (const [name, src] of Object.entries(imgs)) {
      const im = new Image(); im.src = src; await im.decode(); g.drawImage(im, 0, 0, W, H); sg.drawImage(im, k++ * W / 2, 0, W / 2, H / 2);
      const x0 = Math.round(roi[0] * W), y0 = Math.round(roi[1] * H), x1 = Math.round(roi[2] * W), y1 = Math.round(roi[3] * H), w = x1 - x0, h = y1 - y0;
      const d = g.getImageData(x0, y0, w, h).data, lit = new Uint8Array(w * h), hist = new Array(8).fill(0), ccts = [];
      let nLit = 0, nRed = 0;
      for (let i = 0; i < w * h; i++) {
        const r = d[4 * i] / 255, gg = d[4 * i + 1] / 255, b = d[4 * i + 2] / 255, Y = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        hist[Math.min(7, Math.floor(Y * 8))]++;
        if (r > 0.45 && r > 2 * gg && r > 2 * b) { nRed++; continue; }   // aviation lights
        if (Y < 0.32) continue;
        lit[i] = 1; nLit++;
        if (Math.max(r, gg, b) > 0.97) continue;   // clipped: no colour
        const R = lin(r), G = lin(gg), B = lin(b), X = 0.4124 * R + 0.3576 * G + 0.1805 * B, YY = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = 0.0193 * R + 0.1192 * G + 0.9505 * B, s = X + YY + Z;
        const x = X / s, y = YY / s, n = (x - 0.3320) / (0.1858 - y); ccts.push(449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33);
      }
      // lit spots: 4-connected components
      const lab = new Int32Array(w * h), sizes = []; const st = [];
      for (let i = 0; i < w * h; i++) if (lit[i] && !lab[i]) { let n = 0; lab[i] = sizes.length + 1; st.push(i);
        while (st.length) { const j = st.pop(); n++; const x = j % w, y = (j / w) | 0;
          for (const q of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) if (q >= 0 && lit[q] && !lab[q]) { lab[q] = lab[i]; st.push(q); } }
        sizes.push(n); }
      sizes.sort((a, b) => a - b); ccts.sort((a, b) => a - b);
      const q = (A, p) => A.length ? Math.round(A[Math.min(A.length - 1, Math.floor(p * A.length))]) : null, share = (A, a, b) => A.length ? +(A.filter(v => v >= a && v < b).length / A.length).toFixed(3) : null;
      out[name] = { litShare: +(nLit / (w * h)).toFixed(4), red: nRed, spots: sizes.length, spotsPerMpx: Math.round(sizes.length / (w * h) * 1e6), spotMedianPx: q(sizes, 0.5), spotP90Px: q(sizes, 0.9),
        cct: { n: ccts.length, p10: q(ccts, 0.1), p50: q(ccts, 0.5), p90: q(ccts, 0.9), under3000: share(ccts, 0, 3000), k3to4: share(ccts, 3000, 4000), k4to5: share(ccts, 4000, 5000), over5000: share(ccts, 5000, 1e9) },
        lumaHist: hist.map(v => +(v / (w * h)).toFixed(4)) };
    }
    return { m: out, strip: strip.toDataURL('image/png') };
  }, [imgs, ROI[view], W, H]);
  writeFileSync(`${OUT}/${view}-compare.png`, Buffer.from(res[view].strip.split(',')[1], 'base64')); delete res[view].strip; res[view] = res[view].m;
  for (const [k, v] of Object.entries(res[view])) console.log(`${view.padEnd(11)} ${k.padEnd(5)} lit ${(v.litShare * 100).toFixed(2)} %  spots ${v.spots} (${v.spotsPerMpx}/Mpx, median ${v.spotMedianPx} px)  CCT p10/50/90 ${v.cct.p10}/${v.cct.p50}/${v.cct.p90} K  <3000 ${v.cct.under3000} 3-4k ${v.cct.k3to4} 4-5k ${v.cct.k4to5} >5000 ${v.cct.over5000}`);
}
writeFileSync(`${OUT}/night-windows.json`, JSON.stringify({ t: T, backend: WEBGPU ? 'webgpu' : 'webgl2', roi: ROI, res }, null, 1));
await browser.close();
for (const e of errors.slice(0, 10)) console.log('  ' + e.slice(0, 300));
process.exit(errors.length ? 1 : 0);
