#!/usr/bin/env node
// Water and trees of a place on the globe (the core of a place built by build-place-tiles.mjs), so the globe draws them as
// the Docklands model does: water polygons with the model's water look (globe/place-look.js) and trees as the model's
// tree system (instanced crowns by species profile, the same level-of-detail rule). Owner, 2026-10-22: "why do Leon and
// Sarajevo look so different to London?" (skill docklands-3d-page, "Three.js port: places look like the model").
//
//   node cwplans/tools/build-place-greens.mjs --region leon            fetch what is missing, then build
//   node cwplans/tools/build-place-greens.mjs fetch --region leon [--refetch]
//   node cwplans/tools/build-place-greens.mjs build --region leon [--force]
//
// Fetch: the OSM API 0.6 /map.json over the place's core area (index.json `area`; split in four on 400 "too many nodes",
// 1 s apart), then /relation/<id>/full for each water, wood or park multipolygon that has a member way outside the area
// (at most MAX_REL, 1 s apart), so its rings close. Raw answers: cwplans/data/raw/places/<id>/greens/ (git-ignored),
// fetch-log.json with the SHA-256 of each answer. Overpass was down when this was written (2026-10-18 to 2026-10-21).
// Operation place-greens (dataflow, skill cwplans-dataflow): pure over the raw answers (by SHA-256) and the parameters
// (the region's `place.greens` block and the stated defaults below) -> places/<id>/greens/greens.json; the activity is
// logged in places/<id>/greens/log.json (activity id = sha256 of [operation, version, input hashes, parameters]); a run
// with the same inputs writes nothing. README.md of the folder made from the log. places/greens.json lists the places
// that have the file (the reader asks for it once, so a place without greens costs no 404).
// What is made:
//  - water: OSM natural=water (any water=*), waterway=riverbank, landuse=reservoir and basin, as closed rings (ways and
//    multipolygon relations, outer and inner), clipped to the area;
//  - trees: OSM natural=tree nodes (with height, crown diameter, genus, species, taxon, leaf_type when tagged),
//    natural=tree_row ways (a tree every ROW_M along), and trees placed by a rule in natural=wood and landuse=forest
//    (every WOOD_M on a jittered grid) and in parks and gardens (leisure=park, garden; not grass or meadow) that have no
//    mapped tree inside (every PARK_M); placed
//    trees are counted apart (basis "rule": positions illustrative, not data), never inside a building or water.
//  - the species profile of each tree (docklands/tree-species.js): its taxon (profileOf), else its leaf type, else the
//    region's mix for its setting (street, park, wood, water side), drawn by a stable hash of its id (as the model's
//    trees: cwplans/tools/build-tree-species.mjs).
// No locale constant here: the mixes come from the region config (place.greens.mix; the model's MIXES otherwise).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import REGIONS from '../../docklands/geo/regions/index.js';
import { profileOf, MIXES, pickMix, hash01, PROFILES } from '../../docklands/tree-species.js';

const UA = 'glitchcan-cwplans/0.1 (https://github.com/danbri/londat)';
const TOOL = 'tools/build-place-greens.mjs';
const CW = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), flag = f => argv.includes(f);
const argOf = k => { const i = argv.findIndex(a => a === '--' + k || a.startsWith('--' + k + '=')); if (i < 0) return null; return argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1]; };
const RID = argOf('region'); if (!RID) { console.error('usage: build-place-greens.mjs [fetch|build] --region <id>'); process.exit(2); }
const REG = REGIONS[RID]; if (!REG || !REG.place) throw new Error(`no region config with a place block: ${RID}`);
const cmd = ['fetch', 'build'].find(c => argv.includes(c)) || 'all';
const PLACES = join(CW, 'docklands', 'data', 'places'), IX = JSON.parse(readFileSync(join(PLACES, 'index.json'), 'utf8'));
const PI = IX.places.find(p => p.id === RID); if (!PI) throw new Error(`place ${RID} is not built (places/index.json): run build-place-tiles.mjs first`);
const AREA = PI.area, RAWD = join(CW, 'data', 'raw', 'places', RID, 'greens'), OUT = join(PLACES, RID, 'greens');
for (const d of [RAWD, OUT]) mkdirSync(d, { recursive: true });
const sha = b => createHash('sha256').update(b).digest('hex');
const rel = p => relative(CW, p);
const jz = (p, o) => writeFileSync(p, gzipSync(JSON.stringify(o)));
const rz = p => JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));
const pause = ms => new Promise(r => setTimeout(r, ms));
const MAX_REL = 30;

