// Tests of cwplans/tools/place-lite.mjs (a place of kind "lite": the UK outside Greater London, landmarks plus merged mass):
// the polygon index (inside, holes, distance to the edges), the landmark tags (QLever TSV), the selection (owner by
// centroid with London excluded, the coast rule, heights in the place-heights order, the landmark rule and its reasons,
// atoms of 200 m), the town rule of the leaves, the merge of items into squares; and a lite tile (blockTile with the lite
// options: landmark outlines with their row, landmark boxes with their row, merged squares of two sizes); the building
// records (one a mass building, sorted by leaf cell) and the compact boxes (layout cwplans-boxes-1) decoded as the reader does.
// When a built set is at hand (env UK_LITE_DIR = the data/gb/uk-lite folder of a docklandia checkout): no landmark lies in
// Greater London's polygon of the UK skeleton (London draws those), and every shard row is in its part's box.
// Skill docklands-3d-page, "Three.js port: the UK lite set (2026-10-22)".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { polyIndex, tagIndex, liteSelector, townSize, mergeItems, inPolygon, REC, recAt, HSRC, compactBoxes, HDEC, recSquares, squareBoxes, recBoxes } from '../place-lite.mjs';
import { enuFrame } from '../../../docklands/geo/ellipsoid.js';
import { blockTile, cellBox } from '../place-blocks.mjs';
import { unpack } from '../../../docklands/geo/skeleton.js';

const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const src = (d, lic = 'ODbL-1.0', prop) => ({ ...(prop ? { property: prop } : {}), dataset: d, license: lic, ...(prop ? {} : { record_id: d === 'OpenStreetMap' ? 'w42@3' : undefined }) });
const rect = (lon, lat, w, h) => { const mLon = 111320 * Math.cos(lat * Math.PI / 180), mLat = 110574; return { type: 'Polygon', coordinates: [sq(lon - w / 2 / mLon, lat - h / 2 / mLat, lon + w / 2 / mLon, lat + h / 2 / mLat)] }; };

test('polyIndex: inside, a hole, outside; distance to the nearest edge', () => {
  const P = polyIndex([[sq(0, 50, 1, 51), sq(0.4, 50.4, 0.6, 50.6)]], 0.05);
  assert.equal(P.contains(0.2, 50.2), true); assert.equal(P.contains(0.5, 50.5), false, 'in the hole'); assert.equal(P.contains(1.2, 50.5), false);
  assert.equal(P.contains(0.999, 50.5), true); assert.equal(P.contains(1.001, 50.5), false);
  const d = P.dist(1.002, 50.5, 500); assert.ok(d > 100 && d < 160, String(d)); assert.equal(P.dist(1.1, 50.5, 500), null);
  // agrees with the plain even-odd rule on a grid of points
  const R = [sq(0, 50, 1, 51), sq(0.4, 50.4, 0.6, 50.6)];
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) { const x = -0.1 + i * 0.03, y = 49.9 + j * 0.03; assert.equal(P.contains(x, y), inPolygon([x, y], R), `${x} ${y}`); }
});

test('tagIndex: OSM ids and tags of the QLever answer', () => {
  const T = tagIndex('?w\t?b\t?wd\t?wp\t?hist\t?mm\t?leis\t?name\n<https://www.openstreetmap.org/way/7>\t"cathedral"\t"Q1"\t\t\t\t\t"Big Church"\n<https://www.openstreetmap.org/relation/9>\t"yes"\t\t"en:X"\t"castle"\t\t\t\n');
  assert.deepEqual(T.get('w7'), { b: 'cathedral', wd: 'Q1', name: 'Big Church' }); assert.equal(T.get('r9').hist, 'castle'); assert.equal(T.get('r9').wp, 'en:X');
});

const RULE = { encyclopaedic: true, building: ['cathedral', 'stadium'], historic: ['castle'], man_made: ['tower'], leisure: ['stadium'], named_tall_m: 25, named_big_m2: 3000, min_area_m2: 20 };
const selector = (owner, tags = new Map()) => liteSelector({ part: 0, owner, geometryClasses: { OpenStreetMap: 'osm', 'Microsoft ML Buildings': 'ms' }, licences: ['ODbL-1.0'], tags, rule: RULE, ghslAt: () => 6.5, level: 11, atom_m: 200, storey_m: 3, small_m: 3, default_m: 7, raster_min_m: 3, coast_m: 250 });

