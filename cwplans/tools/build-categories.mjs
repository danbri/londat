// Occupant categories per registry building: finance, shops, catering, leisure, entertainment; and (October 2026) bar,
// alcohol, education, health, sport, arts, charity (registers). Drives the "glow" outlines in the 3D page (the first five) and the counts
// in the atlas.
//
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/build-categories.mjs     # two QLever queries the first time, then cached
//
// in:  registry/buildings.json, data/raw/registry/osm-cw.json.gz (OSM tags by id: the registry keeps only a role),
//      registry/sources/brands/cwg-directory.json (section and category labels of the entries occupants are joined to),
//      Wikidata via QLever: occupant classes and dated occupant links (cached in data/raw/registry/wikidata-occupant-classes.json)
// out: registry/categories.json  { rules, buildings: { cwb-id: { finance: [{ name, source, why, link?, start?, end? }], ... } }, former: { ... } }
// Rules: a category comes only from a class stated by a source (an OSM tag, a Wikidata class or industry, the FSA
// business type, or the branch role from the brand table, whose category comes from the brand's NSI or OSM tag).
// Every input and output, with endpoints and rules: cwplans/pipeline.json, activity "build-categories". Names are never used to guess a class. Companies House registered
// offices are not occupants (audit SE-1) and are not used. Wikidata occupant links: an end date or a dissolved
// organisation makes the entry "former" and it does not count; most links have no qualifier and are marked "undated".
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { TOOLS, QLEVER, qlever } from './lib.mjs';

const CW = join(TOOLS, '..');
const REG = JSON.parse(readFileSync(join(CW, 'registry/buildings.json'), 'utf8'));
const OSM = JSON.parse(gunzipSync(readFileSync(join(CW, 'data/raw/registry/osm-cw.json.gz'))));
const tagsOf = new Map(OSM.features.map(f => [`${f.type}/${f.id}`, f.tags || {}]));

// ---- Wikidata, through QLever in two queries (paced by tools/lib.mjs qlever): the classes (P31) and industries (P452) of
// every occupant item, and the occupant (P466) and headquarters (P159) links of every registry building with their
// start (P580) and end (P582) qualifiers and the organisation's dissolution (P576). Cached; delete the file to refresh.
const WDC = join(CW, 'data/raw/registry/wikidata-occupant-classes.json');
const qids = [...new Set(REG.buildings.flatMap(b => b.occupants.map(o => o.wikidata)).filter(Boolean))];
const bqids = [...new Set(REG.buildings.map(b => b.wikidata).filter(Boolean))];
let wdc = existsSync(WDC) ? JSON.parse(readFileSync(WDC, 'utf8')) : {};
if (!wdc.links || qids.some(q => !wdc.items?.[q])) {
  const id = v => v.value.split('/').pop(), items = {};
  for (const r of await qlever(`SELECT ?item ?itemLabel ?kind ?cLabel WHERE { VALUES ?item { ${qids.map(q => 'wd:' + q).join(' ')} }
    { ?item wdt:P31 ?c BIND("p31" AS ?kind) } UNION { ?item wdt:P452 ?c BIND("p452" AS ?kind) }
    OPTIONAL { ?c rdfs:label ?cLabel FILTER(LANG(?cLabel) = "en") } OPTIONAL { ?item rdfs:label ?itemLabel FILTER(LANG(?itemLabel) = "en") } }`)) {
    const it = (items[id(r.item)] ||= { label: r.itemLabel?.value || null, p31: [], p452: [] }); const l = r.cLabel?.value; if (l && !it[r.kind.value].includes(l)) it[r.kind.value].push(l);
  }
  for (const q of qids) items[q] ||= { label: null, p31: [], p452: [] };
  const links = [];
  for (const r of await qlever(`SELECT ?b ?o ?prop ?start ?end ?dissolved WHERE { VALUES ?b { ${bqids.map(q => 'wd:' + q).join(' ')} }
    { ?b p:P466 ?st . ?st ps:P466 ?o . BIND("P466" AS ?prop) } UNION { ?o p:P159 ?st . ?st ps:P159 ?b . BIND("P159" AS ?prop) }
    OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end } OPTIONAL { ?o wdt:P576 ?dissolved } }`))
    links.push({ b: id(r.b), o: id(r.o), prop: r.prop.value, start: r.start?.value.slice(0, 10) || null, end: r.end?.value.slice(0, 10) || null, dissolved: r.dissolved?.value.slice(0, 10) || null });
  wdc = { source: QLEVER, fetched: new Date().toISOString().slice(0, 10), items, links };
  writeFileSync(WDC, JSON.stringify(wdc, null, 1));
  console.log(`QLever: classes of ${qids.length} occupant items; ${links.length} occupant and headquarters links of ${bqids.length} buildings`);
}
// link status of a Wikidata occupant in a building: former (an end date, or the organisation dissolved), current
// (a start date and no end), undated (no qualifier: most links)
const linkOf = new Map(); for (const l of wdc.links) { const k = `${l.b}|${l.o}`, s = l.end || l.dissolved ? 'former' : l.start ? 'current' : 'undated'; const prev = linkOf.get(k); if (!prev || prev.status === 'former' || (prev.status === 'undated' && s === 'current')) linkOf.set(k, { ...l, status: s }); }

