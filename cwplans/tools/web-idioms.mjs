// Recognise the descriptive idioms in the web harvest's schema.org data and write the canonical layer, all with
// @factoidal/core (parse, SPARQL SELECT/ASK/CONSTRUCT, ShEx).
//   in:  third_party/cwplans-structured-data/all.nq.gz, idioms/idioms.json, idioms/idioms.shex, idioms/rewrites/*.rq
//   out: idioms/page-idioms.json (per page: idioms, nodes, forms), idioms/summary.json (sites per idiom and form),
//        idioms/canonical.nq.gz (rewritten content idioms, one named graph per page)
//   node magpie/cwplans/tools/web-idioms.mjs [--limit N]
// Skill: cwplans-web-harvest, "Idioms".
import { readFileSync, writeFileSync } from 'fs';
import { gzipSync, gunzipSync } from 'zlib';
import { join } from 'path';
import { createHash } from 'crypto';
import { parse, query, graphs, shexValidate, serialize, Dataset, dataFactory as F } from '@factoidal/core';
import { TOOLS } from './lib.mjs';

const TP = join(TOOLS, '..', '..', '..', 'third_party', 'cwplans-structured-data'), ID = join(TP, 'idioms');
const cat = JSON.parse(readFileSync(join(ID, 'idioms.json'), 'utf8')), shex = readFileSync(join(ID, 'idioms.shex'), 'utf8');
const PFX = Object.entries(cat.prefixes).map(([p, u]) => `PREFIX ${p}: <${u}>`).join('\n') + '\n';
const I = cat.prefixes.i, limit = +(process.argv[process.argv.indexOf('--limit') + 1]) || Infinity;
const host = g => { const m = g.match(/^https?:\/\/web\.archive\.org\/web\/\d+[a-z_]*\/(.*)$/); const u = m ? m[1] : g; return new URL(/^https?:/.test(u) ? u : 'http://' + u).hostname.replace(/^www\./, ''); };
const SCHEMA_ALT = /^https?:\/\/(www\.)?schema\.org\//;   // http://schema.org/, http(s)://www.schema.org/ -> https://schema.org/
// skolemize for the rewrites: each query renames the data's blank nodes with its own prefix, so two CONSTRUCT outputs would not share
// a node (a branch's openingHoursSpecification link would point at nothing); a stable IRI per (page, label) keeps them joined
const GENID = 'https://danbri.github.io/glitchcan-minigam/third_party/cwplans-structured-data/.well-known/genid/';
const skol = (t, g) => t.termType === 'BlankNode' ? F.namedNode(GENID + createHash('sha1').update(g + '\t' + t.value).digest('hex').slice(0, 20)) : t;
const norm = t => t.termType === 'NamedNode' && SCHEMA_ALT.test(t.value) && !t.value.startsWith('https://schema.org/') ? F.namedNode(t.value.replace(SCHEMA_ALT, 'https://schema.org/')) : t;

let t0 = Date.now();
const all = await parse(gunzipSync(readFileSync(join(TP, 'all.nq.gz'))).toString(), { format: 'nquads' });
console.log('parsed', all.toArray().length, 'quads in', Math.round((Date.now() - t0) / 1000), 's');
const rewrites = Object.fromEntries(cat.idioms.filter(d => d.rewrite).map(d => [d.id, readFileSync(join(ID, d.rewrite), 'utf8').replace('#CANDIDATES', d.candidates)]));

