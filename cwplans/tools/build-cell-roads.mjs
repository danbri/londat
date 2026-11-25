#!/usr/bin/env node
// The roads of one build cell (issue https://github.com/danbri/londat/issues/20; owner, 2026-11-25, of the cells: "Missing
// roads?", then "(C) please": the building look first, then roads). Outside the Docklands model and the places the UK had
// only the skeleton's motorways and A roads (OS Open Zoomstack); this adds the street network from OpenStreetMap through
// Overture's transportation theme, as lines the globe draws on its own ground (docklands/globe/places.js with ?cells=1).
//
//   node cwplans/tools/build-cell-roads.mjs --cell 8-255-200 --out <repo>/data/roads [--release 2026-11-18.0] [--raw <file>]
//
// One operation (cell-roads 1) over the Overture answer (fixed by SHA-256): segments of subtype road whose class is in
// CLASSES (major: motorway to tertiary; minor: residential, unclassified, living_street, service, pedestrian; footways,
// paths, tracks, cycleways and steps are left out in this version), each simplified (Douglas-Peucker, SIMPLIFY_M metres in
// a local metric frame), quantised to 1e-5 degree, and written to the file of the level-11 cell that holds the middle of
// its bounding box: <out>/11-<x>-<y>.json, format cell-roads-1 (below). A segment that crosses a cell edge is not cut: the
// globe asks for every level-11 cell in view, so it is drawn when its own cell is in view. Also <out>/8-<x>-<y>.json: the
// cell's summary (files, counts by class, km, bytes, the input hash), read by populate-cells.mjs for the tile index.
// Licence: OpenStreetMap data (ODbL 1.0) via Overture Maps; the credit is in every file.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const CW = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), argOf = k => { const i = argv.indexOf('--' + k); return i < 0 ? null : argv[i + 1]; };
const cell = argOf('cell'), m = /^8-(\d+)-(\d+)$/.exec(cell || ''); if (!m) { console.error('usage: build-cell-roads.mjs --cell 8-<x>-<y> --out <folder> [--release r] [--raw file]'); process.exit(2); }
const X8 = +m[1], Y8 = +m[2], S8 = 180 / 256, BB = [-180 + X8 * S8, -90 + Y8 * S8, -180 + (X8 + 1) * S8, -90 + (Y8 + 1) * S8];
const RELEASE = argOf('release') || '2026-11-18.0', OUT = resolve(argOf('out') || '.'); mkdirSync(OUT, { recursive: true });
export const CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'pedestrian'];
export const MAJOR = 5;   // class index < MAJOR: the major layer
const SIMPLIFY_M = 2, Q = 1e5, VERSION = 1;
const CREDIT = '© OpenStreetMap contributors (ODbL 1.0), via Overture Maps Foundation transportation theme';

// the Overture answer: one DuckDB query over the cell box (cwplans/tools/fetch-overture-theme.py, NDJSON)
const raw = argOf('raw') || join(CW, 'data', 'raw', 'places', 'cell-' + cell, `overture-roads-${RELEASE}.ndjson`);
if (!existsSync(raw) || !existsSync(raw + '.meta.json')) { mkdirSync(dirname(raw), { recursive: true });
  execFileSync(process.env.CWPLANS_DUCKDB_PYTHON || 'python3', ['-I', join(CW, 'tools', 'fetch-overture-theme.py'), RELEASE, 'transportation', 'segment', ...BB.map((v, i) => (i < 2 ? Math.floor(v * 100) / 100 : Math.ceil(v * 100) / 100).toFixed(2)), raw, 'class,names.primary', `subtype = 'road' AND class IN (${CLASSES.map(c => `'${c}'`).join(', ')})`], { stdio: 'inherit' }); }
const h = createHash('sha256'); for await (const c of createReadStream(raw)) h.update(c); const rawSha = h.digest('hex');

