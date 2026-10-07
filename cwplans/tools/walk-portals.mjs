#!/usr/bin/env node
// A recorded walk through the open-data portals other than the London Datastore that cover the Docklands zone:
// catalogue, triage by written rules (a final state per dataset), and a harvest of the open, relevant datasets
// clipped to the zone (the 3D model box). One adapter per portal.
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/walk-portals.mjs <portal> walk [--refresh]
//   node cwplans/tools/walk-portals.mjs <portal> triage
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/walk-portals.mjs <portal> harvest [key ...] [--refresh]
//   node cwplans/tools/walk-portals.mjs index            # feeds/portals/index.json (counts per portal)
// Portals: dgu (data.gov.uk CKAN), pdg (planning.data.gov.uk), boroughs (the six zone borough portals),
//          nomis (Nomis / ONS Census 2021 tables), onsgeo (ONS Open Geography Portal), national (other national APIs).
// Out: feeds/portals/<portal>/catalogue.json, triage.json, <key>/<key>.(geo)json with a meta member.
// Raw downloads: data/raw/portals/<portal>/ (gitignored). Network: one request at a time, >= 1.1 s apart, robots.txt
// read per host, backoff on 429 and 5xx, the project User-Agent.
// Method, rules, licences and the reasons: skills/cwplans-open-portals/SKILL.md; results: feeds/portals/README.md.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, createReadStream, rmSync } from 'fs';
import { join, dirname } from 'path';
import { createGunzip, gzipSync, gunzipSync } from 'zlib';
import { createInterface } from 'readline';
import { RAW, UA, TOOLS } from './lib.mjs';
import { LONDAT_CW, warnIfNoLondat } from './londat.mjs';
import { loadRefs, ZONE_WGS, ZONE_BNG, ZONE_PLACE_NAMES } from './lds-probe.mjs';

export const CW = join(TOOLS, '..');
export const OUT = join(LONDAT_CW, 'feeds', 'portals');   // hosted in danbri/londat (tools/londat.mjs)
warnIfNoLondat();
export const RAWP = join(RAW, 'portals');
export const today = new Date().toISOString().slice(0, 10);
const args = process.argv.slice(2);
const REFRESH = args.includes('--refresh');
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) console.warn('warning: HTTPS_PROXY is set but NODE_USE_ENV_PROXY is not; Node fetch will not use the proxy');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = f => JSON.parse(readFileSync(f, 'utf8'));
const r6 = v => Math.round(v * 1e6) / 1e6;

