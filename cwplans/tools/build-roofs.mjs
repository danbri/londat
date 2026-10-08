// Roof shapes for the ordinary model buildings of the 3D page (the extruded OSM outlines of area.js), from evidence:
// the Environment Agency 1 m LiDAR (tools/lidar-roofs.py fits flat, gable, hipped and skillion roofs to the DSM in each
// outline's minimum-area rectangle, and cuts an outline with wings into parts with chords from its reflex corners, each
// part fitted the same way) and the OSM tags roof:shape, roof:height, roof:levels, roof:orientation (osmium on the
// Greater London extract). Classifies each building (gabled, hipped, pyramidal, skillion, in parts, flat, complex, no
// data), gives the ridge line, the eave and ridge heights above the model ground, and writes the page file
// cwplans/docklands/data/roofs.json (rows "r" for one roof, "m" for a building in parts: the cuts, then a roof a part,
// with the run of a gable into a crossing wing). The pieces are cut with roofs-layer.js (the page's code), checked
// against the rings of lidar-roofs.py. One logged operation (kgx-ops Flow; log in londat kgx/log), graph version roofs,
// named in kgx/external-heads.json.
//   node cwplans/tools/build-roofs.mjs
//   ROOFS_TILES=<dir of the 8 tile zips> ROOFS_PBF=<greater_london-latest.osm.pbf> node cwplans/tools/build-roofs.mjs
//   ROOFS_DRY=1 ROOFS_MEAS=<lidar-roofs.py output>: write roofs.json from a saved measurement, no log entry (tuning)
// Tiles (OGL v3.0, not committed, 60 to 72 MB each): https://environment.data.gov.uk/tiles/collections/survey/<product>/
// 2022/1/<tile> for lidar_composite_first_return_dsm and lidar_composite_dtm, tiles TQ3075 TQ3080 TQ3575 TQ3580, saved
// as <product>-2022-1-<tile>.zip (tools/fetch-dsm.sh has the URL form and User-Agent). Needs python3 with numpy and
// tifffile, and osmium. Skills: docklands-3d-page ("Roof shapes"), cwplans-dataflow.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'fs';
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
const RAW = join(CW, 'data', 'raw', 'docklands'), TILES = process.env.ROOFS_TILES || join(RAW, 'lidar'), PBF = process.env.ROOFS_PBF || join(RAW, 'greater_london-latest.osm.pbf');
const PY = join(TOOLS, 'lidar-roofs.py'), K = join(LONDAT_DIR, 'kgx'), sha = b => createHash('sha256').update(b).digest('hex');
const TILE_IDS = ['TQ3075', 'TQ3080', 'TQ3575', 'TQ3580'], DSM = 'lidar_composite_first_return_dsm-2022-1-', DTM = 'lidar_composite_dtm-2022-1-';
const zips = [...TILE_IDS.map(t => join(TILES, DSM + t + '.zip')), ...TILE_IDS.map(t => join(TILES, DTM + t + '.zip'))];

// the rules (parameters of the operation): slopes as rise over run
const P = { hmax: 25, inset: 0.75, min_cells: 8, slope_min: 0.18, slope_max: 1.8, rise_min: 1.0, eave_min: 2.0, mad_max: 0.45, mad_ratio: 0.7, rise_over_mad: 4, hip_gain: 0.8, pyramid_ratio: 1.2, flat_mad: 0.3, osm_pitch_deg: 35,
  // skillion (one inclined plane): slope 0.08 to 1.0 (5 to 45 deg), kept only when its error is under skillion_gain x the best gable's
  skillion_min: 0.08, skillion_max: 1.0, skillion_rise: 0.6, skillion_gain: 0.8,
  // parts: a building already pitched as one roof is drawn in parts only when the parts' summed error (cells x median
  // absolute error) is under parts_gain x the one roof's; a gable runs on into a crossing wing (ridges within cross_dot of
  // square) up to that wing's ridge when its ridge is at most cross_rise above the other's
  parts_gain: 0.75, cross_dot: 0.6, cross_rise: 0.3 };
const op = { id: 'build-roofs', version: 2, skill: 'docklands-3d-page', tool: 'cwplans/tools/build-roofs.mjs',
  about: 'EA LiDAR 2022 DSM and DTM tiles + OSM roof tags + the model outlines in area.js -> roof shape, ridge line, eave and ridge heights of each low model building, an outline with wings in parts with a roof each (docklands/data/roofs.json)' };

