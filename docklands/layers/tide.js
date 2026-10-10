// Layer "tide" of the Three.js port (docklands/): the Thames at the tide level of the page clock, and the foreshore that
// the falling tide uncovers. The level is our own harmonic prediction (docklands/tide.js; constituents fitted to the
// Environment Agency gauges Tower Pier, Charlton and Silvertown by cwplans/tools/fit-tide-harmonics.mjs, OGL v3.0), or the
// EA readings themselves where the data hold one for that time (the last 7 days of the fit file; 3 and 4 October 2026 in
// data/sky/tide-2026-10-03.json; the EA API for the last 4 weeks; the EA daily archive for the year before, in
// data/sky/tide-history.json); linear in chainage along the Thames centreline (data/river.json) between the gauges.
// The tidal water polygons (build.js waterGeometry 'tidal') move on the GPU through tide.js tideOffset; WU.tideLevel and
// WU.tideRate (water.js shared contract) get the level at the model centre and its rate (m an hour, + rising).
// The foreshore: each edge of the tidal water (10 m pieces) is "wall" (an EA flood defence of type Wall, Flood Gate or
// Bridge Abutment within 15 m; also the rings of holes: bridge piers), "revetment" (Embankment, Engineered High Ground),
// "natural" (no defence), or "water" (it borders a dock or other water). A 5 m lattice replaces the 20 m terrain squares
// that touch the tidal water: land points keep the terrain's height; points in the water get the profile of their
// nearest edge (natural: shingle 1:7 from the bank, clamped 2.5 to 4.6 m OD, to +0.5 m OD, then mud 1:15; revetment:
// rock 1:2.5 to 0 m OD, then mud; wall: a foot at +0.5 m OD, then mud 1:8), turning into the UKHO bed where a sounding
// is within 15 to 35 m (inside the survey the bed, beyond its edge, the drying line, the profile). Points within 7.1 m of
// an edge move onto it (0.05 m to their own side); a wall is a vertical face from the foot to the bank. Its TSL material:
// mud brown, dark and glossy while wet; shingle grey; rock blocks; walls brick and concrete with a tide mark and weed
// below mean high water neaps; wetness from the hours since the water last stood at each height (the predicted curve at
// the model centre). Profiles and slopes are stated defaults, not surveyed. Skill: docklands-sky, "Tide prediction".
import * as THREE from 'three/webgpu';
import { Fn, attribute, positionLocal, positionWorld, vec2, vec3, vec4, float, mix, clamp, smoothstep, step, exp, floor, fract, sin, dot, texture, uniform, sRGBTransferEOTF, abs } from 'three/tsl';
import { A, dec } from '../build.js';
import { WU } from '../water.js';
import { TideModel, predict, extremes, extremesNear, nowcast, mergeReadings, historyReadings, historyCovers, tideU, tideOffset } from '../tide.js';

const CELL = 5, MATCH = 15, SNAP = 7.1;
const local = /^(127\.|localhost$|\[::1\]$)/.test(location.hostname);
const CACHE = local ? ['../cwplans/cache/latest.json'] : ['https://raw.githubusercontent.com/danbri/londat/main/cwplans/cache/latest.json', '../cwplans/cache/latest.json'];
const KIND = { Wall: 'wall', 'Flood Gate': 'wall', 'Bridge Abutment': 'wall', Embankment: 'revetment', 'Engineered High Ground': 'revetment' };
const lin = c => sRGBTransferEOTF(c);
const hh = Fn(([q]) => fract(sin(dot(q, vec2(12.9898, 78.233))).mul(43758.5453)));
const vn = Fn(([q]) => { const i = floor(q), f0 = fract(q), f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return mix(mix(hh(i), hh(i.add(vec2(1, 0))), f.x), mix(hh(i.add(vec2(0, 1))), hh(i.add(vec2(1, 1))), f.x), f.y); });

// bilinear LiDAR ground (area.js terrain, the unsunk values)
function ground(x, z) { const T = A.terrain, fx = Math.max(0, Math.min(T.nx - 1.001, (x - T.x0) / T.cell)), fz = Math.max(0, Math.min(T.nz - 1.001, (z - T.z0) / T.cell)), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, d = T.dm, n = T.nx;
  return ((d[j * n + i] * (1 - u) + d[j * n + i + 1] * u) * (1 - v) + (d[(j + 1) * n + i] * (1 - u) + d[(j + 1) * n + i + 1] * u) * v) / 10; }
const segD2 = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0, qx = ax + t * dx - px, qz = az + t * dz - pz; return qx * qx + qz * qz; };
// a spatial hash of segments: items [ax, az, bx, bz, payload]
function segHash(B) { const m = new Map(), key = (a, b) => a * 100003 + b; return {
  add(s) { const x0 = Math.floor(Math.min(s[0], s[2]) / B), x1 = Math.floor(Math.max(s[0], s[2]) / B), z0 = Math.floor(Math.min(s[1], s[3]) / B), z1 = Math.floor(Math.max(s[1], s[3]) / B);
    for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) { const k = key(a, b); if (!m.has(k)) m.set(k, []); m.get(k).push(s); } },
  near(x, z, r) { let best = null, bd = r * r; const R = Math.ceil(r / B), bx = Math.floor(x / B), bz = Math.floor(z / B);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { const L = m.get(key(bx + a, bz + b)); if (!L) continue; for (const s of L) { const d = segD2(x, z, s[0], s[1], s[2], s[3]); if (d < bd) { bd = d; best = s; } } }
    return best ? { s: best, d: Math.sqrt(bd) } : null; } }; }
