// Gaussian splats synthesised straight from the Docklands 3D model (no training): the Canary Wharf Group estate and
// about 300 m round it. Ground discs take the 2008 EA aerial photograph; roofs of low buildings too; walls are
// wall-colour discs per 3.6 m storey and 7.2 m of wall (--cell), each with one glass-band disc in front.
//
//   node magpie/cwplans/tools/build-splats.mjs [--ground 4] [--cell 7.2] [--box x0,x1,z0,z1]
// Every input and output, with endpoints and rules: magpie/cwplans/pipeline.json, activity "build-splats".
//
// in:  docklands/data/area.js (buildings, terrain), data/raw/imagery/rgb2008.ppm (raw copy written by tools/build-aerial.py)
// out: docklands/data/splats/cw-synth.groups.bin.gz  the building of each splat (for animation; see cw-synth.json groups)
//      docklands/data/splats/cw-synth.splat.gz  standard 32-byte .splat records (position 3 x f32, scale 3 x f32 as sigma
//        in metres, rgba 4 x u8, rotation quaternion w x y z as 4 x u8 = q * 128 + 128), gzipped; model axes and metres
//        (x east, y up, z south; see docklands/README.md)
//      docklands/data/splats/cw-synth.json   box, counts, method
//      data/raw/splats/cw-synth.ply          the same splats as a standard 3DGS PLY (f_dc, logit opacity, log scale), local
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { TOOLS, pointIn } from './lib.mjs';

const CW = join(TOOLS, '..'), arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
globalThis.window = globalThis; new Function(readFileSync(join(CW, 'docklands/data/area.js'), 'utf8'))();
const A = globalThis.DOCKLANDS_AREA, T = A.terrain, F = A.meta.focus;
const BOX = (arg('box', '') ? arg('box').split(',').map(Number) : [F.x0 - 300, F.x1 + 300, F.z0 - 300, F.z1 + 300]);
const GSTEP = +arg('ground', 4), CELL = +arg('cell', 7.2);   // ground disc spacing; wall cell width (two 3.6 m window bays)
const inBox = (x, z) => x >= BOX[0] && x <= BOX[1] && z >= BOX[2] && z <= BOX[3];

// ---- ground image (raw PPM, 3 m a pixel over the model box in textures.json)
const TEX = JSON.parse(readFileSync(join(CW, 'docklands/data/tex/textures.json'), 'utf8')).box;
const ppm = readFileSync(join(CW, 'data/raw/imagery/rgb2008.ppm')), hm = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(ppm.toString('latin1', 0, 40)), PW = +hm[1], PH = +hm[2], pix0 = hm[0].length;
function img(x, z) {   // bilinear RGB 0..1 at model x, z
  const u = (x - TEX.x0) / (TEX.x1 - TEX.x0) * PW - .5, v = (z - TEX.z0) / (TEX.z1 - TEX.z0) * PH - .5, i = Math.max(0, Math.min(PW - 2, Math.floor(u))), j = Math.max(0, Math.min(PH - 2, Math.floor(v))), fu = Math.min(1, Math.max(0, u - i)), fv = Math.min(1, Math.max(0, v - j));
  const at = (a, b, c) => ppm[pix0 + 3 * (b * PW + a) + c] / 255;
  return [0, 1, 2].map(c => (at(i, j, c) * (1 - fu) + at(i + 1, j, c) * fu) * (1 - fv) + (at(i, j + 1, c) * (1 - fu) + at(i + 1, j + 1, c) * fu) * fv);
}
const ground = (x, z) => { const u = (x - T.x0) / T.cell, v = (z - T.z0) / T.cell, i = Math.max(0, Math.min(T.nx - 2, Math.floor(u))), j = Math.max(0, Math.min(T.nz - 2, Math.floor(v))), fu = u - i, fv = v - j, h = (a, b) => T.dm[b * T.nx + a] / 10;
  return (h(i, j) * (1 - fu) + h(i + 1, j) * fu) * (1 - fv) + (h(i, j + 1) * (1 - fu) + h(i + 1, j + 1) * fu) * fv; };
