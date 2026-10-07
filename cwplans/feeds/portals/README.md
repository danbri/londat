# Open-data portals walked for the zone (other than the London Datastore)

**The data files of this folder are in https://github.com/danbri/londat/tree/main/cwplans/feeds/portals (moved 2026-10-05; same relative paths). This README and the code followed on 2026-10-07: all are in danbri/londat now.**

The London Datastore has its own walk (`../london-datastore/`). This folder holds the walks of the other catalogues
that cover the Docklands zone (the 3D model box, BNG E 532400-539900, N 176700-182300). One adapter per portal in
`tools/portals/`, one entry point `tools/walk-portals.mjs`; method, rules, licences and traps in
`skills/cwplans-open-portals/SKILL.md`. Each portal folder has `catalogue.json` (the catalogue as walked),
`triage.json` (the final state of every dataset, with the rule and the reason), one folder per harvested dataset
(`<key>/<key>.geojson` or `.json`, zone only, with a `meta` member: source, API, fetch date, licence, attribution,
method, counts) and a README. `index.json` has the counts per portal (`walk-portals.mjs index`).

| portal | folder | walked | datasets seen | final states | harvested | size |
|---|---|---|---|---|---|---|
| data.gov.uk (CKAN) | `dgu/` | 2026-10-04 | 59,451 (25,492 in scope) | harvested 14, held 28, listed 1,126, deferred 1,990, not-relevant 9,145, not-open 4,809, unavailable 3,199, walked-elsewhere 5,109, sensitive 72 (after a service probe of 384 datasets) | 14 zone extracts found by the probe: blue-space access points, noise important areas, rail noise, EA flood risk extents, flood warning areas, recorded and historic flood outlines, main rivers, priority habitats, the Thames Path | 2.6 MB (catalogue and triage gzipped) |
| planning.data.gov.uk | `pdg/` | 2026-10-04 | 222 | harvested 26, held 11, not-relevant 79, unavailable 106 | 26 datasets: listed buildings and outlines, Heritage at Risk, Article 4 areas, area TPOs, EA flood zones, AQMAs, LNRs, NSIPs, section 106 (Greenwich), plan records | 7.2 MB |
| zone borough portals | `boroughs/` | 2026-10-04 | 33,991 (City 176 layers, Tower Hamlets 8, Southwark 16,897 and Greenwich 16,898 observatory indicators, Lewisham 11, Newham 1) | harvested 28, held 11, listed 1, deferred 46, not-relevant 4, not-open 4,100, walked-elsewhere 29,801 | City of London layers (St Paul's Heights, Historic Land Use, cultural spaces, cycleways, stations, safeguarding areas...), Lewisham EV charge points | 1.9 MB |
| Nomis Census 2021 bulk | `nomis/` | 2026-10-04 | 74 tables | harvested 68, not-relevant 5, unavailable 1 | 68 topic summaries: 52 at output area (1,509 zone OAs), 16 at MSOA | 3.7 MB |
| ONS Open Geography Portal | `onsgeo/` | 2026-10-04 | 2,630 items | harvested 6, held 3, listed 426, deferred 116, not-relevant 2,023, not-open 56 | OA 2021 polygons, OA and LSOA centroids, OA lookup, workplace zones 2011, wards May 2026 | 3.5 MB |
| national sources | `national/` | 2026-10-04 | 19 sources | harvested 7, held 7, listed 2, deferred 1, not-relevant 1, not-open 2, unavailable 1 | DfT traffic counts, STATS19 aggregates, police.uk aggregates, DESNZ energy by LSOA/MSOA, OS Open Names (4,066 places), OS Open Rivers, IMD 2025 | 1.4 MB (gzipped) |

On disk under `feeds/portals/`: 18 MB (2026-10-04). Size rule (coordinator, 2026-10-04): a file over 1 MB is written
gzipped (`.json.gz`, `.geojson.gz`; pages read them with DecompressionStream); large national tables stay raw and
uncommitted and are listed as available on request in each README.

**Notable for the zone**: 1,769 listed buildings (80 grade I) and 1,557 outlines; every Article 4 area of four
boroughs; EA flood zones 2 and 3 cut to the box; the Thames Tideway, Silvertown Tunnel and Heat Main NSIP outlines;
Greenwich's 370 section 106 agreements with 1,398 contributions; 68 Census 2021 tables for the zone's 1,509 output areas or 75 MSOAs; 4,066 OS Open Names places;
222 traffic count points with 26 years of flows; 10,363 injury collisions 2021-2025 by LSOA; 80,432 crimes by
snap point; domestic and non-domestic energy by small area; the City's St Paul's Heights and Historic Land Use layers.

**Licences that blocked**: BGS (no licence on 4,128 records), City of London layers under the OS INSPIRE end-user
licence (34) or with no licence (94), the Tower Hamlets hub (no licence named; the same data taken under OGL from
planning.data.gov.uk), observatory indicators with no rights statement (about 3,970), JNCC "no conditions apply"
(open-unclear). **Robots**: the Nomis API is disallowed (bulk zips used), and the EA `/geoservices` path is
disallowed (`/spatialdata/` used). **Refused**: www.ofcom.org.uk (403).

States (the same words in every portal): **harvested** (a zone extract is committed here), **held** (the project
already has the data, from this or another source: the file is named), **listed-for-harvest** (open, relevant, not
yet taken: the ranked backlog), **deferred** (documents only, or the area is unknown until the data is read),
**not-relevant** (another area, coarser than a borough, a code list, administrative records), **not-open** (no
licence, restricted, non-commercial or share-alike), **unavailable** (no resources, ended, deleted), **sensitive**
(titles about victims, deaths, custody, safeguarding of people: never harvested), **walked-elsewhere** (another walk
covers the source whole).

Licences: only OGL, CC BY, ODC-By and CC0/PDDL data is committed. A source with no licence is catalogued, not
harvested. Each harvested file carries its attribution in `meta.attribution`.
