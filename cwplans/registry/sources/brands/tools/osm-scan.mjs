#!/usr/bin/env node
// Step 3a input: every tagged OSM feature in the Canary Wharf box, with all its tags.
//   node magpie/cwplans/registry/sources/brands/tools/osm-scan.mjs
// in:  data/raw/docklands/greater_london-latest.osm.pbf
// out: data/raw/registry/osm-box-features.json (not committed; ~1 min)
// Kept: nodes/ways/relations in the box carrying shop, amenity, office, tourism, leisure, craft,
// healthcare, brand, brand:wikidata or name. Ways and relations are placed at the mean of their nodes.
import { createReadStream, writeFileSync } from 'fs';
import { Writable } from 'stream';
import { createRequire } from 'module';
import { join } from 'path';
import { CW, RAW, BOX, inBox } from './lib.mjs';
const parseOSM = createRequire(join(CW, 'tools/x.js'))('osm-pbf-parser');
const PBF = join(CW, 'data/raw/docklands/greater_london-latest.osm.pbf');
const M = 0.003;
const near = (lon, lat) => lon >= BOX[0] - M && lon <= BOX[2] + M && lat >= BOX[1] - M && lat <= BOX[3] + M;
const WANT = t => t && (t.shop || t.amenity || t.office || t.tourism || t.leisure || t.craft || t.healthcare || t.brand || t['brand:wikidata'] || t.name);

const coord = new Map(), wayC = new Map(), out = [];
const mean = pts => pts.length ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : null;
const r7 = x => Math.round(x * 1e7) / 1e7;
const t0 = Date.now();
await new Promise((res, rej) => createReadStream(PBF).pipe(parseOSM()).pipe(new Writable({
  objectMode: true,
  write(items, enc, next) {
    for (const it of items) {
      if (it.type === 'node') {
        if (!near(it.lon, it.lat)) continue;
        coord.set(it.id, [it.lon, it.lat]);
        if (inBox(it.lon, it.lat) && WANT(it.tags))
          out.push({ osm_id: `node/${it.id}`, lat: r7(it.lat), lon: r7(it.lon), tags: it.tags });
      } else if (it.type === 'way') {
        const pts = it.refs.map(r => coord.get(r)).filter(Boolean);
        if (!pts.length) continue;
        const c = mean(pts); wayC.set(it.id, c);
        if (WANT(it.tags) && inBox(c[0], c[1])) out.push({ osm_id: `way/${it.id}`, lat: r7(c[1]), lon: r7(c[0]), tags: it.tags });
      } else if (it.type === 'relation') {
        if (!WANT(it.tags)) continue;
        const c = mean(it.members.filter(m => m.type === 'way').map(m => wayC.get(m.id)).filter(Boolean));
        if (c && inBox(c[0], c[1])) out.push({ osm_id: `relation/${it.id}`, lat: r7(c[1]), lon: r7(c[0]), tags: it.tags });
      }
    }
    next();
  },
})).on('finish', res).on('error', rej));
const file = join(RAW, 'osm-box-features.json');
writeFileSync(file, JSON.stringify({ generated: new Date().toISOString(), pbf: PBF, box: BOX, features: out }));
console.log(`${out.length} features in box (${coord.size} nodes near box), ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${file}`);
