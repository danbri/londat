#!/usr/bin/env node
// Recover UPRNs that a spreadsheet rounded (1E+11, 200000000000), in a COPY of a file, with every change recorded.
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/amend-uprns.mjs cultural-infrastructure [--refresh] [--validate]
//   node magpie/cwplans/tools/amend-uprns.mjs --in <file.geojson|.csv> --uprn-field <f> --id-field <f[,f]> \
//        [--name-field name] [--group-field layer] [--ref a:<file>]... [--ref c:<file>]... \
//        [--open-uprn <osopenuprn zip or csv>] [--footprints <osm-clip.json.gz>] --out <copy> --amendments <json>
// The source file is read, never written. Only cells in the rounded classes are changed; each change and each
// value left unknown is in the amendments file (row id, column, old, new, route, evidence, confidence, date).
// Routes, stop at the first that works: (a) the same dataset in other formats or versions, (b) OS Open UPRN points
// in the venue's building outline, (c) registers with UPRNs; else (d) unknown with the reason. Never a guess.
// Method, detection classes, confidence rules and the reasons: skills/cwplans-london-datastore/SKILL.md,
// "Amending rounded UPRNs"; fault F22 in skills/docklands-data-curation/SKILL.md.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join, dirname, basename, relative } from 'path';
import { execFileSync, spawn } from 'child_process';
import { createInterface } from 'readline';
import { gunzipSync } from 'zlib';
import { RAW, UA, TOOLS, bngProjector, pointIn, joinRings } from './lib.mjs';
import { cwPath, LONDAT_CW } from './londat.mjs';

const CW = join(TOOLS, '..');
const RAWDIR = join(RAW, 'uprn-amend');
const today = new Date().toISOString().slice(0, 10);
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const opts = n => argv.flatMap((a, i) => a === n ? [argv[i + 1]] : []);
const REFRESH = flag('--refresh');

// ---------------------------------------------------------------- thresholds (the written rules use these numbers)
const NEAR_REF_M = 50;          // route a/c: a reference row is the same venue only within this distance
const OPEN_UPRN_NEAR_M = 150;   // a UPRN point further than this from the venue is not the venue's (F17's limit)
const NO_OUTLINE_M = 10;        // route b: venue point in no outline -> UPRN points within this distance
const EXACT_M = 1;              // route b: the venue point IS the UPRN point (the publisher geocoded from it)
const NARROW = 1e6;             // route b: a rounded value that keeps 6 of 12 digits leaves a range of 1e6
const DUP_APART_M = 50;
const SMALL_OUTLINE = 25;        // route b: an outline with at most this many UPRN points (not a block of flats or offices)         // duplicate class: one UPRN on venues with other names this far apart

// ---------------------------------------------------------------- recipes (dataset-specific inputs; the code below is generic)
const LDS = 'https://data.london.gov.uk/download';
const RECIPES = {
  'cultural-infrastructure': {
    in: 'feeds/london-datastore/cultural-infrastructure/cultural-infrastructure.geojson',
    out: 'feeds/london-datastore/cultural-infrastructure/cultural-infrastructure.uprn-amended.geojson',
    amendments: 'feeds/london-datastore/cultural-infrastructure/cultural-infrastructure.uprn-amendments.json',
    uprnField: 'os_addressbase_uprn', idField: ['layer', 'id'], nameField: 'name', groupField: 'layer',
    // route a: every CSV, zip and venue GeoPackage of the 2023 dataset (23697, all revisions), the 2018-2020
    // Cultural Infrastructure Map (2ko88) and the 2024 LGBTQ+ list (2zj1y), all OGL v3 (catalogue.json); the 2025
    // list (2rj5o) has no licence on the Datastore and is not used. Plus the GLA's public ArcGIS map service of 2023.
    datastore: { catalogue: 'feeds/london-datastore/catalogue.json', datasets: ['23697', '2ko88', '2zj1y'],
      skip: /CEZ|Creative_Enterprise_Zone|site_by_cez/i, formats: ['csv', 'zip', 'gpkg'] },
    arcgis: 'https://gis.london.gov.uk/arcgis/rest/services/apps/Cultural_infrastructure_2023_for_webapp_verified/MapServer',
    zoneBng: [532400, 176700, 539900, 182300],
    refC: ['registry/sources/registers/gias.json', 'registry/sources/registers/ods.json', 'registry/sources/registers/active-places.json'],
    openUprn: 'data/raw/registry/osopenuprn_202609_csv.zip',
    footprints: 'data/raw/docklands/osm-clip.json.gz',
    registry: 'registry/buildings.json',
    // validation of route a uses only other releases (2ko88, 2zj1y): rows of the 2023 release would agree with themselves
    sameRelease: /^lds 23697 |^GLA ArcGIS/,
  },
};

// ---------------------------------------------------------------- polite fetch (one at a time, >= 1.1 s apart, backoff)
let chain = Promise.resolve(), last = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function politeFetch(url, tries = 6) {
  const run = async () => {
    for (let k = 1; ; k++) {
      const wait = last + 1100 - Date.now(); if (wait > 0) await sleep(wait);
      last = Date.now();
      let r, err; try { r = await fetch(url, { headers: { 'User-Agent': UA } }); } catch (e) { err = e; }
      if (r && r.ok) { const b = Buffer.from(await r.arrayBuffer()); last = Date.now(); return b; }
      if (!(err || r.status === 429 || r.status >= 500) || k >= tries) throw new Error(`${err ? err.message : r.status} ${url}`);
      await sleep(1100 * 2 ** k);
    }
  };
  const p = chain.then(run, run); chain = p.catch(() => {}); return p;
}
async function rawFile(name, url) {
  const f = join(RAWDIR, name); mkdirSync(dirname(f), { recursive: true });
  if (!REFRESH && existsSync(f) && statSync(f).size > 0) return f;
  writeFileSync(f, await politeFetch(url)); return f;
}

