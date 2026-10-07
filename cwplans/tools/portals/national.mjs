// Other national open-data sources, for walk-portals.mjs: a written list of the sources in the brief (SOURCES: API,
// licence, robots, state), and harvests of the open ones as zone extracts: DfT road traffic counts (AADF), DfT STATS19
// collisions aggregated by LSOA, police.uk street-level crime aggregated by snap point and category, DESNZ
// sub-national gas and electricity by LSOA and MSOA. Rules and reasons: skills/cwplans-open-portals/SKILL.md, "National".
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import { Readable } from 'stream';
import { getJson, politeFetch, rawFile, RAWP, OUT, today, ZONE, ZONE_TEXT, CW_BOX, writeLines, writeGeojson, zoneRefs, allowed , outExists, writeOut } from '../walk-portals.mjs';
import { UA } from '../lib.mjs';

const OGL = 'Open Government Licence v3.0', OGL_URL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';
const readJson = f => JSON.parse(readFileSync(f, 'utf8'));
const inZone = (lon, lat) => lon >= ZONE[0] && lon <= ZONE[2] && lat >= ZONE[1] && lat <= ZONE[3];
function csvCells(line) { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; }

// the national sources of the brief, with what was found (walk writes them as the catalogue; triage reads the state)
export const SOURCES = [
  { key: 'dft-aadf', name: 'DfT road traffic statistics: count points and annual average daily flow (AADF)', api: 'https://roadtraffic.dft.gov.uk/api/ + https://storage.googleapis.com/dft-statistics/road-traffic/downloads/aadf/local_authority_id/dft_aadf_local_authority_id_<id>.csv', licence: OGL, robots: 'roadtraffic.dft.gov.uk: Disallow empty (all allowed)', state: 'harvest' },
  { key: 'dft-stats19', name: 'DfT road safety data (STATS19): collisions, last 5 years', api: 'https://data.dft.gov.uk/road-accidents-safety-data/dft-road-casualty-statistics-collision-last-5-years.csv', licence: OGL, state: 'harvest', sensitivity: 'personal injury collisions: aggregated to LSOA x year x severity; no collision rows, no casualty or vehicle tables' },
  { key: 'police-crime', name: 'police.uk street-level crime (API crimes-street, 12 months)', api: 'https://data.police.uk/api/crimes-street/all-crime?poly=<tile>&date=<YYYY-MM>', licence: OGL, state: 'harvest', sensitivity: 'positions are police.uk anonymised snap points; aggregated to snap point x category over 12 months, and month x category; no crime ids, no outcomes per crime' },
  { key: 'desnz-energy', name: 'DESNZ sub-national electricity and gas consumption by LSOA and MSOA (2010-2024)', api: 'https://www.gov.uk/government/statistics/lower-and-middle-super-output-areas-electricity-consumption (and -gas-consumption): xlsx attachments on assets.publishing.service.gov.uk', licence: OGL, state: 'harvest' },
  { key: 'ofcom-connected-nations', name: 'Ofcom Connected Nations: broadband and mobile coverage by postcode and output area', api: 'https://www.ofcom.org.uk/ (data downloads)', licence: 'OGL (Ofcom open data)', state: 'unavailable', reason: 'www.ofcom.org.uk answers 403 to scripted requests, robots.txt included (2026-10-04); not fetched through other routes' },
  { key: 'nomis-api', name: 'Nomis API (ONS labour market and census datasets)', api: 'https://www.nomisweb.co.uk/api/v01/', licence: OGL, state: 'not-used', reason: 'robots.txt disallows /api/v01/dataset/ and /query/ for every agent; census tables taken from the bulk downloads instead (../nomis/)' },
  { key: 'hmlr-price-paid', name: 'HM Land Registry Price Paid Data', licence: OGL, state: 'held', reason: 'held: registry/homes-by-postcode.json (source hmlr-price-paid)' },
  { key: 'hmlr-inspire', name: 'HM Land Registry INSPIRE Index Polygons', licence: 'OGL with conditions', state: 'held', reason: 'held: tools/registry-inspire.mjs (source hmlr-inspire); planning.data.gov.uk re-serves it as title-boundary' },
  { key: 'fsa-fhrs', name: 'FSA food hygiene ratings', licence: OGL, state: 'held', reason: 'held: sources fsa, fsa-api' },
  { key: 'historic-england', name: 'Historic England open data (NHLE, Heritage at Risk, APAs)', licence: OGL, state: 'held', reason: 'scheduled monuments and APAs held (registry/sources/museums); listed buildings and Heritage at Risk harvested from planning.data.gov.uk (../pdg/)' },
  { key: 'ea-flood-zones', name: 'EA Flood Map for Planning (flood zones 2 and 3)', licence: OGL, state: 'held', reason: 'harvested from planning.data.gov.uk (../pdg/flood-risk-zone/); EA spatial flood defences held (ea-defences)' },
  { key: 'os-open-uprn', name: 'OS Open UPRN and Open Linked Identifiers', licence: OGL, state: 'held', reason: 'held (os-open-uprn)' },
  { key: 'os-open-greenspace', name: 'OS Open Greenspace', licence: OGL, state: 'held', reason: 'held (os-open-greenspace)' },
  { key: 'os-open-names', name: 'OS Open Names (GB CSV)', api: 'https://api.os.uk/downloads/v1/products/OpenNames/downloads', licence: 'OGL (OS OpenData)', state: 'harvest' },
  { key: 'os-open-rivers', name: 'OS Open Rivers (GB GeoPackage)', api: 'https://api.os.uk/downloads/v1/products/OpenRivers/downloads', licence: 'OGL (OS OpenData)', state: 'harvest' },
  { key: 'os-open-usrn-roads', name: 'OS Open USRN, Open Roads, Built Up Areas', api: 'https://api.os.uk/downloads/v1/products', licence: 'OGL (OS OpenData)', state: 'listed-for-harvest', reason: 'GB downloads of 0.3 to 1 GB; the container had about 2 GB of free disk on 2026-10-04: one product at a time, zone extract only, the download deleted after reading' },
  { key: 'coal-authority', name: 'Coal Authority mining reporting areas', licence: OGL, state: 'not-relevant', reason: 'London is outside the coalfield' },
  { key: 'bgs', name: 'British Geological Survey datasets', licence: 'BGS terms per product (OGL for some, commercial for others)', state: 'deferred', reason: '4,128 BGS records on data.gov.uk have no licence field; BGS Geology 625k/50k licences to be read per product before use' },
  { key: 'mhclg-imd2025', name: 'English Indices of Deprivation 2025 by LSOA (MHCLG, File 7)', api: 'https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025', licence: OGL, state: 'harvest' },
  { key: 'epc', name: 'Energy Performance Certificates (domestic and non-domestic)', licence: 'OGL for data, but address data under Royal Mail / OS terms; registration required', state: 'not-open', reason: 'download needs an account and accepts terms that restrict address data' },
];
export async function walk() {
  writeLines(join(OUT, 'national', 'catalogue.json'), { portal: 'national sources of the brief', walked: today, rule: 'the sources named in the brief, each checked for API, licence and robots.txt on 2026-10-04; written by hand in tools/portals/national.mjs SOURCES' }, 'sources', SOURCES);
  console.log(`${SOURCES.length} sources`);
}
export async function triage() {
  const rows = SOURCES.map(s => {
    const f = HARVEST_FILES[s.key], has = f && outExists(join(OUT, 'national', s.key, f));
    const state = has ? 'harvested' : s.state === 'harvest' ? 'listed-for-harvest' : s.state === 'not-used' ? 'not-open' : s.state;
    return { key: s.key, name: s.name, licence: s.licence, state, reason: has ? `feeds/portals/national/${s.key}/${f}` : s.reason || 'open; not yet harvested' };
  });
  const counts = {}; for (const r of rows) counts[r.state] = (counts[r.state] || 0) + 1;
  writeLines(join(OUT, 'national', 'triage.json'), { portal: 'national sources of the brief', triaged: today, counts, rules: ['state written by hand in SOURCES after checking API, licence and robots.txt; harvested when the zone file exists'] }, 'sources', rows);
  console.log(counts);
}
const HARVEST_FILES = { 'mhclg-imd2025': 'mhclg-imd2025.json', 'os-open-names': 'os-open-names.geojson', 'os-open-rivers': 'os-open-rivers.geojson', 'dft-aadf': 'dft-aadf.geojson', 'dft-stats19': 'dft-stats19.json', 'police-crime': 'police-crime.json', 'desnz-energy': 'desnz-energy.json' };

