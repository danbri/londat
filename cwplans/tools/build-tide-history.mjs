// Build cwplans/docklands/data/sky/tide-history.json: the measured 15-minute Thames levels (m AOD, stored as integer cm) at
// Tower Pier (0007), Charlton (0003) and Silvertown (0001) for every day of the last year, from the Environment Agency
// daily archive files (OGL v3.0), so that the Three.js port shows MEASURED tide levels for clock times older than the
// flood-monitoring API keeps (about 4 weeks). Method: pipeline.json activity "build-tide-history"; the reasons and the
// faults: skill docklands-sky, "Tide history".
//
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/build-tide-history.mjs [--days 371] [--end YYYY-MM-DD] [--no-fetch]
//
// Two stages. 1, fetch (network, one request at a time, the repository's User-Agent, retries): for each day from --end
// (default yesterday, UTC) back --days days, the archive file readings-YYYY-MM-DD.csv (all stations, about 60 MB) is
// streamed and filtered to the three measures by ea-tide-archive.mjs; the kept lines are cached in data/raw/river/tide/
// (gitignored; fit-tide-harmonics.mjs uses the same cache) and not fetched again. 2, build (no network, a function of the
// cached files, whose SHA-256 is written into the output): one array per gauge on a 15-minute grid from the first day's
// 00:00Z, integer centimetres, null where the archive has no reading. No cleaning here: the page drops a reading more
// than 1.5 m from the prediction (docklands/tide.js mergeReadings), as for every other source.
import { writeFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { TOOLS } from './lib.mjs';
import { STATIONS, ARCHIVE_URL, fetchArchive, readArchive } from './ea-tide-archive.mjs';

const OUT = join(TOOLS, '..', 'docklands', 'data', 'sky', 'tide-history.json');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = +arg('--days', 371), FETCH = !process.argv.includes('--no-fetch');
const day = t => new Date(t).toISOString().slice(0, 10);
const END = Date.parse((arg('--end', day(Date.now() - 864e5))) + 'T00:00Z');
const list = []; for (let k = DAYS - 1; k >= 0; k--) list.push(day(END - k * 864e5));   // oldest first

// ---------- 1. fetch
if (FETCH) {
  let n = 0; const t0 = Date.now();
  for (const d of list.slice().reverse()) {   // newest first: the most useful days are cached first
    let r; try { r = await fetchArchive(d); } catch (e) { console.log(`archive ${d}: FAILED ${e.message}`); continue; }
    if (r !== 'cached') { n++; console.log(`archive ${d}: ${r === 'none' ? 'none (HTTP 404)' : r + ' lines'}  [${n} fetched, ${((Date.now() - t0) / 60e3).toFixed(1)} min]`); }
  }
}

// ---------- 2. build (from the cached files only)
const STEP = 9e5, T0 = Date.parse(list[0] + 'T00:00Z'), N = DAYS * 96;
const hash = createHash('sha256'), V = {}, cover = {}, missing = [], uncached = [];
for (const id of Object.keys(STATIONS)) { V[id] = new Array(N).fill(null); cover[id] = 0; }
let offGrid = 0;
for (const d of list) {
  const A = readArchive(d); if (!A) { uncached.push(d); continue; }
  hash.update(d + '\n'); hash.update(A.text); if (!A.text.trim()) { missing.push(d); continue; }
  for (const [id, R] of Object.entries(A.readings)) for (const [t, v] of R) {
    const i = (t - T0) / STEP; if (!Number.isInteger(i)) { offGrid++; continue; } if (i < 0 || i >= N) continue;
    if (V[id][i] == null) cover[id]++; V[id][i] = Math.round(v * 100);
  }
}
const rawSha = hash.digest('hex');
// the longest run of nulls per gauge, and the days with no reading at a gauge
const gaps = {};
for (const id of Object.keys(STATIONS)) {
  let run = 0, best = 0, bestAt = 0; const noDay = [];
  for (let i = 0; i < N; i++) { if (V[id][i] == null) { run++; if (run > best) { best = run; bestAt = i - run + 1; } } else run = 0; }
  for (let k = 0; k < DAYS; k++) if (V[id].slice(k * 96, k * 96 + 96).every(x => x == null)) noDay.push(list[k]);
  gaps[id] = { readings: cover[id], share: +(cover[id] / N).toFixed(4), longest_gap_h: best / 4, longest_gap_from: best ? new Date(T0 + bestAt * STEP).toISOString().slice(0, 16) + 'Z' : null, days_without_readings: noDay };
}
const out = {
  source: 'Environment Agency real-time flood-monitoring API, daily archive files of readings (15-minute instantaneous tidal level, m AOD)',
  url_pattern: ARCHIVE_URL('YYYY-MM-DD'), measures: Object.fromEntries(Object.keys(STATIONS).map(id => [id, `${id}-level-tidal_level-i-15_min-mAOD`])),
  licence: 'OGL v3.0', licence_url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  attribution: 'Contains Environment Agency data licensed under the Open Government Licence v3.0. This uses Environment Agency flood and river level data from the real-time data API (Beta)',
  produced_by: 'cwplans/tools/build-tide-history.mjs', made: new Date().toISOString(), raw_sha256: rawSha,
  raw_sha256_note: 'SHA-256 over, for each day oldest first, "YYYY-MM-DD\\n" and the cached filtered lines of that day (data/raw/river/tide/archive-YYYY-MM-DD.csv)',
  note: 'Readings as published, not cleaned (the page drops a reading more than 1.5 m from its prediction). Not a tide table and not for navigation.',
  days: { from: list[0], to: list[list.length - 1], count: DAYS, archive_missing: missing, not_fetched: uncached },
  start: new Date(T0).toISOString(), step_min: 15, unit: 'cm (m AOD x 100, rounded)', off_grid_readings_dropped: offGrid,
  stations: Object.fromEntries(Object.keys(STATIONS).map(id => [id, { name: STATIONS[id], ...gaps[id], v: V[id] }])),
};
const txt = JSON.stringify(out) + '\n'; writeFileSync(OUT, txt);
console.log(`wrote docklands/data/sky/tide-history.json (${(txt.length / 1024).toFixed(0)} KB): ${list[0]} to ${list[list.length - 1]}, ${DAYS} days; archive missing ${missing.length}, not fetched ${uncached.length}; raw sha256 ${rawSha.slice(0, 16)}`);
for (const id of Object.keys(STATIONS)) console.log(`  ${id} ${STATIONS[id]}: ${gaps[id].readings} readings (${(gaps[id].share * 100).toFixed(1)} %), longest gap ${gaps[id].longest_gap_h} h from ${gaps[id].longest_gap_from}, ${gaps[id].days_without_readings.length} days without readings`);
