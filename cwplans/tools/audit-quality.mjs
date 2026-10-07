// Data-quality audit across every Canary Wharf source: runs the same checks on each rebuild and writes
// a catalogue of issues, so that compositing rules are designed from measured error classes, not from
// individual fixes.
//
//   node magpie/cwplans/tools/audit-quality.mjs         # about 3 seconds
//
// in:  registry/buildings.json, atlas/data/atlas.json, postcodes/postcodes.json,
//      data/raw/registry/osm-cw.json.gz, data/raw/registry/fhrs/FHRS530-*.json.gz, data/raw/registry/wikidata-cw.json,
//      registry/sources/brands/branches.json, registry/sources/brands/cwg-directory.json,
//      registry/companies-by-postcode.json, data/sourced-levels.json, docklands/data/area.js, docklands/data/indoor.js,
//      data/raw/registry/wikidata-occupant-classes.json, registry/sources/museums/records-open.json
// Every input and output, with endpoints and rules: magpie/cwplans/pipeline.json, activity "audit-quality".
// out: quality/issues.json (checks with counts, rates and examples; one record per issue)
//      quality/CATALOGUE.md (generated tables). The analysis is quality/README.md (hand-written).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { TOOLS } from './lib.mjs';
import { osmLevelsUnread } from './osm-values.mjs';

const CW = join(TOOLS, '..');
const json = p => JSON.parse(p.endsWith('.gz') ? gunzipSync(readFileSync(join(CW, p))) : readFileSync(join(CW, p), 'utf8'));
const REG = json('registry/buildings.json'), AT = json('atlas/data/atlas.json'), PC = json('postcodes/postcodes.json');
const OSM = json('data/raw/registry/osm-cw.json.gz'), WD = json('data/raw/registry/wikidata-cw.json');
const fhrsFile = readdirSync(join(CW, 'data/raw/registry/fhrs')).filter(f => /^FHRS530-.*\.json\.gz$/.test(f)).sort().at(-1);
const FSA = json(`data/raw/registry/fhrs/${fhrsFile}`);
const BR = json('registry/sources/brands/branches.json'), CWG = json('registry/sources/brands/cwg-directory.json');
const CO = json('registry/companies-by-postcode.json').postcodes;

const TODAY = new Date('2026-10-03');
const BOX = REG.summary.box, inBox = (lon, lat) => lon >= BOX[0] && lon <= BOX[2] && lat >= BOX[1] && lat <= BOX[3];
const dist = (la1, lo1, la2, lo2) => { const R = 6371008, r = Math.PI / 180, x = (lo2 - lo1) * r * Math.cos((la1 + la2) / 2 * r), y = (la2 - la1) * r; return Math.round(Math.hypot(x, y) * R); };
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(\d+\)/g, ' ').replace(/&/g, ' and ')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\b(the|ltd|limited|plc|uk|london|canary wharf|e14)\b/g, ' ').replace(/\s+/g, ' ').trim();
const PC_RE = /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/;
const normPc = pc => String(pc || '').toUpperCase().replace(/\s+/g, '').replace(/^(.+)(\d[A-Z]{2})$/, '$1 $2');
const pcs = new Map(PC.postcodes.map(p => [p.pc, p]));
const atB = new Map(AT.buildings.map(b => [b.id, b]));
const levelNum = l => { const m = /^\s*(-?\d+)\s*$/.exec(String(l ?? '')); return m ? +m[1] : null; };
const cwgLevel = s => { const m = /(-?\d+)/.exec(String(s || '')); return m ? +m[1] : /street|ground/i.test(s || '') ? 0 : null; };

// ---- OSM features with a position
const ways = new Map(OSM.features.filter(f => f.type === 'way').map(f => [f.id, f]));
const posOf = f => { if (f.type === 'node') return [f.lon, f.lat]; const rs = (f.refs || []).map(r => OSM.nodes[r]).filter(Boolean); if (!rs.length) return null; return [rs.reduce((s, p) => s + p[0], 0) / rs.length, rs.reduce((s, p) => s + p[1], 0) / rs.length]; };
const osmPos = new Map(OSM.features.map(f => [`${f.type}/${f.id}`, posOf(f)]));
const OCC_KEYS = ['shop', 'amenity', 'office', 'leisure', 'healthcare', 'tourism', 'craft'];

// ---- checks
const checks = [], issues = [];
function check(c) { c.issues = 0; checks.push(c); return (rec) => { c.issues++; issues.push({ check: c.id, ...rec }); }; }
const ex = (c, rows, n = 8) => { c.examples = rows.slice(0, n); };

// ===== A. identity and entity resolution
{
  const c = { id: 'ID-1', cls: 'identity', dim: 'uniqueness', title: 'One Wikidata item on more than one building', sources: ['wikidata', 'osm'],
    method: 'Group registry buildings by their Wikidata item.', rule: 'One item to one outline. An OSM wikidata tag outranks containment of the item coordinate; when an item names a complex (tower over a mall), attach it to the tower outline and list the podium as a separate building.' };
  const add = check(c), by = new Map();
  for (const b of REG.buildings) if (b.wikidata) by.set(b.wikidata, [...(by.get(b.wikidata) || []), b]);
  const rows = [];
  for (const [q, bs] of by) if (bs.length > 1) { rows.push({ q, buildings: bs.map(b => b.id) }); for (const b of bs) add({ ent: 'b', id: b.id, sev: 'high', note: `${q} is also on ${bs.filter(x => x !== b).map(x => x.id).join(', ')}` }); }
  c.population = by.size; ex(c, rows);
}
{
  const c = { id: 'ID-2', cls: 'identity', dim: 'uniqueness', title: 'Same occupant recorded twice in one building', sources: ['osm', 'fsa', 'wikidata', 'cwg'],
    method: 'Within each building, occupants whose normalised names are equal (case, punctuation, "(n)" branch numbers, "Ltd", "the" removed). Split by whether the two records come from different sources (not merged) or the same source (mapped twice).', rule: 'Merge on normalised name within one building, keeping every source record as provenance under one occupant id; same-source pairs need a human or a second key (FSA id, OSM id) before merging.' };
  const add = check(c), rows = []; let cross = 0, same = 0, pop = 0;
  for (const b of REG.buildings) {
    const g = new Map(); for (const o of b.occupants) { pop++; const k = norm(o.name); if (k.length < 3) continue; g.set(k, [...(g.get(k) || []), o]); }
    for (const [k, os] of g) if (os.length > 1) {
      const srcs = [...new Set(os.map(o => o.source))], kind = srcs.length > 1 ? 'different sources' : 'same source';
      kind === 'different sources' ? cross++ : same++;
      rows.push({ building: b.id, name: os.map(o => o.name).join(' | '), sources: os.map(o => o.source).join('+'), kind });
      add({ ent: 'b', id: b.id, sev: 'medium', note: `"${os[0].name}" ×${os.length} (${os.map(o => o.source).join(', ')})`, kind });
    }
  }
  c.population = pop; c.breakdown = { 'different sources (not merged)': cross, 'same source (mapped twice)': same }; ex(c, rows, 10);
}
{
  const c = { id: 'ID-3', cls: 'identity', dim: 'accuracy', title: 'Building named after an occupant or owner', sources: ['osm', 'wikidata'],
    method: 'OSM name of the outline equals (after normalisation) the name or brand of an occupant, or the owner. Medium when Wikidata names the building differently or the building has several occupants; low for a single-use building (a pub, a hotel), where the name may be right.', rule: 'Keep building name and occupant name as separate attributes. Building name precedence: Wikidata label, then OSM name unless it matches an occupant or brand, then address.' };
  const add = check(c), rows = [];
  for (const b of REG.buildings) {
    if (!b.osm_name) continue; const k = norm(b.osm_name);
    const hit = b.occupants.find(o => o.source !== 'wikidata' && (norm(o.name) === k || norm(o.brand) === k)) || b.owners.find(o => norm(o.name) === k);
    if (hit && (!b.wikidata || norm(b.name) !== k)) { rows.push({ building: b.id, osm_name: b.osm_name, wikidata_name: b.wikidata ? b.name : null }); const sole = b.occupants.filter(o => o.source !== 'wikidata').length <= 2 && !b.wikidata; add({ ent: 'b', id: b.id, sev: sole ? 'low' : 'medium', note: `OSM name "${b.osm_name}" is an occupant${b.wikidata ? `; Wikidata: "${b.name}"` : sole ? ' (single-use building: may be correct)' : ''}` }); }
  }
  c.population = REG.buildings.filter(b => b.osm_name).length; ex(c, rows);
}
{
  const c = { id: 'ID-4', cls: 'identity', dim: 'consistency', title: 'Item and outline describe different things (granularity)', sources: ['wikidata', 'osm', 'lidar'],
    method: 'Wikidata height is more than twice the measured height of the outline it is attached to (LiDAR or OSM): the item is a tower, the outline a podium or a part.', rule: 'Model buildings as a hierarchy (complex, building, part) with each source attached at its own level; do not copy tower attributes onto a podium.' };
  const add = check(c), rows = [];
  for (const a of AT.buildings) { const meas = a.mh ?? a.h; if (a.wh && meas && a.wh > 2 * meas) { rows.push({ building: a.id, name: a.n, wikidata_height: a.wh, measured: meas }); add({ ent: 'b', id: a.id, sev: 'high', note: `Wikidata ${a.wh} m vs measured ${meas} m` }); } }
  c.population = AT.buildings.filter(a => a.wh).length; ex(c, rows);
}

