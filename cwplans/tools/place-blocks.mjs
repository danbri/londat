// A place of kind "blocks" (cwplans/tools/build-place-tiles.mjs imports this; first use Greater London, region config
// docklands/geo/regions/london.js; skill docklands-3d-page, "Three.js port: Greater London as blocks (2026-10-22)"): the
// buildings of a boundary polygon as flat-topped blocks by level of detail, with no core and no ground of their own (the
// globe's terrain and imagery stay; the blocks stand on the globe's own heights). Pure functions over their inputs (no
// clock, no network):
//   blockSelector(opt)     Overture buildings rows -> the OSM buildings inside the boundary and outside the excluded model
//                          box (drawn), and the height values of the other records (open licence, by dataset)
//   blockTree(opt)         the quadtree: top cells over the extent, every cell with buildings refined to the leaf level
//                          (a cell with no building has no tile; REPLACE refinement)
//   blockTile(opt)         one glTF tile: oriented boxes (EXT_mesh_gpu_instancing of one unit box), simplified outlines,
//                          named buildings with their feature id (EXT_mesh_features), and at the coarse levels one merged
//                          box per square for the small buildings; glb extras.blocks for the block card
//   worldBaseGround(...)   the globe's height tiles (cwplans/docklands/data/world-base/dem) as a sampler: the deepest
//                          level that has a tile at the point, bilinear in its 35 x 35 grid (as docklands/globe/base-tiles.js)
// Tiles hold geometry and attributes only (Architecture rule 6): no texture, no baked light; the page lights the blocks
// with the sun of its clock as every other block.
import earcut from 'earcut';
import { enuFrame, D2R } from '../../docklands/geo/ellipsoid.js';
import { simplify, obbBox, area2 } from './place-lod.mjs';

const r7 = v => Math.round(v * 1e7) / 1e7;
export const cellBox = (l, x, y) => { const cs = 180 / 2 ** l; return [-180 + x * cs, -90 + y * cs, -180 + (x + 1) * cs, -90 + (y + 1) * cs]; };
export const cellKey = (l, lon, lat) => { const cs = 180 / 2 ** l; return `${l}-${Math.floor((lon + 180) / cs)}-${Math.floor((lat + 90) / cs)}`; };
const polys = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const open = r => (r.length > 1 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? r.slice(0, -1) : r);
export const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const vmean = r => { let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length]; };
// area in m2 of a lon/lat ring (flat approximation at its own latitude)
export const ringAreaM2 = r => { const mLon = 111320 * Math.cos(r[0][1] * D2R), mLat = 110574; let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * mLon * (r[j][1] + r[i][1]) * mLat; return Math.abs(a / 2); };

