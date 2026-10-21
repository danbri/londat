// The city and the surroundings of a place by level of detail (cwplans/tools/build-place-tiles.mjs imports this; skill
// docklands-3d-page, "Three.js port: places, city and surroundings by level of detail (2026-10-20)").
// Pure functions over their inputs (no clock, no network):
//   selectOuter(raw, opt)  Overture answers -> roads, rail, water, place names, peaks, city buildings (OSM geometry only),
//                          footprint height sources (non-OSM records with an open licence; the IGN floors apart)
//   lodTree(opt)           the quadtree of the tile set: top-level cells over the extent, refined by distance, the city box
//                          and the core (REPLACE refinement: a refined cell has all four children)
//   outerTile(...)         one glTF tile: a 33 x 33 terrain grid with skirts, a JPEG ground texture (land cover, water,
//                          rivers, roads, rail, building footprints) and, in the city, buildings as plain blocks
//   writeGlb(prims, ...)   glTF 2.0 with KHR_mesh_quantization (int16 positions, uint16 texture coordinates; the node's
//                          translation and scale dequantize), no normals (readers compute them)
import earcut from 'earcut';
import { createCanvas } from '@napi-rs/canvas';
import { enuFrame, D2R } from '../../docklands/geo/ellipsoid.js';

const r7 = v => Math.round(v * 1e7) / 1e7;
export const cellBox = (l, x, y) => { const cs = 180 / 2 ** l; return [-180 + x * cs, -90 + y * cs, -180 + (x + 1) * cs, -90 + (y + 1) * cs]; };
const meet = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

