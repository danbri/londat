#!/usr/bin/env node
// Generic boats at known moorings, for the Three.js port (docklands/moored-boats.js, layer river, part "Moorings and
// houseboats"). Owner, 2026-10-11: "add generic barge outline shaped boats where we know residential moorings are
// positioned?" The boats are NOT real vessels: each one is a typical type and size for the class of mooring, placed by
// one generic rule from OpenStreetMap tags and geometry, so the same rule works for any place with OSM data. Nothing here
// names a place: the rule reads only tags, shapes and the water polygons.
//
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/build-moorings.mjs fetch     # one Overpass request (the box), cached raw
//   node cwplans/tools/build-moorings.mjs                                # build from the cached answer (no network)
//   node cwplans/tools/build-moorings.mjs fetch --bbox w,s,e,n           # another box (default: the model box)
//
// in:  Overpass API (mooring=*, houseboat=*, building=houseboat, seamark:type=mooring, leisure=marina; tags and geometry)
//      -> data/raw/moorings/overpass-moorings.json.gz (not committed; ODbL)
//      docklands/data/area.js (geo transform, water polygons, buildings), docklands/data/piers.json (the pontoons cut from
//      the OSM pier shapes by tools/build-piers.mjs)
// out: docklands/data/moorings.json
// Rules (also in meta.rules of the output):
//   places: (1) a houseboat outline (building=houseboat, houseboat=yes): one boat fitted to its minimum-area rectangle;
//   (2) a pontoon of a mooring (piers.json: OSM mooring set and not "no", or a name with Moorings or Marina, or inside a
//   marina or mooring area; passenger piers left out): boats along both long sides of each pontoon, deck and walk;
//   (3) a mooring line (an OSM way with mooring=*, not a pier): boats along it on its water side(s); (4) a marina or
//   mooring area with no pontoon place inside: boats along its quay edges (water inside, land outside); (5) a mooring
//   node: boats along the nearest water edge within 30 m; (6) a seamark mooring buoy (or one of no category; not
//   dolphins, piles or bollards; not historic or ruined): one dumb barge swinging along the nearest bank.
//   class: canal (non-tidal water under 30 m wide, 2 x area / perimeter), residential (houseboat tags, mooring=
//   residential|private, a name or marina with Moorings), tidal residential, marina (leisure=marina, mooring=guest|
//   visitor|yacht, a name with Marina), tier (buoys), mixed (other moorings). A typical mix of types per class (MIX).
//   Every choice is a seeded hash (FNV-1a) of the OSM id, the part, the side and the slot: the same place always shows
//   the same boats. A boat is kept only when 9 points of its outline are on water and it overlaps no pontoon, deck,
//   walk, gangway, berthed vessel, fixed pier outline or other boat.
// Skill: docklands-3d-page, "Three.js port: boats and moored barges (2026-10-11)"; cwplans-river-and-water (moorings).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { TOOLS, RAW, UA } from './lib.mjs';
import { REGIONS } from '../../docklands/geo/regions/index.js';

const CW = join(TOOLS, '..'), OUT = join(CW, 'docklands/data/moorings.json'), CACHE = join(RAW, 'moorings', 'overpass-moorings.json.gz');
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);