// ===== B. position
{
  const c = { id: 'SP-1', cls: 'position', dim: 'completeness', title: 'Named OSM occupant outside every building outline', sources: ['osm'],
    method: 'Named OSM shops, offices, amenities, leisure, healthcare, tourism and craft features in the box that the registry did not place in or within 12 m of an outline.', rule: 'Keep as unplaced occupants with their own position; attach to a building only through a second key (address, postcode with one building, mall).' };
  const add = check(c), placed = new Set(REG.buildings.flatMap(b => b.occupants.map(o => o.osm).filter(Boolean))), rows = []; let pop = 0;
  for (const f of OSM.features) {
    const t = f.tags || {}; if (!t.name || !OCC_KEYS.some(k => t[k]) || t.building) continue;
    const p = osmPos.get(`${f.type}/${f.id}`); if (!p || !inBox(p[0], p[1])) continue; pop++;
    const key = `${f.type}/${f.id}`; if (placed.has(key)) continue;
    const kind = OCC_KEYS.find(k => t[k]); rows.push({ osm: key, name: t.name, kind: `${kind}=${t[kind]}` });
    add({ ent: 'osm', id: key, sev: 'low', note: `${t.name} (${kind}=${t[kind]})`, lat: p[1], lon: p[0] });
  }
  c.population = pop; ex(c, rows);
}
{
  const c = { id: 'SP-2', cls: 'position', dim: 'accuracy', title: 'Occupant placed by proximity, not containment', sources: ['osm', 'fsa'],
    method: 'Occupants with placed = "near" (point outside the outline but within 12 m), against all placed occupants.', rule: 'Store placement method and distance with each link; treat proximity links as lower confidence in joins.' };
  const add = check(c); let pop = 0;
  // occupants placed by a key (CWG mall, street address, postcode: they carry placed_confidence) are SP-7, not here
  for (const b of REG.buildings) for (const o of b.occupants) { if (!o.placed || o.placed_confidence) continue; pop++; if (o.placed !== 'inside') add({ ent: 'b', id: b.id, sev: 'low', note: `${o.name}: ${o.placed}` }); }
  c.population = pop;
}
{
  const c = { id: 'SP-3', cls: 'position', dim: 'accuracy', title: 'FSA position is the postcode centre, or shared by several premises', sources: ['fsa', 'onspd'],
    method: 'FSA premises in E14 with a position: within 3 m of the ONSPD point for their own postcode, or at exactly the same coordinate as two or more other premises.', rule: 'Give each position a precision class (surveyed point, address point, postcode centroid). A postcode-centroid position may place an occupant in a postcode, never in a building.' };
  const add = check(c), withPos = FSA.establishments.filter(e => e.lat != null), stack = new Map(), rows = [];
  for (const e of withPos) { const k = `${e.lat.toFixed(6)},${e.lon.toFixed(6)}`; stack.set(k, [...(stack.get(k) || []), e]); }
  let centroid = 0, piled = 0;
  for (const e of withPos) {
    const p = pcs.get(normPc(e.postcode)), d = p && p.lat != null ? dist(e.lat, e.lon, +p.lat, +p.lon) : null, n = stack.get(`${e.lat.toFixed(6)},${e.lon.toFixed(6)}`).length;
    const why = []; if (d != null && d <= 3) { why.push(`${d} m from the postcode centre`); centroid++; } if (n >= 3) { why.push(`${n} premises at one point`); piled++; }
    if (why.length) { rows.push({ fhrs: e.id, name: e.name, postcode: e.postcode, why: why.join('; ') }); add({ ent: 'fsa', id: String(e.id), sev: 'medium', note: `${e.name}: ${why.join('; ')}`, pc: normPc(e.postcode) }); }
  }
  c.population = withPos.length; c.breakdown = { 'at the postcode centre': centroid, 'shared point (3 or more)': piled, 'without any position': FSA.establishments.length - withPos.length }; ex(c, rows);
}
{
  const c = { id: 'SP-4', cls: 'position', dim: 'consistency', title: 'Same branch placed far apart by two sources', sources: ['osm', 'fsa'],
    method: 'Branches matched to both an OSM feature and an FSA record that both have positions: distance between them.', rule: 'Prefer the OSM position for placement (mapped on site) and keep the FSA id as an attribute; above 50 m, re-check the match itself.' };
  const add = check(c), fsaById = new Map(FSA.establishments.map(e => [e.id, e])), rows = [], ds = [];
  for (const b of BR.branches) {
    const p = b.osm_id && osmPos.get(b.osm_id), ids = b.fhrs_ids || (b.fhrs_id ? [b.fhrs_id] : []);
    for (const id of ids) { const e = fsaById.get(+id); if (!p || !e || e.lat == null) continue; const d = dist(p[1], p[0], e.lat, e.lon); ds.push(d);
      if (d > 50) { rows.push({ brand: b.brand, name: b.name, osm: b.osm_id, fhrs: id, metres: d }); add({ ent: 'brand', id: b.brand, sev: d > 150 ? 'high' : 'medium', note: `${b.name}: OSM and FSA ${d} m apart`, lat: p[1], lon: p[0] }); } }
  }
  ds.sort((a, b) => a - b); c.population = ds.length; c.stats = ds.length ? { median_m: ds[ds.length >> 1], p90_m: ds[Math.floor(ds.length * .9)], max_m: ds.at(-1) } : null; ex(c, rows.sort((a, b) => b.metres - a.metres));
}
{
  const c = { id: 'SP-5', cls: 'position', dim: 'consistency', title: 'Postcode far from the feature that carries it', sources: ['osm', 'fsa', 'onspd'],
    method: 'OSM features with addr:postcode and FSA premises with a position: distance to the ONSPD point of that postcode. Flagged above 300 m.', rule: 'A postcode is a delivery attribute, not a location. Use it to find candidates, then confirm with geometry; large-user and estate postcodes cover many buildings.' };
  const add = check(c), rows = []; let pop = 0;
  const test = (src, key, name, pc, lat, lon) => { const p = pcs.get(normPc(pc)); if (!p || p.lat == null) return; pop++; const d = dist(lat, lon, +p.lat, +p.lon); if (d > 300) { rows.push({ source: src, key, name, postcode: normPc(pc), metres: d }); add({ ent: 'pc', id: normPc(pc), sev: d > 1000 ? 'high' : 'medium', note: `${src} ${name || key} is ${d} m from the postcode point`, lat, lon }); } };
  for (const f of OSM.features) { const t = f.tags || {}; if (!t['addr:postcode']) continue; const p = osmPos.get(`${f.type}/${f.id}`); if (p && inBox(p[0], p[1])) test('OSM', `${f.type}/${f.id}`, t.name, t['addr:postcode'], p[1], p[0]); }
  for (const e of FSA.establishments) if (e.lat != null && inBox(e.lon, e.lat)) test('FSA', e.id, e.name, e.postcode, e.lat, e.lon);
  c.population = pop; ex(c, rows.sort((a, b) => b.metres - a.metres));
}

