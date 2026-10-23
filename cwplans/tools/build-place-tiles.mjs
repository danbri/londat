#!/usr/bin/env node
// A place on the globe as 3D Tiles 1.1 + glTF (OKR KR1.2 with KR2.3; docs/planet-architecture.md, "The tile tree"): OSM
// buildings, water, green and streets of a square of about 2 km round a region's origin, heights from OSM tags (then a
// national adapter's building heights where the region config names one, then a stated default), terrain from the
// region's DEM adapter, cut by the worldwide geodetic quadtree (one tile per cell of 180 / 2^level degrees; level 15 is
// about 610 m north-south), each tile in its own east-north-up frame with the ENU -> ECEF `transform`.
//
//   node cwplans/tools/build-place-tiles.mjs --region leon           fetch what is missing, then build
//   node cwplans/tools/build-place-tiles.mjs fetch --region leon [--refetch]
//   node cwplans/tools/build-place-tiles.mjs build --region leon [--force]
//   node cwplans/tools/build-place-tiles.mjs readme --region leon            README.md of the place and of places/
//
// No locale constant here: the area, the DEM service, the national height source, its CRS and the name keys come from
// the region config (docklands/geo/regions/<id>.js, block `place` and the adapters it names). Handlers are generic:
// OSM API 0.6 (/map.json, split in four on "too many nodes"), WCS 2.0 GetCoverage (GeoTIFF in geographic degrees),
// Copernicus GLO-30 COG tiles (worldwide fallback), INSPIRE BU building parts (GML, number of floors).
// Raw downloads: cwplans/data/raw/places/<id>/ (ignored by git; fetch-log.json: URL, date, bytes, SHA-256).
// Output: cwplans/docklands/data/places/<id>/ (tileset.json, tiles/<level>-<x>-<y>.glb, features.json; provenance/log.json:
// the fetch records and the activities; sources/: small committed extracts that are inputs of an operation, e.g. the
// GHSL height window; README.md: made from log.json and the data register by the `readme` command, also at the end of
// each build) and cwplans/docklands/data/places/index.json (the places the globe knows) with places/README.md. Reader: docklands/globe/places.js. features.json
// also holds a coarser terrain grid of an 8 km ring round the place (place.ring_m), which the globe joins to the world.
//
// Dataflow (skill cwplans-dataflow): three named operations over input files fixed by SHA-256 and parameters:
// place-select-osm, place-heights, place-tiles. Activity id = sha256(JSON [op, version, input hashes, params])[0:16];
// each run is appended to log.json with its inputs and outputs (SHA-256); a step whose activity is in the log with its
// outputs present and unchanged is not run again. Bodies read only their inputs: no clock, no network.
// Faults of the height rule are counted per class (F55 in the curation skill's fault register), not patched per record.
// Skill: docklands-3d-page, "Three.js port: places as 3D Tiles (2026-10-18)".
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync, createGzip, createGunzip } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import proj4 from 'proj4';
import earcut from 'earcut';
import { fromArrayBuffer, fromUrl } from 'geotiff';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import REGIONS from '../../docklands/geo/regions/index.js';
import { enuFrame, geodeticToEcef, D2R } from '../../docklands/geo/ellipsoid.js';
import { selectOuter, lodTree, walk, outerTile, easedDem, mul4, inv4rigid, roundM, meet, farLod } from './place-lod.mjs';
import { overture } from '../../docklands/geo/adapters/world-buildings.js';
import { blockSelector, blockTree, blockTile, worldBaseGround, cellBox, footprintBox, wantsOutline } from './place-blocks.mjs';
import { polyIndex, tagIndex, liteSelector, townSize, mergeItems, REC, compactBoxes, recSquares, squareBoxes, recBoxes, boxSquares, HSRC, COMPACT_ABOUT, TILE_EXTRAS, streetBlocks, farKeep } from './place-lite.mjs';
import { unpack } from '../../docklands/geo/skeleton.js';
import { wdHeights, partIndex, landmarkHeights } from './place-lite-heights.mjs';
import { triangulatePolygon } from './place-lod2.mjs';

const UA = 'glitchcan-cwplans/0.1 (https://github.com/danbri/londat)';
const TOOL = 'tools/build-place-tiles.mjs';
const CW = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), flag = f => argv.includes(f);
const argOf = k => { const i = argv.findIndex(a => a === '--' + k || a.startsWith('--' + k + '=')); if (i < 0) return null; return argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1]; };
const RID = argOf('region'); if (!RID) { console.error('usage: build-place-tiles.mjs [fetch|build] --region <id>'); process.exit(2); }
// a region config of the page (regions/index.js), or a build-only one (regions/<id>.js not in the index: the UK lite set,
// whose box would make the whole UK one project region for the page's zone and gazetteer lookups)
const REG = REGIONS[RID] || await import(`../../docklands/geo/regions/${RID}.js`).then(m => m.default).catch(() => null); if (!REG) throw new Error(`no region config ${RID} (docklands/geo/regions/)`);
const PL = REG.place; if (!PL) throw new Error(`region ${RID} has no place block`);
// kind 'blocks' (Greater London): no core, no ground of its own; the buildings of a boundary as blocks by level of detail
const BLOCKS = PL.kind === 'blocks', BK = BLOCKS ? PL.blocks : null;
// kind 'lite' (the UK outside London): landmarks plus merged mass, written to another repository (place.outRepo, --out)
const LITE = PL.kind === 'lite', LT = LITE ? PL.lite : null;
const cmd = ['fetch', 'build', 'readme', 'far-lod'].find(c => argv.includes(c)) || 'all';
const RAWD = join(CW, 'data', 'raw', 'places', RID), WORK = join(RAWD, 'work');
// EXTOUT: the tile set is written to another repository (place.outRepo / outPath, or --out: a clone of it): the UK lite
// set, Dublin and the German places (danbri/docklandia data/<country>/<set>/); its index entry in londat's
// places/index.json holds absolute URLs (place.tileBase); index.json and the region config stay here
const EXTOUT = LITE || !!PL.outRepo;
const OUTROOT = join(CW, 'docklands', 'data', 'places'), OUT = EXTOUT ? (argOf('out') || join(CW, '..', '..', PL.outRepo, PL.outPath)) : join(OUTROOT, RID), PROV = join(OUT, 'provenance'), SRC = join(OUT, 'sources');
for (const d of [RAWD, WORK, OUT, PROV, ...(LITE ? [] : [SRC])]) mkdirSync(d, { recursive: true });
const sha = b => createHash('sha256').update(b).digest('hex');
// paths in the logs: relative to cwplans/, or "<repo>:<path>" for the files of another repository (kind lite)
const rel = p => EXTOUT && !relative(OUT, p).startsWith('..') ? `${PL.outRepo}:${PL.outPath}${relative(OUT, p)}` : relative(CW, p);
const absOf = q => EXTOUT && q.startsWith(PL.outRepo + ':') ? join(OUT, q.slice(PL.outRepo.length + 1 + PL.outPath.length)) : join(CW, q);
const jz = (p, o) => writeFileSync(p, gzipSync(JSON.stringify(o)));
const rz = p => JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));

// ---------- the area: a square of size_m round the origin, as whole quadtree cells
const L = PL.level ?? 15, CS = 180 / 2 ** L, O = REG.origin;
const mLat = 110574, mLon = 111320 * Math.cos(O.lat * D2R), half = (PL.size_m ?? 2000) / 2;
// place.core_bbox [w, s, e, n]: a box of the region config instead of the square (Dublin: both banks of the Liffey, about
// 4.7 x 2.1 km; a town and the villages round it; a city centre longer east-west than north-south)
const sq = PL.core_bbox || [O.lon - half / mLon, O.lat - half / mLat, O.lon + half / mLon, O.lat + half / mLat];
// the cells whose centre lies in the square (so the area is about size_m across, not up to two cells more)
const cx0 = Math.round((sq[0] + 180) / CS), cx1 = Math.round((sq[2] + 180) / CS) - 1, cy0 = Math.round((sq[1] + 90) / CS), cy1 = Math.round((sq[3] + 90) / CS) - 1;
const CELLS = []; for (let x = cx0; x <= cx1; x++) for (let y = cy0; y <= cy1; y++) CELLS.push({ x, y, key: `${L}-${x}-${y}`, b: [-180 + x * CS, -90 + y * CS, -180 + (x + 1) * CS, -90 + (y + 1) * CS] });
const AREA = [-180 + cx0 * CS, -90 + cy0 * CS, -180 + (cx1 + 1) * CS, -90 + (cy1 + 1) * CS];
const r7 = v => Math.round(v * 1e7) / 1e7;

// ---------- fetch log (raw folder) and the committed build log
const FLOG = join(RAWD, 'fetch-log.json'), flog = existsSync(FLOG) ? JSON.parse(readFileSync(FLOG, 'utf8')) : {};
const saveFlog = () => writeFileSync(FLOG, JSON.stringify(flog, null, 1));
const BLOG = join(PROV, 'log.json');
if (!existsSync(BLOG) && existsSync(join(OUT, 'log.json'))) { writeFileSync(BLOG, readFileSync(join(OUT, 'log.json'))); rmSync(join(OUT, 'log.json')); }   // layout of 2026-10-18: log.json beside the tileset
const blog = existsSync(BLOG) ? JSON.parse(readFileSync(BLOG, 'utf8')) : { about: '', fetches: {}, activities: [] };
async function get(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  if (!r.ok) { const e = new Error(`${r.status} ${url}`); e.status = r.status; e.body = (await r.text()).slice(0, 300); throw e; }
  return Buffer.from(await r.arrayBuffer());
}
const pause = ms => new Promise(r => setTimeout(r, ms));
function record(what, file, url, extra = {}) { const b = readFileSync(file); flog[what] = { url, fetched: new Date().toISOString(), bytes: b.length, sha256: sha(b), file: rel(file), ...extra }; saveFlog(); }

// OSM: the API's /map.json for the area (one request; on 400 "too many nodes" the box is cut in four, one request at a
// time, 1 s apart). Elements merged by type and id.
async function fetchOsm() {
  const f = join(RAWD, 'osm.json.gz'); if (existsSync(f) && !flag('--refetch')) return;
  const els = new Map(), urls = [], got = [];
  async function box(b, depth) {
    const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${b.map(v => v.toFixed(6)).join(',')}`;
    try { const buf = await get(url), j = JSON.parse(buf.toString('utf8')); urls.push(url); got.push({ url, bytes: buf.length, sha256: sha(buf) }); for (const e of j.elements) els.set(e.type[0] + e.id, e); }
    catch (e) { if (e.status !== 400 || depth > 3) throw e; const mx = (b[0] + b[2]) / 2, my = (b[1] + b[3]) / 2;
      for (const q of [[b[0], b[1], mx, my], [mx, b[1], b[2], my], [b[0], my, mx, b[3]], [mx, my, b[2], b[3]]]) { await pause(1000); await box(q, depth + 1); } }
  }
  await box(AREA, 0);
  const latest = [...els.values()].reduce((m, e) => e.timestamp > m ? e.timestamp : m, '');
  jz(f, { generator: 'OSM API 0.6 map.json', bbox: AREA, elements: [...els.values()] });
  record('osm', f, urls.length === 1 ? urls[0] : urls, { source: 'osm', requests: urls.length, as_fetched: got, elements: els.size, latest_element_timestamp: latest, licence: 'ODbL 1.0, © OpenStreetMap contributors',
    stored_as: 'the elements of all answers merged by type and id, gzip JSON (sha256 above); the answers as fetched: as_fetched' });
  console.log(`osm: ${els.size} elements in ${urls.length} request(s)`);
}

// DEM: by the adapter's kind, into one common raw grid (row 0 = north, heights in metres of the adapter's datum)
const demAd = REG.adapters.find(a => a.id === PL.dem && a.dem) || REG.adapters.find(a => a.dem);
if (!demAd && !BLOCKS && !LITE) throw new Error(`region ${RID}: no adapter with a dem block`);
// the ring: a wider square (place.ring_m, default 8 km) of coarser terrain round the place, drawn by the globe between the
// place's tiles and the 10 km world terrain (globe/places.js), so a valley or a hill is not cut off at the place's edge
const RING_M = PL.ring_m ?? 8000, RING = [O.lon - RING_M / 2 / mLon, O.lat - RING_M / 2 / mLat, O.lon + RING_M / 2 / mLon, O.lat + RING_M / 2 / mLat];
// one DEM grid for a box b (row 0 = north): WCS 2.0 GeoTIFF in geographic degrees, or a window of a Copernicus GLO-30 COG
async function demGrid(b, coverage, tifOut, ad = demAd) {
  const D = ad.dem;
  if (D.kind === 'wcs20') {
    const url = `${D.url}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=${coverage}&SUBSET=${D.lat}(${b[1]},${b[3]})&SUBSET=${D.lon}(${b[0]},${b[2]})&FORMAT=${encodeURIComponent(D.format)}`;
    const buf = await get(url); if (tifOut) writeFileSync(tifOut, buf); const fetched = { as_fetched: { bytes: buf.length, sha256: sha(buf), format: D.format } };
    const img = await (await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))).getImage();
    const [w0, s0, e0, n0] = img.getBoundingBox(), r = await img.readRasters(), nd = img.getGDALNoData();
    return { url, fetched, grid: { w: w0, s: s0, e: e0, n: n0, nx: img.getWidth(), ny: img.getHeight(), h: Array.from(r[0], v => v === nd ? null : Math.round(v * 10) / 10), datum: D.datum, source: D.source, coverage } };
  }
  if (D.kind === 'copernicus-glo30') {
    // one COG per 1 x 1 degree cell (the cell of the origin; a box that crosses its edge is clipped to it): range requests
    const la = Math.floor(O.lat), lo = Math.floor(O.lon), ns = (la < 0 ? 'S' : 'N') + String(Math.abs(la)).padStart(2, '0'), ew = (lo < 0 ? 'W' : 'E') + String(Math.abs(lo)).padStart(3, '0');
    const name = `Copernicus_DSM_COG_10_${ns}_00_${ew}_00_DEM`, url = `${D.url}${name}/${name}.tif`;
    const img = await (await fromUrl(url)).getImage();
    const [w0, s0, e0, n0] = img.getBoundingBox(), W = img.getWidth(), H = img.getHeight(), cl = (v, a) => Math.max(0, Math.min(a, v));
    const win = [cl(Math.floor((b[0] - w0) / (e0 - w0) * W), W), cl(Math.floor((n0 - b[3]) / (n0 - s0) * H), H), cl(Math.ceil((b[2] - w0) / (e0 - w0) * W), W), cl(Math.ceil((n0 - b[1]) / (n0 - s0) * H), H)];
    const r = await img.readRasters({ window: win }), px = (e0 - w0) / W, py = (n0 - s0) / H;
    return { url, window: win, fetched: { as_fetched: { note: 'HTTP range requests of a Cloud Optimized GeoTIFF: no single file as fetched; the window (pixel columns and rows) and the stored grid (sha256) fix the input' } }, grid: { w: w0 + win[0] * px, n: n0 - win[1] * py, e: w0 + win[2] * px, s: n0 - win[3] * py, nx: win[2] - win[0], ny: win[3] - win[1], h: Array.from(r[0], v => Math.round(v * 10) / 10), datum: D.datum, source: D.source } };
  }
  if (D.kind === 'arcgis-tile-zips') {
    // national LiDAR as tile zips (Ireland: Geological Survey Ireland): an ArcGIS coverage layer lists the tiles over the box
    // with their download URL and licence; each zip holds a GeoTIFF in a projected CRS (D.proj4). The tiles are resampled
    // (bilinear, nodata left out) into a lon/lat grid of about res_m; the zips stay in the raw folder
    const q = `${D.index}?where=1%3D1&geometry=${b.map(v => v.toFixed(6)).join(',')}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${D.url_field},${D.licence_field}&returnGeometry=false&f=json`;
    const J = JSON.parse((await get(q)).toString('utf8')); if (!J.features) throw new Error('coverage query: ' + JSON.stringify(J).slice(0, 300));
    const urls = [...new Set(J.features.map(f => f.attributes[D.url_field]))].sort(), licences = [...new Set(J.features.map(f => f.attributes[D.licence_field]))];
    const P = proj4('WGS84', D.proj4), imgs = [], got = [];
    for (const u of urls) {
      const zf = join(RAWD, 'dem-' + u.split('/').pop()); if (!existsSync(zf) || flag('--refetch')) { writeFileSync(zf, await get(u)); await pause(1000); }
      const zb = readFileSync(zf); got.push({ url: u, bytes: zb.length, sha256: sha(zb) });
      const member = execFileSync('unzip', ['-Z1', zf], { encoding: 'utf8' }).split('\n').filter(Boolean).find(n => new RegExp(D.member).test(n)); if (!member) { console.warn('dem: no member in', u); continue; }
      const tif = execFileSync('unzip', ['-p', zf, member], { maxBuffer: 1 << 30 }), img = await (await fromArrayBuffer(tif.buffer.slice(tif.byteOffset, tif.byteOffset + tif.byteLength))).getImage();
      const [x0, y0, x1, y1] = img.getBoundingBox(); imgs.push({ x0, y0, x1, y1, W: img.getWidth(), H: img.getHeight(), r: (await img.readRasters())[0], nd: img.getGDALNoData() });
    }
    const ok = (T, v) => v != null && v !== T.nd && v > -1000 && Number.isFinite(v);
    const dLat = D.res_m / mLat, dLon = D.res_m / mLon, nx = Math.ceil((b[2] - b[0]) / dLon), ny = Math.ceil((b[3] - b[1]) / dLat), h = new Array(nx * ny).fill(null);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const [x, y] = P.forward([b[0] + (i + 0.5) * dLon, b[3] - (j + 0.5) * dLat]);
      for (const T of imgs) { if (x < T.x0 || x >= T.x1 || y <= T.y0 || y > T.y1) continue;
        const fx = Math.max(0, Math.min(T.W - 1.001, (x - T.x0) / (T.x1 - T.x0) * T.W - 0.5)), fy = Math.max(0, Math.min(T.H - 1.001, (T.y1 - y) / (T.y1 - T.y0) * T.H - 0.5)), i0 = Math.floor(fx), j0 = Math.floor(fy), u = fx - i0, v = fy - j0;
        let s = 0, wt = 0; for (const [di, dj, w] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) { const val = T.r[(j0 + dj) * T.W + i0 + di]; if (ok(T, val) && w > 0) { s += val * w; wt += w; } }
        if (wt > 0) { h[j * nx + i] = Math.round(s / wt * 10) / 10; break; } }
    }
    const missing = h.filter(v => v == null).length;
    console.log(`dem: ${urls.length} tile zips, ${nx} x ${ny} cells, ${missing} without a value`);
    return { url: [q, ...urls], fetched: { as_fetched: got, licences, cells_without_value: missing }, grid: { w: b[0], s: b[3] - ny * dLat, e: b[0] + nx * dLon, n: b[3], nx, ny, h, datum: D.datum, source: D.source } };
  }
  if (D.kind === 'xyz-zip-tiles') {
    // a national DGM as zipped text grids (x y z, one point a line, the cell centres of a res_src_m grid in a projected
    // CRS) in tiles of tile_m listed by an ATOM feed (Berlin DGM1: 2 km tiles, 1 m cells, EPSG:25833, DHHN2016): the
    // tiles over the box, resampled (nearest cell) to a geographic grid of about res_m
    const P = proj4(D.proj4, 'WGS84'), feed = (await get(D.feed)).toString('utf8'), re = new RegExp(D.zip_re, 'g');
    const listed = new Map([...feed.matchAll(re)].map(m0 => { const m = m0[0].match(new RegExp(D.zip_re)); return [`${+m[1]},${+m[2]}`, m0[0]]; }));
    const cs = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map(q => P.inverse(q)), ex = [Math.min(...cs.map(q => q[0])), Math.min(...cs.map(q => q[1])), Math.max(...cs.map(q => q[0])), Math.max(...cs.map(q => q[1]))];
    const T = D.tile_m, km = T / 1000, tiles = new Map(), got = [], urls = [];
    for (let e = Math.floor(ex[0] / T) * km; e * 1000 < ex[2]; e += km) for (let n = Math.floor(ex[1] / T) * km; n * 1000 < ex[3]; n += km) {
      const url = listed.get(`${e},${n}`); if (!url) continue; const zf = join(RAWD, 'dem-' + url.split('/').pop()); let zb;
      if (existsSync(zf)) zb = readFileSync(zf); else { zb = await get(url); writeFileSync(zf, zb); await pause(300); }
      got.push({ url, bytes: zb.length, sha256: sha(zb) }); urls.push(url);
      const N = T / D.res_src_m, g = new Float32Array(N * N).fill(NaN), x0 = e * 1000, y0 = n * 1000;
      const txt = execFileSync('unzip', ['-p', zf], { maxBuffer: 1 << 30 }).toString('latin1');
      for (const line of txt.split('\n')) { if (!line) continue; const [x, y, z] = line.trim().split(/\s+/).map(Number); const i = Math.floor((x - x0) / D.res_src_m), j = Math.floor((y - y0) / D.res_src_m); if (i >= 0 && j >= 0 && i < N && j < N) g[j * N + i] = z; }
      tiles.set(`${e},${n}`, { g, N, x0, y0 }); }
    const dy = D.res_m / 110574, dx = D.res_m / (111320 * Math.cos((b[1] + b[3]) / 2 * D2R)), nx = Math.ceil((b[2] - b[0]) / dx), ny = Math.ceil((b[3] - b[1]) / dy), h = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const [x, y] = P.inverse([b[0] + (i + 0.5) * dx, b[3] - (j + 0.5) * dy]), e = Math.floor(x / T) * km, n = Math.floor(y / T) * km, t = tiles.get(`${e},${n}`);
      const v = t ? t.g[Math.floor((y - t.y0) / D.res_src_m) * t.N + Math.floor((x - t.x0) / D.res_src_m)] : NaN; h.push(Number.isFinite(v) ? Math.round(v * 10) / 10 : null); }
    return { url: urls, fetched: { as_fetched: got }, grid: { w: b[0], n: b[3], e: b[0] + nx * dx, s: b[3] - ny * dy, nx, ny, h, datum: D.datum, source: D.source } };
  }
  throw new Error(`dem kind ${D.kind}?`);
}
async function fetchDem() {
  const D = demAd.dem, m = 0.002, f = join(RAWD, 'dem.json.gz'), fr = join(RAWD, 'dem-ring.json.gz');
  if (!existsSync(f) || flag('--refetch')) { const g = await demGrid([AREA[0] - m, AREA[1] - m, AREA[2] + m, AREA[3] + m], D.coverage, join(RAWD, 'dem.tif'));
    jz(f, g.grid); record('dem', f, g.url, { source: D.source, ...(g.window ? { window: g.window } : {}), ...g.fetched, licence: D.credit }); console.log(`dem: ${g.grid.nx} x ${g.grid.ny} (${D.source})`); }
  if (SUR) { delete flog['dem-ring']; saveFlog(); }   // the surroundings replace the ring
  if (RING_M && !SUR && (!existsSync(fr) || flag('--refetch'))) { const g = await demGrid([RING[0] - m, RING[1] - m, RING[2] + m, RING[3] + m], D.ringCoverage || D.coverage, null);
    jz(fr, g.grid); record('dem-ring', fr, g.url, { source: D.source, ...(g.window ? { window: g.window } : {}), ...g.fetched, licence: D.credit }); console.log(`dem ring: ${g.grid.nx} x ${g.grid.ny}`); }
}

// building heights (adapters with a buildingHeights block), in the order of place.heights:
//   inspire-bu-parts: national building parts with floors, kept raw (never committed: the Catastro rule)
//   ghsl-raster: a gridded average building height (GHSL GHS-BUILT-H); the window over the area is committed in
//     sources/<source>.json (CC BY 4.0, cropped only), the 10 x 10 degree tile zip stays raw
const hAds = (PL.heights || []).map(id => REG.adapters.find(a => a.id === id && a.buildingHeights)).filter(Boolean);
//   citygml-lod2-atom: an official LoD2 model (CityGML, AdV profile) in tiles listed by an INSPIRE ATOM feed: the measured
//     height and footprint of each building part over the core and the city box (raw, an input of place-heights and
//     place-city-heights) and the wall and roof polygons of the core buildings (raw, an input of place-tiles)
const natAds = hAds.filter(a => ['inspire-bu-parts', 'citygml-lod2-atom'].includes(a.buildingHeights.kind)), lod2Ad = hAds.find(a => a.buildingHeights.kind === 'citygml-lod2-atom'), rasAds = hAds.filter(a => a.buildingHeights.kind === 'ghsl-raster');
//   overture-buildings, ms-buildings: footprints with heights, floors or roofs (ODbL, share-alike); the raw answer stays in the
//     raw folder, the crop of the footprints that carry a usable value is committed in sources/<source>.json
const fpAds = hAds.filter(a => ['overture-buildings', 'ms-buildings', 'overture-dataset-floors'].includes(a.buildingHeights.kind));
const fpFile = a => join(SRC, `${a.buildingHeights.source}.json`);
const inArea = (ring, m = 0.003) => ring.some(([lon, lat]) => lon > AREA[0] - m && lon < AREA[2] + m && lat > AREA[1] - m && lat < AREA[3] + m);
// Overture: run the DuckDB helper (python with the duckdb package: env CWPLANS_DUCKDB_PYTHON, default python3), then keep the
// rows with a value whose own source (the sources entry for that property, else the record's base entry) is not OSM
async function fetchOverture(a) {
  const B = a.buildingHeights, f = fpFile(a), raw = join(RAWD, `overture-${B.release}.json`); if (existsSync(f) && !flag('--refetch')) return;
  const m = 0.003, bb = [AREA[0] - m, AREA[1] - m, AREA[2] + m, AREA[3] + m].map(v => v.toFixed(6));
  if (!existsSync(raw) || flag('--refetch')) execFileSync(process.env[B.python] || 'python3', ['-I', join(CW, '..', B.script), B.release, ...bb, raw], { stdio: 'inherit' });
  const R = JSON.parse(readFileSync(raw, 'utf8')), srcOf = (r, prop) => { const x = r.sources.find(q => q.property === '/properties/' + prop) || r.sources.find(q => !q.property) || r.sources[0]; return x ? [x.dataset, x.license] : [null, null]; };
  const rows = [], cnt = { records: R.rows.length, by_geometry_source: {}, values_from_osm_skipped: 0, values_licence_not_open_skipped: {} };
  for (const r of R.rows) { const g = srcOf(r, ''); cnt.by_geometry_source[g[0]] = (cnt.by_geometry_source[g[0]] || 0) + 1;
    const o = { id: r.id, ring: r.ring }; let any = false;
    for (const [k, prop] of [['height', 'height'], ['floors', 'num_floors'], ['roof', 'roof_shape']]) { const v = r[prop]; if (v == null) continue; const sv = srcOf(r, prop);
      if (sv[0] === 'OpenStreetMap') { cnt.values_from_osm_skipped++; continue; }
      // a value whose source licence is not in the adapter's list (also an empty licence) is neither used nor committed
      if (!B.licences.includes(sv[1])) { const kk = `${prop} from ${sv[0]} (licence "${sv[1] || ''}")`; cnt.values_licence_not_open_skipped[kk] = (cnt.values_licence_not_open_skipped[kk] || 0) + 1; continue; }
      o[k] = v; o[k + '_src'] = sv; any = true; }
    if (o.roof && r.roof_height != null) o.roof_h = r.roof_height;
    if (any) rows.push(o); }
  const crop = { format: 'place-footprints-1', source: B.source, about: a.about, licence: a.licence, credit: B.credit, release: R.release, bbox: R.bbox, files_read: R.files_read, counts: cnt,
    note: 'only the records with a height, number of floors or roof shape whose own source is not OpenStreetMap and whose source licence is in the adapter list (counts: what was left out); ring = outer ring (lon, lat; 1e-7)', rows };
  writeFileSync(f, JSON.stringify(crop) + '\n');
  const rb = readFileSync(raw);
  record('heights-' + a.id, f, `s3://overturemaps-us-west-2/release/${R.release}/theme=buildings/type=building/ (bbox ${bb.join(',')}; files ${R.files_read.join(' ')})`,
    { source: B.source, request: `DuckDB read_parquet over HTTPS of the ${R.files_listed} files of the release, filter on bbox.xmin/xmax/ymin/ymax; ${R.files_read.length} file(s) held rows`,
      as_fetched: { bytes: rb.length, sha256: sha(rb), note: 'the query answer as written by cwplans/tools/fetch-overture-buildings.py (raw folder)' }, records: R.rows.length, kept: rows.length, committed: rel(f), licence: a.licence });
  console.log(`heights ${a.id}: ${R.rows.length} records, ${rows.length} with a non-OSM value`);
}
// Microsoft: the dataset links table, the zoom-9 quadkeys over the area, each quadkey's gzip GeoJSON lines; keep height > 0
const quadkey = (lon, lat, z) => { const sn = Math.sin(lat * D2R), x = Math.floor((lon + 180) / 360 * 2 ** z), y = Math.floor((0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * 2 ** z);
  let q = ''; for (let i = z; i > 0; i--) { const mk = 1 << (i - 1); q += ((x & mk) ? 1 : 0) + ((y & mk) ? 2 : 0); } return q; };
async function fetchMs(a) {
  const B = a.buildingHeights, f = fpFile(a); if (existsSync(f) && !flag('--refetch')) return;
  const lf = join(RAWD, 'ms-dataset-links.csv'); if (!existsSync(lf) || flag('--refetch')) writeFileSync(lf, await get(B.links));
  const qks = [...new Set([[AREA[0], AREA[1]], [AREA[2], AREA[1]], [AREA[0], AREA[3]], [AREA[2], AREA[3]]].map(([lo, la]) => quadkey(lo, la, B.zoom)))];
  const links = readFileSync(lf, 'utf8').split('\n').map(l => l.split(',')).filter(c => qks.includes(c[1]));
  const rows = [], got = []; let n = 0, inBox = 0;
  for (const [loc, qk, url] of links) { const zf = join(RAWD, `ms-${loc}-${qk}.csv.gz`); if (!existsSync(zf) || flag('--refetch')) { writeFileSync(zf, await get(url)); await pause(1000); }
    const zb = readFileSync(zf); got.push({ url, bytes: zb.length, sha256: sha(zb) });
    for (const line of gunzipSync(zb).toString('utf8').split('\n')) { if (!line.trim()) continue; n++; const ft = JSON.parse(line), ring = (ft.geometry.type === 'Polygon' ? ft.geometry.coordinates : ft.geometry.coordinates[0])[0].map(([x, y]) => [r7(x), r7(y)]);
      if (!inArea(ring)) continue; inBox++; const h = ft.properties.height; if (h != null && h > 0) rows.push({ ring, height: Math.round(h * 100) / 100, confidence: ft.properties.confidence }); } }
  const crop = { format: 'place-footprints-1', source: B.source, about: a.about, licence: a.licence, credit: B.credit, quadkeys: qks, links: links.map(c => c[2]), counts: { features_read: n, in_area: inBox, with_height: rows.length },
    note: 'only the footprints in the area (plus 0.003 degree) with a height > 0; ring = outer ring (lon, lat; 1e-7)', rows };
  writeFileSync(f, JSON.stringify(crop) + '\n');
  record('heights-' + a.id, f, links.map(c => c[2]), { source: B.source, request: `dataset-links.csv rows of quadkey(s) ${qks.join(', ')} (zoom ${B.zoom})`, as_fetched: got, in_area: inBox, kept: rows.length, committed: rel(f), licence: a.licence });
  console.log(`heights ${a.id}: ${inBox} footprints in the area, ${rows.length} with a height (quadkeys ${qks.join(', ')})`);
}
const rasFile = a => join(SRC, `${a.buildingHeights.source}.json`);
async function fetchRaster(a) {
  const B = a.buildingHeights, f = rasFile(a); if (existsSync(f) && !flag('--refetch')) return;
  const r = Math.floor((B.north - O.lat) / B.tile_deg) + 1, c = Math.floor((O.lon - B.west) / B.tile_deg) + 1, url = B.url.replace('{r}', r).replace('{c}', c);
  const zip = join(RAWD, url.split('/').pop()); if (!existsSync(zip) || flag('--refetch')) writeFileSync(zip, await get(url));
  const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean), member = names.find(n => new RegExp(B.member).test(n));
  const tif = execFileSync('unzip', ['-p', zip, member], { maxBuffer: 1 << 30 });
  const img = await (await fromArrayBuffer(tif.buffer.slice(tif.byteOffset, tif.byteOffset + tif.byteLength))).getImage();
  const [w0, s0, e0, n0] = img.getBoundingBox(), W = img.getWidth(), H = img.getHeight(), m = 0.003, b = [HB[0] - m, HB[1] - m, HB[2] + m, HB[3] + m];   // the core and the city box
  const win = [Math.floor((b[0] - w0) / (e0 - w0) * W), Math.floor((n0 - b[3]) / (n0 - s0) * H), Math.ceil((b[2] - w0) / (e0 - w0) * W), Math.ceil((n0 - b[1]) / (n0 - s0) * H)];
  const ras = await img.readRasters({ window: win }), px = (e0 - w0) / W, py = (n0 - s0) / H;
  const grid = { format: 'place-raster-1', source: B.source, about: a.about, licence: a.licence, credit: B.credit, url, member, tile: `R${r}_C${c}`, window: win,
    note: 'a crop of the tile (pixel window above), values rounded to 0.1 m; 0 = no built surface in the cell. Row 0 = north.',
    w: r7(w0 + win[0] * px), n: r7(n0 - win[1] * py), e: r7(w0 + win[2] * px), s: r7(n0 - win[3] * py), nx: win[2] - win[0], ny: win[3] - win[1], h: Array.from(ras[0], v => Math.round(v * 10) / 10) };
  writeFileSync(f, JSON.stringify(grid) + '\n');
  record('heights-' + a.id, f, url, { source: B.source, member, as_fetched: { bytes: readFileSync(zip).length, sha256: sha(readFileSync(zip)), member_sha256: sha(tif) }, window: win, cells: grid.nx * grid.ny,
    committed: rel(f), licence: a.licence, note: 'the tile zip stays in the raw folder; the committed crop is the input of place-heights' });
  console.log(`heights ${a.id}: ${grid.nx} x ${grid.ny} cells (${url.split('/').pop()})`);
}
// ---------- the city and the surroundings (place.city, place.surround; operations place-select-outer, place-city-heights,
// place-lod): a city box drawn as blocks, a surround square (size_m) of terrain, land cover, roads, rail, water and names,
// as whole cells of the quadtree at surround.top_level (EXT: the extent of the tile tree)
const CITY = PL.city?.bbox || null, SUR = PL.surround || null;
// the terrain of the surroundings: the adapter named by place.surround.dem (e.g. Copernicus GLO-30 round a core whose own
// DEM is a national 1 m model of the city only), else the core's DEM adapter
// the terrain of the surroundings, one rule for both forms: (1) place.surround.dem names another adapter (Berlin: DGM1 for
// the core, Copernicus GLO-30 round it); (2) the core DEM adapter's dem.surround block (Dublin: national LiDAR tiles for
// the core, Copernicus GLO-30 round it), merged over its dem; (3) else the core's DEM. DEMS = its dem block; DEM_CREDIT
// names the core DEM and the surroundings DEM once each
const surDemAd = SUR?.dem ? REG.adapters.find(a => a.id === SUR.dem && a.dem)
  : demAd?.dem.surround ? { ...demAd, dem: { ...demAd.dem, ...demAd.dem.surround } } : demAd;
