// The globe surface of the Three.js port: a quadtree of geodetic patches on the WGS84 ellipsoid (2 root patches of 180 x 180
// degrees, then 4 children each: the WorldCRS84Quad scheme of docs/planet-architecture.md), heights and land / sea from
// one terrain texture (ETOPO 2022 box means, Natural Earth land and lakes; cwplans/tools/build-world-skeleton.mjs) and the
// EGM96 geoid, in TSL (one graph for WebGPU and WebGL 2). Floating origin: each patch's vertices are float32 offsets from
// its own centre (ECEF, computed in doubles on the CPU); globe.js sets every patch's world matrix relative to the camera
// each frame, so the GPU sees small numbers at every scale. Depth: logarithmic per material (depthNode), so one frame holds
// 1 m to 40,000 km. Level of detail: a patch splits while its vertex spacing on screen is above PX px (screen-space error),
// down to MAXL (the data hold about 9.8 km a pixel: deeper levels would only cost triangles). Patches are culled by the frustum
// and by the horizon. Skirts (a dropped edge) hide the cracks between levels.
// Base tiles (globe/base-tiles.js, data cwplans/docklands/data/world-base/): where the world base has imagery or heights at
// a deeper level (round the testbeds), a patch may split beyond MAXL (Terrain.maxL), takes a material that draws the
// imagery tile of its cell (terrainMaterial with img) and heights from the 'dem' attribute (h, east and north gradient,
// flag) instead of the world texture; the CPU sampler answers from the same tiles (S.demH).
// Skill: docklands-3d-page, "Three.js port: globe and world skeleton (2026-10-13)".
import * as THREE from 'three/webgpu';
import { attribute, uniform, texture, vec2, vec3, vec4, float, normalize, dot, max, min, mix, smoothstep, pow, clamp, cross, length, select, positionLocal, positionWorld, positionView, modelWorldMatrix, cameraNear, cameraFar, viewZToLogarithmicDepth, reflect, abs } from 'three/tsl';
import { geodeticToEcef, enuBasis, WGS84, D2R } from '../geo/ellipsoid.js';

export const SEG = 32, MAXL = 8, PX = 12;   // level 8: 0.7 degree patches, vertices 2.4 km apart (the data: 9.8 km a pixel); deeper only where base tiles exist
const A_ = WGS84.a;

// height code (R channel, 0..1) -> metres above the geoid: 128 + 127 sqrt(h / 8848) above sea level, 127 - 127 sqrt(-h / 11000) below
export const decodeHeight = c => { const v = c * 255; if (v >= 127.5) { const t = Math.max(0, (v - 128) / 127); return 8848 * t * t; } const t = Math.max(0, (127 - v) / 127); return -11000 * t * t; };
const decodeNode = c => { const v = c.mul(255), up = v.sub(128).div(127).max(0), dn = float(127).sub(v).div(127).max(0); return up.mul(up).mul(8848).sub(dn.mul(dn).mul(11000)); };

