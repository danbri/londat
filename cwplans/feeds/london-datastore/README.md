# London Datastore walk (2026-10-04)

**The data files of this folder are in https://github.com/danbri/londat/tree/main/cwplans/feeds/london-datastore (moved 2026-10-05; same relative paths). This README and the code followed on 2026-10-07: all are in danbri/londat now.**

A recorded walk through the whole London Datastore (https://data.london.gov.uk/, Greater London Authority) for the
Docklands zone: the catalogue, a triage of every dataset by written rules, and a harvest of 31 open datasets clipped
to the zone. Owner, 2026-10-04: "Can we work our way through open data London portal?" Second walk, same day: "No
Open London Dataset Left Unexplored" and "look into unknown area datasets - areas may be specified within the data":
the details of all 1,305 datasets, the area read from inside the data of 671 datasets, and a final state for every
dataset (below).

- Tool: `tools/walk-london-datastore.mjs` (https://github.com/danbri/londat/blob/main/cwplans/tools/walk-london-datastore.mjs)
- Method, rules and how to re-walk: skill `cwplans-london-datastore`
  (https://github.com/danbri/londat/blob/main/cwplans/skills/cwplans-london-datastore/SKILL.md)
- Files here: `catalogue.json` (every dataset, one per line, with its details), `triage.json` (class, reasons, final
  state and the rule that fired, per dataset; ranked list), `probe.json` (the area found inside the data, with the
  evidence), `zone-codes.json` (the zone's OA/LSOA/MSOA/ward codes and postcodes), one folder per harvested dataset
  with a `.geojson` or a `.json` table that carries a `meta` member (source, URLs, fetch date, licence, attribution,
  method, counts).
- Live: https://danbri.github.io/londat/cwplans/feeds/london-datastore/triage.json and
  https://danbri.github.io/londat/cwplans/feeds/london-datastore/probe.json

## Source, API and terms

- The site runs on DataPress. Current API: `GET /api/v3/datasets/export.json` (all 1,305 public datasets in one
  response, 11 MB) and `GET /api/v3/dataset/<id>`. The CKAN-compatible `/api/action/package_search` still answers (all
  datasets in one response; `q`, `rows`, `start` are ignored); `organization_list` and `license_list` answer
  410 "Deprecated Route". `/api/3/action/*` redirects (307) to `/api/action/*`.
- Fields used: licence, topics, tags, `custom.geo` (spatial granularity), `custom.update_frequency`, created and
  updated dates, resources (file, size, timestamp, timeframe), links with their QA status.
- Terms (https://data.london.gov.uk/about/terms-and-conditions, read 2026-10-04): data may be used for any purpose;
  each dataset has its own licence; a re-user must state that **the GLA cannot warrant the quality or accuracy of the
  data**, and must not imply GLA endorsement. robots.txt disallows only `/debug`, `/manage/`, `/login`, `/logout`.
- Politeness: one request at a time, at least 1.1 s apart, backoff on 429 and 5xx, User-Agent
  `glitchcan-cwplans/0.1 (https://github.com/danbri/londat)`. The walk itself is two requests; the harvest
  made 18 downloads (91 MB, including the two later dropped: Flood Risk and the 2024 LGBTQ venue list). The details walk (`--details`) covers all 1,305 datasets
  (second walk): 0 archived, 0 resources that the export lacks, `geo` the same as the export; it adds the generic
  format, an md5 per resource and the description, from which only area words are kept (`details` in the catalogue).

## Counts (triage of 1,305 datasets)

Licence class (from the dataset's licence title):

| class | datasets | allowed here |
|---|---|---|
| ogl (OGL v2 476, OGL v3 396) | 872 | yes |
| cc-by (Creative Commons Attribution) | 68 | yes, with attribution |
| public-domain (Public Domain 5, PDDL 4) | 9 | yes |
| odc-by (ODC Attribution) | 7 | yes, with attribution |
| share-alike (CC BY-SA 3, ODbL 5) | 8 | **no** (CLAUDE.md: no share-alike except OSM) |
| restricted (All Rights Reserved 13, CC Non-Commercial 2) | 15 | no |
| other (TfL Transport Data Service Licence) | 2 | not taken |
| none stated | 324 | no (until the publisher states one) |

Relevance to the zone (first rule that matches):

| class | datasets | open |
|---|---|---|
| zone-place (names a place in the model box: Isle of Dogs, Poplar, Royal Docks, Canada Water...) | 6 | 3 |
| zone-borough (names only Tower Hamlets, Southwark, Lewisham, Greenwich, Newham or the City) | 12 | 10 |
| london-fine (London-wide, finer than a borough: point, polygon, ward, LSOA, MSOA, OA, postcode, grid) | 263 | 224 |
| london-borough (borough rows only) | 362 | |
| london-coarse (London, region or coarser) | 255 | |
| other-area (names only places outside the zone) | 54 | |
| unknown (no geo field, no granularity word) | 353 | |

Relevant (zone-place, zone-borough, london-fine): **281**; open and relevant: 237; open, relevant, not sensitive and
new to the project: 202 (`meta.counts.open_relevant_new` before this commit's registrations: 215).

Kind (update frequency): periodic 509, static ("One off") 330, live (daily, hourly, realtime) 13, unknown 453.
533 datasets have no resource newer than 2020 (`stale`).

Themes (keyword rules on title and tags plus the Datastore topics; a dataset can have several): people and housing
statistics 598, buildings and places 297, environment 256, occupants and organisations 189, transport 138, events and
works 122, heritage 6.

Sensitive (catalogued, never harvested): 8 — Fatal fires (24yo6, incident postcodes; added in the second walk), MPS homicide dashboard, MPS custody and strip searches, two MPS stop and
search sets, LFB bariatric incidents, rough sleeping (CHAIN), suicide mortality rates.

## Second walk: area from the data and a final state for every dataset

**Zone references** (`zone-codes.json`, `walk-london-datastore.mjs refs`): 20,315 zone postcodes (ONSPD August 2026,
grid reference in the box), and the codes of the areas that meet the box or hold a zone postcode: OA 2001/2011/2021
(1,113 / 1,328 / 1,509), LSOA (247 / 307 / 318), MSOA (65 / 75 / 75), wards 2011, 2014, 2018, 2026 (63 / 65 / 65 / 67).
In the raw cache only: 366,912 zone UPRNs (OS Open UPRN) and 65,589 zone TOIDs (OS Open Linked Identifiers).

**Area from the data** (`probe.json`, `walk-london-datastore.mjs probe`, readers in `tools/lds-probe.mjs`): every open,
not sensitive dataset whose metadata area was unknown, borough or London-wide (671) was opened: up to 3 readable
resources each, 1 MB of a text file (HTTP Range), whole workbooks to 20 MB, zips to 60 MB, GeoPackages to 100 MB
(776 MB read in the first pass). 558 were read; 113 were not (66 with no readable data resource: documents, images,
audio; 43 links only; 4 over the size caps). No download failed. Signals looked for: coordinates (lat/lon or easting/northing, judged by the value, not the column
name), feature envelopes, UPRNs, TOIDs, postcodes, OA/LSOA/MSOA/ward/borough codes, borough names and zone place
names. Rules D1 to D8 (first match) are in `probe.json` `meta.rules` and the skill.

| area found in the data | datasets | of which the metadata said unknown |
|---|---|---|
| zone-point (a coordinate or feature in the box) | 11 | 5 |
| zone-uprn (a zone UPRN) | 1 | 1 |
| zone-postcode (3+ distinct zone postcodes) | 3 | 1 |
| zone-code (a zone OA/LSOA/MSOA/ward code) | 20 | 10 |
| zone-place (2+ zone place names, 3+ cells; weakest) | 19 | 3 |
| london-fine (finer than a borough, no zone value in the sample) | 5 | 3 |
| borough-rows | 282 | 13 |
| london-coarse (London, region, national) | 112 | 26 |
| none (no geography in the sample) | 105 | 63 |
| not read | 113 | 65 |

So 20 of the 190 open datasets with no area in the metadata have zone values inside (10 by codes, 5 by points, 1 by
UPRN, 1 by postcodes, 3 by place names); 34 more said borough or London-wide and hold zone rows (fault F27).

**Final state of all 1,305 datasets** (`triage.json` `state`, `state_rule`, `state_reason`; rules F1 to F11 in
`meta.rules.final_state`):

| state | datasets | rule |
|---|---|---|
| harvested (held by the project) | 35 | F2 |
| listed-for-harvest (relevant, machine-readable; reason and size given) | 219 | F6 |
| not-relevant | 539 | F8 data: borough rows 282, London or coarser 112, none 104; F9 other areas 37; F3c by hand 4 |
| not-open (licence) | 346 | F3: none stated 322, restricted 15, share-alike 7, other 2 |
| deferred | 142 | F10 data not readable 70; F4 links only 59; F7 documents only 11; F3b excluded before 1; F3c by hand 1 |
| unavailable | 16 | F4: links only, every link failed the Datastore QA check |
| sensitive | 8 | F1 |
| **sum** | **1,305** | |

**What the project already had** (dataset ids and slugs found in the committed files before this walk): held 2
(London Public Realm Trees 2r45m in `docklands/data/trees.json`; LBSM 2 2k55d through `tools/registry-lbsm.mjs`),
listed 45 (catalogue entries in `feeds/feeds.json`, the 2026-10-03 survey and notes; the LDD extracts are only
documented), excluded before 3 (MPS homicide, MPS custody, road casualties). After this commit: held 15. One old
reference does not resolve to a current dataset: `dataset/recorded_crime_summary` (in `feeds/feeds.json`).

## Harvested (31 datasets, new to the project; 13 in the first walk, 18 in the second)

Zone = the 3D model box (WGS84 -0.095, 51.474 to 0.015, 51.522). Whole geometries that meet the box are kept;
`whole_in_zone` and `in_cw` (meets the Canary Wharf registry box) are added. Output: GeoJSON, WGS84 (BNG through OSTN15).

| folder | dataset | licence | source features | in zone | in CW box | joins |
|---|---|---|---|---|---|---|
| `cultural-infrastructure/` | 23697 Cultural Infrastructure Map 2023 (26 venue layers) | OGL v3 | 5,256 | 662 | 13 | UPRN (599; 56 rounded, F22: 12 recovered in the amended copy, 44 still unknown), ward and borough codes, address, website |
| `brownfield-register/` | 2og9g Brownfield Register (CSV points) | OGL v3 | 3,066 (167 without a point) | 229 | 6 | site reference, organisation URI, address text |
| `conservation-areas/` | emqwg Conservation Areas | OGL v3 | 1,095 | 112 | 6 | GLA layer reference, borough |
| `southwark-local-list/` | e1r5k Southwark Local List | OGL v3 | 1,242 | 599 | 0 | postcode, street, council PDF link |
| `designated-open-space/` | e195k Designated Open Space (2019 file) | OGL v3 | 5,475 | 517 | 16 | layer reference, borough |
| `site-allocations/` | 2jxpm Site Allocations | OGL v3 | 2,072 | 137 | 9 | geometry only (F23) |
| `strategic-industrial-land/` | 2y5xy SIL | OGL v3 | 148 | 14 | 0 | geometry only (F23) |
| `locally-significant-industrial-sites/` | 29z31 LSIS | OGL v3 | 324 | 8 | 1 | geometry only (F23) |
| `safeguarded-wharves/` | 2g90r Safeguarded Wharves | OGL v3 | 52 | 10 | 1 | site name, borough, direction text |
| `article4-office-residential/` | 2gy3r Article 4: office to residential (2019) | OGL v3 | 571 | 9 | 1 | layer reference, borough |
| `central-activities-zone/` | 23jxk Central Activities Zone (London Plan 2021) | OGL v3 | 1 | 1 | 0 | — |
| `air-quality-monitoring-sites/` | 23n41 Air Quality Monitoring Sites | CC BY 4.0 | 239 | 28 | 0 | site id, network |
| `lvmf-2026-consultation/` | 2gqpn LVMF 2026 consultation (paths, vistas, viewpoints) | OGL v3 | 114 | 35 | 0 | view ids |
| `town-centres/` | e55z7 Town Centre Boundaries (2025-12) | OGL v3 | 234 | 23 | 1 | site reference, name, class (Canary Wharf: Major) |
| `opportunity-areas/` | epr7z Opportunity Areas (2025-08 shapefile; the GPKG is geometry only, F28) | OGL v3 | 35 | 11 | 2 | site reference, name (Isle of Dogs, Canada Water...) |
| `high-streets/` | 2rq4w GLA High Street Boundaries (2025-06) | OGL v3 | 640 | 30 | 1 | high street id, name |
| `business-improvement-districts/` | vqmx7 BIDs (2025-05 shapefile, Web Mercator, F29) | CC BY | 76 | 7 | 0 | BID name, borough, web link |
| `statistical-boundaries/` | 20od9 LSOA 2021, MSOA 2021, wards 2018 | OGL v3 | 6,653 | 457 | 43 | LSOA, MSOA and ward codes and names |
| `census2021-ward-*/` (4 sets) | 2lw9m, 2r7gm, 24636, vqlx7 2021 Census by ward (summary workbooks) | OGL v3 | 57,242 rows | 4,203 rows | — | ward code (49 zone wards and the City as one row) |
| `census2021-lsoa-*/` (3 sets) | e76rk, emxpl, 2gj6n 2021 Census by LSOA (summary workbooks) | OGL v3 | 284,659 rows | 18,126 rows | — | LSOA 2021 code (318 zone LSOAs) |
| `heat-demand/` | 2ogw5 London Heat Map 2024 building heat demand (431 MB CSV in a zip) | OGL v3 | 2,080,631 | 54,181 | — | TOID, easting/northing (area columns dropped: derivable) |
| `solar-opportunity/` | vdxyl London Solar Opportunity Map by TOID (264 MB CSV, streamed) | OGL v3 | 3,340,029 | 55,261 | — | TOID (LiDAR of 2012, F30) |
| `green-roofs-caz/` | 2nl6n Green roofs in the CAZ (2015 imagery) | CC BY | 476 | 89 | 0 | area m2 |
| `urban-heat-island-2016/` | vdjgm Urban Heat Island, warm summer 2016 (grid points) | OGL v3 | 1,732 | 56 | 9 | grid x/y, temperatures |
| `laei-2019-focus-areas/` | 2zj76 LAEI 2019 Air Quality Focus Areas (no .prj, F29) | OGL v3 | 160 | 22 | 1 | name, borough |
| `air-quality-annual-objectives/` | 2w184 Air quality summary statistics (to 2015) | OGL v2 | 7,449 rows | 760 rows (15 sites) | 151 | site code (WGS84 columns hold Web Mercator, F31) |

**Rounded UPRNs (F22): the amended copy.** `cultural-infrastructure/cultural-infrastructure.uprn-amended.geojson` is a
copy of the harvested file in which only recovered UPRN cells differ; every change, every value left unknown, the
detection catalogue and the measured precision are in `cultural-infrastructure.uprn-amendments.json`. Made by
`tools/amend-uprns.mjs cultural-infrastructure` (https://github.com/danbri/londat/blob/main/cwplans/tools/amend-uprns.mjs).
2026-10-04: 56 rounded rows (49 venues); fixed 12 rows (12 venues): 6 from other releases of the same map (high
confidence), 6 from OS Open UPRN points in the venue's building (medium); 44 rows still unknown (3 with only a
low-confidence candidate, not applied; 41 with two or more candidates or none). Join on the amended copy, high and
medium values only. Also found: in 10 of the 26 layers the venue points sit a constant (-112, +54) m from their own
UPRN's point (F25). Method: skill `cwplans-london-datastore`, "Amending rounded UPRNs".
Live: https://danbri.github.io/londat/cwplans/feeds/london-datastore/cultural-infrastructure/cultural-infrastructure.uprn-amendments.json

Attribution for every file: "Contains public sector information licensed under the Open Government Licence v3.0"
(CC BY for the air quality sites) with the publisher named in `meta.attribution`, and "The GLA cannot warrant the
quality or accuracy of the data." No personal contact field was dropped. Tables (census, heat, solar) are `.json`
files with `meta` and `tables[]` (`header_rows`, `rows`), the zone rows only; the heat file leaves out eight area
columns that a join gives back (listed in its `meta.columns_dropped`).

Choices made by hand from the ranked list (also in the tool's `HARVEST` table):
- Cultural Infrastructure: the 2023 dataset's GIS file (all 26 venue types) instead of the 2025 dataset (2rj5o: no
  licence stated) or the 2024 one (2zj1y: LGBTQ venues only).
- Brownfield Register: the CSV, not the GeoPackage (F23: the GPKG has no attributes and its OBJECTID is not the CSV's).
- Flood Risk (2w4wy) was harvested once and dropped: 994 polygons with no flood zone class, all pointing to the EA
  Flood Map for Planning, which is the better source.
- Southwark's own Conservation Areas (2rjn1, ranked first) is not taken: the London-wide set (emqwg) has them.

## Third walk: the listed datasets harvested by rules (2026-10-04)

Owner, 2026-10-04: "Keep working thru datasets". The 219 datasets listed for harvest were run through
`tools/lds-harvest-auto.mjs` (https://github.com/danbri/londat/blob/main/cwplans/tools/lds-harvest-auto.mjs):
written rules choose the resources, every row and feature is read, and only the zone's rows and features are kept.
The outcome of every dataset is in `harvest-log.json`
(https://danbri.github.io/londat/cwplans/feeds/london-datastore/harvest-log.json) and triage reads it:
no zone rows -> not-relevant (rule F8b, with the counts read as evidence), documents only -> deferred (F7), a hand
decision -> deferred (F3c), unreadable -> deferred (F10b). Rules, hand rules and traps: skill `cwplans-london-datastore`,
"Rule-driven harvest". Faults found: F36 to F41.

- Zone row keys: zone OA/LSOA/MSOA/ward codes of every vintage, the old 00BGGG ward codes and the 2011 merged wards
  (both added to `zone-codes.json` by `refs-old-wards`), postcodes and postcode sectors in profiled columns, UPRNs, TOIDs,
  coordinates in the box, and for tables keyed by names only the zone's station, town centre and Opportunity Area names
  (`zone-names.json`). Each kept row carries the key that matched (`zone_keys`).
- Readers: CSV streamed and not stored, ExcelJS for large workbooks (the 75-82 MB housing-led projection workbooks),
  SheetJS for xls/ods, zips entry by entry, GeoPackages, GeoJSON, shapefiles; a big zip of documents is listed by HTTP
  Range and not downloaded.
- Size: polygons over 1,000 vertices cut to the zone plus 500 m; LAEI 20 m grids thinned to 100 m; the noise bands and
  local plan layers rounded and thinned; tables where points would be larger. Sizes per dataset are in the log.
- Held for the owner (not run): lift entrapments 2g980, LFB incident records em8xy, LFB mobilisations 24r65, LFB animal
  rescues 2ogkn (incident records at addresses), and the Assembly Member gifts register e68wz.
- Also re-tried with the new readers: the deferred datasets that the probe could not read (over the size caps).

**Result (harvest-log.json, 223 datasets run, 2026-10-04):** harvested 183 (143.6 MB of zone rows and features), no zone
rows 26, documents only 3, not readable 1 (em83m, system files only), deferred by hand 6 (2r401 AQMesh time series
42 MB; 2ry01 LAEI 2008 20 m concentration grids, over a 12 GB heap; emxjy 2001 commissioned tables; epr1g Code-Point
Open 2014, the ONSPD August 2026 positions are held; exynl AMR 14 and v8o0m AMR 13, their LDD extracts repeat the 2020
extract), held for the owner 4. Harvested by theme (index.json): people, housing and census 63; buildings, land and
planning 41; environment, air and energy 34; occupants and organisations 19; transport 14; events and works 7;
heritage and views 1; other 4.

**Final state of all 1,305 datasets after the third walk:**

| state | datasets | rule |
|---|---|---|
| harvested | 219 | F2 |
| listed-for-harvest | 4 | F6: the LFB incident, mobilisation, animal rescue and lift entrapment records, held for the owner |
| not-relevant | 565 | F8 498; F8b no zone rows when read 26; F9 37; F3c by hand 4 |
| not-open (licence) | 346 | F3 |
| deferred | 147 | F10 66; F10b 1; F4 58; F7 14; F3c by hand 7 (the 6 above and e68wz, the Assembly Member gifts register, held for the owner); F3b 1 |
| unavailable | 16 | F4 |
| sensitive | 8 | F1 |
| **sum** | **1,305** | |

Joins to the building registry (`tools/join-lds.mjs`, `registry/sources/lds/building-links.json`): heat demand 1,308
links on 808 buildings by TOID (1,229 high, 79 medium); solar potential 1,266 links on 763 buildings by TOID (1,205
high, 61 medium); venues 13 (11 by UPRN, high; 2 by position, low); other point records 73 on 35 buildings (position in
the outline, medium); brownfield 1 (low); Census LSOA context for 1,129 buildings (position, high; 25 LSOAs).

Browse: the atlas view "London Datastore" (https://danbri.github.io/londat/cwplans/atlas/#lds), with
a map layer per dataset or per theme, and the building records (heat demand, solar potential, Census context of the
LSOA, venues and other records placed in the building) in the atlas and on the 3D page
(https://danbri.github.io/londat/cwplans/docklands/). Index:
https://danbri.github.io/londat/cwplans/feeds/london-datastore/index.json

## Ranked backlog before the third walk (219 listed for harvest; now run through the rules above)

`triage.json`: `state` = `listed-for-harvest`, ranked by `score`; `state_reason` gives the rule and the size. The head,
by hand:

| dataset | why it matters | note |
|---|---|---|
| vdjql Areas of Intensification (gpkg) | London Plan intensification areas | small; check `attributes_in_source` (F23/F28 class) |
| v8w4q Biodiversity Hotspots for Planning (GiGL, CC BY, shp 8.6 MB) | 5,016 zone polygons (probe) | large output; clip and keep the class fields |
| e70pq London Green Infrastructure Framework (2026) | hex grid (442 zone hexes) and hex results CSV (15 MB) | join hex results to the grid by hex id |
| 2g1rn Decentralised Energy Capacity Study (zips 52 MB) | heat loads with points and TOIDs (57 zone points in the sample) | overlaps `heat-demand/`; take the supply side |
| 20pj6 Schools air quality exposure (xlsx with easting/northing) | 179 zone schools | needs a sheet-to-points harvest |
| 2g980 Lift entrapments attended by LFB (UPRN) | 438 zone UPRNs in the sample | incident records at addresses: owner's view first |
| 2w1xz Referral planning applications since 2011 | 96 zone postcodes | join to the registry by postcode |
| 24y36 Gender Pay Gaps in London (employers with addresses) | 306 zone postcodes (EC, E14) | occupants: join by postcode and name |
| 2k843 London Ward Well-Being Scores; e1zg8 travel to work by bicycle, ward; 2489z land use by ward | ward rows | old wards (2014): use `zone-codes.json` ward2014 |
| 20og1, 2w9wz, e790q, expxp, eprjg 2011 Census by ward/LSOA/OA | zone codes found | the 2021 sets are harvested; take 2011 for change |
| 2jxzj Fuel Poverty; 23g07 childhood obesity (ward, MSOA); 29z80 health inequalities indicators | zone LSOA/ward rows | statistics, small |
| 2wwq4 2024-based housing-led population projections (ODC-By, xlsx 75 MB each) | the zone's growth by ward | over the 20 MB sheet cap: a stream reader for xlsx is needed |
| 29j4y London Schools Atlas | catchments | GIAS already gives the schools |
| v8onw / vdjx4 / vd455 ULEZ boundaries | the whole zone is inside | low value |
| 2zwnk Noise Pollution in London (2018) | road and rail noise | Defra 2022 maps are newer |
| 2ko88 / 2zj1y Cultural Infrastructure Map (2019, 2024) | pubs, community centres not in the 2023 set | evidence for F22 already read by tools/amend-uprns.mjs |

By hand, not harvested (rule F3c, `JUDGED` in the tool): Flood Risk 2w4wy (EA polygons without a zone class), Southwark
conservation areas 2rjn1 (in emqwg), Postcode Directory exp5p (ONSPD held), LBSM 1 296oy (LBSM 2 held); the Assembly
Member Gifts register e68wz is deferred (records about named people). Road casualties e1z1j stays excluded (F3b).
Place-name matches (D4) are the weakest class: election results by constituency, LFB station names and survey answers
match place names; read `probe.json` before taking one.

Zone-specific but no licence stated (not taken; ask the GLA): 20pw9 and 2j0n0 Isle of Dogs and South Poplar OAPF,
2gq0r Listed Buildings in Southwark, 2z18q Canada Water Masterplan hearing documents, vd43m Tower Hamlets waste
strategy. 2rj5o Cultural Infrastructure Map 2025 (the newest venue list) also states no licence.

## Gaps

- The probe reads a sample: a London-wide file sorted by code can hold zone rows after the first 1 MB or 3,000 rows
  (then it is london-fine, not zone). Not opened: 324 datasets with no licence (metadata only), documents (pdf, docx),
  links-only datasets, 4 files over the caps (`probe.json` `skipped`). London-fine datasets of the first walk (by
  metadata) were not probed.
- The theme rules are keyword lists; topics add themes broadly (every "planning" dataset counts as buildings and
  places). Read the reasons before trusting a rank.
- 324 datasets state no licence. Several are GLA documents that are probably OGL; they stay out until the GLA says so.
- Links-only datasets (UKPN, TfL live feeds) need the publisher's own API; not followed.
- Geometry-only GeoPackages (F23): site allocations, SIL and LSIS have no names or references. The GLA Planning Data
  Map ArcGIS service that holds the attributes answered 403 to the container (2026-10-04).