const dry = !!process.env.ROOFS_DRY, flow = new Flow(K);
const LAYER = join(CW, 'docklands', 'roofs-layer.js');
const inputs = dry ? [] : [flow.file(AREA, 'cwplans/docklands/data/area.js'), flow.file(KEYS, 'cwplans/docklands/data/building-keys.json'), flow.file(PY, 'cwplans/tools/lidar-roofs.py'), flow.file(LAYER, 'cwplans/docklands/roofs-layer.js'),
  ...zips.map(z => flow.file(z, 'EA survey tile ' + z.split('/').pop() + ' (local, not committed; OGL v3.0)')),
  flow.file(PBF, 'cwplans/data/raw/docklands/greater_london-latest.osm.pbf (local, not committed: the openstreetmap.fr Greater London extract, ODbL)')];

// OSM roof tags of the model buildings' elements: osmium tags-filter (OPL text, %hex% escapes)
function osmRoofTags() {
  const tmp = mkdtempSync(join(tmpdir(), 'roofs-')), f = join(tmp, 'roof.opl');
  execFileSync('osmium', ['tags-filter', PBF, 'wr/roof:shape', 'wr/roof:height', 'wr/roof:levels', 'wr/roof:orientation', 'wr/roof:direction', '-R', '-f', 'opl', '-o', f]);
  const opl = readFileSync(f, 'utf8'); rmSync(tmp, { recursive: true });
  const dec = s => s.replace(/%([0-9a-f]+)%/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))), out = new Map();
  for (const line of opl.split('\n')) { const m = line.match(/^([wr])(\d+) .*? T(\S*)/); if (!m) continue;
    const t = Object.fromEntries(m[3] ? m[3].split(',').map(kv => { const i = kv.indexOf('='); return [dec(kv.slice(0, i)), dec(kv.slice(i + 1))]; }) : []);
    out.set(m[1] + m[2], Object.fromEntries(Object.entries(t).filter(([k]) => k.startsWith('roof:')))); }
  return out;
}
const num = s => { const m = /^\s*([\d.]+)\s*(m|metres?)?\s*$/.exec(s || ''); return m ? +m[1] : null; };

