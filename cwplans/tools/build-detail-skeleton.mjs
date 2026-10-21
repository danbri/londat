#!/usr/bin/env node
// Detail skeletons for the globe of the Three.js port (OKR KR2.2, KR2.7; owner, 2026-10-20: "improved worldwide coverage so
// that our detailed city testbeds are not lost in the void"): vector sets in the UK skeleton's format (skeleton-1, read by
// docklands/geo/skeleton.js and drawn by docklands/globe/skeleton-layers.js), cut by the geodetic quadtree:
//  - set "world" (cwplans/docklands/data/world-detail/): Natural Earth 1:10m roads, railways, rivers (with the European
//    supplement), lakes (with the European supplement) and urban areas, and the GeoNames towns of 15,000 people or more
//    (cities15000), worldwide; roads, railways and rivers are left out where a finer set draws them (the UK skeleton and
//    the regional sets below), so that no road is drawn twice.
//  - one regional set per testbed region (REGION_SETS: the Geofabrik extracts and the Natural Earth admin units it covers):
//    OpenStreetMap motorways, trunk and primary roads, railways, rivers and named towns and villages, with a gazetteer.
//
//   node cwplans/tools/build-detail-skeleton.mjs fetch --set world|leon|sarajevo
//   node cwplans/tools/build-detail-skeleton.mjs build --set world|leon|sarajevo
//
// Levels (files, cells of 180 / 2^level degrees, y counted from the SOUTH as the UK skeleton): the reader's levels 3, 6, 8
// (skeleton-layers.js picks 3 above 800 km eye height, 6 to 120 km, 8 below). The world set has file levels 3 and 5 (a
// level-5 file serves the level 6 and 8 views: far fewer files), its lines cut at the edges of level-6 cells (in level-3
// files) and level-8 cells (in level-5 files), so that the globe's view cells (one line piece belongs to the view cell
// that holds the middle of its bbox) never miss a piece. Regional sets: files at 3, 6 and 8, lines cut at their own level.
// Sources (data register keys natural-earth, geonames, osm): Natural Earth 5.1.2 (public domain); GeoNames cities15000
// (CC BY 4.0); OpenStreetMap through Geofabrik extracts (ODbL 1.0; allowed by the owner, 2026-10-03). No locale constant
// in the code beyond the table of regional sets (region config id -> extracts and covered admin units).
// Dataflow (skill cwplans-dataflow): one operation per set (detail-skeleton-<set>) over the hashed raw files; log.json
// in the set's folder. Method and rules: cwplans/pipeline.json build-detail-skeleton.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, rmSync, createReadStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { cellOf, cellSize, fold, gazKey, pointInGeometry, distanceM } from '../../docklands/geo/skeleton.js';
import REGIONS from '../../docklands/geo/regions/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SET = arg('--set', 'world'), RAW = join(ROOT, 'data/raw/detail-skeleton'), DATA = join(ROOT, 'cwplans/docklands/data');
const UA = { 'User-Agent': 'londat-cwplans/0.1 (+https://github.com/danbri/londat)' };
const sha = b => createHash('sha256').update(b).digest('hex');
const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/';
const NE_FILES = ['ne_10m_roads', 'ne_10m_railroads', 'ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe', 'ne_10m_lakes', 'ne_10m_lakes_europe', 'ne_10m_urban_areas'];
const GEONAMES = 'https://download.geonames.org/export/dump/cities15000.zip';
const GEOFABRIK = 'https://download.geofabrik.de/';
// regional sets: by region config id (docklands/geo/regions/); cover: Natural Earth admin-1 ISO codes or admin-0 codes
export const REGION_SETS = {
  leon: { id: 'es-nw', out: 'es-nw', name: 'Spain, north-west: regional skeleton', extracts: ['europe/spain/castilla-y-leon', 'europe/spain/galicia', 'europe/spain/asturias', 'europe/spain/cantabria'],
    cover: { admin1: ['ES-LE', 'ES-ZA', 'ES-SA', 'ES-AV', 'ES-SG', 'ES-SO', 'ES-BU', 'ES-P', 'ES-VA', 'ES-C', 'ES-LU', 'ES-OR', 'ES-PO', 'ES-O', 'ES-S'] }, about: 'Castilla y León, Galicia, Asturias and Cantabria' },
  sarajevo: { id: 'ba', out: 'ba', name: 'Bosnia and Herzegovina: regional skeleton', extracts: ['europe/bosnia-herzegovina'], cover: { admin0: ['BIH'] }, about: 'Bosnia and Herzegovina' },
};
// the finer sets that already draw roads, railways and rivers (the world set leaves these areas to them)
const FINER = [{ admin0: ['GBR'] }, ...Object.values(REGION_SETS).map(s => s.cover)];
const Q = 10000;
// the world set's dense layers (all main roads, railways, urban areas) only within NEAR_KM of a testbed (the region
// configs named by --near); elsewhere the major roads of level 3. Size: worldwide they were 16 MB of the 26 MB.
const NEAR_KM = +arg('--near-km', 3000), NEAR = arg('--near', 'docklands,leon,sarajevo').split(',').map(id => REGIONS[id].origin);
const near = p => NEAR.some(o => distanceM([o.lon, o.lat], p) <= NEAR_KM * 1000);

