// Differential check of the kgx Shardborough store: every query in londat kgx/queries/*.rq, plus cross-subject joins,
// through a store handle and through the in-memory engine on the store's own input (the part versions, meta and log),
// and the joins also on the data with one graph per source. Exits 1 when the store and the in-memory engine disagree.
// The in-memory parse of about 100k quads takes several minutes.
//   node cwplans/tools/check-kgx-store.mjs [--write]   (--write: the result in londat kgx/checks/store-vs-memory.json)
// Skill: cwplans-kgx ("Checks").
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import { join } from 'path';
import { parse, query } from '@factoidal/core';
import { loadEngine } from '@factoidal/core/engine';
import { openStore, openStoreHandle } from '@factoidal/core/store';
import { LONDAT_DIR } from './londat.mjs';

const K = join(LONDAT_DIR, 'kgx'), heads = JSON.parse(readFileSync(join(K, 'heads.json'), 'utf8')).heads;
const vers = readFileSync(join(K, 'log', 'versions.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const cur = new Set(Object.values(heads)), read = v => gunzipSync(readFileSync(join(K, v.file))).toString();
const members = [...vers.filter(v => cur.has(v.partOf)), ...vers.filter(v => v.iri === heads.meta || v.iri === heads.log)].sort((a, b) => a.iri.localeCompare(b.iri));
// the store holds the parts of the heads that have parts (a head kept out of the store, such as model-building-keys, has none)
const stored = Object.values(heads).filter(iri => iri === heads.meta || iri === heads.log || vers.some(v => v.partOf === iri));
const partitioned = members.map(read).join(''), whole = stored.map(iri => read(vers.find(v => v.iri === iri))).join('');
const gen = readFileSync(join(K, 'shardborough', 'CURRENT'), 'utf8').trim();
const inputHash = createHash('sha256').update(partitioned).digest('hex').slice(0, 16);
if ('gen-' + inputHash !== gen) { console.error(`the store (${gen}) was not packed from the current versions (gen-${inputHash}): rebuild first`); process.exit(2); }

const P = 'PREFIX s: <https://schema.org/> PREFIX cwk: <https://danbri.github.io/londat/kgx/vocab#> PREFIX owl: <http://www.w3.org/2002/07/owl#>\n';
const Q = {
  'join, one GRAPH block': P + 'SELECT ?place ?h ?o WHERE { GRAPH ?g { ?place s:openingHoursSpecification ?h . ?h s:opens ?o } }',
  'join, one GRAPH block per subject': P + 'SELECT ?place ?h ?o WHERE { GRAPH ?g1 { ?place s:openingHoursSpecification ?h } GRAPH ?g2 { ?h s:opens ?o } }',
  'one subject, three patterns': P + 'SELECT ?b ?n ?h ?l WHERE { GRAPH ?g { ?b cwk:heightMetres ?h ; s:name ?n ; cwk:levels ?l } }',
  'quads per graph': P + 'SELECT ?g (COUNT(*) AS ?n) WHERE { GRAPH ?g { ?s ?p ?o } } GROUP BY ?g',
};
for (const f of readdirSync(join(K, 'queries')).filter(f => f.endsWith('.rq')).sort()) Q[f] = readFileSync(join(K, 'queries', f), 'utf8');
const term = t => !t ? 'UNDEF' : (t.termType === 'NamedNode' || t.type === 'uri') ? `<${t.value}>` : (t.termType === 'BlankNode' || t.type === 'bnode') ? '_:b'
  : JSON.stringify(t.value) + ((t.language || t['xml:lang']) ? '@' + (t.language || t['xml:lang']) : ((t.datatype?.value || t.datatype) && (t.datatype?.value || t.datatype) !== 'http://www.w3.org/2001/XMLSchema#string') ? '^^' + (t.datatype?.value || t.datatype) : '');
const canon = rows => rows.map(r => JSON.stringify(Object.keys(r).sort().map(k => [k, r[k]]))).sort();
const engine = await loadEngine(), store = openStore(join(K, 'shardborough'));
const dsP = await parse(partitioned, { format: 'nquads' }), dsW = await parse(whole, { format: 'nquads' });
const results = {}; let bad = 0;
for (const [name, q] of Object.entries(Q)) {
  const h = openStoreHandle(engine, store, { sparql: q }), r = h.query(q); h.close();
  const st = canon(r.srj.results.bindings.map(b => Object.fromEntries(Object.entries(b).map(([k, t]) => [k, term(t)]))));
  const mem = async ds => canon((await query(ds, q)).map(b => Object.fromEntries([...b.entries()].map(([k, t]) => [k, term(t)]))));
  const mp = await mem(dsP), mw = name.startsWith('join') ? await mem(dsW) : null;
  const same = st.length === mp.length && st.every((x, i) => x === mp[i]);
  if (!same) bad++;
  results[name] = { store: st.length, memory: mp.length, memory_one_graph_per_source: mw?.length ?? null, identical: same };
  console.log(`${same ? 'same' : 'DIFFERENT'}  ${name}: store ${st.length}, memory ${mp.length}${mw ? `, one graph per source ${mw.length}` : ''}`);
}
const report = { checked: new Date().toISOString(), generation: gen, quads: dsP.size ?? null, engine: '@factoidal/core ' + JSON.parse(readFileSync(new URL('../../node_modules/@factoidal/core/package.json', import.meta.url), 'utf8')).version, queries: results, different: bad };
if (process.argv.includes('--write')) { mkdirSync(join(K, 'checks'), { recursive: true }); writeFileSync(join(K, 'checks', 'store-vs-memory.json'), JSON.stringify(report, null, 1) + '\n'); }
process.exit(bad ? 1 : 0);
