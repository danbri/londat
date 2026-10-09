#!/usr/bin/env node
// Piers, pontoons and permanently berthed vessels in the 3D model box, for the Three.js port's "piers" layer
// (docklands/layers/piers.js): the shape of each OSM pier cut into floating pontoons, fixed decks, gangways and walks;
// the river-bus piers and their lines (TfL); the tour-boat piers (operator pages, facts only); HMS Belfast and the other
// historic vessels with an OSM outline, with their position, heading, length and beam.
//
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/build-piers.mjs      # one TfL request: the lines at each pier
//   node cwplans/tools/build-piers.mjs --offline                 # no network: lines from the held route sequences
//
// in:  data/raw/docklands/greater_london-latest.osm.pbf (tools/fetch-docklands.mjs osm; ODbL)
//      docklands/data/area.js (geo transform, water polygons, buildings), docklands/data/river.json (Thames centreline)
//      feeds/river/river-bus.json (TfL piers and lines), feeds/river/wikidata-vessels.json (Wikidata, CC0)
// out: docklands/data/piers.json
// Method, rules, the tour-boat facts and their sources, the faults: skill cwplans-river-and-water, "Piers and berthed
// vessels"; the page side: skill docklands-3d-page, "Three.js port".
import { createReadStream, readFileSync, writeFileSync, statSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TOOLS, UA } from './lib.mjs';
import { DIR, BOX_WGS84 } from './fetch-docklands.mjs';
const { BlobParser, BlobDecompressor, PrimitivesParser } = createRequire(import.meta.url)('osm-pbf-parser');

const CW = join(TOOLS, '..'), PBF = join(DIR, 'greater_london-latest.osm.pbf'), OUT = join(CW, 'docklands/data/piers.json');
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
new Function(readFileSync(join(CW, 'docklands/data/area.js'), 'utf8'))();
const A = globalThis.DOCKLANDS_AREA, E = A.meta.extent, G = A.meta.geo;
const geo = (lon, lat) => { const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; };
const dec = (q, stride = 2) => { const o = new Float32Array(q.length), acc = new Array(stride).fill(0); for (let i = 0; i < q.length; i++) { acc[i % stride] += q[i]; o[i] = acc[i % stride] / 10; } return o; };
const groundAt = (x, z) => { const T = A.terrain, i = Math.max(0, Math.min(T.nx - 1, Math.round((x - T.x0) / T.cell))), j = Math.max(0, Math.min(T.nz - 1, Math.round((z - T.z0) / T.cell))); return T.dm[j * T.nx + i] / 10; };
const WALL = 5.3;   // m OD: the river wall where the land under a pier end is not known (a stated default; the EA defence crests here are 5.2 to 5.8 m)
const inModel = (x, z) => x >= E.x0 && x <= E.x1 && z >= E.z0 && z <= E.z1;
const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;
const RIVER = JSON.parse(readFileSync(join(CW, 'docklands/data/river.json'), 'utf8')).thames;
const BUS = JSON.parse(readFileSync(join(CW, 'feeds/river/river-bus.json'), 'utf8'));
const WD = JSON.parse(readFileSync(join(CW, 'feeds/river/wikidata-vessels.json'), 'utf8'));

// ---------- water polygons (later polygons win, as docklands/water.js)
const WATER = A.water.map(w => { const f = dec(w.p); return { w, f, st: [0, ...(w.holes || []), f.length / 2] }; });
const inPoly = (P, x, z) => { let c = false; const f = P.f; for (let r = 0; r < P.st.length - 1; r++) for (let i = P.st[r], j = P.st[r + 1] - 1; i < P.st[r + 1]; j = i++) { const ax = f[2 * i], az = f[2 * i + 1], bx = f[2 * j], bz = f[2 * j + 1]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; } return c; };
const waterAt = (x, z) => { let hit = null; for (const P of WATER) if (inPoly(P, x, z)) hit = P.w; return hit; };
const nearestCl = (x, z) => { let b = 0, e = 1e18; for (let i = 0; i < RIVER.length; i++) { const d = (RIVER[i][0] - x) ** 2 + (RIVER[i][1] - z) ** 2; if (d < e) { e = d; b = i; } } return { i: b, d: Math.sqrt(e) }; };
// grid heading of upstream (west, towards the lower centreline index) at a point: 0 = grid north (-z), clockwise
const upstream = (x, z) => { const { i } = nearestCl(x, z), a = RIVER[Math.min(RIVER.length - 1, i + 2)], b = RIVER[Math.max(0, i - 2)]; return Math.atan2(b[0] - a[0], -(b[1] - a[1])); };

