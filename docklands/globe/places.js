// Places on the globe (OKR KR1.2 with KR2.3): 3D Tiles 1.1 sets made by cwplans/tools/build-place-tiles.mjs (one glb per
// cell of the geodetic quadtree, each in its own east-north-up frame with the ENU -> ECEF `transform`), drawn in the
// globe's floating frame: each tile's world matrix is R (ENU -> ECEF rotation) (C - O) in doubles every frame, as the
// globe's own patches (globe.js `place()`), so the GPU sees only small numbers. A place loads when the eye is within
// LOAD_M of its centre and is freed beyond FREE_M. While it is loaded: the globe's coarse terrain is cut away over its
// area (terrain.js `U.hole`), the globe's ground sampler answers from the place's DEM grid (so the eye guard, picks and the
// orbit target sit on the place's ground), and the place answers search, "what is here" and the view description.
// Text and machine interface: findPlaces / goTo (search provider), featuresAt and the readout (where provider),
// describeView (G.placesDescribe), a tap on a building (G.placeTap: its card). Data: cwplans/docklands/data/places/.
// Why not 3d-tiles-renderer: it keeps a tile set in one ECEF group (or one fixed reoriented origin) and its fade and
// overlay plugins patch GLSL; the globe needs a floating origin and TSL. Our sets are plain 3D Tiles 1.1, so a 3D Tiles
// viewer (3d-tiles-renderer, CesiumJS, QGIS) reads them too.
// Skill: docklands-3d-page, "Three.js port: places as 3D Tiles (2026-10-18)".
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { attribute, uniform, texture, uv, vec3, vec4, float, normalize, dot, max, mix, smoothstep, pow, positionView, cameraNear, cameraFar, viewZToLogarithmicDepth, normalFlat, normalLocal, cameraWorldMatrix, modelWorldMatrix } from 'three/tsl';
import { geodeticToEcef, enuBasis, surfaceDistance, D2R } from '../geo/ellipsoid.js';
import { fold, fmtDist, compass, bearingDeg } from './world.js';

export const PLACES_INDEX = '../cwplans/docklands/data/places/index.json';
export const LOAD_M = 30000, FREE_M = 45000;
const len = p => Math.hypot(p[0], p[1], p[2]);

