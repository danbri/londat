#!/usr/bin/env node
// Cut the Docklands study box out of the Greater London OSM extract into a small JSON the build reads.
//   node cwplans/tools/osm-clip-docklands.mjs
// in:  data/raw/docklands/greater_london-latest.osm.pbf (fetch-docklands.mjs osm)
// out: data/raw/docklands/osm-clip.json.gz  {nodes: {id: [lon, lat]}, ways, rels, pois}
// Keeps only features the model uses (see KEEP_WAY); ways that reach outside the box are kept whole.
import { createReadStream, writeFileSync } from 'fs';
import { Writable } from 'stream';
import { createRequire } from 'module';
import { gzipSync } from 'zlib';
import { join } from 'path';
import { DIR, BOX_WGS84 } from './fetch-docklands.mjs';
const parseOSM = createRequire(import.meta.url)('osm-pbf-parser');

const PBF = join(DIR, 'greater_london-latest.osm.pbf');
const [W, S, E, N] = BOX_WGS84, M = 0.004;   // ~300 m margin
const inBox = (lon, lat) => lon >= W - M && lon <= E + M && lat >= S - M && lat <= N + M;
// Canary Wharf estate and the Wood Wharf / Crossrail Place area: keep every tagged node here (shops and halls carry level=*)
const FOCUS = [-0.0300, 51.4980, -0.0050, 51.5100];
const inFocus = (lon, lat) => lon >= FOCUS[0] && lon <= FOCUS[2] && lat >= FOCUS[1] && lat <= FOCUS[3];

const TAG = /^(name|building(:.*)?|height|min_height|roof:(shape|height|levels)|level(:ref)?|repeat_on|layer|location|indoor|tunnel(:name)?|bridge(:structure)?|cutting|embankment|covered|railway(:track_ref)?|public_transport|station|subway|light_rail|train|highway|man_made|natural|water|waterway|landuse|leisure|amenity|parking|shop|place|wikidata|wikipedia|ref|operator|network|lock|tidal|area|entrance|access|type|start_date|construction|ele|depth|aerialway|service|usage|tourism|historic|disused|abandoned)$/;
const ROADS = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$/;
function KEEP_WAY(t) {
  if (!t) return false;
  if (t.building || t['building:part']) return true;
  if (t.natural === 'water' || t.waterway || t.landuse === 'basin' || t.landuse === 'reservoir') return true;
  if (/^(rail|subway|light_rail|platform|station|construction|narrow_gauge)$/.test(t.railway || '')) return true;
  if (ROADS.test(t.highway || '')) return true;
  if (t.highway && (t.tunnel || t.level || t.indoor || +t.layer < 0 || t.covered === 'yes' || t.bridge)) return true;
  if (t.tunnel || t.indoor || t.location === 'underground' || t.location === 'underwater') return true;
  if (t.amenity === 'parking' && /^(underground|multi-storey)$/.test(t.parking || '')) return true;
  if (t.man_made && /^(bridge|pier|tunnel|shaft|ventilation_shaft|lock_gate|breakwater)$/.test(t.man_made)) return true;
  if (t.aerialway || t.public_transport === 'platform' || t.public_transport === 'station') return true;
  if (/^(park|garden|common|recreation_ground|nature_reserve)$/.test(t.leisure || '') || /^(grass|recreation_ground|forest)$/.test(t.landuse || '')) return true;
  if (t.place && t.name) return true;
  return false;
}
const KEEP_REL = t => t && (t.type === 'multipolygon' || t.type === 'building') && (KEEP_WAY(t) || t.type === 'building');
function KEEP_POI(t, lon, lat) {
  if (!t) return false;
  if (/^(station|subway_entrance|train_station_entrance|halt|tram_stop)$/.test(t.railway || '') || t.public_transport === 'station') return true;
  if (t.place && t.name) return true;
  if (/^(ventilation_shaft|shaft|tunnel|monitoring_station)$/.test(t.man_made || '')) return true;
  if (t.entrance && (t.level || t.layer)) return true;
  if (t.aerialway === 'station' || t.amenity === 'ferry_terminal' || t.ferry === 'yes') return true;
  if (inFocus(lon, lat) && (t.shop || t.amenity || t.level || t.indoor || t.name)) return true;
  return false;
}
const slim = t => { if (!t) return t; const o = {}; for (const k in t) if (TAG.test(k)) o[k] = t[k]; return o; };

