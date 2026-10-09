// Live aircraft for the "planes" layer of the Three.js port (docklands/layers/planes.js): positions from the adsb.lol API
// (ODbL 1.0), fetched in the browser only after the visitor taps "Live aircraft", while the layer is on, the tab is
// visible and the page clock is now. Nothing is stored or committed. The simulated traffic stays as the fallback.
// Owner decision, 2026-10-09: "adsb.lol (ODbL) (Recommended)": "Free live API, open data under ODbL, like OSM. Fetched
// in the browser only after a tap, shown with the ODbL credit, recorded in the data register as 'review', nothing
// committed. Simulated traffic stays as the fallback."
// This module: the request and its back-off (startFeed), the record of each aircraft between polls (dead reckoning,
// smoothing, the 2-minute trail), the ICAO type designator -> model table (modelFor), altitude to metres OD (geoid
// offset from OSGM15), and the privacy rule (identified). Facts and measurements: skill docklands-sky, "Aircraft".
// The near-live 5-minute cache (createNearLive) and the 7-day recorded cache (createRecorded) are at the end.
// URL: ?adsb=<base URL> asks another server with the same /v2/point API (a relay; https or this site only).
import { FT, KT } from './planes-data.js';

export const ADSB = {
  base: 'https://api.adsb.lol', lat: 51.505, lon: -0.02, nm: 25,   // the model box and the London City approaches
  every: 8000,             // ms between polls while live (5 to 10 s asked; adsb.lol: "Rate limits are dynamic")
  timeout: 10000, backoff0: 15000, backoffMax: 120000, slow429: 60000,
  stale: 60000,            // ms: an aircraft with no report for this long is dropped; with no answer for this long the
                           // page goes back to the simulation
  reckonMax: 20,           // s: dead reckoning stops this long after the report (the aircraft then waits there)
  trail: 120000,           // ms of trail
  site: 'https://adsb.lol', docs: 'https://api.adsb.lol/docs', licence: 'https://opendatacommons.org/licenses/odbl/1-0/',
  credit: 'Aircraft: © adsb.lol contributors, ODbL',
};

// ---------- the API URL: ?adsb= may name a relay (https, or a path on this site); anything else is ignored
export function feedUrl(qs) {
  let base = ADSB.base; const q = qs && qs.get('adsb');
  if (q) { try { const u = new URL(q, location.href); if (u.protocol === 'https:' || u.origin === location.origin) base = u.href.replace(/\/$/, ''); } catch { /* keep the default */ } }
  return `${base}/v2/point/${ADSB.lat}/${ADSB.lon}/${ADSB.nm}`;
}

// ---------- geoid: ellipsoid height (WGS84 / ETRS89) minus height above Ordnance Datum Newlyn, metres. Quadratic fit to
// OSGM15 (PROJ uk_os_OSGM15_GB.tif, EPSG:4937 -> EPSG:7405) on a 14 x 14 grid, 51.09-51.92 N, 0.68 W-0.64 E (the
// 25 nm circle); max error 0.10 m. 45.41 m at 51.505 N 0.02 W, 45.32 m at London City.
const NG = [45.4482, -1.0131, 1.1362, -0.6868, 0.3213, 0.6729];
export const geoidN = (lon, lat) => { const a = lon + 0.02, b = lat - 51.505; return NG[0] + NG[1] * a + NG[2] * b + NG[3] * a * b + NG[4] * a * a + NG[5] * b * b; };

