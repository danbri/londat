// Rule-driven harvest of London Datastore datasets that triage.json lists for harvest (state listed-for-harvest):
// pick the resources by written rules, read every row or feature, keep the zone's rows and features only, write
// feeds/london-datastore/<key>/<key>.geojson and/or <key>.json with a meta member, and record the outcome of every
// dataset in feeds/london-datastore/harvest-log.json (triage reads it: no zone rows -> not-relevant, unreadable ->
// deferred). It imports the walk tool (its polite fetch queue, readers and harvestGeo):
//   node magpie/cwplans/tools/lds-harvest-auto.mjs plan [id ...] [--rank a-b]                  # resources only
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/lds-harvest-auto.mjs run [id ...] [--rank a-b] [--again]
//   node magpie/cwplans/tools/lds-harvest-auto.mjs register     # data-register.json lines and the pipeline.json activity
//   node magpie/cwplans/tools/lds-harvest-auto.mjs index        # feeds/london-datastore/index.json for the atlas and the 3D page
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/lds-harvest-auto.mjs zone-names   # zone-names.json: station and town centre names
// register edits the shared files line by line (sources and files are one line each there): it replaces or adds only
// the lines of the datasets in harvest-log.json, so another agent's lines are never rewritten.
// Readers: GeoPackage, GeoJSON, shapefile zips (walk tool), CSV streamed line by line (never stored when large),
// xlsx/xlsm streamed with ExcelJS (large workbooks), xls/ods/small xlsx with SheetJS, zips entry by entry.
// Rules, the zone tests and the traps: skills/cwplans-london-datastore/SKILL.md, "Rule-driven harvest".
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, rmSync, createReadStream, readdirSync as readdirSyncFs } from 'fs';
import { join, dirname } from 'path';
import { execFileSync, spawn } from 'child_process';
import { createInterface } from 'readline';
import { CW } from './londat.mjs';
import {
  OUT, RAWDIR, BASE, today, rawFile, politeStream, politeFetch, politeRange, readJson, readGpkg, readShpZip, harvestGeo, ZONE_BNG, ZONE_WGS84,
  parseCsvLine, DROP_FIELD, bboxOf as bboxOfG,
} from './walk-london-datastore.mjs';

// ---- written rules (the SKILL and harvest-log.json meta repeat them)
export const AUTO_RULES = {
  formats: 'readable resource formats: gpkg, geojson, zip, csv, tsv, xlsx, xlsm, xls, ods; json and txt only when nothing else is readable. Documents, images, kml/kmz, rds and other binary formats are not read.',
  dedupe: 'one resource per file stem (file name lower-cased, separators to "-", without the extension and without trailing format words shp, gpkg, geojson, csv, xlsx, xls, gis, data, and the layout words long, wide; a wide file is taken before its long twin): gpkg > geojson > zip > csv > tsv > xlsx > xlsm > xls > ods > json > txt, then the newest; identical md5 = one resource.',
  caps: 'a resource over 1,200 MB is not read (disk); a dataset with more than 40 stems or 2,500 MB in total takes the newest 12 stems unless a hand rule (HAND) says otherwise. Raw files over 20 MB are deleted after reading.',
  names: 'datasets about town centres or stations (metadata geo Town Centres or Train Stations, or the title) also match names: a cell equal, after normalising (case, &, punctuation, words such as station, DLR, town centre), to the name of a zone town centre (town-centres harvest, polygon meets the box) or a zone station (TfL StopPoint, NaPTAN metro and rail stations in the box); keys town-centre:<name>, station:<name>; weaker than a code.',
  zone_row: 'a table row is a zone row when a cell is a zone OA/LSOA/MSOA/ward code (zone-codes.json, any vintage), a zone postcode (ONSPD grid reference in the 3D model box), a zone postcode sector (the sector of a zone postcode, in a sector column) , a zone UPRN in a UPRN column (OS Open UPRN in the box), a zone TOID in a TOID column, or its own coordinates lie in the box (lat/lon or easting/northing columns, judged by value). Ward tables: the City of London row (E09000001) is a zone row (the City is one ward-level unit there). The first matching key is recorded per row (zone_keys).',
  transposed: 'a sheet whose area codes run across a row (3 or more codes in one of the first 15 rows, and no code in a column to the left below it) is read column-wise: the label columns and the columns of zone codes are kept, every row; zone_keys then name the columns ("column ward:E05009323").',
  header: 'sheets: the up to 4 rows above the first data row (a row with an area code, a postcode or a coordinate) are header_rows; CSV: the first line.',
  geometry: 'features (GeoPackage, GeoJSON, shapefile) are kept when they meet the box (walk-london-datastore.mjs harvestGeo); a table whose single header row names coordinate columns becomes points in the .geojson (the row cells are the properties).',
  numbers: 'numeric cells are kept as numbers; non-integers rounded to 6 significant digits (file size); identifiers (leading zero, E0.. codes, osgb TOIDs) stay text.',
  personal: 'columns whose name matches ' + DROP_FIELD.source + ' are dropped (contact details), also under the cwplans exception.',
  outcome: 'harvested: at least one zone row or feature; no-zone-rows: every row or feature read, none in the zone (then triage states the dataset not-relevant, rule F8b, with the counts as evidence); not-readable: no resource could be read (deferred, F10b); documents-only: the zips hold documents only (deferred, F7); deferred-by-hand: a HAND rule with the reason (deferred, F3c); held-for-owner: not run (owner decision pending; the state is left as it was).',
  clip: 'a polygon of over 1,000 vertices that reaches beyond the zone (a London-wide boundary) is cut to the 3D model box plus 500 m (Sutherland-Hodgman, ring by ring) and marked clipped_to_zone; smaller geometries are kept whole.',
  as_table: 'a hand rule may keep rows with coordinates as a table (the LAEI grid summaries are one row per cell, source and year: 33,540 points made 15 MB of GeoJSON for LAEI 2010).',
  thin: 'a hand rule may thin a regular 20 m grid (LAEI concentrations) to 1 cell in 5 each way (a 100 m grid), by the BNG cell index of the point or of the cell centre; the meta says so.',
};
const ORDER = ['gpkg', 'geojson', 'zip', 'csv', 'tsv', 'xlsx', 'xlsm', 'xls', 'ods', 'json', 'txt'];
const READ = new Set(ORDER);
const MAX_RES = 1200e6, MAX_TOTAL = 2500e6, MAX_STEMS = 40, KEEP_RAW = 20e6;
// datasets not run without the owner (the instruction of 2026-10-04: leave the two owner-decision datasets untouched)
const OWNER_HOLD = { '2g980': 'Shut in lift releases (lift entrapments) attended by LFB: incident records at addresses; the owner decides first', 'e68wz': 'Assembly Member gifts register: named people; the owner decides first',
  // the same class as 2g980 (LFB incident records with UPRN, rounded coordinates and incident types that include
  // suicide attempts and medical calls at homes): held with it until the owner decides (2026-10-04)
  'em8xy': 'London Fire Brigade Incident Records: incident records at addresses (UPRN, coordinates), special service types include suicide/attempts and medical incidents; same class as 2g980, held for the owner',
  '24r65': 'London Fire Brigade Mobilisation Records: the mobilisations of the incident records em8xy (joined by incident number); held with em8xy for the owner',
  '2ogkn': 'Animal rescue incidents attended by LFB: incident records at addresses (UPRN, coordinates, also at homes); same class as 2g980, held for the owner' };
