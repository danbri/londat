#!/usr/bin/env node
// Joins the London Datastore harvests (feeds/london-datastore/) to the Canary Wharf building registry (cwb- ids):
// heat demand and solar potential by TOID, cultural venues by UPRN (the F22 amended copy) or by position, brownfield
// sites and other point datasets by position in the building outline, and the 2021 Census context of the building's
// LSOA and ward (centre in polygon). Every link keeps its key, precision and confidence, as build-registry.mjs does
// for the registers.
//   node cwplans/tools/join-lds.mjs        # -> registry/sources/lds/building-links.json, area-context.json
// Inputs: registry/buildings.json and ids.json, data/raw/registry/osm-cw.json.gz (committed: the OSM outlines of the
// registry), OS Open UPRN (data/raw/registry/osopenuprn_*.zip, raw cache), feeds/london-datastore/*.
// Rules, measured counts and the traps: skills/cwplans-london-datastore/SKILL.md, "Joins to the building registry".
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { TOOLS, RAW, pointIn, joinRings } from './lib.mjs';
import { LONDAT_CW } from './londat.mjs';

const CW = join(TOOLS, '..'), LDS = join(LONDAT_CW, 'feeds', 'london-datastore'), OUTD = join(CW, 'registry', 'sources', 'lds');
mkdirSync(OUTD, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const readJ = f => JSON.parse(readFileSync(f, 'utf8'));
const B = readJ(join(CW, 'registry', 'buildings.json')).buildings, ids = readJ(join(CW, 'registry', 'ids.json')).map;
const byId = new Map(B.map(b => [b.id, b]));

// ---- outlines of the registry buildings (rings of [lon, lat]) from the committed OSM extract, as build-registry.mjs reads them
const osm = JSON.parse(gunzipSync(readFileSync(join(RAW, 'registry', 'osm-cw.json.gz'))));
const wayById = new Map(osm.features.filter(f => f.type === 'way').map(f => [f.id, f]));
const ringOf = refs => refs.map(r => osm.nodes[r]).filter(Boolean);
function rings(f) {
  if (f.type === 'way') return f.refs[0] === f.refs.at(-1) ? [ringOf(f.refs)] : null;
  const outer = joinRings(f.members.filter(m => m.type === 'way' && m.role !== 'inner').map(m => wayById.get(m.ref)?.refs));
  return outer ? outer.map(ringOf) : null;
}
const outlines = [];
for (const f of osm.features) { const id = ids[`${f.type}/${f.id}`]; if (!id || !byId.has(id)) continue; const rs = rings(f); if (!rs || !rs[0] || rs[0].length < 4) continue;
  const bb = rs.flat().reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [1e9, 1e9, -1e9, -1e9]); outlines.push({ id, rs, bb }); }