{
  const c = { id: 'SP-6', cls: 'position', dim: 'accuracy', title: 'Mall or below-ground occupant placed by a 2D footprint', sources: ['osm', 'fsa', 'cwg'],
    method: 'Occupants in a mall (CWG) or below ground (OSM level under 0, or a CWG "Mall Level -1"/"Lower Mall" level) that the registry placed in an outline which is not that mall (by its name, OSM name or OSM addr:housename) and has no recorded floor below ground. The Canary Wharf malls run under several building footprints, so a point-in-outline test assigns their shops to whichever building is above.', rule: 'Place mall and below-ground occupants in the mall (a 3D volume or a named complex) by its own key (CWG mall, OSM indoor and level), not by the 2D outline above them; keep the footprint building only as "above".' };
  const add = check(c), rows = [], kinds = { 'mall names another complex': 0, 'below ground, building has no basement record': 0 }; let pop = 0;
  for (const b of REG.buildings) for (const o of b.occupants) {
    const below = (levelNum(o.level) ?? 0) < 0 || (cwgLevel(o.level_cwg) ?? 0) < 0 || /lower mall/i.test(o.level_cwg || '');
    if (!o.mall && !below) continue; pop++;
    const names = [b.name, b.osm_name, b.housename].filter(Boolean).map(norm), m = o.mall && norm(o.mall);
    const where = `${o.mall || 'below ground'}${o.level_cwg ? ', ' + o.level_cwg : o.level != null ? ', level ' + o.level : ''}`;
    if (m && !names.some(x => x.includes(m) || m.includes(x))) { kinds['mall names another complex']++; rows.push({ building: b.id, building_name: b.name, occupant: o.name, mall: o.mall, level: o.level ?? o.level_cwg, placed: o.placed }); add({ ent: 'b', id: b.id, sev: 'medium', note: `${o.name} (${where}) placed in ${b.name || b.id} (${o.placed})` }); }
    else if (!m && below && !(b.levels_underground > 0)) { kinds['below ground, building has no basement record']++; add({ ent: 'b', id: b.id, sev: 'low', note: `${o.name} (${where}) in ${b.name || b.id}, which has no recorded floor below ground` }); }
  }
  c.population = pop; c.breakdown = kinds; ex(c, rows, 10);
}

// ===== C. attribute conflicts
{
  const c = { id: 'AT-1', cls: 'attribute conflict', dim: 'accuracy', title: 'Building heights disagree between sources', sources: ['osm', 'wikidata', 'lidar'],
    method: 'Pairs of OSM height tag, Wikidata height and LiDAR height (only where the 3D model took the height from LiDAR) that differ by more than 10 m and 10%. ID-4 cases (granularity) are left out.', rule: 'Keep every height with its source and date. For display: LiDAR for buildings older than the survey, the OSM tag or Wikidata for newer ones, and flag any pair beyond the tolerance.' };
  const add = check(c), rows = [], pairs = { 'OSM vs Wikidata': 0, 'Wikidata vs LiDAR': 0, 'OSM levels vs LiDAR (newer than LiDAR)': 0 }; let pop = 0;
  for (const a of AT.buildings) {
    const v = []; if (a.h != null) v.push(['OSM', a.h]); if (a.wh != null) v.push(['Wikidata', a.wh]); if (a.mh != null && a.ms === 'lidar') v.push(['LiDAR', a.mh]);
    if (v.length > 1) pop++;
    if (a.ms === 'newer') { pairs['OSM levels vs LiDAR (newer than LiDAR)']++; add({ ent: 'b', id: a.id, sev: 'low', note: 'LiDAR shows under half the height the floor count gives: built or raised after the survey' }); }
    if (a.wh && (a.mh ?? a.h) && a.wh > 2 * (a.mh ?? a.h)) continue;
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
      const d = Math.abs(v[i][1] - v[j][1]); if (d > 10 && d > .1 * Math.max(v[i][1], v[j][1])) {
        const k = `${v[i][0]} vs ${v[j][0]}`; pairs[k] = (pairs[k] || 0) + 1; rows.push({ building: a.id, name: a.n, [v[i][0]]: v[i][1], [v[j][0]]: v[j][1] });
        add({ ent: 'b', id: a.id, sev: 'medium', note: `${v[i][0]} ${v[i][1]} m vs ${v[j][0]} ${v[j][1]} m` });
      }
    }
  }
  c.population = pop; c.breakdown = pairs; ex(c, rows);
}
{
  const c = { id: 'AT-2', cls: 'attribute conflict', dim: 'accuracy', title: 'Floor counts disagree, or do not fit the height', sources: ['osm', 'wikidata', 'lidar'],
    method: 'OSM building:levels against Wikidata floors above ground (difference of 2 or more); and height divided by floors outside 2.5 to 6 m.', rule: 'Floors and height are separate attributes with their own sources; derive storey height only where both come from one source, and mark plausibility failures instead of correcting them.' };
  const add = check(c), rows = [], br = { 'OSM vs Wikidata floors': 0, 'implausible storey height': 0 }; let pop = 0;
  for (const b of REG.buildings) {
    const a = atB.get(b.id), wdf = parseFloat(b.facts?.['floors above ground']?.[0]), osmL = b.levels;
    if (osmL != null || Number.isFinite(wdf)) pop++;
    if (osmL != null && Number.isFinite(wdf) && Math.abs(osmL - wdf) >= 2) { br['OSM vs Wikidata floors']++; rows.push({ building: b.id, name: b.name, osm_levels: osmL, wikidata_floors: wdf }); add({ ent: 'b', id: b.id, sev: 'medium', note: `OSM ${osmL} floors vs Wikidata ${wdf}` }); }
    const fl = osmL ?? (Number.isFinite(wdf) ? wdf : null), h = a?.wh || a?.h || a?.mh;
    if (fl >= 3 && h) { const s = h / fl; if (s < 2.5 || s > 6) { br['implausible storey height']++; add({ ent: 'b', id: b.id, sev: 'low', note: `${h} m / ${fl} floors = ${s.toFixed(1)} m per floor` }); } }
  }
  c.population = pop; c.breakdown = br; ex(c, rows);
}
{
  const c = { id: 'AT-3', cls: 'attribute conflict', dim: 'consistency', title: 'OSM level and Canary Wharf Group mall level disagree', sources: ['osm', 'cwg'],
    method: 'Occupants with both an OSM level tag and a CWG level ("Mall Level -1", "Street Level 0"): the offset CWG minus OSM, per mall.', rule: 'Levels are labels in a building-specific scheme, not heights. Keep each source\'s label; map between schemes with a per-mall offset table measured from matched occupants; convert to m OD only through published slab levels.' };
  const add = check(c), per = {}; let pop = 0;
  for (const b of REG.buildings) for (const o of b.occupants) {
    const l1 = levelNum(o.level), l2 = cwgLevel(o.level_cwg); if (l1 == null || l2 == null) continue; pop++;
    const m = o.mall || b.name || b.id, off = l2 - l1; per[m] ||= {}; per[m][off] = (per[m][off] || 0) + 1;
    if (off) add({ ent: 'b', id: b.id, sev: 'medium', note: `${o.name}: OSM level ${o.level}, CWG "${o.level_cwg}"` });
  }
  c.population = pop; c.offsets_by_mall = per;
}
{
  const c = { id: 'AT-4', cls: 'attribute conflict', dim: 'consistency', title: 'Category schemes do not line up (crosswalk)', sources: ['osm', 'fsa', 'nsi'],
    method: 'For branches found in both OSM and the FSA file: pairs of OSM tag and FSA business type, with counts. Not errors in themselves; pairs that cross families (shop against restaurant) are flagged.', rule: 'Map every source category to one project vocabulary with a maintained crosswalk table; keep the source category as provenance.' };
  const add = check(c), fsaById = new Map(FSA.establishments.map(e => [e.id, e])), pairs = {}; let pop = 0;
  for (const b of BR.branches) { const id = b.fhrs_id || b.fhrs_ids?.[0]; const e = id && fsaById.get(+id); if (!e || !b.kv) continue; pop++; const k = `${b.kv} | ${e.type}`; pairs[k] = (pairs[k] || 0) + 1;
    if (/^shop=/.test(b.kv) && /Restaurant|Takeaway|Pub/.test(e.type) || /^amenity=(restaurant|fast_food|cafe)/.test(b.kv) && /Retailers/.test(e.type)) add({ ent: 'brand', id: b.brand, sev: 'low', note: `${b.name}: ${b.kv} vs FSA "${e.type}"` }); }
  c.population = pop; c.crosswalk = Object.entries(pairs).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ pair: k, n }));
}

