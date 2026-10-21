// Vector line layers on the globe of the Three.js port: lines (and polygon outlines) in WGS84 lon/lat, placed on the drawn
// surface (terrain height + geoid, from the CPU sampler), densified so that long segments follow the curve (at most 0.25
// degree), cut into chunks by 45-degree cell; each chunk's vertices are float32 offsets from its own centre (ECEF), and
// globe.js sets its world matrix relative to the camera every frame (floating origin). Lines are one device pixel
// (WebGPU draws no wider lines). Depth: logarithmic, pulled towards the eye by 0.4 % in the depth only (the screen position
// is unchanged), so a line on the ground wins against the terrain under it while a hill or the far side of the earth still
// hides it. Skill: docklands-3d-page, "Three.js port: globe and world skeleton (2026-10-13)".
import * as THREE from 'three/webgpu';
import { uniform, vec4, positionView, cameraNear, cameraFar, viewZToLogarithmicDepth } from 'three/tsl';
import { geodeticToEcef } from '../geo/ellipsoid.js';

const STEP = 0.25, CELLDEG = 45;

export function lineMaterial(color, opacity) {
  const m = new THREE.LineBasicNodeMaterial({ transparent: true, depthWrite: false });
  const col = uniform(new THREE.Color(color)), op = uniform(opacity);
  m.colorNode = vec4(col, op);
  m.depthNode = viewZToLogarithmicDepth(positionView.z.mul(0.996), cameraNear, cameraFar);
  m.userData.col = col; m.userData.op = op;
  return m;
}

// lines: [[[lon, lat], ...], ...]; heightAt(lon, lat) -> ellipsoidal height in metres; returns meshes (one per chunk)
export function buildLines(lines, heightAt, material, lift = 0) {
  const cells = new Map();
  for (const l of lines) {
    if (!l || l.length < 2) continue;
    // split at the antimeridian (a segment jumping more than 180 degrees of longitude)
    let part = [l[0]];
    const flush = () => { if (part.length >= 2) { const [lo, la] = part[Math.floor(part.length / 2)], k = Math.floor((lo + 180) / CELLDEG) + ',' + Math.floor((la + 90) / CELLDEG); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(part); } };
    for (let i = 1; i < l.length; i++) { if (Math.abs(l[i][0] - l[i - 1][0]) > 180) { flush(); part = [l[i]]; } else part.push(l[i]); }
    flush();
  }
  const meshes = [];
  for (const [k, parts] of cells) {
    const [ci, cj] = k.split(',').map(Number), C = geodeticToEcef(-180 + (ci + 0.5) * CELLDEG, -90 + (cj + 0.5) * CELLDEG, 0);
    const G = chunkGeometry(parts, C, heightAt, lift); if (!G) continue;
    const m = new THREE.LineSegments(G, material); m.frustumCulled = false; m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.userData.C = C; m.renderOrder = 2; m.userData.segments = G.index.count / 2;
    // (for a rebuild on new ground heights, rebuildLines: the parts and the bbox of the chunk)
    m.userData.lift = lift; m.userData.bbox = partsBbox(parts);
    meshes.push(m);
  }
  return meshes;
}
const partsBbox = parts => { let w = 180, s = 90, e = -180, n = -90; for (const p of parts) for (const [x, y] of p) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; } return [w, s, e, n]; };
function chunkGeometry(parts, C, heightAt, lift) {
  const P = [], I = [], LL = []; let n = 0;
  for (const part of parts) {
    let prev = -1;
    for (let i = 0; i < part.length; i++) {
      const [lo, la] = part[i];
      if (i > 0) {   // densify
        const [lo0, la0] = part[i - 1], m = Math.ceil(Math.max(Math.abs(lo - lo0), Math.abs(la - la0)) / STEP);
        for (let s = 1; s < m; s++) { const t = s / m, x = lo0 + (lo - lo0) * t, y = la0 + (la - la0) * t, p = geodeticToEcef(x, y, heightAt(x, y) + lift); P.push(p[0] - C[0], p[1] - C[1], p[2] - C[2]); LL.push(x, y); I.push(prev, n); prev = n++; }
      }
      const p = geodeticToEcef(lo, la, heightAt(lo, la) + lift); P.push(p[0] - C[0], p[1] - C[1], p[2] - C[2]); LL.push(lo, la);
      if (prev >= 0) I.push(prev, n); prev = n++;
    }
  }
  if (!I.length) return null;
  const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); G.setIndex(n > 65535 ? new THREE.BufferAttribute(new Uint32Array(I), 1) : new THREE.BufferAttribute(new Uint16Array(I), 1));
  G.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  G.userData.ll = new Float32Array(LL);   // lon, lat of each vertex (rebuildLines)
  let r2 = 0; for (let i = 0; i < P.length; i += 3) r2 = Math.max(r2, P[i] * P[i] + P[i + 1] * P[i + 1] + P[i + 2] * P[i + 2]);
  G.userData.r = Math.sqrt(r2) + 2000;   // the chunk's bounding radius about C (frustum culling in globe.js)
  return G;
}
// new ground heights over area a = [w, s, e, n] (the world base's height tiles came in, globe/base-tiles.js): the
// vertices of the chunk inside it go onto heightAt again; returns the number of vertices moved
export function rebuildLines(mesh, heightAt, a) {
  const u = mesh.userData, G = mesh.geometry, ll = G.userData.ll; if (!ll) return 0;
  const pos = G.attributes.position, P = pos.array, C = u.C, lift = u.lift || 0; let n = 0;
  for (let k = 0; k < ll.length / 2; k++) { const lo = ll[2 * k], la = ll[2 * k + 1]; if (lo < a[0] || lo > a[2] || la < a[1] || la > a[3]) continue;
    const p = geodeticToEcef(lo, la, heightAt(lo, la) + lift); P[3 * k] = p[0] - C[0]; P[3 * k + 1] = p[1] - C[1]; P[3 * k + 2] = p[2] - C[2]; n++; }
  if (n) pos.needsUpdate = true;
  return n;
}

// a graticule every `step` degrees (meridians to +-89 degrees), as lines for buildLines
export function graticule(step) {
  const out = [];
  for (let lon = -180; lon < 180; lon += step) { const l = []; for (let lat = -89; lat <= 89; lat += Math.min(step, 1)) l.push([lon, lat]); l.push([lon, 89]); out.push(l); }
  for (let lat = -90 + step; lat < 90; lat += step) { const l = []; for (let lon = -180; lon <= 180; lon += Math.min(step, 1)) l.push([lon, lat]); out.push(l); }
  return out;
}
