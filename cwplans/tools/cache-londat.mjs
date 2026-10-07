#!/usr/bin/env node
// Append the live snapshots of the Docklands zone to an SQLite history in the danbri/londat checkout, and write the
// compact "latest + last 24 h" file that the pages read before they ask any third-party service.
//
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/cache-londat.mjs            # run the fetch tools (subset), then append
//   node magpie/cwplans/tools/cache-londat.mjs --no-fetch                      # append from the snapshot JSON in this checkout
//   options: --themes=bikes,lifts,...   (default: all)   --dry   (no write)   --vacuum   (VACUUM the month file)
//
// Fetch mode runs, one after the other and with their own politeness unchanged:
//   fetch-live.mjs bikes lifts crowding ukpn overflows notams; fetch-river.mjs levels river-bus; fetch-ais.mjs --listen=0
// and asks two small endpoints itself (one request each, User-Agent from lib.mjs): TfL line status by mode and the
// Open-Meteo current weather. Those two are written to data/raw/cache/ (gitignored) so --no-fetch can read them again.
// The fetch tools rewrite their snapshot files in this checkout (feeds/live, feeds/river), as they always do.
//
// Out (LONDAT_DIR, tools/londat.mjs):
//   cwplans/cache/runs/<day>/live-<run time>.json.gz   the rows this run added (one folder per UTC day keeps each git tree small) (a few kB; one small new file per run, so git
//                                                history grows by the new rows only, not by a new copy of a database)
//   cwplans/cache/latest.json                    latest state + last 24 h series, per theme
//   cwplans/cache/live-YYYY-MM.sqlite            written once, by the first run of the next month: the month's run
//                                                files replayed into one SQLite, VACUUMed; then those run files are removed
// Each run rebuilds the current month in a working SQLite (data/raw/cache/, gitignored) from the run files, adds its own
// rows and records the ones that were new. Idempotent: every table has a primary key with the source's own fetch time
// (or reading time); a second run on the same snapshots adds no rows and writes no run file. Schema, sizes, refresh plan and licences: skill cwplans-londat-cache
// (magpie/cwplans/skills/cwplans-londat-cache/SKILL.md).
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, rmSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, RAW, UA } from './lib.mjs';
import { LONDAT_CW, warnIfNoLondat } from './londat.mjs';

process.removeAllListeners('warning');   // node:sqlite prints an ExperimentalWarning in Node 22; nothing else is hidden
const { DatabaseSync } = await import('node:sqlite');

const CW = join(TOOLS, '..'), OUT = join(LONDAT_CW, 'cache'), RUNS = join(OUT, 'runs'), RAWDIR = join(RAW, 'cache');
const args = process.argv.slice(2), NOFETCH = args.includes('--no-fetch'), DRY = args.includes('--dry');
const THEMES = ['bikes', 'lifts', 'crowding', 'power_cuts', 'overflows', 'notams', 'ais', 'tide', 'line_status', 'river_bus', 'weather'];
const want = new Set(((args.find(a => a.startsWith('--themes=')) || '').split('=')[1] || THEMES.join(',')).split(','));
for (const t of want) if (!THEMES.includes(t)) { console.error(`unknown theme ${t}; themes: ${THEMES.join(' ')}`); process.exit(2); }
warnIfNoLondat();
mkdirSync(RUNS, { recursive: true }); mkdirSync(RAWDIR, { recursive: true });
const STARTED = new Date(), errors = [];
const ep = s => { if (s == null || s === '' || s === 'PERM') return null; const v = Date.parse(s); return isFinite(v) ? Math.round(v / 1000) : null; };
const iso = t => t == null ? null : new Date(t * 1000).toISOString().replace('.000Z', 'Z');
const r5 = v => v == null || !isFinite(v) ? null : Math.round(v * 1e5) / 1e5;
const readJ = rel => { const f = join(CW, rel); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };

// ---------------- 1. fetch (the existing tools, then two small requests of our own)
function runTool(tool, toolArgs) {
  const t0 = Date.now(), r = spawnSync(process.execPath, [join(TOOLS, tool), ...toolArgs], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: process.env, timeout: 15 * 60e3 });
  const tail = s => (s || '').trim().split('\n').slice(-4).join(' | ').slice(0, 400);
  console.log(`${tool} ${toolArgs.join(' ')}: exit ${r.status} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (r.status !== 0) errors.push({ tool, args: toolArgs, exit: r.status, stderr: tail(r.stderr) || tail(r.stdout) });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getOnce(url, file) {   // one request, two retries on 429/5xx/network, 3 and 6 s apart
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
      if (r.ok) { const txt = await r.text(); writeFileSync(join(RAWDIR, file), JSON.stringify({ fetched: new Date().toISOString(), url, body: JSON.parse(txt) })); return; }
      if (r.status < 500 && r.status !== 429) throw new Error(`HTTP ${r.status}`);
      console.log(`  retry ${url.slice(0, 80)}: HTTP ${r.status}`);
    } catch (e) { if (k === 2 || /HTTP 4/.test(e.message)) { errors.push({ url, error: e.message }); return; } console.log(`  retry ${url.slice(0, 80)}: ${e.message}`); }
    await sleep(3000 * (k + 1));
  }
}
const LINE_URL = 'https://api.tfl.gov.uk/Line/Mode/tube,dlr,elizabeth-line,overground,river-bus,cable-car/Status';
const WX_URL = 'https://api.open-meteo.com/v1/forecast?latitude=51.505&longitude=-0.02&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,precipitation,weather_code&timezone=UTC';
if (!NOFETCH) {
  const live = ['bikes', 'lifts', 'crowding', 'ukpn', 'overflows', 'notams'].filter(s => want.has({ ukpn: 'power_cuts' }[s] || s));
  if (live.length) runTool('fetch-live.mjs', live);
  const river = [want.has('tide') && 'levels', want.has('river_bus') && 'river-bus'].filter(Boolean);
  if (river.length) runTool('fetch-river.mjs', river);
  if (want.has('ais')) runTool('fetch-ais.mjs', ['--listen=0']);
  if (want.has('line_status')) await getOnce(LINE_URL, 'tfl-line-status.json');
  if (want.has('weather')) { if (want.has('line_status')) await sleep(1500); await getOnce(WX_URL, 'open-meteo-current.json'); }
}

// ---------------- 2. the month file and its schema
const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS sources (theme TEXT PRIMARY KEY, register_key TEXT, url TEXT, licence TEXT, attribution TEXT, politeness TEXT, review TEXT) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS runs (run_id INTEGER PRIMARY KEY, started INTEGER, finished INTEGER, tool TEXT, mode TEXT, counts TEXT, errors TEXT, bytes_before INTEGER, bytes_after INTEGER);
CREATE TABLE IF NOT EXISTS places (id TEXT PRIMARY KEY, kind TEXT, name TEXT, lat REAL, lon REAL, zone TEXT) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS bikes (fetch_time INTEGER, id TEXT, bikes INTEGER, e_bikes INTEGER, empty_docks INTEGER, docks INTEGER, unavailable_docks INTEGER, locked INTEGER, PRIMARY KEY (fetch_time, id)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS lifts (fetch_time INTEGER, id TEXT, lifts_out INTEGER, lift_ids TEXT, PRIMARY KEY (fetch_time, id)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS lifts_fetches (fetch_time INTEGER PRIMARY KEY, stations_out INTEGER) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS crowding (fetch_time INTEGER, id TEXT, time INTEGER, pct_baseline REAL, PRIMARY KEY (fetch_time, id)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS power_cuts (fetch_time INTEGER, id TEXT, type TEXT, status_id INTEGER, customers_affected INTEGER, planned_customers INTEGER, created INTEGER, estimated_restoration INTEGER, restored INTEGER, postcode_sectors TEXT, lat REAL, lon REAL, PRIMARY KEY (fetch_time, id)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS power_cut_fetches (fetch_time INTEGER PRIMARY KEY, network_incidents INTEGER, in_zone INTEGER) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS overflows (fetch_time INTEGER, id TEXT, status INTEGER, status_start INTEGER, latest_event_start INTEGER, latest_event_end INTEGER, PRIMARY KEY (fetch_time, id)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS notams (fetch_time INTEGER, id TEXT, kind TEXT, name TEXT, lat REAL, lon REAL, height_agl_ft INTEGER, height_amsl_ft INTEGER, start INTEGER, end_time INTEGER, crane INTEGER, lit INTEGER, area INTEGER, PRIMARY KEY (fetch_time, id)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS ais_positions (mmsi INTEGER, time INTEGER, fetch_time INTEGER, lat REAL, lon REAL, sog_kn REAL, cog REAL, heading INTEGER, nav_status INTEGER, source TEXT, licence_class TEXT, PRIMARY KEY (mmsi, time)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS ais_vessels (mmsi INTEGER PRIMARY KEY, name TEXT, callsign TEXT, imo INTEGER, ship_type INTEGER, ship_type_group TEXT, class TEXT, flag TEXT, length_m REAL, beam_m REAL, first_seen INTEGER, last_seen INTEGER) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS ais_fetches (fetch_time INTEGER PRIMARY KEY, vessels_listed INTEGER, private_counted INTEGER, dropped_licence INTEGER, by_source TEXT) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS tide (station TEXT, time INTEGER, value REAL, PRIMARY KEY (station, time)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS line_status (fetch_time INTEGER, line_id TEXT, severity INTEGER, status TEXT, reason TEXT, PRIMARY KEY (fetch_time, line_id, severity)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS river_bus (fetch_time INTEGER, pier_id TEXT, line_id TEXT, arrivals INTEGER, next_s INTEGER, PRIMARY KEY (fetch_time, pier_id, line_id)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS weather (time INTEGER PRIMARY KEY, fetch_time INTEGER, temp_c REAL, humidity_pct REAL, wind_kmh REAL, gust_kmh REAL, wind_dir INTEGER, cloud_pct INTEGER, precip_mm REAL, weather_code INTEGER) WITHOUT ROWID;
`;
const SRC = {   // theme -> register source key, politeness of the tool that asks
  bikes: ['tfl-live-feeds', 'fetch-live.mjs: GET /BikePoint, one request; one request at a time per host, >= 1.5 s apart, backoff on 429/5xx'],
  lifts: ['tfl-live-feeds', 'fetch-live.mjs: GET /Disruptions/Lifts/v2/, one request (station positions cached)'],
  crowding: ['tfl-live-feeds', 'fetch-live.mjs: one request per station naptan in the zone (65), one at a time, >= 1.5 s apart'],
  power_cuts: ['ukpn-live-faults', 'fetch-live.mjs: one export request of the whole dataset'],
  overflows: ['thames-water-storm-overflows', 'fetch-live.mjs: one ArcGIS query, envelope of the zone'],
  notams: ['nats-pib', 'fetch-live.mjs: one request for the full UK PIB (NATS refreshes it hourly); facts only, no NOTAM text'],
  ais: ['openwaters-ais', 'fetch-ais.mjs --listen=0: two requests (vessels, stations), >= 2 s apart, no stream; small private craft counted only'],
  tide: ['ea-flood-monitoring', 'fetch-river.mjs levels: one request per gauge (16), one at a time, >= 1 s apart; the last 48 h each time, stored once per reading'],
  line_status: ['tfl-live-feeds', 'cache-londat.mjs: one request, GET /Line/Mode/.../Status'],
  river_bus: ['tfl-live-feeds', 'fetch-river.mjs river-bus: a few TfL requests, one at a time, >= 1 s apart'],
  weather: ['open-meteo', 'cache-londat.mjs: one request to the forecast API (current conditions); API free for non-commercial use'],
};
const REG = JSON.parse(readFileSync(join(CW, 'data-register.json'), 'utf8')).sources;

// the snapshots: [theme, fetched (epoch s), meta, items]
const snaps = {};
const snap = (theme, rel) => { const d = readJ(rel); if (!d) { errors.push({ theme, error: `no snapshot ${rel}` }); return null; } return d; };
if (want.has('bikes')) snaps.bikes = snap('bikes', 'feeds/live/bikes.json');
if (want.has('lifts')) snaps.lifts = snap('lifts', 'feeds/live/lifts.json');
if (want.has('crowding')) snaps.crowding = snap('crowding', 'feeds/live/crowding.json');
if (want.has('power_cuts')) snaps.power_cuts = snap('power_cuts', 'feeds/live/ukpn.json');
if (want.has('overflows')) snaps.overflows = snap('overflows', 'feeds/live/overflows.json');
if (want.has('notams')) snaps.notams = snap('notams', 'feeds/live/notams.json');
if (want.has('ais')) snaps.ais = snap('ais', 'feeds/river/ais.json');
if (want.has('tide')) snaps.tide = snap('tide', 'feeds/river/levels.json');
if (want.has('river_bus')) snaps.river_bus = snap('river_bus', 'feeds/river/river-bus.json');
const rawSnap = (theme, file) => { const f = join(RAWDIR, file); if (!existsSync(f)) { errors.push({ theme, error: `no raw file data/raw/cache/${file}` }); return null; } const d = JSON.parse(readFileSync(f, 'utf8')); return { meta: { fetched: d.fetched, url: d.url }, body: d.body }; };
if (want.has('line_status')) snaps.line_status = rawSnap('line_status', 'tfl-line-status.json');
if (want.has('weather')) snaps.weather = rawSnap('weather', 'open-meteo-current.json');

// the month of the newest snapshot (in --no-fetch the snapshots may be days old: they go into their own month)
const times = Object.values(snaps).filter(Boolean).map(s => ep(s.meta.fetched)).filter(Boolean);
const RUN_T = times.length ? Math.max(...times) : Math.round(STARTED / 1000);
const MONTH = iso(RUN_T).slice(0, 7);
// run files: cache/runs/live-2026-10-05T1606Z.json.gz = {format: 1, run_time, statements: [[sql, rows], ...]}
const runFiles = m => readdirSync(RUNS).filter(d => d.startsWith(m + '-')).sort().flatMap(d => readdirSync(join(RUNS, d)).filter(n => /^live-.*\.json\.gz$/.test(n)).sort().map(n => `${d}/${n}`));
const replay = (d, f) => { const r = JSON.parse(gunzipSync(readFileSync(join(RUNS, f)))); for (const [sql, rows] of r.statements) { const st = d.prepare(sql); for (const row of rows) st.run(...row); } };
const openDb = file => { if (existsSync(file)) rmSync(file); const d = new DatabaseSync(file); d.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA page_size=4096;' + SCHEMA); return d; };
// close every earlier month that still has run files: one SQLite per month, VACUUMed, then its run files removed
const months = [...new Set(readdirSync(RUNS).map(n => (n.match(/^(\d{4}-\d{2})-\d{2}$/) || [])[1]).filter(Boolean))].sort();
for (const m of months.filter(m => m < MONTH)) {
  if (DRY) continue;
  const f = join(OUT, `live-${m}.sqlite`), files = runFiles(m), d = openDb(f + '.tmp');
  d.exec('BEGIN'); for (const r of files) replay(d, r); d.exec('COMMIT'); d.exec('PRAGMA journal_mode=DELETE; VACUUM'); d.close();
  rmSync(f, { force: true }); writeFileSync(f, readFileSync(f + '.tmp')); rmSync(f + '.tmp');
  for (const d of readdirSync(RUNS).filter(d => d.startsWith(m + '-'))) rmSync(join(RUNS, d), { recursive: true });
  console.log(`closed ${m}: ${files.length} run files -> live-${m}.sqlite (${statSync(f).size} bytes)`);
}
const WORK = join(RAWDIR, `work-${MONTH}.sqlite`), db = openDb(DRY ? ':memory:' : WORK);
db.exec('BEGIN'); const nReplayed = runFiles(MONTH).length; for (const r of runFiles(MONTH)) replay(db, r); db.exec('COMMIT');
const bytesBefore = DRY ? 0 : statSync(WORK).size;
const REC = new Map();   // sql -> the rows this run changed
const rec = (sql, row) => { if (!REC.has(sql)) REC.set(sql, []); REC.get(sql).push(row); };
const put = (sql, rows) => { const st = db.prepare(sql); let n = 0; for (const r of rows) { const c = Number(st.run(...r).changes); if (c) rec(sql, r); n += c; } return n; };
const upsert = sql => { const st = db.prepare(sql); return { run: (...r) => { const c = Number(st.run(...r).changes); if (c) rec(sql, r); return c; } }; };
const counts = {};
db.exec('BEGIN');
const metaRows = [
  ['schema', '1'], ['month', MONTH], ['about', 'History of live state in the Canary Wharf / Docklands zone, appended by magpie/cwplans/tools/cache-londat.mjs in https://github.com/danbri/glitchcan-minigam. Times are Unix seconds (UTC). Skill: magpie/cwplans/skills/cwplans-londat-cache/SKILL.md'],
  ['licence', 'No blanket licence: each table keeps the licence of its source (table sources). AIS rows from AISHub and aisstream.io are accepted for scoping only (owner, 2026-10-04) and marked review.'],
  ['zone', 'model box WGS84 -0.095, 51.474 to 0.015, 51.522; east margin 0.015, 51.495 to 0.085, 51.522; Lea strip -0.025, 51.522 to 0.01, 51.528 (river and AIS)']];
const sourceRows = THEMES.map(t => { const [k, pol] = SRC[t], s = REG[k] || {}, m = snaps[t]?.meta || {};
  return [t, k, m.url || s.url || null, m.licence || s.licence || null, m.attribution || s.attribution || null, pol, t === 'ais' ? 'AISHub and aisstream.io events: accepted for scoping only (owner, 2026-10-04); review before scaling or commercial use. Small private craft are counted, never listed.' : (s.review || null)]; });
const place = upsert('INSERT INTO places VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, name=excluded.name, lat=excluded.lat, lon=excluded.lon, zone=excluded.zone' + (nReplayed ? ' WHERE (kind, name, lat, lon, zone) IS NOT (excluded.kind, excluded.name, excluded.lat, excluded.lon, excluded.zone)' : ''));   // the first run of a month records every place, so each month stands alone
const placeOf = (i, kind) => place.run(i.id, kind || i.kind, i.name || i.values?.name || null, r5(i.position?.lat), r5(i.position?.lon), i.zone || i.position?.zone || null);

let s;
if ((s = snaps.bikes)) { const t = ep(s.meta.fetched); s.items.forEach(i => placeOf(i));
  counts.bikes = put('INSERT OR IGNORE INTO bikes VALUES (?, ?, ?, ?, ?, ?, ?, ?)', s.items.map(i => [t, i.id, i.values.bikes, i.values.e_bikes, i.values.empty_docks, i.values.docks, i.values.unavailable_docks, i.values.locked ? 1 : 0])); }
if ((s = snaps.lifts)) { const t = ep(s.meta.fetched); s.items.forEach(i => placeOf(i, 'station'));
  counts.lifts = put('INSERT OR IGNORE INTO lifts VALUES (?, ?, ?, ?)', s.items.map(i => [t, i.id, i.values.lifts_out.length, i.values.lifts_out.join(' ')]));
  put('INSERT OR IGNORE INTO lifts_fetches VALUES (?, ?)', [[t, s.items.length]]); }
if ((s = snaps.crowding)) { const t = ep(s.meta.fetched); s.items.forEach(i => placeOf(i, 'station'));
  counts.crowding = put('INSERT OR IGNORE INTO crowding VALUES (?, ?, ?, ?)', s.items.map(i => [t, i.id, ep(i.time), i.values.percentage_of_baseline])); }
if ((s = snaps.power_cuts)) { const t = ep(s.meta.fetched), v = i => i.values;
  counts.power_cuts = put('INSERT OR IGNORE INTO power_cuts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', s.items.map(i => [t, i.id, v(i).type, v(i).status_id, v(i).customers_affected, v(i).planned_customers, ep(i.time), ep(v(i).estimated_restoration), ep(v(i).restored), v(i).postcode_sectors, r5(i.position.lat), r5(i.position.lon)]));
  put('INSERT OR IGNORE INTO power_cut_fetches VALUES (?, ?, ?)', [[t, s.meta.counts?.network_incidents ?? null, s.items.length]]); }
if ((s = snaps.overflows)) { const t = ep(s.meta.fetched); s.items.forEach(i => placeOf(i));
  counts.overflows = put('INSERT OR IGNORE INTO overflows VALUES (?, ?, ?, ?, ?, ?)', s.items.map(i => [t, i.id, i.values.status, ep(i.values.status_start), ep(i.values.latest_event_start), ep(i.values.latest_event_end)])); }
if ((s = snaps.notams)) { const t = ep(s.meta.fetched), v = i => i.values;
  counts.notams = put('INSERT OR IGNORE INTO notams VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', s.items.map(i => [t, i.id, i.kind, i.name, r5(i.position.lat), r5(i.position.lon), v(i).height_agl_ft, v(i).height_amsl_ft, ep(v(i).start), ep(v(i).end), v(i).crane ? 1 : 0, v(i).lit ? 1 : 0, v(i).area_vertices ? 1 : 0])); }
if ((s = snaps.ais)) { const t = ep(s.meta.fetched);
  // fetch-ais.mjs never lists small private craft; this filter repeats its type rule so that a change there cannot leak them here
  const listed = s.items.filter(i => i.mmsi && ![36, 37].includes(i.ship_type) && !(i.class === 'B' && !i.ship_type));
  const vs = upsert(`INSERT INTO ais_vessels VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(mmsi) DO UPDATE SET name=coalesce(excluded.name, name), callsign=coalesce(excluded.callsign, callsign), imo=coalesce(excluded.imo, imo),
    ship_type=coalesce(excluded.ship_type, ship_type), ship_type_group=coalesce(excluded.ship_type_group, ship_type_group), class=coalesce(excluded.class, class), flag=coalesce(excluded.flag, flag),
    length_m=coalesce(excluded.length_m, length_m), beam_m=coalesce(excluded.beam_m, beam_m), first_seen=min(first_seen, excluded.first_seen), last_seen=max(last_seen, excluded.last_seen)`);
  for (const i of listed) vs.run(i.mmsi, i.name || null, i.callsign || null, i.imo || null, i.ship_type ?? null, i.ship_type_group || null, i.class || null, i.flag || null, i.length_m ?? null, i.beam_m ?? null, ep(i.time) || t, ep(i.time) || t);
  counts.ais = put('INSERT OR IGNORE INTO ais_positions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', listed.filter(i => i.position && ep(i.time)).map(i => [i.mmsi, ep(i.time), t, r5(i.position.lat), r5(i.position.lon), i.values?.sog_kn ?? null, i.values?.cog ?? null, i.values?.heading ?? null, i.values?.nav_status ?? null, i.source || null, i.licence_class || null]));
  const c = s.meta.counts || {}, priv = Object.values(c.private_not_listed || {}).reduce((a, b) => a + b, 0);
  put('INSERT OR IGNORE INTO ais_fetches VALUES (?, ?, ?, ?, ?)', [[t, listed.length, priv, c.snapshot?.dropped_licence ?? null, JSON.stringify(c.snapshot?.by_source || {})]]); }
if ((s = snaps.tide)) { for (const i of s.items) placeOf({ ...i, name: i.values.label || i.values.station }, i.kind);
  counts.tide = put('INSERT OR IGNORE INTO tide VALUES (?, ?, ?)', s.items.flatMap(i => (i.values.readings || []).map(([tm, v]) => [i.id, ep(tm), v]))); }
if ((s = snaps.river_bus)) { const t = ep(s.meta.fetched), by = new Map();
  s.items.filter(i => i.kind === 'pier').forEach(i => placeOf({ ...i, name: i.values?.name || i.name }, 'pier'));
  for (const i of s.items.filter(i => i.kind === 'predicted-arrival')) { const k = `${i.values.pier}|${i.values.line}`, o = by.get(k) || { n: 0, next: null }; o.n++; o.next = o.next == null ? i.values.seconds_to_pier : Math.min(o.next, i.values.seconds_to_pier); by.set(k, o); }
  counts.river_bus = put('INSERT OR IGNORE INTO river_bus VALUES (?, ?, ?, ?, ?)', [...by].map(([k, o]) => [t, ...k.split('|'), o.n, o.next])); }
if ((s = snaps.line_status)) { const t = ep(s.meta.fetched);
  counts.line_status = put('INSERT OR IGNORE INTO line_status VALUES (?, ?, ?, ?, ?)', s.body.flatMap(l => (l.lineStatuses || []).map(st => [t, l.id, st.statusSeverity, st.statusSeverityDescription, st.reason ? st.reason.replace(/\s+/g, ' ').slice(0, 300) : null]))); }
if ((s = snaps.weather)) { const c = s.body.current || {};
  counts.weather = put('INSERT OR IGNORE INTO weather VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [[ep(c.time + 'Z'), ep(s.meta.fetched), c.temperature_2m, c.relative_humidity_2m, c.wind_speed_10m, c.wind_gusts_10m, c.wind_direction_10m, c.cloud_cover, c.precipitation, c.weather_code]]); }
const rowsTotal = Object.values(counts).reduce((a, b) => a + b, 0);
let runFile = null;
if (rowsTotal) {   // meta, sources and the run's own row go into the run file only when the run added data
  put('INSERT OR REPLACE INTO meta VALUES (?, ?)', metaRows);
  put('INSERT OR REPLACE INTO sources VALUES (?, ?, ?, ?, ?, ?, ?)', sourceRows);
  put('INSERT INTO runs (started, finished, tool, mode, counts, errors, bytes_before, bytes_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [[Math.round(STARTED / 1000), Math.round(Date.now() / 1000), 'cache-londat.mjs', NOFETCH ? 'no-fetch' : 'fetch', JSON.stringify(counts), JSON.stringify(errors), nReplayed, null]]);
}
db.exec('COMMIT');
if (rowsTotal && !DRY) {
  runFile = `${iso(RUN_T).slice(0, 10)}/live-${iso(RUN_T).slice(0, 16).replace(':', '')}Z.json.gz`; mkdirSync(join(RUNS, iso(RUN_T).slice(0, 10)), { recursive: true });
  const gz = gzipSync(JSON.stringify({ format: 1, run_time: iso(RUN_T), tool: 'magpie/cwplans/tools/cache-londat.mjs', statements: [...REC] }), { level: 9 });
  writeFileSync(join(RUNS, runFile), gz);
}
console.log(`${DRY ? '(dry) ' : ''}${MONTH}: ${nReplayed} run files replayed; +${rowsTotal} rows ${JSON.stringify(counts)}; ${runFile ? `cache/runs/${runFile} ${statSync(join(RUNS, runFile)).size} bytes` : 'no run file (nothing new)'}`);
if (errors.length) console.error('errors: ' + JSON.stringify(errors));

// ---------------- 3. latest.json: per theme the newest fetch (compact) and a 24 h series, from this month's file and the one before
if (!DRY) writeLatest(); db.close(); if (!DRY) rmSync(WORK, { force: true });
function writeLatest() {
  const prev = join(OUT, `live-${iso(ep(MONTH + '-01T00:00:00Z') - 86400).slice(0, 7)}.sqlite`);
  if (existsSync(prev)) db.exec(`ATTACH '${prev.replace(/'/g, "''")}' AS p`);
  const both = tbl => existsSync(prev) ? `(SELECT * FROM main.${tbl} UNION SELECT * FROM p.${tbl})` : `main.${tbl}`;
  const all = (sql, ...a) => db.prepare(sql).all(...a), one = (sql, ...a) => db.prepare(sql).get(...a);
  const last = tbl => one(`SELECT max(fetch_time) t FROM ${both(tbl)}`).t;
  const P = new Map(all(`SELECT * FROM ${both('places')}`).map(p => [p.id, p]));   // this month's rows come last and win
  const src = Object.fromEntries(all('SELECT * FROM sources').map(r => [r.theme, { licence: r.licence, attribution: r.attribution, url: r.url, ...(r.review ? { review: r.review } : {}) }]));
  const out = { about: 'Latest live state of the Canary Wharf / Docklands zone and the last 24 hours, written by magpie/cwplans/tools/cache-londat.mjs (danbri/glitchcan-minigam) from the history in this folder. Times: ISO UTC. Each theme keeps the licence of its source (sources).',
    written: iso(Math.round(Date.now() / 1000)), history: `cache/runs/${MONTH}-DD/live-*.json.gz (this month, one file per run); cache/live-YYYY-MM.sqlite (closed months)`, sources: src, themes: {} };
  const T = out.themes, nm = id => P.get(id)?.name ?? null, pos = id => P.get(id) ? [P.get(id).lat, P.get(id).lon] : [null, null];
  let t;
  if ((t = last('bikes'))) T.bikes = { fetched: iso(t), cols: ['id', 'name', 'lat', 'lon', 'bikes', 'e_bikes', 'empty_docks', 'docks'], rows: all(`SELECT * FROM ${both('bikes')} WHERE fetch_time = ?`, t).map(r => [r.id, nm(r.id), ...pos(r.id), r.bikes, r.e_bikes, r.empty_docks, r.docks]),
    series: { cols: ['time', 'bikes', 'e_bikes', 'empty_docks', 'empty_stations'], rows: all(`SELECT fetch_time, sum(bikes) b, sum(e_bikes) e, sum(empty_docks) d, sum(bikes = 0) z FROM ${both('bikes')} WHERE fetch_time >= ? GROUP BY fetch_time ORDER BY fetch_time`, t - 86400).map(r => [iso(r.fetch_time), r.b, r.e, r.d, r.z]) } };
  if ((t = last('lifts_fetches'))) T.lifts = { fetched: iso(t), cols: ['id', 'name', 'lat', 'lon', 'lifts_out'], rows: all(`SELECT * FROM ${both('lifts')} WHERE fetch_time = ?`, t).map(r => [r.id, nm(r.id), ...pos(r.id), r.lifts_out]),
    series: { cols: ['time', 'stations_out'], rows: all(`SELECT fetch_time, stations_out FROM ${both('lifts_fetches')} WHERE fetch_time >= ? ORDER BY fetch_time`, t - 86400).map(r => [iso(r.fetch_time), r.stations_out]) } };
  if ((t = last('crowding'))) T.crowding = { fetched: iso(t), cols: ['id', 'name', 'pct_baseline'], rows: all(`SELECT * FROM ${both('crowding')} WHERE fetch_time = ?`, t).map(r => [r.id, nm(r.id), r.pct_baseline]),
    series: { cols: ['time', 'mean_pct_baseline', 'stations'], rows: all(`SELECT fetch_time, avg(pct_baseline) m, count(*) n FROM ${both('crowding')} WHERE fetch_time >= ? GROUP BY fetch_time ORDER BY fetch_time`, t - 86400).map(r => [iso(r.fetch_time), Math.round(r.m * 1000) / 1000, r.n]) } };
  if ((t = last('power_cut_fetches'))) T.power_cuts = { fetched: iso(t), cols: ['id', 'type', 'customers_affected', 'created', 'estimated_restoration', 'lat', 'lon'], rows: all(`SELECT * FROM ${both('power_cuts')} WHERE fetch_time = ?`, t).map(r => [r.id, r.type, r.customers_affected, iso(r.created), iso(r.estimated_restoration), r.lat, r.lon]) };
  if ((t = last('overflows'))) { const rows = all(`SELECT * FROM ${both('overflows')} WHERE fetch_time = ?`, t);
    T.overflows = { fetched: iso(t), cols: ['id', 'receiving_water', 'lat', 'lon', 'status', 'latest_event_start', 'latest_event_end'], rows: rows.map(r => [r.id, nm(r.id), ...pos(r.id), r.status, iso(r.latest_event_start), iso(r.latest_event_end)]),
      counts: { monitored: rows.length, discharging: rows.filter(r => r.status === 1).length, not_discharging: rows.filter(r => r.status === 0).length, offline: rows.filter(r => r.status === -1).length },
      series: { cols: ['time', 'discharging', 'offline'], rows: all(`SELECT fetch_time, sum(status = 1) d, sum(status = -1) o FROM ${both('overflows')} WHERE fetch_time >= ? GROUP BY fetch_time ORDER BY fetch_time`, t - 86400).map(r => [iso(r.fetch_time), r.d, r.o]) } }; }
  if ((t = last('notams'))) T.notams = { fetched: iso(t), cols: ['id', 'kind', 'name', 'lat', 'lon', 'height_amsl_ft', 'start', 'end', 'crane', 'lit'], rows: all(`SELECT * FROM ${both('notams')} WHERE fetch_time = ?`, t).map(r => [r.id, r.kind, r.name, r.lat, r.lon, r.height_amsl_ft, iso(r.start), iso(r.end_time), r.crane, r.lit]) };
  if ((t = last('ais_fetches'))) { const f = one(`SELECT * FROM ${both('ais_fetches')} WHERE fetch_time = ?`, t);
    T.ais = { fetched: iso(t), counts: { listed: f.vessels_listed, private_counted: f.private_counted }, cols: ['mmsi', 'name', 'ship_type_group', 'time', 'lat', 'lon', 'sog_kn', 'cog', 'heading', 'source'],
      rows: all(`SELECT v.mmsi, v.name, v.ship_type_group, a.time, a.lat, a.lon, a.sog_kn, a.cog, a.heading, a.source FROM ${both('ais_positions')} a JOIN ${both('ais_vessels')} v USING (mmsi) WHERE a.fetch_time = ? AND a.time = (SELECT max(time) FROM ${both('ais_positions')} b WHERE b.mmsi = a.mmsi) GROUP BY a.mmsi`, t).map(r => [r.mmsi, r.name, r.ship_type_group, iso(r.time), r.lat, r.lon, r.sog_kn, r.cog, r.heading, r.source]),
      series: { cols: ['time', 'listed', 'private_counted'], rows: all(`SELECT * FROM ${both('ais_fetches')} WHERE fetch_time >= ? ORDER BY fetch_time`, t - 86400).map(r => [iso(r.fetch_time), r.vessels_listed, r.private_counted]) } }; }
  const tideNewest = one(`SELECT max(time) t FROM ${both('tide')}`).t, since = (tideNewest || 0) - 86400;
  const tideIds = all(`SELECT DISTINCT station FROM ${both('tide')} WHERE time >= ?`, since).map(r => r.station);
  if (tideIds.length) T.tide = { fetched: iso(Math.max(...tideIds.map(id => one(`SELECT max(time) t FROM ${both('tide')} WHERE station = ?`, id).t))), unit: 'see station id (mAOD, mASD, m difference, m3/s)',
    stations: Object.fromEntries(tideIds.map(id => [id, { name: nm(id), pos: pos(id), latest: (r => r && [iso(r.time), r.value])(one(`SELECT time, value FROM ${both('tide')} WHERE station = ? ORDER BY time DESC LIMIT 1`, id)),
      series: /^ea-level:000[1367]-/.test(id) ? all(`SELECT time, value FROM ${both('tide')} WHERE station = ? AND time >= ? ORDER BY time`, id, since).map(r => [iso(r.time), r.value]) : undefined }])) };
  if ((t = last('line_status'))) T.line_status = { fetched: iso(t), cols: ['line', 'severity', 'status', 'reason'], rows: all(`SELECT * FROM ${both('line_status')} WHERE fetch_time = ? ORDER BY line_id`, t).map(r => [r.line_id, r.severity, r.status, r.reason]) };
  if ((t = last('river_bus'))) T.river_bus = { fetched: iso(t), cols: ['pier', 'name', 'line', 'arrivals', 'next_s'], rows: all(`SELECT * FROM ${both('river_bus')} WHERE fetch_time = ?`, t).map(r => [r.pier_id, nm('tfl-pier:' + r.pier_id) ?? nm(r.pier_id), r.line_id, r.arrivals, r.next_s]) };
  if ((t = last('weather'))) { const w = one(`SELECT * FROM ${both('weather')} ORDER BY time DESC LIMIT 1`);
    T.weather = { fetched: iso(w.fetch_time), time: iso(w.time), current: { temp_c: w.temp_c, humidity_pct: w.humidity_pct, wind_kmh: w.wind_kmh, gust_kmh: w.gust_kmh, wind_dir: w.wind_dir, cloud_pct: w.cloud_pct, precip_mm: w.precip_mm, weather_code: w.weather_code },
      series: { cols: ['time', 'temp_c', 'wind_kmh', 'cloud_pct', 'precip_mm'], rows: all(`SELECT * FROM ${both('weather')} WHERE time >= ? ORDER BY time`, w.time - 86400).map(r => [iso(r.time), r.temp_c, r.wind_kmh, r.cloud_pct, r.precip_mm]) } }; }
  const txt = JSON.stringify(out);
  writeFileSync(join(OUT, 'latest.json'), txt + '\n');
  console.log(`latest.json: ${txt.length} bytes, themes ${Object.keys(T).join(' ')}`);
}
