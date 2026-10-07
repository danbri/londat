---
name: cwplans-kgx
description: >-
  The cwplans knowledge graph in danbri/londat kgx/ and its public search page: how build-kgx.mjs lifts the core Canary
  Wharf data (cited facts, registry buildings, occupants, the typed CWG directory and hours, the canonical web layer,
  sameAs groups, Living Map mall units and facilities, the OCR'd store guide, pipeline provenance) into immutable graph
  versions; IRIs and vocabulary; the Shardborough store (wire version 10, parts cut in zone-key order, the 64-block cap
  of the stateless call, store handles, the query rule of one GRAPH block per subject, measured plans); the page
  cwplans/kg/ (Lean engine in a Web Worker, blocks only, handles, count then page, ServiceWorker); COTTAS and
  HDT measured and dropped. Reach for it before you add a graph, change an IRI, query the store, or change the page.
---

# The cwplans knowledge graph (kgx)

Owner, 2026-10-06 10:05 UTC, the direction behind it: "We need to start reflecting it all into a knowledge graph
structure. Give me a high level view of what we have. In particular regarding materials not currently exposed in the 3D
UI." So the graph is meant to hold all the project's data, including what the 3D page does not show.
Owner, 2026-10-06: "Make londat tld folder kgx and explore state of npm js Factoidal/core for persistent storage.
Build out a first cut at a persistent knowledge graph for core data we have collected, beginning with Canary Wharf
facts. Also keep nquads copies in filetree alongside hdt or shardborough formats if they work. Make a public search
page that uses ServiceWorker and sparql to cache some/all of this an expose useful queries and views of the data."
Later the same day: "Concentrate on making shardborough work for browser somehow pls", and every pipeline step must be
an operation on immutable named graphs (the `cwplans-dataflow` skill).

- Data: https://github.com/danbri/londat/tree/main/kgx (README, `manifest.json`, `heads.json`, `queries/*.rq`).
- Page: https://danbri.github.io/londat/cwplans/kg/ (`kg/index.html`, `kg/worker.js`, `kg/sw.js`).
- Build: `node cwplans/tools/build-kgx.mjs [--no-store]` (all RDF work with @factoidal/core). Run it twice: the
  second run must print `new: 0` and the same generation. Commit the output (`kgx/`).
- Query in Node: `node cwplans/tools/kgx-query.mjs <file.rq | 'SPARQL'>` (store handle, no block cap).
- Policy, register and activity log: the hub skill `docklands-data-curation`.

## Graphs, IRIs, vocabulary

- **IDs.** Owner, 2026-10-07, answering "the knowledge-graph IRIs still start with
  https://danbri.github.io/glitchcan-minigam/ ... Do you want a londat namespace?": "Use https://kgx.foaf.tv/id/ prefix
  for IDs. i own the domain; nothing is hosted there yet. iDs should be alphanumeric". So every IRI that this project
  mints for the graph is `https://kgx.foaf.tv/id/<local>` (prefix `id:`), `<local>` in `[a-z0-9]+`. An old name maps
  to its ID mechanically: `<local> = CODE[kind] + an(rest)`, where `kind` is the first path segment after the old base,
  `rest` all the segments after it, and `an(s)` is `s` in NFKD with the accents dropped, in lower case, with every
  character other than a-z and 0-9 removed. `cwplans/tools/kgx-ids.mjs`: `kid(kind, ...parts)` mints from the parts of
  the old name, `mapLegacy(iri)` maps an old name and returns any other IRI as it is
  (`node cwplans/tools/kgx-ids.mjs --test`; also in `npm test`). Graph versions, store parts, activities and input
  files are IDs too (`cwplans-dataflow`, the runtime). No blank nodes (the `pipeline` graph is skolemized to
  `id:genidpipeline<sha12>`).
- **Vocabulary.** Owner, 2026-10-07, asked whether the vocabulary terms should also move to kgx.foaf.tv: "move them to
  kgx.foaf.tv? Yes pls. No dereferencing needed yet". So the terms are under `https://kgx.foaf.tv/` too, and keep their
  local names (schema.org first):

  | prefix | namespace now | until 2026-10-07 | used by |
  |---|---|---|---|
  | `cwk:` | `https://kgx.foaf.tv/vocab#` | `https://danbri.github.io/londat/kgx/vocab#` | `build-kgx.mjs`, the four Flow tools, `meta`, `log` |
  | `cwp:` | `https://kgx.foaf.tv/pipeline#` | `https://danbri.github.io/glitchcan-minigam/magpie/cwplans/data-register.json#vocab/` | `pipeline.jsonld` (`check-data-register.mjs`), the web canonical layer (`cwp:hoursText`, `cwp:addressText`) |
  | `i:` | `https://kgx.foaf.tv/idioms#` | `https://danbri.github.io/glitchcan-minigam/third_party/cwplans-structured-data/idioms/idioms.shex#` | the ShEx shapes of `idioms.shex` (no term of it is in kgx) |

  `kgx-ids.mjs`: `VOCAB`, `REGISTER_VOCAB`, `IDIOMS_VOCAB`, and `VOCAB_MOVES` (old namespace → new); `mapLegacy()` gives
  an old term its new IRI, with the same local name. The terms do not resolve (no dereferencing yet; the search page
  treats every IRI under `https://kgx.foaf.tv/` as internal). External IRIs do not change (schema.org, OSM, Wikidata,
  the CWG entity IRIs, GitHub and raw.githubusercontent.com URLs). After the build of 2026-10-07 (vocabulary) no IRI
  under `https://danbri.github.io/londat/kgx/` or `https://danbri.github.io/glitchcan-minigam/` is in `current.nq.gz`
  or the store.
- **Codes.** Things had the old base `https://danbri.github.io/londat/kgx/id/<kind>/`; provenance and store
  `https://danbri.github.io/londat/kgx/<kind>/`.

  | old name | code | ID (examples) |
  |---|---|---|
  | `id/building/<key>`, `…/<key>/geometry`, `…/<key>/occupant/<slug>-<sha>` | none (the key has `cwb`, `osm` or the photo set) | `cwb0413`, `cwb0413geometry`, `osmw204580680` |
  | `id/facility/<uid>`, `id/unit/<uid>` (Living Map) | `lmf`, `lmu` | `lmf1000118219602`, `lmu1002803405427geometry` |
  | `id/storeguide/p<n>/<section>/<name>-<sha>` | `sg` | `sgp1cafesbars640east95bce8d22f6a` |
  | `id/fact/`, `id/thing/`, `id/mall/`, `id/area/` | `fact`, `thing`, `mall`, `area` | `fact010e0b6ece9c`, `mallcabotplace`, `areacanarywharfgeometry` |
  | `id/imagery-source/`, `id/coverage/<run>/<source>/<area>/…`, `id/oam/` | `imagery`, `cov`, `oam` | `imageryeasurvey`, `cov20261006easurveycanarywharflidarcompositedtm1m2022` |
  | `id/photo/`, `id/facade-patch/`, `id/facade-tile/`, `id/facade-atlas/`, `id/model/` | `photo`, `patch`, `tile`, `atlas`, `model` | `photo0b0d171940a878badepicts0`, `atlasdocklands` |
  | `graph/<name>`, `graph/<name>/<hash16>`, `graph/<name>.pNN/<hash16>` | `graph` | `graphfacts`, `graphbuildingsp003fa086f639aa1bdc` |
  | `activity/<hash16>`, `artifact/sha256/<hash>`, `operation/<id>` | `act`, none, `op` | `act017eb7a9ea079a7a`, `sha256<hash>`, `opcomposefacadeatlas` |
  | `genid/pipeline/<sha12>`, `store/<generation>` | `genid`, `store` | `genidpipeline00e257ebfcd9`, `storegen94788565be0fae62` |
  | register: `…/glitchcan-minigam/magpie/cwplans/data-register.json#source/<key>`, `#activity/<id>` | `src`, `tool` | `srcglacimarcgis`, `toolamenduprns` |
  | web harvest: `…/glitchcan-minigam/third_party/cwplans-structured-data/desc/<h>`, `.well-known/genid/<h>`, `idioms/node/<rest>` | `desc`, `genid`, `node` | `desc00f0e211be9b8f433fc7`, `genidb517e85c0c7ab5fa0bd1` |
  | `urn:cwplans:local:<path>` (local files in `pipeline.jsonld`) | `local` | `localdatarawdocklandsosmclipjsongz` |
  | `https://canarywharf.com/<page>/#address` (from `cwg-directory-typed.mjs`) | `addr` | `addrrestaurant640east` |
  | `https://canarywharf.com/<page>/#entity-hours-<Day>-<k>` (`lift-cwg-directory`) | `hours` | `hoursrestaurant640eastfriday0` |

- **Rules (`kgx-ids.mjs`).** A name in an old namespace whose kind has no code throws, so a new kind gets a code on
  purpose. Each run keeps a registry ID → old name: two old names that give one ID throw, with both names (an()
  removes hyphens, so `cwb-0413` and `cwb0413` would collide). A local name that is not `[a-z0-9]+` throws. The ID of
  an ID is itself.
- **Three kinds that the first list of the change did not name** (2026-10-07). This project minted them, and they are
  not vocabulary: `urn:cwplans:local:<path>` (73 local files in `pipeline.jsonld`, made by `check-data-register.mjs`),
  `<page>#address` (344 address nodes, made by `cwg-directory-typed.mjs`, lifted into `cwg`) and
  `<page>#entity-hours-<Day>-<k>` (2,183 opening-hours nodes, made by `lift-cwg-directory`). They got the codes `local`,
  `addr` and `hours`: the smallest change that keeps the rule. The CWG entity IRIs `<page>#entity` stay: they are the
  join key across sources (below).
- **What keeps the old names, and why.** The web-harvest files in `third_party/cwplans-structured-data/`,
  `registry/sources/brands/cwg-directory-typed.nq`, `kgx/log/*.jsonl` and the graph version files written before
  2026-10-07: they are upstream data or history, and a version never changes. The same holds for the old vocabulary
  terms in `idioms.shex`, `idioms.json` (prefix `i:`), `idioms/rewrites/*.rq` (`cwp:`) and `canonical.nq.gz`:
  `web-idioms.mjs` reads the ShEx namespace from `idioms.json`, not from a constant, so nothing there had to change.
  `build-kgx.mjs` maps when it lifts: its quad collector puts every IRI term through `mapLegacy()`, so `lift-activity-log` and `describe-graph-versions` name
  the older activities and versions by their IDs too; the external heads named in the old namespace went through the
  operation `map-legacy-ids` (`cwplans-dataflow`). Literals are not mapped: `cwk:params` of the activities logged
  before 2026-10-07 (the JSON of their parameters, with the old names), and three `s:addressCountry` values of the web
  layer that are the text of a genid IRI (a fault of that layer, open).
- **Readable names.** `an()` removes hyphens and dots, so a graph name or an operation is harder to read in its ID
  (`graphcorefpostcodename`). `meta` gives each graph name its name as `rdfs:label`, and `log` each operation its id;
  the page's views "Graphs and versions" and "Lineage" read the labels.
- Graph names: `facts`, `buildings` (cwb- ids, outline as `geo:asWKT`), `occupants`, `cwg` (typed CWG directory and
  `s:OpeningHoursSpecification` per day with `cwk:opensMinute`/`cwk:closesMinute`), `web`, `coref-<rule>`, `mallmap`
  (`cwk:MallUnit` with outline, `cwk:Facility` points: lifts, escalators, ramps, stairs, entrances, toilets,
  defibrillators), `storeguide` (`cwk:GuideEntry` with `cwk:gridRef`), `pipeline` (pipeline.jsonld lifted),
  `coverage-imagery` (from `tools/probe-imagery-coverage.mjs` through `kgx/external-heads.json`: `cwk:CoverageCount` per
  imagery source and study area), `photos-<set>`, `facade-patches-<set>`, `facade-tiles-<set>` (contributed photos),
  `facade-atlas`, `model-building-keys` (every model building's OSM key; not in the store), `meta`
  (`void:Dataset` per version and part; heads as `id:graph<name> cwk:current <version>`, with the name as
  `rdfs:label`), `log` (the activities).
  Counts: `kgx/README.md`.
- Joins across sources go through `s:sameAs` to the CWG entity IRI (`https://canarywharf.com/<kind>/<slug>/#entity`),
  OSM element URLs and Wikidata items. Mall units join by exact name only, for now.

## The store (Shardborough, `factoidal pack --layout ibk5`)

Build of 2026-10-07 16:50 UTC (vocabulary under `https://kgx.foaf.tv/`; londat `kgx/manifest.json`): 299,829 triples
in 24 head graphs, of which 116,344 quads in the browser store (49 parts, `meta` and `log`; generation
`gen-7d0a65a1b11accc7`, 5,006 files, 19.3 MB); the growth is `log` (10,030 triples, 174 activities) and `meta` (712).
Build of 2026-10-07 15:11 UTC (the first with the IDs): 298,615 triples in 24 head graphs
(22 data graphs, `meta` and `log`), of which 115,130 quads in the browser store (49 parts, `meta` and `log`; 834
blocks, generation `gen-5ad6ded8fc45e17f`, 5,006 files, 19.3 MB; blocks 12.8 MB). The build before it (09:22 UTC, old
names): 294,405 triples, 110,920 quads, 847 blocks, `gen-94788565be0fae62`, 5,084 files, 21.4 MB, blocks 15.0 MB: the
IDs are shorter, the log and the pipeline graph larger. `model-building-keys` (183,485) is a head but not in the store
(`external-heads.json` `store: false`). Each build adds lines to `log/`; the counts grow with every contributed set
(2026-10-06 night: 292,259 triples, 21 graphs, 774 blocks). The table below was measured on an
earlier build (15 graphs, 659 blocks); on the 774-block build the same entity read 60 blocks out and 59 in, about
1.1 MB each (not measured again).

- **Blocks** are cut per predicate per graph. `--batch-bytes` does not change the count. So a big graph gives big
  blocks whose subject ranges cover everything, and zone maps skip nothing.
- **Zone maps** (wire version 10) hold the first 64 bytes of the smallest and largest subject and object key of each
  block. A key is: term type byte (IRI 0x00), UTF-8 length as 4 bytes little-endian, UTF-8 text. Keys compare byte by
  byte, so the order is by length first, not string order. `factoidal inspect` and `manifest.tsv` show only 8 bytes.
- **Parts:** each source version is cut into parts of about 3,000 triples with subjects in zone-key order
  (`partition-by-subject-key`). Measured on the same data, describing one restaurant (`GRAPH ?g { <iri> ?p ?o }`):

  | layout | blocks in store | blocks read | bytes read (blocks only) | plan | open | query |
  |---|---:|---:|---:|---:|---:|---:|
  | 1,500 per part, string order | 1,163 | 320 | 2.4 MB | | | |
  | 500, key order | 3,066 | 54 | 0.28 MB | 5.5 s | 2.6 s | 2.8 s |
  | 1,500, key order | 1,164 | 55 | 0.60 MB | 1.2 s | 0.9 s | 0.4 s |
  | **3,000, key order** | 659 | 56 | 1.09 MB | 0.4 s | 0.9 s | 0.13 s |
  | 5,000, key order | 465 | 56 | 1.68 MB | 0.3 s | 1.1 s | 0.1 s |

  Every engine call parses the whole manifest again (890 KB at 1,500, 500 KB at 3,000), so plan and query times grow
  with the number of blocks. 3,000 is the balance.
- **Query rule: one `GRAPH` block per subject.** Two subjects can be in different parts. Measured:
  `GRAPH ?g { ?place s:openingHoursSpecification ?h . ?h s:opens ?o }` 130 rows; with `GRAPH ?g1 {…} GRAPH ?g2 {…}`
  2,519. With the IDs (2026-10-07) the one-block join gives 1,181 rows, because the shorter hours IDs now fall in the
  parts of their places more often; still not all: the rule stands. There is no default-graph view of the named graphs (a pattern outside `GRAPH` plans no blocks).
  **This is SPARQL, not a Factoidal fault:** a `GRAPH ?g { … }` block matches inside one named graph at a time, and the
  parts are separate named graphs. Checked 2026-10-06 on the store's own input (107,408 quads, 46 graphs): 18 queries
  through the store handle, the in-memory engine and Oxigraph 0.5.11 gave identical rows (6,910); the one-block join
  gives 130 on the parts and 2,519 with one graph per source in all three. The rule is the price of the parts, which
  exist because ibk5 cannot cut one (predicate, graph) into several blocks: one graph per source plans 61 of 283 blocks
  and 4.9 MB for one entity, the parts 60 of 743 and 1.1 MB.
- **Caps:** the stateless `storeQuery` (what `npx factoidal query` uses) reads at most 64 artifacts, 8,388,608 bytes
  and 100,000 rows per call, and refuses a bigger plan ("the plan selects 81 artifacts, the cap is 64"). A **store
  handle** (`storeOpen` / `openStoreHandle`) has no artifact cap: at most 8 handles and 128 MiB held in all
  (Factoidal issue 657). A handle query that needs an artifact it does not hold fails with "needs artifact 'X' …
  reopen the handle with it".
- **Sidecars are optional.** The plan lists `.lgi2` (literal 3-gram index) and `.gbi1` (geometry box index) for every
  block. A handle opened with blocks only gives the same rows (checked on five queries); the engine scans instead.
  Here the sidecars added 26 % (one entity) to 85 % (a name search) to the bytes of the blocks.
- **A subquery plans every block.** `SELECT (COUNT(*) …) WHERE { { SELECT … } }` planned 659 blocks where the inner
  query planned 14: the planner does not look inside a subquery. Count over the WHERE group instead.
- About 20,000 rows in one answer overflow the engine's default stack: page with LIMIT/OFFSET.
- `toCottas` given an N-Quads **string** writes an empty store with no error; given a `Dataset` it keeps every quad.
  COTTAS queries took 40 to 280 s and HDT (`rdf2hdt`, hdt-java-cli 3.0.10) 22 to 690 s against about 1 s in
  Shardborough; both were dropped from kgx (in git history). `tools/check-factoidal.mjs` re-tests the faults.
- Package paths: `@factoidal/core/engine` (`loadEngine`) and `@factoidal/core/store` (`openStore`, `openStoreHandle`);
  the README's `@factoidal/core/bin/engine.mjs` is not exported.

## Checks

- `node cwplans/tools/check-kgx-store.mjs [--write]`: every `queries/*.rq` and the joins through the store and
  through the in-memory engine on the store's own input; exits 1 on any difference; `--write` puts the result in londat
  `kgx/checks/store-vs-memory.json`. It refuses when the store was not packed from the current versions. It reads only the graphs
  the store holds (a head kept out of the store is skipped: with `model-building-keys` the parse took over 15 minutes).
  Several minutes (the in-memory parse; not timed). Results: 2026-10-06 (gen-f330e7f03b06d9d9) 17 of 17 the same;
  2026-10-07 09:35 UTC (gen-94788565be0fae62, 110,920 quads) 17 of 17 the same; 2026-10-07 15:20 UTC
  (gen-5ad6ded8fc45e17f, 115,130 quads, the first build with the IDs) 17 of 17 the same, 9 min 16 s; 2026-10-07 17:00 UTC
  (gen-7d0a65a1b11accc7, 116,344 quads, the vocabulary build) 17 of 17 the same, 9 min 10 s
  (`checks/store-vs-memory.json`). It finds the parts of a head as the outputs of the head's partition activity: the
  `partOf` of a version record names the first head that a part was cut from, and a later head can have a part with
  the same content (seen 2026-10-07: geometry-only parts of `buildings` and `mallmap` did not change with the
  vocabulary; the check then refused, "rebuild first", and `meta` said `dct:isPartOf` the older head; both fixed in
  londat 0bbb5b8). Run it after a rebuild with new data and after a Factoidal upgrade.
- No old names in the store: a SPARQL count through a store handle over every quad (`FILTER` on the four positions;
  run with `node --stack-size=60000` and `ulimit -s unlimited`, because 115,130 solutions overflow the default stack)
  gave 0 quads with a name of the old namespaces in gen-7d0a65a1b11accc7 (old vocabulary terms counted too; 43,380 of
  115,130 quads had one in gen-5ad6ded8fc45e17f; a `COUNT(*)` query needed no larger stack), 0 old names in gen-5ad6ded8fc45e17f, and 110,920 of 110,920 in gen-94788565be0fae62
  (2026-10-07).
- An independent engine as a third opinion: pyoxigraph in a venv, `Store.bulk_load(path=…, format=RdfFormat.N_QUADS,
  lenient=True)`. Strict loading refuses one IRI in our data (F49).
- Reported to Factoidal as https://github.com/danbri/factoidal/issues/697 (store granularity, zone-key order, subqueries,
  manifest cost; text in `factoidal-issue-2026-10-06-store.md`). `tools/check-factoidal.mjs` re-tests its points after
  an upgrade (STILL or FIXED); when one is FIXED, review the parts and the query rule above. Follow-up state on
  2026-10-07: npm still has 0.7.1 as the latest @factoidal/core (published 2026-09-06), and all 12 checks print STILL.
  This project's sessions cannot read or post in danbri/factoidal (not in the session's repositories), so any reply on
  the issue reaches us only through the owner.

