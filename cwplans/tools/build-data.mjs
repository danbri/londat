#!/usr/bin/env node
// Build cwplans/data/cwplans-data.js from the raw files that fetch-raw.mjs downloads.
//   node cwplans/tools/fetch-raw.mjs   (once; LiDAR and the OSTN15 grid are not committed)
//   node cwplans/tools/build-data.mjs
// Output is plain data in local metres: x = E - E0, z = -(N - N0), y = metres above Ordnance Datum Newlyn.
// What each field means, where it came from and how far to trust it: cwplans/README.md.
import { readFileSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bngProjector, mosaic, r1, pct, min, polyArea, clipRing as clipRingBox, cellsIn, mesh, joinRings as joinNodeRings, applyControls } from './lib.mjs';
import { BBOX_BNG } from './fetch-raw.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, '..', 'data', 'raw');
const OUT = join(HERE, '..', 'data', 'cwplans-data.js');
const E0 = 535400, N0 = 179400;           // local origin, ~80 m south-west of Canada Water station
const TERRAIN_CELL = 10;                   // metres per terrain grid cell

// ---- coordinates: WGS84 -> BNG through the OS OSTN15 grid (Helmert alone is ~1.8 m out here)
const toBNG = await bngProjector();
const toLocal = (lon, lat) => { const [e, n] = toBNG(lon, lat); return [e - E0, -(n - N0)]; };

// ---- LiDAR rasters (EA composite, 1 m, BNG, metres above ODN); at(R, x, z) in local metres, null outside
const DTM = await mosaic([join(RAW, 'dtm.tif')]), DSM = await mosaic([join(RAW, 'dsm.tif')]);
const at = (R, x, z) => R.at(x + E0, N0 - z);
function win(R, x, z, rad, pick) { const v = []; for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) { const s = at(R, x + dx, z + dz); if (s !== null) v.push(s); } return v.length ? pick(v) : null; }
const X0 = BBOX_BNG.e0 - E0, X1 = BBOX_BNG.e1 - E0, Z0 = -(BBOX_BNG.n1 - N0), Z1 = -(BBOX_BNG.n0 - N0);
const inside = (x, z, m = 0) => x >= X0 + m && x <= X1 - m && z >= Z0 + m && z <= Z1 - m;

// ---- terrain: 10 m block medians of the DTM (medians drop the odd excavation pit or bad return)
const nx = Math.round((X1 - X0) / TERRAIN_CELL), nz = Math.round((Z1 - Z0) / TERRAIN_CELL);
const terrainDm = [];
for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
  const x = Math.min(X1 - 1, X0 + i * TERRAIN_CELL), z = Math.min(Z1 - 1, Z0 + j * TERRAIN_CELL);
  terrainDm.push(Math.round(win(DTM, x, z, 3, v => pct(v, .5)) * 10));
}

// ---- OSM
const osm = JSON.parse(gunzipSync(readFileSync(join(RAW, 'osm-map.json.gz'))));
const nodes = new Map(), ways = new Map(), rels = [];
// plus the full member lists of water multipolygons that cross the box (fetch-raw.mjs osm)
const waterFull = JSON.parse(gunzipSync(readFileSync(join(RAW, 'osm-water-full.json.gz'))));
const relById = new Map();
for (const e of [...osm.elements, ...waterFull.elements]) {
  if (e.type === 'node') nodes.set(e.id, e); else if (e.type === 'way') ways.set(e.id, e); else relById.set(e.id, e);
}
rels.push(...relById.values());
const nodeXZ = new Map();
const xz = id => { let p = nodeXZ.get(id); if (!p) { const n = nodes.get(id); p = toLocal(n.lon, n.lat); nodeXZ.set(id, p); } return p; };

