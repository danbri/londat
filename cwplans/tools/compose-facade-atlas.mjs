// The facade atlas the 3D page loads, docklands/data/tex/facades.jpg + facades.json, as one logged operation
// (kgx-ops Flow; log in londat kgx/log):
//   compose-facade-atlas: the registry towers' atlas (facades-registry.jpg/.json, tools/build-facade-atlas.py, slots
//     0 to 15) + every contributed tile set (graph versions facade-tiles-<set> named in kgx/external-heads.json, and
//     their PNGs) + model-building-keys + area.js -> graph version `facade-atlas` and the page files.
// Contributed tiles take the next slots (32 in all: 8 x 4 tiles of 256 px). Their buildings are keyed by OSM id
// ("osm:w204580680"), with the model indices of this area.js (mi, model_fp) and a WGS84 point inside (at) that the page
// uses when the model was rebuilt and model_fp no longer matches.
//   FACADE_PY=<python with Pillow> node cwplans/tools/compose-facade-atlas.mjs
// Skills: docklands-3d-page ("Building keys", "Styles"), docklands-data-curation ("Contributed photos"), cwplans-dataflow.
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { join } from 'path';
import vm from 'vm';
import { dataFactory as F } from '@factoidal/core';
import { TOOLS } from './lib.mjs';
import { LONDAT_DIR } from './londat.mjs';
import { Flow, KG } from './kgx-ops.mjs';

