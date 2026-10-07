#!/usr/bin/env node
// KML and KMZ resources for the Docklands zone: a catalogue of candidates (feeds/kml/catalogue.json), each one fetched
// and read with the page's own reader (docklands/kml.js), and zone-clipped KML copies of open layers that cannot be
// opened by URL (no CORS, no KML, or too big) in the londat checkout (cwplans/feeds/kml/<id>.kml).
//   NODE_USE_ENV_PROXY=1 KML_DOM_DIR=<dir with node_modules/@xmldom/xmldom and linkedom> node magpie/cwplans/tools/find-kml.mjs probe
//   NODE_USE_ENV_PROXY=1 KML_DOM_DIR=... node magpie/cwplans/tools/find-kml.mjs copy      # write the londat copies, then probe them
//   node magpie/cwplans/tools/find-kml.mjs all                                            # copy, then probe everything
// (npm i --prefix <dir> @xmldom/xmldom linkedom: kml.js needs a DOMParser; XML through xmldom, description HTML through linkedom.)
// Network: one request at a time, >= 1.1 s apart, robots.txt read per host (walk-portals.mjs allowed()), the project User-Agent.
// The candidates, their licence classes, the rules and what was blocked: skills/cwplans-open-portals/SKILL.md, "KML sources".
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { gunzipSync } from 'zlib';
import { createRequire } from 'module';
import { UA } from './lib.mjs';
import { LONDAT_CW } from './londat.mjs';
import { allowed, meets, ZONE, CW, today } from './walk-portals.mjs';

const OUTDIR = join(CW, 'feeds', 'kml'), COPYDIR = join(LONDAT_CW, 'feeds', 'kml');
const RAW_BASE = 'https://raw.githubusercontent.com/danbri/londat/main/cwplans/feeds/kml/';
const PAGE = 'https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/?kml=';
// the zone of the brief: the model box plus the Royal Docks and the Thames Barrier (the 3D page cuts at the model box)
const ZONE_WIDE = [-0.095, 51.47, 0.08, 51.53];
const ORIGIN = 'https://danbri.github.io';
const OGL3 = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';

// ---------------------------------------------------------------- a DOMParser for kml.js in Node
const req = createRequire(process.env.KML_DOM_DIR ? resolve(process.env.KML_DOM_DIR, 'x.js') : import.meta.url);
let K = null;
async function kml() {
  if (K) return K;
  const { DOMParser: XD } = req('@xmldom/xmldom'), { DOMParser: LD } = req('linkedom');
  globalThis.DOMParser = class { parseFromString(s, t) {
    if (t === 'text/html') return new LD().parseFromString(s, 'text/html');
    let err = null; const d = new XD({ onError: (lvl, m) => { if (lvl !== 'warning' && !err) err = m; } }).parseFromString(s, t);
    if (err) throw new Error('not well-formed XML: ' + String(err).slice(0, 160)); return d; } };
  K = await import(join(CW, 'docklands', 'kml.js'));
  return K;
}

// ---------------------------------------------------------------- polite fetch that keeps the headers (CORS)
let last = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchKeep(url, { maxBytes = 60e6 } = {}) {
  if (!(await allowed(url))) return { status: 'robots' };
  const wait = last + 1100 - Date.now(); if (wait > 0) await sleep(wait); last = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Origin: ORIGIN }, redirect: 'follow', signal: AbortSignal.timeout(180000) });
    const chunks = []; let n = 0; const rd = r.body.getReader(); let cut = false;
    for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); n += value.length; if (n > maxBytes) { cut = true; await rd.cancel(); break; } }
    last = Date.now();
    return { status: r.status, final: r.url !== url ? r.url : undefined, type: (r.headers.get('content-type') || '').split(';')[0], cors: r.headers.get('access-control-allow-origin'), bytes: n, cut, body: Buffer.concat(chunks) };
  } catch (e) { return { status: 'network: ' + String(e.message).slice(0, 80) }; }
}

