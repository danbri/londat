// Headless check of a place on the globe (3D Tiles 1.1 from cwplans/tools/build-place-tiles.mjs, drawn by
// docklands/globe/places.js; OKR KR1.2 with KR2.3): the deep link ?ll=lat,lon,1500&ht=0,55 opens on the place, its tiles
// load, triangles > 0, the eye is not held at 60 km, describeView counts its buildings and names the nearest named one,
// featuresAt names the building at a point, findPlaces finds the place's words and goTo flies there, a tap on a building
// opens its card, the place's local time is given, no page errors; since 2026-10-20 (city and surroundings by level of
// detail) the tile tree settles with core tiles drawn at the deep link, and a far view (30 km out) draws surroundings tiles
// with main roads and the place's river; since 2026-10-22 (Sarajevo) the landmark set: minarets present (mapped and estimated apart),
// counted in describeView, a tap on Gazi Husrev-beg Mosque's minaret gives its card, the old town and the city 8 km out (screenshots).
// Since 2026-10-22 (Dublin) a place held in another repository (index entry tileBase, case `ext`): served from a local copy
// (--placedir, default docklands/test/out/places/<id>/, a symlink or copy of the docklandia folder; ignored by git) through
// ?placebase=<id>:<url>, so the test does not depend on the live site; the landmark case `tall` (the Spire of Dublin).
// Screenshots in --out (default docklands/test/out/).
//   python3 -m http.server 8190 --bind 127.0.0.1 &      (from the repository root)
//   node docklands/test/place-check.mjs [--base http://127.0.0.1:8190] [--place leon] [--webgpu] [--sizes 390x844@2,1280x800@1]
// Skill: docklands-3d-page, "Three.js port: places as 3D Tiles (2026-10-18)".
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { geodeticToEcef } from '../geo/ellipsoid.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8190'), OUT = arg('--out', 'docklands/test/out'), WEBGPU = process.argv.includes('--webgpu'), PLACE = arg('--place', 'leon');
const SIZES = arg('--sizes', '390x844@2,1280x800@1').split(',').map(s => { const m = /^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(s); return [+m[1], +m[2], +m[3]]; });
// what each place is checked against (test data: tests may name places)
const CASES = {
  leon: { ll: '42.59732,-5.56654,1500', ht: '0,55', search: 'Plaza Mayor', building: { lon: -5.56689, lat: 42.59782 }, river: /Bernesga/, town: 'San Andrés del Rabanedo', city: { lon: -5.6105, lat: 42.6085 } },
  sarajevo: { ll: '43.85917,18.43335,1500', ht: '0,55', search: 'Vijećnica', building: { lon: 18.43335, lat: 43.85917 }, river: /Miljacka|Bosna/, town: 'Ilidža', city: { lon: 18.3550, lat: 43.8500 },
    // the landmark set (cwplans/tools/build-place-landmarks.mjs, globe/landmarks.js): Gazi Husrev-beg Mosque's minaret (OSM parts)
    landmarks: { minaret: 'w1030951861', name: 'Gazi Husrev-begova džamija', at: { lon: 18.42895, lat: 43.85915 } } },
  // a place held in the docklandia repository (ext): the Liffey core, the city of Dublin as blocks, Dublin Bay; landmarks:
  // the Spire of Dublin (OSM way 96578181, historic=monument, height 121.2) and the Poolbeg chimneys
  dublin: { ext: true, ll: '53.34725,-6.25916,1500', ht: '0,55', search: "O'Connell Bridge", building: { lon: -6.26040, lat: 53.34940 }, river: /Liffey/, town: 'Tallaght', city: { lon: -6.3740, lat: 53.2880 },
    landmarks: { tall: 'w96578181', name: 'Spire of Dublin', at: { lon: -6.26031, lat: 53.34980 }, far: { lon: -6.1895, lat: 53.3405, kind: 'chimney' } } },
  leiden: { ll: '52.15948,4.49123,1500', ht: '0,55', search: 'Hoogstraat', building: { lon: 4.49123, lat: 52.15948 } },
  // a place of kind "blocks" (no core, no ground of its own): BT Tower (OSM way 5022282, 188.4 m in OSM), a named building
  // drawn with its own id; Croydon for a city block; the whole city from 20 km
  london: { kind: 'blocks', ll: '51.5215,-0.1389,700', ht: '200,60', search: 'BT Tower', building: { lon: -0.13887, lat: 51.52153 }, tower: { lon: -0.13887, lat: 51.52153, name: 'BT Tower' },
    town: 'Greater London', city: { lon: -0.0982, lat: 51.3762 }, far: { lon: -0.1276, lat: 51.4950, range: 20000, tilt: 45 },
    // the Microsoft class (place.blocks.geometry; owner 2026-10-22): Yiewsley (Hillingdon), where OSM has few outlines
    extra: { lon: -0.4230, lat: 51.5314, label: /Microsoft/ } },
};
const C = CASES[PLACE]; if (!C) throw new Error('no test case for ' + PLACE);
const PDIR = arg('--placedir', C.ext ? `docklands/test/out/places/${PLACE}` : `cwplans/docklands/data/places/${PLACE}`);
const FJ = JSON.parse(readFileSync(`${PDIR}/features.json`, 'utf8'));
// a place in another repository: its files from the local copy (served by the test's http.server under docklands/test/out/)
const PB = C.ext ? `&placebase=${PLACE}:${encodeURIComponent(arg('--placebase', `${BASE}/${PDIR}/`))}` : '';
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
  await page.goto(`${BASE}/docklands/?ll=${C.ll}&ht=${C.ht}${WEBGPU ? '' : '&webgl'}&animate=0&weather=0&t=2026-10-12T12:00${PB}`);
  // the deep link: the globe takes the view, the place's tiles load
  await page.waitForFunction(p => { const G = window.__docklands3?.globe; if (!(G && G.mode === 'globe' && G.places && window.docklands && G.placesStats)) return false; G.dirty = true; return G.placesStats().find(x => x.id === p)?.settled; }, PLACE, { timeout: 240000, polling: 250 });
  const loadS = (Date.now() - t0) / 1000;
  const st = await page.evaluate(async () => { const G = __docklands3.globe; for (let k = 0; k < 4; k++) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }
    const S = G.sampler(), o = G.places[0] && G.places.find(x => x.state === 'loaded'), c = o ? o.centre : [0, 0];
    return { view: docklands.getView(), frame: G.stats.frame, places: G.placesStats(), hole: G.U.hole.value.toArray(), worldH: S.h0 ? Math.round(S.h0(c[0], c[1])) : null, placeH: Math.round(S.h(c[0], c[1])) }; });
  console.log(`     ground at the centre: world terrain (ETOPO box mean) ${st.worldH} m, the place's DEM ${st.placeH} m above sea level`);
  const pl = st.places.find(p => p.id === PLACE);
  check(pl && pl.settled && (C.kind === 'blocks' ? pl.tiers.city > 0 : pl.tiers.core > 0), C.kind === 'blocks' ? 'the tile tree settled with block tiles drawn' : 'the tile tree settled with core tiles drawn', `${JSON.stringify(pl?.tiers)} tiles drawn by tier, levels ${JSON.stringify(pl?.drawn_by_level)}, ${pl?.loaded} loaded, ${loadS.toFixed(1)} s from page load`);
  check(st.frame && st.frame.triangles > 0 && pl.triangles > 0, 'triangles drawn', `frame ${st.frame?.triangles?.toLocaleString('en')} triangles (place meshes ${pl?.triangles?.toLocaleString('en')}), ${st.frame?.calls} draw calls`);
  check(st.view.eye.above_ground_m < 3000, 'eye near the ground (no 60 km floor over a place)', `eye ${st.view.eye.above_ground_m} m above ground, range ${st.view.range_m} m, tilt ${st.view.tilt_deg}`);
  check(Math.abs(st.view.target.lat - +C.ll.split(',')[0]) < 0.002 && Math.abs(st.view.target.lon - +C.ll.split(',')[1]) < 0.002, 'target at the link', JSON.stringify(st.view.target));
  if (C.kind === 'blocks') check(!(st.hole[0] < st.hole[2]), 'globe terrain NOT cut (a blocks place has no ground of its own)', st.hole.map(v => v.toFixed(4)).join(','));
  else check(st.hole[0] < st.hole[2], 'globe terrain cut over the place', st.hole.map(v => v.toFixed(4)).join(','));
  check(st.view.place_time && st.view.place_time.time_zone === FJ.timeZone, 'place time in getView', JSON.stringify(st.view.place_time));
  const shot = `${OUT}/place-${PLACE}-${tag}.png`; await page.waitForTimeout(500); await page.screenshot({ path: shot }); console.log('     screenshot', shot);
  // text and machine interface
  const d = await page.evaluate(() => docklands.describeView());
  const dp = (d.places || []).find(p => p.place === PLACE);
  if (C.kind === 'blocks') check(dp && dp.blocks_drawn > 200 && dp.nearest_named, 'describeView counts the blocks drawn and names the nearest named building', dp ? `${dp.blocks_drawn} blocks drawn ${JSON.stringify(dp.blocks_by_source)}; ${dp.named_buildings_in_view} named in view; nearest named ${dp.nearest_named?.name}; ${dp.text.slice(0, 200)}` : 'no place in the description');
  else check(dp && dp.buildings_in_view > 50 && dp.nearest_named, 'describeView counts the buildings and names the nearest named one', dp ? `${dp.buildings_in_view} in view; nearest named ${dp.nearest_named?.name}` : 'no place in the description');
  check(new RegExp(FJ.timeZone.replace('/', '\\/')).test(d.text), 'describeView gives the local time', (d.text.match(/local time[^.;]*/) || [''])[0]);
  const f = await page.evaluate(c => docklands.featuresAt(c.lon, c.lat), C.building);
  check(f.more && f.more.building && (C.kind === 'blocks' ? f.more.building.name === C.tower.name : /building/i.test(f.text)), 'featuresAt names the building at a point', f.more?.building ? `${f.more.building.osm_id} ${f.more.building.name || f.more.building.address || ''} ${f.more.building.height_m} m (${f.more.building.height_source})` : f.text);
  const fp = await page.evaluate(q => docklands.findPlaces(q, 5), C.search);
  check(fp.length && fp.some(r => r.id && r.id.startsWith('place:' + PLACE)), `findPlaces "${C.search}"`, fp.slice(0, 3).map(r => `${r.name} (${r.kind})`).join('; '));
  // a close view (500 m range, tilted 70 degrees): a second screenshot
  const near = await page.evaluate(async o => { const v = await docklands.goTo({ lon: o.lon, lat: o.lat, range_m: 500, tilt_deg: 70, heading_deg: 30 }); const G = __docklands3.globe; for (let k = 0; k < 3; k++) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); } return v; }, FJ.origin);
  check(near.eye.above_ground_m < 400, 'close view: eye under 400 m', `eye ${near.eye.above_ground_m} m above ground`);
  const shot2 = `${OUT}/place-${PLACE}-${tag}-near.png`; await page.waitForTimeout(500); await page.screenshot({ path: shot2 }); console.log('     screenshot', shot2);
  // a blocks place: a tap on the named tower (its card names it); the screen point from its top
  if (C.kind === 'blocks') {
    const row = FJ.buildings.find(r => r[1] === C.tower.name), P3 = geodeticToEcef(row[4], row[5], row[10] + FJ.geoid_m + row[6] * 0.6);
    const tc = await page.evaluate(async ({ t, P3 }) => { const G = __docklands3.globe; await docklands.goTo({ lon: t.lon, lat: t.lat, range_m: 700, tilt_deg: 60, heading_deg: 200 });
      const t0 = performance.now(); while (performance.now() - t0 < 120000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); const st = G.placesStats().find(x => x.id === 'london'); if (st.settled && performance.now() - t0 > 1500) break; }
      const s = G.project(P3); if (!s) return { card: null }; for (const [dx, dy] of [[0, 0], [0, 6], [0, -6], [3, 12], [-3, 12]]) { G.tap(s[0] + dx, s[1] + dy); const c = document.getElementById('card'); if (!c.hidden && c.querySelector('h2')) { const h = c.querySelector('h2').textContent; if (h === t.name) return { card: h + ' · ' + c.querySelector('p.small').textContent + ' · ' + c.textContent.replace(/\s+/g, ' ').slice(0, 160), at: s }; } }
      return { card: null, at: s }; }, { t: C.tower, P3 });
    check(!!tc.card, `a tap on ${C.tower.name} opens its card`, tc.card || `no card at ${JSON.stringify(tc.at)}`);
    const shotT = `${OUT}/place-${PLACE}-${tag}-tower.png`; await page.waitForTimeout(300); await page.screenshot({ path: shotT }); console.log('     screenshot', shotT);
  }
  // a tap on the building under the centre of the view
  const card = C.kind === 'blocks' ? 'skipped (blocks: the named tower above)' : await page.evaluate(async () => { const G = __docklands3.globe; for (let y = 0.45; y < 0.8; y += 0.05) { G.tap(innerWidth / 2, innerHeight * y); const c = document.getElementById('card'); if (!c.hidden && /OSM/.test(c.textContent)) return c.querySelector('h2').textContent + ' · ' + c.querySelector('p.small').textContent; } return null; });
  check(!!card, 'a tap on a building opens its card', card || 'no card');
  // a blocks place: the whole city from far (coarse levels: merged blocks)
  if (C.kind === 'blocks') {
    const far = await page.evaluate(async ({ o, p }) => { const G = __docklands3.globe; await docklands.goTo({ lon: o.lon, lat: o.lat, range_m: o.range, tilt_deg: o.tilt });
      const t0 = performance.now(); while (performance.now() - t0 < 240000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); const st = G.placesStats().find(x => x.id === p); if (st.settled && performance.now() - t0 > 1500) break; }
      const d = await docklands.describeView(); return { st: G.placesStats().find(x => x.id === p), dp: (d.places || []).find(x => x.place === p), view: docklands.getView(), frame: G.stats.frame }; }, { o: C.far, p: PLACE });
    const lv = Object.keys(far.st.drawn_by_level).map(Number);
    check(far.st.settled && far.dp && far.dp.blocks_drawn > 2000 && Math.min(...lv) <= 11, `far view (${C.far.range / 1000} km): the whole city as coarse blocks`, `${JSON.stringify(far.st.drawn_by_level)} by level; ${far.dp?.blocks_drawn} blocks ${JSON.stringify(far.dp?.blocks_by_source)}; ${far.st.triangles} place triangles, frame ${far.frame?.triangles} triangles, ${far.frame?.calls} calls; eye ${far.view.eye.above_ground_m} m up`);
    const shotF = `${OUT}/place-${PLACE}-${tag}-far.png`; await page.waitForTimeout(500); await page.screenshot({ path: shotF }); console.log('     screenshot', shotF);
  }
  // landmarks (minarets, domes, towers): present, counted in describeView, a tap on a mapped minaret gives its card; the old town
  // and the city 8 km out (screenshots)
  if (C.landmarks?.tall) {
    // tall thin objects (place.landmarks.tall_objects): the named one drawn, counted in describeView, its card on a tap; the
    // far one (the Poolbeg chimneys) from 2 km
    const L = C.landmarks;
    const lm = await page.evaluate(async ({ L, p }) => { const G = __docklands3.globe; await docklands.goTo({ lon: L.at.lon, lat: L.at.lat, range_m: 450, tilt_deg: 72, heading_deg: 200 });
      const t0 = performance.now(); while (performance.now() - t0 < 180000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); const st = G.placesStats().find(x => x.id === p); if (st.settled && G.landmarks?.stats().sets.find(s => s.id === p)?.state === 'ready' && performance.now() - t0 > 1500) break; }
      for (let k = 0; k < 3; k++) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }
      const st = G.landmarks.stats(), rows = G.landmarks.rows(p), d = await docklands.describeView(), dp = (d.places || []).find(x => x.place === p), dl = dp?.landmarks;
      const s = G.landmarks.screen(p, L.tall); let card = null;
      if (s?.base && s?.top) { G.tap((s.base[0] + s.top[0]) / 2, s.base[1] * 0.5 + s.top[1] * 0.5); const el = document.getElementById('card'); card = el.hidden ? null : el.textContent.replace(/\s+/g, ' ').slice(0, 300); el.hidden = true; }
      const fp = await docklands.findPlaces(L.name, 5);
      return { st: st.sets.find(x => x.id === p), tris: st.triangles, tall: rows.filter(r => r.type === 'tall').length, towers: rows.filter(r => r.type === 'tower').length, dl, text: dp?.text?.match(/Skyline:[^.]*\./)?.[0], card, s, fp: fp.slice(0, 3).map(r => `${r.name} (${r.kind}) ${r.id}`) }; }, { L, p: PLACE });
    check(lm.st?.state === 'ready' && lm.tall > 0 && lm.tris > 0, 'landmarks: tall objects present and drawn', `${lm.tall} tall objects, ${lm.towers} towers; ${lm.tris} triangles drawn; counts ${JSON.stringify(lm.st?.counts?.tall_by_kind)}`);
    check(lm.dl && lm.dl.tall_in_view > 0 && /Skyline/.test(lm.text || ''), 'describeView counts the tall objects in view', `${JSON.stringify(lm.dl?.tall_by_kind)}; tallest ${JSON.stringify(lm.dl?.tallest_in_view)}; ${lm.text}`);
    check(!!lm.card && lm.card.includes(L.name) && /Mapped in OpenStreetMap/.test(lm.card), `a tap on the ${L.name} opens its card`, lm.card || JSON.stringify(lm.s));
    check(lm.fp.some(x => x.startsWith(L.name)), `findPlaces "${L.name}" (landmark search)`, lm.fp.join('; '));
    const shotS = `${OUT}/place-${PLACE}-${tag}-landmark.png`; await page.waitForTimeout(300); await page.screenshot({ path: shotS }); console.log('     screenshot', shotS);
    const fz = await page.evaluate(async ({ f, p }) => { const G = __docklands3.globe; await docklands.goTo({ lon: f.lon, lat: f.lat, range_m: 2000, tilt_deg: 70, heading_deg: 270 });
      const t0 = performance.now(); while (performance.now() - t0 < 180000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); const st = G.placesStats().find(x => x.id === p); if (st.settled && performance.now() - t0 > 1500) break; }
      const d = await docklands.describeView(); return { ...(d.places || []).find(x => x.place === p)?.landmarks, hidden: G.landmarks.stats().sets.find(x => x.id === p)?.hidden_city_blocks }; }, { f: L.far, p: PLACE });
    check(fz && (fz.tall_by_kind?.[L.far.kind] || 0) > 0 && fz.hidden > 0, `the ${L.far.kind}s from 2 km: drawn and counted, their city blocks hidden`, JSON.stringify(fz && { tall: fz.tall_by_kind, tallest: fz.tallest_in_view, city_blocks_hidden: fz.hidden }));
    const shotP = `${OUT}/place-${PLACE}-${tag}-${L.far.kind}.png`; await page.waitForTimeout(300); await page.screenshot({ path: shotP }); console.log('     screenshot', shotP);
  } else if (C.landmarks) {
    const L = C.landmarks;
    const lm = await page.evaluate(async ({ L, p }) => { const G = __docklands3.globe; await docklands.goTo({ lon: L.at.lon, lat: L.at.lat, range_m: 350, tilt_deg: 75, heading_deg: 120 });
      const t0 = performance.now(); while (performance.now() - t0 < 180000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); const st = G.placesStats().find(x => x.id === p); if (st.settled && G.landmarks?.stats().sets[0]?.state === 'ready' && performance.now() - t0 > 1500) break; }
      for (let k = 0; k < 3; k++) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }
      const st = G.landmarks.stats(), rows = G.landmarks.rows(p), d = await docklands.describeView(), dl = (d.places || []).find(x => x.place === p)?.landmarks;
      const s = G.landmarks.screen(p, L.minaret); let card = null;
      if (s?.base && s?.top) { G.tap((s.base[0] + s.top[0]) / 2, s.base[1] * 0.3 + s.top[1] * 0.7); const el = document.getElementById('card'); card = el.hidden ? null : el.textContent.replace(/\s+/g, ' ').slice(0, 300); el.hidden = true; }
      return { st, mapped: rows.filter(r => r.type === 'minaret' && r.source === 'mapped').length, est: rows.filter(r => r.type === 'minaret' && r.source === 'estimated').length, domes: rows.filter(r => r.type === 'dome').length, dl, card, s }; }, { L, p: PLACE });
    check(lm.st.sets[0]?.state === 'ready' && lm.mapped > 0 && lm.est > 0 && lm.st.triangles > 0, 'landmarks: minarets present (mapped and estimated apart), drawn', `${lm.mapped} mapped, ${lm.est} estimated minarets, ${lm.domes} domes; ${lm.st.tiles} landmark meshes, ${lm.st.triangles} triangles drawn; ${lm.st.sets[0]?.hidden_core_vertices} core part vertices replaced`);
    check(lm.dl && lm.dl.minarets_in_view.mapped + lm.dl.minarets_in_view.estimated > 0 && lm.dl.mosques_in_view > 0, 'describeView counts the mosques and minarets in view', JSON.stringify(lm.dl && { mosques: lm.dl.mosques_in_view, minarets: lm.dl.minarets_in_view, domes: lm.dl.domes_in_view, towers: lm.dl.towers_in_view, tallest: lm.dl.tallest_in_view }));
    check(!!lm.card && lm.card.includes(L.name) && /Minaret/.test(lm.card) && /Mapped in OpenStreetMap/.test(lm.card), `a tap on ${L.name}'s minaret opens its card`, lm.card || JSON.stringify(lm.s));
    const shotB = `${OUT}/place-${PLACE}-${tag}-bascarsija.png`; await page.waitForTimeout(300); await page.screenshot({ path: shotB }); console.log('     screenshot', shotB);
    const c8 = await page.evaluate(async p => { const G = __docklands3.globe; await docklands.goTo({ lon: 18.4, lat: 43.855, range_m: 8000, tilt_deg: 72, heading_deg: 80 });
      const t0 = performance.now(); while (performance.now() - t0 < 180000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); const st = G.placesStats().find(x => x.id === p); if (st.settled && performance.now() - t0 > 1500) break; }
      const d = await docklands.describeView(); return { dl: (d.places || []).find(x => x.place === p)?.landmarks, st: G.landmarks.stats() }; }, PLACE);
    check(c8.dl && c8.dl.minarets_in_view.estimated + c8.dl.minarets_in_view.mapped > 20 && c8.st.triangles > 0, 'the city 8 km out: minarets drawn and counted', JSON.stringify(c8.dl && { mosques: c8.dl.mosques_in_view, minarets: c8.dl.minarets_in_view, towers: c8.dl.towers_in_view }));
    const shotC = `${OUT}/place-${PLACE}-${tag}-city8.png`; await page.waitForTimeout(300); await page.screenshot({ path: shotC }); console.log('     screenshot', shotC);
  }
  // a far view, 30 km out: surroundings tiles with main roads and the place's river; the town of the city ring found by name
  if (C.kind !== 'blocks') { const far = await page.evaluate(async ({ o, p }) => { const G = __docklands3.globe; await docklands.goTo({ lon: o.lon, lat: o.lat, range_m: 30000, tilt_deg: 45 });
    const t0 = performance.now(); while (performance.now() - t0 < 180000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); const st = G.placesStats().find(x => x.id === p); if (st.settled && performance.now() - t0 > 1500) break; }
    const d = await docklands.describeView(); return { st: G.placesStats().find(x => x.id === p), sur: (d.places || []).find(x => x.place === p)?.surroundings, view: docklands.getView() }; }, { o: FJ.origin, p: PLACE });
  check(far.st.settled && far.st.tiers.surroundings > 0 && far.sur && far.sur.roads_km > 20 && far.sur.rivers.some(r => C.river.test(r)), 'far view (30 km): surroundings tiles with main roads and the river',
    `${JSON.stringify(far.st.drawn_by_level)} by level; roads ${far.sur?.roads_km} km, rail ${far.sur?.rail_km} km, rivers ${far.sur?.rivers?.join(', ')}; places in view ${far.sur?.places_in_view?.slice(0, 5).join(', ')}; eye ${far.view.eye.above_ground_m} m up`);
  const shot3 = `${OUT}/place-${PLACE}-${tag}-far.png`; await page.waitForTimeout(500); await page.screenshot({ path: shot3 }); console.log('     screenshot', shot3); }
  const ft = await page.evaluate(q => docklands.findPlaces(q, 5), C.town);
  check(ft.some(r => r.id && r.id.startsWith('place:' + PLACE) && r.kind === 'place'), `findPlaces "${C.town}" (${C.kind === 'blocks' ? 'the place\'s own word' : 'a town of the city ring'})`, ft.slice(0, 3).map(r => `${r.name} (${r.kind})`).join('; '));
  // a city block (outside the core): its card names the footprint's source (OSM, IGN or Microsoft) and the height's
  const blk = await page.evaluate(async ({ c, p }) => { const G = __docklands3.globe; await docklands.goTo({ lon: c.lon, lat: c.lat, range_m: 900, tilt_deg: 45 });
    const t0 = performance.now(); while (performance.now() - t0 < 180000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); const st = G.placesStats().find(x => x.id === p); if (st.settled && performance.now() - t0 > 1500) break; }
    const d = await docklands.describeView(), sur = (d.places || []).find(x => x.place === p)?.surroundings;
    for (let y = 0.35; y < 0.85; y += 0.025) for (const x of [0.2, 0.35, 0.5, 0.65, 0.8]) { G.tap(innerWidth * x, innerHeight * y); const el = document.getElementById('card'); if (!el.hidden && el.querySelector('h2')?.textContent === 'City block') return { card: el.textContent.replace(/\s+/g, ' ').slice(0, 160), sur }; }
    return { card: null, sur }; }, { c: C.city, p: PLACE });
  check(!!blk.card && /Footprint from/.test(blk.card), 'a tap on a city block opens its card with the footprint source', `${blk.card}; blocks by source in view ${JSON.stringify(blk.sur?.city_blocks_by_source)}`);
  // an extra geometry class (a blocks place: London's Microsoft footprints): describeView counts its blocks; a tap names it
  if (C.extra) { const xb = await page.evaluate(async ({ c, p }) => { const G = __docklands3.globe; await docklands.goTo({ lon: c.lon, lat: c.lat, range_m: 700, tilt_deg: 50 });
      const t0 = performance.now(); while (performance.now() - t0 < 180000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); const st = G.placesStats().find(x => x.id === p); if (st.settled && performance.now() - t0 > 1500) break; }
      const d = await docklands.describeView(), dp = (d.places || []).find(x => x.place === p); let card = null;
      for (let y = 0.4; y < 0.85 && !card; y += 0.025) for (const x of [0.2, 0.35, 0.5, 0.65, 0.8]) { G.tap(innerWidth * x, innerHeight * y); const el = document.getElementById('card'); if (!el.hidden && /Microsoft/.test(el.textContent)) { card = el.textContent.replace(/\s+/g, ' ').slice(0, 200); break; } }
      return { by: dp?.blocks_by_source, n: dp?.blocks_drawn, text: dp?.text?.slice(0, 220), card }; }, { c: C.extra, p: PLACE });
    const k = Object.keys(xb.by || {}).find(a => C.extra.label.test(a));
    check(!!k && xb.by[k] > 100, 'describeView counts the blocks of the extra geometry class', `${xb.n} blocks ${JSON.stringify(xb.by)}; ${xb.text}`);
    check(!!xb.card && /Footprint from/.test(xb.card), 'a tap on a block of the extra class names its footprint source', String(xb.card));
    const shot4 = `${OUT}/place-${PLACE}-${tag}-extra.png`; await page.screenshot({ path: shot4 }); console.log('     screenshot', shot4); }
  // goTo by name from far away: fly to the world, then to the place by its word
  await page.evaluate(() => docklands.goTo({ lon: 0, lat: 20, alt_m: 2e7 }));
  const g = await page.evaluate(q => docklands.goTo(q), C.search);
  const gw = C.kind === 'blocks' ? C.building : FJ.origin;
  check(g.found && Math.abs(g.target.lat - gw.lat) < 0.01 && Math.abs(g.target.lon - gw.lon) < 0.01 && g.eye.above_ground_m < 5000, `goTo("${C.search}") flies there`, `${g.found?.name} (${g.found?.kind}); eye ${g.eye.above_ground_m} m up`);
  // far away the place is freed
  const freed = await page.evaluate(async p => { const G = __docklands3.globe; for (let k = 0; k < 3; k++) { await docklands.goTo({ lon: 0, lat: 20, alt_m: 2e7 }); G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); } return G.places.find(x => x.id === p).state; }, PLACE);
  check(freed === null, 'freed when the eye is far', String(freed));
  check(!errors.length, 'no page errors', errors.slice(0, 5).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all passed');
process.exit(failed ? 1 : 0);
