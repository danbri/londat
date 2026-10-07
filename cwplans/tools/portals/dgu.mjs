// data.gov.uk adapter for walk-portals.mjs (CKAN API at https://www.data.gov.uk/api/action/). Rules and reasons:
// skills/cwplans-open-portals/SKILL.md, "data.gov.uk".
import { writeFileSync, existsSync, mkdirSync, createWriteStream } from 'fs';
import { join } from 'path';
import { createGzip } from 'zlib';
import { getJson, politeFetch, RAWP, OUT, today, readLines, licenceClass, OPEN_CLASSES, ZONE, LONDON, ZONE_TEXT, CW_BOX, zonePlace, ZONE_BOROUGHS, OTHER_LONDON, projectText, writeLines, writeGeojson, meets, wholeIn, roundGeom, DROP_FIELD , outExists, writeOut, readOut } from '../walk-portals.mjs';
import { clipRing } from '../lib.mjs';

const API = 'https://www.data.gov.uk/api/action/package_search';
const RAWD = join(RAWP, 'dgu'), ALL = join(RAWD, 'all.jsonl.gz');
const ex = (d, k) => (d.extras || []).find(e => e.key === k)?.value;
const AREA_WORDS = /\b(lower (layer )?super output areas?|middle (layer )?super output areas?|output areas?|lsoas?|msoas?|wards?|postcodes?|postcode (sectors?|districts?)|uprns?|toids?|usrns?|easting|northing|latitude|longitude|grid references?|point locations?|polygons?|shapefiles?|geopackage|1 ?km grid|100 ?m grid|local authorit(y|ies)|boroughs?|counties|regions?|national|england|wales|scotland|northern ireland|great britain|united kingdom|london)\b/gi;

// ---- walk: every public dataset, page by page (1,000 per request), written compact to the raw cache
function compact(d) {
  const num = k => { const v = parseFloat(ex(d, k)); return isFinite(v) ? v : null; };
  const bb = [num('bbox-west-long'), num('bbox-south-lat'), num('bbox-east-long'), num('bbox-north-lat')];
  const notes = d.notes || '';
  return {
    id: d.id, name: d.name, title: (d.title || '').slice(0, 200), org: d.organization?.name || null, org_title: d.organization?.title || null,
    licence_id: d.license_id || null, licence_title: d.license_title || null,
    licence_text: [ex(d, 'licence'), ex(d, 'access_constraints')].filter(v => v && v !== '[]').join(' | ').slice(0, 400) || null,
    created: (d.metadata_created || '').slice(0, 10), modified: (d.metadata_modified || '').slice(0, 10),
    issued: (ex(d, 'dataset-reference-date') || '').match(/\d{4}-\d\d-\d\d/)?.[0] || ex(d, 'dcat_issued')?.slice(0, 10) || null,
    temporal: [d['temporal_coverage-from'], d['temporal_coverage-to']].some(Boolean) ? [d['temporal_coverage-from'] || null, d['temporal_coverage-to'] || null] : undefined,
    frequency: ex(d, 'frequency-of-update') || d.update_frequency || null,
    inspire: ex(d, 'UKLP') === 'True' || undefined,
    bbox: bb.every(v => v != null) ? bb.map(v => Math.round(v * 1e4) / 1e4) : undefined,
    tags: (d.tags || []).map(t => t.name).slice(0, 20),
    area_words: [...new Set((notes.match(AREA_WORDS) || []).map(w => w.toLowerCase()))].slice(0, 12),
    zone_place: zonePlace(`${d.title} ${notes} ${(d.tags || []).map(t => t.name).join(' ')}`) || undefined,
    notes_len: notes.length,
    resources: (d.resources || []).slice(0, 25).map(r => ({ f: (r.format || '').toLowerCase().slice(0, 20) || null, u: (r.url || '').slice(0, 300), n: (r.name || r.description || '').slice(0, 100), d: (r.last_modified || r.created || '').slice(0, 10) || undefined })),
    n_resources: (d.resources || []).length,
  };
}
export async function walk() {
  mkdirSync(RAWD, { recursive: true });
  const first = await getJson(`${API}?rows=0`); const total = first.result.count;
  const gz = createGzip(), out = createWriteStream(ALL); gz.pipe(out);
  let n = 0;
  for (let start = 0; start < total + 1000; start += 1000) {
    const j = await getJson(`${API}?rows=1000&start=${start}&sort=${encodeURIComponent('metadata_created asc')}`, { timeout: 600000 });
    const rs = j.result.results; if (!rs.length) break;
    for (const d of rs) { gz.write(JSON.stringify(compact(d)) + '\n'); n++; }
    process.stdout.write(`\r${n} / ${j.result.count}`);
  }
  gz.end(); await new Promise(r => out.on('finish', r));
  writeFileSync(join(RAWD, 'walk.json'), JSON.stringify({ walked: today, count_at_start: total, written: n }));
  console.log(`\nwrote ${n} datasets to ${ALL}`);
}