// one building: LiDAR measurement r (lidar-roofs.py) -> { shape, from, ridge centre E/N, ridge direction (u long axis or v),
// half span, half ridge length, eave and ridge above the model ground, the fit } or a flat/complex/nodata class
function classify(r, ring) {
  if (!r || r.shape === 'nodata' || !r.fit) return { shape: 'nodata' };
  const f = r.fit, fm = f.flat.mad, rad = r.bearing * Math.PI / 180, u = [Math.sin(rad), Math.cos(rad)], v = [-u[1], u[0]];
  const cand = [];
  for (const m of ['gable_long', 'gable_short', 'hipped']) {
    const [R, k, o = 0] = f[m].p, span = m === 'gable_short' ? r.L : r.W, hs = span / 2, rise = k * hs, eave = R - rise, mad = f[m].mad;   // eave: of a roof of that pitch over the whole span (the mean of the two sides when the ridge is off the middle)
    const ok = k >= P.slope_min && k <= P.slope_max && rise >= P.rise_min && eave >= P.eave_min && mad <= P.mad_max && mad <= P.mad_ratio * fm && rise >= P.rise_over_mad * mad;
    const dir = m === 'gable_short' ? v : u, off = m === 'gable_short' ? u : v;
    cand.push({ m, ok, mad, R, k, hs, eave, c: [r.c[0] + off[0] * o, r.c[1] + off[1] * o], dir, hl: m === 'hipped' ? Math.max(0, (r.L - r.W) / 2) : null });
  }
  const gab = cand.filter(c => c.ok && c.m !== 'hipped').sort((a, b) => a.mad - b.mad)[0], hip = cand.find(c => c.m === 'hipped' && c.ok);
  let best = hip && (!gab || hip.mad < P.hip_gain * gab.mad) ? hip : gab;
  const sk = skillion(r, ring); if (sk && (!best || sk.mad < P.skillion_gain * best.mad)) return { shape: 'skillion', from: 'lidar', ...sk };
  if (!best) return { shape: fm <= P.flat_mad ? 'flat' : 'complex', mad: fm, R: f.flat.p[0] };
  return { shape: best.m === 'hipped' ? (r.L / r.W < P.pyramid_ratio ? 'pyramidal' : 'hipped') : 'gabled', from: 'lidar', ...best };
}
// one inclined plane (fit "plane": h = c + a s + b t in the rectangle frame, s along u, t along v): the ridge is the high
// edge (through the outline vertex furthest uphill), the plane falls to the side dir x 90 deg clockwise (the page's n)
function skillion(r, ring) {
  const f = r.fit; if (!f.plane || !ring) return null;
  const [c0, a, b] = f.plane.p, k = Math.hypot(a, b), mad = f.plane.mad; if (!(k >= P.skillion_min && k <= P.skillion_max)) return null;
  const rad = r.bearing * Math.PI / 180, u = [Math.sin(rad), Math.cos(rad)], v = [-u[1], u[0]];
  const g = [-(a * u[0] + b * v[0]) / k, -(a * u[1] + b * v[1]) / k];   // downhill, EN
  let up = -Infinity, dn = -Infinity, top = null; for (const [E, N] of ring) { const w = (E - r.c[0]) * g[0] + (N - r.c[1]) * g[1]; if (-w > up) { up = -w; top = [E, N]; } dn = Math.max(dn, w); }
  const hs = up + dn, R = c0 + k * up, eave = R - k * hs, rise = k * hs;
  if (!(hs > 1 && rise >= P.skillion_rise && eave >= P.eave_min && mad <= P.mad_max && mad <= P.mad_ratio * f.flat.mad && rise >= P.rise_over_mad * mad)) return null;
  return { m: 'plane', mad, R, k, hs, eave, c: top, dir: [-g[1], g[0]], hl: null };   // the ridge line through the vertex furthest uphill
}
// OSM roof:shape where the LiDAR gave no shape: ridge along the long side (roof:orientation=across: along the short side),
// ridge at the model height, eave from roof:height, else roof:levels x 2.5 m, else a 35 deg pitch (at most half the height).
// Not when the LiDAR contradicts it: a measured building whose fit with that ridge direction slopes down to the ridge (a
// valley or butterfly roof) or less than slope_min keeps no shape.
function fromOsm(t, r, b) {
  const s = t && t['roof:shape']; if (!r || !r.c || !['gabled', 'hipped', 'pyramidal'].includes(s)) return null;
  const rad = r.bearing * Math.PI / 180, u = [Math.sin(rad), Math.cos(rad)], v = [-u[1], u[0]], across = s === 'gabled' && t['roof:orientation'] === 'across';
  if (r.fit && !(r.fit[across ? 'gable_short' : 'gable_long'].p[1] >= P.slope_min)) return null;
  const hs = (across ? r.L : r.W) / 2, R = b.h, rh = num(t['roof:height']) ?? (num(t['roof:levels']) != null ? 2.5 * num(t['roof:levels']) : Math.tan(P.osm_pitch_deg * Math.PI / 180) * hs);
  const rise = Math.min(rh, R / 2); if (!(rise > .5) || !(hs > 1)) return null;
  return { shape: s === 'hipped' && r.L / r.W < P.pyramid_ratio ? 'pyramidal' : s, from: 'osm', R, k: rise / hs, hs, eave: R - rise, c: r.c, dir: across ? v : u, hl: s === 'gabled' ? null : Math.max(0, (r.L - r.W) / 2) };
}

