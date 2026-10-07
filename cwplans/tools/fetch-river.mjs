#!/usr/bin/env node
// River, docks, locks, water quality, moorings and boats across the Docklands zone, as dated snapshots.
//
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-river.mjs                     # every source
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-river.mjs pla-notices levels   # some sources
//   node magpie/cwplans/tools/fetch-river.mjs --no-fetch                              # rebuild from the raw cache, no network
//   node magpie/cwplans/tools/fetch-river.mjs --list                                  # the sources and what each is
//
// Out:  magpie/cwplans/feeds/river/<source>.json  {meta: {source, url, fetched, licence, attribution, method, counts}, items}
//       each item: {id, kind, time or validity, position {lat, lon, precision}, values, url}
// In:   feeds/river/locks-facts.json (hand-written lock rules, with the page each fact came from)
//       data/raw/docklands/greater_london-latest.osm.pbf (tools/fetch-docklands.mjs osm) for the OSM source and positions
// Raw:  magpie/cwplans/data/raw/river/ (gitignored)
// Zone: the 3D model box (WGS84 -0.095, 51.474 to 0.015, 51.522), the east margin of tools/fetch-works.mjs for the
//       Royal Docks (0.015 to 0.085, 51.495 to 51.522) and a strip north to Bow Locks (-0.025 to 0.01, 51.522 to 51.528).
// Polite HTTP: one request at a time per host, at least 1 s apart (Wayback and QLever slower), backoff on 429/5xx/resets,
// User-Agent from tools/lib.mjs. Licences, rules, rejected sources and lessons: skill cwplans-river-and-water
// (magpie/cwplans/skills/cwplans-river-and-water/SKILL.md); sources and counts: magpie/cwplans/feeds/river/README.md.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import proj4 from 'proj4';
import { TOOLS, RAW, UA, qlever } from './lib.mjs';
import { BOX_WGS84 } from './fetch-docklands.mjs';

const CW = join(TOOLS, '..'), OUT = join(CW, 'feeds', 'river'), RAWDIR = join(RAW, 'river');
mkdirSync(OUT, { recursive: true }); mkdirSync(RAWDIR, { recursive: true });
const args = process.argv.slice(2);
const NOFETCH = args.includes('--no-fetch');
const NOW = new Date(), TODAY = NOW.toISOString().slice(0, 10), STAMP = NOW.toISOString().slice(0, 19) + 'Z';
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const h8 = s => createHash('sha1').update(s).digest('hex').slice(0, 12);
const r5 = v => v == null || !isFinite(v) ? null : Math.round(v * 1e5) / 1e5;
const num = v => v == null || v === '' || !isFinite(+v) ? null : +v;

// ---- the zone
const MODEL = BOX_WGS84;                                   // [W, S, E, N]
const EAST = [0.015, 51.495, 0.085, 51.522];              // Royal Docks, ExCeL, City Airport, Woolwich ferry (as fetch-works)
const LEA = [-0.025, 51.522, 0.010, 51.528];              // Bow Creek up to Bow Locks
const OUTER = [-0.095, 51.474, 0.085, 51.528];            // the envelope of the three, for server-side queries
const inB = (b, lat, lon) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
const zoneOf = (lat, lon) => lat == null || lon == null || !isFinite(lat) || !isFinite(lon) ? null
  : inB(MODEL, lat, lon) ? 'model' : inB(EAST, lat, lon) ? 'east' : inB(LEA, lat, lon) ? 'lea' : null;
const BNG = '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs';
const bng2wgs = (e, n) => { const [lon, lat] = proj4(BNG, 'WGS84', [e, n]); return { lat: r5(lat), lon: r5(lon) }; };

