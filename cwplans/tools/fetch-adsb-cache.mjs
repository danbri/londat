// Rolling 7-day cache of recorded aircraft tracks for the Docklands area, from the adsb.lol daily history (ODbL 1.0).
// Source: the GitHub releases of adsblol/globe_history_<year>, tag v<YYYY.MM.DD>-planes-readsb-prod-0: a tar split into
// 2 GB parts (.tar.aa, .tar.ab, ...; about 4.2 GB a day) with one gzipped readsb trace_full_<hex>.json per aircraft.
// The tool streams the parts (nothing is kept on disk), keeps the trace points within 25 nm of 51.505 N 0.02 W, splits
// them into legs, applies the privacy rule of docklands/planes-live.js (identified()), thins points above 15,000 ft to
// one a minute, and writes one gzipped JSON file per UTC hour:
//   <out>/adsb/<YYYY-MM-DD>/<HH>.json.gz, <out>/index.json (the days held), <out>/README.md (source, licence, format)
// Days older than 7 are removed. --push commits <out> as the only commit of the orphan branch adsb-cache (a temporary
// index, GIT_INDEX_FILE: the main working tree and index are not touched) and force-pushes it.
//
//   node cwplans/tools/fetch-adsb-cache.mjs [--out DIR] [--days 7] [--date YYYY-MM-DD ...] [--restore] [--push]
//     --restore  first copy the files of origin/adsb-cache into DIR (days already held are not fetched again)
//     NODE_USE_ENV_PROXY=1 behind a proxy. Workflow: .github/workflows/adsb-cache.yml (daily).
// Skill: docklands-sky, "Live aircraft in the Three.js port" (format, sizes, the privacy rule, what failed).
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const A = process.argv.slice(2), opt = k => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const OUT = resolve(opt('--out') || join(tmpdir(), 'londat-adsb-cache'));
const DAYS = +(opt('--days') || 7);
const ONLY = A.flatMap((a, i) => a === '--date' ? [A[i + 1]] : []);
const UA = 'londat-adsb-cache/1 (https://github.com/danbri/londat; danbri/londat cwplans)';

// the area: 25 nm round the 3D page's centre (the London City approaches are inside it)
const C = { lat: 51.505, lon: -0.02, r: 25 * 1852 };
const BOX = { lat0: 51.08, lat1: 51.93, lon0: -0.70, lon1: 0.66 };
const HIGH_FT = 15000, HIGH_EVERY = 60;   // above 15,000 ft one point a minute
const GAP = 600;                         // s: a gap this long inside the area starts a new leg
const distM = (lat, lon) => { const k = Math.PI / 180, x = (lon - C.lon) * Math.cos((lat + C.lat) / 2 * k) * 6371000 * k, y = (lat - C.lat) * 6371000 * k; return Math.hypot(x, y); };
// privacy rule, as identified() in docklands/planes-live.js: operator ICAO callsign, not LADD/PIA, ICAO address
const identified = (flight, dbFlags, hex) => /^[A-Z]{3}[0-9][0-9A-Z]{0,4}$/.test(flight || '') && !((dbFlags | 0) & 12) && !/^~/.test(hex || '');

const iso = d => d.toISOString().slice(0, 10);
const relUrl = day => { const [y, m, d] = day.split('-'), tag = `v${y}.${m}.${d}-planes-readsb-prod-0`; return { tag, base: `https://github.com/adsblol/globe_history_${y}/releases/download/${tag}/${tag}.tar`, page: `https://github.com/adsblol/globe_history_${y}/releases/tag/${tag}` }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function partExists(url) {
  const r = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'user-agent': UA } });
  return r.ok ? +(r.headers.get('content-length') || 0) : 0;
}

