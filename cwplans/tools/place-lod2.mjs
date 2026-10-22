// Official LoD2 building models (CityGML 1.0, the AdV profile used by the German states) for the places of
// cwplans/tools/build-place-tiles.mjs: parse a tile of the model, keep per building part its measured height, roof type,
// function, ground footprint and (inside the core) every wall and roof polygon; triangulate the polygons for the core
// tiles. Pure functions (no network, no clock); the tool fetches, records hashes and runs the dataflow operations.
//
//   parseLod2(xml, toLonLat, { full })      -> units: [{ id, bid, fn, kind, roof, roof_code, h, zg, ztop, c, ring, polys? }]
//   unitsInBox(units, box)                   -> units whose centroid is in the box
//   heightParts(units)                       -> [{ id, h, ring, roof }] (the national-heights input of place-heights)
//   triangulatePolygon(ring3, holes3)        -> triangles (indices into the concatenated rings) of a planar 3D polygon
//
// Skill docklands-3d-page, "Three.js port: German places (2026-10-22)". The licence of each state's model is in the
// region config's adapter (Berlin: Datenlizenz Deutschland Zero 2.0) and in cwplans/data-register.json.
import earcut from 'earcut';

// ALKIS building function (bldg:function, "31001_<code>" for buildings, "51009_<code>" for other structures) -> an
// OSM-like kind (the place look reads kinds: house / flats / office / civic / shed); stated mapping, not data
export function kindOfFunction(fn) {
  if (!fn) return 'yes';
  const [grp, code] = fn.split('_'), c = +code;
  if (grp === '51009') return c === 1610 ? 'roof' : 'yes';
  if (grp !== '31001') return 'yes';
  if (c >= 1000 && c < 2000) return 'residential';
  if (c === 2020 || (c >= 2020 && c < 2030)) return 'office';
  if (c >= 2050 && c < 2060) return 'retail';
  if (c >= 2070 && c < 2080) return 'hotel';
  if (c >= 2100 && c < 2200) return 'industrial';
  if (c >= 2460 && c < 2470) return 'garages';
  if (c >= 2000 && c < 3000) return 'commercial';
  if (c === 3023) return 'university';
  if (c >= 3020 && c < 3030) return 'school';
  if (c === 3031) return 'castle';
  if (c === 3032) return 'theatre';
  if (c === 3034) return 'museum';
  if (c >= 3040 && c < 3050) return c === 3041 ? 'church' : 'religious';
  if (c >= 3070 && c < 3080) return 'hospital';
  if (c >= 3000 && c < 4000) return 'civic';
  return 'yes';
}
// ALKIS roof type (bldg:roofType) -> the roof classes of the tool (README and card); 5000 mixed, 9999 other
export const ROOF_TYPE = { 1000: 'flat', 2100: 'skillion', 2200: 'skillion', 3100: 'gabled', 3200: 'hipped', 3300: 'half-hipped', 3400: 'mansard', 3500: 'pyramidal', 3600: 'cone', 3700: 'dome', 3800: 'sawtooth', 3900: 'round', 4000: 'tower', 5000: 'mixed', 9999: 'other' };

