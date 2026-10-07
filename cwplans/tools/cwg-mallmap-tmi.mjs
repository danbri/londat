// Normalise the archived Living Map data (danbri/londat third_party/cwg/mallmap) into plain GeoJSON and JSON in
// third_party/cwg/_TMI/mallmap/: every indoor and outdoor feature once, with its properties as served, its geometry in
// WGS84 from the most precise zoom at which it lies whole in one tile (else its pieces at the lowest zoom, as a Multi*
// geometry), one FeatureCollection per floor; the feature records from the API (one per id); the place list.
//   node cwplans/tools/cwg-mallmap-tmi.mjs
// Skill: cwplans-web-harvest, "Mall plans".
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import { LONDAT_DIR } from './londat.mjs';

const MM = join(LONDAT_DIR, 'third_party', 'cwg', 'mallmap'), OUT = join(LONDAT_DIR, 'third_party', 'cwg', '_TMI', 'mallmap');
mkdirSync(OUT, { recursive: true });
const ZOOMS = readdirSync(join(MM, 'tiles', 'indoor')).map(Number).filter(z => z >= 12).sort((a, b) => b - a);
const round = c => typeof c[0] === 'number' ? [+c[0].toFixed(7), +c[1].toFixed(7)] : c.map(round);

// uid -> { layer, props, byZoom: { z: [geometry, ...] } }
const feats = new Map();
for (const z of ZOOMS) {
  const dir = join(MM, 'tiles', 'indoor', String(z));
  for (const x of readdirSync(dir)) for (const yf of readdirSync(join(dir, x))) {
    const t = new VectorTile(new Protobuf(readFileSync(join(dir, x, yf))));
    for (const [layer, l] of Object.entries(t.layers)) for (let i = 0; i < l.length; i++) {
      const f = l.feature(i), p = f.properties, key = `${layer}:${p.uid}:${f.type}`;
      const rec = feats.get(key) || feats.set(key, { layer, props: p, byZoom: {} }).get(key);
      (rec.byZoom[z] ||= []).push(f.toGeoJSON(+x, +yf.replace(/\.pbf$/, ''), z).geometry);
    }
  }
}
const multi = gs => { const t = gs[0].type.replace(/^Multi/, ''); const parts = gs.flatMap(g => g.type.startsWith('Multi') ? g.coordinates : [g.coordinates]); return { type: 'Multi' + t, coordinates: parts }; };
const byFloor = new Map(), stats = { features: 0, whole: 0, pieced: 0, by_zoom: {} };
for (const { layer, props, byZoom } of feats.values()) {
  let z = ZOOMS.find(z => byZoom[z]?.length === 1), geometry, whole = true;
  if (z != null) geometry = byZoom[z][0];
  else { z = Math.min(...Object.keys(byZoom).map(Number)); geometry = multi(byZoom[z]); whole = false; }
  stats.features++; stats[whole ? 'whole' : 'pieced']++; stats.by_zoom[z] = (stats.by_zoom[z] || 0) + 1;
  const floor = layer === 'indoor' ? String(props.floor_level ?? 'none') : 'outdoor';
  (byFloor.get(floor) || byFloor.set(floor, []).get(floor)).push({ type: 'Feature', id: `${layer}:${props.uid}`, properties: { layer, ...props, zoom_used: z, whole }, geometry: { ...geometry, coordinates: round(geometry.coordinates) } });
}
const files = [];
for (const [floor, fs] of [...byFloor].sort((a, b) => (a[0] === 'outdoor') - (b[0] === 'outdoor') || +a[0] - +b[0])) {
  fs.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const name = floor === 'outdoor' ? 'outdoor.geojson' : `indoor-floor-${floor}.geojson`;
  writeFileSync(join(OUT, name), JSON.stringify({ type: 'FeatureCollection', name, features: fs }) + '\n');
  const named = fs.filter(f => f.properties.name), cls = fs.reduce((m, f) => (m[f.properties.class] = (m[f.properties.class] || 0) + 1, m), {});
  files.push({ file: name, floor_name: fs[0]?.properties.floor_name ?? null, features: fs.length, named: named.length, classes: cls });
}
// the API records: one per feature id, from every features-by-name answer; the place list as served
const recs = new Map();
const dir = join(MM, 'api', 'features-by-name');
if (existsSync(dir)) for (const f of readdirSync(dir)) { try { for (const d of JSON.parse(readFileSync(join(dir, f), 'utf8')).data || []) recs.set(d.id, d); } catch {} }
writeFileSync(join(OUT, 'features.json'), JSON.stringify({ source: 'map-api.prod.livingmap.com /v1/maps/canary_wharf/features?long_name=<each name>', records: [...recs.values()].sort((a, b) => a.id.localeCompare(b.id)) }) + '\n');
const objs = existsSync(join(MM, 'api', 'feature-objects.json')) ? JSON.parse(readFileSync(join(MM, 'api', 'feature-objects.json'), 'utf8')).data : [];
writeFileSync(join(OUT, 'places.json'), JSON.stringify({ source: 'map-api.prod.livingmap.com /v1/maps/canary_wharf/feature-objects', places: objs }) + '\n');
const summary = { generated: new Date().toISOString(), tool: 'cwplans/tools/cwg-mallmap-tmi.mjs', zooms_read: ZOOMS, ...stats, api_feature_records: recs.size, places: objs.length, files };
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1) + '\n');
console.log(JSON.stringify({ ...summary, files: files.map(f => `${f.file} ${f.features}/${f.named}`) }, null, 1));