const pages = {}, sites = {}, canon = [], st = { pages: 0, nodes: 0, shex: 0, deferred: 0, nsRemapped: 0 };
const bump = (id, form, h) => { const k = form ? `${id}\t${form}` : id; (sites[k] || (sites[k] = new Set())).add(h); };
for (const [g, gd] of graphs(all)) {
  if (st.pages >= limit) break; st.pages++;
  let remapped = 0;
  const quads = gd.toArray().map(q => { const p = norm(q.predicate), o = norm(q.object); if (p !== q.predicate || o !== q.object) remapped++; return F.quad(q.subject, p, o, F.defaultGraph()); });
  // recognition on the page as published (an IRI form must not match a skolemized blank node); rewrites on the skolemized copy
  const ds = new Dataset(quads), sk = new Dataset(quads.map(q => F.quad(skol(q.subject, g), q.predicate, skol(q.object, g), q.graph)));
  st.nsRemapped += remapped;
  const h = host(g), rec = { site: h, idioms: {} };
  if (remapped) rec.schema_namespace_variants = remapped;
  for (const d of cat.idioms) {
    const rows = await query(ds, PFX + `SELECT DISTINCT ?x WHERE { ${d.candidates} }`);
    if (!rows.length) continue;
    const out = { nodes: 0, forms: {} };
    for (const r of rows) {
      const x = r.get('x'); if (!x || x.termType === 'Literal') continue;
      const core = await shexValidate(ds, shex, x, I + d.core); st.shex++;
      if (core === null) { st.deferred++; continue; } if (!core) continue;
      out.nodes++; st.nodes++;
      for (const f of d.forms) { const ok = await shexValidate(ds, shex, x, I + f); st.shex++; if (ok === null) st.deferred++; if (ok) out.forms[f] = (out.forms[f] || 0) + 1; }
      for (const [f, ask] of Object.entries(d.sparql_forms || {})) {
        if (x.termType !== 'NamedNode') {   // ASK cannot bind a blank node from outside: match it by its own triples instead
          const ok = await query(ds, PFX + ask.replace('ASK {', `ASK { ${d.candidates} . `)); if (ok) out.forms[f] = (out.forms[f] || 0) + 1;
        } else if (await query(ds, PFX + ask.replaceAll('?x', `<${x.value}>`))) out.forms[f] = (out.forms[f] || 0) + 1;
      }
    }
    if (!out.nodes) continue;
    rec.idioms[d.id] = out; bump(d.id, null, h); for (const f of Object.keys(out.forms)) bump(d.id, f, h);
    if (rewrites[d.id] && d.id !== 'ChainBranchLink') {
      const c = await query(sk, PFX + rewrites[d.id]);
      for (const q of c.toArray()) canon.push(F.quad(q.subject, q.predicate, q.object, F.namedNode(g)));
    }
  }
  pages[g] = rec;
  if (st.pages % 100 === 0) console.log(st.pages, 'pages', st.shex, 'ShEx checks', Math.round((Date.now() - t0) / 1000), 's');
}
const summary = cat.idioms.map(d => ({ id: d.id, label: d.label, kind: d.kind, sites: sites[d.id]?.size || 0,
  pages: Object.values(pages).filter(p => p.idioms[d.id]).length, nodes: Object.values(pages).reduce((a, p) => a + (p.idioms[d.id]?.nodes || 0), 0),
  forms: Object.fromEntries([...d.forms, ...Object.keys(d.sparql_forms || {})].map(f => [f, sites[`${d.id}\t${f}`]?.size || 0])) }));
const meta = { generated: new Date().toISOString(), tool: 'magpie/cwplans/tools/web-idioms.mjs', engine: '@factoidal/core ' + JSON.parse(readFileSync(join(TOOLS, '..', '..', '..', 'node_modules', '@factoidal', 'core', 'package.json'), 'utf8')).version, stats: st };
writeFileSync(join(ID, 'page-idioms.json'), JSON.stringify({ meta, pages }, null, 0) + '\n');
writeFileSync(join(ID, 'summary.json'), JSON.stringify({ meta, idioms: summary }, null, 1) + '\n');
writeFileSync(join(ID, 'canonical.nq.gz'), gzipSync(await serialize(new Dataset(canon), { format: 'nquads' })));
console.log(JSON.stringify(st)); for (const s of summary) console.log(`${s.id.padEnd(17)} sites ${String(s.sites).padStart(3)} nodes ${String(s.nodes).padStart(5)}  ${JSON.stringify(s.forms)}`);
console.log('canonical quads', canon.length, 'in', Math.round((Date.now() - t0) / 1000), 's');