test('liteSelector: owner by centroid (London excluded), heights in order, the landmark rule, atoms', () => {
  const owner = (x, y) => x > 1 ? { part: -1, how: 'excluded', place: 'Greater London' } : x < -1 ? { part: 1, how: 'in' } : x > 0.9 ? { part: 0, how: 'coast' } : { part: 0, how: 'in' };
  const S = selector(owner, new Map([['w42', { wd: 'Q99', b: 'yes' }]]));
  const at = (lon, lat) => [lon, lat];
  S.add({ id: 'lon', sources: [src('OpenStreetMap')], c: at(1.5, 51.5), a: 100 });                                    // London's
  S.add({ id: 'oth', sources: [src('OpenStreetMap')], c: at(-2, 51.5), a: 100 });                                     // another part
  S.add({ id: 'wd', names_primary: 'Old Hall', class: 'house', sources: [src('OpenStreetMap')], c: at(0.1, 51.5), a: 400, geometry: rect(0.1, 51.5, 20, 20) });   // wikidata
  S.add({ id: 'ms', height: 12, sources: [src('Microsoft ML Buildings')], c: at(0.2, 51.5), a: 300 });                // mass, Microsoft height
  S.add({ id: 'lv', num_floors: 4, sources: [{ dataset: 'OpenStreetMap', license: 'ODbL-1.0', record_id: 'w1@1' }, src('OpenStreetMap', 'ODbL-1.0', '/properties/num_floors')], c: at(0.2001, 51.5001), a: 100 });   // OSM levels
  S.add({ id: 'gh', sources: [{ dataset: 'OpenStreetMap', license: 'ODbL-1.0', record_id: 'w2@1' }], c: at(0.95, 51.5), a: 50 });   // GHSL; coast rule
  S.add({ id: 'tl', names_primary: 'Tower Block', height: 40, class: 'apartments', sources: [{ dataset: 'OpenStreetMap', license: 'ODbL-1.0', record_id: 'w3@1' }, src('Microsoft ML Buildings', 'ODbL-1.0', '/properties/height')], c: at(0.3, 51.5), a: 500, geometry: rect(0.3, 51.5, 25, 20) });   // named-tall (Microsoft height is measured)
  S.add({ id: 'gn', names_primary: 'Shed', sources: [{ dataset: 'OpenStreetMap', license: 'ODbL-1.0', record_id: 'w4@1' }], c: at(0.31, 51.5), a: 200 });   // GHSL height is not measured: not a landmark
  S.add({ id: 'es', height: 30, sources: [src('Esri Community Maps', '')], c: at(0.4, 51.5), a: 100 });               // geometry not used
  S.add({ id: 'sm', sources: [{ dataset: 'OpenStreetMap', license: 'ODbL-1.0', record_id: 'w5@1' }], c: at(0.41, 51.5), a: 10 });   // too small
  const o = S.done();
  assert.deepEqual(o.landmarks.map(l => [l.id, l.why]), [['tl', 'named-tall'], ['wd', 'wikidata']]);
  assert.equal(o.landmarks.find(l => l.id === 'wd').wikidata, 'Q99'); assert.equal(o.landmarks.find(l => l.id === 'tl').src, 'ms');
  assert.equal(o.counts['in Greater London (drawn by that place)'], 1); assert.equal(o.counts['belongs to another part'], 1);
  assert.equal(o.counts['not drawn (geometry from Esri Community Maps)'], 1); assert.equal(o.counts['under 20 m2 (left out)'], 1);
  assert.equal(o.counts['outside every UK polygon, kept by the coast rule (within 250 m)'], 1);
  assert.deepEqual(o.height_sources, { ghsl: 3, ms: 2, 'osm-levels': 1 });
  assert.equal(o.counts['mass buildings'], 4);
  // 'ms' and 'lv' share one 200 m atom: area 400, height (300 x 12 + 100 x 12) / 400 = 12, two buildings, one Microsoft
  const A = o.atoms.find(a => a[8] === 2); assert.ok(A); assert.equal(A[4], 400); assert.equal(A[7], 12); assert.equal(A[9], 1); assert.equal(A[10], 300);
  assert.equal(o.geometry.ms.buildings, 1);
});

