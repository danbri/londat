#!/usr/bin/env node
// A species profile for every tree of docklands/data/trees.json (crown shape, colours, leaf calendar of the Three.js
// port, docklands/tree-species.js), and how it was found: from the tree's own taxon, from its OSM leaf_type /
// leaf_cycle, or inferred from its setting (street, park, wood, waterside) when the sources give no taxon.
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/build-tree-species.mjs fetch   # OSM leaf tags of natural=tree in the box (Overpass, one request)
//   node cwplans/tools/build-tree-species.mjs fetch --from answer.json      # the same from a saved Overpass answer (out:json, out tags)
//   node cwplans/tools/build-tree-species.mjs                             # builds docklands/data/tree-species.json (no network, a few seconds)
// in:  docklands/data/trees.json (build-trees.mjs), docklands/data/area.js (water polygons), data/raw/trees/osm-tree-leaf.json.gz (fetch)
// out: docklands/data/tree-species.json: one letter per tree in the order of trees.json (p: profile, b: basis), with the
//      SHA-256 of each input; a pure function of the inputs and the parameters below (no clock, no network).
// Taxon table, mixes and calendars: docklands/tree-species.js. Skill: docklands-3d-page, "Three.js port" (Trees);
// sources and licences: data-register.json, docklands-data-curation "Trees and facades".
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import { join, relative } from 'path';
import vm from 'vm';
import { RAW, TOOLS, UA } from './lib.mjs';
import { BOX_WGS84 } from './fetch-docklands.mjs';
import { PROFILES, PROFILE, MIXES, BASIS, B64, profileOf, pickMix, hash01 } from '../../docklands/tree-species.js';

const ROOT = join(TOOLS, '..');
const IN = { trees: join(ROOT, 'docklands', 'data', 'trees.json'), area: join(ROOT, 'docklands', 'data', 'area.js'), leaf: join(RAW, 'trees', 'osm-tree-leaf.json.gz') };
const OUT = join(ROOT, 'docklands', 'data', 'tree-species.json');
const PARAMS = { waterM: 15, waterCell: 5, mixes: MIXES };
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

// ---------------------------------------------------------------- fetch: OSM leaf_type / leaf_cycle (ODbL), ids and those two tags only
if (process.argv[2] === 'fetch') {
  const [W, S, E, N] = BOX_WGS84, q = `[out:json][timeout:180];node["natural"="tree"](${S},${W},${N},${E});out tags;`;
  let d = process.argv[3] === '--from' ? JSON.parse(readFileSync(process.argv[4])) : null;   // --from <file>: a saved Overpass answer to this query
  for (let round = 0; round < 3 && !d; round++) for (const u of OVERPASS) {
    try { const r = await fetch(u, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
      if (r.ok) { d = await r.json(); console.log('from', u); break; } console.log(r.status, u); } catch (e) { console.log(e.message, u); }
    await new Promise(r => setTimeout(r, 2000));
  }
  if (!d) throw new Error('no Overpass server answered');
  const leaf = d.elements.filter(e => e.tags.leaf_type || e.tags.leaf_cycle).map(e => [e.id, e.tags.leaf_type || null, e.tags.leaf_cycle || null]);
  mkdirSync(join(RAW, 'trees'), { recursive: true });
  writeFileSync(IN.leaf, gzipSync(JSON.stringify({ fetched: d.osm3s.timestamp_osm_base, query: q, licence: 'ODbL 1.0, © OpenStreetMap contributors', format: '[node id, leaf_type, leaf_cycle]', trees_in_box: d.elements.length, leaf })));
  console.log(`wrote ${relative(ROOT, IN.leaf)}: ${leaf.length} of ${d.elements.length} natural=tree nodes with leaf_type or leaf_cycle (OSM ${d.osm3s.timestamp_osm_base})`);
  process.exit(0);
}

// ---------------------------------------------------------------- build
const bytes = {}; for (const k in IN) if (existsSync(IN[k])) bytes[k] = readFileSync(IN[k]);
const sha = b => createHash('sha256').update(b).digest('hex');
const T = JSON.parse(bytes.trees);
const ctx = {}; vm.runInNewContext(bytes.area.toString(), { globalThis: ctx }); const A = ctx.DOCKLANDS_AREA;
const leafOf = new Map((bytes.leaf ? JSON.parse(gunzipSync(bytes.leaf)).leaf : []).map(([id, t, c]) => [id, [t, c]]));

// water raster: cells inside any water polygon (A.water, delta-coded tenths of a metre, holes after the outer ring)
const dec = q => { const o = new Float64Array(q.length); let a = 0, b = 0; for (let i = 0; i < q.length; i += 2) { a += q[i]; b += q[i + 1]; o[i] = a / 10; o[i + 1] = b / 10; } return o; };
const E = A.meta.extent, C = PARAMS.waterCell, NX = Math.ceil((E.x1 - E.x0) / C), NZ = Math.ceil((E.z1 - E.z0) / C), wet = new Uint8Array(NX * NZ);
for (const w of A.water) {
  const f = dec(w.p), st = [0, ...(w.holes || []), f.length / 2];
  for (let j = 0; j < NZ; j++) {
    const z = E.z0 + (j + .5) * C, xs = [];
    for (let r = 0; r + 1 < st.length; r++) for (let a = st[r], b = st[r + 1] - 1, k = a; k < st[r + 1]; b = k++) {
      const z1 = f[2 * k + 1], z2 = f[2 * b + 1]; if ((z1 > z) !== (z2 > z)) xs.push(f[2 * k] + (z - z1) / (z2 - z1) * (f[2 * b] - f[2 * k]));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) for (let i = Math.max(0, Math.ceil((xs[q] - E.x0) / C - .5)); i < NX && E.x0 + (i + .5) * C <= xs[q + 1]; i++) wet[j * NX + i] = 1;
  }
}
const R = Math.ceil(PARAMS.waterM / C);
function nearWater(x, z) {
  const i0 = Math.floor((x - E.x0) / C), j0 = Math.floor((z - E.z0) / C);
  for (let j = j0 - R; j <= j0 + R; j++) for (let i = i0 - R; i <= i0 + R; i++) {
    if (i < 0 || j < 0 || i >= NX || j >= NZ || !wet[j * NX + i]) continue;
    if (Math.hypot(E.x0 + (i + .5) * C - x, E.z0 + (j + .5) * C - z) <= PARAMS.waterM) return true;
  }
  return false;
}
// greens: a 100 m grid of bounding boxes; even-odd over the outer ring and its holes
const G = 100, gidx = new Map();
const greens = T.greens.map(g => { const rings = [g.ring, ...(g.holes || [])]; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < g.ring.length; i += 2) { x0 = Math.min(x0, g.ring[i]); x1 = Math.max(x1, g.ring[i]); z0 = Math.min(z0, g.ring[i + 1]); z1 = Math.max(z1, g.ring[i + 1]); }
  return { rings, x0, x1, z0, z1, wood: /wood|forest|scrub|^tow:/.test(g.kind) }; });
