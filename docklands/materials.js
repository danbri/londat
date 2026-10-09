// Materials of the Three.js port of the Docklands 3D page, in TSL (three.js Shading Language): one node graph compiles to
// WGSL on the WebGPU backend and to GLSL ES 3.0 on the WebGL 2 backend. The building material is the facade program of
// index.html (ffs): by day the photo facade tiles, the Realistic look's walls and the Map window grid; by night lit windows
// by building use (offices in floor bands, homes warm in clusters), shopfronts, One Canada Square's halo in the colour of
// the evening, Newfoundland's diagrid crown and a band at the top of other towers, as emissive light, so the bloom pass
// picks them up. Skill: docklands-3d-page, "Three.js port".
import * as THREE from 'three/webgpu';
import { If, Discard, Fn, attribute, positionWorld, cameraPosition, uniform, float, vec2, vec3, vec4, floor, fract, sin, dot, step, smoothstep, mix, clamp, max, min, abs, length, fwidth, select, exp, texture, uv, time, sRGBTransferEOTF, normalize, pow, reflect, transformNormalToView, screenUV, uniformArray, int, log2, exp2, mod, dFdx, dFdy } from 'three/tsl';
import { waterDepth, WU, DEPTH } from './water.js';

export const U = {
  night: uniform(0),              // 0 day, 1 night: the windows' light
  dataColour: uniform(0),         // 1 while a data colour mode colours the buildings (layers/overlays.js): no lit windows
  winGain: uniform(1.5),          // emissive strength of a lit window
  crown: uniform(new THREE.Color(0.62, 0.58, 0.52)),   // One Canada Square's halo: index.html CROWN.NEUTRAL until crown.js sets the colour of the evening
  crownOn: uniform(1),            // 0: the halo is not lit that evening (an observation says so)
  crownPyr: uniform(0),           // 1: the pyramid faces are lit too (index.html night.x 2)
  haze: uniform(new THREE.Color(0.085, 0.07, 0.058)),
  groundTex: uniform(0),          // 1: the terrain shows the ground image
  cut: uniform(1e9),              // m OD: buildings and structures above it are cut away (the below-ground view; layers/under.js sets it)
};

const h = Fn(([q]) => fract(sin(dot(q, vec2(12.9898, 78.233))).mul(43758.5453)));
const vn = Fn(([q]) => { const i = floor(q), f0 = fract(q), f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return mix(mix(h(i), h(i.add(vec2(1, 0))), f.x), mix(h(i.add(vec2(0, 1))), h(i.add(vec2(1, 1))), f.x), f.y); });
const lin = c => sRGBTransferEOTF(c);   // the data colours are sRGB; the node pipeline lights in linear

// The building material: index.html's facade program (ffs) in TSL. Per vertex: col (rgb = the data, the Realistic or the
// photo-tile colour; the alpha byte is a code: 100 + slot = a photo facade tile, 132 + code = a Realistic building (style x
// 8 + shopfront x 4 + storey class), else the Map look), uw (metres along the wall; < 0 on roofs), gk (centre x, centre z,
// base m OD, 1000 x night use + top m OD).
//   - by day: the photo tile (facades.jpg, 8 x 4 tiles of 256 px, repeated by the tile size in metres; the mip level from
//     the derivatives of the unwrapped tile coordinate, not of fract(); inset half a texel of that level), or the Realistic
//     wall (lookSet, lookWall: mottling, grime, coping, windows by style, shopfronts, doors, curtain walls, sheds), else the
//     Map window grid;
//   - by night (emissive, so the bloom picks it up): lit windows by use on the bays and storeys of the style, shopfronts,
//     a photo tile faintly under the windows, crowns (One Canada Square's halo in the colour of the evening: U.crown,
//     U.crownOn, U.crownPyr, set by crown.js), haze.
// Every value that more than one branch reads, and every derivative, is made a variable at the top of the function, before
// any branch (WGSL allows derivatives only in uniform control flow; the WebGL page found them noisy inside a branch); the
// tile is read with an explicit level.
const LOOK_BAY = [[2.3, 2.6, .23], [3, 2.7, .23], [3.3, 2.6, .23], [1.6, 3.3, .33], [1.5, 3.3, .33], [1.5, 3.5, .33], [1, 4, 1.3], [3.4, 3.3, .43]];   // tools/build-materials.mjs STYLES: bay m, storey m, storey class step m
const LOOK_WIN = [[.30, .70, .32, .80], [.20, .80, .30, .78], [.08, .92, .34, .80], [.22, .78, .16, .86], [0, 1, .40, .88], [0, 1, .14, 1], [0, 0, 0, 0], [.12, .88, .18, .86]];   // window box in the bay (x0, x1, y0, y1)
const byStyle = (st, T) => { const V = T[0].length === 4 ? vec4 : vec3; let n = V(...T[7]); for (let i = 6; i >= 0; i--) n = select(st.lessThan(i + .5), V(...T[i]), n); return n; };
export const FAC = { slots: uniformArray(Array.from({ length: 32 }, () => new THREE.Vector4(10, 10, 0, 0)), 'vec4'), tex: null };   // photo facade tile sizes (w_m, h_m) by slot; the atlas texture

