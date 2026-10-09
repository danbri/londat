// AIS data of the Three.js port's ships layer (docklands/layers/ships.js): the same sources, rules and record shape as the
// WebGL page's ships-layer.js (cwplans/docklands/ships-layer.js), plus the hourly cache's history for a page clock that is
// not now. Sources:
//   - the committed snapshot ../cwplans/feeds/river/ais.json (cwplans/tools/fetch-ais.mjs), at once;
//   - live: GET https://ais.openwaters.io/v1/vessels?bbox=... (anonymous, CORS *), by the layer every 60 s while the tab is
//     visible and the layer is on (the WebGL page's rule);
//   - the live-cache branch (ships.json: every 5 minutes, positions of the last 2 hours; loadLiveCache below): the second
//     source near now (when the live request fails or is older) and the trails of moving vessels;
//   - the londat cache (cwplans/cache/runs/<day>/live-*.json.gz, cwplans/tools/cache-londat.mjs): a run file holds the
//     ais_vessels rows of every vessel listed in that run and the ais_positions rows that were new; a snapshot is
//     rebuilt from the run nearest the page clock and the runs before it. Runs are listed through the GitHub contents API
//     and read from raw.githubusercontent.com (the Pages site does not publish cache/runs/); on a local server the same
//     files are read from the checkout first.
// Small private craft (ITU 36/37, class B without a commercial type, type not known on a non-class-A report) are never
// kept: counted only (the rule of tools/fetch-ais.mjs). AISHub and aisstream.io events are shown for scoping by the
// owner's decision of 2026-10-04: review before scaling.
// Skills: cwplans-river-and-water ("AIS: Open Waters"), cwplans-londat-cache, docklands-3d-page ("Ships (AIS)", "Three.js port").
export const API = 'https://ais.openwaters.io/v1/vessels?bbox=51.474,-0.095,51.528,0.085';
export const SNAPSHOT = '../cwplans/feeds/river/ais.json';
const RAW = 'https://raw.githubusercontent.com/danbri/londat/main/cwplans/';
const GHAPI = 'https://api.github.com/repos/danbri/londat/contents/cwplans/cache/runs/';
const LOCAL = '../cwplans/';
const CACHE_FROM = '2026-10-05';   // the first day with a run file
const local = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
const OW = 'Open Waters AIS (https://openwaters.io/ais/)';
const ATTR = { aishub: OW + '. AISHub (https://www.aishub.net)', aisstream: OW + '. aisstream.io (https://aisstream.io)' };

// ---------- the same rules as tools/fetch-ais.mjs and ships-layer.js
export const COMMERCIAL = t => t != null && ((t >= 30 && t <= 35) || (t >= 40 && t <= 99));
const CLASS_OF = { PositionReport: 'A', ShipStaticData: 'A', StandardClassBPositionReport: 'B', ExtendedClassBPositionReport: 'B', StaticDataReport: 'B' };
export function isPrivate(v) {
  if (v.kind && v.kind !== 'vessel') return false;
  if (v.ship_type === 36 || v.ship_type === 37) return true;
  if (v.class === 'B' && !COMMERCIAL(v.ship_type)) return true;
  if (!v.class && !COMMERCIAL(v.ship_type)) return true;
  return false;
}
export const GROUP = t => t == null || t === 0 ? 'type not known' : t >= 60 && t <= 69 ? 'passenger' : t >= 70 && t <= 79 ? 'cargo' : t >= 80 && t <= 89 ? 'tanker'
  : t >= 40 && t <= 49 ? 'high-speed craft' : t === 52 ? 'tug' : t === 50 ? 'pilot vessel' : t === 51 ? 'search and rescue' : t === 53 ? 'port tender'
  : t === 55 ? 'law enforcement' : t >= 50 && t <= 59 ? 'special craft' : t === 30 ? 'fishing' : t === 31 || t === 32 ? 'towing' : t === 33 ? 'dredging or underwater work'
  : t === 34 ? 'diving' : t === 35 ? 'military' : 'other';
export const COL = { passenger: [.98, .55, .2], 'high-speed craft': [.2, .8, .95], tug: [.95, .85, .2], cargo: [.55, .85, .35], tanker: [.85, .3, .3], aton: [.75, .4, .95] };
export const colOf = v => v.kind === 'aton' ? COL.aton : COL[GROUP(v.ship_type)] || [.85, .88, .92];
export const NAV = ['under way using engine', 'at anchor', 'not under command', 'restricted manoeuvrability', 'constrained by draught', 'moored', 'aground', 'engaged in fishing', 'under way sailing'];
export const still = v => v.nav_status === 1 || v.nav_status === 5 || v.nav_status === 6 || !(v.sog > .5);

