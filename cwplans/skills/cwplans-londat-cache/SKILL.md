---
name: cwplans-londat-cache
description: >-
  The cache of cwplans in danbri/londat: an append-only hourly history of live state in the Docklands zone (one
  gzip JSON run file per run in cwplans/cache/runs/<day>/, replayed into cwplans/cache/live-YYYY-MM.sqlite when the
  month closes: hire-bike docks, lift outages, crowding, power cuts, storm overflows, NOTAM cranes, AIS without small
  craft, tide and river levels, line status, river buses, weather), cwplans/cache/latest.json that the atlas and the
  3D page read before any third-party API (live-cache.js), and three GeoPackages (zone-core, zone-lds, zone-portals;
  163 layers, licence per layer) for QGIS. Tools tools/cache-londat.mjs and tools/build-zone-gpkg.mjs, the schema, the
  hourly workflow in londat, sizes and git growth, request counts, the register rule for a monthly file family. Reach
  for it before you add a theme to the cache, change the pages' live panels, rebuild the GeoPackages, or answer "do we
  keep a history of X?" or "can I open this in QGIS?".
---

# The londat cache (cwplans)

Owner, 2026-10-05: "Now we have londata repo are we caching more fetches there and preloading? If not, we should!
Sqlite files would be a simple start. Keep trying". This skill is the answer. Since 2026-10-07 the tools, the pages and
the cache are all in danbri/londat (before, the tools and pages were in danbri/glitchcan-minigam). The repository
layout, the register, `tools/londat.mjs` and `data-base.js`: skill `docklands-data-curation`, "Data hosted in
danbri/londat".

## What is where

| file (londat) | what | written by | refresh |
|---|---|---|---|
| https://github.com/danbri/londat/tree/main/cwplans/cache/runs (`cache/runs/*/live-*.json.gz`) | the rows each run added, one gzip JSON file per run, one folder per UTC day | `tools/cache-londat.mjs` | hourly (workflow) |
| `cache/live-*.sqlite` (first: live-2026-10.sqlite, written by the first run in November) | the closed month as one SQLite, VACUUMed; that month's run files are then removed | `tools/cache-londat.mjs` | once a month |
| https://github.com/danbri/londat/blob/main/cwplans/cache/latest.json | newest fetch per theme + 24 h series | `tools/cache-londat.mjs` | each run |
| https://github.com/danbri/londat/blob/main/cwplans/cache/zone-core.gpkg | 17 layers: 3D model, registry, construction, river (16.9 MB) | `tools/build-zone-gpkg.mjs` | by hand, when an input changes |
| https://github.com/danbri/londat/blob/main/cwplans/cache/zone-lds.gpkg | 82 London Datastore layers (38.0 MB) | `tools/build-zone-gpkg.mjs` | by hand |
| https://github.com/danbri/londat/blob/main/cwplans/cache/zone-portals.gpkg | 64 open-portal layers (13.2 MB) | `tools/build-zone-gpkg.mjs` | by hand |
| https://github.com/danbri/londat/blob/main/.github/workflows/cache-live.yml | the hourly job | by hand | - |

