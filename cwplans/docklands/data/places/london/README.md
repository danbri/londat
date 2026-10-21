# Greater London: a place on the globe (3D Tiles 1.1)

Made by [cwplans/tools/build-place-tiles.mjs](https://github.com/danbri/londat/blob/main/cwplans/tools/build-place-tiles.mjs) for the region config [docklands/geo/regions/london.js](https://github.com/danbri/londat/blob/main/docklands/geo/regions/london.js); drawn by the globe of the Three.js port ([docklands/globe/places.js](https://github.com/danbri/londat/blob/main/docklands/globe/places.js)).
This README is generated from `provenance/log.json` and [cwplans/data-register.json](https://github.com/danbri/londat/blob/main/cwplans/data-register.json) by `node cwplans/tools/build-place-tiles.mjs readme --region london` (also at the end of each build). Do not edit it by hand.

- The whole city (20 km out): https://danbri.github.io/londat/docklands/?ll=51.50735,-0.12776,20000&ht=0,45
- Holborn and the West End (3 km; the City east of it is in the model box): https://danbri.github.io/londat/docklands/?ll=51.5175,-0.1180,3000&ht=250,55
- Croydon (2 km): https://danbri.github.io/londat/docklands/?ll=51.3762,-0.0982,2000&ht=0,55
- BT Tower (700 m): https://danbri.github.io/londat/docklands/?ll=51.5215,-0.1389,700&ht=200,60
- A place of kind "blocks": no core and no ground of its own (the globe's terrain and imagery stay); buildings in the model box of docklands are left to that model
- Area (WGS84 degrees, west, south, east, north): -0.5102, 51.2868, 0.334, 51.6919; 1399437 buildings; built 2026-10-21T20:33:45.579Z
- Credit shown on the page: © OpenStreetMap contributors (ODbL 1.0); Buildings: OpenStreetMap data via Overture Maps © Overture Maps Foundation (ODbL 1.0); Some city buildings: Microsoft ML Buildings via Overture Maps © Microsoft (ODbL 1.0); Building heights and floors from Overture Maps buildings © Overture Maps Foundation (ODbL 1.0; includes data © Microsoft, © OpenStreetMap contributors and others per record); Building heights from Microsoft Global ML Building Footprints © Microsoft (ODbL 1.0); Building heights (where OSM has none) from GHS-BUILT-H R2023A © European Union, 1995-2026, JRC (CC BY 4.0); Ground: Copernicus DEM GLO-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA (the globe's world-base heights)
- Skill: docklands-3d-page, "Three.js port: places as 3D Tiles (2026-10-18)"; fault F55 in the docklands-data-curation skill

## Files

| path | what | bytes | SHA-256 |
|---|---|---|---|
| [tiles/](https://github.com/danbri/londat/blob/main/cwplans/docklands/data/places/london/tiles) (2451 files) | glTF 2.0 tile of the city or the surroundings: terrain grid with a JPEG texture (land cover, water, roads, rail), city blocks (KHR_mesh_quantization, EXT_mesh_gpu_instancing) | 106721380 | `3a0920c78f7dc5d750a2cddeb35ffd24de85cac0d08c7624157e36672d1f1976` |
| [tileset.json](https://github.com/danbri/londat/blob/main/cwplans/docklands/data/places/london/tileset.json) | 3D Tiles 1.1 tileset: one child per quadtree cell, ENU -> ECEF transform, region bounding volume | 995626 | `a4b83cd50ce331838956489cbdbd9def80914ce6bda4e6906f8aea554e5e0c41` |
| [features.json](https://github.com/danbri/londat/blob/main/cwplans/docklands/data/places/london/features.json) | the text and machine interface: the named buildings drawn with their own id (name, height and its source, OSM id), the block counts by level | 731391 | `a1f6cf1fee0653c311019566d64856642d78be5b941e3e9eb4a4487bf684cf28` |
| [sources/ghsl-built-h.json.gz](https://github.com/danbri/londat/blob/main/cwplans/docklands/data/places/london/sources/ghsl-built-h.json.gz) | committed source extract (input of an operation; see Sources) | 360388 | `d98714b48391c0c3f1a977af8e51b9f48b93c515f305baa281d4909df024e70b` |
| [provenance/log.json](https://github.com/danbri/londat/blob/main/cwplans/docklands/data/places/london/provenance/log.json) | fetch records and dataflow activities (inputs and outputs by SHA-256), height-source and roof counts | 1809785 | `50a220c321d7b6f8a1be2d455ad4b926bd641c0cb93137fec247b9b204d595dc` |

Total 110.62 MB (README.md not counted).

## Sources

### overture-buildings: Overture Maps Foundation, buildings theme, release 2026-09-23.1 (GeoParquet on the public bucket overturemaps-us-west-2), read by bounding box with DuckDB

- Register source: `overture-buildings` ([DATA-REGISTER.md](https://github.com/danbri/londat/blob/main/cwplans/DATA-REGISTER.md))
- Publisher: Overture Maps Foundation (records from OpenStreetMap, Microsoft ML Buildings, Instituto Geográfico Nacional (España), Esri Community Maps and others, named per record in its sources list)
- Landing page: https://docs.overturemaps.org/attribution/
- Licence: ODbL 1.0 (buildings theme); per record and property the sources list names the original dataset and its licence (https://opendatacommons.org/licenses/odbl/1-0/)
- Credit (exact text): "© Overture Maps Foundation; © OpenStreetMap contributors; © Microsoft (and the other sources named per record)"
- Fetched: 2026-10-21T20:21:41.185Z
- Request: `s3://overturemaps-us-west-2/release/2026-09-23.1/theme=buildings/type=building/ (bbox -0.52,51.28,0.34,51.7; files part-00124-5e200299-5dc8-5a43-bb1e-0a73aba3373f-c000.zstd.parquet part-00125-dd983f4b-21a7-5215-910c-4de2f4a24e2b-c000.zstd.parquet part-00126-8f48508e-8015-5699-a61b-0cb738bc4755-c000.zstd.parquet)`
- As fetched: the query answer as written by cwplans/tools/fetch-overture-theme.py (raw folder, NDJSON); sha256 above
- Stored for the build: `data/raw/places/london/overture-buildings-2026-09-23.1.ndjson`, 1438278915 bytes, SHA-256 `bfe11fba0282c6b4636c8099d2a7851cabe4a05aca72a00f9d1eb8bb1d2adbc5` — NOT committed (raw folder, git-ignored)

## Operations (dataflow, skill cwplans-dataflow)

Each activity: id = sha256 of [operation, version, input hashes, parameters], first 16 hex. Inputs and outputs by SHA-256; a re-run with the same inputs writes nothing. Outputs under `data/raw/` are intermediate (not committed); their hashes fix the next step.

### place-select-blocks version 2 (activity `39b62025245bd57f`, 2026-10-21T20:31:32.428Z)

Skill docklands-3d-page; tool tools/build-place-tiles.mjs.

Inputs:

- overture-buildings: `data/raw/places/london/overture-buildings-2026-09-23.1.ndjson` SHA-256 `bfe11fba0282c6b4636c8099d2a7851cabe4a05aca72a00f9d1eb8bb1d2adbc5`
- boundary: `docklands/data/uk/layers/regions/6/63-50.json` SHA-256 `4e1cbe914d1f30238a5f6fa108de8bb84fc103246c4fb2fe194e96e85eb2c521`

Outputs:

- `data/raw/places/london/work/blocks-select.ndjson.gz` SHA-256 `0d59f8173e392e0a1a32e26e15d01d947851ea0b3ddefdc733cc6378f6019e20` (144000749 bytes)
- `data/raw/places/london/work/blocks-footprints.json.gz` SHA-256 `9ee1ee9d97e6a43c1b84912efc44e71e0247708aed2f49119451e01b14e2e673` (54336558 bytes)

Parameters: `{"boundary":{"skeleton":"docklands/data/uk/","layer":"regions","level":6,"code":"E12000007","name":"London","points":415},"exclude":[{"id":"docklands","origin":{"lon":-0.019497988,"lat":51.504902222,"h":45.448},"modelFrame":{"a":0.9994702116731193,"b":0.02705486218699722,"tx":0.009070344521249834,"tn":0.003921958702577293,"ty":0,"error":{"horizontalMaxM":0.086,"horizontalRmsM":0.028,"verticalMaxDropM":3.08,"againstFitMaxM":0.03}},"modelBox":{"x0":-5150,"x1":2350,"z0":-2000,"z1":3600,"inset_m":1}}],"geometrySources":["OpenStreetMap"],"licences":["ODbL-1.0","CDLA-Permissive-2.0","CDLA-Permissive-1.0","CC-BY-4.0","CC0-1.0"],"heightLabels":{"Microsoft ML Buildings":"ms"},"extraGeometry":[{"cls":"ms","dataset":"Microsoft ML Buildings"}]}`

### place-city-heights version 2 (activity `3054dab27403f7da`, 2026-10-21T20:32:50.590Z)

Skill docklands-data-curation; tool tools/build-place-tiles.mjs.

Inputs:

- selected: `data/raw/places/london/work/blocks-select.ndjson.gz` SHA-256 `0d59f8173e392e0a1a32e26e15d01d947851ea0b3ddefdc733cc6378f6019e20`
- footprint-heights: `data/raw/places/london/work/blocks-footprints.json.gz` SHA-256 `9ee1ee9d97e6a43c1b84912efc44e71e0247708aed2f49119451e01b14e2e673`
- raster-heights: `docklands/data/places/london/sources/ghsl-built-h.json.gz` SHA-256 `d98714b48391c0c3f1a977af8e51b9f48b93c515f305baa281d4909df024e70b`

Outputs:

- `data/raw/places/london/work/blocks-heights.json.gz` SHA-256 `bcb1d823a8c02b965768d26b6feb57bf0e770e892248b174fc8a86375a3557ac` (35991210 bytes)

Parameters: `{"storey_m":3,"national_storey_m":3,"default_m":7,"default_small_m":3,"raster_min_m":3,"roof_rule":null,"pitch_deg":30,"max_roof_m":8,"footprints":["ms"],"rule":"as place-heights over the selected buildings: OSM height > OSM building:levels x storey > Overture height > Overture num_floors x storey (non-OSM records, open licence, not Microsoft) > Microsoft ML Buildings height (via Overture; footprint match: a centroid inside the other outline, area ratio >= 0.5) > small kinds 3 m > GHSL cell under the centroid (min 3 m) > default; no roofs (blocks)"}`

### place-blocks version 3 (activity `ac14286044e65b6f`, 2026-10-21T20:33:45.579Z)

Skill docklands-3d-page; tool tools/build-place-tiles.mjs.

Inputs:

- selected: `data/raw/places/london/work/blocks-select.ndjson.gz` SHA-256 `0d59f8173e392e0a1a32e26e15d01d947851ea0b3ddefdc733cc6378f6019e20`
- heights: `data/raw/places/london/work/blocks-heights.json.gz` SHA-256 `bcb1d823a8c02b965768d26b6feb57bf0e770e892248b174fc8a86375a3557ac`
- world-base heights: `docklands/data/world-basedem (77 tiles over the query box; sha256 of the list of path and sha256 of each)` SHA-256 `9d33c4fab5a1009fa8c45b49cabe92e3cc486e6d7416d6ee16cc78e98a6f5aec`
- geoid: `docklands/data/world/geoid-egm96-1deg.png` SHA-256 `4e9eb4b3ac040dd6276ba74310a405fab7d5c9955c005c8f84a49103318c26ca`

Outputs:

- `docklands/data/places/london/tiles/10-1021-804.glb` SHA-256 `cf7785d1763205eaee358d1d81775f7dbed134bd8fd432d06f25e87884eb5b11` (20364 bytes)
- `docklands/data/places/london/tiles/11-2042-1609.glb` SHA-256 `f24aef4980f0a2c9c5ac2cdcd98dbb56110daf4f430c4389104f37feadd1bb7b` (15280 bytes)
- `docklands/data/places/london/tiles/12-4084-3219.glb` SHA-256 `fcc82e908ff1fc35aa2adac0bd2ae8bcd6eac8c3bbeea76d7f2bbca9b1460ea9` (6848 bytes)
- `docklands/data/places/london/tiles/13-8169-6438.glb` SHA-256 `2b51e079703c06a87b7c9a14a375d49ed6f5ce3bdb1ad58c43e0dd1a37f4569c` (6180 bytes)
- and 2449 more (the Files table above has each one)

Parameters: `{"top":10,"leaf":14,"levels":{"10":{"tall_m":60,"big_m2":20000,"merge_m":400,"err_m":300},"11":{"tall_m":40,"big_m2":8000,"merge_m":200,"err_m":150},"12":{"tall_m":25,"big_m2":3000,"merge_m":100,"err_m":75},"13":{"tall_m":18,"big_m2":600,"merge_m":50,"err_m":35}},"min_area_m2":25,"simplify_m":2.5,"box_fill":0.85,"outline_min_m2":300,"drop_m":3,"named_min_m2":1500,"named_min_h_m":20,"colour":"#d6cbb6","version_label":"london-1","extent_box":[-0.52,51.28,0.34,51.7],"classes":["OpenStreetMap (via Overture)","merged buildings (one box per square: the summed footprint, the area-weighted mean height)","Microsoft ML Buildings (via Overture)"],"class_index":{"ms":2},"credit":"© OpenStreetMap contributors (ODbL 1.0); Buildings: OpenStreetMap data via Overture Maps © Overture Maps Foundation (ODbL 1.0); Some city buildings: Microsoft ML Buildings via Overture Maps © Microsoft (ODbL 1.0); Building heights and floors from Overture Maps buildings © Overture Maps Foundation (ODbL 1.0; includes data © Microsoft, © OpenStreetMap contributors and others per record); Building heights from Microsoft Global ML Building Footprints © Microsoft (ODbL 1.0); Building heights (where OSM has none) from GHS-BUILT-H R2023A © European Union, 1995-2026, JRC (CC BY 4.0); Ground: Copernicus DEM GLO-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA (the globe's world-base heights)"}`

## What is derived from what

- `place-select-blocks`: the Overture buildings answer (NDJSON, raw) + the boundary polygon (a skeleton file) -> the buildings whose geometry is from OpenStreetMap, whose centroid is inside the boundary and not in an excluded model box (outline, area, name, kind, OSM height and levels); the records of the extra geometry classes (`place.blocks.geometry`, e.g. Microsoft ML Buildings) by the same test, where no OSM outline overlaps them; and the height values of the other records (open licence only) by dataset.
- `place-city-heights`: the selection + the footprint heights + the GHSL crop in `sources/` -> one height and its source per building (the place-heights order; fault F55 counts).
- `place-blocks`: the selection + the heights + the globe's world-base height tiles (`docklands/data/world-base/dem/`) + the EGM96 geoid grid -> `tiles/*.glb`, `tileset.json`, `features.json` (named buildings).
- `index.json` (one level up) and this README are made from these files.

## Heights and roofs (fault F55: counted, not patched)

| height source | buildings and parts |
|---|---|
| osm-height | 1354 |
| osm-levels | 224148 |
| national | 0 |
| ms | 566358 |
| default-small | 22477 |
| ghsl | 713191 |
| default | 149 |
| levels-vs-national-2plus | 0 |
| national-zero-floors | 0 |

## Levels of detail

| level | tiles | MB | triangles | boxes | outlines | named | merged boxes (buildings in them) |
|---|---|---|---|---|---|---|---|
| 10 | 14 | 0.38 | 96,490 | 360 | 0 | 0 | 9,289 (1,399,077) |
| 11 | 43 | 1.31 | 337,850 | 1,274 | 0 | 0 | 32,511 (1,398,163) |
| 12 | 138 | 4.42 | 1,148,330 | 5,883 | 0 | 0 | 108,950 (1,393,554) |
| 13 | 486 | 14.35 | 3,693,000 | 51,270 | 0 | 0 | 318,030 (1,348,167) |
| 14 | 1770 | 86.26 | 15,323,437 | 1,330,263 | 63,612 | 5562 | 0 (0) |

Loaded by screen-space error (docklands/globe/places.js): far views draw the coarse levels (tall and big buildings as their own boxes, the rest merged into one box per square), near views every building of the leaf cell. 1,399,437 buildings drawn at the leaf level, 5,562 of them named with their own id.

## Selection

| what | count |
|---|---|
| records | 2,026,838 |
| OSM buildings selected | 1,122,576 |
| height from Microsoft ML Buildings (ODbL-1.0) kept as ms | 616,322 |
| ms buildings outside the boundary | 165,463 |
| OSM buildings outside the boundary | 293,621 |
| OSM buildings in the model box (drawn by the model) | 38,824 |
| ms buildings in the model box (drawn by the model) | 1,082 |
| ms buildings selected (no OSM building there) | 405,101 |
| ms buildings dropped (overlap an OSM building) | 171 |

## Buildings by geometry class

OSM first: a footprint of an extra class that overlaps an OSM outline is dropped (its centroid, or a point pulled 20 % to its centre, inside the other outline). Each extra class has its own register source and its own switch: its adapter id in `place.blocks.geometry` of the region config (delete the id, rebuild). The block card names the class ("Footprint from"); describeView counts the blocks drawn by class.

| class | label | register source | switch | selected | dropped (overlap OSM) | drawn (>= min area) | heights (fault F55) |
|---|---|---|---|---|---|---|---|
| osm | OpenStreetMap (via Overture) | `osm` | (always) | 1,122,576 |  | 1,050,005 | ghsl 685,028, osm-levels 224,148, ms 189,445, default-small 22,477, osm-height 1,354, default 124 |
| ms | Microsoft ML Buildings (via Overture) | `overture-ms-geometry` | `overture-ms-geometry` | 405,101 | 171 | 349,432 | ms 376,913, ghsl 28,163, default 25 |

## Not committed

Raw downloads stay in `cwplans/data/raw/places/london/` (in cwplans/.gitignore): `data/raw/places/london/overture-buildings-2026-09-23.1.ndjson` (overture-buildings), the original zips and GeoTIFFs, and the intermediates in `work/`. Run `node cwplans/tools/build-place-tiles.mjs fetch --region london` to get them again (the hashes above say whether the source changed).

## Review status

- OSM (ODbL 1.0, share-alike): allowed for the prototyping phase (owner, 2026-10-03); to be reviewed with the rest of the OSM use.
- world-overture: licence class "share-alike" (ODbL 1.0 (buildings theme; per record: the licence of each source in its sources list)); allowed by the owner on 2026-10-20 ("Use ms/overture"), registered next to OSM. Values whose own source licence is not open (for example an empty licence field) are neither used nor committed: see the counts in sources/.
- world-ms-buildings: licence class "share-alike" (ODbL 1.0); allowed by the owner on 2026-10-20 ("Use ms/overture"), registered next to OSM. Values whose own source licence is not open (for example an empty licence field) are neither used nor committed: see the counts in sources/.
- world-overture-outer: licence class "share-alike" (ODbL 1.0 (OpenStreetMap-derived records; the record sources list names each source and licence)): OpenStreetMap data as redistributed by Overture; only records whose source is OpenStreetMap are drawn (geometry_sources), counted in log.json outer_counts.
