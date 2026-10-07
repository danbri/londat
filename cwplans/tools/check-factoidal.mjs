// Re-test the known @factoidal/core faults and behaviours this project works around. Prints each one as STILL or
// FIXED, so after a Factoidal upgrade you know which workarounds can go. No network; the store checks pack small stores
// in a temporary folder and remove it.
//   node cwplans/tools/check-factoidal.mjs
// Skills: cwplans-web-harvest, "Factoidal notes" (issue text skills/cwplans-web-harvest/factoidal-issue-2026-10-06.md);
// cwplans-kgx (store checks: https://github.com/danbri/factoidal/issues/697).
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { loadL4 } from '@factoidal/core/l4-assets/l4factoidal.js';
import { parse, query, serialize, toCottas, openCottas, queryCottas, closeCottas, Dataset, dataFactory as F } from '@factoidal/core';
import { TOOLS } from './lib.mjs';

const pkg = JSON.parse(readFileSync(join(TOOLS, '..', '..', 'node_modules', '@factoidal', 'core', 'package.json'), 'utf8'));
console.log('@factoidal/core', pkg.version);
const lines = s => s.trim().split('\n').filter(Boolean).length;
const ds = await parse('<http://ex/a> <http://ex/p> "x" .\n', { format: 'nquads' });
const c = await query(ds, 'CONSTRUCT { ?s <http://ex/q> ?n . ?s <http://ex/r> "plain" } WHERE { ?s <http://ex/p> ?o BIND(BNODE() AS ?n) }');
const qs = c.toArray(), bn = qs.find(q => q.object.termType === 'BlankNode')?.object;
const checks = [];
checks.push(['BNODE() label is not a valid N-Quads label (has a colon)', /:/.test(bn?.value || '')]);
checks.push(['serialize() drops quads with a BNODE() blank node', lines(await serialize(new Dataset(qs), { format: 'nquads' })) < qs.length]);
let reparsed = null; try { reparsed = (await parse(c.toNQuads(), { format: 'nquads' })).toArray().length; } catch { reparsed = -1; }
checks.push(['parse() of toNQuads() output drops lines without an error', reparsed !== qs.length]);
const sel = await query(ds, 'SELECT ?n WHERE { ?s <http://ex/p> ?o BIND(BNODE() AS ?n) }');
checks.push(['a SELECT BNODE() term value starts with "_:"', String(sel[0]?.get('n')?.value).startsWith('_:')]);
// behaviour, not a fault: the data's own blank nodes get a new name in each query result
const d2 = new Dataset([F.quad(F.namedNode('http://ex/a'), F.namedNode('http://ex/h'), F.blankNode('b1'), F.defaultGraph()), F.quad(F.blankNode('b1'), F.namedNode('http://ex/v'), F.literal('1'), F.defaultGraph())]);
const r1 = (await query(d2, 'CONSTRUCT { ?a <http://ex/h> ?b } WHERE { ?a <http://ex/h> ?b }')).toArray()[0]?.object.value;
const r2 = (await query(d2, 'CONSTRUCT { ?b <http://ex/v> ?v } WHERE { ?b <http://ex/v> ?v }')).toArray()[0]?.subject.value;
checks.push(['blank nodes from the data are renamed per query (two CONSTRUCT outputs do not share nodes; skolemize first)', r1 !== r2]);
checks.push(['a query without GRAPH matches only the default graph', (await query(await parse('<http://ex/a> <http://ex/p> "x" <http://ex/g> .\n', { format: 'nquads' }), 'SELECT * WHERE { ?s ?p ?o }')).length === 0]);
const nq4 = '<http://ex/a> <http://ex/p> "x" <http://ex/g> .\n';
const cs = await toCottas(nq4), hs = await openCottas(cs); const nStr = (await queryCottas(hs, 'SELECT * WHERE { GRAPH ?g { ?s ?p ?o } }')).length; await closeCottas(hs);
checks.push(['toCottas() of an N-Quads string writes an empty store (pass a parsed Dataset)', nStr === 0]);
// store behaviours of issue 697 (small versions of its repro): 400 subjects, 3 predicates
const tmp = mkdtempSync(join(tmpdir(), 'factoidal-check-')), bin = join(TOOLS, '..', '..', 'node_modules', '.bin', 'factoidal');
const nq = (subs, graphOf) => subs.flatMap((s, i) => [`<${s}> <http://ex.org/name> "n${i}" <${graphOf(i)}> .`, `<${s}> <http://ex.org/size> "${i % 7}" <${graphOf(i)}> .`,
  `<${s}> <http://ex.org/next> <${subs[(i + 1) % subs.length]}> <${graphOf(i)}> .`]).sort().join('\n') + '\n';
const fixed = Array.from({ length: 400 }, (_, i) => `http://ex.org/thing/${String(i).padStart(3, '0')}`), varied = Array.from({ length: 400 }, (_, i) => `http://ex.org/thing/${i}`).sort();
const stores = { one: [fixed, () => 'http://ex.org/g'], four: [fixed, i => `http://ex.org/g/p${i / 100 | 0}`], strings: [varied, i => `http://ex.org/g/p${i / 100 | 0}`] };
for (const [n, [subs, g]] of Object.entries(stores)) { writeFileSync(join(tmp, n + '.nq'), nq(subs, g));
  execFileSync(bin, ['pack', join(tmp, n + '.nq'), join(tmp, n, 'gen-1'), '--layout', 'ibk5', ...(n === 'one' ? ['--batch-bytes', '4096'] : [])], { stdio: 'ignore' }); }
const l4 = await loadL4(), plan = (n, q) => l4.call('storeQueryPlan', [readFileSync(join(tmp, n, 'gen-1', 'manifest.sbm2')).toString('hex'), q]);
const blocks = n => readdirSync(join(tmp, n, 'gen-1')).filter(f => f.endsWith('.ibk5')).length;
checks.push(['#697: ibk5 makes one block per (predicate, graph); --batch-bytes does not cut it', blocks('one') === 3]);
const zB = plan('four', 'SELECT * WHERE { GRAPH ?g { <http://ex.org/thing/250> ?p ?o } }').zoneExcluded, zC = plan('strings', 'SELECT * WHERE { GRAPH ?g { <http://ex.org/thing/250> ?p ?o } }').zoneExcluded;
checks.push([`#697: zone keys sort by length first (string-ordered parts of IRIs of different lengths overlap: ${zC} blocks skipped against ${zB})`, zC < zB]);
const inner = 'SELECT ?s WHERE { GRAPH ?g { ?s <http://ex.org/name> ?o } }';
checks.push(['#697: a COUNT over a subquery plans every block', plan('four', `SELECT (COUNT(*) AS ?n) WHERE { { ${inner} } }`).keys.length > plan('four', inner).keys.length]);
rmSync(tmp, { recursive: true });
let exported = true; try { await import('@factoidal/core/bin/engine.mjs'); } catch { exported = false; }
checks.push(['#697: the README import path @factoidal/core/bin/engine.mjs is not exported (use @factoidal/core/engine)', !exported]);
checks.push(['#697: parse() accepts an IRI with several "#" without a warning', (await parse('<http://ex/a> <http://ex/p> <http://ex/x#a#b> .\n', { format: 'nquads' })).toArray().length === 1]);
for (const [what, still] of checks) console.log(still ? 'STILL ' : 'FIXED ', what);