// ---- scope: which datasets this walk catalogues (the rest are counted per organisation in the meta)
// S1 local publishers (zone boroughs, zone bodies); S2 national publishers whose data can reach a street, building,
// postcode or small area; S3 the GLA (its datasets are the London Datastore, walked by walk-london-datastore.mjs);
// S4 any other publisher whose title, tags or description name a zone place or a zone borough.
export const LOCAL_ORGS = ['london-borough-of-tower-hamlets', 'southwark-london-borough-council', 'royal-borough-of-greenwich', 'london-borough-of-lewisham', 'london-borough-of-newham', 'city-of-london',
  'london-thames-gateway-development-corporation', 'canal-river-trust', 'transport-for-london', 'royal-museums-greenwich', 'national-maritime-museum', 'tower-hamlets-pct', 'southwark-primary-care-trust', 'lewisham-primary-care-trust',
  'newham-primary-care-trust', 'newham-university-hospital-nhs-trust', 'barts-and-the-london-nhs-trust', 'london-ambulance-service-nhs-trust', 'nhs-london', 'port-of-london-authority'];
export const NATIONAL_ORGS = ['environment-agency', 'historic-england', 'natural-england', 'department-for-transport', 'department-for-communities-and-local-government', 'ministry-of-housing-communities-and-local-government',
  'office-for-national-statistics', 'ordnance-survey', 'health-and-safety-executive', 'home-office', 'nhs-england', 'nhs-digital', 'land-registry', 'coal-authority', 'british-geological-survey',
  'department-for-energy-security-and-net-zero', 'department-for-business-energy-and-industrial-strategy', 'department-of-energy-and-climate-change', 'department-for-environment-food-and-rural-affairs',
  'department-for-education', 'care-quality-commission', 'valuation-office-agency', 'sport-england', 'arts-council-england', 'charity-commission-for-england-and-wales', 'food-standards-agency',
  'companies-house', 'united-kingdom-hydrographic-office', 'maritime-and-coastguard-agency', 'met-office', 'forestry-commission', 'joint-nature-conservation-committee', 'public-health-england',
  'uk-health-security-agency', 'office-for-standards-in-education-childrens-services-and-skills', 'department-for-culture-media-and-sport', 'homes-and-communities-agency', 'ofcom', 'ofgem',
  'driver-and-vehicle-licensing-agency', 'department-for-work-and-pensions', 'british-transport-police-authority', 'rural-payments-agency'];
const scopeOf = d => LOCAL_ORGS.includes(d.org) ? 'S1' : NATIONAL_ORGS.includes(d.org) ? 'S2' : d.org === 'greater-london-authority' ? 'S3'
  : (d.zone_place || /\b(tower hamlets|southwark|lewisham|royal borough of greenwich|newham|city of london)\b/i.test(`${d.title} ${d.tags.join(' ')}`)) ? 'S4' : null;
const SCOPES = {
  S1: 'S1: published by a zone borough or a body local to the zone (Tower Hamlets, Southwark, Greenwich, Lewisham, Newham, City of London, LTGDC, Canal & River Trust, TfL, Royal Museums Greenwich, PLA, local NHS bodies)',
  S2: 'S2: published by a national body named in the brief whose data can reach a street, building, postcode or small area (EA, Historic England, Natural England, DfT, DLUHC/MHCLG, ONS, OS, HSE, Home Office, NHS, HM Land Registry, Coal Authority, BGS, DESNZ, Defra, DfE, CQC, VOA, Sport England, Arts Council, Charity Commission, FSA, Companies House, UKHO, MCA, Met Office, Forestry Commission, JNCC, PHE/UKHSA, Ofsted, DCMS, Homes England, Ofcom, Ofgem, DVLA, DWP, BTP)',
  S3: 'S3: published by the Greater London Authority: the London Datastore mirror, walked by walk-london-datastore.mjs (state walked-elsewhere)',
  S4: 'S4: any other publisher whose title or tags name a place or borough in the zone',
};