if (SUR?.dem && !surDemAd) throw new Error(`region ${RID}: place.surround.dem names no adapter with a dem block: ${SUR.dem}`);
const DEMS = surDemAd?.dem, DEM_CREDIT = [...new Set([demAd?.dem.credit, surDemAd?.dem.credit].filter(Boolean))].join('; ');
const TOP = SUR?.top_level ?? 10, TCS = 180 / 2 ** TOP;
const SURR = SUR ? [O.lon - SUR.size_m / 2 / mLon, O.lat - SUR.size_m / 2 / mLat, O.lon + SUR.size_m / 2 / mLon, O.lat + SUR.size_m / 2 / mLat] : null;
const EXT = SURR ? [-180 + Math.floor((SURR[0] + 180) / TCS) * TCS, -90 + Math.floor((SURR[1] + 90) / TCS) * TCS, -180 + Math.ceil((SURR[2] + 180) / TCS) * TCS, -90 + Math.ceil((SURR[3] + 90) / TCS) * TCS] : null;
const HB = CITY ? [Math.min(AREA[0], CITY[0]), Math.min(AREA[1], CITY[1]), Math.max(AREA[2], CITY[2]), Math.max(AREA[3], CITY[3])] : AREA;   // the box of the building-height sources
// a mosaic of Cloud Optimized GeoTIFF tiles over box b (tiles of tileDeg degrees named by their south-west corner),
// read by HTTP range requests at overview `level` (0 = full resolution): row 0 = north; nodata -> null
async function cogMosaic(urlOf, tileDeg, b, level = 0, Arr = Float32Array) {
  let out = null; const reads = [];
  for (let la = Math.floor(b[1] / tileDeg) * tileDeg; la < b[3]; la += tileDeg) for (let lo = Math.floor(b[0] / tileDeg) * tileDeg; lo < b[2]; lo += tileDeg) {
    const url = urlOf(Math.round(la), Math.round(lo)); let tif;
    try { tif = await fromUrl(url); } catch (e) { console.warn('cog: no tile', url, e.message); continue; }
    const im0 = await tif.getImage(0), nIm = await tif.getImageCount(), img = await tif.getImage(Math.min(level, nIm - 1));
    const [w0, s0, e0, n0] = im0.getBoundingBox(), W = img.getWidth(), H = img.getHeight(), px = (e0 - w0) / W, py = (n0 - s0) / H;
    if (!out) { const ow = w0 + Math.floor((b[0] - w0) / px) * px, on = n0 - Math.floor((n0 - b[3]) / py) * py, nx = Math.ceil((b[2] - ow) / px), ny = Math.ceil((on - b[1]) / py);
      out = { w: ow, n: on, e: ow + nx * px, s: on - ny * py, nx, ny, px, py, h: new Arr(nx * ny).fill(Arr === Float32Array ? NaN : 0) }; }
    const cl = (v, a) => Math.max(0, Math.min(a, v));
    const win = [cl(Math.floor((out.w - w0) / px), W), cl(Math.floor((n0 - out.n) / py), H), cl(Math.ceil((out.e - w0) / px), W), cl(Math.ceil((n0 - out.s) / py), H)];
    if (win[2] <= win[0] || win[3] <= win[1]) continue;
    const r = (await img.readRasters({ window: win }))[0], ww = win[2] - win[0], nd = im0.getGDALNoData();
    for (let j = 0; j < out.ny; j++) { const lat = out.n - (j + 0.5) * out.py, tj = Math.floor((n0 - lat) / py) - win[1]; if (tj < 0 || tj >= win[3] - win[1]) continue;
      for (let i = 0; i < out.nx; i++) { const lon = out.w + (i + 0.5) * out.px, ti = Math.floor((lon - w0) / px) - win[0]; if (ti < 0 || ti >= ww) continue; const v = r[tj * ww + ti]; if (v !== nd) out.h[j * out.nx + i] = v; } }
    reads.push({ url, image: Math.min(level, nIm - 1), window: win });
  }
  if (!out) throw new Error('cog: no tile read over ' + b.join(','));
  return { grid: out, reads };
}
// a ring as integers of 1e-6 degree: the first point, then the steps (format place-footprints-2), and back
const encRing = ring => { const o = []; let px = 0, py = 0; ring.slice(0, ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? -1 : undefined).forEach(([x, y], i) => { const X = Math.round(x * 1e6), Yv = Math.round(y * 1e6); o.push(i ? X - px : X, i ? Yv - py : Yv); px = X; py = Yv; }); return o; };
const decRing = a => { const r = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; r.push([x / 1e6, y / 1e6]); } if (r.length) r.push(r[0]); return r; };
const footprintRows = J => J.format === 'place-footprints-2' ? J.rows.map(([id, floors, ring]) => ({ id, floors, ring: decRing(ring) })) : J.rows;
// a grid as a small binary file: a JSON header line, then the values (Float32 or Uint8), gzip
const saveGrid = (f, hdr, arr) => writeFileSync(f, gzipSync(Buffer.concat([Buffer.from(JSON.stringify({ ...hdr, type: arr instanceof Uint8Array ? 'u8' : 'f32' }) + '\n'), Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)])));
function loadGrid(f) { const b = gunzipSync(readFileSync(f)), k = b.indexOf(10), hdr = JSON.parse(b.subarray(0, k).toString('utf8')), body = b.subarray(k + 1), ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
  return { ...hdr, h: hdr.type === 'u8' ? new Uint8Array(ab) : new Float32Array(ab) }; }
// an Overture answer of the surroundings: JSON, or NDJSON (one row a line, header in <file>.meta.json) for the queries
// named in place.surround.ndjson (a city of half a million buildings is more than one Node string can hold)
const outerFile = (ov, k) => join(RAWD, `overture-${k}-${ov.outer.release}.${(SUR?.ndjson || []).includes(k) ? 'ndjson' : 'json'}`);
async function readOuter(f) { if (!f.endsWith('.ndjson')) return JSON.parse(readFileSync(f, 'utf8')); const rows = []; for await (const line of ndjsonLines(f)) rows.push(JSON.parse(line)); return { ...JSON.parse(readFileSync(f + '.meta.json', 'utf8')), rows }; }
async function fetchSurround() {
  if (!SUR) return;
  const m = 0.01, B = [EXT[0] - m, EXT[1] - m, EXT[2] + m, EXT[3] + m];
  // terrain of the surroundings: the DEM adapter's surroundCoverage (WCS) or the COG tiles (Copernicus GLO-30)
  const fd = join(RAWD, 'dem-surround.bin.gz');
  if (!existsSync(fd) || flag('--refetch')) { const D = DEMS;
    if (D.kind === 'wcs20') {
      // the service refuses a box of about 1 x 1 degree (400): parts of at most 0.5 degree, one request at a time, 1 s
      // apart, pasted into one grid at the resolution of the first part
      const cov = D.surroundCoverage || D.ringCoverage || D.coverage, nxp = Math.ceil((B[2] - B[0]) / 0.5), nyp = Math.ceil((B[3] - B[1]) / 0.5), parts = [];
      for (let a = 0; a < nxp; a++) for (let c = 0; c < nyp; c++) { const pb = [B[0] + (B[2] - B[0]) * a / nxp, B[1] + (B[3] - B[1]) * c / nyp, B[0] + (B[2] - B[0]) * (a + 1) / nxp, B[1] + (B[3] - B[1]) * (c + 1) / nyp];
        if (parts.length) await pause(1000); parts.push(await demGrid(pb, cov, null, surDemAd)); }
      const g0 = parts[0].grid, px = (g0.e - g0.w) / g0.nx, py = (g0.n - g0.s) / g0.ny, nx = Math.round((B[2] - B[0]) / px), ny = Math.round((B[3] - B[1]) / py), h = new Float32Array(nx * ny).fill(NaN);
      for (const { grid: g } of parts) { const gx = (g.e - g.w) / g.nx, gy = (g.n - g.s) / g.ny;
        for (let j = 0; j < ny; j++) { const lat = B[3] - (j + 0.5) * py, tj = Math.floor((g.n - lat) / gy); if (tj < 0 || tj >= g.ny) continue;
          for (let i = 0; i < nx; i++) { const lon = B[0] + (i + 0.5) * px, ti = Math.floor((lon - g.w) / gx); if (ti < 0 || ti >= g.nx) continue; const v = g.h[tj * g.nx + ti]; if (v != null) h[j * nx + i] = v; } } }
      saveGrid(fd, { w: B[0], s: B[3] - ny * py, e: B[0] + nx * px, n: B[3], nx, ny, datum: g0.datum, source: g0.source, coverage: cov }, h);
      record('dem-surround', fd, parts.map(p => p.url), { source: D.source, as_fetched: parts.map(p => ({ url: p.url, ...p.fetched.as_fetched })), licence: D.credit }); }
    else if (D.kind === 'copernicus-glo30') { const name = (la, lo) => { const ns = (la < 0 ? 'S' : 'N') + String(Math.abs(la)).padStart(2, '0'), ew = (lo < 0 ? 'W' : 'E') + String(Math.abs(lo)).padStart(3, '0'); return `Copernicus_DSM_COG_10_${ns}_00_${ew}_00_DEM`; };
      const { grid: G0, reads } = await cogMosaic((la, lo) => `${D.url}${name(la, lo)}/${name(la, lo)}.tif`, 1, B, 0);
      saveGrid(fd, { w: G0.w, s: G0.s, e: G0.e, n: G0.n, nx: G0.nx, ny: G0.ny, datum: D.datum, source: D.source }, G0.h);
      record('dem-surround', fd, reads.map(r => r.url), { source: D.source, windows: reads, as_fetched: { note: 'HTTP range requests of Cloud Optimized GeoTIFFs: no single file as fetched; the windows and the stored grid (sha256) fix the input' }, licence: D.credit }); }
    console.log('dem surround: done'); }
  // land cover (ESA WorldCover), overview 1 (about 20 m)
  const lcAd = REG.adapters.find(a => a.id === SUR.land_cover && a.landCover), fl = join(RAWD, 'landcover.bin.gz');
  if (lcAd && (!existsSync(fl) || flag('--refetch'))) { const LC = lcAd.landCover, tname = (la, lo) => (la < 0 ? 'S' : 'N') + String(Math.abs(la)).padStart(2, '0') + (lo < 0 ? 'W' : 'E') + String(Math.abs(lo)).padStart(3, '0');
    const { grid: G0, reads } = await cogMosaic((la, lo) => LC.url.replace('{tile}', tname(la, lo)), LC.tile_deg, B, 1, Uint8Array);
    saveGrid(fl, { w: G0.w, s: G0.s, e: G0.e, n: G0.n, nx: G0.nx, ny: G0.ny, source: LC.source }, G0.h);
    record('landcover', fl, reads.map(r => r.url), { source: LC.source, windows: reads, as_fetched: { note: 'HTTP range requests of Cloud Optimized GeoTIFFs (overview 1, about 20 m): no single file as fetched; the windows and the stored grid (sha256) fix the input' }, licence: lcAd.licence });
    console.log(`land cover: ${G0.nx} x ${G0.ny}`); }
  // Microsoft footprints with a height over the city box (raw only: an input of place-city-heights, by its SHA-256)
  const msAd = fpAds.find(a => a.buildingHeights.kind === 'ms-buildings'), fm = join(RAWD, 'ms-city.json.gz');
  if (CITY && msAd && (!existsSync(fm) || flag('--refetch'))) { const Bm = msAd.buildingHeights, lf = join(RAWD, 'ms-dataset-links.csv'); if (!existsSync(lf)) writeFileSync(lf, await get(Bm.links));
    const qks = [...new Set([[HB[0], HB[1]], [HB[2], HB[1]], [HB[0], HB[3]], [HB[2], HB[3]]].map(([lo, la]) => quadkey(lo, la, Bm.zoom)))];
    const links = readFileSync(lf, 'utf8').split('\n').map(l => l.split(',')).filter(c => qks.includes(c[1])), rows = [], got = []; let n = 0;
    const inHB = ring => ring.some(([lon, lat]) => lon > HB[0] && lon < HB[2] && lat > HB[1] && lat < HB[3]);
    for (const [loc, qk, url] of links) { const zf = join(RAWD, `ms-${loc}-${qk}.csv.gz`); if (!existsSync(zf)) { writeFileSync(zf, await get(url)); await pause(1000); }
      const zb = readFileSync(zf); got.push({ url, bytes: zb.length, sha256: sha(zb) });
      for (const line of gunzipSync(zb).toString('utf8').split('\n')) { if (!line.trim()) continue; n++; const ft = JSON.parse(line), h = ft.properties.height; if (!(h > 0)) continue;
        const ring = (ft.geometry.type === 'Polygon' ? ft.geometry.coordinates : ft.geometry.coordinates[0])[0].map(([x, y]) => [r7(x), r7(y)]); if (inHB(ring)) rows.push({ ring, height: Math.round(h * 100) / 100 }); } }
    jz(fm, { source: Bm.source, quadkeys: qks, box: HB, rows });
    record('heights-ms-city', fm, links.map(c => c[2]), { source: Bm.source, as_fetched: got, kept: rows.length, licence: msAd.licence, note: 'footprints with a height over the core and city box; raw (input of place-city-heights)' });
    console.log(`ms city: ${rows.length} footprints with a height`); }
  // Overture themes (roads, rail, water, places, peaks over the extent; streets and buildings over the city box)
  const ov = REG.adapters.find(a => a.id === SUR.outer && a.outer);
  if (ov) for (const [k, Q] of Object.entries(ov.outer.queries)) {
    const box = Q.box === 'city' ? (CITY || AREA) : EXT, f = outerFile(ov, k);
    if (existsSync(f) && !flag('--refetch')) continue;
    const bb = box.map(v => v.toFixed(6));
    execFileSync(process.env[ov.outer.python] || 'python3', ['-I', join(CW, '..', ov.outer.script), ov.outer.release, Q.theme, Q.type, ...bb, f, Q.columns, Q.where], { stdio: 'inherit' });
    const R = f.endsWith('.ndjson') ? { ...JSON.parse(readFileSync(f + '.meta.json', 'utf8')), rows: { length: JSON.parse(readFileSync(f + '.meta.json', 'utf8')).rows_count } } : JSON.parse(readFileSync(f, 'utf8'));
    record('overture-' + k, f, `s3://overturemaps-us-west-2/release/${ov.outer.release}/theme=${Q.theme}/type=${Q.type}/ (bbox ${bb.join(',')}; files ${R.files_read.join(' ')})`,
      { source: `overture-${Q.theme}`, request: `DuckDB read_parquet over HTTPS of the ${R.files_listed} files of the release, filter on bbox and: ${Q.where || 'none'}`, records: R.rows.length, licence: ov.licence,
        as_fetched: { note: 'the query answer as written by cwplans/tools/fetch-overture-theme.py (raw folder); sha256 above' } });
  }
  // the IGN floors (adapter kind overture-dataset-floors, behind the region switch): the records of the city buildings whose
  // num_floors source is the adapter's dataset, committed apart in sources/<source>.json (delete it and the switch to remove)
  for (const a of fpAds.filter(x => x.buildingHeights.kind === 'overture-dataset-floors')) {
    const B = a.buildingHeights, f = fpFile(a), rf = ov && join(RAWD, `overture-buildings-${ov.outer.release}.json`); if (!rf || !existsSync(rf) || (existsSync(f) && !flag('--refetch'))) continue;
    const R = JSON.parse(readFileSync(rf, 'utf8')), rows = [], lic = {};
    for (const r of R.rows) { if (r.num_floors == null) continue; const x = r.sources.find(q => q.property === '/properties/num_floors') || r.sources.find(q => !q.property) || r.sources[0]; if (!x || x.dataset !== B.dataset) continue;
      lic[x.license || ''] = (lic[x.license || ''] || 0) + 1; const g = r.geometry, ring = (g.type === 'Polygon' ? g.coordinates : g.coordinates[0])[0]; rows.push([r.id, r.num_floors, encRing(ring)]); }
    const crop = { format: 'place-footprints-2', source: B.source, about: a.about, licence: a.licence, credit: B.credit, release: R.release, bbox: R.bbox, dataset: B.dataset, licence_fields_seen: lic,
      note: 'only the Overture buildings records over the city box whose num_floors source is the dataset above (their licence field is empty: kept apart, under review; owner 2026-10-20). Remove: delete this file and the adapter id in place.heights of the region config.',
      rows_fields: ['overture_id', 'num_floors', 'ring: outer ring in integer micro-degrees, the first point (lon, lat) then the steps to each next point (closing point left out)'], rows };
    writeFileSync(f, JSON.stringify(crop) + '\n');
    record('heights-' + a.id, f, `s3://overturemaps-us-west-2/release/${R.release}/theme=buildings/type=building/ (bbox ${R.bbox.join(',')})`, { source: B.source, request: 'the city buildings answer of world-overture-outer (query "buildings"), rows whose num_floors source dataset is ' + B.dataset, kept: rows.length, committed: rel(f), licence: a.licence });
    console.log(`heights ${a.id}: ${rows.length} records (licence fields ${JSON.stringify(lic)})`); }
}
// LoD2 (citygml-lod2-atom): the dataset feed lists one zip per tile of tile_m in the model's projected CRS, named by the
// km of its south-west corner (Berlin: LoD2_<e>_<n>.zip, 1 km, EPSG:25833). The tiles that meet the core and the city box
// are fetched one at a time; each is parsed at once (place-lod2.mjs) and, unless it holds core buildings or --keep-raw is
// given, deleted (its SHA-256 as fetched stays in the fetch log): the whole of Berlin is about 5 GB of zips
async function fetchLod2(a) {
  const B = a.buildingHeights, f = join(RAWD, `heights-${a.id}.json.gz`), fc = join(RAWD, `lod2-core-${a.id}.json.gz`), zd = join(RAWD, 'lod2'); if (existsSync(f) && existsSync(fc) && !flag('--refetch')) return;
  mkdirSync(zd, { recursive: true });
  const { parseLod2, heightParts } = await import('./place-lod2.mjs');
  const P = proj4(B.proj4, 'WGS84'), feed = (await get(B.feed)).toString('utf8'), re = new RegExp(B.zip_re, 'g');
  const listed = [...new Set([...feed.matchAll(re)].map(m => m[0]))].map(u => { const m = u.match(new RegExp(B.zip_re)); return { url: u, e: +m[1], n: +m[2] }; });
  const m = 0.003, box = [HB[0] - m, HB[1] - m, HB[2] + m, HB[3] + m], k = B.tile_m / 1000;
  const corners = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]].map(q => P.inverse(q)), ex = [Math.min(...corners.map(q => q[0])), Math.min(...corners.map(q => q[1])), Math.max(...corners.map(q => q[0])), Math.max(...corners.map(q => q[1]))];
  const tiles = listed.filter(t => t.e * 1000 + B.tile_m > ex[0] && t.e * 1000 < ex[2] && t.n * 1000 + B.tile_m > ex[1] && t.n * 1000 < ex[3]).sort((x, y) => x.e - y.e || x.n - y.n);
  const coreEx = [[AREA[0], AREA[1]], [AREA[2], AREA[1]], [AREA[0], AREA[3]], [AREA[2], AREA[3]]].map(q => P.inverse(q)), cx = [Math.min(...coreEx.map(q => q[0])) - 100, Math.min(...coreEx.map(q => q[1])) - 100, Math.max(...coreEx.map(q => q[0])) + 100, Math.max(...coreEx.map(q => q[1])) + 100];
  const isCore = t => t.e * 1000 + B.tile_m > cx[0] && t.e * 1000 < cx[2] && t.n * 1000 + B.tile_m > cx[1] && t.n * 1000 < cx[3];
  console.log(`lod2 ${a.id}: ${listed.length} tiles in the feed, ${tiles.length} meet the core and city box (${tiles.filter(isCore).length} core)`);
  const inBox = c => c[0] >= box[0] && c[0] <= box[2] && c[1] >= box[1] && c[1] <= box[3], inCore = c => c[0] >= AREA[0] && c[0] < AREA[2] && c[1] >= AREA[1] && c[1] < AREA[3];
  const parts = [], core = [], got = []; let nt = 0;
  for (const t of tiles) {
    const zf = join(zd, t.url.split('/').pop()); let zb;
    if (existsSync(zf) && !flag('--refetch')) zb = readFileSync(zf); else { for (let tr = 0; ; tr++) { try { zb = await get(t.url); break; } catch (e) { if (tr >= 3) throw e; await pause(5000); } } writeFileSync(zf, zb); await pause(150); }
    got.push({ url: t.url, bytes: zb.length, sha256: sha(zb) });
    const names = execFileSync('unzip', ['-Z1', zf], { encoding: 'utf8' }).split('\n').filter(x => /\.(xml|gml)$/i.test(x));
    for (const nm of names) { const xml = execFileSync('unzip', ['-p', zf, nm], { maxBuffer: 1 << 30 }).toString('utf8');
      // (a JSON round trip: the ids are slices of the file's string and would keep every 50 MB file alive)
      const units = JSON.parse(JSON.stringify(parseLod2(xml, q => P.forward(q), { full: inCore })));
      for (const u of units) { if (!inBox(u.c)) continue; if (u.polys) core.push(u); const hp = heightParts([u])[0]; parts.push({ ...hp, bid: u.bid, kind: u.kind }); } }
    if (!isCore(t) && !flag('--keep-raw')) rmSync(zf);
    if (++nt % 50 === 0) console.log(`  lod2: ${nt} / ${tiles.length} tiles, ${parts.length} parts`);
  }
  jz(f, { adapter: a.id, source: B.source, crs: B.proj4, parts });
  jz(fc, { adapter: a.id, source: B.source, area: AREA, units: core.sort((x, y) => x.id.localeCompare(y.id)) });
  record('heights-' + a.id, f, B.feed, { source: B.source, request: `the dataset feed, then ${tiles.length} tile zips over the core and city box (one at a time, 150 ms apart)`, as_fetched: got, parts: parts.length, core_units: core.length, licence: a.licence,
    committed: false, note: 'the zips are parsed at once (cwplans/tools/place-lod2.mjs) and deleted unless they hold core buildings; the parts (measured height, footprint) and the core polygons stay in the raw folder (raw/lod2-core-' + a.id + '.json.gz); the tiles and features.json hold the transformed geometry' });
  const cb = readFileSync(fc); flog['lod2-core-' + a.id] = { url: B.feed, fetched: new Date().toISOString(), bytes: cb.length, sha256: sha(cb), file: rel(fc), source: B.source, units: core.length, licence: a.licence, as_fetched: { note: 'the core tiles of the heights-' + a.id + ' record (same zips)' } }; saveFlog();
  console.log(`lod2 ${a.id}: ${parts.length} parts over the core and city box, ${core.length} core units with polygons`);
}
async function fetchHeights() {
  for (const a of rasAds) await fetchRaster(a);
  for (const a of fpAds) { const k = a.buildingHeights.kind; if (k === 'overture-buildings') await fetchOverture(a); else if (k === 'ms-buildings') await fetchMs(a); }   // overture-dataset-floors: fetchSurround (from the city buildings)
  for (const a of natAds) {
    if (a.buildingHeights.kind === 'citygml-lod2-atom') { await fetchLod2(a); continue; }
    const B = a.buildingHeights, f = join(RAWD, `heights-${a.id}.json.gz`); if (existsSync(f) && !flag('--refetch')) continue;
    const zip = join(RAWD, `${a.id}.zip`); writeFileSync(zip, await get(B.url));
    const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean), member = names.find(n => new RegExp(B.member).test(n));
    const gml = execFileSync('unzip', ['-p', zip, member], { maxBuffer: 1 << 30 }).toString('utf8');
    const P = proj4(B.proj4, 'WGS84'), parts = [], m = 0.003;
    for (const blk of gml.split('<gml:featureMember>').slice(1)) {
      const id = (blk.match(/<base:localId>([^<]+)</) || [])[1], fl = blk.match(/numberOfFloorsAboveGround>(\d+)</), pos = blk.match(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([^<]+)</);
      if (!id || !fl || !pos) continue;
      const n = pos[1].trim().split(/\s+/).map(Number), ring = [];
      for (let i = 0; i + 1 < n.length; i += 2) { const [lon, lat] = P.forward([n[i], n[i + 1]]); ring.push([r7(lon), r7(lat)]); }
      if (!ring.some(([lon, lat]) => lon > HB[0] - m && lon < HB[2] + m && lat > HB[1] - m && lat < HB[3] + m)) continue;   // the core and the city box
      parts.push({ id, floors: +fl[1], ring });
    }
    jz(f, { adapter: a.id, source: B.source, member, parts });
    record('heights-' + a.id, f, B.url, { source: B.source, member, parts: parts.length, zip_sha256: sha(readFileSync(zip)), as_fetched: { bytes: readFileSync(zip).length, sha256: sha(readFileSync(zip)) }, committed: false, note: 'the original zip and the parts stay in the raw folder (licence: transformed data only)' });
    console.log(`heights ${a.id}: ${parts.length} parts in the area`);
  }
}

// ---------- dataflow runtime (as build-uk-skeleton.mjs): inputs by SHA-256, activity id, memo by log.json
const fileIn = (p, label) => ({ label, path: rel(p), sha256: sha(readFileSync(p)) });
async function run(op, inputs, params, body) {
  const act = sha(JSON.stringify([op.id, op.version, inputs.map(i => i.sha256), params])).slice(0, 16);
  const prev = blog.activities.find(a => a.activity === act);
  if (prev && !flag('--force') && prev.outputs.every(o => existsSync(absOf(o.path)) && sha(readFileSync(absOf(o.path))) === o.sha256)) { console.log(`${op.id}: in the log (${act})`); return prev; }
  const t0 = Date.now(), outs = await body(params), rec = { activity: act, operation: op.id, version: op.version, skill: op.skill, tool: TOOL, inputs, params,
    outputs: outs.map(p => ({ path: rel(p), sha256: sha(readFileSync(p)), bytes: readFileSync(p).length })), ms: Date.now() - t0, at: new Date().toISOString() };
  if (rec.outputs.some(o => o.path.startsWith('data/raw'))) rec.note = 'outputs under data/raw are intermediate (not committed); their hashes fix the next step';
  blog.activities = blog.activities.filter(a => a.activity !== act).concat(rec);   // append-only (a forced re-run replaces its own record)
  console.log(`${op.id}: ran (${act}, ${rec.ms} ms)`); return rec;
}
const OPS = {
  select: { id: 'place-select-osm', version: 4, skill: 'docklands-3d-page' },     // 4: named sites (areas such as a research institute): a named point and the site of the buildings inside; 3: roof:shape, roof:height, roof:angle, roof:orientation kept
  heights: { id: 'place-heights', version: 5, skill: 'docklands-data-curation' },  // 5: national measured heights (LoD2 measuredHeight) after OSM height, before OSM levels; 2: raster heights (GHSL), roofs (OSM roof:shape, then the region's roof rule); 3: Overture and Microsoft footprints; 4: IGN floors (switch) and the validation counts
  tiles: { id: 'place-tiles', version: 6, skill: 'docklands-3d-page' },            // 6: official LoD2 buildings in the core (input lod2-core), DEM opening (dem_open_px); 4: sloped roofs (gabled, hipped, pyramidal, skillion, dome); 5: with a surround block the tileset goes to place-lod
  outer: { id: 'place-select-outer', version: 2, skill: 'docklands-3d-page' },     // 2: the extra geometry classes (IGN, Microsoft) where OSM has none. Overture (OSM-sourced) roads, rail, water, names, peaks, city buildings
  cityHeights: { id: 'place-city-heights', version: 3, skill: 'docklands-data-curation' },   // 3: national measured heights (LoD2); 2: counts by geometry class. The place-heights rule over the city buildings
  lod: { id: 'place-lod', version: 3, skill: 'docklands-3d-page' },   // 3: DEM opening of the surroundings (dem_open_px), Overture city buildings as NDJSON
  selBlocks: { id: 'place-select-blocks', version: 2, skill: 'docklands-3d-page' },   // 2: the extra geometry classes (place.blocks.geometry: Microsoft) where OSM has none; 1: Overture buildings (OSM geometry) in a boundary, outside the model boxes; non-OSM height values by dataset
  blocks: { id: 'place-blocks', version: 6, skill: 'docklands-3d-page' },            // 6: far forms (place.blocks.far, issue #13): the coarse levels draw the street blocks of their leaf cells (adjacent buildings of similar height merged, place-lite.mjs streetBlocks) whose seen size is at least min_m2 of the level (farKeep), no squares; 5: the place-blocks 3 leaf rule kept with compact boxes (leaf_outlines: an irregular building, >= outline_min_m2 and filling < box_fill of its oriented box, as its outline simplified at simplify_m; architecture rule 6); 4: the UK lite v2 way (place.blocks.leaf_boxes 'compact'): every building not named as one 8-byte compact box at the leaves (cwplans-boxes-1: true centroid, area, angle and long / short ratio of its rotated rectangle, height, height source, class), named buildings as outlines; coarse levels: tall or big buildings as boxes, the rest merged squares turned to their grain (compact), the leaves' parents refined only within leaf_within_m; 3: a class index per block (OpenStreetMap, merged, the extra geometry classes), counts by class; 2: merged boxes grow with the built share of their square; 1: the block tree (merged boxes by square at the coarse levels; boxes, outlines and named buildings at the leaves)                // 2: block metadata in glb extras (class, height, its source), counts by class. The tile tree: core leaves, city blocks, surroundings terrain
};

// ---------- geometry helpers (lon/lat rings; local metres by a flat approximation for areas and tests)
const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2 * mLon * mLat; };   // > 0 counter-clockwise
const centroid = r => { let x = 0, y = 0; const n = r.length - (r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? 1 : 0); for (let i = 0; i < n; i++) { x += r[i][0]; y += r[i][1]; } return [x / n, y / n]; };
const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const inPoly = (p, rings) => inRing(p, rings[0]) && !rings.slice(1).some(h => inRing(p, h));
const open = r => (r.length > 1 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? r.slice(0, -1) : r);
// ways into closed rings (multipolygon members): join end to end
function joinRings(ways) {
  const rings = [], left = ways.map(w => w.slice());
  while (left.length) {
    let r = left.shift();
    for (let guard = 0; r[0] !== r.at(-1) && guard < 1000; guard++) {
      const i = left.findIndex(w => w[0] === r.at(-1) || w.at(-1) === r.at(-1)); if (i < 0) break;
      const w = left.splice(i, 1)[0]; r = r.concat((w[0] === r.at(-1) ? w : w.slice().reverse()).slice(1));
    }
    if (r.length >= 4 && r[0] === r.at(-1)) rings.push(r);
  }
  return rings;
}
const num = v => { if (v == null) return null; const m = String(v).replace(',', '.').match(/^\s*(-?\d+(\.\d+)?)\s*(m|metres|meters)?\s*$/); return m ? +m[1] : null; };