// ---- London local time to ISO with offset
function londonISO(date, hm) {
  const [h, m] = hm.split(':').map(Number);
  for (const off of [1, 0]) {                               // BST first, then GMT
    const t = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+0${off}:00`);
    const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
    if (local === `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`) return `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+0${off}:00`;
  }
  return `${date}T${hm}:00`;
}
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const isoDay = (y, mon, d) => `${y}-${String(MONTHS[mon.toLowerCase()]).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// ---- polite HTTP: one request at a time per host, a gap between requests, up to 5 tries with Retry-After or a doubling
// pause on 429, 5xx, timeouts and resets. 4xx other than 429 is not retried.
const GAP = { 'web.archive.org': 3000 }, hostQ = new Map();
function politeFetch(url, opts = {}, { tries = 5, timeoutMs = 90000 } = {}) {
  const host = new URL(url).host, gap = Math.max(1100, GAP[host] || 0);
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
// raw cache: every response is kept under data/raw/river/<source>/; --no-fetch reads it back
// (a URL that carries the run's date or time is cached under a stable key instead, so --no-fetch finds it)
async function cached(source, url, opts = {}, ext = 'json', key = null) {
  const dir = join(RAWDIR, source); mkdirSync(dir, { recursive: true });
  const f = join(dir, `${key || h8(url + (opts.body || ''))}.${ext}`);
  if (NOFETCH) {
    if (!existsSync(f)) throw new Error(`--no-fetch: no raw file for ${url}`);
    return { buf: readFileSync(f), fetched: statSync(f).mtime.toISOString().slice(0, 19) + 'Z' };
  }
  const buf = await politeFetch(url, opts);
  writeFileSync(f, buf);
  return { buf, fetched: STAMP };
}
const getJson = async (source, url, opts) => JSON.parse((await cached(source, url, opts)).buf.toString('utf8'));
const htmlText = s => s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&deg;/g, '°').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();

const LIC = {
  ogl: { licence: 'Open Government Licence v3.0', attribution: 'Contains public sector information licensed under the Open Government Licence v3.0' },
  eaFlood: { licence: 'Open Government Licence v3.0', attribution: 'This uses Environment Agency flood and river level data from the real-time data API (Beta)' },
  tfl: { licence: 'TfL open data terms (Transport Data Service; OGL-based, attribution required). The terms page refuses scripted requests: re-check before production', attribution: 'Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016 and Geomni UK Map data © and database rights [2019]' },
  pla: { licence: 'Not stated: public ArcGIS items of the Port of London Authority carry no licence text. Facts and links only (notice number, title, dates, reach, a centroid and a bounding box); the notice text, the polygons, the internal comments, invoice references and staff names are not copied. Ask the PLA before production', attribution: 'Port of London Authority' },
  crt: { licence: '© Canal & River Trust; no open licence stated for notices (the CRT data licence for its ArcGIS layers excludes commercial use). Facts and links only: title, type, reason, dates, waterway, points, link', attribution: 'Canal & River Trust' },
  operator: { licence: 'All rights reserved by the publisher; published results kept as facts with the page URL and fetch date (crawl for scoping, owner 2026-10-03)', attribution: '' },
  cc0: { licence: 'CC0 1.0 (Wikidata)', attribution: 'Wikidata' },
  odbl: { licence: 'ODbL 1.0 (OpenStreetMap); allowed for now and tracked (owner, 2026-10-03)', attribution: '© OpenStreetMap contributors' },
};
function write(source, meta, items) {
  items.sort((a, b) => String(a.kind).localeCompare(String(b.kind)) || String(a.id).localeCompare(String(b.id)));
  const out = { meta: { source, fetched: meta.fetched || STAMP, ...meta, zone: { model_box_wgs84: MODEL, east_margin_wgs84: EAST, lea_strip_wgs84: LEA }, counts: { items: items.length, ...(meta.counts || {}) } }, items };
  // one line per innermost array of plain values ([time, value] readings, bboxes, coordinate pairs): keeps diffs readable
  const text = JSON.stringify(out, null, 1).replace(/\[\n\s*([^\[\]{}]*?)\n\s*\]/g, (_, inner) => `[${inner.replace(/,\n\s*/g, ',')}]`);
  writeFileSync(join(OUT, `${source}.json`), text + '\n');
  console.log(`${source}: ${items.length} items -> feeds/river/${source}.json`);
}
const pos = (lat, lon, precision) => ({ lat: r5(lat), lon: r5(lon), precision, zone: zoneOf(lat, lon) });

// ---- OSM through osmium (local extract; no network)
const PBF = join(CW, 'data/raw/docklands/greater_london-latest.osm.pbf');
let osmCache = null;
function osmFeatures() {
  if (osmCache) return osmCache;
  if (!existsSync(PBF)) throw new Error(`no OSM extract at ${PBF}: run tools/fetch-docklands.mjs osm`);
  const clip = join(RAWDIR, 'zone.osm.pbf'), filt = join(RAWDIR, 'river.osm.pbf'), out = join(RAWDIR, 'river.geojsonseq');
  const run = (cmd, a) => { const r = spawnSync(cmd, a, { encoding: 'utf8' }); if (r.status) throw new Error(`${cmd} ${a.join(' ')}: ${r.stderr}`); };
  run('osmium', ['extract', '-b', OUTER.join(','), PBF, '-o', clip, '--overwrite', '-s', 'smart']);
  run('osmium', ['tags-filter', clip, 'nwr/mooring', 'nwr/leisure=marina,slipway', 'nwr/man_made=pier', 'nwr/waterway=lock_gate,dock,boatyard,sluice_gate,security_lock',
    'nwr/lock=yes', 'nwr/amenity=ferry_terminal,boat_rental', 'nwr/building=houseboat,ship', 'nwr/houseboat', 'nwr/historic=ship,wreck', 'nwr/man_made=ship',
    'nwr/seamark:type', 'nwr/bridge:movable', '-o', filt, '--overwrite']);
  run('osmium', ['export', filt, '-f', 'geojsonseq', '-o', out, '--overwrite', '-a', 'type,id']);
  const head = spawnSync('osmium', ['fileinfo', '-e', '-g', 'header.option.osmosis_replication_timestamp', PBF], { encoding: 'utf8' }).stdout.trim();
  osmCache = { asOf: head || null, features: readFileSync(out, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l.replace(/^\x1e/, ''))) };
  return osmCache;
}
function ringsOf(g) { return g.type === 'Point' ? [[g.coordinates]] : g.type === 'LineString' ? [g.coordinates] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : g.type === 'MultiLineString' ? g.coordinates : []; }
function centroid(g) { let x = 0, y = 0, n = 0; for (const r of ringsOf(g)) for (const [lon, lat] of r) { x += lon; y += lat; n++; } return n ? { lon: x / n, lat: y / n } : null; }
// a point in the west or east fifth of a polygon (for "Royal Victoria Dock, West" and the like)
function endOf(g, side) {
  const pts = ringsOf(g).flat(); const lons = pts.map(p => p[0]); const lo = Math.min(...lons), hi = Math.max(...lons), w = (hi - lo) * 0.2;
  const sel = pts.filter(p => side === 'west' ? p[0] <= lo + w : p[0] >= hi - w);
  return { lon: sel.reduce((s, p) => s + p[0], 0) / sel.length, lat: sel.reduce((s, p) => s + p[1], 0) / sel.length };
}

// ======================= 1. PLA notices to mariners (harbourmaster) =======================
const NTM = 'https://maps.pla.co.uk/server/rest/services/Hosted/NtMs_Live/FeatureServer/0';
function ntmKind(t) {
  t = String(t || '');
  return /barrier/i.test(t) ? 'thames-barrier' : /exclusion zone/i.test(t) ? 'exclusion-zone' : /closure|closed/i.test(t) ? 'closure'
    : /survey/i.test(t) ? 'survey' : /tide tables|publication/i.test(t) ? 'publication'
      : /event|regatta|race|salute|firework|festival|swim|barge driving|celebrat/i.test(t) ? 'event'
        : /works|repair|scaffold|pontoon|dredg|piling|construct|install|removal|bridge|arch|cable|outfall/i.test(t) ? 'works' : 'notice';
}
async function plaNotices() {
  const fields = 'id,district,name,reach_from,reach_to,title,start_date,end_date,last_edited,issuer_title,link,closure,published,archived';
  const url = `${NTM}/query?where=1%3D1&geometry=${OUTER.join(',')}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${fields}&returnGeometry=true&outSR=4326&f=json`;
  const r = await cached('pla-notices', url); const d = JSON.parse(r.buf.toString('utf8'));
  const items = [];
  for (const f of d.features || []) {
    const a = f.attributes, pts = (f.geometry?.rings || []).flat();
    if (!pts.length) continue;
    const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
    const bbox = [r5(Math.min(...lons)), r5(Math.min(...lats)), r5(Math.max(...lons)), r5(Math.max(...lats))];
    const c = { lon: lons.reduce((s, v) => s + v, 0) / lons.length, lat: lats.reduce((s, v) => s + v, 0) / lats.length };
    const number = (String(a.link || '').match(/notices\/([A-Z]+\d+-\d+)/) || [])[1] || a.name;
    const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
    items.push({
      id: `pla-ntm:${number}`, kind: ntmKind(a.title), title: String(a.title || '').trim(),
      validity: { start: a.start_date || null, end: a.end_date || null },
      position: { ...pos(c.lat, c.lon, 'mean of the notice polygon vertices'), bbox },
      values: { notice: number, district: a.district, reach_from: a.reach_from, reach_to: a.reach_to, closure: a.closure === 'Yes', issued_by_role: a.issuer_title || null,
        scope: span > 0.3 ? 'portwide (polygon over 0.3 degrees)' : 'local', archived: a.archived === 'Yes', last_edited: a.last_edited || null, layer_object_id: a.objectid ?? a.id },
      url: a.link || null,
    });
  }
  const kinds = {}; for (const i of items) kinds[i.kind] = (kinds[i.kind] || 0) + 1;
  write('pla-notices', { fetched: r.fetched, url, layer: NTM, ...LIC.pla, method: 'ArcGIS REST query of the PLA live Notices to Mariners layer (NtMs_Live) with the zone envelope, every notice whose polygon intersects it. pla.co.uk itself answers scripts with a Cloudflare challenge; this map server does not. The notice number comes from the link (the name field holds placeholders such as "M##-25"). kind is classified from the title by keyword (thames-barrier, exclusion-zone, closure, survey, publication, event, works, notice).', counts: { kinds, closures: items.filter(i => i.values.closure).length, portwide: items.filter(i => i.values.scope !== 'local').length } }, items);
}

// ======================= 2. Canal & River Trust stoppages and notices =======================
// The notices page (https://canalrivertrust.org.uk/notices) loads its list from this JSON endpoint (found by watching the
// page's own requests in a headless browser, 2026-10-04). robots.txt disallows only /meetings/, /admin/ and /private/.
// Type and reason names: the lookups embedded in the notices page on 2026-10-04.
const CRT_TYPES = { 1: 'Navigation Closure', 2: 'Navigation Restriction', 3: 'Towpath Closure', 4: 'Advice', 8: 'Towpath Restriction', 9: 'Navigation and Towpath Closure', 10: 'Customer Service Facility', 11: 'Navigation Restriction and Towpath Closure' };
const CRT_REASONS = { 2: '3rd Party Works', 5: 'Inspections', 6: 'Maintenance', 8: 'Repair', 9: 'Suspected Vandalism', 10: 'Vegetation', 12: 'Information', 13: 'Event', 14: 'Boating Incident', 15: 'Emergency Services Incident', 16: 'Underwater Obstruction', 17: 'Vehicle Incident', 18: 'Low Water Levels', 19: 'High Water Levels', 20: 'Pollution Incident' };
const CRT_PROGRAMMES = { 1: 'notice', 2: 'winter works programme' };
async function crtNotices() {
  const start = addDays(TODAY, -60), end = addDays(TODAY, 240);
  const url = `https://canalrivertrust.org.uk/api/stoppage/notices?consult=false&start=${start}&end=${end}&fields=title%2Cregion%2Cwaterways%2Cpath%2CtypeId%2CreasonId%2CprogrammeId%2Cstart%2Cend%2Cstate&geometry=point`;
  const r = await cached('crt-notices', url, {}, 'json', 'notices-window'); const d = JSON.parse(r.buf.toString('utf8'));
  const items = [];
  for (const f of d.features || []) {
    const pts = (f.geometry?.geometries || []).filter(g => g.type === 'Point').map(g => g.coordinates);
    const inz = pts.filter(([lon, lat]) => zoneOf(lat, lon));
    if (!inz.length) continue;
    const p = f.properties, type = CRT_TYPES[p.typeId] || `type ${p.typeId}`;
    items.push({
      id: `crt-notice:${p.id}`, kind: /Closure/.test(type) ? 'closure' : /Restriction/.test(type) ? 'restriction' : 'advice', title: String(p.title || '').replace(/\s+/g, ' ').trim(),
      validity: { start: p.start || null, end: p.end || null, open_ended: !p.end },
      position: { ...pos(inz[0][1], inz[0][0], 'first CRT notice point in the zone'), points: pts.map(([lon, lat]) => [r5(lon), r5(lat)]) },
      values: { type, reason: CRT_REASONS[p.reasonId] || `reason ${p.reasonId}`, programme: CRT_PROGRAMMES[p.programmeId] || p.programmeId, waterways: p.waterways, region: p.region, state: p.state },
      url: `https://canalrivertrust.org.uk${p.path}`,
    });
  }
  write('crt-notices', { fetched: r.fetched, url, page: 'https://canalrivertrust.org.uk/notices', ...LIC.crt, method: `The JSON endpoint behind the CRT notices page, all notices from ${start} to ${end} (England and Wales, ${(d.features || []).length} notices), kept when one of the notice's points lies in the zone. Type, reason and programme names from the lookups embedded in the notices page (2026-10-04).`, window: { start, end }, counts: { national: (d.features || []).length } }, items);
}

// ======================= 3. Thames Barrier planned closures (GOV.UK, OGL) and EA flood alerts =======================
async function barrier() {
  const url = 'https://www.gov.uk/api/content/guidance/the-thames-barrier';
  const r = await cached('thames-barrier', url); const d = JSON.parse(r.buf.toString('utf8'));
  const body = d.details?.body || '', items = [];
  const table = (body.match(/<table[\s\S]*?<\/table>/) || [''])[0];
  for (const tr of table.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
    const td = [...tr.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(m => htmlText(m[1]));
    const m = td[0] && td[0].match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/);
    if (!m || !MONTHS[m[2].toLowerCase()]) continue;
    const day = isoDay(m[3], m[2], m[1]);
    items.push({ id: `thames-barrier:test-${day}`, kind: 'planned-closure', time: { start: londonISO(day, td[2]), end: londonISO(day, td[3]) },
      position: pos(51.49689, 0.03729, 'Thames Barrier (OSM node 389783501)'), values: { purpose: 'monthly maintenance and test closure', weekday: td[1], approximate: true, past: day < TODAY }, url: 'https://www.gov.uk/guidance/the-thames-barrier' });
  }
  const text = htmlText(body), closures = text.match(/closed (\d+) times for flood defence purposes[^.]*?correct as at (\d{1,2} [A-Za-z]+ \d{4})/);
  const split = text.match(/(\d+) were to protect against tidal flooding (\d+) were to protect against combined/);
  write('thames-barrier', { fetched: r.fetched, url, page: 'https://www.gov.uk/guidance/the-thames-barrier', ...LIC.ogl, page_updated: d.public_updated_at,
    method: 'GOV.UK content API for the Thames Barrier guidance page: the table "Planned tests of the Thames Barrier" (date, weekday, approximate river closure start and end, London time). The page says closures may start up to an hour early and may be cancelled. No machine-readable feed of flood-defence closures was found; the live signal is the DIFF_* level differences in levels.json.',
    totals: closures ? { flood_defence_closures: +closures[1], as_at: closures[2], tidal: split ? +split[1] : null, tidal_fluvial: split ? +split[2] : null } : null }, items);

  const furl = 'https://environment.data.gov.uk/flood-monitoring/id/floods?lat=51.505&long=0&dist=15';
  const fr = await cached('ea-flood-warnings', furl); const fd = JSON.parse(fr.buf.toString('utf8'));
  const fitems = (fd.items || []).map(w => ({ id: `ea-flood:${w.floodAreaID}`, kind: w.severityLevel <= 2 ? 'flood-warning' : w.severityLevel === 3 ? 'flood-alert' : 'warning-removed',
    time: { raised: w.timeRaised || null, severity_changed: w.timeSeverityChanged || null, message_changed: w.timeMessageChanged || null },
    position: null, values: { severity: w.severity, severity_level: w.severityLevel, area: w.eaAreaName, description: w.description, flood_area: w.floodAreaID, tidal: w.isTidal }, url: `https://check-for-flooding.service.gov.uk/target-area/${w.floodAreaID}` }));
  write('ea-flood-warnings', { fetched: fr.fetched, url: furl, ...LIC.eaFlood, method: 'EA real-time flood-monitoring API: flood alerts and warnings in force within 15 km of 51.505, 0 at fetch time (an empty list means none in force). The flood area polygons are at /id/floodAreas/{id}/polygon.' }, fitems);
}

// ======================= 4. River and tide levels: Thames, the barrier, the Lea and the Ravensbourne =======================
const LEVEL_STATIONS = [
  ['0007', 'Thames tideway'], ['0001', 'Thames tideway'], ['0003', 'Thames tideway'], ['0006', 'Thames tideway'], ['4410TH', 'Thames tideway'],
  ['DIFF_TB3_TB1', 'Thames Barrier level difference'], ['DIFF_TB2_TB1', 'Thames Barrier level difference'], ['DIFF_TB2_TB9', 'Thames Barrier level difference'],
  ['DIFF_TB3_TB9', 'Thames Barrier level difference'], ['DIFF_WestUR_EastDR', 'Thames Barrier level difference'], ['DIFF_EastUR_WestDR', 'Thames Barrier level difference'],
  ['5390TH', 'River Lee (Lea), feeder of Bow Creek'], ['5380TH', 'River Lee (Lea), feeder of Bow Creek'],
  ['4370TH', 'River Ravensbourne, feeder of Deptford Creek'], ['4326TH', 'River Ravensbourne, feeder of Deptford Creek'], ['4389TH', 'River Quaggy, tributary of the Ravensbourne'],
];
async function levels() {
  const since = new Date(NOW - 48 * 3600e3).toISOString().slice(0, 19) + 'Z', items = []; let fetched = STAMP;
  for (const [id, group] of LEVEL_STATIONS) {
    const st = (await getJson('levels', `https://environment.data.gov.uk/flood-monitoring/id/stations/${id}`)).items;
    const s = Array.isArray(st) ? st[0] : st;
    const rd = await cached('levels', `https://environment.data.gov.uk/flood-monitoring/id/stations/${id}/readings?since=${since}&_sorted&_limit=10000`, {}, 'json', `readings-${id}`);
    fetched = rd.fetched;
    const readings = JSON.parse(rd.buf.toString('utf8')).items || [];
    const measures = (Array.isArray(s.measures) ? s.measures : [s.measures]).filter(Boolean);
    for (const m of measures) {
      const all = readings.filter(x => x.measure === m['@id']).map(x => [x.dateTime, num(x.value)]).filter(x => x[1] != null).sort((a, b) => a[0].localeCompare(b[0]));
      // the DIFF_* stations publish about once a minute: keep the first reading in each 15-minute slot, and the latest
      const slot = t => Math.floor(Date.parse(t) / 9e5), rs = all.filter((x, i) => i === 0 || slot(x[0]) !== slot(all[i - 1][0]) || i === all.length - 1);
      const last = rs[rs.length - 1];
      if (!last) continue;                                    // the station lists measures that publish nothing
      items.push({ id: `ea-level:${m.notation || m['@id'].split('/').pop()}`, kind: /m3\/s/.test(m.unitName || '') ? 'river-flow' : group.startsWith('Thames Barrier') ? 'barrier-difference' : group.startsWith('Thames') ? 'tide-level' : 'river-level',
        time: last ? last[0] : null, position: s.lat != null ? pos(+s.lat, +s.long, 'EA station position') : null,
        values: { station: id, label: s.label, river: s.riverName || group, group, parameter: m.parameterName, qualifier: m.qualifier, unit: m.unitName, latest: last ? last[1] : null,
          typical_range: s.stageScale ? { low: s.stageScale.typicalRangeLow ?? null, high: s.stageScale.typicalRangeHigh ?? null } : null, readings: rs },
        url: `https://check-for-flooding.service.gov.uk/station/${s.RLOIid || ''}`.replace(/\/$/, '') });
    }
  }
  write('levels', { fetched, url: 'https://environment.data.gov.uk/flood-monitoring/id/stations/{id}/readings?since=...', ...LIC.eaFlood,
    method: 'EA real-time flood-monitoring API, the last 48 hours of 15-minute readings for the Thames tideway gauges (Tower Pier, Silvertown, Charlton, Westminster, Charlton TL), the Thames Barrier DIFF_* level-difference stations, and the nearest level gauges on the two feeder rivers: the Lee at Lea Bridge and Low Hall, the Ravensbourne at Catford Hill and Beckenham Park, the Quaggy at Manor House Gardens. No EA gauge exists on tidal Bow Creek or Deptford Creek. Series that publish about once a minute (DIFF_*) are thinned to the first reading in each 15-minute slot plus the latest. Values as published (m, m AOD for tidal levels); no cleaning: see fault F21 (Tower Pier at low water) before using the tideway values.',
    window_since: since, counts: { stations: LEVEL_STATIONS.length } }, items);
}

// ======================= 5. Locks: hand-written rules (locks-facts.json) + OSM positions + live CRT notices =======================
async function locks() {
  const facts = JSON.parse(readFileSync(join(OUT, 'locks-facts.json'), 'utf8'));
  const osm = osmFeatures(), byId = new Map(osm.features.map(f => [`${f.properties['@type']}/${f.properties['@id']}`, f]));
  let crt = []; try { crt = JSON.parse(readFileSync(join(OUT, 'crt-notices.json'), 'utf8')).items; } catch {}
  const items = [], checks = {};
  for (const L of facts.locks) {
    const f = L.osm && byId.get(L.osm), c = f ? centroid(f.geometry) : L.position;
    for (const s of L.sources || []) {                          // is each cited page still there?
      if (checks[s.url] !== undefined) continue;
      try { await cached('locks', s.url, {}, 'html'); checks[s.url] = 'HTTP 200'; } catch (e) { checks[s.url] = e.message.split(' ').slice(0, 2).join(' '); }
    }
    const notices = crt.filter(n => (L.crt_match || []).some(k => new RegExp(k, 'i').test(`${n.title} ${n.values.waterways}`))).map(n => ({ id: n.id, title: n.title, type: n.values.type, reason: n.values.reason, validity: n.validity, url: n.url }));
    items.push({ id: `lock:${L.id}`, kind: 'lock', name: L.name, position: c ? pos(c.lat, c.lon, f ? `centroid of OSM ${L.osm}` : 'hand-placed') : null,
      values: { operator: L.operator, links: L.links, status: L.status, window: L.window || null, hours: L.hours || null, booking: L.booking || null, dimensions: L.dimensions || null,
        conflicts: L.conflicts || null, notes: L.notes || null, crt_notices: notices, sources: (L.sources || []).map(s => ({ ...s, checked: checks[s.url] })) }, url: (L.sources || [])[0]?.url || null });
  }
  write('locks', { url: 'feeds/river/locks-facts.json (hand-written) + OSM + crt-notices.json', ...LIC.operator, licence: 'Lock rules: facts paraphrased from the operators\' pages (CRT, Southwark Council, PLA; all rights reserved), each with its URL and the date read. Positions: OpenStreetMap (ODbL). Notices: crt-notices.json', attribution: '© OpenStreetMap contributors; Canal & River Trust; Southwark Council',
    method: 'Each lock in locks-facts.json gets its position from the OSM element named there (centroid), its live CRT notices by keyword from crt-notices.json (run crt-notices first), and a fresh HTTP check of every cited page. The rules are not parsed from the pages: they were read by hand and written as structured windows (hours either side of high or low water at a named place).',
    osm_data_as_of: osm.asOf, counts: { pages_checked: Object.keys(checks).length } }, items);
}

// ======================= 6. Water quality: Eden Dock (Sea Lanes), Royal Docks (RoDMA), EA sondes, EA WIMS =======================
async function edenDock() {
  const wqUrl = 'https://sealanescanarywharf.co.uk/water-quality/', swimUrl = 'https://sealanescanarywharf.co.uk/swimming/';
  const wq = await cached('eden-dock', wqUrl, {}, 'html'), sw = await cached('eden-dock', swimUrl, {}, 'html');
  const html = wq.buf.toString('utf8'), items = [];
  const osm = osmFeatures(), dock = osm.features.find(f => f.properties['@type'] === 'relation' && f.properties['@id'] === 18985240);
  const c = dock ? centroid(dock.geometry) : { lat: 51.50397, lon: -0.02239 };
  const P = pos(c.lat, c.lon, dock ? 'centroid of OSM relation/18985240 (Eden Dock)' : 'hand-placed, Eden Dock');
  const table = (html.match(/<table class="wq-readings-table">[\s\S]*?<\/table>/) || [''])[0];
  for (const tr of table.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
    const td = [...tr.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(m => htmlText(m[1]));
    const m = td[0] && td[0].match(/^([A-Za-z]+) (\d{1,2}),? (\d{4})$/);
    if (!m || !MONTHS[m[1].toLowerCase()]) continue;
    const day = isoDay(m[3], m[1], m[2]);
    items.push({ id: `eden-dock:sample-${day}`, kind: 'bathing-sample', time: day, position: P,
      values: { rating: td[1], e_coli_cfu_100ml: num(td[2]), intestinal_enterococci_cfu_100ml: num(td[3]), standard: 'EU / England inland bathing water thresholds as quoted on the page (Excellent: EC <= 500, IE <= 200 cfu/100 ml)' }, url: wqUrl });
  }
  const t = sw.buf.toString('utf8').match(/weather-item-value">([\d.]+)&deg;C<\/span>\s*<span class="weather-item-label">\s*Water Temperature/);
  if (t) items.push({ id: `eden-dock:temperature-${sw.fetched.slice(0, 16)}`, kind: 'water-temperature', time: sw.fetched, position: P,
    values: { temperature_c: +t[1], note: 'the value the Swimming page showed when fetched; the page does not say when it was measured' }, url: swimUrl });
  write('eden-dock', { fetched: wq.fetched, url: wqUrl, ...LIC.operator, attribution: 'Sea Lanes Canary Wharf (SeaLanes Brighton Limited); tests by Canary Wharf Group and Love Open Water per the operator',
    method: 'The table "Latest test results" (date, rating, E. coli and intestinal enterococci in cfu/100 ml) on the Sea Lanes Canary Wharf water-quality page, and the water temperature shown on its Swimming page at fetch time. Eden Dock is the enclosed part of Middle Dock, West India Docks; the operator says it is fed by groundwater and cut off from the Thames, tested fortnightly. These are the operator\'s figures, not an EA bathing-water classification: Eden Dock is not a designated bathing water.',
    counts: { samples: items.filter(i => i.kind === 'bathing-sample').length } }, items);
}

// the certificate's sample pages say "Royal George V Dock"; its overview page and OSM say King George V Dock
const DOCK_ALIAS = { 'Royal George V Dock': 'King George V Dock' };
const cyano = b => [...b.matchAll(/([A-Z]\w+ sp\.)\s*\n\(Phylum: ([^,]+), Order:\s*\n(\w+)\) (\d+) cells\s*\ncolonies\/ml\s*\n(\d+)\s*\n(\d+) ([^\n]+)/g)]
  .map(m => ({ taxon: m[1], phylum: m[2], order: m[3], size_class_cells: +m[4], colonies_ml: +m[5], result_as_printed: +m[6], interpretation: m[7].trim() }));
const RODMA_DOCS = 'https://royaldockswaterways.com/impact-responsibility/documents/';
async function royalDocks() {
  const page = await cached('royal-docks', RODMA_DOCS, {}, 'html');
  const html = page.buf.toString('utf8');
  const pdfs = [...new Set([...html.matchAll(/href="([^"]+\.pdf)"[^>]*>\s*Water Quality Testing Results[^<]*</gi)].map(m => m[1]))];
  const items = [], certs = [];
  const osm = osmFeatures(), dockGeom = name => osm.features.find(f => f.properties.name === name && f.properties.waterway === 'dock' && f.geometry.type !== 'Point');
  for (const u of pdfs) {
    const pr = await cached('royal-docks', u, {}, 'pdf');
    const pdfFile = join(RAWDIR, 'royal-docks', `${h8(u)}.pdf`);
    const txt = spawnSync('pdftotext', ['-layout', pdfFile, '-'], { encoding: 'utf8' });
    if (txt.status) throw new Error(`pdftotext failed (apt-get install -y poppler-utils): ${txt.stderr}`);
    // -raw keeps each cyanobacteria row in reading order: taxon, size class ("50 cells"), the number printed under the unit
    // "colonies/ml", then the result column. The result is often colonies x size class (48 x 50 = 2400) but not always
    // (Oscillatoria 50 and 50), so both numbers are kept as printed and neither is called cells/ml
    const raw = spawnSync('pdftotext', ['-raw', pdfFile, '-'], { encoding: 'utf8' }).stdout || '';
    const rawBlocks = Object.fromEntries(raw.split(/(?=Sample \d+: )/).slice(1).map(b => [(b.match(/^Sample \d+: (\w+)/) || [])[1], b]));
    const T = txt.stdout, ref = (T.match(/Certificate Reference:\s*(\S+)/) || [])[1], date = (T.match(/Date sample taken\s+(\d{2})\/(\d{2})\/(\d{4})/) || []);
    const day = date[3] ? `${date[3]}-${date[2]}-${date[1]}` : null, timeTaken = (T.match(/Time sample taken\s+([\d:.\-]+)/) || [])[1] || null;
    certs.push({ url: u, certificate: ref, sampled: day, report_date: (T.match(/Report Date:\s*(\S+)/) || [])[1] || null, fetched: pr.fetched });
    for (const block of T.split(/(?=Sample \d+: )/).slice(1)) {
      const h = block.match(/^Sample (\d+): (\w+) \(([^)]+)\)/); if (!h) continue;
      const v = re => { const m = block.match(re); return m ? num(m[1]) : null; };
      const [asWritten, side] = h[3].split(/,\s*/), dockName = DOCK_ALIAS[asWritten] || asWritten;
      const g = dockGeom(dockName), e = g && side ? endOf(g.geometry, side.toLowerCase()) : null;
      items.push({ id: `royal-docks:${ref}-${h[2]}`, kind: 'bathing-sample', time: day && timeTaken ? `${day} ${timeTaken} (London time)` : day,
        position: e ? pos(e.lat, e.lon, `approximate: the ${side.toLowerCase()} fifth of OSM ${g.properties['@type']}/${g.properties['@id']} (${dockName}); the certificate's map gives no coordinates`) : null,
        values: { site: h[2], location: `${dockName}, ${side}`, location_as_written: h[3], pH: v(/\bpH\s+([\d.]+)/), conductivity_us_cm: v(/Electrical Conductivity\s+µS\/cm, 25°C\s+([\d.]+)/), temperature_c: v(/Water Temperature\s+°C\s+([\d.]+)/),
          dissolved_oxygen_mg_l: v(/Dissolved Oxygen\s+mg\/l\s+([\d.]+)/), dissolved_oxygen_pct: v(/Dissolved Oxygen\s*\n\s*%\s+([\d.]+)/),
          e_coli_per_100ml: v(/E\.\s?coli\s+no\/100 ml\s+([\d.]+)/), enterococci_per_100ml: v(/Enterococci\s+no\/100 ml\s+([\d.]+)/),
          interpretation_e_coli: (block.match(/E\.\s?coli\s+no\/100 ml\s+[\d.]+\s+([A-Za-z ]+?)\s*\n/) || [])[1] || null,
          cyanobacteria: cyano(rawBlocks[h[2]] || ''),
          certificate: ref }, url: u });
    }
  }
  write('royal-docks', { fetched: page.fetched, url: RODMA_DOCS, ...LIC.operator, attribution: 'Royal Docks Waterways (Royal Docks Management Authority, RoDMA); sampling by Swim Safety (swim-safety.co.uk) per the certificate',
    method: 'The "Water Quality Testing Results" PDF(s) linked from the Royal Docks Waterways documents page, converted with pdftotext -layout; per sample: site code, dock and end, pH, conductivity, temperature, dissolved oxygen, E. coli and enterococci (no/100 ml) with the laboratory\'s interpretation, and cyanobacteria counts. Positions are approximate (west or east part of the named dock from OSM). The open-water swimming venue (Love Open Water, Royal Victoria Dock) says it is reopening in summer 2026.',
    certificates: certs, counts: { certificates: certs.length } }, items);
}

const SONDES = ['CADOG2', 'BARIERA', 'ERITH1'];
// plausibility rules for a tidal Thames sonde (fault F24): the value is kept and flagged, never changed
const SUSPECT = [[/^PH$/i, v => v < 6 || v > 9.5, 'pH outside 6 to 9.5 (estuary water is about 7 to 8.5)'], [/Turbidity/i, v => v < 0, 'negative turbidity'],
  [/Ammonium/i, v => v > 50, 'ammonium over 50 mg/L (river values are below about 10)'], [/Dissolved Oxygen/i, v => v < 0, 'negative oxygen']];
async function sondes() {
  const since = addDays(TODAY, -2), items = []; let fetched = STAMP;
  for (const st of SONDES) {
    const s = (await getJson('ea-sondes', `https://environment.data.gov.uk/hydrology/id/stations/${st}`)).items[0];
    const ms = (await getJson('ea-sondes', `https://environment.data.gov.uk/hydrology/id/measures?station=http://environment.data.gov.uk/hydrology/id/stations/${st}`)).items;
    for (const m of ms) {
      const r = await cached('ea-sondes', `https://environment.data.gov.uk/hydrology/id/measures/${m.notation}/readings?min-date=${since}&_limit=2000`, {}, 'json', `readings-${m.notation}`); fetched = r.fetched;
      const rs = (JSON.parse(r.buf.toString('utf8')).items || []).map(x => [x.dateTime, num(x.value), x.quality]).filter(x => x[1] != null).sort((a, b) => a[0].localeCompare(b[0]));
      const last = rs[rs.length - 1];
      if (!last) continue;
      const suspect = SUSPECT.find(([re, test]) => re.test(m.parameterName) && test(last[1]));
      items.push({ id: `ea-sonde:${m.notation}`, kind: 'water-quality-reading', time: last ? last[0] : null, position: pos(+s.lat, +s.long, 'EA station position'),
        values: { station: st, label: s.label, parameter: m.parameterName, unit: m.unitName, latest: last[1], latest_quality: last[2], suspect: suspect ? suspect[2] : null, readings: rs.map(x => [x[0], x[1]]) },
        url: `https://environment.data.gov.uk/hydrology/station/${s.stationGuid || st}` });
    }
  }
  write('ea-sondes', { fetched, url: 'https://environment.data.gov.uk/hydrology/id/measures/{measure}/readings?min-date=...', ...LIC.ogl,
    method: `EA Hydrology API, the continuous water-quality sondes on the tidal Thames nearest the zone: Cadogan Pier (upstream, Chelsea), Thames Barrier Gardens Pier (BARIERA, 4 km below Canary Wharf) and Erith barge (downstream). Every measure (temperature, dissolved oxygen mg/L and %, ammonium, conductivity, pH, turbidity, salinity) from ${since}; readings are published with a delay and marked Unchecked. None of the 1,912 dissolved-oxygen stations lies inside the zone box. Measures with no readings in the window are left out; implausible latest values are flagged in values.suspect (fault F24), not removed.`, counts: { stations: SONDES.length, suspect: items.filter(i => i.values.suspect).length } }, items);
}

const WIMS = 'https://environment.data.gov.uk/water-quality';
const WIMS_WATER = /ESTUARINE|RIVERS|FRESHWATER - UNSPECIFIED|LAKES|CANALS|COASTAL|BATHING/;
async function wims() {
  const H = { headers: { Accept: 'application/ld+json' } }, seen = new Map();
  for (const [la, lo, rad] of [[51.498, -0.045, 5], [51.505, 0.045, 4.5], [51.52, -0.01, 2]]) {
    for (let skip = 0; ; skip += 250) {
      const d = await getJson('ea-wims', `${WIMS}/sampling-point?latitude=${la}&longitude=${lo}&radius=${rad}&limit=250&skip=${skip}`, H);
      for (const m of d.member || []) seen.set(m.notation, m);
      if (!d.member || d.member.length < 250) break;
    }
  }
  const items = [];
  for (const m of seen.values()) {
    const g = (m.geometry?.asWKT || '').match(/POINT\(([\d.]+) ([\d.]+)\)/); if (!g) continue;
    const p = bng2wgs(+g[1], +g[2]); if (!zoneOf(p.lat, p.lon)) continue;
    const type = m.samplingPointType?.prefLabel || '', open = m.samplingPointStatus?.prefLabel === 'OPEN';
    const it = { id: `ea-wims:${m.notation}`, kind: /DISCHARGE/.test(type) ? 'discharge-point' : WIMS_WATER.test(type) ? 'water-sampling-point' : 'other-sampling-point',
      position: pos(p.lat, p.lon, `EA grid reference ${g[1]} ${g[2]} (BNG, converted with a Helmert transform, about 5 m)`),
      values: { name: m.prefLabel, type, status: m.samplingPointStatus?.prefLabel, area: m.area?.prefLabel }, url: `${WIMS}/sampling-point/${m.notation}` };
    if (it.kind === 'water-sampling-point') {                   // the latest observations (the list is oldest first)
      const head = await getJson('ea-wims', `${WIMS}/sampling-point/${m.notation}/observation?limit=1`, H), total = head.totalItems || 0;
      it.values.observations = total;
      if (total) {
        const tail = await getJson('ea-wims', `${WIMS}/sampling-point/${m.notation}/observation?limit=60&skip=${Math.max(0, total - 60)}`, H);
        const obs = (tail.member || []).map(o => ({ t: o.phenomenonTime, p: o.observedProperty?.prefLabel, v: o.hasResult?.numericValue ?? o.hasSimpleResult, u: o.hasUnit })).sort((a, b) => String(a.t).localeCompare(String(b.t)));
        const lastT = obs.length ? obs[obs.length - 1].t : null;
        it.time = lastT; it.values.latest_sample = obs.filter(o => o.t === lastT).map(o => ({ determinand: o.p, value: o.v, unit: o.u }));
        it.values.first_of_last_60 = obs.length ? obs[0].t : null;
      }
    }
    items.push(it);
  }
  write('ea-wims', { url: `${WIMS}/sampling-point?latitude=..&longitude=..&radius=..`, ...LIC.ogl,
    method: 'EA Water Quality Archive API (2025 version, Accept: application/ld+json): every sampling point from three radius searches that cover the zone, kept when its BNG point converts into the zone. For open and closed water sampling points (estuarine, rivers, freshwater, lakes, canals) the last 60 observations are read and the latest sample kept. Discharge points are trade and sewage outfalls (organisation names; cwplans exception).',
    counts: { points: items.length, water_points: items.filter(i => i.kind === 'water-sampling-point').length, open: items.filter(i => i.values.status === 'OPEN').length } }, items);
}

// Storm overflows (Thames Water EDM via Stream, CC BY 4.0) are fetched by tools/fetch-live.mjs into feeds/live/overflows.json;
// not repeated here.

// ======================= 7. Boats: TfL river buses, OSM moorings and boats, PLA moorings, Wikidata vessels =======================
const TFL = 'https://api.tfl.gov.uk';
async function riverBus() {
  const lines = await getJson('river-bus', `${TFL}/Line/Mode/river-bus`), items = [], piers = new Map(), errors = [];
  for (const l of lines) for (const dir of ['outbound', 'inbound']) {
    let seq; try { seq = await getJson('river-bus', `${TFL}/Line/${l.id}/Route/Sequence/${dir}`); } catch (e) { errors.push(e.message); continue; }
    const main = (seq.stopPointSequences || []).sort((a, b) => b.stopPoint.length - a.stopPoint.length)[0]; if (!main) continue;
    const stops = main.stopPoint.map(s => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, zone: zoneOf(s.lat, s.lon) }));
    for (const s of stops) if (s.zone) piers.set(s.id, s);
    const ls = (seq.lineStrings || [])[0]; let line = null;
    try { line = JSON.parse(ls)[0].map(([lon, lat]) => [r5(lon), r5(lat)]); } catch {}
    items.push({ id: `tfl-river:${l.id}:${dir}:route`, kind: 'river-bus-route', position: null, values: { line: l.id, name: l.name, direction: dir, stops: stops.map(s => ({ id: s.id, name: s.name, lat: r5(s.lat), lon: r5(s.lon), in_zone: !!s.zone })), line_string: line }, url: `${TFL}/Line/${l.id}/Route/Sequence/${dir}` });
    const first = stops.find(s => s.zone); if (!first) continue;
    let tt; try { tt = await getJson('river-bus', `${TFL}/Line/${l.id}/Timetable/${first.id}?direction=${dir}`); } catch (e) { errors.push(e.message); continue; }
    for (const route of tt.timetable?.routes || []) {
      const iv = new Map((route.stationIntervals || []).map(si => [String(si.id), si.intervals]));
      for (const sch of route.schedules || []) {
        const deps = (sch.knownJourneys || []).map(j => ({ t: `${j.hour.padStart(2, '0')}:${j.minute.padStart(2, '0')}`, iv: String(j.intervalId) }));
        const zoneIds = new Set(stops.filter(s => s.zone).map(s => s.id)), offsets = {};
        for (const [id, list] of iv) offsets[id] = Object.fromEntries([[first.id, 0], ...list.filter(x => zoneIds.has(x.stopId)).map(x => [x.stopId, x.timeToArrival])]);
        items.push({ id: `tfl-river:${l.id}:${dir}:${first.id}:${sch.name}`, kind: 'river-bus-timetable', position: pos(first.lat, first.lon, 'TfL pier position'),
          values: { line: l.id, direction: dir, from_pier: first.id, from_name: first.name, schedule: sch.name, departures: deps, minutes_to_later_zone_piers_by_interval: offsets, periods: (sch.periods || []).map(p => ({ type: p.type, from: `${p.fromTime.hour}:${p.fromTime.minute}`, to: `${p.toTime.hour}:${p.toTime.minute}`, every_min: p.frequency ? [p.frequency.lowestFrequency, p.frequency.highestFrequency] : null })) },
          url: `${TFL}/Line/${l.id}/Timetable/${first.id}?direction=${dir}` });
      }
    }
  }
  const arr = await cached('river-bus', `${TFL}/Line/${lines.map(l => l.id).join(',')}/Arrivals`);
  for (const a of JSON.parse(arr.buf.toString('utf8'))) {
    const p = piers.get(a.naptanId); if (!p) continue;
    items.push({ id: `tfl-river:arrival:${a.vehicleId}:${a.naptanId}:${a.expectedArrival}`, kind: 'predicted-arrival', time: a.expectedArrival, position: pos(p.lat, p.lon, 'TfL pier position'),
      values: { line: a.lineId, pier: a.naptanId, pier_name: a.stationName, vessel_id: a.vehicleId, direction: a.direction, destination: a.destinationName, seconds_to_pier: a.timeToStation, predicted_at: a.timestamp }, url: `${TFL}/StopPoint/${a.naptanId}/Arrivals` });
  }
  for (const p of piers.values()) items.push({ id: `tfl-pier:${p.id}`, kind: 'pier', position: pos(p.lat, p.lon, 'TfL pier position'), values: { name: p.name, naptan: p.id }, url: `${TFL}/StopPoint/${p.id}` });
  write('river-bus', { fetched: arr.fetched, url: `${TFL}/Line/Mode/river-bus`, ...LIC.tfl,
    method: 'TfL Unified API for every river-bus line (RB1, RB4, RB6, Woolwich Ferry): the longest stop sequence and route line per direction, the timetable from the first pier in the zone per direction (departures and minutes to the later zone piers per interval set), and the live arrival predictions at zone piers at fetch time. TfL publishes no vessel positions: the vessel_id of a prediction is the only per-boat handle, and a boat between piers can be placed only by interpolating along the route line. River-bus planned closures are in feeds/works/tfl-lines.json (tools/fetch-works.mjs).',
    errors, counts: { piers: piers.size, arrivals: items.filter(i => i.kind === 'predicted-arrival').length, timetables: items.filter(i => i.kind === 'river-bus-timetable').length } }, items);
}

function osmRiver() {
  const osm = osmFeatures(), items = [], kinds = {};
  const KEEP = ['name', 'mooring', 'leisure', 'man_made', 'waterway', 'lock', 'lock_name', 'lock_ref', 'amenity', 'building', 'houseboat', 'historic', 'seamark:type', 'bridge:movable',
    'operator', 'ref', 'access', 'capacity', 'fee', 'website', 'wikidata', 'start_date', 'ship:type', 'tidal', 'maxlength', 'maxbeam', 'seamark:name', 'level'];
  const seen = new Set();
  for (const f of osm.features) {
    const p = f.properties, c = centroid(f.geometry); if (!c || !zoneOf(c.lat, c.lon)) continue;
    const key = `${p['@type']}/${p['@id']}`; if (seen.has(key)) continue; seen.add(key);   // osmium exports some closed ways twice
    const kind = p.building === 'houseboat' || p.houseboat ? 'houseboat' : p.historic === 'ship' || p.building === 'ship' || p.man_made === 'ship' ? 'ship'
      : p.historic === 'wreck' || p['seamark:type'] === 'wreck' ? 'wreck' : p.mooring || p['seamark:type'] === 'mooring' ? 'mooring' : p.leisure === 'marina' ? 'marina'
        : p.waterway === 'lock_gate' || p.lock === 'yes' || p.waterway === 'security_lock' ? 'lock' : p.waterway === 'dock' ? 'dock' : p.man_made === 'pier' ? 'pier'
          : p.amenity === 'ferry_terminal' ? 'ferry-terminal' : p.leisure === 'slipway' ? 'slipway' : p['bridge:movable'] ? 'movable-bridge' : p['seamark:type'] ? 'seamark' : 'other';
    if (kind === 'other' || (kind === 'seamark' && !p.name)) { kinds[`${kind} (counted only)`] = (kinds[`${kind} (counted only)`] || 0) + 1; continue; }
    kinds[kind] = (kinds[kind] || 0) + 1;
    items.push({ id: `osm:${p['@type']}/${p['@id']}`, kind, position: pos(c.lat, c.lon, `centroid of OSM ${p['@type']}`), values: Object.fromEntries(KEEP.filter(k => p[k] != null).map(k => [k, p[k]])),
      url: `https://www.openstreetmap.org/${p['@type']}/${p['@id']}` });
  }
  write('osm-river', { url: 'local OSM extract (data/raw/docklands/greater_london-latest.osm.pbf), osmium tags-filter', ...LIC.odbl, osm_data_as_of: osm.asOf,
    method: 'osmium extract of the zone envelope, tags-filter for moorings, marinas, slipways, piers, docks, lock gates and locks, ferry terminals, houseboats, historic ships and wrecks, movable bridges and seamarks; one item per element at its centroid with a short list of tags. Unnamed seamarks are counted, not listed. Houseboat names are the names mappers gave the boats; no occupant data is held or sought.',
    counts: kinds }, items);
}

async function plaMoorings() {
  const items = [], layers = [['Visitor_Moorings', 'https://maps.pla.co.uk/server/rest/services/Visitor_Moorings/FeatureServer', 'visitor-mooring', ['name', 'ownership', 'website']],
    ['Berths_Owners', 'https://services8.arcgis.com/QgdzYlEcjteGD0VH/arcgis/rest/services/Berths_Owners/FeatureServer', 'berth', null]];
  let fetched = STAMP; const fieldsSeen = {};
  for (const [name, svc, kind, keep] of layers) {
    const info = await getJson('pla-moorings', `${svc}?f=json`), lid = (info.layers || [])[0]?.id ?? 0;
    const r = await cached('pla-moorings', `${svc}/${lid}/query?where=1%3D1&geometry=${OUTER.join(',')}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&f=json`);
    fetched = r.fetched; const d = JSON.parse(r.buf.toString('utf8'));
    fieldsSeen[name] = (d.fields || []).map(f => f.name);
    for (const f of d.features || []) {
      const g = f.geometry || {}, pts = g.rings ? g.rings.flat() : g.paths ? g.paths.flat() : g.x != null ? [[g.x, g.y]] : [];
      if (!pts.length) continue;
      const c = { lon: pts.reduce((s, p) => s + p[0], 0) / pts.length, lat: pts.reduce((s, p) => s + p[1], 0) / pts.length };
      if (!zoneOf(c.lat, c.lon)) continue;
      const a = f.attributes, nameKey = Object.keys(a).find(k => /^(name|berth_name|berth|site_name)$/i.test(k));
      const vals = keep ? Object.fromEntries(keep.filter(k => a[k] != null && a[k] !== '').map(k => [k, a[k]]))
        : Object.fromEntries(Object.entries(a).filter(([k, v]) => v != null && v !== '' && /name|berth|owner|operator|type|use/i.test(k) && !/shape|globalid|editor|creator/i.test(k)));
      items.push({ id: `pla-${kind}:${a.objectid ?? a.OBJECTID ?? a.FID ?? h8(JSON.stringify(a))}`, kind, title: nameKey ? a[nameKey] : null, position: pos(c.lat, c.lon, 'mean of the PLA feature vertices'), values: vals, url: `${svc}/${lid}` });
    }
  }
  write('pla-moorings', { fetched, url: layers.map(l => l[1]).join(' ; '), ...LIC.pla, licence: 'Not stated on the PLA ArcGIS items. Facts and links only: name, owner or operator organisation, kind, a centroid; the contact numbers and e-mail addresses in the layer are not copied, nor the polygons',
    method: 'ArcGIS REST queries of two public PLA layers with the zone envelope: Visitor Moorings (polygons) and Berths Owners (berths with their owner organisations), centroids kept when inside the zone.', fields_seen: fieldsSeen }, items);
}

async function wikidataVessels() {
  const q = `PREFIX geof: <http://www.opengis.net/def/function/geosparql/> PREFIX schema: <http://schema.org/>
SELECT ?item ?label ?desc ?coord ?cls ?clsLabel ?inception ?imo ?mmsi WHERE {
  ?item wdt:P625 ?coord . ?item wdt:P31 ?cls . ?cls wdt:P279* wd:Q1229765 .
  FILTER(geof:latitude(?coord) > ${OUTER[1]} && geof:latitude(?coord) < ${OUTER[3]} && geof:longitude(?coord) > ${OUTER[0]} && geof:longitude(?coord) < ${OUTER[2]})
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label)='en') } OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc)='en') }
  OPTIONAL { ?cls rdfs:label ?clsLabel FILTER(LANG(?clsLabel)='en') } OPTIONAL { ?item wdt:P571 ?inception } OPTIONAL { ?item wdt:P458 ?imo } OPTIONAL { ?item wdt:P587 ?mmsi }
}`;
  const f = join(RAWDIR, 'wikidata-vessels.json');
  let rows;
  if (NOFETCH) rows = JSON.parse(readFileSync(f, 'utf8')); else { rows = await qlever(q); writeFileSync(f, JSON.stringify(rows)); }
  const by = new Map();
  for (const b of rows) {
    const id = b.item.value.split('/').pop(), m = b.coord.value.match(/POINT\(([-\d.]+) ([-\d.]+)\)/); if (!m) continue;
    const lat = +m[2], lon = +m[1]; if (!zoneOf(lat, lon)) continue;
    const it = by.get(id) || { id: `wikidata:${id}`, kind: 'vessel', title: b.label?.value || null, position: pos(lat, lon, 'Wikidata P625 (may be a former berth or the place a ship is kept)'),
      values: { qid: id, description: b.desc?.value || null, classes: [], inception: b.inception?.value?.slice(0, 10) || null, imo: b.imo?.value || null, mmsi: b.mmsi?.value || null }, url: `https://www.wikidata.org/wiki/${id}` };
    const cl = b.clsLabel?.value || b.cls.value.split('/').pop(); if (!it.values.classes.includes(cl)) it.values.classes.push(cl);
    by.set(id, it);
  }
  write('wikidata-vessels', { fetched: NOFETCH ? statSync(f).mtime.toISOString().slice(0, 19) + 'Z' : STAMP, url: 'https://qlever.dev/api/wikidata', ...LIC.cc0, query: q,
    method: 'One QLever query: Wikidata items that are an instance of a subclass of watercraft (Q1229765) and have a coordinate (P625) in the zone envelope, with label, description, classes, inception, IMO and MMSI. These are named boats with a Wikidata record (museum ships, historic vessels, lightships, floating venues), not the boats moored today.' }, [...by.values()]);
}

// ======================= run =======================
const SOURCES = {
  'pla-notices': [plaNotices, 'PLA Notices to Mariners touching the zone (harbourmaster)'],
  'crt-notices': [crtNotices, 'Canal & River Trust stoppages and notices in the zone'],
  'thames-barrier': [barrier, 'Thames Barrier planned test closures (GOV.UK) and EA flood alerts and warnings'],
  levels: [levels, 'EA tide and river levels: Thames tideway, barrier differences, Lea and Ravensbourne'],
  'osm-river': [osmRiver, 'OSM moorings, piers, marinas, locks, docks, houseboats, ships, ferry terminals'],
  locks: [locks, 'lock rules (hand-written facts) with OSM positions and live CRT notices (after crt-notices)'],
  'eden-dock': [edenDock, 'Eden Dock (Sea Lanes Canary Wharf) bathing-water results and water temperature'],
  'royal-docks': [royalDocks, 'Royal Docks (RoDMA) water quality certificate'],
  'ea-sondes': [sondes, 'EA continuous water-quality sondes on the tidal Thames'],
  'ea-wims': [wims, 'EA Water Quality Archive sampling points and latest samples in the zone'],
  'river-bus': [riverBus, 'TfL river buses: routes, timetables, piers, live arrival predictions'],
  'pla-moorings': [plaMoorings, 'PLA visitor moorings and berths (facts only)'],
  'wikidata-vessels': [wikidataVessels, 'named vessels with a Wikidata coordinate in the zone (CC0)'],
};
if (args.includes('--list')) { for (const [k, [, d]] of Object.entries(SOURCES)) console.log(`${k.padEnd(18)} ${d}`); process.exit(0); }
const want = args.filter(a => !a.startsWith('--'));
const run = want.length ? want : Object.keys(SOURCES);
const failed = [];
for (const k of run) {
  if (!SOURCES[k]) { console.error(`unknown source ${k}`); process.exitCode = 1; continue; }
  try { await SOURCES[k][0](); } catch (e) { console.error(`${k}: FAILED ${e.message}`); failed.push(k); }
}
if (failed.length) { console.error(`failed: ${failed.join(', ')}`); process.exitCode = 1; }
