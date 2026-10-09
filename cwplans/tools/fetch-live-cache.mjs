// Near-live aircraft and ships for the Docklands 3D page (layers Aircraft and Ships of docklands/), every 5 minutes:
//   aircraft: one answer of the adsb.lol live API (GET https://api.adsb.lol/v2/point/51.505/-0.02/25, ODbL 1.0), added to
//             a rolling buffer of the last 60 minutes of reports -> aircraft.json
//   ships:    one Open Waters AIS snapshot (GET https://ais.openwaters.io/v1/vessels?bbox=51.474,-0.095,51.528,0.085,
//             anonymous tier), added to a rolling buffer of the last 2 hours of positions -> ships.json
//   METAR:    London City Airport (EGLC), the last 24 hours, NOAA Aviation Weather Center data API -> metar.json
// Both are written with README.md (licences and attributions) and force-pushed as the only commit of the orphan branch
// live-cache (temporary index, GIT_INDEX_FILE: the main working tree and index are not touched; git history does not
// grow). The browser cannot read api.adsb.lol (no CORS header); raw.githubusercontent.com sends
// Access-Control-Allow-Origin: *. When one source fails, its previous file is kept and the other is still written.
// Owner, 2026-10-09: "Couldn't we crontab it for every 5 mins? And default to live for the rest?", "We want the
// webapp to always have fresh air and boat data plus recent history" and "Basically we want all the data we can".
// Privacy, aircraft: identified() of docklands/planes-live.js and fetch-adsb-cache.mjs: a callsign (and the ICAO address
// as the key) only for an operator ICAO callsign without LADD/PIA and with an ICAO address; every other aircraft gets an
// anonymous key (x<n>, joined to its own earlier reports by position, never by address) and its type only. No
// registration, owner, squawk or ICAO address of an unidentified aircraft is written.
// Privacy and licence, ships: the rules of fetch-ais.mjs (licence per event: CC0, NLOD, CC BY kept; AISHub and
// aisstream.io kept for scoping by the owner's decision of 2026-10-04; anything else dropped and counted); small private
// craft (ITU 36/37, class B without a commercial type, class and type not heard) are counted, never listed.
//
//   node cwplans/tools/fetch-live-cache.mjs [--out DIR] [--restore] [--push] [--only aircraft|ships|metar]
//        [--from-adsb FILE] [--from-ais FILE] [--from-metar FILE]
//     --restore    first read aircraft.json and ships.json of origin/live-cache (git fetch), so the buffers go on
//     --from-*     use a saved API answer instead of asking (tests)
//     NODE_USE_ENV_PROXY=1 behind a proxy. Workflow: .github/workflows/live-cache.yml (every 5 minutes).
// Skills: docklands-sky, "Live aircraft in the Three.js port" and "METAR"; cwplans-river-and-water, "AIS: Open Waters".
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const A = process.argv.slice(2), opt = k => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const OUT = resolve(opt('--out') || join(tmpdir(), 'londat-live-cache'));
const ONLY = opt('--only');
const BRANCH = 'live-cache';
const ADSB_URL = 'https://api.adsb.lol/v2/point/51.505/-0.02/25';
const AIS_URL = 'https://ais.openwaters.io/v1/vessels?bbox=51.474,-0.095,51.528,0.085';
const UA = 'londat-live-cache/1 (https://github.com/danbri/londat; danbri/londat cwplans, every 5 min)';
const KEEP_AIR = 3600, KEEP_SHIP = 7200;   // s of reports kept
const STALE_POS = 60;                      // s: an aircraft report with seen_pos over this is not kept
const FT = 0.3048, K = Math.PI / 180;
const med = v => { v = v.slice().sort((x, y) => x - y); return v.length ? v[v.length >> 1] : null; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url, from) {
  if (from) return JSON.parse(readFileSync(from, 'utf8'));
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json, application/geo+json' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
      return await r.json();
    } catch (e) {
      if (i >= 3 || (e.status >= 400 && e.status < 500 && e.status !== 429)) throw e;
      console.log(`  ${url}: ${e.message}; again in ${5 * i} s`); await sleep(5000 * i);
    }
  }
}