// soundings: the bed (m OD) at (x, z), inverse-distance mean within 40 m, or NaN; bedField.near: the distance to the nearest sounding
function bedField() { const B = 40, bk = new Map(), key = (a, b) => a * 100003 + b;
  for (const r of A.riverbed || []) { const q = dec(r.q, 3); for (let i = 0; i < q.length; i += 3) { const k = key(Math.floor(q[i] / B), Math.floor(q[i + 1] / B)); if (!bk.has(k)) bk.set(k, []); bk.get(k).push(q[i], q[i + 1], q[i + 2]); } }
  return (x, z) => { const bx = Math.floor(x / B), bz = Math.floor(z / B); let sw = 0, sb = 0;
    let dn = 1e18; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const L = bk.get(key(bx + a, bz + b)); if (!L) continue; for (let s = 0; s < L.length; s += 3) { const d2 = (L[s] - x) ** 2 + (L[s + 1] - z) ** 2; if (d2 > B * B) continue; const w = 1 / (d2 + 25); sw += w; sb += w * L[s + 2]; dn = Math.min(dn, d2); } }
    bedField.near = Math.sqrt(dn); return sw ? sb / sw : NaN; }; }
// rasterise rings (even-odd) at the lattice points (x0 + i CELL, z0 + j CELL) into mask with value v
function raster(mask, G, f, st, v) { const rows = new Map();
  for (let r = 0; r < st.length - 1; r++) for (let i = st[r]; i < st[r + 1]; i++) { const j = i + 1 < st[r + 1] ? i + 1 : st[r], x0 = f[2 * i], z0 = f[2 * i + 1], x1 = f[2 * j], z1 = f[2 * j + 1];
    const ja = Math.max(0, Math.ceil((Math.min(z0, z1) - G.z0) / CELL)), jb = Math.min(G.nz - 1, Math.floor((Math.max(z0, z1) - G.z0) / CELL));
    for (let jj = ja; jj <= jb; jj++) { const zc = G.z0 + jj * CELL; if ((z0 > zc) === (z1 > zc)) continue; if (!rows.has(jj)) rows.set(jj, []); rows.get(jj).push(x0 + (zc - z0) / (z1 - z0) * (x1 - x0)); } }
  for (const [jj, xs] of rows) { xs.sort((a, b) => a - b); for (let q = 0; q + 1 < xs.length; q += 2) for (let ii = Math.max(0, Math.ceil((xs[q] - G.x0) / CELL)); ii <= Math.min(G.nx - 1, Math.floor((xs[q + 1] - G.x0) / CELL)); ii++) mask[jj * G.nx + ii] = v; } }