// ---------------------------------------------------------------- the candidates
// kind: native (a KML/KMZ file published by its owner), copy (a layer we write as a zone-clipped KML in londat),
// listed (looked at; not fetched or not usable: the reason says why). class: licenceClass words of walk-portals.mjs.
const N = (o) => ({ kind: 'native', ...o });
const CANDIDATES = [
  N({ id: 'lds-schools-2016', title: 'London Schools Atlas: all schools (2016)', publisher: 'Greater London Authority (London Datastore)', page: 'https://data.london.gov.uk/dataset/london-schools-atlas-29j4y',
    url: 'https://data.london.gov.uk/download/29j4y/17d3df74-9338-43ed-813b-989d57689f88/all_schools_2016.kmz', format: 'kmz', licence: 'Open Government Licence v2', class: 'ogl', note: 'school points of 2016 (3,889 in London); placemark names are place names (e.g. "Millwall"), not school names; old: use GIAS for current schools' }),
  N({ id: 'lds-wards-2016', title: 'London wards (KML from the GLA "Create your own mapping templates" add-in)', publisher: 'Greater London Authority (London Datastore)', page: 'https://data.london.gov.uk/dataset/create-your-own-mapping-templates-excel-add-in-2jx1l',
    url: 'https://data.london.gov.uk/download/2jx1l/495e0c34-5da1-4647-baac-c9cb974df3aa/ward-map-kml.kml', format: 'kml', licence: 'Open Government Licence v2', class: 'ogl', note: '2014 ward boundaries, all London, 6.7 MB; a zone copy is in londat (lds-wards-2016-zone)' }),
  N({ id: 'lds-bids-2024', title: 'London Plan: Business Improvement Districts (KML zip, 2024-10-14)', publisher: 'Greater London Authority (London Datastore)', page: 'https://data.london.gov.uk/dataset/london-plan-business-improvement-districts-vqmx7',
    url: 'https://data.london.gov.uk/download/vqmx7/e521c1ed-9787-42da-b229-faff6d4b65e5/business_improvement_districts_kml.zip', format: 'zip (one .kml; read as KMZ)', licence: 'Creative Commons Attribution', class: 'cc-by', note: 'placemark names are generic (kml_3); the BID name is in ExtendedData' }),
  N({ id: 'lds-canopy-boroughs', title: 'Curio Canopy: tree canopy cover by borough', publisher: 'Greater London Authority / Curio (London Datastore)', page: 'https://data.london.gov.uk/dataset/curio-canopy-london-tree-canopy-cover-2koz8',
    url: 'https://data.london.gov.uk/download/2koz8/6c9b249b-9d02-42a7-bae9-67617fa4317c/gla-boroughs-canopy-cover.kml', format: 'kml', licence: 'Creative Commons Attribution Share-Alike', class: 'share-alike', note: 'share-alike: not copied, not in the examples (CLAUDE.md: OSM is the only share-alike exception)' }),
  N({ id: 'lds-canopy-wards', title: 'Curio Canopy: tree canopy cover by ward', publisher: 'Greater London Authority / Curio (London Datastore)', page: 'https://data.london.gov.uk/dataset/curio-canopy-london-tree-canopy-cover-2koz8',
    url: 'https://data.london.gov.uk/download/2koz8/30e728fc-d736-45d7-9853-5e1ac2ff4a3e/gla-wards-canopy-cover.kml', format: 'kml', licence: 'Creative Commons Attribution Share-Alike', class: 'share-alike', note: 'share-alike: not copied; the hexagon-grid file (28.7 MB) and the LSOA zip (22 MB) of the same set were not fetched' }),
  N({ id: 'bgs-625k', title: 'BGS Geology 625k (DiGMapGB-625) for Google Earth', publisher: 'British Geological Survey', page: 'https://www.data.gov.uk/dataset/bgs-geology-625k-digmapgb-625-2008',
    url: 'https://ogc.bgs.ac.uk/dppp/kml/digmap625.kml', format: 'kml (NetworkLinks to WMS overlays)', licence: 'not stated on the data.gov.uk record (BGS 625k data is offered under OGL on the BGS site)', class: 'none', note: 'robots.txt of ogc.bgs.ac.uk disallows all agents but Spatineo, so the tool does not fetch it. One manual fetch on 2026-10-05, before the robots.txt check, showed NetworkLinks (WMS overlays) and a ScreenOverlay only: the page would list the links and draw nothing' }),
  N({ id: 'bgs-sobi', title: 'BGS Single Onshore Borehole Index for Google Earth', publisher: 'British Geological Survey', page: 'https://www.data.gov.uk/dataset/single-onshore-borehole-index',
    url: 'https://ogc.bgs.ac.uk/dppp/kml/sobi.kml', format: 'kml (NetworkLink)', licence: 'not stated on the data.gov.uk record', class: 'none', note: 'robots.txt disallows (see bgs-625k); the same manual fetch showed one NetworkLink only: nothing to draw' }),
  N({ id: 'lambeth-river-bus-stops', title: 'London river bus stops (Lambeth open mapping data, ArcGIS Hub)', publisher: 'London Borough of Lambeth', page: 'https://www.data.gov.uk/dataset/london-river-bus-stops',
    url: 'http://lambethopenmappingdata-lambethcouncil.opendata.arcgis.com/datasets/b9eeb8aa5d8949108d406b557bced486_1.kml', format: 'kml (ArcGIS Hub export)', licence: 'none on the data.gov.uk record', class: 'none', note: 'old Hub export URL from data.gov.uk answers 400 (retired Hub URL form); no licence: metadata only' }),

  // zone-clipped KML copies of open layers (written by `copy`, hosted in danbri/londat)
  { kind: 'copy', id: 'tfl-cycle-routes', title: 'TfL Cycle Routes (Cycleways, Quietways, Superhighways) in the zone', publisher: 'Transport for London (GIS Open Data Hub)', page: 'https://gis-tfl.opendata.arcgis.com/datasets/cycle-routes',
    src: { arcgis: 'https://services1.arcgis.com/YswvgzOodUvqkoCN/arcgis/rest/services/Cycle_Routes/FeatureServer/11' }, name: p => [p.Label, p.Route_Name].filter(Boolean).join(' '), keep: ['Label', 'Route_Name', 'Status', 'Programme'],
    licence: 'Open Government Licence (item licence: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)', class: 'ogl', attribution: 'Contains Transport for London data licensed under the Open Government Licence v3.0. Powered by TfL Open Data.', style: { line: [0.1, 0.45, 1, 1], width: 3 }, register: 'kml-tfl-gis-hub' },
  { kind: 'copy', id: 'tfl-river-piers', title: 'TfL River Piers in the zone', publisher: 'Transport for London (GIS Open Data Hub)', page: 'https://gis-tfl.opendata.arcgis.com/',
    src: { arcgis: 'https://services1.arcgis.com/YswvgzOodUvqkoCN/arcgis/rest/services/River_Piers/FeatureServer/34' }, name: p => p.NAME, keep: ['NAME', 'STATUS'],
    licence: 'Open Government Licence (item licence)', class: 'ogl', attribution: 'Contains Transport for London data licensed under the Open Government Licence v3.0. Powered by TfL Open Data.', style: { icon: [0, 0.6, 0.9, 1], scale: 1.2 }, register: 'kml-tfl-gis-hub' },
  { kind: 'copy', id: 'tfl-river-services', title: 'TfL River Services (with stops) in the zone', publisher: 'Transport for London (GIS Open Data Hub)', page: 'https://gis-tfl.opendata.arcgis.com/',
    src: { arcgis: 'https://services1.arcgis.com/YswvgzOodUvqkoCN/arcgis/rest/services/River_Services__with_stops_/FeatureServer/36' }, name: p => p.SERVICE, keep: ['SERVICE', 'OPERATOR', 'SERVICE_TY', 'FREQUENCY', 'STATUS'],
    licence: 'Open Government Licence (item licence)', class: 'ogl', attribution: 'Contains Transport for London data licensed under the Open Government Licence v3.0. Powered by TfL Open Data.', style: { line: [0, 0.75, 0.85, 1], width: 3 }, register: 'kml-tfl-gis-hub' },
  { kind: 'copy', id: 'sustrans-ncn', title: 'National Cycle Network (Walk Wheel Cycle Trust, formerly Sustrans) in the zone', publisher: 'Walk Wheel Cycle Trust (Sustrans)', page: 'https://data-sustrans-uk.opendata.arcgis.com/datasets/Sustrans-UK::national-cycle-network-public-1/about',
    src: { arcgis: 'https://services5.arcgis.com/1ZHcUS1lwPTg4ms0/arcgis/rest/services/National_Cycle_Network_Public/FeatureServer/0' }, name: p => `${p.RouteType || 'NCN'} ${p.RouteNo ?? ''}`.trim(), keep: ['RouteType', 'RouteNo', 'RouteCat', 'OpenStatus', 'Desc_', 'Surface', 'Lighting', 'Greenway'],
    licence: 'Open Government Licence v3.0 (item licence); access information: contains Ordnance Survey data (Crown copyright and database rights 2018) and OpenStreetMap contributions', class: 'ogl', odbl: true,
    attribution: 'Walk Wheel Cycle Trust (formerly Sustrans) National Cycle Network data, Open Government Licence v3.0. Contains OS data © Crown copyright and database rights 2018. Contains © OpenStreetMap contributors (ODbL, https://www.openstreetmap.org/copyright).', style: { line: [0.85, 0.1, 0.1, 1], width: 3 }, register: 'kml-sustrans-ncn' },
  { kind: 'copy', id: 'crt-locks', title: 'Canal & River Trust locks in the zone', publisher: 'Canal & River Trust', page: 'https://data-canalrivertrust.opendata.arcgis.com/',
    src: { arcgis: 'https://services.arcgis.com/DknzyjEEie5tEW0u/arcgis/rest/services/Canal_And_River_Trust_Locks_View/FeatureServer/0' }, name: p => p.sap_description, keep: ['sap_description', 'waterway_name', 'sap_func_loc'],
    licence: 'Open Government Licence (item licence of Canal_And_River_Trust_Locks_View)', class: 'ogl', attribution: 'Contains Canal & River Trust data licensed under the Open Government Licence v3.0.', style: { icon: [0.1, 0.3, 0.8, 1], scale: 1 }, register: 'kml-crt-locks' },
  { kind: 'copy', id: 'ne-thames-path', title: 'Thames Path National Trail in the model box', publisher: 'Natural England (National Trails (England), via data.gov.uk)', page: 'https://www.data.gov.uk/dataset/ac8c851c-99a0-4488-8973-6c8863529c45/national-trails-england3',
    src: { harvest: 'feeds/portals/dgu/national-trails-england3/national-trails-england3.geojson' }, name: p => p.name, keep: ['name', 'start', 'End', 'length_km', 'opened'],
    licence: 'Open Government Licence v3.0', class: 'ogl', attribution: 'Contains public sector information licensed under the Open Government Licence v3.0 (Natural England).', style: { line: [0.2, 0.7, 0.2, 1], width: 3 }, register: 'op-dgu-national-trails-england3' },
  { kind: 'copy', id: 'he-listed-buildings', title: 'Listed buildings in the model box (Historic England, via planning.data.gov.uk)', publisher: 'Historic England / MHCLG planning.data.gov.uk', page: 'https://www.planning.data.gov.uk/dataset/listed-building',
    src: { harvest: 'feeds/portals/pdg/listed-building/listed-building.geojson' }, name: p => p.name, keep: ['reference', 'listed-building-grade', 'start-date', 'documentation-url'],
    licence: 'Open Government Licence v3.0', class: 'ogl', attribution: '© Historic England 2026. Contains Ordnance Survey data © Crown copyright and database right 2026. Open Government Licence v3.0 (via planning.data.gov.uk).', style: { icon: [0.6, 0.35, 0.1, 1], scale: 0.7 }, register: 'op-pdg-listed-building' },
  { kind: 'copy', id: 'he-world-heritage', title: 'World Heritage Sites and buffer zone in the model box (Tower of London, Maritime Greenwich)', publisher: 'Historic England / MHCLG planning.data.gov.uk', page: 'https://www.planning.data.gov.uk/dataset/world-heritage-site',
    src: { harvest: ['feeds/portals/pdg/world-heritage-site/world-heritage-site.geojson', 'feeds/portals/pdg/world-heritage-site-buffer-zone/world-heritage-site-buffer-zone.geojson'] }, name: p => [p.name, p.notes].filter(Boolean).join(': '), keep: ['reference', 'notes', 'documentation-url'],
    licence: 'Open Government Licence v3.0', class: 'ogl', attribution: '© Historic England 2026. Contains Ordnance Survey data © Crown copyright and database right 2026. Open Government Licence v3.0 (via planning.data.gov.uk).', style: { line: [0.9, 0.7, 0.1, 1], width: 3, poly: [0.9, 0.7, 0.1, 0.25] }, register: ['op-pdg-world-heritage-site', 'op-pdg-world-heritage-site-buffer-zone'] },
  { kind: 'copy', id: 'he-heritage-at-risk', title: 'Heritage at Risk in the model box', publisher: 'Historic England / MHCLG planning.data.gov.uk', page: 'https://www.planning.data.gov.uk/dataset/heritage-at-risk',
    src: { harvest: 'feeds/portals/pdg/heritage-at-risk/heritage-at-risk.geojson' }, name: p => p.name, keep: ['reference', 'entry-date', 'documentation-url'],
    licence: 'Open Government Licence v3.0', class: 'ogl', attribution: '© Historic England 2026. Contains Ordnance Survey data © Crown copyright and database right 2026. Open Government Licence v3.0 (via planning.data.gov.uk).', style: { line: [0.9, 0.2, 0.1, 1], width: 2, poly: [0.9, 0.2, 0.1, 0.3] }, register: 'op-pdg-heritage-at-risk' },
  { kind: 'copy', id: 'he-parks-gardens', title: 'Registered parks and gardens in the model box', publisher: 'Historic England / MHCLG planning.data.gov.uk', page: 'https://www.planning.data.gov.uk/dataset/park-and-garden',
    src: { harvest: 'feeds/portals/pdg/park-and-garden/park-and-garden.geojson' }, name: p => p.name, keep: ['reference', 'park-and-garden-grade', 'documentation-url'],
    licence: 'Open Government Licence v3.0', class: 'ogl', attribution: '© Historic England 2026. Contains Ordnance Survey data © Crown copyright and database right 2026. Open Government Licence v3.0 (via planning.data.gov.uk).', style: { line: [0.1, 0.6, 0.2, 1], width: 2, poly: [0.1, 0.6, 0.2, 0.3] }, register: 'op-pdg-park-and-garden' },
  { kind: 'copy', id: 'gla-conservation-areas', title: 'Conservation areas in the model box (GLA Planning Constraints Map)', publisher: 'Greater London Authority (London Datastore)', page: 'https://data.london.gov.uk/dataset/conservation-areas-emqwg',
    src: { harvest: 'feeds/london-datastore/conservation-areas/conservation-areas.geojson' }, name: p => p.sitename, keep: ['borough', 'planningauthority', 'hectares', 'layerreference'],
    licence: 'Open Government Licence v3', class: 'ogl', attribution: 'Contains public sector information licensed under the Open Government Licence v3 (Planning Constraints Map). The GLA cannot warrant the quality or accuracy of the data.', style: { line: [0.6, 0.2, 0.7, 1], width: 2, poly: [0.6, 0.2, 0.7, 0.2] }, register: 'lds-emqwg' },
  { kind: 'copy', id: 'lds-wards-2016-zone', title: 'London wards 2014 (GLA ward KML) in the zone', publisher: 'Greater London Authority (London Datastore)', page: 'https://data.london.gov.uk/dataset/create-your-own-mapping-templates-excel-add-in-2jx1l',
    src: { kml: 'https://data.london.gov.uk/download/2jx1l/495e0c34-5da1-4647-baac-c9cb974df3aa/ward-map-kml.kml' }, licence: 'Open Government Licence v2', class: 'ogl',
    attribution: 'Contains public sector information licensed under the Open Government Licence v2.0 (Greater London Authority). The GLA cannot warrant the quality or accuracy of the data.', register: 'lds-2jx1l' },
];
// looked at, not usable or not fetched (the reason is the finding)
const L = (id, title, publisher, url, licence, cls, state, reason) => ({ kind: 'listed', id, title, publisher, url, licence, licence_class: cls, state, reason });
const LISTED = [
  L('pdg-entity', 'planning.data.gov.uk entities', 'MHCLG', 'https://www.planning.data.gov.uk/entity.kml?dataset=conservation-area', 'Open Government Licence v3.0', 'ogl', 'not-kml', 'no KML: entity.kml answers 404; the API gives JSON, GeoJSON and CSV (the open layers we hold are copied above as KML)'),
  L('arcgis-hub-download', 'ArcGIS Hub KML downloads (TfL, ONS, Sustrans, CRT, Historic England, Tower Hamlets hubs)', 'Esri ArcGIS Hub', 'https://hub.arcgis.com/api/download/v1/items/<item>/kml?layers=<n>', 'per item', 'per item', 'unreliable', 'generated on request: the first call answers 202 "being generated"; a 3-polygon Tower Hamlets item stayed "PagingData" for over 15 minutes, TfL items answered 404 "Layer does not exist". A ?kml= link would open a JSON message. Hosted feature layers answer only JSON, GeoJSON and PBF to query (no f=kmz). So open layers are copied as KML instead'),
  L('arcgis-server-kmz', 'ArcGIS Server map services (City of London INSPIRE, GLA, PLA)', 'City of London, GLA, PLA', 'https://www.mapping.cityoflondon.gov.uk/arcgis/rest/services/INSPIRE/MapServer', 'OGL (City of London); PLA not open', 'per service', 'not-kml', 'supportedQueryFormats is JSON, geoJSON only: no f=kmz'),
  L('ons-hub-kml', 'ONS Open Geography Portal boundaries (2,367 data.gov.uk records with a KML resource)', 'Office for National Statistics', 'https://geoportal.statistics.gov.uk/', 'Open Government Licence v3.0 (ONS terms)', 'ogl', 'unreliable', 'KML resources are ArcGIS Hub downloads (see arcgis-hub-download); the zone boundaries we need are held as GeoJSON (feeds/portals/onsgeo)'),
  L('dgu-kml', 'data.gov.uk: all datasets with a KML or KMZ resource', 'data.gov.uk', 'https://www.data.gov.uk/', 'per dataset', 'per dataset', 'walked', '4,499 of the 59,451 datasets have a KML/KMZ resource (raw walk of 2026-10-04): 2,367 ONS, 1,002 Northern Ireland, 237 NSTA; the only London ones are the GLA (above), Lambeth (no licence), BGS (NetworkLinks), DfT TEMPRO zones and NHS CCG boundaries (national, old)'),
  L('open-plaques', 'Open Plaques', 'Open Plaques', 'https://openplaques.org/', 'not checked', 'none', 'blocked', 'robots.txt: "User-agent: * Disallow: /"; not fetched'),
  L('wikimapia', 'Wikimapia', 'Wikimapia', 'https://wikimapia.org/', 'CC BY-SA 3.0', 'share-alike', 'share-alike', 'share-alike: not allowed without the owner\'s agreement (CLAUDE.md); not fetched'),
  L('wikipedia-attached-kml', 'Wikipedia "Attached KML" templates (e.g. Template:Attached KML/Docklands Light Railway)', 'Wikipedia editors', 'https://en.wikipedia.org/wiki/Template:Attached_KML/Docklands_Light_Railway', 'CC BY-SA 4.0 (Wikipedia text)', 'share-alike', 'share-alike', 'share-alike, often traced from OSM: listed only, not copied'),
  L('commons-data-map', 'Wikimedia Commons Data: .map pages', 'Wikimedia Commons', 'https://commons.wikimedia.org/wiki/Data:', 'per page (CC0 or others)', 'per page', 'not-kml', 'GeoJSON, not KML'),
  L('google-my-maps', 'Google My Maps (local history, walks)', 'various', 'https://www.google.com/maps/d/', 'Google terms; each map\'s author holds rights', 'restricted', 'restricted', 'not open data: list only'),
  L('umap', 'uMap maps (umap.openstreetmap.fr)', 'uMap users', 'https://umap.openstreetmap.fr/', 'per map; OSM-based (ODbL) by default', 'share-alike', 'not-fetched', 'KML export is made in the browser; licence per map; OSM layers we need are already derived from our own extract'),
  L('national-trails-site', 'National Trails website GPX (Thames Path)', 'National Trails', 'https://www.nationaltrail.co.uk/en_GB/trails/thames-path/', 'not stated for the files', 'none', 'not-kml', 'GPX, not KML, terms not stated; the Natural England layer (OGL) is copied above as ne-thames-path'),
  L('swc-walks', 'Saturday Walkers Club GPX & KML (Thames Path, Jubilee Walk)', 'Saturday Walkers Club', 'https://www.walkingclub.org.uk/long-distance-path/thames-path/download-GPX-KML.html', 'free for non-commercial use only', 'restricted', 'restricted', 'non-commercial: not copied'),
  L('walkingenglishman', 'Walking Englishman Jubilee Greenway KMZ', 'walkingenglishman.com', 'https://www.walkingenglishman.com/ldp/jubileegreenway.html', 'not stated', 'none', 'not-fetched', 'no licence: metadata only'),
  L('os-opendata', 'OS OpenData products', 'Ordnance Survey', 'https://osdatahub.os.uk/downloads/open', 'Open Government Licence v3.0', 'ogl', 'not-kml', 'no KML format (GeoPackage, shapefile, GML, vector tiles)'),
  L('geonames', 'GeoNames', 'GeoNames', 'https://www.geonames.org/', 'CC BY 4.0', 'cc-by', 'not-kml', 'no KML export from the web services (XML, JSON, RDF, dumps)'),
  L('ea-flood', 'Environment Agency flood maps', 'Environment Agency', 'https://environment.data.gov.uk/', 'Open Government Licence v3.0', 'ogl', 'not-kml', 'WMS/WFS/GeoJSON, no KML; the flood layers are held as GeoJSON (feeds/portals/dgu)'),
  L('pla-arcgis', 'Port of London Authority ArcGIS services', 'PLA', 'https://maps.pla.co.uk/server/rest/services', 'PLA terms (facts only)', 'restricted', 'restricted', 'not open: facts only (cwplans-river-and-water)'),
  L('tfl-stations', 'TfL stations (GIS Open Data Hub)', 'Transport for London', 'https://services1.arcgis.com/YswvgzOodUvqkoCN/arcgis/rest/services/TfL_stations/FeatureServer', 'none on the item', 'none', 'not-copied', 'the item has no licence text: metadata only'),
  L('th-canary-wharf-area', 'Tower Hamlets: Canary Wharf Area', 'London Borough of Tower Hamlets', 'https://services1.arcgis.com/KZuCGRSe2K5BiG1Z/arcgis/rest/services/Canary_Wharf_Area/FeatureServer', 'none on the item', 'none', 'not-copied', 'the item has no licence text: metadata only'),
];

