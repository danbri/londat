// VOA non-domestic rating list (business rates), 2026 list, filtered to the Canary Wharf postcodes.
// Run: node magpie/cwplans/tools/registry-voa.mjs [path/to/list-entries.zip]
//   (default: magpie/cwplans/data/raw/registry/voa/ndr-2026-listentries-*.zip, from
//    https://voaratinglists.blob.core.windows.net/html/rlidata.htm — free, no login, but a RESTRICTED licence, not OGL)
// Writes:
//   data/raw/registry/voa/voa-ndr-2026-canary-wharf.json        per-property extract (NOT committed: restricted licence)
//   registry/sources/companies/voa-ndr-2026-summary.json         per-postcode aggregates only
// The firm's-name field is never read into the output (it can hold a sole trader's name).
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { OUT, RAWREG, cwPostcodes, normPc } from './registry-lib.mjs';

const vdir = join(RAWREG, 'voa');
const zip = process.argv[2] || join(vdir, readdirSync(vdir).filter(f => /^ndr-2026-listentries-.*\.zip$/.test(f)).sort().at(-1));
const pcs = cwPostcodes();
const meta = Object.fromEntries(pcs.map(p => [p.pc, p]));
const want = new Set(pcs.map(p => p.pc));

const child = spawn('unzip', ['-p', zip, '*-baseline-csv.csv'], { stdio: ['ignore', 'pipe', 'inherit'] });
const byPc = {}; let rows = 0;
for await (const l of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
  rows++;
  const f = l.split('*');
  const pc = normPc(f[14]);
  if (!pc || !want.has(pc)) continue;
  (byPc[pc] ||= []).push({
    uarn: f[6], ba_ref: f[3], description_code: f[4], description: f[5],
    number_or_name: f[9] || null, street: f[10] || null, sub_street: [f[22], f[23], f[24]].filter(Boolean),
    rateable_value: f[17] ? Number(f[17]) : null, scat: f[21] || null,
    effective_date: f[15] || null, current_from: f[26] || null, current_to: f[27] || null,
  });
}
const fetched = new Date().toISOString().slice(0, 10);
const all = Object.values(byPc).flat();
const licence = 'VOA Rating List Downloads: restricted licence (not OGL), https://www.tax.service.gov.uk/view-my-valuation/terms-and-conditions. Anyone this is passed to must be told those terms apply.';
writeFileSync(join(vdir, 'voa-ndr-2026-canary-wharf.json'), JSON.stringify({ source: basename(zip), licence, fetched, entries: all.length, postcodes: byPc }, null, 0));

const per = {};
for (const [pc, l] of Object.entries(byPc).sort()) {
  const rv = l.map(x => x.rateable_value || 0);
  const desc = l.reduce((o, x) => (o[x.description] = (o[x.description] || 0) + 1, o), {});
  per[pc] = {
    tier: meta[pc]?.tier, status: meta[pc]?.status, entries: l.length, total_rv: rv.reduce((a, b) => a + b, 0), max_rv: Math.max(...rv),
    streets: [...new Set(l.map(x => x.street).filter(Boolean))],
    descriptions: Object.fromEntries(Object.entries(desc).sort((a, b) => b[1] - a[1]).slice(0, 6)),
  };
}
const descAll = all.reduce((o, x) => (o[x.description] = (o[x.description] || 0) + 1, o), {});
mkdirSync(join(OUT, 'companies'), { recursive: true });
writeFileSync(join(OUT, 'companies', 'voa-ndr-2026-summary.json'), JSON.stringify({
  source: `VOA non-domestic rating list 2026, ${basename(zip)}, https://voaratinglists.blob.core.windows.net/html/rlidata.htm`,
  licence, fetched, list_rows_england_wales: rows, entries_cw: all.length, postcodes_with_entries: Object.keys(per).length,
  total_rateable_value_cw: all.reduce((a, x) => a + (x.rateable_value || 0), 0),
  descriptions: Object.fromEntries(Object.entries(descAll).sort((a, b) => b[1] - a[1]).slice(0, 30)),
  top_postcodes_by_rv: Object.entries(per).sort((a, b) => b[1].total_rv - a[1].total_rv).slice(0, 25).map(([pc, s]) => ({ pc, entries: s.entries, total_rv: s.total_rv, streets: s.streets })),
  note: 'Aggregates only. The per-property extract (address, description, rateable value, no firm names) stays in data/raw/registry/voa/ because of the restricted licence.',
  per_postcode: per,
}, null, 1));
console.log(`list rows ${rows}; CW entries ${all.length} in ${Object.keys(per).length} postcodes`);
