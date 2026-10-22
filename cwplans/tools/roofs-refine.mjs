// Roof levels of the big model buildings, and roofs that the LiDAR cannot give, as one logged operation after build-roofs
// (kgx-ops Flow; log in londat kgx/log):
//   roofs-refine: roofs.json (as build-roofs.mjs wrote it) + area.js (after model-heights) + building-keys.json + the EA
//     LiDAR 2022 tiles (DSM and DTM, 8 zips) + tools/lidar-roofs.py + docklands/roofs-layer.js
//     -> roofs.json with (1) the big-building rule: every model building with a footprint of 4,000 m2 or more (no holes,
//        no min_height), whatever its height (build-roofs stops at 25 m), measured by the LiDAR (source lidar, or an OSM
//        height that the LiDAR 90th percentile is within 25 % of), cut by roof level (lidar-roofs.py --big: reflex
//        corners, then straight chords across the outline's rectangle axes where the median roof level steps by 2 m or
//        more, up to 24 parts), each part a flat roof at its fitted level; (2) the newer-than-the-survey rule: a roof row
//        of a building whose height is not from the LiDAR (sources levels, newer, storeys: model-heights) is dropped, as
//        the survey saw an older building or a site; and graph version `roofs-big`.
// Rebuild order: build-docklands -> key-model-buildings -> model-heights -> build-roofs -> roofs-refine -> build-materials.
//   node cwplans/tools/roofs-refine.mjs
//   ROOFS_TILES=<dir of the 8 tile zips> node cwplans/tools/roofs-refine.mjs
//   ROOFS_DRY=1 ROOFS_MEAS=<lidar-roofs.py --big output>: write roofs.json from a saved measurement, no log entry (tuning)
// Skills: docklands-3d-page ("Roof shapes"), docklands-data-curation, cwplans-dataflow.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import vm from 'vm';
import { dataFactory as F } from '@factoidal/core';
import { TOOLS } from './lib.mjs';
import { LONDAT_DIR } from './londat.mjs';
import { Flow } from './kgx-ops.mjs';
import { kid, VOCAB } from './kgx-ids.mjs';

const CW = join(TOOLS, '..'), DD = join(CW, 'docklands', 'data'), AREA = join(DD, 'area.js'), KEYS = join(DD, 'building-keys.json'), OUT = join(DD, 'roofs.json');
const RAW = join(CW, 'data', 'raw', 'docklands'), TILES = process.env.ROOFS_TILES || join(RAW, 'lidar');
const PY = join(TOOLS, 'lidar-roofs.py'), LAYER = join(CW, 'docklands', 'roofs-layer.js'), K = join(LONDAT_DIR, 'kgx'), sha = b => createHash('sha256').update(b).digest('hex');
const TILE_IDS = ['TQ3075', 'TQ3080', 'TQ3575', 'TQ3580'], DSM = 'lidar_composite_first_return_dsm-2022-1-', DTM = 'lidar_composite_dtm-2022-1-';
const zips = [...TILE_IDS.map(t => join(TILES, DSM + t + '.zip')), ...TILE_IDS.map(t => join(TILES, DTM + t + '.zip'))];

// the rules (parameters of the operation); the cut rules of lidar-roofs.py (BIG) come back in its output
const P = { big_area_m2: 4000, inset: 0.75, levels_gap_m: 2.0, mixed_mad_m: 1.0, top_keep_m: 3, top_keep_share: 0.1, eave_min: 2.0, top_over_h: 1.0, tag_p90_within: 0.25, measured_sources: [0], tag_source: 2, newer_sources: [1, 4, 5] };
const op = { id: 'roofs-refine', version: 1, skill: 'docklands-3d-page', tool: 'cwplans/tools/roofs-refine.mjs',
  about: 'roofs.json + area.js + EA LiDAR 2022 DSM and DTM tiles -> roofs.json with the big model buildings (4,000 m2 or more, any height) cut by roof level into flat parts, and no LiDAR roof on a building newer than the survey (graph roofs-big)' };
const dry = !!process.env.ROOFS_DRY, flow = new Flow(K);
const inputs = dry ? [] : [flow.file(OUT, 'cwplans/docklands/data/roofs.json'), flow.file(AREA, 'cwplans/docklands/data/area.js'), flow.file(KEYS, 'cwplans/docklands/data/building-keys.json'),
  flow.file(PY, 'cwplans/tools/lidar-roofs.py'), flow.file(LAYER, 'cwplans/docklands/roofs-layer.js'),
  ...zips.map(z => flow.file(z, 'EA survey tile ' + z.split('/').pop() + ' (local, not committed; OGL v3.0)'))];