// hand rules per dataset: pick resources by file name (RegExp), or a reason to skip; written where the general rules
// would take too much or the wrong file. Filled while running the batches (the reason is the evidence).
export const HAND = {
  // resource choices (files: RegExp on the file name); thin: keep 1 in 5 x 1 in 5 cells of a 20 m grid (a 100 m grid)
  '2o8ng': { files: /custom_age_tool_/, why: 'the 2019-based tools; the 2016-based xls creators (54-57 MB) are superseded' },
  '2r48w': { asTable: true, files: /Emissions_Summary-NOxPMCO2|Emissions_Summary-OtherPollutants|Emissions_Summary_GIS|Concentrations_Data_CSV|RoadTrafficData_GIS|exceeding/i, thin: 20, why: 'LAEI 2016: grid emission summaries, the road traffic links (GIS), the 20 m concentration grid thinned to 100 m, population and schools exceeding; the per-link emission workbooks (217-447 MB) not read' },
  'e550x': { files: /Newham/, why: 'one zip per borough; Newham is the only zone borough in the dataset' },
  '2wwq4': { sheets: /persons|components/i, why: 'the persons and components-of-change sheets of the three variants; the male and female sheets split the persons rows (13.8 MB with them, single year of age x ward x sex)' },
  '2zp76': { files: /^gla_2024_housing_led_central_(ward|msoa)\.xlsx$/, why: '2024-based central projection at ward and MSOA (the low and high variants tripled the output to 10 MB; they stay at the source); the variant zips (0.7-1.5 GB), the borough-level files and the superseded 2022-based workbooks not read' },
  'v8o11': { files: /\.xlsx$/, why: 'the LSOA table; the GIS zip (214 MB) repeats it with geometry' },
  '2964y': { files: /\.xlsx$/, why: 'the summary workbooks (the RM long tables, 18-70 MB each, cross-tabulate the same counts)' },
  '2r7om': { files: /\.xlsx$/, why: 'the summary workbooks (the RM long tables, 16-106 MB each, cross-tabulate the same counts)' },
  em95y: { thin: 20, why: 'LAEI 2006 modelled 20 m grid points thinned to 100 m (105,656 zone points at 20 m: 21 MB)' },
  // the LAEI 2006 value files carry no coordinates: the first column GRID_ID ("gla503560175340") is the point's BNG
  // easting and northing (6 digits each), the same points as em95y
  ...Object.fromEntries(['298jq', '2jrkd', '2np13', '2ry8d', '2yrpy', 'e188j'].map(id => [id, { thin: 20, grid: /^gla(\d{6})(\d{6})$/, why: 'LAEI 2006 modelled values per 20 m grid point: the point read from GRID_ID (gla + easting + northing), thinned to 100 m as em95y' }])),
  '2ry01': { skip: 'LAEI 2008 concentration maps: five 20 m grid shapefiles of about 150 MB each (millions of cells); reading them whole exhausted the 12 GB heap here (2026-10-04); the newer LAEI 2016 20 m grid is harvested thinned to 100 m, and the 2013 and 2019 releases cover the same air', outcome: 'deferred-by-hand' },
  'e6410': { asTable: true, files: /1-Summary-Emissions/, why: 'LAEI 2010 summary emissions (1 km grid); the 20 m concentrations (555 MB) are not read whole here (the LAEI 2008 grids exhausted the heap) and 2-Emissions (1.7 GB, per source) not read; LAEI 2016 holds a newer 20 m grid' },
  'em9mg': { asTable: true, files: /laei-2008-folders/, why: 'LAEI 2008: the folders zip; the two database zips hold the same tables as Access databases' },
  'exy6d': { files: /GIS|Supporting/, why: 'LAEI 2013 focus areas: GIS and supporting zips; the images zip (199 MB) not read' },
  'exyop': { files: /GIS|Supporting/, why: 'LAEI 2016 focus areas: GIS and supporting zips; the images zip (520 MB) not read' },
  'exywx': { asTable: true, files: /Grid Emissions Summary|MinorRoads_and_ColdStart/, why: 'LAEI 2013: grid emission summaries and minor roads by grid (1 km); the 20 m concentration zips (786 MB and 1.5 GB) are not read whole here (the LAEI 2008 grids exhausted the heap; LAEI 2016 holds a newer 20 m grid); the per-link workbooks (350-390 MB each) and older concentration releases not read' },
  '2g1zq': { files: /ons-mye-(LSOA|MSOA)11\.csv|land-area/, why: '2011-geography mid-year estimates; the 2001-geography files and the custom age tools repeat them' },
  'ex9jd': { files: /WD22_London|population_msoa11_2010_to_2011\.csv/, why: 'the London ward series and the MSOA 2010-2011 file; LAD-level files have no zone rows; the LSOA 2010-2011 csv (746 MB) not read; rds not readable' },
  '2jxq0': { files: /^LDD Permissions for Datastore/, asTable: true, why: 'kept as tables (5,492 zone permissions: 11.7 MB as GeoJSON points); the permission-level extracts (permissions, non-residential floorspace and bedrooms); the unit-level approvals and completions (3 files, 22,417 zone rows, 40 MB of output) repeat the same permissions unit by unit' },
  'exynl': { files: /Chapter/, why: 'AMR 14 (2018): the chapter tables (town centres, Opportunity Areas); its LDD extracts (approvals, starts, completions, pipeline) are earlier snapshots of the London Development Database, superseded by the 2020 extract (2jxq0) and the Planning London Datahub (tools/build-construction-index.mjs)' },
  '204q6': { files: /Chapter/, why: 'AMR 15 (2019): the chapter tables; its LDD extracts are earlier snapshots of the London Development Database, superseded by the 2020 extract (2jxq0) and the Planning London Datahub' },
  'v8o0m': { skip: 'AMR 13 (2017): LDD pipeline and completions extracts, superseded by the 2020 extract (2jxq0, harvested) and the Planning London Datahub', outcome: 'deferred-by-hand' },
  '2zwnk': { files: /_Lden_/, decimals: 5, simplify: 2, why: 'Lden (day-evening-night) road and rail noise bands only, coordinates to 5 decimals (about 1 m), vertices closer than 2 m dropped; the LAeq16h and Lnight layers (20,000 more zone polygons, 15 MB in all) repeat the same contours for other periods; the 2018 maps (2017 data) are older than Defra round 4 (2022)' },
  '2zjmn': { dropLayers: /Surface_Water_Flood_Risk|Flood_Risk_Area|Flood_Zone|Statutory_Listed_Buildings|^Conservation_Areas$|Archaeological_Priority_Areas|Classified_Roads|Highway_Network|Local_Roads|^Town_Centres$|Central_Activities_Zone|^Site_Allocations$/, decimals: 5, simplify: 1, why: 'Local Plan layers that only the local plans hold (tall building locations, SINCs, green grid, open space audit, water space, air quality areas, shopping frontages, employment and office locations, Thames Policy Area, Tideway safeguarding, cycle routes...); left out: EA flood and surface water layers (5.4 MB for one polygon; the EA and planning.data.gov.uk flood zones are held), listed buildings, conservation areas, archaeological priority areas, roads, town centres, CAZ and site allocations (held from their own sources); 5 decimals, vertices closer than 1 m dropped' },
  '29jwj': { dropLayers: /^(?!OA_2011_BGC)/i, decimals: 5, simplify: 1, why: 'the 2011 output area outlines only, generalised and clipped to the coastline (BGC; the full-resolution BFC and extent BFE copies repeat them) (the LSOA, MSOA and ward layers of 2011 repeat statistical-boundaries and 20od9); 5 decimals' },
  '2r401': { skip: 'Breathe London AQMesh pods: a time series of sensor readings with the pod position on every row (65 MB CSV; the zone rows came to 42 MB as points); the readings belong to a time-series store, not the repository; the pod positions alone are in the Breathe London network listing', outcome: 'deferred-by-hand' },
  'e64on': { files: /^financial-capability-(lsoa-summary(-2010)?\.csv|postcode-london(-2010)?\.zip)$/, asTable: true, why: 'the London-wide postcode files (2010 and later) and the LSOA summaries, kept as tables; the tab-delimited twins and the 33 per-borough files repeat them (13 MB with the duplicates as points)' },
  '2zj4k': { allRows: true, why: 'Royal Docks Grant Data: the whole dataset is about the Royal Docks (title and publisher, the Royal Docks Enterprise Zone team); its rows name projects, not areas: every row kept (key "whole dataset")' },
  'epr1g': { skip: 'OS Code-Point Open (2014 copy on the Datastore): the zone postcodes with their positions came to 25 MB; the project holds the newer ONSPD August 2026 positions of the same postcodes (postcodes/, zone-codes.json)', outcome: 'deferred-by-hand' },
  'e55gn': { asTable: true, why: 'postcode rows with coordinates kept as a table (8,217 zone postcodes: 1.5 MB as rows, 11.8 MB as GeoJSON points)' },
  '2jkxd': { files: /\.xls$/, why: 'the workbooks (one row per area, years across); the CSVs (89 MB for LSOA) hold the same figures one row per area and year' },
  'ep8xy': { files: /Time Series/, why: 'the time series workbook; the five yearly model workbooks (2011-2015, 8.6 MB each) repeat it month by month' },
  'emxjy': { skip: '2001 Census commissioned tables at output area: 67 zips, 1.8 GB, hundreds of tables; superseded for current context by the 2011 and 2021 Census (harvested by ward and LSOA); not harvested by hand (size against value)', outcome: 'deferred-by-hand' },
};

// ---- references
let REFS = null;
function refs() {
  if (REFS) return REFS;
  const z = readJson(join(OUT, 'zone-codes.json'));
  const code = new Map(); for (const [k, list] of Object.entries(z.codes)) for (const c of list) code.set(c, k);
  const pcs = new Set(z.postcodes.map(p => p.replace(/\s+/g, '').toUpperCase()));
  const sectors = new Set(z.postcodes.map(p => { const [o, i] = p.split(' '); return o + ' ' + i[0]; }));
  const lines = f => existsSync(f) ? new Set(readFileSync(f, 'utf8').split('\n').filter(Boolean)) : new Set();
  const uprn = lines(join(RAWDIR, 'zone-uprns.txt')), toid = lines(join(RAWDIR, 'zone-toids.txt'));
  if (!uprn.size) console.warn('warning: no zone-uprns.txt in the raw cache: the UPRN test is off');
  return REFS = { code, pcs, sectors, uprn, toid };
}

// ---- resource choice
const stemOf = f => decodeURIComponent(f || '').toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '').replace(/[\s_.]+/g, '-').replace(/\(\d+\)$/, '')
  .replace(/(-(shp|shapefile|gpkg|geopackage|geojson|csv|xlsx|xls|gis|data|esri|long|wide))+$/g, '');
const isLong = f => /[-_ ]long(\.[a-z0-9]+)?$/i.test(decodeURIComponent(f || ''));
export function planDataset(d) {
  if (HAND[d.id]?.skip) return { skip: HAND[d.id].skip, picked: [] };
  let cands = d.resources.filter(r => READ.has(r.format));
  if (!cands.some(r => !['json', 'txt'].includes(r.format))) cands = cands; else cands = cands.filter(r => !['json', 'txt'].includes(r.format));
  if (HAND[d.id]?.files) cands = cands.filter(r => HAND[d.id].files.test(decodeURIComponent(r.file || '')));
  const notes = [];
  const seenMd5 = new Set(); cands = cands.filter(r => { if (r.md5 && seenMd5.has(r.md5)) { notes.push(`${r.file}: same md5 as another resource`); return false; } if (r.md5) seenMd5.add(r.md5); return true; });
  const big = cands.filter(r => (r.size || 0) > MAX_RES && !HAND[d.id]?.allowBig); for (const r of big) notes.push(`${r.file}: ${(r.size / 1e6).toFixed(0)} MB, over the ${MAX_RES / 1e6} MB resource cap`);
  cands = cands.filter(r => !big.includes(r));
  const byStem = new Map();
  for (const r of cands) { const s = stemOf(r.file || r.url); (byStem.get(s) || byStem.set(s, []).get(s)).push(r); }
  // a "_wide" and a "_long" file of one table: the wide one (one row per area); then the format order; then the newest
  let picked = [...byStem.values()].map(rs => rs.sort((a, b) => (isLong(a.file) - isLong(b.file)) || (ORDER.indexOf(a.format) - ORDER.indexOf(b.format)) || (b.date || '').localeCompare(a.date || ''))[0]);
  const dropped = cands.filter(r => !picked.includes(r)); if (dropped.length) notes.push(`${dropped.length} format variants of a picked stem not read`);
  const total = picked.reduce((a, r) => a + (r.size || 0), 0);
  if (!HAND[d.id]?.files && (picked.length > MAX_STEMS || total > MAX_TOTAL)) {
    picked = picked.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 12);
    notes.push(`${byStem.size} stems, ${(total / 1e6).toFixed(0)} MB: the newest 12 taken (caps)`);
  }
  return { picked, notes, total: picked.reduce((a, r) => a + (r.size || 0), 0) };
}