// ---------- the foreshore geometry: a 5 m lattice that replaces the 20 m terrain squares touching the tidal water
// (build.js terrainGeometry; G.userData.tidal marks their grid points). Land points keep the terrain's height; points in
// the tidal water get the foreshore profile of their nearest edge, or the bed; points within 7.1 m of an edge move onto
// it, so a wall is a vertical face and a beach meets the bank. Returns the geometry (group 0: land, terrain material;
// group 1: foreshore material), the terrain index without those squares, and counts.
function buildForeshore(model, terrain) {
  const t0 = performance.now(), E = A.meta.extent, T = A.terrain, bed = bedField(), TP = terrain.attributes.position.array, TT = terrain.userData.tidal;
  const tidal = A.water.filter(w => w.tidal), R20 = T.cell / CELL;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; const rings = tidal.map(w => { const f = dec(w.p); for (let i = 0; i < f.length; i += 2) { x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); z0 = Math.min(z0, f[i + 1]); z1 = Math.max(z1, f[i + 1]); } return { w, f, st: [0, ...(w.holes || []), f.length / 2] }; });
  // the lattice: aligned with the terrain grid, covering the tidal water and one terrain cell around it
  const I0 = Math.max(0, Math.floor((x0 - T.x0) / T.cell) - 1), I1 = Math.min(T.nx - 1, Math.ceil((x1 - T.x0) / T.cell) + 1), J0 = Math.max(0, Math.floor((z0 - T.z0) / T.cell) - 1), J1 = Math.min(T.nz - 1, Math.ceil((z1 - T.z0) / T.cell) + 1);
  const G = { x0: T.x0 + I0 * T.cell, z0: T.z0 + J0 * T.cell, nx: (I1 - I0) * R20 + 1, nz: (J1 - J0) * R20 + 1 }, N = G.nx * G.nz;
  const inT = new Uint8Array(N), inW = new Uint8Array(N);
  for (const w of A.water) if (!w.tidal) { const f = dec(w.p); raster(inW, G, f, [0, ...(w.holes || []), f.length / 2], 1); }
  for (const r of rings) raster(inT, G, r.f, r.st, 1);
  const cellOf = (x, z) => { const i = Math.round((x - G.x0) / CELL), j = Math.round((z - G.z0) / CELL); return i < 0 || j < 0 || i >= G.nx || j >= G.nz ? -1 : j * G.nx + i; };
  // the terrain squares that go: any corner in the tidal water; and the terrain index without them
  // (a corner in the tidal water, or any lattice point in it: an edge that cuts a corner off the square)
  const sq5 = new Uint8Array((T.nx - 1) * (T.nz - 1));
  for (let k = 0; k < N; k++) if (inT[k]) { const gi = k % G.nx, gj = Math.floor(k / G.nx), i = I0 + Math.floor(gi / R20), j = J0 + Math.floor(gj / R20);
    for (const [a, b] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) { if (a && gi % R20) continue; if (b && gj % R20) continue; const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < T.nx - 1 && jj < T.nz - 1) sq5[jj * (T.nx - 1) + ii] = 1; } }
  const sq = (i, j) => sq5[j * (T.nx - 1) + i] || TT[j * T.nx + i] || TT[j * T.nx + i + 1] || TT[(j + 1) * T.nx + i] || TT[(j + 1) * T.nx + i + 1];
  const tidx = []; for (let j = 0; j < T.nz - 1; j++) for (let i = 0; i < T.nx - 1; i++) { if (sq(i, j)) continue; const a = j * T.nx + i; tidx.push(a, a + T.nx, a + 1, a + 1, a + T.nx, a + T.nx + 1); }
  // the terrain's height at (x, z): bilinear over the final heights, but the LiDAR (unsunk) at tidal grid points
  const th = (i, j) => { const k = j * T.nx + i; return TT[k] ? T.dm[k] / 10 : TP[3 * k + 1]; };
  const land = (x, z) => { const fx = (x - T.x0) / T.cell, fz = (z - T.z0) / T.cell, i = Math.min(T.nx - 2, Math.max(0, Math.floor(fx))), j = Math.min(T.nz - 2, Math.max(0, Math.floor(fz))), u = fx - i, v = fz - j;
    return (th(i, j) * (1 - u) + th(i + 1, j) * u) * (1 - v) + (th(i, j + 1) * (1 - u) + th(i + 1, j + 1) * u) * v; };
  // defences, hashed
  const DH = segHash(40);
  for (const d of A.defences || []) { const q = dec(d.q, 3), k = KIND[d.t]; if (!k) continue; for (let i = 3; i < q.length; i += 3) DH.add([q[i - 3], q[i - 2], q[i], q[i + 1], { k, c: d.c, t: d.t }]); }
  // the edges of the tidal water, classified (pieces of at most 10 m, so a defence can cover part of a long edge); the rings
  // of holes (bridge piers, islands) count as walls
  const EH = segHash(50), len = { wall: 0, pier: 0, revetment: 0, natural: 0, water: 0, cut: 0 }, byType = {}, edges = [];
  const onBox = (x, z) => Math.abs(x - E.x0) < 1.5 || Math.abs(x - E.x1) < 1.5 || Math.abs(z - E.z0) < 1.5 || Math.abs(z - E.z1) < 1.5;
  for (const r of rings) for (let ri = 0; ri < r.st.length - 1; ri++) for (let i = r.st[ri]; i < r.st[ri + 1]; i++) {
    const j = i + 1 < r.st[ri + 1] ? i + 1 : r.st[ri], ax = r.f[2 * i], az = r.f[2 * i + 1], bx = r.f[2 * j], bz = r.f[2 * j + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
    const n = Math.max(1, Math.ceil(L / 10));
    for (let k = 0; k < n; k++) {
      const px = ax + (bx - ax) * k / n, pz = az + (bz - az) * k / n, qx = ax + (bx - ax) * (k + 1) / n, qz = az + (bz - az) * (k + 1) / n, l = L / n, mx = (px + qx) / 2, mz = (pz + qz) / 2;
      let nx = -(qz - pz) / l, nz = (qx - px) / l;
      const a = cellOf(mx + nx * 4, mz + nz * 4), b = cellOf(mx - nx * 4, mz - nz * 4); if (a >= 0 && inT[a] && !(b >= 0 && inT[b])) { nx = -nx; nz = -nz; }   // outward: towards the land
      const so = cellOf(mx + nx * 4, mz + nz * 4);
      let kind;
      if (onBox(px, pz) && onBox(qx, qz)) kind = 'cut';
      else if (so >= 0 && (inW[so] || inT[so])) kind = 'water';
      else if (ri > 0) kind = 'pier';
      else { const h = DH.near(mx, mz, MATCH); kind = h ? h.s[4].k : 'natural'; if (h) byType[h.s[4].t] = (byType[h.s[4].t] || 0) + l; }
      len[kind] += l;
      if (kind === 'cut') continue;
      const top = kind === 'water' ? 0 : Math.max(kind === 'natural' ? 2.5 : 3.5, Math.min(kind === 'natural' ? 4.6 : 7, ground(mx + nx * 6, mz + nz * 6)));
      const e = [px, pz, qx, qz, { kind: kind === 'pier' ? 'wall' : kind, top, ox: nx, oz: nz }]; edges.push(e); EH.add(e);
    }
  }
  // profile: height at distance d (m) from an edge of this kind
  const prof = (k, top, d) => {
    if (k === 'wall') return 0.5 - d / 8;
    if (k === 'revetment') { const d1 = top / 0.4; return d < d1 ? top - d * 0.4 : -(d - d1) / 15; }
    if (k === 'water') return -6;
    const d1 = Math.max(0, (top - 0.5) * 7); return d < d1 ? top - d / 7 : 0.5 - (d - d1) / 15;
  };
  const HMIN = Math.max(-5.5, Math.min(...model.st.map(s => s.H.z0 - Object.values(s.H.h).reduce((a, v) => a + v[0], 0)))) - 0.3;
  const CODE = { wall: 3, revetment: 2, natural: 1, water: 0 };
  // the points: those in or on a square that goes
  const use = new Uint8Array(N);
  for (let j = 0; j < T.nz - 1; j++) for (let i = 0; i < T.nx - 1; i++) { if (!sq(i, j) || i < I0 || i >= I1 || j < J0 || j >= J1) continue;
    for (let b = 0; b <= R20; b++) for (let a = 0; a <= R20; a++) use[((j - J0) * R20 + b) * G.nx + (i - I0) * R20 + a] = 1; }
  const vid = new Int32Array(N).fill(-1), pos = [], uv = [], fk = [], deep = [], wl = new Uint8Array(N);
  const u0 = terrain.attributes.uv.array, nT = T.nx * T.nz, uvA = [u0[0], u0[1]], uvB = [u0[2 * (nT - 1)], u0[2 * (nT - 1) + 1]];
  const UX = (uvB[0] - uvA[0]) / ((T.nx - 1) * T.cell), UZ = (uvB[1] - uvA[1]) / ((T.nz - 1) * T.cell);
  // the height of a point in the tidal water (n: its nearest edge) and its substrate code
  const wetH = (x, z, n) => { const b = bed(x, z); let y, c = 0;
    if (n) { const p = n.s[4]; y = prof(p.kind, p.top, n.d); c = p.kind === 'revetment' ? (y > -0.2 ? 2 : 0) : p.kind === 'natural' ? (y > 0.5 ? 1 : 0) : 0; } else y = -6;
    // the survey: inside it (a sounding within 15 m) the bed; at its edge (the drying line) towards the profile; beyond, the profile
    if (isFinite(b)) { const f = Math.max(0, Math.min(1, (bedField.near - 15) / 20)), yb = b + 0.15, y2 = yb + (Math.max(y, yb) - yb) * f; if (Math.abs(y2 - y) > 0.3) c = 0; y = y2; }
    return [y, c]; };
  // a lattice point may move only if every terrain square it belongs to is replaced (the others share it)
  const fixed = (gi, gj) => { const i = I0 + Math.floor(gi / R20), j = J0 + Math.floor(gj / R20), ai = gi % R20 ? [0] : [0, -1], aj = gj % R20 ? [0] : [0, -1];
    for (const a of ai) for (const b of aj) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= T.nx - 1 || jj >= T.nz - 1 || !sq(ii, jj)) return true; } return false; };
  let snapped = 0;
  for (let k = 0; k < N; k++) { if (!use[k]) continue; const gi = k % G.nx, gj = Math.floor(k / G.nx); let x = G.x0 + gi * CELL, z = G.z0 + gj * CELL;
    const n = EH.near(x, z, inT[k] ? 140 : SNAP + 1); let y, c, dp = 0;
    if (inT[k]) { [y, c] = wetH(x, z, n); dp = y <= HMIN && !(n && n.d < 12) ? 1 : 0; }
    else { y = land(x, z); c = n ? CODE[n.s[4].kind] : 0; }
    // onto the edge: points within SNAP m of a wall, revetment or beach edge, 0.05 m to their own side of it; the
    // squares across a wall are left out (the wall face closes them), those across a beach or revetment stand nearly vertical
    if (n && n.d < SNAP && n.s[4].kind !== 'water' && !fixed(gi, gj)) { const [ax, az, bx, bz, p] = n.s, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0, sd = inT[k] ? -0.05 : 0.05;
      x = ax + t * dx + p.ox * sd; z = az + t * dz + p.oz * sd; snapped++; if (p.kind === 'wall') wl[k] = 1;
      if (inT[k]) { const [y0] = wetH(x, z, { s: n.s, d: 0 }); y = Math.max(y, p.kind === 'wall' ? y0 : Math.min(p.top, y0)); } else if (p.kind !== 'natural') y = Math.max(y, p.top); }
    vid[k] = pos.length / 3; pos.push(x, y, z); uv.push(uvA[0] + (x - T.x0) * UX, uvA[1] + (z - T.z0) * UZ); fk.push(c); deep.push(dp); }
  // triangles: land-only squares to group 0, the rest to group 1 (none where all corners are deep under the lowest water)
  const g0 = [], g1 = [];
  for (let j = 0; j < G.nz - 1; j++) for (let i = 0; i < G.nx - 1; i++) { const k = j * G.nx + i, a = vid[k], b = vid[k + 1], c = vid[k + G.nx], d = vid[k + G.nx + 1]; if (a < 0 || b < 0 || c < 0 || d < 0) continue;
    const nt = inT[k] + inT[k + 1] + inT[k + G.nx] + inT[k + G.nx + 1]; if (nt === 4 && deep[a] && deep[b] && deep[c] && deep[d]) continue;
    if (nt && nt < 4) { const C4 = [k, k + 1, k + G.nx, k + G.nx + 1]; if (C4.some(q => wl[q]) && C4.every(q => inT[q] || wl[q])) continue; }   // across a wall: the wall face closes it
    (nt ? g1 : g0).push(a, c, b, b, c, d); }
  // walls: a vertical face on each wall edge (piers too), from the foot (the tidal height at the edge) up to the bank
  let wallLen = 0;
  for (const e of edges) { const [px, pz, qx, qz, p] = e; if (p.kind !== 'wall') continue;
    const f1 = wetH(px - p.ox * 0.3, pz - p.oz * 0.3, { s: e, d: 0 })[0], f2 = wetH(qx - p.ox * 0.3, qz - p.oz * 0.3, { s: e, d: 0 })[0], top = Math.max(p.top, land(px + p.ox * 1, pz + p.oz * 1), land(qx + p.ox, qz + p.oz)) + 0.05, v = pos.length / 3;
    pos.push(px, f1 - 0.3, pz, qx, f2 - 0.3, qz, qx, top, qz, px, top, pz); for (let q = 0; q < 4; q++) { uv.push(0, 0); fk.push(3); }
    g1.push(v, v + 1, v + 2, v, v + 2, v + 3); wallLen += Math.hypot(qx - px, qz - pz); }
  const Gm = new THREE.BufferGeometry();
  Gm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); Gm.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); Gm.setAttribute('fk', new THREE.Float32BufferAttribute(fk, 1));
  Gm.setIndex(new THREE.Uint32BufferAttribute([...g0, ...g1], 1)); Gm.addGroup(0, g0.length, 0); Gm.addGroup(g0.length, g1.length, 1);
  Gm.computeVertexNormals(); Gm.computeBoundingSphere();
  const r = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
  return { geometry: Gm, terrainIndex: tidx, edges, stats: { edge_m: r(len), defence_types_m: r(byType), points: pos.length / 3, snapped, triangles_land: g0.length / 3, triangles_foreshore: g1.length / 3, terrain_squares_replaced: (T.nx - 1) * (T.nz - 1) - tidx.length / 6, wall_faces_m: Math.round(wallLen), hmin: +HMIN.toFixed(2), ms: Math.round(performance.now() - t0) } };
}

