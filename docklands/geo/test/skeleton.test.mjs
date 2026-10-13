// Tests of the skeleton reader (docklands/geo/skeleton.js) on the UK skeleton (cwplans/docklands/data/uk/, built by
// cwplans/tools/build-uk-skeleton.mjs; OKR KR2.7): cell math, bbox queries, gazetteer search, cards, where-am-I, the
// screen-reader sentences, and the size budget. Run: npm test (or node --test docklands/geo/test/skeleton.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSkeleton, cellOf, cellBbox, cellsIn, fold, gazKey, levelForSpan, distanceM, pointInGeometry } from '../skeleton.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'cwplans', 'docklands', 'data', 'uk');
const fetchJson = async p => JSON.parse(readFileSync(join(DIR, p.replace(/^file:\/\/\/skeleton\//, '')), 'utf8'));
const open = () => openSkeleton('file:///skeleton/', { fetchJson });
const has = existsSync(join(DIR, 'manifest.json'));

test('cells: level 0 has two cells; a point is in the bbox of its cell; cellsIn covers a box', () => {
  assert.deepEqual(cellOf(0, -0.02, 51.5), [0, 0]); assert.deepEqual(cellOf(0, 0.02, 51.5), [1, 0]);
  for (const L of [3, 6, 8, 14]) for (const [lon, lat] of [[-0.0195, 51.5049], [-4.2247, 57.4778], [-5.93, 54.597], [179.99, -89.99], [-180, 90]]) {
    const [x, y] = cellOf(L, lon, lat), [w, s, e, n] = cellBbox(L, x, y);
    assert.ok(lon >= w && lon <= e && lat >= s && lat <= n, `L${L} ${lon},${lat} in ${[w, s, e, n]}`);
  }
  assert.equal(cellsIn(8, [-0.1, 51.4, 0.1, 51.6]).length, 2); assert.equal(cellsIn(6, [-8, 50, 2, 59]).length, 4 * 4);
  assert.equal(levelForSpan(10), 3); assert.equal(levelForSpan(3), 6); assert.equal(levelForSpan(0.2), 8);
});

test('name folding and keys', () => {
  assert.equal(fold("St. Mary's  Loch"), 'st marys loch'); assert.equal(fold('Ynys Môn'), 'ynys mon'); assert.equal(fold('Brighton & Hove'), 'brighton and hove');
  assert.equal(gazKey('canary wharf'), 'ca'); assert.equal(gazKey('a'), 'a_');
  assert.ok(pointInGeometry([0.5, 0.5], { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }));
});

test('UK skeleton: manifest, files present, size budget', { skip: !has && 'no data (run node cwplans/tools/build-uk-skeleton.mjs)' }, async () => {
  const sk = await open(), M = sk.manifest;
  let bytes = 0, files = 0; const per = {};
  for (const L of M.layers) {
    assert.ok(L.describe && L.title && L.geometry, `layer ${L.id} described`);
    for (const s of L.sources) assert.ok(M.sources[s]?.licence, `layer ${L.id} source ${s} has a licence`);
    for (const lv of L.levels) for (const f of lv.files) { const st = statSync(join(DIR, f.path)); assert.equal(st.size, f.bytes, f.path); bytes += st.size; files++; per[L.id] = (per[L.id] || 0) + st.size; }
  }
  for (const f of Object.values(M.gazetteer.files)) { bytes += statSync(join(DIR, f.path)).size; files++; per.gazetteer = (per.gazetteer || 0) + f.bytes; }
  for (const f of Object.values(M.cards.files)) { bytes += statSync(join(DIR, f.path)).size; files++; per.cards = (per.cards || 0) + f.bytes; }
  console.log(`# UK skeleton: ${files} files, ${(bytes / 1e6).toFixed(2)} MB; ` + Object.entries(per).map(([k, v]) => `${k} ${(v / 1e6).toFixed(2)}`).join(', '));
  assert.ok(bytes < 40e6, `under 40 MB (${bytes})`);
  for (const L of M.layers) for (const lv of L.levels) for (const f of lv.files) assert.ok(f.bytes < 5e6, `${f.path} under 5 MB`);
});

test('bbox query: roads, districts and rivers round Leeds and London', { skip: !has && 'no data' }, async () => {
  const sk = await open(), leeds = [-1.70, 53.72, -1.40, 53.88];
  const roads = await sk.features('roads', leeds, 8);
  assert.ok(roads.length > 10, `roads near Leeds: ${roads.length}`);
  assert.ok(roads.every(f => f.bbox[0] <= leeds[2] && f.bbox[2] >= leeds[0] && f.bbox[1] <= leeds[3] && f.bbox[3] >= leeds[1]), 'every feature meets the box');
  assert.ok(roads.some(f => /^M(1|62|621)$/.test(f.properties.ref || '')), 'M1, M62 or M621');
  const nat = await sk.features('roads', [-8, 50, 2, 59], 3);
  assert.ok(nat.length > 0 && nat.every(f => f.properties.kind === 'motorway'), 'national level: motorways only');
  const lon = await sk.features('districts', [-0.05, 51.49, 0.0, 51.52], 8);
  assert.ok(lon.some(f => f.properties.name === 'Tower Hamlets'), 'Tower Hamlets');
  assert.ok(lon.find(f => f.properties.name === 'Tower Hamlets').properties.pop2021 > 300000, 'census 2021 population of Tower Hamlets');
  const thames = await sk.features('rivers', [-0.05, 51.49, 0.0, 51.52], 8);
  assert.ok(thames.some(f => /Thames/.test(f.properties.name)), 'River Thames');
  const coast = await sk.features('boundaries', [-6, 55, -5, 56], 6);
  assert.ok(coast.some(f => f.properties.kind === 'coast'), 'coast lines in western Scotland');
});

test('search: Canary Wharf, Leeds, Inverness, Belfast, a postcode district, a national park', { skip: !has && 'no data' }, async () => {
  const sk = await open();
  const top = async (q, opts) => (await sk.search(q, opts))[0];
  const cw = await top('Canary Wharf');
  assert.ok(cw && distanceM([cw.lon, cw.lat], [-0.0195, 51.505]) < 1500, `Canary Wharf at ${cw?.lon},${cw?.lat}`);
  const leeds = await top('Leeds');
  assert.equal(leeds.name, 'Leeds'); assert.equal(leeds.kind, 'city'); assert.ok(distanceM([leeds.lon, leeds.lat], [-1.549, 53.797]) < 3000);
  const inv = await top('Inverness');
  assert.equal(inv.name, 'Inverness'); assert.ok(distanceM([inv.lon, inv.lat], [-4.225, 57.478]) < 3000, `Inverness at ${inv.lon},${inv.lat}`);
  const bel = await top('Belfast');
  assert.equal(bel.name, 'Belfast'); assert.ok(distanceM([bel.lon, bel.lat], [-5.93, 54.597]) < 5000, `Belfast at ${bel.lon},${bel.lat}`);
  const e14 = await top('E14');
  assert.equal(e14.kind, 'pcd'); assert.ok(distanceM([e14.lon, e14.lat], [-0.02, 51.505]) < 3000);
  const ld = (await sk.search('Lake District')).find(h => h.kind === 'np');
  assert.ok(ld, 'Lake District national park');
  assert.ok((await sk.search('le', { limit: 50 })).length === 50, 'two letters give many');
});

test('cards: facts with source and date; where am I; sentences', { skip: !has && 'no data' }, async () => {
  const sk = await open();
  const leeds = (await sk.search('Leeds'))[0], card = await sk.card(leeds);
  assert.ok(card, 'Leeds has a card'); assert.equal(card.wd, leeds.wd);
  const pop = card.facts.find(f => f.p === 'population');
  assert.ok(pop && pop.v > 400000 && pop.src === 'wikidata' && pop.retrieved, JSON.stringify(pop));
  assert.ok(card.links.wikidata.startsWith('https://www.wikidata.org/wiki/Q'));
  const bel = await sk.card((await sk.search('Belfast'))[0]);
  assert.ok(bel && bel.facts.some(f => f.p === 'population'), 'Belfast card');
  const w = await sk.whereAmI(-0.0195, 51.5049);
  assert.equal(w.country?.name, 'England'); assert.equal(w.region?.name, 'London'); assert.equal(w.district?.name, 'Tower Hamlets');
  assert.ok(w.nearest && w.nearest.distanceM < 3000, JSON.stringify(w.nearest));
  const wi = await sk.whereAmI(-4.2247, 57.4778);
  assert.equal(wi.country?.name, 'Scotland'); assert.equal(wi.district?.name, 'Highland');
  const wb = await sk.whereAmI(-5.93, 54.597);
  assert.equal(wb.country?.name, 'Northern Ireland');
  const d = (await sk.features('districts', [-0.05, 51.49, 0.0, 51.52], 8)).find(f => f.properties.name === 'Tower Hamlets');
  assert.match(sk.describe(d, 'districts'), /^Tower Hamlets, a local authority district \(ONS code E09000030\); [\d,]+ usual residents in the 2021 census\.$/);
  const r = (await sk.features('roads', [-1.70, 53.72, -1.40, 53.88], 8)).find(f => f.properties.ref);
  assert.match(sk.describe(r, 'roads'), /^[MA]\d+, a (motorway|primary A road|A road)/);
});