async function download(url, file) {
  if (existsSync(file)) return;
  mkdirSync(dirname(file), { recursive: true });
  const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(url + ' ' + r.status);
  const b = Buffer.from(await r.arrayBuffer()); writeFileSync(file, b);
  const L = existsSync(join(RAW, 'fetch-log.json')) ? JSON.parse(readFileSync(join(RAW, 'fetch-log.json'), 'utf8')) : {};
  L[file.slice(RAW.length + 1)] = { url, fetched: new Date().toISOString().slice(0, 10), bytes: b.length, sha256: sha(b) }; writeFileSync(join(RAW, 'fetch-log.json'), JSON.stringify(L, null, 1));
  console.log('got', url, (b.length / 1e6).toFixed(1), 'MB');
}
const flog = () => existsSync(join(RAW, 'fetch-log.json')) ? JSON.parse(readFileSync(join(RAW, 'fetch-log.json'), 'utf8')) : {};
async function fetchSet() {
  if (SET === 'world') { for (const f of NE_FILES) await download(NE_BASE + f + '.geojson', join(RAW, 'ne', f + '.geojson')); await download(GEONAMES, join(RAW, 'geonames', 'cities15000.zip')); return; }
  const S = REGION_SETS[SET]; if (!S) throw new Error('no set ' + SET);
  for (const e of S.extracts) await download(GEOFABRIK + e + '-latest.osm.pbf', join(RAW, 'osm', e.split('/').pop() + '-latest.osm.pbf'));
}

// ---------------------------------------------------------------- geometry
function dp(pts, tol) {   // Douglas-Peucker in degrees
  if (pts.length <= 2 || tol <= 0) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]], t2 = tol * tol;
  while (st.length) {
    const [a, b] = st.pop(); let md = -1, mi = -1; const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) { const [px, py] = pts[i]; let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); const ex = ax + t * dx - px, ey = ay + t * dy - py, d = ex * ex + ey * ey; if (d > md) { md = d; mi = i; } }
    if (md > t2) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// cut a line at the edges of the cells of a level: { 'x-y': [piece, ...] } (each piece in one cell)
function cutLine(pts, level) {
  const s = cellSize(level), out = {}; let cur = null, curK = null;
  const key = (x, y) => { const [cx, cy] = cellOf(level, x, y); return cx + '-' + cy; };
  const push = (k, a, b) => { if (k !== curK) { if (cur && cur.length > 1) (out[curK] ||= []).push(cur); cur = [a]; curK = k; } cur.push(b); };
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], ts = [0, 1];
    for (let g = Math.ceil(Math.min(x0, x1) / s) * s; g < Math.max(x0, x1); g += s) ts.push((g - x0) / (x1 - x0));
    for (let g = Math.ceil(Math.min(y0, y1) / s) * s; g < Math.max(y0, y1); g += s) ts.push((g - y0) / (y1 - y0));
    const T = [...new Set(ts.filter(t => t >= 0 && t <= 1))].sort((a, b) => a - b);
    for (let k = 1; k < T.length; k++) { const a = [x0 + (x1 - x0) * T[k - 1], y0 + (y1 - y0) * T[k - 1]], b = [x0 + (x1 - x0) * T[k], y0 + (y1 - y0) * T[k]];
      if (a[0] === b[0] && a[1] === b[1]) continue; push(key((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), a, b); }
  }
  if (cur && cur.length > 1) (out[curK] ||= []).push(cur);
  return out;
}
// join lines that meet end to end and share a key (fewer pieces: Natural Earth and OSM cut roads at every junction)
function mergeLines(items, keyOf) {
  const groups = new Map(); for (const it of items) { const k = keyOf(it); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  const out = [], pk = p => p[0].toFixed(6) + ',' + p[1].toFixed(6);
  for (const [, g] of groups) {
    const ends = new Map(), used = new Set(), add = (p, i) => { const k = pk(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); };
    g.forEach((it, i) => { add(it.l[0], i); add(it.l.at(-1), i); });
    const next = (p, self) => { const c = (ends.get(pk(p)) || []).filter(j => j !== self && !used.has(j)); return c.length === 1 && (ends.get(pk(p)) || []).length === 2 ? c[0] : -1; };
    for (let i = 0; i < g.length; i++) {
      if (used.has(i)) continue; used.add(i); let line = g[i].l.slice();
      for (let j = next(line.at(-1), i); j >= 0; j = next(line.at(-1), j)) { used.add(j); const m = g[j].l; line = pk(m[0]) === pk(line.at(-1)) ? line.concat(m.slice(1)) : line.concat(m.slice(0, -1).reverse()); }
      for (let j = next(line[0], i); j >= 0; j = next(line[0], j)) { used.add(j); const m = g[j].l; line = pk(m.at(-1)) === pk(line[0]) ? m.slice(0, -1).concat(line) : m.slice(1).reverse().concat(line); }
      out.push({ ...g[i], l: line });
    }
  }
  return out;
}
const bboxOf = pts => { let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity; for (const [x, y] of pts) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; } return [w, s, e, n]; };
const r4 = v => Math.round(v * Q) / Q;
const encLine = (pts, q = Q) => { const d = []; let px = 0, py = 0, first = true; for (const [lon, lat] of pts) { const x = Math.round(lon * q), y = Math.round(lat * q); if (!first && x === px && y === py) continue; d.push(first ? x : x - px, first ? y : y - py); px = x; py = y; first = false; } return d; };
const lineLenKm = pts => { let s = 0; for (let i = 1; i < pts.length; i++) { const dx = (pts[i][0] - pts[i - 1][0]) * Math.cos(pts[i][1] * Math.PI / 180), dy = pts[i][1] - pts[i - 1][1]; s += Math.hypot(dx, dy) * 111.2; } return s; };
const linesOfGeom = g => !g ? [] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
const polysOfGeom = g => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];

