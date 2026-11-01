// Adapter from the existing DOCKLANDS_AREA encoding to the locale-independent city router.
// Roads q accumulate decimetres [x,z,y]; footprints p accumulate [x,z]. No second model fetch.
import { createCityRouter } from './city-route.js';
const cache = new WeakMap();
const decode = (q, stride) => {
  if (!q || q.length % stride || !Array.from(q).every(Number.isFinite)) throw Error('Unsupported model coordinate encoding');
  const acc = Array(stride).fill(0), values = [];
  for (let i = 0; i < q.length; i++) { acc[i % stride] += q[i]; values.push(acc[i % stride] / 10); }
  return values;
};
export function createModelCityRouter(area, { height_m = 8, ...options } = {}) {
  if (!area || !Array.isArray(area.lines) || !Array.isArray(area.buildings) || !area.meta?.extent) throw Error('City routes need model roads, buildings and bounds');
  if (!Number.isFinite(height_m) || height_m < 3 || height_m > 40) throw Error('City eye height must be 3 to 40 metres above the road');
  const cacheKey = JSON.stringify({ height_m, ...options });
  if (cache.get(area)?.cacheKey === cacheKey) return cache.get(area).router;
  const decodeStart = globalThis.performance?.now?.() ?? Date.now();
  const vertexCount = area.lines.reduce((n, l) => n + (l.k === 'road' && !l.tunnel ? (l.q?.length || 0) / 3 : 0), 0);
  if (vertexCount > (options.max_vertices ?? 100000) || area.buildings.length > (options.max_buildings ?? 100000) || area.buildings.reduce((n, b) => n + (b.p?.length || 0) / 2, 0) > 2000000) throw Error('City model geometry budget exceeded');
  const roads = [];
  for (const line of area.lines) {
    if (line.k !== 'road' || line.tunnel) continue;
    if (!line.q) throw Error('Unsupported open-road geometry');
    const q = decode(line.q, 3), points = [];
    for (let i = 0; i < q.length; i += 3) points.push([q[i], q[i + 2] + height_m, q[i + 1]]);
    roads.push(points);
  }
  const buildings = area.buildings.map((building, id) => {
    const q = decode(building.p, 2), count = q.length / 2, starts = [0, ...(building.holes || []), count];
    if (starts.some((v, i) => !Number.isInteger(v) || v < 0 || v > count || (i && v < starts[i - 1]))) throw Error('Unsupported footprint holes');
    const rings = [];
    for (let r = 1; r < starts.length; r++) { const ring = []; for (let i = starts[r - 1]; i < starts[r]; i++) ring.push([q[2 * i], q[2 * i + 1]]); rings.push(ring); }
    return { id, rings, minY: building.b + (building.mh || 0), maxY: building.b + building.h };
  });
  const decode_ms = (globalThis.performance?.now?.() ?? Date.now()) - decodeStart;
  const router = createCityRouter({ roads, buildings }, { ...options, bounds: area.meta.extent });
  router.stats.decode_ms = decode_ms; router.stats.build_ms += decode_ms;
  router.stats.road_height_m = height_m;
  router.stats.road_lines = roads.length;
  router.stats.model_built = area.meta.built ?? null;
  router.stats.geometry_scope = 'loaded-detailed-model';
  // One cached option variant per model limits retained graph/grid memory on phones.
  cache.set(area, { cacheKey, router });
  return router;
}
