// How far the data can place the occupants of the Canary Wharf malls on a plan: each CWG directory entry in a mall
// (name, mall, level as the page gives it) matched by name to an OSM shop / amenity / office point near that mall,
// the OSM point's position and levels, agreement of the levels, and the indoor ways (corridors, mall footways, rooms)
// that could carry a plan. Local metres from the mall anchor, for drawing.
//   in:  registry/sources/brands/cwg-directory-typed.json, registry/buildings.json, data/raw/registry/osm-cw.json.gz (not committed)
//   out: registry/sources/brands/mall-plan-evidence.json   (OSM-derived: ODbL, © OpenStreetMap contributors)
//   node magpie/cwplans/tools/mall-plan-evidence.mjs
// Skill: cwplans-web-harvest, "Mall plans".
import { readFileSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { TOOLS, RAW } from './lib.mjs';

const CW = join(TOOLS, '..');
const typed = JSON.parse(readFileSync(join(CW, 'registry/sources/brands/cwg-directory-typed.json'), 'utf8')).entries;
const B = new Map(JSON.parse(readFileSync(join(CW, 'registry/buildings.json'), 'utf8')).buildings.map(b => [b.id, b]));
const osm = JSON.parse(gunzipSync(readFileSync(join(RAW, 'registry', 'osm-cw.json.gz'))).toString());
const node = id => { const v = osm.nodes[id]; return v ? { lon: v[0], lat: v[1] } : null; };
const MALLS = ['Cabot Place', 'Canada Place', 'Jubilee Place', 'Crossrail Place', 'One Canada Square'], RADIUS = 250;

const median = v => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const centre = f => { if (f.lat != null) return { lat: f.lat, lon: f.lon }; const ps = (f.refs || f.nodes || []).map(node).filter(Boolean); return ps.length ? { lat: ps.reduce((a, p) => a + p.lat, 0) / ps.length, lon: ps.reduce((a, p) => a + p.lon, 0) / ps.length } : null; };
const metres = (p, o) => [Math.round((p.lon - o.lon) * 111320 * Math.cos(o.lat * Math.PI / 180) * 10) / 10, Math.round((p.lat - o.lat) * 110540 * 10) / 10];
const dist = (p, o) => Math.hypot(...metres(p, o));
const norm = s => (s || '').toLowerCase().replace(/&/g, 'and').replace(/[’']/g, '').replace(/\b(the|ltd|canary wharf|london|at|jubilee place|cabot place|canada place|crossrail place|one canada square)\b/g, '').replace(/[^a-z0-9]/g, '');
// CWG level text -> the signed number on CWG signage; null for "Mezzanine" and empty
const cwgLevel = s => { if (!s) return null; const t = s.replace(/[–—]/g, '-').replace(/\s+/g, ''); const m = t.match(/(-?\d)(?!.*\d)/); if (/mezzanine/i.test(t) && !m) return null; return m ? +m[1] : null; };
const firstNum = v => v == null ? null : +String(v).split(';')[0];

const pois = osm.features.filter(f => f.tags?.name && (f.tags.shop || f.tags.amenity || f.tags.office || f.tags.leisure || f.tags.healthcare || f.tags.craft || f.tags.tourism))
  .map(f => ({ id: `${f.type}/${f.id}`, keys: [norm(f.tags.name), norm(f.tags.brand), norm(f.tags['name:en'])].filter(k => k && k.length >= 3), name: f.tags.name, level: f.tags.level ?? null, level_ref: f.tags['level:ref'] ?? null, unit: f.tags['addr:unit'] || null, c: centre(f) }))
  .filter(p => p.c);
const nameMatch = (k, p) => p.keys.some(q => q === k || (k.length >= 5 && q.length >= 5 && (q.startsWith(k) || k.startsWith(q))));

const out = {};
for (const mall of MALLS) {
  const es = typed.filter(e => e.mall === mall);
  // anchor: the median position of the registry buildings the mall's entries link to
  const bl = es.flatMap(e => e.registry_buildings).map(id => B.get(id)).filter(b => b?.lat != null);
  const anchor = { lat: median(bl.map(b => b.lat)), lon: median(bl.map(b => b.lon)) };
  const placed = [], unplaced = [];
  for (const e of es) {
    const k = norm(e.name), lv = cwgLevel(e.level);
    const cand = k ? pois.filter(p => nameMatch(k, p) && dist(p.c, anchor) <= RADIUS).sort((a, b) => dist(a.c, anchor) - dist(b.c, anchor)) : [];
    if (!cand.length) { unplaced.push({ slug: e.slug, name: e.name, cwg_level: e.level, level: lv }); continue; }
    const p = cand[0], ref = firstNum(p.level_ref), phys = firstNum(p.level);
    placed.push({ slug: e.slug, name: e.name, kind: e.kind, cwg_level: e.level, level: lv, osm: p.id, osm_name: p.name, osm_level: p.level, osm_level_ref: p.level_ref, osm_unit: p.unit,
      level_agrees: lv == null ? null : (ref != null ? ref === lv : phys != null ? phys === lv : null), level_agrees_if_physical: lv == null || phys == null ? null : phys === lv + 1,
      candidates: cand.length, distance_m: Math.round(dist(p.c, anchor)), xy: metres(p.c, anchor) });
  }
  // indoor ways near the mall that could carry a plan: mall footways and corridors with a level, indoor rooms and areas
  const ways = [];
  for (const f of osm.features) {
    if (f.type !== 'way' || !(f.refs || f.nodes)) continue; const t = f.tags || {};
    const indoorWay = (t.highway && (t.level != null || t.indoor === 'yes' || t.tunnel === 'building_passage')) || (t.indoor && t.indoor !== 'no');
    if (!indoorWay) continue; const c = centre(f); if (!c || dist(c, anchor) > RADIUS) continue;
    ways.push({ id: `way/${f.id}`, kind: t.indoor || t.highway, level: t.level ?? null, level_ref: t['level:ref'] ?? null, name: t.name || null, xy: (f.refs || f.nodes).map(node).filter(Boolean).map(p => metres(p, anchor)) });
  }
  const withLevel = placed.filter(p => p.level_agrees != null);
  out[mall] = { anchor, entries: es.length, entries_with_level: es.filter(e => cwgLevel(e.level) != null).length, placed: placed.length,
    placed_with_osm_level: placed.filter(p => p.osm_level != null).length, placed_with_osm_unit: placed.filter(p => p.osm_unit).length,
    level_agree: withLevel.filter(p => p.level_agrees).length, level_disagree: withLevel.filter(p => !p.level_agrees).length,
    agree_if_osm_level_is_physical: placed.filter(p => p.level_agrees_if_physical).length,
    indoor_ways: ways.length, indoor_ways_with_level: ways.filter(w => w.level != null).length, placed_points: placed, unplaced, ways };
}
const summary = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([kk]) => !['placed_points', 'unplaced', 'ways', 'anchor'].includes(kk)))]));
writeFileSync(join(CW, 'registry/sources/brands/mall-plan-evidence.json'), JSON.stringify({ generated: new Date().toISOString(), tool: 'magpie/cwplans/tools/mall-plan-evidence.mjs',
  osm_extract: osm.extracted, attribution: '© OpenStreetMap contributors (ODbL)', radius_m: RADIUS,
  note: 'CWG level = the signed number on CWG signage. In this part of OSM, level is the physical level (0 = ground) and level:ref the CWG number (note:level on way 193407928); not every mapper follows it. level_agrees compares the CWG level with level:ref when present, else with level. Positions are OSM points, not unit outlines.',
  summary, malls: out }) + '\n');
console.log(JSON.stringify(summary, null, 1));