const git = (args, env) => execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function restore() {
  try { git(['fetch', '-q', '--depth=1', 'origin', BRANCH]); } catch { console.log(`no ${BRANCH} branch yet`); return {}; }
  const out = {};
  for (const f of ['aircraft', 'ships', 'metar']) { try { out[f] = JSON.parse(git(['show', `FETCH_HEAD:${f}.json`])); } catch { console.log(`${BRANCH} has no readable ${f}.json`); } }
  console.log(`restored origin/${BRANCH}: ${Object.keys(out).join(', ') || 'nothing'}`);
  return out;
}

// ======================================================================= aircraft
const identified = a => /^[A-Z]{3}[0-9][0-9A-Z]{0,4}$/.test((a.flight || '').trim()) && !((a.dbFlags | 0) & 12) && !/^~/.test(a.hex || '');
// geoid N (m), the quadratic fit to OSGM15 of docklands/planes-live.js geoidN
const NG = [45.4482, -1.0131, 1.1362, -0.6868, 0.3213, 0.6729];
const geoidN = (lon, lat) => { const a = lon + 0.02, b = lat - 51.505; return NG[0] + NG[1] * a + NG[2] * b + NG[3] * a * b + NG[4] * a * a + NG[5] * b * b; };

// one answer -> reports [t (s, UTC), lat 1e-5, lon 1e-5, alt / 25 ft above the WGS84 ellipsoid, q, gs kt, track deg, vertical rate fpm, turn rate 0.01 deg/s]
function airReports(j) {
  const now = (j.now || Date.now()) / 1000, list = j.ac || [];
  // pressure altitude correction of this answer: median (alt_geom - alt_baro) below 10,000 ft (>= 3 aircraft), else
  // (median nav_qnh - 1013.25) x 27.7 ft/hPa + the geoid, else the geoid alone
  const d = [], q = [];
  for (const a of list) if (typeof a.alt_baro === 'number' && a.alt_baro < 10000) {
    if (typeof a.alt_geom === 'number') d.push(a.alt_geom - a.alt_baro);
    if (typeof a.nav_qnh === 'number' && a.nav_qnh > 950 && a.nav_qnh < 1060) q.push(a.nav_qnh);
  }
  const corr = d.length >= 3 ? Math.round(med(d)) : Math.round((q.length ? (med(q) - 1013.25) * 27.7 : 0) + geoidN(-0.02, 51.505) / FT);
  const out = [];
  for (const a of list) {
    if (a.lat == null || a.lon == null || !a.hex || (a.seen_pos != null && a.seen_pos > STALE_POS)) continue;
    if (/^C/.test(a.category || '') || ['TWR', 'GND', 'SERV'].includes((a.t || '').toUpperCase())) continue;
    const ground = a.alt_baro === 'ground';
    const alt = ground ? 0 : typeof a.alt_geom === 'number' ? a.alt_geom : typeof a.alt_baro === 'number' ? a.alt_baro + corr : null;
    if (alt == null) continue;
    const trk = a.track ?? a.true_heading ?? a.mag_heading; if (trk == null && !ground) continue;
    out.push({ a, id: identified(a), p: [Math.round(now - (a.seen_pos || 0)), Math.round(a.lat * 1e5), Math.round(a.lon * 1e5), Math.round(alt / 25), ground ? 2 : typeof a.alt_geom === 'number' ? 0 : 1,
      Math.round(a.gs || 0), Math.round(trk ?? 0), ground ? 0 : Math.round((a.geom_rate ?? a.baro_rate ?? 0) / 64) * 64, Math.round((a.track_rate || 0) * 100)] });
  }
  return { now, corr, total: list.length, reps: out };
}
const distM = (la1, lo1, la2, lo2) => { const x = (lo2 - lo1) * Math.cos((la1 + la2) / 2 * K) * 6371000 * K, y = (la2 - la1) * 6371000 * K; return Math.hypot(x, y); };
function ahead(p, t) { const d = p[5] * 1852 / 3600 * (t - p[0]), lat = p[1] / 1e5, lon = p[2] / 1e5;
  return [lat + d * Math.cos(p[6] * K) / 6371000 / K, lon + d * Math.sin(p[6] * K) / (6371000 * K * Math.cos(lat * K))]; }

