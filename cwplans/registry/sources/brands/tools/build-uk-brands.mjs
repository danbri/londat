#!/usr/bin/env node
// Step 1: the UK brand list, from the OSM name-suggestion-index (NSI, BSD-3-Clause).
//   node magpie/cwplans/registry/sources/brands/tools/build-uk-brands.mjs
// in:  data/raw/registry/nsi/node_modules/name-suggestion-index/dist/json/{nsi,featureCollection}.json
// out: registry/sources/brands/brands-uk.json
// A brand is kept when it sits in the NSI "brands/" tree and its locationSet, resolved by
// location-conflation, contains One Canada Square. scope "uk" = the include list names GB,
// a GB subdivision (gb-eng, gb-lon ...) or a custom .geojson area that contains the point;
// scope "wider" = the brand is only valid here through a world/continent code (001, 150, 154 ...).
import { writeFileSync } from 'fs';
import { join } from 'path';
import { NSI_DIR, OUT, ONE_CANADA_SQ, nsiRequire, readJSON } from './lib.mjs';

const { LocationConflation } = nsiRequire('@rapideditor/location-conflation');
const cc = nsiRequire('@rapideditor/country-coder');
const dist = join(NSI_DIR, 'node_modules/name-suggestion-index/dist/json');
const nsiFile = readJSON(join(dist, 'nsi.json'));
const fc = readJSON(join(dist, 'featureCollection.json'));
const loco = new LocationConflation(fc);

const paths = Object.keys(nsiFile.nsi).filter(p => p.startsWith('brands/'));
const items = [];
for (const p of paths) for (const it of nsiFile.nsi[p].items) items.push({ p, it });
loco.registerLocationSets(items.map(x => x.it));
const here = loco.locationSetsAt(ONE_CANADA_SQ);

const gbCodes = code => typeof code === 'string' && (/^(gb|uk)(-|$)/i.test(code) || (() => { try { return cc.iso1A2Code(code) === 'GB'; } catch { return false; } })());

const out = [], byScope = { uk: 0, wider: 0 }, byTree = {};
let total = items.length;
for (const { p, it } of items) {
  if (!here.has(it.locationSetID)) continue;
  const inc = it.locationSet?.include || [];
  // a custom .geojson in a set valid at the point: it contains the point unless another include does
  const geo = inc.filter(c => typeof c === 'string' && c.endsWith('.geojson'));
  const geoHere = geo.filter(c => here.has(loco.validateLocationSet({ include: [c] }).id));
  const scope = inc.some(gbCodes) || geoHere.length ? 'uk' : 'wider';
  byScope[scope]++;
  const [, k, v] = p.split('/');
  byTree[`${k}=${v}`] = (byTree[`${k}=${v}`] || 0) + 1;
  const t = it.tags || {};
  const o = { id: it.id, name: it.displayName, kv: `${k}=${v}`, wd: t['brand:wikidata'] || null, brand: t.brand || null, scope };
  if (it.matchNames?.length) o.matchNames = it.matchNames;
  if (t.name && t.name !== it.displayName) o.osm_name = t.name;
  const extra = {}; for (const key of ['cuisine', 'vending', 'healthcare', 'craft', 'office', 'operator', 'operator:wikidata', 'brand:en']) if (t[key]) extra[key] = t[key];
  if (Object.keys(extra).length) o.tags = extra;
  o.loc = inc.join(',') + (it.locationSet?.exclude?.length ? ` -${it.locationSet.exclude.length}` : '');
  out.push(o);
}
out.sort((a, b) => a.kv.localeCompare(b.kv) || a.name.localeCompare(b.name));
const meta = {
  source: 'OSM name-suggestion-index (https://github.com/osmlab/name-suggestion-index), BSD-3-Clause',
  nsi_version: nsiFile._meta.version, nsi_generated: nsiFile._meta.generated,
  rule: 'brands/* items whose resolved locationSet contains One Canada Square [-0.0195, 51.5049]',
  nsi_brand_items_total: total, kept: out.length, by_scope: byScope,
  wikidata_qids: new Set(out.map(o => o.wd).filter(Boolean)).size,
  categories: Object.keys(byTree).length,
};
writeFileSync(join(OUT, 'brands-uk.json'), '{"meta":' + JSON.stringify(meta, null, 1) + ',\n"brands":[\n' + out.map(o => JSON.stringify(o)).join(',\n') + '\n]}\n');
console.log(meta);
