// Low-poly vessel models for the Three.js port: the AIS ships (layers/ships.js) by type, and the generic boats at known
// moorings (moored-boats.js, layer river, part "Moorings and houseboats"). Owner, 2026-10-11: "Also the rendered boats,
// can we make them more realistic? And add generic barge outline shaped boats where we know residential moorings are
// positioned?"
// Local frame (as piers-models.js): metres, x = starboard, y = up (0 = the waterline), z = aft (the bow at -L/2). Each model
// is made once at a reference length L0 and beam B0 and drawn as one InstancedMesh, scaled per instance (x by beam / B0,
// z by length / L0, y by a milder factor). Hulls are lofted through stations: sheer (the deck rises to the bow), flare
// (the deck edge a little wider than the waterline), a raked stem, a transom or swim ends, a boot-top band at the waterline
// and dark antifouling below it. Vertex colours plus the attribute gp = (glow, paint): glow 1 = a window that lights by
// night; paint 1 takes the instance colour `tint`, paint 2 the instance colour `tint2` (cabin and hull colours vary by a
// seeded hash, so one place always shows the same boats). Liveries are generic: no names, no logos.
// Skill: docklands-3d-page, "Three.js port: boats and moored barges (2026-10-11)".
import * as THREE from 'three/webgpu';
import { Fn, If, Discard, attribute, vec3, mix, step, positionWorld } from 'three/tsl';
import { GB, clipper, tourBoat } from './piers-models.js';

const C = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };   // sRGB hex to linear
export const BP = {
  black: C('#1b1d1f'), boot: C('#121314'), antif: C('#5a2620'), rust: C('#5a3a2b'), rustDark: C('#3a2b24'), white: C('#eceeed'), offwhite: C('#d9d6cc'),
  deck: C('#77796f'), teak: C('#8d6c4a'), wood: C('#6c4a2c'), glass: C('#1b2730'), navy: C('#1d2b45'), red: C('#9e2f28'), steel: C('#5f6468'),
  rubber: C('#121212'), canvas: C('#c6bda6'), tan: C('#8b4a2b'), lamp: C('#ffd9a0'), concrete: C('#8f8d86'), planter: C('#4a6e34'), yellow: C('#d6a923'),
  sand: C('#a88a5c'), roof: C('#4d4f4c'), grey: C('#8a8e90'),
};
// paint palettes (sRGB hex; picked by a seeded hash per boat)
export const PAINT = {
  canal: ['#2d4a2f', '#6a1f24', '#1f2f56', '#1c1c1c', '#8b2b1d', '#3a5a6a', '#5b4a22', '#2a5a55', '#4a2c4f'],
  canal2: ['#d8c48a', '#c9a227', '#b8352a', '#e6dcc0', '#2f6b3a', '#c0c4c6'],
  barge: ['#1d2b45', '#203a2a', '#1b1d1f', '#5c1f1f', '#34485a', '#2b2b2b', '#3d3528'],
  wheel: ['#6c4a2c', '#eceeed', '#d9d6cc', '#6c4a2c', '#1d2b45'],
  cladding: ['#7a6a55', '#4f5a5c', '#d9d6cc', '#3c4a3a', '#8a5a3c', '#2f3236', '#a8a49a'],
  trim: ['#eceeed', '#1b1d1f', '#9e2f28', '#d6a923'],
  yacht: ['#eceeed', '#eceeed', '#eceeed', '#eceeed', '#eceeed', '#e8e2d0', '#1d2b45', '#203a2a'],
  sailcover: ['#1f3d6b', '#1f3d6b', '#2a4a33', '#6a1f24', '#7d7f7c'],
  tugTop: ['#eceeed', '#a8302a', '#e3dcc4', '#d06a20'],
  tugHull: ['#1b1d1f', '#1b1d1f', '#1d2b45', '#3a1f1d'],
  ship: ['#1d2b45', '#203a2a', '#1b1d1f', '#5a2620', '#2f4f6f', '#6b6f73'],
  funnel: ['#1b1d1f', '#9e2f28', '#d6a923', '#1d2b45', '#eceeed'],
  rusty: ['#3a2b24', '#4a3226', '#2a2522', '#523a2a'],
  launch: ['#1d2b45', '#eceeed', '#1b1d1f', '#34485a'],
};
export const lin = hex => C(hex);

