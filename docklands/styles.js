// Drawing styles of the Three.js port (?style=map|pixel|lines|vectrex), ported from the WebGL page
// (https://danbri.github.io/londat/cwplans/docklands/ : ?pixel in index.html, ?lines and ?vectrex in line-styles.js).
// main.js gives the hook `styleHook` (the RenderPipeline, the pick ray, the camera functions, ctx); a style sets its own
// pipe.outputNode and draws with its own pass. Everything is TSL, so one graph serves WebGPU and WebGL 2.
//  - Pixel art: an orthographic camera 30 deg down at 45 deg (quarter turns by the arrow buttons), drawn at one art pixel
//    per 2 CSS px (1 when the camera is over 700 m away) by a pass at a reduced resolution, flat colours by building
//    material, then the 33 colours of data/pixel-palette.json with dark outlines where the brightness steps. Night off.
//  - Line drawing and Vector CRT: a pass of the model (buildings, models, terrain, water, greens, roads, rail) writes the
//    face normal and a layer number; the edges come from that and the depth (layer changes, creases over 37 deg, depth
//    steps); pen colours of plotter-svg.js on paper, or the blue-white phosphor with an afterglow (AfterImageNode), a glow
//    (BloomNode) and a slight flicker. No scanlines: a vector screen has none (the WebGL page, line-styles.js).
// Skill: docklands-3d-page, "Three.js port" and "Styles".
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, Discard, pass, uniform, uniformArray, attribute, float, vec2, vec3, vec4, floor, fract, mod, step, mix, min, max, abs,
  dot, select, sqrt, clamp, screenUV, screenCoordinate, positionWorld, positionView, normalFlat, cameraWorldMatrix, sRGBTransferEOTF,
  sRGBTransferOETF, perspectiveDepthToViewZ } from 'three/tsl';
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
const PX = { gain: 2.2, pal: null, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 14000), pass: null, size: uniform(new THREE.Vector2(64, 64)), edge: uniform(0.2), pxm: uniform(1), scale: 0, colours: null, mats: null };
const hsh = v => ((v * 2654435761) >>> 0) / 4294967296;
function pixBuilding(i) {   // index.html setPixStyle: buildingMat (0 brick, 1 render, 2 glass, 3 ribbon windows, 4 metal) and buildingColour
  const b = C.A.buildings[i], h = b.h, r = hsh(i + 7), d = hsh((Math.floor(b.p[0] / 1500) * 73856093) ^ (Math.floor(b.p[1] / 1500) * 19349663));
  const m = h > 60 ? (r < .75 ? 2 : 3) : h > 20 ? (r < .3 ? 2 : r < .65 ? 3 : r < .85 ? 1 : 0) : d < .45 ? (r < .8 ? 0 : 1) : d < .8 ? (r < .75 ? 1 : 0) : (r < .6 ? 4 : 3);
  const L = PX.MATC[m]; return [L[Math.floor((d * .7 + hsh(i) * .3) * L.length) % L.length], m];   // (the measured facade colours, material 5, need the registry: not ported)
}
function pixAttributes(G) {   // per vertex: the building's palette colour and material, from the model index of each vertex
  if (G.getAttribute('pcol') || !G.userData.bi) return;
  const bi = G.userData.bi, n = bi.length, col = new Float32Array(n * 3), mat = new Float32Array(n), cache = PX.cache || (PX.cache = new Map());
  for (let k = 0; k < n; k++) { const i = bi[k]; let v = cache.get(i); if (!v) { v = pixBuilding(i); cache.set(i, v); } col.set(v[0], 3 * k); mat[k] = v[1]; }
  G.setAttribute('pcol', new THREE.BufferAttribute(col, 3)); G.setAttribute('pmat', new THREE.BufferAttribute(mat, 1));
}
function flatMaterial(hex, src) {   // a palette colour, shaded by the WebGL page's light
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }), c = vec3(...hexc(hex));
  m.colorNode = Fn(() => { If(positionWorld.y.greaterThan(C.U.cut), () => { Discard(); }); return vec4(lin(c.mul(shadeK())).div(PX.gain), 1); })();
  if (src) Object.assign(m, { polygonOffset: src.polygonOffset, polygonOffsetFactor: src.polygonOffsetFactor, polygonOffsetUnits: src.polygonOffsetUnits });
  return m;
}
function pixBuildingMaterial() {   // index.html facade program with pxm > 0: walls 1.3 x brighter, a pattern per material on the art-pixel grid
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const pc = attribute('pcol', 'vec3'), pm = attribute('pmat', 'float'), uw = attribute('uw', 'float');
  m.colorNode = Fn(() => {
    If(positionWorld.y.greaterThan(C.U.cut), () => { Discard(); });
    const col = min(vec3(1), pc.mul(shadeK()).mul(1.3)).toVar();
    If(uw.greaterThanEqual(0).and(PX.pxm.lessThan(1.5)), () => {
      const fy = fract(positionWorld.y.div(PX.pxm.mul(4))), fx = floor(screenCoordinate.x), win = step(0.3, fy).mul(step(fy, 0.8));
      If(pm.lessThan(0.5), () => { col.assign(mix(col, col.mul(0.55).add(vec3(0.05, 0.07, 0.11)), step(mod(fx, 4), 1).mul(win))); })   // brick: punched windows
        .ElseIf(pm.lessThan(1.5), () => { col.assign(mix(col, vec3(0.33, 0.40, 0.50), step(mod(fx, 5), 1).mul(win).mul(0.85))); })   // render: darker glass
        .ElseIf(pm.lessThan(2.5), () => { col.assign(col.mul(float(1).sub(step(fy, 0.2).mul(0.14))).mul(step(mod(fx, 3), 0.5).mul(0.2).add(1))); })   // glass: mullions and spandrels
        .ElseIf(pm.lessThan(3.5), () => { col.assign(mix(col, vec3(0.40, 0.48, 0.58), step(0.38, fy).mul(step(fy, 0.9)).mul(0.8))); })   // ribbon windows
        .Else(() => { col.mulAssign(float(1).sub(step(mod(fx, 3), 0.5).mul(0.14))); });   // metal cladding seams
    });
    return vec4(lin(col).div(PX.gain), 1);
  })();
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
  swapAll(PX.mats);
}

