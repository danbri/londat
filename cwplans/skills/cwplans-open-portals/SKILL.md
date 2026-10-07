---
name: cwplans-open-portals
description: >-
  The open-data catalogues other than the London Datastore, walked for the cwplans Docklands zone with
  tools/walk-portals.mjs and one adapter per portal in tools/portals/: data.gov.uk (all 59,451 datasets),
  planning.data.gov.uk, the six zone borough portals, Nomis Census 2021 bulk zips (the Nomis API is disallowed by
  robots.txt), the ONS Open Geography Portal and national sources (DfT, police.uk, DESNZ). Each portal's API,
  robots.txt and terms, the written triage rules and the final state of every dataset, the licence classes (no
  licence = metadata only; "no restrictions" without a licence name is not open), the extracts clipped to the 3D model
  box (since 2026-10-05 in danbri/londat cwplans/feeds/portals/), size rules, faults F42 to F45, and the traps (Poplar
  is a tree, short slugs match prose). Reach for it before you walk, re-triage or harvest any national or borough
  portal for cwplans, or answer "is dataset X open and in the zone?".
---

# Open-data portals for cwplans

Policy, the fault register and the activity log: the hub skill `docklands-data-curation`. Append what you did to its
`ACTIVITY-LOG.md`. The London Datastore has its own skill (`cwplans-london-datastore`) and tool; this walk copies its
method (walk, area from the data, written triage rules, one final state per dataset, harvest clipped to the zone,
size caps) for the other portals. Results: https://github.com/danbri/londat/blob/main/cwplans/feeds/portals/README.md.
Checked against the tool and the files on 2026-10-04.

## Run

    NODE_USE_ENV_PROXY=1 node cwplans/tools/walk-portals.mjs dgu walk        # 60 pages, ~2 min; raw all.jsonl.gz (7 MB)
    node cwplans/tools/walk-portals.mjs dgu triage                            # no network
    node cwplans/tools/walk-portals.mjs dgu catalogue                         # the committed compact catalogue
    NODE_USE_ENV_PROXY=1 node cwplans/tools/walk-portals.mjs pdg walk         # 478 requests, ~9 min
    node cwplans/tools/walk-portals.mjs pdg triage
    NODE_USE_ENV_PROXY=1 node cwplans/tools/walk-portals.mjs pdg harvest [dataset ...]
    NODE_USE_ENV_PROXY=1 node cwplans/tools/walk-portals.mjs boroughs walk    # 662 requests, ~20 min (observatory metadata)
    node cwplans/tools/walk-portals.mjs boroughs triage; ... boroughs harvest [key ...]
    NODE_USE_ENV_PROXY=1 node cwplans/tools/walk-portals.mjs nomis walk; ... nomis harvest [TS001 ...]
    NODE_USE_ENV_PROXY=1 node cwplans/tools/walk-portals.mjs onsgeo walk; ... onsgeo harvest [key ...]
    NODE_USE_ENV_PROXY=1 node cwplans/tools/walk-portals.mjs national harvest [dft-aadf dft-stats19 police-crime desnz-energy]
    node cwplans/tools/walk-portals.mjs index                                 # feeds/portals/index.json
    node cwplans/tools/check-data-register.mjs --write

`--refresh` re-downloads raw files (`data/raw/portals/<portal>/`, gitignored). Order per portal: walk, triage,
harvest, register, triage again (harvested datasets become `harvested`), index. The zone reference is
`feeds/london-datastore/zone-codes.json` (postcodes, OA/LSOA/MSOA/ward codes) and the zone UPRN list in the London
Datastore raw cache (`data/raw/london-datastore/zone-uprns.txt`), loaded by `zoneRefs()`.

**Politeness** (in `walk-portals.mjs`): one request at a time over the whole run, at least 1.1 s apart; robots.txt is
read for every host before its first request and obeyed (longest matching rule wins; `allowed()`); backoff on 429 and
5xx (Retry-After honoured); the project User-Agent. Do not run two copies against one host at once.

## Licence classes (`licenceClass`)

