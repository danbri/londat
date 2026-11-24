// Tower Bridge for the "bridges" layer (layers/bridges.js), 2026-11-24. The model (area.js, from OSM building parts) drew
// the bridge as solid blocks: the two bascule leaves (w934056844, w934056845) and the two side spans (w934056842,
// w934056843, building=bridge parts) from 3.1 to 12.1 m OD, down into the water; the high-level walkways (w367652753,
// w367653917) from 3.1 to 48.1 m OD, a block 45 m high where the owner's photo IMG_2337 of 2026-11-23 shows sky. This
// module hides those parts and draws, on the line through the OSM gate towers (Northern Gate w934056841, Southern Gate
// w934056839 family; the main towers are left to the model, with the masonry look):
//   - the decks: road top 12.1 m OD (the OSM parts' top), 18.3 m wide (60 ft between the parapets: Wikipedia, Tower
//     Bridge), 1.8 m deep (judged), with blue-painted fascias, a parapet and a grey underside lit as London Bridge's is;
//   - the two suspension chains of each side span (lattice girders 2.6 m deep in IMG_2337: two chords and diagonals), one
//     each side of the deck, from the main tower at the walkway's lower edge (45.6 m OD, IMG_2337) down to just
//     above the deck near mid-span and up to the gate tower at 28 m OD (the shape judged from photographs; Wikipedia: "The
//     two side spans were suspension bridges, with rods anchored both at the abutments and through rods contained in the
//     bridge's upper walkways"), with vertical hangers every 6 m;
//   - the walkways: each OSM outline from 45.6 to 51.2 m OD, measured on IMG_2337 (camera solve: 640 m to the tower,
//     0.13 m a pixel; the girder's lower edge 44 m above the water at 1.6 m OD, 5.6 m deep). Sources: "from 42 metres
//     above the River Thames" (https://www.towerbridge.org.uk/), 44 m at high tide (Wikipedia);
//   - a spire on each corner turret of the main towers (the OSM turret parts, 3 x 3 m to 61 m OD): a square pyramid to
//     67 m OD with a finial to 68.4 m (IMG_2337: the turret spire tips about 69 m OD); and a central spire on each tower
//     (below: the OSM top box hidden).
// Measures checked: the main towers' centres are 82.6 m apart (61 m clear span, 200 ft, plus the towers). Colours: the
// steel blue and white (the paint of 1977, later blue and white: Wikipedia), drawn light blue; the stone as the model.
// By night the steel (chains, hangers, walkways, deck fascias) is lit (an LED system concealed in the structure:
// Wikipedia); colour judged a cool white-blue.
export const TB = {
  NG: [-3828.4, -93.4], SG: [-3928.4, 165.1],         // gate tower centres (OSM parts 39880, 39879)
  NT: [-3863.9, -3.2], ST: [-3893.9, 73.8],           // main tower centres (OSM parts 39876, 39872)
  ROAD: 12.1, DEPTH: 1.8, HALF: 9.15, PAR: 1.2, CHAIN_TOWER: 45.6, CHAIN_GATE: 28, CHAIN_LOW: 14.5, CHAIN_DEPTH: 2.6, WALK: [45.6, 51.2],
};
// OSM parts drawn here instead of by the model: centres (model metres) of the deck parts (b 3.1, h 9)
const DECK_PARTS = [[-3913.5, 125.3], [-3843.8, -55.3], [-3884.5, 49.4], [-3873.2, 20.9]];
const STEEL = [.56, .70, .82], STEEL_D = [.40, .54, .68], WHITE = [.86, .88, .88], ROADC = [.24, .24, .25], UNDER = [.58, .60, .62], SLATE = [.38, .40, .43], GILT = [.78, .66, .34];