// ---------------------------------------------------------------- the writer: layers -> files, manifest entries
// layer: { id, title, geometry, properties, describe, sources, levels: [{ level, clip?, note, features: [{ id, properties, line | poly | point }] }] }
function writeLayers(out, layers) {
  const written = [];
  for (const L of layers) {
    for (const lv of L.levels) {
      const files = {}, q = lv.q || Q, enc = p => encLine(p, q);
      for (const f of lv.features) {
        if (f.point) { const [x, y] = cellOf(lv.level, ...f.point); (files[x + '-' + y] ||= []).push({ properties: f.properties, geometry: { type: 'Point', d: [Math.round(f.point[0] * q), Math.round(f.point[1] * q)] }, bb: [...f.point, ...f.point] }); }
        else if (f.poly) { const b = bboxOf(f.poly[0]), [x, y] = cellOf(lv.level, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2); const rings = f.poly.map(enc).filter(r => r.length >= 6); if (!rings.length) continue;
          (files[x + '-' + y] ||= []).push({ properties: f.properties, bbox: b.map(r4), geometry: { type: 'Polygon', d: rings }, bb: b }); }
        else if (f.line) { const pieces = cutLine(f.line, lv.clip ?? lv.level); let n = 0;
          for (const [, ps] of Object.entries(pieces)) for (const p of ps) { const b = bboxOf(p), [x, y] = cellOf(lv.level, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2), d = enc(p); if (d.length < 4) continue;
            (files[x + '-' + y] ||= []).push({ properties: f.properties, geometry: { type: 'LineString', d }, bb: b }); n++; } }
      }
      lv.files = Object.entries(files).sort().map(([cell, feats]) => {
        const path = `layers/${L.id}/${lv.level}/${cell}.json`, bb = feats.reduce((a, f) => [Math.min(a[0], f.bb[0]), Math.min(a[1], f.bb[1]), Math.max(a[2], f.bb[2]), Math.max(a[3], f.bb[3])], [Infinity, Infinity, -Infinity, -Infinity]);
        const s = JSON.stringify({ format: 'skeleton-1', q, features: feats.map(({ bb, ...f }) => f) }); mkdirSync(dirname(join(out, path)), { recursive: true }); writeFileSync(join(out, path), s);
        written.push({ path, sha256: sha(s), bytes: s.length });
        return { cell: cell.split('-').map(Number), path, bbox: bb.map(r4), features: feats.length, bytes: s.length };
      });
      delete lv.features;
    }
  }
  return written;
}
// gazetteer: entries [name, alt, kind, lon, lat, laIndex, id, wd, pop] filed under gazKey of each folded form
function writeGazetteer(out, entries, la, kinds, kindRank, about) {
  const files = {}, written = [];
  for (const e of entries) for (const k of new Set([e[0], e[1]].filter(Boolean).map(n => gazKey(fold(n))))) (files[k] ||= []).push(e);
  const G = { about, key: 'the first two letters or digits of the folded name (docklands/geo/skeleton.js fold, gazKey); a name is also filed under its other-language form',
    fields: ['name', 'alt', 'kind', 'lon', 'lat', 'laIndex (into la: country or region; -1 none)', 'id', 'wd (Wikidata QID)', 'population'], kinds, kindRank, files: {} };
  for (const [k, es] of Object.entries(files).sort()) { const path = `gazetteer/${[...k].map(c => /[a-z0-9_]/.test(c) ? c : 'u' + c.codePointAt(0).toString(16)).join('')}.json`,   // (ASCII file names: a key may hold ł, đ, ə)
    s = JSON.stringify({ la, entries: es }); mkdirSync(dirname(join(out, path)), { recursive: true }); writeFileSync(join(out, path), s); written.push({ path, sha256: sha(s), bytes: s.length }); G.files[k] = { path, entries: es.length, bytes: s.length }; }
  return { G, written };
}

