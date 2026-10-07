#!/usr/bin/env node
// OSM features with full tags inside the Canary Wharf box, for the building registry (build-registry.mjs).
//   node --max-old-space-size=6000 cwplans/tools/registry-osm.mjs
// in:  data/raw/docklands/greater_london-latest.osm.pbf (fetch-docklands.mjs osm)
// out: data/raw/registry/osm-cw.json.gz  {nodes: {id: [lon, lat]}, features: [{type, id, tags, refs|members|lon,lat}]}
// Tags kept: everything except mappers' notes and the few that reach a person, not a business (see DROP).
import { createReadStream, writeFileSync, mkdirSync } from 'fs';
import { Writable } from 'stream';
import { createRequire } from 'module';
import { gzipSync } from 'zlib';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { RAW } from './lib.mjs';
import { DIR as DOCK } from './fetch-docklands.mjs';
const parseOSM = createRequire(import.meta.url)('osm-pbf-parser');

export const CW_BOX = [-0.0300, 51.4980, -0.0050, 51.5100];   // same box as the model's Canary Wharf focus and postcodes.mjs
const M = 0.0015, [W, S, E, N] = CW_BOX;
const inBox = (lon, lat) => lon >= W - M && lon <= E + M && lat >= S - M && lat <= N + M;
// Business contact tags (phone, email, website, contact:*) are kept: the registry shows how to reach an occupant
// (owner, 2026-10-03: the cwplans exception allows organisation data in the prototyping phase). Still dropped: tags
// that name or reach a person rather than a business (mobile numbers, operator:person), and mappers' notes.
const DROP = /^(contact:mobile|mobile|operator:person|addr:flats|note|fixme|FIXME|source.*|created_by)$/;
const slim = t => { const o = {}; for (const k in t || {}) if (!DROP.test(k)) o[k] = t[k]; return o; };
// run only as a script: build-registry.mjs imports CW_BOX
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
const pbf = join(DOCK, 'greater_london-latest.osm.pbf');
const scan = fn => new Promise((res, rej) => createReadStream(pbf).pipe(parseOSM()).pipe(new Writable({ objectMode: true, write(items, e, next) { for (const it of items) fn(it); next(); } })).on('finish', res).on('error', rej));

const coord = new Map(), feats = [], wayRefs = [];
await scan(it => {
  if (it.type === 'node') {
    if (!inBox(it.lon, it.lat)) return;
    coord.set(it.id, [it.lon, it.lat]);
    if (it.tags && Object.keys(it.tags).length) feats.push({ type: 'node', id: it.id, lon: it.lon, lat: it.lat, tags: slim(it.tags) });
  } else if (it.type === 'way') wayRefs.push(it);
  else if (it.type === 'relation' && it.tags && (it.tags.type === 'multipolygon' || it.tags.type === 'building') && (it.tags.building || it.tags['building:part'] || it.tags.name)) feats.push({ type: 'relation', id: it.id, tags: slim(it.tags), members: it.members.map(m => ({ type: m.type, ref: m.id, role: m.role })) });
});
// ways with at least one node in the box; relations keep only if a member way is kept
const ways = wayRefs.filter(w => w.refs.some(r => coord.has(r)));
const keptWay = new Set(ways.map(w => w.id));
const rels = feats.filter(f => f.type === 'relation' && f.members.some(m => m.type === 'way' && keptWay.has(m.ref)));
const out = [...feats.filter(f => f.type === 'node'), ...ways.map(w => ({ type: 'way', id: w.id, tags: slim(w.tags), refs: w.refs })), ...rels];
const nodes = {}; for (const w of ways) for (const r of w.refs) { const c = coord.get(r); if (c) nodes[r] = c; }
mkdirSync(join(RAW, 'registry'), { recursive: true });
writeFileSync(join(RAW, 'registry', 'osm-cw.json.gz'), gzipSync(JSON.stringify({ box: CW_BOX, extracted: new Date().toISOString().slice(0, 10), nodes, features: out })));
console.log(`osm-cw.json.gz: ${out.filter(f => f.type === 'node').length} tagged nodes, ${ways.length} ways, ${rels.length} relations`);
}