// ---------- read the extract: nodes in the box (with a margin), every way that has one, the pier and ship relations
const [W, S, EE, N] = BOX_WGS84, M = 0.002, inBoxLL = (lon, lat) => lon >= W - M && lon <= EE + M && lat >= S - M && lat <= N + M;
const isPier = t => t.man_made === 'pier', isShip = t => t.building === 'ship' || t.historic === 'ship' || t.man_made === 'ship';
const nodes = new Map(), ways = new Map(), rels = [];
const CACHE = join(tmpdir(), 'cwplans-piers-osm.json.gz'), pst = statSync(PBF), stamp = `${pst.size}:${pst.mtimeMs}:inner`;   // the shapes read last time from the same extract
let cached = null; try { cached = JSON.parse(gunzipSync(readFileSync(CACHE))); if (cached.stamp !== stamp) cached = null; } catch { /* none */ }
let asOf = cached ? cached.asOf : null; const shapes = cached ? cached.shapes : [];
if (!cached) {
const wantRel = t => t && (t.man_made === 'pier' || t.building === 'ship' || t.historic === 'ship');
const prim = new PrimitivesParser();
await new Promise((res, rej) => createReadStream(PBF).pipe(new BlobParser()).pipe(new BlobDecompressor()).pipe(prim).pipe(new Writable({ objectMode: true, write(items, _, cb) {
  for (const it of items) {
    if (it.type === 'node') { if (inBoxLL(it.lon, it.lat)) nodes.set(it.id, [it.lon, it.lat]); }
    else if (it.type === 'way') { if (it.refs.some(r => nodes.has(r))) ways.set(it.id, { id: it.id, tags: it.tags || {}, refs: it.refs }); }
    else if (it.type === 'relation' && wantRel(it.tags)) rels.push(it);
  } cb(); } })).on('finish', res).on('error', rej));
const H = prim._osmheader || {}; asOf = H.osmosis_replication_timestamp ? new Date(+H.osmosis_replication_timestamp * 1000).toISOString().slice(0, 19) + 'Z' : null;
console.log(`OSM extract as of ${asOf}: ${nodes.size} nodes and ${ways.size} ways in the box, ${rels.length} pier or ship relations`);

const ringOf = refs => refs.map(r => nodes.get(r)).filter(Boolean).map(([lon, lat]) => geo(lon, lat));
// candidate shapes: { osm, tags, rings (closed, model metres) | line }
const relMember = new Set();
for (const r of rels) {
  const join2 = list => { const segs = list.map(w => [...w.refs]), rings = [];   // join member ways into closed rings
    while (segs.length) { let cur = segs.shift(); let grew = true;
      while (cur[0] !== cur.at(-1) && grew) { grew = false; for (let k = 0; k < segs.length; k++) { const s = segs[k];
        if (s[0] === cur.at(-1)) cur = cur.concat(s.slice(1)); else if (s.at(-1) === cur.at(-1)) cur = cur.concat([...s].reverse().slice(1));
        else if (s.at(-1) === cur[0]) cur = s.concat(cur.slice(1)); else if (s[0] === cur[0]) cur = [...s].reverse().concat(cur.slice(1)); else continue;
        segs.splice(k, 1); grew = true; break; } }
      if (cur[0] === cur.at(-1)) rings.push(ringOf(cur)); }
    return rings; };
  const outer = r.members.filter(m => m.type === 'way' && m.role !== 'inner').map(m => ways.get(+m.id)).filter(Boolean);
  const inner = r.members.filter(m => m.type === 'way' && m.role === 'inner').map(m => ways.get(+m.id)).filter(Boolean);
  const rings = [...join2(outer), ...join2(inner)];   // outer rings first; the raster is even-odd, so inner rings are holes
  for (const m of outer) relMember.add(m.id);
  if (rings.length) shapes.push({ osm: 'relation/' + r.id, tags: r.tags, rings });
}
for (const w of ways.values()) {
  const t = w.tags; if (!(isPier(t) || isShip(t))) continue; if (relMember.has(w.id) && !t.name) continue;
  const p = ringOf(w.refs); if (p.length < 2) continue;
  const closed = w.refs[0] === w.refs.at(-1) && p.length >= 4 && t.area !== 'no' && !(t.highway && t.area !== 'yes');
  shapes.push(closed ? { osm: 'way/' + w.id, tags: t, rings: [p] } : { osm: 'way/' + w.id, tags: t, line: p });
}
writeFileSync(CACHE, gzipSync(JSON.stringify({ stamp, asOf, shapes })));
}

