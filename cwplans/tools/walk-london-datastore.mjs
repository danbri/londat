#!/usr/bin/env node
// A recorded walk through the London Datastore (data.london.gov.uk, a DataPress site): the whole catalogue, a
// triage of every dataset by written rules, and a harvest of the shortlisted open datasets clipped to the zone.
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/walk-london-datastore.mjs walk [--details] [--refresh]
//   node cwplans/tools/walk-london-datastore.mjs triage
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/walk-london-datastore.mjs harvest [key ...] [--refresh]
// walk:    GET /api/v3/datasets/export.json (every public dataset, one response) and the CKAN-compatible
//          /api/action/package_search (owner organisation); --details also GETs /api/v3/dataset/<id> for each dataset
//          (resource format, archivedAt). Out: feeds/london-datastore/catalogue.json (one dataset per line).
// triage:  rules below (licence class, relevance to the zone, kind, held or listed by the project, value themes,
//          join keys, sensitivity, rank). Out: feeds/london-datastore/triage.json. No network.
// harvest: the HARVEST table below; one folder per dataset, feeds/london-datastore/<key>/, {meta, ...} files.
// Raw downloads: data/raw/london-datastore/ (gitignored), reused unless --refresh.
// Network: one request at a time, at least 1 s apart, backoff on 429 and 5xx (Retry-After honoured), project UA.
// Method, rules and the reasons: skills/cwplans-london-datastore/SKILL.md; results: feeds/london-datastore/README.md.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { execFileSync } from 'child_process';
import { RAW, UA, TOOLS } from './lib.mjs';
import { LONDAT_CW, warnIfNoLondat, cwPath } from './londat.mjs';

export const CW = join(TOOLS, '..');
export const OUT = join(LONDAT_CW, 'feeds', 'london-datastore');   // hosted in danbri/londat (tools/londat.mjs)
warnIfNoLondat();
export const RAWDIR = join(RAW, 'london-datastore');
mkdirSync(join(RAWDIR, 'details'), { recursive: true }); mkdirSync(OUT, { recursive: true });
export const today = new Date().toISOString().slice(0, 10);
const args = process.argv.slice(2);
export const REFRESH = args.includes('--refresh');
export const BASE = 'https://data.london.gov.uk';
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) console.warn('warning: HTTPS_PROXY is set but NODE_USE_ENV_PROXY is not; Node fetch will not use the proxy');

// ---- polite fetch: one request at a time over the whole tool, >= 1 s apart, retries on 429 / 5xx / network errors
let chain = Promise.resolve(), last = 0, nReq = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
export function politeFetch(url, { minGapMs = 1100, tries = 6 } = {}) {
  const run = async () => {
    for (let k = 1; ; k++) {
      const wait = last + minGapMs - Date.now(); if (wait > 0) await sleep(wait);
      last = Date.now(); nReq++;
      let r, err;
      try { r = await fetch(url, { headers: { 'User-Agent': UA } }); } catch (e) { err = e; }
      if (r && r.ok) { const b = Buffer.from(await r.arrayBuffer()); last = Date.now(); return b; }
      const retry = err || r.status === 429 || r.status >= 500;
      if (!retry || k >= tries) throw new Error(`${err ? err.message : r.status} ${url}`);
      const ra = r && +r.headers.get('retry-after');
      await sleep(ra ? ra * 1000 : minGapMs * 2 ** k);
    }
  };
  const p = chain.then(run, run); chain = p.catch(() => {}); return p;
}
// a capped GET: Range bytes=0-(max-1); a server that ignores Range (200) has its stream cut at max bytes.
// Returns { buf, status, partial } and never throws on an HTTP error status (status is the evidence).
export function politeGet(url, { maxBytes = Infinity, minGapMs = 1100, tries = 4 } = {}) {
  const run = async () => {
    for (let k = 1; ; k++) {
      const wait = last + minGapMs - Date.now(); if (wait > 0) await sleep(wait);
      last = Date.now(); nReq++;
      let r, err;
      try { r = await fetch(url, { headers: { 'User-Agent': UA, ...(isFinite(maxBytes) ? { Range: `bytes=0-${maxBytes - 1}` } : {}) }, signal: AbortSignal.timeout(300000) }); } catch (e) { err = e; }
      if (r && (r.ok || r.status === 206)) {
        const chunks = []; let n = 0, partial = r.status === 206; const rd = r.body.getReader();
        try { for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); n += value.length; if (n >= maxBytes) { partial = true; await rd.cancel(); break; } } }
        catch (e) { err = e; }
        if (!err) { last = Date.now(); const total = +(r.headers.get('content-range') || '').split('/')[1] || +r.headers.get('content-length') || null; return { buf: Buffer.concat(chunks).subarray(0, isFinite(maxBytes) ? maxBytes : undefined), status: r.status, partial: partial && (!total || total > maxBytes), total }; }
      }
      const retry = err || r.status === 429 || r.status >= 500;
      if (!retry || k >= tries) return { buf: null, status: r ? r.status : 'network: ' + (err?.message || '').slice(0, 60), partial: false };
      const ra = r && +r.headers.get('retry-after');
      await sleep(ra ? ra * 1000 : minGapMs * 2 ** k);
    }
  };
  const p = chain.then(run, run); chain = p.catch(() => {}); return p;
}
// bytes a..b of a file (HTTP Range) in the polite queue: a zip's central directory without the whole file
export function politeRange(url, a, b) {
  const run = async () => {
    const wait = last + 1100 - Date.now(); if (wait > 0) await sleep(wait);
    last = Date.now(); nReq++;
    const r = await fetch(url, { headers: { 'User-Agent': UA, Range: `bytes=${a}-${b}` } });
    if (r.status !== 206) throw new Error(`Range not honoured (${r.status}) ${url}`);
    const buf = Buffer.from(await r.arrayBuffer()); last = Date.now(); return buf;
  };
  const p = chain.then(run, run); chain = p.catch(() => {}); return p;
}
export async function rawFile(name, url) {
  const f = join(RAWDIR, name);
  mkdirSync(dirname(f), { recursive: true });
  if (!REFRESH && existsSync(f) && statSync(f).size > 0) return { file: f, fetched: statSync(f).mtime.toISOString().slice(0, 10), reused: true };
  writeFileSync(f, await politeFetch(url));
  return { file: f, fetched: today, reused: false };
}
export const readJson = f => JSON.parse(readFileSync(f, 'utf8'));

