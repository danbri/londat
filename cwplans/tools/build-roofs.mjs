// Roof shapes for the ordinary model buildings of the 3D page (the extruded OSM outlines of area.js), from evidence:
// the Environment Agency 1 m LiDAR (tools/lidar-roofs.py fits flat, gable and hipped roofs to the DSM in each outline's
// minimum-area rectangle) and the OSM tags roof:shape, roof:height, roof:levels, roof:orientation (osmium on the Greater
// London extract). Classifies each building (gabled, hipped, pyramidal, flat, complex, no data), gives the ridge line,
// the eave and ridge heights above the model ground, and writes the page file cwplans/docklands/data/roofs.json. One
// logged operation (kgx-ops Flow; log in londat kgx/log), graph version roofs, named in kgx/external-heads.json.
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
const P = { hmax: 25, inset: 0.75, min_cells: 8, slope_min: 0.18, slope_max: 1.8, rise_min: 1.0, eave_min: 2.0, mad_max: 0.45, mad_ratio: 0.7, rise_over_mad: 4, hip_gain: 0.8, pyramid_ratio: 1.2, flat_mad: 0.3, osm_pitch_deg: 35 };
const op = { id: 'build-roofs', version: 1, skill: 'docklands-3d-page', tool: 'cwplans/tools/build-roofs.mjs',
  about: 'EA LiDAR 2022 DSM and DTM tiles + OSM roof tags + the model outlines in area.js -> roof shape, ridge line, eave and ridge heights of each low model building (docklands/data/roofs.json)' };

const dry = !!process.env.ROOFS_DRY, flow = new Flow(K);
const inputs = dry ? [] : [flow.file(AREA, 'cwplans/docklands/data/area.js'), flow.file(KEYS, 'cwplans/docklands/data/building-keys.json'), flow.file(PY, 'cwplans/tools/lidar-roofs.py'),
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
function classify(r) {
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
  const best = hip && (!gab || hip.mad < P.hip_gain * gab.mad) ? hip : gab;
  if (!best) return { shape: fm <= P.flat_mad ? 'flat' : 'complex', mad: fm, R: f.flat.p[0] };
  return { shape: best.m === 'hipped' ? (r.L / r.W < P.pyramid_ratio ? 'pyramidal' : 'hipped') : 'gabled', from: 'lidar', ...best };
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
  const counts = {}, agree = {}, rows = [], N = F.namedNode, V = VOCAB, q = [], XSD = 'http://www.w3.org/2001/XMLSchema#';
  const lit = (x, dt) => F.literal(String(x), dt ? N(XSD + dt) : undefined), add = (s, p, o) => q.push(F.quad(N(s), N(p), o, F.defaultGraph()));
  A.buildings.forEach((b, i) => {
    if (b.h > P.hmax || b.mh || (b.holes && b.holes.length)) return;
    const r = meas.buildings[i], t = tags.get(ids[i]), os = t && t['roof:shape'];
    let c = classify(r);
    if (os) { const k = `${os} / ${c.shape}`; agree[k] = (agree[k] || 0) + 1; }
    if (c.shape === 'complex' || c.shape === 'nodata') { const o = fromOsm(t, r, b); if (o) c = o; }
    const key = (c.from === 'osm' ? 'osm ' : '') + c.shape; counts[key] = (counts[key] || 0) + 1;
    if (!c.from) return;
    const x = c.c[0] - E0, z = -(c.c[1] - N0), br = ((Math.atan2(c.dir[0], c.dir[1]) * 180 / Math.PI) % 180 + 180) % 180;
    rows.push([i, c.shape[0] + (c.from === 'osm' ? 'o' : ''), Math.round(x * 10), Math.round(z * 10), Math.round(br * 10), Math.round(c.eave * 100), Math.round(c.R * 100), Math.round(c.hs * 10), c.hl == null ? -1 : Math.round(c.hl * 10)]);
    const s = kid('building', 'osm-' + ids[i]);
    add(s, V + 'roofShape', lit(c.shape)); add(s, V + 'roofEaveHeight', lit(c.eave.toFixed(2), 'decimal')); add(s, V + 'roofRidgeHeight', lit(c.R.toFixed(2), 'decimal'));
    add(s, V + 'roofRidgeBearing', lit(br.toFixed(1), 'decimal')); add(s, V + 'roofBasis', lit(c.from === 'lidar' ? `EA LiDAR composite DSM 2022 1 m, fit error ${c.mad.toFixed(2)} m (median absolute)` : 'OSM roof:shape' + (t['roof:height'] ? ', roof:height' : t['roof:levels'] ? ', roof:levels' : ', assumed 35 deg pitch')));
  });
  // page file: one row a building, columns in "columns"; delta-coded model index
  let prev = 0; const flatRows = [];
  for (const r of rows) { flatRows.push(r[0] - prev, ...r.slice(2)); prev = r[0]; }
  const out = { about: 'Roof shapes of the low model buildings of the 3D page, made by tools/build-roofs.mjs (do not edit by hand) from the EA LiDAR composite first-return DSM 2022 1 m (tools/lidar-roofs.py) and OSM roof tags. Valid while model.fp matches the page (MFP). Each building: the ridge line through (x, z) in page metres along the bearing (degrees from grid north, 0 to 180), roof planes falling from the ridge at (ridge - eave) / half_span on each side; hipped and pyramidal roofs also fall at the same slope from the ends of the ridge (half_ridge_length from the centre). Heights in metres above the model ground (area.js b).',
    model: { fp: model_fp, sha256: sha(readFileSync(AREA)) }, rules: P,
    shapes: { g: 'gabled (LiDAR)', h: 'hipped (LiDAR)', p: 'pyramidal (LiDAR)', go: 'gabled (OSM roof:shape)', ho: 'hipped (OSM roof:shape)', po: 'pyramidal (OSM roof:shape)' },
    columns: ['model index (delta from the previous row)', 'x dm', 'z dm', 'ridge bearing 0.1 deg', 'eave cm', 'ridge cm', 'half span dm', 'half ridge length dm (-1: gable)'],
    counts, osm_vs_lidar: agree, s: rows.map(r => r[1]).join(','), r: flatRows };
  writeFileSync(OUT, JSON.stringify(out) + '\n');
  console.error(JSON.stringify({ counts, osm_vs_lidar: agree, rows: rows.length }));
  return { roofs: { quads: q, about: { title: 'Roof shapes of the low buildings of the 3D model (gabled, hipped, pyramidal) with eave and ridge heights, from the EA LiDAR and OSM roof tags', licence: 'CC0 1.0 (contains EA LiDAR heights, OGL v3.0, and OpenStreetMap data, ODbL 1.0)', osm: true } } };
};
if (dry) { const r = await body(); console.log(JSON.stringify({ dry: true, triples: r.roofs.quads.length })); process.exit(0); }
const res = await flow.run(op, inputs, P, body);
const v = res.roofs, ehF = join(K, 'external-heads.json'), eh = JSON.parse(readFileSync(ehF, 'utf8'));
eh.roofs = v.iri; writeFileSync(ehF, JSON.stringify(eh, null, 1) + '\n');
console.log(JSON.stringify({ version: v.iri, triples: v.triples, new: flow.ran.length }));
