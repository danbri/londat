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
| `cwplans/data-register.json` | a copy of the register entries for these files: sources, licences, attribution, OSM use | 1 | written by `tools/check-data-register.mjs --write` |

Each path is the same as the old path under `magpie/cwplans/` in the main repository. For example
`magpie/cwplans/feeds/london-datastore/heat-demand/heat-demand.json` is now
`cwplans/feeds/london-datastore/heat-demand/heat-demand.json` here.
The descriptions of each folder (rules, counts, final states) stay in the main repository:
[feeds/london-datastore/README.md](https://github.com/danbri/glitchcan-minigam/blob/master/magpie/cwplans/feeds/london-datastore/README.md),
[feeds/portals/README.md](https://github.com/danbri/glitchcan-minigam/blob/master/magpie/cwplans/feeds/portals/README.md).
A file whose name ends in `.gz` is gzip-compressed JSON.

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
