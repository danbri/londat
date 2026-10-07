// Companies House "Basic Company Data" (free bulk product), filtered to the Canary Wharf postcodes.
// Run: node cwplans/tools/registry-companies.mjs [path/to/BasicCompanyDataAsOneFile-YYYY-MM-DD.zip]
//   (default: newest BasicCompanyDataAsOneFile-*.zip in cwplans/data/raw/registry/;
//    download from https://download.companieshouse.gov.uk/en_output.html, about 0.5 GB)
// Writes registry/sources/companies/companies-by-postcode.json and companies-summary.json.
// COMPANY-LEVEL ONLY: this product has no officers or PSCs, and this tool must never fetch them.
// "care of" lines can hold a person's name, so only care-of values that look like an organisation are kept.
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { OUT, RAWREG, cwPostcodes, normPc, splitCsv } from './registry-lib.mjs';

const zip = process.argv[2] || join(RAWREG, readdirSync(RAWREG).filter(f => /^BasicCompanyDataAsOneFile-.*\.zip$/.test(f)).sort().at(-1));
const dir = join(OUT, 'companies');
mkdirSync(dir, { recursive: true });

const pcs = cwPostcodes();
const meta = Object.fromEntries(pcs.map(p => [p.pc, p]));
const want = new Set(pcs.map(p => p.pc));

