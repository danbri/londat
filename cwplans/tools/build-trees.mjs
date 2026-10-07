#!/usr/bin/env node
// Trees and green areas for the Docklands 3D model, from open sources, in model metres.
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/build-trees.mjs fetch   # downloads into data/raw/trees/ (network, 2 s between requests)
//   node --max-old-space-size=6000 magpie/cwplans/tools/build-trees.mjs   # builds docklands/data/trees.json (no network, about 2 minutes)
// in:  data/raw/trees/* (fetch), data/raw/docklands/greater_london-latest.osm.pbf (fetch-docklands.mjs osm), the OSTN15 grid
// out: docklands/data/trees.json
// Sources, licences, precedence and the fields dropped: pipeline.json activity "build-trees", data-register.json,
// and the docklands-data-curation skill. Ethics: CLAUDE.md, Data ethics (no notes, memorial, sponsorship, address or
// owner fields ever reach the payload; only position, taxon, height, crown, source and record id).
import { createReadStream, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { createInterface } from 'readline';
import { Writable } from 'stream';
import { createRequire } from 'module';
import { gzipSync, gunzipSync } from 'zlib';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { RAW, TOOLS, UA, bngProjector, clipRing, simplify, joinRings, pointIn, polyArea } from './lib.mjs';
import { DIR as DOCK, BOX_WGS84, BOX_BNG, ORIGIN } from './fetch-docklands.mjs';
const require = createRequire(import.meta.url);

const TR = join(RAW, 'trees');
const OUT = join(TOOLS, '..', 'docklands', 'data', 'trees.json');
const PBF = join(DOCK, 'greater_london-latest.osm.pbf');
const F = {
  gla: join(TR, 'gla-public-realm-trees-2025Nov.csv'),
  osgs: join(TR, 'opgrsp_essh_tq.zip'),
  tpo: join(TR, 'planning-data-tree.json'),
  tow: join(TR, 'tow-london-box.json.gz'),
};
const URL = {
  gla: 'https://data.london.gov.uk/download/2r45m/e62a6a1f-390d-4193-ae32-3aabd9846f36/Borough_tree_list_2025Nov.csv',
  osgs: 'https://api.os.uk/downloads/v1/products/OpenGreenspace/downloads?area=TQ&format=ESRI%C2%AE+Shapefile&redirect',
  tpo: 'https://www.planning.data.gov.uk/entity.json',
  tow: 'https://environment.data.gov.uk/spatialdata/national-trees-outside-woodland-map/ogc/features/v1/collections/FR_TOW_V1_London/items',
};
const [W, S, E, N] = BOX_WGS84;
const BOXPOLY = `POLYGON((${W} ${S},${E} ${S},${E} ${N},${W} ${N},${W} ${S}))`;

// ---------------------------------------------------------------- fetch (network; one request at a time, 2 s apart)
let last = 0;
async function paced(url, tries = 5) {
  for (let k = 1; ; k++) {
    const wait = last + 2000 - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (k >= tries || !(r.status === 429 || r.status >= 500)) throw new Error(`${r.status} ${url}`);
    await new Promise(res => setTimeout(res, 2000 * 2 ** k));
  }
}
async function fetchAll(want) {
  mkdirSync(TR, { recursive: true });
  if (want.includes('gla')) { writeFileSync(F.gla, await paced(URL.gla)); console.log('gla', statSync(F.gla).size); }
  if (want.includes('osgs')) { writeFileSync(F.osgs, await paced(URL.osgs)); console.log('osgs', statSync(F.osgs).size); }
  if (want.includes('tpo')) {
    const entities = [];
    for (let offset = 0; ; offset += 500) {
      const q = new URLSearchParams({ dataset: 'tree', geometry: BOXPOLY, geometry_relation: 'intersects', limit: '500', offset: String(offset) });
      const d = JSON.parse(await paced(`${URL.tpo}?${q}`)); entities.push(...d.entities);
      if (d.entities.length < 500) break;
    }
    writeFileSync(F.tpo, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), query: `${URL.tpo}?dataset=tree&geometry=${BOXPOLY}&geometry_relation=intersects`, entities }));
    console.log('tpo', entities.length);
  }
  if (want.includes('tow')) {
    const features = [];
    for (let start = 0; ; start += 10000) {
      const d = JSON.parse(await paced(`${URL.tow}?f=json&bbox=${W},${S},${E},${N}&limit=10000&startIndex=${start}`));
      for (const f of d.features) features.push({ id: f.id, properties: f.properties, geometry: f.geometry });
      if (d.features.length < 10000) break;
    }
    writeFileSync(F.tow, gzipSync(JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), query: `${URL.tow}?f=json&bbox=${W},${S},${E},${N}`, features })));
    console.log('tow', features.length);
  }
}

