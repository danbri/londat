// Drawing styles of the Three.js port (?style=map|pixel|lines|vectrex), ported from the WebGL page
// (https://danbri.github.io/londat/cwplans/docklands/ : ?pixel in index.html, ?lines and ?vectrex in line-styles.js).
// main.js gives the hook `styleHook` (the RenderPipeline, the pick ray, the camera functions, ctx); a style sets its own
// pipe.outputNode and draws with its own pass. Everything is TSL, so one graph serves WebGPU and WebGL 2.
//  - Pixel art: an orthographic camera 30 deg down at 45 deg (quarter turns by the arrow buttons), drawn at one art pixel
//    per 2 CSS px (1 when the camera is over 700 m away) by a pass at a reduced resolution, flat colours by building
//    material, then the 33 colours of data/pixel-palette.json with dark outlines where the brightness steps. Night off.
//    Photo facade tiles (materials.js FAC) and the measured facade colours (registry/sources/facades, snapped to the
//    palette's building colours); stylised box trees (data/trees.json) and moving figures (people, cyclists, traffic,
//    river boats, gulls, swimmers: illustrative) as instanced boxes, in place of the species trees of layers/trees.js.
//  - Line drawing and Vector CRT: a pass of the model (buildings, models, terrain, water, greens, roads, rail) writes the
//    face normal and a layer number; the edges come from that and the depth (layer changes, creases over 37 deg, depth
//    steps); pen colours of plotter-svg.js on paper, or the blue-white phosphor with an afterglow (AfterImageNode), a glow
//    (BloomNode) and a slight flicker. No scanlines: a vector screen has none (the WebGL page, line-styles.js).
// Skill: docklands-3d-page, "Three.js port" and "Styles".
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, Discard, pass, uniform, uniformArray, attribute, float, vec2, vec3, vec4, floor, fract, mod, step, mix, min, max, abs,
  dot, select, sqrt, clamp, screenUV, screenCoordinate, positionWorld, positionView, normalFlat, cameraWorldMatrix, sRGBTransferEOTF,
  sRGBTransferOETF, perspectiveDepthToViewZ, texture, int, log2, exp2 } from 'three/tsl';
import { FAC } from './materials.js';
import { afterImage } from 'three/addons/tsl/display/AfterImageNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

const STYLES = ['map', 'pixel', 'lines', 'vectrex'], NAMES = { map: 'Map', pixel: 'Pixel art', lines: 'Line drawing', vectrex: 'Vector CRT' };
const LAYER = 7;   // the model's meshes are also on this layer: the line pass draws only them (no sky, trees, ships, overlays)
const hexc = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = c => sRGBTransferEOTF(c);
let H, C, MODE = 'map', OUT = null;
const saved = { mats: new Map() };

// ---------- shared: flat face normal towards the eye, the WebGL page's light (index.html LIGHT, shade())
const faceN = () => { const n = normalFlat; return select(dot(n, positionView).greaterThan(0), n.negate(), n); };   // view space
const shadeK = Fn(() => { const n = cameraWorldMatrix.mul(vec4(faceN(), 0)).xyz.normalize(); return max(0, dot(n, vec3(-0.45, 0.8, -0.35).normalize())).mul(0.5).add(0.5); });