// ---------- the builder: GB plus a lofted hull with sheer, flare, rake, boot top and antifouling, edge strips and windows
export class BB extends GB {
  // o: L, B, d (draft), free(t) deck height, half(t) half-beam fraction (t = 0 bow, 1 stern), n stations, bootTop (m),
  // flare (deck edge / waterline half-beam), keel (bottom width fraction), rakeBow / rakeStern (m the stem / stern run out
  // at the deck), col, paint (1 or 2: topsides painted), boot, antif, deck
  hull(o) {
    const N = o.n || 12, d = o.d, flare = o.flare ?? 1.04, keel = o.keel ?? .5, bt = o.bootTop ?? .3, S = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = -o.L / 2 + t * o.L, hb = Math.max(.02, o.B / 2 * o.half(t)), f = o.free(t);
      const zr = y => z + (o.rakeBow || 0) * Math.max(0, 1 - t / .12) * (f - y) / (f + d) - (o.rakeStern || 0) * Math.max(0, (t - .9) / .1) * (f - y) / (f + d);
      const pr = [[hb * flare, f], [hb, bt], [hb * .99, -.04], [hb * .86, -d * .6], [hb * keel, -d]];
      S.push({ t, z, hb: hb * flare, f, pts: pr.map(([x, y]) => [x, y, zr(y)]) });
    }
    const band = [[o.col, o.paint || 0], [o.boot || BP.boot, 0], [o.antif || BP.antif, 0], [o.antif || BP.antif, 0]];
    for (let i = 0; i < N; i++) { const A = S[i], Bq = S[i + 1];
      for (let k = 0; k < 4; k++) { const [a0, a1, b0, b1] = [A.pts[k], A.pts[k + 1], Bq.pts[k], Bq.pts[k + 1]], [c, p] = band[k];
        this.quad([a0[0], a0[1], a0[2]], [b0[0], b0[1], b0[2]], [b1[0], b1[1], b1[2]], [a1[0], a1[1], a1[2]], c, 0, p);
        this.quad([-a0[0], a0[1], a0[2]], [-a1[0], a1[1], a1[2]], [-b1[0], b1[1], b1[2]], [-b0[0], b0[1], b0[2]], c, 0, p); }
      const ka = A.pts[4], kb = Bq.pts[4]; this.quad([-ka[0], ka[1], ka[2]], [ka[0], ka[1], ka[2]], [kb[0], kb[1], kb[2]], [-kb[0], kb[1], kb[2]], o.antif || BP.antif);
      const da = A.pts[0], db = Bq.pts[0]; this.quad([-da[0], da[1], da[2]], [da[0], da[1], da[2]], [db[0], db[1], db[2]], [-db[0], db[1], db[2]], o.deck || BP.deck);   // the deck follows the sheer
    }
    for (const [Sx, sgn] of [[S[0], -1], [S[N], 1]]) {   // stem and transom: a fan from the centre line
      const ring = [...Sx.pts, ...[...Sx.pts].reverse().map(([x, y, z]) => [-x, y, z])], c = [0, (Sx.f - d) / 2, ring.reduce((s, p) => s + p[2], 0) / ring.length];
      for (let k = 0; k < ring.length - 1; k++) { const col = band[k < 4 ? k : k === 4 ? 3 : 8 - k];   // ring: starboard top to keel, then port keel to top
        sgn > 0 ? this.tri(c, ring[k], ring[k + 1], col[0], 0, col[1]) : this.tri(c, ring[k + 1], ring[k], col[0], 0, col[1]); }
    }
    this.S = S; return S;
  }
  // a strip along both deck edges from y0 to y1 above the deck (a bulwark, a rubbing strake, a rail), stations t0..t1
  strip(y0, y1, col, o = {}) {
    const S = this.S, out = o.out || 0, t0 = o.t0 ?? 0, t1 = o.t1 ?? 1, p = o.paint || 0;
    for (let i = 0; i < S.length - 1; i++) { const A = S[i], Bq = S[i + 1]; if (A.t < t0 - 1e-6 || Bq.t > t1 + 1e-6) continue;
      for (const s of [-1, 1]) { const ax = s * (A.hb + out), bx = s * (Bq.hb + out), za = A.pts[0][2], zb = Bq.pts[0][2];
        this.quad([ax, A.f + y0, za], [bx, Bq.f + y0, zb], [bx, Bq.f + y1, zb], [ax, A.f + y1, za], col, 0, p); } }
    if (o.ends) for (const Sx of [S[0], S[S.length - 1]]) this.quad([-Sx.hb, Sx.f + y0, Sx.pts[0][2]], [Sx.hb, Sx.f + y0, Sx.pts[0][2]], [Sx.hb, Sx.f + y1, Sx.pts[0][2]], [-Sx.hb, Sx.f + y1, Sx.pts[0][2]], col, 0, p);
  }
  deckAt(t) { const S = this.S, i = Math.min(S.length - 2, Math.max(0, Math.floor(t * (S.length - 1)))), k = t * (S.length - 1) - i; return S[i].f + (S[i + 1].f - S[i].f) * k; }
  // windows on both sides of a box face plane x = ±hx: from z0 to z1, every `step` m, w wide, y0..y1; lit: a share lit by night
  windows(hx, y0, y1, z0, z1, step, w, lit = .5, o = {}) {
    let k = 0;
    for (let z = z0; z <= z1 + 1e-6; z += step, k++) { const g = ((k * 7 + 3) % 10) / 10 < lit ? 1 : 0, col = o.col || BP.glass;
      for (const s of (o.sides || [-1, 1])) { const x = s * (hx + .02), a = [x, y0, z - w / 2], b = [x, y0, z + w / 2], c = [x, y1, z + w / 2], d = [x, y1, z - w / 2];
        s > 0 ? this.quad(a, d, c, b, col, g) : this.quad(a, b, c, d, col, g); } }
  }
  // a window band across a face plane z = zf (front or back of a box), half width hw, y0..y1
  band(zf, hw, y0, y1, glow = 0, col = BP.glass) { this.quad([-hw, y0, zf], [hw, y0, zf], [hw, y1, zf], [-hw, y1, zf], col, glow); }
  // a flat plate in the plane x = ±hx (a leeboard): points [z, y]
  plate(hx, pts, col, paint = 0) { for (const s of [-1, 1]) for (let k = 1; k + 1 < pts.length; k++) this.tri([s * hx, pts[0][1], pts[0][0]], [s * hx, pts[k][1], pts[k][0]], [s * hx, pts[k + 1][1], pts[k + 1][0]], col, 0, paint); }
  geometry() { return pack(super.geometry()); }
}
// glow and camo (piers-models.js) packed into one vec2 attribute gp (WebGPU allows 8 vertex buffers: position, normal,
// color, gp, the instance matrix, tint, tint2)
export function pack(G) {
  const g = G.getAttribute('glow'), m = G.getAttribute('camo'), n = G.getAttribute('position').count, a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[2 * i] = g ? g.getX(i) : 0; a[2 * i + 1] = m ? m.getX(i) : 0; }
  G.deleteAttribute('glow'); G.deleteAttribute('camo'); G.setAttribute('gp', new THREE.Float32BufferAttribute(a, 2)); return G;
}