{
  const c = { id: 'AT-5', cls: 'attribute conflict', dim: 'accuracy', title: 'Station and tunnel levels from different sources disagree', sources: ['tfl', 'wikipedia', 'press', 'crossrail'],
    method: 'Published levels in data/sourced-levels.json grouped by station and line. A depth below ground is turned into m OD with the LiDAR ground at the station node (docklands/data/area.js). Pairs more than 2 m apart are flagged; the control marked superseded_by is the one not applied.', rule: 'A level against a stated datum from the asset owner (TfL rail levels, Crossrail slab levels) outranks a rounded depth from a secondary source. Keep the others as evidence, never average them. A depth "below ground" needs its reference point (street, ticket hall, ground outside the station) before it can be compared.' };
  const add = check(c), L = json('data/sourced-levels.json'), rows = [];
  globalThis.window = globalThis; new Function(readFileSync(join(CW, 'docklands/data/area.js'), 'utf8'))();
  const A = globalThis.DOCKLANDS_AREA, G = A.meta.geo, T = A.terrain;
  const geo = (lon, lat) => { const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; };
  const ground = (lon, lat) => { const [x, z] = geo(lon, lat), i = Math.round((x - T.x0) / T.cell), j = Math.round((z - T.z0) / T.cell); return T.dm[j * T.nx + i] / 10; };
  const od = k => k.level.od ?? Math.round((ground(k.lon, k.lat) - k.level.below_ground) * 10) / 10;
  const by = new Map(); for (const k of L.controls) { const key = `${k.place} | ${k.line}`; by.set(key, [...(by.get(key) || []), k]); }
  for (const [key, ks] of by) { if (ks.length < 2) continue;
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const a = ks[i], b = ks[j], d = Math.abs(od(a) - od(b));
      rows.push({ station: key, a: `${a.id} ${od(a)} m OD`, b: `${b.id} ${od(b)} m OD`, diff_m: Math.round(d * 10) / 10, applied: [a, b].filter(k => !k.superseded_by).map(k => k.id).join(', ') });
      if (d > 2) add({ ent: 'level', id: (a.superseded_by ? a : b).id, lat: a.lat, lon: a.lon, sev: d > 5 ? 'high' : 'medium', note: `${key}: ${a.id} ${od(a)} m OD vs ${b.id} ${od(b)} m OD (${(Math.round(d * 10) / 10)} m apart)` }); } }
  c.population = by.size; ex(c, rows);
}

// ===== D. validity and format
{
  const c = { id: 'VA-1', cls: 'validity', dim: 'validity', title: 'Repeated word in an address', sources: ['fsa', 'osm', 'cwg'],
    method: 'Source address strings (FSA, CWG) with an address word twice in a row ("Unit Unit", "London London"), after the business name is removed from the front of the address (FSA addresses often start with it, and names such as "Tian Tian" repeat on purpose).', rule: 'Normalise addresses into fields (unit, number, building, street, postcode) before matching; never match on the raw string.' };
  const add = check(c), rows = [], RE = /\b(unit|flat|floor|level|suite|building|house|street|road|way|square|place|london|market|wharf|quay|court|lane|stand|shop|kiosk|apartment|mall)[\s,]+\1\b/i; let pop = 0;
  const t = (src, id, s, name) => { if (!s) return; pop++; if (name && s.toLowerCase().startsWith(name.toLowerCase())) s = s.slice(name.length); if (name && RE.test(name) && s.toLowerCase().includes(name.toLowerCase())) s = s.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' '); if (RE.test(s)) { rows.push({ source: src, id, address: s }); add({ ent: src === 'branch' ? 'brand' : src, id: String(id), sev: 'low', note: s }); } };
  for (const e of FSA.establishments) t('fsa', e.id, e.address, e.name);
  for (const d of CWG.directory) t('cwg', d.slug, (d.address_lines || []).join(', '), d.title);
  c.population = pop; ex(c, rows);
}
{
  const c = { id: 'VA-2', cls: 'validity', dim: 'validity', title: 'Level values our parser cannot read', sources: ['osm'],
    method: 'OSM level tags in the box, read by tools/osm-values.mjs osmLevels (lists with ";" or ",", ranges such as "0-2", fractions such as "0.5"). Issues: tokens it cannot read ("G", "roof"). The breakdown counts the readable values that are not a single whole number.', rule: 'Parse levels into a list with the raw value kept; a ranged occupant spans floors, a fractional one is a mezzanine; an unreadable token needs a per-building table, not a guess.' };
  const add = check(c), vals = {}, br = { 'list': 0, 'range': 0, 'fraction': 0, 'comma list (mapping error, read)': 0 }; let pop = 0;
  for (const f of OSM.features) { const l = f.tags?.level; if (l == null) continue; pop++;
    if (levelNum(l) == null) { if (/,/.test(l)) br['comma list (mapping error, read)']++; else if (/;/.test(l)) br.list++; else if (/\d-/.test(l)) br.range++; else if (/\./.test(l)) br.fraction++; }
    const bad = osmLevelsUnread(l); if (bad.length) { vals[l] = (vals[l] || 0) + 1; add({ ent: 'osm', id: `${f.type}/${f.id}`, sev: 'low', note: `level="${l}": cannot read ${bad.join(', ')}${f.tags.name ? ' on ' + f.tags.name : ''}` }); } }
  c.population = pop; c.values = vals; c.breakdown = br;
}
{
  const c = { id: 'VA-3', cls: 'validity', dim: 'validity', title: 'Postcodes that are malformed, never allocated or terminated', sources: ['osm', 'fsa', 'wikidata', 'onspd'],
    method: 'Every postcode on an OSM feature or an FSA premises (OSM lists of several postcodes split on ";"), checked against the UK format and, inside E14, the ONSPD (August 2026). Postcodes outside E14 are checked for format only.', rule: 'Validate postcodes on ingest against the current ONSPD; keep a terminated postcode as history with its end date, never as a current address.' };
  const add = check(c), br = { malformed: 0, 'not in the ONSPD': 0, terminated: 0 }, seen = new Set(); let pop = 0;
  const t = (src, id, raw0, label) => { for (const raw of String(raw0 || '').split(';').map(x => x.trim()).filter(Boolean)) t1(src, id, raw, label); };
  const t1 = (src, id, raw, label) => {
    pop++; const pc = normPc(raw), p = pcs.get(pc), inE14 = /^E14 /.test(pc);
    let why = null; if (!PC_RE.test(pc)) why = 'malformed'; else if (inE14 && !p) why = 'not in the ONSPD'; else if (p && p.status === 'terminated') why = 'terminated';
    if (why && !seen.has(src + id + why)) { seen.add(src + id + why); br[why]++; add({ ent: p ? 'pc' : src, id: p ? pc : String(id), sev: why === 'terminated' ? 'low' : 'medium', note: `${src} ${label || id}: "${raw}" ${why}${p?.terminated ? ` (ended ${String(p.terminated).slice(0, 4)}-${String(p.terminated).slice(4)})` : ''}` }); }
  };
  for (const f of OSM.features) if (f.tags?.['addr:postcode']) t('OSM', `${f.type}/${f.id}`, f.tags['addr:postcode'], f.tags.name);
  for (const e of FSA.establishments) t('FSA', e.id, e.postcode, e.name);
  c.population = pop; c.breakdown = br;
}
{
  const c = { id: 'VA-4', cls: 'validity', dim: 'validity', title: 'Wikidata numbers with extra tokens', sources: ['wikidata'],
    method: 'Numeric Wikidata facts in the registry (height, floors) whose stored value is not a single number ("33 1": two statements joined).', rule: 'Fetch quantity statements with rank and qualifiers; keep the preferred-rank value and list the others.' };
  const add = check(c); let pop = 0;
  for (const b of REG.buildings) for (const k of ['height', 'floors above ground', 'floors below ground']) for (const v of b.facts?.[k] || []) { pop++; if (!/^-?\d+(\.\d+)?$/.test(String(v).trim())) add({ ent: 'b', id: b.id, sev: 'low', note: `${k} = "${v}"` }); }
  c.population = pop;
}

