#!/usr/bin/env node
// Fetch the raw open data behind magpie/cwplans into magpie/cwplans/data/raw/.
//   node magpie/cwplans/tools/fetch-raw.mjs [osm|lidar|wikidata|grid ...]   (default: all)
// Sources, licences and the reasons for each choice: magpie/cwplans/README.md.
// The LiDAR GeoTIFFs (2 x 21 MB) are not committed; this script re-fetches them.
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { gzipSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const RAW = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'raw');
const UA = 'glitchcan-cwplans/0.1 (https://github.com/danbri/glitchcan-minigam)';

// Study area. WGS84 box for OSM; BNG box (EPSG:27700, metres) for the LiDAR.
export const BBOX_WGS84 = { west: -0.0620, south: 51.4880, east: -0.0380, north: 51.5070 };
export const BBOX_BNG = { e0: 534600, e1: 536300, n0: 178300, n1: 180500 };

const EA = 'https://environment.data.gov.uk/spatialdata';
const LIDAR = {
  dtm: [`${EA}/lidar-composite-digital-terrain-model-dtm-1m/wcs`, '13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m'],
  dsm: [`${EA}/lidar-composite-digital-surface-model-first-return-dsm-1m/wcs`, 'df4e3ec3-315e-48aa-aaaf-b5ae74d7b2bb__Lidar_Composite_Elevation_FZ_DSM_1m'],
};

// Wikidata: everything with a coordinate within 1.3 km of Canada Water, plus a few facts for named items.
const WD_AROUND = `SELECT ?item ?itemLabel ?itemDescription ?coord ?dist ?class ?classLabel ?inception ?article WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "Point(-0.0497 51.4975)"^^geo:wktLiteral . bd:serviceParam wikibase:radius "1.3" . bd:serviceParam wikibase:distance ?dist . }
  OPTIONAL { ?item wdt:P31 ?class . }
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY ?dist`;
const WD_FACTS = `SELECT ?item ?itemLabel ?prop ?propLabel ?val ?valLabel ?unitLabel WHERE {
  VALUES ?item { wd:Q1190691 wd:Q800610 wd:Q801499 wd:Q175256 wd:Q801580 wd:Q1032006 wd:Q2368643 wd:Q1544727 wd:Q128924146 wd:Q26665615 wd:Q7604796 wd:Q17642970 }
  ?item ?p ?st . ?prop wikibase:claim ?p ; wikibase:statementProperty ?ps .
  ?st ?ps ?val .
  OPTIONAL { ?prop wikibase:statementValue ?psv . ?st ?psv ?vn . ?vn wikibase:quantityUnit ?unit . }
  FILTER(?prop IN (wd:P31, wd:P571, wd:P1619, wd:P2043, wd:P2044, wd:P2048, wd:P1448, wd:P576, wd:P2046, wd:P127, wd:P137, wd:P1435))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY ?itemLabel ?propLabel`;

async function get(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
const sparql = q => get('https://query.wikidata.org/sparql', {
  method: 'POST', body: new URLSearchParams({ query: q }),
  headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
});

const jobs = {
  // Overpass was unreachable from the build container (Oct 2026); the main API's map call covers this small box.
  async osm() {
    const b = BBOX_WGS84;
    const buf = await get(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${b.west},${b.south},${b.east},${b.north}`);
    writeFileSync(join(RAW, 'osm-map.json.gz'), gzipSync(buf, { level: 9 }));
    // The map call returns only the member ways that cross the box. Water multipolygons with missing
    // members (here the Pool of London, which holds the Thames between Rotherhithe and Wapping) need /full.
    const map = JSON.parse(buf), have = new Set(map.elements.filter(e => e.type === 'way').map(e => e.id));
    const want = map.elements.filter(e => e.type === 'relation' && e.tags?.type === 'multipolygon' && e.tags.natural === 'water' && e.members.some(m => m.type === 'way' && !have.has(m.ref)));
    const extra = [];
    for (const r of want) extra.push(...JSON.parse(await get(`https://api.openstreetmap.org/api/0.6/relation/${r.id}/full.json`)).elements);
    writeFileSync(join(RAW, 'osm-water-full.json.gz'), gzipSync(JSON.stringify({ relations: want.map(r => r.id), elements: extra }), { level: 9 }));
    return `osm-map.json.gz (${buf.length} bytes before gzip), osm-water-full.json.gz (relations ${want.map(r => r.id).join(', ')})`;
  },
  async lidar() {
    const b = BBOX_BNG, out = [];
    for (const [name, [wcs, id]] of Object.entries(LIDAR)) {
      const buf = await get(`${wcs}?service=WCS&version=2.0.1&request=GetCoverage&CoverageId=${id}&format=image/tiff&subset=E(${b.e0},${b.e1})&subset=N(${b.n0},${b.n1})`);
      writeFileSync(join(RAW, `${name}.tif`), buf); out.push(`${name}.tif (${buf.length})`);
    }
    return out.join(', ');
  },
  async wikidata() {
    writeFileSync(join(RAW, 'wikidata-around.json'), await sparql(WD_AROUND));
    writeFileSync(join(RAW, 'wikidata-facts.json'), await sparql(WD_FACTS));
    return 'wikidata-around.json, wikidata-facts.json';
  },
  // OS OSTN15 transformation grid (OS licence: free to use), as distributed by the PROJ CDN.
  async grid() {
    writeFileSync(join(RAW, 'uk_os_OSTN15_NTv2_OSGBtoETRS.tif'), await get('https://cdn.proj.org/uk_os_OSTN15_NTv2_OSGBtoETRS.tif'));
    return 'uk_os_OSTN15_NTv2_OSGBtoETRS.tif';
  },
};

// run only as a script: build-data.mjs imports the box constants above
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
if (!existsSync(RAW)) mkdirSync(RAW, { recursive: true });
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(jobs);
for (const k of want) {
  if (!jobs[k]) { console.error(`unknown source ${k}; one of ${Object.keys(jobs).join(' ')}`); process.exit(2); }
  console.log(`${k}: ${await jobs[k]()}`);
}
}
