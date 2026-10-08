// Detailed building models for the 3D page: each hand-made description (cwplans/docklands/models/*.spec.json: sizes from
// a contributed photo and the LiDAR roof profile, with the evidence) + the model outline in area.js -> triangles by part
// with colours (cwplans/docklands/data/building-models.json, which the page draws instead of the building's extruded
// outline) and a glTF binary file beside each description. One logged operation (kgx-ops Flow; log in londat kgx/log),
// graph version building-models, named in kgx/external-heads.json.
//   node cwplans/tools/build-building-models.mjs
// Skills: docklands-3d-page ("Detailed building models"), docklands-data-curation ("Contributed photos"), cwplans-dataflow.
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import vm from 'vm';
import { dataFactory as F } from '@factoidal/core';
import { TOOLS } from './lib.mjs';
import { LONDAT_DIR } from './londat.mjs';
import { Flow } from './kgx-ops.mjs';
import { kid, VOCAB } from './kgx-ids.mjs';

const CW = join(TOOLS, '..'), MD = join(CW, 'docklands', 'models'), AREA = join(CW, 'docklands', 'data', 'area.js'), OUT = join(CW, 'docklands', 'data', 'building-models.json');
const K = join(LONDAT_DIR, 'kgx'), sha = b => createHash('sha256').update(b).digest('hex');
const specs = readdirSync(MD).filter(f => f.endsWith('.spec.json')).sort();
const flow = new Flow(K);
const inputs = [flow.file(AREA, 'cwplans/docklands/data/area.js')];
for (const f of specs) {
  const s = JSON.parse(readFileSync(join(MD, f), 'utf8'));
  inputs.push(flow.file(join(MD, f), 'cwplans/docklands/models/' + f), flow.file(join(LONDAT_DIR, s.lidar_profile), s.lidar_profile), flow.file(join(LONDAT_DIR, s.photo), 'danbri/londat ' + s.photo));
}
const op = { id: 'build-building-models', version: 1, skill: 'docklands-3d-page', tool: 'cwplans/tools/build-building-models.mjs',
  about: 'hand-made building descriptions (photo and LiDAR sizes with evidence) + the model outline in area.js -> triangles by part with colours for the 3D page (docklands/data/building-models.json) and a glTF binary file per building' };

