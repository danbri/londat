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

// water: colour by depth (docklands/water.js: the depth map from the UKHO soundings and the dock beds), fresnel (Schlick,
// water F0 = 0.02), the sun's glint from the lights' specular (low roughness, wider with the wind and far away), and a
// reflection: the mirror of layers/water.js (TSL reflector, set with m.setReflector) where it is on, else the sky by a
// gradient (day, U.night). The surface normal (2026-10-09; data and uniforms in water.js surfaceData, SU; wind, current and
// test wakes from layers/wind.js):
//   - wind waves: four bands of a tiling wave-field texture (wavelengths 0.3, 0.8, 2 and 5 m, each turned a little and
//     moving downwind at its deep-water phase speed), weighted round the peak wavelength of a fetch-limited sea (JONSWAP:
//     g Tp / U = 0.286 (g F / U^2)^(1/3), F = the fetch of the cell for the wind direction now), slope rising with the wind
//     speed; moving cat's-paw patches (a 60 m band moving downwind at 0.6 U) raise the ripples and darken the reflection;
//   - the current (tidal water only): the wind bands and a "boil" band (slope by the current speed) advected along the flow
//     field with a two-phase flow map (two samples 2.5 s apart in phase, cross-faded, so the pattern never stretches);
//   - walls: the two long wind bands again at the point mirrored across the nearest water edge (gradient mirrored), by the
//     edge's reflectivity and incidence, fading over 18 m: a crossing pattern by quay walls, little by a natural foreshore;
//     shallow water (depth now under 1.5 m) damps everything;
//   - boat wakes (water.js wakeA/wakeB, MAXW slots, a slot with speed 0 costs one test): an analytic Kelvin wake per boat:
//     transverse and divergent waves by stationary phase inside the 19.47 degree wedge behind the bow, k0 = g / U^2,
//     height 0.0009 L U^2 / g, fading with distance and over a length 35 U + 5 L (700 m at most), components finer than
//     about a pixel faded out; a ring from the acceleration; propeller wash as foam behind the stern; and the same wake
//     mirrored at a wall within 40 m.
// About 18 texture reads a pixel. One graph for WebGPU and WebGL 2. Skill: docklands-3d-page, "Three.js port".
import { Loop, cos, sqrt, log } from 'three/tsl';
import { surfaceData, SU, MAXW, wakeA, wakeB } from './water.js';
const wrap = q => q.sub(floor(q.div(256)).mul(256));   // the hash keeps its precision far from the origin and as time grows
const vnw = Fn(([q]) => { const i = floor(q), f0 = fract(q), f = f0.mul(f0).mul(float(3).sub(f0.mul(2))), a = wrap(i), b = wrap(i.add(1));
  return mix(mix(h(a), h(vec2(b.x, a.y)), f.x), mix(h(vec2(a.x, b.y)), h(b), f.x), f.y); });