// roofs.json rows as they are: single roofs { i, s, q (7 ints) } and buildings in parts { i, cuts (5 ints each), parts (10 ints each) }
function rowsOf(T) {
  const s = T.s ? T.s.split(',') : [], single = new Map(), multi = new Map(); let i = 0;
  for (let k = 0; k < s.length; k++) { const q = T.r.slice(8 * k, 8 * k + 8); i += q[0]; single.set(i, { s: s[k], q: q.slice(1) }); }
  const m = T.m || []; i = 0;
  for (let o = 0; o < m.length;) { i += m[o]; const nc = m[o + 1]; o += 2; const cuts = [], parts = [];
    for (let c = 0; c < nc; c++, o += 5) cuts.push(m.slice(o, o + 5));
    for (let p = 0; p <= nc; p++, o += 10) parts.push(m.slice(o, o + 10));
    multi.set(i, { cuts, parts }); }
  return { single, multi };
}
function encode(single, multi) {
  const s = [], r = [], m = []; let prev = 0;
  for (const i of [...single.keys()].sort((a, b) => a - b)) { const x = single.get(i); s.push(x.s); r.push(i - prev, ...x.q); prev = i; }
  prev = 0;
  for (const i of [...multi.keys()].sort((a, b) => a - b)) { const x = multi.get(i); m.push(i - prev, x.cuts.length, ...x.cuts.flat()); prev = i; for (const p of x.parts) m.push(...p); }
  return { s: s.join(','), r, m };
}