// ---------------------------------------------------------------- the covers (Natural Earth admin units, from the world skeleton)
function wsk1Polys(file, pred) {
  const F = JSON.parse(readFileSync(join(DATA, 'world', file), 'utf8')), q = F.q, out = [];
  const dec = d => { const r = []; let x = 0, y = 0; for (let i = 0; i < d.length; i += 2) { x += d[i]; y += d[i + 1]; r.push([x / q, y / q]); } return r; };
  for (const f of F.features) if (pred(f.p)) for (const p of f.g) out.push({ type: 'Polygon', coordinates: p.map(dec) });
  return out;
}
function coverTest(covers) {
  const polys = []; for (const c of covers) { if (c.admin0) polys.push(...wsk1Polys('countries.json', p => c.admin0.includes(p.a3))); if (c.admin1) polys.push(...wsk1Polys('admin1.json', p => c.admin1.includes(p.iso))); }
  const bbs = polys.map(g => bboxOf(g.coordinates[0]));
  return (lon, lat) => polys.some((g, i) => lon >= bbs[i][0] && lon <= bbs[i][2] && lat >= bbs[i][1] && lat <= bbs[i][3] && pointInGeometry([lon, lat], g));
}

// ---------------------------------------------------------------- the world set
async function buildWorld() {
  const out = join(DATA, 'world-detail'); rmSync(join(out, 'layers'), { recursive: true, force: true }); rmSync(join(out, 'gazetteer'), { recursive: true, force: true });
  const ne = f => JSON.parse(readFileSync(join(RAW, 'ne', f + '.geojson'), 'utf8')).features;
  const finer = coverTest(FINER), mid = l => l[Math.floor(l.length / 2)];
  // roads: level 3 the major ones (scalerank <= 5), level 5 all (Natural Earth roads are the main roads of each country)
  const roads = ne('ne_10m_roads').filter(f => !/Ferry/i.test(f.properties.featurecla + ' ' + f.properties.type)).flatMap((f, i) => linesOfGeom(f.geometry).map((l, j) => ({ id: `r${i}-${j}`, l, p: f.properties })))
    .filter(r => !finer(...mid(r.l))).map(r => ({ ...r, props: { kind: r.p.expressway === 1 ? 'motorway' : r.p.type === 'Major Highway' ? 'trunk' : 'primary' } }));
  const roadsM = mergeLines(roads, r => r.props.kind + (r.p.scalerank <= 5 ? 'a' : 'b'));
  const rail = ne('ne_10m_railroads').flatMap((f, i) => linesOfGeom(f.geometry).map((l, j) => ({ id: `t${i}-${j}`, l, p: f.properties }))).filter(r => !finer(...mid(r.l)));
  const rivFeat = [...ne('ne_10m_rivers_lake_centerlines').map(f => [f, 'w']), ...ne('ne_10m_rivers_europe').map(f => [f, 'e'])];
  const rivers = rivFeat.flatMap(([f, src], i) => linesOfGeom(f.geometry).map((l, j) => ({ id: `${src}${i}-${j}`, l, p: f.properties }))).filter(r => !finer(...mid(r.l)));
  const lakes = [...ne('ne_10m_lakes'), ...ne('ne_10m_lakes_europe')].flatMap((f, i) => polysOfGeom(f.geometry).map((p, j) => ({ id: `k${i}-${j}`, p: f.properties, poly: p })));
  const urban = ne('ne_10m_urban_areas').flatMap((f, i) => polysOfGeom(f.geometry).map((p, j) => ({ id: `u${i}-${j}`, p: f.properties, poly: p })));
  const L = (l, tol) => dp(l, tol);
  const layers = [
    { id: 'roads', title: 'Main roads (Natural Earth 1:10m)', geometry: 'LineString', properties: { kind: 'motorway, trunk or primary (from the Natural Earth type and expressway flag)' },
      describe: 'A main road ({kind}).', sources: ['natural-earth'],
      levels: [{ level: 3, clip: 6, q: 500, note: 'scale rank 5 or less, 0.02 degree tolerance, 0.002 degree grid', features: roadsM.filter(r => r.p.scalerank <= 5).map(r => ({ id: r.id, properties: { kind: r.props.kind }, line: L(r.l, 0.02) })) },
               { level: 5, clip: 8, q: 1000, note: `all within ${NEAR_KM} km of a testbed, 0.005 degree tolerance, 0.001 degree grid`, features: roadsM.filter(r => near(mid(r.l))).map(r => ({ id: r.id, properties: { kind: r.props.kind }, line: L(r.l, 0.005) })) }] },
    { id: 'rail', title: 'Railways (Natural Earth 1:10m)', geometry: 'LineString', properties: {}, describe: 'A railway.', sources: ['natural-earth'],
      levels: [{ level: 5, clip: 8, q: 1000, note: `within ${NEAR_KM} km of a testbed, 0.005 degree tolerance, 0.001 degree grid`, features: mergeLines(rail, () => 'rail').filter(r => near(mid(r.l))).map(r => ({ id: r.id, properties: {}, line: L(r.l, 0.005) })) }] },
    { id: 'rivers', title: 'Rivers (Natural Earth 1:10m and its European supplement)', geometry: 'LineString', properties: { name: 'name', r: 'scale rank' }, describe: '{name}[, a river].', sources: ['natural-earth'],
      levels: [{ level: 5, clip: 8, q: 1000, note: 'all, 0.003 degree tolerance, 0.001 degree grid', features: mergeLines(rivers, r => r.p.name || '').map(r => ({ id: r.id, properties: { name: r.p.name || undefined }, line: L(r.l, 0.003) })) }] },
    { id: 'lakes', title: 'Lakes (Natural Earth 1:10m and its European supplement)', geometry: 'Polygon', properties: { name: 'name' }, describe: '[{name}, ]a lake.', sources: ['natural-earth'],
      levels: [{ level: 5, q: 1000, note: 'all, 0.003 degree tolerance, 0.001 degree grid', features: lakes.map(k => ({ id: k.id, properties: { name: k.p.name || undefined }, poly: k.poly.map(r => L(r, 0.003)).filter(r => r.length >= 4) })).filter(k => k.poly.length) }] },
    { id: 'built-up', title: 'Urban areas (Natural Earth 1:10m)', geometry: 'Polygon', properties: { km2: 'area in km²' }, describe: 'An urban area[ of {km2} km²].', sources: ['natural-earth'],
      levels: [{ level: 5, q: 1000, note: `within ${NEAR_KM} km of a testbed, 0.004 degree tolerance, 0.001 degree grid`, features: urban.filter(k => near(mid(k.poly[0]))).map(k => ({ id: k.id, properties: { km2: Math.round(k.p.area_sqkm) || undefined }, poly: k.poly.map(r => L(r, 0.004)).filter(r => r.length >= 4) })).filter(k => k.poly.length) }] },
  ];
  // places: GeoNames cities15000 (tab-separated in a zip)
  const { default: yauzl } = await import('yauzl');
  const txt = await new Promise((ok, no) => yauzl.open(join(RAW, 'geonames', 'cities15000.zip'), { lazyEntries: true }, (e, z) => { if (e) return no(e); z.readEntry(); z.on('entry', en => { if (!/\.txt$/.test(en.fileName)) return z.readEntry(); z.openReadStream(en, (e2, s) => { if (e2) return no(e2); const ch = []; s.on('data', c => ch.push(c)); s.on('end', () => ok(Buffer.concat(ch).toString('utf8'))); }); }); }));
  const countries = JSON.parse(readFileSync(join(DATA, 'world', 'countries.json'), 'utf8')).features.map(f => f.p), cname = Object.fromEntries(countries.filter(p => p.iso2).map(p => [p.iso2, p.name]));
  const la = [], laI = new Map(), laOf = c => { const n = cname[c] || c; if (!laI.has(n)) { laI.set(n, la.length); la.push(n); } return laI.get(n); };
  const rows = txt.split('\n').filter(Boolean).map(l => l.split('\t')).filter(r => /^PPL/.test(r[7]) && r[7] !== 'PPLX' && r[7] !== 'PPLH');
  const pl = rows.map(r => { const pop = +r[14] || 0, cap = r[7] === 'PPLC' ? 2 : r[7] === 'PPLA' ? 1 : 0;
    return { id: 'g' + r[0], point: [r4(+r[5]), r4(+r[4])], properties: { name: r[1], kind: pop >= 100000 || cap === 2 ? 'city' : 'town', pop: pop || undefined }, alt: r[2] !== r[1] ? r[2] : null, cc: r[8], cap, pop }; })
    .sort((a, b) => b.pop - a.pop);
  layers.push({ id: 'places', title: 'Cities and towns (GeoNames, 15,000 people or more)', geometry: 'Point', properties: { name: 'name', kind: 'city (100,000 or more, or a capital) or town', pop: 'population (GeoNames)' },
    describe: '{name}, a {kind}[, population {pop}].', sources: ['geonames'],
    levels: [{ level: 3, q: 1000, note: '150,000 people or more, or a capital', features: pl.filter(p => p.pop >= 150000 || p.cap === 2) }, { level: 5, q: 1000, note: 'all of cities15000 (populated places, not sections or historical)', features: pl }] });
  const written = writeLayers(out, layers);
  const entries = pl.map(p => [p.properties.name, p.alt, p.properties.kind, p.point[0], p.point[1], laOf(p.cc), p.id, null, p.pop || null]);
  const g = writeGazetteer(out, entries, la, { city: 'city', town: 'town' }, { city: 3, town: 2 }, 'GeoNames cities15000: populated places of 15,000 people or more (and capitals), with the country (Natural Earth names)');
  written.push(...g.written);
  const M = manifest({ id: 'world-detail', region: 'world', name: 'World: detail layers', about: 'Natural Earth 1:10m roads, railways, rivers, lakes and urban areas, and the GeoNames towns of 15,000 people or more, worldwide (roads, railways and rivers left to the finer sets where they exist: the UK skeleton and the regional sets of build-detail-skeleton.mjs). For the globe of the Three.js port (OKR KR2.2, KR2.7).',
    bbox: [-180, -90, 180, 90], layers, gazetteer: g.G,
    sources: { 'natural-earth': 'Natural Earth 5.1.2 (public domain): ' + NE_FILES.join(', '), geonames: 'GeoNames cities15000 (CC BY 4.0), ' + GEONAMES },
    credits: 'Made with Natural Earth (public domain). Places: GeoNames (CC BY 4.0, geonames.org).', levelsNote: { 3: 'world (above 800 km)', 5: 'continental files for the regional and city views (levels 6 and 8)' } });
  finish(out, M, written, 'detail-skeleton-world', ['ne', 'geonames']);
}

