// Places on the globe (OKR KR1.2 with KR2.3): 3D Tiles 1.1 sets made by cwplans/tools/build-place-tiles.mjs, drawn in the
// globe's floating frame: each tile's world matrix is R (frame rotation) x its content matrix, with the translation
// R (C - O) computed in doubles every frame (as globe.js `place()`), so the GPU sees only small numbers.
// A place's tile set is a quadtree with REPLACE refinement (since 2026-10-20): the core (level-15 cells, full detail),
// the city (blocks), the surroundings to about 35 km (terrain with a ground texture of land cover, water, roads and rail).
// Each frame (G.onFrame) the tree is walked from its top cells: a tile out of the view frustum is skipped; a tile whose
// screen-space error (geometricError x K / distance, K = CSS height / (2 tan(fov / 2))) is above MAX_SSE is replaced by its
// children once all of its children in view are ready (else the tile itself is drawn and its children are fetched).
// Fetches: at most MAX_FETCH at once, nearest and coarsest first; glb parsed here (no GLTFLoader: our tiles use a few
// fixed layouts, so typed-array views of the binary chunk; KHR_mesh_quantization and EXT_mesh_gpu_instancing read),
// JPEG textures decoded by createImageBitmap (off the main thread); at most MAX_ACTIVATE new tiles put in the scene per
// frame (geometry upload and material set-up are the jank of a fly-in); tiles unused for a while are freed (LRU, CACHE).
// The place itself loads (index, tileset, surround.json, features.json) when the eye is within LOAD_M of its centre and
// is freed beyond FREE_M. While loaded: the globe's coarse terrain is cut away over the tile set's extent (terrain.js
// `U.hole`) once its top cells are in, the globe's ground sampler answers from the place's grids, a curtain closes the
// gap at the extent's edge, the place's town and peak names join the globe's labels, and the place answers search,
// "what is here" and the view description.
// Text and machine interface: findPlaces / goTo (search provider), featuresAt and the readout (where provider),
// describeView (G.placesDescribe), a tap on a core building (G.placeTap: its card), G.placesStats(). ?sse=<px> sets MAX_SSE.
// Why not 3d-tiles-renderer: it keeps a tile set in one ECEF group (or one fixed reoriented origin) and its fade and
// overlay plugins patch GLSL; the globe needs a floating origin and TSL. Our sets are plain 3D Tiles 1.1, so a 3D Tiles
// viewer (3d-tiles-renderer, CesiumJS, QGIS) reads them too.
// Skill: docklands-3d-page, "Three.js port: places as 3D Tiles (2026-10-18)" and "places, city and surroundings by level
// of detail (2026-10-20)".
import { latinPreferred, pickName } from '../geo/script.js';
import * as THREE from 'three/webgpu';
import { attribute, uniform, texture, uv, vec3, vec4, float, normalize, dot, max, mix, smoothstep, pow, select, positionView, cameraNear, cameraFar, viewZToLogarithmicDepth, normalFlat, normalLocal, cameraWorldMatrix, modelWorldMatrix } from 'three/tsl';
import { geodeticToEcef, enuBasis, surfaceDistance, D2R } from '../geo/ellipsoid.js';
import { fold, fmtDist, compass, bearingDeg } from './world.js';

export const PLACES_INDEX = '../cwplans/docklands/data/places/index.json';
export const LOAD_M = 150000, FREE_M = 220000;
const qs = new URLSearchParams(location.search);
const INST_MIN = 1025;   // instanced blocks: capacity over the 64 kB uniform limit (1,025 x 64 bytes), see activate
const MAX_SSE = +(qs.get('sse') || 24), MAX_FETCH = 8, MAX_ACTIVATE = 3, ACTIVATE_MS = 10, CACHE = 220, IDLE_MS = 15000;
const len = p => Math.hypot(p[0], p[1], p[2]);
const Y2Z = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];   // glTF y-up -> 3D Tiles z-up (column-major)
function mul4(a, b, o = new Float64Array(16)) { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }

// ---------- glb (our tiles): views of the binary chunk; quantized positions and texture coordinates made float here
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
// indices of a triangle strip (mode 5) as a list (degenerate triangles left out); a list (mode 4) as it is
function triList(ix, mode = 4) {
  if (mode !== 5) return ix;
  const out = new (ix.constructor)(Math.max(0, ix.length - 2) * 3); let k = 0;
  for (let i = 0; i + 2 < ix.length; i++) { const a = ix[i], b = ix[i + 1], c = ix[i + 2]; if (a === b || b === c || a === c) continue; if (i & 1) { out[k++] = b; out[k++] = a; out[k++] = c; } else { out[k++] = a; out[k++] = b; out[k++] = c; } }
  return out.subarray(0, k);
}
const joinIdx = (a, b) => { const o = new (a.length + b.length > 65535 || a instanceof Uint32Array || b instanceof Uint32Array ? Uint32Array : a.constructor)(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
function parseGlb(ab) {
  const dv = new DataView(ab); if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  const jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, jl))), bin = 20 + jl + 8;
  // an accessor as a packed float or integer array (strided data copied out; normalized integers scaled to 0..1 / -1..1)
  const acc = (i, asFloat) => { const a = json.accessors[i], v = json.bufferViews[a.bufferView], T = CT[a.componentType], n = NC[a.type], st = (v.byteStride || n * T.BYTES_PER_ELEMENT) / T.BYTES_PER_ELEMENT;
    const src = new T(ab, bin + (v.byteOffset || 0) + (a.byteOffset || 0), (a.count - 1) * st + n);
    if (!asFloat && st === n) return { arr: src, n };
    const out = new Float32Array(a.count * n), k = !a.normalized ? 1 : T === Uint16Array ? 1 / 65535 : T === Uint8Array ? 1 / 255 : T === Int16Array ? 1 / 32767 : T === Int8Array ? 1 / 127 : 1;
    for (let q = 0, o = 0; q < a.count; q++) for (let c = 0; c < n; c++) out[o++] = src[q * st + c] * k;
    return { arr: out, n }; };
  const view = i => { const v = json.bufferViews[i]; return new Uint8Array(ab, bin + (v.byteOffset || 0), v.byteLength); };
  const out = [];
  for (const nd of json.nodes) {
    if (nd.mesh == null) continue;
    const t = nd.translation || [0, 0, 0], s = nd.scale || [1, 1, 1], inst = nd.extensions?.EXT_mesh_gpu_instancing?.attributes;
    let prev = null;
    for (const p of json.meshes[nd.mesh].primitives) {
      // a primitive with the same attributes and material as the one before (our terrain: a strip, then the skirts as a
      // list) joins it: one index list, one draw call
      if (prev && prev.src.attributes.POSITION === p.attributes.POSITION && prev.src.material === p.material && p.indices != null && prev.idx) { prev.idx = joinIdx(prev.idx, triList(acc(p.indices, false).arr, p.mode)); continue; }
      const A = p.attributes, pos = acc(A.POSITION, true).arr;
      for (let q = 0; q < pos.length; q += 3) { pos[q] = pos[q] * s[0] + t[0]; pos[q + 1] = pos[q + 1] * s[1] + t[1]; pos[q + 2] = pos[q + 2] * s[2] + t[2]; }   // dequantize (KHR_mesh_quantization)
      const mat = json.materials[p.material], tex = mat?.pbrMetallicRoughness?.baseColorTexture;
      const prim = { src: p, name: mat?.name || '', pos, idx: p.indices != null ? triList(acc(p.indices, false).arr, p.mode) : null, uv: A.TEXCOORD_0 != null ? acc(A.TEXCOORD_0, true).arr : null,
        nrm: A.NORMAL != null ? acc(A.NORMAL, true).arr : null, col: A.COLOR_0 != null ? acc(A.COLOR_0, false) : null, fid: A._FEATURE_ID_0 != null ? acc(A._FEATURE_ID_0, true).arr : null,
        base: mat?.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1], img: tex ? (() => { const im = json.images[json.textures[tex.index].source]; return new Blob([view(im.bufferView)], { type: im.mimeType }); })() : null };
      if (inst) prim.inst = { t: acc(inst.TRANSLATION, true).arr, r: acc(inst.ROTATION, true).arr, s: acc(inst.SCALE, true).arr };
      out.push(prim); prev = prim;
    }
  }
  out.extras = json.extras || null;
  return out;
}