// ---------- pixel art
const PX = { gain: 2.2, pal: null, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 14000), pass: null, size: uniform(new THREE.Vector2(64, 64)), edge: uniform(0.2), pxm: uniform(1), scale: 0, colours: null, mats: null, stats: {} };
const hsh = v => ((v * 2654435761) >>> 0) / 4294967296;
function pixBuilding(i) {   // index.html setPixStyle: buildingMat (0 brick, 1 render, 2 glass, 3 ribbon windows, 4 metal, 5 measured facade) and buildingColour
  const f = PX.measured && PX.measured.get(i);
  if (f) {   // the measured facade colour (glass and frame, registry/sources/facades) snapped to the palette's building colours, never to a tree green
    const g = hexc(f.glass_hex), fr = f.frame_hex ? hexc(f.frame_hex) : g, c = g.map((v, k) => v * .75 + fr[k] * .25), d2 = q => (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2;
    return [PX.FACC.reduce((a, q) => d2(q) < d2(a) ? q : a), 5];
  }
  const b = C.A.buildings[i], h = b.h, r = hsh(i + 7), d = hsh((Math.floor(b.p[0] / 1500) * 73856093) ^ (Math.floor(b.p[1] / 1500) * 19349663));
  const m = h > 60 ? (r < .75 ? 2 : 3) : h > 20 ? (r < .3 ? 2 : r < .65 ? 3 : r < .85 ? 1 : 0) : d < .45 ? (r < .8 ? 0 : 1) : d < .8 ? (r < .75 ? 1 : 0) : (r < .6 ? 4 : 3);
  const L = PX.MATC[m]; return [L[Math.floor((d * .7 + hsh(i) * .3) * L.length) % L.length], m];
}
function pixAttributes(G, again) {   // per vertex: the building's palette colour and material, from the model index of each vertex
  if (!G.userData.bi || (G.getAttribute('pcol') && !again)) return;
  const bi = G.userData.bi, n = bi.length, cache = PX.cache || (PX.cache = new Map());
  const pa = G.getAttribute('pcol'), ma = G.getAttribute('pmat'), col = pa ? pa.array : new Float32Array(n * 3), mat = ma ? ma.array : new Float32Array(n);
  for (let k = 0; k < n; k++) { const i = bi[k]; let v = cache.get(i); if (!v) { v = pixBuilding(i); cache.set(i, v); } col.set(v[0], 3 * k); mat[k] = v[1]; }
  if (pa) { pa.needsUpdate = ma.needsUpdate = true; return; }
  G.setAttribute('pcol', new THREE.BufferAttribute(col, 3)); G.setAttribute('pmat', new THREE.BufferAttribute(mat, 1));
}
// the measured facade colours need the atlas index (layers/registry.js, ctx.registry: model building -> registry id) and
// ../cwplans/registry/sources/facades/facades.json; both come late, so the colours are set again when they are there
function pixMeasured() {
  if (PX.measured || !PX.facJ || !C.registry || !C.registry.AT) return;
  const AT = C.registry.AT, regOf = C.registry.regOf, m = new Map();
  for (let i = 0; i < regOf.length; i++) { const k = regOf[i]; if (k < 0) continue; const f = PX.facJ[AT.buildings[k].id]; if (f && f.glass_hex) m.set(i, f); }
  PX.measured = m; PX.cache = null; PX.stats.measured = m.size;
  for (const o of C.meshes.buildings.children) pixAttributes(o.geometry, true);
}
function flatMaterial(hex, src) {   // a palette colour, shaded by the WebGL page's light
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }), c = vec3(...hexc(hex));
  m.colorNode = Fn(() => { If(positionWorld.y.greaterThan(C.U.cut), () => { Discard(); }); return vec4(lin(c.mul(shadeK())).div(PX.gain), 1); })();
  if (src) Object.assign(m, { polygonOffset: src.polygonOffset, polygonOffsetFactor: src.polygonOffsetFactor, polygonOffsetUnits: src.polygonOffsetUnits });
  return m;
}
function pixBuildingMaterial() {   // index.html facade program with pxm > 0: walls 1.3 x brighter, a pattern per material on the art-pixel grid
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const pc = attribute('pcol', 'vec3'), pm = attribute('pmat', 'float'), uw = attribute('uw', 'float'), a8 = attribute('col', 'vec4').a.mul(255);
  // a photo facade (alpha code 100 + slot, on walls): the tower's tile x (0.45 + 0.75 x brightness), as on the WebGL page,
  // then the output pass snaps it to the palette. The mip level from the art pixel's size in metres (pxm): no derivatives
  const tex = FAC.tex, fac = tex ? step(99.5, a8).mul(step(a8, 131.5)).mul(step(0, uw)) : float(0);
  m.colorNode = Fn(() => {
    If(positionWorld.y.greaterThan(C.U.cut), () => { Discard(); });
    const shaded = pc.mul(shadeK()), col = min(vec3(1), shaded.mul(1.3)).toVar();
    If(fac.greaterThan(0.5), () => {
      const sl = clamp(floor(a8.sub(100).add(0.5)), 0, 31), S2 = FAC.slots.element(int(sl)), tc = vec2(uw.div(S2.x), positionWorld.y.div(S2.y));
      const lod = clamp(log2(max(PX.pxm.mul(256).div(min(S2.x, S2.y)), 1)), 0, 8), e = exp2(floor(lod).add(1)).mul(0.5), q = fract(tc);
      const stc = vec2(mod(sl, 8), floor(sl.div(8))), span = float(256).sub(e.mul(2));
      const tuv = vec2(stc.x.mul(256).add(e).add(q.x.mul(span)).div(2048), float(1).sub(stc.y.mul(256).add(e).add(float(1).sub(q.y).mul(span)).div(1024)));   // materials.js facadeCommon: the atlas is uploaded with flipY
      col.assign(min(vec3(1), sRGBTransferOETF(texture(tex, tuv).level(lod).rgb).mul(dot(shaded, vec3(0.33)).mul(0.75).add(0.45))));
    }).ElseIf(uw.greaterThanEqual(0).and(PX.pxm.lessThan(1.5)), () => {
      const fy = fract(positionWorld.y.div(PX.pxm.mul(4))), fx = floor(screenCoordinate.x), win = step(0.3, fy).mul(step(fy, 0.8));
      If(pm.lessThan(0.5), () => { col.assign(mix(col, col.mul(0.55).add(vec3(0.05, 0.07, 0.11)), step(mod(fx, 4), 1).mul(win))); })   // brick: punched windows
        .ElseIf(pm.lessThan(1.5), () => { col.assign(mix(col, vec3(0.33, 0.40, 0.50), step(mod(fx, 5), 1).mul(win).mul(0.85))); })   // render: darker glass
        .ElseIf(pm.lessThan(2.5).or(pm.greaterThan(4.5)), () => { col.assign(col.mul(float(1).sub(step(fy, 0.2).mul(0.14))).mul(step(mod(fx, select(pm.greaterThan(4.5), float(2), float(3))), 0.5).mul(0.2).add(1))); })   // glass (and a measured facade): mullions and spandrels
        .ElseIf(pm.lessThan(3.5), () => { col.assign(mix(col, vec3(0.40, 0.48, 0.58), step(0.38, fy).mul(step(fy, 0.9)).mul(0.8))); })   // ribbon windows
        .Else(() => { col.mulAssign(float(1).sub(step(mod(fx, 3), 0.5).mul(0.14))); });   // metal cladding seams
    });
    return vec4(lin(col).div(PX.gain), 1);
  })();
  m.userData.facades = !!tex;
  return m;
}
// the pass holds the flat colours / gain and the lit layers (trees, ships, piers) as lit; x gain on the way out: the flat
// colours come back exact and the lit layers brighter (sun-lit linear colours with no tone mapping read as near black)
function pixOutput() {   // index.html pixEnd: the art pixel, an outline where the brightness steps (c x 0.55), the nearest of 33 colours
  const tex = PX.pass.getTextureNode(), sz = PX.size, pal = uniformArray(PX.colours.map(c => new THREE.Color(...c)), 'color');
  const lum = c => dot(c, vec3(0.3, 0.59, 0.11));
  return Fn(() => {
    const uv = floor(screenUV.mul(sz)).add(0.5).div(sz), at = o => clamp(sRGBTransferOETF(tex.sample(uv.add(o.div(sz))).rgb.mul(PX.gain)), 0, 1);
    const c = at(vec2(0, 0)), r = at(vec2(1, 0)), u = at(vec2(0, -1));
    const e = max(abs(lum(c).sub(lum(r))), abs(lum(c).sub(lum(u))));
    const q = select(e.greaterThan(PX.edge), c.mul(0.55), c).toVar(), best = vec3(0).toVar(), bd = float(1e9).toVar();
    Loop(33, ({ i }) => { const p = pal.element(i), d = q.sub(p), k = dot(d.mul(d), vec3(0.3, 0.59, 0.11)); If(k.lessThan(bd), () => { bd.assign(k); best.assign(p); }); });
    return vec4(best, 1);
  })();
}
function pixFrame() {   // the orthographic camera along the orbit camera's line of sight, 6 km out; half height 0.42 x the orbit distance
  const cam = C.camera, t = C.controls.target, d = cam.position.distanceTo(t), dir = cam.position.clone().sub(t).normalize(), o = PX.cam;
  const W = C.renderer.domElement.clientWidth || innerWidth, Hh = C.renderer.domElement.clientHeight || innerHeight, hh = d * 0.42, hw = hh * W / Hh;
  o.position.copy(t).addScaledVector(dir, 6000); o.up.set(0, 1, 0); o.lookAt(t);
  Object.assign(o, { left: -hw, right: hw, top: hh, bottom: -hh, near: 10, far: 14000 }); o.updateProjectionMatrix(); o.updateMatrixWorld();
  const art = d > 700 ? 1 : 2, dpr = C.renderer.getPixelRatio(), scale = 1 / (art * dpr);
  if (scale !== PX.scale) { PX.pass.setResolutionScale(scale); PX.scale = scale; }
  const fw = Math.max(1, Math.floor(W * dpr * scale)), fh = Math.max(1, Math.floor(Hh * dpr * scale));
  PX.size.value.set(fw, fh); PX.pxm.value = d * 0.84 / fh; PX.edge.value = d * 0.84 / fh > 1.5 ? 9 : 0.2;   // no outlines when zoomed out: small buildings would become speckle
  C.sky.sky.visible = false; if (C.sky.stars) C.sky.stars.visible = false; C.scene.background = PX.bg;
  if (FAC.tex && !PX.mats.building.userData.facades) PX.mats.building = pixBuildingMaterial();   // the photo facade atlas came after the first visit
  pixMeasured(); swapAll(PX.mats);
  if (PX.ents && PX.actors) {   // the figures move on every frame (index.html pixTick)
    const now = performance.now(), dt = Math.min(0.1, (now - (PX.last || now)) / 1000); PX.last = now;
    stepActors(dt, now / 1000); C.draw();
  }
}

