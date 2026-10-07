#!/usr/bin/env node
// Index of works in progress (construction sites) in the Docklands zone: one record per site, from the Planning London
// Datahub (borough applications with the London Development Database commencement and completion fields), joined to
// NOTAM cranes, Street Manager highway activities, OSM construction areas, the brownfield register, site allocations,
// Wikidata items, and facts from crawled developer pages and the owner's photos.
//
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/build-construction-index.mjs            # fetch what is not cached, build
//   node magpie/cwplans/tools/build-construction-index.mjs --no-fetch                      # build from the caches only
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/build-construction-index.mjs --refresh  # fetch again
//
// In:   Planning London Datahub (POST, one query), QLever (one query), data/raw/docklands/greater_london-latest.osm.pbf,
//       feeds/live/notams.json, feeds/works/street-manager-activities.json, feeds/london-datastore/{brownfield-register,
//       site-allocations}/, registry/sources/construction/facts.json (hand-written).
// Out:  registry/sources/construction/sites.json. Raw: data/raw/construction/ (gitignored).
// Zone: the 3D model box plus the east margin (fetch-works.mjs MODEL and EAST).
// Method, status and match rules, confidence, traps and gaps: skill cwplans-construction
// (magpie/cwplans/skills/cwplans-construction/SKILL.md); README: registry/sources/construction/README.md.
import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { TOOLS, RAW, UA, qlever, bngProjector, pointIn, polyArea } from './lib.mjs';
import { cwPath } from './londat.mjs';
import { BOX_WGS84 } from './fetch-docklands.mjs';

const CW = join(TOOLS, '..');
const OUT = join(CW, 'registry/sources/construction/sites.json');
const RAWC = join(RAW, 'construction');
const MODEL = BOX_WGS84, EAST = [0.015, 51.495, 0.085, 51.522];
const NOFETCH = process.argv.includes('--no-fetch'), REFRESH = process.argv.includes('--refresh');
const TODAY = new Date().toISOString().slice(0, 10);
const addYears = (iso, y) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + y); return d.toISOString().slice(0, 10); };
// status windows (written rules; see the skill)
const RECENT_COMPLETION = addYears(TODAY, -2), STALE_COMMENCEMENT = addYears(TODAY, -7), RECENT_DECISION = addYears(TODAY, -5);
const PLD = 'https://planningdata.london.gov.uk/api-guest/applications/_search';
const readJ = p => JSON.parse(readFileSync(cwPath(p), 'utf8'));   // cwPath: London Datastore files are in the londat checkout
const r6 = v => Math.round(v * 1e6) / 1e6, r1 = v => Math.round(v * 10) / 10;
const dmy = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const inZone = (lat, lon) => (lon >= MODEL[0] && lon <= MODEL[2] && lat >= MODEL[1] && lat <= MODEL[3]) ? 'model'
  : (lon >= EAST[0] && lon <= EAST[2] && lat >= EAST[1] && lat <= EAST[3]) ? 'east' : null;

async function cached(name, fetcher) {
  const f = join(RAWC, name);
  if (existsSync(f) && !REFRESH) return JSON.parse(readFileSync(f, 'utf8'));
  if (NOFETCH) throw new Error(`--no-fetch and no cache ${f}`);
  mkdirSync(RAWC, { recursive: true });
  const v = await fetcher(); writeFileSync(f, JSON.stringify(v)); return v;
}

// ---------------------------------------------------------------- Planning London Datahub
const PLD_FIELDS = ['id', 'lpa_name', 'borough', 'lpa_app_no', 'status', 'decision', 'decision_date', 'valid_date', 'lapsed_date', 'actual_commencement_date',
  'actual_completion_date', 'site_name', 'site_number', 'street_name', 'secondary_street_name', 'postcode', 'ward', 'description', 'centroid', 'wgs84_polygon',
  'application_type', 'application_type_full', 'development_type', 'url_planning_app', 'last_updated', 'uprn', 'reference_no_of_permission_being_relied_on',
  'application_details.scheme_name', 'application_details.building_details', 'application_details.residential_details.total_no_proposed_residential_units',
  'application_details.residential_details.site_area', 'application_details.non_residential_details.total_gia_gained', 'application_details.non_residential_details.site_area'];
const PLD_QUERY = { size: 10000, track_total_hits: true, _source: PLD_FIELDS, query: { bool: {
  must: [{ geo_bounding_box: { centroid: { top_left: { lat: MODEL[3], lon: MODEL[0] }, bottom_right: { lat: MODEL[1], lon: EAST[2] } } } }],
  should: [
    { range: { 'application_details.residential_details.total_no_proposed_residential_units': { gte: 10 } } },
    { range: { 'application_details.non_residential_details.total_gia_gained': { gte: 1000 } } },
  ], minimum_should_match: 1 } } };
