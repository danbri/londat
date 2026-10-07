#!/usr/bin/env node
// Fetch raw open data for the Docklands model (London Bridge to Cody Dock, Limehouse to Greenwich)
// into magpie/cwplans/data/raw/docklands/. Only the Wikidata results (gzipped) are committed.
//   node magpie/cwplans/tools/fetch-docklands.mjs [osm|lidar|wikidata|defences ...]   (default: all four)
// Every input and output, with endpoints and rules: magpie/cwplans/pipeline.json, activity "fetch-docklands-*".
// The OSTN15 grid comes from: node magpie/cwplans/tools/fetch-raw.mjs grid
// Sources and licences: magpie/cwplans/docklands/README.md.
import { writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { pathToFileURL } from 'url';
import { RAW, get, sparql, wcsUrl } from './lib.mjs';

export const DIR = join(RAW, 'docklands');
// WGS84 box (west, south, east, north) and the BNG box it was rounded out to (EPSG:27700 metres)
export const BOX_WGS84 = [-0.0950, 51.4740, 0.0150, 51.5220];
export const BOX_BNG = { e0: 532400, e1: 539900, n0: 176700, n1: 182300 };
export const ORIGIN = { E0: 537550, N0: 180300 };   // One Canada Square, to ~20 m
export const TILE = 1000;                            // LiDAR tile edge, metres
export const lidarTiles = () => {
  const out = [];
  for (let e = BOX_BNG.e0; e < BOX_BNG.e1; e += TILE) for (let n = BOX_BNG.n0; n < BOX_BNG.n1; n += TILE)
    out.push({ e0: e, e1: Math.min(e + TILE, BOX_BNG.e1), n0: n, n1: Math.min(n + TILE, BOX_BNG.n1) });
  return out;
};
export const tileFile = (name, t) => join(DIR, 'lidar', `${name}_${t.e0}_${t.n0}.tif`);

const [W, S, E, N] = BOX_WGS84;
const BOX = `SERVICE wikibase:box { ?item wdt:P625 ?coord . bd:serviceParam wikibase:cornerSouthWest "Point(${W} ${S})"^^geo:wktLiteral . bd:serviceParam wikibase:cornerNorthEast "Point(${E} ${N})"^^geo:wktLiteral . }`;
// every item with a coordinate in the box, its classes and English Wikipedia article
const WD_ITEMS = `SELECT ?item ?itemLabel ?itemDescription ?coord ?class ?classLabel ?article WHERE {
  ${BOX}
  OPTIONAL { ?item wdt:P31 ?class . }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
// structural facts for items in the box: height, floors above/below ground, elevation, length, depth, inception, opening
const WD_FACTS = `SELECT ?item ?prop ?val ?unitLabel WHERE {
  ${BOX}
  VALUES ?prop { wd:P2048 wd:P1101 wd:P1139 wd:P2044 wd:P2043 wd:P4511 wd:P2610 wd:P571 wd:P1619 wd:P2046 }
  ?prop wikibase:claim ?p ; wikibase:statementProperty ?ps ; wikibase:statementValue ?psv .
  ?item ?p ?st . ?st ?ps ?val .
  OPTIONAL { ?st ?psv ?vn . ?vn wikibase:quantityUnit ?unit . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); })); }

const jobs = {
  // Daily Greater London extract (ODbL). Geofabrik and Overpass were unreachable from the build container (Oct 2026).
  async osm() {
    const buf = await get('https://download.openstreetmap.fr/extracts/europe/united_kingdom/england/greater_london-latest.osm.pbf');
    writeFileSync(join(DIR, 'greater_london-latest.osm.pbf'), buf);
    return `greater_london-latest.osm.pbf (${buf.length} bytes)`;
  },
  async lidar() {
    mkdirSync(join(DIR, 'lidar'), { recursive: true });
    const todo = lidarTiles().flatMap(t => ['dtm', 'dsm'].map(name => ({ name, t }))).filter(({ name, t }) => !existsSync(tileFile(name, t)) || statSync(tileFile(name, t)).size < 1000);
    let done = 0;
    await pool(todo, 4, async ({ name, t }) => {
      for (let attempt = 1; ; attempt++) {
        try { writeFileSync(tileFile(name, t), await get(wcsUrl(name, t.e0, t.e1, t.n0, t.n1))); break; }
        catch (e) { if (attempt >= 4) throw e; await new Promise(r => setTimeout(r, 2000 * 2 ** attempt)); }
      }
      if (++done % 10 === 0) console.log(`  lidar ${done}/${todo.length}`);
    });
    return `${todo.length} tiles fetched, ${lidarTiles().length * 2} in the box`;
  },
  // EA spatial flood defences (OGL): wall/embankment lines with design and surveyed crest levels. Owner and
  // maintainer fields are dropped here: some describe private individuals and the model does not need them.
  async defences() {
    const [w, s, e, n] = BOX_WGS84, KEEP = ['asset_id', 'asset_sub_type', 'protection_type', 'design_sop', 'design_ucl', 'design_dcl', 'actual_ucl', 'actual_dcl', 'effective_cl', 'bank', 'local_authority', 'last_inspection_date'];
    let url = `https://environment.data.gov.uk/spatialdata/spatial-flood-defences-including-standardised-attributes/ogc/features/v1/collections/Spatial_Flood_Defences_Including_Standardised_Attributes/items?bbox=${w},${s},${e},${n}&limit=500&f=json`;
    const out = [];
    while (url) {
      const d = JSON.parse(await get(url));
      for (const f of d.features) out.push({ geometry: f.geometry, properties: Object.fromEntries(KEEP.map(k => [k, f.properties[k] ?? null])) });
      url = (d.links || []).find(l => l.rel === 'next')?.href || null;
      if (!d.features.length) url = null;
    }
    writeFileSync(join(DIR, 'ea-defences.json.gz'), gzipSync(JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), type: 'FeatureCollection', features: out }), { level: 9 }));
    return `ea-defences.json.gz (${out.length} features)`;
  },
  async wikidata() {
    writeFileSync(join(DIR, 'wikidata-items.json.gz'), gzipSync(await sparql(WD_ITEMS), { level: 9 }));
    writeFileSync(join(DIR, 'wikidata-facts.json.gz'), gzipSync(await sparql(WD_FACTS), { level: 9 }));
    return 'wikidata-items.json.gz, wikidata-facts.json.gz';
  },
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(DIR, { recursive: true });
  const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(jobs);
  for (const k of want) {
    if (!jobs[k]) { console.error(`unknown source ${k}; one of ${Object.keys(jobs).join(' ')}`); process.exit(2); }
    console.log(`${k}: ${await jobs[k]()}`);
  }
}