// ================================================================== walk
// granularity words and zone place names looked for in a dataset description (details walk)
export const DESC_AREA_RE = /\b(lower super output areas?|middle super output areas?|output areas?|lsoas?|msoas?|wards?|postcodes?|postcode sectors?|boroughs?|local authorit(?:y|ies)|uprns?|toids?|coordinates|easting|northing|latitude|longitude|grid squares?|point locations?|polygons?|shapefiles?|geopackage|london[- ]wide|national|england and wales|canary wharf|isle of dogs|docklands|poplar|millwall|limehouse|wapping|rotherhithe|canada water|surrey quays|deptford|greenwich peninsula|royal docks|silvertown)\b/gi;
const ext = s => { const m = /\.([A-Za-z0-9]{1,8})$/.exec((s || '').split('?')[0]); return m ? m[1].toLowerCase() : null; };
async function walk() {
  const exp = await rawFile('export.json', `${BASE}/api/v3/datasets/export.json`);
  const ckan = await rawFile('package_search.json', `${BASE}/api/action/package_search`);
  const list = readJson(exp.file), pkg = new Map(readJson(ckan.file).result.result.map(p => [p.id, p]));
  const DETAILS = args.includes('--details');
  let nDetails = 0;
  if (DETAILS) for (const [i, d] of list.entries()) {
    const f = `details/${d.id}.json`;
    try { const r = await rawFile(f, `${BASE}/api/v3/dataset/${d.id}`); if (!r.reused && i % 50 === 0) console.log(`details ${i + 1}/${list.length}`); nDetails++; }
    catch (e) { console.warn('details failed', d.id, e.message); }
  } else nDetails = readdirSync(join(RAWDIR, 'details')).length;
  const detail = id => { const f = join(RAWDIR, 'details', id + '.json'); return existsSync(f) ? readJson(f) : null; };
  // what the dataset description says about its area: granularity words and zone place names (the text is not kept)
  const descArea = html => { const t = String(html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
    return [...new Set([...t.matchAll(DESC_AREA_RE)].map(m => m[1].toLowerCase().replace(/\s+/g, ' ')))].sort(); };
  const datasets = list.map(d => {
    const p = pkg.get(d.id), det = detail(d.id);
    const fmt = new Map(Object.entries(det?.resources || {}).map(([k, v]) => [k, v.format]));
    const md5 = new Map(Object.entries(det?.resources || {}).map(([k, v]) => [k, v.hash]));
    return {
      id: d.id,
      title: d.title,
      slug: d.webpage.replace(`${BASE}/dataset/`, ''),
      publisher: d.logo?.title || p?.maintainer || d.custom?.author || null,
      publisher_from: d.logo?.title ? 'organisation' : p?.maintainer ? 'maintainer' : d.custom?.author ? 'author' : null,
      licence: d.licence?.title || null,
      topics: (d.topics || []).map(t => t.id),
      tags: (d.tags || []).map(t => typeof t === 'string' ? t : t.id || t.title),
      geo: d.custom?.geo || null,
      update_frequency: d.custom?.update_frequency || null,
      created: d.createdAt?.slice(0, 10) || null, modified: d.updatedAt?.slice(0, 10) || null,
      next_review: d.nextReviewDate || null, archived: det?.archivedAt || null,
      resources: (d.resources || []).map(r => {
        const file = r.url.split('/').pop(), std = r.url === `${BASE}/download/${d.id}/${r.id}/${file}`;
        let name = file; try { name = decodeURIComponent(file); } catch { }
        return {
          id: r.id, ...(std ? { file } : { url: r.url }), ...(r.title && r.title !== name && r.title !== r.filename ? { title: r.title } : {}),
          format: ext(name) || fmt.get(r.id) || null, ...(fmt.get(r.id) ? { kind: fmt.get(r.id) } : {}), size: r.size ?? null, date: r.timestamp?.slice(0, 10) || null,
          ...(r.timeframeFrom || r.timeframeTo ? { timeframe: [r.timeframeFrom || null, r.timeframeTo || null] } : {}),
          ...(md5.get(r.id) ? { md5: md5.get(r.id) } : {}),
        };
      }),
      ...(det ? { details: { resources: Object.keys(det.resources || {}).length, kinds: [...new Set(Object.values(det.resources || {}).map(v => v.format).filter(Boolean))].sort(),
        archived: det.archivedAt || null, next_review: det.nextReviewDate || null, geo: det.custom?.geo || null, description_area: descArea(det.description),
        only_in_details: Object.keys(det.resources || {}).filter(k => !(d.resources || []).some(r => r.id === k)).length } } : {}),
      links: (d.links || []).map(l => ({ title: l.title, url: l.url, http: l.httpStatus ?? null, checked: l.qaTimestamp?.slice(0, 10) || null })),
    };
  });
  const meta = {
    source: 'London Datastore (Greater London Authority), https://data.london.gov.uk/',
    api: { export: `${BASE}/api/v3/datasets/export.json`, dataset: `${BASE}/api/v3/dataset/<id>`, ckan_compat: `${BASE}/api/action/package_search`,
      note: 'DataPress platform. /api/3/action/* redirects (307) to /api/action/*; package_search returns all datasets in one response (q, rows, start ignored); organization_list and license_list answer 410 "Deprecated Route: use /api/v3/datasets/export.json and /api/v3/dataset/:id" (2026-10-04). Docs: https://datapress.com/docs/api' },
    terms: { url: `${BASE}/about/terms-and-conditions`, read: '2026-10-04',
      summary: 'Data may be used for any purpose within the site terms; each dataset carries its own licence; a re-user must state that the GLA cannot warrant the quality or accuracy of the data, and must not imply GLA endorsement. robots.txt disallows only /debug, /manage/, /login, /logout.' },
    fetched: { export: exp.fetched, package_search: ckan.fetched, details: nDetails ? `${nDetails} of ${list.length} datasets (api/v3/dataset/<id>)` : 'not fetched' },
    method: 'walk-london-datastore.mjs walk: the export lists every public dataset with its licence, topics, tags, custom fields (geo = spatial granularity, update_frequency), resources and links. Publisher = the organisation (logo title), else the CKAN maintainer, else custom.author. Contacts (names and emails), descriptions and logos are not kept. Resource URL = https://data.london.gov.uk/download/<dataset id>/<resource id>/<file> unless the record gives "url" (a different form). format = the file extension; kind = the publisher\'s generic format (spreadsheet, document, csv, zip...) from api/v3/dataset/<id>, only where that record was fetched (a check of the first 186 datasets on 2026-10-04 showed no field the export lacks besides this generic format, and no archivedAt).',
    resource_url_template: `${BASE}/download/{dataset}/{id}/{file}` + ' (file as it appears in the URL, percent-encoded; a resource whose URL has another form keeps "url"); title only when it differs from the file name; date = the resource timestamp (day)',
    licence_urls: Object.fromEntries([...new Map(list.filter(d => d.licence?.url).map(d => [d.licence.title, d.licence.url]))]),
    counts: { datasets: datasets.length, resources: datasets.reduce((s, d) => s + d.resources.length, 0), links: datasets.reduce((s, d) => s + d.links.length, 0) },
    licence_of_this_file: 'Catalogue metadata from the London Datastore (site terms: any purpose); each dataset\'s own licence is in its record.',
  };
  datasets.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(join(OUT, 'catalogue.json'), '{"meta":' + JSON.stringify(meta, null, 1) + ',\n"datasets":[\n' + datasets.map(d => JSON.stringify(d)).join(',\n') + '\n]}\n');
  console.log(`catalogue: ${datasets.length} datasets, ${meta.counts.resources} resources, ${nReq} requests`);
}

// ================================================================== triage
// Every class comes from a written rule; the reasons list the rule and the evidence.
const ZONE_BOROUGHS = { 'tower hamlets': 'E09000030', southwark: 'E09000028', lewisham: 'E09000023', greenwich: 'E09000011', newham: 'E09000025', 'city of london': 'E09000001' };
const OTHER_BOROUGHS = ['barking', 'dagenham', 'barnet', 'bexley', 'brent', 'bromley', 'camden', 'croydon', 'ealing', 'enfield', 'hackney', 'hammersmith', 'fulham', 'haringey', 'harrow', 'havering', 'hillingdon', 'hounslow', 'islington', 'kensington', 'chelsea', 'kingston', 'lambeth', 'merton', 'redbridge', 'richmond', 'sutton', 'waltham forest', 'wandsworth', 'westminster',
  'wembley', 'old oak', 'park royal', 'heathrow', 'croydon', 'olympic park', 'queen elizabeth olympic park', 'stratford', 'brent cross', 'kings cross', 'vauxhall', 'nine elms', 'battersea', 'white city', 'elephant and castle', 'tottenham', 'woolwich', 'thamesmead', 'beckton', 'barking riverside'];
// place names inside the 3D model box [-0.095, 51.474, 0.015, 51.522] (and the Royal Docks just east of it)
const ZONE_PLACES = ['thames', 'canary wharf', 'isle of dogs', 'docklands', 'poplar', 'millwall', 'cubitt town', 'blackwall', 'limehouse', 'royal docks', 'royal victoria', 'royal albert', 'silvertown', 'greenwich peninsula', 'north greenwich', 'deptford', 'rotherhithe', 'canada water', 'surrey quays', 'wapping', 'leamouth', 'lower lea', 'bow creek', 'e14', 'canning town', 'shadwell', 'bermondsey', 'tower bridge', 'london bridge'];
const GEO = {
  fine: ['Point Location', 'Coordinates', 'Unit Postcode', '20 Metre Grid', '100m Grid Squares', 'Custom Polygons', 'Output Area', 'Lower Super Output Area', 'Middle Super Output Area', 'Ward', 'Postcode Sector', 'Street and Neighbourhood', 'Town Centres', 'Schools', 'Hospitals', 'Train Stations', 'Education Institution', '1km Grid Squares', 'Airports'],
  borough: ['Local Authority', 'Borough', 'Primary Care Organisations', 'Parliamentary Constituency', 'GLA Constituency', 'Hospital Trust'],
  coarse: ['Greater London', 'Region', 'Sub-Region', 'Country', 'Worldwide', 'N/A', 'Other'],
};
const SPATIAL_FORMATS = ['gpkg', 'geojson', 'shp', 'kml', 'kmz', 'gml', 'dwg', 'tab', 'mif'];
const MACHINE_FORMATS = ['csv', 'xlsx', 'xls', 'xlsm', 'ods', 'json', 'geojson', 'gpkg', 'zip', 'shp', 'kml', 'xml', 'ttl', 'txt', 'tsv', 'gml', 'parquet'];
export const LICENCE_CLASS = [
  [/^Open Government Licence/i, 'ogl', true],
  [/^Creative Commons Attribution Share-Alike/i, 'share-alike', false],
  [/Open Database License|ODbL/i, 'share-alike', false],
  [/^Creative Commons Non-Commercial/i, 'restricted', false],
  [/^Creative Commons Attribution$/i, 'cc-by', true],
  [/^Open Data Commons Attribution License/i, 'odc-by', true],
  [/^(Public Domain|Open Data Commons Public Domain)/i, 'public-domain', true],
  [/^All Rights Reserved/i, 'restricted', false],
  [/Transport Data Service Licence/i, 'other', false],
];
const THEMES = {
  'buildings-places': [3, /\b(building|buildings|land|sites?|development|brownfield|tall|opportunity areas?|town centres?|high streets?|boundar\w*|footprint|uprn|address|propert\w*|epc|energy performance|stock model|floorspace|density|open spaces?|green spaces?|public realm|parks?|place|regeneration|housing zones?|local plan|london plan|ldd|completions?|permissions?|conservation)\b/i],
  'occupants-organisations': [3, /\b(business|businesses|compan\w*|enterprises?|employers?|workplace|schools?|colleges?|nurser\w*|gp|pharmac\w*|hospitals?|shops?|retail|pubs?|restaurants?|charit\w*|voluntary|cultural infrastructure|venues?|creative|hotels?|offices?|universit\w*|libraries|library|organisations?|market traders?|markets?|night time|night-time|clubs?)\b/i],
  'events-works': [2, /\b(incidents?|fires?|crime|collisions?|casualt\w*|planning applications?|referr\w*|works|streetworks|events?|licensing|complaints?|enforcement|rescues?|inspections?|callouts?|disruptions?|closures?|power cuts?|anti-?social)\b/i],
  transport: [2, /\b(transport|stations?|tube|underground|buses|bus|cycle|cycling|roads?|traffic|rail|dlr|river|piers?|parking|ev charg\w*|electric vehicles?|journeys?|ptal|cars?|taxis?|freight|walking|streets?|streetworks|tfl|ulez|congestion)\b/i],
  environment: [2, /\b(air quality|no2|pm2\.?5|pm10|emissions?|laei|trees?|canopy|flood|green|biodiversity|habitat|noise|energy|solar|heat|carbon|climate|water|waste|recycl\w*|temperature|nature|sinc|pollution|electricity|gas|retrofit|decentralised)\b/i],
  'people-housing': [1, /\b(population|census|demograph\w*|housing|households?|deprivation|income|poverty|ethnic\w*|benefits?|claimant|health|life expectancy|rents?|house prices?|affordab\w*|homeless\w*|overcrowd\w*|elections?|labour market|unemployment|earnings|projections?|migration|births?|well-?being)\b/i],
  heritage: [3, /\b(heritage|listed buildings?|conservation areas?|historic|archaeolog\w*|blue plaques?|monuments?|scheduled|world heritage|locally listed)\b/i],
};
// Datastore topics -> themes (in addition to the keyword rules on title and tags)
const TOPIC_THEMES = { planning: 'buildings-places', housing: 'people-housing', demographics: 'people-housing', environment: 'environment', transport: 'transport',
  'art-and-culture': 'occupants-organisations', 'crime-and-community-safety': 'events-works', health: 'people-housing', 'income-poverty-welfare': 'people-housing' };
// Records about individual people in sensitive situations: catalogued, never harvested (CLAUDE.md data ethics).
const SENSITIVE = /\b(fatal|homicide|victims?|strip search|intimate|suicide|custody|stop and search|stop & search|hate crime|domestic abuse|sexual|safeguarding|missing persons?|rough sleep\w*|chain|bariatric|deaths? in)\b/i;
const JOIN_KEYS = { uprn: /\buprn\b/i, toid: /\btoid\b/i, postcode: /postcode/i, ward: /\bwards?\b/i, lsoa: /\blsoa|lower super output/i, msoa: /\bmsoa|middle super output/i, oa: /\boutput areas?\b/i, borough: /\bborough|local authorit/i, company: /companies house|company number/i };
const RELEVANCE_W = { 'zone-place': 5, 'zone-borough': 4, 'london-fine': 3, 'london-borough': 1.5, unknown: 1, 'london-coarse': 0.3, 'other-area': 0 };

// what the project already has: dataset ids and slugs in the committed files, by role
function projectHas(cat) {
  // the committed files plus the files on disk in feeds/portals/ (tools/londat.mjs)
  const inLondat = (d, rel) => existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? inLondat(join(d, e.name), rel + e.name + '/') : [rel + e.name]) : [];
  const files = [...new Set([...execFileSync('git', ['ls-files', '--cached', '--', '.'], { cwd: CW, encoding: 'utf8' }).split('\n').filter(Boolean), ...inLondat(join(LONDAT_CW, 'feeds', 'portals'), 'feeds/portals/')])]
    .filter(p => !p.startsWith('feeds/london-datastore/') && /\.(json|md|mjs|js)$/.test(p) && !/^(METHODS|DATA-REGISTER)\.md$|pipeline\.jsonld$/.test(p));
  const ids = new Set(cat.map(d => d.id)), bySlug = new Map(cat.map(d => [d.slug, d.id]));
  const has = new Map(), unknownRefs = new Set();
  const add = (id, role, where) => { const h = has.get(id) || { held: new Set(), listed: new Set(), excluded: new Set() }; h[role].add(where); has.set(id, h); };
  for (const p of files) {
    const text = readFileSync(cwPath(p), 'utf8');
    if (!text.includes('data.london.gov.uk')) continue;
    // role of the file: data held (register, tools, data files) / a catalogue entry (feeds) / a source left out
    const roleOf = (idx) => {
      if (/^feeds\//.test(p)) {
        if (/-excluded\.json$/.test(p) || /SURVEY/.test(p)) return /SURVEY/.test(p) && !/left out|Left out|not suitable|superseded|Not suitable/.test(text.slice(idx, idx + 400)) ? 'listed' : 'excluded';
        if (/feeds\.json$|events\.json$/.test(p)) { const ex = text.indexOf('"excluded"'); return ex > 0 && idx > ex ? 'excluded' : 'listed'; }
        return 'listed';
      }
      return /\.md$/.test(p) ? 'listed' : 'held';                    // data-register.json, pipeline.json, tools, data files
    };
    for (const m of text.matchAll(/data\.london\.gov\.uk\/(dataset|download)\/([A-Za-z0-9_.%-]+)/g)) {
      const tok = m[2].replace(/[.)]+$/, '');
      if (!tok) continue;
      let id = ids.has(tok) ? tok : bySlug.get(tok) || (ids.has(tok.split('-').pop()) ? tok.split('-').pop() : null)
        || cat.find(d => d.slug.slice(0, d.slug.lastIndexOf('-')) === tok)?.id;            // an old slug without the id
      if (!id) { unknownRefs.add(tok); continue; }
      add(id, roleOf(m.index), p);
    }
  }
  return { has, unknownRefs: [...unknownRefs] };
}

// datasets decided by hand (the reason is the evidence): open and relevant by the rules, but not to be harvested
const JUDGED = {
  '2w4wy': ['not-relevant', 'Flood Risk: EA Flood Map polygons with no flood zone class (harvested once and dropped, 2026-10-04); the EA Flood Map for Planning is the source to use'],
  '2rjn1': ['not-relevant', 'Southwark conservation areas: the London-wide set (emqwg, harvested) holds them'],
  'exp5p': ['not-relevant', 'Postcode Directory for London (Feb 2022): ONSPD August 2026 is held (postcodes/, zone-codes.json)'],
  '296oy': ['not-relevant', 'London Building Stock Model 1: superseded by LBSM 2 (2k55d), held through tools/registry-lbsm.mjs'],
  'e68wz': ['deferred', 'Assembly Member Gifts and Hospitality Register: records about named people (donors and members); not harvested without the owner'],
};
const DATA_RELEVANCE = { 'zone-point': 'zone-data', 'zone-uprn': 'zone-data', 'zone-postcode': 'zone-data', 'zone-code': 'zone-data', 'zone-place': 'zone-data',
  'london-fine': 'london-fine', 'borough-rows': 'london-borough', 'london-coarse': 'london-coarse', none: 'none' };
