// Count open imagery over the first cwplans areas (Canary Wharf, Isle of Dogs, Limehouse, Rotherhithe / SE16, and the
// whole zone): a fetch step, then one logged operation.
// Fetch (network, polite): OpenAerialMap /meta by box; Panoramax STAC /api/search by box (a full answer is split into
// quarters); KartaView /2.0/photo at the points of a 200 m grid (radius 145 m; areas only, not the zone); EA survey
// catalogue search by polygon. Mapillary needs a token: skipped unless MAPILLARY_TOKEN is set (not written yet).
// Answers are cut to the fields used and kept as input files: open licences (OAM CC BY 4.0, EA OGL) in londat
// cwplans/coverage/raw/<date>/ (committed); share-alike sources (Panoramax, KartaView: CC BY-SA 4.0) in
// cwplans/data/raw/coverage/<date>/ (gitignored: only counts are committed).
// Operation lift-imagery-coverage (kgx-ops Flow, log in londat kgx/log): the input files -> graph version
// `coverage-imagery`, named in kgx/external-heads.json so build-kgx packs it.
//   node cwplans/tools/probe-imagery-coverage.mjs [--offline <date>]
// Skills: docklands-data-curation ("Sources to investigate"), cwplans-dataflow.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { dataFactory as F } from '@factoidal/core';
import { UA, RAW } from './lib.mjs';
import { LONDAT_DIR } from './londat.mjs';
import { Flow } from './kgx-ops.mjs';
import { kid, VOCAB } from './kgx-ids.mjs';

// boxes W, S, E, N (WGS84); drawn by hand round each place, so neighbours touch or overlap a little
export const AREAS = {
  'canary-wharf': { label: 'Canary Wharf', box: [-0.0300, 51.4995, -0.0080, 51.5085] },
  'isle-of-dogs-south': { label: 'Isle of Dogs south of Canary Wharf (Millwall, Cubitt Town)', box: [-0.0310, 51.4860, -0.0020, 51.4995] },
  'limehouse': { label: 'Limehouse', box: [-0.0450, 51.5070, -0.0280, 51.5160] },
  'rotherhithe-se16': { label: 'Rotherhithe and SE16 (Canada Water, Surrey Quays, Greenland Dock)', box: [-0.0650, 51.4880, -0.0300, 51.5040] },
  'zone': { label: 'cwplans zone', box: [-0.0950, 51.4740, 0.0150, 51.5220] },
};
const argOff = process.argv.indexOf('--offline'), offline = argOff > 0 ? process.argv[argOff + 1] : null;
const run = offline || new Date().toISOString().slice(0, 10);
const OPEN = join(LONDAT_DIR, 'cwplans', 'coverage', 'raw', run), LOCAL = join(RAW, 'coverage', run);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = (url, opts = {}) => fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });   // the answer as is (KartaView reports a timeout as 400 with JSON)
const json = async (url, opts) => { const r = await get(url, opts); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };
const save = (dir, name, data) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, name), JSON.stringify(data) + '\n'); };