test('townSize and mergeItems: 200 m squares in a town, 400 m elsewhere; merged squares keep area and mean height', () => {
  const P = { town_m: 200, rural_m: 400, town_share: 0.08 };
  const atoms = [[0, 0, 0, 0, 9000, 0, 0, 10], [0, 0, 1, 1, 4000, 0, 0, 10], [0, 0, 4, 4, 500, 0, 0, 5]];
  const f = townSize(atoms, P); assert.equal(f(atoms[0]), 200); assert.equal(f(atoms[1]), 200); assert.equal(f(atoms[2]), 400);
  const b = cellBox(11, 1000, 1700), its = [{ a: 100, c: [b[0] + 0.0001, b[1] + 0.0001], H: { h: 10 } }, { a: 300, c: [b[0] + 0.0002, b[1] + 0.0002], H: { h: 20 } }, { a: 50, c: [b[0] + 0.02, b[1] + 0.02], H: { h: 4 } }];
  const m = mergeItems(its, b, 800); assert.equal(m.length, 2); assert.equal(m[0].a, 400); assert.equal(m[0].H.h, 17.5); assert.equal(m[0].n, 2);
});

test('blockTile with the lite options: landmark outline and box with their rows, merged squares of 200 and 400 m', () => {
  const n = { l: 11, x: 1000, y: 1700, key: '11-1000-1700', b: cellBox(11, 1000, 1700) }, [w, s] = n.b;
  const lm = { id: 'L', a: 400, c: [w + 0.01, s + 0.01], rings: rect(w + 0.01, s + 0.01, 20, 20).coordinates, H: { h: 30, src: 'osm-height' } };
  const items = [lm, { id: 'a1', a: 5000, c: [w + 0.0005, s + 0.0005], H: { h: 8, src: 'merged' }, m: 200, n: 40 }, { id: 'a2', a: 300, c: [w + 0.03, s + 0.03], H: { h: 5, src: 'merged' }, m: 400, n: 3 }];
  const named = new Map([['L', 7]]), base = { cell: n, HT: {}, groundAt: () => 10, geoidAt: () => 50, P: { tall_m: Infinity, big_m2: Infinity, merge_m: 400, min_area_m2: 0, drop_m: 3 }, lite: true, named, classes: ['landmark', 'merged'], colour: '#d6cbb6', credit: 't' };
  const r = blockTile({ ...base, items, leaf: false, namedOutlines: true, mergeOf: b => b.m });
  assert.equal(r.stats.named, 1); assert.equal(r.stats.merged, 2); assert.equal(r.stats.merged_buildings, 43);
  const js = JSON.parse(r.bytes.subarray(20, 20 + r.bytes.readUInt32LE(12)).toString('utf8')), X = js.extras.blocks;
  assert.deepEqual(X.named, [7]); assert.deepEqual(X.boxes.f, [-1, -1]); assert.equal(X.mass_buildings, 43);
  assert.ok(X.height_sources.some(h => /200 m square/.test(h)) && X.height_sources.some(h => /400 m square/.test(h)));
  // a coarse level: the landmark as its own box with its row
  const r2 = blockTile({ ...base, items: [{ ...lm, own: true }, items[1]], leaf: false });
  const X2 = JSON.parse(r2.bytes.subarray(20, 20 + r2.bytes.readUInt32LE(12)).toString('utf8')).extras.blocks;
  assert.deepEqual(X2.boxes.f, [7, -1]); assert.deepEqual(X2.boxes.c, [0, 1]);
});

test('building records: one 20-byte record a mass building (centroid, area, height, rotated rectangle, class, source), by leaf cell', () => {
  const S = selector(() => ({ part: 0, how: 'in' }));
  S.add({ id: 'b', height: 12, sources: [src('Microsoft ML Buildings')], c: [0.2, 51.5], a: 300, o: [30, 30, 10] });
  S.add({ id: 'a', sources: [{ dataset: 'OpenStreetMap', license: 'ODbL-1.0', record_id: 'w1@1' }], c: [0.1, 51.5], a: 100 });   // no rectangle: square, GHSL height
  const o = S.done(); assert.equal(o.recs.length, 2 * REC);
  const r = [recAt(o.recs, 0), recAt(o.recs, 1)].sort((x, y) => x.lon - y.lon);
  assert.equal(r[0].lon, 0.1); assert.equal(r[0].cls, 0); assert.equal(HSRC[r[0].src], 'ghsl'); assert.equal(r[0].asp, 1); assert.equal(r[0].h, 6.5);
  assert.equal(r[1].cls, 1); assert.equal(HSRC[r[1].src], 'ms'); assert.equal(r[1].h, 12); assert.ok(Math.abs(r[1].ang - 30) < 0.8, String(r[1].ang)); assert.ok(Math.abs(r[1].asp - 3) < 0.07, String(r[1].asp));
  assert.equal(o.counts['mass buildings without a rotated rectangle (drawn square)'], 1);
});

