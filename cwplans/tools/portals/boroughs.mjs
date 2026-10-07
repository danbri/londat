// The zone borough portals, for walk-portals.mjs: City of London (INSPIRE ArcGIS map service, licence per layer from its
// data.gov.uk records), Tower Hamlets (ArcGIS Hub "Planning Datasets", DCAT feed), Southwark and Greenwich (InstantAtlas
// observatories: the indicator master tables on Esri UK's ArcGIS org and the InstantAtlas metadata service), Lewisham
// (JKAN "Open Data Lewisham" on GitHub Pages), Newham (no portal of its own). Rules and reasons:
// skills/cwplans-open-portals/SKILL.md, "Borough portals".
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getJson, politeFetch, rawFile, RAWP, OUT, today, ZONE, ZONE_TEXT, CW_BOX, meets, wholeIn, roundGeom, DROP_FIELD, writeLines, writeGeojson, licenceClass, OPEN_CLASSES, readLines , outExists, writeOut } from '../walk-portals.mjs';

const CITY = 'https://www.mapping.cityoflondon.gov.uk/arcgis/rest/services/INSPIRE/MapServer';
const TH_HUB = 'https://planning-datasets-towerhamlets.hub.arcgis.com';
const IA_ORG = 'https://services1.arcgis.com/HumUw0sDQHwJuboT/arcgis/rest/services';
const IA_META = 'https://hub.instantatlas.com/data-store-metadata-service/query';
const LEW = 'https://lb-lewisham.github.io/open-data-lewisham';
const LEW_RAW = 'https://raw.githubusercontent.com/lb-lewisham/open-data-lewisham/gh-pages/_datasets';
const ENV = `${ZONE[0]},${ZONE[1]},${ZONE[2]},${ZONE[3]}`;
const CAT = join(RAWP, 'boroughs', 'catalogue-full.json');      // every record (34k: the observatory indicators); the committed catalogue is compact
const norm = s => (s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const readJson = f => JSON.parse(readFileSync(f, 'utf8'));

// City layer licences: the City's own data.gov.uk records (INSPIRE), matched by normalised title (a trailing number
// in the slug is dropped by CKAN, not in the title)
async function cityLicences() {
  const m = new Map();
  for await (const l of readLines(join(RAWP, 'dgu', 'all.jsonl.gz'))) {
    if (!l || !l.includes('"org":"city-of-london"')) continue; const d = JSON.parse(l);
    m.set(norm(d.title), { name: d.name, licence_text: d.licence_text, licence_id: d.licence_id, cls: licenceClass(d.licence_id, `${d.licence_title || ''} ${d.licence_text || ''}`) });
  }
  return m;
}
function yamlFront(md) {        // the few JKAN front-matter keys used here (title, license, resources url/format/name)
  const fm = (/^---\n([\s\S]*?)\n---/.exec(md) || [])[1] || '', out = { resources: [] };
  const lines = fm.split('\n'); let r = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], m = /^(\w+):\s*(.*)$/.exec(l);
    if (m) { if (['title', 'license', 'organization'].includes(m[1])) out[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); r = null; continue; }
    const rm = /^\s+-\s+name:\s*(.*)$/.exec(l); if (rm) { r = { name: rm[1] }; out.resources.push(r); continue; }
    const km = /^\s+(url|format):\s*(.*)$/.exec(l);
    if (km && r) { let v = km[2]; if (v === '>-' || v === '>') v = (lines[++i] || '').trim(); r[km[1]] = v.replace(/^['"]|['"]$/g, ''); }
  }
  return out;
}

export async function walk() {
  const rows = [];
  // ---- City of London: every feature layer of the INSPIRE map service, with its count in the zone
  const lic = await cityLicences();
  const svc = await getJson(`${CITY}?f=json`);
  for (const L of svc.layers) {
    if (L.type !== 'Feature Layer') continue;
    let zone = null, err;
    try { zone = (await getJson(`${CITY}/${L.id}/query?where=1%3D1&geometry=${ENV}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json`)).count ?? null; } catch (e) { err = e.message.slice(0, 80); }
    const d = lic.get(norm(L.name));
    rows.push({ borough: 'City of London', portal: 'City of London INSPIRE map service', id: `city-${L.id}`, title: L.name, geometry: (L.geometryType || '').replace('esriGeometry', ''), url: `${CITY}/${L.id}`,
      licence_text: d ? (d.licence_text || d.licence_id || '').slice(0, 200) : null, licence: d ? d.cls : 'none', dgu: d?.name || null, zone, error: err });
    process.stdout.write(`\rcity ${L.id} ${zone}   `);
  }
  // ---- Tower Hamlets: the ArcGIS Hub DCAT feed
  const th = await getJson(`${TH_HUB}/api/feed/dcat-us/1.1.json`);
  for (const d of th.dataset) {
    const fs = (d.distribution || []).find(x => /GeoServices/.test(x.format || ''))?.accessURL;
    let zone = null; if (fs) zone = (await getJson(`${fs}/query?where=1%3D1&geometry=${ENV}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json`)).count ?? null;
    const lt = (d.license || '').replace(/<[^>]*>/g, '').trim();
    rows.push({ borough: 'Tower Hamlets', portal: 'Tower Hamlets ArcGIS Hub (Planning Datasets)', id: `th-${d.identifier.split('id=')[1]}`, title: d.title, url: d.landingPage, service: fs || null, modified: (d.modified || '').slice(0, 10),
      licence_text: lt.slice(0, 200), licence: licenceClass(null, lt), zone });
  }
  // ---- Southwark and Greenwich: InstantAtlas indicator master tables (distinct indicators) and their metadata
  for (const [borough, table] of [['Southwark', 'Southwark_MasterTable'], ['Greenwich', 'Greenwich_MasterTable']]) {
    const base = `${IA_ORG}/${table}/FeatureServer/0/query`;
    const geos = (await getJson(`${base}?f=json&outFields=ID,Name&where=Item_Type%3D%27Geo%27`)).features.map(f => f.attributes);
    const geoName = Object.fromEntries(geos.map(g => [g.ID, g.Name]));
    const themes = Object.fromEntries((await getJson(`${base}?f=json&outFields=ID,Name&where=Item_Type%3D%27Theme%27&resultRecordCount=4000`)).features.map(f => [f.attributes.ID, f.attributes.Name]));
    const ind = new Map();
    for (let off = 0; ; off += 4000) {
      const j = await getJson(`${base}?f=json&outFields=ID,Name,Theme_ID,Geo_ID&where=Item_Type%3D%27Indicator%27&orderByFields=OBJECTID&resultOffset=${off}&resultRecordCount=4000`);
      for (const f of j.features) { const a = f.attributes; const r = ind.get(a.ID) || { name: a.Name, theme: themes[a.Theme_ID] || a.Theme_ID, geos: new Set() }; r.geos.add(geoName[a.Geo_ID] || a.Geo_ID); ind.set(a.ID, r); }
      process.stdout.write(`\r${borough} ${ind.size} indicators   `);
      if (j.features.length < 4000) break;
    }
    const ids = [...ind.keys()], meta = new Map();
    for (let i = 0; i < ids.length; i += 80) {
      const where = `IndicatorID IN (${ids.slice(i, i + 80).map(x => `'${x}'`).join(',')})`;
      const j = await getJson(`${IA_META}?f=json&outFields=IndicatorID,Publisher,Rights,Spatial,Temporal&where=${encodeURIComponent(where)}`);
      for (const f of j.features || []) meta.set(f.attributes.IndicatorID, f.attributes);
    }
    for (const [id, r] of ind) {
      const m = meta.get(id) || {};
      rows.push({ borough, portal: `${borough} observatory (InstantAtlas, ${table})`, id: `${borough.toLowerCase()}-${id}`, title: r.name.slice(0, 160), theme: r.theme, geos: [...r.geos].sort(),
        publisher: (m.Publisher || '').slice(0, 80) || null, licence_text: (m.Rights || '').replace(/<[^>]*>/g, '').slice(0, 160) || null, licence: licenceClass(null, m.Rights || ''), temporal: m.Temporal || null });
    }
  }
  // ---- Lewisham: JKAN datasets.json and the dataset source files (licence, resources)
  const lew = await getJson(`${LEW}/datasets.json`);
  for (const d of lew) {
    const slug = d.url.split('/').filter(Boolean).pop();
    const fm = yamlFront((await politeFetch(`${LEW_RAW}/${slug}.md`)).toString('utf8'));
    rows.push({ borough: 'Lewisham', portal: 'Open Data Lewisham (JKAN)', id: `lewisham-${slug}`, title: d.title, url: `https://lb-lewisham.github.io${d.url}`, category: d.category,
      resources: fm.resources.map(r => ({ f: r.format, u: (r.url || '').slice(0, 200) })), licence_text: fm.license || null, licence: licenceClass(null, fm.license || '') });
  }
  // ---- Newham: no portal of its own (Newham Info, the local information system, is on the London Datastore, 2k8jr)
  rows.push({ borough: 'Newham', portal: 'none (Newham Info on the London Datastore)', id: 'newham-info', title: 'Newham Local Information System', url: 'https://data.london.gov.uk/dataset/newham-local-information-system-2k8jr', licence: 'see the London Datastore record', note: 'smallest geography: local authority (London Datastore metadata)' });
  writeLines(CAT, { portals: { 'City of London': `${CITY} (REST, every feature layer; licence per layer from the City's INSPIRE records on data.gov.uk)`, 'Tower Hamlets': `${TH_HUB}/api/feed/dcat-us/1.1.json`, Southwark: `${IA_ORG}/Southwark_MasterTable/FeatureServer/0 + ${IA_META} (https://data.southwark.gov.uk/ shows them)`, Greenwich: `${IA_ORG}/Greenwich_MasterTable/FeatureServer/0 + ${IA_META} (https://dataobservatory.royalgreenwich.gov.uk/ shows them)`, Lewisham: `${LEW}/datasets.json + ${LEW_RAW}/<slug>.md`, Newham: 'no portal of its own' },
    walked: today, zone: ZONE_TEXT, rule: 'every layer, dataset or indicator listed by the portal; zone = features that meet the box (ArcGIS count query) where the portal is a map service' }, 'datasets', rows);
  console.log(`\n${rows.length} records`);
  await catalogue();
}
// the committed catalogue: every record except the observatory indicators, which are summarised by borough,
// publisher, licence and theme (count and three sample titles); the full list stays in the raw cache
export async function catalogue() {
  const cat = readJson(CAT), keep = [], groups = new Map();
  for (const d of cat.datasets) {
    if (!d.portal.includes('InstantAtlas')) { keep.push(d); continue; }
    const pub = (d.publisher || '(none stated)').replace(/\s+/g, ' ').trim();
    const k = `${d.borough}|${pub}|${d.licence}|${d.theme}`; const g = groups.get(k) || { borough: d.borough, publisher: pub, licence: d.licence, theme: d.theme, indicators: 0, samples: [] };
    g.indicators++; if (g.samples.length < 3) g.samples.push(d.title.slice(0, 90)); groups.set(k, g);
  }
  writeLines(join(OUT, 'boroughs', 'catalogue.json'), { ...cat.meta, committed: 'every record except the Southwark and Greenwich observatory indicators (33,794), which are summarised in indicator_groups by borough, publisher, licence and theme; the full list is in data/raw/portals/boroughs/catalogue-full.json (rebuilt by walk)' },
    'datasets', keep);
  const f = join(OUT, 'boroughs', 'catalogue.json'), t = readFileSync(f, 'utf8').replace(/\]\}\n$/, `],\n"indicator_groups":[\n${[...groups.values()].map(g => JSON.stringify(g)).join(',\n')}\n]}\n`);
  (await import('fs')).writeFileSync(f, t);
}