const ORG = /\b(LTD|LIMITED|LLP|PLC|L\.L\.P|INC|CORP|CORPORATION|COMPANY|CO|GROUP|SERVICES|PARTNERS|PARTNERSHIP|SECRETARIES|SECRETARIAL|NOMINEES|TRUST(EES)?|BANK|FUND|HOLDINGS|ACCOUNTANTS|ACCOUNTANCY|ACCOUNTING|ASSOCIATES|SOLICITORS|LAW|LEGAL|CONSULTING|CONSULTANTS|MANAGEMENT|ADVISORY|INTERNATIONAL|CAPITAL|INVESTMENTS|ESTATES|PROPERTY|MEDIA|BOATS|FOUNDATION|GOVERNANCE|DEPARTMENT|OFFICE|REGUS|IWG|SPACES|WEWORK|PKF|KPMG|DELOITTE|PWC|BDO|BEGBIES|BTG|EQUILEND|ACUMEN|REUTERS|N\.A\.|S\.A\.|GMBH|AG|BV|B\.V\.|LP|SARL|S\.A\.R\.L|AB|AS|SPA|S\.P\.A)\b/;
// A "care of" clause names whoever receives post. When it does not look like an organisation it may be a
// person's name, so it is replaced by "C/O [withheld]". Over-withholding a small firm is the accepted cost.
const CO = /\b(C\/O|C\\O|CARE OF|ATTN:?|FAO:?|F\.A\.O\.?)\s+([^,0-9]*?)(?=\s*(,|\d|\bLEVEL\b|\bFLOOR\b|\bSUITE\b|\bUNIT\b|\bONE\b|\(|\)|$))/gi;
let withheldLines = 0;
const scrubCareOf = a => {
  if (!a) return a;
  // judge on everything up to the next comma, so "C/O CSC CLS (UK) LIMITED" and "C/O 4F FACILITIES LTD" count as firms
  const out = a.replace(CO, (m, tag, who, ...rest) => {
    const [off, str] = rest.slice(-2);
    const clause = str.slice(off + tag.length).split(',')[0].toUpperCase();
    return (!who.trim() || ORG.test(clause)) ? m : (withheldLines++, `${tag} [withheld]`);
  });
  return out;
};
const dmy = s => { const m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

const child = spawn('unzip', ['-p', zip], { stdio: ['ignore', 'pipe', 'inherit'] });
const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
let head = null, pending = '', rows = 0, kept = 0;
const byPc = {}, statusAll = {};
for await (const raw of rl) {
  // a quoted field could in principle span lines: join until the quote count is even
  const line = pending ? pending + '\n' + raw : raw;
  if ((line.match(/"/g) || []).length % 2) { pending = line; continue; }
  pending = '';
  const f = splitCsv(line);
  if (!head) { head = Object.fromEntries(f.map((h, i) => [h.trim(), i])); continue; }
  rows++;
  const g = k => (f[head[k]] ?? '').trim();
  const st = g('CompanyStatus'); statusAll[st] = (statusAll[st] || 0) + 1;
  const pc = normPc(g('RegAddress.PostCode'));
  if (!pc || !want.has(pc)) continue;
  kept++;
  const careOf = g('RegAddress.CareOf');
  const rec = {
    number: g('CompanyNumber'), name: g('CompanyName'), status: st, category: g('CompanyCategory'),
    incorporated: dmy(g('IncorporationDate')), dissolved: dmy(g('DissolutionDate')),
    sic: ['SICCode.SicText_1', 'SICCode.SicText_2', 'SICCode.SicText_3', 'SICCode.SicText_4'].map(g).filter(Boolean),
    address_line1: scrubCareOf(g('RegAddress.AddressLine1')) || null, address_line2: scrubCareOf(g('RegAddress.AddressLine2')) || null,
    accounts: g('Accounts.AccountCategory') || null, country_of_origin: g('CountryOfOrigin') || null,
  };
  if (g('RegAddress.POBox')) rec.po_box = g('RegAddress.POBox');
  if (careOf) { if (ORG.test(careOf.toUpperCase())) rec.care_of = careOf; else rec.care_of_withheld = true; }
  (byPc[pc] ||= []).push(rec);
}
if (pending) console.warn('unterminated quoted field at end of file');

const fetched = new Date().toISOString().slice(0, 10);
const edition = basename(zip).match(/\d{4}-\d{2}-\d{2}/)?.[0];
const sorted = {};
for (const pc of Object.keys(byPc).sort()) sorted[pc] = byPc[pc].sort((a, b) => (a.incorporated || '').localeCompare(b.incorporated || '') || a.number.localeCompare(b.number));
writeFileSync(join(dir, 'companies-by-postcode.json'), JSON.stringify({
  source: `Companies House Basic Company Data, ${basename(zip)} (edition ${edition}), https://download.companieshouse.gov.uk/en_output.html`,
  licence: 'Companies House bulk data is free to reuse (Open Government Licence v3.0 terms apply to Companies House public data).',
  fetched, edition, rows_in_product: rows, companies: kept, postcodes_with_companies: Object.keys(sorted).length,
  company_page: 'https://find-and-update.company-information.service.gov.uk/company/<number>',
  note: 'Registered office address only: a company registered here need not trade here (formation agents, serviced offices, accountants). The product holds live companies only, so dissolved companies are absent and "dissolved" is normally null. care_of is kept only when it looks like an organisation; care_of_withheld marks a withheld value.',
  postcodes: sorted,
}).replace(/\],"/g, '],\n"'));

// ---- summary
const all = Object.values(sorted).flat();
const count = (arr, key) => arr.reduce((o, x) => { for (const k of [].concat(key(x))) if (k != null) o[k] = (o[k] || 0) + 1; return o; }, {});
const sortObj = o => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
const perPc = {};
for (const [pc, list] of Object.entries(sorted)) {
  perPc[pc] = {
    tier: meta[pc]?.tier, status: meta[pc]?.status, companies: list.length,
    incorporated_2025: list.filter(c => c.incorporated?.startsWith('2025')).length,
    incorporated_2026: list.filter(c => c.incorporated?.startsWith('2026')).length,
    dormant: list.filter(c => c.accounts === 'DORMANT').length,
    top_address_line1: Object.entries(count(list, c => c.address_line1)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, n]) => `${a} (${n})`),
    top_sic: Object.entries(count(list, c => c.sic)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, n]) => `${a} (${n})`),
  };
}
const months2026 = count(all.filter(c => c.incorporated?.startsWith('2026')), c => c.incorporated.slice(0, 7));
writeFileSync(join(dir, 'companies-summary.json'), JSON.stringify({
  fetched, edition, rows_in_product: rows, statuses_in_product: statusAll,
  postcodes_considered: pcs.length, postcodes_with_companies: Object.keys(sorted).length, companies: kept,
  by_tier: count(Object.entries(sorted).flatMap(([pc, l]) => l.map(() => meta[pc]?.tier)), x => x),
  status: sortObj(count(all, c => c.status)), category: sortObj(count(all, c => c.category)),
  accounts_category: sortObj(count(all, c => c.accounts)),
  incorporations_per_year: Object.fromEntries(Object.entries(count(all, c => c.incorporated?.slice(0, 4))).sort()),
  incorporations_2026_per_month: Object.fromEntries(Object.entries(months2026).sort()),
  top_sic: Object.fromEntries(Object.entries(count(all, c => c.sic)).sort((a, b) => b[1] - a[1]).slice(0, 40)),
  top_postcodes: Object.entries(perPc).sort((a, b) => b[1].companies - a[1].companies).slice(0, 40).map(([pc, s]) => ({ pc, ...s })),
  per_postcode: perPc,
}, null, 1));
console.log(`rows ${rows}, kept ${kept} in ${Object.keys(sorted).length} postcodes; care-of clauses withheld in address lines: ${withheldLines}`);