// ---------------------------------------------------------------- geometry helpers (GeoJSON, WGS84)
const inB = ([x, y], B) => x >= B[0] && x <= B[2] && y >= B[1] && y <= B[3];
// a line cut to the box: runs of vertices inside, with one vertex beyond each end so the line reaches the edge
function clipLine(c, B) {
  const out = []; let run = [];
  for (let i = 0; i < c.length; i++) {
    const inside = inB(c[i], B) || (i > 0 && inB(c[i - 1], B)) || (i + 1 < c.length && inB(c[i + 1], B));
    if (inside) run.push(c[i]); else if (run.length) { if (run.length > 1) out.push(run); run = []; }
  }
  if (run.length > 1) out.push(run);
  return out;
}
function toPlacemarkGeoms(g, B) {
  if (!g) return [];
  switch (g.type) {
    case 'Point': return inB(g.coordinates, B) ? [{ type: 'Point', coords: g.coordinates }] : [];
    case 'MultiPoint': return g.coordinates.filter(c => inB(c, B)).map(c => ({ type: 'Point', coords: c }));
    case 'LineString': return clipLine(g.coordinates, B).map(c => ({ type: 'LineString', coords: c }));
    case 'MultiLineString': return g.coordinates.flatMap(l => clipLine(l, B)).map(c => ({ type: 'LineString', coords: c }));
    case 'Polygon': return meets(g, B) ? [{ type: 'Polygon', rings: g.coordinates }] : [];
    case 'MultiPolygon': return g.coordinates.filter(p => meets({ type: 'Polygon', coordinates: p }, B)).map(p => ({ type: 'Polygon', rings: p }));
    case 'GeometryCollection': return g.geometries.flatMap(x => toPlacemarkGeoms(x, B));
  }
  return [];
}
const r7 = g => JSON.parse(JSON.stringify(g, (k, v) => typeof v === 'number' && k === '' ? v : Array.isArray(v) && typeof v[0] === 'number' ? v.map(n => Math.round(n * 1e7) / 1e7) : v));