const CW = join(TOOLS, '..'), TEX = join(CW, 'docklands', 'data', 'tex'), AREA = join(CW, 'docklands', 'data', 'area.js');
const PY = process.env.FACADE_PY || 'python3', TOOL = join(TOOLS, 'facade-tile.py'), K = join(LONDAT_DIR, 'kgx');
const sha = b => createHash('sha256').update(b).digest('hex');
const flow = new Flow(K);
const eh = JSON.parse(readFileSync(join(K, 'external-heads.json'), 'utf8')), iriOf = e => typeof e === 'string' ? e : e.iri;
const tileSets = Object.keys(eh).filter(n => n.startsWith('facade-tiles-')).sort().map(n => flow.versions.get(iriOf(eh[n])));
const keysV = flow.versions.get(iriOf(eh['model-building-keys']));
if (!keysV || tileSets.some(v => !v)) throw new Error('model-building-keys or a facade-tiles head is not in the log: run key-model-buildings.mjs and contrib-photos.mjs first');
const ID = KG + 'id/', V = KG + 'vocab#', S = 'https://schema.org/', T = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
// N-Quads lines of a version -> [s, p, o-value, isIri]
const triples = v => flow.read(v).split('\n').map(l => l.match(/^<([^>]+)> <([^>]+)> (?:<([^>]+)>|("(?:[^"\\]|\\.)*")(?:\^\^<[^>]+>)?) /)).filter(Boolean)
  .map(m => [m[1], m[2], m[3] ?? JSON.parse(m[4]), !!m[3]]);
const tiles = [];
for (const v of tileSets) {
  const by = new Map(), get = s => by.get(s) || by.set(s, { s }).get(s);
  for (const [s, p, o] of triples(v)) { const n = get(s); (n[p] ||= []).push(o); }
  for (const n of by.values()) if ((n[T] || []).includes(V + 'FacadeTile')) tiles.push({ iri: n.s, file: n[V + 'file'][0], w: +n[V + 'widthMetres'][0], h: +n[V + 'heightMetres'][0],
    what: n[S + 'name'][0], licence: n[S + 'license'][0], page: n[V + 'page'][0], method: n[V + 'method'][0],
    placements: (n[V + 'placement'] || []).map(r => ({ building: by.get(r)[V + 'building'][0], at: by.get(r)[V + 'at'][0].split(' ').map(Number) })) });
}
tiles.sort((a, b) => a.iri.localeCompare(b.iri));
const inputs = [flow.file(join(TEX, 'facades-registry.jpg'), 'cwplans/docklands/data/tex/facades-registry.jpg'), flow.file(join(TEX, 'facades-registry.json'), 'cwplans/docklands/data/tex/facades-registry.json'),
  flow.file(AREA, 'cwplans/docklands/data/area.js'), flow.file(TOOL, 'cwplans/tools/facade-tile.py'), keysV, ...tileSets,
  ...tiles.map(t => flow.file(join(LONDAT_DIR, t.file), 'danbri/londat ' + t.file))];
const op = { id: 'compose-facade-atlas', version: 1, skill: 'docklands-3d-page', tool: 'cwplans/tools/compose-facade-atlas.mjs (facade-tile.py)',
  about: 'registry facade atlas + contributed tile sets + model building keys -> the page atlas: contributed tiles in the next slots, keyed by OSM id with model indices and a point' };

const v = (await flow.run(op, inputs, {}, async () => {
  const reg = JSON.parse(readFileSync(join(TEX, 'facades-registry.json'), 'utf8'));
  const first = Math.max(...Object.values(reg.buildings).map(b => b.slot)) + 1;
  if (first + tiles.length > 32) throw new Error(`${first + tiles.length} slots needed, the atlas and the shader hold 32 (skill docklands-3d-page, "Building keys": what to do past 32)`);
  // model indices of each OSM building: its own, and those of its parts
  const mi = new Map(), add = (k, i) => (mi.get(k) || mi.set(k, []).get(k)).push(i), partOf = [];
  for (const [s, p, o] of triples(keysV)) { if (p === V + 'modelIndex') add(s, +o); else if (p === V + 'partOf') partOf.push([s, o]); }
  for (const [part, parent] of partOf) for (const i of mi.get(part) || []) add(parent, i);
  const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(AREA, 'utf8'), ctx); const A = ctx.DOCKLANDS_AREA;
  const model_fp = `${A.buildings.length}:${Array.from(A.buildings[0].p.slice(0, 6)).join('.')}:${Array.from(A.buildings.at(-1).p.slice(0, 6)).join('.')}`;
  const out = { ...reg.buildings }, q = [], N = F.namedNode, lit = (x, dt) => F.literal(String(x), dt ? N('http://www.w3.org/2001/XMLSchema#' + dt) : undefined);
  const addQ = (s, p, o) => q.push(F.quad(N(s), N(p), o, F.defaultGraph()));
  const atlas = `${ID}facade-atlas/docklands`;
  tiles.forEach((t, k) => {
    const slot = first + k; t.slot = slot;
    addQ(t.iri, V + 'atlasSlot', lit(slot, 'integer')); addQ(t.iri, V + 'inAtlas', N(atlas));
    for (const pl of t.placements) {
      const key = 'osm:' + pl.building.split('/osm-')[1], idx = mi.get(pl.building) || [];
      if (!idx.length) throw new Error(`${pl.building} has no model building in model-building-keys`);
      out[key] = { slot, w_m: t.w, h_m: t.h, at: pl.at, mi: idx.sort((a, b) => a - b), model_fp, method: t.method, what: t.what, licence: t.licence, page: t.page, tile: `${t.page.replace('/tree/main/', '/blob/main/')}/tiles/${t.file.split('/').pop()}` };
      addQ(pl.building, V + 'facadeSlot', lit(slot, 'integer'));
    }
  });
  const sets = [...new Set(tiles.map(t => t.page))];
  const attribution = `${reg.attribution}; contributed photos, CC0 (${sets.map(p => p.split('/').pop()).join(', ')}): ${[...new Set(tiles.map(t => t.what))].join('; ')}`;
  execFileSync(PY, [TOOL, 'compose', JSON.stringify({ base: join(TEX, 'facades-registry.jpg'), tiles: tiles.map(t => [t.slot, join(LONDAT_DIR, t.file)]) }), join(TEX, 'facades.jpg')]);
  writeFileSync(join(TEX, 'facades.json'), JSON.stringify({ built: reg.built, composed: 'tools/compose-facade-atlas.mjs (operation compose-facade-atlas)', tile_px: 256, cols: 8, rows: 4,
    about: `${reg.about}. Slots ${first} and on: tiles from contributed photos (CC0), keyed by OSM id ("osm:w<id>"), with the model indices of this area.js (mi, valid while model_fp matches the page's) and a WGS84 point inside the building (at) for a rebuilt model.`,
    attribution, licences: tiles.length ? 'CC BY, CC0' : 'CC BY', model: { fp: model_fp, sha256: sha(readFileSync(AREA)) }, buildings: out }, null, 1) + '\n');
  addQ(atlas, V + 'sha256', lit(sha(readFileSync(join(TEX, 'facades.jpg'))))); addQ(atlas, V + 'file', lit('cwplans/docklands/data/tex/facades.jpg'));
  addQ(atlas, V + 'slotsUsed', lit(first + tiles.length, 'integer')); addQ(atlas, V + 'slotsMax', lit(32, 'integer'));
  return { 'facade-atlas': { quads: q, about: { title: `The 3D page's facade atlas: ${first} registry tower tiles and ${tiles.length} contributed tiles, slot by slot`, licence: 'CC BY (registry tiles, see facades.json attribution) and CC0 (contributed tiles)' } } };
}))['facade-atlas'];
eh['facade-atlas'] = v.iri; writeFileSync(join(K, 'external-heads.json'), JSON.stringify(eh, null, 1) + '\n');
console.log(JSON.stringify({ version: v.iri, triples: v.triples, tiles: tiles.length, new: flow.ran.length }));