// ---------- fetch (one Overpass request for the box; tags and geometry)
if (process.argv[2] === 'fetch') {
  // the area: --bbox W,S,E,N, else the bbox of --region (docklands/geo/regions/; default docklands), so the rule runs for any region
  const R = REGIONS[arg('--region', 'docklands')]; if (!R && !arg('--bbox')) throw new Error('unknown --region; known: ' + Object.keys(REGIONS).join(', '));
  const [W, S, E, N] = (arg('--bbox') || R.bbox.join(',')).split(',').map(Number), b = `(${S},${W},${N},${E})`;
  const q = `[out:json][timeout:180];(nwr["mooring"]${b};nwr["houseboat"]${b};nwr["building"="houseboat"]${b};nwr["seamark:type"="mooring"]${b};nwr["leisure"="marina"]${b};);out tags geom;`;
  let d = null, from = null;
  for (let round = 0; round < 3 && !d; round++) for (const u of OVERPASS) {
    try { const r = await fetch(u, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
      if (r.ok) { d = await r.json(); from = u; break; } console.log(r.status, u); } catch (e) { console.log(e.message, u); }
    await new Promise(r => setTimeout(r, 2000));
  }
  if (!d) throw new Error('no Overpass server answered');
  mkdirSync(join(RAW, 'moorings'), { recursive: true });
  writeFileSync(CACHE, gzipSync(JSON.stringify({ fetched: new Date().toISOString(), from, query: q, bbox: [W, S, E, N], osm_base: d.osm3s.timestamp_osm_base, licence: 'ODbL 1.0, © OpenStreetMap contributors', elements: d.elements })));
  console.log(`fetched ${d.elements.length} elements from ${from} (OSM ${d.osm3s.timestamp_osm_base})`);
}
if (!existsSync(CACHE)) throw new Error('no cached Overpass answer: run with "fetch" first');
const OV = JSON.parse(gunzipSync(readFileSync(CACHE)));

// ---------- the model: geo transform, water polygons, buildings, piers
new Function(readFileSync(join(CW, 'docklands/data/area.js'), 'utf8'))();
const A = globalThis.DOCKLANDS_AREA, E = A.meta.extent, G = A.meta.geo;
const PIERS = JSON.parse(readFileSync(join(CW, 'docklands/data/piers.json'), 'utf8'));
const geo = (lon, lat) => { const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; };
const dec = (q, stride = 2) => { const o = new Float32Array(q.length), acc = new Array(stride).fill(0); for (let i = 0; i < q.length; i++) { acc[i % stride] += q[i]; o[i] = acc[i % stride] / 10; } return o; };
const inBox = (x, z) => x >= E.x0 && x <= E.x1 && z >= E.z0 && z <= E.z1;
const MFP = `${A.buildings.length}:${Array.from(A.buildings[0].p.slice(0, 6)).join('.')}:${Array.from(A.buildings.at(-1).p.slice(0, 6)).join('.')}`;   // = docklands/build.js MFP
const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;

// FNV-1a with a final mix: a seeded value 0..1 (= docklands/boats-models.js hash01)
function hash01(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

// water polygons (later polygons win, as docklands/water.js), with a width estimate 2 x area / perimeter
const WATER = A.water.map(w => { const f = dec(w.p), st = [0, ...(w.holes || []), f.length / 2]; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, ar = 0, per = 0;
  for (let i = 0; i < f.length; i += 2) { x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); z0 = Math.min(z0, f[i + 1]); z1 = Math.max(z1, f[i + 1]); }
  for (let r = 0; r < st.length - 1; r++) for (let i = st[r], j = st[r + 1] - 1; i < st[r + 1]; j = i++) { ar += f[2 * j] * f[2 * i + 1] - f[2 * i] * f[2 * j + 1]; per += Math.hypot(f[2 * i] - f[2 * j], f[2 * i + 1] - f[2 * j + 1]); }
  return { w, f, st, x0, x1, z0, z1, width: 2 * Math.abs(ar / 2) / Math.max(1, per) }; });
const inPoly = (P, x, z) => { if (x < P.x0 || x > P.x1 || z < P.z0 || z > P.z1) return false; let c = false; const f = P.f;
  for (let r = 0; r < P.st.length - 1; r++) for (let i = P.st[r], j = P.st[r + 1] - 1; i < P.st[r + 1]; j = i++) { const ax = f[2 * i], az = f[2 * i + 1], bx = f[2 * j], bz = f[2 * j + 1]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; }
  return c; };
const polyAt = (x, z) => { let hit = null; for (const P of WATER) if (inPoly(P, x, z)) hit = P; return hit; };
const ptIn = (ring, x, z) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [ax, az] = ring[i], [bx, bz] = ring[j]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; } return c; };
const waterClass = P => !P ? 'tidal' : P.w.tidal ? 'tidal' : P.width < 30 ? 'canal' : 'dock';
// the nearest water edge to (x, z) within r m: { d, x, z, h (bearing of the edge) }
function nearestEdge(x, z, r) {
  let best = null;
  for (const P of WATER) { if (x < P.x0 - r || x > P.x1 + r || z < P.z0 - r || z > P.z1 + r) continue; const f = P.f;
    for (let k = 0; k < P.st.length - 1; k++) for (let i = P.st[k], j = P.st[k + 1] - 1; i < P.st[k + 1]; j = i++) {
      const ax = f[2 * j], az = f[2 * j + 1], bx = f[2 * i], bz = f[2 * i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; if (l2 < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), px = ax + t * dx, pz = az + t * dz, d = Math.hypot(x - px, z - pz);
      if (d <= r && (!best || d < best.d)) best = { d, x: px, z: pz, h: Math.atan2(dx, -dz) }; } }
  return best;
}
// minimum-area rectangle of a ring of [x, z]: { x, z, h (long axis), L, B }
function minRect(pts) {
  let br = null;
  for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-3) continue; const e = Math.atan2(b[0] - a[0], -(b[1] - a[1]));
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const [x, z] of pts) { const u = x * Math.sin(e) - z * Math.cos(e), v = x * Math.cos(e) + z * Math.sin(e); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const ar = (u1 - u0) * (v1 - v0); if (!br || ar < br.ar) br = { ar, e, u: (u0 + u1) / 2, v: (v0 + v1) / 2, lu: u1 - u0, lv: v1 - v0 }; }
  if (!br) return null;
  const long = br.lu >= br.lv;
  return { x: br.u * Math.sin(br.e) + br.v * Math.cos(br.e), z: -br.u * Math.cos(br.e) + br.v * Math.sin(br.e), h: long ? br.e : br.e + Math.PI / 2, L: Math.max(br.lu, br.lv), B: Math.min(br.lu, br.lv) };
}