// ---------- geometry helpers
const area = r => { let s = 0; for (let k = 0, j = r.length - 1; k < r.length; j = k++) s += (r[j][0] - r[k][0]) * (r[j][1] + r[k][1]) / 2; return Math.abs(s); };
const centroid = pts => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
// the oriented rectangle of a point set (1 degree steps): [cx, cz, len, wid, ang] with ang the grid heading of the long axis (0..pi)
function orect(pts) {
  let best = null;
  for (let d = 0; d < 180; d++) { const a = d * Math.PI / 180, ux = Math.sin(a), uz = -Math.cos(a); let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const [x, z] of pts) { const u = x * ux + z * uz, v = -x * uz + z * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const ar = (u1 - u0) * (v1 - v0); if (!best || ar < best.ar) best = { ar, a, u0, u1, v0, v1, ux, uz }; }
  const { a, u0, u1, v0, v1, ux, uz } = best, um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  let len = u1 - u0, wid = v1 - v0, ang = a; const cx = um * ux - vm * uz, cz = um * uz + vm * ux;
  if (wid > len) { [len, wid] = [wid, len]; ang = a + Math.PI / 2; }
  return [r1(cx), r1(cz), r1(len), r1(wid), r3(ang % Math.PI)];
}

// rasterise a polygon at CELL m; split into wide parts (pontoons or decks: local width >= 2 * T) and thin parts (gangways, walks)
const CELL = 0.5, T = 2.2;
function split(rings) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const r of rings) for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  x0 -= 2; z0 -= 2; const nx = Math.ceil((x1 - x0) / CELL) + 4, nz = Math.ceil((z1 - z0) / CELL) + 4, In = new Uint8Array(nx * nz), P = { f: rings.flatMap(r => r.flat()), st: [] };
  let s = 0; P.st = [0, ...rings.map(r => (s += r.length))];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (inPoly(P, x0 + (i + .5) * CELL, z0 + (j + .5) * CELL)) In[j * nx + i] = 1;
  // chamfer distance to the outside (m)
  const D = new Float32Array(nx * nz).map((_, k) => In[k] ? 1e9 : 0), a = CELL, b = CELL * Math.SQRT2;
  for (let j = 1; j < nz; j++) for (let i = 1; i < nx - 1; i++) { const k = j * nx + i; if (!In[k]) continue; D[k] = Math.min(D[k], D[k - 1] + a, D[k - nx] + a, D[k - nx - 1] + b, D[k - nx + 1] + b); }
  for (let j = nz - 2; j >= 0; j--) for (let i = nx - 2; i >= 1; i--) { const k = j * nx + i; if (!In[k]) continue; D[k] = Math.min(D[k], D[k + 1] + a, D[k + nx] + a, D[k + nx + 1] + b, D[k + nx - 1] + b); }
  // wide = within T of a core cell (D >= T): a morphological opening by a disc of radius T. T adapts to the pier: 0.62 of
  // the largest half-width, raised in 0.4 m steps (to 0.9 of it) while a wide part fills less than 60 % of its rectangle
  let Dmax = 0; for (let k = 0; k < nx * nz; k++) if (In[k] && D[k] > Dmax) Dmax = D[k];
  const comps = (mask) => { const lab = new Int32Array(nx * nz).fill(-1), out = [];
    for (let k = 0; k < nx * nz; k++) { if (!mask[k] || lab[k] >= 0) continue; const id = out.length, q = [k], cells = []; lab[k] = id;
      while (q.length) { const c = q.pop(); cells.push(c); const i = c % nx, j = (c / nx) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const n = jj * nx + ii; if (mask[n] && lab[n] < 0) { lab[n] = id; q.push(n); } } }
      out.push(cells); }
    return { lab, out }; };
  const xy = c => [x0 + (c % nx + .5) * CELL, z0 + (((c / nx) | 0) + .5) * CELL];
  let wide, W, wideParts, widx, Tc = Math.max(T, Math.min(4.5, Dmax * .62));
  for (;;) {
    wide = new Uint8Array(nx * nz); const R = Math.ceil(Tc / CELL);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { if (D[j * nx + i] < Tc) continue;
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { if (di * di + dj * dj > R * R) continue; const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && In[jj * nx + ii]) wide[jj * nx + ii] = 1; } }
    W = comps(wide); wideParts = []; widx = new Map();
    W.out.forEach((c, id) => { if (c.length * CELL * CELL >= 40) { const rect = orect(c.map(xy)); widx.set(id, wideParts.length); wideParts.push({ cells: c, rect, fill: c.length * CELL * CELL / (rect[2] * rect[3]) }); } });
    if (!wideParts.some(w => w.fill < .6) || Tc + .4 > Dmax * .9) break; Tc += .4;
  }
  const thinMask = In.map((v, k) => v && !wide[k] ? 1 : 0), Tn = comps(thinMask);
  const thinParts = [];
  for (const c of Tn.out) { if (c.length * CELL * CELL < 6) continue;
    // touching wide parts: cells next to a wide cell
    const touch = new Map(); for (const k of c) for (const n of [k + 1, k - 1, k + nx, k - nx]) if (wide[n]) { const wi = widx.get(W.lab[n]); if (wi != null && !touch.has(wi)) touch.set(wi, xy(k)); }
    const pts = c.map(xy), rect = orect(pts), bridge = touch.size && rect[2] >= 3.5 * rect[3], wdt = Math.max(1.5, Math.min(bridge ? 6 : 4, rect[3]));
    if (rect[3] >= 5.5 && rect[2] >= 15 && !bridge) { wideParts.push({ cells: c, rect, fill: 1 }); continue; }   // wider than any gangway and not a long access bridge: a pontoon or deck
    // the axis ends of the oriented rectangle
    const ux = Math.sin(rect[4]), uz = -Math.cos(rect[4]), e0 = [rect[0] - ux * rect[2] / 2, rect[1] - uz * rect[2] / 2], e1 = [rect[0] + ux * rect[2] / 2, rect[1] + uz * rect[2] / 2];
    thinParts.push({ e0, e1, w: wdt, len: rect[2], touch: [...touch.entries()] });
  }
  return { wideParts, thinParts };
}

