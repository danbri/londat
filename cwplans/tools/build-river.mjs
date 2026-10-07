// River paths for the animated boats in the 3D page's pixel-art style: the Thames centreline through the model box,
// with the half-width at each point (so boats keep to lanes on the water), and the outline of Eden Dock (the swimming
// area in Middle Dock).
//
//   node magpie/cwplans/tools/build-river.mjs
//
// in:  docklands/data/area.js (water polygons: the unnamed tidal polygons are the Thames)
// out: docklands/data/river.json  { thames: [[x, z, half-width m]...] west to east, every 20 m; eden: ring }
// Method: rasterise the Thames on an 8 m grid; chamfer distance to the bank; Dijkstra from the widest cell at the west
// edge to the widest at the east edge with a step cost that falls with distance to the bank, so the path keeps to the
// middle; smooth and resample.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOLS, pointIn } from './lib.mjs';

const CW = join(TOOLS, '..');
globalThis.window = globalThis; new Function(readFileSync(join(CW, 'docklands/data/area.js'), 'utf8'))();
const A = globalThis.DOCKLANDS_AREA, E = A.meta.extent, CELL = 8;
const dec = (q, stride = 2) => { const o = new Float32Array(q.length), acc = new Array(stride).fill(0); for (let i = 0; i < q.length; i++) { acc[i % stride] += q[i]; o[i] = acc[i % stride] / 10; } return o; };
const rings = w => { const f = dec(w.p), starts = [0, ...(w.holes || []), f.length / 2]; return starts.slice(0, -1).map((s, k) => { const r = []; for (let i = s; i < starts[k + 1]; i++) r.push([f[2 * i], f[2 * i + 1]]); return r; }); };
const thames = A.water.filter(w => w.tidal && (!w.n || /Thames/i.test(w.n))).map(rings);
const nx = Math.ceil((E.x1 - E.x0) / CELL), nz = Math.ceil((E.z1 - E.z0) / CELL), mask = new Uint8Array(nx * nz);
for (const rs of thames) {
  const [outer, ...holes] = rs; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (let j = Math.max(0, Math.floor((z0 - E.z0) / CELL)); j <= Math.min(nz - 1, Math.ceil((z1 - E.z0) / CELL)); j++) for (let i = Math.max(0, Math.floor((x0 - E.x0) / CELL)); i <= Math.min(nx - 1, Math.ceil((x1 - E.x0) / CELL)); i++) {
    const p = [E.x0 + (i + .5) * CELL, E.z0 + (j + .5) * CELL]; if (pointIn(p, outer) && !holes.some(h => pointIn(p, h))) mask[j * nx + i] = 1; }
}
// chamfer distance (cells) to the nearest non-water cell
const D = new Float32Array(nx * nz).map((_, k) => mask[k] ? 1e9 : 0);
const pass = (fw) => { const r = fw ? [...Array(nz).keys()] : [...Array(nz).keys()].reverse(), c = fw ? [...Array(nx).keys()] : [...Array(nx).keys()].reverse(), s = fw ? -1 : 1;
  for (const j of r) for (const i of c) { const k = j * nx + i; if (!mask[k]) continue; let v = D[k];
    for (const [di, dj, w] of [[s, 0, 1], [0, s, 1], [s, s, 1.414], [-s, s, 1.414]]) { const a = i + di, b = j + dj; const d = (a < 0 || b < 0 || a >= nx || b >= nz) ? 0 : D[b * nx + a]; if (d + w < v) v = d + w; } D[k] = v; } };
pass(true); pass(false); pass(true); pass(false);
// widest water cell in the westmost and eastmost columns that have water
const colBest = i => { let best = -1, bd = 0; for (let j = 0; j < nz; j++) { const k = j * nx + i; if (mask[k] && D[k] > bd) { bd = D[k]; best = k; } } return best; };
let i0 = 0; while (i0 < nx && colBest(i0) < 0) i0++; let i1 = nx - 1; while (i1 > 0 && colBest(i1) < 0) i1--;
const start = colBest(i0), goal = colBest(i1);
// Dijkstra: cost per step falls with the distance to the bank
const dist = new Float64Array(nx * nz).fill(Infinity), prev = new Int32Array(nx * nz).fill(-1), heap = [[0, start]]; dist[start] = 0;
const push = x => { heap.push(x); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t; };
while (heap.length) { const [d, k] = pop(); if (d > dist[k]) continue; if (k === goal) break; const i = k % nx, j = (k / nx) | 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const q = b * nx + a; if (!mask[q]) continue;
    const c = Math.hypot(di, dj) / Math.pow(D[q] + 1, 1.5); if (d + c < dist[q]) { dist[q] = d + c; prev[q] = k; push([d + c, q]); } } }
if (!isFinite(dist[goal])) throw new Error('no water path from west to east');
const path = []; for (let k = goal; k !== -1; k = prev[k]) path.push(k); path.reverse();
// to metres, smooth (moving average over 9 cells), resample every 20 m
let pts = path.map(k => [E.x0 + (k % nx + .5) * CELL, E.z0 + (((k / nx) | 0) + .5) * CELL, D[k] * CELL]);
pts = pts.map((_, i) => { let s = [0, 0, 0], n = 0; for (let d = -4; d <= 4; d++) { const p = pts[Math.max(0, Math.min(pts.length - 1, i + d))]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; n++; } return s.map(v => v / n); });
const out = [pts[0]]; let acc = 0; for (let i = 1; i < pts.length; i++) { acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (acc >= 20) { out.push(pts[i]); acc = 0; } }
const eden = A.water.find(w => w.n === 'Eden Dock'), edenRing = eden ? rings(eden)[0].map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]) : null;
const len = out.reduce((s, p, i) => i ? s + Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) : 0, 0);
writeFileSync(join(CW, 'docklands/data/river.json'), JSON.stringify({ built: new Date().toISOString().slice(0, 10), method: 'Thames centreline from the OSM water polygons: 8 m raster, chamfer distance to the bank, least-cost path west to east, smoothed, every 20 m; third value = distance to the bank (m)',
  thames: out.map(p => p.map(v => Math.round(v * 10) / 10)), eden: edenRing, eden_level: eden?.level ?? null }));
console.log(`river.json: ${out.length} points, ${(len / 1000).toFixed(1)} km, half-width ${Math.min(...out.map(p => p[2])).toFixed(0)}..${Math.max(...out.map(p => p[2])).toFixed(0)} m; Eden Dock ${edenRing ? edenRing.length + ' points' : 'not found'}`);