// ---------- oriented boxes { x, z, h, L, B }: corners, SAT overlap with a margin, a grid of obstacles
const corners = (o, m = 0) => { const ux = Math.sin(o.h), uz = -Math.cos(o.h), nx = Math.cos(o.h), nz = Math.sin(o.h), l = o.L / 2 + m, b = o.B / 2 + m;
  return [[o.x + ux * l + nx * b, o.z + uz * l + nz * b], [o.x + ux * l - nx * b, o.z + uz * l - nz * b], [o.x - ux * l - nx * b, o.z - uz * l - nz * b], [o.x - ux * l + nx * b, o.z - uz * l + nz * b]]; };
const overlap = (a, b, m) => { const A4 = corners(a, m), B4 = corners(b, 0);
  for (const o of [a, b]) for (const [ax, az] of [[Math.sin(o.h), -Math.cos(o.h)], [Math.cos(o.h), Math.sin(o.h)]]) {
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const [x, z] of A4) { const p = x * ax + z * az; a0 = Math.min(a0, p); a1 = Math.max(a1, p); } for (const [x, z] of B4) { const p = x * ax + z * az; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
    if (a1 < b0 || b1 < a0) return false; }
  return true; };
const CELL = 60, grid = new Map(), cellKey = (i, j) => i * 100000 + j;
const cells = o => { const r = Math.hypot(o.L, o.B) / 2, out = []; for (let i = Math.floor((o.x - r) / CELL); i <= Math.floor((o.x + r) / CELL); i++) for (let j = Math.floor((o.z - r) / CELL); j <= Math.floor((o.z + r) / CELL); j++) out.push(cellKey(i, j)); return out; };
const addObs = o => { for (const k of cells(o)) { if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o); } };
const near = o => { const out = new Set(); for (const k of cells(o)) for (const q of grid.get(k) || []) out.add(q); return out; };
const seg = (x0, z0, x1, z1, B) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, h: Math.atan2(x1 - x0, -(z1 - z0)), L: Math.hypot(x1 - x0, z1 - z0), B });
const rings = [];
for (const P of PIERS.piers) {
  for (const pt of [...P.pontoons, ...P.decks]) addObs({ x: pt[0], z: pt[1], h: pt[4], L: pt[2], B: pt[3], kind: 'pontoon' });
  for (const w of [...P.walks, ...P.gangways]) if (Math.hypot(w[2] - w[0], w[3] - w[1]) > .5) addObs({ ...seg(w[0], w[1], w[2], w[3], w[4]), kind: 'walk' });
  // a fixed pier's outline is an obstacle, except an outline named for the moorings or barges themselves (an area that covers them)
  if (P.rings && !/barge|moorings?\b/i.test(P.name || '')) { const R = P.rings[0]; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of R) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } rings.push({ R, x0, x1, z0, z1 }); }
}
for (const v of PIERS.vessels || []) addObs({ x: v.x, z: v.z, h: v.heading, L: v.L, B: v.B, kind: 'vessel' });
const ringHit = o => { const C4 = corners(o, .3), pts = [...C4, [o.x, o.z]];
  for (const r of rings) { if (Math.max(...C4.map(c => c[0])) < r.x0 || Math.min(...C4.map(c => c[0])) > r.x1 || Math.max(...C4.map(c => c[1])) < r.z0 || Math.min(...C4.map(c => c[1])) > r.z1) continue;
    if (pts.some(([x, z]) => ptIn(r.R, x, z)) || r.R.some(([x, z]) => ptIn(C4, x, z))) return true; }
  return false; };