// ---------- operation 1: select from OSM (pure: the raw elements -> buildings, parts, areas, lines, named points)
const KIND = {
  water: t => t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin' || t.water != null && t.natural !== 'wetland',
  green: t => ['park', 'garden', 'pitch', 'playground', 'golf_course'].includes(t.leisure) || ['grass', 'recreation_ground', 'meadow', 'village_green', 'cemetery', 'allotments', 'forest', 'orchard', 'vineyard'].includes(t.landuse) || ['wood', 'scrub', 'grassland', 'heath'].includes(t.natural),
  paved: t => (t.highway === 'pedestrian' && (t.area === 'yes' || t.type === 'multipolygon')) || t.place === 'square' || t['area:highway'] != null || ['parking'].includes(t.amenity) || ['railway', 'construction', 'brownfield'].includes(t.landuse),
};
const LINE = { motorway: 14, trunk: 12, primary: 11, secondary: 10, tertiary: 9, unclassified: 7, residential: 7, living_street: 6, pedestrian: 6, service: 4, footway: 2.2, path: 1.6, cycleway: 2, steps: 2.2, track: 3 };
function selectOsm(osm, names, altNames = []) {
  const N = new Map(), W = new Map(); for (const e of osm.elements) { if (e.type === 'node') N.set(e.id, e); else if (e.type === 'way') W.set(e.id, e); }
  const ll = id => { const n = N.get(id); return n ? [r7(n.lon), r7(n.lat)] : null; };
  const ringOf = ids => { const r = ids.map(ll); return r.every(Boolean) ? r : null; };
  const nameOf = t => { for (const k of names) if (t[k]) return t[k]; return null; };
  // a second name in another script or language (region config place.alt_names: e.g. Cyrillic beside Latin)
  const altOf = t => { const n0 = nameOf(t); for (const k of altNames) if (t[k] && t[k] !== n0) return t[k]; return null; };
  const out = { buildings: [], areas: [], lines: [], points: [], skipped: { incomplete: 0 } };
  const polys = [], sites = [];   // [id, tags, rings]; named sites (areas that are neither buildings nor water, green, paved)
  for (const w of W.values()) { const t = w.tags || {}; if (w.nodes.length < 4 || w.nodes[0] !== w.nodes.at(-1)) continue; const r = ringOf(w.nodes); if (!r) { out.skipped.incomplete++; continue; } polys.push(['w' + w.id, t, [r]]); }
  for (const e of osm.elements) if (e.type === 'relation' && e.tags && e.tags.type === 'multipolygon') {
    const ways = role => e.members.filter(m => m.type === 'way' && (m.role || 'outer') === role).map(m => W.get(m.ref)?.nodes).filter(Boolean);
    const outer = joinRings(ways('outer')), inner = joinRings(ways('inner'));
    for (const o of outer) { const r = ringOf(o); if (!r) { out.skipped.incomplete++; continue; } const holes = inner.map(ringOf).filter(h => h && inRing(h[0], r)); polys.push(['r' + e.id, e.tags, [r, ...holes]]); }
  }
  for (const [id, t, rings] of polys) {
    const isB = t.building && t.building !== 'no', isP = t['building:part'] && t['building:part'] !== 'no';
    if (isB || isP) {
      const c = centroid(rings[0]); if (c[0] < AREA[0] || c[0] >= AREA[2] || c[1] < AREA[1] || c[1] >= AREA[3]) continue;
      const g = k => t[k] ?? null;
      out.buildings.push({ id, part: !isB && isP, kind: isB ? t.building : t['building:part'], name: nameOf(t), alt: altOf(t), addr: t['addr:street'] ? `${t['addr:street']}${t['addr:housenumber'] ? ' ' + t['addr:housenumber'] : ''}` : null,
        height: num(g('height')), min_height: num(g('min_height')), levels: num(g('building:levels')), min_level: num(g('building:min_level')), roof_levels: num(g('roof:levels')),
        roof_shape: g('roof:shape'), roof_height: num(g('roof:height')), roof_angle: num(g('roof:angle')), roof_orientation: g('roof:orientation'),
        colour: g('building:colour'), roof_colour: g('roof:colour'), wikidata: g('wikidata'), rings, c: [r7(c[0]), r7(c[1])] });
      continue;
    }
    const k = Object.keys(KIND).find(k => KIND[k](t)); if (k) out.areas.push({ id, kind: k, name: nameOf(t), alt: altOf(t), rings });
    // a named site drawn as an area (a research institute, a university, a hospital, a castle's grounds): a named point
    // at its centroid (search) and the site of the buildings inside it (cards)
    else { const sk = t.amenity || t.tourism || t.historic || t.office || t.leisure || t.craft || null; if (sk && nameOf(t)) { const c = centroid(rings[0]);
      if (c[0] >= AREA[0] && c[0] < AREA[2] && c[1] >= AREA[1] && c[1] < AREA[3]) sites.push({ id, name: nameOf(t), alt: altOf(t), kind: sk, wikidata: t.wikidata || null, rings, c: [r7(c[0]), r7(c[1])], a: Math.abs(ringArea(open(rings[0]))) }); } }
  }
  for (const w of W.values()) { const t = w.tags || {};
    const hw = t.highway, rw = t.railway, ww = t.waterway;
    const wd = hw ? LINE[hw.replace(/_link$/, '')] : rw && ['rail', 'tram', 'light_rail', 'narrow_gauge'].includes(rw) ? 3 : ww && ['river', 'canal', 'stream', 'ditch', 'drain'].includes(ww) ? (ww === 'river' ? 12 : ww === 'canal' ? 8 : 2) : null;
    if (!wd || (hw && t.area === 'yes')) continue; if (t.tunnel && t.tunnel !== 'no' || +t.layer < 0) continue;
    const pts = w.nodes.map(ll).filter(Boolean); if (pts.length < 2) continue;
    out.lines.push({ id: 'w' + w.id, kind: hw ? 'road' : rw ? 'rail' : 'water', cls: hw || rw || ww, width: +(num(t.width) || wd), name: nameOf(t), alt: altOf(t), pts });
  }
  for (const n of N.values()) { const t = n.tags; if (!t || !nameOf(t)) continue; const k = t.amenity || t.shop || t.tourism || t.historic || t.leisure || t.office || t.craft || t.place || null; if (!k) continue;
    if (n.lon < AREA[0] || n.lon >= AREA[2] || n.lat < AREA[1] || n.lat >= AREA[3]) continue;
    out.points.push({ id: 'n' + n.id, name: nameOf(t), alt: altOf(t), kind: k, lon: r7(n.lon), lat: r7(n.lat), addr: t['addr:street'] ? `${t['addr:street']}${t['addr:housenumber'] ? ' ' + t['addr:housenumber'] : ''}` : null }); }
  for (const x of sites) out.points.push({ id: x.id, name: x.name, alt: x.alt, kind: x.kind, lon: x.c[0], lat: x.c[1], addr: null });
  // the site of a building: the smallest named site whose outline holds its centroid (its name and Wikidata id)
  sites.sort((a, b) => a.a - b.a);
  for (const b of out.buildings) { const st = sites.find(x => x.id !== b.id && inPoly(b.c, x.rings)); if (st) b.site = st.name + (st.wikidata ? ` (Wikidata ${st.wikidata})` : ''); }
  // building outlines that hold parts (Simple 3D Buildings: the parts are drawn, the outline is not)
  const parts = out.buildings.filter(b => b.part);
  // (a part without a name takes its outline's name, address and Wikidata id, and names the outline as its parent: the
  // text interface then names the building, e.g. a town hall drawn only as parts)
  for (const b of out.buildings) if (!b.part) { const mine = parts.filter(p => inPoly(p.c, b.rings)); b.has_parts = mine.length > 0;
    for (const p of mine) { p.parent = b.id; p.name ||= b.name; p.alt ||= b.alt; p.addr ||= b.addr; p.wikidata ||= b.wikidata; p.site ||= b.site; } }
  out.buildings.sort((a, b) => a.id.localeCompare(b.id)); out.areas.sort((a, b) => a.id.localeCompare(b.id)); out.lines.sort((a, b) => a.id.localeCompare(b.id)); out.points.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

// ---------- roofs: the oriented box of a footprint and roof shapes as the minimum of planes (shared by operations 2 and 3)
// Local metres round a reference point (flat approximation; buildings are tens of metres across).
const toXY = (r, ref) => r.map(([lo, la]) => [(lo - ref[0]) * mLon, (la - ref[1]) * mLat]);
const toLL = ([x, y], ref) => [ref[0] + x / mLon, ref[1] + y / mLat];
function hull(pts) {   // monotone chain, counter-clockwise
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = []; for (const q of p) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// minimum-area oriented box (rotating the hull's edges): centre (x, y), angle of the long axis, half length hl >= half width hw
function obb(xy) {
  const H = hull(xy); let best = null;
  for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length], t = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(t), s = Math.sin(t);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity; for (const [x, y] of H) { const u = x * c + y * s, v = -x * s + y * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const area = (u1 - u0) * (v1 - v0); if (!best || area < best.area) { const um = (u0 + u1) / 2, vm = (v0 + v1) / 2; best = { area, t, x: um * c - vm * s, y: um * s + vm * c, hl: (u1 - u0) / 2, hw: (v1 - v0) / 2 }; } }
  if (best.hw > best.hl) best = { ...best, t: best.t + Math.PI / 2, hl: best.hw, hw: best.hl };
  return best;
}
// OSM roof:shape -> the shapes drawn
const ROOF_CLASS = { gabled: 'gabled', saltbox: 'gabled', gambrel: 'gabled', round: 'gabled', hipped: 'hipped', 'half-hipped': 'hipped', mansard: 'hipped', side_hipped: 'hipped', pyramidal: 'pyramidal', cone: 'pyramidal', dome: 'dome', onion: 'dome', skillion: 'skillion', lean_to: 'skillion', flat: 'flat' };
// planes of a roof in the box frame (a along the long axis, b across), each [k0, ka, kb]: z = wall + R (k0 + ka a + kb b);
// the roof surface is the minimum of its planes (gabled, hipped, pyramidal, skillion; a dome is drawn as rings)
function roofPlanes(shape, B, across) {
  const { hl, hw } = B;
  if (shape === 'gabled') return across ? [[1, -1 / hl, 0], [1, 1 / hl, 0]] : [[1, 0, -1 / hw], [1, 0, 1 / hw]];
  if (shape === 'hipped') return [[1, 0, -1 / hw], [1, 0, 1 / hw], [hl / hw, -1 / hw, 0], [hl / hw, 1 / hw, 0]];   // equal pitch on all four sides
  if (shape === 'pyramidal') return [[1, 0, -1 / hw], [1, 0, 1 / hw], [1, -1 / hl, 0], [1, 1 / hl, 0]];
  if (shape === 'skillion') return [[0.5, 0, 0.5 / hw]];   // one plane rising across the box (roof:direction not read)
  return null;
}

// ---------- operation 2: heights and roofs (pure)
// height: OSM height > OSM building:levels x storey > national floors x storey > (small kinds: 3 m) > raster cell
// estimate (GHSL) > default. roof: OSM roof:shape (classes above) > the region's roof_rule > flat. A sloped roof's height:
// roof:height > roof:levels x storey > roof:angle > the rule's pitch over the half width (capped). Sources whose height
// is the top of the roof (OSM height, GHSL) keep it as the top; the others give the eaves and the roof goes on top.
const SMALL = new Set(['garage', 'garages', 'shed', 'kiosk', 'hut', 'carport', 'toilets', 'service', 'cabin', 'bunker', 'transformer_tower', 'roof', 'container', 'stable']);
function rasterSampler(G) {
  const dx = (G.e - G.w) / G.nx, dy = (G.n - G.s) / G.ny;
  return (lon, lat) => { const i = Math.floor((lon - G.w) / dx), j = Math.floor((G.n - lat) / dy); if (i < 0 || j < 0 || i >= G.nx || j >= G.ny) return null; const v = G.h[j * G.nx + i]; return v > 0 ? v : null; };
}
// footprint sources (Overture, Microsoft): an index of their rows by centroid cell, and the match of an OSM outline: the
// centroid of one inside the other, the smaller area at least min_area_ratio of the larger; the best ratio wins
function footprintIndex(src) {
  const grid = new Map(), gk = (lon, lat) => Math.floor(lon / 0.0005) + ',' + Math.floor(lat / 0.0005);
  for (const r of src.rows) { const ring = open(r.ring); if (ring.length < 3) continue; r.c = centroid(ring); r.a = Math.abs(ringArea(ring)); r.rings = [r.ring]; const k = gk(...r.c); (grid.get(k) || grid.set(k, []).get(k)).push(r); }
  return rings => { const r0 = rings[0], c = centroid(open(r0)), a = Math.abs(ringArea(open(r0))); let w0 = Infinity, s0 = Infinity, e0 = -Infinity, n0 = -Infinity; for (const [x, y] of r0) { w0 = Math.min(w0, x); e0 = Math.max(e0, x); s0 = Math.min(s0, y); n0 = Math.max(n0, y); }
    let best = null;
    for (let i = Math.floor(w0 / 0.0005) - 1; i <= Math.floor(e0 / 0.0005) + 1; i++) for (let j = Math.floor(s0 / 0.0005) - 1; j <= Math.floor(n0 / 0.0005) + 1; j++) for (const q of grid.get(i + ',' + j) || []) {
      if (!(inPoly(q.c, rings) || inRing(c, q.ring))) continue; const ratio = Math.min(a, q.a) / Math.max(a, q.a); if (ratio < src.min_area_ratio) continue; if (!best || ratio > best.ratio) best = { q, ratio }; }
    return best ? best.q : null; };
}
function heightsOf(sel, nat, rasters, P, fps = []) {
  // national parts: a coarse grid of their centroids, then each OSM polygon takes the area-weighted median of the floors
  // of the parts whose centroid lies inside it
  const grid = new Map(), gk = (lon, lat) => Math.floor(lon / 0.0005) + ',' + Math.floor(lat / 0.0005);
  for (const p of nat) { const c = centroid(p.ring), a = Math.abs(ringArea(p.ring)); p.c = c; p.a = a; if (p.floors == null) continue; const k = gk(...c); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
  const natFloors = rings => { const r = rings[0]; let w0 = Infinity, s0 = Infinity, e0 = -Infinity, n0 = -Infinity; for (const [x, y] of r) { w0 = Math.min(w0, x); e0 = Math.max(e0, x); s0 = Math.min(s0, y); n0 = Math.max(n0, y); }
    const got = []; for (let i = Math.floor(w0 / 0.0005); i <= Math.floor(e0 / 0.0005); i++) for (let j = Math.floor(s0 / 0.0005); j <= Math.floor(n0 / 0.0005); j++) for (const p of grid.get(i + ',' + j) || []) if (inPoly(p.c, rings)) got.push(p);
    if (!got.length) return null; got.sort((a, b) => a.floors - b.floors); const tot = got.reduce((s, p) => s + p.a, 0); let acc = 0; for (const p of got) { acc += p.a; if (acc >= tot / 2) return { floors: p.floors, parts: got.length }; } return null; };
  // national MEASURED heights (parts with h: the official LoD2 models' measuredHeight, ground to the highest roof point):
  // the area-weighted median of the parts whose centroid lies inside the outline, else the part whose footprint holds the
  // outline's centroid (an OSM building:part smaller than the official building)
  const natH = nat.filter(p => p.h != null && p.h > 0), hGrid = new Map(); for (const p of natH) { const k = gk(...p.c); (hGrid.get(k) || hGrid.set(k, []).get(k)).push(p); }
  const natHeight = (rings, c0) => { if (!natH.length) return null; const r = rings[0]; let w0 = Infinity, s0 = Infinity, e0 = -Infinity, n0 = -Infinity; for (const [x, y] of r) { w0 = Math.min(w0, x); e0 = Math.max(e0, x); s0 = Math.min(s0, y); n0 = Math.max(n0, y); }
    const got = []; for (let i = Math.floor(w0 / 0.0005); i <= Math.floor(e0 / 0.0005); i++) for (let j = Math.floor(s0 / 0.0005); j <= Math.floor(n0 / 0.0005); j++) for (const p of hGrid.get(i + ',' + j) || []) if (inPoly(p.c, rings)) got.push(p);
    if (!got.length) { const [i0, j0] = gk(...c0).split(',').map(Number); for (let i = i0 - 2; i <= i0 + 2; i++) for (let j = j0 - 2; j <= j0 + 2; j++) for (const p of hGrid.get(i + ',' + j) || []) if (inRing(c0, p.ring)) return { h: p.h, parts: 1 }; return null; }
    got.sort((a, b) => a.h - b.h); const tot = got.reduce((s, p) => s + p.a, 0); let acc = 0; for (const p of got) { acc += p.a; if (acc >= tot / 2) return { h: p.h, parts: got.length }; } return null; };
  const ras = rasters.map(g => ({ label: g.label, at: rasterSampler(g) })), fx = fps.map(f => ({ ...f, match: footprintIndex(f) }));
  const fpKeys = fx.flatMap(f => f.label === 'overture' ? ['overture-height', 'overture-floors'] : [f.label]);
  // validation of a floors source against the national floors and OSM building:levels on the buildings that have both
  const V = {}, vadd = (src, other, a, b) => { const o = V[src] ||= {}, x = o[other] ||= { n: 0, same: 0, within1: 0, sum_diff: 0, sum_abs: 0, max_abs: 0, hist: {} }, d = a - b;
    x.n++; if (d === 0) x.same++; if (Math.abs(d) <= 1) x.within1++; x.sum_diff += d; x.sum_abs += Math.abs(d); x.max_abs = Math.max(x.max_abs, Math.abs(d)); const hk = d > 3 ? '>3' : d < -3 ? '<-3' : String(d); x.hist[hk] = (x.hist[hk] || 0) + 1; };
  const NHL = P.national_height_label || 'national-height';
  const H = {}, F = { 'osm-height': 0, ...(natH.length ? { [NHL]: 0 } : {}), 'osm-levels': 0, national: 0, ...Object.fromEntries(fpKeys.filter(k => k === 'overture-ign-floors').map(k => [k, 0])), ...Object.fromEntries(fpKeys.filter(k => k !== 'overture-ign-floors').map(k => [k, 0])), 'default-small': 0, ...Object.fromEntries(ras.map(r => [r.label, 0])), default: 0, 'levels-vs-national-2plus': 0, 'national-zero-floors': 0 };
  const M = Object.fromEntries(fx.map(f => [f.label, { rows: f.rows.length, matched: 0, matched_osm_had_height: 0 }]));
  const R = { osm: {}, ...Object.fromEntries(fx.filter(f => f.label === 'overture').map(f => [f.label, {}])), rule: {}, flat: 0, 'osm-flat-tag': 0, 'osm-unknown-shape': 0, 'with-holes-flat': 0, 'rule-irregular-flat': 0, 'rule-large-flat': 0, 'rule-tall-flat': 0, 'rule-kind-flat': 0 };
  const RR = P.roof_rule, top = new Set(['osm-height', NHL, 'overture-height', ...fx.filter(f => f.top).map(f => f.label), ...ras.map(r => r.label)]);
  for (let b of sel.buildings) {
    let h = null, src = null; const nf = nat.length ? natFloors(b.rings) : null, nh = natH.length ? natHeight(b.rings, b.c) : null;
    const fm = {}; for (const f of fx) { const q = f.match(b.rings); if (q) { fm[f.label] = q; M[f.label].matched++; if (b.height > 0 || b.levels > 0) M[f.label].matched_osm_had_height++; } }
    const ov = fm.overture, ms = fm.ms, ign = fm['overture-ign-floors'];
    if (b.height != null && b.height > 0) { h = b.height; src = 'osm-height'; }
    else if (nh && nh.h > 0) { h = nh.h; src = NHL; }   // a measured national height before OSM levels (a count of floors)
    else if (b.levels != null && b.levels > 0) { h = b.levels * P.storey_m; src = 'osm-levels'; }
    else if (nf && nf.floors > 0) { h = nf.floors * P.national_storey_m; src = 'national'; }
    else if (ign && ign.floors > 0) { h = ign.floors * P.storey_m; src = 'overture-ign-floors'; }
    else if (ov && ov.height > 0) { h = ov.height; src = 'overture-height'; }
    else if (ov && ov.floors > 0) { h = ov.floors * P.storey_m; src = 'overture-floors'; }
    else if (ms && ms.height > 0) { h = ms.height; src = 'ms'; }
    else if (SMALL.has(b.kind)) { h = P.default_small_m; src = 'default-small'; }
    else { for (const r of ras) { const v = r.at(...b.c); if (v != null) { h = Math.max(P.raster_min_m, v); src = r.label; break; } }
      if (h == null) { h = P.default_m; src = 'default'; if (nf && nf.floors === 0) F['national-zero-floors']++; } }
    F[src]++;
    if (b.levels != null && nf && Math.abs(b.levels - nf.floors) >= 2) F['levels-vs-national-2plus']++;
    // the roof
    let shape = null, rsrc = null;
    if (b.roof_shape) { shape = ROOF_CLASS[b.roof_shape] || null; if (!shape) R['osm-unknown-shape']++; else if (shape === 'flat') { R['osm-flat-tag']++; shape = null; } else rsrc = 'osm'; }
    else if (ov?.roof && ROOF_CLASS[ov.roof] && ROOF_CLASS[ov.roof] !== 'flat') { shape = ROOF_CLASS[ov.roof]; rsrc = 'overture'; if (ov.roof_h != null && b.roof_height == null) b = { ...b, roof_height: ov.roof_h }; }
    let B = null; const xy = toXY(open(b.rings[0]), b.c);
    if (shape || RR) B = obb(xy);
    const wall0 = h;   // the eaves before the roof (for a top source a little high: the rule's test is coarse)
    if (!shape && RR && !b.roof_shape && !(ov?.roof && ROOF_CLASS[ov.roof] === 'flat')) {
      const area = Math.abs(ringArea(open(b.rings[0]))), rect = B && B.area > 0 ? area / (4 * B.hl * B.hw) : 0;
      if (!RR.kinds.includes(b.kind)) R['rule-kind-flat']++;
      else if (rect < RR.min_rect) R['rule-irregular-flat']++;
      else if (area > RR.max_area_m2) R['rule-large-flat']++;
      else if (wall0 > RR.max_wall_m) R['rule-tall-flat']++;
      else { shape = RR.shape; rsrc = 'rule'; }
    }
    if (shape && b.rings.length > 1) { R['with-holes-flat']++; shape = null; rsrc = null; }
    let roofH = 0, wall = h;
    if (shape) {
      const pitch = (b.roof_angle ?? RR?.pitch_deg ?? P.pitch_deg) * D2R, across = b.roof_orientation === 'across';
      roofH = b.roof_height ?? (b.roof_levels != null && b.roof_levels > 0 ? b.roof_levels * P.storey_m : null) ??
        (shape === 'dome' ? Math.min(B.hl, B.hw) : shape === 'skillion' ? 2 * B.hw * Math.tan(pitch) : (across ? B.hl : B.hw) * Math.tan(pitch));
      if (b.roof_height == null) roofH = Math.min(roofH, P.max_roof_m);
      if (top.has(src)) { roofH = Math.min(roofH, h * 0.5); wall = h - roofH; } else { wall = h; h = h + roofH; }
      roofH = Math.round(roofH * 10) / 10;
      if (roofH < 0.3) { shape = null; rsrc = null; roofH = 0; wall = h; }
    }
    if (shape) { const o = R[rsrc]; o[shape] = (o[shape] || 0) + 1; } else R.flat++;
    let base = b.min_height ?? (b.min_level != null ? b.min_level * P.storey_m : 0); if (b.kind === 'roof' && !b.min_height) base = Math.max(0, wall - 0.6);
    if (base >= wall) base = Math.max(0, wall - 1);
    H[b.id] = { h: Math.round(h * 10) / 10, wall: Math.round(wall * 10) / 10, base: Math.round(base * 10) / 10, src, nat_floors: nf ? nf.floors : null,
      ...(shape ? { roof: shape, roof_src: rsrc, roof_h: roofH, ...(b.roof_orientation === 'across' ? { across: true } : {}) } : {}) };
  }
  // validation of a floors source (the IGN floors) per record: against the national floors (the parts whose centroid is
  // inside its outline, area-weighted median) and against OSM building:levels (an OSM outline that holds its centroid,
  // or whose centroid it holds); whatever the height order chose
  for (const f of fx) { if (f.label !== 'overture-ign-floors') continue;
    const lv = sel.buildings.filter(b => b.levels > 0), lg = new Map(), gk2 = (lon, lat) => Math.floor(lon / 0.0005) + ',' + Math.floor(lat / 0.0005);
    for (const b of lv) { const k = gk2(...b.c); (lg.get(k) || lg.set(k, []).get(k)).push(b); }
    for (const r of f.rows) { if (!(r.floors > 0) || !r.c) continue; const nf = nat.length ? natFloors([r.ring]) : null; if (nf && nf.floors > 0) vadd(f.label, 'national', r.floors, nf.floors);
      const [i0, j0] = gk2(...r.c).split(',').map(Number); let hit = null;
      for (let i = i0 - 2; i <= i0 + 2 && !hit; i++) for (let j = j0 - 2; j <= j0 + 2 && !hit; j++) for (const b of lg.get(i + ',' + j) || []) if (inPoly(r.c, b.rings) || inRing(b.c, r.ring)) { hit = b; break; }
      if (hit) vadd(f.label, 'osm-levels', r.floors, hit.levels); }
    V[f.label] ||= {}; V[f.label].records = f.rows.length; V[f.label].used_as_height = F[f.label] || 0; }
  for (const o of Object.values(V)) for (const x of Object.values(o)) { if (typeof x !== 'object') continue; x.agree_pct = x.n ? Math.round(1000 * x.same / x.n) / 10 : null; x.within1_pct = x.n ? Math.round(1000 * x.within1 / x.n) / 10 : null; x.mean_diff = x.n ? Math.round(100 * x.sum_diff / x.n) / 100 : null; x.mean_abs = x.n ? Math.round(100 * x.sum_abs / x.n) / 100 : null; delete x.sum_diff; delete x.sum_abs; }
  return { heights: H, faults: F, roofs: R, matches: M, validation: V };
}

// ---------- DEM sampling and the geoid (EGM96, the same 1-degree grid as the globe: data/world/geoid-egm96-1deg.png)
function demSampler(D) {
  const dx = (D.e - D.w) / D.nx, dy = (D.n - D.s) / D.ny;
  const at = (i, j) => { i = Math.max(0, Math.min(D.nx - 1, i)); j = Math.max(0, Math.min(D.ny - 1, j)); return D.h[j * D.nx + i]; };
  return (lon, lat) => { const fx = (lon - D.w) / dx - 0.5, fy = (D.n - lat) / dy - 0.5, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1), vals = [a, b, c, d].filter(x => x != null); if (!vals.length) return 0;
    const f = x => x ?? vals[0]; return (f(a) * (1 - u) + f(b) * u) * (1 - v) + (f(c) * (1 - u) + f(d) * u) * v; };
}
// a morphological opening (minimum, then maximum, over a square of (2r + 1)^2 cells) of a DEM grid: removes bumps
// narrower than the square (buildings, small groves in a surface model such as Copernicus GLO-30) and keeps planes and
// slopes; wide forests and ridges stay. Region config dem.open_px (a stated rule, a parameter of the operation)
function openGrid(G, r) {
  const { nx, ny } = G, src = Float64Array.from(G.h, v => v == null || Number.isNaN(v) ? NaN : v);
  const pass = (a, f, init) => { const t = new Float64Array(nx * ny), o = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let m = init; for (let k = Math.max(0, i - r); k <= Math.min(nx - 1, i + r); k++) { const v = a[j * nx + k]; if (!Number.isNaN(v)) m = f(m, v); } t[j * nx + i] = m === init ? NaN : m; }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let m = init; for (let k = Math.max(0, j - r); k <= Math.min(ny - 1, j + r); k++) { const v = t[k * nx + i]; if (!Number.isNaN(v)) m = f(m, v); } o[j * nx + i] = m === init ? NaN : m; }
    return o; };
  const out = pass(pass(src, Math.min, Infinity), Math.max, -Infinity);
  const h = G.h instanceof Float32Array ? Float32Array.from(out) : Array.from(out, (v, i) => Number.isNaN(src[i]) ? null : Math.round(v * 10) / 10);
  return { ...G, h, opened_px: r };
}
async function geoidSampler(png) {
  const img = await loadImage(readFileSync(png)), cv = createCanvas(img.width, img.height), c = cv.getContext('2d'); c.drawImage(img, 0, 0); const d = c.getImageData(0, 0, img.width, img.height).data, w = img.width, h = img.height;
  const g = (x, y) => d[4 * (y * w + x)] - 128;
  return (lon, lat) => { const fx = Math.max(0, Math.min(w - 1.001, lon + 180)), fy = Math.max(0, Math.min(h - 1.001, 90 - lat)), x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    return (g(x0, y0) * (1 - u) + g(x0 + 1, y0) * u) * (1 - v) + (g(x0, y0 + 1) * (1 - u) + g(x0 + 1, y0 + 1) * u) * v; };
}

// ---------- glTF 2.0 binary writer (plain: float32 positions and normals, uint8 colours, uint16/32 indices, a JPEG image)
function glb(prims, copyright) {
  const chunks = [], views = [], accs = [], json = { asset: { version: '2.0', generator: 'cwplans build-place-tiles.mjs', copyright }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [] }], materials: [], buffers: [], bufferViews: views, accessors: accs };
  let off = 0;
  const view = (buf, target) => { const pad = (4 - (buf.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) }); chunks.push(buf, Buffer.alloc(pad)); off += buf.length + pad; return views.length - 1; };
  const acc = (arr, type, ctype, target, extra = {}) => { const bv = view(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), target), n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type];
    const a = { bufferView: bv, componentType: ctype, count: arr.length / n, type, ...extra };
    if (type === 'VEC3' && ctype === 5126 && extra.minmax) { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < arr.length; i++) { mn[i % 3] = Math.min(mn[i % 3], arr[i]); mx[i % 3] = Math.max(mx[i % 3], arr[i]); } a.min = mn; a.max = mx; delete a.minmax; }
    accs.push(a); return accs.length - 1; };
  let usesFeatures = false;
  for (const p of prims) {
    if (!p.idx.length) continue;
    const attributes = { POSITION: acc(new Float32Array(p.pos), 'VEC3', 5126, 34962, { minmax: true }) };
    if (p.nrm) attributes.NORMAL = acc(new Float32Array(p.nrm), 'VEC3', 5126, 34962);   // none for buildings: glTF clients compute flat normals
    if (p.uv) attributes.TEXCOORD_0 = acc(new Float32Array(p.uv), 'VEC2', 5126, 34962);
    if (p.col) attributes.COLOR_0 = acc(new Uint8Array(p.col), 'VEC4', 5121, 34962, { normalized: true });
    if (p.fid) { attributes._FEATURE_ID_0 = acc(new Float32Array(p.fid), 'SCALAR', 5126, 34962); usesFeatures = true; }
    const nv = p.pos.length / 3, big = nv > 65535, indices = acc(big ? new Uint32Array(p.idx) : new Uint16Array(p.idx), 'SCALAR', big ? 5125 : 5123, 34963);
    const mat = { name: p.name, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } };
    if (p.png) { json.images ||= []; json.textures ||= []; json.samplers ||= [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }];
      json.images.push({ bufferView: view(p.png), mimeType: 'image/jpeg' }); json.textures.push({ sampler: 0, source: json.images.length - 1 }); mat.pbrMetallicRoughness.baseColorTexture = { index: json.textures.length - 1 }; }
    json.materials.push(mat);
    const prim = { attributes, indices, material: json.materials.length - 1, mode: 4 };
    if (p.fid) prim.extensions = { EXT_mesh_features: { featureIds: [{ featureCount: new Set(p.fid).size, attribute: 0, label: 'osm' }] } };
    json.meshes[0].primitives.push(prim);
  }
  if (usesFeatures) json.extensionsUsed = ['EXT_mesh_features'];
  const bin = Buffer.concat(chunks); json.buffers.push({ byteLength: bin.length });
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const hdr = Buffer.alloc(12); hdr.writeUInt32LE(0x46546c67, 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (b, t) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.writeUInt32LE(t, 4); return [h, b]; };
  return Buffer.concat([hdr, ...ch(js, 0x4e4f534a), ...ch(bin, 0x004e4942)]);
}

// ---------- colours (generic; OSM colour tags where present)
const CSS = { white: '#f2f0ea', black: '#2b2b2b', grey: '#9a9a96', gray: '#9a9a96', silver: '#c0c0c0', red: '#a8463a', brown: '#7a5638', maroon: '#6e2f2a', beige: '#d8ccb0', yellow: '#d8c27a', orange: '#c8823e', tan: '#c9ad85', cream: '#ece3c8', lightgrey: '#c8c8c4', darkgrey: '#5f5f5c', green: '#6c8a5a', blue: '#4f6d8a' };
const hex = s => { if (!s) return null; s = String(s).trim().toLowerCase(); if (CSS[s]) s = CSS[s]; const m = s.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/); if (!m) return null; let h = m[1]; if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const WALL = [214, 203, 182], ROOF = [168, 120, 96], ROOF_FLAT = [150, 146, 140];
const GROUND = '#b8b09e', FILL = { water: '#4f86ab', green: '#8fae6f', paved: '#d9d2c2' };

