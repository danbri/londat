// Area detection inside London Datastore files: open a sample of a resource and find the geography in the data
// (coordinates, UPRNs, postcodes, OA/LSOA/MSOA/ward/borough codes, borough and zone place names). A library with no
// side effects; walk-london-datastore.mjs runs it (`refs`, `probe`) with its polite fetch.
// Rules, caps and the reasons: skills/cwplans-london-datastore/SKILL.md, "Area from the data".
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';

// ---- size caps (written rules; the SKILL repeats them)
export const CAPS = {
  text: 1 << 20,          // csv, tsv, txt, json, geojson, xml: the first 1 MB (HTTP Range, or the stream is cut)
  sheet: 20e6,            // xlsx, xlsm, xls, ods: whole file up to 20 MB (a workbook cannot be read in part)
  zip: 60e6,              // zip: whole file up to 60 MB; inside: shp header + dbf, csv (1 MB), sheets, gpkg
  gpkg: 100e6,            // GeoPackage: whole file up to 100 MB
  rowsPerSheet: 3000,     // rows read per sheet or table
  sheets: 40,             // sheets read per workbook
  perDataset: 3,          // resources sampled per dataset (stop early on a zone signal)
};
export const READABLE = { csv: 'text', tsv: 'text', txt: 'text', json: 'text', geojson: 'text', xml: 'text', xlsx: 'sheet', xlsm: 'sheet', xls: 'sheet', ods: 'sheet', zip: 'zip', gpkg: 'gpkg' };
export const DOCUMENT_FORMATS = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'rtf', 'html', 'htm', 'msg', 'jpg', 'jpeg', 'png', 'gif', 'tif', 'tiff', 'svg', 'wav', 'mp3', 'mp4'];
export const UNREADABLE_DATA = ['rds', 'sav', 'dta', 'sas7bdat', 'mdb', 'accdb', 'gz', '7z', 'rar', 'kmz', 'kml', 'dwg'];

// ---- the zone (3D model box) and London
export const ZONE_BNG = [532400, 176700, 539900, 182300];
export const ZONE_WGS = [-0.0950, 51.4740, 0.0150, 51.5220];
const LONDON_BNG = [500000, 150000, 565000, 205000], LONDON_WGS = [-0.52, 51.28, 0.34, 51.70];
const inBox = (x, y, B) => x >= B[0] && x <= B[2] && y >= B[1] && y <= B[3];

export const BOROUGHS = {
  E09000001: 'city of london', E09000002: 'barking and dagenham', E09000003: 'barnet', E09000004: 'bexley', E09000005: 'brent', E09000006: 'bromley',
  E09000007: 'camden', E09000008: 'croydon', E09000009: 'ealing', E09000010: 'enfield', E09000011: 'greenwich', E09000012: 'hackney',
  E09000013: 'hammersmith and fulham', E09000014: 'haringey', E09000015: 'harrow', E09000016: 'havering', E09000017: 'hillingdon', E09000018: 'hounslow',
  E09000019: 'islington', E09000020: 'kensington and chelsea', E09000021: 'kingston upon thames', E09000022: 'lambeth', E09000023: 'lewisham', E09000024: 'merton',
  E09000025: 'newham', E09000026: 'redbridge', E09000027: 'richmond upon thames', E09000028: 'southwark', E09000029: 'sutton', E09000030: 'tower hamlets',
  E09000031: 'waltham forest', E09000032: 'wandsworth', E09000033: 'westminster',
};
export const ZONE_BOROUGH_CODES = ['E09000001', 'E09000011', 'E09000023', 'E09000025', 'E09000028', 'E09000030'];
const BOROUGH_BY_NAME = new Map(Object.entries(BOROUGHS).map(([c, n]) => [n, c]));
const normName = s => s.toLowerCase().replace(/&/g, 'and').replace(/^(london borough of|royal borough of|lb of|lb|rb)\s+/, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/^greenwich royal borough$/, 'greenwich').replace(/^city of westminster$/, 'westminster').replace(/^city$/, 'city of london').replace(/^kingston$/, 'kingston upon thames').replace(/^richmond$/, 'richmond upon thames');
// place names inside the zone, matched as whole words in cell values ("thames" alone is not a place)
export const ZONE_PLACE_NAMES = ['canary wharf', 'isle of dogs', 'millwall', 'cubitt town', 'island gardens', 'poplar', 'blackwall', 'limehouse', 'wapping', 'shadwell',
  'west india', 'south quay', 'crossharbour', 'mudchute', 'heron quays', 'westferry', 'wood wharf', 'leamouth', 'east india', 'all saints',
  'rotherhithe', 'surrey quays', 'surrey docks', 'canada water', 'greenland dock', 'bermondsey', 'deptford', 'greenwich peninsula', 'north greenwich',
  'royal docks', 'royal victoria', 'royal albert', 'silvertown', 'canning town', 'custom house', 'bow creek', 'st katharine', 'tower bridge', 'london bridge', 'docklands', 'e14'];
