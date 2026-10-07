---
name: cwplans-construction
description: >-
  The index of works in progress (construction sites) in the cwplans Docklands zone: registry/sources/construction/
  sites.json built by tools/build-construction-index.mjs from the Planning London Datahub (borough decisions with the London
  Development Database commencement and completion dates), joined by position to NOTAM cranes, DfT Street Manager,
  OSM construction areas (ODbL), the brownfield register, site allocations and Wikidata, plus facts from developer pages
  and the owner's photos (facts.json). Covers the PLD guest API and its traps, the grouping of applications into sites,
  the status rules S1 to S5, the match rules M1 to M6, the faults F32 to F35, identifying a site in a photo by bearing
  and height, the "Works in progress" layer of the 3D page, and what is not open (paid construction databases, crane
  permits). Reach for it before you refresh or extend the index, add a source of site status, answer "what is being
  built there?", or draw sites on a page.
---

# Works in progress (cwplans)

Policy, the fault register and the activity log are in the hub skill `docklands-data-curation`
(`cwplans/skills/docklands-data-curation/`). Append what you did to its `ACTIVITY-LOG.md`.
Owner, 2026-10-04: "Note the works in progress on far side of the central tower - do we have an index of these?"
README with the counts and the answer about the owner's photos:
https://github.com/danbri/londat/blob/main/cwplans/registry/sources/construction/README.md
Page: https://danbri.github.io/londat/cwplans/docklands/ (Layers > "Works in progress").

## Run

    NODE_USE_ENV_PROXY=1 node cwplans/tools/build-construction-index.mjs            # fetch what is not cached, build
    node cwplans/tools/build-construction-index.mjs --no-fetch                      # rebuild from data/raw/construction/
    NODE_USE_ENV_PROXY=1 node cwplans/tools/build-construction-index.mjs --refresh  # fetch the PLD, OSM scan and Wikidata again

About 80 s, most of it the OSM scan of the local Greater London extract. Refresh the inputs first when they are old:
`fetch-live.mjs notams` (NOTAMs change hourly) and `fetch-works.mjs street-manager` (monthly). Without
`NODE_USE_ENV_PROXY=1` Node `fetch` ignores the proxy. The output is `sites.json` with one site per line (small diffs).

## The Planning London Datahub (PLD)

- Guest Elasticsearch endpoint `POST https://planningdata.london.gov.uk/api-guest/applications/_search`, no key. The index holds
  the boroughs' applications and, for permissions, the London Development Database fields: `actual_commencement_date`,
  `actual_completion_date`, `lapsed_date`, per-unit and per-floor-space dates, `application_details.building_details`
  (`no_storeys`, `max_height`, `building_ref`), `scheme_name`, `wgs84_polygon`, `centroid`, `url_planning_app`.
- **Text fields cannot be aggregated** (no `.keyword` sub-fields: a terms aggregation answers 400 or empty buckets). Filter
  with `match`, count with `track_total_hits`, and do the rest client side. One query with `size: 10000` returns every major
  record in the zone (5,490 in the box, 9 MB).
- **Dates are text, dd/mm/yyyy**: a `range` query on them does not work. Convert on our side.
- **Status values** in the zone (major records): Completed, Superseded, Lapsed, Commenced, Approved, Application Under
  Consideration, Withdrawn, Refused/REFUSED, Dismissed, Allowed, Appeal..., and junk ("MAY", a non-breaking space, "GRPRI").
- **"Major"** here = proposed residential units 10 or more, or non-residential GIA gained 1,000 m² or more. Householder and
  small works are left out on purpose.
- **Polygons**: of 5,127 zone records, 1,803 have a real polygon, 1,923 a point marker (a square of a few metres round the
  centroid) and 1,401 none (F35). A polygon under 50 m² is treated as no polygon.
- **Heights**: `max_height` is entered by the borough; where the description gives a height it says "m AOD" (56-58 Marsh
  Wall: 151.905 m AOD = `max_height` 151.9). Not every record says; the page draws it as m OD and the card says so.
- Licence: "GLA Planning London Datahub terms (not confirmed as OGL)": metadata and links only; descriptions cut to 300
  characters. The borough register links (`url_planning_app`) are kept as links; the Tower Hamlets Idox site has
  `robots.txt` "Disallow: /" and is never fetched.

## Grouping and status

A site is a group of records joined by (a) the same reference base (`PA/20/02128` and `PA/20/02128/A1`), (b) a description
that cites another record's reference within 300 m (an s73 amendment names its parent), (c) centroids within 10 m. 5,127
records gave 3,395 groups. Large phased schemes stay as several sites (one per plot), which is what the page needs.

| rule | status | confidence | test |
|---|---|---|---|
| S1 | on site | high | a record has an LDD commencement within 7 years and no completion, and is not lapsed, withdrawn or refused |
| S1b | on site | medium | status "Commenced" with no date, decided within 7 years |
| S2 | commenced long ago | low | commenced more than 7 years ago, never completed, nothing else says work is going on (F32) |
| S2b | on site | medium | S2, and an OSM construction area overlaps, a NOTAM crane is within 60 m, or a Street Manager crane, hoarding or compound is within 50 m |
| S3 | completed recently | high | the latest completion is within 2 years and not before the latest commencement |
| S4 | approved, not started | medium | approved within 5 years, not lapsed or superseded, no commencement in the group |
| S4b | on site | medium | S4 and a NOTAM crane within 60 m or an OSM `building=construction` outline over it (F33) |
| S5 | proposed | high | an undecided application or appeal |