// Join member ways into closed rings (node-id chains); null if any ring stays open or a way is missing.
const joinRings = wayIds => joinNodeRings(wayIds.map(id => ways.get(id)?.nodes));
// clip a ring (array of [x,z]) to the study box
const clipRing = ring => clipRingBox(ring, { x0: X0, x1: X1, z0: Z0, z1: Z1 });
const ringsOf = el => {
  if (el.type === 'way') return el.nodes[0] === el.nodes.at(-1) ? [el.nodes] : null;
  const outer = joinRings(el.members.filter(m => m.type === 'way' && m.role !== 'inner').map(m => m.ref));
  const inner = joinRings(el.members.filter(m => m.type === 'way' && m.role === 'inner').map(m => m.ref));
  return outer && inner && outer.length === 1 ? [outer[0], ...inner] : null;   // single-outer multipolygons only
};

// ---- buildings: footprint from OSM, height from LiDAR (DSM - DTM), OSM levels as fallback
const SRC = { lidar: 0, levels: 1, tag: 2, guess: 3, newer: 4 };
const buildings = [], bstat = { lidar: 0, levels: 0, tag: 0, guess: 0, newer: 0, skipped: 0 };
for (const el of [...ways.values(), ...rels]) {
  const t = el.tags; if (!t || !t.building || t.building === 'no') continue;
  const ids = ringsOf(el); if (!ids) { bstat.skipped++; continue; }
  let rings = ids.map(r => r.map(xz));
  const c = rings[0].reduce((s, p) => [s[0] + p[0] / rings[0].length, s[1] + p[1] / rings[0].length], [0, 0]);
  if (!inside(c[0], c[1], 2)) continue;
  rings = rings.map(clipRing).filter(Boolean); if (!rings.length) continue;
  const cells = cellsIn(rings);
  const ground = cells.length ? pct(cells.map(([x, z]) => at(DTM, x, z)), .5) : at(DTM, c[0], c[1]);
  const lidarH = cells.length >= 6 ? pct(cells.map(([x, z]) => at(DSM, x, z) - at(DTM, x, z)), .9) : null;
  const levels = parseFloat(t['building:levels']), tagH = parseFloat(t.height);
  let h, s;
  if (isFinite(tagH)) { h = tagH; s = 'tag'; }
  else if (lidarH !== null && lidarH >= 2 && !(isFinite(levels) && lidarH < levels * 3 * .5)) { h = lidarH; s = 'lidar'; }
  else if (isFinite(levels)) { h = levels * 3 + 1; s = lidarH !== null && lidarH >= 2 ? 'newer' : 'levels'; }   // 'newer': LiDAR pass predates the building
  else if (lidarH !== null && lidarH >= 2) { h = lidarH; s = 'lidar'; }
  else { h = t.building === 'construction' ? 0 : 6; s = 'guess'; }
  if (h <= 0) continue;
  const m = mesh(rings); if (!m) { bstat.skipped++; continue; }
  bstat[s]++;
  buildings.push({ ...m, b: r1(ground), h: r1(h), s: SRC[s] });
}

// ---- water: closed natural=water / dock / basin ways and complete single-outer multipolygons
const water = [];
for (const el of [...ways.values(), ...rels]) {
  const t = el.tags; if (!t || !(t.natural === 'water' || t.waterway === 'dock' || t.landuse === 'basin')) continue;
  if (el.type === 'way' && rels.some(r => r.members?.some(m => m.ref === el.id && m.type === 'way' && r.tags?.natural === 'water'))) continue;
  const ids = ringsOf(el); if (!ids) continue;
  const rings = ids.map(r => clipRing(r.map(xz))).filter(Boolean); if (!rings.length || Math.abs(polyArea(rings[0])) < 50) continue;
  const cells = cellsIn(rings).filter((_, i) => i % 7 === 0);
  const m = mesh(rings); if (!m || !cells.length) continue;
  water.push({ ...m, level: r1(pct(cells.map(([x, z]) => at(DTM, x, z)), .25)), ...(t.name ? { n: t.name } : {}), ...(t.tidal === 'yes' ? { tidal: 1 } : {}) });
}

