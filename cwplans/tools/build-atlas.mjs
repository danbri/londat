// Builds atlas/data/atlas.json: the compact index the atlas page loads first.
//
//   node cwplans/tools/build-atlas.mjs        # about 5 seconds
//
// Every input and output, with endpoints and rules: cwplans/pipeline.json, activity "build-atlas".
// in:  registry/buildings.json, registry/categories.json, data/raw/registry/osm-cw.json.gz (outlines),
//      postcodes/postcodes.json, registry/companies-by-postcode.json, registry/homes-by-postcode.json, docklands/facts.json,
//      feeds/feeds.json, feeds/events.json, registry/sources/brands/branches.json, data-register.json, the OSTN15 grid,
//      registry/sources/museums/records-open.json, registry/sources/pla/ukho_*.geojson,
//      data/raw/docklands/ea-defences.json.gz, data/raw/docklands/wikidata-items.json.gz,
//      docklands/data/area.js (published levels with their LiDAR ground), data/sourced-levels.json
// out: atlas/data/atlas.json
// Detail records (occupants, facts, feeds, heritage records) stay in their own files; the page loads them on demand.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { TOOLS, joinRings, bngProjector, pointIn } from './lib.mjs';
import { ORIGIN } from './fetch-docklands.mjs';

const CW = join(TOOLS, '..');
const rd = p => readFileSync(join(CW, p), 'utf8');
const json = p => JSON.parse(p.endsWith('.gz') ? gunzipSync(readFileSync(join(CW, p))) : rd(p));
const BOX = [-0.0950, 51.4740, 0.0150, 51.5220];                       // the Docklands model box
const inBox = (lon, lat) => lon >= BOX[0] && lon <= BOX[2] && lat >= BOX[1] && lat <= BOX[3];
const r6 = v => Math.round(v * 1e6) / 1e6, r2 = v => Math.round(v * 100) / 100;
// polyline in microdegrees: [lat0, lon0, dlat, dlon, ...] relative to the previous point
const encLL = pts => { const o = []; let pa = 0, po = 0; for (const [lon, lat] of pts) { const a = Math.round(lat * 1e6), b = Math.round(lon * 1e6); o.push(a - pa, b - po); pa = a; po = b; } return o; };

// ---- building outlines from the registry's OSM extract
const osm = json('data/raw/registry/osm-cw.json.gz');
const wayById = new Map(osm.features.filter(f => f.type === 'way').map(f => [f.id, f]));
const byKey = new Map(osm.features.map(f => [`${f.type}/${f.id}`, f]));
const ringOf = refs => refs.map(r => osm.nodes[r]).filter(Boolean);
function rings(f) {
  if (!f) return null;
  if (f.type === 'way') return f.refs[0] === f.refs.at(-1) ? [ringOf(f.refs)] : null;
  const outer = joinRings(f.members.filter(m => m.type === 'way' && m.role !== 'inner').map(m => wayById.get(m.ref)?.refs));
  return outer ? outer.map(ringOf) : null;
}

// ---- the 3D model's buildings (LiDAR heights for every outline): matched to registry outlines by position
globalThis.window = globalThis;
new Function(rd('docklands/data/area.js'))();
const A = globalThis.DOCKLANDS_AREA, SRCN = A.meta.buildingHeightSources;
const toBNG = await bngProjector(), local = (lon, lat) => { const [e, n] = toBNG(lon, lat); return [e - ORIGIN.E0, -(n - ORIGIN.N0)]; };
const model = A.buildings.map((m, i) => {
  const n = m.holes ? m.holes[0] : m.p.length / 2; let x = 0, z = 0, sx = 0, sz = 0;
  for (let i = 0; i < n; i++) { x += m.p[2 * i]; z += m.p[2 * i + 1]; sx += x / 10; sz += z / 10; }
  return { i, x: sx / n, z: sz / n, h: m.h, mh: m.mh || 0, s: SRCN[m.s] };
});

