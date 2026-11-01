// Outdoor city routes on a supplied 3D road graph. Coordinates are [x, y, z] in model metres.
// Clearance covers static extruded building footprints and optional model bounds, not arbitrary scene meshes.
const EPS = 1e-8;
const MAX_MODEL_METRES = 1e7; // Numeric domain for local city models, not a geographic extent.
const now = () => globalThis.performance?.now?.() ?? Date.now();
const finitePoint = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const supportedPoint = p => finitePoint(p) && p.every(v => Math.abs(v) <= MAX_MODEL_METRES);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const safeIndex = n => Number.isSafeInteger(n) && Math.abs(n) < Number.MAX_SAFE_INTEGER - 2;
const smooth = t => t * t * t * (t * (t * 6 - 15) + 10);
function project(p, a, b) {
  const v = b.map((x, i) => x - a[i]), d = v.reduce((s, x) => s + x * x, 0);
  const t = d ? clamp(v.reduce((s, x, i) => s + x * (p[i] - a[i]), 0) / d) : 0;
  const point = lerp(a, b, t); return { point, t, distance: distance(p, point) };
}
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
const inFootprint = (p, rings) => inRing(p, rings[0]) && !rings.slice(1).some(r => inRing(p, r));
function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
  const t = length2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length2) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
}
function segmentsDistance(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS)) && ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS))) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}
function intersectsPrism(a, b, prism, radius) {
  // Restrict to the segment's vertical overlap with the inflated prism, then test its continuous horizontal trace.
  const low = prism.minY - radius, high = prism.maxY + radius, dy = b[1] - a[1];
  let t0 = 0, t1 = 1;
  if (Math.abs(dy) < EPS) { if (a[1] < low || a[1] > high) return false; }
  else { const v0 = (low - a[1]) / dy, v1 = (high - a[1]) / dy; t0 = Math.max(0, Math.min(v0, v1)); t1 = Math.min(1, Math.max(v0, v1)); if (t0 > t1) return false; }
  const p = lerp(a, b, t0), q = lerp(a, b, t1), pa = [p[0], p[2]], pb = [q[0], q[2]];
  if (inFootprint(pa, prism.rings) || inFootprint(pb, prism.rings)) return true;
  for (const ring of prism.rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if (segmentsDistance(pa, pb, ring[j], ring[i]) <= radius + EPS) return true;
  return false;
}
export function createPrismClearance(buildings, { clearance_m = 2, bounds = null, cell_m = 50, max_grid_entries = 2000000, max_query_cells = 100000 } = {}) {
  if (!Number.isFinite(clearance_m) || clearance_m < 0 || clearance_m > 20 || !Number.isFinite(cell_m) || cell_m <= 0 || !Number.isInteger(max_grid_entries) || max_grid_entries < 1 || !Number.isInteger(max_query_cells) || max_query_cells < 1) throw Error('Clearance and grid cell must be finite nonnegative/positive metres');
  if (bounds && (![bounds.x0, bounds.x1, bounds.z0, bounds.z1].every(v => Number.isFinite(v) && Math.abs(v) <= MAX_MODEL_METRES) || bounds.x0 >= bounds.x1 || bounds.z0 >= bounds.z1)) throw Error('Finite ordered model bounds required');
  if (bounds) bounds = { ...bounds };
  const gridBox = (x0, x1, z0, z1) => {
    const box = { x0: Math.floor(x0 / cell_m), x1: Math.floor(x1 / cell_m), z0: Math.floor(z0 / cell_m), z1: Math.floor(z1 / cell_m) };
    if (!Object.values(box).every(safeIndex)) return null;
    box.cells = (box.x1 - box.x0 + 1) * (box.z1 - box.z0 + 1);
    return Number.isSafeInteger(box.cells) && box.cells > 0 ? box : null;
  };
  const grid = new Map(), prisms = []; let gridEntries = 0;
  for (const building of buildings) {
    const { rings, minY, maxY } = building;
    if (!Array.isArray(rings) || !rings.length || rings.some(r => !Array.isArray(r) || r.length < 3 || r.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(v => Number.isFinite(v) && Math.abs(v) <= MAX_MODEL_METRES))) || !Number.isFinite(minY) || !Number.isFinite(maxY) || Math.abs(minY) > MAX_MODEL_METRES || Math.abs(maxY) > MAX_MODEL_METRES || maxY < minY) throw Error('Invalid or unsupported building prism');
    const xs = rings[0].map(p => p[0]), zs = rings[0].map(p => p[1]);
    const prism = { ...building, rings: rings.map(r => r.map(p => p.slice())), x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }; prisms.push(prism);
    const box = gridBox(prism.x0, prism.x1, prism.z0, prism.z1);
    if (!box || gridEntries + box.cells > max_grid_entries) throw Error('Building grid coordinates or budget unsupported');
    gridEntries += box.cells;
    for (let x = box.x0; x <= box.x1; x++) for (let z = box.z0; z <= box.z1; z++) { const key = `${x},${z}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(prism); }
  }
  const covered = p => !bounds || (p[0] >= bounds.x0 + clearance_m && p[0] <= bounds.x1 - clearance_m && p[2] >= bounds.z0 + clearance_m && p[2] <= bounds.z1 - clearance_m);
  const segmentClear = (a, b) => {
    if (!finitePoint(a) || !finitePoint(b)) throw Error('Finite model points required');
    if (!supportedPoint(a) || !supportedPoint(b) || !covered(a) || !covered(b)) return false;
    const r = clearance_m, candidates = new Set();
    const box = gridBox(Math.min(a[0], b[0]) - r, Math.max(a[0], b[0]) + r, Math.min(a[2], b[2]) - r, Math.max(a[2], b[2]) + r);
    if (!box || box.cells > max_query_cells) return false; // Unsupported within the budget is never clear.
    for (let x = box.x0; x <= box.x1; x++) for (let z = box.z0; z <= box.z1; z++) for (const prism of grid.get(`${x},${z}`) || []) candidates.add(prism);
    for (const prism of candidates) {
      if (Math.max(a[0], b[0]) + r < prism.x0 || Math.min(a[0], b[0]) - r > prism.x1 || Math.max(a[2], b[2]) + r < prism.z0 || Math.min(a[2], b[2]) - r > prism.z1) continue;
      if (intersectsPrism(a, b, prism, r)) return false;
    }
    return true;
  };
  return { segmentClear, covered, buildingCount: prisms.length, clearance_m };
}
class Heap {
  values = [];
  push(item) { const a = this.values; a.push(item); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p].score <= item.score) break; a[i] = a[p]; i = p; } a[i] = item; }
  pop() { const a = this.values, first = a[0], last = a.pop(); if (a.length) { let i = 0; while (2 * i + 1 < a.length) { let c = 2 * i + 1; if (c + 1 < a.length && a[c + 1].score < a[c].score) c++; if (a[c].score >= last.score) break; a[i] = a[c]; i = c; } a[i] = last; } return first; }
  get length() { return this.values.length; }
}
function simplify(points, clear, tolerance) {
  const result = [points[0]];
  for (let i = 0; i < points.length - 1;) {
    let best = i + 1;
    for (let j = i + 2; j < Math.min(points.length, i + 65); j++) {
      if (points.slice(i + 1, j).some(p => project(p, points[i], points[j]).distance > tolerance)) break;
      if (clear(points[i], points[j])) best = j;
    }
    result.push(points[best]); i = best;
  }
  return result;
}
export function createCityRouter({ roads, buildings }, { clearance_m = 2, bounds = null, join_m = .15, join_height_m = 1, max_snap_m = 80, snap_candidates = 16, snap_slack_m = 3, max_connector_height_m = 80, simplify_m = .5, max_nodes = 100000, max_vertices = 100000, max_buildings = 100000, max_route_points = 256 } = {}) {
  const buildStart = now();
  if (!Array.isArray(roads) || !Array.isArray(buildings)) throw Error('Roads and building prisms required');
  if (!Number.isInteger(max_vertices) || max_vertices < 2 || !Number.isInteger(max_buildings) || max_buildings < 0 || buildings.length > max_buildings || roads.reduce((n, r) => n + (r?.length || 0), 0) > max_vertices) throw Error('City model graph budget exceeded');
  if (![join_m, join_height_m, max_snap_m, simplify_m, snap_slack_m, max_connector_height_m].every(Number.isFinite) || join_m <= 0 || join_height_m < 0 || max_snap_m <= 0 || simplify_m < 0 || snap_slack_m < 0 || max_connector_height_m < 0 || !Number.isInteger(snap_candidates) || snap_candidates < 1 || snap_candidates > 32 || !Number.isInteger(max_nodes) || max_nodes < 1 || !Number.isInteger(max_route_points) || max_route_points < 2 || max_route_points > 1024) throw Error('Invalid city-routing options');
  const clearance = createPrismClearance(buildings, { clearance_m, bounds }), nodes = [], adjacency = [], buckets = new Map(), edges = [], edgeKeys = new Set();
  const nodeAt = p => {
    const bx = Math.floor(p[0] / join_m), bz = Math.floor(p[2] / join_m);
    if (!safeIndex(bx) || !safeIndex(bz)) throw Error('Road graph coordinates unsupported');
    for (let x = bx - 1; x <= bx + 1; x++) for (let z = bz - 1; z <= bz + 1; z++) for (const id of buckets.get(`${x},${z}`) || []) { const q = nodes[id]; if (Math.hypot(p[0] - q[0], p[2] - q[2]) <= join_m && Math.abs(p[1] - q[1]) <= join_height_m) return id; }
    const id = nodes.length; nodes.push(p.slice()); adjacency.push([]); const key = `${bx},${bz}`; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(id); return id;
  };
  for (const road of roads) {
    if (!Array.isArray(road) || road.some(p => !supportedPoint(p))) throw Error('Invalid or unsupported road coordinates');
    for (let i = 1; i < road.length; i++) {
      const a = nodeAt(road[i - 1]), b = nodeAt(road[i]); if (a === b) continue;
      const key = a < b ? `${a},${b}` : `${b},${a}`; if (edgeKeys.has(key)) continue; edgeKeys.add(key);
      const edge = { a, b, length: distance(nodes[a], nodes[b]) }; edges.push(edge); adjacency[a].push({ to: b, length: edge.length }); adjacency[b].push({ to: a, length: edge.length });
    }
  }
  const edgeClear = new Map();
  const checked = (a, b, idA, idB) => { const key = idA < idB ? `${idA},${idB}` : `${idB},${idA}`; if (!edgeClear.has(key)) edgeClear.set(key, clearance.segmentClear(a, b)); return edgeClear.get(key); };
  function plan(start, end) {
    if (!finitePoint(start) || !finitePoint(end)) throw Error('Start and end must be finite model points');
    if (!supportedPoint(start) || !supportedPoint(end)) return { ok: false, error: 'unsupported-model-coordinates' };
    if (!clearance.covered(start) || !clearance.covered(end)) return { ok: false, error: 'outside-model-bounds' };
    if (!clearance.segmentClear(start, start) || !clearance.segmentClear(end, end)) return { ok: false, error: 'endpoint-in-building-clearance' };
    const points = nodes.slice(), extra = new Map(), startId = points.push(start.slice()) - 1, endId = points.push(end.slice()) - 1;
    const add = (a, b) => { const length = distance(points[a], points[b]); if (!extra.has(a)) extra.set(a, []); extra.get(a).push({ to: b, length }); if (!extra.has(b)) extra.set(b, []); extra.get(b).push({ to: a, length }); };
    const attachments = [];
    for (const [endpoint, id] of [[start, startId], [end, endId]]) {
      const candidates = edges.map((edge, index) => ({ ...project(endpoint, nodes[edge.a], nodes[edge.b]), edge, index })).filter(p => p.distance <= max_snap_m && Math.abs(p.point[1] - endpoint[1]) <= max_connector_height_m).sort((a, b) => a.distance - b.distance).slice(0, snap_candidates);
      const nearest = candidates[0]?.distance ?? Infinity;
      let connected = 0;
      for (const candidate of candidates) {
        if (candidate.distance > nearest + snap_slack_m) continue;
        if (!clearance.segmentClear(endpoint, candidate.point)) continue;
        const projected = points.push(candidate.point) - 1; add(id, projected); add(projected, candidate.edge.a); add(projected, candidate.edge.b); attachments.push({ projected, index: candidate.index }); connected++;
      }
      if (!connected) return { ok: false, error: id === startId ? 'no-clear-start-road-connector' : 'no-clear-end-road-connector', max_snap_m };
    }
    // Endpoints can attach inside the same original edge; retain that direct checked road portion.
    for (let i = 0; i < attachments.length; i++) for (let j = i + 1; j < attachments.length; j++) if (attachments[i].index === attachments[j].index) add(attachments[i].projected, attachments[j].projected);
    const scores = new Map([[startId, 0]]), previous = new Map(), heap = new Heap(); heap.push({ id: startId, score: distance(start, end), g: 0 }); let expanded = 0;
    while (heap.length) {
      const current = heap.pop(); if (current.g !== scores.get(current.id)) continue;
      if (current.id === endId) {
        const ids = [endId]; while (ids.at(-1) !== startId) ids.push(previous.get(ids.at(-1))); ids.reverse();
        const raw = ids.map(i => points[i]).filter((p, i, a) => !i || distance(p, a[i - 1]) > EPS);
        const route = simplify(raw, clearance.segmentClear, simplify_m).map(p => Object.freeze(p.slice()));
        if (route.length < 2 || route.some((p, i) => i && !clearance.segmentClear(route[i - 1], p))) return { ok: false, error: 'route-validation-failed' };
        if (route.length > max_route_points) return { ok: false, error: 'route-waypoint-budget', points: route.length, max_route_points };
        const cumulative_m = [0]; for (let i = 1; i < route.length; i++) cumulative_m.push(cumulative_m.at(-1) + distance(route[i - 1], route[i]));
        return { ok: true, policy: 'city-exterior', trajectory: 'polyline', points: Object.freeze(route), cumulative_m: Object.freeze(cumulative_m), length_m: cumulative_m.at(-1), expanded, clearance: { radius_m: clearance_m, checks: ['continuous-building-prisms', ...(bounds ? ['model-bounds'] : [])], limitations: ['Static model footprints only; terrain, bridge decks, trees, cranes, moving objects and unmapped structures are not collision-tested.'], buildingCount: clearance.buildingCount }, stop_at_corners: true };
      }
      if (++expanded > max_nodes) return { ok: false, error: 'route-search-limit', expanded };
      const neighbors = [...(adjacency[current.id] || []), ...(extra.get(current.id) || [])];
      for (const edge of neighbors) {
        const a = points[current.id], b = points[edge.to];
        const clear = current.id < nodes.length && edge.to < nodes.length ? checked(a, b, current.id, edge.to) : clearance.segmentClear(a, b);
        if (!clear) continue;
        const g = current.g + edge.length; if (g >= (scores.get(edge.to) ?? Infinity)) continue;
        scores.set(edge.to, g); previous.set(edge.to, current.id); heap.push({ id: edge.to, g, score: g + distance(b, end) });
      }
    }
    return { ok: false, error: 'no-connected-clear-road-route', expanded };
  }
  const stats = { build_ms: now() - buildStart, nodes: nodes.length, segments: edges.length, buildings: clearance.buildingCount, clearance_method: 'continuous-inflated-building-prisms' };
  const nearestRoadPoint = (x, z, max_distance_m = max_snap_m) => {
    if (![x, z, max_distance_m].every(Number.isFinite) || Math.abs(x) > MAX_MODEL_METRES || Math.abs(z) > MAX_MODEL_METRES || max_distance_m <= 0 || max_distance_m > max_snap_m) throw Error('Finite destination and bounded snap distance required');
    let best = null;
    for (const edge of edges) {
      const a = nodes[edge.a], b = nodes[edge.b], dx = b[0] - a[0], dz = b[2] - a[2], length2 = dx * dx + dz * dz;
      const t = length2 ? clamp(((x - a[0]) * dx + (z - a[2]) * dz) / length2) : 0, point = lerp(a, b, t), d = Math.hypot(point[0] - x, point[2] - z);
      if (d <= max_distance_m && (!best || d < best.distance_horizontal_m) && clearance.segmentClear(point, point)) best = { ok: true, point, distance_horizontal_m: d };
    }
    return best || { ok: false, error: 'no-clear-road-destination', max_distance_m };
  };
  return { nearestRoadPoint, plan: (start, end) => { const t = now(); const result = plan(start, end); return { ...result, telemetry: { ...stats, plan_ms: now() - t } }; }, segmentClear: clearance.segmentClear, stats };
}
export function sampleCityRoute(route, progress) {
  if (!route?.ok || !Array.isArray(route.points) || route.points.length < 2 || !Number.isFinite(progress)) throw Error('A valid checked route and finite progress are required');
  const cumulative = route.cumulative_m;
  if (!Array.isArray(cumulative) || cumulative.length !== route.points.length || !Number.isFinite(cumulative.at(-1))) throw Error('Route needs its validated cumulative lengths');
  const travelled = clamp(progress) * cumulative.at(-1);
  let lo = 0, hi = cumulative.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cumulative[m] < travelled) lo = m; else hi = m; }
  const length = cumulative[hi] - cumulative[lo];
  return lerp(route.points[lo], route.points[hi], smooth(length ? clamp((travelled - cumulative[lo]) / length) : 0));
}
