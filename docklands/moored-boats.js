// Generic boats at known moorings (Three.js port; drawn by layers/river.js, part "Moorings and houseboats", on by default).
// Owner, 2026-10-11: "add generic barge outline shaped boats where we know residential moorings are positioned?"
// NOT real vessels. Two kinds of place, both from OpenStreetMap (ODbL, © OpenStreetMap contributors; files already in the
// data register, no new data file):
//   1. Houseboat outlines: each OSM building=houseboat way (../cwplans/feeds/river/osm-river.json, the centroid) is matched
//      to its footprint among the model's buildings (area.js; the nearest footprint centroid within 6 m, under 600 m2 and
//      10 m high). A generic model is fitted to the footprint's minimum-area rectangle (length, beam, heading); the type
//      follows the beam (8 m and more and short: floating home; 6.8 m: lighter; 4.6 m: Dutch barge; 2.8 m: widebeam;
//      less: narrowboat). The footprint's building box is hidden while the part is on (buildOpts.skip).
//   2. Pontoons and finger jetties of moorings (../cwplans/docklands/data/piers.json, tools/build-piers.mjs): a pier whose
//      OSM tags say mooring (not "no") or whose name says Moorings or Marina. Boats lie alongside each pontoon side, bow
//      either way, spaced by typical lengths, some berths empty, rafted two or three abreast at residential moorings. The
//      class of the mooring sets the mix of types: canal (water polygon under 30 m wide: narrowboats and widebeams),
//      tidal residential (Thames lighters, Dutch barges, a sailing barge), residential dock (Dutch barges, widebeams,
//      lighters, floating homes), marina (yachts, motor cruisers, some barges). A boat is kept only when nine points of its
//      outline lie on water and it overlaps no pontoon, fixed pier, berthed vessel or other boat.
// Each choice (type, length, beam, colour, berth empty, bow direction) is a seeded hash of the OSM id, the pontoon, the
// side and the slot: the same place always shows the same boats. Boats float at the water: docks at their polygon level,
// tidal water at WU.tideLevel (on the mud at low water: max(tide, ground + 0.3)); they bob a little with the wind. A boat
// that holds the camera (photo views stand on pontoons) is hidden. Tap: the card says "generic boat at a known mooring,
// not a real vessel" with the OSM source.
// Skill: docklands-3d-page, "Three.js port: boats and moored barges (2026-10-11)"; cwplans-river-and-water (moorings).
import { WU } from './water.js';
import { models, boatMaterial, boatMesh, paintOf, hash01, pick } from './boats-models.js';

const RANGE = {   // length range (m), beam range (m) or beam / length; typical sizes for the type
  narrowboat: [[15, 21], [2.05, 2.1]], widebeam: [[15, 20], [3, 4]], dutch: [[18, 30], [4, 5]], dutchmast: [[18, 30], [4, 5]], lighter: [[22, 30], [5.5, 7]],
  home: [[14, 22], [6, 8]], yacht: [[8, 13], [.31, .34]], cruiser: [[8, 14], [.32, .35]], sbarge: [[25, 29], [5.8, 6.4]],
};
const MIX = {
  canal: [['narrowboat', .62], ['widebeam', .33], ['dutch', .05]],
  resid: [['dutch', .3], ['dutchmast', .08], ['widebeam', .25], ['narrowboat', .1], ['lighter', .17], ['home', .1]],
  tidal: [['lighter', .34], ['dutch', .25], ['dutchmast', .1], ['sbarge', .08], ['widebeam', .13], ['home', .1]],
  marina: [['yacht', .45], ['cruiser', .25], ['dutch', .1], ['dutchmast', .06], ['widebeam', .14]],
};
const EMPTY = { canal: .15, resid: .12, tidal: .1, marina: .2 }, RAFT = { canal: .12, resid: .15, tidal: .4, marina: 0 };
const CLASS = { canal: 'canal moorings', resid: 'residential moorings in a dock', tidal: 'residential moorings on the tidal Thames', marina: 'marina' };
const FALLBACK = { canal: 'narrowboat', resid: 'narrowboat', tidal: 'widebeam', marina: 'yacht' };

