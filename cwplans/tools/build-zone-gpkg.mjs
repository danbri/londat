#!/usr/bin/env node
// Write the static zone layers of cwplans into GeoPackages in cwplans/cache/, for GIS users (QGIS,
// GDAL). Needs GDAL's ogr2ogr on the PATH (apt-get install -y gdal-bin).
//
//   node cwplans/tools/build-zone-gpkg.mjs                        # all three files
//   node cwplans/tools/build-zone-gpkg.mjs --part=core,lds,portals   # some of them
//
// In:  docklands/data/area.js (model buildings, water, greens, roads and railways, flood defences; EPSG:27700 by its
//      origin), atlas/data/atlas.json (registry building outlines with cwb- ids), registry/sources/construction/sites.json,
//      feeds/river/*.json (points), and every GeoJSON in londat feeds/london-datastore/ and feeds/portals/ (as published,
//      their own CRS). Licences per layer come from data-register.json (the authority).
// Out: LONDAT_DIR/cwplans/cache/zone-core.gpkg (3D model, registry, construction, river), zone-lds.gpkg (London Datastore),
//      zone-portals.gpkg (other portals): three files, so that each stays under GitHub's 50 MB warning. One layer per input, the licence and attribution in gpkg_contents.description,
//      an attribute table layer_licences (layer, file, sources, licence, OSM use), R-tree spatial indexes (GDAL default).
// Temp: data/raw/gpkg/ (GeoJSON written for ogr2ogr, deleted at the end).
// Layers, how to open it in QGIS and the licence rules: skill cwplans-londat-cache.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { TOOLS, RAW } from './lib.mjs';
import { LONDAT_CW, warnIfNoLondat } from './londat.mjs';

const CW = join(TOOLS, '..'), TMP = join(RAW, 'gpkg');
const PARTS = ((process.argv.find(a => a.startsWith('--part=')) || '--part=core,lds,portals').split('=')[1]).split(',');
let OUT;
warnIfNoLondat();
mkdirSync(TMP, { recursive: true }); mkdirSync(join(LONDAT_CW, 'cache'), { recursive: true });
const reg = JSON.parse(readFileSync(join(CW, 'data-register.json'), 'utf8')), byPath = new Map(reg.files.map(f => [f.path, f]));
const licText = path => { const f = byPath.get(path); if (!f) throw new Error(`not in the register: ${path}`);
  const odbl = f.osm && !['none', 'ids', 'counts', 'notes'].includes(f.osm.use);
  return (odbl ? 'Contains OpenStreetMap data, © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). ' : '') +
    'Sources: ' + f.sources.map(k => reg.sources[k] ? `${reg.sources[k].name.split(' (')[0]} (${reg.sources[k].licence}${reg.sources[k].attribution ? '; ' + reg.sources[k].attribution : ''})` : k).join('; ') +
    (f.review ? ` REVIEW: ${f.review}` : '') + ` Register: cwplans/data-register.json, ${path}.`; };
let licRows = [], nLayers = 0;
const startPart = name => { OUT = join(LONDAT_CW, 'cache', `zone-${name}.gpkg`); if (existsSync(OUT)) rmSync(OUT); licRows = []; nLayers = 0; };
function ogr(srcFile, layer, { srs, desc, file, nlt = 'PROMOTE_TO_MULTI' }) {
  const a = ['-f', 'GPKG', OUT, srcFile, '-nln', layer, '-lco', `DESCRIPTION=${desc.slice(0, 3800)}`, '-lco', `IDENTIFIER=${layer}`, '-nlt', nlt, '-skipfailures', '--config', 'OGR_GEOJSON_MAX_OBJ_SIZE', '0', '--config', 'CPL_VSIL_GZIP_WRITE_PROPERTIES', 'NO'];   // no .properties sidecar next to a .gz in londat
  if (srs) a.push('-a_srs', srs);
  if (existsSync(OUT)) a.unshift('-update');
  try { execFileSync('ogr2ogr', a, { stdio: ['ignore', 'ignore', 'pipe'] }); }
  catch (e) { if (nlt !== 'GEOMETRY') return ogr(srcFile, layer, { srs, desc, file, nlt: 'GEOMETRY' }); console.error(`${layer}: ${String(e.stderr || e.message).slice(0, 300)}`); return; }
  const f = byPath.get(file); nLayers++;
  licRows.push({ layer, file, sources: f.sources.join(' '), licence: [...new Set(f.sources.map(k => reg.sources[k]?.licence || k))].join(' | '), osm_use: f.osm?.use || 'none', review: f.review ? 'yes' : 'no' });
}
const fc = (name, features) => { const p = join(TMP, name + '.geojson'); writeFileSync(p, JSON.stringify({ type: 'FeatureCollection', features })); return p; };