const FINAL_RULES = [
  'F1 sensitive: the title names records about people in sensitive situations (never harvested)',
  'F2 harvested: the project holds the data (a committed file, the data register, pipeline.json or a tool names the dataset)',
  'F3 not-open: the licence is not open (none stated, share-alike, restricted or other)',
  'F3b deferred: open, but an earlier project decision excluded it (an "excluded" list or a survey "left out" line)',
  'F3c by hand: a dataset in the JUDGED table of the tool (not-relevant or deferred, with the reason)',
  'F4 links only: unavailable when every link failed the Datastore QA check, else deferred (publisher site or API not followed)',
  'F5 unavailable: every probe request failed (HTTP status in the reason)',
  'F6 listed-for-harvest: relevant (zone place, zone borough, zone value in the data, or finer than a borough London-wide) with a machine-readable resource; reason and size given',
  'F7 deferred: relevant but documents only',
  'F8 not-relevant: the data shows borough rows only, London or coarser, or no geography',
  'F9 not-relevant: the metadata names only places outside the zone',
  'F10 deferred: the data could not be read (size cap, unreadable format, no readable resource)',
  'F11 deferred: open, coarse or unknown by metadata, not probed',
  'F8b not-relevant: the rule-driven harvest (lds-harvest-auto.mjs, harvest-log.json) read every row and feature and found none in the zone (checked after F3b)',
  'F10b deferred: the rule-driven harvest could not read any resource (harvest-log.json; checked after F3b); a zip of documents only is F7, a hand decision of the harvest is F3c',
];
function triage() {
  const cat = readJson(join(OUT, 'catalogue.json')).datasets;
  const { has, unknownRefs } = projectHas(cat);
  const out = {}, counts = { state: {}, licence: {}, relevance: {}, relevance_final: {}, kind: {}, have: {}, themes: {}, sensitive: 0, open_relevant_new: 0 };
  const probed = existsSync(join(OUT, 'probe.json')) ? readJson(join(OUT, 'probe.json')).datasets : {};
  // outcomes of the rule-driven harvest (tools/lds-harvest-auto.mjs): every row read, so the data decides
  const hlog = existsSync(join(OUT, 'harvest-log.json')) ? readJson(join(OUT, 'harvest-log.json')).datasets : {};
  const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
  for (const d of cat) {
    const reasons = [];
    const text = [d.title, ...d.tags, d.slug].join(' | ').toLowerCase().replace(/-/g, ' ');
    const titleL = d.title.toLowerCase(), pubL = (d.publisher || '').toLowerCase();
    // licence
    let lic = 'none', open = false;
    if (d.licence) { const hit = LICENCE_CLASS.find(([re]) => re.test(d.licence)); [lic, open] = hit ? [hit[1], hit[2]] : ['other', false]; }
    reasons.push(`licence: ${d.licence || 'none stated'} -> ${lic}`);
    // relevance
    const zoneB = Object.keys(ZONE_BOROUGHS).filter(b => new RegExp(`\\b${b}\\b`).test(text + ' | ' + pubL));
    const otherB = OTHER_BOROUGHS.filter(b => new RegExp(`\\b${b}\\b`).test(text + ' | ' + pubL));
    const placeText = (titleL + ' | ' + d.tags.join(' | ').toLowerCase()).replace(/-/g, ' ').replace(/upon thames|thames estuary|thames gateway|thamesmead/g, '');
    const places = ZONE_PLACES.filter(z => new RegExp(`\\b${z}\\b`).test(placeText));
    const geoClass = GEO.fine.includes(d.geo) ? 'fine' : GEO.borough.includes(d.geo) ? 'borough' : GEO.coarse.includes(d.geo) ? 'coarse' : null;
    const formats = [...new Set(d.resources.map(r => r.format).filter(Boolean))];
    let rel;
    if (places.length) { rel = 'zone-place'; reasons.push(`names a place in the zone: ${places.join(', ')}`); }
    else if (zoneB.length && zoneB.length + otherB.length <= 3 && !otherB.length) { rel = 'zone-borough'; reasons.push(`names only zone boroughs: ${zoneB.join(', ')}`); }
    else if (otherB.length && otherB.length + zoneB.length <= 3) { rel = 'other-area'; reasons.push(`names only places outside the zone: ${[...otherB, ...zoneB].join(', ')}`); }
    else if (geoClass === 'fine') { rel = 'london-fine'; reasons.push(`geo "${d.geo}": London-wide at a granularity finer than a borough`); }
    else if (geoClass === 'borough') { rel = 'london-borough'; reasons.push(`geo "${d.geo}": borough rows cover the zone boroughs, no finer`); }
    else if (geoClass === 'coarse') { rel = 'london-coarse'; reasons.push(`geo "${d.geo}": London or coarser`); }
    else {
      const kw = Object.entries(JOIN_KEYS).filter(([k, re]) => k !== 'borough' && k !== 'company' && re.test(text)).map(([k]) => k);
      const sp = formats.filter(f => SPATIAL_FORMATS.includes(f));
      if (kw.length || sp.length) { rel = 'london-fine'; reasons.push(`no geo field; inferred fine from ${[...kw.map(k => 'title/tag "' + k + '"'), ...sp.map(f => 'format ' + f)].join(', ')}`); }
      else if (JOIN_KEYS.borough.test(text)) { rel = 'london-borough'; reasons.push('no geo field; inferred borough from title/tags'); }
      else { rel = 'unknown'; reasons.push(`no geo field (${d.geo ?? 'unset'}) and no granularity word`); }
    }
    // kind
    const f = d.update_frequency;
    const kind = !f ? 'unknown' : f === 'One off' ? 'static' : ['Daily', 'Hourly', 'Realtime'].includes(f) ? 'live' : 'periodic';
    const newest = d.resources.map(r => r.date).filter(Boolean).sort().pop() || d.modified;
    const stale = (newest || '') < '2020-01-01';
    reasons.push(`kind: update_frequency ${f || 'unset'} -> ${kind}; newest resource ${newest?.slice(0, 10) || '?'}${stale ? ' (stale: before 2020)' : ''}`);
    // the project already has it?
    const h = has.get(d.id);
    const have = h?.held.size ? 'held' : h?.listed.size ? 'listed' : h?.excluded.size ? 'excluded-before' : 'new';
    if (h) reasons.push(`project: ${have} (${[...h.held, ...h.listed, ...h.excluded].join(', ')})`);
    // value themes
    const vtext = [d.title, ...d.tags].join(' ');
    const themes = [...new Set([...Object.entries(THEMES).filter(([, [, re]]) => re.test(vtext)).map(([k]) => k), ...d.topics.map(t => TOPIC_THEMES[t]).filter(Boolean)])];
    const value = themes.reduce((s, t) => s + THEMES[t][0], 0);
    const keys = Object.entries(JOIN_KEYS).filter(([, re]) => re.test(text + ' ' + (d.geo || ''))).map(([k]) => k);
    if (['Point Location', 'Coordinates'].includes(d.geo) || formats.some(x => SPATIAL_FORMATS.includes(x))) keys.push('coordinates');
    const sensitive = SENSITIVE.test(d.title);
    if (sensitive) reasons.push('sensitive: title names records about people in sensitive situations; catalogued, never harvested');
    const machine = formats.some(x => MACHINE_FORMATS.includes(x));
    const year = +(newest || '2000').slice(0, 4);
    const recency = year >= 2024 ? 1 : year >= 2021 ? 0.8 : year >= 2016 ? 0.5 : 0.3;
    const score = sensitive ? 0 : +(RELEVANCE_W[rel] * Math.max(value, 0.5) * recency * (machine ? 1 : 0.4) * (keys.some(k => k !== 'borough') ? 1.3 : 1)
      * (open ? 1 : 0) * (have === 'held' ? 0 : have === 'listed' ? 0.8 : 1)).toFixed(2);
    if (d.details?.description_area?.length) reasons.push(`description names: ${d.details.description_area.join(', ')}`);
    // the area found inside the data (probe.json) re-classes the relevance of a probed dataset
    const pr = probed[d.id];
    let relFinal = rel;
    if (pr && pr.area !== 'not-read') { relFinal = DATA_RELEVANCE[pr.area]; reasons.push(`area from the data: ${pr.area} (${pr.rule.split(':')[0]}): ${pr.evidence}`); }
    const relevant = ['zone-place', 'zone-borough', 'zone-data', 'london-fine'].includes(relFinal);
    // the final state: first rule that matches (FINAL_RULES)
    const readable = d.resources.filter(r => MACHINE_FORMATS.includes(r.format));
    const sizeOf = rs => rs.reduce((a, r) => a + (r.size || 0), 0);
    let state, why, rule;
    if (sensitive) [state, rule, why] = ['sensitive', 'F1', 'title names records about people in sensitive situations'];
    else if (have === 'held') [state, rule, why] = ['harvested', 'F2', `held: ${[...h.held].slice(0, 3).join(', ')}`];
    else if (!open) [state, rule, why] = ['not-open', 'F3', `licence ${d.licence || 'none stated'} (${lic})`];
    else if (JUDGED[d.id]) [state, rule, why] = [JUDGED[d.id][0], 'F3c', 'by hand: ' + JUDGED[d.id][1]];
    else if (have === 'excluded-before') [state, rule, why] = ['deferred', 'F3b', `excluded before by the project (${[...h.excluded].join(', ')}); not harvested without the owner`];
    else if (hlog[d.id]?.outcome === 'no-zone-rows') [state, rule, why] = ['not-relevant', 'F8b', `harvest (${hlog[d.id].date}): ${hlog[d.id].evidence}`];
    else if (hlog[d.id]?.outcome === 'documents-only') [state, rule, why] = ['deferred', 'F7', `harvest (${hlog[d.id].date}): ${hlog[d.id].evidence}`];
    else if (hlog[d.id]?.outcome === 'deferred-by-hand') [state, rule, why] = ['deferred', 'F3c', `by hand (harvest ${hlog[d.id].date}): ${hlog[d.id].reason}`];
    else if (hlog[d.id]?.outcome === 'not-readable') [state, rule, why] = ['deferred', 'F10b', `harvest (${hlog[d.id].date}): ${hlog[d.id].evidence || hlog[d.id].reason}`];
    else if (!d.resources.length) {
      const bad = d.links.filter(l => l.http && l.http >= 400);
      [state, rule, why] = d.links.length && bad.length === d.links.length ? ['unavailable', 'F4', `links only, every link failed the Datastore QA check: ${bad.map(l => 'HTTP ' + l.http).join(', ')}`]
        : ['deferred', 'F4', `links only (${d.links.length}): the publisher's site or API, not followed by this walk`];
    }
    else if (pr && pr.area === 'not-read' && pr.rule === 'every request failed') [state, rule, why] = ['unavailable', 'F5', pr.evidence];
    else if (relevant && readable.length) [state, rule, why] = ['listed-for-harvest', 'F6', `${pr && pr.area !== 'not-read' ? 'data: ' + pr.area : 'metadata: ' + rel}; ${readable.length} machine-readable resources, ${(sizeOf(readable) / 1e6).toFixed(1)} MB (largest ${(Math.max(...readable.map(r => r.size || 0)) / 1e6).toFixed(1)} MB)`];
    else if (relevant) [state, rule, why] = ['deferred', 'F7', `relevant (${relFinal}) but documents only: ${formats.join(', ')}`];
    else if (pr && pr.area !== 'not-read') [state, rule, why] = ['not-relevant', 'F8', `data: ${pr.area}: ${pr.evidence.slice(0, 300)}`];
    else if (rel === 'other-area') [state, rule, why] = ['not-relevant', 'F9', 'metadata names only places outside the zone'];
    else if (pr) [state, rule, why] = ['deferred', 'F10', `area not read from the data: ${pr.rule}${pr.evidence ? ' (' + pr.evidence.slice(0, 200) + ')' : ''}`];
    else [state, rule, why] = ['deferred', 'F11', `not probed (metadata relevance ${rel})`];
    out[d.id] = { title: d.title, licence: lic, open, relevance: rel, ...(pr ? { relevance_data: pr.area } : {}), relevance_final: relFinal, relevant, kind, stale, have, themes, keys: [...new Set(keys)], formats, sensitive, score,
      state, state_rule: rule, state_reason: why, reasons };
    inc(counts.state, state);
    inc(counts.licence, lic); inc(counts.relevance, rel); inc(counts.relevance_final, relFinal); inc(counts.kind, kind); inc(counts.have, have); themes.forEach(t => inc(counts.themes, t));
    if (sensitive) counts.sensitive++;
    if (open && relevant && have === 'new' && !sensitive) counts.open_relevant_new++;
  }
  const ranked = Object.entries(out).filter(([, t]) => t.score > 0).sort((a, b) => b[1].score - a[1].score).map(([id]) => id);
  const meta = {
    made: today, from: 'feeds/london-datastore/catalogue.json', tool: 'tools/walk-london-datastore.mjs triage',
    rules: {
      licence: 'license title -> class: Open Government Licence v2/v3 -> ogl; Creative Commons Attribution -> cc-by; Open Data Commons Attribution -> odc-by; Public Domain / PDDL -> public-domain (all four open); CC BY-SA and ODbL -> share-alike (not allowed, CLAUDE.md); CC Non-Commercial and All Rights Reserved -> restricted; Transport Data Service Licence -> other; empty -> none.',
      relevance: `first match wins: zone-place (title or tag names a place in the model box, after removing "upon Thames", "Thames Estuary", "Thames Gateway" and "Thamesmead": ${ZONE_PLACES.join(', ')}); zone-borough (names only zone boroughs: ${Object.keys(ZONE_BOROUGHS).join(', ')}); other-area (names 1-3 places, none in the zone); london-fine (geo field ${GEO.fine.join(', ')}; or, with no geo field, a ward/LSOA/MSOA/OA/postcode/UPRN/TOID word or a spatial file format); london-borough (geo ${GEO.borough.join(', ')}, or a borough word); london-coarse (geo ${GEO.coarse.join(', ')}); else unknown. Relevant = zone-place, zone-borough, london-fine.`,
      kind: 'update_frequency: One off -> static; Daily, Hourly, Realtime -> live; any other value -> periodic; unset -> unknown. stale = newest resource timestamp (else dataset modified) before 2020-01-01.',
      have: 'dataset id or slug found in a committed file of cwplans (not this folder or generated docs): in data-register.json, pipeline.json, tools or data files -> held; in a hand-written note (.md), feeds catalogues (feeds.json sources, events.json, feeds/works, feeds/underground) or the 2026-10-03 survey -> listed; in an "excluded" list or a survey "left out" line -> excluded-before; else new.',
      value: 'themes by keyword on title and tags, plus the Datastore topics (' + Object.entries(TOPIC_THEMES).map(([k, v]) => `${k} -> ${v}`).join(', ') + '); weights: ' + Object.entries(THEMES).map(([k, [w]]) => `${k} ${w}`).join(', ') + '. value = sum of the weights.',
      keys: 'join keys named in title, tags, slug or geo: ' + Object.keys(JOIN_KEYS).join(', ') + '; coordinates when geo is a point or a spatial format is present.',
      sensitive: 'title matches ' + SENSITIVE.source + ' -> catalogued, score 0, never harvested.',
      area_from_data: 'probe.json (tools/walk-london-datastore.mjs probe): the area class found in a sample of the data replaces the metadata relevance of a probed dataset: ' + Object.entries(DATA_RELEVANCE).map(([k, v]) => `${k} -> ${v}`).join(', ') + '.',
      final_state: FINAL_RULES,
      score: 'relevance weight (' + Object.entries(RELEVANCE_W).map(([k, v]) => `${k} ${v}`).join(', ') + ') x max(value, 0.5) x recency (newest year >= 2024: 1, >= 2021: 0.8, >= 2016: 0.5, else 0.3) x (a machine-readable format ? 1 : 0.4) x (a join key finer than a borough ? 1.3 : 1) x (open ? 1 : 0) x (held 0, listed 0.8, else 1); 0 when sensitive.',
    },
    counts, unmatched_references: unknownRefs,
    ranked,
  };
  writeFileSync(join(OUT, 'triage.json'), '{"meta":' + JSON.stringify(meta, null, 1) + ',\n"datasets":{\n' + Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + '\n}}\n');
  console.log(JSON.stringify(counts, null, 1));
  const total = Object.values(counts.state).reduce((a, b) => a + b, 0);
  console.log(`final states: ${JSON.stringify(counts.state)}; sum ${total} of ${cat.length}${total === cat.length ? ' (every dataset has a state)' : ' MISMATCH'}`);
  console.log('top 40:'); for (const id of ranked.slice(0, 40)) { const t = out[id]; console.log(id, t.score, t.relevance, t.licence, t.have, t.kind, t.themes.join('+'), '|', t.title); }
}