const onWater = o => { const C4 = corners(o, 0), pts = [...C4, [o.x, o.z]]; for (let k = 0; k < 4; k++) { const a = C4[k], b = C4[(k + 1) % 4]; pts.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); }
  return pts.every(([x, z]) => !!polyAt(x, z)); };
const free = o => onWater(o) && !ringHit(o) && ![...near(o)].some(q => overlap(o, q, .25));

// ---------- types, sizes and mixes (typical values, not measured; stated in the card and the skill)
const RANGE = {   // length range (m); beam range (m) or, under 1, beam / length
  narrowboat: [[15, 21], [2.05, 2.1]], widebeam: [[15, 20], [3, 4]], dutch: [[18, 30], [4, 5]], dutchmast: [[18, 30], [4, 5]], lighter: [[22, 30], [5.5, 7]],
  home: [[14, 22], [6, 8]], yacht: [[8, 13], [.31, .34]], cruiser: [[8, 14], [.32, .35]], sbarge: [[25, 29], [5.8, 6.4]], barge: [[30, 50], [8, 11]],
};
const MIX = {
  canal: [['narrowboat', .62], ['widebeam', .33], ['dutch', .05]],
  resid: [['dutch', .3], ['dutchmast', .08], ['widebeam', .25], ['narrowboat', .1], ['lighter', .17], ['home', .1]],
  tidal: [['lighter', .34], ['dutch', .25], ['dutchmast', .1], ['sbarge', .08], ['widebeam', .13], ['home', .1]],
  marina: [['yacht', .45], ['cruiser', .25], ['dutch', .1], ['dutchmast', .06], ['widebeam', .14]],
  mixed: [['yacht', .22], ['cruiser', .2], ['narrowboat', .14], ['widebeam', .16], ['dutch', .18], ['dutchmast', .1]],
  tier: [['barge', 1]],
};
const EMPTY = { canal: .15, resid: .12, tidal: .1, marina: .2, mixed: .25, tier: .5 }, RAFT = { canal: .12, resid: .15, tidal: .4, marina: 0, mixed: .05, tier: 0 };
const FALLBACK = { canal: 'narrowboat', resid: 'narrowboat', tidal: 'widebeam', marina: 'yacht', mixed: 'yacht', tier: 'barge' };
const typeFor = (mix, u) => { let s = 0; for (const [k, p] of mix) { s += p; if (u < s) return k; } return mix[mix.length - 1][0]; };
const sizeOf = (key, seed) => { const [lr, br] = RANGE[key], L = lr[0] + (lr[1] - lr[0]) * hash01(seed + 'L'), b = br[0] + (br[1] - br[0]) * hash01(seed + 'B'); return [L, b < 1 ? L * b : b]; };

// ---------- the OSM elements: shapes in the model frame
const els = OV.elements.map(e => {
  const t = e.tags || {}, pts = e.type === 'node' ? [geo(e.lon, e.lat)] : e.geometry ? e.geometry.filter(Boolean).map(p => geo(p.lon, p.lat))
    : e.members ? e.members.filter(m => m.role !== 'inner' && m.geometry).flatMap(m => m.geometry.filter(Boolean).map(p => geo(p.lon, p.lat))) : [];
  const closed = e.type === 'relation' || (e.type === 'way' && pts.length > 3 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < .01);
  const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
  return { id: `osm:${e.type}/${e.id}`, type: e.type, t, pts, closed, c };
}).filter(e => e.pts.length && e.pts.some(([x, z]) => inBox(x, z)));
const areas = els.filter(e => e.closed && (e.t.leisure === 'marina' || (e.t.mooring && e.t.mooring !== 'no' && e.t.man_made !== 'pier' && e.t.area !== 'no' && !e.t.highway)));
const areaAt = (x, z) => areas.find(a => ptIn(a.pts, x, z)) || null;
const KEEP = ['name', 'mooring', 'leisure', 'access', 'operator', 'seamark:type', 'seamark:mooring:category', 'man_made', 'floating', 'capacity', 'building', 'houseboat'];
const tagsOf = (t, home) => Object.fromEntries(KEEP.filter(k => t[k] != null && (!home || ['building', 'houseboat', 'mooring'].includes(k))).map(k => [k, t[k]]));   // a home: only its kind (no name, operator or address)

function classOf(t, name, P, area) {
  const wc = waterClass(P), an = area ? area.t.name || '' : '', m = t.mooring || '';
  if (wc === 'canal') return 'canal';
  if (t.building === 'houseboat' || t.houseboat === 'yes' || /residential|private/.test(m) || /\bmoorings?\b/i.test(name) || /\bmoorings?\b/i.test(an)) return wc === 'tidal' ? 'tidal' : 'resid';
  if (area && area.t.leisure === 'marina' || /guest|visitor|yacht/.test(m) || /marina/i.test(name)) return 'marina';
  return wc === 'tidal' ? 'tidal' : 'mixed';
}