test('compactBoxes: 8 bytes a box in the tile frame; decoded as places.js does (position, area, height, angle, aspect, class, source, ground)', () => {
  const b = cellBox(11, 1000, 1700), lc = (b[0] + b[2]) / 2, bc = (b[1] + b[3]) / 2, F = enuFrame({ lon: lc, lat: bc, h: 60 });
  const boxes = [{ lon: lc + 0.01, lat: bc - 0.02, a: 120, asp: 2, ang: 45, h: 9.3, cls: 1, src: 2 }, { lon: lc - 0.03, lat: bc + 0.03, a: 5000, asp: 1, ang: 0, h: 120, cls: 0, src: 0 }];
  const groundAt = (lon, lat) => 10 + (lon - b[0]) * 1000, cp = compactBoxes({ F, b, boxes, groundAt, geoidAt: () => 50, drop_m: 8, grid_n: 17, kind: 'buildings' });
  assert.equal(cp.data.length, 16); assert.equal(cp.grid.length, 17 * 17 * 2); assert.equal(cp.meta.count, 2);
  const G = cp.meta.grid, g = i => cp.grid.readInt16LE(2 * i) * G.unit_m;
  for (let k = 0; k < 2; k++) { const d = cp.data, o = 8 * k, x = boxes[k], [E, N, U] = F.toEnu(x.lon, x.lat, groundAt(x.lon, x.lat) + 50);
    assert.ok(Math.abs(d.readInt16LE(o) * cp.meta.q - E) < 0.2 && Math.abs(d.readInt16LE(o + 2) * cp.meta.q - N) < 0.2, 'position');
    assert.ok(Math.abs(2 ** (d[o + 4] / 10) / x.a - 1) < 0.04, 'area'); assert.ok(Math.abs(HDEC(d[o + 5]) - x.h) <= (x.h > 50 ? 2.5 : 0.13), 'height');
    assert.ok(Math.abs(d[o + 6] * 180 / 256 - x.ang) < 0.4, 'angle'); assert.equal((d[o + 7] >> 4) & 1, x.cls); assert.equal(d[o + 7] >> 5, x.src); assert.ok(Math.abs(2 ** ((d[o + 7] & 15) / 3) / x.asp - 1) < 0.13, 'aspect');
    // the ground under the box from the grid (bilinear) against the frame's up of the ground point
    const fx = (E - G.e0) / G.de, fy = (N - G.n0) / G.dn, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, n = G.n, gz = (g(j * n + i) * (1 - u) + g(j * n + i + 1) * u) * (1 - v) + (g((j + 1) * n + i) * (1 - u) + g((j + 1) * n + i + 1) * u) * v;
    assert.ok(Math.abs(gz - U) < 1, `ground ${gz} ${U}`); }
  // a lite tile with the compact boxes appended: two buffer views named in extras.blocks.compact
  const n = { l: 11, x: 1000, y: 1700, key: '11-1000-1700', b }, r = blockTile({ cell: n, items: [], HT: {}, groundAt, geoidAt: () => 50, P: { tall_m: Infinity, big_m2: Infinity, merge_m: 150, min_area_m2: 0, drop_m: 8 }, lite: true, named: new Map(), namedOutlines: true, classes: ['l', 'm', 'o', 'ms'], colour: '#d6cbb6', credit: 't', compact: F2 => ({ ...compactBoxes({ F: F2, b, boxes, groundAt, geoidAt: () => 50, drop_m: 8, kind: 'buildings' }), mass_buildings: 0 }) });
  const js = JSON.parse(r.bytes.subarray(20, 20 + r.bytes.readUInt32LE(12)).toString('utf8')), C = js.extras.blocks.compact;
  assert.equal(C.count, 2); assert.equal(js.bufferViews[C.bufferView].byteLength, 16); assert.equal(js.bufferViews[C.grid.bufferView].byteLength, 17 * 17 * 2); assert.equal(r.stats.compact.boxes, 2);
});

