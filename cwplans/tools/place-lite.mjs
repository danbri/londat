// A place of kind "lite" (the UK outside Greater London; region config docklands/geo/regions/uk-lite.js; owner, 2026-10-22:
// "can we pick a lite subset or slice somehow? Key landmarks, modest resolution?"): two classes of content,
//   landmarks  buildings named by a stated rule, each with its outline, id and card;
//   mass       every other building only as its share of a square (200 m in towns, 400 m elsewhere at the leaves).
// Imported by cwplans/tools/build-place-tiles.mjs (operations place-lite-select per part, place-lite-tiles). Pure functions
// over their inputs (no clock, no network):
//   polyIndex(polys)       point-in-polygon and distance to the edges for big polygons (a grid of edge lists)
//   tagIndex(tsv)          the OSM tags of the landmark query (QLever TSV) by OSM id ("w123", "r456")
//   liteSelector(opt)      Overture rows (slim NDJSON) of one part -> atoms (200 m squares of the leaf cells: summed
//                          footprint, area-weighted centroid and height, counts by geometry class) and landmarks
//   mergeItems(...)        items -> one item per square of a cell (the coarse levels' input)
//   townSize(...)          the leaf rule of place-lite-tiles 2: 200 m squares where a 400 m square is a town, else 400 m
//   (since 2026-10-22, place-lite-select 2 and place-lite-tiles 3; owner: "UK data looks like literal tiles")
//   recs / REC / HSRC      every mass building as one fixed 20-byte record (centroid, area, height, orientation, aspect,
//                          footprint class, height source), sorted by leaf cell: the leaves draw one box a building
//   compactBoxes(...)      boxes (buildings or merged squares) of one tile in the compact layout cwplans-boxes-1 (8 bytes
//                          a box in the tile frame) with a ground grid; read by docklands/globe/places.js
//   squaresOf(...)         records or items -> one item per square of merge_m in a cell (the coarse levels' input)
// Tiles are written by place-blocks.mjs blockTile (landmarks as outlines with their feature id, landmark boxes) with the
// compact boxes appended (opt.compact).
// Skill: docklands-3d-page, "Three.js port: the UK lite set (2026-10-22)".
import { D2R } from '../../docklands/geo/ellipsoid.js';
import { cellBox, inRing } from './place-blocks.mjs';

const r7 = v => Math.round(v * 1e7) / 1e7, r6 = v => Math.round(v * 1e6) / 1e6;
const polysOf = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];