const mPerDeg = [111320 * Math.cos(51.5 * Math.PI / 180), 110540];
function distTo(o, lon, lat) {
  let d = Infinity;
  for (const r of o.rs) for (let i = 1; i < r.length; i++) {
    const ax = (r[i - 1][0] - lon) * mPerDeg[0], ay = (r[i - 1][1] - lat) * mPerDeg[1], bx = (r[i][0] - lon) * mPerDeg[0], by = (r[i][1] - lat) * mPerDeg[1];
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    d = Math.min(d, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return d;
}
// the building a point lies in (smallest outline first: a mall outline holds towers), else the nearest within tol metres
function buildingAt(lon, lat, tol = 12) {
  const hits = outlines.filter(o => lon >= o.bb[0] && lon <= o.bb[2] && lat >= o.bb[1] && lat <= o.bb[3] && o.rs.some(r => pointIn([lon, lat], r)));
  if (hits.length) { hits.sort((a, b) => (a.bb[2] - a.bb[0]) * (a.bb[3] - a.bb[1]) - (b.bb[2] - b.bb[0]) * (b.bb[3] - b.bb[1])); return { id: hits[0].id, how: 'inside', d: 0 }; }
  let best = null; for (const o of outlines) { if (lon < o.bb[0] - 0.0003 || lon > o.bb[2] + 0.0003 || lat < o.bb[1] - 0.0003 || lat > o.bb[3] + 0.0003) continue; const d = distTo(o, lon, lat); if (d < tol && (!best || d < best.d)) best = { id: o.id, d }; }
  return best ? { id: best.id, how: `within ${Math.round(best.d)} m`, d: best.d } : null;
}
const CWB = outlines.reduce((b, o) => [Math.min(b[0], o.bb[0]), Math.min(b[1], o.bb[1]), Math.max(b[2], o.bb[2]), Math.max(b[3], o.bb[3])], [1e9, 1e9, -1e9, -1e9]);
const inCw = (lon, lat) => lon >= CWB[0] - 0.001 && lon <= CWB[2] + 0.001 && lat >= CWB[1] - 0.001 && lat <= CWB[3] + 0.001;

// ---- OS Open UPRN points in the registry area (raw cache)
const uprnPt = new Map();
const zipU = readdirSync(join(RAW, 'registry')).filter(f => /^osopenuprn_.*\.zip$/.test(f)).sort().pop();
if (zipU) {
  const z = join(RAW, 'registry', zipU), inner = execFileSync('unzip', ['-Z1', z], { encoding: 'utf8' }).split('\n').find(n => /\.csv$/i.test(n));
  const out = execFileSync('sh', ['-c', `unzip -p "$0" "$1" | awk -F, -v a=${CWB[0] - 0.002} -v b=${CWB[2] + 0.002} -v c=${CWB[1] - 0.002} -v d=${CWB[3] + 0.002} 'NR>1 { sub(/\r$/, "", $5); if ($5+0>=a && $5+0<=b && $4+0>=c && $4+0<=d) print $1","$4","$5 }'`, z, inner], { maxBuffer: 1 << 28, encoding: 'utf8' });
  for (const l of out.split('\n')) { const [u, la, lo] = l.split(','); if (u) uprnPt.set(u, [+lo, +la]); }
} else console.warn('no OS Open UPRN zip in data/raw/registry: the UPRN key is off');

// ---- links
const links = new Map(), stats = {};
const PREC = {};
const add = (id, kind, link) => { if (link.precision) { const P = PREC[kind] ||= {}; const base = link.precision.replace(/; the TOID is on \d+ registry buildings/, ''); P[link.key] ||= base; if (link.precision !== base) link.how = link.precision.slice(base.length + 2); delete link.precision; } const L = links.get(id) || links.set(id, {}).get(id); (L[kind] ||= []).push(link); stats[kind] = stats[kind] || { links: 0, buildings: new Set(), by_key: {}, by_confidence: {} }; const s = stats[kind]; s.links++; s.buildings.add(id); s.by_key[link.key] = (s.by_key[link.key] || 0) + 1; s.by_confidence[link.confidence] = (s.by_confidence[link.confidence] || 0) + 1; };
const unjoined = {};
const miss = (kind, why) => { const u = unjoined[kind] ||= {}; u[why] = (u[why] || 0) + 1; };
const table = (key) => readJ(join(LDS, key, key + '.json'));
const sources = {};
const src = (key, file) => { const m = (file.endsWith('.geojson') ? readJ(join(LDS, key, file)) : readJ(join(LDS, key, file))).meta; sources[key] = { dataset: m.dataset, title: m.source, page: m.page, licence: m.licence, attribution: m.attribution, file: `feeds/london-datastore/${key}/${file}` }; return m; };

// 1. heat demand and 2. solar potential by TOID (the registry's toids come from OS Open Linked Identifiers through the UPRNs)
const byToid = new Map(); for (const b of B) for (const t of b.toids || []) (byToid.get(t) || byToid.set(t, []).get(t)).push(b.id);
const TOID_PREC = 'OS MasterMap TopographicArea TOID of the building (the registry has it through OS Open Linked Identifiers from the UPRNs in the outline)';
{
  const t = table('heat-demand'); src('heat-demand', 'heat-demand.json');
  const h = t.tables[0].header_rows[0], ix = k => h.indexOf(k);
  for (const r of t.tables[0].rows) {
    const bs = byToid.get(r[ix('OS_TOID')]); if (!bs) continue;
    for (const id of bs) add(id, 'heat', { toid: r[ix('OS_TOID')], kwh_year: Math.round(r[ix('KWH')]), peak_kw: +(+r[ix('PEAK_KW')]).toFixed(1), decs: r[ix('DECS')], epcs: r[ix('EPCS')], residential: r[ix('RESI_COUNT')], non_residential: r[ix('NONRESI_COUNT')], method: r[ix('DEMAND_ESTIMATION_METHOD')],
      key: 'TOID', precision: TOID_PREC + (bs.length > 1 ? `; the TOID is on ${bs.length} registry buildings` : ''), confidence: bs.length > 1 ? 'medium' : 'high' });
  }
  // the other direction: heat rows whose point lies in a registry outline but whose TOID the registry lacks (counted, not linked)
  let pointOnly = 0; for (const r of t.tables[0].rows) if (!byToid.has(r[ix('OS_TOID')])) pointOnly++;
  miss('heat', `zone rows with a TOID that no registry building has: ${pointOnly} (most are outside the Canary Wharf box)`);
}
{
  const t = table('solar-opportunity'); src('solar-opportunity', 'solar-opportunity.json');
  const h = t.tables[0].header_rows[0], ix = k => h.indexOf(k);
  for (const r of t.tables[0].rows) {
    const bs = byToid.get(r[ix('fid_topo')]); if (!bs) continue;
    for (const id of bs) add(id, 'solar', { toid: r[ix('fid_topo')], avg_potential_m2_viable: +(+r[ix('avg_potential_m2_viable')]).toFixed(1), area3d_in_potential: +(+r[ix('area3d_in_potential')]).toFixed(3), sum_total_potential: +(+r[ix('sum_total_potential')]).toFixed(1), avg_tilt: +(+r[ix('avg_tilt')]).toFixed(1), lidar_date: r[ix('lidar_date')],
      key: 'TOID', precision: TOID_PREC + (bs.length > 1 ? `; the TOID is on ${bs.length} registry buildings` : ''), confidence: bs.length > 1 ? 'medium' : 'high', ...(+r[ix('lidar_date')] <= 2012 ? { fault: 'F30: rated from LiDAR of ' + r[ix('lidar_date')] + '; check the building is older' } : {}) });
  }
}
// 3. cultural venues: UPRN (amended copy: the original value unless rounded; an amended value only at high or medium
// confidence), else the venue point in the outline. F25 layers (a constant offset) get position links at low confidence only.
{
  const key = 'cultural-infrastructure', file = 'cultural-infrastructure.uprn-amended.geojson'; src(key, file);
  const d = readJ(join(LDS, key, file)), am = readJ(join(LDS, key, 'cultural-infrastructure.uprn-amendments.json'));
  const offsetLayers = new Set(Object.keys(am.meta?.catalogue?.group_offsets || {}));
  for (const f of d.features) {
    const P = f.properties, [lon, lat] = f.geometry.coordinates; if (!inCw(lon, lat)) { miss('venues', 'outside the registry area'); continue; }
    const u = P.os_addressbase_uprn ? String(P.os_addressbase_uprn) : null;
    const usable = u && !P.uprn_unresolved && (!P.uprn_suspect || (P.uprn_amended && ['high', 'medium'].includes(P.uprn_amended.confidence)));
    const base = { dataset: '23697', id: P.id, name: P.name, type: String(P.layer || '').replace(/^cultural_venues_CIM 2023 /, ''), uprn: u };
    let home = null;
    if (usable && uprnPt.has(u)) { const p = uprnPt.get(u), h = buildingAt(p[0], p[1], 0); if (h) home = { id: h.id, key: P.uprn_amended ? 'UPRN (amended, F22)' : 'UPRN', precision: 'OS Open UPRN point inside the outline', confidence: P.uprn_amended ? P.uprn_amended.confidence : 'high' }; else miss('venues', 'UPRN point in no registry outline'); }
    if (!home) { const h = buildingAt(lon, lat); if (h) home = { id: h.id, key: 'position', precision: 'the venue point inside the outline, or within 12 m of it', ...(h.how !== 'inside' ? { how: h.how } : {}), confidence: offsetLayers.has(P.layer) ? 'low' : h.how === 'inside' ? 'medium' : 'low', ...(offsetLayers.has(P.layer) ? { fault: 'F25: the layer has a constant position offset' } : {}) }; }
    if (home) add(home.id, 'venues', { ...base, key: home.key, precision: home.precision, confidence: home.confidence, ...(home.how ? { how: home.how } : {}), ...(home.fault ? { fault: home.fault } : {}) }); else miss('venues', 'no outline at the UPRN point or the venue point');
  }
}
// point sets whose points are grid cells, sensors, area centroids or zone markers, not places in a building: not joined
const NOT_PLACES = /laei|atmospheric|emissions|heat-island|breathe|pm25|noise|bus-stop|air-quality|broadband|transport-accessibility|digital-exclusion|mortality|mylondon|town-centre-locations|intensification|opportunity-area|strategic-industrial-location|sub-regions|boundar|lvmf|census|population|emission-zone|low-emission|water-quality/;
// 4. point datasets by position in the outline: brownfield sites (a land parcel's point: the building stands on the site),
// and the points of the other harvests that name a place (EV charging sites, LDD permissions, schools, plot ratios...)
const POINT_SETS = [];
// the harvested folders named in feeds/london-datastore/index.json (tools/lds-harvest-auto.mjs index)
const INDEXED = new Set(readJ(join(LDS, 'index.json')).datasets.map(d => d.key));
for (const k of readdirSync(LDS)) {
  const f = join(LDS, k, k + '.geojson'); if (!INDEXED.has(k) || !existsSync(f) || ['cultural-infrastructure', 'urban-heat-island-2016', 'air-quality-annual-objectives', 'statistical-boundaries'].includes(k) || NOT_PLACES.test(k)) continue;
  const d = readJ(f); if (!d.features.some(x => x.geometry?.type === 'Point')) continue; POINT_SETS.push(k);
  sources[k] = { dataset: d.meta.dataset, title: d.meta.source, page: d.meta.page, licence: d.meta.licence, attribution: d.meta.attribution, file: `feeds/london-datastore/${k}/${k}.geojson` };
  const kind = k === 'brownfield-register' ? 'brownfield' : 'points';
  for (const x of d.features) {
    if (x.geometry?.type !== 'Point') continue; const [lon, lat] = x.geometry.coordinates; if (!inCw(lon, lat)) continue;
    const h = buildingAt(lon, lat, 0); if (!h) { miss(kind, `${k}: point in no registry outline`); continue; }
    const P = x.properties, name = P.sitenameaddress || P.name || P.site_name || P.SiteName || P['Site Name'] || P.address || P.Address || P['Borough Reference'] || P.borough_ref || null;
    add(h.id, kind, { dataset: d.meta.dataset, set: k, name: name ? String(name).slice(0, 120) : null, ref: P.sitereference || P['Permission ID'] || P.permission_id || P.id || null,
      key: 'position', precision: kind === 'brownfield' ? 'the site point lies inside the building outline (a site can hold several buildings; the point is one of them)' : 'the record point lies inside the building outline', confidence: kind === 'brownfield' ? 'low' : 'medium' });
  }
}
// 5. the area of the building: LSOA 2021, MSOA 2021 and ward (2018) whose polygon holds the building centre
const areaOf = new Map();
{
  const d = readJ(join(LDS, 'statistical-boundaries', 'statistical-boundaries.geojson')); src('statistical-boundaries', 'statistical-boundaries.geojson');
  const polys = d.features.map(f => { const P = f.properties, code = P.lsoa21cd || P.LSOA21CD || P.msoa21cd || P.MSOA21CD || P.GSS_CODE || P.gss_code; const t = /^E01/.test(code) ? 'lsoa21' : /^E02/.test(code) ? 'msoa21' : /^E05/.test(code) ? 'ward2018' : null;
    const name = P.lsoa21nm || P.LSOA21NM || P.msoa21nm || P.MSOA21NM || P.NAME || P.name; const g = f.geometry; return { t, code, name, polys: g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [] }; }).filter(p => p.t);
  for (const b of B) {
    if (b.lat == null) continue; const a = {};
    for (const p of polys) if (!a[p.t] && p.polys.some(rs => pointIn([b.lon, b.lat], rs[0]) && !rs.slice(1).some(h => pointIn([b.lon, b.lat], h)))) a[p.t] = { code: p.code, name: p.name };
    if (Object.keys(a).length) { areaOf.set(b.id, a); add(b.id, 'area', { ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.code])), key: 'position', precision: 'the building centre (registry lat/lon) lies in the polygon; a building on a boundary takes the side of its centre', confidence: 'high' }); }
  }
}
// ---- the census context of each zone LSOA and ward that holds a registry building (2021, with change since 2011)
const ctx = { lsoa21: {}, ward: {} };
const pick = (key, sheetRe, cols) => {
  const t = table(key), out = {};
  for (const tb of t.tables) { if (!sheetRe.test(tb.table)) continue; const h = tb.header_rows.at(-1).map(x => String(x ?? '').trim());
    for (const r of tb.rows) { const code = r.find(v => typeof v === 'string' && /^E0[15]\d{6}$/.test(v)); if (!code) continue; const o = out[code] ||= {};
      for (const [name, label] of Object.entries(cols)) { const i = h.findIndex(x => x.toLowerCase() === label.toLowerCase()); if (i >= 0 && typeof r[i] === 'number') o[name] = r[i]; } } }
  return out;
};
const lsoaWanted = new Set([...areaOf.values()].map(a => a.lsoa21?.code).filter(Boolean));
const merge = (target, part) => { for (const [c, o] of Object.entries(part)) if (lsoaWanted.has(c)) Object.assign(target[c] ||= {}, o); };
src('census2021-lsoa-demography-migration', 'census2021-lsoa-demography-migration.json'); src('census2021-lsoa-housing', 'census2021-lsoa-housing.json');
merge(ctx.lsoa21, pick('census2021-lsoa-demography-migration', /Five year age bands\.xlsx#2021$/, { residents: 'All usual residents' }));
merge(ctx.lsoa21, Object.fromEntries(Object.entries(pick('census2021-lsoa-demography-migration', /Five year age bands\.xlsx#change/, { residents: 'All usual residents' })).map(([c, o]) => [c, { residents_change_2011: o.residents }])));
merge(ctx.lsoa21, pick('census2021-lsoa-demography-migration', /Country of birth\.xlsx#2021$/, { born_uk: 'United Kingdom' }));
merge(ctx.lsoa21, pick('census2021-lsoa-housing', /tenure - households\.xlsx#2021$/, { households: 'All Households', owned_outright: 'Owned outright', owned_mortgage: 'Owned with a mortgage or loan', shared_ownership: 'Shared ownership', social_la: 'Rented from Local Authority', social_other: 'Other social rented', private_rented: 'Private landlord or letting agency', private_other: 'Other private rented' }));
merge(ctx.lsoa21, pick('census2021-lsoa-housing', /cars or vans\.xlsx#2021$/, { no_car: 'none', households_cars: 'All households' }));
merge(ctx.lsoa21, pick('census2021-lsoa-demography-migration', /Household deprivation\.xlsx#2021$/, { not_deprived: 'deprived in: no dimensions', households_dep: 'All Households' }));
for (const [c, o] of Object.entries(ctx.lsoa21)) { const a = [...areaOf.values()].find(x => x.lsoa21?.code === c); o.name = a?.lsoa21?.name || null; }

// ---- write
const out = {
  meta: {
    made: today, tool: 'tools/join-lds.mjs',
    method: 'Links London Datastore harvests to registry buildings (cwb- ids). Keys, first that applies: TOID (heat demand, solar potential: the registry building\'s TOIDs from OS Open Linked Identifiers); UPRN (cultural venues: the OS Open UPRN point of the venue\'s UPRN inside the outline; amended values of the F22 copy only at high or medium confidence; rounded and unresolved values never); position (the record\'s point inside the outline, smallest outline first; venues also within 12 m). Area: the building centre in the LSOA 2021, MSOA 2021 and ward 2018 polygons (statistical-boundaries).',
    precision: PREC,
    confidence: { high: 'an identifier the source and the registry share (TOID, UPRN) and one building', medium: 'a point inside one outline, or an amended UPRN of medium confidence, or a TOID on two or more registry buildings', low: 'a point within 12 m of an outline, a venue layer with the F25 offset, or a brownfield site point (a site can hold several buildings)' },
    sources, point_sets: POINT_SETS,
    counts: Object.fromEntries(Object.entries(stats).map(([k, s]) => [k, { links: s.links, buildings: s.buildings.size, by_key: s.by_key, by_confidence: s.by_confidence }])),
    unjoined,
    registry: { buildings: B.length, outlines: outlines.length, uprn_points: uprnPt.size },
    licence_note: 'Each link carries data of its source dataset (sources: licence and attribution). The GLA cannot warrant the quality or accuracy of the data.',
  },
  buildings: Object.fromEntries([...links.entries()].sort()),
};
writeFileSync(join(OUTD, 'building-links.json'), '{"meta":' + JSON.stringify(out.meta, null, 1) + ',\n"buildings":{\n' + Object.entries(out.buildings).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + '\n}}\n');
const cmeta = { made: today, tool: 'tools/join-lds.mjs', what: 'headline 2021 Census figures of the LSOAs that hold a registry building (by the building centre), for the record card; the full tables are in feeds/london-datastore/census2021-lsoa-*', sources: { 'census2021-lsoa-demography-migration': sources['census2021-lsoa-demography-migration'], 'census2021-lsoa-housing': sources['census2021-lsoa-housing'] },
  columns: { residents: 'All usual residents (2021)', residents_change_2011: 'change in all usual residents, 2011 to 2021 (2011 LSOA figures as the GLA tables give them on 2021 LSOAs)', born_uk: 'usual residents born in the United Kingdom', households: 'all households (tenure table)', owned_outright: 'owned outright', owned_mortgage: 'owned with a mortgage or loan', shared_ownership: 'shared ownership', social_la: 'rented from the local authority', social_other: 'other social rented', private_rented: 'private landlord or letting agency', private_other: 'other private rented', no_car: 'households with no car or van', households_cars: 'all households (cars table)', not_deprived: 'households deprived in no dimension', households_dep: 'all households (deprivation table)' } };
writeFileSync(join(OUTD, 'area-context.json'), JSON.stringify({ meta: cmeta, lsoa21: ctx.lsoa21 }, null, 0).replace(/\},"/g, '},\n"') + '\n');
console.log(JSON.stringify(out.meta.counts, null, 1)); console.log(JSON.stringify(unjoined)); console.log('lsoa context', Object.keys(ctx.lsoa21).length, 'uprn points', uprnPt.size);
