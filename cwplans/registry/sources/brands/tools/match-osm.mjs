#!/usr/bin/env node
// Step 3a: branded OSM features in the box.
//   node magpie/cwplans/registry/sources/brands/tools/match-osm.mjs
// in:  data/raw/registry/osm-box-features.json (osm-scan.mjs), brands-uk.json
// out: data/raw/registry/osm-branches.json
// Rules (see README "Match rules"): a business feature (shop/amenity/office/tourism/leisure/healthcare/craft)
// is a branch when (1) its brand:wikidata is an NSI UK brand QID, or (2) the NSI Matcher matches its
// name/brand under its own key=value at the feature's position, or (3) it has brand=* / brand:wikidata=* that NSI
// does not list (kept, nsi_id null). Street furniture is set aside, not counted as a branch.
import { writeFileSync } from 'fs';
import { join } from 'path';
import { RAW, readJSON } from './lib.mjs';
import { hits, byId, byWd } from './nsi-matcher.mjs';

const KEYS = ['shop', 'amenity', 'office', 'tourism', 'leisure', 'healthcare', 'craft'];
// not branches: kerbside or wall-mounted kit operated by a brand
const FURNITURE = /^amenity=(post_box|bicycle_rental|parcel_locker|atm|vending_machine|charging_station|photo_booth|telephone|bench|waste_basket|recycling|parking|parking_entrance|bicycle_parking|drinking_water|ticket_validator|public_bookcase|clock|letter_box|post_depot|motorcycle_parking|taxi|bus_station|ferry_terminal|toilets|shelter|fountain|car_sharing|kick-scooter_rental|device_charging_station|water_point)$|^tourism=(information|artwork|attraction|viewpoint)$|^leisure=(park|garden|playground|pitch|picnic_table|outdoor_seating|common|marina|slipway|track|dog_park|fitness_station|swimming_area|bandstand|nature_reserve)$|^office=(parcel_locker)$/;
const feats = readJSON(join(RAW, 'osm-box-features.json')).features;
const out = [], furniture = {}, unmatchedNamed = [];
for (const f of feats) {
  const t = f.tags;
  const kvs = KEYS.filter(k => t[k]).map(k => [k, t[k]]);
  if (!kvs.length) continue;
  if (t['disused:shop'] || t['disused:amenity'] || t.opening_hours === 'closed') continue;
  const wd = t['brand:wikidata'];
  let hit = null, rule = null;
  if (wd && byWd.has(wd)) {
    // prefer the NSI item for this QID whose key=value agrees with the feature
    const exact = [...byId.values()].find(b => b.wd === wd && kvs.some(([k, v]) => b.kv === `${k}=${v}`));
    hit = exact || byWd.get(wd); rule = 'brand:wikidata';
  }
  if (!hit) for (const [k, v] of kvs) for (const n of [t.name, t.brand, t['name:en'], t.official_name].filter(Boolean)) {
    const h = hits(k, v, n, [f.lon, f.lat]).find(h => h.match === 'primary') || hits(k, v, n, [f.lon, f.lat])[0];
    if (h && !hit) { hit = byId.get(h.itemID); rule = `nsi-${h.match}:${k}=${v}:${n === t.name ? 'name' : n === t.brand ? 'brand' : 'other-name'}`; }
  }
  if (!hit && !(t.brand || wd)) { if (t.name) unmatchedNamed.push(f); continue; }
  const kvStr = kvs.map(([k, v]) => `${k}=${v}`).join(';');
  const brandName = hit?.name || t.brand || t.name;
  if (kvs.every(([k, v]) => FURNITURE.test(`${k}=${v}`))) { furniture[`${brandName} (${kvStr})`] = (furniture[`${brandName} (${kvStr})`] || 0) + 1; continue; }
  const addr = Object.fromEntries(Object.entries(t).filter(([k]) => k.startsWith('addr:')).map(([k, v]) => [k.slice(5), v]));
  out.push({
    osm_id: f.osm_id, name: t.name || null, brand: brandName, brand_tag: t.brand || null,
    brand_wikidata: wd || hit?.wd || null, brand_wikidata_from: wd ? 'osm' : hit?.wd ? 'nsi' : null,
    nsi_id: hit?.id || null, nsi_kv: hit?.kv || null, kv: kvStr, rule: rule || (wd ? 'brand:wikidata-not-in-nsi-uk' : 'brand-tag-not-in-nsi-uk'),
    qid_conflict: !!(wd && hit?.wd && wd !== hit.wd),
    fhrs_id: t['fhrs:id'] ? +t['fhrs:id'] : null, addr, level: t.level ?? null, level_ref: t['level:ref'] ?? null, website: t.website || t['contact:website'] || null,
    lat: f.lat, lon: f.lon,
  });
}
writeFileSync(join(RAW, 'osm-branches.json'), JSON.stringify({ generated: new Date().toISOString(), branches: out, furniture, unmatched_named_business: unmatchedNamed.map(f => ({ osm_id: f.osm_id, name: f.tags.name, kv: KEYS.filter(k => f.tags[k]).map(k => `${k}=${f.tags[k]}`).join(';') })) }, null, 1));
console.log(`${out.length} branches; furniture ${Object.values(furniture).reduce((a, b) => a + b, 0)}; unmatched named businesses ${unmatchedNamed.length}`);
const c = {}; for (const b of out) c[b.brand] = (c[b.brand] || 0) + 1;
console.log(Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(', '));
console.log('rules', out.reduce((m, b) => (m[b.rule.split(':')[0]] = (m[b.rule.split(':')[0]] || 0) + 1, m), {}));
console.log('furniture', furniture);
