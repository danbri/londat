// Layer "ring" of the Three.js port (docklands/): the Terrain of London ("Hills of London") of the WebGL page
// (cwplans/docklands/terrain-ring.js), data/london-terrain.json (EU-DEM v1.1 at 250 m, Copernicus, through OpenTopoData;
// tools/fetch-london-terrain.mjs), drawn OUTSIDE the model box where the page has its 20 m LiDAR ground (A.terrain).
// The same rules: coarse cells that meet the box are left out (the hole); a strip zips every LiDAR edge point (its own
// height, so the edge vertices are those of the LiDAR terrain: no gap, no overlap, no z-fighting) to the first coarse grid
// line outside; within BLEND m of the box the coarse heights take the LiDAR-minus-EU-DEM offset of the nearest edge point
// (mean of +/- SMOOTH points), faded with a smoothstep; colour = the ground colour, lighter with height above 10 m (up to
// x 1.45 at 160 m); far ground fades out as haze (vertex alpha 1 at 2.5 km from the box to 0.2 at 37.5 km). three.js
// lights it: the relief factor (x 6, 250 m cells shade almost flat) goes into the normals, not into baked colour. Drawn as
// the WebGL page: a depth pass first, then the colour with LessEqual, so a near hill hides the one behind it although the
// ground is see-through. While it is shown the camera's far plane is at least 60 km (index.html DocklandsRing.far()).
// Not ported: the "under" view's alpha 0.14 (the ring is not dimmed when U.cut is set), pixel-art and line styles.
// Skill: docklands-3d-page, "Terrain of London" and "Three.js port".
import { attribute, sRGBTransferEOTF, vec4 } from 'three/tsl';
import { A, C } from '../build.js';

const BLEND = 2500, SMOOTH = 7, FAR = 60000, RELIEF = 6;
const tint = (c, y) => { const k = 1 + .45 * Math.min(1, Math.max(0, (y - 10) / 150)); return c.map(v => Math.min(1, v * k)); };

function build(D, col) {
  const T = A.terrain, P3 = [], N3 = [], C3 = [], AL = [], I = [];
  let n = 0;
  const v = (x, y, z, c, a, nx, ny, nz) => { const l = Math.hypot(nx, ny, nz) || 1; P3.push(x, y, z); N3.push(nx / l, ny / l, nz / l); C3.push(...c); AL.push(a); return n++; };
  // a triangle facing up (three.js front faces are counter-clockwise from the eye): the WebGL page draws both windings
  const tri = (a, b, c) => {   // cy: y of (b - a) x (c - a)
    const ax = P3[3 * a], az = P3[3 * a + 2], cy = (P3[3 * b + 2] - az) * (P3[3 * c] - ax) - (P3[3 * b] - ax) * (P3[3 * c + 2] - az); if (cy > 0) I.push(a, b, c); else I.push(a, c, b); };
  const bx0 = T.x0, bx1 = T.x0 + (T.nx - 1) * T.cell, bz0 = T.z0, bz1 = T.z0 + (T.nz - 1) * T.cell;
  const eu = (x, z) => {
    const fi = Math.max(0, Math.min(D.nx - 1.001, (x - D.x0) / D.cell)), fj = Math.max(0, Math.min(D.nz - 1.001, (z - D.z0) / D.cell)), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, w = fj - j, g = (a, b) => D.dm[b * D.nx + a] / 10;
    return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - w) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * w;
  };
  const lid = (i, j) => T.dm[j * T.nx + i] / 10;
  const inner = [];
  for (let i = 0; i < T.nx - 1; i++) inner.push([i, 0, i / (T.nx - 1)]);
  for (let j = 0; j < T.nz - 1; j++) inner.push([T.nx - 1, j, 1 + j / (T.nz - 1)]);
  for (let i = T.nx - 1; i > 0; i--) inner.push([i, T.nz - 1, 3 - i / (T.nx - 1)]);
  for (let j = T.nz - 1; j > 0; j--) inner.push([0, j, 4 - j / (T.nz - 1)]);
  const P = inner.map(([i, j, t]) => ({ x: T.x0 + i * T.cell, z: T.z0 + j * T.cell, y: lid(i, j), t, i, j }));
  const raw = P.map(p => p.y - eu(p.x, p.z)), np = P.length, off = raw.map((_, k) => { let s = 0; for (let d = -SMOOTH; d <= SMOOTH; d++) s += raw[(k + d + np) % np]; return s / (2 * SMOOTH + 1); });
  const offAt = (x, z) => {
    const cx = Math.max(bx0, Math.min(bx1, x)), cz = Math.max(bz0, Math.min(bz1, z)), d = Math.hypot(x - cx, z - cz); if (d >= BLEND) return 0;
    const a = Math.round((cx - bx0) / T.cell), b = Math.round((cz - bz0) / T.cell);
    const k = b === 0 ? a : a === T.nx - 1 ? T.nx - 1 + b : b === T.nz - 1 ? 2 * (T.nx - 1) + T.nz - 1 - a : 2 * (T.nx - 1) + 2 * (T.nz - 1) - b;
    const w = 1 - d / BLEND; return off[k % np] * w * w * (3 - 2 * w);
  };
  const hz = (x, z) => { const cx = Math.max(bx0, Math.min(bx1, x)), cz = Math.max(bz0, Math.min(bz1, z)), d = Math.hypot(x - cx, z - cz), f = Math.min(1, Math.max(0, (d - 2500) / 35000)); return 1 - .8 * f * f * (3 - 2 * f); };
  const H = new Float32Array(D.nx * D.nz);
  for (let j = 0; j < D.nz; j++) for (let i = 0; i < D.nx; i++) H[j * D.nx + i] = D.dm[j * D.nx + i] / 10 + offAt(D.x0 + i * D.cell, D.z0 + j * D.cell);
  const h = (i, j) => H[Math.max(0, Math.min(D.nz - 1, j)) * D.nx + Math.max(0, Math.min(D.nx - 1, i))];
  const ia0 = Math.floor((bx0 - D.x0) / D.cell), ia1 = Math.ceil((bx1 - D.x0) / D.cell), ja0 = Math.floor((bz0 - D.z0) / D.cell), ja1 = Math.ceil((bz1 - D.z0) / D.cell);
  const idx = new Int32Array(D.nx * D.nz).fill(-1), vtx = (i, j) => { const k = j * D.nx + i; if (idx[k] < 0) { const x = D.x0 + i * D.cell, z = D.z0 + j * D.cell;
    idx[k] = v(x, H[k], z, tint(col, H[k]), hz(x, z), RELIEF * (h(i - 1, j) - h(i + 1, j)), 2 * D.cell, RELIEF * (h(i, j - 1) - h(i, j + 1))); } return idx[k]; };
  for (let j = 0; j < D.nz - 1; j++) for (let i = 0; i < D.nx - 1; i++) {
    if (i >= ia0 && i < ia1 && j >= ja0 && j < ja1) continue;
    const a = vtx(i, j), b = vtx(i + 1, j), c = vtx(i, j + 1), d = vtx(i + 1, j + 1); tri(a, b, c); tri(b, d, c);
  }
  const outer = [], W = ia1 - ia0, Hh = ja1 - ja0;
  for (let i = ia0; i < ia1; i++) outer.push([i, ja0, (i - ia0) / W]);
  for (let j = ja0; j < ja1; j++) outer.push([ia1, j, 1 + (j - ja0) / Hh]);
  for (let i = ia1; i > ia0; i--) outer.push([i, ja1, 3 - (i - ia0) / W]);
  for (let j = ja1; j > ja0; j--) outer.push([ia0, j, 4 - (j - ja0) / Hh]);
  const lnx = (i, j) => lid(Math.max(0, i - 1), j) - lid(Math.min(T.nx - 1, i + 1), j), lnz = (i, j) => lid(i, Math.max(0, j - 1)) - lid(i, Math.min(T.nz - 1, j + 1));
  const Ai = P.map(p => v(p.x, p.y, p.z, col, 1, lnx(p.i, p.j), 2 * T.cell, lnz(p.i, p.j))), Bi = outer.map(([i, j]) => vtx(i, j)), tA = P.map(p => p.t), tB = outer.map(o => o[2]);
  Ai.push(Ai[0]); tA.push(4); Bi.push(Bi[0]); tB.push(4);
  let a = 0, b = 0;
  while (a < Ai.length - 1 || b < Bi.length - 1) {
    if (b === Bi.length - 1 || (a < Ai.length - 1 && tA[a + 1] <= tB[b + 1])) { tri(Ai[a], Ai[a + 1], Bi[b]); a++; } else { tri(Ai[a], Bi[b + 1], Bi[b]); b++; }
  }
  return { P3, N3, C3, AL, I, n, edge: P.length };
}