export async function attachPlaces(G, H, { scene, U }) {
  const base = new URL(PLACES_INDEX, location.href);
  const ix = await fetch(base).then(r => r.ok ? r.json() : { places: [] }).catch(() => ({ places: [] }));
  const P = (ix.places || []).map(p => ({ ...p, C: geodeticToEcef(p.centre[0], p.centre[1], 0), state: null, tiles: [], feats: null }));
  G.places = P;
  const inArea = (p, lon, lat, m = 0) => { const dl = m / 111320 / Math.cos(lat * D2R), db = m / 110574; return lon >= p.area[0] - dl && lon <= p.area[2] + dl && lat >= p.area[1] - db && lat <= p.area[3] + db; };
  // the globe's floors (60 km away from data) do not apply over a place's area
  G.detailAt = (lon, lat) => P.some(p => inArea(p, lon, lat, 500));
  G.placesStats = () => P.map(p => ({ id: p.id, state: p.state, tiles: p.tiles.length, triangles: p.tiles.reduce((s, t) => s + t.tris, 0), buildings: p.feats ? p.feats.B.length : null }));

  // ---------- materials: vertex colour (sRGB bytes) or the ground texture; sun from the globe (U.sun, floating frame);
  // logarithmic depth as every globe material
  const upF = uniform(new THREE.Vector3(0, 1, 0));   // the place's up in the floating frame
  const light = n => { const sd = dot(upF, U.sun), day = smoothstep(-0.1, 0.12, sd), diff = max(dot(n, U.sun), 0); return mix(float(0.05), float(0.30), day).add(diff.mul(0.95).mul(day)); };
  function buildingMat() {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const nW = normalize(cameraWorldMatrix.mul(vec4(normalFlat, 0)).xyz), c = pow(attribute('color', 'vec4').rgb, vec3(2.2));
    const nUp = dot(nW, upF).abs();   // roofs and walls: a touch of sky light on the roofs
    m.colorNode = vec4(c.mul(light(nW).add(nUp.mul(0.08))), 1);
    m.depthNode = viewZToLogarithmicDepth(positionView.z, cameraNear, cameraFar);
    return m;
  }
  function groundMat(map) {
    const m = new THREE.MeshBasicNodeMaterial();
    const nW = normalize(modelWorldMatrix.mul(vec4(normalLocal, 0)).xyz), c = map ? texture(map, uv()).rgb : vec3(0.45, 0.42, 0.36);
    m.colorNode = vec4(c.mul(light(nW)), 1);
    m.depthNode = viewZToLogarithmicDepth(positionView.z, cameraNear, cameraFar);
    return m;
  }
  const BMAT = buildingMat();

  // ---------- load and free
  const loader = new GLTFLoader();
  async function load(p) {
    p.state = 'loading';
    try {
      const tsUrl = new URL(p.tileset, base), [ts, fj] = await Promise.all([fetch(tsUrl).then(r => r.json()), fetch(new URL(p.features, base)).then(r => r.json())]);
      p.feats = indexFeatures(fj);
      // the ground grid of the place (DEM datum) for the globe's sampler
      p.ground = fj.ground; p.geoid = fj.geoid_m;
      const kids = ts.root.children || [];
      await Promise.all(kids.map(async k => {
        const g = await loader.loadAsync(new URL(k.content.uri, tsUrl).href);
        const M = k.transform, C = [M[12], M[13], M[14]];
        // rotation: ENU -> ECEF (columns 0..2 of the transform) times glTF y-up -> z-up (x, y, z) -> (x, -z, y)
        const E = [M[0], M[1], M[2]], N = [M[4], M[5], M[6]], Up = [M[8], M[9], M[10]], B = [E, Up, N.map(v => -v)];   // B[i]: the ECEF image of glTF axis i
        g.scene.traverse(o => { if (!o.isMesh) return;
          const ground = !o.geometry.attributes.color, mesh = new THREE.Mesh(o.geometry, ground ? groundMat(o.material.map) : BMAT);
          mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false; mesh.userData = { C, B, ground, tile: k.content.uri, place: p.id };
          if (o.material.map && !ground) o.material.map.dispose();
          scene.add(mesh); p.tiles.push({ mesh, tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 }); });
      }));
      if (p.state !== 'loading') return free(p);   // freed while loading
      p.state = 'loaded'; patchSampler(); p.tiles.push(curtain(p)); G.dirty = true; H.draw();
      dispatchEvent(new CustomEvent('docklands-place-loaded', { detail: { id: p.id, tiles: p.tiles.length } }));
    } catch (e) { console.warn('places: load', p.id, e); p.state = 'failed'; }
  }
  function free(p) {
    for (const t of p.tiles) { scene.remove(t.mesh); t.mesh.geometry.dispose(); if (t.mesh.material !== BMAT) { t.mesh.material.dispose(); } }
    p.tiles = []; p.state = null; G.dirty = true;
  }
  function indexFeatures(fj) {
    const pick = (fields, row) => Object.fromEntries(fields.map((f, i) => [f, row[i]]));
    const B = fj.buildings.map((r, i) => r && { ...pick(fj.buildings_fields, r), i }).filter(Boolean);
    const S = (fj.streets || []).map(r => pick(fj.streets_fields, r)), A = (fj.areas || []).map(r => pick(fj.areas_fields || ['name', 'kind', 'lon', 'lat', 'name_alt'], r)), Pt = (fj.points || []).map(r => pick(fj.points_fields, r));
    return { fj, B, byIndex: new Map(B.map(b => [b.i, b])), S, A, Pt };
  }

  // ---------- the globe's ground sampler over a loaded place: the place's DEM grid (bilinear), not the 10 km world grid
  let patched = false;
  function patchSampler() {
    const S = G.sampler && G.sampler(); if (!S || patched) return; patched = true; const h0 = S.h; S.h0 = h0;
    S.h = (lon, lat) => { for (const p of P) if (p.state === 'loaded' && p.ground && inArea(p, lon, lat)) return groundAt(p, lon, lat); return h0(lon, lat); };
  }
  function groundAt(p, lon, lat) {
    const n = p.ground.grid, a = p.area, fx = (lon - a[0]) / (a[2] - a[0]) * (n - 1), fy = (a[3] - lat) / (a[3] - a[1]) * (n - 1);
    const i = Math.max(0, Math.min(n - 2, Math.floor(fx))), j = Math.max(0, Math.min(n - 2, Math.floor(fy))), u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fy - j)), h = p.ground.h, at = (x, y) => h[y * n + x];
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  }
  // the curtain: a wall round the place's area from the lower to the higher of its ground and the globe's coarse terrain,
  // so that no gap shows the sky where the world terrain (10 km box means) is above or below the place's own DEM
  const CURTAIN = vec3(0.36, 0.34, 0.27);
  function curtain(p) {
    const S = G.sampler(), hG = (lon, lat) => (S.h0 || S.h)(lon, lat) * (U.exag?.value || 1) + S.geoid(lon, lat), hP = (lon, lat) => groundAt(p, lon, lat) + p.geoid;
    const [w, s2, e, n] = p.area, ring = [], k = 48;
    for (let i = 0; i < k; i++) ring.push([w + (e - w) * i / k, s2]); for (let i = 0; i < k; i++) ring.push([e, s2 + (n - s2) * i / k]);
    for (let i = 0; i < k; i++) ring.push([e - (e - w) * i / k, n]); for (let i = 0; i < k; i++) ring.push([w, n - (n - s2) * i / k]);
    const pos = [], nrm = [], idx = [], C = p.C;
    ring.forEach(([lon, lat], i) => { const a = hG(lon, lat), b2 = hP(lon, lat), lo = Math.min(a, b2) - 30, hi = Math.max(a, b2) + (a > b2 ? 4 : -0.3), u = enuBasis(lon, lat).up;
      for (const h of [lo, hi]) { const q = geodeticToEcef(lon, lat, h); pos.push(q[0] - C[0], q[1] - C[1], q[2] - C[2]); nrm.push(...u); }
      const j = (i + 1) % ring.length; idx.push(2 * i, 2 * j, 2 * i + 1, 2 * i + 1, 2 * j, 2 * j + 1); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }); m.colorNode = vec4(CURTAIN.mul(light(upF)), 1); m.depthNode = viewZToLogarithmicDepth(positionView.z, cameraNear, cameraFar);
    const mesh = new THREE.Mesh(g, m); mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false; mesh.userData = { C, B: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], ground: true, curtain: true, place: p.id };
    scene.add(mesh); return { mesh, tris: idx.length / 3 };
  }
  G.placeGround = (lon, lat) => { for (const p of P) if (p.state === 'loaded' && inArea(p, lon, lat)) return groundAt(p, lon, lat); return null; };

  // ---------- per frame (globe.js drawGlobe, before the render): load / free by distance, place the tiles, cut the hole
  G.onFrame = function (eye) {
    const F = G.frameState, R = F.R; let hole = null, best = Infinity;
    for (const p of P) {
      const d = len([eye[0] - p.C[0], eye[1] - p.C[1], eye[2] - p.C[2]]);
      if (d < LOAD_M && !p.state) load(p); else if (d > FREE_M && p.state === 'loaded') { free(p); continue; }
      if (p.state !== 'loaded') continue;
      if (d < best) { best = d; hole = p; }
      for (const t of p.tiles) { const m = t.mesh, { C, B } = m.userData, o = [C[0] - F.O[0], C[1] - F.O[1], C[2] - F.O[2]];
        const r = (i, j) => R[i][0] * B[j][0] + R[i][1] * B[j][1] + R[i][2] * B[j][2], tr = i => R[i][0] * o[0] + R[i][1] * o[1] + R[i][2] * o[2];
        m.matrixWorld.set(r(0, 0), r(0, 1), r(0, 2), tr(0), r(1, 0), r(1, 1), r(1, 2), tr(1), r(2, 0), r(2, 1), r(2, 2), tr(2), 0, 0, 0, 1); m.visible = true; }
    }
    if (U.hole) { if (hole) U.hole.value.set(hole.area[0], hole.area[1], hole.area[2], hole.area[3]); else U.hole.value.set(0, 0, -1, -1); }
    if (hole) { const u = enuBasis(hole.centre[0], hole.centre[1]).up; upF.value.set(R[0][0] * u[0] + R[0][1] * u[1] + R[0][2] * u[2], R[1][0] * u[0] + R[1][1] * u[1] + R[1][2] * u[2], R[2][0] * u[0] + R[2][1] * u[1] + R[2][2] * u[2]); }
  };

  // ---------- text and machine interface
  const featsP = p => p.featsP || (p.featsP = p.feats ? Promise.resolve(p.feats) : fetch(new URL(p.features, base)).then(r => r.json()).then(fj => (p.feats ||= indexFeatures(fj))));
  const nameText = (n, alt) => alt ? `${n} (${alt})` : n;
  const localTime = p => { try { return new Intl.DateTimeFormat(p.locale || undefined, { timeZone: p.timeZone, hour: '2-digit', minute: '2-digit', weekday: 'short' }).format(new Date(H.clock())); } catch { return null; } };
  G.placeTime = (lon, lat) => { const p = P.find(q => inArea(q, lon, lat)); if (!p) return null; const t = H.clock(); return { place: p.id, time_zone: p.timeZone, local: localTime(p), iso: new Date(t).toISOString() }; };
  // search: the place's own words (region config place.search), named buildings, points, streets, squares and water
  G.addSearchProvider(async (q, n) => {
    const f = fold(q); if (f.length < 2) return [];
    const out = [];
    for (const p of P) {
      const F = await featsP(p).catch(() => null); if (!F) continue;
      const sc = t => { t = fold(t); return !t ? 0 : t === f ? 100 : t.startsWith(f) ? 80 : (' ' + t).includes(' ' + f) ? 60 : f.length >= 3 && t.includes(f) ? 30 : 0; };
      const add = (name, alt, kind, lon, lat, extra = {}, bonus = 0) => { const s = Math.max(sc(name), sc(alt || '')); if (s) out.push({ name: nameText(name, alt), local_name: alt || undefined, kind, lon, lat, region: p.name, id: `place:${p.id}:${extra.osm_id || fold(name)}`, score: s + bonus, alt_m: kind === 'building' || kind === 'point' ? 700 : 1500, facts: [{ label: 'Place', value: p.name, source: 'build-place-tiles (OpenStreetMap)' }, ...(extra.facts || [])], place: p.id, osm_id: extra.osm_id }); };
      for (const t of F.fj.search || []) add(t, null, 'place', p.centre[0], p.centre[1], {}, 1);
      for (const b of F.B) if (b.name || b.address) { add(b.name || b.address, b.name ? b.name_alt : null, 'building', b.lon, b.lat, { osm_id: b.osm_id, facts: [{ label: 'Height', value: `${b.height_m} m (${b.height_source})` }] }); if (b.name && b.address) add(b.address, null, 'building', b.lon, b.lat, { osm_id: b.osm_id }); }
      for (const x of F.Pt) add(x.name, x.name_alt, 'point', x.lon, x.lat, { osm_id: x.osm_id, facts: [{ label: 'Kind', value: x.kind }] });
      for (const x of F.S) add(x.name, x.name_alt, 'street', x.lon, x.lat);
      for (const x of F.A) add(x.name, x.name_alt, x.kind === 'paved' ? 'square' : x.kind, x.lon, x.lat);
    }
    out.sort((a, b) => b.score - a.score); const seen = new Set();
    return out.filter(r => { const k = r.name + '|' + r.kind; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, n).map(r => ({ ...r, score: Math.min(100, r.score) + (r.score > 100 ? 0.5 : 0) }));
  });
  // nearest buildings to a point (named ones first when asked)
  function nearest(F, lon, lat, named) {
    let best = null, bd = Infinity; for (const b of F.B) { if (named && !b.name) continue; const d = surfaceDistance(lon, lat, b.lon, b.lat); if (d < bd) { bd = d; best = b; } }
    return best ? { b: best, d: bd } : null;
  }
  // where: inside a place, its name, the building under the point (or the nearest), the nearest named building, local time
  G.addWhereProvider(async (lon, lat) => {
    const p = P.find(q => inArea(q, lon, lat)); if (!p) return {};
    const F = await featsP(p).catch(() => null); if (!F) return {};
    const nb = nearest(F, lon, lat, false), nn = nearest(F, lon, lat, true), w = G.world_?.where?.(lon, lat) || {};
    const bText = b => `${b.name ? nameText(b.name, b.name_alt) : b.address || b.kind + ' building'} (OSM ${b.osm_id}, ${b.height_m} m, height from ${b.height_source})`;
    const t = localTime(p), out = { builtUp: p.label || p.name, country: w.country?.name || undefined, source: 'OpenStreetMap (ODbL) via build-place-tiles', place: p.id, local_time: t ? `${t} (${p.timeZone})` : undefined };
    if (nb && nb.d < 40) out.building = { osm_id: nb.b.osm_id, name: nb.b.name || null, name_alt: nb.b.name_alt || null, address: nb.b.address || null, kind: nb.b.kind, height_m: nb.b.height_m, height_source: nb.b.height_source, dist_m: Math.round(nb.d) };
    if (nn) out.nearestBuilding = { osm_id: nn.b.osm_id, name: nameText(nn.b.name, nn.b.name_alt), dist_m: Math.round(nn.d), direction: compass(bearingDeg(lon, lat, nn.b.lon, nn.b.lat)) };
    out.text = `In ${p.label || p.name} (3D buildings from OpenStreetMap).${out.building ? ' Building here: ' + bText(nb.b) + '.' : ''}${nn ? ` Nearest named building: ${nameText(nn.b.name, nn.b.name_alt)}, ${fmtDist(nn.d)} ${out.nearestBuilding.direction}.` : ''}${t ? ` Local time ${t} (${p.timeZone}).` : ''}`;
    return out;
  });
  // the view: buildings of loaded places on screen (their roof centres), the nearest named one to the centre of the view
  G.placesDescribe = function (centre) {
    const res = [];
    for (const p of P) { if (p.state !== 'loaded' || !p.feats) continue; const F = p.feats; let n = 0, named = [];
      for (const b of F.B) { const P3 = geodeticToEcef(b.lon, b.lat, b.ground_m + p.geoid + b.height_m); const s = G.project(P3); if (!s || s[0] < 0 || s[1] < 0 || s[0] > innerWidth || s[1] > innerHeight) continue; n++; if (b.name) named.push(b); }
      const c = centre || { lon: p.centre[0], lat: p.centre[1] }, nn = named.map(b => ({ b, d: surfaceDistance(c.lon, c.lat, b.lon, b.lat) })).sort((a, b) => a.d - b.d);
      const tall = named.slice().sort((a, b) => b.height_m - a.height_m)[0], t = localTime(p);
      const r = { place: p.id, name: p.name, buildings_in_view: n, named_in_view: named.length, nearest_named: nn[0] ? { name: nameText(nn[0].b.name, nn[0].b.name_alt), osm_id: nn[0].b.osm_id, dist_m: Math.round(nn[0].d), height_m: nn[0].b.height_m } : null,
        tallest_named: tall ? { name: nameText(tall.name, tall.name_alt), height_m: tall.height_m } : null, local_time: t ? `${t} (${p.timeZone})` : null, credit: p.credit };
      r.text = `${p.label || p.name}: ${n.toLocaleString(p.locale)} buildings in view (3D, OpenStreetMap)${nn[0] ? `; nearest named building to the centre of the view: ${r.nearest_named.name}, ${fmtDist(nn[0].d)} away` : ''}${tall ? `; tallest named: ${r.tallest_named.name}, ${tall.height_m} m` : ''}${t ? `; local time ${t} (${p.timeZone})` : ''}.`;
      res.push(r); }
    return res;
  };
  // a tap on a building: its card (OSM id, name, height and its source); null when the tap hits no place building
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  G.placeTap = function (x, y, cam) {
    const meshes = P.flatMap(p => p.state === 'loaded' ? p.tiles.map(t => t.mesh).filter(m => !m.userData.ground) : []); if (!meshes.length) return null;
    ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObjects(meshes, false)[0]; if (!hit) return null;
    const p = P.find(q => q.id === hit.object.userData.place), fa = hit.object.geometry.attributes._feature_id_0, b = fa && p.feats.byIndex.get(Math.round(fa.getX(hit.face.a)));
    if (!b) return null;
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const osm = `https://www.openstreetmap.org/${{ w: 'way', r: 'relation', n: 'node' }[b.osm_id[0]]}/${b.osm_id.slice(1)}`;
    const rows = [['Kind', b.kind], ['Height', `${b.height_m} m (${b.height_source})`], ['Levels', b.levels], ['Address', b.address], ['Name (other script)', b.name_alt], ['Wikidata', b.wikidata], ['Place', p.name]].filter(r => r[1] != null && r[1] !== '');
    H.showCard(`<h2>${esc(b.name || b.address || 'Building')}</h2><p class="small">${esc(p.name)} · OSM <a href="${osm}" target="_blank" rel="noopener">${esc(b.osm_id)}</a></p><div class="tw"><table>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table></div><p class="small">${esc(p.credit).replace('© OpenStreetMap contributors', '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>')}</p>`);
    return b;
  };
  return P;
}
