#!/usr/bin/env node
// Step 4: merge OSM, FSA, CWG directory, Wikidata and brand store pages into one branch list.
//   node cwplans/registry/sources/brands/tools/build-branches.mjs
// in:  data/raw/registry/{osm,fsa}-branches.json, cwg-directory.json, wikidata-near.json, wikidata-brands.json, storelocator.json
//      (if present), tools/cwg-decisions.json, postcodes/postcodes.json
// Every input and output, with endpoints and rules: cwplans/pipeline.json, activity "build-branches".
// out: registry/sources/brands/branches.json
// Joining rule: records join only when they are the same brand (same Wikidata QID, else same NSI id) AND
// the same place: within 120 m, or the same postcode, or the same mall named in both addresses.
// Positions: OSM feature > FSA geocode > ONSPD postcode centroid (flagged).
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { CW, OUT, RAW, readJSON, inBox } from './lib.mjs';
import { matchAny, byId, byWd } from './nsi-matcher.mjs';
import { osmList, unitLabel } from '../../../../tools/osm-values.mjs';

const osm = readJSON(join(RAW, 'osm-branches.json')).branches;
const fsa = readJSON(join(RAW, 'fsa-branches.json')).branches;
const cwg = readJSON(join(OUT, 'cwg-directory.json')).directory;
const wdNear = readJSON(join(OUT, 'wikidata-near.json')).linked;
const wdBrands = readJSON(join(OUT, 'wikidata-brands.json')).brands;
const store = existsSync(join(OUT, 'storelocator.json')) ? readJSON(join(OUT, 'storelocator.json')).checked : [];
const CWG_DECIDE = JSON.parse(readFileSync(new URL('./cwg-decisions.json', import.meta.url), 'utf8'));
const pcPos = new Map(readJSON(join(CW, 'postcodes/postcodes.json')).postcodes.filter(p => p.lat).map(p => [p.pc, [+p.lon, +p.lat]]));
const normPc = s => { const m = (s || '').toUpperCase().replace(/\s+/g, '').match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/); return m ? `${m[1]} ${m[2]}` : null; };