// ---- railways: track level from LiDAR where the track is open; tunnels carry distance-to-portal for the page's depth model
const RAIL = new Set(['rail', 'subway', 'light_rail']);
const railWays = [...ways.values()].filter(w => w.tags && RAIL.has(w.tags.railway));
const isTunnel = w => w.tags.tunnel && w.tags.tunnel !== 'no';
const isBridge = w => w.tags.bridge && w.tags.bridge !== 'no';
const openLevel = (w, x, z) => isBridge(w) ? win(DSM, x, z, 1, min) : win(DTM, x, z, 1, min);
// Portals: tunnel-way nodes shared with an open railway way. Level = open track level at that node.
const tunnelWays = railWays.filter(isTunnel);
const portals = new Map();
for (const w of railWays) if (!isTunnel(w)) for (const id of w.nodes) {
  if (tunnelWays.some(u => u.nodes.includes(id))) { const [x, z] = xz(id), lv = openLevel(w, x, z); if (lv !== null) portals.set(id, r1(lv)); }
}
// Tunnel chains: walk the tunnel graph between end nodes (portals, dead ends at the box edge, junctions).
// The page models each chain's level from its two ends; see README "Tunnel model".
const adj = new Map();
for (const w of tunnelWays) for (let i = 1; i < w.nodes.length; i++) {
  const a = w.nodes[i - 1], b = w.nodes[i];
  for (const [p, q] of [[a, b], [b, a]]) { if (!adj.has(p)) adj.set(p, []); adj.get(p).push([q, w]); }
}
const isEnd = id => portals.has(id) || adj.get(id).length !== 2;
const used = new Set(), chains = [];
const edgeKey = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;
for (const startId of adj.keys()) if (isEnd(startId)) for (const [first, w0] of adj.get(startId)) {
  if (used.has(edgeKey(startId, first))) continue;
  const ids = [startId], wayList = [w0]; let prev = startId, cur = first;
  used.add(edgeKey(prev, cur));
  while (true) {
    ids.push(cur);
    if (isEnd(cur)) break;
    const nxt = adj.get(cur).find(([q]) => q !== prev && !used.has(edgeKey(cur, q)));
    if (!nxt) break;
    used.add(edgeKey(cur, nxt[0])); if (!wayList.includes(nxt[1])) wayList.push(nxt[1]);
    prev = cur; cur = nxt[0];
  }
  chains.push({ ids, wayList });
}
const rail = [];
function densify(ids, level) {   // points <= 10 m apart; each [x, z, ground, s(m from start), (open) track level]
  const out = []; let s = 0;
  ids.forEach((id, i) => {
    const [x, z] = xz(id);
    if (i) {
      const [px, pz] = xz(ids[i - 1]), L = Math.hypot(x - px, z - pz), k = Math.ceil(L / 10);
      for (let j = 1; j < k; j++) { const f = j / k; out.push([px + f * (x - px), pz + f * (z - pz), s + f * L]); }
      s += L;
    }
    out.push([x, z, s]);
  });
  return out.filter(([x, z]) => at(DTM, x, z) !== null).map(([x, z, d]) => level ? [r1(x), r1(z), r1(at(DTM, x, z)), r1(level(x, z))]
    : [r1(x), r1(z), r1(at(DTM, x, z)), r1(d), openCut(x, z)]);
}
// A tunnel-tagged point where the LiDAR ground is > 6 m below the ground 25-35 m around it is in an open
// cut or shaft (Rotherhithe station, Wapping): the DTM there is the track bed, so it is a measured level.
function openCut(x, z) {
  const bed = win(DTM, x, z, 1, min), ring = [];
  for (let k = 0; k < 24; k++) { const a = k / 24 * 2 * Math.PI, rr = k % 2 ? 25 : 35, v = at(DTM, x + rr * Math.cos(a), z + rr * Math.sin(a)); if (v !== null) ring.push(v); }
  return ring.length > 12 && pct(ring, .4) - bed > 6 ? r1(bed) : null;
}
for (const { ids, wayList } of chains) {
  const t = wayList[0].tags, pts = densify(ids);
  if (pts.length < 2) continue;
  // In a narrow cut the LiDAR also hits walls and platforms: each run of cut points (gaps < 30 m) takes its lowest bed.
  for (let i = 0; i < pts.length; i++) if (pts[i][4] != null) {
    let j = i; while (j + 1 < pts.length && pts[j + 1][4] != null && pts[j + 1][3] - pts[j][3] < 30) j++;
    const lo = Math.min(...pts.slice(i, j + 1).map(p => p[4])); for (let k = i; k <= j; k++) pts[k][4] = lo; i = j;
  }
  rail.push({
    kind: t.railway, name: [...new Set(wayList.map(w => w.tags.name).filter(Boolean))].join(' / '), layer: Math.min(...wayList.map(w => +w.tags.layer || 0)),
    tunnel: 1, track: t['railway:track_ref'] || '', osm: wayList.map(w => w.id), len: r1(ids.reduce((L, id, i) => i ? L + Math.hypot(xz(id)[0] - xz(ids[i - 1])[0], xz(id)[1] - xz(ids[i - 1])[1]) : 0, 0)),
    ends: [portals.get(ids[0]) ?? null, portals.get(ids.at(-1)) ?? null], pts,
  });
}
for (const w of railWays) if (!isTunnel(w)) {
  const t = w.tags, pts = densify(w.nodes, (x, z) => openLevel(w, x, z));
  if (pts.length < 2) continue;
  rail.push({
    kind: t.railway, name: t.name || '', layer: +t.layer || 0, tunnel: 0, bridge: isBridge(w) ? 1 : 0, cutting: t.cutting && t.cutting !== 'no' ? 1 : 0,
    track: t['railway:track_ref'] || '', osm: [w.id], pts,
  });
}

