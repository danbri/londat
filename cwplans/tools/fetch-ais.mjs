#!/usr/bin/env node
// AIS vessel positions on the Thames in the Docklands zone from Open Waters AIS (https://openwaters.io/ais/), as dated facts,
// kept only where the event's own source licence is open.
//
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-ais.mjs                 # snapshot + stations + 10 min listen
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-ais.mjs --listen=1200   # listen for 20 minutes (max 1800)
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-ais.mjs --listen=0      # snapshot only
//   node cwplans/tools/fetch-ais.mjs --no-fetch                           # rebuild from the newest raw run
//
// Out:  cwplans/feeds/river/ais.json  {meta: {source, url, fetched, licence, attribution, method, rules, counts,
//       coverage, not_kept_would_gain}, items: [{id, kind, mmsi, name, callsign, ship_type, class, position, values,
//       time, source, licence, attribution}]}
// Raw:  cwplans/data/raw/ais/<run stamp>/ (gitignored): vessels.json, stations.json, stream.sse (with receive times)
// API:  anonymous tier (no key): GET /v1/vessels?bbox, GET /v1/stations, SSE GET /v1/stream?bbox&snapshot=1.
//       Limits on 2026-10-04: 120 HTTP requests a minute, 2 streams per address, 20 messages a second, 100 square degrees.
// Polite: one request at a time, at least 2 s apart, one stream, User-Agent from tools/lib.mjs.
// Licence filter, the small-craft rule, terms quoted and coverage measured: skill cwplans-river-and-water
// (cwplans/skills/cwplans-river-and-water/SKILL.md), section "AIS: Open Waters".
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOLS, RAW, UA } from './lib.mjs';
import { BOX_WGS84 } from './fetch-docklands.mjs';

const CW = join(TOOLS, '..'), OUT = join(CW, 'feeds', 'river'), RAWROOT = join(RAW, 'ais');
const API = 'https://ais.openwaters.io';
const args = process.argv.slice(2);
const NOFETCH = args.includes('--no-fetch');
const LISTEN = Math.min(1800, Math.max(0, +((args.find(a => a.startsWith('--listen=')) || '--listen=600').split('=')[1])));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const r5 = v => v == null || !isFinite(v) ? null : Math.round(v * 1e5) / 1e5;

// ---- the zone (as tools/fetch-river.mjs): model box, Royal Docks margin, strip north to Bow Locks
const MODEL = BOX_WGS84, EAST = [0.015, 51.495, 0.085, 51.522], LEA = [-0.025, 51.522, 0.010, 51.528];
const OUTER = [-0.095, 51.474, 0.085, 51.528];                       // [W, S, E, N]
const BBOX = `${OUTER[1]},${OUTER[0]},${OUTER[3]},${OUTER[2]}`;       // Open Waters order: minLat,minLon,maxLat,maxLon
const inB = (b, lat, lon) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
const zoneOf = (lat, lon) => lat == null || lon == null ? null
  : inB(MODEL, lat, lon) ? 'model' : inB(EAST, lat, lon) ? 'east' : inB(LEA, lat, lon) ? 'lea' : null;

// ---- licence per event (Open Waters README and docs/policy.md, read 2026-10-04). Open licences are kept. AISHub and
// aisstream.io events are kept for scoping by the owner's decision of 2026-10-04 (class scoping-accepted-2026-10-04):
// REVIEW before scaling or any commercial use (river skill, "Review before scaling").
const LICENCE = {
  'CC0-1.0': { cls: 'cc0', keep: true, attribution: 'Open Waters AIS (https://openwaters.io/ais/)' },
  'NLOD-2.0': { cls: 'nlod', keep: true, attribution: 'Contains data under the Norwegian licence for Open Government data (NLOD) distributed by the Norwegian Coastal Administration.' },
  'CC-BY-4.0': { cls: 'cc-by', keep: true, attribution: 'Source: Fintraffic / digitraffic.fi, license CC 4.0 BY.' },
  'aishub-terms': { cls: 'scoping-accepted-2026-10-04', keep: true, attribution: 'Open Waters AIS (https://openwaters.io/ais/). AISHub (https://www.aishub.net)' },
  'aisstream-io-terms': { cls: 'scoping-accepted-2026-10-04', keep: true, attribution: 'Open Waters AIS (https://openwaters.io/ais/). aisstream.io' },
};
function licenceOf(ev) {                                   // ev: a stream event or a snapshot feature's properties
  const src = String(ev.source || '');
  let lic = ev.license;
  if (!lic) lic = /^(station|udp|mmsi):/.test(src) ? 'CC0-1.0' : /^(kystverket|barentswatch)/.test(src) ? 'NLOD-2.0'
    : /^digitraffic/.test(src) ? 'CC-BY-4.0' : src === 'aishub' ? 'aishub-terms' : src === 'aisstream' ? 'aisstream-io-terms' : 'unknown';
  const L = LICENCE[lic] || { cls: 'unknown:' + lic, keep: false };
  return { lic, ...L, attribution: ev.attribution || L.attribution || null };
}
const srcKind = s => String(s || '?').split(':')[0];

