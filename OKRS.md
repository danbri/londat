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