const dec = (q, stride = 2) => { const o = new Float32Array(q.length), acc = new Array(stride).fill(0); for (let i = 0; i < q.length; i++) { acc[i % stride] += q[i]; o[i] = acc[i % stride] / 10; } return o; };
const hash = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };

// ---- splat list: flat arrays
const P = [], S = [], C = [], Q = [], G = [];   // G: the building each splat belongs to (index into groups; 65535 = ground)
let curGroup = 65535; const groups = [];
const quatFromFrame = (t, u, n) => {   // rotation whose columns are t, u, n -> quaternion w x y z
  const m00 = t[0], m10 = t[1], m20 = t[2], m01 = u[0], m11 = u[1], m21 = u[2], m02 = n[0], m12 = n[1], m22 = n[2], tr = m00 + m11 + m22; let w, x, y, z;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4; }
  return [w, x, y, z];
};
const Q_UP = quatFromFrame([1, 0, 0], [0, 0, -1], [0, 1, 0]);   // disc lying flat: thin along y (a proper rotation: determinant +1)
function add(p, s, c, q, a = 1) { P.push(...p); S.push(...s); C.push(...c, a); Q.push(...q); G.push(curGroup); }

// ---- buildings in the box: footprint mask for the ground, roofs, walls
const LIGHT = (() => { const l = [-.45, .8, -.35], n = Math.hypot(...l); return l.map(v => v / n); })();
const shadeK = (nx, ny, nz) => { const l = Math.hypot(nx, ny, nz) || 1; return .5 + .5 * Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / l); };
// building materials: the page's photo style (neutral stone, concrete and glass tones, varied by building), not the map's
// height-source colour code
const PHOTO_BLD = [[.74, .75, .76], [.62, .66, .70], [.80, .78, .74], [.55, .60, .66], [.70, .68, .64], [.66, .70, .72]];
const photoColour = i => { const h = ((i * 2654435761) >>> 0) / 4294967296, c = PHOTO_BLD[Math.floor(h * PHOTO_BLD.length)], v = .92 + .16 * (((i * 40503) >>> 0) % 100) / 100; return c.map(x => Math.min(1, x * v)); };
const blds = [];
for (const b of A.buildings) {
  const f = dec(b.p), nv = b.holes && b.holes.length ? b.holes[0] : f.length / 2; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < nv; i++) { x0 = Math.min(x0, f[2 * i]); x1 = Math.max(x1, f[2 * i]); z0 = Math.min(z0, f[2 * i + 1]); z1 = Math.max(z1, f[2 * i + 1]); }
  if (!inBox((x0 + x1) / 2, (z0 + z1) / 2)) continue;
  const ring = []; for (let i = 0; i < nv; i++) ring.push([f[2 * i], f[2 * i + 1]]);
  blds.push({ b, i: A.buildings.indexOf(b), ring, x0, x1, z0, z1, y0: b.b + (b.mh || 0), y1: b.b + b.h });
}
// ground mask: cells covered by a building are skipped
const gw = Math.ceil((BOX[1] - BOX[0]) / GSTEP), gh = Math.ceil((BOX[3] - BOX[2]) / GSTEP), mask = new Uint8Array(gw * gh);
for (const B of blds) for (let gz = Math.max(0, Math.floor((B.z0 - BOX[2]) / GSTEP)); gz <= Math.min(gh - 1, Math.ceil((B.z1 - BOX[2]) / GSTEP)); gz++)
  for (let gx = Math.max(0, Math.floor((B.x0 - BOX[0]) / GSTEP)); gx <= Math.min(gw - 1, Math.ceil((B.x1 - BOX[0]) / GSTEP)); gx++)
    if (pointIn([BOX[0] + (gx + .5) * GSTEP, BOX[2] + (gz + .5) * GSTEP], B.ring)) mask[gz * gw + gx] = 1;
