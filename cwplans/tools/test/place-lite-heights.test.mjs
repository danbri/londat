// Tests of cwplans/tools/place-lite-heights.mjs (landmark heights of the UK lite set: OSM building parts via Overture,
// Wikidata P2048): the Wikidata answer (units, greatest value), the part index (by Overture building id), and the rule
// (parts above the body drawn as prisms; a Wikidata spire on the tallest part, else a tower at the centroid; limits).
// Skill docklands-3d-page, "Three.js port: the UK lite set (2026-10-22)".
import test from 'node:test';
import assert from 'node:assert/strict';
import { wdHeights, partIndex, landmarkHeights } from '../place-lite-heights.mjs';

const R = { rise_m: 3, rise_share: 0.15, max_parts: 64, max_wd_m: 330, spire_share: 0.35, tower_share: 0.2, tower_min_m: 4, tower_max_m: 15 };
const sq = (x, y, d) => [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]];

test('wdHeights: metres and feet, the greatest value of an item, bad rows skipped', () => {
  const H = wdHeights('?item\t?amount\t?unit\n<http://www.wikidata.org/entity/Q1>\t22.0\t<http://www.wikidata.org/entity/Q11573>\n<http://www.wikidata.org/entity/Q1>\t66.0\t<http://www.wikidata.org/entity/Q11573>\n<http://www.wikidata.org/entity/Q2>\t"404"^^<http://www.w3.org/2001/XMLSchema#decimal>\t<http://www.wikidata.org/entity/Q3710>\n<http://www.wikidata.org/entity/Q3>\t5\t<http://www.wikidata.org/entity/Q199>\n');
  assert.equal(H.get('Q1'), 66); assert.equal(H.get('Q2'), 123.1); assert.equal(H.has('Q3'), false);
  // rank and end time: Lincoln (83 m preferred; 159.7 m ended 1549)
  const L = wdHeights('?item\t?amount\t?unit\t?rank\t?end\n<http://www.wikidata.org/entity/Q390169>\t83.0\t<http://www.wikidata.org/entity/Q11573>\t<http://wikiba.se/ontology#PreferredRank>\t\n<http://www.wikidata.org/entity/Q390169>\t159.7\t<http://www.wikidata.org/entity/Q11573>\t<http://wikiba.se/ontology#NormalRank>\t1549-01-01T00:00:00Z\n<http://www.wikidata.org/entity/Q5>\t90\t<http://www.wikidata.org/entity/Q11573>\t<http://wikiba.se/ontology#DeprecatedRank>\t\n<http://www.wikidata.org/entity/Q5>\t40\t<http://www.wikidata.org/entity/Q11573>\t<http://wikiba.se/ontology#NormalRank>\t\n');
  assert.equal(L.get('Q390169'), 83); assert.equal(L.get('Q5'), 40);
});

test('partIndex: parts by building id, OSM id, heights', () => {
  const M = partIndex([{ id: 'p1', building_id: 'B', height: 66, min_height: 40, sources: [{ dataset: 'OpenStreetMap', record_id: 'w5@2' }], geometry: { type: 'Polygon', coordinates: sq(0, 54, 0.0002) } }, { id: 'p2', building_id: null, height: 9, geometry: { type: 'Polygon', coordinates: sq(0, 54, 0.0001) } }]);
  assert.equal(M.size, 1); assert.deepEqual(M.get('B').map(p => [p.osm, p.h, p.min]), [['w5', 66, 40]]);
});

test('landmarkHeights: parts above the body, a Wikidata spire on the tallest part, a tower when there is no part', () => {
  const parts = [{ h: 66, min: 0, rings: sq(0, 54, 0.0002) }, { h: 20, min: 0, rings: sq(0, 54, 0.0003) }, { h: 30, min: 0, rings: sq(0.001, 54, 0.0002) }];
  const a = landmarkHeights({ h: 18.7, src: 'ms', a: 8000, c: [0, 54], wikidata: 'Q1' }, parts, new Map([['Q1', 66]]), R);
  assert.deepEqual(a.towers.map(t => [t.kind, t.top_h]), [['part', 66], ['part', 30]]); assert.equal(a.top_h, 66); assert.equal(a.top_src, 'osm-part');
  const b = landmarkHeights({ h: 18.7, src: 'ms', a: 8000, c: [0, 54], wikidata: 'Q1' }, parts, new Map([['Q1', 123]]), R);
  assert.equal(b.towers.at(-1).kind, 'spire'); assert.equal(b.towers.at(-1).base_h, 66); assert.equal(b.top_h, 123); assert.equal(b.top_src, 'wikidata');
  const c = landmarkHeights({ h: 10.7, src: 'ghsl', a: 8646, c: [-2.97, 53.4], wikidata: 'Q9' }, [], new Map([['Q9', 101]]), R);
  assert.equal(c.towers.length, 1); assert.equal(c.towers[0].kind, 'tower'); assert.equal(c.towers[0].side, 15); assert.equal(c.top_h, 101);
  const d = landmarkHeights({ h: 40, src: 'osm-height', a: 900, c: [0, 54], wikidata: 'Q8' }, [], new Map([['Q8', 900]]), R);
  assert.equal(d.towers.length, 0, 'over max_wd_m'); assert.equal(d.top_h, 40);
  const e = landmarkHeights({ h: 40, src: 'osm-height', a: 900, c: [0, 54], wikidata: 'Q8' }, [], new Map([['Q8', 42]]), R);
  assert.equal(e.towers.length, 0, 'not above the rise');
});