// ---------- the parts .aa, .ab, ... as one byte stream. The parse is slower than the download, so a connection can sit
// throttled for minutes and be cut ("terminated"): the part is then asked again from the byte it reached (Range).
async function* parts(base) {
  for (let i = 0; i < 26 * 26; i++) {
    const sfx = String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + i % 26), url = `${base}.${sfx}`;
    let got = 0, total = null, tries = 0;
    while (total == null || got < total) {
      let r;
      try {
        r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA, ...(got ? { range: `bytes=${got}-` } : {}) } });
        if (r.status === 404) { if (i === 0) throw new Error(`no release part ${url}`); return; }
        if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
        if (got && r.status !== 206) throw new Error(`no range support (HTTP ${r.status})`);
        if (total == null) { total = +(r.headers.get('content-length') || 0); console.log(`  part .${sfx}: ${(total / 1e9).toFixed(2)} GB`); }
        for await (const c of r.body) { got += c.byteLength; yield Buffer.from(c.buffer, c.byteOffset, c.byteLength); }
        if (!total) return;
      } catch (e) {
        if (/no release part|no range support/.test(e.message) || ++tries > 8) throw e;
        console.log(`  part .${sfx}: ${e.message} at ${(got / 1e9).toFixed(2)} GB; asking again from there`); await sleep(3000 * tries);
      }
    }
  }
}

// ---------- a minimal streaming tar reader (ustar, GNU long names, pax headers skipped): calls onFile(name, buf) for the
// entries that want(name) accepts; the others are skipped without copying
async function readTar(chunks, want, onFile) {
  const q = []; let qlen = 0, off = 0; const it = chunks[Symbol.asyncIterator]();
  async function fill(n) { while (qlen - off < n) { const { value, done } = await it.next(); if (done) return false; q.push(value); qlen += value.length; } return true; }
  function take(n, keep) {
    let out = keep ? Buffer.allocUnsafe(n) : null, w = 0;
    while (w < n) { const b = q[0], avail = b.length - off, k = Math.min(avail, n - w); if (keep) b.copy(out, w, off, off + k); w += k; off += k; if (off === b.length) { q.shift(); qlen -= b.length; off = 0; } }
    return out;
  }
  async function skip(n) { while (n > 0) { if (!(await fill(1))) return; const k = Math.min(n, qlen - off); take(k, false); n -= k; } }
  let longName = null;
  for (;;) {
    if (!(await fill(512))) return;
    const h = take(512, true); if (h.every(b => b === 0)) continue;
    const str = (a, b) => h.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    let name = str(0, 100); const prefix = str(345, 500); if (prefix) name = prefix + '/' + name;
    const size = parseInt(str(124, 136).trim() || '0', 8), type = String.fromCharCode(h[156] || 48), padded = Math.ceil(size / 512) * 512;
    if (type === 'L') { await fill(padded); longName = take(padded, true).subarray(0, size).toString('utf8').replace(/\0.*$/s, ''); continue; }
    if (longName) { name = longName; longName = null; }
    if ((type === '0' || type === '\0') && want(name)) { if (!(await fill(padded))) return; const buf = take(padded, true).subarray(0, size); onFile(name, buf); }
    else await skip(padded);
  }
}