// ---- small private craft: counted, never listed (cwplans exception, scoping only). ITU type 36 sailing, 37 pleasure.
// Class B without a commercial ITU type (30-35, 40-99 except 36, 37) is treated as private too. Class A with no type
// heard and kind "vessel" is kept (class A is carried by ships that must carry it); an unknown class with no type is not.
const COMMERCIAL = t => t != null && ((t >= 30 && t <= 35) || (t >= 40 && t <= 99));
function privacyOf(v) {
  if (v.kind && v.kind !== 'vessel') return null;           // aids to navigation, base stations, SAR aircraft
  if (v.ship_type === 36 || v.ship_type === 37) return 'sailing or pleasure craft (ITU 36/37)';
  if (v.class === 'B' && !COMMERCIAL(v.ship_type)) return 'class B without a commercial ship type';
  if (!v.class && !COMMERCIAL(v.ship_type)) return 'class and ship type not heard';
  return null;
}
const CLASS_OF = { PositionReport: 'A', ShipStaticData: 'A', StandardClassBPositionReport: 'B', ExtendedClassBPositionReport: 'B', StaticDataReport: 'B' };
const KIND_OF = { AidsToNavigationReport: 'aton', BaseStationReport: 'base', StandardSearchAndRescueAircraftReport: 'sar' };
const TYPE_GROUP = t => t == null || t === 0 ? 'unknown' : t === 36 || t === 37 ? 'sailing/pleasure' : t >= 60 && t <= 69 ? 'passenger'
  : t >= 70 && t <= 79 ? 'cargo' : t >= 80 && t <= 89 ? 'tanker' : t >= 40 && t <= 49 ? 'high-speed craft' : t === 52 ? 'tug'
  : t >= 50 && t <= 59 ? 'special craft (pilot, SAR, tug, port tender, law enforcement, medical)' : t >= 30 && t <= 35 ? 'fishing, towing, dredging, diving, military' : 'other';
const NAV = ['under way using engine', 'at anchor', 'not under command', 'restricted manoeuvrability', 'constrained by draught', 'moored', 'aground', 'engaged in fishing', 'under way sailing'];

// ---- polite HTTP
let last = 0;
async function get(url, accept = 'application/json') {
  for (let k = 1; ; k++) {
    const wait = last + 2000 - Date.now(); if (wait > 0) await sleep(wait);
    last = Date.now();
    let r, err;
    try { r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(60000) }); } catch (e) { err = e; }
    if (r && r.ok) return Buffer.from(await r.arrayBuffer());
    if ((r && r.status < 500 && r.status !== 429) || k >= 4) throw new Error(`${err ? err.message : 'HTTP ' + r.status} ${url}`);
    await sleep((r && +r.headers.get('retry-after') || 4) * 1000 * k);
  }
}

// Listen to the SSE stream for `seconds`; write each data line with its receive time (ms) in front, tab-separated.
async function listen(seconds, file) {
  const url = `${API}/v1/stream?bbox=${BBOX}&snapshot=1`;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), seconds * 1000);
  let n = 0, buf = '';
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/event-stream' }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    const dec = new TextDecoder();
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (line.startsWith('data: ')) { appendFileSync(file, `${Date.now()}\t${line.slice(6)}\n`); n++; }
      }
    }
  } catch (e) { if (e.name !== 'AbortError' && !ctl.signal.aborted) throw e; }
  finally { clearTimeout(timer); }
  return n;
}

