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
//   townSize(...)          the leaf rule: 200 m squares where a 400 m square is a town, else 400 m
// Tiles are written by place-blocks.mjs blockTile (one box a square; landmarks as outlines with their feature id).
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
export function liteSelector(opt) {
  const counts = {}, inc = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };
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
    inc('mass buildings');
  }
  // atoms: [x, y, i, j, area m2, lon, lat (area-weighted centroid), height (area-weighted mean), buildings, of them
  // Microsoft, Microsoft area m2]
  const done = () => { const out = [...atoms.entries()].sort((a, b) => a[0] - b[0]).map(([, A]) => [A[0], A[1], A[2], A[3], Math.round(A[4] * 10) / 10, r6(A[5] / A[4]), r6(A[6] / A[4]), Math.round(A[7] / A[4] * 10) / 10, A[8], A[9], Math.round(A[10])]);
    landmarks.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    for (const g of Object.values(geo)) g.area_m2 = Math.round(g.area_m2);
    return { atoms: out, landmarks, counts, height_sources: hsrc, geometry: geo }; };
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
    const q = sq.get(k) || sq.set(k, { a: 0, x: 0, y: 0, h: 0, n: 0, nms: 0 }).get(k); q.a += it.a; q.x += it.a * it.c[0]; q.y += it.a * it.c[1]; q.h += it.a * it.H.h; q.n += it.n || 1; q.nms += it.nms || 0; }
  return [...sq.entries()].sort((a, b2) => a[0] < b2[0] ? -1 : a[0] > b2[0] ? 1 : 0).map(([k, q]) => ({ id: 'm' + M + ':' + k, a: q.a, c: [q.x / q.a, q.y / q.a], H: { h: q.h / q.a, src: 'merged' }, n: q.n, nms: q.nms }));
}

// in a ring list (a polygon with holes), by the even-odd rule
export const inPolygon = (p, P) => inRing(p, P[0]) && !P.slice(1).some(h => inRing(p, h));
