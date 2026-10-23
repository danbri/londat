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

test('part shapes (issue #14): a spire part standing on its tower is a pointed cap from its min_height; OSM roof:shape wins; a part mapped high with nothing under it starts at the ground', async () => {
  const { osmPartShapes, partCap, partBases, structureRows } = await import('../place-lite-heights.mjs');
  const S = osmPartShapes('?p\t?rs\t?bp\n<https://www.openstreetmap.org/way/929166111>\t"pyramidal"\t"yes"\n<https://www.openstreetmap.org/way/7>\t"cone"\t"tower"\n<https://www.openstreetmap.org/way/8>\t\t"spire"\n');
  assert.deepEqual(S.get('w7'), { rs: 'cone', bp: 'tower' }); assert.equal(S.get('w8').bp, 'spire');
  // Salisbury: tower 69 m; spire part 69 to 123 m, pyramidal, roof:height 54
  const rows = [{ id: 't', building_id: 'B', height: 69, min_height: null, roof_shape: null, roof_height: null, sources: [{ dataset: 'OpenStreetMap', record_id: 'w929009807@4' }], geometry: { type: 'Polygon', coordinates: sq(0, 0, 0.0002) } },
    { id: 's', building_id: 'B', height: 123, min_height: 69, roof_shape: 'pyramidal', roof_height: 54, sources: [{ dataset: 'OpenStreetMap', record_id: 'w929166111@2' }], geometry: { type: 'Polygon', coordinates: sq(0.00002, 0.00002, 0.00016) } },
    { id: 'c', building_id: 'B', height: 40, min_height: 30, roof_shape: 'flat', roof_height: null, sources: [{ dataset: 'OpenStreetMap', record_id: 'w7@1' }], geometry: { type: 'Polygon', coordinates: sq(0.01, 0.01, 0.0001) } },
    { id: 'f', building_id: 'B', height: 60, min_height: 50, roof_shape: null, roof_height: null, sources: [{ dataset: 'OpenStreetMap', record_id: 'w9@1' }], geometry: { type: 'Polygon', coordinates: sq(0.02, 0.02, 0.0001) } }];
  const P = partIndex(rows, S).get('B');
  assert.equal(P.find(p => p.id === 'c').roof, 'cone', 'the OSM roof:shape wins over Overture'); assert.equal(P.find(p => p.id === 's').rh, 54);
  assert.deepEqual(partCap(P.find(p => p.id === 's'), R), { kind: 'pointed', h: 54 });
  assert.deepEqual(partCap(P.find(p => p.id === 'c'), R), { kind: 'pointed', h: 8 }, 'cone without roof:height: min(0.25 x 40, 8)');
  assert.equal(partCap(P.find(p => p.id === 't'), R), null);
  const B = partBases(P, 10), byId = id => B.get(P.find(p => p.id === id));
  assert.equal(byId('s'), 69, 'the spire stands on its tower'); assert.equal(byId('t'), 0); assert.equal(byId('f'), 0, 'nothing holds it up: from the ground');
  const r = landmarkHeights({ id: 'B', c: [0, 0], a: 2000, h: 10, src: 'ms' }, P, new Map(), R);
  const sp = r.towers.find(t => t.osm === 'w929166111'); assert.equal(sp.base_h, 69); assert.deepEqual(sp.cap, { kind: 'pointed', h: 54 }); assert.equal(r.top_h, 123);
  // a Wikidata spire is a pyramid from the part's top
  const r2 = landmarkHeights({ id: 'B', c: [0, 0], a: 2000, h: 10, src: 'ms', wikidata: 'Q1' }, [P.find(p => p.id === 't')], new Map([['Q1', 100]]), R);
  const ws = r2.towers.find(t => t.kind === 'spire'); assert.equal(ws.base_h, 69); assert.deepEqual(ws.cap, { kind: 'pointed', h: 31 });
  // structures that are not buildings: the rule, heights from OSM or Wikidata, shapes at a node, castle sites
  const tsv = '?e\t?mm\t?hist\t?tour\t?name\t?h\t?wd\t?wp\t?wkt\n'
    + '<https://www.openstreetmap.org/way/922533965>\t\t\t"artwork"\t"Angel of the North"\t\t"Q1325290"\t\t"POLYGON((-1.5898 54.9141,-1.5896 54.9141,-1.5896 54.9142,-1.5898 54.9142,-1.5898 54.9141))"^^<http://www.opengis.net/ont/geosparql#wktLiteral>\n'
    + '<https://www.openstreetmap.org/node/1>\t"chimney"\t\t\t"Big Stack"\t"120"\t\t\t"POINT(-1 53)"\n'
    + '<https://www.openstreetmap.org/node/2>\t"obelisk"\t\t\t\t"30"\t"Q2"\t\t"POINT(-1 52)"\n'
    + '<https://www.openstreetmap.org/node/3>\t"mast"\t\t\t"Small"\t"20"\t\t\t"POINT(-1 51)"\n'
    + '<https://www.openstreetmap.org/way/4301292>\t\t"castle"\t\t"Edinburgh Castle"\t\t"Q212065"\t\t"POLYGON((-3.2 55.94,-3.19 55.94,-3.19 55.95,-3.2 55.94))"\n';
  const st = structureRows(tsv, new Map([['Q1325290', 20]]), { named_tall_m: 25, min_height_m: 10 });
  const by = Object.fromEntries(st.rows.map(x => [x.name || x.osm, x]));
  assert.equal(by['Angel of the North'].h, 20); assert.equal(by['Angel of the North'].src, 'wikidata'); assert.equal(by['Angel of the North'].shape, 'OSM outline');
  assert.equal(by['Big Stack'].h, 120); assert.equal(by['Big Stack'].why, 'named-tall'); assert.equal(by['Big Stack'].rings[0].length, 13, 'a 12-sided chimney');
  assert.deepEqual(by.n2.cap, { kind: 'pointed', h: 3 }, 'an obelisk ends in a point');
  assert.equal(by.Small, undefined, 'a named mast under 25 m without wikidata is not a landmark');
  assert.equal(by['Edinburgh Castle'].site, true); assert.equal(by['Edinburgh Castle'].rings, undefined, 'a site is not drawn');
});