## The search page (`kg/`)

- `worker.js` (module Web Worker) imports the Lean engine `l4-assets/l4factoidal.js` from jsDelivr, pinned
  (`@factoidal/core@0.7.1`; the 5.9 MB wasm loads by `locateFile`). It reads `shardborough/CURRENT` and the manifest
  once. Per query: `storeQueryPlan` (cached by query text), fetch the plan's blocks and blob files (not the sidecars),
  6 at a time (on 429 or 5xx it waits Retry-After, else 1, 2, 4, 8 s); answer from a handle that holds them. Up to 4 handles stay open; a query whose blocks one of them holds
  reuses it, else a new handle opens with just its blocks and the oldest closes. On "needs artifact" it opens again
  with that key added.
- Count then page: a SELECT without its own LIMIT whose rows are the solutions of its WHERE group (no DISTINCT,
  REDUCED, aggregate, GROUP BY, HAVING or trailing VALUES) runs `SELECT (COUNT(*) AS ?__count) WHERE <group>`, then
  `… LIMIT 200 OFFSET n`. Other SELECTs ask for 201 rows to know whether a later page exists. The WHERE group is found
  by a brace scan that skips string literals and comments (an IRI cannot hold a brace).
- `sw.js`: engine files and `shardborough/gen-*/` files cache first (a generation never changes); CURRENT, the
  manifest and the page network first. The page tells the service worker which generation to keep.
