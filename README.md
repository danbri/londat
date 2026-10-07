# londat

The Canary Wharf / Docklands project (cwplans): the Docklands 3D page, the atlas, the knowledge graph and its search
page, the feeds and what's-on pages, the data tools, the skills that describe them, and the open-data extracts.

Status: scoping, planning and prototyping. The data is not reviewed for production use.

Site: https://danbri.github.io/londat/ (published by `.github/workflows/pages.yml`; see "GitHub Pages" below).

| page | address |
|---|---|
| Docklands 3D | https://danbri.github.io/londat/cwplans/docklands/ |
| Atlas | https://danbri.github.io/londat/cwplans/atlas/ |
| Knowledge graph search | https://danbri.github.io/londat/cwplans/kg/ |
| Feeds and sources, what's on | https://danbri.github.io/londat/cwplans/feeds/ , https://danbri.github.io/londat/cwplans/feeds/whatson.html |
| Building registry, postcodes | https://danbri.github.io/londat/cwplans/registry/ , https://danbri.github.io/londat/cwplans/postcodes/ |
| Canada Water to Surrey Quays (where the project started) | https://danbri.github.io/londat/cwplans/ |
| Status dashboard: hourly cache runs, site deploys, age of the live data, knowledge graph, register and quality, old-site redirect, activity | https://danbri.github.io/londat/dashboard/ |

## History

The owner created this repository on 2026-10-04 ("Created londat repo"; first commit 2026-10-05) for the bulk files,
so that danbri/glitchcan-minigam and its GitHub Pages site stayed under their size limits. From 2026-10-05 the London
Datastore and portal extracts, the KML copies, the live-state cache, the imagery coverage answers, the knowledge graph,
the contributed photos and the TfL and Canary Wharf Group material were here, and the pages and tools were in
danbri/glitchcan-minigam, folder `magpie/cwplans/`.

On 2026-10-07 the rest of the project moved here (owner: "Migrate docklands 3d map, data tools, lg etc from
magpie/cwplans/* into londat repo."), copied at glitchcan-minigam commit 7be94dc:
`magpie/cwplans/` to `cwplans/` (same relative paths), `third_party/cwplans-structured-data/` and `tools/view-mcp/`.
History before the move: https://github.com/danbri/glitchcan-minigam/commits/7be94dc/magpie/cwplans . Commit ids
before 2026-10-07 in the skills and the activity log are glitchcan-minigam commits unless they are named as londat
commits. The old page addresses (https://danbri.github.io/glitchcan-minigam/magpie/cwplans/...) become redirect pages
to the same page here, with the query and the hash kept.

## What is here

| folder | what |
|---|---|
| `cwplans/` | the project: pages (`docklands/`, `atlas/`, `kg/`, `feeds/`, `registry/`, `postcodes/`, `reports/`), tools (`cwplans/tools/`), skills (`cwplans/skills/`, `cwplans/docklands/skills/`), the data register, `pipeline.json`, `METHODS.md`, and the data |
| `cwplans/feeds/london-datastore/` | London Datastore (data.london.gov.uk, GLA) datasets clipped to the Docklands 3D model box, and the walk of the whole catalogue; [README](cwplans/feeds/london-datastore/README.md) |
| `cwplans/feeds/portals/` | other open-data portals clipped to the same box: data.gov.uk, planning.data.gov.uk, borough portals, Nomis Census 2021, ONS Open Geography, national sources; [README](cwplans/feeds/portals/README.md) |
| `cwplans/feeds/kml/` | zone-clipped KML copies of open layers for the 3D page's `?kml=` link, and the catalogue of KML resources; [README](cwplans/feeds/kml/README.md) |
| `cwplans/cache/` | the hourly history of live state, `latest.json`, and three GeoPackages for QGIS (below) |
| `kgx/` | the knowledge graph: graph versions, logs, the Shardborough store read by the search page; [README](kgx/README.md) |
| `data/images/contrib/` | the owner's photos (CC0), by set; each set has a README and `photos.json` |
| `third_party/tfl/am3d/` | TfL axonometric station diagrams (FOI release, not an open licence; use approved by the owner 2026-10-05) and the Blender station models made from them |
| `third_party/cwg/` | Canary Wharf Group printed maps and guides, supplied by the owner 2026-10-06; not an open licence; see its README |
| `third_party/cwplans-structured-data/` | schema.org data from the websites the registry links to (crawl of the scoping phase); [README](third_party/cwplans-structured-data/README.md) |
| `dashboard/` | the status dashboard (one page, no build step; it reads the GitHub API, `cache/latest.json` and files of this site in the browser) |
| `tools/view-mcp/` | the `docklands-view` MCP server (`.mcp.json`): landmarks, camera solve, headless renders of the 3D page |
| `tools/check-skills.mjs` | checks that every skill is linked into `.claude/skills/` |

Rules for working here (data policy, licences, model, reports, skills): [CLAUDE.md](CLAUDE.md). Methods and rebuild
order: [cwplans/METHODS.md](cwplans/METHODS.md). Start with the skill
[docklands-data-curation](cwplans/skills/docklands-data-curation/SKILL.md).

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
- **`latest.json`**: the newest fetch of each theme in compact columns, and a 24 h series. The pages read it first
  (from raw.githubusercontent.com, so that it is new each hour) and ask a third-party service only when the visitor
  switches on "Live".
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
- Refresh: `.github/workflows/cache-live.yml` (hourly), or by hand: `NODE_USE_ENV_PROXY=1 node cwplans/tools/cache-londat.mjs`.

## The register is the authority

The authority for every file in `cwplans/` (and `third_party/cwplans-structured-data/`): source, licence,
attribution, method, OSM use, is [cwplans/data-register.json](cwplans/data-register.json) (readable view:
[cwplans/DATA-REGISTER.md](cwplans/DATA-REGISTER.md)). `node cwplans/tools/check-data-register.mjs` fails on an
unregistered file. Methods: [cwplans/METHODS.md](cwplans/METHODS.md). `kgx/`, `data/images/` and the other
`third_party/` folders describe their sources in their own READMEs and manifests.

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
- `third_party/tfl/` and `third_party/cwg/` have no open licence; the GitHub Pages site does not publish `third_party/`.

## OpenStreetMap

Many files in `cwplans/` use OpenStreetMap data, © OpenStreetMap contributors, under the ODbL 1.0
(https://www.openstreetmap.org/copyright): the 3D model, the building registry, the atlas and others. The register
lists each one with how it uses OSM and the extract and its date (DATA-REGISTER.md, "OpenStreetMap (ODbL) use"), and
every page that shows OSM data carries the attribution link.

## GitHub Pages

The site is built by `.github/workflows/pages.yml` on each push to `main` that changes more than `cwplans/cache/`
(the hourly cache commits do not redeploy it). It publishes the whole repository except `.github/`, `third_party/`,
`cwplans/cache/runs/` and `cwplans/cache/*.sqlite` (430 MB at the move; the limit is 1 GB and the workflow stops at
950 MB). Pages read data through `cwplans/data-base.js`: same site, except `cache/` from raw.githubusercontent.com.
One-time setting (repository owner): Settings > Pages > Build and deployment > Source: **GitHub Actions**.

## Working here

    npm install                                   # the tools' libraries (npm ci --omit=dev: only the three the hourly tools need)
    npm run check                                 # the data register
    npm test                                      # tool tests
    python3 -m http.server 8080                   # then http://127.0.0.1:8080/cwplans/docklands/

Commands run from the repository root (`node cwplans/tools/<tool>.mjs`). Keep each push well under 500 MB and each
file under 100 MB.
