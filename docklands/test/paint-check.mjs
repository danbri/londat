// Headless check of the Painted style of the Three.js port (docklands/styles.js, ?style=paint). For each query it loads the
// page in the Painted style, fails on a page error or a console error (network failures are only listed), takes the frame
// in the Painted style and in the map style at the same camera, and checks:
//  - the two frames differ (mean absolute difference of the 8-bit RGB over 3),
//  - the Painted frame has texture at the dab scale where the map is flat: in the 8 x 8 px blocks whose map standard
//    deviation of luma is under 2 (sky, water, plain walls), the mean Painted deviation is over 1.5 and over 1.4 x the map's
//    (at night: difference over 1.5, deviation over max(0.25, 2 x the map's)),
//  - no confetti (owner, 2026-10-11: "speckled noise"): in the 8 x 8 blocks that are grey in the map, the chroma the paint
//    adds (SPECK.chroma) and the share of blocks given strong colour (SPECK.invented); over all blocks, the chroma error of
//    the block means against the map (SPECK.blockChroma); the Laplacian numbers (chromaHF, lap) are information only,
//  - the data layers crisp: in the pixels that the data layers (and the railway lines) change in the map frame, the paint
//    frame differs from the map by under max(6, 0.6 x the frame's difference) and keeps 60 % of the map's sharpness,
//  - the motion tier (first query; --no-motion skips it): with ?animate=0 the camera turns every frame for 1.5 s, then stops.
//    Fails unless the frames drawn while it turns are of the moving tier, a full-detail frame is drawn 150 to 700 ms after
//    the last camera change (or 250 ms + 2 moving frame times, in slow software rendering), and at most 3 frames follow it
//    in the next second (the page stops drawing while still). The scene is hidden while it runs (the tier logic does not
//    depend on it, and a full frame takes seconds in software at dpr 2).
//    Prints the moving frame times (perf.js: requestAnimationFrame intervals, median and 95th percentile).
//  - (with --cost) the frame cost: the median of 7 frames (one frame of the page's loop, __docklands3.frameNow(), with its
//    style hooks, or pipe.render() on an older page, and a 1-pixel readPixels that waits for the GPU), still and with the
//    camera turned before each frame (moving), three rounds of map, paint full, paint lite and paint auto; the median of the
//    rounds. --bare hides the scene first: the time is then the output passes alone (the paint pass against the map's tone
//    mapping only). The look checks use ?paint=full (the auto tier would change the look in software rendering).
// Software rendering (SwiftShader): the cost numbers compare the styles; they are not a phone's frame rate.
// Run from the repository root with a server on the root:
//   python3 -m http.server 8188 --bind 127.0.0.1 &
//   node docklands/test/paint-check.mjs [--base http://127.0.0.1:8188] [--out dir] [--webgpu] [--cost [--bare]]
//        [--size 1288x966@2] [--query 'view=greenlanddock&t=2026-10-11T12:45']
//        [--styles old-styles.js] (serve another styles.js, to calibrate the speckle limits on an older pass) [--no-motion]
// Skill: docklands-3d-page, "Three.js port: Painted style (2026-10-11)" and "Painted style, snappier (2026-10-12)".
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8188'), OUT = arg('--out', 'docklands/test/out'), WEBGPU = process.argv.includes('--webgpu');
// confetti limits: mean chroma added in grey blocks, and the % of grey blocks given over 20 of chroma (invented colour).
// and the chroma error of the 8 x 8 block means against the map (blockChroma). Calibrated 2026-10-11 at 390 x 844 @2 on the
// high view (skill section): the first pass (before the low-pass) 1.38 % and 9.7, this one 0.01 % and 4.2
const SPECK = { chroma: 6, invented: 0.8, blockChroma: 7 };
const COST = process.argv.includes('--cost'), BARE = process.argv.includes('--bare'); let MOTION = !process.argv.includes('--no-motion');
const [, W, H, DPR] = (arg('--size', '1288x966@2').match(/(\d+)x(\d+)@([\d.]+)/) || []).map(Number);
// the owner's cases (2026-10-11): high over dense blocks (confetti), low under a tree row (low-poly crowns), the photo view,
// Canary Wharf and Rotherhithe at night; weather=0 so the haze is the same in every run
const QUERIES = arg('--query', '') ? [arg('--query')] : ['view=greenlanddock&t=2026-10-11T12:45&weather=0', 't=2026-10-11T15:57&weather=0#v=1&c=0,500,0,3500,0.3,1.3',
  't=2026-10-11T15:57&weather=0#v=1&c=-1530,1150,6,30,-0.9,0.05', 't=2026-10-11T15:57&weather=0#v=1&c=-3900,40,0,650,0.3,0.9', 'view=cw&weather=0', 'view=rotherhithe&weather=0'];
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
  if (arg('--styles', '')) await page.route(/docklands\/styles\.js/, r => r.fulfill({ contentType: 'text/javascript', body: readFileSync(arg('--styles'), 'utf8') }));   // calibration: an older styles.js
  const [qq, hh] = q.split('#');   // a share hash (#v=1&c=...) goes after the query
  await page.goto(`${BASE}/docklands/?${qq}&style=paint&paint=full${WEBGPU ? '' : '&webgl'}&animate=0${hh ? '#' + hh : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const ok = await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && globalThis.__docklandsStyles && __docklandsStyles.mode === 'paint', null, { timeout: 300000 }).then(() => true).catch(() => false);
  if (!ok) { failed++; console.log(`FAIL ${q} not ready`, errors.slice(0, 5)); await page.close(); continue; }
  await page.waitForTimeout(6000);
  // one frame as a PNG data URL (main.js __d3snap: the frame just drawn), then its pixels
  const grab = () => page.evaluate(() => new Promise(r => { globalThis.__d3snap = r; __docklands3.draw(); }));
  const pixels = url => page.evaluate(async url => { const im = new Image(); im.src = url; await im.decode(); const c = new OffscreenCanvas(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0);
    return { w: im.width, h: im.height, d: Array.from(x.getImageData(0, 0, im.width, im.height).data) }; }, url);
  const night = await page.evaluate(() => __docklands3.U.night.value > 0.5);
  const paintUrl = await grab(); await page.waitForTimeout(500);
  await page.evaluate(() => __docklandsStyles.setStyle('map')); await page.waitForTimeout(4000);
  const mapUrl = await grab();
  // the map frame without the data layers: the pixels that change are the overlay pixels (for the crispness check)
  const OVL = ['overlays', 'river', 'routes', 'kml', 'locate', 'keys', 'planes', 'walls', 'ships', 'piers'];   // styles.js OVERLAY_LAYERS
  const hid = await page.evaluate(ids => { const L = __docklands3.layers, R = __docklands3.ctx.meshes && __docklands3.ctx.meshes.rail, h = [];
    for (const id of ids) { const o = L[id] && L[id].api && L[id].api.object; if (o && o.visible) { o.visible = false; h.push(o); } }
    if (R && R.visible) { R.visible = false; h.push(R); } globalThis.__pcHidden = h; return h.length; }, OVL);   // and the railway lines (styles.js: drawn crisp too)
  await page.waitForTimeout(1500); const bareUrl = hid ? await grab() : null;
  await page.evaluate(() => { for (const o of globalThis.__pcHidden) o.visible = true; }); await page.waitForTimeout(1500);
  const map2Url = await grab();   // a second map frame: pixels that moved (clouds drift, aircraft fly) are left out of every measure
  await page.evaluate(() => __docklandsStyles.setStyle('paint')); await page.waitForTimeout(4000);
  const paint2Url = await grab();
  await page.evaluate(() => { __docklandsStyles.paint.showMask = true; }); await page.waitForTimeout(1500);
  const maskUrl = await grab(); await page.evaluate(() => { __docklandsStyles.paint.showMask = false; __docklands3.draw(); });   // the style's own data-layer mask   // a second paint frame: what moved between the frames is left out of the speckle measure
  const tag = `${q.replace(/[^a-z0-9]+/gi, '-')}-${W}x${H}@${DPR}${WEBGPU ? '-webgpu' : ''}`;
  for (const [n, u] of [['paint', paintUrl], ['map', mapUrl]]) if (u) writeFileSync(`${OUT}/paint-check-${tag}-${n}.png`, Buffer.from(u.split(',')[1], 'base64'));
  let res = { note: 'no frame' };
  if (paintUrl && mapUrl) {
    const P = await pixels(paintUrl), M = await pixels(mapUrl), P2 = paint2Url ? await pixels(paint2Url) : null, M2 = await pixels(map2Url), n = P.w * P.h;
    let diff = 0; for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) diff += Math.abs(P.d[4 * i + c] - M.d[4 * i + c]);
    diff /= n * 3;
    const lum = (D, i) => 0.2126 * D[4 * i] + 0.7152 * D[4 * i + 1] + 0.0722 * D[4 * i + 2];
    const sd = (D, x0, y0) => { let s = 0, s2 = 0; for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 8; x++) { const v = lum(D, y * P.w + x); s += v; s2 += v * v; } const m = s / 64; return Math.sqrt(Math.max(0, s2 / 64 - m * m)); };
    let nb = 0, sp = 0, sm = 0;
    for (let y = 0; y + 8 <= P.h; y += 8) for (let x = 0; x + 8 <= P.w; x += 8) { const a = sd(M.d, x, y); if (a < 2) { nb++; sm += a; sp += sd(P.d, x, y); } }
    res = { diff: +diff.toFixed(2), flatBlocks: nb, flatSdMap: +(sm / Math.max(1, nb)).toFixed(2), flatSdPaint: +(sp / Math.max(1, nb)).toFixed(2) };
    // speckle ("confetti", owner 2026-10-11): in the 8 x 8 blocks that are grey in the map (mean chroma max-min of RGB under
    // 24 of 255): the mean chroma the paint adds, the share of blocks given over 20 of chroma (fails), and for information
    // the spread of chroma inside a block and the mean absolute Laplacian of luma (high-frequency energy), paint and map
    const chr = (D, i) => Math.max(D[4 * i], D[4 * i + 1], D[4 * i + 2]) - Math.min(D[4 * i], D[4 * i + 1], D[4 * i + 2]);
    const blk = (D, x0, y0) => { let s = 0, s2 = 0, lap = 0, ls = 0; for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 8; x++) { const i = y * P.w + x, c = chr(D, i); s += c; s2 += c * c; ls += lum(D, i);
      if (x > 0 && y > 0 && x < P.w - 1 && y < P.h - 1) lap += Math.abs(4 * lum(D, i) - lum(D, i - 1) - lum(D, i + 1) - lum(D, i - P.w) - lum(D, i + P.w)); }
      const m = s / 64; return { m, sd: Math.sqrt(Math.max(0, s2 / 64 - m * m)), lap: lap / 64, l: ls / 64 }; };
    let ng = 0, cm = 0, cp = 0, sdm = 0, sdp = 0, lm = 0, lp = 0, inv = 0;
    // blocks that changed between the two paint frames (clouds and aircraft move) are left out
    for (let y = 8; y + 16 <= P.h; y += 8) for (let x = 8; x + 16 <= P.w; x += 8) {
      const a = blk(M.d, x, y); if (a.m >= 24) continue;
      const b = blk(P.d, x, y); if ((P2 && Math.abs(blk(P2.d, x, y).l - b.l) > 4) || Math.abs(blk(M2.d, x, y).l - a.l) > 2) continue;
      ng++; if (b.m - a.m > 20) inv++;
      cm += a.m; cp += b.m; sdm += a.sd; sdp += b.sd; lm += a.lap; lp += b.lap; }
    const k = 1 / Math.max(1, ng);
    res.grey = { blocks: ng, chromaMap: +(cm * k).toFixed(1), chromaPaint: +(cp * k).toFixed(1), spreadMap: +(sdm * k).toFixed(1), spreadPaint: +(sdp * k).toFixed(1), lapMap: +(lm * k).toFixed(1), lapPaint: +(lp * k).toFixed(1), inventedPct: +(100 * inv * k).toFixed(2) };
    res.confetti = ng > 50 && (res.grey.chromaPaint - res.grey.chromaMap > SPECK.chroma || res.grey.inventedPct > SPECK.invented);
    // high-frequency colour ("speckled noise", owner 2026-10-11): the mean absolute Laplacian of chroma (max - min of RGB) over
    // the frame, paint over map. Fine far detail as confetti raises it; calm far colour keeps it near the map's.
    let hfm = 0, hfp = 0;
    for (let y = 1; y < P.h - 1; y += 2) for (let x = 1; x < P.w - 1; x += 2) { const i = y * P.w + x;
      for (const [D, add] of [[M.d, v => hfm += v], [P.d, v => hfp += v]]) add(Math.abs(4 * chr(D, i) - chr(D, i - 1) - chr(D, i + 1) - chr(D, i - P.w) - chr(D, i + P.w))); }
    res.chromaHF = { map: +(hfm / (n / 4)).toFixed(2), paint: +(hfp / (n / 4)).toFixed(2), ratio: +(hfp / Math.max(1, hfm)).toFixed(2) };   // information only: the map's own fine detail dominates it
    // colour at the dab scale (fails): in every 8 x 8 block, the block's mean colour minus its luma (the chroma vector), paint
    // against map, summed over RGB; the mean over the blocks that did not change between the two paint frames. A dab coloured
    // by a point sample of fine detail ("confetti") puts the wrong mean colour in its block; a low-passed dab does not.
    const bm = (D, x0, y0) => { let r = 0, g = 0, b = 0; for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 8; x++) { const i = 4 * (y * P.w + x); r += D[i]; g += D[i + 1]; b += D[i + 2]; }
      r /= 64; g /= 64; b /= 64; const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; return [r - l, g - l, b - l, l]; };
    // The style's saturation lift scales every chroma vector alike, so the map's vectors are first scaled by the least-squares
    // factor k (reported): what is left is colour that is wrong or invented, not a stronger colour.
    const BP = [], BM = [];
    for (let y = 0; y + 8 <= P.h; y += 8) for (let x = 0; x + 8 <= P.w; x += 8) {
      const p = bm(P.d, x, y), m = bm(M.d, x, y); if ((P2 && Math.abs(bm(P2.d, x, y)[3] - p[3]) > 4) || Math.abs(bm(M2.d, x, y)[3] - m[3]) > 2) continue;
      BP.push(p); BM.push(m); }
    let pm = 0, mm = 0; for (let j = 0; j < BP.length; j++) for (let c = 0; c < 3; c++) { pm += BP[j][c] * BM[j][c]; mm += BM[j][c] * BM[j][c]; }
    const ks = mm > 0 ? pm / mm : 1; let ce = 0;
    for (let j = 0; j < BP.length; j++) for (let c = 0; c < 3; c++) ce += Math.abs(BP[j][c] - ks * BM[j][c]);
    res.blockChromaErr = +(ce / Math.max(1, BP.length)).toFixed(2); res.blockChromaK = +ks.toFixed(2);
    res.confetti = res.confetti || res.blockChromaErr > SPECK.blockChroma;
    // overlays crisp: in the pixels where the data layers change the map frame (over 40 of RGB sum), the paint frame should
    // match the map frame much better than elsewhere, and keep the overlay's sharpness (mean absolute Laplacian of luma)
    if (bareUrl) {
      // only the overlay pixels under the style's mask: the others are reflections of the data layers in the water mirror
      // (painted with the water, as they should be) or overlays hidden by a nearer surface; the share under the mask is reported
      const B = await pixels(bareUrl), K = await pixels(maskUrl); let no = 0, nall = 0, od = 0, lm2 = 0, lp2 = 0;
      for (let y = 1; y < P.h - 1; y++) for (let x = 1; x < P.w - 1; x++) { const i = y * P.w + x;
        const dd = (X, Y) => Math.abs(X[4 * i] - Y[4 * i]) + Math.abs(X[4 * i + 1] - Y[4 * i + 1]) + Math.abs(X[4 * i + 2] - Y[4 * i + 2]);
        if (dd(M.d, B.d) <= 40 || dd(M.d, M2.d) > 12 || (P2 && dd(P.d, P2.d) > 24)) continue;   // an overlay pixel that stood still
        nall++; if (K.d[4 * i + 1] < 128) continue;
        no++; for (let c = 0; c < 3; c++) od += Math.abs(P.d[4 * i + c] - M.d[4 * i + c]) / 3;
        const lap = D => Math.abs(4 * lum(D, i) - lum(D, i - 1) - lum(D, i + 1) - lum(D, i - P.w) - lum(D, i + P.w)); lm2 += lap(M.d); lp2 += lap(P.d); }
      res.overlay = { changed: nall, masked: +(no / Math.max(1, nall)).toFixed(2), pixels: no, diff: +(od / Math.max(1, no)).toFixed(2), sharpMap: +(lm2 / Math.max(1, no)).toFixed(1), sharpPaint: +(lp2 / Math.max(1, no)).toFixed(1) };
      res.overlayCrisp = no < 300 || (res.overlay.diff < Math.max(6, 0.6 * diff) && res.overlay.sharpPaint > 0.6 * res.overlay.sharpMap);
    }
    // at night (U.night over 0.5) the style keeps the lit windows as points (keepN) and the frame is mostly near black, so
    // the difference and the texture are smaller in 8-bit numbers: diff over 1.5, flat-block texture over max(0.25, 2 x map)
    res.night = night;
    res.pass = (night ? diff > 1.5 && res.flatSdPaint > Math.max(0.25, 2 * res.flatSdMap) : diff > 3 && res.flatSdPaint > 1.5 && res.flatSdPaint > 1.4 * res.flatSdMap)
      && nb > 50 && !res.confetti && res.overlayCrisp !== false;
  }
  if (MOTION && res.pass !== undefined) {   // the motion tier: moving frames cheaper, then one full-detail frame, then no more
    MOTION = false;
    const m = await page.evaluate(async () => {
      // the scene hidden while it runs (a full frame takes seconds in software at dpr 2): the tier logic does not depend on it
      const D = __docklands3, S = __docklandsStyles, hid = D.scene.children.filter(o => o.visible); for (const o of hid) o.visible = false;
      S.setPaintTier('full'); D.draw(); await new Promise(r => setTimeout(r, 1500));
      const s0 = D.camState(); let yaw = s0.yaw; const t0 = performance.now(), tiers = [];
      await new Promise(done => { const f = () => { if (performance.now() - t0 > 1500) { done(); return; } yaw += 0.004; D.setCam({ ...D.camState(), yaw }); tiers.push(S.paintMoving); requestAnimationFrame(f); }; requestAnimationFrame(f); });
      const mv = D.perf.stats({ moving: true }), last = D.perf.lastMove;
      let fr = [], full = null;
      for (let k = 0; k < 40 && !full; k++) { await new Promise(r => setTimeout(r, 250)); fr = D.perf.frames().filter(x => x.t > last - 50); full = fr.find(x => !/moving/.test(x.tier)); }
      await new Promise(r => setTimeout(r, 1000)); const fr2 = D.perf.frames();
      for (const o of hid) o.visible = true; D.draw();
      // the first frame drawn after the settle time: its start may be later than 700 ms when the frame before it was slow
      const prevEnd = full ? Math.max(...fr.filter(x => x.t < full.t).map(x => x.t + x.ms), last) : null;
      return { movingFrames: mv.samples, movingMs: mv.frame_ms, movingTiers: tiers.filter(Boolean).length + '/' + tiers.length,
        fullAfterMs: full ? Math.round(full.t - last) : null, waitedOnSlowFrame: full ? Math.round(prevEnd - last) : null,
        framesAfterFull: full ? fr2.filter(x => x.t > full.t).length : null, tier: S.paintTier };
    });
    res.motion = m;
    const ok = m.fullAfterMs != null && m.fullAfterMs >= 150 && m.fullAfterMs <= Math.max(700, m.waitedOnSlowFrame + 100, 250 + 2 * (m.movingMs.median || 0)) && m.framesAfterFull <= 3 && /^[1-9]/.test(m.movingTiers);
    res.motionOk = ok; res.pass = res.pass && ok;
  }
  if (COST) {   // the time of one frame: pipe.render() then a 1-pixel readPixels, which waits for the GPU; median of 7
    if (BARE) await page.evaluate(() => { for (const o of __docklands3.scene.children) o.visible = false; });   // --bare: an empty scene, so the time is the output pass
    const run = (style, moving) => page.evaluate(async ([style, moving]) => {
      const S = await import('/docklands/main.js'), P = S.styleHook.pipe, D = __docklands3, R = D.renderer, gl = R.backend.gl, St = __docklandsStyles;
      await St.setStyle(style === 'map' ? 'map' : 'paint'); if (St.setPaintTier) St.setPaintTier(style === 'map' || style === 'paint' ? 'full' : style); D.draw();
      await new Promise(r => setTimeout(r, style === 'auto' ? 4000 : 2500));   // the first frames compile the shaders
      const one = () => { if (moving) D.setCam({ ...D.camState(), yaw: D.camState().yaw + 0.004 }); if (D.frameNow) D.frameNow(); else P.render(); };
      if (style === 'auto') for (let i = 0; i < 24; i++) { one(); if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); }   // let the auto tier settle
      if (!moving) await new Promise(r => setTimeout(r, 300));   // still: after the settle time
      const px = new Uint8Array(4), t = [];
      for (let i = 0; i < 9; i++) { const t0 = performance.now(); one(); if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); else await R.backend.device.queue.onSubmittedWorkDone(); t.push(performance.now() - t0); }
      t.splice(0, 2); t.sort((a, b) => a - b); return [+t[3].toFixed(0), St.paintTier || null];
    }, [style, moving]);
    const med = a => [...a].sort((x, y) => x - y)[1];
    res.msPerFrame = {};
    for (const st of ['map', 'paint', 'lite', 'auto']) for (const mv of [false, true]) {
      const a = [], tiers = new Set(); for (let r = 0; r < 3; r++) { const [ms, tier] = await run(st, mv); a.push(ms); tiers.add(tier); }
      res.msPerFrame[st + (mv ? 'Moving' : 'Still')] = { median: med(a), rounds: a, tier: [...tiers].join('/') };
    }
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