// ---------- polygons: an index of edges by grid cell; a cell without an edge is wholly in or out (its centre tested
// once); a point in a cell with edges counts the crossings of the segment from the cell centre to the point
export function polyIndex(polys, cell = 0.02) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity; const edges = [];
  for (const P of polys) for (const r of P) { for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[j], b = r[i]; if (a[0] === b[0] && a[1] === b[1]) continue; edges.push([a[0], a[1], b[0], b[1]]); }
    for (const [x, y] of r) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); } }
  w -= cell; s -= cell; e += cell; n += cell;
  const nx = Math.ceil((e - w) / cell), ny = Math.ceil((n - s) / cell), grid = new Map(), K = (i, j) => i * 100000 + j;
  for (let k = 0; k < edges.length; k++) { const [x0, y0, x1, y1] = edges[k], steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / (cell / 4)) + 1, seen = new Set();
    for (let t = 0; t <= steps; t++) { const x = x0 + (x1 - x0) * t / steps, y = y0 + (y1 - y0) * t / steps, i = Math.floor((x - w) / cell), j = Math.floor((y - s) / cell);
      for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = K(i + di, j + dj); if (seen.has(kk)) continue; seen.add(kk); (grid.get(kk) || grid.set(kk, []).get(kk)).push(k); } } }
  const fullIn = (x, y) => { let c = false; for (const [x0, y0, x1, y1] of edges) if ((y0 > y) !== (y1 > y) && x < (x1 - x0) * (y - y0) / (y1 - y0) + x0) c = !c; return c; };
  const centre = new Map();
  const centreIn = (i, j) => { const kk = K(i, j); let v = centre.get(kk); if (v === undefined) { v = fullIn(w + (i + 0.5) * cell, s + (j + 0.5) * cell); centre.set(kk, v); } return v; };
  // segments (px, py)-(qx, qy) and (ax, ay)-(bx, by) cross (proper crossing; touching counts by the half-open rule)
  const cross = (px, py, qx, qy, ax, ay, bx, by) => { const d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax), d2 = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax), d3 = (qx - px) * (ay - py) - (qy - py) * (ax - px), d4 = (qx - px) * (by - py) - (qy - py) * (bx - px);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)); };
  function contains(x, y) {
    if (x < w || x > e || y < s || y > n) return false;
    const i = Math.floor((x - w) / cell), j = Math.floor((y - s) / cell), list = grid.get(K(i, j)), cin = centreIn(i, j);
    if (!list) return cin;
    const cx = w + (i + 0.5) * cell, cy = s + (j + 0.5) * cell; let c = cin;
    for (const k of list) { const [x0, y0, x1, y1] = edges[k]; if (cross(cx, cy, x, y, x0, y0, x1, y1)) c = !c; }
    return c;
  }
  // distance in metres to the nearest edge within maxM (null when none)
  function dist(x, y, maxM) {
    const mLon = 111320 * Math.cos(y * D2R), mLat = 110574, ri = Math.ceil(maxM / mLon / cell) + 1, rj = Math.ceil(maxM / mLat / cell) + 1;
    const i0 = Math.floor((x - w) / cell), j0 = Math.floor((y - s) / cell); let best = Infinity; const done = new Set();
    for (let i = i0 - ri; i <= i0 + ri; i++) for (let j = j0 - rj; j <= j0 + rj; j++) for (const k of grid.get(K(i, j)) || []) { if (done.has(k)) continue; done.add(k);
      const [x0, y0, x1, y1] = edges[k], ax = (x0 - x) * mLon, ay = (y0 - y) * mLat, bx = (x1 - x) * mLon, by = (y1 - y) * mLat, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0, d = Math.hypot(ax + t * dx, ay + t * dy); if (d < best) best = d; }
    return best <= maxM ? best : null;
  }
  return { contains, dist, bbox: [w + cell, s + cell, e - cell, n - cell], edges: edges.length };
}

