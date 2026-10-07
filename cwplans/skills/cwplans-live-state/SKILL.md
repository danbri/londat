---
name: cwplans-live-state
description: >-
  Live and fast-changing state in the cwplans Docklands zone, as dated snapshots in feeds/live/ made by
  tools/fetch-live.mjs: Santander Cycles docks (TfL BikePoint: bikes, e-bikes, empty and broken docks), TfL lift
  outages and live station busyness (crowding), TfL JamCam traffic cameras, UK Power Networks power cuts (CC BY 4.0),
  Thames Water storm overflow monitors (CC BY 4.0, via Stream), NOTAMs from the NATS hourly full UK PIB (crane positions
  and heights, temporary danger and reserved areas, facts only), and the published helicopter structure from the UK AIP
  (route H4 reporting points and altitudes, restricted areas EGR158 City, EGR159 Isle of Dogs, EGR160 Specified Area).
  Also what cannot be known and why: live helicopter or Chinook positions (every ADS-B source is non-commercial,
  restricted or ODbL), military flight plans, CAA helicopter counts (CAP 1455, no reproduction), dockless bike positions
  and bays in London (no open GBFS), the Canary Wharf estate's hire-bike rules (site behind a bot challenge), and a
  ranked backlog of other stateful things (trains, Tower Bridge lifts, AIS, EV chargers, flood warnings, air quality).
  Reach for it before you refresh or add a live source, show live state on the 3D page, or answer "what is flying,
  parked, broken or discharging in the zone right now?".
---

# Live state in the Docklands zone

Data: https://danbri.github.io/londat/cwplans/feeds/live/ (README.md there has the table of
snapshots, counts, the helicopter facts and the ranked backlog). Tool: `tools/fetch-live.mjs`. Policy: the curation
skill `docklands-data-curation` and the cwplans exception in the repo CLAUDE.md. Log every session in
`skills/docklands-data-curation/ACTIVITY-LOG.md`.

    NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-live.mjs                 # every source, about 3 min
    NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-live.mjs bikes ukpn      # some
    node cwplans/tools/fetch-live.mjs --no-fetch                           # rebuild from data/raw/live/ (gitignored)
    node cwplans/tools/check-data-register.mjs --write                     # then

Tower Bridge lifts: the site's terms forbid scraping and reuse (checked 2026-10-04); not fetched. Details: skill
`cwplans-river-and-water`, "Tower Bridge lift times: not fetched".

## Method

- **Zone**: `BOX_WGS84` from `tools/fetch-docklands.mjs` (the model box) plus the east margin of `fetch-works.mjs`
  (0.015 to 0.085 E, 51.495 to 51.522 N). Every item carries `zone`: `model`, `east`, or `null` for context kept on
  purpose (EGR160 and the H4 points west of London Bridge).
- **One shape for every file**: `{meta: {source, url, fetched, licence, attribution, method, counts, zone}, items:
  [{id, kind, name, zone, time, position: {lat, lon[, alt_ft]}, values, url}]}`. Ids are the source's own (BikePoints_n,
  naptan, JamCams_n, INCD-..., TWL..., NOTAM series/number/year, EGR159): they become IRIs later.
- **Politeness**: one request at a time per host, 1.5 s apart, User-Agent `glitchcan-cwplans/0.1 (...)` from
  `tools/lib.mjs`, up to 5 tries with Retry-After or a doubling pause on 429, 5xx, timeouts and resets; a 404 is
  returned, not retried. Raw responses kept in `data/raw/live/`; the AIP pages and the StopPoint list are reused when
  present (`keep`).
- **Whole-list requests where they exist**: BikePoint (all 799 docks), JamCam (all 890), the lift outage list, the
  UKPN export and the PIB are one request each, filtered locally. Only crowding is per station (65 requests).

## Sources, licences, traps

