// The CPU copies given up after upload (docklands/cpu-copies.js) and the trees by cell (layers/trees.js), checked in
// Chromium (WebGL 2 in software): (1) the copies are given up (STATS.cpu) and the JS heap is smaller than with
// ?cpufree=0; (2) the picture is the same with and without (mean |luma difference| under 0.01); (3) a tap names the same
// building; (4) after the owner's case (out to the globe, freeModel, Home) the arrays are made again, uploaded and given
// up again, and the model draws the same picture as before; (5) the trees: cells and levels in STATS.trees, a turn
// round and a flight over the model keep the full trees within their distance and draw no page errors.
//   python3 -m http.server 8317 --bind 127.0.0.1 &      (from the repository root)
//   node docklands/test/cpu-copies-check.mjs [--base http://127.0.0.1:8317] [--size 390x844@2]
// Skill: docklands-3d-page, "Three.js port: trees by cell, JS heap (2026-10-20)".
import { chromium } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8317');
const [W, H, DPR] = (/^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(arg('--size', '390x844@2')) || []).slice(1).map(Number);
const T = '2026-10-12T12:00';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
let failed = 0;
const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ': ' + detail : ''}`); };

async function open(q) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR }), page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(400000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather|raw\.githubusercontent/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(`${BASE}/docklands/?view=cw&webgl&animate=0&weather=0&labels=0&wheels=0&layers=trees,water,tide,walls,stations,ring&t=${T}${q}`);
  await page.waitForFunction(() => window.__docklands3?.ready && window.__docklands3.globe, null, { timeout: 400000 });
  await page.waitForTimeout(4000);
  return { ctx, page, errors, cdp: await ctx.newCDPSession(page) };
}
const frames = (page, n = 3) => page.evaluate(n => new Promise(ok => { let k = 0; const f = () => { __docklands3.draw(); if (++k < n) requestAnimationFrame(f); else requestAnimationFrame(() => ok()); }; f(); }), n);
const luma = async buf => { const img = await loadImage(buf), cv = createCanvas(img.width, img.height), c = cv.getContext('2d'); c.drawImage(img, 0, 0); const d = c.getImageData(0, 0, img.width, img.height).data, L = new Float32Array(d.length / 4); for (let i = 0; i < L.length; i++) L[i] = (0.2126 * d[4 * i] + 0.7152 * d[4 * i + 1] + 0.0722 * d[4 * i + 2]) / 255; return L; };
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const shot = async page => { await frames(page, 3); return luma(await page.screenshot({ clip: { x: 0, y: 140, width: W, height: H - 220 } })); };   // (the clip leaves out the bars)
const heap = async (page, cdp) => { await cdp.send('HeapProfiler.collectGarbage'); return page.evaluate(() => +(performance.memory.usedJSHeapSize / 1048576).toFixed(1)); };
const pick = page => page.evaluate(([w, h]) => __docklands3.pickAt(w / 2, h * 0.55), [W, H]);

const A = await open(''), B = await open('&cpufree=0');
await frames(A.page, 4); await frames(B.page, 4);
const sA = await A.page.evaluate(() => ({ ...__docklands3.STATS.cpu })), hA = await heap(A.page, A.cdp), hB = await heap(B.page, B.cdp);
check(sA.released > 0 && sA.freedMB > 10, 'the CPU copies are given up once uploaded', JSON.stringify(sA));
check(hA < hB - 10, 'the JS heap is smaller than with ?cpufree=0', `${hA} MB against ${hB} MB`);
const LA = await shot(A.page), LB = await shot(B.page), d0 = diff(LA, LB);
check(d0 < 0.01, 'the same picture with and without the CPU copies', `mean |luma difference| ${d0.toFixed(4)}`);
const pA = await pick(A.page), pB = await pick(B.page);
check(pA === pB && pA >= 0, 'a tap names the same building', `${pA} and ${pB}`);
// the owner's case: out to the globe, the model's buffers freed, Home
const P = A.page, before = LA;
await P.evaluate(() => new Promise(ok => { const G = __docklands3.globe; G.world(); const f = () => (G.mode === 'globe' && !G.isFlying()) ? ok() : requestAnimationFrame(f); f(); }));
await P.waitForTimeout(4500);
const freed = await P.evaluate(() => __docklands3.globe.freed);
await P.evaluate(() => new Promise(ok => { const G = __docklands3.globe; G.home(); const f = () => { __docklands3.draw(); if (G.mode === 'model' && !G.isFlying() && (!G.reup || G.reup.done)) ok(); else requestAnimationFrame(f); }; f(); }));
await P.evaluate(() => __docklands3.setView('cw')); await frames(P, 6);
const s2 = await P.evaluate(() => ({ ...__docklands3.STATS.cpu })), after = await shot(P), d1 = diff(before, after);
check(freed && freed.meshes > 0 && s2.restored > sA.restored, 'after the globe the given-up arrays are made again for the re-upload', `freed ${JSON.stringify(freed)}; before ${JSON.stringify(sA)}, after ${JSON.stringify(s2)}`);
check(s2.released > sA.released && Math.abs(s2.freedMB - sA.freedMB) < 2, 'and given up again after the upload', `released ${sA.released} -> ${s2.released}, given up ${sA.freedMB} -> ${s2.freedMB} MB`);
check(d1 < 0.01, 'the model draws the same picture after the return', `mean |luma difference| ${d1.toFixed(4)}`);
check(await pick(P) === pA, 'a tap names the same building after the return');
// trees: levels, a turn round and a flight, from the quay of Greenland Dock (eye 10 m up)
await P.evaluate(() => __docklands3.setView('greenlanddock')); await frames(P, 4);
const tr = await P.evaluate(() => { const S = __docklands3.STATS.trees; return { cells: S.cells, near: S.near, far: S.far, specks: S.specks, refills: S.refills, refillMs: S.refillMs }; });
check(tr.cells && tr.cells.near > 0 && tr.near > 0 && tr.far > 0 && tr.cells.hidden > 0, 'trees: near cells with full trees, far forms, hidden cells', JSON.stringify(tr));
const turn = await P.evaluate(async () => { const D = __docklands3, out = []; const c = D.camState();
  for (let k = 0; k < 8; k++) { D.setCam({ ...c, yaw: c.yaw + k * Math.PI / 4 }); for (let j = 0; j < 2; j++) { D.draw(); await new Promise(r => requestAnimationFrame(r)); } const S = D.STATS.trees; out.push([S.near, S.far, S.specks, S.refills]); }
  D.setCam(c); return out; });
check(turn.filter(x => x[0] > 0).length >= 6, 'trees: full trees in (nearly) every direction of a turn round', JSON.stringify(turn));
const fly = await P.evaluate(async () => { const D = __docklands3, out = [];
  for (const [d, p] of [[300, .3], [1500, .5], [5000, .8], [14000, 1.2]]) { D.setCam({ ...D.camState(), dist: d, pitch: p }); for (let j = 0; j < 2; j++) { D.draw(); await new Promise(r => requestAnimationFrame(r)); } const S = D.STATS.trees; out.push({ dist: d, near: S.near, far: S.far, specks: S.specks, triangles: S.triangles, cells: S.cells }); }
  return out; });
check(fly[3].near === 0 && fly[3].triangles < fly[0].triangles, 'trees: no full trees from high up, fewer triangles', JSON.stringify(fly.map(x => [x.dist, x.near, x.far, x.specks, x.triangles])));
for (const [n, o] of [['default', A], ['?cpufree=0', B]]) check(!o.errors.length, `no page errors (${n})`, o.errors.slice(0, 3).join(' | '));
await A.ctx.close(); await B.ctx.close(); await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
