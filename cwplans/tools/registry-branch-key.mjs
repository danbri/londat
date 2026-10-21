#!/usr/bin/env node
// One branch key across sources (faults F46 and F20; skill docklands-data-curation, "Recount of 2026-10-21", rule 2).
// One rule over every registry occupant, never a patch of one: records of one shop, clinic or office from different
// sources (OSM, FSA, the CWG directory, store pages, the public registers, Wikidata) become one occupant that keeps every
// source record as provenance (merged_from), with a confidence per merge and a review list of the uncertain ones.
//
// Keys, in this order:
//   1. a shared identifier: OSM id, FSA id, CWG page, store page, ODS code, CQC location, school URN, Ofsted URN, Active
//      Places site, gambling premises, Wikidata item, charity or company number (high). Across buildings only the
//      branch-level ones count (not ODS, Wikidata, charity, company: an organisation can have several places).
//   2. the same name key in one building (the audit's ID-2 normalisation, letters and digits only), different sources:
//      high with a second agreement (the same mall, the same brand item, the same street number), else medium; low (not
//      merged, review list) when the two addresses give different numbers in the same street. Never an organisation
//      record (Wikidata headquarters or occupant, an ODS head office, a charity) with a chain branch: "HSBC" the
//      company and "HSBC UK" the bank branch stay apart. Same source without a shared id: not merged (review list), except
//      F20: an ODS head office and an ODS site of the same name in one building are the provider and its site (medium).
//   3. the same name key in two or more buildings within 250 m, one record per building, no source in two of them: one
//      branch placed twice by two sources (F46). Placed by the source order (rank below): medium when the best record is
//      placed by a mall, an address key or an OSM point and every other one only by an FSA point, a register or Wikidata
//      coordinate or a key taken from another record's name, and the buildings are within 150 m; else low (review list).
//      A word-prefix name ("Hazev" / "Hazev Restaurant") in one building: low (review list).
// Placement rank of a record (lower is better; the rule's source order "OSM indoor node with a level > CWG mall address
// > FSA point"): 1 OSM node with a level in a named mall, 2 CWG directory record with a mall or any record placed by its
// mall, 3 a high-confidence address key, 4 an OSM point or a branch point, 5 an FSA address point or a medium key,
// 6 the rest. The best record is the primary: its name, role, source order and placement stay; fields it lacks are taken
// from the others; a second CWG page goes to cwg_also; registers are joined.
// Library: build-registry.mjs applies it after the placement rule (registry-placement.mjs). Command: applies it as the
// logged operation merge-occupants-by-branch-key (kgx-ops Flow) to the committed registry/buildings.json and writes the
// change set as graph registry-branch-merge (external head):
//   node cwplans/tools/registry-branch-key.mjs
// Skills: docklands-data-curation (F46, F20), cwplans-dataflow.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { postcodeEvidence, postcodeInfo, postcodeLinks, normAddr, STREET, buildingKeys } from './registry-placement.mjs';
import { nameKeys } from '../registry/sources/brands/tools/cwg-fields.mjs';

export const BRANCH_OP = { id: 'merge-occupants-by-branch-key', version: 1, skill: 'docklands-data-curation', tool: 'cwplans/tools/registry-branch-key.mjs',
  about: 'registry/buildings.json (after the placement rule) + the OSM extract of the box + ONSPD postcodes + ids.json -> the same registry with the records of one branch from different sources as one occupant (shared identifier, name in one building, name across buildings within 250 m), each merge with its key and confidence, and a review list of the uncertain ones (F46, F20); the change set as graph registry-branch-merge' };

// the audit's ID-2 name normalisation (audit-quality.mjs imports it), and the key: the same without spaces
export const normName = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(\d+\)/g, ' ').replace(/&/g, ' and ')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\b(the|ltd|limited|plc|uk|london|canary wharf|e14)\b/g, ' ').replace(/\s+/g, ' ').trim();
export const nameKey = s => normName(s).replace(/ /g, '');
// looser keys for one building: the name without a branch suffix naming a place ("Pret A Manger, Cabot Place",
// "Hawksmoor Wood Wharf": cwg-fields.mjs nameKeys) or without a final kind word ("Nando's Restaurant", "Starbucks Coffee")
const KIND_WORD = / (restaurant|coffee|cinema|cucina)$/;
export const nameVariants = s => new Set([...nameKeys(s).map(nameKey), nameKey(normName(s).replace(KIND_WORD, ''))].filter(k => k.length >= 3));
export const sourcesOf = o => String(o.source || '').split('+').filter(Boolean);
// every source record of an occupant: the occupant itself (the primary) and the records merged into it
export const recordsOf = o => [o, ...(o.merged_from || [])];
// a record's own source (an occupant made by a merge has the union in source and its primary record's in primary_source)
const own = r => r.primary_source ?? r.source;

