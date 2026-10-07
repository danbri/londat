#!/usr/bin/env node
// Live state in the Docklands zone, as dated snapshots: hire bikes, station lifts and crowding, traffic cameras,
// power cuts, storm overflows, NOTAMs (cranes, temporary airspace) and the published helicopter structure.
//
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-live.mjs                  # every source
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-live.mjs bikes lifts      # some sources
//   node magpie/cwplans/tools/fetch-live.mjs --no-fetch                            # rebuild from the raw cache, no network
//
// Sources: bikes lifts crowding jamcams ukpn overflows notams helicopters
// Out:  magpie/cwplans/feeds/live/<source>.json  {meta: {source, url, fetched, licence, attribution, method, counts, zone}, items}
//       items: {id, kind, time, position: {lat, lon[, alt_ft]}, values, url}
// Raw:  magpie/cwplans/data/raw/live/ (gitignored)
// Zone: the 3D model's box (fetch-docklands.mjs BOX_WGS84: -0.095, 51.474 to 0.015, 51.522) plus the east margin of
//       fetch-works.mjs (0.015 to 0.085, 51.495 to 51.522: Royal Docks, ExCeL, London City Airport).
// Politeness: one request at a time per host, at least 1.5 s apart, User-Agent glitchcan-cwplans/0.1, up to 5 tries
//       with Retry-After or a doubling pause on 429, 5xx, timeouts and resets.
// Method, licences, what cannot be known and the backlog: skill cwplans-live-state
// (magpie/cwplans/skills/cwplans-live-state/SKILL.md); sources and counts: magpie/cwplans/feeds/live/README.md.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TOOLS, RAW, UA } from './lib.mjs';
import { BOX_WGS84 } from './fetch-docklands.mjs';

const CW = join(TOOLS, '..'), OUT = join(CW, 'feeds', 'live'), RAWDIR = join(RAW, 'live');
mkdirSync(OUT, { recursive: true }); mkdirSync(RAWDIR, { recursive: true });
const args = process.argv.slice(2), NOFETCH = args.includes('--no-fetch');
const NOW = new Date(), TODAY = NOW.toISOString().slice(0, 10);

// ---- the zone
const MODEL = BOX_WGS84, EAST = [0.015, 51.495, 0.085, 51.522];
const inB = (b, lat, lon) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
const zoneOf = (lat, lon) => lat == null || lon == null || !isFinite(lat) || !isFinite(lon) ? null : inB(MODEL, lat, lon) ? 'model' : inB(EAST, lat, lon) ? 'east' : null;
const r6 = v => v == null ? null : Math.round(v * 1e6) / 1e6;