greens.forEach((g, k) => { for (let a = Math.floor(g.x0 / G); a <= Math.floor(g.x1 / G); a++) for (let b = Math.floor(g.z0 / G); b <= Math.floor(g.z1 / G); b++) { const key = a + ',' + b; if (!gidx.has(key)) gidx.set(key, []); gidx.get(key).push(k); } });
const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
function greenAt(x, z) {   // 'wood' | 'park' | null
  let park = false;
  for (const k of gidx.get(Math.floor(x / G) + ',' + Math.floor(z / G)) || []) {
    const g = greens[k]; if (x < g.x0 || x > g.x1 || z < g.z0 || z > g.z1) continue;
    let c = false; for (const r of g.rings) if (inRing(x, z, r)) c = !c;
    if (c) { if (g.wood) return 'wood'; park = true; }
  }
  return park ? 'park' : null;
}

// species table -> profile, with basis S (species) or G (genus, family or a vague name)
const spProf = T.species.map(([sci, com]) => {
  const id = profileOf(sci, com); if (!id) return null;
  const words = String(sci || '').trim().split(/\s+/).filter(Boolean);
  const vague = !sci || words.length < 2 || /aceae|ales$|\bspp?\b|species|\bagg\b/i.test(sci) || /species|a flowering plant/i.test(com || '');
  return [PROFILE[id], vague ? 'G' : 'S'];
});
const SRC = T.sources.map(s => s.key);
const p = [], b = [], counts = { byBasis: {}, byProfile: {}, bySource: {}, osmLeafTagsUsed: 0 };
T.trees.forEach(([x, z, , , si, so], k) => {
  const id = T.ids[k]; let prof, basis;
  const known = si >= 0 ? spProf[si] : null;
  if (known) [prof, basis] = known;
  else {
    const water = nearWater(x, z), green = greenAt(x, z), osm = /^osm:n(\d+)$/.exec(id), leaf = osm && leafOf.get(+osm[1]);
    const setting = water ? 'water' : green === 'wood' ? 'wood' : green === 'park' || SRC[so] === 'fr-tow' ? 'park' : 'street';
    basis = { water: 'R', wood: 'W', park: 'P', street: 'T' }[setting];
    let pid = pickMix(MIXES[setting], hash01(id));
    if (leaf) {
      const [lt, lc] = leaf;
      if (lt === 'needleleaved') pid = lc === 'deciduous' ? 'conifer-deciduous' : 'conifer';
      else if (lt === 'palm') pid = 'palm';
      else if (lc === 'evergreen' || lc === 'semi_evergreen') pid = 'evergreen';
      basis = 'L'; counts.osmLeafTagsUsed++;
    }
    prof = PROFILE[pid];
  }
  p.push(B64[prof]); b.push(basis);
  counts.byBasis[basis] = (counts.byBasis[basis] || 0) + 1;
  counts.byProfile[PROFILES[prof].id] = (counts.byProfile[PROFILES[prof].id] || 0) + 1;
  const sk = SRC[so] + ':' + basis; counts.bySource[sk] = (counts.bySource[sk] || 0) + 1;
});
counts.byProfile = Object.fromEntries(Object.entries(counts.byProfile).sort((a, c) => c[1] - a[1]));
const out = {
  about: 'A species profile for each tree of trees.json (same order; check n and the trees.json SHA-256), for the crowns, colours and leaf calendar of the Three.js port. Built by tools/build-tree-species.mjs; profiles, taxon rules and setting mixes: docklands/tree-species.js. Basis letters other than S and G are INFERRED, not data.',
  inputs: Object.entries(IN).filter(([k]) => bytes[k]).map(([k, f]) => ({ name: k, path: relative(ROOT, f), sha256: sha(bytes[k]), bytes: bytes[k].length })),
  params: { waterM: PARAMS.waterM, waterCell: PARAMS.waterCell },
  n: T.trees.length,
  profiles: PROFILES.map(q => q.id),
  basis: BASIS,
  format: { p: 'one letter per tree: index into profiles in base 64 (A-Z a-z 0-9 + /)', b: 'one letter per tree: a key of basis' },
  counts, p: p.join(''), b: b.join(''),
};
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${relative(ROOT, OUT)}: ${p.length} trees`, JSON.stringify(counts));