// ---------------------------------------------------------------- a regional set from OpenStreetMap extracts
async function readPbf(file, onItems) {
  const { default: parse } = await import('osm-pbf-parser');
  await new Promise((ok, no) => { const p = parse(); createReadStream(file).pipe(p); p.on('data', items => { try { onItems(items); } catch (e) { no(e); } }); p.on('end', ok); p.on('error', no); });
}
const ROAD = { motorway: 'motorway', trunk: 'trunk', primary: 'primary' };
async function buildRegion() {
  const S = REGION_SETS[SET]; if (!S) throw new Error('no set ' + SET);
  const out = join(DATA, S.out); rmSync(join(out, 'layers'), { recursive: true, force: true }); rmSync(join(out, 'gazetteer'), { recursive: true, force: true });
  const ways = new Map(), places = new Map(), need = new Set(), coords = new Map(), files = S.extracts.map(e => join(RAW, 'osm', e.split('/').pop() + '-latest.osm.pbf'));
  for (const f of files) {
    console.log('pass 1', f);
    await readPbf(f, items => { for (const it of items) {
      const t = it.tags || {};
      if (it.type === 'node' && /^(city|town|village)$/.test(t.place) && t.name) places.set(it.id, { id: 'n' + it.id, point: [r4(it.lon), r4(it.lat)], properties: { name: t.name, nameAlt: t['name:en'] && t['name:en'] !== t.name ? t['name:en'] : t['name:sr-Latn'] && t['name:sr-Latn'] !== t.name ? t['name:sr-Latn'] : undefined, kind: t.place, pop: +String(t.population || '').replace(/[^\d]/g, '') || undefined, wd: t.wikidata || undefined } });
      else if (it.type === 'way') {
        let kind = null;
        if (ROAD[t.highway]) kind = 'road'; else if (t.railway === 'rail' && !t.service && t.usage !== 'industrial' && t.usage !== 'military') kind = 'rail'; else if (t.waterway === 'river') kind = 'river';
        if (!kind || ways.has(it.id)) continue;
        ways.set(it.id, { kind, refs: it.refs, tags: kind === 'road' ? { kind: t.highway, ref: t.ref || undefined } : kind === 'river' ? { name: t.name || undefined } : { name: t.name || undefined, usage: t.usage || undefined } });
        for (const r of it.refs) need.add(r);
      } } });
  }
  console.log(`ways ${ways.size}, places ${places.size}, nodes needed ${need.size}`);
  for (const f of files) { console.log('pass 2', f); await readPbf(f, items => { for (const it of items) if (it.type === 'node' && need.has(it.id)) coords.set(it.id, [it.lon, it.lat]); }); }
  const lines = { road: [], rail: [], river: [] };
  for (const [id, w] of ways) { const pts = w.refs.map(r => coords.get(r)).filter(Boolean); if (pts.length >= 2) lines[w.kind].push({ id: 'w' + id, l: pts, props: w.tags }); }
  for (const k of Object.keys(lines)) { const n0 = lines[k].length; lines[k] = mergeLines(lines[k], r => JSON.stringify(r.props)); console.log(`${k}: ${n0} ways -> ${lines[k].length} lines`); }
  // rivers by name: the total length decides the regional level (40 km or more)
  const rlen = new Map(); for (const r of lines.river) if (r.props.name) rlen.set(r.props.name, (rlen.get(r.props.name) || 0) + lineLenKm(r.l));
  const big = r => r.props.name && rlen.get(r.props.name) >= 40;
  const pl = [...places.values()].sort((a, b) => (b.properties.pop || 0) - (a.properties.pop || 0));
  const L = (l, tol) => dp(l, tol);
  const layers = [
    { id: 'roads', title: 'Motorways, trunk and primary roads (OpenStreetMap)', geometry: 'LineString', properties: { kind: 'motorway, trunk or primary (OSM highway)', ref: 'road number' }, describe: '[{ref}, ]a {kind} road.', sources: ['osm'],
      levels: [{ level: 3, note: 'motorways and trunk roads, 0.005 degree tolerance', features: lines.road.filter(r => r.props.kind !== 'primary').map(r => ({ id: r.id, properties: r.props, line: L(r.l, 0.005) })) },
               { level: 6, note: 'all three kinds, 0.001 degree tolerance', features: lines.road.map(r => ({ id: r.id, properties: r.props, line: L(r.l, 0.001) })) },
               { level: 8, note: 'all three kinds, 0.0004 degree tolerance', features: lines.road.map(r => ({ id: r.id, properties: r.props, line: L(r.l, 0.0004) })) }] },
    { id: 'rail', title: 'Railways (OpenStreetMap railway=rail, no sidings or yards)', geometry: 'LineString', properties: { name: 'line name', usage: 'main or branch' }, describe: 'A railway[ ({name})].', sources: ['osm'],
      levels: [{ level: 6, note: '0.001 degree tolerance', features: lines.rail.map(r => ({ id: r.id, properties: r.props, line: L(r.l, 0.001) })) },
               { level: 8, note: '0.0002 degree tolerance', features: lines.rail.map(r => ({ id: r.id, properties: r.props, line: L(r.l, 0.0002) })) }] },
    { id: 'rivers', title: 'Rivers (OpenStreetMap waterway=river)', geometry: 'LineString', properties: { name: 'name' }, describe: '[{name}, ]a river.', sources: ['osm'],
      levels: [{ level: 6, note: 'named rivers of 40 km or more, 0.001 degree tolerance', features: lines.river.filter(big).map(r => ({ id: r.id, properties: r.props, line: L(r.l, 0.001) })) },
               { level: 8, note: 'all rivers, 0.0002 degree tolerance', features: lines.river.map(r => ({ id: r.id, properties: r.props, line: L(r.l, 0.0002) })) }] },
    { id: 'places', title: 'Cities, towns and villages (OpenStreetMap place=*)', geometry: 'Point', properties: { name: 'name', nameAlt: 'English or Latin-script name', kind: 'city, town or village', pop: 'population (OSM)', wd: 'Wikidata QID' },
      describe: '{name}, a {kind}[, population {pop}].', sources: ['osm'],
      levels: [{ level: 3, note: 'cities', features: pl.filter(p => p.properties.kind === 'city') }, { level: 6, note: 'cities and towns', features: pl.filter(p => p.properties.kind !== 'village') }, { level: 8, note: 'cities, towns and villages', features: pl }] },
  ];
  const written = writeLayers(out, layers);
  const riverG = [...rlen].filter(([, km]) => km >= 10).map(([name]) => { const r = lines.river.find(x => x.props.name === name), m = r.l[Math.floor(r.l.length / 2)]; return [name, null, 'river', r4(m[0]), r4(m[1]), -1, r.id, null, null]; });
  const entries = [...pl.map(p => [p.properties.name, p.properties.nameAlt || null, p.properties.kind, p.point[0], p.point[1], -1, p.id, p.properties.wd || null, p.properties.pop || null]), ...riverG];
  const g = writeGazetteer(out, entries, [], { city: 'city', town: 'town', village: 'village', river: 'river' }, { city: 3, town: 2, village: 1, river: 1 }, `OpenStreetMap places (city, town, village) and named rivers of 10 km or more: ${S.about}`);
  written.push(...g.written);
  const all = [...pl.map(p => p.point), ...lines.road.flatMap(r => [r.l[0]])], bb = bboxOf(all).map(r4);
  const fl = flog(), ex = S.extracts.map(e => fl['osm/' + e.split('/').pop() + '-latest.osm.pbf']).filter(Boolean);
  const M = manifest({ id: S.id + '-skeleton', region: SET, name: S.name, about: `OpenStreetMap main roads, railways, rivers and places of ${S.about}, for the globe of the Three.js port round the testbed of region config ${SET} (OKR KR2.2, KR2.7).`,
    bbox: bb, layers, gazetteer: g.G, sources: { osm: `OpenStreetMap (ODbL 1.0) through Geofabrik extracts: ${ex.map(e => `${e.url} (fetched ${e.fetched}, ${e.bytes} bytes, SHA-256 ${e.sha256.slice(0, 16)})`).join('; ')}` },
    credits: '© OpenStreetMap contributors (ODbL 1.0).', levelsNote: { 3: 'national', 6: 'regional', 8: 'city' } });
  finish(out, M, written, 'detail-skeleton-' + SET, ['osm']);
}

