// Materials of the Three.js port of the Docklands 3D page, in TSL (three.js Shading Language): one node graph compiles to
// WGSL on the WebGPU backend and to GLSL ES 3.0 on the WebGL 2 backend. The building material is the facade program of
// index.html (ffs): the window grid by day; by night lit windows by building use (offices in floor bands, homes warm in
// clusters), One Canada Square's halo, Newfoundland's diagrid crown and a band at the top of other towers, as emissive
// light, so the bloom pass picks them up. Skill: docklands-3d-page, "Three.js port".
import * as THREE from 'three/webgpu';
import { If, Discard, Fn, attribute, positionWorld, cameraPosition, uniform, float, vec2, vec3, vec4, floor, fract, sin, dot, step, smoothstep, mix, clamp, max, min, abs, length, fwidth, select, exp, texture, uv, time, sRGBTransferEOTF, normalize, pow, reflect, transformNormalToView, screenUV } from 'three/tsl';
import { waterDepth, WU, DEPTH } from './water.js';

export const U = {
  night: uniform(0),              // 0 day, 1 night: the windows' light
  winGain: uniform(1.5),          // emissive strength of a lit window
  crown: uniform(new THREE.Color(0.62, 0.58, 0.52)),   // One Canada Square's halo: index.html CROWN.NEUTRAL (the WebGL page picks a campaign colour by date; not ported)
  crownOn: uniform(1),
  haze: uniform(new THREE.Color(0.085, 0.07, 0.058)),
  groundTex: uniform(0),          // 1: the terrain shows the ground image
  cut: uniform(1e9),              // m OD: buildings and structures above it are cut away (the below-ground view; layers/under.js sets it)
};

const h = Fn(([q]) => fract(sin(dot(q, vec2(12.9898, 78.233))).mul(43758.5453)));
const vn = Fn(([q]) => { const i = floor(q), f0 = fract(q), f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return mix(mix(h(i), h(i.add(vec2(1, 0))), f.x), mix(h(i.add(vec2(0, 1))), h(i.add(vec2(1, 1))), f.x), f.y); });
const lin = c => sRGBTransferEOTF(c);   // the data colours are sRGB; the node pipeline lights in linear