// ---------- the OSM tags of the landmark query (QLever, TSV with a header line): ?w ?b ?wd ?wp ?hist ?mm ?leis ?name
export function tagIndex(tsv) {
  const lines = tsv.split('\n').filter(Boolean), head = lines.shift().split('\t').map(h => h.replace(/^\?/, '')), T = new Map();
  const unq = v => v ? v.replace(/^"|"(@\w+|\^\^.*)?$/g, '').replace(/\\"/g, '"') : null;
  for (const l of lines) { const c = l.split('\t'), o = Object.fromEntries(head.map((h, i) => [h, unq(c[i])])), m = /openstreetmap\.org\/(way|relation|node)\/(\d+)/.exec(c[0]); if (!m) continue;
    const id = m[1][0] + m[2], t = T.get(id) || {}; for (const [k, v] of Object.entries(o)) if (k !== 'w' && v) t[k] = t[k] && t[k] !== v ? t[k] : v; T.set(id, t); }
  return T;
}

// ---------- selection of one part (operation place-lite-select)
// opt: { part (index of this part), owner(lon, lat) -> { part, how } (first part whose polygon holds the centroid, else
// the nearest within coast_m, else none; 'excluded' for London), geometryClasses { dataset -> 'osm' | 'ms' }, licences,
// tags (tagIndex), rule (place.lite.landmark), ghslAt(lon, lat), level (leaf level), atom_m, storey_m, small_m, default_m,
// raster_min_m }
const SMALL = new Set(['garage', 'garages', 'shed', 'kiosk', 'hut', 'carport', 'toilets', 'service', 'cabin', 'bunker', 'transformer_tower', 'roof', 'container', 'stable']);
const MEASURED = new Set(['osm-height', 'osm-levels', 'ms', 'overture-height', 'overture-floors']);
// the height sources of a building record (index = the record's byte 13)
export const HSRC = ['osm-height', 'osm-levels', 'ms', 'overture-height', 'overture-floors', 'default-small', 'ghsl', 'default'];
// one mass building: int32 lon x 1e7, int32 lat x 1e7, float32 footprint area m2, uint16 height dm, uint8 angle of the long
// side (256 steps of a half turn, from east toward north), uint8 aspect code (long / short = 2^(code / 32)), uint8 class
// (0 OpenStreetMap, 1 Microsoft), uint8 height source (HSRC), 2 bytes 0; little-endian
export const REC = 20;
export const recAt = (buf, i) => { const o = i * REC; return { lon: buf.readInt32LE(o) / 1e7, lat: buf.readInt32LE(o + 4) / 1e7, a: buf.readFloatLE(o + 8), h: buf.readUInt16LE(o + 12) / 10, ang: buf[o + 14] * 180 / 256, asp: 2 ** (buf[o + 15] / 32), cls: buf[o + 16], src: buf[o + 17] }; };
export function liteSelector(opt) {
  const counts = {}, inc = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };
  // the records of the mass buildings (growable), written sorted by leaf cell (then input order: Overture id)
  let cap = 1 << 16, nr = 0, RB = Buffer.alloc(cap * REC), RK = new Float64Array(cap);
  const push = (c, a, h, o, cls, src) => {
    if (nr === cap) { cap *= 2; const b = Buffer.alloc(cap * REC); RB.copy(b); RB = b; const k = new Float64Array(cap); k.set(RK); RK = k; }
    const off = nr * REC, cs = 180 / 2 ** opt.level; RB.writeInt32LE(Math.round(c[0] * 1e7), off); RB.writeInt32LE(Math.round(c[1] * 1e7), off + 4); RB.writeFloatLE(a, off + 8); RB.writeUInt16LE(Math.min(65535, Math.round(h * 10)), off + 12);
    const ang = o ? ((o[0] % 180) + 180) % 180 : 0, asp = o && o[2] > 0 ? o[1] / o[2] : 1;
    RB[off + 14] = Math.round(ang / 180 * 256) & 255; RB[off + 15] = Math.max(0, Math.min(255, Math.round(Math.log2(Math.max(1, asp)) * 32))); RB[off + 16] = cls === 'ms' ? 1 : 0; RB[off + 17] = Math.max(0, HSRC.indexOf(src));
    RK[nr] = Math.floor((c[0] + 180) / cs) * 1e6 + Math.floor((c[1] + 90) / cs); nr++; };
  const atoms = new Map(), landmarks = [], R = opt.rule, cs = 180 / 2 ** opt.level;
  const hsrc = {}, geo = { osm: { buildings: 0, area_m2: 0 }, ms: { buildings: 0, area_m2: 0 } };
  const srcOf = (r, prop) => { const x = r.sources.find(q => q.property === '/properties/' + prop) || r.sources.find(q => !q.property) || r.sources[0]; return x ? [x.dataset, x.license || ''] : [null, null]; };
  function heightOf(r) {
    const hs = srcOf(r, 'height'), fs = srcOf(r, 'num_floors');
    if (r.height > 0 && hs[0] === 'OpenStreetMap') return [r.height, 'osm-height'];
    if (r.num_floors > 0 && fs[0] === 'OpenStreetMap') return [r.num_floors * opt.storey_m, 'osm-levels'];
    if (r.height > 0 && hs[0] !== 'OpenStreetMap') { if (opt.licences.includes(hs[1])) return [r.height, hs[0] === 'Microsoft ML Buildings' ? 'ms' : 'overture-height']; inc(`height from ${hs[0]} (licence "${hs[1]}") skipped`); }
    if (r.num_floors > 0 && fs[0] !== 'OpenStreetMap') { if (opt.licences.includes(fs[1])) return [r.num_floors * opt.storey_m, 'overture-floors']; inc(`num_floors from ${fs[0]} (licence "${fs[1]}") skipped`); }
    if (SMALL.has(r.class)) return [opt.small_m, 'default-small'];
    const g = opt.ghslAt(r.c[0], r.c[1]); if (g != null) return [Math.max(opt.raster_min_m, g), 'ghsl'];
    return [opt.default_m, 'default'];
  }
  function landmarkWhy(r, cls, osmId, h, src) {
    if (cls !== 'osm') return null;
    const t = osmId ? opt.tags.get(osmId) : null;
    if (t && R.encyclopaedic && (t.wd || t.wp)) return t.wd ? 'wikidata' : 'wikipedia';
    const kind = (t && t.b) || r.class;
    if (kind && R.building.includes(kind)) return 'kind:' + kind;
    if (t && t.hist && R.historic.includes(t.hist)) return 'historic:' + t.hist;
    if (t && t.mm && R.man_made.includes(t.mm)) return 'man_made:' + t.mm;
    if (t && t.leis && R.leisure.includes(t.leis)) return 'leisure:' + t.leis;
    if (r.names_primary && ((MEASURED.has(src) && h >= R.named_tall_m) || r.a >= R.named_big_m2)) return MEASURED.has(src) && h >= R.named_tall_m ? 'named-tall' : 'named-big';
    return null;
  }
  function add(r) {
    inc('records read');
    const base = r.sources.find(q => !q.property) || r.sources[0] || {}, gsrc = base.dataset, c = r.c;
    if (!c || !(r.a >= 0)) { inc('records without a centroid'); return; }
    const own = opt.owner(c[0], c[1]);
    if (own.part !== opt.part) { inc(own.how === 'excluded' ? `in ${own.place} (drawn by that place)` : own.part < 0 ? 'outside every UK polygon (left out)' : 'belongs to another part'); return; }
    inc('records of this part'); if (own.how === 'coast') inc(`outside every UK polygon, kept by the coast rule (within ${opt.coast_m} m)`);
    const cls = opt.geometryClasses[gsrc]; if (!cls) { inc(`not drawn (geometry from ${gsrc})`); return; }
    if (r.a < R.min_area_m2) { inc(`under ${R.min_area_m2} m2 (left out)`); return; }
    const [h0, src] = heightOf(r), h = Math.round(h0 * 10) / 10; hsrc[src] = (hsrc[src] || 0) + 1; geo[cls].buildings++; geo[cls].area_m2 += r.a;
    const osmId = cls === 'osm' ? (base.record_id || '').replace(/@.*/, '') || null : null;
    const why = landmarkWhy(r, cls, osmId, h, src);
    if (why) {
      const P = r.geometry ? polysOf(r.geometry) : [];
      if (!P.length) inc('landmark by the rule but no outline in the answer (merged)');
      else { const t = osmId ? opt.tags.get(osmId) : null;
        landmarks.push({ id: r.id, osm: osmId, name: r.names_primary || (t && t.name) || null, kind: (t && t.b) || r.class || 'yes', why, wikidata: (t && t.wd) || null, wikipedia: (t && t.wp) || null,
          rings: P[0].map(ring => ring.map(([x, y]) => [r7(x), r7(y)])), c: [r7(c[0]), r7(c[1])], a: r.a, h, src, part: opt.part });
        inc('landmarks'); inc('landmarks: ' + why.split(':')[0]); return; }
    }
    // the mass: the 200 m square (atom) of the leaf cell, metres from the cell's south-west corner at the cell's mid latitude
    const x = Math.floor((c[0] + 180) / cs), y = Math.floor((c[1] + 90) / cs), b = cellBox(opt.level, x, y), mLon = 111320 * Math.cos((b[1] + b[3]) / 2 * D2R), mLat = 110574;
    const i = Math.floor((c[0] - b[0]) * mLon / opt.atom_m), j = Math.floor((c[1] - b[1]) * mLat / opt.atom_m), key = ((x * 4096 + y) * 64 + i) * 64 + j;
    let A = atoms.get(key); if (!A) atoms.set(key, A = [x, y, i, j, 0, 0, 0, 0, 0, 0, 0]);
    A[4] += r.a; A[5] += r.a * c[0]; A[6] += r.a * c[1]; A[7] += r.a * h; A[8]++; if (cls === 'ms') { A[9]++; A[10] += r.a; }
    push(c, r.a, h, r.o, cls, src); if (!r.o) inc('mass buildings without a rotated rectangle (drawn square)');
    inc('mass buildings');
  }
  // atoms: [x, y, i, j, area m2, lon, lat (area-weighted centroid), height (area-weighted mean), buildings, of them
  // Microsoft, Microsoft area m2]
  const done = () => { const out = [...atoms.entries()].sort((a, b) => a[0] - b[0]).map(([, A]) => [A[0], A[1], A[2], A[3], Math.round(A[4] * 10) / 10, r6(A[5] / A[4]), r6(A[6] / A[4]), Math.round(A[7] / A[4] * 10) / 10, A[8], A[9], Math.round(A[10])]);
    landmarks.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    for (const g of Object.values(geo)) g.area_m2 = Math.round(g.area_m2);
    const ord = Array.from({ length: nr }, (_, i) => i).sort((a, b) => (RK[a] - RK[b]) || (a - b)), recs = Buffer.alloc(nr * REC);
    ord.forEach((i, k) => RB.copy(recs, k * REC, i * REC, (i + 1) * REC));
    return { atoms: out, recs, landmarks, counts, height_sources: hsrc, geometry: geo }; };
  return { add, done };
}

