// Open wildlife records for the Docklands model box, as aggregates for the wildlife layer of the Three.js port
// (docklands/layers/wildlife.js): counts per species, per habitat, per month; no record points are written.
//
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-wildlife.mjs fetch   # NBN Atlas + GBIF -> data/raw/wildlife/ (one request at a time, 1 s apart)
//   node cwplans/tools/fetch-wildlife.mjs build                        # raw + area.js + trees.json -> docklands/data/wildlife.json (no network)
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-wildlife.mjs          # both
//
// Sources and licence rules: NBN Atlas records with record licence CC0, CC-BY or OGL (Birda, dr2992, left out: its GBIF
// dataset licence is CC-BY-NC); GBIF records with licence CC0 or CC-BY from iNaturalist research grade, NABU|naturgucker
// and the TIPU ringing database only (eBird is not used: owner rule and eBird terms; Birdex is on NBN; the other open
// UK datasets on GBIF are NBN copies). Not used: every CC-BY-NC record, GiGL / London Wildlife Trust (not open).
// The habitat raster (10 m, model metres) comes from area.js water (OSM, ODbL; the water.js dock rule) and the green
// areas of trees.json (OS Open Greenspace OGL, OSM ODbL, Forest Research TOW OGL). Skill: docklands-3d-page, "Three.js port".
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { CW } from './londat.mjs';

const RAW = join(CW, 'data/raw/wildlife'), OUT = join(CW, 'docklands/data/wildlife.json');
const NBN = 'https://records-ws.nbnatlas.org/occurrences/search', GBIF = 'https://api.gbif.org/v1';
const NBN_LICENCES = ['CC0', 'CC-BY', 'OGL'];
const NBN_SKIP = { dr2992: 'Birda (UK records): GBIF dataset licence CC-BY-NC; left out', dr671: 'National Mammal Atlas Project, online recording (Mammal Society): resource licence CC-BY-NC; left out' };
const NBN_NAMES = { dr2370: 'Birds (BTO/JNCC/RSPB partnership), British Trust for Ornithology, OGL', dr4127: 'Birdex Bird Sightings, CC-BY', dr1347: 'House Sparrow Parks Project, London, 2009-2010, RSPB, CC-BY',
  dr3716: 'Bird records via iRecord, unverified, Biological Records Centre, CC-BY', dr3717: 'Bird records via iRecord, verified, Biological Records Centre, CC-BY', dr2331: 'Non-avian taxa (BTO/JNCC/RSPB partnership), British Trust for Ornithology, OGL',
  dr2451: 'Mammal Mapper App Sighting Records, Mammal Society, CC-BY' };   // registry.nbnatlas.org/ws/dataResource/<uid>, read 2026-10-09
const GBIF_DATASETS = { '50c9509d-22c7-4a22-a47d-8c48425ef4a7': 'iNaturalist Research-grade Observations (records with CC0 or CC-BY only)',
  '6ac3f774-d9fb-4796-b3e9-92bf6c81c084': 'NABU|naturgucker', '292a71df-588b-48fa-9ab5-29ae868ba88c': 'Bird ringing and recovery database (TIPU)' };
const GBIF_LICENCES = ['CC0_1_0', 'CC_BY_4_0'];
const UA = 'londat-cwplans/1.0 (https://github.com/danbri/londat; wildlife aggregates for a 3D map)';

