// Measured skyline by year: the height of each model building on the Canary Wharf estate (and 300 m round it) in every
// EA LiDAR surface model from 1999 to 2022. Drives the year slider in the 3D page.
//
//   bash cwplans/tools/fetch-dsm.sh          # the DSM tiles (TQ3575, TQ3580; about 1 GB of ZIPs, not committed)
//   node cwplans/tools/build-skyline.mjs
//
// in:  data/raw/dsm/<product>-<year>-<res>-<tile>.zip (GeoTIFF or ESRI ASCII grid inside), docklands/data/area.js
// out: docklands/data/skyline.json  { years, surveys, buildings: { <model building index>: [dm per year | null] } }
// Rule: height in a year = 90th percentile of the DSM cells inside the footprint (1 m sampling) minus the building's
// ground level in the model (the 2020s DTM). Under 3 m, or under a quarter of today's height (a cleared site with
// hoardings): not there that year (0). No cells with data: null (not flown). A survey that flew under 20% of the box is left out.
// The footprints are today's OSM outlines, so buildings demolished before today do not appear (limit, said in the page).
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fromArrayBuffer } from 'geotiff';
import { TOOLS, pointIn } from './lib.mjs';
import { ORIGIN } from './fetch-docklands.mjs';

const CW = join(TOOLS, '..'), DSM = join(CW, 'data/raw/dsm');
globalThis.window = globalThis; new Function(readFileSync(join(CW, 'docklands/data/area.js'), 'utf8'))();
const A = globalThis.DOCKLANDS_AREA, F = A.meta.focus, BOX = [F.x0 - 300, F.x1 + 300, F.z0 - 300, F.z1 + 300];
const dec = (q, stride = 2) => { const o = new Float32Array(q.length), acc = new Array(stride).fill(0); for (let i = 0; i < q.length; i++) { acc[i % stride] += q[i]; o[i] = acc[i % stride] / 10; } return o; };

