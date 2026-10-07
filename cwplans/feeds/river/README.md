# River, docks, locks, water quality and boats

Snapshots for the Docklands zone made by `tools/fetch-river.mjs` on 2026-10-04 (UTC times in each file's `meta.fetched`).
Zone: the 3D model box (WGS84 -0.095, 51.474 to 0.015, 51.522), the Royal Docks margin (0.015 to 0.085, 51.495 to 51.522)
and a strip north to Bow Locks (-0.025 to 0.01, 51.522 to 51.528). Method, licences and lessons: skill
`cwplans-river-and-water` (`cwplans/skills/cwplans-river-and-water/SKILL.md`).

    NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-river.mjs            # all sources (about 6 minutes, polite)
    NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-river.mjs levels     # one source
    node cwplans/tools/fetch-river.mjs --no-fetch                      # rebuild from data/raw/river/
    node cwplans/tools/fetch-river.mjs --list

Every file: `{meta: {source, url, fetched, licence, attribution, method, counts, zone}, items: [{id, kind, time or validity,
position {lat, lon, precision, zone}, values, url}]}`. Files are overwritten on each run; git history keeps the dated
versions (before 2026-10-07 in danbri/glitchcan-minigam:
https://github.com/danbri/glitchcan-minigam/commits/7be94dc/magpie/cwplans/feeds/river). "Live" below means the source
changes within minutes or hours, so the snapshot is a sample of that moment.

## Files

| file | source | licence | items (2026-10-04) | live? | what it tells us |
|---|---|---|---|---|---|
| `pla-notices.json` | PLA Notices to Mariners, ArcGIS layer NtMs_Live | not stated: facts and links only | 13 notices (5 works, 2 exclusion zones, 2 events, 2 Thames Barrier, 1 survey, 1 publication; 1 river closure: A13 bridge works on the River Lee; 3 port-wide) | changes as notices are issued | the harbourmaster's current notices that touch the zone, with dates, reach, a centroid and bbox, and the link to the notice |
| `crt-notices.json` | Canal & River Trust notices (the JSON endpoint behind canalrivertrust.org.uk/notices) | © CRT, facts and links only | 18 of 1,076 national notices (window 60 days back to 240 ahead): 7 closures, 4 restrictions, 7 advice | daily | lock and towpath closures at Limehouse Lock, the Regent's Canal locks, South Dock and West India Dock; a run of "Low Water Levels" closures since August 2026 |
| `thames-barrier.json` | GOV.UK guidance page, content API | OGL v3.0 | 8 planned test closures (9 March to 11 October 2026; 11 October 08:05 to 18:05 is a long one); totals: 221 flood-defence closures since 1982 (119 tidal, 102 tidal/fluvial), as at 17 November 2025 | no (planned) | when the barrier closes the river for tests |
| `ea-flood-warnings.json` | EA flood-monitoring API | OGL v3.0 | 0 (none in force within 15 km) | yes | flood alerts and warnings |
| `levels.json` | EA flood-monitoring API | OGL v3.0 | 17 series: 4 tide gauges (Tower Pier, Silvertown, Charlton, Westminster), 6 barrier level differences, Lee at Lea Bridge (level and flow) and Low Hall, Ravensbourne at Catford Hill and Beckenham Park, Quaggy at Manor House Gardens; 48 h of 15-minute readings | yes | tide on the river now; the barrier's upstream/downstream difference; the feeder rivers. No gauge on tidal Bow Creek or Deptford Creek |
| `locks.json` (from `locks-facts.json`) | CRT and Southwark Council pages, read by hand; OSM positions; CRT notices | facts from pages (all rights reserved) + ODbL | 9 locks: Limehouse, West India Dock Entrance, Bow Locks, South Dock (Greenland), Commercial Road 12, Salmon Lane 11, Blackwall Basin entrance (no rules found), St Katharine (not collected), King George V (not collected) | rules: no; notices: daily | when each tidal lock can work: Limehouse closed about 2 h either side of LW London Bridge, 07:00-19:00 summer, 08:00-16:00 winter; West India entrance 3 h either side of HW North Woolwich, 08:30-15:30 Mon-Fri; Bow 2 h either side of HW London Bridge, 09:30-16:30 Mon-Fri; South Dock HW-2 h to HW+1.5 h for 2 m draft, cill 2.85 m above chart datum |
| `eden-dock.json` | Sea Lanes Canary Wharf water-quality and swimming pages | operator's figures, facts | 4 samples (11 May, 23 June, 22 July, 10 August 2026; all "Excellent"; E. coli 10 to 56, enterococci 3 to 16 cfu/100 ml) and the water temperature shown at fetch (16.6 °C) | samples fortnightly per operator; temperature live | swim-water status for Eden Dock (Middle Dock) |
| `royal-docks.json` | Royal Docks Waterways (RoDMA) water quality certificate TSBN9471796 (PDF) | operator's figures, facts | 6 samples of 9 September 2026: Royal Victoria, Royal Albert and King George V docks, west and east; E. coli 1 to 31, enterococci 0 to 6 per 100 ml, all "Pass Excellent"; water 18.8 to 19.5 °C; pH 8.95 to 9.12; cyanobacteria "relatively low" | monthly per operator | swim-water status for the Royal Docks |
| `ea-sondes.json` | EA Hydrology API, continuous sondes | OGL v3.0 | 20 series at Cadogan Pier, Thames Barrier Gardens Pier and Erith (temperature 18.5 to 18.8 °C, DO 76 to 86 %, salinity 3.9 to 14 PSU) | yes (15 min, delayed, Unchecked) | river temperature and oxygen up- and downstream of the zone. 3 BARIERA values flagged suspect (fault F24) |
| `ea-wims.json` | EA Water Quality Archive (2025 API) | OGL v3.0 | 41 points in the zone: 21 water sampling points (13 open overall), 13 discharge points, 7 other | samples, monthly at best | Thames at London Bridge sampled to 2026-08-06; Barrier Gardens Pier to 2026-09-04; Thames at West India Dock closed since 2008 |
| `river-bus.json` | TfL Unified API | TfL open data terms | 12 piers, 8 route lines, 18 timetables (RB1, RB4, RB6, Woolwich Ferry), 48 arrival predictions at fetch | arrivals yes | scheduled and predicted boats at Canary Wharf, Masthouse Terrace, Greenland, Rotherhithe, Greenwich, North Greenwich, Royal Wharf, Tower and London Bridge City piers |
| `osm-river.json` | OpenStreetMap, local extract (data as of 2026-10-01) | ODbL 1.0 | 632: 204 piers, 148 moorings, 71 lock gates and locks, 51 houseboats, 43 docks, 33 movable bridges, 20 slipways, 18 wrecks, 14 ships, 14 ferry terminals, 9 marinas, 7 named seamarks; 246 unnamed seamarks counted | no | where boats lie and how the water is divided |
| `pla-moorings.json` | PLA Visitor Moorings layer | not stated: facts only | 8 visitor moorings (Tower Bridge Moorings, St Katharine Docks, Butlers Wharf, Hermitage Community Moorings, Limehouse Marina, South Dock Marina, West India Docks, Greenwich Yacht Club) | no | who runs each visitor mooring, with the link |
| `wikidata-vessels.json` | Wikidata via QLever | CC0 | 22 named vessels: Cutty Sark, HMS Belfast, Golden Hinde, SS Robin, Light vessels 93 and 95, Massey Shaw, Knocker White, Royal Iris, Sunborn yacht hotel, St Peter's floating church, two Thames Clippers and others | no | the named boats that have a public record and a place |
| `ais.json` (`tools/fetch-ais.mjs`) | Open Waters AIS, anonymous tier: snapshot, stations, 10-minute SSE listen | per event: CC0 1.0, NLOD 2.0, CC BY 4.0; AISHub and aisstream.io kept for scoping (owner 2026-10-04, marked for review) | 82 items at 2026-10-04 12:05 UTC (79 vessels: 17 tugs, 16 passenger incl. HANSEATIC SPIRIT moored at HMS Belfast, 14 high-speed craft, 7 special craft, 4 tankers, 3 fishing/towing/dredging, 10 other, 8 type unknown; 3 CC0 aids to navigation); 21 sailing or pleasure craft counted only; counts by source, licence, message type and latency in `meta` | yes (latency about 70 s) | ships on the river now; the 3D page also fetches it live. See the river skill, "AIS: Open Waters" |

## Review before scaling

Owner: "Accept AISHub (and perhaps aisstream) events for
scoping. Sounds fine. Flag it somewhere for review as we scale. Add to live by default now." So `tools/fetch-ais.mjs` and
the 3D page keep AISHub and aisstream.io events (licence class `scoping-accepted-2026-10-04`). Review before scaling or any
commercial use: the AISHub permission is a private letter reported by Open Waters ("revocable at will"); aisstream.io has
no published terms; the Open Waters hosted service is "free for personal use", and commercial use needs its paid tier or
a receiver of our own (CC0). Flags: `review` on `feeds/river/ais.json` (file and items) and on the sources
`aishub-via-openwaters` and `aisstream-via-openwaters` in `data-register.json` (DATA-REGISTER.md, "Marked for review").
Small private craft are still never listed.

## What is live and what is not

- Can update live on a page (CORS, no key): EA flood-monitoring and hydrology, TfL arrivals and timetables. The page can
  fetch them itself; the snapshots here are for offline use and history.
- Server-side only (no CORS): PLA ArcGIS map server, CRT notices endpoint, GOV.UK content API, the operators' pages.
- Live vessel positions: Open Waters AIS (CORS, no key); in the zone they come from AISHub or aisstream.io, kept for
  scoping by the owner's decision of 2026-10-04 (see "Review before scaling").

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
   **Result (2026-10-04):** coverage yes (107 vessels in the snapshot, 53 in a 10-minute listen; HANSEATIC SPIRIT seen
   moored at HMS Belfast), keepable no: aishub 95 and aisstream 9 of 107; CC0 volunteer events only for 3 aids to
   navigation. Owner decision: accept AISHub events (78 non-private vessels gained), or feed our own receiver (CC0).
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

## Rejected or not reached, and why

- **aiscatcher.org community network** (owner's lead, station "M7AZV River Thames AIS", id 1370, about 51.47,-0.13,
  range up to 32.1 nm): no data licence ("What your antenna picks up is yours — no license, no terms of use"), and
  robots.txt disallows `/api/`, `/hub/`, tiles and search for all agents and the whole site for ClaudeBot and other AI
  agents. Not fetched. The station does not feed Open Waters (2026-10-04). Open route: the operator adds the Open
  Waters output (CC0) or states a licence. River skill, "AIS: the aiscatcher.org community network".
- **AIS, live vessel positions.** aisstream.io: free key through a GitHub sign-in; its documentation forbids direct
  browser connections (a server must proxy) and no data licence or terms page exists (`/terms` and `/terms-of-service`
  answer 404); not used without the owner's key and a decision on the licence. AISHub: an account only for those who
  share a receiver. Global Fishing Watch: CC BY-NC, not allowed. MarineTraffic and VesselFinder: proprietary; not
  fetched (VesselFinder robots.txt disallows vessel pages). PLA AIS track density tiles (January 2023, Tower Hamlets) are
  in `feeds/feeds.json`; no licence stated. So: no open live AIS here. TfL arrival predictions give the river buses
  (the vessel_id per prediction), and timetables give scheduled boats.
- **PLA ship movements and tide pages on pla.co.uk**: Cloudflare challenge to scripts (HTTP 403); not bypassed. The
  Internet Archive CDX API timed out from the container on 2026-10-04.
- **EA bathing water API** (environment.data.gov.uk/bwq and /doc/bathing-water): HTTP 403 from an Azure gateway for
  every User-Agent tried. Neither Eden Dock nor the Royal Docks is a designated bathing water; the operators' tests are
  their own (EU thresholds quoted).
- **Storm overflows (Thames Water EDM)**: CC BY 4.0, already fetched by `tools/fetch-live.mjs` into
  `feeds/live/overflows.json`; not repeated here.
- **PLA Berths Owners layer**: the query returned no features and no fields (token or empty view); not used.
- **CRT ArcGIS moorings, locks and facilities layers**: CRT data licence forbids commercial use; held for the owner's
  decision (`registry/sources/pla/README.md`). Lock and mooring positions here come from OSM instead.
- **Social media, boat-licence lists, occupants of boats**: not collected. No open source names the people on boats.

## Gaps

- No live state for any lock (open, closed, level). `locks.json` gives the rules; a page can compute "window open now"
  from the tide gauges plus a high-water time. High-water predictions (ADMIRALTY API) need a free key.
- No gauge or sonde inside the docks; the docks' water level (impounded, about 4.23 m OD per `docklands/README.md`) is
  not published as data.
- Thames21 and Tideway water-quality monitoring: no open data found beyond litter surveys (in `feeds/feeds.json`).
- Deptford Creek: tidal, no lock; only the Ravensbourne gauges upstream.
- St Katharine Docks and Royal Docks lock rules not yet read.