// ---------------------------------------------------------------- shared
const h5 = v => Math.round(v * 2) / 2;                       // 0.5 m
const inBng = (e, n) => e >= BOX_BNG.e0 && e <= BOX_BNG.e1 && n >= BOX_BNG.n0 && n <= BOX_BNG.n1;
const toLocal = (e, n) => [e - ORIGIN.E0, -(n - ORIGIN.N0)];
const XB = { x0: BOX_BNG.e0 - ORIGIN.E0, x1: BOX_BNG.e1 - ORIGIN.E0, z0: -(BOX_BNG.n1 - ORIGIN.N0), z1: -(BOX_BNG.n0 - ORIGIN.N0) };

// species table: key = scientific name in lower case (genus-only names are their own entry)
const species = [], spIndex = new Map();
function sp(sci, common) {
  sci = (sci || '').trim().replace(/\s+/g, ' '); common = (common || '').trim();
  if (/^(unknown|not known|na|n\/a|vacant|stump|dead|none|other)\b/i.test(sci)) sci = '';
  if (/^(unknown|not known|na|n\/a|plant|vacant|stump|dead|none|other)$/i.test(common)) common = '';
  if (!sci && !common) return -1;
  sci = sci.replace(/^([a-z])/, c => c.toUpperCase()).replace(/^(\S+ )(\S)/, (m, a, b) => a + (b === 'x' || b === '×' ? b : b.toLowerCase()));
  const key = (sci || '~' + common).toLowerCase();
  if (!spIndex.has(key)) { spIndex.set(key, species.length); species.push([sci || null, common || null]); }
  const k = spIndex.get(key);
  if (!species[k][1] && common) species[k][1] = common;
  return k;
}
// "10 m" -> 10; "05 to 10 m" -> 7.5 (middle of a class); "Not recorded" -> null
function measure(s, scale = 1) {
  const n = String(s || '').match(/\d+(\.\d+)?/g); if (!n) return null;
  const v = n.length >= 2 && /\bto\b|-/.test(s) ? (+n[0] + +n[1]) / 2 : +n[0];
  return v > 0 ? h5(v * scale) : null;
}
const isRange = s => /\bto\b/.test(String(s || ''));
// ring for the payload: simplified, rounded to 0.5 m, flat [x0, z0, x1, z1, ...]; null if it collapses
function flatRing(ring, tol) {
  let r = ring.map(([x, z]) => [x, z]);
  if (r[0][0] !== r.at(-1)[0] || r[0][1] !== r.at(-1)[1]) r.push(r[0]);
  r = simplify(r, tol).map(([x, z]) => [h5(x), h5(z)]);
  const o = []; for (const p of r) if (!o.length || o.at(-1)[0] !== p[0] || o.at(-1)[1] !== p[1]) o.push(p);
  if (o.length > 1 && o[0][0] === o.at(-1)[0] && o[0][1] === o.at(-1)[1]) o.pop();
  if (o.length < 3 || Math.abs(polyArea(o)) < 1) return null;
  return o.flat();
}
// polygon (outer + holes, local metres) -> green entries clipped to the model box
function greensOf(rings, kind, source, id, tol, extra = {}) {
  const [outer, ...holes] = rings, o = clipRing(outer, XB); if (!o) return [];
  const ring = flatRing(o, tol); if (!ring) return [];
  const hs = holes.map(h => clipRing(h, XB)).filter(Boolean).map(h => flatRing(h, tol)).filter(Boolean);
  return [{ kind, ring, ...(hs.length ? { holes: hs } : {}), source, id, ...extra }];
}