// ---------- pixel art: stylised trees and the moving figures (index.html buildTrees, makeActors, stepActors, pixTick).
// Every box is an instance of one unit box (base at y 0) with its colour per instance ('acol'), flat colours shaded by the
// WebGL page's light like the rest of the pixel pass. Illustrative, not live data: people, cyclists, traffic (with
// emergency vehicles now and then), river traffic on the Thames centreline (data/river.json), gulls and swimmers in Eden Dock.
function boxMaterial() {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }), c = attribute('acol', 'vec3');
  m.colorNode = Fn(() => vec4(lin(min(vec3(1), c.mul(shadeK()))).div(PX.gain), 1))();
  return m;
}
function boxMesh(cap, name) {
  const G = new THREE.BoxGeometry(1, 1, 1); G.translate(0, 0.5, 0);
  G.setAttribute('acol', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
  const m = new THREE.InstancedMesh(G, boxMaterial(), cap); m.name = name; m.count = 0; m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); return m;
}
// obox: an oriented box, centre x, z on the ground y0, length along the heading (hx, hz), width, height (index.html obox)
function oboxTo(mesh, x, y0, z, len, wid, hgt, hx, hz, col) {
  const n = mesh.count; if (n >= mesh.instanceMatrix.count) return;
  const e = mesh.instanceMatrix.array, o = 16 * n;
  e[o] = hx * len; e[o + 1] = 0; e[o + 2] = hz * len; e[o + 3] = 0; e[o + 4] = 0; e[o + 5] = hgt; e[o + 6] = 0; e[o + 7] = 0;
  e[o + 8] = -hz * wid; e[o + 9] = 0; e[o + 10] = hx * wid; e[o + 11] = 0; e[o + 12] = x; e[o + 13] = y0; e[o + 14] = z; e[o + 15] = 1;
  mesh.geometry.getAttribute('acol').array.set(col, 3 * n); mesh.count = n + 1;
}
const done = mesh => { mesh.instanceMatrix.needsUpdate = true; const a = mesh.geometry.getAttribute('acol'); a.needsUpdate = true; };
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pointInRing = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
function polyline(pts) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, cum, len: cum.at(-1) }; }
function along(pl, s) { s = Math.max(0, Math.min(pl.len - .01, s)); let lo = 0, hi = pl.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pl.cum[m] <= s) lo = m; else hi = m; }
  const a = pl.pts[lo], b = pl.pts[hi], t = (s - pl.cum[lo]) / Math.max(.01, pl.cum[hi] - pl.cum[lo]), dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return { x: a[0] + dx * t, z: a[1] + dz * t, y: (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t, hx: dx / l, hz: dz / l, w: (a[3] ?? 0) + ((b[3] ?? 0) - (a[3] ?? 0)) * t }; }
const focusBox = () => { const F = C.A.meta.focus; return [F.x0 - 900, F.x1 + 900, F.z0 - 900, F.z1 + 900]; };