// ---- geometry: a frame on a wall of the outline; points [u along, o into the building, h above the ground] -> page metres
const hex = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16) / 255);
function frameOf(ring, fr) {
  const O = ring[fr.origin], T = ring[fr.toward], I = ring[fr.inside], L = Math.hypot(T[0] - O[0], T[1] - O[1]), U = [(T[0] - O[0]) / L, (T[1] - O[1]) / L];
  let N = [-U[1], U[0]]; if ((I[0] - O[0]) * N[0] + (I[1] - O[1]) * N[1] < 0) N = [-N[0], -N[1]];
  const loc = p => [(p[0] - O[0]) * U[0] + (p[1] - O[1]) * U[1], (p[0] - O[0]) * N[0] + (p[1] - O[1]) * N[1]];
  return { O, U, N, L, loc, W: (u, o, h, g) => [O[0] + U[0] * u + N[0] * o, g + h, O[1] + U[1] * u + N[1] * o], V: (du, dO, dh) => [U[0] * du + N[0] * dO, dh, U[1] * du + N[1] * dO] };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
class Part {
  constructor(name, cls, col, basis) { Object.assign(this, { name, cls, col, basis, tris: [] }); }
  // one triangle, wound so that its normal (b - a) x (c - a) points along the hint (outward)
  tri(a, b, c, hint) { const n = cross(sub(b, a), sub(c, a)); if (Math.hypot(...n) < 1e-9) return; this.tris.push(dot(n, hint) < 0 ? [a, c, b] : [a, b, c]); }
  poly(pts, hint) { for (let k = 1; k + 1 < pts.length; k++) this.tri(pts[0], pts[k], pts[k + 1], hint); }   // convex only
}
function build(spec, A) {
  const b = A.buildings[spec.model_index], acc = [0, 0], ring = [];
  b.p.forEach((q, k) => { acc[k % 2] += q; if (k % 2) ring.push([acc[0] / 10, acc[1] / 10]); });
  const g = b.b, C = spec.colours, parts = new Map(), P = (name, cls, col, basis) => parts.get(name) || parts.set(name, new Part(name, cls, hex(C[col]), basis)).get(name);
  const FR = Object.fromEntries(Object.entries(spec.frames).map(([k, f]) => [k, frameOf(ring, f)]));
  // a box in a frame (the bottom left out on the ground)
  const box = (part, f, u0, u1, o0, o1, h0, h1) => { const w = (u, o, h) => f.W(u, o, h, g), q = (a, b, c, d, n) => part.poly([a, b, c, d], n);
    q(w(u0, o0, h0), w(u1, o0, h0), w(u1, o0, h1), w(u0, o0, h1), f.V(0, -1, 0)); q(w(u0, o1, h0), w(u1, o1, h0), w(u1, o1, h1), w(u0, o1, h1), f.V(0, 1, 0));
    q(w(u0, o0, h0), w(u0, o1, h0), w(u0, o1, h1), w(u0, o0, h1), f.V(-1, 0, 0)); q(w(u1, o0, h0), w(u1, o1, h0), w(u1, o1, h1), w(u1, o0, h1), f.V(1, 0, 0));
    q(w(u0, o0, h1), w(u1, o0, h1), w(u1, o1, h1), w(u0, o1, h1), [0, 1, 0]); if (h0 > 1e-3) q(w(u0, o0, h0), w(u1, o0, h0), w(u1, o1, h0), w(u0, o1, h0), [0, -1, 0]); };
  // a wall: base point B, unit direction D along it, outward unit normal X (page x, z); a in metres along, h above the
  // ground, d outward. Openings are cut out of a grid of the wall, with reveals; each opening fills itself.
  const wallAt = (B, D, X) => ({ P: (a, h, d = 0) => [B[0] + D[0] * a + X[0] * d, g + h, B[1] + D[1] * a + X[1] * d], out: [X[0], 0, X[1]], along: [D[0], 0, D[1]] });
  const wallInFrame = (f, plane, c, sign) => plane === 'o' ? wallAt([f.O[0] + f.N[0] * c, f.O[1] + f.N[1] * c], f.U, [f.N[0] * sign, f.N[1] * sign])
    : wallAt([f.O[0] + f.U[0] * c, f.O[1] + f.U[1] * c], f.N, [f.U[0] * sign, f.U[1] * sign]);
  function wall(part, Wl, a0, a1, h0, h1, holes = []) {
    const xs = [...new Set([a0, a1, ...holes.flatMap(o => [o.a0, o.a1])])].sort((x, y) => x - y), ys = [...new Set([h0, h1, ...holes.flatMap(o => [o.h0, o.h1])])].sort((x, y) => x - y);
    for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      if (cx < a0 || cx > a1 || cy < h0 || cy > h1 || holes.some(o => cx > o.a0 && cx < o.a1 && cy > o.h0 && cy < o.h1)) continue;
      part.poly([Wl.P(xs[i], ys[j]), Wl.P(xs[i + 1], ys[j]), Wl.P(xs[i + 1], ys[j + 1]), Wl.P(xs[i], ys[j + 1])], Wl.out);
    }
    for (const o of holes) {   // reveals (in the wall's colour) and the filling
      const r = -(o.depth ?? .12), q = (a, b, c, d, n) => part.poly([a, b, c, d], n), nI = Wl.out.map(v => -v);
      q(Wl.P(o.a0, o.h0), Wl.P(o.a1, o.h0), Wl.P(o.a1, o.h0, r), Wl.P(o.a0, o.h0, r), [0, 1, 0]); q(Wl.P(o.a0, o.h1), Wl.P(o.a1, o.h1), Wl.P(o.a1, o.h1, r), Wl.P(o.a0, o.h1, r), [0, -1, 0]);
      q(Wl.P(o.a0, o.h0), Wl.P(o.a0, o.h1), Wl.P(o.a0, o.h1, r), Wl.P(o.a0, o.h0, r), Wl.along); q(Wl.P(o.a1, o.h0), Wl.P(o.a1, o.h1), Wl.P(o.a1, o.h1, r), Wl.P(o.a1, o.h0, r), Wl.along.map(v => -v));
      o.fill(Wl, r, nI);
    }
  }
  const rect = (part, Wl, a0, a1, h0, h1, d) => part.poly([Wl.P(a0, h0, d), Wl.P(a1, h0, d), Wl.P(a1, h1, d), Wl.P(a0, h1, d)], Wl.out);
  // a window: glass at the back of the reveal, a frame and glazing bars 2 cm in front of it
  const windowHole = (a0, a1, h0, h1, grid, glass, basis) => ({ a0, a1, h0, h1, fill(Wl, r) {
    rect(P('glass-' + glass, 'glass', glass, basis), Wl, a0, a1, h0, h1, r);   // one pane = two triangles in a row (the page lights panes at night by that)
    const fr = P('window-frames', 'window', 'frame', basis), d = r + .02, e = .06, bw = .035, [nc, nr] = grid;
    rect(fr, Wl, a0, a1, h0, h0 + e, d); rect(fr, Wl, a0, a1, h1 - e, h1, d); rect(fr, Wl, a0, a0 + e, h0, h1, d); rect(fr, Wl, a1 - e, a1, h0, h1, d);
    for (let k = 1; k < nc; k++) { const x = a0 + (a1 - a0) * k / nc; rect(fr, Wl, x - bw / 2, x + bw / 2, h0, h1, d); }
    for (let k = 1; k < nr; k++) { const y = h0 + (h1 - h0) * k / nr; rect(fr, Wl, a0, a1, y - bw / 2, y + bw / 2, d); }
  } });
  const disc = (part, Wl, ca, ch, r, d, n = 24, from = 0, to = 2 * Math.PI) => { const pts = [Wl.P(ca, ch, d)]; for (let k = 0; k <= n; k++) { const t = from + (to - from) * k / n; pts.push(Wl.P(ca + r * Math.cos(t), ch + r * Math.sin(t), d)); } part.poly(pts, Wl.out); };

  // ---- south wing (the face in the photo)
  const S = spec.south_wing, fS = FR[S.frame], L = S.length, Dp = S.depth, ro = S.ridge_o, sl = (S.ridge - S.eave) / ro, roof = o => S.ridge - sl * Math.abs(o - ro);
  const pb = 'photo (front face), LiDAR (heights), OSM (outline)', xb = 'extrapolated: the rear is not in the photo';
  const brick = P('south-wing-walls', 'wall', 'brick', pb), mid = L / 2;
  const win = (w, k, basis) => w.centres_from_middle.map((c, i) => windowHole(mid + c - w.width / 2, mid + c + w.width / 2, w.y[0], w.y[1], w.grid, w.glass[i], basis));
  const front = wallInFrame(fS, 'o', 0, -1), rear = wallInFrame(fS, 'o', Dp, 1);
  wall(brick, front, 0, L, 0, S.eave, [...win(S.windows_upper, 0, pb), ...win(S.windows_lower, 0, pb)]);
  wall(P('south-wing-rear', 'wall', 'brick', xb), rear, 0, L, 0, S.eave, [...win(S.windows_upper, 0, xb), ...win(S.windows_lower, 0, xb)]);
  const pa = S.parapet, up = pa.above_roof, co = pa.coping_overhang;
  for (const [u, s] of [[0, -1], [L, 1]]) {   // gable ends: the wall rises to the parapet; the parapet's inner face; coping; kneelers
    const Wl = wallInFrame(fS, 'u', u, s), ui = u - s * pa.thickness, inner = wallInFrame(fS, 'u', ui, -s);
    for (const [o0, o1] of [[0, ro], [ro, Dp]]) {
      brick.poly([Wl.P(o0, 0), Wl.P(o1, 0), Wl.P(o1, roof(o1) + up), Wl.P(o0, roof(o0) + up)], Wl.out);
      brick.poly([inner.P(o0, roof(o0)), inner.P(o1, roof(o1)), inner.P(o1, roof(o1) + up), inner.P(o0, roof(o0) + up)], inner.out);
      const cp = P('parapet-coping', 'roof', 'coping', 'photo'), uo = u + s * co, un = ui - s * co, y = o => roof(o) + up;
      cp.poly([fS.W(uo, o0, y(o0) + pa.coping, g), fS.W(un, o0, y(o0) + pa.coping, g), fS.W(un, o1, y(o1) + pa.coping, g), fS.W(uo, o1, y(o1) + pa.coping, g)], [0, 1, 0]);
      for (const uu of [uo, un]) cp.poly([fS.W(uu, o0, y(o0), g), fS.W(uu, o1, y(o1), g), fS.W(uu, o1, y(o1) + pa.coping, g), fS.W(uu, o0, y(o0) + pa.coping, g)], fS.V(uu === uo ? s : -s, 0, 0));
    }
    const kn = P('parapet-coping', 'roof', 'coping', 'photo'), [kh, kd] = pa.kneeler, ua = Math.min(u + s * co, ui - s * co), ub = Math.max(u + s * co, ui - s * co);
    box(kn, fS, ua, ub, -S.overhang - .05, kd - S.overhang, S.eave - .1, S.eave - .1 + kh); box(kn, fS, ua, ub, Dp - kd + S.overhang, Dp + S.overhang + .05, S.eave - .1, S.eave - .1 + kh);
  }
  { const rf = P('south-wing-roof', 'roof', 'roof', 'LiDAR (pitch and ridge), photo (slate)'), ov = S.overhang, W = (u, o) => fS.W(u, o, roof(o), g);
    rf.poly([W(0, -ov), W(L, -ov), W(L, ro), W(0, ro)], [0, 1, 0]); rf.poly([W(0, ro), W(L, ro), W(L, Dp + ov), W(0, Dp + ov)], [0, 1, 0]);
    const so = P('south-wing-fascia', 'roof', 'fascia', 'photo'); const [f0, f1, fd] = S.fascia, ui = pa.thickness;
    box(so, fS, ui, L - ui, -fd, 0, f0, f1); box(so, fS, ui, L - ui, Dp, Dp + fd, f0, f1);
    box(P('ridge', 'roof', 'ridge', 'photo'), fS, ui, L - ui, ro - .13, ro + .13, S.ridge - .06, S.ridge + .1); }
  const [s0, s1, sx] = S.sill_upper, [l0, l1, lx] = S.lintel_lower, sill = P('sills', 'wall', 'brick_sill', pb), stone = P('stone', 'wall', 'stone', pb);
  for (const c of S.windows_upper.centres_from_middle) for (const [o0, o1] of [[-.04, 0], [Dp, Dp + .04]]) box(sill, fS, mid + c - S.windows_upper.width / 2 - sx, mid + c + S.windows_upper.width / 2 + sx, o0, o1, s0, s1);
  for (const c of S.windows_lower.centres_from_middle) for (const [o0, o1] of [[-.03, 0], [Dp, Dp + .03]]) box(stone, fS, mid + c - S.windows_lower.width / 2 - lx, mid + c + S.windows_lower.width / 2 + lx, o0, o1, l0, l1);
  for (const u of S.downpipes_u) box(P('downpipes', 'pipe', 'pipe', 'photo'), fS, u - .05, u + .05, -.16, -.06, 0, S.fascia[0]);
  { const R = S.railing, rl = P('railings', 'railing', 'railing', 'photo (judged position)');
    for (const [a0, a1] of R.u) { box(rl, fS, a0, a1, R.o - .025, R.o + .025, R.height - .05, R.height); box(rl, fS, a0, a1, R.o - .02, R.o + .02, .1, .14);
      for (let u = a0; u <= a1 + 1e-6; u += R.posts_every) box(rl, fS, u - .03, u + .03, R.o - .03, R.o + .03, 0, R.height + .05);
      const fw = wallInFrame(fS, 'o', R.o, -1); for (let u = a0 + .15; u < a1; u += .15) rect(rl, fw, u - .008, u + .008, .14, R.height - .05, 0); } }

  // ---- the entrance bay with its lead hood
  const Y = spec.bay, fB = FR[Y.frame], pj = Y.projection, H = Y.hood, cu = (H.u[0] + H.u[1]) / 2, hw = (H.u[1] - H.u[0]) / 2, rise = H.apex - H.spring;
  const Rr = (hw * hw + rise * rise) / (2 * rise), cy = H.apex - Rr, Ri = Rr - H.thickness, under = u => cy + Math.sqrt(Math.max(0, Ri * Ri - (u - cu) ** 2));
  const bb = 'photo', bw = P('bay-walls', 'wall', 'brick', bb), bf = wallInFrame(fB, 'o', -pj, -1), hs = under(Y.u[0]);
  const teal = P('door-and-sign', 'door', 'teal', bb), td = P('door-panels', 'door', 'teal_dark', bb);
  wall(bw, bf, Y.u[0], Y.u[1], 0, hs, [
    windowHole(Y.window.u[0], Y.window.u[1], Y.window.y[0], Y.window.y[1], Y.window.grid, 'glass_light', bb),
    { a0: Y.sign_panel.u[0], a1: Y.sign_panel.u[1], h0: Y.sign_panel.y[0], h1: Y.sign_panel.y[1], depth: .03, fill(Wl, r) {
      rect(teal, Wl, this.a0, this.a1, this.h0, this.h1, r); const R = Y.roundel;
      disc(P('sign-ring', 'sign', 'ring', bb), Wl, R.u, R.y, R.r, r + .01); disc(P('sign-cream', 'sign', 'cream', bb), Wl, R.u, R.y, R.r - R.ring, r + .015);
      disc(P('sign-sun', 'sign', 'sun', bb), Wl, R.u, R.y, R.r * .32, r + .02, 12, 0, Math.PI);
      const wv = P('sign-waves', 'sign', 'wave', bb); for (const k of [0, 1, 2]) rect(wv, Wl, R.u - R.r * (.34 - .04 * k), R.u + R.r * (.34 - .04 * k), R.y - .05 - k * .07, R.y - .02 - k * .07, r + .02);
    } },
    { a0: Y.door.u[0], a1: Y.door.u[1], h0: 0, h1: Y.door.y[1], depth: .1, fill(Wl, r) {
      rect(teal, Wl, this.a0, this.a1, 0, this.h1, r); rect(td, Wl, this.a0 + .06, this.a1 - .06, Y.door.transom, this.h1 - .06, r + .01);
      rect(td, Wl, (this.a0 + this.a1) / 2 - .015, (this.a0 + this.a1) / 2 + .015, 0, Y.door.transom, r + .01);
      for (const k of [.25, .75]) { const ca = this.a0 + (this.a1 - this.a0) * k, ch = Y.door.transom * .55, rr = .32; td.poly([Wl.P(ca, ch - rr, r + .01), Wl.P(ca + rr, ch, r + .01), Wl.P(ca, ch + rr, r + .01), Wl.P(ca - rr, ch, r + .01)], Wl.out); }
    } }]);
  { const pts = []; for (let k = 0; k <= 16; k++) { const u = Y.u[0] + (Y.u[1] - Y.u[0]) * k / 16; pts.push(bf.P(u, under(u))); } bw.poly([bf.P(cu, hs), ...pts], bf.out);   // the brick under the hood
    for (const [u, s] of [[Y.u[0], -1], [Y.u[1], 1]]) { const Wl = wallInFrame(fB, 'u', u, s), oc = ro - (S.ridge - hs) / sl;
      bw.poly([Wl.P(-pj, 0), Wl.P(0, 0), Wl.P(0, hs), Wl.P(-pj, hs)], Wl.out); bw.poly([Wl.P(0, roof(0)), Wl.P(oc, hs), Wl.P(0, hs)], Wl.out); }
    box(stone, fB, Y.band.u[0], Y.band.u[1], -pj - Y.band.proud, -pj, Y.band.y[0], Y.band.y[1]);
    const ld = P('bay-hood', 'roof', 'lead', 'photo (form), LiDAR (projection)'), n = H.segments, o0 = -pj - H.front_overhang, oEnd = h => ro - (S.ridge - h) / sl;
    const arc = (R, k) => { const t0 = Math.asin(hw / Rr), t = -t0 + 2 * t0 * k / n; return [cu + R * Math.sin(t), cy + R * Math.cos(t)]; };
    for (let k = 0; k < n; k++) { const [ua, ha] = arc(Rr, k), [ub, hb] = arc(Rr, k + 1), [ia, ja] = arc(Ri, k), [ib, jb] = arc(Ri, k + 1), mu = (ua + ub) / 2;
      const W = (u, o, h) => fB.W(u, o, h, g), outn = fB.V((mu - cu) / Rr, 0, 1);
      ld.poly([W(ua, o0, ha), W(ub, o0, hb), W(ub, oEnd(hb), hb), W(ua, oEnd(ha), ha)], outn);
      ld.poly([W(ia, o0, ja), W(ib, o0, jb), W(ib, Math.max(o0, oEnd(jb)), jb), W(ia, Math.max(o0, oEnd(ja)), ja)], outn.map(v => -v));
      ld.poly([W(ua, o0, ha), W(ub, o0, hb), W(ib, o0, jb), W(ia, o0, ja)], fB.V(0, -1, 0)); } }

  // ---- north wing (one storey; not in the photo but its eave at the right edge)
  const Nw = spec.north_wing, fN = FR[Nw.frame], cs = Nw.corners.map(i => fN.loc(ring[i])), nb = 'LiDAR (heights), OSM (outline)', nx = 'extrapolated: not in the photo';
  { const dep = (cs[2][1] + cs[3][1]) / 2, om = dep / 2, ns = (Nw.ridge - Nw.eave) / om, hN = o => Nw.ridge - ns * Math.abs(o - om);
    const onEdge = (p, q) => { const t = (om - p[1]) / (q[1] - p[1]); return [p[0] + (q[0] - p[0]) * t, om]; };
    const [c1, c0, c5, c4] = cs, rFar = onEdge(c0, c5), rNear = onEdge(c1, c4), W = (p, h) => fN.W(p[0], p[1], h, g), ctr = [(c1[0] + c0[0] + c5[0] + c4[0]) / 4, (c1[1] + c0[1] + c5[1] + c4[1]) / 4];
    const nw = P('north-wing-walls', 'wall', 'brick', nb + '; windows ' + nx), rf = P('north-wing-roof', 'roof', 'roof', nb), outOf = (p, q) => { const m = [(p[0] + q[0]) / 2 - ctr[0], (p[1] + q[1]) / 2 - ctr[1]]; return fN.V(m[0], m[1], 0); };
    rf.poly([W(c1, hN(c1[1])), W(c0, hN(c0[1])), W(rFar, Nw.ridge), W(rNear, Nw.ridge)], [0, 1, 0]); rf.poly([W(rNear, Nw.ridge), W(rFar, Nw.ridge), W(c5, hN(c5[1])), W(c4, hN(c4[1]))], [0, 1, 0]);
    nw.poly([W(c0, 0), W(c5, 0), W(c5, hN(c5[1])), W(rFar, Nw.ridge), W(c0, hN(c0[1]))], outOf(c0, c5)); nw.poly([W(c4, 0), W(c1, 0), W(c1, hN(c1[1])), W(rNear, Nw.ridge), W(c4, hN(c4[1]))], outOf(c4, c1));
    const lw = spec.south_wing.windows_lower, holes = Wl => [8, 11.5, 15].map(c => windowHole(c - lw.width / 2, c + lw.width / 2, lw.y[0], lw.y[1], lw.grid, 'glass', nx));
    wall(nw, wallInFrame(fN, 'o', 0, -1), 0, c0[0], 0, Nw.eave, holes());
    const dx = c4[0] - c5[0], dz = c4[1] - c5[1], ln = Math.hypot(dx, dz), D = fN.V(dx / ln, dz / ln, 0), X = fN.V(-dz / ln, dx / ln, 0), Xo = dot(X, outOf(c5, c4)) < 0 ? X.map(v => -v) : X;
    const base = fN.W(c5[0], c5[1], 0, g), inner = wallAt([base[0], base[2]], [D[0], D[2]], [Xo[0], Xo[2]]);
    wall(nw, inner, 0, ln, 0, Math.min(hN(c5[1]), hN(c4[1])), [3, 6.5, 10].filter(c => c + 1 < ln).map(c => windowHole(c - lw.width / 2, c + lw.width / 2, lw.y[0], lw.y[1], lw.grid, 'glass', nx)));
    const [f0, f1, fd] = Nw.fascia; box(P('north-wing-fascia', 'roof', 'fascia', nb), fN, .3, c0[0], -fd, 0, f0, f1); }
  return { ring, g, parts: [...parts.values()].filter(p => p.tris.length) };
}