// CPU sampler of the same texture (a 2048 x 1024 copy, bilinear) and the geoid: heights for vector layers, the camera's
// clearance and the readout. h(lon, lat): metres above the geoid as the globe draws it (the sea surface at 0, land below
// sea level kept); ell(lon, lat) = h + N (ellipsoidal).
export function makeSampler(img, geo) {
  const { w, h, d } = img, G = geo;
  const px = (x, y, c) => d[4 * (y * w + x) + c] / 255;
  const bil = (lon, lat, c) => { const fx = ((lon + 180) / 360 * w - 0.5 + w) % w, fy = Math.max(0, Math.min(h - 1.001, (90 - lat) / 180 * h - 0.5)), x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0, x1 = (x0 + 1) % w;
    return (px(x0, y0, c) * (1 - u) + px(x1, y0, c) * u) * (1 - v) + (px(x0, y0 + 1, c) * (1 - u) + px(x1, y0 + 1, c) * u) * v; };
  const geoid = (lon, lat) => { const fx = Math.max(0, Math.min(G.w - 1.001, lon + 180)), fy = Math.max(0, Math.min(G.h - 1.001, 90 - lat)), x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0, g = (x, y) => G.d[4 * (y * G.w + x)] - 128;
    return (g(x0, y0) * (1 - u) + g(x0 + 1, y0) * u) * (1 - v) + (g(x0, y0 + 1) * (1 - u) + g(x0 + 1, y0 + 1) * u) * v; };
  const S = {
    raw: (lon, lat) => decodeHeight(bil(lon, lat, 0)), land: (lon, lat) => bil(lon, lat, 1), lake: (lon, lat) => bil(lon, lat, 2), geoid,
    // what the globe draws: water (sea) at 0, land (and lakes) at their height; the base tiles' heights where loaded (S.demH)
    demH: null,
    h(lon, lat) { const d = S.demH ? S.demH(lon, lat) : null; if (d != null) return d; const r = S.raw(lon, lat), L = S.land(lon, lat); return L * r + (1 - L) * Math.max(r, 0); },
    ell: (lon, lat) => S.h(lon, lat) + geoid(lon, lat),
    water: (lon, lat) => Math.max(1 - S.land(lon, lat), S.lake(lon, lat)) > 0.5,
  };
  return S;
}

