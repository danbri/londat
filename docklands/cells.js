// Model cells: level of detail for the merged meshes of the Docklands model (Three.js port, docklands/). LOD step 4 of the
// plan in the activity log (2026-10-14; owner: "pls make sure we make appropriate use of threejs lod support for
// everything"). The model box (7.5 x 5.6 km) is cut into cells of CELL m (build.js TILE: 54 cells hold buildings). Each frame
// every cell gets a level from the distance of the eye to its box and the `ctx.lod` screen-size rule (main.js LOD): full
// while an object of LEVEL_SIZE[0] m would cover LOD.px (32) CSS px, simplified while one of LEVEL_SIZE[1] m would, far
// beyond; a level is left for a coarser one only 10 % past its distance (no flicker at the edge). ?lod=0: every cell full.
//  - Buildings: one mesh a cell, as before (picking, the label occluder, styles.js, splats, music and the globe hand-over
//    all see `ctx.meshes.buildings.children`). The mesh's geometry is swapped between its levels (build.js buildBuildings
//    level 0 / 1 / 2: full; flat roofs and no building under 8 m; buildings of 20 m or 30 m high, outlines simplified to
//    2.5 m, towers kept), built in the background when first wanted (nearest first, a time slice at a time). A tap and the
//    occluder always use the full geometry (`userData.full`: a ray hits it through a proxy mesh a cell, so the model index
//    under the tap is exactly as before). A level not drawn for FREE_MS gives back its GPU buffers (dispose; its CPU
//    copies stay, three.js uploads them again when it is drawn: as globe.js freeModel); a simplified or far geometry not
//    drawn for DROP_MS is dropped (built again when wanted).
//  - Terrain, greens, roads and rail: one mesh each, as before (tide.js, under.js, styles.js, splats, the drone see the
//    same objects). Their triangles are sorted by cell and level class (build.js LOD_*: road and rail sides at full detail
//    only, 4 m roads and greens under 600 m2 not far, the terrain's 40 m stand-ins: build.js terrainLod), and the index
//    drawn is made of the cells in a frustum widened WIDE x, each at its level (one draw call, as before; the index
//    buffer is written again only when a cell changes level or comes into or out of view). A geometry put on the mesh
//    later (tide.js: the terrain without the foreshore squares) is prepared when it first shows.
// Skill: docklands-3d-page, "Three.js port: model cells, LOD step 4 (2026-10-21)".
import { lodIn } from './build.js';

export const CELL = 1000;
export const LEVEL_SIZE = [60, 240];   // m: full detail while this covers LOD.px, simplified while the second does
const HYST = 1.1, WIDE = 1.4, FREE_MS = 5000, DROP_MS = 60000, SLICE_MS = 8;
const NAMES = ['full', 'simplified', 'far'];

