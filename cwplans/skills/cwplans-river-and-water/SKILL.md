---
name: cwplans-river-and-water
description: >-
  The river, docks, locks, water quality and boats of the cwplans Docklands zone, as dated snapshots in
  feeds/river/ made by tools/fetch-river.mjs: PLA Notices to Mariners, Canal & River Trust stoppages, Thames Barrier
  test closures, EA flood warnings, tide and river levels, tidal lock rules, swim-water results (Eden Dock, Royal
  Docks), EA sondes and the Water Quality Archive, TfL river buses, OSM moorings and houseboats, Wikidata vessels. AIS:
  no open live source; Open Waters AIS (AISHub, aisstream.io) accepted by the owner for scoping on 2026-10-04, review
  before scaling (tools/fetch-ais.mjs, the Ships layer). Licences per source, the facts-only rule for PLA and CRT, and
  the traps (time-stamped URLs, DIFF readings, the sonde fault F24). Reach for it before you refresh or add a river or
  water source, show boats, locks, notices or swim-water status on the 3D page, or answer "can I swim in the dock
  today?", "is the lock open?" or "what ships are on the river?".
---

# River, docks and water for cwplans

Policy, the fault register and the activity log are in the hub skill `docklands-data-curation`
(`cwplans/skills/docklands-data-curation/`). Append what you did to its `ACTIVITY-LOG.md`. Sources, counts and
rejected sources as a table: `cwplans/feeds/river/README.md`
(https://github.com/danbri/londat/blob/main/cwplans/feeds/river/README.md). Written 2026-10-04.

## Run

    NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-river.mjs              # all 14 sources, about 6 minutes
    NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-river.mjs crt-notices locks   # locks reads crt-notices.json: run it after
    node cwplans/tools/fetch-river.mjs --no-fetch                        # rebuild every file from data/raw/river/
    node cwplans/tools/fetch-river.mjs --list

Needs `osmium` (installed) and `pdftotext` (`apt-get install -y poppler-utils`; it was missing in a fresh container),
and the local OSM extract `data/raw/docklands/greater_london-latest.osm.pbf` (`tools/fetch-docklands.mjs osm`).
Without `NODE_USE_ENV_PROXY=1`, Node fetch ignores the proxy here. Politeness: one request at a time per host, at least
1.1 s apart, up to 5 tries with Retry-After or a doubling pause on 429, 5xx, timeouts and resets; QLever through
`tools/lib.mjs` `qlever()`. The raw cache is `data/raw/river/<source>/` (gitignored: the `.gitignore` line was lost once
when another working copy rewrote the file; append, never replace, and check `git diff` before committing it).

## Licence rules used

| class | sources | what is kept |
|---|---|---|
| open (OGL, CC0, TfL terms) | EA flood-monitoring, EA hydrology, EA Water Quality Archive, GOV.UK Thames Barrier page, TfL, Wikidata | values as published |
| ODbL (allowed, tracked) | OSM | element id, centroid, a short tag list |
| licence not stated | PLA ArcGIS layers (NtMs_Live, Visitor Moorings) | facts and links only: notice number, title, dates, reach, closure flag, issuer role, centroid and bbox. Not kept: notice text, polygons, internal comments, invoice references, staff names, contact numbers and e-mails |
| © publisher, no open licence | CRT notices, CRT and Southwark lock pages, Sea Lanes results, RoDMA certificate | facts with the URL and fetch date (crawl for scoping, owner 2026-10-03). Lock rules are paraphrased by hand into `locks-facts.json`, never copied |
| not allowed | Global Fishing Watch (CC BY-NC), MarineTraffic, VesselFinder, OpenSeaMap tiles (CC BY-SA), CRT ArcGIS layers (no commercial use) | nothing fetched or committed |

## Methods, source by source

- **PLA notices.** `https://maps.pla.co.uk/server/rest/services/Hosted/NtMs_Live/FeatureServer/0/query` with the zone
  envelope. The `name` field can hold a placeholder ("M##-25"): the notice number comes from the `link`. `kind` is a
  keyword class of the title. A polygon wider than 0.3 degrees is "portwide" (Tidal Thames fish surveys, the Medway mast
  removal, tide-table corrections): show those as a list, not on the map. The layer holds only current notices; there is
  no archive.
- **CRT notices.** `https://canalrivertrust.org.uk/api/stoppage/notices?consult=false&start=..&end=..&fields=..&geometry=point`
  returns all of England and Wales (1,076 notices for a 300-day window) as GeoJSON points. Found by watching the notices
  page's own requests in headless Chromium after "Apply filters" (the page renders no list until then; the endpoint is
  in no static bundle). Type and reason ids are mapped with the lookups embedded in the page on 2026-10-04: re-check them
  if a new id appears. Keep a notice when one of its points is in the zone.
