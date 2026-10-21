// The branch-key rule (registry-branch-key.mjs, F46 and F20): synthetic registry records, one case per rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBranchMerge, nameKey, nameVariants, recordsOf } from '../registry-branch-key.mjs';

const rec = (id, occupants, lat = 51.505, lon = -0.02) => ({ id, lat, lon, postcodes: new Set(), occupants });
const run = (recs, tags = {}) => applyBranchMerge({ recs, tagsOf: new Map(Object.entries(tags)), outlineTags: new Map() });

test('name keys: the audit normalisation, without spaces; place and kind variants', () => {
  assert.equal(nameKey("Joe & The Juice Canary Wharf"), 'joeandjuice');
  assert.equal(nameKey("Allen's Pharmacy"), nameKey('Allens Pharmacy'));
  assert.ok(nameVariants('Pret A Manger, Cabot Place').has('pretamanger'));
  assert.ok(nameVariants("Nando's Restaurant").has('nandos'));
});

test('a shared identifier from an OSM tag (fhrs:id) merges, high, the OSM record is the primary', () => {
  const r = rec('cwb-1', [{ name: 'Poplar Mini Market', role: 'shop', source: 'osm', osm: 'node/1', placed_by: 'OSM point' },
    { name: 'Corner Shop', role: 'food business (FSA)', source: 'fsa', fhrs_id: 150678, address: '53 Poplar High Street', postcode: 'E14 0DJ', placed_by: 'FSA point' }]);
  const { stats } = run([r], { 'node/1': { 'fhrs:id': '150678' } });
  assert.equal(r.occupants.length, 1);
  const o = r.occupants[0];
  assert.equal(o.name, 'Poplar Mini Market'); assert.equal(o.source, 'osm+fsa'); assert.equal(o.primary_source, 'osm');
  assert.equal(o.merge_confidence, 'high'); assert.equal(o.fhrs_id, 150678); assert.equal(recordsOf(o).length, 2);
  assert.equal(stats.by_rule['shared identifier'], 1);
});

test('the same name in one building: medium, high with a second agreement (same mall)', () => {
  const r = rec('cwb-2', [{ name: 'Zizzi', role: 'food and drink', source: 'osm', osm: 'node/2', mall: 'Cabot Place' },
    { name: 'Zizzi', role: 'food business (FSA)', source: 'fsa', fhrs_id: 9, mall: 'Cabot Place' },
    { name: 'Kricket', role: 'food and drink', source: 'osm', osm: 'node/3' }, { name: 'Kricket', role: 'food business (FSA)', source: 'fsa', fhrs_id: 10 }]);
  run([r]);
  assert.equal(r.occupants.length, 2);
  assert.deepEqual(r.occupants.map(o => o.merge_confidence), ['high', 'medium']);
});

test('kept apart: same source, an organisation and a chain branch, different identifiers of one kind', () => {
  const r = rec('cwb-3', [{ name: 'Canary Wall', role: 'leisure', source: 'osm', osm: 'node/4' }, { name: 'Canary Wall', role: 'leisure', source: 'osm', osm: 'node/5' },
    { name: 'HSBC', role: 'headquarters (Wikidata P159)', source: 'wikidata', wikidata: 'Q190464' }, { name: 'HSBC UK', role: 'branch: bank', source: 'osm' },
    { name: 'Morrisons Daily', role: 'shop', source: 'osm', osm: 'node/6' }, { name: 'Morrisons Daily', role: 'food business (FSA)', source: 'fsa', fhrs_id: 2 }]);
  const { review } = run([r], { 'node/6': { 'fhrs:id': '1' } });
  assert.equal(r.occupants.length, 6);
  assert.deepEqual(review.map(x => x.reason).sort(), ['an organisation record and a chain branch of the same name: kept apart', 'different identifiers of one kind (fhrs): two places', 'same source (osm) and no second key']);
});

test('F20: an ODS head office and its ODS site of one name in one building become one occupant (medium)', () => {
  const r = rec('cwb-4', [{ name: '360 COMMUNITY CARE', role: 'head office (ODS)', source: 'ods', ods_code: 'CAHJ', address: 'WEWORK, 30 CHURCHILL PLACE' },
    { name: '360 COMMUNITY CARE LONDON', role: 'register: ods', source: 'ods', ods_code: 'VMAQA', address: 'WEWORK, 30 CHURCHILL PLACE, CANARY WHARF' }]);
  run([r]);
  assert.equal(r.occupants.length, 1); assert.equal(r.occupants[0].merge_rule, 'ODS provider and its site (F20)'); assert.equal(r.occupants[0].merge_confidence, 'medium');
});

test('one record matching two records of one source by name is ambiguous: no merge', () => {
  const r = rec('cwb-5', [{ name: 'Hazev', role: 'food', source: 'osm', osm: 'node/7' }, { name: 'Hazev', role: 'food', source: 'osm', osm: 'node/8' },
    { name: 'Hazev', role: 'food business (FSA)', source: 'fsa', fhrs_id: 3 }]);
  const { review } = run([r]);
  assert.equal(r.occupants.length, 3); assert.ok(review.some(x => /^ambiguous/.test(x.reason)));
});

test('across buildings: the CWG mall address outranks an OSM point in the next building (medium); two strong positions go to review', () => {
  const mall = rec('cwb-6', [{ name: 'Le Chalet Cryo', role: 'directory: shop', source: 'cwg', cwg_url: 'https://canarywharf.com/shop/le-chalet-cryo/', mall: 'Canada Place', placed_confidence: 'medium' }]);
  const tower = rec('cwb-7', [{ name: 'Le Chalet Cryo', role: 'healthcare', source: 'osm', osm: 'node/9', placed_by: 'OSM point' }], 51.5055, -0.0195);
  const a = rec('cwb-8', [{ name: 'Riverside Store', role: 'food business (FSA)', source: 'fsa', fhrs_id: 4, placed_by: 'street address + postcode', placed_confidence: 'high' }], 51.51, -0.01);
  const b = rec('cwb-9', [{ name: 'Riverside Store', role: 'shop', source: 'osm', osm: 'node/10', placed_by: 'OSM point' }], 51.5105, -0.0105);
  const { stats, review } = run([mall, tower, a, b]);
  assert.equal(mall.occupants.length, 1); assert.equal(tower.occupants.length, 0);
  assert.equal(mall.occupants[0].merge_confidence, 'medium'); assert.equal(mall.occupants[0].merged_from[0].building, 'cwb-7');
  assert.equal(stats.across_buildings.merges, 1);
  assert.ok(review.some(x => /two strong positions disagree/.test(x.reason)));
});

test('a former identifier named by an OSM was: tag joins the record of the earlier registration (medium)', () => {
  const r = rec('cwb-10', [{ name: 'Sk:n', role: 'service: doctors', source: 'osm', osm: 'node/11' },
    { name: 'Sk:n - London Canary Wharf', role: 'register: cqc', source: 'cqc', cqc_location_id: '1-232854118' }]);
  run([r], { 'node/11': { 'ref:GB:cqc_location': '1-20631772333', 'was:ref:GB:cqc_location': '1-232854118' } });
  assert.equal(r.occupants.length, 1); assert.equal(r.occupants[0].merge_rule, 'former identifier (OSM was: tag)'); assert.equal(r.occupants[0].merge_confidence, 'medium');
});