// ---------- the material: displacement in the vertex stage, colour, relief shading, sun, water glint and haze in the fragment.
// img (optional): { tex, box: uniform vec4 (w, s, e, n) } an imagery tile of the base (globe/base-tiles.js): its colour
// replaces the colours by height, shaded relative to flat ground (the image already holds the sun of its day). The box is a
// uniform, so every tile's material compiles to the same program.
export function terrainMaterial(tex, geoidTex, U, img = null) {
  const m = new THREE.MeshBasicNodeMaterial();
  const up = attribute('up', 'vec3'), geo = attribute('geo', 'vec2'), skirt = attribute('skirt', 'float'), dem = attribute('dem', 'vec4');
  const uvOf = g => vec2(g.x.add(180).div(360), float(90).sub(g.y).div(180));
  const guv = g => vec2(g.x.add(180).div(361).add(0.5 / 361), float(90).sub(g.y).div(181).add(0.5 / 181));
  // vertex: height as drawn (sea at 0), plus the geoid, x the exaggeration; skirts drop by the patch's skirt depth
  const tv = texture(tex, uvOf(geo)).level(0), hraw = decodeNode(tv.r), land = tv.g, hdraw = mix(mix(hraw.max(0), hraw, land), dem.x, dem.w);   // dem.w = 1: heights of a base tile
  const N = texture(geoidTex, guv(geo)).level(0).r.mul(255).sub(128);
  m.positionNode = positionLocal.add(up.mul(hdraw.mul(U.exag).add(N).sub(skirt)));   // skirt: metres to drop (0 except on the skirt rows)
  // fragment
  const uv = uvOf(geo), t = texture(tex, uv), h = decodeNode(t.r), lf = t.g, lk = t.b, water = max(float(1).sub(lf), lk).clamp(0, 1);
  const du = 1 / U.W, dv = 1 / U.H;
  const hE = decodeNode(texture(tex, uv.add(vec2(du, 0))).r), hW = decodeNode(texture(tex, uv.sub(vec2(du, 0))).r);
  const hN = decodeNode(texture(tex, uv.sub(vec2(0, dv))).r), hS = decodeNode(texture(tex, uv.add(vec2(0, dv))).r);
  const coslat = geo.y.mul(D2R).cos().max(0.02), mx = float(2 * du * 360 * D2R * A_).mul(coslat), my = float(2 * dv * 180 * D2R * A_);
  const gx = mix(hE.sub(hW).div(mx), dem.y, dem.w), gy = mix(hN.sub(hS).div(my), dem.z, dem.w);
  const upn = normalize(up), east = normalize(vec3(upn.y.negate(), upn.x, 0).add(vec3(1e-6, 0, 0))), north = cross(upn, east);
  const relief = mix(mix(U.relief, U.relief.mul(0.35), water), float(1.6), dem.w);   // the sea floor shaded more softly; base heights (true slopes, not 10 km means) a little
  const nE = normalize(upn.sub(east.mul(gx).add(north.mul(gy)).mul(relief)));
  const toG = v => normalize(modelWorldMatrix.mul(vec4(v, 0)).xyz);
  const nG = toG(nE), upG = toG(upn), sun = U.sun, view = normalize(positionWorld.negate());
  // colours (linear): land by height and latitude (no land-cover data: a stated simplification), water by depth
  const lat = abs(geo.y), hl = h.max(0);
  let landC = mix(vec3(0.16, 0.27, 0.10), vec3(0.33, 0.33, 0.17), smoothstep(150, 900, hl));
  landC = mix(landC, vec3(0.38, 0.30, 0.20), smoothstep(900, 2200, hl));
  landC = mix(landC, vec3(0.45, 0.43, 0.41), smoothstep(2200, 3600, hl));
  landC = mix(landC, vec3(0.40, 0.34, 0.22), smoothstep(12, 20, lat).mul(float(1).sub(smoothstep(30, 36, lat))).mul(0.55));   // the dry belts
  landC = mix(landC, vec3(0.82, 0.86, 0.90), max(smoothstep(4200, 5600, hl), smoothstep(64, 72, lat).mul(smoothstep(0, 600, hl).mul(0.7).add(0.3))));
  const depth = h.negate().max(0), seaC = mix(vec3(0.05, 0.20, 0.33), vec3(0.008, 0.035, 0.11), smoothstep(30, 4500, depth));
  const waterC = mix(seaC, vec3(0.06, 0.18, 0.26), lk);
  const base = mix(landC, waterC, water);
  const sd = dot(upG, sun), day = smoothstep(-0.12, 0.12, sd);
  const diff = max(dot(nG, sun), 0), amb = mix(float(0.025), float(0.16), day);
  const spec = pow(max(dot(reflect(sun.negate(), upG), view), 0), 60).mul(img ? 0.18 : 0.5).mul(water).mul(day);
  let c;
  if (img) {   // the imagery tile: lit as flat ground at full sun, slopes by the relief normal relative to flat ground
    const b = img.box, iuv = vec2(geo.x.sub(b.x).div(b.z.sub(b.x)), b.w.sub(geo.y).div(b.w.sub(b.y))), col = texture(img.tex, iuv).rgb;
    const rel = diff.div(max(sd, 0.2)).clamp(0.35, 1.6), lit = smoothstep(-0.1, 0.35, sd);
    c = col.mul(amb.mul(0.6).add(lit.mul(mix(float(1), rel, 0.6)))).add(vec3(1, 0.95, 0.85).mul(spec));
  } else c = base.mul(amb.add(diff.mul(1.15).mul(day))).add(vec3(1, 0.95, 0.85).mul(spec));
  c = c.add(vec3(0.004, 0.007, 0.018).mul(float(1).sub(day)));   // the night side: a little blue
  // haze by view angle (the limb from orbit) and by distance (thin near the ground: a low view is not washed out)
  const rim = pow(float(1).sub(max(dot(upG, view), 0)), 5).mul(U.haze).mul(day.mul(0.85).add(0.15)).mul(smoothstep(15000, 400000, length(positionWorld)));
  c = mix(c, vec3(0.32, 0.52, 0.95).mul(day.mul(0.9).add(0.1)), rim.clamp(0, 0.85));
  m.colorNode = vec4(c, 1);
  m.depthNode = viewZToLogarithmicDepth(positionView.z, cameraNear, cameraFar);
  // a hole (lon w, lat s, lon e, lat n) where a place's own tiles draw the ground (globe/places.js); empty: w > e
  U.hole ||= uniform(new THREE.Vector4(0, 0, -1, -1));
  const inHole = geo.x.greaterThan(U.hole.x).and(geo.x.lessThan(U.hole.z)).and(geo.y.greaterThan(U.hole.y)).and(geo.y.lessThan(U.hole.w));
  m.opacityNode = select(inHole, float(0), float(1)); m.alphaTest = 0.5;
  return m;
}