export async function mooredBoats(ctx, { osm, piers }) {
  const { THREE, A, esc } = ctx, G = A.meta.geo, E = A.meta.extent;
  const geo = (lon, lat) => { const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; };
  const inBox = (x, z) => x >= E.x0 && x <= E.x1 && z >= E.z0 && z <= E.z1;
  // ---------- water polygons (as layers/ships.js), with a width estimate 2 x area / perimeter
  const WATER = A.water.map(w => { const f = ctx.dec(w.p), st = [0, ...(w.holes || []), f.length / 2]; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, ar = 0, per = 0;
    for (let i = 0; i < f.length; i += 2) { x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); z0 = Math.min(z0, f[i + 1]); z1 = Math.max(z1, f[i + 1]); }
    for (let r = 0; r < st.length - 1; r++) for (let i = st[r], j = st[r + 1] - 1; i < st[r + 1]; j = i++) { ar += f[2 * j] * f[2 * i + 1] - f[2 * i] * f[2 * j + 1]; per += Math.hypot(f[2 * i] - f[2 * j], f[2 * i + 1] - f[2 * j + 1]); }
    return { w, f, st, x0, x1, z0, z1, width: 2 * Math.abs(ar / 2) / Math.max(1, per) }; });
  const inPoly = (P, x, z) => { if (x < P.x0 || x > P.x1 || z < P.z0 || z > P.z1) return false; let c = false; const f = P.f;
    for (let r = 0; r < P.st.length - 1; r++) for (let i = P.st[r], j = P.st[r + 1] - 1; i < P.st[r + 1]; j = i++) { const ax = f[2 * i], az = f[2 * i + 1], bx = f[2 * j], bz = f[2 * j + 1]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; }
    return c; };
  const polyAt = (x, z) => { let hit = null; for (const P of WATER) if (inPoly(P, x, z)) hit = P; return hit; };
  const ptIn = (ring, x, z) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [ax, az] = ring[i], [bx, bz] = ring[j]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; } return c; };

  // ---------- oriented boxes: { x, z, h (bearing of the long axis), L, B }; corners and SAT overlap with a margin
  const corners = (o, m = 0) => { const ux = Math.sin(o.h), uz = -Math.cos(o.h), nx = Math.cos(o.h), nz = Math.sin(o.h), l = o.L / 2 + m, b = o.B / 2 + m;
    return [[o.x + ux * l + nx * b, o.z + uz * l + nz * b], [o.x + ux * l - nx * b, o.z + uz * l - nz * b], [o.x - ux * l - nx * b, o.z - uz * l - nz * b], [o.x - ux * l + nx * b, o.z - uz * l + nz * b]]; };
  const overlap = (a, b, m) => { const A4 = corners(a, m), B4 = corners(b, 0);
    for (const o of [a, b]) for (const [ax, az] of [[Math.sin(o.h), -Math.cos(o.h)], [Math.cos(o.h), Math.sin(o.h)]]) {
      let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const [x, z] of A4) { const p = x * ax + z * az; a0 = Math.min(a0, p); a1 = Math.max(a1, p); } for (const [x, z] of B4) { const p = x * ax + z * az; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
      if (a1 < b0 || b1 < a0) return false; }
    return true; };
  const CELL = 60, grid = new Map(), cellKey = (i, j) => i * 100000 + j;
  const addObs = o => { const r = Math.hypot(o.L, o.B) / 2; for (let i = Math.floor((o.x - r) / CELL); i <= Math.floor((o.x + r) / CELL); i++) for (let j = Math.floor((o.z - r) / CELL); j <= Math.floor((o.z + r) / CELL); j++) { const k = cellKey(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o); } };
  const near = o => { const r = Math.hypot(o.L, o.B) / 2, out = new Set(); for (let i = Math.floor((o.x - r) / CELL); i <= Math.floor((o.x + r) / CELL); i++) for (let j = Math.floor((o.z - r) / CELL); j <= Math.floor((o.z + r) / CELL); j++) for (const q of grid.get(cellKey(i, j)) || []) out.add(q); return out; };
  // obstacles: every pontoon and deck of piers.json, walks as thin boxes, the outlines of fixed piers, berthed vessels
  const rings = [];
  for (const P of piers.piers) {
    for (const pt of [...P.pontoons, ...P.decks]) addObs({ x: pt[0], z: pt[1], h: pt[4], L: pt[2], B: pt[3], kind: 'pontoon' });
    for (const w of P.walks) { const L = Math.hypot(w[2] - w[0], w[3] - w[1]); if (L > .5) addObs({ x: (w[0] + w[2]) / 2, z: (w[1] + w[3]) / 2, h: Math.atan2(w[2] - w[0], -(w[3] - w[1])), L, B: w[4], kind: 'walk' }); }
    for (const g of P.gangways) { const L = Math.hypot(g[2] - g[0], g[3] - g[1]); if (L > .5) addObs({ x: (g[0] + g[2]) / 2, z: (g[1] + g[3]) / 2, h: Math.atan2(g[2] - g[0], -(g[3] - g[1])), L, B: g[4], kind: 'gangway' }); }
    // a fixed pier's outline is an obstacle, except an area named for the moorings themselves (Garden Barge Square, OSM way 824820103, at Downings Roads)
    if (P.rings && !/barge|moorings?\b/i.test(P.name || '')) { const R = P.rings[0]; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of R) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } rings.push({ R, x0, x1, z0, z1 }); }
  }
  for (const v of piers.vessels || []) addObs({ x: v.x, z: v.z, h: v.heading, L: v.L, B: v.B, kind: 'vessel' });
  const ringHit = o => { const C4 = corners(o, .3), pts = [...C4, [o.x, o.z]];
    for (const r of rings) { if (Math.max(...C4.map(c => c[0])) < r.x0 || Math.min(...C4.map(c => c[0])) > r.x1 || Math.max(...C4.map(c => c[1])) < r.z0 || Math.min(...C4.map(c => c[1])) > r.z1) continue;
      if (pts.some(([x, z]) => ptIn(r.R, x, z)) || r.R.some(([x, z]) => ptIn(C4, x, z))) return true; }
    return false; };
  const onWater = o => { const C4 = corners(o, 0), pts = [...C4, [o.x, o.z]]; for (let k = 0; k < 4; k++) { const a = C4[k], b = C4[(k + 1) % 4]; pts.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); }
    return pts.every(([x, z]) => !!polyAt(x, z)); };
  const free = (o, skip) => onWater(o) && !ringHit(o) && ![...near(o)].some(q => q !== skip && overlap(o, q, .25));

  const M = models(), boats = [], places = [], hide = new Set();
  const typeFor = (mix, u) => { let s = 0; for (const [k, p] of mix) { s += p; if (u < s) return k; } return mix[mix.length - 1][0]; };
  const sizeOf = (key, seed) => { const [lr, br] = RANGE[key], L = lr[0] + (lr[1] - lr[0]) * hash01(seed + 'L'), b = br[0] + (br[1] - br[0]) * hash01(seed + 'B'); return [L, b < 1 ? L * b : b]; };

  // ---------- 1. houseboat outlines
  const ext = osm && osm.meta ? String(osm.meta.osm_data_as_of || '').slice(0, 10) : '';
  const fp = A.buildings.map((b, i) => ({ i, b }));
  const cen = new Map(); const centroid = i => { if (cen.has(i)) return cen.get(i); const f = ctx.dec(A.buildings[i].p); let x = 0, z = 0; for (let k = 0; k < f.length; k += 2) { x += f[k]; z += f[k + 1]; } const r = { f, x: x / (f.length / 2), z: z / (f.length / 2) }; cen.set(i, r); return r; };
  const hbs = (osm ? osm.items : []).filter(it => it.kind === 'houseboat').map(it => ({ it, xz: geo(it.position.lon, it.position.lat) })).filter(h => inBox(h.xz[0], h.xz[1]));
  if (hbs.length) {
    // candidate footprints: low and small buildings within 40 m of any houseboat point
    const cand = [];
    for (const { i, b } of fp) { if (!(b.h <= 10)) continue; const p = b.p; let x = 0, z = 0, ax = 0, az = 0, n = 0; for (let k = 0; k < p.length; k += 2) { ax += p[k]; az += p[k + 1]; x += ax; z += az; n++; } x /= n * 10; z /= n * 10;
      if (hbs.some(h => Math.abs(h.xz[0] - x) < 40 && Math.abs(h.xz[1] - z) < 40)) cand.push(i); }
    for (const h of hbs) {
      let best = null, bd = 6;
      for (const i of cand) { if (hide.has(i)) continue; const c = centroid(i), d = Math.hypot(c.x - h.xz[0], c.z - h.xz[1]); if (d < bd) { bd = d; best = i; } }
      let o = null;
      if (best != null) { const f = centroid(best).f, pts = []; for (let k = 0; k < f.length; k += 2) pts.push([f[k], f[k + 1]]);
        let area = 0; for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) area += pts[j][0] * pts[k][1] - pts[k][0] * pts[j][1]; area = Math.abs(area / 2);
        if (area < 600) { let br = null;   // the minimum-area rectangle over the edge directions
          for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length], e = Math.atan2(b[0] - a[0], -(b[1] - a[1])), ux = Math.sin(e), uz = -Math.cos(e);
            let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const [x, z] of pts) { const u = x * ux + z * uz, v = x * Math.cos(e) + z * Math.sin(e); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
            const ar = (u1 - u0) * (v1 - v0); if (!br || ar < br.ar) br = { ar, e, u: (u0 + u1) / 2, v: (v0 + v1) / 2, lu: u1 - u0, lv: v1 - v0 }; }
          const long = br.lu >= br.lv, hh = long ? br.e : br.e + Math.PI / 2, L = Math.max(br.lu, br.lv), B = Math.min(br.lu, br.lv);
          const x = br.u * Math.sin(br.e) + br.v * Math.cos(br.e), z = -br.u * Math.cos(br.e) + br.v * Math.sin(br.e);
          o = { x, z, h: hh + (hash01(h.it.id + 'bow') < .5 ? Math.PI : 0), L, B }; hide.add(best); }
      }
      if (!o) o = { x: h.xz[0], z: h.xz[1], h: 0, L: 18, B: 4.4 };   // no footprint found: a typical Dutch barge at the point
      const P = polyAt(o.x, o.z), tidal = !P || !!P.w.tidal, u = hash01(h.it.id);
      const key = o.B >= 6.8 ? (o.L / o.B < 3 ? 'home' : 'lighter') : o.B >= 4.6 ? (tidal && u < .5 ? 'lighter' : u < .2 ? 'dutchmast' : 'dutch') : o.B >= 2.8 ? 'widebeam' : 'narrowboat';
      const b = { ...o, key, src: 'outline', it: h.it, building: best, tidal, level: P && !P.w.tidal ? P.w.level : null, seed: h.it.id, sy: 1 };
      boats.push(b); addObs(b);
    }
    places.push({ name: 'Houseboat outlines', cls: 'outline', n: boats.length });
  }

  // ---------- 2. pontoons and finger jetties of moorings
  const ppier = (piers.meta && piers.meta.osm_data_as_of) ? String(piers.meta.osm_data_as_of).slice(0, 10) : '';
  for (const P of piers.piers) {
    const o = P.osm || {}, nm = P.name || '', m = o.mooring;
    if (m === 'no' || P.water === 'land' || !((m && m !== 'no') || /moorings?\b|marina/i.test(nm))) continue;
    if (!inBox(P.at[0], P.at[1])) continue;
    const parts = [...P.pontoons.map(p => ({ p, float: true })), ...P.decks.map(p => ({ p, float: false })),
      ...P.walks.map(w => ({ p: [(w[0] + w[2]) / 2, (w[1] + w[3]) / 2, Math.hypot(w[2] - w[0], w[3] - w[1]), w[4], Math.atan2(w[2] - w[0], -(w[3] - w[1]))], float: false }))];
    if (!parts.length && P.rings) { const R = P.rings[0]; let br = null;   // a fixed jetty: its minimum-area rectangle
      for (let k = 0; k < R.length; k++) { const a = R[k], b = R[(k + 1) % R.length], e = Math.atan2(b[0] - a[0], -(b[1] - a[1])); let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
        for (const [x, z] of R) { const u = x * Math.sin(e) - z * Math.cos(e), v = x * Math.cos(e) + z * Math.sin(e); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
        const ar = (u1 - u0) * (v1 - v0); if (!br || ar < br.ar) br = { ar, e, u: (u0 + u1) / 2, v: (v0 + v1) / 2, lu: u1 - u0, lv: v1 - v0 }; }
      if (br) { const long = br.lu >= br.lv; parts.push({ p: [br.u * Math.sin(br.e) + br.v * Math.cos(br.e), -br.u * Math.cos(br.e) + br.v * Math.sin(br.e), Math.max(br.lu, br.lv), Math.min(br.lu, br.lv), long ? br.e : br.e + Math.PI / 2], float: false }); } }
    const Pw = polyAt(P.at[0], P.at[1]) || (parts[0] && polyAt(parts[0].p[0], parts[0].p[1]));
    const cls = Pw && !Pw.w.tidal && Pw.width < 30 ? 'canal' : P.water === 'tidal' ? 'tidal' : (/residential|private/i.test((m || '') + ' ' + nm) || /moorings/i.test(nm) || (o.access === 'no' && /marina/i.test(nm))) ? 'resid' : 'marina';
    const mix = MIX[cls], n0 = boats.length;
    parts.forEach(({ p }, pi) => {
      const [cx, cz, len, wid, a] = p; if (len < 3) return;
      const ux = Math.sin(a), uz = -Math.cos(a), nx = Math.cos(a), nz = Math.sin(a);
      for (const s of [-1, 1]) {
        let t = -len / 2 + hash01(`${P.id}:${pi}:${s}:g`) * 2, k = 0;
        while (t < len / 2 - 2 && k < 40) {
          const seed = `${P.id}:${pi}:${s}:${k++}`;
          let key = typeFor(mix, hash01(seed + 'type')), [L, B] = sizeOf(key, seed);
          if (len < 14 && L > len + 8) { key = cls === 'marina' ? (hash01(seed + 'f') < .6 ? 'yacht' : 'cruiser') : FALLBACK[cls]; [L, B] = sizeOf(key, seed); }
          if (t + L / 2 > len / 2 + 1) { if (t > -len / 2 + 1) break; key = FALLBACK[cls]; [L, B] = sizeOf(key, seed + 's'); }   // the centre stays on the pontoon (a boat may overhang its end); a short pontoon: one smaller boat
          if (hash01(seed + 'empty') < EMPTY[cls]) { t += L + 1.5; continue; }
          const try1 = (key, L, B, off, along) => { const c = t + along, b = { x: cx + ux * c + nx * s * off, z: cz + uz * c + nz * s * off, h: a + (hash01(seed + key + 'bow') < .5 ? Math.PI : 0), L, B, key }; return free(b) ? b : null; };
          let b = try1(key, L, B, wid / 2 + .35 + B / 2, L / 2);
          if (!b) { key = FALLBACK[cls]; [L, B] = sizeOf(key, seed + 'x'); b = try1(key, L, B, wid / 2 + .35 + B / 2, L / 2); }
          if (!b) { t += 3; continue; }
          Object.assign(b, { src: 'pontoon', P, cls, seed, tidal: P.water === 'tidal', level: P.water === 'dock' ? P.level : null, sy: 1 }); boats.push(b); addObs(b);
          // rafted alongside: a second (and third) boat outside the first
          let off = wid / 2 + .35 + B, raft = 0;
          while (raft < 2 && hash01(seed + 'raft' + raft) < RAFT[cls] * (raft ? .5 : 1)) {
            const k2 = typeFor(mix, hash01(seed + 'rtype' + raft)), [L2, B2] = sizeOf(k2, seed + 'r' + raft);
            const b2 = try1(k2, L2, B2, off + .3 + B2 / 2, L / 2 + (hash01(seed + 'rs' + raft) - .5) * 3); if (!b2) break;
            Object.assign(b2, { src: 'pontoon', P, cls, seed: seed + 'r' + raft, tidal: P.water === 'tidal', level: P.water === 'dock' ? P.level : null, sy: 1, rafted: raft + 1 }); boats.push(b2); addObs(b2);
            off += .3 + B2; raft++;
          }
          t += L + .6 + hash01(seed + 'gap') * 2;
        }
      }
    });
    if (boats.length > n0) places.push({ id: P.id, name: P.name || null, cls, n: boats.length - n0, x: P.at[0], z: P.at[1], osm: o });
  }

  // ---------- drawing: one InstancedMesh per model type
  const group = new THREE.Group(); group.name = 'moored boats';
  const mat = boatMaterial(ctx.U), byKey = {};
  for (const b of boats) (byKey[b.key] ||= []).push(b);
  const meshes = {};
  for (const [key, list] of Object.entries(byKey)) {
    const mesh = boatMesh(M[key], mat, list.length); meshes[key] = mesh; group.add(mesh);
    const t1 = mesh.geometry.getAttribute('tint'), t2 = mesh.geometry.getAttribute('tint2');
    list.forEach((b, i) => { b.mesh = mesh; b.idx = i; b.ph = hash01(b.seed + 'ph') * 6.28; const [c1, c2] = paintOf(key, b.seed); t1.setXYZ(i, ...c1); t2.setXYZ(i, ...c2);
      b.sx = b.B / M[key].B0; b.sz = b.L / M[key].L0; b.sy = Math.max(.85, Math.min(1.2, Math.sqrt(b.L / M[key].L0))); b.H = M[key].deck * b.sy; });
    t1.needsUpdate = t2.needsUpdate = true; mesh.count = list.length; mesh.visible = true;
  }
  const dummy = new THREE.Object3D(); dummy.rotation.order = 'YXZ';
  const levelOf = b => b.level != null ? b.level : Math.max(WU.tideLevel.value, ctx.groundAt(b.x, b.z) + .3);
  let visible = true, aisAt = 0, aisHidden = 0;
  // a generic boat under a live AIS vessel (a real boat at that berth, e.g. a sailing barge at Hermitage) is hidden; checked each second
  function aisCheck() {
    const L = globalThis.__docklands3 && globalThis.__docklands3.layers && globalThis.__docklands3.layers.ships, V = L && L.on && L.api && L.api.vessels || [];
    aisHidden = 0; for (const b of boats) b.ais = false; if (!V.length) return;
    for (const v of V) { if (!(v.L > 0)) continue; const o = { x: v.x, z: v.z, h: v.h, L: v.L, B: Math.max(2, v.L * .22) };
      for (const b of near(o)) if (b.key && !b.ais && overlap(o, b, 0)) { b.ais = true; aisHidden++; } }
  }
  function frame() {
    if (!visible || !group.visible || (group.parent && !group.parent.visible)) return;
    if (performance.now() - aisAt > 1000) { aisAt = performance.now(); aisCheck(); stats.ais_hidden = aisHidden; }
    const t = performance.now() / 1000, wind = Math.min(14, WU.windSpeed ? WU.windSpeed.value : 3), cp = ctx.camera.position;
    for (const b of boats) {
      const y0 = levelOf(b), amp = (b.tidal ? .05 : .025) + wind * (b.tidal ? .008 : .004);
      const ch = Math.cos(b.h), sh = Math.sin(b.h), dx = cp.x - b.x, dz = cp.z - b.z, lx = dx * ch + dz * sh, lz = -dx * sh + dz * ch;   // camera in the boat's frame (x across, z along)
      const holds = Math.abs(lx) < b.B / 2 + 2 && Math.abs(lz) < b.L / 2 + 2 && cp.y < y0 + b.H + 3;
      const k = holds || b.ais ? 0 : 1;
      dummy.position.set(b.x, y0 + Math.sin(t * 1.1 + b.ph) * amp, b.z); dummy.rotation.set(Math.sin(t * .7 + b.ph) * amp * .02, -b.h, Math.sin(t * .9 + b.ph) * amp * .06);
      dummy.scale.set(b.sx * k, b.sy * k, b.sz * k); dummy.updateMatrix(); b.mesh.setMatrixAt(b.idx, dummy.matrix); b.y = y0;
    }
    for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true;
  }
  const stats = {};
  ctx.onFrame(frame); frame();

  // ---------- tap: the boat under the ray (its box from the keel to the cabin roof)
  function card(b) {
    const m = M[b.key], dims = `${b.L.toFixed(0)} m x ${b.B.toFixed(1)} m`;
    let where, src;
    if (b.src === 'outline') { const v = b.it.values || {};
      where = `Houseboat outline mapped in OpenStreetMap${v.name ? ` (named "${esc(v.name)}" there)` : ''}: <a href="${esc(b.it.url)}" target="_blank" rel="noopener">${esc(b.it.id.replace(/^osm:/, ''))}</a>. The model is fitted to the outline (${dims}, heading from the outline); its type follows the beam.`;
      src = `© OpenStreetMap contributors (ODbL 1.0); extract of ${esc(ext)}. A houseboat is a home: no occupant data is held.`; }
    else { const o = b.P.osm || {}, tags = ['mooring', 'operator', 'access'].filter(k => o[k]).map(k => `${k}=${esc(o[k])}`).join(', ');
      where = `Mooring: ${esc(b.P.name || 'unnamed pontoon')} (${esc(CLASS[b.cls])}), <a href="https://www.openstreetmap.org/${esc(b.P.id.replace(/^osm:/, ''))}" target="_blank" rel="noopener">OSM ${esc(b.P.id.replace(/^osm:/, ''))}</a>${tags ? ` (${tags})` : ''}. Type, size (${dims}), colour and berth are typical values for this class of mooring, chosen by a seeded hash${b.rafted ? '; rafted alongside another boat' : ''}.`;
      src = `Pontoon shape: © OpenStreetMap contributors (ODbL 1.0), tools/build-piers.mjs, extract of ${esc(ppier)}.`; }
    ctx.showCard(`<h2>Generic ${esc(m.name)}</h2><p class="small">Generic boat at a known mooring, not a real vessel</p><p>${where}</p><p class="small">${src} Boats at moorings change; this shows what such a mooring typically holds, not who or what is there. Live vessels with AIS are in Ships (AIS).</p>`);
  }
  ctx.addPick(rc => {
    if (!visible || !group.visible || !group.parent || !group.parent.visible) return null;
    const o = rc.ray.origin, d = rc.ray.direction; let best = null;
    for (const b of boats) {
      const ch = Math.cos(b.h), sh = Math.sin(b.h), ox = o.x - b.x, oz = o.z - b.z, y0 = b.y ?? levelOf(b);
      const lo = [ox * ch + oz * sh, o.y - y0, -ox * sh + oz * ch], ld = [d.x * ch + d.z * sh, d.y, -d.x * sh + d.z * ch];
      const mn = [-b.B / 2, -1, -b.L / 2], mx = [b.B / 2, b.H, b.L / 2]; let t0 = 0, t1 = 1e9;
      for (let k = 0; k < 3; k++) { if (Math.abs(ld[k]) < 1e-9) { if (lo[k] < mn[k] || lo[k] > mx[k]) { t0 = 2e9; break; } continue; } let a = (mn[k] - lo[k]) / ld[k], c = (mx[k] - lo[k]) / ld[k]; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); }
      if (t0 <= t1 && t0 < 1e9 && (!best || t0 < best.distance)) best = { distance: t0, open: () => card(b) };
    }
    return best;
  });

  const tris = boats.reduce((s, b) => s + M[b.key].tris, 0);
  Object.assign(stats, { boats: boats.length, outlines: boats.filter(b => b.src === 'outline').length, pontoon: boats.filter(b => b.src === 'pontoon').length, places: places.length,
    byType: Object.fromEntries(Object.entries(byKey).map(([k, l]) => [k, l.length])), byClass: boats.reduce((o, b) => (o[b.cls || 'outline'] = (o[b.cls || 'outline'] || 0) + 1, o), {}), tris, drawCalls: Object.keys(meshes).length, hidden_buildings: hide.size, ais_hidden: aisHidden });
  return { group, boats, places, hide, stats, frame, setVisible(v) { visible = v; group.visible = v; if (v) frame(); } };
}
