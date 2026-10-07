// The Canary Wharf Group directory as a typed occupant list: each archived directory page's schema.org data (page name,
// first published, last edited, section path; read with @factoidal/core SPARQL) joined to the directory record
// (registry/sources/brands/cwg-directory.json) and to the registry buildings that link to the page; a schema.org type
// from the CWG kind and category by the table below.
//   in:  third_party/cwplans-structured-data/all.nq.gz, pages/web.archive.org.jsonl, registry/sources/brands/cwg-directory.json
//   out: registry/sources/brands/cwg-directory-typed.json, cwg-directory-typed.nq
//   node magpie/cwplans/tools/cwg-directory-typed.mjs
// Skill: cwplans-web-harvest, "The canarywharf.com directory".
import { readFileSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { parse, query, serialize, Dataset, dataFactory as F } from '@factoidal/core';
import { TOOLS } from './lib.mjs';

const CW = join(TOOLS, '..'), TP = join(CW, '..', '..', 'third_party', 'cwplans-structured-data');
const dir = JSON.parse(readFileSync(join(CW, 'registry/sources/brands/cwg-directory.json'), 'utf8'));
// CWG category -> schema.org type; a category not here falls back to the kind's type
const CAT = {
  'American': 'Restaurant', 'Asian': 'Restaurant', 'British': 'Restaurant', 'Caribbean': 'Restaurant', 'Chinese': 'Restaurant', 'Greek': 'Restaurant',
  'Indian': 'Restaurant', 'Italian': 'Restaurant', 'Japanese': 'Restaurant', 'Malaysian': 'Restaurant', 'Mexican': 'Restaurant', 'Pizza': 'Restaurant',
  'Sushi': 'Restaurant', 'Thai': 'Restaurant', 'Restaurants': 'Restaurant', 'Eat In': 'Restaurant',
  'Bakery': 'Bakery', 'Bars': 'BarOrPub', 'Cocktails': 'BarOrPub', 'Cafes & Bars': 'CafeOrCoffeeShop', 'Coffee': 'CafeOrCoffeeShop',
  'Grab & Go': 'FastFoodRestaurant', 'Ice cream': 'IceCreamShop',
  'Accessories': 'Store', 'Bags & Luggage': 'Store', 'Clothing': 'ClothingStore', 'Lingerie': 'ClothingStore', 'Menswear': 'ClothingStore', 'Womenswear': 'ClothingStore',
  'Banks & Foreign Exchange': 'BankOrCreditUnion', 'Car Hire': 'AutoRental', 'Cards & Stationery': 'Store', 'Childcare': 'ChildCare', 'Confectionery': 'Store',
  'Dry Cleaning & Shoe Repair': 'DryCleaningOrLaundry', 'Electronics & Phones': 'ElectronicsStore', 'Estate Agent': 'RealEstateAgent', 'Event Space': 'EventVenue',
  'Flowers & Plants': 'Florist', 'Groceries': 'GroceryStore', 'Hairdressing & Beauty': 'BeautySalon', 'Health & Beauty': 'HealthAndBeautyBusiness',
  'Healthcare': 'MedicalBusiness', 'Home & Furniture': 'HomeGoodsStore', 'Hotels & Apartments': 'LodgingBusiness', 'Jewellery & Watches': 'JewelryStore',
  'Library': 'Library', 'News & Books': 'BookStore', 'Opticians & Pharmacies': 'MedicalBusiness', 'Photo Booth': 'Store', 'Services': 'LocalBusiness',
  'Shoes & Footwear': 'ShoeStore', 'Spa': 'DaySpa', 'Sport & Fitness': 'SportsActivityLocation', 'Sport': 'SportsActivityLocation', 'Experience': 'EntertainmentBusiness' };
const KIND = { restaurant: 'FoodEstablishment', shop: 'Store', 'see-do': 'EntertainmentBusiness', stay: 'LodgingBusiness' };
const CUISINE = new Set(['American', 'Asian', 'British', 'Caribbean', 'Chinese', 'Greek', 'Indian', 'Italian', 'Japanese', 'Malaysian', 'Mexican', 'Pizza', 'Sushi', 'Thai']);

// registry keys of each archived page
const keys = new Map();
for (const l of readFileSync(join(TP, 'pages', 'web.archive.org.jsonl'), 'utf8').split('\n')) if (l.trim()) { const r = JSON.parse(l); keys.set(r.final_url || r.url, r.entity_keys || []); keys.set(r.url, r.entity_keys || []); }

const ds = await parse(gunzipSync(readFileSync(join(TP, 'all.nq.gz'))).toString(), { format: 'nquads' });
const S = 'PREFIX s: <https://schema.org/>\n';
const pages = await query(ds, S + `SELECT ?g ?url ?name ?pub ?mod WHERE { GRAPH ?g { ?p a s:WebPage ; s:url ?url .
  OPTIONAL { ?p s:name ?name } OPTIONAL { ?p s:datePublished ?pub } OPTIONAL { ?p s:dateModified ?mod } }
  FILTER(STRSTARTS(STR(?g), "https://web.archive.org/") && CONTAINS(STR(?url), "canarywharf.com/")) }`);
const crumbs = await query(ds, S + `SELECT ?g ?pos ?name WHERE { GRAPH ?g { ?b a s:BreadcrumbList ; s:itemListElement ?li . ?li s:position ?pos ; s:name ?name }
  FILTER(STRSTARTS(STR(?g), "https://web.archive.org/")) }`);
const trail = new Map();
for (const r of crumbs) { const g = r.get('g').value; (trail.get(g) || trail.set(g, []).get(g)).push([+r.get('pos').value, r.get('name').value]); }
const pageOf = new Map();
for (const r of pages) { const url = r.get('url').value.replace(/^http:/, 'https:').replace(/\/?$/, '/'), g = r.get('g').value;
  pageOf.set(url, { g, name: r.get('name')?.value, pub: r.get('pub')?.value, mod: r.get('mod')?.value, trail: (trail.get(g) || []).sort((a, b) => a[0] - b[0]).map(x => x[1]) }); }

const v = s => s == null ? null : s, out = [], Q = [], P = n => F.namedNode('https://schema.org/' + n), lit = x => F.literal(String(x));
for (const e of dir.directory) {
  const p = pageOf.get(e.cwg_url.replace(/^http:/, 'https:').replace(/\/?$/, '/')), cats = e.categories || [];
  const types = [...new Set(cats.map(c => CAT[c]).filter(Boolean))]; if (!types.length) types.push(KIND[e.kind] || 'LocalBusiness');
  const reg = [...new Set((p ? keys.get(p.g) || [] : []).filter(k => k.startsWith('cwb-')).map(k => k.split('|')[0]))];
  const name = (p?.name || e.title || '').replace(/\s*[|–-]\s*Canary Wharf\s*$/i, '').trim() || e.title || e.slug;
  const rec = { slug: e.slug, kind: e.kind, name, schema_types: types, categories: cats, serves_cuisine: cats.filter(c => CUISINE.has(c)),
    section: p ? p.trail.slice(1, -1).filter((s, i, a) => !a.slice(0, i).some(x => x === s || x.startsWith(s) || s.startsWith(x))) : [], first_listed: v(p?.pub), last_edited: v(p?.mod), sitemap_lastmod: e.sitemap_lastmod, archived_on: e.archived_on || null,
    mall: e.mall || null, level: e.level ?? null, street: e.street || null, postcode: e.postcode || null, website: e.website || null,
    registry_buildings: reg, cwg_url: e.cwg_url, archived: e.archived, structured_data: !!p };
  out.push(rec);
  const x = F.namedNode(e.cwg_url + '#entity'), G = F.namedNode(e.archived || e.cwg_url);
  for (const t of types) Q.push(F.quad(x, F.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), P(t), G));
  Q.push(F.quad(x, P('name'), lit(name), G));
  for (const c of rec.serves_cuisine) Q.push(F.quad(x, P('servesCuisine'), lit(c), G));
  if (rec.website && /^https?:\/\//.test(rec.website)) Q.push(F.quad(x, P('url'), F.namedNode(rec.website), G));
  if (rec.postcode || rec.street) { const a = F.namedNode(e.cwg_url + '#address'); Q.push(F.quad(x, P('address'), a, G));
    if (rec.street) Q.push(F.quad(a, P('streetAddress'), lit(rec.street), G)); if (rec.postcode) Q.push(F.quad(a, P('postalCode'), lit(rec.postcode), G));
    Q.push(F.quad(a, P('addressCountry'), lit('GB'), G)); }
  if (rec.mall) Q.push(F.quad(x, P('containedInPlace'), lit(rec.mall), G));
  const pg = F.namedNode(e.cwg_url); Q.push(F.quad(x, P('subjectOf'), pg, G));
  if (rec.first_listed) Q.push(F.quad(pg, P('datePublished'), lit(rec.first_listed), G));
  if (rec.last_edited) Q.push(F.quad(pg, P('dateModified'), lit(rec.last_edited), G));
}
const years = k => out.reduce((m, r) => { const y = (r[k] || '').slice(0, 4); if (y) m[y] = (m[y] || 0) + 1; return m; }, {});
const doc = { source: 'Canary Wharf Group directory pages as archived by the Internet Archive (crawl for scoping, owner rule of 2026-10-03), joined to registry/sources/brands/cwg-directory.json',
  generated: new Date().toISOString(), tool: 'magpie/cwplans/tools/cwg-directory-typed.mjs',
  note: 'schema_types come from the CWG kind and category by the table in the tool, not from the publisher: the pages type only the publisher (WebPage, WebSite, Organization). first_listed and last_edited are the pages\' datePublished and dateModified.',
  counts: { entries: out.length, with_structured_data: out.filter(r => r.structured_data).length, with_registry_building: out.filter(r => r.registry_buildings.length).length,
    by_type: out.flatMap(r => r.schema_types).reduce((m, t) => (m[t] = (m[t] || 0) + 1, m), {}), first_listed_by_year: years('first_listed'), last_edited_by_year: years('last_edited') },
  entries: out };
writeFileSync(join(CW, 'registry/sources/brands/cwg-directory-typed.json'), JSON.stringify(doc, null, 1) + '\n');
writeFileSync(join(CW, 'registry/sources/brands/cwg-directory-typed.nq'), await serialize(new Dataset(Q), { format: 'nquads' }));
console.log(JSON.stringify(doc.counts, null, 1), Q.length, 'quads');
