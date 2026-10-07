# Live state in the Docklands zone

Snapshots of things in the zone that change by the minute or the day: hire bikes, station lifts and busyness, traffic
cameras, power cuts, storm overflows, NOTAMs (cranes and temporary airspace) and the published helicopter structure.
First run: 4 October 2026, 08:24 to 08:27 UTC (a Sunday morning). Tool: `tools/fetch-live.mjs`. Method and lessons:
skill `cwplans-live-state` (`magpie/cwplans/skills/cwplans-live-state/SKILL.md`).

Zone: the 3D model box (WGS84 -0.095, 51.474 to 0.015, 51.522) plus the east margin used by `feeds/works/`
(0.015 to 0.085, 51.495 to 51.522: Royal Docks, ExCeL, London City Airport). Every item has `zone` = `model`,
`east` or `null` (context outside the zone, kept only in `helicopters.json`).

Each file: `{meta: {source, url, fetched, licence, attribution, method, counts, zone}, items: [{id, kind, name, zone,
time, position: {lat, lon[, alt_ft]}, values, url}]}`.

    NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-live.mjs            # every source (about 3 minutes; 65 crowding requests)
    NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-live.mjs bikes lifts
    node magpie/cwplans/tools/fetch-live.mjs --no-fetch                      # rebuild from data/raw/live/

## The snapshots

| file | what | items (4 Oct 2026) | licence | update | from a page (CORS) |
|---|---|---|---|---|---|
| `bikes.json` | Santander Cycles docks: bikes, e-bikes, empty docks, docks, locked, temporary | 138 docks: 1,889 bikes (132 e-bikes), 1,661 empty docks of 3,897; 347 docks neither free nor holding a bike; 7 docks empty, 8 full. Isle of Dogs and Canary Wharf (51.485-51.512, -0.035-0.000): 26 docks, 465 bikes, 823 docks | TfL open data terms, "Powered by TfL Open Data" | about 5 min | yes (`*`) |
| `lifts.json` | TfL lift outages at stations in the zone | 4 of 18 London outages: Canary Wharf (no step-free access to the Jubilee line), Bank (King William Street entrance), Canada Water (street to ticket hall until spring 2027), King George V DLR | TfL open data terms | minutes | yes |
| `crowding.json` | station busyness now as a fraction of a typical day (TfL Wi-Fi and gate data) | 20 of 65 stations had data; highest Aldgate East 0.124, Whitechapel 0.112; Canary Wharf (Elizabeth line) 0.096 | TfL open data terms | 5 min | yes |
| `jamcams.json` | TfL traffic cameras: position, view, available, still and video URLs (no image stored) | 115 cameras (107 in the box, 8 east) | TfL open data terms | stills every few minutes | yes |
| `ukpn.json` | UK Power Networks power cuts (planned, unplanned, restored) | 1 (restored, E1 8 / E1W 1 and others) of 20 on the whole network | CC BY 4.0 | minutes | yes |
| `overflows.json` | Thames Water storm overflow monitors (Event Duration Monitoring): discharging, not, offline; last event | 17 outfalls; 0 discharging, 0 offline, 0 in the last 48 h | CC BY 4.0 (Thames Water via Stream) | 5 min | yes |
| `notams.json` | NOTAMs whose stated position is in the zone: cranes with heights, temporary danger and reserved areas | 18: 12 crane notices (Gracechurch Street 707-719 ft AMSL, Blackwall 392 ft, Bermondsey 370-416 ft, Silvertown, and others) and 6 temporary areas (EGD196A / EGTR196, beyond-visual-line-of-sight drone flights over the Thames by Southwark, 5-9 Oct) | © NATS; facts only | hourly | no |
| `helicopters.json` | UK AIP: H4 reporting points from the Isle of Dogs to the London Heliport, restricted areas EGR158 (City), EGR159 (Isle of Dogs), EGR160 (Specified Area) | 8 (4 in the zone) | UK AIP, Crown copyright / NATS; facts only | 28-day AIRAC | no |

What each tells us:
- **Bikes** are the live movement state of the estate's edges: docks fill at Canary Wharf in the morning and empty in
  the evening. `unavailable_docks` (docks minus bikes minus empty docks) is TfL's broken or blocked count.
- **Lifts** are step-free access now: Canary Wharf had no step-free access to the Jubilee line at the time of the snapshot.
- **Crowding** is the busyness of each station against its usual level for the hour (0.1 = a tenth of usual on a Sunday
  morning). Tube and DLR naptans mostly return `dataAvailable: false`; Elizabeth line and some Tube stations answer.
- **JamCams** give the view direction and a current still (`image_url`, TfL S3): a page can show the still on tap.
- **Power cuts** carry postcode sectors, customers affected and estimated restoration. The customer letter text and the
  full postcode list are dropped.