// ---------------------------------------------------------------- readers -> rows { name, uprn, lat, lon, e, n, address, where }
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(head.map((h, i) => [h.trim(), r[i]])));
}
const pick = (o, res) => { for (const re of res) for (const k of Object.keys(o)) if (re.test(k) && o[k] != null && String(o[k]).trim() !== '') return o[k]; return undefined; };
function toRow(o, where, xy) {
  const num = v => (v == null || String(v).trim() === '' || !isFinite(+v)) ? undefined : +v;
  const uprn = pick(o, [/^os_addressbase_uprn$/i, /^uprn$/i, /uprn/i]);
  const r = {
    name: pick(o, [/^name$/i, /^site_name$/i, /^establishmentname$/i]), uprn: uprn == null ? undefined : String(uprn),
    lat: num(pick(o, [/^lat(itude)?$/i])), lon: num(pick(o, [/^(lon|long|longitude|lng)$/i])),
    e: num(pick(o, [/^(easting|e|x_bng)$/i])), n: num(pick(o, [/^(northing|n|y_bng)$/i])),
    address: pick(o, [/^address1$/i, /^address$/i]), where,
  };
  if (xy) Object.assign(r, xy);
  return r;
}
function gpkgPoint(b) {   // GeoPackage binary header + WKB point -> [x, y] or null
  const buf = b && Buffer.from(b.buffer ? b : [], b.byteOffset, b.byteLength);
  if (!buf || buf[0] !== 0x47 || buf[1] !== 0x50) return null;
  const flags = buf[3], env = [0, 32, 48, 48, 64][(flags >> 1) & 7] ?? 0, o = 8 + env, le = buf[o] === 1;
  const type = le ? buf.readUInt32LE(o + 1) : buf.readUInt32BE(o + 1);
  if ((type % 1000) !== 1) return null;
  return le ? [buf.readDoubleLE(o + 5), buf.readDoubleLE(o + 13)] : [buf.readDoubleBE(o + 5), buf.readDoubleBE(o + 13)];
}
// UTF-8, else Windows-1252 (spreadsheet exports are often not UTF-8)
const text = buf => { const u = buf.toString('utf8'); return u.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(buf) : u; };
async function readRef(file, label) {
  const ext = file.split('.').pop().toLowerCase(), out = [];
  if (ext === 'csv') for (const o of parseCsv(readFileSync(file, 'latin1').includes('�') ? readFileSync(file, 'utf8') : readFileSync(file, 'utf8'))) out.push(toRow(o, label));
  else if (ext === 'zip') {
    for (const m of execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).split('\n').filter(m => /\.csv$/i.test(m)))
      for (const o of parseCsv(text(execFileSync('unzip', ['-p', file, m], { maxBuffer: 1e9 })))) out.push(toRow(o, `${label} > ${m}`));
  } else if (ext === 'gpkg') {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(file, { readOnly: true });
    for (const { table_name: t } of db.prepare("select table_name from gpkg_contents where data_type = 'features'").all()) {
      const gc = db.prepare('select column_name, srs_id from gpkg_geometry_columns where table_name = ?').get(t);
      for (const o of db.prepare(`select * from "${t}"`).all()) {
        const p = gc && gpkgPoint(o[gc.column_name]); delete o[gc?.column_name];
        const xy = p ? (gc.srs_id === 4326 ? { lon: p[0], lat: p[1] } : gc.srs_id === 27700 ? { e: p[0], n: p[1] } : null) : null;
        out.push(toRow(o, `${label} > ${t}`, xy));
      }
    }
    db.close();
  } else if (ext === 'geojson' || ext === 'json') {
    const j = JSON.parse(readFileSync(file, 'utf8'));
    const arr = j.features || (Array.isArray(j) ? j : j.records || j.entries || Object.values(j).find(Array.isArray) || []);
    for (const f of arr) {
      const props = f.properties || f, g = f.geometry;
      const xy = g?.type === 'Point' ? { lon: g.coordinates[0], lat: g.coordinates[1] } : null;
      out.push(toRow(props, `${label}${f.properties?.layer ? ' > ' + f.properties.layer : ''}`, xy));
    }
  }
  return out;
}

