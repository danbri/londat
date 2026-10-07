# Permits, works and closures: the Docklands zone

Dated snapshots of local-authority permissions (licence notices, street events, traffic orders, temporary-event planning
applications, markets), road works and closures, and planned rail, bus and river works, for the whole zone. Made by
`tools/fetch-works.mjs` (method, traps and rejected sources: skill
[cwplans-permits-and-works](../../skills/cwplans-permits-and-works/SKILL.md)). Page by date and place:
https://danbri.github.io/glitchcan-minigam/magpie/cwplans/feeds/whatson.html

Owner, 2026-10-04: "look into local authority permissioning for events, street closures, markets and events across
entire zone - these could inform us about adhoc events" and "get tfl and road/bus/train planned works".

**Why here and not `registry/sources/`:** these are time-varying notices about streets, lines and events, not facts
about buildings or occupants; nothing joins them to the building registry yet. They sit with the other feeds.

**Snapshots:** one file per source with a fixed name; `meta.fetched` is the date and git keeps the history (re-run
weekly). `works.json` holds every item in one shape: `id, source, kind, title, start, end, recurring, location, street,
postcode, borough, lat, lon, zone, url`.

**Zone:** `model` = the 3D model box (`docklands/data/area.js` meta.extent; BNG E 532400 to 539900, N 176700 to
182300; WGS84 -0.095, 51.474 to 0.015, 51.522), which takes in the east City and Whitechapel; `east` = Royal Docks,
ExCeL and City Airport (0.015 to 0.085, 51.495 to 51.522); `line` = a line serving the zone with no stop named;
`borough` = placed by issuing authority only; `district` = a postcode district wholly in the zone.

## Sources (run of 2026-10-04)