const places = [], boats = [], hide = new Set(), counts = { skipped: {} };
const skip = why => { counts.skipped[why] = (counts.skipped[why] || 0) + 1; };
const addPlace = p => { p.i = places.length; places.push(p); return p; };
const addBoat = (pl, b) => { const o = { ...b, p: pl.i, j: pl.n++ }; boats.push(o); addObs(o); return o; };

// (1) houseboat outlines and points
const lowBuildings = A.buildings.map((b, i) => ({ b, i })).filter(({ b }) => b.h <= 10).map(({ b, i }) => { const f = dec(b.p); let x = 0, z = 0; for (let k = 0; k < f.length; k += 2) { x += f[k]; z += f[k + 1]; } return { i, x: x / (f.length / 2), z: z / (f.length / 2) }; });
for (const e of els.filter(e => e.t.building === 'houseboat' || e.t.houseboat === 'yes')) {
  let o;
  if (e.closed && e.pts.length >= 4) { o = minRect(e.pts.slice(0, -1)); if (!o || o.L < 4 || o.L > 60) { skip('houseboat outline size'); continue; }
    o.B = Math.max(o.B, 2); o.h += hash01(e.id + 'bow') < .5 ? Math.PI : 0;
    for (const q of lowBuildings) if (Math.hypot(q.x - o.x, q.z - o.z) < o.L / 2 + 2 && (ptIn(e.pts, q.x, q.z) || Math.hypot(q.x - o.x, q.z - o.z) < 1.5)) hide.add(q.i); }
  else { const [x, z] = e.c, ed = nearestEdge(x, z, 30); o = { x, z, h: ed ? ed.h : 0, L: 18, B: 4.4 }; }   // a point: a typical Dutch barge along the nearest bank
  const P = polyAt(o.x, o.z), key = o.B >= 6.8 ? (o.L / o.B < 3 ? 'home' : 'lighter') : o.B >= 4.6 ? (P && P.w.tidal && hash01(e.id) < .5 ? 'lighter' : hash01(e.id) < .2 ? 'dutchmast' : 'dutch') : o.B >= 2.8 ? 'widebeam' : 'narrowboat';
  const pl = addPlace({ id: e.id, kind: 'houseboat', cls: classOf(e.t, '', P, areaAt(o.x, o.z)), name: null, tags: tagsOf(e.t, true), x: o.x, z: o.z, P, n: 0 });
  addBoat(pl, { x: o.x, z: o.z, h: o.h, L: o.L, B: o.B, key, outline: 1 });
}

// fill one berth line: boats along the line (x0, z0) -> (x1, z1), on side s (+1: the normal (cos h, sin h)), the first
// boat edge `off` m from the line; rafted boats outside. Returns the number placed.
function fillLine(pl, x0, z0, x1, z1, s, off, seedBase) {
  const len = Math.hypot(x1 - x0, z1 - z0); if (len < 3) return 0;
  const a = Math.atan2(x1 - x0, -(z1 - z0)), ux = Math.sin(a), uz = -Math.cos(a), nx = Math.cos(a), nz = Math.sin(a), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cls = pl.cls, mix = MIX[cls];
  let t = -len / 2 + hash01(seedBase + ':g') * 2, k = 0, n = 0;
  const at = (seed, key, L, B, o, along) => { const c = t + along, b = { x: cx + ux * c + nx * s * o, z: cz + uz * c + nz * s * o, h: a + (hash01(seed + key + 'bow') < .5 ? Math.PI : 0), L, B, key }; return free(b) ? b : null; };
  while (t < len / 2 - 2 && k < 60) {
    const seed = `${seedBase}:${k++}`;
    let key = typeFor(mix, hash01(seed + 'type')), [L, B] = sizeOf(key, seed);
    if (len < 14 && L > len + 8) { key = FALLBACK[cls]; [L, B] = sizeOf(key, seed); }
    if (t + L / 2 > len / 2 + 1) { if (t > -len / 2 + 1) break; key = FALLBACK[cls]; [L, B] = sizeOf(key, seed + 's'); }   // the centre stays on the line (a boat may overhang its end)
    if (hash01(seed + 'empty') < EMPTY[cls]) { t += L + 1.5; continue; }
    let b = at(seed, key, L, B, off + B / 2, L / 2);
    if (!b) { key = FALLBACK[cls]; [L, B] = sizeOf(key, seed + 'x'); b = at(seed, key, L, B, off + B / 2, L / 2); }
    if (!b) { t += 3; continue; }
    addBoat(pl, b); n++;
    let o2 = off + B, raft = 0;   // rafted alongside: a second (and third) boat outside the first
    while (raft < 2 && hash01(seed + 'raft' + raft) < RAFT[cls] * (raft ? .5 : 1)) {
      const k2 = typeFor(mix, hash01(seed + 'rtype' + raft)), [L2, B2] = sizeOf(k2, seed + 'r' + raft);
      const b2 = at(seed + 'r' + raft, k2, L2, B2, o2 + .3 + B2 / 2, L / 2 + (hash01(seed + 'rs' + raft) - .5) * 3); if (!b2) break;
      b2.rafted = raft + 1; addBoat(pl, b2); n++; o2 += .3 + B2; raft++;
    }
    t += L + .6 + hash01(seed + 'gap') * 2;
  }
  return n;
}