// the per-fragment values of the facade program (fresh nodes for each function that calls it)
function facadeCommon() {
  const col = attribute('col', 'vec4'), uw = attribute('uw', 'float'), gk = attribute('gk', 'vec4');
  const wy = positionWorld.y, base = col.rgb, a8 = col.a.mul(255), seed = floor(gk.xy);
  // lookSet: a Realistic building's bay, storey, shopfront height and style (1.8, 3.6, 0, -1 for every other vertex)
  const isLook = a8.greaterThan(131.5).and(a8.lessThan(195.5)), lk = floor(a8.sub(132).add(0.5)), st = floor(lk.div(8).add(0.001)), rr = lk.sub(st.mul(8)), sh = step(3.5, rr), cl = rr.sub(sh.mul(4));
  const SB = byStyle(st, LOOK_BAY), FHl = SB.y.add(SB.z.mul(cl));
  const BW = select(isLook, SB.x.mul(select(st.greaterThan(2.5).and(st.lessThan(6.5)), float(1), h(seed.mul(0.0137).add(0.71)).mul(0.2).add(0.9))), float(1.8));
  const FH = select(isLook, FHl, float(3.6)), GF = select(isLook, sh.mul(max(3.8, FHl.mul(1.2))), float(0)), LST = select(isLook, st, float(-1));
  // the photo facade tile
  const fac = FAC.tex ? select(a8.greaterThan(99.5).and(a8.lessThan(131.5)).and(uw.greaterThanEqual(0)), float(1), float(0)) : float(0);
  let tile = vec3(0);
  if (FAC.tex) {
    const sl = clamp(floor(a8.sub(100).add(0.5)), 0, 31), S2 = FAC.slots.element(int(sl));
    const tc = vec2(uw.div(S2.x), wy.div(S2.y)), tp = tc.mul(256), lod = clamp(log2(max(max(length(dFdx(tp)), length(dFdy(tp))), 1e-4)), 0, 8);
    const e = exp2(floor(lod).add(1)).mul(0.5), q = fract(tc), stc = vec2(mod(sl, 8), floor(sl.div(8))), span = float(256).sub(e.mul(2));
    const tuv = vec2(stc.x.mul(256).add(e).add(q.x.mul(span)).div(2048), float(1).sub(stc.y.mul(256).add(e).add(float(1).sub(q.y).mul(span)).div(1024)));   // the atlas is uploaded with flipY: v = 1 - row / 1024
    tile = texture(FAC.tex, tuv).level(lod).rgb;   // linear (the texture is sRGB)
  }
  return { uw, gk, wy, base, lum: dot(base, vec3(0.33)), sd: h(seed.mul(0.0137).add(0.31)), BW, FH, GF, LST, DW: fwidth(vec2(uw, wy)), fac, tile, wall: step(0, uw), dist: length(cameraPosition.sub(positionWorld)) };
}