// ================================================================== harvest
// The shortlist taken from triage.json by hand judgement (README "Shortlist"): open licence, relevant, new to the
// project, machine-readable. file: the resource's file name (as in its URL, decoded); fmt: how to read it.
const HARVEST = {
  'conservation-areas':        { id: 'emqwg', file: 'Conservation_Areas.gpkg', fmt: 'gpkg', theme: 'heritage' },
  'southwark-local-list':      { id: 'e1r5k', fmt: 'geojson', theme: 'heritage' },
  'site-allocations':          { id: '2jxpm', file: 'Site_Allocations.gpkg', fmt: 'gpkg', theme: 'buildings-places' },
  // the GPKG holds polygons with OBJECTID only, and its OBJECTID does not match the CSV's objectid (127 of 238 zone
  // polygons fall over 500 m from the CSV point with that id): the CSV, with its own points, is the source used
  'brownfield-register':       { id: '2og9g', file: 'Brownfield_Register_tbl.csv', fmt: 'csv', xy: ['geox', 'geoy'], theme: 'buildings-places' },
  'central-activities-zone':   { id: '23jxk', file: 'caz_lp_2021.gpkg', fmt: 'gpkg', theme: 'buildings-places' },
  'strategic-industrial-land': { id: '2y5xy', file: 'Strategic_Industrial_Land.gpkg', fmt: 'gpkg', theme: 'buildings-places' },
  'locally-significant-industrial-sites': { id: '29z31', file: 'Locally_Significant_Industrial_Sites.gpkg', fmt: 'gpkg', theme: 'buildings-places' },
  'safeguarded-wharves':       { id: '2g90r', file: 'Safeguarded_Wharves.gpkg', fmt: 'gpkg', theme: 'transport' },
  'article4-office-residential': { id: '2gy3r', file: 'Article_4_Directions_Office_to_Residential.gpkg', fmt: 'gpkg', theme: 'buildings-places' },
  'designated-open-space':     { id: 'e195k', file: 'Designated_Open_Space.gpkg', fmt: 'gpkg', theme: 'environment' },
  'air-quality-monitoring-sites': { id: '23n41', file: 'Air_quality_monitoring_sites.gpkg', fmt: 'gpkg', theme: 'environment' },
  'cultural-infrastructure':   { id: '23697', file: 'cultural_venues_in_GIS_format.gpkg', fmt: 'gpkg', theme: 'occupants-organisations' },
  'lvmf-2026-consultation':    { id: '2gqpn', fmt: 'shpzip', all: true, theme: 'heritage' },
  // second walk (area from the data), 2026-10-04: the backlog head
  'town-centres':              { id: 'e55z7', file: 'Town_Centres_Boundaries.gpkg', fmt: 'gpkg', theme: 'buildings-places' },
  // the 2025-12-23 GeoPackage has geometry and OBJECTID only (as F23); the 2025-08-27 shapefile zip carries the names
  'opportunity-areas':         { id: 'epr7z', file: 'Opportunity_Areas.zip', fmt: 'shpzip', theme: 'buildings-places' },
  'high-streets':              { id: '2rq4w', file: 'GLA_High_Street_boundaries_2.gpkg', fmt: 'gpkg', theme: 'buildings-places' },
  // two resources share the name business_improvement_districts.zip on 2025-05-12: the shapefile one by id
  'business-improvement-districts': { id: 'vqmx7', resource: '42dacf04-f4d1-408a-85af-ba17818d2505', fmt: 'shpzip', theme: 'occupants-organisations' },
  'statistical-boundaries':    { id: '20od9', files: ['LB_LSOA2021_shp.zip', 'LB_MSOA2021_shp.zip', 'London-wards-2018.zip'], fmt: 'shpzip', skipLayers: /CityMerged/i, theme: 'people-housing' },
  // tables: the rows of the zone's areas only (zone-codes.json); the summary workbooks, not the long RM csv tables
  'census2021-ward-labour-market':        { id: '2lw9m', fmt: 'table', formats: ['xlsx'], all: true, codes: ['ward2026', 'ward2018', 'ward2014'], theme: 'people-housing' },
  'census2021-ward-housing':              { id: '2r7gm', fmt: 'table', formats: ['xlsx'], all: true, codes: ['ward2026', 'ward2018', 'ward2014'], theme: 'people-housing' },
  'census2021-ward-qualifications-health': { id: '24636', fmt: 'table', formats: ['xlsx'], all: true, codes: ['ward2026', 'ward2018', 'ward2014'], theme: 'people-housing' },
  'census2021-ward-demography-migration': { id: 'vqlx7', fmt: 'table', formats: ['xlsx'], all: true, codes: ['ward2026', 'ward2018', 'ward2014'], theme: 'people-housing' },
  'census2021-lsoa-labour-market':        { id: 'e76rk', fmt: 'table', formats: ['xlsx'], all: true, codes: ['lsoa21'], theme: 'people-housing' },
  'census2021-lsoa-housing':              { id: 'emxpl', fmt: 'table', formats: ['xlsx'], all: true, codes: ['lsoa21'], theme: 'people-housing' },
  'census2021-lsoa-demography-migration': { id: '2gj6n', fmt: 'table', formats: ['xlsx'], all: true, codes: ['lsoa21'], theme: 'people-housing' },
  // 264 MB: streamed, rows of zone TOIDs kept, the file not stored
  // area from the data (probe.json): zone values in datasets whose metadata said borough, London-wide or nothing
  'green-roofs-caz':           { id: '2nl6n', fmt: 'shpzip', theme: 'environment' },
  'urban-heat-island-2016':    { id: 'vdjgm', fmt: 'shpzip', theme: 'environment' },
  'laei-2019-focus-areas':     { id: '2zj76', file: '2. GIS files.zip', fmt: 'shpzip', theme: 'environment' },
  'air-quality-annual-objectives': { id: '2w184', file: 'annual-objectives-by-site-and-species.csv', fmt: 'csv', theme: 'environment' },
  // 80 MB zip, one 431 MB CSV of every London building TOID with its own easting/northing: rows in the box only
  'heat-demand':               { id: '2ogw5', file: 'LHM_2024_08_London.zip', fmt: 'table', zipEntry: 'LHM_London.csv', xy: ['EASTING', 'NORTHING'], theme: 'environment',
    drop: ['LATITUDE', 'LONGITUDE', 'OA', 'LSOA', 'MSOA', 'WARD_CODE', 'WARD', 'ADMINISTRATIVE_AREA'], dropWhy: 'derivable: WGS84 from EASTING/NORTHING (OSTN15); OA, LSOA, MSOA, ward and borough by point in polygon or from the OA through the ONS lookups (statistical-boundaries, zone-codes.json); dropped to keep the file near 5 MB' },
  'solar-opportunity':         { id: 'vdxyl', file: 'LSOM_by_TOID.csv', fmt: 'table', codes: ['toid'], theme: 'environment' },
};
// The zone: the 3D model box (tools/fetch-docklands.mjs BOX_BNG / BOX_WGS84); in_cw: the Canary Wharf registry box.
export const ZONE_BNG = { e0: 532400, e1: 539900, n0: 176700, n1: 182300 }, ZONE_WGS84 = [-0.0950, 51.4740, 0.0150, 51.5220];
export const CW_BOX = [-0.03, 51.498, -0.005, 51.51];
export const DROP_FIELD = /e-?mail|phone|tel(ephone)?$|^tel|contact|^fax|mobile|website_contact|^owner_?name|person/i;

// ---- GeoPackage (node:sqlite) and WKB
function readWkb(buf, off = 0) {
  const le = buf[off] === 1; let o = off + 1;
  const u32 = () => { const v = le ? buf.readUInt32LE(o) : buf.readUInt32BE(o); o += 4; return v; };
  const f64 = () => { const v = le ? buf.readDoubleLE(o) : buf.readDoubleBE(o); o += 8; return v; };
  let t = u32(); let dims = 2;
  if (t & 0x80000000) dims++; if (t & 0x40000000) dims++; t &= 0x0fffffff;
  if (t > 1000) { const dc = Math.floor(t / 1000); dims = dc === 3 ? 4 : 3; t %= 1000; }
  const pt = () => { const c = [f64(), f64()]; for (let i = 2; i < dims; i++) f64(); return c; };
  const pts = () => { const n = u32(), a = []; for (let i = 0; i < n; i++) a.push(pt()); return a; };
  const sub = () => { const g = readWkb(buf, o); o = g.end; return g.geom; };
  let geom;
  if (t === 1) geom = { type: 'Point', coordinates: pt() };
  else if (t === 2) geom = { type: 'LineString', coordinates: pts() };
  else if (t === 3) { const n = u32(), r = []; for (let i = 0; i < n; i++) r.push(pts()); geom = { type: 'Polygon', coordinates: r }; }
  else if (t >= 4 && t <= 6) { const n = u32(), parts = []; for (let i = 0; i < n; i++) parts.push(sub().coordinates); geom = { type: ['MultiPoint', 'MultiLineString', 'MultiPolygon'][t - 4], coordinates: parts }; }
  else if (t === 7) { const n = u32(), g = []; for (let i = 0; i < n; i++) g.push(sub()); geom = { type: 'GeometryCollection', geometries: g }; }
  else throw new Error(`WKB geometry type ${t} not handled`);
  return { geom, end: o };
}
function gpkgGeom(b) {
  if (!b || b.length < 8 || b[0] !== 0x47 || b[1] !== 0x50) return null;
  const flags = b[3]; if (flags & 0x10) return null;                       // empty geometry
  const env = (flags >> 1) & 7, envLen = [0, 32, 48, 48, 64][env] ?? 0;
  return readWkb(Buffer.from(b), 8 + envLen).geom;
}
export async function readGpkg(file) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file, { readOnly: true });
  const layers = db.prepare(`SELECT c.table_name t, g.column_name g, g.srs_id s FROM gpkg_contents c JOIN gpkg_geometry_columns g ON g.table_name = c.table_name WHERE c.data_type = 'features'`).all();
  // the layer's SRS: an EPSG code, or a custom definition on the Airy 1830 ellipsoid with the BNG projection (srs_id 100000 in
  // some GLA files) -> EPSG:27700; anything else stops the harvest
  const srsDef = new Map(db.prepare('SELECT srs_id, organization o, organization_coordsys_id c, definition d FROM gpkg_spatial_ref_sys').all().map(r => [r.srs_id, r]));
  const srsOf = id => { const r = srsDef.get(id); if (!r) throw new Error(`${file}: no srs ${id}`);
    if (/^epsg$/i.test(r.o) && [27700, 4326].includes(r.c)) return r.c;
    if (/airy/i.test(r.d) && /Transverse_Mercator/i.test(r.d) && /400000/.test(r.d) && /-100000/.test(r.d)) return 27700;
    throw new Error(`${file}: SRS ${id} not understood: ${String(r.d).slice(0, 120)}`); };
  for (const L of layers) L.s = srsOf(L.s);
  const out = [];
  for (const L of layers) {
    for (const row of db.prepare(`SELECT * FROM "${L.t}"`).all()) {
      const geom = gpkgGeom(row[L.g]); const props = { ...row }; delete props[L.g];
      out.push({ layer: L.t, srs: L.s, geom, props });
    }
  }
  db.close();
  return { layers: layers.map(l => ({ table: l.t, srs: l.s })), features: out };
}

