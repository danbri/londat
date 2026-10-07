// Puts a trained splat set (train-splat.sh output, .splat in model metres) on the 3D page: crops it to the area the
// drone frames cover, drops floaters and oversized splats, gives each splat its model building (for the music
// visualiser), and writes the set, its metadata and its line in the set list.
//
//   node magpie/cwplans/tools/publish-trained-splat.mjs data/raw/drone/<run>/<name>.splat <set-name> "<title>"
//
// in:  the .splat (32 bytes a splat), the run's transforms.json (frame positions), docklands/data/splats/cw-synth.json
//      (building groups: [centre x, centre z, base, top, model building index]), docklands/data/area.js (footprints)
// out: docklands/data/splats/<set-name>.splat.gz, .groups.bin.gz, .json; docklands/data/splats/index.json (adds or replaces the set)
// Lessons: skills/docklands-data-curation/SKILL.md, "Splats and drone frames".
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { TOOLS, pointIn } from './lib.mjs';

const CW = join(TOOLS, '..'), OUT = join(CW, 'docklands/data/splats');
const [src, name, title] = process.argv.slice(2);
if (!src || !name || !title) { console.error('usage: publish-trained-splat.mjs in.splat set-name "title"'); process.exit(2); }
const MARGIN = 150, Y0 = -30, Y1 = 260, MAX_SCALE = 25;   // m round the flown area; height band m OD; largest splat axis
const buf = readFileSync(join(CW, src)), n = buf.length / 32, f = new Float32Array(buf.buffer, buf.byteOffset, n * 8);
const T = JSON.parse(readFileSync(join(CW, dirname(src), 'transforms.json'), 'utf8'));
let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
for (const fr of T.frames) { const m = fr.transform_matrix; bx0 = Math.min(bx0, m[0][3]); bx1 = Math.max(bx1, m[0][3]); bz0 = Math.min(bz0, m[2][3]); bz1 = Math.max(bz1, m[2][3]); }
// the frames look inwards, so the flown box is the area seen; the margin keeps the edge of the estate
bx0 -= MARGIN; bx1 += MARGIN; bz0 -= MARGIN; bz1 += MARGIN;
const keep = []; let out = 0, big = 0, high = 0;
for (let i = 0; i < n; i++) {
  const x = f[i * 8], y = f[i * 8 + 1], z = f[i * 8 + 2], s = Math.max(f[i * 8 + 3], f[i * 8 + 4], f[i * 8 + 5]);
  if (!(x >= bx0 && x <= bx1 && z >= bz0 && z <= bz1)) { out++; continue; }
  if (!(y >= Y0 && y <= Y1)) { high++; continue; }
  if (!(s <= MAX_SCALE)) { big++; continue; }
  keep.push(i);
}
// building of each splat: inside a model footprint (2 m grace) and between its base - 2 m and top + 6 m
globalThis.window = globalThis; new Function(readFileSync(join(CW, 'docklands/data/area.js'), 'utf8'))();
const A = globalThis.DOCKLANDS_AREA, dec = q => { const o = new Float32Array(q.length), acc = [0, 0]; for (let i = 0; i < q.length; i++) { acc[i % 2] += q[i]; o[i] = acc[i % 2] / 10; } return o; };
const synth = JSON.parse(readFileSync(join(OUT, 'cw-synth.json'), 'utf8')), G = synth.groups, CELL = 20, grid = new Map();
const rings = G.map(([, , , , mi]) => { const b = A.buildings[mi], p = dec(b.p), nv = b.holes && b.holes.length ? b.holes[0] : p.length / 2, r = []; for (let j = 0; j < nv; j++) r.push([p[2 * j], p[2 * j + 1]]); return r; });
rings.forEach((r, g) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (let a = Math.floor((x0 - 2) / CELL); a <= Math.floor((x1 + 2) / CELL); a++) for (let b = Math.floor((z0 - 2) / CELL); b <= Math.floor((z1 + 2) / CELL); b++) { const k = a + ',' + b; (grid.get(k) || grid.set(k, []).get(k)).push(g); } });
const near = (x, z, r) => { if (pointIn([x, z], r)) return true; for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (pointIn([x + dx, z + dz], r)) return true; return false; };
const outB = Buffer.alloc(keep.length * 32), gid = new Uint16Array(keep.length); let grouped = 0;
keep.forEach((i, k) => {
  buf.copy(outB, k * 32, i * 32, i * 32 + 32);
  const x = f[i * 8], y = f[i * 8 + 1], z = f[i * 8 + 2]; let g = 65535;
  for (const c of grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) { const [, , base, top] = G[c]; if (y >= base - 2 && y <= top + 6 && near(x, z, rings[c])) { g = c; break; } }
  gid[k] = g; if (g !== 65535) grouped++;
});
writeFileSync(join(OUT, `${name}.splat.gz`), gzipSync(outB, { level: 9 }));
writeFileSync(join(OUT, `${name}.groups.bin.gz`), gzipSync(Buffer.from(gid.buffer), { level: 9 }));
const meta = { built: new Date().toISOString().slice(0, 10), file: `${name}.splat.gz`, format: synth.format, count: keep.length,
  box: { x0: bx0, x1: bx1, z0: bz0, z1: bz1 },
  method: `trained, not synthesised: OpenSplat on the CPU from ${T.frames.length} synthetic drone frames of the model (${src.split('/').slice(-2).join('/')}); cropped to the flown area plus ${MARGIN} m and ${Y0} to ${Y1} m OD, splats over ${MAX_SCALE} m dropped (${out + high + big} of ${n} removed)`,
  sources: synth.sources, groups_file: `${name}.groups.bin.gz`, groups_note: synth.groups_note + `; a splat is in a building when it lies inside the footprint (2 m grace) between base - 2 m and top + 6 m; ${grouped} of ${keep.length} grouped`, groups: G };
writeFileSync(join(OUT, `${name}.json`), JSON.stringify(meta));
const ix = JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8')); ix.sets = ix.sets.filter(s => s.name !== name).concat([{ name, title, count: keep.length }]);
writeFileSync(join(OUT, 'index.json'), JSON.stringify(ix, null, 1));
console.log(`${name}: ${keep.length} of ${n} kept (${out} outside the flown area, ${high} outside the height band, ${big} too large); ${grouped} in buildings`);