const PLACE_RE = new RegExp(`\\b(${ZONE_PLACE_NAMES.join('|')})\\b`, 'i');

// ---- codes and patterns
const CODE_RE = /\b(E0[0125]\d{6}|E09\d{6}|E12\d{6}|E0[678]\d{6}|E92000001|W0[56]\d{6}|S1[23]\d{6})\b/g;
const PC_RE = /\b([A-Z]{1,2}\d[A-Z\d]?) ?(\d[A-Z]{2})\b/g;
// the 121 UK postcode areas: a match whose letters are not an area (census table ids such as QS101EW) is not a postcode
const PC_AREAS = new Set('AB AL B BA BB BD BH BL BN BR BS BT CA CB CF CH CM CO CR CT CV CW DA DD DE DG DH DL DN DT DY E EC EH EN EX FK FY G GL GU HA HD HG HP HR HS HU HX IG IP IV KA KT KW KY L LA LD LE LL LN LS LU M ME MK ML N NE NG NN NP NR NW OL OX PA PE PH PL PO PR RG RH RM S SA SE SG SK SL SM SN SO SP SR SS ST SW SY TA TD TF TN TQ TR TS TW UB W WA WC WD WF WN WR WS WV YO ZE GY JE IM'.split(' '));
const HDR = {
  lat: /^(lat|latitude|lat_?wgs84|wgs84_?lat|y_?lat|point_?y_?wgs84)$/i, lon: /^(lon|long|lng|longitude|long_?wgs84|wgs84_?lon(g)?|x_?lon(g)?)$/i,
  e: /^(x|easting|eastings|east|x_?coord(inate)?|os_?x|bng_?x|geo_?x|grid_?ref_?e(asting)?|xcoord|x_?bng|location_?easting|easting_?osgr)$/i,
  n: /^(y|northing|northings|north|y_?coord(inate)?|os_?y|bng_?y|geo_?y|grid_?ref_?n(orthing)?|ycoord|y_?bng|location_?northing|northing_?osgr)$/i,
  uprn: /uprn/i, toid: /\btoid\b/i,
};

// ---- the reference sets (feeds/london-datastore/zone-codes.json + the zone UPRN list in the raw cache)
export function loadRefs(zoneCodesFile, uprnFile) {
  const z = JSON.parse(readFileSync(zoneCodesFile, 'utf8'));
  const code = new Map();                          // code -> {type, vintage}
  for (const [k, list] of Object.entries(z.codes)) for (const c of list) code.set(c, k);
  const pcs = new Set(z.postcodes.map(p => p.replace(/\s+/g, '')));
  const uprn = existsSync(uprnFile) ? new Set(readFileSync(uprnFile, 'utf8').split('\n').filter(Boolean)) : new Set();
  return { code, pcs, uprn, names: z.names || {} };
}