Pages read `latest.json` at `https://raw.githubusercontent.com/danbri/londat/main/cwplans/cache/latest.json`
(`CwData.url('cache/latest.json')`): `data-base.js` sends every `cache/` path to raw.githubusercontent.com, because the
Pages site (https://danbri.github.io/londat/) is not redeployed on the hourly cache commits.

## Commands

From the repository root (no LONDAT_DIR needed since 2026-10-07: the tools write into their own checkout):

    NODE_USE_ENV_PROXY=1 node cwplans/tools/cache-londat.mjs        # fetch + append (about 6 min)
    node cwplans/tools/cache-londat.mjs --no-fetch                  # append the snapshots in this checkout
    options: --themes=bikes,tide,...  --dry  --vacuum (when a month is closed)
    node cwplans/tools/build-zone-gpkg.mjs [--part=core,lds,portals]   # needs ogr2ogr (apt-get install -y gdal-bin)
    python3.12 /usr/lib/python3/dist-packages/osgeo_utils/samples/validate_gpkg.py /home/user/londat/cwplans/cache/zone-core.gpkg

`cache-londat.mjs` runs `fetch-live.mjs bikes lifts crowding ukpn overflows notams`, `fetch-river.mjs levels river-bus`
and `fetch-ais.mjs --listen=0` as child processes (their politeness unchanged), then asks two endpoints itself: TfL
`/Line/Mode/tube,dlr,elizabeth-line,overground,river-bus,cable-car/Status` and Open-Meteo `current=` (one request
each, saved in `data/raw/cache/`, gitignored). The fetch tools rewrite their snapshot files in the checkout as always:
in a working copy, `git checkout -- cwplans/feeds/` afterwards unless you mean to commit fresh snapshots (the
workflow stashes them before it pulls). About 120 requests per run; the crowding loop (65 stations, 1.5 s apart) is most of the 6 minutes.

## Database: node:sqlite

Node 22.22 has `node:sqlite` without a flag (it prints an ExperimentalWarning; the tool removes the warning listener
before the import). No npm dependency, so the workflow needs only the three libraries the fetch tools import (proj4,
geotiff, earcut). SQLite 3.50. `better-sqlite3` was not needed.

## How the history is stored (coordinator, 2026-10-05)

A binary file committed every hour is a new git blob every hour: the first design (one growing SQLite per month,
committed each run) could add several GB a month if the server does not delta it. So no binary file is committed per
run. Each run:

1. closes every earlier month that still has run files: replays them into `cache/live-YYYY-MM.sqlite`, VACUUM, removes
   that month's `cache/runs/YYYY-MM-DD/` folders;
2. replays this month's run files into a working SQLite (`data/raw/cache/work-YYYY-MM.sqlite`, gitignored, deleted
   at the end);
3. inserts the new snapshots and records each row that changed (`changes` > 0);
4. writes those rows as `cache/runs/<day>/live-<run time>.json.gz`: `{format: 1, run_time, tool, statements: [[sql,
   rows], ...]}`; replaying the statements in file order rebuilds the database. No new rows: no file;
5. writes `latest.json` from the working SQLite and the previous month's SQLite (`UNION`).

Places are recorded only when they change, except in the first run of a month, which records them all, so each month's
SQLite stands alone. The first SQLite of 2026-10 (two runs) became the seed run file
`runs/2026-10-05/live-2026-10-05T1607Z.json.gz` (47 kB).

## Schema (schema version 1, table `meta`)

Times are Unix seconds, UTC. `fetch_time` is the snapshot's own `meta.fetched`, so a second run on the same snapshot
adds nothing (`INSERT OR IGNORE`; all state tables are `WITHOUT ROWID` with that key).

| table | key | columns |
|---|---|---|
| `sources` | theme | register_key, url, licence, attribution, politeness, review |
| `runs` | run_id | started, finished, tool, mode, counts (JSON), errors (JSON), bytes_before, bytes_after |
| `places` | id | kind, name, lat, lon, zone (docks, stations, overflows, piers, gauges; updated in place) |
| `bikes` | fetch_time, id | bikes, e_bikes, empty_docks, docks, unavailable_docks, locked |
| `lifts`, `lifts_fetches` | fetch_time, id / fetch_time | lifts_out, lift_ids / stations_out (a fetch with no outage still has a row) |
| `crowding` | fetch_time, id | time, pct_baseline |
| `power_cuts`, `power_cut_fetches` | fetch_time, id / fetch_time | type, status_id, customers, created, estimated_restoration, restored, postcode_sectors, lat, lon / network_incidents, in_zone |
| `overflows` | fetch_time, id | status (1, 0, -1), status_start, latest_event_start, latest_event_end |
| `notams` | fetch_time, id | kind, name, lat, lon, height_agl_ft, height_amsl_ft, start, end_time, crane, lit, area (facts only) |
| `ais_positions` | mmsi, time | fetch_time, lat, lon, sog_kn, cog, heading, nav_status, source, licence_class |
| `ais_vessels` | mmsi | name, callsign, imo, ship_type, ship_type_group, class, flag, length_m, beam_m, first_seen, last_seen |
| `ais_fetches` | fetch_time | vessels_listed, private_counted, dropped_licence, by_source |
| `tide` | station, time | value (15-minute EA readings; each run brings 48 h, each reading stored once) |
| `line_status` | fetch_time, line_id, severity | status, reason (300 characters at most) |
| `river_bus` | fetch_time, pier_id, line_id | arrivals, next_s (counts of predictions, not each prediction) |
| `weather` | time | fetch_time, temp_c, humidity_pct, wind_kmh, gust_kmh, wind_dir, cloud_pct, precip_mm, weather_code |

