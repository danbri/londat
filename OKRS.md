# Objectives and key results: cwplans / londat, Q4 2026

Set on 2026-10-11 at the owner's request ("we didn't set okrs. Please review docs and transcripts to set some."), then
revised the same day with the owner's essentials:

> "My iphone is essentially top of range. We need to offer much more universal access including growing towards
> nonvisual access including scripting accessibility for blind, llms, mcp, webmcp. Growing the codebase to work for any
> locale worldwide is mission Critical. As is sphericalish planet model cf google earth. And some maps and data
> worldwide. It is ok to be challenged by getting super rich dense data everywhere but we should architect for scaling
> this." (owner, 2026-10-11)

Other sources: `CLAUDE.md`, the curation skill ("Ways of working (the owner's words)"), the activity log
(https://github.com/danbri/londat/blob/main/cwplans/skills/docklands-data-curation/ACTIVITY-LOG.md), the Three.js port goal
list (2026-10-09) and the scaling assessment
(https://github.com/danbri/londat/blob/main/docklands/SCALING-AND-OKRS.md). The owner can change any line.

- **GitHub issues:** tracking issue https://github.com/danbri/londat/issues/2 ; O1 https://github.com/danbri/londat/issues/6 , O2 https://github.com/danbri/londat/issues/7 , O3 https://github.com/danbri/londat/issues/8 , O4 https://github.com/danbri/londat/issues/3 , O5 https://github.com/danbri/londat/issues/4 , O6 https://github.com/danbri/londat/issues/5 . Tick a key result in its issue when it reaches its target; comment the score at each checkpoint.
- **Period:** 2026-10-11 to 2026-12-31.
- **Checkpoints:** 2026-10-25, 2026-11-22, and the end-of-quarter score.
- **Scores:** 0.0 to 1.0 for each key result. An objective's score is the mean of its key results. Aim for about 0.7.
- **Evidence:** every score points to a test output, a commit, a count or the owner's own words.
- **Priority:** O1, O2 and O3 are mission-critical (the owner's words). When work competes, they come first. O4 to O6
  continue, but they must not add new locale-specific code to the core (see O1).

## Architecture rules that follow from O1 and O2 (apply to all new work from 2026-10-11)

1. The core frame is the planet: WGS84 positions, ECEF for the globe, and a local east-north-up frame for each tile or
   region near the camera (a floating origin). British National Grid, ODN heights, OSTN15 and the One Canada Square
   origin become one locale adapter (UK), not the core.
2. Data comes in layers of detail: a worldwide base everywhere (coarse terrain, coastlines, boundaries, OSM-derived
   buildings and roads where they exist), and richer local layers where open data allows (UK LiDAR, borough registers,
   the Docklands detail). The same tile tree holds both; a place gets better as data is added, with no new code.
3. Sources come through adapters with a licence each (the data register gets a country or region column). An adapter
   names its area, its licence class and its fallbacks.
4. Every feature has three outputs: the 3D view, a text description (for screen readers and LLMs), and a machine
   interface (JS API, WebMCP tool, MCP tool). A feature is not done until it has all three.
5. Every visible text is in a message catalogue; dates, times, units and number formats follow the visitor's locale
   (Intl), and the page clock follows the time zone of the place shown, not London.
6. Cache and tile the model and the data, never the visuals (owner, 2026-10-22: "Re architecture I believe we should
   cache model and data but not visuals. Currently we can view all stuff from all angles, times of day, boats birds etc.
   Let us NOT lose that casually, ok?"). Tiles, archives and caches hold geometry, attributes and source data. The page
   renders the picture live: any angle, any time of day and night, weather, styles, and live or simulated things (boats,
   aircraft, birds, wind). Do not bake light, shadow, sky or time into textures, do not use pre-rendered images or
   impostors in place of the model, and do not drop a capability for speed without the owner's agreement. Level of
   detail may simplify geometry far away; it must keep the same lighting and time behaviour.
   Images that are inputs to the renderer (satellite imagery tiles, facade photos, land-cover and other texture data) are
   data: they may be tiled and cached (the service worker caches them by hash); the renderer still lights them live.
   Outputs (rendered frames, baked light or sky, impostor pictures of the model) are not cached in place of rendering
   (owner, 2026-10-22: "it could cache bitmaps used as textures, or visual tiles for eg satellite imagery, no?").

## O1. Any locale worldwide (mission-critical)

| key result | baseline 2026-10-11 | target 2026-12-31 |
|---|---|---|
| KR1.1 Locale constants outside the UK adapter: BNG, OSTN15, ODN, the origin E 537,550 N 180,300, "Europe/London", UK-only sources | 21 tools import the box from `cwplans/tools/fetch-docklands.mjs`; 13 files hold 537550 / 180300; the port clock is London-only (`sky3.js fromLondon`); every tool is BNG | 0 in the core; a check script fails a push that adds one |
| KR1.2 Places outside the UK built by the same pipeline from worldwide open data (OSM / Overture buildings, Copernicus GLO-30 or ETOPO terrain, OSM water and coastlines) plus national open data where it exists, and shown in the port with the clock, sun and sky of the place. Places chosen by the owner, 2026-10-11 ("Places: old city Sarajevo. City hall / Spain https://leon.es/en/what-to-see/monuments/plaza-mayor/ / Leiden nl annies bar"): Sarajevo, Vijećnica (OSM way 23723663, 43.85917 N 18.43335 E, Europe/Sarajevo, bs / sr-Cyrl); León, Plaza Mayor (OSM way 46344511, 42.59732 N 5.56654 W, Europe/Madrid, es); Leiden, Annie's, Hoogstraat 1A (OSM node 2917023856, 52.15948 N 4.49123 E, Europe/Amsterdam, nl) | 0. **Now (2026-10-18, not yet scored):** León built by the same pipeline (`cwplans/tools/build-place-tiles.mjs --region leon`: OSM buildings, IGN MDT05 terrain, Catastro floors as computed heights) and shown on the globe with its local time (Europe/Madrid) in text, its sun from the page clock; https://danbri.github.io/londat/docklands/?ll=42.59732,-5.56654,1500&ht=0,55 ; test `docklands/test/place-check.mjs` all passed. Sarajevo the same way (Copernicus GLO-30 terrain, OSM buildings, Cyrillic names beside the Latin where OSM has them, local time Europe/Sarajevo): https://danbri.github.io/londat/docklands/?ll=43.85917,18.43335,1500&ht=0,55 ; Leiden on hold (owner, 2026-10-18) | all 3 shown, each with its own clock and sky; Sarajevo also in Cyrillic. Order (owner, 2026-10-12): after KR2.7 (world and UK skeleton) |
| KR1.3 Languages of the user interface (message catalogue, Intl for dates, times and units) | English only, text in the code | English plus 2, one of them right-to-left |
| KR1.4 Source adapters with a licence class per area in the data register | UK only, not marked as an adapter | UK adapter written down; a worldwide adapter; 1 more country adapter with its own open data |

## O2. A planet model, with maps and data worldwide (mission-critical)

| key result | baseline 2026-10-11 | target 2026-12-31 |
|---|---|---|
| KR2.1 A spherical (WGS84 ellipsoid) globe in the port, with continuous zoom from orbit to street level, a floating origin and depth precision that holds at both ends | flat BNG model of 42 km² and a coarse terrain ring; no globe | globe live; street level within 1 cm of the flat model in the Docklands; horizon and curvature correct |
| KR2.2 Worldwide base layers (coastlines, land and water, boundaries from Natural Earth, terrain from ETOPO 2022 or Copernicus GLO-90, place names), served as open tiles | none in the port (the atlas has none either) | all five worldwide; licences in the register |
| KR2.3 One tile format for all 3D content, ready for dense data (3D Tiles 1.1 with glTF, or another chosen by the owner) | box data as whole-area JSON (33 MB). **Now (2026-10-18, not yet scored):** first sets in the format: León and Sarajevo, 15 tiles each of 3D Tiles 1.1 + glTF (level-15 geodetic cells, ENU transform per tile, EXT_mesh_features ids), 5.2 and 5.5 MB, 0 errors in `3d-tiles-validator`; https://github.com/danbri/londat/tree/main/cwplans/docklands/data/places | format chosen; the Docklands box and its 80 building tiles served through it; one more London area added as tiles |
| KR2.4 Places that get richer with no code change: a measure of detail per tile (buildings with heights, trees, water, live sources) shown on a world map in the dashboard | not measured | the measure exists and is shown; rises in at least 10 tiles during the quarter |
| KR2.5 Tile hosting that can grow past GitHub Pages | Pages: 456 of 950 MB used | owner decision taken; tiles served from the chosen host |
| KR2.6 Knowledge-graph queries stay fast as the data grows (owner, 2026-10-12: "Is the speed and resource usage of the factoidal rdf db we use an issue? New version will be better" ... "Yes" to a key result). Search page https://danbri.github.io/londat/cwplans/kg/ , cold load, Chromium; the store with 10 times today's quads (a test store, or real London or region data) | 2026-10-07, @factoidal/core 0.7.1, 116,344 quads, 49 parts, 19.3 MB: start 2.1 s; the 11 views 0.4 to 3.4 s; a name search 2.4 s; one entity 5 to 7 s; engine 5.9 MB wasm; every call parses the 500 KB manifest; one-call cap 64 artifacts; a subquery plans every block; `check-factoidal.mjs` 12 of 12 STILL | at 10 times the quads: start under 2 s, views under 2 s, one entity under 3 s; parts follow the tile tree of KR2.3; re-measured after each Factoidal release (`node cwplans/tools/check-factoidal.mjs`, the store table in the cwplans-kgx skill) |
| KR2.7 Skeletal world and UK, so the visitor can fly round the planet and the UK without getting lost (owner, 2026-10-12: "replace Leiden with; skeletal coverage of world geography including planet-shaped world; also skeleton of uk with more open data vector and factoid content. Then leiden after we can fly around uk and world without getting totally lost"). Planet-shaped globe in the port with open world layers (coastlines, countries, admin regions, rivers and lakes, places, graticule; Natural Earth public domain, ETOPO terrain), and a UK skeleton from open data (OS open data under OGL: boundaries, names gazetteer, roads, rivers, rail; Wikidata CC0 factoids for places); search by name, a 'where am I' readout, home and fly-to; a smooth path from orbit to the Docklands model | none | orbit to street level without a break; any UK place and any country findable by name; each place card has facts with sources |

## O3. Universal access: any device, non-visual, and machine access (mission-critical)

| key result | baseline 2026-10-11 | target 2026-12-31 |
|---|---|---|
| KR3.1 Low-end devices: a reference device class (for example a 2021 mid-range Android phone with 4 GB, and an older iPhone) runs the default view at 24 frames a second or more, with quality tiers chosen by measured speed | only the owner's top-range iPhone; about 2.8 M triangles with every layer on; no tiers | tiers live; at most 1.5 M triangles by default; measured on 2 low-end devices |
| KR3.2 No 3D needed: a 2D map and a text view work without WebGL and WebGPU | the page needs WebGL 2 or WebGPU | both work; same deep links |
| KR3.3 Non-visual use: a text description of what is in view (places, buildings, water, live things, time and weather), updated when the view changes; screen reader and keyboard use of search, places, layers, cards and the clock | none; menus not audited | VoiceOver and TalkBack can do the 5 main tasks (find a place, hear what is there, change the time, turn layers on, read a card); axe-core: 0 serious issues; one test with a blind user, if the owner can arrange it |
| KR3.4 Machine access: a documented page API and WebMCP tools in the page (go to a place, describe the view, query features at a point, set the time, list and set layers, share a link); the same tools in the MCP server; an `llms.txt` for the site and its data | `__docklands3` (a test hook, not an API); the `docklands-view` MCP server (camera solve, render, landmarks; local only) | API documented and versioned; WebMCP tools where the browser has them; MCP server with the same tools; `llms.txt` live |
| KR3.5 Sound as an option (sonification of height, water and live things; spoken descriptions with the browser's speech) | none | one sound mode that a screen reader user can switch on |

## O4. Realism that is measured, not guessed

Owner: "the buildings without custom models are painfully flat and samey ... ultimately to get more realism"; the
calibration photo of 2026-10-11; "nudge ... towards a more realistic / impressionistically painterly ... style that
will adapt gracefully as 3DGS data becomes more broadly available".

| key result | baseline 2026-10-11 | target |
|---|---|---|
| KR4.1 Reference photos with a test of tones (`docklands/test/photo-tones.mjs`), every region within 0.08 luma | 1 photo (clear day); sky top -0.007, shaded trees +0.21, near water +0.09 | 3 photos (clear day, overcast, night), all regions within 0.08 |
| KR4.2 Faults seen in photo views closed by a rule that runs anywhere (not a patch) | F54 open (water under the quays) | F54 closed; tree height checked against LiDAR as a rule |
| KR4.3 Painted style accepted by the owner | "promising but too lossy" | accepted, or the owner names what is left |
| KR4.4 One open 3DGS capture of a place shown in the same scene and style, through the tile format of KR2.3 | splat layer exists (24 to 39 s a frame in software) | one capture, streamed as tiles |

## O5. Fresh live data with recent history

Owner: "We want the webapp to always have fresh air and boat data plus recent history" (2026-10-09). Worldwide
sources (aircraft and ships are worldwide already) must be built so that they can serve any place (O1).

| key result | baseline 2026-10-11 | target |
|---|---|---|
| KR5.1 Hourly cache runs in each 24 hours | 5 in the 28 hours to 08:53 UTC | at least 20 in every 24 hours for 4 weeks |
| KR5.2 Gaps over 15 minutes in the 5-minute live feed (aircraft, ships, METAR), shown on the dashboard | fresh at 17:13 UTC; gaps not measured | under 5 % of the time |
| KR5.3 Live layers that work for any place (by position, not by a fixed zone) | aircraft and ships for a 25 nm circle round the Docklands only | aircraft, ships and weather for any place in view |
| KR5.4 Time scrubber against history (AUDIT item 1) | PARTIAL (accepted) | PASS |

## O6. Open, traced data, ready to leave the prototyping phase

Owner: "record ALL our data methods in skills or other concrete committed artifacts" (2026-10-03); "don't waste good
info by burying it in our chatlogs" (2026-10-06); the data exception holds only "while in the scoping, planning and
prototyping phase"; "Flag it somewhere for review as we scale" (2026-10-04); the dataflow rule (2026-10-06).

| key result | baseline 2026-10-11 | target |
|---|---|---|
| KR6.1 `npm run check` passes on every push | passes: 734 files | 100 % of pushes, worldwide sources included |
| KR6.2 Register items marked "review", each with a written path for the end of the prototyping phase | 74 marked, no paths | 74 with a path; the owner decides the 5 largest |
| KR6.3 Open faults in the register | 14 open, 2 partly | at most 8 open; the rest fixed by rules |
| KR6.4 Every session ends with an activity-log entry and its lessons in a skill | most days | 100 % at each checkpoint |

## Reviews

| date | O1 | O2 | O3 | O4 | O5 | O6 | notes |
|---|---|---|---|---|---|---|---|
| 2026-10-11 (baseline) | 0.0 | 0.05 | 0.1 | 0.3 | 0.4 | 0.5 | O2: only the assessment and the coarse London terrain ring; O3: the MCP server and the test hook exist, but no non-visual or low-end support |
| 2026-10-21 (draft for the 2026-10-25 checkpoint) | 0.34 | 0.41 | 0.48 | 0.25 | 0.36 | 0.85 | per key result below; updated 2026-10-21 with the week's merged work: O1 with the place-aware clock, O3 with the no-3D path, O5 with the dashboard, O6 with the KR6.2 exit paths and KR6.3 at its target (8 open faults) |

### Checkpoint 1, draft scores (2026-10-20; final on 2026-10-25)

Evidence is on main unless stated. "Headless" means Chromium with software WebGL 2 in the cloud container, not a phone.

| key result | score | evidence |
|---|---|---|
| KR1.1 locale constants | 0.25 | `tools/check-locale.mjs` runs in `npm run check` and fails a push that adds a constant; 1,188 lines on 2026-10-20. 2026-10-21 (branch of the place-aware clock, not yet merged): the core's clock no longer names London (`fromLondon` gone from `main.js`, `sky3.js`, `carousel.js`; the London `Intl` formats of `main.js` gone; the London wall clock of the model's snapshot files is `adapters/uk.js fromUkWall`): category `timezone` 117 -> 98, `ui_en_gb` 91 -> 87, all 1,165 lines; baseline lowered |
| KR1.2 places outside the UK | 0.5 | León and Sarajevo by one tool (`build-place-tiles.mjs`): core, city ring (León 23,960 buildings, Sarajevo 57,680) and 35 km surroundings by level of detail, live on the globe with search, cards and local time in the text; Leiden on hold (owner, 2026-10-18). 2026-10-21 (branch, not yet merged; proposed 0.6): the page clock follows the view (`docklands/clockzone.js`, `docklands/geo/zone.js`): over León the time wheels, the clock label, sunrise and sunset on the wheel, night, `?t=` and `getView` / `describeView` are Madrid time (CEST), over Sarajevo Sarajevo time, in the model London time, the instant kept when the zone changes; elsewhere on the globe the zone of the nearest Natural Earth town of the same country (IANA tz, public domain), at sea the nautical zone, marked approximate; `?tz=` and `setTimeZone` / `set_time_zone` fix it. Deep link: https://danbri.github.io/londat/docklands/?ll=42.59732,-5.56654,1500&ht=0,55&t=2026-10-12T12:00 ; tests `docklands/geo/test/zone.test.mjs` (DST edges London, Madrid, Sarajevo), `docklands/test/zone-check.mjs` (wheels in Madrid time over León, London time at `?view=cw`) | 2026-10-21 (branch, not yet merged): Greater London by the same tool as a place of kind "blocks" (no core, no ground: on the globe's own heights): 1,050,005 OSM buildings (via Overture) in 2,394 3D Tiles, 84 MB, heights OSM 225,502 / Microsoft 189,445 / GHSL 685,028 (F55 counts), BT Tower named with its card; https://danbri.github.io/londat/docklands/?ll=51.4950,-0.1276,20000&ht=0,45 ; the UK by the same method estimated at 17.7 M OSM buildings, 1.3 GB (docs/planet-architecture.md 3b).
| KR1.3 languages | 0.1 | country names on the globe in 26 languages (`?lang=`); the interface is English only |
| KR1.4 source adapters | 0.4 | UK adapter; worldwide sources (Natural Earth, ETOPO, Copernicus GLO-30, OSM); Spain (IGN, Catastro) and Bosnia (waiver) adapters in the region configs |
| KR2.1 globe | 0.8 | live; orbit to street level; hand-over 0.000 m off with a 0.5 s fade; not measured on a phone |
| KR2.2 worldwide base layers | 0.7 | served as tiles in the terrain quadtree (2026-10-20): Sentinel-2 cloudless 2016 imagery (CC BY 4.0) worldwide to 2.4 km a pixel and to 19 m round the testbeds, Copernicus GLO-90 heights to 150 m round the testbeds (`world-base/`, 27.6 MB); Natural Earth 1:10m roads, rail, rivers, lakes, urban areas and GeoNames towns (`world-detail/`, 16.9 MB); OSM regional sets for north-west Spain and Bosnia (7.5 MB); terrain elsewhere still ETOPO 9.8 km; no 3D Tiles terrain format yet |
| KR2.3 one tile format | 0.5 | 3D Tiles 1.1 with glTF for the places, a quadtree with screen-space error and REPLACE refinement (validator: 0 errors, 0 warnings); hosting study done (`docs/hosting-options.md`); the Docklands model is cut into 54 cells of 1 km with three levels in the page (LOD step 4, 2026-10-21, `docklands/cells.js`; branch, not yet merged), not yet written as 3D Tiles: the plan and its blocker (runtime rebuild options need a GPU feature table) in `docs/planet-architecture.md` 3a | 2026-10-21 (branch): "one more London area added as tiles" done and more: all of Greater London as a 3D Tiles 1.1 quadtree (levels 10 to 14, REPLACE, merged blocks far, every building near; EXT_mesh_gpu_instancing boxes with int8 rotations, EXT_mesh_features ids for named buildings), 0 errors in 3d-tiles-validator; the Docklands box itself is still not a tileset (3a). Proposed 0.6.
| KR2.4 detail measure per tile | 0.0 | not started |
| KR2.5 tile hosting | 0.2 | study with measurements and a ranked recommendation (`docs/hosting-options.md`); owner, 2026-10-20: stay on GitHub Pages for now; same-origin range archive prototype (`?archive=`) |
| KR2.6 knowledge-graph speed | 0.0 | not started |
| KR2.7 skeletal world and UK | 0.7 | world and UK skeleton, search, "where am I", Home/North/World; owner: "Drag pinch twist all great" |
| KR3.1 low-end devices | 0.4 | LOD steps 1 to 4 (trees 818k to 56k triangles at cw; step 4, model cells, 2026-10-21, branch: frame triangles at cw 3.64 M to 2.16 M, whole area 4.58 M to 2.50 M, from 8 km 4.95 M to 2.78 M, GPU memory from 8 km 234 to 198 MB, JS heap +2 to +25 MB, taps unchanged), JS heap 483 to 277 MB at cw, globe and model memory freed (largest one-frame rise 113 to 153 MB, now 34 MB), service worker (repeat visit 161 to 8 requests at cw), parallel loading; all headless; no reference device measured |
| KR3.2 no 3D needed | 0.7 | 2026-10-21: verified without WebGL and WebGPU (headless, 390x844@2): text view, 2D map (canvas 2D: water, parks, roads, rail, buildings, names, the field of view) and a data-only page API (`docklands.no3d`); deep links `?ll=`, `?view=`, `?place=` and the share hash, moves write the 3D share hash; fixed a boot fault (the text view never opened by itself when the renderer failed); `docklands/test/no3d-check.mjs` all passed, API ready 0.7 to 1.1 s; https://danbri.github.io/londat/docklands/?no3d=1&view=cw ; not tried on a real device without WebGL; no layers or record card without 3D |
| KR3.3 non-visual use | 0.5 | `describeView` and `?describe=1` name places, buildings and local time; not tested with VoiceOver or TalkBack |
| KR3.4 machine access | 0.7 | page API 1.0.0, 10 WebMCP tools, `llms.txt`, the docklands-view MCP server |
| KR3.5 sound | 0.1 | spoken cards only |
| KR4.1 reference photos | 0.3 | one photo (Greenland Dock, clear day); top sky band within 0.08 luma |
| KR4.2 faults closed by rules | 0.5 | F54 closed in the port (terrain cut at water outlines); F55 (default heights) counted, not patched |
| KR4.3 Painted style | 0.2 | owner: "a bit janky and not v striking" / "Acceptable for now" |
| KR4.4 one 3DGS capture | 0.0 | not started |
| KR5.1 hourly cache runs | 0.15 | runs per UTC day now on the dashboard (https://danbri.github.io/londat/dashboard/#kr51, from the run files): 0 of the 13 whole days 2026-10-08 to 2026-10-20 reached 20 (3 to 7 a day, mean 4.9; 5 on 2026-10-20); the self-restarting loop (5 runs a job, then it starts the next job) is on main since 2026-10-21 (98a93a5d) and starts with the next scheduled run that GitHub fires |
| KR5.2 gaps in the 5-minute feed | 0.8 | measured on the dashboard (https://danbri.github.io/londat/dashboard/#kr52), 2026-10-21 03:35 UTC: files 2 to 3 min old; 0 % in gaps over 15 min (aircraft, last hour, 12 samples; ships, last 2 hours, 24 samples); METAR 48 reports in 24 h, none missing; last 7 days 0 % without a live-cache job running (86 job runs; an estimate: a job that runs but cannot fetch is not seen, and the files hold only 1 to 2 hours) |
| KR5.3 live layers for any place | 0.0 | aircraft and ships for the Docklands circle only |
| KR5.4 time scrubber | 0.5 | PARTIAL (accepted) |
| KR6.1 check on every push | 0.9 | `npm run check` passes: 765 files registered |
| KR6.2 "review" items with exit paths | 0.7 | 2026-10-21: all 88 review items (78 files, 2 branches, 8 sources) have an exit path in 14 groups by reason (`review_exit_paths` in `cwplans/data-register.json`; table: https://github.com/danbri/londat/blob/main/docs/review-exit-paths.md); `npm run check` counts items with no path and fails on a new one (0 without). Open: the owner decides the 5 largest groups (owner-photos, web-crawl, cwg-crawl, quotes, ais-scoping) |
| KR6.3 open faults | 1.0 | recount 2026-10-21 against code and data: 15 open before, 12 after (F9 closed as a duplicate of F48; F25 and F30 ruled in `tools/join-lds.mjs`). Then the 3 rules ranked first, each over all records (curation skill, "Recount of 2026-10-21", "Done"): F53 fixed (42,244 `openstreetmap.org/undefined/` links in `kgx/current.nq.gz` → 0; `key-model-buildings` v5 and operation `osm-urls-from-keys`), F49 fixed (`&#038;` in the CWG files and kgx → 0; `decodeAttr`), F4 and F7 rule in use (`tools/registry-placement.mjs`: 1,090 point-placed occupant links checked, 163 moved to their mall host or key building, 152 confirmed by a key, 40 out of buildings; audit SP-6 122 → 57, all 27 "other complex" in malls with no host outline; FSA occupants placed by a postcode-centre or shared point 0). Then rule 2 (one branch key across sources, `tools/registry-branch-key.mjs`, operation `merge-occupants-by-branch-key`): F46 and F20 rule in use: 181 merges (high 162, medium 19; 23 across buildings), 184 records absorbed, occupants 1,446 → 1,262, 36 uncertain pairs on a review list; audit ID-2 110 → 7 and new ID-6 (F46) 46 → 8, every remaining case on the review list. Open now: 6 (F12, F47, F50, F51, F52, F55), below the target of 8. Next: rule 5 (F47) |
| KR6.4 log and lessons each session | 0.8 | activity-log entries and skill sections for each change since 2026-10-11 |

