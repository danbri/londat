# Sources to investigate

Queue of data sources for the cwplans scoping project (Canary Wharf, Isle of Dogs, Limehouse, Rotherhithe / SE16).
Machine-readable copy: [`sources-to-investigate.json`](sources-to-investigate.json). Started 2026-10-06 from a Gemini
answer the owner pasted, checked against what the project already holds.

Licence classes follow the project rule ([CLAUDE.md](CLAUDE.md), "Data policy (the cwplans exception)"; until 2026-10-07 in danbri/glitchcan-minigam): **open** may be
committed; **share-alike** gives counts only, and a committed extract needs the owner's agreement (OpenStreetMap is the
one share-alike source already agreed); **unknown** means check the terms first.

## The queue

| source | licence class | status | next step |
|---|---|---|---|
| Mapillary images and AI-extracted map features (Meta) | share-alike (CC BY-SA 4.0) | catalogued 2026-10-03, not counted | the Graph API needs an access token: owner to provide one or decide not to; then counts per area |
| KartaView (formerly OpenStreetCam) | share-alike (CC BY-SA 4.0) | counted 2026-10-06 | decide whether the 2016 to 2024 street views are worth an extract |
| Panoramax (federated) | share-alike (CC BY-SA 4.0 on all 5,217 zone pictures) | counted 2026-10-06 | none now; only 66 zone pictures carry semantic tags |
| OpenAerialMap | open (CC BY 4.0) | counted 2026-10-06; images listed | decide whether to fetch the 2 to 5 cm drone images over Canada Dock, Canada Water and Earl Pumping Station |
| EA survey downloads: aerial photography, LiDAR | open (OGL v3.0) | in use (3D page); products listed per area | none: no 25 cm LiDAR in the zone |
| London Datastore: 3D building models | unknown | not found | no such dataset in the Datastore catalogue (1,305 datasets); look elsewhere and check terms |
| London Datastore: green infrastructure | open | in use | London Green Infrastructure Framework harvested; the "Green Infrastructure Focus Map" is All Rights Reserved |
| Historical aerial imagery indices | unknown | not found in the Datastore | candidates not checked: Historic England Archive aerial photograph catalogue, Britain from Above (Aerofilms); check terms before any fetch |
| **New:** Built Environment Scanning System (BESS), xRI (Datastore vd4ll) | unknown (licence field empty) | found 2026-10-06 | read its Turtle files and page for a licence and the area covered; RDF fits the knowledge graph |

## First check of the areas (2026-10-06)

Counts by bounding box. The boxes are drawn by hand and touch or overlap a little; the zone box is
W −0.095, S 51.474, E 0.015, N 51.522. Panoramax and KartaView: pictures; OpenAerialMap: images; EA: product tiles.

| area | Panoramax | KartaView | OpenAerialMap | EA tiles |
|---|---:|---:|---:|---:|
| Canary Wharf | 485 (2025 to 2026) | 70 (2019 to 2021) | 0 | 64 |
| Isle of Dogs south of Canary Wharf | 193 (April 2026) | 38 (2019 to 2024) | 0 | 31 |
| Limehouse | 4 (2022 to 2026) | 49 (2016 to 2021) | 0 | 34 |
| Rotherhithe and SE16 | 9 (2020 to 2024) | 152 (2016 to 2024) | 4 (2024 to 2026) | 128 |
| whole zone | 5,217 (2018 to 2026) | not counted | 7 (2020 to 2026) | 176 |

- **Panoramax:** street pictures here are recent (zone: 2,052 in 2024, 1,061 in 2025, 2,085 in 2026). Canary Wharf
  has 485 from 2026; Limehouse and SE16 have almost none.
- **KartaView:** older street views (most from 2020); SE16 has the most, from 2016 onwards.
- **OpenAerialMap:** drone images at 2 to 5 cm: Canada Dock new bridge and wetlands (2024-09-02), Deptford Landings
  (2024-11-30, at the edge of the SE16 box), Canada Water (2025-01-04), Earl Pumping Station (2026-02-08); outside the
  areas but in the zone: Walworth (two, 2020) and Crossfield Open Space (2026-02-08). None over Canary Wharf, the Isle
  of Dogs or Limehouse.
- **EA:** in every area LiDAR tiles at 0.5 m (2003, 2007, 2012) and 2 m (1999), National LiDAR Programme at 1 m (2018,
  2020), composites at 1 m and 2 m (2022), and aerial photography 2008 (40 cm colour) and 2012 (20 cm, night). 1 m tiles
  of 2015 in every box except the Isle of Dogs one; 2005 and a 2017 oblique incident-response photograph only elsewhere
  in the zone. No 25 cm product.
- **Mapillary:** not counted (token).

The numbers come from the knowledge graph: graph `coverage-imagery` in [`kgx/`](kgx/) (version
`https://danbri.github.io/londat/kgx/graph/coverage-imagery/625642ff1fe69ec6`). It was made by the logged operation
`lift-imagery-coverage` from the answer files: OpenAerialMap and EA answers in
[`cwplans/coverage/raw/2026-10-06/`](cwplans/coverage/raw/2026-10-06/); Panoramax and KartaView answers are not
committed (share-alike), the activity log names them by SHA-256. Tool:
[`cwplans/tools/probe-imagery-coverage.mjs`](cwplans/tools/probe-imagery-coverage.mjs) (in danbri/glitchcan-minigam until 2026-10-07).