| source | licence | trap |
|---|---|---|
| TfL BikePoint, lifts, crowding, JamCam | TfL open data terms, "Powered by TfL Open Data" (the terms page answers 403 to scripts: re-check) | lift outages name a hub (`HUBCAW`) or a naptan: place through `StopPoint/Mode/...` `naptanId` then `hubNaptanCode`. Crowding: most Tube and DLR naptans answer `dataAvailable: false` (45 of 65 on 4 Oct 2026); the value is a fraction of the usual for that hour, not a count. `NbDocks - NbBikes - NbEmptyDocks` = broken or blocked docks |
| UKPN `ukpn-live-faults` | CC BY 4.0 (dataset metadata) | the whole network has ~20 incidents; the zone usually 0-2. Drop `fullpostcodedata` and the letter text |
| Thames Water storm overflows (Stream / NSOH ArcGIS item 216f455c...) | CC BY 4.0 (item licenceInfo) | Status 1 = the monitor indicates a discharge (not confirmed), 0 = not, -1 = offline; times are epoch ms |
| NATS full UK PIB XML (`pibs.nats.co.uk/operational/pibs/PIB.xml`) | © NATS, no open licence: facts only | a NOTAM appears in two PIB sections: dedupe by series/number/year. Place by the position in item E (0.1 s), not the Q-line (whole minutes). Crane heights are "MAX HGT n FT AGL/m FT AMSL" or "UP TO ...". Drop item E text, phone numbers |
| UK AIP (aurora.nats.co.uk eAIP) | Crown copyright / NATS: facts only | issues after 2024-03-21 answered 404 from the container (4 Oct 2026); the history page lists them. The H4 table loses its row spans in HTML: the altitudes print between London Bridge and Vauxhall. The first " H4 " in the page is another table: anchor on "Isle-of-Dogs" |

## Helicopters: what is and is not knowable

- Known (published): the H4 route along the Thames, its Isle-of-Dogs compulsory reporting point (51°29'02"N
  0°00'42"W, north abeam Cutty Sark) and London Bridge; VFR max 2000 ft, suggested min 1000 ft, SVFR max 1500 ft;
  EGR159 Isle of Dogs (SFC to 1400 ft; H4 helicopters, police and LCY traffic permitted; SI 2004/2091); EGR160 makes
  single-engine helicopters keep to the river. CAA CAP 1455 gives daily counts (police, HEMS, H4, Battersea) but its
  terms forbid reproduction: quote sums as facts, do not commit the file.
- Not knowable with an allowed licence: live positions (OpenSky non-commercial research, adsb.fi personal
  non-commercial, airplanes.live terms not readable, ADS-B Exchange commercial, adsb.lol ODbL = share-alike, needs the
  owner's agreement); Chinook schedules or flight plans (military, not published); per-flight noise.
- If the owner allows ODbL for ADS-B (adsb.lol), the snapshot shape is ready: `kind: 'aircraft'`, `position.alt_ft`,
  values with type code (H47 = Chinook, EC35/EC45/AS65 = police and HEMS types) and the dbFlags military bit.

## Micromobility

No open live feed for dockless bikes or e-scooters in London (MobilityData GBFS lists none; Dott 404, Lime 404, Voi
401 on 4 Oct 2026). Bays: no open dataset for the zone. Canary Wharf Group provides e-scooter trial parking on its
private estate (TfL); the estate's own rules were not readable (canarywharf.com bot challenge; Internet Archive reset).

## Page use (proposal; the page itself belongs to `docklands-3d-page`)

Docks as small columns (height = docks, fill = bikes, e-bikes a second colour, red ring when empty or full); lift
outages as a red badge on the station; busyness as a pulsing ring scaled by `percentage_of_baseline`; cameras as
cones in the `view` direction, tap for the TfL still; power cuts as an amber disc; overflows as outfall markers on the
river wall, red when discharging, grey offline; NOTAM cranes as thin masts to `alt_ft` with a lit tip at night;
temporary areas as translucent prisms between their levels and times; H4 as a line along the Thames at 1000 to 2000
ft with the Isle-of-Dogs point, and EGR159 as a translucent prism to 1400 ft over Canary Wharf. Credit each source
with its attribution line; TfL, UKPN, Stream and the PIB are callable live from a page only where `README.md` says
CORS yes (the PIB and the AIP are not).

## Lessons

- A "live" source with no item in the zone is still a state: write the file with `items: []` and the network-wide
  count, so the page can say "no lift outages" rather than "no data".
- Check each source's terms before the first fetch, not after: three of the four ADS-B services were ruled out by
  terms, and the CAA counts by a one-line copyright notice.
- Do not trust a third-party bay map that names no source (lime-parking.vercel.app, Cyclemate).