// ---- cutting big polygons to the zone (Sutherland-Hodgman against the box, ring by ring)
const CLIP_VERTICES = 1000, CLIP_MARGIN = 500;
function clipRing(ring, B) {
  let out = ring.slice(0, -1);
  const edges = [[p => p[0] >= B[0], (a, b) => [B[0], a[1] + (b[1] - a[1]) * (B[0] - a[0]) / (b[0] - a[0])]], [p => p[0] <= B[2], (a, b) => [B[2], a[1] + (b[1] - a[1]) * (B[2] - a[0]) / (b[0] - a[0])]],
    [p => p[1] >= B[1], (a, b) => [a[0] + (b[0] - a[0]) * (B[1] - a[1]) / (b[1] - a[1]), B[1]]], [p => p[1] <= B[3], (a, b) => [a[0] + (b[0] - a[0]) * (B[3] - a[1]) / (b[1] - a[1]), B[3]]]];
  for (const [inside, cut] of edges) {
    const inp = out; out = []; if (!inp.length) break;
    for (let i = 0; i < inp.length; i++) { const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b)); }
  }
  return out.length >= 3 ? [...out, out[0]] : null;
}
function clipBig(f) {
  const g = f.geom; if (!g || !/Polygon/.test(g.type)) return g;
  let n = 0; const count = c => typeof c[0] === 'number' ? n++ : c.forEach(count); count(g.coordinates); if (n <= CLIP_VERTICES) return g;
  const m = f.srs === 4326 ? CLIP_MARGIN / 70000 : CLIP_MARGIN;
  const B = f.srs === 4326 ? [ZW[0] - m, ZW[1] - m * 0.6, ZW[2] + m, ZW[3] + m * 0.6] : [ZB[0] - m, ZB[1] - m, ZB[2] + m, ZB[3] + m];
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(rings => rings.map(r => clipRing(r, B))).filter(rs => rs[0]).map(rs => rs.filter(Boolean));
  if (!polys.length) return g;
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}

// ---- zone tests on a table
const HDR = {
  lat: /^(lat|latitude|lat_?wgs84|wgs84_?lat|y_?lat|point_?y_?wgs84)$/i, lon: /^(lon|long|lng|longitude|long_?wgs84|wgs84_?lon(g)?|x_?lon(g)?)$/i,
  e: /^(x|easting|eastings|east|x_?coord(inate)?|os_?x|bng_?x|geo_?x|grid_?ref_?e(asting)?|xcoord|x_?bng|location_?easting|easting_?osgr|easting_?m|easting_?rounded)$/i,
  n: /^(y|northing|northings|north|y_?coord(inate)?|os_?y|bng_?y|geo_?y|grid_?ref_?n(orthing)?|ycoord|y_?bng|location_?northing|northing_?osgr|northing_?m|northing_?rounded)$/i,
  uprn: /uprn/i, toid: /\btoid\b/i, sector: /sector/i,
};
const PC_RE = /^([A-Z]{1,2}\d[A-Z\d]?) ?(\d[A-Z]{2})$/, SECTOR_RE = /^([A-Z]{1,2}\d[A-Z\d]?) ?(\d)$/;
const ANY_AREA = /^(E0[0125]\d{6}|E36\d{6}|E09\d{6}|E12\d{6}|E92000001|E1[0-3]\d{6})$/;
const ZB = [ZONE_BNG.e0, ZONE_BNG.n0, ZONE_BNG.e1, ZONE_BNG.n1], ZW = ZONE_WGS84;
function colsOf(row) {
  const c = {}; (row || []).forEach((h, j) => { const t = String(h ?? '').trim(); for (const k of Object.keys(HDR)) if (c[k] == null && HDR[k].test(t)) c[k] = j; });
  return c;
}
const hasXY = c => (c.lat != null && c.lon != null) || (c.e != null && c.n != null);
function xyOf(row, c) {
  for (const [a, b] of [['lon', 'lat'], ['e', 'n']]) {
    if (c[a] == null || c[b] == null) continue;
    const x = +row[c[a]], y = +row[c[b]]; if (!isFinite(x) || !isFinite(y) || !x || !y) continue;
    return Math.abs(x) <= 180 && Math.abs(y) <= 90 ? { x, y, srs: 4326 } : { x, y, srs: 27700 };
  }
  return null;
}
// thinning a regular grid of cell size g metres (BNG): keep 1 cell in 5 each way (a 5g grid)
const thinKeep = (p, g) => p.srs !== 27700 || (Math.floor(p.x / g) % 5 === 0 && Math.floor(p.y / g) % 5 === 0);
const inZone = p => p.srs === 4326 ? p.x >= ZW[0] && p.x <= ZW[2] && p.y >= ZW[1] && p.y <= ZW[3] : p.x >= ZB[0] && p.x <= ZB[2] && p.y >= ZB[1] && p.y <= ZB[3];
// the zone key of a row, or null. ctx: { cols, wardLevel }
function zoneKey(row, ctx) {
  const R = refs(), c = ctx.cols;
  if (CUR_ALL) return 'whole dataset';
  if (ctx.grid) { const m = ctx.grid.exec(String(row[0] ?? '')); if (m) { const p = { x: +m[1], y: +m[2], srs: 27700 }; ctx.xyRows++; return inZone(p) && (!ctx.thin || thinKeep(p, ctx.thin)) ? 'grid' : null; } }
  if (hasXY(c)) { const p = xyOf(row, c); if (p) { ctx.xyRows++; if (inZone(p) && (!ctx.thin || thinKeep(p, ctx.thin))) return 'xy'; } }
  if (c.uprn != null) { const v = String(row[c.uprn] ?? '').trim().replace(/\.0+$/, ''); if (/^\d{1,12}$/.test(v) && R.uprn.has(v)) return 'uprn:' + v; }
  if (c.toid != null) { const v = String(row[c.toid] ?? '').trim().replace(/^(osgb)?/i, 'osgb'); if (R.toid.has(v)) return 'toid'; }
  for (let j = 0; j < row.length; j++) {
    const v = row[j]; if (typeof v !== 'string' || v.length > 12 || v.length < 4) continue;
    const s = v.trim().toUpperCase();
    if (/^E(0[0125]|36)\d{6}$/.test(s)) { const t = R.code.get(s); if (t) return `${t.replace(/\d+$/, '')}:${s}`; if (s.startsWith('E05')) ctx.wardLevel = true; continue; }
    if (OLD_WARD.test(s)) { if (R.code.get(s) === 'ward2003') return 'ward2003:' + s; continue; }
    if (s === 'E09000001' && ctx.wardLevel) return 'city:E09000001';
    if (ctx.pcCols?.has(j)) { const m = PC_RE.exec(s); if (m && R.pcs.has(m[1] + m[2])) return 'postcode:' + m[1] + ' ' + m[2]; }
    if (ctx.secCols?.has(j)) { const k = sectorOf(s); if (k && R.sectors.has(k)) return 'sector:' + k; }
  }
  // names (only in datasets about town centres or stations, where no code exists): a cell that is a zone name
  if (ctx.names) for (const v of row) { if (typeof v !== 'string' || v.length > 60) continue; const k = ctx.names.get(normName(v)); if (k) return k; }
  return null;
}
const normName = v => v.toLowerCase().replace(/&/g, ' and ').replace(/\b(dlr|underground|rail|tube|overground|elizabeth line|tram|station|stn|lu|nr|town centre|district centre|major centre)\b/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
let ZN = null;
function zoneNameMap(kind) {
  ZN ||= existsSync(join(OUT, 'zone-names.json')) ? readJson(join(OUT, 'zone-names.json')) : null; if (!ZN) return null;
  // a name that is also a borough name (Greenwich) would match every row of that borough's column: left out
  const BORO = new Set(['greenwich', 'lewisham', 'southwark', 'newham', 'tower hamlets', 'city of london', 'city', 'hackney', 'lambeth']);
  const m = new Map(); for (const k of kind === 'stations' ? ['stations'] : ['town_centres', 'opportunity_areas']) for (const n of ZN[k] || []) if (!BORO.has(normName(n)) && !m.has(normName(n))) m.set(normName(n), (k === 'stations' ? 'station:' : k === 'town_centres' ? 'town-centre:' : 'opportunity-area:') + n); return m;
}
const OLD_WARD = /^\d\d[A-Z]{4}$/;
// a postcode sector: "E14 9" or "E149" (outward code + one digit)
const sectorOf = s => { const m = SECTOR_RE.exec(s) || /^([A-Z]{1,2}\d[A-Z\d]?)(\d)$/.exec(s); return m ? m[1] + ' ' + m[2] : null; };
// which columns hold postcodes or postcode sectors: half or more of the non-empty cells of the first 300 data rows
// (at least 3) are well-formed, or the header names it. A postcode found elsewhere (a product code "RM66LE" that reads
// as a postcode) does not count (found 2026-10-04 in the consumer expenditure workbooks).
function profileCols(rows, header) {
  const pc = new Map(), sec = new Map(), nn = new Map(); const pcCols = new Set(), secCols = new Set();
  for (const r of rows.slice(0, 300)) (r || []).forEach((v, j) => {
    if (v == null || v === '') return; nn.set(j, (nn.get(j) || 0) + 1);
    const s = String(v).trim().toUpperCase();
    if (PC_RE.test(s)) pc.set(j, (pc.get(j) || 0) + 1); else if (sectorOf(s)) sec.set(j, (sec.get(j) || 0) + 1);
  });
  for (const [j, n] of pc) if (n >= 3 && n >= nn.get(j) / 2) pcCols.add(j);
  for (const [j, n] of sec) if (n >= 3 && n >= nn.get(j) / 2) secCols.add(j);
  (header || []).forEach((h, j) => { const t = String(h ?? ''); if (/post ?code|postal|^pcds?$|^pcd\d?$/i.test(t) && !/sector|district|area/i.test(t)) pcCols.add(j); if (/sector/i.test(t)) secCols.add(j); });
  return { pcCols, secCols };
}
const isDataRow = (row, c) => (row || []).some(v => typeof v === 'string' && (ANY_AREA.test(v.trim()) || OLD_WARD.test(v.trim()) || PC_RE.test(v.trim().toUpperCase()) || /^[A-Z]{1,2}\d[A-Z\d]? ?\d$/.test(v.trim().toUpperCase()))) || (hasXY(c) && !!xyOf(row, c));
const sig6 = v => Number.isInteger(v) ? v : +v.toPrecision(6);
function normCell(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? sig6(v) : null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return normCell(v.result);
    if (v.richText) return v.richText.map(t => t.text).join('');
    if ('text' in v) return String(v.text);
    if (v.error) return null;
    return String(v);
  }
  const s = String(v); if (s === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(s) && !/^-?0\d/.test(s) && s.length < 16) return sig6(+s);
  return s;
}