- **Storm overflows** say where sewage can enter the Thames, Deptford Creek and the docks, and when it last did. The
  monitor "indicates" a discharge; it does not confirm one (Stream).
- **NOTAMs** are the only open, dated list of tall cranes with heights above mean sea level. Positions are to 0.1 s of
  arc; heights in feet AGL and AMSL. The text, contacts and phone numbers are not kept.

## Helicopters

**What is published (facts, sources):**
- Helicopters cross the zone on route **H4**, the Thames. UK AIP EGLL AD 2.22 para 12 lists H4 reporting points:
  **Isle-of-Dogs** (compulsory; 51°29'02"N 0°00'42"W, "Specified Area Boundary crossing River Thames - north abeam Cutty
  Sark"), **London Bridge** (on request), Vauxhall Bridge, Chelsea Bridge, the **London Heliport** (Battersea). Altitudes:
  VFR maximum 2000 ft, suggested minimum 1000 ft, Special VFR maximum 1500 ft (printed for London Bridge to Vauxhall);
  AIC Y 079/2020 says helicopters on H4 between the Isle of Dogs and the London Heliport should fly no lower than 1000 ft
  AMSL. No holding points on H4 east of the Heliport; the nearest is Greenwich Marshes. AIP note: the cable car crosses
  the Thames about 1 NM east of the Isle-of-Dogs point (towers 289 and 285 ft AMSL, cable unlit).
- **EGR159 Isle of Dogs**: a restricted area from the surface to 1400 ft over Canary Wharf (vertices in
  `helicopters.json`; legal basis SI 2004/2091, The Air Navigation (Restriction of Flying) (Isle of Dogs) Regulations
  2004). Flight permitted for the Metropolitan Police, Special Flight Notification, **any helicopter on H4**, an Enhanced
  Non-Standard Flight clearance, and aircraft to or from London City Airport. **EGR158 City of London** is the same to
  1400 ft. **EGR160** (the Specified Area of central London): single-engine helicopters must be able to glide clear;
  the bed of the Thames is excluded, which is why helicopters follow the river. Its east edge runs at about 0°00'44"W,
  through the Isle of Dogs.
- **Counts**: the CAA publishes daily counts of helicopters in the London and London City control zones (CAP 1455,
  2007-2026, xlsx): totals, time of day, single or twin engine, route H, H4 or direct, police, HEMS and Battersea. For
  January to June 2026: 6,926 helicopters; 658 on H4; 1,473 police; 686 HEMS; 1,822 Battersea. The CAA's terms allow
  download for own use, not reproduction for publication: these sums are quoted as facts; the file is not committed.
- **Military (Chinooks)**: RAF Chinooks (RAF Odiham, Hampshire) cross London along the Thames on H4 under an ATC
  clearance like any helicopter; forums report one or two a week; joint UK-US Chinook exercises ("Dark Lightning",
  September 2024) used the London heli-lanes (RAF post, Forces News). The MOD publishes low-flying statistics for the UK
  Low Flying System, but London is in the Thames Valley Avoidance Area: no published flight plans, schedules or
  per-flight records for transits. Military flight plans are not public.
- **Police and air ambulance**: NPAS (police) and London's Air Ambulance (HEMS) have exemptions and may hold low over a
  place (CAA). The Royal London Hospital helipad (Whitechapel) is inside the model box. No open per-flight data.
- **NOTAMs and temporary restrictions**: the hourly full UK PIB (NATS contingency service, no login) is the source of
  `notams.json`. Restricted Areas (Temporary) for events are published as AIC (Mauve) and NOTAMs.

**What cannot be known, and why:**
- **Live helicopter positions** with an allowed licence: none found. OpenSky (non-commercial research terms; its terms
  page answered 403/503), adsb.fi (personal non-commercial; no licensing or resale), airplanes.live (terms page 403),
  ADS-B Exchange (commercial) are restricted; adsb.lol is ODbL (share-alike: not without the owner's agreement). So no
  position sample is committed. A local check at 08:15 UTC on 4 Oct 2026 saw three fixed-wing aircraft within 8 NM
  (adsb.lol) and no helicopter.
- **Which flight is a Chinook** cannot be known in advance: no published schedule or plan. Military aircraft often
  send Mode S without position; some send ADS-B (the community sites show them). Mode S without position can only be
  located by multilateration (a network service under the same restricted terms).
- **Noise**: the CAA has no per-flight helicopter noise data for London; complaints go to the CAA or the London Heliport
  (no open dataset). London City Airport's WebTrak (site terms) covers fixed-wing LCY traffic.
- **The current AIP issue**: the NATS eAIP issues after 2024-03-21 answered HTTP 404 from the container on 4 Oct 2026.
  The AIC says the lateral routes have not changed; check altitudes against the current issue before use.

## Hire bikes and micromobility

- **Santander Cycles**: live, open, CORS (`bikes.json`). TfL BikePoint, "Powered by TfL Open Data".
- **Dockless e-bikes (Lime, Forest; Dott and Voi for e-scooters)**: **no open live feed for London.** The MobilityData
  GBFS catalogue lists no London system; Dott's GBFS answers 404 for "london", Lime's 404, Voi's 401. Operators share
  data with TfL and boroughs under agreements (Westminster data-sharing deal; TfL's planned licensing framework), not openly.
- **Parking bays**: borough-designated bays exist (Tower Hamlets, Southwark, Greenwich, Lewisham agreements); no open
  dataset found for the zone. Third-party maps (lime-parking.vercel.app, Cyclemate) do not state a source or licence: not used.
- **E-scooter trial** (TfL; Lime and Voi; 11 boroughs, about 1,600 bays): Tower Hamlets including Canary Wharf takes
  part; TfL says parking on private land was provided by Canary Wharf Group. Bay positions are not published as data.
- **Canary Wharf estate rules**: canarywharf.com answered with a bot challenge (Incapsula) and the Internet Archive reset
  the connection; the estate's rules for hire bikes were not read. Open question.
- Static cycle parking: TfL Cycle Infrastructure Database and Tower Hamlets cycle hangars (`th-cycle-parking` in
  `feeds.json`) are in the backlog.

## Ranked backlog (not yet snapshotted)

Ranked by value to the 3D page and openness. "Page" = a page on GitHub Pages can call it live (CORS).

| # | thing | source | licence | update | page | why |
|---|---|---|---|---|---|---|
| 1 | Trains, boats and cable car moving | TfL arrivals (StopPoint/{id}/Arrivals), line status | TfL open data | 30 s | yes | moving vehicles on the DLR viaducts, Jubilee, river buses |
| 2 | Tower Bridge lifts | towerbridge.org.uk/bridge-lifts (date, time, vessel, direction) | **terms forbid it** (2026-10-04: Legal statement clauses 2.5 no scraping or data mining, 5.3 no reuse); not fetched, owner decision | daily, 6-10 days ahead | no | ~800 lifts a year; the ship then passes the zone |
| 3 | Thames vessels | aisstream.io (free key), PLA | aisstream terms | seconds | no (key) | ships, clippers and tugs on the river |
| 4 | EV charger availability | operator OCPI feeds (Public Charge Point Regulations 2023); Open Charge Map (CC BY 4.0 mostly; key required since this check) | per operator | minutes | some | the NCR closed on 28 Nov 2024; no free aggregate |
| 5 | Flood warnings | EA flood-monitoring /floods | OGL | 15 min | yes | the Isle of Dogs flood areas; usually none |
| 6 | Air quality | LAQN (non-commercial terms: live view only, not committed); Open-Meteo AQ (CC BY 4.0, model); Breathe London (key) | mixed | hourly | yes (LAQN, Open-Meteo) | NO2 and PM by street |
| 7 | Grid carbon intensity | Carbon Intensity API, E14 | CC BY 4.0 | 30 min | yes | colour the night lights by grid carbon |
| 8 | LCY aircraft and noise | London City Airport WebTrak; CAA monthly airport data | site terms | delayed | no | approach path over the Royal Docks |
| 9 | Fire incidents | LFB incident records (London Datastore) | OGL | monthly | yes | not live; aggregates only |
| 10 | Crime | data.police.uk | OGL | monthly | yes | partly used already |
| 11 | Cycle counts | TfL cycling counts (cycling.data.tfl.gov.uk) | TfL open data | quarterly | no | flows on CS3 (Cable Street) and the Highway |
| 12 | Planning decisions | Planning London Datahub; planning.data.gov.uk | OGL | daily | partly | new towers; temporary structures are in `feeds/works/` |
| 13 | Rain and weather stations | Met Office WOW (WOW terms); Netatmo (account) | restricted | minutes | no | street-level weather; Open-Meteo is used already |
| 14 | Car parks | TfL Occupancy/CarPark (HTTP 500 on 4 Oct 2026); CWG car parks (no feed) | TfL | minutes | yes | none open in the zone |
| 15 | Dock bridges and locks | Canal & River Trust stoppages (no open licence); South Dock and Blue Bridge openings (no feed) | - | - | no | bridge state across the docks: not published |

Not knowable as open data: footfall (CWG and BT, closed), Wi-Fi and 5G masts (Ofcom Sitefinder was withdrawn about
2015; mastdata.com is paid), Thames Water supply outages (no open API), dockless bike positions (above), military
flight plans.

## Sources checked and not used

- airplanes.live (403), OpenSky terms (403/503), adsb.fi (non-commercial), adsb.lol (ODbL), London heliport movements
  (CAA CAP 1455: no reproduction), NATS eAIP issues after 2024-03-21 (404), Dott/Lime/Voi GBFS for London (404/401),
  Open Charge Map (now needs a key), canarywharf.com (bot challenge), Breathe London API (key).