// ---------- selection (operation place-select-outer)
const osmSrc = r => { const b = r.sources.find(q => !q.property) || r.sources[0]; return b && b.dataset === 'OpenStreetMap'; };
const lines = g => g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
const polys = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const altName = (r, keys) => { const c = r.names_common || {}; for (const k of keys) if (c[k] && c[k] !== r.names_primary) return c[k]; return null; };
// the part of a segment that is a tunnel or a bridge: road_flags [{values, between}] (between null = the whole segment)
const flagWhole = (fl, v) => (fl || []).some(f => (f.values || []).includes(v) && (!f.between || (f.between[0] <= 0.01 && f.between[1] >= 0.99)));
const cen = r => { let x = 0, y = 0; const n = r.length - 1; for (let i = 0; i < n; i++) { x += r[i][0]; y += r[i][1]; } return [x / n, y / n]; };
const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
export function selectOuter(raw, opt) {
  const extra = [];
  const { licences, ignDataset, altKeys = [] } = opt, out = { roads: [], water_lines: [], water_areas: [], labels: [], buildings: [], fp_overture: [], ign: [], counts: {} };
  const C = out.counts, inc = (k, n = 1) => { C[k] = (C[k] || 0) + n; };
  for (const r of [...(raw.roads?.rows || []), ...(raw.streets?.rows || [])]) {
    if (!osmSrc(r)) { inc('segments_not_osm_skipped'); continue; }
    const tunnel = flagWhole(r.road_flags, 'is_tunnel') || flagWhole(r.rail_flags, 'is_tunnel');
    if (tunnel) { inc('segments_tunnel_skipped'); continue; }
    const kind = r.subtype === 'rail' ? 'rail' : 'road', cls = r.subtype === 'rail' ? (r.class || 'rail') : r.class;
    if (kind === 'rail' && ['subway', 'funicular', 'monorail'].includes(cls)) continue;
    for (const pts of lines(r.geometry)) out.roads.push({ kind, cls, name: r.names_primary || null, alt: altName(r, altKeys), pts }); inc(kind + 's');
  }
  for (const r of raw.water?.rows || []) {
    if (!osmSrc(r)) { inc('water_not_osm_skipped'); continue; }
    const g = r.geometry;
    if (g.type.endsWith('LineString')) { for (const pts of lines(g)) out.water_lines.push({ cls: r.class || r.subtype, name: r.names_primary || null, alt: altName(r, altKeys), pts }); inc('water_lines'); }
    else if (g.type.endsWith('Polygon')) { for (const rings of polys(g)) out.water_areas.push({ cls: r.class || r.subtype, name: r.names_primary || null, rings }); inc('water_areas'); }
  }
  for (const r of raw.places?.rows || []) {
    if (r.geometry.type !== 'Point' || !r.names_primary) continue;
    const [lon, lat] = r.geometry.coordinates, src = (r.sources[0] || {}).dataset;
    out.labels.push({ name: r.names_primary, alt: altName(r, altKeys), kind: r.class || r.subtype, subtype: r.subtype, lon: r7(lon), lat: r7(lat), pop: r.population || null, prominence: r.cartography?.prominence ?? null, src }); inc('places');
  }
  for (const r of raw.peaks?.rows || []) {
    if (r.geometry.type !== 'Point' || !osmSrc(r)) continue; const [lon, lat] = r.geometry.coordinates;
    out.labels.push({ name: r.names_primary, alt: altName(r, altKeys), kind: r.class, subtype: 'peak', lon: r7(lon), lat: r7(lat), ele: r.elevation ?? null, src: 'OpenStreetMap' }); inc('peaks');
  }
  // buildings: OSM geometry -> drawn (with the OSM values); other records -> heights only (open licence), or the IGN floors
  const srcOf = (r, prop) => { const x = r.sources.find(q => q.property === '/properties/' + prop) || r.sources.find(q => !q.property) || r.sources[0]; return x ? [x.dataset, x.license || ''] : [null, null]; };
  for (const r of raw.buildings?.rows || []) {
    const P = polys(r.geometry); if (!P.length) continue; const rings = P[0].map(ring => ring.map(([x, y]) => [r7(x), r7(y)]));
    const gsrc = (r.sources.find(q => !q.property) || r.sources[0] || {}).dataset;
    const xg = (opt.extraGeometry || []).find(g => g.dataset === gsrc);
    if ((opt.geometrySources || ['OpenStreetMap']).includes(gsrc)) {
      const b = { id: r.id, src: gsrc, cls: 'osm', osm: (r.sources.find(q => !q.property) || {}).record_id || null, kind: r.class || 'yes', rings, part: false };
      if (r.height != null && srcOf(r, 'height')[0] === 'OpenStreetMap') b.height = r.height;
      if (r.num_floors != null && srcOf(r, 'num_floors')[0] === 'OpenStreetMap') b.levels = r.num_floors;
      if (r.min_height != null) b.min_height = r.min_height;
      out.buildings.push(b); inc('buildings_osm');
    } else if (xg) { extra.push({ id: r.id, src: gsrc, cls: xg.cls, kind: r.class || 'yes', rings, part: false }); }
    else inc(`buildings not drawn (geometry from ${gsrc})`);
    // height sources from the record's own values (whatever its geometry source), as world-overture in the core
    const o = { id: r.id, ring: rings[0] }; let any = false;
    for (const [k, prop] of [['height', 'height'], ['floors', 'num_floors']]) { const v = r[prop]; if (v == null) continue; const sv = srcOf(r, prop);
      if (sv[0] === 'OpenStreetMap') continue;
      if (ignDataset && sv[0] === ignDataset && prop === 'num_floors') { out.ign.push({ id: r.id, ring: rings[0], floors: v }); inc('ign_floors'); continue; }
      if (!licences.includes(sv[1])) { inc(`${prop} from ${sv[0]} (licence "${sv[1]}") skipped`); continue; }
      o[k] = v; any = true; }
    if (any) out.fp_overture.push(o);
  }
  // the extra geometry classes (region switch surround.geometry): drawn only where OSM has no building. A footprint is
  // dropped when its centroid or any of its points is inside an OSM outline, or an OSM centroid is inside it (OSM first)
  if (extra.length) {
    const G = new Map(), gk = (x, y) => Math.floor(x / 0.0005) + ',' + Math.floor(y / 0.0005);
    const sh = (p, c) => [p[0] + (c[0] - p[0]) * 0.2, p[1] + (c[1] - p[1]) * 0.2];   // a point pulled 20 % to the centre: touching neighbours are not overlaps
    const bbox = r => { let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity; for (const [x, y] of r) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); } return [w, s, e, n]; };
    for (const b of out.buildings) { const r = b.rings[0], c = cen(r), bb = bbox(r); const o = { r, c, bb }; for (let i = Math.floor(bb[0] / 0.0005); i <= Math.floor(bb[2] / 0.0005); i++) for (let j = Math.floor(bb[1] / 0.0005); j <= Math.floor(bb[3] / 0.0005); j++) { const k = i + ',' + j; (G.get(k) || G.set(k, []).get(k)).push(o); } }
    for (const x of extra) { const r = x.rings[0], c = cen(r), bb = bbox(r), seen = new Set(); let hit = false;
      for (let i = Math.floor(bb[0] / 0.0005); i <= Math.floor(bb[2] / 0.0005) && !hit; i++) for (let j = Math.floor(bb[1] / 0.0005); j <= Math.floor(bb[3] / 0.0005) && !hit; j++) for (const o of G.get(i + ',' + j) || []) {
        if (seen.has(o)) continue; seen.add(o); if (o.bb[0] > bb[2] || o.bb[2] < bb[0] || o.bb[1] > bb[3] || o.bb[3] < bb[1]) continue;
        if (inRing(c, o.r) || inRing(o.c, r) || r.some(p => inRing(sh(p, c), o.r)) || o.r.some(p => inRing(sh(p, o.c), r))) { hit = true; break; } }
      if (hit) { inc(`buildings ${x.cls} dropped (overlap an OSM building)`); continue; }
      out.buildings.push(x); inc(`buildings_${x.cls}`); }
  }
  out.buildings.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

