// ONS Open Geography Portal (ArcGIS Online organisation ESMARspQHYMw9BZ9), for walk-portals.mjs: the item catalogue
// through the ArcGIS sharing search API, triage by product family and area, harvest of zone boundaries, centroids and
// lookups by ArcGIS query. Rules and reasons: skills/cwplans-open-portals/SKILL.md, "ONS Open Geography".
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getJson, OUT, today, ZONE, ZONE_TEXT, CW_BOX, meets, wholeIn, roundGeom, writeLines, writeGeojson, licenceClass, zoneRefs , outExists, writeOut } from '../walk-portals.mjs';

const ORG = 'ESMARspQHYMw9BZ9';
const SEARCH = 'https://www.arcgis.com/sharing/rest/search';
const CAT = join(OUT, 'onsgeo', 'catalogue.json');
const ENV = `${ZONE[0]},${ZONE[1]},${ZONE[2]},${ZONE[3]}`;
const readJson = f => JSON.parse(readFileSync(f, 'utf8'));
const LICENCE = 'Open Government Licence v3.0 (ONS geography licences: https://www.ons.gov.uk/methodology/geography/licences)';
const ATTRIB = 'Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2026';
const TYPES = ['Feature Service', 'CSV', 'File Geodatabase', 'Shapefile', 'GeoPackage', 'Microsoft Excel', 'GeoJson'];