function airMerge(prev, snap) {
  const ac = new Map((prev ? prev.ac : []).map(L => [L.k, { ...L, P: L.P.slice() }]));
  let next = prev ? prev.next_anon || 1 : 1;
  for (const r of snap.reps.filter(r => r.id)) {              // identified: key = ICAO address
    const k = r.a.hex.toLowerCase(); let L = ac.get(k);
    if (!L) { L = { k, P: [] }; ac.set(k, L); }
    L.c = r.a.flight.trim(); if (r.a.t) L.ty = r.a.t; if (r.a.category) L.cat = r.a.category;
    if (!L.P.length || L.P.at(-1)[0] < r.p[0]) L.P.push(r.p);
  }
  // anonymous: joined to an earlier anonymous track of the same type whose dead-reckoned position is near (greedy,
  // nearest first; tolerance 1.5 km + 30 % of the distance flown since); else a new key x<n>
  const anon = snap.reps.filter(r => !r.id), cands = [];
  const old = [...ac.values()].filter(L => /^x/.test(L.k) && snap.now - L.P.at(-1)[0] < 1200);
  anon.forEach((r, i) => old.forEach(L => {
    const p = L.P.at(-1); if ((L.ty || '') !== (r.a.t || '') || p[0] >= r.p[0]) return;
    const [la, lo] = ahead(p, r.p[0]), d = distM(la, lo, r.p[1] / 1e5, r.p[2] / 1e5), tol = 1500 + 0.3 * p[5] * 1852 / 3600 * (r.p[0] - p[0]);
    if (d < tol) cands.push({ i, L, d });
  }));
  cands.sort((a, b) => a.d - b.d); const usedR = new Set(), usedL = new Set();
  for (const c of cands) if (!usedR.has(c.i) && !usedL.has(c.L.k)) { usedR.add(c.i); usedL.add(c.L.k); c.L.P.push(anon[c.i].p); }
  anon.forEach((r, i) => { if (!usedR.has(i)) { const k = `x${next++}`; ac.set(k, { k, ty: r.a.t || undefined, cat: r.a.category || undefined, P: [r.p] }); } });
  const cut = snap.now - KEEP_AIR;
  for (const [k, L] of ac) { L.P = L.P.filter(p => p[0] >= cut); if (!L.P.length) ac.delete(k); }
  const snaps = [...(prev ? prev.snaps : []).filter(s => s.t / 1000 >= cut), { t: Math.round(snap.now * 1000), n: snap.reps.length, total: snap.total, corr_ft: snap.corr }];
  return { ac: [...ac.values()], snaps, next };
}

function airBody(m) {
  const t0 = Math.floor(Math.min(...m.ac.map(L => L.P[0][0]), m.snaps[0].t / 1000));
  return {
    v: 1, generated: new Date().toISOString(), now: m.snaps.at(-1).t, t0,
    tool: 'cwplans/tools/fetch-live-cache.mjs (danbri/londat), workflow .github/workflows/live-cache.yml (every 5 minutes)',
    source: `adsb.lol live API, ${ADSB_URL}`, licence: 'ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/); feeder data CC0',
    credit: 'Aircraft: © adsb.lol contributors, ODbL', area: { lat: 51.505, lon: -0.02, radius_nm: 25 }, keep_s: KEEP_AIR,
    privacy: 'callsign and ICAO address (as key) only for operator ICAO callsigns without LADD/PIA flags and with an ICAO address; every other aircraft has an anonymous key x<n> (joined to its own earlier reports by position) and its type only; no registration, owner or squawk is kept',
    cols: ['t s from t0 (report time = answer time - seen_pos)', 'lat 1e-5 deg', 'lon 1e-5 deg', 'alt 25 ft above the WGS84 ellipsoid', 'q 0 GNSS 1 pressure+corr_ft 2 ground', 'gs kt', 'track deg true', 'vertical rate fpm', 'turn rate 0.01 deg/s'],
    snaps: m.snaps, next_anon: m.next,
    ac: m.ac.map(L => ({ k: L.k, c: L.c, ty: L.ty, cat: L.cat, P: L.P.map(p => [p[0] - t0, ...p.slice(1)]) })),
  };
}