// ---------- the tree
// opt: { ext (whole top cells), top, core: Set of core cell keys (level 15), coreArea, city, origin, mLon, mLat, refine: [[m, level]] }
export function lodTree(opt) {
  const { ext, top, core, coreArea, city, origin, mLon, mLat, refine } = opt, cs = 180 / 2 ** top;
  const dist = b => { const dx = Math.max(0, b[0] - origin.lon, origin.lon - b[2]) * mLon, dy = Math.max(0, b[1] - origin.lat, origin.lat - b[3]) * mLat; return Math.hypot(dx, dy); };
  const maxLevel = b => { if (meet(b, coreArea)) return 15; if (city && meet(b, city)) return 14; const d = dist(b); let l = top; for (const [m, lv] of refine) if (d < m) l = Math.max(l, lv); return l; };
  const node = (l, x, y) => { const b = cellBox(l, x, y), key = `${l}-${x}-${y}`, n = { l, x, y, key, b, core: l === 15 && core.has(key), kids: [] };
    if (l < 15 && l < maxLevel(b)) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) n.kids.push(node(l + 1, 2 * x + dx, 2 * y + dy));
    return n; };
  const roots = []; for (let x = Math.round((ext[0] + 180) / cs); x < Math.round((ext[2] + 180) / cs); x++) for (let y = Math.round((ext[1] + 90) / cs); y < Math.round((ext[3] + 90) / cs); y++) roots.push(node(top, x, y));
  return roots;
}
export const walk = (ns, f) => { for (const n of ns) { f(n); walk(n.kids, f); } };

// ---------- grids
export function gridSampler(G) {   // bilinear over a grid (row 0 = north, cell centres); NaN cells take a neighbour
  const dx = (G.e - G.w) / G.nx, dy = (G.n - G.s) / G.ny, at = (i, j) => { i = Math.max(0, Math.min(G.nx - 1, i)); j = Math.max(0, Math.min(G.ny - 1, j)); return G.h[j * G.nx + i]; };
  return (lon, lat) => { const fx = (lon - G.w) / dx - 0.5, fy = (G.n - lat) / dy - 0.5, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1), vals = [a, b, c, d].filter(x => x === x); if (!vals.length) return 0; const f = x => x === x ? x : vals[0];
    return (f(a) * (1 - u) + f(b) * u) * (1 - v) + (f(c) * (1 - u) + f(d) * u) * v; };
}
// the DEM of the surroundings, its outer band (blend_m from the extent's edge) eased to a box mean of about box_m, so the
// edge meets the globe's coarse terrain (ETOPO box means of about 10 km) with a small step (the curtain hides the rest)
export function easedDem(D, ext, mLon, mLat, blend_m, box_m) {
  const at = gridSampler(D), step = 500, nx = Math.ceil((ext[2] - ext[0]) * mLon / step) + 1, ny = Math.ceil((ext[3] - ext[1]) * mLat / step) + 1, c = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) c[j * nx + i] = at(ext[0] + (ext[2] - ext[0]) * i / (nx - 1), ext[3] - (ext[3] - ext[1]) * j / (ny - 1));
  const S = new Float64Array((nx + 1) * (ny + 1)); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) S[(j + 1) * (nx + 1) + i + 1] = c[j * nx + i] + S[j * (nx + 1) + i + 1] + S[(j + 1) * (nx + 1) + i] - S[j * (nx + 1) + i];
  const r = Math.round(box_m / step / 2), mean = (i, j) => { const i0 = Math.max(0, i - r), i1 = Math.min(nx - 1, i + r), j0 = Math.max(0, j - r), j1 = Math.min(ny - 1, j + r);
    return (S[(j1 + 1) * (nx + 1) + i1 + 1] - S[j0 * (nx + 1) + i1 + 1] - S[(j1 + 1) * (nx + 1) + i0] + S[j0 * (nx + 1) + i0]) / ((i1 - i0 + 1) * (j1 - j0 + 1)); };
  const M = { w: ext[0], e: ext[2], s: ext[3] - (ext[3] - ext[1]) * (ny - 0.5) / (ny - 1) * 1, n: ext[3], nx, ny, h: new Float64Array(nx * ny) };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) M.h[j * nx + i] = mean(i, j);
  const mAt = (lon, lat) => { const fx = (lon - ext[0]) / (ext[2] - ext[0]) * (nx - 1), fy = (ext[3] - lat) / (ext[3] - ext[1]) * (ny - 1), i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(ny - 2, Math.floor(fy))), u = Math.min(1, fx - i), v = Math.min(1, fy - j), g = (a, b) => M.h[b * nx + a];
    return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - v) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * v; };
  const sm = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
  return (lon, lat) => { const d = Math.min((lon - ext[0]) * mLon, (ext[2] - lon) * mLon, (lat - ext[1]) * mLat, (ext[3] - lat) * mLat), t = 1 - sm(d / blend_m), h = at(lon, lat); return t > 0 ? h + (mAt(lon, lat) - h) * t : h; };
}
// a box-filtered sample (k x k points over a square of `size` degrees) for coarse grids
export const boxed = (at, k) => (lon, lat, sx, sy) => { if (k <= 1) return at(lon, lat); let s = 0; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) s += at(lon + sx * ((a + 0.5) / k - 0.5), lat + sy * ((b + 0.5) / k - 0.5)); return s / (k * k); };