// ---------------------------------------------------------------- 1. GLA London Public Realm Trees (OGL v3)
async function readGla(toBng) {
  const out = [], kept = new Set(['lat', 'lon', 'uniqueid', 'taxon_species', 'common_name', 'canopy_m', 'height_m']);
  let head = null, ranges = { h: 0, c: 0 }, boroughs = {};
  const rl = createInterface({ input: createReadStream(F.gla, 'utf8'), crlfDelay: Infinity });
  for await (let line of rl) {
    if (!head) { head = line.replace(/^﻿/, '').split(','); continue; }
    const v = line.split(','), r = Object.fromEntries(head.map((k, i) => [k, v[i]]));
    const lat = +r.lat, lon = +r.lon;
    if (!(lon > W - 0.01 && lon < E + 0.01 && lat > S - 0.01 && lat < N + 0.01)) continue;
    const [e, n] = toBng(lon, lat); if (!inBng(e, n)) continue;
    if (isRange(r.height_m)) ranges.h++; if (isRange(r.canopy_m)) ranges.c++;
    boroughs[r.borough] = (boroughs[r.borough] || 0) + 1;
    out.push({ e, n, h: measure(r.height_m), c: measure(r.canopy_m), sp: [r.taxon_species, r.common_name], id: 'gla:' + r.uniqueid });
  }
  return { trees: out, ranges, boroughs, dropped: head.filter(k => !kept.has(k)) };
}

// ---------------------------------------------------------------- 2. planning.data.gov.uk "tree" (TPO trees; OGL v3)
const ORGS = { 329: 'Southwark', 350: 'Tower Hamlets' };
function readTpo(toBng) {
  const d = JSON.parse(readFileSync(F.tpo, 'utf8')), out = [], ended = [], keys = new Set(), byOrg = {};
  for (const x of d.entities) {
    Object.keys(x).forEach(k => keys.add(k));
    if (x['end-date']) { ended.push(x.entity); continue; }
    const m = (x.point || '').match(/POINT \(([-\d.]+) ([-\d.]+)\)/); if (!m) continue;
    const [e, n] = toBng(+m[1], +m[2]); if (!inBng(e, n)) continue;
    // Tower Hamlets puts the taxon in "name" as "Common (Scientific)"; Southwark puts a site description or a URL there (dropped)
    const t = x['organisation-entity'] === 350 && (x.name || '').match(/^([^()]+?)\s*\(([^()]+)\)\s*$/);
    byOrg[ORGS[x['organisation-entity']] || x['organisation-entity']] = (byOrg[ORGS[x['organisation-entity']] || x['organisation-entity']] || 0) + 1;
    out.push({ e, n, h: null, c: null, sp: t ? [t[2], t[1]] : null, id: 'pd:' + x.entity });
  }
  return { trees: out, ended, byOrg, fetched: d.fetched, dropped: [...keys].filter(k => !['entity', 'point', 'name', 'organisation-entity', 'end-date'].includes(k)).concat(['name (Southwark: site description or URL)']) };
}