async function fetchPLD() {
  const r = await fetch(PLD, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/json' }, body: JSON.stringify(PLD_QUERY) });
  if (!r.ok) throw new Error(`PLD ${r.status}`);
  const j = await r.json();
  return { fetched: new Date().toISOString(), total: j.hits.total, hits: j.hits.hits.map(h => h._source) };
}

// ---------------------------------------------------------------- OSM construction areas (local extract, ODbL)
async function scanOSM() {
  const PBF = join(RAW, 'docklands', 'greater_london-latest.osm.pbf');
  if (!existsSync(PBF)) throw new Error(`missing ${PBF}`);
  const parse = createRequire(import.meta.url)('osm-pbf-parser');
  const near = (lat, lon) => lon >= MODEL[0] - 0.01 && lon <= EAST[2] + 0.01 && lat >= MODEL[1] - 0.01 && lat <= MODEL[3] + 0.01;
  const coord = new Map(), out = [], wayGeom = new Map(), rels = [];
  const isC = t => t && (t.landuse === 'construction' || t.building === 'construction' || t['building:part'] === 'construction' || (t.construction && !t.highway && !t.railway) || t['disused:building'] === 'construction');
  await new Promise((res, rej) => createReadStream(PBF).pipe(parse()).pipe(new Writable({ objectMode: true, write(list, enc, next) {
    for (const it of list) {
      if (it.type === 'node') { if (near(it.lat, it.lon)) coord.set(it.id, [r6(it.lon), r6(it.lat)]); if (isC(it.tags) && near(it.lat, it.lon)) out.push({ type: 'node', id: it.id, tags: it.tags, ring: null, point: [r6(it.lon), r6(it.lat)] }); }
      else if (it.type === 'way') { const pts = it.refs.map(r => coord.get(r)); if (pts.some(p => !p)) continue; wayGeom.set(it.id, pts); if (isC(it.tags)) out.push({ type: 'way', id: it.id, tags: it.tags, ring: pts }); }
      else if (it.type === 'relation' && isC(it.tags)) rels.push(it);
    }
    next();
  } })).on('finish', res).on('error', rej));
  for (const r of rels) { const outer = r.members.filter(m => m.type === 'way' && m.role !== 'inner').map(m => wayGeom.get(m.id)).filter(Boolean); if (outer.length) out.push({ type: 'relation', id: r.id, tags: r.tags, ring: outer.flat() }); }
  return { scanned: new Date().toISOString(), file: 'greater_london-latest.osm.pbf', items: out };
}

// ---------------------------------------------------------------- Wikidata (QLever): buildings and projects with a coordinate in the zone
const WD_QUERY = `PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
SELECT ?item ?label ?coord ?state ?inception ?opening ?height ?floors ?contractor ?contractorLabel ?owner ?ownerLabel ?client ?clientLabel ?architect ?architectLabel WHERE {
  ?item wdt:P625 ?coord .
  FILTER(geof:longitude(?coord) > ${MODEL[0]} && geof:longitude(?coord) < ${EAST[2]} && geof:latitude(?coord) > ${MODEL[1]} && geof:latitude(?coord) < ${MODEL[3]})
  { ?item wdt:P31/wdt:P279* wd:Q41176 } UNION { ?item wdt:P31/wdt:P279* wd:Q811430 } UNION { ?item wdt:P5817 wd:Q12377751 }
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) = "en") }
  OPTIONAL { ?item wdt:P5817 ?state } OPTIONAL { ?item wdt:P571 ?inception } OPTIONAL { ?item wdt:P1619 ?opening }
  OPTIONAL { ?item wdt:P2048 ?height } OPTIONAL { ?item wdt:P1101 ?floors }
  OPTIONAL { ?item wdt:P193 ?contractor OPTIONAL { ?contractor rdfs:label ?contractorLabel FILTER(LANG(?contractorLabel) = "en") } }
  OPTIONAL { ?item wdt:P127 ?owner OPTIONAL { ?owner rdfs:label ?ownerLabel FILTER(LANG(?ownerLabel) = "en") } }
  OPTIONAL { ?item wdt:P88 ?client OPTIONAL { ?client rdfs:label ?clientLabel FILTER(LANG(?clientLabel) = "en") } }
  OPTIONAL { ?item wdt:P84 ?architect OPTIONAL { ?architect rdfs:label ?architectLabel FILTER(LANG(?architectLabel) = "en") } }
}`;
async function fetchWD() {
  const rows = await qlever(WD_QUERY);
  const items = new Map(), q = v => v?.value?.replace('http://www.wikidata.org/entity/', '');
  for (const b of rows) {
    const id = q(b.item); const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value || ''); if (!m) continue;
    const it = items.get(id) || { qid: id, label: b.label?.value || null, lon: +m[1], lat: +m[2], state: new Set(), inception: new Set(), opening: new Set(), height_m: new Set(), floors: new Set(), contractor: new Map(), owner: new Map(), client: new Map(), architect: new Map() };
    for (const k of ['state', 'inception', 'opening']) if (b[k]) it[k].add(q(b[k]).slice(0, k === 'state' ? 99 : 10));
    if (b.height) it.height_m.add(+b.height.value); if (b.floors) it.floors.add(+b.floors.value);
    for (const k of ['contractor', 'owner', 'client', 'architect']) if (b[k]) it[k].set(q(b[k]), b[k + 'Label']?.value || null);
    items.set(id, it);
  }
  return { fetched: new Date().toISOString(), endpoint: 'https://qlever.dev/api/wikidata', items: [...items.values()].map(it => ({ ...it,
    state: [...it.state], inception: [...it.inception], opening: [...it.opening], height_m: [...it.height_m], floors: [...it.floors],
    contractor: [...it.contractor].map(([qid, label]) => ({ qid, label })), owner: [...it.owner].map(([qid, label]) => ({ qid, label })),
    client: [...it.client].map(([qid, label]) => ({ qid, label })), architect: [...it.architect].map(([qid, label]) => ({ qid, label })) })) };
}

