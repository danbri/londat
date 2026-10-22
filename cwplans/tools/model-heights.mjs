// Heights of the model buildings that the 2022 LiDAR did not measure (fault F52), by rule, as one logged operation
// (kgx-ops Flow; log in londat kgx/log):
//   model-heights: area.js (as build-docklands.mjs wrote it; a run on its own output first restores the values it
//     changed, meta.heightRule.before, so the operation is idempotent) + building-keys.json (OSM type, levels, Wikidata
//     item of each model building) + the owner's photo sets (data/images/contrib/*/photos.json: storeys counted, a top
//     solved from a camera) + the construction index (registry/sources/construction/sites.json) + the Wikidata facts
//     (data/raw/docklands/wikidata-facts.json.gz, P1101 floors above ground)
//     -> area.js with new heights (b, h, s) for the unmeasured classes, meta.heightRule (the rule, the fitted storey
//        heights, counts, the values before), and graph version `model-heights` (one record a changed building).
// The classes (build-docklands.mjs heightOf): 'guess' (s 3: no LiDAR height, no OSM levels: 6 m), 'levels' (s 1: OSM
// building:levels, no LiDAR), 'newer' (s 4: OSM levels, the LiDAR lower than half of them), and here 'dig' (s 0, footprint
// 300 m2 or more, model ground 3 m or more below the ground round it and the top under 3 m above it: the survey saw an
// excavation). Storeys, in this order: OSM building:levels, a photo count, the construction index (one building of a site
// with one storey count), Wikidata P1101. Height: tools/storey-heights.mjs, with base and typical storey of each use FITTED
// to the buildings of this model that the LiDAR measured and OSM gives levels for. A solved photo top (metres above the model datum) gives the
// height directly. New source code 5 'storeys' (storeys from a dated source other than OSM; the card says which).
// Versions: 1 (2026-10-22); 2 (2026-10-22): the graph's basis text gives heights as metres above the model datum, not
// as a named national datum (tools/check-locale.mjs); the same heights.
// Rebuild order: build-docklands -> key-model-buildings -> model-heights -> build-roofs -> roofs-refine -> build-materials.
//   node cwplans/tools/model-heights.mjs            (run and log; writes area.js)
//   node cwplans/tools/model-heights.mjs --dry      (print the table, write nothing)
// Skills: docklands-data-curation (F52), docklands-3d-page ("Building heights"), cwplans-dataflow.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import vm from 'vm';
import { dataFactory as F } from '@factoidal/core';
import { TOOLS } from './lib.mjs';
import { LONDAT_DIR } from './londat.mjs';
import { Flow } from './kgx-ops.mjs';
import { kid, VOCAB } from './kgx-ids.mjs';
import { PRIOR, FIT, useOf, skipped, storeysOf, heightFromStoreys, fitStoreyRule } from './storey-heights.mjs';

const CW = join(TOOLS, '..'), DD = join(CW, 'docklands', 'data'), AREA = join(DD, 'area.js'), KEYS = join(DD, 'building-keys.json');
const SITES = join(CW, 'registry', 'sources', 'construction', 'sites.json'), WD = join(CW, 'data', 'raw', 'docklands', 'wikidata-facts.json.gz');
const PHOTOS = join(LONDAT_DIR, 'data', 'images', 'contrib'), K = join(LONDAT_DIR, 'kgx');
const photoFiles = readdirSync(PHOTOS).map(d => join(PHOTOS, d, 'photos.json')).filter(existsSync).sort();
const RULE = join(TOOLS, 'storey-heights.mjs');

// the rules (parameters of the operation)
const P = { dig: { min_area_m2: 300, below_m: 3, top_above_m: 3, ring_m: [60, 120], ring_pct: 0.6 }, site_statuses: ['completed_recently', 'on_site', 'commenced_stale'],
  site_min_area_m2: 200, site_min_share: 0.3, site_multi_height: 'part[- ]\\w+[- ]storey|ranging from|between \\w+ and \\w+ storeys|\\d+ to \\d+ storeys|buildings of', storeys_order: ['osm-levels', 'photo-count', 'construction-index', 'wikidata-p1101'], prior: PRIOR, fit: FIT, new_code: { storeys: 5 } };
const op = { id: 'model-heights', version: 2, skill: 'docklands-data-curation', tool: 'cwplans/tools/model-heights.mjs',
  about: 'area.js + building-keys.json + photo sets + construction index + Wikidata facts -> heights of the model buildings the 2022 LiDAR did not measure (guess, OSM levels, newer, digs): storeys from OSM levels, a photo count, the construction index or Wikidata P1101, times a storey height by use fitted to the LiDAR-measured buildings with OSM levels (tools/storey-heights.mjs); a solved photo top as it is. Writes area.js and graph model-heights' };
