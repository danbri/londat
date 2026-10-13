// The world skeleton reader of the globe (docklands/globe/world.js) on the committed data (cwplans/docklands/data/world/):
// manifest, search, "where is this", names by language, the description. node --test (npm test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeWorld, pickLang, fold, decodeLayer } from '../../globe/world.js';

const DIR = fileURLToPath(new URL('../../../cwplans/docklands/data/world/', import.meta.url));
const fetchJson = async u => JSON.parse(readFileSync(fileURLToPath(u), 'utf8'));
async function world(lang = null) {
  const W = makeWorld({ fetchJson, lang }); await W.addManifest(new URL('layers.json', 'file://' + DIR).href);
  await W.loadAll(l => !!l.gazetteer || !!l.lookup || l.nearest); return W;
}

test('size budget: the world skeleton stays under 20 MB', () => {
  const n = readdirSync(DIR).reduce((s, f) => s + statSync(DIR + f).size, 0);
  assert.ok(n < 20e6, `${(n / 1e6).toFixed(1)} MB`);
});
test('decode: wsk1 and GeoJSON give the same feature form', () => {
  const a = decodeLayer({ format: 'wsk1', q: 1000, kind: 'lines', features: [{ p: { name: 'x' }, g: [[1000, 2000, 500, -500]] }] });
  assert.deepEqual(a[0].geometry.coordinates[0], [[1, 2], [1.5, 1.5]]);
  const b = decodeLayer({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'y' }, geometry: { type: 'Point', coordinates: [3, 4] } }] });
  assert.equal(b[0].properties.name, 'y');
});
test('language: visitor preferences matched to Natural Earth languages', () => {
  const av = ['en', 'de', 'zh', 'zht', 'pt'];
  assert.equal(pickLang(['en-GB', 'fr'], av), 'en'); assert.equal(pickLang(['zh-TW'], av), 'zht'); assert.equal(pickLang(['zh-CN'], av), 'zh');
  assert.equal(pickLang(['pt-BR'], av), 'pt'); assert.equal(pickLang(['bs'], av), null); assert.equal(fold('León'), 'leon');
});
test('search: countries, cities, seas; accents folded', async () => {
  const W = await world('en');
  const t = W.search('Tokyo', 1)[0]; assert.equal(t.kind, 'place'); assert.ok(Math.abs(t.lat - 35.69) < 0.1);
  assert.equal(W.search('France', 1)[0].kind, 'country');
  assert.ok(W.search('Leon', 5).some(r => r.country === 'Spain'));
  assert.equal(W.search('North Sea', 1)[0].kind, 'sea');
  assert.ok(W.search('Sarajevo', 1)[0].country.startsWith('Bosnia'));
});
test('where: country, region, sea; nearest place', async () => {
  const W = await world('en');
  assert.equal(W.where(-0.02, 51.5).country.name, 'United Kingdom');
  assert.equal(W.where(139.7, 35.7).country.name, 'Japan');
  assert.equal(W.where(2, 56).sea.name, 'North Sea');
  assert.equal(W.nearestPlaces(18.43, 43.86, 1)[0].name, 'Sarajevo');
});
test('names by language (index after dropped features)', async () => {
  const de = await world('de'), ja = await world('ja');
  assert.equal(de.where(2, 56).sea.name, 'Nordsee'); assert.equal(ja.where(2, 56).sea.name, '北海');
  assert.equal(de.where(-0.02, 51.5).country.name, 'Vereinigtes Königreich');
});
test('describe: a globe view in words', async () => {
  const W = await world('en');
  const d = W.describe({ eye: { lon: -10, lat: 50, alt_m: 2e6 }, centre: { lon: -10, lat: 50 }, heading_deg: 0, tilt_deg: 0, samples: [{ lon: -2, lat: 53 }, { lon: 2, lat: 47 }] });
  assert.match(d.text, /Atlantic Ocean/); assert.deepEqual(d.countries_in_view.sort(), ['France', 'United Kingdom']);
});
