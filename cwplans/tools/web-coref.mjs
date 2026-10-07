// Which organisation and place descriptions in the web harvest refer to the same thing: keys read with @factoidal/core
// SPARQL over the page graphs, joined in a fixed order of key rules, written as owl:sameAs links in one named graph per key.
//   in:  third_party/cwplans-structured-data/all.nq.gz, pages/*.jsonl (registry keys per page), idioms/idioms.json (types)
//   out: third_party/cwplans-structured-data/coref/sameas.nq.gz   (owl:sameAs between description IRIs; graph = key rule)
//        coref/descriptions.json  (description IRI -> page, node, kind, name, keys)
//        coref/entities.json      (groups: members, rules that joined them, sites, registry keys, conflicts)
//   node cwplans/tools/web-coref.mjs
// Remove a bad key rule by dropping its named graph and recomputing the closure. Skill: cwplans-web-harvest, "Same thing".
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { gzipSync, gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import { join } from 'path';
import { parse, query, serialize, Dataset, dataFactory as F } from '@factoidal/core';
import { TOOLS } from './lib.mjs';

const TP = join(TOOLS, '..', '..', 'third_party', 'cwplans-structured-data'), OUT = join(TP, 'coref');
mkdirSync(OUT, { recursive: true });
const BASE = 'https://danbri.github.io/glitchcan-minigam/third_party/cwplans-structured-data/';
const cat = JSON.parse(readFileSync(join(TP, 'idioms', 'idioms.json'), 'utf8'));
const typesOf = id => cat.idioms.find(d => d.id === id).candidates.match(/VALUES \?t \{([^}]*)\}/)[1].trim().split(/\s+/).map(t => t.replace('s:', 'https://schema.org/'));
const PLACE = new Set(typesOf('BranchCard')), ORG = new Set(typesOf('OrgCard'));
const RULES = ['iri', 'site-name', 'sameAs', 'telephone', 'postcode-name'];   // in the order they are applied
const GENERIC = new Set(['', 'https://facebook.com', 'https://twitter.com', 'https://instagram.com', 'https://linkedin.com', 'https://x.com', 'https://youtube.com']);

// registry keys of each page
const pageKeys = new Map();
for (const f of readdirSync(join(TP, 'pages'))) for (const l of readFileSync(join(TP, 'pages', f), 'utf8').split('\n')) if (l.trim()) {
  const r = JSON.parse(l); for (const u of [r.url, r.final_url]) if (u) pageKeys.set(u, r.entity_keys || []); }
const host = g => { const m = g.match(/^https?:\/\/web\.archive\.org\/web\/\d+[a-z_]*\/(.*)$/); const u = m ? m[1] : g; return new URL(/^https?:/.test(u) ? u : 'http://' + u).hostname.replace(/^www\./, ''); };

const t0 = Date.now();
const ds = await parse(gunzipSync(readFileSync(join(TP, 'all.nq.gz'))).toString(), { format: 'nquads' });
const S = 'PREFIX s: <https://schema.org/>\nPREFIX ss: <http://schema.org/>\n';
const rows = await query(ds, S + `SELECT ?g ?x ?k ?v WHERE { GRAPH ?g {
  { ?x a ?v . BIND("type" AS ?k) }
  UNION { ?x s:name|s:legalName ?v . BIND("name" AS ?k) }
  UNION { ?x s:telephone ?v . BIND("tel" AS ?k) }
  UNION { ?x s:sameAs ?v . BIND("same" AS ?k) }
  UNION { ?x s:address/s:postalCode ?v . BIND("pc" AS ?k) }
  UNION { ?x s:address ?v . FILTER(isLiteral(?v)) BIND("addrtext" AS ?k) }
  UNION { ?x s:geo/s:latitude ?v . BIND("lat" AS ?k) }
} }`);
console.log('parsed and queried in', Math.round((Date.now() - t0) / 1000), 's,', rows.length, 'rows');