export function towerBridge({ A, dec }) {
  const L = new Lists(), hide = new Set(), stats = {};
  const [nx, nz] = TB.NG, len = Math.hypot(TB.SG[0] - nx, TB.SG[1] - nz), ax = (TB.SG[0] - nx) / len, az = (TB.SG[1] - nz) / len, px = -az, pz = ax;
  const F = (s, o, y) => [nx + ax * s + px * o, y, nz + az * s + pz * o], S = q => (q[0] - nx) * ax + (q[1] - nz) * az, O = q => (q[0] - nx) * px + (q[1] - nz) * pz;
  // the parts: centres, rings; extents of the towers along the axis from their parts over 40 m (main) or 20 m (gates)
  const parts = (A.buildings || []).map((b, i) => { const q = dec(b.p), r = []; for (let k = 0; k < q.length; k += 2) r.push([q[k], q[k + 1]]);
    const c = r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]); return { i, b, r, c }; });
  const near = (c, p, d) => Math.hypot(c[0] - p[0], c[1] - p[1]) < d;
  const extent = (T, d, hmin) => { let a = 1e9, z = -1e9; for (const P of parts) if (near(P.c, T, d) && P.b.h >= hmin) for (const q of P.r) { const s = S(q); a = Math.min(a, s); z = Math.max(z, s); } return a < z ? [a, z] : null; };
  const eN = extent(TB.NT, 16, 40), eS = extent(TB.ST, 16, 40), gN = extent(TB.NG, 14, 20), gS = extent(TB.SG, 14, 20);
  if (!eN || !eS || !gN || !gS) return { L, hide, stats: { missing: true } };
  stats.span_clear = +(eS[0] - eN[1]).toFixed(1); stats.side_north = +(eN[0] - gN[1]).toFixed(1); stats.side_south = +(gS[0] - eS[1]).toFixed(1);
  for (const P of parts) {
    if (P.b.h < 10 && Math.abs(P.b.b - 3.1) < .3 && DECK_PARTS.some(d => near(P.c, d, 3))) hide.add(P.i);   // the deck blocks
    if (P.b.h >= 40 && P.b.b + P.b.h < 50 && S(P.c) > eN[1] - 2 && S(P.c) < eS[0] + 2 && Math.abs(O(P.c)) < 25) {   // the walkway blocks
      hide.add(P.i); L.band('steel', P.r, TB.WALK[0], TB.WALK[1], STEEL); L.cap('steel', P.r, TB.WALK[1], WHITE, 1); L.cap('steel', P.r, TB.WALK[0], STEEL_D, -1); }
  }
  // the decks: north side span, the bascules, south side span
  const H = TB.HALF, top = TB.ROAD, bot = TB.ROAD - TB.DEPTH;
  const deck = (s0, s1) => { const n = Math.max(1, Math.round((s1 - s0) / 6));
    for (let k = 0; k < n; k++) { const a = s0 + (s1 - s0) * k / n, b = s0 + (s1 - s0) * (k + 1) / n;
      L.quadH('road', F(a, -H, top), F(b, -H, top), F(b, H, top), F(a, H, top), ROADC, [0, 1, 0]);
      L.quadH('under', F(a, -H, bot), F(b, -H, bot), F(b, H, bot), F(a, H, bot), UNDER, [0, -1, 0]);
      for (const o of [-H, H]) { const out = [px * Math.sign(o), 0, pz * Math.sign(o)];
        L.quadH('steel', F(a, o, bot), F(b, o, bot), F(b, o, top), F(a, o, top), STEEL, out);
        L.quadH('steel', F(a, o, top), F(b, o, top), F(b, o, top + TB.PAR), F(a, o, top + TB.PAR), WHITE, out);
        L.quadH('steel', F(a, o, top), F(b, o, top), F(b, o, top + TB.PAR), F(a, o, top + TB.PAR), WHITE, out.map(v => -v)); } } };
  deck(gN[1], eN[0]); deck(eN[1], eS[0]); deck(eS[1], gS[0]);
  // the chains: a parabola through the tower end, the low point (55 % of the span from the tower) and the gate end
  const chain = (sT, sG) => { const sL = sT + (sG - sT) * .55, n = 28, para = s => { const x = [sT, sL, sG], y = [TB.CHAIN_TOWER, TB.CHAIN_LOW, TB.CHAIN_GATE];
      return x.reduce((acc, xi, i) => acc + y[i] * x.reduce((m, xj, j) => j === i ? m : m * (s - xj) / (xi - xj), 1), 0); };
    for (const o of [-(H + .6), H + .6]) {
      const pts = []; for (let k = 0; k <= n; k++) { const s = sT + (sG - sT) * k / n; pts.push([s, para(s)]); }
      const hd = TB.CHAIN_DEPTH / 2;   // a lattice girder: the top and bottom chords and a diagonal in each panel
      for (let k = 0; k < n; k++) { const [s0, y0] = pts[k], [s1, y1] = pts[k + 1];
        L.tube('steel', F(s0, o, y0 + hd), F(s1, o, y1 + hd), .55, .55, STEEL); L.tube('steel', F(s0, o, y0 - hd), F(s1, o, y1 - hd), .55, .55, STEEL);
        L.tube('steel', F(s0, o, k % 2 ? y0 + hd : y0 - hd), F(s1, o, k % 2 ? y1 - hd : y1 + hd), .3, .3, STEEL_D); }
      const dir = Math.sign(sG - sT); for (let s = sT + dir * 6; dir * (sG - s) > 3; s += dir * 6) { const y = para(s); if (y > top + 1.5) L.tube('steel', F(s, o, top + TB.PAR), F(s, o, y), .25, .25, STEEL_D); }
    } };
  chain(eN[0], gN[1]); chain(eS[1], gS[0]);
  // the spires on the corner turrets of the main towers
  let spires = 0;
  for (const P of parts) if (P.b.h >= 55 && P.b.h < 60 && (near(P.c, TB.NT, 16) || near(P.c, TB.ST, 16))) {
    const xs = P.r.map(q => q[0]), zs = P.r.map(q => q[1]), w = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    if (w > 4) continue; const y0 = P.b.b + P.b.h, r = Math.min(1.6, w / 2 + .2); L.pyramid('stone', P.c, r, y0, y0 + 6, SLATE); L.tube('stone', [P.c[0], y0 + 6, P.c[1]], [P.c[0], y0 + 7.4, P.c[1]], .18, .18, GILT); spires++;
  }
  // the top of each main tower: the OSM part to 68 m OD (21 x 14 m) is a box over the whole top, where IMG_2337 shows the
  // stone body ending lower with a steep roof; it is hidden, so the stepped body (parts to 57 and 60 m OD) and the turrets
  // show, and the central part (9 x 11 m, to 60 m OD) gets a steep spire to 73 m with a finial to 75 m (IMG_2337: about
  // 76 m OD at the tip)
  for (const T of [TB.NT, TB.ST]) { let best = null;
    for (const P of parts) if (near(P.c, T, 6)) { if (P.b.h >= 62) hide.add(P.i); else if (P.b.h >= 50 && (!best || P.b.b + P.b.h > best.b.b + best.b.h)) best = P; }
    if (best) { const xs = best.r.map(q => q[0]), zs = best.r.map(q => q[1]), r = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2, y0 = best.b.b + best.b.h;
      L.pyramid('stone', best.c, Math.min(r, 4.5), y0, 73, SLATE); L.tube('stone', [best.c[0], 73, best.c[1]], [best.c[0], 75, best.c[1]], .25, .25, GILT); spires++; } }
  stats.spires = spires; stats.hidden = hide.size;
  return { L, hide, stats };
}

