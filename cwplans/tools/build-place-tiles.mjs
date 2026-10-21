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
import { selectOuter, lodTree, walk, outerTile, easedDem, mul4, inv4rigid, roundM, meet } from './place-lod.mjs';
import { overture } from '../../docklands/geo/adapters/world-buildings.js';
import { blockSelector, blockTree, blockTile, worldBaseGround } from './place-blocks.mjs';
import { unpack } from '../../docklands/geo/skeleton.js';

const UA = 'glitchcan-cwplans/0.1 (https://github.com/danbri/londat)';
const TOOL = 'tools/build-place-tiles.mjs';
const CW = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), flag = f => argv.includes(f);
const argOf = k => { const i = argv.findIndex(a => a === '--' + k || a.startsWith('--' + k + '=')); if (i < 0) return null; return argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1]; };
const RID = argOf('region'); if (!RID) { console.error('usage: build-place-tiles.mjs [fetch|build] --region <id>'); process.exit(2); }
const REG = REGIONS[RID]; if (!REG) throw new Error(`no region config ${RID} (docklands/geo/regions/)`);
const PL = REG.place; if (!PL) throw new Error(`region ${RID} has no place block`);
// kind 'blocks' (Greater London): no core, no ground of its own; the buildings of a boundary as blocks by level of detail
const BLOCKS = PL.kind === 'blocks', BK = BLOCKS ? PL.blocks : null;
const cmd = ['fetch', 'build', 'readme'].find(c => argv.includes(c)) || 'all';
const RAWD = join(CW, 'data', 'raw', 'places', RID), WORK = join(RAWD, 'work');
const OUTROOT = join(CW, 'docklands', 'data', 'places'), OUT = join(OUTROOT, RID), PROV = join(OUT, 'provenance'), SRC = join(OUT, 'sources');
for (const d of [RAWD, WORK, OUT, PROV, SRC]) mkdirSync(d, { recursive: true });
const sha = b => createHash('sha256').update(b).digest('hex');
const rel = p => relative(CW, p);
const jz = (p, o) => writeFileSync(p, gzipSync(JSON.stringify(o)));
const rz = p => JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));

