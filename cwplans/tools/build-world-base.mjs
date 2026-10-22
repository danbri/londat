#!/usr/bin/env node
// World base tiles for the globe of the Three.js port (OKR KR2.2: worldwide base layers; owner, 2026-10-20: "improved
// worldwide coverage so that our detailed city testbeds are not lost in the void"): a surface-colour (imagery) pyramid and
// a terrain-height pyramid in the globe's geodetic quadtree (docs/planet-architecture.md, "Cell scheme": level L tiles of
// 180 / 2^L degrees, 2 root tiles), the same cells as the terrain patches of docklands/globe/terrain.js, so that a patch at
// level L reads the image and the heights of tile L/x/y. Worldwide at levels 0 to 4; deeper only round the testbeds (the
// region configs named by --regions), to about 19 m a pixel and 150 m between height samples within a few km of each.
//
//   node cwplans/tools/build-world-base.mjs fetch [--regions docklands,leon,sarajevo]   # EOX tiles, GLO-90 COG reads (cached)
//   node cwplans/tools/build-world-base.mjs build [--regions ...] [--q 70]                # writes cwplans/docklands/data/world-base/
//
// Sources (data register keys eox-s2cloudless-2016, copernicus-glo90):
//  - Sentinel-2 cloudless 2016 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0: the
//    WMTS tiles of layer s2cloudless (the 2016 mosaic; the later years are CC BY-NC-SA and are NOT used) in its WGS84 tile
//    matrix set (GoogleCRS84Quad: level 0 = 2 x 1 tiles of 256 px, row 0 at the north), which is our quadtree. Our tile
//    L/x/y (512 px) is the 2 x 2 EOX tiles of level L + 1, re-encoded as WebP.
//  - Copernicus DEM GLO-90 (90 m surface model, EGM2008 heights; AWS Registry of Open Data, bucket copernicus-dem-90m,
//    1 x 1 degree Cloud Optimized GeoTIFFs with 2 overviews): read by HTTP range requests, overview 2 (about 360 m) for
//    levels 7 to 10 and the full grid (90 m) for levels 11 and 12; box means into 35 x 35 samples per tile.
// Tile y counts from the NORTH (row 0 at 90 N), as WMTS and terrain.js; the vector skeletons count y from the south.
// No locale constant: the testbeds are the origins of the region configs (docklands/geo/regions/).
// Dataflow (skill cwplans-dataflow): two operations (imagery-tiles, dem-tiles) over the cached inputs, logged with the
// SHA-256 of their inputs and outputs in world-base/log.json. Method and rules: cwplans/pipeline.json build-world-base.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import REGIONS from '../../docklands/geo/regions/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const RAW = join(ROOT, arg('--raw', 'data/raw/world-base')), OUT = join(ROOT, 'cwplans/docklands/data/world-base');
const REG = arg('--regions', 'docklands,leon,sarajevo').split(',').map(id => { const r = REGIONS[id]; if (!r) throw new Error('no region ' + id); return { id, lon: r.origin.lon, lat: r.origin.lat }; });
const Q = +arg('--q', 70), PX = 512, GRID = 35;
// --add: keep the tiles already built in OUT (fetch and build only the new ones, e.g. round a new testbed) and merge the
// manifest; without it the whole set is rebuilt from the raw cache
const ADD = process.argv.includes('--add');
const built = (dir, k, ext) => ADD && existsSync(join(OUT, dir, k + ext));   // 32 cells between the 33 vertices of a terrain patch, plus one sample of border each side
const EOX = (z, row, col) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless/default/WGS84/${z}/${row}/${col}.jpg`;
const GLO = name => `https://copernicus-dem-90m.s3.amazonaws.com/${name}/${name}.tif`;
const UA = { 'User-Agent': 'londat-cwplans/0.1 (+https://github.com/danbri/londat)' };
const sha = b => createHash('sha256').update(b).digest('hex');