// ---------- selection (operation place-select-blocks)
// opt: { inBoundary(lon, lat), excluded(lon, lat) (the model draws it), geometrySources (['OpenStreetMap']), licences,
// heightLabels: { dataset -> label } (the footprint height classes of place-heights: 'ms' for Microsoft, else 'overture') }
export function blockSelector(opt) {
  const counts = {}, inc = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };
  const buildings = [], fp = {};
  const srcOf = (r, prop) => { const x = r.sources.find(q => q.property === '/properties/' + prop) || r.sources.find(q => !q.property) || r.sources[0]; return x ? [x.dataset, x.license || ''] : [null, null]; };
  function add(r) {
    inc('records');
    const P = polys(r.geometry); if (!P.length) { inc('records without a polygon'); return; }
    const rings = P[0].map(ring => ring.map(([x, y]) => [r7(x), r7(y)])), ring = open(rings[0]); if (ring.length < 3) { inc('records with a degenerate outline'); return; }
    const base = r.sources.find(q => !q.property) || r.sources[0] || {}, gsrc = base.dataset, c = vmean(ring);
    const inside = opt.inBoundary(c[0], c[1]);
    if ((opt.geometrySources || ['OpenStreetMap']).includes(gsrc)) {
      if (!inside) inc('OSM buildings outside the boundary');
      else if (opt.excluded(c[0], c[1])) inc('OSM buildings in the model box (drawn by the model)');
      else {
        const b = { id: r.id, osm: (base.record_id || '').replace(/@.*/, '') || null, name: r.names_primary || null, kind: r.class || 'yes', rings, c: [r7(c[0]), r7(c[1])], a: Math.round(ringAreaM2(ring) * 10) / 10 };
        if (r.height != null && srcOf(r, 'height')[0] === 'OpenStreetMap') b.height = r.height;
        if (r.num_floors != null && srcOf(r, 'num_floors')[0] === 'OpenStreetMap') b.levels = r.num_floors;
        if (r.min_height != null && srcOf(r, 'min_height')[0] === 'OpenStreetMap') b.min_height = r.min_height;
        buildings.push(b); inc('OSM buildings selected');
      }
    } else inc(`not drawn (geometry from ${gsrc})`);
    // the record's own height values (whatever its geometry source): heights only, open licence, not OSM (OSM values are
    // read above), grouped by the label of their dataset; only records in the boundary (a match needs an OSM outline there)
    if (!inside) return;
    const o = { id: r.id, ring: rings[0] }; let lab = null;
    for (const [k, prop] of [['height', 'height'], ['floors', 'num_floors']]) { const v = r[prop]; if (v == null) continue; const sv = srcOf(r, prop);
      if (sv[0] === 'OpenStreetMap') continue;
      if (!opt.licences.includes(sv[1])) { inc(`${prop} from ${sv[0]} (licence "${sv[1]}") skipped`); continue; }
      o[k] = v; lab = opt.heightLabels[sv[0]] || 'overture'; inc(`${prop} from ${sv[0]} (${sv[1]}) kept as ${lab}`); }
    if (lab) (fp[lab] ||= []).push(o);
  }
  return { add, done: () => { buildings.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0); return { buildings, fp, counts }; } };
}

// ---------- the globe's ground: world-base height tiles (35 x 35 Int16, metres above the geoid, row 0 north, y of the
// quadtree from the north), the deepest level with a tile at the point
export function worldBaseGround(M, readTile) {
  const avail = {}; for (const [L, a] of Object.entries(M.dem.tiles)) { const s = new Set(); for (let i = 0; i < a.length; i += 2) s.add(a[i] + ',' + a[i + 1]); avail[L] = s; }
  const levels = Object.keys(avail).map(Number).sort((a, b) => b - a), cache = new Map(), used = new Set(), G = M.dem.grid || 35;
  const tile = (L, x, y) => { const k = `${L}/${x}/${y}`; let t = cache.get(k); if (!t) { t = readTile(L, x, y); cache.set(k, t); used.add(k); } return t; };
  const at = (lon, lat) => {
    for (const L of levels) { const s = 180 / 2 ** L, x = Math.floor((lon + 180) / s), y = Math.floor((90 - lat) / s); if (!avail[L].has(x + ',' + y)) continue;
      const h = tile(L, x, y), w = -180 + x * s, n = 90 - y * s, d = s / (G - 3), fx = Math.max(0, Math.min(G - 1.001, (lon - w) / d + 1)), fy = Math.max(0, Math.min(G - 1.001, (n - lat) / d + 1));
      const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, o = j * G + i;
      return (h[o] * (1 - u) + h[o + 1] * u) * (1 - v) + (h[o + G] * (1 - u) + h[o + G + 1] * u) * v; }
    return 0;
  };
  return { at, used };
}

// ---------- the tree: every leaf cell holding a building, and its ancestors to the top level
export function blockTree({ buildings, top, leaf }) {
  const nodes = new Map();
  const get = (l, x, y) => { const k = `${l}-${x}-${y}`; let n = nodes.get(k); if (!n) { n = { l, x, y, key: k, b: cellBox(l, x, y), kids: [], items: [] }; nodes.set(k, n);
    if (l > top) { const p = get(l - 1, x >> 1, y >> 1); p.kids.push(n); } } return n; };
  buildings.forEach((b, i) => { const cs = 180 / 2 ** leaf, x = Math.floor((b.c[0] + 180) / cs), y = Math.floor((b.c[1] + 90) / cs); get(leaf, x, y).items.push(i); });
  // each coarse cell holds the indices of every building below it
  for (let l = leaf - 1; l >= top; l--) for (const n of nodes.values()) if (n.l === l) for (const k of n.kids) for (const i of k.items) n.items.push(i);
  for (const n of nodes.values()) n.kids.sort((a, b) => a.key.localeCompare(b.key));
  const roots = [...nodes.values()].filter(n => n.l === top).sort((a, b) => a.key.localeCompare(b.key));
  return { roots, nodes };
}

