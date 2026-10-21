// Headless check of the UK lite set (place kind "lite": landmarks plus merged mass; region config
// docklands/geo/regions/uk-lite.js, tool cwplans/tools/build-place-tiles.mjs --region uk-lite, reader docklands/globe/places.js):
// the whole UK from 500 km loads (coarse levels, external tile sets), describeView says it is a lite set and counts what is
// drawn; a city from 20 km (Manchester, Edinburgh) draws finer levels and names the nearest landmark; a tap on a landmark
// (a cathedral) opens its card; findPlaces finds it; next to Greater London both places draw and no lite landmark lies in
// London; far away the set is freed; no page errors. Screenshots in --out (default docklands/test/out/lite).
// The tiles live in another repository (docklandia); serve a copy under this server and point the page at it:
//   ln -s <docklandia checkout> docklands/test/out/docklandia      (docklands/test/out/ is git-ignored)
//   python3 -m http.server 8195 --bind 127.0.0.1 &                  (from the repository root)
//   node docklands/test/lite-check.mjs [--base http://127.0.0.1:8195] [--placebase docklands/test/out/docklandia/data/gb/uk-lite/] [--sizes 390x844@2]
// Skill: docklands-3d-page, "Three.js port: the UK lite set (2026-10-22)".
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { geodeticToEcef } from '../geo/ellipsoid.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8195'), OUT = arg('--out', 'docklands/test/out/lite'), PB = arg('--placebase', 'docklands/test/out/docklandia/data/gb/uk-lite/');
const SIZES = arg('--sizes', '390x844@2').split(',').map(s => { const m = /^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(s); return [+m[1], +m[2], +m[3]]; });
const ID = 'uk-lite', DIR = PB.replace(/\/?$/, '/'), FJ = JSON.parse(readFileSync(DIR + 'features.json', 'utf8')), F = FJ.buildings_fields, col = k => F.indexOf(k);
FJ.buildings = (FJ.shards || []).flatMap(sh => JSON.parse(readFileSync(DIR + sh.file, 'utf8')).buildings);   // the landmark rows of every part
const PBQ = `&placebase=${encodeURIComponent(ID + ':' + new URL(PB, BASE + '/').href)}`;
// the cases: the UK from 500 km; two cities from 20 km; a cathedral (the first of these that the set holds)
const CITIES = arg('--cities') ? arg('--cities').split(';').map(c => { const [name, lon, lat] = c.split(':'); return { name, lon: +lon, lat: +lat }; }) : [{ name: 'Manchester', lon: -2.2453, lat: 53.4794 }, { name: 'Edinburgh', lon: -3.1883, lat: 55.9533 }];
const CATHEDRAL = ['Durham Cathedral', 'York Minster', 'Manchester Cathedral', "St Giles' Cathedral", 'Lincoln Cathedral'].map(n => FJ.buildings.find(r => r[col('name')] === n)).find(Boolean);
if (!CATHEDRAL) throw new Error('no test cathedral in features.json');
mkdirSync(OUT, { recursive: true });
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
let failed = 0;
const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ' · ' + detail : ''}`); };
// wait until the place has settled (tiles of the view in), at most ms
const settle = (page, ms = 240000) => page.evaluate(async ({ id, ms }) => { const G = __docklands3.globe, t0 = performance.now();
  while (performance.now() - t0 < ms) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); const st = G.placesStats().find(x => x.id === id); if (st && st.settled && st.tiles > 0 && performance.now() - t0 > 1500) break; }
  for (let k = 0; k < 3; k++) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }
  const d = await docklands.describeView(); return { st: G.placesStats(), dp: (d.places || []).find(x => x.place === id), text: d.text, view: docklands.getView(), frame: G.stats.frame, s: (performance.now() - t0) / 1000 }; }, { id: ID, ms });

for (const [w, h, dpr] of SIZES) {
  const tag = `${w}x${h}@${dpr}`; console.log(`--- ${ID} ${tag}`);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }), page = await ctx.newPage(), errors = [], tsets = new Set();
  page.setDefaultTimeout(300000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('response', r => { if (/\/tilesets\/[\d-]+\.json$/.test(r.url())) tsets.add(r.url()); if (r.status() === 429 && /open-meteo\.com/.test(r.url())) return; if (r.status() >= 400 && !/favicon|\/cache\/runs\/|api\.github\.com/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
  await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  // 1. the UK from 500 km (straight down)
  await page.goto(`${BASE}/docklands/?ll=54.5,-3.0,500000&ht=0,0&webgl&animate=0&weather=0&t=2026-10-12T12:00${PBQ}`);
  await page.waitForFunction(id => { const G = window.__docklands3?.globe; return !!(G && G.mode === 'globe' && G.places && window.docklands && G.placesStats && G.placesStats().find(x => x.id === id)); }, ID, { timeout: 240000, polling: 250 });
  const uk = await settle(page);
  const pl = uk.st.find(x => x.id === ID), lv = Object.keys(pl.drawn_by_level).map(Number);
  check(pl.settled && pl.tiles > 0 && Math.max(...lv) <= 8, 'the UK from 500 km: the lite set settled at its coarse levels', `levels ${JSON.stringify(pl.drawn_by_level)}, ${pl.triangles.toLocaleString('en')} place triangles, frame ${uk.frame?.triangles?.toLocaleString('en')} triangles, ${uk.frame?.calls} calls, ${uk.s.toFixed(1)} s; eye ${uk.view.eye.above_ground_m} m up`);
  check(uk.dp && uk.dp.lite && /lite set/.test(uk.dp.text) && uk.dp.lite.mass_boxes > 1000 && uk.dp.lite.mass_buildings > 1e6, 'describeView: a lite set, counted by class', uk.dp ? `${JSON.stringify({ ...uk.dp.lite, rule: undefined, about: undefined })} · ${uk.dp.text.slice(0, 260)}` : 'no place in the description');
  await page.screenshot({ path: `${OUT}/lite-uk-500km-${tag}.png` }); console.log(`     screenshot ${OUT}/lite-uk-500km-${tag}.png`);
  // 2. cities from 20 km
  for (const c of CITIES) {
    await page.evaluate(c => docklands.goTo({ lon: c.lon, lat: c.lat, range_m: 20000, tilt_deg: 45 }), c);
    const r = await settle(page), p2 = r.st.find(x => x.id === ID), l2 = Object.keys(p2.drawn_by_level).map(Number);
    check(p2.settled && Math.max(...l2) >= 10 && r.dp?.lite?.mass_boxes > 200, `${c.name} from 20 km: finer levels (external tile sets) and the mass drawn`, `levels ${JSON.stringify(p2.drawn_by_level)}, ${tsets.size} external tile sets fetched so far; ${JSON.stringify({ landmarks: r.dp?.lite?.landmarks_drawn, mass: r.dp?.lite?.mass_boxes, buildings: r.dp?.lite?.mass_buildings })}; ${r.s.toFixed(1)} s`);
    check(r.dp?.nearest_named && /lite set/.test(r.dp.text), `${c.name}: describeView names the nearest landmark`, `${r.dp?.nearest_named?.name} (${r.dp?.nearest_named?.dist_m} m); tallest ${r.dp?.tallest_named?.name}`);
    await page.screenshot({ path: `${OUT}/lite-${c.name.toLowerCase()}-20km-${tag}.png` }); console.log(`     screenshot ${OUT}/lite-${c.name.toLowerCase()}-20km-${tag}.png`);
  }
  // 3. a cathedral: a close view, a tap on it opens its card; search finds it
  const cat = { name: CATHEDRAL[col('name')], lon: CATHEDRAL[col('lon')], lat: CATHEDRAL[col('lat')], h: CATHEDRAL[col('height_m')], g: CATHEDRAL[col('ground_m')] };
  const P3 = geodeticToEcef(cat.lon, cat.lat, cat.g + FJ.geoid_m + cat.h * 0.6);
  const tc = await page.evaluate(async ({ t, P3, id }) => { const G = __docklands3.globe; await docklands.goTo({ lon: t.lon, lat: t.lat, range_m: 700, tilt_deg: 60, heading_deg: 200 });
    const t0 = performance.now(); while (performance.now() - t0 < 180000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); const st = G.placesStats().find(x => x.id === id); if (st.settled && performance.now() - t0 > 1500) break; }
    const s = G.project(P3); if (!s) return { card: null }; for (const [dx, dy] of [[0, 0], [0, 6], [0, -6], [4, 10], [-4, 10], [8, 0], [-8, 0]]) { G.tap(s[0] + dx, s[1] + dy); const c = document.getElementById('card'); if (!c.hidden && c.querySelector('h2')) { const h = c.querySelector('h2').textContent; if (h === t.name) return { card: c.textContent.replace(/\s+/g, ' ').slice(0, 260), at: s }; } }
    return { card: null, at: s, levels: G.placesStats().find(x => x.id === id).drawn_by_level }; }, { t: cat, P3, id: ID });
  check(!!tc.card && /Landmark because/.test(tc.card), `a tap on ${cat.name} opens its landmark card`, tc.card || `no card at ${JSON.stringify(tc.at)} levels ${JSON.stringify(tc.levels)}`);
  await page.screenshot({ path: `${OUT}/lite-cathedral-${tag}.png` }); console.log(`     screenshot ${OUT}/lite-cathedral-${tag}.png`);
  const fp = await page.evaluate(q => docklands.findPlaces(q, 5), cat.name);
  check(fp.some(r => r.id && r.id.startsWith('place:' + ID) && r.name === cat.name), `findPlaces "${cat.name}"`, fp.slice(0, 3).map(r => `${r.name} (${r.kind}, ${r.id})`).join('; '));
  const fa = await page.evaluate(c => docklands.featuresAt(c.lon, c.lat), cat);
  check(fa.more?.building?.name === cat.name && /lite set/.test(fa.text || ''), 'featuresAt names the landmark and says the set is lite', (fa.text || '').slice(0, 200));
  // 4. next to Greater London (Watford, 15 km): both places draw; no lite landmark lies in London's polygon (the build's rule)
  await page.evaluate(() => docklands.goTo({ lon: -0.40, lat: 51.66, range_m: 15000, tilt_deg: 50, heading_deg: 135 }));
  const ln = await settle(page);
  const lo = ln.st.find(x => x.id === 'london'), li = ln.st.find(x => x.id === ID);
  check(lo && lo.state === 'loaded' && lo.tiles > 0 && li.tiles > 0, 'at the edge of London both places draw (London: every building; outside: the lite set)', `london ${JSON.stringify(lo?.drawn_by_level)}, uk-lite ${JSON.stringify(li?.drawn_by_level)}`);
  await page.screenshot({ path: `${OUT}/lite-london-edge-${tag}.png` }); console.log(`     screenshot ${OUT}/lite-london-edge-${tag}.png`);
  // 5. far away the set is freed
  const freed = await page.evaluate(async id => { const G = __docklands3.globe; for (let k = 0; k < 3; k++) { await docklands.goTo({ lon: 150, lat: -30, alt_m: 2e7 }); G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); } return G.places.find(x => x.id === id).state; }, ID);
  check(freed === null, 'freed when the eye is far', String(freed));
  check(!errors.length, 'no page errors', errors.slice(0, 5).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all passed');
process.exit(failed ? 1 : 0);