// ---------------------------------------------------------------- 3. OpenStreetMap (ODbL), from the local Greater London extract
const OSM_TREE_KEEP = new Set(['natural', 'species', 'species:en', 'genus', 'genus:en', 'taxon', 'taxon:en', 'height', 'diameter_crown']);
function greenKind(t) {
  if (/^(park|garden|pitch|playground|nature_reserve)$/.test(t.leisure || '')) return 'leisure=' + t.leisure;
  if (/^(grass|forest|meadow|recreation_ground)$/.test(t.landuse || '')) return 'landuse=' + t.landuse;
  if (/^(wood|scrub)$/.test(t.natural || '')) return 'natural=' + t.natural;
  return null;
}
async function readOsm(toBng) {
  const parse = require('osm-pbf-parser'), M = 0.02;   // node margin about 1.4 km, so ways that leave the box are whole
  const coord = new Map(), trees = [], treeKeys = {}, ways = new Map(), greenWays = [], rows = [], rels = [];
  await new Promise((res, rej) => createReadStream(PBF).pipe(parse()).pipe(new Writable({
    objectMode: true,
    write(items, enc, next) {
      for (const it of items) {
        if (it.type === 'node') {
          if (it.lon < W - M || it.lon > E + M || it.lat < S - M || it.lat > N + M) continue;
          coord.set(it.id, [it.lon, it.lat]);
          if (it.tags?.natural === 'tree') { trees.push(it); for (const k in it.tags) treeKeys[k] = (treeKeys[k] || 0) + 1; }
        } else if (it.type === 'way') {
          if (!it.refs.some(r => coord.has(r))) continue;
          ways.set(it.id, it.refs);
          const t = it.tags || {};
          if (t.natural === 'tree_row') rows.push(it);
          else if (greenKind(t) && it.refs[0] === it.refs.at(-1)) greenWays.push(it);
        } else if (it.type === 'relation') {
          const t = it.tags || {};
          if (t.type === 'multipolygon' && greenKind(t)) rels.push(it);
        }
      }
      next();
    },
  })).on('finish', res).on('error', rej));
  const loc = id => { const c = coord.get(id); if (!c) return null; const [e, n] = toBng(c[0], c[1]); return toLocal(e, n); };
  const ringOf = refs => { const p = refs.map(loc); return p.some(q => !q) ? null : p; };
  // a way or relation with nodes beyond the node margin counts as incomplete only if one of its known nodes is in the box
  const inXB = ([x, z]) => x >= XB.x0 && x <= XB.x1 && z >= XB.z0 && z <= XB.z1;
  const touches = refsList => refsList.some(refs => (refs || []).some(r => { const q = loc(r); return q && inXB(q); }));
  let missing = 0;
  const outTrees = [];
  for (const it of trees) {
    const [e, n] = toBng(it.lon, it.lat); if (!inBng(e, n)) continue;
    const t = it.tags;
    const h = measure(t.height), c = measure(t.diameter_crown);
    const sci = t.species || t.taxon || t.genus || '', com = t['species:en'] || t['taxon:en'] || t['genus:en'] || '';
    outTrees.push({ e, n, h: h && h < 60 ? h : null, c: c && c < 40 ? c : null, sp: sci || com ? [sci, com] : null, id: 'osm:n' + it.id });
  }
  const greens = [];
  for (const w of greenWays) {
    const r = ringOf(w.refs); if (!r) { if (touches([w.refs])) missing++; continue; }
    greens.push(...greensOf([r], greenKind(w.tags), 'osm', 'w' + w.id, 0.5));
  }
  for (const rel of rels) {
    const outer = rel.members.filter(m => m.type === 'way' && m.role !== 'inner').map(m => ways.get(m.id));
    const inner = rel.members.filter(m => m.type === 'way' && m.role === 'inner').map(m => ways.get(m.id));
    const ro = joinRings(outer), ri = joinRings(inner.filter(Boolean)) || [];
    if (!ro) { if (touches(outer)) missing++; continue; }
    const lo = ro.map(ringOf), li = ri.map(ringOf).filter(Boolean);
    if (lo.some(x => !x)) { if (touches(ro)) missing++; continue; }
    for (const o of lo) greens.push(...greensOf([o, ...li.filter(h => pointIn(h[0], o))], greenKind(rel.tags), 'osm', 'r' + rel.id, 0.5));
  }
  const outRows = [];
  for (const w of rows) {
    const p = ringOf(w.refs); if (!p) { if (touches([w.refs])) missing++; continue; }
    const q = p.filter(([x, z]) => x >= XB.x0 && x <= XB.x1 && z >= XB.z0 && z <= XB.z1); if (q.length < 2) continue;
    const t = w.tags, sci = t.species || t.taxon || t.genus || '', com = t['species:en'] || t['taxon:en'] || t['genus:en'] || '';
    outRows.push({ line: simplify(q, 0.5).map(([x, z]) => [h5(x), h5(z)]).flat(), sp: sci || com ? [sci, com] : null, id: 'w' + w.id });
  }
  return { trees: outTrees, greens, rows: outRows, missing, treeKeys, dropped: Object.keys(treeKeys).filter(k => !OSM_TREE_KEEP.has(k)).sort() };
}