// (2) pontoons of moorings (piers.json)
const PASSENGER = new Set(['river-bus', 'tour', 'ferry', 'police']);
const pontoonPlaces = [];
for (const P of PIERS.piers) {
  const o = P.osm || {}, nm = P.name || '', m = o.mooring, area = areaAt(P.at[0], P.at[1]);
  if (m === 'no' || P.water === 'land' || PASSENGER.has(P.kind) || P.tfl || P.tours) continue;
  if (!((m && m !== 'no') || /\bmoorings?\b|marina/i.test(nm) || area)) continue;
  if (!inBox(P.at[0], P.at[1])) continue;
  const parts = [...P.pontoons, ...P.decks, ...P.walks.map(w => { const q = seg(w[0], w[1], w[2], w[3], w[4]); return [q.x, q.z, q.L, q.B, q.h]; })];
  if (!parts.length && P.rings) { const q = minRect(P.rings[0]); if (q) parts.push([q.x, q.z, q.L, q.B, q.h]); }   // a fixed jetty: its minimum-area rectangle
  const Pw = polyAt(P.at[0], P.at[1]) || (parts[0] && polyAt(parts[0][0], parts[0][1]));
  const pl = addPlace({ id: P.id, kind: 'pontoon', cls: classOf(o, nm, Pw, area), name: P.name || null, area: area ? { id: area.id, name: area.t.name || null } : null, tags: tagsOf(o), x: P.at[0], z: P.at[1], P: Pw, n: 0 });
  pl.parts = parts; pontoonPlaces.push(pl);
}
// the pontoons first (all places' obstacles are in), largest first so a big pontoon is not crowded out by its fingers
for (const pl of pontoonPlaces) pl.parts.forEach((p, pi) => { const [cx, cz, len, wid, a] = p, ux = Math.sin(a), uz = -Math.cos(a);
  for (const s of [-1, 1]) fillLine(pl, cx - ux * len / 2, cz - uz * len / 2, cx + ux * len / 2, cz + uz * len / 2, s, wid / 2 + .35, `${pl.id}:${pi}:${s}`); });

