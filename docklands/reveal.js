// The reveal of a data layer in the Three.js port of the Docklands 3D page (https://danbri.github.io/londat/docklands/):
// a frosted glass sheet with a top-down drawing of the layer falls from the sky, lands on the ground and the water with a
// small bounce and a squash and stretch, drapes over the ground, then dissolves and shows the layer itself. The drawing
// is in the same x/z as the layer, so it lines up with the layer when the sheet is down.
//   reveal(ctx, { object, label, draw2d?(canvasCtx, toPx), alive?() }) -> Promise<boolean> (false: skipped, layer shown)
// The drawing: draw2d when the layer gives one; else the layer's plain meshes traced on a 2D canvas (thin beams stay
// visible); else (instanced meshes, points, very many triangles) the layer rendered once from above into a render target.
// WebGPU: the frosted look refracts the scene behind (viewportSharedTexture, 4 noisy taps); WebGL 2: a translucent tint.
// TSL only. ?reveal=0 or prefers-reduced-motion: no sheet. Test clock: globalThis.__docklandsReveal.manual(true), step(s).
// Skill: docklands-3d-page, "Three.js port".
import * as THREE from 'three/webgpu';
import { Fn, If, Discard, uniform, attribute, texture, positionWorld, normalWorld, cameraPosition, viewportSharedTexture, screenUV,
  float, vec2, vec3, vec4, floor, fract, sin, dot, mix, smoothstep, clamp, max, abs, pow, normalize, reflect, fwidth, step } from 'three/tsl';
import { A, dec } from './build.js';

export const TIMES = { land: 1.2, fadeStart: 1.45, fade: 1.35 };   // s: the centre lands at 1.2 s; all done by 2.8 s
const MAX_ACTIVE = 2;
const CLOCK = { manual: false, t: 0 };
const now = () => CLOCK.manual ? CLOCK.t : performance.now() / 1000;
const active = new Set();
const STATS = { started: 0, skipped: 0, done: 0, last: null };
globalThis.__docklandsReveal = {
  manual(on = true) { CLOCK.manual = on; CLOCK.t = performance.now() / 1000; },
  step(dt) { CLOCK.t += dt; for (const s of active) s.ctx.draw(); },
  get active() { return active.size; }, stats: STATS, TIMES,
};

// ---------- the ground and the water under the sheet
let WATER = null;
function waterPolys() {
  if (WATER) return WATER;
  WATER = (A.water || []).filter(w => isFinite(w.level)).map(w => { const f = dec(w.p), n = w.holes && w.holes.length ? w.holes[0] : f.length / 2;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < n; i++) { x0 = Math.min(x0, f[2 * i]); x1 = Math.max(x1, f[2 * i]); z0 = Math.min(z0, f[2 * i + 1]); z1 = Math.max(z1, f[2 * i + 1]); }
    return { f, n, level: w.level, x0, x1, z0, z1 }; });
  return WATER;
}
function inPoly(P, x, z) { const f = P.f; let c = false; for (let k = 0, j = P.n - 1; k < P.n; j = k++) { const az = f[2 * k + 1], bz = f[2 * j + 1]; if ((az > z) !== (bz > z) && x < (f[2 * j] - f[2 * k]) * (z - az) / (bz - az) + f[2 * k]) c = !c; } return c; }
function floorAt(ctx, x, z, r) {   // the highest of the ground (4 samples r apart) and the water surface
  let g = ctx.groundAt(x, z); for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) g = Math.max(g, ctx.groundAt(x + dx, z + dz));
  if (g < 6) for (const P of waterPolys()) if (x >= P.x0 && x <= P.x1 && z >= P.z0 && z <= P.z1 && P.level > g && inPoly(P, x, z)) g = P.level;
  return g;
}