async function aircraft(prev) {
  if (prev) prev = { ...prev, ac: prev.ac.map(L => ({ ...L, P: L.P.map(p => [p[0] + prev.t0, ...p.slice(1)]) })) };   // back to absolute t
  const snap = airReports(await getJSON(ADSB_URL, opt('--from-adsb')));
  console.log(`aircraft: adsb.lol answer at ${new Date(snap.now * 1000).toISOString()}: ${snap.total} aircraft, ${snap.reps.length} kept (${snap.reps.filter(r => !r.id).length} by type only), corr ${snap.corr} ft`);
  if (prev && prev.now >= snap.now * 1000) { console.log('aircraft: the answer is not newer than the buffer'); return null; }
  const b = airBody(airMerge(prev, snap));
  console.log(`aircraft.json: ${b.snaps.length} snapshots (${new Date(b.snaps[0].t).toISOString().slice(11, 19)} to ${new Date(b.now).toISOString().slice(11, 19)} UTC), ${b.ac.length} aircraft (${b.ac.filter(L => /^x/.test(L.k)).length} by type only), ${b.ac.reduce((s, L) => s + L.P.length, 0)} reports`);
  return b;
}

// ======================================================================= ships (rules of fetch-ais.mjs)
const OW = 'Open Waters AIS (https://openwaters.io/ais/)';
const LICENCE = {
  'CC0-1.0': { cls: 'cc0', keep: true, attribution: OW },
  'NLOD-2.0': { cls: 'nlod', keep: true, attribution: 'Contains data under the Norwegian licence for Open Government data (NLOD) distributed by the Norwegian Coastal Administration.' },
  'CC-BY-4.0': { cls: 'cc-by', keep: true, attribution: 'Source: Fintraffic / digitraffic.fi, license CC 4.0 BY.' },
  'aishub-terms': { cls: 'scoping-accepted-2026-10-04', keep: true, attribution: OW + '. AISHub (https://www.aishub.net)' },
  'aisstream-io-terms': { cls: 'scoping-accepted-2026-10-04', keep: true, attribution: OW + '. aisstream.io' },
};
function licenceOf(p) {
  const src = String(p.source || '');
  const lic = p.license || (/^(station|udp|mmsi):?/.test(src) ? 'CC0-1.0' : /^(kystverket|barentswatch)/.test(src) ? 'NLOD-2.0'
    : /^digitraffic/.test(src) ? 'CC-BY-4.0' : src === 'aishub' ? 'aishub-terms' : src === 'aisstream' ? 'aisstream-io-terms' : 'unknown');
  const L = LICENCE[lic] || { cls: 'unknown:' + lic, keep: false };
  return { lic, ...L };
}
const COMMERCIAL = t => t != null && ((t >= 30 && t <= 35) || (t >= 40 && t <= 99));
function privacyOf(v) {
  if (v.kind && v.kind !== 'vessel') return null;
  if (v.ship_type === 36 || v.ship_type === 37) return 'sailing or pleasure craft (ITU 36/37)';
  if (v.class === 'B' && !COMMERCIAL(v.ship_type)) return 'class B without a commercial ship type';
  if (!v.class && !COMMERCIAL(v.ship_type)) return 'class and ship type not heard';
  return null;
}
const CLASS_OF = { PositionReport: 'A', ShipStaticData: 'A', StandardClassBPositionReport: 'B', ExtendedClassBPositionReport: 'B', StaticDataReport: 'B' };