- **Thames Barrier.** GOV.UK content API `/api/content/guidance/the-thames-barrier`: the HTML table of planned tests in
  `details.body`, times converted from London time with the BST/GMT offset of the day. The page says gates may move up
  to an hour early and tests can be cancelled. No feed of flood-defence closures exists; the live signal is the DIFF_*
  stations in `levels.json` (upstream minus downstream level).
- **Levels.** EA flood-monitoring `/id/stations/{id}` and `/id/stations/{id}/readings?since=..&_sorted&_limit=10000`.
  The DIFF_* stations publish about once a minute: the first reading in each 15-minute slot is kept (a 600 kB file became
  130 kB). Stations list measures that publish nothing (Tower Pier and Westminster each list a second "Tidal Level"):
  skip measures with no readings. Tower Pier reads wrong around low water (fault F21): clean as `docklands/sky.js` does
  before drawing a water surface from it.
- **Locks.** `feeds/river/locks-facts.json` is hand-written: windows as hours either side of HW or LW at a named place,
  hours by season or weekday, booking rules, the source URL and the date read. The tool adds the OSM centroid, the CRT
  notices whose title or waterway matches `crt_match`, and an HTTP check of each cited page.
  CRT's two pages disagree on the West India Dock Entrance Lock: "3 hours either side of HW North Woolwich, book seven
  days ahead" (Locks to the River Thames, edited 22 September 2026) and "1 hour either side of HW London Bridge (minus
  about 20 minutes)" (Boating London Docklands). Both are kept, the newer page first (class: attribute conflict).
- **Eden Dock.** The table `wq-readings-table` on https://sealanescanarywharf.co.uk/water-quality/ (date, rating, E. coli,
  intestinal enterococci in cfu/100 ml; four rows on 2026-10-04) and the `weather-item-value` before "Water Temperature"
  on the Swimming page. The page does not say when the temperature was measured: it is stamped with the fetch time.
  Position: OSM relation 18985240 (Eden Dock). canarywharf.com is behind an Imperva challenge; the Sea Lanes site is not.
- **Royal Docks.** The PDF linked as "Water Quality Testing Results" on https://royaldockswaterways.com/impact-responsibility/documents/
  (Royal Docks Waterways, formerly londonsroyaldocks.com, which now redirects). `pdftotext -layout` for the per-sample
  values; `-raw` for the cyanobacteria rows, whose layout splits the numbers across lines. The two numbers per taxon
  are kept as printed (`colonies_ml`, `result_as_printed`): the result is often colonies x size class (48 x 50 = 2400)
  but not always (Oscillatoria 50 and 50), so it is not called cells/ml. The sample pages say "Royal George V Dock";
  the overview and OSM say King George V Dock: mapped by `DOCK_ALIAS`, the written form kept. Positions are the west or
  east fifth of the OSM dock polygon: approximate, and labelled so.
- **EA sondes.** Hydrology API, stations CADOG2 (Cadogan Pier), BARIERA (Thames Barrier Gardens Pier), ERITH1 (Erith),
  every measure from two days back. No sonde lies in the zone box. BARIERA's ammonium (about 210 mg/L), pH (5.25) and
  turbidity (-93.6 NTU) on 2026-10-04 are impossible for the estuary: flagged in `values.suspect` by the `SUSPECT` rules
  (fault F24), never changed.