// ---------------------------------------------------------------- harvests
const DFT_LA = { 93: 'Tower Hamlets', 103: 'Southwark', 104: 'Lewisham', 105: 'Greenwich', 167: 'Newham', 174: 'City of London' };
async function dftAadf() {
  const KEEP = ['count_point_id', 'year', 'road_name', 'road_category', 'road_type', 'start_junction_road_name', 'end_junction_road_name', 'link_length_km', 'estimation_method', 'estimation_method_detailed', 'direction_of_travel',
    'pedal_cycles', 'two_wheeled_motor_vehicles', 'cars_and_taxis', 'buses_and_coaches', 'lgvs', 'all_hgvs', 'all_motor_vehicles'];
  const pts = new Map(); let rowsRead = 0; const files = [];
  for (const [id, la] of Object.entries(DFT_LA)) {
    const url = `https://storage.googleapis.com/dft-statistics/road-traffic/downloads/aadf/local_authority_id/dft_aadf_local_authority_id_${id}.csv`;
    const { file, fetched } = await rawFile(`national/dft_aadf_la_${id}.csv`, url); files.push({ url, local_authority: la, fetched });
    const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean); const H = csvCells(lines[0]).map(h => h.toLowerCase());
    for (const l of lines.slice(1)) {
      const c = csvCells(l), r = Object.fromEntries(H.map((h, i) => [h, c[i]])); rowsRead++;
      const lon = +r.longitude, lat = +r.latitude; if (!inZone(lon, lat)) continue;
      const k = r.count_point_id; const p = pts.get(k) || { lon, lat, la, years: [] };
      p.years.push(Object.fromEntries(KEEP.filter(x => x in r).map(x => [x, /^(year|count_point_id|pedal|two_|cars|buses|lgvs|all_)/.test(x) ? (r[x] === '' ? null : +r[x]) : r[x]]))); pts.set(k, p);
    }
  }
  const feats = [...pts.entries()].map(([id, p]) => {
    p.years.sort((a, b) => a.year - b.year); const last = p.years[p.years.length - 1];
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6] }, properties: { count_point_id: +id, local_authority: p.la, road_name: last.road_name, road_category: last.road_category, road_type: last.road_type, start_junction: last.start_junction_road_name, end_junction: last.end_junction_road_name, link_length_km: last.link_length_km, in_cw: p.lon >= CW_BOX[0] && p.lon <= CW_BOX[2] && p.lat >= CW_BOX[1] && p.lat <= CW_BOX[3], latest_year: last.year, latest_all_motor_vehicles: last.all_motor_vehicles, latest_pedal_cycles: last.pedal_cycles, latest_estimation_method: last.estimation_method,
      aadf: p.years.map(y => [y.year, y.estimation_method === 'Counted' ? 'C' : 'E', y.all_motor_vehicles, y.cars_and_taxis, y.lgvs, y.all_hgvs, y.buses_and_coaches, y.two_wheeled_motor_vehicles, y.pedal_cycles]) } };
  });
  const meta = { source: 'DfT road traffic statistics: annual average daily flow by count point (major and minor roads)', page: 'https://roadtraffic.dft.gov.uk/', files, fetched: today, licence: OGL, licence_url: OGL_URL,
    attribution: 'Contains public sector information licensed under the Open Government Licence v3.0 (Department for Transport road traffic statistics)', zone: ZONE_TEXT,
    method: 'walk-portals.mjs national harvest dft-aadf: the AADF CSV of each zone local authority (DfT ids 93, 103, 104, 105, 167, 174); count points whose latitude/longitude lie in the box; one feature per count point with every year',
    aadf_columns: ['year', 'C counted / E estimated', 'all_motor_vehicles', 'cars_and_taxis', 'lgvs', 'all_hgvs', 'buses_and_coaches', 'two_wheeled_motor_vehicles', 'pedal_cycles'],
    counts: { rows_read: rowsRead, count_points: feats.length, in_cw: feats.filter(f => f.properties.in_cw).length } };
  return writeGeojson(join(OUT, 'national', 'dft-aadf', 'dft-aadf.geojson'), meta, feats);
}
async function stats19() {
  const url = 'https://data.dft.gov.uk/road-accidents-safety-data/dft-road-casualty-statistics-collision-last-5-years.csv';
  const refs = zoneRefs(); const zoneLsoa11 = new Set([...refs.code].filter(([, k]) => k === 'lsoa11' || k === 'lsoa21').map(([c]) => c));
  if (!(await allowed(url))) throw new Error('robots.txt disallows ' + url);
  const r = await fetch(url, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error(`${r.status} ${url}`);
  const agg = new Map(); let H = null, n = 0, inBox = 0, byLsoa = 0, years = new Set(); const sev = { 1: 'fatal', 2: 'serious', 3: 'slight' };
  for await (const line of createInterface({ input: Readable.fromWeb(r.body) })) {
    if (!H) { H = csvCells(line).map(h => h.replace(/^﻿/, '')); continue; }
    const c = csvCells(line), g = k => c[H.indexOf(k)]; n++;
    const lsoa = g('lsoa_of_accident_location'), lon = +g('longitude'), lat = +g('latitude');
    const zoneByCode = zoneLsoa11.has(lsoa), zoneByPt = inZone(lon, lat);
    if (!zoneByCode && !zoneByPt) continue; if (zoneByPt) inBox++; if (zoneByCode) byLsoa++;
    const y = g('accident_year') || g('collision_year'); years.add(y);
    const code = /^E01\d{6}$/.test(lsoa) ? lsoa : null;
    const k = `${code || 'none'}|${y}`; const a = agg.get(k) || { lsoa: code, zone_lsoa: zoneByCode, year: +y, collisions: 0, fatal: 0, serious: 0, slight: 0, casualties: 0, in_box: 0 };
    a.collisions++; a[sev[g('accident_severity') || g('collision_severity')]]++; a.casualties += +g('number_of_casualties') || 0; if (zoneByPt) a.in_box++; agg.set(k, a);
  }
  const rows = [...agg.values()].sort((a, b) => (a.lsoa || '~').localeCompare(b.lsoa || '~') || a.year - b.year);
  const columns = ['lsoa', 'zone_lsoa', 'year', 'collisions', 'fatal', 'serious', 'slight', 'casualties', 'in_box'];
  const meta = { source: 'DfT road safety data (STATS19): personal injury collisions, last 5 years', file: url, fetched: today, licence: OGL, licence_url: OGL_URL,
    attribution: 'Contains public sector information licensed under the Open Government Licence v3.0 (Department for Transport, Road Safety Data)', zone: ZONE_TEXT,
    method: 'walk-portals.mjs national harvest dft-stats19: the collision CSV streamed (not stored); a collision counts when its LSOA (lsoa_of_accident_location as published) is a zone LSOA (2011 or 2021 code) or its point lies in the box; aggregated to the published LSOA x year with counts by severity, the sum of casualties and how many lie in the box; zone_lsoa says whether the LSOA is a zone code; a collision with no LSOA code is in the row with lsoa null. No collision rows, no casualty or vehicle tables (personal injury data: aggregates only)',
    years: [...years].sort(), counts: { rows_read: n, zone_collisions: rows.reduce((a, r) => a + r.collisions, 0), in_box: inBox, by_zone_lsoa: byLsoa, rows: rows.length } };
  return writeLines(join(OUT, 'national', 'dft-stats19', 'dft-stats19.json'), { ...meta, columns }, 'rows', rows.map(r => columns.map(c => r[c])));
}
async function policeCrime() {
  const last = (await getJson('https://data.police.uk/api/crime-last-updated')).date.slice(0, 7);
  const months = []; { let [y, m] = last.split('-').map(Number); for (let i = 0; i < 12; i++) { months.push(`${y}-${String(m).padStart(2, '0')}`); m--; if (!m) { m = 12; y--; } } }
  const nx = 3, ny = 2, tiles = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const x0 = ZONE[0] + (ZONE[2] - ZONE[0]) * i / nx, x1 = ZONE[0] + (ZONE[2] - ZONE[0]) * (i + 1) / nx, y0 = ZONE[1] + (ZONE[3] - ZONE[1]) * j / ny, y1 = ZONE[1] + (ZONE[3] - ZONE[1]) * (j + 1) / ny; tiles.push([x0, y0, x1, y1]); }
  const seen = new Set(), pts = new Map(), monthCat = new Map(); let over = 0, n = 0;
  for (const m of months) for (const t of tiles) {
    const poly = `${t[1]},${t[0]}:${t[3]},${t[0]}:${t[3]},${t[2]}:${t[1]},${t[2]}`;
    let j; try { j = await getJson(`https://data.police.uk/api/crimes-street/all-crime?poly=${poly}&date=${m}`); } catch (e) { if (/503/.test(e.message)) { over++; continue; } throw e; }
    for (const c of j) {
      if (seen.has(c.id)) continue; seen.add(c.id); n++;
      const lon = +c.location.longitude, lat = +c.location.latitude; if (!inZone(lon, lat)) continue;
      const k = c.location.street.id; const p = pts.get(k) || { lon, lat, street: c.location.street.name, cats: {} }; p.cats[c.category] = (p.cats[c.category] || 0) + 1; pts.set(k, p);
      const mk = `${m}|${c.category}`; monthCat.set(mk, (monthCat.get(mk) || 0) + 1);
    }
    process.stdout.write(`\rpolice ${m} ${n}   `);
  }
  const cats = [...new Set([...monthCat.keys()].map(k => k.split('|')[1]))].sort();
  const points = [...pts.entries()].map(([id, p]) => [+id, Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6, p.street, ...cats.map(c => p.cats[c] || 0)]);
  const meta = { source: 'police.uk street-level crime (Home Office / police forces: Metropolitan Police, City of London Police, British Transport Police)', api: 'https://data.police.uk/api/crimes-street/all-crime?poly=<6 tiles of the box>&date=<month>', months, fetched: today, licence: OGL, licence_url: 'https://data.police.uk/about/', attribution: 'Contains public sector information licensed under the Open Government Licence v3.0 (data.police.uk)', zone: ZONE_TEXT,
    method: 'walk-portals.mjs national harvest police-crime: the 12 latest months, the box in 6 tiles (the API refuses polygons with over 10,000 crimes: 503); crimes deduplicated by id; positions are police.uk anonymised snap points (each the centre of a street or a public place, never an address); aggregated to snap point x category over the 12 months, and to month x category. No crime ids, outcomes or persistent ids kept',
    sensitivity: 'aggregates only; categories as published (violence-and-sexual-offences is one category on police.uk and is kept only as a count)', categories: cats,
    counts: { crimes_read: n, snap_points: points.length, tiles_refused: over } };
  const monthRows = months.map(m => [m, ...cats.map(c => monthCat.get(`${m}|${c}`) || 0)]);
  const out = `{"meta":${JSON.stringify({ ...meta, point_columns: ['street_id', 'lon', 'lat', 'street', ...cats], month_columns: ['month', ...cats] }, null, 1)},\n"by_month":[\n${monthRows.map(r => JSON.stringify(r)).join(',\n')}\n],\n"points":[\n${points.map(r => JSON.stringify(r)).join(',\n')}\n]}\n`;
  return writeOut(join(OUT, 'national', 'police-crime', 'police-crime.json'), out);
}
async function desnz() {
  const XLSX = (await import('xlsx')).default; const refs = zoneRefs();
  const zone = new Set([...refs.code].filter(([, k]) => /^(lsoa|msoa)(11|21)$/.test(k)).map(([c]) => c));
  const FILES = [
    ['MSOA domestic electricity', 'https://assets.publishing.service.gov.uk/media/69427a872fd325caf841934e/MSOA_domestic_elec_2010-2024.xlsx'],
    ['MSOA non-domestic electricity', 'https://assets.publishing.service.gov.uk/media/69427b3736f089d38be1f1ce/MSOA_non-domestic_elec_2010-2024.xlsx'],
    ['MSOA domestic gas', 'https://assets.publishing.service.gov.uk/media/694577302f02611393508989/MSOA_domestic_gas_2010-2024.xlsx'],
    ['MSOA non-domestic gas', 'https://assets.publishing.service.gov.uk/media/6945777c033693d5d50eb846/MSOA_non_domestic_gas_2010-2024.xlsx'],
    ['LSOA domestic electricity', 'https://assets.publishing.service.gov.uk/media/69427b7bd8156a816c419351/LSOA_domestic_elec_2010-2024.xlsx'],
    ['LSOA domestic gas', 'https://assets.publishing.service.gov.uk/media/694578171a2e540ccd8a5426/LSOA_domestic_gas_2010-2024.xlsx'],
  ];
  const tables = [];
  for (const [label, url] of FILES) {
    const { file, fetched } = await rawFile(`national/${url.split('/').pop()}`, url);
    const wb = XLSX.readFile(file, { dense: true, cellFormula: false, cellHTML: false, cellStyles: false });
    for (const sn of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false });
      const hi = rows.findIndex(r => r && r.some(c => String(c ?? '').length < 40 && /(LSOA|MSOA|Lower|Middle).*(code)/i.test(String(c ?? '')))); if (hi < 0) continue;   // a header cell (short), not the notes above it
      const header = rows[hi].map(c => String(c ?? '').replace(/\s+/g, ' ').trim()); const ci = header.findIndex(h => /(LSOA|MSOA|Lower|Middle).*code/i.test(h));
      const keep = rows.slice(hi + 1).filter(r => r && zone.has(String(r[ci] || '').trim()));
      if (keep.length) tables.push({ label, sheet: sn, file: url, fetched, header, rows: keep });
      console.log(`${label} / ${sn}: ${keep.length} zone rows`);
    }
  }
  const meta = { source: 'DESNZ sub-national electricity and gas consumption statistics, LSOA and MSOA, 2010-2024 (published December 2025)', page: 'https://www.gov.uk/government/statistics/lower-and-middle-super-output-areas-electricity-consumption ; https://www.gov.uk/government/statistics/lower-and-middle-super-output-areas-gas-consumption', fetched: today,
    licence: OGL, licence_url: OGL_URL, attribution: 'Contains public sector information licensed under the Open Government Licence v3.0 (Department for Energy Security and Net Zero)', zone: ZONE_TEXT,
    method: 'walk-portals.mjs national harvest desnz-energy: every sheet of the six workbooks; rows whose LSOA or MSOA code (2011 or 2021) is a zone code; header row as published',
    counts: Object.fromEntries(tables.map(t => [`${t.label} / ${t.sheet}`, t.rows.length])) };
  const out = `{"meta":${JSON.stringify(meta, null, 1)},\n"tables":[\n${tables.map(t => JSON.stringify(t)).join(',\n')}\n]}\n`;
  return writeOut(join(OUT, 'national', 'desnz-energy', 'desnz-energy.json'), out);
}
// OS OpenData: GB downloads, read for the zone and deleted (disk); BNG to WGS84 through the OSTN15 grid
async function bngInverse() { const { bngProjector } = await import('../lib.mjs'); const proj4 = (await import('proj4')).default; await bngProjector(); const P = proj4('EPSG:4326', 'BNG'); return ([e, n]) => P.inverse([e, n]).map(v => Math.round(v * 1e6) / 1e6); }
const ZB = [532400, 176700, 539900, 182300];
const inZB = (e, n) => e >= ZB[0] && e <= ZB[2] && n >= ZB[1] && n <= ZB[3];
const OS_ATTRIB = 'Contains OS data © Crown copyright and database right 2026 (OS OpenData, Open Government Licence v3.0)';
async function osOpenNames() {
  const { execFileSync } = await import('child_process'); const { rmSync } = await import('fs');
  const url = 'https://api.os.uk/downloads/v1/products/OpenNames/downloads?area=GB&format=CSV&redirect';
  const { file, fetched } = await rawFile('national/opname_csv_gb.zip', url);
  const entries = execFileSync('unzip', ['-Z1', file]).toString().split('\n');
  const hdrE = entries.find(e => /OS_Open_Names_Header\.csv$/i.test(e)), tiles = entries.filter(e => /\/(TQ37|TQ38|TQ26|TQ28)\.csv$/i.test(e));   // 10 km names, or the 20 km tiles the GB CSV actually uses (TQ26, TQ28)
  const H = csvCells(execFileSync('unzip', ['-p', file, hdrE]).toString().split(/\r?\n/)[0]);
  const toW = await bngInverse(); const feats = []; let pcSkipped = 0; const KEEP = ['ID', 'NAMES_URI', 'NAME1', 'NAME1_LANG', 'NAME2', 'NAME2_LANG', 'TYPE', 'LOCAL_TYPE', 'POSTCODE_DISTRICT', 'POPULATED_PLACE', 'DISTRICT_BOROUGH', 'SAME_AS_DBPEDIA', 'SAME_AS_GEONAMES', 'MBR_XMIN', 'MBR_YMIN', 'MBR_XMAX', 'MBR_YMAX'];
  for (const t of tiles) for (const line of execFileSync('unzip', ['-p', file, t], { maxBuffer: 1 << 28 }).toString().split(/\r?\n/)) {
    if (!line) continue; const c = csvCells(line), r = Object.fromEntries(H.map((h, i) => [h, c[i]]));
    const e = +r.GEOMETRY_X, n = +r.GEOMETRY_Y; if (!inZB(e, n)) continue;
    if (r.LOCAL_TYPE === 'Postcode') { pcSkipped++; continue; }     // postcode centres: held from ONSPD
    const p = {}; for (const k of KEEP) if (r[k]) p[k.toLowerCase()] = /^MBR_/.test(k) ? +r[k] : r[k];
    feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: toW([e, n]) }, properties: p });
  }
  if (!process.argv.includes('--keep-raw')) rmSync(file);
  const meta = { source: 'OS Open Names (GB, CSV)', page: 'https://www.ordnancesurvey.co.uk/products/os-open-names', api: url, entries: tiles, fetched, licence: OGL, licence_url: 'https://www.ordnancesurvey.co.uk/customers/public-sector/public-sector-licensing/open-data', attribution: OS_ATTRIB, zone: ZONE_TEXT,
    method: 'walk-portals.mjs national harvest os-open-names: the GB CSV zip (103 MB, deleted after reading), the tiles that hold the box (the GB CSV uses 20 km tiles: TQ26 and TQ28), entries whose GEOMETRY_X/Y lie in the box (BNG), less the postcode entries (postcode centres are held from ONSPD); BNG to WGS84 through OSTN15; MBR (BNG) kept for streets and areas',
    counts: { features: feats.length, postcode_entries_left_out: pcSkipped, by_type: feats.reduce((a, f) => (a[f.properties.local_type] = (a[f.properties.local_type] || 0) + 1, a), {}) } };
  return writeGeojson(join(OUT, 'national', 'os-open-names', 'os-open-names.geojson'), meta, feats);
}
async function osOpenRivers() {
  const { rmSync } = await import('fs'); const { readGpkg } = await import('../walk-london-datastore.mjs');
  const url = 'https://api.os.uk/downloads/v1/products/OpenRivers/downloads?area=GB&format=GeoPackage&redirect';
  const { file: zip, fetched } = await rawFile('national/oprvrs_gpkg_gb.zip', url);
  const { execFileSync } = await import('child_process');
  const ent = execFileSync('unzip', ['-Z1', zip]).toString().split('\n').find(e => /\.gpkg$/i.test(e));
  const gp = join(RAWP, 'national', 'oprvrs_gb.gpkg'); execFileSync('sh', ['-c', `unzip -p "${zip}" "${ent}" > "${gp}"`]);
  const G = await readGpkg(gp); const toW = await bngInverse(); const feats = [];
  const mp = (g, f) => g.type === 'Point' ? { type: g.type, coordinates: f(g.coordinates) } : g.type === 'LineString' || g.type === 'MultiPoint' ? { type: g.type, coordinates: g.coordinates.map(f) } : g.type === 'MultiLineString' || g.type === 'Polygon' ? { type: g.type, coordinates: g.coordinates.map(r => r.map(f)) } : { type: g.type, coordinates: g.coordinates.map(p => p.map(r => r.map(f))) };
  for (const F of G.features) {
    if (!F.geom) continue; let hit = false; const chk = c => { if (typeof c[0] === 'number') { if (inZB(c[0], c[1])) hit = true; } else c.forEach(chk); }; chk(F.geom.coordinates); if (!hit) continue;
    const p = { layer: F.layer }; for (const [k, v] of Object.entries(F.props)) if (v !== null && v !== '' && !/^fid$/i.test(k)) p[k] = v;
    feats.push({ type: 'Feature', geometry: mp(F.geom, toW), properties: p });
  }
  if (!process.argv.includes('--keep-raw')) { rmSync(zip); rmSync(gp); }
  const meta = { source: 'OS Open Rivers (GB, GeoPackage)', page: 'https://www.ordnancesurvey.co.uk/products/os-open-rivers', api: url, layers: G.layers, fetched, licence: OGL, licence_url: 'https://www.ordnancesurvey.co.uk/customers/public-sector/public-sector-licensing/open-data', attribution: OS_ATTRIB, zone: ZONE_TEXT,
    method: 'walk-portals.mjs national harvest os-open-rivers: the GB GeoPackage (52 MB zip, deleted after reading); watercourse links and hydro nodes with a vertex in the box (BNG); whole geometries, BNG to WGS84 through OSTN15',
    counts: { features: feats.length, by_layer: feats.reduce((a, f) => (a[f.properties.layer] = (a[f.properties.layer] || 0) + 1, a), {}) } };
  return writeGeojson(join(OUT, 'national', 'os-open-rivers', 'os-open-rivers.geojson'), meta, feats);
}
async function imd2025() {
  const url = 'https://assets.publishing.service.gov.uk/media/691ded56d140bbbaa59a2a7d/File_7_IoD2025_All_Ranks_Scores_Deciles_Population_Denominators.csv';
  const { file, fetched } = await rawFile('national/File_7_IoD2025.csv', url);
  const refs = zoneRefs(); const zone = new Set([...refs.code].filter(([, k]) => k === 'lsoa21').map(([c]) => c));
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean); const header = csvCells(lines[0]).map(h => h.replace(/^\uFEFF/, '').trim());
  const rows = lines.slice(1).map(csvCells).filter(c => zone.has(c[0])).map(c => c.map((v, i) => i < 4 ? v : v === '' ? null : +v));
  const meta = { source: 'English Indices of Deprivation 2025, File 7: all ranks, scores, deciles and population denominators by LSOA 2021 (MHCLG)', page: 'https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025', file: url, fetched,
    licence: OGL, licence_url: OGL_URL, attribution: 'Contains public sector information licensed under the Open Government Licence v3.0 (Ministry of Housing, Communities and Local Government, English Indices of Deprivation 2025)', zone: ZONE_TEXT,
    method: 'walk-portals.mjs national harvest mhclg-imd2025: the File 7 CSV; rows whose LSOA 2021 code is a zone LSOA (zone-codes.json lsoa21); values as published (rank 1 = most deprived of 33,755)', columns: header,
    counts: { rows: rows.length, zone_lsoas: zone.size } };
  return writeLines(join(OUT, 'national', 'mhclg-imd2025', 'mhclg-imd2025.json'), meta, 'rows', rows);
}
const FN = { 'mhclg-imd2025': imd2025, 'os-open-names': osOpenNames, 'os-open-rivers': osOpenRivers, 'dft-aadf': dftAadf, 'dft-stats19': stats19, 'police-crime': policeCrime, 'desnz-energy': desnz };
export async function harvest(keys) {
  for (const k of keys.length ? keys : Object.keys(FN)) {
    (await import('fs')).mkdirSync(join(OUT, 'national', k), { recursive: true });
    const n = await FN[k](); console.log(`\n${k}: ${(n / 1e3).toFixed(0)} kB`);
  }
}