// ---- rasters: { e0, n0 (top-left corner, BNG), res, w, h, data Float32Array, nodata }
async function readGrid(zip) {
  const tmp = mkdtempSync(join(tmpdir(), 'dsm-')), out = [];
  try {
    execFileSync('unzip', ['-q', '-o', zip, '-d', tmp]);
    const files = execFileSync('find', [tmp, '-type', 'f'], { encoding: 'utf8' }).split('\n').filter(f => /\.(tif|tiff|asc)$/i.test(f));
    for (const f of files) {
      if (/\.asc$/i.test(f)) {   // ESRI ASCII grid: six header lines, then rows north to south
        const txt = readFileSync(f, 'latin1'), lines = txt.split('\n'), hd = {}; let i = 0;
        for (; i < 6; i++) { const [k, v] = lines[i].trim().split(/\s+/); hd[k.toLowerCase()] = +v; }
        const w = hd.ncols, h = hd.nrows, res = hd.cellsize, data = new Float32Array(w * h); let k = 0;
        for (; i < lines.length && k < w * h; i++) for (const v of lines[i].trim().split(/\s+/)) if (v !== '') data[k++] = +v;
        const e0 = hd.xllcorner ?? hd.xllcenter - res / 2, s0 = hd.yllcorner ?? hd.yllcenter - res / 2;
        out.push({ e0, n0: s0 + h * res, res, w, h, data, nodata: hd.nodata_value ?? -9999 });
      } else {
        const b = readFileSync(f), tif = await fromArrayBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), img = await tif.getImage();
        let x0, y1, rx; try { [x0, , , y1] = img.getBoundingBox(); [rx] = img.getResolution(); } catch {   // no geokeys: the world file next to it
          const tfw = readFileSync(f.replace(/\.tiff?$/i, '.tfw'), 'utf8').trim().split(/\s+/).map(Number); rx = tfw[0]; x0 = tfw[4] - rx / 2; y1 = tfw[5] - tfw[3] / 2; }
        const [r] = await img.readRasters(), when = /_(\d{8})_(\d{8})/.exec(f);
        out.push({ e0: x0, n0: y1, res: rx, w: img.getWidth(), h: img.getHeight(), data: r instanceof Float32Array ? r : Float32Array.from(r), nodata: +(img.getGDALNoData() ?? -9999), ...(when ? { from: when[1], to: when[2] } : {}) });
      }
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return out;
}
const sample = (grids, E, N) => { for (const g of grids) { const c = Math.floor((E - g.e0) / g.res), r = Math.floor((g.n0 - N) / g.res); if (c < 0 || r < 0 || c >= g.w || r >= g.h) continue; const v = g.data[r * g.w + c]; if (v === g.nodata || !(v > -100 && v < 1000)) return null; return v; } return null; };

// ---- buildings in the box
const blds = [];
A.buildings.forEach((b, i) => {
  const f = dec(b.p), nv = b.holes && b.holes.length ? b.holes[0] : f.length / 2, ring = []; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let j = 0; j < nv; j++) { ring.push([f[2 * j], f[2 * j + 1]]); x0 = Math.min(x0, f[2 * j]); x1 = Math.max(x1, f[2 * j]); z0 = Math.min(z0, f[2 * j + 1]); z1 = Math.max(z1, f[2 * j + 1]); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; if (cx < BOX[0] || cx > BOX[1] || cz < BOX[2] || cz > BOX[3]) return;
  // sample points inside the footprint, 1 m apart (at least the centre)
  const pts = []; for (let z = z0 + .5; z < z1; z += 1) for (let x = x0 + .5; x < x1; x += 1) if (pointIn([x, z], ring)) pts.push([x + ORIGIN.E0, -z + ORIGIN.N0]);
  if (!pts.length) pts.push([cx + ORIGIN.E0, -cz + ORIGIN.N0]);
  blds.push({ i, base: b.b, today: b.h, pts: pts.length > 4000 ? pts.filter((_, k) => k % Math.ceil(pts.length / 4000) === 0) : pts });
});
console.log(`${blds.length} buildings in the box`);

// ---- one survey per year
const zips = readdirSync(DSM).filter(f => f.endsWith('.zip')), byYear = new Map();
for (const z of zips) { const m = /^(.+)-(\d{4})-([\d.]+)-(TQ\d{4})\.zip$/.exec(z); if (m) (byYear.get(+m[2]) || byYear.set(+m[2], []).get(+m[2])).push({ zip: join(DSM, z), product: m[1], res: +m[3], tile: m[4] }); }
const years = [...byYear.keys()].sort(), surveys = [], H = new Map(blds.map(b => [b.i, []]));
for (const y of years) {
  const grids = []; for (const z of byYear.get(y)) grids.push(...await readGrid(z.zip));
  let flown = 0;
  for (const b of blds) {
    const v = b.pts.map(([E, N]) => sample(grids, E, N)).filter(v => v != null);
    if (v.length < Math.max(1, b.pts.length * .3)) { H.get(b.i).push(null); continue; }
    flown++; v.sort((p, q) => p - q); const h = v[Math.floor(v.length * .9)] - b.base;
    H.get(b.i).push(h < Math.max(3, b.today * .25) ? 0 : Math.round(h * 10));   // a site with hoardings is not the tower yet
  }
  const s = byYear.get(y)[0], d = grids.filter(g => g.from), iso = v => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  surveys.push({ year: y, product: s.product, res_m: s.res, tiles: byYear.get(y).map(z => z.tile), flown_from: d.length ? iso(d.map(g => g.from).sort()[0]) : null, flown_to: d.length ? iso(d.map(g => g.to).sort().at(-1)) : null, buildings_flown: flown });
  console.log(`${y}: ${s.product} ${s.res} m, ${grids.length} rasters, ${flown} of ${blds.length} buildings with data`);
}
// a survey that flew less than a fifth of the box is listed under not_used and left out of the slider
const keep = surveys.map(sv => sv.buildings_flown >= blds.length * .2), not_used = surveys.filter((_, k) => !keep[k]).map(sv => ({ ...sv, reason: 'flew less than 20% of the buildings in the box' }));
for (const [i, h] of H) H.set(i, h.filter((_, k) => keep[k]));
const out = { built: new Date().toISOString().slice(0, 10), years: years.filter((_, k) => keep[k]), surveys: surveys.filter((_, k) => keep[k]), not_used, box: { x0: BOX[0], x1: BOX[1], z0: BOX[2], z1: BOX[3] },
  rule: 'height = 90th percentile of the DSM inside today\'s OSM footprint minus the model ground; 0 = under 3 m or under a quarter of today\'s height (not there); null = not flown. Decimetres.',
  attribution: 'EA LiDAR DSM 1999-2022 © Environment Agency (OGL v3.0); footprints © OpenStreetMap contributors (ODbL)',
  buildings: Object.fromEntries([...H].map(([i, h]) => [i, h])) };
writeFileSync(join(CW, 'docklands/data/skyline.json'), JSON.stringify(out));
console.log(`skyline.json: ${years.length} years, ${H.size} buildings`);
