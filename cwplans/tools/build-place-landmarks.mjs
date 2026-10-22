#!/usr/bin/env node
// Landmarks of a place on the globe: mosques with their minarets and domes, church towers and spires, synagogues and
// clock towers, as a separate 3D Tiles 1.1 set beside the place's own (cwplans/tools/build-place-tiles.mjs, not edited
// here). Owner, 2026-10-22: "Currently you show it [Sarajevo] without its distinctive landscape of mosques (especially
// their minarets). We need to fix that." The place tiles draw OSM building parts as prisms in the core only, and the
// city ring as flat blocks of buildings >= 40 m2, so at the 8 km city view no minaret, tower or dome is drawn at all.
//
//   node cwplans/tools/build-place-landmarks.mjs --region sarajevo            fetch what is missing, then build
//   node cwplans/tools/build-place-landmarks.mjs fetch --region sarajevo [--refetch]
//   node cwplans/tools/build-place-landmarks.mjs build --region sarajevo [--force]
//   node cwplans/tools/build-place-landmarks.mjs readme --region sarajevo
//
// Region config: `place.landmarks` (box: 'city' or [w, s, e, n]; estimate_minarets: true|false = the switch of the
// estimated class; minaret_rule: the size classes). No locale constant here; the qibla is computed from the place.
// Fetch (raw, git-ignored: cwplans/data/raw/places/<id>/landmarks/): (1) three Overture queries by DuckDB
// (fetch-overture-theme.py): religious buildings and buildings with parts, all building parts, places of worship (the
// places theme, CDLA-Permissive-2.0: used ONLY to find where to look; nothing from it is drawn or committed); (2) the OSM
// API 0.6 map.json of a small box round each candidate (boxes merged up to 700 m, one request at a time, 1.1 s apart,
// split in four on 400): the full OSM tags of the buildings, parts and nodes there (man_made=minaret nodes included).
// Overpass refused (2026-10-21: overpass-api.de reset, kumi and private.coffee timed out, mail.ru 504) and Geofabrik
// reset the connection, so a minaret mapped as a node far from any candidate is not found (stated in the README).
// Dataflow (skill cwplans-dataflow): two named operations over inputs fixed by SHA-256 and parameters, logged in
// places/<id>/landmarks/log.json: landmark-select (OSM answers + the core's features.json -> mosques, minarets mapped and
// estimated, domes, towers) and landmark-tiles (the selection + the place's tileset and tiles (ground and block tops as
// drawn) + features.json -> tiles/*.glb, tileset.json, landmarks.json). Bodies read only their inputs.
// Output: cwplans/docklands/data/places/<id>/landmarks/ (tileset.json, tiles/<l>-<x>-<y>.glb, landmarks.json: the
// feature table and text interface, log.json, README.md) and cwplans/docklands/data/places/landmarks.json (index).
// Reader: docklands/globe/landmarks.js (hooked from places.js). Skill: docklands-3d-page, "Landmarks: minarets, domes
// and towers (2026-10-22)".
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import REGIONS from '../../docklands/geo/regions/index.js';
import { enuFrame, geodeticToEcef, ecefToGeodetic, enuBasis, D2R } from '../../docklands/geo/ellipsoid.js';

const UA = 'glitchcan-cwplans/0.1 (https://github.com/danbri/londat)';
const TOOL = 'tools/build-place-landmarks.mjs';
const CW = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), flag = f => argv.includes(f);
const argOf = k => { const i = argv.findIndex(a => a === '--' + k || a.startsWith('--' + k + '=')); if (i < 0) return null; return argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1]; };
const RID = argOf('region'); if (!RID) { console.error('usage: build-place-landmarks.mjs [fetch|build|readme] --region <id>'); process.exit(2); }
const REG = REGIONS[RID]; if (!REG?.place?.landmarks) throw new Error(`region ${RID} has no place.landmarks block`);
const PL = REG.place, LM = PL.landmarks;
const cmd = ['fetch', 'build', 'readme'].find(c => argv.includes(c)) || 'all';
const RAWD = join(CW, 'data', 'raw', 'places', RID, 'landmarks'), OSMD = join(RAWD, 'osm'), WORK = join(RAWD, 'work');
// a place in another repository (place.outRepo, outPath, tileBase: Dublin): its folder is --out (a checkout of that repository)
const XPL = PL.outRepo ? PL : null;
const PLACED = XPL ? (argOf('out') || join(CW, '..', '..', XPL.outRepo, XPL.outPath)) : join(CW, 'docklands', 'data', 'places', RID), OUT = join(PLACED, 'landmarks');
for (const d of [RAWD, OSMD, WORK, OUT, join(OUT, 'tiles')]) mkdirSync(d, { recursive: true });
const sha = b => createHash('sha256').update(b).digest('hex');
const rel = p => XPL && !relative(PLACED, p).startsWith('..') ? `${XPL.outRepo}:${XPL.outPath}${relative(PLACED, p)}` : relative(CW, p);
const absOf = q => XPL && q.startsWith(XPL.outRepo + ':') ? join(PLACED, q.slice(XPL.outRepo.length + 1 + XPL.outPath.length)) : join(CW, q);
const jz = (p, o) => writeFileSync(p, gzipSync(JSON.stringify(o)));
const rz = p => JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));
const r7 = v => Math.round(v * 1e7) / 1e7, r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const pause = ms => new Promise(r => setTimeout(r, ms));
const O = REG.origin, mLat = 110574, mLon = 111320 * Math.cos(O.lat * D2R);
const FEAT = join(PLACED, 'features.json'), TSET = join(PLACED, 'tileset.json');
const fjCore = JSON.parse(readFileSync(FEAT, 'utf8'));
const BOX = LM.box === 'city' ? [Math.min(PL.city.bbox[0], fjCore.area[0]), Math.min(PL.city.bbox[1], fjCore.area[1]), Math.max(PL.city.bbox[2], fjCore.area[2]), Math.max(PL.city.bbox[3], fjCore.area[3])] : LM.box;
const OVR = LM.overture_release || '2026-09-23.1';

// ---------- fetch log (raw) and build log (committed)
const FLOG = join(RAWD, 'fetch-log.json'), flog = existsSync(FLOG) ? JSON.parse(readFileSync(FLOG, 'utf8')) : {};
const saveFlog = () => writeFileSync(FLOG, JSON.stringify(flog, null, 1));
const BLOG = join(OUT, 'log.json');
const blog = existsSync(BLOG) ? JSON.parse(readFileSync(BLOG, 'utf8')) : { about: '', fetches: {}, activities: [] };
function record(what, file, url, extra = {}) { const b = readFileSync(file); flog[what] = { url, fetched: new Date().toISOString(), bytes: b.length, sha256: sha(b), file: rel(file), ...extra }; saveFlog(); }