Rules: small private craft are never listed (the `fetch-ais.mjs` rule is repeated in the tool: ITU 36/37 and class B
without a type are dropped; their count is `ais_fetches.private_counted`). No NOTAM text, no UK Power Networks letter
text, no JamCam images. A run goes into the month of its newest snapshot, so tide readings within 48 h of a month
boundary can be in two files. Not cached, on purpose: LAQN air quality (no open licence found; the pages still ask it on
request), police.uk crime (monthly), JamCam stills (TfL serves them), the helicopter structure (static).

Example: `SELECT datetime(fetch_time,'unixepoch') t, sum(bikes) FROM bikes GROUP BY fetch_time;`

## Sizes and growth (measured 2026-10-05)

- One real hourly run (17:41 UTC): 387 new rows (139 bikes, 112 tide readings, 35 AIS positions, 25 line statuses, …),
  run file 10.1 kB. Objects that the commit added (`git count-objects -v` after `git gc`, loose and zlib-compressed):
  latest.json 13.9 kB, the run file 10.1 kB, three trees and the commit 1 kB: about 25 kB a run.
- 30 days, hourly: 720 x 25 kB = about 18 MB, before any pack delta (latest.json and the trees delta well, so less).
  The day folders keep each tree to 24 entries (one flat folder would have reached 720 entries, about 30 kB a tree).
  Plus the closed month's SQLite once: a SQLite grows about 22 kB a run (simulated), about 16 MB a month, about 8 MB
  in git (zlib). So about 25 MB a month in all; about 300 MB a year.
- The first design, for the record: 48 simulated commits of the growing SQLite packed to 683 kB after `git gc
  --aggressive`, but each push and the server's storage are not guaranteed that delta (worst case 720 x the mean size,
  several GB a month).
- Not git LFS: raw.githubusercontent.com serves the pointer, not the file, and the free quota is 1 GB.
- `latest.json`: 46 kB, 13 kB gzipped.
- GeoPackages: zone-core 16.9 MB (17 layers), zone-lds 38.0 MB (82), zone-portals 13.2 MB (64). GitHub warns above
  50 MB and refuses above 100 MB: the first single `zone.gpkg` (67.9 MB, commit 2a2a891) stays in londat history (about
  65 MB). Each rebuild adds about 68 MB: rebuild only when an input changes. Not zipped: QGIS and GDAL open a .gpkg
  directly from a download, and a zip would save little on WKB coordinates.

## Pages: JSON, not sql.js-httpvfs

Decision with numbers: `latest.json` is one request of 13 kB gzipped. sql.js-httpvfs would need its worker and the
sql.js WebAssembly (about 1 MB) and several 4 kB range requests per query, for data a page shows as one line. The
SQLite is for analysis (QGIS, Python, a notebook), not for page loads.

`live-cache.js` (`CwLive`) is loaded after `data-base.js` by the atlas and the 3D page. `CwLive.pick(theme, fromCache,
live, direct)` uses the cache unless the visitor ticks "Live" (3D page: `#liveDirect`; atlas: `[data-direct]` in each
live panel) or the theme is older than 60 minutes; each line says "(londat cache, fetched …)" or "(live from the source:
reason)". Cached: tide (Tower Pier 0007, Silvertown 0001), weather, line status (Jubilee, DLR, Elizabeth, Windrush,
cable car), storm overflows (filtered to the model box as the live query). The 3D page's camera markers come from the
committed `feeds/live/jamcams.json` unless Live is ticked (106 cameras in the box from the snapshot, 116 from TfL's
4.5 km radius query on 2026-10-05). Air quality is always live (not cached).

Requests measured headless (Playwright, 2026-10-05), pressing "Load live data":

| page | before (and with Live ticked) | after (default) |
|---|---|---|
| 3D page, 1600 x 900 DPR 1 and 390 x 844 DPR 3 | 7 third-party (EA 2, Open-Meteo, LAQN, TfL 2, ArcGIS) | 2 (raw.githubusercontent.com 1, LAQN 1) |
| atlas | 6 (EA 2, Open-Meteo, LAQN, TfL, ArcGIS) | 2 (raw.githubusercontent.com 1, LAQN 1) |