async function ships(prev) {
  const d = await getJSON(AIS_URL, opt('--from-ais')), now = Date.now() / 1000;
  const V = new Map((prev ? prev.vessels : []).map(v => [v.mmsi, { ...v, P: v.P.map(p => [p[0] + prev.t0, ...p.slice(1)]) }]));
  const n = { features: 0, kept: 0, dropped_licence: {}, private_not_listed: {}, no_position: 0 };
  for (const f of d.features || []) {
    n.features++;
    const p = f.properties || {}, [lon, lat] = f.geometry ? f.geometry.coordinates : [null, null];
    const L = licenceOf(p); if (!L.keep) { n.dropped_licence[L.cls] = (n.dropped_licence[L.cls] || 0) + 1; continue; }
    const v = { mmsi: p.mmsi, kind: p.kind || 'vessel', ship_type: p.type ?? null, class: p.class || CLASS_OF[p.msg_type] || null };
    const pv = privacyOf(v); if (pv) { n.private_not_listed[pv] = (n.private_not_listed[pv] || 0) + 1; V.delete(p.mmsi); continue; }
    if (lat == null || lon == null || !p.mmsi) { n.no_position++; continue; }
    n.kept++;
    const seen = Math.round(Date.parse(p.seen || '') / 1000) || Math.round(now);
    let o = V.get(p.mmsi); if (!o) { o = { mmsi: p.mmsi, P: [] }; V.set(p.mmsi, o); }
    Object.assign(o, { kind: v.kind, name: p.name ?? o.name, callsign: p.callsign ?? o.callsign, imo: p.imo ?? o.imo, flag: p.flag ?? o.flag, ship_type: v.ship_type ?? o.ship_type, class: v.class ?? o.class,
      length: p.length ?? o.length, beam: p.beam ?? o.beam, destination: p.destination ?? o.destination, source: String(p.source || '').split(':')[0], licence: L.lic, licence_class: L.cls,
      attribution: (d.attribution || {})[String(p.source || '').split(':')[0]] || L.attribution });
    const pt = [seen, Math.round(lat * 1e5), Math.round(lon * 1e5), p.sog == null ? null : Math.round(p.sog * 10), p.cog == null ? null : Math.round(p.cog), p.heading ?? null, p.nav_status ?? null];
    const last = o.P.at(-1);
    if (!last || (last[0] < seen && (last[1] !== pt[1] || last[2] !== pt[2] || last[6] !== pt[6] || seen - last[0] > 1800))) o.P.push(pt);   // a still vessel: one point per 30 min
    else if (last[0] < seen && last[1] === pt[1] && last[2] === pt[2]) o.seen_last = seen;
  }
  const cut = now - KEEP_SHIP;
  // positions of the last 2 hours; a vessel's newest position is kept whatever its age while the API still lists the
  // vessel (moored vessels stay listed up to 7 days), so the file holds the whole current picture
  const listed = new Set((d.features || []).map(f => (f.properties || {}).mmsi));
  for (const [k, o] of V) { const lastP = o.P.at(-1); o.P = o.P.filter(p => p[0] >= cut); if (!o.P.length && listed.has(k)) o.P = [lastP]; if (!o.P.length) V.delete(k); }
  const snaps = [...(prev ? prev.snaps : []).filter(s => s.t / 1000 >= cut), { t: Math.round(now * 1000), ...n }];
  const vs = [...V.values()], t0 = Math.floor(Math.min(now, ...vs.map(o => o.P[0][0])));
  const b = { v: 1, generated: new Date().toISOString(), now: Math.round(now * 1000), t0,
    tool: 'cwplans/tools/fetch-live-cache.mjs (danbri/londat), workflow .github/workflows/live-cache.yml (every 5 minutes)',
    source: `Open Waters AIS, anonymous tier, ${AIS_URL}`,
    licence: 'per event, from the source it came from (Open Waters does not relicense the aggregate): CC0 1.0 (volunteer receptions), NLOD 2.0, CC BY 4.0 kept; AISHub and aisstream.io kept for scoping by the owner decision of 2026-10-04 (review before scaling or commercial use); anything else dropped and counted',
    privacy: 'small private craft (ITU 36/37, class B without a commercial ship type, class and type not heard) are counted in snaps[].private_not_listed, never listed',
    keep_s: KEEP_SHIP, cols: ['t s from t0 (the AIS report time, "seen")', 'lat 1e-5 deg', 'lon 1e-5 deg', 'sog 0.1 kn', 'cog deg', 'heading deg', 'nav_status'],
    snaps, vessels: vs.map(({ seen_last, P, ...o }) => ({ ...o, seen_last: seen_last ? seen_last - t0 : undefined, P: P.map(p => [p[0] - t0, ...p.slice(1)]) })) };
  console.log(`ships: ${n.features} features, ${n.kept} kept, private not listed ${JSON.stringify(n.private_not_listed)}, dropped by licence ${JSON.stringify(n.dropped_licence)}; ships.json: ${snaps.length} snapshots, ${vs.length} vessels, ${vs.reduce((s, o) => s + o.P.length, 0)} positions`);
  return b;
}

