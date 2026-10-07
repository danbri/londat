#!/usr/bin/env node
// ply-to-splat.mjs - convert a 3DGS training .ply (INRIA layout: x y z,
// f_dc_0..2, opacity, scale_0..2, rot_0..3; f_rest_* ignored) to the
// antimatter15 .splat format: 32 bytes per gaussian =
//   position 3 x f32 | scale 3 x f32 (linear, exp of the log scale) |
//   rgba 4 x u8 (rgb = 0.5 + SH_C0 * f_dc, a = sigmoid(opacity)) |
//   rotation 4 x u8 (normalised quaternion w,x,y,z as q*128+128).
// Sorted by exp(sum log scale) * opacity, largest first (the antimatter15
// viewer's own order). No dependencies; used by train-splat.sh.
//
//   node cwplans/tools/ply-to-splat.mjs in.ply out.splat
import { readFileSync, writeFileSync } from 'node:fs';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: ply-to-splat.mjs in.ply out.splat');
  process.exit(2);
}
const buf = readFileSync(inPath);
const marker = Buffer.from('end_header\n');
const hEnd = buf.indexOf(marker);
if (hEnd < 0) throw new Error('not a PLY: no end_header');
const header = buf.subarray(0, hEnd).toString('latin1').split('\n');
if (!header.some((l) => l.startsWith('format binary_little_endian'))) throw new Error('only binary_little_endian PLY is supported');
let n = 0;
const props = [];
let inVertex = false;
for (const l of header) {
  const t = l.trim().split(/\s+/);
  if (t[0] === 'element') { inVertex = t[1] === 'vertex'; if (inVertex) n = Number(t[2]); }
  else if (t[0] === 'property' && inVertex) {
    if (t[1] !== 'float' && t[1] !== 'float32') throw new Error(`vertex property ${t[2]} is ${t[1]}; only float is supported`);
    props.push(t[2]);
  }
}
const stride = props.length;
const need = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
const col = Object.fromEntries(need.map((k) => {
  const i = props.indexOf(k);
  if (i < 0) throw new Error(`missing property ${k}`);
  return [k, i];
}));
const start = hEnd + marker.length;
const body = buf.subarray(start, start + n * stride * 4);
if (body.length !== n * stride * 4) throw new Error('PLY body is truncated');
const f = new Float32Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.length));

const SH_C0 = 0.28209479177387814;
const key = new Float64Array(n);
let dropped = 0;
for (let i = 0; i < n; i++) {
  const b = i * stride;
  const a = 1 / (1 + Math.exp(-f[b + col.opacity]));
  key[i] = Math.exp(f[b + col.scale_0] + f[b + col.scale_1] + f[b + col.scale_2]) * a;
  if (!Number.isFinite(key[i])) { key[i] = -1; dropped++; }
}
const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => key[q] - key[p]);
const keep = n - dropped;
const out = Buffer.alloc(keep * 32);
const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));
let o = 0;
for (const i of order) {
  if (key[i] < 0) continue;
  const b = i * stride;
  out.writeFloatLE(f[b + col.x], o); out.writeFloatLE(f[b + col.y], o + 4); out.writeFloatLE(f[b + col.z], o + 8);
  out.writeFloatLE(Math.exp(f[b + col.scale_0]), o + 12);
  out.writeFloatLE(Math.exp(f[b + col.scale_1]), o + 16);
  out.writeFloatLE(Math.exp(f[b + col.scale_2]), o + 20);
  out[o + 24] = clampByte((0.5 + SH_C0 * f[b + col.f_dc_0]) * 255);
  out[o + 25] = clampByte((0.5 + SH_C0 * f[b + col.f_dc_1]) * 255);
  out[o + 26] = clampByte((0.5 + SH_C0 * f[b + col.f_dc_2]) * 255);
  out[o + 27] = clampByte(255 / (1 + Math.exp(-f[b + col.opacity])));
  const q = [f[b + col.rot_0], f[b + col.rot_1], f[b + col.rot_2], f[b + col.rot_3]];
  const len = Math.hypot(...q) || 1;
  for (let k = 0; k < 4; k++) out[o + 28 + k] = clampByte((q[k] / len) * 128 + 128);
  o += 32;
}
writeFileSync(outPath, out);
console.log(`ply-to-splat: ${n} gaussians in, ${keep} written (${dropped} non-finite dropped), ${out.length} bytes -> ${outPath}`);