// the zone key of a cell that is an area code (codes only), or null
function codeKey(v) { if (typeof v !== 'string') return null; const s = v.trim().toUpperCase(); const t = refs().code.get(s); return t && /^(E(0[0125]|36)\d{6}|\d\d[A-Z]{4})$/.test(s) ? `${t.replace(/\d+$/, '')}:${s}` : null; }
// a table (array of row arrays) -> { header_rows, rows, zone_keys, n } of the zone rows
function filterTable(all, name) {
  // transposed: area codes across a row (3 or more in one of the first 15 rows): keep the label columns and the zone code columns
  for (let i = 0; i < Math.min(15, all.length); i++) {
    const r = all[i] || [], codeCols = r.map((v, j) => typeof v === 'string' && (ANY_AREA.test(v.trim()) || OLD_WARD.test(v.trim())) ? j : -1).filter(j => j >= 0);
    // a header of codes: 3 or more distinct codes, and below them numbers (a data row holding codes in a few cells is not one)
    const below = all.slice(i + 1, i + 12).filter(x => x && x.some(v => v != null && v !== ''));
    const numericBelow = codeCols.filter(j => below.length && below.filter(x => typeof x[j] === 'number').length >= below.length * .6).length;
    if (new Set(codeCols.map(j => r[j])).size < 3 || numericBelow < codeCols.length * .8) continue;
    const zc = codeCols.filter(j => codeKey(r[j])); if (!zc.length) return { name, n: all.length - i - 1, rows: [], zone_keys: [], header_rows: [], transposed: true };
    const keep = [...Array(codeCols[0]).keys(), ...zc], sub = x => keep.map(j => normCell((x || [])[j]));
    return { name, transposed: true, n: all.length - i - 1, header_rows: all.slice(Math.max(0, i - 3), i + 1).map(sub), rows: all.slice(i + 1).filter(x => x && x.some(v => v != null && v !== '')).map(sub), zone_keys: zc.map(j => 'column ' + codeKey(r[j])), cols: {} };
  }
  let hi = -1, cols = {};
  for (let i = 0; i < Math.min(30, all.length); i++) { const c = colsOf(all[i]); if (hasXY(c) || c.uprn != null || c.toid != null || c.sector != null) { hi = i; cols = c; break; } }
  let first = all.findIndex((r, i) => i > hi && isDataRow(r, cols));
  // a table keyed by names only (stations, town centres): data starts at the first row with a text cell and a number
  if (first < 0 && (CUR_NAMES || CUR_ALL)) first = all.findIndex((r, i) => i > hi && (r || []).some(v => typeof v === 'string' && v.trim()) && (r || []).some(v => typeof v === 'number'));
  if (first < 0) return { name, n: all.length, rows: [], zone_keys: [], header_rows: [], nodata: true };
  const ctx = { cols, wardLevel: all.slice(first, first + 5000).some(r => (r || []).some(v => typeof v === 'string' && /^E05\d{6}$/.test(v.trim()))), xyRows: 0, thin: CUR_THIN, grid: CUR_GRID, names: CUR_NAMES,
    ...profileCols(all.slice(first), all[first - 1]) };
  const rows = [], keys = [];
  for (let i = first; i < all.length; i++) { const r = (all[i] || []).map(normCell); const k = zoneKey(r, ctx); if (k) { rows.push(r); keys.push(k); } }
  const header_rows = hi >= 0 && hi < first ? all.slice(hi, first) : all.slice(Math.max(0, first - 4), first);
  return { name, n: all.length - first, rows, zone_keys: keys, header_rows: header_rows.map(r => (r || []).map(normCell)), cols, xyRows: ctx.xyRows };
}

