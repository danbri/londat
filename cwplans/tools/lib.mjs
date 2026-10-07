// Shared pieces for the cwplans data tools: HTTP, coordinates (OSTN15), LiDAR rasters, polygon helpers.
// Shared helpers imported by most tools in cwplans/tools (pipeline.json "libraries"). README: cwplans/docklands/README.md.
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import proj4 from 'proj4';
import { fromArrayBuffer, fromFile } from 'geotiff';
import earcut from 'earcut';

export const TOOLS = dirname(fileURLToPath(import.meta.url));
export const RAW = join(TOOLS, '..', 'data', 'raw');
export const UA = 'glitchcan-cwplans/0.1 (https://github.com/danbri/londat)';

export async function get(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
// Wikidata through QLever: one POST per query, paced by us (at least minGapMs between calls, one call at a time) and
// retried with a growing pause on 429 or 5xx, so we never lean on the service. Prefer one well-posed query (VALUES
// over all ids, qualifiers in the same pattern) to many small ones.
export const QLEVER = 'https://qlever.dev/api/wikidata';
export const WD_PREFIX = ['wd: <http://www.wikidata.org/entity/>', 'wdt: <http://www.wikidata.org/prop/direct/>', 'p: <http://www.wikidata.org/prop/>',
  'ps: <http://www.wikidata.org/prop/statement/>', 'pq: <http://www.wikidata.org/prop/qualifier/>', 'rdfs: <http://www.w3.org/2000/01/rdf-schema#>'].map(x => 'PREFIX ' + x).join('\n');
let qlChain = Promise.resolve(), qlLast = 0;
export function qlever(query, { minGapMs = 1500, tries = 5 } = {}) {
  const run = async () => {
    for (let k = 1; ; k++) {
      const wait = qlLast + minGapMs - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
      qlLast = Date.now();
      const r = await fetch(QLEVER, { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ query: WD_PREFIX + '\n' + query }) });
      if (r.ok) return (await r.json()).results.bindings;
      if (k >= tries || !(r.status === 429 || r.status >= 500)) throw new Error(`QLever ${r.status}: ${(await r.text()).slice(0, 300)}`);
      await new Promise(res => setTimeout(res, minGapMs * 2 ** k));
    }
  };
  const p = qlChain.then(run, run); qlChain = p.catch(() => {}); return p;
}
export const sparql = q => get('https://query.wikidata.org/sparql', {
  method: 'POST', body: new URLSearchParams({ query: q }),
  headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
});

// ---- Environment Agency LiDAR composite (1 m, BNG, metres above ODN), open WCS
const EA = 'https://environment.data.gov.uk/spatialdata';
export const LIDAR = {
  dtm: [`${EA}/lidar-composite-digital-terrain-model-dtm-1m/wcs`, '13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m'],
  dsm: [`${EA}/lidar-composite-digital-surface-model-first-return-dsm-1m/wcs`, 'df4e3ec3-315e-48aa-aaaf-b5ae74d7b2bb__Lidar_Composite_Elevation_FZ_DSM_1m'],
};
export const wcsUrl = (name, e0, e1, n0, n1) => {
  const [wcs, id] = LIDAR[name];
  return `${wcs}?service=WCS&version=2.0.1&request=GetCoverage&CoverageId=${id}&format=image/tiff&subset=E(${e0},${e1})&subset=N(${n0},${n1})`;
};

// ---- WGS84 -> BNG through the OS OSTN15 grid (a Helmert transform is ~1.8 m out in this area)
export const GRID = join(RAW, 'uk_os_OSTN15_NTv2_OSGBtoETRS.tif');
export async function bngProjector() {
  if (!existsSync(GRID)) throw new Error(`missing ${GRID}: run node cwplans/tools/fetch-raw.mjs grid`);
  const b = readFileSync(GRID);
  await proj4.nadgrid('ostn15', await fromArrayBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))).ready;
  proj4.defs('BNG', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +units=m +no_defs +nadgrids=ostn15');
  const p = proj4('EPSG:4326', 'BNG');
  return (lon, lat) => p.forward([lon, lat]);
}

// ---- 1 m rasters as a mosaic of tiles. at(E, N) in BNG metres; null outside every tile.
export async function mosaic(files) {
  const tiles = [];
  for (const f of files) {
    const im = await (await fromFile(f)).getImage();
    const [ox, oy] = im.getOrigin();
    tiles.push({ a: (await im.readRasters())[0], w: im.getWidth(), h: im.getHeight(), ox, oy });
  }
  let last = tiles[0];
  const at = (E, N) => {
    for (const t of [last, ...tiles]) {
      if (!t) break;
      const c = Math.floor(E - t.ox), r = Math.floor(t.oy - N);
      if (c >= 0 && r >= 0 && c < t.w && r < t.h) { last = t; return t.a[r * t.w + c]; }
    }
    return null;
  };
  return { at, tiles };
}

