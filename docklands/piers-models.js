// Low-poly models for the "piers" layer of the Three.js port (docklands/layers/piers.js): HMS Belfast at true size, the
// berthed historic vessels by type, and the service boats that lie alongside the piers (river-bus catamaran, tour boat,
// small ferry). Local frame of every model: metres, x = starboard, y = up (0 = the waterline), z = aft (the bow at -L/2),
// as the ships layer. Flat-shaded triangles with linear vertex colours and two extra attributes: glow (1 = a window or lamp
// that lights by night) and camo (1 = painted in the camouflage of vesselMaterial). Liveries are generic: no names, no
// logos. Skill: docklands-3d-page, "Three.js port" (Piers and berthed vessels).
import * as THREE from 'three/webgpu';
import { Fn, attribute, vec3, float, floor, fract, sin, mix, step, select, abs } from 'three/tsl';

const C = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };   // sRGB hex to linear (ColorManagement)
export const PAL = {
  // HMS Belfast, Admiralty Disruptive Camouflage Type 25 (approximate shades: 507A dark grey, 507C light grey, B5 blue,
  // dark blue-grey); decks dark grey; boot topping black
  b507a: C('#5a5f63'), b507c: C('#b4b8b7'), bB5: C('#6a8698'), bDBG: C('#3e4b58'), bDeck: C('#4c4f50'), boot: C('#1a1a1a'), antif: C('#6b2a22'),
  steelDark: C('#2a2e33'), white: C('#eceeee'), glass: C('#1d2a33'), navy: C('#1b2433'), black: C('#151719'), red: C('#a52a26'),
  ccNavy: C('#1e3363'), ccRed: C('#b0262b'), trsRed: C('#7d1f24'), buff: C('#c9b48a'), wood: C('#7a5a3c'), grey: C('#8d9296'),
  lvRed: C('#b3262a'), rust: C('#7a3b24'), canvas: C('#d9d3c3'), lamp: C('#ffd9a0'),
};