// ---- outputs: page JSON (mm relative to the model's origin, per part an index list) and a glTF binary
function pageModel(spec, m) {
  const all = m.parts.flatMap(p => p.tris.flat()), c = [all.reduce((s, v) => s + v[0], 0) / all.length, m.g, all.reduce((s, v) => s + v[2], 0) / all.length].map(v => Math.round(v * 10) / 10);
  let top = -1e9; for (const v of all) top = Math.max(top, v[1]);
  const parts = m.parts.map(pt => { const key = new Map(), p = [], i = [];
    for (const t of pt.tris) for (const v of t) { const q = v.map((x, k) => Math.round((x - c[k]) * 1000)), s = q.join(','); if (!key.has(s)) { key.set(s, p.length / 3); p.push(...q); } i.push(key.get(s)); }
    return { name: pt.name, cls: pt.cls, basis: pt.basis, col: '#' + pt.col.map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''), p, i }; });
  return { t: c, top_m_od: Math.round(top * 100) / 100, base_m_od: m.g, triangles: m.parts.reduce((s, p) => s + p.tris.length, 0), parts };
}
function glb(spec, m, c) {
  const lin = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4, mats = [], matOf = new Map(), meshes = [], views = [], accs = [], bins = [];
  let off = 0; const push = (arr, target) => { const b = Buffer.from(arr.buffer); bins.push(b, Buffer.alloc((4 - b.length % 4) % 4)); views.push({ buffer: 0, byteOffset: off, byteLength: b.length, target }); off += b.length + (4 - b.length % 4) % 4; return views.length - 1; };
  const prims = m.parts.map(pt => {
    const k = pt.col.join(','); if (!matOf.has(k)) { matOf.set(k, mats.length); mats.push({ name: pt.cls + '-' + k, pbrMetallicRoughness: { baseColorFactor: [...pt.col.map(lin), 1], metallicFactor: 0, roughnessFactor: .9 }, doubleSided: true }); }
    const pos = new Float32Array(pt.tris.length * 9), nor = new Float32Array(pt.tris.length * 9), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    pt.tris.forEach((t, j) => { const n = cross(sub(t[1], t[0]), sub(t[2], t[0])), l = Math.hypot(...n);
      t.forEach((v, q) => { for (let a = 0; a < 3; a++) { const x = v[a] - c[a]; pos[j * 9 + q * 3 + a] = x; nor[j * 9 + q * 3 + a] = n[a] / l; mn[a] = Math.min(mn[a], x); mx[a] = Math.max(mx[a], x); } }); });
    const pv = push(pos, 34962), nv = push(nor, 34962);
    accs.push({ bufferView: pv, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: mn, max: mx }, { bufferView: nv, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
    return { attributes: { POSITION: accs.length - 2, NORMAL: accs.length - 1 }, material: matOf.get(k), extras: { part: pt.name, cls: pt.cls, basis: pt.basis } };
  });
  meshes.push({ name: spec.name, primitives: prims });
  const bin = Buffer.concat(bins), E0 = 537550, N0 = 180300;
  const json = { asset: { version: '2.0', generator: 'cwplans/tools/build-building-models.mjs', copyright: spec.licence }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: spec.name, mesh: 0, extras: { osm: spec.osm, frame: 'x east, y up, z south (metres); origin at OSGB36 / British National Grid E ' + (E0 + c[0]).toFixed(1) + ', N ' + (N0 - c[2]).toFixed(1) + ', ' + c[1] + ' m above Ordnance Datum Newlyn' } }],
    meshes, materials: mats, accessors: accs, bufferViews: views, buffers: [{ byteLength: bin.length }] };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546C67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (n, t) => { const b = Buffer.alloc(8); b.writeUInt32LE(n, 0); b.writeUInt32LE(t, 4); return b; };
  return Buffer.concat([h, ch(js.length, 0x4E4F534A), js, ch(bin.length, 0x004E4942), bin]);
}
// a page point inside the building: the middle of the photographed wing (its frame's wall, half the depth in)
const fS0 = (spec, m) => { const f = frameOf(m.ring, spec.frames[spec.south_wing.frame]); const w = f.W(spec.south_wing.length / 2, spec.south_wing.depth / 2, 0, 0); return [w[0], w[2]]; };
// WGS84 of a page point: Newton steps on the page's own polynomial (area.js meta.geo)
function lonlat(geo, x, z) {
  const f = (c, a, b) => c[0] + c[1] * a + c[2] * b + c[3] * a * b + c[4] * a * a + c[5] * b * b; let a = 0, b = 0;
  for (let k = 0; k < 20; k++) { const e = 1e-7, fx = f(geo.x, a, b) - x, fz = f(geo.z, a, b) - z, j11 = (f(geo.x, a + e, b) - f(geo.x, a, b)) / e, j12 = (f(geo.x, a, b + e) - f(geo.x, a, b)) / e, j21 = (f(geo.z, a + e, b) - f(geo.z, a, b)) / e, j22 = (f(geo.z, a, b + e) - f(geo.z, a, b)) / e, d = j11 * j22 - j12 * j21;
    a -= (fx * j22 - fz * j12) / d; b -= (fz * j11 - fx * j21) / d; }
  return [Math.round((geo.lon0 + a) * 1e7) / 1e7, Math.round((geo.lat0 + b) * 1e7) / 1e7];
}