// ---------- models by ICAO type designator (t); the dimensions (m) are the type's published length, span, height and
// fuselage diameter; rotorcraft: length, rotor diameter R, height. The card names the real type and the model drawn.
const J = (type, L, S, H, D, kind = 'jet') => ({ type, L, S, H, D, kind });
const HE = (type, L, R, H) => ({ type, L, R, H, kind: 'heli' });
const MODELS = {
  E170: J('Embraer E175', 31.7, 26.0, 9.7, 3.0), E190: J('Embraer E190', 36.2, 28.7, 10.6, 3.0), E295: J('Embraer E195', 41.5, 35.1, 10.9, 3.0),
  BCS1: J('Airbus A220-100', 35.0, 35.1, 11.5, 3.7), BCS3: J('Airbus A220-300', 38.7, 35.1, 11.5, 3.7),
  AT76: J('ATR 72', 27.2, 27.1, 7.65, 2.6, 'turboprop'), AT45: J('ATR 42', 22.7, 24.6, 7.6, 2.6, 'turboprop'), DH8D: J('Dash 8-400', 32.8, 28.4, 8.3, 2.7, 'turboprop'),
  A319: J('Airbus A319', 33.8, 35.8, 11.8, 3.95), A320: J('Airbus A320', 37.6, 35.8, 11.8, 3.95), A321: J('Airbus A321', 44.5, 35.8, 11.8, 3.95),
  B737: J('Boeing 737-700', 33.6, 35.8, 12.5, 3.76), B738: J('Boeing 737-800', 39.5, 35.9, 12.5, 3.76), B739: J('Boeing 737-900', 42.1, 35.9, 12.5, 3.76),
  B752: J('Boeing 757', 47.3, 38.1, 13.6, 3.76), B763: J('Boeing 767', 54.9, 47.6, 15.9, 5.03, 'wide'),
  B788: J('Boeing 787-8', 56.7, 60.1, 17.0, 5.8, 'wide'), B789: J('Boeing 787-9', 62.8, 60.1, 17.0, 5.8, 'wide'), B78X: J('Boeing 787-10', 68.3, 60.1, 17.0, 5.8, 'wide'),
  A332: J('Airbus A330-200', 58.8, 60.3, 17.4, 5.64, 'wide'), A333: J('Airbus A330-300', 63.7, 60.3, 16.8, 5.64, 'wide'), A339: J('Airbus A330-900', 63.7, 64.0, 16.8, 5.64, 'wide'),
  A359: J('Airbus A350-900', 66.8, 64.75, 17.05, 6.0, 'wide'), A35K: J('Airbus A350-1000', 73.8, 64.75, 17.1, 6.0, 'wide'),
  B772: J('Boeing 777-200', 63.7, 60.9, 18.5, 6.2, 'wide'), B77W: J('Boeing 777-300', 73.9, 64.8, 18.5, 6.2, 'wide'),
  A343: J('Airbus A340-300', 63.7, 60.3, 16.9, 5.64, 'wide4'), B744: J('Boeing 747-400', 70.7, 64.4, 19.4, 6.5, 'wide4'), B748: J('Boeing 747-8', 76.3, 68.4, 19.4, 6.5, 'wide4'),
  A388: J('Airbus A380', 72.7, 79.8, 24.1, 7.1, 'wide4'),
  GBIZ: J('business jet (generic)', 20.0, 19.0, 6.0, 2.2), GTPM: J('regional turboprop (generic)', 20.0, 22.0, 6.5, 2.3, 'turboprop'),
  GTPS: J('light aircraft (generic)', 11.0, 14.0, 4.0, 1.5, 'turboprop'),
  EC35: HE('Airbus H135', 12.2, 10.2, 3.5), EC45: HE('Airbus H145', 13.6, 11.0, 4.0), A169: HE('Leonardo AW169', 14.6, 12.1, 4.5), A139: HE('Leonardo AW139', 16.7, 13.8, 5.0),
  AS65: HE('Airbus AS365 Dauphin', 13.7, 11.9, 4.1), A109: HE('Leonardo A109', 13.0, 11.0, 3.5), S92: HE('Sikorsky S-92', 20.9, 17.2, 4.7), H47: HE('Boeing Chinook (drawn with one rotor)', 30.1, 18.3, 5.7),
  R44: HE('Robinson R44', 11.7, 10.1, 3.3), GHEL: HE('helicopter (generic)', 13.0, 11.0, 4.0),
};
for (const [code, m] of Object.entries(MODELS)) m.code = code;
const ALIAS = {
  E170: 'E170', E75S: 'E170', E75L: 'E170', E190: 'E190', E290: 'E190', E195: 'E295', E295: 'E295',
  BCS1: 'BCS1', BCS3: 'BCS3', AT72: 'AT76', AT73: 'AT76', AT75: 'AT76', AT76: 'AT76', AT43: 'AT45', AT44: 'AT45', AT45: 'AT45', AT46: 'AT45',
  DH8A: 'DH8D', DH8B: 'DH8D', DH8C: 'DH8D', DH8D: 'DH8D',
  A318: 'A319', A319: 'A319', A19N: 'A319', A320: 'A320', A20N: 'A320', A321: 'A321', A21N: 'A321',
  B735: 'B737', B736: 'B737', B737: 'B737', B37M: 'B737', B738: 'B738', B38M: 'B738', B739: 'B739', B39M: 'B739', B3XM: 'B739',
  B752: 'B752', B753: 'B752', B762: 'B763', B763: 'B763', B764: 'B763', B788: 'B788', B789: 'B789', B78X: 'B78X',
  A332: 'A332', A333: 'A333', A338: 'A339', A339: 'A339', A359: 'A359', A35K: 'A35K', B772: 'B772', B77L: 'B772', B773: 'B77W', B77W: 'B77W', B779: 'B77W',
  A342: 'A343', A343: 'A343', A345: 'A343', A346: 'A343', B744: 'B744', B748: 'B748', A388: 'A388',
  // business jets
  GLF4: 'GBIZ', GLF5: 'GBIZ', GLF6: 'GBIZ', GLEX: 'GBIZ', GL5T: 'GBIZ', GL7T: 'GBIZ', CL30: 'GBIZ', CL35: 'GBIZ', CL60: 'GBIZ', F2TH: 'GBIZ', F900: 'GBIZ', FA7X: 'GBIZ', FA8X: 'GBIZ',
  C25A: 'GBIZ', C25B: 'GBIZ', C25C: 'GBIZ', C510: 'GBIZ', C525: 'GBIZ', C550: 'GBIZ', C560: 'GBIZ', C56X: 'GBIZ', C680: 'GBIZ', C68A: 'GBIZ', C700: 'GBIZ', E50P: 'GBIZ', E55P: 'GBIZ', E545: 'GBIZ', E550: 'GBIZ',
  LJ45: 'GBIZ', LJ60: 'GBIZ', LJ75: 'GBIZ', H25B: 'GBIZ', PC24: 'GBIZ', PRM1: 'GBIZ', HDJT: 'GBIZ', SF50: 'GBIZ',
  // turboprops and light aircraft
  SF34: 'GTPM', SB20: 'GTPM', JS31: 'GTPM', JS32: 'GTPM', JS41: 'GTPM', D328: 'GTPM', E120: 'GTPM', F50: 'GTPM', DHC6: 'GTPM', L410: 'GTPM', B190: 'GTPM',
  PC12: 'GTPS', C208: 'GTPS', BE20: 'GTPS', B350: 'GTPS', BE9L: 'GTPS', BE30: 'GTPS', P180: 'GTPS', TBM7: 'GTPS', TBM8: 'GTPS', TBM9: 'GTPS', PA31: 'GTPS', PA34: 'GTPS', PA46: 'GTPS',
  C150: 'GTPS', C152: 'GTPS', C172: 'GTPS', C182: 'GTPS', PA28: 'GTPS', P28A: 'GTPS', SR20: 'GTPS', SR22: 'GTPS', DA40: 'GTPS', DA42: 'GTPS', DA62: 'GTPS', BE58: 'GTPS',
  // rotorcraft
  EC35: 'EC35', H135: 'EC35', EC45: 'EC45', H145: 'EC45', BK17: 'EC45', A169: 'A169', A139: 'A139', A189: 'A139', AS65: 'AS65', EC55: 'AS65', EC75: 'A139', H160: 'AS65',
  A109: 'A109', A119: 'A109', AS50: 'A109', AS55: 'A109', EC30: 'A109', EC20: 'R44', B06: 'R44', B407: 'A109', B429: 'A109', S76: 'A139', S92: 'S92', H47: 'H47', H60: 'S92', NH90: 'S92', EH10: 'S92', R22: 'R44', R44: 'R44', R66: 'R44',
};
const BY_CAT = { A1: 'GTPS', A2: 'GBIZ', A3: 'A320', A4: 'B752', A5: 'B789', A6: 'GBIZ', A7: 'GHEL', B1: 'GTPS', B4: 'GTPS', B6: 'GHEL' };
// the model to draw, or null for what is not an aircraft (ground vehicles C1/C2, obstacles C3, towers 'TWR')
export function modelFor(ac) {
  const t = (ac.t || '').toUpperCase(), cat = ac.category || '';
  if (/^C/.test(cat) || t === 'TWR' || t === 'GND' || t === 'SERV' || /^B[235]/.test(cat)) return null;
  return MODELS[ALIAS[t] || BY_CAT[cat] || 'A320'];
}