// ---- triage rules (first match); SKILL repeats them
const SENSITIVE = /\b(fatal|homicide|victims?|strip search|intimate|suicide|custody|stop and search|hate crime|domestic abuse|sexual|missing persons?|rough sleep\w*|deaths? in|(child|adult)(ren)? safeguarding|safeguarding (children|adults)|child protection|looked after children|individual patient|patient level|named individuals?)\b/i;
const OTHER_PLACES = /\b(scotland|scottish|wales|welsh|northern ireland|cymru|ni\b|isle of man|jersey|guernsey|york|leeds|manchester|liverpool|birmingham|bristol|sheffield|newcastle|nottingham|leicester|cambridge(shire)?|oxford(shire)?|kent|essex|surrey|sussex|hampshire|devon|cornwall|norfolk|suffolk|yorkshire|lancashire|cumbria|durham|northumberland|cheshire|derbyshire|lincolnshire|somerset|dorset|wiltshire|gloucestershire|herefordshire|shropshire|staffordshire|warwickshire|worcestershire|northamptonshire|bedfordshire|hertfordshire|buckinghamshire|berkshire|calderdale|gosport|tunbridge wells|barrow|severn|humber|tees|tyne|mersey|solent|wash|dee|tamar|exe|trent|avon|ouse|wye)\b/i;
const FINE_WORDS = /^(lower (layer )?super output areas?|middle (layer )?super output areas?|output areas?|lsoas?|msoas?|wards?|postcodes?|postcode (sectors?|districts?)|uprns?|toids?|usrns?|easting|northing|latitude|longitude|grid references?|point locations?|polygons?|shapefiles?|geopackage|1 ?km grid|100 ?m grid)$/;
const SPATIAL_F = /^(wms|wfs|wcs|ogc|arcgis|esri rest|geojson|gpkg|geopackage|shp|shapefile|kml|kmz|gml|zip|esri|atom|ogc api|ogc api - features|inspire)/;
const DATA_F = /^(csv|xls|xlsx|ods|json|geojson|xml|zip|txt|tsv|rdf|ttl|sparql|api|parquet|gpkg|shp|wms|wfs|wcs|gml|kml|esri|arcgis|ogc|atom)/;
const DOC_F = /^(pdf|html|htm|doc|docx|ppt|pptx|odt|rtf|jpg|png|)$/;
const THEMES = {
  environment: /flood|water|river|tide|tidal|air quality|noise|pollut|contaminat|habitat|species|ecolog|biodiversity|tree|woodland|green|park|nature|conservation area|sssi|nature reserve|geolog|soil|landfill|waste|emission|climate|heat|energy|solar|carbon|weather/i,
  'buildings-places': /building|listed|heritage|monument|historic|planning|land use|brownfield|property|address|uprn|toid|boundar|development|housing|tenure|price paid|council tax|rating|business rates|premises|licen[cs]/i,
  transport: /road|traffic|transport|bus|rail|station|cycle|cycling|pedestrian|parking|collision|accident|vehicle|port|ship|navigation|pier|bridge|tunnel|street/i,
  'people-housing': /census|population|deprivation|imd|income|employment|benefit|household|health|school|pupil|crime|fuel poverty|broadband|connectivity/i,
};
// by hand (with the reason); applied before the automatic rules
const JUDGED = {
  'flood-map-for-planning-flood-zones1': ['held', 'harvested from planning.data.gov.uk (feeds/portals/pdg/flood-risk-zone/)'],
  'aims-spatial-flood-defences-inc-standardised-attributes': ['held', 'EA spatial flood defences are held (source ea-defences)'],
  'lidar-composite-dtm-2017-1m': ['held', 'EA LiDAR composite is held (source ea-lidar)'], 'lidar-composite-dsm-2017-1m': ['held', 'EA LiDAR composite is held (source ea-lidar)'],
  'lidar-dsm-time-stamped-tiles': ['held', 'EA LiDAR DSM survey tiles are held (source ea-dsm-history)'], 'vertical-aerial-photography': ['held', 'EA survey imagery is held (source ea-survey-imagery)'],
};
// records with no licence whose resources all sit on a site whose terms license its content under OGL v3.0 (read
// 2026-10-04): GOV.UK ("All content is available under the Open Government Licence v3.0, except where otherwise
// stated"), ONS and Nomis, NHS Digital statistics, DfT road traffic, data.police.uk
const SITE_TERMS = /^https?:\/\/(www\.gov\.uk|assets\.publishing\.service\.gov\.uk|(www\.)?ons\.gov\.uk|(www\.)?statistics\.gov\.uk|(www\.)?nomisweb\.co\.uk|digital\.nhs\.uk|files\.digital\.nhs\.uk|roadtraffic\.dft\.gov\.uk|data\.police\.uk)\//i;
// records whose resources all sit on a portal that another adapter walks whole (state walked-elsewhere)
const ELSEWHERE = [
  [/^https?:\/\/open-geography-portalx?-ons\.hub\.arcgis\.com\/|^https?:\/\/geoportal\.statistics\.gov\.uk\//i, 'ONS Open Geography Portal item: walked by walk-portals.mjs onsgeo (feeds/portals/onsgeo/)'],
  [/^https?:\/\/(osdatahub\.os\.uk|api\.os\.uk)\//i, 'OS Data Hub product: OS OpenData products are walked by walk-portals.mjs national (feeds/portals/national/); Premium products are not open'],
  [/^https?:\/\/www\.mapping\.cityoflondon\.gov\.uk\//i, 'City of London INSPIRE map service: walked whole by walk-portals.mjs boroughs (feeds/portals/boroughs/)'],
];
// administrative records: about the publisher, not about places
const ADMIN = /\b(payments?|spend(ing)?|expenditure|invoices?|salar(y|ies)|organogram|senior staff|staff numbers|workforce|freedom of information|foi|contracts?( register)?|procurement|tenders?|purchase orders?|grants? to voluntary|gifts and hospitality|transparency|pay multiple|credit card|meetings with|business plan|annual report|accounts?)\b/i;
// zone place names that are also common nouns: only in the title, and not next to tree or crop words
const PLACE_NOISE = /\b(coppice|willow|energy crops?|tree species|timber|forestry|seed|clones?|black poplar|dna)\b/i;
export async function triage() {
  const P = projectText();
  const { existsSync: ex, readFileSync: rf } = await import('fs');
  const PROBE = ex(join(OUT, 'dgu', 'probe.json')) ? JSON.parse(rf(join(OUT, 'dgu', 'probe.json'), 'utf8')).datasets : {};
  const rows = [], perOrg = {}, perScope = { S1: 0, S2: 0, S3: 0, S4: 0, out: 0 };
  let total = 0;
  for await (const l of readLines(ALL)) {
    if (!l) continue; const d = JSON.parse(l); total++;
    const sc = scopeOf(d); if (!sc) { perScope.out++; continue; }
    perScope[sc]++; perOrg[d.org || '(none)'] = (perOrg[d.org || '(none)'] || 0) + 1;
    const lic = licenceClass(d.licence_id, `${d.licence_title || ''} ${d.licence_text || ''}`);
    const fmts = [...new Set(d.resources.map(r => (r.f || (r.u.match(/\.([a-z0-9]{2,7})(\?|$)/i)?.[1] || '')).toLowerCase()))];
    const kind = !d.n_resources ? 'none' : fmts.some(f => SPATIAL_F.test(f) || /arcgis|wfs|wms|mapserver|featureserver|ogc/i.test(d.resources.map(r => r.u).join(' '))) ? 'spatial' : fmts.some(f => DATA_F.test(f)) ? 'data' : 'document';
    const text = `${d.title} ${d.tags.join(' ')}`;
    const zp = zonePlace(text) && !PLACE_NOISE.test(text) ? zonePlace(text) : null;
    const zb = Object.keys(ZONE_BOROUGHS).filter(b => new RegExp(`\\b${b}\\b`, 'i').test(text) || (b === 'city of london' && d.org === 'city-of-london'));
    const orgZone = ['S1'].includes(sc);
    const bbox = d.bbox, bbMeets = bbox && !(bbox[2] < ZONE[0] || bbox[0] > ZONE[2] || bbox[3] < ZONE[1] || bbox[1] > ZONE[3]);
    const bbLondon = bbox && bbox[0] >= LONDON[0] - 0.05 && bbox[2] <= LONDON[2] + 0.05 && bbox[1] >= LONDON[1] - 0.05 && bbox[3] <= LONDON[3] + 0.05;
    const fine = d.area_words.some(w => FINE_WORDS.test(w)) || kind === 'spatial';
    let rel, relWhy;
    if (zp) { rel = 'zone-place'; relWhy = `title or tags name ${zp}`; }
    else if (zb.length || orgZone) { rel = 'zone-borough'; relWhy = zb.length ? `names ${zb.join(', ')}` : `publisher ${d.org}`; }
    else if (bbox && !bbMeets) { rel = 'other-area'; relWhy = `bounding box ${bbox.join(',')} misses the zone`; }
    else if (OTHER_PLACES.test(d.title) || OTHER_LONDON.some(b => new RegExp(`\\b${b}\\b`, 'i').test(d.title))) { rel = 'other-area'; relWhy = `title names ${(OTHER_PLACES.exec(d.title) || [OTHER_LONDON.find(b => new RegExp(`\\b${b}\\b`, 'i').test(d.title))])[0]}`; }
    else if (bbLondon && bbMeets) { rel = 'london-fine'; relWhy = 'bounding box within London and meets the zone'; }
    else if (fine) { rel = 'national-fine'; relWhy = `fine geography (${d.area_words.filter(w => FINE_WORDS.test(w)).join(', ') || 'spatial resources'})${bbMeets ? '; bounding box meets the zone' : ''}`; }
    else if (d.area_words.length || bbMeets) { rel = 'national-coarse'; relWhy = d.area_words.length ? `area words: ${d.area_words.join(', ')}` : 'bounding box meets the zone, no finer area named'; }
    else { rel = 'unknown'; relWhy = 'no area named'; }
    const themes = Object.entries(THEMES).filter(([, re]) => re.test(text)).map(([k]) => k);
    const lname = d.name.toLowerCase();
    const nameKey = lname.length >= 15 && lname.includes('-');          // short slugs ("locks", "matrix") match prose, not references
    const held = P.held.includes(d.id) || (nameKey && P.held.includes(lname)) ? 'held' : P.listed.includes(d.id) || (nameKey && P.listed.includes(lname)) ? 'listed' : null;
    let licUse = lic;
    if (lic === 'none' && d.resources.length && d.resources.every(r => SITE_TERMS.test(r.u))) licUse = 'ogl-site-terms';
    const sensitive = SENSITIVE.test(text);
    // final state, first match
    let state, rule, why;
    const J = JUDGED[d.name];
    if (sensitive) { state = 'sensitive'; rule = 'T1'; why = `sensitive title (${SENSITIVE.exec(text)[0]})`; }
    else if (J) { [state, why] = J; rule = 'T0'; }
    else if (held === 'held') { state = 'held'; rule = 'T2'; why = 'the project already holds this dataset (named in a tool, the data register or pipeline.json)'; }
    else if (sc === 'S3') { state = 'walked-elsewhere'; rule = 'T3'; why = 'GLA dataset: the London Datastore record is the source (feeds/london-datastore/triage.json)'; }
    else if (d.resources.some(r => ELSEWHERE.some(([re]) => re.test(r.u)))) { state = 'walked-elsewhere'; rule = 'T3'; why = ELSEWHERE.find(([re]) => d.resources.some(r => re.test(r.u)))[1]; }
    else if (kind === 'none') { state = 'unavailable'; rule = 'T4'; why = 'no resources'; }
    else if (/^deleted\b|\bwithdrawn\b/i.test(d.title)) { state = 'unavailable'; rule = 'T4'; why = `title says ${/^deleted\b|\bwithdrawn\b/i.exec(d.title)[0].toLowerCase()}`; }
    else if (ADMIN.test(`${d.title} ${d.name.replace(/-/g, ' ')}`)) { state = 'not-relevant'; rule = 'T5'; why = `administrative record (${ADMIN.exec(`${d.title} ${d.name.replace(/-/g, ' ')}`)[0]}), not about places`; }
    else if (!OPEN_CLASSES.includes(lic) && licUse !== 'ogl-site-terms') { state = 'not-open'; rule = 'T6'; why = `licence class ${lic}${d.licence_title ? ` (${d.licence_title})` : ''}${d.licence_text ? `: ${d.licence_text.slice(0, 120)}` : ''}`; }
    else if (rel === 'other-area') { state = 'not-relevant'; rule = 'T7'; why = relWhy; }
    else if (kind === 'document') { state = 'deferred'; rule = 'T8'; why = `documents or web pages only (${fmts.join(', ') || 'no format'})`; }
    else if (outExists(join(OUT, 'dgu', d.name, `${d.name}.geojson`))) { state = 'harvested'; rule = 'T9a'; why = `feeds/portals/dgu/${d.name}/ (${PROBE[d.name]?.zone ?? '?'} zone features in the probe)`; }
    else if (['zone-place', 'zone-borough', 'london-fine', 'national-fine'].includes(rel) && PROBE[d.name] && PROBE[d.name].zone === 0 && !PROBE[d.name].error && PROBE[d.name].layers.every(x => !x.error)) { state = 'not-relevant'; rule = 'T7b'; why = `the probe found no feature in the zone (${PROBE[d.name].layers.length} layers of ${PROBE[d.name].service})`; }
    else if (['zone-place', 'zone-borough', 'london-fine', 'national-fine'].includes(rel)) { state = 'listed-for-harvest'; rule = 'T9'; why = `${rel}: ${relWhy}${PROBE[d.name]?.zone ? `; probe: ${PROBE[d.name].zone} features in the zone` : PROBE[d.name] ? '; probe: no count (service error)' : ''}`; }
    else if (rel === 'national-coarse') { state = 'not-relevant'; rule = 'T10'; why = `coarser than a borough for the zone (${relWhy})`; }
    else { state = 'deferred'; rule = 'T11'; why = 'open data, area not stated in the metadata: probe the data before deciding'; }
    // score ranks the listed ones (it does not decide)
    const W = { 'zone-place': 5, 'zone-borough': 4, 'london-fine': 3, 'national-fine': 2, unknown: 1, 'national-coarse': 0.3, 'other-area': 0 };
    const yr = +(d.modified || '2000').slice(0, 4);
    const probeBoost = PROBE[d.name]?.zone ? 3 : 1;
    const score = state === 'listed-for-harvest' ? Math.round(probeBoost * W[rel] * (1 + themes.length * 0.5) * (yr >= 2024 ? 1 : yr >= 2020 ? 0.7 : 0.4) * (kind === 'spatial' ? 1.3 : 1) * (held === 'listed' ? 0.8 : 1) * 10) / 10 : 0;
    rows.push({ id: d.id, name: d.name, title: d.title.slice(0, 120), org: d.org, scope: sc, licence: licUse, kind, formats: fmts.slice(0, 8), relevance: rel, themes, have: held, state, rule, reason: why, score, modified: d.modified });
  }
  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const counts = {}; for (const r of rows) counts[r.state] = (counts[r.state] || 0) + 1;
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);
  if (sum !== rows.length) throw new Error('state counts do not sum');
  const meta = {
    portal: 'data.gov.uk', api: API, triaged: today, walked: JSON.parse((await import('fs')).readFileSync(join(RAWD, 'walk.json'), 'utf8')).walked,
    datasets_on_portal: total, in_scope: rows.length, scope: SCOPES, scope_counts: perScope, per_org: Object.fromEntries(Object.entries(perOrg).sort((a, b) => b[1] - a[1])), counts,
    rules: {
      licence: 'licence_id, then licence_title and the INSPIRE licence and access_constraints text: OGL, CC BY, ODC-By, CC0/PDDL/public domain are open; NC and closed are restricted; CC BY-SA and ODbL share-alike (never harvested); "no conditions apply" alone is open-unclear (not harvested until read); no licence is none (metadata only)',
      relevance: 'first match: zone-place (title, tags or description name a zone place); zone-borough (title or tags name a zone borough, or a local publisher, scope S1); other-area (bounding box misses the zone, or the title names another region, county, city or London borough); london-fine (bounding box inside London and meets the zone); national-fine (description names a fine geography: OA/LSOA/MSOA/ward/postcode/UPRN/TOID/coordinates/grid, or a spatial service or format); national-coarse (only region, nation, borough or local authority words, or a national bounding box); unknown',
      kind: 'spatial (WMS/WFS/ArcGIS/OGC/GeoJSON/GeoPackage/shapefile resource), data (CSV, spreadsheet, JSON, XML, API), document (PDF, HTML pages only), none',
      have: 'held: the dataset name or id appears in a tool, data-register.json or pipeline.json; listed: in a .md note or feeds/feeds.json',
      states: ['T0 by hand (JUDGED, with the reason)', 'T1 sensitive title', 'T2 held', 'T3 walked-elsewhere (GLA = London Datastore; a resource on the ONS Open Geography Portal, the OS Data Hub or the City of London map service, which other adapters walk whole)', 'T4 unavailable (no resources)', 'T5 not-relevant: administrative record (payments, spending, staff, contracts, FOI)', 'T6 not-open (licence class not open; a record with no licence whose resources all sit on GOV.UK, ONS, Nomis, NHS Digital, DfT road traffic or data.police.uk counts as ogl-site-terms, open)', 'T7 not-relevant: other area', 'T7b not-relevant: the service probe found no feature in the zone (dgu/probe.json)', 'T8 deferred: documents only', 'T9a harvested (a zone extract in dgu/<name>/)', 'T9 listed-for-harvest (x3 in the score when the probe found zone features)', 'T10 not-relevant: coarser than a borough', 'T11 deferred: area unknown'],
      zone_place: 'a zone place name in the title or tags (not the description); not when the text has tree or crop words (poplar is a tree)',
      score: 'listed only: relevance weight x (1 + 0.5 per theme) x recency (2024+: 1, 2020+: 0.7, else 0.4) x 1.3 for a spatial resource x 0.8 when listed elsewhere. It ranks; it does not decide.',
      harvested: 'a dataset harvested from this walk or from its source API is state harvested in feeds/portals/README.md and in the harvest file meta (dgu_dataset)',
    },
  };
  // detailed rows for the states that need a decision or hold data; the bulk states as name lists grouped by rule
  const DETAIL = ['listed-for-harvest', 'harvested', 'held', 'deferred', 'sensitive'];  // T7b probe results are bulk
  const isDetail = r => (DETAIL.includes(r.state) && r.rule !== 'T8') || r.rule === 'T0';
  const detail = rows.filter(isDetail);
  const groups = {};
  for (const r of rows) {
    if (isDetail(r)) continue;
    const g = r.rule === 'T6' ? `licence class ${r.licence}` : r.rule === 'T7' ? 'other area (bounding box or title)' : r.rule === 'T10' ? 'coarser than a borough' : r.rule === 'T7b' ? 'the service probe found no feature in the zone (dgu/probe.json)' : r.reason;
    const k = `${r.state} | ${r.rule} | ${g}`; (groups[k] ||= []).push(r.name);
  }
  meta.bulk_note = 'states not listed one by one: every dataset name is in exactly one by_state list, keyed "state | rule | reason"; the full CKAN record is in the raw cache (walk) and on https://www.data.gov.uk/dataset/<name>';
  meta.dataset_page = 'https://www.data.gov.uk/dataset/<name>';
  const out = `{"meta":${JSON.stringify(meta, null, 1)},\n"datasets":[\n${detail.map(r => JSON.stringify((({ id, ...x }) => x)(r))).join(',\n')}\n],\n"by_state":{\n${Object.entries(groups).sort().map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v.sort())}`).join(',\n')}\n}}\n`;
  writeOut(join(OUT, 'dgu', 'triage.json'), out);
  console.log(counts, perScope, `${(out.length / 1e6).toFixed(2)} MB`);
  return rows;
}
// the committed catalogue: the compact CKAN record of every dataset triage left listed, harvested, held, deferred or sensitive
export async function catalogue() {
  const t = readOut(join(OUT, 'dgu', 'triage.json')), keep = new Set(t.datasets.map(r => r.name));
  const rows = [];
  for await (const l of readLines(ALL)) { if (!l) continue; const d = JSON.parse(l); const sc = scopeOf(d); if (!keep.has(d.name)) continue; const { notes_len, tags, zone_place, org_title, ...k } = d; k.resources = k.resources.slice(0, 5).map(r => ({ f: r.f || undefined, u: r.u.slice(0, 180) })); rows.push({ scope: sc, ...k }); }
  writeLines(join(OUT, 'dgu', 'catalogue.json'), { portal: 'data.gov.uk', api: API, walked: today, rule: 'the datasets listed one by one in triage.json (listed for harvest, harvested, held, deferred, sensitive, judged); the rest are name lists in triage.json by_state. CKAN fields kept: id, name, title, organisation, licence id, title and INSPIRE licence text, dates, bounding box, area words of the description (not the text), up to 5 resources (format, URL to 180 characters)', count: rows.length }, 'datasets', rows);
}

// ---- probe: the area from the data. For every listed dataset with a map service resource (EA spatialdata WFS,
// ArcGIS FeatureServer/MapServer, other WFS), count the features that meet the zone box. Out: dgu/probe.json.
const zoneBoxWfs = `${ZONE[1]},${ZONE[0]},${ZONE[3]},${ZONE[2]},urn:ogc:def:crs:EPSG::4326`;
async function wfsTypes(base) {
  const xml = (await politeFetch(`${base}${base.includes('?') ? '&' : '?'}service=WFS&request=GetCapabilities`, { timeout: 120000 })).toString('utf8');
  return [...xml.matchAll(/<(?:wfs:)?FeatureType[^>]*>[\s\S]*?<(?:wfs:)?Name>([^<]+)<\/(?:wfs:)?Name>/g)].map(m => m[1]);
}
async function wfsHits(base, type) {
  const xml = (await politeFetch(`${base}${base.includes('?') ? '&' : '?'}service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(type)}&resultType=hits&bbox=${zoneBoxWfs}`, { timeout: 180000 })).toString('utf8');
  const m = /numberMatched="(\d+|unknown)"/.exec(xml) || /numberOfFeatures="(\d+)"/.exec(xml); if (!m) throw new Error('no count in the WFS answer: ' + xml.slice(0, 120).replace(/\s+/g, ' '));
  return m[1] === 'unknown' ? null : +m[1];
}
async function arcCount(url) {
  const j = await getJson(`${url}/query?where=1%3D1&geometry=${ZONE.join(',')}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json`, { timeout: 120000 });
  if (j.error) throw new Error(j.error.message); return j.count;
}
export async function probe(keys) {
  const { readFileSync, existsSync: ex } = await import('fs');
  const t = readOut(join(OUT, 'dgu', 'triage.json'));
  const want = new Set(t.datasets.filter(d => d.state === 'listed-for-harvest' && (!keys.length || keys.includes(d.name))).map(d => d.name));
  const P = join(OUT, 'dgu', 'probe.json'); const old = ex(P) ? JSON.parse(readFileSync(P, 'utf8')).datasets : {};
  const out = { ...old }, capsCache = new Map(); let n = 0;
  for await (const l of readLines(ALL)) {
    if (!l) continue; const d = JSON.parse(l); if (!want.has(d.name) || (old[d.name] && !keys.length)) continue;
    const urls = d.resources.map(r => r.u); const rec = { probed: today, layers: [] };
    try {
      const ea = urls.map(u => /^https:\/\/environment\.data\.gov\.uk\/spatialdata\/([^/?]+)\/(wms|wfs)/i.exec(u)).find(Boolean);
      const arc = urls.find(u => /\/(FeatureServer|MapServer)(\/\d+)?\/?($|\?)/i.test(u));
      const wfs = urls.find(u => /service=wfs/i.test(u) && !/environment\.data\.gov\.uk/.test(u));
      if (ea) {
        const base = `https://environment.data.gov.uk/spatialdata/${ea[1]}/wfs`; rec.service = base;
        const types = capsCache.get(base) || await wfsTypes(base); capsCache.set(base, types);
        for (const ty of types.slice(0, 6)) { let z = null, e; try { z = await wfsHits(base, ty); } catch (x) { e = x.message.slice(0, 100); } rec.layers.push({ name: ty, zone: z, error: e }); }
      } else if (arc) {
        const base = arc.replace(/\?.*$/, '').replace(/\/$/, ''); rec.service = base;
        if (/\/\d+$/.test(base)) rec.layers.push({ name: base.split('/').pop(), zone: await arcCount(base) });
        else { const s = await getJson(`${base}?f=json`); for (const L of (s.layers || []).filter(x => !x.subLayerIds).slice(0, 10)) { let z = null, e; try { z = await arcCount(`${base}/${L.id}`); } catch (x) { e = x.message.slice(0, 100); } rec.layers.push({ name: L.name, zone: z, error: e }); } }
      } else if (wfs) {
        const base = wfs.replace(/([?&])(request|service|version|typename|typenames|outputformat)=[^&]*/gi, '$1').replace(/[?&]+$/, '').replace(/\?&+/, '?'); rec.service = base;
        const tn = /typenames?=([^&]+)/i.exec(wfs)?.[1]; const types = tn ? [decodeURIComponent(tn)] : (capsCache.get(base) || await wfsTypes(base)); capsCache.set(base, types);
        for (const ty of types.slice(0, 6)) { let z = null, e; try { z = await wfsHits(base, ty); } catch (x) { e = x.message.slice(0, 100); } rec.layers.push({ name: ty, zone: z, error: e }); }
      } else continue;
    } catch (e) { rec.error = e.message.slice(0, 160); }
    const zs = rec.layers.map(x => x.zone).filter(v => v != null); rec.zone = zs.length ? zs.reduce((a, b) => a + b, 0) : null;
    out[d.name] = rec; n++;
    if (n % 10 === 0) { writeFileSync(P, JSON.stringify({ meta: { probed: today, rule: 'zone = features that meet the zone box: WFS 2.0 GetFeature resultType=hits with the box (EPSG:4326), or ArcGIS returnCountOnly with the box envelope; up to 6 WFS types or 10 ArcGIS layers per dataset; EA through /spatialdata/ only (robots.txt disallows /geoservices)' }, datasets: out }, null, 0)); }
    process.stdout.write(`\r${n} probed ${d.name.slice(0, 40)} ${rec.zone}        `);
  }
  writeFileSync(P, `{"meta":${JSON.stringify({ probed: today, rule: 'zone = features that meet the zone box: WFS 2.0 GetFeature resultType=hits with the box (EPSG:4326), or ArcGIS returnCountOnly with the box envelope; up to 6 WFS types or 10 ArcGIS layers per dataset; EA through /spatialdata/ only (robots.txt disallows /geoservices)', count: Object.keys(out).length })},\n"datasets":{\n${Object.entries(out).sort().map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n')}\n}}\n`);
  console.log(`\n${n} probed`);
}