if (PARTS.includes('core')) { startPart('core');
// ---- 1. the 3D model (area.js): x = E - 537550, z = -(N - 180300), so EPSG:27700 directly
globalThis.DOCKLANDS_AREA = undefined; await import(join(CW, 'docklands/data/area.js'));
const A = globalThis.DOCKLANDS_AREA, E0 = A.meta.origin.E0, N0 = A.meta.origin.N0;
const dec = (q, stride = 2) => { const o = [], acc = new Array(stride).fill(0); for (let i = 0; i < q.length; i++) { acc[i % stride] += q[i]; o.push(acc[i % stride] / 10); } return o; };
const bng = (x, z) => [Math.round((x + E0) * 10) / 10, Math.round((N0 - z) * 10) / 10];
const rings = o => { const f = dec(o.p), nv = f.length / 2, st = [0, ...(o.holes || []), nv];
  return st.slice(0, -1).map((s, r) => { const ring = []; for (let k = s; k < st[r + 1]; k++) ring.push(bng(f[2 * k], f[2 * k + 1])); if (ring.length) ring.push(ring[0]); return ring; }).filter(r => r.length >= 4); };
const line3 = o => { if (!o.q) return (o.pts || []).map(p => bng(p[0], p[1]));   // tunnels: pts [x, z, y, along, …]
  const q = dec(o.q, 3), pts = []; for (let i = 0; i < q.length; i += 3) pts.push(bng(q[i], q[i + 1])); return pts; };
const AT = JSON.parse(readFileSync(join(CW, 'atlas/data/atlas.json'), 'utf8'));
const cwbOf = new Map(); AT.buildings.forEach(b => (b.mi || []).forEach(i => cwbOf.set(i, b.id)));
const areaDesc = (what, extra = '') => `${what}. From the Docklands 3D model (cwplans/docklands/data/area.js, built ${A.meta.built}), EPSG:27700. ${extra}${licText('docklands/data/area.js')}`;
ogr(fc('model_buildings', A.buildings.map((b, i) => ({ type: 'Feature', properties: { model_index: i, cwb_id: cwbOf.get(i) || null, name: b.n || null, wikidata: b.wd || null, base_m_od: b.b, height_m: b.h, min_height_m: b.mh || 0, top_m_od: Math.round((b.b + b.h) * 10) / 10, floors: b.fl ?? null },
  geometry: { type: 'Polygon', coordinates: rings(b) } })).filter(f => f.geometry.coordinates.length)), 'model_buildings',
  { srs: 'EPSG:27700', file: 'docklands/data/area.js', desc: areaDesc('Building outlines of the 3D model with base and height (m above ODN) and the registry id (cwb_id) where the atlas links one', 'Outlines OSM; heights from EA LiDAR DSM minus DTM. ') });
ogr(fc('model_water', A.water.map(w => ({ type: 'Feature', properties: { name: w.n || null, level_m_od: w.level ?? null, tidal: w.tidal ? 1 : 0 }, geometry: { type: 'Polygon', coordinates: rings(w) } })).filter(f => f.geometry.coordinates.length)), 'model_water',
  { srs: 'EPSG:27700', file: 'docklands/data/area.js', desc: areaDesc('Water areas (river, docks) with the level used by the model') });
ogr(fc('model_greens', A.greens.map(g => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rings(g) } })).filter(f => f.geometry.coordinates.length)), 'model_greens',
  { srs: 'EPSG:27700', file: 'docklands/data/area.js', desc: areaDesc('Green areas (parks, grass, gardens)') });