// ---------- line drawing and Vector CRT
const LN = { focal: uniform(500), lo: uniform(4), pass: null, near: uniform(1), far: uniform(20000), off: uniform(new THREE.Vector2(1, 1)), damp: uniform(0.83), flick: uniform(1), last: 0, mats: null };
// layer numbers in the pass (blue channel / 16): 1 buildings, 2 railways, 3 water, 4 greens, 5 roads, 6 terrain (hides, no pen)
const PEN = ['#000000', '#c0392b', '#1f5fbf', '#2e8b3a', '#777777'].map(hexc);   // plotter-svg.js LAYERS: buildings, railways, water, greens, roads
const BEAM = [0.9, 0.7, 0.55, 0.42, 0.34], PHOS = [0.80, 0.92, 1];               // line-styles.js: brightness per layer, one phosphor
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
    return BEAM.reduce((acc, b, i) => pick(eq(k, i + 1), vec3(...PHOS).mul(b), acc), vec3(0));
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
    C.sky.sky.visible = true; if (C.sky.stars) C.sky.stars.visible = true; C.scene.background = saved.bg;
    H.setShadows(saved.shadows); $('showLabels').checked = saved.labels; H.setClock(saved.clock); H.setCam(saved.cam);
  }
  if (mode === 'pixel') {
    if (!PX.pal) {
      const pj = await C.loadJSON(C.DATA + 'pixel-palette.json'); PX.pal = pj; PX.colours = [...pj.colours, ...Object.values(pj.accents)].slice(0, 33).map(hexc);
      PX.MATC = [['#a27261', '#bb927c', '#8c5e50', '#705858'], ['#f3dbbe', '#f5c796', '#e5b177', '#cec5bb'], ['#788b9c', '#5d738a', '#6f8fa6', '#50596e'], ['#cec5bb', '#b8b2ad', '#999698', '#e0d8cc'], ['#999698', '#c9c2b8', '#788b9c']].map(l => l.map(hexc));
      PX.pass = pass(C.scene, PX.cam, { samples: 0 }); PX.out = pixOutput(); PX.bg = new THREE.Color().setRGB(0.059, 0.071, 0.082, THREE.SRGBColorSpace);
      const a = pj.accents, M = C.meshes;
      PX.mats = { pix: true, terrain: flatMaterial('#cec5bb'), water: flatMaterial(a.water, M.water.material), greens: flatMaterial('#849953', M.greens.material),
        rail: flatMaterial('#999698', M.rail.material), roads: flatMaterial('#746b70', M.roads.material), building: pixBuildingMaterial() };
    }
    const s = H.camState();
    Object.assign(saved, { cam: s, clock: C.clock, shadows: $('shadows').checked, labels: $('showLabels').checked, bg: C.scene.background });
    H.setShadows(false); $('showLabels').checked = false;
    if (C.night) { const d = new Date(C.clock).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); H.setClock(Date.parse(d + 'T12:00:00Z')); }   // night is off in pixel art
    H.setCam({ ...s, yaw: Math.PI / 4, pitch: 0.5236, dist: Math.min(s.dist, 520), hfov: null, roll: 0 });
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
  const api = { setStyle, get mode() { return MODE; } };
  globalThis.__docklandsStyles = api;
  return setStyle(want).then(() => api);
}
