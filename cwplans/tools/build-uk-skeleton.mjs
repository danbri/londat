#!/usr/bin/env node
// UK skeleton (OKR KR2.7): national vector layers, a gazetteer and place cards from open data, in WGS84, cut by the
// worldwide geodetic quadtree (docs/planet-architecture.md), so that the globe can show and search the UK.
// Owner, 2026-10-12: "also skeleton of uk with more open data vector and factoid content. Then leiden after we can fly
// around uk and world without getting totally lost."
//
//   node cwplans/tools/build-uk-skeleton.mjs              fetch what is missing, then build
//   node cwplans/tools/build-uk-skeleton.mjs fetch [--refetch]
//   node cwplans/tools/build-uk-skeleton.mjs build [--force]   (--force: run every operation even when the log has it)
//   --region=<id>   a region config of docklands/geo/regions/ with an adapter '<id>-skeleton' (default uk)
//
// No UK constant is in this file: every host, product, layer, field name, the CRS and the projector come from the
// region's adapter (docklands/geo/regions/uk.js, adapter 'uk-skeleton'), so tools/check-locale.mjs counts nothing here.
// Raw downloads: cwplans/data/raw/<region>-skeleton/ (ignored by git; fetch-log.json there: URL, date, bytes, SHA-256).
// Output: cwplans/docklands/data/<region>/ (manifest.json, layers/, gazetteer/, cards/, log.json). Reader:
// docklands/geo/skeleton.js. Method, levels and parameters: skill cwplans-uk-skeleton (cwplans/skills/cwplans-uk-skeleton).
//
// Dataflow (skill cwplans-dataflow): each build step is a named operation { id, version, skill, tool } over input files
// fixed by SHA-256 and parameters; its activity id is sha256([op, version, inputs, params])[0:16]; outputs are written
// with their SHA-256 into log.json (append-only). A step whose activity is in the log with every output present and
// unchanged is not run again. Bodies read only their inputs: no clock and no network (fetch dates come from the log).
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync, readdirSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import * as lib from './lib.mjs';
import REGIONS from '../../docklands/geo/regions/index.js';
import { cellOf, cellBbox, fold, gazKey, pointInGeometry, unpack } from '../../docklands/geo/skeleton.js';