const CAT = [
  [/^amenity=(bank|bureau_de_change)|^office=financial|^shop=money_lender/, 'bank'],
  [/^amenity=pharmacy|^shop=chemist/, 'pharmacy'],
  [/^shop=(supermarket|convenience)/, 'supermarket'],
  [/^amenity=cafe|^shop=(coffee|tea)/, 'cafe'],
  [/^amenity=fast_food|^shop=(bakery|pastry|confectionery|chocolate|deli)/, 'takeaway'],
  [/^amenity=(restaurant|food_court)/, 'restaurant'],
  [/^amenity=(bar|pub|nightclub)|^shop=(alcohol|wine)/, 'bar'],
  [/^leisure=(fitness_centre|sports_centre|trampoline_park)|^amenity=gym/, 'gym'],
  [/^tourism=(hotel|apartment|hostel)/, 'hotel'],
  [/^amenity=(cinema|theatre)|^leisure=/, 'leisure'],
  [/^amenity=(dentist|clinic|doctors)|^healthcare=|^shop=(optician|hearing_aids)/, 'health'],
  [/^amenity=(childcare|kindergarten)/, 'childcare'],
  [/^office=/, 'office'],
  [/^shop=(car|car_repair|motorcycle)|^amenity=car_rental/, 'motoring'],
  [/^amenity=(post_office)|^shop=(hairdresser|beauty|dry_cleaning|laundry|travel_agency|estate_agent|copyshop|photo|mobile_phone_repair|shoe_repair|massage|tattoo)|^office=(estate_agent|travel_agent)|^amenity=(bookmaker|betting)|^shop=bookmaker|^amenity=(coworking_space)/, 'service'],
  [/^shop=/, 'shop'],
];
const category = kv => { for (const [re, c] of CAT) if (kv.split(';').some(x => re.test(x))) return c; return 'other'; };
const R = 6371000, rad = x => x * Math.PI / 180;
const dist = (a, b) => { const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const brandKey = (wd, nsi, name) => wd || (nsi && byId.get(nsi)?.wd) || nsi || 'name:' + (name || '').toLowerCase();
// malls and named retail places (not streets). Positions are the centres of the OSM features of that name
// (Jubilee Place ways 193407931 etc., Canada Place relation 2600084, Cabot Place Mall way 193407945,
// Churchill Place ways, Crossrail Place way 281015404, One Canada Square way 5986754), read 2026-10-03.
const MALLS = /(Jubilee Place|Canada Place|Cabot Place|Churchill Place|Crossrail Place|One Canada Square|The Park Pavilion|West Wintergarden|Columbus Courtyard|Wood Wharf)/i;
const MALL_POS = { 'Jubilee Place': [-0.0188, 51.5029], 'Canada Place': [-0.0181, 51.5047], 'Cabot Place': [-0.0206, 51.5051], 'Churchill Place': [-0.0145, 51.5044], 'Crossrail Place': [-0.0182, 51.5061], 'One Canada Square': [-0.0195, 51.5049], 'The Park Pavilion': [-0.0189, 51.5048] };
const canonMall = m => m ? Object.keys(MALL_POS).concat(['The Park Pavilion', 'West Wintergarden', 'Columbus Courtyard', 'Wood Wharf']).find(k => k.toLowerCase() === m.toLowerCase()) || m : null;
// postcode -> mall, learnt from CWG's own addresses: kept when >= 4 CWG entries share the postcode and
// >= 85% of them name the same mall (E14 5NY Jubilee Place, E14 4QT Cabot Place, E14 5AR Crossrail Place ...)
const PC_MALL = (() => {
  const c = {};
  for (const e of cwg) { const pc = normPc(e.postcode), m = canonMall(((e.address_lines || []).join(' ').match(MALLS) || [])[1]); if (pc && m) ((c[pc] ||= {})[m] = (c[pc][m] || 0) + 1); }
  const out = {};
  for (const [pc, ms] of Object.entries(c)) { const n = Object.values(ms).reduce((a, b) => a + b, 0); const [m, k] = Object.entries(ms).sort((a, b) => b[1] - a[1])[0]; if (n >= 4 && k / n >= 0.85) out[pc] = m; }
  return out;
})();

const B = [];   // merged branches
const pos = b => (b.lat != null ? [b.lon, b.lat] : null);
function place(b, cand) {   // is cand (lonlat, postcode, mall) the same place as branch b?
  // two named malls decide it (Canada Place and the One Canada Square mall are one connected level; CWG uses both names)
  const CANADA = /^(Canada Place|One Canada Square)$/;
  if (cand.mall && b.mall && MALL_POS[cand.mall] && MALL_POS[b.mall]) return cand.mall === b.mall ? 2 : CANADA.test(cand.mall) && CANADA.test(b.mall) ? 3 : null;
  const p = pos(b);
  if (p && cand.lonlat) { const d = dist(p, cand.lonlat); if (d <= (cand.radius || (cand.approx || b.approx ? 160 : 120))) return d; }
  if (cand.postcode && b.postcode && cand.postcode === b.postcode) return 1;
  if (cand.mall && b.mall && cand.mall.toLowerCase() === b.mall.toLowerCase()) return 2;
  return null;
}
// a brand and its Wikidata parent organisation join as one family (FSA "Tesco" = OSM "Tesco Express")
const parents = q => wdBrands[q]?.parents || [];
const sameFam = (a, b) => a === b || parents(a).includes(b) || parents(b).includes(a);
function attach(key, cand, preferUnclaimed) {
  const same = B.filter(b => sameFam(b.key, key)).map(b => ({ b, d: place(b, cand) })).filter(x => x.d != null);
  if (!same.length) return null;
  same.sort((x, y) => (preferUnclaimed && preferUnclaimed(x.b) ? 0 : 1) - (preferUnclaimed && preferUnclaimed(y.b) ? 0 : 1) || x.d - y.d);
  return same[0].b;
}

// 1. OSM
for (const o of osm) {
  const a = o.addr, pcs = osmList(a.postcode).map(normPc).filter(Boolean);   // ';' lists: first postcode is the branch's, all are kept (F2)
  let mall = canonMall((`${a.place || ''} ${a.street || ''} ${o.name || ''}`.match(MALLS) || [])[1]), mall_from = mall ? 'osm-address' : null;
  if (!mall && (mall = pcs.map(p => PC_MALL[p]).find(Boolean) || null)) mall_from = 'postcode';
  B.push({
    key: brandKey(o.brand_wikidata, o.nsi_id, o.brand), brand: o.brand, nsi_id: o.nsi_id, brand_wikidata: o.brand_wikidata,
    name: o.name, kv: o.kv, category: category(o.kv), sources: ['osm'], osm_id: o.osm_id, osm_rule: o.rule, osm_fhrs: o.fhrs_id,
    fhrs_ids: [], address: [unitLabel(a.unit), a.housename, [a.housenumber, a.street].filter(Boolean).join(' '), a.place].filter(Boolean).join(', ') || null,
    postcode: pcs[0] || null, ...(pcs.length > 1 ? { postcodes: pcs } : {}), mall, mall_from, level: o.level, lat: o.lat, lon: o.lon, website: o.website, notes: [],
  });
}
// 2. FSA
for (const f of fsa) {
  const key = brandKey(f.brand_wikidata, f.nsi_id, f.brand);
  const pc = normPc(f.postcode_fsa || f.postcode);
  const lonlat = f.lat != null ? [f.lon, f.lat] : pcPos.get(pc) || null;
  const fmall = canonMall((f.address || '').match(MALLS)?.[1]) || PC_MALL[pc] || null;
  const cand = { lonlat, postcode: pc, approx: f.lat == null, mall: fmall };
  // an OSM feature that carries this premises' fhrs:id is the same branch, whatever the names say
  let b = B.find(x => x.osm_fhrs === f.fhrs_id) || attach(key, cand, x => !x.fhrs_ids.length);
  if (b && b.osm_fhrs === f.fhrs_id) b.notes.push(`FSA ${f.fhrs_id} joined by the OSM fhrs:id tag`);
  const note = f.review?.reason && f.review.reason !== 'undecided' ? `FSA match: ${f.review.reason}` : null;
  if (!b) {
    b = { key, brand: f.brand, nsi_id: f.nsi_id, brand_wikidata: f.brand_wikidata, name: f.fsa_name, kv: f.nsi_kv, category: category(f.nsi_kv), sources: [], fhrs_ids: [],
      address: f.address || null, postcode: pc, mall: fmall, mall_from: fmall ? 'fsa' : null, level: null,
      lat: lonlat?.[1] ?? null, lon: lonlat?.[0] ?? null, approx: f.lat == null, notes: [] };
    if (f.lat == null) b.notes.push('position is the ONSPD postcode centroid');
    B.push(b);
  }
  if (!b.sources.includes('fsa')) b.sources.push('fsa');
  b.fhrs_ids.push(f.fhrs_id); (b.fsa ||= []).push({ fhrs_id: f.fhrs_id, name: f.fsa_name, type: f.fsa_type, rule: f.rule, url: f.fsa_url });
  if (!b.postcode && pc) b.postcode = pc;
  if (!b.address && f.address) b.address = f.address;
  if (note && !b.notes.includes(note)) b.notes.push(note);
}
// 3a. Wikidata items near One Canada Square that name a brand as operator/owner/brand
for (const w of wdNear) {
  const [lon, lat] = (w.coord.match(/POINT\(([-\d.]+) ([-\d.]+)\)/) || []).slice(1).map(Number);
  if (!inBox(lon, lat)) continue;
  for (const l of w.nsi_brand_links) {
    const nb = byWd.get(l.t);
    let b = attach(l.t, { lonlat: [lon, lat], radius: 300 }) || null;   // Wikidata coordinates are often a building's, not a unit's
    if (!b) {
      b = { key: l.t, brand: nb.name, nsi_id: nb.id, brand_wikidata: l.t, name: w.label, kv: nb.kv, category: category(nb.kv), sources: [], fhrs_ids: [], address: null, postcode: null, mall: null, level: null, lat, lon, notes: [] };
      B.push(b);
    }
    if (!b.sources.includes('wikidata')) b.sources.push('wikidata');
    b.wikidata_item = w.qid; b.notes.push(`Wikidata ${w.qid} (${w.label}) ${l.p} = ${l.t}`);
    const brandWord = nb.name.toLowerCase().split(/\s+/)[0];
    if (b.sources.length === 1 && !(w.label || '').toLowerCase().includes(brandWord)) b.notes.push('low confidence: the item name does not carry the brand; the Wikidata claim may be historic');
  }
}
// 3. CWG directory
const CWG_TYPE = { restaurant: /^(amenity=(restaurant|cafe|fast_food|bar|pub|ice_cream)|shop=(bakery|pastry|tea|coffee|confectionery|chocolate|deli|alcohol|wine))$/, shop: /^(shop=.*|amenity=(bank|pharmacy|post_office|bureau_de_change|dentist|clinic|doctors|childcare|kindergarten|car_rental|bookmaker)|office=.*|healthcare=.*|leisure=fitness_centre)$/, stay: /^tourism=/, 'see-do': /^(leisure=.*|amenity=(cinema|theatre|bar|restaurant)|tourism=.*)$/ };
const cwgMatches = [], cwgUnmatched = [], cwgByName = [];
// a CWG entry that is a second listing of the same outlet (e.g. a bar inside a restaurant) joins that outlet
for (const c of cwg) {
  const title = c.title || c.slug.replace(/-/g, ' ');
  const key0 = `${c.slug}`;
  let m = matchAny(title, CWG_TYPE[c.kind]);
  const dec = CWG_DECIDE[key0];
  if (dec && dec.keep === false) { cwgUnmatched.push({ slug: c.slug, title, kind: c.kind, why: dec.reason }); continue; }
  if (dec && dec.nsi_id) m = { brand: byId.get(dec.nsi_id), variant: { rule: 'decided' }, match: 'decided', typeOk: true };
  if (!m) {
    // not an NSI name: does the title carry the brand or the name of a branch already found (OSM brand=* outside
    // NSI, e.g. Watches of Switzerland; a pub's own name, e.g. The Henry Addington)? Whole words, >= 5 letters.
    const t = ` ${title.toLowerCase()} `;
    const hitsB = B.filter(b => [b.brand, b.name].some(n => n && n.length >= 5 && t.includes(` ${n.toLowerCase()} `)));
    const keys = [...new Set(hitsB.map(b => b.key))];
    if (keys.length === 1 && !dec) { cwgByName.push({ c, b0: hitsB[0] }); continue; }
    cwgUnmatched.push({ slug: c.slug, title, kind: c.kind, categories: c.categories }); continue;
  }
  const needs = m.variant.rule === 'prefix' || m.match === 'alternate' || m.typeOk === false;
  if (needs && !dec) { cwgUnmatched.push({ slug: c.slug, title, kind: c.kind, undecided: `${m.brand.id} via ${m.variant.rule}:${m.match} '${m.variant.n}'` }); continue; }
  cwgMatches.push({ c, m });
}
for (const { c, m } of cwgMatches) {
  const key = brandKey(m.brand.wd, m.brand.id, m.brand.name);
  const pc = normPc(c.postcode);
  // CWG's titles name the mall ("Pret a Manger – Cabot Place") more reliably than its address postcodes
  const cmall = canonMall(((c.title || '').match(MALLS) || [])[1] || ((c.address_lines || []).join(' ').match(MALLS) || [])[1]);
  const lonlat = (cmall && MALL_POS[cmall]) || pcPos.get(pc) || null;
  let b = attach(key, { lonlat, postcode: cmall ? null : pc, mall: cmall, approx: true }, x => !x.cwg_url);
  if (!b) {
    // the branch's own website names the CWG entry's place word ("third-space-wood-wharf" -> .../clubs/wood-wharf/)
    const rest = c.slug.split('-').filter(w => !m.brand.name.toLowerCase().includes(w)).join('-');
    if (rest.length >= 4) b = B.find(x => sameFam(x.key, key) && !x.cwg_url && (x.website || '').toLowerCase().includes(rest)) || null;
    if (b) b.notes.push(`CWG entry joined because the branch website names '${rest}'`);
  }
  if (!b) {
    // one branch of this brand in the box and the CWG entry gives no conflicting place: same branch
    const same = B.filter(x => sameFam(x.key, key) && !x.cwg_url);
    if (same.length === 1 && !(pc && same[0].postcode && pc !== same[0].postcode)) { b = same[0]; b.notes.push('CWG entry joined as the only branch of this brand in the box'); }
  }
  if (!b) {
    b = { key, brand: m.brand.name, nsi_id: m.brand.id, brand_wikidata: m.brand.wd, name: c.title, kv: m.brand.kv, category: category(m.brand.kv), sources: [], fhrs_ids: [],
      address: null, postcode: pc, mall: cmall || c.mall, level: null, lat: lonlat?.[1] ?? null, lon: lonlat?.[0] ?? null, approx: true,
      notes: lonlat ? [cmall && MALL_POS[cmall] ? `position is the centre of ${cmall}` : 'position is the ONSPD postcode centroid'] : [] };
    B.push(b);
  }
  if (b.cwg_url) { b.notes.push(`also listed by CWG as ${c.cwg_url}`); continue; }
  b.sources.push('cwg'); b.cwg_url = c.cwg_url; b.cwg_archived = c.archived || null;
  if (cmall && b.mall && cmall !== b.mall) b.notes.push(`CWG says ${cmall}; ${b.mall_from || 'other source'} says ${b.mall}`);
  if (cmall) { b.mall = cmall; b.mall_from = 'cwg'; } if (c.level) b.level_cwg = c.level;
  if (c.address_lines?.length) b.address_cwg = c.address_lines.join(', ');
  if (c.website) b.cwg_website = c.website;
  if (!b.postcode && pc) b.postcode = pc;
}
for (const { c, b0 } of cwgByName) {
  const cmall = canonMall(((c.title || '').match(MALLS) || [])[1] || ((c.address_lines || []).join(' ').match(MALLS) || [])[1]);
  const pc = normPc(c.postcode);
  const same = B.filter(x => x.key === b0.key && !x.cwg_url);
  const b = same.find(x => place(x, { lonlat: (cmall && MALL_POS[cmall]) || pcPos.get(pc) || null, postcode: cmall ? null : pc, mall: cmall, approx: true }) != null) || (same.length === 1 ? same[0] : null);
  if (!b) { cwgUnmatched.push({ slug: c.slug, title: c.title, kind: c.kind, note: `names ${b0.brand} but no single branch to join` }); continue; }
  b.sources.push('cwg'); b.cwg_url = c.cwg_url; b.cwg_archived = c.archived || null;
  if (cmall) { b.mall = cmall; b.mall_from = 'cwg'; } if (c.level) b.level_cwg = c.level;
  if (c.address_lines?.length) b.address_cwg = c.address_lines.join(', ');
  if (!b.postcode && pc) b.postcode = pc;
  b.notes.push(`CWG entry '${c.title}' joined by name (not an NSI name)`);
}
// 5. brand store pages (step 3c)
for (const s of store) {
  const b = s.branch_ref ? B.find(x => x.osm_id === s.branch_ref || x.cwg_url === s.branch_ref || x.fhrs_ids.includes(+s.branch_ref)) : null;
  if (!b) continue;
  if (s.note && !b.notes.includes(s.note)) b.notes.push(s.note);
  if (!s.store_url) continue;
  // the URL is kept whatever the check found; only a verified page counts as a source
  b.store_url = s.final_url || s.store_url; b.store_url_status = s.result;
  if (s.ok && !b.sources.includes('storelocator')) b.sources.push('storelocator');
}
// confidence
for (const b of B) {
  const n = b.sources.filter(s => s !== 'storelocator').length + (b.sources.includes('storelocator') ? 1 : 0);
  const weak = (b.fsa || []).some(f => /prefix|alternate/.test(f.rule)) && b.sources.length === 1 || b.notes.some(n => /mobile|low confidence|staff or client catering/.test(n));
  b.confidence = n >= 2 ? 'high' : weak ? 'low' : 'medium';
  if (b.sources.length === 1 && b.sources[0] === 'osm' && /brand:wikidata/.test(b.osm_rule)) b.confidence = 'medium';
}
const KEEP = ['brand', 'nsi_id', 'brand_wikidata', 'name', 'category', 'kv', 'sources', 'osm_id', 'fhrs_id', 'fhrs_ids', 'cwg_url', 'store_url', 'address', 'address_cwg', 'postcode', 'mall', 'mall_from', 'level', 'level_cwg', 'lat', 'lon', 'position', 'confidence', 'notes', 'website', 'cwg_website', 'wikidata_item', 'fsa', 'cwg_archived', 'store_url_status', 'osm_rule'];
const out = B.map(b => {
  b.fhrs_id = b.fhrs_ids[0] ?? null; b.position = b.lat == null ? null : b.osm_id ? 'osm' : b.approx ? 'postcode-centroid' : b.sources.includes('fsa') ? 'fsa-geocode' : 'wikidata';
  if (b.lat != null) { b.lat = Math.round(b.lat * 1e6) / 1e6; b.lon = Math.round(b.lon * 1e6) / 1e6; }
  const o = {}; for (const k of KEEP) if (b[k] != null && !(Array.isArray(b[k]) && !b[k].length)) o[k] = b[k]; return o;
}).sort((a, b) => a.brand.localeCompare(b.brand) || (a.mall || '').localeCompare(b.mall || ''));
const brandsPresent = new Set(out.map(b => b.brand_wikidata || b.nsi_id || b.brand));
const byCat = {}; for (const b of out) byCat[b.category] = (byCat[b.category] || 0) + 1;
const bySrc = {}; for (const b of out) { const k = b.sources.slice().sort().join('+'); bySrc[k] = (bySrc[k] || 0) + 1; }
const meta = {
  generated: new Date().toISOString(), box: [-0.03, 51.498, -0.005, 51.51],
  branches: out.length, brands_present: brandsPresent.size, by_category: byCat, by_sources: bySrc,
  by_confidence: out.reduce((m, b) => (m[b.confidence] = (m[b.confidence] || 0) + 1, m), {}),
  cwg_entries: cwg.length, cwg_matched_to_brand: cwgMatches.length,
};
writeFileSync(join(OUT, 'branches.json'), '{"meta":' + JSON.stringify(meta, null, 1) + ',\n"branches":[\n' + out.map(o => JSON.stringify(o)).join(',\n') + '\n],\n"cwg_not_matched":[\n' + cwgUnmatched.map(o => JSON.stringify(o)).join(',\n') + '\n]}\n');
console.log(meta);
for (const u of cwgUnmatched.filter(u => u.undecided)) console.log('CWG UNDECIDED', JSON.stringify(u.slug), u.title, '->', u.undecided);