// ---------- fetch (network; records the SHA-256 of each answer)
const FLOG = join(RAWD, 'fetch-log.json'), flog = existsSync(FLOG) ? JSON.parse(readFileSync(FLOG, 'utf8')) : {};
const saveFlog = () => writeFileSync(FLOG, JSON.stringify(flog, null, 1));
async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) { const e = new Error(`${r.status} ${url}`); e.status = r.status; throw e; }
  return Buffer.from(await r.arrayBuffer());
}
const isWater = t => t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin';
const isWood = t => t.natural === 'wood' || t.landuse === 'forest';
const isPark = t => ['park', 'garden'].includes(t.leisure) || ['grass', 'village_green', 'recreation_ground', 'meadow'].includes(t.landuse);
const wanted = t => !!t && (isWater(t) || isWood(t) || isPark(t));
async function fetchOsm() {
  const f = join(RAWD, 'osm-map.json.gz');
  if (!existsSync(f) || flag('--refetch')) {
    const els = new Map(), got = [];
    async function box(b, depth) {
      const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${b.map(v => v.toFixed(6)).join(',')}`;
      try { const buf = await get(url), j = JSON.parse(buf.toString('utf8')); got.push({ url, bytes: buf.length, sha256: sha(buf) }); for (const e of j.elements) els.set(e.type[0] + e.id, e); }
      catch (e) { if (e.status !== 400 || depth > 3) throw e; const mx = (b[0] + b[2]) / 2, my = (b[1] + b[3]) / 2;
        for (const q of [[b[0], b[1], mx, my], [mx, b[1], b[2], my], [b[0], my, mx, b[3]], [mx, my, b[2], b[3]]]) { await pause(1000); await box(q, depth + 1); } }
    }
    await box(AREA, 0);
    const latest = [...els.values()].reduce((m, e) => e.timestamp > m ? e.timestamp : m, '');
    jz(f, { generator: 'OSM API 0.6 map.json', bbox: AREA, elements: [...els.values()] });
    flog.osm = { url: got.map(g => g.url), fetched: new Date().toISOString(), as_fetched: got, elements: els.size, latest_element_timestamp: latest, file: rel(f), sha256: sha(readFileSync(f)), licence: 'ODbL 1.0, © OpenStreetMap contributors' };
    saveFlog(); console.log(`osm: ${els.size} elements in ${got.length} request(s)`);
  }
  // relations whose rings leave the area: their full geometry
  const M = rz(f), have = new Set(M.elements.map(e => e.type[0] + e.id));
  const rels = M.elements.filter(e => e.type === 'relation' && e.tags?.type === 'multipolygon' && wanted(e.tags) && e.members.some(m => m.type === 'way' && !have.has('w' + m.ref)));
  flog.relations ||= {};
  let n = 0;
  for (const r of rels.slice(0, MAX_REL)) {
    const fr = join(RAWD, `relation-${r.id}.json.gz`); if (existsSync(fr) && !flag('--refetch')) continue;
    await pause(1000); const url = `https://api.openstreetmap.org/api/0.6/relation/${r.id}/full.json`;
    try { const buf = await get(url); jz(fr, JSON.parse(buf.toString('utf8'))); flog.relations[r.id] = { url, fetched: new Date().toISOString(), bytes: buf.length, sha256_as_fetched: sha(buf), file: rel(fr), sha256: sha(readFileSync(fr)) }; n++; }
    catch (e) { console.warn(`relation ${r.id}: ${e.message}`); }
  }
  if (rels.length > MAX_REL) console.warn(`${rels.length - MAX_REL} relations over MAX_REL not fetched`);
  saveFlog(); console.log(`relations: ${rels.length} leave the area, ${n} fetched now`);
}

// ---------- geometry helpers (lon/lat degrees; metres by a local equirectangular scale)
const mLat = 110574, mLon = 111320 * Math.cos((AREA[1] + AREA[3]) / 2 * Math.PI / 180);
function ringArea(r) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2 * mLon * mLat; }
function inRing(r, x, y) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
const inPoly = (P, x, y) => inRing(P[0], x, y) && !P.slice(1).some(h => inRing(h, x, y));
// Sutherland-Hodgman against the area rectangle
function clipRect(r, [w, s, e, n]) {
  const edges = [[p => p[0] >= w, (a, b) => { const t = (w - a[0]) / (b[0] - a[0]); return [w, a[1] + t * (b[1] - a[1])]; }], [p => p[0] <= e, (a, b) => { const t = (e - a[0]) / (b[0] - a[0]); return [e, a[1] + t * (b[1] - a[1])]; }],
    [p => p[1] >= s, (a, b) => { const t = (s - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), s]; }], [p => p[1] <= n, (a, b) => { const t = (n - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), n]; }]];
  let out = r;
  for (const [ins, cut] of edges) { const src = out; out = []; for (let i = 0; i < src.length; i++) { const a = src[i], b = src[(i + 1) % src.length], ia = ins(a), ib = ins(b); if (ia) out.push(a); if (ia !== ib) out.push(cut(a, b)); } if (!out.length) break; }
  return out;
}
// ways (lists of node ids) joined end to end into closed rings
function joinRings(ways) {
  const rings = [], left = ways.map(w => w.slice());
  while (left.length) {
    let cur = left.shift(); let grew = true;
    while (cur[0] !== cur[cur.length - 1] && grew) { grew = false;
      for (let i = 0; i < left.length; i++) { const w = left[i], a = cur[cur.length - 1];
        if (w[0] === a) { cur = cur.concat(w.slice(1)); } else if (w[w.length - 1] === a) { cur = cur.concat(w.slice(0, -1).reverse()); } else if (w[w.length - 1] === cur[0]) { cur = w.concat(cur.slice(1)); } else if (w[0] === cur[0]) { cur = w.slice().reverse().concat(cur.slice(1)); } else continue;
        left.splice(i, 1); grew = true; break; } }
    if (cur.length >= 4 && cur[0] === cur[cur.length - 1]) rings.push(cur);
  }
  return rings;
}
const r6 = v => Math.round(v * 1e6) / 1e6, r7 = v => Math.round(v * 1e7) / 1e7;
const num = v => { const m = /^\s*([\d.]+)\s*(m)?\s*$/.exec(String(v ?? '')); return m ? +m[1] : null; };

