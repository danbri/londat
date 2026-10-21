// Measures what the level of detail and the globe hand-over cost (Three.js port, docklands/): (1) triangles and draw calls
// of one model frame at named views (renderer.info.render over every render call of the frame, the globe background
// included), with the triangles each layer submits (planes, ships, river boats, detailed models); (2) GPU memory as three.js
// counts it (renderer.info.memory: attributes, textures, total bytes) and the JS heap (performance.memory, Chromium only)
// through the owner's iPhone case: the model at ?view=cw, out to the whole world, a globe stay, then Home back to the
// model: the peak, the largest rise in one frame, and the frames after the hand-over. The per-view JS heap is measured
// after a full garbage collection (CDP HeapProfiler.collectGarbage); typed arrays count in it (Chromium).
//   python3 -m http.server 8317 --bind 127.0.0.1 &      (from the repository root)
//   node docklands/test/lod-memory.mjs [--base http://127.0.0.1:8317] [--sizes 390x844@2] [--views cw,area,greenlanddock,far] [--no-handover] [--query '&lod=0']
// --query adds URL switches to every page (?lod=0: no level of detail, for a before/after on the same code). The view
// "far" is the whole model from 8 km to the east, low (share hash c=-1400,800,0,8000,1.2,0.3). Each view line gives the
// frame's draw calls and triangles, the model meshes' share (buildings, terrain, greens, roads, rail, water: triangles of
// the meshes in the frustum), the median time to submit a frame (5 frames) and the memory.
// Skill: docklands-3d-page, "Three.js port: level of detail and the hand-over (2026-10-18)".
import { chromium } from '@playwright/test';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8317'), VIEWS = arg('--views', 'cw,area').split(',').filter(Boolean), EXTRA = arg('--query', ''), HANDOVER = !process.argv.includes('--no-handover');
const SIZES = arg('--sizes', '390x844@2').split(',').map(s => { const m = /^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(s); return [+m[1], +m[2], +m[3]]; });
const T = '2026-10-12T12:00';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
let failed = 0;
async function open(w, h, dpr, q) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }), page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(300000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  const far = q === 'view=far';   // the whole model from 8 km, low (a far view)
  await page.goto(`${BASE}/docklands/?${far ? 'view=area' : q}&webgl&animate=0&weather=0&t=${T}${EXTRA}${far ? '#v=1&c=-1400,800,0,8000,1.2,0.3' : ''}`);
  await page.waitForFunction(() => window.__docklands3?.ready && window.__docklands3.globe && window.docklands, null, { timeout: 300000 });
  await page.waitForTimeout(6000);   // the layers' data (moorings, ships, aircraft) and a few frames
  return { ctx, page, errors };
}
// one drawn frame: every render call in it (the globe background, the scene pass, the output)
const frameCost = page => page.evaluate(async () => {
  const D = __docklands3; D.STATS.frame = null; D.draw();
  for (let i = 0; i < 60 && !D.STATS.frame; i++) await new Promise(ok => requestAnimationFrame(ok));
  const r = { ...D.STATS.frame };   // main.js: the totals of the last drawn frame (renderer.info.render, reset at each frame of the loop)
  const tri = o => { let t = 0; o.traverseVisible(m => { if (!m.isMesh || !m.geometry) return; const g = m.geometry, n = g.index ? g.index.count : g.attributes.position?.count || 0; t += n / 3 * (m.isInstancedMesh ? m.count : g.isInstancedBufferGeometry ? g.instanceCount : 1); }); return Math.round(t); };
  const calls = o => { let c = 0; o.traverseVisible(m => { if ((m.isMesh || m.isLine || m.isPoints) && m.geometry) c++; }); return c; };
  r.layers = {}; for (const id of ['trees', 'planes', 'ships', 'river', 'piers']) { const o = D.layers[id]?.api?.object; if (o) r.layers[id] = { triangles: tri(o), objects: calls(o) }; }
  r.layers.models = { triangles: tri(D.ctx.meshes.models), objects: calls(D.ctx.meshes.models) };
  r.lod = D.ctx.stats.lod || null; r.globe = D.globe.mode;
  // the model meshes in the frustum (as three.js culls them): triangles of each kind
  const cam = D.camera, F = new D.THREE.Frustum().setFromProjectionMatrix(new D.THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)), S = new D.THREE.Sphere();
  const drawn = m => { if (!m || !m.visible || !m.geometry || !m.layers.mask) return 0; let o = m; while (o) { if (!o.visible) return 0; o = o.parent; } const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); S.copy(g.boundingSphere).applyMatrix4(m.matrixWorld); if (m.frustumCulled && !F.intersectsSphere(S)) return 0; const n = g.index ? g.index.count : g.attributes.position.count; return Math.min(n, g.drawRange.count) / 3; };
  const M = D.ctx.meshes; r.model = { buildings: Math.round(M.buildings.children.reduce((s, m) => s + drawn(m), 0)), buildingTiles: M.buildings.children.filter(m => drawn(m) > 0).length };
  for (const k of ['terrain', 'greens', 'roads', 'rail', 'water']) r.model[k] = Math.round(drawn(M[k]));
  if (D.ctx.meshes.terrainCells) r.model.terrain = Math.round(D.ctx.meshes.terrainCells.reduce((s, m) => s + drawn(m), 0));
  r.cells = D.STATS.cells || null;
  const T = D.STATS.trees; if (T) r.trees = { full: T.near, farForms: T.far, specks: T.specks, cells: T.cells, refills: T.refills, refillMs: T.refillMs, reselectMs: T.reselectMs };
  return r; });