// ---------- the material: vertex colours, paint 1 / 2 from the instance colours, windows lit by night, the cut-away (U.cut)
export function boatMaterial(U) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: .62, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  const col = attribute('color', 'vec3'), gp = attribute('gp', 'vec2'), t1 = attribute('tint', 'vec3'), t2 = attribute('tint2', 'vec3');
  const p = gp.y, a = step(.5, p).mul(step(p, 1.5)), b = step(1.5, p);
  m.colorNode = Fn(() => { If(positionWorld.y.greaterThan(U.cut), () => { Discard(); }); return mix(mix(col, t1, a), t2, b); })();
  m.emissiveNode = vec3(1, .8, .55).mul(gp.x).mul(U.night).mul(1.5);
  return m;
}
// one InstancedMesh for a model, with the tint attributes; cap instances
export function boatMesh(model, mat, cap) {
  const G = model.geo.clone(), t1 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3), t2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
  t1.setUsage(THREE.DynamicDrawUsage); t2.setUsage(THREE.DynamicDrawUsage); G.setAttribute('tint', t1); G.setAttribute('tint2', t2);
  const m = new THREE.InstancedMesh(G, mat, cap); m.frustumCulled = false; m.castShadow = m.receiveShadow = true; m.count = 0; m.visible = false; m.name = 'boat ' + model.key;
  m.userData.model = model; return m;
}