// ---------- the geometry builder
export class GB {
  constructor() { this.p = []; this.c = []; this.g = []; this.m = []; }
  tri(a, b, c, col, glow = 0, camo = 0) { this.p.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) { this.c.push(...col); this.g.push(glow); this.m.push(camo); } }
  quad(a, b, c, d, col, glow, camo) { this.tri(a, b, c, col, glow, camo); this.tri(a, c, d, col, glow, camo); }
  // an axis-aligned box (optionally turned by ry about y) from its centre and size; o: { glow, camo, top (colour of the top face) }
  box(cx, cy, cz, sx, sy, sz, col, o = {}) {
    const ry = o.ry || 0, cs = Math.cos(ry), sn = Math.sin(ry), P = (x, y, z) => [cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs];
    const x = sx / 2, y = sy / 2, z = sz / 2, v = [P(-x, -y, -z), P(x, -y, -z), P(x, y, -z), P(-x, y, -z), P(-x, -y, z), P(x, -y, z), P(x, y, z), P(-x, y, z)];
    const F = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]];
    F.forEach((f, i) => this.quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], i === 4 && o.top ? o.top : col, o.glow || 0, o.camo || 0));
  }
  // a rod (cylinder or elliptic cylinder) from p0 to p1; r, or rx and rz for a vertical rod
  rod(p0, p1, r, col, o = {}) {
    const n = o.seg || 8, d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(...d), w = d.map(v => v / L);
    const a = Math.abs(w[1]) < .9 ? [0, 1, 0] : [0, 0, 1], u = norm(cross(a, w)), v = cross(w, u), rx = o.rx || r, rz = o.rz || r;   // vertical: u = x (rx), v = z (rz)
    const ring = (p, k) => { const t = k / n * 2 * Math.PI, cx = Math.cos(t) * rx, cz = Math.sin(t) * rz; return [p[0] + u[0] * cx + v[0] * cz, p[1] + u[1] * cx + v[1] * cz, p[2] + u[2] * cx + v[2] * cz]; };
    for (let k = 0; k < n; k++) { const a0 = ring(p0, k), a1 = ring(p0, k + 1), b0 = ring(p1, k), b1 = ring(p1, k + 1); this.quad(a0, a1, b1, b0, col, o.glow || 0, o.camo || 0);
      if (o.caps !== false) { this.tri(p1, b0, b1, o.capCol || col, o.glow || 0, o.camo || 0); this.tri(p0, a1, a0, col, o.glow || 0, o.camo || 0); } }
  }
  // a hull lofted through N stations; o: { L, B, draft, free(t) (deck height at t, 0 = bow, 1 = stern), half(t) (half-beam
  // fraction), col, boot, deck, camo, xoff, keel (0..1: the bottom's width fraction) }
  hull(o) {
    const N = o.n || 26, xo = o.xoff || 0, boot = o.boot || PAL.boot, keel = o.keel ?? .35, S = [];
    for (let i = 0; i <= N; i++) { const t = i / N, z = -o.L / 2 + t * o.L, hb = Math.max(.02, o.B / 2 * o.half(t)), f = o.free(t), d = o.draft * (t < .06 ? .4 + t / .06 * .6 : 1);
      S.push({ z, f, pts: [[hb, f], [hb * .99, .5], [hb * .97, -.1], [hb * .86, -d * .55], [hb * keel, -d]] }); }
    const P = (x, y, z) => [xo + x, y, z], segCol = k => k === 0 ? o.col : k === 1 ? boot : PAL.antif;
    for (let i = 0; i < N; i++) { const A = S[i], Bq = S[i + 1];
      for (let k = 0; k < 4; k++) { const [a0, a1] = [A.pts[k], A.pts[k + 1]], [b0, b1] = [Bq.pts[k], Bq.pts[k + 1]], cam = k === 0 ? o.camo || 0 : 0;
        this.quad(P(a0[0], a0[1], A.z), P(b0[0], b0[1], Bq.z), P(b1[0], b1[1], Bq.z), P(a1[0], a1[1], A.z), segCol(k), 0, cam);   // starboard
        this.quad(P(-a0[0], a0[1], A.z), P(-a1[0], a1[1], A.z), P(-b1[0], b1[1], Bq.z), P(-b0[0], b0[1], Bq.z), segCol(k), 0, cam); }   // port
      this.quad(P(-A.pts[4][0], A.pts[4][1], A.z), P(A.pts[4][0], A.pts[4][1], A.z), P(Bq.pts[4][0], Bq.pts[4][1], Bq.z), P(-Bq.pts[4][0], Bq.pts[4][1], Bq.z), PAL.antif);   // bottom
      // deck (a step in the deck height gets a riser)
      this.quad(P(-A.pts[0][0], A.f, A.z), P(A.pts[0][0], A.f, A.z), P(Bq.pts[0][0], A.f, Bq.z), P(-Bq.pts[0][0], A.f, Bq.z), o.deck || PAL.bDeck);
      if (Math.abs(Bq.f - A.f) > .05) { const hi = Math.max(A.f, Bq.f), lo = Math.min(A.f, Bq.f), hb = Bq.pts[0][0]; this.quad(P(-hb, lo, Bq.z), P(hb, lo, Bq.z), P(hb, hi, Bq.z), P(-hb, hi, Bq.z), o.col, 0, o.camo || 0); }
    }
    for (const [Sx, sgn] of [[S[0], -1], [S[N], 1]]) {   // bow and stern faces
      const c = P(0, Sx.f / 2 - o.draft / 2, Sx.z), ring = [...Sx.pts.map(([x, y]) => P(x, y, Sx.z)), ...[...Sx.pts].reverse().map(([x, y]) => P(-x, y, Sx.z))];
      for (let k = 0; k < ring.length - 1; k++) sgn > 0 ? this.tri(c, ring[k], ring[k + 1], o.col, 0, o.camo || 0) : this.tri(c, ring[k + 1], ring[k], o.col, 0, o.camo || 0);
    }
    return S;
  }
  geometry() {
    const G = new THREE.BufferGeometry();
    G.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); G.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    G.setAttribute('glow', new THREE.Float32BufferAttribute(this.g, 1)); G.setAttribute('camo', new THREE.Float32BufferAttribute(this.m, 1));
    G.computeVertexNormals(); G.computeBoundingSphere(); G.computeBoundingBox(); return G;
  }
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };

