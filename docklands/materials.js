// Materials of the Three.js port of the Docklands 3D page, in TSL (three.js Shading Language): one node graph compiles to
// WGSL on the WebGPU backend and to GLSL ES 3.0 on the WebGL 2 backend. The building material is the facade program of
// index.html (ffs): the window grid by day; by night lit windows by building use (offices in floor bands, homes warm in
// clusters), One Canada Square's halo, Newfoundland's diagrid crown and a band at the top of other towers, as emissive
// light, so the bloom pass picks them up. Skill: docklands-3d-page, "Three.js port".
import * as THREE from 'three/webgpu';
import { Fn, attribute, positionWorld, cameraPosition, uniform, float, vec2, vec3, vec4, floor, fract, sin, dot, step, smoothstep, mix, clamp, max, min, abs, length, fwidth, select, exp, texture, uv, time, sRGBTransferEOTF } from 'three/tsl';

export const U = {
  night: uniform(0),              // 0 day, 1 night: the windows' light
  winGain: uniform(1.5),          // emissive strength of a lit window
  crown: uniform(new THREE.Color(0.62, 0.58, 0.52)),   // One Canada Square's halo: index.html CROWN.NEUTRAL (the WebGL page picks a campaign colour by date; not ported)
  crownOn: uniform(1),
  haze: uniform(new THREE.Color(0.085, 0.07, 0.058)),
  groundTex: uniform(0),          // 1: the terrain shows the ground image
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

// water: a dark glossy surface with a small moving ripple in the normal (WebGPU and WebGL 2 alike)
export function waterMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.0, side: THREE.DoubleSide });
  m.colorNode = lin(vec3(0.16, 0.36, 0.5));
  const p = positionWorld.xz;
  const n = vn(p.mul(0.08).add(vec2(time.mul(0.3), time.mul(0.2)))).sub(0.5).mul(0.12).add(vn(p.mul(0.31).sub(vec2(time.mul(0.5), 0))).sub(0.5).mul(0.06));
  m.roughnessNode = float(0.1).add(n.abs());
  return m;
}

export function vertexColourMaterial(opts = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide, ...opts });
  m.colorNode = lin(attribute('color', 'vec3'));
  return m;
}