test('recSquares and squareBoxes: the coarse levels merge the records by square; a full square has the full side', () => {
  const b = cellBox(11, 1000, 1700), B = Buffer.alloc(3 * REC), put = (i, lon, lat, a, h) => { B.writeInt32LE(Math.round(lon * 1e7), i * REC); B.writeInt32LE(Math.round(lat * 1e7), i * REC + 4); B.writeFloatLE(a, i * REC + 8); B.writeUInt16LE(h * 10, i * REC + 12); };
  put(0, b[0] + 0.0002, b[1] + 0.0002, 100, 10); put(1, b[0] + 0.0003, b[1] + 0.0003, 300, 20); put(2, b[0] + 0.02, b[1] + 0.02, 22500, 6);
  const it = recSquares([[B, 0, 3]], b, 150); assert.equal(it.length, 2); assert.equal(it[0].a, 400); assert.equal(it[0].H.h, 17.5); assert.equal(it[0].n, 2);
  const sq = squareBoxes(it, b, 150, 0.35); assert.ok(Math.abs(sq[1].a - 150 * 150) < 1e-6, 'full share: full side'); assert.ok(sq[0].a < 150 * 150 * 0.06 && sq[0].a > 0);
  assert.equal(recBoxes([[B, 1, 3]]).length, 2);
});

const DIR = process.env.UK_LITE_DIR;
test('a built set: no landmark in Greater London; shard rows in their part boxes', { skip: !DIR || !existsSync(join(DIR || '', 'features.json')) ? 'UK_LITE_DIR not set' : false }, () => {
  const fj = JSON.parse(readFileSync(join(DIR, 'features.json'), 'utf8')), sk = 'cwplans/docklands/data/uk/', M = JSON.parse(readFileSync(sk + 'manifest.json', 'utf8'));
  let lon = null; for (const fd of M.layers.find(l => l.id === 'regions').levels.find(l => l.level === 6).files) { const f = unpack(JSON.parse(readFileSync(sk + fd.path, 'utf8'))).features.find(x => x.properties.code === 'E12000007'); if (f) lon = f; }
  const L = polyIndex(lon.geometry.type === 'Polygon' ? [lon.geometry.coordinates] : lon.geometry.coordinates);
  let n = 0, inL = 0, outBox = 0;
  for (const sh of fj.shards) { const j = JSON.parse(readFileSync(join(DIR, sh.file), 'utf8')), F = j.buildings_fields, x = F.indexOf('lon'), y = F.indexOf('lat');
    assert.equal(j.offset, sh.offset); assert.equal(j.buildings.length, sh.count);
    for (const r of j.buildings) { n++; if (L.contains(r[x], r[y])) inL++; const b = sh.bbox, m = 0.01; if (r[x] < b[0] - m || r[x] > b[2] + m || r[y] < b[1] - m || r[y] > b[3] + m) outBox++; } }
  assert.ok(n > 1000, String(n)); assert.equal(inL, 0, 'landmarks inside Greater London'); assert.equal(outBox, 0, 'rows outside their part box');
});