// (3) mooring lines (OSM ways with mooring=*, not piers, not areas) and (5) mooring nodes: quay berths on the water side(s)
const sideOnWater = (x, z, h, s, d = 4) => !!polyAt(x + Math.cos(h) * s * d, z + Math.sin(h) * s * d);
for (const e of els) {
  const t = e.t; if (!t.mooring || t.mooring === 'no' || t.man_made === 'pier' || t.building === 'houseboat' || t.houseboat === 'yes') continue;
  if (e.closed && areas.includes(e)) continue;   // an area: (4)
  let lines = [];
  if (e.type === 'node') { const ed = nearestEdge(e.c[0], e.c[1], 30); if (!ed) { skip('mooring node far from water'); continue; } const ux = Math.sin(ed.h), uz = -Math.cos(ed.h); lines.push([ed.x - ux * 20, ed.z - uz * 20, ed.x + ux * 20, ed.z + uz * 20]); }
  else for (let k = 0; k + 1 < e.pts.length; k++) lines.push([e.pts[k][0], e.pts[k][1], e.pts[k + 1][0], e.pts[k + 1][1]]);
  const P = polyAt(e.c[0], e.c[1]) || (() => { const ed = nearestEdge(e.c[0], e.c[1], 30); return ed ? polyAt(ed.x + Math.cos(ed.h) * 3, ed.z + Math.sin(ed.h) * 3) || polyAt(ed.x - Math.cos(ed.h) * 3, ed.z - Math.sin(ed.h) * 3) : null; })();
  const pl = addPlace({ id: e.id, kind: 'quay', cls: classOf(t, t.name || '', P, areaAt(e.c[0], e.c[1])), name: t.name || null, tags: tagsOf(t), x: e.c[0], z: e.c[1], P, n: 0 });
  lines.forEach(([x0, z0, x1, z1], li) => { const h = Math.atan2(x1 - x0, -(z1 - z0)), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    for (const s of [-1, 1]) if (sideOnWater(mx, mz, h, s)) fillLine(pl, x0, z0, x1, z1, s, .4, `${e.id}:${li}:${s}`); });
}
// (4) marina and mooring areas with no pontoon place inside: the quay edges (water inside, land outside)
for (const a of areas) {
  if (pontoonPlaces.some(pl => ptIn(a.pts, pl.x, pl.z))) continue;
  const P = polyAt(a.c[0], a.c[1]) || polyAt(...(a.pts.find(([x, z]) => polyAt(x, z)) || [1e9, 1e9]));
  const pl = addPlace({ id: a.id, kind: 'quay', cls: classOf(a.t, a.t.name || '', P, a), name: a.t.name || null, tags: tagsOf(a.t), x: a.c[0], z: a.c[1], P, n: 0 });
  for (let k = 0; k + 1 < a.pts.length; k++) { const [x0, z0] = a.pts[k], [x1, z1] = a.pts[k + 1], h = Math.atan2(x1 - x0, -(z1 - z0)), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    for (const s of [-1, 1]) if (ptIn(a.pts, mx + Math.cos(h) * s * 4, mz + Math.sin(h) * s * 4) && sideOnWater(mx, mz, h, s) && !sideOnWater(mx, mz, h, -s)) fillLine(pl, x0, z0, x1, z1, s, .4, `${a.id}:${k}:${s}`); }
}
// (6) seamark moorings: a buoy (or no category), not historic or ruined: one dumb barge along the nearest bank
for (const e of els.filter(e => e.t['seamark:type'] === 'mooring' && e.type === 'node')) {
  const t = e.t, cat = t['seamark:mooring:category'];
  if (cat && cat !== 'buoy') { skip('seamark mooring ' + cat); continue; }
  if (/historic|ruined/.test((t['seamark:mooring:status'] || '') + (t['seamark:mooring:condition'] || ''))) { skip('seamark mooring historic'); continue; }
  const [x, z] = e.c, P = polyAt(x, z); if (!P) { skip('seamark mooring on land'); continue; }
  const pl = addPlace({ id: e.id, kind: 'buoy', cls: 'tier', name: t.name || null, tags: tagsOf(t), x, z, P, n: 0 }), seed = e.id;
  if (hash01(seed + 'empty') < EMPTY.tier) continue;
  const ed = nearestEdge(x, z, 400), [L, B] = sizeOf('barge', seed), b = { x, z, h: (ed ? ed.h : 0) + (hash01(seed + 'bow') < .5 ? Math.PI : 0), L, B, key: 'barge' };
  if (free(b)) addBoat(pl, b); else skip('buoy barge does not fit');
}

