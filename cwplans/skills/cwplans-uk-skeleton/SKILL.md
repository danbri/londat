---
name: cwplans-uk-skeleton
description: >-
  The UK skeleton of OKR KR2.7: open vector layers for the whole UK (ONS boundaries with coast and boundary lines, OS
  Open Zoomstack motorways, A roads, railways and lakes, OS Open Rivers, OS Open Built Up Areas, NaPTAN stations, national
  parks and landscapes, place labels), a gazetteer (OS Open Names, postcode districts, Wikidata settlements of Northern
  Ireland) and Wikidata place cards, in WGS84, cut by the geodetic quadtree (levels 3, 6, 8) in the compact format
  skeleton-1, about 38 MB. Tool cwplans/tools/build-uk-skeleton.mjs (fetch, dataflow operations, OSTN15), region
  adapter docklands/geo/regions/uk.js, reader docklands/geo/skeleton.js (features, search, card, whereAmI, describe),
  data cwplans/docklands/data/uk/. Sources, licences, tolerances, size budget, traps (QLever rank filter, Open Rivers
  pieces, Zoomstack rail gaps, Node fetch 403). Reach for it before you rebuild or extend the skeleton, add a layer or a
  country, draw it on the globe, or answer "can the page find place X?".
---

# UK skeleton (KR2.7)

Owner, 2026-10-12: "also skeleton of uk with more open data vector and factoid content. Then leiden after we can fly
around uk and world without getting totally lost." OKR KR2.7 (https://github.com/danbri/londat/blob/main/OKRS.md):
"any UK place and any country findable by name; each place card has facts with sources".

- Data and the loader contract: https://github.com/danbri/londat/blob/main/cwplans/docklands/data/uk/README.md
- Live (when Pages is on): https://danbri.github.io/londat/cwplans/docklands/data/uk/manifest.json
- Tool: https://github.com/danbri/londat/blob/main/cwplans/tools/build-uk-skeleton.mjs
- Region and adapter (every host, product, field name, CRS, projector, kind table, layer text): https://github.com/danbri/londat/blob/main/docklands/geo/regions/uk.js
- Reader (no three.js): https://github.com/danbri/londat/blob/main/docklands/geo/skeleton.js ; test
  https://github.com/danbri/londat/blob/main/docklands/geo/test/skeleton.test.mjs (in `npm test`).

## Run

    npm install
    node cwplans/tools/fetch-raw.mjs grid                  # the OSTN15 grid, once
    node cwplans/tools/build-uk-skeleton.mjs fetch         # about 4.7 GB into cwplans/data/raw/uk-skeleton/ (ignored)
    node --max-old-space-size=12000 cwplans/tools/build-uk-skeleton.mjs build   # about 2.5 minutes; second run: all "unchanged"
    node cwplans/tools/check-data-register.mjs --write && npm test

Disk: OS Open Zoomstack is a 4.3 GB zip and a 12.6 GB GeoPackage. After the fetch has logged its SHA-256 the zip may be
deleted: the extracted folder `x/zoomstack/` stands for it (the fetch skips it). Only `fetch` uses the network.

## Dataflow (skill cwplans-dataflow)

Eight operations, each `{ id, version, skill: cwplans-uk-skeleton, tool }`, inputs = raw files by SHA-256 (from
`fetch-log.json`), parameters in the activity: `uk-boundaries`, `uk-protected-areas`, `uk-zoomstack`, `uk-rivers`,
`uk-built-up`, `uk-stations`, `uk-gazetteer`, `uk-manifest` (inputs: every output file of the others). Activity id =
`act` + sha256([op, version, inputs, params])[0:16]; `cwplans/docklands/data/uk/log.json` holds operations, fetches and
activities with their outputs (path, SHA-256, bytes). A run whose activity is in the log with every output unchanged is
skipped. Outputs are files (not graph versions): this tool does not write into `kgx/`.

**Bump the version** of every operation whose body or a shared helper (tile, packed, mergeLines, topoSimplify) changes:
the memo key does not see the code. On 2026-10-12 a change of the file format left three operations "unchanged" with
old-format files until their versions went up. Before the first commit the log was deleted and rebuilt once (the
development runs are not history).

## Method

