# kgx: the cwplans knowledge graph (first cut)

Core data of the Canary Wharf / Docklands scoping project (magpie/cwplans in
[danbri/glitchcan-minigam](https://github.com/danbri/glitchcan-minigam)) as one RDF graph, beginning with the cited
Canary Wharf facts. Built by
[`magpie/cwplans/tools/build-kgx.mjs`](https://github.com/danbri/glitchcan-minigam/blob/master/magpie/cwplans/tools/build-kgx.mjs)
with [@factoidal/core](https://github.com/danbri/factoidal). Search page:
https://danbri.github.io/glitchcan-minigam/magpie/cwplans/kg/

Status: scoping, planning and prototyping. Not reviewed for production use. Each graph states its sources and licence
in the `meta` graph and in `manifest.json`; several hold OpenStreetMap-derived data (© OpenStreetMap contributors,
ODbL 1.0, https://www.openstreetmap.org/copyright) or data crawled for scoping under the owner's rule.

## Graphs

One named graph per source, IRI `https://danbri.github.io/londat/kgx/graph/<name>`:

| graph | what |
|---|---|
| `facts` | cited facts about Canary Wharf structures: property, value, unit, reference level, source URL, short quote |
| `buildings` | registry buildings (cwb- ids): name, position, outline as WKT, levels, height, postcodes, OSM and Wikidata links |
| `occupants` | occupants of the buildings: role, level, mall, opening hours, links to OSM, the CWG directory, brands |
| `cwg` | the Canary Wharf Group directory: schema.org types, malls, levels, page dates, weekly opening hours per day |
| `web` | the canonical schema.org layer of the web harvest (branch cards, hours, organisation cards) |
| `coref-<rule>` | owl:sameAs links between web descriptions, one graph per key rule |
| `mallmap` | mall units from the Living Map data behind map.canarywharf.com: name, class, mall, floor, hours, outline |
| `storeguide` | the CWG store guide of 20 July 2026 (OCR): names, sections, grid squares, links to CWG entities |
| `meta` | a description of every graph above (void:Dataset): title, sources, licence, triple count |

Things are `https://danbri.github.io/londat/kgx/id/…`; the vocabulary is `https://danbri.github.io/londat/kgx/vocab#`
(prefix `cwk:`), with schema.org first. There are no blank nodes.

## The same quads, four ways

| folder | format | use |
|---|---|---|
| `nq/` | N-Quads, gzip: one file per graph and `all.nq.gz` | the reference copy; any RDF tool |
| `shardborough/` | Factoidal Shardborough store: `CURRENT` names the active generation folder | fast SPARQL in Node (`npx factoidal query kgx/shardborough '…'`) and in the browser page |
| `cottas/` | COTTAS (Parquet RDF), one file per graph and `all.cottas` | portable bytes for Factoidal `openCottas`; slow to query at this size |
| `hdt/` | HDT, one file per graph (triples; the graph is the file) | exchange with HDT tools; written with hdt-java `rdf2hdt` |

`manifest.json` lists every file with size and SHA-256, the quad count per graph, the prefixes and the build timings.

## Query

    npx factoidal query kgx/shardborough 'PREFIX s: <https://schema.org/>
      SELECT ?name ?hours WHERE { GRAPH ?g { ?x s:name ?name ; s:openingHours ?hours
      FILTER(CONTAINS(LCASE(?name), "nando")) } }'

Every quad is in a named graph: wrap patterns in `GRAPH ?g { … }`, and a pattern that joins two graphs needs two
`GRAPH` blocks. The store refuses a query that would read more than 64 blocks (a block is one predicate in one graph):
write predicates out, not as a variable. Measurements and the reasons: the `cwplans-kgx` skill in the main repository.