// ---------- one day: legs within the area
async function fetchDay(day) {
  const { base } = relUrl(day), t0 = Date.parse(day + 'T00:00:00Z') / 1000;
  const legs = [], diffs = Array.from({ length: 24 }, () => []); let files = 0, near = 0, anon = 0;
  const started = Date.now();
  await readTar(parts(base), n => /\/trace_full_[^/]+\.json$/.test(n), (name, buf) => {
    files++;
    let s; try { s = (buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf).toString('utf8'); } catch { return; }
    if (s.indexOf(',51.') < 0) return;                 // no latitude 51.x anywhere in the trace: not ours
    let j; try { j = JSON.parse(s); } catch { return; }
    const hex = j.icao, tr = j.trace || [], ts = j.timestamp || t0; let cur = null, flight = null, cat = null, lastIn = null; let hit = false;
    for (const p of tr) {
      const det = p[8]; if (det && typeof det === 'object') { if (det.flight) flight = det.flight.trim(); if (det.category) cat = det.category; }
      const lat = p[1], lon = p[2]; if (lat == null || lon == null) continue;
      if (lat < BOX.lat0 || lat > BOX.lat1 || lon < BOX.lon0 || lon > BOX.lon1 || distM(lat, lon) > C.r) { lastIn = null; continue; }
      const t = ts + p[0] - t0; if (t < -300 || t > 86700) continue;
      const fl = p[6] | 0, geomFlag = (fl & 8) !== 0;
      let altB = typeof p[3] === 'number' && !geomFlag ? p[3] : null, altG = typeof p[10] === 'number' ? p[10] : geomFlag && typeof p[3] === 'number' ? p[3] : null;
      const ground = p[3] === 'ground';
      if (altB != null && altG != null && altB < 10000) { const h = Math.floor(t / 3600); if (h >= 0 && h < 24) diffs[h].push(altG - altB); }
      const newLeg = !cur || (fl & 2) || (lastIn != null && t - lastIn > GAP) || (flight || '') !== cur.flight;
      if (newLeg) { cur = { hex, flight: flight || '', db: j.dbFlags | 0, t: j.t || '', cat, pts: [] }; legs.push(cur); }
      if (!cur.cat && cat) cur.cat = cat;
      cur.pts.push([t, lat, lon, altB, altG, ground, p[4], p[5]]); lastIn = t; hit = true;
    }
    if (hit) near++;
  });
  console.log(`  ${files} traces read, ${near} aircraft in the area, ${legs.length} legs, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  // the pressure-altitude correction of each hour: median (GNSS height - pressure altitude), ft, below 10,000 ft
  const med = v => { if (!v.length) return null; v.sort((a, b) => a - b); return v[v.length >> 1]; };
  let corr = diffs.map(med); const all = med(diffs.flat()); corr = corr.map(c => c ?? all ?? 150);
  // points: [t, lat, lon, alt ft above the WGS84 ellipsoid, q (0 GNSS, 1 pressure + correction, 2 ground), gs kt, track deg]
  const out = [];
  let idx = 0;
  for (const L of legs) {
    const P = [];
    for (const [t, lat, lon, altB, altG, ground, gs, trk] of L.pts) {
      const h = Math.max(0, Math.min(23, Math.floor(t / 3600)));
      const alt = ground ? 0 : altG != null ? altG : altB != null ? altB + corr[h] : null, q = ground ? 2 : altG != null ? 0 : 1;
      if (alt == null) continue;
      const last = P.at(-1);
      if (last && t - last[0] < 1) continue;                                          // at most one point a second
      if (last && alt > HIGH_FT && last[3] > HIGH_FT && t - last[0] < HIGH_EVERY) continue;   // thin the high points
      P.push([Math.round(t), Math.round(lat * 1e5), Math.round(lon * 1e5), Math.round(alt / 25), q, Math.round(gs || 0), Math.round(trk ?? 0)]);
    }
    if (P.length < 2) continue;
    const id = identified(L.flight, L.db, L.hex);
    if (!id) anon++;
    out.push({ k: id ? `${L.hex}-${P[0][0]}` : `x${++idx}`, id, c: id ? L.flight : undefined, ty: L.t || undefined, cat: L.cat || undefined, P });
  }
  return { legs: out, corr, near, files, anon };
}

// delta-code the columns of a point list
function pack(P) { const flat = [], prev = [0, 0, 0, 0, 0, 0, 0]; for (const p of P) for (let i = 0; i < 7; i++) { flat.push(p[i] - prev[i]); prev[i] = p[i]; } return flat; }

function writeDay(day, D) {
  const dir = join(OUT, 'adsb', day); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  let bytes = 0; const hours = [];
  for (let h = 0; h < 24; h++) {
    const hs = h * 3600, he = hs + 3600, legs = [];
    for (const L of D.legs) {
      const P = L.P; if (P.at(-1)[0] < hs - 120 || P[0][0] > he) continue;
      let a = P.findIndex(p => p[0] >= hs - 120), b = P.length - 1; while (b > 0 && P[b - 1][0] > he) b--;
      a = Math.max(0, a - 1); const sub = P.slice(a, b + 1); if (sub.length < 2) continue;
      legs.push({ k: L.k, c: L.c, ty: L.ty, cat: L.cat, p: pack(sub.map(p => [p[0] - hs, ...p.slice(1)])) });
    }
    const body = { v: 1, date: day, hour: h, t0: Date.parse(day + 'T00:00:00Z') / 1000 + hs, corr_ft: D.corr[h],
      cols: ['t s from t0', 'lat 1e-5 deg', 'lon 1e-5 deg', 'alt 25 ft above WGS84 ellipsoid', 'q 0 GNSS 1 pressure+corr 2 ground', 'gs kt', 'track deg true'], legs };
    const gz = gzipSync(JSON.stringify(body), { level: 9 }); writeFileSync(join(dir, String(h).padStart(2, '0') + '.json.gz'), gz);
    bytes += gz.length; hours.push({ h, legs: legs.length, bytes: gz.length });
  }
  const points = D.legs.reduce((s, L) => s + L.P.length, 0);
  const meta = { date: day, weekday: new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }), legs: D.legs.length, aircraft_legs_identified: D.legs.length - D.anon, legs_type_only: D.anon, aircraft_in_area: D.near, traces_read: D.files, points, bytes, hours, source: relUrl(day).page, built: new Date().toISOString() };
  writeFileSync(join(dir, 'day.json'), JSON.stringify(meta, null, 1));
  console.log(`  ${day}: ${D.legs.length} legs (${D.anon} by type only), ${points} points, ${(bytes / 1e6).toFixed(2)} MB in 24 hour files`);
  return meta;
}

function writeIndex() {
  const base = join(OUT, 'adsb'); mkdirSync(base, { recursive: true });
  const days = readdirSync(base).filter(d => /^\d{4}-\d\d-\d\d$/.test(d) && existsSync(join(base, d, 'day.json'))).sort();
  const metas = days.map(d => JSON.parse(readFileSync(join(base, d, 'day.json'), 'utf8')));
  const idx = { v: 1, generated: metas.map(m => m.built).sort().at(-1) || null, tool: 'cwplans/tools/fetch-adsb-cache.mjs (danbri/londat)',
    source: 'adsb.lol daily history, GitHub releases adsblol/globe_history_<year>, tag v<YYYY.MM.DD>-planes-readsb-prod-0 (readsb trace_full files)',
    licence: 'ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/); feeder data CC0. Attribution: Aircraft: © adsb.lol contributors, ODbL',
    area: { lat: C.lat, lon: C.lon, radius_nm: 25 }, thinning: `points at most 1 a second; above ${HIGH_FT} ft at most 1 a minute`, privacy: 'callsign only for operator ICAO callsigns without LADD/PIA flags and with an ICAO address; every other leg has an anonymous key and its type only; no registration, owner or squawk is kept',
    path: 'adsb/<date>/<HH>.json.gz (UTC hour; legs overlapping the hour, with 2 minutes before for trails)', days: metas.map(({ hours, ...m }) => m) };
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(idx, null, 1));
  writeFileSync(join(OUT, 'README.md'), `# adsb-cache: recorded aircraft for the Docklands 3D page\n\nThis orphan branch of danbri/londat holds only the last ${DAYS} days and has one commit, replaced every day by \`cwplans/tools/fetch-adsb-cache.mjs\` (workflow \`.github/workflows/adsb-cache.yml\` on main).\n\n**Data: © adsb.lol contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)** (derived from the adsb.lol daily history, https://github.com/adsblol; feeder data CC0). This extract is a derived database under the ODbL: keep this notice.\n\nArea: 25 nm round 51.505 N, 0.02 W. Files: \`index.json\` (the days held), \`adsb/<date>/day.json\`, \`adsb/<date>/<HH>.json.gz\` (UTC hour). Each leg: \`k\` key, \`c\` callsign (operator flights only), \`ty\` ICAO type, \`cat\` category, \`p\` delta-coded points [t s from t0, lat 1e-5, lon 1e-5, alt in 25 ft above the WGS84 ellipsoid, q (0 GNSS, 1 pressure altitude + the hour's correction corr_ft, 2 ground), ground speed kt, track deg].\n\nUsed by https://danbri.github.io/londat/docklands/ (layer Aircraft). Not for navigation.\n`);
  return metas;
}

function prune() {
  const base = join(OUT, 'adsb'); if (!existsSync(base)) return;
  const cut = iso(new Date(Date.now() - (DAYS + 1) * 86400e3));
  for (const d of readdirSync(base)) if (/^\d{4}-\d\d-\d\d$/.test(d) && (d <= cut || !existsSync(join(base, d, 'day.json')))) { rmSync(join(base, d), { recursive: true, force: true }); console.log(`  removed ${d}`); }
}

const git = (args, env) => execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 28 }).trim();