// ---------- output
const kept = places.filter(p => p.n > 0), idx = new Map(kept.map((p, k) => [p.i, k]));
const TYPES = Object.keys(RANGE);
const byType = {}, byClass = {}, byKind = {};
for (const b of boats) { byType[b.key] = (byType[b.key] || 0) + 1; const p = places[b.p]; byClass[p.cls] = (byClass[p.cls] || 0) + 1; byKind[p.kind] = (byKind[p.kind] || 0) + 1; }
const out = {
  meta: {
    built: new Date().toISOString().slice(0, 10), tool: 'tools/build-moorings.mjs',
    what: 'GENERIC boats at known moorings: typical types and sizes for each class of mooring, placed by one rule from OSM tags and geometry. Not real vessels; no vessel or occupant data.',
    osm_data_as_of: OV.osm_base, overpass: { from: OV.from, fetched: OV.fetched, bbox: OV.bbox, query: OV.query },
    piers: { file: 'docklands/data/piers.json', osm_data_as_of: PIERS.meta.osm_data_as_of, extract: PIERS.meta.extract },
    inputs: { 'docklands/data/area.js': sha(join(CW, 'docklands/data/area.js')), 'docklands/data/piers.json': sha(join(CW, 'docklands/data/piers.json')) },
    licence: 'ODbL 1.0 (OpenStreetMap)', attribution: '© OpenStreetMap contributors', model_fp: MFP,
    rules: [
      'Places: (1) a houseboat outline (building=houseboat or houseboat=yes): one boat fitted to its minimum-area rectangle; type by beam (6.8 m and over: floating home when length/beam < 3, else converted lighter; 4.6 m: Dutch barge, half of them lighters on tidal water; 2.8 m: widebeam; less: narrowboat); the model buildings whose centroid is inside the outline are hidden (hide); a houseboat node: a Dutch barge 18 x 4.4 m along the nearest bank.',
      '(2) a pontoon of a mooring (piers.json: OSM mooring set and not "no", or a name with Moorings or Marina, or inside a marina or mooring area; river-bus, tour, ferry and police piers left out): boats along both long sides of each pontoon, deck and walk, 0.35 m off; a fixed jetty: its minimum-area rectangle.',
      '(3) an OSM way with mooring=* (not a pier): boats along each segment on its water side(s), 0.4 m off. (4) a marina or mooring area with no pontoon place inside: boats along its edges that have water inside and land outside. (5) a mooring node: a 40 m berth along the nearest water edge within 30 m.',
      '(6) seamark:type=mooring nodes: buoys and moorings of no category (not dolphins, piles, bollards, chains; not historic or ruined): one dumb barge (30 to 50 m) along the nearest bank, half the buoys empty.',
      'Class: canal (non-tidal water under 30 m wide, 2 x area / perimeter: whatever the tags), residential (houseboat tags, mooring=residential|private, a name or containing marina with Moorings; tidal residential on tidal water), marina (leisure=marina around it, mooring=guest|visitor|yacht, a name with Marina), tier (buoys), mixed (other moorings). Mix of types per class: MIX in the tool.',
      'Along a berth line from one end: a type by hash, an empty berth by hash (canal 15 %, residential 12 %, tidal 10 %, marina 20 %, mixed 25 %), gaps 0.6 to 2.6 m; rafted two or three abreast (tidal 40 %, residential 15 %, canal 12 %, mixed 5 %). A boat is kept only when 9 points of its outline are on water and it overlaps (SAT, 0.25 m margin) no pontoon, deck, walk, gangway, berthed vessel, fixed pier outline or other boat; else a smaller fallback type; else the next slot 3 m on.',
      'Seeds: FNV-1a of the OSM id, part, side and slot: the same place always shows the same boats. Sizes are typical ranges (narrowboat 15 to 21 x 2.1 m, widebeam 15 to 20 x 3 to 4, Dutch barge 18 to 30 x 4 to 5, lighter 22 to 30 x 5.5 to 7, floating home 14 to 22 x 6 to 8, yacht 8 to 13 m, cruiser 8 to 14 m, sailing barge 25 to 29 x 6, dumb barge 30 to 50 x 8 to 11): stated defaults, not measured.',
      'Kept per place: OSM id, kind, class, the name of a mooring or marina (never of a houseboat: a home), a few tags (mooring, leisure, access, operator, seamark, capacity). No addresses, contacts or occupants.',
    ],
    counts: { places: kept.length, boats: boats.length, byType, byClass, byKind, hidden_buildings: hide.size, osm_elements: OV.elements.length, skipped: counts.skipped },
    format: { boats: '[x, z, heading (rad, bearing of the bow from grid north -z, clockwise), length m, beam m, type index into types, place index, rafted (0, 1, 2), outline (1: fitted to an OSM houseboat outline)]', places: 'water: "tidal" or the dock level (m OD)' },
  },
  types: TYPES,
  places: kept.map(p => ({ id: p.id, kind: p.kind, cls: p.cls, name: p.name, ...(p.area ? { area: p.area } : {}), tags: p.tags, x: r1(p.x), z: r1(p.z), n: p.n,
    water: !p.P || p.P.w.tidal ? 'tidal' : p.P.w.level, ...(p.P && p.P.w.n ? { water_name: p.P.w.n } : {}) })),
  boats: boats.map(b => [r1(b.x), r1(b.z), r3(((b.h % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)), r1(b.L), r1(b.B), TYPES.indexOf(b.key), idx.get(b.p), b.rafted || 0, b.outline || 0]),
  hide: [...hide].sort((a, b) => a - b),
};
writeFileSync(OUT, JSON.stringify(out).replace(/\],\[/g, '],\n['));
console.log(`wrote docklands/data/moorings.json: ${boats.length} generic boats at ${kept.length} places (of ${places.length}); ${JSON.stringify(out.meta.counts)}`);
