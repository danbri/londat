#!/usr/bin/env node
// Step 2: Wikidata facts for the NSI UK brand QIDs, through QLever (https://qlever.dev/api/wikidata).
//   node magpie/cwplans/registry/sources/brands/tools/wikidata-brands.mjs
// in:  brands-uk.json
// out: wikidata-brands.json (label, official website P856, parent organisation P749, count of items
//      anywhere with P1716 brand = QID and a P625 coordinate) and wikidata-near.json (every item
//      within 1 km of One Canada Square, with any P1716/P127/P749/P137 link to an NSI brand QID).
// Raw responses are cached in data/raw/registry/qlever/.
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { OUT, RAW, UA, readJSON, sleep } from './lib.mjs';

const EP = 'https://qlever.dev/api/wikidata';   // https://qlever.cs.uni-freiburg.de/api/wikidata now answers 308 to here
const CACHE = join(RAW, 'qlever'); mkdirSync(CACHE, { recursive: true });
const PFX = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/> PREFIX spatialSearch: <https://qlever.cs.uni-freiburg.de/spatialSearch/>
`;
async function sparql(q) {
  const f = join(CACHE, createHash('sha1').update(q).digest('hex').slice(0, 16) + '.json');
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const res = await fetch(EP, { method: 'POST', headers: { 'user-agent': UA, accept: 'application/sparql-results+json', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ query: q }) });
  const txt = await res.text();
  if (!res.ok) throw new Error(`QLever ${res.status}: ${txt.slice(0, 400)}`);
  writeFileSync(f, txt); await sleep(700);
  return JSON.parse(txt);
}
const val = (b, k) => b[k]?.value ?? null;
const qid = u => u ? u.replace('http://www.wikidata.org/entity/', '') : null;

const brands = readJSON(join(OUT, 'brands-uk.json')).brands;
const qids = [...new Set(brands.map(b => b.wd).filter(Boolean))];
const facts = {};
for (let i = 0; i < qids.length; i += 400) {
  const vals = qids.slice(i, i + 400).map(q => 'wd:' + q).join(' ');
  const r = await sparql(PFX + `SELECT ?b (SAMPLE(?l) AS ?label) (GROUP_CONCAT(DISTINCT STR(?w); separator=" ") AS ?web)
 (GROUP_CONCAT(DISTINCT STR(?p); separator=" ") AS ?parents) (GROUP_CONCAT(DISTINCT ?pl; separator=" | ") AS ?parent_labels) WHERE {
 VALUES ?b { ${vals} }
 OPTIONAL { ?b rdfs:label ?l FILTER(LANG(?l) = "en") }
 OPTIONAL { ?b wdt:P856 ?w }
 OPTIONAL { ?b wdt:P749 ?p OPTIONAL { ?p rdfs:label ?pl FILTER(LANG(?pl) = "en") } }
} GROUP BY ?b`);
  for (const b of r.results.bindings) facts[qid(val(b, 'b'))] = {
    label: val(b, 'label'), websites: (val(b, 'web') || '').split(' ').filter(Boolean),
    parents: (val(b, 'parents') || '').split(' ').filter(Boolean).map(qid), parent_labels: val(b, 'parent_labels') || null,
  };
  const c = await sparql(PFX + `SELECT ?b (COUNT(?i) AS ?n) WHERE { VALUES ?b { ${vals} } ?i wdt:P1716 ?b . FILTER EXISTS { ?i wdt:P625 ?c } } GROUP BY ?b`);
  for (const b of c.results.bindings) (facts[qid(val(b, 'b'))] ||= {}).located_items_p1716 = +val(b, 'n');
}
for (const q of qids) { facts[q] ||= { missing: true }; facts[q].located_items_p1716 ??= 0; }

// geo: everything within 1 km of One Canada Square (QLever spatial search), with brand-ish links
const near = await sparql(PFX + `SELECT ?i ?c ?d WHERE {
 BIND("POINT(-0.0195 51.5049)"^^geo:wktLiteral AS ?p)
 SERVICE spatialSearch: { _:c spatialSearch:algorithm spatialSearch:s2 ; spatialSearch:left ?p ; spatialSearch:right ?c ;
   spatialSearch:maxDistance 1000 ; spatialSearch:bindDistance ?d ; spatialSearch:payload <all> . { ?i wdt:P625 ?c } } }`);
const pos = new Map();
for (const b of near.results.bindings) { const q = qid(val(b, 'i')); if (!pos.has(q) || 1000 * val(b, "d") < pos.get(q).d) pos.set(q, { c: val(b, "c"), d: 1000 * val(b, "d") }); }
const nearVals = [...pos.keys()].map(q => 'wd:' + q).join(' ');
const desc = await sparql(PFX + `SELECT ?i (SAMPLE(?l) AS ?label) (GROUP_CONCAT(DISTINCT ?tl; separator=" | ") AS ?types) WHERE {
 VALUES ?i { ${nearVals} } OPTIONAL { ?i rdfs:label ?l FILTER(LANG(?l) = "en") }
 OPTIONAL { ?i wdt:P31 ?ty . ?ty rdfs:label ?tl FILTER(LANG(?tl) = "en") } } GROUP BY ?i`);
const linkQ = {};
for (const [p] of [['P1716'], ['P127'], ['P749'], ['P137']]) {
  const r = await sparql(PFX + `SELECT ?i ?t WHERE { VALUES ?i { ${nearVals} } ?i wdt:${p} ?t }`);
  for (const b of r.results.bindings) (linkQ[qid(val(b, 'i'))] ||= []).push({ p, t: qid(val(b, 't')) });
}
const descBy = Object.fromEntries(desc.results.bindings.map(b => [qid(val(b, 'i')), b]));
const nsiQ = new Set(qids);
const items = [...pos].sort((x, y) => x[1].d - y[1].d).map(([q, { c, d }]) => {
  const links = linkQ[q] || [];
  return { qid: q, label: val(descBy[q] || {}, 'label'), coord: c, dist_m: Math.round(d), types: val(descBy[q] || {}, 'types'), links, nsi_brand_links: links.filter(l => nsiQ.has(l.t)) };
});
const linked = items.filter(i => i.nsi_brand_links.length);
writeFileSync(join(OUT, 'wikidata-brands.json'), '{"meta":' + JSON.stringify({
  source: 'Wikidata (CC0) via QLever ' + EP, generated: new Date().toISOString(), qids: qids.length,
  with_website: Object.values(facts).filter(f => f.websites?.length).length,
  with_parent: Object.values(facts).filter(f => f.parents?.length).length,
  brands_with_located_items: Object.values(facts).filter(f => f.located_items_p1716 > 0).length,
}) + ',\n"brands":{\n' + Object.entries(facts).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + '\n}}\n');
writeFileSync(join(OUT, 'wikidata-near.json'), JSON.stringify({
  query: 'QLever SERVICE spatialSearch: (algorithm s2, maxDistance 1000 m, payload <all>; bindDistance is in km) around POINT(-0.0195 51.5049) over wdt:P625; then labels, P31 and P1716/P127/P749/P137 for those items by VALUES',
  generated: new Date().toISOString(), items_within_1km: items.length, items_linked_to_nsi_brand: linked.length, linked, all: items.map(({ qid, label, dist_m, types }) => ({ qid, label, dist_m, types })),
}, null, 1));
console.log(`${qids.length} QIDs; ${items.length} items within 1 km; ${linked.length} linked to an NSI brand`);
for (const i of linked) console.log(' ', i.qid, i.label, i.dist_m, 'm', i.types, JSON.stringify(i.nsi_brand_links));