export async function attachPlaces(G, H, { scene, U }) {
  const base = new URL(PLACES_INDEX, location.href);
  const ix = await fetch(base).then(r => r.ok ? r.json() : { places: [] }).catch(() => ({ places: [] }));
  const P = (ix.places || []).map(p => ({ ...p, C: geodeticToEcef(p.centre[0], p.centre[1], 0), state: null, tiles: [], extras: [], feats: null, nodes: [], roots: [], sur: null }));
  G.places = P;
  const inArea = (p, lon, lat, m = 0) => { const dl = m / 111320 / Math.cos(lat * D2R), db = m / 110574; return lon >= p.area[0] - dl && lon <= p.area[2] + dl && lat >= p.area[1] - db && lat <= p.area[3] + db; };
  const inRect = (a, lon, lat) => lon >= a[0] && lon <= a[2] && lat >= a[1] && lat <= a[3];
  const extOf = p => p.extent || p.area;
  // a place of kind "blocks" (Greater London: cwplans/tools/place-blocks.mjs) has no ground of its own: no hole in the
  // globe's terrain, no curtain, no ground sampler; its blocks stand on the globe's own heights
  const hasGround = p => !!(p.ground || p.sur || p.ring);
  // the globe's floors (60 km away from data) do not apply over a place's tile set
  G.detailAt = (lon, lat) => P.some(p => p.extent ? inRect(p.extent, lon, lat) : inArea(p, lon, lat, 500));

  // ---------- materials: vertex colour (sRGB bytes), one colour (the blocks) or the ground texture; sun from the globe
  // (U.sun, floating frame); logarithmic depth as every globe material. One material for all buildings, one for all blocks.
  const upF = uniform(new THREE.Vector3(0, 1, 0));   // the place's up in the floating frame
  const light = n => { const sd = dot(upF, U.sun), day = smoothstep(-0.1, 0.12, sd), diff = max(dot(n, U.sun), 0); return mix(float(0.05), float(0.30), day).add(diff.mul(0.95).mul(day)); };
  const logDepth = m => { m.depthNode = viewZToLogarithmicDepth(positionView.z, cameraNear, cameraFar); return m; };
  function buildingMat(colour) {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const nW = normalize(cameraWorldMatrix.mul(vec4(normalFlat, 0)).xyz), nUp = dot(nW, upF).abs();   // roofs and walls: a touch of sky light on the roofs
    // the blocks (one colour): their tops tinted toward the tiled roofs of the core, so the core's blocks match its roofs
    const c = colour ? mix(colour, colour.mul(vec3(0.82, 0.58, 0.48)), smoothstep(0.7, 0.9, nUp)) : pow(attribute('color', 'vec4').rgb, vec3(2.2));
    m.colorNode = vec4(c.mul(light(nW).add(nUp.mul(0.08))), 1);
    return logDepth(m);
  }
  function groundMat(map) {
    const m = new THREE.MeshBasicNodeMaterial();
    const tn = map ? texture(map, uv()) : null, nW = normalize(modelWorldMatrix.mul(vec4(normalLocal, 0)).xyz), c = tn ? tn.rgb : vec3(0.45, 0.42, 0.36);
    m.colorNode = vec4(c.mul(light(nW)), 1); m.userData.tex = tn;
    return logDepth(m);
  }
  const BMAT = buildingMat(null), SHARED = new Set([BMAT]), blockMats = new Map(), groundPool = [];
  // (the block colour is a uniform, not a constant in the shader: one program for every colour)
  const blockMat = rgb => { const k = rgb.join(','); if (!blockMats.has(k)) { const m = buildingMat(uniform(new THREE.Vector3(...rgb))); blockMats.set(k, m); SHARED.add(m); } return blockMats.get(k); };
  // ---------- shader programs compiled before they are needed (KHR_parallel_shader_compile through compileAsync): the
  // first frame that drew a new kind of material linked its program on the main thread, 3 to 4 s in software rendering
  // (the largest single cost of a fly-in, 2026-10-20). Done once, when the first place loads (100+ km away).
  let warmed = null;
  function warm() {
    if (warmed || !G.cull?.renderer?.compileAsync) return warmed; const R = G.cull.renderer, cam = G.cull.camera;
    // one geometry per real attribute set (the attribute set is part of the program): ground (position, normal, uv),
    // core buildings (position, color, _feature_id_0), blocks and boxes (position), curtain (position, normal)
    const P3 = () => new THREE.BufferAttribute(new Float32Array([0, 0, -10, 1, 0, -10, 0, 1, -10]), 3), N3 = () => new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3);
    const gG = new THREE.BufferGeometry(); gG.setAttribute('position', P3()); gG.setAttribute('normal', N3()); gG.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
    const gB = new THREE.BufferGeometry(); gB.setAttribute('position', P3()); gB.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(12).fill(200), 4, true)); gB.setAttribute('_feature_id_0', new THREE.BufferAttribute(new Float32Array(3), 1));
    const gP = new THREE.BufferGeometry(); gP.setAttribute('position', P3());
    const gC = new THREE.BufferGeometry(); gC.setAttribute('position', P3()); gC.setAttribute('normal', N3());
    const tex = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); tex.needsUpdate = true; tex.colorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene(), gm = groundMat(tex), cm = curtainMat(), im = new THREE.InstancedMesh(gP, blockMat([0.66, 0.6, 0.5]), INST_MIN); im.count = 1; im.setMatrixAt(0, new THREE.Matrix4());
    for (const m of [new THREE.Mesh(gG, gm), new THREE.Mesh(gC, cm), new THREE.Mesh(gB, BMAT), new THREE.Mesh(gP, blockMat([0.66, 0.6, 0.5])), im]) { m.frustumCulled = false; sc.add(m); }
    const g = { dispose() { for (const x of [gG, gB, gP, gC]) x.dispose(); } };
    // the warm-up meshes are kept (never disposed): a program whose last user is disposed is deleted by three.js, and
    // freeing a place freed every ground material, so the next visit compiled them all again (5 s long tasks)
    warm.keep = sc; warmed = R.compileAsync(sc, cam).catch(e => console.warn('places: warm', e));
    return warmed;
  }

  // ---------- the tile tree of a place: nodes with a bounding sphere (ECEF), geometric error, content matrix (doubles)
  function nodesOf(p, t, parentW, parent, depth) {
    const W = t.transform ? (parentW ? mul4(parentW, t.transform) : Float64Array.from(t.transform)) : parentW;
    const r = t.boundingVolume.region, pts = [];
    for (const lon of [r[0], r[2], (r[0] + r[2]) / 2]) for (const lat of [r[1], r[3], (r[1] + r[3]) / 2]) for (const h of [r[4], r[5]]) pts.push(geodeticToEcef(lon / D2R, lat / D2R, h));
    const c = [0, 1, 2].map(i => pts.reduce((s, q) => s + q[i], 0) / pts.length), rad = Math.max(...pts.map(q => len([q[0] - c[0], q[1] - c[1], q[2] - c[2]])));
    const uri = t.content?.uri, key = uri ? uri.replace(/^.*\/|\.glb$/g, '') : 'root';
    const n = { p, key, level: +key.split('-')[0] || 0, depth, err: t.geometricError, uri, W, M: W ? mul4(W, Y2Z) : null, C: c, rad, kids: [], parent, state: null, meshes: [], used: 0, tris: 0, core: false };
    p.nodes.push(n);
    for (const k of t.children || []) n.kids.push(nodesOf(p, k, W, n, depth + 1));
    return n;
  }

  // ---------- load and free a place (the small files; the tiles come by the walk)
  async function load(p) {
    p.state = 'loading';
    try {
      const tsUrl = new URL(p.tileset, base);
      const [ts, sur] = await Promise.all([fetch(tsUrl).then(r => r.json()), p.surround ? fetch(new URL(p.surround, base)).then(r => r.json()).catch(() => null) : null]);
      if (p.state !== 'loading') return;
      p.tsUrl = tsUrl; p.nodes = []; p.sur = sur;
      const root = nodesOf(p, ts.root, null, null, 0);
      p.roots = root.uri ? [root] : root.kids;   // a set without content at the root: its children are the top cells
      // features.json: the core's buildings (the ground grid of the core, the text interface)
      const fj = await fetch(new URL(p.features, base)).then(r => r.json());
      if (p.state !== 'loading') return;
      p.feats = indexFeatures(fj); p.ground = fj.ground; p.geoid = fj.geoid_m; p.ring = fj.ring || null;
      p.coreTiles = new Set((fj.tiles || []).map(t => t.key)); for (const n of p.nodes) n.core = p.coreTiles.has(n.key) && !n.kids.length;
      await warm();   // the programs, before the first tile is drawn
      if (p.state !== 'loading') return;
      p.state = 'loaded'; p.t0 = performance.now(); patchSampler(); if (p.ring && !p.sur) p.extras.push(ringMesh(p));
      if (p.sur) addLabels(p);
      G.dirty = true; H.draw();
    } catch (e) { console.warn('places: load', p.id, e); p.state = 'failed'; }
  }
  function free(p) {
    for (const n of p.nodes) freeNode(n);
    for (const t of p.extras) { scene.remove(t.mesh); t.mesh.geometry.dispose(); if (!SHARED.has(t.mesh.material)) t.mesh.material.dispose(); }
    G.labels?.()?.clear(c => c.placeId === p.id);
    p.extras = []; p.nodes = []; p.roots = []; p.state = null; p.ringHo = null; p.topReady = false; p.curtain = null; G.dirty = true;
    dispatchEvent(new CustomEvent('docklands-place-freed', { detail: { id: p.id } }));
  }
  function indexFeatures(fj) {
    const pick = (fields, row) => Object.fromEntries(fields.map((f, i) => [f, row[i]]));
    const B = fj.buildings.map((r, i) => r && { ...pick(fj.buildings_fields, r), i }).filter(Boolean);
    const S = (fj.streets || []).map(r => pick(fj.streets_fields, r)), A = (fj.areas || []).map(r => pick(fj.areas_fields || ['name', 'kind', 'lon', 'lat', 'name_alt'], r)), Pt = (fj.points || []).map(r => pick(fj.points_fields, r));
    return { fj, B, byIndex: new Map(B.map(b => [b.i, b])), S, A, Pt };
  }

  // ---------- a tile: fetch, parse, decode (async), then activate (main thread, a few per frame), then free
  let inFlight = 0; const ready = [];   // decoded, waiting for activation
  async function fetchNode(n) {
    n.state = 'loading'; inFlight++;
    try {
      const ab = await fetch(new URL(n.uri, n.p.tsUrl)).then(r => { if (!r.ok) throw new Error(r.status + ' ' + n.uri); return r.arrayBuffer(); });
      const prims = parseGlb(ab);
      for (const q of prims) if (q.img) q.bmp = await createImageBitmap(q.img).catch(() => null);
      if (n.state !== 'loading') { for (const q of prims) q.bmp?.close?.(); return; }
      n.prims = prims; n.meta = prims.extras?.blocks || null; n.state = 'decoded'; ready.push(n);
    } catch (e) { console.warn('places: tile', n.uri, e); n.state = 'failed'; }
    finally { inFlight--; G.dirty = true; H.draw(); }   // a frame to activate it (the page's loop rests when nothing moves)
  }
  function activate(n) {
    for (const q of n.prims) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(q.pos, 3));
      if (q.idx) g.setIndex(new THREE.BufferAttribute(q.idx, 1));
      let mesh, kind;
      if (q.bmp || q.uv) {   // ground: the texture, smooth normals (stored, or computed here)
        if (q.uv) g.setAttribute('uv', new THREE.BufferAttribute(q.uv, 2));
        if (q.nrm) g.setAttribute('normal', new THREE.BufferAttribute(q.nrm, 3)); else g.computeVertexNormals();
        let map = null; if (q.bmp) { map = new THREE.Texture(q.bmp); map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.needsUpdate = true; }
        // ground materials are pooled, not disposed: a program whose last material is disposed is deleted by three.js,
        // so freeing a place made the next visit compile everything again (5 s long tasks in software rendering)
        let gm = map && groundPool.pop(); if (gm) gm.userData.tex.value = map; else gm = groundMat(map);
        mesh = new THREE.Mesh(g, gm); mesh.__map = map; kind = 'ground';
      } else if (q.inst) {   // city blocks as instances of a unit box
        // capacity at least INST_MIN: three.js puts a smaller instance matrix in a uniform array whose LENGTH is part of
        // the shader, so each tile with another small count compiled a program of its own (London: 7 programs, 6 s of
        // long tasks in a fly-in, 2026-10-21); above the uniform limit it is an instanced attribute: one program for all
        const k = q.inst.t.length / 3; mesh = new THREE.InstancedMesh(g, blockMat(q.base.slice(0, 3)), Math.max(k, INST_MIN)); mesh.count = k; kind = 'blocks';
        const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
        for (let i = 0; i < k; i++) { v.fromArray(q.inst.t, 3 * i); qt.fromArray(q.inst.r, 4 * i); sc.fromArray(q.inst.s, 3 * i); mesh.setMatrixAt(i, m4.compose(v, qt, sc)); }
        mesh.computeBoundingSphere();
      } else if (q.col) {   // core buildings: vertex colours, feature ids
        g.setAttribute('color', new THREE.BufferAttribute(q.col.arr, q.col.n, true)); if (q.fid) g.setAttribute('_feature_id_0', new THREE.BufferAttribute(q.fid, 1));
        mesh = new THREE.Mesh(g, BMAT); kind = 'buildings';
      } else { mesh = new THREE.Mesh(g, blockMat(q.base.slice(0, 3))); kind = 'blocks'; }
      mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false; mesh.visible = false;
      mesh.userData = { place: n.p.id, tile: n.uri, ground: kind === 'ground', kind, node: n, map: mesh.material.colorNode && kind === 'ground' ? mapOf(mesh) : null };
      scene.add(mesh); n.meshes.push(mesh); n.tris += (q.idx ? q.idx.length : q.pos.length / 3) / 3 * (q.inst ? q.inst.t.length / 3 : 1);
    }
    n.prims = null; n.state = 'ready';
  }
  const mapOf = m => m.__map || null;
  function freeNode(n) {
    for (const m of n.meshes) { scene.remove(m); m.geometry.dispose(); if (m.isInstancedMesh) m.dispose(); if (m.userData.ground && m.material.userData.tex && groundPool.length < 400) groundPool.push(m.material); else if (!SHARED.has(m.material)) m.material.dispose(); if (m.userData.map) { m.userData.map.image?.close?.(); m.userData.map.dispose(); } }
    n.meshes = []; n.tris = 0; if (n.state === 'decoded') { for (const q of n.prims || []) q.bmp?.close?.(); n.prims = null; }
    n.state = null;
  }

  // ---------- the globe's ground sampler over a loaded place: the core's DEM grid, then the surroundings grid
  let patched = false;
  function patchSampler() {
    const S = G.sampler && G.sampler(); if (!S || patched) return; patched = true; const h0 = S.h; S.h0 = h0;
    S.h = (lon, lat) => { for (const p of P) if (p.state === 'loaded' && p.ground) { if (inArea(p, lon, lat)) return groundAt(p, lon, lat);
      if (p.sur && p.topReady && inRect(p.sur.ground.area, lon, lat)) return gridAt(p.sur.ground.h, p.sur.ground.grid, p.sur.ground.area, lon, lat);
      if (p.ringHo && inRect(p.ring.area, lon, lat)) return gridAt(p.ringHo, p.ring.grid, p.ring.area, lon, lat); } return h0(lon, lat); };
  }
  const groundAt = (p, lon, lat) => gridAt(p.ground.h, p.ground.grid, p.area, lon, lat);
  function gridAt(h, n, a, lon, lat) {
    const fx = (lon - a[0]) / (a[2] - a[0]) * (n - 1), fy = (a[3] - lat) / (a[3] - a[1]) * (n - 1);
    const i = Math.max(0, Math.min(n - 2, Math.floor(fx))), j = Math.max(0, Math.min(n - 2, Math.floor(fy))), u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fy - j)), at = (x, y) => h[y * n + x];
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  }
  // the curtain: a wall round the place's extent from the lower to the higher of its ground and the globe's coarse terrain,
  // so that no gap shows the sky where the world terrain (10 km box means) is above or below the place's own ground
  const CURTAIN = vec3(0.36, 0.34, 0.27); let CMAT = null;
  function curtainMat() { const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }); m.colorNode = vec4(CURTAIN.mul(light(upF)), 1); return logDepth(m); }
  function curtain(p) {
    const S = G.sampler(), hG = (lon, lat) => (S.h0 || S.h)(lon, lat) * (U.exag?.value || 1) + S.geoid(lon, lat);
    const sg = p.sur?.ground, hP = sg ? (lon, lat) => gridAt(sg.h, sg.grid, sg.area, lon, lat) + S.geoid(lon, lat) : p.ringHo ? (lon, lat) => gridAt(p.ringHo, p.ring.grid, p.ring.area, lon, lat) + S.geoid(lon, lat) : (lon, lat) => groundAt(p, lon, lat) + p.geoid;
    const [w, s2, e, n] = sg ? sg.area : p.ringHo ? p.ring.area : p.area, ring = [], k = sg ? 96 : 48, wide = !!(sg || p.ringHo);
    for (let i = 0; i < k; i++) ring.push([w + (e - w) * i / k, s2]); for (let i = 0; i < k; i++) ring.push([e, s2 + (n - s2) * i / k]);
    for (let i = 0; i < k; i++) ring.push([e - (e - w) * i / k, n]); for (let i = 0; i < k; i++) ring.push([w, n - (n - s2) * i / k]);
    const pos = [], nrm = [], idx = [], C = p.C;
    ring.forEach(([lon, lat], i) => { const a = hG(lon, lat), b2 = hP(lon, lat), lo = Math.min(a, b2) - 30, hi = Math.max(a, b2) + (wide ? 25 : a > b2 ? 4 + 0.1 * (a - b2) : -0.3), u = enuBasis(lon, lat).up;
      for (const h of [lo, hi]) { const q = geodeticToEcef(lon, lat, h); pos.push(q[0] - C[0], q[1] - C[1], q[2] - C[2]); nrm.push(...u); }
      const j = (i + 1) % ring.length; idx.push(2 * i, 2 * j, 2 * i + 1, 2 * i + 1, 2 * j, 2 * j + 1); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
    if (!CMAT) { CMAT = curtainMat(); SHARED.add(CMAT); }   // one, shared and kept (its program too)
    const mesh = new THREE.Mesh(g, CMAT); mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false; mesh.userData = { C, B: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], ground: true, curtain: true, place: p.id };
    scene.add(mesh); return { mesh, tris: idx.length / 3 };
  }
  // the ring (places built without a surround block): the place's wider terrain grid (features.json ring, about 8 km
  // square), coloured as the globe's land, its outer part blended into the world terrain, drawn round the place's tiles
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function ringMesh(p) {
    const R = p.ring, S = G.sampler(), ex = U.exag?.value || 1, n = R.grid, [w, s2, e, nn] = R.area, lc = (w + e) / 2, bc = (s2 + nn) / 2, hw = (e - w) / 2, hh = (nn - s2) / 2, C = p.C;
    const Ho = new Float32Array(n * n), pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), geo = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, lon = w + (e - w) * i / (n - 1), lat = nn - (nn - s2) * j / (n - 1), N = S.geoid(lon, lat), d = Math.max(Math.abs(lon - lc) / hw, Math.abs(lat - bc) / hh);
      const hd = R.h[k], hw0 = S.h0 ? S.h0(lon, lat) * ex : hd, t = smooth(0.6, 0.97, d), ho = hd + (hw0 - hd) * t;
      Ho[k] = ho; const q = geodeticToEcef(lon, lat, ho + N); pos.set([q[0] - C[0], q[1] - C[1], q[2] - C[2]], 3 * k); geo.set([lon, lat], 2 * k);
      const a1 = smooth(150, 900, ho), a2 = smooth(900, 2200, ho); let c = [0.16 + (0.33 - 0.16) * a1, 0.27 + (0.33 - 0.27) * a1, 0.10 + (0.17 - 0.10) * a1]; c = [c[0] + (0.38 - c[0]) * a2, c[1] + (0.30 - c[1]) * a2, c[2] + (0.20 - c[2]) * a2]; col.set(c, 3 * k);
    }
    const idx = []; for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('col', new THREE.BufferAttribute(col, 3)); g.setAttribute('geo', new THREE.BufferAttribute(geo, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshBasicNodeMaterial(), nW = normalize(modelWorldMatrix.mul(vec4(normalLocal, 0)).xyz), sd = dot(upF, U.sun), day = smoothstep(-0.12, 0.12, sd);
    m.colorNode = vec4(attribute('col', 'vec3').mul(mix(float(0.025), float(0.16), day).add(max(dot(nW, U.sun), 0).mul(1.15).mul(day))), 1);
    const pa = p.area, gq = attribute('geo', 'vec2'), inPlace = gq.x.greaterThan(pa[0]).and(gq.x.lessThan(pa[2])).and(gq.y.greaterThan(pa[1])).and(gq.y.lessThan(pa[3]));
    m.opacityNode = select(inPlace, float(0), float(1)); m.alphaTest = 0.5; logDepth(m);
    const mesh = new THREE.Mesh(g, m); mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false; mesh.userData = { C, B: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], ground: true, ring: true, place: p.id };
    p.ringHo = Ho; scene.add(mesh); return { mesh, tris: idx.length / 3 };
  }
  G.placeGround = (lon, lat) => { for (const p of P) if (p.state === 'loaded' && p.ground && inArea(p, lon, lat)) return groundAt(p, lon, lat); return null; };

  // ---------- the place's names (surround.json labels: towns, villages, peaks) on the globe's labels
  const LMIN = { city: 7.5, town: 9, village: 11.5, hamlet: 13, peak: 11.5 };
  function addLabels(p) {
    const L = G.labels?.(), S = p.sur; if (!L || !S) return; const F = S.labels_fields, ix = k => F.indexOf(k);
    const byText = new Map(); for (const c of L.candidates) (byText.get(c.text) || byText.set(c.text, []).get(c.text)).push(c);
    const near = (text, P3) => (byText.get(text) || []).some(c => Math.hypot(c.P[0] - P3[0], c.P[1] - P3[1], c.P[2] - P3[2]) < 6000);   // the globe has it already
    for (const r of S.labels) { const lon = r[ix('lon')], lat = r[ix('lat')], kind = r[ix('kind')], ele = r[ix('elevation_m')];
      if (near(r[0], geodeticToEcef(lon, lat, 0))) continue;
      const h = gridAt(S.ground.h, S.ground.grid, S.ground.area, lon, lat) + 45 + (G.sampler?.()?.geoid?.(lon, lat) || 0);
      const text = kind === 'peak' && ele ? `${r[0]} ${ele} m` : r[0];
      const c = L.add({ id: `pl:${p.id}:${r[0]}:${lon}`, text, cls: 'place', P: geodeticToEcef(lon, lat, h), up: enuBasis(lon, lat).up, minZ: LMIN[kind] ?? 12, rank: r[ix('rank')] + 3, pop: r[ix('population')] || 0, title: r[1] || undefined, placeId: p.id }); (byText.get(r[0]) || byText.set(r[0], []).get(r[0])).push(c); }
  }

  // ---------- per frame (globe.js drawGlobe, before the render): load / free places, walk the tile trees, place the tiles
  let frameNo = 0; const want = [], drawn = [], lastDrawn = new Set();
  const tmp = [0, 0, 0];
  function placeMesh(m, M, F) {   // matrixWorld = frame rotation R x content matrix M, translation R (M_t - O), in doubles
    const R = F.R, O = F.O, me = m.matrixWorld.elements;
    tmp[0] = M[12] - O[0]; tmp[1] = M[13] - O[1]; tmp[2] = M[14] - O[2];
    for (let r = 0; r < 3; r++) { const a = R[r][0], b = R[r][1], c = R[r][2];
      me[r] = a * M[0] + b * M[1] + c * M[2]; me[4 + r] = a * M[4] + b * M[5] + c * M[6]; me[8 + r] = a * M[8] + b * M[9] + c * M[10]; me[12 + r] = a * tmp[0] + b * tmp[1] + c * tmp[2]; }
    me[3] = 0; me[7] = 0; me[11] = 0; me[15] = 1;
  }
  function placeExtra(m, F) { const C = m.userData.C, R = F.R, O = F.O, me = m.matrixWorld.elements, d0 = C[0] - O[0], d1 = C[1] - O[1], d2 = C[2] - O[2];
    for (let r = 0; r < 3; r++) { me[r] = R[r][0]; me[4 + r] = R[r][1]; me[8 + r] = R[r][2]; me[12 + r] = R[r][0] * d0 + R[r][1] * d1 + R[r][2] * d2; } me[3] = me[7] = me[11] = 0; me[15] = 1; }
  // the walk skips levels: the wanted tiles are the ones whose error is small enough for this view (or leaves), all
  // fetched at once (nearest first, their parents next); a part of the view whose wanted tiles are not all ready is drawn
  // by its nearest ready ancestor (REPLACE: never a tile and one of its descendants together). A fly-in to a street then
  // needs one round of fetches, not one per level (2026-10-20: level by level it took 6 rounds of fetch and activation).
  const out = [];
  function walkPlace(p, eye, K, now) {
    const cull = G.cull, need = (n, pri) => { if (!n.state && n.uri) { n.pri = pri; want.push(n); } };
    let pending = false;
    // returns true when the subtree is drawn completely by tiles at the wanted level (pushed to `out`)
    const visit = n => {
      if (cull && !cull.inFrustum(n.C, n.rad)) return true;
      const d = Math.max(1, Math.hypot(eye[0] - n.C[0], eye[1] - n.C[1], eye[2] - n.C[2]) - n.rad), sse = n.err * K / d; n.used = now;
      if (n.kids.length && sse > MAX_SSE) {
        const mark = out.length; let all = true;
        for (const k of n.kids) if (!visit(k)) all = false;
        if (all) return true;
        pending = true;
        if (n.state === 'ready') { out.length = mark; out.push(n); return true; }   // the children are not all in: this tile instead
        need(n, sse / 4 - n.depth);   // a fallback nearer than the top cells, after the wanted tiles
        return false;
      }
      if (n.state === 'ready') { out.push(n); return true; }
      pending = true; need(n, sse + 1e4 - n.depth); return false;
    };
    out.length = 0;
    for (const r of p.roots) visit(r);
    for (const n of out) drawn.push(n);
    // the top cells: all of them are wanted while the place is loaded (the hole in the world terrain waits for them)
    let top = true; for (const r of p.roots) { r.used = now; if (r.state !== 'ready') { top = false; need(r, 1e6); } }
    p.topReady = top; p.pending = pending;
  }
  G.onFrame = function (eye) {
    const F = G.frameState, now = performance.now(), K = G.cull ? G.cull.K() : innerHeight; frameNo++;
    let hole = null, best = Infinity; want.length = 0; drawn.length = 0;
    for (const p of P) {
      const d = len([eye[0] - p.C[0], eye[1] - p.C[1], eye[2] - p.C[2]]);
      if (d < LOAD_M && !p.state) load(p); else if (d > FREE_M && p.state === 'loaded') { free(p); continue; }
      if (p.state !== 'loaded') continue;
      walkPlace(p, eye, K, now);
      if (p.topReady && !p.curtain && hasGround(p) && G.sampler?.()) { p.curtain = curtain(p); p.extras.push(p.curtain); }
      if (d < best) { best = d; hole = p; }
      for (const t of p.extras) { placeExtra(t.mesh, F); t.mesh.visible = !t.mesh.userData.curtain || p.topReady || !p.sur; }
    }
    // fetch the wanted tiles, highest priority first
    if (want.length && inFlight < MAX_FETCH) { want.sort((a, b) => b.pri - a.pri); for (const n of want) { if (inFlight >= MAX_FETCH) break; if (!n.state) fetchNode(n); } }
    // activate decoded tiles: at most MAX_ACTIVATE a frame and ACTIVATE_MS of work (nearest first)
    if (ready.length) { ready.sort((a, b) => (b.pri || 0) - (a.pri || 0)); const t0 = performance.now(); let k = 0;
      while (ready.length && k < MAX_ACTIVATE && performance.now() - t0 < ACTIVATE_MS) { const n = ready.shift(); if (n.state === 'decoded') { activate(n); k++; } }
      if (ready.length) G.dirty = true; }
    // show what is drawn this frame, hide the rest
    const now2 = new Set(drawn);
    for (const n of lastDrawn) if (!now2.has(n)) for (const m of n.meshes) m.visible = false;
    for (const n of drawn) for (const m of n.meshes) { placeMesh(m, n.M, F); m.visible = true; }
    lastDrawn.clear(); for (const n of drawn) lastDrawn.add(n);
    // free tiles unused for a while when over the cache size (never the top cells)
    if (frameNo % 30 === 0) { const live = []; for (const p of P) for (const n of p.nodes) if (n.state === 'ready' && n.depth > 1) live.push(n);
      if (live.length > CACHE) { live.sort((a, b) => a.used - b.used); for (const n of live.slice(0, live.length - CACHE)) if (now - n.used > IDLE_MS && !now2.has(n)) freeNode(n); } }
    if (U.hole) { const a = hole && hasGround(hole) && (hole.sur ? (hole.topReady ? hole.sur.ground.area : null) : hole.ringHo ? hole.ring.area : hole.area); if (a) U.hole.value.set(a[0], a[1], a[2], a[3]); else U.hole.value.set(0, 0, -1, -1); }
    if (hole) { const R = F.R, u = enuBasis(hole.centre[0], hole.centre[1]).up; upF.value.set(R[0][0] * u[0] + R[0][1] * u[1] + R[0][2] * u[2], R[1][0] * u[0] + R[1][1] * u[1] + R[1][2] * u[2], R[2][0] * u[0] + R[2][1] * u[1] + R[2][2] * u[2]); }
    if (want.length || ready.length) { G.dirty = true; requestAnimationFrame(() => H.draw()); } else if (inFlight) G.dirty = true;
  };
  // stats for tests and the page API: drawn tiles by tier and level, triangles drawn, loaded and pending tiles
  G.placesStats = () => P.map(p => { const st = { id: p.id, state: p.state, tiles: 0, triangles: 0, loaded: 0, drawn_by_level: {}, tiers: { core: 0, city: 0, surroundings: 0 }, settled: false, buildings: p.feats ? p.feats.B.length : null };
    for (const n of p.nodes) { if (n.state === 'ready') st.loaded++; }
    for (const n of lastDrawn) if (n.p === p) { st.tiles += n.meshes.length; st.triangles += n.tris; st.drawn_by_level[n.level] = (st.drawn_by_level[n.level] || 0) + 1; st.tiers[n.core ? 'core' : n.meshes.some(m => m.userData.kind === 'blocks') ? 'city' : 'surroundings']++; }
    for (const t of p.extras) { st.tiles++; st.triangles += t.tris; }
    st.settled = p.state === 'loaded' && !p.pending && !inFlight && !ready.length && (!p.sur || p.topReady) && (hasGround(p) || p.topReady);
    return st; });

  // ---------- text and machine interface
  const featsP = p => p.featsP || (p.featsP = p.feats ? Promise.resolve(p.feats) : fetch(new URL(p.features, base)).then(r => r.json()).then(fj => (p.feats ||= indexFeatures(fj))));
  const surP = p => !p.surround ? Promise.resolve(null) : p.surP || (p.surP = p.sur ? Promise.resolve(p.sur) : fetch(new URL(p.surround, base)).then(r => r.json()).then(s => (p.sur ||= s)));
  // names: the Latin form only while Latin is preferred (geo/script.js; owner, 2026-10-22); a name with no Latin form gives ''
  const nameText = (n, alt) => { if (latinPreferred()) { const m = pickName(n, alt); return m || ''; } return alt ? `${n} (${alt})` : n; };
  const localTime = p => { try { return new Intl.DateTimeFormat(p.locale || undefined, { timeZone: p.timeZone, hour: '2-digit', minute: '2-digit', weekday: 'short' }).format(new Date(H.clock())); } catch { return null; } };
  G.placeTime = (lon, lat) => { const p = P.find(q => inArea(q, lon, lat) || (q.extent && inRect(q.extent, lon, lat))); if (!p) return null; const t = H.clock(); return { place: p.id, time_zone: p.timeZone, local: localTime(p), iso: new Date(t).toISOString() }; };
  const rowsOf = (S, k) => (S[k] || []).map(r => Object.fromEntries(S[k + '_fields'].map((f, i) => [f, r[i]])));
  // search: the place's own words (region config place.search), named buildings, points, streets, squares and water;
  // the towns, villages and peaks, rivers and roads of the surroundings
  G.addSearchProvider(async (q, n) => {
    const f = fold(q); if (f.length < 2) return [];
    const out = [];
    for (const p of P) {
      const F = await featsP(p).catch(() => null); if (!F) continue;
      const sc = t => { t = fold(t); return !t ? 0 : t === f ? 100 : t.startsWith(f) ? 80 : (' ' + t).includes(' ' + f) ? 60 : f.length >= 3 && t.includes(f) ? 30 : 0; };
      const add = (name, alt, kind, lon, lat, extra = {}, bonus = 0) => { const s = Math.max(sc(name), sc(alt || '')), shown = nameText(name, alt); if (s && shown) out.push({ name: shown, local_name: (latinPreferred() ? undefined : alt) || undefined, kind, lon, lat, region: p.name, id: `place:${p.id}:${extra.osm_id || fold(name)}`, score: s + bonus, alt_m: extra.alt_m || (kind === 'building' || kind === 'point' ? 700 : 1500), facts: [{ label: 'Place', value: p.name, source: extra.source || 'build-place-tiles (OpenStreetMap)' }, ...(extra.facts || [])], place: p.id, osm_id: extra.osm_id }); };
      for (const t of F.fj.search || []) add(t, null, 'place', p.centre[0], p.centre[1], {}, 1);
      for (const b of F.B) if (b.name || b.address) { add(b.name || b.address, b.name ? b.name_alt : null, 'building', b.lon, b.lat, { osm_id: b.osm_id, facts: [{ label: 'Height', value: `${b.height_m} m (${b.height_source})` }] }); if (b.name && b.address) add(b.address, null, 'building', b.lon, b.lat, { osm_id: b.osm_id }); }
      for (const x of F.Pt) add(x.name, x.name_alt, 'point', x.lon, x.lat, { osm_id: x.osm_id, facts: [{ label: 'Kind', value: x.kind }] });
      for (const x of F.S) add(x.name, x.name_alt, 'street', x.lon, x.lat);
      for (const x of F.A) add(x.name, x.name_alt, x.kind === 'paved' ? 'square' : x.kind, x.lon, x.lat);
      const S = await surP(p).catch(() => null);
      if (S) { const src = 'OpenStreetMap via Overture Maps (ODbL)';
        for (const x of rowsOf(S, 'labels')) add(x.name, x.name_alt, x.kind === 'peak' ? 'peak' : 'place', x.lon, x.lat, { alt_m: x.kind === 'peak' ? 4000 : x.kind === 'hamlet' ? 2500 : 6000, source: src, facts: [{ label: 'Kind', value: x.kind }, ...(x.elevation_m ? [{ label: 'Height', value: `${x.elevation_m} m` }] : [])] }, -2);
        for (const x of rowsOf(S, 'rivers')) add(x.name, x.name_alt, 'river', x.lon, x.lat, { alt_m: 8000, source: src, facts: [{ label: 'Length in the surroundings', value: `${x.length_km} km` }] }, -3);
        for (const x of rowsOf(S, 'roads')) add(x.name, x.name_alt, 'road', x.lon, x.lat, { alt_m: 5000, source: src, facts: [{ label: 'Class', value: x.class }] }, -4); }
    }
    out.sort((a, b) => b.score - a.score); const seen = new Set();
    return out.filter(r => { const k = r.name + '|' + r.kind; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, n).map(r => ({ ...r, score: Math.min(100, r.score) + (r.score > 100 ? 0.5 : 0) }));
  });
  // nearest buildings to a point (named ones first when asked)
  function nearest(F, lon, lat, named) {
    let best = null, bd = Infinity; for (const b of F.B) { if (named && !b.name) continue; const d = surfaceDistance(lon, lat, b.lon, b.lat); if (d < bd) { bd = d; best = b; } }
    return best ? { b: best, d: bd } : null;
  }
  const nearestRow = (rows, lon, lat) => { let best = null, bd = Infinity; for (const r of rows) { const d = surfaceDistance(lon, lat, r.lon, r.lat); if (d < bd) { bd = d; best = r; } } return best ? { r: best, d: bd } : null; };
  // where: inside a place, its name, the building under the point (or the nearest), the nearest named building, local
  // time; in its surroundings, the nearest town or village and the ground height
  G.addWhereProvider(async (lon, lat) => {
    const p = P.find(q => inArea(q, lon, lat)) || P.find(q => q.extent && inRect(q.extent, lon, lat)); if (!p) return {};
    const t = localTime(p), w = G.world_?.where?.(lon, lat) || {};
    if (!inArea(p, lon, lat)) {
      const S = await surP(p).catch(() => null); if (!S) return {};
      const ls = rowsOf(S, 'labels'), nt = nearestRow(ls.filter(x => x.kind !== 'peak'), lon, lat), pk = nearestRow(ls.filter(x => x.kind === 'peak'), lon, lat), rv = nearestRow(rowsOf(S, 'rivers'), lon, lat);
      const h = Math.round(gridAt(S.ground.h, S.ground.grid, S.ground.area, lon, lat));
      const out = { builtUp: nt && nt.d < 2500 ? nameText(nt.r.name, nt.r.name_alt) || undefined : undefined, country: w.country?.name || undefined, source: 'OpenStreetMap via Overture Maps (ODbL); terrain of the place', place: p.id, local_time: t ? `${t} (${p.timeZone})` : undefined, ground_m: h,
        nearestPlace: nt ? { name: nameText(nt.r.name, nt.r.name_alt), kind: nt.r.kind, dist_m: Math.round(nt.d), direction: compass(bearingDeg(lon, lat, nt.r.lon, nt.r.lat)) } : undefined,
        nearestPeak: pk ? { name: nameText(pk.r.name, pk.r.name_alt), elevation_m: pk.r.elevation_m, dist_m: Math.round(pk.d) } : undefined };
      out.text = `In the surroundings of ${p.label || p.name}, ground about ${h} m above sea level.${nt ? ` Nearest place: ${nameText(nt.r.name, nt.r.name_alt)} (${nt.r.kind}), ${fmtDist(nt.d)} ${out.nearestPlace.direction}.` : ''}${rv && rv.d < 3000 && nameText(rv.r.name, rv.r.name_alt) ? ` River ${nameText(rv.r.name, rv.r.name_alt)} nearby.` : ''}${t ? ` Local time ${t} (${p.timeZone}).` : ''}`;
      return out;
    }
    const F = await featsP(p).catch(() => null); if (!F) return {};
    const nb = nearest(F, lon, lat, false), nn = nearest(F, lon, lat, true);
    const bText = b => `${b.name ? nameText(b.name, b.name_alt) : b.address || b.kind + ' building'} (OSM ${b.osm_id}, ${b.height_m} m, height from ${b.height_source})`;
    const out = { ...(hasGround(p) ? { builtUp: p.label || p.name, country: w.country?.name || undefined, source: 'OpenStreetMap (ODbL) via build-place-tiles' } : {}), place: p.id, local_time: t ? `${t} (${p.timeZone})` : undefined };
    if (nb && nb.d < 40) out.building = { osm_id: nb.b.osm_id, name: nb.b.name || null, name_alt: nb.b.name_alt || null, address: nb.b.address || null, kind: nb.b.kind, height_m: nb.b.height_m, height_source: nb.b.height_source, dist_m: Math.round(nb.d) };
    if (nn) out.nearestBuilding = { osm_id: nn.b.osm_id, name: nameText(nn.b.name, nn.b.name_alt), dist_m: Math.round(nn.d), direction: compass(bearingDeg(lon, lat, nn.b.lon, nn.b.lat)) };
    out.text = `In ${p.label || p.name} (3D buildings from OpenStreetMap).${out.building ? ' Building here: ' + bText(nb.b) + '.' : ''}${nn ? ` Nearest named building: ${nameText(nn.b.name, nn.b.name_alt)}, ${fmtDist(nn.d)} ${out.nearestBuilding.direction}.` : ''}${t ? ` Local time ${t} (${p.timeZone}).` : ''}`;
    return out;
  });
  // the view: buildings of loaded places on screen (their roof centres), the nearest named one to the centre of the view;
  // the tiles drawn by tier, the rivers and the road length of the surroundings tiles drawn, the place names on screen
  G.placesDescribe = function (centre) {
    const res = [], stats = G.placesStats();
    for (const p of P) { if (p.state !== 'loaded' || !p.feats) continue; const F = p.feats; let n = 0, named = [];
      for (const b of F.B) { const P3 = geodeticToEcef(b.lon, b.lat, b.ground_m + p.geoid + b.height_m); const s = G.project(P3); if (!s || s[0] < 0 || s[1] < 0 || s[0] > innerWidth || s[1] > innerHeight) continue; n++; if (b.name) named.push(b); }
      const c = centre || { lon: p.centre[0], lat: p.centre[1] }, nn = named.map(b => ({ b, d: surfaceDistance(c.lon, c.lat, b.lon, b.lat) })).sort((a, b) => a.d - b.d);
      const tall = named.slice().sort((a, b) => b.height_m - a.height_m)[0], t = localTime(p), st = stats.find(x => x.id === p.id);
      const r = { place: p.id, name: p.name, buildings_in_view: n, named_in_view: named.length, nearest_named: nn[0] ? { name: nameText(nn[0].b.name, nn[0].b.name_alt), osm_id: nn[0].b.osm_id, dist_m: Math.round(nn[0].d), height_m: nn[0].b.height_m } : null,
        tallest_named: tall ? { name: nameText(tall.name, tall.name_alt), height_m: tall.height_m } : null, local_time: t ? `${t} (${p.timeZone})` : null, credit: p.credit, tiles_drawn: st?.tiers };
      if (p.sur) { const T = new Map((p.sur.tiles || []).map(x => [x[0], x])), fi = k => p.sur.tiles_fields.indexOf(k), rivers = new Set(); let roadsM = 0, railM = 0, blocks = 0;
        const byCls = {}; for (const nd of lastDrawn) if (nd.p === p && nd.meta) for (const L of [nd.meta.boxes, nd.meta.outlines]) for (const c of L.c) { const k = nd.meta.classes[c]; byCls[k] = (byCls[k] || 0) + 1; }
        for (const nd of lastDrawn) { if (nd.p !== p) continue; const x = T.get(nd.key); if (!x) continue; roadsM += x[fi('roads_m')]; railM += x[fi('rail_m')]; blocks += x[fi('blocks')]; for (const rv of x[fi('rivers')] || []) rivers.add(rv); }
        const places = []; for (const x of rowsOf(p.sur, 'labels')) { if (x.kind === 'peak' || x.kind === 'hamlet') continue; const s = G.project(geodeticToEcef(x.lon, x.lat, gridAt(p.sur.ground.h, p.sur.ground.grid, p.sur.ground.area, x.lon, x.lat) + p.geoid)); if (s && s[0] >= 0 && s[1] >= 0 && s[0] <= innerWidth && s[1] <= innerHeight) places.push(x); }
        places.sort((a, b) => (a.rank - b.rank) || ((b.population || 0) - (a.population || 0)));
        const rank = new Map((p.sur.rivers || []).map((x, i) => [x[0], i]));
        r.surroundings = { rivers: [...rivers].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9)).slice(0, 6), roads_km: Math.round(roadsM / 100) / 10, rail_km: Math.round(railM / 100) / 10, city_blocks: blocks, city_blocks_by_source: Object.fromEntries(Object.entries(byCls).map(([k, v]) => [p.sur.geometry_classes?.[k]?.label || k, v])), places_in_view: places.slice(0, 12).map(x => nameText(x.name, x.name_alt)) }; }
      if (!hasGround(p)) { const by = {}; let k = 0; for (const nd of lastDrawn) if (nd.p === p && nd.meta) for (const L of [nd.meta.boxes, nd.meta.outlines]) for (const c of L.c) { k++; by[nd.meta.classes[c]] = (by[nd.meta.classes[c]] || 0) + 1; }
        r.blocks_drawn = k; r.blocks_by_source = by; r.named_buildings_in_view = n; }
      r.text = `${p.label || p.name}: ${r.blocks_drawn != null ? `${r.blocks_drawn.toLocaleString(p.locale)} building blocks drawn (${Object.entries(r.blocks_by_source).map(([a, b]) => `${b.toLocaleString(p.locale)} ${a}`).join(', ') || 'none yet'}), ${n.toLocaleString(p.locale)} named buildings in view` : `${n.toLocaleString(p.locale)} buildings in view`} (3D, OpenStreetMap)${nn[0] ? `; nearest named building to the centre of the view: ${r.nearest_named.name}, ${fmtDist(nn[0].d)} away` : ''}${tall ? `; tallest named: ${r.tallest_named.name}, ${tall.height_m} m` : ''}${t ? `; local time ${t} (${p.timeZone})` : ''}.`
        + (r.surroundings ? ` Around it: ${r.surroundings.city_blocks.toLocaleString(p.locale)} city blocks drawn${Object.keys(r.surroundings.city_blocks_by_source).length > 1 ? ` (${Object.entries(r.surroundings.city_blocks_by_source).map(([k, v]) => `${v.toLocaleString(p.locale)} from ${k}`).join(', ')})` : ''}, ${r.surroundings.roads_km} km of main roads and ${r.surroundings.rail_km} km of railway in the tiles drawn${r.surroundings.rivers.length ? `, rivers ${r.surroundings.rivers.join(', ')}` : ''}${r.surroundings.places_in_view.length ? `; places in view: ${r.surroundings.places_in_view.join(', ')}` : ''}.` : '');
      res.push(r); }
    return res;
  };
  // a tap on a building of the core: its card (OSM id, name, height and its source); null when the tap hits none
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  G.placeTap = function (x, y, cam) {
    const meshes = []; for (const n of lastDrawn) for (const m of n.meshes) if (m.userData.kind === 'buildings' || m.userData.kind === 'blocks') meshes.push(m); if (!meshes.length) return null;
    ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObjects(meshes, false)[0]; if (!hit) return null;
    const p = P.find(q => q.id === hit.object.userData.place);
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const creditHtml = () => `<p class="small">${esc(p.credit).replace('© OpenStreetMap contributors', '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>')}</p>`;
    if (hit.object.userData.kind === 'blocks') {   // a city block: its geometry class (OSM, IGN, Microsoft), its height and the height's source
      const M = hit.object.userData.node?.meta; if (!M) return null; let k = -1, L = null;
      if (hit.object.isInstancedMesh) { L = M.boxes; k = hit.instanceId; } else { L = M.outlines; const f = hit.faceIndex; k = L.tri_end.findIndex(e => e > f); }
      if (!L || k == null || k < 0 || k >= L.c.length) return null;
      const cls = M.classes[L.c[k]], gc = p.sur?.geometry_classes?.[cls] || { label: cls };
      const b = { kind: 'city block', geometry_class: cls, geometry_source: gc.label, height_m: L.h[k] / 10, height_source: M.height_sources[L.s[k]] };
      const rows = [['Kind', 'City block (simplified, flat top)'], ['Footprint from', gc.label], ['Height', `${b.height_m} m (${b.height_source})`], ['Place', p.name]];
      H.showCard(`<h2>City block</h2><p class="small">${esc(p.name)} · ${esc(gc.label)}</p><div class="tw"><table>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table></div>${creditHtml()}`);
      return b;
    }
    const fa = hit.object.geometry.attributes._feature_id_0, b = fa && p.feats.byIndex.get(Math.round(fa.getX(hit.face.a)));
    if (!b) return null;
    const osm = `https://www.openstreetmap.org/${{ w: 'way', r: 'relation', n: 'node' }[b.osm_id[0]]}/${b.osm_id.slice(1)}`;
    const rows = [['Kind', b.kind], ['Height', `${b.height_m} m (${b.height_source})`], ['Levels', b.levels], ['Roof', b.roof], ['Address', b.address], ['Name (other script)', latinPreferred() ? null : b.name_alt], ['Wikidata', b.wikidata], ['Place', p.name]].filter(r => r[1] != null && r[1] !== '');
    H.showCard(`<h2>${esc((b.name && nameText(b.name, b.name_alt)) || b.address || 'Building')}</h2><p class="small">${esc(p.name)} · OSM <a href="${osm}" target="_blank" rel="noopener">${esc(b.osm_id)}</a></p><div class="tw"><table>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table></div>${creditHtml()}`);
    return b;
  };
  return P;
}