// committed file items, live GeoJSON features and cache rows to one shape
export const fromItem = i => ({ mmsi: i.mmsi, kind: i.kind, name: i.name, callsign: i.callsign, imo: i.imo, flag: i.flag, ship_type: i.ship_type, class: i.class,
  length: i.length_m, beam: i.beam_m, lat: i.position.lat, lon: i.position.lon, cog: i.values.cog, sog: i.values.sog_kn, heading: i.values.heading,
  nav_status: i.values.nav_status, destination: i.values.destination, seen: i.time, source: i.source_kind || i.source, attribution: i.attribution });
export const fromFeature = (f, attr) => { const p = f.properties || {}, [lon, lat] = f.geometry ? f.geometry.coordinates : [null, null], src = String(p.source || '').split(':')[0];
  return { mmsi: p.mmsi, kind: p.kind, name: p.name, callsign: p.callsign, imo: p.imo, flag: p.flag, ship_type: p.type, class: p.class || CLASS_OF[p.msg_type] || null,
    length: p.length, beam: p.beam, lat, lon, cog: p.cog, sog: p.sog, heading: p.heading, nav_status: p.nav_status, destination: p.destination, seen: p.seen, source: src,
    attribution: attr[src] || attr[p.source] || OW }; };
// { list, n: { private } }: the private rule applied; rows with no position dropped
export function filter(list) {
  const keep = [], n = { private: 0 };
  for (const v of list) { if (v.lat == null || v.lon == null) continue; if (isPrivate(v)) { n.private++; continue; } keep.push(v); }
  return { list: keep, n };
}

const get = (u, ms = 15000) => fetch(u, { signal: AbortSignal.timeout(ms) });
export async function loadSnapshot(loadJSON) { const d = await loadJSON(SNAPSHOT); return { meta: d.meta, list: d.items.map(fromItem), at: d.meta.fetched }; }
export async function loadLive() {
  const r = await get(API); if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
  const d = await r.json(), attr = d.attribution || {};
  return { list: (d.features || []).map(f => fromFeature(f, attr)), at: new Date().toISOString(), attribution: attr };
}