// ---------- the leaf rule: the 400 m squares of a leaf cell (2 x 2 atoms of 200 m) whose built share is at least
// town_share are towns (four 200 m squares), the others one 400 m square. Returns a Map atom index -> merge size
export function townSize(atoms, P) {
  const sq = new Map(), k4 = a => (a[2] >> 1) + ',' + (a[3] >> 1);
  for (const a of atoms) sq.set(k4(a), (sq.get(k4(a)) || 0) + a[4]);
  return a => sq.get(k4(a)) / (P.rural_m * P.rural_m) >= P.town_share ? P.town_m : P.rural_m;
}

// ---------- items -> one item per square of merge_m in a cell (metres from its south-west corner at its mid latitude, as
// blockTile merges): area summed, centroid and height area-weighted; buildings and Microsoft counts summed
export function mergeItems(items, b, M) {
  const mLon = 111320 * Math.cos((b[1] + b[3]) / 2 * D2R), mLat = 110574, sq = new Map();
  for (const it of items) { const k = Math.floor((it.c[0] - b[0]) * mLon / M) + ',' + Math.floor((it.c[1] - b[1]) * mLat / M);
    const q = sq.get(k) || sq.set(k, { a: 0, x: 0, y: 0, h: 0, n: 0, nms: 0, ox: 0, oy: 0 }).get(k); q.a += it.a; q.x += it.a * it.c[0]; q.y += it.a * it.c[1]; q.h += it.a * it.H.h; q.n += it.n || 1; q.nms += it.nms || 0; q.ox += it.ox || 0; q.oy += it.oy || 0; }
  return [...sq.entries()].sort((a, b2) => a[0] < b2[0] ? -1 : a[0] > b2[0] ? 1 : 0).map(([k, q]) => ({ id: 'm' + M + ':' + k, a: q.a, c: [q.x / q.a, q.y / q.a], H: { h: q.h / q.a, src: 'merged' }, n: q.n, nms: q.nms, ox: q.ox, oy: q.oy }));
}