const dry = process.argv.includes('--dry'), flow = new Flow(K);
const inputs = [flow.file(AREA, 'cwplans/docklands/data/area.js'), flow.file(KEYS, 'cwplans/docklands/data/building-keys.json'), flow.file(RULE, 'cwplans/tools/storey-heights.mjs'),
  flow.file(SITES, 'cwplans/registry/sources/construction/sites.json'), flow.file(WD, 'cwplans/data/raw/docklands/wikidata-facts.json.gz'),
  ...photoFiles.map(f => flow.file(f, f.slice(LONDAT_DIR.length + 1)))];

const SRC_NAMES = ['lidar', 'levels', 'tag', 'guess', 'newer', 'storeys'];
const ringOf = b => { const a = [0, 0], o = []; b.p.forEach((v, k) => { a[k % 2] += v; if (k % 2) o.push([a[0] / 10, a[1] / 10]); }); return o; };
const areaOf = r => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; s += p[0] * q[1] - q[0] * p[1]; } return Math.abs(s / 2); };
const centroid = r => r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]);
const inRing = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const r1 = v => Math.round(v * 10) / 10;

const body = async () => {
  const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(AREA, 'utf8'), ctx); const A = ctx.DOCKLANDS_AREA, src = AREA;
  const fp = `${A.buildings.length}:${Array.from(A.buildings[0].p.slice(0, 6)).join('.')}:${Array.from(A.buildings.at(-1).p.slice(0, 6)).join('.')}`;
  const keys = JSON.parse(readFileSync(KEYS, 'utf8')); if (keys.model.fp !== fp) throw new Error('building-keys.json is for another area.js: run key-model-buildings.mjs first');
  const ids = keys.ids.split(','), facts = id => keys.osm[id] || {};
  // idempotence: start from the values build-docklands.mjs wrote
  const before0 = A.meta.heightRule?.before || {};
  for (const [i, [b, h, s]] of Object.entries(before0)) Object.assign(A.buildings[+i], { b, h, s });
  delete A.meta.heightRule;
  const useOfI = i => { const f = facts(ids[i]); const own = f.b && f.b.replace(/^part:/, '') !== 'yes' ? f.b : null; return own ? useOf(own) : useOf(f.p ? facts(f.p).b : f.b); };
  const skipI = i => { const f = facts(ids[i]); return skipped(f.b) || (f.p && skipped(facts(f.p).b) && !f.b); };
  // 1. fit the storey heights to the measured buildings: LiDAR class, OSM levels, outlines (not parts), not skipped kinds
  const samples = [];
  A.buildings.forEach((b, i) => { if (b.s !== 0 || b.mh) return; const f = facts(ids[i]); if (!f.l || (f.b || '').startsWith('part:') || skipped(f.b)) return;
    const n = storeysOf(f.l); if (n) samples.push({ use: useOf(f.b), n, h: b.h }); });
  const { uses, fitted } = fitStoreyRule(samples, P.prior, P.fit);
  // 2. the sources of storeys
  const photo = new Map();   // OSM key -> { n | top, set, how }
  for (const f of photoFiles) { const J = JSON.parse(readFileSync(f, 'utf8')); for (const [name, v] of Object.entries(J.buildings || {})) {
    const m = String(v.osm || '').match(/(way|relation)\/(\d+)/); if (!m) continue; const k = (m[1] === 'way' ? 'w' : 'r') + m[2];
    if (v.storeys?.n) photo.set(k, { n: v.storeys.n, set: J.set, name, how: v.storeys.how });
    if (v.solved_top_m_od?.value) photo.set(k, { ...(photo.get(k) || {}), top: v.solved_top_m_od.value, pm: v.solved_top_m_od.pm, set: J.set, name, how_top: v.solved_top_m_od.how }); } }
  const wdF = new Map();
  for (const b of JSON.parse(gunzipSync(readFileSync(WD))).results.bindings) if (b.prop.value.endsWith('/P1101')) { const q = b.item.value.split('/').pop(), v = +b.val.value; if (v >= 1 && !wdF.has(q)) wdF.set(q, v); }
  const sites = JSON.parse(readFileSync(SITES, 'utf8')).sites.filter(s => P.site_statuses.includes(s.status) && s.footprint?.ring_local && s.approved?.buildings?.length);
  // 3. candidates
  const terr = A.terrain, tAt = (x, z) => { const i = Math.round((x - terr.x0) / terr.cell), j = Math.round((z - terr.z0) / terr.cell); return i >= 0 && j >= 0 && i < terr.nx && j < terr.nz ? terr.dm[j * terr.nx + i] / 10 : null; };
  const ringGround = c => { const v = []; for (let r = P.dig.ring_m[0]; r <= P.dig.ring_m[1]; r += 20) for (let k = 0; k < 24; k++) { const a = k / 24 * 2 * Math.PI, g = tAt(c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)); if (g !== null) v.push(g); } return v.length ? pct(v, P.dig.ring_pct) : null; };
  const geo = A.buildings.map(b => { const r = ringOf(b); return { r, c: centroid(r), a: areaOf(r) }; });
  const cand = [];
  A.buildings.forEach((b, i) => {
    if (skipI(i)) return;
    const cls = b.s === 3 ? 'guess' : b.s === 1 ? 'levels' : b.s === 4 ? 'newer' : null;
    if (cls) { cand.push({ i, cls }); return; }
    if (b.s === 0 && !b.mh && geo[i].a >= P.dig.min_area_m2) { const g = ringGround(geo[i].c);
      if (g !== null && b.b <= g - P.dig.below_m && b.b + b.h <= g + P.dig.top_above_m) cand.push({ i, cls: 'dig', ground: r1(g) }); }
  });
  // the construction index: a site with one storey count, and one candidate of 200 m2 or more inside its footprint
  const siteOf = new Map();
  for (const s of sites) {
    // PLD storeys are the scheme's maximum: used only for a one-building scheme of one height whose model outline covers
    // at least site_min_share of the site footprint (a tower on a big estate site, or a part-5/part-6 block, is left out)
    const counts = [...new Set(s.approved.buildings.map(x => x.storeys).filter(n => n >= 1))]; if (counts.length !== 1 || s.approved.buildings.length !== 1) continue;
    if (new RegExp(P.site_multi_height, 'i').test(s.description || '')) continue;
    const inside = cand.filter(c => geo[c.i].a >= P.site_min_area_m2 && geo[c.i].a >= P.site_min_share * s.footprint.area_m2 && inRing(geo[c.i].c, s.footprint.ring_local));
    if (inside.length === 1) siteOf.set(inside[0].i, { n: counts[0], id: s.id, app: s.approved.buildings[0].app, status: s.status });
  }
  // 4. apply
  const before = {}, rows = [], counts = {}, unresolved = {}, flagged = [], q = [], N = F.namedNode, V = VOCAB, XSD = 'http://www.w3.org/2001/XMLSchema#';
  const lit = (x, dt) => F.literal(String(x), dt ? N(XSD + dt) : undefined), add = (s, p, o) => q.push(F.quad(N(s), N(p), o, F.defaultGraph()));
  for (const c of cand) {
    const b = A.buildings[c.i], id = ids[c.i], f = facts(id), use = useOfI(c.i), ph = photo.get(id);
    let n = null, from = null, basis = null;
    const lv = storeysOf(f.l);
    if (lv) { n = lv; from = 'osm-levels'; basis = `OSM building:levels ${f.l}`; }
    else if (ph?.n) { n = ph.n; from = 'photo-count'; basis = `storeys counted in the owner's photo set ${ph.set} (${ph.how})`; }
    else if (siteOf.has(c.i)) { const s = siteOf.get(c.i); n = s.n; from = 'construction-index'; basis = `construction index ${s.id} (${s.app}, ${s.status}): ${s.n} storeys approved`; }
    else if (f.wd && wdF.has(f.wd) && !f.p) { n = wdF.get(f.wd); from = 'wikidata-p1101'; basis = `Wikidata ${f.wd} P1101 floors above ground ${n}`; }
    const ground = c.cls === 'dig' ? c.ground : b.b;
    let h = null, how = null;
    if (n) { h = heightFromStoreys(n, use, uses); how = `${n} storeys x the ${use} storey rule`; }
    else if (ph?.top) { h = r1(ph.top - ground); from = 'photo-solve'; basis = `top ${ph.top} m above the model datum (+-${ph.pm} m) solved from the owner's photo set ${ph.set} (${ph.how_top})`; how = 'solved top minus ground'; }
    if (h === null || (b.mh && h <= b.mh)) { const k = `${c.cls} (no storeys)`; unresolved[k] = (unresolved[k] || 0) + 1; flagged.push([c.i, c.cls, Math.round(geo[c.i].a), id, f.n || f.h || '']); continue; }
    const s = from === 'osm-levels' ? (c.cls === 'newer' ? 4 : c.cls === 'dig' ? 4 : 1) : 5;
    if (h === b.h && ground === b.b && s === b.s) { counts[`${c.cls} unchanged`] = (counts[`${c.cls} unchanged`] || 0) + 1; continue; }
    before[c.i] = [b.b, b.h, b.s];
    rows.push({ i: c.i, id, name: f.n || f.h || null, basis, cls: c.cls, use, n, from, area: Math.round(geo[c.i].a), b0: b.b, h0: b.h, s0: SRC_NAMES[b.s], b1: ground, h1: h, s1: SRC_NAMES[s] });
    const k = `${c.cls} -> ${from}`; counts[k] = (counts[k] || 0) + 1;
    Object.assign(b, { b: ground, h, s });
    const S = kid('building', 'osm-' + id);
    add(S, V + 'modelHeight', lit(h.toFixed(1), 'decimal')); add(S, V + 'modelGround', lit(ground.toFixed(1), 'decimal'));
    add(S, V + 'heightBasis', lit(`${basis}; ${how}${c.cls === 'dig' ? `; ground ${ground} m from the terrain round the site (the 2022 LiDAR saw an excavation at ${before[c.i][0]} m)` : ''}; was ${before[c.i][1]} m (${SRC_NAMES[before[c.i][2]]})`));
    if (n) { add(S, V + 'storeysAboveGround', lit(n, 'integer')); add(S, V + 'storeysSource', lit(from)); }
  }
  const stats = { lidar: 0, levels: 0, tag: 0, guess: 0, newer: 0, storeys: 0 }; for (const b of A.buildings) stats[SRC_NAMES[b.s]]++;
  A.meta.buildingHeightSources = SRC_NAMES;
  A.meta.heightRule = { operation: `${op.id} v${op.version}`, tool: op.tool, rule: 'height = base + typical x (storeys - 1 + plant storeys) by use (cwplans/tools/storey-heights.mjs); base and typical fitted to the LiDAR-measured buildings of this model with OSM levels',
    uses, fitted, storeys_order: P.storeys_order, counts, unresolved, sourceCounts: stats,
    storeys: Object.fromEntries(rows.filter(r => r.from !== 'osm-levels').map(r => [r.i, [r.n, r.from]])),
    flagged: { about: 'unmeasured buildings with no storeys from any source: model index, class, footprint m2 (the page keeps the old value)', i: flagged.map(x => x[0]) }, before };
  return { A, rows, counts, unresolved, fitted, stats, quads: q, src, flagged };
};

