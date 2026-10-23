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
//   4. (version 2, issue #14: spires were straight columns from the ground) a part's shape: its walls start at its
//      min_height when something holds it up (partBases), else at the ground; a pointed roof (pyramidal, cone, spire;
//      building:part=spire), a dome or an onion is drawn as that cap (partCap, roof-caps.mjs) of roof:height, else of
//      min(0.25 x height, 8 m); a Wikidata spire is a pyramid from the part's top to the Wikidata height.
// Skill: docklands-3d-page, "Three.js port: the UK lite set (2026-10-22)", landmark heights.

import { capKind } from './roof-caps.mjs';

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

// building_part rows: { id, building_id, height, min_height, roof_shape, roof_height, sources, geometry } -> Map building_id
// -> parts [{ id, osm, h, min, roof, rh, part, rings }] (parts without a height are kept for counting only). shapes (optional,
// osmPartShapes): the OSM roof:shape and building:part of a part by OSM id; the OSM tag wins over Overture's roof_shape
// (Overture's schema has no "cone" and no building:part value: 99 cones and 4 spires in the UK, 2026-10-23)
const polys = g => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
export function partIndex(rows, shapes = null) {
  const M = new Map();
  for (const r of rows) { if (!r.building_id) continue; const P = polys(r.geometry); if (!P.length) continue; const base = (r.sources || []).find(q => !q.property) || {}, osm = (base.record_id || '').replace(/@.*/, '') || null, t = osm && shapes ? shapes.get(osm) : null;
    (M.get(r.building_id) || M.set(r.building_id, []).get(r.building_id)).push({ id: r.id, osm, dataset: base.dataset || null, h: r.height > 0 ? r.height : null, min: r.min_height > 0 ? r.min_height : 0, roof: t?.rs || r.roof_shape || null, rh: r.roof_height > 0 ? r.roof_height : null, part: t?.bp || null, rings: P[0] }); }
  return M;
}
// the QLever answer (TSV ?p ?rs ?bp) -> Map OSM id ("w123") -> { rs, bp }
export function osmPartShapes(tsv) {
  const M = new Map(), lines = tsv.split('\n').filter(Boolean); lines.shift(); const unq = v => v ? v.replace(/^"|"(@\w+|\^\^.*)?$/g, '') : null;
  for (const l of lines) { const c = l.split('\t'), m = /openstreetmap\.org\/(way|relation)\/(\d+)/.exec(c[0]); if (!m) continue; M.set(m[1][0] + m[2], { rs: unq(c[1]) || null, bp: unq(c[2]) || null }); }
  return M;
}
// the cap of a drawn part (roof-caps.mjs): pointed (pyramidal, cone, spire; building:part=spire), dome or onion, with its
// height: roof:height when mapped, the whole part for building:part=spire, else min(cap_share x height, cap_max_m) (the
// rule of the landmark sets, build-place-landmarks.mjs); null for a flat or other roof
export function partCap(p, R) {
  const kind = capKind(p.roof, p.part); if (!kind) return null;
  const span = p.h - p.min, h = p.part === 'spire' ? span : p.rh ?? Math.min((R.cap_share ?? 0.25) * p.h, R.cap_max_m ?? 8);
  return { kind, h: Math.round(Math.min(span, h) * 10) / 10 };
}
// where a part's walls start: its min_height when something holds it up (the body reaches it, or a part already standing
// that meets its box reaches it, within 1 m), else the ground (a part mapped high whose support is not mapped)
const bbOf = r => { let w = Infinity, s2 = Infinity, e = -Infinity, n = -Infinity; for (const [x, y] of r[0]) { w = Math.min(w, x); e = Math.max(e, x); s2 = Math.min(s2, y); n = Math.max(n, y); } return [w, s2, e, n]; };
export function partBases(parts, body) {
  const out = new Map(), stood = [];
  for (const p of parts.filter(q => q.h != null).sort((a, b) => a.min - b.min || a.h - b.h)) { const b = bbOf(p.rings); let ok = p.min <= Math.max(1, body + 1);
    if (!ok) for (const q of stood) if (q.h >= p.min - 1 && q.b[0] <= b[2] && q.b[2] >= b[0] && q.b[1] <= b[3] && q.b[3] >= b[1]) { ok = true; break; }
    out.set(p, ok ? p.min : 0); if (ok) stood.push({ h: p.h, b }); }
  return out;
}

const D2R = Math.PI / 180;
const ringArea = (r, lat) => { const mLon = 111320 * Math.cos(lat * D2R), mLat = 110574; let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * mLon * (r[j][1] + r[i][1]) * mLat; return Math.abs(a / 2); };
const ringMean = r => { let x = 0, y = 0; const n = r.length - (r.length > 1 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? 1 : 0); for (let i = 0; i < n; i++) { x += r[i][0]; y += r[i][1]; } return [x / n, y / n]; };

