# Scaling to Greater London and a globe; goals review (2026-10-11)

Written for the owner on 2026-10-11, in answer to: "I asked in a previous session about scaling up to cover (at least
partially) all of London and to adopt a globe / planet model. I saw some discussion but no conclusions. Can you comment
on scaling up? Where are we? Also next do an OKRs review."

## 1. Where we are on scaling

The question was asked on 2026-10-09 18:10 UTC in the session "Docklands ThreeJS port" ("Subagent: assess amount of
work to extend the map to cover more or all of greater London. ... Can we even provide a skeleton of global coverage
... What changes if we have to make this explicitly a 3D globe? Or is that done already?"). A research subagent
answered at 18:17 UTC. The owner did not choose an option, and no phase was started. Since then all work has made the
box deeper, not wider.

Facts from that assessment, checked again on 2026-10-11:

| item | value |
|---|---|
| model box | 7.5 x 5.6 km = 42.0 km², BNG E 532,400 to 539,900, N 176,700 to 182,300; origin E 537,550, N 180,300 (One Canada Square) |
| buildings in the box | 41,803 in `area.js` (5.6 MB); 1,127,096 triangles; terrain 376 x 281 points at 20 m |
| page data now | 33 MB in `cwplans/docklands/data/` (trees.json 6.4 MB, area.js 5.6 MB, building-keys.json 2.6 MB) |
| Greater London | 1,572 km², 37.4 x the box; OSM London extract 1,185,685 building ways, 20.6 % with a height or levels tag |
| London at today's detail | about 590 MB raw (150 MB gzip) of layers, about 32 M building triangles; phones failed at about 2.8 M |
| frame | flat BNG metres; the WGS84 to BNG fit holds to 0.20 m over London; float32 at 35 km: 3.9 mm (fine); curvature drop 110 m at 37.5 km (not applied) |
| box fixed in code | 21 tools import the box from `cwplans/tools/fetch-docklands.mjs`; 13 files hold 537550 / 180300; no data tool takes `--bbox` |
| what already covers London | the "Hills of London" ring (EU-DEM 250 m, E 503,000 to 562,000, N 155,000 to 201,000); the GLA Public Realm Trees file (London-wide); EA LiDAR 1 m (all England, OGL); the OSM Greater London extract |
| Pages size | about 456 MB of the 950 MB limit (the workflow stops at 950 MB) |

Options and effort (agent-days) from the assessment:

| option | what | effort |
|---|---|---|
| A | one area config: every tool and the page take the area from one file (`--area`) | 3 to 5 |
| B | more boxes, one at a time | +1 to 2 each |
| C | Greater London in BNG 1 km tiles, loaded by view, 3 levels of detail, curvature on far tiles; 150 to 250 MB of tiles, about 13 GB of raw LiDAR (not committed); a second repository or host for the tiles | 20 to 30 |
| D | 2D global skeleton (MapLibre globe or the atlas; Natural Earth, public domain; boundaries as PMTiles) | 3 to 5 |
| E | 3D globe in the port: 3d-tiles-renderer (Apache-2.0) with its ReorientationPlugin; London stays in a local frame; ETOPO 2022 or Copernicus GLO-90 terrain; its GLSL plugins rewritten in TSL | 15 to 25 |
| F | move to CesiumJS: rejected (loses TSL, WebGPU, WebXR) | 40 to 60 |
| G | MapLibre globe with a three.js custom layer | 10 to 15 |
| H | Google Photorealistic 3D Tiles: not allowed (key, no caching, licence rule) | |

Totals: about 25 to 35 agent-days to cover London; about 45 to 65 agent-days to an open globe with London detail.

## 2. Comment

**What generalises and what does not.** The fixes of 2026-10-11 fall into two kinds:
- Rules on open national data. These generalise. Clipping the terrain to every OSM water outline (F54) works on any
  dock, river or lake in England that OSM maps and the EA LiDAR covers. Round tree crowns, crown occlusion, the sky
  calibration and the 3D wind field (street axes from building edges) are rules too. They cost the same per km².
- Hand work. This does not generalise: photo views and their camera solves, the facade tiles, the station boxes, the
  detailed models, the occupant registry, and stated values such as a dock depth of 10 m. Keep these as "detail
  islands" on top of a generic base. The curation skill's rule "catalogue error classes, do not patch records" is
  the rule that lets the base scale: each fault class becomes a rule that runs everywhere.

**Recommendation.**
1. Do option A now (3 to 5 days). It is cheap, and each day of box-only work makes it more expensive. After A, a new
   tool or layer cannot hard-code the box.
2. Choose the tile format before option C, and choose it so that option E can reuse it. Recommended: 3D Tiles 1.1
   (`tileset.json` + glTF 2.0 with meshopt compression), one tile for each BNG 1 km square, each with its BNG to ECEF
   transform. Then:
   - The port draws the tiles in its local BNG frame.
   - A globe viewer (3d-tiles-renderer, CesiumJS, QGIS 3D) opens the same tiles.
   - Gaussian splat tiles (the glTF splat extension) can go into the same tree later.

   Our own JSON tiles would be quicker to start, but they are a dead end for the globe.
3. Host the tiles outside GitHub Pages: a Hugging Face dataset (the owner's account is linked) or object storage.
   Pages has 494 MB left, and London tiles are 150 to 250 MB in their first version.
4. First ring: the Thames corridor west to London Bridge and the boroughs next to the box (Southwark, Lewisham,
   Greenwich, Tower Hamlets, Newham), about 150 to 200 km². Then Greater London.
5. Globe: option D (the 2D skeleton) first if a world view is wanted soon. Option E only after C, because E without
   London tiles shows little.

**Decisions needed from the owner:**
- Start option A now: yes or no.
- Tile format: 3D Tiles 1.1, or our own tiles.
- Tile host: Hugging Face, object storage, or a second GitHub repository.
- First ring: as above, or another area.
- The WebGL page (`cwplans/docklands/`): freeze it at the box (recommended), or keep parity.

**Owner's direction, 2026-10-11 (later the same day):** "Growing the codebase to work for any locale worldwide is
mission Critical. As is sphericalish planet model cf google earth. And some maps and data worldwide. It is ok to be
challenged by getting super rich dense data everywhere but we should architect for scaling this." This settles the
direction: a planet model (options D and E) and a locale-free core, not a London-only flat model. Option A becomes "one
locale adapter" (UK) behind a WGS84 / ECEF core with local east-north-up frames; option C's tiles become 3D Tiles placed on
the globe. The OKRs (https://github.com/danbri/londat/blob/main/OKRS.md) O1 and O2 hold the targets and the architecture
rules. Still open: the tile host, the globe renderer path (3d-tiles-renderer in the port, recommended), the three
places outside the UK, and the WebGL page.

## 3. Goals review ("OKRs")

Superseded by the OKRs set the same day: https://github.com/danbri/londat/blob/main/OKRS.md . This section stays as the
first scoring of the owner's goals.

No OKRs were ever written: there are no objectives or key results in the repository, the skills or the five earlier
session records. The only formal goal is the `/goal` of the session "Docklands ThreeJS port" (feature parity; planes;
piers and boats; time scrubber against history; roof port; birds and foxes; tree species and seasons; the falling data
sheet). Its last check (2026-10-10 15:27 UTC) said "not met". Below, the owner's goals and standing instructions are
grouped as objectives, and each is scored against evidence (0.0 to 1.0).

| objective | key result (evidence) | score |
|---|---|---|
| O1 Three.js port at parity with the WebGL page, and credible | parity table in `docklands/README.md`; AUDIT items 2 to 7 PASS, item 1 PARTIAL (accepted 2026-10-10); "Nav is good" on the iPhone; the owner has not checked the Greenwich park and tree fixes on a device | 0.8 |
| O2 Realism calibrated against the owner's photos | 1 day calibration photo: top sky band luma 0.574 against 0.581; shaded trees 0.339 against 0.129 (tree height 13.5 to 15 m in the data, about 19 m in the photo); birds 8 against 18; near water F54 (fix in progress); no night or overcast calibration yet | 0.4 |
| O3 Open, licensed, traced data | `npm run check`: 734 files registered, 74 marked "review" (AIS, adsb.lol ODbL, crawls); OSM credit check passes; dataflow rule in force; F51 (P3 photos) and F53 open | 0.8 |
| O4 Fresh live data ("always fresh air and boat data plus recent history") | live-cache branch fresh (2026-10-11 17:13 UTC: 432 aircraft, 102 vessels, 48 METAR); adsb-cache holds 4 to 10 October; the hourly cache ran only 5 times in the 28 hours to 08:53 UTC (GitHub skips scheduled runs) | 0.6 |
| O5 Works on the owner's phone | not measured on a phone GPU; the full page draws about 2.8 M triangles; no trees after a reload on a device (2026-10-09, not diagnosed); the Painted pass costs about 6 times the map pass in software | 0.3 |
| O6 Scale beyond the box (London, globe) | assessment only (2026-10-09); no decision; no phase started | 0.1 |
| O7 Painterly / splat-ready look | Painted style live; owner: "promising but too lossy"; fixes in progress (speckle, structure, overlays, grey wash) | 0.4 |

Proposed objectives and key results for the next two weeks (for the owner to accept, change or reject):

- **O-A. The port runs well on the owner's iPhone.**
  - Frame time measured on the device in 3 views (cw, greenlanddock, area).
  - At most 1.5 M triangles a frame by default.
  - The "no trees after reload" fault found and fixed.
- **O-B. The look is calibrated.**
  - Three reference photos (day clear, overcast, night) with `photo-tones.mjs` regions all within 0.08 luma.
  - The Painted style accepted by the owner on a phone.
- **O-C. The base scales.**
  - Option A done: zero literal origins outside one config file.
  - Tile format chosen.
  - One extra 1 km BNG tile (outside the box) built by the same pipeline and shown in the port.
- **O-D. Live data is reliable.**
  - The hourly cache runs at least 20 times in each 24 hours (a self-restarting loop, as live-cache).
  - The dashboard shows the gaps.
