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
//
// No locale constant here: the area, the DEM service, the national height source, its CRS and the name keys come from
// the region config (docklands/geo/regions/<id>.js, block `place` and the adapters it names). Handlers are generic:
// OSM API 0.6 (/map.json, split in four on "too many nodes"), WCS 2.0 GetCoverage (GeoTIFF in geographic degrees),
// Copernicus GLO-30 COG tiles (worldwide fallback), INSPIRE BU building parts (GML, number of floors).
// Raw downloads: cwplans/data/raw/places/<id>/ (ignored by git; fetch-log.json: URL, date, bytes, SHA-256).
// Output: cwplans/docklands/data/places/<id>/ (tileset.json, tiles/<level>-<x>-<y>.glb, features.json, log.json) and
// cwplans/docklands/data/places/index.json (the places the globe knows). Reader: docklands/globe/places.js.
//
// Dataflow (skill cwplans-dataflow): three named operations over input files fixed by SHA-256 and parameters:
// place-select-osm, place-heights, place-tiles. Activity id = sha256(JSON [op, version, input hashes, params])[0:16];
// each run is appended to log.json with its inputs and outputs (SHA-256); a step whose activity is in the log with its
// outputs present and unchanged is not run again. Bodies read only their inputs: no clock, no network.
// Faults of the height rule are counted per class (F55 in the curation skill's fault register), not patched per record.
// Skill: docklands-3d-page, "Three.js port: places as 3D Tiles (2026-10-18)".
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import proj4 from 'proj4';
import earcut from 'earcut';
import { fromArrayBuffer, fromUrl } from 'geotiff';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import REGIONS from '../../docklands/geo/regions/index.js';
import { enuFrame, geodeticToEcef, D2R } from '../../docklands/geo/ellipsoid.js';

