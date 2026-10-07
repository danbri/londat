// Checks the 3D page's Line drawing (docklands/line-styles.js) against the Plotter SVG of the same view
// (docklands/plotter-svg.js): both are made in one headless Chromium page with the same camera, the SVG is drawn at the
// canvas size with make()'s own frame, and the ink is matched pixel by pixel. Prints, per view, the edge counts, buffer
// bytes, build time, edges drawn in the frame, the frame time (SwiftShader: not a phone) and recall / precision within
// 1 and 2 px (recall: plot ink with a line-drawing line near it; precision: the other way). Exit 1 on a page error or a
// value under the floor.
//
//   node cwplans/tools/check-line-styles.mjs [--out DIR] [--style lines|vectrex]
//
// --out writes, per view, the line drawing, the SVG and a diff (grey both, red plot only, blue line drawing only).
// Method, measurements and limits: the docklands-3d-page skill, "Line styles".
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createServer } from 'http';
import { join, extname } from 'path';
import { TOOLS } from './lib.mjs';

const ROOT = join(TOOLS, '..', '..'), arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const OUT = arg('--out'), STYLE = arg('--style') || 'lines', FLOOR = { recall2: .95, precision2: .97 };
// view, CSS size, pixel ratio; the compare runs at pixel ratio 1 (the plot's raster is at most 2400 px wide)
const VIEWS = [['cw', 1600, 900, 1], ['rotherhithe', 1600, 900, 1], ['cw', 390, 844, 1], ['cw', 390, 844, 3]];
if (OUT) mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gz': 'application/gzip', '.bin': 'application/octet-stream' };
const srv = createServer((q, r) => { try { const p = join(ROOT, decodeURIComponent(q.url.split('?')[0])); const b = readFileSync(p); r.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); } });
await new Promise(ok => srv.listen(0, '127.0.0.1', ok)); const port = srv.address().port;
const { chromium } = await import(join(ROOT, 'node_modules', 'playwright', 'index.mjs'));
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = 0;

// ink of the line drawing (luma under 0.8) against ink of the SVG drawn at the canvas size; tol in px
async function compare(png, svg, cw, ch) {
  const page = await browser.newPage();
  const r = await page.evaluate(async ({ png, svg, cw, ch }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode(); const W = img.width, H = img.height;
    const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg), PW = +m[1], PH = +m[2];
    const s = Math.min(2, 2400 / Math.max(cw, ch)), RW = Math.round(cw * s), RH = Math.round(ch * s), k = Math.min((PW - 24) / RW, (PH - 30) / RH), ox = (PW - RW * k) / 2, oy = 12 + (PH - 30 - RH * k) / 2;
    const s2 = svg.replace(/^<\?xml[^>]*>\s*/, '').replace(/<path id="credit" d="[^"]*"\/>/, '').replace(/width="[\d.]+mm" height="[\d.]+mm" viewBox="[^"]*"/, `width="${W}" height="${H}" viewBox="${ox} ${oy} ${RW * k} ${RH * k}"`)
      .replace(/stroke="#[0-9a-f]{6}"/g, 'stroke="#000000"').replace(/stroke-width="[\d.]+"/g, `stroke-width="${(RW * k / W).toFixed(4)}"`);
    const si = new Image(); si.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s2))); await si.decode();
    const ctx = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c.getContext('2d'); };
    const a = ctx(), p = ctx(); a.drawImage(img, 0, 0); p.fillStyle = '#fff'; p.fillRect(0, 0, W, H); p.drawImage(si, 0, 0, W, H);
    const A = a.getImageData(0, 0, W, H).data, B = p.getImageData(0, 0, W, H).data, ma = new Uint8Array(W * H), mb = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) { ma[i] = (.2126 * A[4 * i] + .7152 * A[4 * i + 1] + .0722 * A[4 * i + 2]) / 255 < .8 ? 1 : 0; mb[i] = B[4 * i] < 150 ? 1 : 0; }
    const dil = (M, r) => { const t = new Uint8Array(W * H), o = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let d = -r; d <= r && !v; d++) { const xx = x + d; if (xx >= 0 && xx < W && M[y * W + xx]) v = 1; } t[y * W + x] = v; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let d = -r; d <= r && !v; d++) { const yy = y + d; if (yy >= 0 && yy < H && t[yy * W + x]) v = 1; } o[y * W + x] = v; } return o; };
    const res = {}; let diff = null;
    for (const tol of [1, 2]) { const da = dil(ma, tol), db = dil(mb, tol); let nb = 0, hb = 0, na = 0, ha = 0; const D = tol === 2 ? a.createImageData(W, H) : null;
      for (let i = 0; i < W * H; i++) { let c = [255, 255, 255]; if (mb[i]) { nb++; if (da[i]) { hb++; c = [150, 150, 150]; } else c = [230, 0, 0]; } if (ma[i]) { na++; if (db[i]) ha++; else c = [0, 90, 255]; } if (D) D.data.set([...c, 255], 4 * i); }
      res['recall' + tol] = +(hb / nb).toFixed(4); res['precision' + tol] = +(ha / na).toFixed(4); res.plotInk = nb; res.lineInk = na;
      if (D) { a.putImageData(D, 0, 0); diff = a.canvas.toDataURL('image/png'); } }
    return { ...res, diff };
  }, { png, svg, cw, ch });
  await page.close(); return r;
}

for (const [view, W, H, DPR] of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/cwplans/docklands/index.html?${STYLE}&view=${view}`, { timeout: 240000 });
  await page.waitForFunction(() => window.__docklands?.AT && window.__docklands.MVP && globalThis.DocklandsPlot && globalThis.DocklandsLines?.built, null, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => { const D = window.__docklands, cv = document.getElementById('c'), gl = cv.getContext('webgl'), px = new Uint8Array(4), t0 = performance.now();
    D.renderNow(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const ms = Math.round(performance.now() - t0);
    D.renderNow(); const img = cv.toDataURL('image/png'), m = DocklandsPlot.make({ paper: 'A3' });
    return { img: img.split(',')[1], svg: m.svg, ms, stats: DocklandsLines.stats, drawn: DocklandsLines.drawn, mode: DocklandsLines.mode, cw: cv.clientWidth, ch: cv.clientHeight }; });
  const tag = `${STYLE}-${view}-${W}x${H}x${DPR}`, row = { tag, mode: r.mode, edges: r.stats.edges, MB: +(r.stats.bytes / 1048576).toFixed(1), build_ms: r.stats.ms, drawn: r.drawn, frame_ms: r.ms, errors: errors.length };
  if (DPR === 1 && STYLE === 'lines') { const c = await compare(r.img, r.svg, r.cw, r.ch); Object.assign(row, { recall1: c.recall1, precision1: c.precision1, recall2: c.recall2, precision2: c.precision2 });
    if (c.recall2 < FLOOR.recall2 || c.precision2 < FLOOR.precision2) { failed++; row.under_floor = true; }
    if (OUT) writeFileSync(join(OUT, tag + '-diff.png'), Buffer.from(c.diff.split(',')[1], 'base64')); }
  if (OUT) { writeFileSync(join(OUT, tag + '.png'), Buffer.from(r.img, 'base64')); writeFileSync(join(OUT, tag + '.svg'), r.svg); }
  if (errors.length || r.mode !== STYLE) { failed++; row.page_errors = errors.slice(0, 3); }
  console.log(JSON.stringify(row));
  await ctx.close();
}
await browser.close(); srv.close();
console.log(failed ? `${failed} problem(s)` : 'ok'); process.exit(failed ? 1 : 0);