// ---- ESRI shapefile (.shp + .dbf + .prj) from a zip, through unzip
function readShp(shp) {
  const feats = []; let o = 100;
  while (o + 8 <= shp.length) {
    const len = shp.readInt32BE(o + 4) * 2; const c = o + 8; o = c + len;
    const type = shp.readInt32LE(c); if (type === 0) { feats.push(null); continue; }
    const base = type % 10;
    if (base === 1) { feats.push({ type: 'Point', coordinates: [shp.readDoubleLE(c + 4), shp.readDoubleLE(c + 12)] }); continue; }
    if (base === 8) { const n = shp.readInt32LE(c + 36), a = []; for (let i = 0; i < n; i++) a.push([shp.readDoubleLE(c + 40 + 16 * i), shp.readDoubleLE(c + 48 + 16 * i)]); feats.push({ type: 'MultiPoint', coordinates: a }); continue; }
    const np = shp.readInt32LE(c + 36), n = shp.readInt32LE(c + 40), parts = [];
    for (let i = 0; i < np; i++) parts.push(shp.readInt32LE(c + 44 + 4 * i));
    const p0 = c + 44 + 4 * np, rings = parts.map((s, i) => { const e = i + 1 < np ? parts[i + 1] : n, r = []; for (let k = s; k < e; k++) r.push([shp.readDoubleLE(p0 + 16 * k), shp.readDoubleLE(p0 + 16 * k + 8)]); return r; });
    if (base === 3) feats.push(rings.length === 1 ? { type: 'LineString', coordinates: rings[0] } : { type: 'MultiLineString', coordinates: rings });
    else if (base === 5) {                                   // clockwise rings are outer (shapefile spec), the rest are holes of the last outer
      const polys = []; for (const r of rings) { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; if (a <= 0 || !polys.length) polys.push([r]); else polys[polys.length - 1].push(r); }
      feats.push(polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys });
    } else throw new Error(`shapefile type ${type} not handled`);
  }
  return feats;
}
function readDbf(dbf, utf8) {
  const n = dbf.readUInt32LE(4), hl = dbf.readUInt16LE(8), rl = dbf.readUInt16LE(10), fields = [];
  for (let o = 32; dbf[o] !== 0x0d && o < hl; o += 32) fields.push({ name: dbf.toString('latin1', o, o + 11).replace(/\0.*$/, ''), type: String.fromCharCode(dbf[o + 11]), len: dbf[o + 16] });
  const rows = [];
  for (let i = 0; i < n; i++) {
    let o = hl + i * rl + 1; const r = {};
    for (const f of fields) { const raw = dbf.toString(utf8 ? 'utf8' : 'latin1', o, o + f.len).trim(); o += f.len; r[f.name] = f.type === 'N' || f.type === 'F' ? (raw === '' ? null : +raw) : raw || null; }
    rows.push(r);
  }
  return rows;
}
export function readShpZip(zipFile, { skipBad = false } = {}) {
  const names = execFileSync('unzip', ['-Z1', zipFile], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const get = n => execFileSync('unzip', ['-p', zipFile, n], { maxBuffer: 1 << 30 });
  const out = [];
  for (const shpName of names.filter(n => /\.shp$/i.test(n))) {
    const stem = shpName.slice(0, -4), find = e => names.find(n => n.toLowerCase() === (stem + e).toLowerCase());
    const prj = find('.prj') ? get(find('.prj')).toString() : '', cpg = find('.cpg') ? get(find('.cpg')).toString() : '';
    const geoms = readShp(get(shpName)), rows = find('.dbf') ? readDbf(get(find('.dbf')), /utf-?8/i.test(cpg)) : [];
    // Web Mercator (EPSG:3857, e.g. the 2025 BIDs file) is unprojected to WGS84 longitude/latitude on the sphere
    const merc = /Web_Mercator|Pseudo_Mercator|3857/i.test(prj);
    // no .prj (LAEI 2019 focus areas): BNG only when every vertex lies in the London BNG range (F29)
    let noPrj = false;
    if (!prj.trim()) { let ok = geoms.some(Boolean); for (const g of geoms) if (g) eachPt(g, ([x, y]) => { if (!(x > 480000 && x < 590000 && y > 140000 && y < 220000)) ok = false; }); if (ok) noPrj = true; }
    const srs = noPrj ? 27700 : /British_National_Grid|OSGB_1936|27700/i.test(prj) ? 27700 : merc || (/WGS_1984|4326/i.test(prj) && !/Mercator/i.test(prj)) ? 4326 : null;
    if (!srs) { if (skipBad) continue; throw new Error(`${shpName}: unknown projection ${prj.slice(0, 80)}`); }
    const R = 6378137, unmerc = ([x, y]) => [x / R * 180 / Math.PI, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI];
    geoms.forEach((g, i) => out.push({ layer: stem.split('/').pop(), srs, ...(merc ? { from: 'EPSG:3857' } : noPrj ? { from: 'no .prj; BNG from the coordinate range' } : {}), geom: merc && g ? mapPts(g, unmerc) : g, props: rows[i] || {} }));
  }
  return { layers: [...new Set(out.map(f => f.layer))].map(l => { const f = out.find(f => f.layer === l); return { table: l, srs: f.srs, ...(f.from ? { from: f.from } : {}) }; }), features: out };
}
// ---- RFC 4180 CSV
export function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const h = rows[0].map(x => x.replace(/^﻿/, '').trim());
  return rows.slice(1).filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])));
}

// ---- geometry helpers: walk coordinates, test against the zone box, transform to WGS84
export const eachPt = (g, f) => { if (!g) return; if (g.type === 'GeometryCollection') return g.geometries.forEach(x => eachPt(x, f)); const w = c => typeof c[0] === 'number' ? f(c) : c.forEach(w); w(g.coordinates); };
export const mapPts = (g, f) => g.type === 'GeometryCollection' ? { ...g, geometries: g.geometries.map(x => mapPts(x, f)) } : { ...g, coordinates: (function m(c) { return typeof c[0] === 'number' ? f(c) : c.map(m); })(g.coordinates) };
export function bboxOf(g) { const b = [Infinity, Infinity, -Infinity, -Infinity]; eachPt(g, ([x, y]) => { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }); return b; }
function segHitsBox(a, b, B) {           // Liang-Barsky
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - B[0]], [dx, B[2] - a[0]], [-dy, a[1] - B[1]], [dy, B[3] - a[1]]]) {
    if (p === 0) { if (q < 0) return false; } else { const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
  }
  return true;
}
const ringsOf = g => !g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : g.type === 'GeometryCollection' ? g.geometries.flatMap(ringsOf) : [];
export function pointInPolys(p, g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : g.type === 'GeometryCollection' ? g.geometries.filter(x => /Polygon/.test(x.type)).flatMap(x => x.type === 'Polygon' ? [x.coordinates] : x.coordinates) : [];
  return polys.some(rings => rings.reduce((inside, r, i) => { let c = false; for (let a = 0, b = r.length - 1; a < r.length; b = a++) { if ((r[a][1] > p[1]) !== (r[b][1] > p[1]) && p[0] < (r[b][0] - r[a][0]) * (p[1] - r[a][1]) / (r[b][1] - r[a][1]) + r[a][0]) c = !c; } return i === 0 ? c : inside && !c; }, false));
}
// a geometry meets box B [x0, y0, x1, y1]: a vertex inside, an edge crossing, or the box inside a polygon
export function meets(g, B) {
  const bb = bboxOf(g); if (bb[2] < B[0] || bb[0] > B[2] || bb[3] < B[1] || bb[1] > B[3]) return false;
  let hit = false; eachPt(g, ([x, y]) => { if (x >= B[0] && x <= B[2] && y >= B[1] && y <= B[3]) hit = true; }); if (hit) return true;
  for (const r of ringsOf(g)) for (let i = 0; i + 1 < r.length; i++) if (segHitsBox(r[i], r[i + 1], B)) return true;
  return pointInPolys([(B[0] + B[2]) / 2, (B[1] + B[3]) / 2], g);
}
export const r6 = v => Math.round(v * 1e6) / 1e6, r1 = v => Math.round(v * 10) / 10;
export const cleanProps = p => { const kept = {}, dropped = new Set(); for (const [k, v] of Object.entries(p)) { if (DROP_FIELD.test(k)) { dropped.add(k); continue; } kept[k] = typeof v === 'bigint' ? Number(v) : v instanceof Uint8Array ? null : v === '' ? null : v; } return { kept, dropped }; };

async function harvest(keys) {
  const cat = new Map(readJson(join(OUT, 'catalogue.json')).datasets.map(d => [d.id, d]));
  const tri = readJson(join(OUT, 'triage.json')).datasets;
  const summary = [];
  for (const key of keys.length ? keys : Object.keys(HARVEST)) {
    const H = HARVEST[key]; if (!H) throw new Error(`unknown harvest key ${key}`);
    const d = cat.get(H.id), T = tri[H.id];
    if (!T.open || T.sensitive) throw new Error(`${key}: ${H.id} is not open (${T.licence}) or is sensitive`);
    const fileOf = r => decodeURIComponent(r.file || r.url.split('/').pop());
    const pick = d.resources.filter(r => H.resource ? [].concat(H.resource).includes(r.id) : H.files ? H.files.includes(fileOf(r)) : H.file ? fileOf(r) === H.file
      : H.fmt === 'table' ? (H.formats || ['xlsx', 'csv']).includes(r.format) : r.format === H.fmt || (H.fmt === 'shpzip' && r.format === 'zip'));
    if (!pick.length) throw new Error(`${key}: no resource ${H.file || H.fmt} in ${H.id}`);
    const resources = H.all || H.files || Array.isArray(H.resource) ? pick : [pick.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]];
    if (H.fmt === 'table') { summary.push(await harvestTable(key, H, d, T, resources)); continue; }
    summary.push(await harvestGeo(key, H, d, T, resources));
  }
  return summary;
}

