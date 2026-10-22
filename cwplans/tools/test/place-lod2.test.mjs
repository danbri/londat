// Tests of cwplans/tools/place-lod2.mjs (official LoD2 building models, CityGML 1.0 AdV profile, for the German places):
// the parse of a building with a part (attributes, ground footprint, measured height, roof type, polygons kept only in the
// core), the ALKIS function and roof type mappings, and the triangulation of planar 3D polygons (walls, sloped roofs,
// holes). Skill docklands-3d-page, "Three.js port: German places (2026-10-22)".
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLod2, kindOfFunction, ROOF_TYPE, triangulatePolygon, heightParts, unitsInBox } from '../place-lod2.mjs';

const pl = pts => `<gml:Polygon gml:id="p"><gml:exterior><gml:LinearRing><gml:posList srsDimension="3">${[...pts, pts[0]].flat().join(' ')}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon>`;
const surf = (k, pts) => `<bldg:boundedBy><bldg:${k} gml:id="s"><bldg:lod2MultiSurface><gml:MultiSurface><gml:surfaceMember>${pl(pts)}</gml:surfaceMember></gml:MultiSurface></bldg:lod2MultiSurface></bldg:${k}></bldg:boundedBy>`;
// a 10 x 6 m box from z 30 to 36 with a gabled roof to 39, at x0, y0 (metres of a projected CRS)
const box = (x0, y0) => { const g = [[x0, y0, 30], [x0 + 10, y0, 30], [x0 + 10, y0 + 6, 30], [x0, y0 + 6, 30]];
  return surf('GroundSurface', g) + surf('WallSurface', [[x0, y0, 30], [x0 + 10, y0, 30], [x0 + 10, y0, 36], [x0, y0, 36]])
    + surf('RoofSurface', [[x0, y0, 36], [x0 + 10, y0, 36], [x0 + 10, y0 + 3, 39], [x0, y0 + 3, 39]]) + surf('ClosureSurface', [[x0, y0, 30], [x0, y0 + 6, 30], [x0, y0 + 6, 36], [x0, y0, 36]]); };
const xml = `<core:CityModel><core:cityObjectMember><bldg:Building gml:id="B1"><bldg:function>31001_2020</bldg:function><bldg:roofType>3100</bldg:roofType><bldg:measuredHeight uom="m">9.0</bldg:measuredHeight>${box(0, 0)}
  <bldg:consistsOfBuildingPart><bldg:BuildingPart gml:id="B1P1"><bldg:roofType>1000</bldg:roofType><bldg:measuredHeight uom="m">25.5</bldg:measuredHeight>${box(100, 0)}</bldg:BuildingPart></bldg:consistsOfBuildingPart>
  </bldg:Building></core:cityObjectMember><core:cityObjectMember><bldg:Building gml:id="B2"><bldg:function>31001_1010</bldg:function><bldg:roofType>3200</bldg:roofType>${box(1000, 0)}</bldg:Building></core:cityObjectMember></core:CityModel>`;
// a stand-in projection: 1 m = 1e-5 degree from (13, 52)
const toLL = ([x, y]) => [13 + x * 1e-5, 52 + y * 1e-5];

test('parseLod2: a building, its part and a second building; attributes, footprint, heights, polygons only in the core', () => {
  const u = parseLod2(xml, toLL, { full: c => c[0] < 13.0005 });
  assert.deepEqual(u.map(x => [x.id, x.bid]), [['B1', 'B1'], ['B1P1', 'B1'], ['B2', 'B2']]);
  const [a, p, b] = u;
  assert.equal(a.kind, 'office'); assert.equal(a.roof, 'gabled'); assert.equal(a.h, 9); assert.equal(a.zg, 30); assert.equal(a.ztop, 39);
  assert.equal(p.kind, 'office', 'a part takes the building function'); assert.equal(p.roof, 'flat'); assert.equal(p.h, 25.5);
  assert.equal(b.h, 9, 'no measuredHeight: top minus ground'); assert.equal(b.kind, 'residential'); assert.equal(b.roof, 'hipped');
  assert.equal(a.ring.length, 4); assert.ok(Math.abs(a.c[0] - 13.00005) < 1e-9 && Math.abs(a.c[1] - 52.00003) < 1e-9, JSON.stringify(a.c));
  assert.ok(a.polys && !p.polys && !b.polys, 'polygons only where full(c)');
  assert.deepEqual(a.polys.map(q => q.t), ['W', 'R'], 'walls and roofs kept, ground and closure surfaces left out');
  assert.equal(a.polys[1].r[2][2], 39);
  assert.deepEqual(heightParts([p])[0], { id: 'B1P1', h: 25.5, ring: p.ring, roof: 'flat' });
  assert.deepEqual(unitsInBox(u, [13.0009, 51.9, 13.1, 52.1]).map(x => x.id), ['B1P1', 'B2']);
});

test('ALKIS function and roof type mappings', () => {
  assert.equal(kindOfFunction('31001_1010'), 'residential'); assert.equal(kindOfFunction('31001_2071'), 'hotel'); assert.equal(kindOfFunction('31001_3041'), 'church');
  assert.equal(kindOfFunction('31001_3023'), 'university'); assert.equal(kindOfFunction('51009_1610'), 'roof'); assert.equal(kindOfFunction(null), 'yes');
  assert.equal(ROOF_TYPE[1000], 'flat'); assert.equal(ROOF_TYPE[3100], 'gabled'); assert.equal(ROOF_TYPE[3700], 'dome');
});

test('triangulatePolygon: a wall, a sloped roof and a roof with a hole', () => {
  const wall = triangulatePolygon([[0, 0, 0], [10, 0, 0], [10, 0, 6], [0, 0, 6]]); assert.equal(wall.length, 6);
  const roof = triangulatePolygon([[0, 0, 6], [10, 0, 6], [10, 3, 9], [0, 3, 9]]); assert.equal(roof.length, 6);
  const holed = triangulatePolygon([[0, 0, 5], [10, 0, 5], [10, 10, 5], [0, 10, 5]], [[[4, 4, 5], [6, 4, 5], [6, 6, 5], [4, 6, 5]]]); assert.equal(holed.length, 24);
  assert.ok(holed.every(i => i >= 0 && i < 8));
});
