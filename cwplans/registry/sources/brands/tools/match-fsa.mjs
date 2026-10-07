#!/usr/bin/env node
// Step 3b: FSA food premises in Canary Wharf postcodes whose name matches an NSI UK brand.
//   node magpie/cwplans/registry/sources/brands/tools/match-fsa.mjs [--fetch]
// in:  postcodes/postcodes.json (tiers), postcodes/queries.json (results[pc].fsa.items), brands-uk.json, tools/fsa-decisions.json
// Every input and output, with endpoints and rules: magpie/cwplans/pipeline.json, activity "match-fsa".
// out: data/raw/registry/fsa-branches.json; with --fetch, each matched premises' address and
//      geocode from https://api.ratings.food.gov.uk/Establishments/{fhrs_id} (cached in data/raw/registry/fsa-detail/)
// Rule: NSI Matcher over every brand key=value, name variants from nameVariants(); a hit must be
// 'primary' or 'alternate'. 'prefix' hits and brands listed in REVIEW are kept only if confirmed below.
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CW, RAW, UA, readJSON, sleep } from './lib.mjs';
import { hits, byId, KVS, nameVariants } from './nsi-matcher.mjs';

const TIERS = new Set(['cw-core', 'cw-ward', 'cw-box-other-ward']);
// FSA business type -> the OSM key=values a branch of that type would carry (a hit outside these is flagged)
const TYPE_KV = {
  'Restaurant/Cafe/Canteen': /^(amenity=(restaurant|cafe|fast_food|bar|pub|ice_cream|food_court)|shop=(bakery|tea|coffee|pastry|confectionery|chocolate|deli))$/,
  'Takeaway/sandwich shop': /^(amenity=(fast_food|cafe|restaurant|ice_cream)|shop=(bakery|pastry|deli|tea|coffee))$/,
  'Pub/bar/nightclub': /^amenity=(pub|bar|restaurant|nightclub|biergarten)$/,
  'Retailers - supermarkets/hypermarkets': /^shop=(supermarket|convenience|department_store|variety_store)$/,
  'Retailers - other': /^(shop=.*|amenity=(pharmacy|cafe|fast_food|vending_machine))$/,
  'Hotel/bed & breakfast/guest house': /^tourism=(hotel|apartment|hostel|guest_house)$/,
  'Caring Premises': /^(amenity=(childcare|kindergarten|social_facility|nursing_home)|healthcare=.*)$/,
  'School/college/university': /^amenity=(school|college|kindergarten|childcare|university)$/,
};
// Decisions on matches that need a person's judgement (FSA name -> keep:true/false, reason). Filled after review.
const DECIDE = JSON.parse(readFileSync(new URL('./fsa-decisions.json', import.meta.url), 'utf8'));

const pcs = readJSON(join(CW, 'postcodes/postcodes.json')).postcodes.filter(p => TIERS.has(p.tier));
const q = readJSON(join(CW, 'postcodes/queries.json')).results;
const out = [], review = [];
let premises = 0;
for (const p of pcs) for (const it of q[p.pc]?.fsa?.items || []) {
  premises++;
  let best = null;
  for (const v of nameVariants(it.name)) {
    const found = new Map();
    for (const kv of KVS) { const [k, val] = kv.split('='); for (const h of hits(k, val, v.n)) if (!found.has(h.itemID)) found.set(h.itemID, h); }
    if (!found.size) continue;
    const hs = [...found.values()].map(h => ({ ...h, brand: byId.get(h.itemID) }));
    const typeRe = TYPE_KV[it.type];
    hs.sort((a, b) => (a.match === 'primary' ? 0 : 1) - (b.match === 'primary' ? 0 : 1) || (typeRe && typeRe.test(b.brand.kv) ? 1 : 0) - (typeRe && typeRe.test(a.brand.kv) ? 1 : 0) || (a.brand.scope === 'uk' ? -1 : 1));
    best = { variant: v, hit: hs[0], others: hs.slice(1).map(h => h.brand.id), typeOk: typeRe ? typeRe.test(hs[0].brand.kv) : null };
    break;
  }
  if (!best) continue;
  const b = best.hit.brand;
  const rec = {
    fhrs_id: it.fhrs_id, fsa_name: it.name, fsa_type: it.type, postcode: p.pc, tier: p.tier, rating: it.rating, fsa_url: it.url,
    brand: b.name, nsi_id: b.id, nsi_kv: b.kv, brand_wikidata: b.wd, scope: b.scope,
    rule: `${best.variant.rule}:${best.hit.match}`, matched_text: best.variant.n, type_agrees: best.typeOk, alt_nsi_ids: best.others,
  };
  const key = `${it.name}|${b.id}`;
  const needs = best.variant.rule === 'prefix' || best.typeOk !== true || best.hit.match === 'alternate';
  if (key in DECIDE) { rec.review = DECIDE[key]; if (!DECIDE[key].keep) { review.push(rec); continue; } }
  else if (needs) { rec.review = { keep: null, reason: 'undecided' }; review.push(rec); continue; }
  out.push(rec);
}

if (process.argv.includes('--fetch')) {
  const dir = join(RAW, 'fsa-detail'); mkdirSync(dir, { recursive: true });
  for (const r of out) {
    const f = join(dir, `${r.fhrs_id}.json`);
    if (!existsSync(f)) {
      const res = await fetch(`https://api.ratings.food.gov.uk/Establishments/${r.fhrs_id}`, { headers: { 'x-api-version': '2', accept: 'application/json', 'user-agent': UA } });
      if (!res.ok) { console.warn('FSA', r.fhrs_id, res.status); continue; }
      writeFileSync(f, await res.text()); await sleep(600);
    }
  }
}
for (const r of out) {
  const f = join(RAW, 'fsa-detail', `${r.fhrs_id}.json`);
  if (!existsSync(f)) continue;
  const d = readJSON(f);
  r.address = [d.AddressLine1, d.AddressLine2, d.AddressLine3, d.AddressLine4].filter(Boolean).join(', ');
  if (d.PostCode) r.postcode_fsa = d.PostCode;
  const g = d.geocode || {}; if (g.latitude && +g.latitude) { r.lat = +g.latitude; r.lon = +g.longitude; }
}
writeFileSync(join(RAW, 'fsa-branches.json'), JSON.stringify({ generated: new Date().toISOString(), premises_scanned: premises, postcodes: pcs.length, branches: out, rejected_or_undecided: review }, null, 1));
console.log(`${premises} premises in ${pcs.length} CW postcodes; ${out.length} brand matches kept; ${review.filter(r => r.review.keep === false).length} rejected; ${review.filter(r => r.review.keep === null).length} undecided`);
for (const r of review.filter(r => r.review.keep === null)) console.log('UNDECIDED', JSON.stringify(`${r.fsa_name}|${r.nsi_id}`), r.fsa_type, '->', r.brand, r.nsi_kv, r.rule, r.matched_text);
for (const r of out) console.log('KEEP', r.fsa_name, '->', r.brand, r.nsi_kv, r.rule, r.type_agrees);
