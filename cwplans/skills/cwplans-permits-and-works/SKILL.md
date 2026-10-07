---
name: cwplans-permits-and-works
description: >-
  Permits, works, closures and planned events across the magpie/cwplans Docklands zone (the 3D model box plus the
  Royal Docks): Tower Hamlets licence applications and Temporary Event Notices, DfT Street Manager permits and street
  events, TfL road disruptions, planned line closures and bus diversions (stops placed through NaPTAN), Gazette traffic
  orders and TTROs, temporary-event planning applications, markets, and venue and council programmes from the verified
  feeds in feeds/events.json. The tool tools/fetch-works.mjs, the snapshots in feeds/works/, works.json and the
  whatson.html page; each source's licence; how each item is placed; the traps (TfL lat/lon 0 for stops, the Gazette
  geo point is the publisher's office, Gazette Crawl-delay 10); what was rejected or not reached. Reach for it before
  you refresh or extend these sources, add a borough register, change the zone filter, or explain why an event,
  closure or works item is or is not on the page.
---

# Permits, works and closures (magpie/cwplans)

Policy, the fault register and the activity log are in the hub skill `docklands-data-curation`
(`magpie/cwplans/skills/docklands-data-curation/`). Append what you did to its `ACTIVITY-LOG.md`.
Owner instructions behind this work (2026-10-04): "look into local authority permissioning for events, street closures,
markets and events across entire zone - these could inform us about adhoc events" and "get tfl and road/bus/train
planned works". Written from the first run on 2026-10-04; counts are from that run.

Page: https://danbri.github.io/glitchcan-minigam/magpie/cwplans/feeds/whatson.html
Sources, counts and gaps: https://github.com/danbri/glitchcan-minigam/blob/master/magpie/cwplans/feeds/works/README.md

## Run

    NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-works.mjs                  # all sources, then works.json
    NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-works.mjs tfl-lines tfl-bus  # some sources
    node magpie/cwplans/tools/fetch-works.mjs --no-fetch                           # rebuild from data/raw/works/
    options: --refresh (re-download kept raw files), --days=90 (TfL look-ahead), --month=2026-09 (Street Manager)

Sources: `tfl-lines tfl-bus tfl-road street-manager gazette th-licences planning markets venue-events` (street-manager
writes two snapshots: permits and activities). Time on 2026-10-04: about 40 s for Street Manager (two archives already
downloaded; the permit archive is about 1 GB, 1,081,996 files), 45 s for buses (13 MB status file), 2 min for the
OSM extract (markets), and 10 s per Gazette request. Without `NODE_USE_ENV_PROXY=1`, Node `fetch` ignores
`HTTPS_PROXY` here.

Output: `feeds/works/<source>.json` = `{meta: {source, url, fetched, licence, attribution, method, zone, counts}, items}`
and `feeds/works/works.json` (every item, one shape: `id, source, kind, title, start, end, recurring, location, street,
postcode, borough, lat, lon, zone, url`). **Snapshots keep fixed file names**: the date is in `meta.fetched`, the
history is git. So the data register needs no new entry per run. Raw responses: `data/raw/works/` (gitignored).

## The zone

