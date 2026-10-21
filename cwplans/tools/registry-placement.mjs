#!/usr/bin/env node
// The placement rule for registry occupants placed by a point (faults F4 and F7; skill docklands-data-curation, fault
// register and "Recount of 2026-10-21", rule 1). One rule over every OSM, FSA and branch occupant, never a patch of one:
//   F4: a unit in a named mall belongs to the mall. Its mall is the mall the branch table or the CWG join gave it, else
//       the CWG mall that its OSM address tags (addr:place, addr:housename, addr:street) or its FSA address name. When
//       the mall has a host outline (the CWG join's mall host rule) the occupant goes there; the outline its point lies
//       in is kept as point_in. For an OSM occupant the mall level is read by the F48 rule: level:ref first, else level.
//   F7: an FSA point within 3 m of the ONSPD centre of its own postcode, or at one coordinate with 2 or more other
//       premises, is not a building position (the audit check SP-3 uses the same test). Such an occupant is placed by a
//       key: its mall, its street address with the postcode (high), its street address alone (medium), the name of an
//       occupant of another source at the same postcode (medium), the postcode alone when one building at the postcode
//       centre has it (low); else it is listed under its postcode (unplaced_by_postcode), not in a building. A branch
//       placed at a mall or postcode centroid ("approximate") is treated the same way.
// Each re-placed occupant keeps placed (the precision), placed_by (the key), placed_confidence, placement_fault and,
// when it had a usable point, point_in; occupants kept at their point get placed_by (the position class).
// Building postcodes are then recomputed from their evidence (outline tag, Wikidata, OSM and FSA occupants).
// Library: build-registry.mjs applies the rule as its last join. Command: applies the rule as a logged operation
// (kgx-ops Flow, log in kgx/log) to the committed registry/buildings.json, for a registry that cannot be rebuilt
// here (its UPRN, company and price-paid inputs are local downloads), and writes the change set as the graph
// registry-placement (external head):
//   node cwplans/tools/registry-placement.mjs
// Skills: docklands-data-curation (F4, F7), cwplans-dataflow.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { pointIn, joinRings } from './lib.mjs';
import { osmList } from './osm-values.mjs';
import { CWG_PLACES, CWG_MALLS, nameKeys } from '../registry/sources/brands/tools/cwg-fields.mjs';

export const PLACEMENT_OP = { id: 'place-occupants-by-mall-and-postcode', version: 1, skill: 'docklands-data-curation', tool: 'cwplans/tools/registry-placement.mjs',
  about: 'registry/buildings.json + the OSM extract of the box + the FSA file + ONSPD postcodes + ids.json -> the same registry with OSM, FSA and branch occupants of a named mall in the mall host outline (F4, F48 level) and FSA points at the postcode centre or shared by 3 or more premises placed by a key or listed under the postcode (F7); the change set as graph registry-placement' };