// ---- run
let dir;
if (NOFETCH) {
  const runs = existsSync(RAWROOT) ? readdirSync(RAWROOT).sort() : [];
  if (!runs.length) throw new Error('no raw run in ' + RAWROOT);
  dir = join(RAWROOT, runs.at(-1));
} else {
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '') + 'Z';
  dir = join(RAWROOT, stamp); mkdirSync(dir, { recursive: true });
  const t0 = new Date().toISOString();
  console.log('vessels snapshot'); writeFileSync(join(dir, 'vessels.json'), await get(`${API}/v1/vessels?bbox=${BBOX}`, 'application/geo+json'));
  console.log('stations'); writeFileSync(join(dir, 'stations.json'), await get(`${API}/v1/stations`));
  let n = 0;
  if (LISTEN > 0) { console.log(`listening ${LISTEN} s`); writeFileSync(join(dir, 'stream.sse'), ''); n = await listen(LISTEN, join(dir, 'stream.sse')); }
  writeFileSync(join(dir, 'run.json'), JSON.stringify({ started: t0, ended: new Date().toISOString(), listen_s: LISTEN, frames: n, bbox: BBOX }, null, 1));
}
const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
const snap = JSON.parse(readFileSync(join(dir, 'vessels.json'), 'utf8'));
const stations = JSON.parse(readFileSync(join(dir, 'stations.json'), 'utf8'));
const streamLines = existsSync(join(dir, 'stream.sse')) ? readFileSync(join(dir, 'stream.sse'), 'utf8').split('\n').filter(Boolean) : [];

// ---- counts and per-vessel state
const C = { snapshot: { vessels: 0, by_source: {}, by_licence: {}, kept: 0, dropped_licence: 0, private_counted: 0 },
  stream: { frames: streamLines.length, events: 0, replayed: 0, live: 0, by_source: {}, by_licence: {}, by_msg_type: {}, synthesized: 0,
    vessels: 0, vessels_by_source: {}, kept_events: 0, dropped_events: 0, latency_s: null, position_accuracy_flag: { high: 0, low: 0 } } };
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const V = new Map();                                           // mmsi -> kept state
const dropped = new Map();                                     // mmsi -> {kind, ship_type, class} of not-kept vessels
const drop = (mmsi, o) => { const d = dropped.get(mmsi) || {}; for (const [k, x] of Object.entries(o)) if (x != null) d[k] = x; dropped.set(mmsi, d); };
const vesselsBySrc = {};
const startMs = Date.parse(run.started);

function upd(mmsi, f) { const v = V.get(mmsi) || { mmsi }; V.set(mmsi, v); f(v); return v; }

for (const f of snap.features || []) {
  const p = f.properties || {}, [lon, lat] = f.geometry ? f.geometry.coordinates : [null, null];
  C.snapshot.vessels++; inc(C.snapshot.by_source, srcKind(p.source));
  const L = licenceOf(p); inc(C.snapshot.by_licence, L.cls);
  const probe = { kind: p.kind, ship_type: p.type, class: p.class || CLASS_OF[p.msg_type] || null };
  if (!L.keep) { C.snapshot.dropped_licence++; drop(p.mmsi, probe); continue; }
  C.snapshot.kept++;
  upd(p.mmsi, v => Object.assign(v, { kind: p.kind, name: p.name ?? v.name, ship_type: p.type ?? v.ship_type, class: probe.class ?? v.class,
    callsign: p.callsign ?? v.callsign, destination: p.destination ?? v.destination, length: p.length ?? v.length, beam: p.beam ?? v.beam,
    imo: p.imo ?? v.imo, flag: p.flag ?? v.flag,
    lat, lon, cog: p.cog, sog: p.sog, heading: p.heading, nav_status: p.nav_status, time: p.seen, source: p.source, lic: L, from: 'snapshot' }));
}