// ===== P. pipeline (faults in this project's own tools, measured on the data)
{
  const c = { id: 'PL-1', cls: 'pipeline', dim: 'validity', title: 'OSM multi-value tags read as one value by our tools', sources: ['osm', 'this project'],
    method: 'OSM separates several values with ";" ("E14 9DT;E14 9FQ"). For every OSM feature in the box whose addr:postcode is a list: is each postcode of the list in the registry record that holds the feature (the building itself, or the building it is an occupant of)? A postcode missing there is a link our tools lost. The breakdown counts list values per tag in the source (not errors in themselves).', rule: 'Split ";" lists on ingest for every tag (tools/osm-values.mjs osmList), keep the order, and test the parsers on multi-value fixtures.' };
  const add = check(c), br = {}; let pop = 0, lists = 0, links = 0;
  for (const f of OSM.features) for (const k of ['addr:postcode', 'level', 'fhrs:id', 'brand:wikidata', 'wikidata', 'building:levels']) {
    const v = f.tags?.[k]; if (v == null) continue; if (String(v).includes(';')) br[k] = (br[k] || 0) + 1;
  }
  const holder = new Map(); for (const b of REG.buildings) { for (const o of b.osm || []) holder.set(o, b); for (const o of b.occupants) if (o.osm) holder.set(o.osm, b); }
  for (const f of OSM.features) {
    const v = f.tags?.['addr:postcode']; if (!v || !String(v).includes(';')) continue; lists++;
    const key = `${f.type}/${f.id}`, b = holder.get(key); if (!b) continue; pop++;
    const want = String(v).split(';').map(normPc).filter(Boolean), lost = want.filter(pc => !(b.postcodes || []).includes(pc)); links += want.length;
    if (lost.length) { const p = osmPos.get(key); add({ ent: 'osm', id: key, sev: 'medium', note: `${f.tags.name || f.tags.building || ''} addr:postcode="${v}": ${lost.length} of ${want.length} postcodes missing from ${b.id}`.trim(), ...(p ? { lat: p[1], lon: p[0] } : {}) }); }
  }
  c.population = pop; c.breakdown = br; c.stats = { features_with_postcode_lists: lists, in_a_registry_record: pop, postcode_links: links };
}

{
  const c = { id: 'PL-2', cls: 'pipeline', dim: 'validity', title: 'Branch addresses with "Unit Unit"', sources: ['osm', 'this project'],
    method: 'registry/sources/brands/tools/build-branches.mjs writes "Unit " before OSM addr:unit, and mappers often put "Unit 14" (not "14") in addr:unit. Counted: OSM addr:unit values that already start with "Unit", and branch addresses that carry the doubled word.', rule: 'Parse unit designators ("Unit", "Kiosk", "Stand") out of the value before formatting; never prefix a label to a free-text field.' };
  const add = check(c); let pop = 0, pre = 0;
  for (const f of OSM.features) { const u = f.tags?.['addr:unit']; if (!u) continue; pop++; if (/^unit\b/i.test(u)) pre++; }
  for (const b of BR.branches) if (/\bUnit Unit\b/.test(b.address || '')) add({ ent: 'brand', id: b.brand, sev: 'low', note: `${b.name}: "${b.address}"` });
  c.population = pop; c.breakdown = { 'OSM addr:unit values starting with "Unit"': pre, 'branch addresses with "Unit Unit"': c.issues };
}

// ===== N. walking network (docklands/data/indoor.js, tools/build-indoor.mjs, from OSM)
{
  globalThis.window = globalThis; new Function(readFileSync(join(CW, 'docklands/data/indoor.js'), 'utf8'))();
  const I = globalThis.DOCKLANDS_INDOOR, m = I.meta, F = m.faults;
  const c1 = { id: 'NET-1', cls: 'routing network', dim: 'completeness', title: 'Parts of the walking network not joined to the rest', sources: ['osm'],
    method: 'Connected parts of the OSM walking network in the Canary Wharf area after joining stairs, escalators, lifts and walkable areas; points and named places outside the largest part.', rule: 'Route only within one connected part; report places that cannot be reached; feed the gaps to mappers or close them from estate plans.' };
  check(c1); c1.population = m.counts.vertices; c1.issues = m.islands.count - 1; c1.stats = { parts: m.islands.count, largest: m.islands.largest, next_largest: m.islands.next, places_not_in_largest: m.islands.places_not_in_largest, below_ground_points: m.islands.below_ground_vertices, below_ground_in_largest: m.islands.below_ground_in_largest }; c1.count_only = 'parts (one issue per unjoined part)';
  const c2 = { id: 'NET-2', cls: 'routing network', dim: 'consistency', title: 'Two levels joined at one point with no stairs, lift or ramp', sources: ['osm'],
    method: 'OSM nodes shared by ways tagged with different levels where no stair, escalator or lift way meets. Often a podium mapped as level 1 meeting a street at level 0, or an unmapped ramp or escalator.', rule: 'Keep the join for routing but label it "level change not mapped"; settle each case from estate plans: a ramp, a missing connector, or a level-scheme difference (the estate podium against street level).' };
  check(c2); c2.population = m.counts.vertices; c2.issues = F.level_jumps; c2.examples = F.examples.level_jumps.map(x => ({ node: x })); c2.count_only = 'shared points';
  const c3 = { id: 'NET-3', cls: 'routing network', dim: 'completeness', title: 'Escalators and lifts without their levels', sources: ['osm'],
    method: 'Escalator ways with no level tag (drawn on level 0, so they change no level), lifts with fewer than two levels, and stairs or escalators whose ends could not be oriented.', rule: 'A connector must state the levels it joins (level=-1;0) and its direction; add the missing tags from station and mall plans.' };
  check(c3); c3.population = m.counts.by_kind.escalator + m.counts.lifts; c3.issues = F.escalators_without_level + F.lifts_without_levels + F.unresolved_connector_ends; c3.breakdown = { 'escalators without level': F.escalators_without_level, 'lifts without two levels': F.lifts_without_levels, 'stairs or escalators with unresolved ends': F.unresolved_connector_ends }; c3.count_only = 'connectors';
  const c4 = { id: 'NET-4', cls: 'routing network', dim: 'completeness', title: 'Places with no mapped corridor on their own level', sources: ['osm'],
    method: 'Named shops, food and drink, services and platforms attached to the network on a different level from their own, because no path on their level lies within 40 m.', rule: 'Map the mall corridors per level (indoor=corridor with level), or attach the place to its mall level from the estate plan; mark such routes as approximate.' };
  check(c4); c4.population = m.counts.places; c4.issues = m.islands.places_on_another_level; c4.count_only = 'places';
  const c5 = { id: 'NET-5', cls: 'routing network', dim: 'consistency', title: 'TfL and OSM number station levels differently', sources: ['tfl', 'osm'],
    method: 'Each TfL step-free station point (GTFS pathways, level index counted from the street) against the level of the nearest OSM network point within 35 m. Pairs that differ show where the two schemes disagree or where OSM lacks the level (the Elizabeth line platforms at Canary Wharf are TfL -4, but the nearest OSM points are at 0).', rule: 'Keep each scheme; join TfL and OSM only at street level; build a per-station level table from published levels (m OD) before mixing schemes.' };
  const schemes = m.tfl_level_schemes || {}; let pairs = 0, differ = 0; const br = {};
  for (const [st, o] of Object.entries(schemes)) for (const [k, n] of Object.entries(o)) { pairs += n; const [, a, b] = /TfL (-?[\d.]+) -> OSM (-?[\d.]+)/.exec(k) || []; if (a !== b) { differ += n; br[`${st}: ${k}`] = n; } }
  check(c5); c5.population = pairs; c5.issues = differ; c5.breakdown = br; c5.count_only = 'station points';
}

