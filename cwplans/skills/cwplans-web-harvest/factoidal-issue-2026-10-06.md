Title: serialize() silently drops quads with BNODE() blank nodes from CONSTRUCT; their labels are not valid N-Quads

Package: @factoidal/core 0.7.1 (npm). version.json in the package says 0.6.0, gitSha 49f8ca4d70bf57c12fea445611e2b01b067bf6ba, builtAt 2026-08-26T21:45:40Z. Node 22.22.0, Linux.

## What happens

A SPARQL CONSTRUCT that makes blank nodes with `BNODE()` returns quads whose blank node label is `p1__:fxbn<64 hex>`. The label contains a colon.

1. `serialize(dataset, { format: 'nquads' })` (also 'ntriples' and 'turtle') writes no line for any quad that uses such a node. There is no error and no warning. A dataset where every quad uses one gives an empty string.
2. `result.toNQuads()` keeps the quads, but writes the label as `_:p1__:fxbn…`. A colon is not allowed in a BLANK_NODE_LABEL in N-Triples / N-Quads, so the output is not valid N-Quads.
3. `parse()` of that `toNQuads()` output also drops those lines without an error (1 quad back from 2).
4. In a SELECT, a `BNODE()` term has `termType: 'BlankNode'` and `value: '_:fxbn…'`. RDF/JS says `value` is the label without the `_:` prefix.

Blank nodes made with `dataFactory.blankNode('b1')` serialize correctly, so the fault is in the labels that BNODE() makes (or in how CONSTRUCT renames them with the `p1__:` prefix).

## Minimal case

```js
import { parse, query, serialize, Dataset, dataFactory as F } from '@factoidal/core';
const ds = await parse('<http://ex/a> <http://ex/p> "x" .\n<http://ex/b> <http://ex/p> "y" .\n', { format: 'nquads' });
const c = await query(ds, 'CONSTRUCT { ?s <http://ex/q> ?n . ?n <http://ex/v> ?o } WHERE { ?s <http://ex/p> ?o BIND(BNODE() AS ?n) }');
const qs = c.toArray();                                   // 4 quads, subject/object BlankNode 'p1__:fxbn…'
(await serialize(new Dataset(qs), { format: 'nquads' }))  // '' : 0 lines
c.toNQuads()                                              // 4 lines, '_:p1__:fxbn… <http://ex/v> "y" .'
(await serialize(c, { format: 'nquads' }))                // '' : 0 lines

// mixed: only the blank-node quad is lost
const c2 = await query(ds, 'CONSTRUCT { ?s <http://ex/q> ?n . ?s <http://ex/r> "plain" } WHERE { ?s <http://ex/p> ?o BIND(BNODE() AS ?n) }');
(await serialize(new Dataset(c2.toArray()), { format: 'nquads' }))   // 1 line of 2
(await parse(c2.toNQuads(), { format: 'nquads' })).toArray().length  // 1, not 2

// control: works
const ctl = [F.quad(F.namedNode('http://ex/a'), F.namedNode('http://ex/q'), F.blankNode('b1'), F.defaultGraph()),
             F.quad(F.blankNode('b1'), F.namedNode('http://ex/v'), F.literal('x'), F.defaultGraph())];
(await serialize(new Dataset(ctl), { format: 'nquads' }))  // 2 lines
```

## Expected

- BNODE() labels are valid BLANK_NODE_LABELs (no colon), and RDF/JS `value` has no `_:` prefix.
- `serialize()` writes every quad, or throws. It never drops data silently.
- `parse()` reports a line it cannot read, at least in a strict mode.

## Related observation (documentation, not a fault)

Each query result renames the data's own blank nodes with a per-query prefix: on one dataset, a CONSTRUCT for branches gave `_:p20_p0_d0_…jldanon2` and a second CONSTRUCT for hours gave `_:p21_p0_d0_…jldanon2` for the same data node. SPARQL allows this, because blank nodes are scoped to one result. But when two CONSTRUCT outputs are merged, links between them break without a warning. A sentence in the README (skolemize first, or merge in one query) would help. An option to keep the data's labels would also help.

## How it was found

A CONSTRUCT that rewrites text addresses into PostalAddress nodes in danbri/glitchcan-minigam (`magpie/cwplans/tools/web-idioms.mjs`). The canonical output lost every address node. The workaround there is to make the node an IRI from a SHA-1 of the address text: `IRI(CONCAT(base, SHA1(STR(?a))))`.

## Second fault found the same day: toCottas() of an N-Quads string

`toCottas('<http://ex/a> <http://ex/p> "x" <http://ex/g> .\n')` returns 73 bytes: a Parquet file with the s, p, o, g
columns and no rows. No error. `toCottas(await parse(text, { format: 'nquads' }))` keeps every quad and round-trips
through `openCottas`/`queryCottas`. The d.ts types `toCottas(data: DataInput)`, so a string looks allowed.