// ---------------------------------------------------------------- polite fetch with robots.txt
let chain = Promise.resolve(), last = 0; export let nReq = 0;
const robots = new Map();
export async function allowed(url) {
  const u = new URL(url);
  if (!robots.has(u.host)) {
    let rules = [];
    try {
      const r = await fetch(`${u.protocol}//${u.host}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }); nReq++;
      if (r.ok) {
        let applies = false, any = false;
        for (const line of (await r.text()).split(/\r?\n/)) {
          const m = /^\s*(user-agent|disallow|allow)\s*:\s*(.*?)\s*(#.*)?$/i.exec(line); if (!m) continue;
          const k = m[1].toLowerCase();
          if (k === 'user-agent') { if (any) { applies = false; any = false; } if (m[2] === '*' || /glitchcan/i.test(m[2])) applies = true; }
          else { any = true; if (applies && m[2]) rules.push([k, m[2]]); }
        }
      }
    } catch { /* no robots.txt reachable: allowed */ }
    robots.set(u.host, rules);
  }
  const path = u.pathname + u.search; let best = null;
  for (const [k, p] of robots.get(u.host)) {
    const re = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || p.length > best[1].length)) best = [k, p];
  }
  return !best || best[0] === 'allow';
}
export function politeFetch(url, { minGapMs = 1100, tries = 5, headers = {}, timeout = 300000, maxBytes = Infinity } = {}) {
  const run = async () => {
    if (!(await allowed(url))) throw new Error(`robots.txt disallows ${url}`);
    for (let k = 1; ; k++) {
      const wait = last + minGapMs - Date.now(); if (wait > 0) await sleep(wait);
      last = Date.now(); nReq++;
      let r, err;
      try { r = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(timeout), redirect: 'follow' }); } catch (e) { err = e; }
      if (r && (r.ok || r.status === 206)) {
        try {
          const chunks = []; let n = 0; const rd = r.body.getReader();
          for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); n += value.length; if (n >= maxBytes) { await rd.cancel(); break; } }
          last = Date.now(); return Buffer.concat(chunks);
        } catch (e) { err = e; }
      }
      const retry = err || r.status === 429 || r.status >= 500;
      if (!retry || k >= tries) throw new Error(`${err ? err.message : r.status} ${url}`);
      const ra = r && +r.headers.get('retry-after');
      await sleep(ra ? ra * 1000 : minGapMs * 2 ** k);
    }
  };
  const p = chain.then(run, run); chain = p.catch(() => {}); return p;
}
export const getJson = async (url, o) => JSON.parse((await politeFetch(url, o)).toString('utf8'));
// a status probe that never throws: { status, type, bytes }
export function politeStatus(url, { minGapMs = 1100 } = {}) {
  const run = async () => {
    if (!(await allowed(url))) return { status: 'robots' };
    const wait = last + minGapMs - Date.now(); if (wait > 0) await sleep(wait);
    last = Date.now(); nReq++;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Range: 'bytes=0-2047' }, signal: AbortSignal.timeout(60000), redirect: 'follow' });
      const b = Buffer.from(await r.arrayBuffer()); last = Date.now();
      return { status: r.status, type: (r.headers.get('content-type') || '').split(';')[0], final: r.url !== url ? r.url : undefined, head: b.subarray(0, 300).toString('utf8') };
    } catch (e) { return { status: 'network: ' + (e.message || '').slice(0, 60) }; }
  };
  const p = chain.then(run, run); chain = p.catch(() => {}); return p;
}
export async function rawFile(rel, url, o) {
  const f = join(RAWP, rel); mkdirSync(dirname(f), { recursive: true });
  if (!REFRESH && existsSync(f) && statSync(f).size > 0) return { file: f, fetched: statSync(f).mtime.toISOString().slice(0, 10), reused: true };
  writeFileSync(f, await politeFetch(url, o));
  return { file: f, fetched: today, reused: false };
}
export async function rawJson(rel, url, o) { const r = await rawFile(rel, url, o); return { ...r, json: readJson(r.file) }; }

// ---------------------------------------------------------------- the zone and the project's own references
export const ZONE = ZONE_WGS;                        // [-0.095, 51.474, 0.015, 51.522]
export const CW_BOX = [-0.03, 51.498, -0.005, 51.51];
export const LONDON = [-0.52, 51.28, 0.34, 51.70];
export const ZONE_TEXT = 'the 3D model box, BNG E 532400-539900, N 176700-182300 (WGS84 -0.095, 51.474 to 0.015, 51.522)';
export const zoneRefs = () => loadRefs(join(LONDAT_CW, 'feeds', 'london-datastore', 'zone-codes.json'), join(RAW, 'london-datastore', 'zone-uprns.txt'));
export const ZONE_BOROUGHS = { 'tower hamlets': 'E09000030', southwark: 'E09000028', lewisham: 'E09000023', greenwich: 'E09000011', newham: 'E09000025', 'city of london': 'E09000001' };
export const OTHER_LONDON = ['barking', 'dagenham', 'barnet', 'bexley', 'brent', 'bromley', 'camden', 'croydon', 'ealing', 'enfield', 'hackney', 'hammersmith', 'fulham', 'haringey', 'harrow', 'havering', 'hillingdon', 'hounslow', 'islington', 'kensington', 'chelsea', 'kingston', 'lambeth', 'merton', 'redbridge', 'richmond', 'sutton', 'waltham forest', 'wandsworth', 'westminster'];
// a place name in the zone, as a whole word ("thames" alone is not one: it runs through half of England)
const ZONE_PLACE_RE = new RegExp(`\\b(${[...ZONE_PLACE_NAMES, 'thames barrier', 'tideway', 'lower lea', 'leamouth', 'o2 arena', 'thames gateway london'].join('|')})\\b`, 'i');
export const zonePlace = s => { const m = ZONE_PLACE_RE.exec(s || ''); return m ? m[1].toLowerCase() : null; };

// project text: what is held (tools, data files, the register, pipeline) and what is listed (notes, catalogues)
let PROJECT = null;
export function projectText() {
  if (PROJECT) return PROJECT;
  const held = [], listed = [];
  const walk = (d, depth = 0) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name), rel = p.slice(CW.length + 1);
      if (e.isDirectory()) { if (/^(data\/raw|feeds\/portals|node_modules|third_party)/.test(rel) || e.name.startsWith('.')) continue; if (depth < 6) walk(p, depth + 1); continue; }
      if (!/\.(mjs|js|json|md|py|sh|html)$/.test(e.name) || rel.startsWith('feeds/portals/')) continue;
      let st; try { st = statSync(p); } catch { continue; } if (st.size > 4e6) continue;
      const t = readFileSync(p, 'utf8');
      if (/^(tools\/|data-register\.json|pipeline\.json)/.test(rel)) held.push(t);
      else if (/\.md$|^feeds\/(feeds|events)\.json$/.test(rel)) listed.push(t);
    }
  };
  walk(CW);
  PROJECT = { held: held.join('\n').toLowerCase(), listed: listed.join('\n').toLowerCase() };
  return PROJECT;
}

// ---------------------------------------------------------------- licence classes (written rules; SKILL repeats them)
export const OPEN_CLASSES = ['ogl', 'cc-by', 'odc-by', 'public-domain'];
export function licenceClass(id, text = '') {
  const s = `${id || ''} ${text || ''}`.toLowerCase();
  if (/non-?commercial|\bnc\b|other-nc/.test(s)) return 'restricted';
  if (/share-?alike|cc-by-sa|odbl|odc-odbl/.test(s)) return 'share-alike';
  if (/uk-ogl|ogl|open government licen[cs]e|open-government-licence|nationalarchives\.gov\.uk\/doc\/open-government/.test(s)) return 'ogl';
  if (/cc-zero|cc0|public domain|other-pd|odc-pddl|pddl/.test(s)) return 'public-domain';
  if (/odc-by|open data commons attribution/.test(s)) return 'odc-by';
  if (/cc-by|creative commons attribution|creativecommons\.org\/licenses\/by\//.test(s)) return 'cc-by';
  if (/other-closed|psma|public sector (geospatial|mapping) agreement|licen[cs]e (is )?required|apply for a licen[cs]e|all rights reserved|commercial licen[cs]e|copyright.*not.*reproduc|restricted|end user licen[cs]e|end use licen[cs]e|inspire-licence|inspire-end-user-licence|mapping-agreements|internal use only/.test(s)) return 'restricted';
  if (/other-open|no limitations|no conditions apply|free to use/.test(s)) return 'open-unclear';
  return 'none';
}

// ---------------------------------------------------------------- geometry: GeoJSON in WGS84 against a box
export function eachPt(g, f) {
  if (!g) return; const c = g.coordinates;
  switch (g.type) {
    case 'Point': f(c); break;
    case 'MultiPoint': case 'LineString': c.forEach(f); break;
    case 'MultiLineString': case 'Polygon': c.forEach(r => r.forEach(f)); break;
    case 'MultiPolygon': c.forEach(p => p.forEach(r => r.forEach(f))); break;
    case 'GeometryCollection': g.geometries.forEach(x => eachPt(x, f)); break;
  }
}
export function bboxOf(g) { const b = [Infinity, Infinity, -Infinity, -Infinity]; eachPt(g, ([x, y]) => { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }); return b; }
const inB = ([x, y], B) => x >= B[0] && x <= B[2] && y >= B[1] && y <= B[3];
function segHits(a, b, B) {
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - B[0]], [dx, B[2] - a[0]], [-dy, a[1] - B[1]], [dy, B[3] - a[1]]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
function ptInRing(p, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
// a geometry meets a box: a vertex inside, an edge crossing, or the box centre inside a polygon
export function meets(g, B = ZONE) {
  if (!g) return false;
  const bb = bboxOf(g); if (bb[2] < B[0] || bb[0] > B[2] || bb[3] < B[1] || bb[1] > B[3]) return false;
  let hit = false; eachPt(g, p => { if (!hit && inB(p, B)) hit = true; }); if (hit) return true;
  const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' || g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
  for (const l of lines) for (let i = 1; i < l.length; i++) if (segHits(l[i - 1], l[i], B)) return true;
  const c = [(B[0] + B[2]) / 2, (B[1] + B[3]) / 2];
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some(p => ptInRing(c, p[0]) && !p.slice(1).some(h => ptInRing(c, h)));
}
export const wholeIn = (g, B = ZONE) => { const b = bboxOf(g); return b[0] >= B[0] && b[2] <= B[2] && b[1] >= B[1] && b[3] <= B[3]; };
export function roundGeom(g, d = 6) {
  const f = 10 ** d, r = c => typeof c[0] === 'number' ? c.map(v => Math.round(v * f) / f) : c.map(r);
  return g.type === 'GeometryCollection' ? { type: g.type, geometries: g.geometries.map(x => roundGeom(x, d)) } : { type: g.type, coordinates: r(g.coordinates) };
}
// fields that name or reach a person: dropped from every harvest (also under the cwplans exception: not needed)
export const DROP_FIELD = /e-?mail|phone|tel(ephone)?$|^tel|contact|^fax|mobile|^owner_?name|person|officer|case_?officer|agent_?name|applicant/i;

// ---------------------------------------------------------------- output
// size rule (coordinator, 2026-10-04: the repository and the Pages site are near their limits): a harvest file over
// 1 MB is written gzipped (<file>.gz; pages read it with DecompressionStream) and the plain file removed. Returns the
// bytes written to disk.
export const GZ_OVER = 1e6;
export function writeOut(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  if (text.length > GZ_OVER && !/\/index\.json$/.test(file) || /\.gz$/.test(file)) {
    const gz = gzipSync(Buffer.from(text)), f = /\.gz$/.test(file) ? file : file + '.gz';
    writeFileSync(f, gz); try { rmSync(file.replace(/\.gz$/, '')); } catch { /* none */ } return gz.length;
  }
  writeFileSync(file, text); try { rmSync(file + '.gz'); } catch { /* none */ } return text.length;
}
export const outExists = f => existsSync(f) || existsSync(f + '.gz');
export const readOut = f => JSON.parse(existsSync(f) ? readFileSync(f, 'utf8') : gunzipSync(readFileSync(f + '.gz')).toString('utf8'));
export function writeLines(file, meta, key, rows) {
  return writeOut(file, `{"meta":${JSON.stringify(meta, null, 1)},\n"${key}":[\n${rows.map(r => JSON.stringify(r)).join(',\n')}\n]}\n`);
}
export function writeGeojson(file, meta, features) {
  return writeOut(file, `{"type":"FeatureCollection","meta":${JSON.stringify(meta, null, 1)},\n"features":[\n${features.map(f => JSON.stringify(f)).join(',\n')}\n]}\n`);
}
export async function* readLines(file) {
  const s = file.endsWith('.gz') ? createReadStream(file).pipe(createGunzip()) : createReadStream(file);
  for await (const l of createInterface({ input: s, crlfDelay: Infinity })) yield l;
}

// ---------------------------------------------------------------- main
const ADAPTERS = { dgu: './portals/dgu.mjs', pdg: './portals/pdg.mjs', boroughs: './portals/boroughs.mjs', nomis: './portals/nomis.mjs', onsgeo: './portals/onsgeo.mjs', national: './portals/national.mjs' };
async function main() {
  const [portal, stage, ...rest] = args.filter(a => !a.startsWith('--'));
  if (portal === 'index') return (await import('./portals/index.mjs')).default();
  if (!ADAPTERS[portal] || !stage) { console.error(`usage: walk-portals.mjs <${Object.keys(ADAPTERS).join('|')}> <walk|triage|harvest> [key ...] | index`); process.exit(2); }
  mkdirSync(join(OUT, portal), { recursive: true }); mkdirSync(join(RAWP, portal), { recursive: true });
  const A = await import(ADAPTERS[portal]);
  if (!A[stage]) { console.error(`${portal} has no stage ${stage}`); process.exit(2); }
  await A[stage](rest, { args });
  console.log(`${portal} ${stage}: ${nReq} requests`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