// the real trees (data/trees.json, the same file as layers/trees.js) within 900 m of the estate, on open ground (10 m cells
// of building footprints and water blocked), over 35 m left out (cranes or structures): a trunk, a crown in one of two
// greens and a lighter top, from the palette's tree accents
async function buildPixTrees() {
  const T = await C.loadJSON(C.DATA + 'trees.json'), t0 = performance.now(), A = C.A, dec = C.dec, B = focusBox(), inB = (x, z) => x > B[0] && x < B[1] && z > B[2] && z < B[3];
  const G = 10, gw = Math.ceil((B[1] - B[0]) / G), gh = Math.ceil((B[3] - B[2]) / G), blocked = new Uint8Array(gw * gh);
  const mark = o => { const f = dec(o.p), n = o.holes && o.holes.length ? o.holes[0] : f.length / 2, r = []; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < n; i++) { r.push([f[2 * i], f[2 * i + 1]]); x0 = Math.min(x0, f[2 * i]); x1 = Math.max(x1, f[2 * i]); z0 = Math.min(z0, f[2 * i + 1]); z1 = Math.max(z1, f[2 * i + 1]); }
    if (x1 < B[0] || x0 > B[1] || z1 < B[2] || z0 > B[3]) return;
    for (let j = Math.max(0, Math.floor((z0 - 4 - B[2]) / G)); j <= Math.min(gh - 1, Math.floor((z1 + 4 - B[2]) / G)); j++) for (let i = Math.max(0, Math.floor((x0 - 4 - B[0]) / G)); i <= Math.min(gw - 1, Math.floor((x1 + 4 - B[0]) / G)); i++)
      if (pointInRing([B[0] + (i + .5) * G, B[2] + (j + .5) * G], r)) blocked[j * gw + i] = 1; };
  A.buildings.forEach(mark); A.water.forEach(mark);
  const free = (x, z) => { const i = Math.floor((x - B[0]) / G), j = Math.floor((z - B[2]) / G); return i >= 0 && j >= 0 && i < gw && j < gh && !blocked[j * gw + i]; };
  const list = T.trees.filter(([x, z, h0]) => inB(x, z) && !(h0 > 35) && free(x, z));
  const a = PX.pal.accents, trunk = hexc('#584851'), leaf = hexc(a.tree_dark), leaf2 = hexc('#607649'), leafHi = hexc(a.tree_light);
  const mesh = boxMesh(list.length * 3, 'pixel:trees'); seed = 11;
  for (const [x, z, h0, c0] of list) { const h = h0 || 9, c = Math.max(3, Math.min(16, c0 || h * .55)), g = C.groundAt(x, z);
    oboxTo(mesh, x, g, z, 1.2, 1.2, h * .45, 1, 0, trunk); oboxTo(mesh, x, g + h * .35, z, c, c, h * .5, 1, 0, rnd() < .5 ? leaf : leaf2); oboxTo(mesh, x + c * .12, g + h * .8, z - c * .12, c * .55, c * .55, h * .2, 1, 0, leafHi); }
  done(mesh); PX.stats.trees = list.length; PX.stats.treesMs = Math.round(performance.now() - t0);
  return mesh;
}
function makeActors(river) {
  const A = C.A, dec = C.dec, B = focusBox(), inB = (x, z) => x > B[0] && x < B[1] && z > B[2] && z < B[3], foot = [], minor = [], major = [];
  for (const l of A.lines) if (!l.tunnel && (l.k === 'foot' || l.k === 'road')) { const q = dec(l.q, 3), pts = []; for (let i = 0; i < q.length; i += 3) pts.push([q[i], q[i + 1], q[i + 2]]);
    if (!pts.some(p => inB(p[0], p[1]))) continue; const pl = polyline(pts); if (pl.len < 30) continue; (l.k === 'foot' ? foot : l.c <= 1 ? major : minor).push(pl); }
  seed = 23; const pick = a => a[Math.floor(rnd() * a.length)], acts = [];
  const shirts = ['#c8402e', '#2a5bd7', '#f2c230', '#f8ebd9', '#607649', '#bb927c', '#5d738a', '#e5b177'].map(hexc);
  const paths = foot.length ? foot : minor;   // walkers on footpaths where the model has them, else on the pavements of the minor roads
  for (let i = 0; i < 260 && paths.length; i++) { const pl = pick(paths); acts.push({ t: 'walk', pl, s: rnd() * pl.len, v: 1.1 + rnd() * .6, d: rnd() < .5 ? 1 : -1, off: foot.length ? (rnd() - .5) * 3 : (rnd() < .5 ? -1 : 1) * (5 + rnd() * 2), col: pick(shirts) }); }
  for (let i = 0; i < 40 && minor.length; i++) { const pl = pick(minor); acts.push({ t: 'bike', pl, s: rnd() * pl.len, v: 4 + rnd() * 2, d: rnd() < .5 ? 1 : -1, off: 3.5, col: pick(shirts) }); }
  const roads = major.length ? major : minor;
  for (let i = 0; i < 80 && roads.length; i++) { const pl = pick(roads), r = rnd(); acts.push({ t: r < .12 ? 'bus' : r < .3 ? 'cab' : 'car', pl, s: rnd() * pl.len, v: 7 + rnd() * 5, d: rnd() < .5 ? 1 : -1, off: 2.6, col: pick(shirts) }); }
  const thamesLevel = (A.water.find(w => w.tidal && !w.n) || { level: 1.5 }).level + .15;   // the river surface in the model (one LiDAR tide state)
  if (river) { const R = polyline(river.thames.map(p => [p[0], p[1], thamesLevel, p[2]]));
    const boat = (t, v, n) => { for (let i = 0; i < n; i++) acts.push({ t, pl: R, s: rnd() * R.len, v, d: rnd() < .5 ? 1 : -1, lane: .25 + rnd() * .3 }); };
    boat('clipper', 12, 5); boat('tourist', 4, 3); boat('tug', 3, 2); boat('aggregate', 3.5, 1); boat('speed', 17, 2); }
  for (let f = 0; f < 2; f++) { const cx = f ? 900 : -600, cz = f ? 350 : 250; for (let i = 0; i < 18; i++) acts.push({ t: 'gull', cx, cz, r: 120 + rnd() * 160, a: rnd() * 6.3, v: .12 + rnd() * .08, y: 45 + rnd() * 40, ph: rnd() * 6 }); }
  PX.swim = null;
  if (river && river.eden) { const E = river.eden, n = E.length; let mx = 0, mz = 0; for (const [x, z] of E) { mx += x; mz += z; } mx /= n; mz /= n;
    let sxx = 0, szz = 0, sxz = 0; for (const [x, z] of E) { sxx += (x - mx) ** 2; szz += (z - mz) ** 2; sxz += (x - mx) * (z - mz); } const th = .5 * Math.atan2(2 * sxz, sxx - szz), ax = Math.cos(th), az = Math.sin(th);
    let lo = 1e9, hi = -1e9; for (const [x, z] of E) { const t = (x - mx) * ax + (z - mz) * az; lo = Math.min(lo, t); hi = Math.max(hi, t); }
    PX.swim = { mx, mz, ax, az, lo, hi, y: (river.eden_level ?? 4.2) + .1 };
    for (let i = 0; i < 12; i++) acts.push({ t: 'swim', s: rnd(), v: .012 + rnd() * .01, d: rnd() < .5 ? 1 : -1, lane: (i % 4 - 1.5) * 6 + (rnd() - .5) * 1.5, col: rnd() < .5 ? hexc('#f2c230') : hexc('#c8402e') }); }
  return acts;
}
function stepActors(dt, now) {
  const M = PX.ents, S = 2.5, ob = (...a) => oboxTo(M, ...a); M.count = 0;   // people and bikes 2.5 x life size so they read as figures at map scale
  for (const a of PX.actors) {
    if (a.t === 'gull') { a.a += a.v * dt; const x = a.cx + Math.cos(a.a) * a.r, z = a.cz + Math.sin(a.a) * a.r, f = Math.sin(now * 9 + a.ph) * 1.5, hx = -Math.sin(a.a), hz = Math.cos(a.a);
      ob(x, a.y, z, 2.5, 1.2, 1, hx, hz, [.95, .95, .93]); ob(x - hz * 2.5, a.y + f, z + hx * 2.5, 1.5, 3.5, .4, hx, hz, [.85, .86, .88]); ob(x + hz * 2.5, a.y + f, z - hx * 2.5, 1.5, 3.5, .4, hx, hz, [.85, .86, .88]); continue; }
    if (a.t === 'swim') { const W = PX.swim; a.s += a.v * dt * a.d; if (a.s > .9 || a.s < .1) a.d *= -1; const t = W.lo + (W.hi - W.lo) * a.s, x = W.mx + W.ax * t - W.az * a.lane, z = W.mz + W.az * t + W.ax * a.lane, b = Math.sin(now * 4 + a.lane) * .2;
      ob(x, W.y + b, z, 1.4, 1.2, .9, W.ax * a.d, W.az * a.d, [.95, .78, .68]); ob(x - W.ax * a.d * 2.4, W.y, z - W.az * a.d * 2.4, 1.6, 1, .8, W.ax, W.az, a.col); continue; }
    a.s += a.v * dt * a.d; if (a.s > a.pl.len || a.s < 0) { a.d *= -1; a.s = Math.max(0, Math.min(a.pl.len, a.s));
      if ((a.t === 'car' || a.t === 'emergency') && rnd() < .06) { a.t = a.t === 'car' ? 'emergency' : 'car'; a.kind = ['police', 'ambulance', 'fire'][Math.floor(rnd() * 3)]; a.v = a.t === 'emergency' ? 14 : 8; } }
    const p = along(a.pl, a.s), hx = p.hx * a.d, hz = p.hz * a.d, lx = hz, lz = -hx;   // left of travel: traffic keeps left
    if (a.lane) { const o = a.lane * p.w, x = p.x - lx * o, z = p.z - lz * o, y = p.y;   // boats keep to starboard
      if (a.t === 'clipper') { for (const sg of [-1, 1]) ob(x + lx * 3 * sg, y, z + lz * 3 * sg, 34, 2.6, 1.6, hx, hz, hexc('#2e3241')); ob(x, y + 1.6, z, 22, 8.5, 3, hx, hz, hexc('#f8ebd9')); ob(x, y + 4.6, z, 20, 8, .6, hx, hz, hexc('#2a5bd7')); ob(x - hx * 22, y, z - hz * 22, 10, 6, .3, hx, hz, [.92, .95, .97]); }
      else if (a.t === 'tourist') { ob(x, y, z, 30, 7, 2, hx, hz, hexc('#f8ebd9')); ob(x - hx * 3, y + 2, z - hz * 3, 18, 6.4, 2.4, hx, hz, hexc('#788b9c')); ob(x - hx * 3, y + 4.4, z - hz * 3, 18, 6.6, .4, hx, hz, hexc('#2a5bd7')); }
      else if (a.t === 'tug') { ob(x, y, z, 16, 6, 2.6, hx, hz, hexc('#c8402e')); ob(x + hx * 2, y + 2.6, z + hz * 2, 6, 4.5, 3, hx, hz, hexc('#2e3241'));
        for (let k = 1; k <= 3; k++) { const bx = x - hx * (10 + 26 * k), bz = z - hz * (10 + 26 * k); ob(bx, y, bz, 24, 9, 2, hx, hz, hexc('#705858')); for (let c = -1; c <= 1; c++) ob(bx + hx * c * 7, y + 2, bz + hz * c * 7, 6, 7, 3, hx, hz, hexc(c ? '#f2c230' : '#607649')); } }
      else if (a.t === 'aggregate') { ob(x, y, z, 60, 11, 3, hx, hz, hexc('#584851')); ob(x - hx * 6, y + 3, z - hz * 6, 36, 8, 3, hx, hz, hexc('#e5b177')); ob(x + hx * 24, y + 3, z + hz * 24, 7, 8, 5, hx, hz, hexc('#f8ebd9')); }
      else if (a.t === 'speed') { ob(x, y, z, 9, 3, 1.3, hx, hz, hexc('#e5b177')); ob(x - hx * 1, y + 1.3, z - hz * 1, 3, 2.4, 1, hx, hz, hexc('#2e3241')); for (let k = 1; k < 5; k++) ob(x - hx * (6 + 7 * k), y - .2, z - hz * (6 + 7 * k), 6, 2 + k * 1.6, .3, hx, hz, [.95, .97, .98]); }
      continue; }
    const x = p.x + lx * a.off, z = p.z + lz * a.off, y = C.groundAt(x, z) + .3;
    if (a.t === 'walk') { const b = Math.abs(Math.sin(now * 6 + a.s)) * .15 * S; ob(x, y, z, .35 * S, .5 * S, .9 * S, hx, hz, [.18, .19, .25]); ob(x, y + .9 * S + b, z, .4 * S, .55 * S, .75 * S, hx, hz, a.col); ob(x, y + 1.65 * S + b, z, .3 * S, .3 * S, .3 * S, hx, hz, [.93, .79, .66]); }
    else if (a.t === 'bike') { ob(x, y + .2, z, 1.8 * S * .8, .25 * S, .7 * S, hx, hz, [.18, .19, .25]); ob(x, y + .9 * S, z, .4 * S, .5 * S, .7 * S, hx, hz, a.col); ob(x, y + 1.6 * S, z, .32 * S, .32 * S, .32 * S, hx, hz, hexc('#f2c230')); }
    else if (a.t === 'bus') { ob(x, y, z, 11, 2.6, 4.3, hx, hz, hexc('#c8402e')); ob(x, y + 2.6, z, 10.6, 2.65, .5, hx, hz, hexc('#2e3241')); }
    else if (a.t === 'cab') { ob(x, y, z, 4.6, 2, 1.6, hx, hz, hexc('#232432')); ob(x - hx * .3, y + 1.6, z - hz * .3, 2.6, 1.8, .9, hx, hz, hexc('#232432')); }
    else if (a.t === 'emergency') { const on = Math.floor(now * 6) % 2;
      const body = a.kind === 'fire' ? hexc('#c8402e') : a.kind === 'ambulance' ? hexc('#c8e632') : hexc('#f8ebd9'), len = a.kind === 'fire' ? 9 : a.kind === 'ambulance' ? 6.5 : 4.8;
      ob(x, y, z, len, 2.4, a.kind === 'police' ? 1.6 : 2.8, hx, hz, body); if (a.kind !== 'fire') ob(x, y + .6, z, len * 1.01, 2.45, .5, hx, hz, hexc('#2a5bd7'));
      ob(x, y + (a.kind === 'police' ? 1.6 : 2.8), z, 1.2, 2, .4, hx, hz, on ? [.3, .5, 1] : [.95, .95, 1]); }
    else { ob(x, y, z, 4.4, 1.9, 1.4, hx, hz, a.col); ob(x - hx * .3, y + 1.4, z - hz * .3, 2.4, 1.7, .8, hx, hz, a.col.map(c => c * .8)); }
  }
  if (PX.swim) { const W = PX.swim, t0 = W.lo + (W.hi - W.lo) * .05; ob(W.mx + W.ax * t0, W.y, W.mz + W.az * t0, 6, 26, .8, W.ax, W.az, hexc('#b4ada8'));   // the Eden Dock swimming pontoon and lane buoys
    for (const lane of [-15, 15]) for (let u = .1; u <= .9; u += .05) { const t = W.lo + (W.hi - W.lo) * u; ob(W.mx + W.ax * t - W.az * lane, W.y, W.mz + W.az * t + W.ax * lane, .8, .8, .5, W.ax, W.az, hexc('#f2c230')); } }
  done(M); PX.stats.boxes = M.count;
}
// the group of trees and figures: built on the first pixel-art visit, shown only in pixel art; the species trees of
// layers/trees.js are hidden meanwhile (the WebGL page draws its box trees only in pixel art, its normal trees only outside it)
async function pixExtras() {
  if (PX.extras) return PX.extras;
  return (PX.extras = (async () => {
    const g = new THREE.Group(); g.name = 'pixel:extras'; g.visible = false; C.scene.add(g);
    const river = await C.loadJSON(C.DATA + 'river.json').catch(e => { console.warn('pixel river', e); return null; });
    PX.ents = boxMesh(2400, 'pixel:figures'); g.add(PX.ents); PX.actors = makeActors(river); PX.stats.actors = PX.actors.length; PX.last = 0;
    buildPixTrees().then(m => { g.add(m); C.draw(); }).catch(e => console.warn('pixel trees', e));
    return g;
  })());
}
function pixExtrasShow(on) {
  const g = PX.group; if (g) g.visible = on;
  const t = C.scene.getObjectByName('trees');
  if (on) { if (t && t.parent === C.scene && PX.treesWas == null) { PX.treesWas = t.visible; t.visible = false; } }
  else if (t && PX.treesWas != null) { t.visible = PX.treesWas; PX.treesWas = null; }
}

