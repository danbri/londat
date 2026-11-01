# Writing reliable, fast KGX SPARQL

Verified 2026-11-01 against @factoidal/core 0.15.0 and 0.28.0. This note separates RDF semantics, query correctness, planner behaviour and measured latency. It does not change production queries or data.

## Start with the actual data shape

Read `kgx/manifest.json`, the relevant graph title/licence, and the existing `kgx/queries/` examples before inventing predicates. Distinguish the full graph export from the browser subset. Discover a known entity's predicates and RDF term types with a bounded query; check IRIs versus literals, datatypes, units, language tags and whether properties sit on a nested node. A zero-row answer can mean a shape or graph-scope mismatch, not absent source data. A date seen in a crawl is not necessarily the fact's validity date. SHACL/ShEx shapes are useful only when their constraints describe the actual input layer/version; publisher markup, normalized canonical data and lifted KGX are distinct layers.

Do not turn a sample or an optional field into a universal shape constraint. Test missing values, repeated properties, multiple language labels, historical records and source duplicates. State the intended result population and expected multiplicity before writing aggregates.

## Graph scope is part of correctness

The default graph is empty for named-graph-only input. Use GRAPH explicitly. Store partitions are separate named graphs, so connected subjects can lie in different graph parts:

```sparql
PREFIX s: <https://schema.org/>
SELECT ?place ?opens WHERE {
  GRAPH ?placeGraph { ?place s:openingHoursSpecification ?hours }
  GRAPH ?hoursGraph { ?hours s:opens ?opens }
}
```

This is the broad cross-part join shape. Use a shared graph variable only when same-graph provenance is intended. When querying selected logical sources, constrain each graph variable to that source's current parts; otherwise a broad cross-graph query can join unrelated versions/sources. Deduplication is a semantic decision: DISTINCT may be correct for entity lists but can hide repeated evidence and is not a universal repair.

Fresh four-quad fixture on both versions: same-GRAPH join returns one row, separate-GRAPH join returns two expected rows, pattern outside GRAPH returns zero. These are standard named-graph semantics, not an engine bug. Fixture and results: `docs/benchmarks/2026-11-01-query-semantics.mjs` and `.jsonl`.

## Query plans and latency

- Bind selective subject/predicate/graph terms when known. Inspect planned blocks/bytes before calling a broad query cheap. A LIMIT bounds returned rows; sorting, aggregates, joins or block loading may still require substantial work.
- Both tested versions still overplan COUNT around a nested SELECT. For a simple unmodified SELECT, count the WHERE group directly. Do not remove DISTINCT, GROUP BY, HAVING, LIMIT/OFFSET or projection semantics merely to avoid the subquery: count the intended entity/group population correctly, or defer an exact count.
- Both versions plan the tested `p|q` alternative and explicit UNION at eight blocks each. The old claim that every alternative path scans every block is not applicable to this fixture on these versions. This does not establish all property paths are equally efficient.
- Both versions retain one block per (predicate, graph) in the tested ibk5 fixture despite batch-bytes, and length-first zone ordering affects exclusion. Query and partition design must consider the actual on-disk layout; small result sets do not imply small reads.
- Use supported `@factoidal/core/engine` and `/store` exports. The old `/bin/engine.mjs` import path is not exported in either package. Handle APIs and stateless APIs have different limits; check the deployed API before copying a CLI recipe.
- Distinguish manifest planning, bytes read, first execution and repeated execution using a prepared/open handle. Include package version, graph generation, query text, browser, caches and service-worker policy in benchmarks.
- Compare result content and multiplicity before speed. Keep deterministic ordering for paged examples, and verify boundary cases. Result-table hashes from the existing four browser examples match across versions; they are not a proof of general SPARQL equivalence.

The existing real-browser benchmark on generation `gen-facf5340c7b1e696` measured first-run medians old/new of 1055/467 ms (tallest), 809/319 ms (graph metadata), 981/474 ms (step-free), 962/456 ms (occupants). Repeats were 15–28 ms and not consistently faster in 0.28. These are local asset measurements with handle/cache reuse, not cold internet latency. See [method and raw evidence](https://github.com/danbri/londat/blob/main/docs/benchmarks/2026-11-01-factoidal-browser.md).

## Version-sensitive correctness

The known-fault checker confirms that the earlier BNODE label/serialization problems are fixed on both versions. Data blank nodes can still be renamed across separate CONSTRUCT outputs; do not join independently returned blank-node labels as stable identities. Keep the project's skolemization rules when persistence requires stable identifiers.

0.15.0 accepts the tested invalid IRI containing multiple fragment separators; 0.28.0 rejects it with `term.invalid-iri`. Do not rely on old permissive parsing. Validate generated IRIs and do not suppress arbitrary parser errors while handling this known case.

Full checker observations, including behaviours that are not faults: `docs/benchmarks/2026-11-01-factoidal-query-checks.txt`. The checker labels STILL/FIXED mechanically; read the accompanying description before treating every STILL as a defect. This run used isolated package aliases, leaving production dependencies unchanged.