// ---------- one patch: lon w..e, lat s..n, SEG x SEG cells, skirts; positions are offsets from the centre (ECEF, h = 0)
function patchGeometry(w, s, e, n, skirtDepth) {
  const N1 = SEG + 1, nv = N1 * N1 + 4 * N1, P = new Float32Array(nv * 3), UP = new Float32Array(nv * 3), GEO = new Float32Array(nv * 2), SK = new Float32Array(nv), I = [];   // (vertex order: the grid row by row from the north-west, then the skirts: north, south, west, east edges)
  const cl = (w + e) / 2, cb = (s + n) / 2, C = geodeticToEcef(cl, cb, 0);
  let k = 0;
  const put = (lon, lat, sk) => { const p = geodeticToEcef(lon, lat, 0), u = enuBasis(lon, lat).up; P.set([p[0] - C[0], p[1] - C[1], p[2] - C[2]], 3 * k); UP.set(u, 3 * k); GEO[2 * k] = lon; GEO[2 * k + 1] = lat; SK[k] = sk; return k++; };
  for (let j = 0; j <= SEG; j++) for (let i = 0; i <= SEG; i++) put(w + (e - w) * i / SEG, n - (n - s) * j / SEG, 0);
  const id = (i, j) => j * N1 + i;
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) { const a = id(i, j), b = id(i + 1, j), c = id(i, j + 1), d = id(i + 1, j + 1); I.push(a, c, b, b, c, d); }
  // skirts: the four edges again, dropped by skirtDepth metres
  const edges = [[i => id(i, 0), (i) => [w + (e - w) * i / SEG, n]], [i => id(i, SEG), i => [w + (e - w) * i / SEG, s]], [j => id(0, j), j => [w, n - (n - s) * j / SEG]], [j => id(SEG, j), j => [e, n - (n - s) * j / SEG]]];
  for (const [top, ll] of edges) { const base = k; for (let q = 0; q <= SEG; q++) { const [lo, la] = ll(q); put(lo, la, skirtDepth); }
    for (let q = 0; q < SEG; q++) { const a = top(q), b = top(q + 1), c = base + q, d = base + q + 1; I.push(a, c, b, b, c, d, a, b, c, b, d, c); } }
  const G = new THREE.BufferGeometry();
  G.setAttribute('position', new THREE.BufferAttribute(P, 3)); G.setAttribute('up', new THREE.BufferAttribute(UP, 3)); G.setAttribute('geo', new THREE.BufferAttribute(GEO, 2)); G.setAttribute('skirt', new THREE.BufferAttribute(SK, 1));
  G.setAttribute('dem', new THREE.BufferAttribute(new Float32Array(nv * 4), 4));   // base heights: h, east and north gradient, flag (0: the world texture)
  G.setIndex(I); G.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);   // culling is ours (frustumCulled false)
  return { G, C };
}

