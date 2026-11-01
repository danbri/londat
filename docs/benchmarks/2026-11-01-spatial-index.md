# Shardborough spatial-index benchmark — 1 November 2026

GBI1 works and can substantially accelerate spatial predicates. **Loading it into the current mixed KG store did not give a consistent query speed-up.** The spatial queries plan all 1,046 blocks; a geometry-only comparison demonstrates the benefit when that mixed-predicate fallback is removed. Production index loading is unchanged.

## What was measured

Official Factoidal packages 0.15.0 and 0.28.0, running their WASM engine in Node on the owner’s Mac. Same persisted Londat generation `gen-facf5340c7b1e696`, 142,314 quads. Operations are the browser worker’s `storeQueryPlan`, `storeOpen`, `storeHandleQuery` and `storeHandleClose`. This uses actual persistent artifacts, not reconstruction of the full store as an in-memory RDF Dataset.

The main-store comparison has one fresh handle per query/version/index mode, followed by one repeated query on that handle. The isolated comparison has two trials, with index-mode order alternated. Reported medians are exploratory; there are no confidence intervals. Final suites ran sequentially, without a second benchmark process competing for CPU. OS file caching is uncontrolled.

“Plan→first” includes planning, local filesystem read and concatenation, handle open/index decode and first execution. It excludes engine startup and the shared manifest read/inspection. Repeat queries reuse an open handle. These are **not browser/network timings or a rerun of the earlier 27-second query**.

Queries: local polygon intersection; local polygon containment; intersection with a Berlin-area box (empty result); disjoint as a non-indexable control. They select all matching geometry IDs, with no LIMIT that could conceal a slow scan or result mismatch. Every complete sorted result-multiset hash agrees across index modes, trials, engine versions and the two data representations. Hashing preserves duplicate bindings. This tests equality with the scan baseline, not independent proof of geometric correctness.

## Current mixed KG store

Only the five GBI1 sidecars for `geo:asWKT` are loaded in indexed mode. Handle envelopes verify five decoded geo indexes versus zero. Other spatial sidecars and all text indexes are excluded. Both modes retain the same planned data blocks and blobs.

Milliseconds; scan / indexed:

| Version | Query | Rows | First query | Repeat query | Plan→first |
|---|---|---:|---:|---:|---:|
| 0.15.0 | intersects-local | 781 | 1941 / 1925 | 2213 / 1705 | 7369 / 7770 |
| 0.15.0 | within-local | 717 | 1542 / 1762 | 1769 / 1348 | 6997 / 7256 |
| 0.15.0 | intersects-miss | 0 | 2924 / 3431 | 3196 / 2947 | 8906 / 10364 |
| 0.15.0 | disjoint-control | 1775 | 1853 / 2056 | 2041 / 1867 | 7853 / 8417 |
| 0.28.0 | intersects-local | 781 | 1940 / 2547 | 1951 / 2099 | 5251 / 5976 |
| 0.28.0 | within-local | 717 | 1433 / 1422 | 1468 / 1686 | 5199 / 4706 |
| 0.28.0 | intersects-miss | 0 | 2813 / 2783 | 3135 / 2762 | 5958 / 5860 |
| 0.28.0 | disjoint-control | 1775 | 2187 / 2169 | 1971 / 2053 | 5635 / 5586 |

Both modes plan all 1,046 blocks. Scan reads 15,213,369 bytes; adding the five geometry indexes reads 15,320,854 bytes (107,485 extra). Handle opening/materialization dominates much of the initial cost. Small differences in this single-trial mixed-store comparison are not evidence of a systematic improvement.

The geometry-only triple query without a FILTER plans five blocks. Adding the spatial function causes the broad plan. Local source inspection is consistent with the missing acceleration: `GeoIndexPlan` recognizes one filtered triple, optionally inside GRAPH; `StoreHandles.restricted?` abandons candidate filtering if any planned artifact has another predicate. A mixed full-manifest plan therefore falls back even with GBI1 loaded. This is a follow-up engine/planner issue to investigate, not a reason to fetch all 1,046 spatial sidecars.

## Geometry-only persistent comparison

For this diagnostic, the 2,556 `geo:asWKT` rows were extracted from the existing `kgx/current.nq.gz` export and packed into a **temporary** IBK5 store using 0.28.0. Both engine versions then queried the same temporary store. It has three data blocks, unlike the five geometry blocks in the production browser store; graph identities/partitioning follow the export. Consequently this is not a controlled measurement of partition changes alone. The index-versus-scan comparison within each store is controlled. The selected geometry-ID result multisets match the production query results exactly.

