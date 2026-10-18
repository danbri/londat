// Headless check of a place on the globe (3D Tiles 1.1 from cwplans/tools/build-place-tiles.mjs, drawn by
// docklands/globe/places.js; OKR KR1.2 with KR2.3): the deep link ?ll=lat,lon,1500&ht=0,55 opens on the place, its tiles
// load, triangles > 0, the eye is not held at 60 km, describeView counts its buildings and names the nearest named one,
// featuresAt names the building at a point, findPlaces finds the place's words and goTo flies there, a tap on a building
// opens its card, the place's local time is given, no page errors. Screenshots in --out (default docklands/test/out/).
//   python3 -m http.server 8190 --bind 127.0.0.1 &      (from the repository root)
//   node docklands/test/place-check.mjs [--base http://127.0.0.1:8190] [--place leon] [--webgpu] [--sizes 390x844@2,1280x800@1]
// Skill: docklands-3d-page, "Three.js port: places as 3D Tiles (2026-10-18)".
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8190'), OUT = arg('--out', 'docklands/test/out'), WEBGPU = process.argv.includes('--webgpu'), PLACE = arg('--place', 'leon');
const SIZES = arg('--sizes', '390x844@2,1280x800@1').split(',').map(s => { const m = /^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(s); return [+m[1], +m[2], +m[3]]; });
// what each place is checked against (test data: tests may name places)
const CASES = {
  leon: { ll: '42.59732,-5.56654,1500', ht: '0,55', search: 'Plaza Mayor', building: { lon: -5.56689, lat: 42.59782 } },
  sarajevo: { ll: '43.85917,18.43335,1500', ht: '0,55', search: 'Vijećnica', building: { lon: 18.43335, lat: 43.85917 } },
  leiden: { ll: '52.15948,4.49123,1500', ht: '0,55', search: 'Hoogstraat', building: { lon: 4.49123, lat: 52.15948 } },
};
const C = CASES[PLACE]; if (!C) throw new Error('no test case for ' + PLACE);
const FJ = JSON.parse(readFileSync(`cwplans/docklands/data/places/${PLACE}/features.json`, 'utf8'));
mkdirSync(OUT, { recursive: true });
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
let failed = 0;
const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ' · ' + detail : ''}`); };

for (const [w, h, dpr] of SIZES) {
  const tag = `${w}x${h}@${dpr}${WEBGPU ? '-webgpu' : ''}`;
  console.log(`--- ${PLACE} ${tag}`);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }), page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() === 429 && /open-meteo\.com/.test(r.url())) return; if (r.status() >= 400 && !/favicon|\/cache\/runs\/|api\.github\.com/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
  await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  const t0 = Date.now();
  await page.goto(`${BASE}/docklands/?ll=${C.ll}&ht=${C.ht}${WEBGPU ? '' : '&webgl'}&animate=0&weather=0&t=2026-10-12T12:00`);
  // the deep link: the globe takes the view, the place's tiles load
  await page.waitForFunction(p => { const G = window.__docklands3?.globe; return G && G.mode === 'globe' && G.places && G.places.find(x => x.id === p)?.state === 'loaded' && window.docklands; }, PLACE, { timeout: 240000 });
  const loadS = (Date.now() - t0) / 1000;
  const st = await page.evaluate(async () => { const G = __docklands3.globe; for (let k = 0; k < 4; k++) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }
    const S = G.sampler(), o = G.places[0] && G.places.find(x => x.state === 'loaded'), c = o ? o.centre : [0, 0];
    return { view: docklands.getView(), frame: G.stats.frame, places: G.placesStats(), hole: G.U.hole.value.toArray(), worldH: S.h0 ? Math.round(S.h0(c[0], c[1])) : null, placeH: Math.round(S.h(c[0], c[1])) }; });
  console.log(`     ground at the centre: world terrain (ETOPO box mean) ${st.worldH} m, the place's DEM ${st.placeH} m above sea level`);
  const pl = st.places.find(p => p.id === PLACE);
  check(pl && pl.tiles === FJ.tiles.length * 2 - FJ.tiles.filter(t => !t.buildings).length + 1, 'all tiles loaded', `${pl?.tiles} meshes (and the curtain) for ${FJ.tiles.length} tiles, ${loadS.toFixed(1)} s from page load`);
  check(st.frame && st.frame.triangles > 0 && pl.triangles > 0, 'triangles drawn', `frame ${st.frame?.triangles?.toLocaleString('en')} triangles (place meshes ${pl?.triangles?.toLocaleString('en')}), ${st.frame?.calls} draw calls`);
  check(st.view.eye.above_ground_m < 3000, 'eye near the ground (no 60 km floor over a place)', `eye ${st.view.eye.above_ground_m} m above ground, range ${st.view.range_m} m, tilt ${st.view.tilt_deg}`);
  check(Math.abs(st.view.target.lat - +C.ll.split(',')[0]) < 0.002 && Math.abs(st.view.target.lon - +C.ll.split(',')[1]) < 0.002, 'target at the link', JSON.stringify(st.view.target));
  check(st.hole[0] < st.hole[2], 'globe terrain cut over the place', st.hole.map(v => v.toFixed(4)).join(','));
  check(st.view.place_time && st.view.place_time.time_zone === FJ.timeZone, 'place time in getView', JSON.stringify(st.view.place_time));
  const shot = `${OUT}/place-${PLACE}-${tag}.png`; await page.waitForTimeout(500); await page.screenshot({ path: shot }); console.log('     screenshot', shot);
  // text and machine interface
  const d = await page.evaluate(() => docklands.describeView());
  const dp = (d.places || []).find(p => p.place === PLACE);
  check(dp && dp.buildings_in_view > 50 && dp.nearest_named, 'describeView counts the buildings and names the nearest named one', dp ? `${dp.buildings_in_view} in view; nearest named ${dp.nearest_named?.name}` : 'no place in the description');
  check(new RegExp(FJ.timeZone.replace('/', '\\/')).test(d.text), 'describeView gives the local time', (d.text.match(/local time[^.;]*/) || [''])[0]);
  const f = await page.evaluate(c => docklands.featuresAt(c.lon, c.lat), C.building);
  check(f.more && f.more.building && /building/i.test(f.text), 'featuresAt names the building at a point', f.more?.building ? `${f.more.building.osm_id} ${f.more.building.name || f.more.building.address || ''} ${f.more.building.height_m} m (${f.more.building.height_source})` : f.text);
  const fp = await page.evaluate(q => docklands.findPlaces(q, 5), C.search);
  check(fp.length && fp.some(r => r.id && r.id.startsWith('place:' + PLACE)), `findPlaces "${C.search}"`, fp.slice(0, 3).map(r => `${r.name} (${r.kind})`).join('; '));
  // a close view (500 m range, tilted 70 degrees): a second screenshot
  const near = await page.evaluate(async o => { const v = await docklands.goTo({ lon: o.lon, lat: o.lat, range_m: 500, tilt_deg: 70, heading_deg: 30 }); const G = __docklands3.globe; for (let k = 0; k < 3; k++) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); } return v; }, FJ.origin);
  check(near.eye.above_ground_m < 400, 'close view: eye under 400 m', `eye ${near.eye.above_ground_m} m above ground`);
  const shot2 = `${OUT}/place-${PLACE}-${tag}-near.png`; await page.waitForTimeout(500); await page.screenshot({ path: shot2 }); console.log('     screenshot', shot2);
  // a tap on the building under the centre of the view
  const card = await page.evaluate(async () => { const G = __docklands3.globe; for (let y = 0.45; y < 0.8; y += 0.05) { G.tap(innerWidth / 2, innerHeight * y); const c = document.getElementById('card'); if (!c.hidden && /OSM/.test(c.textContent)) return c.querySelector('h2').textContent + ' · ' + c.querySelector('p.small').textContent; } return null; });
  check(!!card, 'a tap on a building opens its card', card || 'no card');
  // goTo by name from far away: fly to the world, then to the place by its word
  await page.evaluate(() => docklands.goTo({ lon: 0, lat: 20, alt_m: 2e7 }));
  const g = await page.evaluate(q => docklands.goTo(q), C.search);
  check(g.found && Math.abs(g.target.lat - FJ.origin.lat) < 0.01 && Math.abs(g.target.lon - FJ.origin.lon) < 0.01 && g.eye.above_ground_m < 5000, `goTo("${C.search}") flies there`, `${g.found?.name} (${g.found?.kind}); eye ${g.eye.above_ground_m} m up`);
  // far away the place is freed
  const freed = await page.evaluate(async p => { const G = __docklands3.globe; for (let k = 0; k < 3; k++) { await docklands.goTo({ lon: 0, lat: 20, alt_m: 2e7 }); G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); } return G.places.find(x => x.id === p).state; }, PLACE);
  check(freed === null, 'freed when the eye is far', String(freed));
  check(!errors.length, 'no page errors', errors.slice(0, 5).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all passed');
process.exit(failed ? 1 : 0);