// ---------- one tile
const srgbLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const linSrgb = c => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
// opt: { cell (l, x, y, key, b), items (building objects), HT (heights by id), leaf (bool), L (level params: tall_m, big_m2,
// merge_m) or the leaf params (min_area_m2, simplify_m, box_fill, outline_min_m2, drop_m), groundAt (orthometric), geoidAt,
// named (Map id -> feature row), classes, colour (hex), credit }
export function blockTile(opt) {
  const { cell, items, HT, groundAt, geoidAt, P } = opt, [w, s, e, n] = cell.b, lc0 = (w + e) / 2, bc = (s + n) / 2;
  const mLon = 111320 * Math.cos(bc * D2R), mLat = 110574, ell = (lon, lat) => groundAt(lon, lat) + geoidAt(lon, lat);
  const h0 = Math.round(ell(lc0, bc) * 100) / 100, F = enuFrame({ lon: lc0, lat: bc, h: h0 }), Y = ([E, N, U]) => [E, U, -N];
  const HS = [], hsi = k => { let i = HS.indexOf(k); if (i < 0) { HS.push(k); i = HS.length - 1; } return i; };
  const meta = { boxes: { c: [], h: [], s: [] }, outlines: { c: [], h: [], s: [], tri_end: [] } };
  const inst = { t: [], r: [], s: [] }, ol = { pos: [], idx: [] }, nm = { pos: [], col: [], fid: [], idx: [] };
  let zmin = Infinity, zmax = -Infinity; const st = { boxes: 0, outlines: 0, named: 0, merged: 0, merged_buildings: 0, small_skipped: 0 };
  const toXY = (r, ref) => r.map(([lo, la]) => [(lo - ref[0]) * mLon, (la - ref[1]) * mLat]);
  const toLL = ([x, y], ref) => [ref[0] + x / mLon, ref[1] + y / mLat];
  // a box: base centre (lon, lat), turn about up (radians from east), length along that turn, width, ground samples
  function box(ll, th, len, wid, hgt, cls, src, gs) {
    const g0 = Math.min(...gs), gm = gs.reduce((a, c) => a + c, 0) / gs.length, N = geoidAt(ll[0], ll[1]), z0 = g0 - P.drop_m + N, z1 = gm + hgt + N;
    const t = Y(F.toEnu(ll[0], ll[1], z0)); inst.t.push(t[0], t[1], t[2]);
    // the unit box turned about glTF y (up): a turn of th from east (x) toward north (-z) is +th about y; boxes are symmetric
    // under a half turn, so th/2 in [0, pi/2): both quaternion parts >= 0 (normalized int8: 1/127 steps, under 1 degree)
    let a = th % Math.PI; if (a < 0) a += Math.PI; inst.r.push(0, Math.round(Math.sin(a / 2) * 127), 0, Math.round(Math.cos(a / 2) * 127));
    inst.s.push(Math.max(0.5, len), z1 - z0, Math.max(0.5, wid)); zmin = Math.min(zmin, z0); zmax = Math.max(zmax, z1);
    meta.boxes.c.push(cls); meta.boxes.h.push(Math.round(hgt * 10)); meta.boxes.s.push(hsi(src)); if (cls === 0) st.boxes++;
  }
  // an oriented box of a footprint (xy in metres round ref)
  function obbOf(xy, ref, hgt, cls, src) {
    const bx = obbBox(xy); if (!bx) return false; const f = bx.frame;
    const cl = toLL([f.cx * f.c - f.cy * f.s, f.cx * f.s + f.cy * f.c], ref), gs = bx.map(p => groundAt(...toLL(p, ref)));
    box(cl, Math.atan2(f.s, f.c), f.len, f.wid, hgt, cls, src, gs); return true;
  }
  // an extruded outline (rings in metres round ref; walls of every ring, a flat top by earcut): into ol or nm
  function prism(T, rings, ref, hgt, colW, colR, fid) {
    const ll = rings.map(r => r.map(p => toLL(p, ref))), gs = ll[0].map(([lo, la]) => groundAt(lo, la)), g0 = Math.min(...gs), gm = gs.reduce((a, c) => a + c, 0) / gs.length;
    const N = geoidAt(ref[0], ref[1]), z0 = g0 - P.drop_m + N, z1 = gm + hgt + N; zmin = Math.min(zmin, z0); zmax = Math.max(zmax, z1);
    const vtx = (q, z, col) => { const p = Y(F.toEnu(q[0], q[1], z)); T.pos.push(p[0], p[1], p[2]); if (col) { T.col.push(col[0], col[1], col[2], 255); T.fid.push(fid); } return T.pos.length / 3 - 1; };
    for (const r of ll) { const lo = r.map(q => vtx(q, z0, colW)), hi = r.map(q => vtx(q, z1, colW)), m = r.length;
      for (let k = 0; k < m; k++) { const k1 = (k + 1) % m; T.idx.push(lo[k], lo[k1], hi[k], hi[k], lo[k1], hi[k1]); } }
    const flat = [], holes = [], top = []; rings.forEach((r, k) => { if (k) holes.push(flat.length / 2); for (const p of r) flat.push(p[0], p[1]); });
    for (const r of ll) for (const q of r) top.push(vtx(q, z1, colR));
    const tri = earcut(flat, holes.length ? holes : null); for (let k = 0; k < tri.length; k += 3) T.idx.push(top[tri[k]], top[tri[k + 1]], top[tri[k + 2]]);
    return hgt;
  }
  const ccw = xy => area2(xy) < 0 ? xy.slice().reverse() : xy;
  const blockRGB = [1, 3, 5].map(i => parseInt(opt.colour.slice(i, i + 2), 16)), roofRGB = blockRGB.map((v, i) => linSrgb(srgbLin(v) * [0.82, 0.58, 0.48][i]));
  const merged = new Map();
  for (const b of items) {
    const H = HT[b.id]; if (!H || !(H.h > 0)) continue;
    if (b.a < P.min_area_m2) { st.small_skipped++; continue; }
    const xy0 = toXY(open(b.rings[0]), b.c);
    if (opt.leaf) {
      const row = opt.named.get(b.id);
      if (row != null) {   // a named building: its outline (and holes) at 0.5 m, its own id, wall and roof colours
        const rs = b.rings.map((r, k) => { let q = simplify(toXY(open(r), b.c), 0.5); if (q.length < 3) return null; q = area2(q) < 0 === (k === 0) ? q.slice().reverse() : q; return q; }).filter(Boolean);
        if (rs.length) { prism(nm, rs, b.c, H.h, blockRGB, roofRGB, row); st.named++; continue; }
      }
      const bx = obbBox(xy0); const fill = bx ? b.a / Math.abs(area2(bx)) : 0;
      if (bx && (b.a < P.outline_min_m2 || fill >= P.box_fill)) { obbOf(xy0, b.c, H.h, 0, H.src); continue; }
      let xy = simplify(xy0, P.simplify_m); if (xy.length < 3) { obbOf(xy0, b.c, H.h, 0, H.src); continue; } xy = ccw(xy);
      prism(ol, [xy], b.c, H.h, null, null, null); meta.outlines.c.push(0); meta.outlines.h.push(Math.round(H.h * 10)); meta.outlines.s.push(hsi(H.src)); meta.outlines.tri_end.push(ol.idx.length / 3); st.outlines++;
      continue;
    }
    // a coarse level: tall or big buildings as their own boxes, the rest merged by square
    if (H.h >= P.tall_m || b.a >= P.big_m2) { obbOf(xy0, b.c, H.h, 0, H.src); continue; }
    const E = (b.c[0] - w) * mLon, Nn = (b.c[1] - s) * mLat, k = Math.floor(E / P.merge_m) + ',' + Math.floor(Nn / P.merge_m);
    const q = merged.get(k) || merged.set(k, { a: 0, x: 0, y: 0, h: 0, n: 0 }).get(k); q.a += b.a; q.x += b.a * b.c[0]; q.y += b.a * b.c[1]; q.h += b.a * H.h; q.n++;
  }
  // one box per square: its footprint the summed area (at most the square), at the area-weighted centre and mean height
  for (const q of [...merged.values()].sort((a, b) => a.x / a.a - b.x / b.a || a.y / a.a - b.y / b.a)) {
    const ll = [q.x / q.a, q.y / q.a], side = Math.min(P.merge_m, Math.sqrt(q.a)), hgt = q.h / q.a, d = side / 2;
    const gs = [[-d, -d], [d, -d], [d, d], [-d, d]].map(p => groundAt(...toLL(p, ll)));
    box(ll, 0, side, side, hgt, 1, `merged: area-weighted mean height of the buildings of a ${P.merge_m} m square`, gs); st.merged++; st.merged_buildings += q.n;
  }
  const extras = meta.boxes.c.length + meta.outlines.c.length ? { blocks: { classes: opt.classes, height_sources: HS, ...meta, note: 'per block: class index, height in decimetres, height-source index; boxes in instance order; outlines with the end of their triangles (exclusive)' } } : null;
  const bytes = blocksGlb({ ol, nm, inst, colour: opt.colour, credit: opt.credit, extras, featureCount: new Set(nm.fid).size });
  const tris = ol.idx.length / 3 + nm.idx.length / 3 + inst.t.length / 3 * 10;
  return { bytes, F, region: [w * D2R, s * D2R, e * D2R, n * D2R, Math.floor(isFinite(zmin) ? zmin : h0 - 10), Math.ceil(isFinite(zmax) ? zmax : h0) + 1],
    stats: { key: cell.key, level: cell.l, bytes: bytes.length, triangles: tris, blocks: st.boxes + st.outlines + st.merged + st.named, ...st, buildings: items.length } };
}