- **Sources and licences** (all open: OGL v3.0 or CC0; no OSM): ONS Open Geography (countries, counties and unitary
  authorities, districts Dec 2024 BUC and BGC, regions of England, national parks Dec 2022 BGC, LAD22 to LAD23 lookup);
  OS Open Zoomstack, Open Names, Open Rivers, Open Built Up Areas (OS OpenData = OGL v3.0, the licence.txt in each zip
  points to os.uk/opendata/licence); NaPTAN (DfT); Census 2021 TS001 by lower-tier authority (Nomis bulk zip; the Nomis
  API is disallowed, the bulk files are allowed: skill cwplans-open-portals); Natural England AONB, NRW AONB ("open data
  under OGL"), Scottish Government National Scenic Areas (OGL); Wikidata through QLever (CC0). Register keys:
  `ons-geography-uk`, `os-open-zoomstack`, `os-open-names-gb`, `os-open-rivers-gb`, `os-built-up-areas`, `naptan-gb`,
  `nomis-census2021-ts001-ltla`, `ne-aonb`, `nrw-aonb`, `scotgov-nsa`, `wikidata`, `os-ostn15`.
- **CRS.** Everything is fetched or read in BNG (ArcGIS `outSR=27700`; ONS gives Northern Ireland in BNG too),
  simplified in metres, then each kept vertex goes to WGS84 by `lib.bngProjector().inverse` (OSTN15 NTv2 in proj4). The
  tool names the projector only through the adapter (`crs.projector`), so `tools/check-locale.mjs` counts nothing in it
  (prose in operation `about` strings counted too: "OSTN15" there failed the check once).
- **Boundaries keep shared edges.** `topoSimplify`: rings keyed at 0.1 m, a vertex is a node when it has other than two
  neighbours or its two edges have different owner sets; rings are cut into arcs at nodes; each arc is simplified once
  (Douglas-Peucker) and reused (reversed) by its neighbour. Arcs of one country = coast; of two areas = a boundary line
  with `left` and `right`. Census 2021 usual residents are summed onto 2023 codes through the lookup (2023 merges:
  Cumberland, Westmorland and Furness, North Yorkshire, Somerset).
- **Lines.** Zoomstack roads grouped by class and number (name only when there is no number), rail by kind, rivers by
  name and node; pieces merged end to end on a 2 m grid, at a junction along the straightest unused piece. Lines shorter
  than twice the tolerance dropped (roads, rail). Lines are clipped at cell edges (Liang-Barsky).
- **Levels and tolerances** (m): 3 national / 6 regional / 8 city: boundaries 800/150/60; roads 500/150/50 (3:
  motorways, 6: + primary A roads, 8: + A roads); rail -/150/50; rivers -/150/40 (40 km / 10 km of named river, or a
  piece of 1 km or more of a name with 3 times that length); lakes -/150/50 (2 / 0.25 km2); built-up -/150/60 (500 / 50
  ha); parks and landscapes 800/150/30. Decimals: 3 at level 3, 4 at 6 and 8. Polygons in the cell of their bbox
  centre; lines per cell; points per cell.
- **Format skeleton-1**: integer coordinates (degrees x 10^decimals), delta-coded per line or ring, no stored bbox (the
  reader computes it). GeoJSON text was 102 MB for the same content at first; delta coding, dropping per-feature bboxes,
  merging lines and the tolerances above gave 37.5 MB.
- **Gazetteer.** OS Open Names local types mapped to kinds (adapter `gazetteer.kinds`; streets, woods and schools left
  out); postcode districts = mean of the postcode points (`POSTCODE_DISTRICT` is empty on postcode rows of the 2026-07
  release: the district is the first part of NAME1); river names (5 km or more; point = middle of the longest link);
  ONS and landscape names at a label point; Wikidata settlements of Northern Ireland (P131+ Q26). Files by the first two
  letters or digits of the folded name, also under the other-language name and without a generic first word
  (`gazetteer.prefixes`). District of an entry: Open Names DISTRICT_BOROUGH, else COUNTY_UNITARY, else the ONS district
  polygon that holds the point.
- **Cards.** Wikidata settlements (P31/P279* Q486972, P17 Q145) with a population of 5,000 or more, cities (Q515), NI
  settlements: 3,018 cards (2 in overseas territories dropped by the region bbox). Matched to Open Names by the DBpedia link of Open Names (= the English Wikipedia title),
  then by folded name within 8 km. Facts `{ p, v, unit?, date?, src: 'wikidata', retrieved }`; links only (Wikidata,
  Wikipedia title, Commons file page, website). District census population is on the `districts` layer (`pop2021`).

## Traps met (2026-10-12)

- **QLever and a FILTER on an IRI:** `FILTER(?rank != wikibase:DeprecatedRank)` gave 279 rows instead of 40,792. Drop
  deprecated statements in code.
- **Open Rivers names are cut into components** where unnamed or other links come between: the tidal Thames is 23
  pieces, the Isle of Dogs reach a 5 km piece; a component rule alone dropped it. Rule now: keep a piece of 1 km or more
  when the name is long over the country.
- **Zoomstack rail ends** differ by centimetres to a metre: at 0.1 m keys nothing merged. 2 m grid.
- **maps.data.gov.scot** answers 403 to Node's fetch and 200 to curl: ArcGIS calls go through curl.
- **ArcGIS `outSR=4326`** from these services uses an unknown datum transformation: not used; BNG then OSTN15.
- **NaPTAN longitude and latitude** are Helmert-made (0.35 m median from Helmert, 1.4 m from OSTN15): use its easting
  and northing.
- Search for "Snowdon" puts a Devon hill named Snowdon first; Yr Wyddfa (Snowdon) is second: equal exact matches rank
  by kind, population, then distance (`near`). Pass `near` from the view.

## Open

- Northern Ireland OS-equivalent layers: OSNI open data says "LPS licensing terms" (2026-10-12); find a clear open
  licence or use OSM (ODbL, owner's review) for NI roads, rail, water and names.
- Census population for Scotland (NRS 2022) and Northern Ireland (NISRA 2021); OS Terrain 50 overview; cards into kgx
  as a graph version (Flow, skill cwplans-kgx); more countries through the same adapter shape (`--region=<id>` with an
  adapter `<id>-skeleton`).