const lat_s = [];
for (const line of streamLines) {
  const tab = line.indexOf('\t'), rx = +line.slice(0, tab); let e;
  try { e = JSON.parse(line.slice(tab + 1)); } catch { continue; }
  if (e.type !== 'event') continue;
  const S = C.stream; S.events++;
  const t = Date.parse(e.time); const replay = t < startMs - 5000; replay ? S.replayed++ : S.live++;
  if (!replay && isFinite(t)) lat_s.push((rx - t) / 1000);
  inc(S.by_source, srcKind(e.source)); inc(S.by_msg_type, e.msg_type); if (e.synthesized) S.synthesized++;
  (vesselsBySrc[srcKind(e.source)] ||= new Set()).add(e.mmsi);
  const m = e.message || {};
  if (m.PositionAccuracy === true) S.position_accuracy_flag.high++; else if (m.PositionAccuracy === false) S.position_accuracy_flag.low++;
  const L = licenceOf(e); inc(S.by_licence, L.cls);
  const cls = CLASS_OF[e.msg_type], kind = KIND_OF[e.msg_type] || (String(e.mmsi).startsWith('99') ? 'aton' : 'vessel');
  if (!L.keep) {
    S.dropped_events++;
    drop(e.mmsi, { kind, ship_type: m.Type || m.ReportB?.ShipType || null, class: cls });
    continue;
  }
  S.kept_events++;
  upd(e.mmsi, v => {
    v.kind = v.kind || kind; if (cls) v.class = cls; v.source = e.source; v.lic = L; v.from = 'stream';
    if (e.lat != null && (!v.time || Date.parse(e.time) >= Date.parse(v.time))) {
      Object.assign(v, { lat: e.lat, lon: e.lon, time: e.time });
      if (m.Cog != null && m.Cog < 360) v.cog = m.Cog; if (m.Sog != null && m.Sog < 102.3) v.sog = m.Sog;
      if (m.TrueHeading != null && m.TrueHeading < 360) v.heading = m.TrueHeading; if (m.NavigationalStatus != null && m.NavigationalStatus < 15) v.nav_status = m.NavigationalStatus;
    }
    if (m.Name) v.name = String(m.Name).trim(); if (m.CallSign) v.callsign = String(m.CallSign).trim(); if (m.Type) v.ship_type = m.Type;
    if (m.Destination) v.destination = String(m.Destination).trim();
    if (m.Dimension && m.Dimension.A + m.Dimension.B > 0) v.length = m.Dimension.A + m.Dimension.B;
    if (m.ImoNumber) v.imo = m.ImoNumber;
    if (m.ReportA?.Name) v.name = String(m.ReportA.Name).trim(); if (m.ReportB?.ShipType) v.ship_type = m.ReportB.ShipType; if (m.ReportB?.CallSign) v.callsign = String(m.ReportB.CallSign).trim();
  });
}
// what agreeing to the dropped sources would add: vessels not also kept, by type group; private craft counted apart
const gain = { vessels: 0, by_group: {}, private: 0 };
for (const [mmsi, d] of dropped) {
  if (V.has(mmsi)) continue;
  if (privacyOf(d)) gain.private++; else { gain.vessels++; inc(gain.by_group, (d.kind || 'vessel') === 'vessel' ? TYPE_GROUP(d.ship_type) : d.kind); }
}
lat_s.sort((a, b) => a - b);
const q = p => lat_s.length ? Math.round(lat_s[Math.min(lat_s.length - 1, Math.floor(p * lat_s.length))] * 10) / 10 : null;
C.stream.latency_s = { n: lat_s.length, p50: q(0.5), p90: q(0.9), max: q(1) };
C.stream.vessels = new Set(Object.values(vesselsBySrc).flatMap(s => [...s])).size;
for (const [k, s] of Object.entries(vesselsBySrc)) C.stream.vessels_by_source[k] = s.size;

// ---- items: kept vessels, small private craft counted only
const items = [], privateCounts = {};
for (const v of V.values()) {
  const pv = privacyOf(v);
  if (pv) { inc(privateCounts, pv); continue; }
  if (v.lat == null) continue;
  items.push({ id: `ais-${v.mmsi}`, kind: v.kind || 'vessel', mmsi: v.mmsi, name: v.name || null, callsign: v.callsign || null,
    ship_type: v.ship_type ?? null, ship_type_group: v.kind === 'vessel' ? TYPE_GROUP(v.ship_type) : null, class: v.class || null,
    position: { lat: r5(v.lat), lon: r5(v.lon), precision: 'AIS reported fix', zone: zoneOf(v.lat, v.lon) },
    imo: v.imo ?? null, flag: v.flag ?? null, length_m: v.length ?? null, beam_m: v.beam ?? null,
    values: { cog: v.cog ?? null, sog_kn: v.sog ?? null, heading: v.heading ?? null, nav_status: v.nav_status ?? null,
      nav_status_name: v.nav_status != null ? NAV[v.nav_status] || null : null, destination: v.destination || null },
    time: v.time, source: v.source, source_kind: srcKind(v.source), from: v.from, licence: v.lic.lic, licence_class: v.lic.cls, attribution: v.lic.attribution,
    review: v.lic.cls.startsWith('scoping-accepted') ? 'AISHub / aisstream.io event accepted for scoping only (owner 2026-10-04); review before scaling or commercial use' : undefined,
    url: `${API}/v1/vessels/${v.mmsi}` });
}
items.sort((a, b) => a.id.localeCompare(b.id));