const num = (s, re) => { const m = s.match(re); return m ? +m[1] : null; };
const posLists = s => [...s.matchAll(/<gml:posList[^>]*>([^<]+)</g)].map(m => m[1]);
// one polygon: exterior and interior rings as [x, y, z] triples of the source CRS (closing point dropped)
function polygons(s) {
  const out = [];
  for (const pm of s.matchAll(/<gml:Polygon\b[\s\S]*?<\/gml:Polygon>/g)) {
    const p = pm[0], ex = p.match(/<gml:exterior>([\s\S]*?)<\/gml:exterior>/); if (!ex) continue;
    const ring = t => { const n = t.trim().split(/\s+/).map(Number), r = []; for (let i = 0; i + 2 < n.length; i += 3) r.push([n[i], n[i + 1], n[i + 2]]);
      if (r.length > 1 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] && r[0][2] === r.at(-1)[2]) r.pop(); return r; };
    const e = posLists(ex[1]); if (!e.length) continue;
    const holes = [...p.matchAll(/<gml:interior>([\s\S]*?)<\/gml:interior>/g)].flatMap(m => posLists(m[1]).map(ring));
    out.push({ ext: ring(e[0]), holes });
  }
  return out;
}
const SURF = { WallSurface: 'W', RoofSurface: 'R', GroundSurface: 'G', ClosureSurface: 'C' };
// a unit (a building without parts, or one part): its attributes and surfaces
function unit(text, bld, toLonLat, full) {
  const id = (text.match(/gml:id="([^"]+)"/) || [])[1];
  const fn = (text.match(/<bldg:function>([^<]+)</) || [])[1] || bld.fn;
  const roofCode = num(text, /<bldg:roofType>(\d+)</);
  const mh = num(text, /<bldg:measuredHeight[^>]*>([-\d.]+)</);
  const surfaces = [];
  for (const m of text.matchAll(/<bldg:(WallSurface|RoofSurface|GroundSurface|ClosureSurface)\b[\s\S]*?<\/bldg:\1>/g)) for (const pg of polygons(m[0])) surfaces.push({ t: SURF[m[1]], ...pg });
  if (!surfaces.length) return null;
  let zg = Infinity, ztop = -Infinity; for (const s of surfaces) for (const q of s.ext) { zg = Math.min(zg, q[2]); ztop = Math.max(ztop, q[2]); }
  // the footprint: the largest ground polygon (else the hull of the wall bottoms is not tried: such units are rare)
  const ground = surfaces.filter(s => s.t === 'G').sort((a, b) => areaXY(b.ext) - areaXY(a.ext))[0];
  if (!ground) return null;
  const ll = q => { const [lon, lat] = toLonLat([q[0], q[1]]); return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7]; };
  const ring = ground.ext.map(ll); let cx = 0, cy = 0; for (const [x, y] of ring) { cx += x; cy += y; }
  const u = { id, bid: bld.id, fn: fn || null, kind: kindOfFunction(fn), roof: ROOF_TYPE[roofCode] || null, roof_code: roofCode, h: Math.round((mh ?? ztop - zg) * 100) / 100, zg: Math.round(zg * 100) / 100, ztop: Math.round(ztop * 100) / 100,
    c: [Math.round(cx / ring.length * 1e7) / 1e7, Math.round(cy / ring.length * 1e7) / 1e7], ring };
  if (full) u.polys = surfaces.filter(s => s.t === 'W' || s.t === 'R').map(s => ({ t: s.t, r: s.ext.map(q => [...ll(q), Math.round(q[2] * 100) / 100]), h: s.holes.map(h => h.map(q => [...ll(q), Math.round(q[2] * 100) / 100])) }));
  return u;
}
const areaXY = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); };
// a whole CityGML file -> units; full(c): keep the polygons of a unit whose ground centroid is c (the core)
export function parseLod2(xml, toLonLat, { full = () => false } = {}) {
  const units = [];
  for (const m of xml.split(/<core:cityObjectMember>/).slice(1)) {
    const b = m; if (!/<bldg:Building\b/.test(b)) continue;
    const bid = (b.match(/<bldg:Building gml:id="([^"]+)"/) || [])[1], fn = (b.match(/<bldg:function>([^<]+)</) || [])[1];
    const parts = [...b.matchAll(/<bldg:BuildingPart\b[\s\S]*?<\/bldg:BuildingPart>/g)].map(x => x[0]);
    const rest = parts.length ? parts.reduce((s, p) => s.replace(p, ''), b) : b;
    const bld = { id: bid, fn };
    // the units: the building's own geometry (when it has any) and each part
    for (const t of [rest, ...parts]) {
      // first pass without polygons to test the centroid, then with them for the core
      const u0 = unit(t, bld, toLonLat, false); if (!u0) continue;
      units.push(full(u0.c) ? unit(t, bld, toLonLat, true) : u0);
    }
  }
  return units;
}
export const unitsInBox = (units, b) => units.filter(u => u.c[0] >= b[0] && u.c[0] < b[2] && u.c[1] >= b[1] && u.c[1] < b[3]);
export const heightParts = units => units.map(u => ({ id: u.id, h: u.h, ring: u.ring, roof: u.roof }));

// triangles of a planar polygon in 3D (points [x, y, z] in metres of a local frame): project to the plane of its largest
// normal component, earcut with holes; indices into [...ring, ...holes.flat()]
export function triangulatePolygon(ring, holes = []) {
  const all = [ring, ...holes]; let nx = 0, ny = 0, nz = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[j], b = ring[i]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz), [u, v] = az >= ax && az >= ay ? [0, 1] : ax >= ay ? [1, 2] : [2, 0];
  const flat = [], hi = []; for (const r of all) { if (r !== ring) hi.push(flat.length / 2); for (const q of r) flat.push(q[u], q[v]); }
  return earcut(flat, hi.length ? hi : null);
}