// ---- detection over a table (rows of cells) and over plain text
export function newSignals() {
  return { rows: 0, coords: null, uprn: null, toid: false, postcodes: { n: 0, zone: 0, sample: [], zoneSet: new Set() }, codes: {}, zoneCodes: {}, boroughs: { zone: new Set(), other: new Set() },
    london: false, national: false, places: {}, sources: [] };
}
const addCode = (S, refs, c) => {
  const t = c.startsWith('E00') ? 'oa' : c.startsWith('E01') ? 'lsoa' : c.startsWith('E02') ? 'msoa' : c.startsWith('E05') ? 'ward' : c.startsWith('E09') ? 'borough'
    : c === 'E12000007' ? 'london' : c.startsWith('E12') ? 'region' : 'national';
  S.codes[t] = (S.codes[t] || 0) + 1;
  if (t === 'borough') (ZONE_BOROUGH_CODES.includes(c) ? S.boroughs.zone : S.boroughs.other).add(c);
  else if (t === 'london') S.london = true;
  else if (t === 'national' || t === 'region') S.national = true;
  else if (refs.code.has(c)) { const k = refs.code.get(c); (S.zoneCodes[k] ||= new Set()).add(c); }
};
function scanText(S, refs, s) {
  if (!s) return;
  for (const m of s.matchAll(CODE_RE)) addCode(S, refs, m[1]);
  for (const m of s.matchAll(PC_RE)) {
    if (!PC_AREAS.has(/^[A-Z]+/.exec(m[1])[0])) continue;
    const pc = m[1] + m[2]; S.postcodes.n++;
    if (refs.pcs.has(pc)) { S.postcodes.zone++; S.postcodes.zoneSet.add(pc); if (S.postcodes.sample.length < 5 && !S.postcodes.sample.includes(m[1] + ' ' + m[2])) S.postcodes.sample.push(m[1] + ' ' + m[2]); }
  }
  const p = PLACE_RE.exec(s); if (p) { const k = p[1].toLowerCase(); S.places[k] = (S.places[k] || 0) + 1; }
}
function scanCell(S, refs, v) {
  if (v == null || v === '') return;
  const s = String(v); if (s.length > 400) return scanText(S, refs, s.slice(0, 400));
  const n = normName(s);
  if (BOROUGH_BY_NAME.has(n)) { const c = BOROUGH_BY_NAME.get(n); (ZONE_BOROUGH_CODES.includes(c) ? S.boroughs.zone : S.boroughs.other).add(c); }
  else if (n === 'london' || n === 'greater london' || n === 'inner london' || n === 'outer london') S.london = true;
  else if (n === 'england' || n === 'united kingdom' || n === 'uk' || n === 'england and wales' || n === 'great britain') S.national = true;
  scanText(S, refs, s);
}
// rows: arrays of cells. The header is the first row (among the first 30) that names a coordinate, UPRN or TOID column.
export function scanTable(S, refs, rows, label) {
  const take = rows.slice(0, CAPS.rowsPerSheet);
  let hi = -1, cols = {};
  for (let i = 0; i < Math.min(30, take.length) && hi < 0; i++) {
    const r = take[i] || []; const c = {};
    r.forEach((h, j) => { const t = String(h ?? '').trim(); for (const k of Object.keys(HDR)) if (c[k] == null && HDR[k].test(t)) c[k] = j; });
    if ((c.lat != null && c.lon != null) || (c.e != null && c.n != null) || c.uprn != null || c.toid != null) { hi = i; cols = c; }
  }
  for (const r of take) for (const v of r || []) scanCell(S, refs, v);
  S.rows += take.length; S.sources.push(label);
  if (hi < 0) return;
  if (cols.toid != null) S.toid = true;
  const body = take.slice(hi + 1);
  if (cols.uprn != null) {
    const u = S.uprn ||= { column: String(take[hi][cols.uprn]), n: 0, zone: 0, rounded: 0 };
    for (const r of body) { const v = String(r?.[cols.uprn] ?? '').trim(); if (!/^\d{1,12}(\.0+)?$/.test(v) && !/e\+/i.test(v)) continue; u.n++;
      if (/e\+/i.test(v) || /^\d{4,}0{5,}$/.test(v)) u.rounded++; else if (refs.uprn.has(v.replace(/\.0+$/, ''))) u.zone++; }
  }
  for (const [a, b, kind] of [['lon', 'lat', 'wgs84'], ['e', 'n', 'bng']]) {
    if (cols[a] == null || cols[b] == null) continue;
    const C = S.coords ||= { columns: [], n: 0, london: 0, zone: 0 };
    C.columns.push(`${take[hi][cols[a]]}/${take[hi][cols[b]]} (${kind})`);
    for (const r of body) {
      const x = +r?.[cols[a]], y = +r?.[cols[b]]; if (!isFinite(x) || !isFinite(y) || !x || !y) continue;
      // a row's CRS from its values (registers mix both): |x| <= 180 and |y| <= 90 -> WGS84, else BNG metres
      const w = Math.abs(x) <= 180 && Math.abs(y) <= 90; C.n++;
      if (inBox(x, y, w ? LONDON_WGS : LONDON_BNG)) C.london++;
      if (inBox(x, y, w ? ZONE_WGS : ZONE_BNG)) C.zone++;
    }
  }
}
// feature envelopes [x0, y0, x1, y1] of a layer (GeoPackage geometry headers, shapefile records): counted like rows
export function scanEnvelopes(S, envs, srs, label, layerBbox) {
  const C = S.coords ||= { columns: [], n: 0, london: 0, zone: 0 };
  const Z = srs === 4326 ? ZONE_WGS : srs === 27700 ? ZONE_BNG : null, L = srs === 4326 ? LONDON_WGS : LONDON_BNG;
  if (!Z) { C.columns.push(`${label}: unknown CRS`); return; }
  const meets = (b, B) => !(b[2] < B[0] || b[0] > B[2] || b[3] < B[1] || b[1] > B[3]);
  let n = 0, l = 0, z = 0;
  for (const b of envs) { if (!b || !b.every(isFinite)) continue; n++; if (meets(b, L)) l++; if (meets(b, Z)) z++; }
  C.columns.push(`${label} (features EPSG:${srs}${layerBbox ? ', layer bbox ' + layerBbox.map(v => Math.round(v * 1000) / 1000).join(',') : ''})`);
  C.n += n; C.london += l; C.zone += z;
}
// ---- readers
export function parseCsvRows(text, sep = ',') {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; if (rows.length >= CAPS.rowsPerSheet) break; }
    else cur += c;
  }
  return rows;                                       // a last partial row (cut by the cap) is dropped
}
const decode = buf => { const t = buf.toString('utf8'); return t.includes('�') ? buf.toString('latin1') : t; };
export function readTextSample(S, refs, buf, fmt, label) {
  let text = decode(buf).replace(/^﻿/, '');
  if (fmt === 'csv' || fmt === 'tsv' || fmt === 'txt') {
    const first = text.slice(0, 2000), sep = fmt === 'tsv' || (first.split('\t').length > first.split(',').length) ? '\t' : first.split(';').length > first.split(',').length * 2 ? ';' : ',';
    return scanTable(S, refs, parseCsvRows(text, sep), label);
  }
  if (fmt === 'json' || fmt === 'geojson') {
    try { const j = JSON.parse(text); return scanJson(S, refs, j, label); } catch { /* partial: fall through to a text scan */ }
  }
  S.sources.push(label + ' (text scan)'); scanText(S, refs, text.slice(0, CAPS.text));
  // coordinates in GeoJSON/XML text: pairs of numbers in the London range
  for (const m of text.slice(0, CAPS.text).matchAll(/\[\s*(-?\d+\.\d+)\s*,\s*(5\d\.\d+)\s*\]/g)) { const C = S.coords ||= { columns: ['text [lon, lat] pairs'], n: 0, london: 0, zone: 0 }; const x = +m[1], y = +m[2]; C.n++; if (inBox(x, y, LONDON_WGS)) C.london++; if (inBox(x, y, ZONE_WGS)) C.zone++; }
}
function scanJson(S, refs, j, label) {
  if (j && j.type === 'FeatureCollection' && Array.isArray(j.features)) {
    const rows = j.features.slice(0, CAPS.rowsPerSheet).map(f => { const c = f.geometry?.type === 'Point' ? f.geometry.coordinates : null; return { ...(f.properties || {}), ...(c ? { longitude: c[0], latitude: c[1] } : {}) }; });
    const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
    return scanTable(S, refs, [keys, ...rows.map(r => keys.map(k => r[k]))], label + ' (geojson)');
  }
  const arr = Array.isArray(j) ? j : Object.values(j || {}).find(v => Array.isArray(v) && v.length && typeof v[0] === 'object');
  if (Array.isArray(arr) && arr.length && typeof arr[0] === 'object') {
    const keys = [...new Set(arr.slice(0, 200).flatMap(r => Object.keys(r || {})))];
    return scanTable(S, refs, [keys, ...arr.slice(0, CAPS.rowsPerSheet).map(r => keys.map(k => (r || {})[k]))], label + ' (json records)');
  }
  S.sources.push(label + ' (json text scan)'); scanText(S, refs, JSON.stringify(j).slice(0, CAPS.text));
}
let XLSX = null;
export async function readSheet(S, refs, buf, label) {
  if (!XLSX) { try { XLSX = (await import('xlsx')).default; } catch { throw new Error('the probe needs SheetJS: npm install --no-save xlsx@0.18.5'); } }
  const wb = XLSX.read(buf, { type: 'buffer', sheetRows: CAPS.rowsPerSheet, dense: true, cellFormula: false, cellHTML: false, cellStyles: false });
  const names = wb.SheetNames.slice(0, CAPS.sheets);
  for (const n of names) scanTable(S, refs, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }), `${label}#${n}`);
  return { sheets: wb.SheetNames.length, read: names.length };
}
export async function readGpkgSample(S, refs, file, label) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const layers = db.prepare(`SELECT c.table_name t, c.min_x, c.min_y, c.max_x, c.max_y, c.srs_id s, g.column_name g FROM gpkg_contents c LEFT JOIN gpkg_geometry_columns g ON g.table_name = c.table_name`).all();
    const srs = new Map(db.prepare('SELECT srs_id, organization o, organization_coordsys_id c, definition d FROM gpkg_spatial_ref_sys').all().map(r => [r.srs_id, r]));
    const srsOf = id => { const r = srs.get(id); if (!r) return null; if (/^epsg$/i.test(r.o) && [27700, 4326].includes(r.c)) return r.c;
      if (/airy/i.test(r.d) && /Transverse_Mercator/i.test(r.d) && /400000/.test(r.d) && /-100000/.test(r.d)) return 27700; return null; };
    for (const L of layers) {
      if (L.g) {
        const envs = []; for (const r of db.prepare(`SELECT "${L.g}" g FROM "${L.t}"`).iterate()) envs.push(gpkgEnvelope(r.g));
        scanEnvelopes(S, envs, srsOf(L.s), `${label}:${L.t}`, L.min_x != null ? [L.min_x, L.min_y, L.max_x, L.max_y] : null);
      }
      const rows = db.prepare(`SELECT * FROM "${L.t}" LIMIT ${CAPS.rowsPerSheet}`).all();
      if (!rows.length) continue;
      const keys = Object.keys(rows[0]).filter(k => k !== L.g);
      scanTable(S, refs, [keys, ...rows.map(r => keys.map(k => r[k] instanceof Uint8Array ? null : typeof r[k] === 'bigint' ? Number(r[k]) : r[k]))], `${label}:${L.t}`);
    }
    return { layers: layers.length };
  } finally { db.close(); }
}
// a GeoPackage geometry blob's envelope (header), or a WKB point's coordinates; null when neither
function gpkgEnvelope(b) {
  if (!b || b.length < 8 || b[0] !== 0x47 || b[1] !== 0x50) return null;
  const buf = Buffer.from(b.buffer, b.byteOffset, b.byteLength), flags = buf[3], le = flags & 1, env = (flags >> 1) & 7;
  if (flags & 0x10) return null;
  const d = o => le ? buf.readDoubleLE(o) : buf.readDoubleBE(o);
  if (env >= 1) return [d(8), d(24), d(16), d(32)];           // minx, maxx, miny, maxy -> [x0, y0, x1, y1]
  const o = 8, wle = buf[o] === 1, t = (wle ? buf.readUInt32LE(o + 1) : buf.readUInt32BE(o + 1)) % 1000 & 0xff;
  if (t !== 1) return null;
  const x = wle ? buf.readDoubleLE(o + 5) : buf.readDoubleBE(o + 5), y = wle ? buf.readDoubleLE(o + 13) : buf.readDoubleBE(o + 13);
  return [x, y, x, y];
}
// shapefile record envelopes: a point's coordinates, else the record's bounding box
function shpEnvelopes(shp) {
  const out = []; let o = 100;
  while (o + 12 <= shp.length) {
    const len = shp.readInt32BE(o + 4) * 2, c = o + 8; o = c + len;
    if (c + 4 > shp.length) break;
    const t = shp.readInt32LE(c); if (t === 0) continue;
    if (t % 10 === 1) { if (c + 20 <= shp.length) { const x = shp.readDoubleLE(c + 4), y = shp.readDoubleLE(c + 12); out.push([x, y, x, y]); } }
    else if (c + 36 <= shp.length) out.push([shp.readDoubleLE(c + 4), shp.readDoubleLE(c + 12), shp.readDoubleLE(c + 20), shp.readDoubleLE(c + 28)]);
  }
  return out;
}
function shpBbox(b) { return { type: b.readInt32LE(32), bbox: [b.readDoubleLE(36), b.readDoubleLE(44), b.readDoubleLE(52), b.readDoubleLE(60)] }; }
function dbfRows(dbf, utf8) {
  const n = dbf.readUInt32LE(4), hl = dbf.readUInt16LE(8), rl = dbf.readUInt16LE(10), fields = [];
  for (let o = 32; dbf[o] !== 0x0d && o < hl; o += 32) fields.push({ name: dbf.toString('latin1', o, o + 11).replace(/\0.*$/, ''), len: dbf[o + 16] });
  const rows = [fields.map(f => f.name)];
  for (let i = 0; i < Math.min(n, CAPS.rowsPerSheet); i++) { let o = hl + i * rl + 1; const r = []; for (const f of fields) { r.push(dbf.toString(utf8 ? 'utf8' : 'latin1', o, o + f.len).trim()); o += f.len; } rows.push(r); }
  return rows;
}
export async function readZip(S, refs, file, label) {
  const names = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean).filter(n => !/__MACOSX|\/$/.test(n));
  const get = (n, max) => execFileSync('sh', ['-c', `unzip -p "$0" "$1" | head -c ${max}`, file, n.replace(/([\[\]*?])/g, '\\$1')], { maxBuffer: 1 << 28 });
  const inner = []; let n = 0;
  // entries that name a zone borough or place first (per-borough zips: the zone boroughs are read within the cap)
  const zoneFirst = new RegExp(`(${['tower.?hamlets', 'southwark', 'lewisham', 'greenwich', 'newham', 'city.?of.?london', ...ZONE_PLACE_NAMES.map(x => x.replace(/ /g, '.?'))].join('|')})`, 'i');
  names.sort((a, b) => zoneFirst.test(b) - zoneFirst.test(a));
  for (const name of names) {
    if (n >= 12) break;
    const e = (/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toLowerCase(), lab = `${label}/${name}`;
    try {
      if (e === 'shp') {
        const shp = get(name, CAPS.zip), h = shpBbox(shp); const stem = name.slice(0, -4), find = x => names.find(m => m.toLowerCase() === (stem + x).toLowerCase());
        const prj = find('.prj') ? get(find('.prj'), 4000).toString() : '';
        const srs = /British_National_Grid|OSGB_1936|OSGB36|27700/i.test(prj) ? 27700 : /WGS_1984|4326/i.test(prj) && !/Mercator/i.test(prj) ? 4326 : (h.bbox[0] > 1000 ? 27700 : 4326);
        scanEnvelopes(S, shpEnvelopes(shp), srs, lab, h.bbox);
        if (find('.dbf')) scanTable(S, refs, dbfRows(get(find('.dbf'), 64e6), /utf-?8/i.test(find('.cpg') ? get(find('.cpg'), 100).toString() : '')), lab + ' (dbf)');
        inner.push(name); n++;
      } else if (READABLE[e] === 'text') { readTextSample(S, refs, get(name, CAPS.text), e, lab); inner.push(name); n++; }
      else if (READABLE[e] === 'sheet') { await readSheet(S, refs, get(name, CAPS.sheet), lab); inner.push(name); n++; }
      else if (e === 'gpkg') { const t = join(tmpdir(), 'lds-probe-' + process.pid + '.gpkg'); writeFileSync(t, get(name, CAPS.gpkg)); try { await readGpkgSample(S, refs, t, lab); } finally { rmSync(t, { force: true }); } inner.push(name); n++; }
      else if (e === 'tab' || e === 'mif') { scanText(S, refs, get(name, 20000).toString('latin1')); }
    } catch (err) { S.sources.push(`${lab}: ${err.message.slice(0, 80)}`); }
  }
  return { entries: names.length, read: inner };
}