// which tiles: worldwide to GLOBAL_L; deeper, a tile whose nearest point is within RADIUS_KM[L] of a testbed origin
export const GLOBAL_L = 4;   // worldwide: level 4 is 11.25 degree tiles at 512 px, about 2.4 km a pixel
export const IMG_RADIUS_KM = { 5: 1500, 6: 800, 7: 400, 8: 220, 9: 100, 10: 40, 11: 15 };
export const DEM_RADIUS_KM = { 7: 300, 8: 170, 9: 80, 10: 35, 11: 15, 12: 7 };
const bounds = (L, x, y) => { const s = 180 / 2 ** L; return [-180 + x * s, 90 - (y + 1) * s, -180 + (x + 1) * s, 90 - y * s]; };   // w, s, e, n
function distKm(lon1, lat1, lon2, lat2) { const r = Math.PI / 180, a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(a))); }
const rectDist = ([w, s, e, n], p) => distKm(p.lon, p.lat, Math.min(e, Math.max(w, p.lon)), Math.min(n, Math.max(s, p.lat)));
function tilesNear(L, km) {
  const s = 180 / 2 ** L, out = new Set();
  for (const p of REG) {
    const dl = km / 111 + s, dlon = dl / Math.max(0.1, Math.cos(p.lat * Math.PI / 180));
    for (let x = Math.max(0, Math.floor((p.lon - dlon + 180) / s)); x <= Math.min(2 ** (L + 1) - 1, Math.floor((p.lon + dlon + 180) / s)); x++)
      for (let y = Math.max(0, Math.floor((90 - p.lat - dl) / s)); y <= Math.min(2 ** L - 1, Math.floor((90 - p.lat + dl) / s)); y++)
        if (rectDist(bounds(L, x, y), p) <= km) out.add(`${L}/${x}/${y}`);
  }
  return [...out];
}
export function imageryTiles() {
  const out = [];
  for (let L = 0; L <= GLOBAL_L; L++) for (let x = 0; x < 2 ** (L + 1); x++) for (let y = 0; y < 2 ** L; y++) out.push(`${L}/${x}/${y}`);
  for (const [L, km] of Object.entries(IMG_RADIUS_KM)) out.push(...tilesNear(+L, km));
  return out;
}
export const demTiles = () => Object.entries(DEM_RADIUS_KM).flatMap(([L, km]) => tilesNear(+L, km));

async function get(url, tries = 4) {
  for (let k = 1; ; k++) {
    try { const r = await fetch(url, { headers: UA }); if (r.status === 404 || r.status === 403) return null; if (!r.ok) throw new Error(url + ' ' + r.status); return Buffer.from(await r.arrayBuffer()); }
    catch (e) { if (k >= tries) throw e; console.warn('retry', k, e.message); await new Promise(ok => setTimeout(ok, 2000 * k)); }
  }
}
// a small pool: at most n requests at once, a pause between starts (polite to the tile servers)
async function pool(items, n, fn, gapMs = 40) {
  let i = 0, done = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); await new Promise(ok => setTimeout(ok, gapMs)); if (++done % 200 === 0) console.log(`  ${done}/${items.length} (${Math.round((Date.now() - t0) / 1000)} s)`); } }));
}

// ---------- the fetch log (URL, date, bytes, SHA-256 of each cached input), as the other builders
const FLOGF = join(RAW, 'fetch-log.json');
const flog = existsSync(FLOGF) ? JSON.parse(readFileSync(FLOGF, 'utf8')) : {};
const saveFlog = () => writeFileSync(FLOGF, JSON.stringify(flog));

// ---------- GLO-90 cells (1 x 1 degree, named by the south-west corner)
const gloName = (lon, lat) => `Copernicus_DSM_COG_30_${lat >= 0 ? 'N' : 'S'}${String(Math.abs(lat)).padStart(2, '0')}_00_${lon >= 0 ? 'E' : 'W'}${String(Math.abs(lon)).padStart(3, '0')}_00_DEM`;
function gloCellsFor(keys) {   // -> Map cellKey -> 'ov' | 'full' (full for levels 11 and 12)
  const m = new Map();
  for (const k of keys) { const [L, x, y] = k.split('/').map(Number), [w, s, e, n] = bounds(L, x, y), pad = (e - w) / 32;
    for (let lo = Math.floor(w - pad); lo < e + pad; lo++) for (let la = Math.floor(s - pad); la < n + pad; la++) { const c = `${lo},${la}`; if (L >= 11) m.set(c, 'full'); else if (!m.has(c)) m.set(c, 'ov'); } }
  return m;
}
const gloFile = (c, kind) => join(RAW, 'glo90', `${c.replace(',', '_')}-${kind}.f32`);
async function fetchGlo(c, kind) {
  const f = gloFile(c, kind); if (existsSync(f) || existsSync(f + '.none')) return;
  const [lo, la] = c.split(',').map(Number), name = gloName(lo, la), url = GLO(name);
  const { fromUrl } = await import('geotiff');
  // (no file for a cell of open sea: the bucket answers 403 or 404)
  const head = await fetch(url, { method: 'HEAD', headers: UA });
  if (head.status === 403 || head.status === 404) { writeFileSync(f + '.none', ''); flog[`glo90/${c}-${kind}`] = { url, fetched: new Date().toISOString().slice(0, 10), none: true }; return; }
  const tiff = await fromUrl(url);
  const im = await tiff.getImage(kind === 'full' ? 0 : 2), w = im.getWidth(), h = im.getHeight(), r = (await im.readRasters())[0];
  const buf = Buffer.concat([Buffer.from(new Uint32Array([w, h]).buffer), Buffer.from(Float32Array.from(r).buffer)]);
  writeFileSync(f, buf); flog[`glo90/${c}-${kind}`] = { url: url + (kind === 'full' ? '' : ' (overview 2 of 2, read by range)'), fetched: new Date().toISOString().slice(0, 10), bytes: buf.length, sha256: sha(buf) };
}