// ---- readers
let XLSX = null, ExcelJS = null, CUR_THIN = null, CUR_GRID = null, CUR_NAMES = null, CUR_SHEETS = null, CUR_ALL = false;
async function sheetsOf(file, label, size) {
  const out = [];
  if (/\.(xlsx|xlsm)$/i.test(file) && size > KEEP_RAW) {
    // a large workbook: streamed (ExcelJS WorkbookReader), rows filtered on the way would lose the header context, so
    // the rows are kept per sheet as arrays; the zone filter runs per sheet (a sheet of a few 100k rows fits in memory)
    ExcelJS ||= (await import('exceljs')).default;
    const wb = new ExcelJS.stream.xlsx.WorkbookReader(file, { sharedStrings: 'cache', hyperlinks: 'ignore', worksheets: 'emit', styles: 'cache', entries: 'emit' });   // styles: dates come as Date only with the number formats
    for await (const ws of wb) {
      if (CUR_SHEETS && ws.name && !CUR_SHEETS.test(ws.name)) { for await (const row of ws) { } continue; }   // a sheet a hand rule leaves out (read through: the stream must be drained)
      const t = []; let k = 0;
      for await (const row of ws) { const v = row.values; const a = []; for (let i = 1; i < v.length; i++) a.push(v[i] === undefined ? null : v[i]); t.push(a); k++; }
      const f = filterTable(t, `${label}#${ws.name || 'sheet' + ws.id}`); out.push(f);
    }
    return out;
  }
  XLSX ||= (await import('xlsx'));
  const wb = XLSX.read(readFileSync(file), { type: 'buffer', dense: true, cellFormula: false, cellHTML: false, cellStyles: false, cellDates: true });
  for (const sn of wb.SheetNames) if (!CUR_SHEETS || CUR_SHEETS.test(sn)) out.push(filterTable(XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false }), `${label}#${sn}`));
  return out;
}
// CSV from a stream of text lines: the header is the first non-empty line; the rest filtered row by row
async function csvLines(lines, label, sep = ',') {
  let header = null, cols = {}, n = 0; const rows = [], keys = []; const ctx = { cols, wardLevel: false, xyRows: 0, thin: CUR_THIN, grid: CUR_GRID, names: CUR_NAMES };
  let pending = [];
  const flush = () => { Object.assign(ctx, profileCols(pending, header)); for (const v of pending) { const r = v.map(normCell), k = zoneKey(r, ctx); if (k) { rows.push(r); keys.push(k); } } pending = null; };
  const split = sep === '\t' ? l => l.split('\t') : parseCsvLine;
  let buf = '';
  for await (let line of lines) {
    if (buf) { line = buf + '\n' + line; buf = ''; }
    if ((line.match(/"/g) || []).length % 2) { buf = line; continue; }            // a quoted field that holds a newline
    if (!line.trim()) continue;
    const v = split(line);
    if (!header) { header = v.map(x => x.trim()); Object.assign(cols, colsOf(header)); ctx.cols = cols; continue; }
    n++;
    if (!ctx.wardLevel && v.some(x => /^E05\d{6}$/.test(x))) ctx.wardLevel = true;
    // the first 300 rows are held until the postcode and sector columns are known
    if (pending) { pending.push(v); if (pending.length < 300) continue; flush(); continue; }
    const r = v.map(normCell), k = zoneKey(r, ctx); if (k) { rows.push(r); keys.push(k); }
  }
  if (pending) flush();
  return [{ name: label, n, rows, zone_keys: keys, header_rows: header ? [header] : [], cols, xyRows: ctx.xyRows }];
}
const fileLines = f => createInterface({ input: createReadStream(f, { encoding: 'utf8' }), crlfDelay: Infinity });
const zipLines = (zip, entry) => createInterface({ input: spawn('unzip', ['-p', zip, entry]).stdout.setEncoding('utf8'), crlfDelay: Infinity });
// a stream from the network, nothing stored: lines through a pushable async iterator
async function urlLines(url, onLines) {
  const q = []; let rest = '', done = false, wake = null;
  const it = { [Symbol.asyncIterator]() { return { next: async () => { while (!q.length && !done) await new Promise(r => wake = r); return q.length ? { value: q.shift(), done: false } : { value: undefined, done: true }; } }; } };
  const consumer = onLines(it);
  const res = await politeStream(url, chunk => { rest += chunk; const p = rest.split(/\r?\n/); rest = p.pop(); for (const x of p) q.push(x); if (wake) { wake(); wake = null; } });
  if (rest) q.push(rest); done = true; if (wake) wake();
  return { res, tables: await consumer };
}

// one resource -> { tables: [...], geo: { layers, features } | null, notes }
async function readResource(d, r, label) {
  const url = r.url || `${BASE}/download/${d.id}/${r.id}/${r.file}`, name = decodeURIComponent(url.split('/').pop());
  const used = { resource: r.id, file: name, url, size: r.size, resource_date: r.date };
  const fmt = r.format;
  if (['csv', 'tsv', 'txt'].includes(fmt) && (r.size || 0) > KEEP_RAW) {           // streamed, never stored
    const { res, tables } = await urlLines(url, it => csvLines(it, name, fmt === 'tsv' ? '\t' : ','));
    return { used: { ...used, fetched: today, streamed: true, bytes: res.bytes }, tables, geo: null };
  }
  // a big zip: its central directory first (the last 256 kB by HTTP Range); a zip of documents only is not downloaded
  if (fmt === 'zip' && (r.size || 0) > 200e6) {
    const tail = await politeRange(url, r.size - 262144, r.size - 1), names = [];
    for (let i = 0; (i = tail.indexOf('PK\x01\x02', i, 'latin1')) >= 0; i += 46) { const n = tail.readUInt16LE(i + 28); names.push(tail.toString('latin1', i + 46, i + 46 + n)); }
    if (names.length && names.every(n => DOCS.test(n) || /\/$/.test(n))) return { used: { ...used, fetched: today, listed_by_range: true, entries: names.length }, tables: [], geo: null, docs: names.length, notes: [`${name}: ${names.length} entries, all documents (central directory read by HTTP Range; not downloaded)`] };
  }
  const raw = await rawFile(`${d.id}/${name}`, url);
  used.fetched = raw.fetched;
  const out = { used, tables: [], geo: null, notes: [] };
  try {
    if (fmt === 'gpkg') out.geo = await readGpkg(raw.file);
    else if (fmt === 'geojson' || (fmt === 'json' && /"FeatureCollection"/.test(readFileSync(raw.file, 'utf8').slice(0, 2000)))) {
      const j = readJson(raw.file); const crs = j.crs?.properties?.name || ''; const srs = /27700/.test(crs) ? 27700 : 4326;
      out.geo = { layers: [{ table: name, srs, crs }], features: j.features.map(f => ({ layer: name, srs, geom: f.geometry, props: f.properties || {} })) };
    }
    else if (['csv', 'tsv', 'txt'].includes(fmt)) out.tables = await csvLines(fileLines(raw.file), name, fmt === 'tsv' ? '\t' : ',');
    else if (['xlsx', 'xlsm', 'xls', 'ods'].includes(fmt)) out.tables = await sheetsOf(raw.file, name, statSync(raw.file).size);
    else if (fmt === 'zip') await readZip(raw.file, name, out);
    else out.notes.push(`${name}: format ${fmt} not read`);
  } finally {
    if (statSync(raw.file).size > KEEP_RAW) { rmSync(raw.file, { force: true }); out.used.cache = 'deleted after reading (over 20 MB)'; }
  }
  return out;
}
async function readZip(zip, label, out) {
  const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean).filter(n => !/__MACOSX|\/$|(^|\/)\./.test(n));
  out.used.entries = names.length;
  if (names.some(n => /\.shp$/i.test(n))) { const g = readShpZip(zip, { skipBad: true }); if (g.features.length) out.geo = g; }
  const tmp = join(RAWDIR, '_tmp'); mkdirSync(tmp, { recursive: true });
  for (const n of names) {
    const e = (/\.([a-z0-9]+)$/i.exec(n)?.[1] || '').toLowerCase(), lab = `${label}/${n}`;
    try {
      if (e === 'gpkg' || e === 'geojson' || ['xlsx', 'xlsm', 'xls', 'ods'].includes(e)) {
        const t = join(tmp, 'entry.' + e); execFileSync('sh', ['-c', 'unzip -p "$0" "$1" > "$2"', zip, n.replace(/([\[\]*?])/g, '\\$1'), t]);
        if (e === 'gpkg') { const g = await readGpkg(t); out.geo = out.geo ? { layers: [...out.geo.layers, ...g.layers], features: [...out.geo.features, ...g.features] } : g; }
        else if (e === 'geojson') { const j = readJson(t); const srs = /27700/.test(j.crs?.properties?.name || '') ? 27700 : 4326; const g = { layers: [{ table: n, srs }], features: j.features.map(f => ({ layer: n, srs, geom: f.geometry, props: f.properties || {} })) }; out.geo = out.geo ? { layers: [...out.geo.layers, ...g.layers], features: [...out.geo.features, ...g.features] } : g; }
        else out.tables.push(...await sheetsOf(t, lab, statSync(t).size));
        rmSync(t, { force: true });
      } else if (['csv', 'tsv', 'txt'].includes(e)) out.tables.push(...await csvLines(zipLines(zip, n.replace(/([\[\]*?])/g, '\\$1')), lab, e === 'tsv' ? '\t' : ','));
      else if (e === 'zip') out.notes.push(`${lab}: a zip inside the zip, not opened`);
      else if (DOCS.test(n)) out.docs = (out.docs || 0) + 1;
    } catch (err) { out.notes.push(`${lab}: ${err.message.slice(0, 120)}`); }
  }
}

// ---- one dataset
const DOCS = /\.(pdf|docx?|pptx?|rtf|html?|jpe?g|png|gif|tiff?|svg|mp[34]|wav|txt|md)$/i;
// LDS_HARVEST_LOG: write the log elsewhere while a long run goes on (the committed file is then made per batch)
const LOG = process.env.LDS_HARVEST_LOG || join(OUT, 'harvest-log.json');
export function loadLog() { return existsSync(LOG) ? readJson(LOG) : { meta: {}, datasets: {} }; }
function saveLog(L) {
  L.meta = { made: today, tool: 'tools/lds-harvest-auto.mjs', rules: AUTO_RULES, counts: {} };
  for (const v of Object.values(L.datasets)) L.meta.counts[v.outcome] = (L.meta.counts[v.outcome] || 0) + 1;
  writeFileSync(LOG, '{"meta":' + JSON.stringify(L.meta, null, 1) + ',\n"datasets":{\n' + Object.entries(L.datasets).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + '\n}}\n');
}
const baseKey = d => { let s = d.slug.replace(new RegExp('-' + d.id + '$'), '').replace(/^the-/, ''); if (s.length > 48) s = s.slice(0, 48).replace(/-[^-]*$/, ''); return s; };
let SHARED = null;
// the folder name: the slug without the id, cut at 48 characters; when two catalogue datasets would share it (the LAEI
// series, the London Plan 2009 and consolidated point layers), the id is added: they overwrote each other's folder once
export function keyOf(d) {
  if (!SHARED) { const n = new Map(); for (const x of readJson(join(OUT, 'catalogue.json')).datasets) { const k = baseKey(x); n.set(k, (n.get(k) || 0) + 1); } SHARED = new Set([...n].filter(([, v]) => v > 1).map(([k]) => k)); }
  const k = baseKey(d); return SHARED.has(k) ? `${k}-${d.id}` : k;
}
async function runDataset(d, T, L) {
  if (OWNER_HOLD[d.id]) { L.datasets[d.id] = { title: d.title, outcome: 'held-for-owner', reason: OWNER_HOLD[d.id], date: today }; return; }
  if (!T.open || T.sensitive) throw new Error(`${d.id} is not open or is sensitive`);
  const plan = planDataset(d), key = HAND[d.id]?.key || keyOf(d);
  if (plan.skip) { L.datasets[d.id] = { title: d.title, key, outcome: HAND[d.id].outcome || 'not-readable', reason: plan.skip, date: today }; return; }
  const parts = [], notes = [...plan.notes];
  CUR_THIN = HAND[d.id]?.thin || null; CUR_GRID = HAND[d.id]?.grid || null; CUR_SHEETS = HAND[d.id]?.sheets || null; CUR_ALL = !!HAND[d.id]?.allRows;
  // name keys: only for datasets whose geography is town centres or stations (the metadata or the title says so)
  CUR_NAMES = d.geo === 'Town Centres' || /town centre|London Plan AMR/i.test(d.title) ? zoneNameMap('town_centres') : d.geo === 'Train Stations' || /\bstation|underground|signals passed/i.test(d.title) ? zoneNameMap('stations') : null;
  if (CUR_NAMES) notes.push(`name keys: ${CUR_NAMES.size} zone ${/station/.test([...CUR_NAMES.values()][0]) ? 'station' : 'town centre'} names (zone-names.json); a cell equal to one (normalised) is a zone row, a weaker key than a code`);
  if (HAND[d.id]?.why) notes.unshift('hand rule: ' + HAND[d.id].why);
  for (const r of plan.picked) {
    try { const p = await readResource(d, r, r.file); parts.push({ r, ...p }); notes.push(...(p.notes || [])); }
    catch (e) { notes.push(`${r.file}: ${e.message.slice(0, 160)}`); }
  }
  // a thinned 20 m grid: geometry cells kept by the BNG centre of their bounding box
  if (CUR_THIN) for (const p of parts) if (p.geo) { const n0 = p.geo.features.length; p.geo.features = p.geo.features.filter(f => { if (!f.geom || f.srs !== 27700) return true; const b = bboxOfG(f.geom); return thinKeep({ x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, srs: 27700 }, CUR_THIN); }); notes.push(`${p.used.file}: grid thinned to 1 cell in 25 (${n0} -> ${p.geo.features.length} features)`); }
  // hand rules: layers left out (held elsewhere, or a better source exists)
  if (HAND[d.id]?.dropLayers) for (const p of parts) if (p.geo) { const n0 = p.geo.features.length; p.geo.features = p.geo.features.filter(f => !HAND[d.id].dropLayers.test(f.layer)); if (n0 !== p.geo.features.length) notes.push(`${p.used.file}: ${n0 - p.geo.features.length} features of layers ${HAND[d.id].dropLayers} left out (hand rule)`); }
  // big polygons (a London-wide boundary that holds the zone): cut to the zone box plus 500 m, so the file stays small
  for (const p of parts) if (p.geo) { let k = 0; p.geo.features = p.geo.features.map(f => { const g = clipBig(f); if (g !== f.geom) { k++; return { ...f, geom: g, props: { ...f.props, clipped_to_zone: true } }; } return f; }); if (k) notes.push(`${p.used.file}: ${k} polygons with over ${CLIP_VERTICES} vertices cut to the zone box plus ${CLIP_MARGIN} m (clipped_to_zone)`); }
  // tables whose one header row names coordinate columns -> points
  const geoParts = parts.filter(p => p.geo && p.geo.features.length).map(p => ({ r: p.r, used: p.used, geo: p.geo }));
  const tables = [];
  for (const p of parts) for (const t of p.tables || []) {
    if (hasXY(t.cols || {}) && t.header_rows.length === 1 && t.xyRows > 0 && !HAND[d.id]?.asTable) {
      const h = t.header_rows[0].map((x, i) => String(x ?? 'col' + i));
      // rows kept by their coordinates become points; rows kept by another key (a postcode) with no usable coordinates stay a table
      const feats = [], rest = { ...t, rows: [], zone_keys: [] };
      t.rows.forEach((row, i) => { const c = xyOf(row, t.cols); if (c && t.zone_keys[i] === 'xy') feats.push({ layer: t.name, srs: c.srs, geom: { type: 'Point', coordinates: [c.x, c.y] }, props: Object.fromEntries(h.map((k, j) => [k, row[j] ?? null])) }); else { rest.rows.push(row); rest.zone_keys.push(t.zone_keys[i]); } });
      if (rest.rows.length) tables.push(rest);
      const g = geoParts.find(x => x.r === p.r);
      const add = { layers: [{ table: t.name, srs: 'per row', columns: Object.entries(t.cols).filter(([k]) => ['lat', 'lon', 'e', 'n'].includes(k)).map(([, i]) => h[i]), rows_read: t.n }], features: feats };
      if (g) { g.geo.layers.push(...add.layers); for (const f of feats) g.geo.features.push(f); } else geoParts.push({ r: p.r, used: p.used, geo: add, fromTable: true });
    } else tables.push(t);
  }
  const files = [], counts = {};
  const metaCommon = { harvest_rules: 'tools/lds-harvest-auto.mjs AUTO_RULES (feeds/london-datastore/harvest-log.json meta.rules)', selection_notes: notes };
  if (geoParts.length) {
    const H = { id: d.id, fmt: 'auto', theme: (T.themes || [])[0] || null, all: true,
      rawFile: async r => ({ fetched: geoParts.find(g => g.r === r).used.fetched }), reader: async (f, n, r) => geoParts.find(g => g.r === r).geo,
      method: `lds-harvest-auto.mjs run ${d.id}: resources chosen by the written rules (harvest-log.json meta.rules: formats, dedupe, caps); every feature read (GeoPackage, GeoJSON, shapefile, or table rows with coordinate columns as points, the CRS judged per row by value); a feature is kept when it meets the zone (the 3D model box, BNG E ${ZONE_BNG.e0}-${ZONE_BNG.e1}, N ${ZONE_BNG.n0}-${ZONE_BNG.n1}): a vertex inside, an edge crossing or the box inside a polygon; whole geometries kept, whole_in_zone and in_cw added; WGS84 6 decimals through OSTN15; contact fields dropped.`,
      metaExtra: metaCommon };
    const res = geoParts.map(g => g.r);
    const [, , , c] = await harvestGeo(key, H, d, T, res);
    // the per-resource 'used' records of this module replace the walk tool's (streamed and deleted files say so)
    const gf = join(OUT, key, key + '.geojson'); const j = readJson(gf); j.meta.resources = geoParts.map(g => g.used);
    const tr = j.meta.layers.filter(l => l.rows_read != null); if (tr.length) { j.meta.counts.table_rows_read = tr.reduce((a, l) => a + l.rows_read, 0); j.meta.counts.note = 'features made from table rows: source_features counts the zone rows only; table_rows_read counts every row read'; }
    // a hand rule may round the output to 5 decimals (about 1 m) for large polygon layers
    if (HAND[d.id]?.decimals) { const k = 10 ** HAND[d.id].decimals, rd = c => typeof c[0] === 'number' ? c.map(v => Math.round(v * k) / k) : c.map(rd); for (const f of j.features) if (f.geometry?.coordinates) f.geometry.coordinates = rd(f.geometry.coordinates); j.meta.crs_output += `; rounded to ${HAND[d.id].decimals} decimals by a hand rule`; }
    // a hand rule may thin vertices: a vertex closer than s metres to the last kept one is dropped (rings keep 4 or more)
    if (HAND[d.id]?.simplify) { const sm = HAND[d.id].simplify, mx = 1 / (111320 * Math.cos(51.5 * Math.PI / 180)), my = 1 / 110540;
      const thinLine = (r, closed) => { if (r.length <= (closed ? 4 : 2)) return r; const o = [r[0]]; for (let i = 1; i < r.length - 1; i++) { const q = o[o.length - 1]; if (Math.hypot((r[i][0] - q[0]) / mx, (r[i][1] - q[1]) / my) >= sm) o.push(r[i]); } o.push(r[r.length - 1]); return closed && o.length < 4 ? r : o; };
      const sg = g => g.type === 'Polygon' ? { ...g, coordinates: g.coordinates.map(r => thinLine(r, true)) } : g.type === 'MultiPolygon' ? { ...g, coordinates: g.coordinates.map(p => p.map(r => thinLine(r, true))) } : g.type === 'LineString' ? { ...g, coordinates: thinLine(g.coordinates, false) } : g.type === 'MultiLineString' ? { ...g, coordinates: g.coordinates.map(r => thinLine(r, false)) } : g;
      for (const f of j.features) if (f.geometry) f.geometry = sg(f.geometry); j.meta.crs_output += `; vertices closer than ${sm} m to the previous kept vertex dropped by a hand rule`; }
    if (!c.in_zone) rmSync(gf); else { writeFileSync(gf, '{"type":"FeatureCollection","meta":' + JSON.stringify(j.meta, null, 1) + ',\n"features":[\n' + j.features.map(f => JSON.stringify(f)).join(',\n') + '\n]}\n'); files.push(`${key}/${key}.geojson`); }
    counts.features_read = c.source_features + (j.meta.counts.table_rows_read ? j.meta.counts.table_rows_read - c.source_features : 0); counts.features_in_zone = c.in_zone; counts.in_cw = c.in_cw;
  }
  const zt = tables.filter(t => t.rows.length);
  counts.tables_read = tables.length; counts.rows_read = tables.reduce((a, t) => a + t.n, 0); counts.zone_rows = zt.reduce((a, t) => a + t.rows.length, 0);
  if (zt.length) {
    const by = {}; for (const t of zt) for (const k of t.zone_keys) { const ty = k.split(':')[0]; by[ty] = (by[ty] || 0) + 1; }
    counts.zone_rows_by_key = by;
    const lic = d.licence, licUrl = readJson(join(OUT, 'catalogue.json')).meta.licence_urls[lic] || null;
    const dropCols = new Set();
    for (const t of zt) {                                             // contact columns (single header row tables)
      const h = t.header_rows[t.header_rows.length - 1] || []; const drop = h.map((x, i) => DROP_FIELD.test(String(x ?? '')) ? i : -1).filter(i => i >= 0);
      if (drop.length) { drop.forEach(i => dropCols.add(String(h[i]))); const keep = (r) => r.filter((_, i) => !drop.includes(i)); t.header_rows = t.header_rows.map(keep); t.rows = t.rows.map(keep); }
    }
    const meta = {
      source: `London Datastore: ${d.title} (${d.publisher})`, dataset: d.id, page: `${BASE}/dataset/${d.slug}`,
      resources: parts.filter(p => (p.tables || []).length).map(p => p.used), licence: lic, licence_url: licUrl,
      attribution: (T.licence === 'ogl' ? `Contains public sector information licensed under the ${lic} (${d.publisher}).` : `${d.publisher}, ${lic}.`) + ' The GLA cannot warrant the quality or accuracy of the data (London Datastore terms).',
      dataset_modified: d.modified, update_frequency: d.update_frequency, geo: d.geo, theme: (T.themes || [])[0] || null,
      method: `lds-harvest-auto.mjs run ${d.id}: resources chosen by the written rules; every row of every sheet or CSV read (CSV over 20 MB streamed and not stored; large xlsx streamed with ExcelJS); a row is kept when it is a zone row (harvest-log.json meta.rules.zone_row): zone OA/LSOA/MSOA/ward code, zone postcode or postcode sector, zone UPRN or TOID, or coordinates in the 3D model box. zone_keys gives the key that matched, row by row. header_rows: the rows above the first data row.`,
      ...metaCommon, ...(dropCols.size ? { columns_dropped: [...dropCols], columns_dropped_why: 'contact details' } : {}),
      counts: { tables_read: tables.length, rows_read: counts.rows_read, zone_rows: counts.zone_rows, zone_rows_by_key: by },
    };
    const dir = join(OUT, key); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, key + '.json'), '{"meta":' + JSON.stringify(meta, null, 1) + ',\n"tables":[\n' + zt.map(t => JSON.stringify({ table: t.name, rows_read: t.n, header_rows: t.header_rows }).slice(0, -1) + ',"zone_keys":' + JSON.stringify(t.zone_keys) + ',"rows":[\n' + t.rows.map(r => JSON.stringify(r)).join(',\n') + '\n]}').join(',\n') + '\n]}\n');
    files.push(`${key}/${key}.json`);
  }
  const bytes = files.reduce((a, f) => a + statSync(join(OUT, f)).size, 0);
  // no zone rows in the files a hand rule chose is not evidence about the files it left out: deferred by hand, with both
  let outcome0 = files.length ? 'harvested' : parts.some(p => p.geo || (p.tables || []).length) ? 'no-zone-rows' : parts.length && parts.every(p => p.docs && !p.geo && !(p.tables || []).length) ? 'documents-only' : 'not-readable';
  const outcome = outcome0 === 'no-zone-rows' && HAND[d.id]?.files ? 'deferred-by-hand' : outcome0;
  const evidence = outcome0 === 'no-zone-rows' ? `read ${counts.features_read || 0} features and ${counts.rows_read} rows in ${counts.tables_read} tables (${parts.map(p => p.used.file).join(', ')}); no feature meets the zone box and no row carries a zone code, postcode, UPRN, TOID or zone coordinates`
    : outcome === 'documents-only' ? `the machine-readable resources are zips of documents only (${parts.map(p => `${p.used.file}: ${p.docs} documents`).join('; ')})`
    : outcome === 'not-readable' ? `no resource could be read: ${notes.join('; ').slice(0, 400) || 'no table, sheet or geometry found in ' + parts.map(p => p.used.file).join(', ')}` : undefined;
  L.datasets[d.id] = { title: d.title, key, outcome, ...(outcome !== outcome0 ? { reason: `${HAND[d.id].why}; the files read hold no zone rows` } : {}), files, bytes, counts, resources: parts.map(p => ({ file: p.used.file, size: p.r.size, date: p.r.date })), notes, ...(evidence ? { evidence } : {}), date: today };
  console.log(d.id, key, outcome, JSON.stringify(counts), (bytes / 1e3).toFixed(0) + ' kB');
}

