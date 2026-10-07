// HM Land Registry Price Paid Data for every Canary Wharf postcode, via the Land Registry SPARQL endpoint.
// Run: node cwplans/tools/registry-landregistry.mjs
// Writes registry/sources/landregistry/price-paid-by-postcode.json and price-paid-summary.json.
// Price Paid holds addresses and prices only (no names). Licence: OGL v3 (see SOURCES-companies-property.md).
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { OUT, UA, cwPostcodes, sleep } from './registry-lib.mjs';

const ENDPOINT = 'https://landregistry.data.gov.uk/landregistry/query';
const dir = join(OUT, 'landregistry');
mkdirSync(dir, { recursive: true });

const short = u => u ? u.replace(/^.*\//, '') : null;
const query = pcs => `PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
SELECT ?tx ?price ?date ?ptype ?newb ?tenure ?cat ?paon ?saon ?street ?town ?pc WHERE {
  VALUES ?pc { ${pcs.map(p => JSON.stringify(p)).join(' ')} }
  ?addr lrcommon:postcode ?pc .
  ?tx lrppi:propertyAddress ?addr ; lrppi:pricePaid ?price ; lrppi:transactionDate ?date .
  OPTIONAL { ?tx lrppi:propertyType ?ptype } OPTIONAL { ?tx lrppi:newBuild ?newb }
  OPTIONAL { ?tx lrppi:estateType ?tenure } OPTIONAL { ?tx lrppi:transactionCategory ?cat }
  OPTIONAL { ?addr lrcommon:paon ?paon } OPTIONAL { ?addr lrcommon:saon ?saon }
  OPTIONAL { ?addr lrcommon:street ?street } OPTIONAL { ?addr lrcommon:town ?town }
}`;

async function run(pcs) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(ENDPOINT, {
      method: 'POST', body: new URLSearchParams({ query: query(pcs) }),
      headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (r.ok) return (await r.json()).results.bindings;
    if (attempt >= 3) throw new Error(`${r.status} ${await r.text()}`);
    await sleep(3000 * (attempt + 1));
  }
}

const pcs = cwPostcodes();
const meta = Object.fromEntries(pcs.map(p => [p.pc, p]));
const byPc = {};
const B = 20;
for (let i = 0; i < pcs.length; i += B) {
  const batch = pcs.slice(i, i + B).map(p => p.pc);
  const rows = await run(batch);
  for (const b of rows) {
    const v = k => b[k]?.value ?? null;
    const pc = v('pc');
    (byPc[pc] ||= []).push({
      id: short(v('tx').replace(/\/current$/, '')),
      price: Number(v('price')), date: v('date'),
      type: short(v('ptype'))?.replace(/PropertyType$|$/, '') || null,
      new_build: v('newb') === 'true',
      tenure: short(v('tenure')),
      category: short(v('cat'))?.replace(/PricePaidTransaction$/, '') || null,
      paon: v('paon'), saon: v('saon'), street: v('street'), town: v('town'),
    });
  }
  process.stdout.write(`\r${Math.min(i + B, pcs.length)}/${pcs.length} postcodes, ${Object.values(byPc).flat().length} tx`);
  await sleep(700);
}
console.log();

// de-duplicate (OPTIONAL joins can repeat a row) and sort
let tx = 0;
for (const pc of Object.keys(byPc)) {
  const seen = new Map();
  for (const t of byPc[pc]) seen.set(t.id, t);
  byPc[pc] = [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
  tx += byPc[pc].length;
}
const sorted = Object.fromEntries(Object.keys(byPc).sort().map(k => [k, byPc[k]]));

const fetched = new Date().toISOString().slice(0, 10);
writeFileSync(join(dir, 'price-paid-by-postcode.json'), JSON.stringify({
  source: 'HM Land Registry Price Paid Data, via SPARQL ' + ENDPOINT,
  licence: 'Open Government Licence v3.0. Contains HM Land Registry data (c) Crown copyright and database right ' + fetched.slice(0, 4) + '. This data is licensed under the Open Government Licence v3.0.',
  fetched, postcodes_queried: pcs.length, postcodes_with_tx: Object.keys(sorted).length, transactions: tx,
  fields: { type: 'detached|semi-detached|terraced|flat-maisonette|other (other = not a home: offices, shops, land, car spaces)', category: 'standard (PPD category A: a full-market-value sale of a single residential property) or additional (category B: repossessions, buy-to-lets where identifiable, transfers to non-private individuals, sales of non-residential property)', tenure: 'freehold|leasehold', new_build: 'true = newly built at the time of sale' },
  postcodes: sorted,
}, null, 0).replace(/\],"/g, '],\n"'));

// summary: homes per postcode = distinct SAON+PAON+street among residential types (type 'other' is not a home);
// addresses = distinct SAON+PAON+street of any type. Only homes that have SOLD since 1995 appear at all.
const year = d => d.slice(0, 4);
const perYear = {}, newPerYear = {}, typePerYear = {}, perPc = {};
for (const [pc, list] of Object.entries(sorted)) {
  const addr = t => [t.saon, t.paon, t.street].join('|');
  const homes = new Set(list.filter(t => t.type !== 'other').map(addr));
  const addresses = new Set(list.map(addr));
  const prices = list.map(t => t.price).sort((a, b) => a - b);
  perPc[pc] = {
    tier: meta[pc]?.tier, status: meta[pc]?.status,
    transactions: list.length, homes: homes.size, addresses: addresses.size, new_build_tx: list.filter(t => t.new_build).length,
    first: list[0].date, last: list.at(-1).date,
    median_price: prices[Math.floor(prices.length / 2)],
    streets: [...new Set(list.map(t => t.street).filter(Boolean))],
    buildings: [...new Set(list.map(t => t.paon).filter(Boolean))].slice(0, 12),
    types: list.reduce((o, t) => (o[t.type] = (o[t.type] || 0) + 1, o), {}),
  };
  for (const t of list) {
    const y = year(t.date);
    perYear[y] = (perYear[y] || 0) + 1;
    if (t.new_build) newPerYear[y] = (newPerYear[y] || 0) + 1;
    (typePerYear[y] ||= {})[t.type] = (typePerYear[y][t.type] || 0) + 1;
  }
}
const top = Object.entries(perPc).sort((a, b) => b[1].homes - a[1].homes).slice(0, 30).map(([pc, s]) => ({ pc, homes: s.homes, transactions: s.transactions, first: s.first, streets: s.streets }));
writeFileSync(join(dir, 'price-paid-summary.json'), JSON.stringify({
  fetched, postcodes_queried: pcs.length, postcodes_with_tx: Object.keys(sorted).length, transactions: tx,
  homes_total: Object.values(perPc).reduce((s, x) => s + x.homes, 0),
  transactions_per_year: perYear, new_build_per_year: newPerYear, types_per_year: typePerYear,
  top_postcodes_by_homes: top, per_postcode: perPc,
}, null, 1));
console.log(`postcodes with tx ${Object.keys(sorted).length}, transactions ${tx}`);
