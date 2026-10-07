---
name: cwplans-dataflow
description: >-
  The rule for all cwplans cleanup, pipeline and normalisation work: express it and log it as operations (tools or
  tasks named in skills) applied to immutable named graphs, giving new immutable graph versions. How the kgx runtime
  (magpie/cwplans/tools/kgx-ops.mjs, Flow) names inputs (SHA-256), graph versions (RDFC-1.0 hash), activities (hash of
  operation, version, inputs, parameters), memoises runs, writes the logs and heads; the operations that exist; when to
  bump an operation version; the idempotence test; the faults met (a log that describes its own store, a regex that cut
  literals). Reach for it before you add a step to build-kgx, write a tool that cleans or joins data for the graph, or
  change an operation.
---

# Dataflow: operations on immutable named graphs

Owner, 2026-10-06: "Ok any cleanup, data pipeline and normalization work you do or did MUST be expressed and logged in
terms of FP-friendly operations on named graphs that (a) are the operations of tools/tasks from skills, upon static
unchanging input named graphs. So a kind of dataflow compositing architecture."

So, for every step that changes data on its way into the knowledge graph:

1. The inputs are fixed: a file named by the SHA-256 of its bytes, or a graph version named by its content.
2. The step is an **operation**: `{ id, version, skill, tool, about }`. `skill` names the skill that explains it,
   `tool` the file that runs it. The body is a function of its inputs and parameters only: no clock, no network, no
   reading of files that are not inputs.
3. The outputs are new graph versions. Nothing is edited in place; a fix gives a new version, and the old one stays.
4. The run is logged as a `prov:Activity` with its inputs, parameters and outputs.

Data: https://github.com/danbri/londat/tree/main/kgx (README). Graph, store and page: the `cwplans-kgx` skill.

## The runtime (`tools/kgx-ops.mjs`)

`new Flow(outDir)` reads `log/activities.jsonl` and `log/versions.jsonl` if they exist.

| call | does |
|---|---|
| `flow.file(path, label)` | an input file: `{ iri: kgx/artifact/sha256/<hash>, sha256, bytes }` |
| `flow.run(op, inputs, params, body)` | the activity IRI is `kgx/activity/<sha256(JSON [op.id, op.version, input IRIs, params])[0:16]>`. If the log has it and every output file exists, returns those versions without running `body`. Else runs `body(params)`, which returns `{ <name>: { quads, about } }` or `{ <name>: { lines, about } }`, writes each output version and appends the activity. |
| `flow.version(name, quads, about)` | canonical N-Triples lines (Factoidal `serialize`, unique, sorted), their hash, then `write` |
| `flow.versionLines(name, lines, about)` | the same from lines that are already canonical (a sorted subset of canonical lines is canonical) |
| `flow.read(v)` | the version's N-Quads text |

- Version IRI `kgx/graph/<name>/<hash16>`, file `graphs/<name>/<hash16>.nq.gz`, graph term = version IRI.
- Hash: RDFC-1.0 SHA-256 (`@factoidal/core/fn` `hash`) when the graph has blank nodes; else the SHA-256 of the sorted
  unique N-Triples lines plus a final newline, which is the same value (checked on three graphs) and takes 4 to 45 ms
  against 1 to 12 s. `canonical()` throws if `serialize()` lost or merged quads (Factoidal drops `BNODE()` blank
  nodes; see `cwplans-web-harvest`, "Factoidal notes").
- `flow.used` lists the activities this run touched; `flow.ran` the ones it ran. `build-kgx.mjs` prints both
  (`activities_this_run`, `new`).

## Operations now (`build-kgx.mjs`)

| operation | version | skill | inputs → outputs |
|---|---|---|---|
| `lift-cited-facts`, `lift-registry-buildings`, `lift-registry-occupants`, `lift-cwg-directory`, `lift-web-canonical`, `lift-coref`, `lift-mallmap`, `lift-store-guide` | 1 | cwplans-kgx | source files → `facts`, `buildings`, `occupants`, `cwg`, `web`, `coref-<rule>`, `mallmap`, `storeguide` |
| `lift-pipeline-provenance` | 1 | cwplans-kgx | `pipeline.jsonld` and every file it names that is present → `pipeline` (blank nodes skolemized; each file tied to its SHA-256 by `cwk:contentAtBuild`) |
| `partition-by-subject-key` | 4 | cwplans-dataflow | one version → parts `<name>.pNN` of about 3,000 triples, subjects in Shardborough zone-key order |
| `describe-graph-versions` | 1 | cwplans-dataflow | all versions and parts → `meta` |
| `lift-activity-log` | 1 | cwplans-dataflow | the log (less log lifts and packs) → `log` |
| `pack-shardborough` | 1 | cwplans-kgx | parts + `meta` + `log` → a store generation, `gen-<sha256(store input)[0:16]>` |
| `lift-imagery-coverage` | 1 | docklands-data-curation | coverage answer files (`tools/probe-imagery-coverage.mjs`) → `coverage-imagery` |
| `rectify-facade-patches`, `lift-contrib-photos` (2), `cut-facade-tiles` | 1 | docklands-data-curation | contributed photos + photos.json (`tools/contrib-photos.mjs`) → `facade-patches-<set>`, `photos-<set>`, `facade-tiles-<set>` |
| `key-model-buildings` | 2 | docklands-3d-page | area.js + the OSM clip + the Greater London extract + atlas.json → `model-building-keys` (not in the store) and its projection `docklands/data/building-keys.json` |
| `compose-facade-atlas` | 1 | docklands-3d-page | registry atlas + `facade-tiles-*` + `model-building-keys` + area.js → `facade-atlas` and `docklands/data/tex/facades.jpg/.json` |

