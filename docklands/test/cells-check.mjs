// The model cells (docklands/cells.js, LOD step 4), checked in Chromium (WebGL 2 in software) against ?lod=0 on the same
// code: (1) from 8 km the building cells draw their simplified and far levels and the terrain, greens, roads and rail draw
// fewer triangles; at ?view=cw the cells out of view are left out of the index; (2) the frame has fewer triangles than with
// ?lod=0; (3) a tap names the same building at every point of a 7 x 9 grid, from 8 km and at cw (taps use the full
// geometry); (4) a tap on One Canada Square opens the same card; (5) levels not drawn give back their GPU buffers; (6) a
// rebuild (Photo facades off) makes the levels again; (7) out to the globe and Home: the model draws again; no page errors.
//   python3 -m http.server 8317 --bind 127.0.0.1 &      (from the repository root)
//   node docklands/test/cells-check.mjs [--base http://127.0.0.1:8317] [--size 390x844@2]
// Skill: docklands-3d-page, "Three.js port: model cells, LOD step 4 (2026-10-21)".
import { chromium } from '@playwright/test';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8317');
const [W, H, DPR] = (/^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(arg('--size', '390x844@2')) || []).slice(1).map(Number);
const T = '2026-10-12T12:00', FAR = '#v=1&c=-1400,800,0,8000,1.2,0.3';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
let failed = 0;
const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ': ' + detail : ''}`); };

async function open(q) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR }), page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(400000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|CORS policy/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather|raw\.githubusercontent|environment\.data\.gov\.uk/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(`${BASE}/docklands/?view=area&webgl&animate=0&weather=0&labels=0&wheels=0&layers=trees,water,tide,walls,stations,ring&t=${T}${q}${FAR}`);
  await page.waitForFunction(() => window.__docklands3?.ready && window.__docklands3.globe, null, { timeout: 400000 });
  await page.waitForTimeout(3000);
  return { ctx, page, errors };
}
// frames until the background builds of the levels are done (cells.js pump), then one more
const settle = page => page.evaluate(async () => { const D = __docklands3; for (let i = 0; i < 40; i++) { D.STATS.frame = null; D.draw(); while (!D.STATS.frame) await new Promise(r => requestAnimationFrame(r)); if (!D.STATS.cells.pending && i > 1) break; await new Promise(r => setTimeout(r, 200)); }
  D.STATS.frame = null; D.draw(); while (!D.STATS.frame) await new Promise(r => requestAnimationFrame(r)); return { frame: D.STATS.frame, cells: JSON.parse(JSON.stringify(D.STATS.cells)) }; });
const picks = page => page.evaluate(([w, h]) => { const out = []; for (let j = 1; j <= 9; j++) for (let i = 1; i <= 7; i++) out.push(__docklands3.pickAt(w * i / 8, 150 + (h - 300) * j / 10)); return out; }, [W, H]);
// the card of One Canada Square: tap the middle of its tower on the screen
const ocsCard = page => page.evaluate(async () => {
  const D = __docklands3, T3 = D.THREE, J = await (await fetch('../cwplans/docklands/data/towers.json')).json(), t = Object.values(J.buildings).find(b => b.name === 'One Canada Square');
  const r = t.tiers[0].ring, x = r.reduce((s, p) => s + p[0], 0) / r.length, z = r.reduce((s, p) => s + p[1], 0) / r.length, v = new T3.Vector3(x, t.tiers.at(-1).y0 - 2, z).project(D.camera);   // just under the pyramid: above 25 Canada Square from the east
  const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight; D.tap(sx, sy);
  for (let i = 0; i < 100 && /Loading the record/.test(document.querySelector('#cardBody')?.textContent || 'Loading the record'); i++) await new Promise(r => setTimeout(r, 100));
  return { model: D.pickAt(sx, sy), title: document.querySelector('#cardBody h2')?.textContent || '', mi: t.model_buildings[0] }; });

const A = await open(''), B = await open('&lod=0');
const a = await settle(A.page), b = await settle(B.page);
const C = a.cells, ks = C.kinds;
check(C.tiles.simplified + C.tiles.far > 20 && C.tiles.far > 5, 'from 8 km the building cells draw their simplified and far levels', JSON.stringify(C.tiles) + `, ${C.builds} levels built in ${C.buildMs} ms`);
check(['terrain', 'greens', 'roads', 'rail'].every(k => ks[k] && ks[k].far > 0) && ks.roads.triangles < b.cells.kinds.roads.triangles / 3 && ks.terrain.triangles < b.cells.kinds.terrain.triangles,
  'terrain, greens, roads and rail: far cells, fewer triangles than ?lod=0', ['terrain', 'greens', 'roads', 'rail'].map(k => `${k} ${b.cells.kinds[k].triangles} -> ${ks[k].triangles}`).join(', '));
check(a.frame.triangles < 0.8 * b.frame.triangles, 'the frame from 8 km has fewer triangles than with ?lod=0', `${b.frame.triangles} -> ${a.frame.triangles}, draw calls ${b.frame.drawCalls} -> ${a.frame.drawCalls}`);
// the hand-over with Greater London around the model (a place of kind blocks, globe/places.js): from 8 km the globe drawn
// behind the model holds London's blocks; the model box itself has none of them (place-select-blocks leaves those
// buildings to the model), so no building is drawn twice
const lon = await A.page.evaluate(async () => { const D = __docklands3, G = D.globe, t0 = performance.now(); let st = null;
  while (performance.now() - t0 < 180000) { D.STATS.frame = null; D.draw(); while (!D.STATS.frame) await new Promise(r => requestAnimationFrame(r)); st = G.placesStats?.().find(x => x.id === 'london'); if (st && st.settled && st.tiles > 0 && performance.now() - t0 > 3000) break; await new Promise(r => setTimeout(r, 200)); }
  return { st, mode: G.mode, frame: D.STATS.frame }; });
if (lon.st) { check(lon.mode === 'model' && lon.st.settled && lon.st.tiles > 0, 'from 8 km (model mode) the globe behind the model draws the London blocks', `${JSON.stringify(lon.st.drawn_by_level)} by level, ${lon.st.triangles} place triangles; frame ${lon.frame.triangles} triangles, ${lon.frame.drawCalls} calls`);
  await A.page.screenshot({ path: 'docklands/test/out/cells-london-8km.png' }); console.log('     screenshot docklands/test/out/cells-london-8km.png'); }
else console.log('     (no London place in places/index.json: hand-over check skipped)');
const pa = await picks(A.page), pb = await picks(B.page), same = pa.filter((v, i) => v === pb[i]).length;
check(same === pa.length && pa.some(v => v >= 0), 'from 8 km a tap names the same building at every grid point', `${same} of ${pa.length} the same, ${pa.filter(v => v >= 0).length} on buildings`);
const ca = await ocsCard(A.page), cb = await ocsCard(B.page);
check(ca.model === ca.mi && cb.model === cb.mi && ca.title === cb.title && ca.title.length > 0, 'a tap on One Canada Square (its model building) opens the same card', `"${ca.title}" (model ${ca.model}) and "${cb.title}"`);
// at Canary Wharf: the cells out of view are left out; the taps again
for (const o of [A, B]) await o.page.evaluate(() => __docklands3.setView('cw'));
const a2 = await settle(A.page), b2 = await settle(B.page);
check(a2.cells.kinds.terrain.culled > 10 && a2.cells.tiles.full > 0, 'at cw: cells out of view left out, the near building cells full', `terrain ${JSON.stringify(a2.cells.kinds.terrain)}, tiles ${JSON.stringify(a2.cells.tiles)}; frame ${b2.frame.triangles} -> ${a2.frame.triangles}`);
const qa = await picks(A.page), qb = await picks(B.page), same2 = qa.filter((v, i) => v === qb[i]).length;
check(same2 === qa.length && qa.some(v => v >= 0), 'at cw a tap names the same building at every grid point', `${same2} of ${qa.length}`);
// GPU buffers of the levels not drawn (after FREE_MS)
await A.page.waitForTimeout(6000); const f = await settle(A.page);
check(f.cells.freed > 0, 'levels not drawn give back their GPU buffers', `freed ${f.cells.freed}, dropped ${f.cells.dropped}`);
// a rebuild: Photo facades off, then from 8 km again
const r0 = f.cells.builds;
await A.page.evaluate(() => { const c = document.getElementById('facades'); c.checked = false; c.dispatchEvent(new Event('change')); __docklands3.setCam({ tx: -1400, tz: 800, ty: 0, dist: 8000, yaw: 1.2, pitch: 0.3 }); });
const r = await settle(A.page);
check(r.cells.builds > r0 && r.cells.tiles.far > 5, 'after a rebuild the levels are made again', `builds ${r0} -> ${r.cells.builds}, tiles ${JSON.stringify(r.cells.tiles)}`);
// out to the globe and Home
const g = await A.page.evaluate(() => new Promise(ok => { const G = __docklands3.globe; G.world(); const f = () => (G.mode === 'globe' && !G.isFlying()) ? ok(G.mode) : requestAnimationFrame(f); f(); }));
await A.page.waitForTimeout(4000);
await A.page.evaluate(() => new Promise(ok => { const G = __docklands3.globe; G.home(); const f = () => { __docklands3.draw(); if (G.mode === 'model' && !G.isFlying() && (!G.reup || G.reup.done)) ok(); else requestAnimationFrame(f); }; f(); }));
const h = await settle(A.page);
check(g === 'globe' && h.frame.triangles > 100000 && h.cells.tiles.full > 0, 'out to the globe and Home: the model draws again', `${h.frame.triangles} triangles, tiles ${JSON.stringify(h.cells.tiles)}`);
for (const [n, o] of [['default', A], ['?lod=0', B]]) check(!o.errors.length, `no page errors (${n})`, o.errors.slice(0, 3).join(' | '));
await A.ctx.close(); await B.ctx.close(); await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