// the LoD2 units of the core grouped by building, matched to the OSM outlines (names, colours) and the OSM buildings they
// cover (not drawn); pure
function lod2Buildings(units, sel, drawn) {
  const byB = new Map(); for (const u of units) (byB.get(u.bid) || byB.set(u.bid, []).get(u.bid)).push(u);
  const gk = (lon, lat) => Math.floor(lon / 0.0005) + ',' + Math.floor(lat / 0.0005), grid = new Map();
  for (const u of units) { const k = gk(...u.c); (grid.get(k) || grid.set(k, []).get(k)).push(u); }
  const near = c => { const [i0, j0] = gk(...c).split(',').map(Number), o = []; for (let i = i0 - 3; i <= i0 + 3; i++) for (let j = j0 - 3; j <= j0 + 3; j++) o.push(...(grid.get(i + ',' + j) || [])); return o; };
  const outlines = sel.buildings.filter(b => !b.part), covered = new Set(), owner = new Map();
  for (const b of [...outlines, ...drawn.filter(x => x.part)]) { const hits = near(b.c).filter(u => inRing(b.c, u.ring) || inPoly(u.c, b.rings)); if (!hits.length) continue; covered.add(b.id);
    if (!b.part) for (const u of hits) if (inPoly(u.c, b.rings) || !owner.has(u.bid)) owner.set(u.bid, b); }
  const area = r => Math.abs(ringArea(open(r))), list = [], firstOf = new Map();
  for (const [bid, us] of [...byB].sort((a, b) => a[0].localeCompare(b[0]))) { us.sort((a, b) => area(b.ring) - area(a.ring)); const big = us[0], osm = owner.get(bid) || null;
    const x = { bid, units: us, c: big.c, ring: big.ring, h: Math.max(...us.map(u => u.h)), roof: big.roof || 'other', kind: big.kind, osm };
    if (osm) { if (firstOf.has(osm.id)) x.dupOf = osm.id; else firstOf.set(osm.id, x); }
    list.push(x); }
  return { list, covered };
}
// ---------- operation 3: tiles (pure: selected OSM, heights, DEM, geoid -> glb per cell, tileset.json, features.json)
async function buildTiles(sel, HT, dem, geoidAt, P, ringDem, lod2 = null) {
  if (P.dem_open_px) dem = openGrid(dem, P.dem_open_px);
  const demAt = demSampler(dem), Ng = geoidAt(O.lon, O.lat);
  const ell = (lon, lat) => demAt(lon, lat) + Ng;   // ellipsoidal ground height (DEM datum taken as EGM96 orthometric: stated)
  rmSync(join(OUT, 'tiles'), { recursive: true, force: true }); mkdirSync(join(OUT, 'tiles'), { recursive: true });
  const outFiles = [], children = [], feats = [], tileStats = [];
  const used = new Set(Object.values(HT).map(x => x.src));
  const usedAd = a => { const k = a.buildingHeights.kind; return k === 'ghsl-raster' ? used.has(a.buildingHeights.label) : k === 'overture-buildings' ? used.has('overture-height') || used.has('overture-floors') || Object.values(HT).some(x => x.roof_src === 'overture') : k === 'ms-buildings' ? used.has('ms') : true; };
  const credit = [`© OpenStreetMap contributors (ODbL 1.0)`, demAd.dem.credit, ...hAds.filter(usedAd).map(a => a.buildingHeights.credit)].join('; ');
  // features (buildings drawn), ids are their index
  let drawn = sel.buildings.filter(b => !(b.has_parts && !b.part));
  // the official LoD2 buildings of the core (place-lod2.mjs units with polygons, grouped by building): drawn as they are
  // (walls and roofs); an OSM outline they cover (its centroid in a LoD2 footprint, or a LoD2 centroid in it) is not
  // drawn, and gives its name, address, Wikidata id, OSM id and colours to the LoD2 buildings inside it
  const L2 = lod2 ? lod2Buildings(lod2, sel, drawn) : null;
  if (L2) drawn = drawn.filter(b => !L2.covered.has(b.id) && !(b.parent && L2.covered.has(b.parent)));
  const bIndex = new Map(); drawn.forEach((b, i) => bIndex.set(b.id, i));
  if (L2) L2.list.forEach((x, i) => { x.fid = drawn.length + i; });
  let hMin = Infinity, hMax = -Infinity;
  for (const cell of CELLS) {
    const [w, s, e, n] = cell.b, lc = (w + e) / 2, bc = (s + n) / 2, h0 = Math.round(ell(lc, bc) * 100) / 100, F = enuFrame({ lon: lc, lat: bc, h: h0 });
    const Y = ([E, Nn, U]) => [E, U, -Nn];   // ENU -> glTF (y up); the tileset applies glTF's y-up to z-up rotation
    // ground: a GRID x GRID heightfield of the cell, textured; skirts on the outer edges of the place
    const G = P.grid, gp = [], gn = [], guv = [], gi = [], idx = (i, j) => j * (G + 1) + i;
    const hv = []; for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) { const lon = w + (e - w) * i / G, lat = n - (n - s) * j / G, hh = ell(lon, lat); hv.push(hh); gp.push(...Y(F.toEnu(lon, lat, hh))); guv.push(i / G, j / G); }
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) { const p = k => gp.slice(3 * k, 3 * k + 3), a = p(idx(Math.max(0, i - 1), j)), b = p(idx(Math.min(G, i + 1), j)), c = p(idx(i, Math.max(0, j - 1))), d = p(idx(i, Math.min(G, j + 1)));
      const ux = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], uz = [d[0] - c[0], d[1] - c[1], d[2] - c[2]]; let nx = uz[1] * ux[2] - uz[2] * ux[1], ny = uz[2] * ux[0] - uz[0] * ux[2], nz = uz[0] * ux[1] - uz[1] * ux[0]; const l = Math.hypot(nx, ny, nz) || 1; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; } gn.push(nx / l, ny / l, nz / l); }
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const a = idx(i, j), b = idx(i + 1, j), c = idx(i, j + 1), d = idx(i + 1, j + 1); gi.push(a, c, b, b, c, d); }
    const outer = { n: cell.y === cy1, s: cell.y === cy0, w: cell.x === cx0, e: cell.x === cx1 };
    const skirt = (ks) => { let prev = null; for (const k of ks) { const top = k, v = gp.length / 3; gp.push(gp[3 * k], gp[3 * k + 1] - P.skirt_m, gp[3 * k + 2]); gn.push(...gn.slice(3 * k, 3 * k + 3)); guv.push(guv[2 * k], guv[2 * k + 1]);
      if (prev) gi.push(prev[0], prev[1], top, top, prev[1], v); prev = [top, v]; } };
    const row = j => Array.from({ length: G + 1 }, (_, i) => idx(i, j)), col = i => Array.from({ length: G + 1 }, (_, j) => idx(i, j));
    if (outer.n) skirt(row(0).reverse()); if (outer.s) skirt(row(G)); if (outer.w) skirt(col(0)); if (outer.e) skirt(col(G).reverse());
    // the ground texture: water, green, paved, streets, rail, footprints (canvas clips to the cell)
    const T = P.tex, cv = createCanvas(T, T), cx = cv.getContext('2d'), mpp = (e - w) * mLon / T;
    const X = lon => (lon - w) / (e - w) * T, Yp = lat => (n - lat) / (n - s) * T;
    cx.fillStyle = GROUND; cx.fillRect(0, 0, T, T);
    const poly = (rings, fill) => { cx.beginPath(); for (const r of rings) { r.forEach(([lo, la], k) => k ? cx.lineTo(X(lo), Yp(la)) : cx.moveTo(X(lo), Yp(la))); cx.closePath(); } cx.fillStyle = fill; cx.fill('evenodd'); };
    const pad = 0.002, near = rings => rings[0].some(([lo, la]) => lo > w - pad && lo < e + pad && la > s - pad && la < n + pad);
    for (const k of ['paved', 'green', 'water']) for (const a of sel.areas) if (a.kind === k && near(a.rings)) poly(a.rings, FILL[k]);
    cx.lineCap = 'round'; cx.lineJoin = 'round';
    const lines = sel.lines.filter(l => l.pts.some(([lo, la]) => lo > w - pad && lo < e + pad && la > s - pad && la < n + pad)).sort((a, b) => a.width - b.width);
    for (const pass of ['casing', 'fill']) for (const l of lines) {
      const wpx = Math.max(1, l.width / mpp); if (pass === 'casing' && (l.kind !== 'road' || l.width < 5)) continue;
      cx.beginPath(); l.pts.forEach(([lo, la], k) => k ? cx.lineTo(X(lo), Yp(la)) : cx.moveTo(X(lo), Yp(la)));
      cx.strokeStyle = pass === 'casing' ? '#9c9483' : l.kind === 'water' ? FILL.water : l.kind === 'rail' ? '#7d776f' : l.width >= 9 ? '#eeeae1' : l.width >= 5 ? '#e6e0d3' : '#d6ccb6';
      cx.lineWidth = pass === 'casing' ? wpx + 2 : wpx; cx.stroke(); }
    for (const b of drawn) if (near(b.rings)) poly(b.rings, '#8f897d');
    if (L2) for (const x of L2.list) for (const u of x.units) if (near([u.ring])) poly([u.ring], '#8f897d');
    const png = await cv.encode('jpeg', P.jpeg);
    // buildings whose centroid is in this cell: walls (flat normals) and flat roofs (earcut), base at the lowest ground
    const bp = [], bc2 = [], bf = [], bi = []; let nb = 0;
    for (const b of drawn) {
      if (!(b.c[0] >= w && b.c[0] < e && b.c[1] >= s && b.c[1] < n)) continue;
      const H = HT[b.id], rings = b.rings.map(open).filter(r => r.length >= 3); if (!rings.length) continue;
      const gs = rings[0].map(([lo, la]) => demAt(lo, la)), gmin = Math.min(...gs), gmean = gs.reduce((a, c) => a + c, 0) / gs.length;
      const z0 = (H.base > 0 ? gmean + H.base : gmin - 0.5) + Ng, zw = gmean + (H.wall ?? H.h) + Ng, z1 = gmean + H.h + Ng; if (zw - z0 < 0.5) continue;
      hMin = Math.min(hMin, z0); hMax = Math.max(hMax, z1);
      const fid = bIndex.get(b.id), wc = hex(b.colour) || WALL, rc = hex(b.roof_colour) || (H.roof ? ROOF : H.h <= 4 ? ROOF_FLAT : ROOF);
      // outer counter-clockwise, holes clockwise (in lon/lat; ENU keeps the sense)
      const rs = rings.map((r, k) => { const ccw = ringArea(r) > 0; return (k === 0) === ccw ? r : r.slice().reverse(); });
      const vtx = (ll, z, col) => { bp.push(...Y(F.toEnu(ll[0], ll[1], z))); bc2.push(...col, 255); bf.push(fid); return bp.length / 3 - 1; };
      // walls of a closed ring: one bottom and one top vertex per point, shared by the two walls that meet there (no normals
      // are stored: glTF clients and the reader take flat normals per triangle, so sharing loses nothing; -40 % bytes)
      const wallRing = (pts, zt) => { const lo = pts.map(q => vtx(q, z0, wc)), hi = pts.map((q, k) => vtx(q, zt[k], wc)), m = pts.length;
        for (let k = 0; k < m; k++) { const k1 = (k + 1) % m; bi.push(lo[k], lo[k1], hi[k], hi[k], lo[k1], hi[k1]); } };
      if (H.roof && rs.length === 1) {
        // a sloped roof over the footprint, in the frame of its oriented box (a along the long axis, b across)
        const xy = toXY(rs[0], b.c), B = obb(xy), cs = Math.cos(B.t), sn = Math.sin(B.t), R = H.roof_h;
        const toAB = ([x, y]) => { const dx = x - B.x, dy = y - B.y; return [dx * cs + dy * sn, -dx * sn + dy * cs]; };
        const ll = ([u, v]) => toLL([B.x + u * cs - v * sn, B.y + u * sn + v * cs], b.c), ab = xy.map(toAB), n = ab.length;
        if (H.roof === 'dome') {
          // walls to the eaves; then rings of the outline scaled toward the box centre (cos), raised by R sin, to an apex
          wallRing(ab.map(ll), ab.map(() => zw));
          const K = 6; let prev = ab.map(p => vtx(ll(p), zw, rc));
          for (let i = 1; i < K; i++) { const th = i / K * Math.PI / 2, sc = Math.cos(th), z = zw + R * Math.sin(th), cur = ab.map(p => vtx(ll([p[0] * sc, p[1] * sc]), z, rc));
            for (let k = 0; k < n; k++) { const k1 = (k + 1) % n; bi.push(prev[k], prev[k1], cur[k], cur[k], prev[k1], cur[k1]); } prev = cur; }
          const apex = vtx(ll([0, 0]), zw + R, rc); for (let k = 0; k < n; k++) bi.push(prev[k], prev[(k + 1) % n], apex);
        } else {
          const PLN = roofPlanes(H.roof, B, H.across), pz = (pl, p) => pl[0] + pl[1] * p[0] + pl[2] * p[1];
          const f = p => zw + R * Math.max(0, Math.min(...PLN.map(pl => pz(pl, p))));
          const dif = (i, j) => p => pz(PLN[i], p) - pz(PLN[j], p);
          // the outline with a point wherever the active plane changes along an edge, so each wall top is straight
          const ring = []; for (let k = 0; k < n; k++) { const P0 = ab[k], Q = ab[(k + 1) % n]; ring.push(P0); const ts = [];
            for (let i = 0; i < PLN.length; i++) for (let j = i + 1; j < PLN.length; j++) { const d = dif(i, j), dp = d(P0), dq = d(Q); if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) ts.push(dp / (dp - dq)); }
            // only where the lowest plane changes (two planes may cross where neither is the roof)
            const at = t => [P0[0] + t * (Q[0] - P0[0]), P0[1] + t * (Q[1] - P0[1])], act = q => { let m = 0; for (let i = 1; i < PLN.length; i++) if (pz(PLN[i], q) < pz(PLN[m], q) - 1e-9) m = i; return m; };
            for (const t of ts.sort((x, y) => x - y)) if (t > 1e-6 && t < 1 - 1e-6 && act(at(t - 1e-4)) !== act(at(t + 1e-4))) ring.push(at(t)); }
          wallRing(ring.map(ll), ring.map(f));
          // each plane over the part of the outline where it is the lowest (Sutherland-Hodgman clip by half-planes)
          const clip = (poly, d) => { const out = []; for (let k = 0; k < poly.length; k++) { const P0 = poly[k], Q = poly[(k + 1) % poly.length], dp = d(P0), dq = d(Q);
            if (dp <= 1e-9) out.push(P0); if ((dp < -1e-9 && dq > 1e-9) || (dp > 1e-9 && dq < -1e-9)) { const t = dp / (dp - dq); out.push([P0[0] + t * (Q[0] - P0[0]), P0[1] + t * (Q[1] - P0[1])]); } } return out; };
          const seen = new Map();   // roof vertices shared between planes (ridge and hip points)
          for (let i = 0; i < PLN.length; i++) { let poly = ring; for (let j = 0; j < PLN.length && poly.length >= 3; j++) if (j !== i) poly = clip(poly, dif(i, j));
            if (poly.length < 3) continue; const tri = earcut(poly.flat()), ids = poly.map(p => { const z = zw + R * Math.max(0, pz(PLN[i], p)), key = `${p[0].toFixed(2)},${p[1].toFixed(2)},${z.toFixed(2)}`; return seen.get(key) ?? seen.set(key, vtx(ll(p), z, rc)).get(key); });
            for (let k = 0; k < tri.length; k += 3) bi.push(ids[tri[k]], ids[tri[k + 1]], ids[tri[k + 2]]); }
        }
      } else {
        for (const r of rs) wallRing(r, r.map(() => zw));
        const flat = [], holes = [], v0 = bp.length / 3; rs.forEach((r, k) => { if (k) holes.push(flat.length / 2); for (const [lo, la] of r) { const q = F.toEnu(lo, la, zw); flat.push(q[0], q[1]); bp.push(...Y(q)); bc2.push(...rc, 255); bf.push(fid); } });
        const tri = earcut(flat, holes.length ? holes : null); for (let k = 0; k < tri.length; k += 3) bi.push(v0 + tri[k], v0 + tri[k + 1], v0 + tri[k + 2]);
      }
      // (earcut gives the winding of the input; the reader draws buildings from both sides, so no flip needed)
      feats[fid] = { b, H, tile: cell.key, top: Math.round(z1 * 10) / 10, ground: Math.round((gmean) * 10) / 10 };
      nb++;
    }
    // the LoD2 buildings whose centroid is in this cell: each wall and roof polygon as it is (z of the model's datum, taken
    // as the DEM's; the bottom of the walls to the DEM minus 0.5 m so no gap shows), triangulated in its own plane
    let cellTop = 0;
    if (L2) for (const x of L2.list) { if (!(x.c[0] >= w && x.c[0] < e && x.c[1] >= s && x.c[1] < n)) continue;
      const fid = x.fid, osm = x.osm, wc = hex(osm?.colour) || WALL, gs = x.ring.map(([lo, la]) => demAt(lo, la)), gmean = gs.reduce((a, c) => a + c, 0) / gs.length;
      for (const u of x.units) { const rc = hex(osm?.roof_colour) || (u.roof && u.roof !== 'flat' ? ROOF : ROOF_FLAT);
        const zOf = (lo, la, z) => (z - u.zg < 0.05 ? Math.min(z, demAt(lo, la)) - 0.5 : z) + Ng;
        for (const pg of u.polys) { const col = pg.t === 'R' ? rc : wc, rings = [pg.r, ...pg.h].filter(r => r.length >= 3); if (!rings.length || rings[0].length < 3) continue;
          const enu = rings.map(r => r.map(([lo, la, z]) => F.toEnu(lo, la, zOf(lo, la, z))));
          const tri = triangulatePolygon(enu[0], enu.slice(1)), v0 = bp.length / 3;
          for (const r of enu) for (const q of r) { bp.push(...Y(q)); bc2.push(...col, 255); bf.push(fid); hMin = Math.min(hMin, q[2] + h0); hMax = Math.max(hMax, q[2] + h0); }
          for (let k = 0; k < tri.length; k += 3) bi.push(v0 + tri[k], v0 + tri[k + 1], v0 + tri[k + 2]); } }
      cellTop = Math.max(cellTop, x.h);
      const H = { h: x.h, src: P.lod2.label, roof: x.roof };
      feats[fid] = { b: { id: osm?.id && !x.dupOf ? osm.id : 'lod2:' + x.bid, name: osm?.name || null, addr: osm?.addr || null, kind: osm && osm.kind !== 'yes' ? osm.kind : x.kind, c: x.c, levels: osm?.levels ?? null, wikidata: osm?.wikidata || null, alt: osm?.alt || null, parent: x.dupOf || null, site: osm?.site || null }, H,
        tile: cell.key, top: Math.round((gmean + x.h) * 10) / 10, ground: Math.round(gmean * 10) / 10, lod2: x.bid };
      nb++; }
    for (const hh of hv) { hMin = Math.min(hMin, hh - P.skirt_m); hMax = Math.max(hMax, hh); }
    // drop degenerate triangles (a shared roof vertex used twice, a zero-length outline edge): the glTF validator counts them
    const bk = []; for (let k = 0; k < bi.length; k += 3) { const [x, y, z] = [bi[k], bi[k + 1], bi[k + 2]]; if (x === y || y === z || x === z) continue;
      const p3 = i => bp.slice(3 * i, 3 * i + 3), A = p3(x), B = p3(y), C = p3(z), u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      if (Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) < 1e-6) continue; bk.push(x, y, z); }
    bi.length = 0; for (const x of bk) bi.push(x);
    const bytes = glb([{ name: 'ground', pos: gp, nrm: gn, uv: guv, idx: gi, png }, { name: 'buildings', pos: bp, col: bc2, fid: bf, idx: bi }], credit);
    const file = join(OUT, 'tiles', cell.key + '.glb'); writeFileSync(file, bytes); outFiles.push(file);
    const cellH = [Math.min(...hv) - P.skirt_m, Math.max(h0, ...hv) + Math.max(cellTop, ...drawn.filter(b => feats[bIndex.get(b.id)]?.tile === cell.key).map(b => HT[b.id].h))];
    children.push({ boundingVolume: { region: [w * D2R, s * D2R, e * D2R, n * D2R, Math.round(cellH[0]), Math.ceil(cellH[1] + 2)] }, geometricError: 0, refine: 'ADD', transform: F.matrix().map(v => Math.round(v * 1e9) / 1e9), content: { uri: `tiles/${cell.key}.glb` } });
    tileStats.push({ key: cell.key, buildings: nb, triangles: (gi.length + bi.length) / 3, bytes: bytes.length });
  }
  const tileset = { asset: { version: '1.1', generator: 'cwplans build-place-tiles.mjs', tilesetVersion: P.version_label, extras: { place: RID, name: REG.name, credit } },
    geometricError: 2000,
    root: { boundingVolume: { region: [AREA[0] * D2R, AREA[1] * D2R, AREA[2] * D2R, AREA[3] * D2R, Math.floor(hMin), Math.ceil(hMax)] }, geometricError: 400, refine: 'ADD', children } };
  // with a surround block the tileset is written by place-lod (the core tiles are the leaves of its tree): this one is an intermediate
  const tsf = SUR ? join(WORK, 'core-tileset.json') : join(OUT, 'tileset.json'); writeFileSync(tsf, JSON.stringify(tileset, null, 1)); outFiles.push(tsf);
  // features.json: the text and machine interface of the place (names, heights and their source; streets; named points)
  const B = feats.map((f, i) => f && [f.b.id, f.b.name, f.b.addr, f.b.kind, f.b.c[0], f.b.c[1], f.H.h, f.H.src, f.b.levels ?? f.H.nat_floors ?? null, f.tile, f.ground, f.b.wikidata || null, f.b.alt || null, f.b.parent || null, f.H.roof ? f.H.roof + (f.H.roof_src === 'rule' ? ' (rule)' : '') : 'flat', f.b.site || null]);
  for (let i = 0; i < B.length; i++) if (!B[i]) B[i] = null;
  const streets = new Map(); for (const l of sel.lines) if (l.name && l.kind !== 'rail') { const m = l.pts[Math.floor(l.pts.length / 2)]; if (!streets.has(l.name)) streets.set(l.name, [l.name, l.kind === 'water' ? 'waterway' : l.cls, m[0], m[1], l.alt || null]); }
  const areasN = sel.areas.filter(a => a.name).map(a => { const c = centroid(a.rings[0]); return [a.name, a.kind, r7(c[0]), r7(c[1]), a.alt || null]; });
  // the ground as a coarse grid (for the globe's ground height and the eye guard): 33 x 33 over the area, metres of the DEM datum
  const GN = 32, ground = []; for (let j = 0; j <= GN; j++) for (let i = 0; i <= GN; i++) ground.push(Math.round(demAt(AREA[0] + (AREA[2] - AREA[0]) * i / GN, AREA[3] - (AREA[3] - AREA[1]) * j / GN) * 10) / 10);
  // the ring: a 97 x 97 grid over the ring square (DEM datum; the globe blends its outer part into the world terrain)
  let ring = null; if (ringDem && P.ring_m) { const rAt = demSampler(ringDem), n = P.ring_grid, h = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h.push(Math.round(rAt(RING[0] + (RING[2] - RING[0]) * i / (n - 1), RING[3] - (RING[3] - RING[1]) * j / (n - 1)) * 10) / 10);
    ring = { area: RING.map(v => r7(v)), grid: n, h, datum: ringDem.datum, source: ringDem.source + (ringDem.coverage ? ' ' + ringDem.coverage : '') }; }
  const fj = { format: 'place-features-1', place: RID, name: REG.name, label: PL.label || REG.name, search: PL.search || [], timeZone: REG.timeZone, locale: REG.locale, origin: REG.origin, area: AREA, level: L, geoid_m: Math.round(Ng * 100) / 100,
    ground: { grid: GN + 1, h: ground, datum: demAd.dem.datum + '; add geoid_m (EGM96) for WGS84 ellipsoidal heights' }, ring, credit,
    buildings_fields: ['osm_id', 'name', 'address', 'kind', 'lon', 'lat', 'height_m', 'height_source', 'levels', 'tile', 'ground_m', 'wikidata', 'name_alt', 'parent', 'roof', 'site'], buildings: B,
    streets_fields: ['name', 'kind', 'lon', 'lat', 'name_alt'], areas_fields: ['name', 'kind', 'lon', 'lat', 'name_alt'], streets: [...streets.values()].sort((a, b) => a[0].localeCompare(b[0])),
    areas: areasN, points_fields: ['osm_id', 'name', 'kind', 'lon', 'lat', 'address', 'name_alt'], points: sel.points.map(p => [p.id, p.name, p.kind, p.lon, p.lat, p.addr, p.alt || null]), tiles: tileStats,
    ...(L2 ? { lod2: { label: P.lod2.label, buildings: L2.list.length, units: L2.list.reduce((a, x) => a + x.units.length, 0), named_from_osm: L2.list.filter(x => x.osm?.name).length, osm_covered: L2.covered.size, osm_drawn: drawn.length,
      note: 'rows from the official LoD2 model: osm_id is the OSM building that names them (the first LoD2 building of it; the others name it as parent) or lod2:<the model\'s building id>; height_m = the measured height of the highest part' } } : {}) };
  const ff = join(OUT, 'features.json'); writeFileSync(ff, JSON.stringify(fj)); outFiles.push(ff);
  return outFiles;
}

// ---------- READMEs (pure over committed files: index.json, each place's provenance/log.json, the data register, the
// region configs): places/README.md and places/<id>/README.md. Made at the end of each build and by `readme`, so they
// say what the files are now; never edit them by hand.
const GH = 'https://github.com/danbri/londat/blob/main/cwplans/', SITE = 'https://danbri.github.io/londat/';
function writeReadmes() {
  const reg = JSON.parse(readFileSync(join(CW, 'data-register.json'), 'utf8')), S = reg.sources;
  const ix = JSON.parse(readFileSync(join(OUTROOT, 'index.json'), 'utf8'));
  const size = p => readFileSync(p).length, kb = n => n >= 1e6 ? (n / 1e6).toFixed(2) + ' MB' : (n / 1e3).toFixed(1) + ' kB';
  const view = p => `${SITE}docklands/?ll=${p.centre[1]},${p.centre[0]},1500&ht=0,55`;
  const srcOf = (key, rec, R) => rec.source || (key === 'osm' ? 'osm' : key.startsWith('dem') ? (R.adapters.find(a => a.id === R.place.dem && a.dem) || R.adapters.find(a => a.dem)).dem.source
    : key.startsWith('heights-') ? R.adapters.find(a => a.id === key.slice(8))?.buildingHeights?.source : null);
  const esc = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  for (const p of ix.places) {
    // a place in another repository (place.outRepo, not lite) is written only by its own build (its folder is --out)
    const R = REGIONS[p.id], X = !!R?.place?.outRepo; if (X && (p.id !== RID || R.place.kind === 'lite')) continue;
    const dir = X ? OUT : join(OUTROOT, p.id), lf = join(dir, 'provenance', 'log.json'); if (!R || !existsSync(lf)) continue;
    const PRE = X ? `${R.place.outRepo}:${R.place.outPath}` : `docklands/data/places/${p.id}/`, GHP = X ? `https://github.com/danbri/${R.place.outRepo}/blob/main/${R.place.outPath}` : `${GH}docklands/data/places/${p.id}/`, GHT = X ? `https://github.com/danbri/${R.place.outRepo}/tree/main/${R.place.outPath}` : `${GH}docklands/data/places/${p.id}/`;
    const log = JSON.parse(readFileSync(lf, 'utf8')), last = op => log.activities.filter(a => a.operation === op).at(-1);
    const L = [], BL = R.place.kind === 'blocks';
    L.push(`# ${R.name}: a place on the globe (3D Tiles 1.1)`, '',
      `Made by [cwplans/tools/build-place-tiles.mjs](${GH}tools/build-place-tiles.mjs) for the region config [docklands/geo/regions/${p.id}.js](https://github.com/danbri/londat/blob/main/docklands/geo/regions/${p.id}.js); drawn by the globe of the Three.js port ([docklands/globe/places.js](https://github.com/danbri/londat/blob/main/docklands/globe/places.js)).`,
      `This README is generated from \`provenance/log.json\` and [cwplans/data-register.json](${GH}data-register.json) by \`node cwplans/tools/build-place-tiles.mjs readme --region ${p.id}\` (also at the end of each build). Do not edit it by hand.`, '',
      ...(X ? [`- Files served from ${p.tileBase} (repository https://github.com/danbri/${R.place.outRepo}, folder \`${R.place.outPath}\`); the index entry is in londat's [cwplans/docklands/data/places/index.json](${GH}docklands/data/places/index.json)`, ...(R.place.views || []).map(v => `- ${v.name}: ${SITE}docklands/?ll=${v.ll}&ht=${v.ht || '0,55'}`)] : []),
      ...(BL ? [`- The whole city (20 km out): ${SITE}docklands/?ll=${p.centre[1]},${p.centre[0]},20000&ht=0,45`, ...(R.place.views || []).map(v => `- ${v.name}: ${SITE}docklands/?ll=${v.ll}&ht=${v.ht || '0,55'}`),
        `- A place of kind "blocks": no core and no ground of its own (the globe's terrain and imagery stay); buildings in the model box of ${(R.place.exclude || []).join(', ')} are left to that model`] : [`- Live view: ${view(p)}`, ...(R.place.views || []).map(v => `- ${v.name}: ${SITE}docklands/?ll=${v.ll}&ht=${v.ht || '0,55'}`)]), ...(R.place.surround ? [`- The city (8 km out): ${SITE}docklands/?ll=${p.centre[1]},${p.centre[0]},8000&ht=0,50`, `- The surroundings (30 km out): ${SITE}docklands/?ll=${p.centre[1]},${p.centre[0]},30000&ht=0,45`] : []), `- Area (WGS84 degrees, west, south, east, north): ${p.area.join(', ')}; ${p.buildings} buildings; built ${p.built}`,
      `- Credit shown on the page: ${p.credit}`, `- Skill: docklands-3d-page, "Three.js port: places as 3D Tiles (2026-10-18)"; fault F55 in the docklands-data-curation skill`, '');
    // files
    L.push('## Files', '', '| path | what | bytes | SHA-256 |', '|---|---|---|---|');
    const what = f => f === 'tileset.json' ? (R.place.surround ? '3D Tiles 1.1 tileset: a quadtree with REPLACE refinement (surroundings, city, core), ENU transforms relative to the parent, region bounding volumes, geometric errors' : '3D Tiles 1.1 tileset: one child per quadtree cell, ENU -> ECEF transform, region bounding volume')
      : f === 'surround.json' ? 'the text and machine interface of the city and the surroundings: ground grid, place names and peaks, rivers, roads, tiers, per-tile counts'
      : f === 'tiles/*.glb' && log.blocks?.leaf_boxes === 'compact' ? 'glTF 2.0 block tiles (one per quadtree cell with buildings): at the leaves every building not named and not irregular as a compact box (irregular ones, 300 m2 or more filling under 85 % of their oriented box, as outlines simplified at 2.5 m; layout cwplans-boxes-1, glb extras.blocks.compact: 8 bytes a box and a 17 x 17 ground grid), the named buildings as outlines with _FEATURE_ID_0 (row of features.json); at the coarse levels tall or big buildings as EXT_mesh_gpu_instancing boxes and the rest as compact squares turned to their grain; KHR_mesh_quantization; glb extras.blocks for the block card. Bytes: the sum; SHA-256: of the list of file names and their SHA-256'
      : f === 'tiles/*.glb' ? 'glTF 2.0 block tiles (one per quadtree cell with buildings): oriented boxes as EXT_mesh_gpu_instancing instances of one unit box, simplified outlines, named buildings with _FEATURE_ID_0 (row of features.json), merged boxes by square at the coarse levels; KHR_mesh_quantization; glb extras.blocks for the block card. Bytes: the sum; SHA-256: of the list of file names and their SHA-256'
      : f.startsWith('tiles/') ? (/^tiles\/15-/.test(f) && coreKeys.has(f.slice(6, -4)) ? 'glTF 2.0 core tile: ground heightfield with a JPEG texture, buildings with roofs, _FEATURE_ID_0 = row of features.json' : 'glTF 2.0 tile of the city or the surroundings: terrain grid with a JPEG texture (land cover, water, roads, rail), city blocks (KHR_mesh_quantization, EXT_mesh_gpu_instancing)')
      : f === 'features.json' ? (BL ? 'the text and machine interface: the named buildings drawn with their own id (name, height and its source, OSM id), the block counts by level' : 'the text and machine interface: buildings (height and its source, roof), streets, areas, points, ground and ring grids')
      : f === 'provenance/log.json' ? 'fetch records and dataflow activities (inputs and outputs by SHA-256), height-source and roof counts'
      : f.startsWith('sources/') ? 'committed source extract (input of an operation; see Sources)' : '';
    const files = [];
    const coreKeys = new Set(), t = last('place-tiles'); if (t) for (const o of t.outputs) { const f = o.path.replace(PRE, ''); if (f.startsWith('tiles/')) coreKeys.add(f.slice(6, -4)); if (!f.startsWith('data/raw')) files.push(f); }
    const lo = last('place-lod'); if (lo && R.place.surround) for (const o of lo.outputs) files.push(o.path.replace(PRE, ''));
    const bo = last('place-blocks'); if (bo && BL) { for (const o of bo.outputs) { const f = o.path.replace(PRE, ''); if (!f.startsWith('tiles/')) files.push(f); } files.unshift('tiles/*.glb'); }
    if (existsSync(join(dir, 'sources'))) for (const f of readdirSync(join(dir, 'sources')).sort()) files.push('sources/' + f);
    files.push('provenance/log.json');
    const tdir = join(dir, 'tiles'), tlist = f => f === 'tiles/*.glb' && existsSync(tdir) ? readdirSync(tdir).filter(x => x.endsWith('.glb')).sort() : null;
    for (const f of files) { const tl = tlist(f);
      if (tl) { L.push(`| [tiles/](${GHT}tiles) (${tl.length} files) | ${what(f)} | ${tl.reduce((a, x) => a + size(join(tdir, x)), 0)} | \`${sha(tl.map(x => x + ' ' + sha(readFileSync(join(tdir, x)))).join('\n'))}\` |`); continue; }
      const fp = join(dir, f); if (!existsSync(fp)) continue; L.push(`| [${f}](${GHP}${f}) | ${what(f)} | ${size(fp)} | \`${sha(readFileSync(fp))}\` |`); }
    let tot = 0; for (const f of files) { const tl = tlist(f); if (tl) tot += tl.reduce((a, x) => a + size(join(tdir, x)), 0); else if (existsSync(join(dir, f))) tot += size(join(dir, f)); } L.push('', `Total ${kb(tot)} (README.md not counted).`, '');
    // sources
    L.push('## Sources', '');
    for (const [key, rec] of Object.entries(log.fetches || {})) {
      const sid = srcOf(key, rec, R), s = S[sid] || {};
      L.push(`### ${key}: ${s.name || sid}`, '',
        `- Register source: \`${sid}\` ([DATA-REGISTER.md](${GH}DATA-REGISTER.md))`,
        `- Publisher: ${s.publisher || '(not in the register)'}`,
        `- Landing page: ${s.url || ''}`,
        `- Licence: ${s.licence || rec.licence || ''}${s.licence_url ? ` (${s.licence_url})` : ''}`,
        `- Credit (exact text): "${s.attribution || ''}"`,
        `- Fetched: ${rec.fetched}${rec.latest_element_timestamp ? ` (newest OSM element ${rec.latest_element_timestamp})` : ''}`,
        `- Request${Array.isArray(rec.url) ? 's' : ''}: ${(Array.isArray(rec.url) ? rec.url : [rec.url]).map(u => '`' + u + '`').join(' ; ')}${rec.window ? ` (pixel window ${rec.window.join(', ')})` : ''}${rec.member ? `, member \`${rec.member}\`` : ''}`);
      const af = rec.as_fetched;
      if (Array.isArray(af)) for (const a of af) L.push(`- As fetched: ${a.bytes} bytes, SHA-256 \`${a.sha256}\` (${a.url})`);
      else if (af?.sha256) L.push(`- As fetched: ${af.bytes} bytes, SHA-256 \`${af.sha256}\`${af.member_sha256 ? `; member SHA-256 \`${af.member_sha256}\`` : ''}`);
      else if (af?.note) L.push(`- As fetched: ${af.note}`);
      else if (rec.zip_sha256) L.push(`- As fetched: zip SHA-256 \`${rec.zip_sha256}\``);
      L.push(`- Stored for the build: \`${rec.file}\`, ${rec.bytes} bytes, SHA-256 \`${rec.sha256}\` — ${rec.committed ? `committed (\`${rec.committed.replace(PRE, '')}\`)` : 'NOT committed (raw folder, git-ignored)'}`);
      if (s.review) L.push(`- Review: ${s.review}`);
      L.push('');
    }
    // operations
    L.push('## Operations (dataflow, skill cwplans-dataflow)', '', 'Each activity: id = sha256 of [operation, version, input hashes, parameters], first 16 hex. Inputs and outputs by SHA-256; a re-run with the same inputs writes nothing. Outputs under `data/raw/` are intermediate (not committed); their hashes fix the next step.', '');
    for (const op of BL ? ['place-select-blocks', 'place-city-heights', 'place-blocks'] : ['place-select-osm', 'place-heights', 'place-tiles', ...(R.place.surround ? ['place-select-outer', 'place-city-heights', 'place-lod'] : [])]) { const a = last(op); if (!a) continue;
      L.push(`### ${a.operation} version ${a.version} (activity \`${a.activity}\`, ${a.at})`, '', `Skill ${a.skill}; tool ${a.tool}.`, '', 'Inputs:', '');
      for (const i of a.inputs) L.push(`- ${i.label}: \`${i.path}\` SHA-256 \`${i.sha256}\``);
      L.push('', 'Outputs:', ''); for (const o of a.outputs.slice(0, 4)) L.push(`- \`${o.path}\` SHA-256 \`${o.sha256}\` (${o.bytes} bytes)`);
      if (a.outputs.length > 4) L.push(`- and ${a.outputs.length - 4} more (the Files table above has each one)`);
      L.push('', `Parameters: \`${esc(JSON.stringify(a.params))}\``, ''); }
    // derivation
    if (BL) L.push('## What is derived from what', '',
      '- `place-select-blocks`: the Overture buildings answer (NDJSON, raw) + the boundary polygon (a skeleton file) -> the buildings whose geometry is from OpenStreetMap, whose centroid is inside the boundary and not in an excluded model box (outline, area, name, kind, OSM height and levels); the records of the extra geometry classes (`place.blocks.geometry`, e.g. Microsoft ML Buildings) by the same test, where no OSM outline overlaps them; and the height values of the other records (open licence only) by dataset.',
      '- `place-city-heights`: the selection + the footprint heights + the GHSL crop in `sources/` -> one height and its source per building (the place-heights order; fault F55 counts).',
      '- `place-blocks`: the selection + the heights + the globe\'s world-base height tiles (`docklands/data/world-base/dem/`) + the EGM96 geoid grid -> `tiles/*.glb`, `tileset.json`, `features.json` (named buildings).',
      '- `index.json` (one level up) and this README are made from these files.', '');
    else L.push('## What is derived from what', '',
      '- `place-select-osm`: OSM elements -> buildings and parts (outlines, height, levels and roof tags, names), areas, lines, named points.',
      '- `place-heights`: the selection + national building parts (if any; raw only) + raster height crops in `sources/` -> one height, height source and roof per building (fault F55 counts).',
      '- `place-tiles`: the selection + heights + the DEM grid + the EGM96 geoid grid (`docklands/data/world/geoid-egm96-1deg.png`) + the DEM ring grid -> `tiles/*.glb`, `tileset.json`, `features.json`.',
      ...(R.place.surround ? ['- `place-select-outer`: the Overture answers (roads, streets, water, places, peaks, city buildings) -> roads, rail, water, place names, peaks; the city buildings whose geometry is from OpenStreetMap; the height values of the other records (open licence), and the IGN floors apart.',
        '- `place-city-heights`: the city buildings + the national parts + the raster crop + the IGN floors (switch) + Overture and Microsoft heights -> one height per city building (the place-heights order, no roofs).',
        '- `place-lod`: the outer selection + city heights + the surroundings DEM + the land cover + the geoid + the core tileset -> the tiles of the city and the surroundings, `tileset.json` (the whole tree), `surround.json`.'] : []),
      '- `index.json` (one level up) and this README are made from these files.', '');
    // counts
    L.push('## Heights and roofs (fault F55: counted, not patched)', '', '| height source | buildings and parts |', '|---|---|');
    for (const [k, v] of Object.entries(log.height_sources || {})) L.push(`| ${k} | ${v} |`);
    if (log.roofs) { L.push('', '| roof | from OSM roof:shape | from the region roof rule |', '|---|---|---|');
      for (const k of [...new Set([...Object.keys(log.roofs.osm || {}), ...Object.keys(log.roofs.rule || {})])].sort()) L.push(`| ${k} | ${log.roofs.osm?.[k] || 0} | ${log.roofs.rule?.[k] || 0} |`);
      L.push(`| flat | ${log.roofs.flat} | |`, '', 'Why flat: ' + Object.entries(log.roofs).filter(([k, v]) => typeof v === 'number' && k !== 'flat').map(([k, v]) => `${k} ${v}`).join(', ') + '.'); }
    L.push('');
    const CPL = BL && log.blocks?.leaf_boxes === 'compact';
    if (log.tiers && BL && CPL) { const BKr = R.place.blocks;
      L.push('## Levels of detail', '', 'Since place-blocks 4 (2026-10-22; owner: "Yes, do all of London eventually", to rebuilding Greater London the way of the UK lite set v2): at the leaves every building that is not named is one **compact box** (layout `cwplans-boxes-1`, 8 bytes: its true centroid, footprint area, the angle and long / short ratio of its minimum rotated rectangle, its height and height source, its class), except the irregular ones (place-blocks 5, the place-blocks 3 rule kept by architecture rule 6: ' + BKr.outline_min_m2 + ' m2 or more and filling less than ' + Math.round(BKr.box_fill * 100) + ' % of their oriented box), drawn as their outline simplified at ' + BKr.simplify_m + ' m; the named buildings keep their outlines and ids. ' + (BKr.far ? 'Since place-blocks 6 (2026-10-23, issue #13: from 20 km the turned squares read as a lattice): the coarse levels draw the tall or big buildings as their own boxes and the rest as **far forms**: buildings and street blocks of adjacent buildings (oriented boxes within ' + BKr.far.gap_m + ' m, heights within max(' + BKr.far.h_abs_m + ' m, ' + BKr.far.h_rel * 100 + ' %)) at their true positions, one oriented box each with the summed footprint and the area-weighted mean height; a level draws those whose seen size sqrt(area) x max(sqrt(area), height) is at least ' + Object.entries(BKr.far.min_m2).map(([l, v]) => `${v} m2 (level ${l})`).join(', ') + ', about one device pixel squared at the far end of its range; no squares.' : 'The coarse levels draw the tall or big buildings as their own boxes and the rest as one compact square a merge square, turned to the grain of its buildings, its side from the built share (full at ' + Math.round((BKr.full_share ?? 0.5) * 100) + ' %).'), '',
        '| level | tiles | MB | triangles | building boxes (compact) | outlines (irregular) | named outlines | own boxes (tall or big; leaves: irregular with no outline) | merged squares (buildings in them) | geometric error m |', '|---|---|---|---|---|---|---|---|---|---|');
      for (const [k, v] of Object.entries(log.tiers)) { const lv = +k.replace('level ', ''); L.push(`| ${lv} | ${v.tiles} | ${(v.bytes / 1e6).toFixed(2)} | ${v.triangles.toLocaleString('en')} | ${(v.building_boxes || 0).toLocaleString('en')} | ${v.outlines.toLocaleString('en')} | ${v.named} | ${v.boxes.toLocaleString('en')} | ${(v.mass_boxes || 0).toLocaleString('en')} (${v.merged_buildings.toLocaleString('en')}) | ${BKr.levels[lv]?.err_m ?? 0} |`); }
      L.push('', `Loaded by screen-space error (docklands/globe/places.js, MAX_SSE 24 px): a tile is refined while geometric error x K / distance is above 24 (K about 731 on a phone held upright), so the leaves show within about ${Math.round(BKr.levels[BKr.leaf_level - 1].err_m * 731 / 24 / 100) / 10} km of the eye (straight down from 11 km all of the view is leaves) and never beyond ${(BKr.leaf_within_m / 1000).toFixed(0)} km (\`extras.refine_within_m\` of the leaves' parents: big screens, oblique whole-city views keep the turned squares). ${log.blocks ? `${log.blocks.buildings.toLocaleString('en')} buildings at the leaf level, ${log.blocks.named.toLocaleString('en')} of them named (outline and id).` : ''}`, '');
      if (BKr.history) L.push('Before and after: ' + BKr.history, ''); }
    else if (log.tiers && BL) { L.push('## Levels of detail', '', '| level | tiles | MB | triangles | boxes | outlines | named | merged boxes (buildings in them) |', '|---|---|---|---|---|---|---|---|');
      for (const [k, v] of Object.entries(log.tiers)) L.push(`| ${k.replace('level ', '')} | ${v.tiles} | ${(v.bytes / 1e6).toFixed(2)} | ${v.triangles.toLocaleString('en')} | ${v.boxes.toLocaleString('en')} | ${v.outlines.toLocaleString('en')} | ${v.named} | ${v.merged.toLocaleString('en')} (${v.merged_buildings.toLocaleString('en')}) |`);
      L.push('', `Loaded by screen-space error (docklands/globe/places.js): far views draw the coarse levels (tall and big buildings as their own boxes, the rest ${BKr?.far ? 'as buildings and street blocks big enough to see from there' : 'merged into one box per square'}), near views every building of the leaf cell. ${log.blocks ? `${log.blocks.buildings.toLocaleString('en')} buildings drawn at the leaf level, ${log.blocks.named.toLocaleString('en')} of them named with their own id.` : ''}`, ''); }
    if (log.tiers && BL) { L.push(
        '## Selection', '', '| what | count |', '|---|---|', ...Object.entries(log.selection || {}).map(([k, v]) => `| ${esc(k)} | ${v.toLocaleString('en')} |`), '');
      if (log.block_geometry) { L.push('## Buildings by geometry class', '', 'OSM first: a footprint of an extra class that overlaps an OSM outline is dropped (its centroid, or a point pulled 20 % to its centre, inside the other outline). Each extra class has its own register source and its own switch: its adapter id in `place.blocks.geometry` of the region config (delete the id, rebuild). The block card names the class ("Footprint from"); describeView counts the blocks drawn by class.', '',
        '| class | label | register source | switch | selected | dropped (overlap OSM) | drawn (>= min area) | heights (fault F55) |', '|---|---|---|---|---|---|---|---|');
        for (const [c, g] of Object.entries(log.block_geometry)) L.push(`| ${c} | ${g.label} | \`${g.source}\` | ${g.switch ? '`' + g.switch + '`' : '(always)'} | ${g.selected.toLocaleString('en')} | ${g.dropped_overlap_osm == null ? '' : g.dropped_overlap_osm.toLocaleString('en')} | ${g.drawn.toLocaleString('en')} | ${Object.entries(g.heights).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toLocaleString('en')}`).join(', ')} |`);
        L.push(''); } }
    else if (log.tiers) { L.push('## Tiers (level of detail)', '', '| tier | tiles | MB | triangles | blocks | tiles by level |', '|---|---|---|---|---|---|');
      const coreB = files.filter(f => f.startsWith('tiles/') && coreKeys.has(f.slice(6, -4))).reduce((a, f) => a + (existsSync(join(dir, f)) ? size(join(dir, f)) : 0), 0);
      for (const [k, v] of Object.entries(log.tiers)) L.push(`| ${k} | ${v.tiles} | ${((k === 'core' ? coreB : v.bytes) / 1e6).toFixed(2)} | ${k === 'core' ? '' : v.triangles.toLocaleString('en')} | ${v.blocks || ''} | ${Object.entries(v.levels).map(([a, b]) => `${a}: ${b}`).join(', ')} |`);
      L.push('', 'Loaded by screen-space error (docklands/globe/places.js): far tiles coarse, near tiles fine; a tile out of view is not drawn; unused tiles are freed.', '');
      L.push('## City heights (fault F55: counted, not patched)', '', '| height source | city buildings |', '|---|---|'); for (const [k, v] of Object.entries(log.city_height_sources || {})) L.push(`| ${k} | ${v} |`);
      L.push('', 'What place-select-outer kept and left out: `' + esc(JSON.stringify(log.outer_counts)) + '`', '');
      if (log.city_geometry) { L.push('## City buildings by geometry class', '', 'OSM first: an IGN or Microsoft footprint that overlaps an OSM outline is dropped. Each extra class has its own register source and its own switch: its adapter id in `place.surround.geometry` of the region config (delete the id, rebuild). The block card names the class.', '',
        '| class | footprint source | register source | switch | buildings drawn | dropped (overlap OSM) | blocks in tiles | heights by source |', '|---|---|---|---|---|---|---|---|');
        for (const [c, g] of Object.entries(log.city_geometry)) L.push(`| ${c} | ${g.label} | \`${g.source}\` | ${g.switch ? '`' + g.switch + '`' : '(always)'} | ${g.drawn} | ${g.dropped_overlap_osm} | ${log.tiers?.city?.blocks_by_class?.[c] ?? ''} | ${Object.entries(g.heights).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')} |`);
        L.push('', 'Blocks in tiles count a building once per level that draws it (levels 13 and 14, and 15 next to the core); buildings under 40 m2 are not drawn as blocks.', ''); } }
    const val = log.city_validation?.['overture-ign-floors'] || log.validation?.['overture-ign-floors'];
    if (val) { L.push('## Validation: IGN floors (via Overture) against Catastro floors and OSM levels', '', `The ${val.records} Overture records whose num_floors source is "Instituto Geográfico Nacional (España)" (empty licence field; kept apart, owner 2026-10-20). Each record against the Catastro parts whose centroid is inside its outline (area-weighted median) and against the OSM building:levels of an outline that holds its centroid (or whose centroid it holds). Used as a height: ${val.used_as_height} buildings (the IGN records are buildings that OSM does not have, so they rarely meet an OSM outline).`, '',
      '| compared with | buildings | same floors | within 1 floor | mean difference (IGN - other) | mean absolute | max absolute | differences |', '|---|---|---|---|---|---|---|---|');
      for (const k of ['national', 'osm-levels']) { const x = val[k]; if (!x) continue; L.push(`| ${k === 'national' ? 'Catastro floors' : 'OSM building:levels'} | ${x.n} | ${x.agree_pct} % | ${x.within1_pct} % | ${x.mean_diff} | ${x.mean_abs} | ${x.max_abs} | ${Object.entries(x.hist).map(([a, b]) => `${a}: ${b}`).join(', ')} |`); }
      L.push(''); }
    // not committed, review
    const raw = Object.entries(log.fetches || {}).filter(([, r]) => !r.committed).map(([k, r]) => `\`${r.file}\` (${k})`);
    L.push('## Not committed', '', `Raw downloads stay in \`cwplans/data/raw/places/${p.id}/\` (in cwplans/.gitignore): ${raw.join(', ')}, the original zips and GeoTIFFs, and the intermediates in \`work/\`. Run \`node cwplans/tools/build-place-tiles.mjs fetch --region ${p.id}\` to get them again (the hashes above say whether the source changed).`);
    if (R.adapters.some(a => a.licenceClass === 'review' && (R.place.heights || []).includes(a.id))) L.push('', 'Catastro: the original files (zip, GML, parsed parts) are never committed or published (licence: reuse only of transformed data; CLAUDE.md, data policy). Only heights computed from its floor counts reach the tiles and features.json.');
    L.push('', '## Review status', '');
    const rv = [];
    for (const a of R.adapters) { if (a.licenceClass === 'review') rv.push(`- ${a.id}: licence class "review". ${a.approved || ''}`); if (a.waiver) rv.push(`- ${a.id}: ${a.waiver}. Status: ${a.status}. ${[R.place.dem, ...(R.place.heights || [])].includes(a.id) ? 'Used in this build.' : 'No data of this source is in this build.'} Issue https://github.com/danbri/londat/issues/9`); }
    rv.push('- OSM (ODbL 1.0, share-alike): allowed for the prototyping phase (owner, 2026-10-03); to be reviewed with the rest of the OSM use.');
    for (const a of R.adapters) if (a.licenceClass === 'share-alike' && (R.place.heights || []).includes(a.id)) rv.push(`- ${a.id}: licence class "share-alike" (${a.licence}); allowed by the owner on 2026-10-20 ("Use ms/overture"), registered next to OSM. Values whose own source licence is not open (for example an empty licence field) are neither used nor committed: see the counts in sources/.`);
    const ovo = R.adapters.find(a => a.outer && a.id === (R.place.surround?.outer || R.place.blocks?.outer)); if (ovo) rv.push(`- ${ovo.id}: licence class "share-alike" (${ovo.licence}): OpenStreetMap data as redistributed by Overture; only records whose source is OpenStreetMap are drawn (geometry_sources), counted in log.json outer_counts.`);
    if (R.adapters.find(a => (a.dem?.source === 'copernicus-glo30' || a.dem?.surround?.source === 'copernicus-glo30') && a.id === R.place.dem)) rv.push('- Copernicus DEM GLO-30: its full credit ends "all rights reserved" (CLAUDE.md); accepted by the owner on 2026-10-20 ("Data - is fine for now"); re-check before the prototyping phase ends.');
    L.push(...rv, '');
    writeFileSync(join(dir, 'README.md'), L.join('\n'));
  }
  // places/README.md
  const M = ['# Places on the globe', '', `3D Tiles 1.1 sets of places outside the Docklands zone (OKR KR1.2 with KR2.3), made by [cwplans/tools/build-place-tiles.mjs](${GH}tools/build-place-tiles.mjs) and read by [docklands/globe/places.js](https://github.com/danbri/londat/blob/main/docklands/globe/places.js). Generated by the tool's \`readme\` command; do not edit by hand.`, '',
    'Owner, 2026-10-20, on the place data: "Data - is fine for now, bring it in with subdirs and readmes and provenance clear."', '',
    '## Layout', '', '```', 'index.json                  the places the globe knows (read by places.js)', '<id>/README.md              sources, licences, credits, hashes, operations, review status (generated)',
    '<id>/tileset.json           3D Tiles 1.1 tileset', '<id>/tiles/<l>-<x>-<y>.glb  one glTF tile per quadtree cell', '<id>/features.json          text and machine interface (search, featuresAt, describeView, cards)',
    '<id>/sources/               small committed source extracts that are inputs of an operation (open licence only)', '<id>/provenance/log.json    fetch records (URL, date, SHA-256 as fetched) and dataflow activities', '```', '',
    'Raw downloads (OSM answers, DEM GeoTIFFs, national and GHSL zips) stay in `cwplans/data/raw/places/<id>/`, git-ignored. Catastro originals are never committed.', '',
    '## Places', '', '| place | live view | buildings | size | README |', '|---|---|---|---|---|'];
  for (const p of ix.places) { const dir = join(OUTROOT, p.id); let tot = 0; const walk = d => { for (const n of readdirSync(d)) { const q = join(d, n); if (n === 'README.md') continue; statSync(q).isDirectory() ? walk(q) : tot += size(q); } }; if (existsSync(dir)) walk(dir);
    M.push(p.tileBase ? `| ${p.name} | ${p.view ? SITE + 'docklands/?' + p.view : view(p)} | ${p.buildings}${p.landmarks ? ` (${p.landmarks} landmarks)` : ''}${p.city_buildings ? ` (city ${p.city_buildings})` : ''} | in another repository | [README.md](${p.readme}) (${p.tileBase}) |` : `| ${p.name} | ${view(p)} | ${p.buildings} | ${kb(tot)} | [${p.id}/README.md](${GH}docklands/data/places/${p.id}/README.md) |`); }
  M.push('', `Data register entries: [DATA-REGISTER.md](${GH}DATA-REGISTER.md) (search "docklands/data/places").`, '');
  writeFileSync(join(OUTROOT, 'README.md'), M.join('\n'));
  console.log('readme: places/README.md and', ix.places.map(p => p.id + '/README.md').join(', '));
}

