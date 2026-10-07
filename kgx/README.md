# kgx: the cwplans knowledge graph

Core data of the Canary Wharf / Docklands scoping project (magpie/cwplans in
[danbri/glitchcan-minigam](https://github.com/danbri/glitchcan-minigam)) as RDF, beginning with the cited Canary Wharf
facts. Built by
[`magpie/cwplans/tools/build-kgx.mjs`](https://github.com/danbri/glitchcan-minigam/blob/master/magpie/cwplans/tools/build-kgx.mjs)
with [@factoidal/core](https://github.com/danbri/factoidal). Search page:
https://danbri.github.io/glitchcan-minigam/magpie/cwplans/kg/

Status: scoping, planning and prototyping. Not reviewed for production use. Each graph states its sources and licence
in the `meta` graph and in `manifest.json`; several hold OpenStreetMap-derived data (© OpenStreetMap contributors,
ODbL 1.0, https://www.openstreetmap.org/copyright) or data crawled for scoping under the owner's rule.

## How it is made: operations on immutable graph versions

Every step is an operation (a tool or task named in a skill) applied to fixed inputs, giving new graph versions.
Nothing is edited in place.

- An input file is named by the SHA-256 of its bytes: `https://danbri.github.io/londat/kgx/artifact/sha256/<hash>`.
- A graph version is named by its content, the RDFC-1.0 SHA-256 of the graph:
  `https://danbri.github.io/londat/kgx/graph/<name>/<first 16 hex>`. Its file is `graphs/<name>/<first 16 hex>.nq.gz`
  (N-Quads, sorted, the version IRI as the graph term). A version never changes.
- A run of an operation is a `prov:Activity`, `https://danbri.github.io/londat/kgx/activity/<16 hex>`, named by the
  hash of (operation, operation version, input IRIs, parameters). The build does not run an activity that is already in
  the log, so the same inputs always give the same outputs.
- `log/activities.jsonl` holds every activity (operation, skill, tool, inputs, parameters, outputs, times);
  `log/versions.jsonl` every graph version (name, hash, triples, file, title, licence).
- `heads.json` maps each graph name to its current version.

The rule and the operations: the `cwplans-dataflow` skill in the main repository.

## Graphs (current versions)

| graph | triples | what |
|---|---:|---|
| `facts` | 3,452 | cited facts about Canary Wharf structures: property, value, unit, reference level, source URL, short quote |
| `buildings` | 17,148 | registry buildings (cwb- ids): name, position, outline as WKT, levels, height, postcodes, OSM and Wikidata links |
| `occupants` | 10,092 | occupants of the buildings: role, level, mall, opening hours, links to OSM, the CWG directory, brands |
| `cwg` | 20,637 | the Canary Wharf Group directory: schema.org types, malls, levels, page dates, weekly opening hours per day |
| `web` | 6,682 | the canonical schema.org layer of the web harvest (branch cards, hours, organisation cards) |
| `coref-<rule>` | 4,417 | owl:sameAs links between web descriptions, one graph per key rule (5 rules) |
| `mallmap` | 19,250 | Living Map data behind map.canarywharf.com: units (name, class, mall, floor, hours, outline) and facilities (lifts, escalators, ramps, stairs, entrances, toilets) |
| `storeguide` | 5,732 | the CWG store guide of 20 July 2026 (OCR): names, sections, grid squares, links to CWG entities |
| `pipeline` | 13,667 | provenance of the earlier cwplans pipeline (`pipeline.jsonld`): each tool as a prov:Activity with the files it used and made, each file tied to its SHA-256 at build time |
| `coverage-imagery` | 1,407 | open imagery coverage of the first study areas (OpenAerialMap, Panoramax, KartaView, EA survey catalogue): counts per source and area, OpenAerialMap images, EA products; made by `tools/probe-imagery-coverage.mjs` and named in `external-heads.json` |
| `facade-patches-cwlibrary` | 171 | rectified facade patches from the contributed Canada Water photos: periods and colours (operation `rectify-facade-patches`) |
| `photos-cwlibrary` | 237 | the contributed photos (CC0) and the buildings identified in them, with evidence (operation `lift-contrib-photos`; see `data/images/contrib/cwlibrary/`) |
| `facade-tiles-cwlibrary` | 77 | the facade tiles cut or drawn from the contributed Canada Water photos (CC0): size on the wall, buildings, method (operation `cut-facade-tiles`) |
| `facade-patches-cwdock` | 241 | rectified facade patches from the second contributed set, round the Canada Water dock (7 October 2026): periods and colours (operation `rectify-facade-patches`) |
| `photos-cwdock` | 1,038 | the second contributed set (20 CC0 photos round the dock, 7 October 2026) and the buildings identified in them, with evidence (operation `lift-contrib-photos`; see `data/images/contrib/cwdock/`) |
| `facade-tiles-cwdock` | 52 | the facade tiles cut from the cwdock photos (CC0): the 17-storey brick tower north-east of Decathlon, Decathlon, Dock Shed; size on the wall, buildings, method (operation `cut-facade-tiles`) |
| `facade-atlas` | 26 | the 3D page's facade atlas, slot by slot (operation `compose-facade-atlas`) |
| `model-building-keys` | 183,485 | the OSM way or relation of every building of the 3D model, with model indices, part parents, registry links and OSM name, address, type, levels, Wikidata (operation `key-model-buildings`). **Not in the browser store** (`external-heads.json`: `store: false`); in `graphs/` and `current.nq.gz` |
| `meta` | 692 | a `void:Dataset` for every version and part: name, RDFC-1.0 hash, triples, licence, generating activity; and the heads (`graph/<name> cwk:current <version>`) |
| `log` | 5,902 | the activity log as RDF (prov:Activity, prov:used, prov:generated, operation, skill, tool) |

Total 294,405 triples, of which 110,920 in the browser store. Things are `https://danbri.github.io/londat/kgx/id/…`; the vocabulary is
`https://danbri.github.io/londat/kgx/vocab#` (prefix `cwk:`), with schema.org first. There are no blank nodes (the
`pipeline` graph is skolemized to `https://danbri.github.io/londat/kgx/genid/pipeline/…`).

## Files

| path | what |
|---|---|
| `graphs/<name>/<hash16>.nq.gz` | every graph version, N-Quads, gzip; the reference copy |
| `graphs/<name>.pNN/<hash16>.nq.gz` | the parts of a version, as stored in Shardborough (below) |
| `current.nq.gz` | the current version of every graph in one file |
| `heads.json`, `manifest.json` | current versions; graph titles, licences, triple and part counts, the store generation |
| `external-heads.json` | graph versions made by other tools' operations (name → version IRI); the build packs them too |
| `log/` | the activity and version logs (JSON lines) |
| `shardborough/` | the Factoidal Shardborough store, wire version 10 (`ibk5`): `CURRENT` names the generation folder |
| `queries/*.rq` | example SPARQL; each answers in about 1 to 3 s through a store handle |

The first layout (one file per graph in `nq/`, plus `cottas/` and `hdt/` copies) is in the git history. COTTAS and HDT
were too slow to query at this size; the measurements are in the `cwplans-kgx` skill.

## The store

Each source version is cut into parts of about 3,000 triples by subject, in the store's zone-key order (term type,
UTF-8 length, text), so each block (one predicate in one part) covers a narrow range of subjects. A query with a
constant subject or object then reads few blocks: "everything about one restaurant" reads 60 of 774 blocks (1.1 MB).
The store's graph IRIs are the parts (`graph/cwg.p03/<hash16>`); `meta` says which version each part belongs to.

**Query rule:** write one `GRAPH` block per subject. Two subjects can be in different parts, so
`GRAPH ?g { ?place s:openingHoursSpecification ?h . ?h s:opens ?o }` misses rows that
`GRAPH ?g1 { ?place s:openingHoursSpecification ?h } GRAPH ?g2 { ?h s:opens ?o }` finds (measured on this store: 130
rows against 2,519).

    node magpie/cwplans/tools/kgx-query.mjs ../londat/kgx/queries/open-at.rq     # in the main repository

`npx factoidal query kgx/shardborough '…'` works too, but it is the stateless call: it refuses a plan above 64
blocks. `kgx-query.mjs` opens a store handle, which has no block cap (only 128 MiB held in all).