// one spatial harvest (gpkg, shapefile zip, geojson, csv points): features that meet the zone, WGS84, a meta member.
// H.fileAs(r): an optional reader override that returns { layers, features } (lds-harvest-auto.mjs: zip entries, sheets).
let GEO_CTX = null;
export async function geoCtx() {
  if (GEO_CTX) return GEO_CTX;
  const { bngProjector } = await import('./lib.mjs'); const proj4 = (await import('proj4')).default;
  await bngProjector(); const P = proj4('EPSG:4326', 'BNG');
  const toWgs = ([e, n]) => { const [lon, lat] = P.inverse([e, n]); return [r6(lon), r6(lat)]; }, toBng = ([lon, lat]) => P.forward([lon, lat]);
  const BOXB = [ZONE_BNG.e0, ZONE_BNG.n0, ZONE_BNG.e1, ZONE_BNG.n1];
  const CWB = (() => { const a = toBng([CW_BOX[0], CW_BOX[1]]), b = toBng([CW_BOX[2], CW_BOX[3]]); return [a[0], a[1], b[0], b[1]]; })();
  return GEO_CTX = { toWgs, toBng, BOXB, CWB };
}
export async function harvestGeo(key, H, d, T, resources) {
  const { toWgs, toBng, BOXB, CWB } = await geoCtx();
  let feats = [], layers = [];
  const used = [];
  for (const r of resources) {
    const url = r.url || `${BASE}/download/${H.id}/${r.id}/${r.file}`, name = decodeURIComponent(url.split('/').pop());
    const raw = H.rawFile ? await H.rawFile(r, url, name) : await rawFile(`${H.id}/${name}`, url);
    used.push({ resource: r.id, file: name, url, size: r.size, resource_date: r.date, fetched: raw.fetched });
    let got;
    if (H.reader) got = await H.reader(raw.file, name, r);              // lds-harvest-auto.mjs: zip entries, geojson variants
    else if (H.fmt === 'gpkg') got = await readGpkg(raw.file);
    else if (H.fmt === 'shpzip') got = readShpZip(raw.file);
    else if (H.fmt === 'geojson') { const j = readJson(raw.file); const crs = j.crs?.properties?.name || ''; const srs = /27700/.test(crs) ? 27700 : 4326; got = { layers: [{ table: name, srs, crs }], features: j.features.map(f => ({ layer: name, srs, geom: f.geometry, props: f.properties || {} })) }; }
    else if (H.fmt === 'csv') {
      const rows = parseCsv(readFileSync(raw.file, 'utf8'));
      const cols = Object.keys(rows[0] || {});
      const [cx, cy] = H.xy || [cols.find(c => /^(lon|lng|long|longitude|easting)$/i.test(c)), cols.find(c => /^(lat|latitude|northing)$/i.test(c))];
      if (!cx || !cy) throw new Error(`${key}: no coordinate columns in ${cols.join(', ')}`);
      // CRS per row: |x| <= 180 and |y| <= 90 -> WGS84 longitude/latitude, else BNG metres (registers mix both)
      got = { layers: [{ table: name, srs: 'per row', columns: [cx, cy] }], features: rows.map(p => {
        const x = +p[cx], y = +p[cy], ok = p[cx] !== '' && p[cy] !== '' && isFinite(x) && isFinite(y) && x && y, wgs = Math.abs(x) <= 180 && Math.abs(y) <= 90;
        return { layer: name, srs: wgs ? 4326 : 27700, geom: ok ? { type: 'Point', coordinates: [x, y] } : null, props: p };
      }) };
    }
    if (H.skipLayers) { got.features = got.features.filter(f => !H.skipLayers.test(f.layer)); got.layers = got.layers.filter(l => !H.skipLayers.test(l.table)); }
    for (const f of got.features) feats.push({ ...f, resource: r.id }); layers.push(...got.layers);
  }
  // to BNG for the zone test, then WGS84 for the output
  const kept = [], dropped = new Set(); let noGeom = 0;
  for (const f of feats) {
    if (!f.geom) { noGeom++; continue; }
    // WGS84 rows far outside the zone are skipped before any transform (the local OSTN15 grid covers only the London area)
    if (f.srs === 4326) { const b = bboxOf(f.geom), m = 0.02; if (b[2] < ZONE_WGS84[0] - m || b[0] > ZONE_WGS84[2] + m || b[3] < ZONE_WGS84[1] - m || b[1] > ZONE_WGS84[3] + m) continue; }
    const gB = f.srs === 4326 ? mapPts(f.geom, c => toBng(c)) : f.geom;
    if (!meets(gB, BOXB)) continue;
    const { kept: props, dropped: dr } = cleanProps(f.props); dr.forEach(x => dropped.add(x));
    const bb = bboxOf(gB), inside = bb[0] >= BOXB[0] && bb[1] >= BOXB[1] && bb[2] <= BOXB[2] && bb[3] <= BOXB[3];
    // a UPRN that a spreadsheet rounded (1E+11, 200000000000): 9 or more digits ending in 5 or more zeros, or an exponent
    const uprnSuspect = Object.entries(props).some(([k, v]) => /uprn/i.test(k) && v != null && (/e\+/i.test(String(v)) || /^\d{4,}0{5,}$/.test(String(v))));
    kept.push({ type: 'Feature', properties: { ...(layers.length > 1 ? { layer: f.layer } : {}), ...props, ...(uprnSuspect ? { uprn_suspect: true } : {}), in_cw: meets(gB, CWB), whole_in_zone: inside },
      geometry: f.srs === 4326 ? mapPts(f.geom, ([x, y]) => [r6(x), r6(y)]) : mapPts(f.geom, toWgs) });
  }
  const lic = d.licence, licUrl = readJson(join(OUT, 'catalogue.json')).meta.licence_urls[lic] || null;
  const meta = {
    source: `London Datastore: ${d.title} (${d.publisher})`, dataset: H.id, page: `${BASE}/dataset/${d.slug}`, resources: used,
    licence: lic, licence_url: licUrl,
    attribution: (T.licence === 'ogl' ? `Contains public sector information licensed under the ${lic} (${d.publisher}).` : `${d.publisher}, ${lic}.`) + ' The GLA cannot warrant the quality or accuracy of the data (London Datastore terms).',
    dataset_modified: d.modified, update_frequency: d.update_frequency, geo: d.geo, theme: H.theme,
    layers, crs_source: [...new Set(layers.map(l => l.srs))].map(s => 'EPSG:' + s).join(', '), crs_output: 'EPSG:4326 (WGS84), 6 decimal places; BNG to WGS84 through the OS OSTN15 grid (lib.mjs bngProjector)',
    method: H.method ? H.method : `walk-london-datastore.mjs harvest ${key}: download ${H.all ? 'every ' + H.fmt + ' resource' : 'the newest matching resource'} (${H.fmt}); read every feature; keep a feature whose geometry meets the zone (the 3D model box, BNG E ${ZONE_BNG.e0}-${ZONE_BNG.e1}, N ${ZONE_BNG.n0}-${ZONE_BNG.n1}; WGS84 ${ZONE_WGS84.join(', ')}): a vertex inside, an edge crossing the box or the box inside a polygon. Whole geometries are kept (not cut at the box): whole_in_zone says whether all of it lies inside. in_cw: the geometry meets the Canary Wharf registry box ${CW_BOX.join(', ')}. Source attributes kept as published except fields matching ${DROP_FIELD.source}. uprn_suspect: a UPRN field that a spreadsheet rounded (an exponent, or 9+ digits ending in 5+ zeros); not a key (fault F22).${H.fmt === 'csv' ? ` Points from the columns ${(H.xy || ['longitude/easting', 'latitude/northing']).join(', ')}; a row is WGS84 when |x| <= 180 and |y| <= 90, else BNG; rows with no coordinates are counted as no_geometry.` : ''}`,
    counts: { source_features: feats.length, no_geometry: noGeom, in_zone: kept.length, in_cw: kept.filter(f => f.properties.in_cw).length,
      ...(kept.some(f => Object.keys(f.properties).some(k => /uprn/i.test(k))) ? { with_uprn: kept.filter(f => Object.entries(f.properties).some(([k, v]) => /^(os_addressbase_)?uprn$/i.test(k) && v)).length, uprn_suspect: kept.filter(f => f.properties.uprn_suspect).length } : {}) },
    attributes_in_source: Object.keys(feats.find(f => f.geom)?.props || {}).filter(k => !/^(fid|objectid|shape_length|shape_area)$/i.test(k)).length ? 'yes' : 'none (geometry and object ids only)',
    fields_dropped: [...dropped],
    ...(H.metaExtra || {}),
  };
  if (H.onKept) H.onKept(kept, meta);
  const dir = join(OUT, key); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, key + '.geojson'), '{"type":"FeatureCollection","meta":' + JSON.stringify(meta, null, 1) + ',\n"features":[\n' + kept.map(f => JSON.stringify(f)).join(',\n') + '\n]}\n');
  console.log(key, H.id, JSON.stringify(meta.counts));
  return [key, H.id, lic, meta.counts];
}

// ================================================================== refs: the zone's codes, postcodes and UPRNs
// Out: feeds/london-datastore/zone-codes.json (committed) and data/raw/london-datastore/zone-uprns.txt (cache).
const ONSPD = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/ONS_Postcode_Directory_(August_2026)_(Hosted_Table)/FeatureServer/0';
// postcode districts that meet the 3D model box (each row is then tested by its own grid reference)
const ZONE_DISTRICTS = ['E1', 'E1W', 'E2', 'E3', 'E14', 'E15', 'E16', 'EC2M', 'EC2N', 'EC2R', 'EC2V', 'EC3A', 'EC3M', 'EC3N', 'EC3R', 'EC3V', 'EC4N', 'EC4R', 'EC4V', 'SE1', 'SE4', 'SE5', 'SE8', 'SE10', 'SE14', 'SE15', 'SE16', 'SE17'];
const ONSPD_CODES = ['oa01cd', 'lsoa01cd', 'msoa01cd', 'oa11cd', 'lsoa11cd', 'msoa11cd', 'oa21cd', 'lsoa21cd', 'msoa21cd', 'wd26cd', 'wdstl05cd', 'lad26cd'];
const BOUNDARY_FILES = [                 // 20od9 Statistical GIS Boundary Files for London (OGL v3): codes of areas that meet the box
  ['LB_LSOA2021_shp.zip', null], ['LB_MSOA2021_shp.zip', null], ['statistical-gis-boundaries-london.zip', '2011'], ['London-wards-2014.zip', 'ward2014'], ['London-wards-2018.zip', 'ward2018']];