// ---------- glTF 2.0 writer for block tiles: node 0 (if any) the outlines and named buildings, int16 positions
// (KHR_mesh_quantization, one uniform node scale), named with COLOR_0 (u8) and _FEATURE_ID_0 (float, EXT_mesh_features);
// node 1 (or 0) the unit box (walls and top) instanced (EXT_mesh_gpu_instancing: float translation and scale, int8
// normalized rotation). No normals: readers compute flat normals.
export function blocksGlb({ ol, nm, inst, colour, credit, extras, featureCount }) {
  const json = { asset: { version: '2.0', generator: 'cwplans build-place-tiles.mjs (place-blocks)', copyright: credit }, extensionsUsed: [], extensionsRequired: [], ...(extras ? { extras } : {}),
    scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], buffers: [], bufferViews: [], accessors: [] };
  const chunks = []; let off = 0;
  const view = (buf, target, stride) => { const pad = (4 - (buf.length % 4)) % 4; json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(stride ? { byteStride: stride } : {}), ...(target ? { target } : {}) }); chunks.push(buf, Buffer.alloc(pad)); off += buf.length + pad; return json.bufferViews.length - 1; };
  const lin = hex => [...[1, 3, 5].map(i => (parseInt(hex.slice(i, i + 2), 16) / 255) ** 2.2), 1];
  const mat = (name, c) => { json.materials.push({ name, pbrMetallicRoughness: { baseColorFactor: c, metallicFactor: 0, roughnessFactor: 1 } }); return json.materials.length - 1; };
  const parts = [ol, nm].filter(p => p.idx.length);
  if (parts.length) {
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of parts) for (let i = 0; i < p.pos.length; i++) { mn[i % 3] = Math.min(mn[i % 3], p.pos[i]); mx[i % 3] = Math.max(mx[i % 3], p.pos[i]); }
    const t = mn.map((v, i) => (v + mx[i]) / 2), s1 = Math.max(1e-3, ...mn.map((v, i) => (mx[i] - v) / 2 / 32767));
    json.extensionsUsed.push('KHR_mesh_quantization'); json.extensionsRequired.push('KHR_mesh_quantization');
    const prims = [];
    for (const p of parts) {
      const nv = p.pos.length / 3, q = new Int16Array(nv * 4), qmn = [32767, 32767, 32767], qmx = [-32767, -32767, -32767];
      for (let v = 0; v < nv; v++) for (let c = 0; c < 3; c++) { const x = Math.max(-32767, Math.min(32767, Math.round((p.pos[3 * v + c] - t[c]) / s1))); q[4 * v + c] = x; qmn[c] = Math.min(qmn[c], x); qmx[c] = Math.max(qmx[c], x); }
      json.accessors.push({ bufferView: view(Buffer.from(q.buffer), 34962, 8), componentType: 5122, count: nv, type: 'VEC3', min: qmn, max: qmx }); const attributes = { POSITION: json.accessors.length - 1 };
      if (p === nm) {
        json.accessors.push({ bufferView: view(Buffer.from(new Uint8Array(p.col).buffer), 34962, 4), componentType: 5121, normalized: true, count: nv, type: 'VEC4' }); attributes.COLOR_0 = json.accessors.length - 1;
        json.accessors.push({ bufferView: view(Buffer.from(new Float32Array(p.fid).buffer), 34962, 4), componentType: 5126, count: nv, type: 'SCALAR' }); attributes._FEATURE_ID_0 = json.accessors.length - 1;
      }
      const big = nv > 65535, ix = big ? new Uint32Array(p.idx) : new Uint16Array(p.idx);
      json.accessors.push({ bufferView: view(Buffer.from(ix.buffer), 34963), componentType: big ? 5125 : 5123, count: p.idx.length, type: 'SCALAR' });
      const prim = { attributes, indices: json.accessors.length - 1, material: p === nm ? mat('named buildings', [1, 1, 1, 1]) : mat('blocks', lin(colour)), mode: 4 };
      if (p === nm) { prim.extensions = { EXT_mesh_features: { featureIds: [{ featureCount: Math.max(1, featureCount), attribute: 0, label: 'osm' }] } }; if (!json.extensionsUsed.includes('EXT_mesh_features')) json.extensionsUsed.push('EXT_mesh_features'); }
      prims.push(prim);
    }
    json.meshes.push({ primitives: prims }); json.nodes.push({ mesh: json.meshes.length - 1, translation: t, scale: [s1, s1, s1] }); json.scenes[0].nodes.push(json.nodes.length - 1);
  }
  if (inst.t.length) {   // the unit box (x and z -0.5 .. 0.5, y 0 .. 1; walls and top)
    const bx = new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 1, -0.5, 0.5, 1, -0.5, 0.5, 1, 0.5, -0.5, 1, 0.5]);
    const bxi = new Uint16Array([0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 6, 2, 6, 3, 3, 6, 7, 3, 7, 0, 0, 7, 4, 4, 7, 5, 5, 7, 6]);
    json.accessors.push({ bufferView: view(Buffer.from(bx.buffer), 34962), componentType: 5126, count: 8, type: 'VEC3', min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] }); const pa = json.accessors.length - 1;
    json.accessors.push({ bufferView: view(Buffer.from(bxi.buffer), 34963), componentType: 5123, count: 30, type: 'SCALAR' }); const ia = json.accessors.length - 1;
    json.meshes.push({ primitives: [{ attributes: { POSITION: pa }, indices: ia, material: mat('boxes', lin(colour)), mode: 4 }] });
    const k = inst.t.length / 3;
    json.accessors.push({ bufferView: view(Buffer.from(new Float32Array(inst.t).buffer)), componentType: 5126, count: k, type: 'VEC3' }); const at = json.accessors.length - 1;
    json.accessors.push({ bufferView: view(Buffer.from(new Int8Array(inst.r).buffer)), componentType: 5120, normalized: true, count: k, type: 'VEC4' }); const ar = json.accessors.length - 1;
    json.accessors.push({ bufferView: view(Buffer.from(new Float32Array(inst.s).buffer)), componentType: 5126, count: k, type: 'VEC3' }); const as = json.accessors.length - 1;
    json.nodes.push({ mesh: json.meshes.length - 1, extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: at, ROTATION: ar, SCALE: as } } } }); json.scenes[0].nodes.push(json.nodes.length - 1);
    json.extensionsUsed.push('EXT_mesh_gpu_instancing'); json.extensionsRequired.push('EXT_mesh_gpu_instancing');
  }
  if (!json.extensionsUsed.length) delete json.extensionsUsed; if (!json.extensionsRequired.length) delete json.extensionsRequired;
  const bin = Buffer.concat(chunks); json.buffers.push({ byteLength: bin.length });
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const hdr = Buffer.alloc(12); hdr.writeUInt32LE(0x46546c67, 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (b, ty) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.writeUInt32LE(ty, 4); return [h, b]; };
  return Buffer.concat([hdr, ...ch(js, 0x4e4f534a), ...ch(bin, 0x004e4942)]);
}