// ---------- the foreshore material (TSL): substrate by attribute fk (0 mud, 1 shingle, 2 rock, 3 wall); wetness from the
// hours since the water last stood at this height (dryTex: 0.1 m steps from -6 to +7 m OD, 0 to 15 h in a byte)
const DRY = { y0: -6, y1: 7, n: 131, hmax: 15 };
function foreshoreMaterial(dryTex, U) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  const k = attribute('fk', 'float'), y = positionWorld.y, p = positionWorld.xz;
  const dry = texture(dryTex, vec2(y.sub(DRY.y0).div(DRY.y1 - DRY.y0), 0.5)).x.mul(DRY.hmax);
  const isMud = step(k, 0.5), isSh = step(0.5, k).mul(step(k, 1.5)), isRock = step(1.5, k).mul(step(k, 2.5)), isWall = step(2.5, k);
  const wet = exp(dry.negate().div(mix(float(1.2), float(4), isMud)));   // mud holds its water longer
  const n1 = vn(p.mul(0.9)), n2 = vn(p.mul(4.5)), n3 = hh(floor(p.mul(6)));
  // mud: brown, ripples of darker silt; shingle: grey-brown speckle; rock: blocks; wall: brick and concrete by height
  const mud = mix(vec3(0.36, 0.30, 0.22), vec3(0.26, 0.22, 0.16), n1.mul(0.6).add(n2.mul(0.4)));
  const sh = mix(vec3(0.50, 0.47, 0.42), vec3(0.34, 0.31, 0.27), n3).mul(n1.mul(0.25).add(0.85));
  const blk = hh(floor(p.mul(0.8)).add(floor(y.mul(1.2))));
  const rock = mix(vec3(0.42, 0.41, 0.38), vec3(0.30, 0.29, 0.27), blk).mul(n2.mul(0.3).add(0.8));
  const course = step(0.08, fract(y.div(0.3))).mul(0.12).add(0.88);
  const wall = mix(vec3(0.46, 0.36, 0.30), vec3(0.52, 0.50, 0.46), smoothstep(U.mhws.add(0.5), U.mhws.add(1.5), y)).mul(course).mul(n2.mul(0.2).add(0.9));
  let base = mud.mul(isMud).add(sh.mul(isSh)).add(rock.mul(isRock)).add(wall.mul(isWall));
  // weed: green on walls and rock below mean high water neaps, thicker lower down; a dark wet band up to mean high water springs
  const weed = clamp(smoothstep(U.mhwn.add(0.3), U.mhwn.sub(0.6), y).mul(isWall.add(isRock).mul(0.85)).mul(n1.mul(0.5).add(0.6)), 0, 1);
  base = mix(base, vec3(0.30, 0.38, 0.17).mul(n2.mul(0.4).add(0.75)), weed);
  base = mix(base, base.mul(0.7), smoothstep(U.mhws.add(0.2), U.mhws.sub(0.3), y).mul(isWall.add(isRock)).mul(0.6));   // the tide mark
  const darken = mix(float(1), mix(mix(float(0.55), float(0.38), isMud), float(0.85), isWall), wet);
  m.colorNode = vec4(lin(base.mul(darken)), 1);
  // glossy while wet: mud almost a mirror for an hour (the sky in it), shingle less
  const rDry = mix(float(0.92), float(0.85), isWall), rWet = mix(mix(float(0.5), float(0.38), isMud), float(0.4), isWall.add(isRock).min(1));
  m.roughnessNode = mix(rDry, rWet, wet);
  m.userData.dry = dry;
  return m;
}