// ---------- the city and the surroundings: three more operations (place-select-outer, place-city-heights, place-lod)
async function buildOuter(fGeoid, natFiles, rasFiles) {
  const ov = REG.adapters.find(a => a.id === SUR.outer && a.outer), lcAd = REG.adapters.find(a => a.id === SUR.land_cover && a.landCover);
  const qf = k => outerFile(ov, k), fDemS = join(RAWD, 'dem-surround.bin.gz'), fLc = join(RAWD, 'landcover.bin.gz');
  const ovIn = Object.keys(ov.outer.queries).filter(k => existsSync(qf(k)));
  for (const f of [fDemS, fLc]) if (!existsSync(f)) throw new Error(`missing ${rel(f)}: run fetch first`);
  const ignAd = fpAds.find(a => a.buildingHeights.kind === 'overture-dataset-floors');
  // the extra geometry classes of the city ring (switch: their ids in place.surround.geometry)
  const geoAds = (SUR.geometry || []).map(id => REG.adapters.find(a => a.id === id && a.geometry)).filter(Boolean);
  // 4. place-select-outer: Overture answers -> roads, rail, water, names, peaks, city buildings (OSM geometry), footprint heights
  const fOut = join(WORK, 'outer.json.gz');
  const SP = { licences: overture?.buildingHeights?.licences || ['ODbL-1.0', 'CDLA-Permissive-2.0', 'CDLA-Permissive-1.0', 'CC-BY-4.0', 'CC0-1.0'], ignDataset: ignAd ? ignAd.buildingHeights.dataset : null, geometrySources: SUR.geometry_sources || ov.outer.geometry_sources, extraGeometry: geoAds.map(a => ({ cls: a.geometry.cls, dataset: a.geometry.dataset })), altKeys: (PL.alt_names || []).map(k => k.replace(/^name:/, '')).concat(['sr-Cyrl']) };
  const ovInputs = []; for (const k of ovIn) ovInputs.push(qf(k).endsWith('.ndjson') ? await fileInBig(qf(k), 'overture-' + k) : fileIn(qf(k), 'overture-' + k));
  await run(OPS.outer, ovInputs, SP, async p => {
    const raw = {}; for (const k of ovIn) raw[k] = await readOuter(qf(k)); const o = selectOuter(raw, p);
    for (const b of o.buildings) b.c = centroid(open(b.rings[0]));
    jz(fOut, o); console.log('  outer:', JSON.stringify(o.counts)); return [fOut]; });
  const outer = rz(fOut);
  // 5. place-city-heights: the core's height rule over the city's buildings (no roof rule: blocks are flat)
  const fCH = join(WORK, 'city-heights.json.gz'), fMs = join(RAWD, 'ms-city.json.gz'), fIgn = ignAd ? fpFile(ignAd) : null;
  const msIn = existsSync(fMs) ? [fileIn(fMs, 'ms-city')] : [], ignIn = fIgn && existsSync(fIgn) ? [fileIn(fIgn, 'overture-ign-floors')] : [];
  const CP = { storey_m: 3, national_storey_m: natAds[0]?.buildingHeights.storey_m ?? 3, ...(lod2Ad ? { national_height_label: lod2Ad.buildingHeights.label } : {}), default_m: PL.default_height_m ?? 9, default_small_m: 3, raster_min_m: 3, roof_rule: null, pitch_deg: 30, max_roof_m: 8,
    rule: 'as place-heights, over the city buildings (Overture records whose geometry is from OpenStreetMap; their OSM height and floors first); no roofs (blocks)' };
  await run(OPS.cityHeights, [fileIn(fOut, 'outer'), ...natFiles.map(f => fileIn(f, 'national-heights')), ...rasFiles.map(([, f]) => fileIn(f, 'raster-heights')), ...ignIn, ...msIn], CP, async p => {
    const nat = natFiles.flatMap(f => rz(f).parts), ras = rasFiles.map(([a, f]) => ({ ...JSON.parse(readFileSync(f, 'utf8')), label: a.buildingHeights.label }));
    const fps = [...(ignIn.length ? [{ label: 'overture-ign-floors', top: false, min_area_ratio: ignAd.buildingHeights.min_area_ratio, rows: footprintRows(JSON.parse(readFileSync(fIgn, 'utf8'))) }] : []),
      { label: 'overture', top: true, min_area_ratio: 0.5, rows: outer.fp_overture }, ...(msIn.length ? [{ label: 'ms', top: true, min_area_ratio: 0.5, rows: rz(fMs).rows }] : [])];
    const sel = { buildings: outer.buildings.map(b => ({ ...b, height: b.height ?? null, levels: b.levels ?? null, min_height: b.min_height ?? null, min_level: null, roof_shape: null })) };
    const r = heightsOf(sel, nat, ras, p, fps);
    r.by_class = {}; for (const b of outer.buildings) { const h = r.heights[b.id]; if (!h) continue; const o = r.by_class[b.cls || 'osm'] ||= {}; o[h.src] = (o[h.src] || 0) + 1; }
    jz(fCH, r); console.log('  city heights by geometry class:', JSON.stringify(r.by_class)); console.log('  city heights:', JSON.stringify(r.faults)); console.log('  city validation:', JSON.stringify(r.validation)); return [fCH]; });
  const CH = rz(fCH);
  // 6. place-lod: the tile tree, the outer tiles, tileset.json and surround.json
  const fCore = join(WORK, 'core-tileset.json');
  const LP = { grid: 32, grids: { 10: 16, 11: 20, 12: 24, 13: 28 }, tex: 256, jpeg: 70, block_level: 13, min_area_m2: 40, big_area_m2: 600, big_height_m: 18, simplify_m: 2.5, box_fill: 0.85, outline_min_m2: 300, blend_m: 8000, box_m: 10000, sse_note: 'geometricError of a refined cell = max(2 x terrain vertex spacing, the building error of its level)',
    ext: EXT.map(r7), top: TOP, refine: SUR.refine, city: CITY, version_label: `${RID}-2`, blocks_from_m: PL.city?.blocks_from_m ?? 25000, ...(surDemAd.dem.open_px ? { dem_open_px: surDemAd.dem.open_px } : {}),
    colours: { water: '#4f86ab', footprint: '#8d877d', block: '#d6cbb6' },
    roads: { motorway: { width_m: 26, min_px: 1.8, colour: '#d9825f', casing: '#7e5a46', min_level: 0 }, trunk: { width_m: 20, min_px: 1.6, colour: '#e3a165', casing: '#7e5f46', min_level: 0 },
      primary: { width_m: 16, min_px: 1.4, colour: '#ecc77e', casing: '#86704f', min_level: 0 }, secondary: { width_m: 13, min_px: 1.1, colour: '#f2dea0', min_level: 0 },
      tertiary: { width_m: 10, min_px: 0.8, colour: '#f4efe2', min_level: 11 }, streets: { width_m: 7, min_px: 0.6, colour: '#f7f4ec', min_level: 13 }, rail: { width_m: 5, min_px: 1, colour: '#5f5a55', min_level: 0 } } };
  const credit = [`© OpenStreetMap contributors (ODbL 1.0)`, DEM_CREDIT, ov.outer.credit, ...geoAds.map(a => a.geometry.credit), lcAd?.landCover.credit, ...hAds.map(a => a.buildingHeights.credit)].filter(Boolean).join('; ');
  const a6 = await run(OPS.lod, [fileIn(fOut, 'outer'), fileIn(fCH, 'city-heights'), fileIn(fDemS, 'dem-surround'), fileIn(fLc, 'landcover'), fileIn(fGeoid, 'geoid'), fileIn(fCore, 'core-tileset')], { ...LP, credit }, async p => {
    const geoAt = await geoidSampler(fGeoid), demS0 = loadGrid(fDemS), demS = p.dem_open_px ? openGrid(demS0, p.dem_open_px) : demS0, lc = loadGrid(fLc), demAt = easedDem(demS, EXT, mLon, mLat, p.blend_m, p.box_m), core = JSON.parse(readFileSync(fCore, 'utf8'));
    const coreKids = new Map(core.root.children.map(c => [c.content.uri.match(/(\d+-\d+-\d+)\.glb/)[1], c]));
    const roots = lodTree({ ext: EXT, top: TOP, core: new Set(coreKids.keys()), coreArea: AREA, city: CITY, origin: O, mLon, mLat, refine: p.refine });
    // stale outer tiles of an earlier run go first (the core tiles are place-tiles' outputs)
    for (const f of readdirSync(join(OUT, 'tiles'))) if (!coreKids.has(f.replace('.glb', ''))) rmSync(join(OUT, 'tiles', f));
    // the city buildings by cell at each level from block_level to 15 (by centroid)
    const byCell = new Map(); for (const b of outer.buildings) { if (!CH.heights[b.id]) continue; for (let l = p.block_level; l <= 15; l++) { const cs = 180 / 2 ** l, k = `${l}-${Math.floor((b.c[0] + 180) / cs)}-${Math.floor((b.c[1] + 90) / cs)}`; (byCell.get(k) || byCell.set(k, []).get(k)).push(b); } }
    const outFiles = [], stats = [], cellNs = l => 180 / 2 ** l * mLat;
    const gridOf = l => p.grids[l] || p.grid, errOf = n => !n.kids.length ? 0 : Math.round(Math.max(2 * cellNs(n.l) / gridOf(n.l), n.l === p.block_level - 1 && CITY && meet(n.b, CITY) ? 40 : 0, n.l >= p.block_level && CITY && meet(n.b, CITY) ? 12 : 0, n.l < p.block_level && CITY && meet(n.b, CITY) && p.blocks_from_m ? p.blocks_from_m * 24 / 731 : 0) * 10) / 10;   // (blocks_from_m: the place-far-lod rule, place-lod.mjs farLod)
    let nOut = 0; const total = (() => { let k = 0; walk(roots, n => { if (!n.core) k++; }); return k; })();
    async function tile(n, parentWorld) {
      let world, region, uri, st;
      if (n.core) { const c = coreKids.get(n.key); world = c.transform; region = c.boundingVolume.region; uri = c.content.uri; st = { key: n.key, level: 15, core: true }; }
      else { const r = await outerTile({ cell: n, P: { ...p, grid: gridOf(n.l), credit }, demAt, geoidAt: geoAt, lc, lcColours: lcAd.landCover.colours, sel: outer, cityB: byCell.get(n.key) || null, HT: CH.heights, city: CITY, mLon, mLat });
        const f = join(OUT, 'tiles', n.key + '.glb'); writeFileSync(f, r.bytes); outFiles.push(f); world = r.F.matrix(); region = r.region; uri = `tiles/${n.key}.glb`; st = r.stats;
        if (++nOut % 25 === 0) console.log(`  place-lod: ${nOut} / ${total} outer tiles`); }
      stats.push(st);
      const kids = []; for (const k of n.kids) kids.push(await tile(k, world));
      for (const k of kids) { region = [region[0], region[1], region[2], region[3], Math.min(region[4], k.boundingVolume.region[4]), Math.max(region[5], k.boundingVolume.region[5])]; }
      const t = { boundingVolume: { region: region.map(v => +v.toPrecision(12)) }, geometricError: errOf(n), refine: 'REPLACE', transform: roundM(parentWorld ? mul4(inv4rigid(parentWorld), world) : world), content: { uri } };
      if (kids.length) t.children = kids; return t;
    }
    const children = []; for (const n of roots) children.push(await tile(n, null));
    let lo = Infinity, hi = -Infinity; for (const c of children) { lo = Math.min(lo, c.boundingVolume.region[4]); hi = Math.max(hi, c.boundingVolume.region[5]); }
    const rootErr = Math.round(4 * cellNs(TOP) / gridOf(TOP));
    const tileset = { asset: { version: '1.1', generator: 'cwplans build-place-tiles.mjs (place-lod)', tilesetVersion: p.version_label, extras: { place: RID, name: REG.name, credit, tiers: 'core: level-15 cells, full detail; city: blocks from level ' + p.block_level + '; surroundings: terrain, land cover, roads, rail, water from level ' + TOP } },
      geometricError: rootErr * 2, root: { boundingVolume: { region: [EXT[0] * D2R, EXT[1] * D2R, EXT[2] * D2R, EXT[3] * D2R, lo, hi].map(v => +v.toPrecision(12)) }, geometricError: rootErr, refine: 'REPLACE', children } };
    const tsf = join(OUT, 'tileset.json'); writeFileSync(tsf, JSON.stringify(tileset)); outFiles.push(tsf);
    // surround.json: the text and machine interface of the city and the surroundings
    const GN = 129, gh = []; for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) gh.push(Math.round(demAt(EXT[0] + (EXT[2] - EXT[0]) * i / (GN - 1), EXT[3] - (EXT[3] - EXT[1]) * j / (GN - 1)) * 10) / 10);
    const inExt = (lon, lat) => lon >= EXT[0] && lon <= EXT[2] && lat >= EXT[1] && lat <= EXT[3];
    const plen = pts => { let L = 0; for (let q = 1; q < pts.length; q++) L += Math.hypot((pts[q][0] - pts[q - 1][0]) * mLon, (pts[q][1] - pts[q - 1][1]) * mLat); return L; };
    const group = (items, keyOf) => { const m = new Map(); for (const it of items) { const k = keyOf(it); if (!k) continue; const g = m.get(k) || m.set(k, { L: 0, pts: [], it }).get(k); g.L += plen(it.pts); g.pts.push(it.pts[Math.floor(it.pts.length / 2)]); } return [...m.values()]; };
    const rivers = group(outer.water_lines.filter(w => ['river', 'canal'].includes(w.cls)), w => w.name).map(g => { const mid = g.pts[Math.floor(g.pts.length / 2)]; return [g.it.name, g.it.alt || null, g.it.cls, Math.round(g.L / 100) / 10, r7(mid[0]), r7(mid[1])]; }).filter(r => inExt(r[4], r[5])).sort((a, b) => b[3] - a[3]);
    const roads = group(outer.roads.filter(r => r.kind === 'road' && r.name), r => r.name).map(g => { const mid = g.pts[Math.floor(g.pts.length / 2)]; return [g.it.name, g.it.alt || null, g.it.cls, Math.round(g.L / 100) / 10, r7(mid[0]), r7(mid[1])]; }).filter(r => inExt(r[4], r[5]) && r[3] >= 0.3).sort((a, b) => b[3] - a[3]);
    const KR = { city: 0, town: 1, village: 2, hamlet: 3, peak: 2 };
    const labels = outer.labels.filter(x => inExt(x.lon, x.lat) && (x.subtype === 'locality' || x.subtype === 'peak' || x.subtype === 'localadmin')).map(x => [x.name, x.alt || null, x.subtype === 'peak' ? 'peak' : x.kind || x.subtype, x.lon, x.lat, x.pop, x.ele ?? null, KR[x.subtype === 'peak' ? 'peak' : x.kind] ?? 3])
      .sort((a, b) => a[7] - b[7] || (b[5] || 0) - (a[5] || 0) || a[0].localeCompare(b[0]));
    const tiers = {}; for (const s of stats) { const t = s.core ? 'core' : s.blocks ? 'city' : 'surroundings', o = tiers[t] ||= { tiles: 0, bytes: 0, triangles: 0, blocks: 0, levels: {} }; o.tiles++; o.bytes += s.bytes || 0; o.triangles += s.triangles || 0; o.blocks += s.blocks || 0; o.levels[s.level] = (o.levels[s.level] || 0) + 1; for (const [c, n] of Object.entries(s.blocks_by_class || {})) { o.blocks_by_class ||= {}; o.blocks_by_class[c] = (o.blocks_by_class[c] || 0) + n; } }
    const sj = { format: 'place-surround-1', place: RID, name: REG.name, extent: EXT.map(r7), city: CITY, top_level: TOP, credit,
      geometry_classes: { osm: { label: 'OpenStreetMap (via Overture)', source: 'osm' }, ...Object.fromEntries(geoAds.map(a => [a.geometry.cls, { label: a.geometry.label, source: a.geometry.source, switch: a.id }])) },
      ground: { grid: GN, area: EXT.map(r7), h: gh, datum: DEMS.datum + ' (the surroundings DEM, its outer ' + p.blend_m / 1000 + ' km eased to a ' + p.box_m / 1000 + ' km box mean); add the geoid (EGM96) for WGS84 ellipsoidal heights', source: DEMS.source },
      labels_fields: ['name', 'name_alt', 'kind', 'lon', 'lat', 'population', 'elevation_m', 'rank'], labels,
      rivers_fields: ['name', 'name_alt', 'class', 'length_km', 'lon', 'lat'], rivers, roads_fields: ['name', 'name_alt', 'class', 'length_km', 'lon', 'lat'], roads: roads.slice(0, 400),
      tiers, tiles_fields: ['key', 'level', 'bytes', 'triangles', 'blocks', 'roads_m', 'rail_m', 'river_m', 'rivers'], tiles: stats.filter(s => !s.core).map(s => [s.key, s.level, s.bytes, s.triangles, s.blocks, s.roads_m, s.rail_m, s.river_m, s.rivers]) };
    const sf = join(OUT, 'surround.json'); writeFileSync(sf, JSON.stringify(sj)); outFiles.push(sf);
    console.log('  tiers:', JSON.stringify(tiers));
    return outFiles; });
  const sj = JSON.parse(readFileSync(join(OUT, 'surround.json'), 'utf8'));
  return { at: a6.at, credit, cityHeights: CH, outerCounts: outer.counts, tiers: sj.tiers, cityBuildings: outer.buildings.length, geometryClasses: Object.fromEntries(['osm', ...geoAds.map(a => a.geometry.cls)].map(c => [c, { label: c === 'osm' ? 'OpenStreetMap (via Overture)' : geoAds.find(a => a.geometry.cls === c).geometry.label, source: c === 'osm' ? 'osm' : geoAds.find(a => a.geometry.cls === c).geometry.source, switch: c === 'osm' ? null : geoAds.find(a => a.geometry.cls === c).id, drawn: outer.buildings.filter(b => (b.cls || 'osm') === c).length, dropped_overlap_osm: outer.counts[`buildings ${c} dropped (overlap an OSM building)`] || 0, heights: CH.by_class?.[c] || {} }])) };
}