// species of the simulation: id, scientific name, English name, model group
export const SPECIES = [
  ['feralpigeon', 'Columba livia', 'Feral pigeon', 'pigeon'], ['woodpigeon', 'Columba palumbus', 'Woodpigeon', 'pigeon'],
  ['mallard', 'Anas platyrhynchos', 'Mallard', 'duck'], ['tufted', 'Aythya fuligula', 'Tufted duck', 'duck'],
  ['canadagoose', 'Branta canadensis', 'Canada goose', 'goose'], ['greylag', 'Anser anser', 'Greylag goose', 'goose'],
  ['egyptiangoose', 'Alopochen aegyptiaca', 'Egyptian goose', 'goose'], ['coot', 'Fulica atra', 'Coot', 'rail'],
  ['moorhen', 'Gallinula chloropus', 'Moorhen', 'rail'], ['cormorant', 'Phalacrocorax carbo', 'Cormorant', 'cormorant'],
  ['muteswan', 'Cygnus olor', 'Mute swan', 'swan'], ['gcgrebe', 'Podiceps cristatus', 'Great crested grebe', 'grebe'],
  ['bhgull', 'Chroicocephalus ridibundus', 'Black-headed gull', 'gull'], ['herringgull', 'Larus argentatus', 'Herring gull', 'gull'],
  ['lbbgull', 'Larus fuscus', 'Lesser black-backed gull', 'gull'], ['commongull', 'Larus canus', 'Common gull', 'gull'],
  ['gbbgull', 'Larus marinus', 'Great black-backed gull', 'gull'], ['crow', 'Corvus corone', 'Carrion crow', 'crow'],
  ['magpie', 'Pica pica', 'Magpie', 'crow'], ['heron', 'Ardea cinerea', 'Grey heron', 'heron'], ['fox', 'Vulpes vulpes', 'Red fox', 'fox'],
];
export const HABITATS = ['none', 'river', 'dock', 'pond', 'park', 'wood', 'garden'];   // raster classes 0..6 ('none': streets, buildings, other land)

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = b => createHash('sha256').update(b).digest('hex');
let last = 0;
async function get(url) {   // one request at a time, 1 s apart, retry with a doubling pause on 429 or 5xx
  for (let k = 0, wait = 4000; ; k++) {
    const gap = 1000 - (Date.now() - last); if (gap > 0) await sleep(gap); last = Date.now();
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (r.ok) return r.text();
    if ((r.status === 429 || r.status >= 500) && k < 5) { await sleep(wait); wait *= 2; continue; }
    throw new Error(`${r.status} ${url}`);
  }
}

// ---------- the model box and its frame
function loadArea() { const g = globalThis; g.window = g; (0, eval)(readFileSync(join(CW, 'docklands/data/area.js'), 'utf8')); return g.DOCKLANDS_AREA; }
function frame(A) {
  const G = A.meta.geo, E = A.meta.extent;
  const fwd = (lon, lat) => { const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; };
  const inv = (x, z) => { let lon = G.lon0, lat = G.lat0; for (let i = 0; i < 20; i++) { const [x0, z0] = fwd(lon, lat), [x1, z1] = fwd(lon + 1e-5, lat), [x2, z2] = fwd(lon, lat + 1e-5);
    const a = (x1 - x0) / 1e-5, b = (x2 - x0) / 1e-5, c = (z1 - z0) / 1e-5, d = (z2 - z0) / 1e-5, det = a * d - b * c, ex = x - x0, ez = z - z0; lon += (d * ex - b * ez) / det; lat += (-c * ex + a * ez) / det; } return [lon, lat]; };
  const ring = []; for (const [x, z] of [[E.x0, E.z0], [(E.x0 + E.x1) / 2, E.z0], [E.x1, E.z0], [E.x1, (E.z0 + E.z1) / 2], [E.x1, E.z1], [(E.x0 + E.x1) / 2, E.z1], [E.x0, E.z1], [E.x0, (E.z0 + E.z1) / 2], [E.x0, E.z0]]) ring.push(inv(x, z).map(v => +v.toFixed(5)));
  // WKT rings run anticlockwise for GBIF: the box corners in lon/lat go x0z0 (NW) -> x1z0 (NE) -> ... which is clockwise; reverse
  const ccw = ring.slice().reverse();
  return { fwd, E, wkt: `POLYGON((${ccw.map(p => p.join(' ')).join(',')}))`, ring: ccw };
}