// ---------- operation place-greens (pure: the raw answers and the parameters -> greens.json)
const OP = { id: 'place-greens', version: 1, skill: 'docklands-3d-page' };
const GP = REG.place.greens || {};
const PARAMS = { area: AREA, row_m: GP.row_m ?? 8, wood_m: GP.wood_m ?? 6.5, park_m: GP.park_m ?? 15, water_side_m: 25, mix: GP.mix || MIXES,
  about: 'trees placed by rule: every wood_m in natural=wood / landuse=forest, every park_m in leisure=park and garden areas with no mapped tree inside (grass and meadow get none), on a grid jittered by a stable hash; never inside a building or water' };
function build(inputs) {
  const M = rz(join(CW, inputs[0].path)), els = new Map();
  for (const e of M.elements) els.set(e.type[0] + e.id, e);
  for (const i of inputs.slice(1)) for (const e of rz(join(CW, i.path)).elements) if (!els.has(e.type[0] + e.id)) els.set(e.type[0] + e.id, e);
  const node = id => els.get('n' + id), ll = ids => { const r = []; for (const id of ids) { const n = node(id); if (!n) return null; r.push([n.lon, n.lat]); } return r; };
  // polygons: closed ways and multipolygon relations
  const polys = [];
  for (const e of els.values()) {
    if (e.type === 'way' && e.tags && e.nodes.length >= 4 && e.nodes[0] === e.nodes[e.nodes.length - 1]) { const r = ll(e.nodes); if (r) polys.push({ id: 'w' + e.id, tags: e.tags, rings: [r.slice(0, -1)] }); }
    if (e.type === 'relation' && e.tags?.type === 'multipolygon') {
      const wl = role => e.members.filter(m => m.type === 'way' && (m.role || 'outer') === role).map(m => els.get('w' + m.ref)?.nodes).filter(Boolean);
      const outer = joinRings(wl('outer')).map(ll).filter(Boolean).map(r => r.slice(0, -1)), inner = joinRings(wl('inner')).map(ll).filter(Boolean).map(r => r.slice(0, -1));
      for (const o of outer) polys.push({ id: 'r' + e.id, tags: e.tags, rings: [o, ...inner.filter(h => inRing(o, h[0][0], h[0][1]))] });
    }
  }
  const box = P => { let w = 180, s = 90, e = -180, n = -90; for (const [x, y] of P.rings[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); } return [w, s, e, n]; };
  const meets = b => !(b[2] < AREA[0] || b[0] > AREA[2] || b[3] < AREA[1] || b[1] > AREA[3]);
  const water = polys.filter(p => isWater(p.tags)).map(p => ({ ...p, b: box(p) })).filter(p => meets(p.b));
  const woods = polys.filter(p => isWood(p.tags)).map(p => ({ ...p, b: box(p) })).filter(p => meets(p.b));
  const parks = polys.filter(p => isPark(p.tags) && !isWood(p.tags)).map(p => ({ ...p, b: box(p) })).filter(p => meets(p.b));
  const blds = polys.filter(p => p.tags.building && p.tags.building !== 'no' || p.tags['building:part']).map(p => ({ ...p, b: box(p) }));
  // a grid of building and water boxes (no tree inside them)
  const G = 0.0005, grid = new Map(), gk = (x, y) => Math.floor(x / G) * 100000 + Math.floor(y / G);
  for (const p of [...blds, ...water]) for (let x = Math.floor(p.b[0] / G); x <= Math.floor(p.b[2] / G); x++) for (let y = Math.floor(p.b[1] / G); y <= Math.floor(p.b[3] / G); y++) { const k = x * 100000 + y; (grid.get(k) || grid.set(k, []).get(k)).push(p); }
  const blocked = (x, y) => (grid.get(gk(x, y)) || []).some(p => x >= p.b[0] && x <= p.b[2] && y >= p.b[1] && y <= p.b[3] && inPoly(p.rings, x, y));
  const inArea = (x, y) => x >= AREA[0] && x <= AREA[2] && y >= AREA[1] && y <= AREA[3];
  const nearWater = (x, y) => { const d = PARAMS.water_side_m; return water.some(p => x >= p.b[0] - d / mLon && x <= p.b[2] + d / mLon && y >= p.b[1] - d / mLat && y <= p.b[3] + d / mLat
    && p.rings[0].some(([a, b]) => Math.hypot((a - x) * mLon, (b - y) * mLat) < d * 2)); };
  // trees
  const trees = [], counts = { osm_tree: 0, osm_tree_row: 0, rule_wood: 0, rule_park: 0, skipped_blocked: 0, by_basis: {}, by_profile: {} };
  const prof = (tags, setting, key) => {
    const sci = tags.species || tags.taxon || tags['species:la'] || tags.genus || '', com = tags['species:en'] || tags['taxon:en'] || '';
    const p = profileOf(sci, com); if (p) return [p, tags.species || tags.taxon ? 'S' : 'G'];
    if (tags.leaf_type === 'needleleaved') return [hash01('n' + key) < 0.6 ? 'pine' : 'conifer', 'L'];
    const mix = PARAMS.mix[setting] || MIXES[setting] || MIXES.park;
    let id = pickMix(mix, hash01(key)); if (tags.leaf_type === 'broadleaved' && PROFILES.find(q => q.id === id)?.ever) id = 'broadleaf';
    return [id, 'M'];
  };
  const add = (x, y, tags, setting, basis, key) => {
    if (!inArea(x, y)) return; if (blocked(x, y)) { counts.skipped_blocked++; return; }
    const st = setting === 'street' && nearWater(x, y) ? 'water' : setting, [p, b] = prof(tags, st, key);
    trees.push([r7(x), r7(y), num(tags.height), num(tags.diameter_crown), p, b, basis, st[0]]);
    counts.by_basis[b] = (counts.by_basis[b] || 0) + 1; counts.by_profile[p] = (counts.by_profile[p] || 0) + 1;
  };
  const parkOf = (x, y) => parks.find(p => x >= p.b[0] && x <= p.b[2] && y >= p.b[1] && y <= p.b[3] && inPoly(p.rings, x, y));
  const mapped = new Set();   // parks with a mapped tree inside
  for (const e of els.values()) if (e.type === 'node' && e.tags?.natural === 'tree') {
    const pk = parkOf(e.lon, e.lat), wd = woods.find(p => inPoly(p.rings, e.lon, e.lat)); if (pk) mapped.add(pk.id);
    const n0 = trees.length; add(e.lon, e.lat, e.tags, wd ? 'wood' : pk ? 'park' : 'street', 'osm-tree', 'n' + e.id); if (trees.length > n0) counts.osm_tree++; }
  for (const e of els.values()) if (e.type === 'way' && e.tags?.natural === 'tree_row') {
    const r = ll(e.nodes); if (!r) continue; let carry = 0;
    for (let i = 0; i + 1 < r.length; i++) { const [a, b] = [r[i], r[i + 1]], L = Math.hypot((b[0] - a[0]) * mLon, (b[1] - a[1]) * mLat);
      for (let s = carry; s < L; s += PARAMS.row_m) { const t = s / L, x = a[0] + t * (b[0] - a[0]), y = a[1] + t * (b[1] - a[1]); const n0 = trees.length; add(x, y, e.tags, parkOf(x, y) ? 'park' : 'street', 'osm-tree-row', `w${e.id}:${i}:${Math.round(s)}`); if (trees.length > n0) counts.osm_tree_row++; }
      carry = (carry - L) % PARAMS.row_m; if (carry < 0) carry += PARAMS.row_m; }
  }
  const fill = (P, step, setting, basis) => {
    const [w, s, e, n] = P.b, dx = step / mLon, dy = step / mLat;
    for (let x = Math.floor(Math.max(w, AREA[0]) / dx) * dx; x <= Math.min(e, AREA[2]); x += dx) for (let y = Math.floor(Math.max(s, AREA[1]) / dy) * dy; y <= Math.min(n, AREA[3]); y += dy) {
      const k = `${P.id}:${Math.round(x / dx)}:${Math.round(y / dy)}`, jx = x + (hash01('x' + k) - 0.5) * dx * 0.8, jy = y + (hash01('y' + k) - 0.5) * dy * 0.8;
      if (!inPoly(P.rings, jx, jy)) continue; const n0 = trees.length; add(jx, jy, P.tags, setting, basis, k); if (trees.length > n0) counts[basis.replace('-', '_')]++; }
  };
  for (const P of woods) fill(P, PARAMS.wood_m, 'wood', 'rule-wood');
  for (const P of parks) if (['park', 'garden'].includes(P.tags.leisure) && !mapped.has(P.id) && !woods.some(W => W.id === P.id)) fill(P, PARAMS.park_m, 'park', 'rule-park');
  // water, clipped to the area
  const W = [];
  for (const p of water) { const rings = p.rings.map(r => clipRect(r, AREA)).filter(r => r.length >= 3); if (!rings.length || Math.abs(ringArea(rings[0])) < 4) continue;
    W.push([p.id, p.tags.water || (p.tags.waterway === 'riverbank' ? 'river' : p.tags.landuse || 'water'), p.tags.name || null, rings.map(r => r.map(([x, y]) => [r6(x), r6(y)]))]); }
  const G2 = [...woods, ...parks].map(p => [p.id, isWood(p.tags) ? 'wood' : p.tags.leisure || p.tags.landuse, p.tags.name || null, Math.round(Math.abs(ringArea(p.rings[0]))), mapped.has(p.id)]);
  const out = { format: 'place-greens-1', place: RID, name: PI.name, area: AREA, tool: TOOL, operation: `${OP.id} v${OP.version}`,
    credit: '© OpenStreetMap contributors (ODbL 1.0); trees in woods and parks without mapped trees placed by a rule (positions illustrative)',
    osm_as_of: M.elements.reduce((m, e) => e.timestamp > m ? e.timestamp : m, ''),
    counts: { water_polygons: W.length, trees: trees.length, ...counts, greens: G2.length },
    trees_fields: ['lon', 'lat', 'height_m', 'crown_m', 'profile', 'basis', 'source', 'setting'],
    trees_about: 'basis: S species or taxon from OSM, G genus, L leaf type, M the region mix for the setting (street, park, wood, water side; a stable hash of the id); source: osm-tree, osm-tree-row (a tree every row_m), rule-wood, rule-park (placed by rule: illustrative)',
    trees, water_fields: ['osm_id', 'kind', 'name', 'rings'], water: W, greens_fields: ['osm_id', 'kind', 'name', 'area_m2', 'mapped_trees'], greens: G2 };
  return out;
}

