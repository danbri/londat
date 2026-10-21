// Headless check of the world base tiles and the detail sets on the globe (globe/base-tiles.js, build-world-base.mjs,
// build-detail-skeleton.mjs; OKR KR2.2): flights from orbit to each testbed, with a screenshot, the base's state and the
// labels at 1,000 km, 200 km and 50 km; no page errors; the imagery and height tiles load near the testbed and are
// freed (texture count bounded) after flights; the base answers the ground height there.
//   python3 -m http.server 8211 --bind 127.0.0.1 &      (from the repository root)
//   node docklands/test/base-check.mjs [--base http://127.0.0.1:8211] [--sizes 390x844@2] [--targets leon,sarajevo] [--compare]
// --compare: also the same views with ?base=0 (the world texture only), for the before / after pictures.
// Screenshots: docklands/test/out/base/<target>-<alt>[-nobase]-<size>.png. Skill: docklands-3d-page, "World base tiles".
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8211'), OUT = arg('--out', 'docklands/test/out/base'), COMPARE = process.argv.includes('--compare');
const SIZES = arg('--sizes', '390x844@2').split(',').map(s => { const m = /^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(s); return [+m[1], +m[2], +m[3]]; });
const TARGETS = { leon: { lon: -5.5665, lat: 42.5973, name: 'León' }, sarajevo: { lon: 18.4334, lat: 43.8592, name: 'Sarajevo' }, london: { lon: -0.02, lat: 51.505, name: 'London' } };
const PICK = arg('--targets', 'leon,sarajevo').split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ' · ' + detail : ''}`); };

async function run(w, h, dpr, nobase) {
  const tag = `${w}x${h}@${dpr}${nobase ? ' base=0' : ''}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }), page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(300000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !/favicon|\/cache\/runs\/|api\.github\.com|open-meteo/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
  await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather|celestrak/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(`${BASE}/docklands/?view=globe&webgl&animate=0&weather=0&t=2026-06-21T11:00${nobase ? '&base=0' : ''}`);
  await page.waitForFunction(() => window.__docklands3?.globe?.ready && window.__docklands3.globe.mode === 'globe' && window.docklands, null, { timeout: 300000 });
  const settle = async (ms = 1500) => { // frames until the base has nothing queued or loading (or 40 s)
    await page.evaluate(async ms => { const G = __docklands3.globe, t0 = performance.now(); let quiet = 0;
      while (performance.now() - t0 < 40000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(() => r()));
        const s = G.baseStats ? G.baseStats() : { queued: 0, active: 0 }; quiet = s.queued + s.active ? 0 : quiet + 1; if (quiet > 6 && performance.now() - t0 > ms) break; } }, ms);
  };
  for (const id of PICK) {
    const T = TARGETS[id];
    for (const [k, alt] of [['1000km', 1e6], ['200km', 2e5], ['50km', 5e4]]) {
      await page.evaluate(({ T, alt }) => docklands.goTo({ lon: T.lon, lat: T.lat, alt_m: alt, tilt_deg: alt < 3e5 ? 35 : 0, heading_deg: 0 }), { T, alt });
      await settle();
      const st = await page.evaluate(() => { const G = __docklands3.globe, mi = __docklands3.renderer.info.memory;
        return { base: G.baseStats ? G.baseStats() : null, frame: G.stats.frame, textures: mi.textures, geometries: mi.geometries, labels: G.labels().shown.map(l => l.text).slice(0, 14), view: G.getView(), relines: G.stats.relines || null }; });
      const file = `${OUT}/${id}-${k}${nobase ? '-nobase' : ''}-${w}x${h}@${dpr}.png`; await page.screenshot({ path: file });
      console.log(`   ${tag} ${id} ${k}: ${JSON.stringify({ base: st.base, frame: st.frame, textures: st.textures, geometries: st.geometries, relines: st.relines })}`);
      check(st.labels.length >= 4, `${tag} ${id} ${k}: place names in view`, `${st.labels.length}: ${st.labels.join(', ')} -> ${file}`);
      if (!nobase) check(st.base && st.base.imagery > 0, `${tag} ${id} ${k}: imagery tiles loaded`, JSON.stringify(st.base));
      if (!nobase && alt <= 2e5) check(st.base && st.base.heights > 0, `${tag} ${id} ${k}: height tiles loaded`);
    }
    if (!nobase) {
      const g = await page.evaluate(({ T }) => { const S = __docklands3.globe.sampler(); return { h: (S.h0 || S.h)(T.lon, T.lat), dem: S.demH ? S.demH(T.lon, T.lat) : null };   // S.h0: the base sampler (over a loaded place, places.js answers S.h from the place's finer grids) }, { T });
      check(g.dem != null && Math.abs(g.dem - g.h) < 1, `${tag} ${id}: the ground sampler answers from the base heights`, JSON.stringify(g));
    }
  }
  // steady-state frame costs over Sarajevo (as globe-check) after the tiles have loaded: CPU submit time of render(),
  // triangles, draw calls, GPU objects, JS heap, the base's textures
  for (const [k, alt] of [['orbit', 1.2e7], ['1000km', 1e6], ['100km', 1e5], ['10km', 1e4]]) {
    await page.evaluate(a => docklands.goTo({ lon: 18.43, lat: 43.86, alt_m: a }), alt); await settle(3000);
    const c = await page.evaluate(async () => { const G = __docklands3.globe, sub = [], t0 = performance.now();
      while (performance.now() - t0 < 5000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(() => r())); if (G.stats.frame) sub.push(G.stats.frame.ms); }
      sub.sort((a, b) => a - b); const fr = G.stats.frame, mi = __docklands3.renderer.info.memory;
      return { submit_ms_median: sub[Math.floor(sub.length / 2)], frames: sub.length, patches: fr.patches, triangles: fr.triangles, calls: fr.calls, geometries: mi.geometries, textures: mi.textures, heap_mb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, base_gpu_mb: G.baseStats ? G.baseStats().gpu_mb : 0 }; });
    console.log(`   ${tag} steady ${k.padEnd(6)} ${JSON.stringify(c)}`);
  }
  // a far flight: textures stay bounded (tiles not drawn are freed)
  await page.evaluate(() => docklands.goTo({ lon: 139.7, lat: 35.7, alt_m: 2e6 })); await settle();
  const fin = await page.evaluate(() => ({ base: __docklands3.globe.baseStats ? __docklands3.globe.baseStats() : null, textures: __docklands3.renderer.info.memory.textures }));
  if (!nobase) check(fin.base.imagery <= 80, `${tag} after a flight to Tokyo the imagery held stays bounded`, JSON.stringify(fin));
  check(!errors.length, `${tag} no page errors`, errors.slice(0, 4).join(' | '));
  await ctx.close();
}
for (const [w, h, dpr] of SIZES) { await run(w, h, dpr, false); if (COMPARE) await run(w, h, dpr, true); }
await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