export async function autoHarvest(argv) {
  const sub = argv[0], ids = argv.slice(1).filter(a => !a.startsWith('--'));
  const cat = new Map(readJson(join(OUT, 'catalogue.json')).datasets.map(d => [d.id, d]));
  const tri = readJson(join(OUT, 'triage.json'));
  let list = ids.length ? ids : tri.meta.ranked.filter(id => tri.datasets[id].state === 'listed-for-harvest');
  const rk = argv.indexOf('--rank'); if (rk >= 0) { const [a, b] = argv[rk + 1].split('-').map(Number); list = tri.meta.ranked.filter(id => tri.datasets[id].state === 'listed-for-harvest').slice(a - 1, b); }
  if (sub === 'plan') {
    for (const id of list) { const d = cat.get(id), p = planDataset(d); console.log(id, (p.total / 1e6 || 0).toFixed(1) + ' MB', p.skip || p.picked.map(r => `${r.format}:${decodeURIComponent(r.file || '').slice(0, 50)}(${((r.size || 0) / 1e6).toFixed(1)})`).join(' '), p.notes?.length ? '| ' + p.notes.join('; ') : '', '|', d.title.slice(0, 50)); }
    return;
  }
  if (sub === 'register') return register(cat);
  if (sub === 'index') return writeIndex(cat, tri);
  if (sub === 'zone-names') return zoneNames();
  if (sub !== 'run') throw new Error('plan|run|register [id ...] [--rank a-b]');
  const L = loadLog();
  for (const id of list) {
    const d = cat.get(id); if (!d) throw new Error('unknown dataset ' + id);
    if (L.datasets[id] && !argv.includes('--again')) { console.log(id, 'done before:', L.datasets[id].outcome); continue; }
    try { await runDataset(d, tri.datasets[id], L); } catch (e) { console.error(id, 'FAILED', e.stack?.split('\n').slice(0, 3).join(' | ')); L.datasets[id] = { title: d.title, outcome: 'not-readable', reason: 'harvest error: ' + e.message.slice(0, 300), date: today }; }
    saveLog(L);
    rmSync(join(RAWDIR, '_tmp'), { recursive: true, force: true });
  }
}