At page load nothing changed: the atlas asks no third party; the 3D page asks only Open Waters AIS (the ships layer,
on by default by the owner's decision of 2026-10-04, polling every 60 s; not touched). No console errors at either size.
In the container, Open-Meteo sometimes fails CORS through the proxy with Live ticked: an environment fault, not the page.

## Scheduling

`.github/workflows/cache-live.yml` in londat: cron `17 * * * *` and `workflow_dispatch`; a checkout of londat (the
tools are here since 2026-10-07; before, a sparse checkout of `magpie/cwplans/tools`, `feeds/live`, `feeds/river` and
`data-register.json` from glitchcan-minigam master), `npm ci --omit=dev` (proj4, geotiff and earcut: the
"dependencies" of package.json; the build tools are devDependencies), the tool, then a commit of `cache/runs/`,
`cache/latest.json` and any new `cache/live-*.sqlite`, a stash of the snapshot files the fetch tools rewrote, and three
pull-rebase-push tries; `concurrency` stops overlap. The commit, made with the workflow token, starts no other workflow,
and `pages.yml` ignores `cwplans/cache/**`, so the hourly run does not redeploy the site. The
session could push the workflow file to londat (2026-10-05) but could not start it by API (403 "Resource not accessible
by integration"): the first run is the first cron after the push. Check the Actions tab of londat. A Claude Routine is
not used for this.

## Register

- `data-register.json` has entries for `cache/runs/*/live-*.json.gz` and `cache/live-*.sqlite` (families:
  `check-data-register.mjs` matches `*` in folder and file names and needs at least one file
  unless the entry has `"may_be_empty": true`, as the monthly SQLite has until November; a new day or month needs no
  edit), `cache/latest.json`, and `cache/zone-core.gpkg`, `zone-lds.gpkg` (osm use "derived") and `zone-portals.gpkg`,
  each with the union of its inputs' sources. AIS rows carry the AIS review note.
- `pipeline.json` activities `cache-londat` and `build-zone-gpkg` (area feeds).
- `data-base.js` sends `cache/` paths to raw.githubusercontent.com (`CwData.hosted(path)` is true for them).
- Run `node cwplans/tools/check-data-register.mjs --write` and read the exit code.

## The GeoPackages in QGIS and GDAL

Download a file from the links above (the "Download raw file" button on GitHub, or
`https://raw.githubusercontent.com/danbri/londat/main/cwplans/cache/zone-core.gpkg`). The pages do not load them.
QGIS: Layer > Add Layer > Add Vector Layer, choose the file (or drag it into the window), pick layers. `model_*`
layers are EPSG:27700 (British National Grid; area.js x = E - 537550, z = -(N - 180300)); the others EPSG:4326; London
Datastore and portal layers keep the CRS of their GeoJSON. Licence and attribution per layer: Layer Properties >
Information (the gpkg_contents description, written from the register; ODbL first where the file uses OSM), and the
attribute table `layer_licences` in each file. GDAL: `ogrinfo -so zone-core.gpkg model_buildings`. R-tree indexes on every
spatial layer; `validate_gpkg.py` passes on all three (2026-10-05).

Traps found while building it:
- area.js tunnels have `pts` ([x, z, y, along, …]) and no `q`.
- GDAL's `/vsigzip/` writes a `.properties` sidecar next to each `.gz` it reads (six appeared in londat and failed the
  register check): the tool sets `CPL_VSIL_GZIP_WRITE_PROPERTIES=NO`.
- `validate_gpkg.py` Req 152: 59 empty geometries in `portal_pdg_flood_risk_zone` without the empty flag; the tool sets
  empty geometries to NULL and keeps their attributes. The system `python3` has no working GDAL bindings; `python3.12`
  has.
- A `file://` clone ignores `--filter=blob:none`: a test clone of glitchcan-minigam took 1.1 GB of a 1.4 GB free disk.
  Test sparse checkouts with `git worktree add --no-checkout` instead. (The workflow needs no sparse checkout since
  2026-10-07.)
