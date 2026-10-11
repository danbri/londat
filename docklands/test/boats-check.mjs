// Boats of the Three.js port (2026-10-11): the AIS vessel models (layers/ships.js, boats-models.js) and the GENERIC boats
// at known moorings (moored-boats.js, layer river, part "Moorings and houseboats"). WebGL 2 in SwiftShader.
//   node docklands/test/boats-check.mjs [--base http://127.0.0.1:8194] [--out docklands/test/out/boats] [--layers ships,river,water,piers,trees] [--full]
// Checks: no page error; counts of AIS vessels drawn (fixed set: ?ais=snapshot) by model; generic moored boats per
// mooring and by type; the hidden houseboat building boxes; a frame's triangles and draw calls of the boat meshes.
// Screenshots: the owner's photo view ?view=greenlanddock&t=2026-10-11T12:45 (boats at the far, east end of the dock),
// close cameras over the east end of Greenland Dock, South Dock Marina, Hermitage and Downings Roads moorings, Limehouse
// Basin and Blackwall Basin, and the river with AIS ships (Canary Wharf to Greenland Pier, the snapshot). --full: the
// photo view with every default layer as well (slow in software: 2 to 10 minutes).
// Skill: docklands-3d-page, "Three.js port: boats and moored barges (2026-10-11)".
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8194'), OUT = arg('--out', 'docklands/test/out/boats'), LAYERS = arg('--layers', 'ships,river,water,piers,trees'), FULL = process.argv.includes('--full');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const res = { layers: LAYERS, shots: {}, errors: [] };
let fail = 0;
async function open(q, hash = '', size = { width: 1200, height: 800 }) {
  const page = await browser.newPage({ viewport: size }), errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|GL Driver|net::ERR|404/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}/docklands/?webgl&animate=0&weather=0&wheels=0&${q}${hash}`, { timeout: 300000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && __docklands3.layers.river && __docklands3.layers.river.api.moored && __docklands3.STATS.ships, null, { timeout: 600000 });
  return { page, errors };
}
const settle = async (page, n = 3) => { for (let k = 0; k < n; k++) { await page.evaluate(() => __docklands3.draw()); await page.waitForTimeout(700); } };
const shot = async (page, name) => {
  await page.evaluate(() => { for (const e of document.querySelectorAll('body > *')) if (e.tagName !== 'CANVAS' && !e.querySelector('canvas') && !/^(SCRIPT|STYLE)$/.test(e.tagName)) e.style.visibility = 'hidden'; });
  const f = `${OUT}/${name}.png`; writeFileSync(f, await page.screenshot({ timeout: 300000 }));
  await page.evaluate(() => { for (const e of document.querySelectorAll('body > *')) e.style.visibility = ''; });
  return f;
};
// a camera looking at (x, z) from `dist` m, yaw (rad), pitch (rad)
const cam = (page, x, z, y, dist, yaw, pitch) => page.evaluate(c => { __docklands3.setCam(c); __docklands3.draw(); }, { tx: x, tz: z, ty: y, dist, yaw, pitch });

// 1. the photo view: counts, costs, the shot
{ const { page, errors } = await open(`layers=${LAYERS}&ais=snapshot&view=greenlanddock&t=2026-10-11T12:45`);
  await page.waitForTimeout(2500); await settle(page);
  res.moored = await page.evaluate(() => __docklands3.layers.river.api.state.moored);
  res.ships = await page.evaluate(() => { const L = __docklands3.layers.ships.api, by = {}; for (const m of L.meshes) if (m.userData.model && m.count && m.visible) by[m.userData.model.key] = m.count; return { stats: __docklands3.STATS.ships, byModel: by, vessels: L.vessels.length }; });
  res.cost = await page.evaluate(() => { const { renderer, scene } = __docklands3, out = { boatMeshes: 0, boatTris: 0 };
    scene.traverse(o => { if (o.isInstancedMesh && o.userData.model && o.visible && o.count) { out.boatMeshes++; out.boatTris += o.count * o.userData.model.tris; } }); return out; });
  console.log('moored', JSON.stringify({ ...res.moored, places: res.moored && res.moored.places.length }));
  console.log('ships', JSON.stringify(res.ships)); console.log('cost', JSON.stringify(res.cost));
  res.shots.greenlanddock = await shot(page, 'greenlanddock');
  // the far end of the dock, nearer: the east end of Greenland Dock and its pontoons, from the west, low
  await cam(page, -1100, 1100, 3, 260, -1.45, .22); await settle(page); res.shots.gd_east = await shot(page, 'gd-east');
  await cam(page, -1090, 1300, 3, 230, -1.0, .5); await settle(page); res.shots.south_dock = await shot(page, 'south-dock-marina');
  await cam(page, -3330, 230, 2, 180, .4, .45); await settle(page); res.shots.hermitage = await shot(page, 'hermitage');
  await cam(page, -3440, 395, 2, 170, 3.0, .45); await settle(page); res.shots.downings = await shot(page, 'downings-roads');
  await cam(page, -1150, -700, 3, 320, -.8, .6); await settle(page); res.shots.limehouse = await shot(page, 'limehouse-basin');
  await cam(page, 620, 30, 4, 170, .9, .45); await settle(page); res.shots.blackwall = await shot(page, 'blackwall-basin');
  await cam(page, -12, -1419, 3, 120, 2.3, .4); await settle(page); res.shots.limehouse_cut = await shot(page, 'limehouse-cut');
  // night: windows of the homes lit (Blackwall Basin)
  await page.evaluate(() => { const D = __docklands3; D.setClock(D.fromLondon('2026-10-11T21:30')); });
  await cam(page, 620, 30, 4, 170, .9, .45); await settle(page, 4); res.shots.blackwall_night = await shot(page, 'blackwall-basin-night');
  await page.evaluate(() => { const D = __docklands3; D.setClock(D.fromLondon('2026-10-11T12:45')); }); await settle(page);
  // tap a generic boat: its card says it is generic
  res.card = await page.evaluate(async () => { const b = __docklands3.layers.river.api.moored.boats.find(q => q.src === 'pontoon' && q.cls === 'marina'); if (!b) return null;
    __docklands3.setCam({ tx: b.x, tz: b.z, ty: 2, dist: 60, yaw: .3, pitch: .6 }); __docklands3.draw(); await new Promise(r => setTimeout(r, 1500)); __docklands3.camera.updateMatrixWorld();
    const v = new __docklands3.THREE.Vector3(b.x, (b.y ?? 3) + 1, b.z).project(__docklands3.camera), c = __docklands3.renderer.domElement.getBoundingClientRect();
    __docklands3.tap((v.x + 1) / 2 * c.width + c.left, (1 - v.y) / 2 * c.height + c.top);
    await new Promise(r => setTimeout(r, 300)); const card = document.getElementById('cardBody'); return card ? card.textContent.slice(0, 400) : null; });
  console.log('card', res.card);
  res.errors.push(...errors); await page.close(); }

// 2. the river with AIS ships (the committed snapshot): Canary Wharf Pier to Greenland Pier, and close to a tug and a Clipper
{ const { page, errors } = await open(`layers=${LAYERS}&ais=snapshot&t=2026-10-11T12:45`);
  await page.waitForTimeout(2500); await settle(page);
  await cam(page, -700, 600, 3, 900, .5, .35); await settle(page); res.shots.river = await shot(page, 'river-ais');
  res.closeups = await page.evaluate(() => __docklands3.layers.ships.api.vessels.filter(v => v.model).map(v => ({ mmsi: v.mmsi, name: v.name, model: v.model, x: Math.round(v.x), z: Math.round(v.z), L: v.L })));
  for (const m of ['cat', 'tug', 'tour', 'sbarge', 'tanker', 'launch', 'dredger', 'cruise']) {
    const v = res.closeups.find(q => q.model === m); if (!v) continue; await cam(page, v.x, v.z, 2, Math.max(40, v.L * 2.4), .7, .3); await settle(page); res.shots['ais_' + m] = await shot(page, 'ais-' + m); }
  res.errors.push(...errors); await page.close(); }

// 3. ?ships=test (synthetic vessels, moving) from the side
{ const { page, errors } = await open(`layers=${LAYERS}&ships=test&t=2026-10-11T12:45`);
  await page.waitForTimeout(3000); await settle(page);
  const v = await page.evaluate(() => __docklands3.layers.ships.api.vessels.map(v => ({ name: v.name, x: v.x, z: v.z })));
  if (v[1]) { await cam(page, v[1].x, v[1].z, 2, 120, 1.2, .3); await settle(page); res.shots.test_tug = await shot(page, 'test-tug-tow'); }
  res.errors.push(...errors); await page.close(); }

if (FULL) { const { page, errors } = await open('view=greenlanddock&ais=snapshot&t=2026-10-11T12:45');
  await page.waitForTimeout(5000); await settle(page, 4); res.shots.full = await shot(page, 'greenlanddock-full'); res.fullMoored = await page.evaluate(() => __docklands3.layers.river.api.state.moored); res.errors.push(...errors); await page.close(); }

await browser.close();
if (res.errors.length) { console.log('ERRORS', res.errors); fail++; }
if (!res.moored || res.moored.boats < 100) { console.log('FAIL: too few moored boats'); fail++; }
if (!res.ships || !Object.keys(res.ships.byModel).length) { console.log('FAIL: no AIS vessel models drawn'); fail++; }
writeFileSync(`${OUT}/boats.json`, JSON.stringify(res, null, 1));
console.log(fail ? `FAIL (${fail})` : 'PASS', OUT);
process.exit(fail ? 1 : 0);