// ---------- line drawing and Vector CRT
const LN = { focal: uniform(500), lo: uniform(4), pass: null, near: uniform(1), far: uniform(20000), off: uniform(new THREE.Vector2(1, 1)), damp: uniform(0.83), flick: uniform(1), last: 0, mats: null, tint: uniform(0) };   // tint 1: Vector CRT "Colour overlay" (line-styles.js TINT)
// layer numbers in the pass (blue channel / 16): 1 buildings, 2 railways, 3 water, 4 greens, 5 roads, 6 terrain (hides, no pen)
const PEN = ['#000000', '#c0392b', '#1f5fbf', '#2e8b3a', '#777777'].map(hexc);   // plotter-svg.js LAYERS: buildings, railways, water, greens, roads
const BEAM = [0.9, 0.7, 0.55, 0.42, 0.34], PHOS = [0.80, 0.92, 1];               // line-styles.js: brightness per layer, one phosphor
const TINT = [[0.85, 0.95, 1], [1, 0.38, 0.3], [0.3, 0.6, 1], [0.35, 1, 0.5], [0.7, 0.7, 0.75]];   // line-styles.js TINT in this order (buildings, railways, water, greens, roads)
function idMaterial(id, src, sized) {   // sized (buildings): under LO px on the screen a building is layer 7 (it hides, draws no line)
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  m.colorNode = Fn(() => {
    If(positionWorld.y.greaterThan(C.U.cut), () => { Discard(); });
    const n = faceN(), k = sized ? select(attribute('lsz', 'float').mul(LN.focal).div(positionView.z.negate()).lessThan(LN.lo), float(7), float(id)) : float(id);
    return vec4(n.xy.mul(0.5).add(0.5), k.div(16), 1);
  })();
  if (src) Object.assign(m, { polygonOffset: src.polygonOffset, polygonOffsetFactor: src.polygonOffsetFactor, polygonOffsetUnits: src.polygonOffsetUnits });
  return m;
}
function sizeAttribute(G) {   // per vertex: the building's size (largest of width, depth and height, m): the plotter's size rule
  if (G.getAttribute('lsz') || !G.userData.bi) return;
  const bi = G.userData.bi, out = new Float32Array(bi.length), cache = LN.size || (LN.size = new Map());
  for (let k = 0; k < bi.length; k++) { const i = bi[k]; let v = cache.get(i);
    if (v == null) { const b = C.A.buildings[i], f = C.dec(b.p); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let j = 0; j < f.length; j += 2) { x0 = Math.min(x0, f[j]); x1 = Math.max(x1, f[j]); z0 = Math.min(z0, f[j + 1]); z1 = Math.max(z1, f[j + 1]); } v = Math.max(x1 - x0, z1 - z0, b.h); cache.set(i, v); }
    out[k] = v; }
  G.setAttribute('lsz', new THREE.BufferAttribute(out, 1));
}
function lineMask(crt) {   // per pixel: the layer of the edge through it (0 none), then its pen or beam colour
  const T = LN.pass.getTextureNode(), D = LN.pass.getTextureNode('depth'), off = LN.off;
  const px = o => {
    const uv = screenUV.add(o.mul(off)), t = T.sample(uv), z = perspectiveDepthToViewZ(D.sample(uv).x, LN.near, LN.far).negate();
    const id = mix(floor(t.z.mul(16).add(0.5)), float(0), step(LN.far.mul(0.999), z));   // background: no layer
    const nx = t.x.mul(2).sub(1), ny = t.y.mul(2).sub(1);
    return { id, iz: float(1).div(max(z, 0.01)), n: vec3(nx, ny, sqrt(max(0, float(1).sub(nx.mul(nx)).sub(ny.mul(ny))))) };
  };
  // float masks (1 or 0) in place of and() / or(): inside an rtt() (the afterglow's input) logical nodes failed to build in
  // r186 ("Cannot read properties of undefined (reading 'addToStack')"); If() and Fn() as well
  const eq = (a, k) => float(1).sub(step(0.5, abs(a.sub(k)))), pick = (m, yes, no) => mix(no, yes, m);
  const pen = id => pick(max(step(id, 0.5), step(5.5, id)), float(99), id);   // background, terrain and small buildings draw no line
  return (() => {
    const c = px(vec2(0, 0)), r = px(vec2(1, 0)), u = px(vec2(0, -1)), l = px(vec2(-1, 0)), d = px(vec2(0, 1));
    let best = float(99);
    // a change of layer (the line on one side only: 1 px at off = 1): a building's outline when the nearer side is a building
    // big enough (layer 1; a small one, layer 7, hides what is behind it and draws nothing), else the first pen of the two
    const bld = id => max(eq(id, 1), eq(id, 7));
    for (const n of [r, u]) {
      const near = pick(step(n.iz, c.iz), c.id, n.id);
      const p = pick(max(bld(c.id), bld(n.id)), pick(eq(near, 7), float(99), pick(max(eq(c.id, 1), eq(n.id, 1)), float(1), pen(near))), min(pen(c.id), pen(n.id)));
      best = min(best, pick(float(1).sub(eq(c.id, n.id)), p, float(99)));
    }
    // within the buildings: a crease (normals over 37 deg apart) or a step in depth (1/z is linear across a plane; the near side only)
    const bc = eq(c.id, 1);
    for (const n of [r, u]) best = min(best, pick(bc.mul(eq(n.id, 1)).mul(step(dot(c.n, n.n), 0.8)), float(1), float(99)));
    for (const [a, b] of [[l, r], [d, u]]) best = min(best, pick(bc.mul(step(c.iz.mul(0.04), abs(a.iz.add(b.iz).sub(c.iz.mul(2))))).mul(step(max(a.iz, b.iz), c.iz)), float(1), float(99)));
    const k = best;
    if (!crt) return PEN.reduce((acc, p, i) => pick(eq(k, i + 1), vec3(...p), acc), vec3(1));
    return BEAM.reduce((acc, b, i) => pick(eq(k, i + 1), mix(vec3(...PHOS), vec3(...TINT[i]), LN.tint).mul(b), acc), vec3(0));
  })();
}
function lineFrame() {
  const cam = C.camera; LN.near.value = cam.near; LN.far.value = cam.far;
  const W = C.renderer.domElement.width || 1, Hh = C.renderer.domElement.height || 1, k = Math.max(1, Math.round(C.renderer.getPixelRatio()));
  LN.off.value.set(k / W, k / Hh);   // one CSS px
  LN.focal.value = Hh / 2 / Math.tan(cam.fov * Math.PI / 360); LN.lo.value = (MODE === 'vectrex' ? 6 : 4) * 1.25 * C.renderer.getPixelRatio();   // line-styles.js LO, LO_CRT (CSS px; its fade from 1.6 x LO down to LO, as a cut at 1.25 x)
  const M = C.meshes;
  for (const [o, id] of [[M.terrain, 6], [M.water, 3], [M.greens, 4], [M.rail, 2], [M.roads, 5]]) o.layers.enable(LAYER);
  for (const o of M.buildings.children) o.layers.enable(LAYER);
  M.models.traverse(o => { if (o.isMesh) o.layers.enable(LAYER); });
  swapAll(LN.mats);
  if (MODE === 'vectrex') {   // afterglow: about 0.09 s to fade to a third (line-styles.js); a slight flicker; redraw all the time
    const now = performance.now(), dt = Math.min(0.25, Math.max(1 / 240, (now - (LN.last || now - 16)) / 1000)); LN.last = now;
    LN.damp.value = Math.exp(-dt / 0.09); const t = now / 1000; LN.flick.value = 0.955 + 0.03 * Math.sin(t * 61) * Math.sin(t * 19.5) + 0.02 * (Math.random() - 0.5);
    C.draw();
  }
}