// in a ring list (a polygon with holes), by the even-odd rule
export const inPolygon = (p, P) => inRing(p, P[0]) && !P.slice(1).some(h => inRing(p, h));

// ---------- compact boxes, layout cwplans-boxes-1 (place-lite-tiles 3): the boxes of one tile in the tile's frame F (the
// enuFrame of blockTile; glTF y up: x east, y up, z = -north). 8 bytes a box, little-endian: int16 east, int16 north (units
// q m), uint8 footprint area code (area = 2^(code / 10) m2), uint8 height code (HDEC: 0.25 m steps to 50 m, then 5 m),
// uint8 angle of the long side (256 steps of a half turn, from east toward north), uint8 flags (bits 0-3: aspect,
// long / short = 2^(k / 3); bit 4: footprint class, 0 OpenStreetMap, 1 Microsoft; bits 5-7: height source, HSRC).
// Box: long side sqrt(area x aspect), short side sqrt(area / aspect) (so the box keeps the footprint's area), from
// ground - drop_m to ground + height. Ground: a grid of n x n int16 (decimetres of the frame's up) over east e0 .. e0 +
// de (n - 1), north n0 .. n0 + dn (n - 1), row by row from the south; bilinear. Read by docklands/globe/places.js.
export const TILE_EXTRAS = 'glb extras.blocks: classes (labels by class index), height_sources (labels), boxes (the landmark boxes, then the compact boxes as the reader appends them: c class index, h height in decimetres, s height-source index, f the features.json row of a landmark drawn as a box, -1 otherwise), outlines (none in a lite set), named (the features.json rows drawn as outlines, _FEATURE_ID_0), mass_buildings (the buildings the merged squares stand for), compact (the compact boxes: compact)';
export const COMPACT_ABOUT = { layout: 'cwplans-boxes-1', where: 'glb extras.blocks.compact: bufferView (8 bytes a box), grid.bufferView (n x n int16)', box: 'int16 east, int16 north (x q m, in the tile frame), uint8 area code, uint8 height code, uint8 angle code, uint8 flags; little-endian',
  area_code: 'footprint area m2 = 2^(code / 10)', height_code: 'code <= 200: code / 4 m; else 50 + (code - 200) x 5 m', angle_code: 'angle of the long side = code x 180 / 256 degrees, from east toward north',
  flags: 'bits 0-3 aspect k (long / short = 2^(k / 3)), bit 4 footprint class (0 OpenStreetMap, 1 Microsoft), bits 5-7 height source (height_sources)', sides: 'long = sqrt(area x aspect), short = sqrt(area / aspect)',
  ground: 'grid of n x n int16 decimetres of the tile frame\'s up over east e0 + i de, north n0 + j dn (rows from the south), bilinear; a box stands from ground - drop_m to ground + height',
  kinds: { buildings: 'one box a building (leaves; class from the flags)', squares: 'one box a square of merged buildings (coarse levels; aspect 1, turned to the grain of its buildings, flags 0)' }, height_sources: HSRC };
