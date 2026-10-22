// Landmark heights of a place of kind "lite" (the UK outside Greater London; owner, 2026-10-22, to "should I improve the
// landmark heights next, with OSM spire and tower parts or the heights in Wikidata?": "Yes do that"). Imported by
// cwplans/tools/build-place-tiles.mjs (operation place-lite-landmark-heights). Pure functions over their inputs (no clock,
// no network):
//   wdHeights(tsv)          the Wikidata answer (QLever TSV: ?item ?amount ?unit) -> Map Q-id -> greatest height in metres
//   partIndex(rows)         Overture building_part rows (OSM building:part via Overture) -> Map building id -> parts
//   landmarkHeights(...)    one landmark -> its towers (by the rule below) and the height of its highest point
// The rule (the set's README states it):
//   1. Tower parts (OSM building:part, via Overture's building_part theme, joined by building_id to the landmark's
//      Overture id): every part with a height whose top is above the landmark's body height by at least
//      max(rise_m, rise_share x body) is drawn as its own prism (its outline, from its min_height to its height), up to
//      max_parts a landmark, the tallest first.
//   2. Wikidata (P2048 height, the greatest value of the landmark's OSM wikidata item; feet converted; CC0): when it is
//      above the highest top so far (body or tower parts) by at least max(rise_m, rise_share x top) and at most
//      max_wd_m, a spire box is drawn up to it: on the tallest tower part (a square of spire_share x the part's short
//      side, from the part's top) when there is one, else a square tower at the landmark's centroid (side
//      tower_share x sqrt(footprint), between tower_min_m and tower_max_m, from the ground).
//   3. The body (the landmark's own outline) keeps its height (fault F55: Microsoft roof heights are low; counted).
// Skill: docklands-3d-page, "Three.js port: the UK lite set (2026-10-22)", landmark heights.

// Wikidata quantity units of length -> metres
const UNIT = { Q11573: 1, Q3710: 0.3048, Q174728: 0.01, Q218593: 0.0254, Q482798: 0.9144, Q828224: 1000 };
// (columns ?item ?amount ?unit [?rank ?end]: a statement with an end time (pq:P582, e.g. Lincoln's spire, fell 1548) or of
// deprecated rank is left out; when an item has a preferred statement, only its preferred ones count; then the greatest)
export function wdHeights(tsv) {
  const S = new Map(), H = new Map(), lines = tsv.split('\n').filter(Boolean); lines.shift();
  for (const l of lines) { const c = l.split('\t'), q = /Q\d+/.exec(c[0])?.[0], v = parseFloat(String(c[1]).replace(/^"|"(\^\^.*)?$/g, '')), u = /Q\d+/.exec(c[2] || '')?.[0], rank = /#(\w+)Rank/.exec(c[3] || '')?.[1] || 'Normal';
    if (!q || !(v > 0) || !(u in UNIT) || rank === 'Deprecated' || (c[4] || '').trim()) continue;
    (S.get(q) || S.set(q, []).get(q)).push({ m: Math.round(v * UNIT[u] * 10) / 10, pref: rank === 'Preferred' }); }
  for (const [q, L] of S) { const P = L.some(x => x.pref) ? L.filter(x => x.pref) : L; H.set(q, Math.max(...P.map(x => x.m))); }
  return H;
}

// building_part rows: { id, building_id, height, min_height, roof_shape, sources, geometry } -> Map building_id -> parts
// [{ id, osm, h, min, roof, rings }] (parts without a height are kept for counting only)
const polys = g => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
export function partIndex(rows) {
  const M = new Map();
  for (const r of rows) { if (!r.building_id) continue; const P = polys(r.geometry); if (!P.length) continue; const base = (r.sources || []).find(q => !q.property) || {};
    (M.get(r.building_id) || M.set(r.building_id, []).get(r.building_id)).push({ id: r.id, osm: (base.record_id || '').replace(/@.*/, '') || null, dataset: base.dataset || null, h: r.height > 0 ? r.height : null, min: r.min_height > 0 ? r.min_height : 0, roof: r.roof_shape || null, rings: P[0] }); }
  return M;
}

const D2R = Math.PI / 180;
const ringArea = (r, lat) => { const mLon = 111320 * Math.cos(lat * D2R), mLat = 110574; let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * mLon * (r[j][1] + r[i][1]) * mLat; return Math.abs(a / 2); };
const ringMean = r => { let x = 0, y = 0; const n = r.length - (r.length > 1 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? 1 : 0); for (let i = 0; i < n; i++) { x += r[i][0]; y += r[i][1]; } return [x / n, y / n]; };

// one landmark { id, c, a, h, src, wikidata } with its parts and Wikidata heights -> { towers, top_h, top_src, why }
// towers: [{ kind: 'part' | 'spire' | 'tower', rings | c + side, base_h, top_h, src, osm }]
export function landmarkHeights(l, parts, wd, R) {
  const body = l.h || 0, out = { towers: [], top_h: body, top_src: l.src, counts: {} }, rise = top => Math.max(R.rise_m, R.rise_share * top);
  const ps = (parts || []).filter(p => p.h != null && p.h - body >= rise(body)).sort((a, b) => b.h - a.h).slice(0, R.max_parts);
  for (const p of ps) { out.towers.push({ kind: 'part', rings: p.rings, base_h: p.min, top_h: Math.round(p.h * 10) / 10, src: 'osm-part', osm: p.osm }); }
  if (ps.length) { out.top_h = Math.round(ps[0].h * 10) / 10; out.top_src = 'osm-part'; }
  const w = l.wikidata ? wd.get(l.wikidata) : null;
  if (w != null && w - out.top_h >= rise(out.top_h) && w <= R.max_wd_m) {
    if (ps.length) {   // a spire on the tallest tower part
      const p = ps[0], c = ringMean(p.rings[0]), side = Math.max(1.5, Math.min(R.tower_max_m, R.spire_share * Math.sqrt(ringArea(p.rings[0], c[1]))));
      out.towers.push({ kind: 'spire', c, side: Math.round(side * 10) / 10, base_h: out.top_h, top_h: w, src: 'wikidata' });
    } else {           // a tower at the centroid
      const side = Math.max(R.tower_min_m, Math.min(R.tower_max_m, R.tower_share * Math.sqrt(l.a)));
      out.towers.push({ kind: 'tower', c: l.c, side: Math.round(side * 10) / 10, base_h: 0, top_h: w, src: 'wikidata' });
    }
    out.top_h = w; out.top_src = 'wikidata';
  }
  return out;
}