// ---------- the material: vertex colours, the camouflage where camo = 1, windows and lamps lit by night
export function vesselMaterial(night, o = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: o.roughness ?? .7, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  const col = attribute('color', 'vec3'), glow = attribute('glow', 'float'), camo = attribute('camo', 'float'), p = attribute('position', 'vec3');
  const hash = Fn(([x]) => fract(sin(x.mul(12.9898).add(4.1)).mul(43758.5453)));
  const L = (a) => vec3(...a);
  // Type 25 approximation: panels along the length (23 m), each cut by slanted edges whose slope changes panel to panel
  const camoCol = Fn(() => {
    const seg = floor(p.z.div(23)), slope = hash(seg).mul(2.6).sub(1.3), u = p.z.add(p.y.mul(slope)), k = floor(u.div(10.5)), r = hash(k.add(seg.mul(7.13)));
    const a = mix(L(PAL.b507a), L(PAL.b507c), step(.3, r)), b = mix(a, L(PAL.bB5), step(.6, r));
    return mix(b, L(PAL.bDBG), step(.85, r));
  });
  m.colorNode = mix(col, camoCol(), camo);
  // windows and lamps: warm light by night, whatever their day colour; o.flood: the whole hull lit by floodlights by night (a museum ship: HMS Belfast)
  const surf = mix(col, camoCol(), camo);
  m.emissiveNode = vec3(1, .8, .55).mul(glow).mul(night).mul(o.glowGain ?? 1.4).add(surf.mul(night).mul(o.flood ?? 0));
  return m;
}