// ---------- tour boats (operators' own pages, read 2026-10-09; facts only). Departures: every_min between first and last.
const TOURS = {
  'City Cruises': { url: 'https://www.cityexperiences.com/london/city-cruises/sightseeing-schedule/', read: '2026-10-09', L: 34, B: 7.6, livery: 'citycruises',
    note: 'sightseeing timetables show departures about every 40 minutes from Westminster Pier (the FAQ says every 30); first and last departures per pier by season',
    piers: { 'Tower Millennium Pier': { every_min: 40, seasons: [['03-23', '06-21', '10:00', '18:55'], ['06-22', '09-06', '10:00', '19:40'], ['09-07', '10-25', '10:00', '18:55'], ['10-26', '03-22', '10:00', '17:15']] },
             'Greenwich Pier': { every_min: 40, seasons: [['03-23', '06-21', '10:30', '17:50'], ['06-22', '09-06', '10:30', '18:30'], ['09-07', '10-25', '10:30', '17:50'], ['10-26', '03-22', '10:30', '13:50']] } } },
  'Thames River Sightseeing': { url: 'https://thamesriversightseeing.com/', read: '2026-10-09', L: 30, B: 7, livery: 'trs',
    note: 'starting points Westminster Pier, Tower Bridge (Butler\'s Wharf Pier) and Greenwich Pier; no frequency stated on the page: 60 minutes, 10:00 to 17:00 is a stated default here',
    piers: { 'Butlers Wharf Pier': { every_min: 60, assumed: true, seasons: [['01-01', '12-31', '10:00', '17:00']] }, 'Greenwich Pier': { every_min: 60, assumed: true, seasons: [['01-01', '12-31', '10:00', '17:00']] } } },
};