| snapshot | source, URL | licence and attribution | items in the zone | dates | what it says about ad-hoc events |
|---|---|---|---:|---|---|
| `tfl-lines.json` | TfL Unified API, `https://api.tfl.gov.uk/Line/{ids}/Status/{from}/to/{to}?detail=true` (29 lines) | TfL open data terms; "Powered by TfL Open Data" | 29 (24 placed by stop, 5 line-wide) | 3 Oct to 8 Nov 2026 (ends to 28 Dec) | weekend and night closures (Jubilee Green Park to Canary Wharf on 4 Oct; DLR Shadwell to Tower Gateway on Sundays; Windrush Surrey Quays closures); closures near event days change how crowds arrive |
| `tfl-bus.json` | `https://api.tfl.gov.uk/Line/Mode/bus/Status?detail=true`, `https://api.tfl.gov.uk/StopPoint/Mode/bus/Disruption`; NaPTAN for stop positions | TfL terms; NaPTAN OGL v3.0 | 53 (28 diversions, 25 stop closures) | from Jul 2024 to Feb 2027 | diversions name the cause: roadworks (Trafalgar Way, E14, Sunday 4 Oct, 08:00 to 16:00), utility and water works, road closures; some name events |
| `tfl-road.json` | `https://api.tfl.gov.uk/Road/all/Disruption` and `/Road/all/Street/Disruption`, 90 days | TfL terms | 59 (47 works, 9 planned events, 3 incidents) | to Feb 2028 | **the best ad-hoc event source**: "Planned events" with road closures, e.g. O2 concerts (Karan Aujila 4 Oct, The Strokes 6 Oct, Westlife 9 Oct), Ironworks music events at Tidal Basin (10, 11 Oct), a procession on Whitechapel Road (4 Oct), Remembrance services (8 Nov) |
| `street-manager.json` | DfT Street Manager archive `https://opendata.manage-roadworks.service.gov.uk/permit/2026/09.zip` | OGL v3.0 | 1,035 open permits (316 with road closure) of 3,909 in the zone in September | started Jun 2023 to Nov 2027 | works only; a road-closure permit near a venue on an event day is a conflict to check |
| `street-manager-activities.json` | Street Manager archive `https://opendata.manage-roadworks.service.gov.uk/activity/2026/09.zip` | OGL v3.0 | 44 (4 street events, 18 cranes, 14 other, 4 hoardings, 4 section 50) | Jan 2026 to Jun 2027 | `event` activities are events the highway authority booked on the street (Bishopsgate closure 19 to 20 Dec); crane days close lanes at weekends |
| `gazette.json` | The Gazette `https://www.thegazette.co.uk/all-notices/notice/data.json` (types 1501, 1503) + notice pages | OGL v3.0 | 72 of 77 notices (16 TTROs, 56 other orders; 10 placed by a zone postcode district, 62 by authority only) | published Jun to Oct 2026 | traffic orders and TTROs; few London boroughs publish temporary orders here, but some are events: Greenwich's "Labyrinth on Thames" road closures (Greenwich Church Street, King William Walk) |
| `th-licences.json` | `https://www.towerhamlets.gov.uk/lgnl/business/licences/alcohol_and_entertainment/Licence_applications_received_this_week.aspx` | council website terms: facts and link | 11 of 25 rows (8 TENs, 2 premises licences, 1 review) | applications 21 to 28 Sep; events to 1 Jan 2027 | **Temporary Event Notices are dated ad-hoc events** (Barbarella, Mackenzie Walk E14 for New Year's Eve; Pennington Street E1W 28 to 30 Oct); new premises licences show new venues |
| `planning.json` | Planning London Datahub `https://planningdata.london.gov.uk/api-guest/applications/_search` | GLA terms (not confirmed OGL): facts and link | 18 of 93 matching (the rest validated before Oct 2024) | applications May 2025 to Sep 2026 | temporary event spaces, ice rinks, marquees and stages (Greenwich: an ice rink with a marquee, Sep 2026; a 10-year temporary event venue, approved Sep 2026; stages on the Grand Axis, Jul 2026) |
| `markets.json` | OSM `amenity=marketplace` (local Greater London extract, 2026-10-01) + `https://www.towerhamlets.gov.uk/lgnl/business/markets/markets_in_tower_hamlets.aspx` | ODbL, © OpenStreetMap contributors; council page facts and link | 28 (25 OSM, 3 more from the council page) | recurring | regular markets with days and hours (Greenwich, Deptford, Chrisp Street, Maltby Street, Wapping Docklands, Royal Wharf) |

| `venue-events.json` | every verified event feed in `feeds/events.json`, read at run time (8 picked on 2026-10-04: The O2 RSS, Royal Docks Atom, Tower Hamlets events RSS, The Space, Wilton's Music Hall and Greenwich Theatre WordPress REST, the GLA and a Meetup ICS) | each venue or council site's terms: title, dates, venue and link only | 203 (O2 122, Space 20, Wilton's 20, Greenwich Theatre 17, Royal Docks 15, Tower Hamlets 9) | 4 Oct 2026 to 2 Apr 2027; 40 undated programme items | **venue programmes**: concerts at The O2, theatre at Greenwich Theatre, The Space and Wilton's, Royal Docks community events |

`works.json`: 1,552 items from 10 snapshots (284 shown under What's on, 1,268 under Closures and works).

## The page

https://danbri.github.io/glitchcan-minigam/magpie/cwplans/feeds/whatson.html has two views. **What's on** (the
default): venue programmes, Temporary Event Notices and licence applications, street events and planned events on
roads, temporary-event planning applications and markets, by day (today, each day of the next 30, later), then the
programme items the feeds give no date for, then markets and regular events. **Closures and works**
(`whatson.html#closures`): rail, DLR, Overground and river closures first, then bus diversions and stop closures, then
road closures and road works grouped by street and borough (count and date span, expandable), and Gazette traffic
orders; filters for today, the next 7 days, a chosen day or any date, and by kind. The table at the end gives each
source's item count, how many items each view shows, the fetch date, the attribution and the licence.

Owner feedback on the first version (2026-10-04): "looks like all roads and busses" (85% of the items were Street
Manager works). That is why the views are split and road works are grouped.

## Gaps

- **Other boroughs' licensing registers** (Southwark, Greenwich, Newham, Lewisham, City of London): Idox or council
  search forms, not lists. Not submitted: the store-finder exception does not cover other forms. Owner decision needed.
- **Tower Hamlets full register** (alcohol-entertainment.towerhamlets.gov.uk): TLS reset through the proxy again.
- **Weekly history**: the Tower Hamlets page shows one week; the Internet Archive was unreachable on 2026-10-04.
  Re-run weekly to build the series.
- **Street Manager is a month behind**: the archive for October appears on 1 November; live data needs an SNS endpoint.
- **Rail beyond TfL**: NRE Knowledgebase and Network Rail feeds need accounts. TfL's national-rail lines give only a
  status and a National Rail link.
- **Parks events and filming permits**: no published list or feed found for the zone boroughs.
- **Event dates in planning**: only application and decision dates; event dates are in the documents.
- **Venue programmes without dates**: The Space and Wilton's WordPress REST endpoints give the publish date only; their
  items are listed as "on the programme". The Greenwich Peninsula sitemap with per-event JSON-LD and the GLA feed (no
  place) are not harvested. A new venue feed needs a row in `VENUES` (host, name, postcode) unless its items carry a
  postcode.
- **Bus diversions** are placed by text: a long road can match a stop name near, not at, the works.

## Rejected

| source | why |
|---|---|
| National Rail engineering-works pages | site terms; scripted use not covered |
| Gazette per-notice linked data (`data.jsonld`, `?view=linked-data`) | disallowed by robots.txt |
| Street Manager section 58 notices | restrictions after resurfacing, not events |
| Street Manager skips and scaffolding | not events; often a home address (counted only) |
| Premises-name column of the Tower Hamlets page | sometimes a private licence holder's name |