export const normPc = pc => String(pc || '').toUpperCase().replace(/\s+/g, '').replace(/^(.+)(\d[A-Z]{2})$/, '$1 $2');
const NUM = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10, TWENTY: 20, 'TWENTY FIVE': 25, THIRTY: 30, FORTY: 40, FIFTY: 50 };
export const normAddr = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\b(TWENTY FIVE|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|TWENTY|THIRTY|FORTY|FIFTY)\b/g, m => NUM[m]).replace(/\s+/g, ' ').trim();
// keys a building answers to: "1 CANADA SQUARE", "ONE CANADA SQUARE" -> "1 CANADA SQUARE", the OSM and Wikidata names
export const buildingKeys = r => [...new Set([r.address, r.name, r.osm_name, ...(r.facts?.['street address'] || [])].filter(Boolean).map(normAddr).filter(k => k.length > 5))];
// a street the address names ("71-75 SHELTON STREET")
export const STREET = /\b\d+[a-z]?(?:\s*-\s*\d+[a-z]?)?,?\s+((?:[a-z']+\s+){0,3}(?:street|road|place|square|walk|lane|avenue|way|crescent|colonnade|circus|drive|grove|passage|terrace|quay|court|wall|row|gardens))\b/i;
// the CWG place (mall, street, square) a free-text address names; never a name inside a longer one that also appears
const PLACES = CWG_PLACES.map(p => p.toLowerCase());
export const placeIn = text => { const low = String(text || '').toLowerCase(), hits = PLACES.filter(p => low.includes(p)); return CWG_PLACES[PLACES.indexOf(hits.filter(p => !hits.some(o => o !== p && o.includes(p)))[0])] || null; };
export const mPerDeg = [111320 * Math.cos(51.5 * Math.PI / 180), 110540];
// metres between two points, rounded (as the audit's dist, so F7 and SP-3 count the same premises)
export const metres = (la1, lo1, la2, lo2) => { const R = 6371008, r = Math.PI / 180, x = (lo2 - lo1) * r * Math.cos((la1 + la2) / 2 * r), y = (la2 - la1) * r; return Math.round(Math.hypot(x, y) * R); };

// ---- the registry's outlines from the OSM extract of the box (build-registry.mjs uses the same)
export function registryGeometry(osm, box) {
  const wayById = new Map(osm.features.filter(f => f.type === 'way').map(f => [f.id, f]));
  const ringOf = refs => refs.map(r => osm.nodes[r]).filter(Boolean);
  const rings = f => {
    if (f.type === 'way') return f.refs[0] === f.refs.at(-1) ? [ringOf(f.refs)] : null;
    const outer = joinRings(f.members.filter(m => m.type === 'way' && m.role !== 'inner').map(m => wayById.get(m.ref)?.refs));
    return outer ? outer.map(ringOf) : null;
  };
  const [W, S, E, N] = box, inBox = (lon, lat) => lon >= W && lon <= E && lat >= S && lat <= N;
  const mean = ring => ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);
  const all = [];
  for (const f of osm.features) {
    if (f.type === 'node' || !(f.tags.building || f.tags['building:part'])) continue;
    const rs = rings(f); if (!rs || !rs[0] || rs[0].length < 4) continue;
    all.push({ f, rs, c: mean(rs[0]), part: !!f.tags['building:part'] && !f.tags.building });
  }
  const outlines = all.filter(b => !b.part && inBox(b.c[0], b.c[1]));
  const inside = (b, lon, lat) => b.rs.some(r => pointIn([lon, lat], r));
  // metres from a point to a building outline (for points just outside, e.g. entrances on the wall)
  const distTo = (b, lon, lat) => {
    let d = Infinity;
    for (const r of b.rs) for (let i = 1; i < r.length; i++) {
      const ax = (r[i - 1][0] - lon) * mPerDeg[0], ay = (r[i - 1][1] - lat) * mPerDeg[1], bx = (r[i][0] - lon) * mPerDeg[0], by = (r[i][1] - lat) * mPerDeg[1];
      const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      d = Math.min(d, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return d;
  };
  const buildingAt = (lon, lat, tol = 12) => {
    const hit = outlines.find(b => inside(b, lon, lat)); if (hit) return { b: hit, how: 'inside' };
    let best = null; for (const b of outlines) { const d = distTo(b, lon, lat); if (d < tol && (!best || d < best.d)) best = { b, d }; }
    return best ? { b: best.b, how: `within ${Math.round(best.d)} m` } : null;
  };
  return { rings, inBox, mean, all, outlines, inside, distTo, buildingAt };
}

// mall host outline: the outline whose OSM name or addr:housename is the mall's name or starts with it ("Cabot Place
// Shopping Centre", "Cabot Place East"); an OSM name outranks a house name; two or more left: no host.
export function mallHosts(outlines, key) {
  const bare = s => String(s || '').toLowerCase().replace(/^the /, ''), hostOf = {};
  for (const m of CWG_MALLS) {
    const k = bare(m), starts = v => v && !/entrance|car park/i.test(v) && (bare(v) === k || bare(v).startsWith(k + ' '));
    const byName = outlines.filter(b => starts(b.f.tags.name)), byHouse = outlines.filter(b => starts(b.f.tags['addr:housename']));
    const c = byName.length ? byName : byHouse;
    if (c.length === 1) hostOf[m] = { id: c[0].id, how: `${byName.length ? 'OSM name' : 'OSM addr:housename'} "${byName.length ? c[0].f.tags.name : c[0].f.tags['addr:housename']}" (${key(c[0])})` };
  }
  return hostOf;
}

// F7: the position class of every FSA premises with a position (as audit SP-3)
export function fsaPositions(establishments, pcs) {
  const withPos = establishments.filter(e => e.lat != null), stack = new Map(), out = new Map();
  for (const e of withPos) { const k = `${e.lat.toFixed(6)},${e.lon.toFixed(6)}`; stack.set(k, (stack.get(k) || 0) + 1); }
  for (const e of withPos) {
    const p = pcs.get(normPc(e.postcode)), d = p && p.lat != null ? metres(e.lat, e.lon, +p.lat, +p.lon) : null, n = stack.get(`${e.lat.toFixed(6)},${e.lon.toFixed(6)}`);
    out.set(e.id, d != null && d <= 3 ? { cls: 'postcode centre', label: `FSA point at the postcode centre (${d} m from the ONSPD point)` }
      : n >= 3 ? { cls: 'shared point', label: `FSA point shared by ${n} premises` } : { cls: 'address point', label: 'FSA point' });
  }
  return out;
}

// the postcodes a building has evidence for: its outline's addr:postcode, its Wikidata postal code, the addr:postcode of
// its OSM occupants and the postcode of its FSA occupants (the same sources build-registry.mjs adds as it places them)
export function postcodeEvidence(r, outlineTags, tagsOf, skip = () => false) {
  const s = new Set([...osmList(outlineTags?.['addr:postcode']).map(normPc), ...(r.facts?.['postal code'] || []).map(normPc)]);
  // an occupant made by the branch-key rule (registry-branch-key.mjs) brings the records merged into it
  for (const o of r.occupants) {
    if (skip(o)) continue;
    for (const x of [o, ...(o.merged_from || [])]) {
      const src = x === o ? o.primary_source ?? o.source : x.source;
      if (src === 'osm' && x.osm) for (const pc of osmList(tagsOf.get(x.osm)?.['addr:postcode'])) s.add(normPc(pc));
      if (src === 'fsa') s.add(normPc(x.postcode));
    }
  }
  s.delete(''); return s;
}
const ch = pc => `https://find-and-update.company-information.service.gov.uk/advanced-search/get-results?registeredOfficeAddress=${encodeURIComponent(pc).replace(/%20/g, '+')}`;
const ppd = pc => `https://landregistry.data.gov.uk/app/ppd/search?postcode=${encodeURIComponent(pc).replace(/%20/g, '+')}`;
export const postcodeInfo = (postcodes, pcs) => postcodes.map(pc => { const p = pcs.get(pc); return { pc, status: p ? p.status : 'not in ONSPD E14 list', tier: p?.tier || null, large_user: !!p?.large_user }; });
export const postcodeLinks = postcodes => ({ companies_house_by_postcode: postcodes.map(ch), land_registry_price_paid_by_postcode: postcodes.map(ppd) });

// ---- the rule. recs: registry records with occupants, postcodes (a Set), keys (buildingKeys), facts; outlineOf: id ->
// outline (f.tags, rs); tagsOf: OSM key -> tags; byPostcode: the unplaced FSA premises by postcode (changed in place).
export function applyPlacement({ recs, hostOf, tagsOf, outlineOf, geom, fsaPos, pcs, byPostcode }) {
  const st = { candidates: 0, by_position: {}, kept_at_point: 0, point_in_mall_host: 0, moved: {}, confirmed: {}, unplaced: {}, dropped_outside_cw_postcodes: 0, confidence: {}, buildings_postcodes_changed: 0 };
  const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
  const recById = new Map(recs.map(r => [r.id, r])), changes = [], unplacedList = [];
  const items = [];
  // buildings in id order, so the rule gives the same result whatever order the caller holds them in
  for (const r of [...recs].sort((a, b) => a.id.localeCompare(b.id))) for (const o of r.occupants) {
    if (o.placed_confidence || !o.placed) continue;
    const cls = /^branch: /.test(o.role || '') ? 'branch' : o.source === 'osm' ? 'osm' : o.source === 'fsa' ? 'fsa' : null; if (!cls) continue;
    const t = o.osm ? tagsOf.get(o.osm) || {} : {};
    const fp = cls === 'fsa' ? fsaPos.get(+o.fhrs_id) : null;
    const pos = cls === 'osm' ? { cls: 'mapped point', label: 'OSM point' } : cls === 'fsa' ? fp || { cls: 'none', label: 'FSA (no position)' }
      : /approximate/.test(o.placed) ? { cls: 'centroid', label: `branch ${o.placed}` } : { cls: 'mapped point', label: 'branch point' };
    const usable = pos.cls === 'mapped point' || pos.cls === 'address point';
    const named = CWG_MALLS.has(o.mall) ? o.mall : null;
    const fromAddr = named ? null : cls === 'osm' ? placeIn([t['addr:place'], t['addr:housename'], t['addr:street']].filter(Boolean).join(' | ')) : cls === 'fsa' ? placeIn(o.address) : null;
    const mall = named || (CWG_MALLS.has(fromAddr) ? fromAddr : null);
    items.push({ o, r, cls, t, pos, usable, mall, mallFrom: named ? 'mall given by the branch table or the CWG join' : mall ? (cls === 'osm' ? 'OSM address tags' : 'FSA address') : null });
    st.candidates++; inc(st.by_position, `${cls}: ${pos.cls}`);
  }
  // evidence for keys leaves out the points that are not positions (their postcode would find their own building)
  const notPos = new Set(items.filter(i => !i.usable).map(i => i.o));
  const evid = new Map(recs.map(r => [r.id, postcodeEvidence(r, outlineOf.get(r.id)?.f.tags, tagsOf, o => notPos.has(o))]));
  const names = [];
  for (const r of recs) for (const o of r.occupants) { if (notPos.has(o)) continue; const t = o.osm ? tagsOf.get(o.osm) || {} : {};
    names.push({ o, r, keys: new Set(nameKeys(o.name)), pcs: new Set([...osmList(t['addr:postcode']).map(normPc), o.postcode ? normPc(o.postcode) : null].filter(Boolean)) }); }
  for (const it of items) {
    const { o, r, cls, pos, usable, mall } = it;
    let home = null;
    if (mall && hostOf[mall]) home = { id: hostOf[mall].id, key: usable ? `${pos.label} + mall` : 'mall named in the address', precision: `mall ${mall} (${it.mallFrom}): ${hostOf[mall].how}`, confidence: 'medium', fault: 'F4' };
    else if (!usable) {
      const pc = o.postcode ? normPc(o.postcode) : null, addr = normAddr(o.address || '');
      const byStreetPc = pc && addr ? recs.filter(x => evid.get(x.id).has(pc) && x.keys.some(k => addr.includes(k))) : [];
      const byStreet = addr ? recs.filter(x => x.keys.some(k => /^\d/.test(k) && new RegExp(`(^| )${k}( |$)`).test(addr))) : [];
      const keys = new Set(nameKeys(o.name)), byName = pc ? [...new Set(names.filter(n => n.o.source !== o.source && n.pcs.has(pc) && [...keys].some(k => n.keys.has(k))).map(n => n.r.id))] : [];
      const inPc = pc ? recs.filter(x => evid.get(x.id).has(pc)) : [], p = pc ? pcs.get(pc) : null;
      if (byStreetPc.length === 1) home = { id: byStreetPc[0].id, key: 'street address + postcode', precision: 'address text names the building, postcode agrees', confidence: 'high' };
      else if (byStreet.length === 1) home = { id: byStreet[0].id, key: 'street address', precision: 'address text names the building; its postcode is not on the building', confidence: 'medium' };
      else if (byName.length === 1) home = { id: byName[0], key: 'name + postcode', precision: 'an occupant of this building from another source has the same name and postcode', confidence: 'medium' };
      else if (inPc.length === 1 && p?.lat) {
        const b = outlineOf.get(inPc[0].id), sm = (o.address || '').match(STREET), street = sm ? normAddr(sm[1]) : null;
        if ((geom.inside(b, +p.lon, +p.lat) || geom.distTo(b, +p.lon, +p.lat) <= 50) && !(street && inPc[0].keys.some(k => /^\d/.test(k)) && !inPc[0].keys.some(k => k.includes(street))))
          home = { id: inPc[0].id, key: 'postcode (one building)', precision: `the one registry building with postcode ${pc}, at the postcode centre`, confidence: 'low' };
      }
      if (home) home.fault = 'F7';
    }
    if (!home) {
      if (usable) { st.kept_at_point++; o.placed_by = pos.label; continue; }
      // a centroid or postcode-centre point places the occupant in a postcode, never in a building
      r.occupants.splice(r.occupants.indexOf(o), 1);
      const why = `${pos.label}: not a building position (F7); no mall host, street address, same-name occupant or single building at the postcode`;
      const pc = o.postcode ? normPc(o.postcode) : null;
      if (cls === 'fsa' && pc && /^cw-/.test(pcs.get(pc)?.tier || '')) { (byPostcode[pc] ||= []).push({ ...o, placed: why }); inc(st.unplaced, `${cls}: listed under the postcode`); }
      else if (cls === 'fsa') { st.dropped_outside_cw_postcodes++; inc(st.unplaced, `${cls}: postcode outside the Canary Wharf postcodes`); }
      else { unplacedList.push({ name: o.name, source: o.source, role: o.role, ...(o.nsi_id ? { nsi_id: o.nsi_id } : {}), ...(o.mall ? { mall: o.mall } : {}), from: r.id, why }); inc(st.unplaced, `${cls}: no building`); }
      changes.push({ o, cls, pos, from: r.id, to: null, key: null, confidence: null, precision: why, fault: 'F7' });
      continue;
    }
    if (it.mall && !o.mall) o.mall = it.mall;
    if (cls === 'osm' && it.mall) { const lv = it.t['level:ref'] ?? it.t.level; if (lv != null) { o.mall_level = lv; o.mall_level_from = it.t['level:ref'] != null ? 'level:ref (F48)' : 'level (F48: no level:ref)'; } }
    if (home.id === r.id && usable) { st.point_in_mall_host++; o.placed_by = pos.label; continue; }
    const ptIn = usable && home.id !== r.id ? r.id : null;
    Object.assign(o, { placed: home.precision, placed_by: home.key, placed_confidence: home.confidence, placement_fault: home.fault, position: pos.label, ...(ptIn ? { point_in: ptIn } : {}) });
    inc(st.confidence, home.confidence);
    if (home.id === r.id) { inc(st.confirmed, `${cls}: ${home.key}`); changes.push({ o, cls, pos, from: r.id, to: r.id, ...home }); continue; }
    r.occupants.splice(r.occupants.indexOf(o), 1); recById.get(home.id).occupants.push(o);
    inc(st.moved, `${cls}: ${home.key}`); changes.push({ o, cls, pos, from: r.id, to: home.id, ...home });
  }
  // postcodes from their evidence, after the moves
  for (const r of recs) {
    const now = postcodeEvidence(r, outlineOf.get(r.id)?.f.tags, tagsOf), old = [...r.postcodes].filter(Boolean);
    if (old.length !== now.size || old.some(pc => !now.has(pc))) st.buildings_postcodes_changed++;
    r.postcodes = now;
  }
  return { stats: st, changes, unplaced: unplacedList };
}

// ---- command: the rule as a logged operation on the committed registry
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { createHash } = await import('crypto');
  const { TOOLS, RAW } = await import('./lib.mjs');
  const { CW_BOX } = await import('./registry-osm.mjs');
  const { LONDAT_DIR } = await import('./londat.mjs');
  const { Flow } = await import('./kgx-ops.mjs');
  const { kid, VOCAB } = await import('./kgx-ids.mjs');
  const { dataFactory: F } = await import('@factoidal/core');
  const CW = join(TOOLS, '..'), REG = join(CW, 'registry', 'buildings.json'), R = join(RAW, 'registry');
  const fhrsName = readdirSync(join(R, 'fhrs')).filter(f => /^FHRS530-.*\.json\.gz$/.test(f)).sort().at(-1);
  const files = { reg: REG, osm: join(R, 'osm-cw.json.gz'), fhrs: join(R, 'fhrs', fhrsName), pcs: join(CW, 'postcodes', 'postcodes.json'), ids: join(CW, 'registry', 'ids.json') };
  const before = JSON.parse(readFileSync(REG, 'utf8'));
  if (before.summary.placement) { console.log(JSON.stringify({ already: before.summary.placement.rule, note: 'registry/buildings.json already has the placement rule (a rebuild by build-registry.mjs applies it); nothing to do' })); process.exit(0); }
  const flow = new Flow(join(LONDAT_DIR, 'kgx'));
  const rel = p => p.slice(join(CW, '..').length + 1);
  const inputs = Object.values(files).map(p => flow.file(p, rel(p) + (p.includes('data/raw') ? ' (local raw extract; osm-cw and the FSA file are committed under data/raw/registry)' : '')));
  const out = await flow.run(PLACEMENT_OP, inputs, null, async () => {
    const osm = JSON.parse(gunzipSync(readFileSync(files.osm))), fhrs = JSON.parse(gunzipSync(readFileSync(files.fhrs)));
    const pcs = new Map(JSON.parse(readFileSync(files.pcs, 'utf8')).postcodes.map(p => [p.pc, p])), ids = JSON.parse(readFileSync(files.ids, 'utf8'));
    const geom = registryGeometry(osm, CW_BOX), key = b => `${b.f.type}/${b.f.id}`;
    for (const b of geom.outlines) b.id = ids.map[key(b)];
    const hostOf = mallHosts(geom.outlines, key);
    const want = before.summary.joins.cwg?.mall_hosts || {};
    if (JSON.stringify(Object.fromEntries(Object.entries(hostOf).map(([m, h]) => [m, h.id]))) !== JSON.stringify(want)) throw new Error('mall hosts differ from the registry build: ' + JSON.stringify(hostOf));
    const outlineOf = new Map(geom.outlines.map(b => [b.id, b])), tagsOf = new Map(osm.features.map(f => [`${f.type}/${f.id}`, f.tags || {}]));
    const recs = before.buildings.map(r => ({ ...r, postcodes: new Set(r.postcodes), keys: buildingKeys(r) }));
    if (recs.some(r => !outlineOf.has(r.id))) throw new Error('a registry building has no outline in the OSM extract: the extract is not the one the registry was built from');
    const byPostcode = before.unplaced_by_postcode || {};
    const { stats, changes, unplaced } = applyPlacement({ recs, hostOf, tagsOf, outlineOf, geom, fsaPos: fsaPositions(fhrs.establishments, pcs), pcs, byPostcode });
    const inSha = createHash('sha256').update(readFileSync(REG)).digest('hex');
    const buildings = recs.map(r => { const postcodes = [...r.postcodes].sort(); const { keys, ...rest } = r;
      return { ...rest, postcodes, postcode_info: postcodeInfo(postcodes, pcs), links: { ...r.links, ...postcodeLinks(postcodes) } }; });
    const sum = before.summary;
    Object.assign(sum, { with_occupants: buildings.filter(r => r.occupants.length).length, occupants: buildings.reduce((n, r) => n + r.occupants.length, 0),
      fsa_placed: buildings.reduce((n, r) => n + r.occupants.filter(o => o.source === 'fsa').length, 0), fsa_by_postcode_only: Object.values(byPostcode).flat().length,
      placement: { rule: `${PLACEMENT_OP.id} v${PLACEMENT_OP.version}`, applied_by: 'cwplans/tools/registry-placement.mjs to the committed registry', input_sha256: inSha, stats } });
    writeFileSync(REG, JSON.stringify({ ...before, summary: sum, buildings, unplaced_by_postcode: byPostcode, placement_unplaced: unplaced }));
    // the change set as a graph: one node per occupant link the rule changed
    const V = VOCAB, S = 'https://schema.org/', N = F.namedNode, q = [], add = (s, p, o) => { if (o != null && o !== '') q.push(F.quad(N(s), N(p), typeof o === 'string' ? N(o) : o, F.defaultGraph())); };
    const lit = v => v == null || v === '' ? null : F.literal(String(v));
    for (const c of changes) {
      const src = c.o.osm ? `osm-${c.o.osm}` : c.o.fhrs_id ? `fhrs-${c.o.fhrs_id}` : `branch-${c.o.nsi_id || ''}-${c.o.name}`;
      const s = kid('building', c.from, 'placement', src);
      add(s, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', V + 'PlacementChange'); add(s, S + 'name', lit(c.o.name)); add(s, V + 'sourceKind', lit(c.o.source));
      if (c.o.osm) add(s, S + 'sameAs', 'https://www.openstreetmap.org/' + c.o.osm); if (c.o.url) add(s, S + 'sameAs', c.o.url);
      add(s, V + 'fromBuilding', kid('building', c.from)); if (c.to) add(s, V + 'toBuilding', kid('building', c.to));
      add(s, V + 'positionClass', lit(c.pos.label)); add(s, V + 'placementKey', lit(c.key)); add(s, V + 'placementConfidence', lit(c.confidence));
      add(s, V + 'placementPrecision', lit(c.precision)); add(s, V + 'fault', lit(c.fault)); add(s, V + 'mall', lit(c.o.mall));
    }
    console.error(JSON.stringify(stats));
    return { 'registry-placement': { quads: q, about: { title: `Occupant placements changed by the mall and postcode-centre rule (F4, F7): ${changes.length} links of registry/buildings.json ${inSha.slice(0, 16)}`, licence: 'derived from OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0), FSA ratings (OGL), ONSPD (OGL), Canary Wharf Group directory (crawl rule, scoping)', osm: true } } };
  });
  const v = out['registry-placement'];
  const ehF = join(LONDAT_DIR, 'kgx', 'external-heads.json'), eh = existsSync(ehF) ? JSON.parse(readFileSync(ehF, 'utf8')) : {};
  eh['registry-placement'] = v.iri; writeFileSync(ehF, JSON.stringify(eh, null, 1) + '\n');
  console.log(JSON.stringify({ version: v.iri, triples: v.triples, new: flow.ran.length }));
}
