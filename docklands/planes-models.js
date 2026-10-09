// Low-poly procedural aircraft for the simulated traffic of the Three.js port (docklands/layers/planes.js), at true
// size from the type's published length, span, height and fuselage diameter (planes-data.js). Airline-neutral livery
// (white body, grey belly and wings, a plain grey-blue fin; no airline marks). Frame: nose towards -z, up +y,
// starboard (right wing) +x, origin at the centre of the fuselage. Each model returns its parts so the layer can
// lower the gear, turn the rotors and place the lights (anchors in the same frame).
// Types: 'jet' (low wing, two engines under the wings), 'wide' (the same, larger), 'wide4' (four engines),
// 'turboprop' (high wing, T-tail, two propellers), 'heli' (pod, tail boom, four-blade main rotor, tail rotor, skids).
// Skill: docklands-3d-page ("Three.js port").
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const WHITE = [0.92, 0.93, 0.95], BELLY = [0.72, 0.74, 0.77], WING = [0.62, 0.64, 0.67], DARK = [0.16, 0.17, 0.19], FIN = [0.42, 0.50, 0.60], GLASS = [0.06, 0.08, 0.12], METAL = [0.55, 0.56, 0.58];

// a geometry with one colour, non-indexed, with normals (mergeGeometries needs the same attributes everywhere)
function paint(g, c) {
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); g.deleteAttribute('uv1');
  const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3);
  g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); g.computeVertexNormals(); return g;
}
// a closed solid from two quadrilaterals (top a b c d, bottom e f g h, the same order): wings, fins, tailplanes
function slab(P, c) {
  const p = [], F = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
  for (const f of F) for (const k of f) p.push(...P[k]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(orient(p), 3));
  return paint(g, c);
}
// wind every triangle outwards (from the centroid of the solid): flat shading on a double-sided material draws a face
// seen from its back black, and a mirrored panel (x negated) turns its winding over
function orient(p) {
  let cx = 0, cy = 0, cz = 0; const n = p.length / 3; for (let i = 0; i < p.length; i += 3) { cx += p[i]; cy += p[i + 1]; cz += p[i + 2]; } cx /= n; cy /= n; cz /= n;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i], ay = p[i + 1], az = p[i + 2], ux = p[i + 3] - ax, uy = p[i + 4] - ay, uz = p[i + 5] - az, vx = p[i + 6] - ax, vy = p[i + 7] - ay, vz = p[i + 8] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, mx = (ax + p[i + 3] + p[i + 6]) / 3 - cx, my = (ay + p[i + 4] + p[i + 7]) / 3 - cy, mz = (az + p[i + 5] + p[i + 8]) / 3 - cz;
    if (nx * mx + ny * my + nz * mz < 0) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
  }
  return p;
}
// a wing-like panel: root at (x0, y0), leading edge z at root zr, chord cr; tip at x1 with chord ct, sweep (m back at
// the tip), dihedral rise dy at the tip, thickness t at the root (half at the tip). Mirror for the other side.
function panel({ x0, x1, y0, zr, cr, ct, back, dy, t }, c, mirror = false) {
  const s = mirror ? -1 : 1, yt = y0 + dy;
  const P = [[s * x0, y0 + t / 2, zr], [s * x1, yt + t / 4, zr + back], [s * x1, yt + t / 4, zr + back + ct], [s * x0, y0 + t / 2, zr + cr],
    [s * x0, y0 - t / 2, zr], [s * x1, yt - t / 4, zr + back], [s * x1, yt - t / 4, zr + back + ct], [s * x0, y0 - t / 2, zr + cr]];
  return slab(P, c);
}
// a vertical fin: root chord cr from zr at height y0, tip chord ct at height y1, swept back by back; thickness t
function fin({ y0, y1, zr, cr, ct, back, t }, c) {
  const P = [[-t / 2, y0, zr], [-t / 2, y1, zr + back], [-t / 2, y1, zr + back + ct], [-t / 2, y0, zr + cr],
    [t / 2, y0, zr], [t / 2, y1, zr + back], [t / 2, y1, zr + back + ct], [t / 2, y0, zr + cr]];
  return slab(P, c);
}
// fuselage: rings along z (nose at -L/2), radius profile R(f) and centre-line rise Y(f); cockpit windows dark
function fuselage(L, D, prof, rise, nose = 0.07) {
  const N = 14, st = prof.length, pos = [], col = [], idx = [];
  for (let i = 0; i < st; i++) {
    const [f, r] = prof[i], z = -L / 2 + f * L, yc = rise(f) * D, R = r * D / 2;
    for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2, x = Math.sin(a) * R, y = Math.cos(a) * R * 1.04 + yc; pos.push(x, y, z);
      const top = Math.cos(a) > 0.35 && Math.abs(Math.sin(a)) < 0.8, belly = Math.cos(a) < -0.45;
      col.push(...(f > nose * 0.55 && f < nose && top ? GLASS : belly ? BELLY : WHITE)); }
  }
  for (let i = 0; i < st - 1; i++) for (let k = 0; k < N; k++) { const a = i * N + k, b = i * N + (k + 1) % N, c = a + N, d = b + N; idx.push(a, c, b, b, c, d); }
  // close the two ends with a fan
  const cap = (i, flip) => { const c0 = pos.length / 3, z = pos[i * N * 3 + 2]; let yc = 0; for (let k = 0; k < N; k++) yc += pos[(i * N + k) * 3 + 1]; pos.push(0, yc / N, z); col.push(...WHITE);
    for (let k = 0; k < N; k++) { const a = i * N + k, b = i * N + (k + 1) % N; flip ? idx.push(c0, b, a) : idx.push(c0, a, b); } };
  cap(0, true); cap(st - 1, false);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  return paint2(g);
}
const paint2 = g => { g = g.toNonIndexed(); orient(g.attributes.position.array); g.computeVertexNormals(); return g; };
// a cylinder along z (engines, nacelles), centre (x, y, z), radius r, length l
const tube = (x, y, z, r, l, c, seg = 10, r2 = r) => paint(new THREE.CylinderGeometry(r2, r, l, seg, 1).rotateX(Math.PI / 2).translate(x, y, z), c);
const box = (x, y, z, sx, sy, sz, c) => paint(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), c);
const wheel = (x, y, z, r, w) => paint(new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2).translate(x, y, z), DARK);