// ---- register: one source line lds-<id> and one file line per output in data-register.json; the activity in pipeline.json
const LIC = { 'Open Government Licence v3': 'OGL v3.0', 'Open Government Licence v2': 'OGL v2.0', 'Creative Commons Attribution': 'CC BY (version not stated by the Datastore)', 'Creative Commons Attribution 4.0': 'CC BY 4.0', 'Open Data Commons Attribution License': 'ODC-By 1.0', 'Public Domain': 'Public Domain', 'Open Data Commons Public Domain Dedication and License (PDDL)': 'PDDL' };
function register(cat) {
  const L = loadLog(), CWD = CW;   // data-register.json and pipeline.json stay here; OUT is in the londat checkout
  const regFile = join(CWD, 'data-register.json'); let lines = readFileSync(regFile, 'utf8').split('\n');
  const upsert = (key, line, anchor) => {            // key: a string that only that line holds; anchor: insert after the last line matching it
    const i = lines.findIndex(l => l.includes(key));
    if (i >= 0) { lines[i] = line + (lines[i].trimEnd().endsWith(',') ? ',' : ''); return; }
    let j = -1; lines.forEach((l, k) => { if (anchor(l)) j = k; }); if (j < 0) throw new Error('no anchor for ' + key);
    if (!lines[j].trimEnd().endsWith(',')) lines[j] += ',';
    lines.splice(j + 1, 0, line + ',');
    // the last entry of an object or array must not end with a comma: fixed below by JSON.parse check
  };
  // lines this command wrote before for datasets or files that the log no longer has as harvested are removed
  const keepFiles = new Set(Object.values(L.datasets).filter(h => h.outcome === 'harvested').flatMap(h => h.files.map(f => `feeds/london-datastore/${f}`)));
  const autoIds = new Set(Object.keys(L.datasets).filter(id => L.datasets[id].outcome !== 'harvested'));
  if (process.env.LDS_FULL_LOG) for (const id of Object.keys(readJson(process.env.LDS_FULL_LOG).datasets)) if (L.datasets[id]?.outcome !== 'harvested') autoIds.add(id);
  lines = lines.filter(l => { const m = /"path":"(feeds\/london-datastore\/[^"]+)".*"produced_by":"tools\/lds-harvest-auto\.mjs run /.exec(l); if (m && !keepFiles.has(m[1])) return false; const s2 = /^\s+"lds-([a-z0-9]{5})": \{"name":"London Datastore /.exec(l); return !(s2 && autoIds.has(s2[1])); });
  const tidy = () => { for (let k = 0; k < lines.length - 1; k++) if (/,\s*$/.test(lines[k]) && /^\s*[\]}]/.test(lines[k + 1])) lines[k] = lines[k].replace(/,\s*$/, ''); };
  const pipeFile = join(CWD, 'pipeline.json'), pipe = readJson(pipeFile);
  const used = [{ file: 'feeds/london-datastore/triage.json' }, { file: 'feeds/london-datastore/catalogue.json' }, { file: 'feeds/london-datastore/zone-codes.json' }, { file: 'feeds/london-datastore/town-centres/town-centres.geojson' }, { file: 'feeds/london-datastore/opportunity-areas/opportunity-areas.geojson' },
    { source: 'tfl-stoppoint', endpoint: 'https://api.tfl.gov.uk/StopPoint', request: 'zone-names: lat/lon of 6 centres, stopTypes NaptanMetroStation,NaptanRailStation, radius 2000' }];
  const generated = [{ file: 'feeds/london-datastore/harvest-log.json' }, { file: 'feeds/london-datastore/zone-names.json' }, { file: 'feeds/london-datastore/index.json' }];
  let nSrc = 0, nFile = 0;
  for (const [id, h] of Object.entries(L.datasets).sort()) {
    if (h.outcome !== 'harvested') continue;
    const d = cat.get(id), page = `${BASE}/dataset/${d.slug}`;
    const lic = LIC[d.licence] || d.licence;
    const attribution = (/Open Government/.test(d.licence) ? `Contains public sector information licensed under the ${d.licence} (${d.publisher}).` : `${d.publisher}, ${lic}.`) + ' The GLA cannot warrant the quality or accuracy of the data.';
    upsert(`"lds-${id}": `, `    "lds-${id}": ${JSON.stringify({ name: `London Datastore ${id}: ${d.title} (${d.publisher})`, licence: `${lic} (London Datastore: "${d.licence}")`, url: page, attribution })}`, l => /^\s+"lds-[a-z0-9]{5}": \{/.test(l)); nSrc++;
    used.push({ source: `lds-${id}`, endpoint: `${BASE}/download/${id}/<resource id>/<file>`, request: `run ${id}: ${h.resources.length} resources chosen by the rules (${h.resources.map(r => r.file).join(', ').slice(0, 300)})` });
    for (const f of h.files) {
      const geo = f.endsWith('.geojson'), c = h.counts;
      const what = geo ? `${d.title}: ${c.features_in_zone} features that meet the 3D model box (of ${c.features_read} read)${c.in_cw ? `, ${c.in_cw} in the Canary Wharf box` : ''}; GeoJSON WGS84 with a meta member (rule-driven harvest)`
        : `${d.title}: ${c.zone_rows} zone rows of ${c.rows_read} in ${c.tables_read} tables (keys: ${Object.entries(c.zone_rows_by_key || {}).map(([k, v]) => `${k} ${v}`).join(', ')}); JSON tables with zone_keys and a meta member (rule-driven harvest)`;
      const sources = [`lds-${id}`, ...(geo ? ['os-ostn15'] : []), ...(!geo && Object.keys(c.zone_rows_by_key || {}).some(k => /postcode|sector|ward2003/.test(k)) ? ['onspd'] : []), ...(Object.keys(c.zone_rows_by_key || {}).some(k => /uprn|toid/.test(k)) ? ['os-open-uprn'] : [])];
      const path = `feeds/london-datastore/${f}`;
      upsert(`"path":"${path}"`, `    ${JSON.stringify({ path, hosted: 'londat', what, sources, osm: { use: 'none' }, produced_by: `tools/lds-harvest-auto.mjs run ${id}`, shown_on: [] })}`, l => l.includes('"path":"feeds/london-datastore/') || l.includes('"path": "feeds/london-datastore/')); nFile++;
      generated.push({ file: path });
    }
  }
  upsert('"path":"feeds/london-datastore/harvest-log.json"', `    ${JSON.stringify({ path: 'feeds/london-datastore/harvest-log.json', hosted: 'londat', what: 'outcome of the rule-driven harvest for every dataset run (harvested with files and counts, no zone rows with the evidence, not readable, documents only, by hand, held for the owner); its meta repeats the rules', sources: ['lds-catalogue', 'own'], osm: { use: 'none' }, produced_by: 'tools/lds-harvest-auto.mjs run', shown_on: [] })}`, l => l.includes('"path":"feeds/london-datastore/') || l.includes('"path": "feeds/london-datastore/'));
  upsert('"path":"feeds/london-datastore/index.json"', `    ${JSON.stringify({ path: 'feeds/london-datastore/index.json', hosted: 'londat', what: 'index of every London Datastore folder harvested to the zone (both harvest tools): title, theme, licence and credit, dates, files with counts and sizes, and the final-state counts of the triage; loaded first by the atlas view "London Datastore"', sources: ['lds-catalogue', 'own'], osm: { use: 'none' }, produced_by: 'tools/lds-harvest-auto.mjs index', shown_on: ['atlas/index.html'] })}`, l => l.includes('"path":"feeds/london-datastore/') || l.includes('"path": "feeds/london-datastore/'));
  tidy();
  JSON.parse(lines.join('\n'));                                       // still JSON
  writeFileSync(regFile, lines.join('\n'));
  const act = {
    id: 'lds-harvest-auto', tool: 'tools/lds-harvest-auto.mjs',
    command: 'node magpie/cwplans/tools/lds-harvest-auto.mjs plan [id ...]; NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/lds-harvest-auto.mjs run [id ...] [--rank a-b] [--again]; node magpie/cwplans/tools/lds-harvest-auto.mjs register',
    kind: 'fetch', used, generated,
    method: 'Harvests the London Datastore datasets that triage.json lists for harvest, by written rules instead of a hand table: picks the readable resources (one per file stem, best format, size caps, hand rules where the general rules would take too much or the wrong file), reads every row and feature (CSV streamed, large xlsx streamed with ExcelJS, xls/ods with SheetJS, GeoPackage, GeoJSON, shapefiles, zips entry by entry), keeps the zone rows (zone codes, postcodes and sectors in profiled columns, UPRNs, TOIDs, coordinates) and the features that meet the 3D model box, and records the outcome of every dataset in harvest-log.json; triage then states no-zone-rows datasets not relevant (F8b) and unreadable ones deferred (F10b).',
    rules: Object.entries(AUTO_RULES).map(([k, v]) => `${k}: ${v}`).concat(Object.entries(HAND).map(([k, v]) => `hand rule ${k}: ${v.why || v.skip}`), Object.entries(OWNER_HOLD).map(([k, v]) => `held for the owner ${k}: ${v}`)),
    network: true, deterministic: false, after: ['walk-london-datastore'], area: 'feeds',
    faults: FAULTS_SEEN,
    judgement: 'The hand rules (HAND in the tool) choose resources where the general rules would read too much or the wrong file (per-link emission workbooks, variant zips, superseded releases) and thin the LAEI 20 m concentration grids to 100 m; each has its reason. Datasets of incident records at addresses (LFB incidents, mobilisations, animal rescues) are held with the lift entrapments for the owner. Outputs were read by hand after each batch (counts, zone keys, sizes).',
  };
  const i = pipe.activities.findIndex(a => a.id === act.id);
  if (i >= 0) pipe.activities[i] = act; else pipe.activities.splice(pipe.activities.findIndex(a => a.id === 'walk-london-datastore') + 1, 0, act);
  writeFileSync(pipeFile, JSON.stringify(pipe, null, 2) + '\n');
  console.log(`register: ${nSrc} sources, ${nFile} files, activity lds-harvest-auto (${used.length} used, ${generated.length} generated)`);
}
const FAULTS_SEEN = ['F22', 'F27', 'F36', 'F37', 'F38', 'F39', 'F40', 'F41'];