// ---------- fetch 1: Overture (where to look)
const OVQ = {
  religious: { theme: 'buildings', type: 'building', columns: 'names,class,subtype,height,min_height,roof_shape,roof_height,num_floors,has_parts',
    where: "subtype = 'religious' OR class IN ('mosque','church','cathedral','chapel','synagogue','temple','shrine','religious','monastery','bell_tower','tower','clock_tower') OR roof_shape IN ('dome','onion','cone') OR has_parts" },
  parts: { theme: 'buildings', type: 'building_part', columns: 'building_id,names,height,min_height,roof_shape,roof_height', where: '' },
  worship: { theme: 'places', type: 'place', columns: 'names,basic_category',
    where: "basic_category ILIKE '%mosque%' OR basic_category ILIKE '%church%' OR basic_category ILIKE '%synagog%' OR basic_category ILIKE '%relig%' OR basic_category ILIKE '%worship%' OR basic_category ILIKE '%cathedral%'" },
};
const ovFile = k => join(RAWD, `ov-${k}-${OVR}.json`);
function fetchOverture() {
  for (const [k, Q] of Object.entries(OVQ)) {
    const f = ovFile(k); if (existsSync(f) && !flag('--refetch')) continue;
    execFileSync(process.env.CWPLANS_DUCKDB_PYTHON || 'python3', ['-I', join(CW, 'tools', 'fetch-overture-theme.py'), OVR, Q.theme, Q.type, ...BOX.map(String), f, Q.columns, Q.where], { stdio: 'inherit' });
    const R = JSON.parse(readFileSync(f, 'utf8'));
    record('overture-' + k, f, `s3://overturemaps-us-west-2/release/${OVR}/theme=${Q.theme}/type=${Q.type}/ (bbox ${BOX.join(',')}; files ${R.files_read.join(' ')})`,
      { source: k === 'worship' ? 'overture-places' : 'overture-buildings', request: `DuckDB read_parquet over HTTPS of the ${R.files_listed} files of the release, filter on bbox and: ${Q.where || 'none'}`, records: R.rows.length,
        use: k === 'worship' ? 'positions only, to choose the OSM boxes; not drawn, not committed' : 'positions only, to choose the OSM boxes (the OSM answers give the tags and geometry)' });
  }
}
// ---------- fetch 1b (region config place.landmarks.tall_objects): tall thin objects of the skyline (chimneys, obelisks,
// monuments, masts, towers) with an OSM height, from the QLever OSM endpoint (one SPARQL POST over the country relation;
// positions only: the OSM API boxes below give the full tags and geometry)
const TALL = LM.tall_objects || null, TALLF = join(RAWD, 'qlever-tall.tsv');
async function fetchTall() {
  if (!TALL || (existsSync(TALLF) && !flag('--refetch'))) return;
  const vals = a => (a || []).map(v => JSON.stringify(v)).join(', ');
  const q = `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX osmrel: <https://www.openstreetmap.org/relation/>
PREFIX ogc: <http://www.opengis.net/rdf#>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
SELECT ?e ?mm ?hist ?h ?name ?wkt WHERE {
  osmrel:${TALL.area_relation} ogc:sfContains ?e .
  ?e osmkey:height ?h .
  OPTIONAL { ?e osmkey:man_made ?mm } OPTIONAL { ?e osmkey:historic ?hist } OPTIONAL { ?e osmkey:name ?name }
  FILTER(?mm IN (${vals(TALL.man_made)}) || ?hist IN (${vals(TALL.historic)}))
  ?e geo:hasGeometry/geo:asWKT ?wkt .
}`;
  const r = await fetch(TALL.endpoint, { method: 'POST', body: new URLSearchParams({ query: q }), headers: { 'User-Agent': UA, Accept: 'text/tab-separated-values', 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!r.ok) throw new Error(`${r.status} ${TALL.endpoint}`); const buf = Buffer.from(await r.arrayBuffer()); writeFileSync(TALLF, buf);
  record('qlever-tall', TALLF, TALL.endpoint, { source: 'osm', request: 'SPARQL POST (text/tab-separated-values): ' + q.replace(/\s+/g, ' '), rows: buf.toString('utf8').split('\n').filter(Boolean).length - 1,
    licence: 'ODbL 1.0, © OpenStreetMap contributors', use: 'positions only, to choose the OSM boxes (the OSM answers give the tags and geometry)', as_fetched: { bytes: buf.length, sha256: sha(buf) } });
  console.log(`qlever tall objects: ${flog['qlever-tall'].rows} rows`);
}
// the QLever rows: [osm id, lon, lat, height] of the tall candidates (first coordinate pair of the WKT: the node, or a vertex)
function tallRows() { if (!TALL || !existsSync(TALLF)) return [];
  return readFileSync(TALLF, 'utf8').split('\n').slice(1).map(l => l.split('\t')).filter(f => f.length >= 6).map(f => { const m = f[5].match(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/), h = num(String(f[3]).replace(/^"|"$/g, '').replace(/^~/, '')); return m ? [f[0], +m[1], +m[2], h] : null; })
    .filter(r => r && r[3] >= TALL.min_height_m); }
const centroidOf = g => { const c = g.type === 'Point' ? [g.coordinates] : g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.coordinates; let x = 0, y = 0; for (const p of c) { x += p[0]; y += p[1]; } return [x / c.length, y / c.length]; };
const RELIG_KIND = new Set(['mosque', 'church', 'cathedral', 'chapel', 'synagogue', 'temple', 'religious', 'shrine', 'monastery', 'clock_tower', 'tekke', 'mausoleum']);
const NAME_RX = /d[žz]amij|mesd[žz]id|munar|crkv|katedral|sinagog|hram|sahat|tekij|turbe|kapel/i;
function candidates() {
  const pts = [];
  const rv = JSON.parse(readFileSync(ovFile('religious'), 'utf8')).rows;
  for (const r of rv) { if (r.subtype === 'religious' || RELIG_KIND.has(r.class) || ['dome', 'onion', 'cone'].includes(r.roof_shape) || NAME_RX.test(r.names?.primary || '')) pts.push(centroidOf(r.geometry)); }
  for (const r of JSON.parse(readFileSync(ovFile('parts'), 'utf8')).rows) if (['dome', 'onion', 'cone', 'pyramidal'].includes(r.roof_shape)) pts.push(centroidOf(r.geometry));
  for (const r of JSON.parse(readFileSync(ovFile('worship'), 'utf8')).rows) pts.push(centroidOf(r.geometry));
  const F = fjCore.buildings_fields, ix = k => F.indexOf(k);
  for (const b of fjCore.buildings) if (b && (RELIG_KIND.has(b[ix('kind')]) || NAME_RX.test(b[ix('name')] || ''))) pts.push([b[ix('lon')], b[ix('lat')]]);
  for (const t of tallRows()) pts.push([t[1], t[2]]);
  return pts.filter(([x, y]) => x >= BOX[0] && x <= BOX[2] && y >= BOX[1] && y <= BOX[3]);
}
// boxes of +-PAD m round each candidate, merged while they overlap and the union stays under MAXB m a side
function boxes(pts, PAD = 80, MAXB = 700) {
  let B = pts.map(([x, y]) => [x - PAD / mLon, y - PAD / mLat, x + PAD / mLon, y + PAD / mLat]);
  for (let changed = true; changed;) { changed = false;
    B.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let i = 0; i < B.length && !changed; i++) for (let j = i + 1; j < B.length; j++) { const a = B[i], b = B[j]; if (b[0] > a[2]) break;
      if (b[1] > a[3] || b[3] < a[1]) continue; const u = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
      if ((u[2] - u[0]) * mLon > MAXB || (u[3] - u[1]) * mLat > MAXB) continue; B[i] = u; B.splice(j, 1); changed = true; break; } }
  return B.map(b => b.map(v => +v.toFixed(6))).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) { const e = new Error(`${r.status} ${url}`); e.status = r.status; throw e; }
  return Buffer.from(await r.arrayBuffer());
}
const OSMF = join(RAWD, 'osm-landmarks.json.gz');
async function fetchOsm() {
  if (existsSync(OSMF) && !flag('--refetch')) return;
  const B = boxes(candidates()), els = new Map(), got = [];
  console.log(`osm: ${B.length} boxes round the candidates`);
  async function box(b, depth) {
    const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${b.map(v => v.toFixed(6)).join(',')}`, key = sha(url).slice(0, 12), f = join(OSMD, key + '.json.gz');
    let buf;
    if (existsSync(f) && !flag('--refetch')) buf = gunzipSync(readFileSync(f));
    else {
      try { await pause(1100); buf = await get(url); writeFileSync(f, gzipSync(buf)); }
      catch (e) { if (e.status !== 400 || depth > 3) throw e; const mx = (b[0] + b[2]) / 2, my = (b[1] + b[3]) / 2;
        for (const q of [[b[0], b[1], mx, my], [mx, b[1], b[2], my], [b[0], my, mx, b[3]], [mx, my, b[2], b[3]]]) await box(q, depth + 1); return; } }
    got.push({ url, bytes: buf.length, sha256: sha(buf) });
    for (const e of JSON.parse(buf.toString('utf8')).elements) els.set(e.type[0] + e.id, e);
    if (got.length % 20 === 0) console.log(`osm: ${got.length} answers, ${els.size} elements`);
  }
  for (const b of B) await box(b, 0);
  const all = [...els.values()].sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.id - b.id));
  const latest = all.reduce((m, e) => e.timestamp > m ? e.timestamp : m, '');
  jz(OSMF, { generator: 'OSM API 0.6 map.json (boxes round the landmark candidates)', bbox: BOX, boxes: B, elements: all });
  record('osm-landmarks', OSMF, 'https://api.openstreetmap.org/api/0.6/map.json?bbox=... (one box per entry of as_fetched)', { source: 'osm', requests: got.length, as_fetched: got, elements: all.length, latest_element_timestamp: latest,
    licence: 'ODbL 1.0, © OpenStreetMap contributors', stored_as: 'the elements of all answers merged by type and id, sorted, gzip JSON (sha256 above)' });
  console.log(`osm: ${all.length} elements in ${got.length} answers`);
}

// ---------- dataflow runtime (as build-place-tiles.mjs): inputs by SHA-256, activity id, memo by log.json
const fileIn = (p, label) => ({ label, path: rel(p), sha256: sha(readFileSync(p)) });
async function run(op, inputs, params, body) {
  const act = sha(JSON.stringify([op.id, op.version, inputs.map(i => i.sha256), params])).slice(0, 16);
  const prev = blog.activities.find(a => a.activity === act);
  if (prev && !flag('--force') && prev.outputs.every(o => existsSync(absOf(o.path)) && sha(readFileSync(absOf(o.path))) === o.sha256)) { console.log(`${op.id}: in the log (${act})`); return prev; }
  const t0 = Date.now(), res = await body(params), outs = res.files || res, rec = { activity: act, operation: op.id, version: op.version, skill: op.skill, tool: TOOL, inputs, params,
    outputs: outs.map(p => ({ path: rel(p), sha256: sha(readFileSync(p)), bytes: readFileSync(p).length })), ...(res.counts ? { counts: res.counts } : {}), ms: Date.now() - t0, at: new Date().toISOString() };
  if (rec.outputs.some(o => o.path.startsWith('data/raw'))) rec.note = 'outputs under data/raw are intermediate (not committed); their hashes fix the next step';
  blog.activities = blog.activities.filter(a => a.activity !== act && a.operation !== op.id).concat(rec);   // the latest run of each operation (a re-run replaces it)
  console.log(`${op.id}: ran (${act}, ${rec.ms} ms)`); return rec;
}
const OPS = {
  select: { id: 'landmark-select', version: 2, skill: 'docklands-3d-page' },   // 2: the balcony is any raised part of the stack below the top. OSM answers + core features -> worship buildings, minarets (mapped, estimated), domes, towers
  tiles: { id: 'landmark-tiles', version: 2, skill: 'docklands-3d-page' },     // 2: the balcony ring at most 1.3 m high (corbel and parapet). selection + the place's tiles (ground, block tops as drawn) -> glb, tileset.json, landmarks.json
};

// ---------- geometry helpers (lon/lat; local metres by a flat approximation round a reference)
const toXY = (r, ref) => r.map(([lo, la]) => [(lo - ref[0]) * mLon, (la - ref[1]) * mLat]);
const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(a / 2 * mLon * mLat); };
const open = r => (r.length > 1 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? r.slice(0, -1) : r);
const centroid = r => { const o = open(r); let x = 0, y = 0; for (const p of o) { x += p[0]; y += p[1]; } return [x / o.length, y / o.length]; };
const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const distM = (a, b) => Math.hypot((a[0] - b[0]) * mLon, (a[1] - b[1]) * mLat);
const ringDist = (p, r) => { if (inRing(p, r)) return 0; let d = Infinity; const P = [(p[0]) * mLon, p[1] * mLat]; for (let i = 0; i + 1 < r.length; i++) { const a = [r[i][0] * mLon, r[i][1] * mLat], b = [r[i + 1][0] * mLon, r[i + 1][1] * mLat], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((P[0] - a[0]) * dx + (P[1] - a[1]) * dy) / L)) : 0; d = Math.min(d, Math.hypot(P[0] - a[0] - t * dx, P[1] - a[1] - t * dy)); } return d; };
function hull(pts) { const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p; const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); } for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); } return lo.slice(0, -1).concat(up.slice(0, -1)); }
// the minimum-area oriented box of an outline: its half sides (metres)
function obbHalf(ring) { const ref = centroid(ring), h = hull(toXY(open(ring), ref)); let best = null; for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!L) continue; const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity; for (const q of h) { const u = q[0] * ux + q[1] * uy, v = -q[0] * uy + q[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const A = (u1 - u0) * (v1 - v0); if (!best || A < best.A) best = { A, hu: (u1 - u0) / 2, hv: (v1 - v0) / 2 }; } return best || { hu: 1, hv: 1 }; }
const num = v => { if (v == null) return null; const m = String(v).replace(',', '.').match(/^\s*(-?\d+(\.\d+)?)\s*(m|metres|meters)?\s*$/); return m ? +m[1] : null; };
// bearing (degrees from north) of the great circle from (lon, lat) to the Kaaba (21.4225 N, 39.8262 E): the qibla
const KAABA = [39.8262, 21.4225];
function qibla(lon, lat) { const p1 = lat * D2R, p2 = KAABA[1] * D2R, dl = (KAABA[0] - lon) * D2R; return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / D2R + 360) % 360; }

// ---------- operation 1: select (pure: OSM answers + core features -> the landmark list)
const MOSQUE_NOT = /tekij|tekke|turbe|mekteb|medres|hamam|hanikah|musal/i;
function selectLandmarks(osm, fj, P) {
  const N = new Map(), W = new Map(); for (const e of osm.elements) { if (e.type === 'node') N.set(e.id, e); else if (e.type === 'way') W.set(e.id, e); }
  const wayRing = w => { const r = w.nodes.map(id => N.get(id)).filter(Boolean).map(n => [n.lon, n.lat]); return r.length >= 4 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? r : null; };
  const relRing = rl => { const outs = rl.members.filter(m => m.type === 'way' && m.role === 'outer').map(m => W.get(m.ref)).filter(Boolean); if (outs.length === 1) return wayRing(outs[0]);
    // join the outer ways end to end; the largest closed ring
    const segs = outs.map(w => w.nodes.slice()), rings = []; while (segs.length) { let cur = segs.shift(); for (let k = 0; k < 200 && cur[0] !== cur.at(-1); k++) { const i = segs.findIndex(s => s[0] === cur.at(-1) || s.at(-1) === cur.at(-1)); if (i < 0) break; const s = segs.splice(i, 1)[0]; cur = cur.concat((s[0] === cur.at(-1) ? s : s.reverse()).slice(1)); } if (cur[0] === cur.at(-1)) rings.push(cur); }
    const rr = rings.map(ids => ids.map(id => N.get(id)).filter(Boolean).map(n => [n.lon, n.lat])).filter(r => r.length >= 4); return rr.sort((a, b) => ringArea(b) - ringArea(a))[0] || null; };
  const osmId = e => e.type[0] + e.id;
  const feats = new Map(); { const F = fj.buildings_fields, ix = k => F.indexOf(k); for (const b of fj.buildings) if (b) feats.set(b[ix('osm_id')], { name: b[ix('name')], ground_m: b[ix('ground_m')], height_m: b[ix('height_m')] }); }
  const nameOf = t => { for (const k of P.names) if (t[k]) return t[k]; return null; }, altOf = (t, nm) => { for (const k of P.alt_names) if (t[k] && t[k] !== nm) return t[k]; return null; };
  // buildings and parts with outlines
  const B = [], parts = [];
  for (const e of osm.elements) { const t = e.tags || {}; if (!(t.building || t['building:part'])) continue; if (e.type === 'node') continue;
    const ring = e.type === 'way' ? wayRing(e) : e.type === 'relation' && (t.type === 'multipolygon' || t.type === 'building') ? relRing(e) : null; if (!ring) continue;
    const o = { id: osmId(e), t, ring, c: centroid(ring), area: ringArea(ring) }; if (t['building:part'] && !t.building) parts.push(o); else B.push(o); }
  const inside = (p, list, tol = 0) => list.filter(b => tol ? ringDist(p, b.ring) <= tol : inRing(p, b.ring)).sort((a, b) => a.area - b.area)[0] || null;
  // worship buildings: tagged on the outline, or named by a place_of_worship node inside (or within 8 m)
  const religionOf = t => t.religion || (t.building === 'mosque' ? 'muslim' : ['church', 'cathedral', 'chapel', 'basilica'].includes(t.building) ? 'christian' : t.building === 'synagogue' ? 'jewish' : null);
  const worship = new Map();
  for (const b of B) { const t = b.t; if (t.amenity === 'place_of_worship' || ['mosque', 'church', 'cathedral', 'chapel', 'synagogue', 'basilica'].includes(t.building)) worship.set(b.id, { b, t, src: 'outline' }); }
  const poiNodes = osm.elements.filter(e => e.type === 'node' && e.tags?.amenity === 'place_of_worship');
  const noOutline = [];
  for (const n of poiNodes) { const p = [n.lon, n.lat], b = inside(p, B) || inside(p, B, 8); if (!b) { noOutline.push({ id: osmId(n), name: nameOf(n.tags), religion: n.tags.religion || null }); continue; }
    const w = worship.get(b.id); if (w) { w.poi = n; continue; } worship.set(b.id, { b, t: { ...b.t, ...n.tags, building: b.t.building }, src: 'node ' + osmId(n), poi: n }); }
  // minarets mapped: by tag (ways and nodes), then the part-stack rule
  const isMinaretTag = t => t.man_made === 'minaret' || t.building === 'minaret' || t['building:part'] === 'minaret' || t['tower:type'] === 'minaret' || t.minaret === 'yes' && t.man_made === 'tower';
  const minarets = [];
  for (const e of osm.elements) { const t = e.tags || {}; if (!isMinaretTag(t)) continue;
    if (e.type === 'node') minarets.push({ id: osmId(e), c: [e.lon, e.lat], ring: null, t, parts: [] });
    else { const ring = e.type === 'way' ? wayRing(e) : null; if (ring) minarets.push({ id: osmId(e), c: centroid(ring), ring, t, area: ringArea(ring), parts: [] }); } }
  const used = new Set(minarets.map(m => m.id));
  // parts of each worship building (centroid inside its outline or within 3 m)
  const W2 = [...worship.values()];
  const partsOf = new Map(); for (const p of parts) { const w = W2.find(x => inRing(p.c, x.b.ring)) || W2.find(x => ringDist(p.c, x.b.ring) <= 3); if (w) (partsOf.get(w.b.id) || partsOf.set(w.b.id, []).get(w.b.id)).push(p); }
  // part-stack rule: in a mosque, slender parts (<= 40 m2) whose top is >= 18 m and >= 1.6 x the hall's top, stacked (centroids within 2.5 m)
  for (const w of W2) { if (religionOf(w.t) !== 'muslim') continue; const ps = partsOf.get(w.b.id) || [];
    const top = p => num(p.t.height) ?? 0, hall = Math.max(0, ...ps.filter(p => p.area > 40).map(top));
    const slender = ps.filter(p => p.area <= 40 && !used.has(p.id));
    const seeds = slender.filter(p => top(p) >= 18 && top(p) >= 1.6 * hall).sort((a, b) => top(b) - top(a));
    for (const s of seeds) { if (used.has(s.id)) continue; const stack = slender.filter(p => !used.has(p.id) && distM(p.c, s.c) <= 2.5); stack.forEach(p => used.add(p.id));
      minarets.push({ id: s.id, c: s.c, ring: s.ring, t: s.t, area: s.area, parts: stack, rule: 'part-stack' }); } }
  for (const m of minarets) for (const p of m.parts) used.add(p.id);
  // attach each minaret to its mosque (the worship building it stands in or the nearest within 30 m)
  const mosques = W2.filter(w => religionOf(w.t) === 'muslim');
  for (const m of minarets) { let best = null, bd = 31; for (const w of mosques) { const d = ringDist(m.c, w.b.ring); if (d < bd) { bd = d; best = w; } } m.mosque = best ? best.b.id : null; m.dist = best ? r1(bd) : null; }
  // domes mapped: parts (not of a minaret) with roof:shape dome / onion; worship outlines with roof:shape dome and no parts
  const DOMES = new Set(['dome', 'onion']);
  const domes = [];
  for (const w of W2) { const ps = partsOf.get(w.b.id) || []; for (const p of ps) if (DOMES.has(p.t['roof:shape']) && !used.has(p.id)) { domes.push({ id: p.id, c: p.c, ring: p.ring, area: p.area, t: p.t, of: w.b.id }); used.add(p.id); }
    if (!ps.length && DOMES.has(w.t['roof:shape'])) domes.push({ id: w.b.id, c: w.b.c, ring: w.b.ring, area: w.b.area, t: w.t, of: w.b.id, whole: true }); }
  // towers: tower parts of worship buildings (tagged as towers, or a pointed / onion roof standing >= 1.25 x the body), towers of
  // clock and bell by tag (ways and nodes), anywhere in the box
  const TOWERP = new Set(['tower', 'bell_tower', 'church_tower', 'steeple', 'clock_tower', 'belfry']), POINTED = new Set(['pyramidal', 'cone', 'spire', 'onion', 'conical']);
  const towers = [];
  for (const w of W2) { const ps = (partsOf.get(w.b.id) || []).filter(p => !used.has(p.id)); const body = Math.max(0, ...ps.filter(p => !TOWERP.has(p.t['building:part']) && !POINTED.has(p.t['roof:shape'])).map(p => num(p.t.height) ?? 0));
    for (const p of ps) { const h = num(p.t.height); if (!h) continue; if (TOWERP.has(p.t['building:part']) || p.t['tower:type'] === 'bell_tower' || (POINTED.has(p.t['roof:shape']) && h >= 1.25 * body && h >= 12)) { towers.push({ id: p.id, c: p.c, ring: p.ring, area: p.area, t: p.t, of: w.b.id }); used.add(p.id); } } }
  const isClockOrBell = t => (t.man_made === 'tower' && ['bell_tower', 'clock'].includes(t['tower:type'])) || ['clock_tower', 'bell_tower'].includes(t.building) || /sahat.?kula/i.test(t.name || '');
  for (const e of osm.elements) { const t = e.tags || {}; if (!isClockOrBell(t) || used.has(osmId(e))) continue;
    if (e.type === 'node') towers.push({ id: osmId(e), c: [e.lon, e.lat], ring: null, t, node: true }); else if (e.type === 'way') { const ring = wayRing(e); if (ring) towers.push({ id: osmId(e), c: centroid(ring), ring, area: ringArea(ring), t, of: null }); }
    used.add(osmId(e)); }
  // tall thin objects (place.landmarks.tall_objects; Dublin: the Spire, the Poolbeg chimneys, the Wellington Monument):
  // OSM man_made / historic values of the list with an OSM height >= min_height_m, not taken above; a man_made=tower with an
  // outline of 12 m2 or more is drawn as a tower (prism and cap), the rest as bodies of revolution by kind
  const tall = [], tallSkipped = { excluded_tower_type: 0, low: 0, outside_box: 0 };
  if (P.tall) { const T = P.tall, mmOK = new Set(T.man_made || []), hiOK = new Set(T.historic || []), exT = new Set(T.exclude_tower_types || []);
    for (const e of osm.elements) { const t = e.tags || {}; if (used.has(osmId(e)) || !(mmOK.has(t.man_made) || hiOK.has(t.historic))) continue;
      if (exT.has(t['tower:type'])) { tallSkipped.excluded_tower_type++; continue; }
      const h = num(String(t.height || '').replace(/^~/, '')); if (!(h >= T.min_height_m)) { tallSkipped.low++; continue; }
      let ring = null, c; if (e.type === 'node') c = [e.lon, e.lat]; else { ring = e.type === 'way' ? wayRing(e) : relRing(e); if (!ring) continue; c = centroid(ring); }
      if (P.box && (c[0] < P.box[0] || c[0] > P.box[2] || c[1] < P.box[1] || c[1] > P.box[3])) { tallSkipped.outside_box++; continue; }
      const kind = t.man_made === 'chimney' ? 'chimney' : t.man_made === 'obelisk' ? 'obelisk' : t.man_made === 'mast' ? 'mast' : t.man_made === 'tower' ? 'tower' : 'monument', area = ring ? ringArea(ring) : null;
      used.add(osmId(e));
      if (kind === 'tower' && ring && area >= 12) { towers.push({ id: osmId(e), c, ring, area, t, of: null }); continue; }
      tall.push({ id: osmId(e), kind, c, ring, area, t, h, tag: t.man_made ? `man_made=${t.man_made}` : `historic=${t.historic}` }); } }
  // estimated minarets: a mosque (muslim worship outline, not a tekke, turbe, mekteb, medresa, hamam or musala) with no
  // mapped minaret within 30 m gets one, by the size class of its footprint, at the hull corner farthest along qibla + 135 deg
  // (the north-west front's west corner where Sarajevo's Ottoman minarets stand; checked against the mapped ones below), or
  // nearest the mapped entrance if there is one
  const MR = P.minaret_rule;
  const hasMinaret = new Set(minarets.map(m => m.mosque).filter(Boolean));
  const estimated = [], excluded = [];
  const sizeClass = A => MR.classes.find(c => A < c.max_area_m2) || MR.classes.at(-1);
  const entrances = osm.elements.filter(e => e.type === 'node' && e.tags?.entrance && e.tags.entrance !== 'no');
  function rulePos(w) { const ref = w.b.c, pts = open(w.b.ring), q = qibla(ref[0], ref[1]), dirB = (q + MR.corner_bearing_from_qibla) * D2R, ux = Math.sin(dirB), uy = Math.cos(dirB);
    const ent = entrances.find(e => ringDist([e.lon, e.lat], w.b.ring) < 0.5 && w.b.ring.some(p => p[0] === e.lon && p[1] === e.lat));
    let corner, how;
    if (ent) { corner = pts.slice().sort((a, b) => distM(a, [ent.lon, ent.lat]) - distM(b, [ent.lon, ent.lat]))[0]; how = 'entrance'; }
    else { const H = hull(pts); corner = H.reduce((m, p) => { const s = (p[0] - ref[0]) * mLon * ux + (p[1] - ref[1]) * mLat * uy; return s > m.s ? { s, p } : m; }, { s: -Infinity, p: H[0] }).p; how = 'qibla'; }
    return { corner, how, qibla_deg: r1(q) }; }
  const inset = (corner, ref, d) => { const dx = (ref[0] - corner[0]) * mLon, dy = (ref[1] - corner[1]) * mLat, L = Math.hypot(dx, dy) || 1; return [corner[0] + dx / L * Math.min(d, L * 0.45) / mLon, corner[1] + dy / L * Math.min(d, L * 0.45) / mLat]; };
  for (const w of mosques) { const nm = nameOf(w.t) || '';
    if (['tekke', 'mausoleum', 'tomb'].includes(w.t.building) || w.t.historic === 'tomb' || MOSQUE_NOT.test(nm)) { excluded.push({ id: w.b.id, name: nm || null, why: 'tekke, turbe, mekteb, medresa, hamam or musala' }); continue; }
    if (w.t.minaret === 'no' || w.t['minaret:count'] === '0') { excluded.push({ id: w.b.id, name: nm || null, why: 'tagged with no minaret' }); continue; }
    if (hasMinaret.has(w.b.id)) continue;
    const sc = sizeClass(w.b.area), rp = rulePos(w), r = sc.base_d_m / 2;
    estimated.push({ id: 'est-' + w.b.id, c: inset(rp.corner, w.b.c, r + 0.2), mosque: w.b.id, class: sc.id, height_m: sc.height_m, base_d_m: sc.base_d_m, position: rp.how, qibla_deg: rp.qibla_deg, area_m2: Math.round(w.b.area) }); }
  // the position rule checked against the mapped minarets: where would the rule have put them?
  const check = []; for (const m of minarets) { const w = mosques.find(x => x.b.id === m.mosque); if (!w) continue; const rp = rulePos(w); check.push(r1(distM(inset(rp.corner, w.b.c, 1.5), m.c))); }
  check.sort((a, b) => a - b);
  // the worship list (the text interface): kind by religion and tags
  const kindOf = w => { const r = religionOf(w.t), nm = nameOf(w.t) || ''; if (r === 'muslim') return ['tekke'].includes(w.t.building) || /tekij|tekke/i.test(nm) ? 'tekke' : w.t.building === 'mausoleum' || w.t.historic === 'tomb' || /turbe/i.test(nm) ? 'turbe' : 'mosque';
    if (r === 'christian') return w.t.building === 'cathedral' || /katedral|cathedral|saborna/i.test(nm) ? 'cathedral' : w.t.building === 'chapel' ? 'chapel' : 'church'; if (r === 'jewish') return 'synagogue'; return 'place of worship'; };
  const out = { mosque_rule: MR, worship: [], minarets: [], domes: [], towers: [], tall: [], estimated, excluded, no_outline: noOutline, position_check_m: check };
  const wOf = id => worship.get(id);
  for (const w of W2) { const nm = nameOf(w.t); out.worship.push({ id: w.b.id, name: nm, name_alt: altOf(w.t, nm), kind: kindOf(w), religion: religionOf(w.t), denomination: w.t.denomination || null, c: w.b.c.map(r7), ring: w.b.ring.map(p => p.map(r7)), area_m2: Math.round(w.b.area),
    height_m: num(w.t.height), roof: w.t['roof:shape'] || null, wikidata: w.t.wikidata || null, via: w.src, core: feats.has(w.b.id) || (partsOf.get(w.b.id) || []).some(p => feats.has(p.id)) }); }
  for (const m of minarets) { const t = m.t, ps = m.parts.length ? m.parts : [m];
    // the shaft: the widest part at the lowest base; the balcony: a part with min_height > 0 wider than the shaft; the top: the highest
    const top = Math.max(...ps.map(p => num(p.t.height) ?? 0)) || num(t.height) || null;
    const rOf = p => p.ring ? Math.sqrt(p.area / Math.PI) : null, shaft = ps.filter(p => p.ring).sort((a, b) => (num(a.t.min_height) ?? 0) - (num(b.t.min_height) ?? 0) || b.area - a.area)[0];
    const rs = shaft ? rOf(shaft) : (num(t.diameter) ? num(t.diameter) / 2 : null);
    // the balcony: a part of the stack raised on min_height that is not the top part (the widest such)
    const capP = ps.slice().sort((a, b) => (num(b.t.height) ?? 0) - (num(a.t.height) ?? 0))[0];
    const bal = ps.filter(p => p.ring && p !== capP && (num(p.t.min_height) ?? 0) > 0 && num(p.t.height) > num(p.t.min_height)).sort((a, b) => b.area - a.area)[0];
    out.minarets.push({ id: m.id, parts: m.parts.map(p => p.id), rule: m.rule || 'tag', c: (m.parts.length ? centroid(shaft?.ring || m.ring) : m.c).map(r7), mosque: m.mosque, mosque_dist_m: m.dist, height_m: top, height_source: top ? 'osm-height' : null,
      r_m: rs ? r2(rs) : null, serefe: bal ? [num(bal.t.min_height), num(bal.t.height)] : null, cap_m: num(capP?.t['roof:height']) ?? null, cap_shape: capP?.t['roof:shape'] || null, material: t['building:material'] || t.material || null,
      colour: t['building:colour'] || null, roof_colour: capP?.t['roof:colour'] || null, core: m.parts.some(p => feats.has(p.id)) || feats.has(m.id) });
    const w = m.mosque && wOf(m.mosque); }
  for (const d of domes) { const hb = obbHalf(d.ring), t = d.t; out.domes.push({ id: d.id, of: d.of, c: centroid(d.ring).map(r7), r_m: r2(Math.min(hb.hu, hb.hv)), height_m: num(t.height), min_height_m: num(t.min_height), roof_height_m: num(t['roof:height']), shape: t['roof:shape'], whole: !!d.whole,
    colour: t['roof:colour'] || null, wall_colour: t['building:colour'] || null, core: feats.has(d.id) }); }
  for (const tw of towers) { const t = tw.t, nm = nameOf(t); out.towers.push({ id: tw.id, of: tw.of || null, name: nm, name_alt: altOf(t, nm), kind: /clock/.test(t['tower:type'] || t.building || '') || /sahat/i.test(nm || '') ? 'clock tower' : 'tower', c: tw.c.map(r7), ring: tw.ring ? tw.ring.map(p => p.map(r7)) : null,
    height_m: num(t.height), min_height_m: num(t.min_height), roof_height_m: num(t['roof:height']), roof: t['roof:shape'] || null, colour: t['building:colour'] || null, roof_colour: t['roof:colour'] || null, node: !!tw.node, core: feats.has(tw.id) }); }
  // the radius of a tall object: OSM diameter / 2, else the outline (an obelisk's outline is its plinth: / 1.5), else a stated rule by kind
  const TALL_R = { chimney: [0.045, 1, 8], obelisk: [0.06, 1, 8], monument: [0.012, 0.5, 3], mast: [0.03, 0.8, 4], tower: [0.1, 2, 6] };
  for (const o of tall) { const t = o.t, nm = nameOf(t), d = num(t.diameter), rr = TALL_R[o.kind], rule = Math.max(rr[1], Math.min(rr[2], rr[0] * o.h));
    const r = d ? d / 2 : o.area ? Math.sqrt(o.area / Math.PI) / (o.kind === 'obelisk' ? 1.5 : 1) : rule;
    out.tall.push({ id: o.id, kind: o.kind, name: nm, name_alt: altOf(t, nm), c: o.c.map(r7), height_m: o.h, r_m: r2(r), r_source: d ? 'OSM diameter' : o.area ? 'outline' : `rule (${rr[0]} x height, ${rr[1]} to ${rr[2]} m)`, tag: o.tag,
      colour: t.colour?.split(';')[0] || t['building:colour'] || null, material: t.material || t['building:material'] || null, wikidata: t.wikidata || null, core: feats.has(o.id) }); }
  out.counts = { tall: out.tall.length, tall_by_kind: Object.fromEntries(['chimney', 'obelisk', 'monument', 'mast', 'tower'].map(k => [k, out.tall.filter(x => x.kind === k).length])), tall_skipped: tallSkipped, worship: out.worship.length, mosques: out.worship.filter(w => w.kind === 'mosque').length, minarets_mapped: out.minarets.length, minarets_mapped_by: Object.fromEntries(['tag', 'part-stack'].map(k => [k, out.minarets.filter(m => m.rule === k).length])),
    minarets_estimated: estimated.length, minarets_unattached: out.minarets.filter(m => !m.mosque).length, mosques_excluded: excluded.length, worship_points_without_outline: noOutline.length, domes: out.domes.length, towers: out.towers.length,
    churches: out.worship.filter(w => ['church', 'cathedral', 'chapel'].includes(w.kind)).length, synagogues: out.worship.filter(w => w.kind === 'synagogue').length, clock_towers: out.towers.filter(t => t.kind === 'clock tower').length,
    position_rule_error_m: check.length ? { n: check.length, median: check[check.length >> 1], max: check.at(-1) } : null };
  return out;
}

// ---------- the place's tiles as drawn: ground and block tops at a point (ellipsoidal heights)
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function readGlb(buf) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), dv = new DataView(ab), jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, jl))), bin = 20 + jl + 8;
  const acc = i => { const a = json.accessors[i], v = json.bufferViews[a.bufferView], T = CT[a.componentType], n = NC[a.type], st = (v.byteStride || n * T.BYTES_PER_ELEMENT) / T.BYTES_PER_ELEMENT, src = new T(ab, bin + (v.byteOffset || 0) + (a.byteOffset || 0), (a.count - 1) * st + n), out = new Float64Array(a.count * n);
    for (let q = 0; q < a.count; q++) for (let c = 0; c < n; c++) out[q * n + c] = src[q * st + c]; return out; };
  const tris = (ix, mode) => { if (mode !== 5) return ix; const o = []; for (let i = 0; i + 2 < ix.length; i++) { const a = ix[i], b = ix[i + 1], c = ix[i + 2]; if (a === b || b === c || a === c) continue; o.push(a, b, c); } return o; };
  const out = [];
  for (const nd of json.nodes) { if (nd.mesh == null) continue; const t = nd.translation || [0, 0, 0], s = nd.scale || [1, 1, 1], inst = nd.extensions?.EXT_mesh_gpu_instancing?.attributes;
    for (const p of json.meshes[nd.mesh].primitives) { const pos = acc(p.attributes.POSITION); for (let q = 0; q < pos.length; q += 3) { pos[q] = pos[q] * s[0] + t[0]; pos[q + 1] = pos[q + 1] * s[1] + t[1]; pos[q + 2] = pos[q + 2] * s[2] + t[2]; }
      const name = json.materials[p.material]?.name || '', ground = p.attributes.TEXCOORD_0 != null;
      out.push({ name, ground, pos, idx: p.indices != null ? tris(acc(p.indices), p.mode) : null, inst: inst ? { t: acc(inst.TRANSLATION), r: acc(inst.ROTATION), s: acc(inst.SCALE) } : null }); } }
  return out;
}
const Y2Z = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];
function mul4(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
const xf = (M, x, y, z) => [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]];
// the place's tile tree: each content tile with its region (degrees) and its world matrix (ENU -> ECEF composed, then y-up)
function tileTree(ts) { const out = []; const walk = (t, W) => { const M = t.transform ? (W ? mul4(W, t.transform) : t.transform) : W, r = t.boundingVolume.region;
  if (t.content?.uri) out.push({ uri: t.content.uri, key: t.content.uri.replace(/^.*\/|\.glb$/g, ''), level: +t.content.uri.replace(/^.*\//, '').split('-')[0], b: [r[0] / D2R, r[1] / D2R, r[2] / D2R, r[3] / D2R], M: mul4(M, Y2Z), leaf: !t.children?.length });
  for (const k of t.children || []) walk(k, M); }; walk(ts.root, null); return out; }
// a sampler of the drawn surfaces of one tile in geodetic coordinates: triangles of the ground and of the buildings / blocks
function tileSurfaces(tile, buf) {
  const prims = readGlb(buf), G = [], Bk = [];
  const geo = (x, y, z) => { const e = xf(tile.M, x, y, z), g = ecefToGeodetic(e[0], e[1], e[2]); return [g.lon, g.lat, g.h]; };
  for (const p of prims) {
    if (p.inst) { // unit boxes (x, z -0.5..0.5, y 0..1) by instance: the top square as two triangles
      const k = p.inst.t.length / 3; for (let i = 0; i < k; i++) { const T = [p.inst.t[3 * i], p.inst.t[3 * i + 1], p.inst.t[3 * i + 2]], q = [p.inst.r[4 * i], p.inst.r[4 * i + 1], p.inst.r[4 * i + 2], p.inst.r[4 * i + 3]], S = [p.inst.s[3 * i], p.inst.s[3 * i + 1], p.inst.s[3 * i + 2]];
        const rot = v => { const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2]; return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; };
        const c = [[-0.5, 1, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]].map(v => { const r = rot([v[0] * S[0], v[1] * S[1], v[2] * S[2]]); return geo(r[0] + T[0], r[1] + T[1], r[2] + T[2]); });
        Bk.push([c[0], c[1], c[2]], [c[0], c[2], c[3]]); } continue; }
    const V = []; for (let q = 0; q < p.pos.length; q += 3) V.push(geo(p.pos[q], p.pos[q + 1], p.pos[q + 2]));
    const L = p.ground ? G : Bk; const ix = p.idx || [...V.keys()]; for (let i = 0; i + 2 < ix.length; i += 3) L.push([V[ix[i]], V[ix[i + 1]], V[ix[i + 2]]]);
  }
  return { G, Bk };
}
// the height of the surface (the highest triangle over the point, or null)
function surfaceAt(tris, lon, lat) { let best = null; const X = lon * mLon, Y = lat * mLat;
  for (const [a, b, c] of tris) { const ax = a[0] * mLon, ay = a[1] * mLat, bx = b[0] * mLon, by = b[1] * mLat, cx = c[0] * mLon, cy = c[1] * mLat, d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(d) < 1e-6) continue;
    const u = ((by - cy) * (X - cx) + (cx - bx) * (Y - cy)) / d, v = ((cy - ay) * (X - cx) + (ax - cx) * (Y - cy)) / d, w = 1 - u - v; if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
    const h = u * a[2] + v * b[2] + w * c[2]; if (best == null || h > best) best = h; } return best; }

// ---------- glTF writer: KHR_mesh_quantization int16 positions (one uniform node scale), COLOR_0 uint8, _FEATURE_ID_0
// (EXT_mesh_features), _RADIAL int16 (cm: the horizontal offset of the vertex from its object's axis, and the object's
// reference radius in y): the reader keeps a thin object at least a few pixels wide at any distance (live, in the shader)
function writeGlb(prims, copyright, extras) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) for (let i = 0; i < p.pos.length; i++) { mn[i % 3] = Math.min(mn[i % 3], p.pos[i]); mx[i % 3] = Math.max(mx[i % 3], p.pos[i]); }
  const t = mn.map((v, i) => (v + mx[i]) / 2), s1 = Math.max(1e-4, ...mn.map((v, i) => (mx[i] - v) / 2 / 32767)), sc = [s1, s1, s1];
  const json = { asset: { version: '2.0', generator: 'cwplans build-place-landmarks.mjs', copyright }, extensionsUsed: ['KHR_mesh_quantization', 'EXT_mesh_features'], extensionsRequired: ['KHR_mesh_quantization'],
    extras, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: t, scale: sc }], meshes: [{ primitives: [] }], materials: [], buffers: [], bufferViews: [], accessors: [] };
  const chunks = []; let off = 0;
  const view = (buf, target, stride) => { const pad = (4 - (buf.length % 4)) % 4; json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(stride ? { byteStride: stride } : {}), ...(target ? { target } : {}) }); chunks.push(buf, Buffer.alloc(pad)); off += buf.length + pad; return json.bufferViews.length - 1; };
  for (const p of prims) {
    const nv = p.pos.length / 3; if (!nv) continue;
    const q = new Int16Array(nv * 4), qmn = [32767, 32767, 32767], qmx = [-32767, -32767, -32767];
    for (let v = 0; v < nv; v++) for (let c = 0; c < 3; c++) { const x = Math.max(-32767, Math.min(32767, Math.round((p.pos[3 * v + c] - t[c]) / sc[c]))); q[4 * v + c] = x; qmn[c] = Math.min(qmn[c], x); qmx[c] = Math.max(qmx[c], x); }
    json.accessors.push({ bufferView: view(Buffer.from(q.buffer), 34962, 8), componentType: 5122, count: nv, type: 'VEC3', min: qmn, max: qmx });
    const attributes = { POSITION: json.accessors.length - 1 };
    const col = new Uint8Array(nv * 4); for (let v = 0; v < nv; v++) { col[4 * v] = p.col[3 * v]; col[4 * v + 1] = p.col[3 * v + 1]; col[4 * v + 2] = p.col[3 * v + 2]; col[4 * v + 3] = 255; }
    json.accessors.push({ bufferView: view(Buffer.from(col.buffer), 34962, 4), componentType: 5121, normalized: true, count: nv, type: 'VEC4' }); attributes.COLOR_0 = json.accessors.length - 1;
    const rad = new Int16Array(nv * 4); for (let v = 0; v < nv; v++) for (let c = 0; c < 3; c++) rad[4 * v + c] = Math.max(-32767, Math.min(32767, Math.round(p.rad[3 * v + c] * 100)));
    json.accessors.push({ bufferView: view(Buffer.from(rad.buffer), 34962, 8), componentType: 5122, count: nv, type: 'VEC3' }); attributes._RADIAL = json.accessors.length - 1;
    const fid = new Float32Array(p.fid); json.accessors.push({ bufferView: view(Buffer.from(fid.buffer), 34962), componentType: 5126, count: nv, type: 'SCALAR' }); attributes._FEATURE_ID_0 = json.accessors.length - 1;
    const big = nv > 65535, ix = big ? new Uint32Array(p.idx) : new Uint16Array(p.idx);
    json.accessors.push({ bufferView: view(Buffer.from(ix.buffer), 34963), componentType: big ? 5125 : 5123, count: p.idx.length, type: 'SCALAR' });
    json.materials.push({ name: p.name, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } });
    json.meshes[0].primitives.push({ attributes, indices: json.accessors.length - 1, material: json.materials.length - 1, mode: 4,
      extensions: { EXT_mesh_features: { featureIds: [{ featureCount: new Set(p.fid).size, attribute: 0, label: 'landmark' }] } } });
  }
  const bin = Buffer.concat(chunks); json.buffers.push({ byteLength: bin.length });
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const hdr = Buffer.alloc(12); hdr.writeUInt32LE(0x46546c67, 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (b, ty) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.writeUInt32LE(ty, 4); return [h, b]; };
  return Buffer.concat([hdr, ...ch(js, 0x4e4f534a), ...ch(bin, 0x004e4942)]);
}

// ---------- shapes in a local frame (x east, y north, z up; metres), each vertex with its radial offset and reference radius
const CSS = { white: '#f2f0ea', black: '#2b2b2b', grey: '#9a9a96', gray: '#9a9a96', silver: '#c0c0c0', red: '#a8463a', brown: '#7a5638', beige: '#d8ccb0', yellow: '#d8c27a', orange: '#c8823e', cream: '#ece3c8', green: '#6c8a5a', blue: '#4f6d8a', lightgrey: '#c8c8c4', darkgrey: '#5f5f5c' };
const hex = s => { if (!s) return null; s = String(s).trim().toLowerCase(); if (CSS[s]) s = CSS[s]; const m = s.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/); if (!m) return null; let h = m[1]; if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const STONE = [234, 228, 214], LEAD = [118, 126, 136], WOOD = [120, 92, 66], TOWER = [214, 203, 182], SPIRE = [96, 106, 102];
class Shape { constructor() { this.pos = []; this.rad = []; this.col = []; this.idx = []; }
  v(x, y, z, rx, ry, R, c) { this.pos.push(x, y, z); this.rad.push(rx, ry, R); this.col.push(...c); return this.pos.length / 3 - 1; }
  // a body of revolution: profile [[z, r, colour]] from bottom to top, seg sides; r = 0 is a point (apex); caps at both ends
  lathe(cx, cy, prof, seg, R, phase = 0) { const rings = [];
    for (const [z, r, c] of prof) { if (r <= 1e-6) { rings.push([this.v(cx, cy, z, 0, 0, R, c)]); continue; } const rg = []; for (let i = 0; i < seg; i++) { const a = phase + i / seg * 2 * Math.PI, dx = Math.cos(a) * r, dy = Math.sin(a) * r; rg.push(this.v(cx + dx, cy + dy, z, dx, dy, R, c)); } rings.push(rg); }
    for (let k = 0; k + 1 < rings.length; k++) { const A = rings[k], B = rings[k + 1];
      if (A.length === 1 && B.length === 1) continue;
      if (B.length === 1) { for (let i = 0; i < A.length; i++) this.idx.push(A[i], A[(i + 1) % A.length], B[0]); continue; }
      if (A.length === 1) { for (let i = 0; i < B.length; i++) this.idx.push(A[0], B[(i + 1) % B.length], B[i]); continue; }
      for (let i = 0; i < A.length; i++) { const j = (i + 1) % A.length; this.idx.push(A[i], A[j], B[j], A[i], B[j], B[i]); } }
    const bot = rings[0]; if (bot.length > 1) for (let i = 1; i + 1 < bot.length; i++) this.idx.push(bot[0], bot[i + 1], bot[i]);
    const top = rings.at(-1); if (top.length > 1) for (let i = 1; i + 1 < top.length; i++) this.idx.push(top[0], top[i], top[i + 1]); }
  // a prism of an outline (local points, counter-clockwise) from z0 to z1, then a cap: pointed (to an apex at zt), dome, or flat
  prism(pts, z0, z1, cap, zt, cw, cr) { const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]), R = Math.max(...pts.map(p => Math.hypot(p[0] - c[0], p[1] - c[1])));
    const n = pts.length, b = [], t = [];
    for (const p of pts) { b.push(this.v(p[0], p[1], z0, p[0] - c[0], p[1] - c[1], R, cw)); t.push(this.v(p[0], p[1], z1, p[0] - c[0], p[1] - c[1], R, cw)); }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.idx.push(b[i], b[j], t[j], b[i], t[j], t[i]); }
    if (cap === 'pointed') { const a = this.v(c[0], c[1], zt, 0, 0, R, cr), e = pts.map(p => this.v(p[0], p[1], z1, p[0] - c[0], p[1] - c[1], R, cr)); for (let i = 0; i < n; i++) this.idx.push(e[i], e[(i + 1) % n], a); }
    else if (cap === 'dome' || cap === 'onion') { const ri = Math.max(0.5, Math.min(...pts.map((p, i) => { const q = pts[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1; return Math.abs((c[0] - p[0]) * dy - (c[1] - p[1]) * dx) / L; })));
      const tf = this.pos.length / 3; for (let i = 1; i + 1 < n; i++) this.idx.push(t[0], t[i], t[i + 1]); this.lathe(c[0], c[1], domeProfile(z1, ri, zt - z1, cap, cr), 12, R); }
    else for (let i = 1; i + 1 < n; i++) this.idx.push(t[0], t[i], t[i + 1]); }
}
function domeProfile(z0, r, rise, shape, c) { const P = [];
  if (shape === 'onion') { const prof = [[0, 1], [0.18, 1.12], [0.4, 1.06], [0.6, 0.72], [0.8, 0.3], [0.92, 0.1], [1, 0]]; for (const [f, k] of prof) P.push([z0 + f * rise, r * k, c]); }
  else for (let k = 0; k <= 5; k++) { const a = k / 5 * Math.PI / 2; P.push([z0 + Math.sin(a) * rise, Math.cos(a) * r, c]); }
  return P; }
// an Ottoman minaret: plinth, shaft, the balcony (serefe) on its corbel with a parapet, the upper shaft, the pencil cone (alem left out)
function minaretProfile(r, H, sb, se, capH, wooden, c) {
  const stone = c || (wooden ? [226, 220, 206] : STONE), cap = wooden ? WOOD : LEAD, rb = r * 1.22, ru = r * 0.9, rs = r * 1.45, zcap = H - capH;
  return [[-2, rb, stone], [Math.min(0.12 * H, 4), rb, stone], [Math.min(0.12 * H, 4) + 0.6, r, stone], [sb - 0.7, r, stone], [sb, rs, stone], [Math.min(se, sb + 1.3), rs, stone], [Math.min(se, sb + 1.3), ru, stone], [zcap, ru, stone], [zcap, ru * 1.12, cap], [zcap + 0.15 * capH, ru * 1.05, cap], [H, 0, cap]];
}

// ---------- operation 2: tiles (pure: selection + the place's tiles + features -> glb per level-13 cell, tileset.json, landmarks.json)
async function buildTiles(S, ts, tileBufs, fj, P) {
  const tiles = tileTree(ts), geoid = fj.geoid_m;
  const coreF = new Map(); { const F = fj.buildings_fields, ix = k => F.indexOf(k); fj.buildings.forEach((b, i) => { if (b) coreF.set(b[ix('osm_id')], { i, ground_m: b[ix('ground_m')], height_m: b[ix('height_m')], name: b[ix('name')], name_alt: b[ix('name_alt')], parent: b[ix('parent')] }); }); }
  // surfaces of the finest tile at a point (cached per tile)
  const surf = new Map();
  const finest = (lon, lat) => tiles.filter(t => lon >= t.b[0] && lon < t.b[2] && lat >= t.b[1] && lat < t.b[3]).sort((a, b) => b.level - a.level)[0];
  const surfOf = t => { if (!surf.has(t.key)) surf.set(t.key, tileSurfaces(t, tileBufs.get(t.uri))); return surf.get(t.key); };
  const groundAt = (lon, lat) => { const t = finest(lon, lat); if (!t) return null; const s = surfOf(t); return surfaceAt(s.G, lon, lat); };
  const blockTopAt = (lon, lat) => { const t = finest(lon, lat); if (!t) return null; const s = surfOf(t); return surfaceAt(s.Bk, lon, lat); };
  // the ground of an object: the core building's ground_m (+ geoid: the core walls' reference) where it is a core feature, else the drawn terrain
  const groundOf = (lon, lat, ids = []) => { for (const id of ids) { const f = coreF.get(id); if (f && f.ground_m != null) return { h: f.ground_m + geoid, src: 'core' }; } const g = groundAt(lon, lat); return g == null ? null : { h: g, src: 'tile' }; };
  const W = new Map(S.worship.map(w => [w.id, w])), MR = S.mosque_rule;
  const items = [];   // { fid row, site lon/lat, base h, build(shape), estimated }
  const rows = [];
  const row = o => { rows.push(o); return rows.length - 1; };
  const nameOfW = id => { const w = W.get(id); return w ? { name: w.name, name_alt: w.name_alt, kind: w.kind } : {}; };
  const hide = new Set();
  // worship buildings: rows of the text interface (no geometry: their bodies are the place's own blocks)
  for (const w of S.worship) { const g = groundOf(w.c[0], w.c[1], [w.id]); row({ type: 'worship', id: w.id, kind: w.kind, name: w.name, name_alt: w.name_alt, religion: w.religion, lon: w.c[0], lat: w.c[1], area_m2: w.area_m2, height_m: w.height_m, wikidata: w.wikidata, core: w.core, ground_h: g ? r1(g.h) : null, source: 'mapped', drawn: 'place tiles' }); }
  const skipped = { no_ground: 0, no_height: 0 };
  // mapped minarets
  for (const m of S.minarets) {
    const g = groundOf(m.c[0], m.c[1], [...m.parts, m.id]); if (!g) { skipped.no_ground++; continue; }
    const w = m.mosque ? W.get(m.mosque) : null, sc = w ? MR.classes.find(c => w.area_m2 < c.max_area_m2) || MR.classes.at(-1) : MR.classes[1];
    const H = m.height_m || sc.height_m, r = Math.max(0.9, Math.min(2.4, m.r_m || sc.base_d_m / 2)), capH = m.cap_m || H * MR.cap_frac;
    const se = m.serefe ? m.serefe[1] : H * MR.serefe_frac + 1.1, sb = m.serefe ? m.serefe[0] : H * MR.serefe_frac;
    const wooden = /wood/.test(m.material || '') || (!m.height_m && sc.id === 'S');
    const fid = row({ type: 'minaret', id: m.id, parts: m.parts, of: m.mosque, ...nameOfW(m.mosque), kind_of: w?.kind || null, lon: m.c[0], lat: m.c[1], height_m: r1(H), height_source: m.height_m ? 'OSM height' : `rule (size class ${sc.id})`, r_m: r2(r), serefe_m: [r1(sb), r1(se)], cap_m: r1(capH), source: 'mapped', mapped_by: m.rule === 'part-stack' ? 'OSM building parts (the slender stack in the mosque)' : 'OSM tag (man_made / building / building:part / tower:type = minaret)', ground_h: r1(g.h), top_h: r1(g.h + H), core: m.core });
    for (const id of m.parts.length ? m.parts : [m.id]) if (coreF.has(id)) hide.add(id);
    items.push({ fid, lon: m.c[0], lat: m.c[1], h: g.h, est: false, build: s => s.lathe(0, 0, minaretProfile(r, H, sb, se, capH, wooden, hex(m.colour)), 12, r) }); }
  // estimated minarets (the switch: place.landmarks.estimate_minarets)
  if (P.estimate) for (const e of S.estimated) {
    const g = groundOf(e.c[0], e.c[1], [e.mosque]); if (!g) { skipped.no_ground++; continue; }
    const H = e.height_m, r = e.base_d_m / 2, capH = H * MR.cap_frac, sb = H * MR.serefe_frac, se = sb + 1.1, wooden = e.class === 'S';
    const fid = row({ type: 'minaret', id: e.id, of: e.mosque, ...nameOfW(e.mosque), kind_of: 'mosque', lon: e.c[0], lat: e.c[1], height_m: H, height_source: `rule (size class ${e.class}: footprint ${e.area_m2} m2)`, r_m: r, serefe_m: [r1(sb), r1(se)], cap_m: r1(capH), source: 'estimated',
      position: e.position === 'entrance' ? 'rule: the outline corner nearest the mapped entrance' : `rule: the outline corner farthest along qibla + ${MR.corner_bearing_from_qibla} deg (qibla ${e.qibla_deg} deg)`, ground_h: r1(g.h), top_h: r1(g.h + H), core: W.get(e.mosque)?.core || false });
    items.push({ fid, lon: e.c[0], lat: e.c[1], h: g.h, est: true, build: s => s.lathe(0, 0, minaretProfile(r, H, sb, se, capH, wooden), 10, r) }); }
  // domes: a drum from the part's base (min_height, else its ground) to the springing, the dome (hemisphere or onion) to its top
  for (const d of S.domes) {
    const g = groundOf(d.c[0], d.c[1], [d.id, d.of]); if (!g) { skipped.no_ground++; continue; }
    let top = d.height_m, rise = d.roof_height_m ?? Math.min(d.r_m, top ? top * 0.6 : d.r_m), base = d.min_height_m ?? 0, how = 'OSM height and roof:height';
    if (d.whole && !d.core) { // a whole building with a dome roof in the city ring: its block is flat at its height; the dome stands on the block top
      const bt = blockTopAt(d.c[0], d.c[1]); if (bt != null) { base = bt - g.h; top = base + rise; how = 'on the block top (the city block is flat at the building height)'; } }
    if (!top) { skipped.no_height++; continue; }
    const spring = Math.max(base, top - rise), r = Math.max(0.8, d.r_m * 0.96), cD = hex(d.colour) || LEAD, cW = hex(d.wall_colour) || STONE;
    const fid = row({ type: 'dome', id: d.id, of: d.of, ...nameOfW(d.of), lon: d.c[0], lat: d.c[1], height_m: r1(top), height_source: how, r_m: r2(r), shape: d.shape, source: 'mapped', mapped_by: d.whole ? 'OSM roof:shape on the outline' : 'OSM building part with roof:shape', ground_h: r1(g.h), top_h: r1(g.h + top), core: d.core });
    if (d.core) hide.add(d.id);
    const prof = [[base - (base ? 0 : 1), r, cW], [spring, r, cW], ...domeProfile(spring, r, top - spring, d.shape, cD)];
    items.push({ fid, lon: d.c[0], lat: d.c[1], h: g.h, est: false, build: s => s.lathe(0, 0, prof, 16, r) }); }
  // towers: the outline (simplified to its hull when it has more than 12 points) from min_height to the eaves, then the cap
  for (const t of S.towers) {
    const g = groundOf(t.c[0], t.c[1], [t.id, t.of]); if (!g) { skipped.no_ground++; continue; }
    const top = t.height_m; if (!top) { skipped.no_height++; continue; }
    const capShape = ['pyramidal', 'cone', 'spire', 'conical'].includes(t.roof) ? 'pointed' : ['dome', 'onion'].includes(t.roof) ? t.roof : 'flat';
    const rise = capShape === 'flat' ? 0 : t.roof_height_m ?? Math.min(top * 0.25, 8), eave = top - rise, base = t.min_height_m ?? 0;
    let pts; if (t.ring) { const loc = toXY(open(t.ring), t.c); pts = loc.length > 12 ? hull(loc) : loc; let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } if (a < 0) pts = pts.reverse(); }
    else pts = [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5]];
    const fid = row({ type: 'tower', id: t.id, of: t.of, ...(t.of ? nameOfW(t.of) : {}), ...(t.name ? { name: t.name, name_alt: t.name_alt } : {}), kind: t.kind, lon: t.c[0], lat: t.c[1], height_m: r1(top), height_source: 'OSM height', roof: t.roof, source: 'mapped', mapped_by: t.node ? 'OSM node (outline assumed 5 x 5 m)' : 'OSM outline or building part', ground_h: r1(g.h), top_h: r1(g.h + top), core: t.core });
    if (t.core) hide.add(t.id);
    items.push({ fid, lon: t.c[0], lat: t.c[1], h: g.h, est: false, build: s => s.prism(pts, base - (base ? 0 : 1), eave, capShape, top, hex(t.colour) || TOWER, hex(t.roof_colour) || SPIRE) }); }
  // tall thin objects: bodies of revolution by kind (chimney: a tapering cylinder; obelisk: four sides on a plinth to a
  // pyramid point; monument: a needle to a thin top (the Spire); mast: a tapering pole), standing on the ground
  const TALL_C = { chimney: [196, 190, 180], obelisk: [222, 216, 200], monument: [205, 208, 210], mast: [170, 172, 170], tower: TOWER };
  const tallProfile = (k, r, H, c) => k === 'chimney' ? [[-1, r, c], [H, r * 0.72, c]] : k === 'obelisk' ? [[-1, 1.5 * r, c], [0.07 * H, 1.5 * r, c], [0.07 * H, r, c], [0.92 * H, 0.62 * r, c], [H, 0, c]]
    : k === 'mast' ? [[-1, r, c], [H, 0.25 * r, c]] : k === 'tower' ? [[-1, r, c], [H, r, c]] : [[-1, r, c], [H, Math.max(0.075, 0.05 * r), c]];
  for (const t of S.tall || []) {
    const g = groundOf(t.c[0], t.c[1], [t.id]); if (!g) { skipped.no_ground++; continue; }
    const H = t.height_m, r = t.r_m, col = hex(t.colour) || TALL_C[t.kind], prof = tallProfile(t.kind, r, H, col);
    const fid = row({ type: 'tall', id: t.id, kind: t.kind, name: t.name, name_alt: t.name_alt, lon: t.c[0], lat: t.c[1], height_m: r1(H), height_source: 'OSM height', r_m: r2(r), source: 'mapped', mapped_by: `OSM ${t.tag} (radius: ${t.r_source})`, ground_h: r1(g.h), top_h: r1(g.h + H), core: t.core, wikidata: t.wikidata });
    if (t.core) hide.add(t.id);
    items.push({ fid, lon: t.c[0], lat: t.c[1], h: g.h, est: false, build: s => s.lathe(0, 0, prof, t.kind === 'obelisk' ? 4 : 12, r, t.kind === 'obelisk' ? Math.PI / 4 : 0) }); }
  // tiles: one per level-13 cell holding items; each in the ENU frame of its cell centre at the mean base height; vertices placed
  // exactly (each item's own ENU frame -> ECEF -> the tile frame), glTF y-up
  const TL = P.tile_level, CS = 180 / 2 ** TL, cells = new Map();
  for (const it of items) { const x = Math.floor((it.lon + 180) / CS), y = Math.floor((it.lat + 90) / CS), k = `${TL}-${x}-${y}`; (cells.get(k) || cells.set(k, { x, y, items: [] }).get(k)).items.push(it); }
  for (const f of readdirSync(join(OUT, 'tiles'))) rmSync(join(OUT, 'tiles', f));
  const children = [], outFiles = [], sizes = {}; let tris = 0;
  for (const [key, cell] of [...cells.entries()].sort()) {
    const lc = -180 + (cell.x + 0.5) * CS, bc = -90 + (cell.y + 0.5) * CS, h0 = Math.round(cell.items.reduce((s, i) => s + i.h, 0) / cell.items.length * 100) / 100, F = enuFrame({ lon: lc, lat: bc, h: h0 });
    const prims = [{ name: 'mapped', pos: [], rad: [], col: [], fid: [], idx: [] }, { name: 'estimated', pos: [], rad: [], col: [], fid: [], idx: [] }];
    let hmin = Infinity, hmax = -Infinity, bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const it of cell.items) {
      const s = new Shape(); it.build(s); const L = enuFrame({ lon: it.lon, lat: it.lat, h: it.h }), pr = prims[it.est ? 1 : 0], base = pr.pos.length / 3;
      for (let v = 0; v < s.pos.length / 3; v++) { const e = L.enuToEcef([s.pos[3 * v], s.pos[3 * v + 1], s.pos[3 * v + 2]]), q = F.ecefToEnu(e);
        // the radial offset as a direction in the tile frame (east and north of the item's frame are the tile's to 1e-4 rad)
        const rx = s.rad[3 * v], ry = s.rad[3 * v + 1], ee = L.east, nn = L.north, d = [ee[0] * rx + nn[0] * ry, ee[1] * rx + nn[1] * ry, ee[2] * rx + nn[2] * ry], dq = [F.east, F.north, F.up].map(a => a[0] * d[0] + a[1] * d[1] + a[2] * d[2]);
        pr.pos.push(q[0], q[2], -q[1]); pr.rad.push(dq[0], s.rad[3 * v + 2], -dq[1]); pr.col.push(s.col[3 * v], s.col[3 * v + 1], s.col[3 * v + 2]); pr.fid.push(it.fid);
        const g = ecefToGeodetic(e[0], e[1], e[2]); hmin = Math.min(hmin, g.h); hmax = Math.max(hmax, g.h); bb = [Math.min(bb[0], g.lon), Math.min(bb[1], g.lat), Math.max(bb[2], g.lon), Math.max(bb[3], g.lat)]; }
      for (const i of s.idx) pr.idx.push(base + i); tris += s.idx.length / 3; }
    const bytes = writeGlb(prims.filter(p => p.pos.length), fj.credit ? 'OpenStreetMap contributors (ODbL 1.0)' : '', { landmarks: { rows: [...new Set(cell.items.map(i => i.fid))].sort((a, b) => a - b) } });
    const file = join(OUT, 'tiles', key + '.glb'); writeFileSync(file, bytes); outFiles.push(file); sizes[key] = bytes.length;
    const pad = 0.0002; children.push({ boundingVolume: { region: [(bb[0] - pad) * D2R, (bb[1] - pad) * D2R, (bb[2] + pad) * D2R, (bb[3] + pad) * D2R, Math.floor(hmin - 1), Math.ceil(hmax + 1)].map(v => +v.toFixed(12)) }, geometricError: 0, refine: 'ADD',
      transform: F.matrix().map(v => Math.round(v * 1e9) / 1e9), content: { uri: `tiles/${key}.glb` } });
  }
  const R = children.reduce((a, c) => { const r = c.boundingVolume.region; return [Math.min(a[0], r[0]), Math.min(a[1], r[1]), Math.max(a[2], r[2]), Math.max(a[3], r[3]), Math.min(a[4], r[4]), Math.max(a[5], r[5])]; }, [Infinity, Infinity, -Infinity, -Infinity, Infinity, -Infinity]);
  const tset = { asset: { version: '1.1', generator: 'cwplans build-place-landmarks.mjs', tilesetVersion: `${RID}-landmarks-1`, extras: { place: RID, credit: '© OpenStreetMap contributors (ODbL 1.0)', features: 'landmarks.json (row = _FEATURE_ID_0)' } },
    geometricError: 500, root: { boundingVolume: { region: R }, geometricError: 500, refine: 'ADD', children } };
  const ftset = join(OUT, 'tileset.json'); writeFileSync(ftset, JSON.stringify(tset)); outFiles.push(ftset);
  const fields = ['type', 'id', 'kind', 'name', 'name_alt', 'of', 'lon', 'lat', 'height_m', 'height_source', 'source', 'mapped_by', 'position', 'ground_h', 'top_h', 'r_m', 'core', 'kind_of', 'religion', 'area_m2', 'wikidata', 'parts', 'shape', 'roof', 'serefe_m', 'cap_m', 'drawn'];
  const counts = { ...S.counts, minarets_drawn: { mapped: rows.filter(r => r.type === 'minaret' && r.source === 'mapped').length, estimated: rows.filter(r => r.type === 'minaret' && r.source === 'estimated').length },
    domes_drawn: rows.filter(r => r.type === 'dome').length, towers_drawn: rows.filter(r => r.type === 'tower').length, tall_drawn: rows.filter(r => r.type === 'tall').length, core_parts_replaced: hide.size, skipped, triangles: tris, tiles: children.length, tile_bytes: Object.values(sizes).reduce((a, b) => a + b, 0) };
  const lj = { format: 'place-landmarks-1', place: RID, name: REG.name, credit: '© OpenStreetMap contributors (ODbL 1.0)', estimate_minarets: P.estimate, rule: { minaret: MR, note: 'estimated minarets: a mosque with no mapped minaret within 30 m gets one by the size class of its footprint; position: the outline corner nearest a mapped entrance, else the hull corner farthest along qibla + ' + MR.corner_bearing_from_qibla + ' deg, moved inside by the base radius' },
    counts, hide_core: [...hide].sort(), rows_fields: fields, rows: rows.map(r => fields.map(k => r[k] ?? null)) };
  const flj = join(OUT, 'landmarks.json'); writeFileSync(flj, JSON.stringify(lj)); outFiles.push(flj);
  return { files: outFiles, counts };
}

// ---------- the index of landmark sets (read by docklands/globe/landmarks.js)
function writeIndex() {
  const f = join(CW, 'docklands', 'data', 'places', 'landmarks.json'), ix = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { format: 'place-landmarks-index-1', about: 'Landmark sets of the places (minarets, domes, towers) made by cwplans/tools/build-place-landmarks.mjs; read by docklands/globe/landmarks.js', places: {} };
  const LB = XPL ? `${XPL.tileBase.replace(/\/?$/, '/')}landmarks/` : `${RID}/landmarks/`;   // a place in another repository: absolute URLs under its tileBase
  ix.places[RID] = { tileset: `${LB}tileset.json`, features: `${LB}landmarks.json`, readme: `${LB}README.md` };
  writeFileSync(f, JSON.stringify(ix, null, 1) + '\n');
}

// ---------- README (generated from log.json; never edit by hand)
function writeReadme() {
  const L = JSON.parse(readFileSync(BLOG, 'utf8')), lj = JSON.parse(readFileSync(join(OUT, 'landmarks.json'), 'utf8')), C = lj.counts, G = 'https://github.com/danbri/londat/blob/main/cwplans/';
  const files = L.activities.flatMap(a => a.outputs).filter(o => !o.path.startsWith('data/raw'));
  const sel = L.activities.find(a => a.operation === 'landmark-select'), til = L.activities.find(a => a.operation === 'landmark-tiles');
  const GHO = o => XPL && o.startsWith(XPL.outRepo + ':') ? `https://github.com/danbri/${XPL.outRepo}/blob/main/${o.slice(XPL.outRepo.length + 1)}` : G + o, PRE = XPL ? `${XPL.outRepo}:${XPL.outPath}landmarks/` : `docklands/data/places/${RID}/landmarks/`;
  const lines = [`# Landmarks of ${REG.name}: ${TALL ? 'towers, spires, chimneys, monuments, domes and minarets' : 'minarets, domes and towers'} (3D Tiles 1.1)`, '',
    `Made by [cwplans/tools/build-place-landmarks.mjs](${G}tools/build-place-landmarks.mjs) for the region config [docklands/geo/regions/${RID}.js](https://github.com/danbri/londat/blob/main/docklands/geo/regions/${RID}.js) (block \`place.landmarks\`); drawn by [docklands/globe/landmarks.js](https://github.com/danbri/londat/blob/main/docklands/globe/landmarks.js) beside the place's own tiles ([README](${XPL ? `https://github.com/danbri/${XPL.outRepo}/blob/main/${XPL.outPath}README.md` : `${G}docklands/data/places/${RID}/README.md`})).`,
    'Generated from `log.json` by `node cwplans/tools/build-place-landmarks.mjs readme --region ' + RID + '` (also at the end of each build). Do not edit it by hand.', '',
    ...(LM.views || PL.views || [{ name: 'The old town (Baščaršija, Gazi Husrev-beg Mosque)', ll: '43.85915,18.42895,600', ht: '200,72' }, { name: 'The city (8 km out)', ll: '43.85917,18.43335,8000', ht: '0,50' }]).map(v => `- ${v.name}: https://danbri.github.io/londat/docklands/?ll=${v.ll}&ht=${v.ht}`),
    `- Estimated minarets hidden: add \`&landmarks=mapped\`; all landmarks off: \`&landmarks=off\``,
    '- Licence: © OpenStreetMap contributors, ODbL 1.0 (share-alike; https://www.openstreetmap.org/copyright). Every shape is made from OSM tags or from the stated rule; no 3D model was copied (the SketchUp 3D Warehouse models are not used: docs/regions/sarajevo-3dwarehouse.md).',
    '- Skill: docklands-3d-page, "Landmarks: minarets, domes and towers (2026-10-22)"', '',
    '## Counts', '', '| what | count |', '|---|---|',
    `| places of worship with an outline | ${C.worship} (mosques ${C.mosques}, churches ${C.churches}, synagogues ${C.synagogues}) |`,
    `| minarets mapped in OSM | ${C.minarets_mapped} (by tag ${C.minarets_mapped_by.tag}, by the part-stack rule ${C.minarets_mapped_by['part-stack']}); drawn ${C.minarets_drawn.mapped} |`,
    `| minarets estimated by the rule (class "estimated") | ${C.minarets_estimated}; drawn ${C.minarets_drawn.estimated} (switch: \`place.landmarks.estimate_minarets\`, and \`?landmarks=mapped\` in the page) |`,
    `| mosques given no minaret (tekke, turbe, mekteb, medresa, hamam, musala, or tagged with none) | ${C.mosques_excluded} |`,
    `| places of worship mapped as a point with no outline within 8 m (not drawn) | ${C.worship_points_without_outline} |`,
    `| domes mapped (drawn) | ${C.domes} (${C.domes_drawn}) |`, `| towers and spires mapped (drawn); clock towers | ${C.towers} (${C.towers_drawn}); ${C.clock_towers} |`,
    ...(C.tall != null && TALL ? [`| tall thin objects (OSM ${TALL.man_made.map(v => 'man_made=' + v).concat(TALL.historic.map(v => 'historic=' + v)).join(', ')}; height >= ${TALL.min_height_m} m) | ${C.tall} (${Object.entries(C.tall_by_kind).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')}); drawn ${C.tall_drawn}; left out: ${Object.entries(C.tall_skipped).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ')} |`] : []),
    `| core building parts replaced (hidden in the core tiles, drawn here) | ${C.core_parts_replaced} |`,
    `| the position rule against the mapped minarets (distance from where the rule would put them) | ${C.position_rule_error_m ? `median ${C.position_rule_error_m.median} m, max ${C.position_rule_error_m.max} m over ${C.position_rule_error_m.n}` : 'none mapped'} |`,
    `| tiles, triangles, bytes | ${C.tiles}, ${C.triangles.toLocaleString('en')}, ${C.tile_bytes.toLocaleString('en')} |`, '',
    '## Rules', '',
    '- **Mapped minaret**: an OSM element tagged `man_made=minaret`, `building=minaret`, `building:part=minaret` or `tower:type=minaret` (way or node), or the part-stack rule: in a mosque outline, building parts of 40 m2 or less whose top is 18 m or more and 1.6 times the hall\'s top or more, stacked (centroids within 2.5 m). Height from OSM `height` (else the size class); the balcony (şerefe) from a part of the stack raised on `min_height` below the top part (else at ' + lj.rule.minaret.serefe_frac + ' of the height); the cone from `roof:height` (else ' + lj.rule.minaret.cap_frac + ' of the height). Attached to the nearest mosque within 30 m.',
    '- **Estimated minaret** (class "estimated", countable and switchable): ' + lj.rule.note + '. Size classes: ' + lj.rule.minaret.classes.map(c => `${c.id} footprint < ${c.max_area_m2} m2: ${c.height_m} m high, base ${c.base_d_m} m`).join('; ') + '. Class S is drawn as a wooden minaret (brown cone).',
    '- **Dome**: an OSM building part (or a worship outline without parts) with `roof:shape=dome` or `onion`: a drum from `min_height` (else the ground) to the springing, then a hemisphere (or an onion) of `roof:height` (else its radius) to `height`; radius = the smaller half side of the part\'s oriented box. A whole building with a dome roof outside the core: the dome stands on the city block\'s flat top.',
    '- **Tower**: a building part of a worship building tagged as a tower (`building:part=tower|bell_tower|church_tower|steeple`, `tower:type=bell_tower`), or with a pointed or onion roof standing 1.25 times the body or more (12 m or more); a `man_made=tower` with `tower:type=bell_tower|clock`, `building=clock_tower|bell_tower` or named Sahat-kula. Its outline (its hull above 12 points) from `min_height` to the eaves, then a pyramid to `height` (pyramidal, cone, spire), a dome or an onion, or flat.',
    ...(TALL ? ['- **Tall thin object** (`place.landmarks.tall_objects`): an OSM element with `man_made` in ' + TALL.man_made.join(', ') + ' or `historic` in ' + TALL.historic.join(', ') + `, an OSM \`height\` of ${TALL.min_height_m} m or more, \`tower:type\` not ${TALL.exclude_tower_types.join(', ')}, centroid in the box. Found by one SPARQL query to the QLever OSM endpoint (positions), then read from the OSM API boxes (tags and geometry). A \`man_made=tower\` with an outline of 12 m2 or more is drawn as a tower; the others as bodies of revolution: chimney (a cylinder tapering to 0.72 of its base radius), obelisk (four sides on a plinth, a pyramid point), monument (a needle to a thin top: the Spire), mast (a pole tapering to a quarter). Radius: OSM \`diameter\` / 2, else the outline (an obelisk's outline is its plinth: / 1.5), else a stated rule by kind (chimney 0.045, obelisk 0.06, monument 0.012, mast 0.03 x the height, clamped).`] : []),
    '- **Ground**: a core feature\'s `ground_m` (+ the EGM96 geoid) where the object is a core building or part (the core walls\' reference), else the drawn terrain of the finest place tile at the point. Core parts drawn here are hidden in the core tiles by the reader (no double drawing); the mosque bodies stay the place\'s own buildings and blocks.',
    '- **Rendering** (architecture rule 6: geometry only, lit live): vertex colour, flat normals, the globe\'s sun; `_RADIAL` per vertex (the horizontal offset from the object\'s axis, cm) lets the reader keep a minaret at least about 1.5 CSS pixels wide at any distance (the shaft widened about its axis in the vertex shader; the height stays).', '',
    '## Sources', '',
    '| source | licence | use | request | answers / records | SHA-256 (stored) |', '|---|---|---|---|---|---|',
    ...Object.entries(L.fetches || {}).map(([k, f]) => `| ${f.source} | ${f.licence || (f.source === 'overture-places' ? 'CDLA-Permissive-2.0' : 'ODbL 1.0 (OSM-sourced records)')} | ${f.use || 'tags and geometry of the landmarks'} | ${String(f.url).replace(/\|/g, '/')} | ${f.requests ?? f.records ?? ''} | \`${f.sha256}\` |`), '',
    'Raw answers stay in `cwplans/data/raw/places/' + RID + '/landmarks/` (git-ignored; re-fetch with the tool). Overpass refused on 2026-10-21 (overpass-api.de reset the connection, kumi and private.coffee timed out, mail.ru 504) and Geofabrik reset the connection, so OSM came from the API\'s map call over a box round each candidate: a minaret mapped as a lone node more than about 80 m from any candidate (a religious building or part in Overture, a place of worship in Overture places, a religious building of the core) is not found.', '',
    '## Operations (dataflow)', '',
    ...[sel, til].filter(Boolean).map(a => `- \`${a.operation}\` v${a.version} (activity \`${a.activity}\`, ${a.at}): inputs ${a.inputs.map(i => `${i.label} \`${i.sha256.slice(0, 16)}\``).join(', ')}; params \`${JSON.stringify(a.params)}\``), '',
    '## Files', '', '| path | bytes | SHA-256 |', '|---|---|---|',
    ...files.map(o => `| [${o.path.replace(PRE, '')}](${GHO(o.path)}) | ${o.bytes} | \`${o.sha256}\` |`), ''];
  writeFileSync(join(OUT, 'README.md'), lines.join('\n'));
}