const out = await body();
const table = r => `${String(r.i).padStart(6)} ${r.id.padEnd(12)} ${(r.name || '').slice(0, 30).padEnd(30)} ${r.cls.padEnd(6)} ${r.use.padEnd(13)} ${String(r.n ?? '').padStart(3)} ${r.from.padEnd(18)} ${String(r.area).padStart(6)} m2  ${r.b0}/${r.h0} ${r.s0} -> ${r.b1}/${r.h1} ${r.s1}`;
console.error(JSON.stringify({ fitted: out.fitted, counts: out.counts, unresolved: out.unresolved, sources: out.stats }, null, 1));
for (const r of out.rows.filter(r => r.from !== 'osm-levels' || r.name || r.area >= 2000)) console.error(table(r) + (r.from !== 'osm-levels' ? '\n        ' + r.basis : ''));
for (const x of out.flagged.filter(x => x[1] === 'dig' || x[2] >= 800)) console.error('flagged', x.join(' '));
if (dry) process.exit(0);
const res = await flow.run(op, inputs, P, async () => {
  const js = readFileSync(AREA, 'utf8'), head = js.slice(0, js.indexOf('globalThis.DOCKLANDS_AREA'));
  writeFileSync(AREA, head + `globalThis.DOCKLANDS_AREA = ${JSON.stringify(out.A)};\n`);
  return { 'model-heights': { quads: out.quads, about: { title: 'Heights of the model buildings the 2022 LiDAR did not measure (F52): storeys and their source, the height and ground by rule', licence: 'CC0 1.0 (contains OpenStreetMap data, ODbL 1.0, and Wikidata, CC0)', osm: true } } };
});
const v = res['model-heights'], ehF = join(K, 'external-heads.json'), eh = JSON.parse(readFileSync(ehF, 'utf8'));
eh['model-heights'] = { iri: v.iri, store: false }; writeFileSync(ehF, JSON.stringify(eh, null, 1) + '\n');
console.log(JSON.stringify({ version: v.iri, triples: v.triples, new: flow.ran.length, changed: out.rows.length }));