OGL (any version), CC BY, ODC-By, CC0/PDDL/public domain are **open**. Anything non-commercial or closed is
**restricted**; CC BY-SA and ODbL are **share-alike** (never harvested; OSM is the only share-alike exception in
`CLAUDE.md`). "No conditions apply" or "no restrictions" without a licence name is **open-unclear**: not harvested
until a licence is found (the Tower Hamlets ArcGIS Hub says "No special restrictions or limitations ... except that
data scraping tools should not be used": not a licence). No licence is **none**: metadata only.
Site terms: a data.gov.uk record with no licence whose resources all sit on GOV.UK, ONS, Nomis, NHS Digital, DfT road
traffic or data.police.uk is `ogl-site-terms` (those sites state OGL v3.0 for their content), and is open.

## data.gov.uk

- API: `https://www.data.gov.uk/api/action/package_search?rows=1000&start=<n>&sort=metadata_created asc` (the bare
  domain answers 301). A page of 1,000 full records is 18 MB, so the walk writes a compact record per dataset to
  `data/raw/portals/dgu/all.jsonl.gz` (7 MB for all 59,451) and keeps no description text, only the area words found
  in it. `ext_bbox` spatial search is refused ("Local parameters are not supported"); INSPIRE records carry
  `bbox-*-long/lat` extras instead, and the licence in the `licence` and `access_constraints` extras.
- Scope: S1 local publishers, S2 named national publishers (`NATIONAL_ORGS`), S3 the GLA (= London Datastore, state
  walked-elsewhere), S4 other publishers whose title or tags name a zone place or borough. Out of scope: counted per
  organisation in the meta.
- States, first match: T0 by hand (`JUDGED`), T1 sensitive title, T2 held, T3 walked-elsewhere (the GLA; any resource
  on the ONS Open Geography Portal, the OS Data Hub or the City of London map service, which other adapters walk
  whole), T4 unavailable (no resources, or "Deleted"/"withdrawn" in the title), T5 not-relevant administrative
  (payments, spending, staff, contracts, FOI; title and slug), T6 not-open, T7 not-relevant other area (bounding box
  misses the zone, or the title names another region, county, city or London borough), T8 deferred documents only,
  T9 listed-for-harvest (zone place, zone borough, London-fine or national-fine), T10 not-relevant coarser than a
  borough, T11 deferred area unknown.
- Relevance: zone place in title or tags (not the description) unless tree or crop words are present; zone borough
  in title or tags, or an S1 publisher; then the bounding box (inside London and meeting the zone = london-fine); then
  fine area words in the description or a spatial resource (national-fine); then coarse words (national-coarse).
- Held: the dataset id, or its slug when it has 15+ characters and a hyphen, appears in a tool, data-register.json
  or pipeline.json (listed: in a .md or feeds/feeds.json).
- Committed size: `triage.json` lists one by one only the datasets that need a decision or hold data; the bulk states
  are name lists in `by_state` keyed "state | rule | reason" (every in-scope name is in exactly one place);
  `catalogue.json` holds the compact records of the datasets listed one by one. 4.2 MB together on 2026-10-04.
- Score ranks the listed ones only: relevance weight x (1 + 0.5 per theme) x recency x 1.3 for a spatial resource
  x 0.8 if listed elsewhere. It does not decide. Most listed records are national spatial layers whose metadata
  cannot say whether they hold anything in the zone: probe the service (WFS `resultType=hits` with the box, ArcGIS
  `returnCountOnly`) before harvesting.

## planning.data.gov.uk

- API: `dataset.json` (222 datasets, all `licence: ogl3`, attribution text per dataset); `entity.json` and
  `entity.geojson` with `dataset=<d>&geometry=<WKT polygon>&geometry_relation=intersects&limit=500&offset=<n>`;
  responses carry `count`. Non-geography datasets (documents, agreements, plans) are read per zone planning
  organisation: `organisation_entity` = GLA 144, Greenwich 150, Lewisham 198, City 203, Newham 246, Southwark 329,
  Tower Hamlets 350. robots.txt disallows `/fact/` (and `/entity/?` for GPTBot); the walk uses neither.
- States: P0 by hand (`JUDGED`: held from another source with the file named, or coarser than the zone), P1
  harvested, P2 ended, P3 not-open, P4 empty, P5 code list, P6 nothing in the zone, P7 listed-for-harvest, P8
  deferred. 2026-10-04: harvested 26, held 11, not-relevant 79, unavailable 106.
- Harvest (`HARVEST` table): geography by the spatial query, whole geometries rounded to 6 decimals with `in_zone`,
  `whole_in_zone`, `in_cw`; tables by organisation. `flood-risk-zone` is simplified (Douglas-Peucker 0.000005
  degrees, about 0.5 m) and cut at the box (`clipped_to_zone`): uncut it was 5.5 MB, cut 1.2 MB. A cut polygon is for
  display, not for area sums (a hole crossing the edge is cut as a ring).
- Held elsewhere (do not harvest twice): title boundaries (HMLR INSPIRE, `registry-inspire.mjs`), trees
  (`build-trees.mjs`), NaPTAN, GIAS, scheduled monuments and APAs (registry/sources/museums), conservation areas,
  brownfield and CAZ (London Datastore), wards.
- Section 106 / CIL agreements, contributions and transactions: only the Royal Borough of Greenwich publishes them to
  the platform (370 agreements, 1,398 contributions, 813 transactions on 2026-10-04).

## Borough portals

- **City of London**: the INSPIRE map service `https://www.mapping.cityoflondon.gov.uk/arcgis/rest/services/INSPIRE/MapServer`
  (176 feature layers, REST query with the box envelope). The service states no licence; each layer's licence is on
  the City's INSPIRE record on data.gov.uk, matched by normalised title (`cityLicences`): OGL for 35 layers, the OS
  public-sector INSPIRE end-user licence for 34 (restricted: `inspire-licence`, `mapping-agreements` in the text), none
  for 94 (not harvested). Layers about people or their sites (toilets, polling places, clinics, pharmacies, contributor
  businesses, community organisations, residential units, emergency-service parking) are deferred by rule B2.
  Every other open layer with features in the zone is harvested (27). The Cultural Spaces layer comes back with
  `geometry: null` in both `f=geojson` and `f=json` while its spatial filter works: kept with null geometry and
  `meta.geometry_withheld` (fault F43). When `f=geojson` alone loses geometry, `f=json` Esri rings are converted
  (`esriToGeo`: clockwise rings outer).
- **Tower Hamlets**: ArcGIS Hub "Planning Datasets" (DCAT feed `/api/feed/dcat-us/1.1.json`, 8 items). No licence named
  (F42); the same layers are taken under OGL from planning.data.gov.uk.
- **Southwark and Greenwich**: both "observatories" are Esri UK InstantAtlas sites. The data behind them is one shared
  indicator library on Esri UK's ArcGIS organisation (`HumUw0sDQHwJuboT`: `<Borough>_MasterTable` with Indicator, Theme
  and Geo items) plus the metadata service `https://hub.instantatlas.com/data-store-metadata-service` (Publisher,
  Rights, Spatial). The pages load it with JavaScript; a headless render found the URLs. 16,897 and 16,898 indicators,
  almost all re-served national statistics: walked-elsewhere (B3) when the publisher is national, not-open when the
  Rights field is empty, deferred for the 15 Social Mobility Commission indicators. The committed catalogue
  summarises them by borough, publisher, licence and theme; the full list is in the raw cache.
  data.southwark.gov.uk has `Crawl-delay: 10` and a Cloudflare challenge; the walk does not need the page.