const reg = json('registry/buildings.json');
// occupant categories (tools/build-categories.mjs): counts per building for the 3D glow outlines and the atlas
const CATS = existsSync(join(CW, 'registry/categories.json')) ? json('registry/categories.json').buildings : {};
const catOf = id => { const c = CATS[id]; if (!c) return undefined; return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.length])); };
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : null; };
const buildings = reg.buildings.map(b => {
  const rs = rings(byKey.get(b.osm[0])) || [];
  const lr = rs.map(r => r.map(([lon, lat]) => local(lon, lat)));
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const r of lr) for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const inMe = model.filter(m => m.x >= x0 && m.x <= x1 && m.z >= z0 && m.z <= z1 && lr.some(r => pointIn([m.x, m.z], r)));
  const top = [...inMe].sort((p, q) => q.h - p.h)[0];
  const wdh = num(b.facts?.height?.[0]), wdf = num(b.facts?.['floors above ground']?.[0]), wdb = num(b.facts?.['floors below ground']?.[0]);
  const roles = {}; for (const o of b.occupants) { const k = o.source === 'fsa' ? 'food' : o.role.split(':')[0].split(' (')[0]; roles[k] = (roles[k] || 0) + 1; }
  return {
    id: b.id, n: b.name, lat: r6(b.lat), lon: r6(b.lon), x: b.x, z: b.z,
    h: b.height ?? null, wh: wdh, mh: top ? top.h : null, ms: top ? top.s : null, mi: inMe.map(m => m.i),   // indices into docklands/data/area.js buildings
    lv: b.levels ?? wdf ?? null, lu: b.levels_underground ?? wdb ?? null,
    t: b.building, a: b.area_m2, o: b.occupants.length, roles, cat: catOf(b.id),
    hm: typeof b.homes?.count === 'number' ? b.homes.count : b.homes ? -1 : 0,   // -1: "fewer than 5"
    co: Array.isArray(b.companies) ? b.companies.length : b.companies?.count ?? 0, own: b.owners.map(o => o.name),
    wd: b.wikidata || null, pc: b.postcodes, sl: b.sales ? 1 : 0,
    g: rs.map(encLL),
  };
});

// ---- postcodes: every actual (allocated) E14 code with a position, joined to company and home totals
const pcs = json('postcodes/postcodes.json');
const coBy = json('registry/companies-by-postcode.json').postcodes;
const hmBy = json('registry/homes-by-postcode.json').postcodes;
const postcodes = pcs.postcodes.filter(p => p.lat != null).map(p => ({
  pc: p.pc, lat: +p.lat, lon: +p.lon, s: p.status, t: p.tier, in: p.introduced, out: p.terminated, lu: p.large_user ? 1 : 0,
  w: p.ward_name, of: p.osm_features || 0, st: p.osm_streets || [],
  co: (coBy[p.pc] || []).length, hs: hmBy[p.pc]?.homes_sold_since_1995 ?? null, mp: hmBy[p.pc]?.median_price ?? null,
}));

// ---- heritage: records grouped by position (thousands of museum objects share their museum's coordinate)
const rec = json('registry/sources/museums/records-open.json').records;
const groups = new Map();
for (const [i, r] of rec.entries()) {
  if (r.lat == null || !inBox(r.lon, r.lat)) continue;
  const k = `${r.lat.toFixed(5)},${r.lon.toFixed(5)}`;
  const g = groups.get(k) || { lat: r6(r.lat), lon: r6(r.lon), n: 0, src: {}, types: {}, label: null, ix: [] };
  g.n++; g.src[r.source] = (g.src[r.source] || 0) + 1; g.types[r.object_type || 'record'] = (g.types[r.object_type || 'record'] || 0) + 1;
  g.label ||= r.collection || r.place || r.title; g.ix.push(i); groups.set(k, g);
}
const heritage = [...groups.values()].map(g => ({ ...g, types: Object.entries(g.types).sort((a, b) => b[1] - a[1]).slice(0, 5) }));

// ---- river: UKHO soundings converted to ODN (same rule as build-docklands.mjs), wrecks and obstructions
const cdBelowOd = lon => 3.20 + Math.max(0, Math.min(1, (lon - (-0.0877)) / (0.0636 - (-0.0877)))) * 0.15;
const soundings = [];
for (const f of ['ukho_thames_teddington_greenwich_25m.geojson', 'ukho_thames_greenwich_coalhouse_50m.geojson', 'ukho_thames_hms_belfast_berth.geojson'])
  for (const ft of json(`registry/sources/pla/${f}`).features) {
    const [lon, lat] = ft.geometry.coordinates; if (!inBox(lon, lat)) continue;
    soundings.push([r6(lat), r6(lon), r2(ft.properties.z_cd - cdBelowOd(lon))]);
  }
const wrecks = json('registry/sources/pla/ukho_wrecks_obstructions_points.geojson').features
  .filter(f => inBox(...f.geometry.coordinates))
  .map(f => ({ lat: r6(f.geometry.coordinates[1]), lon: r6(f.geometry.coordinates[0]), ...Object.fromEntries(Object.entries(f.properties).filter(([, v]) => v != null && v !== '')) }));

// ---- EA tidal flood defences with crest levels
const defences = [];
for (const f of json('data/raw/docklands/ea-defences.json.gz').features) {
  const p = f.properties, crest = p.actual_ucl ?? p.actual_dcl ?? p.design_ucl; if (crest == null) continue;
  const parts = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const part of parts) if (part.some(([lon, lat]) => inBox(lon, lat)))
    defences.push({ c: r2(crest), d: p.design_ucl ?? null, t: p.asset_sub_type, sop: p.design_sop ?? null, id: p.asset_id, la: p.local_authority, insp: p.last_inspection_date, g: encLL(part) });
}

