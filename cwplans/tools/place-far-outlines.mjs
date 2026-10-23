// Operation place-far-outlines (coordinator, 2026-10-23, after issue #13: "the Tempelhof airport terminal ... is drawn as one
// huge solid dark oriented box that fills the whole inside of its arc"): in a built place with a city tier, the first
// block level (13) draws every big or tall building as its oriented box (place-lod before version 4). Where the footprint
// fills less than far_box_fill of that box, the box is replaced by the building's own outline, taken from the next level's
// tile (14), which draws it as an outline (simplified at 2.5 m) with the same height. Pure functions over glb bytes and
// tile matrices; build-place-tiles.mjs `far-outlines --region <id>` runs it as an activity over a built set whose raw
// inputs are gone (place-lod 4 does the same in a rebuild: far_box_fill). Skill docklands-3d-page, "Far views".
//   readGlb(buf)                     -> { J, views: [Buffer] } (one Buffer a bufferView)
//   writeGlb({ J, views })           -> Buffer (only the views that accessors or images use, packed in order)
//   outlinesOf(glb, nodeIndex)       -> the outline blocks of a tile: [{ k, h, c, s, label, pos (local glTF), idx, area, centroid }]
//   replaceBoxes(t13, t14s, M, opt)  -> { buf, replaced, without_outline_below } (M: 4 x 4 maps of a child's local glTF to the parent's)
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
export function readGlb(buf) {
  const jl = buf.readUInt32LE(12), J = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8')), bin = buf.subarray(20 + jl + 8);
  return { J, views: J.bufferViews.map(v => Buffer.from(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength))) };
}
export function writeGlb({ J, views }) {
  const used = new Set([...J.accessors.map(a => a.bufferView), ...(J.images || []).map(m => m.bufferView)].filter(v => v != null)), map = new Map(), bvs = [], chunks = []; let off = 0;
  [...used].sort((a, b) => a - b).forEach(i => { const v = J.bufferViews[i], b = views[i], pad = (4 - b.length % 4) % 4; map.set(i, bvs.length);
    bvs.push({ buffer: 0, byteOffset: off, byteLength: b.length, ...(v.byteStride ? { byteStride: v.byteStride } : {}), ...(v.target ? { target: v.target } : {}) }); chunks.push(b, Buffer.alloc(pad)); off += b.length + pad; });
  for (const a of J.accessors) a.bufferView = map.get(a.bufferView); for (const m of J.images || []) m.bufferView = map.get(m.bufferView);
  J.bufferViews = bvs; const bin = Buffer.concat(chunks); J.buffers = [{ byteLength: bin.length }];
  let js = Buffer.from(JSON.stringify(J)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const hdr = Buffer.alloc(12); hdr.writeUInt32LE(0x46546c67, 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (b, ty) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.writeUInt32LE(ty, 4); return [h, b]; };
  return Buffer.concat([hdr, ...ch(js, 0x4e4f534a), ...ch(bin, 0x004e4942)]);
}
// an accessor as floats (normalized integers scaled), n components a row
function acc(G, i) { const a = G.J.accessors[i], v = G.J.bufferViews[a.bufferView], T = CT[a.componentType], n = NC[a.type], b = G.views[a.bufferView], st = (v.byteStride || n * T.BYTES_PER_ELEMENT) / T.BYTES_PER_ELEMENT;
  const src = new T(b.buffer, b.byteOffset + (a.byteOffset || 0), (a.count - 1) * st + n), k = !a.normalized ? 1 : T === Uint16Array ? 1 / 65535 : T === Uint8Array ? 1 / 255 : T === Int16Array ? 1 / 32767 : T === Int8Array ? 1 / 127 : 1, out = new Float64Array(a.count * n);
  for (let q = 0; q < a.count; q++) for (let c = 0; c < n; c++) out[q * n + c] = src[q * st + c] * k; return { arr: out, n, count: a.count }; }
// the outline blocks of a tile (the primitive whose material is "blocks"; extras.blocks.outlines with tri_end)
export function outlinesOf(G) {
  const B = G.J.extras?.blocks, O = B?.outlines; if (!O?.tri_end?.length) return [];
  for (const nd of G.J.nodes) { if (nd.mesh == null) continue; for (const p of G.J.meshes[nd.mesh].primitives) { if (G.J.materials[p.material]?.name !== 'blocks' || p.attributes.TEXCOORD_0 != null) continue;
    const P = acc(G, p.attributes.POSITION), I = acc(G, p.indices), t = nd.translation || [0, 0, 0], s = nd.scale || [1, 1, 1], pos = new Float64Array(P.arr.length);
    for (let q = 0; q < P.arr.length; q += 3) { pos[q] = P.arr[q] * s[0] + t[0]; pos[q + 1] = P.arr[q + 1] * s[1] + t[1]; pos[q + 2] = P.arr[q + 2] * s[2] + t[2]; }
    const out = []; let t0 = 0;
    O.tri_end.forEach((te, k) => { const idx = Array.from(I.arr.subarray(3 * t0, 3 * te)); t0 = te; let ymax = -Infinity; for (const v of idx) ymax = Math.max(ymax, pos[3 * v + 1]);
      let A = 0, cx = 0, cz = 0; for (let q = 0; q < idx.length; q += 3) { const a = idx[q], b = idx[q + 1], c = idx[q + 2]; if ([a, b, c].some(v => Math.abs(pos[3 * v + 1] - ymax) > 0.05)) continue;
        const ar = Math.abs((pos[3 * b] - pos[3 * a]) * (pos[3 * c + 2] - pos[3 * a + 2]) - (pos[3 * c] - pos[3 * a]) * (pos[3 * b + 2] - pos[3 * a + 2])) / 2; A += ar; cx += ar * (pos[3 * a] + pos[3 * b] + pos[3 * c]) / 3; cz += ar * (pos[3 * a + 2] + pos[3 * b + 2] + pos[3 * c + 2]) / 3; }
      out.push({ k, h: O.h[k], c: O.c[k], label: B.height_sources[O.s[k]], idx, pos, area: A, centroid: A > 0 ? [cx / A, ymax, cz / A] : null }); });
    return out; } }
  return [];
}
const apply = (M, p) => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];
// t13: the level-13 tile (glb bytes); kids: [{ buf, M }] its level-14 children with M mapping their local glTF to t13's
export function replaceBoxes(t13, kids, { far_box_fill = 0.7, margin_m = 2 } = {}) {
  const G = readGlb(t13), B = G.J.extras?.blocks; if (!B?.boxes?.c?.length) return { buf: t13, replaced: 0, without_outline_below: 0, boxes: 0 };
  const ni = G.J.nodes.findIndex(n => n.extensions?.EXT_mesh_gpu_instancing), IA = G.J.nodes[ni].extensions.EXT_mesh_gpu_instancing.attributes;
  const T = acc(G, IA.TRANSLATION), R = acc(G, IA.ROTATION), S = acc(G, IA.SCALE), nb = T.count;
  const outs = []; for (const k of kids) for (const o of outlinesOf(readGlb(k.buf))) if (o.centroid) outs.push({ ...o, M: k.M, c13: apply(k.M, o.centroid) });
  const drop = new Set(), add = []; let unmatched = 0;
  for (let i = 0; i < nb; i++) { const a = 2 * Math.atan2(R.arr[4 * i + 1], R.arr[4 * i + 3]), ca = Math.cos(a), sa = Math.sin(a), L = S.arr[3 * i], W = S.arr[3 * i + 2];
    const hit = outs.filter(o => !o.used && o.h === B.boxes.h[i] && (() => { const dx = o.c13[0] - T.arr[3 * i], dz = o.c13[2] - T.arr[3 * i + 2], lx = ca * dx - sa * dz, lz = sa * dx + ca * dz; return Math.abs(lx) <= L / 2 + margin_m && Math.abs(lz) <= W / 2 + margin_m; })());
    if (!hit.length) { unmatched++; continue; }
    const o = hit.sort((p, q) => q.area - p.area)[0], fill = o.area / Math.max(1e-6, L * W);
    if (fill >= far_box_fill) continue;
    o.used = true; drop.add(i); add.push({ o, c: B.boxes.c[i] }); }
  // (unmatched: boxes with no outline below of the same height: the next level draws them as boxes too, so they fill their box)
  if (!drop.size) return { buf: t13, replaced: 0, without_outline_below: unmatched, boxes: nb };
  // the instances without the dropped boxes (and their block metadata)
  const keep = [...Array(nb).keys()].filter(i => !drop.has(i)), sub = (X, n) => { const o = new Float32Array(keep.length * n); keep.forEach((i, k) => { for (let c = 0; c < n; c++) o[k * n + c] = X.arr[i * n + c]; }); return o; };
  const newAcc = (arr, type, ct = 5126, extra = {}) => { G.views.push(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)); G.J.bufferViews.push({ buffer: 0, byteLength: arr.byteLength, ...extra }); G.J.accessors.push({ bufferView: G.J.bufferViews.length - 1, componentType: ct, count: arr.length / NC[type], type }); return G.J.accessors.length - 1; };
  IA.TRANSLATION = newAcc(sub(T, 3), 'VEC3'); IA.ROTATION = newAcc(sub(R, 4), 'VEC4'); IA.SCALE = newAcc(sub(S, 3), 'VEC3');
  for (const k of ['c', 'h', 's', 'f']) if (Array.isArray(B.boxes[k])) B.boxes[k] = keep.map(i => B.boxes[k][i]);
  // the outlines, moved into this tile's frame, as one primitive of float positions (its own node, no quantization)
  const pos = [], idx = [], HS = B.height_sources; B.outlines ||= { c: [], h: [], s: [], tri_end: [] };
  for (const { o, c } of add) { const base = pos.length / 3, vm = new Map();
    for (const v of o.idx) { if (!vm.has(v)) { vm.set(v, base + vm.size); pos.push(...apply(o.M, [o.pos[3 * v], o.pos[3 * v + 1], o.pos[3 * v + 2]])); } idx.push(vm.get(v)); }
    let si = HS.indexOf(o.label); if (si < 0) { HS.push(o.label); si = HS.length - 1; }
    B.outlines.c.push(c); B.outlines.h.push(o.h); B.outlines.s.push(si); B.outlines.tri_end.push(idx.length / 3); }
  const P32 = Float32Array.from(pos), mn = [0, 1, 2].map(c => Math.min(...[...P32].filter((_, q) => q % 3 === c))), mx = [0, 1, 2].map(c => Math.max(...[...P32].filter((_, q) => q % 3 === c)));
  const pa = newAcc(P32, 'VEC3', 5126, { target: 34962 }); G.J.accessors[pa].min = mn; G.J.accessors[pa].max = mx;
  const ia = newAcc(pos.length / 3 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx), 'SCALAR', pos.length / 3 > 65535 ? 5125 : 5123, { target: 34963 });
  const boxMat = G.J.materials.find(m => m.name === 'boxes' || m.name === 'blocks'); G.J.materials.push({ name: 'blocks', pbrMetallicRoughness: { ...(boxMat?.pbrMetallicRoughness || { baseColorFactor: [0.68, 0.6, 0.48, 1] }), metallicFactor: 0, roughnessFactor: 1 } });
  G.J.meshes.push({ primitives: [{ attributes: { POSITION: pa }, indices: ia, material: G.J.materials.length - 1, mode: 4 }] }); G.J.nodes.push({ mesh: G.J.meshes.length - 1 }); (G.J.scenes?.[0]?.nodes || []).push(G.J.nodes.length - 1);
  B.far_outlines = (B.far_outlines || 0) + add.length;
  return { buf: writeGlb(G), replaced: add.length, without_outline_below: unmatched, boxes: nb };
}