// ---------- the activity log and the README
const LOGF = join(OUT, 'log.json'), log = existsSync(LOGF) ? JSON.parse(readFileSync(LOGF, 'utf8')) : { about: `Build log of the water and trees of ${PI.name} (${TOOL})`, fetches: {}, activities: [] };
function readme() {
  const a = log.activities.at(-1), g = JSON.parse(readFileSync(join(OUT, 'greens.json'), 'utf8')), GH = 'https://github.com/danbri/londat/blob/main/cwplans/';
  const L = [`# ${PI.name}: water and trees`, '',
    `Made by [cwplans/tools/build-place-greens.mjs](${GH}tools/build-place-greens.mjs) for the region config [docklands/geo/regions/${RID}.js](https://github.com/danbri/londat/blob/main/docklands/geo/regions/${RID}.js); drawn by the globe of the Three.js port ([docklands/globe/place-look.js](https://github.com/danbri/londat/blob/main/docklands/globe/place-look.js)). Generated from \`log.json\`: do not edit by hand.`, '',
    `- Live view: https://danbri.github.io/londat/docklands/?ll=${PI.centre[1]},${PI.centre[0]},1500&ht=0,55`,
    `- Area (WGS84 degrees, west, south, east, north): ${AREA.join(', ')} (the core of the place)`, `- Credit: ${g.credit}`, `- OSM data as of ${g.osm_as_of} (newest element)`, '',
    '## Files', '', '| path | what | bytes | SHA-256 |', '|---|---|---|---|',
    `| greens.json | water polygons (clipped to the area), trees (position, height and crown when tagged, species profile and its basis, source, setting), woods and parks | ${a.outputs[0].bytes} | \`${a.outputs[0].sha256.slice(0, 16)}\` |`,
    '| log.json | fetch records (URL, date, SHA-256 as fetched) and the dataflow activity | | |', '',
    '## Sources', '', '| source | licence | request | fetched | SHA-256 as fetched | committed |', '|---|---|---|---|---|---|',
    ...(log.fetches.osm?.as_fetched || []).map(f => `| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | ${f.url} | ${log.fetches.osm.fetched} | \`${f.sha256.slice(0, 16)}\` | no (raw, cwplans/data/raw/places/${RID}/greens/) |`),
    ...Object.entries(log.fetches.relations || {}).map(([id, f]) => `| OpenStreetMap relation ${id} (full) | ODbL 1.0, © OpenStreetMap contributors | ${f.url} | ${f.fetched} | \`${f.sha256_as_fetched.slice(0, 16)}\` | no |`), '',
    '## Operation (dataflow, skill cwplans-dataflow)', '', `### ${a.operation} version ${a.version} (activity \`${a.activity}\`, ${a.at})`, '', 'Inputs:', '', ...a.inputs.map(i => `- ${i.label}: \`${i.path}\` (SHA-256 \`${i.sha256.slice(0, 16)}\`)`), '',
    `Parameters: ${JSON.stringify({ ...a.params, mix: Object.keys(a.params.mix) })} (mixes: the region config's place.greens.mix, else the model's MIXES of docklands/tree-species.js)`, '',
    '## Counts', '', '```', JSON.stringify(g.counts, null, 1), '```', '',
    '## Review', '', '- OSM is share-alike (ODbL 1.0): registered with its credit (owner, 2026-10-03: "ODbL is ok for now"). Trees with source rule-wood or rule-park are placed by a stated rule in woods and parks that have no mapped trees: their positions are illustrative, not observations.', ''];
  writeFileSync(join(OUT, 'README.md'), L.join('\n'));
}
function index() {
  const f = join(PLACES, 'greens.json'), ix = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { format: 'place-greens-index-1', about: 'Places with water and trees (cwplans/tools/build-place-greens.mjs); read by docklands/globe/place-look.js', places: {} };
  ix.places[RID] = `${RID}/greens/greens.json`; ix.places = Object.fromEntries(Object.entries(ix.places).sort());
  writeFileSync(f, JSON.stringify(ix, null, 1) + '\n');
}