function manifest({ id, region, name, about, bbox, layers, gazetteer, sources, credits, levelsNote }) {
  return { id, region, name, about, bbox, crs: 'WGS84 longitude, latitude in degrees (EPSG:4326 axis order lon, lat as GeoJSON)', heights: 'none (2D); terrain comes from the globe',
    format: 'skeleton-1: GeoJSON-like FeatureCollection with integer, delta-coded coordinates (q = 10^4); docklands/geo/skeleton.js unpack() gives GeoJSON',
    cells: { scheme: 'geodetic-quadtree', size: '180 / 2^level degrees', x: 'floor((lon + 180) / size)', y: 'floor((lat + 90) / size), counted from the south', levels: levelsNote,
      files: 'polygons whole in the cell of their bbox centre (file bbox = real extent); lines cut at the edges of the cells of their clip level (a piece per cell, id <feature>.<n>); points in their cell' },
    reader: { module: 'docklands/geo/skeleton.js', tool: 'cwplans/tools/build-detail-skeleton.mjs' }, layers, gazetteer, sources, credits, built: new Date().toISOString().slice(0, 10) };
}
function finish(out, M, written, op, rawPrefixes) {
  const fl = flog(), ins = Object.entries(fl).filter(([k]) => rawPrefixes.some(p => k.startsWith(p + '/'))).map(([k, v]) => ({ name: k, sha256: v.sha256, url: v.url, fetched: v.fetched, bytes: v.bytes }));
  const total = written.reduce((s, w) => s + w.bytes, 0); M.size = { files: written.length, bytes: total };
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(M));
  const LOGF = join(out, 'log.json'), LOG = existsSync(LOGF) ? JSON.parse(readFileSync(LOGF, 'utf8')) : { about: '', operations: {}, fetches: {}, activities: [] };
  LOG.about = 'Dataflow log of tools/build-detail-skeleton.mjs (skill cwplans-dataflow): the operation, its fetched inputs (URL, date, bytes, SHA-256) and one activity per run (inputs and outputs by SHA-256).';
  LOG.operations[op] = { version: 1, tool: 'tools/build-detail-skeleton.mjs', skill: 'docklands-3d-page' };
  for (const i of ins) LOG.fetches[i.name] = { url: i.url, fetched: i.fetched, bytes: i.bytes, sha256: i.sha256 };
  const insS = ins.map(i => ({ name: i.name, sha256: i.sha256 })).sort((a, b) => a.name < b.name ? -1 : 1), id = 'act' + sha(JSON.stringify([op, 1, insS, {}])).slice(0, 16);
  LOG.activities = LOG.activities.filter(a => a.operation !== op); LOG.activities.push({ id, operation: op, version: 1, inputs: insS, outputs: written.length, outputs_sha256: sha(JSON.stringify(written.map(w => w.path + ' ' + w.sha256).sort())), bytes: total, at: new Date().toISOString() });
  writeFileSync(LOGF, JSON.stringify(LOG, null, 1));
  const per = {}; for (const w of written) { const k = w.path.split('/').slice(0, 2).join('/'); per[k] = (per[k] || 0) + w.bytes; }
  console.log(`${M.id}: ${written.length} files, ${(total / 1048576).toFixed(2)} MB`, Object.fromEntries(Object.entries(per).map(([k, v]) => [k, (v / 1048576).toFixed(2) + ' MB'])));
}

const cmd = process.argv[2];
if (cmd === 'fetch') await fetchSet();
else if (cmd === 'build') { if (SET === 'world') await buildWorld(); else await buildRegion(); }
else { console.log('usage: build-detail-skeleton.mjs fetch|build --set world|' + Object.keys(REGION_SETS).join('|')); process.exit(1); }