// ---------- material swaps: the style's material on each model mesh; the meshes' own materials come back on leaving
function swapAll(of) {
  const M = C.meshes;
  const put = (o, m) => { if (!m || o.material === m) return; if (!saved.mats.has(o)) saved.mats.set(o, o.material); o.material = m; };
  put(M.terrain, of.terrain); put(M.water, of.water); put(M.greens, of.greens); put(M.rail, of.rail); put(M.roads, of.roads);
  for (const o of M.buildings.children) { if (of.pix) pixAttributes(o.geometry); else sizeAttribute(o.geometry); put(o, of.building); }
  if (of.model) M.models.traverse(o => { if (o.isMesh) put(o, of.model); });
}
function restoreMats() { for (const [o, m] of saved.mats) o.material = m; saved.mats.clear(); }

// ---------- switching
async function setStyle(mode) {
  if (!STYLES.includes(mode)) mode = 'map';
  if (mode === MODE) { sync(); return; }
  const from = MODE; MODE = mode;
  restoreMats();
  if (from === 'pixel') {   // back to the saved camera, clock, shadows, labels and sky
    pixExtrasShow(false);
    C.sky.sky.visible = true; if (C.sky.stars) C.sky.stars.visible = true; C.scene.background = saved.bg;
    H.setShadows(saved.shadows); $('showLabels').checked = saved.labels; H.setClock(saved.clock); H.setCam(saved.cam);
  }
  if (mode === 'pixel') {
    if (!PX.pal) {
      const pj = await C.loadJSON(C.DATA + 'pixel-palette.json'); PX.pal = pj; PX.colours = [...pj.colours, ...Object.values(pj.accents)].slice(0, 33).map(hexc);
      PX.MATC = [['#a27261', '#bb927c', '#8c5e50', '#705858'], ['#f3dbbe', '#f5c796', '#e5b177', '#cec5bb'], ['#788b9c', '#5d738a', '#6f8fa6', '#50596e'], ['#cec5bb', '#b8b2ad', '#999698', '#e0d8cc'], ['#999698', '#c9c2b8', '#788b9c']].map(l => l.map(hexc));
      PX.pass = pass(C.scene, PX.cam, { samples: 0 }); PX.out = pixOutput(); PX.bg = new THREE.Color().setRGB(0.059, 0.071, 0.082, THREE.SRGBColorSpace);
      const a = pj.accents, M = C.meshes;
      PX.FACC = [...PX.MATC[2], ...PX.MATC[3], ...PX.MATC[4]];   // measured facade colours snap to these (glass, ribbon, metal), never to a tree green
      PX.facJ = await C.loadJSON(C.WEBGL.replace(/docklands\/$/, '') + 'registry/sources/facades/facades.json').then(f => f.buildings).catch(e => { console.warn('pixel facades', e); return {}; });
      PX.mats = { pix: true, terrain: flatMaterial('#cec5bb'), water: flatMaterial(a.water, M.water.material), greens: flatMaterial('#849953', M.greens.material),
        rail: flatMaterial('#999698', M.rail.material), roads: flatMaterial('#746b70', M.roads.material), building: pixBuildingMaterial() };
    }
    const s = H.camState();
    Object.assign(saved, { cam: s, clock: C.clock, shadows: $('shadows').checked, labels: $('showLabels').checked, bg: C.scene.background });
    H.setShadows(false); $('showLabels').checked = false;
    if (C.night) { const d = new Date(C.clock).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); H.setClock(Date.parse(d + 'T12:00:00Z')); }   // night is off in pixel art
    H.setCam({ ...s, yaw: Math.PI / 4, pitch: 0.5236, dist: Math.min(s.dist, 520), hfov: null, roll: 0 });
    PX.group = await pixExtras(); pixExtrasShow(MODE === 'pixel'); if (MODE !== 'pixel') return;
    OUT = PX.out;
  } else if (mode === 'lines' || mode === 'vectrex') {
    if (!LN.pass) {
      LN.pass = pass(C.scene, C.camera, { samples: 0 }); const L = new THREE.Layers(); L.set(LAYER); LN.pass.setLayers(L);
      const M = C.meshes;
      LN.mats = { terrain: idMaterial(6), water: idMaterial(3, M.water.material), greens: idMaterial(4, M.greens.material), rail: idMaterial(2, M.rail.material), roads: idMaterial(5, M.roads.material), building: idMaterial(1, null, true), model: idMaterial(1) };
      LN.paper = vec4(lineMask(false), 1);
      const beam = lineMask(true), glow = afterImage(beam, LN.damp);
      LN.crt = vec4(glow.rgb.mul(LN.flick).add(bloom(glow.getTextureNode(), 0.5, 0.1, 0).rgb.mul(LN.flick.mul(0.8))), 1);
    }
    LN.last = 0; OUT = mode === 'lines' ? LN.paper : LN.crt;
  } else OUT = null;
  if (!OUT) { H.pipe.outputColorTransform = true; H.syncPost(); }
  sync(); C.draw();
}
function sync() {   // the control, the body classes (label look), the URL
  const sel = $('styleSel'); if (sel) sel.value = MODE;
  $('isoBtns').hidden = MODE !== 'pixel'; $('nightBtn').hidden = MODE !== 'map';
  $('labels').style.visibility = MODE === 'pixel' ? 'hidden' : '';   // no names in pixel art (the WebGL page), and the layers' labels follow the orbit camera
  document.body.classList.toggle('lstyle-lines', MODE === 'lines'); document.body.classList.toggle('lstyle-crt', MODE === 'vectrex');
  const nt = $('styleNote'); if (nt) { nt.hidden = !NOTE[MODE]; nt.textContent = NOTE[MODE] || ''; }   // index.html pixNote, line-styles.js NOTE
  if ($('crtRow')) $('crtRow').hidden = MODE !== 'vectrex';
  const q = new URLSearchParams(location.search); if (MODE === 'map') q.delete('style'); else q.set('style', MODE);
  history.replaceState(null, '', location.pathname + (q.size ? '?' + q : '') + location.hash);
}
const $ = id => document.getElementById(id);