// ---------- fixed-wing aircraft
function airplane(T) {
  const { L, S, H, D } = T, prop = T.kind === 'turboprop', four = T.kind === 'wide4', wide = T.kind === 'wide' || four;
  const parts = [], gear = [], props = [];
  // fuselage profile: nose cone, parallel body, tail cone rising to the fin
  const prof = [[0, 0.02], [0.012, 0.38], [0.035, 0.68], [0.07, 0.88], [0.11, 0.98], [0.16, 1], [0.66, 1], [0.76, 0.86], [0.87, 0.6], [0.96, 0.32], [1, 0.16]];
  const rise = f => f < 0.66 ? (f < 0.1 ? -0.08 * (1 - f / 0.1) : 0) : (f - 0.66) / 0.34 * 0.32;
  parts.push(fuselage(L, D, prof, rise, prop ? 0.075 : 0.065));
  // gear height: the lowest point of the fuselage sits this far above the ground with the gear down
  const gh = prop ? 0.95 : wide ? 2.3 : 1.25, yGround = -D / 2 - gh;
  // wings
  const half = S / 2, sweep = prop ? 0.03 : wide ? 0.5 : 0.42, cr = prop ? 0.105 * L : wide ? 0.16 * L : 0.19 * L, ct = prop ? 0.6 * cr : 0.28 * cr;
  const zr = -L / 2 + (prop ? 0.4 : 0.36) * L, yw = prop ? D * 0.47 : -D * 0.3, dy = prop ? -0.02 * half : 0.09 * half, back = half * Math.tan(Math.atan(sweep));
  const W = { x0: D * 0.35, x1: half, y0: yw, zr, cr, ct, back, dy, t: 0.12 * cr };
  parts.push(panel(W, WING), panel(W, WING, true));
  if (prop) parts.push(box(0, D * 0.45, zr + cr / 2, D * 0.75, D * 0.18, cr * 1.05, WHITE));   // wing fairing on the roof
  else parts.push(box(0, -D * 0.33, zr + cr * 0.45, D * 0.85, D * 0.3, cr * 1.1, BELLY));   // belly fairing
  const wingAt = (x) => { const k = (x - W.x0) / (W.x1 - W.x0); return { y: yw + dy * k, z: zr + back * k, c: cr + (ct - cr) * k }; };
  // tailplane and fin
  const finH = Math.max(H - D - gh - 0.2, D * 1.1), zfin = -L / 2 + (prop ? 0.8 : 0.8) * L, ycf = rise(0.86) * D + D * 0.3;
  const fcr = prop ? 0.17 * L : 0.17 * L, fct = 0.62 * fcr, fback = finH * (prop ? 0.55 : 0.75);
  parts.push(fin({ y0: ycf, y1: ycf + finH, zr: zfin, cr: fcr, ct: fct, back: fback, t: 0.35 }, FIN));
  const th = (prop ? 0.29 : 0.34) * S / 2, tcr = (prop ? 0.09 : 0.11) * L;
  const yt = prop ? ycf + finH : rise(0.9) * D, zt = prop ? zfin + fback - 0.1 * tcr : -L / 2 + 0.86 * L;
  const TP = { x0: prop ? 0.1 : D * 0.25, x1: th, y0: yt, zr: zt, cr: tcr, ct: tcr * 0.5, back: th * (prop ? 0.15 : 0.6), dy: prop ? 0 : 0.06 * th, t: 0.25 };
  parts.push(panel(TP, WING), panel(TP, WING, true));
  // engines
  const lights = {};
  const eng = (x) => {
    const w = wingAt(x);
    if (prop) { const r = D * 0.2, l = w.c * 1.35, z = w.z - 0.18 * l + l / 2 - 0.25 * w.c; parts.push(tube(x, w.y - r * 0.3, z, r, l, WHITE)); parts.push(paint(new THREE.ConeGeometry(r * 0.45, r * 1.2, 8).rotateX(-Math.PI / 2).translate(x, w.y - r * 0.3, z - l / 2 - r * 0.5), DARK));
      props.push({ x, y: w.y - r * 0.3, z: z - l / 2 - r * 0.3, R: T.code === 'DH8D' ? 2.05 : 1.96 }); return; }
    const r = D * (four ? 0.22 : wide ? 0.27 : T.code === 'BCS1' ? 0.3 : 0.27), l = r * 4.4, y = w.y - r * 1.25, z = w.z - l * 0.35;
    parts.push(tube(x, y, z, r * 0.92, l, METAL, 12, r), tube(x, y, z - l / 2 + 0.06, r * 0.7, 0.1, DARK, 12));   // nacelle, fan face
    parts.push(box(x, w.y - r * 0.55, w.z + 0.1 * w.c, 0.3, r * 0.9, w.c * 0.5, WING));   // pylon
  };
  if (four) { eng(half * 0.36); eng(-half * 0.36); eng(half * 0.62); eng(-half * 0.62); } else { const ex = prop ? half * 0.3 : half * 0.33; eng(ex); eng(-ex); }
  // gear: nose leg and two main legs (four-wheel bogies on the wide bodies, drawn as two wheels)
  const nz = -L / 2 + 0.11 * L, mz = zr + cr * 0.62, mx = prop ? D * 0.62 : Math.max(D * 0.55, half * 0.17), wr = prop ? 0.38 : wide ? 0.62 : 0.5;
  const leg = (x, z, top, r, n = 1) => { gear.push(box(x, (top + yGround + r) / 2, z, 0.22, top - yGround - r, 0.22, METAL)); for (let i = 0; i < n; i++) gear.push(wheel(x + (i - (n - 1) / 2) * r * 0.9, yGround + r, z, r, 0.3)); };
  leg(0, nz, -D * 0.4, wr * 0.7, 2); leg(mx, mz, prop ? yw - 0.2 : -D * 0.35, wr, wide ? 2 : 2); leg(-mx, mz, prop ? yw - 0.2 : -D * 0.35, wr, wide ? 2 : 2);
  if (prop) { parts.push(box(mx, -D * 0.3, mz, 0.7, D * 0.35, cr * 0.7, BELLY), box(-mx, -D * 0.3, mz, 0.7, D * 0.35, cr * 0.7, BELLY)); }   // gear sponsons
  // light anchors (navigation red port, green starboard, white tail; beacons; strobes at the wing tips; landing lights)
  const tip = wingAt(half);
  Object.assign(lights, { navR: [-half, tip.y + 0.1, tip.z + tip.c * 0.3], navG: [half, tip.y + 0.1, tip.z + tip.c * 0.3], tail: [0, rise(1) * D, L / 2 + 0.2],
    beaconTop: [0, D * 0.55, zr + cr * 0.4], beaconBot: [0, -D * 0.55, zr + cr * 0.1], strobeL: [-half, tip.y, tip.z + tip.c * 0.6], strobeR: [half, tip.y, tip.z + tip.c * 0.6],
    land: [[-D * 0.6, yw, zr + 0.05], [D * 0.6, yw, zr + 0.05], [0, yGround + 1.5, nz - 0.5]], nose: [0, 0, -L / 2], gearLow: yGround });
  return { body: mergeGeometries(parts), gear: mergeGeometries(gear), props, lights, ground: yGround };
}