// ---------------------------------------------------------------- the fault class of a UPRN cell
// rounded classes (amended): scientific, trailing-zeros. Catalogued only: empty, text, decimal, out-of-range,
// padded (spaces around a valid value), duplicate, not-in-open-uprn, far-from-open-uprn.
function classify(raw) {
  if (raw == null || String(raw).trim() === '') return 'empty';
  const s = String(raw).trim();
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) return 'scientific';
  if (/^\d+\.\d+$/.test(s)) return 'decimal';
  if (!/^\d+$/.test(s)) return 'text';
  if (s.length > 12 || /^0+$/.test(s)) return 'out-of-range';
  if (s.length >= 9 && /0{5}$/.test(s)) return 'trailing-zeros';
  return s === String(raw) ? 'ok' : 'padded';
}
const ROUNDED = new Set(['scientific', 'trailing-zeros']);
const usable = c => c === 'ok' || c === 'padded';
// the range a rounded value came from: Excel rounds to k significant digits, so the true value is within half a unit
// of the last kept digit. Scientific text gives k (1.00023E+11: 6); plain digits give at least the non-zero prefix.
function rangeOf(raw) {
  const s = String(raw).trim();
  let v, unit;
  const m = /^(\d+)(?:\.(\d+))?e\+?(\d+)$/i.exec(s);
  if (m) { const k = m[1].length + (m[2] || '').length; v = Number(s); unit = 10 ** (+m[3] - (k - 1) - (m[1].length - 1)); }
  else { v = Number(s); const nz = s.replace(/0+$/, '').length; unit = 10 ** (s.length - nz); }
  return [v - unit / 2, v + unit / 2];
}
const intersect = (a, b) => [Math.max(a[0], b[0]), Math.min(a[1], b[1])];
const inRange = (u, r) => { const x = Number(u); return x >= r[0] && x < r[1]; };

// ---------------------------------------------------------------- names
const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ')
  .replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|ltd|limited)\b/g, ' ').replace(/\s+/g, ' ').trim();
function nameMatch(a, b) {
  const x = norm(a), y = norm(b); if (!x || !y) return null;
  if (x === y) return 'exact';
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 8 && (` ${l} `).includes(` ${s} `) ? 'contains' : null;
}

// ---------------------------------------------------------------- inputs of a run
async function prepareRecipe(R) {
  const refsA = [];
  if (R.datastore) {
    const cj = JSON.parse(readFileSync(cwPath(R.datastore.catalogue), 'utf8')), cat = cj.datasets || cj;
    for (const id of R.datastore.datasets) {
      const d = cat.find(x => x.id === id); if (!d) throw new Error(`dataset ${id} not in ${R.datastore.catalogue}`);
      if (!/Open Government Licence/i.test(d.licence || '')) throw new Error(`dataset ${id}: licence ${d.licence}; not used`);
      for (const r of d.resources.filter(r => R.datastore.formats.includes(r.format) && !R.datastore.skip.test(decodeURIComponent(r.file)))) {
        const f = await rawFile(join(id, decodeURIComponent(r.file)), `${LDS}/${id}/${r.id}/${r.file}`);
        refsA.push({ file: f, label: `lds ${id} ${decodeURIComponent(r.file)} (${r.date})`, source: `lds-${id}`, url: `${LDS}/${id}/${r.id}/${r.file}` });
      }
    }
  }
  if (R.arcgis) {
    const svc = JSON.parse(readFileSync(await rawFile('arcgis/service.json', `${R.arcgis}?f=json`), 'utf8'));
    const [e0, n0, e1, n1] = R.zoneBng, env = encodeURIComponent(JSON.stringify({ xmin: e0, ymin: n0, xmax: e1, ymax: n1, spatialReference: { wkid: 27700 } }));
    for (const L of svc.layers.filter(l => l.type === 'Feature Layer')) {
      const feats = [];
      for (let off = 0; ; off += 1000) {
        const url = `${R.arcgis}/${L.id}/query?where=1%3D1&geometry=${env}&geometryType=esriGeometryEnvelope&inSR=27700&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&returnGeometry=true&resultOffset=${off}&resultRecordCount=1000&f=geojson`;
        const j = JSON.parse(readFileSync(await rawFile(`arcgis/layer-${L.id}-${off}.geojson`, url), 'utf8'));
        feats.push(...(j.features || [])); if (!j.properties?.exceededTransferLimit && !(j.exceededTransferLimit) && (j.features || []).length < 1000) break;
      }
      const f = join(RAWDIR, `arcgis/layer-${L.id}.all.geojson`);
      writeFileSync(f, JSON.stringify({ type: 'FeatureCollection', features: feats.map(x => ({ ...x, properties: { ...x.properties, layer: L.name } })) }));
      refsA.push({ file: f, label: `GLA ArcGIS ${basename(R.arcgis.replace(/\/MapServer$/, ''))} layer ${L.id} ${L.name}`, source: 'gla-cim-arcgis', url: `${R.arcgis}/${L.id}` });
    }
  }
  return {
    in: cwPath(R.in), out: cwPath(R.out), amendments: cwPath(R.amendments), uprnField: R.uprnField, idField: R.idField,
    nameField: R.nameField, groupField: R.groupField, refsA, refsC: R.refC.map(f => ({ file: cwPath(f), label: f, source: f })),
    openUprn: cwPath(R.openUprn), footprints: cwPath(R.footprints), registry: R.registry && cwPath(R.registry), zoneBng: R.zoneBng, sameRelease: R.sameRelease,
  };
}
function prepareArgs() {
  const refs = opts('--ref').map(s => { const [route, ...p] = s.split(':'); return { route, file: p.join(':'), label: p.join(':'), source: p.join(':') }; });
  return {
    in: opt('--in'), out: opt('--out'), amendments: opt('--amendments'), uprnField: opt('--uprn-field'), idField: (opt('--id-field') || 'id').split(','),
    nameField: opt('--name-field') || 'name', groupField: opt('--group-field'), refsA: refs.filter(r => r.route === 'a'), refsC: refs.filter(r => r.route === 'c'),
    openUprn: opt('--open-uprn'), footprints: opt('--footprints'), registry: opt('--registry'),
  };
}

