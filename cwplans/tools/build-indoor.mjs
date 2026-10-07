// The Canary Wharf walking network in 3D, from OpenStreetMap: footways, corridors, stairs, escalators, lifts and
// streets, each node placed on its level, with named places (shops, platforms, entrances) attached, for routing in
// the 3D page.
//
//   node magpie/cwplans/tools/build-indoor.mjs        # about 1 minute (streams the Greater London PBF)
//
// in:  data/raw/docklands/greater_london-latest.osm.pbf (fetch-docklands.mjs osm), docklands/data/area.js (ground),
//      data/raw/docklands/tfl-stationdata-gtfs.zip (TfL step-free station topology, GTFS pathways; fetched when absent)
// out: docklands/data/indoor.js  globalThis.DOCKLANDS_INDOOR = { meta, nodes, edges, places }
//      nodes: flat [x, z, level, ground] per node (local metres, level as OSM gives it, ground in m OD)
//      edges: flat [a, b, kind] (kind index into meta.kinds); places: [name, kind, level, node, osm, metres to node, 1 if the node is on the place's level]
// Heights are drawn at ground + level × storey height in the page: an OSM level is a floor index, not a height.
// Measured faults (unresolved stair ends, level jumps at shared nodes, islands) go to meta.faults for the audit.
import { createReadStream, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { TOOLS, bngProjector, get } from './lib.mjs';
import { ORIGIN } from './fetch-docklands.mjs';
import { osmLevels } from './osm-values.mjs';

const CW = join(TOOLS, '..');
const parseOSM = createRequire(import.meta.url)('osm-pbf-parser');
const BOX = [-0.0330, 51.4960, -0.0020, 51.5120];
const inB = (lon, lat) => lon >= BOX[0] && lon <= BOX[2] && lat >= BOX[1] && lat <= BOX[3];
const WALK = /^(footway|pedestrian|steps|corridor|path|living_street|residential|service|unclassified|tertiary|secondary|primary|elevator|platform|track|cycleway)$/;

// ---- read
const nodes = new Map(), ways = [];
await new Promise((res, rej) => createReadStream(join(CW, 'data/raw/docklands/greater_london-latest.osm.pbf')).pipe(parseOSM()).pipe(new Writable({ objectMode: true, write(items, e, next) {
  for (const it of items) {
    if (it.type === 'node') { if (inB(it.lon, it.lat)) nodes.set(it.id, { lon: it.lon, lat: it.lat, tags: it.tags || {} }); }
    else if (it.type === 'way') { const t = it.tags || {}; if ((t.highway && WALK.test(t.highway) && t.access !== 'private' && t.foot !== 'no') || t.railway === 'platform' || (t.public_transport === 'platform' && t.highway !== 'bus_stop') || t.conveying || /^(area|corridor|room)$/.test(t.indoor || '')) ways.push({ id: it.id, refs: it.refs, tags: t }); }
  } next(); } })).on('finish', res).on('error', rej));
const W = ways.filter(w => w.refs.length > 1 && w.refs.every(r => nodes.has(r)));

// ---- levels
const parseLevels = s => { const l = osmLevels(s); return l.length ? l : null; };   // tools/osm-values.mjs
const isConnector = w => w.tags.highway === 'steps' || !!w.tags.conveying || w.tags.highway === 'elevator';
const wayLevels = w => parseLevels(w.tags.level) || parseLevels(w.tags['level:ref']) || ((w.tags.tunnel === 'yes' || w.tags.indoor === 'yes' || w.tags.location === 'underground') && +w.tags.layer < 0 ? [+w.tags.layer] : [0]);
const faults = { unresolved_connector_ends: [], level_jumps: [], multi_level_non_connectors: 0, ways_without_level_assumed_0: 0, escalators_without_level: 0, lifts_without_levels: 0 };

// levels seen at each node from ordinary (single-level) ways, for orienting stairs and escalators
const levelsAt = new Map(); const addAt = (n, l) => { if (!levelsAt.has(n)) levelsAt.set(n, new Set()); levelsAt.get(n).add(l); };
for (const w of W) if (w.tags.conveying && w.tags.level == null) faults.escalators_without_level++;
for (const [, n] of nodes) if (n.tags.highway === 'elevator' && !((parseLevels(n.tags.level) || []).length > 1)) faults.lifts_without_levels++;
for (const w of W) { const L = wayLevels(w); if (L.length === 1 && !isConnector(w)) for (const r of w.refs) addAt(r, L[0]); if (w.tags.level == null && !isConnector(w)) faults.ways_without_level_assumed_0++; }

// ---- graph: one vertex per (node, level)
const toBNG = await bngProjector(), local = (lon, lat) => { const [e, n] = toBNG(lon, lat); return [e - ORIGIN.E0, -(n - ORIGIN.N0)]; };
globalThis.window = globalThis; new Function(readFileSync(join(CW, 'docklands/data/area.js'), 'utf8'))();
const T = globalThis.DOCKLANDS_AREA.terrain, ground = (x, z) => { const i = Math.max(0, Math.min(T.nx - 1, Math.round((x - T.x0) / T.cell))), j = Math.max(0, Math.min(T.nz - 1, Math.round((z - T.z0) / T.cell))); return T.dm[j * T.nx + i] / 10; };
const KINDS = ['street', 'footway', 'indoor', 'steps', 'escalator', 'lift', 'platform', 'ramp'];
const V = [], vIx = new Map(), E = [];
const vert = (nodeId, lv) => { const k = `${nodeId}|${lv}`; let i = vIx.get(k); if (i === undefined) { const n = nodes.get(nodeId), [x, z] = local(n.lon, n.lat); i = V.length; V.push({ x, z, lv, g: ground(x, z), id: nodeId }); vIx.set(k, i); } return i; };
const edge = (a, b, kind) => { if (a !== b) E.push([a, b, KINDS.indexOf(kind)]); };
const kindOf = w => w.tags.conveying ? 'escalator' : w.tags.highway === 'steps' ? 'steps' : w.tags.highway === 'elevator' ? 'lift' : (w.tags.railway === 'platform' || w.tags.public_transport === 'platform') ? 'platform'
  : /^(footway|pedestrian|path|corridor|cycleway|track|platform)$/.test(w.tags.highway) ? ((w.tags.indoor && w.tags.indoor !== 'no') || w.tags.tunnel || w.tags.level != null && +String(w.tags.level).split(/[;,]/)[0] !== 0 ? 'indoor' : 'footway') : 'street';
const isArea = w => w.refs[0] === w.refs.at(-1) && (w.tags.railway === 'platform' || w.tags.public_transport === 'platform' || /^(area|corridor|room)$/.test(w.tags.indoor || '') || (w.tags.highway === 'pedestrian' && w.tags.area === 'yes') || w.tags.area === 'yes' && /^(footway|pedestrian)$/.test(w.tags.highway || ''));
for (const w of W) {
  if (/^(area|corridor|room)$/.test(w.tags.indoor || '') && !w.tags.highway) continue;
  const L = wayLevels(w), kind = kindOf(w);
  if (L.length === 1 || !isConnector(w) && kind !== 'lift') {
    if (L.length > 1) faults.multi_level_non_connectors++;
    for (const lv of L.length > 1 ? [L[0]] : L) for (let i = 1; i < w.refs.length; i++) edge(vert(w.refs[i - 1], lv), vert(w.refs[i], lv), kind);
    continue;
  }
  // a stair or escalator between the lowest and highest level it lists: orient it by the levels its ends touch
  const lo = L[0], hi = L.at(-1), e0 = w.refs[0], e1 = w.refs.at(-1), s0 = levelsAt.get(e0) || new Set(), s1 = levelsAt.get(e1) || new Set();
  let first;
  if (s0.has(lo) && s1.has(hi)) first = lo; else if (s0.has(hi) && s1.has(lo)) first = hi;
  else if (s0.has(lo) || s1.has(hi)) first = lo; else if (s0.has(hi) || s1.has(lo)) first = hi;
  else if (/^up/.test(w.tags.incline || '')) first = lo; else if (/^down/.test(w.tags.incline || '')) first = hi;
  else { first = lo; faults.unresolved_connector_ends.push(`way/${w.id}`); }
  const last = first === lo ? hi : lo, seg = [0]; let tot = 0;
  for (let i = 1; i < w.refs.length; i++) { const a = nodes.get(w.refs[i - 1]), b = nodes.get(w.refs[i]); tot += Math.hypot((b.lon - a.lon) * 69, (b.lat - a.lat) * 111); seg.push(tot); }
  let prev = null;
  w.refs.forEach((r, i) => { const lv = i === 0 ? first : i === w.refs.length - 1 ? last : +(first + (last - first) * (seg[i] / (tot || 1))).toFixed(2); const v = vert(r, lv); if (prev !== null) edge(prev, v, kind); prev = v; });
}
// lifts: a lift node lists its levels; join its copies at those levels, in order
let lifts = 0;
for (const [id, n] of nodes) if (n.tags.highway === 'elevator') {
  const L = parseLevels(n.tags.level) || parseLevels(n.tags['level:ref']); if (!L || L.length < 2) continue; lifts++;
  for (let i = 1; i < L.length; i++) edge(vert(id, L[i - 1]), vert(id, L[i]), 'lift');
}
// walkable areas (platforms, concourses, pedestrian areas, indoor corridors and rooms): paths end at or inside the
// outline without sharing a node, so each area gets a hub at its centre, joined to its outline vertices and to every
// vertex on its level that lies inside it or within 3 m of its edge
const pointIn = (x, z, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0; return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
let hubs = 0, hubLinks = 0;
const levelVerts = new Map(); V.forEach((v, i) => { if (!Number.isInteger(v.lv)) return; if (!levelVerts.has(v.lv)) levelVerts.set(v.lv, []); levelVerts.get(v.lv).push(i); });
for (const w of W) if (isArea(w)) {
  const lv = wayLevels(w)[0], ring = w.refs.map(r => local(nodes.get(r).lon, nodes.get(r).lat)), cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const hub = V.length; V.push({ x: cx, z: cz, lv, g: ground(cx, cz), id: 'area/' + w.id }); hubs++;
  const kind = (w.tags.railway === 'platform' || w.tags.public_transport === 'platform') ? 'platform' : w.tags.indoor ? 'indoor' : 'footway';
  for (const i of levelVerts.get(lv) || []) { const v = V[i]; if (v.x < x0 - 3 || v.x > x1 + 3 || v.z < z0 - 3 || v.z > z1 + 3) continue;
    let near = pointIn(v.x, v.z, ring); if (!near) for (let k = 1; k < ring.length && !near; k++) near = segD(v.x, v.z, ring[k - 1], ring[k]) <= 3;
    if (near) { edge(hub, i, kind); hubLinks++; } }
}

// nodes that ordinary ways reach at two different levels with no stair, escalator or lift: a mapping fault or an
// unmapped ramp. Joined as "ramp" so routes can pass, and counted.
const copies = new Map(); V.forEach((v, i) => { if (!copies.has(v.id)) copies.set(v.id, []); copies.get(v.id).push(i); });
for (const [id, list] of copies) { const whole = list.filter(i => Number.isInteger(V[i].lv)); if (whole.length < 2 || nodes.get(id).tags.highway === 'elevator') continue;
  const linked = new Set(E.filter(e => list.includes(e[0]) && list.includes(e[1])).flat());
  for (let i = 1; i < whole.length; i++) if (!linked.has(whole[i])) { edge(whole[0], whole[i], 'ramp'); faults.level_jumps.push(`node/${id}: levels ${V[whole[0]].lv} and ${V[whole[i]].lv}`); } }

// ---- TfL step-free topology (GTFS pathways): station points with a TfL level index, lifts and level paths. Each TfL
// street-level point (TfL level 0) joins the nearest OSM level-0 vertex within 35 m; points below or above the street
// connect only through TfL's own lifts and paths. TfL and OSM number levels differently (TfL counts step-free levels
// from the street), so the nearest-vertex level pairs are recorded per station for the audit.
const GZ = join(CW, 'data/raw/docklands/tfl-stationdata-gtfs.zip');
if (!existsSync(GZ)) writeFileSync(GZ, await get('https://api.tfl.gov.uk/stationdata/tfl-stationdata-gtfs.zip'));
const csv = f => { const [h, ...rows] = execFileSync('unzip', ['-p', GZ, f], { maxBuffer: 1 << 28 }).toString('utf8').split(/\r?\n/).filter(Boolean);
  const cols = h.split(','); return rows.map(r => { const out = []; let cur = '', q = false; for (const ch of r) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return Object.fromEntries(cols.map((c, i) => [c, out[i]])); }); };
const tStops = csv('stops.txt'), tPaths = csv('pathways.txt'), tStations = new Map(tStops.filter(s => s.location_type === '1').map(s => [s.stop_id, s.stop_name]));
const tNodes = tStops.filter(s => s.location_type === '3' && s.stop_lat && inB(+s.stop_lon, +s.stop_lat));
const tfl = { points: 0, joined: 0, lifts: 0, paths: 0, schemes: {} }, tV = new Map(), liftEdges = [];
const osmIx = V.map((_, i) => i).filter(i => typeof V[i].id !== 'string');
for (const s of tNodes) {
  const idx = +String(s.level_id).replace('L#', ''), [x, z] = local(+s.stop_lon, +s.stop_lat); let best = -1, bc = Infinity;
  // nearest OSM vertex (any level) for the scheme comparison; the join itself only where both give the same level, so a
  // route never jumps levels without a TfL lift or path. Inside its stations TfL's level is used.
  let same = -1, sd = 35;
  for (const i of osmIx) { const v = V[i], d = Math.hypot(v.x - x, v.z - z); if (d > 35) continue; const c = d + 10 * Math.abs(v.lv - idx); if (c < bc) { bc = c; best = i; } if (v.lv === idx && d < sd) { sd = d; same = i; } }
  const me = V.length; V.push({ x, z, lv: idx, g: ground(x, z), id: 'tfl:' + s.stop_id }); tV.set(s.stop_id, me); tfl.points++;
  // joined at street level only: both schemes call the street 0, but below or above it the same number can name
  // different floors (TfL -2 is the Jubilee platforms at Canary Wharf, OSM -2 the concourse above them)
  if (same >= 0 && idx === 0) { edge(me, same, 'indoor'); tfl.joined++; }
  if (best >= 0) { const st = tStations.get(s.parent_station) || s.parent_station, k = `TfL ${idx} -> OSM ${V[best].lv}`; tfl.schemes[st] ||= {}; tfl.schemes[st][k] = (tfl.schemes[st][k] || 0) + 1; }
}
for (const p of tPaths) { const a = tV.get(p.from_stop_id), b = tV.get(p.to_stop_id); if (a === undefined || b === undefined) continue;
  if (p.pathway_mode === '5') { liftEdges.push([E.length, (/-lift-(.+)$/.exec(p.pathway_id) || [])[1] || null]); edge(a, b, 'lift'); tfl.lifts++; } else { edge(a, b, V[a].lv === V[b].lv ? 'indoor' : 'ramp'); tfl.paths++; } }

// ---- places: named shops, amenities, platforms, entrances and stations, attached to the nearest vertex on their level
const PLACE = t => t.railway === 'subway_entrance' ? 'station entrance' : (t.public_transport === 'platform' || t.railway === 'platform') ? 'platform' : t.public_transport === 'station' || t.railway === 'station' ? 'station'
  : t.shop ? 'shop' : /^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream)$/.test(t.amenity || '') ? 'food and drink' : /^(cinema|theatre|arts_centre|nightclub|events_venue)$/.test(t.amenity || '') || t.leisure ? 'entertainment'
  : t.amenity === 'toilets' ? 'toilets' : t.amenity ? 'service' : t.entrance ? 'entrance' : t.highway === 'elevator' ? 'lift' : null;
const places = [], byLevel = new Map(); V.forEach((v, i) => { const k = Math.round(v.lv); if (!byLevel.has(k)) byLevel.set(k, []); byLevel.get(k).push(i); });
const nearIn = (cand, x, z, max) => { let best = -1, bd = max; for (const i of cand) { const d = Math.hypot(V[i].x - x, V[i].z - z); if (d < bd) { bd = d; best = i; } } return [best, Math.round(bd)]; };
// same level within 40 m; else the nearest vertex on any level within 40 m, marked approximate (the place's level has no mapped corridor there)
const nearest = (x, z, lv) => { const s = nearIn(byLevel.get(Math.round(lv)) || [], x, z, 40); if (s[0] >= 0) return [...s, 1]; const a = nearIn(V.map((_, i) => i), x, z, 40); return [...a, 0]; };
const centre = w => { const ps = w.refs.map(r => nodes.get(r)); return [ps.reduce((s, p) => s + p.lon, 0) / ps.length, ps.reduce((s, p) => s + p.lat, 0) / ps.length]; };
const seenP = new Set();
// TfL station points as places: the code names the point (EL EB = Elizabeth line eastbound platforms, BookJ = Jubilee ticket hall)
const TCODE = { 'EL EB': 'Elizabeth line eastbound platform', 'EL WB': 'Elizabeth line westbound platform', JubiE: 'Jubilee line eastbound platform', JubiW: 'Jubilee line westbound platform', BookJ: 'Jubilee line ticket hall', BH: 'Elizabeth line ticket hall', 'DLR-N': 'DLR northbound platform', 'DLR-S': 'DLR southbound platform', DLR_S: 'DLR southbound platform', CONC: 'DLR concourse', 'J Mez': 'Jubilee line mezzanine' };
for (const s of tNodes) { const st = tStations.get(s.parent_station) || s.parent_station, me = tV.get(s.stop_id); places.push([`${st}: ${TCODE[s.stop_name] || 'TfL point ' + s.stop_name}`, 'station point', V[me].lv, me, 'tfl:' + s.stop_id, 0, 1]); }
const addPlace = (osm, t, lon, lat) => {
  const kind = PLACE(t), name = t.name || (kind === 'platform' && (t.ref || t['local_ref']) ? `Platform ${t.ref || t.local_ref}` : null); if (!kind || !name) return;
  const L = parseLevels(t.level) || [0], [x, z] = local(lon, lat), [v, d, same] = nearest(x, z, L[0]); if (v < 0) return;
  const key = `${name}|${L[0]}|${Math.round(x / 10)}|${Math.round(z / 10)}`; if (seenP.has(key)) return; seenP.add(key);
  places.push([name, kind, L[0], v, osm, d, same]);
};
for (const [id, n] of nodes) addPlace(`node/${id}`, n.tags, n.lon, n.lat);
for (const w of ways) if (w.refs.every(r => nodes.has(r)) && (w.tags.railway === 'platform' || w.tags.public_transport === 'platform' || w.tags.shop || w.tags.amenity)) { const [lon, lat] = centre(w); addPlace(`way/${w.id}`, w.tags, lon, lat); }
// ---- islands (connected components)
const parent = V.map((_, i) => i), find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
for (const [a, b] of E) parent[find(a)] = find(b);
const comp = new Map(); V.forEach((_, i) => { const r = find(i); comp.set(r, (comp.get(r) || 0) + 1); });
const sizes = [...comp.values()].sort((a, b) => b - a), main = [...comp.entries()].sort((a, b) => b[1] - a[1])[0][0];
const below = V.map((v, i) => [v, i]).filter(([v]) => v.lv < 0), belowMain = below.filter(([, i]) => find(i) === main).length;
const placesOff = places.filter(p => find(p[3]) !== main).length, placesApprox = places.filter(p => !p[6]).length;

const r1 = v => Math.round(v * 10) / 10;
const out = {
  meta: { built: new Date().toISOString().slice(0, 10), box: BOX, kinds: KINDS, source: 'OpenStreetMap (ODbL), Greater London extract; ground from EA LiDAR', counts: { vertices: V.length, edges: E.length, places: places.length, lifts, area_hubs: hubs, area_links: hubLinks, tfl: { points: tfl.points, joined: tfl.joined, lifts: tfl.lifts, paths: tfl.paths }, levels: [...new Set(V.map(v => v.lv).filter(Number.isInteger))].sort((a, b) => a - b), by_kind: Object.fromEntries(KINDS.map((k, i) => [k, E.filter(e => e[2] === i).length])) },
    tfl_level_schemes: tfl.schemes, attribution: ['© OpenStreetMap contributors (ODbL)', 'Station step-free topology: Transport for London open data (Powered by TfL Open Data)'],
    islands: { count: sizes.length, largest: sizes[0], next: sizes.slice(1, 6), below_ground_vertices: below.length, below_ground_in_largest: belowMain, places_not_in_largest: placesOff, places_on_another_level: placesApprox },
    faults: { ...faults, unresolved_connector_ends: faults.unresolved_connector_ends.length, level_jumps: faults.level_jumps.length, examples: { unresolved: faults.unresolved_connector_ends.slice(0, 10), level_jumps: faults.level_jumps.slice(0, 10) } } },
  nodes: V.flatMap(v => [r1(v.x), r1(v.z), v.lv, r1(v.g)]), comp: V.map((_, i) => find(i) === main ? 1 : 0),
  edges: E.flat(), places, tfl_lifts: liftEdges,
};
writeFileSync(join(CW, 'docklands/data/indoor.js'), `// Generated by magpie/cwplans/tools/build-indoor.mjs on ${out.meta.built}. Do not edit by hand.\n// OpenStreetMap data © OpenStreetMap contributors, ODbL 1.0.\nglobalThis.DOCKLANDS_INDOOR = ${JSON.stringify(out)};\n`);
console.log(JSON.stringify(out.meta, null, 1));