// ---------- HMS Belfast (Town-class light cruiser, Edinburgh group), L 187 m. t: fraction of the length from the bow.
export function belfast(L = 187, B = 21) {
  const g = new GB(), Z = t => -L / 2 + t * L, cam = { camo: 1 };
  const FC = 7.9, QD = 5.4;   // forecastle and quarterdeck heights above the waterline (m, approximate)
  const half = t => t < .34 ? Math.pow(Math.sin(Math.min(1, t / .34) * Math.PI / 2), .85) * .97 + .03 : t < .74 ? 1 : 1 - (t - .74) / .26 * .42;
  // scuttles (portholes): two rows along each side below the weather deck, every 3.6 m, about half lit by night (the
  // OSM outline drawn as a building showed lit windows over the whole hull, and the model without them went dark, 2026-10-09)
  let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let z = -L / 2 + 14; z < L / 2 - 10; z += 3.6) { const t = (z + L / 2) / L, deck = t < .12 ? FC + (.12 - t) / .12 * 2.6 : t < .64 ? FC : QD, x = half(t) * B / 2 + .06;
    for (const y of [deck - 1.7, deck - 3.6]) if (y > 1.2) for (const sgn of [-1, 1]) { const lit = rnd() < .55; g.box(sgn * x, y, z, .12, .5, .5, lit ? PAL.lamp : PAL.glass, { glow: lit ? 1.1 : 0 }); } }
  g.hull({ L, B, draft: 6, col: PAL.b507a, camo: 1, deck: PAL.bDeck, keel: .3, n: 40,
    free: t => t < .12 ? FC + (.12 - t) / .12 * 2.6 : t < .64 ? FC : QD,
    half: t => t < .34 ? Math.pow(Math.sin(Math.min(1, t / .34) * Math.PI / 2), .85) * .97 + .03 : t < .74 ? 1 : 1 - (t - .74) / .26 * .42 });
  // turrets: A and B forward (B superfiring), X (superfiring) and Y aft; three 6-inch barrels each
  const turret = (t, deck, raise, aft) => {
    const z = Z(t), y0 = deck + raise;
    if (raise) g.rod([0, deck, z], [0, y0, z], 4.4, PAL.b507a, { seg: 12, ...cam });   // barbette
    g.box(0, y0 + 1.6, z, 8.6, 3.2, 9.5, PAL.b507a, { ...cam, top: PAL.bDBG });
    g.box(0, y0 + 1.1, z + (aft ? 5.2 : -5.2), 7.6, 2.2, 1.2, PAL.b507c, cam);   // the sloped gun face, as a step
    for (const x of [-2.1, 0, 2.1]) { const zs = z + (aft ? 5.6 : -5.6), ze = zs + (aft ? 9.5 : -9.5); g.rod([x, y0 + 1.5, zs], [x, y0 + 1.5 + .35, ze], .28, PAL.steelDark, { seg: 6 }); }
  };
  turret(.165, FC, 0, false); turret(.23, FC, 2.6, false); turret(.715, QD, 2.6, true); turret(.785, QD, 0, true);
  // bridge superstructure (three tiers, the open bridge with its wings, the director on top)
  g.box(0, FC + 1.6, Z(.325), 13, 3.2, 20, PAL.b507c, cam); g.box(0, FC + 4.6, Z(.315), 11, 2.8, 15, PAL.b507a, cam);
  g.box(0, FC + 7.3, Z(.305), 15, 2.4, 8, PAL.b507c, cam); g.box(0, FC + 8.9, Z(.302), 9, 1.2, 5, PAL.glass, { glow: .4 });
  g.rod([0, FC + 9.5, Z(.312)], [0, FC + 12.5, Z(.312)], 1.6, PAL.bDBG, { seg: 10 }); g.box(0, FC + 13.4, Z(.312), 4.4, 2, 4, PAL.b507a, cam);
  // tripod foremast with yard and topmast
  const fm = Z(.37), mt = 37;
  g.rod([0, FC + 6, fm], [0, mt, fm], .45, PAL.b507c); g.rod([0, mt, fm], [0, mt + 7, fm], .18, PAL.steelDark);
  for (const s of [-1, 1]) g.rod([s * 3.2, FC + 4, fm + 4], [0, mt - 6, fm], .35, PAL.b507c);
  g.rod([-5, mt - 4, fm], [5, mt - 4, fm], .15, PAL.steelDark); g.box(0, mt - 1, fm, 2.6, 1.8, 2.6, PAL.bDBG);
  // funnels: oval, raked a little aft, black caps
  for (const t of [.435, .575]) { const z = Z(t); g.rod([0, FC, z], [0, FC + 13.5, z + 1.2], 0, PAL.b507a, { rx: 2.3, rz: 3.6, seg: 12, ...cam }); g.rod([0, FC + 13.5, z + 1.2], [0, FC + 14.6, z + 1.3], 0, PAL.black, { rx: 2.35, rz: 3.65, seg: 12 }); }
  // midships block between the funnels (former hangars) and the boat decks
  g.box(0, FC + 2, Z(.505), 12.5, 4, 21, PAL.b507c, cam); g.box(0, FC + 4.4, Z(.505), 9, .8, 17, PAL.bDeck);
  // 4-inch twin high-angle mounts beside the funnels and directors
  for (const s of [-1, 1]) for (const t of [.47, .54]) { const z = Z(t), x = s * 7.2; g.box(x, FC + 1.3, z, 3, 2.2, 3.4, PAL.b507a, cam); for (const dx of [-.5, .5]) g.rod([x + dx, FC + 1.8, z - 1.5], [x + dx, FC + 3.6, z - 5.5], .12, PAL.steelDark, { seg: 5 }); }
  for (const s of [-1, 1]) { g.rod([s * 5, FC + 4, Z(.505)], [s * 9, FC + 9, Z(.53)], .25, PAL.steelDark, { seg: 5 }); }   // boat cranes
  // after superstructure, after director and the tripod mainmast
  g.box(0, FC + 1.9, Z(.615), 11, 3.8, 12, PAL.b507a, cam); g.box(0, FC + 5, Z(.615), 5, 2.4, 5, PAL.b507c, cam);
  const mm = Z(.635), mt2 = 31; g.rod([0, FC + 4, mm], [0, mt2, mm], .4, PAL.b507c); g.rod([0, mt2, mm], [0, mt2 + 5, mm], .15, PAL.steelDark);
  for (const s of [-1, 1]) g.rod([s * 3, FC, mm - 4], [0, mt2 - 7, mm], .3, PAL.b507c);
  g.rod([-4, mt2 - 3, mm], [4, mt2 - 3, mm], .12, PAL.steelDark);
  // jack staff and ensign staff; mast-head and deck lamps (by night)
  g.rod([0, FC + 2.6, Z(.005)], [0, FC + 7, Z(.005)], .1, PAL.steelDark, { seg: 4 }); g.rod([0, QD, Z(.995)], [0, QD + 5, Z(.995)], .1, PAL.steelDark, { seg: 4 });
  for (const [y, z] of [[mt + 7.2, fm], [mt2 + 5.2, mm]]) g.box(0, y, z, .7, .7, .7, PAL.lamp, { glow: 3 });
  for (let t = .08; t < .95; t += .07) for (const s of [-1, 1]) g.box(s * (B / 2 - .8), (t < .64 ? FC : QD) + 1.4, Z(t), .3, .3, .3, PAL.lamp, { glow: 1.5 });
  return g.geometry();
}