const body = async () => {
  const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(AREA, 'utf8'), ctx); const A = ctx.DOCKLANDS_AREA;
  const model_fp = `${A.buildings.length}:${Array.from(A.buildings[0].p.slice(0, 6)).join('.')}:${Array.from(A.buildings.at(-1).p.slice(0, 6)).join('.')}`;
  const T = JSON.parse(readFileSync(OUT, 'utf8')); if (T.model.fp !== model_fp) throw new Error('roofs.json is for another area.js: run build-roofs.mjs first');
  const keys = JSON.parse(readFileSync(KEYS, 'utf8')); if (keys.model.fp !== model_fp) throw new Error('building-keys.json is for another area.js');
  const ids = keys.ids.split(',');
  // a run on its own output: start from the rows build-roofs wrote (T.refined.before) so that the operation is idempotent
  if (T.refined) { T.s = T.refined.before.s; T.r = T.refined.before.r; T.m = T.refined.before.m; T.counts = T.refined.before.counts; delete T.refined; }
  const before = { s: T.s, r: T.r, m: T.m, counts: T.counts };
  let meas;
  if (process.env.ROOFS_MEAS) meas = JSON.parse(readFileSync(process.env.ROOFS_MEAS, 'utf8'));
  else { const tmp = mkdtempSync(join(tmpdir(), 'roofs-big-')), mf = join(tmp, 'meas.json');
    execFileSync('python3', ['-I', PY, AREA, '--dsm', ...zips.slice(0, 4), '--dtm', ...zips.slice(4), '--out', mf, '--inset', String(P.inset), '--big', String(P.big_area_m2), '--big-only'], { stdio: ['ignore', 'inherit', 'inherit'] });
    meas = JSON.parse(readFileSync(mf, 'utf8')); rmSync(tmp, { recursive: true }); }
  const lctx = { console }; vm.createContext(lctx); vm.runInContext(readFileSync(LAYER, 'utf8'), lctx); const L = lctx.DocklandsRoofs;
  const ringXZ = b => { const a = [0, 0], o = []; b.p.forEach((v, k) => { a[k % 2] += v; if (k % 2) o.push([a[0] / 10, a[1] / 10]); }); return o; };
  const { single, multi } = rowsOf(T), stat = { newer_dropped: 0, big_measured: 0, big_parts: 0, big_not_lidar: 0, big_one_level: 0, big_no_cut: 0, parts_total: 0, replaced: {} };
  const q = [], N = F.namedNode, V = VOCAB, XSD = 'http://www.w3.org/2001/XMLSchema#', lit = (x, dt) => F.literal(String(x), dt ? N(XSD + dt) : undefined), add = (s, p, o) => q.push(F.quad(N(s), N(p), o, F.defaultGraph()));
  // (2) newer than the survey: no LiDAR roof
  for (const [i] of [...single, ...multi]) if (P.newer_sources.includes(A.buildings[i].s)) { const sr = single.get(i); if (sr && /o$/.test(sr.s)) continue; single.delete(i); multi.delete(i); stat.newer_dropped++; }
  // (1) big buildings
  const big = [];
  for (const [k, r] of Object.entries(meas.big || {})) {
    const i = +k, b = A.buildings[i]; stat.big_measured++;
    const tagOk = b.s === P.tag_source && r.p90 != null && Math.abs(r.p90 - b.h) <= P.tag_p90_within * b.h;
    if (!(P.measured_sources.includes(b.s) || tagOk)) { stat.big_not_lidar++; continue; }
    if (!r.cuts || !r.parts) { stat.big_no_cut++; continue; }
    const ring = ringXZ(b), PC = L.pieces(ring, r.cuts);
    if (PC.length !== r.parts.length || PC.some((pc, n) => pc[0].length !== r.parts[n].ring.length || pc[0].some((pt, m) => Math.hypot(pt[0] - r.parts[n].ring[m][0], pt[1] - r.parts[n].ring[m][1]) > .01)))
      throw new Error(`building ${i}: the pieces of roofs-layer.js differ from those of lidar-roofs.py`);
    const whole = r.fit ? r.fit.flat.p[0] : b.h;
    // a part's level: its flat fit; where the part still holds mixed heights (flat fit error over mixed_mad_m), its 90th
    // percentile (the model's own height rule, here per part); between eave_min and the model height + top_over_h
    const lv = r.parts.map(p => Math.max(P.eave_min, Math.min(b.h + P.top_over_h, !p.fit ? whole : p.fit.flat.mad > P.mixed_mad_m && p.p90 != null ? p.p90 : p.fit.flat.p[0])));
    if (Math.max(...lv) - Math.min(...lv) < P.levels_gap_m) { stat.big_one_level++; continue; }
    // the parts must keep the building's top (else a tower in a big outline would lose height): left as it was
    if (Math.max(...lv) < b.h - Math.max(P.top_keep_m, P.top_keep_share * b.h)) { stat.big_top_lost = (stat.big_top_lost || 0) + 1; console.error('top lost', i, ids[i], b.h, Math.max(...lv).toFixed(1)); continue; }
    const was = single.has(i) ? single.get(i).s : multi.has(i) ? 'parts' : 'prism'; stat.replaced[was] = (stat.replaced[was] || 0) + 1;
    single.delete(i);
    const parts = PC.map((pc, n) => { let cx = 0, cz = 0; for (const [px, pz] of pc[0]) { cx += px / pc[0].length; cz += pz / pc[0].length; }
      const R = Math.round(lv[n] * 100); return [0, Math.round(cx * 10), Math.round(cz * 10), 0, R, R, 10, -1, 0, 0]; });
    multi.set(i, { cuts: r.cuts, parts }); stat.big_parts++; stat.parts_total += parts.length;
    big.push({ i, id: ids[i], area: r.area, h: b.h, parts: parts.length, levels: [Math.min(...lv), Math.max(...lv)].map(v => Math.round(v * 10) / 10) });
    const S = kid('building', 'osm-' + ids[i]);
    add(S, V + 'roofShape', lit('parts')); add(S, V + 'roofPartShapes', lit(parts.map(() => 'flat').join(',')));
    add(S, V + 'roofEaveHeight', lit(Math.min(...lv).toFixed(2), 'decimal')); add(S, V + 'roofRidgeHeight', lit(Math.max(...lv).toFixed(2), 'decimal'));
    add(S, V + 'roofBasis', lit(`EA LiDAR composite DSM 2022 1 m; big-building rule (footprint ${Math.round(r.area)} m2): the outline cut by roof level into ${parts.length} parts, a flat roof a part at its fitted level`));
  }
  const E = encode(single, multi);
  T.s = E.s; T.r = E.r; T.m = E.m; T.model = { fp: model_fp, sha256: sha(readFileSync(AREA)) };
  T.refined = { by: `${op.id} v${op.version} (${op.tool})`, rules: P, big_rules: meas.big_rules, counts: stat, before };
  const NOTE = ' Since operation roofs-refine (2026-10-22): the big buildings (4,000 m2 or more, any height) as buildings in parts cut by roof level, a flat roof a part; no LiDAR roof on a building newer than the survey (refined).';
  if (!T.about.includes(NOTE)) T.about += NOTE;
  writeFileSync(OUT, JSON.stringify(T) + '\n');
  big.sort((a, b) => b.area - a.area);
  console.error(JSON.stringify(stat)); for (const x of big.slice(0, 25)) console.error(JSON.stringify(x));
  return { 'roofs-big': { quads: q, about: { title: 'Roof levels of the big buildings of the 3D model (4,000 m2 or more): the outline cut by roof level into flat parts, from the EA LiDAR', licence: 'CC0 1.0 (contains EA LiDAR heights, OGL v3.0, and OpenStreetMap data, ODbL 1.0)', osm: true } } };
};
if (dry) { const r = await body(); console.log(JSON.stringify({ dry: true, triples: r['roofs-big'].quads.length })); process.exit(0); }
const res = await flow.run(op, inputs, P, body);
const v = res['roofs-big'], ehF = join(K, 'external-heads.json'), eh = JSON.parse(readFileSync(ehF, 'utf8'));
eh['roofs-big'] = { iri: v.iri, store: false }; writeFileSync(ehF, JSON.stringify(eh, null, 1) + '\n');
console.log(JSON.stringify({ version: v.iri, triples: v.triples, new: flow.ran.length }));