Milliseconds; medians of two trials, scan / indexed:

| Version | Query | Rows | First query | Repeat query | Plan→first |
|---|---|---:|---:|---:|---:|
| 0.15.0 | intersects-local | 781 | 1991 / 108 | 1960 / 107 | 2378 / 444 |
| 0.15.0 | within-local | 717 | 1722 / 429 | 1266 / 474 | 2008 / 722 |
| 0.15.0 | intersects-miss | 0 | 2627 / 21 | 2809 / 60 | 2983 / 352 |
| 0.15.0 | disjoint-control | 1775 | 1579 / 1629 | 1669 / 1670 | 1841 / 1957 |
| 0.28.0 | intersects-local | 781 | 1616 / 88 | 1532 / 88 | 1838 / 253 |
| 0.28.0 | within-local | 717 | 1100 / 432 | 1330 / 429 | 1286 / 606 |
| 0.28.0 | intersects-miss | 0 | 2771 / 19 | 2613 / 19 | 2971 / 187 |
| 0.28.0 | disjoint-control | 1775 | 1723 / 1492 | 1544 / 1501 | 1873 / 1653 |

The isolated scan loads 922,029 bytes; indexes raise that to 1,028,240 bytes (106,211 extra, about 11.5%). Handle envelopes confirm three decoded GBI1 indexes in indexed mode, zero in scan mode. `sfDisjoint` intentionally falls back; index loading does not promise acceleration for all spatial functions.

## Query shapes and implications

The tested index-recognized shape is a single fixed-predicate triple, with the function filter inside its GRAPH block:

```sparql
PREFIX geo:<http://www.opengis.net/ont/geosparql#> PREFIX geof:<http://www.opengis.net/def/function/geosparql/> SELECT ?geometry WHERE { GRAPH ?g { ?geometry geo:asWKT ?wkt FILTER(geof:sfIntersects(?wkt,"POLYGON((-0.03 51.5,-0.02 51.5,-0.02 51.51,-0.03 51.51,-0.03 51.5))"^^geo:wktLiteral)) } }
```

The spatial window uses longitude–latitude WKT coordinates. Further joins, dynamic geometries, distance/nearest-neighbour functions, arbitrary property paths and Jena-specific extension syntax are outside this experiment. A single outer FILTER around GRAPH is not the same algebra shape for the current candidate matcher. A preliminary outside-FILTER investigation was interrupted; its timings are excluded from these final tables.

Recommended next step: investigate safe predicate pruning for the geof FILTER plan, or explicitly route eligible single-predicate spatial queries to a geometry collection. Then benchmark in Chrome with index bytes, network/cache effects, handle opening and result equality included. Do not switch every query to fetching all sidecars on the strength of the isolated speed-up. No current application, source data or package pin was changed for this benchmark.

Local source references: [GeoIndexPlan matcher](https://github.com/danbri/factoidal-core/blob/main/formal/lean4/L4Factoidal/Storage/GeoIndexPlan.lean) and [store-handle candidate fallback](https://github.com/danbri/factoidal-core/blob/main/formal/lean4/Wasm/Ops/StoreHandles.lean). The source explains a mechanism consistent with the measured fallback; this benchmark does not patch or prove a fix for it.

## Evidence and reproduction

- [Main-store measurements](https://github.com/danbri/londat/blob/main/docs/benchmarks/2026-11-01-spatial-index.json)
- [Geometry-only measurements](https://github.com/danbri/londat/blob/main/docs/benchmarks/2026-11-01-spatial-index-geometry.json)
- [Harness](https://github.com/danbri/londat/blob/main/tools/benchmark-spatial.mjs)

With installed aliases `factoidal-old@npm:@factoidal/core@0.15.0` and `factoidal-new@npm:@factoidal/core@0.28.0`:

```sh
TRIALS=1 node tools/benchmark-spatial.mjs /absolute/path/to/londat /absolute/path/to/aliases/node_modules /tmp/spatial-main.json
```

To reproduce the diagnostic, decompress `kgx/current.nq.gz`, select lines with the exact predicate `<http://www.opengis.net/ont/geosparql#asWKT>`, and save them to a temporary N-Quads file. Use the 0.28.0 CLI `pack input.nq /tmp/geometry-store/gen-geometry --layout ibk5`, then `activate /tmp/geometry-store gen-geometry`. Run the same harness with `STORE_DIR=/tmp/geometry-store TRIALS=2`. Raw query texts, result hashes, decoded-index counts, planned blocks, byte counts and separate stage times are retained in the JSON evidence.