const argv = process.argv.slice(2), flag = f => argv.includes(f);
const RID = (argv.find(a => a.startsWith('--region=')) || '--region=uk').slice(9);
const REG = REGIONS[RID]; if (!REG) throw new Error(`no region ${RID}`);
const AD = REG.adapters.find(a => a.id === `${RID}-skeleton`); if (!AD) throw new Error(`region ${RID} has no adapter ${RID}-skeleton`);
const SRC = AD.sources, CW = join(lib.TOOLS, '..'), RAWD = join(lib.RAW, `${RID}-skeleton`);
const OUT = join(CW, AD.output.replace(/^cwplans\//, '').replace(/manifest\.json$/, ''));
const TOOL = 'tools/build-uk-skeleton.mjs', SKILL = 'cwplans-uk-skeleton';
mkdirSync(RAWD, { recursive: true }); mkdirSync(OUT, { recursive: true });
const sha = b => createHash('sha256').update(b).digest('hex');
const rel = p => relative(CW, p);

// ---------------------------------------------------------------- fetch (network; outside the operations)
const FLOG = join(RAWD, 'fetch-log.json');
const flog = existsSync(FLOG) ? JSON.parse(readFileSync(FLOG, 'utf8')) : {};
const saveFlog = () => writeFileSync(FLOG, JSON.stringify(flog, null, 1));
const today = () => new Date().toISOString().slice(0, 10);
async function fileSha(path) {
  const h = createHash('sha256'); await new Promise((res, rej) => createReadStream(path).on('data', d => h.update(d)).on('end', res).on('error', rej)); return h.digest('hex');
}
async function logFetch(file, url, extra = {}) {
  const p = join(RAWD, file), st = statSync(p);
  flog[file] = { url, fetched: today(), bytes: st.size, sha256: await fileSha(p), ...extra }; saveFlog();
  console.log(`fetched ${file}: ${(st.size / 1e6).toFixed(1)} MB`);
}
const want = file => flag('--refetch') || !existsSync(join(RAWD, file)) || !flog[file];
async function download(file, url) {
  const p = join(RAWD, file);
  // a large zip may be deleted once read (its SHA-256 stays in the fetch log): its extracted folder stands for it
  if (!flag('--refetch') && flog[file] && !existsSync(p) && existsSync(join(RAWD, 'x', file.replace(/\.zip$/, '')))) return;
  // a file already in the raw folder (fetched by hand with the same URL): logged with its file date, not fetched again
  if (!flag('--refetch') && existsSync(p)) { if (!flog[file]) { await logFetch(file, url); flog[file].fetched = statSync(p).mtime.toISOString().slice(0, 10); saveFlog(); } return; }
  execFileSync('curl', ['-sSL', '--retry', '5', '--fail', '-A', lib.UA, '-o', join(RAWD, file), url], { stdio: 'inherit' });
  await logFetch(file, url);
}
// through curl: one host (maps.data.gov.scot) answers 403 to Node's fetch and 200 to curl (2026-10-12)
const getJson = async url => JSON.parse(execFileSync('curl', ['-sS', '--retry', '3', '--fail', '-A', lib.UA, url], { maxBuffer: 1 << 28 }).toString('utf8'));
// an ArcGIS feature or map service layer: every feature, geometry in the CRS asked for, by object id in small batches
async function arcgis(file, url, { outSR = AD.crs.horizontal.split(' ')[0].split(':')[1], batch = 20, geometry = true } = {}) {
  if (!want(file)) return;
  const ids = (await getJson(`${url}/query?where=1%3D1&returnIdsOnly=true&f=json`)).objectIds.sort((a, b) => a - b), feats = [];
  for (let i = 0; i < ids.length; i += batch) {
    const q = `${url}/query?objectIds=${ids.slice(i, i + batch).join(',')}&outFields=*&returnGeometry=${geometry}&outSR=${outSR}&f=json`;
    const d = await getJson(q); if (d.error) throw new Error(`${url}: ${JSON.stringify(d.error)}`);
    feats.push(...d.features); await new Promise(r => setTimeout(r, 200));
  }
  writeFileSync(join(RAWD, file), JSON.stringify({ url, outSR, features: feats }));
  await logFetch(file, url + '/query', { features: feats.length, outSR });
}
// Wikidata through QLever (lib.qlever: paced, one call at a time): settlements of the country with a population, cities,
// the settlements of each part without OS names (Northern Ireland), then the card properties for all of them by VALUES
async function wikidata(file) {
  if (!want(file)) return;
  const W = SRC.wikidata, B = 'PREFIX wikibase: <http://wikiba.se/ontology#>\nPREFIX schema: <http://schema.org/>\nPREFIX psv: <http://www.wikidata.org/prop/statement/value/>\n';
  const out = { endpoint: lib.QLEVER, queries: {} };
  const run = async (k, q) => { const t = Date.now(), b = await lib.qlever(B + q); out.queries[k] = { query: q, rows: b.length, bindings: b }; console.log(`wikidata ${k}: ${b.length} rows, ${((Date.now() - t) / 1000).toFixed(1)} s`); return b; };
  const pop = await run('population', `SELECT ?item ?pop ?date ?rank ?coord WHERE { ?item wdt:P17 wd:${W.country} ; wdt:P625 ?coord ; wdt:P31/wdt:P279* wd:${W.settlementClass} .
  ?item p:P1082 ?st . ?st ps:P1082 ?pop ; wikibase:rank ?rank . OPTIONAL { ?st pq:P585 ?date } }`);
  // (deprecated statements are dropped here and in wikidataPlaces: a FILTER on the rank IRI gave 279 rows of 40,792 on QLever, 2026-10-12)
  const cities = await run('cities', `SELECT ?item ?coord WHERE { ?item wdt:P17 wd:${W.country} ; wdt:P625 ?coord ; wdt:P31/wdt:P279* wd:${W.cityClass} . }`);
  const parts = [];
  for (const p of W.partsWithoutNames || []) parts.push(...await run(`settlements-${p.id}`, `SELECT ?item ?label ?coord ?cls WHERE { ?item wdt:P131+ wd:${p.id} ; wdt:P625 ?coord ; wdt:P31 ?cls . ?cls wdt:P279* wd:${W.settlementClass} .
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en") }`));
  const best = new Map(); for (const r of pop) { if (r.rank.value.endsWith('DeprecatedRank')) continue; const q = r.item.value, v = +r.pop.value; if (!best.has(q) || v > best.get(q)) best.set(q, v); }
  const items = new Set([...[...best].filter(([, v]) => v >= W.minPopulation).map(([q]) => q), ...cities.map(r => r.item.value), ...parts.map(r => r.item.value)]);
  const ids = [...items].map(u => 'wd:' + u.split('/').pop()).sort(), V = `VALUES ?item { ${ids.join(' ')} }`;
  console.log(`wikidata: ${ids.length} items for cards`);
  await run('label', `SELECT ?item ?label WHERE { ${V} ?item rdfs:label ?label . FILTER(LANG(?label) = "en") }`);
  await run('description', `SELECT ?item ?d WHERE { ${V} ?item schema:description ?d . FILTER(LANG(?d) = "en") }`);
  await run('class', `SELECT ?item ?cls ?label WHERE { ${V} ?item wdt:P31 ?cls . ?cls rdfs:label ?label . FILTER(LANG(?label) = "en") }`);
  await run('area', `SELECT ?item ?amount ?unit WHERE { ${V} ?item p:P2046 ?st . ?st psv:P2046 ?v . ?v wikibase:quantityAmount ?amount ; wikibase:quantityUnit ?unit . }`);
  await run('elevation', `SELECT ?item ?amount ?unit WHERE { ${V} ?item p:P2044 ?st . ?st psv:P2044 ?v . ?v wikibase:quantityAmount ?amount ; wikibase:quantityUnit ?unit . }`);
  await run('enwiki', `SELECT ?item ?article WHERE { ${V} ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }`);
  await run('image', `SELECT ?item ?img WHERE { ${V} ?item wdt:P18 ?img . }`);
  await run('parent', `SELECT ?item ?parent ?label WHERE { ${V} ?item wdt:P131 ?parent . ?parent rdfs:label ?label . FILTER(LANG(?label) = "en") }`);
  await run('inception', `SELECT ?item ?date WHERE { ${V} ?item wdt:P571 ?date . }`);
  await run('website', `SELECT ?item ?site WHERE { ${V} ?item wdt:P856 ?site . }`);
  writeFileSync(join(RAWD, file), JSON.stringify(out));
  await logFetch(file, lib.QLEVER, { items: ids.length });
}
async function fetchAll() {
  const O = SRC.onsArcgis;
  for (const [k, L] of Object.entries(O.layers)) await arcgis(`ons-${k}.json`, `${O.base}/${L.service}/FeatureServer/0`);
  if (O.lookup) await arcgis(`ons-lookup.json`, `${O.base}/${O.lookup.service}/FeatureServer/0`, { geometry: false, batch: 500 });
  for (const L of SRC.landscapes) await arcgis(`${L.id}.json`, L.url);
  const D = SRC.osDownloads;
  for (const p of Object.values(D.products)) await download(p.file, `${D.base}/${p.product}/downloads?area=GB&format=${encodeURIComponent(p.format)}&redirect`);
  await download(SRC.naptan.file, SRC.naptan.url);
  await download(SRC.census.file, SRC.census.url);
  await wikidata('wikidata.json');
}

// ---------------------------------------------------------------- dataflow runtime (operations over hashed files)
const LOGF = join(OUT, 'log.json');
const LOG = existsSync(LOGF) ? JSON.parse(readFileSync(LOGF, 'utf8')) : { about: '', operations: {}, fetches: {}, activities: [] };
LOG.about = `Dataflow log of ${TOOL} (skill cwplans-dataflow): operations, the fetches that made their input files, and one activity per run of an operation (inputs and outputs by SHA-256). Append-only; a run that the log already has is not repeated.`;
const input = name => { const f = flog[name]; if (!f) throw new Error(`missing input ${name}: run fetch`); return { name, sha256: f.sha256, path: join(RAWD, name) }; };
const outputFile = path => { const b = readFileSync(join(OUT, path)); return { path, sha256: sha(b), bytes: b.length }; };
async function run(op, inputs, params, body) {
  LOG.operations[op.id] = { version: op.version, skill: SKILL, tool: TOOL, about: op.about };
  for (const i of inputs) if (flog[i.name]) LOG.fetches[i.name] = { url: flog[i.name].url, fetched: flog[i.name].fetched, bytes: flog[i.name].bytes, sha256: flog[i.name].sha256 };
  const ins = inputs.map(i => ({ name: i.name, sha256: i.sha256 })).sort((a, b) => a.name < b.name ? -1 : 1);
  const id = 'act' + sha(JSON.stringify([op.id, op.version, ins, params])).slice(0, 16);
  const old = LOG.activities.find(a => a.id === id);
  if (old && !flag('--force') && old.outputs.every(o => existsSync(join(OUT, o.path)) && sha(readFileSync(join(OUT, o.path))) === o.sha256)) { console.log(`${op.id}: unchanged (${id})`); return old; }
  const t = Date.now();
  for (const d of op.clears || []) rmSync(join(OUT, d), { recursive: true, force: true });
  const files = await body(params, Object.fromEntries(inputs.map(i => [i.name, i.path])));
  const outputs = [];
  for (const [path, text] of Object.entries(files).sort()) { mkdirSync(dirname(join(OUT, path)), { recursive: true }); writeFileSync(join(OUT, path), text); outputs.push(outputFile(path)); }
  const act = { id, operation: op.id, version: op.version, inputs: ins, params, outputs, seconds: Math.round((Date.now() - t) / 100) / 10 };
  LOG.activities = LOG.activities.filter(a => a.id !== id); LOG.activities.push(act);
  writeFileSync(LOGF, JSON.stringify(LOG, null, 1));
  console.log(`${op.id}: ${outputs.length} files, ${(outputs.reduce((s, o) => s + o.bytes, 0) / 1e6).toFixed(2)} MB, ${act.seconds} s (${id})`);
  return act;
}

// ---------------------------------------------------------------- geometry helpers (pure)
let PROJ = null;   // (E, N) -> [lon, lat] through the adapter's projector (OSTN15 for the UK)
const toLL = ([e, n]) => PROJ.inverse(e, n);
const signedArea = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return s / 2; };   // > 0 counter-clockwise
const ringOpen = r => (r.length > 1 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1]) ? r.slice(0, -1) : r;
const closeRing = r => [...r, r[0]];
function inRingXY(p, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
// ESRI rings (outer clockwise, holes counter-clockwise, y up) -> polygons [[outer, ...holes], ...], rings open
function esriPolygons(rings) {
  const outers = [], holes = [];
  for (const r0 of rings) { const r = ringOpen(r0.map(p => [p[0], p[1]])); if (r.length < 3) continue; (signedArea(r) < 0 ? outers : holes).push(r); }
  const polys = outers.map(o => [o]);
  for (const h of holes) { const p = polys.find(([o]) => inRingXY(h[0], o)); if (p) p.push(h); else polys.push([h.reverse()]); }
  return polys;
}
// GeoPackage geometry blob -> WKB -> { type, coords } (2D; Z and M dropped)
function gpkgGeom(buf) {
  if (!buf) return null;
  const flags = buf[3], env = [0, 32, 48, 48, 64][(flags >> 1) & 7], off = 8 + env;
  return wkb(Buffer.from(buf.buffer, buf.byteOffset + off, buf.length - off), { o: 0 });
}
function wkb(b, s) {
  const le = b[s.o] === 1; s.o += 1;
  const rd32 = () => { const v = le ? b.readUInt32LE(s.o) : b.readUInt32BE(s.o); s.o += 4; return v; };
  const rdD = () => { const v = le ? b.readDoubleLE(s.o) : b.readDoubleBE(s.o); s.o += 8; return v; };
  let t = rd32(); let dim = 2;
  if (t > 3000) { dim = 4; t -= 3000; } else if (t > 2000) { dim = 3; t -= 2000; } else if (t > 1000) { dim = 3; t -= 1000; }
  if (t & 0x80000000) { dim = 3; t &= 0xffff; } if (t & 0x40000000) { dim++; t &= 0xffff; }
  const pt = () => { const x = rdD(), y = rdD(); for (let k = 2; k < dim; k++) rdD(); return [x, y]; };
  const line = () => { const n = rd32(), a = new Array(n); for (let i = 0; i < n; i++) a[i] = pt(); return a; };
  const poly = () => { const n = rd32(), a = []; for (let i = 0; i < n; i++) a.push(line()); return a; };
  if (t === 1) return { type: 'Point', coords: pt() };
  if (t === 2) return { type: 'LineString', coords: line() };
  if (t === 3) return { type: 'Polygon', coords: poly() };
  const n = rd32(), parts = []; for (let i = 0; i < n; i++) parts.push(wkb(b, s));
  if (t === 4) return { type: 'MultiPoint', coords: parts.map(p => p.coords) };
  if (t === 5) return { type: 'MultiLineString', coords: parts.map(p => p.coords) };
  if (t === 6) return { type: 'MultiPolygon', coords: parts.map(p => p.coords) };
  return { type: 'GeometryCollection', parts };
}
const linesOf = g => !g ? [] : g.type === 'LineString' ? [g.coords] : g.type === 'MultiLineString' ? g.coords : [];
const polysOf = g => !g ? [] : g.type === 'Polygon' ? [g.coords.map(ringOpen)] : g.type === 'MultiPolygon' ? g.coords.map(p => p.map(ringOpen)) : [];

// Douglas-Peucker (lib.simplify; closed rings split at the farthest point) for a ring kept open
function simplifyRing(r, tol) { const s = lib.simplify(closeRing(r), tol); return ringOpen(s); }
const bboxOf = pts => { let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity; for (const [x, y] of pts) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; } return [w, s, e, n]; };
const unionBbox = (a, b) => a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b.slice();
const round = (v, dp) => { const f = 10 ** dp; return Math.round(v * f) / f; };
const rpt = (p, dp) => [round(p[0], dp), round(p[1], dp)];
const dedupe = pts => pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
const lineLen = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };

// Topology-keeping simplification of a polygon coverage (projected metres): rings are cut into arcs at junctions, each
// arc is simplified once, so neighbours keep one shared edge. Returns the polygons and the arcs (with their owners).
function topoSimplify(items, tol, { minArea = 0 } = {}) {
  const K = p => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
  const rings = []; items.forEach((it, i) => it.polys.forEach((poly, j) => poly.forEach((r, k) => rings.push({ i, j, k, pts: r, keys: r.map(K) }))));
  const edgeOwners = new Map(), nb = new Map();
  for (const R of rings) { const n = R.keys.length; for (let a = 0; a < n; a++) {
    const u = R.keys[a], v = R.keys[(a + 1) % n], e = u < v ? u + '|' + v : v + '|' + u;
    if (!edgeOwners.has(e)) edgeOwners.set(e, new Set()); edgeOwners.get(e).add(R.i);
    if (!nb.has(u)) nb.set(u, new Set()); if (!nb.has(v)) nb.set(v, new Set()); nb.get(u).add(v); nb.get(v).add(u);
  } }
  const ek = (u, v) => u < v ? u + '|' + v : v + '|' + u, own = e => [...edgeOwners.get(e)].sort((a, b) => a - b).join(',');
  const isNode = (R, a) => { const n = R.keys.length, u = R.keys[a], s = nb.get(u); if (s.size !== 2) return true;
    return own(ek(R.keys[(a + n - 1) % n], u)) !== own(ek(u, R.keys[(a + 1) % n])); };
  const arcs = new Map();   // arc id -> { pts (simplified), owners }
  const arcFor = (pts, keys) => {
    const idF = keys[0] + '>' + keys[1], idR = keys.at(-1) + '>' + keys.at(-2), id = idF < idR ? idF : idR, fwd = id === idF;
    if (!arcs.has(id)) { const p = fwd ? pts : [...pts].reverse(); arcs.set(id, { pts: lib.simplify(p, tol), owners: own(ek(keys[0], keys[1])).split(',').map(Number) }); }
    const A = arcs.get(id).pts; return fwd ? A : [...A].reverse();
  };
  const out = items.map(it => ({ ...it, polys: it.polys.map(p => p.map(() => null)) }));
  for (const R of rings) {
    const n = R.keys.length, nodes = []; for (let a = 0; a < n; a++) if (isNode(R, a)) nodes.push(a);
    let ring;
    if (!nodes.length) {   // a ring alone (an island): one closed arc from its lowest key
      let s = 0; for (let a = 1; a < n; a++) if (R.keys[a] < R.keys[s]) s = a;
      const pts = [...R.pts.slice(s), ...R.pts.slice(0, s), R.pts[s]], keys = [...R.keys.slice(s), ...R.keys.slice(0, s), R.keys[s]];
      ring = arcFor(pts, keys).slice(0, -1);
    } else {
      ring = [];
      for (let q = 0; q < nodes.length; q++) {
        const a = nodes[q], b = nodes[(q + 1) % nodes.length], pts = [], keys = [];
        for (let c = a; ; c = (c + 1) % n) { pts.push(R.pts[c]); keys.push(R.keys[c]); if (c === b && pts.length > 1) break; }
        ring.push(...arcFor(pts, keys).slice(0, -1));
      }
    }
    out[R.i].polys[R.j][R.k] = ring.length >= 3 && Math.abs(signedArea(ring)) >= minArea ? ring : null;
  }
  for (const it of out) it.polys = it.polys.filter(p => p[0]).map(p => p.filter(Boolean));
  return { items: out.filter(it => it.polys.length), arcs: [...arcs.values()] };
}
// simple per-polygon simplification (no shared edges kept): rings simplified alone, small rings dropped
function simplifyPolys(polys, tol, minArea) {
  return polys.map(p => p.map(r => simplifyRing(r, tol)).filter(r => r.length >= 3 && Math.abs(signedArea(r)) >= minArea)).filter(p => p.length && Math.abs(signedArea(p[0])) >= minArea);
}
// merge line pieces end to end (keys on a 2 m grid: Zoomstack rail ends differ by centimetres to a metre): at a node where more than two pieces meet, the line goes on along the
// unused piece that turns least (greedy), so a road or railway stays one line through its junctions
function mergeLines(lines) {
  const K = p => `${Math.round(p[0] / 2)},${Math.round(p[1] / 2)}`, ends = new Map(), used = new Uint8Array(lines.length), out = [];
  lines.forEach((l, i) => { if (l.length < 2) { used[i] = 1; return; } for (const k of [K(l[0]), K(l.at(-1))]) { if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); } });
  const dirOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const extend = pts => {
    for (;;) {
      const end = pts.at(-1), k = K(end), d0 = dirOf(pts.at(-2), end); let best = -1, bt = Infinity, bl = null;
      for (const j of ends.get(k) || []) { if (used[j]) continue; const l = K(lines[j][0]) === k ? lines[j] : [...lines[j]].reverse();
        let t = Math.abs(dirOf(l[0], l[1]) - d0); if (t > Math.PI) t = 2 * Math.PI - t; if (t < bt) { bt = t; best = j; bl = l; } }
      if (best < 0) return pts;
      used[best] = 1; for (let i = 1; i < bl.length; i++) pts.push(bl[i]);
    }
  };
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue; used[i] = 1;
    out.push(extend(extend([...lines[i]]).reverse()));
  }
  return out;
}
// clip a WGS84 line to a lon/lat box: the pieces inside (Liang-Barsky per segment, joined)
function clipLine(pts, [w, s, e, n]) {
  const out = []; let cur = null;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], dx = x1 - x0, dy = y1 - y0; let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, x0 - w], [dx, e - x0], [-dy, y0 - s], [dy, n - y0]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } } else { const r = q / p; if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; } }
    }
    if (!ok) { if (cur) { out.push(cur); cur = null; } continue; }
    const a = [x0 + t0 * dx, y0 + t0 * dy], b = [x0 + t1 * dx, y0 + t1 * dy];
    if (!cur) cur = [a]; cur.push(b);
    if (t1 < 1) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.filter(l => l.length >= 2);
}

// ---------------------------------------------------------------- tiling into files (layers/<id>/<level>/<x>-<y>.json)
// File format 'skeleton-1' (decoded by docklands/geo/skeleton.js unpack): { format, q, features: [{ id, bbox?, properties,
// geometry: { type, d } }] }. d holds integer coordinates (degrees x q), each point after the first of a line or ring as a
// difference from the one before: a LineString [x0, y0, dx1, dy1, ...], a Polygon [ring, ...], a MultiPolygon [polygon,
// ...], a Point [x, y]. Rings are closed. No bbox is stored: the reader computes it. About 3 times smaller than GeoJSON.
function packed(features, dp) {
  const q = 10 ** dp, I = v => Math.round(v * q);
  const flat = pts => { const out = []; let px = 0, py = 0; pts.forEach((p, i) => { const x = I(p[0]), y = I(p[1]); out.push(i ? x - px : x, i ? y - py : y); px = x; py = y; }); return out; };
  const enc = g => g.type === 'Point' ? [I(g.coordinates[0]), I(g.coordinates[1])] : g.type === 'LineString' ? flat(g.coordinates) : g.type === 'Polygon' ? g.coordinates.map(flat) : g.coordinates.map(p => p.map(flat));
  return JSON.stringify({ format: 'skeleton-1', q, features: features.map(f => ({ id: f.id, properties: f.properties, geometry: { type: f.geometry.type, d: enc(f.geometry) } })) });
}
// features: [{ id, properties, geometry: { type, coordinates } }] in WGS84. Polygons and points: home cell (bbox centre);
// lines: clipped at cell edges (a piece per cell, id '<id>.<n>'). Coordinates rounded to dp decimals.
function tile(layerId, level, features, dp, files) {
  const cells = new Map(), put = (x, y, f) => { const k = `${x}-${y}`; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(f); };
  for (const f of features) {
    const g = f.geometry;
    if (g.type === 'Point') { const c = rpt(g.coordinates, dp); put(...cellOf(level, c[0], c[1]), { type: 'Feature', id: f.id, bbox: [c[0], c[1], c[0], c[1]], properties: f.properties, geometry: { type: 'Point', coordinates: c } }); continue; }
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(p => p.map(r => { const q = dedupe(r.map(v => rpt(v, dp))); return q.length >= 3 ? closeRing(q) : null; }).filter(Boolean)).filter(p => p.length);
      if (!polys.length) continue;
      const bb = polys.reduce((a, p) => unionBbox(a, bboxOf(p[0])), null);
      put(...cellOf(level, (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2), { type: 'Feature', id: f.id, bbox: bb, properties: f.properties, geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys } });
      continue;
    }
    const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates; let n = 0;
    for (const l of lines) {
      const bb = bboxOf(l), [x0, y0] = cellOf(level, bb[0], bb[1]), [x1, y1] = cellOf(level, bb[2], bb[3]);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (const piece of clipLine(l, cellBbox(level, x, y))) {
        const q = dedupe(piece.map(v => rpt(v, dp))); if (q.length < 2) continue;
        put(x, y, { type: 'Feature', id: `${f.id}.${n++}`, bbox: bboxOf(q), properties: f.properties, geometry: { type: 'LineString', coordinates: q } });
      }
    }
  }
  for (const [k, fs] of [...cells].sort()) files[`layers/${layerId}/${level}/${k}.json`] = packed(fs, dp);
}
const llRing = r => r.map(toLL);
const llPolys = polys => polys.map(p => p.map(llRing));
const geomOfPolys = polys => polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };

