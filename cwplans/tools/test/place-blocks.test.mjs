// Tests of cwplans/tools/place-blocks.mjs (a place of kind "blocks": Greater London): the selection of Overture records
// (OSM geometry inside the boundary, outside the model box; non-OSM heights by dataset), the tree (only cells with
// buildings, every leaf at the leaf level, coarse cells hold their descendants' buildings), the tile (boxes, outlines,
// named buildings with their id, merged squares at a coarse level) and the glTF it writes, the world-base ground sampler.
// Skill docklands-3d-page, "Three.js port: Greater London as blocks (2026-10-22)".
import test from 'node:test';
import assert from 'node:assert/strict';
import { blockSelector, blockTree, blockTile, worldBaseGround, cellBox, ringAreaM2 } from '../place-blocks.mjs';

const src = (d, lic = 'ODbL-1.0', prop = '') => ({ property: prop, dataset: d, license: lic, record_id: d === 'OpenStreetMap' ? 'w42@3' : null });
// a w x h metre rectangle at (lon, lat), turned by deg
const rect = (lon, lat, w, h, deg = 0) => { const mLon = 111320 * Math.cos(lat * Math.PI / 180), mLat = 110574, c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [lon + (x * c - y * s) / mLon, lat + (x * s + y * c) / mLat]); return { type: 'Polygon', coordinates: [[...pts, pts[0]]] }; };

test('blockSelector: OSM geometry in the boundary and out of the model box; other records give heights by dataset', () => {
  const S = blockSelector({ inBoundary: lon => lon < 1, excluded: lon => lon > 0.5 && lon < 0.6, geometrySources: ['OpenStreetMap'], licences: ['ODbL-1.0'], heightLabels: { 'Microsoft ML Buildings': 'ms' } });
  S.add({ id: 'a', class: 'house', names_primary: 'Ivy House', height: null, num_floors: 2, sources: [src('OpenStreetMap'), src('OpenStreetMap', 'ODbL-1.0', '/properties/num_floors')], geometry: rect(0.1, 51.5, 10, 8) });
  S.add({ id: 'b', height: 12, sources: [src('Microsoft ML Buildings')], geometry: rect(0.2, 51.5, 10, 8) });
  S.add({ id: 'c', height: 9.5, sources: [src('OpenStreetMap'), src('Microsoft ML Buildings', 'ODbL-1.0', '/properties/height')], geometry: rect(0.3, 51.5, 10, 8) });
  S.add({ id: 'd', sources: [src('OpenStreetMap')], geometry: rect(0.55, 51.5, 10, 8) });   // the model draws it
  S.add({ id: 'e', sources: [src('OpenStreetMap')], geometry: rect(2, 51.5, 10, 8) });      // outside the boundary
  S.add({ id: 'f', height: 30, sources: [src('Esri Community Maps', '')], geometry: rect(0.4, 51.5, 10, 8) });   // no licence: skipped
  const o = S.done();
  assert.deepEqual(o.buildings.map(b => b.id), ['a', 'c']);
  const a = o.buildings[0]; assert.equal(a.levels, 2); assert.equal(a.name, 'Ivy House'); assert.equal(a.osm, 'w42'); assert.ok(Math.abs(a.a - 80) < 1, String(a.a));
  assert.equal(o.buildings[1].height, undefined, 'a Microsoft height on an OSM outline is not an OSM height');
  assert.deepEqual(o.fp.ms.map(r => [r.id, r.height]), [['b', 12], ['c', 9.5]]);
  assert.equal(o.counts['OSM buildings in the model box (drawn by the model)'], 1); assert.equal(o.counts['OSM buildings outside the boundary'], 1);
  assert.equal(o.counts['height from Esri Community Maps (licence "") skipped'], 1);
});

test('blockTree: cells with buildings only, leaves at the leaf level, coarse cells hold every building below', () => {
  const B = [[0.01, 51.51], [0.012, 51.511], [0.3, 51.6]].map(([lon, lat], i) => ({ id: 'b' + i, c: [lon, lat] }));
  const T = blockTree({ buildings: B, top: 10, leaf: 14 });
  let leaves = 0; for (const n of T.nodes.values()) { if (!n.kids.length) { leaves++; assert.equal(n.l, 14); } else assert.ok(n.kids.length >= 1 && n.kids.length <= 4); }
  assert.ok(leaves >= 2 && leaves <= 3, String(leaves));
  for (const r of T.roots) assert.equal(r.l, 10);
  assert.equal(T.roots.reduce((k, r) => k + r.items.length, 0), 3);
});