// one landmark { id, c, a, h, src, wikidata } with its parts and Wikidata heights -> { towers, top_h, top_src, why }
// towers: [{ kind: 'part' | 'spire' | 'tower', rings | c + side, base_h, top_h, src, osm }]
export function landmarkHeights(l, parts, wd, R) {
  const body = l.h || 0, out = { towers: [], top_h: body, top_src: l.src, counts: {} }, rise = top => Math.max(R.rise_m, R.rise_share * top);
  const ps = (parts || []).filter(p => p.h != null && p.h - body >= rise(body)).sort((a, b) => b.h - a.h).slice(0, R.max_parts), base = partBases(parts || [], body);
  for (const p of ps) { const cap = partCap(p, R), b0 = base.get(p) || 0;
    out.towers.push({ kind: 'part', rings: p.rings, base_h: b0, top_h: Math.round(p.h * 10) / 10, src: 'osm-part', osm: p.osm, ...(cap ? { cap } : {}), ...(p.roof ? { roof: p.roof } : {}), ...(p.part ? { part: p.part } : {}) }); }
  if (ps.length) { out.top_h = Math.round(ps[0].h * 10) / 10; out.top_src = 'osm-part'; }
  const w = l.wikidata ? wd.get(l.wikidata) : null;
  if (w != null && w - out.top_h >= rise(out.top_h) && w <= R.max_wd_m) {
    if (ps.length) {   // a spire on the tallest tower part
      const p = ps[0], c = ringMean(p.rings[0]), side = Math.max(1.5, Math.min(R.tower_max_m, R.spire_share * Math.sqrt(ringArea(p.rings[0], c[1]))));
      out.towers.push({ kind: 'spire', c, side: Math.round(side * 10) / 10, base_h: out.top_h, top_h: w, src: 'wikidata', cap: { kind: 'pointed', h: Math.round((w - out.top_h) * 10) / 10 } });
    } else {           // a tower at the centroid
      const side = Math.max(R.tower_min_m, Math.min(R.tower_max_m, R.tower_share * Math.sqrt(l.a)));
      out.towers.push({ kind: 'tower', c: l.c, side: Math.round(side * 10) / 10, base_h: 0, top_h: w, src: 'wikidata' });
    }
    out.top_h = w; out.top_src = 'wikidata';
  }
  return out;
}

// ---------- structures that are not OSM buildings (issue #14: the Angel of the North, towers, chimneys, obelisks; castles as
// sites): the QLever answer (TSV ?e ?mm ?hist ?tour ?name ?h ?wd ?wp ?wkt) -> landmark objects. Rule R (place.lite.structures):
// a structure of a listed kind (not tagged building) is a landmark when it has an OSM wikidata or wikipedia tag, or a name
// and a height of at least named_tall_m; its height is the OSM height, else the Wikidata P2048 of its item; it is drawn when
// that height is at least min_height_m: its OSM outline (a way or relation area), else a shape at its node by kind
// (STRUCTURE_SHAPES: sides and the half width as a share of the height, clamped; an obelisk gets a pointed cap). A castle
// area that is not a building (historic=castle with a wikidata tag) is a SITE: a named row for search and the card, not
// drawn (its buildings are drawn as themselves). Pure: no clock, no network.
export const STRUCTURE_SHAPES = { tower: { sides: 4, share: 0.06, min: 2, max: 7.5 }, chimney: { sides: 12, share: 0.04, min: 1.5, max: 8 }, mast: { sides: 4, share: 0.008, min: 1, max: 2 },
  obelisk: { sides: 4, share: 0.05, min: 0.5, max: 3, cap: 0.1 }, lighthouse: { sides: 12, share: 0.08, min: 2, max: 6 }, monument: { sides: 4, share: 0.075, min: 1, max: 5 },
  memorial: { sides: 4, share: 0.075, min: 1, max: 5 }, artwork: { sides: 4, share: 0.05, min: 0.75, max: 3 } };