- Views (`VIEWS` in the page, the same queries as `queries/*.rq`): graphs and versions, lineage (the log), open now,
  mall units, step-free, toilets and facilities, hours CWG against mall map, tallest, cited facts, sameAs, occupants.
- IDs on the page (2026-10-07): the prefix `id:` (added to every query, shown in the cells); an IRI under
  `https://kgx.foaf.tv/` (an ID or a vocabulary term: `cwk:`, `cwp:`, `i:`) opens in the page only, with no outside
  link (nothing is hosted at kgx.foaf.tv yet); any other http(s) IRI also gets ↗. A hash names an ID short: `#e=id:cwb0413`
  (https://danbri.github.io/londat/cwplans/kg/#e=id:cwb0413); a full IRI is URL-encoded
  (`#e=https%3A%2F%2Fcanarywharf.com%2Frestaurant%2Fmanhattan-grill%2F%23entity`). "Graphs and versions" and "Lineage"
  read the `rdfs:label` of graph names and operations (their IDs have no hyphens).
- Measured 2026-10-06, headless Chromium (no WebKit in the container: Safari not tested), local server: start 1.9 s;
  the 11 views 0.8 to 3.6 s, each 10 to 96 blocks and 0.07 to 2.4 MB the first time; a later page of rows 0.2 s;
  one entity (out and in links) 2.8 s, 106 blocks, 1.14 MB; no console errors. Again 2026-10-07 with the IDs
  (`gen-5ad6ded8fc45e17f`): start 2.1 s; the 11 views 0.4 to 3.4 s; a name search ("Jubilee Place", 69 rows) 2.4 s;
  the entities `#e=id:cwb0413`, `#e=id:mallcabotplace` and the Manhattan Grill entity by its encoded IRI 5 to 7 s from a
  cold load; 0 page errors, 0 console errors, 0 failed requests; no ID with an outside link. Headless recipe: give
  Chromium `--proxy-server=$HTTPS_PROXY --proxy-bypass-list=localhost;127.0.0.1` (the engine comes from jsDelivr), not
  Playwright's `proxy` option: Playwright adds `<-loopback>`, which sends the local server's requests to the agent
  proxy (405).
- **raw.githubusercontent.com rate-limits.** The first test of the public page (2026-10-06, 12 fetches at a time, several
  hundred block requests in about a minute) got one 429 on the "Open now" view. Hence 6 at a time and the retry. GitHub
  Pages for londat may avoid this limit (not tested; open item below). Since 2026-10-07 the page reads the store from
  its own site (next item).
- Data base: `?base=` overrides the default `../../kgx/`, the same site as the page (https://danbri.github.io/londat/kgx/;
  until 2026-10-07 `https://raw.githubusercontent.com/danbri/londat/main/kgx/`, which sends
  `Access-Control-Allow-Origin: *`). Test locally with `python3 -m http.server 8080` in the repository root, then
  http://127.0.0.1:8080/cwplans/kg/ (no `?base=` needed).

## Open

- IDs (2026-10-07): nothing is served at https://kgx.foaf.tv/ yet (the owner's domain). When it is, an ID could
  redirect to the page (`https://danbri.github.io/londat/cwplans/kg/#e=id:<local>`); the vocabulary terms
  (`/vocab#`, `/pipeline#`, `/idioms#`) could get a page of their terms (owner: "No dereferencing needed yet").
  `key-model-buildings.mjs` writes `s:sameAs
  https://www.openstreetmap.org/undefined/<id>` for every way (42,244 links: the clip's ways have no `type`): fix it at
  its next run (it needs the local OSM clip and extract), with operation version 5 (version 4 is the vocabulary).
- Step-free routes: the facilities are in; the corridors (indoor lines) and floor links are not yet.
- Units: join to CWG entities by a better key than the exact name (normalised name, mall, level).
- A building-level link from mall units and guide grid squares to registry buildings (position in the outline).
- Turn on GitHub Pages for londat (the owner, once: Settings > Pages > Source: "GitHub Actions"). The page points at
  it since 2026-10-07 (`../../kgx/`). Then measure whether Pages avoids the 429s.
- Ask Factoidal for: a handle that keeps the parsed manifest (each call parses it again), a planner that looks inside
  subqueries, and an export path for `bin/engine.mjs` (or a README fix).
