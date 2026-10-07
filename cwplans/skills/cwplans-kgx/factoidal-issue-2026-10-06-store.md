Filed by the owner on 2026-10-06 as https://github.com/danbri/factoidal/issues/697 (this file is the text as posted).

Title: Shardborough ibk5: one block per (predicate, graph), so zone maps only work if the data is split into extra named graphs; zone keys sort by length first; subqueries plan every block; every call re-parses the manifest

Package: @factoidal/core 0.7.1 (npm), Lean engine `l4-assets/l4factoidal.js` (Node 22.22.0, Linux; the same engine in Chromium in a Web Worker).

## First: the answers are correct

This is not a wrong-answer report. On a 107,408-quad store (46 named graphs, 743 blocks, generation gen-f77d3378dffd7b81, public:
https://github.com/danbri/londat/tree/f9081c10c40dd2a62df86db0e2e0b467b6b0ff53/kgx/shardborough) I ran 18 SELECT queries through a store handle, through
the in-memory engine (`parse` + `query`) on the same N-Quads, and through Oxigraph 0.5.11 (pyoxigraph). All 18 gave
identical solution multisets (6,910 rows). That includes a join inside one `GRAPH ?g { … }` block across subjects that
are in different named graphs, which correctly returns fewer rows (130) than the same data with one graph per source
(2,519). A differential test like this (store against in-memory against a reference engine, on data with many graphs
and many blocks) could be a useful regression fixture.

The points below are about block granularity, zone-map order, planning and cost. Together they forced a data change
on our side: we split each source graph into parts with their own graph IRIs to get selective plans, and then every
cross-subject join has to use one `GRAPH` block per subject. That is a change in the data's meaning made only for
performance.

## Repro data (Python 3, no packages)

```python
subs = [f'http://ex.org/thing/{i:05d}' for i in range(4000)]          # all IRIs the same length
def lines(graph_of):
    out = []
    for i, s in enumerate(subs):
        g = graph_of(i)
        out += [f'<{s}> <http://ex.org/name> "thing {i}" <{g}> .',
                f'<{s}> <http://ex.org/size> "{i % 97}"^^<http://www.w3.org/2001/XMLSchema#integer> <{g}> .',
                f'<{s}> <http://ex.org/next> <{subs[(i + 1) % 4000]}> <{g}> .']
    return '\n'.join(sorted(out)) + '\n'
open('one-graph.nq', 'w').write(lines(lambda i: 'http://ex.org/g'))
open('four-graphs.nq', 'w').write(lines(lambda i: f'http://ex.org/g/part{i // 1000}'))
# the same idea with IRIs of different lengths, cut into 4 graphs in plain string order
subs2 = sorted(f'http://ex.org/thing/{i}' for i in range(4000))
out = []
for k, s in enumerate(subs2):
    g = f'http://ex.org/g/part{k // 1000}'
    out += [f'<{s}> <http://ex.org/name> "{s[-6:]}" <{g}> .', f'<{s}> <http://ex.org/size> "{k % 97}"^^<http://www.w3.org/2001/XMLSchema#integer> <{g}> .',
            f'<{s}> <http://ex.org/next> <http://ex.org/thing/{(k + 1) % 4000}> <{g}> .']
open('four-graphs-string-order.nq', 'w').write('\n'.join(sorted(out)) + '\n')
```

```sh
for n in one-graph four-graphs four-graphs-string-order; do
  npx factoidal pack $n.nq store-$n/gen-1 --layout ibk5 && npx factoidal activate store-$n gen-1; done
npx factoidal pack one-graph.nq store-bb/gen-1 --layout ibk5 --batch-bytes 4096
```

```js
// plan.mjs
import { readFileSync } from 'fs';
import { loadL4 } from '@factoidal/core/l4-assets/l4factoidal.js';
const e = await loadL4();
const plan = (store, q) => { const p = e.call('storeQueryPlan', [readFileSync(`${store}/gen-1/manifest.sbm2`).toString('hex'), q]);
  return `blocks ${p.keys.length}, zoneExcluded ${p.zoneExcluded}`; };
console.log('A', plan('store-one-graph', 'SELECT ?g ?p ?o WHERE { GRAPH ?g { <http://ex.org/thing/02500> ?p ?o } }'));
console.log('B', plan('store-four-graphs', 'SELECT ?g ?p ?o WHERE { GRAPH ?g { <http://ex.org/thing/02500> ?p ?o } }'));
console.log('C', plan('store-four-graphs-string-order', 'SELECT ?g ?p ?o WHERE { GRAPH ?g { <http://ex.org/thing/2500> ?p ?o } }'));
const inner = 'SELECT ?s WHERE { GRAPH ?g { ?s <http://ex.org/name> ?o } }';
console.log('D1', plan('store-four-graphs', inner));
console.log('D2', plan('store-four-graphs', `SELECT (COUNT(*) AS ?n) WHERE { { ${inner} } }`));
console.log('D3', plan('store-four-graphs', 'SELECT (COUNT(*) AS ?n) WHERE { GRAPH ?g { ?s <http://ex.org/name> ?o } }'));
```

Output (0.7.1):

```
one-graph: 3 blocks; four-graphs: 12 blocks; one-graph with --batch-bytes 4096 or 65536: 3 blocks
A blocks 3, zoneExcluded 0
B blocks 3, zoneExcluded 9
C blocks 9, zoneExcluded 3
D1 blocks 4, zoneExcluded 0
D2 blocks 12, zoneExcluded 0
D3 blocks 4, zoneExcluded 0
```

## 1. No way to cut a (predicate, graph) into several blocks (feature request)

ibk5 writes one block per predicate per graph (A: 3 blocks for 3 predicates); `--batch-bytes` is ibk4 only and does
not change this (3 blocks). Each block's zone map then covers every subject of that predicate in that graph, so a
constant subject excludes nothing (A). The only way to get selective plans is to put the subjects into more named
graphs (B), which changes the data.

Request: an ibk5 option to cut a (predicate, graph) into several blocks by row count or bytes, in zone-key order, so
zone maps can exclude blocks without new graph IRIs.

Measured on real data (the store above, 107,408 quads), one entity's page (`GRAPH ?g { <iri> ?p ?o }`), blocks only:
with one graph per source (18 graphs, 283 blocks) it plans 61 blocks and 4.9 MB; with each source split into parts of
about 3,000 triples as separate graphs (46 graphs, 743 blocks), 60 blocks and 1.1 MB. Smaller blocks, not fewer, are
what the split buys.

## 2. Zone keys sort by length first (documentation, perhaps design)

The manifest bounds start with a type byte and a 4-byte length, then the UTF-8 text (an IRI of 21 bytes:
`00 15 00 00 00 68 74 74 70 …`). Byte comparison therefore orders by length first. The README says "a subject-grouped
or graph-grouped file gives disjoint ranges per block"; for IRIs of different lengths sorted as strings this is not
true: C excludes 3 of 12 blocks where B (same layout, equal lengths) excludes 9. In our data (parts of about 1,500
triples), parts cut in string order planned 320 of 1,163 blocks for one entity; cut in zone-key order, 55 of 1,164.

Requests: document the key encoding and order (and whether the length is little-endian: then byte order is not
numeric order for lengths of 256 bytes and more); show the full 64-byte bounds in `factoidal inspect` and
`manifest.tsv` (they show 8 bytes); or consider plain lexicographic UTF-8 keys, so a sorted N-Quads file gives disjoint
ranges.

## 3. A subquery plans every block

D2 (a COUNT over a subquery) plans all 12 blocks; the inner query alone (D1) plans 4, and the same pattern without the
subquery (D3) plans 4. On a large store the stateless `storeQuery` then hits the 64-artifact cap, and a handle fetches
the whole store. We count rows for paging this way (`SELECT (COUNT(*) AS ?n) WHERE { { <the user's SELECT> } }`) and had to
rewrite it as a COUNT over the WHERE group. Request: plan through subqueries (the union of the inner plans).

## 4. Every call re-parses the whole manifest

`storeQueryPlan`, `storeOpen` and `storeHandleQuery` all take the manifest as hex and their time grows with it, even
when the handle holds few blocks:

| store | blocks | manifest | plan | open | handle query (54 to 60 blocks held) |
|---|---:|---:|---:|---:|---:|
| public store above (gen-f77d3378dffd7b81) | 743 | 570 KB | 500 ms | 889 ms | 163 ms |
| same data, smaller parts | 1,164 | 890 KB | 1,407 ms | 982 ms | 554 ms |
| same data, 500-triple parts | 3,066 | 2.3 MB | 5,537 ms | 2,648 ms | 2,751 ms |

Request: let a handle keep the parsed manifest (and accept a handle in `storeQueryPlan`), so a query on a handle costs
what its blocks cost.

## 5. Smaller points

- README: `import { loadEngine } from '@factoidal/core/bin/engine.mjs'` fails with ERR_PACKAGE_PATH_NOT_EXPORTED;
  `@factoidal/core/engine` works.
- README: it still says `factoidal pack` exits 3 in the JS package; in 0.7.1 it packs.
- The plan lists `.lgi2` and `.gbi1` sidecars for every block. A handle opened with the blocks only gave the same answers
  on 5 queries (the engine scans instead), and the sidecars added 26 % to 85 % to the bytes. Saying in the README that
  they are optional accelerators would help browser hosts that pay per byte.
- `parse` and `pack` accept an IRI with several `#` (from an unescaped `&#038;` in HTML) without a warning; Oxigraph
  refuses it unless loaded leniently. A count of such terms in the pack output would help.
