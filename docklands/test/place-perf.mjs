// Performance of a place on the globe (3D Tiles from cwplans/tools/build-place-tiles.mjs, drawn by
// docklands/globe/places.js), measured headless: the fly-in from 300 km to the place's deep link (frame intervals, long
// tasks, the time until the place's tiles are in; twice, the second with the shader programs compiled), then the still view (render submit time, draw calls, triangles, JS
// heap) at the deep link (1.5 km), at 6 km and at 30 km out. Software WebGL (SwiftShader): absolute times are slow, the
// counts and the before / after ratios are what matter.
//   python3 -m http.server 8190 --bind 127.0.0.1 &      (from the repository root)
//   node docklands/test/place-perf.mjs [--base http://127.0.0.1:8190] [--place leon] [--sizes 390x844@2] [--out file.json] [--layers none]
// --layers none: the Docklands model's layers left out (?layers=), so the place's own costs show (the model builds its
// buildings in the background after a deep link to the globe: 3 to 4 s of main-thread work, measured 2026-10-20).
// Skill: docklands-3d-page, "Three.js port: places, city and surroundings by level of detail (2026-10-20)".
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8190'), PLACE = arg('--place', 'leon'), OUTF = arg('--out', null), LAYERS = arg('--layers', null);
const SIZES = arg('--sizes', '390x844@2').split(',').map(s => { const m = /^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(s); return [+m[1], +m[2], +m[3]]; });
const CASES = { leon: { lat: 42.59732, lon: -5.56654 }, sarajevo: { lat: 43.85917, lon: 18.43335 } };
const C = CASES[PLACE];
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const results = [];
for (const [w, h, dpr] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }), page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(300000);
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(`${BASE}/docklands/?ll=${C.lat},${C.lon},300000&ht=0,0&webgl&animate=0&weather=0&t=2026-10-12T12:00${LAYERS === 'none' ? '&layers=' : ''}`);
  await page.waitForFunction(() => { const G = window.__docklands3?.globe; return G && G.mode === 'globe' && G.stats.frame && window.docklands && G.places; }, null, { timeout: 300000 });
  await page.waitForTimeout(8000);   // the page's own start-up work done
  // the fly-in: frame intervals by rAF, long tasks, until the place is in and the flight is over, plus 3 s
  const flyIn = () => page.evaluate(async ({ c, p }) => {
    const G = __docklands3.globe, iv = [], lt = []; let last = performance.now(), run = true;
    const po = new PerformanceObserver(l => { for (const e of l.getEntries()) lt.push(e.duration); }); try { po.observe({ type: 'longtask', buffered: false }); } catch {}
    const t0 = performance.now(); let tLoaded = null, tDone = null; const ivFly = [];
    const tick = () => { const t = performance.now(); iv.push(t - last); if (tDone == null) ivFly.push(t - last); last = t; if (run) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    docklands.goTo({ lon: c.lon, lat: c.lat, range_m: 1500, tilt_deg: 55 }).then(() => { tDone = performance.now() - t0; });
    while (performance.now() - t0 < 240000) {
      const pl = G.places.find(x => x.id === p), st = G.placesStats ? G.placesStats().find(x => x.id === p) : null;
      if (tLoaded == null && pl && (st?.settled ?? pl.state === 'loaded')) tLoaded = performance.now() - t0;
      if (tLoaded != null && tDone != null && performance.now() - t0 > Math.max(tLoaded, tDone) + 3000) break;
      await new Promise(r => setTimeout(r, 100));
    }
    run = false; po.disconnect(); const s = iv.slice(1).sort((a, b) => a - b), q = f => Math.round(s[Math.min(s.length - 1, Math.floor(s.length * f))] || 0), sf = ivFly.slice(1).sort((a, b) => a - b);
    return { place_loaded_ms: tLoaded && Math.round(tLoaded), flight_done_ms: tDone && Math.round(tDone), frames: s.length, interval_ms: { median: q(0.5), p95: q(0.95), max: Math.round(s.at(-1) || 0) }, over_100ms: s.filter(x => x > 100).length, over_250ms: s.filter(x => x > 250).length,
      during_flight: { frames: sf.length, median_ms: Math.round(sf[Math.floor(sf.length / 2)] || 0), max_ms: Math.round(sf.at(-1) || 0) },
      long_tasks: { count: lt.length, total_ms: Math.round(lt.reduce((a, b) => a + b, 0)), max_ms: Math.round(Math.max(0, ...lt)) } };
  }, { c: C, p: PLACE });
  // twice: the first fly-in also compiles the shader programs (in software rendering 1 to 4 s each, blocking: the largest
  // cost); the second, after flying out until the place is freed, measures the tiles alone (fetch, parse, upload)
  const fly = await flyIn();
  await page.evaluate(async ({ c, p }) => { const G = __docklands3.globe; await docklands.goTo({ lon: c.lon, lat: c.lat, alt_m: 300000 }); const t0 = performance.now();
    while (performance.now() - t0 < 60000 && G.places.find(x => x.id === p).state) { G.dirty = true; __docklands3.draw(); await new Promise(r => setTimeout(r, 100)); } await new Promise(r => setTimeout(r, 2000)); }, { c: C, p: PLACE });
  const fly2 = await flyIn();
  // still views: submit time (median of 20 redraws), calls, triangles, heap
  const still = async (range, tilt) => page.evaluate(async ({ c, range, tilt, p }) => {
    const G = __docklands3.globe; await docklands.goTo({ lon: c.lon, lat: c.lat, range_m: range, tilt_deg: tilt });
    const t0 = performance.now(); while (performance.now() - t0 < 60000) { const st = G.placesStats().find(x => x.id === p); G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); if (st && (st.settled ?? st.state === 'loaded') && performance.now() - t0 > 1500) break; }
    const sub = []; for (let k = 0; k < 20; k++) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); sub.push(G.stats.frame.ms); }
    sub.sort((a, b) => a - b); const fr = G.stats.frame, st = G.placesStats().find(x => x.id === p);
    return { range_m: range, tilt_deg: tilt, submit_ms_median: sub[10], calls: fr.calls, triangles: fr.triangles, place: st, heap_mb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e5) / 10 : null };
  }, { c: C, range, tilt, p: PLACE });
  const views = [await still(1500, 55), await still(6000, 50), await still(30000, 45)];
  const r = { place: PLACE, size: `${w}x${h}@${dpr}`, layers: LAYERS || 'all', fly, fly2, views, errors: errors.slice(0, 5) };
  console.log(JSON.stringify(r, null, 1)); results.push(r);
  await ctx.close();
}
await browser.close();
if (OUTF) { mkdirSync(OUTF.replace(/\/[^/]*$/, ''), { recursive: true }); writeFileSync(OUTF, JSON.stringify({ when: new Date().toISOString(), results }, null, 1)); }