// ---------- the area: a square of size_m round the origin, as whole quadtree cells
const L = PL.level ?? 15, CS = 180 / 2 ** L, O = REG.origin;
const mLat = 110574, mLon = 111320 * Math.cos(O.lat * D2R), half = (PL.size_m ?? 2000) / 2;
const sq = [O.lon - half / mLon, O.lat - half / mLat, O.lon + half / mLon, O.lat + half / mLat];
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
if (!demAd && !BLOCKS) throw new Error(`region ${RID}: no adapter with a dem block`);
// the ring: a wider square (place.ring_m, default 8 km) of coarser terrain round the place, drawn by the globe between the
// place's tiles and the 10 km world terrain (globe/places.js), so a valley or a hill is not cut off at the place's edge
const RING_M = PL.ring_m ?? 8000, RING = [O.lon - RING_M / 2 / mLon, O.lat - RING_M / 2 / mLat, O.lon + RING_M / 2 / mLon, O.lat + RING_M / 2 / mLat];
// one DEM grid for a box b (row 0 = north): WCS 2.0 GeoTIFF in geographic degrees, or a window of a Copernicus GLO-30 COG
async function demGrid(b, coverage, tifOut) {
  const D = demAd.dem;
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
const natAds = hAds.filter(a => a.buildingHeights.kind === 'inspire-bu-parts'), rasAds = hAds.filter(a => a.buildingHeights.kind === 'ghsl-raster');
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
async function fetchSurround() {
  if (!SUR) return;
  const m = 0.01, B = [EXT[0] - m, EXT[1] - m, EXT[2] + m, EXT[3] + m];
  // terrain of the surroundings: the DEM adapter's surroundCoverage (WCS) or the COG tiles (Copernicus GLO-30)
  const fd = join(RAWD, 'dem-surround.bin.gz');
  if (!existsSync(fd) || flag('--refetch')) { const D = demAd.dem;
    if (D.kind === 'wcs20') {
      // the service refuses a box of about 1 x 1 degree (400): parts of at most 0.5 degree, one request at a time, 1 s
      // apart, pasted into one grid at the resolution of the first part
      const cov = D.surroundCoverage || D.ringCoverage || D.coverage, nxp = Math.ceil((B[2] - B[0]) / 0.5), nyp = Math.ceil((B[3] - B[1]) / 0.5), parts = [];
      for (let a = 0; a < nxp; a++) for (let c = 0; c < nyp; c++) { const pb = [B[0] + (B[2] - B[0]) * a / nxp, B[1] + (B[3] - B[1]) * c / nyp, B[0] + (B[2] - B[0]) * (a + 1) / nxp, B[1] + (B[3] - B[1]) * (c + 1) / nyp];
        if (parts.length) await pause(1000); parts.push(await demGrid(pb, cov, null)); }
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
    const box = Q.box === 'city' ? (CITY || AREA) : EXT, f = join(RAWD, `overture-${k}-${ov.outer.release}.json`);
    if (existsSync(f) && !flag('--refetch')) continue;
    const bb = box.map(v => v.toFixed(6));
    execFileSync(process.env[ov.outer.python] || 'python3', ['-I', join(CW, '..', ov.outer.script), ov.outer.release, Q.theme, Q.type, ...bb, f, Q.columns, Q.where], { stdio: 'inherit' });
    const R = JSON.parse(readFileSync(f, 'utf8'));
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
async function fetchHeights() {
  for (const a of rasAds) await fetchRaster(a);
  for (const a of fpAds) { const k = a.buildingHeights.kind; if (k === 'overture-buildings') await fetchOverture(a); else if (k === 'ms-buildings') await fetchMs(a); }   // overture-dataset-floors: fetchSurround (from the city buildings)
  for (const a of natAds) {
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
  if (prev && !flag('--force') && prev.outputs.every(o => existsSync(join(CW, o.path)) && sha(readFileSync(join(CW, o.path))) === o.sha256)) { console.log(`${op.id}: in the log (${act})`); return prev; }
  const t0 = Date.now(), outs = await body(params), rec = { activity: act, operation: op.id, version: op.version, skill: op.skill, tool: TOOL, inputs, params,
    outputs: outs.map(p => ({ path: rel(p), sha256: sha(readFileSync(p)), bytes: readFileSync(p).length })), ms: Date.now() - t0, at: new Date().toISOString() };
  if (rec.outputs.some(o => o.path.startsWith('data/raw'))) rec.note = 'outputs under data/raw are intermediate (not committed); their hashes fix the next step';
  blog.activities = blog.activities.filter(a => a.activity !== act).concat(rec);   // append-only (a forced re-run replaces its own record)
  console.log(`${op.id}: ran (${act}, ${rec.ms} ms)`); return rec;
}
const OPS = {
  select: { id: 'place-select-osm', version: 3, skill: 'docklands-3d-page' },     // 3: roof:shape, roof:height, roof:angle, roof:orientation kept
  heights: { id: 'place-heights', version: 4, skill: 'docklands-data-curation' },  // 2: raster heights (GHSL), roofs (OSM roof:shape, then the region's roof rule); 3: Overture and Microsoft footprints; 4: IGN floors (switch) and the validation counts
  tiles: { id: 'place-tiles', version: 5, skill: 'docklands-3d-page' },            // 4: sloped roofs (gabled, hipped, pyramidal, skillion, dome); 5: with a surround block the tileset goes to place-lod
  outer: { id: 'place-select-outer', version: 2, skill: 'docklands-3d-page' },     // 2: the extra geometry classes (IGN, Microsoft) where OSM has none. Overture (OSM-sourced) roads, rail, water, names, peaks, city buildings
  cityHeights: { id: 'place-city-heights', version: 2, skill: 'docklands-data-curation' },   // 2: counts by geometry class. The place-heights rule over the city buildings
  lod: { id: 'place-lod', version: 2, skill: 'docklands-3d-page' },
  selBlocks: { id: 'place-select-blocks', version: 2, skill: 'docklands-3d-page' },   // 2: the extra geometry classes (place.blocks.geometry: Microsoft) where OSM has none; 1: Overture buildings (OSM geometry) in a boundary, outside the model boxes; non-OSM height values by dataset
  blocks: { id: 'place-blocks', version: 3, skill: 'docklands-3d-page' },            // 3: a class index per block (OpenStreetMap, merged, the extra geometry classes), counts by class; 2: merged boxes grow with the built share of their square; 1: the block tree (merged boxes by square at the coarse levels; boxes, outlines and named buildings at the leaves)                // 2: block metadata in glb extras (class, height, its source), counts by class. The tile tree: core leaves, city blocks, surroundings terrain
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
  const polys = [];   // [id, tags, rings]
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
  // building outlines that hold parts (Simple 3D Buildings: the parts are drawn, the outline is not)
  const parts = out.buildings.filter(b => b.part);
  // (a part without a name takes its outline's name, address and Wikidata id, and names the outline as its parent: the
  // text interface then names the building, e.g. a town hall drawn only as parts)
  for (const b of out.buildings) if (!b.part) { const mine = parts.filter(p => inPoly(p.c, b.rings)); b.has_parts = mine.length > 0;
    for (const p of mine) { p.parent = b.id; p.name ||= b.name; p.alt ||= b.alt; p.addr ||= b.addr; p.wikidata ||= b.wikidata; } }
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
  for (const p of nat) { const c = centroid(p.ring), a = Math.abs(ringArea(p.ring)); p.c = c; p.a = a; const k = gk(...c); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
  const natFloors = rings => { const r = rings[0]; let w0 = Infinity, s0 = Infinity, e0 = -Infinity, n0 = -Infinity; for (const [x, y] of r) { w0 = Math.min(w0, x); e0 = Math.max(e0, x); s0 = Math.min(s0, y); n0 = Math.max(n0, y); }
    const got = []; for (let i = Math.floor(w0 / 0.0005); i <= Math.floor(e0 / 0.0005); i++) for (let j = Math.floor(s0 / 0.0005); j <= Math.floor(n0 / 0.0005); j++) for (const p of grid.get(i + ',' + j) || []) if (inPoly(p.c, rings)) got.push(p);
    if (!got.length) return null; got.sort((a, b) => a.floors - b.floors); const tot = got.reduce((s, p) => s + p.a, 0); let acc = 0; for (const p of got) { acc += p.a; if (acc >= tot / 2) return { floors: p.floors, parts: got.length }; } return null; };
  const ras = rasters.map(g => ({ label: g.label, at: rasterSampler(g) })), fx = fps.map(f => ({ ...f, match: footprintIndex(f) }));
  const fpKeys = fx.flatMap(f => f.label === 'overture' ? ['overture-height', 'overture-floors'] : [f.label]);
  // validation of a floors source against the national floors and OSM building:levels on the buildings that have both
  const V = {}, vadd = (src, other, a, b) => { const o = V[src] ||= {}, x = o[other] ||= { n: 0, same: 0, within1: 0, sum_diff: 0, sum_abs: 0, max_abs: 0, hist: {} }, d = a - b;
    x.n++; if (d === 0) x.same++; if (Math.abs(d) <= 1) x.within1++; x.sum_diff += d; x.sum_abs += Math.abs(d); x.max_abs = Math.max(x.max_abs, Math.abs(d)); const hk = d > 3 ? '>3' : d < -3 ? '<-3' : String(d); x.hist[hk] = (x.hist[hk] || 0) + 1; };
  const H = {}, F = { 'osm-height': 0, 'osm-levels': 0, national: 0, ...Object.fromEntries(fpKeys.filter(k => k === 'overture-ign-floors').map(k => [k, 0])), ...Object.fromEntries(fpKeys.filter(k => k !== 'overture-ign-floors').map(k => [k, 0])), 'default-small': 0, ...Object.fromEntries(ras.map(r => [r.label, 0])), default: 0, 'levels-vs-national-2plus': 0, 'national-zero-floors': 0 };
  const M = Object.fromEntries(fx.map(f => [f.label, { rows: f.rows.length, matched: 0, matched_osm_had_height: 0 }]));
  const R = { osm: {}, ...Object.fromEntries(fx.filter(f => f.label === 'overture').map(f => [f.label, {}])), rule: {}, flat: 0, 'osm-flat-tag': 0, 'osm-unknown-shape': 0, 'with-holes-flat': 0, 'rule-irregular-flat': 0, 'rule-large-flat': 0, 'rule-tall-flat': 0, 'rule-kind-flat': 0 };
  const RR = P.roof_rule, top = new Set(['osm-height', 'overture-height', ...fx.filter(f => f.top).map(f => f.label), ...ras.map(r => r.label)]);
  for (let b of sel.buildings) {
    let h = null, src = null; const nf = nat.length ? natFloors(b.rings) : null;
    const fm = {}; for (const f of fx) { const q = f.match(b.rings); if (q) { fm[f.label] = q; M[f.label].matched++; if (b.height > 0 || b.levels > 0) M[f.label].matched_osm_had_height++; } }
    const ov = fm.overture, ms = fm.ms, ign = fm['overture-ign-floors'];
    if (b.height != null && b.height > 0) { h = b.height; src = 'osm-height'; }
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

// ---------- operation 3: tiles (pure: selected OSM, heights, DEM, geoid -> glb per cell, tileset.json, features.json)
async function buildTiles(sel, HT, dem, geoidAt, P, ringDem) {
  const demAt = demSampler(dem), Ng = geoidAt(O.lon, O.lat);
  const ell = (lon, lat) => demAt(lon, lat) + Ng;   // ellipsoidal ground height (DEM datum taken as EGM96 orthometric: stated)
  rmSync(join(OUT, 'tiles'), { recursive: true, force: true }); mkdirSync(join(OUT, 'tiles'), { recursive: true });
  const outFiles = [], children = [], feats = [], tileStats = [];
  const used = new Set(Object.values(HT).map(x => x.src));
  const usedAd = a => { const k = a.buildingHeights.kind; return k === 'ghsl-raster' ? used.has(a.buildingHeights.label) : k === 'overture-buildings' ? used.has('overture-height') || used.has('overture-floors') || Object.values(HT).some(x => x.roof_src === 'overture') : k === 'ms-buildings' ? used.has('ms') : true; };
  const credit = [`© OpenStreetMap contributors (ODbL 1.0)`, demAd.dem.credit, ...hAds.filter(usedAd).map(a => a.buildingHeights.credit)].join('; ');
  // features (buildings drawn), ids are their index
  const drawn = sel.buildings.filter(b => !(b.has_parts && !b.part));
  const bIndex = new Map(); drawn.forEach((b, i) => bIndex.set(b.id, i));
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
    for (const hh of hv) { hMin = Math.min(hMin, hh - P.skirt_m); hMax = Math.max(hMax, hh); }
    // drop degenerate triangles (a shared roof vertex used twice, a zero-length outline edge): the glTF validator counts them
    const bk = []; for (let k = 0; k < bi.length; k += 3) { const [x, y, z] = [bi[k], bi[k + 1], bi[k + 2]]; if (x === y || y === z || x === z) continue;
      const p3 = i => bp.slice(3 * i, 3 * i + 3), A = p3(x), B = p3(y), C = p3(z), u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      if (Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) < 1e-6) continue; bk.push(x, y, z); }
    bi.length = 0; for (const x of bk) bi.push(x);
    const bytes = glb([{ name: 'ground', pos: gp, nrm: gn, uv: guv, idx: gi, png }, { name: 'buildings', pos: bp, col: bc2, fid: bf, idx: bi }], credit);
    const file = join(OUT, 'tiles', cell.key + '.glb'); writeFileSync(file, bytes); outFiles.push(file);
    const cellH = [Math.min(...hv) - P.skirt_m, Math.max(h0, ...hv) + Math.max(0, ...drawn.filter(b => feats[bIndex.get(b.id)]?.tile === cell.key).map(b => HT[b.id].h))];
    children.push({ boundingVolume: { region: [w * D2R, s * D2R, e * D2R, n * D2R, Math.round(cellH[0]), Math.ceil(cellH[1] + 2)] }, geometricError: 0, refine: 'ADD', transform: F.matrix().map(v => Math.round(v * 1e9) / 1e9), content: { uri: `tiles/${cell.key}.glb` } });
    tileStats.push({ key: cell.key, buildings: nb, triangles: (gi.length + bi.length) / 3, bytes: bytes.length });
  }
  const tileset = { asset: { version: '1.1', generator: 'cwplans build-place-tiles.mjs', tilesetVersion: P.version_label, extras: { place: RID, name: REG.name, credit } },
    geometricError: 2000,
    root: { boundingVolume: { region: [AREA[0] * D2R, AREA[1] * D2R, AREA[2] * D2R, AREA[3] * D2R, Math.floor(hMin), Math.ceil(hMax)] }, geometricError: 400, refine: 'ADD', children } };
  // with a surround block the tileset is written by place-lod (the core tiles are the leaves of its tree): this one is an intermediate
  const tsf = SUR ? join(WORK, 'core-tileset.json') : join(OUT, 'tileset.json'); writeFileSync(tsf, JSON.stringify(tileset, null, 1)); outFiles.push(tsf);
  // features.json: the text and machine interface of the place (names, heights and their source; streets; named points)
  const B = feats.map((f, i) => f && [f.b.id, f.b.name, f.b.addr, f.b.kind, f.b.c[0], f.b.c[1], f.H.h, f.H.src, f.b.levels ?? f.H.nat_floors ?? null, f.tile, f.ground, f.b.wikidata || null, f.b.alt || null, f.b.parent || null, f.H.roof ? f.H.roof + (f.H.roof_src === 'rule' ? ' (rule)' : '') : 'flat']);
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
    buildings_fields: ['osm_id', 'name', 'address', 'kind', 'lon', 'lat', 'height_m', 'height_source', 'levels', 'tile', 'ground_m', 'wikidata', 'name_alt', 'parent', 'roof'], buildings: B,
    streets_fields: ['name', 'kind', 'lon', 'lat', 'name_alt'], areas_fields: ['name', 'kind', 'lon', 'lat', 'name_alt'], streets: [...streets.values()].sort((a, b) => a[0].localeCompare(b[0])),
    areas: areasN, points_fields: ['osm_id', 'name', 'kind', 'lon', 'lat', 'address', 'name_alt'], points: sel.points.map(p => [p.id, p.name, p.kind, p.lon, p.lat, p.addr, p.alt || null]), tiles: tileStats };
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
    const R = REGIONS[p.id], dir = join(OUTROOT, p.id), lf = join(dir, 'provenance', 'log.json'); if (!R || !existsSync(lf)) continue;
    const log = JSON.parse(readFileSync(lf, 'utf8')), last = op => log.activities.filter(a => a.operation === op).at(-1);
    const L = [], BL = R.place.kind === 'blocks';
    L.push(`# ${R.name}: a place on the globe (3D Tiles 1.1)`, '',
      `Made by [cwplans/tools/build-place-tiles.mjs](${GH}tools/build-place-tiles.mjs) for the region config [docklands/geo/regions/${p.id}.js](https://github.com/danbri/londat/blob/main/docklands/geo/regions/${p.id}.js); drawn by the globe of the Three.js port ([docklands/globe/places.js](https://github.com/danbri/londat/blob/main/docklands/globe/places.js)).`,
      `This README is generated from \`provenance/log.json\` and [cwplans/data-register.json](${GH}data-register.json) by \`node cwplans/tools/build-place-tiles.mjs readme --region ${p.id}\` (also at the end of each build). Do not edit it by hand.`, '',
      ...(BL ? [`- The whole city (20 km out): ${SITE}docklands/?ll=${p.centre[1]},${p.centre[0]},20000&ht=0,45`, ...(R.place.views || []).map(v => `- ${v.name}: ${SITE}docklands/?ll=${v.ll}&ht=${v.ht || '0,55'}`),
        `- A place of kind "blocks": no core and no ground of its own (the globe's terrain and imagery stay); buildings in the model box of ${(R.place.exclude || []).join(', ')} are left to that model`] : [`- Live view: ${view(p)}`]), ...(R.place.surround ? [`- The city (8 km out): ${SITE}docklands/?ll=${p.centre[1]},${p.centre[0]},8000&ht=0,50`, `- The surroundings (30 km out): ${SITE}docklands/?ll=${p.centre[1]},${p.centre[0]},30000&ht=0,45`] : []), `- Area (WGS84 degrees, west, south, east, north): ${p.area.join(', ')}; ${p.buildings} buildings; built ${p.built}`,
      `- Credit shown on the page: ${p.credit}`, `- Skill: docklands-3d-page, "Three.js port: places as 3D Tiles (2026-10-18)"; fault F55 in the docklands-data-curation skill`, '');
    // files
    L.push('## Files', '', '| path | what | bytes | SHA-256 |', '|---|---|---|---|');
    const what = f => f === 'tileset.json' ? (R.place.surround ? '3D Tiles 1.1 tileset: a quadtree with REPLACE refinement (surroundings, city, core), ENU transforms relative to the parent, region bounding volumes, geometric errors' : '3D Tiles 1.1 tileset: one child per quadtree cell, ENU -> ECEF transform, region bounding volume')
      : f === 'surround.json' ? 'the text and machine interface of the city and the surroundings: ground grid, place names and peaks, rivers, roads, tiers, per-tile counts'
      : f.startsWith('tiles/') ? (/^tiles\/15-/.test(f) && coreKeys.has(f.slice(6, -4)) ? 'glTF 2.0 core tile: ground heightfield with a JPEG texture, buildings with roofs, _FEATURE_ID_0 = row of features.json' : 'glTF 2.0 tile of the city or the surroundings: terrain grid with a JPEG texture (land cover, water, roads, rail), city blocks (KHR_mesh_quantization, EXT_mesh_gpu_instancing)')
      : f === 'tiles/*.glb' ? 'glTF 2.0 block tiles (one per quadtree cell with buildings): oriented boxes as EXT_mesh_gpu_instancing instances of one unit box, simplified outlines, named buildings with _FEATURE_ID_0 (row of features.json), merged boxes by square at the coarse levels; KHR_mesh_quantization; glb extras.blocks for the block card. Bytes: the sum; SHA-256: of the list of file names and their SHA-256'
      : f === 'features.json' ? (BL ? 'the text and machine interface: the named buildings drawn with their own id (name, height and its source, OSM id), the block counts by level' : 'the text and machine interface: buildings (height and its source, roof), streets, areas, points, ground and ring grids')
      : f === 'provenance/log.json' ? 'fetch records and dataflow activities (inputs and outputs by SHA-256), height-source and roof counts'
      : f.startsWith('sources/') ? 'committed source extract (input of an operation; see Sources)' : '';
    const files = [];
    const coreKeys = new Set(), t = last('place-tiles'); if (t) for (const o of t.outputs) { const f = o.path.replace(`docklands/data/places/${p.id}/`, ''); if (f.startsWith('tiles/')) coreKeys.add(f.slice(6, -4)); if (!f.startsWith('data/raw')) files.push(f); }
    const lo = last('place-lod'); if (lo && R.place.surround) for (const o of lo.outputs) files.push(o.path.replace(`docklands/data/places/${p.id}/`, ''));
    const bo = last('place-blocks'); if (bo && BL) { for (const o of bo.outputs) { const f = o.path.replace(`docklands/data/places/${p.id}/`, ''); if (!f.startsWith('tiles/')) files.push(f); } files.unshift('tiles/*.glb'); }
    if (existsSync(join(dir, 'sources'))) for (const f of readdirSync(join(dir, 'sources')).sort()) files.push('sources/' + f);
    files.push('provenance/log.json');
    const tdir = join(dir, 'tiles'), tlist = f => f === 'tiles/*.glb' && existsSync(tdir) ? readdirSync(tdir).filter(x => x.endsWith('.glb')).sort() : null;
    for (const f of files) { const tl = tlist(f);
      if (tl) { L.push(`| [tiles/](${GH}docklands/data/places/${p.id}/tiles) (${tl.length} files) | ${what(f)} | ${tl.reduce((a, x) => a + size(join(tdir, x)), 0)} | \`${sha(tl.map(x => x + ' ' + sha(readFileSync(join(tdir, x)))).join('\n'))}\` |`); continue; }
      const fp = join(dir, f); if (!existsSync(fp)) continue; L.push(`| [${f}](${GH}docklands/data/places/${p.id}/${f}) | ${what(f)} | ${size(fp)} | \`${sha(readFileSync(fp))}\` |`); }
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
      L.push(`- Stored for the build: \`${rec.file}\`, ${rec.bytes} bytes, SHA-256 \`${rec.sha256}\` — ${rec.committed ? `committed (\`${rec.committed.replace(`docklands/data/places/${p.id}/`, '')}\`)` : 'NOT committed (raw folder, git-ignored)'}`);
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
    if (log.tiers && BL) { L.push('## Levels of detail', '', '| level | tiles | MB | triangles | boxes | outlines | named | merged boxes (buildings in them) |', '|---|---|---|---|---|---|---|---|');
      for (const [k, v] of Object.entries(log.tiers)) L.push(`| ${k.replace('level ', '')} | ${v.tiles} | ${(v.bytes / 1e6).toFixed(2)} | ${v.triangles.toLocaleString('en')} | ${v.boxes.toLocaleString('en')} | ${v.outlines.toLocaleString('en')} | ${v.named} | ${v.merged.toLocaleString('en')} (${v.merged_buildings.toLocaleString('en')}) |`);
      L.push('', `Loaded by screen-space error (docklands/globe/places.js): far views draw the coarse levels (tall and big buildings as their own boxes, the rest merged into one box per square), near views every building of the leaf cell. ${log.blocks ? `${log.blocks.buildings.toLocaleString('en')} buildings drawn at the leaf level, ${log.blocks.named.toLocaleString('en')} of them named with their own id.` : ''}`, '',
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
    if (R.adapters.find(a => a.dem?.source === 'copernicus-glo30' && a.id === R.place.dem)) rv.push('- Copernicus DEM GLO-30: its full credit ends "all rights reserved" (CLAUDE.md); accepted by the owner on 2026-10-20 ("Data - is fine for now"); re-check before the prototyping phase ends.');
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
    M.push(`| ${p.name} | ${view(p)} | ${p.buildings} | ${kb(tot)} | [${p.id}/README.md](${GH}docklands/data/places/${p.id}/README.md) |`); }
  M.push('', `Data register entries: [DATA-REGISTER.md](${GH}DATA-REGISTER.md) (search "docklands/data/places").`, '');
  writeFileSync(join(OUTROOT, 'README.md'), M.join('\n'));
  console.log('readme: places/README.md and', ix.places.map(p => p.id + '/README.md').join(', '));
}

// ---------- the city and the surroundings: three more operations (place-select-outer, place-city-heights, place-lod)
async function buildOuter(fGeoid, natFiles, rasFiles) {
  const ov = REG.adapters.find(a => a.id === SUR.outer && a.outer), lcAd = REG.adapters.find(a => a.id === SUR.land_cover && a.landCover);
  const qf = k => join(RAWD, `overture-${k}-${ov.outer.release}.json`), fDemS = join(RAWD, 'dem-surround.bin.gz'), fLc = join(RAWD, 'landcover.bin.gz');
  const ovIn = Object.keys(ov.outer.queries).filter(k => existsSync(qf(k)));
  for (const f of [fDemS, fLc]) if (!existsSync(f)) throw new Error(`missing ${rel(f)}: run fetch first`);
  const ignAd = fpAds.find(a => a.buildingHeights.kind === 'overture-dataset-floors');
  // the extra geometry classes of the city ring (switch: their ids in place.surround.geometry)
  const geoAds = (SUR.geometry || []).map(id => REG.adapters.find(a => a.id === id && a.geometry)).filter(Boolean);
  // 4. place-select-outer: Overture answers -> roads, rail, water, names, peaks, city buildings (OSM geometry), footprint heights
  const fOut = join(WORK, 'outer.json.gz');
  const SP = { licences: overture?.buildingHeights?.licences || ['ODbL-1.0', 'CDLA-Permissive-2.0', 'CDLA-Permissive-1.0', 'CC-BY-4.0', 'CC0-1.0'], ignDataset: ignAd ? ignAd.buildingHeights.dataset : null, geometrySources: SUR.geometry_sources || ov.outer.geometry_sources, extraGeometry: geoAds.map(a => ({ cls: a.geometry.cls, dataset: a.geometry.dataset })), altKeys: (PL.alt_names || []).map(k => k.replace(/^name:/, '')).concat(['sr-Cyrl']) };
  await run(OPS.outer, ovIn.map(k => fileIn(qf(k), 'overture-' + k)), SP, async p => {
    const raw = Object.fromEntries(ovIn.map(k => [k, JSON.parse(readFileSync(qf(k), 'utf8'))])), o = selectOuter(raw, p);
    for (const b of o.buildings) b.c = centroid(open(b.rings[0]));
    jz(fOut, o); console.log('  outer:', JSON.stringify(o.counts)); return [fOut]; });
  const outer = rz(fOut);
  // 5. place-city-heights: the core's height rule over the city's buildings (no roof rule: blocks are flat)
  const fCH = join(WORK, 'city-heights.json.gz'), fMs = join(RAWD, 'ms-city.json.gz'), fIgn = ignAd ? fpFile(ignAd) : null;
  const msIn = existsSync(fMs) ? [fileIn(fMs, 'ms-city')] : [], ignIn = fIgn && existsSync(fIgn) ? [fileIn(fIgn, 'overture-ign-floors')] : [];
  const CP = { storey_m: 3, national_storey_m: natAds[0]?.buildingHeights.storey_m ?? 3, default_m: PL.default_height_m ?? 9, default_small_m: 3, raster_min_m: 3, roof_rule: null, pitch_deg: 30, max_roof_m: 8,
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
    ext: EXT.map(r7), top: TOP, refine: SUR.refine, city: CITY, version_label: `${RID}-2`,
    colours: { water: '#4f86ab', footprint: '#8d877d', block: '#d6cbb6' },
    roads: { motorway: { width_m: 26, min_px: 1.8, colour: '#d9825f', casing: '#7e5a46', min_level: 0 }, trunk: { width_m: 20, min_px: 1.6, colour: '#e3a165', casing: '#7e5f46', min_level: 0 },
      primary: { width_m: 16, min_px: 1.4, colour: '#ecc77e', casing: '#86704f', min_level: 0 }, secondary: { width_m: 13, min_px: 1.1, colour: '#f2dea0', min_level: 0 },
      tertiary: { width_m: 10, min_px: 0.8, colour: '#f4efe2', min_level: 11 }, streets: { width_m: 7, min_px: 0.6, colour: '#f7f4ec', min_level: 13 }, rail: { width_m: 5, min_px: 1, colour: '#5f5a55', min_level: 0 } } };
  const credit = [`© OpenStreetMap contributors (ODbL 1.0)`, demAd.dem.credit, ov.outer.credit, ...geoAds.map(a => a.geometry.credit), lcAd?.landCover.credit, ...hAds.map(a => a.buildingHeights.credit)].filter(Boolean).join('; ');
  const a6 = await run(OPS.lod, [fileIn(fOut, 'outer'), fileIn(fCH, 'city-heights'), fileIn(fDemS, 'dem-surround'), fileIn(fLc, 'landcover'), fileIn(fGeoid, 'geoid'), fileIn(fCore, 'core-tileset')], { ...LP, credit }, async p => {
    const geoAt = await geoidSampler(fGeoid), demS = loadGrid(fDemS), lc = loadGrid(fLc), demAt = easedDem(demS, EXT, mLon, mLat, p.blend_m, p.box_m), core = JSON.parse(readFileSync(fCore, 'utf8'));
    const coreKids = new Map(core.root.children.map(c => [c.content.uri.match(/(\d+-\d+-\d+)\.glb/)[1], c]));
    const roots = lodTree({ ext: EXT, top: TOP, core: new Set(coreKids.keys()), coreArea: AREA, city: CITY, origin: O, mLon, mLat, refine: p.refine });
    // stale outer tiles of an earlier run go first (the core tiles are place-tiles' outputs)
    for (const f of readdirSync(join(OUT, 'tiles'))) if (!coreKids.has(f.replace('.glb', ''))) rmSync(join(OUT, 'tiles', f));
    // the city buildings by cell at each level from block_level to 15 (by centroid)
    const byCell = new Map(); for (const b of outer.buildings) { if (!CH.heights[b.id]) continue; for (let l = p.block_level; l <= 15; l++) { const cs = 180 / 2 ** l, k = `${l}-${Math.floor((b.c[0] + 180) / cs)}-${Math.floor((b.c[1] + 90) / cs)}`; (byCell.get(k) || byCell.set(k, []).get(k)).push(b); } }
    const outFiles = [], stats = [], cellNs = l => 180 / 2 ** l * mLat;
    const gridOf = l => p.grids[l] || p.grid, errOf = n => !n.kids.length ? 0 : Math.round(Math.max(2 * cellNs(n.l) / gridOf(n.l), n.l === p.block_level - 1 && CITY && meet(n.b, CITY) ? 40 : 0, n.l >= p.block_level && CITY && meet(n.b, CITY) ? 12 : 0) * 10) / 10;
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
      ground: { grid: GN, area: EXT.map(r7), h: gh, datum: demAd.dem.datum + ' (the surroundings DEM, its outer ' + p.blend_m / 1000 + ' km eased to a ' + p.box_m / 1000 + ' km box mean); add the geoid (EGM96) for WGS84 ellipsoidal heights', source: demAd.dem.source },
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
  const TP = { top: BK.top_level, leaf: BK.leaf_level, levels: BK.levels, min_area_m2: BK.min_area_m2, simplify_m: BK.simplify_m, box_fill: BK.box_fill, outline_min_m2: BK.outline_min_m2, drop_m: BK.drop_m ?? 3,
    named_min_m2: BK.named_min_m2, named_min_h_m: BK.named_min_h_m, colour: BK.colour || '#d6cbb6', version_label: `${RID}-1`, extent_box: QBOX,
    classes: ['OpenStreetMap (via Overture)', `merged ${geoAds.length ? '' : 'OpenStreetMap '}buildings (one box per square: the summed footprint, the area-weighted mean height)`, ...geoAds.map(a => a.geometry.label)],
    class_index: Object.fromEntries(geoAds.map((a, i) => [a.geometry.cls, 2 + i])), credit };
  const a3 = await run(OPS.blocks, [fileIn(fSel, 'selected'), fileIn(fH, 'heights'), gIn, fileIn(fGeoid, 'geoid')], TP, async p => {
    const geoAt = await geoidSampler(fGeoid), G = worldBaseGround(GM, (L, x, y) => { const b = readFileSync(join(gdir, GM.dem.url.replace('{z}', L).replace('{x}', x).replace('{y}', y))); return new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); });
    const B = buildings.filter(b => b.a >= p.min_area_m2 && HT[b.id] && HT[b.id].h > 0);
    const named = new Map(), rows = [];
    for (const b of B) if (b.name && (b.a >= p.named_min_m2 || HT[b.id].h >= p.named_min_h_m)) { named.set(b.id, rows.length); rows.push(b); }
    const T = blockTree({ buildings: B, top: p.top, leaf: p.leaf });
    rmSync(join(OUT, 'tiles'), { recursive: true, force: true }); mkdirSync(join(OUT, 'tiles'), { recursive: true });
    const outFiles = [], stats = []; let nT = 0; const total = T.nodes.size;
    async function tile(n, parentWorld) {
      const leaf = n.l === p.leaf, LP = leaf ? { min_area_m2: p.min_area_m2, simplify_m: p.simplify_m, box_fill: p.box_fill, outline_min_m2: p.outline_min_m2, drop_m: p.drop_m } : { ...p.levels[n.l], min_area_m2: p.min_area_m2, drop_m: p.drop_m };
      const r = blockTile({ cell: n, items: n.items.map(i => B[i]), HT, groundAt: G.at, geoidAt: geoAt, P: LP, leaf, named: leaf ? named : null, classes: p.classes, classIndex: p.class_index, colour: p.colour, credit: p.credit });
      const f = join(OUT, 'tiles', n.key + '.glb'); writeFileSync(f, r.bytes); outFiles.push(f); stats.push(r.stats); if (++nT % 200 === 0) console.log(`  place-blocks: ${nT} / ${total} tiles`);
      const world = r.F.matrix(); let region = r.region; const kids = []; for (const k of n.kids) kids.push(await tile(k, world));
      for (const k of kids) region = [region[0], region[1], region[2], region[3], Math.min(region[4], k.boundingVolume.region[4]), Math.max(region[5], k.boundingVolume.region[5])];
      const t = { boundingVolume: { region: region.map(v => +v.toPrecision(12)) }, geometricError: leaf ? 0 : p.levels[n.l].err_m, refine: 'REPLACE', transform: roundM(parentWorld ? mul4(inv4rigid(parentWorld), world) : world).map((v, i) => i >= 12 ? v : +v.toPrecision(10)), content: { uri: `tiles/${n.key}.glb` } };   // rotation to 10 digits (under 1 mm at the Earth's radius)
      if (kids.length) t.children = kids; return t;
    }
    const children = []; for (const n of T.roots) children.push(await tile(n, null));
    let lo = Infinity, hi = -Infinity, ext = [Infinity, Infinity, -Infinity, -Infinity]; for (const c of children) { lo = Math.min(lo, c.boundingVolume.region[4]); hi = Math.max(hi, c.boundingVolume.region[5]); }
    for (const n of T.roots) ext = [Math.min(ext[0], n.b[0]), Math.min(ext[1], n.b[1]), Math.max(ext[2], n.b[2]), Math.max(ext[3], n.b[3])];
    const rootErr = p.levels[p.top].err_m * 2;
    const tileset = { asset: { version: '1.1', generator: 'cwplans build-place-tiles.mjs (place-blocks)', tilesetVersion: p.version_label, extras: { place: RID, name: REG.name, kind: 'blocks', credit: p.credit, tiers: `blocks: merged boxes by square from level ${p.top}, every building from level ${p.leaf}; no ground (the globe's terrain)` } },
      geometricError: rootErr * 2, root: { boundingVolume: { region: [ext[0] * D2R, ext[1] * D2R, ext[2] * D2R, ext[3] * D2R, lo, hi].map(v => +v.toPrecision(12)) }, geometricError: rootErr, refine: 'REPLACE', children } };
    const tsf = join(OUT, 'tileset.json'); writeFileSync(tsf, JSON.stringify(tileset)); outFiles.push(tsf);
    // features.json: the named buildings drawn with their own id (search, cards, featuresAt, describeView); no ground grid
    const leafKey = b => { const cs = 180 / 2 ** p.leaf; return `${p.leaf}-${Math.floor((b.c[0] + 180) / cs)}-${Math.floor((b.c[1] + 90) / cs)}`; };
    const Bf = rows.map(b => { const H = HT[b.id]; return [b.osm || b.id, b.name, null, b.kind, b.c[0], b.c[1], H.h, H.src, b.levels ?? null, leafKey(b), Math.round(G.at(b.c[0], b.c[1]) * 10) / 10, null, null, null, 'flat']; });
    const tiers = {}; for (const s2 of stats) { const o = tiers['level ' + s2.level] ||= { tiles: 0, bytes: 0, triangles: 0, boxes: 0, outlines: 0, named: 0, merged: 0, merged_buildings: 0, by_class: {} }; o.tiles++; for (const k of ['bytes', 'triangles', 'boxes', 'outlines', 'named', 'merged', 'merged_buildings']) o[k] += s2[k] || 0; for (const [c, v] of Object.entries(s2.by_class || {})) o.by_class[c] = (o.by_class[c] || 0) + v; }
    const byClass = {}; for (const b of B) byClass[b.cls || 'osm'] = (byClass[b.cls || 'osm'] || 0) + 1;
    const fj = { format: 'place-features-1', kind: 'blocks', place: RID, name: REG.name, label: PL.label || REG.name, search: PL.search || [], timeZone: REG.timeZone, locale: REG.locale, origin: REG.origin, area: bnd.bbox, extent: ext.map(r7), level: p.leaf,
      geoid_m: Math.round(geoAt(REG.origin.lon, REG.origin.lat) * 100) / 100, credit: p.credit,
      note: 'a place of kind blocks: the buildings are drawn as blocks (tiles); this file lists the named buildings drawn with their own id (_FEATURE_ID_0 = row); ground_m = the globe\'s ground (world-base heights, metres above the geoid)',
      buildings_fields: ['osm_id', 'name', 'address', 'kind', 'lon', 'lat', 'height_m', 'height_source', 'levels', 'tile', 'ground_m', 'wikidata', 'name_alt', 'parent', 'roof'], buildings: Bf,
      streets_fields: ['name', 'kind', 'lon', 'lat', 'name_alt'], streets: [], areas_fields: ['name', 'kind', 'lon', 'lat', 'name_alt'], areas: [], points_fields: ['osm_id', 'name', 'kind', 'lon', 'lat', 'address', 'name_alt'], points: [], tiles: [],
      blocks: { buildings: B.length, named: rows.length, by_class: byClass, tiers } };
    const ff = join(OUT, 'features.json'); writeFileSync(ff, JSON.stringify(fj)); outFiles.push(ff);
    console.log('  tiers:', JSON.stringify(tiers)); console.log(`  world-base height tiles read: ${G.used.size}`);
    return outFiles; });
  // the committed log, the index entry, the READMEs
  const fj = JSON.parse(readFileSync(join(OUT, 'features.json'), 'utf8')), SEL = rz(fFp).counts;
  blog.about = `Build log of the place ${RID} (${REG.name}, kind blocks) by cwplans/tools/build-place-tiles.mjs: what was fetched (URL, date, SHA-256) and each dataflow activity with its input and output hashes. Raw files stay in cwplans/data/raw/places/${RID}/ (not committed).`;
  blog.fetches = flog; blog.selection = SEL; blog.height_sources = HZ.faults; blog.footprint_matches = HZ.matches; blog.tiers = fj.blocks.tiers; blog.blocks = { buildings: fj.blocks.buildings, named: fj.blocks.named, by_class: fj.blocks.by_class };
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

// ---------- the build: three operations (six with a surround block)
async function build() {
  const fOsm = join(RAWD, 'osm.json.gz'), fDem = join(RAWD, 'dem.json.gz'), fGeoid = join(CW, 'docklands', 'data', 'world', 'geoid-egm96-1deg.png');
  for (const f of [fOsm, fDem]) if (!existsSync(f)) throw new Error(`missing ${rel(f)}: run fetch first`);
  const P = { area: AREA, level: L, names: PL.names || ['name'], alt_names: PL.alt_names || [] };
  const fSel = join(WORK, 'select.json.gz');
  const a1 = await run(OPS.select, [fileIn(fOsm, 'osm')], P, async p => { const sel = selectOsm(rz(fOsm), p.names, p.alt_names); jz(fSel, sel); console.log(`  ${sel.buildings.length} buildings and parts, ${sel.areas.length} areas, ${sel.lines.length} lines, ${sel.points.length} named points`); return [fSel]; });
  const natFiles = natAds.map(a => join(RAWD, `heights-${a.id}.json.gz`)).filter(existsSync), rasFiles = rasAds.map(a => [a, rasFile(a)]).filter(([, f]) => existsSync(f));
  const fpFiles = fpAds.map(a => [a, fpFile(a)]).filter(([, f]) => existsSync(f));
  const HP = { storey_m: 3, national_storey_m: natAds[0]?.buildingHeights.storey_m ?? 3, default_m: PL.default_height_m ?? 9, default_small_m: 3, raster_min_m: 3, rasters: rasFiles.map(([a]) => a.buildingHeights.label),
    footprints: fpFiles.map(([a]) => ({ label: a.buildingHeights.label, min_area_ratio: a.buildingHeights.min_area_ratio, top_includes_roof: !!a.buildingHeights.top_includes_roof })),
    roof_rule: PL.roof_rule || null, pitch_deg: 30, max_roof_m: 8,
    rule: 'height: osm height > osm building:levels x storey > national floors (area-weighted median of the parts whose centroid is inside) x storey > Overture height > Overture num_floors x storey (non-OSM records with an open licence) > Microsoft height (footprint match: a centroid inside the other outline, area ratio >= min_area_ratio) > small kinds 3 m > raster cell under the centroid (min raster_min_m) > default. roof: osm roof:shape > Overture roof_shape > roof_rule > flat' };
  const fH = join(WORK, 'heights.json.gz');
  const a2 = await run(OPS.heights, [fileIn(fSel, 'selected'), ...natFiles.map(f => fileIn(f, 'national-heights')), ...rasFiles.map(([, f]) => fileIn(f, 'raster-heights')), ...fpFiles.map(([, f]) => fileIn(f, 'footprint-heights'))], HP, async p => {
    const nat = natFiles.flatMap(f => rz(f).parts), ras = rasFiles.map(([a, f]) => ({ ...JSON.parse(readFileSync(f, 'utf8')), label: a.buildingHeights.label }));
    const fps = fpFiles.map(([a, f]) => ({ label: a.buildingHeights.label, top: !!a.buildingHeights.top_includes_roof, min_area_ratio: a.buildingHeights.min_area_ratio, rows: footprintRows(JSON.parse(readFileSync(f, 'utf8'))) }));
    const r = heightsOf(rz(fSel), nat, ras, p, fps); jz(fH, r); console.log('  footprint matches:', JSON.stringify(r.matches)); console.log('  height sources and faults:', JSON.stringify(r.faults)); console.log('  roofs:', JSON.stringify(r.roofs)); return [fH]; });
  const TP = { grid: 32, tex: 512, jpeg: 82, skirt_m: 300, version_label: `${RID}-1` };
  const fRing = join(RAWD, 'dem-ring.json.gz'), ringIn = RING_M && !SUR && existsSync(fRing) ? [fileIn(fRing, 'dem-ring')] : [];   // the ring is replaced by the surroundings
  const a3 = await run(OPS.tiles, [fileIn(fSel, 'selected'), fileIn(fH, 'heights'), fileIn(fDem, 'dem'), fileIn(fGeoid, 'geoid'), ...ringIn], { ...TP, ring_m: ringIn.length ? RING_M : 0, ring_grid: 97 }, async p => {
    const geo = await geoidSampler(fGeoid); return buildTiles(rz(fSel), rz(fH).heights, rz(fDem), geo, p, ringIn.length ? rz(fRing) : null); });
  const lod = SUR ? await buildOuter(fGeoid, natFiles, rasFiles) : null;
  // the committed log: fetch records (no local paths of raw files beyond their names), the activities, the fault counts
  const HZ = rz(fH);
  blog.about = `Build log of the place ${RID} (${REG.name}) by cwplans/tools/build-place-tiles.mjs: what was fetched (URL, date, SHA-256) and each dataflow activity with its input and output hashes. Raw files stay in cwplans/data/raw/places/${RID}/ (not committed).`;
  blog.fetches = flog; blog.height_sources = HZ.faults; blog.roofs = HZ.roofs; blog.footprint_matches = HZ.matches || null; blog.validation = HZ.validation || null; if (lod) { blog.city_height_sources = lod.cityHeights.faults; blog.city_footprint_matches = lod.cityHeights.matches; blog.city_validation = lod.cityHeights.validation; blog.outer_counts = lod.outerCounts; blog.tiers = lod.tiers; blog.city_geometry = lod.geometryClasses; } else { delete blog.tiers; } blog.fault = 'F55 (curation skill fault register): buildings with no height in OSM; counted, not patched per record';
  writeFileSync(BLOG, JSON.stringify(blog, null, 1));
  // the index of places (one entry per place built)
  const IX = join(OUTROOT, 'index.json'), ix = existsSync(IX) ? JSON.parse(readFileSync(IX, 'utf8')) : { format: 'places-index-1', about: 'Places on the globe built as 3D Tiles 1.1 by cwplans/tools/build-place-tiles.mjs; read by docklands/globe/places.js', places: [] };
  const fj = JSON.parse(readFileSync(join(OUT, 'features.json'), 'utf8'));
  const entry = { id: RID, name: REG.name, label: fj.label, area: AREA, centre: [O.lon, O.lat], timeZone: REG.timeZone, locale: REG.locale, tileset: `${RID}/tileset.json`, features: `${RID}/features.json`, readme: `${RID}/README.md`, provenance: `${RID}/provenance/log.json`, credit: lod ? lod.credit : fj.credit, buildings: fj.buildings.filter(Boolean).length, built: (lod?.at || a3.at) || null, ...(lod ? { surround: `${RID}/surround.json`, extent: EXT.map(r7), city: CITY, city_buildings: lod.cityBuildings } : {}) };
  ix.places = ix.places.filter(p => p.id !== RID).concat(entry).sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(IX, JSON.stringify(ix, null, 1));
  let tot = 0; for (const f of readdirSync(join(OUT, 'tiles'))) tot += readFileSync(join(OUT, 'tiles', f)).length;
  writeReadmes();
  console.log(`done: ${fj.tiles.length} tiles, ${entry.buildings} buildings, tiles ${(tot / 1e6).toFixed(2)} MB, features.json ${(readFileSync(join(OUT, 'features.json')).length / 1e6).toFixed(2)} MB`);
}

if (cmd === 'fetch' || cmd === 'all') { if (BLOCKS) await fetchBlocks(); else { await fetchOsm(); await fetchDem(); await fetchHeights(); await fetchSurround(); } }
if (cmd === 'build' || cmd === 'all') await (BLOCKS ? buildBlocks() : build());
if (cmd === 'readme') writeReadmes();