// ---------- the models. Each: { key, name, geo, L0, B0, deck (m: top of the main superstructure), top: [y, z] masthead }
const hz = (t, L) => -L / 2 + t * L;
// narrowboat (canal boat, 15 to 21 m x 2.1 m) and widebeam (15 to 20 m x 3 to 4 m): black hull, painted cabin with a
// coach line, roof, small windows, a chimney, a bow well with a cratch board, the tiller deck aft
function canalBoat(key, L, B, ch) {
  const g = new BB(), f = .72;
  g.hull({ L, B, d: .6, n: 10, free: t => f + .14 * Math.max(0, 1 - t / .15) ** 2, half: t => t < .15 ? .22 + .78 * Math.sin(t / .15 * Math.PI / 2) : t > .95 ? 1 - (t - .95) * 5 : 1,
    bootTop: .22, flare: 1, keel: .95, rakeBow: .45, col: BP.black, boot: BP.boot, antif: BP.black, deck: BP.deck });
  const z0 = -L / 2 + 2.6, z1 = L / 2 - 1.7, zc = (z0 + z1) / 2, lz = z1 - z0, w = B * (key === 'narrowboat' ? .86 : .9);
  g.box(0, f + ch / 2, zc, w, ch, lz, BP.black, { camo: 1 });                    // the cabin sides, painted
  g.box(0, f + ch + .04, zc, w + .08, .08, lz + .1, BP.roof);                     // the roof
  for (const s of [-1, 1]) g.quad([s * (w / 2 + .015), f + ch - .32, z0 + .2], [s * (w / 2 + .015), f + ch - .32, z1 - .2], [s * (w / 2 + .015), f + ch - .2, z1 - .2], [s * (w / 2 + .015), f + ch - .2, z0 + .2], BP.white, 0, 2);   // coach line
  g.windows(w / 2, f + ch * .3, f + ch * .72, z0 + 1.2, z1 - 1.4, key === 'narrowboat' ? 1.7 : 1.5, key === 'narrowboat' ? .5 : .9, .45);
  g.band(z0 - .01, w / 2 - .15, f + .2, f + ch - .15, 0, BP.wood);                // front doors
  g.rod([0, f + ch, z0 + 1.2], [0, f + ch + .55, z0 + 1.2], .09, BP.black, { seg: 5 });   // chimney
  g.tri([-B * .38, f + .1, z0 - .05], [B * .38, f + .1, z0 - .05], [0, f + ch * .85, z0 - .05], BP.wood, 0, 2);   // cratch board
  g.rod([0, f + ch * .85, z0 - .05], [0, f + .25, -L / 2 + .6], .04, BP.wood, { seg: 3 });
  g.rod([0, f + .1, L / 2 - .4], [0, f + .95, L / 2 + .2], .04, BP.wood, { seg: 3 });   // tiller
  return { key, name: key === 'narrowboat' ? 'narrowboat' : 'widebeam canal boat', geo: g.geometry(), L0: L, B0: B, deck: f + ch, top: [f + ch + .6, z0 + 1.2] };
}
// Dutch barge (steel, 18 to 30 m x 4 to 5 m): sheer to a high bluff bow, rubbing strake, leeboards, a long low deckhouse
// with portholes, a wheelhouse aft; a mast with a forestay or none
function dutchBarge(mast, L = 22, B = 4.6) {
  const g = new BB();
  g.hull({ L, B, d: .95, n: 14, free: t => 1.05 + .95 * Math.max(0, 1 - t / .32) ** 2 + .3 * Math.max(0, (t - .85) / .15), half: t => t < .22 ? .42 + .58 * Math.sin(t / .22 * Math.PI / 2) : t > .9 ? 1 - (t - .9) * 3 : 1,
    bootTop: .28, flare: 1.04, keel: .8, rakeBow: .9, rakeStern: .4, col: BP.navy, paint: 1, deck: BP.deck });
  g.strip(-.3, -.16, BP.wood, { out: .03 });                                     // rubbing strake
  g.strip(0, .32, BP.navy, { paint: 1 });                                          // bulwark
  g.plate(B / 2 * 1.04 + .06, [[-L * .1, 1.15], [L * .02, 1.15], [L * .0, -.5], [-L * .08, -.5]], BP.black, 1);   // leeboards
  const f = 1.05, hz0 = -L * .22, hz1 = L * .2;
  g.box(0, f + .45, (hz0 + hz1) / 2, B * .72, .9, hz1 - hz0, BP.offwhite, { top: BP.roof });   // deckhouse
  g.windows(B * .36, f + .35, f + .65, hz0 + .8, hz1 - .6, 1.4, .32, .5);
  const wz = L * .33; g.box(0, f + 1.05, wz, B * .62, 2.1, 3.2, BP.wood, { camo: 2, top: BP.white });   // wheelhouse
  g.windows(B * .31, f + 1.25, f + 1.9, wz - 1.05, wz + 1.05, 1.05, .85, .3); g.band(wz - 1.61, B * .28, f + 1.25, f + 1.95, 0);
  let top = [f + 2.2, wz];
  if (mast) { const mz = -L * .34; g.rod([0, f, mz], [0, f + L * .42, mz], .11, BP.black, { seg: 5 }); g.rod([0, f + L * .42, mz], [0, f + .9, -L / 2 + .2], .025, BP.steel, { seg: 3, caps: false });
    g.rod([0, f + L * .3, mz], [0, f + 1.4, wz - 1.6], .02, BP.steel, { seg: 3, caps: false }); top = [f + L * .42, mz]; }
  g.box(0, f + .9 + .25, -L / 2 + 1.6, .7, .45, .6, BP.black);                    // anchor winch
  return { key: mast ? 'dutchmast' : 'dutch', name: 'Dutch barge' + (mast ? ' (mast up)' : ''), geo: g.geometry(), L0: L, B0: B, deck: f + 2.1, top };
}
// converted Thames lighter (dumb barge with swim ends, 22 to 30 m x 5.5 to 7 m): a rusty black-brown box hull, a long
// clad deckhouse with big windows, planters on the roof
function lighter(L = 26, B = 6.6) {
  const g = new BB(), f = 1.3;
  g.hull({ L, B, d: 1.1, n: 8, free: () => f, half: t => t < .06 || t > .94 ? .93 : .98, bootTop: .2, flare: 1, keel: .97, rakeBow: 1.8, rakeStern: 1.6, col: BP.rustDark, boot: BP.rust, antif: BP.rust, deck: BP.rust });
  g.strip(0, .22, BP.rust, { ends: true });
  const z0 = -L * .36, z1 = L * .4, zc = (z0 + z1) / 2, w = B * .84, h = 2.5;
  g.box(0, f + h / 2, zc, w, h, z1 - z0, BP.wood, { camo: 1, top: BP.roof });
  g.windows(w / 2, f + .7, f + 2.05, z0 + 1.5, z1 - 1.5, 2.6, 1.5, .55); g.band(z0 - .01, w / 2 - .6, f + .5, f + 2.1, 1); g.band(z1 + .01, w / 2 - .8, f + .6, f + 2.1, 0);
  for (const s of [-1, 1]) g.quad([s * (w / 2 + .015), f + h - .14, z0], [s * (w / 2 + .015), f + h - .14, z1], [s * (w / 2 + .015), f + h, z1], [s * (w / 2 + .015), f + h, z0], BP.white, 0, 2);   // fascia
  for (const [x, z] of [[-w * .3, z0 + 2], [w * .25, zc], [-w * .2, z1 - 3]]) g.box(x, f + h + .3, z, 1.2, .6, .9, BP.planter);
  g.rod([0, f + h, zc + 3], [0, f + h + .7, zc + 3], .12, BP.black, { seg: 5 });
  return { key: 'lighter', name: 'converted Thames lighter', geo: g.geometry(), L0: L, B0: B, deck: f + h, top: [f + h + .8, zc + 3] };
}
// floating home on a concrete pontoon (two storeys, timber or panel cladding, big windows)
function floatingHome(L = 20, B = 7.4) {
  const g = new BB(), f = .6;
  g.box(0, f - .75, 0, B, 1.5, L, BP.concrete);
  const h1 = 2.7, h2 = 2.5, w = B * .9;
  g.box(0, f + h1 / 2, 0, w, h1, L * .92, BP.wood, { camo: 1, top: BP.roof }); g.windows(w / 2, f + .5, f + 2.3, -L * .36, L * .36, 3, 1.8, .55);
  g.band(-L * .46 - .01, w / 2 - .5, f + .3, f + 2.4, 1); g.band(L * .46 + .01, w / 2 - .5, f + .3, f + 2.4, 0);
  g.box(0, f + h1 + h2 / 2, L * .12, w * .9, h2, L * .55, BP.wood, { camo: 1 }); g.windows(w * .45, f + h1 + .4, f + h1 + 2.1, -L * .1, L * .36, 2.6, 1.6, .5);
  g.band(L * .12 - L * .275 - .01, w * .4, f + h1 + .3, f + h1 + 2.2, 1);
  g.box(0, f + h1 + h2 + .08, L * .12, w * .98, .16, L * .62, BP.roof, { camo: 2 }); g.box(0, f + h1 + .06, -L * .3, w, .12, L * .32, BP.roof);
  for (const s of [-1, 1]) g.box(s * w * .48, f + h1 + .55, -L * .3, .05, .9, L * .32, BP.steel);   // terrace rail
  return { key: 'home', name: 'floating home', geo: g.geometry(), L0: L, B0: B, deck: f + h1 + h2, top: [f + h1 + h2 + .2, L * .12] };
}
// sailing yacht (8 to 14 m): white hull with a boot stripe, a low coachroof, mast, boom with its sail cover, stays
function yacht(L = 10.5, B = 3.4) {
  const g = new BB();
  g.hull({ L, B, d: .45, n: 12, free: t => 1.1 + .28 * Math.max(0, 1 - t / .4) ** 1.5, half: t => t < .55 ? .12 + .88 * Math.sin(t / .55 * Math.PI / 2) : 1 - .28 * ((t - .55) / .45) ** 2,
    bootTop: .12, flare: 1.06, keel: .25, rakeBow: .9, col: BP.white, paint: 1, boot: BP.navy, deck: BP.offwhite });
  g.strip(0, .06, BP.steel, { t0: 0, t1: 1 });
  const f = 1.12, cz = -L * .02;
  g.box(0, f + .28, cz, B * .56, .56, L * .36, BP.white, { top: BP.offwhite }); g.windows(B * .28, f + .2, f + .4, cz - L * .12, cz + L * .1, L * .11, L * .08, .3);
  const mz = -L * .14, mh = L * 1.3; g.rod([0, f + .5, mz], [0, f + mh, mz], .07, BP.grey, { seg: 5 });
  g.rod([0, f + mh, mz], [0, f + .2, -L / 2 + .1], .015, BP.steel, { seg: 3, caps: false }); g.rod([0, f + mh * .97, mz], [0, f + .5, L / 2 - .2], .015, BP.steel, { seg: 3, caps: false });
  g.rod([0, f + 1.45, mz], [0, f + 1.45, mz + L * .42], .06, BP.grey, { seg: 4 }); g.box(0, f + 1.62, mz + L * .2, .34, .38, L * .4, BP.navy, { camo: 2 });
  for (const s of [-1, 1]) g.rod([s * B * .3, f + .7, L * .2], [s * B * .44, f + .7, L * .46], .02, BP.steel, { seg: 3 });   // guard rails aft
  return { key: 'yacht', name: 'sailing yacht', geo: g.geometry(), L0: L, B0: B, deck: f + .6, top: [f + mh, mz] };
}
// motor cruiser (8 to 14 m): white hull, cabin with a raked windscreen, a flybridge, a small radar arch
function cruiser(L = 11, B = 3.6) {
  const g = new BB();
  g.hull({ L, B, d: .7, n: 12, free: t => 1.3 + .3 * Math.max(0, 1 - t / .4) ** 1.5, half: t => t < .45 ? .15 + .85 * Math.sin(t / .45 * Math.PI / 2) : 1 - .12 * ((t - .45) / .55), bootTop: .15, flare: 1.05, keel: .3, rakeBow: 1.1,
    col: BP.white, paint: 1, boot: BP.navy, deck: BP.offwhite });
  g.strip(-.32, -.2, BP.navy, { paint: 2 });
  const f = 1.3, z0 = -L * .22, z1 = L * .2;
  g.box(0, f + .55, (z0 + z1) / 2, B * .8, 1.1, z1 - z0, BP.white, { top: BP.offwhite }); g.windows(B * .4, f + .35, f + .85, z0 + .9, z1 - .9, 1.1, .8, .35); g.band(z0 - .01, B * .36, f + .4, f + 1.0, 0);
  g.box(0, f + 1.35, z1 - L * .12, B * .66, .5, L * .26, BP.white); g.band(z1 - L * .25 - .01, B * .3, f + 1.6, f + 1.95, 0, BP.glass);
  g.rod([-B * .25, f + 1.6, z1 - .4], [0, f + 2.5, z1 - .2], .05, BP.white, { seg: 4 }); g.rod([B * .25, f + 1.6, z1 - .4], [0, f + 2.5, z1 - .2], .05, BP.white, { seg: 4 });
  return { key: 'cruiser', name: 'motor cruiser', geo: g.geometry(), L0: L, B0: B, deck: f + 1.6, top: [f + 2.6, z1 - .2] };
}
// Thames sailing barge (25 to 30 m x 6 m): flat black hull, coloured sheer strake, big leeboards, hatches, the mainmast
// and topmast, the sprit, the brailed tan mainsail, a small mizzen, the bowsprit
function sailingBarge(L = 26, B = 6.2) {
  const g = new BB();
  g.hull({ L, B, d: 1.1, n: 12, free: t => 1.35 + .55 * Math.max(0, 1 - t / .28) ** 2 + .2 * Math.max(0, (t - .9) / .1), half: t => t < .16 ? .55 + .45 * Math.sin(t / .16 * Math.PI / 2) : t > .92 ? 1 - (t - .92) * 2.5 : 1,
    bootTop: .2, flare: 1.02, keel: .95, rakeBow: .8, col: BP.black, boot: BP.boot, deck: BP.wood });
  g.strip(-.22, -.06, BP.red, { paint: 2, out: .01 }); g.strip(0, .3, BP.black);
  g.plate(B / 2 * 1.02 + .08, [[-L * .14, 1.5], [L * .02, 1.5], [L * .0, -1.4], [-L * .1, -1.4]], BP.black);
  for (const [z, l] of [[-L * .03, L * .22], [L * .24, L * .14]]) g.box(0, 1.55, z, B * .55, .45, l, BP.wood, { top: BP.tan });
  const f = 1.4, mz = -L * .2, mh = L * .82;
  g.rod([0, f, mz], [0, f + mh, mz], .16, BP.wood, { seg: 6 }); g.rod([0, f + mh, mz], [0, f + mh * 1.22, mz], .07, BP.wood, { seg: 4 });
  g.rod([0, f + 1.6, mz + .3], [0, f + mh * .92, mz + L * .42], .1, BP.wood, { seg: 4 });   // sprit
  g.rod([0, f + 2.4, mz + .55], [0, f + mh * .8, mz + .7], 0, BP.tan, { rx: .35, rz: .5, seg: 6 });   // brailed mainsail
  g.rod([0, f + mh * .9, mz + L * .38], [0, f + 2, mz + .8], .2, BP.tan, { seg: 4 });
  g.rod([0, f + .6, L / 2 - .4], [0, f + L * .3, L / 2 - .4], .07, BP.wood, { seg: 4 });   // mizzen
  g.rod([0, f + 1.1, -L / 2 + .6], [0, f + 1.6, -L / 2 - L * .2], .09, BP.wood, { seg: 4 });   // bowsprit
  g.rod([0, f + mh * 1.2, mz], [0, f + 1.6, -L / 2 - L * .19], .02, BP.steel, { seg: 3, caps: false });
  g.box(0, f + .65, L * .42, 1.4, 1.1, 1.2, BP.wood, { top: BP.white });
  return { key: 'sbarge', name: 'Thames sailing barge', geo: g.geometry(), L0: L, B0: B, deck: f + .6, top: [f + mh * 1.22, mz] };
}
// tug (12 to 30 m): black hull, high sheer forward, rubber fendering, bulwark, two-tier deckhouse and wheelhouse with a
// window band, a mast with a radar bar, twin exhaust stacks, the towing hook aft
function tug(L = 20, B = 7.2) {
  const g = new BB();
  g.hull({ L, B, d: 2.4, n: 14, free: t => 1.6 + 1.0 * Math.max(0, 1 - t / .32) ** 1.6, half: t => t < .32 ? .32 + .68 * Math.sin(t / .32 * Math.PI / 2) : t > .9 ? 1 - (t - .9) * 2.5 : 1,
    bootTop: .4, flare: 1.06, keel: .4, rakeBow: 1.2, col: BP.black, paint: 2, boot: BP.red, deck: BP.deck });
  g.strip(-.55, .05, BP.rubber, { out: .12 }); g.strip(0, .85, BP.black, { paint: 2 });
  g.box(0, g.deckAt(0) - .1, -L / 2 + .25, B * .5, 1.1, 1.1, BP.rubber);
  const f = 1.6, dz = -L * .1, dh = 2.2, wh = 1.9;
  g.box(0, f + dh / 2, dz, B * .62, dh, L * .42, BP.white, { camo: 1 }); g.windows(B * .31, f + .9, f + 1.5, dz - L * .15, dz + L * .15, L * .1, .55, .35);
  const wz = dz - L * .06; g.box(0, f + dh + wh / 2, wz, B * .56, wh, L * .21, BP.white, { camo: 1, top: BP.white });
  g.band(wz - L * .105 - .01, B * .27, f + dh + .55, f + dh + 1.5, .5); g.windows(B * .28, f + dh + .55, f + dh + 1.5, wz - L * .06, wz + L * .06, L * .06, L * .05, .4); g.band(wz + L * .105 + .01, B * .25, f + dh + .55, f + dh + 1.5, 0);
  const mt = f + dh + wh + 4; g.rod([0, f + dh + wh, wz], [0, mt, wz], .1, BP.white, { seg: 5 }); g.box(0, mt - 1.2, wz, 2.2, .14, .3, BP.black);
  for (const s of [-1, 1]) g.rod([s * B * .2, f + dh, dz + L * .17], [s * B * .2, f + dh + 2.4, dz + L * .19], .22, BP.black, { seg: 6 });
  g.box(0, f + .5, L * .3, 1.2, 1, 1, BP.black); g.rod([-B * .4, f + .2, L * .42], [B * .4, f + .2, L * .42], .08, BP.steel, { seg: 4 });
  return { key: 'tug', name: 'tug', geo: g.geometry(), L0: L, B0: B, deck: f + dh + wh, top: [mt, wz] };
}
// launch or work boat (8 to 18 m: police, PLA, pilot, rescue, survey, crew boats): fender, wheelhouse forward with a window
// band, mast with a radar bar and a light, an open aft deck with a rail
function launch(L = 13, B = 4.2) {
  const g = new BB();
  g.hull({ L, B, d: .9, n: 12, free: t => 1.2 + .4 * Math.max(0, 1 - t / .38) ** 1.5, half: t => t < .42 ? .22 + .78 * Math.sin(t / .42 * Math.PI / 2) : 1 - .1 * (t - .42) / .58,
    bootTop: .25, flare: 1.06, keel: .3, rakeBow: 1.0, col: BP.navy, paint: 1, boot: BP.boot, deck: BP.deck });
  g.strip(-.18, .06, BP.rubber, { out: .1 }); g.strip(.06, .9, BP.steel, { t0: .55 });
  const f = 1.25, wz = -L * .1, wh = 2;
  g.box(0, f + wh / 2, wz, B * .72, wh, L * .38, BP.white, { camo: 2, top: BP.white });
  g.band(wz - L * .19 - .01, B * .34, f + 1.05, f + 1.8, .4); g.windows(B * .36, f + 1.05, f + 1.8, wz - L * .12, wz + L * .12, L * .08, L * .065, .35);
  const mt = f + wh + 2.4; g.rod([0, f + wh, wz + L * .1], [0, mt, wz + L * .1], .07, BP.white, { seg: 5 }); g.box(0, mt - .7, wz + L * .1, 1.6, .12, .3, BP.black);
  return { key: 'launch', name: 'launch or work boat', geo: g.geometry(), L0: L, B0: B, deck: f + wh, top: [mt, wz + L * .1] };
}
// coaster, cargo ship or tanker (40 to 120 m): forecastle, hatch covers (cargo) or deck piping and a catwalk (tanker),
// the accommodation block aft in three tiers, the bridge with wings, a funnel, a foremast
function ship(tanker, L = 80, B = 12.6) {
  const g = new BB();
  g.hull({ L, B, d: 4.5, n: 16, free: t => 4.2 + 2.0 * Math.max(0, 1 - t / .14) + .8 * Math.max(0, (t - .86) / .14), half: t => t < .26 ? .18 + .82 * Math.sin(t / .26 * Math.PI / 2) : t > .88 ? 1 - (t - .88) * 2.4 : 1,
    bootTop: .7, flare: 1.02, keel: .65, rakeBow: 3, rakeStern: 1.5, col: tanker ? BP.red : BP.navy, paint: 1, boot: tanker ? BP.black : BP.red, deck: tanker ? BP.red : BP.deck });
  g.strip(0, 1.1, BP.black, { paint: 1, t0: 0, t1: .2 });
  const f = 4.2;
  if (!tanker) for (const [a, b] of [[.18, .42], [.44, .68]]) g.box(0, f + .7, (hz(a, L) + hz(b, L)) / 2, B * .82, 1.4, (b - a) * L - .6, BP.grey, { top: C('#4f6b55') });
  else { g.rod([0, f + .9, hz(.14, L)], [0, f + .9, hz(.74, L)], .5, BP.steel, { seg: 5 }); g.box(0, f + 1.6, (hz(.14, L) + hz(.74, L)) / 2, 1.2, .12, .6 * L, BP.grey);
    for (const s of [-1, 1]) g.rod([s * B * .25, f + .5, hz(.16, L)], [s * B * .25, f + .5, hz(.72, L)], .25, BP.steel, { seg: 4 }); g.box(0, f + 1, hz(.45, L), B * .7, 2, 2.4, BP.grey); }
  const az = hz(.82, L), al = L * .12; let y = f;
  for (const [h, w] of [[2.7, .9], [2.6, .78], [2.5, .7]]) { g.box(0, y + h / 2, az, B * w, h, al, BP.white); g.windows(B * w / 2, y + 1, y + 1.9, az - al * .35, az + al * .35, al * .23, 1, .5); g.band(az - al / 2 - .01, B * w / 2 - .5, y + 1, y + 1.9, .5); y += h; }
  g.box(0, y + 1.2, az - al * .1, B * 1.0, 2.4, al * .6, BP.white); g.band(az - al * .4 - .01, B * .45, y + .9, y + 2, .4); y += 2.4;
  g.rod([0, y, az + al * .45], [0, y + 4, az + al * .5], 0, BP.black, { rx: 1.3, rz: 1.8, seg: 8, camo: 2 });
  const mz = hz(.06, L); g.rod([0, f + 2, mz], [0, f + 12, mz], .25, BP.yellow, { seg: 5 }); g.rod([0, y, az], [0, y + 6, az], .18, BP.white, { seg: 5 });
  return { key: tanker ? 'tanker' : 'cargo', name: tanker ? 'tanker' : 'cargo ship or coaster', geo: g.geometry(), L0: L, B0: B, deck: y, top: [y + 6, az] };
}
// hopper dredger (40 to 100 m): bridge forward, an open hopper amidships, a yellow A-frame and the drag arm on the side
function dredger(L = 60, B = 11.5) {
  const g = new BB();
  g.hull({ L, B, d: 4, n: 14, free: t => 3.4 + 1.6 * Math.max(0, 1 - t / .16), half: t => t < .24 ? .22 + .78 * Math.sin(t / .24 * Math.PI / 2) : t > .9 ? 1 - (t - .9) * 2.2 : 1,
    bootTop: .6, flare: 1.02, keel: .7, rakeBow: 2.4, col: BP.navy, paint: 1, boot: BP.red, deck: BP.deck });
  const f = 3.4, bz = hz(.2, L), y0 = f;
  g.box(0, y0 + 1.5, bz, B * .8, 3, L * .1, BP.white); g.box(0, y0 + 4.1, bz, B * .9, 2.2, L * .07, BP.white); g.band(bz - L * .035 - .01, B * .42, y0 + 3.5, y0 + 4.7, .4);
  g.windows(B * .4, y0 + 1, y0 + 2, bz - L * .03, bz + L * .03, L * .03, 1, .5);
  const h0 = hz(.32, L), h1 = hz(.8, L), hc = (h0 + h1) / 2, hl = h1 - h0;
  for (const s of [-1, 1]) g.box(s * B * .4, f + .9, hc, .3, 1.8, hl, BP.grey); g.box(0, f + .9, h0, B * .8, 1.8, .3, BP.grey); g.box(0, f + .9, h1, B * .8, 1.8, .3, BP.grey);
  g.box(0, f + .05, hc, B * .78, .1, hl, BP.sand);
  const az = hz(.55, L); g.rod([B * .45, f, az - 3], [B * .45, f + 6, az], .25, BP.yellow, { seg: 5 }); g.rod([B * .45, f, az + 3], [B * .45, f + 6, az], .25, BP.yellow, { seg: 5 });
  g.rod([B * .52, f + 4, az], [B * .55, -2.5, az + L * .3], .45, BP.black, { seg: 6 });
  g.rod([0, f, hz(.9, L)], [0, f + 6, hz(.92, L)], 0, BP.black, { rx: 1, rz: 1.4, seg: 8, camo: 2 });
  g.rod([0, y0 + 5.2, bz], [0, y0 + 10, bz], .15, BP.white, { seg: 5 });
  return { key: 'dredger', name: 'dredger', geo: g.geometry(), L0: L, B0: B, deck: y0 + 5.2, top: [y0 + 10, bz] };
}
// dumb barge or motor barge (cargo, 30 to 60 m): low freeboard, swim ends, a hold with coamings and a heap of aggregate, a
// small wheelhouse aft
function barge(L = 50, B = 11) {
  const g = new BB(), f = 1.5;
  g.hull({ L, B, d: 2.2, n: 8, free: () => f, half: t => t < .06 || t > .94 ? .94 : .98, bootTop: .3, flare: 1, keel: .97, rakeBow: 3, rakeStern: 2.6, col: BP.rustDark, paint: 1, boot: BP.rust, antif: BP.rust, deck: BP.rust });
  g.strip(0, .3, BP.rustDark, { paint: 1, ends: true });
  const h0 = -L * .36, h1 = L * .3, hc = (h0 + h1) / 2, hl = h1 - h0;
  for (const s of [-1, 1]) g.box(s * B * .42, f + .5, hc, .25, 1, hl, BP.rustDark, { camo: 1 }); g.box(0, f + .5, h0, B * .84, 1, .25, BP.rustDark, { camo: 1 }); g.box(0, f + .5, h1, B * .84, 1, .25, BP.rustDark, { camo: 1 });
  g.box(0, f + .6, hc, B * .8, 1, hl - .5, BP.sand); for (const s of [-1, 1]) g.quad([s * B * .4, f + 1.1, h0 + .5], [s * B * .4, f + 1.1, h1 - .5], [0, f + 2.4, h1 - 3], [0, f + 2.4, h0 + 3], BP.sand);
  const wz = L * .42; g.box(0, f + 1.2, wz, B * .4, 2.4, L * .08, BP.white, { top: BP.white }); g.band(wz - L * .04 - .01, B * .18, f + 1.5, f + 2.2, .4);
  return { key: 'barge', name: 'barge', geo: g.geometry(), L0: L, B0: B, deck: f + 2.4, top: [f + 3, wz] };
}
// cruise ship or large passenger vessel (100 m and more)
function cruise(L = 139, B = 22) {
  const g = new BB();
  g.hull({ L, B, d: 5, n: 18, free: t => 7.5 + 2.2 * Math.max(0, 1 - t / .2) ** 1.5, half: t => t < .3 ? .18 + .82 * Math.sin(t / .3 * Math.PI / 2) : t > .9 ? 1 - (t - .9) * 2 : 1,
    bootTop: .8, flare: 1.02, keel: .6, rakeBow: 5, rakeStern: 2, col: BP.white, boot: BP.navy, deck: BP.teak });
  let y = 7.5;
  for (const [w, l, z] of [[.94, .74, .06], [.9, .66, .07], [.86, .56, .1], [.76, .44, .12]]) { const zc = L * (z - .02), lz = L * l, h = 2.9; g.box(0, y + h / 2, zc, B * w, h, lz, BP.white);
    for (const s of [-1, 1]) g.quad([s * (B * w / 2 + .02), y + 1.1, zc - lz / 2 + 2], [s * (B * w / 2 + .02), y + 1.1, zc + lz / 2 - 2], [s * (B * w / 2 + .02), y + 2.1, zc + lz / 2 - 2], [s * (B * w / 2 + .02), y + 2.1, zc - lz / 2 + 2], BP.glass, .8);
    y += h; }
  const bz = -L * .26; g.box(0, y - 1.4, bz, B * 1.02, 2.8, 6, BP.white); g.band(bz - 3.01, B * .48, y - 2.3, y - .9, .4);
  g.rod([0, y, L * .25], [0, y + 7, L * .27], 0, BP.white, { rx: 2.2, rz: 4, seg: 8 }); g.rod([0, y + 7, L * .27], [0, y + 8.5, L * .275], 0, BP.black, { rx: 2.25, rz: 4.05, seg: 8 });
  g.rod([0, y, bz + 6], [0, y + 9, bz + 6], .3, BP.white, { seg: 5 });
  return { key: 'cruise', name: 'cruise or large passenger ship', geo: g.geometry(), L0: L, B0: B, deck: y, top: [y + 9, bz + 6] };
}