// ---------- a place of kind "blocks" (Greater London; region config place.kind 'blocks', place.blocks): no core and no
// ground of its own. Fetch: the Overture buildings of the boundary box (NDJSON: about 2 million rows, more than one JSON
// string can hold) and the GHSL tiles over it. Build: three operations, place-select-blocks (OSM geometry inside the
// boundary, outside the model boxes of place.exclude; non-OSM height values by dataset), place-city-heights (the
// place-heights order, no roofs) and place-blocks (cwplans/tools/place-blocks.mjs: the tree, the tiles, tileset.json,
// features.json of the named buildings). Skill docklands-3d-page, "Three.js port: Greater London as blocks (2026-10-22)".
async function shaFile(p) { const h = createHash('sha256'); for await (const c of createReadStream(p)) h.update(c); return h.digest('hex'); }
const fileInBig = async (p, label) => ({ label, path: rel(p), sha256: await shaFile(p) });
async function* ndjsonLines(p) { const src = p.endsWith('.gz') ? createReadStream(p).pipe(createGunzip()) : createReadStream(p); for await (const line of createInterface({ input: src, crlfDelay: Infinity })) if (line) yield line; }
async function writeNdjsonGz(p, items) {
  const gz = createGzip({ level: 6 }), ws = createWriteStream(p), done = new Promise((res, rej) => { ws.on('finish', res); ws.on('error', rej); }); gz.pipe(ws);
  for (const it of items) if (!gz.write(JSON.stringify(it) + '\n')) await new Promise(r => gz.once('drain', r));
  gz.end(); await done;
}
// the query box: the region bbox rounded out to 0.01 degree
const QBOX = REG.bbox ? [Math.floor(REG.bbox[0] * 100) / 100, Math.floor(REG.bbox[1] * 100) / 100, Math.ceil(REG.bbox[2] * 100) / 100, Math.ceil(REG.bbox[3] * 100) / 100] : null;
const ovB = () => REG.adapters.find(a => a.id === BK.outer && a.outer);
const blocksRaw = () => join(RAWD, `overture-${BK.query}-${ovB().outer.release}.ndjson`);
async function fetchBlocks() {
  const ov = ovB(), Q = { ...ov.outer.queries[BK.query], ...(BK.columns ? { columns: BK.columns } : {}), ...(BK.where != null ? { where: BK.where } : {}) }, f = blocksRaw();
  if (!existsSync(f) || flag('--refetch')) { const bb = QBOX.map(v => v.toFixed(2)); execFileSync(process.env[ov.outer.python] || 'python3', ['-I', join(CW, '..', ov.outer.script), ov.outer.release, Q.theme, Q.type, ...bb, f, Q.columns, Q.where], { stdio: 'inherit' }); }
  if (!flog['overture-buildings'] || flag('--refetch')) { const M = JSON.parse(readFileSync(f + '.meta.json', 'utf8')), st = statSync(f);
    flog['overture-buildings'] = { url: `s3://overturemaps-us-west-2/release/${M.release}/theme=${M.theme}/type=${M.type}/ (bbox ${M.bbox.join(',')}; files ${M.files_read.join(' ')})`, fetched: new Date(st.mtimeMs).toISOString(), bytes: st.size, sha256: await shaFile(f), file: rel(f),
      source: 'overture-buildings', request: `DuckDB read_parquet over HTTPS of the ${M.files_listed} files of the release, filter on bbox and: ${M.where}; columns ${M.columns.join(', ')}; rows ordered by id, one JSON object a line (fetch-overture-theme.py, .ndjson)`,
      records: M.rows_count, licence: ov.licence, as_fetched: { note: 'the query answer as written by cwplans/tools/fetch-overture-theme.py (raw folder, NDJSON); sha256 above' } }; saveFlog(); }
  console.log(`overture buildings: ${flog['overture-buildings'].records} rows`);
  for (const a of rasAds) await fetchGhslMosaic(a);
}
// GHSL over the query box: a mosaic of the 10 x 10 degree tiles it meets (Greater London: R4_C18 and R4_C19, the tile
// edge near 0.008 W), cropped; committed gzip in sources/ (CC BY 4.0), the zips stay raw
async function fetchGhslMosaic(a) {
  const B = a.buildingHeights, f = join(SRC, `${B.source}.json.gz`); if (existsSync(f) && !flag('--refetch')) return;
  const m = 0.003, b = [QBOX[0] - m, QBOX[1] - m, QBOX[2] + m, QBOX[3] + m], tiles = [];
  for (let r = Math.floor((B.north - b[3]) / B.tile_deg) + 1; r <= Math.floor((B.north - b[1]) / B.tile_deg) + 1; r++) for (let c = Math.floor((b[0] - B.west) / B.tile_deg) + 1; c <= Math.floor((b[2] - B.west) / B.tile_deg) + 1; c++) tiles.push([r, c]);
  let G = null; const got = [];
  for (const [r, c] of tiles) {
    const url = B.url.replace('{r}', r).replace('{c}', c), zip = join(RAWD, url.split('/').pop()); if (!existsSync(zip) || flag('--refetch')) { writeFileSync(zip, await get(url)); await pause(1000); }
    const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean), member = names.find(n => new RegExp(B.member).test(n));
    const tif = execFileSync('unzip', ['-p', zip, member], { maxBuffer: 1 << 30 }), img = await (await fromArrayBuffer(tif.buffer.slice(tif.byteOffset, tif.byteOffset + tif.byteLength))).getImage();
    const [w0, s0, e0, n0] = img.getBoundingBox(), W = img.getWidth(), H = img.getHeight(), px = (e0 - w0) / W, py = (n0 - s0) / H;
    if (!G) { const w = w0 + Math.floor((b[0] - w0) / px) * px, n = n0 - Math.floor((n0 - b[3]) / py) * py, nx = Math.ceil((b[2] - w) / px), ny = Math.ceil((n - b[1]) / py); G = { w, n, e: w + nx * px, s: n - ny * py, nx, ny, px, py, h: new Array(nx * ny).fill(0) }; }
    const cl = (v, k) => Math.max(0, Math.min(k, v)), win = [cl(Math.floor((G.w - w0) / px + 1e-6), W), cl(Math.floor((n0 - G.n) / py + 1e-6), H), cl(Math.ceil((G.e - w0) / px - 1e-6), W), cl(Math.ceil((n0 - G.s) / py - 1e-6), H)];
    if (win[2] > win[0] && win[3] > win[1]) { const ras = (await img.readRasters({ window: win }))[0], ww = win[2] - win[0];
      for (let j = 0; j < G.ny; j++) { const tj = Math.floor((n0 - (G.n - (j + 0.5) * G.py)) / py) - win[1]; if (tj < 0 || tj >= win[3] - win[1]) continue;
        for (let i = 0; i < G.nx; i++) { const ti = Math.floor((G.w + (i + 0.5) * G.px - w0) / px) - win[0]; if (ti < 0 || ti >= ww) continue; G.h[j * G.nx + i] = Math.round(ras[tj * ww + ti] * 10) / 10; } } }
    const zb = readFileSync(zip); got.push({ url, member, tile: `R${r}_C${c}`, window: win, bytes: zb.length, sha256: sha(zb), member_sha256: sha(tif) });
  }
  const grid = { format: 'place-raster-1', source: B.source, about: a.about, licence: a.licence, credit: B.credit, tiles: got.map(g => g.tile), urls: got.map(g => g.url),
    note: 'a mosaic of the tiles above cropped to the query box (pixel windows in log.json), values rounded to 0.1 m; 0 = no built surface in the cell. Row 0 = north.',
    w: r7(G.w), n: r7(G.n), e: r7(G.e), s: r7(G.s), nx: G.nx, ny: G.ny, h: G.h };
  writeFileSync(f, gzipSync(JSON.stringify(grid) + '\n'));
  record('heights-' + a.id, f, got.map(g => g.url), { source: B.source, as_fetched: got, cells: G.nx * G.ny, committed: rel(f), licence: a.licence, note: 'the tile zips stay in the raw folder; the committed crop (gzip JSON) is the input of place-city-heights' });
  console.log(`heights ${a.id}: ${G.nx} x ${G.ny} cells from ${got.length} tile(s)`);
}
// the boundary polygon: a feature of a skeleton set (format skeleton-1) by its code
function boundary() {
  const Bd = PL.boundary, dir = join(CW, Bd.skeleton), M = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')), L = M.layers.find(l => l.id === Bd.layer), lv = L.levels.find(l => l.level === Bd.level);
  for (const fd of lv.files) { const file = join(dir, fd.path), fc = unpack(JSON.parse(readFileSync(file, 'utf8')));
    const ft = fc.features.find(x => x.properties.code === Bd.code); if (!ft) continue;
    const polysB = ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.coordinates;
    const inside = (lon, lat) => polysB.some(p => inRing([lon, lat], p[0]) && !p.slice(1).some(h => inRing([lon, lat], h)));
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity; for (const p of polysB) for (const [x, y] of p[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
    return { file, inside, bbox: [w, s, e, n], name: ft.properties.name, points: polysB.reduce((k, p) => k + p[0].length, 0) }; }
  throw new Error(`boundary ${Bd.code} not found in ${Bd.skeleton} ${Bd.layer} level ${Bd.level}`);
}
// the model boxes of place.exclude: a building whose centroid is at least inset_m inside one is drawn by that model
async function exclusions() {
  const list = [];
  for (const id of PL.exclude || []) { const R2 = REGIONS[id], ad = R2 && R2.adapters.find(a => a.modelFrame && a.modelBox); if (!ad) throw new Error(`exclude ${id}: no adapter with modelFrame and modelBox`);
    const mod = await import(join(CW, '..', ad.module)), MF = mod.modelFrame(ad.modelFrame), F0 = enuFrame(R2.origin), Bx = ad.modelBox, m = Bx.inset_m || 0;
    list.push({ id, origin: R2.origin, modelFrame: ad.modelFrame, modelBox: Bx, fn: (lon, lat) => { const [e, n] = F0.toEnu(lon, lat, R2.origin.h), [x, , z] = MF.fromEnu([e, n, 0]); return x >= Bx.x0 + m && x <= Bx.x1 - m && z >= Bx.z0 + m && z <= Bx.z1 - m; } }); }
  return { params: list.map(({ fn, ...o }) => o), fn: (lon, lat) => list.some(x => x.fn(lon, lat)) };
}
async function buildBlocks() {
  const ov = ovB(), fQ = blocksRaw(), fGeoid = join(CW, 'docklands', 'data', 'world', 'geoid-egm96-1deg.png'); if (!existsSync(fQ)) throw new Error(`missing ${rel(fQ)}: run fetch first`);
  const bnd = boundary(), ex = await exclusions();
  // the extra geometry classes (switch: their adapter ids in place.blocks.geometry; e.g. Microsoft ML Buildings, class 'ms')
  const geoAds = (BK.geometry || []).map(id => REG.adapters.find(a => a.id === id && a.geometry) || (() => { throw new Error(`place.blocks.geometry: no adapter ${id} with a geometry block`); })());
  // 1. place-select-blocks
  const fSel = join(WORK, 'blocks-select.ndjson.gz'), fFp = join(WORK, 'blocks-footprints.json.gz');
  const SP = { boundary: { ...PL.boundary, name: bnd.name, points: bnd.points }, exclude: ex.params, geometrySources: ov.outer.geometry_sources, licences: overture.buildingHeights.licences, heightLabels: BK.footprint_classes || {}, ...(geoAds.length ? { extraGeometry: geoAds.map(a => ({ cls: a.geometry.cls, dataset: a.geometry.dataset })) } : {}) };
  await run(OPS.selBlocks, [await fileInBig(fQ, 'overture-buildings'), fileIn(bnd.file, 'boundary')], SP, async p => {
    const S = blockSelector({ inBoundary: bnd.inside, excluded: ex.fn, geometrySources: p.geometrySources, licences: p.licences, heightLabels: p.heightLabels, extraGeometry: p.extraGeometry });
    let k = 0; for await (const line of ndjsonLines(fQ)) { S.add(JSON.parse(line)); if (++k % 500000 === 0) console.log(`  place-select-blocks: ${k} rows`); }
    const o = S.done(); await writeNdjsonGz(fSel, o.buildings); jz(fFp, { fp: o.fp, counts: o.counts }); console.log('  selection:', JSON.stringify(o.counts)); return [fSel, fFp]; });
  const buildings = []; for await (const line of ndjsonLines(fSel)) buildings.push(JSON.parse(line));
  const FP = rz(fFp);
  // 2. place-city-heights: the place-heights order (no national source, no roofs)
  const fH = join(WORK, 'blocks-heights.json.gz'), rasFiles = rasAds.map(a => [a, join(SRC, `${a.buildingHeights.source}.json.gz`)]).filter(([, f]) => existsSync(f));
  const CP = { storey_m: 3, national_storey_m: 3, default_m: PL.default_height_m ?? 9, default_small_m: 3, raster_min_m: 3, roof_rule: null, pitch_deg: 30, max_roof_m: 8, footprints: Object.keys(FP.fp),
    rule: 'as place-heights over the selected buildings: OSM height > OSM building:levels x storey > Overture height > Overture num_floors x storey (non-OSM records, open licence, not Microsoft) > Microsoft ML Buildings height (via Overture; footprint match: a centroid inside the other outline, area ratio >= 0.5) > small kinds 3 m > GHSL cell under the centroid (min 3 m) > default; no roofs (blocks)' };
  await run(OPS.cityHeights, [fileIn(fSel, 'selected'), fileIn(fFp, 'footprint-heights'), ...rasFiles.map(([, f]) => fileIn(f, 'raster-heights'))], CP, async p => {
    const ras = rasFiles.map(([a, f]) => ({ ...rz(f), label: a.buildingHeights.label }));
    const fps = ['overture', ...Object.keys(FP.fp).filter(k => k !== 'overture')].filter(k => FP.fp[k]).map(k => ({ label: k, top: true, min_area_ratio: 0.5, rows: FP.fp[k] }));
    const r = heightsOf({ buildings }, [], ras, p, fps); delete r.roofs;
    // counts by geometry class (fault F55 per class), as place-city-heights of a surround block
    r.by_class = {}; for (const b of buildings) { const h = r.heights[b.id]; if (!h) continue; const o = r.by_class[b.cls || 'osm'] ||= {}; o[h.src] = (o[h.src] || 0) + 1; }
    jz(fH, r); console.log('  heights:', JSON.stringify(r.faults)); console.log('  heights by geometry class:', JSON.stringify(r.by_class)); console.log('  footprint matches:', JSON.stringify(r.matches)); return [fH]; });
  const HZ = rz(fH), HT = HZ.heights;
  // 3. place-blocks: the tree, the tiles, tileset.json, features.json
  const gdir = join(CW, BK.ground), GM = JSON.parse(readFileSync(join(gdir, 'base.json'), 'utf8'));
  const gfiles = []; for (const [Ls, a] of Object.entries(GM.dem.tiles)) { const L = +Ls, cs = 180 / 2 ** L; for (let i = 0; i < a.length; i += 2) { const x = a[i], y = a[i + 1], b = [-180 + x * cs, 90 - (y + 1) * cs, -180 + (x + 1) * cs, 90 - y * cs]; if (meet(b, QBOX)) gfiles.push(join(gdir, GM.dem.url.replace('{z}', L).replace('{x}', x).replace('{y}', y))); } }
  gfiles.sort(); const gIn = { label: 'world-base heights', path: rel(gdir) + `dem (${gfiles.length} tiles over the query box; sha256 of the list of path and sha256 of each)`, sha256: sha(gfiles.map(f => rel(f) + ' ' + sha(readFileSync(f))).join('\n')) };
  const credit = ['© OpenStreetMap contributors (ODbL 1.0)', 'Buildings: OpenStreetMap data via Overture Maps © Overture Maps Foundation (ODbL 1.0)', ...geoAds.map(a => a.geometry.credit), ...hAds.map(a => a.buildingHeights.credit), 'Ground: ' + GM.dem.credit + ' (the globe\'s world-base heights)'].join('; ');
  if (argOf('trial')) Object.assign(BK, JSON.parse(readFileSync(argOf('trial'), 'utf8')));   // (a trial build: --trial <json file> replaces top-level keys of place.blocks, e.g. levels or far; issue #13's measured options)
  const CPT = BK.leaf_boxes === 'compact';   // (place-blocks 4: the UK lite v2 way, compact boxes)
  const TP = { top: BK.top_level, leaf: BK.leaf_level, levels: BK.levels, min_area_m2: BK.min_area_m2, simplify_m: BK.simplify_m, box_fill: BK.box_fill, outline_min_m2: BK.outline_min_m2, drop_m: BK.drop_m ?? 3,
    named_min_m2: BK.named_min_m2, named_min_h_m: BK.named_min_h_m, colour: BK.colour || '#d6cbb6', version_label: `${RID}-${CPT ? 2 : 1}`, extent_box: QBOX,
    ...(CPT ? { leaf_boxes: 'compact', leaf_outlines: BK.leaf_outlines !== false, layout: 'cwplans-boxes-1', full_share: BK.full_share ?? 0.5, grid_n: BK.grid_n ?? 17, leaf_within_m: BK.leaf_within_m ?? null,
      ...(BK.far ? { far: BK.far } : {}),
      classes: ['OpenStreetMap (via Overture)', 'merged buildings (one box a square, turned to the grain of its buildings: the summed footprint, the area-weighted mean height)', 'OpenStreetMap (via Overture)', ...geoAds.map(a => a.geometry.label)],
      class_index: Object.fromEntries(geoAds.map((a, i) => [a.geometry.cls, 3 + i])) }
      : { classes: ['OpenStreetMap (via Overture)', `merged ${geoAds.length ? '' : 'OpenStreetMap '}buildings (one box per square: the summed footprint, the area-weighted mean height)`, ...geoAds.map(a => a.geometry.label)],
        class_index: Object.fromEntries(geoAds.map((a, i) => [a.geometry.cls, 2 + i])) }), credit };
  if (CPT && geoAds.length > 1) throw new Error('place.blocks.leaf_boxes compact: one extra geometry class at most (the compact flags hold one class bit)');
  const a3 = await run(OPS.blocks, [fileIn(fSel, 'selected'), fileIn(fH, 'heights'), gIn, fileIn(fGeoid, 'geoid')], TP, async p => {
    const geoAt = await geoidSampler(fGeoid), G = worldBaseGround(GM, (L, x, y) => { const b = readFileSync(join(gdir, GM.dem.url.replace('{z}', L).replace('{x}', x).replace('{y}', y))); return new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); });
    const B = buildings.filter(b => b.a >= p.min_area_m2 && HT[b.id] && HT[b.id].h > 0);
    const named = new Map(), rows = [];
    for (const b of B) if (b.name && (b.a >= p.named_min_m2 || HT[b.id].h >= p.named_min_h_m)) { named.set(b.id, rows.length); rows.push(b); }
    // (compact) every building as a box record: true centroid, area, angle and long / short ratio, height, class, source
    const BX = p.leaf_boxes === 'compact' ? B.map(b => { const H = HT[b.id], si = HSRC.indexOf(H.src); if (si < 0) throw new Error(`height source ${H.src} has no index in the compact layout (HSRC)`); return footprintBox(b, H.h, b.cls ? 1 : 0, si); }) : null;
    const T = blockTree({ buildings: B, top: p.top, leaf: p.leaf });
    // (place-blocks 6, far forms; issue #13) the street blocks of each leaf cell, made once: buildings that are their own
    // boxes at the finest coarse level (tall or big) stay single (bi = their index), so a coarser level can leave them to
    // its own boxes; the coarse levels draw the blocks of their leaf cells whose seen size is at least min_m2
    const FAR = p.far && BX ? new Map() : null;
    if (FAR) { const LV1 = p.levels[p.leaf - 1], ownAt = (i, LV) => HT[B[i].id].h >= LV.tall_m || B[i].a >= LV.big_m2;
      for (const n of T.nodes.values()) { if (n.l !== p.leaf) continue; const merge = [], single = [];
        for (const i of n.items) (ownAt(i, LV1) ? single : merge).push(i);
        FAR.set(n.key, [...streetBlocks(merge.map(i => BX[i]), p.far), ...single.map(i => ({ ...BX[i], n: 1, bi: i }))]); }
      FAR.ownAt = ownAt; console.log(`  place-blocks far forms: ${[...FAR.values()].reduce((a, L) => a + L.length, 0)} street blocks in ${FAR.size} leaf cells`); }
    const farUnder = n => n.l === p.leaf ? (FAR.get(n.key) || []) : n.kids.flatMap(farUnder);
    rmSync(join(OUT, 'tiles'), { recursive: true, force: true }); mkdirSync(join(OUT, 'tiles'), { recursive: true });
    const outFiles = [], stats = []; let nT = 0; const total = T.nodes.size;
    async function tile(n, parentWorld) {
      const leaf = n.l === p.leaf; let r;
      if (!BX) {
        const LP = leaf ? { min_area_m2: p.min_area_m2, simplify_m: p.simplify_m, box_fill: p.box_fill, outline_min_m2: p.outline_min_m2, drop_m: p.drop_m } : { ...p.levels[n.l], min_area_m2: p.min_area_m2, drop_m: p.drop_m };
        r = blockTile({ cell: n, items: n.items.map(i => B[i]), HT, groundAt: G.at, geoidAt: geoAt, P: LP, leaf, named: leaf ? named : null, classes: p.classes, classIndex: p.class_index, colour: p.colour, credit: p.credit });
      } else {
        // compact: at the leaves the named buildings as outlines (own id), every other building one compact box; at the
        // coarse levels the tall or big buildings as boxes, the rest one compact square a merge_m square of the cell,
        // turned to the grain of its buildings, its side from the built share (full at full_share): the UK lite v2 rule
        const own = [], rest = [], LV = leaf ? null : p.levels[n.l];
        for (const i of n.items) { const b = B[i]; if (leaf ? named.has(b.id) || (p.leaf_outlines && wantsOutline(b, p)) : (HT[b.id].h >= LV.tall_m || b.a >= LV.big_m2)) own.push(b); else rest.push(BX[i]); }
        let compact = null, nmass = 0;
        if (leaf && rest.length) compact = F2 => ({ ...compactBoxes({ F: F2, b: n.b, boxes: rest, groundAt: G.at, geoidAt: geoAt, drop_m: p.drop_m, grid_n: p.grid_n, kind: 'buildings', colour: p.colour }), mass_buildings: 0 });
        else if (FAR) { const K = farKeep(farUnder(n).filter(x => !(x.bi != null && FAR.ownAt(x.bi, LV))), LV.min_m2 ?? p.far.min_m2?.[n.l] ?? 0); nmass = K.keep.reduce((a, x) => a + x.n, 0);
          if (K.keep.length) compact = F2 => ({ ...compactBoxes({ F: F2, b: n.b, boxes: K.keep, groundAt: G.at, geoidAt: geoAt, drop_m: p.drop_m, grid_n: p.grid_n, kind: 'blocks', colour: p.colour }), mass_buildings: nmass, far_left_out: K.left_out_buildings }); }
        else if (rest.length) { const sqs = squareBoxes(boxSquares(rest, n.b, LV.merge_m), n.b, LV.merge_m, p.full_share); nmass = rest.length;
          compact = F2 => ({ ...compactBoxes({ F: F2, b: n.b, boxes: sqs, groundAt: G.at, geoidAt: geoAt, drop_m: p.drop_m, grid_n: p.grid_n, kind: 'squares', colour: p.colour }), mass_buildings: nmass }); }
        const LP = leaf ? (p.leaf_outlines ? { min_area_m2: p.min_area_m2, simplify_m: p.simplify_m, box_fill: p.box_fill, outline_min_m2: p.outline_min_m2, drop_m: p.drop_m } : { min_area_m2: p.min_area_m2, simplify_m: p.simplify_m, box_fill: 0, outline_min_m2: Infinity, drop_m: p.drop_m }) : { ...LV, min_area_m2: p.min_area_m2, drop_m: p.drop_m };
        r = blockTile({ cell: n, items: own, HT, groundAt: G.at, geoidAt: geoAt, P: LP, leaf, named: leaf ? named : null, classes: p.classes, classIndex: p.class_index, colour: p.colour, credit: p.credit, compact,
          noteRef: 'features.json blocks.tile_extras', cellBuildings: n.items.length });
        const cs = r.stats.compact; r.stats.building_boxes = leaf ? (cs?.boxes || 0) : 0; r.stats.mass_boxes = leaf ? 0 : (cs?.boxes || 0); r.stats.merged = r.stats.mass_boxes; r.stats.merged_buildings = r.stats.compact_mass || 0;
        if (leaf && cs) { r.stats.by_class.osm = (r.stats.by_class.osm || 0) + cs.by_class[0]; if (cs.by_class[1]) { const xc = Object.keys(p.class_index)[0]; r.stats.by_class[xc] = (r.stats.by_class[xc] || 0) + cs.by_class[1]; } }
      }
      const f = join(OUT, 'tiles', n.key + '.glb'); writeFileSync(f, r.bytes); outFiles.push(f); stats.push(r.stats); if (++nT % 200 === 0) console.log(`  place-blocks: ${nT} / ${total} tiles`);
      const world = r.F.matrix(); let region = r.region; const kids = []; for (const k of n.kids) kids.push(await tile(k, world));
      for (const k of kids) region = [region[0], region[1], region[2], region[3], Math.min(region[4], k.boundingVolume.region[4]), Math.max(region[5], k.boundingVolume.region[5])];
      const t = { boundingVolume: { region: region.map(v => +v.toPrecision(12)) }, geometricError: leaf ? 0 : p.levels[n.l].err_m, refine: 'REPLACE', transform: roundM(parentWorld ? mul4(inv4rigid(parentWorld), world) : world).map((v, i) => i >= 12 ? v : +v.toPrecision(10)), content: { uri: `tiles/${n.key}.glb` } };   // rotation to 10 digits (under 1 mm at the Earth's radius)
      // (compact) the leaves' parents: refined only within leaf_within_m of the eye (distance minus the bounding radius), so
      // a big screen or an oblique whole-city view keeps the turned squares far away (places.js reads extras.refine_within_m)
      if (p.leaf_within_m && n.l === p.leaf - 1) t.extras = { refine_within_m: p.leaf_within_m };
      if (kids.length) t.children = kids; return t;
    }
    const children = []; for (const n of T.roots) children.push(await tile(n, null));
    let lo = Infinity, hi = -Infinity, ext = [Infinity, Infinity, -Infinity, -Infinity]; for (const c of children) { lo = Math.min(lo, c.boundingVolume.region[4]); hi = Math.max(hi, c.boundingVolume.region[5]); }
    for (const n of T.roots) ext = [Math.min(ext[0], n.b[0]), Math.min(ext[1], n.b[1]), Math.max(ext[2], n.b[2]), Math.max(ext[3], n.b[3])];
    const rootErr = p.levels[p.top].err_m * 2;
    const tileset = { asset: { version: '1.1', generator: 'cwplans build-place-tiles.mjs (place-blocks)', tilesetVersion: p.version_label, extras: { place: RID, name: REG.name, kind: 'blocks', credit: p.credit, tiers: BX ? `blocks: every building not named as one compact box (cwplans-boxes-1)${p.leaf_outlines ? `, irregular ones (${p.outline_min_m2} m2 or more, under ${p.box_fill} of their oriented box) as outlines simplified at ${p.simplify_m} m` : ''} and the named buildings as outlines at level ${p.leaf}; tall or big buildings as boxes and the rest as merged squares turned to their grain (compact) at levels ${p.top} to ${p.leaf - 1}; the leaves' parents refined only within ${p.leaf_within_m} m (extras.refine_within_m); no ground (the globe's terrain)` : `blocks: merged boxes by square from level ${p.top}, every building from level ${p.leaf}; no ground (the globe's terrain)` } },
      geometricError: rootErr * 2, root: { boundingVolume: { region: [ext[0] * D2R, ext[1] * D2R, ext[2] * D2R, ext[3] * D2R, lo, hi].map(v => +v.toPrecision(12)) }, geometricError: rootErr, refine: 'REPLACE', children } };
    const tsf = join(OUT, 'tileset.json'); writeFileSync(tsf, JSON.stringify(tileset)); outFiles.push(tsf);
    // features.json: the named buildings drawn with their own id (search, cards, featuresAt, describeView); no ground grid
    const leafKey = b => { const cs = 180 / 2 ** p.leaf; return `${p.leaf}-${Math.floor((b.c[0] + 180) / cs)}-${Math.floor((b.c[1] + 90) / cs)}`; };
    const Bf = rows.map(b => { const H = HT[b.id]; return [b.osm || b.id, b.name, null, b.kind, b.c[0], b.c[1], H.h, H.src, b.levels ?? null, leafKey(b), Math.round(G.at(b.c[0], b.c[1]) * 10) / 10, null, null, null, 'flat']; });
    const tiers = {}; for (const s2 of stats) { const o = tiers['level ' + s2.level] ||= { tiles: 0, bytes: 0, triangles: 0, boxes: 0, outlines: 0, named: 0, merged: 0, merged_buildings: 0, ...(BX ? { building_boxes: 0, mass_boxes: 0 } : {}), by_class: {} }; o.tiles++; for (const k of ['bytes', 'triangles', 'boxes', 'outlines', 'named', 'merged', 'merged_buildings', ...(BX ? ['building_boxes', 'mass_boxes'] : [])]) o[k] += s2[k] || 0; for (const [c, v] of Object.entries(s2.by_class || {})) o.by_class[c] = (o.by_class[c] || 0) + v; }
    const byClass = {}; for (const b of B) byClass[b.cls || 'osm'] = (byClass[b.cls || 'osm'] || 0) + 1;
    const fj = { format: 'place-features-1', kind: 'blocks', place: RID, name: REG.name, label: PL.label || REG.name, search: PL.search || [], timeZone: REG.timeZone, locale: REG.locale, origin: REG.origin, area: bnd.bbox, extent: ext.map(r7), level: p.leaf,
      geoid_m: Math.round(geoAt(REG.origin.lon, REG.origin.lat) * 100) / 100, credit: p.credit,
      note: 'a place of kind blocks: the buildings are drawn as blocks (tiles); this file lists the named buildings drawn with their own id (_FEATURE_ID_0 = row); ground_m = the globe\'s ground (world-base heights, metres above the geoid)',
      buildings_fields: ['osm_id', 'name', 'address', 'kind', 'lon', 'lat', 'height_m', 'height_source', 'levels', 'tile', 'ground_m', 'wikidata', 'name_alt', 'parent', 'roof'], buildings: Bf,
      streets_fields: ['name', 'kind', 'lon', 'lat', 'name_alt'], streets: [], areas_fields: ['name', 'kind', 'lon', 'lat', 'name_alt'], areas: [], points_fields: ['osm_id', 'name', 'kind', 'lon', 'lat', 'address', 'name_alt'], points: [], tiles: [],
      blocks: { buildings: B.length, named: rows.length, by_class: byClass, tiers, ...(BX ? { leaf_boxes: 'compact', classes: p.classes, compact: COMPACT_ABOUT, leaf_within_m: p.leaf_within_m, ...(p.far ? { far: { ...p.far, rule: FAR_RULE } } : {}),
        tile_extras: 'glb extras.blocks: classes (labels by class index: 0 and 2 OpenStreetMap, 1 merged squares, 3 Microsoft), height_sources (labels), boxes (the own boxes of tall or big buildings at the coarse levels, of irregular buildings whose simplified outline failed at the leaves; the reader appends the compact boxes: c class index, h height in decimetres, s height-source index), outlines (the irregular buildings at the leaves, simplified outlines: c, h, s and tri_end, the end of their triangles), mass_buildings (the buildings the merged squares stand for), buildings (all buildings of the cell: at a leaf the compact boxes plus the named outlines), compact (the compact boxes: layout cwplans-boxes-1, kind buildings at the leaves, squares at the coarse levels); the named buildings as outlines with _FEATURE_ID_0 = row of this file' } : {}) } };
    const ff = join(OUT, 'features.json'); writeFileSync(ff, JSON.stringify(fj)); outFiles.push(ff);
    console.log('  tiers:', JSON.stringify(tiers)); console.log(`  world-base height tiles read: ${G.used.size}`);
    return outFiles; });
  // the committed log, the index entry, the READMEs
  const fj = JSON.parse(readFileSync(join(OUT, 'features.json'), 'utf8')), SEL = rz(fFp).counts;
  blog.about = `Build log of the place ${RID} (${REG.name}, kind blocks) by cwplans/tools/build-place-tiles.mjs: what was fetched (URL, date, SHA-256) and each dataflow activity with its input and output hashes. Raw files stay in cwplans/data/raw/places/${RID}/ (not committed).`;
  blog.fetches = flog; blog.selection = SEL; blog.height_sources = HZ.faults; blog.footprint_matches = HZ.matches; blog.tiers = fj.blocks.tiers; blog.blocks = { buildings: fj.blocks.buildings, named: fj.blocks.named, by_class: fj.blocks.by_class, ...(fj.blocks.leaf_boxes ? { leaf_boxes: fj.blocks.leaf_boxes } : {}) };
  // the geometry classes: label, register source, switch, selected, dropped (overlap OSM), drawn (>= min area), heights
  blog.block_geometry = Object.fromEntries(['osm', ...geoAds.map(a => a.geometry.cls)].map(c => { const a = geoAds.find(x => x.geometry.cls === c);
    return [c, { label: a ? a.geometry.label : 'OpenStreetMap (via Overture)', source: a ? a.geometry.source : 'osm', switch: a ? a.id : null,
      selected: a ? SEL[`${c} buildings selected (no OSM building there)`] || 0 : SEL['OSM buildings selected'] || 0, dropped_overlap_osm: a ? SEL[`${c} buildings dropped (overlap an OSM building)`] || 0 : null,
      drawn: fj.blocks.by_class?.[c] || 0, heights: HZ.by_class?.[c] || {} }]; }));
  for (const k of ['roofs', 'validation', 'city_height_sources', 'city_footprint_matches', 'city_validation', 'outer_counts', 'city_geometry']) delete blog[k];
  if (!geoAds.length) delete blog.block_geometry;
  blog.fault = 'F55 (curation skill fault register): buildings with no height in OSM; counted, not patched per record';
  writeFileSync(BLOG, JSON.stringify(blog, null, 1));
  const IX = join(OUTROOT, 'index.json'), ix = existsSync(IX) ? JSON.parse(readFileSync(IX, 'utf8')) : { format: 'places-index-1', about: 'Places on the globe built as 3D Tiles 1.1 by cwplans/tools/build-place-tiles.mjs; read by docklands/globe/places.js', places: [] };
  // tileBase (region config place.tileBase): where the tile set is served when it is not beside index.json (a second
  // repository's Pages, e.g. https://danbri.github.io/docklandia/data/gb/london/); places.js resolves it against index.json
  const TB = PL.tileBase ? PL.tileBase.replace(/\/?$/, '/') : `${RID}/`;
  const entry = { id: RID, name: REG.name, label: fj.label, kind: 'blocks', area: fj.area, centre: [REG.origin.lon, REG.origin.lat], timeZone: REG.timeZone, locale: REG.locale, tileset: `${TB}tileset.json`, features: `${RID}/features.json`, readme: `${RID}/README.md`, provenance: `${RID}/provenance/log.json`,
    credit: fj.credit, buildings: fj.blocks.buildings, named: fj.blocks.named, ...(geoAds.length ? { buildings_by_class: fj.blocks.by_class } : {}), built: a3.at, extent: fj.extent, exclude: PL.exclude || [] };
  ix.places = ix.places.filter(q => q.id !== RID).concat(entry).sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(IX, JSON.stringify(ix, null, 1));
  let tot = 0; for (const f of readdirSync(join(OUT, 'tiles'))) tot += statSync(join(OUT, 'tiles', f)).size;
  writeReadmes();
  console.log(`done: ${readdirSync(join(OUT, 'tiles')).length} tiles, ${entry.buildings} buildings (${entry.named} named), tiles ${(tot / 1e6).toFixed(2)} MB, tileset.json ${(statSync(join(OUT, 'tileset.json')).size / 1e6).toFixed(2)} MB, features.json ${(statSync(join(OUT, 'features.json')).size / 1e6).toFixed(2)} MB`);
}

// ---------- a place of kind "lite" (the UK outside Greater London; region config uk-lite.js, place.kind 'lite',
// place.lite; module cwplans/tools/place-lite.mjs): landmarks plus merged mass, written to another repository (--out).
// Fetch: the OSM tags of the landmark rule (one QLever query), the GHSL tiles over the parts, then part by part the
// Overture buildings of the part's box in slim mode (centroid and area of every record, the outline of the landmark
// candidates only). Build: place-lite-select per part (raw NDJSON -> atoms and landmarks; with --clean-raw the part's
// answer is deleted once its activity is in the log, so the disk holds one part at a time), then place-lite-tiles
// (all parts -> tiles, tileset.json with external tile sets, features.json). Skill docklands-3d-page, "Three.js port: the
// UK lite set (2026-10-22)".
const LOPS = {
  select: { id: 'place-lite-select', version: 2, skill: 'docklands-3d-page' },   // 2: also every mass building as a 20-byte record (centroid, area, height, rotated rectangle, class, height source); 1: part owner by centroid (London excluded), heights in the place-heights order, landmarks by the rule, the rest as 200 m atoms
  heights: { id: 'place-lite-landmark-heights', version: 1, skill: 'docklands-3d-page' },   // 1: OSM building parts (via Overture) above the body as prisms, a Wikidata P2048 spire or tower (place-lite-heights.mjs)
  tiles: { id: 'place-lite-tiles', version: 5, skill: 'docklands-3d-page' },     // 5: far forms (place.lite.far, issue #13): the coarse levels draw the street blocks of their leaf cells (streetBlocks) whose seen size is at least min_m2 of the level (farKeep), landmarks as their own oriented boxes, no squares; 4: landmark towers and spires (place-lite-landmark-heights), feature rows with the highest point; 3: leaves draw one box a building (compact layout cwplans-boxes-1), coarse levels merged squares in the same layout; 2: features in shards by part and names.json; 1: quadtree levels 7..11, leaves 200/400 m by built share, external tile sets from level 9
};
// the far forms (issue #13) as the sets' features.json and READMEs state them
const FAR_RULE = 'coarse levels draw real buildings at their true positions, no squares: the buildings of each leaf cell whose oriented boxes come within gap_m of each other and whose heights differ by at most max(h_abs_m, h_rel x the taller) are one street block (one oriented box at their grain, its footprint the sum of theirs, its height their area-weighted mean; cut at the area median while they fill less than fill_min of it); a level draws the blocks whose seen size sqrt(area) x max(sqrt(area), height) is at least min_m2 of the level (about one device pixel squared at the far end of its range on a phone); the rest are counted (far_left_out), not drawn at that level';
const liteParts = () => PL.parts.map(pt => ({ ...pt, ...skelFeature(pt) }));
// a polygon feature of the UK skeleton by layer, level and code
function skelFeature(pt) {
  const dir = join(CW, PL.skeleton), M = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')), L = M.layers.find(l => l.id === pt.layer), lv = L.levels.find(l => l.level === pt.level);
  for (const fd of lv.files) { const file = join(dir, fd.path), fc = unpack(JSON.parse(readFileSync(file, 'utf8'))), ft = fc.features.find(x => x.properties.code === pt.code); if (!ft) continue;
    const polys = ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.coordinates; let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const p of polys) for (const [x, y] of p[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
    return { file, polys, name: ft.properties.name, bbox: [w, s, e, n], qbox: [Math.floor(w * 100) / 100, Math.floor(s * 100) / 100, Math.ceil(e * 100) / 100, Math.ceil(n * 100) / 100] }; }
  throw new Error(`skeleton feature ${pt.code} not found (${pt.layer}, level ${pt.level})`);
}
const liteRaw = pt => join(RAWD, `overture-${pt.code}-${ovL().outer.release}.ndjson`);
const ovL = () => REG.adapters.find(a => a.id === LT.outer && a.outer);
const tagsRaw = () => join(RAWD, 'osm-landmark-tags.tsv');
function tagsQuery() {
  const R = LT.landmark, vals = a => a.map(v => JSON.stringify(v)).join(', ');
  return `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX osmrel: <https://www.openstreetmap.org/relation/>
PREFIX ogc: <http://www.opengis.net/rdf#>
SELECT ?w ?b ?wd ?wp ?hist ?mm ?leis ?name WHERE {
  osmrel:${LT.tags.area_relation} ogc:sfContains ?w .
  ?w osmkey:building ?b .
  OPTIONAL { ?w osmkey:wikidata ?wd } OPTIONAL { ?w osmkey:wikipedia ?wp } OPTIONAL { ?w osmkey:historic ?hist }
  OPTIONAL { ?w osmkey:man_made ?mm } OPTIONAL { ?w osmkey:leisure ?leis } OPTIONAL { ?w osmkey:name ?name }
  FILTER(BOUND(?wd) || BOUND(?wp) || ?b IN (${vals(R.building)}) || ?hist IN (${vals(R.historic)}) || ?mm IN (${vals(R.man_made)}) || ?leis IN (${vals(R.leisure)}))
}`;
}
async function fetchLite() {
  // 1. the OSM tags of the landmark rule (QLever OSM planet; one POST, TSV)
  const ft = tagsRaw();
  if (!existsSync(ft) || flag('--refetch')) {
    const q = tagsQuery(), body = new URLSearchParams({ query: q });
    const buf = await get(LT.tags.endpoint, { method: 'POST', body, headers: { Accept: 'text/tab-separated-values', 'Content-Type': 'application/x-www-form-urlencoded' } });
    writeFileSync(ft, buf);
    const st = JSON.parse((await get(LT.tags.endpoint + '?cmd=stats')).toString('utf8'));
    record('osm-landmark-tags', ft, LT.tags.endpoint, { source: 'osm', request: 'SPARQL POST (text/tab-separated-values): ' + q.replace(/\s+/g, ' '), index: st['name-index'], rows: buf.toString('utf8').split('\n').filter(Boolean).length - 1,
      licence: 'ODbL 1.0, © OpenStreetMap contributors', as_fetched: { bytes: buf.length, sha256: sha(buf) } });
    console.log(`osm landmark tags: ${flog['osm-landmark-tags'].rows} rows (${st['name-index']})`);
  }
  // 2. GHSL tiles over the parts (zips stay raw)
  await fetchGhslTiles();
  // 3. landmark heights (owner, 2026-10-22: "Yes do that"): the OSM building parts with a height (Overture building_part
  // theme, the UK box) and the Wikidata heights (P2048) of the landmark tags' wikidata items (QLever Wikidata, CC0)
  await fetchLiteHeights();
  // 4. part by part (--part <code> for one), each followed by its select operation when building
  if (!flag('--no-parts')) for (const pt of liteParts()) { if (argOf('part') && argOf('part') !== pt.code) continue; await fetchLitePart(pt); }
}
const partsRaw = () => join(RAWD, `overture-building-parts-${ovL().outer.release}.ndjson`), wdRaw = () => join(RAWD, 'wikidata-heights.tsv');
async function fetchLiteHeights() {
  const H = LT.heights; if (!H) return;
  const ov = ovL(), f = partsRaw();
  if (!existsSync(f) || flag('--refetch')) execFileSync(process.env[ov.outer.python] || 'python3', ['-I', join(CW, '..', ov.outer.script), ov.outer.release, 'buildings', 'building_part', ...REG.bbox.map(v => v.toFixed(2)), f, H.part_columns, H.part_where], { stdio: 'inherit' });
  if (!flog['overture-building-parts'] || flag('--refetch')) { const M = JSON.parse(readFileSync(f + '.meta.json', 'utf8')), st = statSync(f);
    flog['overture-building-parts'] = { url: `s3://overturemaps-us-west-2/release/${M.release}/theme=${M.theme}/type=${M.type}/ (bbox ${M.bbox.join(',')}; files ${M.files_read.join(' ')})`, fetched: new Date(st.mtimeMs).toISOString(), bytes: st.size, sha256: await shaFile(f), file: rel(f),
      source: 'overture-buildings', request: `DuckDB read_parquet over HTTPS of the ${M.files_listed} files of the release, building parts (OSM building:part via Overture) in the UK box with: ${M.where}; columns ${M.columns.join(', ')}; geometry; rows ordered by id (fetch-overture-theme.py, .ndjson)`,
      records: M.rows_count, licence: ov.licence, as_fetched: { note: 'the query answer as written by cwplans/tools/fetch-overture-theme.py (raw folder, NDJSON); sha256 above' } }; saveFlog(); console.log(`overture building parts: ${M.rows_count} rows`); }
  const fw = wdRaw();
  if (!existsSync(fw) || flag('--refetch')) {
    const ids = [...new Set([...tagIndex(readFileSync(tagsRaw(), 'utf8')).values()].map(t => t.wd).filter(q => /^Q\d+$/.test(q || '')))].sort(), out = [], got = [];
    for (let i = 0; i < ids.length; i += H.wikidata_chunk) { const q = `PREFIX wd: <http://www.wikidata.org/entity/>\nPREFIX p: <http://www.wikidata.org/prop/>\nPREFIX psv: <http://www.wikidata.org/prop/statement/value/>\nPREFIX pq: <http://www.wikidata.org/prop/qualifier/>\nPREFIX wikibase: <http://wikiba.se/ontology#>\nSELECT ?item ?amount ?unit ?rank ?end WHERE { VALUES ?item { ${ids.slice(i, i + H.wikidata_chunk).map(x => 'wd:' + x).join(' ')} } ?item p:P2048 ?st . ?st psv:P2048 ?v . ?v wikibase:quantityAmount ?amount ; wikibase:quantityUnit ?unit . ?st wikibase:rank ?rank . OPTIONAL { ?st pq:P582 ?end } }`;
      const buf = await get(H.wikidata_endpoint, { method: 'POST', body: new URLSearchParams({ query: q }), headers: { Accept: 'text/tab-separated-values', 'Content-Type': 'application/x-www-form-urlencoded' } });
      const lines = buf.toString('utf8').split('\n').filter(Boolean); if (!out.length) out.push(lines[0]); out.push(...lines.slice(1)); got.push({ ids: Math.min(H.wikidata_chunk, ids.length - i), bytes: buf.length, sha256: sha(buf) }); await pause(1000); }
    writeFileSync(fw, out.join('\n') + '\n');
    record('wikidata-heights', fw, H.wikidata_endpoint, { source: 'wikidata', request: `SPARQL POST (text/tab-separated-values), ${got.length} requests of up to ${H.wikidata_chunk} items: the P2048 (height) statements (value, unit, rank, end time) of the ${ids.length} wikidata items of the landmark tags`, rows: out.length - 1, licence: 'CC0 1.0 (Wikidata)', as_fetched: got });
    console.log(`wikidata heights: ${out.length - 1} rows for ${ids.length} items`); }
}
async function fetchLitePart(pt) {
  const ov = ovL(), Q = { ...ov.outer.queries[LT.query], columns: LT.columns, where: LT.where }, f = liteRaw(pt), key = 'overture-buildings-' + pt.code;
  if (flog[key] && !flag('--refetch') && (existsSync(f) || liteSelectDone(pt))) return;
  // the OSM ids of the landmark tags (one a line): their outlines are fetched whatever the geometry condition says
  const fi = join(RAWD, 'osm-landmark-ids.txt'); writeFileSync(fi, [...tagIndex(readFileSync(tagsRaw(), 'utf8')).keys()].sort().join('\n') + '\n');
  if (!existsSync(f) || flag('--refetch')) execFileSync(process.env[ov.outer.python] || 'python3', ['-I', join(CW, '..', ov.outer.script), ov.outer.release, Q.theme, Q.type, ...pt.qbox.map(v => v.toFixed(2)), f, Q.columns, Q.where, LT.geometry_when + ' OR osm_id IN (SELECT id FROM ids)', fi], { stdio: 'inherit' });
  const M = JSON.parse(readFileSync(f + '.meta.json', 'utf8')), st = statSync(f);
  flog[key] = { url: `s3://overturemaps-us-west-2/release/${M.release}/theme=${M.theme}/type=${M.type}/ (bbox ${M.bbox.join(',')}; files ${M.files_read.join(' ')})`, fetched: new Date(st.mtimeMs).toISOString(), bytes: st.size, sha256: await shaFile(f), file: rel(f),
    source: 'overture-buildings', part: pt.code, request: `DuckDB read_parquet over HTTPS of the ${M.files_listed} files of the release, filter on bbox and: ${M.where}; columns ${M.columns.join(', ')}; slim mode (centroid, area in m2, cut sources, the minimum rotated rectangle in metres as o = [angle of the long side from east, long m, short m]; the outline only when: ${M.slim_geometry_when}; ids = the OSM ids of the landmark tags, SHA-256 ${sha(readFileSync(fi))}); rows ordered by id (fetch-overture-theme.py, .ndjson)`,
    records: M.rows_count, licence: ov.licence, as_fetched: { note: 'the query answer as written by cwplans/tools/fetch-overture-theme.py (raw folder, NDJSON); sha256 above' } };
  saveFlog(); console.log(`overture ${pt.code} ${pt.name}: ${M.rows_count} rows, ${(st.size / 1e6).toFixed(0)} MB`);
}
const GH_ZIP = (r, c) => join(RAWD, ghslAd().buildingHeights.url.replace('{r}', r).replace('{c}', c).split('/').pop());
const ghslAd = () => REG.adapters.find(a => a.buildingHeights?.kind === 'ghsl-raster');
function ghslTilesOf(b) { const B = ghslAd().buildingHeights, out = [];
  for (let r = Math.floor((B.north - b[3]) / B.tile_deg) + 1; r <= Math.floor((B.north - b[1]) / B.tile_deg) + 1; r++) for (let c = Math.floor((b[0] - B.west) / B.tile_deg) + 1; c <= Math.floor((b[2] - B.west) / B.tile_deg) + 1; c++) out.push([r, c]);
  return out; }
async function fetchGhslTiles() {
  const B = ghslAd().buildingHeights, want = new Map(); for (const pt of liteParts()) for (const [r, c] of ghslTilesOf(pt.qbox)) want.set(`R${r}_C${c}`, [r, c]);
  const got = [];
  for (const [tile, [r, c]] of [...want.entries()].sort()) { const url = B.url.replace('{r}', r).replace('{c}', c), zip = GH_ZIP(r, c);
    if (!existsSync(zip) || flag('--refetch')) { writeFileSync(zip, await get(url)); await pause(1000); }
    const zb = readFileSync(zip); got.push({ url, tile, bytes: zb.length, sha256: sha(zb) }); }
  if (!flog['heights-world-ghsl'] || flag('--refetch')) { const lf = join(RAWD, 'ghsl-tiles.json'); writeFileSync(lf, JSON.stringify(got, null, 1));
    record('heights-world-ghsl', lf, got.map(g => g.url), { source: B.source, as_fetched: got, licence: ghslAd().licence, note: 'the 10 x 10 degree tile zips stay in the raw folder (not committed); each part reads its window of them; the file above lists the zips and their SHA-256' }); }
  console.log(`ghsl: ${got.map(g => g.tile).join(', ')}`);
}
// the globe's world terrain texture as the globe reads it (globe/terrain.js makeSampler: R = height code, G = land share;
// bilinear; the sea surface at 0, land below sea level kept)
async function worldTexSampler(png) {
  const img = await loadImage(readFileSync(png)), w = img.width, h = img.height, cv = createCanvas(w, h), c = cv.getContext('2d'); c.drawImage(img, 0, 0); const d = c.getImageData(0, 0, w, h).data;
  const px = (x, y, k) => d[4 * (y * w + x) + k] / 255, dec = v => { v *= 255; if (v >= 127.5) { const t = Math.max(0, (v - 128) / 127); return 8848 * t * t; } const t = Math.max(0, (127 - v) / 127); return -11000 * t * t; };
  const bil = (lon, lat, k) => { const fx = ((lon + 180) / 360 * w - 0.5 + w) % w, fy = Math.max(0, Math.min(h - 1.001, (90 - lat) / 180 * h - 0.5)), x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0, x1 = (x0 + 1) % w;
    return (px(x0, y0, k) * (1 - u) + px(x1, y0, k) * u) * (1 - v) + (px(x0, y0 + 1, k) * (1 - u) + px(x1, y0 + 1, k) * u) * v; };
  return (lon, lat) => { const r = dec(bil(lon, lat, 0)), L = bil(lon, lat, 1); return L * r + (1 - L) * Math.max(r, 0); };
}
// GHSL over a box: the windows of the tiles that meet it, as Float32 grids (row 0 north); at(lon, lat) -> metres or null
async function ghslOver(b) {
  const B = ghslAd().buildingHeights, grids = [];
  for (const [r, c] of ghslTilesOf(b)) { const zip = GH_ZIP(r, c); if (!existsSync(zip)) throw new Error('missing ' + rel(zip) + ': run fetch');
    const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean), member = names.find(n => new RegExp(B.member).test(n));
    const tif = execFileSync('unzip', ['-p', zip, member], { maxBuffer: 1 << 30 }), img = await (await fromArrayBuffer(tif.buffer.slice(tif.byteOffset, tif.byteOffset + tif.byteLength))).getImage();
    const [w0, s0, e0, n0] = img.getBoundingBox(), W = img.getWidth(), H = img.getHeight(), px = (e0 - w0) / W, py = (n0 - s0) / H, cl = (v, k) => Math.max(0, Math.min(k, v));
    const win = [cl(Math.floor((b[0] - w0) / px), W), cl(Math.floor((n0 - b[3]) / py), H), cl(Math.ceil((b[2] - w0) / px), W), cl(Math.ceil((n0 - b[1]) / py), H)];
    if (win[2] <= win[0] || win[3] <= win[1]) continue;
    const data = (await img.readRasters({ window: win }))[0];
    grids.push({ w: w0 + win[0] * px, n: n0 - win[1] * py, px, py, nx: win[2] - win[0], ny: win[3] - win[1], data: Float32Array.from(data) }); }
  return (lon, lat) => { for (const g of grids) { const i = Math.floor((lon - g.w) / g.px), j = Math.floor((g.n - lat) / g.py); if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) continue; const v = g.data[j * g.nx + i]; return v > 0 ? Math.round(v * 10) / 10 : null; } return null; };
}
// the owner of a centroid: the excluded places' polygons first (London), then the first part whose polygon holds it, then
// the nearest part within coast_m (not inside a country of not_in_countries)
function liteOwner(parts) {
  const P = parts.map(pt => polyIndex(pt.polys)), X = (PL.exclude_polygons || []).map(e => ({ ...e, ...skelFeature(e) })).map(e => ({ e, ix: polyIndex(e.polys) }));
  const NC = PL.not_in_countries ? (() => { const wj = JSON.parse(readFileSync(join(CW, PL.not_in_countries.file), 'utf8')), q = wj.q || 1000, dec = a => { const o = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; o.push([x / q, y / q]); } return o; };   // (Natural Earth, the world skeleton's wsk1 format)
    return wj.features.filter(f => PL.not_in_countries.iso2.includes(f.p.iso2)).map(f => polyIndex(f.g.map(P => P.map(dec)))); })() : [];
  const inB = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
  return (x, y) => {
    for (const { e, ix } of X) if (inB(ix.bbox, x, y) && ix.contains(x, y)) return { part: -1, how: 'excluded', place: e.name };
    for (let k = 0; k < P.length; k++) if (inB(P[k].bbox, x, y) && P[k].contains(x, y)) return { part: k, how: 'in' };
    let best = -1, bd = Infinity; for (let k = 0; k < P.length; k++) { const d = P[k].dist(x, y, PL.coast_m); if (d != null && d < bd) { bd = d; best = k; } }
    if (best >= 0 && NC.some(ix => ix.contains(x, y))) return { part: -1, how: 'foreign' };
    return best >= 0 ? { part: best, how: 'coast' } : { part: -1, how: 'none' };
  };
}
const liteOut = pt => ({ atoms: join(WORK, `lite-${pt.code}-atoms.ndjson.gz`), recs: join(WORK, `lite-${pt.code}-buildings.bin.gz`), lm: join(WORK, `lite-${pt.code}-landmarks.json.gz`), counts: join(WORK, `lite-${pt.code}-counts.json`) });
function liteSelectDone(pt) { const o = liteOut(pt); return [o.atoms, o.recs, o.lm, o.counts].every(existsSync) && blog.activities.some(a => a.operation === LOPS.select.id && a.params.part === pt.code && a.outputs.every(x => existsSync(absOf(x.path)) && sha(readFileSync(absOf(x.path))) === x.sha256)); }
const boundaryInputs = parts => { const files = [...new Set([...parts.map(p => p.file), ...(PL.exclude_polygons || []).map(e => skelFeature(e).file), ...(PL.not_in_countries ? [join(CW, PL.not_in_countries.file)] : [])])].sort(); return files.map(f => fileIn(f, 'boundary')); };
async function liteSelect(pt, k, parts, owner) {
  const key = 'overture-buildings-' + pt.code, rec = flog[key]; if (!rec) throw new Error(`no fetch record for ${pt.code}: run fetch`);
  const o = liteOut(pt), gz = flog['heights-world-ghsl'], tags = flog['osm-landmark-tags'];
  const inputs = [{ label: 'overture-buildings ' + pt.code, path: rec.file, sha256: rec.sha256 }, { label: 'osm-landmark-tags', path: tags.file, sha256: tags.sha256 }, { label: 'ghsl tiles (list of zips and their SHA-256)', path: gz.file, sha256: gz.sha256 }, ...boundaryInputs(parts)];
  const params = { part: pt.code, part_index: k, name: pt.name, parts: parts.map(p => p.code), exclude: (PL.exclude_polygons || []).map(e => e.code), coast_m: PL.coast_m, not_in_countries: PL.not_in_countries || null,
    geometry_classes: LT.geometry_classes, licences: overture.buildingHeights.licences, rule: LT.landmark, level: LT.leaf_level, atom_m: LT.leaf.town_m, storey_m: 3, small_m: 3, default_m: PL.default_height_m ?? 7, raster_min_m: 3,
    height_rule: 'OSM height > OSM building:levels x 3 m > height of a non-OSM source with an open licence (Microsoft ML Buildings: "ms") > num_floors of such a source x 3 m > small kinds 3 m > GHSL cell under the centroid (min 3 m) > default' };
  return run(LOPS.select, inputs, params, async p => {
    const f = liteRaw(pt); if (!existsSync(f)) throw new Error(`missing ${rel(f)}: run fetch --part ${pt.code}`);
    const ghslAt = await ghslOver(pt.qbox), T = tagIndex(readFileSync(tagsRaw(), 'utf8'));
    const S = liteSelector({ part: p.part_index, owner, geometryClasses: p.geometry_classes, licences: p.licences, tags: T, rule: p.rule, ghslAt, level: p.level, atom_m: p.atom_m, storey_m: p.storey_m, small_m: p.small_m, default_m: p.default_m, raster_min_m: p.raster_min_m, coast_m: p.coast_m });
    let n = 0; for await (const line of ndjsonLines(f)) { S.add(JSON.parse(line)); if (++n % 1000000 === 0) console.log(`  place-lite-select ${pt.code}: ${n} rows`); }
    const r = S.done(); await writeNdjsonGz(o.atoms, r.atoms); jz(o.lm, r.landmarks); writeFileSync(o.recs, gzipSync(r.recs));
    writeFileSync(o.counts, JSON.stringify({ part: pt.code, name: pt.name, counts: r.counts, height_sources: r.height_sources, geometry: r.geometry, atoms: r.atoms.length, landmarks: r.landmarks.length }, null, 1));
    console.log(`  ${pt.code}: ${r.atoms.length} atoms, ${r.recs.length / REC} building records, ${r.landmarks.length} landmarks; ${JSON.stringify(r.counts)}`); return [o.atoms, o.recs, o.lm, o.counts]; });
}
// operation place-lite-landmark-heights: the landmarks of every part + the building parts + the Wikidata heights -> the
// towers and highest point of each landmark (place-lite-heights.mjs; only landmarks with a tower or spire are written)
const liteHeightsOut = () => ({ out: join(WORK, 'lite-landmark-heights.json.gz'), counts: join(WORK, 'lite-landmark-heights-counts.json') });
async function liteHeights(parts) {
  const o = liteHeightsOut(), pr = flog['overture-building-parts'], wr = flog['wikidata-heights'];
  if (!pr || !wr) throw new Error('no fetch record for the building parts or the Wikidata heights: run fetch');
  const inputs = [...parts.map(pt => fileIn(liteOut(pt).lm, 'landmarks ' + pt.code)), { label: 'overture building parts', path: pr.file, sha256: pr.sha256 }, { label: 'wikidata heights', path: wr.file, sha256: wr.sha256 }];
  return run(LOPS.heights, inputs, { rule: LT.heights.rule }, async p => {
    const P = partIndex(ndjsonRows(partsRaw())), WD = wdHeights(readFileSync(wdRaw(), 'utf8')), res = {}, counts = { landmarks: 0, 'with building parts (any height)': 0, 'with parts above the body (drawn)': 0, 'parts drawn': 0, 'with a Wikidata height': 0, 'Wikidata spire on a part': 0, 'Wikidata tower at the centroid': 0, 'Wikidata height not used (not above the top, or over the limit)': 0 }, top = {};
    for (const pt of parts) for (const l of rz(liteOut(pt).lm)) { counts.landmarks++; const ps = P.get(l.id), w = l.wikidata ? WD.get(l.wikidata) : null; if (ps) counts['with building parts (any height)']++; if (w != null) counts['with a Wikidata height']++;
      const r = landmarkHeights(l, ps, WD, p.rule), np = r.towers.filter(t => t.kind === 'part').length; if (np) { counts['with parts above the body (drawn)']++; counts['parts drawn'] += np; }
      const wt = r.towers.find(t => t.src === 'wikidata'); if (wt) counts[wt.kind === 'spire' ? 'Wikidata spire on a part' : 'Wikidata tower at the centroid']++; else if (w != null) counts['Wikidata height not used (not above the top, or over the limit)']++;
      top[r.top_src] = (top[r.top_src] || 0) + 1;
      if (r.towers.length) res[l.id] = { towers: r.towers.map(t => ({ ...t, ...(t.rings ? { rings: t.rings.map(ring => ring.map(([x, y]) => [Math.round(x * 1e7) / 1e7, Math.round(y * 1e7) / 1e7])) } : {}) })), top_h: r.top_h, top_src: r.top_src }; }
    jz(o.out, res); writeFileSync(o.counts, JSON.stringify({ counts, highest_point_source: top }, null, 1)); console.log('  landmark heights:', JSON.stringify(counts), JSON.stringify(top));
    return [o.out, o.counts]; });
}
function ndjsonRows(f) { return readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); }
async function buildLite() {
  let parts = liteParts(); const allParts = parts, owner = liteOwner(parts), fGeoid = join(CW, 'docklands', 'data', 'world', 'geoid-egm96-1deg.png');
  // 1. place-lite-select, part by part (fetching a part first when its answer is missing and --fetch-parts is given)
  for (let k = 0; k < parts.length; k++) { const pt = parts[k]; if (argOf('part') && argOf('part') !== pt.code) continue; if (argOf('only') && !argOf('only').split(',').includes(pt.code)) continue;
    if (flag('--fetch-parts') && (flag('--refetch') || !flog['overture-buildings-' + pt.code] || (!liteSelectDone(pt) && !existsSync(liteRaw(pt))))) { if (!flog['overture-buildings-' + pt.code]) rmSync(liteRaw(pt), { force: true }); await fetchLitePart(pt); }
    await liteSelect(pt, k, parts, owner);
    if (flag('--clean-raw') && liteSelectDone(pt) && existsSync(liteRaw(pt))) { rmSync(liteRaw(pt)); rmSync(liteRaw(pt) + '.meta.json', { force: true }); console.log(`  removed the raw answer of ${pt.code} (its SHA-256 stays in the log)`); }
    writeFileSync(BLOG, JSON.stringify(blog, null, 1)); }
  if (argOf('part')) return;
  // 1b. place-lite-landmark-heights (all parts)
  if (!argOf('only')) await liteHeights(parts);
  // 2. place-lite-tiles: all parts -> the tree, tiles, tileset.json and the external tile sets, features.json
  const gdir = join(CW, LT.ground), GM = JSON.parse(readFileSync(join(gdir, 'base.json'), 'utf8')), BOX = REG.bbox;
  const gfiles = []; for (const [Ls, a] of Object.entries(GM.dem.tiles)) { const L2 = +Ls, cs = 180 / 2 ** L2; for (let i = 0; i < a.length; i += 2) { const x = a[i], y = a[i + 1], b = [-180 + x * cs, 90 - (y + 1) * cs, -180 + (x + 1) * cs, 90 - y * cs]; if (meet(b, BOX)) gfiles.push(join(gdir, GM.dem.url.replace('{z}', L2).replace('{x}', x).replace('{y}', y))); } }
  gfiles.sort(); const gIn = { label: 'world-base heights', path: rel(gdir) + `dem (${gfiles.length} tiles over the UK box; sha256 of the list of path and sha256 of each)`, sha256: sha(gfiles.map(f => rel(f) + ' ' + sha(readFileSync(f))).join('\n')) };
  if (argOf('only')) parts = parts.filter(pt => argOf('only').split(',').includes(pt.code));   // (a trial build of some parts)
  const ins = [...parts.flatMap(pt => { const o = liteOut(pt); return [fileIn(o.recs, 'building records ' + pt.code), fileIn(o.lm, 'landmarks ' + pt.code)]; }), ...(existsSync(liteHeightsOut().out) ? [fileIn(liteHeightsOut().out, 'landmark heights')] : [])];
  const credit = ['© OpenStreetMap contributors (ODbL 1.0)', 'Landmark tags: OpenStreetMap via the QLever OSM endpoint (planet 2026-09-21)', 'Buildings: OpenStreetMap data and Microsoft ML Buildings footprints via Overture Maps © Overture Maps Foundation, © Microsoft (ODbL 1.0)', ...hAds.map(a => a.buildingHeights.credit), 'Ground: ' + GM.dem.credit + ' (the globe\'s world-base heights)'].join('; ');
  // (a trial build: --trial <json file> replaces top-level keys of place.lite, e.g. levels or far, for the measured options
  // of issue #13; the parameters, so the activity id, record it)
  if (argOf('trial')) Object.assign(LT, JSON.parse(readFileSync(argOf('trial'), 'utf8')));
  const TP = { top: LT.top_level, leaf: LT.leaf_level, levels: LT.levels, leafRule: LT.leaf, full_share: LT.full_share, drop_m: LT.drop_m, external_from: LT.external_from, colour: LT.colour, version_label: `${RID}-3`, grid_n: LT.grid_n || 17,
    ...(LT.far ? { far: LT.far } : {}),
    classes: ['landmark (OpenStreetMap)', 'merged buildings (OpenStreetMap and Microsoft)', 'OpenStreetMap', 'Microsoft ML Buildings'], credit, parts: parts.map(p => p.code) };   // (classes: labels as the cards show them, 'Footprint from')
  // where the world base has no height tile (most of the UK), the globe draws the world terrain texture (ETOPO 2022 box
  // means, about 9.8 km a pixel; globe/terrain.js): the same ground here, so the blocks stand where the globe's ground is
  const fTex = join(CW, 'docklands', 'data', 'world', 'terrain-4096x2048.png');
  const a2 = await run(LOPS.tiles, [...ins, gIn, fileIn(fGeoid, 'geoid'), fileIn(fTex, 'world terrain texture')], TP, async p => {
    const texAt = await worldTexSampler(fTex), geoAt = await geoidSampler(fGeoid), G = worldBaseGround(GM, (L2, x, y) => { const b = readFileSync(join(gdir, GM.dem.url.replace('{z}', L2).replace('{x}', x).replace('{y}', y))); return new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }, texAt);
    // the building records of all parts (each sorted by leaf cell): ranges by leaf cell (a cell cut by a part edge gets
    // ranges from both parts)
    const cells = new Map(), lms = [];
    const cellParts = new Map();   // leaf cell -> { part code: built area } (to share tile bytes out by part)
    const csL = 180 / 2 ** p.leaf;
    for (const pt of parts) { const o = liteOut(pt), B = gunzipSync(readFileSync(o.recs)), nB = B.length / REC; let s0 = 0, ck0 = null, area = 0;
      const flush = i => { if (ck0 == null) return; (cells.get(ck0) || cells.set(ck0, []).get(ck0)).push([B, s0, i]); const cp = cellParts.get(ck0) || cellParts.set(ck0, {}).get(ck0); cp[pt.code] = (cp[pt.code] || 0) + area; };
      for (let i = 0; i < nB; i++) { const lon = B.readInt32LE(i * REC) / 1e7, lat = B.readInt32LE(i * REC + 4) / 1e7, ck = Math.floor((lon + 180) / csL) + '-' + Math.floor((lat + 90) / csL);
        if (ck !== ck0) { flush(i); ck0 = ck; s0 = i; area = 0; } area += B.readFloatLE(i * REC + 8); }
      flush(nB); console.log(`  ${pt.code}: ${nB} building records`);
      for (const l of rz(o.lm)) { lms.push(l); const ck = Math.floor((l.c[0] + 180) / (180 / 2 ** p.leaf)) + '-' + Math.floor((l.c[1] + 90) / (180 / 2 ** p.leaf)), cp = cellParts.get(ck) || cellParts.set(ck, {}).get(ck); cp[pt.code] = (cp[pt.code] || 0) + l.a; } }
    lms.sort((a, b) => (a.part - b.part) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));   // rows by part (one shard of features a part), then id
    // landmark heights (place-lite-landmark-heights): towers, spires and the highest point
    const LH = existsSync(liteHeightsOut().out) ? rz(liteHeightsOut().out) : {}; for (const l of lms) { const x = LH[l.id]; l.top_h = x ? x.top_h : l.h; l.top_src = x ? x.top_src : l.src; l.towers = x ? x.towers : []; }
    const named = new Map(lms.map((l, i) => [l.id, i])), cs = 180 / 2 ** p.leaf, lmByCell = new Map();
    lms.forEach((l, i) => l.towers.forEach((t, k) => named.set(l.id + ':t' + k, i)));   // (a tower or spire is drawn with its landmark's row)
    for (const l of lms) { const ck = Math.floor((l.c[0] + 180) / cs) + '-' + Math.floor((l.c[1] + 90) / cs); (lmByCell.get(ck) || lmByCell.set(ck, []).get(ck)).push(l); }
    // the tree: every leaf cell with atoms or landmarks and its ancestors
    const nodes = new Map(), get = (l, x, y) => { const k = `${l}-${x}-${y}`; let n = nodes.get(k); if (!n) { n = { l, x, y, key: k, b: cellBox(l, x, y), kids: [] }; nodes.set(k, n); if (l > p.top) get(l - 1, x >> 1, y >> 1).kids.push(n); } return n; };
    for (const ck of new Set([...cells.keys(), ...lmByCell.keys()])) { const [x, y] = ck.split('-').map(Number); get(p.leaf, x, y); }
    for (const n of nodes.values()) n.kids.sort((a, b) => a.key.localeCompare(b.key));
    const roots = [...nodes.values()].filter(n => n.l === p.top).sort((a, b) => a.key.localeCompare(b.key));
    rmSync(join(OUT, 'tiles'), { recursive: true, force: true }); mkdirSync(join(OUT, 'tiles'), { recursive: true });
    rmSync(join(OUT, 'tilesets'), { recursive: true, force: true }); mkdirSync(join(OUT, 'tilesets'), { recursive: true });
    const outFiles = [], stats = []; let nT = 0; const total = nodes.size;
    const lmItem = l => ({ id: l.id, a: l.a, c: l.c, rings: l.rings, H: { h: l.h, src: l.src } });
    // a landmark's towers as items (a part: its outline; a spire or tower by the rule: a square round its centre), drawn
    // from the ground to their top with the landmark's row
    const sqRing = (c, side) => { const mLon = 111320 * Math.cos(c[1] * D2R), mLat = 110574, dx = side / 2 / mLon, dy = side / 2 / mLat; return [[[c[0] - dx, c[1] - dy], [c[0] + dx, c[1] - dy], [c[0] + dx, c[1] + dy], [c[0] - dx, c[1] + dy], [c[0] - dx, c[1] - dy]]]; };
    const towerItems = l => l.towers.map((t, k) => { const rings = t.rings || sqRing(t.c, t.side), c = t.c || l.c; return { id: l.id + ':t' + k, a: t.side ? t.side * t.side : l.a / 10, c, rings, H: { h: t.top_h, src: t.src === 'wikidata' ? 'wikidata (P2048), ' + t.kind + ' by the rule' : 'osm building part' } }; });
    const frameOf = b => { const lc = (b[0] + b[2]) / 2, bc = (b[1] + b[3]) / 2, h0 = Math.round((G.at(lc, bc) + geoAt(lc, bc)) * 100) / 100; return enuFrame({ lon: lc, lat: bc, h: h0 }); };
    const leafKeyOf = l => `${p.leaf}-${Math.floor((l.c[0] + 180) / cs)}-${Math.floor((l.c[1] + 90) / cs)}`;
    // returns { json, items (the mass of the cell as merged items), lms (the landmarks under it) }
    async function tile(n, parentWorld) {
      const F = frameOf(n.b), world = F.matrix(), leaf = n.l === p.leaf; let items, lmsHere, kidsJ = [], drawItems, Lp, compact = null, far = []; n.parts = leaf ? { ...(cellParts.get(n.x + '-' + n.y) || {}) } : {};
      if (leaf) {   // every landmark as its outline; every other building as its own box (compact layout)
        const ranges = cells.get(n.x + '-' + n.y) || [], nb = ranges.reduce((a, r) => a + r[2] - r[1], 0);
        lmsHere = (lmByCell.get(n.x + '-' + n.y) || []).slice();
        drawItems = lmsHere.flatMap(l => [lmItem(l), ...towerItems(l)]);
        Lp = { tall_m: Infinity, big_m2: Infinity, merge_m: p.levels[p.leaf - 1].merge_m, min_area_m2: 0, drop_m: p.drop_m, full_share: p.full_share };
        items = recSquares(ranges, n.b, p.levels[p.leaf - 1].merge_m);
        const rb = nb ? recBoxes(ranges) : [];
        compact = nb ? F2 => ({ ...compactBoxes({ F: F2, b: n.b, boxes: rb, groundAt: G.at, geoidAt: geoAt, drop_m: p.drop_m, grid_n: p.grid_n, kind: 'buildings', colour: p.colour }), mass_buildings: 0 }) : null;
        // the far forms (place-lite-tiles 5): the cell's street blocks, made once here and thinned by each coarser level;
        // landmarks join as their own oriented boxes (never merged), tagged so a level that draws a landmark as its own
        // box leaves it out of the blocks
        if (p.far) { far = streetBlocks(rb, p.far); for (const l of lmsHere) far.push({ ...footprintBox({ c: l.c, a: l.a, rings: l.rings }, l.h, 0, Math.max(0, HSRC.indexOf(l.src))), n: 1, lm: l }); items = []; }
      } else if (p.far) {   // a coarse level, far form: the kids' blocks of at least min_m2 (about one device pixel at the far end of this level's range)
        const all = []; lmsHere = [];
        for (const k of n.kids) { const r = await tile(k, world); kidsJ.push(r.json); for (const x of r.far) all.push(x); for (const l of r.lms) lmsHere.push(l); for (const [c, a] of Object.entries(k.parts)) n.parts[c] = (n.parts[c] || 0) + a; }
        const LP = p.levels[n.l], isOwn = l => (l.top_h ?? l.h) >= LP.tall_m || l.a >= LP.big_m2, own = lmsHere.filter(isOwn);
        const K = farKeep(all.filter(x => !(x.lm && isOwn(x.lm))), LP.min_m2 ?? p.far.min_m2?.[n.l] ?? 0);
        far = [...K.keep, ...all.filter(x => x.lm && isOwn(x.lm))]; items = [];
        drawItems = own.flatMap(l => [{ ...lmItem(l), own: true }, ...towerItems(l).map(t => ({ ...t, own: true }))]);
        Lp = { tall_m: Infinity, big_m2: Infinity, merge_m: LP.merge_m, min_area_m2: 0, drop_m: p.drop_m, full_share: p.full_share };
        const nmass = K.keep.reduce((a, x) => a + x.n, 0);
        compact = K.keep.length ? F2 => ({ ...compactBoxes({ F: F2, b: n.b, boxes: K.keep, groundAt: G.at, geoidAt: geoAt, drop_m: p.drop_m, grid_n: p.grid_n, kind: 'blocks', colour: p.colour }), mass_buildings: nmass, far_left_out: K.left_out_buildings }) : null;
      } else {
        const kidItems = []; lmsHere = [];
        for (const k of n.kids) { const r = await tile(k, world); kidsJ.push(r.json); for (const it of r.items) kidItems.push(it); for (const l of r.lms) lmsHere.push(l); for (const [c, a] of Object.entries(k.parts)) n.parts[c] = (n.parts[c] || 0) + a; }
        const LP = p.levels[n.l], own = [], rest = [];
        for (const l of lmsHere) ((l.top_h ?? l.h) >= LP.tall_m || l.a >= LP.big_m2 ? own : rest).push(l);
        items = mergeItems([...kidItems, ...rest.map(lmItem)], n.b, LP.merge_m);
        drawItems = own.flatMap(l => [{ ...lmItem(l), own: true }, ...towerItems(l).map(t => ({ ...t, own: true }))]);
        Lp = { tall_m: Infinity, big_m2: Infinity, merge_m: LP.merge_m, min_area_m2: 0, drop_m: p.drop_m, full_share: p.full_share };
        const sqs = squareBoxes(items, n.b, LP.merge_m, p.full_share), nmass = sqs.reduce((a, x) => a + x.n, 0);
        compact = sqs.length ? F2 => ({ ...compactBoxes({ F: F2, b: n.b, boxes: sqs, groundAt: G.at, geoidAt: geoAt, drop_m: p.drop_m, grid_n: p.grid_n, kind: 'squares', colour: p.colour }), mass_buildings: nmass }) : null;
      }
      const r = blockTile({ cell: n, items: drawItems, HT: {}, groundAt: G.at, geoidAt: geoAt, P: Lp, leaf: false, lite: true, named, namedOutlines: leaf, named_simplify_m: p.leafRule.simplify_m,
        classes: p.classes, colour: p.colour, credit: p.credit, compact });
      const f = join(OUT, 'tiles', n.key + '.glb'); writeFileSync(f, r.bytes); outFiles.push(f);
      r.stats.landmark_boxes ||= 0; r.stats.building_boxes = leaf ? (r.stats.compact?.boxes || 0) : 0; r.stats.mass_boxes = r.stats.merged + (leaf ? 0 : (r.stats.compact?.boxes || 0)); r.stats.merged_buildings = (r.stats.merged_buildings || 0) + (r.stats.compact_mass || 0); r.stats.parts = n.parts; stats.push(r.stats); if (++nT % 500 === 0) console.log(`  place-lite-tiles: ${nT} / ${total} tiles`);
      let region = r.region; for (const k of kidsJ) region = [region[0], region[1], region[2], region[3], Math.min(region[4], k.boundingVolume.region[4]), Math.max(region[5], k.boundingVolume.region[5])];
      const err = leaf ? 0 : p.levels[n.l].err_m;
      const t = { boundingVolume: { region: region.map(v => +v.toPrecision(12)) }, geometricError: err, refine: 'REPLACE', transform: roundM(parentWorld ? mul4(inv4rigid(parentWorld), world) : world).map((v, i) => i >= 12 ? v : +v.toPrecision(10)), content: { uri: `tiles/${n.key}.glb` } };
      if (kidsJ.length && n.l === p.external_from - 1) {   // the subtree as an external tile set (its root inherits this tile's frame)
        const up = j => { if (j.content) j.content.uri = '../' + j.content.uri; for (const k of j.children || []) up(k); }; for (const k of kidsJ) up(k);   // URIs resolve against the external JSON (tilesets/)
        const ts = { asset: { version: '1.1', generator: 'cwplans build-place-tiles.mjs (place-lite)', tilesetVersion: p.version_label }, geometricError: err, root: { boundingVolume: t.boundingVolume, geometricError: err, refine: 'REPLACE', children: kidsJ } };
        const tf = join(OUT, 'tilesets', n.key + '.json'); writeFileSync(tf, JSON.stringify(ts)); outFiles.push(tf);
        t.children = [{ boundingVolume: t.boundingVolume, geometricError: err, refine: 'REPLACE', content: { uri: `tilesets/${n.key}.json` } }];
      } else if (kidsJ.length) t.children = kidsJ;
      return { json: t, items, lms: lmsHere, far };
    }
    const children = []; for (const n of roots) children.push((await tile(n, null)).json);
    let lo = Infinity, hi = -Infinity, ext = [Infinity, Infinity, -Infinity, -Infinity]; for (const c of children) { lo = Math.min(lo, c.boundingVolume.region[4]); hi = Math.max(hi, c.boundingVolume.region[5]); }
    for (const n of roots) ext = [Math.min(ext[0], n.b[0]), Math.min(ext[1], n.b[1]), Math.max(ext[2], n.b[2]), Math.max(ext[3], n.b[3])];
    const rootErr = p.levels[p.top].err_m * 2;
    const tileset = { asset: { version: '1.1', generator: 'cwplans build-place-tiles.mjs (place-lite)', tilesetVersion: p.version_label, extras: { place: RID, name: REG.name, kind: 'lite', credit: p.credit,
      tiers: `lite: landmarks (own outline and id at level ${p.leaf}, own box at coarser levels when tall or big); every other building as its own box at its true position (footprint area, orientation, height; no outline) at level ${p.leaf}; the merged mass at the coarse levels (one box a square: ${Object.values(p.levels).map(v => v.merge_m).join(', ')} m at levels ${Object.keys(p.levels).join(', ')}); boxes in the compact layout cwplans-boxes-1 (glb extras.blocks.compact); no ground (the globe's terrain); levels from ${p.external_from} in external tile sets` } },
      geometricError: rootErr * 2, root: { boundingVolume: { region: [ext[0] * D2R, ext[1] * D2R, ext[2] * D2R, ext[3] * D2R, lo, hi].map(v => +v.toPrecision(12)) }, geometricError: rootErr, refine: 'REPLACE', children } };
    const tsf = join(OUT, 'tileset.json'); writeFileSync(tsf, JSON.stringify(tileset)); outFiles.push(tsf);
    // features.json: the landmarks (search, cards, featuresAt, describeView)
    // features: one shard a part (features/<code>.json, rows offset .. offset + count - 1), read by the page for the parts in
    // view; names.json: the named landmarks for search (read on the first search); features.json: the rest
    const r6 = v => Math.round(v * 1e6) / 1e6, FIELDS = ['osm_id', 'name', 'kind', 'lon', 'lat', 'height_m', 'height_source', 'tile', 'ground_m', 'wikidata', 'landmark', 'wikipedia', 'height_top_m', 'height_top_source', 'towers'];
    const Bf = lms.map(l => [l.osm || l.id, l.name, l.kind, r6(l.c[0]), r6(l.c[1]), l.h, l.src, leafKeyOf(l), Math.round(G.at(l.c[0], l.c[1]) * 10) / 10, l.wikidata, l.why, l.wikipedia, l.top_h ?? l.h, l.top_src ?? l.src, l.towers?.length || 0]);
    mkdirSync(join(OUT, 'features'), { recursive: true }); for (const f of readdirSync(join(OUT, 'features'))) rmSync(join(OUT, 'features', f));
    const shards = []; for (let k = 0, off = 0; k < allParts.length; k++) { const rows = Bf.filter((_, i) => lms[i].part === k); if (!rows.length) continue; const pt = allParts[k];
      const fs = join(OUT, 'features', pt.code + '.json'); writeFileSync(fs, JSON.stringify({ format: 'place-features-shard-1', place: RID, part: pt.code, name: pt.name, offset: off, buildings_fields: FIELDS, buildings: rows })); outFiles.push(fs);
      shards.push({ code: pt.code, name: pt.name, file: `features/${pt.code}.json`, offset: off, count: rows.length, bbox: pt.bbox.map(v => Math.round(v * 1000) / 1000) }); off += rows.length; }
    const nf = join(OUT, 'names.json'); writeFileSync(nf, JSON.stringify({ format: 'place-names-1', place: RID, fields: ['name', 'lon', 'lat', 'row'], rows: lms.map((l, i) => l.name ? [l.name, Math.round(l.c[0] * 1e5) / 1e5, Math.round(l.c[1] * 1e5) / 1e5, i] : null).filter(Boolean) })); outFiles.push(nf);
    // bytes by part: each tile's bytes shared out by the built area of each part under it; by class: landmark outlines
    // (their vertex and index bytes) and landmark boxes (36 bytes an instance with its card data) against the rest
    const byPart = {}, byClass = { landmarks: 0, mass: 0 };
    for (const s2 of stats) { const tot = Object.values(s2.parts).reduce((a, b) => a + b, 0) || 1, lmB = Math.min(s2.bytes, (s2.named_bytes || 0) + (s2.landmark_boxes || 0) * 36);
      for (const [c, a] of Object.entries(s2.parts)) { const o = byPart[c] ||= { bytes: 0, landmark_bytes: 0 }; o.bytes += s2.bytes * a / tot; o.landmark_bytes += lmB * a / tot; }
      byClass.landmarks += lmB; byClass.mass += s2.bytes - lmB; }
    for (const o of Object.values(byPart)) { o.bytes = Math.round(o.bytes); o.landmark_bytes = Math.round(o.landmark_bytes); }
    const tiers = {}; for (const s2 of stats) { const o = tiers['level ' + s2.level] ||= { tiles: 0, bytes: 0, triangles: 0, landmark_outlines: 0, landmark_boxes: 0, building_boxes: 0, mass_boxes: 0, mass_buildings: 0, landmark_bytes: 0 }; o.tiles++; o.bytes += s2.bytes; o.triangles += s2.triangles;
      o.far_left_out = (o.far_left_out || 0) + (s2.far_left_out || 0); o.landmark_outlines += s2.named || 0; o.landmark_boxes += s2.landmark_boxes || 0; o.building_boxes += s2.building_boxes || 0; o.mass_boxes += s2.mass_boxes || 0; o.mass_buildings += s2.merged_buildings || 0; o.landmark_bytes += (s2.named_bytes || 0) + (s2.landmark_boxes || 0) * 36; }
    const fj = { format: 'place-features-1', kind: 'lite', place: RID, name: REG.name, label: PL.label || REG.name, search: PL.search || [], timeZone: REG.timeZone, locale: REG.locale, origin: REG.origin, area: REG.bbox, extent: ext.map(r7), level: p.leaf,
      geoid_m: Math.round(geoAt(REG.origin.lon, REG.origin.lat) * 100) / 100, credit: p.credit,
      note: 'a place of kind lite: landmarks (rows in the shards, one a part: features/<code>.json; drawn with their own id: _FEATURE_ID_0 = row at the leaves, glb extras.blocks.boxes.f = row where a coarse level draws one as a box) plus every other building as its own box at the leaves (no id, no outline: glb extras.blocks.compact, layout cwplans-boxes-1) and the merged mass at the coarse levels (one box a square, no ids); ground_m = the globe\'s ground (world-base heights, metres above the geoid); names.json: the named landmarks for search',
      buildings_fields: FIELDS, buildings: [], shards, names: 'names.json',
      streets_fields: ['name', 'kind', 'lon', 'lat', 'name_alt'], streets: [], areas_fields: ['name', 'kind', 'lon', 'lat', 'name_alt'], areas: [], points_fields: ['osm_id', 'name', 'kind', 'lon', 'lat', 'address', 'name_alt'], points: [], tiles: [],
      lite: { tile_extras: TILE_EXTRAS, compact: COMPACT_ABOUT, landmarks: lms.length, parts: parts.map(pt => ({ code: pt.code, name: pt.name, bbox: pt.bbox.map(v => Math.round(v * 1000) / 1000), tile_bytes: byPart[pt.code] || null })), tiers, bytes_by_class: byClass, rule: LT.landmark, leaf: p.leafRule, ...(p.far ? { far: { ...p.far, rule: FAR_RULE } } : {}) } };
    const ff = join(OUT, 'features.json'); writeFileSync(ff, JSON.stringify(fj)); outFiles.push(ff);
    console.log('  tiers:', JSON.stringify(tiers)); console.log(`  world-base height tiles read: ${G.used.size}`);
    return outFiles; });
  // the committed log (in the other repository), the index entry (here), the READMEs
  const fj = JSON.parse(readFileSync(join(OUT, 'features.json'), 'utf8'));
  const partCounts = parts.map(pt => JSON.parse(readFileSync(liteOut(pt).counts, 'utf8')));
  blog.about = `Build log of the place ${RID} (${REG.name}, kind lite) by cwplans/tools/build-place-tiles.mjs (danbri/londat): what was fetched (URL, date, SHA-256) and each dataflow activity with its input and output hashes. Raw files stay in cwplans/data/raw/places/${RID}/ of londat (not committed). Paths "${PL.outRepo}:..." are in the ${PL.outRepo} repository, other paths are relative to londat's cwplans/.`;
  blog.fetches = flog; blog.parts = partCounts; blog.tiers = fj.lite.tiers; blog.lite = { landmarks: fj.lite.landmarks, bytes_by_class: fj.lite.bytes_by_class, tile_bytes_by_part: Object.fromEntries(fj.lite.parts.map(x => [x.code, x.tile_bytes])) };
  blog.fault = 'F55 (curation skill fault register): buildings with no height in OSM; counted, not patched per record';
  writeFileSync(BLOG, JSON.stringify(blog, null, 1));
  const IX = join(OUTROOT, 'index.json'), ix = JSON.parse(readFileSync(IX, 'utf8')), TB = PL.tileBase.replace(/\/?$/, '/');
  const entry = { id: RID, name: REG.name, label: fj.label, kind: 'lite', area: REG.bbox, centre: [REG.origin.lon, REG.origin.lat], timeZone: REG.timeZone, locale: REG.locale, tileBase: TB, tileset: `${TB}tileset.json`, features: `${TB}features.json`, readme: `${TB}README.md`, provenance: `${TB}provenance/log.json`,
    credit: fj.credit, buildings: partCounts.reduce((s, c) => s + (c.counts['mass buildings'] || 0) + (c.counts.landmarks || 0), 0), landmarks: fj.lite.landmarks, built: a2.at, extent: fj.extent, load_m: PL.load_m, free_m: PL.free_m,
    boxes: fj.lite.parts.map(x => x.bbox), exclude: (PL.exclude_polygons || []).map(e => e.place), ...(PL.views?.[0] ? { view: `ll=${PL.views[0].ll}&ht=${PL.views[0].ht}` } : {}) };
  ix.places = ix.places.filter(q => q.id !== RID).concat(entry).sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(IX, JSON.stringify(ix, null, 1));
  writeLiteReadme(parts, partCounts);
  writeReadmes();
  let tot = 0; for (const f of readdirSync(join(OUT, 'tiles'))) tot += statSync(join(OUT, 'tiles', f)).size;
  console.log(`done: ${readdirSync(join(OUT, 'tiles')).length} tiles ${(tot / 1e6).toFixed(1)} MB, ${fj.lite.landmarks} landmarks, tileset.json ${(statSync(join(OUT, 'tileset.json')).size / 1e3).toFixed(0)} kB, features.json ${(statSync(join(OUT, 'features.json')).size / 1e6).toFixed(2)} MB`);
}