// ---------------------------------------------------------------- copy: zone-clipped KML in londat
async function features(c) {
  if (c.src.arcgis) {
    const q = `${c.src.arcgis}/query?where=1%3D1&geometry=${ZONE_WIDE.join(',')}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=geojson&resultRecordCount=4000`;
    const r = await fetchKeep(q); if (r.status !== 200) throw new Error(`${c.id}: ${r.status}`);
    const fc = JSON.parse(r.body.toString('utf8')); if (fc.properties?.exceededTransferLimit) throw new Error(`${c.id}: more than one page`);
    return { box: ZONE_WIDE, feats: fc.features, api: q };
  }
  if (c.src.harvest) {
    const feats = [];
    for (const rel of [].concat(c.src.harvest)) { const f = join(LONDAT_CW, rel); const t = existsSync(f) ? readFileSync(f, 'utf8') : gunzipSync(readFileSync(f + '.gz')).toString('utf8'); feats.push(...JSON.parse(t).features); }
    return { box: ZONE, feats, api: 'the project harvest in danbri/londat: cwplans/' + [].concat(c.src.harvest).join(', cwplans/') };
  }
  if (c.src.kml) {
    const r = await fetchKeep(c.src.kml); if (r.status !== 200) throw new Error(`${c.id}: ${r.status}`);
    const k = await kml(), d = await k.readKml(r.body, c.id);
    return { box: ZONE_WIDE, feats: k.toGeoJSON(d).features.map(f => ({ ...f, properties: { name: f.properties.name, ...Object.fromEntries(f.properties.extended) } })), api: c.src.kml, nameFromProps: true };
  }
}
async function copy(only) {
  const k = await kml(); mkdirSync(COPYDIR, { recursive: true });
  for (const c of CANDIDATES.filter(c => c.kind === 'copy' && (!only.length || only.includes(c.id)))) {
    const { box, feats, api, nameFromProps } = await features(c);
    const nameOf = nameFromProps ? p => p.name : c.name;
    const placemarks = [];
    for (const f of feats) {
      const geoms = toPlacemarkGeoms(r7(f.geometry), box); if (!geoms.length) continue;
      const p = f.properties || {};
      placemarks.push({ name: String(nameOf(p) ?? ''), extended: (c.keep || Object.keys(p).filter(x => x !== 'name')).filter(x => p[x] != null && p[x] !== '').map(x => [x, p[x]]), styleUrl: c.style ? '#layer' : '', geoms });
    }
    const description = `${c.title}. Source: ${c.publisher}, ${c.page}. Licence: ${c.licence}. Attribution: ${c.attribution}`
      + `${c.odbl ? ' This file contains OpenStreetMap-derived data under the ODbL.' : ''} Fetched ${today} from ${api}; clipped to WGS84 ${box.join(', ')} (features that meet the box; lines cut at the edge) by magpie/cwplans/tools/find-kml.mjs for https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/ .`;
    const text = k.writeKml({ name: c.title, description, styles: c.style ? { layer: c.style } : {}, placemarks });
    writeFileSync(join(COPYDIR, `${c.id}.kml`), text);
    c.copied = { features: placemarks.length, bytes: Buffer.byteLength(text), box, fetched: today };
    console.log(`copy ${c.id}: ${placemarks.length} placemarks, ${Buffer.byteLength(text)} bytes`);
  }
}