// ---- Wikidata items in the box
const wdi = json('data/raw/docklands/wikidata-items.json.gz').results.bindings, seen = new Map();
for (const b of wdi) {
  const q = b.item.value.split('/').pop(), m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value || ''); if (!m) continue;
  const it = seen.get(q) || { q, n: b.itemLabel?.value || q, d: b.itemDescription?.value || '', lat: r6(+m[2]), lon: r6(+m[1]), c: [], wp: b.article?.value || null };
  if (b.classLabel?.value && !it.c.includes(b.classLabel.value)) it.c.push(b.classLabel.value);
  seen.set(q, it);
}
const wikidata = [...seen.values()].filter(it => inBox(it.lon, it.lat) && it.n !== it.q);

// ---- levels for the section: published levels (OD) with the LiDAR ground the 3D build measured under each
const SL = json('data/sourced-levels.json');
const levels = [];
const ctl = new Map(SL.controls.map(c => [c.id, c]));
for (const s of A.meta.sourced) levels.push({ kind: 'platform', place: s.place, what: s.what.split(',')[0], od: s.level, ground: s.ground, lat: ctl.get(s.id)?.lat, lon: ctl.get(s.id)?.lon, src: s.source, quote: s.quote });
for (const st of SL.structures) {
  if (st.slabs_od) for (const [what, od] of st.slabs_od) levels.push({ kind: 'slab', place: st.place, what, od, src: st.source, quote: st.quote });
  if (st.water_od != null) levels.push({ kind: 'water', place: st.place, what: 'impounded dock water (full impound level)', od: st.water_od, src: st.source });
  if (st.bed_od != null) levels.push({ kind: 'bed', place: st.place, what: 'dock bed', od: st.bed_od, src: st.source });
}
const cwBed = soundings.filter(([lat, lon]) => lon > -0.035 && lon < 0.005).map(s => s[2]).sort((a, b) => a - b);
if (cwBed.length) {
  levels.push({ kind: 'river', place: 'Thames off the Isle of Dogs', what: `deepest sounding of ${cwBed.length} (UKHO, converted to ODN)`, od: cwBed[0], src: 'https://datahub.admiralty.co.uk/' });
  levels.push({ kind: 'river', place: 'Thames off the Isle of Dogs', what: 'median sounding', od: cwBed[cwBed.length >> 1], src: 'https://datahub.admiralty.co.uk/' });
}
const groundOf = new Map(A.places.filter(p => p.wd && p.g != null).map(p => [p.wd, p.g])), towerSeen = new Set();
const hOf = b => b.wh || b.h || b.mh;
for (const b of buildings.filter(b => b.n && hOf(b)).sort((a, c) => hOf(c) - hOf(a))) {
  if (towerSeen.has(b.n) || towerSeen.size >= 8) continue; towerSeen.add(b.n);
  const g = groundOf.get(b.wd), hgt = hOf(b);
  levels.push({ kind: 'tower', place: b.n, what: `roof: ${b.wh ? 'Wikidata' : b.h ? 'OSM' : 'LiDAR'} height ${hgt} m on ${g != null ? `LiDAR ground ${g} m OD` : 'ground taken as 5 m OD'}`, od: r2(hgt + (g ?? 5)), id: b.id, approx: true });
}

// ---- counts for the overview
const facts = json('docklands/facts.json'), feeds = json('feeds/feeds.json'), events = json('feeds/events.json');
const branches = json('registry/sources/brands/branches.json');
const counts = {
  model_buildings: A.buildings.length ?? null, registry_buildings: buildings.length, occupants: reg.summary.occupants,
  with_owner: reg.summary.with_owner, homes_buildings: buildings.filter(b => b.hm).length,
  homes: buildings.reduce((s, b) => s + Math.max(0, b.hm), 0), companies: reg.summary.joins.companies,
  branches: branches.branches.length, brands: new Set(branches.branches.map(b => b.brand)).size,
  postcodes_candidates: pcs.summary.candidates, postcodes_live: pcs.summary.live, postcodes_terminated: pcs.summary.terminated, postcodes_never: pcs.summary.never,
  heritage_records: rec.length, heritage_places: heritage.length, soundings: soundings.length, wrecks: wrecks.length,
  defences: defences.length, facts: facts.facts.length, feeds: feeds.sources.length, events: events.sources.length,
  wikidata: wikidata.length, published_levels: levels.filter(l => !l.approx).length,
  register_files: json('data-register.json').files.length,
};

const out = {
  built: new Date().toISOString().slice(0, 10), box: BOX, cw_box: reg.summary.box, counts,
  attribution: A.meta.sources.map(s => ({ text: s.text, url: s.url })),
  buildings, postcodes, heritage, soundings, wrecks, defences, wikidata, levels,
};
mkdirSync(join(CW, 'atlas', 'data'), { recursive: true });
const s = JSON.stringify(out);
writeFileSync(join(CW, 'atlas', 'data', 'atlas.json'), s);
console.log(`atlas.json ${(s.length / 1e6).toFixed(2)} MB:`, Object.fromEntries(Object.entries(out).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])));
console.log(counts);
