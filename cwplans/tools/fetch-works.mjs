#!/usr/bin/env node
// Permits, works, closures and planned events across the Docklands zone, as dated snapshots.
//
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-works.mjs                 # every source, then the combined file
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-works.mjs tfl-lines tfl-road   # some sources (combined file rebuilt from all snapshots)
//   node cwplans/tools/fetch-works.mjs --no-fetch          # rebuild every snapshot from the raw cache, no network
//   options: --refresh (re-download cached raw files: NaPTAN, Street Manager archives, Gazette notices),
//            --days=90 (TfL look-ahead), --month=2026-09 (Street Manager archive month; default the last full month)
//
// Sources: tfl-lines tfl-bus tfl-road street-manager gazette th-licences planning markets venue-events
// Out:  cwplans/feeds/works/<source>.json  {meta: {source, url, fetched, licence, attribution, method, counts}, items}
//       cwplans/feeds/works/works.json     every item in the zone from every snapshot, one normalised list
// Raw:  cwplans/data/raw/works/ (gitignored)
// Zone: the 3D model's box (docklands/data/area.js meta.extent; WGS84 -0.095, 51.474 to 0.015, 51.522) plus an east
//       margin for the Royal Docks, ExCeL and London City Airport (0.015 to 0.085, 51.495 to 51.522).
// Method, licences, rejected sources and lessons: skill cwplans-permits-and-works
// (cwplans/skills/cwplans-permits-and-works/SKILL.md); sources and counts: cwplans/feeds/works/README.md.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, createReadStream } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { Writable } from 'node:stream';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import proj4 from 'proj4';
import { TOOLS, RAW, UA, bngProjector } from './lib.mjs';
import { BOX_WGS84 } from './fetch-docklands.mjs';

const CW = join(TOOLS, '..'), OUT = join(CW, 'feeds', 'works'), RAWDIR = join(RAW, 'works');
mkdirSync(OUT, { recursive: true }); mkdirSync(RAWDIR, { recursive: true });
const args = process.argv.slice(2), opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const NOFETCH = args.includes('--no-fetch'), REFRESH = args.includes('--refresh');
const DAYS = +(opt('days') || 90);
const NOW = new Date(), TODAY = NOW.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const lastMonth = () => { const d = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - 1, 1)); return d.toISOString().slice(0, 7); };
const MONTH = opt('month') || lastMonth();

// ---- the zone
const MODEL = BOX_WGS84;                                  // [W, S, E, N]
const EAST = [0.015, 51.495, 0.085, 51.522];             // Royal Docks, ExCeL, City Airport, Woolwich ferry
const inB = (b, lat, lon) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
const zoneOf = (lat, lon) => lat == null || lon == null || !isFinite(lat) || !isFinite(lon) ? null : inB(MODEL, lat, lon) ? 'model' : inB(EAST, lat, lon) ? 'east' : null;
// the model box from area.js meta.extent (read from the file head, not executed), to check that the two agree
function areaExtent() {
  const head = readFileSync(join(CW, 'docklands/data/area.js'), 'utf8').slice(0, 4000);
  const o = JSON.parse(head.match(/"origin":(\{[^}]*\})/)[1]), e = JSON.parse(head.match(/"extent":(\{[^}]*\})/)[1]);
  return { E0: o.E0 + e.x0, E1: o.E0 + e.x1, N0: o.N0 - e.z1, N1: o.N0 - e.z0 };
}
const BOROUGHS = ['Tower Hamlets', 'Southwark', 'Lewisham', 'Greenwich', 'Newham', 'City of London'];
const LONDON_BOROUGHS = ['Barking and Dagenham', 'Barnet', 'Bexley', 'Brent', 'Bromley', 'Camden', 'City of London', 'Croydon', 'Ealing', 'Enfield', 'Greenwich',
  'Hackney', 'Hammersmith and Fulham', 'Haringey', 'Harrow', 'Havering', 'Hillingdon', 'Hounslow', 'Islington', 'Kensington and Chelsea', 'Kingston', 'Lambeth',
  'Lewisham', 'Merton', 'Newham', 'Redbridge', 'Richmond', 'Southwark', 'Sutton', 'Tower Hamlets', 'Waltham Forest', 'Wandsworth', 'Westminster'];
// postcode districts that lie (almost) wholly in the zone; E3, SE1, SE14 and SE15 reach far outside it and are not used
const ZONE_DISTRICTS = ['E1', 'E1W', 'E14', 'E16', 'EC3*', 'SE8', 'SE10', 'SE16'];
// districts that reach into the zone at all (for dropping orders that name only districts elsewhere)
const TOUCH_DISTRICTS = [...ZONE_DISTRICTS, 'E3', 'EC2*', 'EC4*', 'SE1', 'SE14', 'SE15'];
const boroughIn = text => { const t = String(text || '').toLowerCase(); const b = LONDON_BOROUGHS.find(n => t.includes(n.toLowerCase())); return b || null; };
const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const r6 = v => v == null ? null : Math.round(v * 1e6) / 1e6;
const h8 = s => createHash('sha1').update(s).digest('hex').slice(0, 8);

// ---- polite HTTP: one request at a time per host, a gap between requests (the Gazette's robots.txt asks for 10 s),
// up to 5 tries with Retry-After or a doubling pause on 429, 5xx, timeouts and resets
const GAP = { 'www.thegazette.co.uk': 10000 }, hostQ = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));
function politeFetch(url, opts = {}, { tries = 5, timeoutMs = 120000 } = {}) {
  const host = new URL(url).host, gap = GAP[host] || 1000;
  const q = hostQ.get(host) || { chain: Promise.resolve(), last: 0 }; hostQ.set(host, q);
  const run = async () => {
    for (let k = 1; ; k++) {
      const wait = q.last + gap - Date.now(); if (wait > 0) await sleep(wait);
      q.last = Date.now();
      let r, err;
      try { r = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': UA, ...(opts.headers || {}) } }); } catch (e) { err = e; }
      if (r && r.ok) { const b = Buffer.from(await r.arrayBuffer()); q.last = Date.now(); return b; }
      const retry = err || r.status === 429 || r.status >= 500;
      if (!retry || k >= tries) throw new Error(`${err ? err.message : 'HTTP ' + r.status} ${url}`);
      const ra = r && +r.headers.get('retry-after');
      console.log(`  retry ${k} ${err ? err.message : r.status} ${url.slice(0, 100)}`);
      await sleep(ra ? ra * 1000 : Math.max(gap, 2000) * 2 ** k);
    }
  };
  const p = q.chain.then(run, run); q.chain = p.catch(() => {}); return p;
}
// raw cache: every response is kept under data/raw/works/; --no-fetch reads it back; refetched on each run otherwise,
// except "keep" files (archives, NaPTAN, notice pages) which are reused unless --refresh
async function cached(name, url, opts, { keep = false } = {}) {
  const f = join(RAWDIR, name);
  if ((NOFETCH || (keep && !REFRESH)) && existsSync(f) && statSync(f).size > 0) return { buf: readFileSync(f), fetched: statSync(f).mtime.toISOString().slice(0, 10), cached: true };
  if (NOFETCH) throw new Error(`--no-fetch: no raw file ${name}`);
  const buf = await politeFetch(url, opts);
  writeFileSync(f, buf);
  return { buf, fetched: TODAY, cached: false };
}
const json = b => JSON.parse(b.toString('utf8'));

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const htmlText = s => s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&[lr]squo;/g, "'").replace(/&[lr]dquo;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n\n+/g, '\n').trim();
const dmy = s => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };

const LICENCES = {
  tfl: { licence: 'TfL open data terms (Transport Data Service; OGL-based, attribution required). The terms page refuses scripted requests: re-check before production', attribution: 'Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016 and Geomni UK Map data © and database rights [2019]' },
  ogl: { licence: 'Open Government Licence v3.0', attribution: 'Contains public sector information licensed under the Open Government Licence v3.0' },
};
function write(source, meta, items) {
  const file = join(OUT, `${source}.json`);
  items.sort((a, b) => String(a.start || '9999').localeCompare(String(b.start || '9999')) || String(a.id).localeCompare(String(b.id)));
  const out = { meta: { source, fetched: TODAY, ...meta, zone: { model_box_wgs84: MODEL, east_margin_wgs84: EAST }, counts: { items: items.length, ...(meta.counts || {}) } }, items };
  writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  console.log(`${source}: ${items.length} items -> feeds/works/${source}.json`);
}