// ---------------------------------------------------------------- probe: fetch every native file and every copy as the page would
async function probeOne(url) {
  const r = await fetchKeep(url);
  const out = { status: r.status, https: url.startsWith('https:'), cors: r.cors || null, content_type: r.type, bytes: r.bytes, final_url: r.final };
  if (r.status !== 200) return out;
  if (r.cut) { out.parser = { error: 'over 60 MB: not read' }; return out; }
  try {
    const k = await kml(), d = await k.readKml(r.body, url.split('/').pop());
    const gj = k.toGeoJSON(d); let box = 0, wide = 0;
    for (const f of gj.features) { if (meets(f.geometry, ZONE)) box++; if (meets(f.geometry, ZONE_WIDE)) wide++; }
    const types = {}; for (const f of d.features) for (const g of f.geoms) types[g.type] = (types[g.type] || 0) + 1;
    out.parser = { ok: true, document: d.name, placemarks: d.features.length, in_model_box: box, in_zone: wide, hidden: d.hidden, folders: d.folders.n, geometries: types, unsupported: d.skipped, network_links: d.networkLinks.length, kmz: d.kmz || undefined };
  } catch (e) { out.parser = { ok: false, error: String(e.message).slice(0, 200) }; }
  return out;
}
const corsOk = p => p.status === 200 && p.https && (p.cors === '*' || p.cors === ORIGIN);
async function probe() {
  const prev = existsSync(join(OUTDIR, 'catalogue.json')) ? JSON.parse(readFileSync(join(OUTDIR, 'catalogue.json'), 'utf8')) : null;
  const rows = [];
  for (const c of CANDIDATES) {
    const url = c.kind === 'copy' ? RAW_BASE + c.id + '.kml' : c.url;
    if (c.kind === 'copy' && !existsSync(join(COPYDIR, c.id + '.kml'))) { console.warn(`${c.id}: no copy in ${COPYDIR}; run copy first`); continue; }
    const p = await probeOne(url);
    // a copy not yet pushed to londat: read the local file so the counts are still the file's
    if (c.kind === 'copy' && p.status !== 200) { const k = await kml(), d = await k.readKml(readFileSync(join(COPYDIR, c.id + '.kml')), c.id); p.parser = { ok: true, local: true, placemarks: d.features.length, in_model_box: k.toGeoJSON(d).features.filter(f => meets(f.geometry, ZONE)).length, in_zone: d.features.length }; }
    const open = ['ogl', 'cc-by', 'odc-by', 'public-domain'].includes(c.class);
    const row = { id: c.id, kind: c.kind, title: c.title, publisher: c.publisher, page: c.page, url, format: c.format || 'kml', licence: c.licence, licence_class: c.class, odbl: c.odbl || undefined,
      hosted: c.kind === 'copy' ? 'londat' : undefined, source_api: c.kind === 'copy' ? (c.src.arcgis || c.src.kml || [].concat(c.src.harvest).map(h => 'londat cwplans/' + h).join(', ')) : undefined,
      attribution: c.attribution, note: c.note, cors: corsOk(p) ? 'yes' : p.status === 200 ? 'no' : `unknown (${p.status})`, probe: p,
      zone_features: p.parser?.in_zone ?? null, model_box_features: p.parser?.in_model_box ?? null };
    row.open_link = p.parser?.ok && row.zone_features > 0 && (corsOk(p) || (c.kind === 'copy' && p.parser.local)) ? PAGE + encodeURIComponent(url) : null;
    row.example = Boolean(row.open_link && open);
    const was = prev?.resources.find(x => x.id === c.id); if (was?.page_test) row.page_test = was.page_test;   // kept from the last headless run (the skill has the recipe)
    rows.push(row);
    console.log(`${c.id}: ${p.status} cors=${row.cors} placemarks=${p.parser?.placemarks ?? '-'} zone=${row.zone_features ?? '-'} box=${row.model_box_features ?? '-'}`);
  }
  const all = [...rows, ...LISTED];
  const byClass = {}; for (const r of all) byClass[r.licence_class] = (byClass[r.licence_class] || 0) + 1;
  const meta = { about: 'KML and KMZ resources for the Docklands zone (magpie/cwplans), each fetched and read with docklands/kml.js; zone-clipped KML copies of open layers hosted in danbri/londat', tool: 'tools/find-kml.mjs',
    probed: today, origin_checked: ORIGIN, model_box: ZONE, zone: ZONE_WIDE, zone_text: 'zone = the model box plus the Royal Docks and the Thames Barrier, WGS84 ' + ZONE_WIDE.join(', ') + '; the 3D page draws only inside the model box',
    rules: ['cors yes = HTTP 200 over https with Access-Control-Allow-Origin * or the Pages origin: the ?kml= link works', 'open_link only for a file the page reader parsed with at least one placemark in the zone', 'example = open_link and an open licence class (ogl, cc-by, odc-by, public-domain); share-alike, restricted and no-licence files are never examples or copies (OSM-derived content inside an OGL layer is marked odbl)', 'copies: features that meet the box (polygons whole, lines cut at the edge), names and a few fields kept, the source licence and attribution in the Document description'],
    counts: { entries: all.length, by_kind: Object.fromEntries(['native', 'copy', 'listed'].map(k => [k, all.filter(r => r.kind === k).length])), by_licence_class: byClass, with_open_link: rows.filter(r => r.open_link).length, examples: rows.filter(r => r.example).length } };
  mkdirSync(OUTDIR, { recursive: true });
  writeFileSync(join(OUTDIR, 'catalogue.json'), JSON.stringify({ meta, resources: all }, null, 1) + '\n');
  console.log(JSON.stringify(meta.counts));
}

const [stage, ...rest] = process.argv.slice(2);
if (stage === 'copy') await copy(rest);
else if (stage === 'probe') await probe();
else if (stage === 'all') { await copy([]); await probe(); }
else { console.error('usage: find-kml.mjs <copy [id ...]|probe|all>'); process.exit(2); }