// ---------- the piers
const tflPiers = BUS.items.filter(i => i.kind === 'pier').map(i => { const [x, z] = geo(i.position.lon, i.position.lat); return { naptan: i.values.naptan, name: i.values.name, x, z, lines: new Set() }; }).filter(p => inModel(p.x, p.z));
for (const r of BUS.items.filter(i => i.kind === 'river-bus-route')) for (const s of r.values.stops) { const p = tflPiers.find(q => q.naptan === s.id); if (p) p.lines.add(r.values.line); }
// the lines TfL lists at each pier (StopPoint; the held route sequences are the longest per direction and miss calls, e.g.
// RB6 at Canary Wharf); offline: the held sequences only
let linesFrom = 'feeds/river/river-bus.json route sequences (offline)';
if (!process.argv.includes('--offline')) try {
  const r = await fetch('https://api.tfl.gov.uk/StopPoint/Mode/river-bus', { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error('HTTP ' + r.status);
  const sp = (await r.json()).stopPoints || [];
  for (const p of tflPiers) { const q = sp.find(x => x.naptanId === p.naptan); if (q) for (const l of q.lines || []) p.lines.add(l.id); }
  linesFrom = `TfL StopPoint/Mode/river-bus, ${new Date().toISOString().slice(0, 10)}, with the held route sequences`;
} catch (e) { console.warn('TfL StopPoint lines not fetched:', e.message); }
const KEEP_TAGS = ['name', 'operator', 'floating', 'mooring', 'access', 'ferry', 'network', 'public_transport', 'wikidata', 'website', 'seamark:type', 'width', 'building', 'historic', 'ship:type', 'start_date', 'wikipedia'];
const tagsOf = t => Object.fromEntries(KEEP_TAGS.filter(k => t[k] != null).map(k => [k, t[k]]));
const piers = [], skippedOutside = [];
const pierShapes = shapes.filter(s => isPier(s.tags) && !isShip(s.tags));
for (const s of pierShapes) {
  const pts = s.rings ? s.rings[0] : s.line, [cx, cz] = centroid(pts); if (!inModel(cx, cz)) { skippedOutside.push(s.osm); continue; }
  const t = s.tags, wat = waterAt(cx, cz), name = t.name || null;
  const jetty = /jetty|wharf$/i.test(name || '') && !/pier/i.test(name || ''), floatTag = t.floating === 'yes' ? true : t.floating === 'no' ? false : null;
  const P = { id: 'osm:' + s.osm, name, osm: tagsOf(t), water: wat ? (wat.tidal ? 'tidal' : 'dock') : 'land', level: wat && !wat.tidal ? wat.level : null, at: [r1(cx), r1(cz)],
    float: floatTag ?? (!jetty && !!name && /pier|pontoon/i.test(name)), pontoons: [], decks: [], gangways: [], walks: [] };
  if (s.rings && !P.float) {   // a fixed pier: its outline, extruded by the layer (rings: outer first, then holes)
    P.area = Math.round(area(s.rings[0])); P.rings = s.rings.map(r => r.map(([x, z]) => [r1(x), r1(z)]));
  } else if (s.rings) {
    const ar = area(s.rings[0]); P.area = Math.round(ar);
    const { wideParts, thinParts } = split(s.rings);
    for (const w of wideParts) (P.float ? P.pontoons : P.decks).push(w.rect);
    for (const g of thinParts) {
      if (P.float && g.touch.length) { // the shore end: the axis end farther from the pontoon it touches
        const [wi, at] = g.touch[0], far = Math.hypot(g.e0[0] - at[0], g.e0[1] - at[1]) > Math.hypot(g.e1[0] - at[0], g.e1[1] - at[1]) ? g.e0 : g.e1, near = far === g.e0 ? g.e1 : g.e0;
        P.gangways.push([r1(far[0]), r1(far[1]), r1(near[0]), r1(near[1]), r1(g.w), wi]);
      } else P.walks.push([r1(g.e0[0]), r1(g.e0[1]), r1(g.e1[0]), r1(g.e1[1]), r1(g.w)]);
    }
    if (!wideParts.length && !thinParts.length) { const rc = orect(s.rings[0]); (P.float ? P.pontoons : P.decks).push(rc); }
  } else { // a line: a walkway (fixed) or a floating walkway (marina pontoon)
    const wd = +(t.width || 0) || (P.float ? 2 : 3);
    for (let i = 0; i + 1 < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az); if (l < .5) continue;
      if (P.float) P.pontoons.push([r1((ax + bx) / 2), r1((az + bz) / 2), r1(l), wd, r3(((Math.atan2(bx - ax, -(bz - az)) % Math.PI) + Math.PI) % Math.PI)]);
      else P.walks.push([r1(ax), r1(az), r1(bx), r1(bz), wd]); }
  }
  // heights: a fixed pier's deck = the highest land under its outline (not water), else the wall default (tidal) or 1 m above
  // the dock; a gangway's or walk's shore end = the land there, else the same default
  const dflt = P.water === 'dock' ? P.level + 1 : WALL, land = (x, z) => !waterAt(x, z) ? groundAt(x, z) : null;
  const landTop = pts => { let t = null; for (const [x, z] of pts) { const g = land(x, z); if (g != null && g > -5) t = Math.max(t ?? -1e9, g); } return t; };
  if (P.rings) P.top = r1(Math.max(dflt - .5, landTop(P.rings[0]) ?? dflt));
  for (const g of P.gangways) { const h = land(g[0], g[1]); g.push(r1(h != null && h > -5 ? Math.max(h, dflt - 1) : dflt)); }
  for (const w of P.walks) { const h = landTop([[w[0], w[1]], [w[2], w[3]]]); w.push(r1(Math.max(dflt - .5, h ?? dflt))); }
  piers.push(P);
}
// join TfL piers: the named OSM pier nearest the TfL point (within 80 m)
for (const tp of tflPiers) {
  const big = P => Math.max(0, ...P.pontoons.map(q => q[2] * q[3]));
  let best = null; for (const P of piers) { if (!P.name || !P.float) continue; const d = Math.hypot(P.at[0] - tp.x, P.at[1] - tp.z); if (d < 80 && (!best || big(P) > big(best.P))) best = { P, d }; }
  let P = best && best.P;
  if (!P) { // no OSM pier shape (Doubletree Docklands / Nelson Dock Pier): a stated default pontoon 30 x 7 m, 18 m out from the bank
    const { i } = nearestCl(tp.x, tp.z), c = RIVER[i], dx = c[0] - tp.x, dz = c[1] - tp.z, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    let sx = tp.x, sz = tp.z; for (let k = 0; k < 200 && waterAt(sx, sz)?.tidal; k++) { sx -= ux; sz -= uz; }   // back to the bank
    for (let k = 0; k < 200 && !waterAt(sx, sz)?.tidal; k++) { sx += ux; sz += uz; }
    const px = sx + ux * 21.5, pz = sz + uz * 21.5, ang = ((Math.atan2(-uz, -ux) % Math.PI) + Math.PI) % Math.PI;
    P = { id: 'tfl:' + tp.naptan, name: tp.name, osm: null, water: 'tidal', level: null, at: [r1(px), r1(pz)], float: true, synthetic: 'no OSM pier shape: a 30 x 7 m pontoon 18 m from the bank with a gangway (stated default)',
      pontoons: [[r1(px), r1(pz), 30, 7, r3(ang)]], decks: [], gangways: [[r1(sx - ux * 2), r1(sz - uz * 2), r1(px - ux * 3.5), r1(pz - uz * 3.5), 2.5, 0, r1(Math.max(WALL - 1, groundAt(sx - ux * 2, sz - uz * 2)))]], walks: [] };
    piers.push(P);
  }
  P.tfl = { naptan: tp.naptan, name: tp.name, lines: [...tp.lines].sort(), url: `https://api.tfl.gov.uk/StopPoint/${tp.naptan}` };
}
for (const P of piers) {
  const main = piers.filter(q => q.name === P.name).sort((a, b) => Math.max(0, ...b.pontoons.map(q => q[2] * q[3])) - Math.max(0, ...a.pontoons.map(q => q[2] * q[3])))[0];
  for (const [op, o] of Object.entries(TOURS)) if (o.piers[P.name] && main === P) (P.tours ||= []).push({ operator: op, ...o.piers[P.name], url: o.url, read: o.read });
  P.kind = P.tfl ? (P.tfl.lines.length === 1 && P.tfl.lines[0] === 'rb4' ? 'ferry' : 'river-bus') : P.tours ? 'tour' : /police/i.test(P.name || '') ? 'police'
    : P.water === 'dock' && P.float ? 'marina' : P.float ? 'pier' : 'jetty';
  // the berth: beside the largest pontoon, on the side nearer the river centreline; bow upstream (TfL inbound) by default
  const pt = [...P.pontoons].sort((a, b) => b[2] * b[3] - a[2] * a[3])[0];
  if (pt && (P.tfl || P.tours) && P.water === 'tidal') {
    const [cx, cz, len, wid, ang] = pt, nx = Math.cos(ang), nz = Math.sin(ang), { i } = nearestCl(cx, cz), c = RIVER[i], side = (c[0] - cx) * nx + (c[1] - cz) * nz >= 0 ? 1 : -1;
    const up = upstream(cx, cz), ah = Math.abs(((up - ang) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) < Math.PI / 2 ? ang : ang + Math.PI;
    P.berth = { x: r1(cx + nx * side * wid / 2), z: r1(cz + nz * side * wid / 2), nx: r3(nx * side), nz: r3(nz * side), up: r3(((ah % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)), len: r1(len) };
  }
}

// ---------- berthed vessels: OSM ship outlines in the model box, with the Wikidata item when there is one
const wdByQ = new Map(WD.items.map(i => [i.values.qid, i]));
// model buildings whose centre is inside the ship's oriented rectangle (the layer draws the ship in their place)
const bIndex = ([x, z, L, B, ang]) => { const ux = Math.sin(ang), uz = -Math.cos(ang), hits = [];
  A.buildings.forEach((b, i) => { if (Math.abs(b.p[0] / 10 - x) > 300 || Math.abs(b.p[1] / 10 - z) > 300) return; const f = dec(b.p), n = (b.holes && b.holes.length ? b.holes[0] : f.length / 2);
    let cx = 0, cz = 0; for (let k = 0; k < n; k++) { cx += f[2 * k] / n; cz += f[2 * k + 1] / n; }
    const u = (cx - x) * ux + (cz - z) * uz, v = -(cx - x) * uz + (cz - z) * ux; if (Math.abs(u) <= L / 2 + 1 && Math.abs(v) <= B / 2 + 1) hits.push(i); }); return hits; };
const vessels = [];
for (const s of shapes.filter(s => isShip(s.tags) && s.rings)) {
  const ring = s.rings[0], [cx, cz] = centroid(ring); if (!inModel(cx, cz) || !waterAt(cx, cz)) continue;   // a ship on land (Cutty Sark, in dry dock) stays a building
  const t = s.tags, rc = orect(ring), [x, z, L, B, ang] = rc, ux = Math.sin(ang), uz = -Math.cos(ang);
  // the bow: the end whose last 6 % of the length is narrower (a pointed stem against a broad stern)
  const widthNear = sgn => { let v0 = 1e9, v1 = -1e9; for (const [px, pz] of ring) { const u = (px - x) * ux + (pz - z) * uz; if (u * sgn < L * .44) continue; const v = -(px - x) * uz + (pz - z) * ux; v0 = Math.min(v0, v); v1 = Math.max(v1, v); } return v1 > v0 ? v1 - v0 : 0; };
  const bowSign = widthNear(1) <= widthNear(-1) ? 1 : -1, heading = ((Math.atan2(ux * bowSign, -uz * bowSign) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const wat = waterAt(x, z), wd = t.wikidata ? wdByQ.get(t.wikidata) : null;
  const kind = t.wikidata === 'Q757178' ? 'cruiser' : /light ?(ship|vessel)/i.test(t.name || '') || (wd && /lightvessel/.test(wd.values.classes.join())) ? 'lightvessel'
    : /tug/i.test(wd ? wd.values.classes.join() : '') ? 'tug' : /galleon/i.test(t['ship:type'] || '') ? 'galleon' : /church|barge/i.test((t.name || '') + (wd ? wd.values.classes.join() : '')) ? 'barge' : 'steamship';
  vessels.push({ id: 'osm:' + s.osm, name: t.name || null, kind, x, z, heading: r3(heading), L, B, water: wat ? (wat.tidal ? 'tidal' : 'dock') : 'land', level: wat && !wat.tidal ? wat.level : null,
    osm: tagsOf(t), wikidata: t.wikidata || null, wd: wd ? { description: wd.values.description, classes: wd.values.classes } : null, buildings: bIndex(rc) });
}
const belfast = vessels.find(v => v.wikidata === 'Q757178');
if (belfast) belfast.facts = {
  summary: 'Town-class light cruiser (Edinburgh group), built by Harland and Wolff, Belfast; in service from 1939; museum ship in the Pool of London since 1971, part of the Imperial War Museum since 1978.',
  length_m: 187, beam_m: 21, beam_note: 'Wikidata gives 21 m (P2261, with the bulges added in her 1940s repair); 19.3 m (63 ft 4 in) as built', draught_m: 6.02, displacement_t: 11500,
  armament: 'twelve 6-inch guns in four triple turrets (A and B forward, X and Y aft)',
  paint: 'Admiralty Disruptive Camouflage Type 25 (her 1942 to 1944 scheme): dark grey, light grey, dark blue-grey and blue panels. Restored with paint from Jotun; the colours and the pattern here are an approximation, not the surveyed scheme.',
  sources: [{ title: 'Wikidata Q757178 (CC0)', url: 'https://www.wikidata.org/wiki/Q757178' }, { title: 'Imperial War Museums: HMS Belfast', url: 'https://www.iwm.org.uk/visits/hms-belfast' }, { title: 'OpenStreetMap ' + belfast.id.slice(4), url: 'https://www.openstreetmap.org/' + belfast.id.slice(4) }] };

const counts = { piers: piers.length, named: piers.filter(p => p.name).length, floating: piers.filter(p => p.float).length, pontoons: piers.reduce((s, p) => s + p.pontoons.length, 0),
  gangways: piers.reduce((s, p) => s + p.gangways.length, 0), river_bus: piers.filter(p => p.tfl).length, tour: piers.filter(p => p.tours).length, vessels: vessels.length, outside_box: skippedOutside.length,
  by_kind: piers.reduce((o, p) => ((o[p.kind] = (o[p.kind] || 0) + 1), o), {}) };
const out = {
  meta: { built: new Date().toISOString().slice(0, 10), tool: 'tools/build-piers.mjs', osm_data_as_of: asOf, extract: 'osmfr-greater-london', tfl_lines: linesFrom,
    inputs: { 'docklands/data/area.js': sha(join(CW, 'docklands/data/area.js')).slice(0, 16), 'docklands/data/river.json': sha(join(CW, 'docklands/data/river.json')).slice(0, 16), 'feeds/river/river-bus.json': sha(join(CW, 'feeds/river/river-bus.json')).slice(0, 16), 'feeds/river/wikidata-vessels.json': sha(join(CW, 'feeds/river/wikidata-vessels.json')).slice(0, 16) },
    licence: 'OSM shapes: ODbL 1.0 (© OpenStreetMap contributors); TfL piers and lines: TfL open data (Powered by TfL Open Data); Wikidata: CC0; tour-boat timings: facts from the operators\' pages (no text copied)',
    method: 'Fixed piers: the OSM outline, deck at the highest land under it (else 5.3 m OD on the Thames, 1 m above a dock). Gangway and walk arrays: [x0, z0, x1, z1, width, pontoon, shore height m OD]. Floating piers: the OSM shape rasterised at 0.5 m; parts at least 4.4 m wide (an opening by a 2.2 m disc) are pontoons when the pier floats, else fixed decks; narrower parts are gangways (shore end = the end away from the pontoon) or walks. Floating: floating=yes, or a name with Pier or Pontoon and no floating=no. TfL piers joined to the nearest named floating pier within 80 m. Berth: beside the largest pontoon, on the side towards the Thames centreline. Ships: OSM ship outlines, oriented rectangle; the bow is the narrower end.',
    tours: Object.fromEntries(Object.entries(TOURS).map(([k, o]) => [k, { url: o.url, read: o.read, note: o.note, L: o.L, B: o.B, livery: o.livery }])),
    counts },
  piers, vessels,
};
writeFileSync(OUT, JSON.stringify(out));
console.log(JSON.stringify(counts));