// by hand: the reason for each
const JUDGED = {
  'th-83e5f5847fe44416929da4f5859df00e&sublayer=71': ['held', 'listed buildings: harvested from planning.data.gov.uk (OGL), feeds/portals/pdg/listed-building/; this hub states no licence'],
  'th-426e539786984df680b11de71a379b06&sublayer=6': ['held', 'conservation areas: held (London Datastore emqwg, and planning.data.gov.uk)'],
  'th-8e49d293108a4255bd7ad8d9d450edd3&sublayer=149': ['held', 'TPO zones: harvested from planning.data.gov.uk (OGL), feeds/portals/pdg/tree-preservation-zone/'],
  'th-da332d642c5d45b698462fea9703fc06&sublayer=148': ['held', 'TPO points: held (planning.data.gov.uk tree, tools/build-trees.mjs)'],
  'th-ee583d1b4d0540398be941601dc0d09b&sublayer=84': ['held', 'Article 4 Class E to residential: harvested from planning.data.gov.uk (OGL), feeds/portals/pdg/article-4-direction-area/'],
  'th-242df2beb87a4dca8a9ec519419d7ec1&sublayer=83': ['held', 'Article 4 residential to HMO: harvested from planning.data.gov.uk (OGL), feeds/portals/pdg/article-4-direction-area/'],
  'lewisham-fixmystreet-history': ['deferred', 'FixMyStreet requests by residents (free text, times, places); OGL stated, but reports are written by people: ask the owner before taking more than counts'],
  'lewisham-commonplace-is-consultations': ['deferred', 'consultation comments written by residents: ask the owner before taking more than counts'],
  'lewisham-ward-boundaries': ['held', 'ward boundaries held (London Datastore statistical boundaries, ONS)'],
  'lewisham-statistical-boundaries': ['held', 'statistical boundaries held (London Datastore 20od9)'],
  'lewisham-census-2011': ['walked-elsewhere', 'census tables: taken from Nomis / ONS at source (feeds/portals/nomis/)'],
  'lewisham-deprivation': ['walked-elsewhere', 'IMD: a national statistic, taken at source'],
  'lewisham-lookups': ['walked-elsewhere', 'ONS lookups: taken at source (ONS Open Geography)'],
  'lewisham-gis': ['deferred', 'an interactive map (MapThat), no data download'],
  'lewisham-corporate-publications': ['not-relevant', 'council publications (documents)'],
  'city-108': ['held', 'City conservation areas: held (London Datastore emqwg)'],
  'city-125': ['held', 'scheduled monuments: held (Historic England NHLE, registry/sources/museums)'],
  'city-124': ['held', 'safeguarded wharves: held (London Datastore 2g90r)'],
  'newham-info': ['walked-elsewhere', 'Newham Info is a London Datastore dataset (2k8jr), triaged by walk-london-datastore.mjs'],
};
const SENSITIVE = /\b(polling|toilets?|lloyds|ambulance|police parking|doctor parking|clinics?|health locations?|contributor businesses|community organisations|residential units)\b/i;
const NATIONAL_PUB = /office for national statistics|health improvement|ohid|statxplore|department for|ons\b|department|nhs|public health|ukhsa|ofsted|home office|police|dwp|hmrc|valuation office|land registry|environment agency|natural england|historic england|ministry|cabinet office|dvla|sport england|fingertips|nomis|esri uk|greater london authority|gla\b|london datastore|transport for london/i;
export async function triage() {
  const cat = readJson(CAT); harvestMap(cat);
  const rows = cat.datasets.map(d => {
    let state, rule, why;
    const H = HARVEST[d.id], file = H && join(OUT, 'boroughs', H.key, `${H.key}.geojson`);
    if (H && outExists(file)) { state = 'harvested'; rule = 'B1'; why = `feeds/portals/boroughs/${H.key}/`; }
    else if (JUDGED[d.id]) { [state, why] = JUDGED[d.id]; rule = 'B0'; }
    else if (d.borough === 'City of London' && SENSITIVE.test(d.title)) { state = 'deferred'; rule = 'B2'; why = `layer about people or their sites (${SENSITIVE.exec(d.title)[0]}): judge before harvest`; }
    else if (d.publisher != null || d.portal.includes('InstantAtlas')) {
      if (NATIONAL_PUB.test(d.publisher || '') || /ons|census|nomis/i.test(d.licence_text || '')) { state = 'walked-elsewhere'; rule = 'B3'; why = `re-served statistic of ${d.publisher || 'a national publisher'}: taken from the publisher (Nomis/ONS and the national adapters)`; }
      else if (!OPEN_CLASSES.includes(d.licence)) { state = 'not-open'; rule = 'B4'; why = `licence class ${d.licence}: ${(d.licence_text || 'no rights statement').slice(0, 80)}`; }
      else { state = 'deferred'; rule = 'B5'; why = `local statistic (${d.publisher}), ${d.geos.join(', ')}: rows not yet read`; }
    }
    else if (!OPEN_CLASSES.includes(d.licence)) { state = 'not-open'; rule = 'B4'; why = `licence class ${d.licence}${d.licence_text ? `: ${d.licence_text.slice(0, 100)}` : ' (no licence stated; City layers take theirs from their data.gov.uk record)'}`; }
    else if (d.error) { state = 'unavailable'; rule = 'B6'; why = d.error; }
    else if (d.zone === 0) { state = 'not-relevant'; rule = 'B7'; why = 'no feature meets the zone'; }
    else { state = 'listed-for-harvest'; rule = 'B8'; why = d.zone != null ? `${d.zone} zone features` : 'open; zone not counted (no map service)'; }
    return { borough: d.borough, id: d.id, title: d.title, licence: d.licence, zone: d.zone ?? null, state, rule, reason: why };
  });
  const counts = {}, byB = {};
  for (const r of rows) { counts[r.state] = (counts[r.state] || 0) + 1; (byB[r.borough] ||= {})[r.state] = (byB[r.borough][r.state] || 0) + 1; }
  // InstantAtlas indicators are many: one by one only when not walked-elsewhere; the rest as an id list per borough
  const isIA = r => /^(southwark|greenwich)-I/.test(r.id) && r.state !== 'deferred';
  const detail = rows.filter(r => !isIA(r));
  const bulk = {}; for (const r of rows) if (isIA(r)) (bulk[`${r.borough} | ${r.state} | ${r.rule} | ${r.state === 'not-open' ? `licence class ${r.licence} (Rights field)` : 're-served statistics of national publishers'}`] ||= []).push(r.id.replace(/^\w+-/, ''));
  const meta = { portal: 'zone borough portals', triaged: today, counts, by_borough: byB,
    rules: ['B0 by hand (JUDGED, with the reason)', 'B1 harvested', 'B2 deferred: a City layer about people or their sites (polling places, toilets, clinics, contributor businesses, residential units...)', 'B3 walked-elsewhere: an observatory indicator re-served from a national publisher (ONS, NHS, DfE, police, GLA, TfL...): taken at source', 'B4 not-open (City layers: the licence of their data.gov.uk INSPIRE record; OS INSPIRE end-user licence = restricted; no record = none)', 'B5 deferred: a local open statistic not yet read', 'B6 unavailable: the service failed', 'B7 not-relevant: no feature meets the zone', 'B8 listed-for-harvest'],
    bulk_note: 'by_state: the observatory indicator ids (without the borough prefix), keyed "borough | state | rule | reason"; the indicators themselves are summarised in catalogue.json indicator_groups' };
  const out = `{"meta":${JSON.stringify(meta, null, 1)},\n"datasets":[\n${detail.map(r => JSON.stringify(r)).join(',\n')}\n],\n"by_state":{\n${Object.entries(bulk).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n')}\n}}\n`;
  (await import('fs')).writeFileSync(join(OUT, 'boroughs', 'triage.json'), out);
  console.log(counts, byB);
}