// ---------- the boats alongside (generic liveries)
// river-bus catamaran (high-speed passenger catamaran, about 38 m): two demihulls, a long glazed saloon, the wheelhouse forward
export function clipper(L = 38, B = 8.6) {
  const g = new GB(), dh = B * .26;
  for (const s of [-1, 1]) g.hull({ L, B: dh, draft: 1.3, xoff: s * (B / 2 - dh / 2), col: PAL.navy, deck: PAL.navy, keel: .3, n: 14,
    free: () => 1.5, half: t => t < .2 ? .25 + .75 * Math.sin(t / .2 * Math.PI / 2) : 1 });
  g.box(0, 1.35, 1, B, .5, L * .92, PAL.navy);   // cross deck
  const z0 = -L * .3, z1 = L * .38, zc = (z0 + z1) / 2, lz = z1 - z0;
  g.box(0, 2.0, zc, B * .94, .8, lz, PAL.white); g.box(0, 3.0, zc, B * .95, 1.25, lz - .6, PAL.glass, { glow: 1 }); g.box(0, 3.8, zc, B * .9, .4, lz, PAL.white);
  g.box(0, 4.6, z0 + 3.2, B * .55, 1.2, 4.2, PAL.glass, { glow: .6, top: PAL.white }); g.box(0, 5.25, z0 + 3.2, B * .58, .15, 4.6, PAL.white);
  g.rod([0, 5.3, z0 + 4], [0, 7.2, z0 + 4], .08, PAL.white, { seg: 4 }); g.box(0, 7.3, z0 + 4, .3, .3, .3, PAL.lamp, { glow: 3 });
  g.box(0, 2.2, z1 + 2.5, B * .8, .9, 4, PAL.white);   // the stern deck and its rail
  return g.geometry();
}
// tour boat (about 30 to 35 m): a monohull, a glazed lower saloon and an open upper deck with seats and a canopy aft
export function tourBoat(L = 34, B = 7.6, livery = 'citycruises') {
  const g = new GB(), band = livery === 'trs' ? PAL.trsRed : PAL.ccNavy;
  g.hull({ L, B, draft: 1.4, col: PAL.white, deck: PAL.grey, keel: .5, n: 18, free: t => 1.4 + (t < .1 ? (.1 - t) * 4 : 0), half: t => t < .25 ? .3 + .7 * Math.sin(t / .25 * Math.PI / 2) : t > .92 ? 1 - (t - .92) * 1.2 : 1 });
  for (const s of [-1, 1]) g.box(s * (B / 2 + .02), .9, 0, .06, .5, L * .8, band);
  if (livery !== 'trs') for (const s of [-1, 1]) g.box(s * (B / 2 + .03), .55, 0, .06, .14, L * .75, PAL.ccRed);
  const z0 = -L * .28, z1 = L * .42, zc = (z0 + z1) / 2, lz = z1 - z0;
  g.box(0, 2.6, zc, B * .9, 2.4, lz, PAL.glass, { glow: 1 }); g.box(0, 3.9, zc, B * .92, .25, lz + .4, PAL.white);
  for (const s of [-1, 1]) g.box(s * B * .45, 4.5, zc, .06, .9, lz, PAL.white);   // the upper deck rail
  for (let z = z0 + 2; z < z1 - 6; z += 2.2) g.box(0, 4.3, z, B * .7, .4, .7, band);   // bench rows
  g.box(0, 5.9, z1 - 3, B * .85, .15, 6, PAL.canvas); for (const s of [-1, 1]) g.rod([s * B * .4, 4, z1 - 3], [s * B * .4, 5.85, z1 - 3], .06, PAL.white, { seg: 4 });
  g.box(0, 4.6, z0 + 1.6, 2.6, 1.4, 2.4, PAL.glass, { glow: .5, top: PAL.white });   // wheelhouse
  g.box(0, 6.2, z0 + 1.6, .3, .3, .3, PAL.lamp, { glow: 3 });
  return g.geometry();
}
// small passenger ferry (cross-river shuttle, about 24 m)
export function ferryBoat(L = 24, B = 7) {
  const g = new GB(), dh = B * .3;
  for (const s of [-1, 1]) g.hull({ L, B: dh, draft: 1.1, xoff: s * (B / 2 - dh / 2), col: PAL.navy, deck: PAL.navy, n: 10, free: () => 1.3, half: t => t < .2 ? .3 + .7 * Math.sin(t / .2 * Math.PI / 2) : 1 });
  g.box(0, 1.2, 0, B, .4, L * .9, PAL.navy);
  g.box(0, 2.4, 0, B * .85, 2, L * .55, PAL.glass, { glow: 1 }); g.box(0, 3.5, 0, B * .9, .25, L * .6, PAL.white);
  g.box(0, 4.2, -L * .18, 2.4, 1.2, 2.2, PAL.glass, { glow: .5, top: PAL.white }); g.box(0, 5, -L * .18, .3, .3, .3, PAL.lamp, { glow: 3 });
  return g.geometry();
}
// the historic and other permanently berthed vessels, by type, sized by their OSM outline
export function berthed(kind, L, B) {
  const g = new GB();
  if (kind === 'lightvessel') {   // red hull, white upperworks, the lantern tower amidships
    g.hull({ L, B, draft: 3, col: PAL.lvRed, deck: PAL.wood, n: 16, free: t => 3 + (t < .2 ? (.2 - t) * 5 : 0), half: t => t < .3 ? .2 + .8 * Math.sin(t / .3 * Math.PI / 2) : t > .85 ? 1 - (t - .85) * 2.2 : 1 });
    g.box(0, 4.2, L * .18, B * .55, 2.4, L * .25, PAL.white); g.rod([0, 3, -L * .05], [0, 12, -L * .05], .9, PAL.lvRed, { seg: 8 }); g.rod([0, 12, -L * .05], [0, 14.2, -L * .05], 1.4, PAL.glass, { seg: 10, glow: 2 }); g.rod([0, 14.2, -L * .05], [0, 15, -L * .05], 1.5, PAL.lvRed, { seg: 10 });
  } else if (kind === 'tug') {   // black hull, buff upperworks, black funnel
    g.hull({ L, B, draft: 2.8, col: PAL.black, deck: PAL.wood, n: 14, free: t => 2 + (t < .25 ? (.25 - t) * 4 : 0), half: t => t < .3 ? .3 + .7 * Math.sin(t / .3 * Math.PI / 2) : 1 - Math.max(0, t - .8) * 1.5 });
    g.box(0, 3.4, -L * .08, B * .6, 2.6, L * .35, PAL.buff); g.box(0, 5.3, -L * .16, B * .5, 1.2, L * .14, PAL.glass, { glow: .6, top: PAL.white });
    g.rod([0, 4.5, L * .05], [0, 8.5, L * .07], .9, PAL.black, { seg: 8 });
  } else if (kind === 'barge') {   // a flat barge with a building on it (the floating church at West India Quay)
    g.hull({ L, B, draft: 1.5, col: PAL.navy, deck: PAL.grey, n: 6, keel: .9, free: () => 1, half: t => t < .05 ? .85 : 1 });
    g.box(0, 3, 0, B * .85, 4, L * .8, PAL.white, { top: PAL.grey }); g.box(0, 3, 0, B * .87, 1.2, L * .7, PAL.glass, { glow: 1 });
    for (const s of [-1, 1]) g.quad([0, 6.6, -L * .4], [s * B * .44, 5, -L * .4], [s * B * .44, 5, L * .4], [0, 6.6, L * .4], PAL.steelDark);
  } else {   // a steam coaster or other ship: black hull, superstructure aft, funnel, two masts
    g.hull({ L, B, draft: 2.6, col: PAL.black, deck: PAL.wood, n: 18, free: t => 2.2 + (t < .15 ? (.15 - t) * 6 : 0), half: t => t < .3 ? .2 + .8 * Math.sin(t / .3 * Math.PI / 2) : t > .85 ? 1 - (t - .85) * 2 : 1 });
    g.box(0, 3.4, L * .22, B * .7, 2.4, L * .22, PAL.white); g.box(0, 5.2, L * .16, B * .55, 1.2, L * .1, PAL.glass, { glow: .6, top: PAL.white });
    g.rod([0, 4.6, L * .28], [0, 10.5, L * .3], .8, PAL.black, { seg: 8 });
    g.rod([0, 2, -L * .3], [0, 13, -L * .3], .18, PAL.wood, { seg: 5 }); g.rod([0, 2, L * .42], [0, 11, L * .42], .16, PAL.wood, { seg: 5 });
  }
  return g.geometry();
}