// ---------- every frame: the style's camera, materials and output node (main.js syncPost() sets the map's output on a clock change)
function frame() {
  if (MODE === 'map') return;
  if (MODE === 'pixel') pixFrame(); else lineFrame();
  const P = H.pipe; if (P.outputNode !== OUT || P.outputColorTransform) { P.outputNode = OUT; P.outputColorTransform = false; P.needsUpdate = true; }
}

// the style notes under Look > Style (index.html #pixNote, line-styles.js NOTE), as true for this port
const NOTE = {
  pixel: 'Pixel art: an isometric view in a 33-colour palette with stylised trees, people, cyclists, buses, cabs, now and then a police car, ambulance or fire engine, gulls, river traffic (Thames Clipper catamarans, tourist boats, tugs towing waste barges, aggregate barges, speedboats) and swimmers in Eden Dock. Photo facades and the measured facade colours are kept. The arrows at the top right turn the view by a quarter. Night is off in this style. The animals and traffic are illustrative, not live data.',
  lines: 'Line drawing: the plotter drawing in real time. Building edges with hidden lines removed, and water, parks, roads and railways in the plotter\'s pen colours. A building smaller than 5 px on the screen draws no edges. Night, overlays and splats are off in this style. About > Plotter makes the file for a pen plotter.',
  vectrex: 'Vector CRT, after the Vectrex console (1982), which drew each line with the electron beam: bright phosphor lines on black, a glow, a short afterglow when the view moves and a slight flicker. There are no scanlines, because a vector screen has none. "Colour overlay" tints each kind of line, as the Vectrex\'s plastic overlays coloured its screen. The screen redraws all the time in this style, which uses more battery.' };