// ===== E. currency
{
  const c = { id: 'TM-1', cls: 'currency', dim: 'timeliness', title: 'Food hygiene rating older than three years, or pending', sources: ['fsa'],
    method: 'FSA premises in E14 with a rating date before 2023-10-03, or flagged as awaiting a new rating.', rule: 'Carry the source date on every attribute; for display, age out ratings and say how old each is.' };
  const add = check(c), br = { 'older than 3 years': 0, 'new rating pending': 0, 'no rating date': 0 };
  for (const e of FSA.establishments) {
    if (e.new_rating_pending) { br['new rating pending']++; add({ ent: 'fsa', id: String(e.id), sev: 'low', note: `${e.name}: new rating pending`, pc: normPc(e.postcode) }); }
    if (!e.rating_date) { br['no rating date']++; continue; }
    if (new Date(e.rating_date) < new Date('2023-10-03')) { br['older than 3 years']++; add({ ent: 'fsa', id: String(e.id), sev: 'low', note: `${e.name}: rated ${e.rating_date}`, pc: normPc(e.postcode) }); }
  }
  c.population = FSA.establishments.length; c.breakdown = br;
}
{
  const c = { id: 'TM-2', cls: 'currency', dim: 'timeliness', title: 'Canary Wharf Group directory: age of the copies', sources: ['cwg'],
    method: 'Age of each Internet Archive copy used, and of the sitemap date of the page.', rule: 'Treat directory facts as dated observations (observed_on = archive date); re-crawl before use, and expire entries not seen in the latest crawl.' };
  check(c); const ages = CWG.directory.filter(d => d.archived_on).map(d => Math.round((TODAY - new Date(`${d.archived_on.slice(0, 4)}-${d.archived_on.slice(4, 6)}-${d.archived_on.slice(6, 8)}`)) / 864e5)).sort((a, b) => a - b);
  const lm = CWG.directory.filter(d => d.sitemap_lastmod).map(d => d.sitemap_lastmod.slice(0, 4)); const byYear = {}; for (const y of lm) byYear[y] = (byYear[y] || 0) + 1;
  c.population = CWG.directory.length; c.stats = { archive_age_days_median: ages[ages.length >> 1], archive_age_days_max: ages.at(-1), page_last_modified_by_year: byYear };
  c.issues = ages.filter(a => a > 180).length; c.count_only = 'entries with a copy older than 180 days';
}
{
  const c = { id: 'TM-3', cls: 'currency', dim: 'timeliness', title: 'Companies registered here that are not active', sources: ['companies-house'],
    method: 'Company status other than "Active" at Canary Wharf postcodes (liquidation, proposal to strike off, administration and others).', rule: 'Keep status and its date; exclude non-active companies from "who is here" views but keep them for history.' };
  const add = check(c), br = {}; let pop = 0;
  for (const [pc, list] of Object.entries(CO)) for (const co of list) { pop++; if (co.status !== 'Active') { br[co.status] = (br[co.status] || 0) + 1; } }
  for (const [pc, list] of Object.entries(CO)) { const n = list.filter(x => x.status !== 'Active').length; if (n >= 10) add({ ent: 'pc', id: pc, sev: 'low', note: `${n} of ${list.length} registered companies not active` }); }
  c.population = pop; c.breakdown = br;
}
{
  const c = { id: 'TM-4', cls: 'currency', dim: 'timeliness', title: 'Wikidata occupants and headquarters without dates, or former', sources: ['wikidata'],
    method: 'Occupant (P466) and headquarters (P159) links used in the registry, against their P580 start and P582 end qualifiers and the organisation\'s P576 dissolution, fetched in one QLever query by tools/build-categories.mjs (data/raw/registry/wikidata-occupant-classes.json). Former: an end date or a dissolved organisation, still listed as an occupant by the registry. Undated: no qualifier, so a former tenant cannot be told from a current one.', rule: 'Carry the link status (current, former, undated) with every Wikidata occupant; never show a former occupant as current; treat undated links as "at some time".' };
  const add = check(c), WDC = join(CW, 'data/raw/registry/wikidata-occupant-classes.json'), links = new Map(); let pop = 0; const br = { current: 0, former: 0, undated: 0, 'not in the link query': 0 };
  if (existsSync(WDC)) for (const l of JSON.parse(readFileSync(WDC, 'utf8')).links || []) { const k = `${l.b}|${l.o}`, s = l.end || l.dissolved ? 'former' : l.start ? 'current' : 'undated', prev = links.get(k); if (!prev || prev.s === 'former' || (prev.s === 'undated' && s === 'current')) links.set(k, { ...l, s }); }
  for (const b of REG.buildings) for (const o of b.occupants) if (/P466|P159/.test(o.role)) { pop++;
    const l = links.get(`${b.wikidata}|${o.wikidata}`), s = l ? l.s : 'not in the link query'; br[s]++;
    if (s === 'former') add({ ent: 'b', id: b.id, sev: 'medium', note: `${o.name}: former (${l.end ? 'link ended ' + l.end : 'organisation dissolved ' + l.dissolved}), still listed as an occupant` });
    else if (s !== 'current') add({ ent: 'b', id: b.id, sev: 'low', note: `${o.name} (${o.role}): ${s}` }); }
  c.population = pop; c.breakdown = br;
}

