// Headless check of the Painted style of the Three.js port (docklands/styles.js, ?style=paint). For each query it loads the
// page in the Painted style, fails on a page error or a console error (network failures are only listed), takes the frame
// in the Painted style and in the map style at the same camera, and checks:
//  - the two frames differ (mean absolute difference of the 8-bit RGB over 3),
//  - the Painted frame has texture at the dab scale where the map is flat: in the 8 x 8 px blocks whose map standard
//    deviation of luma is under 2 (sky, water, plain walls), the mean Painted deviation is over 1.5 and over 1.4 x the map's,
//  - (with --cost) the frame cost: the median of 7 frames (pipe.render() and a 1-pixel readPixels that waits for the GPU),
//    three rounds of map then paint; the median of the rounds. --bare hides the scene first: the time is then the output
//    passes alone (the paint pass against the map's tone mapping only).
// Software rendering (SwiftShader): the cost numbers compare the styles; they are not a phone's frame rate.
// Run from the repository root with a server on the root:
//   python3 -m http.server 8188 --bind 127.0.0.1 &
//   node docklands/test/paint-check.mjs [--base http://127.0.0.1:8188] [--out dir] [--webgpu] [--cost [--bare]]
//        [--size 1288x966@2] [--query 'view=greenlanddock&t=2026-10-11T12:45']
// Skill: docklands-3d-page, "Three.js port: Painted style (2026-10-11)".
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8188'), OUT = arg('--out', 'docklands/test/out'), WEBGPU = process.argv.includes('--webgpu');
const COST = process.argv.includes('--cost'), BARE = process.argv.includes('--bare');
const [, W, H, DPR] = (arg('--size', '1288x966@2').match(/(\d+)x(\d+)@([\d.]+)/) || []).map(Number);
const QUERIES = arg('--query', '') ? [arg('--query')] : ['view=greenlanddock&t=2026-10-11T12:45', 'view=cw', 'view=rotherhithe'];
mkdirSync(OUT, { recursive: true });
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
let failed = 0;
for (const q of QUERIES) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR }), errors = [], net = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() !== 'error') return; (/Failed to load resource|net::|timed? ?out|fetch/i.test(m.text()) ? net : errors).push(m.text()); });
  const t0 = Date.now();
  await page.goto(`${BASE}/docklands/?${q}&style=paint${WEBGPU ? '' : '&webgl'}&animate=0`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const ok = await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && globalThis.__docklandsStyles && __docklandsStyles.mode === 'paint', null, { timeout: 300000 }).then(() => true).catch(() => false);
  if (!ok) { failed++; console.log(`FAIL ${q} not ready`, errors.slice(0, 5)); await page.close(); continue; }
  await page.waitForTimeout(6000);
  // one frame as a PNG data URL (main.js __d3snap: the frame just drawn), then its pixels
  const grab = () => page.evaluate(() => new Promise(r => { globalThis.__d3snap = r; __docklands3.draw(); }));
  const pixels = url => page.evaluate(async url => { const im = new Image(); im.src = url; await im.decode(); const c = new OffscreenCanvas(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0);
    return { w: im.width, h: im.height, d: Array.from(x.getImageData(0, 0, im.width, im.height).data) }; }, url);
  const paintUrl = await grab(); await page.waitForTimeout(500);
  await page.evaluate(() => __docklandsStyles.setStyle('map')); await page.waitForTimeout(4000);
  const mapUrl = await grab();
  const tag = `${q.replace(/[^a-z0-9]+/gi, '-')}-${W}x${H}@${DPR}${WEBGPU ? '-webgpu' : ''}`;
  for (const [n, u] of [['paint', paintUrl], ['map', mapUrl]]) if (u) writeFileSync(`${OUT}/paint-check-${tag}-${n}.png`, Buffer.from(u.split(',')[1], 'base64'));
  let res = { note: 'no frame' };
  if (paintUrl && mapUrl) {
    const P = await pixels(paintUrl), M = await pixels(mapUrl), n = P.w * P.h;
    let diff = 0; for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) diff += Math.abs(P.d[4 * i + c] - M.d[4 * i + c]);
    diff /= n * 3;
    const lum = (D, i) => 0.2126 * D[4 * i] + 0.7152 * D[4 * i + 1] + 0.0722 * D[4 * i + 2];
    const sd = (D, x0, y0) => { let s = 0, s2 = 0; for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 8; x++) { const v = lum(D, y * P.w + x); s += v; s2 += v * v; } const m = s / 64; return Math.sqrt(Math.max(0, s2 / 64 - m * m)); };
    let nb = 0, sp = 0, sm = 0;
    for (let y = 0; y + 8 <= P.h; y += 8) for (let x = 0; x + 8 <= P.w; x += 8) { const a = sd(M.d, x, y); if (a < 2) { nb++; sm += a; sp += sd(P.d, x, y); } }
    res = { diff: +diff.toFixed(2), flatBlocks: nb, flatSdMap: +(sm / Math.max(1, nb)).toFixed(2), flatSdPaint: +(sp / Math.max(1, nb)).toFixed(2) };
    res.pass = diff > 3 && nb > 50 && res.flatSdPaint > 1.5 && res.flatSdPaint > 1.4 * res.flatSdMap;
  }
  if (COST) {   // the time of one frame: pipe.render() then a 1-pixel readPixels, which waits for the GPU; median of 7
    if (BARE) await page.evaluate(() => { for (const o of __docklands3.scene.children) o.visible = false; });   // --bare: an empty scene, so the time is the output pass
    const run = style => page.evaluate(async style => {
      const S = await import('/docklands/main.js'), P = S.styleHook.pipe, R = __docklands3.renderer, gl = R.backend.gl;
      await __docklandsStyles.setStyle(style); __docklands3.draw(); await new Promise(r => setTimeout(r, 3000));   // the first frames compile the shaders
      const px = new Uint8Array(4), t = [];
      for (let i = 0; i < 9; i++) { const t0 = performance.now(); P.render(); if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); else await R.backend.device.queue.onSubmittedWorkDone(); t.push(performance.now() - t0); }
      t.splice(0, 2); t.sort((a, b) => a - b); return +t[3].toFixed(0);
    }, style);
    const m = [], p = []; for (let r = 0; r < 3; r++) { m.push(await run('map')); p.push(await run('paint')); }
    const med = a => [...a].sort((x, y) => x - y)[1];
    res.msPerFrame = { map: m, paint: p, medianMap: med(m), medianPaint: med(p) };
  }
  const backend = await page.evaluate(() => __docklands3.backend);
  const bad = errors.length || !res.pass; if (bad) failed++;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${q} ${W}x${H}@${DPR} ${backend} ${((Date.now() - t0) / 1000).toFixed(0)} s ${JSON.stringify(res)} -> ${OUT}/paint-check-${tag}-paint.png`);
  for (const e of errors.slice(0, 8)) console.log('     ' + e.slice(0, 400));
  if (net.length) console.log(`     (${net.length} network errors, ignored)`);
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