// coverage: stations whose footprint touches the zone envelope
const near = stations.filter(s => s.bbox && s.bbox[0] <= OUTER[3] && s.bbox[2] >= OUTER[1] && s.bbox[1] <= OUTER[2] && s.bbox[3] >= OUTER[0])
  .map(s => ({ station: s.station.length > 40 ? s.station.slice(0, 40) + '…' : s.station, source: srcKind(s.source), near: s.near || null,
    vessels_30min: s.vessels, events_24h: s.events?.last_24h, last_age_s: s.last_age_s }));

const out = {
  meta: {
    source: 'openwaters-ais', url: 'https://openwaters.io/ais/', api: API,
    fetched: run.started, listen: { from: run.started, to: run.ended, seconds: run.listen_s, bbox: run.bbox },
    licence: 'per event, from the source it came from (Open Waters does not relicense the aggregate). Open: CC0 1.0 (volunteer receptions), NLOD 2.0 (Kystverket, BarentsWatch), CC BY 4.0 (Digitraffic). Accepted for scoping by the owner on 2026-10-04, REVIEW before scaling or commercial use: AISHub membership terms (a private written permission reported by Open Waters, revocable at will), aisstream.io (no published terms)',
    review: 'AISHub and aisstream.io events accepted for scoping only (owner, 2026-10-04: "Accept AISHub (and perhaps aisstream) events for scoping ... Flag it somewhere for review as we scale"). Open Waters hosted service is free for personal use; commercial use needs its paid tier or our own receiver.',
    attribution: 'Open Waters AIS (https://openwaters.io/ais/); per item: the attribution given with its event',
    method: 'Anonymous tier, no key. One GeoJSON snapshot of the envelope (/v1/vessels: vessels heard in the last 30 min, stationary ones up to 7 days), the station list (/v1/stations), and one SSE subscription (/v1/stream?bbox&snapshot=1) for the listen time. Each event is kept or dropped by its own licence; kept vessels that are small private craft are counted, not listed.',
    rules: [
      'Licence: keep an event when its license is CC0-1.0, NLOD-2.0 or CC-BY-4.0, or (scoping only, owner 2026-10-04) aishub-terms or aisstream-io-terms; drop anything unknown (counted by class). Snapshot features: by the source of the vessel\'s last message.',
      'Fields of a kept vessel come only from kept events or from a snapshot feature whose source is kept.',
      'Small private craft (ITU type 36/37; class B without a commercial type; class and type not heard) are counted in counts.private_not_listed, never listed.',
      'Sentinels dropped: COG 360, SOG 102.3, heading 511, nav status 15. Positions rounded to 5 decimals (about 1 m).',
      'Zone: model box, Royal Docks margin, Lea strip as tools/fetch-river.mjs; server queries use the envelope -0.095,51.474 to 0.085,51.528.',
    ],
    counts: { ...C, items: items.length, private_not_listed: privateCounts },
    coverage: { stations_touching_zone: near },
    not_kept_would_gain: { note: 'vessels from sources not kept (unknown licences): distinct non-private vessels by type group (counts only)',
      vessels: gain.vessels, by_group: gain.by_group, private_craft_seen: gain.private },
  },
  items,
};
writeFileSync(join(OUT, 'ais.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`ais.json: ${items.length} items; snapshot ${C.snapshot.vessels} (kept ${C.snapshot.kept}); stream ${C.stream.events} events (kept ${C.stream.kept_events}); would gain ${gain.vessels}`);