// ---- harvest: City layers (ArcGIS query in the zone, GeoJSON out) and the Lewisham EV charge points (GeoJSON file)
export const HARVEST = {};
const ringArea = r => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
function esriToGeo(g) {            // Esri JSON geometry to GeoJSON: outer rings are clockwise (negative area), holes counter-clockwise
  if (!g) return null;
  if (g.x != null) return { type: 'Point', coordinates: [g.x, g.y] };
  if (g.paths) return { type: 'MultiLineString', coordinates: g.paths };
  if (g.rings) { const polys = []; for (const r of g.rings) { if (ringArea(r) < 0 || !polys.length) polys.push([r]); else polys[polys.length - 1].push(r); } return { type: 'MultiPolygon', coordinates: polys }; }
  return null;
}
const slug = t => norm(t).replace(/ /g, '-').slice(0, 50);
function harvestMap(cat) {
  // every open City layer with features in the zone, unless judged by hand or about people or their sites
  for (const d of cat.datasets) if (d.borough === 'City of London' && OPEN_CLASSES.includes(d.licence) && d.zone > 0 && !JUDGED[d.id] && !SENSITIVE.test(d.title)) HARVEST[d.id] = { key: `city-${slug(d.title)}`, d };
  const lewEv = cat.datasets.find(d => d.id === 'lewisham-vehicle-chargepoints'); if (lewEv) HARVEST[lewEv.id] = { key: 'lewisham-ev-chargepoints', d: lewEv };
}
export async function harvest(keys) {
  const cat = readJson(CAT); harvestMap(cat);
  const sizes = {};
  for (const [id, H] of Object.entries(HARVEST)) {
    if (keys.length && !keys.includes(H.key)) continue;
    const d = H.d;
    if (!OPEN_CLASSES.includes(d.licence)) { console.log(`${H.key}: licence ${d.licence}, skipped`); continue; }
    if (d.zone === 0) { console.log(`${H.key}: nothing in the zone`); continue; }
    let feats = [], api;
    if (d.borough === 'City of London') {
      api = `${d.url}/query?where=1=1&geometry=<zone box>&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=geojson&resultOffset=<n>`;
      for (let off = 0; ; off += 1000) {
        const j = await getJson(`${d.url}/query?where=1%3D1&geometry=${ENV}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=geojson&resultOffset=${off}&resultRecordCount=1000`);
        feats.push(...(j.features || [])); if (!(j.features || []).length || !j.exceededTransferLimit && j.features.length < 1000) break;
      }
      if (feats.length && feats.every(f => !f.geometry)) {      // the map service answers f=geojson with null geometries for some polygon layers
        feats = []; api = api.replace('f=geojson', 'f=json (Esri rings converted)');
        for (let off = 0; ; off += 1000) {
          const j = await getJson(`${d.url}/query?where=1%3D1&geometry=${ENV}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=json&resultOffset=${off}&resultRecordCount=1000`);
          feats.push(...(j.features || []).map(f => ({ properties: f.attributes, geometry: esriToGeo(f.geometry) })));
          if (!(j.features || []).length || !j.exceededTransferLimit && j.features.length < 1000) break;
        }
      }
    } else {
      const u = d.resources.find(r => /raw\/gh-pages/.test(r.u))?.u.replace('https://github.com/lb-lewisham/open-data-lewisham/raw/gh-pages/', 'https://raw.githubusercontent.com/lb-lewisham/open-data-lewisham/gh-pages/');
      api = u; const j = JSON.parse((await politeFetch(u)).toString('utf8')); feats = j.features;
    }
    const dropped = new Set(), out = [];
    const noGeom = feats.length > 0 && feats.every(f => !f.geometry);   // the service withholds geometry (both f=geojson and f=json): the server's own box filter is kept
    for (const f of feats) {
      if (!f.geometry && !noGeom) continue; const g = f.geometry ? roundGeom(f.geometry, 6) : null; if (g && !meets(g)) continue;
      const p = {}; for (const [a, v] of Object.entries(f.properties || {})) { if (DROP_FIELD.test(a)) { dropped.add(a); continue; } if (v !== '' && v != null && !/^(Shape(_|\.)(Length|Area|STLength|STArea).*|shape_(length|area))$/i.test(a)) p[a] = v; }
      if (g) { p.whole_in_zone = wholeIn(g); p.in_cw = meets(g, CW_BOX); }
      out.push({ type: 'Feature', geometry: g, properties: p });
    }
    const meta = { source: `${d.portal}: ${d.title}`, borough: d.borough, page: d.url, api, fetched: today,
      licence: d.licence === 'ogl' ? 'Open Government Licence v3.0' : d.licence, licence_evidence: d.borough === 'City of London' ? `the City's INSPIRE record on data.gov.uk (${d.dgu}): ${d.licence_text}` : d.licence_text,
      licence_url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      attribution: d.borough === 'City of London' ? 'Contains public sector information licensed under the Open Government Licence v3.0 (City of London Corporation)' : 'Contains public sector information licensed under the Open Government Licence v3.0 (London Borough of Lewisham)',
      zone: ZONE_TEXT, method: `walk-portals.mjs boroughs harvest ${H.key}: features that meet the zone box, WGS84 rounded to 6 decimals, whole geometries; whole_in_zone, in_cw; empty fields and ArcGIS shape measures left out; fields matching ${DROP_FIELD} dropped`,
      counts: { features: out.length, zone_count_at_walk: d.zone ?? null, in_cw: out.filter(f => f.properties.in_cw).length }, fields_dropped: [...dropped] };
    if (noGeom) meta.geometry_withheld = 'the map service returns no geometry for this layer (f=geojson and f=json); features are those its own spatial filter puts in the box, with geometry null; place them by address';
    const n = writeGeojson(join(OUT, 'boroughs', H.key, `${H.key}.geojson`), meta, out);
    sizes[H.key] = n; console.log(`${H.key}: ${out.length} features, ${(n / 1e3).toFixed(0)} kB`);
  }
  console.log(Object.values(sizes).reduce((a, b) => a + b, 0) / 1e6, 'MB');
}