Counts on 2026-10-04: on site 98 (S1 65, S1b 2, S2b 27, S4b 4), approved 112, completed recently 31, proposed 64, commenced long
ago 131. The windows (7, 5 and 2 years) are judgements; change them in the tool header constants and say so here.

## Joins (each with a confidence and the rule that made it)

| rule | source | match | confidence |
|---|---|---|---|
| footprint | PLD polygon (50 m² or more), else OSM `building=construction` / `landuse=construction` that overlaps, else a circle of the stated site area, else 25 m | | `footprint.from` says which |
| M1 | NOTAM cranes (`feeds/live/notams.json`) | nearest on-site, approved or stale site within 150 m of the footprint | high within 60 m, medium to 150 m (jib reach) |
| M2 | Street Manager activities | nearest such site within 120 m | high within 50 m |
| M3 | OSM construction areas and nodes | nearest site within 30 m | high when overlapping |
| M4 | brownfield register points | within 40 m | `geox`/`geoy` are WGS84 or BNG per row (F23): a northing over 90 is BNG |
| M5 | site allocations | the site centre inside the polygon (no attributes in the GeoPackage: F23) | medium |
| M6 | Wikidata buildings and projects (QLever, P625 in the box) | within 40 m | high within 15 m with a label word in the site's name or description; low with no word in common (most "low" are neighbours) |
| facts | `facts.json` | planning reference base | as written |

Measured: 11 of 12 NOTAM cranes matched (4 at 60 Gracechurch Street plus N422; C4600/26 "vicinity of Silvertown" has no site);
57 OSM construction areas in the zone match no site (listed in `unmatched.osm`; many are small works below the "major" filter).

## Faults found (hub register F32 to F35)

- **F32** Commencement with no completion for years: 158 groups commenced more than 7 years ago and never marked complete
  (Baltimore Wharf 2008, Westferry Printworks 2016). 27 show construction now (S2b); 131 show nothing.
  Some are phased outlines still being built, some are finished and never closed. Do not read "Commenced" as "on site".
- **F33** The PLD's dates lag and one is computed: 4 sites with a NOTAM crane or an OSM building under construction have no
  commencement yet (60 Gracechurch Street, 75 London Wall, TW2 at Blackwall, G Park Docklands); and 44 of 2,908 commenced
  records started after their `lapsed_date` (30 Marsh Wall: lapses 2025-07-28, commenced 2025-10-03). `lapsed_date` is the
  decision date plus the permission period, not an observation; never drop a commenced record for it.
- **F34** Wikidata "state of use: under construction" (P5817 Q12377751) on finished buildings: Landmark Pinnacle (Q16258428,
  completed 2020) and South Quay Plaza (Q21585412), 2 of the 4 such items in the zone. Shown, never used for status.
- **F35** PLD polygons that are point markers (1,923 of 5,127 zone records) or missing (1,401); the PLD gives no storeys for
  30 Marsh Wall or 25 Cuba. Footprints fall back to OSM or a circle and say so.
- **Related, F52 (2026-10-07, hub register)**: buildings finished after the 2022 LiDAR with no OSM levels or height are a
  dig or a guessed 6 m in the 3D model (247 guessed heights; a tower at Consort Place drawn as a pit). The rule proposed
  for `tools/build-docklands.mjs` takes storeys from a dated source, and this index (PLD `no_storeys`, completion
  dates) is one of them. Not done yet: waiting for the owner.

## Identifying a site in a photo

The owner's photos (`docklands/reference/day-2026-10-04/`) were matched this way, and it works for any photo with tower tops
in it: fit the camera (`tools/solve-photo-sun.mjs`), turn the pixel of a crane, a core top or a screen into an azimuth and an
elevation, and compare with the bearing from the eye to each site's footprint (`ring_local`), and the height the elevation
gives at the site's distance. Two sites can share one line of sight (30 Marsh Wall and 25 Cuba are 0.1° apart from Greenland
Pier, 60 m apart in depth): then the names on the hoardings, the developers' pages and the measured heights separate them. A
crane seen with no NOTAM is normal: the PIB has only the cranes notified as NOTAMs.

## Crawls (facts only, recorded in facts.json `crawls`)

Developer and press pages may be crawled for facts for scoping (owner, 2026-10-03). Read `robots.txt` first; one GET per page;
keep the URL, the date and the facts taken, never the text or images. Done 2026-10-04: 30marshwall.co.uk, ballymoregroup.com,
25cuba.com, constructionenquirer.com (two articles), skyscrapercenter.com (CTBUH: facts only). Refused by robots.txt:
development.towerhamlets.gov.uk (Idox). Not fetched: ukreiif.com (the press report of the Ballymore and Penta joint venture;
the "PENTA" screen in the owner's photo is the evidence used).

## Not open, not used

Glenigan, Barbour ABI, EGi, CoStar and similar construction-project databases (paid, proprietary); the VOA rating list
(restricted); London City Airport crane permits (not published as data); borough Idox registers by script (Tower Hamlets
disallows it; others are forms). OSM is the only share-alike source in the index.

## The 3D page layer

`docklands-3d-page` skill, "Works in progress": what is drawn (outline, approved height frame, crane masts, current height
for the two sites in the photos), the record card and the credits.