`zone` on every item: `model` = the 3D model box (`docklands/data/area.js` meta.extent: BNG E 532400 to 539900,
N 176700 to 182300; WGS84 -0.095, 51.474 to 0.015, 51.522, `BOX_WGS84` in `fetch-docklands.mjs`); `east` = the Royal
Docks margin 0.015 to 0.085, 51.495 to 51.522 (ExCeL, City Airport, Woolwich ferry: outside the model, inside the
owner's zone); `line` = a rail line that serves the zone with no stop named; `borough` = placed only by authority
(Gazette); `district` = a postcode district wholly in the zone (bus text). The model box takes in the east City
(Bank, Monument, Liverpool Street) and Whitechapel: items there are in the zone by this rule.

## Sources (2026-10-04)

| snapshot | source and licence | placed by | ad-hoc events it shows |
|---|---|---|---|
| `tfl-lines` | TfL Unified API `Line/{ids}/Status/{from}/to/{to}?detail=true`; TfL open data terms, "Powered by TfL Open Data" | affected stops through NaPTAN (910, 930, 940 areas) | engineering closures, weekend closures; a closure near an event day hints at crowd plans |
| `tfl-bus` | TfL `Line/Mode/bus/Status?detail=true` and `StopPoint/Mode/bus/Disruption`; NaPTAN 490 (OGL) | stop positions (NaPTAN) | diversions for road closures, events, water and power works |
| `tfl-road` | TfL `Road/all/Disruption` and `Road/all/Street/Disruption` with startDate/endDate | the TfL point | category "Planned events" = road events (runs, marches, filming, festivals) with closed street segments |
| `street-manager`, `street-manager-activities` | DfT Street Manager open-data archive (OGL v3.0) | works or activity coordinates (BNG, OSTN15) | activity type `event` = events on the highway the council has booked; cranes, hoardings; permits with road closures |
| `gazette` | The Gazette data.json search + notice pages (OGL v3.0) | issuing authority only | temporary traffic orders (TTROs) for events and works; few London boroughs publish them here |
| `th-licences` | Tower Hamlets weekly licence applications page (council terms; facts and link) | address postcode (postcodes.io, ONSPD) | Temporary Event Notices with dates: parties, pop-ups, New Year's Eve; new venues |
| `planning` | Planning London Datahub (GLA terms; facts and link) | site centroid | applications for temporary event spaces, marquees, ice rinks, stages, with decision dates |
| `markets` | OSM `amenity=marketplace` (ODbL, local extract) + Tower Hamlets markets page | OSM element; else the street the page names | regular markets with days and times |
| `venue-events` | every verified event feed in `feeds/events.json`, read at run time (each site's terms: title, dates, venue, link only) | postcode in the item, else the feed host's venue (`VENUES`, by postcode) | **the venue programmes**: concerts, theatre, community events |

Counts per source and the date range: README.

## Traps (measured)

- **TfL sends `lat: 0, lon: 0` for affected stops** in line and bus statuses. First run: 0 line disruptions placed by
  stop. Fix: NaPTAN positions. TfL stop-area ids (`940GZZDLCAN`, `910GLIMHSE`, `930GCAW`) map to the NaPTAN station
  entry by `^(\d{3})G` -> `$10` (`9400ZZDLCAN`); else by station name. NaPTAN area 490 has bus stops only; stations
  are in 910 (rail), 930 (piers), 940 (metro). After the fix: 24 kept by stop, 5 line-wide, 5 stops unplaced.
- **Bus route sections are whole routes** (`isEntireRouteSection: true`): they do not say where the disruption is.
  A borough name in the text is too coarse (first draft kept a Colyers Lane, Erith diversion because its text named
  Lewisham as a destination). Rule now: keep when the text names a stop that lies in the zone on one of its routes,
  else when the opening "STREET, DISTRICT:" is a district wholly in the zone (E1, E1W, E14, E16, EC3*, SE8, SE10, SE16).
  Long roads still leak: a stop name such as "Monument" matches text about works nearby.
- **The Gazette's `geo:Point` is the publisher's office, not the street** (Westminster notices carry a point in
  Canary Wharf: their agent). Filter on the issuing authority at the start of the notice text. The search `content`
  is a snippet, often "London Borough of …", so the notice page is fetched for each hit. A borough is still too
  wide (Southwark's East Dulwich and Lewisham's SE23 orders came back): an order that names postcode districts, none of
  which reaches the zone (zone districts plus E3, EC2, EC4, SE1, SE14, SE15), is dropped and counted. Remove the authorities'
  own office postcodes first (SE18 6HQ Greenwich, SE6 4RU Lewisham, E16 2QU Newham, SE1 2QH and SE1P 5LX Southwark,
  SE1 8NJ TfL, EC2V 7HH and EC2P 2EJ City): every notice gives one for objections, and the first draft read Southwark's
  SE1 2QH as the place of every Southwark order (27 dropped, then 4 once the office postcodes were removed).
- **Gazette robots.txt**: `Crawl-delay: 10`; `/notice/*/data.jsonld|.ttl|.rdf|.xml` and `?view=linked-data` are
  disallowed (one `data.jsonld` was fetched by mistake while probing on 2026-10-04; `?view=linked-data` answered 429).
  The tool fetches only `data.json` searches and `/notice/{id}` pages, 10 s apart. Submitter names (`f:name`,
  `f:familyName`) and signatories are not kept.
- **Street Manager live data is a push** (AWS SNS to a public HTTPS endpoint we do not have). The archive bucket
  `https://opendata.manage-roadworks.service.gov.uk` (S3 listing, `{permit,activity,section_58}/YYYY/MM.zip`) is
  the repeatable route; a month appears on the 1st of the next month. One JSON file per notification; `unzip -p`
  concatenates them and the tool splits on `}{"event_reference":`, then checks that the record count equals the
  file count (1,081,996 = 1,081,996). Keep the latest event per permit or activity reference.
- **Street Manager activities include householder skips and scaffolding**: counted, not kept (not events; often a home
  address). Permits are kept only when not cancelled, refused, revoked or closed and ending on or after the fetch date.
- **The Tower Hamlets weekly page holds one week**. The premises-name column is dropped (it sometimes holds a private
  licence holder's name, e.g. "Mr …"; rule from `feeds/events.json` th-licence-applications-weekly). 14 of 25 rows were
  outside the zone (Bethnal Green, Bow).
- **Planning London Datahub** dates are application and decision dates, not event dates; applications validated more
  than two years before the fetch are dropped (73 of 93 on 2026-10-04).

## Venue programmes (`venue-events`)

- **Feeds come from `feeds/events.json` at run time**, so feeds another session adds there join on the next run.
  Picked: category `ical`, `rss-atom`, `rest-api` or `whats-on-page`; verified; a feed URL; `ics`, `rss`, `atom` or
  `json`; id, name or subject with an event word; not news, press releases, consultations, meetings, warnings,
  closures, works or notices. `harvest: true` or `false` on an entry overrides the rule. First draft lesson: the word
  "press" matched "WordPress" and dropped every venue REST feed: the exclusions are whole words now.
- **Only title, dates, venue and link** are stored; no description text (venue and council sites state no open
  licence).
- **Dates**: ICS `DTSTART`/`DTEND`, RSS `ev:startdate`/`ev:enddate` (The O2), WordPress ACF date fields (Greenwich
  Theatre `acf.dates`, "24 October-24 October", year inferred as the next occurrence), else a "5 October 2026" date in
  the title or link slug (Tower Hamlets events), else the Atom `<published>` day for hosts checked by hand
  (`PUBLISHED_IS_EVENT_DATE`: Royal Docks, and only entries published at midnight; others carry an update time). The
  RSS `pubDate` and the WordPress `date` are publish dates, never event dates. Undated items are kept only from
  single-venue programmes (The Space, Wilton's: "on the programme, dates on the venue page").
- **Mixed feeds**: the Royal Docks Atom feed holds articles too; `EVENT_PATH` keeps `/whats-on/` links only (2,306
  entries, 15 upcoming events on 2026-10-04).
- **Position**: a postcode in the item (Tower Hamlets events put the address in `<category>`), else the venue of the
  feed host (`VENUES`: host, name, postcode, placed through postcodes.io), else `lat`/`lon` or `postcode` on the
  events.json entry. A new venue feed with no postcodes in its items needs a `VENUES` row, or its items are counted as
  `no_position`. Feeds with several venues and no item places (the GLA) give nothing.

## The page (`feeds/whatson.html`)

Owner feedback on the first version (2026-10-04): "looks like all roads and busses": 1,082 of 1,277 items were Street
Manager works and no venue programmes were in it. Now two views:
- **What's on** (default): venue events, TENs and licence applications, street events and TfL planned road events,
  temporary-event planning applications, markets; by day for 30 days, later (collapsed), undated programme items,
  markets and regular events. Filters: search, kind, borough.
- **Closures and works** (`#closures`): rail and river closures first, then bus diversions and stop closures (they
  affect most people), road closures grouped by street and borough (count and date span, expandable), Gazette traffic
  orders, then road works with no closure grouped by street. Filters: today, next 7 days (default), a chosen day, any
  date; kind; search.
- A table at the end: per source, the item count, how many items each view shows, the fetch date, the attribution and
  the licence. The OSM notice links to https://www.openstreetmap.org/copyright (the data-register check needs it).
- Which view an item goes to is decided on the page from `kind` (`ONKIND`, `CLKIND` in the script): a new kind must be
  added there or it falls into "road works".

## Rejected or not reached (2026-10-04)

| source | result | why |
|---|---|---|
| Tower Hamlets premises licence register (Civica eLR, alcohol-entertainment.towerhamlets.gov.uk) | not reached | TLS handshake reset through the proxy (SSL_ERROR_SYSCALL), http timed out; same as 2026-10-03 |
| Southwark, Greenwich, Newham, City of London, Lewisham licensing registers | not collected | Idox Public Access / council search forms (weekly lists need a form submission); the store-finder exception does not cover other forms. Ask the owner before submitting them |
| NRE Knowledgebase (incidents, engineering works) | not collected | Rail Data Marketplace account and product licence needed |
| Network Rail open data feeds | not collected | account needed; TfL's national-rail lines (c2c, Southeastern, Southern, Thameslink, Greater Anglia) give a link per disruption instead |
| National Rail engineering-works pages | rejected | site terms; scripted access not covered |
| Street Manager section 58 notices | not used | restrictions after resurfacing; not events |
| Parks events applications, filming notices | not found | no published list or feed found for the zone boroughs in this session |
| Internet Archive copies of the Tower Hamlets weekly page (history) | not reached | web.archive.org connections dropped by the proxy on 2026-10-04 |
| Greenwich Peninsula what's on (sitemap + per-event JSON-LD) | not harvested yet | one page request per event; needs the crawl rules of `cwplans-web-harvest` |
| GLA upcoming events RSS | harvested, 0 kept | no place in the items and no single venue |

## Extending

- A new source: a function in `SOURCES` of `fetch-works.mjs` that writes `feeds/works/<id>.json` with `write()`; record
  the licence and attribution in `meta`; register the file in `data-register.json` and the source in its `sources`
  table; update the `fetch-works` activity in `pipeline.json`; run
  `node magpie/cwplans/tools/check-data-register.mjs --write`.
- Run weekly at least (the Tower Hamlets page shows one week; TfL looks 90 days ahead; Street Manager monthly).
- The page reads only `works.json`; it groups by London date: on now, each of the next 21 days, later, long-running
  (ends more than 30 days ahead), markets. Minor Street Manager works (no road closure) are hidden by default.