// ---------- the cache: run files by day
const dayOf = t => new Date(t).toISOString().slice(0, 10);
const runTime = name => { const m = /^live-(\d{4}-\d\d-\d\d)T(\d\d)(\d\d)Z\.json\.gz$/.exec(name); return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`) : NaN; };
const listCache = new Map(), runCache = new Map();
async function listDay(day) {
  if (listCache.has(day)) return listCache.get(day);
  const job = (async () => {
    const tries = [async () => { const r = await get(GHAPI + day + '?ref=main', 10000); if (r.status === 404) return []; if (!r.ok) throw new Error('GitHub API ' + r.status); return (await r.json()).map(f => f.name); },
      async () => { const r = await get(LOCAL + 'cache/runs/' + day + '/', 10000); if (!r.ok) throw new Error('listing ' + r.status); const h = await r.text(); return [...new Set(h.match(/live-\d{4}-\d\d-\d\dT\d{4}Z\.json\.gz/g) || [])]; }];
    if (local) tries.reverse();
    let err; for (const f of tries) { try { return (await f()).filter(n => isFinite(runTime(n))).map(n => ({ day, name: n, t: runTime(n) })); } catch (e) { err = e; } }
    listCache.delete(day); throw err;
  })();
  listCache.set(day, job); return job;
}
async function readRun(r) {
  const k = r.day + '/' + r.name; if (runCache.has(k)) return runCache.get(k);
  const job = (async () => {
    const urls = [RAW + 'cache/runs/' + k, LOCAL + 'cache/runs/' + k]; if (local) urls.reverse();
    let err; for (const u of urls) { try { const x = await get(u); if (!x.ok) throw new Error(u + ' ' + x.status);
      return JSON.parse(await new Response(x.body.pipeThrough(new DecompressionStream('gzip'))).text()); } catch (e) { err = e; } }
    runCache.delete(k); throw err;
  })();
  runCache.set(k, job); return job;
}
const rowsOf = (run, table) => (run.statements || []).filter(([s]) => new RegExp(`INTO ${table} VALUES`).test(s)).flatMap(([, rows]) => rows);
// the runs of the days around time t (UTC days from CACHE_FROM to today), newest last
export async function listRuns(t) {
  const days = [], today = dayOf(Date.now());
  for (const d of [-2, -1, 0, 1]) { const day = dayOf(t + d * 864e5); if (day >= CACHE_FROM && day <= today) days.push(day); }
  const all = (await Promise.all(days.map(d => listDay(d).catch(() => [])))).flat();
  return all.sort((a, b) => a.t - b.t);
}
// a snapshot rebuilt from run file `run` (and the 8 runs before it in `runs`, for positions inserted earlier; a vessel whose
// position is older than those is left out and counted in n.nopos): { list, at, n: { private_counted, nopos }, from: 'cache' }
export async function loadRun(run, runs) {
  const R = await readRun(run), i = runs.findIndex(r => r.name === run.name), before = runs.slice(Math.max(0, i - 8), i);
  const olders = (await Promise.all(before.map(r => readRun(r).catch(() => null)))).filter(Boolean);
  const pos = new Map();   // mmsi -> [rows] (mmsi, time, fetch_time, lat, lon, sog_kn, cog, heading, nav_status, source, licence_class)
  for (const X of [...olders, R]) for (const p of rowsOf(X, 'ais_positions')) { if (!pos.has(p[0])) pos.set(p[0], []); pos.get(p[0]).push(p); }
  const fetchRow = rowsOf(R, 'ais_fetches')[0], at = fetchRow ? new Date(fetchRow[0] * 1000).toISOString() : new Date(run.t).toISOString();
  const list = []; let nopos = 0;
  for (const [mmsi, name, callsign, imo, ship_type, , klass, flag, length, beam, , last] of rowsOf(R, 'ais_vessels')) {
    const P = (pos.get(mmsi) || []).filter(p => p[1] <= last).sort((a, b) => b[1] - a[1]); const p = P.find(q => q[1] === last) || P[0]; if (!p) { nopos++; continue; }
    list.push({ mmsi, kind: String(mmsi).startsWith('99') ? 'aton' : 'vessel', name, callsign, imo, flag, ship_type, class: klass, length, beam, lat: p[3], lon: p[4],
      sog: p[5], cog: p[6], heading: p[7], nav_status: p[8], seen: new Date(p[1] * 1000).toISOString(), source: p[9], attribution: ATTR[p[9]] || OW });
  }
  return { list, at, from: 'cache', run: run.day + '/' + run.name, n: { private_counted: fetchRow ? fetchRow[2] : null, nopos } };
}

// ---------- the live-cache branch (cwplans/tools/fetch-live-cache.mjs, every 5 minutes; owner, 2026-10-09: "We want the
// webapp to always have fresh air and boat data plus recent history"): ships.json holds every vessel Open Waters listed
// in the last run (the licence filter and the small-craft rule already applied by the tool) and its positions of the
// last 2 hours. Read from raw.githubusercontent.com (Access-Control-Allow-Origin: *; the CDN keeps a file about 5 min).
// Returns { list (newest position of each vessel, the record shape above), at (the run time), tracks: Map mmsi ->
// [[t ms, lat, lon, sog kn, cog, heading, nav_status], ...] oldest first, from: 'live-cache', n: { private_counted } }.
export const LIVECACHE = 'https://raw.githubusercontent.com/danbri/londat/live-cache/';
export async function loadLiveCache(base = LIVECACHE) {
  const r = await fetch(base + 'ships.json', { cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Object.assign(new Error('live-cache HTTP ' + r.status), { status: r.status });
  const d = await r.json(), t0 = d.t0 * 1000, tracks = new Map(), list = [];
  for (const v of d.vessels || []) {
    const P = v.P.map(p => [t0 + p[0] * 1000, p[1] / 1e5, p[2] / 1e5, p[3] == null ? null : p[3] / 10, p[4], p[5], p[6]]);
    tracks.set(v.mmsi, P); list.push(cacheRow(v, P.at(-1)));
  }
  const last = (d.snaps || []).at(-1), priv = last ? Object.values(last.private_not_listed || {}).reduce((s, x) => s + x, 0) : null;
  return { list, at: new Date(d.now).toISOString(), tracks, from: 'live-cache', n: { private_counted: priv, nopos: 0 }, first: d.snaps && d.snaps.length ? d.snaps[0].t : d.now };
}
const cacheRow = (v, p) => ({ mmsi: v.mmsi, kind: v.kind, name: v.name, callsign: v.callsign, imo: v.imo, flag: v.flag, ship_type: v.ship_type, class: v.class, length: v.length, beam: v.beam,
  destination: v.destination, lat: p[1], lon: p[2], sog: p[3], cog: p[4], heading: p[5], nav_status: p[6], seen: new Date(p[0]).toISOString(), source: v.source, attribution: v.attribution || OW });
// the live-cache picture at time t (ms) inside its buffer: each vessel at its last position at or before t
export function liveCacheAt(lc, t) {
  const list = [];
  for (const v of lc.list) { const P = lc.tracks.get(v.mmsi) || []; let p = null; for (const q of P) if (q[0] <= t) p = q; if (p) list.push({ ...v, lat: p[1], lon: p[2], sog: p[3], cog: p[4], heading: p[5], nav_status: p[6], seen: new Date(p[0]).toISOString() }); }
  return { ...lc, list, at: new Date(t).toISOString() };
}