ogr(fc('model_lines', A.lines.map(l => ({ type: 'Feature', properties: { kind: l.k, name: l.name || null, bridge: l.bridge ? 1 : 0, tunnel: l.tunnel ? 1 : 0 }, geometry: { type: 'LineString', coordinates: line3(l) } })).filter(f => f.geometry.coordinates.length >= 2)), 'model_lines',
  { srs: 'EPSG:27700', file: 'docklands/data/area.js', desc: areaDesc('Roads, footways, railways, DLR and Underground lines (kind = road, foot, rail, light_rail, subway)') });
ogr(fc('model_flood_defences', A.defences.map(d => ({ type: 'Feature', properties: { ea_asset: d.id, type: d.t, crest_m_od: d.c, design_m_od: d.d ?? null, standard_of_protection: d.sop ?? null }, geometry: { type: 'LineString', coordinates: line3(d) } })).filter(f => f.geometry.coordinates.length >= 2)), 'model_flood_defences',
  { srs: 'EPSG:27700', file: 'docklands/data/area.js', desc: `Environment Agency Spatial Flood Defences in the model box: asset id, type, crest and design level (m above ODN), standard of protection. EPSG:27700. Environment Agency, Open Government Licence v3.0. Register: cwplans/data-register.json, docklands/data/area.js.` });

// ---- 2. registry buildings (atlas.json outlines in microdegrees)
const decLL = q => { const o = []; let la = 0, lo = 0; for (let i = 0; i < q.length; i += 2) { la += q[i]; lo += q[i + 1]; o.push([lo / 1e6, la / 1e6]); } if (o.length && (o[0][0] !== o.at(-1)[0] || o[0][1] !== o.at(-1)[1])) o.push(o[0]); return o; };
ogr(fc('registry_buildings', AT.buildings.map(b => ({ type: 'Feature', properties: { cwb_id: b.id, name: b.n || null, type: b.t || null, levels: b.lv ?? null, levels_underground: b.lu ?? null, height_m: b.h ?? null, model_height_m: b.wh ?? null, area_m2: b.a ?? null, homes: b.hm ?? null, companies: b.co ?? null, occupants: b.o ?? null, wikidata: b.wd || null, postcodes: (b.pc || []).join(' ') || null, lat: b.lat, lon: b.lon },
  geometry: b.g && b.g.length ? { type: 'Polygon', coordinates: b.g.map(decLL).filter(r => r.length >= 4) } : { type: 'Point', coordinates: [b.lon, b.lat] } }))), 'registry_buildings',
  { srs: 'EPSG:4326', file: 'atlas/data/atlas.json', nlt: 'GEOMETRY', desc: `Registry buildings (cwb- ids) of the Canary Wharf box with outline (or point where no outline), name, type, levels, heights, homes, company and occupant counts, postcodes. From cwplans/atlas/data/atlas.json (built ${AT.built}); full records: registry/buildings.json. EPSG:4326. ${licText('atlas/data/atlas.json')}` });

// ---- 3. construction sites
const SITES = JSON.parse(readFileSync(join(CW, 'registry/sources/construction/sites.json'), 'utf8'));
ogr(fc('construction_sites', SITES.sites.map(s => ({ type: 'Feature', properties: { site_id: s.id, name: s.name, address: s.address || null, borough: s.borough || null, status: s.status, status_rule: s.status_rule || null, status_confidence: s.status_confidence || null, decision: s.dates?.decision || null, commenced: s.dates?.commenced || null, completed: s.dates?.completed || null, area_m2: s.footprint?.area_m2 ?? null },
  geometry: s.footprint?.ring_wgs84?.length >= 4 ? { type: 'Polygon', coordinates: [s.footprint.ring_wgs84] } : { type: 'Point', coordinates: [s.position.lon, s.position.lat] } }))), 'construction_sites',
  { srs: 'EPSG:4326', file: 'registry/sources/construction/sites.json', nlt: 'GEOMETRY', desc: `Works in progress: construction sites in the zone with status, rule, confidence and dates (footprint or point). From cwplans/registry/sources/construction/sites.json (${SITES.meta?.built || SITES.meta?.generated || ''}). EPSG:4326. ${licText('registry/sources/construction/sites.json')}` });