// ---------------------------------------------------------------- operations
const P = AD.cells.levels;   // [national, regional, city] levels
const LEVEL = { national: P[0], regional: P[1], city: P[2] };
const DP = { [P[0]]: 3, [P[1]]: 4, [P[2]]: 4 };   // decimals per level: about 110 m, 11 m, 11 m (7 m east-west at 52 N)

// ONS: countries, regions, counties and unitary authorities, districts (with census population), the boundary lines
async function opBoundaries() {
  const O = SRC.onsArcgis, L = O.layers, names = ['countriesCoarse', 'countries', 'regions', 'ctyua', 'lad'];
  const inputs = [...names.map(k => input(`ons-${k}.json`)), input(SRC.census.file), ...(O.lookup ? [input('ons-lookup.json')] : [])];
  const params = { tolerance_m: { coarse: 800, regional: 150, city: 60 }, minAreaM2: { coarse: 5e6, regional: 2e5, city: 2e4 }, levels: LEVEL, decimals: DP, census: SRC.census.member };
  return run({ id: 'uk-boundaries', version: 4, about: 'ONS generalised boundaries (clipped to the coastline) in the source grid: topology-keeping Douglas-Peucker per level, reprojected to WGS84 by the region projector, cut into quadtree cells; boundary and coast lines from the shared arcs; census population joined to districts', clears: ['layers/countries', 'layers/regions', 'layers/counties', 'layers/districts', 'layers/boundaries'] }, inputs, params, async (p, I) => {
    const read = k => JSON.parse(readFileSync(I[`ons-${k}.json`], 'utf8')).features;
    // census 2021 usual residents per lower-tier authority, mapped to the current codes through the lookup (summed)
    const pop = new Map(), csv = execFileSync('unzip', ['-p', I[SRC.census.file], p.census], { maxBuffer: 1 << 26 }).toString('utf8').trim().split('\n').slice(1);
    const look = new Map(); if (O.lookup) for (const f of JSON.parse(readFileSync(I['ons-lookup.json'], 'utf8')).features) look.set(f.attributes[O.lookup.from], f.attributes[O.lookup.to]);
    for (const line of csv) { const c = csvRow(line); const code = look.get(c[2]) || c[2]; pop.set(code, (pop.get(code) || 0) + +c[3]); }
    const items = k => read(k).map(f => ({ props: f.attributes, polys: esriPolygons(f.geometry?.rings || []) })).filter(it => it.polys.length);
    const files = {};
    const layerOut = (id, src, key, levelKey, extra = () => ({})) => {
      const t = p.tolerance_m[levelKey], level = levelKey === 'coarse' ? p.levels.national : p.levels[levelKey];
      const { items: its, arcs } = topoSimplify(src, t, { minArea: p.minAreaM2[levelKey] });
      tile(id, level, its.map(it => ({ id: it.props[L[key].code], properties: { code: it.props[L[key].code], name: it.props[L[key].name], ...(L[key].nameCy && String(it.props[L[key].nameCy] ?? '').trim() ? { nameCy: it.props[L[key].nameCy].trim() } : {}), ...extra(it.props) }, geometry: geomOfPolys(llPolys(it.polys)) })), p.decimals[level], files);
      return { arcs, its: src, level };
    };
    const lines = new Map();   // level -> features
    const addLines = (level, kindOf, res, key) => {
      if (!lines.has(level)) lines.set(level, []);
      for (const a of res.arcs) {
        const k = kindOf(a.owners.length); if (!k) continue;
        const nm = a.owners.map(o => res.its[o].props[L[key].name]);
        lines.get(level).push({ id: `${k}${lines.get(level).length}`, properties: { kind: k, ...(a.owners.length === 2 ? { left: nm[0], right: nm[1] } : { name: nm[0] }) }, geometry: { type: 'LineString', coordinates: a.pts.map(toLL) } });
      }
    };
    const ctry = items('countries'), ctryC = items('countriesCoarse'), rgn = items('regions'), cty = items('ctyua'), lad = items('lad');
    addLines(p.levels.national, n => n === 1 ? 'coast' : n === 2 ? 'country' : null, layerOut('countries', ctryC, 'countriesCoarse', 'coarse'), 'countriesCoarse');
    for (const lk of ['regional', 'city']) {
      const lv = p.levels[lk];
      addLines(lv, n => n === 1 ? 'coast' : n === 2 ? 'country' : null, lk === 'regional' ? layerOut('countries', ctry, 'countries', lk) : { ...topoSimplify(ctry, p.tolerance_m[lk], { minArea: p.minAreaM2[lk] }), its: ctry }, 'countries');
      addLines(lv, n => n === 2 ? 'region' : null, lk === 'regional' ? layerOut('regions', rgn, 'regions', lk) : { ...topoSimplify(rgn, p.tolerance_m[lk]), its: rgn }, 'regions');
      addLines(lv, n => n === 2 ? 'county' : null, lk === 'regional' ? layerOut('counties', cty, 'ctyua', lk) : { ...topoSimplify(cty, p.tolerance_m[lk]), its: cty }, 'ctyua');
      const d = layerOut('districts', lad, 'lad', lk, pr => pop.has(pr[L.lad.code]) ? { pop2021: pop.get(pr[L.lad.code]) } : {});
      if (lk === 'city') addLines(lv, n => n === 2 ? 'district' : null, d, 'lad');
    }
    for (const [lv, fs] of lines) tile('boundaries', lv, fs, p.decimals[lv], files);
    const missing = lad.filter(it => !pop.has(it.props[L.lad.code]) && /^[EW]/.test(it.props[L.lad.code])).map(it => it.props[L.lad.code]);
    if (missing.length) console.log(`  census: no 2021 population for ${missing.length} English or Welsh districts: ${missing.join(' ')}`);
    return files;
  });
}

// national parks (ONS) and the landscape designations (Natural England, NRW, Scottish Government)
async function opProtected() {
  const O = SRC.onsArcgis, inputs = [input('ons-nationalParks.json'), ...SRC.landscapes.map(l => input(`${l.id}.json`))];
  const params = { tolerance_m: { coarse: 800, regional: 150, city: 30 }, minAreaM2: { coarse: 5e6, regional: 2e5, city: 1e4 }, levels: LEVEL, decimals: DP };
  return run({ id: 'uk-protected-areas', version: 4, about: 'National parks (ONS BGC) and national landscapes / national scenic areas: Douglas-Peucker per ring, reprojected by the region projector, cut into cells', clears: ['layers/national-parks', 'layers/landscapes'] }, inputs, params, async (p, I) => {
    const files = {}, NP = O.layers.nationalParks;
    const np = JSON.parse(readFileSync(I['ons-nationalParks.json'], 'utf8')).features.map(f => ({ props: f.attributes, polys: esriPolygons(f.geometry?.rings || []) }));
    for (const [lk, lv] of [['coarse', p.levels.national], ['regional', p.levels.regional], ['city', p.levels.city]])
      tile('national-parks', lv, np.map(it => ({ id: it.props[NP.code], properties: { code: it.props[NP.code], name: it.props[NP.name], ...(String(it.props[NP.nameCy] ?? '').trim() ? { nameCy: it.props[NP.nameCy].trim() } : {}), designation: 'National Park' }, geometry: geomOfPolys(llPolys(simplifyPolys(it.polys, p.tolerance_m[lk], p.minAreaM2[lk]))) })).filter(f => f.geometry.coordinates.length), p.decimals[lv], files);
    const ls = SRC.landscapes.flatMap(L => JSON.parse(readFileSync(I[`${L.id}.json`], 'utf8')).features.map(f => ({ L, props: f.attributes, polys: esriPolygons(f.geometry?.rings || []) })));
    // one feature per designated area: parts with the same code (Wales, Scotland publish several) merged
    const byCode = new Map(); for (const it of ls) { const k = `${it.L.id}:${it.props[it.L.code] ?? it.props[it.L.name]}`; if (byCode.has(k)) byCode.get(k).polys.push(...it.polys); else byCode.set(k, { ...it, polys: [...it.polys] }); }
    const dateOf = v => v == null ? undefined : typeof v === 'number' ? new Date(v).toISOString().slice(0, 10) : String(v).slice(0, 10);
    for (const [lk, lv] of [['regional', p.levels.regional], ['city', p.levels.city]])
      tile('landscapes', lv, [...byCode.entries()].map(([k, it]) => ({ id: k, properties: { name: String(it.props[it.L.name]).replace(/\s+/g, ' ').trim(), designation: it.L.designation, source: it.L.id, ...(it.L.designated && dateOf(it.props[it.L.designated]) ? { designated: dateOf(it.props[it.L.designated]) } : {}) }, geometry: geomOfPolys(llPolys(simplifyPolys(it.polys, p.tolerance_m[lk], p.minAreaM2[lk]))) })).filter(f => f.geometry.coordinates.length), p.decimals[lv], files);
    return files;
  });
}