// ---------------------------------------------------------------- 4. OS Open Greenspace (OGL v3): TQ shapefile, BNG
function unzipEntries(zip, want) {
  const yauzl = require('yauzl');
  return new Promise((res, rej) => yauzl.open(zip, { lazyEntries: true }, (err, z) => {
    if (err) return rej(err);
    const out = {};
    z.on('entry', en => {
      const k = want.find(w => en.fileName.endsWith(w));
      if (!k) return z.readEntry();
      z.openReadStream(en, (e2, s) => { if (e2) return rej(e2); const b = []; s.on('data', d => b.push(d)); s.on('end', () => { out[k] = Buffer.concat(b); z.readEntry(); }); });
    });
    z.on('end', () => res(out)); z.readEntry();
  }));
}
function readDbf(b) {
  const n = b.readUInt32LE(4), hl = b.readUInt16LE(8), rl = b.readUInt16LE(10), fields = [];
  for (let o = 32, at = 1; b[o] !== 0x0d; o += 32) { const len = b[o + 16]; fields.push({ name: b.toString('latin1', o, o + 11).replace(/\0.*$/, ''), at, len }); at += len; }
  return { n, fields, row: i => Object.fromEntries(fields.map(f => [f.name, b.toString('utf8', hl + i * rl + f.at, hl + i * rl + f.at + f.len).trim()])) };
}
async function readOsgs() {
  const z = await unzipEntries(F.osgs, ['TQ_GreenspaceSite.shp', 'TQ_GreenspaceSite.dbf']);
  const shp = z['TQ_GreenspaceSite.shp'], dbf = readDbf(z['TQ_GreenspaceSite.dbf']);
  const greens = [], kinds = {};
  for (let o = 100, i = 0; o < shp.length; i++) {
    const len = shp.readInt32BE(o + 4) * 2, c = o + 8; o = c + len;
    if (![5, 15].includes(shp.readInt32LE(c))) continue;   // Polygon or PolygonZ (OS ships PolygonZ); x, y come first in both
    const [x0, y0, x1, y1] = [0, 1, 2, 3].map(k => shp.readDoubleLE(c + 4 + 8 * k));
    if (x1 < BOX_BNG.e0 || x0 > BOX_BNG.e1 || y1 < BOX_BNG.n0 || y0 > BOX_BNG.n1) continue;
    const np = shp.readInt32LE(c + 36), nPts = shp.readInt32LE(c + 40), parts = [];
    for (let k = 0; k < np; k++) parts.push(shp.readInt32LE(c + 44 + 4 * k));
    const p0 = c + 44 + 4 * np, rings = [];
    for (let k = 0; k < np; k++) {
      const r = []; for (let j = parts[k]; j < (k + 1 < np ? parts[k + 1] : nPts); j++) r.push([shp.readDoubleLE(p0 + 16 * j), shp.readDoubleLE(p0 + 16 * j + 8)]);
      rings.push(r);
    }
    // shapefile: outer rings clockwise (negative signed area in E, N), holes anticlockwise
    const outers = rings.filter(r => polyArea(r) < 0), holes = rings.filter(r => polyArea(r) >= 0);
    const row = dbf.row(i), L = r => r.map(([e, n]) => toLocal(e, n));
    for (const ou of outers) {
      const g = greensOf([L(ou), ...holes.filter(h => pointIn(h[0], ou)).map(L)], row.function, 'os-open-greenspace', row.id, 0.5);
      if (g.length) kinds[row.function] = (kinds[row.function] || 0) + 1;
      greens.push(...g);
    }
  }
  return { greens, kinds, fields: dbf.fields.map(f => f.name) };
}

// ---------------------------------------------------------------- 5. Forest Research Trees Outside Woodland (OGL v3), LiDAR 2020
function readTow(toBng) {
  const d = JSON.parse(gunzipSync(readFileSync(F.tow))), lone = [], greens = [], types = {}, keys = new Set();
  for (const f of d.features) {
    const p = f.properties; Object.keys(p).forEach(k => keys.add(k));
    types[p.woodland_type] = (types[p.woodland_type] || 0) + 1;
    const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
      .map(rs => rs.map(r => r.map(([lon, lat]) => { const [e, n] = toBng(lon, lat); return toLocal(e, n); })));
    if (p.woodland_type === 'Lone Tree') {
      let A = 0, cx = 0, cz = 0;
      for (const [o] of polys) { const a = Math.abs(polyArea(o)); let sx = 0, sz = 0; for (const q of o) { sx += q[0]; sz += q[1]; } A += a; cx += a * sx / o.length; cz += a * sz / o.length; }
      if (!A) continue; cx /= A; cz /= A;
      if (cx < XB.x0 || cx > XB.x1 || cz < XB.z0 || cz > XB.z1) continue;
      lone.push({ x: cx, z: cz, h: h5(p.maxht), c: h5(2 * Math.sqrt(p.tow_area_m / Math.PI)), id: 'tow:' + p.tow_id });
    } else {
      const kind = 'tow:' + p.woodland_type.toLowerCase().replace(/\s+/g, '_');
      for (const rs of polys) greens.push(...greensOf(rs, kind, 'fr-tow', p.tow_id, 1.5, { h: h5(p.meanht) }));
    }
  }
  return { lone, greens, types, fetched: d.fetched, dropped: [...keys].filter(k => !['tow_id', 'woodland_type', 'meanht', 'maxht', 'tow_area_m'].includes(k)) };
}

