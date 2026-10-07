# Nomis: Census 2021 bulk downloads, walked for the zone

Source: https://www.nomisweb.co.uk/sources/census_2021_bulk (ONS Census 2021 topic summaries, OGL v3.0). Tool:
`tools/walk-portals.mjs nomis walk | triage | harvest` (adapter `tools/portals/nomis.mjs`). Walked 2026-10-04.

**Robots.txt** (read 2026-10-04): Nomis disallows `/query/`, `/api/v01/dataset/`, `/api/v01/codelist/` and
`/api/v01/concept/` for every agent. The Nomis API is therefore not used. The bulk zips under `/output/census/2021/`
are allowed: one zip per table holds CSVs for output areas up to countries (a second `-extra` zip holds other
geographies). Before robots.txt was read, two requests went to the API catalogue (`def.sdmx.json`, a probe and a download); the answer was
deleted and not used.

- `catalogue.json`: the 74 topic-summary tables of the bulk page (code, title, topic, zip links).
- `triage.json`: harvested 68, not-relevant 5 (published from local authority up only: TS009, TS012, TS024, TS070,
  TS076), unavailable 1 (TS079: the zip is not readable, twice).

## Harvested: zone rows of 68 tables (3.7 MB)

Every topic summary at the finest level its zip holds: output area for 52 tables (1,509 zone OAs), MSOA for 16
(75 zone MSOAs: single year of age, detailed ethnic group, country of birth, religion, occupation and industry
detail, second addresses, armed forces, unpaid care and other tables ONS publishes only from MSOA up). The first
set of 20 chosen by hand: TS001 usual residents, TS003 household composition, TS004 country of birth, TS007A age
(5-year bands), TS011 deprivation dimensions, TS017 household size, TS021 ethnic group, TS029 English proficiency,
TS030 religion, TS037 general health, TS038 disability, TS044 accommodation type, TS045 car or van availability,
TS050 bedrooms, TS054 tenure, TS058 distance to work, TS061 method of travel to work, TS062 NS-SeC, TS066 economic
activity, TS067 highest qualification; then the rest with `--all`. Each file: `meta` (source, zip, CSV entry,
licence, attribution, method, `columns`, `level`) and `rows` (`[area code, value, value, ...]`). A zone area is one
whose 2021 code is carried by an ONSPD postcode in the box (`../../london-datastore/zone-codes.json`). Join through
`../onsgeo/oa21-lookup/`; OA polygons in `../onsgeo/oa21-boundaries/`.

Fault F45: in the TS010 (population density) zip the OA and LSOA CSVs are empty (0 bytes), so TS010 is read at MSOA;
an empty CSV is skipped and listed in `meta.empty_files_in_zip`. The TS009 zip names one file `-ulta.csv` (for utla).
Zips are deleted after reading (disk); `--keep-raw` keeps them.

The London Datastore walk already holds GLA census workbooks by ward and LSOA (`../../london-datastore/census2021-*`).
These OA rows are finer and come straight from the ONS release.
