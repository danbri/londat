#!/usr/bin/env node
// Wikidata for the building registry, through QLever (https://qlever.dev/api/wikidata) and its geo functions.
//   node cwplans/tools/registry-wikidata.mjs
// out: data/raw/registry/wikidata-cw.json  {items: [...], hq: [...]}
// People (Q5) and memorials are excluded (repo data-ethics rule), as items and as owner/occupant values.
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { RAW, qlever } from './lib.mjs';

import { QLEVER } from './lib.mjs';
const CENTRE = 'POINT(-0.0175 51.5040)', RADIUS_KM = 1.1;   // covers the Canary Wharf box (registry-osm.mjs CW_BOX)
const PREFIX = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>`;
const lab = v => `OPTIONAL { ${v} rdfs:label ${v}Label . FILTER(LANG(${v}Label) = "en") }`;
// one query at a time, at least 1.5 s apart, retried with backoff on 429 and 5xx (lib.mjs qlever; owner, 2026-10-03:
// "maybe the rate limiting should come from us?"). Repeating a PREFIX that lib.mjs also declares is allowed in SPARQL.
const q = sparql => qlever(PREFIX + '\n' + sparql);
const near = `?item wdt:P625 ?coord . BIND(geof:distance(?coord, "${CENTRE}"^^geo:wktLiteral) AS ?km) FILTER(?km < ${RADIUS_KM})`;
const notPerson = `FILTER NOT EXISTS { ?item wdt:P31 wd:Q5 }`;

// 1. items in the radius, one row per (item, property, value) for the properties the registry uses
const PROPS = { P31: 'instance of', P127: 'owned by', P466: 'occupant', P1101: 'floors above ground', P1139: 'floors below ground', P2048: 'height', P571: 'inception', P576: 'dissolved or demolished', P1619: 'opened', P281: 'postal code', P6375: 'street address', P669: 'located on street', P670: 'street number', P856: 'official website', P84: 'architect', P631: 'structural engineer', P1435: 'heritage designation', P159: 'headquarters location', P452: 'industry', P749: 'parent organisation' };
// two steps: the ids in the radius (fast), then their properties for a fixed list (a variable predicate
// across the whole radius query times out on QLever)
const base = await q(`SELECT ?item ?itemLabel ?itemDescription ?coord ?km WHERE {
  ${near} ${notPerson}
  ${lab('?item')}
  OPTIONAL { ?item schema:description ?itemDescription . FILTER(LANG(?itemDescription) = "en") }
}`);
const ids = [...new Set(base.map(b => b.item.value.split('/').pop()))];
let rows = base.map(b => ({ ...b }));
for (let k = 0; k < ids.length; k += 150) {
  rows = rows.concat(await q(`SELECT ?item ?p ?v ?vLabel WHERE {
    VALUES ?item { ${ids.slice(k, k + 150).map(i => 'wd:' + i).join(' ')} }
    VALUES ?p { ${Object.keys(PROPS).map(p => 'wdt:' + p).join(' ')} }
    ?item ?p ?v . ${lab('?v')}
    # owners and occupants: organisations only, never individual people (architects and engineers are professional credits)
    FILTER(?p IN (wdt:P84, wdt:P631) || NOT EXISTS { ?v wdt:P31 wd:Q5 })
  }`));
}
const items = new Map();
for (const b of rows) {
  const id = b.item.value.split('/').pop();
  if (!items.has(id) && !b.coord) continue;
  const it = items.get(id) || { id, label: b.itemLabel?.value || id, description: b.itemDescription?.value || '', coord: b.coord.value, km: +(+b.km.value).toFixed(3), props: {} };
  if (b.v) { const p = b.p.value.split('/').pop(), v = b.v.type === 'uri' ? { id: b.v.value.split('/').pop(), label: b.vLabel?.value || '' } : b.v.value; (it.props[PROPS[p]] ||= []).push(v); }
  items.set(id, it);
}
const memorial = it => (it.props['instance of'] || []).some(c => /memorial|grave|cemetery|tomb|plaque/i.test(c.label || ''));
const kept = [...items.values()].filter(it => !memorial(it));
for (const it of kept) for (const k in it.props) it.props[k] = [...new Map(it.props[k].map(v => [JSON.stringify(v), v])).values()];

// 2. organisations whose headquarters location is a place in the radius (occupants with the role "headquarters")
const hq = await q(`SELECT ?org ?orgLabel ?item ?itemLabel ?km ?web WHERE {
  ${near}
  ?org wdt:P159 ?item . FILTER NOT EXISTS { ?org wdt:P31 wd:Q5 } FILTER NOT EXISTS { ?org wdt:P576 ?gone }
  OPTIONAL { ?org wdt:P856 ?web }
  ${lab('?org')} ${lab('?item')}
}`);
const hqs = [...new Map(hq.map(b => [b.org.value + b.item.value, { org: b.org.value.split('/').pop(), label: b.orgLabel?.value || '', place: b.item.value.split('/').pop(), place_label: b.itemLabel?.value || '', km: +(+b.km.value).toFixed(3), website: b.web?.value || null }])).values()];

mkdirSync(join(RAW, 'registry'), { recursive: true });
writeFileSync(join(RAW, 'registry', 'wikidata-cw.json'), JSON.stringify({ source: QLEVER, fetched: new Date().toISOString().slice(0, 10), centre: CENTRE, radius_km: RADIUS_KM, items: kept, hq: hqs }, null, 1));
console.log(`QLever: ${items.size} items in ${RADIUS_KM} km, ${items.size - kept.length} memorials dropped, ${hqs.length} organisations headquartered there`);