export async function walk() {
  const q = `orgid:${ORG} AND (${TYPES.map(t => `type:"${t}"`).join(' OR ')})`;
  const rows = [];
  for (let start = 1; start > 0;) {
    const j = await getJson(`${SEARCH}?f=json&num=100&start=${start}&sortField=modified&sortOrder=desc&q=${encodeURIComponent(q)}`);
    for (const r of j.results) rows.push({ id: r.id, title: r.title, type: r.type, url: r.url || null, modified: new Date(r.modified).toISOString().slice(0, 10),
      licence_text: (r.licenseInfo || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || null });
    start = j.nextStart; process.stdout.write(`\r${rows.length} / ${j.total}`);
  }
  writeLines(CAT, { portal: 'ONS Open Geography Portal (https://geoportal.statistics.gov.uk/)', api: `${SEARCH}?q=orgid:${ORG} AND (${TYPES.join(' | ')})`, walked: today,
    rule: 'every public item of the ONS geography organisation of these types: id, title, type, service URL, modified, licence text' }, 'items', rows);
  console.log(`\n${rows.length} items`);
}

// product families by title (first match): the area level, and whether finer than a borough
const FAMILIES = [
  [/\b(output areas?|\boa\b|oa\d\d)\b/i, 'oa', true], [/lower layer super output|\blsoa/i, 'lsoa', true], [/middle layer super output|\bmsoa/i, 'msoa', true],
  [/workplace zones?|\bwz\d\d/i, 'workplace-zone', true], [/\bwards?\b|\bwd\d\d/i, 'ward', true], [/postcode|\bpcd|onspd|nspl|\bpcds?\b|nhspd/i, 'postcode', true],
  [/built[- ]?up area|\bbua\d\d/i, 'built-up-area', true], [/parish|\bpar\d\d/i, 'parish', false], [/westminster parliamentary|\bpcon/i, 'constituency', false],
  [/uprn|address/i, 'uprn', true], [/grid|hexagon|\b1km\b/i, 'grid', true], [/national park|\bnpark/i, 'national-park', false],
  [/local authority|\blad\d\d|\blau\d|\bltla|\butla|count(y|ies)|\bcty\d\d|regions?\b|\brgn\d\d|countr(y|ies)|\bctry|\bitl\d|nuts|combined authorit|\bcauth|\bccg|sub[- ]?icb|\bicb|nhs|\bstp|lep\b|local enterprise|police force|fire and rescue|\bpfa|\bfra|travel to work|\bttwa|health board|\blhb|senedd|assembly|london assembly|european|electoral region|international territorial|cancer alliance|resilience forum|major towns|integrated care|health authorit|primary care|skills|community safety|registration district|department for|local planning authorit|clinical commissioning|fire|police|census merged|lieutenan|magistrat|courts?|employment|learning|ambulance|national grid|retail|economic|built environment|local administrative units|grouped lower tier|covid infection|isochrones|non-standard geography|in sc\b/i, 'coarse', false],
];
const OTHER = /\b(scotland|scottish|data ?zones?|\bdz\d\d|northern ireland|\bni\b|super data zone|\bsdz|small areas? \(ni\)|wales only|\bwales\b(?! and)|welsh)\b/i;
// vintages: a 2021-family item is current; 2011 is kept for 2011 data; older ones are superseded
export async function triage() {
  const cat = readJson(CAT);
  const rows = cat.items.map(it => {
    const fam = FAMILIES.find(([re]) => re.test(it.title));
    const lic = licenceClass(null, it.licence_text || '') === 'none' && /ons\.gov\.uk\/methodology\/geography\/licences/.test(it.licence_text || '') ? 'ogl' : licenceClass(null, it.licence_text || '');
    const yr = +((/\b(19|20)\d\d\b/.exec(it.title) || [])[0] || 0);
    const H = Object.entries(HARVEST).find(([, h]) => h.id === it.id);
    let state, rule, why;
    if (H && outExists(join(OUT, 'onsgeo', H[0], `${H[0]}.${H[1].table ? 'json' : 'geojson'}`))) { state = 'harvested'; rule = 'G1'; why = `feeds/portals/onsgeo/${H[0]}/`; }
    else if (/ONS Postcode Directory \(August 2026\)/i.test(it.title)) { state = 'held'; rule = 'G2'; why = 'ONSPD August 2026 is the zone reference (zone-codes.json, postcodes/)'; }
    else if (/(Lower layer|Middle layer) Super Output Areas \(December 2021\) Boundaries EW BFC/i.test(it.title)) { state = 'held'; rule = 'G2'; why = 'LSOA/MSOA 2021 polygons held from the London Datastore (statistical-boundaries)'; }
    else if (!['ogl', 'cc-by', 'public-domain', 'odc-by'].includes(lic)) { state = 'not-open'; rule = 'G3'; why = `licence: ${it.licence_text || 'none stated'}`; }
    else if (OTHER.test(it.title)) { state = 'not-relevant'; rule = 'G4'; why = 'Scotland, Wales or Northern Ireland only'; }
    else if (yr && yr < 2011) { state = 'not-relevant'; rule = 'G7'; why = `superseded vintage (${yr})`; }
    else if (!fam) { state = 'deferred'; rule = 'G5'; why = 'product family not recognised by title'; }
    else if (!fam[2]) { state = 'not-relevant'; rule = 'G6'; why = `coarser than the zone (${fam[1]})`; }
    else { state = 'listed-for-harvest'; rule = 'G8'; why = `${fam[1]} ${yr || ''}`.trim(); }
    return { id: it.id, title: it.title, type: it.type, family: fam ? fam[1] : null, year: yr || null, licence: lic, state, rule, reason: why };
  });
  const counts = {}; for (const r of rows) counts[r.state] = (counts[r.state] || 0) + 1;
  writeLines(join(OUT, 'onsgeo', 'triage.json'), { portal: 'ONS Open Geography Portal', triaged: today, counts,
    rules: ['G1 harvested', 'G2 held (ONSPD August 2026; LSOA and MSOA 2021 full-resolution polygons from the London Datastore)', 'G3 not-open', 'G4 not-relevant: Scotland, Wales or Northern Ireland only', 'G5 deferred: family not recognised', 'G6 not-relevant: coarser than the zone (LAD, county, region, country, ITL, health, police, constituency...), or parishes (the only London parish, Queen\'s Park, is outside the zone)', 'G7 not-relevant: vintage before 2011', 'G8 listed-for-harvest: a small-area product (OA, LSOA, MSOA, workplace zone, ward, postcode, built-up area, parish, grid) of 2011 or later'],
    family_rules: FAMILIES.map(([re, k, fine]) => `${k}${fine ? '' : ' (coarse)'}: ${re.source}`) }, 'items', rows);
  console.log(counts);
}

// item ids chosen by hand from the catalogue (the newest version of each product)
export const HARVEST = {
  'oa21-boundaries': { title: /^Output Areas \(December 2021\) Boundaries EW BGC/i, why: 'output area polygons 2021 (generalised, 20 m), the geography of the Census OA tables in ../nomis/' },
  'oa21-centroids': { title: /^Output Areas \(December 2021\) EW Population Weighted Centroids/i, why: 'OA population-weighted centroids' },
  'oa21-lookup': { title: /^Output Area \(2021\) to LSOA to MSOA to LAD \(December 2021\) Exact Fit Lookup in EW/i, table: 'OA21CD', why: 'OA to LSOA, MSOA and local authority: the join for the Census OA rows' },
  'lsoa21-centroids': { title: /^Lower layer Super Output Areas \(December 2021\) EW Population Weighted Centroids/i, why: 'LSOA population-weighted centroids' },
  'workplace-zones-2011': { title: /^Workplace Zones \(December 2011\) Boundaries EW BGC/i, why: 'workplace zones: the Census geography of where people work (Canary Wharf is many small WZs)' },
  'wards-latest': { title: /^Wards \(May 202[56]\) Boundaries UK BGC/i, why: 'the latest ward boundaries (the 2022 Tower Hamlets wards; the London Datastore file stops at 2018)' },
};
export async function harvest(keys) {
  const cat = readJson(CAT), refs = zoneRefs();
  const zoneOA = new Set([...refs.code].filter(([, k]) => k === 'oa21').map(([c]) => c));
  for (const [key, H] of Object.entries(HARVEST)) {
    if (keys.length && !keys.includes(key)) continue;
    const cands = cat.items.filter(i => H.title.test(i.title) && i.type === 'Feature Service').sort((a, b) => b.modified.localeCompare(a.modified));
    const it = cands[0]; if (!it) { console.warn(`${key}: no item`); continue; }
    H.id = it.id;
    const svc = await getJson(`${it.url}?f=json`); const layer = (svc.layers || svc.tables || [])[0] || (svc.tables || [])[0];
    const lurl = `${it.url}/${layer.id}`;
    const meta0 = await getJson(`${lurl}?f=json`);
    let feats = [], rows = [], columns;
    if (H.table) {
      const codes = [...zoneOA];
      for (let i = 0; i < codes.length; i += 60) {
        const where = `${H.table} IN (${codes.slice(i, i + 60).map(c => `'${c}'`).join(',')})`;
        const j = await getJson(`${lurl}/query?f=json&outFields=*&returnGeometry=false&where=${encodeURIComponent(where)}`);
        for (const f of j.features) rows.push(f.attributes);
      }
      columns = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(c => !/^(ObjectId|FID|OBJECTID)$/i.test(c));
      rows = rows.map(r => columns.map(c => r[c]));
    } else {
      for (let off = 0; ; off += 1000) {
        const j = await getJson(`${lurl}/query?where=1%3D1&geometry=${ENV}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=geojson&resultOffset=${off}&resultRecordCount=1000${H.attributesOnly ? '&returnGeometry=false' : ''}`);
        feats.push(...(j.features || [])); process.stdout.write(`\r${key} ${feats.length}  `);
        if ((j.features || []).length < 1000 && !j.properties?.exceededTransferLimit) break;
      }
    }
    const out = [];
    if (!H.table && !H.attributesOnly) for (const f of feats) {
      if (!f.geometry) continue; const g = roundGeom(f.geometry, 6); if (!meets(g)) continue;
      const p = {}; for (const [a, v] of Object.entries(f.properties || {})) if (v != null && v !== '' && !/^(FID|OBJECTID|GlobalID|Shape__(Area|Length)|SHAPE_(Length|Area))$/i.test(a)) p[a] = v;
      p.whole_in_zone = wholeIn(g); p.in_cw = meets(g, CW_BOX); out.push({ type: 'Feature', geometry: g, properties: p });
    }
    if (H.attributesOnly) { columns = [...new Set(feats.flatMap(f => Object.keys(f.properties || {})))].filter(c => !/^(FID|OBJECTID|GlobalID|Shape__(Area|Length))$/i.test(c)); rows = feats.map(f => columns.map(c => f.properties[c])); }
    const meta = { source: `ONS Open Geography Portal: ${it.title}`, item: it.id, page: `https://geoportal.statistics.gov.uk/datasets/${it.id}`, api: `${lurl}/query`, item_modified: it.modified, fetched: today,
      licence: LICENCE, licence_url: 'https://www.ons.gov.uk/methodology/geography/licences', attribution: ATTRIB, why: H.why, zone: ZONE_TEXT,
      method: H.table ? `walk-portals.mjs onsgeo harvest ${key}: rows whose ${H.table} is a zone OA 2021 (${zoneOA.size}), in batches of 60` : `walk-portals.mjs onsgeo harvest ${key}: features that meet the zone box (ArcGIS envelope query), whole geometries, WGS84 rounded to 6 decimals; whole_in_zone, in_cw`,
      counts: H.table || H.attributesOnly ? { rows: rows.length } : { features: out.length, in_cw: out.filter(f => f.properties.in_cw).length } };
    if (meta0.copyrightText) meta.copyright_text = meta0.copyrightText.slice(0, 300);
    const file = join(OUT, 'onsgeo', key, `${key}.${H.table || H.attributesOnly ? 'json' : 'geojson'}`);
    const n = H.table || H.attributesOnly ? writeLines(file, { ...meta, columns }, 'rows', rows) : writeGeojson(file, meta, out);
    console.log(`\n${key}: ${it.title} -> ${H.table || H.attributesOnly ? rows.length + ' rows' : out.length + ' features'}, ${(n / 1e3).toFixed(0)} kB`);
  }
}
// triage needs the item ids of the harvest table: resolve them from the catalogue the same way
const _cat = existsSync(CAT) ? readJson(CAT) : null;
if (_cat) for (const H of Object.values(HARVEST)) { const c = _cat.items.filter(i => H.title.test(i.title) && i.type === 'Feature Service').sort((a, b) => b.modified.localeCompare(a.modified))[0]; if (c) H.id = c.id; }