async function fetchAll() {
  mkdirSync(join(RAW, 'eox'), { recursive: true }); mkdirSync(join(RAW, 'glo90'), { recursive: true });
  const img = imageryTiles().filter(k => !built('img', k, '.webp')), eox = new Set();
  for (const k of img) { const [L, x, y] = k.split('/').map(Number); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) eox.add(`${L + 1}/${2 * y + dy}/${2 * x + dx}`); }
  const need = [...eox].filter(k => !existsSync(join(RAW, 'eox', k + '.jpg')) && !existsSync(join(RAW, 'eox', k + '.none')));
  console.log(`imagery: ${img.length} tiles of ours, ${eox.size} EOX tiles, ${need.length} to fetch`);
  await pool(need, 4, async k => { const [z, row, col] = k.split('/'), b = await get(EOX(z, row, col)), f = join(RAW, 'eox', k + '.jpg'); mkdirSync(dirname(f), { recursive: true });
    if (!b) { writeFileSync(f.replace(/\.jpg$/, '.none'), ''); return; } writeFileSync(f, b); flog['eox/' + k] = { url: EOX(z, row, col), fetched: new Date().toISOString().slice(0, 10), bytes: b.length, sha256: sha(b) }; });
  saveFlog();
  const cells = gloCellsFor(demTiles().filter(k => !built('dem', k, '.bin'))), todo = [...cells].flatMap(([c, kind]) => kind === 'full' ? [[c, 'full'], [c, 'ov']] : [[c, 'ov']]);
  console.log(`terrain: ${demTiles().length} tiles, ${cells.size} GLO-90 cells (${[...cells.values()].filter(v => v === 'full').length} at full resolution)`);
  await pool(todo, 4, ([c, kind]) => fetchGlo(c, kind), 20);
  saveFlog();
}

// ---------- the GLO-90 grid as box means (summed-area tables per cell)
const sats = new Map();
function satOf(c, kind) {
  const k = c + kind; if (sats.has(k)) return sats.get(k);
  const f = gloFile(c, kind); let v = null;
  if (existsSync(f)) { const b = readFileSync(f), [w, h] = new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + 8)), d = new Float32Array(b.buffer.slice(b.byteOffset + 8, b.byteOffset + 8 + w * h * 4));
    const S = new Float64Array((w + 1) * (h + 1));
    for (let j = 0; j < h; j++) { let row = 0; for (let i = 0; i < w; i++) { const z = d[j * w + i]; row += z > -1000 && z < 9000 ? z : 0; S[(j + 1) * (w + 1) + i + 1] = S[j * (w + 1) + i + 1] + row; } }
    v = { w, h, S }; }
  if (sats.size > 64) sats.delete(sats.keys().next().value);
  sats.set(k, v); return v;
}
// mean height over [w, e] x [s, n] (degrees); cells with no GLO-90 file (open sea) count as 0 m
function boxMean(w, s, e, n, kind) {
  let sum = 0, area = 0;
  for (let lo = Math.floor(w); lo < e; lo++) for (let la = Math.floor(s); la < n; la++) {
    const cw = Math.max(w, lo), ce = Math.min(e, lo + 1), cs = Math.max(s, la), cn = Math.min(n, la + 1); if (ce <= cw || cn <= cs) continue;
    const a = (ce - cw) * (cn - cs), T = satOf(`${lo},${la}`, kind); area += a; if (!T) continue;
    // pixel index ranges (pixel areas: column i covers lo + i / w .. lo + (i + 1) / w; row j from the north)
    let i0 = Math.floor((cw - lo) * T.w), i1 = Math.ceil((ce - lo) * T.w), j0 = Math.floor((la + 1 - cn) * T.h), j1 = Math.ceil((la + 1 - cs) * T.h);
    i0 = Math.max(0, Math.min(T.w - 1, i0)); j0 = Math.max(0, Math.min(T.h - 1, j0)); i1 = Math.max(i0 + 1, Math.min(T.w, i1)); j1 = Math.max(j0 + 1, Math.min(T.h, j1));
    const W1 = T.w + 1, S = T.S, tot = S[j1 * W1 + i1] - S[j0 * W1 + i1] - S[j1 * W1 + i0] + S[j0 * W1 + i0];
    sum += tot / ((i1 - i0) * (j1 - j0)) * a;
  }
  return area ? sum / area : 0;
}
function demTile(key) {
  const [L, x, y] = key.split('/').map(Number), [w, s, e, n] = bounds(L, x, y), d = (e - w) / 32, kind = L >= 11 ? 'full' : 'ov', out = new Int16Array(GRID * GRID);
  let land = false;
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const lon = w + (i - 1) * d, lat = n - (j - 1) * d, hw = d / 2 * Math.max(1, 1), v = boxMean(lon - hw, lat - hw, lon + hw, lat + hw, kind);
    out[j * GRID + i] = Math.round(v); if (Math.abs(v) > 0.5) land = true;
  }
  return land ? out : null;
}

