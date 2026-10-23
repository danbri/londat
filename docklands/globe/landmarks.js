// Landmarks of the places on the globe: minarets, domes, church towers and spires, clock towers (3D Tiles 1.1 sets made by
// cwplans/tools/build-place-landmarks.mjs, one per place, beside the place's own set). Owner, 2026-10-22: "Currently you
// show it [Sarajevo] without its distinctive landscape of mosques (especially their minarets). We need to fix that."
// Hooked from places.js (one line); it wraps G.onFrame, G.placeTap and G.placesDescribe and adds a search provider.
// - Loaded with its place (places.js loads a place within 150 km), freed with it; all tiles of a set are fetched at once
//   (a set is small: Sarajevo 18 tiles, 0.6 MB); each tile placed every frame like the place tiles (R x content matrix,
//   the translation R (C - O) in doubles), drawn when its bounding sphere is in the view frustum.
// - Rendered live (architecture rule 6): vertex colour, flat normals, the globe's sun. A minaret is about 3 m wide: at the
//   8 km city view it would be a third of a pixel and vanish. Each vertex carries _RADIAL (its horizontal offset from the
//   object's axis and the object's reference radius), so the vertex shader widens an object about its axis until it is at
//   least MIN_PX CSS pixels wide (?minpx=); its height is unchanged. Nothing is baked.
// - Core building parts that a landmark replaces (landmarks.json hide_core: Gazi Husrev-beg's minaret parts, the domes of
//   the old mosques and the Orthodox cathedral, the cathedral towers) are collapsed to a point in the place's core tiles when
//   those tiles are activated, so nothing is drawn twice. The mosque bodies stay the place's buildings and blocks.
// - ?landmarks=mapped hides the estimated minarets (class "estimated", a stated rule); ?landmarks=off draws none.
//   G.landmarks.setEstimated(on) switches them at run time.
// - Text and machine interface: a tap on a minaret, dome or tower gives its card (name in Latin script via geo/script.js
//   pickName, kind, height and its source, mapped or estimated and the rule); describeView counts the mosques, minarets
//   (mapped / estimated), domes and towers in view; search finds the named places of worship of the whole city.
// Skill: docklands-3d-page, "Landmarks: minarets, domes and towers (2026-10-22)".
import * as THREE from 'three/webgpu';
import { attribute, uniform, vec3, vec4, float, normalize, dot, max, mix, smoothstep, pow, positionGeometry, positionView, modelViewMatrix, cameraNear, cameraFar, viewZToLogarithmicDepth, normalFlat, cameraWorldMatrix } from 'three/tsl';
import { geodeticToEcef, enuBasis, D2R } from '../geo/ellipsoid.js';
import { latinPreferred, pickName, isLatin } from '../geo/script.js';
import { fold } from './world.js';

export const LANDMARKS_INDEX = '../cwplans/docklands/data/places/landmarks.json';
const qs = new URLSearchParams(location.search), MODE = qs.get('landmarks') || 'all', MIN_PX = +(qs.get('minpx') || 2);
const Y2Z = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];
function mul4(a, b) { const o = new Float64Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
// our landmark glb: one node (KHR_mesh_quantization translation + scale), primitives "mapped" and "estimated" with POSITION
// (int16), COLOR_0 (uint8 normalized), _RADIAL (int16, cm), _FEATURE_ID_0 (float)
function parseGlb(ab) {
  const dv = new DataView(ab); if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  const jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, jl))), bin = 20 + jl + 8;
  const acc = (i, T2 = Float32Array, k = 1) => { const a = json.accessors[i], v = json.bufferViews[a.bufferView], T = CT[a.componentType], n = NC[a.type], st = (v.byteStride || n * T.BYTES_PER_ELEMENT) / T.BYTES_PER_ELEMENT;
    const src = new T(ab, bin + (v.byteOffset || 0) + (a.byteOffset || 0), (a.count - 1) * st + n), out = new T2(a.count * n);
    for (let q = 0; q < a.count; q++) for (let c = 0; c < n; c++) out[q * n + c] = src[q * st + c] * k; return { arr: out, n }; };
  const nd = json.nodes[0], t = nd.translation || [0, 0, 0], s = nd.scale || [1, 1, 1], out = [];
  for (const p of json.meshes[nd.mesh].primitives) {
    const pos = acc(p.attributes.POSITION).arr; for (let q = 0; q < pos.length; q += 3) { pos[q] = pos[q] * s[0] + t[0]; pos[q + 1] = pos[q + 1] * s[1] + t[1]; pos[q + 2] = pos[q + 2] * s[2] + t[2]; }
    const col = acc(p.attributes.COLOR_0, Uint8Array), rad = acc(p.attributes._RADIAL, Float32Array, 0.01).arr, fid = acc(p.attributes._FEATURE_ID_0).arr, ix = acc(p.indices, json.accessors[p.indices].componentType === 5125 ? Uint32Array : Uint16Array).arr;
    out.push({ name: json.materials[p.material]?.name || '', pos, col, rad, fid, ix });
  }
  return out;
}