// ---------- privacy rule: callsign, registration and squawk are shown only for an aircraft that flies under an
// operator's ICAO callsign (three letters, then a digit: BAW26E) and is not on LADD or PIA (dbFlags bits 8 and 4) and
// has an ICAO address (no "~", which marks a non-ICAO or anonymised address). Every other aircraft (private aircraft
// flying under their registration, which leads to the owner in the CAA register; blocked or privacy addresses; no
// callsign) is shown by its type only. The owner/operator field (ownOp), when the API sends it, is never shown.
export function identified(ac) {
  const f = (ac.flight || '').trim();
  return /^[A-Z]{3}[0-9][0-9A-Z]{0,4}$/.test(f) && !((ac.dbFlags | 0) & 12) && !/^~/.test(ac.hex || '');
}

// ---------- height in metres OD: alt_geom (GNSS height above the WGS84 ellipsoid, ft) minus the geoid offset; or
// alt_baro (pressure altitude, ft, 1013.25 hPa) plus the QNH correction of this answer: the median of (alt_geom height
// OD in ft - alt_baro) over aircraft below 10,000 ft that send both, else (median nav_qnh - 1013.25) x 27.7 ft/hPa, else 0.
export function baroCorrection(list) {
  const d = [], q = [];
  for (const a of list) {
    if (typeof a.alt_baro === 'number' && a.alt_baro < 10000) {
      if (typeof a.alt_geom === 'number' && a.lat != null) d.push((a.alt_geom * FT - geoidN(a.lon, a.lat)) / FT - a.alt_baro);
      if (typeof a.nav_qnh === 'number' && a.nav_qnh > 950 && a.nav_qnh < 1060) q.push(a.nav_qnh);
    }
  }
  const med = v => { v.sort((x, y) => x - y); return v[v.length >> 1]; };
  if (d.length >= 3) return { ft: med(d), how: `QNH correction ${Math.round(med(d))} ft (median of GNSS minus pressure altitude of ${d.length} aircraft below 10,000 ft)` };
  if (q.length) return { ft: (med(q) - 1013.25) * 27.7, how: `QNH ${med(q).toFixed(1)} hPa (median of ${q.length} aircraft), 27.7 ft/hPa` };
  return { ft: 0, how: 'no QNH known: pressure altitude used as it is' };
}
export function heightOD(ac, corr, groundY) {
  if (ac.alt_baro === 'ground') return { y: groundY, src: 'on the ground', ground: true };
  if (typeof ac.alt_geom === 'number') return { y: ac.alt_geom * FT - geoidN(ac.lon, ac.lat), src: `GNSS height ${ac.alt_geom.toLocaleString('en-GB')} ft above the WGS84 ellipsoid, minus the geoid (OSGM15) ${geoidN(ac.lon, ac.lat).toFixed(1)} m`, ground: false };
  if (typeof ac.alt_baro === 'number') return { y: (ac.alt_baro + corr.ft) * FT, src: `pressure altitude ${ac.alt_baro.toLocaleString('en-GB')} ft; ${corr.how}`, ground: false };
  return null;
}