// ---------- imagery: 2 x 2 EOX tiles of level L + 1 -> one 512 px WebP of level L
async function imageryTile(key, C) {
  const [L, x, y] = key.split('/').map(Number), cv = C.createCanvas(PX, PX), c = cv.getContext('2d'); let n = 0;
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const f = join(RAW, 'eox', `${L + 1}/${2 * y + dy}/${2 * x + dx}.jpg`); if (!existsSync(f)) continue; c.drawImage(await C.loadImage(readFileSync(f)), dx * 256, dy * 256, 256, 256); n++; }
  if (n < 4) return null;
  return cv.encode('webp', Q);
}

// ---------- dataflow log (operations over hashed inputs, outputs with their SHA-256)
const LOGF = join(OUT, 'log.json');
function logActivity(op, version, inputs, params, outputs, seconds) {
  const LOG = existsSync(LOGF) ? JSON.parse(readFileSync(LOGF, 'utf8')) : { about: '', operations: {}, fetches: {}, activities: [] };
  LOG.about = 'Dataflow log of tools/build-world-base.mjs (skill cwplans-dataflow): operations, the fetches that made their inputs (summarised: count, bytes, SHA-256 of the sorted list of input hashes), one activity per run (inputs and outputs by SHA-256). The per-file fetch log stays in the raw folder.';
  LOG.operations[op] = { version, tool: 'tools/build-world-base.mjs', skill: 'docklands-3d-page' };
  const ins = sha(JSON.stringify(inputs.map(i => i.sha256 || 'none').sort()));
  const id = 'act' + sha(JSON.stringify([op, version, ins, params])).slice(0, 16);
  LOG.fetches[op] = { inputs: inputs.length, bytes: inputs.reduce((s, i) => s + (i.bytes || 0), 0), urls: [...new Set(inputs.map(i => (i.url || '').replace(/\/\d+\/\d+\/\d+\.jpg$/, '/{z}/{row}/{col}.jpg').replace(/Copernicus_DSM_COG_30_[^/]*\/Copernicus_DSM_COG_30_[^/]*\.tif/, '{cell}/{cell}.tif')))], fetched: [...new Set(inputs.map(i => i.fetched))].sort(), inputs_sha256: ins };
  LOG.activities = LOG.activities.filter(a => a.operation !== op); LOG.activities.push({ id, operation: op, version, inputs_sha256: ins, params, outputs: outputs.length, outputs_sha256: sha(JSON.stringify(outputs.map(o => o.path + ' ' + o.sha256).sort())), bytes: outputs.reduce((s, o) => s + o.bytes, 0), seconds, at: new Date().toISOString() });
  writeFileSync(LOGF, JSON.stringify(LOG, null, 1));
}