- **EA Water Quality Archive.** `sampling-point?latitude&longitude&radius(km)&limit<=250&skip` needs
  `Accept: application/ld+json` (plain JSON gets 404) and refuses limit over 250. Three radius searches cover the zone;
  points are BNG, converted with a Helmert transform (about 5 m). Observations come oldest first: read `totalItems`, then
  the last 60 with `skip`.
- **River buses.** TfL `Line/Mode/river-bus` (rb1, rb4, rb6, woolwich-ferry), `Route/Sequence/{dir}` (longest
  sequence, first line string), `Timetable/{first zone pier}?direction=` (departures plus minutes to later piers per
  interval set; without `direction` it returns a disambiguation list), and `Line/{ids}/Arrivals` (one request for all
  lines). TfL gives no positions; place a boat by its predicted arrival and the route line. Planned river-bus closures
  are in `feeds/works/tfl-lines.json`.
- **OSM.** `osmium extract -b` the zone envelope, `tags-filter` (moorings, marinas, slipways, piers, docks, lock gates,
  locks, ferry terminals, houseboats, ships, wrecks, movable bridges, seamarks), `export -f geojsonseq`. osmium exports
  some closed ways twice: dedupe by type/id (785 rows became 632). Houseboat names are boat names, not people.
- **Wikidata vessels.** One QLever query: P31 subclass of watercraft (Q1229765) with P625 in the envelope. P625 can be a
  former berth: say so where shown.

## AIS: why there is no live vessel layer

Open Waters AIS (measured 2026-10-04, section below) re-serves good Thames coverage with CORS and no key, but every
vessel event in the zone came from AISHub or aisstream.io, which the licence rule does not keep: so still no open,
licensed live AIS for vessels on the Thames. aisstream.io needs a key (GitHub sign-in), forbids
browser connections and states no data licence; AISHub needs a contributed receiver; Global Fishing Watch is CC BY-NC;
MarineTraffic and VesselFinder are proprietary. If the owner supplies an aisstream key and accepts its terms, the route
is a small server (or a scheduled fetch) that subscribes with the zone bounding box and writes positions as facts; ship
names and MMSI of commercial vessels are public broadcasts, but small private craft can identify their owners: treat
those like personal data under the cwplans exception and do not show them outside scoping.

## Priority list: AIS sources named by the owner (2026-10-04)

The owner asked for these on the priority list. The notes are the owner's summary plus how each fits this project;
verify the terms and the coverage at the source before any fetch, and record the result here.