const memNow = page => page.evaluate(() => { const M = __docklands3.renderer.info.memory, pm = performance.memory; return { total_mb: +(M.total / 1048576).toFixed(1), attributes_mb: +(M.attributesSize / 1048576).toFixed(1), textures_mb: +(M.texturesSize / 1048576).toFixed(1), geometries: M.geometries, textures: M.textures, renderTargets: M.renderTargets, heap_mb: pm ? +(pm.usedJSHeapSize / 1048576).toFixed(1) : null }; });

for (const [w, h, dpr] of SIZES) {
  const tag = `${w}x${h}@${dpr}`;
  for (const v of VIEWS) {
    const { ctx, page, errors } = await open(w, h, dpr, `view=${v}`);
    const a = await frameCost(page), b = await frameCost(page);   // (the second: after the LOD objects chose their level in the first)
    const ms = []; for (let k = 0; k < 5; k++) ms.push((await frameCost(page)).ms); ms.sort((x, y) => x - y); b.submitMs = ms[2];
    const cdp = await ctx.newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage');   // the JS heap after a full collection (garbage left by the build counts otherwise)
    console.log(`${tag} ?view=${v}${EXTRA}: ${b.drawCalls} draw calls, ${b.triangles.toLocaleString('en')} triangles, submit ${b.submitMs} ms; model ${JSON.stringify(b.model)}${b.cells ? '; cells ' + JSON.stringify(b.cells) : ''}; layers ${JSON.stringify(b.layers)}${b.lod ? '; lod ' + JSON.stringify(b.lod) : ''}${b.trees ? '; trees ' + JSON.stringify(b.trees) : ''}; memory ${JSON.stringify(await memNow(page))}`);
    if (errors.length) { failed++; console.log('FAIL page errors: ' + errors.slice(0, 3).join(' | ')); }
    void a; await ctx.close();
  }
  if (!HANDOVER) continue;
  // the owner's case: the model, out to the world, a globe stay, Home
  const { ctx, page, errors } = await open(w, h, dpr, 'view=cw');
  const m0 = await memNow(page);
  await page.evaluate(() => new Promise(ok => { const G = __docklands3.globe; G.world(); const f = () => (G.mode === 'globe' && !G.isFlying()) ? ok() : requestAnimationFrame(f); f(); }));
  await page.waitForTimeout(4500);   // freeModel after 3 s on the globe
  await page.evaluate(() => new Promise(ok => { let n = 0; const f = () => { __docklands3.draw(); if (++n < 3) requestAnimationFrame(f); else ok(); }; f(); }));
  const m1 = await memNow(page), freed = await page.evaluate(() => __docklands3.globe.freed || null);
  const tr = await page.evaluate(() => new Promise(ok => {
    const D = __docklands3, G = D.globe, I = D.renderer.info.memory, out = []; let last = I.total, mode = G.mode, tHand = null; const t0 = performance.now();
    G.home();
    const f = () => { const now = performance.now(), d = I.total - last; last = I.total; if (G.mode !== mode) { mode = G.mode; tHand = now; }
      out.push({ t: Math.round(now - t0), mode: G.mode, total: I.total, rise: d, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 });
      if (G.isFlying() || tHand == null || now - tHand < 5000) { D.draw(); requestAnimationFrame(f); } else ok({ out, hand: tHand && Math.round(tHand - t0) }); };
    requestAnimationFrame(f); }));
  const after = tr.out.filter(x => x.mode === 'model'), mb = x => +(x / 1048576).toFixed(1);
  const peak = Math.max(...tr.out.map(x => x.total)), rise = Math.max(...tr.out.map(x => x.rise)), heapPeak = Math.max(...tr.out.map(x => x.heap));
  console.log(`${tag} hand-over memory${EXTRA}: model at cw ${JSON.stringify(m0)}; on the globe after the stay ${JSON.stringify(m1)} (freed ${JSON.stringify(freed)})`);
  console.log(`${tag} Home flight: ${tr.out.length} frames, hand-over at ${tr.hand} ms; GPU total peak ${mb(peak)} MB, largest rise in one frame ${mb(rise)} MB, JS heap peak ${mb(heapPeak)} MB; model frames after the hand-over: ${after.length}`);
  console.log('   per frame (t ms, mode, GPU total MB, rise MB): ' + tr.out.map(x => `${x.t}:${x.mode[0]}:${mb(x.total)}:${mb(x.rise)}`).join(' '));
  console.log(`${tag} back in the model, 5 s on: ${JSON.stringify(await memNow(page))}`);
  // then until the model's buffers are all back and the globe has rested (globe.js stepReup, restGlobe), 90 s at most
  const end = await page.evaluate(() => new Promise(ok => { const D = __docklands3, G = D.globe, t0 = performance.now(), I = D.renderer.info.memory; let peak = 0;
    const f = () => { D.draw(); peak = Math.max(peak, I.total); if (((!G.reup || G.reup.done) && G.rested) || performance.now() - t0 > 90000) ok({ ms: Math.round(performance.now() - t0), reup: G.reup, rested: G.rested, peak_mb: +(peak / 1048576).toFixed(1) }); else requestAnimationFrame(f); }; f(); }));
  console.log(`${tag} model buffers back and the globe rested after ${end.ms} ms more (reup ${JSON.stringify(end.reup)}, rested ${JSON.stringify(end.rested)}, GPU peak meanwhile ${end.peak_mb} MB): ${JSON.stringify(await memNow(page))}`);
  if (errors.length) { failed++; console.log('FAIL page errors: ' + errors.slice(0, 3).join(' | ')); }
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