// ---------- fetch
async function fetchAll() {
  const A = loadArea(), F = frame(A); mkdirSync(RAW, { recursive: true });
  const log = { at: new Date().toISOString(), wkt: F.wkt, nbn: {}, gbif: {} };
  for (const [id, sci] of SPECIES) {
    // NBN Atlas: every open-licence record of the species in the box, 1,000 a page
    const recs = []; let total = null;
    for (let start = 0; total == null || start < total; start += 1000) {
      const q = new URLSearchParams({ q: '*:*', wkt: F.wkt, pageSize: 1000, startIndex: start, facet: 'off',
        fl: 'decimalLatitude,decimalLongitude,coordinateUncertaintyInMeters,month,year,dataResourceUid,license,individualCount' });
      q.append('fq', `species:"${sci}"`); q.append('fq', `license:(${NBN_LICENCES.join(' OR ')})`);
      const j = JSON.parse(await get(`${NBN}?${q}`)); total = j.totalRecords; recs.push(...j.occurrences);
      if (!j.occurrences.length) break;
    }
    const body = JSON.stringify(recs); writeFileSync(join(RAW, `nbn-${id}.json.gz`), gzipSync(body));
    log.nbn[id] = { records: recs.length, sha256: sha(body) }; console.log('nbn', id, recs.length);
    // GBIF: the species key, then the allowed datasets with an open record licence, 300 a page
    const m = JSON.parse(await get(`${GBIF}/species/match?name=${encodeURIComponent(sci)}&strict=true`)), key = m.usageKey;
    const grec = [];
    if (key) for (let off = 0, end = false; !end; off += 300) {
      const q = new URLSearchParams({ geometry: F.wkt, taxonKey: key, limit: 300, offset: off, hasCoordinate: 'true' });
      for (const d of Object.keys(GBIF_DATASETS)) q.append('datasetKey', d); for (const l of GBIF_LICENCES) q.append('license', l);
      const j = JSON.parse(await get(`${GBIF}/occurrence/search?${q}`));
      for (const o of j.results) grec.push({ decimalLatitude: o.decimalLatitude, decimalLongitude: o.decimalLongitude, coordinateUncertaintyInMeters: o.coordinateUncertaintyInMeters, month: o.month, year: o.year, individualCount: o.individualCount, license: o.license, datasetKey: o.datasetKey });
      end = j.endOfRecords || !j.results.length || off > 20000;
    }
    const gb = JSON.stringify(grec); writeFileSync(join(RAW, `gbif-${id}.json.gz`), gzipSync(gb));
    log.gbif[id] = { taxonKey: key, records: grec.length, sha256: sha(gb) }; console.log('gbif', id, grec.length);
  }
  writeFileSync(join(RAW, 'fetch-log.json'), JSON.stringify(log, null, 1));
}

// ---------- the habitat raster (10 m over the model extent), RLE
const DOCK_NAME = /Dock|Basin|Entrance|Cut\b|Cutting|Lock|Passage|Quay/i, POND_NAME = /Pond|Lake|Fountain|Square/i;   // as docklands/water.js
const GREEN_KIND = k => /wood|forest|tow:small_woodland|tow:nfi_ohc|scrub|nature_reserve/i.test(k) ? 5
  : /Park|park|recreation|Playing Field|grass|meadow|pitch|Golf|Bowling|Other Sports/i.test(k) ? 4
  : /garden|Allotments|Religious|Cemetery/i.test(k) ? 6 : 0;   // play spaces, tennis courts and groups of trees: no class
function dec(q, stride = 2) { const o = new Float64Array(q.length), acc = new Array(stride).fill(0); for (let i = 0; i < q.length; i++) { acc[i % stride] += q[i]; o[i] = acc[i % stride] / 10; } return o; }
const areaOf = (f, n) => { let s = 0; for (let k = 0, j = n - 1; k < n; j = k++) s += (f[2 * j] - f[2 * k]) * (f[2 * j + 1] + f[2 * k + 1]) / 2; return Math.abs(s); };
function raster(A, T) {
  const E = A.meta.extent, c = 10, nx = Math.ceil((E.x1 - E.x0) / c), nz = Math.ceil((E.z1 - E.z0) / c), R = new Uint8Array(nx * nz);
  const fill = (rings, v) => {   // even-odd over the rings, at the cell centres
    const rows = new Map();
    for (const f of rings) for (let i = 0, n = f.length / 2; i < n; i++) { const j = (i + 1) % n, x0 = f[2 * i], z0 = f[2 * i + 1], x1 = f[2 * j], z1 = f[2 * j + 1];
      const ja = Math.max(0, Math.ceil((Math.min(z0, z1) - E.z0) / c - .5)), jb = Math.min(nz - 1, Math.floor((Math.max(z0, z1) - E.z0) / c - .5));
      for (let jj = ja; jj <= jb; jj++) { const zc = E.z0 + (jj + .5) * c; if ((z0 > zc) === (z1 > zc)) continue; if (!rows.has(jj)) rows.set(jj, []); rows.get(jj).push(x0 + (zc - z0) / (z1 - z0) * (x1 - x0)); } }
    for (const [jj, xs] of rows) { xs.sort((a, b) => a - b); for (let q = 0; q + 1 < xs.length; q += 2) for (let ii = Math.max(0, Math.ceil((xs[q] - E.x0) / c - .5)); ii <= Math.min(nx - 1, Math.floor((xs[q + 1] - E.x0) / c - .5)); ii++) R[jj * nx + ii] = v; }
  };
  const order = [6, 4, 5];   // gardens, then parks and grass, then woods on top
  for (const v of order) for (const g of T.greens) if (GREEN_KIND(g.kind) === v) fill([g.ring, ...(g.holes || [])], v);
  for (const w of A.water) { const f = dec(w.p), st = [0, ...(w.holes || []), f.length / 2], rings = [];
    for (let r = 0; r < st.length - 1; r++) rings.push(f.slice(2 * st[r], 2 * st[r + 1]));
    const name = w.n || '', k = w.tidal ? 1 : (!POND_NAME.test(name) && (DOCK_NAME.test(name) || areaOf(f, st[1]) >= 20000) && w.level < 6) ? 2 : 3; fill(rings, k); }
  const rle = []; for (let i = 0; i < R.length;) { let j = i; while (j < R.length && R[j] === R[i] && j - i < 65535) j++; rle.push(R[i], j - i); i = j; }
  const cnt = new Array(HABITATS.length).fill(0); for (const v of R) cnt[v]++;
  return { R, nx, nz, cell: c, x0: E.x0, z0: E.z0, rle, ha: Object.fromEntries(HABITATS.map((h, k) => [h, Math.round(cnt[k] * c * c / 1e4)])) };
}