// ======================= C. TfL lines: planned closures by date range =======================
// Line/{ids}/Status/{from}/to/{to}?detail=true for every tube, DLR, Elizabeth line, Overground, river bus and cable car
// line and the national-rail operators that call in the zone. A status is kept when one of its affected stops lies in
// the zone, or when it names no stops and the line serves the zone (LINE_WIDE).
const NR_ZONE = ['c2c', 'southeastern', 'southern', 'thameslink', 'greater-anglia'];   // Limehouse, Fenchurch St, London Bridge, Deptford, Greenwich, Maze Hill, S Bermondsey, Liverpool St
const LINE_WIDE = new Set(['jubilee', 'dlr', 'elizabeth', 'windrush', 'district', 'hammersmith-city', 'circle', 'central', 'northern', 'waterloo-city', 'metropolitan',
  ...NR_ZONE, 'rb1', 'rb4', 'rb6', 'woolwich-ferry', 'london-cable-car']);
async function tflLines() {
  const from = `${TODAY}T00:00:00`, to = `${addDays(TODAY, DAYS)}T23:59:00`;
  const modes = (await cached('tfl-line-modes.json', 'https://api.tfl.gov.uk/Line/Mode/tube,dlr,elizabeth-line,overground,river-bus,cable-car')).buf;
  const ids = [...json(modes).map(l => l.id), ...NR_ZONE];
  const np = await naptan('910,930,940');
  const items = [], counts = { lines: ids.length, statuses: 0, disrupted: 0, kept_by_stop: 0, kept_line_wide: 0, dropped_outside: 0, stops_unplaced: 0 };
  for (let i = 0; i < ids.length; i += 12) {
    const chunk = ids.slice(i, i + 12);
    const url = `https://api.tfl.gov.uk/Line/${chunk.join(',')}/Status/${from}/to/${to}?detail=true`;
    const lines = json((await cached(`tfl-line-status-${i / 12}.json`, url)).buf);
    for (const l of lines) for (const s of l.lineStatuses) {
      counts.statuses++;
      if (!s.disruption || !s.validityPeriods?.length) continue;
      counts.disrupted++;
      // TfL sends lat/lon 0 for affected stops: positions from NaPTAN
      const stops = (s.disruption.affectedStops || []).map(p => { const id = p.naptanId || p.id, q = p.lat ? p : stationPos(np, id, p.commonName); if (!q) counts.stops_unplaced++; return { name: p.commonName, lat: q?.lat, lon: q?.lon, id, zone: q ? zoneOf(q.lat, q.lon) : null }; });
      const inZone = stops.filter(p => p.zone);
      let how;
      if (inZone.length) { how = 'affected stop in the zone'; counts.kept_by_stop++; }
      else if (!stops.length && LINE_WIDE.has(l.id)) { how = 'line serves the zone; no stops named'; counts.kept_line_wide++; }
      else { counts.dropped_outside++; continue; }
      const periods = s.validityPeriods.map(v => ({ from: v.fromDate, to: v.toDate }));
      const desc = s.reason || s.disruption.description || '';
      const sev = s.statusSeverityDescription;
      items.push({
        id: `tfl-line:${l.id}:${h8(desc + periods[0].from)}`, kind: /closure/i.test(sev) ? 'rail closure' : /reduced|minor|severe/i.test(sev) ? 'reduced service' : 'service change',
        title: `${l.name}: ${cut(desc, 300)}`, start: periods[0].from, end: periods.at(-1).to, periods,
        location: inZone.length ? inZone.map(p => p.name).slice(0, 8).join('; ') : `${l.name} (line-wide)`,
        lat: r6(inZone[0]?.lat), lon: r6(inZone[0]?.lon), borough: null, zone: inZone[0]?.zone || 'line', placed_by: how,
        line: l.id, mode: l.modeName, severity: sev, category: s.disruption.category, stops_in_zone: inZone.map(p => p.id),
        url: l.modeName === 'national-rail' ? (desc.match(/https?:\/\/\S+/)?.[0] || 'https://www.nationalrail.co.uk/status-and-disruptions/') : 'https://tfl.gov.uk/tube-dlr-overground/status/',
      });
    }
  }
  write('tfl-lines', { url: 'https://api.tfl.gov.uk/Line/{ids}/Status/{from}/to/{to}?detail=true', ...LICENCES.tfl,
    naptan: { url: 'https://naptan.api.dft.gov.uk/v1/access-nodes?atcoAreaCodes=910,930,940&dataFormat=csv', fetched: np.fetched, licence: 'Open Government Licence v3.0' },
    method: `TfL Unified API line status for ${from} to ${to} (${DAYS} days) for ${ids.length} lines (tube, DLR, Elizabeth line, Overground, river bus, cable car and ${NR_ZONE.join(', ')}); one status per disruption with its validity periods; kept when an affected stop lies in the zone or, for a status that names no stops, when the line serves the zone.`,
    window: { from, to }, counts }, items);
}