// ---- harvest: datasets the probe found in the zone, read from the same service with the box; polygons that cross
// the box edge are cut at the box (most of these national layers run far beyond it). Size caps below.
const CAP = { features: 6000, bytes: 1.5e6 };          // bytes on disk (gzipped over 1 MB)
function clipGeom(g) {
  if (/LineString/.test(g.type) && !wholeIn(g)) {        // keep the runs of vertices inside the box (plus one vertex either side)
    const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates, out = [];
    const inb = c => c[0] >= ZONE[0] && c[0] <= ZONE[2] && c[1] >= ZONE[1] && c[1] <= ZONE[3];
    for (const l of lines) { let run = []; l.forEach((c, i) => { const keep = inb(c) || (l[i - 1] && inb(l[i - 1])) || (l[i + 1] && inb(l[i + 1])); if (keep) run.push(c); else if (run.length) { if (run.length > 1) out.push(run); run = []; } }); if (run.length > 1) out.push(run); }
    return out.length ? [{ type: 'MultiLineString', coordinates: out }, true] : [null, true];
  }
  if (!/Polygon/.test(g.type) || wholeIn(g)) return [g, false];
  const B = { x0: ZONE[0], x1: ZONE[2], z0: ZONE[1], z1: ZONE[3] }, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const out = polys.map(pl => pl.map(r => clipRing(r.slice(0, -1), B)).filter(Boolean).map(r => [...r, r[0]])).filter(pl => pl.length);
  return out.length ? [roundGeom({ type: 'MultiPolygon', coordinates: out }), true] : [null, true];
}
export async function harvest(keys) {
  const { readFileSync, mkdirSync } = await import('fs');
  const P = JSON.parse(readFileSync(join(OUT, 'dgu', 'probe.json'), 'utf8')).datasets;
  const recs = new Map(); for await (const l of readLines(ALL)) { if (!l) continue; const d = JSON.parse(l); if (keys.includes(d.name)) recs.set(d.name, d); }
  for (const name of keys) {
    const p = P[name], d = recs.get(name); if (!p || !d || !p.zone) { console.log(`${name}: no zone features in the probe`); continue; }
    if (p.zone > CAP.features) { console.log(`${name}: ${p.zone} features, over the cap`); continue; }
    const feats = [], layersUsed = [];
    for (const L of p.layers.filter(x => x.zone)) {
      let j;
      if (/\/(FeatureServer|MapServer)/.test(p.service)) {
        const url = /\/\d+$/.test(p.service) ? p.service : `${p.service}/${(await getJson(`${p.service}?f=json`)).layers.find(x => x.name === L.name).id}`;
        for (let off = 0; ; off += 1000) { const k = await getJson(`${url}/query?where=1%3D1&geometry=${ZONE.join(',')}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=geojson&resultOffset=${off}&resultRecordCount=1000`); (j ||= { features: [] }).features.push(...(k.features || [])); if ((k.features || []).length < 1000) break; }
      } else {
        j = await getJson(`${p.service}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(L.name)}&outputFormat=${encodeURIComponent('application/json')}&srsName=${encodeURIComponent('urn:ogc:def:crs:EPSG::4326')}&bbox=${zoneBoxWfs}&count=${CAP.features}`, { timeout: 600000 });
      }
      for (const f of j.features || []) {
        if (!f.geometry) continue;
        let g = roundGeom(f.geometry), clipped = false;
        if (g.type === 'Point' && Math.abs(g.coordinates[0]) > 90) continue;           // not WGS84: the answer ignored srsName
        [g, clipped] = clipGeom(g); if (!g || !meets(g)) continue;
        const q = { layer: L.name }; for (const [a, v] of Object.entries(f.properties || {})) if (v !== '' && v != null && !DROP_FIELD.test(a) && !/^(shape_?(area|length|leng)|st_(area|length)|objectid|fid|globalid)/i.test(a)) q[a] = v;
        if (clipped) q.clipped_to_zone = true; q.in_cw = meets(g, CW_BOX);
        feats.push({ type: 'Feature', geometry: g, properties: q });
      }
      layersUsed.push({ name: L.name, zone_count: L.zone });
    }
    const lic = licenceClass(d.licence_id, `${d.licence_title || ''} ${d.licence_text || ''}`);
    const meta = { source: `data.gov.uk: ${d.title} (${d.org_title})`, dgu_dataset: d.name, page: `https://www.data.gov.uk/dataset/${d.id}/${d.name}`, api: p.service, layers: layersUsed, fetched: today,
      licence: lic === 'ogl' ? 'Open Government Licence v3.0' : lic, licence_evidence: `${d.licence_title || d.licence_id || ''} ${d.licence_text || ''}`.trim().slice(0, 300),
      attribution: `Contains public sector information licensed under the Open Government Licence v3.0 (${d.org_title})`, zone: ZONE_TEXT,
      method: `walk-portals.mjs dgu harvest ${name}: the service the probe counted, read with the zone box (WFS 2.0 GetFeature in EPSG:4326, or ArcGIS query with the envelope); polygons that cross the box edge are cut at the box, lines keep only their runs of vertices inside it plus one either side (clipped_to_zone: for display, not for area or length sums); coordinates rounded to 6 decimals; empty fields, shape measures and fields matching ${DROP_FIELD} left out`,
      counts: { features: feats.length, probe_zone_count: p.zone, clipped: feats.filter(f => f.properties.clipped_to_zone).length } };
    const key = name;
    const file = join(OUT, 'dgu', key, `${key}.geojson`); mkdirSync(join(OUT, 'dgu', key), { recursive: true });
    const n = writeGeojson(file, meta, feats);
    if (n > CAP.bytes) { (await import('fs')).rmSync(join(OUT, 'dgu', key), { recursive: true }); console.log(`${name}: ${(n / 1e6).toFixed(1)} MB, over the size cap: not kept`); continue; }
    console.log(`${name}: ${feats.length} features, ${(n / 1e3).toFixed(0)} kB`);
  }
}