// ---------- build
const PRIOR = {   // published general ecology for inner east London (relative weights per habitat, 0..1); used where the records are few
  feralpigeon: { none: 1, park: .5, river: 0, dock: 0 }, woodpigeon: { park: .6, wood: .6, garden: .5, none: .1 },
  mallard: { dock: .7, pond: .9, river: .15, park: .1 }, tufted: { dock: .5, pond: .3 }, canadagoose: { dock: .5, pond: .5, park: .4, river: .05 },
  greylag: { dock: .15, pond: .2, park: .15 }, egyptiangoose: { dock: .15, pond: .2, park: .2 }, coot: { dock: .7, pond: .6 }, moorhen: { dock: .4, pond: .7, park: .05 },
  cormorant: { river: .35, dock: .25 }, muteswan: { dock: .3, river: .1, pond: .15 }, gcgrebe: { dock: .2 },
  bhgull: { river: 1, dock: .4, park: .3, none: .2, pond: .3 }, herringgull: { river: .6, dock: .2, none: .3 }, lbbgull: { river: .4, dock: .15, none: .25 },
  commongull: { river: .2, park: .2 }, gbbgull: { river: .1 }, crow: { park: .6, wood: .4, none: .1, garden: .3 }, magpie: { park: .4, wood: .4, garden: .5 },
  heron: { dock: .08, pond: .1, river: .05 }, fox: { wood: 1, park: .5, garden: .5, none: .05 },
};
const ECOLOGY = {   // the general-ecology note shown for each species (not from the records)
  feralpigeon: 'Resident all year; flocks of 10 to 50 on squares, streets and ledges; roosts on buildings and under bridges.',
  woodpigeon: 'Resident; parks and gardens; larger flocks in winter.', mallard: 'Resident; docks, ponds and the river edge; dabbles, does not dive.',
  tufted: 'Mostly winter (October to March); docks and lakes; dives for food.', canadagoose: 'Resident (introduced); grazes park grass in flocks; docks and lakes.',
  greylag: 'Resident (feral); with Canada geese on lakes and grass.', egyptiangoose: 'Resident (introduced); lakes and parks; nests in trees.',
  coot: 'Resident; more in winter; docks and lakes; dives briefly.', moorhen: 'Resident; dock and pond edges, reeds; feeds on banks.',
  cormorant: 'All year, most in winter; fishes in the Thames and the docks (dives for 20 to 60 s); dries its wings on posts and piers.',
  muteswan: 'Resident; docks and the river; pairs, small groups in winter.', gcgrebe: 'Resident in the docks (Millwall, Greenland, South Dock); dives for fish; pairs in spring.',
  bhgull: 'Most numerous gull in winter (August to March); river, docks, parks.', herringgull: 'All year; river, roofs; nests on roofs.',
  lbbgull: 'Mostly summer; roofs and the river; some all winter.', commongull: 'Winter only (October to March); grass and the river.',
  gbbgull: 'Few; the river, mostly winter.', crow: 'Resident; parks, foreshore, streets.', magpie: 'Resident; parks and gardens.',
  heron: 'Resident; stands at dock and river edges; flies slowly with neck folded.',
  fox: 'Resident (London: about 18 a km2, Natural History Museum and Mammal Society estimates); mostly active at dusk and at night; dens in woods, embankments and gardens.',
};
function build() {
  const A = loadArea(), F = frame(A), T = JSON.parse(readFileSync(join(CW, 'docklands/data/trees.json'), 'utf8')), H = raster(A, T);
  const flog = existsSync(join(RAW, 'fetch-log.json')) ? JSON.parse(readFileSync(join(RAW, 'fetch-log.json'), 'utf8')) : null;
  const cls = (x, z) => { const i = Math.floor((x - H.x0) / H.cell), j = Math.floor((z - H.z0) / H.cell); return i < 0 || j < 0 || i >= H.nx || j >= H.nz ? -1 : H.R[j * H.nx + i]; };
  // a record of a waterbird is often made from the bank: within 30 m of water it counts as that water
  const near = (x, z, wet) => { const c0 = cls(x, z); if (c0 < 0) return -1; if (c0 >= 1 && c0 <= 3 || !wet) return c0;
    for (const r of [10, 20, 30]) for (let a = 0; a < 8; a++) { const v = cls(x + r * Math.cos(a * Math.PI / 4), z + r * Math.sin(a * Math.PI / 4)); if (v >= 1 && v <= 3) return v; } return c0; };
  const WET = new Set(['duck', 'goose', 'rail', 'cormorant', 'swan', 'grebe', 'gull', 'heron']);   // the 30 m rule is for waterbirds only
  const species = [], totals = { nbn: 0, gbif: 0, located: 0 }, byResource = {}, byLicence = {};
  for (const [id, sci, name, group] of SPECIES) {
    const read = f => existsSync(join(RAW, f)) ? JSON.parse(gunzipSync(readFileSync(join(RAW, f))).toString()) : [];
    const nbn = read(`nbn-${id}.json.gz`).filter(o => !NBN_SKIP[o.dataResourceUid]), gbif = read(`gbif-${id}.json.gz`);
    const S = { id, sci, name, group, records: 0, nbn: nbn.length, gbif: gbif.length, located: 0, outside: 0, habitat: Object.fromEntries(HABITATS.map(h => [h, 0])), months: new Array(12).fill(0), years: [null, null], flock: null };
    const counts = [];
    const add = (o, src) => {
      const [x, z] = F.fwd(+o.decimalLongitude, +o.decimalLatitude); if (!(x >= F.E.x0 && x <= F.E.x1 && z >= F.E.z0 && z <= F.E.z1)) { S.outside++; return; }
      S.records++; const m = +o.month; if (m >= 1 && m <= 12) S.months[m - 1]++;
      const y = +o.year; if (y > 1800) { S.years[0] = Math.min(S.years[0] ?? y, y); S.years[1] = Math.max(S.years[1] ?? y, y); }
      const u = o.coordinateUncertaintyInMeters; if (u != null && +u <= 100) { const h = near(x, z, WET.has(group)); if (h >= 0) { S.habitat[HABITATS[h]]++; S.located++; } }
      if (+o.individualCount > 0) counts.push(+o.individualCount);
      const res = src === 'nbn' ? o.dataResourceUid : o.datasetKey; byResource[`${src}:${res}`] = (byResource[`${src}:${res}`] || 0) + 1;
      byLicence[`${src}:${o.license}`] = (byLicence[`${src}:${o.license}`] || 0) + 1;
    };
    for (const o of nbn) add(o, 'nbn'); for (const o of gbif) add(o, 'gbif');
    counts.sort((a, b) => a - b); S.flock = counts.length >= 5 ? { median: counts[counts.length >> 1], p90: counts[Math.floor(counts.length * .9)], n: counts.length } : null;
    totals.nbn += S.nbn; totals.gbif += S.gbif; totals.located += S.located;
    // season: months smoothed over three months, scaled to a peak of 1; fewer than 24 dated records: no season from data
    const dated = S.months.reduce((a, b) => a + b, 0);
    S.season = dated >= 24 ? (() => { const sm = S.months.map((v, i) => (S.months[(i + 11) % 12] + 2 * v + S.months[(i + 1) % 12]) / 4), mx = Math.max(...sm); return sm.map(v => +(v / mx).toFixed(2)); })() : null;
    // weight per habitat: located records (share of this species' located records) blended with the ecology prior;
    // fewer than 10 located records: the prior only
    const P = PRIOR[id] || {}, w = {};
    for (const h of HABITATS.slice(0)) { const prior = P[h] || 0, data = S.located >= 10 ? S.habitat[h] / S.located : null;
      w[h] = +(data == null ? prior : .5 * prior + .5 * data * Math.max(1, ...Object.values(P))).toFixed(3); }
    S.weight = w; S.basis = S.located >= 10 ? (dated >= 24 ? 'records (habitat and season) with ecology' : 'records (habitat) with ecology') : dated >= 24 ? 'records (season); habitat from ecology' : 'ecology (too few open records)';
    S.ecology = ECOLOGY[id] || '';
    species.push(S);
  }
  // abundance: open records per species relative to the most recorded waterbird, for the card (records measure observers, not birds)
  const out = {
    built: new Date().toISOString().slice(0, 10),
    about: 'Aggregates of open wildlife records in the Docklands model box for the wildlife simulation of the Three.js port (docklands/layers/wildlife.js): records per species, per habitat class (records located to 100 m or better), per month; a habitat raster. No record points. Built by cwplans/tools/fetch-wildlife.mjs.',
    caveats: ['Record counts measure where and when people record, not how many animals there are: common birds (feral pigeon) are under-recorded, scarce ones over-recorded. The simulation blends them with general ecology (weights) and its own densities.',
      'Habitat of a record: its point in the 10 m habitat raster, or water within 30 m (waterbirds are recorded from the bank). Records with a coordinate uncertainty over 100 m (grid squares, mostly 1 km) count only for the totals and the months.'],
    box: { wkt: F.wkt, extent: F.E },
    sources: [
      { id: 'nbn-atlas', name: 'NBN Atlas occurrence records (records-ws.nbnatlas.org)', licences: NBN_LICENCES, attribution: 'NBN Atlas (https://nbnatlas.org) and the data partners named in byResource', url: 'https://nbnatlas.org/', records: totals.nbn, left_out: NBN_SKIP },
      { id: 'gbif', name: 'GBIF.org occurrence records', licences: ['CC0 1.0', 'CC BY 4.0'], datasets: GBIF_DATASETS, attribution: 'GBIF.org, the datasets named; iNaturalist observers (CC BY records)', url: 'https://www.gbif.org/', records: totals.gbif },
    ],
    rejected: [
      { source: 'eBird (GBIF dataset EOD 4fa7b334, 186,681 bird records in the box)', why: 'Not used: eBird terms of use restrict reuse (owner rule, 2026-10-09).' },
      { source: 'CC BY-NC records (iNaturalist NC, Observation.org, Birda, Xeno-canto; NBN Atlas: 106,051 bird records in the box)', why: 'Non-commercial licence: not for this project.' },
      { source: 'Birda on NBN Atlas (dr2992)', why: 'Flagged open on NBN, but the GBIF dataset licence is CC BY-NC: left out.' },
      { source: 'National Mammal Atlas Project, online recording (NBN dr671, Mammal Society)', why: 'Resource licence CC BY-NC (some records flagged open): left out.' },
      { source: 'Birdex on GBIF; NBN-hosted UK datasets on GBIF', why: 'Copies of NBN Atlas resources: counted once, from NBN.' },
      { source: 'GiGL (Greenspace Information for Greater London) and London Wildlife Trust records', why: 'Not open: supplied under a data request and a fee; not used.' },
    ],
    totals, byResource, resourceNames: { ...NBN_NAMES, ...Object.fromEntries(Object.entries(GBIF_DATASETS).map(([k, v]) => ['gbif:' + k, v])) }, byLicence,
    habitats: { classes: HABITATS, cell: H.cell, x0: H.x0, z0: H.z0, nx: H.nx, nz: H.nz, rle: H.rle, hectares: H.ha,
      from: 'area.js water (OSM, ODbL; the dock / pond rule of docklands/water.js); trees.json green areas (OS Open Greenspace OGL v3.0, OSM ODbL, Forest Research TOW OGL v3.0)' },
    species,
    provenance: { tool: 'cwplans/tools/fetch-wildlife.mjs', fetched: flog && flog.at, queries: flog && { nbn: NBN, gbif: GBIF + '/occurrence/search', wkt: flog.wkt }, raw_sha256: flog && Object.fromEntries(Object.entries(flog.nbn).map(([k, v]) => [k, { nbn: v.sha256, gbif: flog.gbif[k]?.sha256 }])) },
  };
  writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote', OUT, (JSON.stringify(out).length / 1024).toFixed(0), 'KB; runs', H.rle.length / 2, 'hectares', H.ha);
  for (const S of species) console.log(S.id.padEnd(14), String(S.records).padStart(5), 'located', String(S.located).padStart(4), S.basis, JSON.stringify(S.habitat));
}

const cmd = process.argv[2] || 'all';
if (cmd === 'fetch' || cmd === 'all') await fetchAll();
if (cmd === 'build' || cmd === 'all') build();