let nGround = 0, nRoof = 0, nWall = 0, nWin = 0;
for (let gz = 0; gz < gh; gz++) for (let gx = 0; gx < gw; gx++) {
  if (mask[gz * gw + gx]) continue; const x = BOX[0] + (gx + .5) * GSTEP, z = BOX[2] + (gz + .5) * GSTEP;
  add([x, ground(x, z) + .3, z], [GSTEP * .62, GSTEP * .62, .08], img(x, z), Q_UP); nGround++;
}
for (const B of blds) {
  curGroup = groups.length; groups.push([Math.round((B.x0 + B.x1) / 2), Math.round((B.z0 + B.z1) / 2), Math.round(B.y0 * 10) / 10, Math.round(B.y1 * 10) / 10, B.i]);
  const h = B.y1 - B.y0, col = photoColour(B.i), k = shadeK(0, 1, 0);
  // roof: a grid of discs inside the outline (4 m), the aerial colour on buildings under 40 m
  const rs = 4; let any = false;
  for (let z = B.z0 + rs / 2; z < B.z1; z += rs) for (let x = B.x0 + rs / 2; x < B.x1; x += rs) if (pointIn([x, z], B.ring)) {
    any = true; const c = h < 40 ? img(x, z) : col.map(v => Math.min(1, v * 1.05 * k)); add([x, B.y1 + .05, z], [rs * .62, rs * .62, .08], c, Q_UP); nRoof++; }
  if (!any) { const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2; add([cx, B.y1 + .05, cz], [(B.x1 - B.x0) * .4, (B.z1 - B.z0) * .4, .08], col, Q_UP); nRoof++; }
  // walls: per 3.6 m storey and CELL m of wall a wall-colour disc, and one window band disc 3 cm in front
  for (let i = 0; i < B.ring.length; i++) {
    const a = B.ring[i], c2 = B.ring[(i + 1) % B.ring.length], dx = c2[0] - a[0], dz = c2[1] - a[1], len = Math.hypot(dx, dz); if (len < .5) continue;
    const t = [dx / len, 0, dz / len], q = quatFromFrame(t, [0, 1, 0], [-dz / len, 0, dx / len]);   // frame with determinant +1
    let n = [dz / len, 0, -dx / len]; const mx = a[0] + dx / 2, mz = a[1] + dz / 2; if (pointIn([mx + n[0] * .5, mz + n[2] * .5], B.ring)) n = n.map(v => -v);   // outward
    const sk = shadeK(n[0], 0, n[2]) * .9, wc = col.map(v => v * sk);
    const nu = Math.max(1, Math.round(len / CELL)), du = len / nu, nf = Math.max(1, Math.round(h / 3.6)), dv = h / nf;
    for (let iu = 0; iu < nu; iu++) for (let iv = 0; iv < nf; iv++) {
      const s = (iu + .5) * du, y = B.y0 + (iv + .5) * dv, px = a[0] + t[0] * s, pz = a[1] + t[2] * s;
      add([px, y, pz], [du * .58, dv * .58, .08], wc, q); nWall++;
      if (h < 4) continue;
      for (const o of [0]) {   // one band of glass across the cell, on the storey's window row
        const ws = s + o * du, wx = a[0] + t[0] * ws + n[0] * .03, wz = a[1] + t[2] * ws + n[2] * .03, hv = hash(Math.floor(ws / 1.8) + i * 31, Math.floor(y / 3.6));
        const g = [.13, .18, .25].map((v, j) => (v + ([.42, .52, .62][j] - v) * Math.min(1, y / 300 + hv * .12)) * (.55 + .7 * (sk * .75)));
        add([wx, y + .2, wz], [du * .4, dv * .22, .05], g, q); nWin++;
      }
    }
  }
}
const N = P.length / 3;

