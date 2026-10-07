// OS Open UPRN + OS Open Linked Identifiers (LIDS) for the Canary Wharf box.
// Run: node cwplans/tools/registry-uprn.mjs
// Needs, in cwplans/data/raw/registry/ (from the OS Downloads API, no key needed):
//   osopenuprn_YYYYMM_csv.zip                         https://api.os.uk/downloads/v1/products/OpenUPRN/downloads
//   lids-YYYY-MM_csv_BLPU-UPRN-TopographicArea-TOID-5.zip   https://api.os.uk/downloads/v1/products/LIDS/downloads
//   lids-YYYY-MM_csv_BLPU-UPRN-Street-USRN-11.zip
// Writes registry/sources/uprn/uprn-canary-wharf.csv, uprn-linked-ids-canary-wharf.csv, uprn-summary.json.
// A UPRN is a property identifier (an addressable thing: a flat, a shop, a lamp post), not a person.
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ROOT, OUT, RAWREG, CW_BOX, DOCKLANDS_BOX, inBox, cwPostcodes } from './registry-lib.mjs';

const dir = join(OUT, 'uprn');
mkdirSync(dir, { recursive: true });
const newest = re => { const f = readdirSync(RAWREG).filter(x => re.test(x)).sort().at(-1); if (!f) throw new Error(`missing ${re} in ${RAWREG}`); return join(RAWREG, f); };
async function* lines(zip, member = '*.csv') {
  const child = spawn('unzip', ['-p', zip, member], { stdio: ['ignore', 'pipe', 'inherit'] });
  yield* createInterface({ input: child.stdout, crlfDelay: Infinity });
}

// nearest postcode centroid (approximate: Open UPRN carries no postcode; ONSPD centroids are not boundaries)
const allPc = JSON.parse(readFileSync(join(ROOT, 'postcodes', 'postcodes.json'), 'utf8')).postcodes.filter(p => p.status === 'live' && p.e);
const cwSet = new Set(cwPostcodes({ terminated: false }).map(p => p.pc));
const nearestPc = (x, y) => { let best = null, d2 = Infinity; for (const p of allPc) { const d = (p.e - x) ** 2 + (p.n - y) ** 2; if (d < d2) { d2 = d; best = p; } } return [best.pc, Math.round(Math.sqrt(d2))]; };

// ---- 1. Open UPRN
const uprnZip = newest(/^osopenuprn_\d+_csv\.zip$/);
const uprns = new Map(); let total = 0, docklands = 0;
for await (const l of lines(uprnZip, '*.csv')) {
  const f = l.split(',');
  const lat = +f[3], lon = +f[4];
  if (!(lat > 0)) continue;
  total++;
  if (inBox(lon, lat, DOCKLANDS_BOX)) docklands++;
  if (inBox(lon, lat, CW_BOX)) uprns.set(f[0], { x: +f[1], y: +f[2], lat, lon });
}
console.log(`Open UPRN: ${total} rows; Docklands box ${docklands}; Canary Wharf box ${uprns.size}`);

// ---- 2. LIDS: UPRN -> TopographicArea TOID (the MasterMap polygon the address point sits in), UPRN -> USRN (street)
const links = [];
const toidXY = {};
const toidCount = new Map(), usrnCount = new Map(), withToid = new Set(), withUsrn = new Set();
for (const [re, kind] of [[/^lids-.*BLPU-UPRN-TopographicArea-TOID-5\.zip$/, 'toid'], [/^lids-.*BLPU-UPRN-Street-USRN-11\.zip$/, 'usrn']]) {
  let n = 0;
  for await (const l of lines(newest(re), '*.csv')) {
    const a = l.indexOf(','), b = l.indexOf(',', a + 1);
    const uprn = l.slice(a + 1, b);
    if (!uprns.has(uprn)) continue;
    const f = l.split(',');
    links.push({ uprn, kind, id: f[4], version_date: f[6].slice(0, 8), confidence: f[7] });
    if (kind === 'toid') { toidCount.set(f[4], (toidCount.get(f[4]) || 0) + 1); withToid.add(uprn); const u = uprns.get(uprn), c = (toidXY[f[4]] ||= [0, 0]); c[0] += u.lat; c[1] += u.lon; }
    else { usrnCount.set(f[4], (usrnCount.get(f[4]) || 0) + 1); withUsrn.add(uprn); }
    n++;
  }
  console.log(`LIDS ${kind}: ${n} links`);
}

// ---- write
const fetched = new Date().toISOString().slice(0, 10);
const rows = ['uprn,x_bng,y_bng,lat,lon,nearest_postcode_centroid,nearest_pc_m,nearest_pc_is_cw'];
for (const [u, p] of [...uprns].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }))) {
  const [pc, m] = nearestPc(p.x, p.y);
  p.pc = pc;
  rows.push([u, p.x, p.y, p.lat, p.lon, pc, m, cwSet.has(pc) ? 1 : 0].join(','));
}
writeFileSync(join(dir, 'uprn-canary-wharf.csv'), rows.join('\n') + '\n');
writeFileSync(join(dir, 'uprn-linked-ids-canary-wharf.csv'), ['uprn,link,identifier,version_date,confidence',
  ...links.sort((a, b) => a.uprn.localeCompare(b.uprn, 'en', { numeric: true }) || a.kind.localeCompare(b.kind))
    .map(r => [r.uprn, r.kind === 'toid' ? 'TopographicArea_TOID' : 'Street_USRN', r.id, r.version_date, r.confidence].join(','))].join('\n') + '\n');

const perPc = {};
for (const p of uprns.values()) perPc[p.pc] = (perPc[p.pc] || 0) + 1;
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, c]) => ({ id, uprns: c }));
const r6 = v => Math.round(v * 1e6) / 1e6;
const topToids = top(toidCount, 40).map(t => ({ ...t, mean_lat: r6(toidXY[t.id][0] / t.uprns), mean_lon: r6(toidXY[t.id][1] / t.uprns) }));
writeFileSync(join(dir, 'uprn-summary.json'), JSON.stringify({
  fetched, box: CW_BOX, docklands_box: DOCKLANDS_BOX,
  sources: { open_uprn: uprnZip.split('/').at(-1), lids: links.length ? 'OS Open Linked Identifiers, BLPU-UPRN-TopographicArea-TOID-5 and BLPU-UPRN-Street-USRN-11' : null },
  open_uprn_rows_gb: total, uprns_docklands_box: docklands, uprns_canary_wharf_box: uprns.size,
  uprns_with_toid: withToid.size, distinct_toids: toidCount.size, uprns_with_usrn: withUsrn.size, distinct_usrns: usrnCount.size,
  toids_with_most_uprns: topToids, usrns_with_most_uprns: top(usrnCount, 15),
  uprns_per_nearest_postcode_centroid: Object.fromEntries(Object.entries(perPc).sort((a, b) => b[1] - a[1])),
  note: 'nearest_postcode_centroid is an approximation (nearest ONSPD centroid), not the address postcode: Open UPRN has no address or postcode. A TOID with many UPRNs is usually a block of flats or an office tower (one MasterMap building polygon, many addressable units).',
}, null, 1));
console.log(`UPRNs with TOID ${withToid.size} (${toidCount.size} TOIDs), with USRN ${withUsrn.size} (${usrnCount.size} USRNs)`);