// ---------- the drawing
function plainMeshes(object) {   // [{ mesh, tris }] when every drawable part is a plain Mesh, else null
  const out = []; let ok = true;
  object.updateWorldMatrix(true, true);
  object.traverse(o => { if (o.isInstancedMesh || o.isPoints || o.isLine || o.isSprite || o.isBatchedMesh) ok = false;
    else if (o.isMesh && o.geometry && o.geometry.attributes.position) { const g = o.geometry; out.push({ mesh: o, tris: (g.index ? g.index.count : g.attributes.position.count) / 3 }); } });
  return ok && out.length && out.reduce((s, m) => s + m.tris, 0) <= 200000 ? out : null;
}
function traceMeshes(cx, toPx, list) {   // each triangle projected on x/z, filled and stroked (1.5 px) in its vertex colour
  cx.lineWidth = 1.5; cx.lineJoin = 'round';
  const flush = (key, p) => { const col = `rgb(${((key >> 8) & 15) * 17},${((key >> 4) & 15) * 17},${(key & 15) * 17})`; cx.fillStyle = col; cx.strokeStyle = col; cx.fill(p); cx.stroke(p); };
  const paths = new Map(), v = new THREE.Vector3(), c = new THREE.Color(), q = n => Math.round(Math.min(1, Math.max(0, n)) * 15);
  for (const { mesh } of list) {
    const g = mesh.geometry, P = g.attributes.position, C = g.attributes.color, I = g.index, M = mesh.matrixWorld, base = mesh.material && mesh.material.color ? mesh.material.color : new THREE.Color(1, 1, 1);
    const n = I ? I.count : P.count, xy = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); const [px, py] = toPx(v.x, v.z); xy[2 * i] = px; xy[2 * i + 1] = py; }
    for (let k = 0; k + 2 < n; k += 3) {
      const a = I ? I.getX(k) : k, b = I ? I.getX(k + 1) : k + 1, d = I ? I.getX(k + 2) : k + 2;
      if (C) c.fromBufferAttribute(C, a); else c.copy(base);
      const key = (q(c.r) << 8) | (q(c.g) << 4) | q(c.b);
      let p = paths.get(key); if (!p) paths.set(key, p = { p: new Path2D(), n: 0 });
      if (++p.n > 3000) { flush(key, p.p); p.p = new Path2D(); p.n = 1; }   // short paths: one long path fills very slowly
      p = p.p; p.moveTo(xy[2 * a], xy[2 * a + 1]); p.lineTo(xy[2 * b], xy[2 * b + 1]); p.lineTo(xy[2 * d], xy[2 * d + 1]); p.closePath();
    }
  }
  for (const [key, p] of paths) flush(key, p.p);
}
function renderFromAbove(ctx, object, B, W, H) {   // the layer drawn once by the GPU, looking straight down, north up
  const { renderer } = ctx, rt = new THREE.RenderTarget(W, H, { samples: 4 });
  const cam = new THREE.OrthographicCamera(-(B.max.x - B.min.x) / 2, (B.max.x - B.min.x) / 2, (B.max.z - B.min.z) / 2, -(B.max.z - B.min.z) / 2, 1, B.max.y - B.min.y + 20);
  cam.position.set((B.min.x + B.max.x) / 2, B.max.y + 10, (B.min.z + B.max.z) / 2); cam.up.set(0, 0, -1); cam.lookAt(cam.position.x, B.min.y - 10, cam.position.z); cam.updateMatrixWorld();
  const tmp = new THREE.Scene(), parent = object.parent, vis = object.visible;
  tmp.add(new THREE.AmbientLight(0xffffff, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(0.3, 1, 0.2); tmp.add(sun);
  tmp.add(object); object.visible = true;
  const prevTarget = renderer.getRenderTarget(), prevCol = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  try { renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(tmp, cam); }
  finally { renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevCol, prevA); object.visible = vis; if (parent) parent.add(object); else tmp.remove(object); }
  return rt;
}
function labelTexture(text) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128; const cx = cv.getContext('2d');
  cx.font = '600 64px system-ui, sans-serif'; const w = Math.min(1000, cx.measureText(text).width + 64);
  cx.fillStyle = 'rgba(12,18,24,0.78)'; cx.beginPath(); cx.roundRect(4, 14, w, 100, 22); cx.fill();
  cx.fillStyle = '#f2f6f9'; cx.textBaseline = 'middle'; cx.fillText(text, 36, 66, 940);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return { tex: t, aspect: 1024 / 128 };
}

// ---------- the sheet's material
const hash = Fn(([q]) => fract(sin(dot(q, vec2(12.9898, 78.233))).mul(43758.5453)));
const vnoise = Fn(([q]) => { const i = floor(q), f0 = fract(q), f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return mix(mix(hash(i), hash(i.add(vec2(1, 0))), f.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), f.x), f.y); });
const fbm = Fn(([q]) => vnoise(q).mul(0.5).add(vnoise(q.mul(2.03).add(17.1)).mul(0.3)).add(vnoise(q.mul(4.1).add(3.7)).mul(0.2)));