function restore() {
  try { git(['fetch', '-q', '--depth=1', 'origin', 'adsb-cache']); } catch { console.log('no adsb-cache branch yet'); return; }
  mkdirSync(OUT, { recursive: true });
  execFileSync('sh', ['-c', `git archive FETCH_HEAD | tar -x -C "${OUT}"`], { stdio: 'inherit' });
  console.log(`restored origin/adsb-cache into ${OUT}`);
}

function push(metas) {
  const idxFile = join(tmpdir(), `adsb-cache-index-${process.pid}`); rmSync(idxFile, { force: true });
  const env = { GIT_INDEX_FILE: idxFile, GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'londat adsb cache bot', GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || 'londat-cache@users.noreply.github.com' };
  env.GIT_COMMITTER_NAME = env.GIT_AUTHOR_NAME; env.GIT_COMMITTER_EMAIL = env.GIT_AUTHOR_EMAIL;
  const gitDir = git(['rev-parse', '--absolute-git-dir']);
  git(['--git-dir', gitDir, '--work-tree', OUT, '-C', OUT, 'add', '-A', '-f', '.'], env);
  const tree = git(['write-tree'], env);
  const msg = `adsb-cache: ${metas.map(m => m.date).join(', ')} (adsb.lol history, ODbL 1.0; 25 nm round 51.505 N 0.02 W)`;
  let remoteTree = null;
  try { const head = git(['ls-remote', 'origin', 'refs/heads/adsb-cache']).split(/\s/)[0]; if (head) remoteTree = git(['rev-parse', `${head}^{tree}`]); } catch { /* no branch yet, or its commit is not here */ }
  if (remoteTree === tree) { rmSync(idxFile, { force: true }); console.log('adsb-cache already holds this tree: nothing pushed'); return; }
  const commit = git(['commit-tree', tree, '-m', msg], env);
  rmSync(idxFile, { force: true });
  git(['push', '-f', 'origin', `${commit}:refs/heads/adsb-cache`]);
  console.log(`pushed ${commit} to adsb-cache (tree ${tree})`);
}

// ---------- main
if (A.includes('--restore')) restore();
mkdirSync(join(OUT, 'adsb'), { recursive: true });
prune();
const today = new Date(); const wanted = ONLY.length ? ONLY : Array.from({ length: DAYS }, (_, i) => iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1 - i))));
for (const day of wanted) {
  if (existsSync(join(OUT, 'adsb', day, 'day.json')) && !ONLY.length) { console.log(`${day}: held`); continue; }
  const { base } = relUrl(day);
  const size = await partExists(`${base}.aa`).catch(() => 0);
  if (!size) { console.log(`${day}: no release yet (${base}.aa)`); continue; }
  console.log(`${day}: fetching ${base}.*`);
  try { const D = await fetchDay(day); writeDay(day, D); } catch (e) { console.error(`${day}: failed: ${e.message}`); process.exitCode = 1; }
}
const metas = writeIndex();
console.log(`held: ${metas.map(m => m.date).join(', ')}; ${(metas.reduce((s, m) => s + m.bytes, 0) / 1e6).toFixed(1)} MB`);
if (A.includes('--push')) push(metas);