const GRAV = 9.81;
// one band of the wave field: the slope (world x, z) of the tiling texture at wavelength lam m, in a frame turned rot rad
// from ax (unit: the direction the waves travel), moving along it at the deep-water phase speed (move = false: still);
// ch 0 = the directional pair (RG), 1 = the isotropic pair (BA). The time offset is taken modulo one tile (no drift in precision).
function band(NT, pp, ax, lam, { rot = 0, jit = 0, ch = 0, move = true } = {}) {
  const c = Math.cos(rot), s = Math.sin(rot), a = vec2(ax.x.mul(c).sub(ax.y.mul(s)), ax.x.mul(s).add(ax.y.mul(c))), b = vec2(a.y.negate(), a.x), tile = lam * 10;
  let q = vec2(dot(pp, a), dot(pp, b)).div(tile).add(vec2(jit, jit * 0.37));
  if (move) q = q.sub(vec2(fract(time.mul(Math.sqrt(GRAV * lam / (2 * Math.PI)) / tile)), 0));
  const t = texture(NT, q), g = (ch ? t.ba : t.rg).mul(6).sub(3);
  return a.mul(g.x).add(b.mul(g.y));
}
const BANDS = [[0.3, 0.5, 0.11], [0.8, -0.3, 0.53], [2.0, 0.2, 0.29], [5.0, -0.12, 0.71]];   // [wavelength m, turn rad, jitter]
// the Kelvin wake of one boat (slot a, b) at q: vec3(slope x, slope z, foam)
function kelvin(q, a, b, fw) {
  const U = a.w, L = max(b.x, 2), dir = vec2(sin(a.z), cos(a.z).negate()), side = vec2(dir.y.negate(), dir.x);
  const r0 = q.sub(a.xy), R0 = length(r0), Lw = min(U.mul(35).add(L.mul(5)), 700);
  const xb = dot(r0, dir).negate().add(L.mul(0.5)), yl = dot(r0, side), ya = abs(yl), sy = select(yl.lessThan(0), float(-1), float(1));
  const t = min(ya.div(max(xb, 0.5)), 0.3535), disc = max(float(1).sub(t.mul(t).mul(8)), 0), sq = sqrt(disc), t4 = max(t.mul(4), 0.0001);
  const k0 = float(GRAV).div(max(U.mul(U), 0.25));
  const env = L.mul(U).mul(U).mul(0.0009 / GRAV / 2).mul(inverseSqrtN(max(xb.div(L).add(1), 1))).mul(smoothstep(Lw, Lw.mul(0.5), xb)).mul(smoothstep(0, L.mul(0.25), xb))
    .mul(smoothstep(0, 0.1, disc)).mul(min(pow(max(disc, 0.03), -0.25), 2.2)).mul(step(ya, xb.mul(0.36)));
  const comp = (T, w) => { const c2 = float(1).add(T.mul(T)), sc = sqrt(c2), cth = float(1).div(sc), sth = T.mul(cth), k = k0.mul(c2);
    const ph = k0.mul(xb).mul(float(1).add(t.mul(T))).mul(sc);
    return dir.negate().mul(cth).add(side.mul(sy.mul(sth))).mul(k.mul(sin(ph)).mul(-w).mul(smoothstep(2.2, 0.8, k.mul(fw)))); };
  let g = comp(float(1).sub(sq).div(t4), 0.6).add(comp(min(float(1).add(sq).div(t4), 6), 1)).mul(env);
  // a ring from the acceleration (bow wave building, stern settling): wavelength 0.6 L, 0.004 |a| L high
  const kA = float(2 * Math.PI).div(L.mul(0.6)), phA = kA.mul(R0).sub(sqrt(kA.mul(GRAV)).mul(time));
  g = g.add(r0.div(max(R0, 0.1)).mul(kA.mul(sin(phA)).mul(abs(b.y).mul(L).mul(-0.004)).mul(exp(R0.div(L.mul(-1.5)))).mul(smoothstep(2.2, 0.8, kA.mul(fw)))));
  // propeller wash behind the stern, widening
  const wv = L.mul(0.08).add(xb.mul(0.03));
  const foam = smoothstep(wv, wv.mul(0.3), ya).mul(smoothstep(L.mul(0.6), L, xb)).mul(exp(xb.sub(L).div(L.mul(-4)))).mul(min(U.div(5), 1)).mul(0.8);
  return vec3(g, foam);
}
const inverseSqrtN = x => float(1).div(sqrt(x));
// all wakes at p, and their image across the wall (pM, by mirror n with weight mw, only when mw > 0)
const wakeAt = Fn(([p, fw0, pM0, n0, mw0]) => {
  // evaluated before the loop: in uniform control flow (fwidth, texture reads), once
  const fw = fw0.toVar(), pM = pM0.toVar(), n = n0.toVar(), mw = mw0.toVar(), acc = vec3(0, 0, 0).toVar();
  Loop(MAXW, ({ i }) => {
    const a = wakeA.element(i), b = wakeB.element(i);
    If(a.w.greaterThan(0.05), () => {
      If(length(p.sub(a.xy)).lessThan(min(a.w.mul(35).add(b.x.mul(5)), 700).add(b.x).add(40)), () => {
        acc.addAssign(kelvin(p, a, b, fw));
        If(mw.greaterThan(0.01), () => { const r = kelvin(pM, a, b, fw).xy; acc.addAssign(vec3(r.sub(n.mul(dot(r, n).mul(2))).mul(mw), 0)); });
      });
    });
  });
  return acc;
});