const body = async () => {
  const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(AREA, 'utf8'), ctx); const A = ctx.DOCKLANDS_AREA, E0 = A.meta.origin.E0, N0 = A.meta.origin.N0;
  const model_fp = `${A.buildings.length}:${Array.from(A.buildings[0].p.slice(0, 6)).join('.')}:${Array.from(A.buildings.at(-1).p.slice(0, 6)).join('.')}`;
  const keys = JSON.parse(readFileSync(KEYS, 'utf8')); if (keys.model.fp !== model_fp) throw new Error('building-keys.json is for another area.js: run key-model-buildings.mjs first');
  const ids = keys.ids.split(',');
  let meas;
  if (process.env.ROOFS_MEAS) meas = JSON.parse(readFileSync(process.env.ROOFS_MEAS, 'utf8'));
  else { const tmp = mkdtempSync(join(tmpdir(), 'roofs-')), mf = join(tmp, 'meas.json');
    execFileSync('python3', ['-I', PY, AREA, '--dsm', ...zips.slice(0, 4), '--dtm', ...zips.slice(4), '--out', mf, '--hmax', String(P.hmax), '--inset', String(P.inset)], { stdio: ['ignore', 'inherit', 'inherit'] });
    meas = JSON.parse(readFileSync(mf, 'utf8')); rmSync(tmp, { recursive: true }); }
  const tags = existsSync(PBF) ? osmRoofTags() : (dry ? new Map() : null); if (!tags) throw new Error('no OSM extract at ' + PBF);
  const counts = {}, agree = {}, rows = [], multi = [], partCounts = {}, from = {}, N = F.namedNode, V = VOCAB, q = [], XSD = 'http://www.w3.org/2001/XMLSchema#';
  const lit = (x, dt) => F.literal(String(x), dt ? N(XSD + dt) : undefined), add = (s, p, o) => q.push(F.quad(N(s), N(p), o, F.defaultGraph()));
  const lctx = { console }; vm.createContext(lctx); vm.runInContext(readFileSync(LAYER, 'utf8'), lctx); const L = lctx.DocklandsRoofs;
  const ringXZ = b => { const a = [0, 0], o = []; b.p.forEach((v, k) => { a[k % 2] += v; if (k % 2) o.push([a[0] / 10, a[1] / 10]); }); return o; };
  const EN = pts => pts.map(([x, z]) => [E0 + x, N0 - z]);
  const bearingOf = c => { const d = Math.atan2(c.dir[0], c.dir[1]) * 180 / Math.PI; return c.shape === 'skillion' ? (d % 360 + 360) % 360 : (d % 180 + 180) % 180; };
  const code = c => ({ gabled: 'g', hipped: 'h', pyramidal: 'p', skillion: 'k' })[c.shape];
  const cost = (c, r) => (c.from ? c.mad : r.fit.flat.mad) * r.n;
  let mismatch = 0;
  A.buildings.forEach((b, i) => {
    if (b.h > P.hmax || b.mh || (b.holes && b.holes.length)) return;
    const r = meas.buildings[i], t = tags.get(ids[i]), os = t && t['roof:shape'], ring = ringXZ(b);
    let c = classify(r, EN(ring));
    if (os) { const k = `${os} / ${c.shape}`; agree[k] = (agree[k] || 0) + 1; }
    // a building with wings: a roof a part (see P.parts_gain), the pieces cut by the page's code
    if (r && r.parts && (c.shape === 'complex' || c.shape === 'nodata' || (c.from === 'lidar' && c.shape !== 'flat'))) {
      const PC = L.pieces(ring, r.cuts);
      if (PC.length !== r.parts.length || PC.some((pc, k) => pc[0].length !== r.parts[k].ring.length || pc[0].some((pt, m) => Math.hypot(pt[0] - r.parts[k].ring[m][0], pt[1] - r.parts[k].ring[m][1]) > .01))) { mismatch++; }
      else {
        const pcs = r.parts.map((pr, k) => pr.fit ? classify(pr, EN(PC[k][0])) : { shape: 'nodata' });
        const pitched = pcs.filter(x => x.from).length, sum = pcs.reduce((a, x, k) => a + (r.parts[k].fit ? cost(x, r.parts[k]) : 0), 0);
        if (pitched && (!c.from || sum < P.parts_gain * cost(c, r))) {
          const was = c.shape; from[was] = (from[was] || 0) + 1;
          c = { shape: 'parts', from: 'lidar', parts: pcs, cuts: r.cuts, PC };
        }
      }
    }
    if (c.shape === 'complex' || c.shape === 'nodata') { const o = fromOsm(t, r, b); if (o) c = o; }
    const key = (c.from === 'osm' ? 'osm ' : '') + c.shape; counts[key] = (counts[key] || 0) + 1;
    if (!c.from) return;
    const s = kid('building', 'osm-' + ids[i]);
    if (c.shape === 'parts') {
      const eaveOf = x => x.from ? x.eave : null, pr = r.parts;
      const fallback = Math.max(...c.parts.map(eaveOf).filter(x => x != null));
      const rowsP = c.parts.map((x, k) => {
        const pc = c.PC[k][0]; let cx = 0, cz = 0; for (const [px, pz] of pc) { cx += px / pc.length; cz += pz / pc.length; }
        if (!x.from) {   // flat part: at its flat fit (a flat or unfitted roof), else (no cells) the highest eave of the others
          const R = x.shape === 'nodata' || !pr[k].fit ? fallback : Math.max(P.eave_min, Math.min(b.h + 1, pr[k].fit.flat.p[0]));
          partCounts.flat = (partCounts.flat || 0) + 1; return { k: 0, x: cx, z: cz, br: 0, eave: R, R, hs: 1, hl: null, e0: 0, e1: 0 };
        }
        partCounts[x.shape] = (partCounts[x.shape] || 0) + 1;
        return { k: 'fghpk'.indexOf(code(x)), x: x.c[0] - E0, z: -(x.c[1] - N0), br: bearingOf(x), eave: x.eave, R: x.R, hs: x.hs, hl: x.hl, e0: 0, e1: 0 };
      });
      // a gable that ends at a cut against a crossing wing runs on to that wing's ridge (the valley)
      const dOf = p => [Math.sin(p.br * Math.PI / 180), -Math.cos(p.br * Math.PI / 180)];   // the page's ridge direction (roofs-layer.js planes())
      rowsP.forEach((p, k) => {
        if (p.k !== 1) return; const d = dOf(p), pc = c.PC[k], R = { ...p, shape: 'g', bearing: p.br }, ends = L.gableEnds(pc[0], pc[1], R);
        for (const end of [0, 1]) { const g = ends[end]; if (!g) continue;
          const a = pc[0][g.k], bq = pc[0][(g.k + 1) % pc[0].length], mx = (a[0] + bq[0]) / 2, mz = (a[1] + bq[1]) / 2;
          const j = c.PC.findIndex((o, jj) => jj !== k && o[0].some((v, w) => o[1][w] && Math.hypot((v[0] + o[0][(w + 1) % o[0].length][0]) / 2 - mx, (v[1] + o[0][(w + 1) % o[0].length][1]) / 2 - mz) < .02));
          const qn = rowsP[j]; if (j < 0 || !(qn.k === 1 || qn.k === 2) || Math.abs(d[0] * dOf(qn)[0] + d[1] * dOf(qn)[1]) > P.cross_dot || p.R > qn.R + P.cross_rise) continue;
          const dq = dOf(qn), den = d[0] * dq[1] - d[1] * dq[0], sx = ((qn.x - p.x) * dq[1] - (qn.z - p.z) * dq[0]) / den;   // p's ridge meets q's ridge at p + sx d
          const e = end ? sx - g.sc : g.sc - sx; if (e > 0 && e <= 2 * qn.hs + 1) { if (end) p.e1 = e; else p.e0 = e; partCounts.valley = (partCounts.valley || 0) + 1; }
        }
      });
      multi.push([i, c.cuts, rowsP]);
      const sh = c.parts.map(x => x.from ? x.shape : 'flat');
      add(s, V + 'roofShape', lit('parts')); add(s, V + 'roofPartShapes', lit(sh.join(',')));
      add(s, V + 'roofEaveHeight', lit(Math.min(...rowsP.map(x => x.eave)).toFixed(2), 'decimal')); add(s, V + 'roofRidgeHeight', lit(Math.max(...rowsP.map(x => x.R)).toFixed(2), 'decimal'));
      add(s, V + 'roofBasis', lit(`EA LiDAR composite DSM 2022 1 m, the outline cut into ${rowsP.length} parts, one roof fitted a part`));
      return;
    }
    const x = c.c[0] - E0, z = -(c.c[1] - N0), br = bearingOf(c);
    rows.push([i, code(c) + (c.from === 'osm' ? 'o' : ''), Math.round(x * 10), Math.round(z * 10), Math.round(br * 10), Math.round(c.eave * 100), Math.round(c.R * 100), Math.round(c.hs * 10), c.hl == null ? -1 : Math.round(c.hl * 10)]);
    add(s, V + 'roofShape', lit(c.shape)); add(s, V + 'roofEaveHeight', lit(c.eave.toFixed(2), 'decimal')); add(s, V + 'roofRidgeHeight', lit(c.R.toFixed(2), 'decimal'));
    add(s, V + 'roofRidgeBearing', lit(br.toFixed(1), 'decimal')); add(s, V + 'roofBasis', lit(c.from === 'lidar' ? `EA LiDAR composite DSM 2022 1 m, fit error ${c.mad.toFixed(2)} m (median absolute)` : 'OSM roof:shape' + (t['roof:height'] ? ', roof:height' : t['roof:levels'] ? ', roof:levels' : ', assumed 35 deg pitch')));
  });
  if (mismatch) throw new Error(`${mismatch} buildings: the pieces of roofs-layer.js differ from those of lidar-roofs.py`);
  // page file: one row a building, columns in "columns"; delta-coded model index
  let prev = 0; const flatRows = [];
  for (const r of rows) { flatRows.push(r[0] - prev, ...r.slice(2)); prev = r[0]; }
  prev = 0; const mRows = [];
  for (const [i, cuts, ps] of multi) { mRows.push(i - prev, cuts.length, ...cuts.flat()); prev = i;
    for (const p of ps) mRows.push(p.k, Math.round(p.x * 10), Math.round(p.z * 10), Math.round(p.br * 10), Math.round(p.eave * 100), Math.round(p.R * 100), Math.round(p.hs * 10), p.hl == null ? -1 : Math.round(p.hl * 10), Math.round(p.e0 * 10), Math.round(p.e1 * 10)); }
  const out = { about: 'Roof shapes of the low model buildings of the 3D page, made by tools/build-roofs.mjs (do not edit by hand) from the EA LiDAR composite first-return DSM 2022 1 m (tools/lidar-roofs.py) and OSM roof tags. Valid while model.fp matches the page (MFP). Each building: the ridge line through (x, z) in page metres along the bearing (degrees from grid north, 0 to 180), roof planes falling from the ridge at (ridge - eave) / half_span on each side; hipped and pyramidal roofs also fall at the same slope from the ends of the ridge (half_ridge_length from the centre). Skillion: one plane falling from the ridge line (its high edge) to the right of the bearing (bearing 0 to 360). Heights in metres above the model ground (area.js b). A building in parts ("m"): its outline cut by chords (cut: piece, edge, fraction x 10000, edge, fraction x 10000 on the ring of that piece; the piece is replaced by the part from the first point on and the rest is appended; roofs-layer.js pieces()), then one roof a part, the same columns plus shape code (m_shapes) and the run of a gable past the start and the end of its piece along the ridge (into a crossing wing, up to its ridge).',
    model: { fp: model_fp, sha256: sha(readFileSync(AREA)) }, rules: P,
    shapes: { g: 'gabled (LiDAR)', h: 'hipped (LiDAR)', p: 'pyramidal (LiDAR)', k: 'skillion (LiDAR)', go: 'gabled (OSM roof:shape)', ho: 'hipped (OSM roof:shape)', po: 'pyramidal (OSM roof:shape)' },
    columns: ['model index (delta from the previous row)', 'x dm', 'z dm', 'ridge bearing 0.1 deg', 'eave cm', 'ridge cm', 'half span dm', 'half ridge length dm (-1: gable)'],
    m_columns: ['model index (delta from the previous building in parts)', 'number of cuts', '5 integers a cut', 'then a part: shape code', 'x dm', 'z dm', 'ridge bearing 0.1 deg', 'eave cm', 'ridge cm', 'half span dm', 'half ridge length dm (-1)', 'run before the piece dm', 'run after the piece dm'],
    m_shapes: ['flat', 'gabled', 'hipped', 'pyramidal', 'skillion'], cut_rules: meas.cut_rules,
    counts, parts: { buildings: multi.length, was: from, part_shapes: partCounts }, osm_vs_lidar: agree, s: rows.map(r => r[1]).join(','), r: flatRows, m: mRows };
  writeFileSync(OUT, JSON.stringify(out) + '\n');
  console.error(JSON.stringify({ counts, parts: out.parts, osm_vs_lidar: agree, rows: rows.length }));
  return { roofs: { quads: q, about: { title: 'Roof shapes of the low buildings of the 3D model (gabled, hipped, pyramidal, skillion, in parts) with eave and ridge heights, from the EA LiDAR and OSM roof tags', licence: 'CC0 1.0 (contains EA LiDAR heights, OGL v3.0, and OpenStreetMap data, ODbL 1.0)', osm: true } } };
};
if (dry) { const r = await body(); console.log(JSON.stringify({ dry: true, triples: r.roofs.quads.length })); process.exit(0); }
const res = await flow.run(op, inputs, P, body);
const v = res.roofs, ehF = join(K, 'external-heads.json'), eh = JSON.parse(readFileSync(ehF, 'utf8'));
eh.roofs = v.iri; writeFileSync(ehF, JSON.stringify(eh, null, 1) + '\n');
console.log(JSON.stringify({ version: v.iri, triples: v.triples, new: flow.ran.length }));