// ---- 4. river snapshots (points; one layer per snapshot file that has positions)
for (const name of ['locks', 'eden-dock', 'royal-docks', 'ea-sondes', 'ea-wims', 'pla-moorings', 'osm-river', 'wikidata-vessels', 'river-bus', 'levels']) {
  const rel = `feeds/river/${name}.json`, d = JSON.parse(readFileSync(join(CW, rel), 'utf8'));
  const feats = d.items.filter(i => i.position && isFinite(i.position.lat) && isFinite(i.position.lon)).map(i => ({ type: 'Feature', properties: { id: i.id, kind: i.kind, name: i.name || i.values?.name || i.values?.label || null, time: i.time || null, url: i.url || null }, geometry: { type: 'Point', coordinates: [i.position.lon, i.position.lat] } }));
  if (!feats.length) continue;
  ogr(fc('river_' + name, feats), 'river_' + name.replace(/-/g, '_'), { srs: 'EPSG:4326', file: rel, desc: `River snapshot ${name} (fetched ${d.meta.fetched}): ${feats.length} positioned items, id, kind, name, time. From cwplans/${rel}. EPSG:4326. ${licText(rel)}` });
}

finish(); }

// ---- 5. the London Datastore and portal extracts (GeoJSON, own CRS), one file each
for (const [part, prefix] of [['lds', 'feeds/london-datastore/'], ['portals', 'feeds/portals/']]) { if (!PARTS.includes(part)) continue; startPart(part);
for (const f of reg.files.filter(f => f.path.startsWith(prefix) && /\.geojson(\.gz)?$/.test(f.path))) {
  const src = join(LONDAT_CW, f.path); if (!existsSync(src)) { console.error(`missing: ${f.path}`); continue; }
  const base = f.path.replace(/^feeds\/london-datastore\//, 'lds_').replace(/^feeds\/portals\//, 'portal_').replace(/\.geojson(\.gz)?$/, '').split('/');
  let layer = (base.length > 1 && base.at(-1) === base.at(-2) ? base.slice(0, -1) : base).join('_').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase().slice(0, 60);
  ogr(f.path.endsWith('.gz') ? '/vsigzip/' + src : src, layer, { file: f.path, desc: `${f.what}. londat cwplans/${f.path}. ${licText(f.path)}` });
}

finish(); }
rmSync(TMP, { recursive: true, force: true });

// ---- 6. the licence table (attributes only), empty geometries, VACUUM
function finish() {
const csv = [Object.keys(licRows[0]).join(','), ...licRows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
writeFileSync(join(TMP, 'layer_licences.csv'), csv);
execFileSync('ogr2ogr', ['-update', '-f', 'GPKG', OUT, join(TMP, 'layer_licences.csv'), '-nln', 'layer_licences', '-lco', 'DESCRIPTION=One row per layer of this GeoPackage: the file it was made from (path relative to cwplans/ in danbri/londat), the register source keys, their licences and the OSM use. The register is the authority: https://github.com/danbri/londat/blob/main/cwplans/data-register.json']);
// an empty geometry must carry the GeoPackage empty flag (validate_gpkg.py Req 152); GDAL writes some from GeoJSON without
// it (59 in portal_pdg_flood_risk_zone on 2026-10-05), so they become NULL geometries and keep their attributes
const sqlOut = q => execFileSync('ogrinfo', ['-q', OUT, '-sql', q], { encoding: 'utf8' });
for (const m of sqlOut('SELECT table_name || \':\' || column_name AS x FROM gpkg_geometry_columns').matchAll(/x \(String\) = (\S+):(\S+)/g)) {
  const n = +(/n \(Integer\) = (\d+)/.exec(sqlOut(`SELECT count(*) AS n FROM "${m[1]}" WHERE "${m[2]}" IS NOT NULL AND ST_IsEmpty("${m[2]}")`)) || [])[1];
  if (n) { sqlOut(`UPDATE "${m[1]}" SET "${m[2]}" = NULL WHERE "${m[2]}" IS NOT NULL AND ST_IsEmpty("${m[2]}")`); console.log(`${m[1]}: ${n} empty geometries set to NULL`); }
}
execFileSync('ogrinfo', [OUT, '-sql', 'VACUUM'], { stdio: 'ignore' });
console.log(`${OUT.split('/').pop()}: ${nLayers} layers, ${(statSync(OUT).size / 1e6).toFixed(1)} MB -> ${OUT}`);
}