// Douglas-Peucker on [x, y] metres
function dp(P, tol) {
  if (P.length < 3) return P; const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1; const st = [[0, P.length - 1]];
  while (st.length) { const [a, b] = st.pop(); const [ax, ay] = P[a], [bx, by] = P[b], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; let im = -1, dm = tol;
    for (let i = a + 1; i < b; i++) { const [px, py] = P[i]; let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(px - ax - t * dx, py - ay - t * dy); if (d > dm) { dm = d; im = i; } }
    if (im >= 0) { keep[im] = 1; st.push([a, im], [im, b]); } }
  return P.filter((_, i) => keep[i]);
}
const S11 = 180 / 2 ** 11, files = new Map(), byClass = {}, kmByClass = {};
let n = 0, pts = 0, ptsIn = 0, outside = 0;
for await (const line of createInterface({ input: createReadStream(raw), crlfDelay: Infinity })) {
  if (!line) continue; const r = JSON.parse(line), ci = CLASSES.indexOf(r.class), g = r.geometry; if (ci < 0 || !g) continue;
  const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  for (const C of lines) { if (C.length < 2) continue;
    let w = 180, s = 90, e = -180, nn = -90; for (const [x, y] of C) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); nn = Math.max(nn, y); }
    const mx = (w + e) / 2, my = (s + nn) / 2; if (mx < BB[0] || mx >= BB[2] || my < BB[1] || my >= BB[3]) { outside++; continue; }   // (the middle in this cell: no segment twice)
    const kx = 111320 * Math.cos(my * Math.PI / 180), ky = 110574, P = dp(C.map(([x, y]) => [(x - mx) * kx, (y - my) * ky]), SIMPLIFY_M);
    let km = 0; for (let i = 1; i < C.length; i++) km += Math.hypot((C[i][0] - C[i - 1][0]) * kx, (C[i][1] - C[i - 1][1]) * ky) / 1000;
    const key = `11-${Math.floor((mx + 180) / S11)}-${Math.floor((my + 90) / S11)}`, F = files.get(key) || files.set(key, { lines: [], names: [], nameIx: new Map() }).get(key);
    const nm = r.names_primary || null; let ni = -1; if (nm) { ni = F.nameIx.get(nm); if (ni == null) { ni = F.names.length; F.names.push(nm); F.nameIx.set(nm, ni); } }
    const rec = [ci, ni]; let px = 0, py = 0;
    for (const [x, y] of P) { const qx = Math.round((x / kx + mx) * Q), qy = Math.round((y / ky + my) * Q); rec.push(qx - px, qy - py); px = qx; py = qy; }
    F.lines.push(rec); n++; pts += P.length; ptsIn += C.length; byClass[r.class] = (byClass[r.class] || 0) + 1; kmByClass[r.class] = (kmByClass[r.class] || 0) + km; }
}
let bytes = 0; const list = [];
for (const [key, F] of [...files].sort()) {
  const body = JSON.stringify({ format: 'cell-roads-1', cell: key, q: Q, classes: CLASSES, major: MAJOR, credit: CREDIT, names: F.names, lines: F.lines });
  writeFileSync(join(OUT, key + '.json'), body); bytes += body.length; list.push(key);
}
const sum = { format: 'cell-roads-summary-1', cell, operation: 'cell-roads', version: VERSION, release: RELEASE, input: { file: raw.replace(CW + '/', ''), sha256: rawSha },
  rule: `Overture transportation segments of subtype road and class ${CLASSES.join(', ')}; Douglas-Peucker ${SIMPLIFY_M} m; quantised to 1/${Q} degree; each in the level-11 cell of its bbox middle (cells of 180 / 2^11 degrees, y from 90 S); the middle must be in the build cell`,
  credit: CREDIT, files: list, segments: n, points_in: ptsIn, points: pts, by_class: byClass, km_by_class: Object.fromEntries(Object.entries(kmByClass).map(([k, v]) => [k, Math.round(v)])), outside_cell: outside, bytes, built: new Date().toISOString(),
  lines_format: 'lines: [class index, name index or -1, x0, y0, dx1, dy1, ...] in 1/q degree (x lon, y lat; deltas after the first point)' };
writeFileSync(join(OUT, cell + '.json'), JSON.stringify(sum, null, 1) + '\n');
console.log(`roads ${cell}: ${n} segments, ${pts} points (from ${ptsIn}), ${list.length} files, ${(bytes / 1e6).toFixed(2)} MB`);
