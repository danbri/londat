// A 3D noise texture for the shaders, in place of MaterialX Perlin noise (mx_noise_float, mx_noise_vec3), which costs
// dozens of operations per call: the tree crowns evaluated about 8 per pixel, also in the shadow pass (2026-11-24;
// docklands/test/frame-profile.mjs: the trees, 56 k triangles, took 16 % of the frame at the default view).
// The texture: 32^3 texels, RGBA8, four independent periodic gradient noises (Perlin's improved noise with a lattice
// period of 8 cells, 4 texels a cell), repeat-wrapped, trilinear filtered. noise3f(p) and noise3v(p) take the same
// argument as mx_noise_float and mx_noise_vec3 (lattice spacing 1 unit) and return about the same range (-1 to 1).
// Made once, on first use (about 10 ms). Skill: docklands-3d-page, "Frame cost by cause".
import * as THREE from 'three/webgpu';
import { texture3D, vec3, float } from 'three/tsl';

const N = 32, PERIOD = 8, CELL = N / PERIOD;
let tex = null;
function perm(seed) { const p = Array.from({ length: PERIOD }, (_, i) => i); let s = seed >>> 0;
  for (let i = PERIOD - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } return p; }
const fade = t => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + (b - a) * t;
const G = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
function periodicNoise(seed) {
  const P = perm(seed), Q = perm(seed * 7 + 3), R = perm(seed * 13 + 5), h = (x, y, z) => (P[(P[(Q[y % PERIOD] + x) % PERIOD] + R[z % PERIOD]) % PERIOD] * 7 + x * 3 + y * 5 + z) % 12;
  const gd = (ix, iy, iz, x, y, z) => { const g = G[h(ix, iy, iz)]; return g[0] * x + g[1] * y + g[2] * z; };
  return (x, y, z) => { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), fx = x - X, fy = y - Y, fz = z - Z, u = fade(fx), v = fade(fy), w = fade(fz);
    const m = k => ((k % PERIOD) + PERIOD) % PERIOD, x0 = m(X), y0 = m(Y), z0 = m(Z), x1 = m(X + 1), y1 = m(Y + 1), z1 = m(Z + 1);
    return lerp(lerp(lerp(gd(x0, y0, z0, fx, fy, fz), gd(x1, y0, z0, fx - 1, fy, fz), u), lerp(gd(x0, y1, z0, fx, fy - 1, fz), gd(x1, y1, z0, fx - 1, fy - 1, fz), u), v),
      lerp(lerp(gd(x0, y0, z1, fx, fy, fz - 1), gd(x1, y0, z1, fx - 1, fy, fz - 1), u), lerp(gd(x0, y1, z1, fx, fy - 1, fz - 1), gd(x1, y1, z1, fx - 1, fy - 1, fz - 1), u), v), w); };
}
export function noiseTexture3D() {
  if (tex) return tex;
  const data = new Uint8Array(N * N * N * 4), F = [1, 2, 3, 4].map(periodicNoise);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = 4 * (x + N * (y + N * z));
    for (let c = 0; c < 4; c++) data[o + c] = Math.max(0, Math.min(255, Math.round((F[c](x / CELL, y / CELL, z / CELL) * 0.5 + 0.5) * 255)));
  }
  tex = new THREE.Data3DTexture(data, N, N, N); tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping; tex.unpackAlignment = 1; tex.needsUpdate = true;
  return tex;
}
// p: a vec3 node in noise units (as mx_noise_*); one texture fetch each
export const noise3f = p => texture3D(noiseTexture3D(), p.div(PERIOD)).a.mul(2).sub(1);
export const noise3v = p => texture3D(noiseTexture3D(), p.div(PERIOD)).rgb.mul(2).sub(vec3(1));
export const noise3fAt = (p, k = float(0)) => noise3f(p.add(vec3(k)));