// ---------- the poller. run(): may it ask now (tapped, layer on, tab visible, clock now). onData(json, receivedAt).
export function startFeed({ url, run, onData, onChange }) {
  const S = { state: 'idle', polls: 0, errors: 0, wait: ADSB.every, nextAt: 0, lastOk: 0, lastTry: 0, lastError: null, busy: false, url };
  const set = (k, v) => { S[k] = v; onChange && onChange(S); };
  async function poll() {
    S.busy = true; S.lastTry = Date.now(); set('state', S.lastOk ? 'live' : 'waiting');
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), ADSB.timeout);
    try {
      const r = await fetch(url, { signal: ac.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
      const j = await r.json(); if (!j || !Array.isArray(j.ac)) throw new Error('answer without an aircraft list');
      S.polls++; S.errors = 0; S.wait = ADSB.every; S.lastOk = Date.now(); S.lastError = null; onData(j, S.lastOk); set('state', 'live');
    } catch (e) {
      S.errors++; S.lastError = e.name === 'AbortError' ? `no answer in ${ADSB.timeout / 1000} s` : e.name === 'TypeError' ? 'the request failed: no network, or the browser blocked the answer (api.adsb.lol sends no CORS header)' : e.message;
      S.wait = Math.min(ADSB.backoffMax, Math.max(e.status === 429 ? ADSB.slow429 : 0, ADSB.backoff0 * 2 ** (S.errors - 1)));
      set('state', Date.now() - S.lastOk < ADSB.stale ? 'live' : 'error');
    } finally { clearTimeout(to); S.busy = false; S.nextAt = Date.now() + S.wait; }
  }
  function tick() {
    if (S.stopped) return;
    if (!run()) { if (S.state !== 'paused') set('state', 'paused'); }
    else if (!S.busy && Date.now() >= S.nextAt) poll();
  }
  const timer = setInterval(tick, 1000), vis = () => tick();
  document.addEventListener('visibilitychange', vis); tick();
  S.stop = () => { S.stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', vis); set('state', 'idle'); };
  S.now = () => { S.nextAt = 0; tick(); };
  return S;
}

// ---------- the aircraft between polls. geo(lon, lat) -> [x, z] (the page's own transform); conv: grid bearing of true
// north (rad); groundAt(x, z) -> m OD.
export function createTracks({ geo, conv, groundAt }) {
  const T = new Map();   // hex -> track
  let corr = { ft: 0, how: '' }, lastAnswer = null;
  const deg = Math.PI / 180;
  function ingest(j, receivedAt) {
    const list = j.ac || []; corr = baroCorrection(list); lastAnswer = { now: j.now, receivedAt, total: list.length };
    for (const a of list) {
      if (a.lat == null || a.lon == null || !a.hex || (a.seen_pos != null && a.seen_pos > ADSB.stale / 1000)) continue;
      const M = modelFor(a); if (!M) continue;
      const [x, z] = geo(a.lon, a.lat), gy = groundAt(x, z), h = heightOD(a, corr, gy); if (!h) continue;
      const trkTrue = a.track ?? a.true_heading ?? a.mag_heading; if (trkTrue == null && !h.ground) continue;
      const tp = receivedAt - (a.seen_pos || 0) * 1000, server = (j.now || receivedAt) - (a.seen_pos || 0) * 1000;
      const vrFpm = a.geom_rate ?? a.baro_rate ?? 0;
      let k = T.get(a.hex);
      const rep = { x, z, y: Math.max(h.y, gy), ground: h.ground, gs: (a.gs || 0) * KT, trk: (trkTrue || 0) * deg + conv, trkTrue: trkTrue ?? null,
        rate: (a.track_rate || 0) * deg, vr: h.ground ? 0 : vrFpm * FT / 60, roll: (a.roll || 0) * deg, tp, server, ac: a, M, alt: h };
      if (!k) { k = { hex: a.hex, trail: [], disp: null, corr: [0, 0, 0, 0], corrAt: 0 }; T.set(a.hex, k); }
      else if (k.rep && tp <= k.rep.tp) continue;   // nothing newer
      else if (k.disp) {   // smooth the jump from where it was drawn to the new prediction
        const p = predict(rep, Date.now());
        const dx = k.disp.x - p.x, dy = k.disp.y - p.y, dz = k.disp.z - p.z, dh = Math.atan2(Math.sin(k.disp.h - p.h), Math.cos(k.disp.h - p.h));
        k.corr = Math.hypot(dx, dz) < 2000 ? [dx, dy, dz, dh] : [0, 0, 0, 0]; k.corrAt = Date.now();
      }
      k.rep = rep;
      const last = k.trail.at(-1); if (!last || Math.hypot(last[1] - x, last[3] - z) > 5 || Math.abs(last[2] - rep.y) > 3) k.trail.push([tp, x, rep.y, z]);
    }
    prune(receivedAt);
  }
  function prune(now) {
    for (const [hex, k] of T) {
      if (now - k.rep.tp > ADSB.stale) { T.delete(hex); continue; }
      while (k.trail.length && now - k.trail[0][0] > ADSB.trail) k.trail.shift();
    }
  }
  // position at time t (ms, Date.now() clock): straight or on the reported turn rate, for at most reckonMax seconds
  function predict(r, t) {
    const dt = Math.max(0, Math.min(ADSB.reckonMax, (t - r.tp) / 1000));
    if (r.ground && r.gs < 1) return { x: r.x, y: r.y, z: r.z, h: r.trk };
    const w = Math.abs(r.rate) > 1e-4 ? Math.max(-0.1, Math.min(0.1, r.rate)) : 0, h = r.trk + w * dt;
    let x, z;
    if (w) { x = r.x + r.gs / w * (Math.cos(r.trk) - Math.cos(h)); z = r.z - r.gs / w * (Math.sin(h) - Math.sin(r.trk)); }
    else { x = r.x + Math.sin(r.trk) * r.gs * dt; z = r.z - Math.cos(r.trk) * r.gs * dt; }
    return { x, y: r.ground ? r.y : Math.max(r.y + r.vr * dt, 0), z, h };
  }
  // the drawn state of every aircraft at t: the prediction plus the smoothing offset, decaying in 1.5 s
  function states(t) {
    const out = [];
    for (const k of T.values()) {
      if (t - k.rep.tp > ADSB.stale) continue;
      const r = k.rep, p = predict(r, t), f = Math.exp(-(t - k.corrAt) / 1500), c = k.corr;
      const s = { x: p.x + c[0] * f, y: p.y + c[1] * f, z: p.z + c[2] * f, h: p.h + c[3] * f };
      k.disp = s;
      const vs = r.vr, pitch = r.ground ? 0 : Math.atan2(vs, Math.max(r.gs, 20)) + (r.M.kind === 'heli' ? -3 * deg : 3 * deg);
      const bank = r.ground ? 0 : Math.max(-0.6, Math.min(0.6, r.ac.roll != null ? r.roll : Math.atan(r.gs * r.rate / 9.81)));
      out.push({ k, r, S: { x: s.x, y: s.y, z: s.z, h: s.h, pitch, bank, v: r.gs, vs, ground: r.ground,
        gear: r.M.kind === 'heli' || r.ground || (s.y < 900 && vs < -1) || s.y < 200, landOn: r.ground ? r.gs > 20 : s.y < 760 } });
    }
    return out;
  }
  return { T, ingest, states, prune, get corr() { return corr; }, get lastAnswer() { return lastAnswer; }, clear() { T.clear(); } };
}

// ---------- RECORDED aircraft: the rolling 7-day cache of adsb.lol history (branch adsb-cache of danbri/londat, built
// daily by cwplans/tools/fetch-adsb-cache.mjs). Owner, 2026-10-09: "For today build a cache of last 7 days for our
// areas, and show equivalent data for the matching time and day of week." The page clock is mapped to the held day with
// the same London weekday (the clock's own date when it is held) at the same London time of day, and the recorded tracks
// are played between their points (straight lines in time; one point a second at most, one a minute above 15,000 ft).
// Files: index.json, adsb/<date>/<HH>.json.gz (UTC hour; delta-coded columns, see the branch README). Read from
// raw.githubusercontent.com (Access-Control-Allow-Origin: *), never from adsb.lol. URL: ?adsbcache=<base> (https or a
// path on this site) reads another copy.
export const REC = { base: 'https://raw.githubusercontent.com/danbri/londat/adsb-cache/', trail: 120, maxGap: 660 };
export function recBase(qs) {
  const q = qs && qs.get('adsbcache');
  if (q) { try { const u = new URL(q, location.href); if (u.protocol === 'https:' || u.origin === location.origin) return u.href.replace(/\/?$/, '/'); } catch { /* keep the default */ } }
  return REC.base;
}
async function getMaybeGz(url) {
  const r = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url.replace(/^.*\/(adsb\/)?/, '$1')}`);
  const b = new Uint8Array(await r.arrayBuffer());
  const txt = b[0] === 0x1f && b[1] === 0x8b ? await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(b);
  return JSON.parse(txt);
}
const LDN = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset', weekday: 'short' });
export function londonParts(t) {
  const p = Object.fromEntries(LDN.formatToParts(new Date(t)).map(x => [x.type, x.value])), m = /GMT([+-]\d+)?(?::(\d+))?/.exec(p.timeZoneName || '');
  const off = m && m[1] ? (+m[1]) * 60 + (m[2] ? Math.sign(+m[1]) * +m[2] : 0) : 0;
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, wd: p.weekday, off };
}
const isoUTC = t => new Date(t).toISOString().slice(0, 10);

export function createRecorded({ geo, conv, groundAt, base }) {
  const R = { state: 'idle', error: null, index: null, held: new Set(), files: new Map(), pick: null, base, legs: 0 };
  const deg = Math.PI / 180;
  let indexP = null;
  function loadIndex() {
    if (indexP) return indexP;
    R.state = 'loading';
    indexP = getMaybeGz(base + 'index.json').then(j => { R.index = j; R.held = new Set((j.days || []).map(d => d.date)); R.state = R.held.size ? 'ready' : 'empty'; })
      .catch(e => { R.state = 'error'; R.error = `${e.name === 'TypeError' ? 'the request failed' : e.message}`; });
    return indexP;
  }
  // the recorded instant for page time T (ms): the clock's own date when it is held, else the most recent held day with
  // the same London weekday, at the same London time of day (the DST offsets of both dates are allowed for)
  function choose(T) {
    if (!R.held.size) return null;
    const L = londonParts(T), d0 = Date.parse(L.date + 'T00:00:00Z');
    const cands = [...R.held].map(d => ({ d, n: Math.round((Date.parse(d + 'T00:00:00Z') - d0) / 86400e3) })).filter(c => c.n % 7 === 0)
      .sort((a, b) => (a.n === 0 ? -1 : b.n === 0 ? 1 : b.d.localeCompare(a.d)));
    for (const c of cands) {
      const t1 = T + c.n * 86400e3, t = t1 + (L.off - londonParts(t1).off) * 60e3;
      if (R.held.has(isoUTC(t))) return { t, shift: t - T, exact: c.n === 0, date: c.d };
    }
    return null;
  }
  // one UTC hour file -> legs with columns in page coordinates
  function decode(j) {
    const t0 = j.t0 * 1000, out = [];
    for (const L of j.legs) {
      const p = L.p, n = p.length / 7, t = new Float64Array(n), x = new Float64Array(n), y = new Float64Array(n), z = new Float64Array(n), gs = new Float32Array(n), trk = new Float32Array(n), q = new Uint8Array(n), alt = new Float32Array(n), lat = new Float64Array(n), lon = new Float64Array(n);
      const c = [0, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 7; k++) c[k] += p[i * 7 + k];
        t[i] = t0 + c[0] * 1000; lat[i] = c[1] / 1e5; lon[i] = c[2] / 1e5; alt[i] = c[3] * 25; q[i] = c[4]; gs[i] = c[5]; trk[i] = c[6];
        const [xx, zz] = geo(lon[i], lat[i]); x[i] = xx; z[i] = zz;
        const g = groundAt(xx, zz); y[i] = q[i] === 2 ? g : Math.max(g, alt[i] * FT - geoidN(lon[i], lat[i]));
      }
      out.push({ k: L.k, c: L.c, ty: L.ty, cat: L.cat, M: modelFor({ t: L.ty, category: L.cat }), t, x, y, z, gs, trk, q, alt, lat, lon, n, hour: j.hour, date: j.date, corr: j.corr_ft });
    }
    return out;
  }
  function file(t) {
    const key = `${isoUTC(t)}/${String(new Date(t).getUTCHours()).padStart(2, '0')}`;
    let f = R.files.get(key);
    if (!f) {
      if (!R.held.has(isoUTC(t))) return { state: 'missing', key };
      f = { state: 'loading', key, legs: null }; R.files.set(key, f);
      getMaybeGz(`${base}adsb/${key}.json.gz`).then(j => { f.legs = decode(j); f.state = 'ready'; R.onLoad && R.onLoad(); })
        .catch(e => { f.state = 'error'; f.error = e.message; R.onLoad && R.onLoad(); });
      if (R.files.size > 6) for (const [k, v] of R.files) { if (R.files.size <= 6) break; if (v !== f && v.state !== 'loading') R.files.delete(k); }
    }
    return f;
  }
  // the drawn state of every recorded aircraft at page time T (ms), or null while the hour file loads
  function states(T) {
    const pk = choose(T); R.pick = pk; if (!pk) return null;
    const t = pk.t, f = file(t);
    if (f.state !== 'ready') return null;   // loading (the page shows nothing yet) or failed (the page simulates)
    if ((t / 1000) % 3600 > 3420) file(t + 300e3);   // the next hour, 3 minutes ahead
    const out = [];
    for (const L of f.legs) {
      if (!L.M || t < L.t[0] || t > L.t[L.n - 1]) continue;
      let lo = 0, hi = L.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L.t[m] <= t) lo = m; else hi = m; }
      if (L.t[hi] - L.t[lo] > REC.maxGap * 1000) continue;
      const f1 = L.t[hi] > L.t[lo] ? (t - L.t[lo]) / (L.t[hi] - L.t[lo]) : 0, mix = (a) => a[lo] + (a[hi] - a[lo]) * f1;
      const x = mix(L.x), y = mix(L.y), zz = mix(L.z);
      let dT = ((L.trk[hi] - L.trk[lo] + 540) % 360) - 180; const trk = L.trk[lo] + dT * f1;
      const dt = Math.max(1, (L.t[hi] - L.t[lo]) / 1000), vs = (L.y[hi] - L.y[lo]) / dt, rate = dT * deg / dt;
      const ground = L.q[lo] === 2 && L.q[hi] === 2, v = mix(L.gs) * KT;
      const h = trk * deg + conv, pitch = ground ? 0 : Math.atan2(vs, Math.max(v, 20)) + (L.M.kind === 'heli' ? -3 * deg : 3 * deg);
      const bank = ground ? 0 : Math.max(-0.6, Math.min(0.6, Math.atan(v * rate / 9.81)));
      const trail = []; for (let i = lo; i >= 0 && t - L.t[i] < REC.trail * 1000; i--) trail.unshift([L.t[i], L.x[i], L.y[i], L.z[i]]);
      out.push({ L, i: lo, f: f1, trail, trkTrue: (trk + 360) % 360, S: { x, y, z: zz, h, pitch, bank, v, vs, ground,
        gear: L.M.kind === 'heli' || ground || (y < 900 && vs < -1) || y < 200, landOn: ground ? v > 20 * KT : y < 760 } });
    }
    return out;
  }
  return Object.assign(R, { loadIndex, choose, states, file });
}

// ---------- NEAR-LIVE aircraft: the 5-minute cache (branch live-cache of danbri/londat, aircraft.json, built by
// cwplans/tools/fetch-live-cache.mjs from the adsb.lol live API; workflow .github/workflows/live-cache.yml). Owner,
// 2026-10-09: "Couldn't we crontab it for every 5 mins? And default to live for the rest?" The file holds the reports of
// the last 60 minutes (one answer per run). The page shows them when the page clock is inside the buffer or up to
// NL.reckon + NL.fade after the newest answer, and the file is less than NL.fresh old: between two reports of an aircraft
// it moves in a straight line in time; after its last report it moves on by ground speed and track (turn rate for at most
// NL.turn s, vertical rate for at most NL.climb s) for NL.reckon s, then its label fades for NL.fade s and it goes. Read from
// raw.githubusercontent.com (Access-Control-Allow-Origin: *; its CDN keeps a file about 5 min, and a query string does
// not change that: measured 2026-10-09), every NL.every ms while wanted. URL: ?livecache=<base> reads another copy.
export const NL = { base: 'https://raw.githubusercontent.com/danbri/londat/live-cache/', every: 60000, fresh: 20 * 60e3,
  reckon: 360, fade: 360, turn: 30, climb: 120, maxGap: 1260, trail: 1200 };
export function liveCacheBase(qs) {
  const q = qs && qs.get('livecache');
  if (q) { try { const u = new URL(q, location.href); if (u.protocol === 'https:' || u.origin === location.origin) return u.href.replace(/\/?$/, '/'); } catch { /* keep the default */ } }
  return NL.base;
}
export function createNearLive({ geo, conv, groundAt, base }) {
  const R = { state: 'idle', error: null, data: null, legs: [], base, lastTry: 0, loads: 0 };
  const deg = Math.PI / 180;
  function decode(j) {
    const t0 = j.t0 * 1000, out = [];
    for (const L of j.ac) {
      const n = L.P.length, t = new Float64Array(n), x = new Float64Array(n), y = new Float64Array(n), z = new Float64Array(n), gs = new Float32Array(n), trk = new Float32Array(n), q = new Uint8Array(n), alt = new Float32Array(n), vr = new Float32Array(n), tr = new Float32Array(n), lat = new Float64Array(n), lon = new Float64Array(n);
      L.P.forEach((p, i) => {
        t[i] = t0 + p[0] * 1000; lat[i] = p[1] / 1e5; lon[i] = p[2] / 1e5; alt[i] = p[3] * 25; q[i] = p[4]; gs[i] = p[5]; trk[i] = p[6]; vr[i] = p[7] || 0; tr[i] = (p[8] || 0) / 100;
        const [xx, zz] = geo(lon[i], lat[i]); x[i] = xx; z[i] = zz;
        const g = groundAt(xx, zz); y[i] = q[i] === 2 ? g : Math.max(g, alt[i] * FT - geoidN(lon[i], lat[i]));
      });
      out.push({ k: L.k, c: L.c, ty: L.ty, cat: L.cat, M: modelFor({ t: L.ty, category: L.cat }), t, x, y, z, gs, trk, q, alt, vr, tr, lat, lon, n, near: true });
    }
    return out;
  }
  // read the file (no-cache: the browser revalidates by ETag instead of keeping it max-age=300)
  async function load() {
    R.lastTry = Date.now(); if (R.state !== 'ready') R.state = 'loading';
    try {
      const r = await fetch(base + 'aircraft.json', { cache: 'no-cache', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json(); if (!j || !Array.isArray(j.ac)) throw new Error('no aircraft list');
      if (!R.data || j.now !== R.data.now) { R.data = j; R.legs = decode(j); }
      R.state = 'ready'; R.error = null; R.loads++;
    } catch (e) { R.error = e.name === 'TypeError' ? 'the request failed' : e.message; if (!R.data) R.state = 'error'; }
    R.onLoad && R.onLoad();
  }
  const maybeLoad = () => { if (Date.now() - R.lastTry >= NL.every && R.state !== 'loading') load(); };
  const newest = () => R.data ? R.data.now : 0;
  const fresh = () => !!R.data && Date.now() - R.data.now < NL.fresh;
  // may the near-live picture stand for page time T (ms)?
  const covers = T => fresh() && T >= R.data.snaps[0].t - 60e3 && T <= R.data.now + (NL.reckon + NL.fade) * 1000;
  function states(T) {
    if (!covers(T)) return null;
    const out = [];
    for (const L of R.legs) {
      if (!L.M || T < L.t[0]) continue;
      let S, i = L.n - 1, f1 = 0, alpha = 1, est = 0, trkTrue;
      if (T <= L.t[L.n - 1]) {   // between two reports: straight in time
        let lo = 0, hi = L.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L.t[m] <= T) lo = m; else hi = m; }
        if (L.t[hi] - L.t[lo] > NL.maxGap * 1000) continue;
        f1 = L.t[hi] > L.t[lo] ? (T - L.t[lo]) / (L.t[hi] - L.t[lo]) : 0; i = lo;
        const mix = a => a[lo] + (a[hi] - a[lo]) * f1, dT = ((L.trk[hi] - L.trk[lo] + 540) % 360) - 180, dt = Math.max(1, (L.t[hi] - L.t[lo]) / 1000);
        const trk = L.trk[lo] + dT * f1, vs = (L.y[hi] - L.y[lo]) / dt, ground = L.q[lo] === 2 && L.q[hi] === 2, v = mix(L.gs) * KT;
        S = { x: mix(L.x), y: mix(L.y), z: mix(L.z), h: trk * deg + conv, v, vs, ground, rate: dT * deg / dt }; trkTrue = trk;
      } else {                   // after the last report: dead reckoning, then the fade
        const dt = (T - L.t[i]) / 1000; if (dt > NL.reckon + NL.fade) continue;
        est = dt; alpha = dt <= NL.reckon ? 1 : 1 - (dt - NL.reckon) / NL.fade;
        const ground = L.q[i] === 2, v = L.gs[i] * KT, h0 = L.trk[i] * deg + conv, w = Math.max(-0.1, Math.min(0.1, L.tr[i] * deg)), tt = Math.min(dt, NL.turn);
        let x = L.x[i], z = L.z[i], h = h0;
        if (!(ground && v < 1)) {
          if (Math.abs(w) > 1e-4) { h = h0 + w * tt; x += v / w * (Math.cos(h0) - Math.cos(h)); z -= v / w * (Math.sin(h) - Math.sin(h0)); }
          x += Math.sin(h) * v * (dt - (Math.abs(w) > 1e-4 ? tt : 0)); z -= Math.cos(h) * v * (dt - (Math.abs(w) > 1e-4 ? tt : 0));
        }
        const vs = ground ? 0 : L.vr[i] * FT / 60, y = ground ? groundAt(x, z) : Math.min(13700, Math.max(groundAt(x, z), L.y[i] + vs * Math.min(dt, NL.climb)));
        S = { x, y, z, h, v, vs, ground, rate: dt < NL.turn ? w : 0 }; trkTrue = ((h - conv) / deg + 720) % 360;
      }
      const pitch = S.ground ? 0 : Math.atan2(S.vs, Math.max(S.v, 20)) + (L.M.kind === 'heli' ? -3 * deg : 3 * deg);
      const bank = S.ground ? 0 : Math.max(-0.6, Math.min(0.6, Math.atan(S.v * S.rate / 9.81)));
      const trail = []; for (let k = i; k >= 0 && T - L.t[k] < NL.trail * 1000; k--) trail.unshift([L.t[k], L.x[k], L.y[k], L.z[k]]);
      out.push({ L, i, f: f1, trail, trkTrue, est, alpha, S: { x: S.x, y: S.y, z: S.z, h: S.h, pitch, bank, v: S.v, vs: S.vs, ground: S.ground,
        gear: L.M.kind === 'heli' || S.ground || (S.y < 900 && S.vs < -1) || S.y < 200, landOn: S.ground ? S.v > 20 * KT : S.y < 760 } });
    }
    return out;
  }
  return Object.assign(R, { load, maybeLoad, fresh, covers, states, newest });
}
