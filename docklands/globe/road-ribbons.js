// Roads at their real width on the globe's ground (owner, 2026-11-25: "real width please", of the roads of the building
// cells, cwplans/tools/build-cell-roads.mjs). A cell layer of globe.js (addCellLayer with build) turns the road lines of a
// level-11 cell into triangle strips: width by class (WIDTH, metres: a typical carriageway of the class in Great Britain and
// western Europe, not a measured width; OSM width and lanes are not in the files yet), the ground sampled at every vertex
// and every STEP_M metres between (G.heightAt: the same ground the globe draws), LIFT_M above it, the depth pulled 0.3 %
// towards the eye as the globe's lines, asphalt by class, lit by the scene's lights (the place's sun). Joins: the offset
// at an inner vertex is along the mean of its two segment normals, scaled by 1 / cos of the half angle (at most 2x).
// Rule 6: geometry from the road data, the look made here. Skill docklands-3d-page, "Roads at their width (2026-11-25)".
import * as THREE from 'three/webgpu';
import { attribute, vec3, vec4, float, mix, max, dot, normalize, smoothstep, normalWorld, viewZToLogarithmicDepth, positionView, cameraNear, cameraFar, sRGBTransferEOTF } from 'three/tsl';
import { geodeticToEcef, enuBasis } from '../geo/ellipsoid.js';

export const WIDTH = { motorway: 14, trunk: 11, primary: 9, secondary: 8, tertiary: 7, unclassified: 5.5, residential: 5.5, living_street: 4.5, service: 3.5, pedestrian: 4 };
// asphalt (sRGB 0..1): major roads a little darker and bluer (newer surfacing), minor ones greyer and lighter
const COLOUR = { motorway: [.27, .28, .30], trunk: [.28, .29, .31], primary: [.30, .30, .32], secondary: [.32, .32, .33], tertiary: [.34, .34, .34], unclassified: [.38, .37, .35], residential: [.37, .37, .36], living_street: [.42, .40, .37], service: [.40, .39, .37], pedestrian: [.55, .52, .47] };
const STEP_M = 15, LIFT_M = 0.4;

// lit by the globe's sun (U.sun, the floating frame), as the place blocks (places.js light): sky light by day, the sun on
// the surface, near black by night; not by the scene's lights (they come with a loaded place: without one the roads were
// black, moglob 2026-11-25)
let MAT = null, SUN = null;
export function setSun(U) { SUN = U?.sun || null; }
export function ribbonMaterial() {
  if (MAT) return MAT;
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const n = normalize(normalWorld), base = sRGBTransferEOTF(attribute('rcol', 'vec3'));
  if (SUN) { const sd = dot(n, SUN), day = smoothstep(-0.1, 0.12, sd), k = mix(float(0.04), float(0.32), day).add(max(sd, 0).mul(0.9).mul(day)); m.colorNode = vec4(base.mul(k), 1); }
  else m.colorNode = vec4(base.mul(0.6), 1);
  m.depthNode = viewZToLogarithmicDepth(positionView.z.mul(0.997), cameraNear, cameraFar);
  m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
  return MAT = m;
}

// features: GeoJSON LineString features with properties.kind; heightAt(lon, lat): ellipsoidal metres. One mesh for the cell,
// positions relative to C (the ECEF point of the cell's middle), as globe.js places line chunks (userData.C)
export function buildRibbons(features, heightAt) {
  if (!features.length) return [];
  let w = 180, s = 90, e = -180, n = -90;
  for (const f of features) for (const [x, y] of f.geometry.coordinates) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  const lon0 = (w + e) / 2, lat0 = (s + n) / 2, C = geodeticToEcef(lon0, lat0, 0);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMaterial());
  mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false; mesh.renderOrder = 1; mesh.receiveShadow = true;
  mesh.userData.C = C; mesh.userData.bbox = [w, s, e, n]; mesh.userData.ribbon = true;
  mesh.userData.rebuild = hAt => fill(mesh.geometry, features, hAt, C, lat0);
  fill(mesh.geometry, features, heightAt, C, lat0);
  return [mesh];
}

function fill(g, features, heightAt, C, lat0) {
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574, P = [], RC = [], I = [];
  let nv = 0;
  for (const f of features) {
    const kind = f.properties.kind, half = (WIDTH[kind] || 5) / 2, col = COLOUR[kind] || COLOUR.residential, C0 = f.geometry.coordinates;
    // densify to STEP_M (in metres east and north of the first point)
    const pts = [];
    for (let i = 0; i < C0.length; i++) {
      if (i > 0) { const [a, b] = C0[i - 1], [c, d] = C0[i], L = Math.hypot((c - a) * kx, (d - b) * ky), m = Math.ceil(L / STEP_M); for (let k = 1; k < m; k++) pts.push([a + (c - a) * k / m, b + (d - b) * k / m]); }
      pts.push(C0[i]);
    }
    if (pts.length < 2) continue;
    // unit normals of the segments (east, north metres), then per vertex the joined offset
    const nrm = []; for (let i = 1; i < pts.length; i++) { const dx = (pts[i][0] - pts[i - 1][0]) * kx, dy = (pts[i][1] - pts[i - 1][1]) * ky, L = Math.hypot(dx, dy) || 1; nrm.push([-dy / L, dx / L]); }
    const base = nv;
    for (let i = 0; i < pts.length; i++) {
      const a = nrm[Math.max(0, i - 1)], b = nrm[Math.min(nrm.length - 1, i)]; let ox = a[0] + b[0], oy = a[1] + b[1]; const L = Math.hypot(ox, oy) || 1; ox /= L; oy /= L;
      const k = Math.min(2, 1 / Math.max(0.5, ox * b[0] + oy * b[1])), [lon, lat] = pts[i];
      for (const sgn of [1, -1]) {
        const x = lon + sgn * ox * half * k / kx, y = lat + sgn * oy * half * k / ky, p = geodeticToEcef(x, y, heightAt(x, y) + LIFT_M);
        P.push(p[0] - C[0], p[1] - C[1], p[2] - C[2]); RC.push(col[0], col[1], col[2]); nv++;
      }
      if (i > 0) { const v = base + 2 * i; I.push(v - 2, v - 1, v, v - 1, v + 1, v); }
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('rcol', new THREE.BufferAttribute(new Float32Array(RC), 3));
  g.setIndex(nv > 65535 ? new THREE.BufferAttribute(new Uint32Array(I), 1) : new THREE.BufferAttribute(new Uint16Array(I), 1));
  g.computeVertexNormals();   // (the ground's slope)
  // all strips are wound alike, so all normals point up or all down: turn them up (the shader takes the normal as the
  // local up for the sun's height)
  const N = g.attributes.normal.array, L = Math.hypot(C[0], C[1], C[2]);
  if (N.length && (N[0] * C[0] + N[1] * C[1] + N[2] * C[2]) / L < 0) { for (let i = 0; i < N.length; i++) N[i] = -N[i]; g.attributes.normal.needsUpdate = true; }
  g.computeBoundingSphere(); g.userData.r = g.boundingSphere.radius + g.boundingSphere.center.length();
  g.attributes.position.needsUpdate = true;
  return nv;
}