const numOf = v => { const m = String(v ?? '').replace(',', '.').match(/^~?\s*(\d+(?:\.\d+)?)\s*(m|ft|')?/); if (!m) return null; const x = +m[1]; return m[2] === 'ft' || m[2] === "'" ? x * 0.3048 : x; };
function wktGeom(w) { const s = String(w || '').replace(/^"|"(\^\^.*)?$/g, ''), m = /^\s*(POINT|POLYGON|MULTIPOLYGON|LINESTRING)\s*\(+([^()]+)\)/i.exec(s); if (!m) return null;
  return { type: m[1].toUpperCase(), pts: m[2].split(',').map(t => t.trim().split(/\s+/).map(Number)).filter(p => p.length >= 2 && isFinite(p[0]) && isFinite(p[1])) }; }
export function structureRows(tsv, wd, R) {
  const lines = tsv.split('\n').filter(Boolean), head = lines.shift().split('\t').map(h => h.replace(/^\?/, '')), out = [], counts = {}, inc = k => { counts[k] = (counts[k] || 0) + 1; }, seen = new Set();
  const unq = v => v ? v.replace(/^"|"(@[\w-]+|\^\^.*)?$/g, '').replace(/\\"/g, '"') : null, r7 = v => Math.round(v * 1e7) / 1e7;
  for (const l of lines) { const c = l.split('\t'), o = Object.fromEntries(head.map((h, i) => [h, c[i]])), m = /openstreetmap\.org\/(way|relation|node)\/(\d+)/.exec(o.e || ''); if (!m) continue;
    const osm = m[1][0] + m[2]; if (seen.has(osm)) continue; seen.add(osm);
    const kind = unq(o.mm) ? 'man_made=' + unq(o.mm) : unq(o.hist) ? 'historic=' + unq(o.hist) : unq(o.tour) ? 'tourism=' + unq(o.tour) : null; if (!kind) continue;
    const short = kind.split('=')[1], name = unq(o.name), wdq = /Q\d+/.exec(o.wd || '')?.[0] || null, wp = unq(o.wp), hO = numOf(unq(o.h)), g = wktGeom(o.wkt);
    if (!g || !g.pts.length) { inc('no geometry'); continue; }
    if (short === 'castle') { if (!wdq) continue; let x = 0, y = 0; for (const p of g.pts) { x += p[0]; y += p[1]; }
      out.push({ id: 'osm:' + osm, osm, name, kind, why: 'wikidata', wikidata: wdq, wikipedia: wp, c: [r7(x / g.pts.length), r7(y / g.pts.length)], a: 0, h: 0, src: 'site', site: true }); inc('castle sites (search and card, not drawn)'); continue; }
    const why = wdq ? 'wikidata' : wp ? 'wikipedia' : name && hO >= R.named_tall_m ? 'named-tall' : null; if (!why) { inc('not a landmark by the rule'); continue; }
    const hW = wdq ? wd.get(wdq) ?? null : null, h = hO ?? hW, src = hO != null ? 'osm-height' : hW != null ? 'wikidata' : null;
    if (h == null) { inc('a landmark by the rule but no height (OSM or Wikidata): not drawn'); continue; }
    if (h < R.min_height_m) { inc(`under ${R.min_height_m} m: not drawn`); continue; }
    const S = STRUCTURE_SHAPES[short] || STRUCTURE_SHAPES.monument; let ring, cc;
    if ((g.type === 'POLYGON' || g.type === 'MULTIPOLYGON') && g.pts.length >= 4) { ring = g.pts.map(([x, y]) => [r7(x), r7(y)]); let x = 0, y = 0; for (const p of ring.slice(0, -1)) { x += p[0]; y += p[1]; } cc = [x / (ring.length - 1), y / (ring.length - 1)]; }
    else { cc = g.pts[0]; const r = Math.max(S.min, Math.min(S.max, S.share * h)), mLon = 111320 * Math.cos(cc[1] * Math.PI / 180), mLat = 110574; ring = [];
      for (let i = 0; i <= S.sides; i++) { const a = (i % S.sides) / S.sides * 2 * Math.PI + (S.sides === 4 ? Math.PI / 4 : 0); ring.push([r7(cc[0] + Math.cos(a) * r / mLon), r7(cc[1] + Math.sin(a) * r / mLat)]); } }
    let a = 0; { const mLon = 111320 * Math.cos(cc[1] * Math.PI / 180), mLat = 110574; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * mLon * (ring[j][1] + ring[i][1]) * mLat; a = Math.abs(a / 2); }
    out.push({ id: 'osm:' + osm, osm, name, kind, why, wikidata: wdq, wikipedia: wp, rings: [ring], c: [r7(cc[0]), r7(cc[1])], a: Math.round(a * 10) / 10, h: Math.round(h * 10) / 10, src,
      shape: g.type === 'POINT' ? `${S.sides === 4 ? 'square' : S.sides + '-sided'} at the node, half width ${S.share} x height (${S.min} to ${S.max} m)` : 'OSM outline', ...(S.cap ? { cap: { kind: 'pointed', h: Math.round(S.cap * h * 10) / 10 } } : {}) });
    inc('drawn: ' + kind); inc('height from ' + src); }
  return { rows: out, counts };
}