1. **Open Waters AIS** (https://openwaters.io/ais/). First to check. Real-time stream (WebSocket, SSE, NMEA) and
   GeoJSON snapshots for a bounding box; code MIT; data re-served under each source's own terms, with the source named
   on every event. To check: (a) coverage of the zone bounding box (the Thames needs UK receivers, so probably the
   volunteer network or AISHub/aisstream, not the Norwegian or Finnish sources); (b) the terms page and the free-tier
   rate and area limits; (c) whether the per-event source field lets us keep only events whose own terms are open.
   Licence fit: volunteer receptions CC0 (allowed); the volunteer aggregate ODbL (share-alike: OSM is the only
   share-alike source allowed without the owner's agreement, so ask first, as for adsb.lol); events from AISHub or
   aisstream (no formal open terms: not kept). Small private craft can identify their owners: treat as personal data
   under the cwplans exception, scoping only.
   **Result (2026-10-04):** coverage yes, keepable no. See "AIS: Open Waters" below.
2. **Kystverket / BarentsWatch** (Norwegian Coastal Administration). NLOD 2.0, open, attribution, no registration for
   the open tier; raw TCP stream, APIs, history in Kystdatahuset. Licence fit: allowed. Coverage: Norwegian waters only,
   so no Thames positions. Use: a test stream for the AIS pipeline (decode, filter by box, write facts), and the
   Norwegian legs of ships that also call at London (match by MMSI), if that is wanted.
3. **US Marine Cadastre / NOAA** (https://marinecadastre.gov/ais/). US government work, public domain in the US;
   historical bulk files (GeoParquet) and AccessAIS extracts. Licence fit: allowed. Coverage: US waters only. Use: a
   reference for file formats, vessel-type codes and track cleaning methods; no zone data.
4. **Global Fishing Watch APIs**. Processed AIS products (fishing effort, presence, vessel identity); free for
   non-commercial use (CC BY-NC style), key required. Licence fit: non-commercial is a restricted licence, which the
   cwplans licence limit excludes; needs the owner's decision before any use. Coverage: global, but aimed at fishing.

## AIS: Open Waters (measured 2026-10-04)

    NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-ais.mjs                # snapshot + stations + 10 min listen
    NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-ais.mjs --listen=0     # snapshot only
    node cwplans/tools/fetch-ais.mjs --no-fetch                          # rebuild ais.json from the newest raw run

Out: `feeds/river/ais.json`. Raw runs: `data/raw/ais/<stamp>/` (gitignored: they hold AISHub and aisstream events).

**Terms read 2026-10-04** (https://openwaters.io/ais/, https://openwaters.io/api/ais/, the aiscast README,
`docs/policy.md`, `docs/limits.md`, `docs/contributor-agreement.md` at https://github.com/openwatersio/aiscast):
- robots.txt: `User-agent: * Allow: /` with "Content-Signal: search=yes,ai-input=yes,ai-train=yes".
- "Licensing is per source, and the aggregate is not relicensed: each event is re-served under the terms of the source it
  came from." Every `/v1` event carries `source`, `license` and `attribution`. Values seen: `aishub-terms`,
  `aisstream-io-terms`; documented: CC0 for volunteer receptions, NLOD 2.0 (Kystverket, BarentsWatch), CC BY 4.0
  (Digitraffic). Credit line for all: "Open Waters AIS (https://openwaters.io/ais/)".
- Volunteer receivers: "Receptions are dedicated to the public domain under the contributor agreement; no attribution
  required. The aggregate database is published under ODbL." In practice: one event (one reception) is CC0 and can be
  kept; a database built from many volunteer receptions as Open Waters publishes it (its archive, or a bulk copy) is the
  ODbL aggregate. Our `ais.json` keeps single CC0 events we received; it does not copy the Open Waters aggregate.
- AISHub: the site says AISHub "confirmed in writing that there are no restrictions on use, including commercial use and
  redistribution. Credit 'AISHub'"; `policy.md` adds "Revocable at will" and dates the confirmation 2026-08-22. That is
  Open Waters' report of a private letter, not a published AISHub licence: not kept without the owner's agreement.
- aisstream.io: "no published terms", "Best effort, frequently offline": not kept.
- Service tiers: "free for personal use"; anonymous (no key): 2 streams per address, 20 messages a second, 100 square
  degrees, HTTP 120 requests a minute; personal token free (Ed25519 key pair, no e-mail); commercial use of the hosted
  service is a paid tier ("permission to use this service commercially", `policy.md`). Scoping is not commercial use; a
  product would need the commercial tier or our own receiver.
- Endpoints: `GET /v1/vessels?bbox=minLat,minLon,maxLat,maxLon` (GeoJSON, vessels heard in the last 30 min plus
  stationary ones up to 7 days, max 500 old ones), `GET /v1/vessels/{mmsi}`, `/track` (48 h anonymous), `GET /v1/stations`,
  SSE and WebSocket `/v1/stream` (`snapshot=1` replays the last state), `/v1/nmea` (contributor tier), vector tiles, an
  MCP server. CORS: `access-control-allow-origin: *` on `/v1/vessels`: a page can call it with no key.
- Privacy: opt-out for small craft tied to a person; volunteer stations shown as a keyed hash, never an address.

**Coverage, zone envelope 51.474,-0.095 to 51.528,0.085:**

| test | result |
|---|---|
| snapshot 11:22 UTC | 108 vessels: aishub 97, aisstream 8, volunteer station 3 (all three are virtual aids to navigation at the Thames Barrier) |
| curl SSE listen 11:23 to 11:38 (15 min) | 1,166 events, 56 vessels; aishub 1,073, aisstream 93, CC0 0; PositionReport 1,096, ShipStaticData 63, class B 7 |
| tool run 11:38 to 11:49 (10 min) | snapshot 107 (kept 3 AtoN); stream 813 events (633 live, 180 replayed), 53 vessels, kept 0; all `synthesized: true` (rebuilt from JSON, not a VHF reception) |
| latency (receive minus event time, live events) | p50 69 s, p90 79 s, max 93 s: AISHub is "about a minute behind" |
| position precision | AIS fix to about 0.2 m resolution; PositionAccuracy flag high (under 10 m) on 521, low on 235 events |
| stations whose footprint touches the zone | aishub, aisstream, and one volunteer station near "Saint Peters, United Kingdom" (Thanet, Kent; 49 vessels in 30 min): it hears the Barrier AtoNs, no vessels in the zone |
| ground truth | HANSEATIC SPIRIT (MMSI 215973000, ITU type 69 passenger, nav status 5 moored) at 51.50696,-0.08212, alongside HMS Belfast, seen 11:20 to 11:26 UTC: shown, source aishub (owner's report and the coordinator's snapshot agree) |

**Review before scaling (owner decision, 2026-10-04).** Owner: "Accept AISHub (and perhaps aisstream) events for
scoping. Sounds fine. Flag it somewhere for review as we scale. Add to live by default now." So `tools/fetch-ais.mjs` and
the 3D page keep AISHub and aisstream.io events (licence class `scoping-accepted-2026-10-04`). Review before scaling or any
commercial use: the AISHub permission is a private letter reported by Open Waters ("revocable at will"); aisstream.io has
no published terms; the Open Waters hosted service is "free for personal use", and commercial use needs its paid tier or
a receiver of our own (CC0). Flags: `review` on `feeds/river/ais.json` (file and items) and on the sources
`aishub-via-openwaters` and `aisstream-via-openwaters` in `data-register.json` (DATA-REGISTER.md, "Marked for review").
Small private craft are still never listed.

**Licence filter (rule used until the owner's decision of 2026-10-04):** keep an event when its `license` is CC0-1.0, NLOD-2.0 or CC-BY-4.0; drop
`aishub-terms`, `aisstream-io-terms` and anything unknown, counted by class. Snapshot features have no `license`: classed
by the source of the vessel's last message. Fields of a kept vessel come only from kept events or kept features.
Kept today: 3 items (Thames Barrier, Barrier Gardens and Silvertown virtual AtoNs, CC0), 0 vessels.
**What the owner would gain by agreeing to AISHub + aisstream (counts only, from the first tool run; now kept):** 78 non-private vessels
(20 passenger, 16 tug, 14 high-speed craft (the Uber Boat Thames Clippers), 8 special craft, 4 tanker, 3
fishing/towing/dredging, 7 other, 6 type unknown) and 27 private craft that would still be counted only.

**Small private craft rule:** ITU type 36 or 37, class B without a commercial type, or class and type not heard: counted
in `counts.private_not_listed`, never listed. In the zone many are yachts in St Katharine Docks and South Dock Marina.

**The open route:** a receiver of our own fed to Open Waters (AIS-catcher with a free personal token over MQTT, or UDP to
udp.ais.openwaters.io:10110) makes its receptions CC0 events with source `station:<our key>` that this tool keeps; 1,000
messages a day gives the contributor tier (any area, raw NMEA). A dongle and a VHF antenna with a river view near the
zone would do it. The token is a secret: keep it in the environment settings, never in the repo or the chat.

**Page layer:** built after the owner's decision, on by default (`docklands/ships-layer.js`; the 3D-page skill, "Ships (AIS)"). Design as first proposed: call `/v1/vessels` only after a
tap (CORS, no key), filter by `source`/`license` in the page, markers with a heading arrow, card with name, type, speed,
destination, time and source, and the per-source attribution in Credits.

## AIS: the aiscatcher.org community network (checked 2026-10-04, owner's lead)

Owner's lead: "There is at least one active station explicitly named 'M7AZV River Thames AIS'. The whole network is
free/open-source with a live map; no paywall on the data the stations share." Free to view is not an open licence.

- **robots.txt** (https://www.aiscatcher.org/robots.txt, read 2026-10-04 11:54 UTC): `User-agent: *` disallows `/api/`,
  `/hub/`, `/hub_station_mmsi/`, `/mvt/`, `/mvt2/`, `/tiles/`, `/ship/ais/`, `/search/`, `/download` and more;
  `User-agent: ClaudeBot`, `GPTBot`, `CCBot`, `Google-Extended` and other AI agents: `Disallow: /`. So no page, map
  tile or API of aiscatcher.org was fetched by this project (only robots.txt). Station facts below come from a web
  search result for the station page, not from the page.
- **Station:** "M7AZV River Thames AIS", aiscatcher.org station id 1370
  (https://www.aiscatcher.org/stations/details/1370), London; position as published to 2 decimals 51.47, -0.13
  (about 4 km west of the model box; HMS Belfast about 5 km, the Thames Barrier about 12 km); maximum reception distance
  32.1 nm. So it very probably hears the zone. Uptime and message counts: not read (robots). M7AZV is an amateur radio
  call sign and names a person: record only the call sign and station name as the station publishes them.
- **Terms:** the AIS-catcher software is GPL v3 (README: "Licensed under GNU General Public License v3.0"); that covers
  code, not data. The site's About page, in the search result: "What your antenna picks up is yours — no license, no
  terms of use." No data licence for the community hub, map or API was found in the README, the docs
  (https://jvde-github.github.io/AIS-catcher-docs/community/, "© 2021-2026 ... All rights reserved") or the search
  results. Rights stay with each station operator; nothing grants reuse to us. No public API is documented; `/api/` is
  disallowed. Class: no licence stated + robots disallow: **not used**.
- **Open Waters:** no station named M7AZV or in London in `/v1/stations` (39 stations, 2026-10-04; UK volunteer
  stations only near Saint Peters (Kent), Southend-on-Sea and Portland). So M7AZV does not feed Open Waters now.
- **The open route:** AIS-catcher can send to several places at once. If the operator adds the Open Waters output
  (`-Q wssmqtt://x:<token>@ais.openwaters.io:443/v1/stream MSGFORMAT NMEA`, or UDP `-u udp.ais.openwaters.io 10110`),
  the station's receptions become CC0 volunteer events and `tools/fetch-ais.mjs` keeps them with no change. Or the
  operator states a licence (CC0 or CC BY) for the station's data. Either needs a request to the operator through the
  aiscatcher.org station contact or the AIS-catcher community; the owner decides whether to ask. Test when it happens:
  HANSEATIC SPIRIT (MMSI 215973000) alongside HMS Belfast, source `station:` or `udp:` in `ais.json`.

## Tower Bridge lift times: not fetched (terms, 2026-10-04)

https://www.towerbridge.org.uk/lift-times redirects to https://www.towerbridge.org.uk/bridge-lifts (date, time,
vessel name, vessel type, direction; about 6 to 10 days ahead, past lifts removed). robots.txt answers 404 (no rules).
The site's Legal statement (https://www.towerbridge.org.uk/legal/legal-statement, City Bridge Foundation) forbids it:
clause 2.5 "You shall not conduct, facilitate, authorise or permit any text or data mining or web scraping" (any robot,
bot, spider or scraper "to access, obtain, copy, monitor or republish any portion of the site or any data"), and clause
5.3 forbids copying, publishing or making derivative works from data on the site. That is an explicit contract term,
stronger than "no licence stated", so the crawl-for-scoping rule (owner, 2026-10-03) was not applied on our own
decision: no source in `tools/fetch-river.mjs`, no `tower-bridge-lifts.json`, no history file. The owner decides. If the
owner says yes: one page a day, facts only (date, time, direction, vessel name, vessel type, fetch time), appended to a
dated history file, vessel names matched to `wikidata-vessels.json` and OSM ships by name only. Other routes checked:
none open (the X account is excluded; PLA notices do not list lifts). The 3D page's Tower Bridge card links to the page.

## On the 3D page and the atlas (built 2026-10-04)

3D page: https://danbri.github.io/londat/cwplans/docklands/ (Menu > Layers > River; all off by
default). Atlas: https://danbri.github.io/londat/cwplans/atlas/#river (lists with dates and sources)
and https://danbri.github.io/londat/cwplans/atlas/#map (layer "River snapshots"). The atlas reads
`feeds/river/*.json` at run time; `atlas/data/atlas.json` and `tools/build-atlas.mjs` are not involved. Page side,
code and tests: skill `docklands-3d-page`, "River layer".

- River buses: no positions exist, so a boat is placed by the timetable: departure + the minutes to each later pier
  (`minutes_to_later_zone_piers_by_interval`), linear between two piers along the Thames centreline of
  `docklands/data/river.json` (straight across when the two piers are within 6 centreline points: RB4). Schedule names
  are matched to the weekday ("Monday to Friday", "Saturday and Sunday", Woolwich Ferry names); bank holidays and
  planned closures are not applied. Live correction only after a tap: one request to
  `https://api.tfl.gov.uk/Line/rb1,rb4,rb6,woolwich-ferry/Arrivals` (CORS, no key); per vessel the soonest prediction;
  the boat sits between the stop before that pier and the pier, at 1 - seconds left / timetable minutes of that leg.
  Live positions are used for 5 minutes and only while the page clock is within 15 minutes of now. On 4 October 2026
  (12:46 BST) 100 predictions gave 5 boats in the indexed piers; piers west of Bankside are not in the snapshot.
- Locks: high and low water are found in `levels.json` (local extreme over 3 h either side, 2.5 h of readings before
  and 1.5 h after, a parabola through three readings for the time). "London Bridge" uses Tower Pier, cleaned against
  Charlton as `docklands/sky.js` does (F21); "North Woolwich" uses Silvertown. Outside the 48 hours held, the time is
  stepped by whole 12 h 25.2 min cycles from the nearest measured extreme and labelled an estimate (spring-neap drift:
  up to about an hour within a week); after 7 days the badge is grey, "tide not known". A CRT notice of type
  "Navigation Closure" in force makes the badge red (Limehouse, 14 to 16 October 2026); a "Navigation Restriction" is
  listed in the card only.
- PLA notices: only the bbox is kept (no polygons: facts only). A box under 700 m diagonal is drawn as its outline; a
  long reach (the barge-driving notice covers Greenwich to Lambeth) as one line along the river at 0.4 of the half-width
  from the centreline plus a bar across each end. First try (an outline along both banks at 0.8 of the distance to the
  bank) put a wide violet band across the foreground of the Rotherhithe photo view.
- Thames Barrier: the 11 October 2026 test is listed by GOV.UK as 08:05 to 18:05 (a full-tide test, not the usual
  2.5 h). The banner shows on the clock's day and otherwise names the next test.
- The Royal Docks samples lie east of the model box (x 2,613 to 6,160 m against an edge at 2,350 m): one marker at the
  east edge carries all six. Wikidata vessel Q30765817 has no English label: shown as "Wikidata Q30765817".

## Traps, in short

- A URL with the run's date or time in it is cached under a stable key (`cached(..., key)`), or `--no-fetch` cannot
  find it.
- `locks` reads `crt-notices.json`: run `crt-notices` first.
- The EA bathing-water API answers 403 from this container (Azure gateway) for every User-Agent tried.
- pla.co.uk and the PLA tide pages: Cloudflare challenge; use maps.pla.co.uk (ArcGIS), which answers.
- The Internet Archive CDX API timed out from the container on 2026-10-04.