function ui() {
  const css = document.createElement('style');
  css.textContent = '#styleBox{position:fixed;right:10px;top:calc(10px + env(safe-area-inset-top,0px));z-index:5;display:flex;flex-direction:column;align-items:flex-end;gap:6px}' +
    '#styleSel{width:auto;height:32px;background:rgba(16,20,24,.92);color:#e8ecef;border:0;border-radius:16px;padding:0 10px;font-size:13px}' +
    '#isoBtns{display:flex;gap:6px}#isoBtns[hidden]{display:none}#isoBtns button{width:40px;height:40px;border-radius:50%;border:0;background:rgba(16,20,24,.92);color:#e8ecef;font-size:18px;cursor:pointer}' +
    'body.lstyle-lines .lab{background:none;color:#111;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 2px #fff}' +
    'body.lstyle-crt .lab{background:none;color:#cfe8ff;text-shadow:0 0 4px #6fb4ff,0 0 8px #3d7fd6}';
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'styleBox';
  box.innerHTML = `<select id="styleSel" aria-label="Drawing style" title="Drawing style">${STYLES.map(s => `<option value="${s}">${NAMES[s]}</option>`).join('')}</select>` +
    '<div id="isoBtns" hidden><button id="isoL" aria-label="Turn left by a quarter" title="Turn left by a quarter">&#8634;</button><button id="isoR" aria-label="Turn right by a quarter" title="Turn right by a quarter">&#8635;</button></div>';
  document.body.appendChild(box);
  // Look > Style: the style's note and, in Vector CRT, "Colour overlay" (index.html #crtRow, #crtOverlay; ?crt=overlay)
  const after = $('styleProxy') && $('styleProxy').closest('label');
  if (after) {
    const row = document.createElement('label'); row.className = 'row'; row.id = 'crtRow'; row.hidden = true;
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'crtOverlay'; cb.checked = new URLSearchParams(location.search).get('crt') === 'overlay'; LN.tint.value = cb.checked ? 1 : 0;
    cb.onchange = () => { LN.tint.value = cb.checked ? 1 : 0; C.draw(); }; row.append(cb, ' Colour overlay');
    const note = document.createElement('p'); note.className = 'small'; note.id = 'styleNote'; note.hidden = true;
    after.after(row, note);
  }
  $('styleSel').onchange = e => setStyle(e.target.value).catch(err => console.warn('style', err));
  const turn = a => { const s = H.camState(); H.setCam({ ...s, yaw: s.yaw + a }); };
  $('isoL').onclick = () => turn(Math.PI / 2); $('isoR').onclick = () => turn(-Math.PI / 2);
}

export function init(hook) {
  H = hook; C = hook.ctx;
  // picking in pixel art: the ray of the orthographic camera that draws the view
  const set = THREE.Raycaster.prototype.setFromCamera;
  H.ray.setFromCamera = function (ndc, cam) { return set.call(this, ndc, MODE === 'pixel' ? PX.cam : cam); };
  ui(); C.onFrame(frame);
  const q = new URLSearchParams(location.search), want = q.get('style') || (q.has('pixel') ? 'pixel' : q.has('lines') ? 'lines' : q.has('vectrex') ? 'vectrex' : 'map');
  const api = { setStyle, get mode() { return MODE; }, get pixel() { return PX.stats; } };
  globalThis.__docklandsStyles = api;
  return setStyle(want).then(() => api);
}