export const HCODE = h => h <= 50 ? Math.max(0, Math.round(h * 4)) : Math.min(255, 200 + Math.round((h - 50) / 5));
export const HDEC = c => c <= 200 ? c / 4 : 50 + (c - 200) * 5;
export const ACODE = a => Math.max(0, Math.min(255, Math.round(Math.log2(Math.max(1, a)) * 10)));
// boxes: [{ lon, lat, a (m2), asp (long / short), ang (degrees from east toward north), h (m), cls (0, 1), src (HSRC index) }]
// groundAt(lon, lat): orthometric; geoidAt(lon, lat): geoid height (ellipsoidal = orthometric + geoid)
export function compactBoxes({ F, b, boxes, groundAt, geoidAt, drop_m, grid_n = 17, kind, colour }) {
  const ell = (lon, lat) => groundAt(lon, lat) + geoidAt(lon, lat);
  // the cell's extent in the frame (corners and edge middles), 60 m margin for boxes whose centroid is near the edge
  let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (const lon of [b[0], (b[0] + b[2]) / 2, b[2]]) for (const lat of [b[1], (b[1] + b[3]) / 2, b[3]]) { const [E, N] = F.toEnu(lon, lat, 0); e0 = Math.min(e0, E); e1 = Math.max(e1, E); n0 = Math.min(n0, N); n1 = Math.max(n1, N); }
  e0 -= 60; n0 -= 60; e1 += 60; n1 += 60;
  const n = grid_n, de = (e1 - e0) / (n - 1), dn = (n1 - n0) / (n - 1), grid = Buffer.alloc(n * n * 2), gv = new Float64Array(n * n);
  let emin = Infinity, emax = -Infinity;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const E = e0 + i * de, N = n0 + j * dn, g = F.fromEnu(E, N, 0), h = ell(g.lon, g.lat), U = F.toEnu(g.lon, g.lat, h)[2];
    const v = Math.max(-32767, Math.min(32767, Math.round(U * 10))); grid.writeInt16LE(v, 2 * (j * n + i)); gv[j * n + i] = v / 10; emin = Math.min(emin, h); emax = Math.max(emax, h); }
  const q = Math.max(Math.abs(e0), Math.abs(e1), Math.abs(n0), Math.abs(n1)) / 32000, data = Buffer.alloc(boxes.length * 8);
  let hmax = 0, k = 0; const st = { boxes: boxes.length, by_class: [0, 0], by_src: new Array(8).fill(0) };
  for (const x of boxes) {
    const [E, N] = F.toEnu(x.lon, x.lat, 0), o = 8 * k++;
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(E / q))), o); data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(N / q))), o + 2);
    data[o + 4] = ACODE(x.a); data[o + 5] = HCODE(x.h); data[o + 6] = Math.round((((x.ang % 180) + 180) % 180) / 180 * 256) & 255;
    data[o + 7] = Math.max(0, Math.min(15, Math.round(Math.log2(Math.max(1, x.asp)) * 3))) | ((x.cls & 1) << 4) | ((x.src & 7) << 5);
    hmax = Math.max(hmax, HDEC(data[o + 5])); st.by_class[x.cls & 1]++; st.by_src[x.src & 7]++;
  }
  // (the layout is described once in features.json, lite.compact: COMPACT_ABOUT; a tile carries its numbers only)
  const meta = { layout: 'cwplans-boxes-1', kind, count: boxes.length, q: +q.toPrecision(8), drop_m, ...(colour ? { colour } : {}), height_sources: HSRC,
    grid: { n, e0: +e0.toFixed(3), n0: +n0.toFixed(3), de: +de.toFixed(4), dn: +dn.toFixed(4), unit_m: 0.1 } };
  return { data, grid, meta, zmin: emin - drop_m - 1, zmax: emax + hmax + 1, stats: st };
}

