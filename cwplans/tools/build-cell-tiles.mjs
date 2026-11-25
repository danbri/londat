#!/usr/bin/env node
// One build cell of the worldwide building layer: issue https://github.com/danbri/londat/issues/20 stage 2 (our own
// tile sets in our own GitHub Pages repositories; owner, 2026-11-24). Size plan: docs/scale-estimate.md.
//
//   node cwplans/tools/build-cell-tiles.mjs --cell 8-250-202 [--tier london] [--sparse 2000] [--out <folder>] [fetch|build]
//
// A build cell is a cell of the geodetic quadtree of docs/planet-architecture.md section 2 (180 / 2^z degrees; x from
// 180 W, y from 90 S, as the place tiles of build-place-tiles.mjs). Level 8 is 0.703 degrees, about 78 x 49 km at 51 N.
// A building belongs to the cell that holds its centroid (west and south edges in, east and north edges out).
//
// No region config by hand: this tool writes one for the cell (cwplans/data/raw/places/cell-<z-x-y>/region.mjs) and runs
// build-place-tiles.mjs on it with --region-file. The tier sets what the tiles hold:
//   london  the Greater London method (place kind blocks, the london.js place.blocks parameters: levels 10 to 13, compact
//           boxes, outlines of named and irregular buildings, far forms), OSM and Microsoft footprints via Overture.
// Output (default): ../docklandia/data/cells/<z-x-y>/ (tiles/, tileset.json, features.json, provenance/log.json), no entry
// in places/index.json (place.index false): the page reads cells through the tile index of stage 3, not yet written.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const CW = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argOf = k => { const i = argv.indexOf('--' + k); return i < 0 ? null : argv[i + 1]; };
const cell = argOf('cell'), tier = argOf('tier') || 'london';
const m = /^(\d+)-(\d+)-(\d+)$/.exec(cell || ''); if (!m) { console.error('usage: build-cell-tiles.mjs --cell <z-x-y> [--tier london] [--out <folder>] [fetch|build]'); process.exit(2); }
const [z, x, y] = m.slice(1).map(Number), cs = 180 / 2 ** z;
if (x >= 2 ** (z + 1) || y >= 2 ** z) throw new Error(`no cell ${cell}`);
export const cellBbox = (z, x, y) => { const s = 180 / 2 ** z; return [-180 + x * s, -90 + y * s, -180 + (x + 1) * s, -90 + (y + 1) * s]; };
const bb = cellBbox(z, x, y), r6 = v => Math.round(v * 1e6) / 1e6;
const TIERS = { london: 'london' };
// --sparse <n>: a node coarser than the leaf level holding at most n buildings is a leaf (fewer, larger tiles where
// buildings are sparse; the fixed cost of a tile is about 3 kB); 0 = every leaf at level 13 (the London set)
const SPARSE = +(argOf('sparse') ?? 2000);
// --exclude <ids>: regions whose model draws its own buildings (comma-separated; default docklands: a building whose centroid
// is 1 m or more inside the Docklands model box is left to the model, the Greater London rule); --exclude none for no mask
const EXCLUDE = (argOf('exclude') || 'docklands') === 'none' ? [] : (argOf('exclude') || 'docklands').split(',');
if (!TIERS[tier]) throw new Error(`tier ${tier}: one of ${Object.keys(TIERS).join(', ')}`);

const id = `cell-${cell}`, raw = join(CW, 'data', 'raw', 'places', id); mkdirSync(raw, { recursive: true });
const out = resolve(argOf('out') || join(CW, '..', '..', 'docklandia', 'data', 'cells', cell));
const u = p => pathToFileURL(join(CW, '..', p)).href;
// the region config of the cell: the London place.blocks parameters, a rectangle boundary, the model boxes of --exclude,
// the globe's world terrain where the world base has no tile
const src = `// Written by cwplans/tools/build-cell-tiles.mjs for build cell ${cell} (tier ${tier}); do not edit.
import london from ${JSON.stringify(u('docklands/geo/regions/london.js'))};
export default {
  id: ${JSON.stringify(id)}, name: ${JSON.stringify('Build cell ' + cell)},
  origin: { lon: ${r6((bb[0] + bb[2]) / 2)}, lat: ${r6((bb[1] + bb[3]) / 2)}, h: 0 },
  bbox: ${JSON.stringify(bb.map(r6))},
  timeZone: 'UTC', locale: 'en', locales: ['en'], heightDatum: 'ellipsoid',
  place: {
    kind: 'blocks', label: ${JSON.stringify('Build cell ' + cell)}, search: [],
    boundary: { bbox: ${JSON.stringify(bb)}, name: ${JSON.stringify('quadtree cell ' + cell)} },
    exclude: ${JSON.stringify(EXCLUDE)}, index: false,
    outRepo: 'docklandia', outPath: ${JSON.stringify(`data/cells/${cell}/`)}, tileBase: ${JSON.stringify(`https://danbri.github.io/docklandia/data/cells/${cell}/`)},
    heights: london.place.heights, default_height_m: london.place.default_height_m,
    blocks: { ...london.place.blocks, ground_fallback: 'world-texture', sparse_leaf_n: ${SPARSE}, credit_per_set: true },
  },
  adapters: london.adapters,
};
`;
const regFile = join(raw, 'region.mjs'); writeFileSync(regFile, src);
const steps = argv.includes('fetch') ? ['fetch'] : argv.includes('build') ? ['build'] : ['fetch', 'build'];
for (const st of steps) {
  const r = spawnSync(process.execPath, [join(CW, 'tools', 'build-place-tiles.mjs'), st, '--region', id, '--region-file', regFile, '--out', out + '/', ...(argv.includes('--force') ? ['--force'] : [])], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
