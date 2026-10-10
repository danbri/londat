// Label occlusion of the Three.js port (docklands/): is a building or the ground between the eye and a label's anchor?
// Owner, 2026-10-10 (iPhone): "Cam label ignores depth / buildings in front". The test runs on the CPU against a height
// grid (4 m cells, decimetres, Int16): the bilinear 20 m DTM at each cell centre, raised to the top of every roof-like
// triangle of the building tiles and the detailed models whose footprint covers the centre. One ray is a march from the
// anchor towards the eye in 2 m steps; it ends where the ray is above the highest cell or 6 m short of the eye. A label
// anchored in or on its own structure (a roof, a pier; area.js places sit 20 m up, inside their tower) is not hidden by
// it: the march skips the solid cells it starts in, however far they go.
// Same answer on WebGPU and WebGL 2 (no depth readback). Results are cached per label and recomputed when the eye or the
// anchor moves, with at most BUDGET marches a frame. main.js makes it (ctx.occluded, ctx.occVersion); the label layers
// call it. Skill: docklands-3d-page, "Three.js port: less clutter, labels switch, label occlusion (2026-10-10)".
const C = 4, STEP = 2, TOL = 0.5, EYE_GAP = 6, BUDGET = 160, CHUNK_MS = 8;

export function makeOccluder({ A, groundB, buildings, models, U, eye, ghost, draw }) {
  const X = A.meta.extent, x0 = X.x0, z0 = X.z0, nx = Math.ceil((X.x1 - X.x0) / C), nz = Math.ceil((X.z1 - X.z0) / C);
  let G0 = null, H = null, HB = null, topB = 0, topG = 0, ready = false, token = 0, epoch = 1, version = 0;
  const S = { cells: nx * nz, cell: C, buildMs: 0, groundMs: 0, tris: 0, frameTests: 0, frameMs: 0, maxFrameMs: 0, tests: 0, testMs: 0, steps: 0 };
  const E = new Map();   // key (the label element) -> { x, y, z, occ, ep, f }
  let frame = 0, budget = BUDGET, pending = 0, last = { x: NaN, y: 0, z: 0, cut: 0, mode: '' };
  const sleep = () => new Promise(r => setTimeout(r, 0));

  // ---------- the grid: ground once, then the buildings and models (again after each rebuild), in chunks of CHUNK_MS
  async function build() {
    const my = ++token; let t = performance.now(), t0 = t;
    const yieldIf = async () => { if (performance.now() - t > CHUNK_MS) { await sleep(); t = performance.now(); } return my !== token; };
    if (!G0) {
      const g = new Int16Array(nx * nz); let mx = -1e9;
      for (let j = 0; j < nz; j++) { const z = z0 + (j + .5) * C; for (let i = 0; i < nx; i++) { const v = Math.round(groundB(x0 + (i + .5) * C, z) * 10); g[j * nx + i] = v; if (v > mx) mx = v; } if ((j & 15) === 0 && await yieldIf()) return; }
      G0 = g; topG = mx / 10; S.groundMs = Math.round(performance.now() - t0);
    }
    const h = G0.slice(); let tris = 0; t0 = performance.now();
    const meshes = [];
    for (const m of buildings.children) if (m.geometry) meshes.push([m.geometry, null]);
    if (models && models.visible) { models.updateMatrixWorld(true); models.traverse(o => { if (o.isMesh && o.geometry) meshes.push([o.geometry, o.matrixWorld]); }); }
    for (const [G, M] of meshes) {
      const p = G.attributes.position, idx = G.index, n = idx ? idx.count : p.count, P = p.array, e = M && M.elements;
      const get = (k, o) => { const a = idx ? idx.array[k] : k; let x = P[3 * a], y = P[3 * a + 1], z = P[3 * a + 2];
        if (e) { const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14]; x = X; y = Y; z = Z; }
        o[0] = x; o[1] = y; o[2] = z; };
      const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
      for (let k = 0; k < n; k += 3) {
        get(k, a); get(k + 1, b); get(k + 2, c);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const ny = uz * vx - ux * vz, nX = uy * vz - uz * vy, nZ = ux * vy - uy * vx;
        if (ny * ny < 0.0625 * (nX * nX + ny * ny + nZ * nZ)) continue;   // a wall (|normal y| < 0.25): its roof edge covers it
        tris++; stamp(h, a, b, c, Math.round(Math.max(a[1], b[1], c[1]) * 10));
        if ((k & 4095) === 0 && await yieldIf()) return;
      }
      if (await yieldIf()) return;
    }
    let mx = -1e9; for (let i = 0; i < h.length; i++) if (h[i] > mx) mx = h[i];
    H = h; topB = mx / 10; S.tris = tris; S.buildMs = Math.round(performance.now() - t0); ready = true; epoch++; version++; draw();
  }
  // cell centres inside the triangle's xz projection get its top; a triangle that covers no centre stamps its centroid's cell
  function stamp(h, a, b, c, top) {
    const minx = Math.min(a[0], b[0], c[0]), maxx = Math.max(a[0], b[0], c[0]), minz = Math.min(a[2], b[2], c[2]), maxz = Math.max(a[2], b[2], c[2]);
    const i0 = Math.max(0, Math.ceil((minx - x0) / C - .5)), i1 = Math.min(nx - 1, Math.floor((maxx - x0) / C - .5)), j0 = Math.max(0, Math.ceil((minz - z0) / C - .5)), j1 = Math.min(nz - 1, Math.floor((maxz - z0) / C - .5));
    const d = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]); let hit = false;
    if (d !== 0) for (let j = j0; j <= j1; j++) { const z = z0 + (j + .5) * C; for (let i = i0; i <= i1; i++) { const x = x0 + (i + .5) * C;
      const w1 = ((b[0] - x) * (c[2] - z) - (b[2] - z) * (c[0] - x)) / d, w2 = ((c[0] - x) * (a[2] - z) - (c[2] - z) * (a[0] - x)) / d;
      if (w1 >= 0 && w2 >= 0 && w1 + w2 <= 1) { const q = j * nx + i; if (h[q] < top) h[q] = top; hit = true; } } }
    if (!hit) { const i = Math.floor(((a[0] + b[0] + c[0]) / 3 - x0) / C), j = Math.floor(((a[2] + b[2] + c[2]) / 3 - z0) / C); if (i >= 0 && j >= 0 && i < nx && j < nz) { const q = j * nx + i; if (h[q] < top) h[q] = top; } }
  }

  // ---------- one ray: true when a cell's top is above the ray (by TOL) between the anchor's own structure and the eye
  function march(px, py, pz) {
    const t0 = performance.now(), ex = eye.x, ey = eye.y, ez = eye.z, dx = ex - px, dy = ey - py, dz = ez - pz, L = Math.hypot(dx, dz);
    S.tests++; if (L < 1) return false;
    const solidB = buildings.visible && !ghost(), arr = solidB && H ? H : G0, cut = U.cut.value < 250 ? U.cut.value : Infinity;
    const top = Math.min(solidB ? topB : topG, cut); if (py > top + TOL && dy >= 0) { S.testMs += performance.now() - t0; return false; }
    let sEnd = 1 - EYE_GAP / L; if (dy > 0) sEnd = Math.min(sEnd, (top + TOL - py) / dy);
    let own = true, occ = false, k = 0;
    for (let s = STEP / L; s <= sEnd; s += STEP / L) {
      k++; const x = px + dx * s, z = pz + dz * s, i = ((x - x0) / C) | 0, j = ((z - z0) / C) | 0;
      if (x < x0 || z < z0 || i >= nx || j >= nz) { own = false; continue; }
      const t = Math.min(arr[j * nx + i] / 10, cut), solid = t > py + dy * s + TOL;
      if (own) { if (!solid) own = false; continue; }
      if (solid) { occ = true; break; }
    }
    S.steps += k; S.testMs += performance.now() - t0; return occ;
  }

  return {
    get ready() { return ready; }, get version() { return version; }, stats: S,
    dirty() { build().catch(e => console.warn('occlusion grid', e)); },
    // each frame, before the labels: a new epoch when the eye moved 0.5 m, the cut changed or the buildings' mode changed
    begin() {
      frame++; budget = BUDGET; pending = 0; S.frameTests = 0; S.frameMs = 0;
      const mode = (buildings.visible ? 's' : 'h') + (ghost() ? 'g' : '');
      if (Math.hypot(eye.x - last.x, eye.y - last.y, eye.z - last.z) > 0.5 || U.cut.value !== last.cut || mode !== last.mode || !(last.x === last.x)) { last = { x: eye.x, y: eye.y, z: eye.z, cut: U.cut.value, mode }; epoch++; }
    },
    // true when the anchor (x, y, z, model metres) is hidden; key: the label's element. Stale answers wait for the budget
    // (a label never tested is shown meanwhile); one older than 10 frames is recomputed at once.
    test(key, x, y, z) {
      if (!ready) return false;
      let e = E.get(key); const moved = !e || Math.abs(e.x - x) + Math.abs(e.y - y) + Math.abs(e.z - z) > 2;
      if (e && !moved && e.ep === epoch) return e.occ;
      if (budget <= 0 && e && frame - e.f < 10) { pending++; return e.occ; }
      budget--; const t0 = performance.now(), occ = march(x, y, z); S.frameTests++; S.frameMs += performance.now() - t0;
      if (!e) { e = {}; E.set(key, e); } if (e.occ !== occ) version++;
      Object.assign(e, { x, y, z, occ, ep: epoch, f: frame }); return occ;
    },
    end() { if (S.frameMs > S.maxFrameMs) S.maxFrameMs = S.frameMs; if (pending) draw(); if (frame % 120 === 0) for (const k of E.keys()) if (k && k.isConnected === false) E.delete(k); },
    grid: () => ({ nx, nz, x0, z0, C, H, G0, topB, topG }),
    entries: () => [...E].map(([el, e]) => ({ el, x: e.x, y: e.y, z: e.z, occ: e.occ, ep: e.ep })), get epoch() { return epoch; },   // for the tests (docklands/test/labels-check.mjs)
  };
}