// ======================================================================= METAR, London City Airport (EGLC)
// aviationweather.gov data API (NOAA Aviation Weather Center; NWS: "public domain, unless specifically noted otherwise").
// One request a run for the last 24 hours (their limit: 100 requests a minute; "keep requests limited in scope and
// frequency"). No CORS header (checked 2026-10-09), so the page reads this file instead. Fields as the API gives them,
// plus the visibility in metres from the report text (the API's visib is in statute miles, "6+" for 9999).
const METAR_URL = 'https://aviationweather.gov/api/data/metar?ids=EGLC&format=json&hours=24';
const KEEP_METAR = 86400;
function visM(raw) {
  if (/\bCAVOK\b/.test(raw)) return 10000;
  const m = /\s(\d{4})(NDV)?\s/.exec(raw.replace(/^.*?\d{3}(?:\d{2}|\d{3})(?:G\d{2,3})?KT(?:\s\d{3}V\d{3})?/, ''));
  return m ? (+m[1] === 9999 ? 10000 : +m[1]) : null;
}
async function metar(prev) {
  const list = await getJSON(METAR_URL, opt('--from-metar')), now = Date.now() / 1000;
  const M = new Map((prev ? prev.obs : []).map(o => [o.t + o.raw, o]));
  for (const o of Array.isArray(list) ? list : []) {
    if (!o.rawOb || !o.obsTime) continue;
    const r = { t: o.obsTime, report: o.reportTime, type: o.metarType, raw: o.rawOb, wdir: o.wdir, wspd_kt: o.wspd, wgst_kt: o.wgst ?? null, vis_m: visM(o.rawOb),
      clouds: (o.clouds || []).map(c => ({ cover: c.cover, base_ft: c.base ?? null })), temp_c: o.temp, dewp_c: o.dewp, qnh_hpa: o.altim, flt_cat: o.fltCat || null };
    M.set(r.t + r.raw, r);
  }
  const obs = [...M.values()].filter(o => o.t >= now - KEEP_METAR).sort((a, b) => a.t - b.t);
  const b = { v: 1, generated: new Date().toISOString(), station: { icao: 'EGLC', name: 'London City Airport', lat: 51.505, lon: 0.055, elev_m: 10 },
    tool: 'cwplans/tools/fetch-live-cache.mjs (danbri/londat), workflow .github/workflows/live-cache.yml (every 5 minutes)',
    source: `NOAA Aviation Weather Center data API, ${METAR_URL}`,
    licence: 'NOAA/NWS: public domain unless specifically noted otherwise (https://www.weather.gov/disclaimer); the reports are made by the UK Met Office for London City Airport and exchanged through the WMO (essential data, WMO Resolution 40)',
    note: 'wdir degrees true (METAR), "VRB" for variable; wspd_kt and wgst_kt in knots; vis_m from the report text (9999 and CAVOK as 10000); cloud bases in ft above the aerodrome; times UTC (t = observation time, s)',
    keep_s: KEEP_METAR, obs };
  console.log(`metar: ${(list || []).length} reports in the answer; metar.json: ${obs.length} reports, newest ${obs.at(-1) ? obs.at(-1).raw : 'none'}`);
  return b;
}

