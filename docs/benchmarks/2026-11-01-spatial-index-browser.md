# Browser spatial-index check — 1 November 2026

A standalone headless Chrome run confirms the previous Node finding: **GBI1 gives large execution gains in a geometry-only persistent store, but loading those indexes into the current mixed KG store does not remove its broad-plan fallback.** This adds browser execution and local HTTP transfer measurements; it changes no production index policy.

## Method

Headless Chrome; official local package aliases; persisted store artifacts served over loopback HTTP; HTTP cache disabled and service workers blocked. Engine boot/manifest inspect shared per version/store. One fresh handle per case plus one repeated query. Local transfer times, not WAN/cold-disk measurements.

Browser: Chrome 156.0.8078.76. Official package aliases: 0.15.0 and 0.28.0. Current generation: `gen-facf5340c7b1e696`. Geometry diagnostic: the existing temporary `gen-geometry` store from the preceding benchmark, containing the same 2,556 WKT rows from `kgx/current.nq.gz`.

Each engine version has a fresh browser context. The harness uses the same WASM store operations as the knowledge-graph worker, but runs them in a standalone browser page. It does not test the application UI, worker scheduling, pagination/count rewriting, browser offline behaviour or WAN downloads. Engine startup and manifest setup are shared and reported separately. Every case opens a fresh handle, executes once, then repeats once. Browser HTTP cache is disabled, service workers are blocked, local files are served without gzip or a cache policy that could hide transfers. Fetches run six at a time, as in the production worker. OS filesystem cache is uncontrolled.

This is one trial per case, not a statistical benchmark. A focused Factoidal source build started near the end of the run and may have overlapped the final samples; CPU load was not controlled, so absolute timings remain exploratory. Index-mode order is scan then indexed. The checks preserve complete result multiplicity and require identical sorted hashes across both modes, versions and stores. Handle envelopes verify decoded-index counts: five for mixed, three for geometry-only, zero for scan. The miss query returns zero rows.

## Results

Milliseconds. Plan→first includes planning, fetching/concatenating artifacts, handle opening and first execution; it excludes the shared engine boot and manifest setup.

| Version | Store | Query | Rows | First scan / indexed | Repeat scan / indexed | Plan→first scan / indexed |
|---|---|---|---:|---:|---:|---:|
| 0.15.0 | mixed | intersects-local | 781 | 2029 / 1962 | 2116 / 2094 | 11549 / 10283 |
| 0.15.0 | mixed | intersects-miss | 0 | 3191 / 4017 | 3617 / 4090 | 11846 / 14427 |
| 0.15.0 | geometry | intersects-local | 781 | 2147 / 99 | 1885 / 98 | 2485 / 406 |
| 0.15.0 | geometry | intersects-miss | 0 | 2674 / 22 | 3124 / 26 | 2982 / 371 |
| 0.28.0 | mixed | intersects-local | 781 | 2558 / 2548 | 2345 / 2825 | 7994 / 7340 |
| 0.28.0 | mixed | intersects-miss | 0 | 4236 / 4047 | 4059 / 4145 | 10537 / 14442 |
| 0.28.0 | geometry | intersects-local | 781 | 2170 / 132 | 2113 / 130 | 2421 / 384 |
| 0.28.0 | geometry | intersects-miss | 0 | 3468 / 25 | 3555 / 24 | 3730 / 313 |

## Loading and interpretation

The mixed store plans 1,046 blocks and reads 15,213,369 bytes without sidecars, or 15,320,854 bytes with the five relevant geometry indexes. The isolated store plans three blocks and reads 922,029 or 1,028,240 bytes. These are response body bytes; HTTP overhead and engine/manifest setup are additional.

The browser result does not justify adding every sidecar to the production worker. It supports fixing the spatial FILTER artifact plan first, then loading eligible geometry indexes selectively and measuring a real-page end-to-end workload. A geometry-only collection is another possible route, but this diagnostic is not a deployment of one: it uses different graph partitioning, and cross-graph/source semantics must be preserved deliberately.

No new timing here is a rerun of the earlier 27-second query. These tests use explicit intersection queries, local HTTP delivery, cache disabled and a separate harness. The original query text and its original network/cache state remain a separate measurement question.

## Evidence and reproduction

- [Raw browser measurements](https://github.com/danbri/londat/blob/main/docs/benchmarks/2026-11-01-spatial-index-browser.json)
- [Browser harness](https://github.com/danbri/londat/blob/main/tools/benchmark-spatial-browser.mjs)
- [Persistent-store benchmark and temporary-store preparation](https://github.com/danbri/londat/blob/main/docs/benchmarks/2026-11-01-spatial-index.md)

```sh
node tools/benchmark-spatial-browser.mjs /absolute/path/to/londat /absolute/path/to/aliases/node_modules /absolute/path/to/geometry-store /tmp/spatial-browser.json
```

The harness uses installed Chrome by default; `CHROME_PATH` selects another executable. It serves existing package and store bytes over an ephemeral loopback port, blocks service workers, checks full result hashes, records browser errors and shuts down its browser/server. It does not install dependencies or modify source data.
