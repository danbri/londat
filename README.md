# londat

Open-data extracts for the Canary Wharf / Docklands project in
[danbri/glitchcan-minigam](https://github.com/danbri/glitchcan-minigam), directory `magpie/cwplans/`.
This repository holds the bulk files, so that the main repository and its GitHub Pages site stay under their size
limits. The owner created it on 2026-10-05.

Status: scoping, planning and prototyping. The data is not reviewed for production use.

## What is here

| folder | what | files | source tools (main repository) |
|---|---|---|---|
| `cwplans/feeds/london-datastore/` | London Datastore (data.london.gov.uk, GLA) datasets, clipped to the Docklands 3D model box, plus the walk of the whole catalogue (`catalogue.json`, `triage.json`, `probe.json`, `harvest-log.json`, `index.json`, `zone-codes.json`) | 237 | `tools/walk-london-datastore.mjs`, `tools/lds-harvest-auto.mjs`, `tools/amend-uprns.mjs` |
| `cwplans/feeds/portals/` | other open-data portals, clipped to the same box: data.gov.uk, planning.data.gov.uk, borough portals, Nomis Census 2021, ONS Open Geography, national sources (DfT, police.uk, DESNZ, OS OpenData, MHCLG) | 163 | `tools/walk-portals.mjs` and `tools/portals/*.mjs` |
| `cwplans/feeds/kml/` | zone-clipped KML copies of open layers (TfL, Walk Wheel Cycle Trust, Canal & River Trust, Natural England, Historic England, GLA) for the 3D page's `?kml=` link; the licence and attribution are in each file's Document description | 12 | `tools/find-kml.mjs` (catalogue: `magpie/cwplans/feeds/kml/catalogue.json` in the main repository) |
| `cwplans/cache/` | live-state history and GIS layers: `runs/<day>/live-<time>.json.gz` (the rows each hourly run added) and `live-YYYY-MM.sqlite` (one SQLite per closed UTC month: hire bikes, lift outages, station crowding, power cuts, storm overflows, NOTAM cranes, AIS vessels without small private craft, EA tide and river levels, TfL line status, river-bus arrival counts, Open-Meteo weather; tables `sources` and `runs`), `latest.json` (latest state and the last 24 h per theme, read by the pages), `zone-core.gpkg`, `zone-lds.gpkg`, `zone-portals.gpkg` (GeoPackages of the static zone layers for QGIS and GDAL) | 3 or more | `tools/cache-londat.mjs`, `tools/build-zone-gpkg.mjs` |
| `third_party/tfl/am3d/` | TfL axonometric station diagrams (FOI release, not an open licence; use approved by the owner 2026-10-05) and the Blender station models made from them | see its README | `tools/blender-stations/` |
| `third_party/cwg/maps/` | Canary Wharf Group printed maps and guides (store guide with mall and estate maps July 2026, step-free access map, art trail, art guide), supplied by the owner 2026-10-06; not an open licence; see its README and `manifest.json` | 4 | none (added by hand) |
| `cwplans/data-register.json` | a copy of the register entries for these files: sources, licences, attribution, OSM use | 1 | written by `tools/check-data-register.mjs --write` |

Each path is the same as the old path under `magpie/cwplans/` in the main repository. For example
`magpie/cwplans/feeds/london-datastore/heat-demand/heat-demand.json` is now
`cwplans/feeds/london-datastore/heat-demand/heat-demand.json` here.
The descriptions of each folder (rules, counts, final states) stay in the main repository:
[feeds/london-datastore/README.md](https://github.com/danbri/glitchcan-minigam/blob/master/magpie/cwplans/feeds/london-datastore/README.md),
[feeds/portals/README.md](https://github.com/danbri/glitchcan-minigam/blob/master/magpie/cwplans/feeds/portals/README.md).
A file whose name ends in `.gz` is gzip-compressed JSON.

## The cache folder (`cwplans/cache/`)

- **`runs/<day>/live-<time>.json.gz`**: one gzip JSON file per hourly run with the rows it added (`statements`: SQL
  and rows; replayed in order they rebuild the database). No binary file is committed hourly. When a month ends, its
  run files are replayed into `live-YYYY-MM.sqlite` and removed.
- **`live-YYYY-MM.sqlite`** (from November 2026 for October): SQLite 3, opens with any SQLite tool (`sqlite3`, DB Browser for SQLite, Python, QGIS).
  Times are Unix seconds (UTC). Each state table has a `fetch_time` column and a primary key with it, so the history is
  append-only and a second run on the same data adds nothing. Table `sources` gives each theme's URL, licence,
  attribution and politeness; table `runs` gives each run's time, counts, errors and file size. Places (docks,
  stations, overflows, piers, gauges) are in `places`. Example:
  `SELECT datetime(fetch_time, 'unixepoch'), sum(bikes) FROM bikes GROUP BY fetch_time;`
- **`latest.json`**: the newest fetch of each theme in compact columns, and a 24 h series. The pages of the main
  repository read it first and ask a third-party service only when the visitor switches on "Live".
- **`zone-core.gpkg`** (3D model, registry, construction, river; 17 MB), **`zone-lds.gpkg`** (London Datastore; 38 MB),
  **`zone-portals.gpkg`** (other portals; 13 MB): OGC GeoPackages, split so that each stays under 50 MB. In QGIS: Layer > Add Layer > Add Vector Layer (or drag the file into the
  window), then pick the layers. The 3D model layers (`model_*`) are in EPSG:27700 (British National Grid); the others
  are in EPSG:4326. Each layer's licence and attribution are in its description (Layer Properties > Information, or
  the table `gpkg_contents`), and the table `layer_licences` lists them all. Layers made from OpenStreetMap data
  (in zone-core: `model_buildings`, `model_water`, `model_greens`, `model_lines`, `registry_buildings`, `river_osm_river`,
  `construction_sites`; in zone-lds: the UPRN-amended cultural infrastructure layer) are under the ODbL 1.0,
  © OpenStreetMap contributors (https://www.openstreetmap.org/copyright).
- Licences: Powered by TfL Open Data (TfL open data terms). Contains UK Power Networks data licensed under CC BY 4.0.
  Contains Thames Water storm overflow data licensed under CC BY 4.0, via Stream. Environment Agency flood and river
  level data from the real-time data API (Beta), Open Government Licence v3.0. Weather data by Open-Meteo.com
  (CC BY 4.0). Source: UK AIS (NATS); NOTAM facts only, no open licence stated. AIS: Open Waters AIS
  (https://openwaters.io/ais/), AISHub (https://www.aishub.net) and aisstream.io events, accepted for scoping only and
  marked for review; small private craft are counted, never listed.
- Refresh: `.github/workflows/cache-live.yml` in this repository (hourly), or by hand from the main repository:
  `NODE_USE_ENV_PROXY=1 LONDAT_DIR=/path/to/londat node magpie/cwplans/tools/cache-londat.mjs`.

## The register is the authority

The authority for every file (source, licence, attribution, method, OSM use) is
[magpie/cwplans/data-register.json](https://github.com/danbri/glitchcan-minigam/blob/master/magpie/cwplans/data-register.json)
in the main repository (readable view:
[DATA-REGISTER.md](https://github.com/danbri/glitchcan-minigam/blob/master/magpie/cwplans/DATA-REGISTER.md)).
Entries for files in this repository have `"hosted": "londat"`. `cwplans/data-register.json` here is a copy of those
entries; if the two disagree, the main repository is correct.
Methods: [METHODS.md](https://github.com/danbri/glitchcan-minigam/blob/master/magpie/cwplans/METHODS.md).

## Licences

There is no blanket licence. Each file keeps the licence of its source. See [LICENSE-DATA.md](LICENSE-DATA.md).

- `cwplans/feeds/london-datastore/`: each dataset has its own licence, recorded in its file's `meta` and in the
  register: mostly Open Government Licence v3.0 or v2.0, some CC BY (versions as published), ODC-By 1.0.
  **The GLA cannot warrant the quality or accuracy of the data.** (London Datastore terms:
  https://data.london.gov.uk/about/terms-and-conditions.)
  Contains public sector information licensed under the Open Government Licence.
- `cwplans/feeds/portals/`: Open Government Licence v3.0 for every harvested dataset (planning.data.gov.uk,
  data.gov.uk publishers, ONS and Nomis, Environment Agency, Natural England, Defra, DfT, police.uk, DESNZ, MHCLG,
  City of London, Lewisham). Contains OS data © Crown copyright and database right (OS Open Names, OS Open Rivers).
  Contains National Statistics data © Crown copyright and database right.
- Some London Datastore files add keys or positions from other open sources: ONS Postcode Directory and OS Open UPRN
  (OGL v3.0), DfE GIAS and NHS ODS (OGL v3.0), Sport England Active Places (CC BY 4.0), TfL open data (Powered by TfL
  Open Data). Coordinates were transformed with the OS OSTN15 grid.

## OpenStreetMap

Two files use OpenStreetMap data, © OpenStreetMap contributors, under the ODbL 1.0
(https://www.openstreetmap.org/copyright):
`cwplans/feeds/london-datastore/cultural-infrastructure/cultural-infrastructure.uprn-amended.geojson` and
`cultural-infrastructure.uprn-amendments.json` in the same folder. OSM building outlines chose 6 UPRN values; the files
hold no OSM geometry, tags or ids. The extract and its date are in the register.

## Use from a page

Pages in the main repository read these files through one constant, `magpie/cwplans/data-base.js`. Until GitHub
Pages is on for this repository it is `https://raw.githubusercontent.com/danbri/londat/main/cwplans/` (that host
sends `Access-Control-Allow-Origin: *`); then `https://danbri.github.io/londat/cwplans/`.

## Updating

Tools in the main repository write here: set `LONDAT_DIR` to this checkout (the default is a `londat` folder next to
the main repository's folder). Then run `node magpie/cwplans/tools/check-data-register.mjs --write` in the main
repository, which checks each file here against the register and rewrites `cwplans/data-register.json`. Keep each
push well under 500 MB and each file under 100 MB.
