# What people built from TfL's axonometric station diagrams

Survey made 2026-10-05 for the 3D station modelling in cwplans. The baseline is the set of axonometric (3D-style)
drawings of London Underground stations that TfL released under FOI in July 2015 (124 stations, A to W, raster, not to
scale, partly redacted) and the later FOI updates. We hold the Canada Water and Canary Wharf sheets in
[danbri/londat third_party/tfl/am3d](https://github.com/danbri/londat/tree/main/third_party/tfl/am3d) (use approved by the
owner, 2026-10-05).

Full records: [axonometric-uses.json](axonometric-uses.json) (54 entries: id, URL, author, date, kind, stations and
zone flags, format, downloadable, licence as stated, licence class, relation to the sheets, quality, usefulness, how the
evidence was read). Links and facts only: no third-party model or image is copied into this repository, except the
TfL sheets above (`third_party/tfl/am3d/`, approved by the owner).

Counts by kind: visualisation 16, 3D model 10, FOI 8, OSM 7, paper 4, app 3, game build 3, dataset 3. By licence class: restricted 23, none 12, open 11, unclear 8. By relation to the sheets: independent 33, source 7, used as reference 7, derived 4, unclear (project uses DEFRA LIDAR for buildings; interior reference not stated in the snippet) 1, unclear 1, unclear (station maps are Waymap's own) 1.

Zone column: CWa = Canada Water, CWh = Canary Wharf. Licence class: open, restricted (all rights reserved, paid,
non-commercial or FOI re-use only), unclear (not read), none (nothing stated); SA = share-alike or copyleft.

## Ranked table

| # | project | kind | date | zone | licence | relation | usefulness |
|---|---|---|---|---|---|---|---|
| 1 | [Axonometric diagrams - London Underground Stations (FOI request, 2015 release of 124 sheets)](https://www.whatdotheyknow.com/request/axonometric_diagrams_london_unde) | FOI | 2015-07 | CWa, CWh, Bermondsey, London Bridge, North Greenwich, Southwark, Tower Hill, Whitechapel | restricted | source | high: The baseline itself. The owner approved use of the TfL sheets (2026-10-05); Canada Water and Canary Wharf are held in londat/third_party/tfl/am3d/. |
| 2 | [Maps of public corridors on large stations: "3d jubilee stations Redacted.pdf" (WhatDoTheyKnow response 674923)](https://www.whatdotheyknow.com/request/maps_of_public_corridors_on_larg) | FOI | archived 2025-09-24 | CWa, CWh, Bermondsey, Canning Town, London Bridge, North Greenwich, Southwark, Stratford, West Ham | restricted | source | high: Already catalogued in feeds/underground/tunnels.json (2026-10-03); a scripted route (Internet Archive) to the Jubilee line sheets for the other JLE stations in the zone. |
| 3 | [Ian Visits: "3D maps of every Underground station" (five pages A-B, C-G, H-M, N-S, T-W)](https://www.ianvisits.co.uk/articles/3d-maps-of-every-underground-station-cdefg-14651/) | visualisation | 2015-07-12 (republished/updated 2022) | CWa, CWh | restricted | derived | high: Our Canada Water and Canary Wharf JPEGs come from here (downloaded by the owner). |
| 4 | [OpenStreetMap indoor mapping of Canada Water station (Simple Indoor Tagging)](https://www.openstreetmap.org/#map=19/51.4980/-0.0497) | OSM | 2018 to 2026 | CWa | open (SA) | independent | high: The best open, georeferenced geometry for Canada Water. ODbL share-alike: allowed in cwplans for now and tracked in the data register. |
| 5 | [OpenStreetMap indoor and level mapping at Canary Wharf (Jubilee line station and DLR)](https://www.openstreetmap.org/#map=18/51.5036/-0.0187) | OSM | 2012 to 2026 | CWh, Heron Quays | open (SA) | independent | high: Open georeference for platforms and lifts; the ticket hall must come from the TfL sheet (approved) and our own levels. |
| 6 | [TfL FOI-0493-2223: station ground levels and platform rail levels (CSV)](https://foi.tfl.gov.uk/FOI-0493-2223/Copy%20of%20Station%20depths.csv) | dataset | 2022 | CWa, CWh, North Greenwich | restricted | independent | high: Gives the vertical truth the sheets lack; already used in data/sourced-levels.json (six values). |
| 7 | [TfL station topology data (detailed CSV and GTFS pathways)](https://api.tfl.gov.uk/stationdata/tfl-stationdata-detailed.zip) | dataset | 2026-08-03 (file date recorded 2026-10-03) | CWa, CWh, Heron Quays, North Greenwich | open | independent | high: The open graph to hang the sheet's spaces on (named levels, lifts, entrances). |
| 8 | [Axonometric drawings of every station (FOI request to TfL)](https://www.whatdotheyknow.com/request/axonometric_drawings_of_every_st) | FOI | unknown (after 2015) | - | restricted | source | medium: Second FOI thread named by the owner; a search summary says drawings exist only for section 12 stations, usually one overview per station. |
| 9 | [Updated axonometric drawings of stations (FOI request to TfL, TfL ref 3536-2223)](https://www.whatdotheyknow.com/request/updated_axonometric_drawings_of) | FOI | 2023-03-27 (request), 2023-04-24 (response, per search snippet) | CWh, Whitechapel | restricted | source | medium: Shows TfL keeps the series current. A search-engine summary says the Elizabeth line Canary Wharf sheet was refused under FOI s24 (national security) and s38 (health and safety); this is NOT verified, because the thread could not be read. |
| 10 | [TfL FOI-3336-2223: axonometric diagrams of section 12 stations updated since 2015](https://tfl.gov.uk/corporate/transparency/freedom-of-information/foi-request-detail?referenceId=FOI-3336-2223) | FOI | 2022/23 (TfL year 2223) | - | restricted | source | medium: Confirms the sheets index a set of 2D plans (cf. drawing ref J009-06 on our Canada Water sheet): a target for a more specific FOI request. |
| 11 | [Axonometric maps of stations on the Elizabeth line (FOI, TfL ref FOI-2821-2425)](https://www.whatdotheyknow.com/request/axonometric_maps_of_stations_on) | FOI | 2024-12-20 (release, per search snippet) | Whitechapel | restricted | source | medium: Whitechapel is a zone station; no Canary Wharf Elizabeth line sheet was released here. |
| 12 | [OpenStreetMap: Gloucester Road Piccadilly platforms tagged source=TfL axonometric](https://www.openstreetmap.org/changeset/178320189) | OSM | 2026-02-09 | - | open (SA) | derived | medium: Evidence that an active London indoor mapper used the sheets as a source in OSM. TfL holds copyright and OSM has no TfL consent for these drawings, so these two ways are a possible copyright problem for OSM; we only record the ids. |
| 13 | [X posts by @CLondoner92 on further axonometric FOI releases (Underground, DLR, Elizabeth line)](https://x.com/CLondoner92/status/2022659728170782819) | FOI | 2024-12 and 2026-02 (status ids) | - | none | used as reference | medium: The only hint that DLR axonometrics were released: Heron Quays, West India Quay, Canary Wharf DLR are zone stations. Follow up by an FOI search on WhatDoTheyKnow by hand. |
| 14 | [OpenStreetMap Wiki: London Underground (sources and copyright notes)](https://wiki.openstreetmap.org/wiki/London_Underground) | OSM | live page (read 2026-10-05) | - | open (SA) | independent | medium: Records the only TfL consent OSM has (route lines, not station drawings): our reason to keep the sheets out of anything ODbL. |
| 15 | [OpenStationMap (renderer of OSM station indoor, levels and 3D)](https://wiki.openstreetmap.org/wiki/OpenStationMap) | OSM | live | - | open (SA) | independent | medium: Quick visual check of the OSM indoor data at Canada Water and Canary Wharf against the sheets. |
| 16 | [Station Viewer: 3D maps of London Underground/DLR stations (WebGL, Three.js)](https://stations.aeracode.org/) | 3D model | 2012 | Shadwell, West Silvertown | restricted (SA) | independent | medium: The closest earlier web 3D-station viewer to our page (tickethall, stairs, lift materials, line colours); Shadwell and West Silvertown are zone DLR/Overground stations. NC and SA: reference only, link not copy. |
| 17 | [Station Master app: 3D maps of all 270 Tube stations](https://www.stationmasterapp.com/3dmaps.html) | app | 2013 (Zone 1) to 2014 (all Tube stations) | CWa, CWh, North Greenwich | restricted | independent | medium: Best independent 3D survey of every station incl. Canada Water and Canary Wharf; app only, all rights reserved: compare by eye, do not copy. |
| 18 | [GitHub progress-agent/underground: depth-aware London Underground in Three.js](https://github.com/progress-agent/underground) | visualisation | 2026 | - | none | independent | medium: Closest web analogue to our page's tunnel layer; no licence, so reference only. |
| 19 | [London Transport Museum: JLE station models (Canary Wharf c.1995, 2000/10191; Canada Water c.1995, 2000/19061; Canada Water street level c.1992, 2001/4930)](https://www.ltmuseum.co.uk/collections/collections-online/models/item/2000-10191) | 3D model | c.1992 to c.1995 | CWa, CWh | none | independent | medium: Independent 3D views of exactly our two stations; a visit to the Acton Depot or the museum photos can check the sheets' proportions. |
| 20 | [Applied Information Group: Canary Wharf wayfinding (axonometric mapping of the malls)](https://appliedinformation.group/projects/canary-wharf) | app | unknown | CWh | restricted | independent | medium: The estate's own axonometric style; the malls join the Jubilee, DLR and Elizabeth line stations. Already in estate.json. |
| 21 | [Crossrail Learning Legacy: Station Pedestrian Modelling Archive (Legion), e.g. Farringdon Legion modelling report](https://learninglegacy.crossrail.co.uk/documents/station-pedestrian-modelling-archive/) | paper | 2010s | - | unclear | independent | medium: A Canary Wharf (Elizabeth line) report, if in the archive, would give scaled concourse geometry and flows; check by hand. |
| 22 | [TfL FOI-1497-2425: Tottenham Court Road (Elizabeth line) axonometric, file "Tottenham Court Road 2.pdf"](https://foi.tfl.gov.uk/FOI-1497-2425/Tottenham%20Court%20Road%202.pdf) | FOI | 2024-10-01 (Last-Modified header) | - | restricted | source | low: Outside the zone, but shows that foi.tfl.gov.uk serves FOI attachments to scripts; a Canary Wharf or Canada Water update would land there. |
| 23 | [Brixton Buzz: "Gaze in awe at axonometric diagrams of Brixton and Stockwell tubes"](https://www.brixtonbuzz.com/2015/07/gaze-in-awe-at-axonometric-diagrams-of-brixton-and-stockwell-tubes/) | visualisation | 2015-07 | - | none | derived | low: Outside the zone; context. |
| 24 | [disassociated.com: "3D maps of all London Underground tube stations"](https://disassociated.com/3d-maps-of-all-london-underground-tube-stations/) | visualisation | 2022-06-29 | - | none | derived | low: Nothing built. |
| 25 | [The Architect's Newspaper: "Open data from Transport for London spurs 3D axonometric plans of the Tube"](https://www.archpaper.com/2015/08/open-data-from-transport-for-london-spurs-3d-axonometric-plans-of-the-tube-so-passengers-can-mentally-map-their-next-trip/) | visualisation | 2015-08 | - | none | used as reference | low: Context only. |
| 26 | [Architects' Journal: "TfL releases striking 3D maps of tube stations after FOI bid"](https://www.architectsjournal.co.uk/news/tfl-releases-striking-3d-maps-of-tube-stations-after-foi-bid) | visualisation | 2015-07 | - | none | used as reference | low: Context only. |
| 27 | [Time Out London: "Unlock the secrets of the tube with these 3D maps"](https://www.timeout.com/london/blog/unlock-the-secrets-of-the-tube-with-these-3d-maps-073015) | visualisation | 2015-07-30 | - | none | used as reference | low: Context only. |
| 28 | [iamcal.com: "Axonometric Tube"](https://www.iamcal.com/2015-07/axonometric-tube/) | visualisation | 2015-07-17 | - | none | used as reference | low: Nothing built. |
| 29 | [Hacker News: "3D Diagrams of London Underground Stations" (discussion)](https://news.ycombinator.com/item?id=31881625) | visualisation | 2022-06-26 | - | none | used as reference | low: A pointer list; see the separate entries. |
| 30 | [OpenStreetMap: Baker Street emergency exit placed with a note on the redacted axonometric](https://www.openstreetmap.org/node/12957095300) | OSM | 2025-06-30 (changeset 168323727, "Updates at Baker Street Station") | - | open (SA) | used as reference | low: Shows mappers read the sheets to check survey gaps, not to copy. |
| 31 | [OpenStreetMap Wiki: List of railway stations in London (indoor mapping status column)](https://wiki.openstreetmap.org/wiki/List_of_railway_stations_in_London) | OSM | live page (read 2026-10-05) | CWa, CWh, London Bridge, North Greenwich | open (SA) | independent | low: Status tracker, out of date for the zone. |
| 32 | [TurboSquid 1975930: Bank Street Canary Wharf with Jubilee Station](https://www.turbosquid.com/3d-models/bank-street-canary-wharf-with-jubilee-station-3d-model-1975930) | 3D model | unknown | CWh | restricted | independent | low: Paid, no redistribution; surface only as far as known. |
| 33 | [3D Warehouse: "Canary Wharf Jubilee Station West End"](https://3dwarehouse.sketchup.com/model/1865ca0db0f3601af42b80606c2f3752/Canary-Wharf-Jubilee-Station-West-End) | 3D model | unknown | CWh | unclear | independent | low: Surface canopy only; we have our own canopy geometry plan. |
| 34 | [3D Warehouse: "Canada Water 14 - London3Dproject"](https://3dwarehouse.sketchup.com/model/e63fc6418a7dff46c125e5c9239d492f/Canada-Water-14-London3Dproject) | 3D model | unknown | CWa | unclear | independent | low: Area massing, not the station interior. |
| 35 | [Sketchfab: generic London-style tube station models (BOXjordiHEAD "London Underground Metro Station"; omarme37 "5 underground stations and train"; Aceantt "London Tube Station Hub Environment")](https://sketchfab.com/3d-models/london-tube-station-hub-environment-a328bfb44aea431b95320e1c207c346a) | 3D model | 2020 to 2024 | - | open | independent | low: At most a CC BY prop source (tiles, benches) for a stylised interior; no station geometry. |
| 36 | [Sketchfab: artfletch photogrammetry of London Underground street furniture (Bank Tube Station Vent, Vauxhall Tube Vent, Cattle Trough Canada Water, Barbican Station Boundary Stone)](https://sketchfab.com/3d-models/cattle-trough-canada-water-8a833db75dc1431ab60b1ac1c24b834f) | 3D model | 2020 to 2023 | CWa | open | independent | low: Open (CC BY) surface props near Canada Water; not station structure. |
| 37 | [Sketchfab: "3D Scan - Rail Underground Station Switchroom" (London Underground)](https://sketchfab.com/3d-models/3d-scan-rail-underground-station-switchroom-f939a3b9e54941ab97c288ac2562f7a7) | 3D model | 2017-03-06 | - | restricted | independent | low: Non-commercial; not a public area of a zone station. |
| 38 | [Blend Swap 10069: tube station based on Monument](https://www.blendswap.com/blend/10069) | 3D model | unknown (Blender 2.6x era, about 2012-2014) | - | unclear | independent | low: Outside the zone. |
| 39 | [Cities: Skylines Workshop and Minecraft Transit Railway "The Tube" addon (London Underground trains and entrances)](https://steamcommunity.com/sharedfiles/filedetails/?id=1549929737) | game build | 2015 to 2023 | - | restricted | independent | low: No station interiors found for the zone. |
| 40 | [Bruno Imbrizi: real-time 3D map of the London Underground (three.js)](https://transitmap.net/imbrizi-london-3d/) | visualisation | 2013-08 | - | none | independent | low: Network scale, no station interiors; predates the sheets. |
| 41 | [GitHub ckanz/3d-tube-visualisation: station depths and entrance heights (Unity)](https://github.com/ckanz/3d-tube-visualisation) | visualisation | 2019-01-01 (repo created) | - | open (SA) | independent | low: Copyleft and network scale; the TfL depth CSV is a better source. |
| 42 | [Daniel Silva: London Underground Depth Diagrams](https://www.maproomblog.com/2018/07/london-underground-depth-diagrams/) | visualisation | 2018-07-12 | - | unclear | independent | low: Line profiles; we use the TfL CSV directly. |
| 43 | [Cults3D: "3D London Underground Depth Map" (printable wall art)](https://cults3d.com/en/3d-model/art/3d-london-underground-depth-map-wall-art) | 3D model | unknown (2025-2026) | - | unclear | independent | low: Same method as our tunnel layer (OSM + TfL levels); confirms the approach. |
| 44 | [Londonist: "London's hidden tunnels revealed in amazing cutaways" (Tim Dunn) and earlier 3D cutaway collections](https://londonist.com/london/transport/london-cutaways) | visualisation | various | - | none | independent | low: Style reference only. |
| 45 | [Stephen Wiltshire: drawings of Canary Wharf tube station (2002 and 2008)](https://www.stephenwiltshire.co.uk/original/drawings/canary-wharf-tube-station/1539) | visualisation | 2002, 2008 | CWh | restricted | independent | low: Art only. |
| 46 | [TfL GIS open data hub: "TfL stations" and "Underground Stations" layers](https://gis-tfl.opendata.arcgis.com/maps/5dcb79b6817b4bf89732de68a0337312) | dataset | 2026-07 (modified) | - | unclear | independent | low: Points, not geometry. |
| 47 | [Crossrail Learning Legacy: "Building a virtual version of London's Elizabeth line" (12F-001) and "Application of BIM and lessons learned"](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2017/09/12F-001-Building-a-virtual-version-of-Londons-Elizabeth-line.pdf) | paper | 2017 | CWh | restricted | independent | low: Confirms the 3D sources exist and are not public. |
| 48 | [Paper: "Calibration and validation of the Legion simulation model using empirical data" (escalator queues filmed at Canary Wharf)](https://link.springer.com/chapter/10.1007/978-3-540-47064-9_15) | paper | 2007 | CWh | restricted | independent | low: Crowd behaviour on the Canary Wharf escalator banks; no geometry. |
| 49 | [TfL and Spinview: digital twin of the London Underground (Piccadilly line first)](https://www.newcivilengineer.com/latest/tfl-to-create-digital-twin-of-london-underground-to-monitor-track-and-tunnels-11-01-2022/) | paper | 2022-01 | - | restricted | independent | low: Not public; not the zone. |
| 50 | [Candy Chan: Project Subway NYC (axonometric station drawings)](https://transitmap.net/ny-station-diagrams-chan/) | visualisation | 2015 | - | restricted | independent | low: Comparison: the same drawing convention made from survey, not from operator drawings. |
| 51 | [Official 3D station layouts elsewhere: Hong Kong MTR station layout PDFs, Tokyo Metro 3D station maps; RATP République laser scan (LevelS3D/NavVis)](https://www.mtr.com.hk/en/customer/services/system_map.html) | visualisation | various | - | restricted | independent | low: Comparison: TfL does not publish passenger 3D layouts; London has only the FOI sheets. |
| 52 | [Planet Minecraft: "Canary Wharf Underground Station 1:1" (The London Project)](https://www.planetminecraft.com/project/canary-wharf-underground-station-1-1/) | game build | 2021-02-09 | CWh | unclear | unclear (project uses DEFRA LIDAR for buildings; interior reference not stated in the snippet) | low: Shows public interest in a walkable Canary Wharf station; no data to reuse. |
| 53 | [Roblox: DJMN Lines (Jubilee line game)](https://www.roblox.com/games/5177561496/STATION-TRAIN-ANNS-V1-14-9-DJMN-Lines) | game build | 2020s (active) | CWa, CWh, Canning Town, North Greenwich, Stratford, West Ham | restricted | unclear | low: Game; nothing reusable. |
| 54 | [Waymap: indoor navigation trial in a TfL Underground station (EIT Urban Mobility)](https://marketplace.eiturbanmobility.eu/best-practices/testing-accessible-navigation-in-the-london-underground) | app | 2022-2023 | - | restricted | unclear (station maps are Waymap's own) | low: Shows the indoor-route use case; no data. |

## What this means for our modelling

1. **Almost nobody has built 3D from the sheets.** In eleven years we found no 3D model, glTF, game level or dataset that
   says it was made from the TfL axonometrics. The sheets were republished (Ian Visits, with redactions cleaned), discussed
   and used as a check by a few OSM mappers. The only derived data found is two rough platform outlines at Gloucester Road
   in OSM tagged `source=TfL axonometric` (changeset 178320189, 2026-02-09). Our model would be the first open 3D use we
   know of, so we set the baseline ourselves.
2. **Best baselines for Canada Water:** (a) the TfL sheet (approved; J009-06; platform depths 15.0 m Jubilee, 8.0 m
   East London line as read); (b) the OSM indoor mapping (Weltstaat 2018 and later: corridors, rooms, doors, platforms at
   levels -2 and -3; ODbL); (c) TfL station topology HUBZCW (10 levels; TfL open data terms); (d) the TfL depth CSV
   FOI-0493-2223 for levels; (e) by eye only: the LT Museum cross-section model (c.1995) and the Station Master 3D map.
3. **Best baselines for Canary Wharf:** (a) the TfL sheet (approved; Jubilee platforms about 23 m below street; escalator
   banks ESC 1-20, lifts, mezzanine); (b) OSM platforms at level -3, 26 lifts and 114 step ways in the estate (no indoor
   areas for the ticket hall); (c) TfL topology HUBCAW (24 levels); (d) the TfL depth CSV; (e) by eye only: the LT Museum
   Foster model (c.1995), Station Master, and the Jubilee line sheet set in the Internet Archive copy of WhatDoTheyKnow
   response 674923 for the other JLE stations.
4. **What we may reuse under the cwplans rules:**
   - Open licences: yes. TfL station topology and GTFS pathways (TfL open data terms), the Sketchfab CC BY props
     (artfletch scans, Aceantt environment) if a prop is ever needed, with attribution.
   - Share-alike: only OSM (ODbL), tracked in the data register. Not the GPL Unity project, not the CC BY-SA OSM wiki text,
     not Andrew Godwin's CC BY-NC-SA Station Viewer models without the owner's agreement.
   - Restricted, unclear or none: reference only, link not copy (TurboSquid, 3D Warehouse, Station Master, LT Museum, Planet
     Minecraft, Roblox, papers, press).
   - The TfL sheets themselves: approved by the owner for this phase (RPSI re-use, not an open licence). Keep geometry
     traced from the sheets out of anything ODbL (OSM has TfL consent only for Line of Route and Zone of Influence, and the
     OSM wiki says there is no import consent): a model derived from the sheets must not be merged into OSM data we
     publish as ODbL.
5. **Not to scale.** Every user of the sheets meets the same fault: the vertical scale is exaggerated (steep stairs). Take
   horizontal layout and topology from the sheet, levels from the TfL depth CSV and topology files, and georeference with
   OSM platforms and entrances. Record both values where they disagree (the am3d README already does for Canada Water).

## Gaps

- No open 3D model (glTF, IFC, CAD) of any zone station exists in public. TfL and Crossrail hold BIM and CAD; the FOI
  route for the Elizabeth line Canary Wharf sheet may have been refused (a search summary names FOI s24 and s38; not
  verified, because WhatDoTheyKnow could not be read).
- DLR axonometrics: an X post says DLR drawings were released by FOI; we could not read it. Heron Quays, West India Quay and
  Canary Wharf DLR would be in the zone.
- No copy of the sheets on Wikimedia Commons was found (search only; Commons search pages are disallowed by robots.txt).
- Pages not read are listed below; their facts come from search-engine results only and are marked `search-snippet`.

## Sites not read

- ianvisits.co.uk: robots.txt disallows anthropic-ai and Claude-Web
- architectsjournal.co.uk: robots.txt disallows Claude-Web, ClaudeBot, Claude-SearchBot, Claude-User
- brixtonbuzz.com: robots.txt disallows all agents
- railforums.co.uk: robots.txt disallows ClaudeBot and anthropic-ai
- x.com: robots.txt disallows all agents
- reddit.com: robots.txt disallows all agents
- skyscrapercity.com: robots.txt disallows Claude-Web, ClaudeBot and anthropic-ai
- whatdotheyknow.com: Cloudflare challenge to scripts
- archpaper.com: Cloudflare managed challenge
- tfl.gov.uk and techforum.tfl.gov.uk: "Verification required" bot page
- turbosquid.com, planetminecraft.com, ltmuseum.co.uk, londonist.com, boingboing.net: HTTP 403 to the fetch tool (not retried)

OSM facts in this file (element ids, counts, user names, dates) come from the OSM extract of 2026-10-01:
data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL 1.0.