async function refs() {
  const { bngProjector } = await import('./lib.mjs'); await bngProjector();
  const [e0, n0, e1, n1] = [532400, 176700, 539900, 182300];
  const codes = {}, names = {}, postcodes = [], add = (k, c) => (codes[k] ||= new Set()).add(c);
  // 1. ONSPD (August 2026): ids per district, then rows in batches; keep rows whose grid reference is in the box
  let nRows = 0;
  for (const dist of ZONE_DISTRICTS) {
    const ids = JSON.parse(await politeFetch(`${ONSPD}/query?where=${encodeURIComponent(`pcds LIKE '${dist} %'`)}&returnIdsOnly=true&f=json`)).objectIds || [];
    for (let i = 0; i < ids.length; i += 200) {
      const j = JSON.parse(await politeFetch(`${ONSPD}/query?objectIds=${ids.slice(i, i + 200).join(',')}&outFields=pcds,east1m,north1m,doterm,${ONSPD_CODES.join(',')}&f=json`));
      for (const { attributes: a } of j.features || []) {
        nRows++;
        if (!(a.east1m >= e0 && a.east1m <= e1 && a.north1m >= n0 && a.north1m <= n1)) continue;
        postcodes.push(a.pcds);
        for (const k of ONSPD_CODES) if (a[k] && /^E0[0125]\d{6}$/.test(a[k])) add(k.replace(/cd$/, '').replace(/^wd26$/, 'ward2026'), a[k]);
      }
    }
    console.log('onspd', dist, ids.length, 'postcodes; zone so far', postcodes.length);
  }
  // 2. boundary files (BNG shapefiles): the codes of polygons that meet the box
  const used = [];
  const cat = readJson(join(OUT, 'catalogue.json')).datasets.find(d => d.id === '20od9');
  for (const [fileName, vintage] of BOUNDARY_FILES) {
    const r = cat.resources.find(x => decodeURIComponent(x.file || '') === fileName); if (!r) throw new Error('20od9: no ' + fileName);
    const url = `${BASE}/download/20od9/${r.id}/${r.file}`, raw = await rawFile(`20od9/${fileName}`, url);
    used.push({ file: fileName, url, resource_date: r.date, fetched: raw.fetched });
    const got = readShpZip(raw.file, { skipBad: true });
    for (const f of got.features) {
      if (!f.geom || f.srs !== 27700 || !meets(f.geom, [e0, n0, e1, n1])) continue;
      const lay = f.layer.toLowerCase();
      for (const [k, v] of Object.entries(f.props)) {
        if (typeof v !== 'string' || !/^E0[0125]\d{6}$/.test(v)) continue;
        const t = v.startsWith('E00') ? 'oa' : v.startsWith('E01') ? 'lsoa' : v.startsWith('E02') ? 'msoa' : 'ward';
        const yr = /(\d\d)cd$/i.exec(k)?.[1];
        const key = vintage && vintage.startsWith('ward') ? (t === 'ward' ? vintage : t + '11') : yr ? t + yr : t === 'ward' ? 'ward2011' + (/citymerged/.test(lay) ? '' : '') : t + '11';
        add(key, v);
        // the name beside the code (LSOA21CD -> LSOA21NM, GSS_CODE -> NAME)
        const nmKey = Object.keys(f.props).find(kk => /cd$/i.test(k) && kk.toLowerCase() === k.toLowerCase().replace(/cd$/, 'nm')) || (/gss_code/i.test(k) ? Object.keys(f.props).find(kk => /^name$/i.test(kk)) : null);
        const nm = nmKey && typeof f.props[nmKey] === 'string' ? f.props[nmKey] : null;
        if (nm && !/^[EW]\d{8}$/.test(nm) && !names[v] && (t === 'ward' || t === 'msoa')) names[v] = nm;
      }
    }
  }
  // 3. zone UPRNs from OS Open UPRN (registry raw cache) -> raw cache only (derivable; not committed)
  const zipU = join(RAW, 'registry', 'osopenuprn_202609_csv.zip'); let nU = 0;
  const lines = f => readFileSync(f, 'utf8').split('\n').filter(Boolean).length;
  if (existsSync(join(RAWDIR, 'zone-uprns.txt')) && !REFRESH) nU = lines(join(RAWDIR, 'zone-uprns.txt'));
  else if (existsSync(zipU)) {
    const inner = execFileSync('unzip', ['-Z1', zipU], { encoding: 'utf8' }).split('\n').find(n => /\.csv$/i.test(n));
    const out = execFileSync('sh', ['-c', `unzip -p "$0" "$1" | awk -F, 'NR>1 && $2>=${e0} && $2<=${e1} && $3>=${n0} && $3<=${n1} {print $1}'`, zipU, inner], { maxBuffer: 1 << 28, encoding: 'utf8' });
    writeFileSync(join(RAWDIR, 'zone-uprns.txt'), out); nU = out.split('\n').filter(Boolean).length;
  } else console.warn('no OS Open UPRN zip at', zipU, '- zone UPRN test disabled');
  // 4. zone TOIDs: the MasterMap TopographicArea TOIDs of the zone UPRNs (OS LIDS BLPU-UPRN-TopographicArea-TOID-5) -> raw cache;
  // used to clip datasets keyed by TOID (London Solar Opportunity Map). A building with no UPRN has no TOID here.
  const lids = readdirSync(join(RAW, 'registry')).filter(f => /^lids-.*BLPU-UPRN-TopographicArea-TOID-5\.zip$/.test(f)).sort().pop(); let nT = 0;
  if (existsSync(join(RAWDIR, 'zone-toids.txt')) && !REFRESH) nT = lines(join(RAWDIR, 'zone-toids.txt'));
  else if (lids && nU) {
    execFileSync('sh', ['-c', `unzip -p "$0" BLPU_UPRN_TopographicArea_TOID_5.csv | awk -F, 'NR==FNR {u[$1]=1; next} ($2 in u) {print $5}' "$1" - | sort -u > "$2"`, join(RAW, 'registry', lids), join(RAWDIR, 'zone-uprns.txt'), join(RAWDIR, 'zone-toids.txt')]);
    nT = readFileSync(join(RAWDIR, 'zone-toids.txt'), 'utf8').split('\n').filter(Boolean).length;
  } else console.warn('no OS LIDS UPRN-TOID zip in', join(RAW, 'registry'), '- zone TOID list not made');
  // 5. old ward codes (2003 CAS wards wdcas03cd, 2005 statistical wards wdstl05cd, form 00BGGG) of the zone postcodes
  await oldWards(codes);
  const meta = {
    made: today, tool: 'tools/walk-london-datastore.mjs refs',
    zone: 'the 3D model box, BNG E 532400-539900, N 176700-182300 (WGS84 -0.095, 51.474 to 0.015, 51.522)',
    method: 'A code is a zone code when (a) a live or terminated postcode of ONSPD August 2026 whose grid reference (east1m, north1m) lies in the box carries it (oa/lsoa/msoa 2001, 2011, 2021; ward2026 = wd26cd; ward2003 = the 2003 CAS ward codes wdcas03cd and 2005 statistical ward codes wdstl05cd, form 00BGGG, used by 2001 Census and 2000s ward tables), or (b) its polygon in the London Datastore Statistical GIS Boundary Files (20od9) meets the box (vertex inside, edge crossing or box inside): LSOA and MSOA 2021, OA/LSOA/MSOA 2011 and wards 2011 (statistical-gis-boundaries-london.zip), wards 2014 and 2018. postcodes = ONSPD postcodes with the grid reference in the box (districts ' + ZONE_DISTRICTS.join(', ') + '). Zone UPRNs (OS Open UPRN 2026-09, X/Y in the box): ' + nU + '; zone TOIDs (OS LIDS UPRN to TopographicArea TOID of those UPRNs): ' + nT + '; both in the raw cache, not committed.',
    sources: [{ name: 'ONS Postcode Directory (August 2026)', url: ONSPD, licence: 'Open Government Licence v3.0', attribution: 'Contains OS data (c) Crown copyright and database right 2026; Contains Royal Mail data (c) Royal Mail copyright and database right 2026; Source: Office for National Statistics licensed under the Open Government Licence v.3.0', rows_read: nRows },
      { name: 'Statistical GIS Boundary Files for London (London Datastore 20od9)', page: `${BASE}/dataset/statistical-gis-boundary-files-london-20od9`, licence: 'Open Government Licence v3.0', attribution: 'Contains National Statistics data (c) Crown copyright and database right; Contains OS data (c) Crown copyright and database right. The GLA cannot warrant the quality or accuracy of the data.', files: used },
      { name: 'OS Open UPRN (2026-09)', licence: 'Open Government Licence v3.0', note: 'zone UPRN list in the raw cache only' },
      { name: 'OS Open Linked Identifiers, BLPU UPRN to TopographicArea TOID (2026-09)', licence: 'Open Government Licence v3.0', note: 'zone TOID list in the raw cache only' }],
    counts: { postcodes: postcodes.length, zone_uprns: nU, zone_toids: nT, ...Object.fromEntries(Object.entries(codes).map(([k, v]) => [k, v.size])) },
  };
  const o = { meta, codes: Object.fromEntries(Object.entries(codes).sort().map(([k, v]) => [k, [...v].sort()])), names: Object.fromEntries(Object.entries(names).sort()), postcodes: [...new Set(postcodes)].sort() };
  writeFileSync(join(OUT, 'zone-codes.json'), JSON.stringify(o, null, 0).replace(/\],"/g, '],\n"') + '\n');
  console.log(JSON.stringify(meta.counts));
}

// the zone's old ward codes (00BGGG form: 2003 CAS wards and 2005 statistical wards) from ONSPD, one query with
// distinct values over the zone box; refs-old-wards adds them to an existing zone-codes.json (2026-10-04)
async function oldWards(codes) {
  const where = 'east1m>=532400 AND east1m<=539900 AND north1m>=176700 AND north1m<=182300';
  const j = JSON.parse(await politeFetch(`${ONSPD}/query?where=${encodeURIComponent(where)}&outFields=wdstl05cd,wdcas03cd&returnDistinctValues=true&returnGeometry=false&f=json`));
  if (j.exceededTransferLimit) throw new Error('ONSPD distinct old wards: transfer limit exceeded');
  const set = codes.ward2003 = new Set();
  for (const { attributes: a } of j.features || []) for (const v of [a.wdstl05cd, a.wdcas03cd]) if (v && /^\d\d[A-Z]{4}$/.test(v)) set.add(v);
  // 2011 Census merged wards (E36, the ward unit of the 2011 Census ward tables): the merged wards of the zone's 2011 wards
  // (ONS lookup WD11_CMWD11_LAD11_EW_LU)
  const w11 = [...(codes.ward2011 || [])];
  if (w11.length) {
    const L = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/WD11_CMWD11_LAD11_EW_LU_e98db71f1e0444b59634405f30034c70/FeatureServer/0/query';
    const jl = JSON.parse(await politeFetch(`${L}?where=${encodeURIComponent(`WD11CD IN (${w11.map(c => `'${c}'`).join(',')})`)}&outFields=WD11CD,CMWD11CD&returnGeometry=false&f=json`));
    codes.cmwd2011 = new Set((jl.features || []).map(f => f.attributes.CMWD11CD).filter(v => /^E36\d{6}$/.test(v)));
  }
  return set;
}
async function refsOldWards() {
  const f = join(OUT, 'zone-codes.json'), z = readJson(f), codes = { ward2011: new Set(z.codes.ward2011) };
  const set = await oldWards(codes);
  z.codes.ward2003 = [...set].sort(); z.meta.counts.ward2003 = set.size;
  z.codes.cmwd2011 = [...codes.cmwd2011].sort(); z.meta.counts.cmwd2011 = codes.cmwd2011.size;
  if (!/cmwd2011/.test(z.meta.method)) z.meta.method += ' cmwd2011 = the 2011 Census merged wards (E36) of the zone 2011 wards (ONS lookup WD11_CMWD11_LAD11_EW_LU); added 2026-10-04 by refs-old-wards.';
  z.meta.method = z.meta.method.replace('ward_stat2005 = wdstl05cd', 'ward2003 = the 2003 CAS ward codes wdcas03cd and 2005 statistical ward codes wdstl05cd, form 00BGGG, used by 2001 Census and 2000s ward tables; added 2026-10-04 by refs-old-wards');
  z.codes = Object.fromEntries(Object.entries(z.codes).sort());
  writeFileSync(f, JSON.stringify(z, null, 0).replace(/\],"/g, '],\n"') + '\n');
  console.log('ward2003', set.size);
}
// ================================================================== probe: area detection inside the data
// For every open dataset whose metadata area is unknown, borough or London-wide: sample up to CAPS.perDataset
// machine-readable resources within the size caps and classify the area found in the data (lds-probe.mjs).
// Out: feeds/london-datastore/probe.json. Raw samples in data/raw/london-datastore/probe/<id>/ (reused).
async function probe(only) {
  const P = await import('./lds-probe.mjs');
  const refsZ = P.loadRefs(join(OUT, 'zone-codes.json'), join(RAWDIR, 'zone-uprns.txt'));
  const cat = readJson(join(OUT, 'catalogue.json')).datasets, tri = readJson(join(OUT, 'triage.json')).datasets;
  const outFile = join(OUT, 'probe.json');
  const prev = existsSync(outFile) && !REFRESH && !args.includes('--rescan') ? readJson(outFile).datasets : {};   // --rescan: re-read the cached samples
  const targets = cat.filter(d => only.length ? only.includes(d.id) : tri[d.id].open && !tri[d.id].sensitive && PROBE_RELEVANCE.includes(tri[d.id].relevance));
  const res = { ...prev }; let bytes = 0, k = 0;
  const save = () => writeFileSync(outFile, '{"meta":' + JSON.stringify(probeMeta(P, res), null, 1) + ',\n"datasets":{\n' + Object.entries(res).sort((a, b) => a[0].localeCompare(b[0])).map(([id, v]) => JSON.stringify(id) + ':' + JSON.stringify(v)).join(',\n') + '\n}}\n');
  for (const d of targets) {
    k++;
    if (res[d.id] && !only.length) continue;
    const S = P.newSignals(), sampled = [], skipped = [];
    // candidate resources: readable formats; names with a finer-area word first, then CSV, sheets, zip, gpkg; newest first
    const fine = /lsoa|msoa|ward|\boa\b|output.?area|postcode|point|site|location|address|uprn|toid|grid|_shp|gis|boundar/i;
    const order = { text: 0, sheet: 1, gpkg: 2, zip: 3 };
    const cands = d.resources.filter(r => P.READABLE[r.format]).sort((a, b) => (fine.test(b.file || '') - fine.test(a.file || '')) || (order[P.READABLE[a.format]] - order[P.READABLE[b.format]]) || (b.date || '').localeCompare(a.date || ''));
    for (const r of cands) {
      if (sampled.length >= P.CAPS.perDataset) break;
      const how = P.READABLE[r.format], cap = how === 'text' ? P.CAPS.text : P.CAPS[how];
      if (how !== 'text' && r.size > cap) { skipped.push({ resource: r.id, file: r.file ? decodeURIComponent(r.file) : r.url, size: r.size, reason: `over the ${how} cap (${cap / 1e6} MB)` }); continue; }
      const url = r.url || `${BASE}/download/${d.id}/${r.id}/${r.file}`;
      let name = (r.file || url.split('/').pop()).replace(/[^A-Za-z0-9._%-]/g, '_'); try { name = decodeURIComponent(name).replace(/[^A-Za-z0-9._ -]/g, '_'); } catch { }
      const f = join(RAWDIR, 'probe', d.id, r.id.slice(0, 8) + '-' + name.slice(-80) + (how === 'text' ? '.head' : ''));
      const rec = { resource: r.id, file: name, format: r.format, size: r.size, date: r.date };
      let buf;
      if (existsSync(f) && statSync(f).size > 0) { buf = readFileSync(f); rec.cached = true; }
      else {
        const g = await politeGet(url, { maxBytes: how === 'text' ? P.CAPS.text : Infinity });
        rec.http = g.status;
        if (!g.buf) { sampled.push(rec); continue; }
        buf = g.buf; rec.partial = g.partial; mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, buf); bytes += buf.length;
      }
      rec.bytes_read = buf.length;
      try {
        if (how === 'text') P.readTextSample(S, refsZ, buf, r.format, name);
        else if (how === 'sheet') Object.assign(rec, await P.readSheet(S, refsZ, buf, name));
        else if (how === 'gpkg') Object.assign(rec, await P.readGpkgSample(S, refsZ, f, name));
        else if (how === 'zip') Object.assign(rec, await P.readZip(S, refsZ, f, name));
      } catch (e) { rec.error = e.message.slice(0, 160); }
      // disk: whole files over 5 MB are not kept after reading (the result is in probe.json; --refresh re-reads)
      if (how !== 'text' && buf.length > 5e6 && !rec.cached) { rmSync(f, { force: true }); rec.cache = 'not kept (over 5 MB)'; }
      sampled.push(rec);
      if (P.classify(S).area.startsWith('zone-')) break;               // a zone signal: enough
    }
    const fmts = [...new Set(d.resources.map(r => r.format))];
    const c = sampled.some(s => s.bytes_read) ? P.classify(S) : { area: 'not-read', rule: !d.resources.length ? 'no resources (links only)' : !cands.length ? `no readable data resource (formats: ${fmts.join(', ') || 'none'})` : skipped.length && !sampled.length ? 'every readable resource is over the size cap' : 'every request failed', evidence: sampled.map(s => `${s.file}: HTTP ${s.http}`).join('; ') || skipped.map(s => `${s.file} ${s.size} bytes: ${s.reason}`).join('; ') };
    res[d.id] = { title: d.title, relevance_meta: tri[d.id].relevance, ...c, sampled, ...(skipped.length ? { skipped } : {}), signals: sampled.some(s => s.bytes_read) ? P.finishSignals(S) : undefined };
    if (k % 10 === 0) { save(); console.log(`probe ${k}/${targets.length} ${d.id} ${c.area} | ${(bytes / 1e6).toFixed(0)} MB new`); }
    if (bytes > 3e9) { console.warn('stop: 3 GB read in this run (disk and politeness); run again to continue'); break; }
  }
  save();
  const counts = {}; for (const v of Object.values(res)) counts[v.area] = (counts[v.area] || 0) + 1;
  console.log('probe done', JSON.stringify(counts), `${(bytes / 1e6).toFixed(0)} MB new`);
}
const PROBE_RELEVANCE = ['unknown', 'london-borough', 'london-coarse'];
function probeMeta(P, res) {
  const counts = {}; for (const v of Object.values(res)) counts[v.area] = (counts[v.area] || 0) + 1;
  return {
    made: today, tool: 'tools/walk-london-datastore.mjs probe (readers and rules in tools/lds-probe.mjs)',
    targets: `open, not sensitive datasets whose metadata relevance is ${PROBE_RELEVANCE.join(', ')} (triage.json before the probe)`,
    caps: P.CAPS, readable_formats: P.READABLE,
    selection: `up to ${P.CAPS.perDataset} readable resources per dataset: file names with a finer-area word (lsoa, msoa, ward, oa, postcode, point, site, location, address, uprn, toid, grid, gis, boundary) first, then csv/txt/json/xml, sheets, gpkg, zip; newest first; stop at the first zone signal. Documents (pdf, docx, images, audio) are not opened.`,
    rules: P.AREA_RULES.map(([k, v]) => `${k}: ${v}`),
    references: 'feeds/london-datastore/zone-codes.json (zone OA/LSOA/MSOA/ward codes and postcodes); zone UPRNs from OS Open UPRN in the raw cache; boroughs: E09 codes and the 33 names; zone boroughs ' + P.ZONE_BOROUGH_CODES.join(', '),
    note: 'A sample is a sample: a London-wide file sorted by code may hold zone rows after the first 1 MB (then london-fine, not zone-code). The evidence string says how many rows were read.',
    counts,
  };
}

// ---- tabular harvest: the rows of a table whose area code is a zone code (zone-codes.json), with the header rows.
// Sheets (xlsx, xls, ods) through SheetJS, CSV streamed line by line (large files are not kept: rows are filtered on
// the way). H.codes: the code types to match (e.g. ['lsoa21'] or ['ward2026', 'ward2018']).
async function harvestTable(key, H, d, T, resources) {
  const zc = readJson(join(OUT, 'zone-codes.json'));
  H.codes ||= [];
  const byToid = H.codes.includes('toid');
  // ward tables give the City of London as one row (E09000001), not its 25 wards: that row is a zone row
  const cityRow = H.codes.some(k => k.startsWith('ward'));
  const zone = H.xy ? new Set(['box']) : byToid ? new Set(readFileSync(join(RAWDIR, 'zone-toids.txt'), 'utf8').split('\n').filter(Boolean)) : new Set(H.codes.flatMap(k => zc.codes[k] || []));
  if (!zone.size) throw new Error(`${key}: no zone codes of type ${H.codes}`);
  if (cityRow) zone.add('E09000001');
  const KEY_RE = byToid ? /osgb\d{10,16}/ : cityRow ? /E0(?:[0125]\d{6}|9000001)/ : /E0[0125]\d{6}/;
  const codeRe = cityRow ? /^E0[01259]\d{6}$/ : /^E0[0125]\d{6}$/;
  const tables = [], used = []; let nRows = 0, nZone = 0;
  const XLSX = (await import('xlsx')).default;
  for (const r of resources) {
    const url = r.url || `${BASE}/download/${H.id}/${r.id}/${r.file}`, name = decodeURIComponent(url.split('/').pop());
    let rowsets = [];
    if (r.format === 'zip' && H.zipEntry) {
      // a CSV inside a zip, rows kept by their own easting/northing in the zone box (H.xy columns)
      const raw = await rawFile(`${H.id}/${name}`, url);
      used.push({ resource: r.id, file: name, entry: H.zipEntry, url, size: r.size, resource_date: r.date, fetched: raw.fetched });
      const { spawn } = await import('child_process'); const { createInterface } = await import('readline');
      const rl = createInterface({ input: spawn('unzip', ['-p', raw.file, H.zipEntry]).stdout, crlfDelay: Infinity });
      let header = null, ix, iy; const rows = [];
      for await (const line of rl) {
        if (!header) { header = parseCsvLine(line); ix = header.indexOf(H.xy[0]); iy = header.indexOf(H.xy[1]); if (ix < 0 || iy < 0) throw new Error(`${key}: no ${H.xy} in ${header}`); continue; }
        nRows++; const v = parseCsvLine(line), x = +v[ix], y = +v[iy];
        if (x >= ZONE_BNG.e0 && x <= ZONE_BNG.e1 && y >= ZONE_BNG.n0 && y <= ZONE_BNG.n1) rows.push(v.map(c => c !== '' && isFinite(c) && !/^0\d/.test(c) && !/^E0|^osgb/.test(c) ? +c : c));
      }
      // columns that repeat what another column or a join gives (H.drop) are left out to keep the file small
      const keep = header.map((h, i) => (H.drop || []).includes(h) ? -1 : i).filter(i => i >= 0);
      rowsets.push({ name: `${name}/${H.zipEntry}`, header: [keep.map(i => header[i])], rows: rows.map(r => keep.map(i => r[i])) });
    } else if (r.format === 'csv') {
      // stream: keep the first line (header) and the rows whose first code cell is a zone code
      const f = join(RAWDIR, H.id, name + '.zone.csv'); let lines;
      if (existsSync(f) && !REFRESH) { lines = readFileSync(f, 'utf8').split('\n').filter(Boolean); nRows += +(existsSync(f + '.count') ? readFileSync(f + '.count', 'utf8') : 0); }
      else {
        lines = []; let head = null, rest = ''; const nBefore = nRows;
        const res = await politeStream(url, chunk => {
          rest += chunk; const parts = rest.split(/\r?\n/); rest = parts.pop();
          for (const line of parts) { if (head == null) { head = line; lines.push(line); continue; } nRows++; const m = KEY_RE.exec(line); if (m && zone.has(m[0])) lines.push(line); }
        });
        if (rest && head != null) { nRows++; const m = KEY_RE.exec(rest); if (m && zone.has(m[0])) lines.push(rest); }
        mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, lines.join('\n') + '\n'); writeFileSync(f + '.count', String(nRows - nBefore));
        used.push({ resource: r.id, file: name, url, size: r.size, resource_date: r.date, fetched: today, http: res.status });
      }
      const parsed = lines.map(l => parseCsvLine(l));
      rowsets.push({ name, header: [parsed[0]], rows: parsed.slice(1) });
      if (!used.find(u => u.resource === r.id)) used.push({ resource: r.id, file: name, url, size: r.size, resource_date: r.date, fetched: statSync(f).mtime.toISOString().slice(0, 10) });
    } else {
      const raw = await rawFile(`${H.id}/${name}`, url);
      used.push({ resource: r.id, file: name, url, size: r.size, resource_date: r.date, fetched: raw.fetched });
      const wb = XLSX.read(readFileSync(raw.file), { type: 'buffer', dense: true });
      for (const sn of wb.SheetNames) {
        const all = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false });
        const isCodeRow = row => (row || []).some(v => typeof v === 'string' && codeRe.test(v.trim()));
        const first = all.findIndex(isCodeRow); if (first < 0) continue;
        nRows += all.length - first;
        rowsets.push({ name: `${name}#${sn}`, header: all.slice(Math.max(0, first - 3), first), rows: all.slice(first).filter(row => (row || []).some(v => typeof v === 'string' && zone.has(v.trim()))) });
      }
    }
    for (const t of rowsets) { nZone += t.rows.length; tables.push({ table: t.name, header_rows: t.header, rows: t.rows }); }
  }
  const lic = d.licence, licUrl = readJson(join(OUT, 'catalogue.json')).meta.licence_urls[lic] || null;
  const meta = {
    source: `London Datastore: ${d.title} (${d.publisher})`, dataset: H.id, page: `${BASE}/dataset/${d.slug}`, resources: used, licence: lic, licence_url: licUrl,
    attribution: (T.licence === 'ogl' ? `Contains public sector information licensed under the ${lic} (${d.publisher}).` : `${d.publisher}, ${lic}.`) + (H.extraAttribution ? ' ' + H.extraAttribution : '') + ' The GLA cannot warrant the quality or accuracy of the data (London Datastore terms).',
    dataset_modified: d.modified, geo: d.geo, theme: H.theme,
    method: `walk-london-datastore.mjs harvest ${key}: ${resources.length} resources (${[...new Set(resources.map(r => r.format))].join(', ')}); ${H.xy ? `a row is kept when its own ${H.xy.join('/')} (BNG metres) lie in the 3D model box (E ${ZONE_BNG.e0}-${ZONE_BNG.e1}, N ${ZONE_BNG.n0}-${ZONE_BNG.n1}); numeric cells are written as numbers` : byToid ? 'a row is kept when its TOID is a zone TOID (the OS MasterMap TopographicArea TOIDs of the OS Open UPRN points in the 3D model box, through OS Open Linked Identifiers; a building with no UPRN is missed)' : `a row is kept when a cell holds a zone code of type ${H.codes.join(' or ')} (feeds/london-datastore/zone-codes.json: areas that meet the 3D model box or hold a zone postcode)`}. ${cityRow ? 'Ward tables give the City of London as one row (E09000001), kept as a zone row. ' : ''}Sheets: the up to 3 rows above the first coded row are kept as header_rows. CSV: streamed; the first line is the header; a row is kept by its first ${byToid ? 'TOID (osgb...)' : 'E00/E01/E02/E05 code'}.`,
    ...(H.drop ? { columns_dropped: H.drop, columns_dropped_why: H.dropWhy } : {}),
    counts: { source_rows: nRows, zone_rows: nZone, tables: tables.length, zone_codes_of_type: zone.size },
  };
  const dir = join(OUT, key); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, key + '.json'), '{"meta":' + JSON.stringify(meta, null, 1) + ',\n"tables":[\n' + tables.map(t => JSON.stringify({ table: t.table, header_rows: t.header_rows }).slice(0, -1) + ',"rows":[\n' + t.rows.map(r => JSON.stringify(r)).join(',\n') + '\n]}').join(',\n') + '\n]}\n');
  console.log(key, H.id, JSON.stringify(meta.counts));
  return [key, H.id, lic, meta.counts];
}
export function parseCsvLine(l) { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map(v => v.replace(/^\uFEFF/, '')); }
// a streamed GET in the polite queue: onText(chunk) per decoded chunk; nothing is kept but what the callback keeps
export function politeStream(url, onText, { minGapMs = 1100 } = {}) {
  const run = async () => {
    const wait = last + minGapMs - Date.now(); if (wait > 0) await sleep(wait);
    last = Date.now(); nReq++;
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    const dec = new TextDecoder('utf-8'); let n = 0;
    for await (const chunk of r.body) { n += chunk.length; onText(dec.decode(chunk, { stream: true })); }
    onText(dec.decode()); last = Date.now(); return { status: r.status, bytes: n };
  };
  const p = chain.then(run, run); chain = p.catch(() => {}); return p;
}

// ================================================================== main (only when run as a script: lds-harvest-auto.mjs imports this file and runs on its own)
const isMain = import.meta.url === (await import('url')).pathToFileURL(process.argv[1] || '').href;
const cmd = isMain ? args[0] : null;
if (cmd === 'walk') await walk();
else if (cmd === 'triage') triage();
else if (cmd === 'harvest') await harvest(args.slice(1).filter(a => !a.startsWith('--')));
else if (cmd === 'refs') await refs();
else if (cmd === 'refs-old-wards') await refsOldWards();
else if (cmd === 'probe') await probe(args.slice(1).filter(a => !a.startsWith('--')));
else if (isMain) { console.log('usage: walk-london-datastore.mjs walk [--details] [--refresh] | triage | harvest [key ...] [--refresh]\nharvest keys: ' + Object.keys(HARVEST).join(' ')); }