export function waterMaterial(opts = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.05, metalness: 0.0, side: THREE.DoubleSide });
  const D = waterDepth(), S = surfaceData(), NT = S.noiseTex, p = positionWorld.xz;
  const duv = p.sub(vec2(D.x0, D.z0)).div(vec2(D.w, D.h));
  const depth = texture(D.tex, duv).x.mul(DEPTH.scale), fd = texture(S.flowTex, duv), wd = texture(S.wallTex, duv);
  const toCam = cameraPosition.sub(positionWorld), dist = length(toCam), V = toCam.div(max(dist, 0.001));
  const fw = length(fwidth(p));   // metres a pixel
  // wind: downwind unit vector (WU.windDir is where it blows FROM, grid north = -z) and the fetch-limited peak wavelength
  const wr = WU.windDir.mul(Math.PI / 180), dw = vec2(sin(wr).negate(), cos(wr)), Ws = max(WU.windSpeed, 0), F = max(fd.b.mul(2550), 30);
  const Tp = pow(F.mul(GRAV).div(Ws.mul(Ws).add(0.25)), 1 / 3).mul(0.286).mul(Ws).div(GRAV), Lp = clamp(Tp.mul(Tp).mul(1.56), 0.25, 9);
  const wts = BANDS.map(([lam]) => { const l = log(float(lam).div(Lp)); return exp(l.mul(l).mul(-1 / (2 * 0.55 * 0.55))).add(0.04); });
  const wsum = wts.reduce((s, w) => s.add(w));
  // cat's paws: a 60 m band of the isotropic field moving downwind at 0.6 U
  const pat = texture(NT, p.div(600).sub(fract(dw.mul(Ws.mul(0.6).mul(time).div(600))))).b.mul(6).sub(3);
  const patch = smoothstep(0.2, 1.0, pat).mul(smoothstep(0.5, 2, Ws)), ampMod = float(1).add(SU.gust.mul(patch.mul(1.6).sub(0.4)));
  const sw = min(Ws.mul(0.013), 0.2).mul(mix(0.55, 1, smoothstep(40, 1200, F))).mul(smoothstep(0.4, 2, Ws)).add(0.006).mul(ampMod).div(wsum);
  // the current: flow field x SU.current (m/s, + downstream), tidal water only, slower in the shallows
  const tidal = fd.a, depthNow = max(depth.add(tidal.mul(WU.tideLevel.sub(2.75))), 0);
  const fv = fd.rg.mul(255 / 127).sub(128 / 127).mul(1.5).mul(SU.current).mul(tidal).mul(smoothstep(0.2, 3, depthNow));
  const FT = 5, ph1 = fract(time.div(FT)), ph2 = fract(time.div(FT).add(0.5)), wA = float(1).sub(abs(ph1.mul(2).sub(1)));
  const pA = p.sub(fv.mul(ph1.sub(0.5).mul(FT))), pB = p.sub(fv.mul(ph2.sub(0.5).mul(FT))).add(vec2(23.7, 41.3));
  const boil = length(fv).mul(0.07);
  const field = pp => BANDS.reduce((s, [lam, rot, jit], k) => s.add(band(NT, pp, dw, lam, { rot, jit }).mul(wts[k])), vec2(0, 0)).mul(sw)
    .add(band(NT, pp, vec2(1, 0), 3.0, { ch: 1, move: false, jit: 0.21 }).mul(boil));
  let g = field(pA).mul(wA).add(field(pB).mul(float(1).sub(wA)));
  // the wall: the long bands at the mirrored point, gradient mirrored
  const wn0 = wd.rg.mul(255 / 127).sub(128 / 127), wn = wn0.div(max(length(wn0), 0.01)), wdist = wd.b.mul(63.75), wR = wd.a;
  const img = pp => BANDS.slice(2).reduce((s, [lam, rot, jit], k) => s.add(band(NT, pp.sub(wn.mul(wdist.mul(2))), dw, lam, { rot, jit }).mul(wts[k + 2])), vec2(0, 0)).mul(sw);
  const gi = img(pA).mul(wA).add(img(pB).mul(float(1).sub(wA)));
  const iw = wR.mul(exp(wdist.div(-18))).mul(sqrt(clamp(dot(dw, wn.negate()), 0, 1))).mul(step(wdist, 63));
  g = g.add(gi.sub(wn.mul(dot(gi, wn).mul(2))).mul(iw));
  const damp = smoothstep(0.1, 1.5, depthNow);
  g = g.mul(damp).mul(WU.ripple);
  // boat wakes, with their image at a wall within 40 m (reflectivity over 0.3)
  const wk = wakeAt(p, fw, p.sub(wn.mul(wdist.mul(2))), wn, wR.mul(exp(wdist.div(-25))).mul(step(0.3, wR)).mul(step(wdist, 40)));
  g = g.add(wk.xy.mul(mix(0.3, 1, damp)).mul(2.5));   // visual gain 2.5 on the wake slopes (stated)
  const foam = clamp(wk.z, 0, 1);
  const N = normalize(vec3(g.x.negate(), 1, g.y.negate()));
  m.normalNode = transformNormalToView(N);
  // far water: a wider glint where the ripples are under a pixel, wider with the wind; foam and cat's paws rough
  m.roughnessNode = float(0.04).add(smoothstep(2, 30, fw).mul(0.18)).add(min(Ws.mul(0.012), 0.14).mul(smoothstep(0.3, 4, fw))).add(foam.mul(0.4)).add(patch.mul(SU.gust).mul(0.06));
  const F0 = float(0.02).add(float(0.98).mul(pow(float(1).sub(clamp(dot(N, V), 0, 1)), 5)));
  // the water's own colour by the depth now (tidal: + WU.tideLevel - 2.75 m, the typical polygon level), deeper = darker and more green-blue (sRGB 0.33 0.45 0.43 at 0 m to 0.04 0.14 0.17 deep); foam pale
  const body = mix(lin(mix(vec3(0.33, 0.45, 0.43), vec3(0.04, 0.14, 0.17), float(1).sub(exp(depthNow.div(-3.5))))), lin(vec3(0.60, 0.67, 0.65)), foam.mul(0.55));
  m.colorNode = vec4(body.mul(float(1).sub(F0.mul(float(1).sub(foam)))), 1);
  const R = reflect(V.negate(), N), ry = clamp(R.y, 0, 1);
  const sky = mix(mix(vec3(WU.skyHorizon), vec3(WU.skyZenith), pow(ry, 0.6)), mix(lin(vec3(U.haze)).mul(0.8), vec3(0.003, 0.004, 0.008), pow(ry, 0.5)), U.night);
  const dark = float(1).sub(patch.mul(SU.gust).mul(0.3)).mul(float(1).sub(foam.mul(0.8)));   // cat's paws darker, foam no mirror
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
    m.emissiveNode = refl.mul(F0).mul(dark); WU.reflect.value = r ? 1 : 0; m.needsUpdate = true;
  };
  m.setReflector(opts.reflector || null);
  return m;
}

export function vertexColourMaterial(opts = {}) {
  const { cut, ...rest } = opts, m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide, ...rest });
  m.colorNode = opts.cut === false ? lin(attribute('color', 'vec3')) : Fn(() => { If(positionWorld.y.greaterThan(U.cut), () => { Discard(); }); return lin(attribute('color', 'vec3')); })();
  return m;
}