// ---- small numeric helpers
export const r1 = v => Math.round(v * 10) / 10;
export const pct = (v, p) => { const s = Float64Array.from(v).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
export const min = v => { let m = Infinity; for (const x of v) if (x < m) m = x; return m; };

// ---- polygons: rings are arrays of [x, z]
export function polyArea(r) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export function pointIn(p, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
// Sutherland-Hodgman clip of a ring to an axis-aligned box {x0,x1,z0,z1}
export function clipRing(ring, B) {
  const edges = [[p => p[0] >= B.x0, B.x0, 0], [p => p[0] <= B.x1, B.x1, 0], [p => p[1] >= B.z0, B.z0, 1], [p => p[1] <= B.z1, B.z1, 1]];
  let out = ring;
  for (const [ins, v, axis] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = src[(i + 1) % src.length], ia = ins(a), ib = ins(b);
      if (ia) out.push(a);
      if (ia !== ib) { const t = (v - a[axis]) / (b[axis] - a[axis]); out.push(axis ? [a[0] + t * (b[0] - a[0]), v] : [v, a[1] + t * (b[1] - a[1])]); }
    }
    if (out.length < 3) return null;
  }
  return out;
}
// centres of the 1 m cells (step m) inside the outer ring and outside every hole
export function cellsIn(rings, step = 1) {
  const [outer, ...holes] = rings, out = [];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of outer) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  for (let z = Math.floor(z0) + step / 2; z < z1; z += step) for (let x = Math.floor(x0) + step / 2; x < x1; x += step)
    if (pointIn([x, z], outer) && !holes.some(h => pointIn([x, z], h))) out.push([x, z]);
  return out;
}
// Flatten rings for the page: {p: flat x,z (0.1 m), holes: start indices, t: triangle indices}
export function mesh(rings) {
  rings = rings.map((r, k) => { r = r.at(-1)[0] === r[0][0] && r.at(-1)[1] === r[0][1] ? r.slice(0, -1) : r; const ccw = polyArea(r) > 0; return (k === 0) === ccw ? r : [...r].reverse(); });
  const p = [], holes = [];
  rings.forEach((r, k) => { if (k) holes.push(p.length / 2); for (const q of r) p.push(r1(q[0]), r1(q[1])); });
  const t = earcut(p, holes.length ? holes : undefined, 2);
  return t.length ? { p, holes, t } : null;
}
// Join way node-id lists into closed rings; null if a ring stays open or a way is missing
export function joinRings(wayNodeLists) {
  if (wayNodeLists.some(a => !a)) return null;
  const segs = wayNodeLists.map(a => [...a]), rings = [];
  while (segs.length) {
    let ring = segs.shift();
    while (ring[0] !== ring.at(-1)) {
      const k = segs.findIndex(s => s[0] === ring.at(-1) || s.at(-1) === ring.at(-1));
      if (k < 0) return null;
      const s = segs.splice(k, 1)[0];
      ring = ring.concat((s[0] === ring.at(-1) ? s : s.reverse()).slice(1));
    }
    rings.push(ring);
  }
  return rings;
}
// Douglas-Peucker for polylines of [x, z]; a closed ring is split at its farthest point first
export function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const [f, l] = [pts[0], pts.at(-1)];
  if (f[0] === l[0] && f[1] === l[1]) {
    let k = 1, d = -1; for (let i = 1; i < pts.length - 1; i++) { const e = Math.hypot(pts[i][0] - f[0], pts[i][1] - f[1]); if (e > d) { d = e; k = i; } }
    return [...simplifyOpen(pts.slice(0, k + 1), tol).slice(0, -1), ...simplifyOpen(pts.slice(k), tol)];
  }
  return simplifyOpen(pts, tol);
}
function simplifyOpen(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let best = -1, bd = tol;
    const [ax, az] = pts[a], [bx, bz] = pts[b], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L; if (d > bd) { bd = d; best = i; } }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// Compact polygon/line encoding for the pages: whole decimetres, each point relative to the previous one.
// enc([x0,z0,x1,z1,...]) -> [X0,Z0,dX1,dZ1,...]; the page undoes it with a running sum / 10.
export function enc(flat, stride = 2) {
  const out = new Array(flat.length), prev = new Array(stride).fill(0);
  for (let i = 0; i < flat.length; i++) { const k = i % stride, v = Math.round(flat[i] * 10); out[i] = v - prev[k]; prev[k] = v; }
  return out;
}
// polygon for the page: {p: enc rings, holes?: start indices} (triangulated in the browser with earcut)
export function poly(rings) {
  const m = mesh(rings); if (!m) return null;
  return { p: enc(m.p), ...(m.holes.length ? { holes: m.holes } : {}) };
}
// Published levels (data/sourced-levels.json) as tunnel controls. For each control, the nearest point within
// 150 m of the station on every tunnel chain of that line and kind gets an entry in chain.src: [s, level OD, id].
// lines: [{kind|k, name, tunnel, pts: [[x, z, ground, s, cut], ...]}]; ground(x, z) gives the LiDAR ground.
export function applyControls(lines, file, toLocal, ground) {
  const { controls } = JSON.parse(readFileSync(file, 'utf8')), used = [];
  for (const c of controls) {
    if (c.superseded_by) continue;   // kept in the file as evidence, not applied
    const [cx, cz] = toLocal(c.lon, c.lat), g = ground(cx, cz);
    const level = c.level.od ?? (g === null ? null : g - c.level.below_ground);
    if (level === null) continue;
    let n = 0;
    for (const l of lines) {
      if (!l.tunnel || !c.kinds.includes(l.kind ?? l.k) || !new RegExp(c.line, 'i').test(l.name || '')) continue;
      let best = null;
      for (const p of l.pts) { const d = Math.hypot(p[0] - cx, p[1] - cz); if (d < 150 && (!best || d < best.d)) best = { d, s: p[3] }; }
      if (best) { (l.src ||= []).push([best.s, Math.round(level * 100) / 100, c.id]); n++; }
    }
    if (n) used.push({ id: c.id, place: c.place, what: c.what, level: Math.round(level * 100) / 100, ground: g === null ? null : r1(g), x: r1(cx), z: r1(cz), chains: n, source: c.source, quote: c.quote });
  }
  return used;
}
