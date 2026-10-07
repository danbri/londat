#!/usr/bin/env node
// Points of interest of the October 2026 occupant categories (pubs and bars, alcohol shops, education, health, sport,
// arts venues) across the whole 3D model box, and whether the building registry has them yet.
//   node --max-old-space-size=6000 cwplans/tools/scan-model-pois.mjs
// in:  data/raw/docklands/greater_london-latest.osm.pbf (fetch-docklands.mjs osm), registry/buildings.json
// out: registry/model-box-pois.json  { counts: { category: { total, in_registry, in_registry_box_not_in_registry, outside_registry_box } }, pois: [...] }
// Classes: the OSM tags of tools/build-categories.mjs (stated classes only, never a name). A feature is "in the registry"
// when its OSM id is an occupant or a building outline of registry/buildings.json. Activity "scan-model-pois" in
// cwplans/pipeline.json; why: skill docklands-data-curation.
import { createReadStream, readFileSync, writeFileSync } from 'fs';
import { Writable } from 'stream';
import { createRequire } from 'module';
import { join } from 'path';
import { TOOLS } from './lib.mjs';
import { DIR, BOX_WGS84 } from './fetch-docklands.mjs';
import { CW_BOX } from './registry-osm.mjs';
const parseOSM = createRequire(import.meta.url)('osm-pbf-parser');

const CW = join(TOOLS, '..');
const CLASSES = {
  bar: [['amenity', /^(pub|bar|nightclub|biergarten)$/]],
  alcohol: [['shop', /^(alcohol|wine|beverages)$/]],
  education: [['amenity', /^(school|college|university|kindergarten|childcare)$/]],
  health: [['amenity', /^(doctors|dentist|pharmacy|clinic|hospital)$/], ['healthcare', /./]],
  sport: [['leisure', /^(sports_centre|fitness_centre|pitch|swimming_pool|sports_hall)$/], ['sport', /./]],
  arts: [['amenity', /^(cinema|theatre|arts_centre|nightclub|music_venue|events_venue|concert_hall)$/], ['theatre:genre', /./]],
};
const classify = t => { const out = {}; for (const [cat, keys] of Object.entries(CLASSES)) for (const [k, re] of keys) if (t[k] && String(t[k]).split(';').some(v => re.test(v.trim()))) { out[cat] = `${k}=${t[k]}`; break; } return out; };
const [W, S, E, N] = BOX_WGS84, inModel = (lon, lat) => lon >= W && lon <= E && lat >= S && lat <= N;
const inCw = (lon, lat) => lon >= CW_BOX[0] && lon <= CW_BOX[2] && lat >= CW_BOX[1] && lat <= CW_BOX[3];

const REG = JSON.parse(readFileSync(join(CW, 'registry/buildings.json'), 'utf8'));
const known = new Set(REG.buildings.flatMap(b => [...b.osm, ...b.occupants.map(o => o.osm).filter(Boolean)]));

const coord = new Map(), wayRefs = new Map(), hits = [];
const keep = (type, id, tags, c) => { const cls = classify(tags); if (!Object.keys(cls).length || !c || !inModel(c[0], c[1])) return;
  hits.push({ osm: `${type}/${id}`, name: tags.name || null, classes: cls, lon: +c[0].toFixed(6), lat: +c[1].toFixed(6), in_registry_box: inCw(c[0], c[1]), in_registry: known.has(`${type}/${id}`) }); };
const mean = refs => { const ps = refs.map(r => coord.get(r)).filter(Boolean); return ps.length ? [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length] : null; };
await new Promise((res, rej) => createReadStream(join(DIR, 'greater_london-latest.osm.pbf')).pipe(parseOSM()).pipe(new Writable({ objectMode: true, write(items, e, next) {
  for (const it of items) {
    if (it.type === 'node') { if (!inModel(it.lon, it.lat)) continue; coord.set(it.id, [it.lon, it.lat]); if (it.tags) keep('node', it.id, it.tags, [it.lon, it.lat]); }
    else if (it.type === 'way') { if (!it.refs.some(r => coord.has(r))) continue; wayRefs.set(it.id, it.refs); if (it.tags) keep('way', it.id, it.tags, mean(it.refs)); }
    else if (it.type === 'relation' && it.tags) { const outer = it.members.find(m => m.type === 'way' && m.role !== 'inner' && wayRefs.has(m.id)); if (outer) keep('relation', it.id, it.tags, mean(wayRefs.get(outer.id))); }
  }
  next();
} })).on('finish', res).on('error', rej));

const counts = {};
for (const cat of Object.keys(CLASSES)) {
  const l = hits.filter(h => h.classes[cat]);
  counts[cat] = { total: l.length, named: l.filter(h => h.name).length, in_registry: l.filter(h => h.in_registry).length,
    in_registry_box_not_in_registry: l.filter(h => h.in_registry_box && !h.in_registry).length, outside_registry_box: l.filter(h => !h.in_registry_box).length };
}
writeFileSync(join(CW, 'registry/model-box-pois.json'), JSON.stringify({
  generated: new Date().toISOString().slice(0, 10), model_box: BOX_WGS84, registry_box: CW_BOX,
  source: 'OpenStreetMap contributors (ODbL), Greater London extract (data-register osm_extracts osmfr-greater-london)',
  rule: 'A POI is a node, way or multipolygon in the model box with one of these OSM tags; a way or relation is placed at the mean of its (outer) nodes. in_registry: its OSM id is an occupant or a building of registry/buildings.json. Names are never used to classify.',
  classes: Object.fromEntries(Object.entries(CLASSES).map(([c, ks]) => [c, ks.map(([k, re]) => `${k}~${re.source}`)])),
  counts, pois: hits.sort((a, b) => a.osm.localeCompare(b.osm)),
}, null, 0).replace(/\},\{"osm"/g, '},\n{"osm"'));
console.log(JSON.stringify(counts, null, 1));