const unzipOnce = (zip, member) => { const dir = join(RAWD, 'x', zip.replace(/\.zip$/, '')); const f = join(dir, member); if (!existsSync(f)) { mkdirSync(dir, { recursive: true }); execFileSync('unzip', ['-o', '-q', join(RAWD, zip), member, '-d', dir]); } return f; };
const gpkgMember = zip => { const dir = join(RAWD, 'x', zip.replace(/\.zip$/, ''));
  if (!existsSync(join(RAWD, zip)) && existsSync(dir)) { const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]); return relative(dir, walk(dir).find(f => f.endsWith('.gpkg'))); }
  return execFileSync('unzip', ['-Z1', join(RAWD, zip)]).toString().split('\n').find(l => l.endsWith('.gpkg')); };
const openGpkg = zip => new DatabaseSync(unzipOnce(zip, gpkgMember(zip)), { readOnly: true });

// OS Open Zoomstack: roads (national and regional tables), railways, surface water (lakes)
async function opZoomstack() {
  const Z = SRC.osDownloads.products.zoomstack, inputs = [input(Z.file)];
  const params = { roads: Z.roads, rail: Z.rail, water: Z.water, tolerance_m: { national: 500, regional: 150, city: 50 }, minLakeM2: { regional: 2e6, city: 2.5e5 }, levels: LEVEL, decimals: DP };
  return run({ id: 'uk-zoomstack', version: 5, about: 'OS Open Zoomstack roads (motorways, A roads), railways and surface water: lines merged end to end by class and name, Douglas-Peucker, reprojected by the region projector, clipped to cells', clears: ['layers/roads', 'layers/rail', 'layers/lakes'] }, inputs, params, async (p, I) => {
    const db = openGpkg(Z.file), files = {};
    // roads: per level the classes it keeps; pieces with the same class, number and name merged
    const roadRows = []; for (const t of p.roads.tables) for (const r of db.prepare(`select ${p.roads.class} c, ${p.roads.name} n, ${p.roads.number} num, geom g from "${t}"`).all()) roadRows.push(r);
    const group = (rows, key) => { const m = new Map(); for (const r of rows) { const k = key(r); if (!m.has(k)) m.set(k, []); for (const l of linesOf(gpkgGeom(r.g))) m.get(k).push(l); } return m; };
    const roadGroups = group(roadRows, r => JSON.stringify([r.c, r.num || '', r.num ? '' : r.n || '']));
    for (const [lk, lv] of [['national', p.levels.national], ['regional', p.levels.regional], ['city', p.levels.city]]) {
      const keep = p.roads.levels[lk], fs = []; let i = 0;
      for (const [k, ls] of roadGroups) { const [c, num, n] = JSON.parse(k); if (!keep.includes(c)) continue;
        for (const l of mergeLines(ls)) { const s = lib.simplify(l, p.tolerance_m[lk]); if (s.length < 2 || lineLen(s) < 2 * p.tolerance_m[lk]) continue;
          fs.push({ id: `r${i++}`, properties: { kind: p.roads.kinds[c] || c, ...(num ? { ref: num } : {}), ...(n ? { name: n } : {}) }, geometry: { type: 'LineString', coordinates: s.map(toLL) } }); } }
      tile('roads', lv, fs, p.decimals[lv], files);
    }
    const railGroups = group(db.prepare(`select ${p.rail.class} c, geom g from "${p.rail.table}"`).all().filter(r => p.rail.levels.city.includes(r.c)), r => p.rail.kinds[r.c] || r.c);
    for (const [lk, lv] of [['regional', p.levels.regional], ['city', p.levels.city]]) {
      const fs = []; let i = 0;
      for (const [kind, ls] of railGroups) { if (!p.rail.levels[lk].some(c => (p.rail.kinds[c] || c) === kind)) continue;
        for (const l of mergeLines(ls)) { const s = lib.simplify(l, p.tolerance_m[lk]); if (s.length < 2 || lineLen(s) < 2 * p.tolerance_m[lk]) continue; fs.push({ id: `t${i++}`, properties: { kind }, geometry: { type: 'LineString', coordinates: s.map(toLL) } }); } }
      tile('rail', lv, fs, p.decimals[lv], files);
    }
    const water = db.prepare(`select ${p.water.class} c, geom g from "${p.water.table}"`).all().filter(r => p.water.keep.includes(r.c));
    const wpolys = water.flatMap(r => polysOf(gpkgGeom(r.g)).map(poly => ({ c: r.c, poly })));
    for (const [lk, lv] of [['regional', p.levels.regional], ['city', p.levels.city]]) {
      let i = 0; const fs = [];
      for (const { c, poly } of wpolys) { if (Math.abs(signedArea(poly[0])) < p.minLakeM2[lk]) continue; const s = simplifyPolys([poly], p.tolerance_m[lk], p.minLakeM2[lk] / 20); if (!s.length) continue;
        fs.push({ id: `w${i++}`, properties: { kind: p.water.kinds[c] || c, areaKm2: round(Math.abs(signedArea(poly[0])) / 1e6, 2) }, geometry: geomOfPolys(llPolys(s)) }); }
      tile('lakes', lv, fs, p.decimals[lv], files);
    }
    db.close();
    return files;
  });
}