// ---- .splat (32 bytes a splat), gzipped
const buf = Buffer.alloc(N * 32);
for (let i = 0; i < N; i++) {
  for (let k = 0; k < 3; k++) { buf.writeFloatLE(P[3 * i + k], 32 * i + 4 * k); buf.writeFloatLE(S[3 * i + k], 32 * i + 12 + 4 * k); }
  for (let k = 0; k < 4; k++) buf[32 * i + 24 + k] = Math.max(0, Math.min(255, Math.round(C[4 * i + k] * 255)));
  const q = Q.slice(4 * i, 4 * i + 4), l = Math.hypot(...q) || 1; for (let k = 0; k < 4; k++) buf[32 * i + 28 + k] = Math.max(0, Math.min(255, Math.round(q[k] / l * 128 + 128)));
}
mkdirSync(join(CW, 'docklands/data/splats'), { recursive: true });
const gz = gzipSync(buf, { level: 9 });
writeFileSync(join(CW, 'docklands/data/splats/cw-synth.splat.gz'), gz);
// sidecar for animation (the music visualiser): one uint16 a splat, the index of its building in meta.groups
writeFileSync(join(CW, 'docklands/data/splats/cw-synth.groups.bin.gz'), gzipSync(Buffer.from(new Uint16Array(G).buffer), { level: 9 }));
const meta = { built: new Date().toISOString().slice(0, 10), file: 'cw-synth.splat.gz', format: 'antimatter15 .splat, 32 bytes a splat, gzip; model metres and axes (x east, y up, z south)', count: N,
  counts: { ground: nGround, roof: nRoof, wall: nWall, window: nWin }, box: { x0: BOX[0], x1: BOX[1], z0: BOX[2], z1: BOX[3] }, ground_step_m: GSTEP,
  method: 'synthesised from the model, not trained: ground discs coloured from the 2008 EA aerial photograph, roofs (aerial colour under 40 m), walls on a 3.6 m storey grid with one glass-band disc per 7.2 m cell; colours carry the page shader\'s fixed light', sources: ['osm', 'ea-lidar', 'ea-survey-imagery'],
  groups_file: 'cw-synth.groups.bin.gz', groups_note: 'uint16 a splat in file order: index into groups, 65535 = ground; groups: [centre x, centre z, base m OD, top m OD, model building index]', groups };
writeFileSync(join(CW, 'docklands/data/splats/cw-synth.json'), JSON.stringify(meta, null, 1));
// the page's list of splat sets: keep the other entries, replace this one
const IX = join(CW, 'docklands/data/splats/index.json'); let ix = { sets: [] }; try { ix = JSON.parse(readFileSync(IX, 'utf8')); } catch {}
ix.sets = [{ name: 'cw-synth', title: 'Synthesised from the model (Canary Wharf)', count: N }, ...ix.sets.filter(x => x.name !== 'cw-synth')];
writeFileSync(IX, JSON.stringify(ix, null, 1));

// ---- standard 3DGS PLY (for splat-transform, SuperSplat, OpenSplat seeding)
mkdirSync(join(CW, 'data/raw/splats'), { recursive: true });
const props = ['x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
const head = `ply\nformat binary_little_endian 1.0\nelement vertex ${N}\n${props.map(p => `property float ${p}`).join('\n')}\nend_header\n`, body = Buffer.alloc(N * props.length * 4);
const SH0 = 0.28209479177387814;
for (let i = 0; i < N; i++) { const q = Q.slice(4 * i, 4 * i + 4), l = Math.hypot(...q) || 1, a = Math.min(.995, C[4 * i + 3]);
  const v = [P[3 * i], P[3 * i + 1], P[3 * i + 2], 0, 0, 0, (C[4 * i] - .5) / SH0, (C[4 * i + 1] - .5) / SH0, (C[4 * i + 2] - .5) / SH0, Math.log(a / (1 - a)), Math.log(S[3 * i]), Math.log(S[3 * i + 1]), Math.log(S[3 * i + 2]), q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  v.forEach((x, k) => body.writeFloatLE(x, 4 * (i * props.length + k))); }
writeFileSync(join(CW, 'data/raw/splats/cw-synth.ply'), Buffer.concat([Buffer.from(head), body]));
console.log(`${N.toLocaleString('en-GB')} splats (ground ${nGround}, roof ${nRoof}, wall ${nWall}, window ${nWin}); .splat.gz ${(gz.length / 1048576).toFixed(1)} MB; raw ${(buf.length / 1048576).toFixed(1)} MB; ${blds.length} buildings`);