- **Lewisham**: JKAN on GitHub Pages: `datasets.json` plus each dataset's source file
  (`raw.githubusercontent.com/lb-lewisham/open-data-lewisham/gh-pages/_datasets/<slug>.md`) for the licence (OGL) and the
  resources. The licence words on the rendered pages are the form's options, not the dataset's licence.
  FixMyStreet and Commonplace records are written by residents: deferred until the owner says.
- **Newham**: no portal of its own; Newham Info is a London Datastore dataset.

## Nomis

robots.txt disallows `/query/` and `/api/v01/dataset/`, `/codelist/`, `/concept/` for every agent: do not use the Nomis
API. The Census 2021 bulk zips under `/output/census/2021/` are allowed: one per topic summary (74), each with CSVs
for OA, LSOA, MSOA, LTLA, UTLA, region and country. `harvest` streams the OA CSV out of the zip (`unzip -p`) and keeps
the zone OAs (1,509, from zone-codes.json `oa21`); a trailing empty header column is dropped. Where a zip has no OA
file (or an empty one: F45) the next level is read (LSOA, then MSOA: 75 zone MSOAs). 68 tables harvested (52 at OA,
16 at MSOA); 5 are published from local authority up only; TS079's zip is unreadable. Zips are deleted after reading
unless `--keep-raw` (disk). `--all` harvests every table. Join through `onsgeo/oa21-lookup`.

## ONS Open Geography

Catalogue: ArcGIS sharing search `orgid:ESMARspQHYMw9BZ9` (2,630 items). Licence: the ONS geography licences page
(OGL v3.0; OS data attribution). States G1-G8 by product family read from the title (`FAMILIES`): small-area families
(OA, LSOA, MSOA, workplace zone, ward, postcode, built-up area, UPRN, grid) are listed; coarse families, parishes (none
in the zone), Scotland/Wales/NI-only items and vintages before 2011 are not relevant. Lookups are read by code list in
batches of 60 (a GET with 150 codes answered 404). Harvested: OA 2021 polygons with rural-urban class, OA and LSOA
population-weighted centroids, the OA-LSOA-MSOA-LAD lookup, workplace zones 2011, wards May 2026.

