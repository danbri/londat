# Greater London: a place on the globe (3D Tiles 1.1)

Made by [cwplans/tools/build-place-tiles.mjs](https://github.com/danbri/londat/blob/main/cwplans/tools/build-place-tiles.mjs) for the region config [docklands/geo/regions/london.js](https://github.com/danbri/londat/blob/main/docklands/geo/regions/london.js); drawn by the globe of the Three.js port ([docklands/globe/places.js](https://github.com/danbri/londat/blob/main/docklands/globe/places.js)).
This README is generated from `provenance/log.json` and [cwplans/data-register.json](https://github.com/danbri/londat/blob/main/cwplans/data-register.json) by `node cwplans/tools/build-place-tiles.mjs readme --region london` (also at the end of each build). Do not edit it by hand.

- The whole city (20 km out): https://danbri.github.io/londat/docklands/?ll=51.50735,-0.12776,20000&ht=0,45
- The West End and the City from Holborn (3 km): https://danbri.github.io/londat/docklands/?ll=51.5175,-0.1180,3000&ht=60,55
- Croydon (2 km): https://danbri.github.io/londat/docklands/?ll=51.3762,-0.0982,2000&ht=0,55
- BT Tower (700 m): https://danbri.github.io/londat/docklands/?ll=51.5215,-0.1389,700&ht=200,60
- A place of kind "blocks": no core and no ground of its own (the globe's terrain and imagery stay); buildings in the model box of docklands are left to that model
- Area (WGS84 degrees, west, south, east, north): -0.5102, 51.2868, 0.334, 51.6919; 1050005 buildings; built 2026-10-21T10:44:51.915Z
- Credit shown on the page: © OpenStreetMap contributors (ODbL 1.0); Buildings: OpenStreetMap data via Overture Maps © Overture Maps Foundation (ODbL 1.0); Building heights and floors from Overture Maps buildings © Overture Maps Foundation (ODbL 1.0; includes data © Microsoft, © OpenStreetMap contributors and others per record); Building heights from Microsoft Global ML Building Footprints © Microsoft (ODbL 1.0); Building heights (where OSM has none) from GHS-BUILT-H R2023A © European Union, 1995-2026, JRC (CC BY 4.0); Ground: Copernicus DEM GLO-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA (the globe's world-base heights)
- Skill: docklands-3d-page, "Three.js port: places as 3D Tiles (2026-10-18)"; fault F55 in the docklands-data-curation skill

## Files

| path | what | bytes | SHA-256 |
|---|---|---|---|
| [tiles/](https://github.com/danbri/londat/blob/main/cwplans/docklands/data/places/london/tiles) (2394 files) | glTF 2.0 tile of the city or the surroundings: terrain grid with a JPEG texture (land cover, water, roads, rail), city blocks (KHR_mesh_quantization, EXT_mesh_gpu_instancing) | 80948720 | `16a5976ad1811f9cf30c8433c559c1237fb300af0806a52a3871b8465c3f7a5a` |
| [tileset.json](https://github.com/danbri/londat/blob/main/cwplans/docklands/data/places/london/tileset.json) | 3D Tiles 1.1 tileset: one child per quadtree cell, ENU -> ECEF transform, region bounding volume | 972402 | `a30040feca53da0008a1b67bf70a671a80301019b8fb095fac365a38f8db6560` |
| [features.json](https://github.com/danbri/londat/blob/main/cwplans/docklands/data/places/london/features.json) | the text and machine interface: the named buildings drawn with their own id (name, height and its source, OSM id), the block counts by level | 731102 | `f2abf8e18af93e856141dbd8127471279e148ae2e6c1f2d00945dcff65d73199` |
| [sources/ghsl-built-h.json.gz](https://github.com/danbri/londat/blob/main/cwplans/docklands/data/places/london/sources/ghsl-built-h.json.gz) | committed source extract (input of an operation; see Sources) | 360388 | `d98714b48391c0c3f1a977af8e51b9f48b93c515f305baa281d4909df024e70b` |
| [provenance/log.json](https://github.com/danbri/londat/blob/main/cwplans/docklands/data/places/london/provenance/log.json) | fetch records and dataflow activities (inputs and outputs by SHA-256), height-source and roof counts | 1349283 | `67a72dcb750ffb3388cc096e33d60b07107adc2dca87f62e1ebab3d6d924c93f` |

Total 84.36 MB (README.md not counted).

## Sources

### overture-buildings: Overture Maps Foundation, buildings theme, release 2026-09-23.1 (GeoParquet on the public bucket overturemaps-us-west-2), read by bounding box with DuckDB

- Register source: `overture-buildings` ([DATA-REGISTER.md](https://github.com/danbri/londat/blob/main/cwplans/DATA-REGISTER.md))
- Publisher: Overture Maps Foundation (records from OpenStreetMap, Microsoft ML Buildings, Instituto Geográfico Nacional (España), Esri Community Maps and others, named per record in its sources list)
- Landing page: https://docs.overturemaps.org/attribution/
- Licence: ODbL 1.0 (buildings theme); per record and property the sources list names the original dataset and its licence (https://opendatacommons.org/licenses/odbl/1-0/)
- Credit (exact text): "© Overture Maps Foundation; © OpenStreetMap contributors; © Microsoft (and the other sources named per record)"
- Fetched: 2026-10-21T10:12:32.537Z
- Request: `s3://overturemaps-us-west-2/release/2026-09-23.1/theme=buildings/type=building/ (bbox -0.52,51.28,0.34,51.7; files part-00124-5e200299-5dc8-5a43-bb1e-0a73aba3373f-c000.zstd.parquet part-00125-dd983f4b-21a7-5215-910c-4de2f4a24e2b-c000.zstd.parquet part-00126-8f48508e-8015-5699-a61b-0cb738bc4755-c000.zstd.parquet)`
- As fetched: the query answer as written by cwplans/tools/fetch-overture-theme.py (raw folder, NDJSON); sha256 above
- Stored for the build: `data/raw/places/london/overture-buildings-2026-09-23.1.ndjson`, 1438278915 bytes, SHA-256 `bfe11fba0282c6b4636c8099d2a7851cabe4a05aca72a00f9d1eb8bb1d2adbc5` — NOT committed (raw folder, git-ignored)

### heights-world-ghsl: GHS-BUILT-H R2023A: average net building height (ANBH), epoch 2018, 3 arc-second grid (EPSG:4326), 10 x 10 degree tiles (Global Human Settlement Layer)

- Register source: `ghsl-built-h` ([DATA-REGISTER.md](https://github.com/danbri/londat/blob/main/cwplans/DATA-REGISTER.md))
- Publisher: European Commission, Joint Research Centre (JRC)
- Landing page: https://human-settlement.emergency.copernicus.eu/download.php?ds=builtH
- Licence: CC BY 4.0 (Commission reuse policy, Decision 2011/833/EU; copyright.txt in the GHS_BUILT_H_GLOBE_R2023A folder: "(c) European Union, 1995-2026") (https://creativecommons.org/licenses/by/4.0/)
- Credit (exact text): "GHS-BUILT-H R2023A © European Union, 1995-2026, JRC (Pesaresi M., Politis P. (2023): GHS-BUILT-H R2023A - GHS building height, derived from AW3D30, SRTM30, and Sentinel2 composite (2018). European Commission, Joint Research Centre, doi:10.2905/85005901-3A49-48DD-9D19-6261354F56FE)"
- Fetched: 2026-10-21T10:21:16.605Z
- Requests: `https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_H_GLOBE_R2023A/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss/V1-0/tiles/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss_V1_0_R4_C18.zip` ; `https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_H_GLOBE_R2023A/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss/V1-0/tiles/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss_V1_0_R4_C19.zip`
- As fetched: 47339768 bytes, SHA-256 `e4babc01aa6faa9ea8f7efad57fce27e5cf699b0104723d9f70e4e6db27dc7f3` (https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_H_GLOBE_R2023A/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss/V1-0/tiles/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss_V1_0_R4_C18.zip)
- As fetched: 66387983 bytes, SHA-256 `f3d948fabbd7ca229f3898e5eaa106484c6e32eb4c4a966e1333b49f9cd2c226` (https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_H_GLOBE_R2023A/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss/V1-0/tiles/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss_V1_0_R4_C19.zip)
- Stored for the build: `docklands/data/places/london/sources/ghsl-built-h.json.gz`, 360388 bytes, SHA-256 `d98714b48391c0c3f1a977af8e51b9f48b93c515f305baa281d4909df024e70b` — committed (`sources/ghsl-built-h.json.gz`)

## Operations (dataflow, skill cwplans-dataflow)

Each activity: id = sha256 of [operation, version, input hashes, parameters], first 16 hex. Inputs and outputs by SHA-256; a re-run with the same inputs writes nothing. Outputs under `data/raw/` are intermediate (not committed); their hashes fix the next step.

### place-select-blocks version 1 (activity `5bda3644d2fddb7b`, 2026-10-21T10:23:14.894Z)

Skill docklands-3d-page; tool tools/build-place-tiles.mjs.

Inputs:

- overture-buildings: `data/raw/places/london/overture-buildings-2026-09-23.1.ndjson` SHA-256 `bfe11fba0282c6b4636c8099d2a7851cabe4a05aca72a00f9d1eb8bb1d2adbc5`
- boundary: `docklands/data/uk/layers/regions/6/63-50.json` SHA-256 `4e1cbe914d1f30238a5f6fa108de8bb84fc103246c4fb2fe194e96e85eb2c521`

Outputs:

- `data/raw/places/london/work/blocks-select.ndjson.gz` SHA-256 `e7b26e9afbbe31990cf919b868b0ddc8395ac6c9c8c532bfe0a2a19552c91278` (108815940 bytes)
- `data/raw/places/london/work/blocks-footprints.json.gz` SHA-256 `08c8a722bb3059b2b848897e83674996c8e7235d398b211588a9818a946758b9` (54336516 bytes)

Parameters: `{"boundary":{"skeleton":"docklands/data/uk/","layer":"regions","level":6,"code":"E12000007","name":"London","points":415},"exclude":[{"id":"docklands","origin":{"lon":-0.019497988,"lat":51.504902222,"h":45.448},"modelFrame":{"a":0.9994702116731193,"b":0.02705486218699722,"tx":0.009070344521249834,"tn":0.003921958702577293,"ty":0,"error":{"horizontalMaxM":0.086,"horizontalRmsM":0.028,"verticalMaxDropM":3.08,"againstFitMaxM":0.03}},"modelBox":{"x0":-5150,"x1":2350,"z0":-2000,"z1":3600,"inset_m":1}}],"geometrySources":["OpenStreetMap"],"licences":["ODbL-1.0","CDLA-Permissive-2.0","CDLA-Permissive-1.0","CC-BY-4.0","CC0-1.0"],"heightLabels":{"Microsoft ML Buildings":"ms"}}`

### place-city-heights version 2 (activity `3161b5a366de24ca`, 2026-10-21T10:24:20.941Z)

Skill docklands-data-curation; tool tools/build-place-tiles.mjs.

Inputs:

- selected: `data/raw/places/london/work/blocks-select.ndjson.gz` SHA-256 `e7b26e9afbbe31990cf919b868b0ddc8395ac6c9c8c532bfe0a2a19552c91278`
- footprint-heights: `data/raw/places/london/work/blocks-footprints.json.gz` SHA-256 `08c8a722bb3059b2b848897e83674996c8e7235d398b211588a9818a946758b9`
- raster-heights: `docklands/data/places/london/sources/ghsl-built-h.json.gz` SHA-256 `d98714b48391c0c3f1a977af8e51b9f48b93c515f305baa281d4909df024e70b`

Outputs:

- `data/raw/places/london/work/blocks-heights.json.gz` SHA-256 `2c24fe008a922d8eb8505e3b372ba22963485b2de257d05ed8fb474bab35c966` (26352265 bytes)

Parameters: `{"storey_m":3,"national_storey_m":3,"default_m":7,"default_small_m":3,"raster_min_m":3,"roof_rule":null,"pitch_deg":30,"max_roof_m":8,"footprints":["ms"],"rule":"as place-heights over the selected buildings: OSM height > OSM building:levels x storey > Overture height > Overture num_floors x storey (non-OSM records, open licence, not Microsoft) > Microsoft ML Buildings height (via Overture; footprint match: a centroid inside the other outline, area ratio >= 0.5) > small kinds 3 m > GHSL cell under the centroid (min 3 m) > default; no roofs (blocks)"}`

### place-blocks version 2 (activity `306bff0c31e163ff`, 2026-10-21T10:44:51.915Z)

Skill docklands-3d-page; tool tools/build-place-tiles.mjs.

Inputs:

- selected: `data/raw/places/london/work/blocks-select.ndjson.gz` SHA-256 `e7b26e9afbbe31990cf919b868b0ddc8395ac6c9c8c532bfe0a2a19552c91278`
- heights: `data/raw/places/london/work/blocks-heights.json.gz` SHA-256 `2c24fe008a922d8eb8505e3b372ba22963485b2de257d05ed8fb474bab35c966`
- world-base heights: `docklands/data/world-basedem (77 tiles over the query box; sha256 of the list of path and sha256 of each)` SHA-256 `9d33c4fab5a1009fa8c45b49cabe92e3cc486e6d7416d6ee16cc78e98a6f5aec`
- geoid: `docklands/data/world/geoid-egm96-1deg.png` SHA-256 `4e9eb4b3ac040dd6276ba74310a405fab7d5c9955c005c8f84a49103318c26ca`

Outputs:

- `docklands/data/places/london/tiles/10-1021-804.glb` SHA-256 `75dd9514b16f5bcb01a34a7312fc9ff49a2516bd9825c9ebc566d17aed507678` (19144 bytes)
- `docklands/data/places/london/tiles/11-2042-1609.glb` SHA-256 `23d49fe03cd7497947295c65eca47615478387f038ad7a321c67f4453100b6f3` (13388 bytes)
- `docklands/data/places/london/tiles/12-4084-3219.glb` SHA-256 `3e61bdb6a923902331a515f27ab2db35fb74400de8023bcfb35f849f84d3447d` (5720 bytes)
- `docklands/data/places/london/tiles/13-8169-6438.glb` SHA-256 `22b4f08a55ff9820268ad3d1be56e3c16e8b27f5fd9957dc46a7ddaffbc72509` (4944 bytes)
- and 2392 more (the Files table above has each one)

Parameters: `{"top":10,"leaf":14,"levels":{"10":{"tall_m":60,"big_m2":20000,"merge_m":400,"err_m":300},"11":{"tall_m":40,"big_m2":8000,"merge_m":200,"err_m":150},"12":{"tall_m":25,"big_m2":3000,"merge_m":100,"err_m":75},"13":{"tall_m":18,"big_m2":600,"merge_m":50,"err_m":35}},"min_area_m2":25,"simplify_m":2.5,"box_fill":0.85,"outline_min_m2":300,"drop_m":3,"named_min_m2":1500,"named_min_h_m":20,"colour":"#d6cbb6","version_label":"london-1","extent_box":[-0.52,51.28,0.34,51.7],"classes":["OpenStreetMap (via Overture)","merged OpenStreetMap buildings (one box per square: the summed footprint, the area-weighted mean height)"],"credit":"© OpenStreetMap contributors (ODbL 1.0); Buildings: OpenStreetMap data via Overture Maps © Overture Maps Foundation (ODbL 1.0); Building heights and floors from Overture Maps buildings © Overture Maps Foundation (ODbL 1.0; includes data © Microsoft, © OpenStreetMap contributors and others per record); Building heights from Microsoft Global ML Building Footprints © Microsoft (ODbL 1.0); Building heights (where OSM has none) from GHS-BUILT-H R2023A © European Union, 1995-2026, JRC (CC BY 4.0); Ground: Copernicus DEM GLO-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA (the globe's world-base heights)"}`

## What is derived from what

- `place-select-blocks`: the Overture buildings answer (NDJSON, raw) + the boundary polygon (a skeleton file) -> the buildings whose geometry is from OpenStreetMap, whose centroid is inside the boundary and not in an excluded model box (outline, area, name, kind, OSM height and levels), and the height values of the other records (open licence only) by dataset.
- `place-city-heights`: the selection + the footprint heights + the GHSL crop in `sources/` -> one height and its source per building (the place-heights order; fault F55 counts).
- `place-blocks`: the selection + the heights + the globe's world-base height tiles (`docklands/data/world-base/dem/`) + the EGM96 geoid grid -> `tiles/*.glb`, `tileset.json`, `features.json` (named buildings).
- `index.json` (one level up) and this README are made from these files.

## Heights and roofs (fault F55: counted, not patched)

| height source | buildings and parts |
|---|---|
| osm-height | 1354 |
| osm-levels | 224148 |
| national | 0 |
| ms | 189445 |
| default-small | 22477 |
| ghsl | 685028 |
| default | 124 |
| levels-vs-national-2plus | 0 |
| national-zero-floors | 0 |

## Levels of detail

| level | tiles | MB | triangles | boxes | outlines | named | merged boxes (buildings in them) |
|---|---|---|---|---|---|---|---|
| 10 | 14 | 0.36 | 90,570 | 360 | 0 | 0 | 8,697 (1,049,645) |
| 11 | 41 | 1.13 | 290,250 | 1,268 | 0 | 0 | 27,757 (1,048,737) |
| 12 | 135 | 3.48 | 885,360 | 5,777 | 0 | 0 | 82,759 (1,044,228) |
| 13 | 479 | 10.39 | 2,584,310 | 44,624 | 0 | 0 | 213,807 (1,005,381) |
| 14 | 1725 | 65.59 | 11,460,524 | 1,002,713 | 41,730 | 5562 | 0 (0) |

Loaded by screen-space error (docklands/globe/places.js): far views draw the coarse levels (tall and big buildings as their own boxes, the rest merged into one box per square), near views every building of the leaf cell. 1,050,005 buildings drawn at the leaf level, 5,562 of them named with their own id.

## Selection

| what | count |
|---|---|
| records | 2,026,838 |
| OSM buildings selected | 1,122,576 |
| not drawn (geometry from Microsoft ML Buildings) | 571,817 |
| height from Microsoft ML Buildings (ODbL-1.0) kept as ms | 616,322 |
| OSM buildings outside the boundary | 293,621 |
| OSM buildings in the model box (drawn by the model) | 38,824 |

## Not committed

Raw downloads stay in `cwplans/data/raw/places/london/` (in cwplans/.gitignore): `data/raw/places/london/overture-buildings-2026-09-23.1.ndjson` (overture-buildings), the original zips and GeoTIFFs, and the intermediates in `work/`. Run `node cwplans/tools/build-place-tiles.mjs fetch --region london` to get them again (the hashes above say whether the source changed).

## Review status

- OSM (ODbL 1.0, share-alike): allowed for the prototyping phase (owner, 2026-10-03); to be reviewed with the rest of the OSM use.
- world-overture: licence class "share-alike" (ODbL 1.0 (buildings theme; per record: the licence of each source in its sources list)); allowed by the owner on 2026-10-20 ("Use ms/overture"), registered next to OSM. Values whose own source licence is not open (for example an empty licence field) are neither used nor committed: see the counts in sources/.
- world-ms-buildings: licence class "share-alike" (ODbL 1.0); allowed by the owner on 2026-10-20 ("Use ms/overture"), registered next to OSM. Values whose own source licence is not open (for example an empty licence field) are neither used nor committed: see the counts in sources/.
- world-overture-outer: licence class "share-alike" (ODbL 1.0 (OpenStreetMap-derived records; the record sources list names each source and licence)): OpenStreetMap data as redistributed by Overture; only records whose source is OpenStreetMap are drawn (geometry_sources), counted in log.json outer_counts.