// ---- zone names: the town centres that meet the box (town-centres harvest) and the stations in the box (TfL StopPoint)
async function zoneNames() {
  const tc = readJson(join(OUT, 'town-centres', 'town-centres.geojson')).features.map(f => f.properties.sitename || f.properties.name).filter(Boolean);
  const oa = readJson(join(OUT, 'opportunity-areas', 'opportunity-areas.geojson')).features.map(f => f.properties.sitename || f.properties.name || f.properties.NAME).filter(Boolean);
  const [W, S, E, N] = ZONE_WGS84, st = new Map(), q = [];
  for (const lon of [-0.0767, -0.04, -0.0033]) for (const lat of [51.486, 51.510]) {
    const url = `https://api.tfl.gov.uk/StopPoint?lat=${lat}&lon=${lon}&stopTypes=NaptanMetroStation,NaptanRailStation&radius=2000`; q.push(url);
    const j = JSON.parse(await politeFetch(url));
    for (const p of j.stopPoints || []) if (p.lon >= W && p.lon <= E && p.lat >= S && p.lat <= N) st.set(p.naptanId, { name: p.commonName.replace(/ (DLR|Underground|Rail|Elizabeth line) Station$/i, '').replace(/ Station$/i, '').replace(/ \(.*\)$/, '').trim(), modes: p.modes, lat: p.lat, lon: p.lon });
  }
  const names = [...new Set([...st.values()].map(s => s.name))].sort();
  const o = { meta: { made: today, tool: 'tools/lds-harvest-auto.mjs zone-names', what: 'names used as a weak zone key for datasets about town centres or stations (no codes): the town centres whose polygon meets the 3D model box, and the metro and rail stations whose NaPTAN point lies in it', sources: [{ name: 'town-centres harvest (London Datastore e55z7, GLA, OGL v3)', file: 'feeds/london-datastore/town-centres/town-centres.geojson' }, { name: 'opportunity-areas harvest (London Datastore epr7z, GLA, OGL v3)', file: 'feeds/london-datastore/opportunity-areas/opportunity-areas.geojson' }, { name: 'TfL Unified API StopPoint (stopTypes NaptanMetroStation, NaptanRailStation, radius 2,000 m, 6 centres)', url: 'https://api.tfl.gov.uk/StopPoint', requests: q, attribution: 'Powered by TfL Open Data', licence: 'TfL open data terms (OGL v2.0 based); facts only' }], counts: { town_centres: tc.length, opportunity_areas: oa.length, stations: names.length, stop_points: st.size } }, town_centres: tc, opportunity_areas: oa, stations: names };
  writeFileSync(join(OUT, 'zone-names.json'), JSON.stringify(o, null, 1) + '\n');
  console.log('zone-names', tc.length, 'town centres', names.length, 'stations');
}

// ---- index: one entry per harvested folder (both harvest tools), the small file the atlas and the 3D page load first
const THEME_NAMES = { 'buildings-places': 'Buildings, land and planning', 'people-housing': 'People, housing and census', environment: 'Environment, air and energy', transport: 'Transport', 'occupants-organisations': 'Occupants and organisations', 'events-works': 'Events and works', heritage: 'Heritage and views' };
function writeIndex(cat, tri) {
  const readdirSync = readdirSyncFs;
  const L = loadLog(), out = [];
  for (const key of readdirSync(OUT).sort()) {
    const dir = join(OUT, key); if (!statSync(dir).isDirectory()) continue;
    const files = readdirSync(dir).filter(f => /\.(geo)?json$/.test(f) && !/uprn-amendments/.test(f));
    if (!files.length) continue;
    let meta = null; const fl = [];
    for (const f of files) {
      const j = readJson(join(dir, f)); meta ||= j.meta;
      const geo = f.endsWith('.geojson'), types = geo ? [...new Set(j.features.map(x => x.geometry?.type).filter(Boolean))] : null;
      fl.push({ path: `feeds/london-datastore/${key}/${f}`, kind: geo ? 'geojson' : 'table', bytes: statSync(join(dir, f)).size, ...(geo ? { features: j.features.length, geometry: types, in_cw: j.features.filter(x => x.properties?.in_cw).length } : { rows: j.tables.reduce((a, t) => a + t.rows.length, 0), tables: j.tables.length }), ...(/uprn-amended/.test(f) ? { note: 'copy with amended UPRNs (F22)' } : {}) });
    }
    const id = meta.dataset, d = cat.get(id), T = tri.datasets[id] || {};
    if (meta.harvest_rules && L.datasets[id]?.outcome !== 'harvested') continue;   // a rule-driven folder not (yet) in the log
    const dates = (meta.resources || []).map(r => r.resource_date).filter(Boolean).sort();
    const theme = meta.theme || T.themes?.[0] || null;
    out.push({ key, dataset: id, title: d?.title || meta.source, publisher: d?.publisher || null, theme, theme_name: THEME_NAMES[theme] || 'Other datasets', geo: d?.geo || null,
      licence: meta.licence, licence_url: meta.licence_url, attribution: meta.attribution, page: meta.page, dataset_modified: (meta.dataset_modified || '').slice(0, 10) || null,
      resource_dates: dates.length ? [dates[0], dates.at(-1)] : null, fetched: (meta.resources || []).map(r => r.fetched).filter(Boolean).sort().at(-1) || null,
      tool: L.datasets[id]?.outcome === 'harvested' ? 'lds-harvest-auto.mjs' : 'walk-london-datastore.mjs harvest', files: fl });
  }
  const states = {}; for (const v of Object.values(tri.datasets)) states[v.state] = (states[v.state] || 0) + 1;
  const themes = {}; for (const x of out) themes[x.theme_name] = (themes[x.theme_name] || 0) + 1;
  const meta = { made: today, tool: 'tools/lds-harvest-auto.mjs index', what: 'every London Datastore dataset harvested to the zone (feeds/london-datastore/<key>/): title, theme, licence and credit, dates, files with counts and sizes', final_states: states, harvested_folders: out.length, by_theme: themes,
    credit: 'London Datastore (data.london.gov.uk), Greater London Authority and the publishers named per dataset; licences per dataset. The GLA cannot warrant the quality or accuracy of the data.' };
  writeFileSync(join(OUT, 'index.json'), '{"meta":' + JSON.stringify(meta, null, 1) + ',\n"datasets":[\n' + out.map(x => JSON.stringify(x)).join(',\n') + '\n]}\n');
  console.log('index', out.length, JSON.stringify(themes));
}


if (import.meta.url === (await import('url')).pathToFileURL(process.argv[1] || '').href) await autoHarvest(process.argv.slice(2));