// ---------------------------------------------------------------- main
const recipeKey = argv.find(a => !a.startsWith('--') && RECIPES[a]);
const P = recipeKey ? await prepareRecipe(RECIPES[recipeKey]) : prepareArgs();
if (!P.in || !P.out || !P.amendments || !P.uprnField) { console.error('usage: see the header of this file'); process.exit(2); }
const toBNG = await bngProjector();
const src = JSON.parse(readFileSync(P.in, 'utf8'));
const isGeo = Array.isArray(src.features);
const feats = isGeo ? src.features : parseCsv(readFileSync(P.in, 'utf8')).map(o => ({ properties: o }));
const rows = feats.map((f, i) => {
  const p = f.properties, g = f.geometry;
  const [lon, lat] = g?.type === 'Point' ? g.coordinates : [+p.longitude, +p.latitude];
  const [e, n] = toBNG(lon, lat);
  return { i, rid: P.idField.map(k => p[k]).join('#'), name: p[P.nameField], raw: p[P.uprnField], cls: classify(p[P.uprnField]), group: P.groupField ? p[P.groupField] : '', e, n };
});
const dist = (a, b) => Math.hypot(a.e - b.e, a.n - b.n);
const bbox = rows.reduce((b, r) => [Math.min(b[0], r.e), Math.min(b[1], r.n), Math.max(b[2], r.e), Math.max(b[3], r.n)], [Infinity, Infinity, -Infinity, -Infinity]);
const M = 300, inBox = (e, n) => e >= bbox[0] - M && e <= bbox[2] + M && n >= bbox[1] - M && n <= bbox[3] + M;

// ---- OS Open UPRN, clipped to the rows' box (+300 m), cached in data/raw/uprn-amend/
const openUprn = new Map(), uprnGrid = new Map();
const cell = (e, n) => `${Math.floor(e / 50)},${Math.floor(n / 50)}`;
if (P.openUprn) {
  const clip = join(RAWDIR, `open-uprn-clip-${bbox.map(v => Math.round(v)).join('-')}.csv`);
  if (!existsSync(clip) || REFRESH) {
    const lines = ['UPRN,X_COORDINATE,Y_COORDINATE'];
    const child = P.openUprn.endsWith('.zip') ? spawn('unzip', ['-p', P.openUprn, '*.csv'], { stdio: ['ignore', 'pipe', 'inherit'] }) : null;
    const input = child ? child.stdout : (await import('fs')).createReadStream(P.openUprn);
    for await (const l of createInterface({ input, crlfDelay: Infinity })) { const f = l.split(','); const e = +f[1], n = +f[2]; if (inBox(e, n)) lines.push(`${f[0]},${e},${n}`); }
    mkdirSync(RAWDIR, { recursive: true }); writeFileSync(clip, lines.join('\n') + '\n');
  }
  for (const l of readFileSync(clip, 'utf8').split('\n').slice(1)) {
    const f = l.split(','); if (!f[0]) continue;
    const u = { uprn: f[0], e: +f[1], n: +f[2] }; openUprn.set(u.uprn, u);
    const k = cell(u.e, u.n); if (!uprnGrid.has(k)) uprnGrid.set(k, []); uprnGrid.get(k).push(u);
  }
  console.log(`OS Open UPRN: ${openUprn.size} points in the rows' box + ${M} m (${relative(CW, clip)})`);
}
const uprnsNear = (p, r) => { const out = []; for (let x = Math.floor((p.e - r) / 50); x <= Math.floor((p.e + r) / 50); x++) for (let y = Math.floor((p.n - r) / 50); y <= Math.floor((p.n + r) / 50); y++) for (const u of uprnGrid.get(`${x},${y}`) || []) if (dist(u, p) <= r) out.push(u); return out; };