// ---------- the mass of a leaf cell (ranges [buffer, first, end] of REC records) as one item per square of M metres (the
// coarse levels' input; as mergeItems)
export function recSquares(ranges, b, M) {
  const mLon = 111320 * Math.cos((b[1] + b[3]) / 2 * D2R), mLat = 110574, sq = new Map();
  for (const [B, s0, s1] of ranges) for (let i = s0; i < s1; i++) { const o = i * REC, lon = B.readInt32LE(o) / 1e7, lat = B.readInt32LE(o + 4) / 1e7, a = B.readFloatLE(o + 8), h = B.readUInt16LE(o + 12) / 10, ms = B[o + 16], t4 = B[o + 14] / 256 * 4 * Math.PI;
    const k = Math.floor((lon - b[0]) * mLon / M) + ',' + Math.floor((lat - b[1]) * mLat / M);
    const q = sq.get(k) || sq.set(k, { a: 0, x: 0, y: 0, h: 0, n: 0, nms: 0, ox: 0, oy: 0 }).get(k); q.a += a; q.x += a * lon; q.y += a * lat; q.h += a * h; q.n++; q.nms += ms; q.ox += a * Math.cos(t4); q.oy += a * Math.sin(t4); }
  return [...sq.entries()].sort((a, b2) => a[0] < b2[0] ? -1 : a[0] > b2[0] ? 1 : 0).map(([k, q]) => ({ id: 'm' + M + ':' + k, a: q.a, c: [q.x / q.a, q.y / q.a], H: { h: q.h / q.a, src: 'merged' }, n: q.n, nms: q.nms, ox: q.ox, oy: q.oy }));
}
// merged items of a cell -> square boxes (the rule of blockTile's merged boxes: the side grows with the built share of the
// square, full at `full`; the centre moves from the area-weighted centre to the square's centre as it grows). The box is
// turned to the grain of its buildings (the area-weighted mean of 4 x their angles, a square repeating every quarter turn),
// so a town seen from far does not read as a grid of tiles (owner, 2026-10-22: "UK data looks like literal tiles")
export function squareBoxes(items, b, M, full) {
  const mLon = 111320 * Math.cos((b[1] + b[3]) / 2 * D2R), mLat = 110574, out = [];
  for (const it of items) { const i = Math.floor((it.c[0] - b[0]) * mLon / M), j = Math.floor((it.c[1] - b[1]) * mLat / M), sc = [b[0] + (i + 0.5) * M / mLon, b[1] + (j + 0.5) * M / mLat];
    const side = M * Math.min(1, Math.sqrt(it.a / (M * M) / full)), f = side / M;
    const ang = it.ox || it.oy ? ((Math.atan2(it.oy, it.ox) / 4 * 180 / Math.PI) % 90 + 90) % 90 : 0;
    out.push({ lon: it.c[0] + (sc[0] - it.c[0]) * f, lat: it.c[1] + (sc[1] - it.c[1]) * f, a: side * side, asp: 1, ang, h: it.H.h, cls: 0, src: 0, n: it.n || 1 }); }
  return out;
}
// the buildings of a leaf cell as boxes for compactBoxes
export function recBoxes(ranges) {
  const out = [];
  for (const [B, s0, s1] of ranges) for (let i = s0; i < s1; i++) { const o = i * REC;
    out.push({ lon: B.readInt32LE(o) / 1e7, lat: B.readInt32LE(o + 4) / 1e7, a: B.readFloatLE(o + 8), h: B.readUInt16LE(o + 12) / 10, ang: B[o + 14] * 180 / 256, asp: 2 ** (B[o + 15] / 32), cls: B[o + 16], src: B[o + 17] }); }
  return out;
}