async function build() {
  const C = await import('@napi-rs/canvas');
  mkdirSync(OUT, { recursive: true });
  // imagery
  let t = Date.now(); if (!ADD) rmSync(join(OUT, 'img'), { recursive: true, force: true });
  const img = imageryTiles(), have = {}, outs = []; let bytes = 0;
  for (const k of img) { const b = built('img', k, '.webp') ? readFileSync(join(OUT, 'img', k + '.webp')) : await imageryTile(k, C); if (!b) continue; const f = join(OUT, 'img', k + '.webp'); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b); bytes += b.length; outs.push({ path: 'img/' + k + '.webp', sha256: sha(b), bytes: b.length });
    const [L, x, y] = k.split('/'); (have[L] ||= []).push(+x, +y); }
  logActivity('imagery-tiles', 1, Object.entries(flog).filter(([k]) => k.startsWith('eox/')).map(([, v]) => v), { q: Q, px: PX, regions: REG.map(r => r.id), radius_km: IMG_RADIUS_KM, global_levels: GLOBAL_L }, outs, Math.round((Date.now() - t) / 1000));
  console.log(`imagery: ${outs.length} tiles, ${(bytes / 1048576).toFixed(1)} MB`);
  // terrain heights
  t = Date.now(); if (!ADD) rmSync(join(OUT, 'dem'), { recursive: true, force: true });
  const dem = demTiles(), dhave = {}, douts = []; let dbytes = 0;
  for (const k of dem.sort()) { const a = built('dem', k, '.bin') ? new Int16Array(Uint8Array.from(readFileSync(join(OUT, 'dem', k + '.bin'))).buffer) : demTile(k); if (!a) continue; const b = Buffer.from(a.buffer), f = join(OUT, 'dem', k + '.bin'); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b); dbytes += b.length; douts.push({ path: 'dem/' + k + '.bin', sha256: sha(b), bytes: b.length });
    const [L, x, y] = k.split('/'); (dhave[L] ||= []).push(+x, +y); }
  logActivity('dem-tiles', 1, Object.entries(flog).filter(([k]) => k.startsWith('glo90/')).map(([, v]) => v), { grid: GRID, regions: REG.map(r => r.id), radius_km: DEM_RADIUS_KM }, douts, Math.round((Date.now() - t) / 1000));
  console.log(`terrain: ${douts.length} tiles, ${(dbytes / 1048576).toFixed(1)} MB`);
  // the manifest: tile lists per level (x, y pairs; y from the north), formats, credits
  const M = {
    v: 1, id: 'world-base', name: 'World base tiles (imagery and terrain heights)', built: new Date().toISOString().slice(0, 10),
    scheme: 'geodetic quadtree (WorldCRS84Quad): level L tiles of 180 / 2^L degrees; x = floor((lon + 180) / size); y = floor((90 - lat) / size), counted from the NORTH (row 0 at 90 N, as WMTS and docklands/globe/terrain.js)',
    regions: REG.map(r => r.id),
    imagery: { url: 'img/{z}/{x}/{y}.webp', px: PX, format: 'WebP (lossy, quality ' + Q + '), sRGB', tiles: have, radius_km: IMG_RADIUS_KM, global_levels: GLOBAL_L,
      credit: 'Sentinel-2 cloudless 2016 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0', credit_url: 'https://s2maps.eu' },
    dem: { url: 'dem/{z}/{x}/{y}.bin', grid: GRID, format: `Int16 little-endian, ${GRID} x ${GRID} samples, row 0 at the north; sample (i, j) at lon = w + (i - 1) (e - w) / 32, lat = n - (j - 1) (n - s) / 32 (the 33 x 33 vertices of a terrain patch and one sample of border each side); metres above the EGM2008 geoid (box mean over one sample spacing); 0 over open sea`,
      tiles: dhave, radius_km: DEM_RADIUS_KM, credit: 'Copernicus DEM GLO-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA', credit_url: 'https://registry.opendata.aws/copernicus-dem/' },
    credit: 'Imagery: Sentinel-2 cloudless 2016 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0. Terrain near the testbeds: Copernicus DEM GLO-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA.',
    sizes: { imagery_bytes: bytes, imagery_tiles: outs.length, dem_bytes: dbytes, dem_tiles: douts.length },
  };
  writeFileSync(join(OUT, 'base.json'), JSON.stringify(M));
  console.log(`base.json: ${(statSync(join(OUT, 'base.json')).size / 1024).toFixed(1)} kB; total ${((bytes + dbytes) / 1048576).toFixed(1)} MB`);
}

const cmd = process.argv[2];
if (cmd === 'fetch') await fetchAll();
else if (cmd === 'build') await build();
else if (cmd === 'plan') { const i = imageryTiles(), d = demTiles(); const by = a => a.reduce((o, k) => (o[k.split('/')[0]] = (o[k.split('/')[0]] || 0) + 1, o), {}); console.log('imagery', i.length, by(i), 'dem', d.length, by(d), 'glo cells', gloCellsFor(d).size); }
else { console.log('usage: build-world-base.mjs plan|fetch|build [--regions docklands,leon,sarajevo] [--q 70]'); process.exit(1); }