export default {
  id: 'tide', label: 'Tide and foreshore', on: true,
  async init(ctx, on) {
    const { scene, DATA, loadJSON, ui, stats, draw, esc } = ctx, t0 = performance.now();
    const [J, river] = await Promise.all([loadJSON(DATA + 'sky/tide-harmonics.json'), loadJSON(DATA + 'river.json')]);
    const g = A.meta.geo, geo = (lon, lat) => { const a = lon - g.lon0, b = lat - g.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * g.x[i], 0), t.reduce((s, v, i) => s + v * g.z[i], 0)]; };
    const model = new TideModel(J, geo, river.thames.map(p => [p[0], p[1]]));
    // the page's prediction against the fit tool's check values (one copy of the code, but the data must agree)
    let chk = 0; for (const row of J.check || []) J.check_columns.slice(1).forEach((id, i) => { const S = J.stations[id]; if (S) chk = Math.max(chk, Math.abs(predict(S, Date.parse(row[0])) - row[i + 1])); });
    if (chk > 0.001) console.warn('tide: the page prediction differs from the fit tool by', chk.toFixed(4), 'm');
    const E = A.meta.extent, CX = (E.x0 + E.x1) / 2, CZ = (E.z0 + E.z1) / 2, chC = model.C.at(CX, CZ), Hc = model.at(CX, CZ);
    const amp = k => (Hc.h[k] || [0])[0], mhws = Hc.z0 + amp('M2') + amp('S2'), mhwn = Hc.z0 + amp('M2') - amp('S2'), mlws = Hc.z0 - amp('M2') - amp('S2'), mlwn = Hc.z0 - amp('M2') + amp('S2');
    const U = { mhws: uniform(mhws), mhwn: uniform(mhwn) };

    // measured levels (docklands/tide.js nowcast: the readings where they are, else the prediction plus the residual of the
    // nearest reading, decaying; skill docklands-sky, "Tide surge"). Sources, merged per gauge: the last 7 days of the fit
    // file; 3 and 4 October from the snapshot (loaded when asked); the londat hourly cache (cache/latest.json theme tide: the
    // last 24 h, loaded when the clock is within 3 days of now); the EA flood-monitoring API (OGL v3.0, CORS open) for the
    // clock's day and the days either side, back 4 weeks (on by default, as the weather; ?ea=0 or the menu box: off); older
    // than that, the EA daily archive readings of the last year (data/sky/tide-history.json, built by
    // cwplans/tools/build-tide-history.mjs; loaded only when the clock is in that range; off with the EA API).
    let ver = 0, ready = false;   // ver: a new set of readings (the frame hook updates)
    const ID = id => `${id}-level-tidal_level-i-15_min-mAOD`, SRC = {}, RD = {}, got = { snap: false, cache: false, ea: {}, hist: false }, eaErr = { msg: null }, HIST = { J: null };
    const setSrc = (id, k, list) => { if (!J.stations[id]) return; (SRC[id] ||= {})[k] = list; RD[id] = mergeReadings(J.stations[id], ...Object.values(SRC[id])); ver++; if (ready) draw(); };
    if (J.recent) for (const [id, v] of Object.entries(J.recent.stations)) { const t0 = Date.parse(J.recent.start), st = J.recent.step_min * 60e3; setSrc(id, 'fit', v.map((x, i) => [t0 + i * st, x])); }
    const loadSnap = () => { if (got.snap) return; got.snap = true; loadJSON(DATA + 'sky/tide-2026-10-03.json').then(S => { for (const [id, s] of Object.entries(S.stations)) setSrc(id, 'snap', s.readings.map(([t, v]) => [Date.parse(t), v])); }).catch(e => console.warn('tide snapshot', e)); };
    const loadCache = () => { if (got.cache) return; got.cache = true; (async () => { for (const u of CACHE) { try { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) continue; const T = (await r.json()).themes?.tide; if (!T) return;
      for (const id of Object.keys(J.stations)) { const s = T.stations['ea-level:' + ID(id)]; if (s && s.series) setSrc(id, 'cache', s.series.map(([t, v]) => [Date.parse(t), v])); } return; } catch { /* next */ } } })(); };
    let eaOn = !/^(0|off|no)$/i.test(ctx.qs.get('ea') || '');
    const loadEA = t => { const day = new Date(t).toISOString().slice(0, 10), now = Date.now();
      if (!eaOn || got.ea[day] || t < now - 27 * 864e5 || t > now + 2 * 864e5) return; got.ea[day] = true;
      const a = new Date(Math.max(t - 864e5, now - 28 * 864e5)).toISOString().slice(0, 10), b = new Date(Math.min(t + 864e5, now)).toISOString().slice(0, 10);
      for (const id of Object.keys(J.stations)) fetch(`https://environment.data.gov.uk/flood-monitoring/id/measures/${ID(id)}/readings?startdate=${a}&enddate=${b}&_sorted&_limit=2000`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))).then(R => { eaErr.msg = null; setSrc(id, 'ea' + day, R.items.filter(x => typeof x.value === 'number').map(x => [Date.parse(x.dateTime), x.value])); })
        .catch(e => { eaErr.msg = e.message; got.ea[day] = false; console.warn('tide: EA API', e); }); };
    // the archive history: the key starts with 'ea' so that switching the EA readings off removes it too
    const loadHist = t => { const now = Date.now(); if (!eaOn || got.hist || t >= now - 26 * 864e5 || t < now - 400 * 864e5) return; got.hist = true;
      loadJSON(DATA + 'sky/tide-history.json').then(Hst => { HIST.J = Hst; if (!eaOn) return; for (const id of Object.keys(Hst.stations)) setSrc(id, 'eaArchive', historyReadings(Hst, id)); })
        .catch(e => { got.hist = false; eaErr.msg = 'tide history: ' + e.message; console.warn('tide history', e); }); };
    // the level at t comes from the archive file: older than the EA API window, and the file has readings round t
    const fromArchive = (id, t) => !!(t < Date.now() - 27 * 864e5 && HIST.J && SRC[id] && SRC[id].eaArchive && historyCovers(HIST.J, id, t));
    const kindsAt = t => model.st.map(s => nowcast(s.H, RD[s.id], t));   // no loading: for scans along the time axis
    const levelsAt = t => { if (t >= Date.parse('2026-10-03T00:00Z') && t < Date.parse('2026-10-05T00:00Z')) loadSnap();
      if (Math.abs(t - Date.now()) < 3 * 864e5) loadCache(); loadEA(t); loadHist(t);
      let n = 0, nr = 0; const K = kindsAt(t); for (const k of K) { if (k.kind === 'reading') n++; else if (k.kind === 'residual') nr++; }
      return { L: K.map(k => k.v), measured: n, residual: nr, K }; };

    // the water: per-vertex position along the gauges, and the offset on the GPU
    const wm = ctx.meshes.water, wg = wm.geometry, P = wg.attributes.position, td = wg.attributes.tidal;
    if (!td || !tideOffset) { console.warn('tide: the water geometry has no tidal attribute'); return {}; }
    const tu = new Float32Array(P.count); for (let i = 0; i < P.count; i++) if (td.getX(i) > 0) tu[i] = model.unit(model.C.at(P.getX(i), P.getZ(i)));
    wg.setAttribute('tunit', new THREE.BufferAttribute(tu, 1));
    wm.material.positionNode = positionLocal.add(vec3(0, attribute('tidal', 'float').mul(tideOffset), 0)); wm.material.needsUpdate = true;
    wg.boundingSphere.radius += 10;

    // the foreshore
    const dryData = new Uint8Array(DRY.n), dryTex = new THREE.DataTexture(dryData, DRY.n, 1, THREE.RedFormat, THREE.UnsignedByteType);
    dryTex.minFilter = dryTex.magFilter = THREE.LinearFilter; dryTex.generateMipmaps = false; dryTex.needsUpdate = true;
    const tm = ctx.meshes.terrain, tg0 = tm.geometry;
    if (!tg0.userData.tidal) { console.warn('tide: the terrain has no tidal mask'); return {}; }
    const FS = buildForeshore(model, tg0);
    // the terrain without the squares that the foreshore replaces: a new geometry on the same attributes (a changed index is
    // not always seen by the renderer)
    const tg1 = new THREE.BufferGeometry(); for (const [k, a] of Object.entries(tg0.attributes)) tg1.setAttribute(k, a);
    tg1.setIndex(new THREE.Uint32BufferAttribute(FS.terrainIndex, 1)); tg1.boundingSphere = tg0.boundingSphere; tg1.userData = tg0.userData;
    const fmat = foreshoreMaterial(dryTex, U), fore = new THREE.Mesh(FS.geometry, [tm.material, fmat]);
    fore.receiveShadow = true; fore.castShadow = false; fore.name = 'foreshore';

    // the menu: level now, rising or falling, next high and low waters, spring or neap
    ui.section('Tide');
    const note = ui.note('');
    const hm = t => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
    ui.toggle('Measured tide levels from the EA API for the clock time (asks environment.data.gov.uk; older than 4 weeks: the EA archive readings of the last year, kept on this site)', eaOn, v => { eaOn = v;
      if (!v) for (const id of Object.keys(SRC)) { for (const k of Object.keys(SRC[id])) if (k.startsWith('ea')) delete SRC[id][k]; RD[id] = mergeReadings(J.stations[id], ...Object.values(SRC[id])); }
      got.ea = {}; got.hist = false; ver++; draw(); });
    const cred = ui.note('Tide: EA readings where they cover the clock time (the flood-monitoring API for the last 4 weeks, the EA daily archive files for the year before); elsewhere our harmonic prediction from Environment Agency gauge readings (Tower Pier, Charlton, Silvertown), plus the residual (surge) of the nearest reading, fading over a day. This uses Environment Agency flood and river level data from the real-time data API (Beta), <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener">OGL v3.0</a>. Not for navigation.');
    cred.style.opacity = '0.75';
    let last = NaN, visible = on, info = {};
    function update() {
      const t = ctx.clock, { L, measured: nm, residual: nr, K } = levelsAt(t), dt = 5 * 60e3, La = levelsAt(t - dt).L, Lb = levelsAt(t + dt).L;
      L.forEach((v, i) => { if (tideU.l[i]) tideU.l[i].value = v; }); for (let i = L.length; i < tideU.l.length; i++) tideU.l[i].value = L[L.length - 1];
      tideU.on.value = visible ? 1 : 0;
      const lev = model.along(L, chC), rate = (model.along(Lb, chC) - model.along(La, chC)) / (2 * dt / 36e5);
      WU.tideLevel.value = visible ? lev : 2.8; WU.tideRate.value = visible ? rate : 0;
      // dry hours at each height: the time since the water at the centre last stood at or above it (the prediction, 15 h back)
      const back = []; for (let k = 0; k <= 15 * 12; k++) back.push(predict(Hc, t - k * 5 * 60e3) + (k ? 0 : lev - predict(Hc, t)));
      for (let i = 0; i < DRY.n; i++) { const y = DRY.y0 + (DRY.y1 - DRY.y0) * i / (DRY.n - 1); let k = 0; while (k < back.length && back[k] < y) k++; dryData[i] = Math.round(Math.min(1, k * 5 / 60 / DRY.hmax) * 255); }
      dryTex.needsUpdate = true;
      // high and low waters: of the page's level at the centre (readings, or prediction + residual) near each predicted one
      // (within 90 min) when readings are near; else the prediction's (the virtual station at the centre)
      const XP = extremes(Hc, t - 7 * 36e5, t + 26 * 36e5), X = nm || nr ? extremesNear(u => model.along(kindsAt(u).map(k => k.v), chC), XP) : XP, nh = X.find(e => e.hw && e.t > t), nl = X.find(e => !e.hw && e.t > t);
      // range of this tide: the high and low water either side of now; spring or neap by the mean spring and neap ranges here
      const prev = X.filter(e => e.t <= t).pop(), nxt = X.find(e => e.t > t), range = prev && nxt ? Math.abs(nxt.v - prev.v) : NaN;
      const sp = 2 * (amp('M2') + amp('S2')), np = 2 * (amp('M2') - amp('S2')), f = (range - np) / (sp - np);
      const later = X.filter(e => e.t > t + 20 * 36e5).slice(0, 2), r2 = later.length === 2 ? Math.abs(later[1].v - later[0].v) : range;
      const phase = f > 0.8 ? 'spring tides' : f < 0.2 ? 'neap tides' : r2 > range ? 'between neaps and springs (ranges growing)' : 'between springs and neaps (ranges falling)';
      const rc = lev - model.along(model.levels(t), chC), ages = K.filter(k => k.kind === 'residual').map(k => k.ageH), age = ages.length ? Math.min(...ages) : null;
      const kr = K.find(k => k.kind === 'residual'), rdg = model.st.filter((s, i) => K[i].kind === 'reading');
      const arch = rdg.length ? rdg.every(s => fromArchive(s.id, t)) : !!(kr && fromArchive(model.st[K.indexOf(kr)].id, kr.from));
      // some gauges with readings, others without (a gauge out of service): say which
      const mixed = rdg.length && rdg.length < model.st.length ? `EA ${arch ? 'archive ' : ''}readings at ${rdg.map(s => s.name).join(', ')}; ${model.st.filter((s, i) => K[i].kind !== 'reading').map((s, i) => s.name).join(', ')}: no reading, prediction${nr ? ' + fading residual' : ''}` : '';
      const srcTxt = nm === model.st.length ? (arch ? 'EA archive readings' : 'EA readings') : mixed ? mixed : nr || nm ? `prediction ${rc >= 0 ? '+' : '−'} ${Math.abs(rc).toFixed(2)} m measured residual${age != null ? `, from an EA ${arch ? 'archive ' : ''}reading ${age < 1 ? Math.round(age * 60) + ' min' : age.toFixed(1) + ' h'} ${kr.from < t ? 'before' : 'after'}, fading` : ''}` : `prediction, no surge${eaOn ? '' : ' (EA readings off)'}`;
      info = { level: +lev.toFixed(2), rate: +rate.toFixed(2), measured: nm, residual: nr, source: srcTxt, residualCentre: +rc.toFixed(3), archive: arch, fromReadingH: age != null ? +age.toFixed(2) : null, eaError: eaErr.msg, stations: model.st.map((s, i) => [s.name, +L[i].toFixed(2)]), nextHW: nh && [hm(nh.t), +nh.v.toFixed(2)], nextLW: nl && [hm(nl.t), +nl.v.toFixed(2)], range: +range.toFixed(2), phase };
      note.innerHTML = `Thames ${lev.toFixed(2)} m OD at the model centre, ${Math.abs(rate) < 0.05 ? 'slack' : rate > 0 ? 'rising' : 'falling'} ${Math.abs(rate).toFixed(2)} m an hour` +
        ` (${esc(srcTxt)}).<br>` +
        `${nh ? `High water ${esc(hm(nh.t))}, ${nh.v.toFixed(2)} m` : ''}${nh && nl ? ' · ' : ''}${nl ? `low water ${esc(hm(nl.t))}, ${nl.v.toFixed(2)} m` : ''}.<br>` +
        `Range ${isFinite(range) ? range.toFixed(1) : '?'} m: ${esc(phase)} (mean springs ${sp.toFixed(1)} m, neaps ${np.toFixed(1)} m).<br>` +
        `<span style="opacity:.75">${model.st.map((s, i) => `${esc(s.name)} ${L[i].toFixed(2)}`).join(' · ')} m OD</span>`;
    }
    let lastVer = -1;
    ctx.onFrame(() => { if (ctx.clock !== last || ver !== lastVer) { last = ctx.clock; lastVer = ver; update(); } });
    update(); last = ctx.clock; lastVer = ver; ready = true;

    stats.tide = { get now() { return info; }, get history() { return HIST.J ? { from: HIST.J.days.from, to: HIST.J.days.to, loaded: !!Object.values(SRC).some(x => x.eaArchive) } : null; }, foreshore: FS.stats, check_max_diff_m: +chk.toFixed(5), datums_centre: { mhws: +mhws.toFixed(2), mhwn: +mhwn.toFixed(2), mlwn: +mlwn.toFixed(2), mlws: +mlws.toFixed(2) },
      stations: model.st.map(s => ({ id: s.id, name: s.name, chainage: Math.round(s.ch) })), fit: Object.fromEntries(Object.entries(J.stations).map(([id, s]) => [id, s.fit && s.fit.rms])), ms: Math.round(performance.now() - t0) };
    globalThis.__tide3 = { model, levelsAt, update, info: () => info, fore, U, edges: FS.edges };
    const show = v => { visible = v; fore.visible = v; tm.geometry = v ? tg1 : tg0; last = NaN; draw(); };
    show(on);
    return { object: fore, setVisible: show, harmonics: Hc };   // harmonics: the time wheels' daily tide range (carousel.js)
  },
};
