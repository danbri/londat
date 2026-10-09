// Floating debris on the tidal Thames for the Three.js port (docklands/): sticks, branches, the odd log, leaves, bottles and
// plastic bags (stated mix, not a survey), one InstancedMesh of a unit box (12 triangles, one draw call), scaled and coloured
// per instance. Each piece lives in river coordinates: chainage along the centreline (data/river.json thames, west to east
// = downstream) and an offset across it (within 0.9 of the half width). It drifts with the current (SU.current x the same
// speed factors as the flow texture of water.js setRiver: narrower = faster, slower near the banks), plus leeway: 1 to 5 %
// of the wind by type. It floats at WU.tideLevel + 0.16 m (build.js draws the water 0.1 m above its level, with a polygon offset that hides anything within a few cm), 35 % of its height under. Pieces live in a window of the river round the camera target; one that
// leaves it at one end comes back at the other (so the density stays the same while the tide runs either way).
// Used by layers/wind.js. Skill: docklands-3d-page, "Three.js port" (Water surface).
import * as THREE from 'three/webgpu';

// the centreline with chainage (m), tangents and smoothed half widths
export function riverLine(R) {
  const P = R.thames, n = P.length, s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const hw = P.map((_, i) => { let a = 0, w = 0; for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 3); k++) { a += P[k][2]; w++; } return Math.max(20, a / w); });
  const at = c => {   // { x, z, tx, tz, hw } at chainage c (clamped)
    c = Math.max(0, Math.min(s[n - 1], c)); let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= c) lo = m; else hi = m; }
    const f = (c - s[lo]) / ((s[hi] - s[lo]) || 1), a = P[lo], b = P[hi], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, tx: (b[0] - a[0]) / tl, tz: (b[1] - a[1]) / tl, hw: hw[lo] + (hw[hi] - hw[lo]) * f };
  };
  const nearest = (x, z) => { let bd = Infinity, bi = 0; for (let i = 0; i < n; i++) { const d = (P[i][0] - x) ** 2 + (P[i][1] - z) ** 2; if (d < bd) { bd = d; bi = i; } } return { c: s[bi], d: Math.sqrt(bd) }; };
  return { P, s, hw, at, nearest, length: s[n - 1] };
}

// [name, share, length m [min, max], width m, height m, sRGB colours, leeway (share of the wind speed)]
const TYPES = [
  ['stick', 0.40, [0.4, 1.6], 0.07, 0.06, [[0.36, 0.27, 0.17], [0.45, 0.36, 0.24], [0.28, 0.22, 0.16]], 0.02],
  ['branch', 0.07, [2, 4.5], 0.16, 0.14, [[0.30, 0.24, 0.17], [0.40, 0.37, 0.32]], 0.015],
  ['log', 0.02, [3, 5.5], 0.35, 0.3, [[0.33, 0.26, 0.19]], 0.01],
  ['leaf', 0.33, [0.12, 0.22], 0.75, 0.01, [[0.62, 0.48, 0.16], [0.52, 0.30, 0.12], [0.40, 0.45, 0.17]], 0.035],
  ['bottle', 0.09, [0.22, 0.32], 0.3, 0.08, [[0.85, 0.88, 0.86], [0.25, 0.45, 0.30], [0.75, 0.82, 0.90]], 0.03],
  ['bag', 0.09, [0.3, 0.5], 0.8, 0.02, [[0.92, 0.92, 0.90], [0.35, 0.50, 0.75], [0.85, 0.85, 0.80]], 0.05],
];
const rng = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

export function makeDebris(line, count = 320) {
  const R = rng(20261009), mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0 });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, count);
  mesh.name = 'debris'; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const P = [], col = new THREE.Color(), cum = []; let a = 0; for (const t of TYPES) cum.push(a += t[1]);
  for (let k = 0; k < count; k++) {
    const r = R() * a, ti = cum.findIndex(v => r <= v), T = TYPES[ti], len = T[2][0] + R() * (T[2][1] - T[2][0]);
    const sc = new THREE.Vector3(len, T[4], ti === 3 || ti === 5 ? len * T[3] : ti === 4 ? len * T[3] : T[3]);
    const c3 = T[5][Math.floor(R() * T[5].length)]; col.setRGB(c3[0], c3[1], c3[2], THREE.SRGBColorSpace); mesh.setColorAt(k, col);
    P.push({ c: 0, u: R() * 2 - 1, yaw: R() * Math.PI * 2, spin: (R() - 0.5) * 0.12, sc, lee: T[6], sink: T[4] * 0.35, seed: R() });
  }
  let c0 = null, W = 600, seeded = false, tNear = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  // dt s; target {x, z}; dist: camera distance; current m/s (+ downstream); wind m/s and dir (from, degrees); level m OD
  function update(dt, target, dist, current, wind, dir, level) {
    const now = performance.now();
    if (c0 == null || now - tNear > 500) { tNear = now; const nr = line.nearest(target.x, target.z); W = Math.max(250, Math.min(1500, dist * 1.2));
      if (c0 == null || Math.abs(nr.c - c0) > W) seeded = false; c0 = nr.c; }
    if (!seeded) { for (const d of P) d.c = c0 + (d.seed * 2 - 1) * W; seeded = true; }
    const wr = dir * Math.PI / 180, dwx = -Math.sin(wr), dwz = Math.cos(wr);
    for (let k = 0; k < P.length; k++) {
      const d = P[k], g = line.at(d.c), sf = Math.min(1.4, Math.max(0.7, Math.sqrt(130 / g.hw))) * (1 - 0.5 * d.u * d.u), nx = -g.tz, nz = g.tx;
      d.c += (current * sf + d.lee * wind * (dwx * g.tx + dwz * g.tz)) * dt;
      d.u = Math.max(-0.9, Math.min(0.9, d.u + (d.lee * wind * (dwx * nx + dwz * nz) * 0.3 / g.hw + Math.sin(now * 1e-4 + d.seed * 50) * 0.002) * dt));
      if (d.c > c0 + W) { d.c -= 2 * W; d.u = R() * 1.8 - 0.9; } else if (d.c < c0 - W) { d.c += 2 * W; d.u = R() * 1.8 - 0.9; }
      d.yaw += d.spin * dt;
      const h = line.at(d.c); pos.set(h.x - h.tz * d.u * h.hw, level + 0.16 + d.sc.y * 0.5 - d.sink, h.z + h.tx * d.u * h.hw);
      q.setFromAxisAngle(up, d.yaw); m4.compose(pos, q, d.sc); mesh.setMatrixAt(k, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, update, count };
}