// ===== F. coverage
{
  const c = { id: 'CV-1', cls: 'coverage', dim: 'completeness', title: 'Fields filled, by entity type', sources: ['all'],
    method: 'Share of registry buildings and occupants with each attribute.', rule: 'Report fill rates with every composite layer; a missing value is "unknown", not zero.' };
  check(c); const B = REG.buildings, O = B.flatMap(b => b.occupants), pct = (n, d) => Math.round(1000 * n / d) / 10;
  c.stats = {
    buildings: B.length,
    'building: name': pct(B.filter(b => b.name).length, B.length), 'building: height (any source)': pct(AT.buildings.filter(a => a.h || a.wh || a.mh).length, B.length),
    'building: floors': pct(B.filter(b => b.levels != null || b.facts?.['floors above ground']).length, B.length), 'building: floors below ground': pct(B.filter(b => b.levels_underground != null || b.facts?.['floors below ground']).length, B.length),
    'building: postcode': pct(B.filter(b => b.postcodes.length).length, B.length), 'building: address': pct(B.filter(b => b.address).length, B.length),
    'building: Wikidata': pct(B.filter(b => b.wikidata).length, B.length), 'building: owner': pct(B.filter(b => b.owners.length).length, B.length), 'building: UPRN': pct(B.filter(b => b.uprns).length, B.length),
    occupants: O.length, 'occupant: level': pct(O.filter(o => o.level != null || o.level_cwg).length, O.length), 'occupant: brand': pct(O.filter(o => o.brand).length, O.length),
    'occupant: website': pct(O.filter(o => o.website || o.store_url).length, O.length),
  };
}
{
  const c = { id: 'CV-2', cls: 'coverage', dim: 'completeness', title: 'Which sources see each branch or directory entry', sources: ['osm', 'fsa', 'cwg', 'wikidata', 'store locators'],
    method: 'Source combinations for the 271 chain-store branches; and the CWG directory entries that no other source has: no registry occupant from another source (OSM, FSA, Wikidata, a store page) carries the entry\'s URL after the branch join and the registry\'s CWG join (name and place).', rule: 'No single source is complete: a composite occupant layer needs every source, a match key per pair, and a record of which sources saw each occupant and when.' };
  const add = check(c); c.population = BR.branches.length; c.breakdown = BR.meta.by_sources;
  const seen = new Map(); for (const b of REG.buildings) for (const o of b.occupants) for (const u of [o.cwg_url, ...(o.cwg_also || [])].filter(Boolean)) { const s = String(o.source).split('+').filter(x => x !== 'cwg'); seen.set(u, [...(seen.get(u) || []), ...s]); }
  const only = CWG.directory.filter(d => !(seen.get(d.cwg_url) || []).length);
  c.stats = { cwg_entries: CWG.directory.length, cwg_not_matched_by_the_branch_join: BR.cwg_not_matched.length, cwg_only_after_the_registry_join: only.length };
  for (const d of only) add({ ent: 'cwg', id: d.slug, sev: 'low', note: `${d.title || d.slug} (${d.kind}) only in the CWG directory` });
}

{
  const c = { id: 'CV-3', cls: 'coverage', dim: 'completeness', title: 'Canary Wharf Group directory entries with no building', sources: ['cwg'],
    method: 'Every CWG directory entry after the registry join (tools/build-registry.mjs): linked by the branch join, joined to an occupant by name and place, added as a new occupant, or not placed, with the reason. Also: entries whose joined records (OSM, FSA) sit in different buildings, and entries that match two records of one source in two buildings.', rule: 'Join on name only with a place key (same mall, postcode or building), never across two malls. An entry with no mall host, street address or single building for its postcode stays unplaced with its class; fix the class (a mall container, a postcode-to-building table), not the entry.' };
  const add = check(c), j = REG.summary.joins.cwg || {};
  c.population = CWG.directory.length; c.breakdown = { linked_by_branch: j.linked_by_branch, joined_by_name_and_place: j.joined, added_as_new_occupant: j.added, ...Object.fromEntries(Object.entries(j.unplaced_by || {}).map(([k, v]) => ['unplaced: ' + k, v])) };
  c.stats = { joined_by: j.joined_by, added_by: j.added_by, added_confidence: j.added_confidence, joined_records_in_different_buildings: j.joined_records_in_different_buildings || 0, mall_hosts: j.mall_hosts };
  for (const u of REG.cwg_unplaced || []) add({ ent: 'cwg', id: u.slug, sev: 'low', note: `${u.title || u.slug} (${u.kind}): ${u.why}`, kind: u.why });
  ex(c, (REG.cwg_unplaced || []).filter(u => u.title).map(u => ({ entry: u.title, mall: u.mall, postcode: u.postcode, why: u.why })), 10);
}
{
  const c = { id: 'SP-7', cls: 'position', dim: 'accuracy', title: 'Occupant placed by a key, not a position', sources: ['cwg', 'registers'],
    method: 'Occupants that only the CWG directory or a register gives, placed by the building its street address names (high with the postcode, medium without), its mall\'s host outline (medium: a 2D outline for a mall that runs under several buildings, see SP-6), or the one building (or the one retail building) with its postcode (low).', rule: 'Keep the placement rule and confidence with each link; a low-confidence placement places the occupant in a postcode, not a building, until a second source confirms it.' };
  const add = check(c); let pop = 0; const by = {};
  for (const b of REG.buildings) for (const o of b.occupants) { if (!o.placed_confidence) continue; pop++; by[o.placed_confidence] = (by[o.placed_confidence] || 0) + 1; if (o.placed_confidence === 'low') add({ ent: 'b', id: b.id, sev: 'low', note: `${o.name}: ${o.placed}` }); }
  c.population = pop; c.breakdown = by;
}

{
  const c = { id: 'CV-4', cls: 'coverage', dim: 'completeness', title: 'Register records in the registry box with no building', sources: ['gias', 'cqc', 'ods', 'charities', 'ofsted', 'gambling', 'active-places', 'fsa'],
    method: 'Records of the regulatory and public registers (registry/sources/registers/) after the registry join (keys: UPRN, the register point, street address, name at the same postcode, the postcode alone where one building at the postcode centre has it), left out: records outside the registry box and addresses that are not places (SE-3).', rule: 'Place a register record by its strongest key and keep the key, its precision and a confidence on the link. A postcode alone places a record in a postcode, not a building, unless one building is at the postcode; fix the class (a postcode-to-building table from UPRNs), not the record.' };
  const add = check(c), NOT_PLACE = /correspondence|registered-office|care-of|residential/;
  const rows = (REG.registers_unplaced || []).filter(u => u.why !== 'outside the registry box' && !NOT_PLACE.test(u.why));
  const j = REG.summary.joins.registers || {};
  c.population = Object.values(j).reduce((n, x) => n + x.records, 0);
  c.breakdown = {}; for (const u of rows) c.breakdown[u.why] = (c.breakdown[u.why] || 0) + 1;
  c.stats = Object.fromEntries(Object.entries(j).map(([k, x]) => [k, { records: x.records, placed_by: x.placed_by, joined_existing: x.joined_existing, added: x.added, unplaced_by: x.unplaced_by }]));
  for (const u of rows) add({ ent: 'register', id: u.id, sev: 'low', note: `${u.name} (${u.register}, ${u.postcode || 'no postcode'}): ${u.why}`, kind: u.why });
  ex(c, rows.map(u => ({ register: u.register, name: u.name, postcode: u.postcode, why: u.why })), 10);
}
{
  const c = { id: 'ID-5', cls: 'identity', dim: 'uniqueness', title: 'Register UPRN that does not identify the place', sources: ['gias', 'ods', 'active-places', 'os-open-uprn'],
    method: 'Register records whose UPRN the join did not use: one UPRN given to records at two or more postcodes in one register (GIAS gives several schools one council UPRN), or a UPRN point over 150 m from the register\'s own point.', rule: 'A UPRN is a key only when it is unique to one place in the register and agrees with the register\'s own position; otherwise keep it as a value with its fault.' };
  const add = check(c), rows = REG.registers_uprn_rejected || [];
  c.population = (REG.registers_uprn_rejected || []).length; c.breakdown = {}; for (const u of rows) { const k = u.why.replace(/\d+ records at \d+/, 'N records at N'); c.breakdown[k] = (c.breakdown[k] || 0) + 1; }
  for (const u of rows) add({ ent: 'register', id: u.id, sev: 'medium', note: `${u.name} (${u.register}) UPRN ${u.uprn}: ${u.why}` });
  ex(c, rows, 10);
}
{
  const c = { id: 'SE-3', cls: 'meaning', dim: 'relevance', title: 'Register address that is not where the organisation works', sources: ['gias', 'ods', 'charities', 'cqc'],
    method: 'Register records whose address the join did not use as a place: GIAS correspondence addresses (overseas schools at 30 Skylines Village), the registered-office service at E14 5HU (5 Churchill Place, 10th floor), care-of and accountant addresses, and charity contact addresses in residential buildings.', rule: 'A contact or registered address is not an occupant (like SE-1). Mark the address role on the record; place only by an address that is a service location.' };
  const add = check(c), rows = (REG.registers_unplaced || []).filter(u => /correspondence|registered-office|care-of|residential/.test(u.why));
  c.population = rows.length; c.breakdown = {}; for (const u of rows) c.breakdown[u.why] = (c.breakdown[u.why] || 0) + 1;
  for (const u of rows) add({ ent: 'register', id: u.id, sev: 'low', note: `${u.name} (${u.register}): ${u.why}` });
}