// triangle lists by material: steel (lit by night), road, under (lit from below), stone
class Lists {
  constructor() { this.m = {}; }
  get(k) { return this.m[k] || (this.m[k] = { p: [], c: [] }); }
  tri(k, a, b, c, col) { const L = this.get(k); L.p.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) L.c.push(...col); }
  // a quad wound so that its normal points along the hint
  quadH(k, a, b, c, d, col, hint) { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) { this.tri(k, a, c, b, col); this.tri(k, a, d, c, col); } else { this.tri(k, a, b, c, col); this.tri(k, a, c, d, col); } }
  band(k, ring, y0, y1, col) { const c = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length], m = [(p[0] + q[0]) / 2 - c[0], 0, (p[1] + q[1]) / 2 - c[1]];
      this.quadH(k, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], col, m); } }
  cap(k, ring, y, col, up) { const c = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; const a = [c[0], y, c[1]], b = [p[0], y, p[1]], d = [q[0], y, q[1]];
      const n = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]); if (n * up >= 0) this.tri(k, a, b, d, col); else this.tri(k, a, d, b, col); } }
  // a square tube of width w and height h between two points (the chains, hangers, finials)
  tube(k, a, b, w, h, col) { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1, t = d.map(v => v / l);
    let s = [-t[2], 0, t[0]]; const sl = Math.hypot(...s); s = sl < 1e-3 ? [1, 0, 0] : s.map(v => v / sl);
    const u = [t[1] * s[2] - t[2] * s[1], t[2] * s[0] - t[0] * s[2], t[0] * s[1] - t[1] * s[0]];
    const P = (p, i, j) => [p[0] + s[0] * i * w / 2 + u[0] * j * h / 2, p[1] + s[1] * i * w / 2 + u[1] * j * h / 2, p[2] + s[2] * i * w / 2 + u[2] * j * h / 2];
    for (const [i0, j0, i1, j1, n] of [[-1, 1, 1, 1, u], [1, -1, -1, -1, u.map(v => -v)], [1, -1, 1, 1, s], [-1, 1, -1, -1, s.map(v => -v)]])
      this.quadH(k, P(a, i0, j0), P(b, i0, j0), P(b, i1, j1), P(a, i1, j1), col, n); }
  pyramid(k, c, r, y0, y1, col) { const q = [[c[0] - r, c[1] - r], [c[0] + r, c[1] - r], [c[0] + r, c[1] + r], [c[0] - r, c[1] + r]], apex = [c[0], y1, c[1]];
    for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4], m = [(p[0] + n[0]) / 2 - c[0], 0.6 * r, (p[1] + n[1]) / 2 - c[1]];
      const a = [p[0], y0, p[1]], b = [n[0], y0, n[1]], u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [apex[0] - a[0], apex[1] - a[1], apex[2] - a[2]];
      const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (nn[0] * m[0] + nn[1] * m[1] + nn[2] * m[2] < 0) this.tri(k, a, apex, b, col); else this.tri(k, a, b, apex, col); } }
}
