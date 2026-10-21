#!/usr/bin/env node
// World skeleton for the globe of the Three.js port (OKR KR2.2 and KR2.7, https://github.com/danbri/londat/issues/7):
// terrain and land/sea from ETOPO 2022 and Natural Earth, a coarse geoid (EGM96), and Natural Earth vector layers
// (coastlines, countries with names in many languages, admin-1 regions, rivers, lakes, seas, populated places),
// simplified and quantised into small files under cwplans/docklands/data/world/, with a manifest (layers.json) in the
// globe's layer contract (docklands/globe/README in the docklands-3d-page skill, "globe and world skeleton").
//
//   node cwplans/tools/build-world-skeleton.mjs fetch [--raw data/raw/world-skeleton]   # downloads (about 1 GB through OPeNDAP, read in bands; kept: 32 MB)
//   node cwplans/tools/build-world-skeleton.mjs build [--raw ...] [--w 4096]           # writes the files
//
// Sources (all public domain; data register keys natural-earth, etopo-2022, egm96):
//  - Natural Earth 5.1.2 GeoJSON, github.com/nvkelso/natural-earth-vector tag v5.1.2 (the same data as naturalearthdata.com)
//  - ETOPO 2022 v1, 60 arc-second surface elevation (NOAA NCEI; EGM2008 heights), read by OPeNDAP from the NCEI THREDDS
//    server in bands of 540 rows and averaged into the output grid (box mean: each 60" cell goes to the output pixel that
//    holds its centre; 4096 x 2048 = 5.27' pixels, about 9.8 km at the equator)
//  - EGM96 geoid, 15' grid (NGA; PROJ data file us_nga_egm96_15.tif), sampled at whole degrees
// Raw files stay in the raw folder (ignored by git). Method, rules and file list: cwplans/pipeline.json activity
// build-world-skeleton. No locale constant: the tool knows no place.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const RAW = join(ROOT, arg('--raw', 'data/raw/world-skeleton')), OUT = join(ROOT, 'cwplans/docklands/data/world');
const W = +arg('--w', 4096), H = W / 2;
const NE_TAG = 'v5.1.2', NE_BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_TAG}/geojson/`;
const NE_FILES = ['ne_50m_coastline', 'ne_50m_land', 'ne_50m_admin_0_countries', 'ne_50m_admin_0_boundary_lines_land', 'ne_10m_admin_1_states_provinces',
  'ne_10m_admin_1_states_provinces_lines', 'ne_50m_rivers_lake_centerlines', 'ne_50m_lakes', 'ne_10m_populated_places', 'ne_50m_geography_marine_polys'];
const ETOPO = 'https://www.ngdc.noaa.gov/thredds/dodsC/global/ETOPO2022/60s/60s_surface_elev_netcdf/ETOPO_2022_v1_60s_N90W180_surface.nc.dods';
const EGM96 = 'https://cdn.proj.org/us_nga_egm96_15.tif';
const LANGS = ['ar', 'bn', 'de', 'el', 'en', 'es', 'fa', 'fr', 'he', 'hi', 'hu', 'id', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'ru', 'sv', 'tr', 'uk', 'ur', 'vi', 'zh', 'zht'];
const UA = { 'User-Agent': 'londat-cwplans/0.1 (+https://github.com/danbri/londat)' };

async function get(url, tries = 4) {
  for (let k = 1; ; k++) {
    try { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(url + ' ' + r.status); return Buffer.from(await r.arrayBuffer()); }
    catch (e) { if (k >= tries) throw e; console.warn('retry', k, e.message); await new Promise(ok => setTimeout(ok, 3000 * k)); }
  }
}

// ---------- fetch
async function fetchAll() {
  mkdirSync(RAW, { recursive: true });
  for (const f of NE_FILES) { const p = join(RAW, f + '.geojson'); if (!existsSync(p)) { writeFileSync(p, await get(NE_BASE + f + '.geojson')); console.log('got', f); } }
  const gp = join(RAW, 'us_nga_egm96_15.tif'); if (!existsSync(gp)) { writeFileSync(gp, await get(EGM96)); console.log('got EGM96'); }
  const ep = join(RAW, `etopo2022-60s-mean-${W}x${H}.f32`);
  if (!existsSync(ep)) writeFileSync(ep, Buffer.from((await etopoMean()).buffer));
}
// ETOPO 2022 60": 10800 rows x 21600 columns (cell centres; GeoTransform -180 1/60 0 90 0 -1/60). Read in bands of 540 rows
// through OPeNDAP (.dods: the DDS text, "Data:\n", then XDR: the array length twice as uint32 and big-endian float32
// values, then the map vectors lat and lon as float64). Each value goes into the output pixel holding its centre.
async function etopoMean() {
  const sum = new Float64Array(W * H), cnt = new Uint32Array(W * H), NR = 10800, NC = 21600, B = 540;
  for (let r0 = 0; r0 < NR; r0 += B) {
    const r1 = Math.min(NR, r0 + B) - 1, buf = await get(`${ETOPO}?z%5B${r0}:1:${r1}%5D%5B0:1:${NC - 1}%5D`);
    const at = buf.indexOf('Data:\n') + 6, n = buf.readUInt32BE(at), rows = r1 - r0 + 1; if (n !== rows * NC) throw new Error('unexpected DODS length ' + n);
    let o = at + 8; const vals = new Float32Array(n); for (let i = 0; i < n; i++, o += 4) vals[i] = buf.readFloatBE(o);
    const nl = buf.readUInt32BE(o); o += 8; const lat = []; for (let i = 0; i < nl; i++, o += 8) lat.push(buf.readDoubleBE(o));
    o += 8; const lon = []; for (let i = 0; i < NC; i++, o += 8) lon.push(buf.readDoubleBE(o));
    const col = lon.map(l => Math.min(W - 1, Math.max(0, Math.floor((l + 180) / 360 * W))));
    for (let r = 0; r < rows; r++) {
      const j = Math.min(H - 1, Math.max(0, Math.floor((90 - lat[r]) / 180 * H))), base = j * W;
      for (let c = 0; c < NC; c++) { const v = vals[r * NC + c]; if (v > -20000) { sum[base + col[c]] += v; cnt[base + col[c]]++; } }
    }
    console.log(`ETOPO rows ${r0}-${r1} (lat ${lat[0].toFixed(2)} to ${lat[rows - 1].toFixed(2)})`);
  }
  const out = new Float32Array(W * H); for (let i = 0; i < out.length; i++) out[i] = cnt[i] ? sum[i] / cnt[i] : 0;
  return out;
}

// ---------- small PNG writer (8-bit grey or RGB; adaptive filter per row)
function crc32(b) { let c, crc = 0xffffffff; for (let n = 0; n < b.length; n++) { c = (crc ^ b[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w, h, ch, px) {
  const stride = w * ch, raw = Buffer.alloc((stride + 1) * h), prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const line = px.subarray(y * stride, (y + 1) * stride); let best = null, bestS = Infinity, bestF = 0;
    for (let f = 0; f < 5; f++) {
      let s = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= ch ? line[i - ch] : 0, b = y ? prev[i] : 0, c = i >= ch && y ? prev[i - ch] : 0, x = line[i];
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c), pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        const v = (x - [0, a, b, (a + b) >> 1, pr][f]) & 0xff; cur[i] = v; s += v < 128 ? v : 256 - v;
      }
      if (s < bestS) { bestS = s; bestF = f; best = Uint8Array.from(cur); }
    }
    raw[y * (stride + 1)] = bestF; raw.set(best, y * (stride + 1) + 1); prev.set(line);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ch === 3 ? 2 : 0; ihdr[10] = ihdr[11] = ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- geometry helpers: Douglas-Peucker in degrees, quantise to 1/Q degree, delta-encode (format wsk1)
const Q = 1000;
function dp(pts, tol) {
  if (pts.length <= 2 || tol <= 0) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]], t2 = tol * tol;
  while (st.length) {
    const [a, b] = st.pop(); let md = -1, mi = -1; const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) { const [px, py] = pts[i]; let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); const ex = ax + t * dx - px, ey = ay + t * dy - py, d = ex * ex + ey * ey; if (d > md) { md = d; mi = i; } }
    if (md > t2) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function enc(pts) {   // [[lon, lat], ...] -> [x0, y0, dx, dy, ...] in 1/Q degrees, repeated points dropped
  const out = []; let px = 0, py = 0, first = true;
  for (const [lon, lat] of pts) { const x = Math.round(lon * Q), y = Math.round(lat * Q); if (!first && x === px && y === py) continue; out.push(first ? x : x - px, first ? y : y - py); px = x; py = y; first = false; }
  return out;
}
const lines = g => !g ? [] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
const polys = g => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
function encLines(g, tol) { return lines(g).map(l => enc(dp(l, tol))).filter(a => a.length >= 4); }
function encPolys(g, tol) { return polys(g).map(p => p.map(r => enc(dp(r, tol))).filter((r, i) => r.length >= 8 || (i > 0 && false))).filter(p => p.length && p[0].length >= 8); }
const clean = v => v === -99 || v === '-99' || v === '' || v == null ? undefined : v;
const r4 = v => Math.round(v * 1e4) / 1e4;
function names(p, upper) { const o = {}; for (const l of LANGS) { const v = clean(p[(upper ? 'NAME_' + l.toUpperCase() : 'name_' + l)]); if (v) o[l] = v; } return o; }
const ne = f => JSON.parse(readFileSync(join(RAW, f + '.geojson'), 'utf8')).features;
function writeJson(name, obj) { const s = JSON.stringify(obj); writeFileSync(join(OUT, name), s); console.log(`${name}: ${(s.length / 1024).toFixed(0)} kB`); return name; }
const layerFile = (kind, features, meta = {}) => ({ format: 'wsk1', q: Q, kind, ...meta, features });

// ---------- build
async function build() {
  mkdirSync(OUT, { recursive: true });
  const NAMES = Object.fromEntries(LANGS.map(l => [l, { admin1: {}, places: {}, marine: {}, lakes: {}, rivers: {} }]));
  const putName = (table, key, def, nm) => { for (const [l, v] of Object.entries(nm)) if (v && v !== def) NAMES[l][table][key] = v; };

  // coastlines (50m, 0.005 degree tolerance)
  writeJson('coast.json', layerFile('lines', ne('ne_50m_coastline').map(f => ({ p: { r: f.properties.scalerank }, g: encLines(f.geometry, 0.005) })).filter(f => f.g.length)));
  // countries (50m polygons for "which country", label points and facts); names in every NE language in the file
  const countries = ne('ne_50m_admin_0_countries').map(f => { const p = f.properties; return { p: {
    a3: p.ADM0_A3, iso2: clean(p.ISO_A2_EH) || clean(p.ISO_A2), iso3: clean(p.ISO_A3_EH) || clean(p.ISO_A3), name: p.NAME, long: p.NAME_LONG, formal: clean(p.FORMAL_EN), sov: p.SOVEREIGNT, type: p.TYPE,
    cont: p.CONTINENT, sub: p.SUBREGION, pop: p.POP_EST, popYear: p.POP_YEAR, wd: clean(p.WIKIDATAID), lx: r4(p.LABEL_X), ly: r4(p.LABEL_Y), minl: p.MIN_LABEL, maxl: p.MAX_LABEL, lr: p.LABELRANK, names: names(p, true) },
    g: encPolys(f.geometry, 0.01) }; });
  writeJson('countries.json', layerFile('polygons', countries));
  writeJson('boundaries.json', layerFile('lines', ne('ne_50m_admin_0_boundary_lines_land').map(f => ({ p: { r: f.properties.SCALERANK, c: f.properties.FEATURECLA }, g: encLines(f.geometry, 0.005) })).filter(f => f.g.length)));
  // admin-1 (10m; polygons simplified 0.03 degree, about 3 km, lines 0.02 degree)
  const a1 = ne('ne_10m_admin_1_states_provinces').map((f, i) => { const p = f.properties, nm = names(p, false); putName('admin1', i, p.name, nm);
    return { p: { name: p.name, a3: p.adm0_a3, iso: clean(p.iso_3166_2), type: clean(p.type_en), wd: clean(p.wikidataid), lx: r4(p.longitude), ly: r4(p.latitude), minl: p.min_label, lr: p.labelrank, area: p.area_sqkm },
      g: encPolys(f.geometry, 0.03) }; });
  writeJson('admin1.json', layerFile('polygons', a1));
  writeJson('admin1-lines.json', layerFile('lines', ne('ne_10m_admin_1_states_provinces_lines').map(f => ({ p: { a3: f.properties.ADM0_A3, z: f.properties.MIN_ZOOM }, g: encLines(f.geometry, 0.02) })).filter(f => f.g.length)));
  // rivers, lakes, seas
  // (names go in by the index of the feature in the written file, after features with no geometry left are dropped)
  const named = (table, feats) => { feats = feats.filter(f => f.g.length); feats.forEach((f, i) => { putName(table, i, f.p.name, f.nm); delete f.nm; }); return feats; };
  writeJson('rivers.json', layerFile('lines', named('rivers', ne('ne_50m_rivers_lake_centerlines').map(f => { const p = f.properties;
    return { p: { name: clean(p.name), r: p.scalerank, c: p.featurecla, minl: p.min_label }, nm: p.name_en && p.name_en !== p.name ? { en: p.name_en } : {}, g: encLines(f.geometry, 0.005) }; }))));
  writeJson('lakes.json', layerFile('polygons', named('lakes', ne('ne_50m_lakes').map(f => { const p = f.properties;
    return { p: { name: clean(p.name), r: p.scalerank, wd: clean(p.wikidataid), minl: p.min_label, c: p.featurecla }, nm: names(p, false), g: encPolys(f.geometry, 0.005) }; }))));
  writeJson('marine.json', layerFile('polygons', named('marine', ne('ne_50m_geography_marine_polys').map(f => { const p = f.properties, nm = names(p, false); if (p.name_fr) nm.fr = p.name_fr;
    return { p: { name: clean(p.name), c: p.featurecla, r: p.scalerank, minl: p.min_label, wd: clean(p.wikidataid) }, nm, g: encPolys(f.geometry, 0.02) }; }))));
  // populated places (10m, 7,342): one row each; names in other languages in names-<lang>.json
  const pl = ne('ne_10m_populated_places').map((f, i) => { const p = f.properties; putName('places', i, p.NAME, names(p, true));
    const cap = /Admin-0 capital/.test(p.FEATURECLA) ? 2 : /Admin-1 capital/.test(p.FEATURECLA) ? 1 : 0;
    return { p: { name: p.NAME, ascii: p.NAMEASCII !== p.NAME ? p.NAMEASCII : undefined, a3: p.ADM0_A3, country: p.ADM0NAME, adm1: clean(p.ADM1NAME), pop: p.POP_MAX, minz: p.MIN_ZOOM, lr: p.LABELRANK, sr: p.SCALERANK, cap, wd: clean(p.WIKIDATAID), tz: clean(p.TIMEZONE) },
      g: [Math.round(p.LONGITUDE * Q), Math.round(p.LATITUDE * Q)] }; });
  writeJson('places.json', layerFile('points', pl));
  for (const l of LANGS) writeJson(`names-${l}.json`, { lang: l, ...NAMES[l] });

  // terrain: R = height code (sqrt scale: 128 + 127 sqrt(h / 8848) above sea level, 127 - 127 sqrt(-h / 11000) below),
  // G = land fraction (Natural Earth 50m land, antialiased), B = lake fraction (Natural Earth 50m lakes)
  const { createCanvas } = await import('@napi-rs/canvas');
  const raster = feats => { const cv = createCanvas(W, H), c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff';
    for (const f of feats) for (const poly of polys(f.geometry)) { c.beginPath(); for (const ring of poly) ring.forEach(([lon, lat], k) => c[k ? 'lineTo' : 'moveTo']((lon + 180) / 360 * W, (90 - lat) / 180 * H)); c.closePath(); c.fill('evenodd'); }
    return c.getImageData(0, 0, W, H).data; };
  const land = raster(ne('ne_50m_land')), lake = raster(ne('ne_50m_lakes'));
  const ep = join(RAW, `etopo2022-60s-mean-${W}x${H}.f32`); if (!existsSync(ep)) throw new Error('run fetch first: ' + ep);
  const hgt = new Float32Array(readFileSync(ep).buffer.slice(0));
  const px = new Uint8Array(W * H * 3); let hmin = 1e9, hmax = -1e9;
  for (let i = 0; i < W * H; i++) { const h = hgt[i]; hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
    px[3 * i] = h >= 0 ? Math.min(255, 128 + Math.round(127 * Math.sqrt(Math.min(h, 8848) / 8848))) : Math.max(0, 127 - Math.round(127 * Math.sqrt(Math.min(-h, 11000) / 11000)));
    px[3 * i + 1] = land[4 * i]; px[3 * i + 2] = lake[4 * i]; }
  const tname = `terrain-${W}x${H}.png`; writeFileSync(join(OUT, tname), png(W, H, 3, px)); console.log(`${tname}: ${(statSync(join(OUT, tname)).size / 1048576).toFixed(2)} MB (heights ${hmin.toFixed(0)} to ${hmax.toFixed(0)} m)`);
  // geoid: EGM96 at whole degrees, 361 x 181 (lon -180..180, lat 90..-90), grey value = N + 128 (metres, rounded)
  const { fromFile } = await import('geotiff'), im = await (await fromFile(join(RAW, 'us_nga_egm96_15.tif'))).getImage(), gv = (await im.readRasters())[0], gw = im.getWidth();
  const gpx = new Uint8Array(361 * 181);
  for (let j = 0; j <= 180; j++) for (let i = 0; i <= 360; i++) { const c = (i * 4) % gw, r = j * 4; gpx[j * 361 + i] = Math.max(0, Math.min(255, Math.round(gv[r * gw + c] + 128))); }
  writeFileSync(join(OUT, 'geoid-egm96-1deg.png'), png(361, 181, 1, gpx)); console.log('geoid-egm96-1deg.png written');

  // the manifest: the globe's layer contract (docs: docklands-3d-page skill, "globe and world skeleton")
  writeJson('layers.json', {
    v: 1, id: 'world', name: 'World skeleton', built: new Date().toISOString().slice(0, 10),
    credit: 'Made with Natural Earth (public domain). ETOPO 2022 (NOAA NCEI, public domain). EGM96 geoid (NGA, public domain).',
    sources: { 'natural-earth': `Natural Earth ${NE_TAG}`, 'etopo-2022': 'ETOPO 2022 v1, 60 arc-second surface (box mean to ' + W + ' x ' + H + ')', egm96: 'EGM96 15\' grid, whole degrees' },
    terrain: { url: tname, width: W, height: H, encoding: 'R: 128 + 127 sqrt(h / 8848) for h >= 0, 127 - 127 sqrt(-h / 11000) below; G: land fraction; B: lake fraction; h in m above the EGM2008 geoid', geoid: { url: 'geoid-egm96-1deg.png', encoding: 'grey = N + 128 (m), 361 x 181, lon -180..180, lat 90..-90' } },
    names: { url: 'names-{lang}.json', langs: LANGS, note: 'names of admin-1 regions, places, seas, lakes and rivers in that language where Natural Earth has one that differs from the default; country names are in countries.json' },
    layers: [
      { id: 'coast', label: 'Coastlines', kind: 'lines', url: 'coast.json', style: { color: '#bfe3ff', opacity: 0.85 } },
      { id: 'countries', label: 'Countries', kind: 'polygons', url: 'countries.json', draw: false, lookup: 'country', idProp: 'a3',
        labels: { text: 'name', names: 'names', at: ['lx', 'ly'], minZoom: 'minl', maxZoom: 'maxl', rank: 'lr', class: 'country' },
        gazetteer: { kind: 'country', text: ['name', 'long', 'formal', 'iso3'], names: 'names', at: ['lx', 'ly'], rank: 'pop' } },
      { id: 'boundaries', label: 'Country borders', kind: 'lines', url: 'boundaries.json', style: { color: '#ffd27a', opacity: 0.9 } },
      { id: 'admin1', label: 'Regions (admin-1)', kind: 'polygons', url: 'admin1.json', draw: false, lookup: 'admin1', namesTable: 'admin1',
        labels: { text: 'name', at: ['lx', 'ly'], minZoom: 'minl', rank: 'lr', zoomAdd: 1, class: 'admin1' },
        gazetteer: { kind: 'region', text: ['name', 'iso'], at: ['lx', 'ly'], rank: 'area' } },
      { id: 'admin1-lines', label: 'Region borders', kind: 'lines', url: 'admin1-lines.json', style: { color: '#c9a86a', opacity: 0.55, maxAlt: 2500000 } },
      { id: 'rivers', label: 'Rivers', kind: 'lines', url: 'rivers.json', namesTable: 'rivers', style: { color: '#7fc3ff', opacity: 0.8, minAlt: 800000, maxAlt: 6000000 },   // (below 800 km: the 1:10m rivers of the world detail set, build-detail-skeleton.mjs)
        gazetteer: { kind: 'river', text: ['name'], rank: 'r', rankLowFirst: true } },
      { id: 'lakes', label: 'Lakes', kind: 'polygons', url: 'lakes.json', lookup: 'lake', namesTable: 'lakes', style: { color: '#7fc3ff', opacity: 0.8, minAlt: 600000, maxAlt: 8000000 },   // (below 600 km: the 1:10m lakes)
        gazetteer: { kind: 'lake', text: ['name'], rank: 'r', rankLowFirst: true } },
      { id: 'marine', label: 'Seas and oceans', kind: 'polygons', url: 'marine.json', draw: false, lookup: 'sea', namesTable: 'marine',
        labels: { text: 'name', minZoom: 'minl', rank: 'r', class: 'sea' },
        gazetteer: { kind: 'sea', text: ['name'], rank: 'r', rankLowFirst: true } },
      { id: 'places', label: 'Cities and towns', kind: 'points', url: 'places.json', namesTable: 'places',
        labels: { text: 'name', minZoom: 'minz', rank: 'lr', class: 'place' },
        gazetteer: { kind: 'place', text: ['name', 'ascii'], rank: 'pop' }, nearest: true },
    ],
  });
}

const cmd = process.argv[2];
if (cmd === 'fetch') await fetchAll();
else if (cmd === 'build') await build();
else { console.log('usage: build-world-skeleton.mjs fetch|build [--raw dir] [--w 4096]'); process.exit(1); }