// ---- rules: [category, test on (occupant, OSM tags, Wikidata classes), reason]
const FIN_WD = /\b(bank|banking|financial|finance|insurance|investment|asset management|stock exchange|securities|credit rating|brokerage|hedge fund|private equity|payment|financial regulator|regulatory agency)\b/i;
const RULES = [
  ['finance', (o, t) => /^(bank|bureau_de_change|money_transfer)$/.test(t.amenity || '') || /^(financial|insurance|financial_advisor|tax_advisor)$/.test(t.office || ''), (o, t) => `OSM ${t.amenity ? 'amenity=' + t.amenity : 'office=' + t.office}`],
  ['finance', (o, t, w) => w && (w.p31.some(c => FIN_WD.test(c)) || w.p452.some(c => FIN_WD.test(c))), (o, t, w) => `Wikidata ${[...w.p31, ...w.p452].filter(c => FIN_WD.test(c)).slice(0, 2).join(', ')}`],
  ['finance', o => /^(service: bank|branch: bank|service: bureau_de_change|service: money_transfer)$/.test(o.role), o => `role ${o.role}`],
  ['shop', (o, t) => !!t.shop || /^(branch: shop|shop)$/.test(o.role) || /^Retailers/.test(o.type || ''), (o, t) => t.shop ? `OSM shop=${t.shop}` : o.type ? `FSA ${o.type}` : `role ${o.role}`],
  ['catering', (o, t) => /^(restaurant|cafe|bar|pub|fast_food|food_court|ice_cream|biergarten)$/.test(t.amenity || '') || /^(food and drink|branch: (cafe|bar|takeaway|restaurant|fast food|pub))$/.test(o.role) || /^(Restaurant|Takeaway|Pub\/bar|Other catering|Mobile caterer)/.test(o.type || ''), (o, t) => t.amenity ? `OSM amenity=${t.amenity}` : o.type ? `FSA ${o.type}` : `role ${o.role}`],
  ['leisure', (o, t) => /^(fitness_centre|sports_centre|swimming_pool|sauna|dance|sports_hall)$/.test(t.leisure || '') || /^leisure: (fitness_centre|sports_centre|swimming_pool|sauna|dance)$/.test(o.role) || /^(branch: hotel|tourism: hotel)$/.test(o.role) || /^Hotel/.test(o.type || ''), (o, t) => t.leisure ? `OSM leisure=${t.leisure}` : o.type ? `FSA ${o.type}` : `role ${o.role}`],
  ['entertainment', (o, t, w) => /^(cinema|theatre|nightclub|arts_centre|casino|events_venue|music_venue|planetarium)$/.test(t.amenity || '') || /^(amusement_arcade|bowling_alley|escape_game|miniature_golf|adult_gaming_centre)$/.test(t.leisure || '') || /^(museum|gallery)$/.test(t.tourism || '') || /^service: (cinema|theatre|nightclub|events_venue|arts_centre)$/.test(o.role) || /^Pub\/bar\/nightclub/.test(o.type || '') && /nightclub/i.test(t.amenity || '') || (w && w.p31.some(c => /movie theater|cinema|theatre|music venue|nightclub|museum|art gallery|bowling/i.test(c))), (o, t, w) => t.amenity ? `OSM amenity=${t.amenity}` : t.leisure ? `OSM leisure=${t.leisure}` : t.tourism ? `OSM tourism=${t.tourism}` : w ? `Wikidata ${w.p31[0]}` : `role ${o.role}`],
];
// October 2026 additions (owner's list): pubs and bars, alcohol shops, education, healthcare, sport, cinemas and arts
// venues. An occupant can be in several categories (a pub is catering and bar). Stated classes only: OSM tags, the FSA
// business type, Wikidata P31, the CWG directory section and its own category labels (a CWG label that mixes two
// classes, "Cafes & Bars", "Hospitals/Childcare" in the FSA, is not used).
const has = (v, re) => !!v && String(v).split(';').some(x => re.test(x.trim()));
const osmWhy = (t, keys) => { for (const [k, re] of keys) if (has(t[k], re)) return `OSM ${k}=${t[k]}`; return null; };
const cwgWhy = (c, labels) => { const l = (c?.categories || []).find(x => labels.includes(x)); return l ? `CWG category ${l}` : null; };
const wdWhy = (w, re) => { const c = (w?.p31 || []).find(x => re.test(x)); return c ? `Wikidata ${c}` : null; };
const NEW = {
  bar: [[['amenity', /^(pub|bar|nightclub|biergarten)$/]], /^Pub\/bar\/nightclub$/, ['Bars', 'Cocktails'], /\b(pub|bar|nightclub|biergarten)\b/i, null],
  alcohol: [[['shop', /^(alcohol|wine|beverages)$/]], null, [], /\b(wine shop|liquor store|off-licence)\b/i, null],
  education: [[['amenity', /^(school|college|university|kindergarten|childcare)$/]], /^School\/college\/university$/, ['Childcare'], /\b(school|university|college|academic institution|kindergarten|nursery)\b/i, /^branch: childcare$/],
  health: [[['amenity', /^(doctors|dentist|pharmacy|clinic|hospital)$/], ['healthcare', /./]], null, ['Healthcare'], /\b(hospital|clinic|doctor's office|medical organization|dental|pharmacy)\b/i, null],
  sport: [[['leisure', /^(sports_centre|fitness_centre|pitch|swimming_pool|sports_hall)$/], ['sport', /./]], null, ['Sport'], /\b(sports venue|sports centre|fitness centre|gym|stadium|swimming pool)\b/i, /^branch: gym$/],
  arts: [[['amenity', /^(cinema|theatre|arts_centre|nightclub|music_venue|events_venue|concert_hall)$/], ['theatre:genre', /./]], null, [], /\b(movie theater|cinema|theatre|music venue|concert hall|arts centre|nightclub)\b/i, null],
};
for (const [cat, [osmKeys, fsaType, cwgLabels, wdRe, roleRe]] of Object.entries(NEW)) {
  // CWG "Healthcare" also lists a vet; CWG "Sport & Fitness" lists sportswear shops (not used). An OSM tag that states
  // another class outranks a CWG label.
  const why = (o, t, w, c) => (cat === 'health' && t.amenity === 'veterinary') ? null : osmWhy(t, osmKeys) || (fsaType && fsaType.test(o.type || '') && o.source === 'fsa' ? `FSA ${o.type}` : null) || cwgWhy(c, cwgLabels) || wdWhy(w, wdRe) || (roleRe && roleRe.test(o.role) ? `role ${o.role}` : null);
  RULES.push([cat, (o, t, w, c) => !!why(o, t, w, c), why]);
}
// the CWG directory's own classes for the first five: its section (restaurant: catering; stay: leisure, as hotels are)
// and the category labels that name one class of goods
const CWG_SHOP = ['Shoes & Footwear', 'Flowers & Plants', 'Cards & Stationery', 'Accessories', 'Confectionery', 'Menswear', 'Womenswear', 'Clothing', 'Lingerie', 'Home & Furniture', 'Electronics & Phones', 'Bags & Luggage', 'Jewellery & Watches', 'News & Books', 'Groceries'];
RULES.push(['catering', (o, t, w, c) => c?.kind === 'restaurant', () => 'CWG section restaurant']);
RULES.push(['leisure', (o, t, w, c) => c?.kind === 'stay' || (c?.categories || []).includes('Hotels & Apartments'), (o, t, w, c) => c.kind === 'stay' ? 'CWG section stay' : 'CWG category Hotels & Apartments']);
RULES.push(['shop', (o, t, w, c) => !!cwgWhy(c, CWG_SHOP), (o, t, w, c) => cwgWhy(c, CWG_SHOP)]);
RULES.push(['finance', (o, t, w, c) => !!cwgWhy(c, ['Banks & Foreign Exchange']), (o, t, w, c) => cwgWhy(c, ['Banks & Foreign Exchange'])]);
// Regulatory and public registers (o.registers, joined by build-registry.mjs): the register states the class. Only links
// to a current record count (a closed school, an inactive ODS role, a closed sports site do not). ODS organisation
// records (providers, headquarters) and social care services give no category; ODS "Education" is NHS training bodies.
const REG_CLASS = [
  ['education', l => l.register === 'gias' || l.register === 'ofsted-childcare' || (l.register === 'ods' && l.kind === 'School')],
  ['health', l => (l.register === 'cqc' && /Doctors|Dentist|Diagnosis|Urgent|Clinic|Hospital|Community services - Healthcare|Nursing homes/.test(l.kind)) || (l.register === 'ods' && /^(Pharmacy|Pharmacy Site|Branch Surgery|Prescribing Cost Centre|General Dental Practice|Optical Site|Nhs Trust Site|Independent Sector H\/C Provider Site|Primary Care Trust Site|Care Trust Site)$/.test(l.kind))],
  ['sport', l => l.register === 'active-places'],
  ['bar', l => l.register === 'fsa-pubs'],
  ['shop', l => l.register === 'gambling'],
  ['charity', l => l.register === 'charities'],
];
const linkCurrent = l => !/^(closed|inactive|removed)/i.test(l.status || '');
for (const [cat, test] of REG_CLASS) {
  const why = o => { const l = (o.registers || []).find(x => linkCurrent(x) && test(x)); return l ? `register ${l.register}: ${l.kind}` : null; };
  RULES.push([cat, o => !!why(o), why]);
}
const CATS = ['finance', 'shop', 'catering', 'leisure', 'entertainment', ...Object.keys(NEW), 'charity'];
const LABELS = { finance: 'Banks and finance', shop: 'Shops', catering: 'Food and drink', leisure: 'Leisure', entertainment: 'Entertainment', bar: 'Pubs, bars and nightclubs', alcohol: 'Alcohol shops', education: 'Schools, colleges, universities and nurseries', health: 'Healthcare', sport: 'Sport', arts: 'Cinemas, theatres, music and arts venues', charity: 'Registered charities' };
// CWG entries by URL: an occupant joined to the directory carries cwg_url (and cwg_also for a second section)
const CWGD = new Map(JSON.parse(readFileSync(join(CW, 'registry/sources/brands/cwg-directory.json'), 'utf8')).directory.map(e => [e.cwg_url, e]));
const cwgOf = o => { const es = [o.cwg_url, ...(o.cwg_also || [])].map(u => CWGD.get(u)).filter(Boolean); return es.length ? { kind: es[0].kind, kinds: es.map(e => e.kind), categories: es.flatMap(e => e.categories || []) } : null; };

const out = {}, former = {}, totals = Object.fromEntries(CATS.map(c => [c, { buildings: 0, occupants: 0 }]));
for (const b of REG.buildings) {
  const rec = {};
  for (const o of b.occupants) {
    const t = (o.osm && tagsOf.get(o.osm)) || {}, w = o.wikidata ? wdc.items[o.wikidata] : null, c = cwgOf(o), done = new Set();
    const link = o.wikidata && b.wikidata && /P466|P159/.test(o.role) ? linkOf.get(`${b.wikidata}|${o.wikidata}`) : null;
    const when = o.current === false ? { link: 'former' } : /wikidata/i.test(o.source) || /Wikidata/.test(o.role) ? (link ? { link: link.status, ...(link.start ? { start: link.start } : {}), ...(link.end || link.dissolved ? { end: link.end || link.dissolved } : {}) } : { link: 'undated' }) : {};
    for (const [cat, test, why] of RULES) if (!done.has(cat) && test(o, t, w, c)) { done.add(cat); if ((rec[cat] || []).some(x => x.name === (o.name || w?.label || ''))) continue; (rec[cat] ||= []).push({ name: o.name || w?.label || '', source: o.source, why: why(o, t, w, c), ...when }); }
  }
  for (const c of Object.keys(rec)) if (rec[c].every(x => x.link === 'former')) { (former[b.id] ||= {})[c] = rec[c]; delete rec[c]; } else if (rec[c].some(x => x.link === 'former')) { (former[b.id] ||= {})[c] = rec[c].filter(x => x.link === 'former'); rec[c] = rec[c].filter(x => x.link !== 'former'); }
  if (Object.keys(rec).length) { out[b.id] = rec; for (const c of Object.keys(rec)) { totals[c].buildings++; totals[c].occupants += rec[c].length; } }
}
writeFileSync(join(CW, 'registry/categories.json'), JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  rules: 'A category comes only from a class a source states: OSM tags (amenity, office, shop, leisure, tourism, healthcare, sport, theatre:genre), Wikidata P31 instance of and P452 industry, the FSA business type, the branch role from the brand table (its category from the brand\'s NSI or OSM tag), the CWG directory section (restaurant, stay) and its category labels where a label names one class, and the regulatory registers (GIAS, Ofsted childcare and ODS schools: education; CQC health services and ODS service sites: health; Active Places: sport; FSA pubs: bar; gambling premises: shop; Charity Commission: charity), current records only. Names are not used. Companies House registered offices are not used (SE-1). Wikidata occupant links: link former (an end date or a dissolved organisation; listed under former, not counted), current (a start date), undated (no qualifier).',
  labels: LABELS, totals, buildings: out, former,
}));
console.log('categories.json:', JSON.stringify(totals));