function sheetMaterial(ctx, drawTex, isRT, texel, lab, S) {
  const u = { fade: uniform(0), sun: uniform(new THREE.Vector3(0.3, 0.8, 0.2)) };
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -8;
  const suv = attribute('suv', 'vec2'), meters = attribute('sm', 'vec2');   // suv: the drawing's uv; sm: metres from the sheet's corner
  const scale = float(S / 14);
  const sample = o => texture(drawTex, suv.add(o));
  const ink = Fn(() => {   // the drawing, thin lines widened by a 3 x 3 maximum when it came from the GPU
    const c0 = sample(vec2(0)).toVar();
    if (isRT) { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const s = sample(vec2(dx * texel[0] * 1.5, dy * texel[1] * 1.5)); c0.assign(select4(c0, s)); } }
    const lum = max(max(c0.r, c0.g), max(c0.b, 0.04));
    return vec4(clamp(c0.rgb.div(lum).mul(0.95), 0, 1.4), c0.a);   // the data colour at a constant brightness
  })();
  m.colorNode = Fn(() => {
    const n = fbm(positionWorld.xz.div(scale)), nf = fbm(positionWorld.xz.div(9));   // the dissolve and the frost
    If(n.lessThan(u.fade.mul(1.12).sub(0.06)), () => { Discard(); });
    const rim = float(1).sub(smoothstep(0, 0.05, n.sub(u.fade.mul(1.12).sub(0.06)))).mul(step(0.001, u.fade));   // a bright edge on the dissolve
    const bump = vec3(nf.sub(0.5), 0, fbm(positionWorld.xz.div(9).add(31.7)).sub(0.5)).mul(0.5);
    const N = normalize(normalWorld.add(bump)), V = normalize(cameraPosition.sub(positionWorld));
    const fres = pow(float(1).sub(abs(dot(N, V))), 3);
    const spec = pow(max(dot(reflect(V.negate(), N), normalize(u.sun)), 0), 40).mul(0.7);
    const tint = vec3(0.80, 0.88, 0.95);
    let body;
    if (ctx.GPU) {   // frosted glass: the scene behind, displaced and averaged over 4 noisy taps
      const off = vec2(N.x, N.z).mul(0.018);
      const j = vec2(nf.sub(0.5), vnoise(positionWorld.xz.div(4)).sub(0.5)).mul(0.008);
      const b = viewportSharedTexture(screenUV.add(off).add(j)).rgb.add(viewportSharedTexture(screenUV.add(off).sub(j)).rgb)
        .add(viewportSharedTexture(screenUV.add(off).add(vec2(j.y, j.x.negate()))).rgb).add(viewportSharedTexture(screenUV.add(off).sub(vec2(j.y, j.x.negate()))).rgb).mul(0.25);
      body = mix(b, tint, 0.3).add(nf.mul(0.06));
    } else body = tint.mul(nf.mul(0.2).add(0.4));
    const gm = abs(fract(meters.div(100).sub(0.5)).sub(0.5)).mul(100), gw = fwidth(meters).mul(1.2);
    const grid = max(float(1).sub(smoothstep(gw.x, gw.x.mul(2), gm.x)), float(1).sub(smoothstep(gw.y, gw.y.mul(2), gm.y))).mul(0.12);
    const k = ink.a.mul(0.95);
    let col = mix(body.add(grid), ink.rgb, k).add(fres.mul(0.35)).add(spec);
    const lt = texture(lab.tex, lab.uv), la = lt.a.mul(lab.inside);
    col = mix(col, lt.rgb, la).add(rim.mul(vec3(0.6, 0.9, 1.0)));
    return vec4(col, 1);
  })();
  m.opacityNode = Fn(() => {
    const base = ctx.GPU ? float(0.92) : float(0.28);
    const a = max(base, ink.a.mul(0.95)).add(abs(dot(normalWorld, vec3(0, 1, 0))).oneMinus().mul(0.2));
    return clamp(a.mul(float(1).sub(u.fade.mul(0.35))), 0, 1);
  })();
  return { m, u };
}
const select4 = (a, b) => vec4(max(a.rgb, b.rgb.mul(step(a.a, b.a))), max(a.a, b.a));