// ---- polite HTTP
const GAP_MS = 1500, hostQ = new Map(), sleep = ms => new Promise(r => setTimeout(r, ms));
function politeFetch(url, { tries = 5, timeoutMs = 90000 } = {}) {
  const host = new URL(url).host, q = hostQ.get(host) || { chain: Promise.resolve(), last: 0 }; hostQ.set(host, q);
  const run = async () => {
    for (let k = 1; ; k++) {
      const wait = q.last + GAP_MS - Date.now(); if (wait > 0) await sleep(wait);
      q.last = Date.now();
      let r, err;
      try { r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': UA } }); } catch (e) { err = e; }
      if (r && r.ok) { const b = Buffer.from(await r.arrayBuffer()); q.last = Date.now(); return { buf: b, status: r.status }; }
      if (r && r.status === 404) return { buf: null, status: 404 };
      const retry = err || r.status === 429 || r.status >= 500;
      if (!retry || k >= tries) throw new Error(`${err ? err.message : 'HTTP ' + r.status} ${url}`);
      const ra = r && +r.headers.get('retry-after');
      console.log(`  retry ${k} ${err ? err.message : r.status} ${url.slice(0, 100)}`);
      await sleep(ra ? ra * 1000 : GAP_MS * 2 ** k);
    }
  };
  const p = q.chain.then(run, run); q.chain = p.catch(() => {}); return p;
}
// raw cache: every response kept under data/raw/live/; --no-fetch reads it back; `keep` files are reused when present
async function cached(name, url, { keep = false } = {}) {
  const f = join(RAWDIR, name);
  if ((NOFETCH || keep) && existsSync(f) && statSync(f).size > 0) return { buf: readFileSync(f), fetched: statSync(f).mtime.toISOString(), cached: true };
  if (NOFETCH) throw new Error(`--no-fetch: no raw file ${name}`);
  const { buf, status } = await politeFetch(url);
  if (!buf) return { buf: null, status, fetched: new Date().toISOString() };
  writeFileSync(f, buf);
  return { buf, fetched: new Date().toISOString(), cached: false };
}
const json = b => JSON.parse(b.toString('utf8'));

const TFL = { licence: 'TfL open data terms (Transport Data Service; OGL-based, attribution required). The terms page refuses scripted requests: re-check before production', attribution: 'Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016 and Geomni UK Map data © and database rights [2019]' };
const CCBY = (who) => ({ licence: 'CC BY 4.0', attribution: who });
const NATS = { licence: '© NATS Limited (UK AIS) / UK AIP Crown copyright; no open licence stated. Facts only (identifiers, positions, heights, times); no NOTAM text, tables or charts copied. Re-check before production', attribution: 'Source: UK AIS (NATS), www.nats.aero/ais' };

function write(source, meta, items) {
  items.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const counts = { items: items.length, model_box: items.filter(i => i.zone === 'model').length, east_margin: items.filter(i => i.zone === 'east').length, ...(meta.counts || {}) };
  const out = { meta: { source, ...meta, zone: { model_box_wgs84: MODEL, east_margin_wgs84: EAST }, counts }, items };
  writeFileSync(join(OUT, `${source}.json`), JSON.stringify(out, null, 1) + '\n');
  console.log(`${source}: ${items.length} items -> feeds/live/${source}.json`);
}
const props = p => Object.fromEntries((p.additionalProperties || []).map(a => [a.key, a.value]));
const propTime = p => (p.additionalProperties || []).map(a => a.modified).filter(Boolean).sort().pop() || null;

// ======================= Santander Cycles docking stations (TfL BikePoint) =======================
async function bikes() {
  const url = 'https://api.tfl.gov.uk/BikePoint';
  const r = await cached('tfl-bikepoint.json', url), all = json(r.buf);
  const items = [];
  for (const b of all) {
    const zone = zoneOf(b.lat, b.lon); if (!zone) continue;
    const p = props(b), n = k => p[k] === '' || p[k] == null ? null : +p[k];
    const docks = n('NbDocks'), bikesN = n('NbBikes'), empty = n('NbEmptyDocks');
    items.push({ id: b.id, kind: 'cycle-hire-dock', name: b.commonName, zone, time: propTime(b), position: { lat: r6(b.lat), lon: r6(b.lon) },
      values: { bikes: bikesN, standard_bikes: n('NbStandardBikes'), e_bikes: n('NbEBikes'), empty_docks: empty, docks,
        // docks that hold no bike and are not free: broken or blocked (NbDocks - NbBikes - NbEmptyDocks, as TfL reports them)
        unavailable_docks: docks != null && bikesN != null && empty != null ? docks - bikesN - empty : null,
        installed: p.Installed === 'true', locked: p.Locked === 'true', temporary: p.Temporary === 'true', terminal: p.TerminalName || null },
      url: `https://api.tfl.gov.uk/BikePoint/${b.id}` });
  }
  const sum = k => items.reduce((s, i) => s + (i.values[k] || 0), 0);
  write('bikes', { url, fetched: r.fetched, ...TFL, method: 'GET /BikePoint (every London dock, one request); kept: docks in the zone; counts as published (NbBikes, NbStandardBikes, NbEBikes, NbEmptyDocks, NbDocks); time = the newest "modified" of the dock\'s properties',
    counts: { london_docks: all.length, bikes: sum('bikes'), e_bikes: sum('e_bikes'), empty_docks: sum('empty_docks'), docks: sum('docks'), unavailable_docks: sum('unavailable_docks'),
      empty_stations: items.filter(i => i.values.bikes === 0).length, full_stations: items.filter(i => i.values.empty_docks === 0).length, locked: items.filter(i => i.values.locked).length } }, items);
}

// ======================= stations in the zone (TfL StopPoint by mode), shared by lifts and crowding =======================
async function stations() {
  const r = await cached('tfl-stoppoints-rail.json', 'https://api.tfl.gov.uk/StopPoint/Mode/tube,dlr,elizabeth-line,overground', { keep: true });
  const sp = json(r.buf).stopPoints || [];
  const types = new Set(['NaptanMetroStation', 'NaptanRailStation']);
  return sp.filter(s => types.has(s.stopType)).map(s => ({ id: s.naptanId, hub: s.hubNaptanCode || null, name: s.commonName, lat: s.lat, lon: s.lon, modes: s.modes, zone: zoneOf(s.lat, s.lon) }));
}

// ======================= TfL lift disruptions =======================
async function lifts() {
  const url = 'https://api.tfl.gov.uk/Disruptions/Lifts/v2/';
  const r = await cached('tfl-lifts.json', url), all = json(r.buf), st = await stations();
  const byId = new Map(); for (const s of st) { byId.set(s.id, s); if (s.hub && !byId.has(s.hub)) byId.set(s.hub, s); }
  const items = []; let unplaced = 0;
  for (const d of all) {
    const s = byId.get(d.stationUniqueId); if (!s) { unplaced++; continue; }
    if (!s.zone) continue;
    items.push({ id: d.stationUniqueId, kind: 'lift-disruption', name: s.name, zone: s.zone, time: r.fetched, position: { lat: r6(s.lat), lon: r6(s.lon) },
      values: { lifts_out: d.disruptedLiftUniqueIds || [], message: d.message || null }, url: 'https://tfl.gov.uk/plan-a-journey/step-free-access' });
  }
  write('lifts', { url, fetched: r.fetched, ...TFL, method: 'GET /Disruptions/Lifts/v2/ (every current lift outage in the TfL network); each station id placed through StopPoint/Mode/tube,dlr,elizabeth-line,overground (naptanId, then hubNaptanCode); kept: stations in the zone. No item means no reported lift outage at that moment, not that every lift works (the feed covers TfL-managed lifts only)',
    counts: { london_outages: all.length, unplaced, stations_in_zone: st.filter(s => s.zone).length } }, items);
}

// ======================= TfL live crowding (busyness against a typical day) =======================
async function crowding() {
  const st = (await stations()).filter(s => s.zone && /^940GZZ(LU|DL)/.test(s.id));   // Tube and DLR naptans; Elizabeth/Overground 910G codes are tried below
  const extra = (await stations()).filter(s => s.zone && /^910G/.test(s.id));
  const items = [], counts = { asked: 0, no_data: 0, not_found: 0 }; let fetched = null;
  for (const s of [...st, ...extra]) {
    counts.asked++;
    const url = `https://api.tfl.gov.uk/crowding/${s.id}/Live`;
    let r; try { r = await cached(`crowding-${s.id}.json`, url); } catch (e) { console.log('  ' + e.message); continue; }
    if (!r.buf) { counts.not_found++; continue; }
    fetched = r.fetched; const c = json(r.buf);
    if (!c.dataAvailable) { counts.no_data++; continue; }
    items.push({ id: s.id, kind: 'station-busyness', name: s.name, zone: s.zone, time: c.timeUtc || null, position: { lat: r6(s.lat), lon: r6(s.lon) },
      values: { percentage_of_baseline: c.percentageOfBaseline != null ? Math.round(c.percentageOfBaseline * 1000) / 1000 : null, time_local: c.timeLocal || null, modes: s.modes }, url });
  }
  write('crowding', { url: 'https://api.tfl.gov.uk/crowding/{naptan}/Live', fetched, ...TFL, method: 'GET /crowding/{naptan}/Live for every Tube, DLR, Elizabeth line and Overground station naptan in the zone, one at a time; percentageOfBaseline as published (a fraction of the typical busyness for that time of day, from Wi-Fi and gate data); stations with dataAvailable false or 404 are counted, not listed', counts }, items);
}

// ======================= TfL JamCam traffic cameras =======================
async function jamcams() {
  const url = 'https://api.tfl.gov.uk/Place/Type/JamCam';
  const r = await cached('tfl-jamcams.json', url), all = json(r.buf), items = [];
  for (const c of all) {
    const zone = zoneOf(c.lat, c.lon); if (!zone) continue;
    const p = props(c);
    items.push({ id: c.id, kind: 'traffic-camera', name: c.commonName, zone, time: propTime(c), position: { lat: r6(c.lat), lon: r6(c.lon) },
      values: { available: p.available === 'true', view: p.view || null, image_url: p.imageUrl || null, video_url: p.videoUrl || null }, url: p.imageUrl || null });
  }
  write('jamcams', { url, fetched: r.fetched, ...TFL, method: 'GET /Place/Type/JamCam (every camera, one request); kept: cameras in the zone; image and video URLs recorded, no image fetched or stored (a page loads the current still from TfL); time = newest property "modified"',
    counts: { london_cameras: all.length, available: all.filter(c => props(c).available === 'true').length } }, items);
}

// ======================= UK Power Networks live faults (power cuts) =======================
async function ukpn() {
  const url = 'https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-live-faults/exports/json';
  const r = await cached('ukpn-live-faults.json', url), all = json(r.buf), items = [];
  for (const f of all) {
    const lat = f.geopoint?.lat, lon = f.geopoint?.lon, zone = zoneOf(lat, lon); if (!zone) continue;
    items.push({ id: f.incidentreference, kind: 'power-cut', name: f.postcodesaffected || null, zone, time: f.creationdatetime || null, position: { lat: r6(lat), lon: r6(lon) },
      values: { type: f.powercuttype || f.incidenttypename || null, status_id: f.statusid ?? null, customers_affected: f.nocustomeraffected ?? null, planned_customers: f.noplannedcustomers ?? null,
        calls: f.nocallsreported ?? null, postcode_sectors: f.postcodesaffected || null, planned_date: f.planneddate || null, estimated_restoration: f.estimatedrestorationdate || null,
        restored: f.restoreddatetime || null, operating_zone: f.operatingzone || null }, url: 'https://www.ukpowernetworks.co.uk/power-cut/map' });
  }
  write('ukpn', { url, fetched: r.fetched, ...CCBY('Contains UK Power Networks data licensed under CC BY 4.0 (ukpowernetworks.opendatasoft.com, dataset ukpn-live-faults)'),
    method: 'Opendatasoft export of the whole ukpn-live-faults dataset (one request); kept: incidents whose geopoint is in the zone; the full postcode list and the customer letter text are dropped (fullpostcodedata, mainmessage, plannedincidentreason)',
    counts: { network_incidents: all.length, planned: all.filter(f => /plan/i.test(f.powercuttype || '')).length } }, items);
}

// ======================= storm overflows (Thames Water EDM, via the National Storm Overflow Hub) =======================
async function overflows() {
  const base = 'https://services2.arcgis.com/g6o32ZDQ33GpCIu3/arcgis/rest/services/Thames_Water_Storm_Overflow_Activity_(Production)_view/FeatureServer/0/query';
  const [W, S] = MODEL, E = EAST[2], N = MODEL[3];
  const url = `${base}?geometry=${W},${S},${E},${N}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`;
  const r = await cached('thames-water-overflows.json', url), d = json(r.buf), items = [];
  const STATUS = { 1: 'discharging', 0: 'not discharging', '-1': 'monitor offline' };
  const iso = ms => ms == null ? null : new Date(ms).toISOString();
  for (const { attributes: a } of d.features || []) {
    const zone = zoneOf(a.Latitude, a.Longitude); if (!zone) continue;
    items.push({ id: a.Id, kind: 'storm-overflow', name: a.ReceivingWaterCourse || null, zone, time: iso(a.LastUpdated), position: { lat: r6(a.Latitude), lon: r6(a.Longitude) },
      values: { status: a.Status, status_text: STATUS[a.Status] ?? null, status_start: iso(a.StatusStart), latest_event_start: iso(a.LatestEventStart), latest_event_end: iso(a.LatestEventEnd),
        receiving_water: a.ReceivingWaterCourse || null, company: a.Company || null }, url: 'https://www.streamwaterdata.co.uk/' });
  }
  write('overflows', { url, fetched: r.fetched, ...CCBY('Contains Thames Water storm overflow data licensed under CC BY 4.0, via Stream (National Storm Overflow Hub)'),
    method: 'ArcGIS FeatureServer query, envelope = the zone (model box plus east margin), all fields, no geometry (Latitude and Longitude are attributes); kept as published. Status 1 = an Event Duration Monitor indicates a discharge (not confirmed), 0 = not, -1 = monitor offline (Stream FAQ); times are epoch milliseconds turned into UTC ISO',
    counts: { discharging: items.filter(i => i.values.status === 1).length, offline: items.filter(i => i.values.status === -1).length,
      discharged_last_48h: items.filter(i => i.values.latest_event_end && Date.parse(i.values.latest_event_end) > NOW - 48 * 3600e3).length } }, items);
}

// ======================= NOTAMs in the zone (NATS contingency full UK PIB) =======================
// Kept as facts: NOTAM id, Q-line subject and condition, the Q-line centre and radius, lower/upper flight levels,
// validity, the positions and heights stated in item E, an area's vertices and the short place label in brackets.
// Not kept: the item E text, phone numbers and contacts.
const dms = (d, m, s, h) => { const v = +d + +m / 60 + +s / 3600; return /[SW]/.test(h) ? -v : v; };
const pointsIn = e => [...e.matchAll(/(\d{2})(\d{2})(\d{2}(?:\.\d+)?)N\s*(\d{3})(\d{2})(\d{2}(?:\.\d+)?)([EW])/g)].map(m => [r6(dms(m[1], m[2], m[3], 'N')), r6(dms(m[4], m[5], m[6], m[7]))]);
const pibTime = s => !s || s === 'PERM' ? s || null : `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}T${s.slice(6, 8)}:${s.slice(8, 10)}Z`;
const tag = (x, t) => (x.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1]?.trim() ?? null;
const KIND = { OB: 'obstacle', RD: 'danger area', RT: 'restricted area (temporary)', RR: 'restricted area', RM: 'reserved area (TRA)', RP: 'prohibited area', WU: 'unmanned aircraft', WE: 'exercise', WA: 'air display', WP: 'parachuting', WB: 'aerobatics', WL: 'lasers/lights', WZ: 'model flying', FA: 'aerodrome', MR: 'runway', LX: 'lights' };
async function notams() {
  const url = 'https://pibs.nats.co.uk/operational/pibs/PIB.xml';
  const r = await cached('PIB.xml', url), x = r.buf.toString('utf8');
  const issued = tag(x, 'Issued'), seen = new Map();
  let total = 0;
  for (const m of x.matchAll(/<Notam [^>]*>([\s\S]*?)<\/Notam>/g)) {
    total++;
    const n = m[1], id = `${tag(n, 'Series')}${tag(n, 'Number')}/${tag(n, 'Year')}`;
    if (seen.has(id)) continue;
    const c = tag(n, 'Coordinates'), cm = c && c.match(/(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])/);
    const qlat = cm ? dms(cm[1], cm[2], 0, cm[3]) : null, qlon = cm ? dms(cm[4], cm[5], 0, cm[6]) : null, radius = +tag(n, 'Radius') || null;
    const e = (tag(n, 'ItemE') || '').replace(/\s+/g, ' '), pts = pointsIn(e);
    // in the zone: a position stated in item E lies in it, or (no position in E) the Q-line centre does and the radius is at most 5 NM
    const zones = pts.map(p => zoneOf(p[0], p[1])).filter(Boolean);
    const zone = zones.includes('model') ? 'model' : zones[0] || (pts.length ? null : radius <= 5 ? zoneOf(qlat, qlon) : null);
    if (!zone) continue;
    const code23 = tag(n, 'Code23'), code45 = tag(n, 'Code45');
    const hgt = e.match(/(\d+)\s*FT\s*AGL[\s,/]*(\d+)\s*FT\s*AMSL/), place = (e.match(/\(([^()]{3,80})\)/) || [])[1] || null;
    const area = /BOUNDED BY/.test(e) ? pts : null, pos = area ? null : pts[0] || null;
    seen.set(id, { id, kind: KIND[code23] || `notam ${code23}`, name: place && !/^\d/.test(place) ? place.replace(/\s+/g, ' ').trim() : null, zone, time: pibTime(tag(n, 'StartValidity')),
      position: pos ? { lat: pos[0], lon: pos[1], ...(hgt ? { alt_ft: +hgt[2] } : {}) } : { lat: r6(qlat), lon: r6(qlon) },
      values: { q_code: `Q${code23}${code45}`, fir: tag(n, 'FIR'), location: tag(n, 'ItemA'), start: pibTime(tag(n, 'StartValidity')), end: pibTime(tag(n, 'EndValidity')),
        lower_fl: +tag(n, 'Lower'), upper_fl: +tag(n, 'Upper'), q_radius_nm: radius, position_from: pos ? 'item E' : area ? 'item E area' : 'Q-line centre (1 minute of arc)',
        height_agl_ft: hgt ? +hgt[1] : null, height_amsl_ft: hgt ? +hgt[2] : null, area_vertices: area, crane: /CRANE/.test(e) || undefined, lit: /\bLIT\b/.test(e) || undefined },
      url: 'https://nats-uk.ead-it.com/cms-nats/opencms/en/Briefing/contingency-pibs/' });
  }
  const items = [...seen.values()];
  write('notams', { url, fetched: r.fetched, pib_issued: issued, ...NATS,
    method: 'The contingency full UK PIB XML (all UK NOTAMs valid now and in the next 7 days, refreshed hourly by NATS, no login), one request; a NOTAM is kept when a position in item E lies in the zone, or it has none and the Q-line centre does with a radius of at most 5 NM; duplicates (a NOTAM in two PIB sections) merged by series/number/year; facts kept, text dropped (see the header of tools/fetch-live.mjs)',
    counts: { uk_notams: total, cranes: items.filter(i => i.values.crane).length, areas: items.filter(i => i.values.area_vertices).length } }, items);
}

