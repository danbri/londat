#!/usr/bin/env node
// Print the Markdown tables for README.md from branches.json (paste between the TABLE markers).
//   node magpie/cwplans/registry/sources/brands/tools/readme-tables.mjs > /tmp/tables.md
import { join } from 'path';
import { OUT, readJSON } from './lib.mjs';
const { meta, branches, cwg_not_matched } = readJSON(join(OUT, 'branches.json'));
const esc = s => String(s ?? '').replace(/\|/g, '\\|');
const per = {}; for (const b of branches) (per[b.brand] ||= []).push(b);
const lines = [];
lines.push(`| brand | category | name | where | sources | conf. | links |`, `|---|---|---|---|---|---|---|`);
for (const b of branches) {
  const where = [b.mall, b.level || b.level_cwg, b.postcode].filter(Boolean).map(String).join(', ') || (b.address || '');
  const links = [b.osm_id && `[osm](https://www.openstreetmap.org/${b.osm_id})`, b.fhrs_id && `[fsa](https://ratings.food.gov.uk/business/${b.fhrs_id})`, b.cwg_url && `[cwg](${b.cwg_url})`, b.store_url && `[store](${b.store_url})`].filter(Boolean).join(' ');
  lines.push(`| ${esc(b.brand)} | ${b.category} | ${esc(b.name)} | ${esc(where)} | ${b.sources.join('+')} | ${b.confidence} | ${links} |`);
}
console.log(lines.join('\n'));
console.log('\nTOP');
console.log(Object.entries(per).sort((a, b) => b[1].length - a[1].length).slice(0, 25).map(([k, v]) => `${k} ${v.length}`).join(', '));
console.log('\nCWG NOT MATCHED');
console.log(cwg_not_matched.map(u => `${u.title}${u.why ? ' (' + u.why + ')' : ''}`).join('; '));