// ---------------------------------------------------------------- build
async function build() {
  const t0 = Date.now(), toBng = await bngProjector();
  for (const [k, f] of Object.entries(F)) if (!existsSync(f)) throw new Error(`missing ${f}: run build-trees.mjs fetch ${k}`);
  if (!existsSync(PBF)) throw new Error(`missing ${PBF}: run fetch-docklands.mjs osm`);
  const SRC = ['gla-public-realm-trees', 'planning-data-tree', 'osm', 'fr-tow', 'os-open-greenspace'];
  const trees = [], ids = [], grid = new Map(), counts = {}, dups = {};
  const key = (x, z) => Math.floor(x / 3) + ',' + Math.floor(z / 3);
  const near = (x, z, r) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [a, b] of grid.get((Math.floor(x / 3) + i) + ',' + (Math.floor(z / 3) + j)) || []) if (Math.hypot(a - x, b - z) <= r) return true; return false; };
  const add = (x, z, h, c, s, src, id) => {
    trees.push([h5(x), h5(z), h ?? null, c ?? null, s, src]); ids.push(id);
    const k = key(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, z]);
  };
  const addSet = (list, src, name) => {
    let added = 0, dup = 0;
    for (const t of list) {
      const [x, z] = toLocal(t.e, t.n);
      if (src > 0 && near(x, z, 3)) { dup++; continue; }
      add(x, z, t.h, t.c, t.sp ? sp(t.sp[0], t.sp[1]) : -1, src, t.id); added++;
    }
    counts[name] = { in_box: list.length, kept: added }; if (src > 0) dups[name] = `${dup} within 3 m of a tree from a source ranked higher`;
  };

  const gla = await readGla(toBng); addSet(gla.trees, 0, 'gla-public-realm-trees');
  console.log(`GLA ${gla.trees.length} in the box`, gla.boroughs);
  const tpo = readTpo(toBng); addSet(tpo.trees, 1, 'planning-data-tree');
  console.log(`TPO ${tpo.trees.length} in the box (ended, left out: ${tpo.ended.length})`, tpo.byOrg);
  const osm = await readOsm(toBng); addSet(osm.trees, 2, 'osm');
  console.log(`OSM ${osm.trees.length} trees, ${osm.greens.length} green rings, ${osm.rows.length} tree rows; ${osm.missing} ways or relations incomplete`);
  const tow = readTow(toBng);
  { let added = 0, dup = 0;
    for (const t of tow.lone) {
      // a LiDAR crown with an inventoried or mapped trunk within its radius (at least 3 m) of its centre is the same tree
      if (near(t.x, t.z, Math.max(3, t.c / 2))) { dup++; continue; }
      add(t.x, t.z, t.h, t.c, -1, 3, t.id); added++;
    }
    counts['fr-tow'] = { lone_trees_in_box: tow.lone.length, kept: added, group_and_woodland_rings: tow.greens.length, types: tow.types };
    dups['fr-tow'] = `${dup} lone-tree crowns with a tree from a source ranked higher within the crown radius (min 3 m) of their centre`;
  }
  const osgs = await readOsgs();
  counts['os-open-greenspace'] = { rings: osgs.greens.length, functions: osgs.kinds };
  counts.osm.green_rings = osm.greens.length; counts.osm.tree_rows = osm.rows.length; counts.osm.incomplete_ways_or_relations = osm.missing;
  const rows = osm.rows.map(r => ({ line: r.line, sp: r.sp ? sp(r.sp[0], r.sp[1]) : -1, source: 'osm', id: r.id }));

  const out = {
    built: new Date().toISOString().slice(0, 10),
    about: 'Trees and green areas in the Docklands model box from open sources, in model metres (x = E - 537550, z = -(N - 180300), 0.5 m). Built by tools/build-trees.mjs.',
    format: {
      trees: '[x, z, height_m|null, crown_m|null, species_index|-1, source_index]; crown_m = crown spread (diameter); ids[i] is the source record id of trees[i]',
      species: '[scientific name|null, common name|null], as the source gives them (normalised case only)',
      greens: '{kind, ring: [x0, z0, x1, z1, ...] (outer, not closed), holes?: [ring], source, id, h?: mean canopy height (TOW)}',
      rows: 'OSM natural=tree_row lines: {line: [x0, z0, ...], sp: species_index|-1, source, id}',
    },
    sources: [
      { key: 'gla-public-realm-trees', name: 'GLA London Public Realm Trees, November 2025 (compiled by GiGL from borough, TfL and Royal Parks inventories)', licence: 'OGL v3.0', url: 'https://data.london.gov.uk/dataset/london-public-realm-trees-2r45m', file: URL.gla, fetched: '2026-10-03', kept: 'position, taxon_species, common_name, height_m, canopy_m (class ranges become their middle), uniqueid', dropped: gla.dropped, coverage: `public realm trees only (streets, parks, housing, schools); boroughs in the box: ${Object.entries(gla.boroughs).map(([k, v]) => k + ' ' + v).join(', ')}; privately managed land (the Canary Wharf estate, private developments) is not in it` },
      { key: 'planning-data-tree', name: 'planning.data.gov.uk "tree" dataset (trees with Tree Preservation Orders, from Tower Hamlets and Southwark)', licence: 'OGL v3.0', url: 'https://www.planning.data.gov.uk/dataset/tree', file: URL.tpo, fetched: tpo.fetched, kept: 'point, taxon (Tower Hamlets only, from the name "Common (Scientific)"), entity id', dropped: tpo.dropped, coverage: `Tower Hamlets and Southwark only (${Object.entries(tpo.byOrg).map(([k, v]) => k + ' ' + v).join(', ')}); ${tpo.ended.length} records with an end date left out` },
      { key: 'osm', name: 'OpenStreetMap, Greater London extract (download.openstreetmap.fr, data as of 2026-10-01)', licence: 'ODbL 1.0', attribution: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', kept: 'natural=tree nodes (species, genus, taxon and their :en names, height, diameter_crown), natural=tree_row, green areas by kind', dropped: osm.dropped },
      { key: 'fr-tow', name: 'Forest Research National Trees Outside Woodland map V1 (London), from EA LiDAR 2020 and Sentinel-2', licence: 'OGL v3.0', attribution: '© Forestry Commission copyright and/or database right 2025', url: 'https://ckan.publishing.service.gov.uk/dataset/national-trees-outside-woodland-map', file: URL.tow, fetched: tow.fetched, kept: 'Lone Tree polygons as trees (centroid, maxht as height, crown = diameter of a circle of tow_area_m); Group of Trees and Small Woodland polygons as greens with meanht', dropped: tow.dropped, coverage: 'canopy over 3 m and 5 m2 outside National Forest Inventory woodland; NFI woodland itself is not in it' },
      { key: 'os-open-greenspace', name: 'OS Open Greenspace 2026-04, TQ tile', licence: 'OGL v3.0', attribution: 'Contains OS data © Crown copyright and database right 2026', url: 'https://api.os.uk/downloads/v1/products/OpenGreenspace', file: URL.osgs, fetched: '2026-10-03', kept: 'site polygon, function, id', dropped: osgs.fields.filter(f => !['id', 'function'].includes(f)) },
    ],
    precedence: 'trees: GLA inventory first; then TPO points, OSM trees and TOW lone-tree crowns, each added only if no tree from a source ranked higher lies within 3 m (TOW: within the crown radius, at least 3 m)',
    duplicates_removed: dups,
    counts: { ...counts, trees: trees.length, species: species.length, greens: osm.greens.length + osgs.greens.length + tow.greens.length, rows: rows.length },
    species, trees, ids,
    greens: [...osgs.greens, ...osm.greens, ...tow.greens],
    rows,
  };
  writeFileSync(OUT, JSON.stringify(out));
  const sz = statSync(OUT).size, gz = gzipSync(readFileSync(OUT)).length;
  console.log(`wrote ${OUT}: ${trees.length} trees, ${species.length} species, ${out.greens.length} greens, ${rows.length} rows; ${(sz / 1e6).toFixed(2)} MB (${(gz / 1e6).toFixed(2)} MB gzipped); ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log(JSON.stringify(out.counts, null, 1)); console.log(out.duplicates_removed);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'fetch') await fetchAll(rest.length ? rest : ['gla', 'osgs', 'tpo', 'tow']);
  else await build();
}