const UA = 'glitchcan-cwplans/0.1 (https://github.com/danbri/londat)';
const TOOL = 'tools/build-place-tiles.mjs';
const CW = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), flag = f => argv.includes(f);
const argOf = k => { const i = argv.findIndex(a => a === '--' + k || a.startsWith('--' + k + '=')); if (i < 0) return null; return argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1]; };
const RID = argOf('region'); if (!RID) { console.error('usage: build-place-tiles.mjs [fetch|build] --region <id>'); process.exit(2); }
const REG = REGIONS[RID]; if (!REG) throw new Error(`no region config ${RID} (docklands/geo/regions/)`);
const PL = REG.place; if (!PL) throw new Error(`region ${RID} has no place block`);
const cmd = ['fetch', 'build'].find(c => argv.includes(c)) || 'all';
const RAWD = join(CW, 'data', 'raw', 'places', RID), WORK = join(RAWD, 'work');
const OUTROOT = join(CW, 'docklands', 'data', 'places'), OUT = join(OUTROOT, RID);
for (const d of [RAWD, WORK, OUT]) mkdirSync(d, { recursive: true });
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
const BLOG = join(OUT, 'log.json'), blog = existsSync(BLOG) ? JSON.parse(readFileSync(BLOG, 'utf8')) : { about: '', fetches: {}, activities: [] };
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
  const els = new Map(), urls = [];
  async function box(b, depth) {
    const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${b.map(v => v.toFixed(6)).join(',')}`;
    try { const j = JSON.parse((await get(url)).toString('utf8')); urls.push(url); for (const e of j.elements) els.set(e.type[0] + e.id, e); }
    catch (e) { if (e.status !== 400 || depth > 3) throw e; const mx = (b[0] + b[2]) / 2, my = (b[1] + b[3]) / 2;
      for (const q of [[b[0], b[1], mx, my], [mx, b[1], b[2], my], [b[0], my, mx, b[3]], [mx, my, b[2], b[3]]]) { await pause(1000); await box(q, depth + 1); } }
  }
  await box(AREA, 0);
  const latest = [...els.values()].reduce((m, e) => e.timestamp > m ? e.timestamp : m, '');
  jz(f, { generator: 'OSM API 0.6 map.json', bbox: AREA, elements: [...els.values()] });
  record('osm', f, urls.length === 1 ? urls[0] : urls, { requests: urls.length, elements: els.size, latest_element_timestamp: latest, licence: 'ODbL 1.0, © OpenStreetMap contributors' });
  console.log(`osm: ${els.size} elements in ${urls.length} request(s)`);
}

// DEM: by the adapter's kind, into one common raw grid (row 0 = north, heights in metres of the adapter's datum)
const demAd = REG.adapters.find(a => a.id === PL.dem && a.dem) || REG.adapters.find(a => a.dem);
if (!demAd) throw new Error(`region ${RID}: no adapter with a dem block`);
async function fetchDem() {
  const f = join(RAWD, 'dem.json.gz'); if (existsSync(f) && !flag('--refetch')) return;
  const D = demAd.dem, m = 0.002, b = [AREA[0] - m, AREA[1] - m, AREA[2] + m, AREA[3] + m];
  let img, url;
  if (D.kind === 'wcs20') {
    url = `${D.url}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=${D.coverage}&SUBSET=${D.lat}(${b[1]},${b[3]})&SUBSET=${D.lon}(${b[0]},${b[2]})&FORMAT=${encodeURIComponent(D.format)}`;
    const buf = await get(url); writeFileSync(join(RAWD, 'dem.tif'), buf);
    img = await (await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))).getImage();
  } else if (D.kind === 'copernicus-glo30') {
    // one COG per 1 x 1 degree cell; read the window by range requests
    const la = Math.floor(O.lat), lo = Math.floor(O.lon), ns = (la < 0 ? 'S' : 'N') + String(Math.abs(la)).padStart(2, '0'), ew = (lo < 0 ? 'W' : 'E') + String(Math.abs(lo)).padStart(3, '0');
    const name = `Copernicus_DSM_COG_10_${ns}_00_${ew}_00_DEM`; url = `${D.url}${name}/${name}.tif`;
    const tif = await fromUrl(url); img = await tif.getImage();
    const [w0, s0, e0, n0] = img.getBoundingBox(), W = img.getWidth(), H = img.getHeight();
    const win = [Math.floor((b[0] - w0) / (e0 - w0) * W), Math.floor((n0 - b[3]) / (n0 - s0) * H), Math.ceil((b[2] - w0) / (e0 - w0) * W), Math.ceil((n0 - b[1]) / (n0 - s0) * H)];
    const r = await img.readRasters({ window: win }), px = (e0 - w0) / W, py = (n0 - s0) / H;
    const grid = { w: w0 + win[0] * px, n: n0 - win[1] * py, e: w0 + win[2] * px, s: n0 - win[3] * py, nx: win[2] - win[0], ny: win[3] - win[1], h: Array.from(r[0], v => Math.round(v * 10) / 10), datum: D.datum, source: D.source };
    jz(f, grid); record('dem', f, url, { window: win, licence: D.credit }); return;
  } else throw new Error(`dem kind ${D.kind}?`);
  const [w0, s0, e0, n0] = img.getBoundingBox(), r = await img.readRasters(), nd = img.getGDALNoData();
  const grid = { w: w0, s: s0, e: e0, n: n0, nx: img.getWidth(), ny: img.getHeight(), h: Array.from(r[0], v => v === nd ? null : Math.round(v * 10) / 10), datum: D.datum, source: D.source };
  jz(f, grid); record('dem', f, url, { licence: D.credit });
  console.log(`dem: ${grid.nx} x ${grid.ny} (${D.source})`);
}

// national building heights (adapters with a buildingHeights block): kept raw (never committed), as parts with floors
const hAds = (PL.heights || []).map(id => REG.adapters.find(a => a.id === id && a.buildingHeights)).filter(Boolean);
async function fetchHeights() {
  for (const a of hAds) {
    const B = a.buildingHeights, f = join(RAWD, `heights-${a.id}.json.gz`); if (existsSync(f) && !flag('--refetch')) continue;
    if (B.kind !== 'inspire-bu-parts') throw new Error(`buildingHeights kind ${B.kind}?`);
    const zip = join(RAWD, `${a.id}.zip`); writeFileSync(zip, await get(B.url));
    const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean), member = names.find(n => new RegExp(B.member).test(n));
    const gml = execFileSync('unzip', ['-p', zip, member], { maxBuffer: 1 << 30 }).toString('utf8');
    const P = proj4(B.proj4, 'WGS84'), parts = [], m = 0.003;
    for (const blk of gml.split('<gml:featureMember>').slice(1)) {
      const id = (blk.match(/<base:localId>([^<]+)</) || [])[1], fl = blk.match(/numberOfFloorsAboveGround>(\d+)</), pos = blk.match(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([^<]+)</);
      if (!id || !fl || !pos) continue;
      const n = pos[1].trim().split(/\s+/).map(Number), ring = [];
      for (let i = 0; i + 1 < n.length; i += 2) { const [lon, lat] = P.forward([n[i], n[i + 1]]); ring.push([r7(lon), r7(lat)]); }
      if (!ring.some(([lon, lat]) => lon > AREA[0] - m && lon < AREA[2] + m && lat > AREA[1] - m && lat < AREA[3] + m)) continue;
      parts.push({ id, floors: +fl[1], ring });
    }
    jz(f, { adapter: a.id, source: B.source, member, parts });
    record('heights-' + a.id, f, B.url, { member, parts: parts.length, zip_sha256: sha(readFileSync(zip)), note: 'the original zip and the parts stay in the raw folder (licence: transformed data only)' });
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
  select: { id: 'place-select-osm', version: 2, skill: 'docklands-3d-page' },
  heights: { id: 'place-heights', version: 1, skill: 'docklands-data-curation' },
  tiles: { id: 'place-tiles', version: 2, skill: 'docklands-3d-page' },
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

// ---------- operation 2: heights (pure): OSM height > OSM building:levels x storey > national floors x storey > default
const SMALL = new Set(['garage', 'garages', 'shed', 'kiosk', 'hut', 'carport', 'toilets', 'service', 'cabin', 'bunker', 'transformer_tower', 'roof', 'container', 'stable']);
function heightsOf(sel, nat, P) {
  // national parts: a coarse grid of their centroids, then each OSM polygon takes the area-weighted median of the floors
  // of the parts whose centroid lies inside it
  const grid = new Map(), gk = (lon, lat) => Math.floor(lon / 0.0005) + ',' + Math.floor(lat / 0.0005);
  for (const p of nat) { const c = centroid(p.ring), a = Math.abs(ringArea(p.ring)); p.c = c; p.a = a; const k = gk(...c); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
  const natFloors = rings => { const r = rings[0]; let w0 = Infinity, s0 = Infinity, e0 = -Infinity, n0 = -Infinity; for (const [x, y] of r) { w0 = Math.min(w0, x); e0 = Math.max(e0, x); s0 = Math.min(s0, y); n0 = Math.max(n0, y); }
    const got = []; for (let i = Math.floor(w0 / 0.0005); i <= Math.floor(e0 / 0.0005); i++) for (let j = Math.floor(s0 / 0.0005); j <= Math.floor(n0 / 0.0005); j++) for (const p of grid.get(i + ',' + j) || []) if (inPoly(p.c, rings)) got.push(p);
    if (!got.length) return null; got.sort((a, b) => a.floors - b.floors); const tot = got.reduce((s, p) => s + p.a, 0); let acc = 0; for (const p of got) { acc += p.a; if (acc >= tot / 2) return { floors: p.floors, parts: got.length }; } return null; };
  const H = {}, F = { 'osm-height': 0, 'osm-levels': 0, national: 0, default: 0, 'default-small': 0, 'levels-vs-national-2plus': 0, 'national-zero-floors': 0 };
  for (const b of sel.buildings) {
    let h = null, src = null; const nf = nat.length ? natFloors(b.rings) : null;
    if (b.height != null && b.height > 0) { h = b.height; src = 'osm-height'; }
    else if (b.levels != null && b.levels > 0) { h = b.levels * P.storey_m; src = 'osm-levels'; }
    else if (nf && nf.floors > 0) { h = nf.floors * P.national_storey_m; src = 'national'; }
    else if (SMALL.has(b.kind)) { h = P.default_small_m; src = 'default-small'; }
    else { h = P.default_m; src = 'default'; if (nf && nf.floors === 0) F['national-zero-floors']++; }
    F[src]++;
    if (b.levels != null && nf && Math.abs(b.levels - nf.floors) >= 2) F['levels-vs-national-2plus']++;
    let base = b.min_height ?? (b.min_level != null ? b.min_level * P.storey_m : 0); if (b.kind === 'roof' && !b.min_height) base = Math.max(0, h - 0.6);
    if (base >= h) base = Math.max(0, h - 1);
    H[b.id] = { h: Math.round(h * 10) / 10, base: Math.round(base * 10) / 10, src, nat_floors: nf ? nf.floors : null };
  }
  return { heights: H, faults: F };
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
async function buildTiles(sel, HT, dem, geoidAt, P) {
  const demAt = demSampler(dem), Ng = geoidAt(O.lon, O.lat);
  const ell = (lon, lat) => demAt(lon, lat) + Ng;   // ellipsoidal ground height (DEM datum taken as EGM96 orthometric: stated)
  rmSync(join(OUT, 'tiles'), { recursive: true, force: true }); mkdirSync(join(OUT, 'tiles'), { recursive: true });
  const outFiles = [], children = [], feats = [], tileStats = [];
  const credit = [`© OpenStreetMap contributors (ODbL 1.0)`, demAd.dem.credit, ...hAds.map(a => a.buildingHeights.credit)].join('; ');
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
      const z0 = (H.base > 0 ? gmean + H.base : gmin - 0.5) + Ng, z1 = gmean + H.h + Ng; if (z1 - z0 < 0.5) continue;
      hMin = Math.min(hMin, z0); hMax = Math.max(hMax, z1);
      const fid = bIndex.get(b.id), wc = hex(b.colour) || WALL, rc = hex(b.roof_colour) || (H.h <= 4 ? ROOF_FLAT : ROOF);
      // outer counter-clockwise, holes clockwise (in lon/lat; ENU keeps the sense)
      const rs = rings.map((r, k) => { const ccw = ringArea(r) > 0; return (k === 0) === ccw ? r : r.slice().reverse(); });
      for (const r of rs) for (let k = 0; k < r.length; k++) {
        const a = r[k], c = r[(k + 1) % r.length], A0 = F.toEnu(a[0], a[1], z0), A1 = F.toEnu(a[0], a[1], z1), C0 = F.toEnu(c[0], c[1], z0), C1 = F.toEnu(c[0], c[1], z1);
        let ne = C0[1] - A0[1], nn = -(C0[0] - A0[0]); const l = Math.hypot(ne, nn) || 1; ne /= l; nn /= l;
        const v = bp.length / 3; for (const q of [A0, C0, A1, C1]) { bp.push(...Y(q)); bc2.push(...wc, 255); bf.push(fid); }
        bi.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
      }
      const flat = [], holes = [], v0 = bp.length / 3; rs.forEach((r, k) => { if (k) holes.push(flat.length / 2); for (const [lo, la] of r) { const q = F.toEnu(lo, la, z1); flat.push(q[0], q[1]); bp.push(...Y(q)); bc2.push(...rc, 255); bf.push(fid); } });
      const tri = earcut(flat, holes.length ? holes : null); for (let k = 0; k < tri.length; k += 3) bi.push(v0 + tri[k], v0 + tri[k + 1], v0 + tri[k + 2]);
      // (earcut gives the winding of the input; the roof is drawn from both sides by the reader, so no flip needed)
      feats[fid] = { b, H, tile: cell.key, top: Math.round(z1 * 10) / 10, ground: Math.round((gmean) * 10) / 10 };
      nb++;
    }
    for (const hh of hv) { hMin = Math.min(hMin, hh - P.skirt_m); hMax = Math.max(hMax, hh); }
    const bytes = glb([{ name: 'ground', pos: gp, nrm: gn, uv: guv, idx: gi, png }, { name: 'buildings', pos: bp, col: bc2, fid: bf, idx: bi }], credit);
    const file = join(OUT, 'tiles', cell.key + '.glb'); writeFileSync(file, bytes); outFiles.push(file);
    const cellH = [Math.min(...hv) - P.skirt_m, Math.max(h0, ...hv) + Math.max(0, ...drawn.filter(b => feats[bIndex.get(b.id)]?.tile === cell.key).map(b => HT[b.id].h))];
    children.push({ boundingVolume: { region: [w * D2R, s * D2R, e * D2R, n * D2R, Math.round(cellH[0]), Math.ceil(cellH[1] + 2)] }, geometricError: 0, refine: 'ADD', transform: F.matrix().map(v => Math.round(v * 1e9) / 1e9), content: { uri: `tiles/${cell.key}.glb` } });
    tileStats.push({ key: cell.key, buildings: nb, triangles: (gi.length + bi.length) / 3, bytes: bytes.length });
  }
  const tileset = { asset: { version: '1.1', generator: 'cwplans build-place-tiles.mjs', tilesetVersion: P.version_label, extras: { place: RID, name: REG.name, credit } },
    geometricError: 2000,
    root: { boundingVolume: { region: [AREA[0] * D2R, AREA[1] * D2R, AREA[2] * D2R, AREA[3] * D2R, Math.floor(hMin), Math.ceil(hMax)] }, geometricError: 400, refine: 'ADD', children } };
  const tsf = join(OUT, 'tileset.json'); writeFileSync(tsf, JSON.stringify(tileset, null, 1)); outFiles.push(tsf);
  // features.json: the text and machine interface of the place (names, heights and their source; streets; named points)
  const B = feats.map((f, i) => f && [f.b.id, f.b.name, f.b.addr, f.b.kind, f.b.c[0], f.b.c[1], f.H.h, f.H.src, f.b.levels ?? f.H.nat_floors ?? null, f.tile, f.ground, f.b.wikidata || null, f.b.alt || null, f.b.parent || null]);
  const streets = new Map(); for (const l of sel.lines) if (l.name && l.kind !== 'rail') { const m = l.pts[Math.floor(l.pts.length / 2)]; if (!streets.has(l.name)) streets.set(l.name, [l.name, l.kind === 'water' ? 'waterway' : l.cls, m[0], m[1], l.alt || null]); }
  const areasN = sel.areas.filter(a => a.name).map(a => { const c = centroid(a.rings[0]); return [a.name, a.kind, r7(c[0]), r7(c[1]), a.alt || null]; });
  // the ground as a coarse grid (for the globe's ground height and the eye guard): 33 x 33 over the area, metres of the DEM datum
  const GN = 32, ground = []; for (let j = 0; j <= GN; j++) for (let i = 0; i <= GN; i++) ground.push(Math.round(demAt(AREA[0] + (AREA[2] - AREA[0]) * i / GN, AREA[3] - (AREA[3] - AREA[1]) * j / GN) * 10) / 10);
  const fj = { format: 'place-features-1', place: RID, name: REG.name, label: PL.label || REG.name, search: PL.search || [], timeZone: REG.timeZone, locale: REG.locale, origin: REG.origin, area: AREA, level: L, geoid_m: Math.round(Ng * 100) / 100,
    ground: { grid: GN + 1, h: ground, datum: demAd.dem.datum + '; add geoid_m (EGM96) for WGS84 ellipsoidal heights' }, credit,
    buildings_fields: ['osm_id', 'name', 'address', 'kind', 'lon', 'lat', 'height_m', 'height_source', 'levels', 'tile', 'ground_m', 'wikidata', 'name_alt', 'parent'], buildings: B,
    streets_fields: ['name', 'kind', 'lon', 'lat', 'name_alt'], areas_fields: ['name', 'kind', 'lon', 'lat', 'name_alt'], streets: [...streets.values()].sort((a, b) => a[0].localeCompare(b[0])),
    areas: areasN, points_fields: ['osm_id', 'name', 'kind', 'lon', 'lat', 'address', 'name_alt'], points: sel.points.map(p => [p.id, p.name, p.kind, p.lon, p.lat, p.addr, p.alt || null]), tiles: tileStats };
  const ff = join(OUT, 'features.json'); writeFileSync(ff, JSON.stringify(fj)); outFiles.push(ff);
  return outFiles;
}

// ---------- the build: three operations
async function build() {
  const fOsm = join(RAWD, 'osm.json.gz'), fDem = join(RAWD, 'dem.json.gz'), fGeoid = join(CW, 'docklands', 'data', 'world', 'geoid-egm96-1deg.png');
  for (const f of [fOsm, fDem]) if (!existsSync(f)) throw new Error(`missing ${rel(f)}: run fetch first`);
  const P = { area: AREA, level: L, names: PL.names || ['name'], alt_names: PL.alt_names || [] };
  const fSel = join(WORK, 'select.json.gz');
  const a1 = await run(OPS.select, [fileIn(fOsm, 'osm')], P, async p => { const sel = selectOsm(rz(fOsm), p.names, p.alt_names); jz(fSel, sel); console.log(`  ${sel.buildings.length} buildings and parts, ${sel.areas.length} areas, ${sel.lines.length} lines, ${sel.points.length} named points`); return [fSel]; });
  const natFiles = hAds.map(a => join(RAWD, `heights-${a.id}.json.gz`)).filter(existsSync);
  const HP = { storey_m: 3, national_storey_m: hAds[0]?.buildingHeights.storey_m ?? 3, default_m: PL.default_height_m ?? 9, default_small_m: 3, rule: 'osm height > osm building:levels x storey > national floors (area-weighted median of the parts whose centroid is inside) x storey > default (small kinds 3 m)' };
  const fH = join(WORK, 'heights.json.gz');
  const a2 = await run(OPS.heights, [fileIn(fSel, 'selected'), ...natFiles.map(f => fileIn(f, 'national-heights'))], HP, async p => {
    const nat = natFiles.flatMap(f => rz(f).parts), r = heightsOf(rz(fSel), nat, p); jz(fH, r); console.log('  height sources and faults:', JSON.stringify(r.faults)); return [fH]; });
  const TP = { grid: 32, tex: 512, jpeg: 82, skirt_m: 300, version_label: `${RID}-1` };
  const a3 = await run(OPS.tiles, [fileIn(fSel, 'selected'), fileIn(fH, 'heights'), fileIn(fDem, 'dem'), fileIn(fGeoid, 'geoid')], TP, async p => {
    const geo = await geoidSampler(fGeoid); return buildTiles(rz(fSel), rz(fH).heights, rz(fDem), geo, p); });
  // the committed log: fetch records (no local paths of raw files beyond their names), the three activities, the fault counts
  const HZ = rz(fH);
  blog.about = `Build log of the place ${RID} (${REG.name}) by cwplans/tools/build-place-tiles.mjs: what was fetched (URL, date, SHA-256) and each dataflow activity with its input and output hashes. Raw files stay in cwplans/data/raw/places/${RID}/ (not committed).`;
  blog.fetches = flog; blog.height_sources = HZ.faults; blog.fault = 'F55 (curation skill fault register): buildings with no height in OSM; counted, not patched per record';
  writeFileSync(BLOG, JSON.stringify(blog, null, 1));
  // the index of places (one entry per place built)
  const IX = join(OUTROOT, 'index.json'), ix = existsSync(IX) ? JSON.parse(readFileSync(IX, 'utf8')) : { format: 'places-index-1', about: 'Places on the globe built as 3D Tiles 1.1 by cwplans/tools/build-place-tiles.mjs; read by docklands/globe/places.js', places: [] };
  const fj = JSON.parse(readFileSync(join(OUT, 'features.json'), 'utf8'));
  const entry = { id: RID, name: REG.name, label: fj.label, area: AREA, centre: [O.lon, O.lat], timeZone: REG.timeZone, locale: REG.locale, tileset: `${RID}/tileset.json`, features: `${RID}/features.json`, credit: fj.credit, buildings: fj.buildings.filter(Boolean).length, built: a3.at || null };
  ix.places = ix.places.filter(p => p.id !== RID).concat(entry).sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(IX, JSON.stringify(ix, null, 1));
  let tot = 0; for (const f of readdirSync(join(OUT, 'tiles'))) tot += readFileSync(join(OUT, 'tiles', f)).length;
  console.log(`done: ${fj.tiles.length} tiles, ${entry.buildings} buildings, tiles ${(tot / 1e6).toFixed(2)} MB, features.json ${(readFileSync(join(OUT, 'features.json')).length / 1e6).toFixed(2)} MB`);
}

if (cmd === 'fetch' || cmd === 'all') { await fetchOsm(); await fetchDem(); await fetchHeights(); }
if (cmd === 'build' || cmd === 'all') await build();