// ---------- helicopter
function helicopter(T) {
  const { L, R, H } = T, parts = [], gear = [];
  const pod = paint(new THREE.SphereGeometry(1, 12, 8).scale(1.1, 1.05, 2.4).translate(0, 0, -L * 0.18), WHITE);
  parts.push(pod, paint(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.6).scale(1.02, 0.9, 1.4).rotateX(-0.9).translate(0, 0.25, -L * 0.18 - 1.5), GLASS));
  parts.push(tube(0, 0.35, L * 0.2, 0.28, L * 0.5, WHITE, 8, 0.45));   // tail boom
  parts.push(fin({ y0: 0.3, y1: 2.0, zr: L * 0.38, cr: 1.2, ct: 0.7, back: 0.6, t: 0.15 }, FIN));
  parts.push(panel({ x0: 0.2, x1: 1.4, y0: 0.4, zr: L * 0.32, cr: 0.6, ct: 0.45, back: 0.1, dy: 0.1, t: 0.08 }, FIN), panel({ x0: 0.2, x1: 1.4, y0: 0.4, zr: L * 0.32, cr: 0.6, ct: 0.45, back: 0.1, dy: 0.1, t: 0.08 }, FIN, true));
  parts.push(box(0, 1.05, -L * 0.15, 0.9, 0.6, 2.2, WING), tube(0, 1.55, -L * 0.17, 0.12, 0.6, DARK).rotateX(Math.PI / 2));   // engine cowling, mast
  const yG = -1.15 - 0.55;
  for (const s of [-1, 1]) { gear.push(tube(s * 0.95, yG + 0.06, -L * 0.18, 0.06, 3.6, METAL, 6)); gear.push(box(s * 0.75, yG + 0.35, -L * 0.18 - 0.9, 0.08, 0.6, 0.08, METAL), box(s * 0.75, yG + 0.35, -L * 0.18 + 0.9, 0.08, 0.6, 0.08, METAL)); }
  // rotors (separate, they turn): four blades, chord 0.4 m; tail rotor
  const blades = []; for (let k = 0; k < 4; k++) blades.push(paint(new THREE.BoxGeometry(0.4, 0.06, R / 2).translate(0, 0, R / 4).rotateY(k * Math.PI / 2), DARK));
  blades.push(paint(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 8), DARK));
  const tail = []; for (let k = 0; k < 2; k++) tail.push(paint(new THREE.BoxGeometry(0.06, 0.18, 1.0).rotateX(k * Math.PI / 2).translate(0, 0, 0), DARK));
  const lights = { navR: [-1.45, 0.4, L * 0.32 + 0.3], navG: [1.45, 0.4, L * 0.32 + 0.3], tail: [0, 2.05, L * 0.38 + 1.4], beaconTop: [0, 1.4, -L * 0.1], beaconBot: [0, -1.25, -L * 0.18],
    strobeL: [-0.3, 2.0, L * 0.38 + 1.2], strobeR: [0.3, 2.0, L * 0.38 + 1.2], land: [[0, -1.1, -L * 0.18 - 2.0]], nose: [0, 0, -L * 0.18 - 2.4], gearLow: yG };
  return { body: mergeGeometries(parts), gear: mergeGeometries(gear), rotor: { geo: mergeGeometries(blades), at: [0, 1.9, -L * 0.17] }, trotor: { geo: mergeGeometries(tail), at: [0.45, 1.3, L * 0.38 + 0.9] }, lights, ground: yG, props: [] };
}

const CACHE = new Map();
export function aircraftParts(T) { if (!CACHE.has(T.code)) CACHE.set(T.code, T.kind === 'heli' ? helicopter(T) : airplane(T)); return CACHE.get(T.code); }