// ---- the area class from the signals (first rule that matches)
export const AREA_RULES = [
  ['zone-point', 'D1: a coordinate in the sample (a row\'s lat/lon or easting/northing, a feature\'s point or envelope) lies in or meets the zone (3D model box)'],
  ['zone-uprn', 'D2: a UPRN in the sample is a zone UPRN (OS Open UPRN inside the box)'],
  ['zone-postcode', 'D2: 3 or more distinct full postcodes in the sample are zone postcodes (ONSPD grid reference inside the box); one or two are often the publisher\'s own address'],
  ['zone-code', 'D3: an OA, LSOA, MSOA or ward code in the sample is a zone code (zone-codes.json)'],
  ['zone-place', 'D4: cells name 2 or more distinct places in the zone, 3 or more times (Canary Wharf, Isle of Dogs, Poplar, Rotherhithe, Deptford, Royal Docks...); the weakest zone rule: names of wards, constituencies, stations or town centres, without codes'],
  ['london-fine', 'D5: finer than a borough, London-wide, but no zone value in the sample (5 or more coordinates in London, small-area codes, 20 or more postcodes, UPRNs or TOIDs)'],
  ['borough-rows', 'D6: rows for zone boroughs (E09 code or name), nothing finer'],
  ['london-coarse', 'D7: London, region or national rows only; or only boroughs outside the zone'],
  ['none', 'D8: no geography found in the sample'],
];
export function classify(S) {
  const C = S.coords, zc = Object.entries(S.zoneCodes).map(([k, v]) => `${k} ${v.size}`);
  const ev = [];
  if (C) ev.push(`coordinates ${C.columns.slice(0, 3).join('; ')}${C.columns.length > 3 ? ` (+${C.columns.length - 3} layers)` : ''}: ${C.n} rows or features read, ${C.london} in London, ${C.zone} in the zone`);
  if (S.uprn) ev.push(`UPRN column "${S.uprn.column}": ${S.uprn.n} values, ${S.uprn.zone} zone UPRNs, ${S.uprn.rounded} rounded`);
  if (S.toid) ev.push('TOID column');
  if (S.postcodes.n) ev.push(`postcodes: ${S.postcodes.n}, ${S.postcodes.zone} in the zone (${S.postcodes.zoneSet.size} distinct)${S.postcodes.sample.length ? ' (' + S.postcodes.sample.join(', ') + ')' : ''}`);
  const codes = Object.entries(S.codes).map(([k, v]) => `${k} ${v}`); if (codes.length) ev.push(`codes: ${codes.join(', ')}${zc.length ? '; zone codes: ' + zc.join(', ') : ''}`);
  if (S.boroughs.zone.size || S.boroughs.other.size) ev.push(`boroughs: ${S.boroughs.zone.size} zone, ${S.boroughs.other.size} other`);
  const pl = Object.entries(S.places).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`); if (pl.length) ev.push(`zone place names: ${pl.join(', ')}`);
  if (S.london) ev.push('London rows'); if (S.national) ev.push('national/regional rows');
  ev.push(`${S.rows} rows read`);
  const zonePc = S.postcodes.zoneSet.size, plN = Object.keys(S.places).length, plCells = Object.values(S.places).reduce((a, b) => a + b, 0);
  const fine = (C && C.london >= 5) || ['oa', 'lsoa', 'msoa', 'ward'].some(k => S.codes[k]) || S.postcodes.n >= 20 || (S.uprn && S.uprn.n) || S.toid;
  const cls = (C && C.zone) ? 'zone-point' : S.uprn?.zone ? 'zone-uprn' : zonePc >= 3 ? 'zone-postcode' : zc.length ? 'zone-code'
    : plN >= 2 && plCells >= 3 ? 'zone-place' : fine ? 'london-fine' : S.boroughs.zone.size ? 'borough-rows'
    : (S.boroughs.other.size || S.london || S.national) ? 'london-coarse' : 'none';
  return { area: cls, rule: AREA_RULES.find(r => r[0] === cls)[1], evidence: ev.join('; ') };
}
export const finishSignals = S => ({ ...S, postcodes: { n: S.postcodes.n, zone: S.postcodes.zone, zone_distinct: S.postcodes.zoneSet.size, sample: S.postcodes.sample }, boroughs: { zone: [...S.boroughs.zone], other: S.boroughs.other.size }, zoneCodes: Object.fromEntries(Object.entries(S.zoneCodes).map(([k, v]) => [k, [...v].slice(0, 10).concat(v.size > 10 ? [`+${v.size - 10}`] : [])])) });