// ---- published levels (data/sourced-levels.json) as extra tunnel controls
const sourced = applyControls(rail, join(HERE, '..', 'data', 'sourced-levels.json'), toLocal, (x, z) => win(DTM, x, z, 3, v => pct(v, .5)));

// ---- roads: open carriageways only, at LiDAR level (bridges from the DSM)
const ROADS = { motorway: 1, trunk: 1, primary: 1, secondary: 1, tertiary: 2, unclassified: 3, residential: 3 };
const roads = [];
for (const w of ways.values()) {
  const t = w.tags; if (!t || !ROADS[t.highway] || (t.tunnel && t.tunnel !== 'no')) continue;
  const pts = w.nodes.map(xz).filter(([x, z]) => inside(x, z)).map(([x, z]) => [r1(x), r1(z), r1(isBridge(w) ? win(DSM, x, z, 1, min) : at(DTM, x, z))]);
  if (pts.length >= 2) roads.push({ c: ROADS[t.highway], pts });
}

// ---- places: OSM stations, then Wikidata items of transport, water and landform classes
const places = [];
for (const n of nodes.values()) {
  const t = n.tags; if (!t || t.railway !== 'station') continue;
  const [x, z] = toLocal(n.lon, n.lat); if (!inside(x, z)) continue;
  places.push({ kind: 'station', name: t.name, x: r1(x), z: r1(z), y: r1(at(DTM, x, z)), wd: t.wikidata || null, osm: `node/${n.id}` });
}
const KEEP = new Set(['railway station', 'underground railway station', 'London Underground station', 'station located in a cut', 'underground station',
  'railway tunnel', 'tunnel portal', 'ventilation shaft', 'railway junction', 'railway line', 'dock', 'body of water', 'lock', 'artificial hill',
  'engine house', 'bascule bridge', 'road bridge', 'swing bridge', 'park', 'urban park', 'independent museum', 'area of London']);