// lookWall: a Realistic wall by day (K: the variables of facadeCommon)
function lookWall(K) {
  const { uw, gk, wy, BW, FH, GF, LST, DW, lum, sd } = K;
  const y = wy.sub(gk.z).toVar(), fw = max(DW.x, DW.y), tx = float(1).sub(smoothstep(0.4, 1.5, fw)).toVar(), top = gk.w.sub(floor(gk.w.div(1000).add(0.001)).mul(1000)).toVar();
  const c = vec3(K.base).toVar(), gl = vec3(0).toVar(), wm = float(0).toVar();
  c.mulAssign(float(1).add(vn(vec2(uw.mul(0.35), wy.mul(0.7)).add(sd.mul(50))).sub(0.5).mul(0.07).mul(tx)));   // slow mottling
  c.mulAssign(smoothstep(0, 2.5, y).mul(0.14).add(0.86));   // grime at the foot
  If(LST.greaterThan(0.5).and(LST.notEqual(6)).and(top.sub(wy).greaterThan(0)).and(top.sub(wy).lessThan(0.35)), () => { c.assign(min(vec3(1), c.mul(1.16).add(0.03))); });   // coping under a flat roof
  If(GF.greaterThan(0).and(y.lessThan(GF)), () => {   // shopfront: glass, mullions, a fascia
    const sq = vec2(uw.div(2.6), y.div(GF)), sf = fract(sq);
    wm.assign(step(0.05, sf.x).mul(step(sf.x, 0.95)).mul(step(0.06, sf.y)).mul(step(sf.y, 0.74)));
    const fa = step(0.78, sf.y).mul(step(sf.y, 0.95)).mul(tx);
    c.assign(mix(c, mix(vec3(0.13, 0.16, 0.22), vec3(0.42, 0.13, 0.11), step(0.5, h(vec2(floor(sq.x.div(3)), sd)))), fa));
    gl.assign(vec3(0.24, 0.26, 0.26).add(vec3(0.12, 0.08, 0.03).mul(h(floor(sq).add(sd)))));
  }).Else(() => {
    const g = vec2(uw.div(BW), y.sub(GF).div(FH)), cell = floor(g).toVar(), f = fract(g).toVar(), B = byStyle(LST, LOOK_WIN).toVar();
    wm.assign(step(B.x, f.x).mul(step(f.x, B.y)).mul(step(B.z, f.y)).mul(step(f.y, B.w)));
    const cov = B.y.sub(B.x).mul(B.w.sub(B.z)), cp = DW.div(vec2(BW, FH)), cq = max(cp.x, cp.y), far = smoothstep(0.12, 0.45, cq), det = float(1).sub(smoothstep(0.05, 0.18, cq)).toVar();
    gl.assign(mix(vec3(0.09, 0.12, 0.16), vec3(0.30, 0.38, 0.46), f.y.mul(0.4).add(h(cell.add(sd)).mul(0.3)).sub(0.35).mul(det).add(0.2))
      .add(vec3(0.16, 0.14, 0.11).mul(mix(0.18, step(0.82, h(cell.add(sd.mul(3)))), det))));   // glass: sky in the upper panes, some blinds
    If(LST.lessThan(0.5), () => {   // house: white frames, a door on some ground-floor bays
      const fr = step(B.x.sub(0.05), f.x).mul(step(f.x, B.y.add(0.05))).mul(step(B.z.sub(0.04), f.y)).mul(step(f.y, B.w.add(0.03))).sub(wm).mul(det);
      c.assign(mix(c, vec3(0.84, 0.83, 0.80).mul(lum.mul(0.5).add(0.6)), fr));
      If(cell.y.lessThan(0.5).and(h(vec2(cell.x, sd.mul(7))).lessThan(0.35)), () => {
        const dr = step(0.36, f.x).mul(step(f.x, 0.64)).mul(step(f.y, 0.74)).mul(det).toVar();
        c.assign(mix(c, mix(vec3(0.12, 0.14, 0.16), vec3(0.36, 0.10, 0.10), step(0.5, h(vec2(cell.x, sd)))), dr)); wm.mulAssign(float(1).sub(dr));
      });
    }).ElseIf(LST.greaterThan(1.5).and(LST.lessThan(2.5)), () => {   // estate: lighter spandrel panels
      c.mulAssign(float(1).add(step(f.y, B.z.sub(0.03)).mul(0.07).mul(tx)));
    }).ElseIf(LST.greaterThan(4.5).and(LST.lessThan(5.5)), () => {   // curtain wall: the wall colour is the glass tint; spandrels, mullions
      gl.assign(mix(c, vec3(0.62, 0.68, 0.74), f.y.mul(0.3).add(0.28)).add(vec3(0.04, 0.05, 0.06).mul(h(vec2(cell.x, floor(cell.y.div(3))).add(sd)).sub(0.5))));
      const mu = mix(0.05, step(f.x, 0.05), det).toVar(); c.assign(mix(c.mul(0.8), vec3(0.58, 0.61, 0.64), mu)); wm.mulAssign(float(1).sub(mu));
    }).ElseIf(LST.greaterThan(5.5).and(LST.lessThan(6.5)), () => {   // shed: cladding ribs, a block plinth, roller doors every 14 m
      c.mulAssign(float(1).sub(mix(0.2, step(0.8, f.x), det).mul(0.10)));
      If(y.lessThan(1.2), () => { c.mulAssign(0.78); });
      const dr = step(fract(uw.div(14).add(sd)), 0.28).mul(step(y, 4.2)).mul(tx);
      c.assign(mix(c, c.mul(step(0.5, fract(y.mul(3))).mul(0.06).add(0.82)), dr));
    }).ElseIf(LST.greaterThan(6.5), () => {   // civic: a mullion in each window
      wm.mulAssign(float(1).sub(step(abs(f.x.sub(0.5)), 0.02).mul(det)));
    });
    wm.assign(mix(wm, cov, far));   // far away a window is under a pixel: its mean
  });
  return mix(c, select(LST.greaterThan(4.5).and(LST.lessThan(5.5)), gl, gl.mul(lum.mul(0.5).add(0.75))), wm);
}