// identifier fields: [field, prefix, branch level]
const IDS = [['osm', 'osm', true], ['fhrs_id', 'fhrs', true], ['cwg_url', 'cwg', true], ['store_url', 'store', true], ['cqc_location_id', 'cqc', true], ['urn', 'urn', true],
  ['ofsted_urn', 'ofsted', true], ['active_places_site_id', 'ap', true], ['gambling_premises_id', 'gambling', true], ['ods_code', 'ods', false], ['wikidata', 'wd', false],
  ['charity_number', 'charity', false], ['company_number', 'company', false]];
// the same identifiers as OSM tags on an OSM record (238 OSM occupants carry fhrs:id, 2026-10-21)
const OSM_IDS = [['fhrs:id', 'fhrs', true], ['ref:GB:cqc_location', 'cqc', true], ['ref:edubase', 'urn', true], ['wikidata', 'wd', false], ['ref:GB:nhs_ods', 'ods', false]];
// identifier types of which one place has one value: two records with different values are two places
const EXCLUSIVE = ['fhrs', 'wd', 'cqc', 'urn'];
const normUrl = u => String(u).toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
export function idKeys(o, branchOnly = false, tagsOf = null) {
  const out = new Set();
  for (const r of recordsOf(o)) {
    for (const [f, p, br] of IDS) {
      if (branchOnly && !br) continue;
      for (const v of [r[f], ...(f === 'cwg_url' ? r.cwg_also || [] : [])]) if (v != null && v !== '') out.add(`${p}:${/url$/.test(f) ? normUrl(v) : String(v).trim()}`);
    }
    const t = r.osm && tagsOf ? tagsOf.get(r.osm) : null;
    if (t) for (const [k, p, br] of OSM_IDS) if (t[k] && !(branchOnly && !br)) for (const v of String(t[k]).split(';')) if (v.trim()) out.add(`${p}:${v.trim()}`);
  }
  return out;
}
// an identifier type both records have, with no value in common
const idConflict = (ia, ib) => EXCLUSIVE.filter(p => { const a = [...ia].filter(k => k.startsWith(p + ':')), b = [...ib].filter(k => k.startsWith(p + ':')); return a.length && b.length && !a.some(k => b.includes(k)); });
// organisation (a company, provider or charity as a whole), chain branch, or place
const scopeOf = o => /^(headquarters|occupant \(Wikidata|head office)/.test(o.role || '') || own(o) === 'charities' ? 'organisation' : /^branch: /.test(o.role || '') ? 'branch' : 'place';
// an address that names the record's own building ("53 Poplar High Street" on the building at 53 Poplar High Street)
const bkCache = new WeakMap();
const addrNamesBuilding = (r, rec) => { if (!r.address || !rec) return false; let ks = bkCache.get(rec); if (!ks) bkCache.set(rec, ks = buildingKeys(rec).filter(k => /^\d/.test(k)));
  const a = normAddr(r.address); return ks.some(k => new RegExp(`(^| )${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(a)); };
const placementRank = (o, rec) => {
  let best = 6;
  for (const r of recordsOf(o)) {
    const s = sourcesOf({ source: own(r) }), by = String(r.placed_by || ''), lv = r.level != null && r.level !== '';
    const k = r.osm && lv && r.mall ? 1 : ((s.includes('cwg') || r.cwg_url) && r.mall) || /mall/.test(by) ? 2 : r.placed_confidence === 'high' || (/^FSA point$/.test(by) && addrNamesBuilding(r, rec)) ? 3
      : r.osm || /^branch point/.test(by) ? 4 : (/^FSA point$/.test(by) || r.placed_confidence === 'medium') && !/name/.test(by) ? 5 : 6;
    best = Math.min(best, k);
  }
  return best;
};
const RANK = { 1: 'OSM node with a level in a named mall', 2: 'CWG mall address or a mall key', 3: 'address key (high)', 4: 'OSM point or branch point', 5: 'FSA address point or a medium key', 6: 'register or Wikidata coordinate, name key or low key' };
const SRC_ORDER = ['osm', 'cwg', 'storelocator', 'wikidata', 'ods', 'cqc', 'gias', 'ofsted-childcare', 'active-places', 'charities', 'gambling', 'fsa-pubs', 'fsa'];
const srcOrder = o => { const i = SRC_ORDER.indexOf(sourcesOf(o)[0]); return i < 0 ? SRC_ORDER.length : i; };
// house numbers and street of an address ("Unit 5 Michigan Building, 2 Biscayne Avenue" -> 2, BISCAYNE AVENUE)
const numsOf = s => { const out = []; for (const m of String(s).matchAll(/(\d+)\s*[a-z]?(?:\s*(?:-|to)\s*(\d+))?/gi)) { const a = +m[1], b = m[2] ? +m[2] : a; for (let n = a; n <= Math.min(b, a + 40); n++) out.push(n); } return out; };
function addressOf(o, tagsOf) {
  const out = [];
  for (const r of recordsOf(o)) {
    const t = r.osm ? tagsOf.get(r.osm) || {} : null;
    if (t && t['addr:housenumber'] && t['addr:street']) out.push({ street: normAddr(t['addr:street']), nums: numsOf(t['addr:housenumber']) });
    const m = r.address && !r.osm ? String(r.address).match(STREET) : null;
    if (m) out.push({ street: normAddr(m[1]), nums: numsOf(m[0].slice(0, m[0].length - m[1].length)) });
  }
  return out;
}
// same street and overlapping numbers: agree; same street, no number in common: conflict
function addressCompare(a, b, tagsOf) {
  const A = addressOf(a, tagsOf), B = addressOf(b, tagsOf); let agree = false, conflict = false;
  for (const x of A) for (const y of B) if (x.street && x.street === y.street) { if (x.nums.some(n => y.nums.includes(n))) agree = true; else conflict = true; }
  return agree ? 'agree' : conflict ? 'conflict' : null;
}
const mallOf = o => recordsOf(o).map(r => r.mall).find(Boolean) || null;
const brandOf = o => recordsOf(o).map(r => r.brand_wikidata).find(Boolean) || null;
const metres = (a, b) => { const R = 6371008, r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos((a.lat + b.lat) / 2 * r), y = (b.lat - a.lat) * r; return Math.round(Math.hypot(x, y) * R); };
const idOf = o => { for (const [f, p] of IDS) if (o[f] != null && o[f] !== '') return `${p}:${/url$/.test(f) ? normUrl(o[f]) : o[f]}`; return null; };
const label = (o, b) => `${o.source} "${o.name}"${idOf(o) ? ' ' + idOf(o) : ''}${b ? ' in ' + b : ''}`;
const CONF = { high: 3, medium: 2, low: 1 };
const KEEP_OWN = new Set(['name', 'role', 'source', 'placed', 'placed_by', 'placed_confidence', 'placement_fault', 'position', 'point_in', 'merged_from', 'merge_rule', 'merge_confidence', 'merge_evidence', 'branch_key', 'cwg_also', 'registers', 'primary_source']);

// a pair of occupants (or merged occupants) with a shared key: { confidence, rule, evidence } or { review: reason }.
// how: 'id' (shared identifier), 'name' (same name key), 'variant' (same name without a place or kind word)
function judgePair(a, b, { tagsOf, sameBuilding, how }) {
  const ia = idKeys(a, !sameBuilding, tagsOf), ib = idKeys(b, !sameBuilding, tagsOf), shared = [...ia].filter(k => ib.has(k));
  const sa = scopeOf(a), sb = scopeOf(b);
  if ([sa, sb].includes('organisation') && [sa, sb].includes('branch')) return { review: 'an organisation record and a chain branch of the same name: kept apart' };
  const clash = idConflict(idKeys(a, false, tagsOf), idKeys(b, false, tagsOf));
  if (clash.length) return { review: `different identifiers of one kind (${clash.join(', ')}): two places` };
  if (shared.length) return { confidence: 'high', rule: 'shared identifier', evidence: shared.map(k => `same ${k.split(':')[0]} id ${k.slice(k.indexOf(':') + 1)}`) };
  // two records of one source with different ids are two things unless a rule says otherwise
  const srcA = sourcesOf(a), srcB = sourcesOf(b), overlap = srcA.some(s => srcB.includes(s));
  const ods = srcA.includes('ods') && srcB.includes('ods') && [a.role, b.role].includes('head office (ODS)') && [a.role, b.role].includes('register: ods');
  if (overlap && !ods) return { review: `same source (${srcA.filter(s => srcB.includes(s)).join('+')}) and no second key` };
  const addr = addressCompare(a, b, tagsOf);
  if (addr === 'conflict') return { review: 'the addresses give different numbers in the same street' };
  if (!sameBuilding) return { cross: true, addr };
  if (ods) return { confidence: 'medium', rule: 'ODS provider and its site (F20)', evidence: ['same name key', 'one ODS head office, one ODS site, one building'] };
  const ev = [how === 'variant' ? 'same name without a place or kind word, in one building' : 'same name key in one building'], second = [];
  if (mallOf(a) && mallOf(a) === mallOf(b)) second.push(`same mall ${mallOf(a)}`);
  if (brandOf(a) && brandOf(a) === brandOf(b)) second.push(`same brand item ${brandOf(a)}`);
  if (addr === 'agree') second.push('same street number');
  return { confidence: second.length ? 'high' : 'medium', rule: how === 'variant' ? 'name with a place or kind word in one building' : 'name in one building', evidence: [...ev, ...second] };
}

// merge `others` into `primary` (in place)
function absorb(primary, others) {
  primary.merged_from ||= []; primary.primary_source ??= primary.source;
  const srcs = sourcesOf(primary);
  for (const { o, building } of others) {
    const { merged_from: inner, primary_source: ps, merge_rule, merge_confidence, merge_evidence, branch_key, ...rec } = o;
    primary.merged_from.push({ ...rec, source: ps ?? rec.source, building });
    for (const x of inner || []) primary.merged_from.push({ ...x, building: x.building || building });
    for (const s of sourcesOf(o)) if (!srcs.includes(s)) srcs.push(s);
    for (const [k, v] of Object.entries(rec)) {
      if (KEEP_OWN.has(k) || v == null || v === '') continue;
      if (k === 'cwg_url' && primary.cwg_url && primary.cwg_url !== v) { primary.cwg_also = [...new Set([...(primary.cwg_also || []), v])]; continue; }
      if (primary[k] == null || primary[k] === '') primary[k] = v;
    }
    for (const u of rec.cwg_also || []) if (u !== primary.cwg_url) primary.cwg_also = [...new Set([...(primary.cwg_also || []), u])];
    if (rec.registers?.length) { const seen = new Set((primary.registers || []).map(r => r.id)); primary.registers = [...(primary.registers || []), ...rec.registers.filter(r => !seen.has(r.id))]; }
  }
  primary.source = srcs.join('+');
}
// in one building the primary is chosen by the source order (its name and role are the shop's own; FSA names carry
// suffixes such as "Canary Wharf"); across buildings by the placement rank first
const pickPrimary = os => [...os].sort((a, b) => srcOrder(a.o) - srcOrder(b.o) || String(idOf(a.o)).localeCompare(String(idOf(b.o))))[0];
const recordView = ({ o, building }) => ({ name: o.name, source: o.source, ...(idOf(o) ? { id: idOf(o) } : {}), building });

// ---- the rule. recs: registry records (occupants, lat, lon, postcodes as a Set); tagsOf: OSM key -> tags; outlineTags:
// building id -> its outline's tags (for the postcode evidence of the buildings a merge moves a record out of or into).
export function applyBranchMerge({ recs, tagsOf, outlineTags }) {
  const st = { occupants_before: 0, occupants_after: 0, merges: 0, records_absorbed: 0, by_rule: {}, by_confidence: {}, in_one_building: { merges: 0, by_confidence: {} }, across_buildings: { merges: 0, by_confidence: {} }, review: {}, buildings_postcodes_changed: 0 };
  const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
  const changes = [], review = [], touched = new Set();
  const sorted = [...recs].sort((a, b) => a.id.localeCompare(b.id));
  for (const r of sorted) st.occupants_before += r.occupants.length;
  const note = (reason, items) => { review.push({ reason, records: items.map(recordView) }); inc(st.review, reason); };

  // 1-2. in each building: shared identifiers, then the same name key, then the name without a place or kind word.
  // Groups are joined strongest pair first, and only when no pair across the two groups is a review pair.
  for (const r of sorted) {
    const occ = r.occupants.map((o, i) => ({ o, i, building: r.id, ids: idKeys(o, false, tagsOf), key: nameKey(o.name), vars: nameVariants(o.name) }));
    const pairs = [];
    for (let i = 0; i < occ.length; i++) for (let j = i + 1; j < occ.length; j++) {
      const A = occ[i], B = occ[j];
      const how = [...A.ids].some(k => B.ids.has(k)) ? 'id' : A.key.length >= 3 && A.key === B.key ? 'name' : [...A.vars].some(k => B.vars.has(k) || k === B.key) || B.vars.has(A.key) ? 'variant' : null;
      if (!how) {
        // a word-prefix name with no other key: never merged, listed for review
        const na = normName(A.o.name), nb = normName(B.o.name), [s, l] = na.length <= nb.length ? [na, nb] : [nb, na];
        if (s.length >= 5 && l.startsWith(s + ' ') && !sourcesOf(A.o).some(x => sourcesOf(B.o).includes(x)) && scopeOf(A.o) === scopeOf(B.o)) pairs.push({ i, j, review: 'word-prefix name in one building (low)', soft: true });
        continue;
      }
      pairs.push({ i, j, how, ...judgePair(A.o, B.o, { tagsOf, sameBuilding: true, how }) });
    }
    const group = occ.map((_, i) => i), find = i => group[i] === i ? i : (group[i] = find(group[i]));
    // a name match is ambiguous when a record has two partners of one source by name that no identifier joins (three
    // Wikidata records of one item are one partner): neither is merged
    const idg = occ.map((_, i) => i), idFind = i => idg[i] === i ? i : (idg[i] = idFind(idg[i]));
    for (const p of pairs) if (p.confidence && p.how === 'id') idg[idFind(p.j)] = idFind(p.i);
    for (let i = 0; i < occ.length; i++) {
      const by = {};
      for (const p of pairs) if (p.confidence && p.how !== 'id' && (p.i === i || p.j === i)) { const other = p.i === i ? p.j : p.i; ((by[sourcesOf(occ[other].o)[0]] ||= new Map()).get(idFind(other)) || by[sourcesOf(occ[other].o)[0]].set(idFind(other), []).get(idFind(other))).push(p); }
      for (const m of Object.values(by)) if (m.size > 1) for (const ps of m.values()) for (const p of ps) Object.assign(p, { confidence: null, review: 'ambiguous: one record matches two records of one source by name' });
    }
    const conf = new Map(), rules = new Map(), evid = new Map();
    const blocked = pairs.filter(p => p.review && !p.soft);
    for (const p of pairs.filter(p => p.confidence).sort((a, b) => CONF[b.confidence] - CONF[a.confidence] || a.i - b.i || a.j - b.j)) {
      const gi = find(p.i), gj = find(p.j); if (gi === gj) continue;
      const inI = k => find(k) === gi, inJ = k => find(k) === gj;
      if (blocked.some(b => (inI(b.i) && inJ(b.j)) || (inI(b.j) && inJ(b.i)))) continue;
      group[gj] = gi;
      const c = [conf.get(gi), conf.get(gj), p.confidence].filter(Boolean).sort((a, b) => CONF[a] - CONF[b])[0];
      conf.set(gi, c); rules.set(gi, [...new Set([...(rules.get(gi) || []), ...(rules.get(gj) || []), p.rule])]); evid.set(gi, [...new Set([...(evid.get(gi) || []), ...(evid.get(gj) || []), ...p.evidence])]);
    }
    // the review list: one entry per reason and set of (merged) occupants
    const seen = new Set();
    for (const p of pairs.filter(p => p.review)) {
      const gi = find(p.i), gj = find(p.j); if (gi === gj) continue;
      const k = p.review + '|' + [gi, gj].sort((a, b) => a - b).join(','); if (seen.has(k)) continue; seen.add(k);
      p.gi = gi; p.gj = gj;
    }
    const groups = new Map(); occ.forEach((x, k) => { const g = find(k); (groups.get(g) || groups.set(g, []).get(g)).push(x); });
    const prim = new Map(), drop = new Set();
    for (const [g, members] of groups) {
      const P = members.length > 1 ? pickPrimary(members) : members[0]; prim.set(g, P); if (members.length < 2) continue;
      const rest = members.filter(m => m !== P);
      absorb(P.o, rest); for (const m of rest) drop.add(m.o);
      Object.assign(P.o, { branch_key: idOf(P.o) || `name:${P.key}@${r.id}`, merge_rule: rules.get(g).join('; '), merge_confidence: conf.get(g), merge_evidence: evid.get(g) });
      st.merges++; st.records_absorbed += rest.length; inc(st.by_confidence, conf.get(g)); for (const x of rules.get(g)) inc(st.by_rule, x);
      st.in_one_building.merges++; inc(st.in_one_building.by_confidence, conf.get(g));
      changes.push({ o: P.o, to: r.id, from: [r.id], absorbed: rest.map(m => m.o), confidence: conf.get(g), rule: rules.get(g).join('; '), evidence: evid.get(g), rank: RANK[placementRank(P.o, r)] });
    }
    // review components per reason: Canary Wall x 3 is one entry
    const byReason = new Map();
    for (const p of pairs.filter(p => p.gi != null)) { const m = byReason.get(p.review) || byReason.set(p.review, new Map()).get(p.review); const c = new Set([...(m.get(p.gi) || [p.gi]), ...(m.get(p.gj) || [p.gj])]); for (const x of c) m.set(x, c); }
    for (const [reason, m] of byReason) for (const c of new Set(m.values())) note(reason, [...c].sort((a, b) => a - b).map(g => prim.get(g)));
    r.occupants = r.occupants.filter(o => !drop.has(o));
  }

  // 3. the same name key in two or more buildings within 250 m (one branch placed twice, F46)
  const byKey = new Map();
  for (const r of sorted) for (const o of r.occupants) { const k = nameKey(o.name); if (k.length >= 3) (byKey.get(k) || byKey.set(k, []).get(k)).push({ o, r, building: r.id }); }
  for (const [k, items] of [...byKey].sort((a, b) => a[0].localeCompare(b[0]))) {
    const bs = [...new Set(items.map(x => x.building))]; if (bs.length < 2 || bs.length !== items.length) continue;     // one record per building
    const srcs = items.flatMap(x => sourcesOf(x.o)); if (new Set(srcs).size !== srcs.length) continue;              // no source twice: not a chain's branches
    const far = Math.max(...items.flatMap(a => items.map(b => metres(a.r, b.r)))); if (far > 250) continue;
    const rank = x => placementRank(x.o, x.r);
    const ranked = [...items].sort((a, b) => rank(a) - rank(b) || srcOrder(a.o) - srcOrder(b.o)), P = ranked[0], rest = ranked.slice(1);
    let res = null, sharedAll = true;
    const ev = [`same name key in ${items.length} buildings within ${far} m`];
    for (const x of rest) {
      const j = judgePair(P.o, x.o, { tagsOf, sameBuilding: false, how: 'name' });
      if (j.review) { res = { review: j.review }; break; }
      if (j.confidence === 'high') { ev.push(...j.evidence); continue; }
      sharedAll = false;
    }
    if (!res) {
      // medium: a mall position over an OSM point or weaker, or an OSM point or address key over an FSA point, register or
      // Wikidata coordinate; within 150 m
      const rp = rank(P), worst = Math.min(...rest.map(rank)), strongOverWeak = (rp <= 2 && worst >= 4) || (rp <= 4 && worst >= 5);
      // the same branch by an identifier, but two strong positions in two buildings: placed by the rank, medium
      if (sharedAll) { res = { confidence: strongOverWeak ? 'high' : 'medium', rule: 'shared identifier across buildings' }; ev.push(`placed by ${RANK[rp]}${strongOverWeak ? '' : `; the others by ${[...new Set(rest.map(x => RANK[rank(x)]))].join(', ')}: two strong positions, placed by the rank order`}`); }
      else if (strongOverWeak && far <= 150) { res = { confidence: 'medium', rule: 'name across buildings, placed by the source order' }; ev.push(`placed by ${RANK[rp]}; the others by ${[...new Set(rest.map(x => RANK[rank(x)]))].join(', ')}`); }
      else res = { review: rp > 4 ? 'one branch in two buildings? no record has a strong position (low)' : !strongOverWeak ? 'one branch in two buildings? two strong positions disagree (low)' : 'one branch in two buildings? more than 150 m apart (low)' };
    }
    if (res.review) { note(res.review, items); continue; }
    absorb(P.o, rest.map(x => ({ o: x.o, building: x.building })));
    for (const x of rest) { x.r.occupants.splice(x.r.occupants.indexOf(x.o), 1); touched.add(x.building); }
    touched.add(P.building);
    const prevEv = P.o.merge_evidence || [];
    Object.assign(P.o, { branch_key: P.o.branch_key || idOf(P.o) || `name:${k}@${P.building}`, merge_rule: [P.o.merge_rule, res.rule].filter(Boolean).join('; '),
      merge_confidence: P.o.merge_confidence && CONF[P.o.merge_confidence] < CONF[res.confidence] ? P.o.merge_confidence : res.confidence, merge_evidence: [...prevEv, ...ev] });
    st.merges++; st.records_absorbed += rest.length; inc(st.by_confidence, res.confidence); inc(st.by_rule, res.rule);
    st.across_buildings.merges++; inc(st.across_buildings.by_confidence, res.confidence);
    changes.push({ o: P.o, to: P.building, from: items.map(x => x.building), absorbed: rest.map(x => x.o), confidence: res.confidence, rule: res.rule, evidence: ev, rank: RANK[rank(P)] });
  }
  // postcodes of the buildings a record left or entered, from their evidence (merged records count)
  for (const r of sorted) {
    if (!touched.has(r.id)) continue;
    const now = postcodeEvidence(r, outlineTags.get(r.id), tagsOf), old = [...r.postcodes].filter(Boolean);
    if (old.length !== now.size || old.some(pc => !now.has(pc))) st.buildings_postcodes_changed++;
    r.postcodes = now;
  }
  for (const r of sorted) st.occupants_after += r.occupants.length;
  return { stats: st, changes, review };
}

// ---- command: the rule as a logged operation on the committed registry
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { createHash } = await import('crypto');
  const { TOOLS, RAW } = await import('./lib.mjs');
  const { LONDAT_DIR } = await import('./londat.mjs');
  const { Flow } = await import('./kgx-ops.mjs');
  const { kid, VOCAB } = await import('./kgx-ids.mjs');
  const { dataFactory: F } = await import('@factoidal/core');
  const CW = join(TOOLS, '..'), REG = join(CW, 'registry', 'buildings.json'), R = join(RAW, 'registry');
  const files = { reg: REG, osm: join(R, 'osm-cw.json.gz'), pcs: join(CW, 'postcodes', 'postcodes.json'), ids: join(CW, 'registry', 'ids.json') };
  const before = JSON.parse(readFileSync(REG, 'utf8'));
  if (process.argv.includes('--dry')) {
    // the rule on the committed registry, printed, nothing written or logged (for reading the merges and the review list)
    const osm = JSON.parse(gunzipSync(readFileSync(files.osm))), ids = JSON.parse(readFileSync(files.ids, 'utf8'));
    const tagsOf = new Map(osm.features.map(f => [`${f.type}/${f.id}`, f.tags || {}])), outlineTags = new Map();
    for (const f of osm.features) { const id = ids.map[`${f.type}/${f.id}`]; if (id && (f.tags?.building || f.tags?.['building:part'])) outlineTags.set(id, f.tags); }
    const { stats, changes, review } = applyBranchMerge({ recs: before.buildings.map(r => ({ ...r, postcodes: new Set(r.postcodes) })), tagsOf, outlineTags });
    for (const c of changes) console.log(['MERGE', c.confidence, c.to, c.from.join(','), JSON.stringify(c.o.name), c.o.source, c.rule, c.evidence.join(' | ')].join('\t'));
    for (const r of review) console.log(['REVIEW', r.reason, r.records.map(x => `${x.building} ${x.source} "${x.name}" ${x.id || ''}`).join(' || ')].join('\t'));
    console.log(JSON.stringify(stats, null, 1)); process.exit(0);
  }
  if (before.summary.branch_merge) { console.log(JSON.stringify({ already: before.summary.branch_merge.rule, note: 'registry/buildings.json already has the branch-key rule (a rebuild by build-registry.mjs applies it); nothing to do' })); process.exit(0); }
  if (!before.summary.placement) throw new Error('the branch-key rule runs after the placement rule: run registry-placement.mjs first');
  const flow = new Flow(join(LONDAT_DIR, 'kgx'));
  const rel = p => p.slice(join(CW, '..').length + 1);
  const inputs = Object.values(files).map(p => flow.file(p, rel(p) + (p.includes('data/raw') ? ' (OSM extract of the box, committed under data/raw/registry)' : '')));
  const out = await flow.run(BRANCH_OP, inputs, null, async () => {
    const osm = JSON.parse(gunzipSync(readFileSync(files.osm)));
    const pcs = new Map(JSON.parse(readFileSync(files.pcs, 'utf8')).postcodes.map(p => [p.pc, p])), ids = JSON.parse(readFileSync(files.ids, 'utf8'));
    const tagsOf = new Map(osm.features.map(f => [`${f.type}/${f.id}`, f.tags || {}])), outlineTags = new Map();
    for (const f of osm.features) { const id = ids.map[`${f.type}/${f.id}`]; if (id && (f.tags?.building || f.tags?.['building:part'])) outlineTags.set(id, f.tags); }
    const recs = before.buildings.map(r => ({ ...r, postcodes: new Set(r.postcodes) }));
    const { stats, changes, review } = applyBranchMerge({ recs, tagsOf, outlineTags });
    const inSha = createHash('sha256').update(readFileSync(REG)).digest('hex');
    const buildings = recs.map(r => { const postcodes = [...r.postcodes].sort(); return { ...r, postcodes, postcode_info: postcodeInfo(postcodes, pcs), links: { ...r.links, ...postcodeLinks(postcodes) } }; });
    const sum = before.summary;
    Object.assign(sum, { with_occupants: buildings.filter(r => r.occupants.length).length, occupants: buildings.reduce((n, r) => n + r.occupants.length, 0),
      branch_merge: { rule: `${BRANCH_OP.id} v${BRANCH_OP.version}`, applied_by: 'cwplans/tools/registry-branch-key.mjs to the committed registry', input_sha256: inSha, stats } });
    writeFileSync(REG, JSON.stringify({ ...before, summary: sum, buildings, branch_merge_review: review }));
    // the change set as a graph: one node per merge (the occupant it made, its key, confidence, rule, evidence, the records
    // it took in and where they were), one node per reviewed pair
    const V = VOCAB, S = 'https://schema.org/', T = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', N = F.namedNode, q = [];
    const add = (s, p, o) => { if (o != null && o !== '') q.push(F.quad(N(s), N(p), typeof o === 'string' ? N(o) : o, F.defaultGraph())); };
    const lit = v => v == null || v === '' ? null : F.literal(String(v));
    const urls = o => [o.osm ? 'https://www.openstreetmap.org/' + o.osm : null, o.fhrs_id ? 'https://ratings.food.gov.uk/business/' + o.fhrs_id : null, o.cwg_url || null].filter(Boolean);
    for (const c of changes) {
      const s = kid('building', c.to, 'branchmerge', c.o.branch_key, c.from.length > 1 ? 'across' : 'in');
      add(s, T, V + 'BranchMerge'); add(s, S + 'name', lit(c.o.name)); add(s, V + 'branchKey', lit(c.o.branch_key)); add(s, V + 'sourceKind', lit(c.o.source));
      add(s, V + 'mergeConfidence', lit(c.confidence)); add(s, V + 'mergeRule', lit(c.rule)); for (const e of c.evidence) add(s, V + 'mergeEvidence', lit(e));
      add(s, V + 'placementRank', lit(c.rank)); add(s, V + 'toBuilding', kid('building', c.to)); for (const f of c.from) add(s, V + 'fromBuilding', kid('building', f));
      for (const u of urls(c.o)) add(s, S + 'sameAs', u);
      for (const a of c.absorbed) { add(s, V + 'absorbedRecord', lit(label(a))); for (const u of urls(a)) add(s, S + 'sameAs', u); }
      add(s, V + 'fault', lit(c.from.length > 1 ? 'F46' : /F20/.test(c.rule) || c.absorbed.some(a => /^(ods|cqc)/.test(a.source)) ? 'F20' : 'F46'));
    }
    review.forEach(rv => {
      const s = kid('building', rv.records[0].building, 'branchreview', createHash('sha1').update(JSON.stringify([rv.reason, rv.records])).digest('hex').slice(0, 12));
      add(s, T, V + 'BranchMergeReview'); add(s, V + 'reviewReason', lit(rv.reason)); for (const x of rv.records) add(s, V + 'reviewRecord', lit(`${x.source} "${x.name}"${x.id ? ' ' + x.id : ''} in ${x.building}`));
      for (const b of new Set(rv.records.map(x => x.building))) add(s, V + 'fromBuilding', kid('building', b));
    });
    console.error(JSON.stringify(stats));
    return { 'registry-branch-merge': { quads: q, about: { title: `Occupant records merged by one branch key across sources (F46, F20): ${changes.length} merges and ${review.length} pairs for review in registry/buildings.json ${inSha.slice(0, 16)}`, licence: 'derived from OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0), FSA ratings (OGL), ONSPD (OGL), public registers (OGL), Wikidata (CC0), Canary Wharf Group directory (crawl rule, scoping)', osm: true } } };
  });
  const v = out['registry-branch-merge'];
  const ehF = join(LONDAT_DIR, 'kgx', 'external-heads.json'), eh = existsSync(ehF) ? JSON.parse(readFileSync(ehF, 'utf8')) : {};
  eh['registry-branch-merge'] = v.iri; writeFileSync(ehF, JSON.stringify(eh, null, 1) + '\n');
  console.log(JSON.stringify({ version: v.iri, triples: v.triples, new: flow.ran.length }));
}