export function buildingMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide, flatShading: true });
  const col = attribute('col', 'vec4'), uw = attribute('uw', 'float'), gk = attribute('gk', 'vec4');
  const wy = positionWorld.y, dist = length(cameraPosition.sub(positionWorld)), wall = step(0, uw);

  // by day: the map style's window grid (3.6 m storeys, 1.8 m bays), fading with distance
  m.colorNode = Fn(() => {
    If(wy.greaterThan(U.cut), () => { Discard(); });
    const base = col.rgb, lum = dot(base, vec3(0.33));
    const g = vec2(uw.div(1.8), wy.div(3.6)), cell = floor(g), f = fract(g);
    const w = step(0.14, f.x).mul(step(f.x, 0.86)).mul(step(0.2, f.y)).mul(step(f.y, 0.84)).mul(clamp(float(1.4).sub(dist.div(900)), 0.15, 1));
    const glass = mix(vec3(0.13, 0.18, 0.25), vec3(0.42, 0.52, 0.62), clamp(wy.div(300), 0, 1).add(h(cell).mul(0.12))).mul(lum.mul(0.7).add(0.55));
    const day = mix(base, glass, w.mul(0.8).mul(wall));
    return vec4(lin(day), 1);
  })();

  // by night: windows, crowns and haze as emitted light (index.html nightCol)
  m.emissiveNode = Fn(() => {
    const ty = floor(gk.w.div(1000).add(0.001)), top = gk.w.sub(ty.mul(1000)), ht = max(1, top.sub(gk.z)), sd = h(floor(gk.xy).mul(0.0137).add(0.31));
    const gg = vec2(uw.div(1.8), wy.sub(gk.z).div(3.6)), cell = floor(gg), f = fract(gg), fl = cell.y;
    const off = step(1.5, ty).mul(step(ty, 2.5));
    const fw2 = fwidth(gg), fwm = max(fw2.x, fw2.y), f2 = smoothstep(0.5, 1.3, fw2);
    let wm = mix(step(0.16, f.x).mul(step(f.x, 0.84)).mul(step(0.22, f.y)).mul(step(f.y, 0.82)), step(0.06, f.x).mul(step(f.x, 0.94)).mul(step(0.16, f.y)).mul(step(f.y, 0.82)), off);
    wm = mix(wm, mix(0.6, 0.7, off), smoothstep(0.35, 0.9, fwm));
    // offices: whole floors lit (36% of floors) in cool white, a few windows on the dark floors
    const lf = step(h(vec2(fl, sd.mul(13))), 0.36), sg = h(vec2(floor(cell.x.div(9)), fl).add(sd.mul(5)));
    const litO = lf.mul(step(0.22, sg)).add(float(1).sub(lf).mul(step(0.94, sg)));
    const Lc = mix(vec3(0.74, 0.84, 1), vec3(0.95, 0.96, 0.92), h(vec2(fl, 2).add(sd)));
    let LO = Lc.mul(h(vec2(floor(cell.x.div(9)), fl)).mul(0.25).add(0.6)).mul(litO);
    LO = mix(LO, Lc.mul(0.725).mul(lf.mul(0.78).add(float(1).sub(lf).mul(0.06))), f2.x);
    LO = mix(LO, vec3(0.195, 0.208, 0.222), f2.y);
    // homes, hotels and the rest: warm, in clusters of flats
    const fid = floor(cell.x.add(floor(h(vec2(fl, sd)).mul(3))).div(3));
    const p = select(ty.greaterThan(2.5), float(0.45), select(ty.greaterThan(0.5), float(0.33), float(0.24))).mul(select(ht.lessThan(30), float(0.7), float(1)));
    const pl = clamp(p.add(vn(vec2(cell.x.div(7), fl.div(3)).add(sd.mul(41))).sub(0.5).mul(1.1)), 0, 1);
    const litH = step(h(vec2(fid, fl).add(sd.mul(31))), pl).mul(step(0.15, h(cell.add(sd.mul(7)))));
    let LH = mix(vec3(1, 0.74, 0.46), vec3(1, 0.9, 0.66), h(vec2(fid, fl).add(3.1)));
    LH = select(h(vec2(fid, fl).add(5.7)).lessThan(0.05), vec3(0.7, 0.8, 1), LH);
    LH = mix(LH.mul(h(cell.add(1.7)).mul(0.5).add(0.7)).mul(litH), vec3(0.93, 0.78, 0.55).mul(p).mul(0.5), clamp(fwm, 0, 1));
    let L = mix(LH, LO, off).mul(wm).mul(wall);
    // tops: Newfoundland's diagrid crown (use 4), One Canada Square's halo (use 5), a soft band on other towers over 90 m
    const tb = top.sub(wy);
    const tri = abs(fract(uw.div(9)).mul(2).sub(1)), yy = float(1).sub(tb.div(13)), ln = min(abs(tri.sub(yy)), abs(tri.sub(float(1).sub(yy))));
    const nf = step(3.5, ty).mul(step(ty, 4.5)).mul(step(tb, 13)).mul(step(0, tb)).mul(wall);
    L = mix(L, vec3(1, 0.9, 0.7).mul(smoothstep(0.04, 0.12, ln)), nf);
    const ocs = step(4.5, ty).mul(step(tb, 7)).mul(step(0, tb)).mul(wall).mul(U.crownOn);
    L = mix(L, vec3(U.crown).mul(1.4), ocs);
    const band = step(90, ht).mul(step(tb, 3.5)).mul(step(0, tb)).mul(step(ty, 3.5)).mul(wall);
    L = L.add(vec3(0.32, 0.3, 0.27).mul(smoothstep(3.5, 0.5, tb)).mul(band));
    // haze in the colour of the sky glow
    const hz = float(1).sub(exp(dist.div(-5200))).mul(0.6);
    return lin(L.mul(U.winGain).add(vec3(U.haze).mul(hz).mul(0.6))).mul(U.night);
  })();
  return m;
}

// terrain: the ground colour, or a ground image (aerial 2008, night 2012, LiDAR intensity 2020) through its box
export function terrainMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  m.userData.map = null;
  m.setGround = tex => {
    m.userData.map = tex; const g = vec3(0.38, 0.41, 0.4);
    m.colorNode = tex ? lin(texture(tex, uv()).rgb.mul(1.15)) : lin(g);
    m.needsUpdate = true;
  };
  m.setGround(null);
  return m;
}