async function oam(slug, [w, s, e, n]) {
  const out = []; let page = 1, found = 0;
  do { const url = `https://api.openaerialmap.org/meta?bbox=${w},${s},${e},${n}&limit=100&page=${page}`; const d = await json(url); found = d.meta.found;
    for (const x of d.results) out.push({ id: x._id, title: x.title, start: x.acquisition_start, end: x.acquisition_end, gsd: x.gsd, platform: x.platform,
      licence: x.properties?.license || d.meta.license, bbox: x.bbox, url: x.uuid });
    page++; await sleep(500); } while (out.length < found && page < 20);
  return { source: 'openaerialmap', area: slug, request: `https://api.openaerialmap.org/meta?bbox=${w},${s},${e},${n}`, found, items: out };
}
async function panoramax(slug, box, depth = 0) {
  const LIMIT = 500, [w, s, e, n] = box, url = `https://api.panoramax.xyz/api/search?bbox=${w},${s},${e},${n}&limit=${LIMIT}`;
  const d = await json(url); await sleep(700);
  if (d.features.length >= LIMIT && depth < 6) {
    const mx = (w + e) / 2, my = (s + n) / 2, parts = [];
    for (const q of [[w, s, mx, my], [mx, s, e, my], [w, my, mx, n], [mx, my, e, n]]) parts.push(...(await panoramax(slug, q, depth + 1)).items);
    return { source: 'panoramax', area: slug, request: url, items: [...new Map(parts.map(p => [p.id, p])).values()] };
  }
  const items = d.features.map(f => ({ id: f.id, datetime: f.properties.datetime, licence: f.properties.license, collection: f.collection,
    producer: f.properties['geovisio:producer'] ?? null, semantics: (f.properties.semantics || []).length, annotations: (f.properties.annotations || []).length,
    lon: f.bbox?.[0], lat: f.bbox?.[1] }));
  return { source: 'panoramax', area: slug, request: url, items, ...(d.features.length >= LIMIT ? { capped: true } : {}) };
}
async function kartaview(slug, [w, s, e, n]) {
  const STEP = 200, R = 145, lat0 = (s + n) / 2, dLat = STEP / 111320, dLon = STEP / (111320 * Math.cos(lat0 * Math.PI / 180));
  const seen = new Map(); let calls = 0, timeouts = 0;
  const ask = async (lat, lng, r) => { let page = 1, more;
    do { const url = `https://api.openstreetcam.org/2.0/photo/?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}&radius=${r}&itemsPerPage=150&page=${page}`;
      const res = await get(url); calls++; await sleep(600); const d = await res.json().catch(() => null);
      if (d?.status?.apiCode === 408) { timeouts++; if (r > 60) for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) await ask(lat + a * r / 2 / 111320, lng + b * r / 2 / (111320 * Math.cos(lat0 * Math.PI / 180)), Math.round(r / 2)); return; }
      if (d?.status?.apiCode === 601) return;                   // "the request has an empty response": no photos here
      if (!res.ok || !d?.result) throw new Error(`${res.status} ${url}`);
      for (const p of d.result.data) if (+p.lng >= w && +p.lng <= e && +p.lat >= s && +p.lat <= n) seen.set(p.id, { id: p.id, shot: p.shotDate, sequence: p.sequenceId, lat: +p.lat, lon: +p.lng, projection: p.projection });
      more = d.result.hasMoreData; page++; } while (more && page < 50); };
  for (let lat = s + dLat / 2; lat < n; lat += dLat) for (let lng = w + dLon / 2; lng < e; lng += dLon) await ask(lat, lng, R);
  return { source: 'kartaview', area: slug, request: `https://api.openstreetcam.org/2.0/photo/?lat=…&lng=…&radius=${R} on a ${STEP} m grid`, calls, timeouts, items: [...seen.values()] };
}
async function ea(slug, [w, s, e, n]) {
  const url = 'https://environment.data.gov.uk/backend/catalog/api/tiles/collections/survey/search';
  const body = JSON.stringify({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
  const d = await json(url, { method: 'POST', headers: { 'Content-Type': 'application/geo+json' }, body }); await sleep(500);
  return { source: 'ea-survey', area: slug, request: `POST ${url} (box ${w},${s},${e},${n})`, items: d.results.map(x => ({ product: x.product.id, productLabel: x.product.label, year: x.year.label, resolution: x.resolution.label, tile: x.tile.label, url: x.uri })) };
}

// ---- fetch (skipped with --offline <date>: the files of that date are the inputs)
if (!offline) {
  for (const [slug, a] of Object.entries(AREAS)) {
    save(OPEN, `openaerialmap-${slug}.json`, await oam(slug, a.box));
    save(OPEN, `ea-survey-${slug}.json`, await ea(slug, a.box));
    save(LOCAL, `panoramax-${slug}.json`, await panoramax(slug, a.box));
    if (slug !== 'zone') save(LOCAL, `kartaview-${slug}.json`, await kartaview(slug, a.box));
    console.error('fetched', slug);
  }
  save(OPEN, 'mapillary.json', { source: 'mapillary', status: process.env.MAPILLARY_TOKEN ? 'token present; fetch not written yet' : 'skipped: the Graph API needs an access token (MAPILLARY_TOKEN)', items: [] });
}

// ---- the operation: input files -> graph version `coverage-imagery`
const flow = new Flow(join(LONDAT_DIR, 'kgx'));
const files = [...readdirSync(OPEN).map(f => join(OPEN, f)), ...(existsSync(LOCAL) ? readdirSync(LOCAL).map(f => join(LOCAL, f)) : [])].sort();
const inputs = files.map(p => flow.file(p, p.startsWith(LONDAT_DIR) ? 'danbri/londat ' + p.slice(LONDAT_DIR.length + 1) : 'cwplans/data/raw/' + p.slice(RAW.length + 1) + ' (local, not committed)'));
const op = { id: 'lift-imagery-coverage', version: 3, skill: 'docklands-data-curation', tool: 'cwplans/tools/probe-imagery-coverage.mjs',
  about: 'Imagery coverage answers (OpenAerialMap, Panoramax, KartaView, EA survey catalogue, Mapillary status) per study area -> cwk:CoverageCount per source and area (count, years, licences, first and last date), cwk:StudyArea with box, OpenAerialMap images and EA products by year and resolution. Share-alike sources give counts only.' };
const out = await flow.run(op, inputs, { run, areas: AREAS }, async ({ run, areas }) => {
  // IDs (kgx-ids.mjs): area<slug>, imagery<source>, cov<run><source><area>..., oam<id>
  const V = VOCAB, S = 'https://schema.org/', XSD = 'http://www.w3.org/2001/XMLSchema#';
  const N = F.namedNode, q = [], add = (s, p, o) => o != null && q.push(F.quad(N(s), N(p), typeof o === 'string' ? N(o) : o, F.defaultGraph()));
  const L = (v, dt) => v == null || v === '' ? null : F.literal(String(v), dt ? N(XSD + dt) : typeof v === 'number' ? N(XSD + (Number.isInteger(v) ? 'integer' : 'decimal')) : undefined);
  const T = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', LABEL = 'http://www.w3.org/2000/01/rdf-schema#label', WKT = 'http://www.opengis.net/ont/geosparql#asWKT', GEOM = 'http://www.opengis.net/ont/geosparql#hasGeometry';
  const wkt = ([w, s, e, n]) => F.literal(`POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))`, N('http://www.opengis.net/ont/geosparql#wktLiteral'));
  for (const [slug, a] of Object.entries(areas)) { const s = kid('area', slug), sg = kid('area', slug, 'geometry'); add(s, T, V + 'StudyArea'); add(s, LABEL, L(a.label)); add(s, GEOM, sg); add(sg, WKT, wkt(a.box)); }
  const SRC = { openaerialmap: ['OpenAerialMap', 'CC BY 4.0'], panoramax: ['Panoramax (federated, api.panoramax.xyz)', 'per picture; CC BY-SA 4.0 seen'], kartaview: ['KartaView (Grab)', 'CC BY-SA 4.0'], 'ea-survey': ['Environment Agency survey catalogue', 'OGL v3.0'], mapillary: ['Mapillary (Meta)', 'CC BY-SA 4.0'] };
  for (const [k, [label, lic]] of Object.entries(SRC)) { const s = kid('imagery-source', k); add(s, T, V + 'ImagerySource'); add(s, LABEL, L(label)); add(s, S + 'license', L(lic)); }
  for (const f of files) {
    const d = JSON.parse(readFileSync(f, 'utf8')); if (!d.area) { add(kid('imagery-source', d.source), V + 'status', L(d.status)); continue; }
    const cp = [run, d.source, d.area], c = kid('coverage', ...cp), items = d.items;
    add(c, T, V + 'CoverageCount'); add(c, V + 'source', kid('imagery-source', d.source)); add(c, V + 'area', kid('area', d.area));
    add(c, V + 'count', L(items.length)); add(c, 'http://purl.org/dc/terms/date', L(run, 'date')); add(c, V + 'request', L(d.request));
    if (d.calls != null) add(c, V + 'requests', L(d.calls)); if (d.timeouts) add(c, V + 'timeouts', L(d.timeouts)); if (d.capped) add(c, V + 'capped', L('true', 'boolean'));
    const date = x => (x.datetime || x.shot || x.start || (x.year ? x.year + '-01-01' : '') || '').slice(0, 10);
    const dates = items.map(date).filter(Boolean).sort(); if (dates.length) { add(c, V + 'firstDate', L(dates[0], 'date')); add(c, V + 'lastDate', L(dates.at(-1), 'date')); }
    const byYear = {}; for (const x of items) { const y = date(x).slice(0, 4); if (y) byYear[y] = (byYear[y] || 0) + 1; }
    for (const [y, n] of Object.entries(byYear)) { const yc = kid('coverage', ...cp, `year-${y}`); add(c, V + 'inYear', yc); add(yc, V + 'year', L(y, 'gYear')); add(yc, V + 'count', L(n)); }
    const byLic = {}; for (const x of items) if (x.licence) byLic[x.licence] = (byLic[x.licence] || 0) + 1;
    for (const [l, n] of Object.entries(byLic)) { const lc = kid('coverage', ...cp, `licence-${l.replace(/[^A-Za-z0-9.]+/g, '-')}`); add(c, V + 'byLicence', lc); add(lc, S + 'license', L(l)); add(lc, V + 'count', L(n)); }
    if (d.source === 'panoramax') { add(c, V + 'withSemantics', L(items.filter(x => x.semantics).length)); add(c, V + 'collections', L(new Set(items.map(x => x.collection)).size)); }
    if (d.source === 'kartaview') add(c, V + 'sequences', L(new Set(items.map(x => x.sequence)).size));
    if (d.source === 'openaerialmap') for (const x of items) { const s = kid('oam', x.id), sg = kid('oam', x.id, 'geometry');
      add(s, T, V + 'AerialImage'); add(s, S + 'name', L(x.title)); add(s, S + 'dateCreated', L(x.start)); add(s, V + 'gsdMetres', L(x.gsd)); add(s, V + 'platform', L(x.platform));
      add(s, S + 'license', L(x.licence)); add(s, S + 'contentUrl', x.url); add(s, V + 'inArea', kid('area', d.area)); add(s, GEOM, sg); add(sg, WKT, wkt(x.bbox)); }
    if (d.source === 'ea-survey') { const g = {}; for (const x of items) (g[`${x.product}|${x.resolution}|${x.year}`] ||= []).push(x);
      for (const [k, xs] of Object.entries(g)) { const [p, r, y] = k.split('|'), s = kid('coverage', ...cp, `${p}-${r.replace(/[^0-9a-z.]+/gi, '')}-${y}`);
        add(c, V + 'product', s); add(s, LABEL, L(xs[0].productLabel)); add(s, V + 'resolution', L(r)); add(s, V + 'year', L(y, 'gYear')); add(s, V + 'tiles', L(xs.length)); } }
  }
  return { 'coverage-imagery': { quads: q, about: { title: `Open imagery coverage of the first cwplans areas, ${run}: OpenAerialMap images, EA survey products, and counts of Panoramax and KartaView pictures (counts only: CC BY-SA)`, licence: 'CC0 for the counts; OpenAerialMap metadata CC BY 4.0; EA catalogue OGL v3.0' } } };
});
const v = out['coverage-imagery'];
const ehF = join(LONDAT_DIR, 'kgx', 'external-heads.json'), eh = existsSync(ehF) ? JSON.parse(readFileSync(ehF, 'utf8')) : {};
eh['coverage-imagery'] = v.iri; writeFileSync(ehF, JSON.stringify(eh, null, 1) + '\n');
console.log(JSON.stringify({ run, version: v.iri, triples: v.triples, new: flow.ran.length }));
