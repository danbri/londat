// Materials of the Three.js port of the Docklands 3D page, in TSL (three.js Shading Language): one node graph compiles to
// WGSL on the WebGPU backend and to GLSL ES 3.0 on the WebGL 2 backend. The building material is the facade program of
// index.html (ffs): by day the photo facade tiles, the Realistic look's walls and the Map window grid; by night lit windows
// by building use, height and hour (nightNew: offices by floors and zones, homes by flats in a spread of colour temperatures,
// cores, lobbies; ?nightstyle=old: nightOld, the version of 2026-10-04), shopfronts, One Canada Square's halo in the colour
// of the evening, Newfoundland's diagrid crown and a band at the top of other towers, as emissive light, so the bloom pass
// picks them up. Skill: docklands-3d-page, "Three.js port" and "Night windows by use and hour".
import * as THREE from 'three/webgpu';
import { If, Discard, Fn, attribute, positionWorld, positionLocal, cameraPosition, uniform, float, vec2, vec3, vec4, floor, fract, sin, dot, step, smoothstep, mix, clamp, max, min, abs, length, fwidth, select, exp, texture, uv, time, sRGBTransferEOTF, normalize, pow, reflect, transformNormalToView, screenUV, uniformArray, int, log2, exp2, mod, dFdx, dFdy, cross } from 'three/tsl';
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
  win: uniform(1),                // 0: no windows (Look > Model > Windows, ?windows=0; index.html showWindows, uniform win): no day window grid or Realistic walls, no lit windows or shopfronts by night; photo facades and crowns stay
  nP: uniform(new THREE.Vector4(0.36, 0.30, 0.48, 0.45)),   // night windows by the clock (nightClock): lit share of home rooms, office floors, hotel rooms, shopfronts (defaults: a weekday at 22:00)
  nQ: uniform(new THREE.Vector4(0.9, 0.07, 0, 0)),        // ground-floor factor of homes, TV share of lit rooms, lateness (0 evening, 1 small hours), 1 on a weekend day
};