// BM_DRY=1: write the outputs without a log entry (while a description is being edited)
const body = async () => {
  const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(AREA, 'utf8'), ctx); const A = ctx.DOCKLANDS_AREA;
  const model_fp = `${A.buildings.length}:${Array.from(A.buildings[0].p.slice(0, 6)).join('.')}:${Array.from(A.buildings.at(-1).p.slice(0, 6)).join('.')}`;
  const N = F.namedNode, V = VOCAB, S = 'https://schema.org/', q = [], lit = (x, dt) => F.literal(String(x), dt ? N('http://www.w3.org/2001/XMLSchema#' + dt) : undefined), add = (s, p, o) => q.push(F.quad(N(s), N(p), o, F.defaultGraph()));
  const out = { about: 'Detailed building models for the 3D page, made by tools/build-building-models.mjs from the hand-made descriptions in docklands/models/ (do not edit by hand). The page draws a model instead of the extruded outline of the model buildings in mi (valid while model_fp matches the page), else of the building that holds the point at (WGS84). Positions: millimetres relative to t, page frame (x = E - 537550, y = m OD, z = -(N - 180300)); each part has one colour, triangles wound with outward normals.', model: { fp: model_fp, sha256: sha(readFileSync(AREA)) }, models: {} };
  for (const f of specs) {
    const spec = JSON.parse(readFileSync(join(MD, f), 'utf8'));
    if (spec.model_fp !== model_fp) throw new Error(`${f}: written for area.js ${spec.model_fp}, this area.js is ${model_fp}: check the ring vertices and model_index (key-model-buildings.mjs) first`);
    const m = build(spec, A), pm = pageModel(spec, m), bin = glb(spec, m, pm.t), gf = f.replace('.spec.json', '.glb');
    writeFileSync(join(MD, gf), bin);
    const mi = [spec.model_index], at = lonlat(A.meta.geo, ...fS0(spec, m));
    out.models[spec.key] = { name: spec.name, osm: spec.osm, address: spec.address, mi, model_fp, at, made: spec.made, licence: spec.licence,
      source: { description: 'cwplans/docklands/models/' + f, photo: spec.photo, lidar_profile: spec.lidar_profile, glb: 'cwplans/docklands/models/' + gf, glb_sha256: sha(bin) }, ...pm };
    const s = kid('model', 'building', 'osm-' + spec.key.slice(4)), bi = kid('building', 'osm-' + spec.key.slice(4)), photo = kid('photo', sha(readFileSync(join(LONDAT_DIR, spec.photo))).slice(0, 16));
    add(s, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', N(V + 'BuildingModel')); add(s, S + 'name', lit(`3D model of ${spec.name}, ${spec.address}`)); add(s, V + 'modelOf', N(bi));
    add(s, V + 'basedOn', N(photo)); add(s, V + 'file', lit('cwplans/docklands/models/' + gf)); add(s, V + 'sha256', lit(sha(bin))); add(s, V + 'triangles', lit(pm.triangles, 'integer'));
    add(s, V + 'topMOD', lit(pm.top_m_od, 'decimal')); add(s, V + 'baseMOD', lit(pm.base_m_od, 'decimal')); add(s, S + 'license', lit(spec.licence)); add(s, S + 'dateCreated', lit(spec.made, 'date'));
    for (const p of pm.parts) add(s, V + 'part', lit(`${p.name} (${p.cls}): ${p.basis}`));
  }
  writeFileSync(OUT, JSON.stringify(out) + '\n');
  return { 'building-models': { quads: q, about: { title: 'Detailed building models of the 3D page (hand-made from contributed photos and the LiDAR), with their files and the basis of each part', licence: 'CC0 1.0 (model geometry also contains OpenStreetMap data, ODbL 1.0, and EA LiDAR heights, OGL v3.0)', osm: true } } };
};
if (process.env.BM_DRY) { const r = await body(); console.log(JSON.stringify({ dry: true, triples: r['building-models'].quads.length })); process.exit(0); }
const res = await flow.run(op, inputs, {}, body);
const v = res['building-models'], ehF = join(K, 'external-heads.json'), eh = JSON.parse(readFileSync(ehF, 'utf8'));
eh['building-models'] = v.iri; writeFileSync(ehF, JSON.stringify(eh, null, 1) + '\n');
console.log(JSON.stringify({ version: v.iri, triples: v.triples, models: specs.length, new: flow.ran.length }));