// ---------- the tree
export class Terrain {
  constructor(scene, material, U) { this.scene = scene; this.mat = material; this.U = U; this.cache = new Map(); this.frame = 0; this.stats = { patches: 0, triangles: 0, cached: 0, made: 0 }; this.detail = null; }
  // the deepest level a patch of this cell may split to: MAXL, or deeper where the base has tiles (base-tiles.js)
  maxL(L, x, y) { return this.detail && L >= MAXL ? this.detail.maxL(L, x, y) : MAXL; }
  key(L, x, y) { return L + '/' + x + '/' + y; }
  bounds(L, x, y) { const dl = 180 / (1 << L); return [-180 + x * dl, 90 - (y + 1) * dl, -180 + (x + 1) * dl, 90 - y * dl]; }
  node(L, x, y) {
    const k = this.key(L, x, y); let nd = this.cache.get(k);
    if (!nd) { const [w, s, e, n] = this.bounds(L, x, y), cl = (w + e) / 2, cb = (s + n) / 2;
      // a bounding sphere: the centre and the farthest corner or edge midpoint, plus the relief (9 km up, 11 km down)
      const C = geodeticToEcef(cl, cb, 0); let r = 0;
      for (const [lo, la] of [[w, s], [w, n], [e, s], [e, n], [cl, s], [cl, n], [w, cb], [e, cb], [cl, Math.max(-90, Math.min(90, cb))]]) { const p = geodeticToEcef(lo, la, 0); r = Math.max(r, Math.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2])); }
      const spacing = Math.max((e - w) * Math.cos(Math.min(Math.abs(s), Math.abs(n)) * D2R), n - s) * D2R * A_ / SEG;
      nd = { L, x, y, k, w, s, e, n, C, r: r + 11000, spacing, mesh: null, used: 0 }; this.cache.set(k, nd); }
    return nd;
  }
  mesh(nd) {
    if (!nd.mesh) { const { G } = patchGeometry(nd.w, nd.s, nd.e, nd.n, Math.min(20000, nd.spacing * 0.15 + 50)), m = new THREE.Mesh(G, this.mat);
      m.frustumCulled = false; m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.userData.C = nd.C; nd.mesh = m; this.stats.made++; }
    if (this.detail) this.detail.patch(nd, nd.mesh, this.frame);   // the base tile's imagery and heights (each frame the patch is drawn)
    return nd.mesh;
  }
  // choose the patches for a camera: eye (ECEF), view: { toCam(C) -> [x, y, z] in the camera frame (camera looks down -z),
  // frustum test sphere(v, r) -> bool, K = screen height / (2 tan(fov / 2)) }; returns the list of nodes to draw
  select(eye, V) {
    // V.horizon: the horizon angle seen from the earth's centre (acos(surface radius under the eye / eye radius)), plus a
    // margin for mountains beyond it
    this.frame++; const out = [], eyeR = Math.hypot(...eye), hz = V.horizon + 0.06;
    const visit = (L, x, y) => {
      const nd = this.node(L, x, y), cr = Math.hypot(...nd.C);
      // horizon: the angle between the eye and the patch centre (from the earth's centre) beyond the horizon plus the patch's own size
      const cosA = (eye[0] * nd.C[0] + eye[1] * nd.C[1] + eye[2] * nd.C[2]) / (eyeR * cr), ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
      if (L > 0 && ang - nd.r / A_ > hz) return;
      if (L > 0 && !V.inFrustum(nd.C, nd.r)) return;
      const dist = Math.max(1, Math.hypot(nd.C[0] - eye[0], nd.C[1] - eye[1], nd.C[2] - eye[2]) - nd.r), px = nd.spacing * V.K / dist;
      if (L < this.maxL(L, x, y) && px > PX && !(L >= 1 && nd.n - nd.s < 0.02)) { const L2 = L + 1, x2 = x * 2, y2 = y * 2; visit(L2, x2, y2); visit(L2, x2 + 1, y2); visit(L2, x2, y2 + 1); visit(L2, x2 + 1, y2 + 1); return; }
      nd.used = this.frame; out.push(nd);
    };
    visit(0, 0, 0); visit(0, 1, 0);
    // keep at most 600 patches with meshes: free the least recently used
    if (this.detail) this.detail.selected(out, this.frame);
    if (this.cache.size > 1400) { const old = [...this.cache.values()].filter(n => n.used < this.frame - 30).sort((a, b) => a.used - b.used);
      for (const n of old.slice(0, this.cache.size - 1000)) { if (n.mesh) { this.scene.remove(n.mesh); n.mesh.geometry.dispose(); } this.cache.delete(n.k); } }
    return out;
  }
}