export async function attachLandmarks(G, H, { scene, U, P }) {
  if (MODE === 'off') return null;
  const base = new URL(LANDMARKS_INDEX, location.href);
  const ix = await fetch(base).then(r => r.ok ? r.json() : null).catch(() => null); if (!ix?.places) return null;
  // a set in another repository has absolute URLs (the place's tileBase); ?placebase= rebases them as places.js does
  const reb = (p, u) => p.tileBase0 && typeof u === 'string' && u.startsWith(p.tileBase0) ? p.tileBase + u.slice(p.tileBase0.length) : u;
  const S = (P || []).filter(p => ix.places[p.id]).map(p => ({ p, cfg: Object.fromEntries(Object.entries(ix.places[p.id]).map(([k, v]) => [k, reb(p, v)])), state: null, tiles: [], rows: null, hide: null }));
  if (!S.length) return null;
  let showEst = MODE !== 'mapped';

  // ---------- material: the place buildings' light (the globe's sun U.sun, a touch of sky on the tops), vertex colour,
  // logarithmic depth; the minimum width in the vertex shader. Uses places.js's building material factory when it has one.
  const upF = uniform(new THREE.Vector3(0, 1, 0)), Kpx = uniform(800), minPx = uniform(MIN_PX);
  const light = n => { const sd = dot(upF, U.sun), day = smoothstep(-0.1, 0.12, sd), diff = max(dot(n, U.sun), 0); return mix(float(0.05), float(0.30), day).add(diff.mul(0.95).mul(day)); };
  function material() {
    const m = typeof G.placeBuildingMaterial === 'function' ? G.placeBuildingMaterial() : new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const rad = attribute('_radial', 'vec3'), dist = modelViewMatrix.mul(vec4(positionGeometry, 1)).xyz.length();
    const s = max(float(1), minPx.mul(dist).div(Kpx.mul(rad.y.mul(2)).max(1e-3)));   // rad.y: the object's reference radius (m)
    m.positionNode = positionGeometry.add(vec3(rad.x, 0, rad.z).mul(s.sub(1)));
    if (typeof G.placeBuildingMaterial !== 'function') {
      const nW = normalize(cameraWorldMatrix.mul(vec4(normalFlat, 0)).xyz), nUp = dot(nW, upF).abs();
      m.colorNode = vec4(pow(attribute('color', 'vec4').rgb, vec3(2.2)).mul(light(nW).add(nUp.mul(0.08))), 1);
      m.depthNode = viewZToLogarithmicDepth(positionView.z, cameraNear, cameraFar);
    }
    return m;
  }
  const MAT = material();
  let warmed = null;
  function warm() {   // compile the program before the first draw (KHR_parallel_shader_compile through compileAsync)
    if (warmed || !G.cull?.renderer?.compileAsync) return warmed;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -10, 1, 0, -10, 0, 1, -10]), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(12).fill(200), 4, true)); g.setAttribute('_radial', new THREE.BufferAttribute(new Float32Array(9).fill(1), 3)); g.setAttribute('_feature_id_0', new THREE.BufferAttribute(new Float32Array(3), 1));
    const sc = new THREE.Scene(), m = new THREE.Mesh(g, MAT); m.frustumCulled = false; sc.add(m); warm.keep = sc;
    warmed = G.cull.renderer.compileAsync(sc, G.cull.camera).catch(e => console.warn('landmarks: warm', e)); return warmed;
  }

  // ---------- a set: landmarks.json (the rows), tileset.json, every tile
  const rowsOf = J => J.rows.map((r, i) => { const o = Object.fromEntries(J.rows_fields.map((f, k) => [f, r[k]])); o.row = i; return o; });
  async function load(L) {
    L.state = 'loading';
    try {
      const tsUrl = new URL(L.cfg.tileset, base), [ts, J] = await Promise.all([fetch(tsUrl).then(r => r.json()), fetch(new URL(L.cfg.features, base)).then(r => r.json())]);
      L.J = J; L.rows = rowsOf(J); L.hideIds = new Set(J.hide_core || []);
      const tiles = (ts.root.children || []).map(c => { const W = Float64Array.from(c.transform), r = c.boundingVolume.region, pts = [];
        for (const lon of [r[0], r[2]]) for (const lat of [r[1], r[3]]) for (const h of [r[4], r[5]]) pts.push(geodeticToEcef(lon / D2R, lat / D2R, h));
        const C = [0, 1, 2].map(i => pts.reduce((s, q) => s + q[i], 0) / pts.length), rad = Math.max(...pts.map(q => Math.hypot(q[0] - C[0], q[1] - C[1], q[2] - C[2])));
        return { uri: c.content.uri, M: mul4(W, Y2Z), C, rad, meshes: [] }; });
      await Promise.all(tiles.map(async t => { const ab = await fetch(new URL(t.uri, tsUrl)).then(r => { if (!r.ok) throw new Error(r.status + ' ' + t.uri); return r.arrayBuffer(); }); t.prims = parseGlb(ab); }));
      await warm();
      if (L.state !== 'loading') return;
      for (const t of tiles) { for (const q of t.prims) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(q.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(q.col.arr, q.col.n, true));
        g.setAttribute('_radial', new THREE.BufferAttribute(q.rad, 3)); g.setAttribute('_feature_id_0', new THREE.BufferAttribute(q.fid, 1)); g.setIndex(new THREE.BufferAttribute(q.ix, 1));
        const m = new THREE.Mesh(g, MAT); m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.visible = false; m.frustumCulled = false;
        m.userData = { landmarks: L.p.id, estimated: q.name === 'estimated', tris: q.ix.length / 3 }; scene.add(m); t.meshes.push(m); }
        t.prims = null; }
      L.tiles = tiles; L.state = 'ready'; G.dirty = true; H.draw();
    } catch (e) { console.warn('landmarks: load', L.p.id, e); L.state = 'failed'; }
  }
  function free(L) { for (const t of L.tiles) for (const m of t.meshes) { scene.remove(m); m.geometry.dispose(); } L.tiles = []; L.state = null; }

  // ---------- core parts replaced by a landmark: their vertices collapsed to one point when the core tile is activated
  const done = new WeakSet();
  function hideCore(L) {
    const p = L.p; if (!p.feats || !L.hideIds.size) return;
    if (!L.hideRows) L.hideRows = new Set(p.feats.B.filter(b => L.hideIds.has(b.osm_id)).map(b => b.i));
    for (const n of p.nodes) { if (n.state !== 'ready' || !n.core) continue;
      for (const m of n.meshes) { if (m.userData.kind !== 'buildings' || done.has(m)) continue; done.add(m);
        const fa = m.geometry.attributes._feature_id_0, pa = m.geometry.attributes.position; if (!fa) continue; const first = new Map(); let k = 0;
        for (let v = 0; v < fa.count; v++) { const f = Math.round(fa.getX(v)); if (!L.hideRows.has(f)) continue; if (!first.has(f)) first.set(f, v); const v0 = first.get(f); pa.setXYZ(v, pa.getX(v0), pa.getY(v0), pa.getZ(v0)); k++; }
        if (k) { pa.needsUpdate = true; L.hidden = (L.hidden || 0) + k; } } }
  }

  // ---------- city blocks replaced by a tall object outside the core (Dublin: the Poolbeg chimneys and the Jameson Chimney
  // are OSM buildings too, so the city ring draws each as a box of its full height): an instanced block whose base centre is
  // within max(6 m, 2.5 x the object's radius) of the object's axis and whose height is at least 0.7 x the object's is
  // scaled to nothing once, when its tile is activated (the tile data stay as they are; done per mesh, as hideCore)
  const doneB = new WeakSet();
  function hideBlocks(L) {
    const p = L.p, tall = L.tallOut || (L.tallOut = L.rows.filter(r => r.type === 'tall' && !r.core && r.height_m > 0).map(r => ({ r, P: geodeticToEcef(r.lon, r.lat, r.ground_h), d: Math.max(6, 2.5 * (r.r_m || 2)) })));
    if (!tall.length) return;
    for (const n of p.nodes) { if (n.state !== 'ready' || n.core || !n.M) continue;
      for (const m of n.meshes) { if (m.userData.kind !== 'blocks' || !m.isInstancedMesh || doneB.has(m)) continue; doneB.add(m);
        const M = n.M, near = tall.map(t => { const dx = t.P[0] - M[12], dy = t.P[1] - M[13], dz = t.P[2] - M[14]; return { t, x: M[0] * dx + M[1] * dy + M[2] * dz, z: M[8] * dx + M[9] * dy + M[10] * dz }; })
          .filter(o => Math.abs(o.x) < 30000 && Math.abs(o.z) < 30000);
        if (!near.length) continue; const a = m.instanceMatrix.array; let k = 0;
        for (let i = 0; i < m.count; i++) { const o = 16 * i, h = Math.hypot(a[o + 4], a[o + 5], a[o + 6]);
          for (const q of near) if (Math.hypot(a[o + 12] - q.x, a[o + 14] - q.z) <= q.t.d && h >= 0.7 * q.t.r.height_m) { for (let c = 0; c < 16; c++) a[o + c] = 0; k++; break; } }
        if (k) { m.instanceMatrix.needsUpdate = true; L.hiddenBlocks = (L.hiddenBlocks || 0) + k; } } }
  }

  // ---------- per frame, after the places: load / free with the place, place the tiles, frustum, the estimated switch
  const placeMesh = (m, M, F) => { const R = F.R, O = F.O, me = m.matrixWorld.elements, t0 = M[12] - O[0], t1 = M[13] - O[1], t2 = M[14] - O[2];
    for (let r = 0; r < 3; r++) { const a = R[r][0], b = R[r][1], c = R[r][2]; me[r] = a * M[0] + b * M[1] + c * M[2]; me[4 + r] = a * M[4] + b * M[5] + c * M[6]; me[8 + r] = a * M[8] + b * M[9] + c * M[10]; me[12 + r] = a * t0 + b * t1 + c * t2; }
    me[3] = 0; me[7] = 0; me[11] = 0; me[15] = 1; };
  const stats = { tiles: 0, triangles: 0 };
  // a freed place frees its landmarks at once (the per-frame rule below runs only while the globe draws; moglob, 2026-10-23)
  addEventListener('docklands-place-freed', e => { for (const L of S) if (L.p.id === e.detail?.id && L.state === 'ready') free(L); });
  const onFrame0 = G.onFrame;
  G.onFrame = function (eye) {
    onFrame0?.call(this, eye);
    const F = G.frameState; stats.tiles = 0; stats.triangles = 0;
    if (G.cull) Kpx.value = G.cull.K();
    for (const L of S) {
      const p = L.p;
      if (p.state === 'loaded' && !L.state) load(L); else if (p.state !== 'loaded' && L.state === 'ready') free(L);
      if (L.state !== 'ready') continue;
      hideCore(L); hideBlocks(L);
      const u = enuBasis(p.centre[0], p.centre[1]).up, R = F.R; upF.value.set(R[0][0] * u[0] + R[0][1] * u[1] + R[0][2] * u[2], R[1][0] * u[0] + R[1][1] * u[1] + R[1][2] * u[2], R[2][0] * u[0] + R[2][1] * u[1] + R[2][2] * u[2]);
      for (const t of L.tiles) { const vis = !G.cull || G.cull.inFrustum(t.C, t.rad); t.visible = vis;
        for (const m of t.meshes) { m.visible = vis && (showEst || !m.userData.estimated); if (m.visible) { placeMesh(m, t.M, F); stats.tiles++; stats.triangles += m.userData.tris; } } }
    }
  };

  // ---------- the text interface
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const osmUrl = id => /^[nwr]\d+$/.test(id || '') ? `https://www.openstreetmap.org/${{ w: 'way', r: 'relation', n: 'node' }[id[0]]}/${id.slice(1)}` : null;
  // as places.js nameText: a second name in the Latin script stays beside the first (English and Irish), another script goes
  const shownName = r => { const m = pickName(r.name, r.name_alt); return m && m === r.name && r.name_alt && r.name_alt !== m && (isLatin(r.name_alt) || !latinPreferred()) ? `${m} (${r.name_alt})` : m; };
  const KIND = { minaret: 'Minaret', dome: 'Dome', tower: 'Tower', tall: 'Landmark' };
  // tall thin objects (chimney, obelisk, monument, mast: region config place.landmarks.tall_objects)
  const TALLK = { chimney: 'Chimney', obelisk: 'Obelisk', monument: 'Monument', mast: 'Mast', tower: 'Tower' };
  const kindText = r => r.type === 'tall' ? (TALLK[r.kind] || 'Landmark') : r.type === 'tower' ? (r.kind === 'clock tower' ? 'Clock tower' : r.kind_of ? `Tower of a ${r.kind_of}` : 'Tower') : r.type === 'minaret' ? `Minaret of a ${r.kind_of || 'mosque'}` : `Dome of a ${r.kind || 'building'}`;
  const drawnRows = L => L.rows.filter(r => r.type !== 'worship' && (showEst || r.source !== 'estimated'));
  const onScreen = s => s && s[0] >= 0 && s[1] >= 0 && s[0] <= innerWidth && s[1] <= innerHeight;
  function card(L, r) {
    const nm = shownName(r), of = r.of && L.rows.find(x => x.type === 'worship' && x.id === r.of), est = r.source === 'estimated';
    const rows = [['Kind', `${kindText(r)}${r.type === 'dome' && r.shape ? ` (${r.shape})` : ''}`], ['Source', est ? 'Estimated: not mapped in OpenStreetMap; drawn by a stated rule' : `Mapped in OpenStreetMap (${r.mapped_by || 'OSM'})`],
      ['Height', `${r.height_m} m (${r.height_source})`], ['Position', est ? r.position : null], ['Balcony (şerefe)', r.type === 'minaret' && r.serefe_m ? `${r.serefe_m[0]} to ${r.serefe_m[1]} m` : null],
      ['Base diameter', r.r_m ? `${Math.round(r.r_m * 20) / 10} m` : null], ['Of', of ? (shownName(of) || of.kind) : null], ['Place', L.p.name]].filter(x => x[1] != null && x[1] !== '');
    const links = [r.id && !est ? `OSM <a href="${osmUrl(r.id)}" target="_blank" rel="noopener">${esc(r.id)}</a>` : null, r.of ? `${est ? 'mosque' : 'building'} OSM <a href="${osmUrl(r.of)}" target="_blank" rel="noopener">${esc(r.of)}</a>` : null].filter(Boolean).join(' · ');
    H.showCard(`<h2>${esc(nm || KIND[r.type])}</h2><p class="small">${esc(kindText(r))}${est ? ' · estimated' : ''} · ${links}</p><div class="tw"><table>${rows.map(x => `<tr><td>${esc(x[0])}</td><td>${esc(x[1])}</td></tr>`).join('')}</table></div>`
      + `<p class="small">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL 1.0)${est ? '; the estimated minaret is our rule, not OSM data' : ''}</p>`);
  }
  // a tap: the drawn landmark whose axis (base to top, on screen) passes within max(12 px, its drawn half width) of the tap,
  // nearest the eye
  function hitAt(x, y) {
    const O = G.frameState?.O; if (!O) return null; let best = null;
    for (const L of S) { if (L.state !== 'ready') continue;
      for (const r of drawnRows(L)) { const a = G.project(geodeticToEcef(r.lon, r.lat, r.ground_h)), b = G.project(geodeticToEcef(r.lon, r.lat, r.top_h)); if (!a || !b) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0, d = Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
        const P3 = geodeticToEcef(r.lon, r.lat, (r.ground_h + r.top_h) / 2), e = Math.hypot(P3[0] - O[0], P3[1] - O[1], P3[2] - O[2]), half = (r.r_m || 2) * (G.cull ? G.cull.K() : innerHeight) / e;
        // on the drawn shaft (within its half width + 2 px): the nearest to the eye wins; else the nearest on screen within 12 px
        const on = d <= Math.max(2, half + 2); if (d > Math.max(12, half)) continue;
        if (!best || (on && !best.on) || (on && best.on && e < best.e) || (!on && !best.on && d < best.d)) best = { L, r, e, d, on }; } }
    return best;
  }
  const tap0 = G.placeTap;
  G.placeTap = function (x, y, cam) { const h = hitAt(x, y); if (h) { card(h.L, h.r); return { ...h.r, place: h.L.p.id }; } return tap0 ? tap0.call(this, x, y, cam) : null; };
  // describeView: the landmarks in view (their tops on screen), by kind and source
  const desc0 = G.placesDescribe;
  G.placesDescribe = function (centre) {
    const res = desc0 ? desc0.call(this, centre) : [];
    for (const L of S) { if (L.state !== 'ready') continue; const r = res.find(x => x.place === L.p.id); if (!r) continue;
      const seen = drawnRows(L).filter(x => onScreen(G.project(geodeticToEcef(x.lon, x.lat, x.top_h))));
      const mosques = L.rows.filter(x => x.type === 'worship' && x.kind === 'mosque' && onScreen(G.project(geodeticToEcef(x.lon, x.lat, (x.ground_h ?? 0) + 8))));
      const churches = L.rows.filter(x => x.type === 'worship' && ['church', 'cathedral', 'chapel'].includes(x.kind) && onScreen(G.project(geodeticToEcef(x.lon, x.lat, (x.ground_h ?? 0) + 8))));
      const mn = seen.filter(x => x.type === 'minaret'), tall = seen.slice().sort((a, b) => b.height_m - a.height_m)[0];
      const tl = seen.filter(x => x.type === 'tall');
      r.landmarks = { tall_in_view: tl.length, tall_by_kind: Object.fromEntries(Object.keys(TALLK).map(k => [k, tl.filter(x => x.kind === k).length]).filter(x => x[1])), mosques_in_view: mosques.length, minarets_in_view: { mapped: mn.filter(x => x.source === 'mapped').length, estimated: mn.filter(x => x.source === 'estimated').length }, domes_in_view: seen.filter(x => x.type === 'dome').length,
        towers_in_view: seen.filter(x => x.type === 'tower').length, churches_in_view: churches.length, clock_towers_in_view: seen.filter(x => x.kind === 'clock tower').length, estimated_shown: showEst,
        tallest_in_view: tall ? { name: shownName(tall) || null, kind: kindText(tall), height_m: tall.height_m, source: tall.source } : null, source: 'build-place-landmarks (OpenStreetMap, ODbL; estimated minarets by a stated rule)' };
      const lm = r.landmarks;
      // only the kinds the set has (a city without mosques is not described by its minarets)
      const parts = [];
      if (lm.mosques_in_view || mn.length || L.rows.some(x => x.type === 'minaret')) parts.push(`${lm.mosques_in_view} mosques and ${mn.length} minarets in view (${lm.minarets_in_view.mapped} mapped in OpenStreetMap, ${lm.minarets_in_view.estimated} estimated by rule${showEst ? '' : ', hidden'})`);
      if (lm.domes_in_view) parts.push(`${lm.domes_in_view} domes`);
      parts.push(`${lm.towers_in_view} towers (${lm.churches_in_view} churches${lm.clock_towers_in_view ? `, ${lm.clock_towers_in_view} clock tower` : ''})`);
      if (tl.length) parts.push(Object.entries(lm.tall_by_kind).map(([k, v]) => `${v} ${TALLK[k].toLowerCase()}${v > 1 ? 's' : ''}`).join(', '));
      r.text += ` Skyline: ${parts.join(', ')}${tall ? `; tallest: ${lm.tallest_in_view.name ? lm.tallest_in_view.name + ', ' : ''}${tall.type === 'tall' ? (TALLK[tall.kind] || 'landmark').toLowerCase() : tall.type} ${tall.height_m} m (${tall.source})` : ''}.`; }
    return res;
  };
  // search: the named places of worship of the whole set (the core's search has only the core's buildings)
  G.addSearchProvider?.(async (q, n) => {
    const f = fold(q); if (f.length < 3) return []; const out = [];
    for (const L of S) { if (!L.rows) { try { const J = await fetch(new URL(L.cfg.features, base)).then(r => r.json()); L.rows = rowsOf(J); L.J = J; } catch { continue; } }
      for (const r of L.rows) { if (r.type !== 'worship' && !(r.type === 'tall' && r.name)) continue; const nm = shownName(r); if (!nm) continue; const t = fold(nm), alt = latinPreferred() ? '' : fold(r.name_alt || '');
        const s = Math.max(...[t, alt].map(x => !x ? 0 : x === f ? 100 : x.startsWith(f) ? 80 : (' ' + x).includes(' ' + f) ? 60 : x.includes(f) ? 30 : 0)); if (!s) continue;
        const mn = L.rows.filter(x => x.type === 'minaret' && x.of === r.id);
        out.push({ name: nm, kind: r.kind, lon: r.lon, lat: r.lat, region: L.p.name, id: `place:${L.p.id}:lm:${r.id}`, score: s - 1, alt_m: r.type === 'tall' ? Math.max(600, r.height_m * 6) : 600, place: L.p.id, osm_id: r.id,
          facts: [{ label: 'Place', value: L.p.name, source: 'build-place-landmarks (OpenStreetMap)' }, ...(r.type === 'tall' ? [{ label: 'Height', value: `${r.height_m} m (${r.height_source})` }] : []), ...(mn.length ? [{ label: 'Minaret', value: mn.map(x => `${x.height_m} m, ${x.source}`).join('; ') }] : [])] }); } }
    return out.sort((a, b) => b.score - a.score).slice(0, n);
  });
  G.landmarks = {
    sets: S, stats: () => ({ ...stats, sets: S.map(L => ({ id: L.p.id, state: L.state, tiles: L.tiles.length, hidden_core_vertices: L.hidden || 0, hidden_city_blocks: L.hiddenBlocks || 0, counts: L.J?.counts || null })) }),
    setEstimated(on) { showEst = !!on; G.dirty = true; H.draw(); return showEst; }, get estimatedShown() { return showEst; },
    rows: id => (S.find(L => L.p.id === id)?.rows || []).map(r => ({ ...r })),
    screen: (id, rowId) => { const L = S.find(x => x.p.id === id), r = L?.rows?.find(x => x.id === rowId); if (!r) return null; const a = G.project(geodeticToEcef(r.lon, r.lat, r.ground_h)), b = G.project(geodeticToEcef(r.lon, r.lat, r.top_h)); return { base: a, top: b }; },
    describe: () => G.placesDescribe(null).map(r => r.landmarks).filter(Boolean),
  };
  return G.landmarks;
}
