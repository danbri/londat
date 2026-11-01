# Dataset accounting: Londat and Docklandia

Snapshot: **1 November 2026**. This is an additive catalogue. It does not change source files, licence declarations, pipelines, application behaviour or publication rules.

## Scope and counting rules

The catalogue accounts for **528 registered sources**, **821 registered file patterns**, **32 storage families**, **35 current KGX graph heads**, regional/world vector-layer components, 36 recorded OSM extract acquisitions and two separate cache branches. The physical inventory measures **33,576 tracked files**, **1,745,314,707 bytes (1.745 GB decimal)** under the listed data/evidence/provenance roots. It deliberately includes supporting documentation and software within those roots; this is storage accounting, not a count of independent observations.

Source records include discovery/catalogue sources, not just harvested datasets. A portal catalogue may describe thousands of resources while only selected extracts were downloaded. A registered artifact may be a directory, wildcard, document, code module or alternative serialization. All 821 registered patterns match at least one tracked path in this snapshot. Counts and sizes of child datasets, exports, raw snapshots and graph versions overlap: **do not add them to the mutually exclusive storage-family totals**.

The companion [TriG catalogue](https://danbri.github.io/londat/DATASET-CATALOGUE.trig) uses schema.org `DataCatalog`, `Dataset`, `DataDownload`, `hasPart`, `isPartOf`, `isBasedOn`, distributions and spatial coverage as its base. It follows the vocabulary described by [Google’s Dataset guide](https://developers.google.com/search/docs/appearance/structured-data/dataset). This RDF artifact is not an implementation of Google page markup or a claim of rich-result eligibility. Dataset membership/provenance uses `isBasedOn`; transformed outputs are not declared `sameAs` their originals.

The TriG has two named graphs: `cat:recorded` contains the recorded source/assertion metadata and measured files; `cat:assessment` contains use, change-rate, serving and rights assessments. `dct:rights` preserves original licence prose, including uncertain terms. `schema:license` links only recorded grant URLs where the source record does not expressly say the licence is unconfirmed. These links still need publisher-level verification. Unknown terms are not guessed. No aggregate blanket licence is asserted.

The compressed [physical file inventory](https://danbri.github.io/londat/docs/dataset-catalogue-files.tsv.gz) contains repository, tracked path, family, byte length and SHA-256. Sizes are stored file bytes, including existing gzip compression, excluding `.git`, ignored downloads, dependencies and filesystem allocation overhead. It covers the named roots, not every file anywhere on the disk. Separate branches are not measured. The catalogue’s own newly added files are not included in the baseline.

Evidence commits:

- [londat `5ece04a8144e962ba40fac81e724b106161d4dcb`](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb)

- [docklandia `fe1b484179a6648d99c500cfb58286bf2d6353c6`](https://github.com/danbri/docklandia/tree/fe1b484179a6648d99c500cfb58286bf2d6353c6)

The source register reports its last update as 22 October 2026; this accounting measures the checked-out files on 1 November. Manifest build dates, source acquisition dates and the represented time period remain separate. This is not a live assertion about future repository state.

## Storage overview

All values below are decimal MB. Families are assigned by the longest matching path prefix, so each inventoried path contributes once. The residual “Quality, coverage, reports and provenance” family also contains software and documentation under `cwplans/` that is not in a more specific family.

| Family | Repository / path | Files | MB | Main role |
|---|---|---:|---:|---|
| United Kingdom (lite buildings) | [docklandia/data/gb/uk-lite/](https://github.com/danbri/docklandia/tree/fe1b484179a6648d99c500cfb58286bf2d6353c6/data/gb/uk-lite/) | 7,204 | 322.49 | Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX. |
| CWG directory, mall map, guide and evidence | [londat/third_party/cwg/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/third_party/cwg/) | 2,443 | 269.08 | Raw/parsed estate directory and indoor-map evidence; some factual extracts lifted to KGX. |
| Mitte, Berlin | [docklandia/data/de/berlin/](https://github.com/danbri/docklandia/tree/fe1b484179a6648d99c500cfb58286bf2d6353c6/data/de/berlin/) | 3,140 | 203.65 | Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX. |
| London Datastore catalogue and extracts | [londat/cwplans/feeds/london-datastore/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/feeds/london-datastore/) | 239 | 172.06 | Catalogue discovery plus selected spatial/statistical factual overlays; not every catalogue hit is harvested. |
| Central Dublin | [docklandia/data/ie/dublin/](https://github.com/danbri/docklandia/tree/fe1b484179a6648d99c500cfb58286bf2d6353c6/data/ie/dublin/) | 1,605 | 107.99 | Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX. |
| Hourly live history and GIS exports | [londat/cwplans/cache/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/cache/) | 10 | 76.82 | Normalized live snapshots/history plus GeoPackage exports of core, Datastore and portal layers. |
| Mitte, Stuttgart | [docklandia/data/de/stuttgart/](https://github.com/danbri/docklandia/tree/fe1b484179a6648d99c500cfb58286bf2d6353c6/data/de/stuttgart/) | 815 | 67.76 | Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX. |
| Knowledge graph, versions and browser store | [londat/kgx/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/kgx/) | 6,743 | 63.67 | RDF factual layers, source evidence, named graph provenance, immutable versions, complete export and indexed browser subset. |
| Greater London | [londat/cwplans/docklands/data/places/london/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/docklands/data/places/london/) | 686 | 50.86 | Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX. |
| Global terrain and base | [londat/cwplans/docklands/data/world-base/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/docklands/data/world-base/) | 3,191 | 48.77 | Globe terrain, map lines, labels and place cards; factual attributes available through readers, separate from KGX. |
| Schloss Dagstuhl, Wadern | [docklandia/data/de/dagstuhl/](https://github.com/danbri/docklandia/tree/fe1b484179a6648d99c500cfb58286bf2d6353c6/data/de/dagstuhl/) | 860 | 42.17 | Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX. |
| Contributed images and calibration | [londat/data/images/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/data/images/) | 53 | 40.41 | Original contributed photos, annotations, camera/calibration and facade evidence. |
| UK skeleton | [londat/cwplans/docklands/data/uk/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/docklands/data/uk/) | 1,532 | 38.32 | Globe terrain, map lines, labels and place cards; factual attributes available through readers, separate from KGX. |
| Quality, coverage, reports and provenance | [londat/cwplans/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/) | 313 | 28.83 | Data-quality findings, source-discovery coverage and pipeline metadata alongside software/documentation. |
| Stari Grad, Sarajevo | [londat/cwplans/docklands/data/places/sarajevo/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/docklands/data/places/sarajevo/) | 448 | 25.32 | Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX. |
| Docklands core model and factual sidecars | [londat/cwplans/docklands/data/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/docklands/data/) | 33 | 24.03 | Detailed 3D terrain, buildings, water, roads, rail, tunnels, indoor paths, trees and feature keys; cited factual layers. |
| Casco Histórico, León | [londat/cwplans/docklands/data/places/leon/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/docklands/data/places/leon/) | 407 | 22.69 | Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX. |
| Building registry, occupants and source joins | [londat/cwplans/registry/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/registry/) | 89 | 22.08 | Factual entity layer and main KGX inputs: buildings, companies, premises, brands, heritage, construction, water, facades and website facts. |
| Global detail vectors and gazetteer | [londat/cwplans/docklands/data/world-detail/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/docklands/data/world-detail/) | 2,297 | 17.96 | Globe terrain, map lines, labels and place cards; factual attributes available through readers, separate from KGX. |
| TfL station models and source evidence | [londat/third_party/tfl/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/third_party/tfl/) | 8 | 17.88 | Station 3D source models and plans for underground reconstruction/evidence. |
| Other portal catalogues and extracts | [londat/cwplans/feeds/portals/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/feeds/portals/) | 170 | 17.68 | data.gov.uk, planning.data.gov.uk, borough, Nomis, ONS and national discovery plus selected factual/spatial extracts. |
| Global reference vectors | [londat/cwplans/docklands/data/world/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/docklands/data/world/) | 38 | 15.91 | Globe terrain, map lines, labels and place cards; factual attributes available through readers, separate from KGX. |
| Synthetic and trained splats | [londat/cwplans/docklands/data/splats/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/docklands/data/splats/) | 7 | 10.14 | Experimental visual rendering derived from the 3D model; not measured photogrammetry. |
| Live, river, works, events, underground and KML records | [londat/cwplans/feeds/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/feeds/) | 76 | 9.81 | Visual overlays, time-series/live panels, events, alerts, underground source evidence and KML discovery/copies. |
| Rendered website structured-data harvest | [londat/third_party/cwplans-structured-data/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/third_party/cwplans-structured-data/) | 451 | 6.60 | Page-scoped JSON-LD/microdata/RDFa, N-Quads, idiom/shape and rewrite analyses; canonical portions in KGX. |
| North-west Spain skeleton | [londat/cwplans/docklands/data/es-nw/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/docklands/data/es-nw/) | 357 | 6.18 | Globe terrain, map lines, labels and place cards; factual attributes available through readers, separate from KGX. |
| Aerial imagery and facade texture atlases | [londat/cwplans/docklands/data/tex/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/docklands/data/tex/) | 8 | 4.66 | Visual ground and facade textures; metadata links source photos and credits. |
| Committed raw/source snapshots | [londat/cwplans/data/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/data/) | 18 | 4.59 | Raw source extracts, station control facts and original corridor model; excludes ignored downloads. |
| Atlas extracts | [londat/cwplans/atlas/data/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/atlas/data/) | 1 | 2.08 | Joined factual/spatial browser index, derived from registry/model/other inputs. |
| Postcode framework | [londat/cwplans/postcodes/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/postcodes/) | 6 | 1.86 | E14 postcode status, ward, coordinate, company/sales aggregates and discovery evidence; registry join framework. |
| Bosnia and Herzegovina skeleton | [londat/cwplans/docklands/data/ba/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/docklands/data/ba/) | 316 | 1.78 | Globe terrain, map lines, labels and place cards; factual attributes available through readers, separate from KGX. |
| Sky and environmental snapshots | [londat/cwplans/docklands/data/sky/](https://github.com/danbri/londat/tree/5ece04a8144e962ba40fac81e724b106161d4dcb/cwplans/docklands/data/sky/) | 12 | 1.19 | Visual sky, satellites, weather and time-dependent context. |

## Geography and data density

The densest entity/occupancy/factual coverage is Canary Wharf / E14 and the wider Docklands model box. National or worldwide map coverage does not imply equally detailed factual coverage or KGX ingestion. UK OS map layers generally cover Great Britain, whereas ONS boundaries can include Northern Ireland. Census population attributes in the UK skeleton cover England and Wales, not a complete UK population layer.

Eight place sets are represented: London, UK-lite outside Greater London, León, Sarajevo, Dublin, Berlin, Stuttgart and Dagstuhl/Wadern. Their detailed cores, city blocks and wider terrain surroundings are different coverage tiers. The machine catalogue records these boxes separately in schema.org latitude–longitude order, converted from the index’s west–south–east–north arrays. A surrounding terrain box must not be reported as complete building coverage.

Current index counts are source/model records, not a property census; parts and footprint-selection rules matter. For example, Greater London has 1,399,437 drawn buildings in its index. UK-lite has 22,744,459 with 83,428 landmark rows. Counts differ from earlier README snapshots; the source register and generated documentation may retain historical numbers. See each set’s provenance log and feature table for the exact population.

## Time, change and retention

No single temporal interval describes this collection. Fetch time answers “when did we acquire it”; source epoch answers “what period does it represent”; validity dates answer “when was this fact true”; build time answers “when did we derive this output”. These must remain distinct. The catalogue keeps ambiguous date prose in `cat:sourcePeriodNote`, rather than manufacture `schema:temporalCoverage` from a fetch date.

- Geometry and terrain: OSM/Overture snapshots and terrain acquisition periods differ. Heights may be measured, derived from floors, taken from a raster or defaulted. A time slider does not turn a current footprint/height snapshot into a historical reconstruction.
- Imagery: EA RGB 2007–08, night imagery 2012 and intensity 2020 are distinct observation epochs. Model skyline samples span different LiDAR flights.
- Official facts: ONSPD August 2026, Census 2021, boundary editions, company status, school/care register dates and property-sale periods coexist. A closed business or former occupant must not be read as current merely because its record still exists.
- Live state: intended five-minute aircraft/ship/METAR loop; hourly normalized live-history loop; daily aircraft-history acquisition with a seven-day rolling branch. Schedules can be delayed or skipped. Check observation time and freshness, not just workflow cron.
- Retention: live-cache has short rolling series (aircraft about 60 minutes, ships about two hours, METAR 24 hours locally/six hours for other places). The register says the latest position of a listed ship may be retained at any age. Hourly history has run deltas and closed-month SQLite files. Removing a current JSON record does not remove archives or Git history.

The change-rate statements below are expected operational behaviour, not measured daily churn. A freshness dashboard would need actual publisher update timestamps, successful poll times, row/byte deltas and retention checks; that instrumentation is not added here.

## Use and serving decisions

The 3D map and KGX are complementary consumers. Tile geometry and image atlases chiefly support visualization. `features.json`, source manifests, registry records and place readers also support text search, cards and nonvisual view descriptions. They are useful factual layers without all being RDF graphs. KGX lifts selected facts, registry/occupants, website canonical data, mall evidence, photos and provenance; it is not a full RDF representation of every globe tile or every discovered portal resource.

KGX manifest evidence: **481,377 triples** across 35 current logical graph entries, with a combined export and historical graph-version files. Browser Shardborough generation `gen-facf5340c7b1e696` has **142,314 quads**, 61 graph parts and 1,046 blocks; its manifest reports 6,278 store files and 23,153,084 stored bytes. The inventoried `kgx/` family also includes versions, logs and alternate representations, so its storage total is larger. The manifest’s builder engine label still records the engine used for that build; the browser worker package has since been updated.

| Consumer / payload | Present design | Assessment |
|---|---|---|
| Regional buildings / terrain | 3D Tiles, glTF, LOD, compact boxes, spatial cells | Optimized static serving is already essential and present. Keep viewport selection, feature IDs and source credits. Do not replace with one world-sized JSON download. |
| UK/world skeleton vectors | Quantized, spatially partitioned layers at multiple scales | Continue scale/extent selection; exact features and coarse map representations are different products. |
| Dense Docklands model and layers | Compact model with sidecars and optional layers | Profile first-load bytes and draw cost; spatial/layer splitting is a future option, not an established need to replace the stack. |
| KGX factual queries | Indexed Shardborough range reads, compressed full export | Keep browser indexing and benchmark query shapes/cold-warm access. Current browser measurements do not establish a need to migrate server-side. See [benchmark report](https://github.com/danbri/londat/blob/main/docs/benchmarks/2026-11-01-factoidal-browser.md). |
| Live state | Small normalized caches and rolling series | TTL, stale-state reporting, backoff and source/API terms are important. Static caches avoid each client repeatedly polling upstream. |
| Bulk GIS/statistical extracts | Mostly raw GitHub delivery; GeoPackage exports | Keep downloads separate from startup payload. Spatial clips, filter/index APIs or columnar formats may help if measured demand grows. |
| Raw web/model evidence | Repository-only folders excluded from Pages | Publication exclusion is not permission clearance or privacy. Factual extracts may still flow into public registry/KGX outputs. |

Deployment evidence: [Pages workflow](https://github.com/danbri/londat/blob/main/.github/workflows/pages.yml) excludes `third_party/` except Three.js, hourly run files, monthly SQLite and most Datastore/portal dataset directories. Four Datastore overlays remain on Pages; [data-base.js](https://github.com/danbri/londat/blob/main/cwplans/data-base.js) redirects other bulk extract reads to raw GitHub. Docklandia has a separate static Pages site on the same origin; source exclusion in Londat is not automatically inherited by derived outputs.

## Family detail

### Aerial imagery and facade texture atlases

**Use:** Visual ground and facade textures; metadata links source photos and credits.

**Coverage:** Docklands and contributed Canada Water facades

**Time:** Aerial RGB 2007–08; night 2012; intensity 2020; facade photo dates vary. **Change:** Snapshot; rebuild atlas when inputs change.

**Serving:** Prebuilt image atlases; load relevant resolution, keep per-tile credit metadata.

**Rights:** EA OGL imagery; CC BY photo tiles require author, licence and modification credit; CC0 contributed tiles separate.

### Atlas extracts

**Use:** Joined factual/spatial browser index, derived from registry/model/other inputs.

**Coverage:** Canary Wharf/Docklands

**Time:** Snapshot with mixed input dates. **Change:** Rebuilt with inputs.

**Serving:** Index first, entity details on demand; avoid treating duplicated export bytes as extra observations.

**Rights:** Mixed source rights, ODbL-derived outlines and joined review sources.

### Bosnia and Herzegovina skeleton

**Use:** Globe terrain, map lines, labels and place cards; factual attributes available through readers, separate from KGX.

**Coverage:** Bosnia and Herzegovina

**Time:** Mixed epochs: terrain acquisition, land cover year, boundaries and gazetteer release differ. **Change:** Snapshot; rebuild with source manifests, no automatic refresh inferred.

**Serving:** Already partitioned spatially and by scale. Keep tiles/quantized vectors; avoid downloading country/world raw datasets at page startup.

**Rights:** Per-source terms: public domain, OGL, CC BY, Copernicus; regional OSM layers ODbL. No blanket grant.

### Building registry, occupants and source joins

**Use:** Factual entity layer and main KGX inputs: buildings, companies, premises, brands, heritage, construction, water, facades and website facts.

**Coverage:** Dense Canary Wharf / E14, with source-specific wider searches

**Time:** Active/closed records, dates, former occupants, dated crawls; missing validity dates do not mean current. **Change:** Snapshot rebuilds; businesses, construction and hours can change daily.

**Serving:** Small indexes and entity cards; keep stable IDs, join confidence and source dates. KGX handles cross-source queries.

**Rights:** Mixed OGL/CC0/ODbL/CC BY, source conditions and website scoping reviews. Geometry joins do not erase rights.

### CWG directory, mall map, guide and evidence

**Use:** Raw/parsed estate directory and indoor-map evidence; some factual extracts lifted to KGX.

**Coverage:** Canary Wharf malls and estate

**Time:** Dated crawls/archive copies, floorplans and store-guide editions. **Change:** Website snapshots; can become stale quickly.

**Serving:** Repository-only evidence excluded from Pages; do not expose raw material by adding download links to Pages.

**Rights:** No general open licence; scoping review, facts vs copied expression and database extraction must be distinguished.

### Casco Histórico, León

**Use:** Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX.

**Coverage:** Casco Histórico, León; core, city and surroundings differ; see bounding boxes below.

**Time:** Built 2026-10-21T00:30:31.631Z; mixed source acquisition epochs, not a historical reconstruction. **Change:** Snapshot; manual tool rebuild. Upstream OSM changes continually; Overture uses dated releases.

**Serving:** Already optimized: 3D Tiles 1.1 / glTF quadtree, LOD, compact boxes; fetch visible tiles, retain feature IDs and attribution.

**Rights:** Mixed source terms; ODbL-derived buildings plus credited terrain/landcover/height sources. Check per-source terms and review notes.

### Central Dublin

**Use:** Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX.

**Coverage:** Central Dublin; core, city and surroundings differ; see bounding boxes below.

**Time:** Built 2026-10-22T12:12:16.829Z; mixed source acquisition epochs, not a historical reconstruction. **Change:** Snapshot; manual tool rebuild. Upstream OSM changes continually; Overture uses dated releases.

**Serving:** Already optimized: 3D Tiles 1.1 / glTF quadtree, LOD, compact boxes; fetch visible tiles, retain feature IDs and attribution.

**Rights:** Mixed source terms; ODbL-derived buildings plus credited terrain/landcover/height sources. Check per-source terms and review notes.

### Committed raw/source snapshots

**Use:** Raw source extracts, station control facts and original corridor model; excludes ignored downloads.

**Coverage:** Corridor / E14 / Docklands

**Time:** Per-source snapshot dates in register; raw timestamp differs from represented epoch. **Change:** Manual fetch snapshots.

**Serving:** Build inputs, not startup payload; ignored raw downloads are accounted separately where recorded.

**Rights:** Per-source rights; raw restricted originals may deliberately be absent.

### Contributed images and calibration

**Use:** Original contributed photos, annotations, camera/calibration and facade evidence.

**Coverage:** Canada Water/Docklands walks

**Time:** Dated photo sets; missing EXIF distinguished from owner-reported capture time. **Change:** Append-only contributed sets; annotations may be revised.

**Serving:** Image originals for evidence; use derived atlases/thumbs in rendering.

**Rights:** Owner contributions declared CC0 where README states; third-party subjects/marks and privacy decisions remain separate.

### Docklands core model and factual sidecars

**Use:** Detailed 3D terrain, buildings, water, roads, rail, tunnels, indoor paths, trees and feature keys; cited factual layers.

**Coverage:** Docklands, Thames corridor, Canary Wharf and Canada Water

**Time:** Mixed LiDAR surveys, OSM snapshot, cited completion/occupancy dates and historical skyline samples. **Change:** Manual builds; underlying sources change at different rates.

**Serving:** Existing compact JS/JSON model; layer-on-demand and spatial partitioning merit profiling for growth.

**Rights:** OSM ODbL-derived geometry; OGL LiDAR and other sources; cited facts/review material; source-by-source obligations.

### Global detail vectors and gazetteer

**Use:** Globe terrain, map lines, labels and place cards; factual attributes available through readers, separate from KGX.

**Coverage:** World

**Time:** Mixed epochs: terrain acquisition, land cover year, boundaries and gazetteer release differ. **Change:** Snapshot; rebuild with source manifests, no automatic refresh inferred.

**Serving:** Already partitioned spatially and by scale. Keep tiles/quantized vectors; avoid downloading country/world raw datasets at page startup.

**Rights:** Per-source terms: public domain, OGL, CC BY, Copernicus; regional OSM layers ODbL. No blanket grant.

### Global reference vectors

**Use:** Globe terrain, map lines, labels and place cards; factual attributes available through readers, separate from KGX.

**Coverage:** World

**Time:** Mixed epochs: terrain acquisition, land cover year, boundaries and gazetteer release differ. **Change:** Snapshot; rebuild with source manifests, no automatic refresh inferred.

**Serving:** Already partitioned spatially and by scale. Keep tiles/quantized vectors; avoid downloading country/world raw datasets at page startup.

**Rights:** Per-source terms: public domain, OGL, CC BY, Copernicus; regional OSM layers ODbL. No blanket grant.

### Global terrain and base

**Use:** Globe terrain, map lines, labels and place cards; factual attributes available through readers, separate from KGX.

**Coverage:** World

**Time:** Mixed epochs: terrain acquisition, land cover year, boundaries and gazetteer release differ. **Change:** Snapshot; rebuild with source manifests, no automatic refresh inferred.

**Serving:** Already partitioned spatially and by scale. Keep tiles/quantized vectors; avoid downloading country/world raw datasets at page startup.

**Rights:** Per-source terms: public domain, OGL, CC BY, Copernicus; regional OSM layers ODbL. No blanket grant.

### Greater London

**Use:** Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX.

**Coverage:** Greater London; core, city and surroundings differ; see bounding boxes below.

**Time:** Built 2026-10-23T16:22:32.719Z; mixed source acquisition epochs, not a historical reconstruction. **Change:** Snapshot; manual tool rebuild. Upstream OSM changes continually; Overture uses dated releases.

**Serving:** Already optimized: 3D Tiles 1.1 / glTF quadtree, LOD, compact boxes; fetch visible tiles, retain feature IDs and attribution.

**Rights:** Mixed source terms; ODbL-derived buildings plus credited terrain/landcover/height sources. Check per-source terms and review notes.

### Hourly live history and GIS exports

**Use:** Normalized live snapshots/history plus GeoPackage exports of core, Datastore and portal layers.

**Coverage:** Docklands/zone; source-dependent

**Time:** Hourly run deltas, latest 24 h series, closed-month SQLite; exports are snapshots. **Change:** Hourly history workflow; latest rewritten each run; GIS exports rebuild separately.

**Serving:** Latest JSON for browser; SQLite/month and delta archives for analysis; GeoPackage indexed GIS. History excluded from Pages.

**Rights:** Mixed layers retain their own licences; AIS scoping review. Export container is not a blanket relicensing.

### Knowledge graph, versions and browser store

**Use:** RDF factual layers, source evidence, named graph provenance, immutable versions, complete export and indexed browser subset.

**Coverage:** Dense Canary Wharf/Docklands; selected contributed photos and model facts; not all national/world tiles.

**Time:** Manifest build 2026-10-26; multiple immutable graph versions and historical inputs. **Change:** Rebuild operations create new versions; browser worker package update does not rebuild graph contents.

**Serving:** Shardborough indexed range-read store already used. Keep full export and browser subset distinct; benchmark joins and cold/warm reads before considering server database.

**Rights:** Per-graph mixed source licence text. Browser subset and full export have different membership; conversion to RDF does not remove obligations.

### Live, river, works, events, underground and KML records

**Use:** Visual overlays, time-series/live panels, events, alerts, underground source evidence and KML discovery/copies.

**Coverage:** Primarily London/Docklands; discovery can extend further

**Time:** Publication/event/validity/observation intervals; failures and stale records possible. **Change:** Source-specific live updates; committed snapshots require refresh; RSS discovery is not a complete event archive.

**Serving:** Cache normalized small responses, use TTLs and backoff, disclose stale observations; large KML spatially clip.

**Rights:** Mixed open licences, source API terms and scoping-only sources; each KML/event source keeps its status.

### London Datastore catalogue and extracts

**Use:** Catalogue discovery plus selected spatial/statistical factual overlays; not every catalogue hit is harvested.

**Coverage:** London source datasets; extracts often clipped to project zone

**Time:** Dataset-specific planning years, surveys, Census periods and snapshots. **Change:** Varies by publisher/dataset; catalogue discovery date differs from resource update date.

**Serving:** Bulk directories mostly served from raw GitHub, not Pages; four map overlays retained on Pages. Spatially clip/index larger layers.

**Rights:** Per-dataset OGL v2/v3, CC BY, ODC-By or stated conditions; portal membership is not a licence.

### Mitte, Berlin

**Use:** Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX.

**Coverage:** Mitte, Berlin; core, city and surroundings differ; see bounding boxes below.

**Time:** Built 2026-10-22T13:47:19.708Z; mixed source acquisition epochs, not a historical reconstruction. **Change:** Snapshot; manual tool rebuild. Upstream OSM changes continually; Overture uses dated releases.

**Serving:** Already optimized: 3D Tiles 1.1 / glTF quadtree, LOD, compact boxes; fetch visible tiles, retain feature IDs and attribution.

**Rights:** Mixed source terms; ODbL-derived buildings plus credited terrain/landcover/height sources. Check per-source terms and review notes.

### Mitte, Stuttgart

**Use:** Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX.

**Coverage:** Mitte, Stuttgart; core, city and surroundings differ; see bounding boxes below.

**Time:** Built 2026-10-22T12:15:02.633Z; mixed source acquisition epochs, not a historical reconstruction. **Change:** Snapshot; manual tool rebuild. Upstream OSM changes continually; Overture uses dated releases.

**Serving:** Already optimized: 3D Tiles 1.1 / glTF quadtree, LOD, compact boxes; fetch visible tiles, retain feature IDs and attribution.

**Rights:** Mixed source terms; ODbL-derived buildings plus credited terrain/landcover/height sources. Check per-source terms and review notes.

### North-west Spain skeleton

**Use:** Globe terrain, map lines, labels and place cards; factual attributes available through readers, separate from KGX.

**Coverage:** North-west Spain

**Time:** Mixed epochs: terrain acquisition, land cover year, boundaries and gazetteer release differ. **Change:** Snapshot; rebuild with source manifests, no automatic refresh inferred.

**Serving:** Already partitioned spatially and by scale. Keep tiles/quantized vectors; avoid downloading country/world raw datasets at page startup.

**Rights:** Per-source terms: public domain, OGL, CC BY, Copernicus; regional OSM layers ODbL. No blanket grant.

### Other portal catalogues and extracts

**Use:** data.gov.uk, planning.data.gov.uk, borough, Nomis, ONS and national discovery plus selected factual/spatial extracts.

**Coverage:** UK/national discovery; selected zone subsets; coverage varies by resource

**Time:** Census, boundary and survey editions coexist; preserve represented period. **Change:** Varies; discovery is not evidence that a resource is current or downloaded.

**Serving:** Bulk directories use raw GitHub. Keep catalogue separate from extracted layers; use GeoPackages for GIS and indexed subsets for browser.

**Rights:** Record-level terms retained; do not assign OGL simply because a public portal lists a dataset.

### Postcode framework

**Use:** E14 postcode status, ward, coordinate, company/sales aggregates and discovery evidence; registry join framework.

**Coverage:** E14 and Canary Wharf ward

**Time:** ONSPD August 2026, introduced/terminated dates and source-specific aggregates. **Change:** ONSPD editions periodically; local outputs rebuilt manually.

**Serving:** Small JSON/CSV; retain stable postcode keys and geocoding uncertainty.

**Rights:** OGL with required ONS, OS and Royal Mail notices; OSM-derived streets/counts tracked separately.

### Quality, coverage, reports and provenance

**Use:** Data-quality findings, source-discovery coverage and pipeline metadata alongside software/documentation.

**Coverage:** Project scope varies

**Time:** Audit/build dates are metadata dates, not surveyed dates. **Change:** Changes when tools/audits are run.

**Serving:** Small reports/manifests; generated metadata can still grow; this residual family also contains software.

**Rights:** Project metadata lacks a clear blanket data grant; underlying quoted/source facts retain their provenance.

### Rendered website structured-data harvest

**Use:** Page-scoped JSON-LD/microdata/RDFa, N-Quads, idiom/shape and rewrite analyses; canonical portions in KGX.

**Coverage:** Selected local businesses/brands and linked websites

**Time:** Crawl/render observations and dated checks; not proof facts remain true. **Change:** Snapshot, recrawl needed; source sites vary.

**Serving:** Evidence repository-only, gzip RDF; index normalized facts rather than load whole crawl into browser.

**Rights:** Public markup does not grant an open data licence; owner scoping permission is not publisher permission.

### Schloss Dagstuhl, Wadern

**Use:** Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX.

**Coverage:** Schloss Dagstuhl, Wadern; core, city and surroundings differ; see bounding boxes below.

**Time:** Built 2026-10-22T12:03:57.135Z; mixed source acquisition epochs, not a historical reconstruction. **Change:** Snapshot; manual tool rebuild. Upstream OSM changes continually; Overture uses dated releases.

**Serving:** Already optimized: 3D Tiles 1.1 / glTF quadtree, LOD, compact boxes; fetch visible tiles, retain feature IDs and attribution.

**Rights:** Mixed source terms; ODbL-derived buildings plus credited terrain/landcover/height sources. Check per-source terms and review notes.

### Sky and environmental snapshots

**Use:** Visual sky, satellites, weather and time-dependent context.

**Coverage:** Model/globe, source-dependent

**Time:** Forecast/observation times and orbital epochs; not interchangeable with download time. **Change:** Source-dependent snapshots and live fetches.

**Serving:** Small cached snapshots; preserve observation/forecast/expiry times.

**Rights:** Per-source licence, credit and API terms; inspect register.

### Stari Grad, Sarajevo

**Use:** Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX.

**Coverage:** Stari Grad, Sarajevo; core, city and surroundings differ; see bounding boxes below.

**Time:** Built 2026-10-21T00:30:49.470Z; mixed source acquisition epochs, not a historical reconstruction. **Change:** Snapshot; manual tool rebuild. Upstream OSM changes continually; Overture uses dated releases.

**Serving:** Already optimized: 3D Tiles 1.1 / glTF quadtree, LOD, compact boxes; fetch visible tiles, retain feature IDs and attribution.

**Rights:** Mixed source terms; ODbL-derived buildings plus credited terrain/landcover/height sources. Check per-source terms and review notes.

### Synthetic and trained splats

**Use:** Experimental visual rendering derived from the 3D model; not measured photogrammetry.

**Coverage:** Canary Wharf estate and roughly 300 m surroundings

**Time:** Derived from model snapshot and source imagery epochs. **Change:** Manual regeneration.

**Serving:** Large binary splats already gzip compressed; lazy load; keep grouping and source metadata.

**Rights:** Model and imagery source obligations survive conversion; rendering format does not establish a new licence.

### TfL station models and source evidence

**Use:** Station 3D source models and plans for underground reconstruction/evidence.

**Coverage:** Selected London stations

**Time:** Source model/FOI dates vary; not guaranteed as-built/current. **Change:** Snapshot; manual updates.

**Serving:** Repository-only evidence excluded from Pages; derived model review separate.

**Rights:** FOI release and accessibility are not general reuse permission; check source-specific notices.

### UK skeleton

**Use:** Globe terrain, map lines, labels and place cards; factual attributes available through readers, separate from KGX.

**Coverage:** United Kingdom; OS layers Great Britain only; Census populations England and Wales only

**Time:** Mixed epochs: terrain acquisition, land cover year, boundaries and gazetteer release differ. **Change:** Snapshot; rebuild with source manifests, no automatic refresh inferred.

**Serving:** Already partitioned spatially and by scale. Keep tiles/quantized vectors; avoid downloading country/world raw datasets at page startup.

**Rights:** Per-source terms: public domain, OGL, CC BY, Copernicus; regional OSM layers ODbL. No blanket grant.

### United Kingdom (lite buildings)

**Use:** Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX.

**Coverage:** United Kingdom (lite buildings); core, city and surroundings differ; see bounding boxes below.

**Time:** Built 2026-10-23T16:09:26.873Z; mixed source acquisition epochs, not a historical reconstruction. **Change:** Snapshot; manual tool rebuild. Upstream OSM changes continually; Overture uses dated releases.

**Serving:** Already optimized: 3D Tiles 1.1 / glTF quadtree, LOD, compact boxes; fetch visible tiles, retain feature IDs and attribution.

**Rights:** Mixed source terms; ODbL-derived buildings plus credited terrain/landcover/height sources. Check per-source terms and review notes.

## Licence audit and consequences



The register has **528 source records and 821 file-pattern records**. Every source has a nonempty `licence` string, but only **21** have a dedicated `licence_url`; a prose string may describe unknown, conditional or scoping-only rights. **15** source records say CC BY with no version stated. The explicit `licence_class` field exists on only 15 sources (7 open, 6 share-alike, 2 review); absence of that field is not a clearance decision. **58 file records** carry explicit review notes, with one or more of **14 review groups**. This is not the full review population: **127** file records have OSM use other than none (70 derived, 25 counts, 14 ids, 12 notes, 6 raw), while many have no individual review flag. File records can be patterns and can overlap; do not report these as counts of distinct physical files.

### Consequences by licence family

| Family | Recorded use | Operational assessment |
|---|---|---|
| OGL v3/v2, ODC-By, CC BY | UK official geography, public registers, London Datastore, LiDAR, Irish terrain, GHSL | Generally compatible with commercial reuse and adapted products subject to the actual grant. Preserve source-specific credits, licence version, exclusions and modification history. ONS/OS/Royal Mail credits must survive clipping and joins. Do not silently turn unspecified CC BY into CC BY 4.0. |
| ODbL 1.0 | OSM, Overture building/OSM-derived themes, Microsoft buildings, adsb.lol | Attribution is required. A publicly used derivative database must be offered under ODbL, and recipients must have machine-readable access to the derivative database or qualifying alteration material. Produced images need notices; they do not automatically acquire the database licence. Independent datasets in a collective database are distinguished from derivatives. Preserve source boundaries and decide the status of each joined registry, tile payload and KG graph. ODbL does not license all separate content rights. See [ODbL sections 1, 2 and 4](https://opendatacommons.org/licenses/odbl/1-0/). |
| CC BY 4.0 | GHSL, WorldCover, some facades, Irish terrain, many portal layers | Retain attribution, notices and licence link; mark modifications. Database rights are addressed. Other rights and third-party material remain separate. See [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.en). |
| CC BY-SA 4.0 | Wikipedia quotations in facts.json | Text adaptations require compatible ShareAlike terms and credit. Do not label an entire mixed file as freely relicensed merely because one component is CC BY-SA. Separate quotations from factual values and source links when deciding publication grants. See [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en). |
| CC0 / public domain | Wikidata, designated owner photos, Natural Earth, some US government sources | No copyright attribution condition under CC0, though provenance credits remain useful. The dedication covers the affirmer's rights, not all possible privacy, trademark or third-party rights. Public-domain status needs the source and jurisdiction recorded. See [CC0](https://creativecommons.org/publicdomain/zero/1.0/). |
| Bespoke permissive terms | Copernicus DEM and Sentinel, Berlin dl-de/zero-2.0, Catastro transformed products | Keep the exact grant and required credit; do not normalize every such source to CC BY. Catastro is particularly different: the recorded licence permits transformed data and forbids redistributing original files. |
| No open grant / scoping permission | Crawls, Living Map, public FOI/AIP/NOTAM facts, some AIS events | Public access, schema.org markup, FOI disclosure, and an owner's prototyping decision do not themselves grant third-party reuse rights. Facts-only extraction still needs the relevant database-right, contract and publication assessment. Do not put a guessed schema:license URI on these distributions. |

OGL reference: [National Archives OGL v3](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). The direct page returned 403 during this audit; its v3 text was corroborated by a [GOV.UK-hosted copy](https://assets.publishing.service.gov.uk/media/68593c89c440666366ded608/Information%2Brequired%2Bat%2BRegistration%2Band%2Bthe%2BPublic%2BRegister.pdf). OGL permits commercial and noncommercial reuse with attribution, excludes specified rights/material and does not imply endorsement. This is distinct from an unrestricted grant over every field in a public-sector download.

## Priority ambiguities already recorded

1. **Project-authored material has no clear grant.** Source `own` says “repository licence”; LICENSE-DATA.md says there is no blanket repository data licence and that project-written indexes, triage, catalogue walks and harvest logs have no stated licence. `own` is referenced by 242 file records. Resolve deliberately; this catalogue must not invent a grant over either metadata or third-party inputs.
2. **AIS is per event, not one open aggregate.** Open Waters passes upstream licences through. AISHub's reported private permission is revocable; aisstream.io has no published terms; the owner accepted them for scoping. Separate CC0/NLOD/CC BY receptions from those classes. Deleting a current snapshot will not remove historical run files, monthly SQLite or Git history. The hosted service's personal/commercial tier is separate from rights over events.
3. **León's IGN records remain distinct review classes.** Overture IGN geometry/floor entries lack a source licence; general IGN licensing does not confirm those records. Catastro floor-derived heights are a separate transformed-only issue. Do not present the whole León set as uniformly CC BY or uniformly cleared merely because terrain is CC BY.
4. **Crawls and archived maps are different from open data.** CWG directory facts, site structured data and Living Map indoor tiles have no recorded open grant. The existing third_party exclusion from Pages reduces deployment exposure but does not establish permission, nor make an upstream repo private. Crawled facts also enter published joins/KG; the exclusion is not transitive.
5. **Public-sector facts are not automatically OGL.** NATS PIB/AIP, Planning London Datahub, TfL FOI depths, CelesTrak and CAA count excerpts have unknown or restricted terms recorded. TfL axonometric sheets have restricted RPSI reuse and are a layout guide, not open source geometry. Do not call these OGL by association.
6. **Other targeted checks:** HMLR INSPIRE has additional conditions; the OSTN15 grant text is not fully recorded; unspecified CC BY versions need confirmation; METAR NOAA/IEM public-domain delivery does not settle the Met Office origin; owner reference-photo grants differ by set.
7. **Data licence and API access differ.** Open-Meteo data are recorded as CC BY 4.0 while its free API is noncommercial. Optimizing or self-hosting a cache changes access costs and load; it does not cure missing rights or erase attribution/share-alike obligations.

## Applying this in RDF

Use `schema:license` only for a confirmed grant over the described dataset/distribution, preserving the exact version. Keep `schema:isBasedOn` links to source datasets and source-specific licence assertions; never represent a list of upstream licences as if it were a menu of alternative licences for the combined product. Unknown terms belong in a status/note property. Keep recorded licence claims in a separate named graph from this assessment. Retain named-graph provenance in KGX and per-layer notices in GeoPackages, and include credits in tile manifests/cards and downloadable metadata. Moving data server-side does not remove ODbL obligations for public use of a derivative database or its produced works.


## Gaps and next decisions

1. Confirm a deliberate licence for project-authored catalogue/index metadata; do not infer one from the `own` source key.
2. Resolve the already recorded rights reviews, especially León IGN records, Catastro-derived products, AIS receptions, source website/mall material and public-sector exceptions. Preserve originals and review evidence; this task does not remove or relicense anything.
3. Capture explicit licence-version URLs and publisher attribution at acquisition. The existing prose is valuable but difficult to enforce automatically. Do not normalize the 15 unspecified CC BY records to version 4.0.
4. Record represented periods and valid-from/valid-to dates separately from fetch/build timestamps. Add measured source update rates before making freshness guarantees.
5. Reconcile index/README/register counts when the existing generation pipeline is next rebuilt; this catalogue records discrepancies rather than patching current data.
6. Measure separate cache branches and ignored raw-download inventory if a whole-disk capacity audit is needed. Historical raw-extract sizes here are acquisition evidence, not current disk usage.

## Reproduction and validation

The additive builder is [tools/build-dataset-catalogue.py](https://github.com/danbri/londat/blob/main/tools/build-dataset-catalogue.py). Run with `--londat`, `--docklandia` and a separate `--output` directory. It produces the TriG, compressed file ledger and JSON calculation summary; this readable report is an editorial snapshot. The builder never modifies input datasets. Rebuilding after commits can change the snapshot and totals.

Validation completed: the TriG contains 21,065 quads in two named graphs, including 1,380 Dataset nodes. Parsed with Factoidal 0.28.0; source links, all Dataset names/descriptions, inventory uniqueness, byte sums and registered-pattern coverage pass. Validation procedure: parse the TriG with `@factoidal/core` 0.28.0; check graph separation, every Dataset name/description, source-link targets, 821 artifact records, 528 source records, file-inventory uniqueness, byte sums, geographic axis order and registered pattern coverage. Catalogue files are additional documentation/data; application/browser behaviour is unchanged.
