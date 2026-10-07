# data.gov.uk, walked for the zone

Portal: https://www.data.gov.uk/ (CKAN API `api/action/package_search`; robots.txt disallows only `/v1`). Tool:
`tools/walk-portals.mjs dgu walk | triage | catalogue` (adapter `tools/portals/dgu.mjs`); rules in
`skills/cwplans-open-portals/SKILL.md`. Walked 2026-10-04: 59,451 datasets in 60 pages of 1,000 (63 requests).

## Scope (written rule)

| scope | rule | datasets |
|---|---|---|
| S1 | published by a zone borough or a body local to the zone (Tower Hamlets, Southwark, Greenwich, Lewisham, Newham, City of London, LTGDC, Canal & River Trust, TfL, Royal Museums Greenwich, PLA, local NHS bodies) | 260 |
| S2 | published by a national body in the brief (EA, Historic England, Natural England, DfT, DLUHC/MHCLG, ONS, OS, HSE, Home Office, NHS, HM Land Registry, Coal Authority, BGS, DESNZ, Defra, DfE, CQC, VOA, Sport England, ...; the list is `NATIONAL_ORGS` in the adapter) | 23,863 |
| S3 | the GLA: its records are the London Datastore, walked by `walk-london-datastore.mjs` | 1,365 |
| S4 | any other publisher whose title or tags name a zone place or borough | 4 |
| out | other publishers (Scottish, Welsh and NI bodies, other councils, MEDIN...): counted per organisation in `triage.json` meta | 33,959 |

## Final states (25,492 in scope; after the service probe)

`node magpie/cwplans/tools/walk-portals.mjs dgu triage` on 2026-10-04 after the probe: not-relevant 9,145,
walked-elsewhere 5,109, not-open 4,809, unavailable 3,199, deferred 1,990, listed-for-harvest 1,126, sensitive 72,
held 28, harvested 14. The counts below are from the first triage, before the probe.

Run `node magpie/cwplans/tools/walk-portals.mjs dgu triage` for the current counts; on 2026-10-04: not-relevant
9,035, walked-elsewhere 5,113, not-open 4,809, unavailable 3,199, deferred 1,990, listed-for-harvest 1,257,
sensitive 72, held 17 (GLA records that the London Datastore walk has harvested count as held). `triage.json` lists one by one the datasets that need a decision or hold data (listed,
deferred with area unknown, held, sensitive); the bulk states are name lists in `by_state`, keyed
"state | rule | reason". `catalogue.json` holds the compact CKAN record of the datasets listed one by one.

**Licences that blocked** (not-open, 4,809): no licence on the record about 4,490 (BGS 4,128: BGS states its own
terms on each product page, so no BGS record is taken from here; JNCC 117; Defra 63; EA 60; Natural England 40; OS 28
outside the Data Hub), restricted about 170 (BGS 141 commercial products, Natural England 15), open-unclear about
150 ("no conditions apply" without a licence name; JNCC 145).

**Walked elsewhere** (5,113): ONS Open Geography Portal items (3,497: `../onsgeo/`), the GLA records (about 1,350), the City
of London INSPIRE map service (141: `../boroughs/`) and OS Data Hub products (128: `../national/`).

**Not relevant** (9,035): another area by bounding box or title (Scotland, Wales, other counties and boroughs),
administrative records (payments, spending, staff, contracts, FOI), or coarser than a borough.

## The listed backlog (1,257)

Ranked by `score` (relevance x themes x recency x spatial). By publisher: EA 507, ONS 208, Forestry Commission 197,
Natural England 151, DLUHC 45, Defra 33, RPA 33, NHS Digital 30, Historic England 18, DfT 7, JNCC 6, Canal & River
Trust 5, Lewisham 4, others 13. Most are national spatial layers whose metadata cannot say whether they hold
anything in the zone; the next step is a probe of their services (WFS hits and ArcGIS counts in the box, the "area
from the data" rule of the London Datastore walk). Datasets of high value for the zone are harvested through the
national adapters (`../national/`) or through planning.data.gov.uk (`../pdg/`), which re-serves several of them.

## Service probe: the area from the data (`probe.json`)

`walk-portals.mjs dgu probe` asked every listed dataset with a map service how many features meet the zone box: EA
`environment.data.gov.uk/spatialdata/<name>/wfs` (WFS 2.0 `resultType=hits`, up to 6 feature types), ArcGIS
FeatureServer/MapServer (`returnCountOnly`, up to 10 layers), other WFS. 384 datasets, 876 requests (about 90
minutes): 208 with features in the zone, 110 with none (state not-relevant, rule T7b), 66 with no count (service
errors). A positive probe triples the score. The EA `/geoservices` path is disallowed by robots.txt and not used.

## Harvested from the probe (14 datasets, 1.9 MB; files over 1 MB gzipped)

| dataset | features | size |
|---|---|---|
| `blue-space-access-points-in-england` (Defra) | 1,193 | 596 kB |
| `noise-action-planning-important-areas-round-3-england` (Defra) | 47 | 327 kB |
| `rivers-and-sea-3-3-defended-flood-risk-extents-present-day` (EA) | 68, cut at the box | 242 kB |
| `priority-habitats-inventory-england` (Natural England) | 429, cut at the box | 223 kB |
| `rail-noise-lden-england-round-3` (Defra) | 2,350 | 128 kB (gzipped) |
| `flood-warning-areas3` (EA) | 16 | 118 kB |
| `water-recreation-locations-zones-and-catchment-summaries-england` (EA) | 11 | 89 kB |
| `recorded-flood-outlines1` (EA) | 10 | 41 kB |
| `historic-flood-map1` (EA) | 30 | 30 kB |
| `statutory-main-river-map` (EA) | 54 | 26 kB |
| `national-trails-england3` (Natural England: the Thames Path, cut to the box) | 1 | 19 kB |
| `hydrometric-monitoring-points1`, `thames-estuary-2100-extreme-water-level-nodes`, `surveyed-priority-ponds-points` | 13, 20, 10 | 23 kB |

Available on request (not committed: size): road noise round 3 (Lden 11,139, LAeq16h 10,420, Lnight 7,981
polygons in the zone), rail noise LAeq16h and Lnight, the Living England habitat maps (8,811), surface-water flood
risk (hazard, speed, depth; 1,240 to 1,465 features; flow direction 682,386), rivers-and-sea depths, the crop map,
overland flow pathways. EA Flood Map for Planning zones are held from planning.data.gov.uk.

## Traps met

- "Poplar" is a tree: Forestry Commission short rotation coppice and Energy Crops records matched the zone place
  list. Zone places are read from the title and tags only, and not next to tree or crop words.
- Short slugs ("locks", "matrix", "find", "deaths") match project prose: a name counts as held only with 15+
  characters and a hyphen, or by its id.
- "Safeguarding" is also a planning word (airport and rail safeguarding areas): the sensitive rule asks for child or
  adult safeguarding.
- Deleted records keep their resources ("Deleted - moved to other existing datasets"): unavailable by title.