## National

The sources of the brief are a hand-written list in `national.mjs` (`SOURCES`: API, licence, robots, state, reason).
Harvests: DfT AADF (the CSV per zone local authority, count points in the box, every year); STATS19 collisions
(streamed, aggregates only: LSOA x year x severity; the LSOA column holds 2021 codes, F44); police.uk (12 months, the box
in 6 tiles because the API refuses over 10,000 crimes, aggregates by snap point x category and month x category, no
crime ids); OS Open Names (the GB CSV uses 20 km tiles: TQ26 and TQ28 hold the box; postcode entries left out, held
from ONSPD) and OS Open Rivers (GeoPackage read with readGpkg from walk-london-datastore.mjs), downloads deleted after
reading; DESNZ electricity and gas workbooks (zone LSOA and MSOA rows, 2011 and 2021 codes; the header row is
the first short cell naming an LSOA/MSOA code, not the notes above it). Ofcom refuses scripts (403).

## Service probe (data.gov.uk)

`dgu probe` counts the features in the zone box for every listed dataset with a map service (EA spatialdata WFS
`resultType=hits`; ArcGIS `returnCountOnly`; other WFS); `probe.json` keeps the count per layer. Triage reads it: 0
everywhere with no error is not-relevant (T7b), a count triples the score. `dgu harvest <name ...>` reads the counted
layers with the box (WFS GeoJSON in EPSG:4326, ArcGIS f=geojson), cuts polygons and lines at the box, and keeps a file
only under the size cap (6,000 features, 1.5 MB on disk). 384 probed on 2026-10-04 (876 requests, about 90 minutes).

## KML sources (2026-10-05)

Owner, 2026-10-05: "Can you find any kml resources for the area?" Tool `tools/find-kml.mjs` (copy, probe, all); results
`feeds/kml/catalogue.json` and `feeds/kml/README.md` (https://github.com/danbri/londat/blob/main/cwplans/feeds/kml/README.md);
copies in danbri/londat `cwplans/feeds/kml/` (in `HOSTED_DIRS`; since 2026-10-07 the catalogue and README are in the
same folder).

- **Where KML is.** Search our own catalogues first: London Datastore `catalogue.json` (resource `format` kml/kmz; 11
  of 11,348 resources) and the raw data.gov.uk walk `data/raw/portals/dgu/all.jsonl.gz` (4,499 of 59,451 datasets have a
  KML resource: 2,367 ONS, 1,002 Northern Ireland, 237 NSTA; for London only the GLA, Lambeth with no licence, BGS
  and two national boundary zips). Native KML in the zone that opens by URL: the GLA files (schools 2016, wards 2014,
  BIDs, Curio Canopy share-alike). data.london.gov.uk downloads send `Access-Control-Allow-Origin: *`.
- **What is not KML.** ArcGIS Online hosted feature layers answer JSON, GeoJSON and PBF only (no `f=kmz`;
  `supportedExportFormats` kml needs an export job with a login). ArcGIS Server map services here (City of London INSPIRE)
  list JSON and geoJSON only. ArcGIS Hub `api/download/v1/items/<id>/kml` generates on request: 202 "being generated",
  one 3-polygon item stayed "PagingData" for over 15 minutes, TfL items 404 "Layer does not exist": never give a `?kml=`
  link to it (the page would read a JSON message). planning.data.gov.uk has no `entity.kml` (404). OS OpenData,
  GeoNames, EA flood maps: no KML.
- **So we copy.** Open layers (OGL, CC BY) are fetched as GeoJSON with an envelope query (or read from our harvests),
  cut to the zone and written with the page's own `writeKml` (one shared Style, names and a few fields, source, licence
  and attribution in the Document description). raw.githubusercontent.com sends CORS `*`, so
  `https://danbri.github.io/londat/cwplans/docklands/?kml=<encoded raw URL>` works once the londat Pages site is on (the
  old links to https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/ redirect to it with the query).
- **Licences.** Share-alike (Curio Canopy, Wikimapia, Wikipedia "Attached KML") is never copied; Curio Canopy opens by
  link only and is not an example. The National Cycle Network layer is OGL but the publisher says it contains OSM: its
  copy is registered `osm: derived` with "osm" in its sources. Items with no licence text (TfL stations, Tower Hamlets
  Canary Wharf Area, Lambeth) are metadata only. Restricted: Saturday Walkers Club KML (non-commercial), Google My Maps.