function scan(onItem) {
  return new Promise((res, rej) => createReadStream(PBF).pipe(parseOSM()).pipe(new Writable({
    objectMode: true, write(items, enc, next) { for (const it of items) onItem(it); next(); },
  })).on('finish', res).on('error', rej));
}

const coord = new Map(), ways = [], rels = [], pois = [];
// pass 0: member ways of the relations we keep (relations come after ways in a PBF, and members can carry any tags)
const memberWays = new Set();
let t0 = Date.now();
await scan(it => { if (it.type === 'relation' && KEEP_REL(it.tags)) for (const m of it.members) if (m.type === 'way') memberWays.add(m.id); });
console.log(`pass 0: ${memberWays.size} relation member ways, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
t0 = Date.now();
await scan(it => {
  if (it.type === 'node') {
    if (!inBox(it.lon, it.lat)) return;
    coord.set(it.id, [Math.round(it.lon * 1e7) / 1e7, Math.round(it.lat * 1e7) / 1e7]);
    if (KEEP_POI(it.tags, it.lon, it.lat)) pois.push({ id: it.id, lon: it.lon, lat: it.lat, tags: slim(it.tags) });
  } else if (it.type === 'way') {
    if (KEEP_WAY(it.tags)) ways.push({ id: it.id, tags: slim(it.tags), refs: it.refs });
    else if (memberWays.has(it.id)) ways.push({ id: it.id, tags: {}, refs: it.refs });   // only needed as a relation member
  } else if (it.type === 'relation') {
    if (KEEP_REL(it.tags)) rels.push({ id: it.id, tags: slim(it.tags), members: it.members.map(m => ({ type: m.type, ref: m.id, role: m.role })) });
  }
});
console.log(`pass 1: ${coord.size} nodes in box, ${ways.length} candidate ways, ${rels.length} relations, ${pois.length} pois, ${((Date.now() - t0) / 1000).toFixed(0)} s`);

// keep ways that touch the box; untagged ones only if a kept relation uses them
const relWay = new Set(rels.flatMap(r => r.members.filter(m => m.type === 'way').map(m => m.ref)));
const touched = ways.filter(w => w.refs.some(id => coord.has(id)));
const keptWays = touched.filter(w => Object.keys(w.tags).length || relWay.has(w.id));
const keptIds = new Set(keptWays.map(w => w.id));
// relations: keep those with a kept member way; pull in their other member ways (outside the box) too
const keptRels = rels.filter(r => r.members.some(m => m.type === 'way' && keptIds.has(m.ref)));
const needWays = new Set(keptRels.flatMap(r => r.members.filter(m => m.type === 'way' && !keptIds.has(m.ref)).map(m => m.ref)));
for (const w of ways) if (needWays.has(w.id)) { keptWays.push(w); keptIds.add(w.id); }
// nodes missing from long ways (the Thames, railway lines) get a second pass
const missing = new Set();
for (const w of keptWays) for (const id of w.refs) if (!coord.has(id)) missing.add(id);
t0 = Date.now();
await scan(it => { if (it.type === 'node' && missing.has(it.id)) coord.set(it.id, [Math.round(it.lon * 1e7) / 1e7, Math.round(it.lat * 1e7) / 1e7]); });
console.log(`pass 2: ${missing.size} outside nodes for ${keptWays.length} ways, ${((Date.now() - t0) / 1000).toFixed(0)} s`);

const nodes = {};
for (const w of keptWays) for (const id of w.refs) { const c = coord.get(id); if (c) nodes[id] = c; }
const out = { source: 'download.openstreetmap.fr greater_london-latest.osm.pbf', clipped: new Date().toISOString().slice(0, 10), box: BOX_WGS84, nodes, ways: keptWays, rels: keptRels, pois };
const buf = gzipSync(JSON.stringify(out), { level: 9 });
writeFileSync(join(DIR, 'osm-clip.json.gz'), buf);
console.log(`osm-clip.json.gz: ${(buf.length / 1e6).toFixed(1)} MB gz; ${Object.keys(nodes).length} nodes, ${keptWays.length} ways, ${keptRels.length} relations, ${pois.length} pois`);
