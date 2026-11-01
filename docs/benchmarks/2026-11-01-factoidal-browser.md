# Factoidal browser comparison, 1 November 2026

The knowledge-graph page moves from pinned @factoidal/core 0.15.0 to 0.28.0.
Its previous `l4factoidal-wasm 0.2.0` status was the engine label, not its npm package version.
The page now shows both versions.

## Method

Headless installed Chrome on the owner's Mac, via Playwright 1.56.1. Three fresh browser contexts per engine,
the same committed graph generation `gen-facf5340c7b1e696`, 142,314 quads, 1,046 blocks.
The page, data and engine assets are served locally; jsDelivr requests are fulfilled from the matching official npm
package. Service workers are blocked. Within each context: tallest buildings, graph metadata, step-free facilities,
occupants; each query runs once, then repeats using its open handle. The first-run measurements after tallest
can reuse bytes fetched by earlier queries. These are local first-run/handle-reuse timings, not cold internet downloads.
Boot includes loading engine, manifest, and the first tallest-buildings answer.

All six runs returned identical table text for each query. No page errors. Medians in milliseconds:

| Query | First, 0.15 | First, 0.28 | Repeat, 0.15 | Repeat, 0.28 |
|---|---:|---:|---:|---:|
| Tallest buildings | 1055 | 467 | 21 | 28 |
| Graphs and versions | 809 | 319 | 15 | 15 |
| Step-free facilities | 981 | 474 | 19 | 23 |
| Occupants by building (first 200) | 962 | 456 | 17 | 19 |

Boot through first answer: 2,317 ms -> 1,905 ms. Opening handles improves materially; repeat execution remains
roughly 15–28 ms and is not consistently faster. Keep the browser database; this comparison gives no reason to move it
server-side or replace it. It does not benchmark other places' geographic datasets: these four queries concern the
cwplans knowledge graph, not all Docklandia geometry.

Raw timing text, result hashes and error lists: `2026-11-01-factoidal-browser.json` beside this report.
Reproduce with `tools/benchmark-kg.mjs` (setup at the top of that file); `CHROME_PATH` selects a browser executable.
