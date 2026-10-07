# National sources of the brief

Tool: `tools/walk-portals.mjs national walk | triage | harvest` (adapter `tools/portals/national.mjs`). The list of
sources, with API, licence, robots.txt and state, is written by hand in the adapter (`SOURCES`) and copied to
`catalogue.json`; `triage.json` gives the state. Checked 2026-10-04.

| source | state | why |
|---|---|---|
| DfT road traffic counts (AADF) | harvested | `dft-aadf/`: 222 count points in the box, every year 2000-2025 (counted or estimated), 266 kB |
| DfT STATS19 collisions, last 5 years | harvested | `dft-stats19/`: aggregates only: LSOA x year (2021-2025) with fatal, serious, slight, casualties and how many lie in the box; 10,363 collisions; no collision, casualty or vehicle rows. 52 kB |
| police.uk street-level crime | harvested | `police-crime/`: 12 months to August 2026, 80,432 crimes read, aggregated to 2,782 police.uk snap points x 14 categories, and month x category. No crime ids or outcomes. 246 kB |
| DESNZ electricity and gas by LSOA and MSOA, 2010-2024 | harvested | `desnz-energy/`: zone rows of six workbooks (domestic and non-domestic by MSOA, domestic by LSOA), every year. 2.0 MB |
| Ofcom Connected Nations | unavailable | www.ofcom.org.uk answers 403 to scripted requests, robots.txt included. The London Datastore walk holds an Ofcom broadband-by-postcode table from the GLA (`../../london-datastore/`) |
| Nomis API | not-open (not used) | robots.txt disallows `/api/v01/dataset/` and `/query/`; the census comes from the bulk zips (`../nomis/`) |
| HMLR price paid, HMLR INSPIRE polygons, FSA ratings, Historic England, EA flood zones, OS Open UPRN, OS Open Greenspace | held | already in the project, or harvested here from planning.data.gov.uk |
| OS Open Names | harvested | `os-open-names/`: 4,066 named places, roads, stations, schools, waters in the box from the GB CSV (tiles TQ26 and TQ28: the GB file uses 20 km tiles), with DBpedia and GeoNames links; the 11,272 postcode entries are left out (postcode centres are held from ONSPD). 1.7 MB |
| OS Open Rivers | harvested | `os-open-rivers/`: 19 watercourse links and 15 hydro nodes with a vertex in the box. 15 kB |
| OS Open USRN, Open Roads, Built Up Areas | listed-for-harvest | GB downloads of 0.3 to 1 GB; the container had about 2 GB of free disk on 2026-10-04 |
| English Indices of Deprivation 2025 (MHCLG) | harvested | `mhclg-imd2025/`: File 7, all ranks, scores, deciles and denominators for the 318 zone LSOAs. 99 kB |
| BGS | deferred | licences differ per product; read each before use |
| Coal Authority | not-relevant | London is outside the coalfield |
| EPC register | not-open | account and address-data terms |

STATS19 trap: the column `lsoa_of_accident_location` holds 2021 LSOA codes in the 2021-2025 file. Matched against
the zone's 2011 codes only, 1,431 of 10,362 zone collisions were found; with the 2021 codes, all of them.
