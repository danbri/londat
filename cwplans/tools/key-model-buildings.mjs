// Give every building of the 3D model (docklands/data/area.js) its OpenStreetMap key, as one logged operation
// (kgx-ops Flow; log in londat kgx/log):
//   key-model-buildings: area.js + data/raw/docklands/osm-clip.json.gz (the clip area.js was built from) + the Greater
//     London extract it was cut from (tags: the clip keeps no addresses) + atlas/data/atlas.json (all by SHA-256)
//     -> graph version `model-building-keys`: per OSM building or part in the model, its model indices, the OSM way or
//        relation, the parent building of a part, the registry building (cwb-) when the atlas names one, and the OSM
//        name, house name, address, building type, levels and Wikidata item.
// The page file docklands/data/building-keys.json is a projection of that version (written on every run, so it can be
// remade from the log): index-aligned OSM ids for this area.js (with its SHA-256) and the OSM facts by id.
// Exact: each OSM outline is put through the build's own steps (build-docklands.mjs: polysOf, toRings, poly) and the
// encoded outline is compared; the build's order (outlines, then parts) aligns the duplicates.
//   node --max-old-space-size=6000 cwplans/tools/key-model-buildings.mjs
// Skills: docklands-3d-page ("Building keys"), cwplans-dataflow.
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import { join } from 'path';
import vm from 'vm';
import { dataFactory as F } from '@factoidal/core';
import { TOOLS, bngProjector, clipRing, simplify, polyArea, poly, joinRings } from './lib.mjs';
import { DIR, BOX_BNG, ORIGIN } from './fetch-docklands.mjs';
import { LONDAT_DIR } from './londat.mjs';
import { Flow } from './kgx-ops.mjs';
import { kid, osmKeyOf, VOCAB } from './kgx-ids.mjs';

const CW = join(TOOLS, '..'), AREA = join(CW, 'docklands', 'data', 'area.js'), CLIP = join(DIR, 'osm-clip.json.gz');
const ATLAS = join(CW, 'atlas', 'data', 'atlas.json'), OUT = join(CW, 'docklands', 'data', 'building-keys.json'), PBF = join(DIR, 'greater_london-latest.osm.pbf');
const sha = b => createHash('sha256').update(b).digest('hex');

const flow = new Flow(join(LONDAT_DIR, 'kgx'));
const inputs = [flow.file(AREA, 'cwplans/docklands/data/area.js'), flow.file(CLIP, 'cwplans/data/raw/docklands/osm-clip.json.gz (local, not committed: OSM clip of the openstreetmap.fr Greater London extract)'),
  flow.file(PBF, 'cwplans/data/raw/docklands/greater_london-latest.osm.pbf (local, not committed: the openstreetmap.fr Greater London extract, data of 2026-10-01, ODbL)'), flow.file(ATLAS, 'cwplans/atlas/data/atlas.json')];
const op = { id: 'key-model-buildings', version: 4, skill: 'docklands-3d-page', tool: 'cwplans/tools/key-model-buildings.mjs',
  about: 'area.js buildings + the OSM clip they were built from + the atlas -> the OSM way or relation of every model building (exact outline match, aligned in build order), part parents, registry links and OSM name, address, type, levels, Wikidata' };