export function buildingMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide, flatShading: true });
  const graph = () => {
    m.colorNode = Fn(() => {
      const C = facadeCommon(), K = { ...C };
      for (const k of ['lum', 'sd', 'BW', 'FH', 'GF', 'LST', 'DW', 'fac', 'tile', 'wall', 'dist']) K[k] = C[k].toVar();   // before any branch
      If(K.wy.greaterThan(U.cut), () => { Discard(); });
      const out = vec3(0).toVar();
      If(K.fac.greaterThan(0.5), () => { out.assign(K.tile.mul(K.lum.mul(0.75).add(0.45))); })   // photo facade: the building's tile, repeated by its size in metres
        .ElseIf(K.LST.greaterThan(-0.5).and(K.wall.greaterThan(0.5)), () => { out.assign(lin(lookWall(K))); })   // Realistic look by day
        .Else(() => {   // the Map look's window grid (3.6 m storeys, 1.8 m bays), fading with distance
          const g = vec2(K.uw.div(1.8), K.wy.div(3.6)), cell = floor(g), f = fract(g);
          const w = step(0.14, f.x).mul(step(f.x, 0.86)).mul(step(0.2, f.y)).mul(step(f.y, 0.84)).mul(clamp(float(1.4).sub(K.dist.div(900)), 0.15, 1));
          const glass = mix(vec3(0.13, 0.18, 0.25), vec3(0.42, 0.52, 0.62), clamp(K.wy.div(300), 0, 1).add(h(cell).mul(0.12))).mul(K.lum.mul(0.7).add(0.55));
          out.assign(lin(mix(K.base, glass, w.mul(0.8).mul(K.wall))));
        });
      return vec4(out, 1);
    })();

    // by night: windows, shopfronts, crowns and haze as emitted light (index.html nightCol); no branches
    m.emissiveNode = Fn(() => {
      const { uw, gk, wy, BW, FH, GF, DW, sd, fac, tile, wall, dist, base } = facadeCommon();
      const ty = floor(gk.w.div(1000).add(0.001)), top = gk.w.sub(ty.mul(1000)), ht = max(1, top.sub(gk.z));
      const gg = vec2(uw.div(BW), wy.sub(gk.z).sub(GF).div(FH)), cell = floor(gg), f = fract(gg), fl = cell.y;
      const off = step(1.5, ty).mul(step(ty, 2.5));
      const fw2 = DW.div(vec2(BW, FH)), fwm = max(fw2.x, fw2.y), f2 = smoothstep(0.5, 1.3, fw2);
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
      // a Realistic shopfront: lit, most of them, warm
      const ys = wy.sub(gk.z), gf = max(GF, 0.01), sq = vec2(uw.div(2.6), ys.div(gf)), sf = fract(sq);
      const sm = mix(step(0.05, sf.x).mul(step(sf.x, 0.95)).mul(step(0.06, sf.y)).mul(step(sf.y, 0.74)), 0.6, smoothstep(0.35, 0.9, max(DW.x.div(2.6), DW.y.div(gf))));
      const shop = step(0.01, GF).mul(step(ys, GF)).mul(wall).mul(sm).mul(step(0.3, h(vec2(sd, floor(sq.x.div(4))))));
      L = mix(L, vec3(1, 0.84, 0.6).mul(h(vec2(floor(sq.x.div(3)), sd)).mul(0.4).add(0.45)), shop);
      // a photo facade: the tile, faintly, under the lit windows (nightCol: base x (0.045 + 0.02))
      if (FAC.tex) L = L.add(tile.mul(fac).mul(0.04));
      // tops: Newfoundland's diagrid crown (use 4), One Canada Square's halo (use 5), a soft band on other towers over 90 m
      const tb = top.sub(wy);
      const tri = abs(fract(uw.div(9)).mul(2).sub(1)), yy = float(1).sub(tb.div(13)), ln = min(abs(tri.sub(yy)), abs(tri.sub(float(1).sub(yy))));
      const nf = step(3.5, ty).mul(step(ty, 4.5)).mul(step(tb, 13)).mul(step(0, tb)).mul(wall);
      L = mix(L, vec3(1, 0.9, 0.7).mul(smoothstep(0.04, 0.12, ln)), nf);
      const ocs = step(4.5, ty).mul(step(tb, 7)).mul(step(0, tb)).mul(wall).mul(U.crownOn);
      L = mix(L, vec3(U.crown).mul(0.75), ocs);   // 0.75 (x winGain): brighter, AgX turned a campaign orange into peach white
      // One Canada Square's pyramid faces, lit from their base when a source says so (index.html: night.x 2)
      const pyr = step(4.5, ty).mul(step(top.add(0.5), wy)).mul(float(1).sub(wall)).mul(U.crownPyr);
      L = mix(L, mix(vec3(U.crown).mul(0.32), vec3(U.crown).mul(0.1), clamp(wy.sub(top).div(14), 0, 1)), pyr);
      const band = step(90, ht).mul(step(tb, 3.5)).mul(step(0, tb)).mul(step(ty, 3.5)).mul(wall);
      L = L.add(vec3(0.32, 0.3, 0.27).mul(smoothstep(3.5, 0.5, tb)).mul(band));
      // haze in the colour of the sky glow
      const hz = float(1).sub(exp(dist.div(-5200))).mul(0.6);
      // a data colour mode (layers/overlays.js 'Colour buildings by', U.dataColour 1): no windows, the data colour kept readable by night (index.html: win < -0.5, base x 0.6)
      return mix(lin(L.mul(U.winGain).add(vec3(U.haze).mul(hz).mul(0.6))), lin(base).mul(0.35), U.dataColour).mul(U.night);
    })();
  };
  // main.js, when facades.json and facades.jpg have loaded: slots = [[w_m, h_m] by slot]
  m.setFacades = (tex, slots) => { slots.forEach((s, i) => { if (s && i < 32) FAC.slots.array[i].set(s[0], s[1], 0, 0); }); FAC.tex = tex; graph(); m.needsUpdate = true; };
  graph();
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