// README.md of a lite place (in the other repository): sources, licences, the landmark rule, sizes by part and class,
// the operations; generated from provenance/log.json, features.json and the data register (never edit it by hand)
function writeLiteReadme(parts, partCounts) {
  const reg = JSON.parse(readFileSync(join(CW, 'data-register.json'), 'utf8')), S = reg.sources, log = JSON.parse(readFileSync(BLOG, 'utf8'));
  const fj = JSON.parse(readFileSync(join(OUT, 'features.json'), 'utf8')), last = op => log.activities.filter(a => a.operation === op).at(-1);
  const size = p => statSync(p).size, mb = n => (n / 1e6).toFixed(2) + ' MB', esc = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' '), fmt = n => Math.round(n).toLocaleString('en');
  const L = [], SITE = 'https://danbri.github.io/londat/', TB = PL.tileBase, R = LT.landmark;
  const dirFiles = d => existsSync(join(OUT, d)) ? readdirSync(join(OUT, d)).sort() : [];
  const tiles = dirFiles('tiles'), tsets = dirFiles('tilesets'), shards = dirFiles('features'), tb = tiles.reduce((a, f) => a + size(join(OUT, 'tiles', f)), 0), sb = tsets.reduce((a, f) => a + size(join(OUT, 'tilesets', f)), 0), fb = shards.reduce((a, f) => a + size(join(OUT, 'features', f)), 0);
  const top = ['tileset.json', 'features.json', 'names.json', 'provenance/log.json'].filter(f => existsSync(join(OUT, f))), total = tb + sb + fb + top.reduce((a, f) => a + size(join(OUT, f)), 0);
  L.push(`# ${REG.name}: a lite building set on the globe (3D Tiles 1.1)`, '',
    `Made by [cwplans/tools/build-place-tiles.mjs](${GH}tools/build-place-tiles.mjs) (with [place-lite.mjs](${GH}tools/place-lite.mjs) and [place-blocks.mjs](${GH}tools/place-blocks.mjs)) of https://github.com/danbri/londat for the region config [docklands/geo/regions/${RID}.js](https://github.com/danbri/londat/blob/main/docklands/geo/regions/${RID}.js); drawn by the globe of the Three.js port ([docklands/globe/places.js](https://github.com/danbri/londat/blob/main/docklands/globe/places.js)). Served from ${TB}`,
    `This README is generated from \`provenance/log.json\`, \`features.json\` and londat's [cwplans/data-register.json](${GH}data-register.json) by \`node cwplans/tools/build-place-tiles.mjs readme --region ${RID} --out <this folder>\` (also at the end of each build). Do not edit it by hand.`, '',
    'Owner, 2026-10-22, about buildings for the whole UK: "can we pick a lite subset or slice somehow? Key landmarks, modest resolution?"', '',
    '## What it is', '',
    `- Scope: the United Kingdom outside Greater London. Greater London is its own place (kind "blocks", every building; its README: ${GH}docklands/data/places/london/README.md ): a building whose centroid is in the ONS region E12000007 polygon of the UK skeleton is drawn by London only, the same polygon and the same centroid rule as London's build, so no building is drawn twice. Every other building belongs to the first part (English regions, then Wales, Scotland, Northern Ireland; ONS BGC polygons of the UK skeleton) whose polygon holds its centroid; a building outside every polygon (the generalised coast; the edges of two ONS products at the Welsh and Scottish borders) goes to the nearest part within ${PL.coast_m} m, never inside the Republic of Ireland (Natural Earth).`,
    `- Three ways a building is drawn: (a) **landmarks**, each with its outline (simplified at ${LT.leaf.simplify_m} m), its own id (\`_FEATURE_ID_0\` = row of features.json) and a card, and as an oriented box with the same card at the coarse levels where it is tall or big enough; (b) at the leaves, **every other building** (OpenStreetMap and Microsoft footprints, ${LT.landmark.min_area_m2} m2 or more) as **its own box at its true position** (centroid): its footprint area, the orientation and the long / short ratio of its minimum rotated rectangle, its height; no outline and no id (a tap gives its card: footprint source, height and its source); ${LT.far ? `(c) at the coarse levels the **far forms** (place-lite-tiles 5, issue #13, owner 2026-10-23: "towns from 20 km read as towns, not tiles"): real buildings and **street blocks** at their true positions, no squares. Adjacent buildings of one leaf cell (oriented boxes within ${LT.far.gap_m} m, heights within max(${LT.far.h_abs_m} m, ${LT.far.h_rel * 100} %)) are one block: one oriented box at their grain, its footprint the sum of theirs, its height their area-weighted mean (cut in two while they fill less than ${LT.far.fill_min * 100} % of it); a level draws the blocks whose seen size sqrt(area) x max(sqrt(area), height) is at least its min_m2, about one device pixel squared at the far end of the level's range on a phone; smaller ones are left to the nearer levels (counted). Landmarks join as their own boxes.` : `(c) at the coarse levels the **merged mass**: one box a square, its footprint the summed area of the buildings (the box side grows with the built share, full at ${LT.full_share * 100} %), its height their area-weighted mean.`}`,
    `- Leaves (level ${LT.leaf_level}, about 9.8 x 5.6 km at 55 N; drawn within about ${Math.round(LT.levels[LT.leaf_level - 1].err_m * 731 / 24 / 1000)} km of the eye on a phone screen): one box a building. Coarse levels: ${Object.entries(LT.levels).map(([l, v]) => `level ${l} ${LT.far ? `blocks of seen size ${fmt(LT.far.min_m2[l])} m2 or more` : `${v.merge_m} m squares`} (landmarks of ${v.tall_m} m or ${fmt(v.big_m2)} m2 and more as boxes; geometricError ${v.err_m} m)`).join('; ')}. REPLACE refinement, quadtree of the cells with buildings; levels ${LT.external_from} to ${LT.leaf_level} are in external tile sets (\`tilesets/<level 8 cell>.json\`), so the root tileset.json stays small and the whole UK loads from far (the reader loads the place within ${PL.load_m / 1000} km of its centre).`,
    `- Compact boxes (layout \`cwplans-boxes-1\`, glb \`extras.blocks.compact\`: one buffer view of 8 bytes a box and one of the ground grid): int16 east and north in the tile frame, one byte each for the footprint area (log scale), the height (0.25 m steps to 50 m, then 5 m), the angle of the long side and the flags (aspect, footprint class, height source). The buildings' boxes and the merged squares use it; the landmarks' outlines and boxes are plain glTF (KHR_mesh_quantization, EXT_mesh_gpu_instancing). The reader (docklands/globe/places.js) turns the compact boxes into instances of the unit box.`,
    `- No ground of its own: the blocks stand on the globe's ground (world-base heights, Copernicus GLO-90, where it has tiles, else the globe's world terrain texture) plus the EGM96 geoid, sampled on a ${LT.grid_n || 17} x ${LT.grid_n || 17} grid a tile; bases ${LT.drop_m} m deep. Tiles hold geometry and attributes only, no texture and no baked light (Architecture rule 6).`, '',
    '## The landmark rule', '',
    'A building whose outline comes from OpenStreetMap (via Overture) is a landmark when one of these holds (checked in this order; the card says which):', '',
    '1. it has an OSM `wikidata` or `wikipedia` tag (an encyclopaedia record);',
    `2. it is of a notable kind: OSM \`building\` (or Overture class) ${R.building.join(', ')}; \`historic\` ${R.historic.join(', ')}; \`man_made\` ${R.man_made.join(', ')}; \`leisure\` ${R.leisure.join(', ')};`,
    `3. it has a name and is ${R.named_tall_m} m or taller by a measured height (OSM height or levels, Microsoft ML or another open Overture source; not the GHSL cell mean nor a default), or its footprint is ${fmt(R.named_big_m2)} m2 or more.`, '',
    `The OSM tags of rules 1 and 2 come from one SPARQL query of the QLever OSM endpoint (planet of 2026-09-21; the buildings that the UK relation ${LT.tags.area_relation} contains), joined to the Overture record by its OSM id. A landmark by the rule whose outline is not in the slim answer (geometry is fetched only for named, tall, big or notable-class records) is merged into the mass and counted. Microsoft footprints have no names or tags, so they are never landmarks. Buildings under ${R.min_area_m2} m2 are left out.`, '',
    `Landmarks: ${fmt(fj.lite.landmarks)}. By reason: ${Object.entries(partCounts.reduce((o, c) => { for (const [k, v] of Object.entries(c.counts)) if (k.startsWith('landmarks: ')) o[k.slice(11)] = (o[k.slice(11)] || 0) + v; return o; }, {})).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')}.`, '',
    ...(LT.heights ? (() => { const Hr = LT.heights.rule, hc = existsSync(liteHeightsOut().counts) ? JSON.parse(readFileSync(liteHeightsOut().counts, 'utf8')) : null;
      return ['## Landmark heights (towers and spires)', '',
        'Owner, 2026-10-22, to "should I improve the landmark heights next, with OSM spire and tower parts or the heights in Wikidata?": "Yes do that". Operation `place-lite-landmark-heights` ([place-lite-heights.mjs](' + GH + 'tools/place-lite-heights.mjs)). The body of a landmark (its own outline) keeps its height (often a Microsoft roof height or the GHSL cell mean: fault F55). Above it:', '',
        `1. **OSM building parts** (\`building:part\` with a \`height\`, via the Overture building_part theme, joined to the landmark by its Overture building id): every part whose top is at least max(${Hr.rise_m} m, ${Hr.rise_share * 100} % of the body) above the body is drawn as its own block (its outline, from the ground to its top), at most ${Hr.max_parts} a landmark, with the landmark's id and card.`,
        `2. **Wikidata height** (P2048 of the landmark's OSM \`wikidata\` item; CC0; statements with an end time or of deprecated rank left out, preferred statements first, then the greatest; feet converted): when it is at least max(${Hr.rise_m} m, ${Hr.rise_share * 100} %) above the highest top so far and at most ${Hr.max_wd_m} m, a spire is drawn on the tallest part (a square of ${Hr.spire_share} x the square root of its area), else a square tower at the landmark's centroid (side ${Hr.tower_share} x the square root of the footprint, ${Hr.tower_min_m} to ${Hr.tower_max_m} m). The tower's place is a rule, not a survey.`,
        '3. The card gives the body height and the highest point with its source; describeView names the tallest landmark by its highest point.', '',
        ...(hc ? [`Counts: ${Object.entries(hc.counts).map(([k, v]) => `${k} ${fmt(v)}`).join('; ')}.`, '', `Highest point by source: ${Object.entries(hc.highest_point_source).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')}.`, ''] : [])]; })() : []),
    '## Views (live after the merge)', '', ...(PL.views || []).map(v => `- ${v.name}: ${SITE}docklands/?ll=${v.ll}&ht=${v.ht || '0,55'}`), '');
  // sizes
  L.push('## Files and sizes', '', '| path | what | files | bytes | SHA-256 |', '|---|---|---|---|---|');
  const listSha = (d, fs) => sha(fs.map(f => f + ' ' + sha(readFileSync(join(OUT, d, f)))).join('\n'));
  L.push(`| tileset.json | the root: levels ${LT.top_level} and ${LT.top_level + 1}, ENU transforms relative to the parent, region bounding volumes, geometric errors; the level-${LT.external_from - 1} tiles refer to their external tile sets | 1 | ${size(join(OUT, 'tileset.json'))} | \`${sha(readFileSync(join(OUT, 'tileset.json')))}\` |`);
  L.push(`| tilesets/ | one external tileset per level-${LT.external_from - 1} cell (levels ${LT.external_from} to ${LT.leaf_level}; content URIs relative to it) | ${tsets.length} | ${sb} | \`${listSha('tilesets', tsets)}\` (list of names and SHA-256) |`);
  L.push(`| tiles/ | glTF 2.0 tiles: landmark outlines with COLOR_0 and _FEATURE_ID_0 (EXT_mesh_features), landmark boxes as EXT_mesh_gpu_instancing instances of one unit box, KHR_mesh_quantization; the buildings' boxes (leaves) and the merged squares (coarse levels) in the compact layout cwplans-boxes-1 (extras.blocks.compact); glb extras.blocks: class, height (dm), height source, landmark row (boxes.f), landmark rows drawn as outlines (named), buildings the merged squares stand for | ${tiles.length} | ${tb} | \`${listSha('tiles', tiles)}\` (list of names and SHA-256) |`);
  L.push(`| features/ | the landmarks, one shard a part (rows offset .. offset + count - 1 of the tiles' feature ids): OSM id, name, kind, position, height and its source, leaf tile, ground, Wikidata, the rule that made it a landmark, Wikipedia; read by the page for the parts in view | ${shards.length} | ${fb} | \`${listSha('features', shards)}\` (list of names and SHA-256) |`);
  for (const f of ['features.json', 'names.json', 'provenance/log.json']) if (existsSync(join(OUT, f))) L.push(`| ${f} | ${f === 'features.json' ? 'the text and machine interface of the set: the parts and their shards, the landmark rule, sizes by level and class, the credit' : f === 'names.json' ? 'the named landmarks for search (name, position, row); read on the first search' : 'fetch records and dataflow activities (inputs and outputs by SHA-256), counts per part'} | 1 | ${size(join(OUT, f))} | \`${sha(readFileSync(join(OUT, f)))}\` |`);
  L.push('', `Total ${mb(total)} (README.md not counted). Tiles by class (attributed: landmark outline vertices and indices, and 36 bytes for each landmark box; the rest is the mass): landmarks ${mb(fj.lite.bytes_by_class.landmarks)}, other buildings (their own boxes at the leaves, ${LT.far ? 'far blocks' : 'merged squares'} at the coarse levels) ${mb(fj.lite.bytes_by_class.mass)}.`, '');
  L.push('### By level', '', `| level | tiles | MB | triangles | landmark outlines | landmark boxes | buildings as their own boxes | ${LT.far ? 'far blocks (buildings they stand for)' : 'merged squares (buildings in them)'} |`, '|---|---|---|---|---|---|---|---|');
  for (const [k, v] of Object.entries(fj.lite.tiers).sort((a, b) => +a[0].split(' ')[1] - +b[0].split(' ')[1])) L.push(`| ${k.replace('level ', '')} | ${fmt(v.tiles)} | ${(v.bytes / 1e6).toFixed(2)} | ${fmt(v.triangles)} | ${fmt(v.landmark_outlines)} | ${fmt(v.landmark_boxes)} | ${fmt(v.building_boxes || 0)} | ${fmt(v.mass_boxes)} (${fmt(v.mass_buildings)}) |`);
  L.push('', '### By part (region)', '', 'Tile bytes are shared out by the built area of each part under a tile (a tile on a border counts in both by share).', '',
    '| part | code | records read | buildings drawn: landmarks | in the mass (of them Microsoft) | heights: OSM, Microsoft, other Overture, GHSL, default | tile MB (landmarks) |', '|---|---|---|---|---|---|---|');
  let sumB = 0;
  for (const c of partCounts) { const x = fj.lite.parts.find(q => q.code === c.part)?.tile_bytes || { bytes: 0, landmark_bytes: 0 }, H = c.height_sources, k = c.counts; sumB += x.bytes;
    L.push(`| ${c.name} | ${c.part} | ${fmt(k['records read'] || 0)} | ${fmt(k.landmarks || 0)} | ${fmt(k['mass buildings'] || 0)} (${fmt(c.geometry.ms.buildings)}) | ${fmt((H['osm-height'] || 0) + (H['osm-levels'] || 0))}, ${fmt(H.ms || 0)}, ${fmt((H['overture-height'] || 0) + (H['overture-floors'] || 0))}, ${fmt(H.ghsl || 0)}, ${fmt((H['default'] || 0) + (H['default-small'] || 0))} | ${(x.bytes / 1e6).toFixed(1)} (${(x.landmark_bytes / 1e6).toFixed(1)}) |`); }
  L.push('', 'What each part left out or took by a rule (counts of place-lite-select):', '');
  for (const c of partCounts) L.push(`- ${c.name}: ${Object.entries(c.counts).filter(([k]) => !k.startsWith('landmarks') && k !== 'records read' && k !== 'mass buildings').map(([k, v]) => `${esc(k)} ${fmt(v)}`).join('; ')}`);
  L.push('');
  // sources
  L.push('## Sources', '');
  for (const [key, rec] of Object.entries(log.fetches || {})) {
    const sid = rec.source, s = S[sid] || {};
    L.push(`### ${key}: ${s.name || sid}`, '', `- Register source: \`${sid}\` ([DATA-REGISTER.md](${GH}DATA-REGISTER.md))`, `- Licence: ${s.licence || rec.licence || ''}${s.licence_url ? ` (${s.licence_url})` : ''}`, `- Credit (exact text): "${s.attribution || ''}"`,
      `- Fetched: ${rec.fetched}${rec.index ? ` (${rec.index})` : ''}`, `- Request: ${(Array.isArray(rec.url) ? rec.url : [rec.url]).map(u => '`' + u + '`').join(' ; ')}${rec.request ? ` — ${esc(rec.request).slice(0, 900)}` : ''}`);
    const af = rec.as_fetched; if (Array.isArray(af)) for (const a of af) L.push(`- As fetched: ${a.bytes} bytes, SHA-256 \`${a.sha256}\` (${a.url})`); else if (af?.sha256) L.push(`- As fetched: ${af.bytes} bytes, SHA-256 \`${af.sha256}\``); else if (af?.note) L.push(`- As fetched: ${af.note}`);
    L.push(`- Stored for the build: \`${rec.file}\`, ${rec.bytes} bytes, SHA-256 \`${rec.sha256}\` — NOT committed (londat's raw folder, git-ignored)${rec.records ? `; ${fmt(rec.records)} records` : ''}${rec.rows ? `; ${fmt(rec.rows)} rows` : ''}`, '');
  }
  L.push('Also read (committed in londat): the UK skeleton polygons (`cwplans/docklands/data/uk/layers/regions/6/`, `countries/6/`; ONS, OGL v3.0), Natural Earth countries (`cwplans/docklands/data/world/countries.json`; public domain), the world-base heights (`cwplans/docklands/data/world-base/dem/`; Copernicus GLO-90) and the EGM96 geoid grid (`cwplans/docklands/data/world/geoid-egm96-1deg.png`).', '');
  // operations
  L.push('## Operations (dataflow, skill cwplans-dataflow)', '', 'Each activity: id = sha256 of [operation, version, input hashes, parameters], first 16 hex. Inputs and outputs by SHA-256; a re-run with the same inputs writes nothing. Outputs under `data/raw/` (londat) are intermediate (not committed); their hashes fix the next step. Paths `docklandia:...` are in this repository.', '');
  const acts = [...parts.map(pt => log.activities.filter(a => a.operation === LOPS.select.id && a.params.part === pt.code).at(-1)), last(LOPS.heights.id), last(LOPS.tiles.id)].filter(Boolean);
  for (const a of acts) {
    L.push(`### ${a.operation} version ${a.version}${a.params.part ? ` (${a.params.part} ${a.params.name})` : ''} (activity \`${a.activity}\`, ${a.at})`, '', `Skill ${a.skill}; tool ${a.tool}.`, '', 'Inputs:', '');
    for (const i of a.inputs) L.push(`- ${i.label}: \`${i.path}\` SHA-256 \`${i.sha256}\``);
    L.push('', 'Outputs:', ''); for (const o of a.outputs.slice(0, 4)) L.push(`- \`${o.path}\` SHA-256 \`${o.sha256}\` (${o.bytes} bytes)`); if (a.outputs.length > 4) L.push(`- and ${fmt(a.outputs.length - 4)} more (tiles and tile sets: the Files table above)`);
    L.push('', `Parameters: \`${esc(JSON.stringify(a.params)).slice(0, 1500)}\``, ''); }
  L.push('## What is derived from what', '',
    '- `place-lite-select` (one activity per part): the Overture buildings answer of the part\'s box (slim NDJSON, raw) + the landmark tags (QLever TSV, raw) + the GHSL tiles (raw zips) + the skeleton and Natural Earth polygons -> the part\'s landmarks (outline, name, kind, Wikidata, Wikipedia, height and its source, the rule), one 20-byte record for each other building (centroid, footprint area, height, angle and aspect of its minimum rotated rectangle, footprint class, height source; sorted by leaf cell) and its atoms (200 m squares of the level-11 cells), with counts.',
    '- `place-lite-landmark-heights`: the landmarks of every part + the Overture building parts (raw NDJSON) + the Wikidata heights (QLever TSV, raw) -> the towers, spires and highest point of each landmark that has one (gzip JSON, raw) with counts.',
    '- `place-lite-tiles`: the building records and landmarks of every part, the landmark heights + the globe\'s world-base height tiles + the EGM96 geoid grid + the world terrain texture -> `tiles/*.glb`, `tilesets/*.json`, `tileset.json`, `features.json`, `names.json`.',
    '- londat\'s `cwplans/docklands/data/places/index.json` (the entry with tileBase) and this README are made from these files.', '');
  L.push('## Heights (fault F55: counted, not patched)', '', 'Order: OSM height > OSM building:levels x 3 m > height of a non-OSM source with an open licence (Microsoft ML Buildings) > num_floors of such a source x 3 m > small kinds 3 m > GHSL cell mean under the centroid (min 3 m) > 7 m. Landmark heights are often low (a cathedral\'s Microsoft height is its roof, not its tower).', '');
  const HT2 = {}; for (const c of partCounts) for (const [k, v] of Object.entries(c.height_sources)) HT2[k] = (HT2[k] || 0) + v;
  L.push('| height source | buildings |', '|---|---|', ...Object.entries(HT2).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${fmt(v)} |`), '');
  L.push('## Review status', '',
    '- OSM (ODbL 1.0, share-alike): allowed for the prototyping phase (owner, 2026-10-03); to be reviewed with the rest of the OSM use.',
    '- Overture Maps buildings and Microsoft ML Buildings footprints and heights (ODbL 1.0, share-alike): allowed by the owner on 2026-10-20 ("Use ms/overture"); Microsoft footprints in the mass where OSM has none (owner, 2026-10-22, decision on London: "yes"). Registered next to OSM; credit kept. Height values whose source licence is not open are neither used nor committed (counts above).',
    '- GHSL GHS-BUILT-H (CC BY 4.0), Copernicus GLO-90 heights of the globe, ONS boundaries (OGL v3.0), Natural Earth (public domain): open.', '');
  writeFileSync(join(OUT, 'README.md'), L.join('\n'));
  console.log('readme: ' + join(OUT, 'README.md'));
}

// ---------- the build: three operations (six with a surround block)
async function build() {
  const fOsm = join(RAWD, 'osm.json.gz'), fDem = join(RAWD, 'dem.json.gz'), fGeoid = join(CW, 'docklands', 'data', 'world', 'geoid-egm96-1deg.png');
  for (const f of [fOsm, fDem]) if (!existsSync(f)) throw new Error(`missing ${rel(f)}: run fetch first`);
  const P = { area: AREA, level: L, names: PL.names || ['name'], alt_names: PL.alt_names || [] };
  const fSel = join(WORK, 'select.json.gz');
  const a1 = await run(OPS.select, [fileIn(fOsm, 'osm')], P, async p => { const sel = selectOsm(rz(fOsm), p.names, p.alt_names); jz(fSel, sel); console.log(`  ${sel.buildings.length} buildings and parts, ${sel.areas.length} areas, ${sel.lines.length} lines, ${sel.points.length} named points`); return [fSel]; });
  const natFiles = natAds.map(a => join(RAWD, `heights-${a.id}.json.gz`)).filter(existsSync), rasFiles = rasAds.map(a => [a, rasFile(a)]).filter(([, f]) => existsSync(f));
  const fpFiles = fpAds.map(a => [a, fpFile(a)]).filter(([, f]) => existsSync(f));
  const HP = { storey_m: 3, national_storey_m: natAds[0]?.buildingHeights.storey_m ?? 3, ...(lod2Ad ? { national_height_label: lod2Ad.buildingHeights.label } : {}), default_m: PL.default_height_m ?? 9, default_small_m: 3, raster_min_m: 3, rasters: rasFiles.map(([a]) => a.buildingHeights.label),
    footprints: fpFiles.map(([a]) => ({ label: a.buildingHeights.label, min_area_ratio: a.buildingHeights.min_area_ratio, top_includes_roof: !!a.buildingHeights.top_includes_roof })),
    roof_rule: PL.roof_rule || null, pitch_deg: 30, max_roof_m: 8,
    rule: 'height: osm height > osm building:levels x storey > national floors (area-weighted median of the parts whose centroid is inside) x storey > Overture height > Overture num_floors x storey (non-OSM records with an open licence) > Microsoft height (footprint match: a centroid inside the other outline, area ratio >= min_area_ratio) > small kinds 3 m > raster cell under the centroid (min raster_min_m) > default. roof: osm roof:shape > Overture roof_shape > roof_rule > flat' };
  const fH = join(WORK, 'heights.json.gz');
  const a2 = await run(OPS.heights, [fileIn(fSel, 'selected'), ...natFiles.map(f => fileIn(f, 'national-heights')), ...rasFiles.map(([, f]) => fileIn(f, 'raster-heights')), ...fpFiles.map(([, f]) => fileIn(f, 'footprint-heights'))], HP, async p => {
    const nat = natFiles.flatMap(f => rz(f).parts), ras = rasFiles.map(([a, f]) => ({ ...JSON.parse(readFileSync(f, 'utf8')), label: a.buildingHeights.label }));
    const fps = fpFiles.map(([a, f]) => ({ label: a.buildingHeights.label, top: !!a.buildingHeights.top_includes_roof, min_area_ratio: a.buildingHeights.min_area_ratio, rows: footprintRows(JSON.parse(readFileSync(f, 'utf8'))) }));
    const r = heightsOf(rz(fSel), nat, ras, p, fps); jz(fH, r); console.log('  footprint matches:', JSON.stringify(r.matches)); console.log('  height sources and faults:', JSON.stringify(r.faults)); console.log('  roofs:', JSON.stringify(r.roofs)); return [fH]; });
  const fL2 = lod2Ad ? join(RAWD, `lod2-core-${lod2Ad.id}.json.gz`) : null, l2In = fL2 && existsSync(fL2) ? [fileIn(fL2, 'lod2-core')] : [];
  const TP = { grid: 32, tex: 512, jpeg: 82, skirt_m: 300, version_label: `${RID}-1`, ...(demAd.dem.open_px ? { dem_open_px: demAd.dem.open_px } : {}),
    ...(l2In.length ? { lod2: { label: lod2Ad.buildingHeights.label, rule: 'the LoD2 buildings of the core drawn as their wall and roof polygons; an OSM outline that holds a LoD2 centroid, or whose centroid is in a LoD2 footprint, is not drawn and names the LoD2 buildings in it' } } : {}) };
  const fRing = join(RAWD, 'dem-ring.json.gz'), ringIn = RING_M && !SUR && existsSync(fRing) ? [fileIn(fRing, 'dem-ring')] : [];   // the ring is replaced by the surroundings
  const a3 = await run(OPS.tiles, [fileIn(fSel, 'selected'), fileIn(fH, 'heights'), fileIn(fDem, 'dem'), fileIn(fGeoid, 'geoid'), ...ringIn, ...l2In], { ...TP, ring_m: ringIn.length ? RING_M : 0, ring_grid: 97 }, async p => {
    const geo = await geoidSampler(fGeoid); return buildTiles(rz(fSel), rz(fH).heights, rz(fDem), geo, p, ringIn.length ? rz(fRing) : null, l2In.length ? rz(fL2).units : null); });
  const lod = SUR ? await buildOuter(fGeoid, natFiles, rasFiles) : null;
  // the committed log: fetch records (no local paths of raw files beyond their names), the activities, the fault counts
  const HZ = rz(fH);
  blog.about = `Build log of the place ${RID} (${REG.name}) by cwplans/tools/build-place-tiles.mjs: what was fetched (URL, date, SHA-256) and each dataflow activity with its input and output hashes. Raw files stay in cwplans/data/raw/places/${RID}/ (not committed).`;
  blog.fetches = flog; blog.height_sources = HZ.faults; blog.roofs = HZ.roofs; blog.footprint_matches = HZ.matches || null; blog.validation = HZ.validation || null; if (lod) { blog.city_height_sources = lod.cityHeights.faults; blog.city_footprint_matches = lod.cityHeights.matches; blog.city_validation = lod.cityHeights.validation; blog.outer_counts = lod.outerCounts; blog.tiers = lod.tiers; blog.city_geometry = lod.geometryClasses; } else { delete blog.tiers; } blog.fault = 'F55 (curation skill fault register): buildings with no height in OSM; counted, not patched per record';
  writeFileSync(BLOG, JSON.stringify(blog, null, 1));
  // the index of places (one entry per place built)
  const IX = join(OUTROOT, 'index.json'), ix = existsSync(IX) ? JSON.parse(readFileSync(IX, 'utf8')) : { format: 'places-index-1', about: 'Places on the globe built as 3D Tiles 1.1 by cwplans/tools/build-place-tiles.mjs; read by docklands/globe/places.js', places: [] };
  const fj = JSON.parse(readFileSync(join(OUT, 'features.json'), 'utf8'));
  // the files' base: beside index.json, or (place.outRepo) the absolute tileBase of the other repository
  // (e.g. https://danbri.github.io/docklandia/data/de/berlin/)
  const TBX = EXTOUT ? PL.tileBase.replace(/\/?$/, '/') : `${RID}/`;
  const entry = { id: RID, name: REG.name, label: fj.label, area: AREA, centre: [O.lon, O.lat], timeZone: REG.timeZone, locale: REG.locale, ...(EXTOUT ? { tileBase: TBX } : {}), tileset: `${TBX}tileset.json`, features: `${TBX}features.json`, readme: `${TBX}README.md`, provenance: `${TBX}provenance/log.json`, credit: lod ? lod.credit : fj.credit, buildings: fj.buildings.filter(Boolean).length, ...(fj.lod2 ? { buildings_lod2: fj.lod2.buildings } : {}), built: (lod?.at || a3.at) || null, ...(lod ? { surround: `${TBX}surround.json`, extent: EXT.map(r7), city: CITY, city_buildings: lod.cityBuildings } : {}), ...(EXTOUT && PL.views ? { view: `ll=${PL.views[0].ll}&ht=${PL.views[0].ht}` } : {}), ...(PL.views ? { views: PL.views } : {}) };
  ix.places = ix.places.filter(p => p.id !== RID).concat(entry).sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(IX, JSON.stringify(ix, null, 1));
  let tot = 0; for (const f of readdirSync(join(OUT, 'tiles'))) tot += readFileSync(join(OUT, 'tiles', f)).length;
  writeReadmes();
  console.log(`done: ${fj.tiles.length} tiles, ${entry.buildings} buildings, tiles ${(tot / 1e6).toFixed(2)} MB, features.json ${(readFileSync(join(OUT, 'features.json')).length / 1e6).toFixed(2)} MB`);
}

if (cmd === 'fetch' || cmd === 'all') { if (LITE) await fetchLite(); else if (BLOCKS) await fetchBlocks(); else { await fetchOsm(); await fetchDem(); await fetchHeights(); await fetchSurround(); } }
if (cmd === 'build' || cmd === 'all') await (LITE ? buildLite() : BLOCKS ? buildBlocks() : build());
// far-lod: the place-far-lod rule (place-lod.mjs farLod) applied to a built tileset whose raw inputs are gone (issue #13:
// the city blocks of Berlin, Stuttgart, Dagstuhl, Dublin, León and Sarajevo shown from 25 km, not 12 km); logged as an
// activity with the old tileset as its input
if (cmd === 'far-lod') {
  const tsf = join(OUT, 'tileset.json'), P2 = { city: PL.city?.bbox || null, block_level: 13, from_m: PL.city?.blocks_from_m ?? 25000, sse_px: 24, k_px: 731 };
  if (!P2.city) throw new Error(`region ${RID}: no place.city.bbox (no city blocks)`);
  await run({ id: 'place-far-lod', version: 1, skill: 'docklands-3d-page' }, [fileIn(tsf, 'tileset (as built by place-lod)')], P2, async p => {
    const T = JSON.parse(readFileSync(tsf, 'utf8')), n = farLod(T, p); writeFileSync(tsf, JSON.stringify(T)); console.log(`  place-far-lod: ${n} nodes now refined within ${p.from_m} m`); return [tsf]; });
  writeFileSync(BLOG, JSON.stringify(blog, null, 1));
}
if (cmd === 'readme') { if (LITE) writeLiteReadme(liteParts(), PL.parts.map(pt => JSON.parse(readFileSync(liteOut(pt).counts, 'utf8')))); writeReadmes(); }