// ======================= C. TfL buses: route diversions and stop closures =======================
// /Line/Mode/bus/Status?detail=true (route disruptions, London-wide) and /StopPoint/Mode/bus/Disruption (stop
// closures). Stop positions from NaPTAN (DfT, OGL): the TfL route sections carry lat/lon 0.
// area 490 = London bus stops; 910 national rail, 930 ferry piers, 940 metro (Underground, DLR, tram): stations
async function naptan(areas = '490') {
  const r = await cached(`naptan-${areas.replace(/,/g, '-')}.csv`, `https://naptan.api.dft.gov.uk/v1/access-nodes?atcoAreaCodes=${areas}&dataFormat=csv`, {}, { keep: true });
  const rows = parseCsv(r.buf.toString('utf8')), h = rows[0], ix = k => h.indexOf(k);
  const [a, n, la, lo, ind] = ['ATCOCode', 'CommonName', 'Latitude', 'Longitude', 'Indicator'].map(ix);
  const m = new Map(), byName = new Map();
  for (const row of rows.slice(1)) if (row[a] && row[la]) {
    const p = { name: row[n], indicator: row[ind], lat: +row[la], lon: +row[lo] };
    m.set(row[a], p);
    const k = stationKey(row[n]); if (k && !byName.has(k)) byName.set(k, p);
  }
  return { stops: m, byName, fetched: r.fetched };
}
const stationKey = s => String(s || '').toLowerCase().replace(/\b(underground|dlr|rail|elizabeth line|overground|station|pier|london)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// TfL stop-area ids (940GZZDLCAN, 910GLIMHSE, 930GCAW) -> the NaPTAN station entry (9400ZZDLCAN), else by station name
const stationPos = (np, id, name) => np.stops.get(String(id).replace(/^(\d{3})G/, '$10')) || np.byName.get(stationKey(name)) || null;
async function tflBus() {
  const { stops, fetched: naptanFetched } = await naptan('490');
  const lines = json((await cached('tfl-bus-status.json', 'https://api.tfl.gov.uk/Line/Mode/bus/Status?detail=true')).buf);
  const stopDis = json((await cached('tfl-bus-stop-disruption.json', 'https://api.tfl.gov.uk/StopPoint/Mode/bus/Disruption?includeRouteBlockedStops=true')).buf);
  const counts = { routes: lines.length, route_statuses_disrupted: 0, diversions: 0, kept_stop_named: 0, kept_district: 0, dropped: 0, stop_disruptions: stopDis.length, stop_no_naptan: 0, stops_in_zone: 0 };
  // route disruptions: one item per distinct description (a diversion is repeated on every route it affects)
  const byDesc = new Map();
  for (const l of lines) for (const s of l.lineStatuses) {
    if (!s.disruption) continue; counts.route_statuses_disrupted++;
    const d = s.disruption, key = d.description;
    const e = byDesc.get(key) || { d, s, routes: new Set(), stopIds: new Set() };
    e.routes.add(l.id);
    for (const r of d.affectedRoutes || []) for (const x of r.routeSectionNaptanEntrySequence || []) e.stopIds.add(x.stopPoint?.naptanId || x.stopPoint?.id);
    byDesc.set(key, e);
  }
  counts.diversions = byDesc.size;
  const items = [];
  for (const [desc, e] of byDesc) {
    const named = boroughIn(desc);
    const zoneStops = [...e.stopIds].map(id => ({ id, ...stops.get(id) })).filter(p => p.lat && zoneOf(p.lat, p.lon));
    const lower = desc.toLowerCase();
    const hit = zoneStops.find(p => p.name && p.name.length >= 6 && lower.includes(p.name.toLowerCase()));
    // the text usually opens "STREET, DISTRICT:" or "STREET, Borough:"; a borough alone is too coarse (Lewisham and
    // Greenwich reach far south of the zone, and destinations such as "North Greenwich" name boroughs too)
    const district = desc.slice(0, 80).match(/,\s*((?:EC|E|SE)\d{1,2}[A-Z]?)\s*[:,)]/)?.[1] || null;
    const zd = district && ZONE_DISTRICTS.some(d => district === d || (d.endsWith('*') && district.startsWith(d.slice(0, -1))));
    let how;
    if (hit) { how = `names a stop in the zone on an affected route (${hit.name})`; counts.kept_stop_named++; }
    else if (zd) { how = `postcode district in the text (${district})`; counts.kept_district++; }
    else { counts.dropped++; continue; }
    const v = e.s.validityPeriods || [];
    const street = desc.match(/^([A-Z0-9][A-Z0-9 '&.\-\/()]{3,}?),\s*[A-Z][a-z]/)?.[1] || null;
    items.push({
      id: `tfl-bus:${h8(desc)}`, kind: /closed|closure/i.test(desc) ? 'bus diversion (road closed)' : 'bus diversion', title: `Routes ${[...e.routes].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).join(', ')}: ${cut(desc, 300)}`,
      start: v[0]?.fromDate || null, end: v.at(-1)?.toDate || null, location: street || hit?.name || named, street, borough: named, lat: r6(hit?.lat), lon: r6(hit?.lon),
      postcode: district, zone: hit ? zoneOf(hit.lat, hit.lon) : 'district', placed_by: how, routes: [...e.routes], category: e.d.category, url: 'https://tfl.gov.uk/bus/status/',
    });
  }
  // stop closures: grouped by text and dates
  const grp = new Map();
  for (const x of stopDis) {
    const p = stops.get(x.atcoCode); if (!p) { counts.stop_no_naptan++; continue; }
    const z = zoneOf(p.lat, p.lon); if (!z) continue;
    counts.stops_in_zone++;
    const key = `${x.description}|${x.fromDate}|${x.toDate}`;
    const g = grp.get(key) || { x, list: [] }; g.list.push({ id: x.atcoCode, name: x.commonName, ind: p.indicator, lat: p.lat, lon: p.lon, zone: z }); grp.set(key, g);
  }
  for (const { x, list } of grp.values()) items.push({
    id: `tfl-busstop:${list[0].id}:${h8(x.description + x.fromDate)}`, kind: x.type === 'Closure' ? 'bus stop closed' : 'bus stop notice',
    title: `${list.map(s => `${s.name}${s.ind ? ` (${s.ind})` : ''}`).slice(0, 4).join('; ')}${list.length > 4 ? ` and ${list.length - 4} more` : ''}: ${cut(x.description.replace(/\\n|\n/g, ' '), 260)}`,
    start: x.fromDate, end: x.toDate, location: list.map(s => s.name).slice(0, 6).join('; '), lat: r6(list[0].lat), lon: r6(list[0].lon), borough: null, zone: list[0].zone,
    placed_by: 'NaPTAN stop position', stops: list.map(s => s.id), url: `https://tfl.gov.uk/bus/stop/${list[0].id}/`,
  });
  write('tfl-bus', { url: 'https://api.tfl.gov.uk/Line/Mode/bus/Status?detail=true; https://api.tfl.gov.uk/StopPoint/Mode/bus/Disruption', ...LICENCES.tfl,
    attribution: LICENCES.tfl.attribution + '. Stop positions: NaPTAN (DfT), Open Government Licence v3.0',
    method: `Route disruptions (current and planned, London-wide), one item per distinct text with the routes it names; kept when the text names a stop that lies in the zone on one of its routes (NaPTAN position), else when its opening "STREET, DISTRICT:" names a postcode district wholly in the zone (${ZONE_DISTRICTS.join(', ')}); a borough name alone does not place it. Stop closures placed by the NaPTAN position of the stop (ATCO code), grouped by text and dates.`,
    naptan: { url: 'https://naptan.api.dft.gov.uk/v1/access-nodes?atcoAreaCodes=490&dataFormat=csv', fetched: naptanFetched, licence: 'Open Government Licence v3.0' }, counts }, items);
}

// ======================= B. TfL road disruptions: works, planned events, closures =======================
async function tflRoad() {
  const from = `${TODAY}T00:00:00`, to = `${addDays(TODAY, DAYS)}T23:59:00`;
  const dis = json((await cached('tfl-road-disruption.json', `https://api.tfl.gov.uk/Road/all/Disruption?stripContent=true&startDate=${from}&endDate=${to}`)).buf);
  const seg = json((await cached('tfl-road-street-disruption.json', `https://api.tfl.gov.uk/Road/all/Street/Disruption?startDate=${from}&endDate=${to}`)).buf);
  const segBy = new Map();
  for (const s of seg) { const a = segBy.get(s.disruptionId) || []; a.push(s); segBy.set(s.disruptionId, a); }
  const counts = { disruptions: dis.length, street_segments: seg.length, by_category_in_zone: {} };
  const items = [];
  for (const d of dis) {
    const m = String(d.point || '').match(/\[(-?[\d.]+),(-?[\d.]+)\]/); if (!m) continue;
    const lon = +m[1], lat = +m[2], z = zoneOf(lat, lon); if (!z) continue;
    counts.by_category_in_zone[d.category] = (counts.by_category_in_zone[d.category] || 0) + 1;
    const segs = segBy.get(d.id) || [];
    const borough = d.location?.match(/\(([^()]+)\)\s*$/)?.[1] || null;
    items.push({
      id: `tfl-road:${d.id}`, kind: d.category === 'Planned events' ? 'event (road)' : d.category === 'Works' ? (d.hasClosures ? 'road closure (works)' : 'roadworks') : 'road incident',
      title: cut(d.comments || d.location, 320), start: d.startDateTime, end: d.endDateTime, location: d.location, street: d.location?.replace(/\s*\(.*$/, '') || null,
      borough, lat: r6(lat), lon: r6(lon), zone: z, placed_by: 'TfL point', category: d.category, subcategory: d.subCategory, severity: d.severity,
      has_closures: d.hasClosures, provisional: d.isProvisional, recurring: (d.recurringSchedules || []).length || undefined,
      closures: segs.slice(0, 12).map(s => ({ street: s.streetName, closure: s.closure, directions: s.directions })),
      url: `https://api.tfl.gov.uk/Road/all/Disruption/${d.id}`,
    });
  }
  write('tfl-road', { url: 'https://api.tfl.gov.uk/Road/all/Disruption?startDate&endDate; https://api.tfl.gov.uk/Road/all/Street/Disruption?startDate&endDate', ...LICENCES.tfl,
    method: `TfL road disruptions (TIMS: works, planned events, incidents) active between ${from} and ${to}, kept when the TfL point lies in the zone; the street segments of the same disruption id (closed or partly closed streets) attached.`,
    window: { from, to }, counts }, items);
}

// ======================= B. DfT Street Manager: permits and highway activities (monthly open-data archive) =======================
// The open data is an SNS push (needs a public HTTPS endpoint) plus a monthly archive of every notification, one JSON
// file per event, at opendata.manage-roadworks.service.gov.uk/{permit,activity,section_58}/YYYY/MM.zip (OGL v3.0).
// Kept: the latest event per permit or activity whose first coordinate lies in the zone, still open on the fetch date.
let bngToWgs = null;
async function wgs(E, N) { if (!bngToWgs) { await bngProjector(); const p = proj4('BNG', 'EPSG:4326'); bngToWgs = (e, n) => p.forward([e, n]); } const [lon, lat] = bngToWgs(E, N); return { lat, lon }; }
function streamRecords(zip, onRecord) {
  // unzip -p concatenates the member files; each member is one JSON object starting {"event_reference":
  return new Promise((res, rej) => {
    const p = spawn('unzip', ['-p', zip]), dec = new StringDecoder('utf8'), SEP = '}{"event_reference":';
    let buf = '', n = 0;
    p.stdout.on('data', ch => {
      buf += dec.write(ch);
      let i;
      while ((i = buf.indexOf(SEP)) >= 0) { onRecord(buf.slice(0, i + 1)); n++; buf = buf.slice(i + 1); }
    });
    p.on('close', code => { buf += dec.end(); if (buf.trim()) { onRecord(buf.trim()); n++; } code === 0 ? res(n) : rej(new Error(`unzip exit ${code}`)); });
    p.on('error', rej);
  });
}
async function streetManager() {
  const ext = areaExtent();
  // BNG prefilter box: the model extent plus the east margin (to ~E 545000) with 300 m slack; exact test in WGS84 after
  const PRE = { E0: ext.E0 - 300, E1: 545200, N0: ext.N0 - 300, N1: ext.N1 + 300 };
  const counts = { month: MONTH };
  const all = {};
  for (const kind of ['permit', 'activity']) {
    const url = `https://opendata.manage-roadworks.service.gov.uk/${kind}/${MONTH.replace('-', '/')}.zip`;
    const zip = join(RAWDIR, `sm-${kind}-${MONTH}.zip`);
    if (!existsSync(zip) || REFRESH) {
      if (NOFETCH) throw new Error(`--no-fetch: no ${zip}`);
      console.log(`  downloading ${url} (permit archives are about 1 GB)`);
      writeFileSync(zip, await politeFetch(url, {}, { timeoutMs: 3600e3 }));
    }
    const files = +spawnSync('sh', ['-c', `unzip -Z1 '${zip}' | wc -l`]).stdout.toString().trim();
    const coordKey = kind === 'permit' ? 'works_location_coordinates' : 'activity_coordinates';
    const refKey = kind === 'permit' ? 'permit_reference_number' : 'activity_reference_number';
    const re = new RegExp(`"${coordKey}":"[A-Z]+\\(+([\\d.]+) ([\\d.]+)`);
    const latest = new Map(); let pre = 0;
    const n = await streamRecords(zip, s => {
      const m = s.match(re); if (!m) return;
      const E = +m[1], N = +m[2]; if (E < PRE.E0 || E > PRE.E1 || N < PRE.N0 || N > PRE.N1) return;
      pre++;
      const r = JSON.parse(s), o = r.object_data, key = o[refKey];
      const old = latest.get(key); if (!old || old.event_time < r.event_time) latest.set(key, { ...o, event_type: r.event_type, event_time: r.event_time, E, N });
    });
    if (n !== files) throw new Error(`${zip}: ${files} files but ${n} records split: the record separator assumption failed`);
    counts[kind] = { archive: url, archive_files: files, records_read: n, records_near_zone: pre, distinct: latest.size };
    all[kind] = latest;
  }
  // permits
  const items = [], pc = counts.permit;
  Object.assign(pc, { in_zone: 0, closed_or_cancelled: 0, ended_before_fetch: 0, kept: 0, by_traffic_management: {} });
  for (const o of all.permit.values()) {
    const { lat, lon } = await wgs(o.E, o.N), z = zoneOf(lat, lon); if (!z) continue;
    pc.in_zone++;
    if (/cancel|refus|revok|closed/.test(o.permit_status || '') || o.work_status_ref === 'completed') { pc.closed_or_cancelled++; continue; }
    const end = o.actual_end_date_time || o.proposed_end_time || o.proposed_end_date;
    if (end && end.slice(0, 10) < TODAY) { pc.ended_before_fetch++; continue; }
    pc.kept++;
    const tm = o.current_traffic_management_type || o.traffic_management_type;
    pc.by_traffic_management[tm] = (pc.by_traffic_management[tm] || 0) + 1;
    items.push({
      id: `sm-permit:${o.permit_reference_number}`, kind: /road closure/i.test(tm || '') ? 'road closure (works)' : 'roadworks',
      title: `${o.activity_type || 'Works'} by ${o.promoter_organisation}: ${tm || 'traffic management not given'}${o.is_ttro_required === 'Yes' ? ' (TTRO required)' : ''}`,
      start: o.actual_start_date_time || o.proposed_start_time || o.proposed_start_date, end, location: [o.street_name, o.area_name, o.town].filter(Boolean).join(', '),
      street: o.street_name, borough: o.highway_authority, lat: r6(lat), lon: r6(lon), zone: z, placed_by: 'Street Manager works coordinates (first point, BNG via OSTN15)',
      promoter: o.promoter_organisation, work_category: o.work_category, traffic_management: tm, ttro_required: o.is_ttro_required, footway_closed: o.close_footway,
      work_status: o.work_status, permit_status: o.permit_status, usrn: o.usrn, last_event: `${o.event_type} ${o.event_time}`,
      url: counts.permit.archive,
    });
  }
  write('street-manager', { url: 'https://opendata.manage-roadworks.service.gov.uk/permit/YYYY/MM.zip', page: 'https://department-for-transport-streetmanager.github.io/street-manager-docs/open-data/', ...LICENCES.ogl,
    attribution: 'Contains public sector information licensed under the Open Government Licence v3.0 (DfT Street Manager)',
    method: `DfT Street Manager open-data archive for ${MONTH}: every permit notification; the latest event per permit reference; kept when the first works coordinate lies in the zone and the permit is not cancelled, refused, revoked or closed and its end (actual, else proposed) is on or after ${TODAY}. Promoters are companies and councils.`,
    counts: { month: MONTH, ...pc } }, items);
  // highway activities (non-works: events, cranes, hoardings, skips, scaffolding)
  const ac = counts.activity, items2 = [];
  Object.assign(ac, { in_zone: 0, by_type_in_zone: {}, dropped_types: { skips: 0, scaffolding: 0 }, cancelled: 0, ended_before_fetch: 0, kept: 0 });
  for (const o of all.activity.values()) {
    const { lat, lon } = await wgs(o.E, o.N), z = zoneOf(lat, lon); if (!z) continue;
    ac.in_zone++; ac.by_type_in_zone[o.activity_type] = (ac.by_type_in_zone[o.activity_type] || 0) + 1;
    if (o.activity_type in ac.dropped_types) { ac.dropped_types[o.activity_type]++; continue; }   // householder skips and scaffolds: not events, often a home address
    if (o.cancelled === 'Yes') { ac.cancelled++; continue; }
    const end = o.end_time || o.end_date;
    if (end && end.slice(0, 10) < TODAY) { ac.ended_before_fetch++; continue; }
    ac.kept++;
    items2.push({
      id: `sm-activity:${o.activity_reference_number}`, kind: o.activity_type === 'event' ? 'street event' : `street activity (${String(o.activity_type).replace(/_/g, ' ')})`,
      title: cut(o.activity_name || o.activity_type_details || o.activity_type, 240), start: o.start_time || o.start_date, end,
      location: [o.street_name, o.area_name, o.town].filter(Boolean).join(', '), street: o.street_name, borough: o.highway_authority,
      lat: r6(lat), lon: r6(lon), zone: z, placed_by: 'Street Manager activity coordinates (first point, BNG via OSTN15)',
      activity_type: o.activity_type, location_type: o.activity_location_type, traffic_management: o.traffic_management_type, usrn: o.usrn,
      url: ac.archive,
    });
  }
  write('street-manager-activities', { url: 'https://opendata.manage-roadworks.service.gov.uk/activity/YYYY/MM.zip', page: 'https://department-for-transport-streetmanager.github.io/street-manager-docs/open-data/', ...LICENCES.ogl,
    attribution: 'Contains public sector information licensed under the Open Government Licence v3.0 (DfT Street Manager)',
    method: `DfT Street Manager open-data archive for ${MONTH}: highway authority activities (events, cranes and mobile platforms, hoardings, compounds, section 50 licences, other); the latest event per activity reference; kept when the first coordinate lies in the zone, not cancelled, ending on or after ${TODAY}. Skips and scaffolding are counted, not kept.`,
    counts: { month: MONTH, ...ac } }, items2);
}

// ======================= A. The Gazette: Road Traffic Act and Highways notices (traffic orders, TTROs) =======================
// Search: data.json, notice types 1501 (Road Traffic Acts) and 1503 (Highways), text = each zone authority, published in the
// last 120 days. The search's geo point is the publisher's office, not the street, so the filter is the issuing authority.
// Full text: the notice page /notice/{id} (robots.txt allows it; data.jsonld/.ttl/.rdf/.xml and ?view=linked-data are
// disallowed, Crawl-delay 10). Submitter names (f:name, f:familyName) and signatories are not kept.
// office postcodes found in the notices (2026-10-04): Greenwich Woolwich Centre, Lewisham Catford, Newham Dockside,
// Southwark Tooley Street and PO box, TfL Palestra, City Guildhall, Tower Hamlets
const OFFICE_POSTCODES = /\b(SE18 6HQ|SE6 4RU|E16 2QU|SE1 2QH|SE1 8NJ|SE1P 5LX|EC2V 7HH|EC2P 2EJ|E1 0HJ|E1 1BJ)\b/g;
const AUTH = [['Tower Hamlets', /london borough of tower hamlets|tower hamlets council/i], ['Southwark', /london borough of southwark|southwark council/i],
  ['Lewisham', /london borough of lewisham|lewisham council/i], ['Greenwich', /royal borough of greenwich/i], ['Newham', /london borough of newham|newham council/i],
  ['City of London', /city of london corporation|corporation of london|common council of the city of london|the city of london \(/i]];
async function gazette() {
  const since = addDays(TODAY, -120), found = new Map(), counts = { searches: 0, search_hits: 0, notices: 0, fetched_pages: 0, kept: 0, dropped_other_authority: 0, dropped_districts_outside: 0 };
  for (const [name] of AUTH) for (const type of ['1501', '1503']) {
    const q = `noticetypes=${type}&text=${encodeURIComponent(`"${name}"`)}&start-publish-date=${since}&results-page-size=100`;
    const r = await cached(`gazette-search-${type}-${name.replace(/\W+/g, '-')}.json`, `https://www.thegazette.co.uk/all-notices/notice/data.json?${q}`);
    const j = json(r.buf); counts.searches++;
    for (const e of j.entry || []) { counts.search_hits++; const id = e.id.split('/').pop(); if (!found.has(id)) found.set(id, { id, type, published: e.published, category: e.category?.['@term'], snippet: htmlText(e.content || '') }); }
  }
  counts.notices = found.size;
  const items = [];
  for (const n of found.values()) {
    const r = await cached(`gazette-notice-${n.id}.html`, `https://www.thegazette.co.uk/notice/${n.id}`, {}, { keep: true });
    if (!r.cached) counts.fetched_pages++;
    const html = r.buf.toString('utf8');
    const body = html.match(/<div[^>]*data-gazettes="Notice"[^>]*>([\s\S]*?)<\/article>/)?.[1] || html;
    const clean = body.replace(/<[^>]*data-gazettes="(Administrator|Signatory|PersonName|Person)"[^>]*>[\s\S]*?<\/[a-z]+>/g, ' ');
    const text = htmlText(clean);
    const head = text.slice(0, 400);
    let auth = AUTH.find(([, re]) => re.test(head))?.[0] || null;
    const tfl = /transport for london/i.test(head);
    if (!auth && tfl) { const b = BOROUGHS.find(x => new RegExp(x.replace(/ /g, '\\s+'), 'i').test(text.slice(0, 1500))); auth = b ? `${b} (TfL)` : null; }
    if (!auth) { counts.dropped_other_authority++; continue; }
    // postcode districts named in the order: an order that names only districts outside the zone is dropped
    // the authorities' own office postcodes (where to send objections) are not places of the order
    const placeText = text.replace(OFFICE_POSTCODES, ' ');
    const districts = [...new Set([...placeText.matchAll(/\b((?:EC|E|SE)\d{1,2}[A-Z]?)\b(?:\s+\d[A-Z]{2})?/g)].map(m => m[1]))];
    const touch = d => TOUCH_DISTRICTS.some(z => z.endsWith('*') ? d.startsWith(z.slice(0, -1)) : d === z);
    if (districts.length && !districts.some(touch)) { counts.dropped_districts_outside++; continue; }
    counts.kept++;
    const temporary = /temporary|section 14\b|s\.?\s?14\(|section 16a|experimental/i.test(text);
    const dates = [...text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d\d)\b/g)].map(m => new Date(`${m[1]} ${m[2]} ${m[3]} 12:00Z`).toISOString().slice(0, 10));
    const future = [...new Set(dates)].filter(d => d >= n.published.slice(0, 10)).sort();
    items.push({
      id: `gazette:${n.id}`, kind: temporary ? 'TTRO' : 'traffic order', title: cut(head.replace(/^(notice)\s+/i, ''), 300), start: future[0] || n.published.slice(0, 10), end: future.length > 1 ? future.at(-1) : null,
      dates_in_text: future.slice(0, 12), published: n.published.slice(0, 10), location: districts.length ? `${auth}: ${districts.join(', ')}` : auth, borough: auth.replace(/ \(TfL\)$/, ''),
      postcode: districts.filter(touch).join(', ') || null, lat: null, lon: null, zone: districts.some(touch) ? 'district' : 'borough',
      placed_by: districts.some(touch) ? 'issuing authority and a postcode district in the text' : 'issuing authority only (the Gazette geo point is the publisher office)', notice_type: n.type === '1501' ? 'Road Traffic Acts' : 'Highways', temporary,
      url: `https://www.thegazette.co.uk/notice/${n.id}`,
    });
  }
  write('gazette', { url: 'https://www.thegazette.co.uk/all-notices/notice/data.json (noticetypes 1501, 1503) and https://www.thegazette.co.uk/notice/{id}', ...LICENCES.ogl,
    attribution: 'Contains public sector information licensed under the Open Government Licence v3.0 (The Gazette)',
    method: `Search per zone authority (${BOROUGHS.join(', ')}) and notice type (1501 Road Traffic Acts, 1503 Highways), published since ${since}; full notice page for each (10 s between requests, robots.txt Crawl-delay); kept when the notice opens with a zone authority, or with Transport for London and names a zone borough; dropped when it names postcode districts (the authority's office postcode removed first) and none reaches the zone (${TOUCH_DISTRICTS.join(', ')}). "TTRO" = text says temporary, section 14, 16A or experimental. Dates are the day-month-year phrases in the text on or after publication (the order's dates, often also consultation dates). Submitter and signatory names dropped.`,
    since, counts }, items);
}

// ======================= A. Tower Hamlets: licence applications received this week (Licensing Act 2003 notices) =======================
// The council page lists one week; the weekly snapshot is the history (git). The premises-name column is not kept (it
// sometimes holds a private licence holder's name; feeds/events.json th-licence-applications-weekly). Positions: the
// postcode in the address, through postcodes.io (ONS Postcode Directory, OGL).
async function postcodes(list) {
  const out = new Map(), uniq = [...new Set(list.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100);
    const r = await cached(`postcodes-${h8(chunk.join(','))}.json`, 'https://api.postcodes.io/postcodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postcodes: chunk }) });
    for (const x of json(r.buf).result || []) if (x.result) out.set(x.query, { lat: x.result.latitude, lon: x.result.longitude, district: x.result.admin_district });
  }
  return out;
}
const PC = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
async function thLicences() {
  const url = 'https://www.towerhamlets.gov.uk/lgnl/business/licences/alcohol_and_entertainment/Licence_applications_received_this_week.aspx';
  const html = (await cached('th-licences-weekly.html', url)).buf.toString('utf8');
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0] || '';
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => htmlText(c[1])));
  const head = rows.shift() || [];
  if (!/date/i.test(head[0] || '') || !/address/i.test(head[3] || '')) throw new Error(`th-licences: unexpected header ${JSON.stringify(head)}`);
  const recs = rows.filter(r => r.length >= 4).map(([received, type, , address, period]) => ({ received: dmy(received), type: type.replace(/\s+/g, ' ').trim(), address, period: period || '', pc: (address.match(PC) || []).slice(1, 3).join(' ').toUpperCase() || null }));
  const geo = await postcodes(recs.map(r => r.pc));
  const counts = { rows: recs.length, by_type: {}, in_zone: 0, outside_zone: 0, no_postcode: 0 };
  const items = [];
  recs.forEach((r, k) => {
    counts.by_type[r.type] = (counts.by_type[r.type] || 0) + 1;
    const g = geo.get(r.pc); if (!g) { counts.no_postcode++; return; }
    const z = zoneOf(g.lat, g.lon); if (!z) { counts.outside_zone++; return; }
    counts.in_zone++;
    const [s, e] = (r.period.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || []).map(dmy);
    const kind = /temporary event|\bTEN\b/i.test(r.type) ? 'TEN' : /review/i.test(r.type) ? 'licence review' : /premise/i.test(r.type) ? 'premises licence application' : 'licence application';
    items.push({
      id: `th-licence:${r.received}:${h8(r.type + r.address + r.period)}`, kind, title: `${r.type}: ${cut(r.address, 160)}${s ? ` (${s}${e && e !== s ? ' to ' + e : ''})` : ''}`,
      start: s || r.received, end: e || null, received: r.received, location: r.address, postcode: r.pc, borough: 'Tower Hamlets', lat: r6(g.lat), lon: r6(g.lon), zone: z,
      placed_by: 'postcode centre (ONSPD via postcodes.io)', licence_type: r.type, url,
    });
  });
  write('th-licences', { url, licence: 'Tower Hamlets Council website terms; a public notice under the Licensing Act 2003 (no open licence stated): facts and the link only', attribution: 'Source: London Borough of Tower Hamlets, licence applications received this week',
    method: 'The council page table (application date, licence or notice type, premises name, address, TEN dates); the premises-name column is dropped; each row placed by the postcode in its address (postcodes.io, ONSPD, OGL) and kept when that point lies in the zone. One week per snapshot.',
    counts }, items);
}

// ======================= A. Planning: applications for temporary events and structures (Planning London Datahub) =======================
async function planning() {
  const url = 'https://planningdata.london.gov.uk/api-guest/applications/_search';
  const body = { size: 300, sort: [{ last_updated: { order: 'desc' } }],
    _source: ['lpa_app_no', 'lpa_name', 'borough', 'site_name', 'street_name', 'postcode', 'description', 'valid_date', 'decision', 'decision_date', 'status', 'centroid', 'url_planning_app', 'last_updated', 'application_type'],
    query: { bool: { must: [
      { bool: { should: ['temporary', 'temporarily'].map(w => ({ match: { description: w } })), minimum_should_match: 1 } },
      { bool: { should: ['event', 'events', 'marquee', 'festival', 'stage', 'market', 'fair', 'funfair', 'ice rink', 'pop-up', 'filming', 'concert', 'exhibition'].map(w => ({ match_phrase: { description: w } })), minimum_should_match: 1 } },
      { geo_bounding_box: { centroid: { top_left: { lat: Math.max(MODEL[3], EAST[3]), lon: MODEL[0] }, bottom_right: { lat: MODEL[1], lon: EAST[2] } } } },
    ] } } };
  const j = json((await cached('pld-temporary-events.json', url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).buf);
  const counts = { total_matching: j.hits?.total?.value, returned: j.hits?.hits?.length, in_zone: 0, older_than_two_years: 0 };
  const items = [];
  for (const h of j.hits?.hits || []) {
    const s = h._source, c = s.centroid || {}, z = zoneOf(+c.lat, +c.lon); if (!z) continue;
    counts.in_zone++;
    const valid = dmy(s.valid_date), decided = dmy(s.decision_date);
    if ((valid || decided || '') < addDays(TODAY, -730)) { counts.older_than_two_years++; continue; }
    items.push({
      id: `pld:${s.lpa_name || s.borough}:${s.lpa_app_no}`, kind: 'planning: temporary event or structure', title: `${s.lpa_app_no} ${cut(s.site_name, 90)}: ${cut(s.description, 220)}`,
      start: decided || valid, end: null, date_meaning: decided ? 'decision date' : 'application valid date', valid_date: valid, decision: s.decision || s.status || null,
      location: s.site_name, street: s.street_name || null, postcode: s.postcode || null, borough: s.borough, lat: r6(+c.lat), lon: r6(+c.lon), zone: z,
      placed_by: 'Planning London Datahub site centroid', url: s.url_planning_app || null,
    });
  }
  write('planning', { url, page: 'https://www.london.gov.uk/programmes-strategies/planning/digital-planning/planning-london-datahub',
    licence: 'GLA Planning London Datahub terms (not confirmed as OGL): application metadata and the link only, description cut to 220 characters', attribution: 'Source: Planning London Datahub (Greater London Authority and the London boroughs)',
    method: 'One Elasticsearch query (guest endpoint, POST): description has "temporary" and one of event, marquee, festival, stage, market, fair, funfair, ice rink, pop-up, filming, concert, exhibition; site centroid in the zone box; newest 300 by last update; applications validated more than two years before the fetch are counted and dropped. Dates: decision date, else the application valid date (the event dates are in the application documents only).',
    query: body.query, counts }, items);
}

// ======================= A. Markets: OSM marketplaces in the zone + Tower Hamlets street markets page =======================
async function markets() {
  const thUrl = 'https://www.towerhamlets.gov.uk/lgnl/business/markets/markets_in_tower_hamlets.aspx';
  const t = htmlText((await cached('th-markets.html', thUrl)).buf.toString('utf8'));
  const body = t.slice(t.indexOf('Markets in Tower Hamlets'));
  // sections: "<Name> (<days>)" then "Location" <place> then "Opening times" <times>
  const th = [];
  for (const m of body.matchAll(/\n([A-Z][^\n(]{3,60}?)\s*\(([^)\n]{3,40})\)\s*\n[\s\S]*?\nLocation\s*\n?([^\n]+)\n[\s\S]*?Opening times?\s*\n?([^\n]+)/g)) {
    th.push({ name: m[1].trim(), days: m[2].trim(), place: m[3].replace(/\*$/, '').trim(), times: m[4].trim() });
  }
  // OSM: amenity=marketplace nodes and ways in the zone, from the local Greater London extract (ODbL)
  const PBF = join(RAW, 'docklands', 'greater_london-latest.osm.pbf');
  const osm = [], counts = { th_markets_on_page: th.length, osm_marketplaces: 0, th_matched_osm: 0, th_placed_by_street: 0, th_outside_zone: 0 };
  const streetOf = place => place.split(',')[0].replace(/\*$/, '').replace(/\s+(EC|E|SE)\d.*$/, '').trim();
  const streetsWanted = new Set(th.map(x => streetOf(x.place).toLowerCase()));
  const streetPt = new Map();
  if (existsSync(PBF)) {
    const parseOSM = createRequire(import.meta.url)('osm-pbf-parser');
    const coord = new Map(), ways = [];
    const near = (lat, lon) => lon >= MODEL[0] - 0.01 && lon <= EAST[2] + 0.01 && lat >= MODEL[1] - 0.01 && lat <= MODEL[3] + 0.01;
    await new Promise((res, rej) => createReadStream(PBF).pipe(parseOSM()).pipe(new Writable({ objectMode: true, write(list, enc, next) {
      for (const it of list) {
        if (it.type === 'node') { if (!near(it.lat, it.lon)) continue; coord.set(it.id, [it.lon, it.lat]); if (it.tags?.amenity === 'marketplace') osm.push({ type: 'node', id: it.id, tags: it.tags, lat: it.lat, lon: it.lon }); }
        else if (it.type === 'way') {
          if (it.tags?.amenity === 'marketplace') ways.push({ type: 'way', id: it.id, tags: it.tags, refs: it.refs });
          else if (it.tags?.highway && it.tags.name && streetsWanted.has(it.tags.name.toLowerCase()) && !streetPt.has(it.tags.name.toLowerCase())) {
            const p = it.refs.map(r => coord.get(r)).filter(Boolean); if (p.length) streetPt.set(it.tags.name.toLowerCase(), p[Math.floor(p.length / 2)]);
          }
        }
      }
      next();
    } })).on('finish', res).on('error', rej));
    for (const w of ways) { const p = w.refs.map(r => coord.get(r)).filter(Boolean); if (!p.length) continue; osm.push({ ...w, lon: p.reduce((s, q) => s + q[0], 0) / p.length, lat: p.reduce((s, q) => s + q[1], 0) / p.length }); }
  }
  const items = [], key = s => String(s || '').toLowerCase().replace(/\b(market|markets|flower|street food|the|sunday|sundays)\b/g, '').replace(/[^a-z]+/g, ' ').trim();
  for (const o of osm) {
    const z = zoneOf(o.lat, o.lon); if (!z) continue;
    counts.osm_marketplaces++;
    const tg = o.tags, k = key(tg.name), thm = tg.name && th.find(x => key(x.name) && (key(x.name) === k || k.includes(key(x.name)) || key(x.name).includes(k)));
    if (thm) { thm.osm = `${o.type}/${o.id}`; counts.th_matched_osm++; }
    items.push({
      id: `osm-market:${o.type}/${o.id}`, kind: 'market', title: `${tg.name || 'Market (no name in OSM)'}${thm ? `: ${thm.times}` : tg.opening_hours ? `: ${tg.opening_hours}` : ''}`,
      start: null, end: null, recurring: thm ? `${thm.times}` : tg.opening_hours || null, opening_hours: tg.opening_hours || null, location: thm?.place || tg['addr:street'] || tg.name || null,
      borough: thm ? 'Tower Hamlets' : null, lat: r6(o.lat), lon: r6(o.lon), zone: z, placed_by: `OSM ${o.type} ${o.id}${o.type === 'way' ? ' (mean of its nodes)' : ''}`,
      osm: `${o.type}/${o.id}`, operator: tg.operator || null, url: tg.website || tg['contact:website'] || (thm ? thUrl : `https://www.openstreetmap.org/${o.type}/${o.id}`),
      sources: thm ? ['osm', 'th-markets-page'] : ['osm'],
    });
  }
  for (const x of th.filter(x => !x.osm)) {
    const p = streetPt.get(streetOf(x.place).toLowerCase());
    const z = p ? zoneOf(p[1], p[0]) : null;
    if (!z) { counts.th_outside_zone++; continue; }
    counts.th_placed_by_street++;
    items.push({ id: `th-market:${key(x.name).replace(/ /g, '-')}`, kind: 'market', title: `${x.name}: ${x.times}`, start: null, end: null, recurring: `${x.times}`,
      location: x.place, street: streetOf(x.place), borough: 'Tower Hamlets', lat: r6(p[1]), lon: r6(p[0]), zone: z, placed_by: 'street named on the council page, OSM street position', url: thUrl, sources: ['th-markets-page', 'osm'] });
  }
  write('markets', { url: `${thUrl}; OSM amenity=marketplace`, licence: 'OSM: ODbL 1.0 (© OpenStreetMap contributors); Tower Hamlets page: council website terms, days and times as facts with the link',
    attribution: '© OpenStreetMap contributors (https://www.openstreetmap.org/copyright); Tower Hamlets Council, Markets in Tower Hamlets',
    osm_extract: 'osmfr-greater-london (data-register.json osm_extracts; local, not committed)',
    method: 'OSM amenity=marketplace nodes and ways in the zone, read from the local Greater London extract (ways placed at the mean of their nodes); the Tower Hamlets street-markets page parsed for name, days, place and times, joined to OSM by name, else placed on the OSM street it names. Other boroughs publish no market list in a form read here (README gaps).',
    th_markets: th.map(({ name, days, place, times, osm: o }) => ({ name, days, place, times, osm: o || null })), counts }, items);
}

// ======================= A. Venue and council event programmes (feeds/events.json, read at run time) =======================
// Every verified event feed in feeds/events.json is harvested, so feeds that other work adds join automatically. Selected:
// category ical, rss-atom, rest-api or whats-on-page; a feed URL; name, subject or id about events or what's on; not
// news, consultations, meetings, warnings or works (or harvest: true / false on the entry to override). Kept per item:
// title, dates, venue, link only (no description text). An item needs a date from the feed's own event fields (ICS
// DTSTART, RSS ev:startdate, WordPress ACF dates, or a date in the title or link) or, for a single-venue programme, is
// kept undated ("on the programme; dates on the venue page"). Position: the item's own postcode or location, else the
// venue of the feed host (VENUES, placed through its postcode), else the entry's own lat/lon or postcode fields.
const VENUES = {
  'www.theo2.co.uk': { name: 'The O2', postcode: 'SE10 0DX' },
  'space.org.uk': { name: 'The Space, Westferry Road', postcode: 'E14 3RS' },
  'wiltons.org.uk': { name: "Wilton's Music Hall", postcode: 'E1 8JB' },
  'greenwichtheatre.org.uk': { name: 'Greenwich Theatre', postcode: 'SE10 8ES' },
  'www.royaldocks.london': { name: 'Royal Docks (several venues)', postcode: 'E16 1ZE', area: true },
  'www.trinitybuoywharf.com': { name: 'Trinity Buoy Wharf', postcode: 'E14 0JY' },
  'codydock.org.uk': { name: 'Cody Dock', postcode: 'E16 4SP' },
  'www.mudchute.org': { name: 'Mudchute Park and Farm', postcode: 'E14 3HP' },
  'www.excel.london': { name: 'ExCeL London', postcode: 'E16 1XL' },
};
// feeds whose publish date is the event date (checked by hand: the Royal Docks Atom feed's <published> is the event day
// at midnight; entries published at another time of day carry an update time and are left undated)
const PUBLISHED_IS_EVENT_DATE = new Set(['www.royaldocks.london']);
const EVENT_WORDS = /event|what'?s[ -]?on|whatson|programme|calendar|concert|gig|exhibition|listing|performance|festival/i;
const NOT_EVENTS = /\b(news|press releases?|consultations?|decisions?|meetings?|committee|warnings?|flood|history|edits?|closures?|disruptions?|works|notices|bank holidays?|insolvency|planning|retailers?|ratings|changesets?|inception|hansard|questions|openings?|food)\b/i;
// feeds that mix articles with events: only these links are events
const EVENT_PATH = { 'www.royaldocks.london': /\/whats-on\// };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const decode = s => htmlText(String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
// a date written in a title or a URL slug: "5 October 2026", "5-October-2026", "Saturday 10 October"
function dateIn(text, ref = TODAY) {
  const t = String(text || '').toLowerCase().replace(/[-_/]+/g, ' ');
  const m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join('|')})(?:\\s+(20\\d\\d))?\\b`));
  if (!m) return null;
  const mo = MONTHS.indexOf(m[2]) + 1;
  let y = m[3] ? +m[3] : +ref.slice(0, 4);
  let d = `${y}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (!m[3] && d < addDays(ref, -60)) d = `${y + 1}${d.slice(4)}`;   // no year: the next occurrence
  return isNaN(Date.parse(d)) ? null : d;
}
function parseIcs(text) {
  const un = text.replace(/\r?\n[ \t]/g, ''), out = [];
  for (const b of un.split('BEGIN:VEVENT').slice(1)) {
    const f = k => { const m = b.match(new RegExp(`^${k}(?:;[^:\\n]*)?:(.*)$`, 'm')); return m ? m[1].trim().replace(/\\([,;n])/g, (_, c) => c === 'n' ? ' ' : c) : null; };
    const dt = v => { if (!v) return null; const m = v.match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)(Z?))?/); return m ? (m[4] ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? 'Z' : ''}` : `${m[1]}-${m[2]}-${m[3]}`) : null; };
    out.push({ title: f('SUMMARY'), start: dt(f('DTSTART')), end: dt(f('DTEND')), link: f('URL'), where: f('LOCATION') });
  }
  return out;
}
function parseFeedXml(text) {
  const out = [];
  for (const m of text.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)) {
    const x = m[0], tag = k => { const r = x.match(new RegExp(`<${k}\\b[^>]*>([\\s\\S]*?)</${k}>`)); return r ? decode(r[1]) : null; };
    const link = tag('link') || x.match(/<link\b[^>]*href="([^"]+)"/)?.[1] || tag('guid');
    out.push({ title: tag('title'), link: link && link.trim(), evStart: tag('ev:startdate'), evEnd: tag('ev:enddate'), where: tag('ev:location') || tag('category'),
      published: tag('published') || tag('pubDate') });
  }
  return out;
}
function parseWpJson(arr) {
  return (Array.isArray(arr) ? arr : []).map(p => {
    const acf = p.acf && typeof p.acf === 'object' ? p.acf : {};
    const dk = Object.keys(acf).find(k => /date/i.test(k) && acf[k]);
    return { title: decode(p.title?.rendered || p.title), link: p.link, acfDates: dk ? String(acf[dk]) : null, where: acf.attribute_Location || null };
  });
}
async function venueEvents() {
  const ev = JSON.parse(readFileSync(join(CW, 'feeds', 'events.json'), 'utf8'));
  const picked = ev.sources.filter(s => s.harvest === true || (s.harvest !== false && s.feed && s.verified?.status === 'verified'
    && ['ical', 'rss-atom', 'rest-api', 'whats-on-page'].includes(s.category) && EVENT_WORDS.test(`${s.id} ${s.name} ${s.subject || ''}`)
    && !NOT_EVENTS.test(`${s.id} ${s.name}`) && /^(ics|rss|atom|json)$/.test(s.machine_readable)));
  const counts = { feeds_in_events_json: ev.sources.length, feeds_picked: picked.length, per_feed: {} };
  // venue positions through their postcodes
  const vgeo = await postcodes([...Object.values(VENUES).map(v => v.postcode), ...picked.map(s => s.postcode).filter(Boolean)]);
  const raw = [];
  for (const s of picked) {
    const host = new URL(s.feed).host, c = counts.per_feed[s.id] = { host, format: s.machine_readable, items: 0, dated: 0, undated_kept: 0, kept: 0, past: 0, no_position: 0, outside_zone: 0 };
    let got;
    try { got = (await cached(`venue-${s.id}.raw`, s.feed, { headers: s.request_headers || {}, ...(s.request_body ? { method: 'POST', body: JSON.stringify(s.request_body), headers: { 'Content-Type': 'application/json', ...(s.request_headers || {}) } } : {}) })).buf.toString('utf8'); }
    catch (e) { c.error = e.message.slice(0, 120); continue; }
    let list = [];
    if (s.machine_readable === 'ics') list = parseIcs(got);
    else if (s.machine_readable === 'json') { try { const j = JSON.parse(got); list = parseWpJson(Array.isArray(j) ? j : j.items || j.events || []); } catch { c.error = 'not JSON'; } }
    else list = parseFeedXml(got);
    c.items = list.length;
    const venue = VENUES[host] || (s.venue ? { name: s.venue, postcode: s.postcode } : null);
    for (const it of list) if (it.title && (!EVENT_PATH[host] || EVENT_PATH[host].test(it.link || ''))) raw.push({ s, host, c, venue, it });
  }
  // item postcodes (TH events give an address in <category>)
  const ipc = await postcodes(raw.map(r => (String(r.it.where || '').match(PC) || []).slice(1, 3).join(' ').toUpperCase()).filter(Boolean));
  const items = [], seen = new Set();
  for (const { s, host, c, venue, it } of raw) {
    let start = it.start || it.evStart || null, end = it.end || it.evEnd || null, precision = start ? 'feed event date' : null;
    if (!start && it.acfDates) { const [a, b] = it.acfDates.split(/\s*[-–]\s*(?=\d)/); start = dateIn(a); end = dateIn(b) || start; precision = start ? 'venue listing dates' : null; }
    if (!start && PUBLISHED_IS_EVENT_DATE.has(host) && /T00:00:00/.test(it.published || '')) {   // a time other than midnight is an update time, not an event day
      start = it.published.slice(0, 10); precision = 'feed published date (= event day for this feed)'; }
    if (!start) { const d = dateIn(it.title) || dateIn(decodeURIComponent(String(it.link || '').split('/').pop() || '')); if (d) { start = d; precision = 'date in the title or link'; } }
    const day = start ? String(start).slice(0, 10) : null, last = end ? String(end).slice(0, 10) : day;
    if (day) { c.dated++; if (last < TODAY || day > addDays(TODAY, 180)) { c.past++; continue; } }
    else if (!venue || venue.area) { continue; }
    else c.undated_kept++;
    const pc = (String(it.where || '').match(PC) || []).slice(1, 3).join(' ').toUpperCase() || null;
    const g = (pc && ipc.get(pc)) || (venue && vgeo.get(venue.postcode)) || (s.lat != null ? { lat: s.lat, lon: s.lon } : null);
    if (!g) { c.no_position++; continue; }
    const z = zoneOf(g.lat, g.lon); if (!z) { c.outside_zone++; continue; }
    const id = `venue:${s.id}:${h8((it.link || '') + it.title + (day || ''))}`; if (seen.has(id)) continue; seen.add(id);
    c.kept++;
    items.push({
      id, kind: 'venue event', title: cut(it.title, 160), start: start || null, end: end && end !== start ? end : null, date_from: precision || 'no date in the feed (on the programme)',
      venue: pc && ipc.get(pc) ? cut(it.where, 120) : venue?.name || null, location: (pc && ipc.get(pc) ? cut(it.where, 120) : venue?.name) || null, postcode: pc || venue?.postcode || null,
      borough: g.district || null, lat: r6(g.lat), lon: r6(g.lon), zone: z, placed_by: pc && ipc.get(pc) ? 'postcode in the item' : venue?.area ? 'area of the feed (several venues)' : 'venue of the feed host (postcode)',
      feed: s.id, url: it.link || s.url,
    });
  }
  write('venue-events', { url: 'every verified event feed in feeds/events.json (read at run time)', licence: 'per feed (venue and council websites; titles, dates and links as facts only)',
    attribution: `Event listings of ${[...new Set(items.map(i => i.feed))].length} venue and council feeds; titles, dates and links only, each item links to its source`,
    method: 'Feeds picked from feeds/events.json by category, verified status and event words (harvest: true/false overrides); ICS, RSS/Atom and WordPress REST JSON parsed; one item per event with title, dates, venue and link; dated items from today to 180 days ahead; undated items only from single-venue programmes. Positions: postcode in the item, else the venue of the feed host through its postcode (postcodes.io, ONSPD).',
    venues: VENUES, counts }, items);
}

// ======================= combined =======================
const SOURCES = { 'tfl-lines': tflLines, 'tfl-bus': tflBus, 'tfl-road': tflRoad, 'street-manager': streetManager, gazette, 'th-licences': thLicences, planning, markets, 'venue-events': venueEvents };
function combine() {
  const files = readdirSync(OUT).filter(f => f.endsWith('.json') && f !== 'works.json').sort();
  const items = [], sources = [];
  for (const f of files) {
    const j = JSON.parse(readFileSync(join(OUT, f), 'utf8'));
    sources.push({ id: j.meta.source, file: `feeds/works/${f}`, fetched: j.meta.fetched, licence: j.meta.licence, attribution: j.meta.attribution, url: j.meta.url, items: j.items.length });
    for (const x of j.items) items.push({ id: x.id, source: j.meta.source, kind: x.kind, title: x.title, start: x.start ?? null, end: x.end ?? null, recurring: x.recurring || undefined,
      location: x.location ?? null, street: x.street ?? null, postcode: x.postcode ?? null, borough: x.borough ?? null, lat: x.lat ?? null, lon: x.lon ?? null, zone: x.zone, url: x.url ?? null });
  }
  items.sort((a, b) => String(a.start || '9999').localeCompare(String(b.start || '9999')) || a.id.localeCompare(b.id));
  const kinds = {}; for (const x of items) kinds[x.kind] = (kinds[x.kind] || 0) + 1;
  const out = { meta: { built: TODAY, what: 'Permits, works, closures, planned events and markets in the Docklands zone, from every snapshot in feeds/works/, one normalised list (tools/fetch-works.mjs).',
    zone: { model_box_wgs84: MODEL, east_margin_wgs84: EAST, note: 'zone "model" = the 3D model box (docklands/data/area.js meta.extent); "east" = Royal Docks margin; "line" = a rail line that serves the zone; "borough" = placed only by borough' },
    sources, counts: { items: items.length, kinds } }, items };
  writeFileSync(join(OUT, 'works.json'), JSON.stringify(out) + '\n');
  console.log(`works.json: ${items.length} items from ${sources.length} snapshots`);
}

const ext = areaExtent();
console.log(`zone: BNG E ${ext.E0}-${ext.E1}, N ${ext.N0}-${ext.N1}; WGS84 model ${MODEL.join(', ')}; east margin ${EAST.join(', ')}`);
const want = args.filter(a => !a.startsWith('--'));
for (const w of want) if (!SOURCES[w]) { console.error(`unknown source ${w}; sources: ${Object.keys(SOURCES).join(' ')}`); process.exit(2); }
let failed = 0;
for (const [id, fn] of Object.entries(SOURCES)) {
  if (want.length && !want.includes(id)) continue;
  const t0 = Date.now();
  try { await fn(); console.log(`  ${id}: ${((Date.now() - t0) / 1000).toFixed(0)} s`); }
  catch (e) { failed++; console.error(`${id} FAILED: ${e.message}`); }
}
combine();
if (failed) process.exitCode = 1;