// ---- building outlines (OSM building=* ways and multipolygons), BNG; the registry's cwb ids by OSM element
const outlines = [], olGrid = new Map(), cwbByOsm = new Map();
if (P.registry && existsSync(P.registry)) for (const b of JSON.parse(readFileSync(P.registry, 'utf8')).buildings) for (const o of b.osm || []) cwbByOsm.set(o, b.id);
if (P.footprints) {
  const osm = JSON.parse(gunzipSync(readFileSync(P.footprints)));
  const ways = new Map(osm.ways.map(w => [w.id, w]));
  const ring = ids => ids.map(id => osm.nodes[id] ? toBNG(...osm.nodes[id]) : null);
  const add = (el, rings) => { for (const r of rings) { if (r.some(p => !p) || r.length < 4) continue; const xs = r.map(p => p[0]), ys = r.map(p => p[1]);
    const o = { osm: el, ring: r, bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }; o.area = Math.abs(r.reduce((s, a, i) => { const b = r[(i + 1) % r.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2);
    if (!inBox((o.bb[0] + o.bb[2]) / 2, (o.bb[1] + o.bb[3]) / 2)) continue; outlines.push(o);
    for (let x = Math.floor(o.bb[0] / 50); x <= Math.floor(o.bb[2] / 50); x++) for (let y = Math.floor(o.bb[1] / 50); y <= Math.floor(o.bb[3] / 50); y++) { const k = `${x},${y}`; if (!olGrid.has(k)) olGrid.set(k, []); olGrid.get(k).push(o); } } };
  const isB = t => t && t.building && t.building !== 'no';
  for (const w of osm.ways) if (isB(w.tags) && w.refs[0] === w.refs.at(-1)) add(`way/${w.id}`, [ring(w.refs)]);
  for (const r of osm.rels) if (isB(r.tags)) { const rs = joinRings(r.members.filter(m => m.type === 'way' && m.role !== 'inner').map(m => ways.get(m.ref)?.refs)); if (rs) add(`relation/${r.id}`, rs.map(ring)); }
  console.log(`building outlines: ${outlines.length} in the rows' box`);
}
const outlineAt = p => (olGrid.get(cell(p.e, p.n)) || []).filter(o => p.e >= o.bb[0] && p.e <= o.bb[2] && p.n >= o.bb[1] && p.n <= o.bb[3] && pointIn([p.e, p.n], o.ring)).sort((a, b) => a.area - b.area)[0] || null;
const uprnsInOutline = o => { const out = []; for (let x = Math.floor(o.bb[0] / 50); x <= Math.floor(o.bb[2] / 50); x++) for (let y = Math.floor(o.bb[1] / 50); y <= Math.floor(o.bb[3] / 50); y++) for (const u of uprnGrid.get(`${x},${y}`) || []) if (pointIn([u.e, u.n], o.ring)) out.push(u); return out; };

// ---- catalogue every cell: class counts, duplicates, the reference check, per-group position offsets
const catalogue = { rows: rows.length, by_class: {}, duplicate: [], not_in_open_uprn: [], far_from_open_uprn: [], group_offsets: {} };
for (const r of rows) catalogue.by_class[r.cls] = (catalogue.by_class[r.cls] || 0) + 1;
const byVal = new Map();
for (const r of rows) if (usable(r.cls) || ROUNDED.has(r.cls)) { const v = String(r.raw).trim(); if (!byVal.has(v)) byVal.set(v, []); byVal.get(v).push(r); }
for (const [v, rs] of byVal) {
  const clash = rs.some(a => rs.some(b => nameMatch(a.name, b.name) === null && dist(a, b) > DUP_APART_M));
  if (clash) { catalogue.duplicate.push({ value: v, rows: rs.length, names: [...new Set(rs.map(r => r.name))].length, rounded: ROUNDED.has(rs[0].cls) }); for (const r of rs) r.dup = true; }
}
const offsets = {};
if (openUprn.size) for (const r of rows.filter(r => usable(r.cls))) {
  const u = openUprn.get(String(r.raw).trim());
  if (!u) { catalogue.not_in_open_uprn.push({ row: r.rid, name: r.name, value: String(r.raw).trim() }); continue; }
  const d = dist(u, r); r.refDist = d;
  if (d > OPEN_UPRN_NEAR_M) catalogue.far_from_open_uprn.push({ row: r.rid, name: r.name, value: String(r.raw).trim(), m: Math.round(d) });
  (offsets[r.group] ||= []).push([u.e - r.e, u.n - r.n]);
}
// a group (layer) whose venue points sit a constant vector away from their own UPRN points: modal 5 m bin over 50 m
const groupShift = {};
for (const [g, v] of Object.entries(offsets)) {
  const bins = new Map(); for (const [dx, dy] of v) { const k = `${Math.round(dx / 5)},${Math.round(dy / 5)}`; bins.set(k, (bins.get(k) || 0) + 1); }
  const [kb, cnt] = [...bins].sort((a, b) => b[1] - a[1])[0];
  const [bx, by] = kb.split(',').map(x => +x * 5), mem = v.filter(([dx, dy]) => Math.hypot(dx - bx, dy - by) <= 10);
  const mean = [mem.reduce((s, x) => s + x[0], 0) / mem.length, mem.reduce((s, x) => s + x[1], 0) / mem.length];
  const near = v.filter(([dx, dy]) => Math.hypot(dx, dy) <= 25).length;
  const shifted = Math.hypot(...mean) > 50 && mem.length >= 3 ? mem.length : 0;
  catalogue.group_offsets[g] = { with_uprn_point: v.length, within_25m: near, shifted, shift_m: shifted ? mean.map(x => Math.round(x)) : null };
  if (shifted && shifted / v.length >= 0.25) groupShift[g] = mean;
}

// ---- reference rows
const loadAll = async list => (await Promise.all(list.map(async R => (await readRef(R.file, R.label)).map(x => ({ ...x, source: R.source }))))).flat()
  .map(x => { if (x.lat > 49 && x.lat < 61 && x.lon > -9 && x.lon < 3) { const [e, n] = toBNG(x.lon, x.lat); x.e = e; x.n = n; } else if (!(x.e > 0)) x.e = x.n = undefined; x.cls = classify(x.uprn); return x; });
const refA = await loadAll(P.refsA), refC = await loadAll(P.refsC);
console.log(`route a reference rows: ${refA.length} from ${P.refsA.length} files; route c: ${refC.length}`);

function viaRefs(s, refs, route) {
  const m = refs.filter(r => { const nm = nameMatch(r.name, s.name); if (!nm) return false;
    r._nm = nm; r._d = r.e != null ? dist(r, s) : null;
    return r._d != null ? r._d <= NEAR_REF_M : nameMatch(r.address, s.address) === 'exact'; }).map(r => ({ ...r, nm: r._nm, d: r._d }));
  let range = s.range; const tightened = [];
  for (const r of m.filter(r => ROUNDED.has(r.cls))) { const nr = intersect(range, rangeOf(r.uprn)); if (nr[0] < nr[1]) { if (nr[1] - nr[0] < range[1] - range[0]) tightened.push(`${r.uprn} (${r.where})`); range = nr; } }
  const ok = m.filter(r => usable(r.cls)), cands = new Map(), outside = new Set();
  for (const r of ok) { const u = String(r.uprn).trim(); if (inRange(u, range)) { if (!cands.has(u)) cands.set(u, []); cands.get(u).push(r); } else outside.add(u); }
  return { route, matches: m.length, range, tightened, cands, outside: [...outside] };
}
function viaOutline(s) {
  const pts = [{ e: s.e, n: s.n, how: 'venue point' }];
  if (groupShift[s.group]) pts.push({ e: s.e + groupShift[s.group][0], n: s.n + groupShift[s.group][1], how: `venue point moved by its layer's measured offset (${groupShift[s.group].map(Math.round).join(', ')} m)` });
  const cands = new Map(), seen = [];
  for (const p of pts) {
    const o = outlineAt(p);
    const all = o ? uprnsInOutline(o) : uprnsNear(p, NO_OUTLINE_M);
    seen.push({ point: p.how, outline: o ? o.osm : null, registry: o ? cwbByOsm.get(o.osm) || null : null, uprns_there: all.length });
    for (const u of all.filter(u => inRange(u.uprn, s.range))) { const d = dist(u, p); const c = cands.get(u.uprn); if (!c || d < c.d) cands.set(u.uprn, { d, p, o }); }
  }
  return { route: 'b', seen, cands };
}

// ---- recover the rounded cells, one venue at a time (rows of one venue in several layers get one answer)
const amendments = [], unresolved = [];
const suspects = rows.filter(r => ROUNDED.has(r.cls));
const venues = [];
for (const s of suspects) {
  s.range = rangeOf(s.raw);
  const v = venues.find(v => v.rows.some(r => nameMatch(r.name, s.name) === 'exact' && dist(r, s) <= NEAR_REF_M));
  if (v) { v.rows.push(s); v.range = intersect(v.range, s.range); } else venues.push({ rows: [s], range: s.range });
}
const union = list => { const m = new Map(); for (const x of list) for (const [u, c] of x.cands) { if (!m.has(u)) m.set(u, []); m.get(u).push(...(Array.isArray(c) ? c : [c])); } return m; };
const minD = cs => Math.min(...cs.map(c => c.d));
for (const v of venues) {
  if (!(v.range[0] < v.range[1])) { for (const s of v.rows) unresolved.push({ row_id: s.rid, name: s.name, column: P.uprnField, old_value: String(s.raw), reason: 'rows of this venue carry rounded values that do not overlap' }); continue; }
  for (const s of v.rows) s.range = v.range;
  const tried = {};
  const done = (route, uprn, confidence, evidence) => {
    const applied = confidence !== 'low';
    for (const s of v.rows) {
      amendments.push({ row_id: s.rid, name: s.name, column: P.uprnField, old_value: String(s.raw), new_value: uprn, route, confidence, applied, evidence, date: today });
      if (applied) s.amended = { uprn, route, confidence, n: amendments.length };
      else unresolved.push({ row_id: s.rid, name: s.name, column: P.uprnField, old_value: String(s.raw), reason: `only a low-confidence candidate (${uprn}, route ${route}); not applied`, tried });
    }
  };
  // (a) same dataset, other formats and versions: the rounded forms there narrow the range first
  const A = v.rows.map(s => viaRefs(s, refA, 'a'));
  let range = v.range; for (const x of A) range = intersect(range, x.range);
  if (range[0] < range[1]) { v.range = range; for (const s of v.rows) s.range = range; }
  const aC = new Map([...union(A)].filter(([u]) => inRange(u, v.range)));
  const aOut = [...new Set(A.flatMap(x => x.outside))].filter(u => !aC.has(u));
  tried.a = { matches: A.reduce((n, x) => n + x.matches, 0), candidates: [...aC.keys()], outside_range: aOut, range: v.range.map(Math.round), tightened_by: [...new Set(A.flatMap(x => x.tightened))] };
  if (aC.size === 1) {
    const [u, rs] = [...aC][0], up = openUprn.get(u), s = v.rows[0];
    const dU = up ? Math.min(...v.rows.map(r => dist(up, r))) : null;
    const g = groupShift[s.group], dUs = up && g ? Math.min(...v.rows.map(r => Math.hypot(up.e - r.e - g[0], up.n - r.n - g[1]))) : null;
    const exact = rs.some(r => r.nm === 'exact'), nearU = dU != null && (dU <= OPEN_UPRN_NEAR_M || (dUs != null && dUs <= OPEN_UPRN_NEAR_M));
    const seenRef = new Set();
    done('a', u, exact && nearU ? 'high' : 'medium', { references: rs.filter(r => !seenRef.has(r.where) && seenRef.add(r.where)).map(r => ({ where: r.where, name: r.name, uprn: String(r.uprn).trim(), m: r.d == null ? null : Math.round(r.d), name_match: r.nm })),
      range: v.range.map(Math.round), tightened_by: tried.a.tightened_by, other_values_out_of_range: aOut, open_uprn_m: dU == null ? 'not in OS Open UPRN' : Math.round(dU), open_uprn_m_after_layer_offset: dUs == null ? undefined : Math.round(dUs) });
    continue;
  }
  // (b) OS Open UPRN points in the venue's building outline, inside the range the rounded value allows
  if (openUprn.size) {
    const B = v.rows.map(s => viaOutline(s)), bC = union(B);
    tried.b = { seen: B.flatMap(x => x.seen), candidates: [...bC.keys()] };
    if (bC.size === 1) {
      const [u, cs] = [...bC][0], best = cs.sort((x, y) => x.d - y.d)[0];
      const small = best.o && uprnsInOutline(best.o).length <= SMALL_OUTLINE;
      const conf = best.d <= EXACT_M && best.p.how === 'venue point' && small ? 'medium' : 'low';
      done('b', u, conf, { open_uprn_point_m: Math.round(best.d * 10) / 10, from: best.p.how, outline: best.o ? best.o.osm : `no outline; within ${NO_OUTLINE_M} m`, registry_building: best.o ? cwbByOsm.get(best.o.osm) || null : null, points_seen: tried.b.seen, range: v.range.map(Math.round), range_width: v.range[1] - v.range[0] });
      continue;
    }
  }
  // (c) registers with UPRNs (the registry's joined sources)
  const C = v.rows.map(s => viaRefs(s, refC, 'c')), cC = new Map([...union(C)].filter(([u]) => inRange(u, v.range)));
  tried.c = { matches: C.reduce((n, x) => n + x.matches, 0), candidates: [...cC.keys()] };
  if (cC.size === 1) { const [u, rs] = [...cC][0]; done('c', u, 'medium', { references: rs.map(r => ({ where: r.where, name: r.name, uprn: r.uprn, m: r.d == null ? null : Math.round(r.d) })), range: v.range.map(Math.round) }); continue; }
  // (d) unknown, with the reason
  const why = [];
  why.push(aC.size > 1 ? `a: ${aC.size} different UPRNs in other versions` : tried.a.matches ? `a: ${tried.a.matches} matching rows in other versions, none with a full UPRN in range${aOut.length ? ` (full UPRNs out of range: ${aOut.join(', ')})` : ''}` : 'a: no matching row in other versions');
  if (tried.b) why.push(tried.b.candidates.length > 1 ? `b: ${tried.b.candidates.length} UPRN points in range in the outline (${[...new Set(tried.b.seen.map(x => x.outline || 'no outline'))].join(', ')}); not chosen between` : `b: no UPRN point in range (${tried.b.seen.map(x => `${x.outline || `no outline, ${NO_OUTLINE_M} m`}: ${x.uprns_there} points`).join('; ')})`);
  why.push(cC.size > 1 ? `c: ${cC.size} register UPRNs` : 'c: no register match');
  for (const s of v.rows) unresolved.push({ row_id: s.rid, name: s.name, column: P.uprnField, old_value: String(s.raw), reason: why.join('; '), tried });
}

// ---- validation: hide the rows' own valid UPRNs behind a rounding and see whether routes a and b get them back
let validation = null;
if (flag('--validate') || recipeKey) {
  validation = {};
  const test = rows.filter(r => r.cls === 'ok' && String(r.raw).length === 12 && openUprn.has(r.raw));
  for (const k of [3, 6]) {
    const t = { tested: test.length, b_unique_correct: 0, b_unique_wrong: 0, b_ambiguous: 0, b_none: 0, b_medium_correct: 0, b_medium_wrong: 0, a_unique_correct: 0, a_unique_wrong: 0, a_ambiguous: 0, a_none: 0, wrong: [] };
    for (const r of test) {
      const u = String(r.raw), unit = 10 ** (12 - k), rounded = Math.round(Number(u) / unit) * unit;
      const s = { ...r, range: [rounded - unit / 2, rounded + unit / 2] };
      const a = viaRefs(s, refA.filter(x => !(P.sameRelease && P.sameRelease.test(x.where))), 'a');
      if (!a.cands.size) t.a_none++; else if (a.cands.size > 1) t.a_ambiguous++; else [...a.cands.keys()][0] === u ? t.a_unique_correct++ : (t.a_unique_wrong++, t.wrong.push({ k, route: 'a', row: r.rid, name: r.name, uprn: u, got: [...a.cands.keys()][0] }));
      const b = viaOutline(s);
      if (b.cands.size === 0) { t.b_none++; continue; } if (b.cands.size > 1) { t.b_ambiguous++; continue; }
      const [cu, c] = [...b.cands][0], ok = cu === u; ok ? t.b_unique_correct++ : t.b_unique_wrong++;
      const medium = c.d <= EXACT_M && c.p.how === 'venue point' && c.o && uprnsInOutline(c.o).length <= SMALL_OUTLINE;
      if (medium) ok ? t.b_medium_correct++ : t.b_medium_wrong++;
      if (!ok) t.wrong.push({ k, route: 'b', row: r.rid, name: r.name, uprn: u, got: cu, m: Math.round(c.d * 10) / 10, own_point_m: r.refDist == null ? null : Math.round(r.refDist), medium });
    }
    validation[`k${k}`] = t;
  }
}

// ---- write the amended copy and the amendments file
const copy = JSON.parse(readFileSync(P.in, 'utf8'));
const cf = isGeo ? copy.features : null;
for (const s of suspects) {
  const p = isGeo ? cf[s.i].properties : null; if (!p) continue;
  if (s.amended) { p[P.uprnField] = s.amended.uprn; delete p.uprn_suspect; p.uprn_amended = { from: String(s.raw), route: s.amended.route, confidence: s.amended.confidence, amendment: s.amended.n }; }
  else { p.uprn_suspect = true; p.uprn_unresolved = true; }
}
const counts = {
  rows: rows.length, rounded: suspects.length,
  amended: Object.fromEntries(['a', 'b', 'c'].map(k => [k, amendments.filter(x => x.applied && x.route === k).length])),
  by_confidence: Object.fromEntries(['high', 'medium', 'low'].map(k => [k, amendments.filter(x => x.confidence === k).length])),
  applied: amendments.filter(x => x.applied).length, unknown: unresolved.length,
  distinct_venues_rounded: new Set(suspects.map(s => norm(s.name))).size,
  distinct_venues_amended: new Set(suspects.filter(s => s.amended).map(s => norm(s.name))).size,
};
const rel = f => f.startsWith(LONDAT_CW + '/') ? relative(LONDAT_CW, f) : relative(CW, f);   // paths relative to magpie/cwplans, also for files in the londat checkout
const meta = {
  input: rel(P.in), input_untouched: true, output: rel(P.out), tool: 'tools/amend-uprns.mjs' + (recipeKey ? ` ${recipeKey}` : ''), date: today,
  column: P.uprnField, row_id: P.idField.join('#'),
  method: 'Copy the file; change only cells whose UPRN is in a rounded class (scientific notation; 9 or more digits ending in 5 or more zeros); recover each from (a) the same dataset in other formats and versions, (b) OS Open UPRN points in the venue\'s building outline, (c) registers with UPRNs, stopping at the first route that gives exactly one candidate; else leave it unknown with the reason. The recovered value must lie in the range the rounded value allows. See skills/cwplans-london-datastore/SKILL.md, "Amending rounded UPRNs".',
  rules: [
    'Rounded classes (amended): "scientific" (1.00E+11, 1.00023E+11) and "trailing-zeros" (9 or more digits ending in 5 or more zeros, e.g. 200000000000). Other classes are counted and listed, never changed.',
    'Range: Excel rounds to k significant digits, so the true UPRN lies within half a unit of the last kept digit: 1.00023E+11 -> [100022500000, 100023500000); a plain 200000000000 is read with its non-zero prefix (k = 1) -> [150000000000, 250000000000). Rounded forms of the same venue in other versions narrow the range (intersection).',
    `Route a: a reference row is the same venue when its normalised name equals the venue's (or one contains the other, 8 characters or more) and its point is within ${NEAR_REF_M} m (or, without a point, address1 is the same). Exactly one distinct usable UPRN in range -> amended.`,
    `Route b: the smallest OSM building outline that contains the venue point (no outline: points within ${NO_OUTLINE_M} m); in a layer whose venue points sit a measured constant offset from their own UPRN points, the point moved by that offset is tried too. Exactly one OS Open UPRN point in range -> candidate.`,
    'Route c: as route a, over register rows with UPRNs (GIAS, ODS, Active Places).',
    `Confidence: high = route a with an exact name match and the UPRN's OS Open UPRN point within ${OPEN_UPRN_NEAR_M} m of the venue (or of the venue moved by its layer offset); medium = route a otherwise, route c, or route b when the one candidate's point is within ${EXACT_M} m of the venue's own point (not a moved point) in an outline with at most ${SMALL_OUTLINE} UPRN points; low = any other route b result. High and medium are applied; low is recorded and not applied. Measured precision of each rule: meta.validation.`,
    'Venue: rows with the same normalised name within 50 m are one venue (the same venue in several layers); their ranges are intersected and their candidates pooled, and every row gets the same answer.',
    'Never: a value that is not in a rounded class is not changed; two candidates are never chosen between; the source file is never written.',
  ],
  sources: {
    route_a: P.refsA.map(r => ({ source: r.source, file: r.label, url: r.url })),
    route_b: { open_uprn: P.openUprn ? basename(P.openUprn) : null, footprints: P.footprints ? basename(P.footprints) + ' (OSM building outlines)' : null, registry: P.registry ? rel(P.registry) : null },
    route_c: P.refsC.map(r => r.label),
  },
  counts, validation,
  catalogue: { ...catalogue, duplicate_values: catalogue.duplicate.length, not_in_open_uprn_count: catalogue.not_in_open_uprn.length, far_from_open_uprn_count: catalogue.far_from_open_uprn.length },
};
if (isGeo) copy.meta = { ...copy.meta, uprn_amendment: { amendments_file: rel(P.amendments), tool: meta.tool, date: today, counts, note: 'A copy of the harvested file: only the os_addressbase_uprn cells listed in the amendments file differ. uprn_amended on an amended feature; uprn_suspect and uprn_unresolved where the value is still rounded.' } };
writeFileSync(P.out, isGeo ? JSON.stringify(copy) : '');
writeFileSync(P.amendments, JSON.stringify({ meta, amendments, unresolved }, null, 1) + '\n');
console.log(JSON.stringify({ counts, validation: validation && Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, { ...v, wrong: v.wrong.length }])), duplicate_values: catalogue.duplicate.length, not_in_open_uprn: catalogue.not_in_open_uprn.length, far: catalogue.far_from_open_uprn.length, groupShift: Object.fromEntries(Object.entries(groupShift).map(([k, v]) => [k, v.map(Math.round)])) }, null, 1));
