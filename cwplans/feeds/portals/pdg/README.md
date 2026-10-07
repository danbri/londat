# planning.data.gov.uk, walked for the zone

Portal: https://www.planning.data.gov.uk/ (MHCLG Planning Data platform). Every dataset is under the Open Government
Licence v3.0; each has its own attribution text, which is copied into the `meta.attribution` of each harvested file.
Tool: `tools/walk-portals.mjs pdg walk | triage | harvest` (adapter `tools/portals/pdg.mjs`). Method and rules:
`skills/cwplans-open-portals/SKILL.md`. Walked 2026-10-04.

- `catalogue.json`: all 222 datasets of `dataset.json`, with the number of entities that meet the zone (the platform's
  own spatial query: geometry intersects the 3D model box), or, for documents, agreements and plans, the number of
  entities from the zone planning organisations (GLA 144, Greenwich 150, Lewisham 198, City 203, Newham 246,
  Southwark 329, Tower Hamlets 350).
- `triage.json`: the final state of every dataset. 2026-10-04: harvested 26, held 11, not-relevant 79, unavailable 106.
  Held means the project already has the data from this or another source (title boundaries = HMLR INSPIRE; trees;
  NaPTAN; GIAS; scheduled monuments and APAs from Historic England; conservation areas, brownfield and the CAZ from the
  London Datastore; wards). 106 datasets are empty or ended; 79 are code lists, borough outlines or have nothing in
  the zone.

## Harvested (zone only; whole geometries, WGS84, 6 decimals)

| dataset | items | size | what |
|---|---|---|---|
| `listed-building` | 1,769 | 941 kB | NHLE list entries (points): name, list entry, grade (II 1,543, II* 115, I 80), Historic England link. Not taken before (registry/sources/museums/README.md) |
| `listed-building-outline` | 1,557 | 1,475 kB | listed building outlines drawn by the boroughs |
| `heritage-at-risk` | 58 | 76 kB | Heritage at Risk register entries |
| `certificate-of-immunity` | 20 | 27 kB | certificates of immunity from listing |
| `park-and-garden` | 6 | 20 kB | registered parks and gardens |
| `world-heritage-site`, `-buffer-zone` | 2, 1 | 24 kB | Maritime Greenwich, Tower of London |
| `article-4-direction-area` | 344 | 887 kB | every Article 4 direction area of Southwark 270, Tower Hamlets 46, Lewisham 24, City 4 (the GLA file held only office-to-residential) |
| `article-4-direction` | 602 | 414 kB | the directions themselves (rows by organisation) |
| `tree-preservation-zone` | 141 | 137 kB | area and group TPOs (trees as points are held) |
| `tree-preservation-order` | 72 | 28 kB | Tower Hamlets TPO instruments (rows) |
| `flood-risk-zone` | 824 | 1,184 kB | EA Flood Map for Planning, zones 2 and 3 with type (tidal, fluvial); simplified to 0.5 m and cut at the box |
| `air-quality-management-area` | 8 | 169 kB | AQMAs |
| `local-nature-reserve` | 7 | 24 kB | LNRs |
| `agricultural-land-classification` | 2 | 16 kB | ALC (urban) |
| `infrastructure-project` | 3 | 383 kB | NSIPs: Silvertown Tunnel, Thames Tideway Tunnel and one more, with outlines |
| `developer-agreement`, `-contribution`, `-transaction` | 370, 1,398, 813 | 1,044 kB | section 106 and CIL agreements, contributions and money received or spent: Royal Borough of Greenwich only (no other zone authority publishes them to the platform yet) |
| `conservation-area-document` | 151 | 104 kB | appraisals and management plans (links) of Greenwich, Lewisham, Newham, Tower Hamlets |
| `local-plan`, `plan-timetable`, `local-area-requirements`, `infrastructure-funding-statement`, `community-infrastructure-levy-schedule`, `design-code` | 17, 191, 6, 3, 2, 1 | 128 kB | plan records and links of the zone authorities |

Size added: 7.1 MB (harvests) + 0.14 MB (catalogue and triage).

## Notes

- The Tower Hamlets ArcGIS Hub (https://planning-datasets-towerhamlets.hub.arcgis.com/) serves the same listed
  buildings, conservation areas, TPOs and Article 4 layers with no named licence ("no special restrictions"); the
  platform copy is OGL, so it is the one taken (see `../boroughs/`).
- `planning-application` (100,627 entities nationally) and `development-corporation-boundary` have nothing in the zone.
- Rows carry the platform's `entity` number and `reference` (the publisher's own id) unchanged: keys for later joins.