// OS Open Rivers: named watercourses, linked by their nodes into rivers; kept by length per level
async function opRivers() {
  const Z = SRC.osDownloads.products.rivers, inputs = [input(Z.file)];
  const params = { minKm: { regional: 40, city: 10 }, minPieceKm: 1, tolerance_m: { regional: 150, city: 40 }, levels: LEVEL, decimals: DP };
  return run({ id: 'uk-rivers', version: 6, about: 'OS Open Rivers watercourse links grouped by name and connection into rivers, kept by total length per level, merged end to end, Douglas-Peucker, reprojected by the region projector, clipped to cells', clears: ['layers/rivers'] }, inputs, params, async (p, I) => {
    const db = openGpkg(Z.file), files = {}, rows = db.prepare('select watercourse_name n, watercourse_name_alternative alt, form f, start_node a, end_node b, length len, geometry g from watercourse_link where watercourse_name is not null').all();
    // union-find over links that share a node and a name
    const par = rows.map((_, i) => i), find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
    const byNode = new Map(); rows.forEach((r, i) => { for (const k of [r.a, r.b]) { const key = r.n + '|' + k; if (byNode.has(key)) par[find(i)] = find(byNode.get(key)); else byNode.set(key, i); } });
    const groups = new Map(); rows.forEach((r, i) => { const k = find(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    const nameKm = new Map(); for (const r of rows) nameKm.set(r.n, (nameKm.get(r.n) || 0) + r.len / 1000);
    for (const [lk, lv] of [['regional', p.levels.regional], ['city', p.levels.city]]) {
      const fs = []; let i = 0;
      for (const rs of groups.values()) {
        // a named river is cut into several components where links of another name or none come between (the tidal
        // Thames: 23 pieces): a piece is kept when it is long enough or when its name is long enough over the country
        const km = rs.reduce((s, r) => s + r.len, 0) / 1000; if (km < p.minKm[lk] && !(nameKm.get(rs[0].n) >= 3 * p.minKm[lk] && km >= p.minPieceKm)) continue;
        const forms = [...new Set(rs.map(r => r.f))], props = { name: rs[0].n, ...(rs[0].alt ? { nameAlt: rs[0].alt } : {}), kind: forms.includes('canal') ? 'canal' : forms.includes('tidalRiver') ? 'tidal river' : 'river', lengthKm: Math.round(km) };
        for (const l of mergeLines(rs.flatMap(r => linesOf(gpkgGeom(r.g))))) { const s = lib.simplify(l, p.tolerance_m[lk]); if (s.length >= 2) fs.push({ id: `v${i++}`, properties: props, geometry: { type: 'LineString', coordinates: s.map(toLL) } }); }
      }
      tile('rivers', lv, fs, p.decimals[lv], files);
    }
    db.close();
    return files;
  });
}

// OS Open Built Up Areas
async function opBuiltUp() {
  const Z = SRC.osDownloads.products.builtUp, inputs = [input(Z.file)];
  const params = { minHa: { regional: 500, city: 50 }, tolerance_m: { regional: 150, city: 60 }, levels: LEVEL, decimals: DP };
  return run({ id: 'uk-built-up', version: 3, about: 'OS Open Built Up Areas by size per level, Douglas-Peucker per ring, reprojected by the region projector, cut into cells', clears: ['layers/built-up'] }, inputs, params, async (p, I) => {
    const db = openGpkg(Z.file), files = {}, rows = db.prepare('select gsscode code, name1_text n1, name2_text n2, areahectares ha, geometry g from os_open_built_up_areas').all();
    for (const [lk, lv] of [['regional', p.levels.regional], ['city', p.levels.city]])
      tile('built-up', lv, rows.filter(r => r.ha >= p.minHa[lk]).map(r => ({ id: r.code, properties: { code: r.code, name: r.n1, ...(r.n2 ? { nameAlt: r.n2 } : {}), areaKm2: round(r.ha / 100, 2) }, geometry: geomOfPolys(llPolys(simplifyPolys(polysOf(gpkgGeom(r.g)), p.tolerance_m[lk], 1e4))) })).filter(f => f.geometry.coordinates.length), p.decimals[lv], files);
    db.close();
    return files;
  });
}

// CSV with quotes (RFC 4180 subset: one record per line)
function csvRow(line) { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; }
async function eachCsvLine(cmd, args2, fn) {
  const ch = spawn(cmd, args2, { stdio: ['ignore', 'pipe', 'inherit'] }), rl = createInterface({ input: ch.stdout, crlfDelay: Infinity });
  for await (const line of rl) fn(line.replace(/^﻿/, ''));
}

// NaPTAN rail, metro and tram stations
async function opStations() {
  const N = SRC.naptan, inputs = [input(N.file)];
  const params = { stopTypes: N.stopTypes, level: LEVEL.regional, decimals: 5 };
  return run({ id: 'uk-stations', version: 4, about: 'NaPTAN active rail and metro / tram station areas as points (easting, northing by the region projector), names without the stop-type suffix', clears: ['layers/stations'] }, inputs, params, async (p, I) => {
    const lines = readFileSync(I[N.file], 'utf8').split('\n'), h = csvRow(lines[0]), ix = k => h.indexOf(k), fs = [];
    for (const line of lines.slice(1)) {
      if (!line) continue; const c = csvRow(line), t = c[ix('StopType')]; if (!p.stopTypes[t] || c[ix('Status')] !== 'active') continue;
      const E = +c[ix('Easting')], Nn = +c[ix('Northing')]; if (!E || !Nn) continue;
      const name = c[ix('CommonName')].replace(new RegExp(N.nameSuffix), '').trim();
      fs.push({ id: c[ix('ATCOCode')], properties: { name, kind: p.stopTypes[t] }, geometry: { type: 'Point', coordinates: toLL([E, Nn]) } });
    }
    const files = {}; tile('stations', p.level, fs, p.decimals, files); return files;
  });
}

// Wikidata answers -> places with best population, card facts (pure: reads the saved answers)
function wikidataPlaces(path, W) {
  const D = JSON.parse(readFileSync(path, 'utf8')), Q = k => D.queries[k]?.bindings || [], qid = u => u.split('/').pop();
  const pt = wkt => { const m = /POINT\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(wkt); return m ? [+m[1], +m[2]] : null; };
  const P = new Map(), get = q => { if (!P.has(q)) P.set(q, { wd: q, classes: [], parents: [], areas: [], elevs: [], images: [], sites: [], incept: [] }); return P.get(q); };
  for (const r of Q('population')) { if (r.rank.value.endsWith('DeprecatedRank')) continue; const o = get(qid(r.item.value)); o.coord ??= pt(r.coord.value); (o.pops ??= []).push({ v: +r.pop.value, date: r.date?.value?.slice(0, 10) || null, pref: r.rank.value.endsWith('PreferredRank') }); }
  for (const r of Q('cities')) { const o = get(qid(r.item.value)); o.coord ??= pt(r.coord.value); o.city = true; }
  for (const k of Object.keys(D.queries).filter(k => k.startsWith('settlements-'))) for (const r of Q(k)) { const o = get(qid(r.item.value)); o.coord ??= pt(r.coord.value); o.label ??= r.label.value; o.part = k.slice(12); (o.partClasses ??= new Set()).add(qid(r.cls.value)); }
  for (const r of Q('label')) if (P.has(qid(r.item.value))) P.get(qid(r.item.value)).label = r.label.value;
  for (const r of Q('description')) if (P.has(qid(r.item.value))) P.get(qid(r.item.value)).description = r.d.value;
  for (const r of Q('class')) if (P.has(qid(r.item.value))) P.get(qid(r.item.value)).classes.push({ wd: qid(r.cls.value), label: r.label.value });
  const unitScale = { [W.units.km2]: 1, [W.units.ha]: 0.01, [W.units.m2]: 1e-6, [W.units.mi2]: 2.589988, [W.units.acre]: 0.00404686 };
  for (const r of Q('area')) { const o = P.get(qid(r.item.value)); const f = unitScale[qid(r.unit.value)]; if (o && f) o.areas.push(+r.amount.value * f); }
  for (const r of Q('elevation')) { const o = P.get(qid(r.item.value)); const u = qid(r.unit.value); if (o && (u === W.units.m || u === W.units.ft)) o.elevs.push(+r.amount.value * (u === W.units.ft ? 0.3048 : 1)); }
  for (const r of Q('enwiki')) { const o = P.get(qid(r.item.value)); if (o) o.enwiki = decodeURIComponent(r.article.value.split('/wiki/')[1]).replace(/_/g, ' '); }
  for (const r of Q('image')) { const o = P.get(qid(r.item.value)); if (o) o.images.push(decodeURIComponent(r.img.value.split('/Special:FilePath/')[1] || '').replace(/_/g, ' ')); }
  for (const r of Q('parent')) { const o = P.get(qid(r.item.value)); if (o) o.parents.push({ wd: qid(r.parent.value), name: r.label.value }); }
  for (const r of Q('inception')) { const o = P.get(qid(r.item.value)); if (o) o.incept.push(r.date.value); }
  for (const r of Q('website')) { const o = P.get(qid(r.item.value)); if (o) o.sites.push(r.site.value); }
  for (const o of P.values()) {
    const ps = o.pops || [], pref = ps.filter(x => x.pref), pool = pref.length ? pref : ps;
    o.pop = pool.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.v - a.v)[0] || null;
    o.areas.sort((a, b) => a - b); o.elevs.sort((a, b) => a - b); o.images.sort(); o.sites.sort(); o.incept.sort(); o.parents.sort((a, b) => a.wd.localeCompare(b.wd));
    o.classes.sort((a, b) => a.wd.localeCompare(b.wd));
  }
  return { places: P, fetchedFromLog: null };
}
// a Wikidata date literal as written (year, year-month or day, by precision we cannot see: trim a 01-01 start)
const wdDate = v => { const m = /^(-?\d{1,4})-(\d\d)-(\d\d)/.exec(v); if (!m) return v; return m[2] === '01' && m[3] === '01' ? m[1] : `${m[1]}-${m[2]}-${m[3]}`; };

// Gazetteer (OS Open Names + Open Rivers names + ONS areas + Wikidata settlements where OS has no names), the place
// labels layer, and the place cards
async function opGazetteer() {
  const O = SRC.osDownloads.products, G = SRC.gazetteer, W = SRC.wikidata;
  const inputs = [input(O.names.file), input(O.rivers.file), input('wikidata.json'), ...['countries', 'regions', 'ctyua', 'lad', 'nationalParks'].map(k => input(`ons-${k}.json`)), ...SRC.landscapes.map(l => input(`${l.id}.json`))];
  const fetched = flog['wikidata.json']?.fetched;
  const params = { kinds: G.kinds, labels: G.labels, cardLevel: LEVEL.regional, prefixes: G.prefixes, bbox: REG.bbox, matchKm: 8, wikidataRetrieved: fetched, minPopulation: W.minPopulation, decimals: 4, units: W.units,
    idKinds: [...G.populatedKinds, 'country', 'region', 'county', 'district', 'np', 'landscape'] };
  return run({ id: 'uk-gazetteer', version: 6, about: 'Gazetteer by name key (OS Open Names kinds chosen, postcode districts as the mean of their postcodes, river names, ONS area names, Wikidata settlements where OS has none), place label points by level, and place cards from Wikidata (matched to OS names by DBpedia link, then by name within 8 km) with census population of the district', clears: ['gazetteer', 'cards', 'layers/places'] }, inputs, params, async (p, I) => {
    const ents = [], pcd = new Map(), KIND = p.kinds;
    const add = (name, alt, kind, ll, la, id, extra = {}) => ents.push({ name, alt: alt || '', kind, ll, la: la || '', id, ...extra });
    let hdr = null;
    const csvFiles = execFileSync('unzip', ['-Z1', I[O.names.file]]).toString().split('\n').filter(l => /^Data\/.*\.csv$/.test(l)).sort();
    for (const f of csvFiles) await eachCsvLine('unzip', ['-p', I[O.names.file], f], line => {
      if (!line) return; const c = csvRow(line); if (!hdr) { if (c[0] === 'ID') { hdr = c; return; } }
      const lt = c[7], E = +c[8], N = +c[9];
      if (lt === 'Postcode') { const d = c[16] || c[2].split(' ')[0]; if (!d) return;   // POSTCODE_DISTRICT is empty on postcode rows (2026-07 release)
      let s = pcd.get(d); if (!s) pcd.set(d, s = { e: 0, n: 0, k: 0, la: new Map() }); s.e += E; s.n += N; s.k++; const la = c[21] || c[24]; s.la.set(la, (s.la.get(la) || 0) + 1); return; }
      const kind = KIND[lt]; if (!kind) return;
      add(c[2], c[4], kind, toLL([E, N]), c[21] || c[24], c[0], { dbp: c[32] ? decodeURIComponent(c[32].split('/resource/')[1] || '').replace(/_/g, ' ') : '', country: c[29] });
    });
    for (const [d, s] of pcd) add(d, '', 'pcd', toLL([s.e / s.k, s.n / s.k]), [...s.la].sort((a, b) => b[1] - a[1])[0][0], 'pcd' + d.replace(/ /g, ''));
    // rivers: one entry per named river (the middle vertex of its longest link group)
    const db = openGpkg(O.rivers.file), rv = new Map();
    for (const r of db.prepare('select watercourse_name n, length len, geometry g from watercourse_link where watercourse_name is not null').all()) {
      const s = rv.get(r.n) || { len: 0, best: null, bl: 0 }; s.len += r.len; if (r.len > s.bl) { s.bl = r.len; s.best = r.g; } rv.set(r.n, s);
    }
    db.close();
    for (const [n, s] of rv) if (s.len >= G.minRiverM) { const l = linesOf(gpkgGeom(s.best))[0]; add(n, '', 'river', toLL(l[l.length >> 1]), '', 'river' + fold(n).replace(/ /g, '')); }
    // ONS and designation names at a label point (the centre of the largest ring's bbox if inside, else its first vertex)
    const L = SRC.onsArcgis.layers, labelPt = polys => { const big = polys.sort((a, b) => Math.abs(signedArea(b[0])) - Math.abs(signedArea(a[0])))[0][0], bb = bboxOf(big), c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]; return toLL(inRingXY(c, big) ? c : big[0]); };
    for (const [k, kind] of [['countries', 'country'], ['regions', 'region'], ['ctyua', 'county'], ['lad', 'district'], ['nationalParks', 'np']])
      for (const f of JSON.parse(readFileSync(I[`ons-${k}.json`], 'utf8')).features) { const pl = esriPolygons(f.geometry?.rings || []); if (pl.length) add(f.attributes[L[k].name], String(f.attributes[L[k].nameCy] ?? '').trim(), kind, labelPt(pl), '', f.attributes[L[k].code]); }
    for (const S of SRC.landscapes) { const seen = new Set(); for (const f of JSON.parse(readFileSync(I[`${S.id}.json`], 'utf8')).features) { const n = String(f.attributes[S.name]).replace(/\s+/g, ' ').trim(); if (seen.has(n)) continue; seen.add(n); const pl = esriPolygons(f.geometry?.rings || []); if (pl.length) add(n, '', 'landscape', labelPt(pl), '', `${S.id}:${f.attributes[S.code] ?? n}`); } }
    // Wikidata: match to OS populated places; settlements of parts without OS names become entries
    const { places } = wikidataPlaces(I['wikidata.json'], W);
    const popKinds = new Set(G.populatedKinds), byDbp = new Map(), byName = new Map();
    for (const e of ents) if (popKinds.has(e.kind)) { if (e.dbp) byDbp.set(e.dbp, e); const k = fold(e.name); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(e); }
    const D = (a, b) => Math.hypot((a[0] - b[0]) * 111.32 * Math.cos(a[1] * Math.PI / 180), (a[1] - b[1]) * 110.57);
    const cards = [];
    for (const o of [...places.values()].sort((a, b) => a.wd.localeCompare(b.wd))) {
      // Wikidata gives P17 of the country to places of its overseas territories too (a card in the Caribbean): the region bbox
      if (!o.coord || !o.label || o.coord[0] < p.bbox[0] || o.coord[0] > p.bbox[2] || o.coord[1] < p.bbox[1] || o.coord[1] > p.bbox[3]) continue;
      const big = (o.pop?.v || 0) >= p.minPopulation || o.city;
      let e = o.enwiki && byDbp.get(o.enwiki);
      if (e && D(e.ll, o.coord) > p.matchKm * 3) e = null;
      if (!e) { const c = (byName.get(fold(o.label)) || []).map(x => [D(x.ll, o.coord), x]).filter(([d]) => d <= p.matchKm).sort((a, b) => a[0] - b[0] || (G.kindRank[b[1].kind] - G.kindRank[a[1].kind])); e = c[0]?.[1]; }
      if (e && !e.wd) { e.wd = o.wd; if (o.pop) e.pop = Math.round(o.pop.v); }
      if (!e && o.part) {   // a settlement where OS has no names (Northern Ireland)
        const cls = new Set(o.partClasses), kind = cls.has(W.cityClass) || o.city ? 'city' : [...cls].some(c => W.townClasses.includes(c)) ? 'town' : [...cls].some(c => W.villageClasses.includes(c)) ? 'village' : 'settlement';
        if (!big && !G.partKinds.includes(kind)) continue;
        e = { name: o.label, alt: '', kind, ll: o.coord, la: '', id: o.wd, wd: o.wd, pop: o.pop ? Math.round(o.pop.v) : 0, country: o.part }; ents.push(e);
      }
      if (!big) continue;
      const src = 'wikidata', ret = p.wikidataRetrieved, facts = [];
      if (o.pop) facts.push({ p: 'population', v: Math.round(o.pop.v), ...(o.pop.date ? { date: o.pop.date } : {}), src, retrieved: ret });
      if (o.areas.length) facts.push({ p: 'area', v: round(o.areas[o.areas.length >> 1], 2), unit: 'km2', src, retrieved: ret });
      if (o.elevs.length) facts.push({ p: 'elevation', v: Math.round(o.elevs[o.elevs.length >> 1]), unit: 'm', src, retrieved: ret });
      if (o.incept.length) facts.push({ p: 'inception', v: wdDate(o.incept[0]), src, retrieved: ret });
      cards.push({ wd: o.wd, name: o.label, ...(o.description ? { description: o.description } : {}), coord: rpt(o.coord, 5), kinds: o.classes.map(c => c.label).slice(0, 6),
        ...(o.parents.length ? { parent: o.parents[0] } : {}), facts,
        links: { wikidata: `https://www.wikidata.org/wiki/${o.wd}`, ...(o.enwiki ? { wikipedia: `https://en.wikipedia.org/wiki/${encodeURIComponent(o.enwiki.replace(/ /g, '_'))}`, wikipediaTitle: o.enwiki } : {}),
          ...(o.images.length ? { image: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(o.images[0].replace(/ /g, '_'))}`, imageFile: o.images[0] } : {}), ...(o.sites.length ? { website: o.sites[0] } : {}) },
        ...(e ? { gazetteerId: e.id } : {}) });
    }
    // district of entries with none (Wikidata settlements, rivers, areas): the district polygon that holds the point
    const lads = JSON.parse(readFileSync(I['ons-lad.json'], 'utf8')).features.map(f => { const polys = llPolys(simplifyPolys(esriPolygons(f.geometry?.rings || []), 30, 0)); return { name: f.attributes[L.lad.name], polys, bb: polys.reduce((a, q) => unionBbox(a, bboxOf(q[0])), null) }; });
    const ladAt = ll => lads.find(d => ll[0] >= d.bb[0] && ll[0] <= d.bb[2] && ll[1] >= d.bb[1] && ll[1] <= d.bb[3] && pointInGeometry(ll, { type: 'MultiPolygon', coordinates: d.polys }))?.name || '';
    for (const e of ents) if (!e.la && ['city', 'town', 'village', 'settlement', 'river'].includes(e.kind)) e.la = ladAt(e.ll);
    for (const c of cards) { const d = ladAt(c.coord); if (d) c.district = d; }
    // files: gazetteer/<key>.json { la: [names], entries: [[name, alt, kind, lon, lat, laIndex, id, wd, pop]] }
    const files = {}, byKey = new Map(), idKinds = new Set(p.idKinds);
    const pre = new RegExp(`^(${p.prefixes.map(fold).join('|')}) `), strip = n => fold(n).replace(pre, '');
    for (const e of ents) { const keys = new Set([gazKey(fold(e.name)), gazKey(strip(e.name)), ...(e.alt ? [gazKey(fold(e.alt)), gazKey(strip(e.alt))] : [])]); for (const k of keys) { if (!/^[a-z0-9_]{2}$/.test(k)) continue; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(e); } }
    for (const [k, es] of [...byKey].sort()) {
      const las = [...new Set(es.map(e => e.la).filter(Boolean))].sort(), li = new Map(las.map((l, i) => [l, i]));
      es.sort((a, b) => fold(a.name).localeCompare(fold(b.name)) || a.id.localeCompare(b.id));
      files[`gazetteer/${k}.json`] = JSON.stringify({ la: las, entries: es.map(e => { const r = [e.name, e.alt, e.kind, round(e.ll[0], p.decimals), round(e.ll[1], p.decimals), e.la ? li.get(e.la) : -1, idKinds.has(e.kind) ? e.id : '', e.wd || '', e.pop || 0]; while (r.length > 7 && !r.at(-1)) r.pop(); return r; }) });
    }
    // place labels: per level the kinds shown (cities and big towns nationally, towns regionally, all settlements in the city view)
    for (const [lk, rule] of Object.entries(p.labels)) {
      const lv = LEVEL[lk], fs = ents.filter(e => rule.kinds.includes(e.kind) && (e.pop || 0) >= (rule.minPop || 0) || (rule.orKinds || []).includes(e.kind))
        .map(e => ({ id: e.id, properties: { name: e.name, ...(e.alt ? { nameAlt: e.alt } : {}), kind: e.kind, ...(e.pop ? { pop: e.pop } : {}), ...(e.wd ? { wd: e.wd } : {}), ...(e.la && lk !== 'city' ? { district: e.la } : {}) }, geometry: { type: 'Point', coordinates: e.ll } }))
        .sort((a, b) => (b.properties.pop || 0) - (a.properties.pop || 0) || a.id.localeCompare(b.id));
      tile('places', lv, fs, p.decimals, files);
    }
    const byCell = new Map(); for (const c of cards) { const k = cellOf(p.cardLevel, c.coord[0], c.coord[1]).join('-'); if (!byCell.has(k)) byCell.set(k, {}); byCell.get(k)[c.wd] = c; }
    for (const [k, cs] of [...byCell].sort()) files[`cards/${k}.json`] = JSON.stringify({ cards: cs });
    console.log(`  gazetteer ${ents.length} entries in ${byKey.size} files; ${cards.length} cards; ${ents.filter(e => e.wd).length} entries with Wikidata`);
    return files;
  });
}

// the manifest: every layer file with its bbox, features and size; sources and credits; the reader contract
async function opManifest(acts) {
  const outs = acts.flatMap(a => a.outputs).filter(o => o.path !== 'manifest.json').sort((a, b) => a.path < b.path ? -1 : 1);
  const inputs = outs.map(o => ({ name: o.path, sha256: o.sha256, path: join(OUT, o.path) }));
  const params = { layers: SRC.manifest.layers, gazetteer: SRC.gazetteer, levels: LEVEL, sourcesUsed: Object.keys(flog).sort(), fetches: Object.fromEntries(Object.entries(flog).map(([k, v]) => [k, { url: v.url, fetched: v.fetched, sha256: v.sha256 }])) };
  return run({ id: 'uk-manifest', version: 4, about: 'manifest.json: layers, levels, files with bbox and feature counts, gazetteer and card files, sources with licences and fetch dates, credits' }, inputs, params, async p => {
    const layers = p.layers.map(L => {
      const lv = new Map();
      for (const o of outs) { const m = new RegExp(`^layers/${L.id}/(\\d+)/(\\d+)-(\\d+)\\.json$`).exec(o.path); if (!m) continue;
        const fsx = unpack(JSON.parse(readFileSync(join(OUT, o.path), 'utf8'))).features, bb = fsx.reduce((a, f) => unionBbox(a, f.bbox), null);
        if (!lv.has(+m[1])) lv.set(+m[1], []); lv.get(+m[1]).push({ cell: [+m[2], +m[3]], path: o.path, bbox: bb.map(v => round(v, 5)), features: fsx.length, bytes: o.bytes }); }
      return { ...L, levels: [...lv].sort((a, b) => a[0] - b[0]).map(([level, files]) => ({ level, ...(L.levelNotes?.[level] ? { note: L.levelNotes[level] } : {}), files })) };
    }).map(({ levelNotes, ...L }) => L);
    const gz = {}, cards = {};
    for (const o of outs) { let m; if ((m = /^gazetteer\/(..)\.json$/.exec(o.path))) gz[m[1]] = { path: o.path, entries: JSON.parse(readFileSync(join(OUT, o.path), 'utf8')).entries.length, bytes: o.bytes };
      if ((m = /^cards\/(\d+-\d+)\.json$/.exec(o.path))) cards[m[1]] = { path: o.path, cards: Object.keys(JSON.parse(readFileSync(join(OUT, o.path), 'utf8')).cards).length, bytes: o.bytes }; }
    const total = outs.reduce((s, o) => s + o.bytes, 0);
    const M = {
      id: `${RID}-skeleton`, region: RID, name: `${REG.name}: national skeleton`, about: SRC.manifest.about,
      bbox: REG.bbox, crs: 'WGS84 longitude, latitude in degrees (EPSG:4326 axis order lon, lat as GeoJSON)', heights: 'none (2D); terrain comes from the world DEM of the globe',
      transformation: AD.crs, format: 'skeleton-1: GeoJSON-like FeatureCollection with integer, delta-coded coordinates (q = 10^decimals); docklands/geo/skeleton.js unpack() gives GeoJSON', cells: { scheme: 'geodetic-quadtree', size: '180 / 2^level degrees', x: 'floor((lon + 180) / size)', y: 'floor((lat + 90) / size), counted from the south (3D Tiles 1.1 implicit tiling, region volume)',
        levels: Object.fromEntries(Object.entries(p.levels).map(([k, v]) => [v, k])), levelForSpan: 'span of the view in degrees of latitude: > 6 -> national, > 1.2 -> regional, else city (docklands/geo/skeleton.js levelForSpan)',
        files: 'polygons whole in the cell of their bbox centre (file bbox = real extent); lines clipped at cell edges, one piece per cell, id <feature>.<n>; points in their cell' },
      reader: { module: 'docklands/geo/skeleton.js', readme: 'cwplans/docklands/data/uk/README.md', calls: ['openSkeleton(base)', 'features(layer, bbox, level)', 'search(text, { limit, near, kinds })', 'card(hit)', 'whereAmI(lon, lat)', 'describe(feature, layer)'] },
      layers,
      gazetteer: { about: p.gazetteer.about, key: 'the first two letters or digits of the folded name (docklands/geo/skeleton.js fold, gazKey); a name is also filed under its other-language form and under the name without a generic first word (prefixes: River Thames under th)', prefixes: p.gazetteer.prefixes, fields: ['name', 'alt', 'kind', 'lon', 'lat', 'districtIndex (into la; -1 none)', 'id (OS Open Names id, ONS code, NaPTAN-free; Wikidata QID for Wikidata-only places)', 'wd (Wikidata QID)', 'population (Wikidata)'],
        kinds: p.gazetteer.kindLabels, kindRank: p.gazetteer.kindRank, files: gz },
      cards: { level: p.levels.regional, about: 'place cards by Wikidata QID, in the regional-level cell of the Wikidata point', fields: { facts: '[{ p: population|area|elevation|inception, v, unit?, date?, src, retrieved }]', links: 'wikidata, wikipedia (+ wikipediaTitle), image (Commons file page; + imageFile), website: links only, no copied text or image', district: 'the district (ONS) that holds the point; its 2021 census population is on the districts layer (pop2021)' }, files: cards },
      sources: SRC.manifest.sources, fetches: p.fetches,
      credits: SRC.manifest.credits,
      size: { files: outs.length + 1, bytes: total },
      log: 'log.json (dataflow: operations, fetches, activities with inputs and outputs by SHA-256)',
    };
    return { 'manifest.json': JSON.stringify(M, null, 1) };
  });
}

// ---------------------------------------------------------------- main
async function build() {
  const proj = await lib[AD.crs.projector](); PROJ = { inverse: proj.inverse };
  const acts = [];
  acts.push(await opBoundaries()); acts.push(await opProtected()); acts.push(await opZoomstack()); acts.push(await opRivers());
  acts.push(await opBuiltUp()); acts.push(await opStations()); acts.push(await opGazetteer());
  const m = await opManifest(acts);
  // remove files that no activity of this run wrote (an older layout)
  const keep = new Set([...acts, m].flatMap(a => a.outputs.map(o => o.path))), walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  for (const f of walk(OUT)) { const r = relative(OUT, f); if (/^(layers|gazetteer|cards)\//.test(r) && !keep.has(r)) rmSync(f); }
  const sizes = new Map(); for (const a of [...acts, m]) for (const o of a.outputs) { const k = o.path.split('/').slice(0, o.path.startsWith('layers/') ? 2 : 1).join('/'); sizes.set(k, (sizes.get(k) || 0) + o.bytes); }
  let tot = 0; for (const [k, v] of [...sizes].sort()) { tot += v; console.log(`  ${k.padEnd(26)} ${(v / 1e6).toFixed(2).padStart(7)} MB`); }
  console.log(`  total ${(tot / 1e6).toFixed(2)} MB in ${keep.size} files (+ log.json, README.md)`);
}
const cmd = argv.find(a => !a.startsWith('--'));
if (!cmd || cmd === 'fetch') await fetchAll();
if (!cmd || cmd === 'build') await build();