// ---------- geometry
const toXY = (r, ref, mLon, mLat) => r.map(([lo, la]) => [(lo - ref[0]) * mLon, (la - ref[1]) * mLat]);
function simplify(pts, tol) {   // Douglas-Peucker on a closed ring (given open): split at the point farthest from the first
  const n = pts.length; if (n <= 4) return pts;
  const keep = new Uint8Array(n), P = i => pts[i % n]; let far = 0, fd = -1;
  for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  keep[0] = keep[far] = 1;
  const dp = (a, b) => { const [x1, y1] = P(a), [x2, y2] = P(b), L = Math.hypot(x2 - x1, y2 - y1) || 1e-9; let m = -1, k = -1;
    for (let i = a + 1; i < b; i++) { const [x0, y0] = P(i), d = Math.abs((x2 - x1) * (y1 - y0) - (x1 - x0) * (y2 - y1)) / L; if (d > m) { m = d; k = i; } }
    if (m > tol) { keep[k] = 1; dp(a, k); dp(k, b); } };
  dp(0, far); dp(far, n);
  const out = pts.filter((_, i) => keep[i]); return out.length >= 3 ? out : pts;
}
function obbBox(xy) {   // the minimum-area oriented box of the points (rotating hull edges): 4 corners
  const p = xy.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  const H = lo.slice(0, -1).concat(up.slice(0, -1)); let best = null;
  for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length], t = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(t), s = Math.sin(t); let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of H) { const u = x * c + y * s, v = -x * s + y * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const ar = (u1 - u0) * (v1 - v0); if (!best || ar < best.ar) best = { ar, c, s, u0, u1, v0, v1 }; }
  if (!best) return null; const { c, s, u0, u1, v0, v1 } = best, P = (u, v) => [u * c - v * s, u * s + v * c];
  const box = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)]; box.frame = { c, s, cx: (u0 + u1) / 2, cy: (v0 + v1) / 2, len: u1 - u0, wid: v1 - v0 }; return box;
}
const area2 = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; };   // > 0 counter-clockwise (x east, y north)

