# Works in progress: the construction index

`sites.json` lists the construction sites of the Docklands zone (the 3D model box, WGS84 -0.095, 51.474 to 0.015, 51.522,
plus the Royal Docks margin 0.015 to 0.085, 51.495 to 51.522), one record per site. Built by
`node magpie/cwplans/tools/build-construction-index.mjs` (add `--no-fetch` to rebuild from the caches in
`data/raw/construction/`). Method, rules and traps: skill `cwplans-construction`
(https://github.com/danbri/glitchcan-minigam/blob/master/magpie/cwplans/skills/cwplans-construction/SKILL.md).
Shown on the 3D page, Layers > "Works in progress":
https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/

Owner, 2026-10-04: "Note the works in progress on far side of the central tower - do we have an index of these?" Before this
there was no index: cranes were in `feeds/live/notams.json`, highway cranes and hoardings in
`feeds/works/street-manager-activities.json`, designations in `feeds/london-datastore/`, and nothing held planning status.

## The sites in the owner's photos of 4 October 2026

Photos: `docklands/reference/day-2026-10-04/` (CC0 1.0, from the Greenland Pier pontoon). From the pier the two schemes lie on
one line of sight, bearings 33.05° and 33.17° from grid north, so one stands in front of the other. **They are two schemes on
neighbouring plots, not one.**

| what the photo shows | the scheme | planning (Tower Hamlets) | status (PLD/LDD) | who (sources) | approved | built on 4 Oct 2026 |
|---|---|---|---|---|---|---|
| a bare concrete core with blue "TIDE" screens and two "TIDE" tower cranes, floors numbered 24 to 31, behind | **30 Marsh Wall** (corner of Marsh Wall and Cuba Street), student housing | PA/20/02588/A1, approved 2022-07-28 | commenced 2025-10-03, no completion: on site (S1) | Tide Construction, developer and contractor; Vita Group, client; modules by Vision Modular Systems; EPR Architects (30marshwall.co.uk; Construction Enquirer 2022-08-07 and 2025-02-27) | 48 storeys, 156 m, 1,068 rooms; open summer 2028 (developer site) | core to about 115 m OD (±5 m), at least 31 floors (numbers painted to 31): measured in the owner's wide photo through the fitted camera |
| a wrapped building printed "25 CUBA" with "ballymore" and "PENTA" screens at the top, in front | **25 Cuba Street** (25 Cuba; also called 22 Cuba Street), Cuba Street site at Manilla and Tobago Streets, homes and a new park | PA/20/02128/A1 approved 2022-12-21 (superseded), PA/24/00733/S (s73 amendments) approved 2025-05-29 | commenced 2025-09-01, no completion: on site (S1) | Ballymore with Penta Real Estate (Ballymore project page; "ballymore" and "PENTA" on the screens in the owner's photo); Morris + Company, architect (CTBUH) | 421 homes (Ballymore; the PLD gives 434 units), 52 floors, 174.1 m, completion 2029 (CTBUH Skyscraper Center) | top of the screens about 80 m OD (±5 m), about 23 storeys |
| two more cranes (a white luffing crane and a lattice crane) behind and left, over a building in scaffolding | not identified: their masts are at bearing 31.5° from the pier in the wide photo, just right of 22 Marsh Wall (29.97°); the distance is not known. On that line lie **North Quay** (on site, PA/20/01421/A1, 1.55 to 1.76 km) and **Chrisp Street Market** (on site, PA/16/01612, 2.2 to 2.5 km); neither has a crane NOTAM | | | | | |
| a lattice (crawler) crane at the far right of the wide photo, behind a grey building | probably **Westferry Printworks** (bearing 89°, inside the site's 74° to 92° span from the pier; on site by S2b: commenced 2016-12-01, OSM maps construction now) | PA/15/02216/A1, PA/23/02375/A1 | | | | |

Evidence for the match: the PLD centroids of both schemes (51.501741, -0.024114 and 51.501291, -0.02458), OSM `landuse=construction`
"30 Marsh Wall" (way 353900842) and "Ballymore - Cuba Street" (way 269741594) with `building=construction` outlines inside them,
Street Manager mobile crane bookings on Marsh Wall ("30 Marsh Wall", 13 to 18 October 2026) and Manilla Street (12 to 25 October
2026), and the developers' own pages. No NOTAM in the PIB of 2026-10-04 08:00 UTC covers either site's cranes, although the
photo puts the white crane's jib tip at about 161 m OD.

## Counts (build of 2026-10-04)

Planning London Datahub records in the zone (major: 10 or more homes, or 1,000 m² or more of non-residential floor space
gained): 5,127, in 3,395 groups. Sites kept: **436**.

| status | sites | rule (confidence) |
|---|---|---|
| on site | 98 | S1 LDD commencement within 7 years, no completion (high): 65; S1b "Commenced", no date, decided within 7 years (medium): 2; S2b old commencement and construction seen now (medium): 27; S4b approved, a NOTAM crane or an OSM building=construction outline, no commencement recorded (medium): 4 |
| approved, not started | 112 | S4 approved within 5 years, not lapsed or superseded (medium); 14 more of these have a weaker sign of work (`status_note`) |
| completed recently | 31 | S3 completion within 2 years (high) |
| proposed | 64 | S5 undecided application or appeal (high) |
| commenced long ago, never completed | 131 | S2 (low): catalogued as fault F32 |

Dropped and counted: 2,267 groups completed more than 2 years ago; 692 refused, withdrawn, lapsed or with no status.

By source (sites with at least one match): Planning London Datahub 436 (footprint polygon 326, from OSM 9, a circle for the
rest; approved storeys 268); NOTAM cranes 7 sites (11 of 12 cranes matched; C4600/26 "vicinity of Silvertown" has no site);
Street Manager highway activities 21 (on site: 13); OSM construction areas 103 (on site: 54; 57 OSM areas in the zone match no
site); brownfield register 51; site allocations 107; Wikidata items 241 (129 high); developer pages 2; owner photos 2.

## Sources and licences

| source | what we take | licence and terms |
|---|---|---|
| Planning London Datahub, `https://planningdata.london.gov.uk/api-guest/applications/_search` (one POST) | reference, status, decision, dates (with the LDD commencement and completion), centroid, polygon, units, floor space, storeys and heights per building, description cut to 300 characters, borough link | GLA Planning London Datahub terms (not confirmed as OGL): metadata and links only. "Source: Planning London Datahub (Greater London Authority and the London boroughs)" |
| NOTAMs, `feeds/live/notams.json` | crane positions and heights | © NATS (UK AIS); facts only. "Source: UK AIS (NATS)" |
| DfT Street Manager, `feeds/works/street-manager-activities.json` | crane, hoarding, compound and other highway activities | OGL v3.0 |
| OpenStreetMap, local extract `greater_london-latest.osm.pbf` (OSM data of 2026-10-01) | `landuse=construction`, `building=construction`, `building:part=construction`, `construction=*` (not roads or railways): element id, a few tags, outline | ODbL 1.0, © OpenStreetMap contributors |
| London Datastore brownfield register (2og9g) and site allocations (2jxpm) | links by position | OGL v3.0; the GLA cannot warrant the quality or accuracy of the data |
| Wikidata through QLever (one query) | items with a coordinate in the zone that are buildings, construction projects or under construction: label, state, dates, height, floors, contractor, owner, client, architect | CC0 1.0 |
| `facts.json` (hand-written) | facts from crawled developer, project and press pages with URL and date; measurements from the owner's photos | crawls allowed for scoping (owner, 2026-10-03); robots.txt read for each host; the Tower Hamlets planning register (Idox) disallows all crawling and is not fetched; photos CC0 1.0 |

Not used: Glenigan, Barbour ABI, EGi, CoStar and other paid construction databases (proprietary); the VOA rating list
(restricted); OSM is the only share-alike source.

## Gaps

- The PLD gives no storeys for many sites (none for 30 Marsh Wall and 25 Cuba: those come from the developers' pages and CTBUH).
- No NOTAM for the two cranes in the photos: the PIB lists only cranes that are notified as NOTAMs; London City Airport's own
  crane permits are not published as open data.
- Contractors are known only where a page says so (2 sites); Wikidata gives a contractor for few buildings in the zone.
- "Approved, not started" is the PLD's view: commencement is entered late (F33). Four sites with a crane or an OSM building
  outline under construction have no commencement yet.