const wdFacts = new Map();
for (const b of JSON.parse(readFileSync(join(RAW, 'wikidata-facts.json'))).results.bindings) {
  const q = b.item.value.split('/').pop(), p = b.propLabel.value, v = (b.valLabel || b.val).value + (b.unitLabel ? ' ' + b.unitLabel.value : '');
  if (['adjacent station', 'connecting service', 'instance of'].includes(p)) continue;
  if (!wdFacts.has(q)) wdFacts.set(q, {});
  const f = wdFacts.get(q); f[p] = [...new Set([...(f[p] || []), v.replace(/T00:00:00Z$/, '')])];
}
const wdSeen = new Map();
for (const b of JSON.parse(readFileSync(join(RAW, 'wikidata-around.json'))).results.bindings) {
  const q = b.item.value.split('/').pop();
  if (!wdSeen.has(q)) wdSeen.set(q, { q, label: b.itemLabel?.value, desc: b.itemDescription?.value || '', coord: b.coord.value, classes: new Set(), article: b.article?.value || null });
  if (b.classLabel) wdSeen.get(q).classes.add(b.classLabel.value);
}
const stationWd = new Set(places.map(p => p.wd).filter(Boolean));
for (const it of wdSeen.values()) {
  const cls = [...it.classes]; if (!cls.some(c => KEEP.has(c)) || stationWd.has(it.q) || /^Q\d+$/.test(it.label)) continue;
  const [lon, lat] = it.coord.match(/-?[\d.]+/g).map(Number), [x, z] = toLocal(lon, lat); if (!inside(x, z)) continue;
  places.push({ kind: 'wikidata', name: it.label, desc: it.desc, cls, x: r1(x), z: r1(z), y: r1(at(DTM, x, z)), wd: it.q, ...(it.article ? { wp: it.article } : {}) });
}
for (const p of places) if (p.wd && wdFacts.has(p.wd)) p.facts = wdFacts.get(p.wd);

const data = {
  meta: {
    built: new Date().toISOString().slice(0, 10),
    origin: { crs: 'EPSG:27700', E0, N0, note: 'x = E - E0, z = -(N - N0) (north is -z), y = metres above ODN' },
    extent: { x0: X0, x1: X1, z0: Z0, z1: Z1 },
    sources: [
      { id: 'osm', text: '© OpenStreetMap contributors, ODbL 1.0', url: 'https://www.openstreetmap.org/copyright' },
      { id: 'lidar', text: 'Environment Agency LiDAR Composite DTM and First Return DSM, 1 m. © Environment Agency copyright and/or database right. Open Government Licence v3.0', url: 'https://environment.data.gov.uk/dataset/13787b9a-26a4-4775-8523-806d13af58fc' },
      { id: 'wikidata', text: 'Wikidata, CC0', url: 'https://www.wikidata.org/' },
      { id: 'ostn15', text: 'OSTN15 transformation, © Ordnance Survey (free to use)', url: 'https://www.ordnancesurvey.co.uk/business-government/tools-support/os-net/for-developers' },
    ],
    buildingHeightSources: Object.keys(SRC), buildingStats: bstat, sourced,
  },
  terrain: { cell: TERRAIN_CELL, nx: nx + 1, nz: nz + 1, x0: X0, z0: Z0, dm: terrainDm },
  water, buildings, rail, roads, places,
};
const js = `// Generated by cwplans/tools/build-data.mjs on ${data.meta.built}. Do not edit by hand.\n` +
  `// Sources and licences: see meta.sources and cwplans/README.md.\nglobalThis.CWPLANS_DATA = ${JSON.stringify(data)};\n`;
writeFileSync(OUT, js);
console.log(`wrote ${OUT}: ${(js.length / 1024).toFixed(0)} KB`);
console.log(`terrain ${nx + 1}x${nz + 1}, water ${water.length}, buildings ${buildings.length} ${JSON.stringify(bstat)}, rail ${rail.length} (tunnel chains ${rail.filter(r => r.tunnel).length}, open-cut points ${rail.filter(r => r.tunnel).reduce((n, r) => n + r.pts.filter(p => p[4] != null).length, 0)}), portals ${portals.size}, roads ${roads.length}, places ${places.length}`);