// ---------- main
async function main() {
  if (cmd === 'readme') { writeReadme(); return; }
  if (cmd === 'fetch' || cmd === 'all') { fetchOverture(); await fetchTall(); await fetchOsm(); }
  if (cmd === 'build' || cmd === 'all') {
    if (!existsSync(OSMF)) throw new Error('no OSM answers: run fetch first');
    const P = { names: PL.names || ['name'], alt_names: PL.alt_names || [], minaret_rule: LM.minaret_rule, ...(TALL ? { tall: TALL, box: BOX } : {}) };
    const fSel = join(WORK, 'select.json.gz');
    const a1 = await run(OPS.select, [fileIn(OSMF, 'osm'), fileIn(FEAT, 'features')], P, async p => { const S = selectLandmarks(rz(OSMF), fjCore, p); jz(fSel, S); return { files: [fSel], counts: S.counts }; });
    const ts = JSON.parse(readFileSync(TSET, 'utf8')), tiles = tileTree(ts), S = rz(fSel);
    // the place tiles the landmarks stand on (the finest tile at each landmark): inputs by hash
    const pts = [...S.worship.map(w => w.c), ...S.minarets.map(m => m.c), ...S.estimated.map(e => e.c), ...S.domes.map(d => d.c), ...S.towers.map(t => t.c), ...(S.tall || []).map(t => t.c)];
    const need = new Set(); for (const [lon, lat] of pts) { const t = tiles.filter(t => lon >= t.b[0] && lon < t.b[2] && lat >= t.b[1] && lat < t.b[3]).sort((a, b) => b.level - a.level)[0]; if (t) need.add(t.uri); }
    const tileFiles = [...need].sort().map(u => join(PLACED, u)), bufs = new Map([...need].map(u => [u, readFileSync(join(PLACED, u))]));
    const TP = { estimate: LM.estimate_minarets !== false && !flag('--no-estimate'), tile_level: LM.tile_level || 13 };
    await run(OPS.tiles, [fileIn(fSel, 'selection'), fileIn(TSET, 'place-tileset'), fileIn(FEAT, 'features'), ...tileFiles.map(f => fileIn(f, 'place-tile ' + rel(f).replace(/^.*\//, '')))], TP, async p => buildTiles(S, ts, bufs, fjCore, { ...p, ...P }));
    blog.about = `Build log of the landmarks of ${REG.name} (${TOOL}): fetch records and the dataflow activities landmark-select and landmark-tiles with input and output hashes and counts.`;
    blog.fetches = Object.fromEntries(Object.entries(flog).map(([k, v]) => [k, { ...v, file: v.file }]));
    writeFileSync(BLOG, JSON.stringify(blog, null, 1));
    writeIndex(); writeReadme();
    console.log(JSON.stringify(JSON.parse(readFileSync(join(OUT, 'landmarks.json'), 'utf8')).counts));
  }
}
await main();