export default {
  id: 'ring', label: 'Hills of London', on: true,
  async init(ctx) {
    const { THREE } = ctx, t0 = performance.now();
    const D = await ctx.loadJSON(ctx.DATA + 'london-terrain.json'), t1 = performance.now();
    const R = build(D, C.ground);
    const G = new THREE.BufferGeometry();
    G.setAttribute('position', new THREE.Float32BufferAttribute(R.P3, 3));
    G.setAttribute('normal', new THREE.Float32BufferAttribute(R.N3, 3));
    G.setAttribute('color', new THREE.Float32BufferAttribute(R.C3, 3));
    G.setAttribute('alpha', new THREE.Float32BufferAttribute(R.AL, 1));
    G.setIndex(new THREE.Uint32BufferAttribute(R.I, 1)); G.computeBoundingSphere();
    // pass 1: depth only (opaque queue); pass 2: colour with the haze alpha (transparent queue), on the nearest surface only
    const depthMat = new THREE.MeshBasicNodeMaterial({ colorWrite: false });
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0, transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth });
    mat.colorNode = vec4(sRGBTransferEOTF(attribute('color', 'vec3')), 1);   // the data colours are sRGB
    mat.opacityNode = attribute('alpha', 'float');
    mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -1;   // the colour pass wins against its own depth pass on any backend
    const depth = new THREE.Mesh(G, depthMat), mesh = new THREE.Mesh(G, mat);
    depth.renderOrder = -1;   // no shadows on it: with the cascaded shadows (WebGPU) the ring showed a step at the far edge of the shadow range
    const group = new THREE.Group(); group.name = 'ring'; group.add(depth, mesh);
    ctx.onFrame(() => { if (group.visible && ctx.camera.far < FAR) { ctx.camera.far = FAR; ctx.camera.updateProjectionMatrix(); } });
    ctx.ui.note('Hills of London: EU-DEM v1.1 (Copernicus data, modified; through OpenTopoData), 250 m, outside the model box. Not endorsed by the European Union.');
    const stats = { grid: `${D.nx} x ${D.nz} at ${D.cell} m`, vertices: R.n, triangles: R.I.length / 3, edgePoints: R.edge, loadMs: Math.round(t1 - t0), buildMs: Math.round(performance.now() - t1) };
    return { object: group, stats, setVisible(on) { group.visible = on; } };
  },
};