**Composition across tools.** A tool other than `build-kgx.mjs` runs its own operations with a `Flow` on the same
londat `kgx/` folder (same log) and names its output version in `kgx/external-heads.json` (graph name → version IRI).
`build-kgx.mjs` reads that file and treats those versions like its own lifts: partition, describe, pack. It fails if a
named version is not in `log/versions.jsonl` or its file is missing. A value `{ "iri": ..., "store": false }` is a head,
is described in `meta` and is in `current.nq.gz`, but is not packed into the browser store: `model-building-keys`
(183,485 triples, more than the rest of kgx; a query in the browser gains little from model indices).

**Order of runs** (as run on 2026-10-06 and 2026-10-07): after an `area.js` rebuild, `key-model-buildings.mjs` first;
after new contributed photos, `contrib-photos.mjs <set>`, then `compose-facade-atlas.mjs`, then `build-kgx.mjs` twice
(the second run prints `new: 0`), then `check-kgx-store.mjs --write`. Push londat first, then the page files here
(`docklands/data/tex/facades.*`, `docklands/data/building-keys.json`), as for the cwdock set (londat 8c28efa, then
master 142db243; londat 44da043, then master a2781653).

**Side files** (a page file, tiles, an atlas) are written inside an operation's body, so a run that the log already has
does not write them again. Write a projection of the output graph outside the body when it can be (building-keys.json
is remade on every run); otherwise bump the operation version if a side file is lost.

**A comment at the end of a one-line statement** cut off the `writeFileSync` after it (`key-model-buildings.mjs`,
2026-10-06; the 3D page skill's rule): the external head was not written. Put a comment on its own line.

## Rules learned

- **Bump `op.version` when the body changes.** The memo key does not see the code. Without a bump the old outputs come
  back. (2026-10-06: the partition body changed three times; versions 2, 3, 4.)
- **A graph cannot describe the store that holds it.** `log` first included the `pack-shardborough` activity of the
  previous run, so each run made a new `log` version, a new store input and a new generation, and logged another pack:
  it never converged. Now `log` leaves out log lifts and packs (they stay in `log/activities.jsonl` and
  `manifest.json`).
- **Test idempotence: run the build twice.** The second run must print `new: 0`, the same generation, and leave
  `log/*.jsonl` unchanged. Measured 2026-10-06: first run 95 s, second 40 s (file hashing and `meta` dominate).
- **Strip a graph term from the end, by position.** The graph term is the last term and an IRI holds no space, so it
  starts at `lastIndexOf(' <')`. A regex from the first ` <` cut the literal "underground with layer < 0, else 0." and
  the packer stopped on "unescaped newline in string literal". The build now checks that lines read back hash to the
  version before it partitions them.
- **Partition in the store's key order, not string order.** Shardborough wire version 10 compares zone keys byte by
  byte: term type byte, UTF-8 length as 4 bytes little-endian, UTF-8 text, first 64 bytes (`zoneKey` in
  `kgx-ops.mjs`). Parts cut in string order overlapped in key order: one entity needed 320 blocks. In key order, 56
  (`cwplans-kgx`, "The store").
- Remove the output of a failed or wrong run only before it is committed. After a commit, a fix is a new version and
  the log keeps both.

## Earlier work (before 2026-10-06)

The tools listed in `pipeline.json` / `pipeline.jsonld` (fetch, normalise, join, build) write files, not graph
versions. The `pipeline` graph records each of them as a `prov:Activity` with the files it used and made, and ties each
file present at build time to its SHA-256. That is lineage, not yet re-execution: those tools are not `Flow` operations.

To bring a tool under the rule, when its output enters kgx: wrap its pure part as an operation whose inputs are the
files (by SHA-256) or graph versions it reads, and whose outputs are graph versions; give it an id, a version, the
skill that explains it and the tool path; keep fetches outside (a fetch makes an input file, then the operation reads
it). New cleanup and normalisation work starts that way.

## Open

- Set algebra operations (`union`, `difference`, `filter`, `mapQuads` in `@factoidal/core/fn`) as named operations, for
  cleanup steps that remove or rewrite quads (for example a correction graph subtracted from a source version).
- Re-express the main normalisation tools (registry build, opening hours, coref) as operations with graph inputs.
- Garbage: versions that no head and no log entry reach are not removed. They stay in git history once committed.