// ---------------------------------------------------------------- geometry in local metres
let P2L;
const toL = (lon, lat) => P2L(lon, lat);
function ringL(ring) { return ring.map(([lon, lat]) => toL(lon, lat)); }
function centroidL(rl) { let x = 0, z = 0; for (const p of rl) { x += p[0]; z += p[1]; } return [x / rl.length, z / rl.length]; }
function segDist(p, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); }
// distance from a point to a footprint (0 inside); a footprint is a ring or a circle {c, r}
function distTo(fp, p) {
  if (fp.ring) { if (pointIn(p, fp.ring)) return 0; let d = Infinity; for (let i = 0; i < fp.ring.length; i++) d = Math.min(d, segDist(p, fp.ring[i], fp.ring[(i + 1) % fp.ring.length])); return d; }
  return Math.max(0, Math.hypot(p[0] - fp.c[0], p[1] - fp.c[1]) - fp.r);
}
function ringDist(fp, ring) { let d = Infinity; for (const p of ring) d = Math.min(d, distTo(fp, p)); if (fp.ring) { for (const p of fp.ring) if (pointIn(p, ring)) return 0; } else if (pointIn(fp.c, ring)) return 0; return d; }

// ---------------------------------------------------------------- build
const baseRef = s => String(s || '').toUpperCase().replace(/\s+/g, '').replace(/\/(A\d|B\d|S|NC|P\d|NMA|MMA|VAR|[A-Z]{1,3}\d?)$/, '');
const refsIn = s => new Set((String(s || '').toUpperCase().match(/\b(?:PA\/\d{2}\/\d{4,5}|\d{2}\/AP\/\d{4}|\d{2}\/\d{4}\/[A-Z]{1,3}|DC\/\d{2}\/\d{5}|\d{2}\/\d{5}\/[A-Z]+)\b/g) || []));
const normName = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const BAD_STATUS = /^(refused|withdrawn|dismissed|lapsed|closed|not required)/i;

function classify(recs) {
  // per record: dates
  for (const r of recs) { r.c = dmy(r.actual_commencement_date); r.k = dmy(r.actual_completion_date); r.d = dmy(r.decision_date); r.l = dmy(r.lapsed_date); }
  const live = recs.filter(r => !BAD_STATUS.test(r.status || ''));
  const commenced = recs.filter(r => (r.c || /^commenced$/i.test(r.status || '')) && !r.k && !/^(lapsed|withdrawn|refused)/i.test(r.status || ''));
  const completedAt = recs.map(r => r.k).filter(Boolean).sort().at(-1) || null;
  const lastCommence = commenced.map(r => r.c).filter(Boolean).sort().at(-1) || null;
  if (commenced.length) {
    const lead = commenced.slice().sort((a, b) => (b.c || '').localeCompare(a.c || '') || (b.d || '').localeCompare(a.d || ''))[0];
    // a later completion on the same site closes an older commencement (phased schemes are split by the grouping, not here)
    if (completedAt && lastCommence && completedAt >= lastCommence) return { status: completedAt >= RECENT_COMPLETION ? 'completed_recently' : 'completed', lead: recs.find(r => r.k === completedAt), rule: 'S3: a completion date on or after the latest commencement', confidence: 'high' };
    if (lead.c && lead.c >= STALE_COMMENCEMENT) return { status: 'on_site', lead, rule: 'S1: LDD actual commencement within 7 years, no completion', confidence: 'high' };
    if (!lead.c && lead.d && lead.d >= STALE_COMMENCEMENT) return { status: 'on_site', lead, rule: 'S1b: status "Commenced" without a commencement date, decided within 7 years, no completion', confidence: 'medium' };
    return { status: 'commenced_stale', lead, rule: 'S2: commenced (or marked "Commenced") more than 7 years ago and never marked complete (F32)', confidence: 'low' };
  }
  if (completedAt) return { status: completedAt >= RECENT_COMPLETION ? 'completed_recently' : 'completed', lead: recs.find(r => r.k === completedAt), rule: 'S3: LDD actual completion date', confidence: 'high' };
  const approved = live.filter(r => /^(approved|allowed|split decision)/i.test(r.decision || r.status || '') && r.d && r.d >= RECENT_DECISION && (!r.l || r.l >= TODAY) && !/^superseded/i.test(r.status || ''));
  if (approved.length) return { status: 'approved_not_started', lead: approved.sort((a, b) => b.d.localeCompare(a.d))[0], rule: 'S4: approved within 5 years, not lapsed or superseded, no commencement in the group', confidence: 'medium' };
  const pending = live.filter(r => /under consideration|received|appeal|called in/i.test(r.status || ''));
  if (pending.length) return { status: 'proposed', lead: pending.sort((a, b) => (b.last_updated || '').localeCompare(a.last_updated || ''))[0], rule: 'S5: application or appeal not yet decided', confidence: 'high' };
  return { status: null };
}

