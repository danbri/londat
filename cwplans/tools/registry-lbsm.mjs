// GLA London Building Stock Model 2 (LBSM2, OGL v3): homes in the Canary Wharf postcodes and box, aggregated per postcode
// and per building (MasterMap TOID). Run: node cwplans/tools/registry-lbsm.mjs
// Needs cwplans/data/raw/registry/lbsm/LBSMv2_Tower_Hamlets.csv from https://data.london.gov.uk/dataset/2k55d
// Writes registry/sources/uprn/lbsm2-homes-summary.json.
// AGGREGATES ONLY. LBSM2 holds one row per home, including modelled tenure, fuel poverty and deprivation fields.
// Those describe households, so this tool never reads them out, and it writes no per-home rows.
import { createReadStream, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createInterface } from 'readline';
import { join } from 'path';
import { OUT, RAWREG, cwPostcodes, normPc, splitCsv } from './registry-lib.mjs';

const src = join(RAWREG, 'lbsm', 'LBSMv2_Tower_Hamlets.csv');
const pcs = cwPostcodes();
const meta = Object.fromEntries(pcs.map(p => [p.pc, p]));
const boxUprns = new Set(readFileSync(join(OUT, 'uprn', 'uprn-canary-wharf.csv'), 'utf8').split('\n').slice(1).map(l => l.split(',')[0]).filter(Boolean));

const KEEP = ['property_type', 'built_form', 'construction_age_band', 'construction_age_band_known', 'epc_rating', 'epc_rating_known', 'total_floor_area', 'estimated_floor_count', 'building_use'];
let head = null, rows = 0, kept = 0;
const byPc = {}, byToid = {};
const add = (o, k, v) => { if (v != null && v !== '' && v !== 'NA') o[k] = (o[k] || 0) + 1; };
const bucket = () => ({ homes: 0, property_type: {}, built_form: {}, construction_age_band: {}, epc_rating: {}, epc_from_certificate: 0, floor_area: [], max_floor_count: 0, postcodes: {} });
for await (const l of createInterface({ input: createReadStream(src), crlfDelay: Infinity })) {
  const f = splitCsv(l);
  if (!head) { head = Object.fromEntries(f.map((h, i) => [h, i])); continue; }
  rows++;
  const uprn = f[head.uprn], pc = normPc(f[head.postcode_locator]);
  const inPc = pc && meta[pc];
  if (!inPc && !boxUprns.has(uprn)) continue;
  kept++;
  const g = Object.fromEntries(KEEP.map(k => [k, f[head[k]]]));
  const toid = f[head.os_topo_toid] ? 'osgb' + f[head.os_topo_toid] : null;
  for (const [key, map] of [[pc, byPc], [toid, byToid]]) {
    if (!key) continue;
    const b = (map[key] ||= bucket());
    b.homes++;
    add(b.property_type, g.property_type, g.property_type);
    add(b.built_form, g.built_form, g.built_form);
    add(b.construction_age_band, g.construction_age_band, g.construction_age_band);
    add(b.epc_rating, g.epc_rating, g.epc_rating);
    if (g.epc_rating_known === '1') b.epc_from_certificate++;
    if (+g.total_floor_area > 0) b.floor_area.push(+g.total_floor_area);
    if (+g.estimated_floor_count > b.max_floor_count) b.max_floor_count = +g.estimated_floor_count;
    if (map === byToid && pc) b.postcodes[pc] = (b.postcodes[pc] || 0) + 1;
  }
}
const fin = b => {
  const a = b.floor_area.sort((x, y) => x - y);
  const out = { ...b, median_floor_area_m2: a.length ? a[Math.floor(a.length / 2)] : null };
  delete out.floor_area;
  if (!Object.keys(out.postcodes).length) delete out.postcodes;
  return out;
};
const per_postcode = Object.fromEntries(Object.entries(byPc).sort().map(([k, b]) => [k, { tier: meta[k]?.tier ?? 'outside-cw-list (UPRN in box)', ...fin(b) }]));
const per_toid = Object.fromEntries(Object.entries(byToid).sort((a, b) => b[1].homes - a[1].homes).map(([k, b]) => [k, fin(b)]));
mkdirSync(join(OUT, 'uprn'), { recursive: true });
writeFileSync(join(OUT, 'uprn', 'lbsm2-homes-summary.json'), JSON.stringify({
  source: 'GLA London Building Stock Model 2 (LBSM2), Tower Hamlets file, https://data.london.gov.uk/dataset/2k55d',
  licence: 'Open Government Licence v3.0 (London Datastore)', fetched: new Date().toISOString().slice(0, 10),
  rows_tower_hamlets: rows, homes_matched: kept, match: 'postcode_locator in the Canary Wharf postcode list, or UPRN in uprn-canary-wharf.csv',
  caveat: 'Homes only (domestic stock). Values without an EPC are modelled by machine learning; epc_from_certificate counts the homes whose rating comes from a lodged certificate. Household fields (tenure, fuel poverty, deprivation) are deliberately left out.',
  postcodes: Object.keys(per_postcode).length, toids: Object.keys(per_toid).length,
  per_postcode, per_toid,
}, null, 1));
console.log(`LBSM2 Tower Hamlets rows ${rows}; matched homes ${kept}; postcodes ${Object.keys(per_postcode).length}; TOIDs ${Object.keys(per_toid).length}`);