const v = (await flow.run(op, inputs, {}, async () => {
  const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(AREA, 'utf8'), ctx);
  const A = ctx.DOCKLANDS_AREA, areaSha = sha(readFileSync(AREA));
  // ---- the build's own geometry (build-docklands.mjs, same order and rules; heights are not needed)
  const { E0, N0 } = ORIGIN, B = { x0: BOX_BNG.e0 - E0, x1: BOX_BNG.e1 - E0, z0: -(BOX_BNG.n1 - N0), z1: -(BOX_BNG.n0 - N0) };
  const inside = (x, z, m = 0) => x >= B.x0 + m && x <= B.x1 - m && z >= B.z0 + m && z <= B.z1 - m;
  const toBNG = await bngProjector(), toLocal = (lon, lat) => { const [e, n] = toBNG(lon, lat); return [e - E0, -(n - N0)]; };
  const [fa, fb] = [toLocal(-0.0300, 51.5100), toLocal(-0.0050, 51.4980)], inFocus = (x, z) => x >= fa[0] && x <= fb[0] && z >= fa[1] && z <= fb[1];
  const osm = JSON.parse(gunzipSync(readFileSync(CLIP))), ways = new Map(osm.ways.map(w => [w.id, w])), rels = osm.rels;
  const xzC = new Map(), xz = id => { let p = xzC.get(id); if (!p) { const c = osm.nodes[id]; if (!c) return null; p = toLocal(c[0], c[1]); xzC.set(id, p); } return p; };
  function polysOf(el) {
    if (el.type === 'way' || el.refs) return el.refs[0] === el.refs.at(-1) ? [[el.refs]] : [];
    const mem = role => el.members.filter(m => m.type === 'way' && (role === 'inner' ? m.role === 'inner' : m.role !== 'inner')).map(m => ways.get(m.ref)?.refs);
    const outers = joinRings(mem('outer')), inners = joinRings(mem('inner')) || [];
    if (!outers) return [];
    return outers.map(o => [o, ...inners.filter(h => h.length && xz(h[0]) && outers.length === 1)]);
  }
  const toRings = (idRings, tol) => { const rings = idRings.map(r => r.map(xz)).filter(r => r.every(Boolean)).map(r => clipRing(simplify(r, tol), B)).filter(r => r && r.length >= 3); return rings.length && Math.abs(polyArea(rings[0])) > 1 ? rings : null; };
  const centroid = r => r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]);
  const outlines = [], parts = [];
  for (const el of [...ways.values(), ...rels.map(r => ({ ...r, type: 'relation' }))]) {
    const t = el.tags; if (!t) continue;
    const isPart = !!t['building:part'] && t['building:part'] !== 'no', isB = !!t.building && t.building !== 'no' && !isPart;
    if (!isPart && !isB) continue;
    for (const idRings of polysOf(el)) {
      const c0 = xz(idRings[0][0]); if (!c0) continue;
      const focus = inFocus(c0[0], c0[1]), rings = toRings(idRings, focus ? .2 : .6); if (!rings) continue;
      const area = Math.abs(polyArea(rings[0])), c = centroid(rings[0]);
      if (!inside(c[0], c[1], 1)) continue;
      if (!focus && isB && area < 12) continue;
      (isPart ? parts : outlines).push({ el, t, rings, c });
    }
  }
  const grid = new Map(), cellKey = (x, z) => `${Math.floor(x / 100)},${Math.floor(z / 100)}`;
  outlines.forEach((o, i) => { const xs = o.rings[0].map(p => p[0]), zs = o.rings[0].map(p => p[1]);
    for (let gx = Math.floor(Math.min(...xs) / 100); gx <= Math.floor(Math.max(...xs) / 100); gx++) for (let gz = Math.floor(Math.min(...zs) / 100); gz <= Math.floor(Math.max(...zs) / 100); gz++) { const k = `${gx},${gz}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); } });
  const pir = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  for (const p of parts) for (const i of grid.get(cellKey(p.c[0], p.c[1])) || []) { const o = outlines[i]; if (pir(p.c, o.rings[0])) { o.hasParts = true; p.parent = o; } }
  // ---- the build's sequence (before its height filter) aligned with the model list
  const key = m => JSON.stringify([m.p, m.holes || null]);
  const seq = []; for (const o of [...outlines, ...parts]) { if (o.hasParts) continue; const m = poly(o.rings); if (m) seq.push({ o, k: key(m) }); }
  const keyOf = new Array(A.buildings.length); let j = 0, skipped = 0;
  A.buildings.forEach((b, i) => { const k = key(b); while (j < seq.length && seq[j].k !== k) { j++; skipped++; } if (j < seq.length) keyOf[i] = seq[j++].o; });
  const missing = keyOf.filter(x => !x).length;
  if (missing) throw new Error(`${missing} model buildings not aligned with the OSM clip: the clip is not the one area.js was built from`);
  // ---- tags of the matched elements from the full extract (osmium getid, no members; OPL text, %hex% escapes)
  const want = new Map(); for (const o of keyOf) { want.set(o.el, o.t); if (o.parent) want.set(o.parent.el, o.parent.t); }
  const tmp = mkdtempSync(join(tmpdir(), 'keys-')); writeFileSync(join(tmp, 'ids'), [...want.keys()].map(el => (el.type === 'relation' ? 'r' : 'w') + el.id).join('\n') + '\n');
  const opl = execFileSync('osmium', ['getid', PBF, '-i', join(tmp, 'ids'), '-f', 'opl', '-o', '-'], { maxBuffer: 1 << 30 }).toString(); rmSync(tmp, { recursive: true });
  const dec = s => s.replace(/%([0-9a-f]+)%/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  const full = new Map(); for (const line of opl.split('\n')) { const m = line.match(/^([wr])(\d+) .*? T(\S*)/); if (!m) continue;
    full.set(m[1] + m[2], Object.fromEntries(m[3] ? m[3].split(',').map(kv => { const i = kv.indexOf('='); return [dec(kv.slice(0, i)), dec(kv.slice(i + 1))]; }) : [])); }
  const tagsOf = (el, t) => full.get((el.type === 'relation' ? 'r' : 'w') + el.id) || t;
  // ---- registry links from the atlas (model index -> cwb id)
  const reg = new Map(); for (const b of JSON.parse(readFileSync(ATLAS, 'utf8')).buildings) for (const mi of b.mi || []) reg.set(mi, b.id);
  // ---- the graph
  const V = VOCAB, S = 'https://schema.org/', XSD = 'http://www.w3.org/2001/XMLSchema#', T = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  const N = F.namedNode, q = [], add = (s, p, o) => { if (o != null && o !== '') q.push(F.quad(N(s), N(p), typeof o === 'string' ? N(o) : o, F.defaultGraph())); };
  const lit = (v, dt) => v == null || v === '' ? null : F.literal(String(v), dt ? N(XSD + dt) : undefined);
  // IDs (kgx-ids.mjs): https://kgx.foaf.tv/id/osmw<id> or osmr<id>, the model model<name><sha16>, registry buildings cwb<n>
  const osmKey = el => (el.type === 'relation' ? 'r' : 'w') + el.id, iriOf = el => kid('building', `osm-${osmKey(el)}`);
  const model = kid('model', 'docklands-area', areaSha.slice(0, 16));
  // one node for the model version; per OSM element: its OSM page, the model indices, and facts only where OSM has them
  // (no rdf:type, no building=yes: they would add 85,000 triples that say nothing)
  add(model, V + 'sha256', lit(areaSha)); add(model, V + 'file', lit('cwplans/docklands/data/area.js')); add(model, V + 'buildingCount', lit(A.buildings.length, 'integer'));
  const done = new Set(), facts = (s, el, t) => {
    add(s, S + 'sameAs', `https://www.openstreetmap.org/${el.type}/${el.id}`);
    add(s, S + 'name', lit(t.name)); add(s, V + 'houseName', lit(t['addr:housename']));
    add(s, S + 'streetAddress', lit([t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '))); add(s, S + 'postalCode', lit(t['addr:postcode']));
    const b = t['building:part'] && t['building:part'] !== 'no' ? 'part:' + t['building:part'] : t.building; if (b && b !== 'yes' && b !== 'part:yes') add(s, V + 'osmBuilding', lit(b));
    add(s, V + 'levels', lit(t['building:levels'])); if (/^Q\d+$/.test(t.wikidata || '')) add(s, S + 'sameAs', 'http://www.wikidata.org/entity/' + t.wikidata); };
  keyOf.forEach((o, i) => {
    const s = iriOf(o.el); add(s, V + 'modelIndex', lit(i, 'integer')); if (reg.has(i)) add(s, V + 'registryBuilding', kid('building', reg.get(i)));
    if (done.has(s)) return; done.add(s); facts(s, o.el, tagsOf(o.el, o.t)); if (o.parent) add(s, V + 'partOf', iriOf(o.parent.el));
  });
  for (const o of new Set(keyOf.map(o => o.parent).filter(Boolean))) { const s = iriOf(o.el); if (!done.has(s)) { done.add(s); facts(s, o.el, tagsOf(o.el, o.t)); } }
  console.error(`aligned ${A.buildings.length} model buildings; ${skipped} build outlines not in the model (its height filter); ${done.size} OSM elements, ${full.size} with tags from the extract; ${reg.size} model buildings in the registry`);
  return { 'model-building-keys': { quads: q, about: { title: `OpenStreetMap keys of the ${A.buildings.length} buildings of the 3D model (area.js ${areaSha.slice(0, 16)}): OSM way or relation, part parents, registry links, OSM names and addresses`, licence: '© OpenStreetMap contributors, ODbL 1.0', osm: true } } };
}))['model-building-keys'];

// ---- projection for the page: index-aligned ids for this area.js, OSM facts by id. fp is the page's own cheap check
// that its area.js is the one the ids are for (count, first and last outline); docklands/index.html MFP is the same.
const areaSha = sha(readFileSync(AREA)), actx = {}; vm.createContext(actx); vm.runInContext(readFileSync(AREA, 'utf8'), actx);
const modelFp = A => `${A.buildings.length}:${Array.from(A.buildings[0].p.slice(0, 6)).join('.')}:${Array.from(A.buildings.at(-1).p.slice(0, 6)).join('.')}`;
const fp = modelFp(actx.DOCKLANDS_AREA);
const ids = [], info = {}, V = VOCAB, S = 'https://schema.org/';
const facts = new Map(), get = s => facts.get(s) || facts.set(s, {}).get(s);
for (const line of flow.read(v).split('\n')) {
  const m = line.match(/^<([^>]+)> <([^>]+)> (<[^>]*>|"(?:[^"\\]|\\.)*"(?:\^\^<[^>]+>)?) /); if (!m) continue;
  const [, s, p, o] = m, val = o[0] === '<' ? o.slice(1, -1) : JSON.parse(o.replace(/\^\^<[^>]+>$/, '')), f = get(s);
  if (p === V + 'modelIndex') ids[+val] = osmKeyOf(s);
  else if (p === S + 'name') f.n = val; else if (p === V + 'houseName') f.h = val; else if (p === S + 'streetAddress') f.a = val; else if (p === S + 'postalCode') f.pc = val;
  else if (p === V + 'osmBuilding') f.b = val; else if (p === V + 'levels') f.l = val; else if (p === V + 'partOf') f.p = osmKeyOf(val);
  else if (p === S + 'sameAs' && val.includes('wikidata.org')) f.wd = val.split('/').pop();
}
for (const [s, f] of facts) { const k = osmKeyOf(s); if (k && Object.keys(f).length) info[k] = f; }
writeFileSync(OUT, JSON.stringify({ about: 'OpenStreetMap key of every building of the 3D model: ids[i] is the OSM way (w) or relation (r) of area.js building i; osm[id] holds its OSM facts where OSM has them: n name, h addr:housename, a house number and street, pc postcode, b building type other than yes (part:<type> for a building:part), l building:levels, wd Wikidata item, p the parent building of a part. Made by tools/key-model-buildings.mjs (operation key-model-buildings).',
  model: { file: 'data/area.js', sha256: areaSha, fp }, graph: v.iri, licence: '© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)',
  ids: ids.join(','), osm: info }) + '\n');
const ehF = join(LONDAT_DIR, 'kgx', 'external-heads.json'), eh = existsSync(ehF) ? JSON.parse(readFileSync(ehF, 'utf8')) : {};
// a head and in meta, but not in the browser store (183,000 triples)
eh['model-building-keys'] = { iri: v.iri, store: false }; writeFileSync(ehF, JSON.stringify(eh, null, 1) + '\n');
console.log(JSON.stringify({ version: v.iri, triples: v.triples, ids: ids.length, with_facts: Object.keys(info).length, bytes: readFileSync(OUT).length, new: flow.ran.length }));
