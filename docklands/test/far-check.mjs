// Far views of the building sets (issue #13, owner 2026-10-23: "towns from 20 km read as towns, not tiles"): for each view
// a fresh page at the deep link (the owner's semantics: ll=lat,lon,range and ht=heading,tilt), wait until the places have
// settled, then measure what the view costs and save a screenshot: tiles fetched (count and bytes, per place), tiles drawn
// by level, frame and place triangles, draw calls, the render submit time and the frame interval (medians of 15 redraws),
// the JS heap, and the counts of describeView (building boxes, far blocks, merged squares, buildings left out far away).
// Software WebGL (SwiftShader): absolute times are slow; the counts and the ratios between options are what matter.
//   python3 -m http.server 8195 --bind 127.0.0.1 &        (from the repository root)
//   node docklands/test/far-check.mjs --tag after --views 'manchester-20:53.4794,-2.2453,20000,0,45;london-20:51.4950,-0.1276,20000,0,45'
//        [--base http://127.0.0.1:8195] [--placebase id:url ...] [--out docklands/test/out/far] [--sizes 390x844@2] [--layers none]
// --check: also fail when a view shows merged squares of a coarse level (kind "squares") of a set built with far forms, or
// when a named place (--expect id:range_max, e.g. berlin:25000) draws no building block within that range.
// Skill: docklands-3d-page, "Far views: buildings and street blocks, no squares (2026-10-23)".
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; }, args = k => argv.flatMap((a, i) => a === k ? [argv[i + 1]] : []);
const BASE = arg('--base', 'http://127.0.0.1:8195'), TAG = arg('--tag', 'run'), OUT = arg('--out', 'docklands/test/out/far'), LAYERS = arg('--layers', null);
const PB = args('--placebase').map(v => `&placebase=${encodeURIComponent(v)}`).join('') + (arg('--extra', '') || '');
const EXPECT = args('--expect').map(v => { const [id, m] = v.split(':'); return { id, max: +m }; });
const [W, H, DPR] = (/^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(arg('--sizes', '390x844@2')) || []).slice(1).map(Number);
const VIEWS = arg('--views', '').split(';').filter(Boolean).map(v => { const [name, s] = v.split(':'); const [lat, lon, range, hd, tilt] = s.split(',').map(Number); return { name, lat, lon, range, hd, tilt }; });
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
let failed = 0; const results = [];
for (const v of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR }), page = await ctx.newPage(), errors = [], fetched = {};
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('response', async r => { const u = r.url(), m = /\/places\/([^/]+)\/(?:tiles|tilesets)\/|\/data\/(?:[a-z]{2})\/([^/]+)\/(?:tiles|tilesets)\//.exec(u); if (!m) return; const id = m[1] || m[2];
    const o = fetched[id] ||= { tiles: 0, bytes: 0 }; o.tiles++; o.bytes += +(r.headers()['content-length'] || 0); });   // (the server's Content-Length: body() misses some answers)
  await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  const url = `${BASE}/docklands/?ll=${v.lat},${v.lon},${v.range}&ht=${v.hd},${v.tilt}&webgl&animate=0&weather=0&t=2026-10-12T12:00${LAYERS === 'none' ? '&layers=' : ''}${PB}`;
  const t0 = Date.now(); await page.goto(url);
  await page.waitForFunction(() => { const G = window.__docklands3?.globe; return !!(G && G.mode === 'globe' && G.places && G.placesStats && window.docklands); }, null, { timeout: 300000, polling: 500 });
  const r = await page.evaluate(async () => {
    const G = __docklands3.globe, t0 = performance.now();
    const settled = () => G.placesStats().filter(s => s.state === 'loaded' || s.state === 'loading').every(s => s.settled) && G.placesStats().some(s => s.state === 'loaded');
    let ok = 0; while (performance.now() - t0 < 400000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); if (settled()) { if (++ok > 3 && performance.now() - t0 > 4000) break; } else ok = 0; }
    const sub = [], iv = []; let l0 = performance.now();
    for (let k = 0; k < 15; k++) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); const t = performance.now(); iv.push(t - l0); l0 = t; sub.push(G.stats.frame.ms); }
    iv.sort((a, b) => a - b); sub.sort((a, b) => a - b);
    const d = await docklands.describeView(), fr = G.stats.frame;
    const pl = (d.places || []).map(x => ({ place: x.place, lite: x.lite ? { landmarks_drawn: x.lite.landmarks_drawn, building_boxes: x.lite.building_boxes, far_blocks: x.lite.far_blocks, mass_boxes: x.lite.mass_boxes, mass_buildings: x.lite.mass_buildings, far_left_out: x.lite.far_left_out, tiles_by_level: x.lite.tiles_by_level } : undefined,
      boxes: x.boxes ? { building_boxes: x.boxes.building_boxes, far_blocks: x.boxes.far_blocks, mass_boxes: x.boxes.mass_boxes, mass_buildings: x.boxes.mass_buildings, far_left_out: x.boxes.far_left_out, outline_blocks: x.boxes.outline_blocks, tiles_by_level: x.boxes.tiles_by_level } : undefined,
      blocks_drawn: x.blocks_drawn, city_blocks: x.surroundings?.city_blocks, tiles_drawn: x.tiles_drawn }));
    return { settle_s: Math.round((performance.now() - t0) / 100) / 10, submit_ms: sub[7], interval_ms: Math.round(iv[7]), calls: fr.calls, triangles: fr.triangles,
      places: G.placesStats().filter(s => s.state).map(s => ({ id: s.id, state: s.state, settled: s.settled, tiles: s.tiles, triangles: s.triangles, drawn_by_level: s.drawn_by_level, tiers: s.tiers })), described: pl,
      heap_mb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e5) / 10 : null, text: (d.places || []).map(x => x.text).join(' | ').slice(0, 900) };
  });
  const shot = `${OUT}/${TAG}-${v.name}.png`; await page.screenshot({ path: shot });
  const res = { tag: TAG, view: v.name, url: url.replace(BASE, ''), ...r, fetched, wall_s: Math.round((Date.now() - t0) / 1000), errors: errors.slice(0, 5), shot };
  // checks: no squares where far forms are built; a named place draws building blocks
  if (argv.includes('--check')) {
    for (const x of r.described) { const sq = (x.lite?.mass_boxes || 0) + (x.boxes?.mass_boxes || 0); if (sq) { failed++; console.log(`FAIL ${v.name}: ${x.place} draws ${sq} merged squares`); } }
    for (const e of EXPECT) if (v.range <= e.max) { const st = r.places.find(s => s.id === e.id); const n = st ? (st.tiers.city || 0) : 0; if (!n) { failed++; console.log(`FAIL ${v.name}: ${e.id} draws no city block tile`); } else console.log(`ok   ${v.name}: ${e.id} draws ${n} city block tiles`); }
    if (errors.length) { failed++; console.log(`FAIL ${v.name}: page errors ${errors.slice(0, 2).join(' / ')}`); }
  }
  console.log(JSON.stringify(res)); results.push(res);
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify({ when: new Date().toISOString(), size: `${W}x${H}@${DPR}`, results }, null, 1));
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
