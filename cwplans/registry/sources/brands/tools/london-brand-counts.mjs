#!/usr/bin/env node
// How many branches each brand has across Greater London in OSM (brand:wikidata on a shop/amenity/
// office/tourism/leisure/healthcare feature) - the size measure used to pick the 30 brands whose
// own store pages are checked (step 3c). Greater London is a proxy for "UK branches": the GB extract is 1.9 GB.
//   node cwplans/registry/sources/brands/tools/london-brand-counts.mjs
// out: data/raw/registry/london-brand-counts.json
import { createReadStream, writeFileSync } from 'fs';
import { Writable } from 'stream';
import { createRequire } from 'module';
import { join } from 'path';
import { CW, RAW } from './lib.mjs';
const parseOSM = createRequire(join(CW, 'tools/x.js'))('osm-pbf-parser');
const PBF = join(CW, 'data/raw/docklands/greater_london-latest.osm.pbf');
const BIZ = /^(shop|amenity|office|tourism|leisure|healthcare|craft)$/;
const counts = {};
await new Promise((res, rej) => createReadStream(PBF).pipe(parseOSM()).pipe(new Writable({
  objectMode: true,
  write(items, enc, next) {
    for (const it of items) { const t = it.tags; const q = t && t['brand:wikidata']; if (q && Object.keys(t).some(k => BIZ.test(k))) for (const x of q.split(';')) counts[x.trim()] = (counts[x.trim()] || 0) + 1; }
    next();
  },
})).on('finish', res).on('error', rej));
writeFileSync(join(RAW, 'london-brand-counts.json'), JSON.stringify({ generated: new Date().toISOString(), pbf: PBF, counts }));
console.log(Object.keys(counts).length, 'brand QIDs in Greater London');