// ======================================================================= write and push
const README = `# live-cache: near-live aircraft and ships for the Docklands 3D page

This orphan branch of danbri/londat has one commit, replaced every 5 minutes (when GitHub runs the schedule; it may delay
or skip runs under load) by \`cwplans/tools/fetch-live-cache.mjs\` (workflow \`.github/workflows/live-cache.yml\` on main).
Used by https://danbri.github.io/londat/docklands/ (layers Aircraft and Ships). Not for navigation.

## aircraft.json: the last 60 minutes

**Data: © adsb.lol contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)** (from the adsb.lol live API,
https://api.adsb.lol, \`/v2/point/51.505/-0.02/25\`; feeder data CC0). This extract is a derived database under the ODbL:
keep this notice. Area: 25 nm round 51.505 N, 0.02 W. \`now\` (ms, the newest answer), \`t0\` (s), \`snaps\` (one per
answer), \`ac\`: \`k\` key, \`c\` callsign (operator flights only), \`ty\` ICAO type, \`cat\` category, \`P\` reports
[t s from t0, lat 1e-5, lon 1e-5, alt in 25 ft above the WGS84 ellipsoid, q (0 GNSS, 1 pressure altitude + corr_ft of its
snapshot, 2 ground), ground speed kt, track deg, vertical rate fpm, turn rate 0.01 deg/s]. Callsigns only for operator
flights not on LADD/PIA; every other aircraft has an anonymous key and its type only.

## ships.json: the last 2 hours

**Data: Open Waters AIS (https://openwaters.io/ais/)**, per event from its source: CC0 1.0 (volunteer receptions), NLOD 2.0
(Norwegian Coastal Administration), CC BY 4.0 (Fintraffic / digitraffic.fi), AISHub (https://www.aishub.net) and
aisstream.io (scoping use, owner decision of 2026-10-04; review before scaling). Each vessel carries its own
\`attribution\`. Envelope 51.474-51.528 N, 0.095 W-0.085 E. \`vessels\`: static fields, \`P\` positions [t s from t0, lat 1e-5,
lon 1e-5, sog 0.1 kn, cog deg, heading deg, nav_status]. Small private craft are counted (\`snaps[].private_not_listed\`),
never listed. A vessel still listed by Open Waters (moored ones up to 7 days) keeps its newest position even when it is older
than 2 hours.

## metar.json: the last 24 hours

London City Airport (EGLC) METAR reports from the NOAA Aviation Weather Center data API
(https://aviationweather.gov/data/api/; NWS: "public domain, unless specifically noted otherwise"). The reports are made by
the UK Met Office and exchanged through the WMO. Wind direction in degrees true, speeds in knots, cloud bases in feet above
the aerodrome, visibility in metres (from the report text).
`;

function push(msg) {
  const idxFile = join(tmpdir(), `live-cache-index-${process.pid}`); rmSync(idxFile, { force: true });
  const env = { GIT_INDEX_FILE: idxFile, GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'londat live cache bot', GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || 'londat-cache@users.noreply.github.com' };
  env.GIT_COMMITTER_NAME = env.GIT_AUTHOR_NAME; env.GIT_COMMITTER_EMAIL = env.GIT_AUTHOR_EMAIL;
  const gitDir = git(['rev-parse', '--absolute-git-dir']);
  const files = ['README.md', 'aircraft.json', 'ships.json', 'metar.json'].filter(f => existsSync(join(OUT, f)));
  git(['--git-dir', gitDir, '--work-tree', OUT, '-C', OUT, 'add', '-f', ...files], env);
  const tree = git(['write-tree'], env), commit = git(['commit-tree', tree, '-m', msg], env);
  rmSync(idxFile, { force: true });
  git(['push', '-f', 'origin', `${commit}:refs/heads/${BRANCH}`]);
  console.log(`pushed ${commit} to ${BRANCH} (tree ${tree})`);
}

mkdirSync(OUT, { recursive: true });
const readOld = f => { try { return JSON.parse(readFileSync(join(OUT, f), 'utf8')); } catch { return null; } };
const prev = A.includes('--restore') ? restore() : { aircraft: readOld('aircraft.json'), ships: readOld('ships.json'), metar: readOld('metar.json') };
const parts = [];
let failed = 0;
for (const [name, fn] of [['aircraft', aircraft], ['ships', ships], ['metar', metar]]) {
  if (ONLY && ONLY !== name) { if (prev[name]) writeFileSync(join(OUT, name + '.json'), JSON.stringify(prev[name])); continue; }
  try {
    const b = await fn(prev[name] || null);
    const body = b || prev[name]; if (!body) continue;
    const txt = JSON.stringify(body); writeFileSync(join(OUT, name + '.json'), txt);
    console.log(`${name}.json: ${txt.length.toLocaleString('en')} bytes`);
    if (b) parts.push(name === 'aircraft' ? `${b.ac.length} aircraft` : name === 'ships' ? `${b.vessels.length} vessels` : `${b.obs.length} METAR`);
  } catch (e) {
    failed++; console.error(`${name}: failed: ${e.message}; the previous file is kept`);
    if (prev[name]) writeFileSync(join(OUT, name + '.json'), JSON.stringify(prev[name]));
  }
}
writeFileSync(join(OUT, 'README.md'), README);
if (failed === 3) process.exitCode = 1;
if (A.includes('--push') && parts.length) push(`live-cache: ${new Date().toISOString().slice(0, 16)}Z, ${parts.join(', ')} (adsb.lol ODbL 1.0; Open Waters AIS)`);
else if (A.includes('--push')) console.log('nothing new: nothing pushed');