export async function build() {
  P2L = await (async () => { const f = await bngProjector(); return (lon, lat) => { const [E, N] = f(lon, lat); return [r1(E - 537550), r1(-(N - 180300))]; }; })();
  const pld = await cached('pld-major.json', fetchPLD);
  const osm = await cached('osm-construction.json', scanOSM);
  let wd = { items: [], error: null };
  try { wd = await cached('wikidata-buildings.json', fetchWD); } catch (e) { wd.error = String(e.message || e); console.warn('wikidata:', wd.error); }
  const notams = readJ('feeds/live/notams.json'), sm = readJ('feeds/works/street-manager-activities.json');
  const brown = readJ('feeds/london-datastore/brownfield-register/brownfield-register.geojson'), alloc = readJ('feeds/london-datastore/site-allocations/site-allocations.geojson');
  const facts = readJ('registry/sources/construction/facts.json');
  const OSM_AS_OF = (readJ('data-register.json').osm_extracts?.['osmfr-greater-london']?.osm_data_as_of || '?').slice(0, 10);
  const counts = { pld_total_matching: pld.total?.value ?? pld.total, pld_records: pld.hits.length, pld_in_zone: 0, groups: 0, by_status: {}, dropped_groups: {} };

  // 1. records in the zone, with local positions
  const recs = [];
  for (const h of pld.hits) {
    const lat = +h.centroid?.lat, lon = +h.centroid?.lon; const z = inZone(lat, lon); if (!z) continue;
    counts.pld_in_zone++;
    const r = { ...h, lat, lon, zone: z, p: toL(lon, lat) };
    const poly = h.wgs84_polygon?.coordinates?.[0];
    const pc = counts.pld_polygons ||= { real: 0, point_marker_under_50m2: 0, none: 0 };
    if (h.wgs84_polygon?.type === 'Polygon' && poly?.length >= 4) { const rl = ringL(poly); const a = Math.abs(polyArea(rl)); if (a >= 50) { r.ring = rl; r.ringW = poly; r.area = a; pc.real++; } else pc.point_marker_under_50m2++; } else pc.none++;
    if (r.actual_commencement_date && r.lapsed_date && dmy(r.actual_commencement_date) > dmy(r.lapsed_date)) counts.commenced_after_lapsed_date = (counts.commenced_after_lapsed_date || 0) + 1;
    if (r.actual_commencement_date) counts.records_with_commencement = (counts.records_with_commencement || 0) + 1;
    const ha = +(h.application_details?.residential_details?.site_area || h.application_details?.non_residential_details?.site_area || 0);
    r.site_ha = ha > 0 && ha < 100 ? ha : null;
    r.refs = refsIn((h.description || '') + ' ' + (h.reference_no_of_permission_being_relied_on || ''));
    recs.push(r);
  }
  // 2. group records of one site: union-find on (a) the description cites the other's base reference, (b) centroids within
  //    10 m, (c) footprints that overlap by more than half of the smaller one (sampled)
  const par = recs.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i])), uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
  const byBase = new Map(); recs.forEach((r, i) => { const b = baseRef(r.lpa_app_no); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(i); });
  recs.forEach((r, i) => { for (const ref of r.refs) for (const j of byBase.get(baseRef(ref)) || []) if (j !== i && Math.hypot(r.p[0] - recs[j].p[0], r.p[1] - recs[j].p[1]) < 300) uni(i, j); });
  for (const [, ids] of byBase) for (const j of ids.slice(1)) uni(ids[0], j);   // PA/20/02128 and PA/20/02128/A1
  const grid = new Map(), key = (x, z) => `${Math.floor(x / 20)},${Math.floor(z / 20)}`;
  recs.forEach((r, i) => { const k = key(...r.p); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  recs.forEach((r, i) => { const [gx, gz] = [Math.floor(r.p[0] / 20), Math.floor(r.p[1] / 20)]; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of grid.get(`${gx + a},${gz + b}`) || []) if (j > i && Math.hypot(r.p[0] - recs[j].p[0], r.p[1] - recs[j].p[1]) <= 10) uni(i, j); });
  const groups = new Map(); recs.forEach((r, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
  counts.groups = groups.size;

  // 3. one site per group with a status
  const sites = [];
  for (const [, g] of groups) {
    const cl = classify(g);
    if (!cl.status || cl.status === 'completed') { const k = cl.status || 'no_live_status'; counts.dropped_groups[k] = (counts.dropped_groups[k] || 0) + 1; continue; }
    const lead = cl.lead;
    const withRing = g.filter(r => r.ring).sort((a, b) => (b === lead) - (a === lead) || b.area - a.area)[0];
    const fp = withRing ? { ring: withRing.ring, ringW: withRing.ringW, from: `PLD wgs84_polygon of ${withRing.lpa_app_no}`, area_m2: Math.round(withRing.area) }
      : { c: lead.p, r: lead.site_ha ? Math.max(15, Math.sqrt(lead.site_ha * 1e4 / Math.PI)) : 25, from: lead.site_ha ? `circle of the stated site area (${lead.site_ha} ha) round the PLD centroid of ${lead.lpa_app_no}` : `25 m circle round the PLD centroid of ${lead.lpa_app_no} (no polygon, no site area)` };
    const bd = g.flatMap(r => (r.application_details?.building_details || []).map(b => ({ app: r.lpa_app_no, ref: b.building_ref || null, storeys: b.no_storeys == null ? null : +b.no_storeys, max_height_m: b.max_height == null ? null : +b.max_height })))
      .filter(b => b.storeys || b.max_height_m);
    const leadBd = bd.filter(b => b.app === lead.lpa_app_no), useBd = leadBd.length ? leadBd : bd;
    const storeysMax = Math.max(0, ...useBd.map(b => b.storeys || 0)) || null, hMax = Math.max(0, ...useBd.map(b => b.max_height_m || 0)) || null;
    const units = Math.max(0, ...g.map(r => +r.application_details?.residential_details?.total_no_proposed_residential_units || 0)) || null;
    const gia = Math.max(0, ...g.map(r => +r.application_details?.non_residential_details?.total_gia_gained || 0)) || null;
    const name = g.map(r => r.application_details?.scheme_name).find(Boolean) || cut(lead.site_name || lead.site_number || lead.street_name, 90);
    const site = {
      id: `cws-${(lead.lpa_name || lead.borough || 'x').toLowerCase().replace(/[^a-z]+/g, '-')}-${baseRef(lead.lpa_app_no).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name, address: [lead.site_number && lead.site_number !== lead.site_name ? lead.site_number : null, lead.site_name, lead.street_name, lead.postcode].filter(Boolean).map(s => cut(s, 90)).join(', '),
      borough: String(lead.lpa_name || lead.borough || '').replace(/^London Borough of /i, ''), zone: lead.zone,
      position: { lat: r6(lead.lat), lon: r6(lead.lon), x: lead.p[0], z: lead.p[1], from: `PLD centroid of ${lead.lpa_app_no}` },
      footprint: fp.ring ? { ring_wgs84: fp.ringW.map(([lo, la]) => [r6(lo), r6(la)]), ring_local: fp.ring.map(p => [r1(p[0]), r1(p[1])]), area_m2: fp.area_m2, from: fp.from } : { circle_local: { c: fp.c, r: r1(fp.r) }, from: fp.from },
      status: cl.status, status_rule: cl.rule, status_confidence: cl.confidence,
      dates: { decision: lead.d, commenced: lead.c, completed: lead.k, lapses: lead.l, from: `PLD/LDD fields of ${lead.lpa_app_no}` },
      description: cut(lead.description, 300),
      approved: { storeys_max: storeysMax, max_height_m: hMax, height_datum: hMax ? 'as entered by the borough (m AOD where the description says so; not checked per record)' : null, buildings: useBd.slice(0, 12), units, non_res_gia_gained_m2: gia, from: useBd.length ? `PLD application_details.building_details of ${[...new Set(useBd.map(b => b.app))].join(', ')}` : null },
      planning: g.sort((a, b) => (b.d || b.c || '').localeCompare(a.d || a.c || '')).slice(0, 15).map(r => ({ lpa_app_no: r.lpa_app_no, role: r === lead ? 'lead' : 'related', status: r.status || null, decision: r.decision || null,
        decision_date: r.d, commenced: r.c, completed: r.k, lapses: r.l, application_type: r.application_type_full || r.application_type || null, url: r.url_planning_app || null, pld_id: r.id, last_updated: (r.last_updated || '').slice(0, 10) || null })),
      planning_count: g.length,
      developer: [], contractor: [], current: null, cranes: [], street_activities: [], osm: [], brownfield: [], site_allocations: [], wikidata: [], photo_evidence: [],
    };
    site._fp = fp;
    sites.push(site);
  }
  // 4. joins by position, with a confidence per match (rules in meta.match_rules)
  const nearestSite = (p, filter, max) => { let best = null; for (const s of sites) { if (filter && !filter(s)) continue; const d = distTo(s._fp, p); if (d <= max && (!best || d < best.d)) best = { s, d }; } return best; };
  const unmatched = { cranes: [], street_activities: [], osm: [] };
  const live = s => s.status === 'on_site' || s.status === 'approved_not_started' || s.status === 'commenced_stale';
  for (const n of notams.items.filter(i => i.values?.crane && i.position)) {
    const p = toL(n.position.lon, n.position.lat), m = nearestSite(p, live, 150);
    const rec = { notam: n.id, name: n.name, lat: n.position.lat, lon: n.position.lon, x: p[0], z: p[1], top_amsl_ft: n.values.height_amsl_ft ?? n.position.alt_ft ?? null, top_m_od: n.values.height_amsl_ft ? r1(n.values.height_amsl_ft * 0.3048) : null, height_agl_ft: n.values.height_agl_ft ?? null, lit: !!n.values.lit, start: n.values.start, end: n.values.end, pib_issued: notams.meta.pib_issued };
    if (m) m.s.cranes.push({ ...rec, distance_m: Math.round(m.d), confidence: m.d <= 60 ? 'high' : 'medium', rule: m.d <= 60 ? 'M1: crane within 60 m of the footprint' : 'M1: crane 60 to 150 m from the footprint (jib reach)' });
    else unmatched.cranes.push(rec);
  }
  for (const a of sm.items) {
    const p = toL(a.lon, a.lat), m = nearestSite(p, live, 120);
    const rec = { id: a.id, type: a.activity_type, title: cut(a.title, 140), start: (a.start || '').slice(0, 10), end: (a.end || '').slice(0, 10), street: a.street || null, usrn: a.usrn || null, lat: a.lat, lon: a.lon, snapshot: sm.meta.fetched };
    if (m) m.s.street_activities.push({ ...rec, distance_m: Math.round(m.d), confidence: m.d <= 50 ? 'high' : 'medium', rule: m.d <= 50 ? 'M2: within 50 m of the footprint' : 'M2: 50 to 120 m from the footprint' });
    else if (/crane|hoarding|compound|scaffold/.test(a.activity_type || '')) unmatched.street_activities.push(rec);
  }
  for (const o of osm.items) {
    const ring = o.ring ? ringL(o.ring) : null, p = ring ? centroidL(ring) : toL(...o.point);
    let best = null; for (const s of sites) { const d = ring ? ringDist(s._fp, ring) : distTo(s._fp, p); if (d <= 30 && (!best || d < best.d)) best = { s, d }; }
    const lonlat = o.point || o.ring[0];
    if (!inZone(lonlat[1], lonlat[0])) continue;
    const tags = Object.fromEntries(Object.entries(o.tags).filter(([k]) => /^(name|landuse|building|construction|start_date|opening_date|operator|developer|building:levels|height|description|website|ref|addr:street|addr:housenumber)$/.test(k)));
    const rec = { osm: `${o.type}/${o.id}`, tags, x: r1(p[0]), z: r1(p[1]), ring_local: ring ? ring.map(q => [r1(q[0]), r1(q[1])]) : null };
    if (best) best.s.osm.push({ _ring: ring, _ringW: o.ring, osm: rec.osm, tags, distance_m: Math.round(best.d), confidence: best.d === 0 ? 'high' : 'medium', rule: best.d === 0 ? 'M3: OSM area overlaps the footprint' : 'M3: OSM area within 30 m' });
    else unmatched.osm.push(rec);
  }
  for (const f of brown.features) {
    const pr = f.properties, gy = +pr.geoy, gx = +pr.geox; if (!gy || !gx) continue;
    // geox/geoy are WGS84 or BNG per row (F23): a northing over 90 is BNG metres
    const bp = gy > 90 ? [r1(gx - 537550), r1(-(gy - 180300))] : toL(gx, gy);
    const m = nearestSite(bp, null, 40);
    if (m) m.s.brownfield.push({ site_reference: pr.sitereference, name: cut(pr.sitenameaddress, 90), planning_status: pr.planningstatus, permission_type: pr.permissiontype, permission_date: pr.permissiondate, dwellings: [pr.netdwellingsrangefrom, pr.netdwellingsrangeto], organisation: pr.organisationuri, distance_m: Math.round(m.d), confidence: m.d === 0 ? 'high' : 'medium', rule: 'M4: register point within 40 m of the footprint' });
  }
  for (const f of alloc.features) {
    const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const s of sites) { const c = s._fp.ring ? centroidL(s._fp.ring) : s._fp.c; if (polys.some(pp => pointIn(c, ringL(pp[0])))) s.site_allocations.push({ objectid: f.properties.OBJECTID, area_m2: Math.round(f.properties.Shape_Area), rule: 'M5: site centre inside the allocation polygon (the GeoPackage has no names: F23)', confidence: 'medium' }); }
  }
  for (const it of wd.items) {
    const p = toL(it.lon, it.lat), m = nearestSite(p, null, 40); if (!m) continue;
    const nm = normName(it.label), sn = normName(m.s.name + ' ' + m.s.address + ' ' + m.s.description);
    const nameHit = nm && nm.split(' ').filter(w => w.length > 3).some(w => sn.includes(w));
    m.s.wikidata.push({ qid: it.qid, label: it.label, distance_m: Math.round(m.d), state: it.state, inception: it.inception, opening: it.opening, height_m: it.height_m, floors: it.floors,
      contractor: it.contractor, owner: it.owner, client: it.client, architect: it.architect,
      confidence: m.d <= 15 && nameHit ? 'high' : nameHit ? 'medium' : 'low', rule: `M6: item coordinate within 40 m of the footprint${nameHit ? ', a word of the label in the site name or description' : ', no name word in common'}` });
  }
  // 5. hand-written facts (crawled developer pages, the owner's photos), matched by planning reference
  for (const f of facts.sites) {
    const s = sites.find(x => x.planning.some(p => f.planning_refs.includes(baseRef(p.lpa_app_no))));
    if (!s) { (unmatched.facts ||= []).push(f.name); continue; }
    s.name = f.name || s.name; s.facts_key = f.key;
    for (const k of ['developer', 'contractor']) for (const v of f[k] || []) s[k].push(v);
    if (f.current) s.current = f.current;
    if (f.approved_web) s.approved.web = f.approved_web;
    for (const e of f.photo_evidence || []) s.photo_evidence.push(e);
    if (f.web) s.web = f.web;
  }
  // footprint from OSM when the PLD gives none (a building=construction outline before a landuse=construction site)
  for (const s of sites) {
    const hits = s.osm.filter(o => o._ring && o._ring.length >= 4 && o.confidence === 'high');
    if (!s.footprint.ring_local && hits.length) {
      const pick = hits.sort((a, b) => (b.tags.building === 'construction') - (a.tags.building === 'construction') || Math.abs(polyArea(a._ring)) - Math.abs(polyArea(b._ring)))[0];
      s.footprint = { ring_wgs84: pick._ringW.map(([lo, la]) => [r6(lo), r6(la)]), ring_local: pick._ring.map(q => [r1(q[0]), r1(q[1])]), area_m2: Math.round(Math.abs(polyArea(pick._ring))), from: `OSM ${pick.osm} (${pick.tags.building === 'construction' ? 'building=construction' : 'landuse=construction'}); the PLD has ${s.footprint.from}` };
      counts.footprint_from_osm = (counts.footprint_from_osm || 0) + 1;
    }
    for (const o of s.osm) { delete o._ring; delete o._ringW; }
    // other evidence that a site is being built now (OSM data date and NOTAM, Street Manager snapshots)
    const ev = [];
    if (s.osm.some(o => o.confidence === 'high')) ev.push(`OSM construction area overlaps (OSM data of ${OSM_AS_OF})`);
    if (s.cranes.some(c => c.confidence === 'high')) ev.push('NOTAM crane within 60 m');
    if (s.street_activities.some(a => a.confidence === 'high' && /crane|hoarding|compound|scaffold/.test(a.type))) ev.push('Street Manager crane, hoarding or compound within 50 m');
    if (ev.length) s.evidence_now = ev;
    if (s.status === 'commenced_stale' && ev.length) { s.status = 'on_site'; s.status_rule = 'S2b: commenced more than 7 years ago, never marked complete, and construction seen now: ' + ev.join('; '); s.status_confidence = 'medium'; }
    else if (s.status === 'approved_not_started' && (s.cranes.some(c => c.confidence === 'high') || s.osm.some(o => o.confidence === 'high' && o.tags.building === 'construction'))) {
      s.status = 'on_site'; s.status_rule = 'S4b: approved, no commencement recorded in the PLD (F33), but a NOTAM crane within 60 m or an OSM building=construction outline overlaps: ' + ev.join('; '); s.status_confidence = 'medium'; counts.started_not_recorded = (counts.started_not_recorded || 0) + 1;
    } else if (s.status === 'approved_not_started' && ev.length) s.status_note = 'other sources suggest work may have started: ' + ev.join('; ');
  }
  for (const s of sites) { delete s._fp; counts.by_status[s.status] = (counts.by_status[s.status] || 0) + 1; }
  const order = { on_site: 0, approved_not_started: 1, completed_recently: 2, proposed: 3, commenced_stale: 4 };
  sites.sort((a, b) => order[a.status] - order[b.status] || (b.approved.storeys_max || 0) - (a.approved.storeys_max || 0) || a.id.localeCompare(b.id));
  // duplicate ids (two groups with one lead reference base) get a suffix
  const seen = new Map(); for (const s of sites) { const n = seen.get(s.id) || 0; seen.set(s.id, n + 1); if (n) s.id += `-${n + 1}`; }
  const bySource = {
    planning_london_datahub: sites.length,
    with_polygon_footprint: sites.filter(s => s.footprint.ring_local).length,
    with_approved_storeys: sites.filter(s => s.approved.storeys_max).length,
    with_notam_crane: sites.filter(s => s.cranes.length).length,
    with_street_activity: sites.filter(s => s.street_activities.length).length,
    with_osm_construction: sites.filter(s => s.osm.length).length,
    with_brownfield: sites.filter(s => s.brownfield.length).length,
    with_site_allocation: sites.filter(s => s.site_allocations.length).length,
    with_wikidata: sites.filter(s => s.wikidata.length).length,
    with_wikidata_high: sites.filter(s => s.wikidata.some(w => w.confidence === 'high')).length,
    with_developer: sites.filter(s => s.developer.length).length,
    with_photo_evidence: sites.filter(s => s.photo_evidence.length).length,
  };
  const onSite = sites.filter(s => s.status === 'on_site');
  Object.assign(counts, { by_source: bySource, on_site_by_source: {
    with_notam_crane: onSite.filter(s => s.cranes.length).length, with_street_activity: onSite.filter(s => s.street_activities.length).length, with_osm_construction: onSite.filter(s => s.osm.length).length },
    notam_cranes: notams.items.filter(i => i.values?.crane).length, notam_cranes_matched: notams.items.filter(i => i.values?.crane).length - unmatched.cranes.length,
    street_activities: sm.items.length, osm_construction_items: osm.items.length, osm_unmatched_in_zone: unmatched.osm.length, wikidata_items_scanned: wd.items.length, wikidata_error: wd.error });
  const meta = {
    about: 'Index of works in progress (construction sites) in the Docklands zone: one record per site, built by tools/build-construction-index.mjs. Status from the Planning London Datahub (borough decisions and the London Development Database commencement and completion dates); joins by position with a confidence each. Facts and links only from every source; descriptions cut to 300 characters.',
    built: new Date().toISOString(), today: TODAY,
    zone: { model_box_wgs84: MODEL, east_margin_wgs84: EAST },
    sources: {
      pld: { endpoint: PLD, fetched: pld.fetched, query: 'centroid in the zone box AND (proposed residential units >= 10 OR non-residential GIA gained >= 1000 m2); all statuses', licence: 'GLA Planning London Datahub terms (not confirmed as OGL): application metadata and the link only', attribution: 'Source: Planning London Datahub (Greater London Authority and the London boroughs)' },
      notams: { file: 'feeds/live/notams.json', pib_issued: notams.meta.pib_issued, attribution: notams.meta.attribution, licence: notams.meta.licence },
      street_manager: { file: 'feeds/works/street-manager-activities.json', fetched: sm.meta.fetched, month: sm.meta.counts?.month, attribution: sm.meta.attribution, licence: sm.meta.licence },
      osm: { file: 'data/raw/docklands/greater_london-latest.osm.pbf (local)', scanned: osm.scanned, extract: 'osmfr-greater-london (data-register osm_extracts)', tags: 'landuse=construction, building=construction, building:part=construction, construction=* (not highway or railway)', licence: 'ODbL 1.0', attribution: '© OpenStreetMap contributors' },
      brownfield: { file: 'feeds/london-datastore/brownfield-register/brownfield-register.geojson', licence: 'OGL v3.0 (London Datastore; the GLA cannot warrant the quality or accuracy of the data)' },
      site_allocations: { file: 'feeds/london-datastore/site-allocations/site-allocations.geojson', licence: 'OGL v3.0 (London Datastore)' },
      wikidata: { endpoint: wd.endpoint || 'https://qlever.dev/api/wikidata', fetched: wd.fetched || null, licence: 'CC0 1.0', error: wd.error },
      facts: { file: 'registry/sources/construction/facts.json', note: 'hand-written from crawled developer and press pages (facts only, each with URL and date) and the owner\'s CC0 photos' },
    },
    status_rules: {
      on_site: 'S1 (high): a record of the group has an LDD actual commencement date within 7 years and no completion date, and is not lapsed, withdrawn or refused; S1b (medium): status "Commenced" without a date, decided within 7 years; S2b (medium): an S2 site with construction seen now (OSM construction area overlapping, a NOTAM crane within 60 m, or a Street Manager crane, hoarding or compound within 50 m); S4b (medium): an S4 site with a NOTAM crane within 60 m or an OSM building=construction outline overlapping (the PLD has no commencement yet: F33)',
      commenced_stale: 'S2 (low): commenced more than 7 years ago and never marked complete, with no other sign of work now (catalogued as F32; many are phased outline permissions or completions never entered)',
      completed_recently: 'S3: the latest completion date of the group is within 2 years and on or after its latest commencement',
      approved_not_started: 'S4 (medium): no commencement in the group; a record approved within 5 years that is not lapsed (lapsed_date in the past) or superseded',
      proposed: 'S5: an application or appeal not decided (status under consideration, received, appeal, called in)',
      dropped: 'groups completed more than 2 years ago, refused, withdrawn, lapsed or with no status are counted in counts.dropped_groups, not listed',
    },
    grouping_rules: 'Records of one site are one group: the same reference base (PA/20/02128 and PA/20/02128/A1), a description that cites another record\'s reference (within 300 m), or centroids within 10 m. The lead record is the latest commencement (on site), the latest completion, or the latest approval.',
    match_rules: {
      footprint: 'PLD wgs84_polygon when its area is 50 m2 or more (smaller polygons are point markers); else a circle of the stated site area; else 25 m round the centroid',
      M1: 'NOTAM crane (feeds/live/notams.json, crane true) to the nearest on-site, approved or stale site within 150 m of its footprint: high within 60 m, medium 60 to 150 m',
      M2: 'Street Manager highway activity to the nearest such site within 120 m: high within 50 m, medium 50 to 120 m',
      M3: 'OSM construction area or node to the nearest site within 30 m: high when it overlaps the footprint, medium otherwise; unmatched ones in the zone are listed in unmatched.osm',
      M4: 'brownfield register point within 40 m of the footprint',
      M5: 'site centre inside a site allocation polygon',
      M6: 'Wikidata building or project within 40 m: high within 15 m with a label word in the site name or description, medium with the word, low without',
      facts: 'hand-written facts join by planning reference base',
    },
    counts, unmatched,
  };
  mkdirSync(join(CW, 'registry/sources/construction'), { recursive: true });
  const { unmatched: um, ...metaTop } = meta;   // one record per line: small diffs, one fetch for the page
  writeFileSync(OUT, '{"meta":' + JSON.stringify(metaTop, null, 1) + ',\n"unmatched":{\n' + Object.entries(um).map(([k, v]) => JSON.stringify(k) + ':[\n' + v.map(x => JSON.stringify(x)).join(',\n') + ']').join(',\n') + '},\n"sites":[\n' + sites.map(x => JSON.stringify(x)).join(',\n') + ']}\n');
  return { meta, sites };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { meta } = await build();
  console.log(JSON.stringify(meta.counts, null, 1));
}