// ======================= helicopter structure (UK AIP): H4 reporting points and the restricted areas =======================
// The AIP issue 2024-03-21 is the newest the container could read (the newer issues listed on the NATS history page
// answered 404 on 2026-10-04). AIC Y 079/2020: the lateral route structure has not changed since it was introduced.
const AIP = 'https://www.aurora.nats.co.uk/htmlAIP/Publications/2024-03-21-AIRAC/html/eAIP/';
const strip = h => h.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/T[A-Z_]+;[A-Za-z_:0-9.]+;\d+/g, ' ').replace(/\s+/g, ' ');
async function helicopters() {
  const egll = await cached('aip-2024-03-21-EGLL.html', AIP + 'EG-AD-2.EGLL-en-GB.html', { keep: true });
  const enr = await cached('aip-2024-03-21-ENR-5.1.html', AIP + 'EG-ENR-5.1-en-GB.html', { keep: true });
  const t = strip(egll.buf.toString('utf8')), items = [];
  // H4 rows: "▲ Isle-of-Dogs TQ 381 781 512902N 0000042W Description"
  const h4 = t.slice(t.lastIndexOf(' H4 ', t.indexOf('Isle-of-Dogs')), t.indexOf('Note 1: There are no Holding Points on H4'));   // the H4 table of the London CTR (Isle of Dogs to the London Heliport)
  for (const m of h4.matchAll(/([▲∆])\s*([A-Za-z][A-Za-z' -]+?)\s+TQ (\d{3}) (\d{3})\s+(\d{6})N\s+(\d{7})([EW])\s+([^▲∆]*?)(?=\s+(?:Note|H\b|\d{4} FT|[▲∆]|$))/g)) {
    const lat = dms(m[5].slice(0, 2), m[5].slice(2, 4), m[5].slice(4), 'N'), lon = dms(m[6].slice(0, 3), m[6].slice(3, 5), m[6].slice(5), m[7]);
    items.push({ id: `H4-${m[2].trim().replace(/\s+/g, '-')}`, kind: 'helicopter-reporting-point', name: m[2].trim(), zone: zoneOf(lat, lon), time: null, position: { lat: r6(lat), lon: r6(lon) },
      values: { route: 'H4', reporting: m[1] === '▲' ? 'compulsory' : 'on request', grid_ref: `TQ ${m[3]} ${m[4]}`, description: m[8].trim().slice(0, 120) }, url: AIP + 'EG-AD-2.EGLL-en-GB.html' });
  }
  // the H4 vertical profile as published in AD 2.22 para 12 (facts): between London Bridge and Vauxhall Bridge VFR max 2000 FT,
  // suggested minimum 1000 FT, SVFR max 1500 FT; Vauxhall to the London Heliport VFR max 1500 FT. AIC 079/2020: no lower than
  // 1000 FT AMSL on H4 between the Isle of Dogs and the London Heliport.
  const profile = /2000 FT[^]*?1000 FT[^]*?1500 FT/.test(h4) ? { vfr_max_ft: 2000, suggested_min_ft: 1000, svfr_max_ft: 1500, note: 'AD 2.22 para 12 table: values printed between London Bridge and Vauxhall Bridge; the row between Isle-of-Dogs and London Bridge is blank in the HTML table; AIC Y 079/2020: no lower than 1000 FT AMSL on H4 between the Isle of Dogs and the London Heliport' } : null;
  // restricted areas over the zone, ENR 5.1: vertices as published (arcs given as centre and radius)
  const e = strip(enr.buf.toString('utf8'));
  for (const [code, name] of [['EGR158', 'CITY OF LONDON'], ['EGR159', 'ISLE OF DOGS'], ['EGR160', 'THE SPECIFIED AREA']]) {
    const i = e.indexOf(`${code} ${name}`), s = e.slice(i, e.indexOf('EGR', i + 6) > 0 ? e.indexOf('EGR', i + 6) : i + 3000);
    const verts = pointsIn(s.split('Upper limit')[0]), up = (s.match(/Upper limit: (\S+(?: FT ALT)?)/) || [])[1] || null;
    const arcs = [...s.matchAll(/radius ([\d.]+) NM centred on (\d{6})N (\d{7})([EW])/g)].map(a => ({ radius_nm: +a[1], centre: [r6(dms(a[2].slice(0, 2), a[2].slice(2, 4), a[2].slice(4), 'N')), r6(dms(a[3].slice(0, 3), a[3].slice(3, 5), a[3].slice(5), a[4]))] }));
    const c = verts.reduce((a, v) => [a[0] + v[0] / verts.length, a[1] + v[1] / verts.length], [0, 0]);
    const vz = verts.map(v => zoneOf(v[0], v[1])).filter(Boolean);   // in the zone when a vertex is (EGR160's east edge runs through the Isle of Dogs)
    items.push({ id: code, kind: 'restricted-area', name, zone: zoneOf(c[0], c[1]) || (vz.includes('model') ? 'model' : vz[0] || null), time: null, position: { lat: r6(c[0]), lon: r6(c[1]) },
      values: { lower: 'SFC', upper: up, vertices: verts, arcs, permitted: (s.match(/Flight permitted by: (.*?)(?: See also| SI )/) || [])[1]?.split(';').map(x => x.trim()).filter(Boolean) || null,
        legal_basis: (s.match(/SI (\d+\/\d{4})/) || [])[1] || null, river_excluded: /Excluding so much of the bed of the River Thames/.test(s) || undefined }, url: AIP + 'EG-ENR-5.1-en-GB.html' });
  }
  write('helicopters', { url: AIP + 'EG-AD-2.EGLL-en-GB.html', fetched: egll.fetched, aip_issue: '2024-03-21 (AIRAC)', ...NATS, h4_profile: profile,
    method: 'UK AIP EGLL AD 2.22 paragraph 12 (Helicopter Routes in the London CTR and London City CTR), route H4 rows, and ENR 5.1 restricted areas EGR158, EGR159 and EGR160, read from the eAIP HTML (cached locally); names, grid references, positions, altitudes and limits kept as facts. The routes\' precise lines are on the 1:50 000 chart (not copied). No live helicopter positions: see feeds/live/README.md, "Helicopters"' }, items);
}

const SOURCES = { bikes, lifts, crowding, jamcams, ukpn, overflows, notams, helicopters };
const want = args.filter(a => !a.startsWith('--'));
for (const k of want.length ? want : Object.keys(SOURCES)) {
  if (!SOURCES[k]) { console.error(`unknown source ${k}; one of ${Object.keys(SOURCES).join(' ')}`); process.exitCode = 1; continue; }
  try { await SOURCES[k](); } catch (e) { console.error(`${k}: ${e.message}`); process.exitCode = 1; }
}