export function makeCells({ THREE, camera, eye, LOD, CPU, draw, buildTile, prep = {} }) {
  const S = { tiles: { full: 0, simplified: 0, far: 0 }, builds: 0, buildMs: 0, freed: 0, dropped: 0, pending: 0, kinds: {} };
  const F = new THREE.Frustum(), PM = new THREE.Matrix4(), VP = new THREE.Matrix4(), V = new THREE.Vector3();
  const levelOf = (d, cur) => {
    if (!LOD.on) return 0;
    const t0 = LOD.dist(LEVEL_SIZE[0]), t1 = LOD.dist(LEVEL_SIZE[1]); let L = d < t0 ? 0 : d < t1 ? 1 : 2;
    if (cur >= 0 && L > cur && d < (cur === 0 ? t0 : t1) * HYST) L = cur;
    return L;
  };
  function frustum() { PM.copy(camera.projectionMatrix); PM.elements[0] /= WIDE; PM.elements[5] /= WIDE; VP.multiplyMatrices(PM, camera.matrixWorldInverse); F.setFromProjectionMatrix(VP); }

  // ---------- one mesh, its index made of cells (terrain, greens, roads, rail)
  const kinds = [], PREP = new WeakMap();
  function prepare(k, G) {
    if (PREP.has(G)) return PREP.get(G);   // (a WeakMap, not userData: tide.js shares one userData between its two terrain geometries)
    PREP.set(G, null); if (!G.index) return null;
    const t0 = performance.now(), src = (prep[k.name] && prep[k.name](G)) || { index: G.index.array, cls: G.userData.cls || null };
    const I = src.index, cls = src.cls, n = I.length / 3, P = G.attributes.position.array, ids = new Map(), cells = [], tc = new Uint16Array(n);
    for (let t = 0; t < n; t++) { const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2], x = (P[a] + P[b] + P[c]) / 3, z = (P[a + 2] + P[b + 2] + P[c + 2]) / 3, key = Math.floor(x / CELL) * 4096 + Math.floor(z / CELL);
      let id = ids.get(key); if (id === undefined) { id = cells.length; ids.set(key, id); cells.push({ lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] }); }
      tc[t] = id; const B = cells[id]; for (const v of [a, b, c]) for (let e = 0; e < 3; e++) { const w = P[v + e]; if (w < B.lo[e]) B.lo[e] = w; if (w > B.hi[e]) B.hi[e] = w; } }
    const NC = cells.length, st = new Uint32Array(NC * 9 + 1);
    for (let t = 0; t < n; t++) st[tc[t] * 9 + (cls ? cls[t] : 2) + 1]++;
    for (let k2 = 1; k2 <= NC * 9; k2++) st[k2] += st[k2 - 1];
    const at = st.slice(0, NC * 9), sorted = new Uint32Array(3 * n);
    for (let t = 0; t < n; t++) { const o = 3 * at[tc[t] * 9 + (cls ? cls[t] : 2)]++; sorted[o] = I[3 * t]; sorted[o + 1] = I[3 * t + 1]; sorted[o + 2] = I[3 * t + 2]; }
    for (let c = 0; c < NC; c++) cells[c].box = new THREE.Box3(new THREE.Vector3(...cells[c].lo), new THREE.Vector3(...cells[c].hi));
    const C = { cells, st, sorted, lv: new Int8Array(NC).fill(-2), tris: 0, composes: 0, ms: 0, prepMs: 0 };
    G.setIndex(new THREE.BufferAttribute(new Uint32Array(3 * n), 1));   // the index drawn (capacity: every triangle)
    // cpu-copies.js makes the normals again from the whole index (greens, roads, rail: the same triangles, sorted)
    if (!cls || !cls.some(v => v === 5)) G.userData.normalIndex = new THREE.BufferAttribute(sorted, 1);
    PREP.set(G, C); C.prepMs = Math.round(performance.now() - t0);
    compose(G, C, true);
    return C;
  }
  function compose(G, C, all) {
    const t0 = performance.now(), out = G.index.array, { cells, st, sorted, lv } = C; let o = 0;
    for (let c = 0; c < cells.length; c++) { const L = all ? 0 : lv[c]; if (L < 0) continue;
      for (let code = 0; code < 9; code++) { const s = 3 * st[c * 9 + code], e = 3 * st[c * 9 + code + 1]; if (e > s && lodIn(code, L)) { out.set(sorted.subarray(s, e), o); o += e - s; } } }
    G.index.clearUpdateRanges(); if (o) G.index.addUpdateRange(0, o); G.index.needsUpdate = true; G.setDrawRange(0, o);
    C.tris = o / 3; C.composes++; C.ms = +(performance.now() - t0).toFixed(1);
  }
  function addIndexed(name, mesh) { const k = { name, mesh }; kinds.push(k); prepare(k, mesh.geometry); }
  function updateIndexed() {
    for (const k of kinds) { const G = k.mesh.geometry, C = prepare(k, G); if (!C) continue; let changed = false;
      for (let c = 0; c < C.cells.length; c++) { const B = C.cells[c].box, cur = C.lv[c];
        const L = !LOD.on ? 0 : !F.intersectsBox(B) ? -1 : levelOf(B.distanceToPoint(eye), cur);
        if (L !== cur) { C.lv[c] = L; changed = true; } }
      if (changed) compose(G, C);
      const n = [0, 0, 0, 0]; for (const L of C.lv) n[L + 1]++;
      S.kinds[k.name] = { cells: C.cells.length, culled: n[0], full: n[1], simplified: n[2], far: n[3], triangles: C.tris, composes: C.composes, composeMs: C.ms, prepMs: C.prepMs }; }
  }

  // ---------- the building cells: one mesh each, its geometry swapped between the levels
  const tiles = [], want = new Map(); let gen = 0, pumping = false;
  function tileRaycast(rc, out) {   // a tap, the zoom stop, the drone: always the full geometry (the exact building)
    const U = this.userData, full = U.full; if (!full || this.geometry === full) { THREE.Mesh.prototype.raycast.call(this, rc, out); return; }
    const p = U.proxy || (U.proxy = new THREE.Mesh()); p.geometry = full; p.material = this.material; p.matrixWorld.copy(this.matrixWorld); p.parent = this.parent;
    THREE.Mesh.prototype.raycast.call(p, rc, out);
  }
  function addTile(m) {
    const G = m.geometry, now = performance.now();
    Object.assign(m.userData, { full: G, lods: [G, undefined, undefined], level: 0, used: [now, now, now], box: G.boundingBox.clone(), key: G.userData.tile });
    m.raycast = tileRaycast; tiles.push(m);
  }
  function dropTiles() {   // before a rebuild: every level of every cell
    gen++; want.clear();
    for (const m of tiles) for (const G of new Set(m.userData.lods)) if (G) { G.userData.freed = false; G.dispose(); }
    tiles.length = 0;
  }
  function swap(m, L) {
    const U = m.userData; let G = U.lods[L]; for (let k = L - 1; !G && k >= 0; k--) G = U.lods[k];   // an empty level (null): the finer one
    if (G && m.geometry !== G) { G.userData.freed = false; m.geometry = G; }
    U.level = L; draw();
  }
  function pump() {   // build the wanted levels in the background, nearest first, SLICE_MS at a time
    if (pumping) return; pumping = true;
    const step = () => {
      const t0 = performance.now(), g = gen;
      while (want.size && performance.now() - t0 < SLICE_MS) {
        let best = null; for (const [key, w] of want) if (!best || w.d < best.d) best = w;
        want.delete(best.id); const U = best.m.userData; if (U.lods[best.L] !== undefined || !tiles.includes(best.m)) continue;
        const tb = performance.now(), G = buildTile(U.key, best.L); if (g !== gen) break;   // a rebuild came in between
        if (G) CPU.watch(G, { normal: 'normal', gk: 'runs' });
        U.lods[best.L] = G || null; U.used[best.L] = performance.now(); S.builds++; S.buildMs = Math.round(S.buildMs + performance.now() - tb); draw();
      }
      S.pending = want.size;
      if (want.size) setTimeout(step, 0); else pumping = false;
    };
    setTimeout(step, 0);
  }
  function updateTiles(now) {
    const n = [0, 0, 0];
    for (const m of tiles) { const U = m.userData, d = U.box.distanceToPoint(eye), L = levelOf(d, U.level);
      if (L !== U.level) { if (U.lods[L] !== undefined) swap(m, L); else if (F.intersectsBox(U.box)) { want.set(U.key + '/' + L, { id: U.key + '/' + L, m, L, d }); pump(); } }
      n[U.level]++; U.used[U.level] = now;
      // levels not drawn: GPU buffers back after FREE_MS, a simplified or far geometry dropped after DROP_MS
      for (let k = 0; k < 3; k++) { const G = U.lods[k]; if (!G || G === m.geometry) continue;
        if (k && now - U.used[k] > DROP_MS) { G.userData.freed = false; G.dispose(); U.lods[k] = undefined; S.dropped++; continue; }
        if (!G.userData.freed && now - U.used[k] > FREE_MS) { G.dispose(); G.userData.freed = true; S.freed++; } } }
    S.tiles = { full: n[0], simplified: n[1], far: n[2] };
  }

  function update() {
    camera.updateMatrixWorld(); frustum();
    updateIndexed(); updateTiles(performance.now());
  }
  // every geometry of a building cell (styles.js colours them all when the pixel palette changes)
  const geometriesOf = m => [...new Set((m.userData.lods || [m.geometry]).filter(Boolean))];
  return { addIndexed, addTile, dropTiles, update, geometriesOf, stats: S, LEVELS: NAMES, get tiles() { return tiles; } };
}
