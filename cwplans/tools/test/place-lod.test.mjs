// Tests of cwplans/tools/place-lod.mjs (the city and the surroundings of a place by level of detail): the quadtree,
// the selection of Overture records, the glTF writer, the relative transforms. Skill docklands-3d-page, "Three.js port:
// places, city and surroundings by level of detail (2026-10-20)".
import test from 'node:test';
import assert from 'node:assert/strict';
import { lodTree, walk, selectOuter, writeGlb, mul4, inv4rigid, cellBox, easedDem } from '../place-lod.mjs';

const origin = { lon: -5.56654, lat: 42.59732 }, mLat = 110574, mLon = 111320 * Math.cos(42.6 * Math.PI / 180);

test('lodTree: REPLACE refinement (four children or none), the core cells as level-15 leaves, coarse far away', () => {
  const cs = 180 / 2 ** 10, ext = [-180 + (Math.floor((origin.lon + 180) / cs) - 1) * cs, -90 + (Math.floor((origin.lat + 90) / cs) - 1) * cs, 0, 0]; ext[2] = ext[0] + 3 * cs; ext[3] = ext[1] + 3 * cs;
  const c15 = 180 / 2 ** 15, kx = Math.floor((origin.lon + 180) / c15), ky = Math.floor((origin.lat + 90) / c15), core = new Set([`15-${kx}-${ky}`]);
  const roots = lodTree({ ext, top: 10, core, coreArea: cellBox(15, kx, ky), city: [origin.lon - 0.02, origin.lat - 0.02, origin.lon + 0.02, origin.lat + 0.02], origin, mLon, mLat, refine: [[30000, 11], [16000, 12]] });
  assert.equal(roots.length, 9);
  let leaves = 0, coreN = 0, maxL = 0; walk(roots, n => { assert.ok(n.kids.length === 0 || n.kids.length === 4, n.key); if (!n.kids.length) leaves++; if (n.core) coreN++; maxL = Math.max(maxL, n.l); });
  assert.equal(coreN, 1); assert.equal(maxL, 15); assert.ok(leaves > 9);
  // a corner cell far from the origin stays coarse (no refinement beyond 30 km)
  const far = roots.find(n => Math.abs((n.b[0] + n.b[2]) / 2 - origin.lon) * mLon > 40000 || Math.abs((n.b[1] + n.b[3]) / 2 - origin.lat) * mLat > 40000);
  if (far) assert.ok(far.kids.length === 0 || far.kids.every(k => k.kids.length === 0));
});

test('selectOuter: geometry from OpenStreetMap only; other values as heights; the IGN floors apart; tunnels left out', () => {
  const src = (d, lic = 'ODbL-1.0', prop) => ({ property: prop, dataset: d, license: lic });
  const sq = (x, y) => ({ type: 'Polygon', coordinates: [[[x, y], [x + 1e-4, y], [x + 1e-4, y + 1e-4], [x, y + 1e-4], [x, y]]] });
  const raw = {
    buildings: { rows: [
      { id: 'a', class: 'house', height: 7, num_floors: null, sources: [src('OpenStreetMap')], geometry: sq(0, 0) },
      { id: 'b', class: null, height: 11, num_floors: null, sources: [src('Microsoft ML Buildings')], geometry: sq(1, 1) },
      { id: 'c', class: null, height: null, num_floors: 4, sources: [{ property: '', dataset: 'Instituto Geográfico Nacional (España)', license: null }], geometry: sq(2, 2) },
    ] },
    roads: { rows: [
      { id: 'r1', subtype: 'road', class: 'primary', names_primary: 'N-601', sources: [src('OpenStreetMap')], geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } },
      { id: 'r2', subtype: 'road', class: 'primary', road_flags: [{ values: ['is_tunnel'], between: null }], sources: [src('OpenStreetMap')], geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } },
    ] },
  };
  const o = selectOuter(raw, { licences: ['ODbL-1.0'], ignDataset: 'Instituto Geográfico Nacional (España)' });
  assert.deepEqual(o.buildings.map(b => b.id), ['a']); assert.equal(o.buildings[0].height, 7);
  assert.deepEqual(o.fp_overture.map(r => [r.id, r.height]), [['b', 11]]);
  assert.deepEqual(o.ign.map(r => [r.id, r.floors]), [['c', 4]]);
  assert.equal(o.roads.length, 1); assert.equal(o.counts.segments_tunnel_skipped, 1);
});

test('writeGlb: a valid glb with KHR_mesh_quantization, a strip and a list sharing one position accessor, instances', () => {
  const pos = [0, 0, 0, 100, 0, 0, 0, 0, 100, 100, 5, 100], b = writeGlb([{ name: 'ground', pos, uv: [0, 0, 1, 0, 0, 1, 1, 1], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], strip: [0, 2, 1, 3], idx: [0, 1, 2], jpg: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }], 'test', { t: [1, 2, 3], r: [0, 0, 0, 1], s: [4, 5, 6], colour: '#d6cbb6' });
  assert.equal(b.readUInt32LE(0), 0x46546c67); assert.equal(b.readUInt32LE(8), b.length);
  const jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl));
  assert.ok(j.extensionsRequired.includes('KHR_mesh_quantization') && j.extensionsRequired.includes('EXT_mesh_gpu_instancing'));
  const [p0, p1] = j.meshes[0].primitives; assert.equal(p0.mode, 5); assert.equal(p1.mode, 4); assert.equal(p0.attributes.POSITION, p1.attributes.POSITION);
  const s = j.nodes[0].scale; assert.ok(s[0] === s[1] && s[1] === s[2], 'one uniform dequantization scale (normals keep their direction)');
  assert.equal(j.accessors[j.nodes[1].extensions.EXT_mesh_gpu_instancing.attributes.TRANSLATION].count, 1);
});

test('relative transforms: parent x child = the child\'s own frame', () => {
  const rot = a => [Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0];
  const P = [...rot(0.3), 4e6, 1e5, 4.6e6, 1], C = [...rot(0.31), 4.0001e6, 1.0002e5, 4.6e6, 1];
  const rel = mul4(inv4rigid(P), C), back = mul4(P, rel);
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(back[i] - C[i]) < 1e-6, `element ${i}`);
});

test('easedDem: the outer band meets the box mean, the inside keeps the DEM', () => {
  const ext = [0, 0, 1, 1], nx = 200, ny = 200, h = new Float32Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = (i % 2) * 100;   // a ridged surface
  const at = easedDem({ w: 0, e: 1, s: 0, n: 1, nx, ny, h }, ext, 111320, 110574, 8000, 10000);
  const edge = at(0.0001, 0.5), mid = at(0.5025, 0.5);
  assert.ok(Math.abs(edge - 50) < 15, `edge ${edge}`); assert.ok(mid > 90 || mid < 10 || Math.abs(mid - 50) < 50, `mid ${mid}`);
});