// ---------- the sheet
export async function reveal(ctx, { object, label = '', draw2d = null, alive = () => true } = {}) {
  const show = () => { if (object && alive()) { object.visible = true; ctx.draw(); } };
  const reduced = globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const B = object ? new THREE.Box3().setFromObject(object, false) : new THREE.Box3();
  if (!object || !ctx.flag('reveal', true) || reduced || active.size >= MAX_ACTIVE || B.isEmpty()) { STATS.skipped++; show(); return false; }
  const t0 = performance.now();
  // the footprint, padded, and the drawing's size (2048 px on the long side at most, no finer than 0.5 m a pixel)
  const pad = Math.max(40, 0.04 * Math.max(B.max.x - B.min.x, B.max.z - B.min.z));
  B.min.x -= pad; B.max.x += pad; B.min.z -= pad; B.max.z += pad;
  const W = B.max.x - B.min.x, D = B.max.z - B.min.z, S = Math.max(W, D);
  const res = Math.min(2048, Math.ceil(S / 0.5)), cw = Math.max(16, Math.round(res * W / S)), ch = Math.max(16, Math.round(res * D / S));
  const toPx = (x, z) => [(x - B.min.x) / W * cw, (z - B.min.z) / D * ch];
  let drawTex, rt = null, how;
  const list = draw2d ? null : plainMeshes(object);
  if (draw2d || list) {
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const cx = cv.getContext('2d');
    if (draw2d) { draw2d(cx, toPx); how = 'draw2d'; } else { traceMeshes(cx, toPx, list); how = 'trace'; }
    drawTex = new THREE.CanvasTexture(cv); drawTex.colorSpace = THREE.SRGBColorSpace; drawTex.anisotropy = 8; drawTex.generateMipmaps = true; drawTex.minFilter = THREE.LinearMipmapLinearFilter;
  } else { rt = renderFromAbove(ctx, object, B, cw, ch); drawTex = rt.texture; how = 'gpu'; }
  object.visible = false;

  // the grid: about 25 m a cell, 24 to 110 cells a side
  const nx = Math.max(24, Math.min(110, Math.round(W / 25))), nz = Math.max(24, Math.min(110, Math.round(D / 25))), NV = (nx + 1) * (nz + 1);
  const X = new Float32Array(NV), Z = new Float32Array(NV), F = new Float32Array(NV), R2 = new Float32Array(NV), TL = new Float32Array(NV).fill(-1);
  const pos = new Float32Array(NV * 3), suv = new Float32Array(NV * 2), sm = new Float32Array(NV * 2), cxm = (B.min.x + B.max.x) / 2, czm = (B.min.z + B.max.z) / 2;
  const lab = label ? labelTexture(label) : null;
  let fmax = -1e9, fsum = 0;
  for (let j = 0, k = 0; j <= nz; j++) for (let i = 0; i <= nx; i++, k++) {
    const x = B.min.x + W * i / nx, z = B.min.z + D * j / nz; X[k] = x; Z[k] = z;
    F[k] = floorAt(ctx, x, z, Math.max(W / nx, D / nz) / 2) + 1.2; fmax = Math.max(fmax, F[k]); fsum += F[k];
    const rx = (x - cxm) / (W / 2), rz = (z - czm) / (D / 2); R2[k] = Math.min(1, (rx * rx + rz * rz) / 2);
    suv[2 * k] = i / nx; suv[2 * k + 1] = 1 - j / nz; sm[2 * k] = x - B.min.x; sm[2 * k + 1] = z - B.min.z;
  }
  const idx = []; for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const G = new THREE.BufferGeometry(); G.setIndex(idx);
  const P = new THREE.BufferAttribute(pos, 3); P.setUsage(THREE.DynamicDrawUsage); G.setAttribute('position', P);
  G.setAttribute('suv', new THREE.BufferAttribute(suv, 2)); G.setAttribute('sm', new THREE.BufferAttribute(sm, 2));
  // the label: along the south edge, readable from the south
  const LH = Math.max(18, Math.min(220, 0.05 * Math.min(W, D))), LW = Math.min(W * 0.9, LH * (lab ? lab.aspect : 8)), m0 = 0.02 * Math.min(W, D);
  const lx = Math.max(m0, Math.min(W - m0 - LW, ctx.controls.target.x - B.min.x - LW / 2));   // under the view's centre, so it is seen
  const lu = attribute('sm', 'vec2').sub(vec2(lx, D - m0 - LH)).div(vec2(LW, LH));
  const labNode = lab ? { tex: lab.tex, uv: vec2(lu.x, float(1).sub(lu.y)), inside: step(0, lu.x).mul(step(lu.x, 1)).mul(step(0, lu.y)).mul(step(lu.y, 1)) }
    : { tex: new THREE.Texture(), uv: vec2(0), inside: float(0) };
  const { m, u } = sheetMaterial(ctx, drawTex, !!rt, [1 / cw, 1 / ch], labNode, S);
  const mesh = new THREE.Mesh(G, m); mesh.frustumCulled = false; mesh.renderOrder = 20; mesh.name = 'reveal:' + label;
  ctx.scene.add(mesh);

  // the motion: the sheet falls (gravity), its middle billows up a little, each vertex stops at its floor and bounces;
  // the sheet narrows a little as it falls and spreads and springs back on impact (squash and stretch)
  const camAbove = ctx.camera.position.y - fmax, fmean = fsum / NV, H0 = fmax + Math.max(60, Math.min(900, 0.2 * S, camAbove > 80 ? 0.6 * camAbove : 900)), T = TIMES.land, g = 2 * (H0 - fmean) / (T * T);
  const billow = 0.035 * S, bounce = 0.008 * S, flap = 0.004 * S;
  const start = now(); let firstLand = -1, shown = false;
  const sheet = { ctx };
  let resolve; const done = new Promise(r => { resolve = r; });
  const finish = () => { active.delete(sheet); ctx.scene.remove(mesh); G.dispose(); m.dispose(); drawTex.dispose(); if (rt) rt.dispose(); if (lab) lab.tex.dispose(); ctx.draw();
    STATS.done++; resolve(true); };
  sheet.update = () => {
    if (!alive()) { finish(); return; }
    const t = now() - start;
    if (ctx.sky && ctx.sky.sun) u.sun.value.copy(ctx.sky.sun.position).sub(ctx.sky.sun.target.position).normalize();
    const ys = H0 - 0.5 * g * t * t, fall = Math.min(1, t / T);
    const sq = firstLand < 0 ? 1 - 0.03 * fall * fall : (() => { const s = t - firstLand; return 1 + 0.05 * Math.exp(-5 * s) * Math.sin(2 * Math.PI * 2.2 * s) - 0.03 * Math.exp(-12 * s); })();
    for (let k = 0; k < NV; k++) {
      let y;
      if (TL[k] < 0) {
        y = ys + billow * (1 - R2[k]) * fall + flap * (1 - fall) * Math.sin(X[k] / S * 9 + t * 6) * Math.sin(Z[k] / S * 7 - t * 5);
        if (y <= F[k]) { TL[k] = t; if (firstLand < 0) firstLand = t; y = F[k]; }
      } else { const s = t - TL[k]; y = F[k] + bounce * Math.abs(Math.sin(2 * Math.PI * 2.4 * s)) * Math.exp(-4.5 * s); }
      pos[3 * k] = cxm + (X[k] - cxm) * sq; pos[3 * k + 1] = y; pos[3 * k + 2] = czm + (Z[k] - czm) * sq;
    }
    P.needsUpdate = true; G.computeVertexNormals();
    if (!shown && firstLand >= 0) { shown = true; show(); }
    u.fade.value = Math.max(0, Math.min(1, (t - TIMES.fadeStart) / TIMES.fade));
    if (t >= TIMES.fadeStart + TIMES.fade) { if (!shown) show(); finish(); return; }
    ctx.draw();
  };
  if (!ctx.__revealHook) { ctx.__revealHook = true; ctx.onFrame(() => { for (const s of [...active]) s.update(); }); }
  active.add(sheet); STATS.started++;
  STATS.last = { label, how, size: [Math.round(W), Math.round(D)], drawing: [cw, ch], grid: [nx, nz], fallFrom: Math.round(H0), prepMs: Math.round(performance.now() - t0) };
  sheet.update();
  return done;
}