if (cmd !== 'build') await fetchOsm();
if (cmd !== 'fetch') {
  const inputs = [{ label: 'OSM map.json of the area', path: rel(join(RAWD, 'osm-map.json.gz')), sha256: flog.osm.sha256 },
    ...Object.entries(flog.relations || {}).sort().map(([id, f]) => ({ label: `OSM relation ${id} (full)`, path: f.file, sha256: f.sha256 }))];
  const act = sha(JSON.stringify([OP.id, OP.version, inputs.map(i => i.sha256), PARAMS])).slice(0, 16), gf = join(OUT, 'greens.json');
  const prev = log.activities.find(a => a.activity === act);
  if (prev && !flag('--force') && existsSync(gf) && sha(readFileSync(gf)) === prev.outputs[0].sha256) console.log(`${OP.id}: in the log (${act})`);
  else {
    const t0 = Date.now(), g = build(inputs); writeFileSync(gf, JSON.stringify(g));
    const b = readFileSync(gf);
    log.fetches = { osm: { ...flog.osm, file: undefined }, relations: Object.fromEntries(Object.entries(flog.relations || {}).map(([k, v]) => [k, { url: v.url, fetched: v.fetched, bytes: v.bytes, sha256_as_fetched: v.sha256_as_fetched }])) };
    log.activities = log.activities.filter(a => a.activity !== act).concat({ activity: act, operation: OP.id, version: OP.version, skill: OP.skill, tool: TOOL, inputs, params: PARAMS,
      outputs: [{ path: rel(gf), sha256: sha(b), bytes: b.length }], counts: g.counts, ms: Date.now() - t0, at: new Date().toISOString() });
    writeFileSync(LOGF, JSON.stringify(log, null, 1)); console.log(`${OP.id}: ran (${act}): ${JSON.stringify(g.counts)}`);
  }
  readme(); index();
}