- **robots.txt.** ogc.bgs.ac.uk and openplaques.org disallow all agents: not fetched by the tool. (One manual curl of the
  two BGS files on 2026-10-05 came before the robots check; they hold NetworkLinks only. Check robots.txt first.)
- **Testing.** Node: kml.js runs with a DOMParser from `@xmldom/xmldom` (XML; it has `children`) and `linkedom` for
  description HTML (`KML_DOM_DIR`). linkedom alone parses XML into the XHTML namespace: do not use it for the KML.
  Then every `open_link` in the live page headless (Chromium, SwiftShader): wait for `DocklandsKML.S.files[0].n` and keep
  drawn / cut / outside as `page_test` in the catalogue (`probe` keeps it). 17 of 17 opened on 2026-10-05.
- **Example KML** buttons in Menu > Layers > My KML (`EXAMPLES` in `docklands/kml-layer.js`): open-licensed copies only.

## Size rules

**Where the files are:** the data files of `feeds/portals/` moved to the repository https://github.com/danbri/londat on
2026-10-05, under `cwplans/feeds/portals/` (same relative paths); since 2026-10-07 the READMEs, the tools and the
register are in the same repository. `walk-portals.mjs` writes to this checkout (`OUT`; `tools/londat.mjs`;
`LONDAT_DIR` defaults to the checkout itself). Register entries have no `"hosted"` field (removed on 2026-10-07).
Commit and push the data, the register, READMEs and tools together. History of the two-repository layout (2026-10-05
to 2026-10-07): `docklands-data-curation`, "Data hosted in danbri/londat". The size rules below still apply in londat
(its Pages site has the same 1 GB limit).

Coordinator, 2026-10-04: the repository (then danbri/glitchcan-minigam: 531 MB tracked, 1 GB pack) and the Pages site
(1 GB limit) are near their limits.
`writeOut` in walk-portals.mjs writes any output over 1 MB gzipped (`<file>.gz`; pages read it with
DecompressionStream) and removes the plain file; `outExists` and `readOut` read either. Commit only compact zone
extracts with rounded coordinates and the fields used; large tables stay raw and are listed as "available on
request" in the README; stop and report before the walk's committed additions pass 40 MB.
Commit zone extracts only; national files stay in `data/raw/portals/` (gitignored, `.gitignore` line
`data/raw/portals`). Round coordinates to 6 decimals; cut very large polygons at the box when only the zone part is
useful, and say so in the meta. Report the size of each batch in the activity log. Disk in the container is small
(3.9 GB free on 2026-10-04): stream national CSVs and keep only zone rows.

## Traps (catalogued)

| trap | rule |
|---|---|
| "Poplar" is a tree: Forestry Commission short rotation coppice, black poplar clones and Energy Crops records matched the zone place list | zone places from title and tags only, not next to tree or crop words |
| Short slugs ("locks", "matrix", "find", "deaths") match project prose | held needs the id, or a slug of 15+ characters with a hyphen |
| "Safeguarding" is also a planning word (airport, Crossrail, Bank station safeguarding areas) | the sensitive rule asks for child or adult safeguarding |
| Deleted data.gov.uk records keep resources ("Deleted - moved to other existing datasets"), and their slug, not the title, says "spending" | unavailable by title; the administrative rule reads title and slug |
| The Tower Hamlets ArcGIS Hub has no named licence | not open; the same layers are taken from planning.data.gov.uk (OGL) |
| EA `spatialdata/<name>/wfs` answers, but its `next` links and the OGC API live under `/geoservices`, which robots.txt disallows | query through `/spatialdata/` only |
| F42: one dataset, two licences: the Tower Hamlets hub names none, planning.data.gov.uk serves the same layers under OGL; the City map service states none, its layers' data.gov.uk records give OGL or the OS INSPIRE end-user licence | take the copy with a named open licence; licence per layer, never per service |
| F43: the City map service withholds geometry for a layer (Cultural Spaces) in every output format, while its spatial filter works | keep the features with null geometry and `meta.geometry_withheld`; place them by address |
| F44: STATS19 `lsoa_of_accident_location` holds 2021 codes in the 2021-2025 file; with 2011 codes 1,431 of 10,362 zone collisions matched | match 2011 and 2021 codes; read the code vintage from the values, not the column name |
| Nomis robots.txt disallows its own API | bulk zips only |
| A data.southwark.gov.uk or dataobservatory page holds no data: the indicators load from Esri UK services by JavaScript | render once headless to find the services, then use them directly |
| A notes paragraph above a spreadsheet header names "MSOA code" (DESNZ) | a header cell is short (< 40 characters) |