// ---------- one outer tile
// opt: { cell, P (params), demAt (eased, DEM datum), geoidAt, lc (land cover grid), lcColours, sel (outer selection), bIndex (city
// buildings by cell key of the level), HT (city heights), city, mLon, mLat }
export async function outerTile(opt) {
  const { cell, P, demAt, geoidAt, lc, lcColours, sel, cityB, HT, city, mLon: mLon0, mLat } = opt, [w, s, e, n] = cell.b, l = cell.l;
  const lc0 = (w + e) / 2, bc = (s + n) / 2, mLon = 111320 * Math.cos(bc * D2R), ell = (lon, lat) => demAt(lon, lat) + geoidAt(lon, lat);
  const h0 = Math.round(ell(lc0, bc) * 100) / 100, F = enuFrame({ lon: lc0, lat: bc, h: h0 }), Y = ([E, N, U]) => [E, U, -N];
  // terrain: (G + 1)^2 vertices, box-filtered for coarse cells (vertex spacing >> DEM spacing); skirts on all four edges
  const G = P.grid, k = Math.max(1, Math.min(4, Math.round((n - s) / G * mLat / 60))), samp = boxed(ell, k), sx = (e - w) / G, sy = (n - s) / G;
  const pos = [], uv = [], nrm = [], idx = [], vid = (i, j) => j * (G + 1) + i; let zmin = Infinity, zmax = -Infinity;
  // normals from the DEM itself (central differences one grid step apart), so neighbouring tiles shade the same at a seam
  for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) { const lon = w + (e - w) * i / G, lat = n - (n - s) * j / G, hh = samp(lon, lat, sx, sy); zmin = Math.min(zmin, hh); zmax = Math.max(zmax, hh); pos.push(...Y(F.toEnu(lon, lat, hh))); uv.push(i / G, j / G);
    const gE = (samp(lon + sx, lat, sx, sy) - samp(lon - sx, lat, sx, sy)) / (2 * sx * mLon), gN = (samp(lon, lat + sy, sx, sy) - samp(lon, lat - sy, sx, sy)) / (2 * sy * mLat), L = Math.hypot(gE, gN, 1);
    nrm.push(-gE / L, 1 / L, gN / L); }
  // the grid as one triangle strip (rows joined by two repeated indices: 35 % of the indices of a list); skirts as a list
  const strip = []; for (let j = 0; j < G; j++) { if (j) strip.push(vid(G, j), vid(0, j)); for (let i = 0; i <= G; i++) strip.push(vid(i, j), vid(i, j + 1)); }
  const skirt = Math.max(15, (n - s) * mLat / 40), edge = ks => { let prev = null; for (const kk of ks) { const v = pos.length / 3; pos.push(pos[3 * kk], pos[3 * kk + 1] - skirt, pos[3 * kk + 2]); uv.push(uv[2 * kk], uv[2 * kk + 1]); nrm.push(nrm[3 * kk], nrm[3 * kk + 1], nrm[3 * kk + 2]); if (prev) idx.push(prev[0], prev[1], kk, kk, prev[1], v); prev = [kk, v]; } };
  const row = j => Array.from({ length: G + 1 }, (_, i) => vid(i, j)), col = i => Array.from({ length: G + 1 }, (_, j) => vid(i, j));
  edge(row(0).reverse()); edge(row(G)); edge(col(0)); edge(col(G).reverse());
  // the texture
  const T = P.tex, cv = createCanvas(T, T), cx = cv.getContext('2d'), mpp = (n - s) * mLat / T, X = lon => (lon - w) / (e - w) * T, Yp = lat => (n - lat) / (n - s) * T;
  { const img = cx.createImageData(T, T), d = img.data, col = {}; for (const [kk, hex] of Object.entries(lcColours)) col[kk] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const dflt = col[30] || [160, 160, 120], lpx = (lc.e - lc.w) / lc.nx, lpy = (lc.n - lc.s) / lc.ny, kk = Math.max(1, Math.min(4, Math.round((e - w) / T / lpx)));
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) { let r = 0, g = 0, b = 0;
      for (let a = 0; a < kk; a++) for (let bb = 0; bb < kk; bb++) { const lon = w + (e - w) * (i + (a + 0.5) / kk) / T, lat = n - (n - s) * (j + (bb + 0.5) / kk) / T, ii = Math.floor((lon - lc.w) / lpx), jj = Math.floor((lc.n - lat) / lpy);
        const c = (ii >= 0 && jj >= 0 && ii < lc.nx && jj < lc.ny && col[lc.h[jj * lc.nx + ii]]) || dflt; r += c[0]; g += c[1]; b += c[2]; }
      const q = 4 * (j * T + i), m = kk * kk; d[q] = r / m; d[q + 1] = g / m; d[q + 2] = b / m; d[q + 3] = 255; }
    cx.putImageData(img, 0, 0); }
  const pad = (e - w) * 0.02, nearB = pts => { for (const [lo, la] of pts) if (lo > w - pad && lo < e + pad && la > s - pad && la < n + pad) return true; return false; };
  const path = pts => { cx.beginPath(); pts.forEach(([lo, la], q) => q ? cx.lineTo(X(lo), Yp(la)) : cx.moveTo(X(lo), Yp(la))); };
  cx.lineCap = 'round'; cx.lineJoin = 'round';
  const stats = { roads_m: 0, rail_m: 0, river_m: 0, rivers: new Set(), roads: new Set(), blocks: 0 };
  const lenIn = pts => { let L = 0; for (let q = 1; q < pts.length; q++) { const [a, b] = pts[q - 1], [c, d] = pts[q]; const mx = (a + c) / 2, my = (b + d) / 2; if (mx >= w && mx < e && my >= s && my < n) L += Math.hypot((c - a) * mLon, (d - b) * mLat); } return L; };
  for (const a of sel.water_areas) if (a.rings[0].length > 2 && nearB(a.rings[0])) { cx.beginPath(); for (const r of a.rings) { r.forEach(([lo, la], q) => q ? cx.lineTo(X(lo), Yp(la)) : cx.moveTo(X(lo), Yp(la))); cx.closePath(); } cx.fillStyle = P.colours.water; cx.fill('evenodd'); }
  for (const r of sel.water_lines) { const big = ['river', 'canal'].includes(r.cls); if (!big && l < 12) continue; if (!nearB(r.pts)) continue;
    path(r.pts); cx.strokeStyle = P.colours.water; cx.lineWidth = Math.max(big ? 1.4 : 0.7, (big ? 18 : 4) / mpp); cx.stroke(); const L = lenIn(r.pts); if (L > 0 && big) { stats.river_m += L; if (r.name) stats.rivers.add(r.name); } }
  // building footprints (the city's; under the blocks where there are blocks)
  if (city && meet(cell.b, city)) { cx.fillStyle = P.colours.footprint; for (const b of sel.buildings) { const r = b.rings[0]; if (!nearB(r)) continue; cx.beginPath(); r.forEach(([lo, la], q) => q ? cx.lineTo(X(lo), Yp(la)) : cx.moveTo(X(lo), Yp(la))); cx.closePath(); cx.fill(); } }
  const RW = P.roads, order = ['streets', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
  const rs = sel.roads.filter(r => nearB(r.pts)).map(r => ({ r, k: r.kind === 'rail' ? 'rail' : RW[r.cls] ? r.cls : 'streets' })).filter(({ k }) => (RW[k]?.min_level ?? 0) <= l);
  for (const pass of ['casing', 'fill']) for (const k of ['rail', ...order]) { const st = RW[k]; if (!st) continue; if (pass === 'casing' && !st.casing) continue;
    for (const { r, k: kk } of rs) { if (kk !== k) continue; path(r.pts); const wpx = Math.max(st.min_px, st.width_m / mpp);
      cx.strokeStyle = pass === 'casing' ? st.casing : st.colour; cx.lineWidth = pass === 'casing' ? wpx + 1.2 : wpx; cx.stroke();
      if (pass === 'fill') { const L = lenIn(r.pts); if (L > 0) { if (k === 'rail') stats.rail_m += L; else { stats.roads_m += L; if (r.name && k !== 'streets') stats.roads.add(r.name); } } } } }
  const jpg = await cv.encode('jpeg', P.jpeg);
  // city blocks: the buildings whose centroid is in this cell (level >= block_level; at the first block level only the
  // large or tall ones, as oriented boxes), simplified outlines, flat tops, base at the lowest ground of the outline
  // block metadata (glb extras, for the card): geometry class, height (dm) and height source of each box (instance order)
  // and each outline (with the end of its triangles)
  const CL = ['osm', 'ign', 'ms'], HS = [], hsi = k => { let i = HS.indexOf(k); if (i < 0) { HS.push(k); i = HS.length - 1; } return i; };
  const meta = { boxes: { c: [], h: [], s: [] }, outlines: { c: [], h: [], s: [], tri_end: [] } }, byCls = {};
  const bp = [], bi = [], inst = { t: [], r: [], s: [] }; let btop = -Infinity;
  if (cityB && l >= P.block_level) {
    const all = l > P.block_level;
    for (const b of cityB) { const H = HT[b.id]; if (!H) continue; const xy0 = toXY(b.rings[0].slice(0, -1), b.c, mLon, mLat), A = Math.abs(area2(xy0));
      if (A < P.min_area_m2) continue; if (!all && A < P.big_area_m2 && H.h < P.big_height_m) continue;
      // an oriented box where it fills the outline well (most houses) or the building is small, else the simplified outline
      const bx = obbBox(xy0); let xy = null;
      if (bx && (!all || A < P.outline_min_m2 || A / Math.abs(area2(bx)) >= P.box_fill)) xy = bx; else xy = simplify(xy0, P.simplify_m);
      if (!xy || xy.length < 3) continue; if (area2(xy) < 0) xy = xy.slice().reverse();
      const ll = xy.map(([x, y]) => [b.c[0] + x / mLon, b.c[1] + y / mLat]), gs = ll.map(([lo, la]) => demAt(lo, la)), g0 = Math.min(...gs), gm = gs.reduce((a, c) => a + c, 0) / gs.length, geoN = geoidAt(b.c[0], b.c[1]);
      const z0 = g0 - 1 + geoN, z1 = gm + H.h + geoN; btop = Math.max(btop, z1 - h0); stats.blocks++; const ci = Math.max(0, CL.indexOf(b.cls || 'osm')); byCls[CL[ci]] = (byCls[CL[ci]] || 0) + 1;
      const M = xy === bx ? meta.boxes : meta.outlines; M.c.push(ci); M.h.push(Math.round(H.h * 10)); M.s.push(hsi(H.src));
      if (xy === bx) {   // one instance of the unit box (EXT_mesh_gpu_instancing): centre of the base, turn about up, size
        const f = bx.frame, cl = [b.c[0] + (f.cx * f.c - f.cy * f.s) / mLon, b.c[1] + (f.cx * f.s + f.cy * f.c) / mLat], t = Y(F.toEnu(cl[0], cl[1], z0)), th = Math.atan2(f.s, f.c);
        inst.t.push(...t); inst.r.push(0, Math.sin(th / 2), 0, Math.cos(th / 2)); inst.s.push(Math.max(0.5, f.len), z1 - z0, Math.max(0.5, f.wid)); continue; }
      const v0 = bp.length / 3, m = ll.length;
      for (const q of ll) bp.push(...Y(F.toEnu(q[0], q[1], z0))); for (const q of ll) bp.push(...Y(F.toEnu(q[0], q[1], z1)));
      for (let q = 0; q < m; q++) { const q1 = (q + 1) % m; bi.push(v0 + q, v0 + q1, v0 + m + q, v0 + m + q, v0 + q1, v0 + m + q1); }
      const tri = earcut(xy.flat()); for (let q = 0; q < tri.length; q += 3) bi.push(v0 + m + tri[q], v0 + m + tri[q + 1], v0 + m + tri[q + 2]);
      meta.outlines.tri_end.push(bi.length / 3);
    }
  }
  const prims = [{ name: 'ground', pos, uv, nrm, idx, strip, jpg }]; if (bi.length) prims.push({ name: 'blocks', pos: bp, idx: bi, colour: P.colours.block });
  const extras = stats.blocks ? { blocks: { classes: CL, height_sources: HS, ...meta, note: 'per block: class index, height in decimetres, height-source index; boxes in instance order; outlines with the end of their triangles (exclusive)' } } : null;
  const bytes = writeGlb(prims, P.credit, inst.t.length ? { ...inst, colour: P.colours.block } : null, extras);
  const top = Math.max(zmax, isFinite(btop) ? btop + h0 : -Infinity);
  return { bytes, F, h0, region: [w * D2R, s * D2R, e * D2R, n * D2R, Math.floor(zmin - skirt), Math.ceil(top + 2)], stats: { key: cell.key, level: l, bytes: bytes.length, triangles: 2 * G * G + (idx.length + bi.length) / 3 + inst.t.length / 3 * 10, blocks: stats.blocks, blocks_by_class: byCls, boxes: inst.t.length / 3, roads_m: Math.round(stats.roads_m), rail_m: Math.round(stats.rail_m), river_m: Math.round(stats.river_m), rivers: [...stats.rivers].sort(), roads: [...stats.roads].sort().slice(0, 12) } };
}

