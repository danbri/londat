// CPU copies of geometry in the Three.js port (docklands/): three.js keeps every attribute's typed array after the upload
// (to upload it again after a dispose). In Chromium these arrays count in the JS heap (performance.memory): 232 MB of the
// 488 MB at ?view=cw on 2026-10-20 (docklands/test/heap-holders.mjs). Arrays that no code reads on the CPU are given up
// once the geometry has been drawn, and kept in a form from which they are made again exactly, at the moment three.js
// makes their GPU buffer (the backend's createAttribute and updateAttribute are wrapped): after a dispose (globe.js
// freeModel, then stepReup), or for a material that reads an attribute the first one did not (the building normals: only
// the shadow pass's normal bias reads them, so WebGPU with shadows uploads them and WebGL 2 without shadows never does).
//   'normal': made again from the position and the index (BufferGeometry.computeVertexNormals, as the builders did);
//   'runs':   a per-vertex value that is constant over runs of vertices (gk: one building; color: one line, one green):
//             kept as runs (first vertex, value), a few thousand numbers for a million vertices.
// What stays: position and index (picking, the label occluder, the ground and the zoom stop), userData (bi: the building
// of each vertex) and every attribute not named. An attribute keeps its object and its count (the pipelines and the
// draw read those); only .array is swapped for an empty array of the same type while it is given up.
// Skill: docklands-3d-page, "Three.js port: trees by cell, JS heap (2026-10-20)".

const runsOf = (a, k) => {   // [first vertex, k values]... of the runs of equal values
  const out = [], n = a.length / k; let prev = -1;
  for (let v = 0; v < n; v++) { const o = v * k; let same = prev >= 0; if (same) for (let j = 0; j < k; j++) if (a[o + j] !== a[prev + j]) { same = false; break; } if (same) continue; out.push(v); for (let j = 0; j < k; j++) out.push(a[o + j]); prev = o; }
  return Float64Array.from(out); };
const fromRuns = (R, k, n, Ctor) => { const a = new Ctor(n * k), s = k + 1;
  for (let r = 0; r < R.length; r += s) { const v0 = R[r], v1 = r + s < R.length ? R[r + s] : n; for (let v = v0; v < v1; v++) for (let j = 0; j < k; j++) a[v * k + j] = R[r + 1 + j]; }
  return a; };

export function makeCpuCopies(renderer, { on = true } = {}) {
  const watched = new Map(), owner = new WeakMap(), stats = { geometries: 0, released: 0, restored: 0, freedMB: 0 };
  const uploaded = a => { const A = renderer._attributes; if (!A || !A.has(a)) return false; return A.get(a).version !== undefined; };   // (three.js r186 Attributes: a version once the GPU buffer exists)
  const add = bytes => { stats.freedMB = +(stats.freedMB + bytes / 1048576).toFixed(1); };
  // three.js makes (or refills) a GPU buffer from attribute.array: a given-up array comes back first
  const be = renderer.backend;
  for (const fn of ['createAttribute', 'updateAttribute']) { const f = be[fn]; if (typeof f !== 'function') continue;
    be[fn] = function (attribute, ...rest) { const o = owner.get(attribute); if (o && o.w.kept[o.k]) restoreOne(o.G, o.w, o.k); return f.call(this, attribute, ...rest); }; }
  // watch(G, { name: 'normal' | 'runs' }): the named arrays are given up at once (a tile out of view may never be drawn);
  // each comes back when three.js makes its buffer, and is given up again after the frame that drew it (tick)
  function watch(G, spec) { if (!on || !G) return; const names = Object.keys(spec).filter(k => G.attributes[k]); if (!names.length) return;
    const w = { spec, names, kept: {} }; watched.set(G, w); for (const k of names) { owner.set(G.attributes[k], { G, w, k }); release(G, w, k); } stats.geometries = watched.size;
    // a geometry disposed for good is forgotten; one freed by globe.js freeModel (userData.freed, set after its dispose) is kept
    G.addEventListener('dispose', () => queueMicrotask(() => { if (!G.userData.freed) { watched.delete(G); stats.geometries = watched.size; } })); }
  function release(G, w, k) { const a = G.attributes[k], arr = a.array; if (!arr.length) return;
    w.kept[k] = w.spec[k] === 'runs' ? { runs: runsOf(arr, a.itemSize), Ctor: arr.constructor } : { Ctor: arr.constructor };
    a.array = new arr.constructor(0); stats.released++; add(arr.byteLength); }
  let pending = 0;   // arrays back on the CPU (tick has work)
  function restoreOne(G, w, k) { const a = G.attributes[k], kp = w.kept[k]; delete w.kept[k]; pending++;
    a.array = kp.runs ? fromRuns(kp.runs, a.itemSize, a.count, kp.Ctor) : new kp.Ctor(a.count * a.itemSize); add(-a.array.byteLength);
    if (w.spec[k] === 'normal' && k === 'normal') {   // (into the zeroed array: the builders' own call, the same result)
      const NI = G.userData.normalIndex, I0 = G.index; if (NI) G.index = NI;   // cells.js: the index drawn holds the cells in view only; normalIndex holds every triangle
      try { G.computeVertexNormals(); } finally { if (NI) G.index = I0; } }
    stats.restored++; }
  // restore(G): every given-up array of G back now (tests; three.js itself needs none of this: the wrapped backend restores)
  function restore(G) { const w = watched.get(G); if (!w) return false; const ks = Object.keys(w.kept); for (const k of ks) restoreOne(G, w, k); return ks.length > 0; }
  // after each drawn frame: the arrays that came back for an upload are given up again
  function tick() { if (!on || !pending) return; pending = 0; for (const [G, w] of watched) { if (G.userData.freed) { if (w.names.some(k => !w.kept[k])) pending++; continue; }
    for (const k of w.names) if (!w.kept[k]) { if (uploaded(G.attributes[k])) release(G, w, k); else pending++; } } }
  return { watch, tick, restore, stats };
}