// water: colour by depth (docklands/water.js: the depth map from the UKHO soundings and the dock beds), moving ripples
// (two octaves of value noise with time, as normals; they fade out with distance, 40 to 450 m, before they are under a pixel), fresnel (Schlick,
// water F0 = 0.02), the sun's glint from the lights' specular (low roughness), and a reflection: the mirror of
// layers/water.js (TSL reflector, set with m.setReflector) where it is on, else the sky by a gradient (day, U.night).
// One graph for WebGPU and WebGL 2. Skill: docklands-3d-page, "Three.js port".
const wrap = q => q.sub(floor(q.div(256)).mul(256));   // the hash keeps its precision far from the origin and as time grows
const vnw = Fn(([q]) => { const i = floor(q), f0 = fract(q), f = f0.mul(f0).mul(float(3).sub(f0.mul(2))), a = wrap(i), b = wrap(i.add(1));
  return mix(mix(h(a), h(vec2(b.x, a.y)), f.x), mix(h(vec2(a.x, b.y)), h(b), f.x), f.y); });
// gradient of one octave of the height field at p (m), wavelength 1 / s m, moving with v (cells a second)
const octave = (p, s, v, e) => { const q = p.mul(s).add(time.mul(v)), h0 = vnw(q); return vec2(vnw(q.add(vec2(e * s, 0))).sub(h0), vnw(q.add(vec2(0, e * s))).sub(h0)).div(e); };
export function waterMaterial(opts = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.05, metalness: 0.0, side: THREE.DoubleSide });
  const D = waterDepth(), p = positionWorld.xz;
  const depth = texture(D.tex, p.sub(vec2(D.x0, D.z0)).div(vec2(D.w, D.h))).x.mul(DEPTH.scale);
  const toCam = cameraPosition.sub(positionWorld), dist = length(toCam), V = toCam.div(max(dist, 0.001));
  const fw = length(fwidth(p));   // metres a pixel
  const g = octave(p, 0.16, vec2(0.45, 0.3), 0.4).mul(smoothstep(450, 120, dist)).mul(0.35)
    .add(octave(p, 0.55, vec2(-0.7, 0.55), 0.15).mul(smoothstep(140, 40, dist)).mul(0.14)).mul(WU.ripple);
  const N = normalize(vec3(g.x.negate(), 1, g.y.negate()));
  m.normalNode = transformNormalToView(N);
  m.roughnessNode = float(0.05).add(smoothstep(2, 30, fw).mul(0.2));   // far water: a wider glint where the ripples are under a pixel
  const F = float(0.02).add(float(0.98).mul(pow(float(1).sub(clamp(dot(N, V), 0, 1)), 5)));
  // the water's own colour, deeper = darker and more green-blue (sRGB 0.33 0.45 0.43 at 0 m to 0.04 0.14 0.17 deep)
  const body = lin(mix(vec3(0.33, 0.45, 0.43), vec3(0.04, 0.14, 0.17), float(1).sub(exp(depth.div(-3.5)))));
  m.colorNode = vec4(body.mul(float(1).sub(F)), 1);
  const R = reflect(V.negate(), N), ry = clamp(R.y, 0, 1);
  const sky = mix(mix(vec3(WU.skyHorizon), vec3(WU.skyZenith), pow(ry, 0.6)), mix(lin(vec3(U.haze)).mul(0.8), vec3(0.003, 0.004, 0.008), pow(ry, 0.5)), U.night);
  m.setReflector = r => {
    let refl = sky;
    // ripples stretch reflected lights into vertical streaks (as on a real river at night): seven samples of the mirror along
    // screen y (a streak about 4 % of the screen high, weighted to its middle), shifted a little by screen-space noise. A crisp
    // mirror read as a copy of the city; one displaced sample broke the window rows into zigzags (2026-10-08)
    if (r) {
      const st = vnw(vec2(screenUV.x.mul(160), screenUV.y.mul(6).add(time.mul(0.25)))).sub(0.5);
      const base = r.uvNode.add(vec2(N.x.mul(clamp(float(6).div(dist), 0.002, 0.02)), st.mul(0.006)));
      let acc = null, wsum = 0;
      for (let k = -3; k <= 3; k++) { const w = 4 - Math.abs(k), smp = r.sample(base.add(vec2(0, k * 0.0065))).rgb.mul(w); acc = acc ? acc.add(smp) : smp; wsum += w; }
      refl = acc.div(wsum).mul(0.75);
    }
    m.emissiveNode = refl.mul(F); WU.reflect.value = r ? 1 : 0; m.needsUpdate = true;
  };
  m.setReflector(opts.reflector || null);
  return m;
}

export function vertexColourMaterial(opts = {}) {
  const { cut, ...rest } = opts, m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide, ...rest });
  m.colorNode = opts.cut === false ? lin(attribute('color', 'vec3')) : Fn(() => { If(positionWorld.y.greaterThan(U.cut), () => { Discard(); }); return lin(attribute('color', 'vec3')); })();
  return m;
}