// ---------- glTF writer with KHR_mesh_quantization: one node (translation + scale dequantize int16 positions)
export function writeGlb(prims, copyright, inst = null, extras = null) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) for (let i = 0; i < p.pos.length; i++) { mn[i % 3] = Math.min(mn[i % 3], p.pos[i]); mx[i % 3] = Math.max(mx[i % 3], p.pos[i]); }
  // one uniform scale (so that normals keep their direction under the node's dequantization transform in any viewer)
  const t = mn.map((v, i) => (v + mx[i]) / 2), s1 = Math.max(1e-3, ...mn.map((v, i) => (mx[i] - v) / 2 / 32767)), sc = [s1, s1, s1];
  const json = { asset: { version: '2.0', generator: 'cwplans build-place-tiles.mjs (place-lod)', copyright }, extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'],
    ...(extras ? { extras } : {}), scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: t, scale: sc }], meshes: [{ primitives: [] }], materials: [], buffers: [], bufferViews: [], accessors: [] };
  const chunks = []; let off = 0;
  const view = (buf, target, stride) => { const pad = (4 - (buf.length % 4)) % 4; json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(stride ? { byteStride: stride } : {}), ...(target ? { target } : {}) }); chunks.push(buf, Buffer.alloc(pad)); off += buf.length + pad; return json.bufferViews.length - 1; };
  for (const p of prims) {
    const nv = p.pos.length / 3, q = new Int16Array(nv * 4), qmn = [32767, 32767, 32767], qmx = [-32767, -32767, -32767];
    for (let v = 0; v < nv; v++) for (let c = 0; c < 3; c++) { const x = Math.max(-32767, Math.min(32767, Math.round((p.pos[3 * v + c] - t[c]) / sc[c]))); q[4 * v + c] = x; qmn[c] = Math.min(qmn[c], x); qmx[c] = Math.max(qmx[c], x); }
    json.accessors.push({ bufferView: view(Buffer.from(q.buffer), 34962, 8), componentType: 5122, count: nv, type: 'VEC3', min: qmn, max: qmx });
    const attributes = { POSITION: json.accessors.length - 1 };
    if (p.nrm) { const q8 = new Int8Array(nv * 4); for (let v = 0; v < nv; v++) for (let c = 0; c < 3; c++) q8[4 * v + c] = Math.round(Math.max(-1, Math.min(1, p.nrm[3 * v + c])) * 127);
      json.accessors.push({ bufferView: view(Buffer.from(q8.buffer), 34962, 4), componentType: 5120, normalized: true, count: nv, type: 'VEC3' }); attributes.NORMAL = json.accessors.length - 1; }
    if (p.uv) { const u = new Uint16Array(p.uv.length); for (let i = 0; i < p.uv.length; i++) u[i] = Math.round(Math.max(0, Math.min(1, p.uv[i])) * 65535);
      json.accessors.push({ bufferView: view(Buffer.from(u.buffer), 34962, 4), componentType: 5123, normalized: true, count: nv, type: 'VEC2' }); attributes.TEXCOORD_0 = json.accessors.length - 1; }
    const big = nv > 65535, IX = a => big ? new Uint32Array(a) : new Uint16Array(a);
    if (p.strip) { const ix = IX(p.strip); json.accessors.push({ bufferView: view(Buffer.from(ix.buffer), 34963), componentType: big ? 5125 : 5123, count: p.strip.length, type: 'SCALAR' }); p.stripAcc = json.accessors.length - 1; }
    const ix = IX(p.idx);
    json.accessors.push({ bufferView: view(Buffer.from(ix.buffer), 34963), componentType: big ? 5125 : 5123, count: p.idx.length, type: 'SCALAR' });
    const mat = { name: p.name, pbrMetallicRoughness: { baseColorFactor: p.colour ? [...[1, 3, 5].map(i => (parseInt(p.colour.slice(i, i + 2), 16) / 255) ** 2.2), 1] : [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } };
    if (p.jpg) { json.images ||= []; json.textures ||= []; json.samplers ||= [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }];
      json.images.push({ bufferView: view(p.jpg), mimeType: 'image/jpeg' }); json.textures.push({ sampler: 0, source: json.images.length - 1 }); mat.pbrMetallicRoughness.baseColorTexture = { index: json.textures.length - 1 }; }
    json.materials.push(mat);
    if (p.strip) json.meshes[0].primitives.push({ attributes, indices: p.stripAcc, material: json.materials.length - 1, mode: 5 });   // TRIANGLE_STRIP
    json.meshes[0].primitives.push({ attributes, indices: json.accessors.length - 1, material: json.materials.length - 1, mode: 4 });
  }
  if (inst) {   // the unit box (x and z -0.5 .. 0.5, y 0 .. 1; walls and top), drawn once per instance: node 1, mesh 1
    const bx = new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 1, -0.5, 0.5, 1, -0.5, 0.5, 1, 0.5, -0.5, 1, 0.5]);
    const bxi = new Uint16Array([0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 6, 2, 6, 3, 3, 6, 7, 3, 7, 0, 0, 7, 4, 4, 7, 5, 5, 7, 6]);
    json.accessors.push({ bufferView: view(Buffer.from(bx.buffer), 34962), componentType: 5126, count: 8, type: 'VEC3', min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] }); const pa = json.accessors.length - 1;
    json.accessors.push({ bufferView: view(Buffer.from(bxi.buffer), 34963), componentType: 5123, count: 30, type: 'SCALAR' }); const ia = json.accessors.length - 1;
    json.materials.push({ name: 'boxes', pbrMetallicRoughness: { baseColorFactor: [...[1, 3, 5].map(i => (parseInt(inst.colour.slice(i, i + 2), 16) / 255) ** 2.2), 1], metallicFactor: 0, roughnessFactor: 1 } });
    json.meshes.push({ primitives: [{ attributes: { POSITION: pa }, indices: ia, material: json.materials.length - 1, mode: 4 }] });
    const acc = (arr, type) => { json.accessors.push({ bufferView: view(Buffer.from(new Float32Array(arr).buffer)), componentType: 5126, count: arr.length / (type === 'VEC4' ? 4 : 3), type }); return json.accessors.length - 1; };
    json.nodes.push({ mesh: 1, extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: acc(inst.t, 'VEC3'), ROTATION: acc(inst.r, 'VEC4'), SCALE: acc(inst.s, 'VEC3') } } } });
    json.scenes[0].nodes.push(1); json.extensionsUsed.push('EXT_mesh_gpu_instancing'); json.extensionsRequired.push('EXT_mesh_gpu_instancing');
  }
  const bin = Buffer.concat(chunks); json.buffers.push({ byteLength: bin.length });
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const hdr = Buffer.alloc(12); hdr.writeUInt32LE(0x46546c67, 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (b, ty) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.writeUInt32LE(ty, 4); return [h, b]; };
  return Buffer.concat([hdr, ...ch(js, 0x4e4f534a), ...ch(bin, 0x004e4942)]);
}

// ---------- 4 x 4 matrices (column-major, as 3D Tiles `transform`): the transform of a child relative to its parent
export function mul4(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
export function inv4rigid(m) {   // inverse of a rotation + translation
  const R = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]], t = [m[12], m[13], m[14]];
  const o = [R[0], R[3], R[6], 0, R[1], R[4], R[7], 0, R[2], R[5], R[8], 0, 0, 0, 0, 1];
  o[12] = -(o[0] * t[0] + o[4] * t[1] + o[8] * t[2]); o[13] = -(o[1] * t[0] + o[5] * t[1] + o[9] * t[2]); o[14] = -(o[2] * t[0] + o[6] * t[1] + o[10] * t[2]); return o;
}
export const roundM = m => m.map(v => Math.abs(v) < 1e-12 ? 0 : +v.toPrecision(15));
export { meet, simplify, obbBox, area2 };   // (also used by place-blocks.mjs)
