// Wildlife layer of the Three.js port: which species the simulation puts where, by habitat, month and time of day, and
// where the foxes are. The camera is set over the densest 400 m window of each habitat class of the file's 10 m raster
// (cwplans/docklands/data/wildlife.json) and over Canary Wharf Pier, at noon in January, April, July and October and at
// night in October; each animal drawn is classed by the raster cell under it (water within 30 m counts for waterbirds, as
// the tool's rule).
//   node docklands/test/wildlife-check.mjs --base http://127.0.0.1:8613 [--out docklands/test/out/audit/wildlife]
// Results: docklands/AUDIT.md, item 4. Skill: docklands-3d-page, "Three.js port".
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8613'), OUT = arg('--out', 'docklands/test/out/audit/wildlife'); mkdirSync(OUT, { recursive: true });
const D = JSON.parse(readFileSync('cwplans/docklands/data/wildlife.json', 'utf8')), H = D.habitats, C = H.classes;
const R = new Uint8Array(H.nx * H.nz); for (let i = 0, p = 0; i < H.rle.length; i += 2) { R.fill(H.rle[i], p, p + H.rle[i + 1]); p += H.rle[i + 1]; }
const cls = (x, z) => { const i = Math.floor((x - H.x0) / H.cell), j = Math.floor((z - H.z0) / H.cell); return i < 0 || j < 0 || i >= H.nx || j >= H.nz ? -1 : R[j * H.nx + i]; };
const nearWater = (x, z) => { for (let dx = -30; dx <= 30; dx += 10) for (let dz = -30; dz <= 30; dz += 10) { const c = C[cls(x + dx, z + dz)]; if (c === 'river' || c === 'dock' || c === 'pond') return c; } return null; };
// the densest 400 m window (40 x 40 cells, step 10 cells) of each class
const best = {}; for (let c = 1; c < C.length; c++) { let b = null;
  for (let j = 0; j + 40 <= H.nz; j += 10) for (let i = 0; i + 40 <= H.nx; i += 10) { let n = 0; for (let jj = j; jj < j + 40; jj++) for (let ii = i; ii < i + 40; ii++) if (R[jj * H.nx + ii] === c) n++;
    if (!b || n > b.n) b = { n, x: H.x0 + (i + 20) * H.cell, z: H.z0 + (j + 20) * H.cell }; }
  best[C[c]] = b; }
const SPOTS = { river_cw_pier: { x: -640, z: -30 }, ...Object.fromEntries(Object.entries(best).filter(([k]) => k !== 'river').map(([k, v]) => [k, { x: v.x, z: v.z, share: +(v.n / 1600).toFixed(2) }])) };
console.log('spots', JSON.stringify(SPOTS));
const TIMES = ['2026-01-15T12:00', '2026-04-15T12:00', '2026-07-15T12:00', '2026-10-15T12:00', '2026-10-15T21:30'];
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } }), errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`${BASE}/docklands/?webgl&animate=0&weather=0&wheels=0&layers=tide,wildlife&t=${TIMES[0]}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && __docklands3.layers.wildlife && __docklands3.layers.wildlife.api, null, { timeout: 300000 });
const res = { spots: SPOTS, runs: {} };
for (const t of TIMES) for (const [name, s] of Object.entries(SPOTS)) {
  const A = await page.evaluate(async ({ t, s }) => { const D3 = __docklands3; D3.setClock(D3.fromLondon(t)); D3.setCam({ tx: s.x, tz: s.z, ty: 2, dist: 160, yaw: 0.6, pitch: 0.7 });
    for (let k = 0; k < 12; k++) { D3.draw(); await new Promise(r => setTimeout(r, 300)); }
    return { list: D3.layers.wildlife.api.animals, stats: { ...D3.layers.wildlife.api.stats } }; }, { t, s });
  const bySp = {}, byHab = {}, foxes = [];
  for (const a of A.list) { const h = C[cls(a.x, a.z)] ?? 'outside', w = nearWater(a.x, a.z), hh = /swim|dive/.test(a.st) ? (w || h) : h;
    bySp[a.id] = (bySp[a.id] || 0) + 1; (byHab[hh] ||= {})[a.id] = (byHab[hh][a.id] || 0) + 1;
    if (a.id === 'fox') { let near = null; for (let r = 0; r <= 100 && !near; r += 10) for (let k = 0; k < 16 && !near; k++) { const c = C[cls(a.x + r * Math.cos(k * Math.PI / 8), a.z + r * Math.sin(k * Math.PI / 8))]; if (c === 'wood' || c === 'park' || c === 'garden') near = { c, r }; } foxes.push({ x: Math.round(a.x), z: Math.round(a.z), on: h, st: a.st, parkOrWoodWithin: near }); } }
  (res.runs[t] ||= {})[name] = { drawn: A.list.length, phase: A.stats.phase, bySp, byHab, foxes };
  console.log(t, name, A.list.length, A.stats.phase, JSON.stringify(bySp), foxes.length ? JSON.stringify(foxes) : '');
}
await browser.close();
res.errors = errors;
writeFileSync(`${OUT}/wildlife.json`, JSON.stringify(res, null, 1));
if (errors.length) console.log('page errors', errors.slice(0, 5));