test('streetBlocks and farKeep: a terrace merges into one block with its summed footprint, a tower stays alone, a lone house is left out far away (issue #13)', async () => {
  const { streetBlocks, farKeep } = await import('../place-lite.mjs');
  const mLon = 111320 * Math.cos(53 * Math.PI / 180), mLat = 110574, at = (x, y) => [-2 + x / mLon, 53 + y / mLat];
  // a terrace of six 6 x 10 m houses side by side (touching), a 40 m tower of 15 x 15 m 3 m from its end, a house 60 m away
  const B = [];
  for (let i = 0; i < 6; i++) { const [lon, lat] = at(i * 6, 0); B.push({ lon, lat, a: 60, asp: 10 / 6, ang: 90, h: 8, cls: 0, src: 6 }); }
  { const [lon, lat] = at(5 * 6 + 3 + 3 + 7.5, 0); B.push({ lon, lat, a: 225, asp: 1, ang: 0, h: 40, cls: 0, src: 0 }); }
  { const [lon, lat] = at(0, 60); B.push({ lon, lat, a: 64, asp: 1, ang: 0, h: 7, cls: 1, src: 2 }); }
  const S = streetBlocks(B, { gap_m: 5, fill_min: 0.4, h_rel: 0.35, h_abs_m: 3 });
  assert.equal(S.length, 3, JSON.stringify(S.map(x => [x.n, Math.round(x.a), x.h])));
  const row = S.find(x => x.n === 6); assert.ok(row && Math.abs(row.a - 360) < 1, 'the terrace keeps its summed footprint'); assert.equal(row.h, 8);
  assert.ok(Math.abs(row.ang - 0) < 1 || Math.abs(row.ang - 180) < 1, `the terrace runs east-west (${row.ang})`); assert.ok(row.asp > 3, 'a long row (36 x 10 m)');
  assert.equal(S.filter(x => x.n === 1).length, 2, 'the tower (other height) and the far house stay alone');
  assert.equal(streetBlocks(B, { gap_m: null }).length, 8, 'gap_m null: no merge');
  const K = farKeep(S, 178);   // (level 10 of the UK lite set)
  assert.equal(K.keep.length, 2); assert.equal(K.left_out, 1); assert.equal(K.left_out_buildings, 1);
  assert.equal(farKeep([{ a: 25, h: 40, n: 1 }], 178).keep.length, 1, 'a tall thin tower stays (seen size 5 x 40 m)');
});

test('blockTile, lite landmark parts with caps (issue #14): a spire on its tower ends in one apex at its height; a dome part ends in a point too', () => {
  const n = { l: 11, x: 1000, y: 1700, key: '11-1000-1700', b: cellBox(11, 1000, 1700) }, [w, s] = n.b, c = [w + 0.01, s + 0.01];
  const tower = { id: 'L:t0', a: 144, c, rings: rect(c[0], c[1], 12, 12).coordinates, H: { h: 69, src: 'osm building part' } };
  const spire = { id: 'L:t1', a: 64, c, rings: rect(c[0], c[1], 8, 8).coordinates, H: { h: 123, src: 'osm building part' }, cap: { kind: 'pointed', h: 54, base: 69 } };
  const dome = { id: 'L:t2', a: 100, c: [c[0] + 0.001, c[1]], rings: rect(c[0] + 0.001, c[1], 10, 10).coordinates, H: { h: 40, src: 'osm building part' }, cap: { kind: 'dome', h: 5, base: 0 } };
  const named = new Map([['L:t0', 7], ['L:t1', 7], ['L:t2', 7]]);
  const r = blockTile({ cell: n, items: [tower, spire, dome], HT: {}, groundAt: () => 10, geoidAt: () => 50, P: { tall_m: Infinity, big_m2: Infinity, merge_m: 400, min_area_m2: 0, drop_m: 3 }, lite: true, named, namedOutlines: true, named_simplify_m: 0.5, leaf: false, classes: ['landmark', 'merged'], colour: '#d6cbb6', credit: 't' });
  assert.equal(r.stats.named, 3); assert.equal(r.stats.caps, 2);
  // the glb: int16 positions (KHR_mesh_quantization) of the named mesh; the highest vertex is the spire's apex at ground + 123 m
  const jl = r.bytes.readUInt32LE(12), js = JSON.parse(r.bytes.subarray(20, 20 + jl).toString('utf8')), bin = 20 + jl + 8, nd = js.nodes.find(q => q.mesh != null && q.scale);
  const a = js.accessors[js.meshes[nd.mesh].primitives.at(-1).attributes.POSITION], bv = js.bufferViews[a.bufferView], ys = [];
  for (let i = 0; i < a.count; i++) ys.push(r.bytes.readInt16LE(bin + bv.byteOffset + i * 8 + 2) * nd.scale[1] + nd.translation[1]);
  const top = Math.max(...ys), atTop = ys.filter(y => Math.abs(y - top) < 0.05).length, h0 = ys.reduce((m, y) => Math.min(m, y), Infinity);
  assert.ok(atTop === 1, `one apex at the top (${atTop} vertices)`);
  assert.ok(ys.some(y => Math.abs(y - (top - 54)) < 0.1), 'the spire\'s eaves 54 m under its apex (its base, on the tower)');
});