// Night windows, version 2 (2026-10-09; ?nightstyle=old keeps the version of 2026-10-04: homes warm in clusters, offices
// cool by floors). Patterns, sources and the measurements against the owner's photos: skill docklands-3d-page, "Night windows
// by use and hour".
export const NIGHT_STYLE = typeof location !== 'undefined' && new URLSearchParams(location.search).get('nightstyle') === 'old' ? 'old' : 'new';
// lit share by London hour (0 to 23; linear between hours). Drawn values, set so that 23:56 on a Saturday matches the photos
// of 3 October 2026 (homes about a quarter of the rooms); the shape follows UK time-use surveys (evening peak 19 to 22 h, the
// fall after 23 h) and office occupancy (cleaners and late work to about 22 h); offices keep about a fifth of their floors lit all
// night, as the photos show on a Saturday at midnight (lights left on, cleaning, sensors that never time out).
const NT = {
  home:  [.17, .11, .07, .05, .04, .06, .14, .26, .22, .12, .10, .10, .10, .10, .10, .11, .16, .27, .37, .43, .45, .42, .36, .26],
  off:   [.22, .20, .20, .20, .20, .22, .30, .45, .70, .85, .86, .86, .86, .86, .86, .85, .82, .78, .66, .52, .42, .35, .30, .26],
  hotel: [.30, .20, .12, .08, .07, .10, .22, .38, .30, .15, .12, .12, .12, .12, .15, .20, .28, .36, .44, .52, .55, .54, .48, .40],
  shop:  [.22, .20, .20, .20, .20, .22, .30, .55, .85, .95, .95, .95, .95, .95, .95, .95, .95, .95, .93, .85, .72, .58, .45, .32],
};
const atHour = (T, x) => { x = ((x % 24) + 24) % 24; const i = Math.floor(x), f = x - i; return T[i] + (T[(i + 1) % 24] - T[i]) * f; };
// the wall clock of a time zone (the model's: Europe/London; a place on the globe: its own, globe/place-look.js)
const FMT = new Map(), fmtOf = tz => FMT.get(tz) || (typeof Intl === 'undefined' ? null : FMT.set(tz, new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', weekday: 'short', hour: 'numeric', minute: 'numeric' })).get(tz));
// the window shares at clock t (ms) in time zone tz: [pHome, pOffice, pHotel, pShop], [ground-floor factor, TV share, lateness, weekend]
export function nightClock(t, tz = 'Europe/London') {
  const F = fmtOf(tz); if (!F || !isFinite(t)) return null;
  const P = Object.fromEntries(F.formatToParts(new Date(t)).map(p => [p.type, p.value])), hr = +P.hour + (+P.minute) / 60;
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(P.weekday), nightDow = hr < 5 ? (dow + 6) % 7 : dow;   // the small hours belong to the evening before
  const lateNight = nightDow === 4 || nightDow === 5, weekend = dow >= 5;   // Friday and Saturday nights run later; Saturday and Sunday offices stay dark
  let pH = atHour(NT.home, hr), pO = atHour(NT.off, hr), pT = atHour(NT.hotel, hr), pS = atHour(NT.shop, hr);
  if (lateNight && (hr >= 21 || hr < 3)) pH = Math.min(0.6, pH * 1.15);
  if (weekend && hr >= 6 && hr < 9) pH *= 0.6;
  if (weekend) pO = Math.max(0.15, pO * 0.75); else if (dow === 4 && hr >= 17) pO *= 0.8;
  if (dow === 6 && hr >= 17) pS *= 0.6;
  const gf = hr >= 17 && hr < 22 ? 1.3 : hr >= 22 ? 0.9 : hr < 6 ? 0.4 : 1;
  const tv = hr >= 19 || hr < 1 ? 0.07 : 0.03, late = hr >= 23 ? (hr - 23) * 0.5 : hr < 5 ? Math.min(1, 0.5 + hr * 0.25) : 0;
  return [[pH, pO, pT, pS], [gf, tv, late, weekend ? 1 : 0]];
}
let nightClockAt = NaN;
U.nP.onFrameUpdate(() => {   // the page clock (main.js, __docklands3.clock) once a minute of clock time
  const c = globalThis.__docklands3 && globalThis.__docklands3.clock;
  if (isFinite(c) && Math.floor(c / 60000) !== nightClockAt) { nightClockAt = Math.floor(c / 60000); const r = nightClock(c); if (r) { U.nP.value.set(...r[0]); U.nQ.value.set(...r[1]); } }
  return U.nP.value;
});

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
const LOOK_BAY = [[2.3, 2.6, .23], [3, 2.7, .23], [3.3, 2.6, .23], [1.6, 3.3, .33], [1.5, 3.3, .33], [1.5, 3.5, .33], [1, 4, 1.3], [3.4, 3.3, .43], [5.5, 4.4, .5]];   // tools/build-materials.mjs STYLES: bay m, storey m, storey class step m; 8 masonry (tools/build-material-overrides.mjs: stone, few small windows; 2026-11-23)
const LOOK_WIN = [[.30, .70, .32, .80], [.20, .80, .30, .78], [.08, .92, .34, .80], [.22, .78, .16, .86], [0, 1, .40, .88], [0, 1, .14, 1], [0, 0, 0, 0], [.12, .88, .18, .86], [.44, .56, .34, .62]];   // window box in the bay (x0, x1, y0, y1)
const byStyle = (st, T) => { const V = T[0].length === 4 ? vec4 : vec3, L = T.length - 1; let n = V(...T[L]); for (let i = L - 1; i >= 0; i--) n = select(st.lessThan(i + .5), V(...T[i]), n); return n; };
export let GLASS_ROUGH = 0.18;   // the roughness of curtain-wall glass (buildingMaterial roughnessNode)
export const FAC = { slots: uniformArray(Array.from({ length: 32 }, () => new THREE.Vector4(10, 10, 0, 0)), 'vec4'), tex: null };   // photo facade tile sizes (w_m, h_m) by slot; the atlas texture

// the per-fragment values of the facade program (fresh nodes for each function that calls it). S: where the per-building
// values come from: the model's vertex attributes (col, uw, gk; height = world y, m OD), or a place's (placeSource: the
// along-wall metres and the wall flag from the face normal in the tile frame, the height from the tile's local y)
const modelSource = () => ({ col: attribute('col', 'vec4'), uw: attribute('uw', 'float'), gk: attribute('gk', 'vec4'), wy: positionWorld.y, wall: null });
function facadeCommon(S = modelSource()) {
  const { col, uw, gk, wy } = S;
  const base = col.rgb, a8 = col.a.mul(255), seed = floor(gk.xy);
  // lookSet: a Realistic building's bay, storey, shopfront height and style (1.8, 3.6, 0, -1 for every other vertex)
  const isLook = a8.greaterThan(131.5).and(a8.lessThan(203.5)),   /* 132 + code, code up to 71: style 8 masonry (2026-11-23) */  lk = floor(a8.sub(132).add(0.5)), st = floor(lk.div(8).add(0.001)), rr = lk.sub(st.mul(8)), sh = step(3.5, rr), cl = rr.sub(sh.mul(4));
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
  return { uw, gk, wy, base, lum: dot(base, vec3(0.33)), sd: h(seed.mul(0.0137).add(0.31)), BW, FH, GF, LST, DW: fwidth(vec2(uw, wy)), fac, tile, wall: S.wall || step(0, uw), dist: length(cameraPosition.sub(positionWorld)) };
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

// version 1 (2026-10-04, ?nightstyle=old): offices cool white by whole floors, homes warm in clusters of three windows
function nightOld(K, V = U) {
  const { uw, gk, wy, BW, FH, GF, DW, sd, wall } = K;
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
  const L = mix(LH, LO, off).mul(wm).mul(wall).mul(V.win);   // windows off: none lit (index.html nightCol: the win > .5 block)
  // a Realistic shopfront: lit, most of them, warm
  const ys = wy.sub(gk.z), gf = max(GF, 0.01), sq = vec2(uw.div(2.6), ys.div(gf)), sf = fract(sq);
  const sm = mix(step(0.05, sf.x).mul(step(sf.x, 0.95)).mul(step(0.06, sf.y)).mul(step(sf.y, 0.74)), 0.6, smoothstep(0.35, 0.9, max(DW.x.div(2.6), DW.y.div(gf))));
  const shop = step(0.01, GF).mul(step(ys, GF)).mul(wall).mul(sm).mul(step(0.3, h(vec2(sd, floor(sq.x.div(4)))))).mul(V.win);
  return mix(L, vec3(1, 0.84, 0.6).mul(h(vec2(floor(sq.x.div(3)), sd)).mul(0.4).add(0.45)), shop);
}

// version 2 (2026-10-09): patterns by use (offices, homes, hotels, sheds, civic, no record), the building's own bay and storey,
// the clock (U.nP, U.nQ: nightClock), the core, the lobby, plant floors, curtains, TVs and a spread of colour temperatures.
// Branch-free (select, mix, step), so every derivative stays in uniform control flow.
const c22 = vec3(1, 0.6, 0.3), c30 = vec3(1, 0.74, 0.46), c40 = vec3(1, 0.86, 0.68), c65 = vec3(0.92, 0.95, 1);
const cct = t => mix(mix(mix(c22, c30, clamp(t.mul(3), 0, 1)), c40, clamp(t.mul(3).sub(1), 0, 1)), c65, clamp(t.mul(3).sub(2), 0, 1));   // t 0 to 1: about 2200, 3000, 4000, 6500 K (sRGB, equal brightness)
const eqF = (a, v) => step(v - 0.5, a).mul(step(a, v + 0.5));
function nightNew(K, V = U) {
  const { uw, gk, wy, BW, FH, GF, DW, sd, LST, wall } = K;
  const ty = floor(gk.w.div(1000).add(0.001)), top = gk.w.sub(ty.mul(1000)), ht = max(1, top.sub(gk.z));
  const isLook = step(-0.5, LST), unk = eqF(ty, 0);
  // the use: offices (2, and One Canada Square 5; no record: a Realistic office, ribbon or curtain wall), hotel (3), shed and
  // civic (no record, by the Realistic style), homes (1, Newfoundland 4, and the rest; no record and no style: fewer lit)
  const isO = max(max(eqF(ty, 2), eqF(ty, 5)), unk.mul(step(2.5, LST)).mul(step(LST, 5.5)));
  const isT = eqF(ty, 3), isS = unk.mul(eqF(LST, 6)), isC = unk.mul(eqF(LST, 7)), isU = unk.mul(float(1).sub(isLook));
  const O = isO.greaterThan(0.5), T = isT.greaterThan(0.5);
  // the grid: the Realistic style's bay and storey (as by day); else by use: offices 1.5 m by 4.0 m, hotels 3.6 by 3.15, homes 2.3 to 3.4 by 3.05
  const hb = h(sd.mul(1.37).add(0.19)), hb2 = h(sd.mul(2.71).add(0.43));
  const BWn = select(isLook.greaterThan(0.5), BW, select(O, float(1.5), select(T, float(3.6), hb.mul(1.1).add(2.3))));
  const FHn = select(isLook.greaterThan(0.5), FH, select(O, float(4.0), select(T, float(3.15), float(3.05))));
  const y = wy.sub(gk.z), gg = vec2(uw.div(BWn), y.sub(GF).div(FHn)), cell = floor(gg), f = fract(gg), fl = cell.y;
  const fw2 = DW.div(vec2(BWn, FHn)), fwm = max(fw2.x, fw2.y), far = smoothstep(0.35, 0.9, fwm), f2 = smoothstep(0.5, 1.3, fw2), det = float(1).sub(smoothstep(0.08, 0.3, fwm));
  // the window in its cell: the Realistic style's box; else offices floor-to-ceiling glass, homes a box of the building's own proportions
  const ww = hb2.mul(0.35).add(0.45), wh = h(sd.mul(3.33).add(0.77)).mul(0.22).add(0.55);
  const box0 = select(isLook.greaterThan(0.5), byStyle(LST, LOOK_WIN), select(O, vec4(0.04, 0.96, 0.1, 0.9), vec4(float(0.5).sub(ww.mul(0.5)), float(0.5).add(ww.mul(0.5)), float(0.2), wh.add(0.2))));
  const box = select(O, box0, vec4(max(box0.x, 0.12), min(box0.y, 0.88), box0.z, box0.w));   // rooms: a pier between windows, so a lit flat is not one bar
  const cov = box.y.sub(box.x).mul(box.w.sub(box.z));
  const wm = mix(step(box.x, f.x).mul(step(f.x, box.y)).mul(step(box.z, f.y)).mul(step(f.y, box.w)), cov, far).mul(step(-0.5, fl));
  const pO = V.nP.y;
  // ---- offices: whole floors by the hour, in zones (occupancy sensors); dark plant floors; the top storey of a building over 45 m dark
  const plantN = floor(h(sd.mul(5.9)).mul(10)).add(14);
  const plant = min(step(100, ht).mul(step(plantN.sub(1.5), mod(fl, plantN))).add(step(45, ht).mul(step(top.sub(wy), FHn.mul(1.2)))), 1), live = float(1).sub(plant);
  const lf = step(h(vec2(fl, sd.mul(13))), pO).mul(live);
  const zl = floor(hb.mul(6)).add(6), zone = floor(cell.x.div(zl)), zh = h(vec2(zone, fl).add(sd.mul(5)));
  const litO = lf.mul(step(0.18, zh)).add(float(1).sub(lf).mul(step(float(1).sub(pO.mul(0.12)), zh))).mul(live);
  const Oc = cct(h(sd.mul(3.1).add(0.5)).mul(0.35).add(0.45).add(h(vec2(fl, 2).add(sd)).sub(0.5).mul(0.08)));   // 3700 to 5200 K by building, a little by floor
  const blind = step(h(cell.add(sd.mul(2.2))), 0.12);   // a blind down: dimmer
  const inner = mix(float(0.92), f.y.mul(0.35).add(0.72).add(step(0.78, f.y).mul(step(f.y, 0.87)).mul(step(fract(uw.div(0.6)), 0.3)).mul(0.6)), det);   // brighter to the ceiling; the rows of LED panels close up
  const glow = vec3(0.6, 0.66, 0.72).mul(h(vec2(fl, sd.mul(3))).mul(0.05).add(0.035)).mul(live);   // a dark floor: emergency and security lights, the core through the glass
  let LO = Oc.mul(zh.mul(0.25).add(0.7)).mul(inner).mul(mix(float(1), float(0.45), blind)).mul(litO).add(glow.mul(float(1).sub(litO)));
  LO = mix(LO, Oc.mul(0.8).mul(lf.mul(0.82).add(float(1).sub(lf).mul(pO.mul(0.12)))).add(glow), f2.x);   // far: the mean along a floor (lit floors stay bands)
  LO = mix(LO, Oc.mul(0.8).mul(pO.mul(0.8)).add(vec3(0.02, 0.022, 0.025)), f2.y);                           // then over floors
  LO = mix(LO, cct(float(0.5)).mul(0.9), eqF(fl, 0).mul(step(20, ht)));                                        // the lobby
  // ---- homes, hotels, sheds, civic: rooms lit by flat (2 to 4 windows), in patches, by the hour
  const pBase = select(T, V.nP.z, V.nP.x).mul(select(isU.greaterThan(0.5), float(0.75), float(1))).mul(select(ht.lessThan(30), float(0.8), float(1)));
  const pF = pBase.mul(mix(float(1), select(fl.lessThan(0.5), V.nQ.x, V.nQ.z.mul(0.4).add(1)), step(ht, 15)));   // houses: the ground floor in the evening, upper floors late
  const p = select(isS.greaterThan(0.5), float(0.03), select(isC.greaterThan(0.5), pO.mul(0.15), pF));
  const pl = clamp(p.mul(vn(vec2(cell.x.div(7), fl.div(3)).add(sd.mul(41))).mul(1.2).add(0.4)), 0, 0.95);   // patches: neighbours alike
  const nF = select(T, float(1), floor(h(sd.mul(1.7)).mul(3)).add(2));
  const fid = floor(cell.x.add(floor(h(sd.mul(2.3)).mul(nF))).div(nF));   // a flat; flats stack, so the same split on every floor
  const flatLit = step(h(vec2(fid, fl).add(sd.mul(31))), pl), rh = h(cell.add(sd.mul(7)));
  const litH = flatLit.mul(step(0.32, rh)).add(float(1).sub(flatLit).mul(step(float(1).sub(pl.mul(0.05)), rh)));   // most rooms of a lit flat; a hall or bathroom light elsewhere
  // colour: one fixture type per flat, a little change room to room; about 58 % under 3000 K, 24 % to 4000 K, 18 % cooler (u^2); hotels warmer
  const u = h(vec2(fid, fl).add(3.1)).mul(0.8).add(h(cell.add(5.3)).mul(0.2));
  let HC = cct(pow(u, 2.0).mul(select(T, float(0.55), float(1))));
  const cur = step(h(cell.add(8.9)), select(T, float(0.6), float(0.35)));   // curtains or blinds: a soft glow in the colour of the cloth
  HC = mix(HC, HC.mul(mix(vec3(1, 0.88, 0.7), vec3(1, 0.74, 0.56), step(0.6, h(cell.add(4.4))))).mul(0.6), cur);
  const tv = step(h(cell.add(2.7)), V.nQ.y).mul(float(1).sub(cur));   // a television: blue-white, flickering while the page animates
  HC = mix(HC, vec3(0.5, 0.65, 1).mul(vn(vec2(time.mul(5), h(cell.add(6.1)).mul(97))).mul(0.6).add(0.4)).mul(0.7), tv);
  const balc = step(h(sd.mul(5.1).add(0.3)), 0.4).mul(step(f.y, box.z.add(box.w.sub(box.z).mul(0.3)))).mul(det).mul(float(1).sub(isLook));   // a balustrade across the foot of the window
  let LH = HC.mul(h(cell.add(1.7)).mul(0.45).add(0.55)).mul(mix(float(1), float(0.5), balc)).mul(litH);
  // the core: a column of stair and corridor windows, two bays wide, lit on most floors of a block over 24 m (35 % of them; every hotel)
  const hasCore = step(h(sd.mul(7.7).add(0.1)), select(T, float(1), float(0.35))).mul(step(24, ht)).mul(float(1).sub(isS)).mul(float(1).sub(isC));
  const cm = floor(h(sd.mul(4.4)).mul(24).add(40).div(BWn));   // one column every 40 to 64 m of wall (about one a face)
  const core = hasCore.mul(step(mod(cell.x.add(floor(h(sd.mul(6.6)).mul(cm))), cm), 1.5)).mul(step(0.12, h(vec2(fl, sd.mul(2.9)))));   // two bays wide; a few floors dark
  const coreC = mix(vec3(0.82, 0.95, 0.86), vec3(1, 0.9, 0.75), step(0.5, h(sd.mul(8.8))));   // fluorescent green-white or LED warm white
  LH = mix(LH, coreC.mul(h(vec2(fl, sd)).mul(0.15).add(0.4)), core);
  // whole storeys lit: an amenity floor of a tower over 60 m (about 1 floor in 40, while homes are lit), the lobby of a block over 20 m (65 %; every hotel)
  const amen = step(60, ht).mul(step(h(vec2(fl, sd.mul(17))), 0.025)).mul(step(0.15, p));
  const lobby = eqF(fl, 0).mul(step(20, ht)).mul(step(h(sd.mul(9.2)), select(T, float(1), float(0.65))));
  LH = mix(LH, cct(float(0.25)).mul(0.85), max(amen, lobby));
  LH = mix(LH, cct(float(0.28)).mul(pl.mul(0.5)).add(coreC.mul(0.4).mul(hasCore).mul(2).div(cm)), far);   // far: the mean
  let L = mix(LH, LO, isO).mul(wm).mul(wall).mul(V.win);
  // a Realistic shopfront: lit by the hour (shops, cafes, display lights after closing), 2700 to 4000 K
  const gf = max(GF, 0.01), sq = vec2(uw.div(2.6), y.div(gf)), sf = fract(sq);
  const sm = mix(step(0.05, sf.x).mul(step(sf.x, 0.95)).mul(step(0.06, sf.y)).mul(step(sf.y, 0.74)), 0.6, smoothstep(0.35, 0.9, max(DW.x.div(2.6), DW.y.div(gf))));
  const shop = step(0.01, GF).mul(step(y, GF)).mul(wall).mul(sm).mul(step(h(vec2(sd, floor(sq.x.div(4)))), V.nP.w.mul(0.85).add(0.05))).mul(V.win);
  const sh = h(vec2(floor(sq.x.div(3)), sd));
  return mix(L, cct(sh.mul(0.5).add(0.15)).mul(sh.mul(0.4).add(0.55)), shop);
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
        .ElseIf(K.LST.greaterThan(-0.5).and(K.wall.greaterThan(0.5)).and(U.win.greaterThan(0.5)), () => { out.assign(lin(lookWall(K))); })   // Realistic look by day (windows on)
        .Else(() => {   // the Map look's window grid (3.6 m storeys, 1.8 m bays), fading with distance
          const g = vec2(K.uw.div(1.8), K.wy.div(3.6)), cell = floor(g), f = fract(g);
          const w = step(0.14, f.x).mul(step(f.x, 0.86)).mul(step(0.2, f.y)).mul(step(f.y, 0.84)).mul(clamp(float(1.4).sub(K.dist.div(900)), 0.15, 1));
          const glass = mix(vec3(0.13, 0.18, 0.25), vec3(0.42, 0.52, 0.62), clamp(K.wy.div(300), 0, 1).add(h(cell).mul(0.12))).mul(K.lum.mul(0.7).add(0.55));
          out.assign(lin(mix(K.base, glass, w.mul(0.8).mul(K.wall).mul(U.win))));   // windows off: the plain wall colour (index.html win 0)
        });
      return vec4(out, 1);
    })();

    // glass: a curtain-wall building of the Realistic look (style 5, not a photo tile) is smooth, so the sun's highlight
    // shows on the faces that mirror it (the owner's photo IMG_2347 of 2026-11-23: a glint 7.7 x the sky on a glass front);
    // every other wall stays matt (0.82)
    m.roughnessNode = Fn(() => { const C = facadeCommon(); return select(abs(C.LST.sub(5)).lessThan(0.5).and(C.fac.lessThan(0.5)), float(GLASS_ROUGH), float(0.82)); })();
    // by night: windows, shopfronts, crowns and haze as emitted light (index.html nightCol); no branches
    m.emissiveNode = Fn(() => {
      const C = facadeCommon(), { uw, gk, wy, sd, fac, tile, wall, dist, base } = C;
      const ty = floor(gk.w.div(1000).add(0.001)), top = gk.w.sub(ty.mul(1000)), ht = max(1, top.sub(gk.z));
      let L = NIGHT_STYLE === 'old' ? nightOld(C) : nightNew(C);   // lit windows and shopfronts (windows off: none)
      // masonry (style 8: the Tower of London, the Tower Bridge towers; data/materials-overrides.json) has no lit office
      // windows: these are floodlit monuments (the owner's screenshots of 2026-11-24 02:47 showed both lit as offices).
      // A wash of the wall colour, brightest at the foot where the lamps stand, half as bright at the top (judged).
      const mas = eqF(C.LST, 8).mul(wall).mul(U.win), up = clamp(wy.sub(gk.z).div(ht), 0, 1);
      L = mix(L, base.mul(vec3(1.0, 0.92, 0.80)).mul(float(0.42).mul(float(1).sub(up.mul(0.5)))), eqF(C.LST, 8));
      L = L.mul(float(1).sub(eqF(C.LST, 8).mul(float(1).sub(mas))));   // roofs of masonry: dark
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

// Houses of a place's compact boxes (owner, 2026-11-25: "walls that looks plausible and varied and real"; skill
// docklands-3d-page, "Three.js port: house walls on compact boxes"). Only the city-block material of the places
// (placeBuildingMaterial with inst.bx) calls these: the model's buildings and the places' core tiles keep lookWall.
// A box instance carries bx = (cos, sin of its turn about y, half its long side, half its short side); with gk (centre,
// ground, top = the eaves) the fragment knows its wall (long or gable end, which side), the metres along that wall from its
// left end and the height over the ground. The facade is then laid out per building (seeded by the building's centre):
// storeys of about 2.6 m from the eaves height, bays of 2.3 to 3.4 m, windows of one of four kinds (single portrait sash,
// paired casements, wide post-war, small cottage), frames, sills, lintels, a door on the ground floor of one long side, a
// plinth, a wall finish by the material code (rcol.a: 1 render, 2 brick, 3 stone, 4 pebble-dash, 5 tile-hung upper floors
// on brick, 6 weatherboard), an up-and-over door on garages, no windows on sheds. Every fine part fades to its mean when
// it is under a pixel (HW: the metres per pixel along the wall and up).
// the wall frame of a box fragment (before any branch: it holds the derivatives); S: placeBuildingMaterial's src()
function houseFrame(S, gk, bx, rcolA) {
  const d = S.pl.xz.sub(gk.xy), c = bx.x, s = bx.y, hl = bx.z, hs = bx.w, nL = S.nL;
  const lx = d.x.mul(c).sub(d.y.mul(s)), lz = d.x.mul(s).add(d.y.mul(c));   // the box frame: x along the long side
  const nx = nL.x.mul(c).sub(nL.z.mul(s)), nz = nL.x.mul(s).add(nL.z.mul(c));
  const long = step(abs(nx), abs(nz)), sz = select(nz.greaterThan(0), float(1), float(-1)), sx = select(nx.greaterThan(0), float(1), float(-1));
  const Lw = select(long.greaterThan(0.5), hl.mul(2), hs.mul(2));
  const a = clamp(select(long.greaterThan(0.5), lx.mul(sz).add(hl), lz.mul(sx).negate().add(hs)), 0, Lw);
  const top = gk.w.sub(floor(gk.w.div(1000).add(0.001)).mul(1000)), y = S.wy.sub(gk.z), E = max(top.sub(gk.z), 0.1);
  const side = select(long.greaterThan(0.5), sz, sx.mul(2));   // +-1 the long walls, +-2 the gable ends
  return { a, Lw, y, E, side, long, area: hl.mul(hs).mul(4), mat: floor(rcolA.mul(255).add(0.5)), HW: fwidth(vec2(a, y)) };
}
const eqH = (a, v) => step(abs(a.sub(v)), 0.5);   // 1 where a equals v (a node; v a node or a number)
// the layout of a house wall: the storey, the bay, the window, the door (no derivatives: X holds them)
function houseLayout(K, X) {
  const { sd } = K, { a, Lw, y, E, side, long, area, HW } = X;
  const px = max(HW.x, HW.y), fw = clamp(px.mul(0.8), 0.07, 0.22);   // metres a pixel; a frame stays at least about a pixel wide until the window is a few pixels
  const r = k => h(vec2(sd.mul(1.731).add(k * 0.113), sd.mul(0.377).add(k * 0.619)));   // per building, 0..1, k: which
  const shed = max(step(area, 25), step(E, 1.5));   // a garden shed, a garage, a low outbuilding: no windows
  const nS = clamp(floor(E.div(2.62).add(0.35)), 1, 3), fh = E.div(nS);
  const fl = clamp(floor(y.div(fh)), 0, nS.sub(1)), yf = y.sub(fl.mul(fh));
  // dwellings along a long wall: one (detached), two (a semi-detached pair) or a terrace, 5 to 7.5 m a unit; every other
  // unit mirrored (handed pairs: the doors side by side or apart); then the unit's bays
  const nu = select(long.greaterThan(0.5), max(1, floor(Lw.div(r(16).mul(2.5).add(5)).add(0.3))), float(1)), uL = Lw.div(nu);
  const ui = clamp(floor(a.div(uL)), 0, nu.sub(1)), a0 = a.sub(ui.mul(uL)), au = select(mod(ui, 2).greaterThan(0.5), uL.sub(a0), a0);
  const nb = max(1, floor(uL.div(r(1).mul(1.1).add(2.3)).add(0.35))), bl = uL.div(nb);
  const bi = clamp(floor(au.div(bl)), 0, nb.sub(1)), ax = au.sub(bi.add(0.5).mul(bl));
  // the kind of window, by building: 40 % single portrait (sash), 22 % paired casements, 26 % wide (post-war), 12 % small (cottage)
  const v = r(2), vP = step(0.40, v).mul(step(v, 0.62)), vW = step(0.62, v).mul(step(v, 0.88)), vC = step(0.88, v), vS = float(1).sub(vP).sub(vW).sub(vC);
  const r3 = r(3), r4 = r(4);
  let ww = vS.mul(r3.mul(0.3).add(0.82)).add(vP.mul(1.3)).add(vW.mul(r3.mul(0.5).add(1.55))).add(vC.mul(0.75));
  let wh = vS.mul(r4.mul(0.25).add(1.32)).add(vP.mul(r4.mul(0.15).add(1.2))).add(vW.mul(1.12)).add(vC.mul(0.98));
  ww = min(select(long.greaterThan(0.5), ww, float(0.7)), bl.mul(0.72)); const sb = min(float(0.92).sub(eqH(fl, 0).mul(0.1)), fh.mul(0.3)), hw = ww.mul(0.5);   // (low walls, a common height in the data: smaller windows, lower sills)
  wh = min(min(select(long.greaterThan(0.5), wh, float(1.0)), fh.mul(0.56)), fh.sub(sb).sub(0.3));
  const dh = min(2.05, fh.mul(0.9));   // the door's height
  // a gable end: one small window on some storeys (by side and storey), else a blank wall
  const gwin = select(long.greaterThan(0.5), float(1), step(h(vec2(fl.add(side.mul(3.7)), sd.mul(5.3))), 0.45));
  const has = float(1).sub(shed).mul(gwin).mul(step(y, E)).mul(step(0.5, wh));
  // the door: the front (one long side, by building), the ground floor, one bay; a window in the other bays
  const front = long.mul(eqH(side, select(r(5).lessThan(0.5), float(1), float(-1))));
  const isDB = front.mul(eqH(bi, min(floor(r(6).mul(nb)), nb.sub(1)))).mul(eqH(fl, 0)).mul(float(1).sub(shed));
  const doff = r(7).sub(0.5).mul(max(0, bl.sub(1.3))), dx = abs(ax.sub(doff));
  const door = isDB.mul(step(dx, 0.46)).mul(step(y, dh)), dfr = isDB.mul(step(dx, fw.add(0.46))).mul(step(y, dh.add(fw))).mul(float(1).sub(door));
  const fan = door.mul(step(dh.mul(0.87), y)).mul(step(dx, 0.4));   // the fanlight or the door's glass
  const wOn = has.mul(float(1).sub(isDB)), inX = step(abs(ax), hw), inY = step(sb, yf).mul(step(yf, sb.add(wh)));
  const mull = vP.mul(long).mul(step(abs(ax), 0.05)), rail = vS.mul(step(r(8), 0.55)).mul(step(abs(yf.sub(sb.add(wh.mul(0.56)))), 0.035));
  const glass = wOn.mul(inX).mul(inY).mul(float(1).sub(mull)).mul(float(1).sub(rail));
  const frame = wOn.mul(step(abs(ax), hw.add(fw))).mul(step(sb.sub(fw.mul(0.3)), yf)).mul(step(yf, sb.add(wh).add(fw))).sub(glass);
  const frameP = max(frame, 0);
  const sill = wOn.mul(step(abs(ax), hw.add(fw.add(0.03)))).mul(step(sb.sub(fw.mul(1.4)), yf)).mul(step(yf, sb.sub(fw.mul(0.3))));
  const lint = wOn.mul(step(abs(ax), hw.add(0.12))).mul(step(sb.add(wh).add(0.07), yf)).mul(step(yf, sb.add(wh).add(0.25)));
  // garages (14 to 45 m2, low): an up-and-over door on one long side
  const gar = shed.mul(step(14, area)).mul(step(area, 45)).mul(step(E, 3.2)).mul(front).mul(step(abs(a.sub(Lw.mul(0.5))), 1.15)).mul(step(y, 2.0));
  const cov = wOn.mul(ww.mul(wh)).div(bl.mul(fh)).mul(select(long.greaterThan(0.5), float(1), float(0.45)));   // the windows' share of the wall (far: the mean)
  return { px, fl, fh, bi, ui, ax, yf, sb, wh, dh, glass, frame: frameP, sill, lint, door, dfr, fan, gar, cov, isDB, doff, shed, r };
}
// a house wall by day (sRGB albedo, before light)
function houseWall(K, X) {
  const { sd, base } = K, { a, y, mat, HW } = X, P = houseLayout(K, X), { r } = P;
  const px = P.px, det = float(1).sub(smoothstep(0.25, 0.45, px)), far = smoothstep(0.5, 1.3, px), fine = float(1).sub(smoothstep(0.012, 0.035, px));
  const c = vec3(base).toVar();
  const isB = max(eqH(mat, 2), eqH(mat, 5)), isS = eqH(mat, 3), isP = eqH(mat, 4), isW = eqH(mat, 6);
  // brick: 65 mm courses with 10 mm joints (75 mm), 215 mm bricks in stretcher bond; each brick its own shade; far: the mean with the mortar
  const row = floor(y.div(0.075)), bq = vec2(a.div(0.225).add(mod(row, 2).mul(0.5)), y.div(0.075)), bf = fract(bq);
  const mort = max(float(1).sub(step(0.05, bf.x)), float(1).sub(step(0.14, bf.y)));
  const bv = h(vec2(floor(bq.x), row).add(sd.mul(7.1))), MORT = vec3(0.70, 0.67, 0.61);
  const brick = mix(mix(c.mul(bv.mul(0.3).add(0.85)), MORT.mul(K.lum.mul(0.4).add(0.75)), mort), mix(c, MORT, 0.17), float(1).sub(fine));
  // stone: courses of 0.3 m, blocks 0.4 to 0.9 m
  const srow = floor(y.div(0.3)), sq = vec2(a.div(0.62).add(h(vec2(srow, sd)).mul(0.9)), y.div(0.3)), sf = fract(sq);
  const smort = max(float(1).sub(step(0.025, sf.x)), float(1).sub(step(0.06, sf.y)));
  const stone = mix(mix(c.mul(h(floor(sq).add(sd.mul(3.3))).mul(0.16).add(0.92)), c.mul(1.12), smort), c.mul(1.0), smoothstep(0.03, 0.09, px));
  // pebble-dash: a speckle of stones; render: a slow mottle; weatherboard: 0.18 m boards, a shadow under each
  const peb = mix(c.mul(h(floor(vec2(a, y).mul(28)).add(sd)).mul(0.2).add(0.9)), c, float(1).sub(fine));
  const board = c.mul(float(1).sub(step(fract(y.div(0.18)), 0.12).mul(0.25).mul(det)));
  c.assign(select(isB.greaterThan(0.5), brick, select(isS.greaterThan(0.5), stone, select(isP.greaterThan(0.5), peb, select(isW.greaterThan(0.5), board, c)))));
  c.mulAssign(float(1).add(vn(vec2(a.mul(0.4), y.mul(0.6)).add(sd.mul(50))).sub(0.5).mul(0.08)));   // weathering
  // tile-hung upper storeys (on brick): clay tiles in 0.1 m courses
  const tileC = vec3(0.55, 0.30, 0.21).mul(r(12).mul(0.25).add(0.85)), tq = vec2(a.div(0.165).add(mod(floor(y.div(0.1)), 2).mul(0.5)), y.div(0.1)), tf = fract(tq);
  const tile = mix(tileC.mul(h(floor(tq).add(sd)).mul(0.22).add(0.86)).mul(float(1).sub(step(0.82, tf.y).mul(0.3))), tileC.mul(0.92), float(1).sub(fine));
  c.assign(mix(c, tile, eqH(mat, 5).mul(step(P.fh, y)).mul(step(y, X.E))));
  // plinth: engineering brick or a painted band under the render
  c.assign(mix(c, select(isB.greaterThan(0.5), c.mul(0.7), mix(c.mul(0.6), vec3(0.38, 0.37, 0.35), 0.6)), step(y, 0.32)));
  // the window's surround: lintel (a soldier course or stone), sill, frame (white uPVC 70 %, else dark or brown)
  const frameC = select(r(9).lessThan(0.7), vec3(0.86, 0.86, 0.84), select(r(10).lessThan(0.5), vec3(0.15, 0.15, 0.15), vec3(0.32, 0.23, 0.16)));
  const lintC = select(isB.greaterThan(0.5).and(r(11).lessThan(0.6)), c.mul(0.78), vec3(0.76, 0.73, 0.67));
  c.assign(mix(c, lintC, P.lint.mul(det).mul(max(isB, isS))));
  c.assign(mix(c, select(isB.add(isS).greaterThan(0.5), vec3(0.78, 0.76, 0.71), frameC), P.sill.mul(det)));
  c.assign(mix(c, frameC, P.frame.mul(det).add(P.cov.mul(0.35).mul(far))));
  // the door: a colour by building (black, navy, red, green, white, oak, grey), glass at the top; its frame
  const dc = h(vec2(P.ui.mul(1.37).add(r(13)), sd.mul(0.71))), doorC = select(dc.lessThan(0.18), vec3(0.07, 0.07, 0.08), select(dc.lessThan(0.32), vec3(0.10, 0.14, 0.26), select(dc.lessThan(0.46), vec3(0.45, 0.10, 0.10),
    select(dc.lessThan(0.58), vec3(0.12, 0.25, 0.17), select(dc.lessThan(0.76), vec3(0.85, 0.85, 0.82), select(dc.lessThan(0.9), vec3(0.42, 0.28, 0.16), vec3(0.32, 0.34, 0.36)))))));
  c.assign(mix(c, doorC, P.door.mul(float(1).sub(far.mul(0.6)))));
  c.assign(mix(c, frameC, P.dfr.mul(det)));
  c.assign(mix(c, mix(vec3(0.82, 0.82, 0.80), vec3(0.30, 0.31, 0.32), step(0.6, r(14))).mul(float(1).sub(step(0.8, fract(y.div(0.25))).mul(0.15).mul(det))), P.gar));
  // glass: the sky in the upper panes, nets or curtains in some rooms
  const cell = vec2(P.bi.add(P.ui.mul(7)).add(X.side.mul(17)), P.fl), wy = clamp(P.yf.sub(P.sb).div(P.wh), 0, 1);
  const gl = mix(vec3(0.06, 0.08, 0.10), vec3(0.30, 0.36, 0.43), wy.mul(0.55).add(h(cell.add(sd)).mul(0.25)).mul(det).add(far.mul(0.25))).toVar();
  gl.assign(mix(gl, vec3(0.60, 0.58, 0.53), step(h(cell.add(sd.mul(3))), 0.28).mul(0.45).mul(det)));
  const wm = mix(max(P.glass, P.fan), P.cov.mul(0.65), far);
  return mix(c, gl, wm);
}
// a house wall by night: rooms lit by the clock (V.nP.x homes, V.nQ: the ground floor in the evening, upper floors late),
// in patches (neighbours alike), one fixture colour per room, curtains; a porch lamp by some front doors
function houseNight(K, X, V) {
  const { sd, gk } = K, { y, HW } = X, P = houseLayout(K, X), { r } = P;
  const px = max(HW.x, HW.y), far = smoothstep(0.7, 1.8, px), det = float(1).sub(smoothstep(0.05, 0.16, px));
  const p0 = V.nP.x.mul(select(P.fl.lessThan(0.5), V.nQ.x, V.nQ.z.mul(0.4).add(1)));
  const pl = clamp(p0.mul(vn(gk.xy.div(60)).mul(1.2).add(0.4)), 0, 0.95);
  const cell = vec2(P.bi.add(P.ui.mul(7)).add(X.side.mul(17)), P.fl), lit = step(h(cell.add(sd.mul(31))), pl);
  const u = h(cell.add(sd.mul(3.1))).mul(0.85).add(0.15);
  let HC = cct(pow(u, 2.0));
  const cur = step(h(cell.add(sd.mul(8.9))), 0.45);
  HC = mix(HC, HC.mul(mix(vec3(1, 0.88, 0.7), vec3(1, 0.74, 0.56), step(0.6, h(cell.add(4.4))))).mul(0.6), cur);
  const win = max(P.glass, P.fan.mul(0.8));
  const L = mix(HC.mul(h(cell.add(1.7)).mul(0.4).add(0.6)).mul(lit).mul(win), cct(float(0.25)).mul(pl).mul(P.cov).mul(0.9), far);
  const lamp = P.isDB.mul(step(length(vec2(P.ax.sub(P.doff).sub(0.68), y.sub(P.dh.add(0.2)))), 0.09)).mul(step(r(15), 0.45)).mul(step(0.05, V.nP.x)).mul(det);
  return L.add(vec3(1, 0.8, 0.5).mul(1.4).mul(lamp));
}
// city blocks other than houses: some variety of bay and storey by building (flats, estates, offices; not curtain walls or sheds)
function blockVary(K) {
  const on = step(0.5, K.LST).mul(step(K.LST, 4.5)), j = h(vec2(K.sd.mul(4.13).add(0.7), 0.29)), k = h(vec2(K.sd.mul(2.29).add(0.3), 0.61));
  K.BW = K.BW.mul(mix(float(1), j.mul(0.4).add(0.82), on)); K.FH = K.FH.mul(mix(float(1), k.mul(0.12).add(0.95), on));
}

// A place's buildings on the globe (globe/place-look.js; skill docklands-3d-page, "Three.js port: places look like the
// model"): the same facade program (lookWall, the Map window grid, nightNew / nightOld) on a place's core tiles and city
// blocks. Per vertex (or the nodes given in inst: { col, mcol, gk, rcol }, e.g. per-instance attributes of the city blocks): col (the Realistic colour and code, as the model: alpha 132 + style x 8
// + shopfront x 4 + storey class), mcol (the Map look's colour, alpha 0), gk (centre x, centre z, base, 1000 x night use +
// top; heights in the tile frame + OFF). The along-wall metres and the wall flag come from the face normal in the tile frame
// (no uw attribute: the tiles share wall vertices between faces), the height from the tile's local y (+ OFF, so the
// window rows count from the building's own base). V: the place's uniforms { night, nP, nQ, win, look (1 Realistic, 0
// Map), pix (1: the pixel-art palette V.pal, a uniformArray of vec3 sRGB, flat and unlit by night), winGain }.
export const PLACE_OFF = 400;
export function placeBuildingMaterial(V, inst = null, night = true) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide, flatShading: true });
  const src = () => {
    const pl = positionLocal, nL = normalize(cross(dFdx(pl), dFdy(pl))), wall = float(1).sub(step(0.42, abs(nL.y)));
    const t = normalize(vec2(nL.z.negate(), nL.x).add(vec2(1e-6, 0)));
    const A = k => inst ? inst[k] : attribute(k, 'vec4'), real = V.look.greaterThan(0.5), c0 = select(real, A('col'), A('mcol'));
    // city blocks: one record for the walls and the flat top, the top's colour apart (rcol)
    const col = inst && inst.rcol ? vec4(select(wall.greaterThan(0.5).or(real.not()), c0.rgb, inst.rcol.rgb), c0.a) : c0;
    return { col, uw: select(wall.greaterThan(0.5), dot(pl.xz, t), float(-1)), gk: A('gk'), wy: pl.y.add(PLACE_OFF), wall, pl, nL };
  };
  // the city blocks of the places with a box frame per instance (inst.bx, place-look.js blockInstAttrs): house walls
  // (houseWall, houseNight) on house-sized boxes, bay and storey variety on the others (blockVary); without bx (the core
  // tiles, the merged outlines' material has bx = 0 per vertex and takes the old path) the graph is as before
  const HB = !!(inst && inst.bx);
  const houseOf = (S, C) => { const X = houseFrame(S, C.gk, inst.bx, inst.rcol.a); for (const k of ['a', 'Lw', 'y', 'E', 'side', 'long', 'area', 'mat', 'HW']) X[k] = X[k].toVar(); return X; };
  m.colorNode = Fn(() => {
    const S = src(), C = facadeCommon(S), K = { ...C };
    if (HB) blockVary(K);
    for (const k of ['lum', 'sd', 'BW', 'FH', 'GF', 'LST', 'DW', 'wall', 'dist']) K[k] = K[k].toVar();
    const out = vec3(0).toVar();
    const lookOn = K.LST.greaterThan(-0.5).and(K.wall.greaterThan(0.5)).and(V.win.greaterThan(0.5));
    const doLook = () => { out.assign(lin(lookWall(K))); }, doMap = () => {
      const g = vec2(K.uw.div(1.8), K.wy.div(3.6)), cell = floor(g), f = fract(g);
      const w = step(0.14, f.x).mul(step(f.x, 0.86)).mul(step(0.2, f.y)).mul(step(f.y, 0.84)).mul(clamp(float(1.4).sub(K.dist.div(900)), 0.15, 1));
      const glass = mix(vec3(0.13, 0.18, 0.25), vec3(0.42, 0.52, 0.62), clamp(K.wy.sub(K.gk.z).div(300), 0, 1).add(h(cell).mul(0.12))).mul(K.lum.mul(0.7).add(0.55));
      out.assign(lin(mix(K.base, glass, w.mul(0.8).mul(K.wall).mul(V.win))));
    };
    if (HB) {
      K.base = K.base.toVar(); K.uw = K.uw.toVar();
      const X = houseOf(S, C), isH = K.LST.lessThan(0.5).and(inst.bx.z.greaterThan(0)).and(lookOn);
      If(isH, () => { out.assign(lin(houseWall(K, X))); }).ElseIf(lookOn, doLook).Else(doMap);
    } else If(lookOn, doLook).Else(doMap);
    // pixel art (styles.js): the nearest colour of the 33-colour palette (data/pixel-palette.json, V.pal), flat, no windows
    const pc = vec3(0.5).toVar(), bd = float(1e9).toVar();
    If(V.pix.greaterThan(0.5), () => { Loop(V.pal.array.length, ({ i }) => { const q = V.pal.element(i), dd = dot(K.base.sub(q), K.base.sub(q)); If(dd.lessThan(bd), () => { bd.assign(dd); pc.assign(q); }); }); });
    const px = lin(pc.mul(mix(float(0.86), float(1), K.wall)));
    return vec4(mix(out, px, V.pix), 1);
  })();
  // by night only (night false: a day material without the window lights; globe/place-look.js swaps the two when the
  // place's night begins or ends: an If on the night uniform still cost a quarter of the frame by day in software
  // rendering, where both sides of a branch run); the branch on uniforms also stays (dusk, pixel art)
  if (night) m.emissiveNode = Fn(() => {
    const E = vec3(0).toVar();
    If(V.night.greaterThan(0.001).and(V.pix.lessThan(0.5)), () => {
      const S = src(), C = facadeCommon(S), { gk, wy, wall, dist } = C;
      if (HB) blockVary(C);
      const ty = floor(gk.w.div(1000).add(0.001)), top = gk.w.sub(ty.mul(1000)), ht = max(1, top.sub(gk.z));
      let L = NIGHT_STYLE === 'old' ? nightOld(C, V) : nightNew(C, V);
      // houses: their own rooms (the same layout as by day); branch-free, so every derivative stays in uniform control flow
      if (HB) L = select(C.LST.lessThan(0.5).and(inst.bx.z.greaterThan(0)), houseNight(C, houseFrame(S, gk, inst.bx, inst.rcol.a), V).mul(wall).mul(V.win), L);
      const tb = top.sub(wy), band = step(90, ht).mul(step(tb, 3.5)).mul(step(0, tb)).mul(wall);
      L = L.add(vec3(0.32, 0.3, 0.27).mul(smoothstep(3.5, 0.5, tb)).mul(band));
      const hz = float(1).sub(exp(dist.div(-5200))).mul(0.6);
      E.assign(lin(L.mul(V.winGain).add(vec3(U.haze).mul(hz).mul(0.6))).mul(V.night));
    });
    return E;
  })();
  return m;
}

// terrain: the ground colour, or a ground image (aerial 2008, night 2012, LiDAR intensity 2020) through its box
export function terrainMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  m.userData.map = null;
  m.setGround = tex => {
    m.userData.map = tex; const g = vec3(0.38, 0.41, 0.4);
    // quay walls (build.js terrainGeometry: uv.y >= 2 along a water outline): dock wall stone, weathered granite and
    // concrete, #87827a, turning dark green-grey (#525447) from 1.3 to 1.9 m below the top (uv.y - 2: metres below the
    // top of the wall; the docks stand about 1.6 m under their quays): the weed line at the water
    const wy = uv().y.sub(2), wall = mix(vec3(0.53, 0.51, 0.48), vec3(0.32, 0.33, 0.28), smoothstep(1.3, 1.9, wy));
    m.colorNode = mix(tex ? lin(texture(tex, uv()).rgb.mul(1.15)) : lin(g), lin(wall), step(1.5, uv().y));
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
import { Loop, cos, sqrt, log } from 'three/tsl';   // (also used above: imports are hoisted)
import { surfaceData, SU, MAXW, wakeA, wakeB } from './water.js';
const wrap = q => q.sub(floor(q.div(256)).mul(256));   // the hash keeps its precision far from the origin and as time grows
const vnw = Fn(([q]) => { const i = floor(q), f0 = fract(q), f = f0.mul(f0).mul(float(3).sub(f0.mul(2))), a = wrap(i), b = wrap(i.add(1));
  return mix(mix(h(a), h(vec2(b.x, a.y)), f.x), mix(h(vec2(a.x, b.y)), h(b), f.x), f.y); });
const GRAV = 9.81;
// one band of the wave field: the slope (world x, z) of the tiling texture at wavelength lam m, in a frame turned rot rad
// from ax (unit: the direction the waves travel), moving along it at the deep-water phase speed (move = false: still);
// ch 0 = the directional pair (RG), 1 = the isotropic pair (BA). The time offset is taken modulo one tile (no drift in precision).
export function band(NT, pp, ax, lam, { rot = 0, jit = 0, ch = 0, move = true } = {}) {
  const c = Math.cos(rot), s = Math.sin(rot), a = vec2(ax.x.mul(c).sub(ax.y.mul(s)), ax.x.mul(s).add(ax.y.mul(c))), b = vec2(a.y.negate(), a.x), tile = lam * 10;
  let q = vec2(dot(pp, a), dot(pp, b)).div(tile).add(vec2(jit, jit * 0.37));
  if (move) q = q.sub(vec2(fract(time.mul(Math.sqrt(GRAV * lam / (2 * Math.PI)) / tile)), 0));
  const t = texture(NT, q), g = (ch ? t.ba : t.rg).mul(6).sub(3);
  return a.mul(g.x).add(b.mul(g.y));
}
export const BANDS = [[0.3, 0.5, 0.11], [0.8, -0.3, 0.53], [2.0, 0.2, 0.29], [5.0, -0.12, 0.71]];   // [wavelength m, turn rad, jitter]
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
  // chop: short-crested waves on tidal water (1.2 m and 3.1 m, every direction, carried by the current) at SU.chop (layers/wind.js:
  // the current, passing boats), steeper where the wind blows against the current (wind over tide); tuned on the
  // Greenland Pier photo of 2026-11-23 (flood 0.86 m/s, wind 1.5 m/s: short chop over the whole reach)
  const against = clamp(dot(dw, fv.div(max(length(fv), 0.05))).negate(), 0, 1).mul(smoothstep(1, 6, Ws));
  const chopA = SU.chop.mul(tidal).mul(float(1).add(against.mul(1.5)));
  const field = pp => BANDS.reduce((s, [lam, rot, jit], k) => s.add(band(NT, pp, dw, lam, { rot, jit }).mul(wts[k])), vec2(0, 0)).mul(sw)
    .add(band(NT, pp, vec2(1, 0), 3.0, { ch: 1, move: false, jit: 0.21 }).mul(boil))
    .add(band(NT, pp, vec2(0.6, 0.8), 1.2, { ch: 1, move: false, jit: 0.63 }).add(band(NT, pp, vec2(-0.8, 0.6), 3.1, { ch: 1, move: false, jit: 0.37 })).mul(chopA));
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
  // rain (SU.rain, layers/weather.js): rings from drops, one possible drop a 0.7 m cell, more cells live in heavier rain;
  // each ring runs out to 0.35 m in 1.1 s and fades; shown where a pixel is under 8 cm (they alias farther away, where
  // the rain roughens the mirror instead: below)
  const rc = floor(p.div(0.7)), rph = fract(time.div(1.1).add(h(rc.add(11.3)).mul(7))), rlive = step(float(1).sub(SU.rain.mul(0.85)), h(rc.add(29.7)));
  const rv = fract(p.div(0.7)).sub(0.5).sub(vec2(h(rc.add(3.3)), h(rc.add(8.9))).sub(0.5).mul(0.3)).mul(0.7), rd = length(rv), rr = rph.mul(0.35);
  const rq = rd.sub(rr).div(0.03), ring = exp(rq.mul(rq).negate()).mul(float(1).sub(rph)).mul(rlive).mul(smoothstep(0.08, 0.02, fw));
  g = g.add(rv.div(max(rd, 0.01)).mul(ring).mul(0.35).mul(SU.rain));
  // ice (SU.ice, layers/weather.js: from the freezing days): still water only, in patches that join as the cover grows;
  // under it no ripples, rings or glints
  const iceM = SU.ice.mul(float(1).sub(tidal)).mul(smoothstep(0.92, 1.0, vnw(p.div(28)).add(SU.ice.mul(1.25)))).toVar();
  g = g.mul(float(1).sub(iceM));
  const N = normalize(vec3(g.x.negate(), 1, g.y.negate()));
  m.normalNode = transformNormalToView(N);
  // far water: a wider glint where the ripples are under a pixel, wider with the wind; foam and cat's paws rough
  m.roughnessNode = float(0.04).add(SU.rain.mul(0.12)).add(iceM.mul(0.3)).add(smoothstep(2, 30, fw).mul(0.18)).add(min(Ws.mul(0.012), 0.14).mul(smoothstep(0.3, 4, fw))).add(foam.mul(0.4)).add(patch.mul(SU.gust).mul(0.06));
  const F0 = float(0.02).add(float(0.98).mul(pow(float(1).sub(clamp(dot(N, V), 0, 1)), 5)));
  // the water's own colour by the depth now (tidal: + WU.tideLevel - 2.75 m, the typical polygon level), deeper = darker and more green-blue (sRGB 0.33 0.45 0.43 at 0 m to 0.04 0.14 0.17 deep); foam pale
  const body = mix(lin(mix(vec3(0.33, 0.45, 0.43), vec3(0.04, 0.14, 0.17), float(1).sub(exp(depthNow.div(-3.5))))), lin(vec3(0.60, 0.67, 0.65)), foam.mul(0.55));
  // ice: grey-blue (thin, dark water seen through it) to white where snow lies on it (judged colours)
  const iceCol = mix(lin(vec3(0.50, 0.56, 0.60)), lin(vec3(0.88, 0.90, 0.93)), SU.iceSnow);
  m.colorNode = vec4(mix(body.mul(float(1).sub(F0.mul(float(1).sub(foam)))), iceCol, iceM), 1);
  const R = reflect(V.negate(), N), ry = clamp(R.y, 0, 1);
  // the moon's glitter: the facets of the chop that mirror the moon (a narrow lobe on the reflected view ray), on top of the
  // mirror image; the moon light itself stays weak (it lights the whole scene). Tuned on the owner's photo IMG_2587 of
  // 2026-11-23 (Greenland Dock, moon 98.7% lit, 26 deg up: sparkles to 78 x the sky; data/images/contrib/thames-2026-11-23/)
  // A narrow lobe on the smooth normals found nothing: the dock is nearly flat and the moon's mirror point lay 26 deg below
  // the horizon, outside the frame, while the photo's glitter lies a few degrees below it. Facets of the capillary ripples
  // tilt about 11 deg (slope spread 0.2, judged): a Beckmann-like lobe on the half vector, broken into separate glints by a
  // hash of 40 cm cells of the water.
  // the glints are 0.4 m cells on ripples of 1.2 and 3.1 m: where a cell is smaller than a pixel (fwidth: cells per pixel,
  // so for any field of view and screen) both alias to white noise over the whole river (render of 2026-11-24 02:47 from
  // the towerbridge view). There the cells give way to their mean (0.18 x 1.0), the normal to the flat water and the lobe
  // widens by the slopes it no longer resolves (mean square slope 0.012 to 0.04), its peak lowered by the same ratio so
  // the light per area stays the same.
  // Each glint is a small spot in its cell (radius about 0.11 of the cell, placed at random in it), 26 x brighter: near
  // the camera a whole cell drew a white square (render of IMG_2587, 2026-11-24). 6 % of the cells have a glint (was 18 %:
  // with spots that made a grey sheen over the dock where the photo is dark with a few glints); mean 0.06. The cells give
  // way to the mean from where a spot is smaller than a pixel (0.12 to 0.4 cells per pixel).
  const cpp = fwidth(p.x.mul(2.5)).add(fwidth(p.y.mul(2.5))), far = smoothstep(0.12, 0.4, cpp), gc = floor(p.mul(2.5));
  const gj = vec2(h(gc.add(3.1)), h(gc.add(5.7))).sub(0.5).mul(0.6), spot = smoothstep(0.16, 0.06, length(fract(p.mul(2.5)).sub(0.5).sub(gj)));
  const glint = mix(step(0.94, h(gc)).mul(float(0.6).add(h(gc.add(17.3)).mul(0.8))).mul(spot).mul(26), float(0.06), far);
  // the lobe near: mean square slope 0.012 (Cox and Munk 1954, about 1.5 m/s of wind; 0.04 before 2026-11-24 made the
  // glitter path on IMG_2587 about five times too wide)
  // the near lobe's mean square slope from the wind (SU.slope2, layers/wind.js) and the rain; the far lobe at least 0.04
  const sN = SU.slope2.add(SU.rain.mul(0.02)), s2 = mix(sN, max(sN, 0.04), far), Ng = normalize(mix(N, vec3(0, 1, 0), far));
  const Hm = normalize(V.add(SU.moonDir)), cth = max(dot(Hm, Ng), 0.05), t2 = float(1).sub(cth.mul(cth)).div(cth.mul(cth));
  const moonSpark = vec3(1.0, 0.96, 0.88).mul(exp(t2.div(s2.negate())).mul(float(0.012).div(s2))).mul(glint).mul(SU.moonGlint).mul(float(1).sub(foam)).mul(float(1).sub(iceM));
  const sky = mix(mix(vec3(WU.skyHorizon), vec3(WU.skyZenith), pow(ry, 0.6)), mix(lin(vec3(U.haze)).mul(0.8), vec3(0.003, 0.004, 0.008), pow(ry, 0.5)), U.night);
  const dark = float(1).sub(patch.mul(SU.gust).mul(0.3)).mul(float(1).sub(foam.mul(0.8)));   // cat's paws darker, foam no mirror
  m.setReflector = r => {
    let refl = sky;
    // ripples stretch reflected lights into vertical streaks (as on a real river at night): seven samples of the mirror along
    // screen y (a streak about 4 % of the screen high, weighted to its middle), shifted a little by screen-space noise. A crisp
    // mirror read as a copy of the city; one displaced sample broke the window rows into zigzags (2026-10-08)
    if (r) {
      const st = vnw(vec2(screenUV.x.mul(160), screenUV.y.mul(6).add(time.mul(0.25)))).sub(0.5);
      const cm = SU.chop.mul(SU.chopMirror).mul(tidal).add(SU.rain.mul(0.012)).add(iceM.mul(0.02));   // the chop (tidal water only), rain and ice break the image of the shore
      const base = r.uvNode.add(vec2(N.x.mul(clamp(float(6).div(dist), 0.002, 0.02)), st.mul(SU.streak))).add(vec2(N.x, N.z).mul(cm));   // the random offset as long as one step: dashes, not copies
      let acc = null, wsum = 0;
      for (let k = -3; k <= 3; k++) { const w = 4 - Math.abs(k), smp = r.sample(base.add(vec2(0, SU.streak.mul(k)))).rgb.mul(w); acc = acc ? acc.add(smp) : smp; wsum += w; }
      refl = acc.div(wsum).mul(0.75);
      // the long tails of bright lights by night (the owner's photo IMG_2587 of 2026-11-23: the quay lights' reflections
      // run about 10 deg down the dock, a quarter of the frame; the 7 samples above smear them over about 4 %): 8 more
      // samples up to +-SU.tail of the screen, thresholded so that only lights leave a tail, each fading with its offset,
      // the strongest kept, broken into dashes by thin columns of noise. By night only: by day the sun glitter has its own
      // term and the shore's image must stay sharp.
      // in a branch on the night uniform (uniform control flow): by day the 8 samples are not taken (2026-11-24)
      const tail = Fn(() => { const t = vec3(0).toVar(); If(U.night.greaterThan(0.01), () => { let a = null;
        for (const f of [-1, -0.62, -0.34, -0.14, 0.14, 0.34, 0.62, 1]) {
          const c = max(r.sample(base.add(vec2(0, SU.tail.mul(f)))).rgb.sub(0.25), vec3(0)).mul(1.15 - Math.abs(f));
          a = a ? max(a, c) : c; }
        t.assign(a); }); return t; })();
      const dash = smoothstep(0.35, 0.75, vnw(vec2(screenUV.x.mul(260), screenUV.y.mul(28).add(time.mul(0.4)))));
      refl = refl.add(tail.mul(dash).mul(0.9).mul(U.night).mul(float(1).add(SU.rain)).mul(float(1).sub(iceM)));
      refl = refl.mul(float(1).sub(SU.rain.mul(0.3))).mul(float(1).sub(iceM.mul(0.75)));   // rain and ice: a weaker image
    }
    m.emissiveNode = refl.mul(F0).mul(dark).add(moonSpark); WU.reflect.value = r ? 1 : 0; m.needsUpdate = true;
  };
  m.setReflector(opts.reflector || null);
  return m;
}

export function vertexColourMaterial(opts = {}) {
  const { cut, ...rest } = opts, m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide, ...rest });
  m.colorNode = opts.cut === false ? lin(attribute('color', 'vec3')) : Fn(() => { If(positionWorld.y.greaterThan(U.cut), () => { Discard(); }); return lin(attribute('color', 'vec3')); })();
  return m;
}