let CACHE = null;
// all models by key, made once
export function models() {
  if (CACHE) return CACHE;
  const M = {};
  const add = m => { M[m.key] = m; };
  add(canalBoat('narrowboat', 18, 2.08, 1.25)); add(canalBoat('widebeam', 17, 3.6, 1.45));
  add(dutchBarge(false)); add(dutchBarge(true)); add(lighter()); add(floatingHome()); add(yacht()); add(cruiser()); add(sailingBarge());
  add(tug()); add(launch()); add(ship(false)); add(ship(true)); add(dredger()); add(barge()); add(cruise());
  add({ key: 'cat', name: 'fast passenger catamaran (river bus)', geo: pack(clipper(38, 8.6)), L0: 38, B0: 8.6, deck: 5.3, top: [7.3, -38 * .3 + 4] });
  add({ key: 'tour', name: 'passenger boat', geo: pack(tourBoat(34, 7.6, 'citycruises')), L0: 34, B0: 7.6, deck: 6, top: [6.2, -34 * .28 + 1.6] });
  for (const m of Object.values(M)) { m.geo.computeBoundingBox(); m.tris = m.geo.getAttribute('position').count / 3; }
  return (CACHE = M);
}

// ---------- AIS: the model for a vessel (ITU ship type, length, beam, name); returns a key of models()
export function aisModel(v) {
  const t = v.ship_type, L = v.length || 0, B = v.beam || 0, nm = String(v.name || '').toUpperCase(), r = B && L ? B / L : 0;
  if (/^S\.? ?B\.? /.test(nm) || /SAILING BARGE/.test(nm)) return 'sbarge';
  if (t === 52 || t === 31 || t === 32) return 'tug';
  if (t === 33) return L >= 30 ? 'dredger' : 'launch';
  if (t >= 40 && t <= 49) return L >= 20 && (r >= .18 || /CLIPPER/.test(nm)) ? 'cat' : 'launch';
  if (t >= 60 && t <= 69) return L >= 100 ? 'cruise' : /CLIPPER/.test(nm) || (r >= .3 && L < 45) ? 'cat' : L >= 15 ? 'tour' : 'launch';
  if (t >= 70 && t <= 79) return L >= 45 && r < .2 ? 'cargo' : 'barge';
  if (t >= 80 && t <= 89) return 'tanker';
  if (t >= 50 && t <= 59) return 'launch';
  if (t === 30) return 'launch';
  if (L >= 60) return 'cargo';
  if (L >= 25 && r >= .25) return 'barge';
  return 'launch';
}
// default size of a vessel with no AIS dimensions, by model
export const TYPICAL = { tug: [20, 7], launch: [13, 4.2], cat: [38, 8.6], tour: [32, 7.4], cruise: [139, 22], cargo: [80, 12.6], tanker: [60, 10], dredger: [60, 11.5], barge: [50, 11], sbarge: [26, 6.2] };
// a seeded hash (0..1) of a string or number
export function hash01(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
export const pick = (list, u) => list[Math.min(list.length - 1, Math.floor(u * list.length))];
// the paint colours (linear) of a boat of model `key`, seeded by `seed`
export function paintOf(key, seed) {
  const u = k => hash01(seed + ':' + k), P = PAINT;
  switch (key) {
    case 'narrowboat': case 'widebeam': return [lin(pick(P.canal, u(1))), lin(pick(P.canal2, u(2)))];
    case 'dutch': case 'dutchmast': return [lin(pick(P.barge, u(1))), lin(pick(P.wheel, u(2)))];
    case 'lighter': return [lin(pick(P.cladding, u(1))), lin(pick(P.trim, u(2)))];
    case 'home': return [lin(pick(P.cladding, u(1))), lin(pick(P.cladding, u(3)))];
    case 'yacht': return [lin(pick(P.yacht, u(1))), lin(pick(P.sailcover, u(2)))];
    case 'cruiser': return [lin(pick(P.yacht, u(1) * .7)), lin(pick(P.sailcover, u(2)))];
    case 'sbarge': return [BP.black, lin(pick(['#9e2f28', '#d6a923', '#2f6b3a', '#eceeed'], u(2)))];
    case 'tug': return [lin(pick(P.tugTop, u(1))), lin(pick(P.tugHull, u(2)))];
    case 'launch': return [lin(pick(P.launch, u(1))), BP.white];
    case 'cargo': case 'dredger': return [lin(pick(P.ship, u(1))), lin(pick(P.funnel, u(2)))];
    case 'tanker': return [lin(pick(['#5a2620', '#1b1d1f', '#9e2f28', '#1d2b45'], u(1))), lin(pick(P.funnel, u(2)))];
    case 'barge': return [lin(pick(P.rusty, u(1))), BP.white];
    default: return [BP.white, BP.white];
  }
}