// ===== G. meaning
{
  const c = { id: 'SE-1', cls: 'meaning', dim: 'relevance', title: 'Registered offices concentrated at one address', sources: ['companies-house'],
    method: 'Postcodes with 100 or more registered companies, and residential buildings with 20 or more. A registered office is a legal address: formation agents, accountants and serviced offices hold thousands.', rule: 'Never read a registered office as an occupant. Composite "who works here" from occupancy sources (OSM, FSA, CWG, business rates when licensed); join Companies House only for identity and status.' };
  const add = check(c), rows = [];
  for (const [pc, list] of Object.entries(CO)) if (list.length >= 100) { rows.push({ postcode: pc, companies: list.length }); add({ ent: 'pc', id: pc, sev: 'medium', note: `${list.length} companies registered at this postcode` }); }
  for (const b of REG.buildings) { const n = Array.isArray(b.companies) ? b.companies.length : b.companies?.count || 0; if (b.homes && n >= 20) add({ ent: 'b', id: b.id, sev: 'medium', note: `${n} companies registered in a residential building` }); }
  c.population = Object.keys(CO).length; ex(c, rows.sort((a, b) => b.companies - a.companies));
}
{
  const c = { id: 'SE-2', cls: 'meaning', dim: 'accuracy', title: 'Positions that mean "kept here", not "found here"', sources: ['wikidata', 'ads'],
    method: 'Heritage records whose coordinate is the holding museum (Wikidata P276) or a 1 km place box (Portable Antiquities Scheme), against all heritage records with a position.', rule: 'Every position needs a relation type (site, find spot, holding place, centroid) and a precision; map layers filter on it.' };
  const add = check(c), R = json('registry/sources/museums/records-open.json').records, br = {};
  for (const r of R) { const k = r.relation || 'unknown'; br[k] = (br[k] || 0) + 1; }
  c.population = R.length; c.breakdown = br; c.issues = R.filter(r => /kept|holding|P276/.test(r.relation || '') || /1 km/.test(r.precision || '')).length; c.count_only = 'records; no issue record per heritage item';
  void add;
}

// ---- sources and their dates
const sources = [
  { source: 'OpenStreetMap extract', as_of: '2026-10-01', note: 'openstreetmap.fr Greater London, replication time 01:43 UTC' },
  { source: 'EA LiDAR Composite', as_of: 'multi-year composite', note: 'the survey year differs by tile; buildings finished later show as low (AT-1 "newer")' },
  { source: 'Wikidata (QLever)', as_of: WD.fetched, note: 'live edits; occupant link qualifiers (P580, P582, P576) fetched by tools/build-categories.mjs' },
  { source: 'FSA food hygiene (FHRS530)', as_of: FSA.fetched, note: `${FSA.establishments.length} premises in E14` },
  { source: 'ONS Postcode Directory', as_of: '2026-08', note: 'quarterly release' },
  { source: 'Companies House Basic Company Data', as_of: 'monthly snapshot, 2026-10', note: 'registered offices, not trading addresses' },
  { source: 'HM Land Registry Price Paid', as_of: 'monthly, to 2026-08', note: 'sales since 1995' },
  { source: 'GLA London Building Stock Model 2', as_of: '2024 release', note: 'modelled where no EPC' },
  { source: 'Canary Wharf Group directory (Internet Archive)', as_of: '2025-11 to 2026-02 copies', note: 'sitemap 2026-03-04' },
  { source: 'UKHO bathymetry', as_of: '2013-2017 survey', note: 'chart datum, converted to ODN by an interpolated offset' },
  { source: 'name-suggestion-index', as_of: '2026-09-18', note: 'brand list' },
];

// ---- write
const bySev = {}; for (const i of issues) bySev[i.sev] = (bySev[i.sev] || 0) + 1;
const byEnt = {}; for (const i of issues) if (i.ent === 'b' || i.ent === 'pc') { const k = `${i.ent}/${i.id}`; byEnt[k] = (byEnt[k] || 0) + 1; }
const out = { generated: TODAY.toISOString().slice(0, 10), summary: { checks: checks.length, issues: issues.length, by_severity: bySev, buildings_with_issues: Object.keys(byEnt).filter(k => k.startsWith('b/')).length, postcodes_with_issues: Object.keys(byEnt).filter(k => k.startsWith('pc/')).length }, sources, checks, issues };
mkdirSync(join(CW, 'quality'), { recursive: true });
writeFileSync(join(CW, 'quality', 'issues.json'), JSON.stringify(out));

const md = [
  '# Data-quality catalogue (generated)', '',
  `Generated by \`tools/audit-quality.mjs\` on ${out.generated}. ${checks.length} checks, ${issues.length.toLocaleString('en-GB')} issue records. The analysis and the compositing rules are in [README.md](README.md). Browse: https://danbri.github.io/glitchcan-minigam/magpie/cwplans/atlas/#quality`, '',
  '| check | class | title | issues | of | sources |', '|---|---|---|---:|---:|---|',
  ...checks.map(c => `| ${c.id} | ${c.cls} | ${c.title} | ${c.issues.toLocaleString('en-GB')} | ${c.population != null ? c.population.toLocaleString('en-GB') : ''} | ${c.sources.join(', ')} |`), '',
  ...checks.flatMap(c => [`## ${c.id}: ${c.title}`, '', `Class: ${c.cls} (${c.dim}). Method: ${c.method}`, '', `Compositing rule: ${c.rule}`, '',
    ...(c.breakdown ? ['| case | count |', '|---|---:|', ...Object.entries(c.breakdown).map(([k, v]) => `| ${k} | ${v} |`), ''] : []),
    ...(c.stats ? ['```', JSON.stringify(c.stats, null, 1), '```', ''] : []),
    ...(c.offsets_by_mall ? ['| mall or building | CWG level minus OSM level: count |', '|---|---|', ...Object.entries(c.offsets_by_mall).map(([m, o]) => `| ${m} | ${Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k > 0 ? '+' + k : k}: ${n}`).join(', ')} |`), ''] : []),
    ...(c.crosswalk ? ['| OSM tag \\| FSA type | count |', '|---|---:|', ...c.crosswalk.slice(0, 25).map(r => `| ${r.pair.replace('|', '\\|')} | ${r.n} |`), ''] : []),
    ...(c.values ? [`Values: ${Object.entries(c.values).map(([k, n]) => `\`${k}\` ${n}`).join(', ')}`, ''] : []),
    ...(c.examples?.length ? ['Examples:', '', ...c.examples.map(e => `- ${Object.entries(e).map(([k, v]) => `${k}: ${v}`).join('; ')}`), ''] : [])]),
  '## Source dates', '', '| source | as of | note |', '|---|---|---|', ...sources.map(s => `| ${s.source} | ${s.as_of} | ${s.note} |`), '',
].join('\n');
writeFileSync(join(CW, 'quality', 'CATALOGUE.md'), md);
console.log(`${checks.length} checks, ${issues.length} issues`, bySev);
for (const c of checks) console.log(`${c.id.padEnd(5)} ${String(c.issues).padStart(5)} / ${String(c.population ?? '').padStart(6)}  ${c.title}`);