test('blockTile: leaf boxes, outlines and named buildings; a coarse level merges small buildings by square', () => {
  const lat = 51.5, l = 14, cs = 180 / 2 ** l, x = Math.floor((0.01 + 180) / cs), y = Math.floor((lat + 90) / cs), b = cellBox(l, x, y), c0 = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const mk = (id, dx, w, h, ht, name, deg = 0) => { const g = rect(c0[0] + dx / 70000, c0[1], w, h, deg), ring = g.coordinates[0]; return { b: { id, name, rings: [ring], c: [c0[0] + dx / 70000, c0[1]], a: ringAreaM2(ring.slice(0, -1)) }, H: { h: ht, src: 'osm-levels' } }; };
  const L = [mk('box', -200, 8, 10, 7, null, 30), mk('big', 0, 40, 30, 20, 'Town Hall'), mk('l', 150, 30, 30, 9, null)];
  // an L-shaped outline (fills 75 % of its box): not a box
  const Lr = L[2].b.rings[0], m = 111320 * Math.cos(lat * Math.PI / 180); L[2].b.rings = [[Lr[0], Lr[1], [Lr[1][0], Lr[1][1] + 15 / 110574], [Lr[0][0] + 15 / m, Lr[1][1] + 15 / 110574], [Lr[0][0] + 15 / m, Lr[3][1]], Lr[3], Lr[0]]]; L[2].b.a = 675;
  const HT = Object.fromEntries(L.map(o => [o.b.id, o.H])), items = L.map(o => o.b), named = new Map([['big', 0]]);
  const ground = () => 10, geoid = () => 45;
  const P = { min_area_m2: 25, simplify_m: 2.5, box_fill: 0.85, outline_min_m2: 300, drop_m: 3 };
  const r = blockTile({ cell: { l, x, y, key: `${l}-${x}-${y}`, b }, items, HT, groundAt: ground, geoidAt: geoid, P, leaf: true, named, classes: ['osm', 'merged'], colour: '#d6cbb6', credit: 'test' });
  assert.equal(r.stats.boxes, 1); assert.equal(r.stats.named, 1); assert.equal(r.stats.outlines, 1);
  const bin = r.bytes, jl = bin.readUInt32LE(12), J = JSON.parse(bin.subarray(20, 20 + jl).toString('utf8'));
  assert.equal(bin.readUInt32LE(0), 0x46546c67); assert.ok(J.extensionsUsed.includes('EXT_mesh_gpu_instancing') && J.extensionsUsed.includes('EXT_mesh_features') && J.extensionsUsed.includes('KHR_mesh_quantization'));
  const prims = J.meshes.flatMap(m2 => m2.primitives), named0 = prims.find(p => p.attributes._FEATURE_ID_0 != null);
  assert.ok(named0 && named0.attributes.COLOR_0 != null, 'the named building has colours and its feature id');
  assert.equal(J.extras.blocks.boxes.h[0], 70); assert.equal(J.extras.blocks.outlines.tri_end.length, 1);
  assert.ok(r.region[4] <= 10 + 45 - 3 + 0.5 && r.region[5] >= 10 + 45 + 20 - 1, JSON.stringify(r.region));
  const inst = J.nodes.find(n => n.extensions)?.extensions.EXT_mesh_gpu_instancing.attributes; assert.equal(J.accessors[inst.ROTATION].componentType, 5120);
  // the same buildings at a coarse level: the big one stays a box (>= big_m2), the small ones merge into one square
  const r2 = blockTile({ cell: { l, x, y, key: 'c', b }, items: [...items, mk('s2', -195, 8, 8, 5, null).b], HT: { ...HT, s2: { h: 5, src: 'ghsl' } }, groundAt: ground, geoidAt: geoid, P: { tall_m: 25, big_m2: 600, merge_m: 100, drop_m: 3, min_area_m2: 25 }, leaf: false, named: null, classes: ['osm', 'merged'], colour: '#d6cbb6', credit: 'test' });
  assert.equal(r2.stats.merged, 1, JSON.stringify(r2.stats)); assert.equal(r2.stats.merged_buildings, 2); assert.equal(r2.stats.boxes, 2);
});

test('worldBaseGround: the deepest level with a tile, bilinear, sample (i, j) at w + (i - 1) d', () => {
  const L = 12, s = 180 / 2 ** L, x = Math.floor((0.01 + 180) / s), y = Math.floor((90 - 51.5) / s);
  const M = { dem: { grid: 35, tiles: { 11: [x >> 1, y >> 1], 12: [x, y] } } };
  const h12 = new Int16Array(35 * 35).map((_, k) => k % 35), h11 = new Int16Array(35 * 35).fill(500);
  const G = worldBaseGround(M, (l) => l === 12 ? h12 : h11);
  const w = -180 + x * s, d = s / 32;
  assert.equal(Math.round(G.at(w + 3 * d, 90 - y * s - d) * 1000) / 1000, 4);   // i = 4 at w + 3 d
  const xo = (x ^ 1), lon2 = -180 + xo * s + s / 2;   // the level-12 sibling has no tile: level 11 answers
  assert.equal(G.at(lon2, 51.5 - 0.001), 500);
});