// one description per (page, node)
const D = new Map(), term = t => t.termType === 'BlankNode' ? '_:' + t.value : t.value;
for (const r of rows) {
  const g = r.get('g').value, x = r.get('x'), key = g + '\t' + term(x);
  let d = D.get(key); if (!d) D.set(key, d = { page: g, node: term(x), named: x.termType === 'NamedNode', types: new Set(), name: [], tel: [], same: [], pc: [], lat: [] });
  const k = r.get('k').value, v = r.get('v').value;
  if (k === 'type') d.types.add(v.replace(/^https?:\/\/(www\.)?schema\.org\//, 'https://schema.org/'));
  else if (k === 'addrtext') { const m = v.toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/); if (m) d.pc.push(m[0]); }
  else d[k].push(v);
}
const descs = [...D.values()].filter(d => [...d.types].some(t => PLACE.has(t) || ORG.has(t)));
const normName = n => n.toLowerCase().replace(/&/g, 'and').replace(/\b(ltd|limited|plc|llp|the|canary wharf|london|restaurant)\b/g, '').replace(/[^a-z0-9]/g, '');
const normTel = t => { let d = t.replace(/[^\d+]/g, ''); if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('0')) d = '44' + d.slice(1); return d.length >= 11 ? d : null; };
const normSame = u => u.trim().toLowerCase().replace(/^http:/, 'https:').replace('://www.', '://').replace(/\/+$/, '');
for (const d of descs) {
  d.iri = BASE + 'desc/' + createHash('sha1').update(d.page + '\t' + d.node).digest('hex').slice(0, 20);
  d.site = host(d.page); d.kind = [...d.types].some(t => PLACE.has(t)) || d.pc.length || d.lat.length ? 'place' : 'org';
  d.nname = normName(d.name[0] || ''); d.ntel = [...new Set(d.tel.map(normTel).filter(Boolean))];
  d.nsame = [...new Set(d.same.map(normSame))].filter(u => !GENERIC.has(u)); d.npc = [...new Set(d.pc.map(p => p.replace(/\s/g, '').toUpperCase()))];
  d.keys = pageKeys.get(d.page) || [];
}
// key rules: each rule groups descriptions by a key; consecutive members of a group are linked (a chain is enough for the closure)
const keyOf = {
  'iri': d => d.named ? [d.node] : [],
  'site-name': d => !d.nname ? [] : d.kind === 'org' ? [`${d.site}|org|${d.nname}`] : d.npc.map(p => `${d.site}|place|${d.nname}|${p}`),   // places: a chain's branches share a name
  'sameAs': d => d.nsame.map(u => `${d.kind}|${u}`),
  'telephone': d => d.ntel.map(t => `${d.kind}|${t}`),
  'postcode-name': d => d.nname ? d.npc.map(p => `${p}|${d.nname}`) : [],
};
const quads = [], OWL_SAME = F.namedNode('http://www.w3.org/2002/07/owl#sameAs'), par = descs.map((_, i) => i), edgeRules = descs.map(() => new Set());
const find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
const ladder = [];
for (const rule of RULES) {
  const groups = new Map(); descs.forEach((d, i) => { for (const k of keyOf[rule](d)) (groups.get(k) || groups.set(k, []).get(k)).push(i); });
  const G = F.namedNode(BASE + 'coref/rule/' + rule);
  // two places whose postcodes disagree are different branches, whatever phone number or profile they share
  const clash = (a, b) => rule !== 'iri' && descs[a].kind === 'place' && descs[b].kind === 'place' && descs[a].npc.length && descs[b].npc.length && !descs[a].npc.some(p => descs[b].npc.includes(p));
  for (const members of groups.values()) for (let j = 1; j < members.length; j++) {
    const a = members.find((m, i) => i < j && !clash(m, members[j])), b = members[j]; if (a == null) continue;
    quads.push(F.quad(F.namedNode(descs[a].iri), OWL_SAME, F.namedNode(descs[b].iri), G));
    edgeRules[a].add(rule); edgeRules[b].add(rule); par[find(a)] = find(b);
  }
  ladder.push({ after_rule: rule, entities: new Set(descs.map((_, i) => find(i))).size });
}
const groups = new Map(); descs.forEach((d, i) => (groups.get(find(i)) || groups.set(find(i), []).get(find(i))).push(i));
// a page's registry keys belong to a description only when it is the one place described on that page (a branch page);
// a brand page that lists every branch, or the publisher's organisation on every page, says nothing about one building
const placesOnPage = new Map(); for (const d of descs) if (d.kind === 'place') placesOnPage.set(d.page, (placesOnPage.get(d.page) || 0) + 1);
const ownKeys = d => d.kind === 'place' && placesOnPage.get(d.page) === 1 ? d.keys : [];
const entities = [...groups.values()].map((m, n) => {
  const ds_ = m.map(i => descs[i]), regs = [...new Set(ds_.flatMap(d => d.keys))], bld = [...new Set(ds_.flatMap(ownKeys).filter(k => k.startsWith('cwb-')).map(k => k.split('|')[0]))];
  return { id: BASE + 'entity/' + createHash('sha1').update(ds_.map(d => d.iri).sort().join(' ')).digest('hex').slice(0, 16),
    kind: ds_[0].kind, names: [...new Set(ds_.flatMap(d => d.name))].slice(0, 6), sites: [...new Set(ds_.map(d => d.site))],
    members: ds_.map(d => d.iri), rules: [...new Set(m.flatMap(i => [...edgeRules[i]]))], registry_keys: regs, branch_page_buildings: bld,
    conflict: bld.length > 1 ? 'one branch (its own page), more than one registry building' : null };
}).sort((a, b) => b.members.length - a.members.length);
const meta = { generated: new Date().toISOString(), tool: 'cwplans/tools/web-coref.mjs',
  engine: '@factoidal/core ' + JSON.parse(readFileSync(join(TOOLS, '..', '..', 'node_modules', '@factoidal', 'core', 'package.json'), 'utf8')).version,
  rules: RULES, descriptions: descs.length, entities: entities.length, ladder,
  cross_site: entities.filter(e => e.sites.length > 1).length, conflicts: entities.filter(e => e.conflict).length };
writeFileSync(join(OUT, 'sameas.nq.gz'), gzipSync(await serialize(new Dataset(quads), { format: 'nquads' })));
writeFileSync(join(OUT, 'descriptions.json'), JSON.stringify({ meta, descriptions: descs.map(d => ({ iri: d.iri, page: d.page, node: d.node, kind: d.kind, site: d.site,
  name: d.name[0] || null, types: [...d.types].map(t => t.replace('https://schema.org/', '')), telephone: d.ntel, postcode: d.npc, sameAs: d.nsame, registry_keys: d.keys })) }) + '\n');
writeFileSync(join(OUT, 'entities.json'), JSON.stringify({ meta, entities }, null, 1) + '\n');
console.log(JSON.stringify(meta, null, 1));
for (const e of entities.filter(e => e.conflict)) console.log('conflict', e.names[0], e.branch_page_buildings.join(' '), e.sites.join(' '));
