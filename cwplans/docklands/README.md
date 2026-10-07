# Docklands: London Bridge to Cody Dock

Live page: https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/
Canada Water corridor (the first, smaller model): https://danbri.github.io/glitchcan-minigam/magpie/cwplans/

A 3D model of the Thames from London Bridge to Cody Dock and from Limehouse to Greenwich, with the most detail at Canary Wharf, above and below ground. It is built from open data only. The page also loads live readings on request (tides, weather, air quality, line status, storm overflows, traffic cameras).

## Files

| file | what it is |
|---|---|
| `index.html` | the page: WebGL view, cut-away, floors, underground detail, live panel, text table of what is below ground |
| `data/area.js` | terrain, water, greens, 41,803 buildings, railways, roads, tunnels, places (5.4 MB, about 1.6 MB gzipped) |
| `data/under.js` | basements, indoor ways, points with a level, published structures |
| `facts.json`, `FACTS.md` | 360 cited facts about station depths, tunnels, towers, docks and ground, each with a quote from the page it came from |
| `vendor/earcut.min.js` | polygon triangulation in the browser (earcut, ISC licence, `vendor/earcut.LICENSE`) |
| `../data/sourced-levels.json` | the published levels the model uses (a hand-picked subset of `facts.json`) |
| `../feeds/` | 200 checked data sources and APIs for the area; browsable at https://danbri.github.io/glitchcan-minigam/magpie/cwplans/feeds/ |
| `../tools/fetch-docklands.mjs`, `osm-clip-docklands.mjs`, `build-docklands.mjs`, `lib.mjs` | the pipeline |

Rebuild (raw files are not committed except the Wikidata snapshots):

    node magpie/cwplans/tools/fetch-raw.mjs grid                               # OSTN15 grid
    node magpie/cwplans/tools/fetch-docklands.mjs                              # OSM extract (150 MB), 96 LiDAR tiles, EA flood defences, Wikidata
    node --max-old-space-size=6000 magpie/cwplans/tools/osm-clip-docklands.mjs  # about 1 minute
    node --max-old-space-size=8000 magpie/cwplans/tools/build-docklands.mjs     # about 30 seconds

## Area and coordinates

- Box: WGS84 −0.0950, 51.4740 to 0.0150, 51.5220; BNG E 532400–539900, N 176700–182300 (7.5 × 5.6 km).
- Local metres: x = E − 537550, z = −(N − 180300) (One Canada Square is near 0, 0; north is −z); y = metres above Ordnance Datum Newlyn.
- WGS84 → BNG through the OS OSTN15 grid. For live points the page uses a quadratic fit to that transform; its largest error over the box is 0.03 m.

## Sources and licences

| layer | source | licence |
|---|---|---|
| buildings, parts, water, greens, roads, railways, tunnels, indoor ways, stations, points with a level | OpenStreetMap, Greater London extract from download.openstreetmap.fr (2026-10-02) | ODbL 1.0, © OpenStreetMap contributors |
| ground (DTM) and surface (first-return DSM), 1 m | Environment Agency LiDAR Composite, WCS, 48 tiles of 1 km | Open Government Licence v3.0 |
| names, descriptions, heights, floors above and below ground | Wikidata SPARQL, items in the box | CC0 |
| tidal flood walls, embankments, flood gates with crest levels | Environment Agency Spatial Flood Defences (OGC API Features), 995 segments; owner and maintainer fields dropped | Open Government Licence v3.0 |
| published levels | see `../data/sourced-levels.json`: Wikipedia, Crossrail Learning Legacy (Arup paper), Canal & River Trust, Architects' Journal | each value is quoted with its URL |
| live panel | EA flood-monitoring API, Open-Meteo, London Air Quality Network, TfL Unified API, Thames Water storm overflow feed (ArcGIS) | see `../feeds/feeds.json` for each licence |

Geofabrik and Overpass were unreachable from the build container, so the OSM data comes from the openstreetmap.fr extract.

## What is measured, what is published, what is assumed

- Ground: LiDAR DTM, 7 × 7 m medians every 20 m.
- Building heights: the 90th percentile of DSM − DTM inside the footprint (39,415 buildings). An OSM `height` tag wins (1,917). OSM `building:levels` × 3 m + 1 m is used when the LiDAR has too few cells (163), or when the LiDAR shows less than half that height (61, shown amber). The second case means the building is newer than the LiDAR pass; these are spread over the area, with one group at Wood Wharf (Harcourt Tower and its neighbours) and others such as 40 Charter Street. 247 buildings have no data and get 6 m. Outlines with OSM building parts are drawn by their parts (772), using each part's `min_height`.
- Floors (Canary Wharf box): 676 buildings with an OSM `building:levels` or a Wikidata "floors above ground" value. The page spaces the rings evenly from base to roof, so the rings show the count, not the real floor heights.
- Water: OSM areas at the 25th percentile of the LiDAR inside them. The impounded docks come out at 3.3–4.2 m OD. The Canal & River Trust full impound level for West India and Millwall Docks is 4.23 m OD, which agrees. The tidal Thames is one tide state (about 2–3 m OD in the LiDAR pass). The live panel can redraw it at the current Tower Pier gauge level.
- Basements (102): OSM `building:levels:underground`, else Wikidata "floors below ground" (for example 8 Canada Square 4, Newfoundland 3, One Park Drive 2). Depth = storeys × the storey-height setting (default 4 m). This is an assumption, not a measurement.
- Indoor and underground detail (2,184 ways, 903 points): OSM features with a `level` tag, drawn at ground + level × storey height. At Canary Wharf this is the malls (levels −1 and −2), the Jubilee line platforms (−3) and steps and corridors down to −4. An OSM level is an index, not a height, so these positions are approximate.
- Open track and roads: OSM geometry at the LiDAR level (DSM on bridges and viaducts). Where a viaduct runs under a station roof or a building, the DSM sees the roof. Bridge points more than 20 m above the LiDAR ground are therefore replaced by interpolation from the nearest lower points on the same way (42 points, mostly the DLR through Canary Wharf). Within 120 m of Canary Wharf DLR station the drawn track now ranges from 8.1 to 23.6 m OD (before the fix: up to 41.1 m). Points up to 20 m above the ground are kept, so a low roof can still lift the track; no source for the viaduct height was found to set a better limit.
- Tunnels (572 chains): OSM tunnel ways joined between portals. The level is known at three kinds of control:
  - portals: the LiDAR level of the open track or road at the tunnel mouth
  - open cuts and shafts: points where the LiDAR ground is more than 6 m below its surroundings
  - published station levels from `../data/sourced-levels.json`:

    | place | level | source |
    |---|---|---|
    | Canada Water, East London line platforms | −5.6 m OD (11 m below ground) | Wikipedia |
    | Canada Water, Jubilee line platforms | −16.6 m OD (22 m below ground) | Wikipedia |
    | Canary Wharf, Elizabeth line platforms | −18.05 m OD | Arup paper, Figure 6 |
    | North Greenwich, Jubilee trains | about −19.7 m OD (25 m below ground) | Architects' Journal |
    | Cutty Sark, DLR platforms | −15.6 m OD (20 m below ground) | Wikipedia |

  Between two controls the track follows the straight line between them and dips by at most the "dip" setting, limited by the gradient setting. A chain with one published level and no other control stays flat at that level. A chain with no control lies at the "no measured point" depth below ground. These are model settings, shown in the page under "Model settings (assumptions)".
- Published structures: the eight Crossrail Place slab levels (Arup paper, Figure 6: platform −18.05 m OD, base slab −20.40 m OD, roof garden +17.10 m OD). The paper gives levels in mATD; the conversion OD = mATD − 100 m is inferred from the dock water level in the same figure (104.300), which matches the Canal & River Trust 4.23 m OD. North Dock is drawn as a water volume from its bed (−5.365 m OD, Canal & River Trust) to the full impound level.

- Flood defences: 995 EA segments (942 walls, 30 bridge abutments, 11 embankments, 8 engineered high ground, 4 flood gates), drawn from the LiDAR ground up to the surveyed crest level (`actual_ucl`, else `actual_dcl`, else the design level). Crests in the box run from 5.07 to 8.75 m AOD, median 5.62 m; most design levels are 5.23 or 5.28 m AOD. With the live data loaded, the page compares the Tower Pier tide with the lowest crest.

- Thames riverbed: UKHO INSPIRE bathymetry (Open Government Licence; not for navigation). It comes from the PLA multibeam survey of 2013–2017, as 6,028 soundings in the box, with point spacing measured at about 25 m (19 m at the HMS Belfast berth). The soundings are heights above Admiralty Chart Datum. They are converted to ODN with the PLA Tide Booklet 2025 values: chart datum is 3.20 m below ODN at London Bridge and 3.35 m at North Woolwich, interpolated by longitude. That interpolation is an approximation. Each sounding is drawn as one square, with no surface between soundings. Seen with the cut-away, or through the river. Files: `../registry/sources/pla/`.

## Registry data in the 3D view (added 2026-10-03)

- Tap a building at Canary Wharf: its registry record opens (heights from each source, floors, owner, homes, companies, postcodes, occupants by level, data-quality issues, link to the atlas), the building is outlined, and up to 40 occupants with a level are drawn as labels at ground + level × storey height. A level is a floor index, not a measured height.
- Picking: every building is drawn off screen in a colour that encodes its registry number; the pixel under the tap gives the building. The cut-away applies, so you can tap into the ground.
- The link from 3D buildings to registry ids is built by `tools/build-atlas.mjs` (`mi` in `atlas/data/atlas.json`): 1,188 model buildings belong to 1,079 registry buildings. Buildings outside the Canary Wharf box have no registry record (dark grey in the colour modes).
- "Colour buildings by": height, occupants, homes, registered companies, floors below ground, data-quality issues (square-root colour scale).
- Pins: heritage records (`registry/sources/museums/`), data-quality issues by severity (`quality/issues.json`), and crime for the latest month from police.uk (live, on request; police.uk locations are anonymised points, Open Government Licence).
- Satellite colours: the terrain coloured from the least cloudy recent Sentinel-2 true-colour image (13 August 2026, 0.01% cloud, 10 m), sampled once per terrain vertex. Rebuild with `NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/build-imagery.mjs 2026-06-01` (reads only the model window of the COG by HTTP range requests). Copernicus licence; not share-alike.

## Using the page on a phone (redesigned 2026-10-03)

The model fills the screen; nothing important sits below it.
The screen shows only the city, two round buttons at the top left and the attribution line (owner, 2026-10-03: "The city is the star not our endless word buttons").
- Menu button (top left): a drawer slides in from the left with the views (Whole area, Canary Wharf, Underground, Plan, Below ground) and three tabs: Layers, Route and About. The help text is in About. Close it with the cross, a tap outside it, Escape or a swipe to the left. On a phone, a view closes the drawer so you see the result.
- Search button: opens one search box for buildings (registry), labelled places and every routable place in the walking network (shops, platforms, exits). A result flies the camera there; a place below ground also cuts the model away just above its level.
- "Below ground" (in the menu) shows the depth gauge at the left edge. Drag the handle down to remove everything above that level (m OD), so the malls, platforms and tunnels show; the cross on the gauge closes it.
- Tap a building or a label: its record opens in a card at the bottom. Drag the card's handle to resize it, tap the handle to step through the sizes, or close it with its cross. Records have "Route from here" and "Route to here".
- Press and hold anywhere on the model: a menu offers "Route from here" and "Route to here" at the nearest mapped walkway or platform on screen (among the points not cut away). When both ends are set, the route is found at once.
- Map labels are plain text with a dark halo, not boxes.
- Two fingers: twist to turn the view (both styles). In pixel art, one finger moves, two fingers pinch to zoom and move up or down to tilt; with a mouse, right or Shift drag turns and tilts. The round arrow buttons at the top right turn by a quarter.
- A finger that lands on a label still joins the drag, pinch or twist; a tap on a label opens its record.
- Music in pixel art: the buildings themselves follow the bands (vertex shader: stretch, swirl, noise about each building's centre and base); in the map style the splat towers do.
- Music: "Play your own file…" is a button (a label for the file input, so phones open their file picker); the file plays only in the browser.
- On a wide screen the record card docks at the bottom right and the drawer does not dim the map.

## Ground images (added 2026-10-03)

Layers, "Ground image", drapes one of these over the terrain:
| choice | what | resolution in the page | built by |
|---|---|---|---|
| Aerial photo 2008 | EA vertical aerial photography, colour, 40 cm, flown 25 August 2007 to 18 October 2008 | 3 m a pixel, 2048 px texture | `tools/build-aerial.py rgb2008` |
| Night 2012 | EA night-time aerial photography, 20 cm, January to April 2012 | 3 m | `tools/build-aerial.py night2012` |
| LiDAR intensity 2020 | National LiDAR Programme return intensity, 1 m (how strongly each surface reflects the laser: roads dark, roofs and paint bright, sun glint on water) | 3 m | `tools/build-aerial.py intensity2020` |
| Satellite 2026 | Sentinel-2 true colour, 13 August 2026, 10 m, one colour per 20 m terrain point | vertex colours | `tools/build-imagery.mjs` |

All EA images are OGL v3.0 and come from the survey download service (`https://environment.data.gov.uk/tiles/collections/survey/<product>/<year>/<res>/<tile>`, tiles TQ3075, TQ3080, TQ3575, TQ3580; about 2.8 GB as ZIPs in `data/raw/imagery/`, not committed). The aerial photographs are ECW files: no decoder in the container's GDAL reads them, so `tools/native/ecw2ppm.c` is compiled against the ECW 3.3 SDK (see the `docklands-data-curation` skill, "Imagery"). The intensity tiles are GeoTIFF. Coverage limits: the 2008 photography has no tile north-west of Shadwell, and the west tiles come from a different flight (bluer); the night survey stops near Whitechapel Road. These gaps are black in the image.

Not used: EOX cloudless mosaics (CC BY-NC-SA), Google photorealistic tiles (key and caching terms). The EA also has a 2017 oblique photograph of the Thames Barrier (TQ3575, OGL), outside the model box.

## Facades, glow outlines and Gaussian splats (added 2026-10-03)

- Facades: buildings are drawn by their own shader with a window grid (3.6 m storeys, 1.8 m bays, from the distance along each wall) that fades with distance; with "Night 2012" about 40% of windows are lit. Roofs of buildings under 40 m take the ground image. The windows are drawn, not measured: no open facade imagery is used (Mapillary and Geograph are share-alike).
- Glow (Layers, "Glow: who is inside"): banks and finance in red, shops, food and drink, leisure and entertainment in their own colours. A building glows when a source states such an occupant: OSM tags (amenity=bank, office=financial, shop=*, ...), Wikidata P31/P452 of the occupant, the FSA business type, or the CWG directory section (`tools/build-categories.mjs`, `../registry/categories.json`). Names are never used to guess, and Companies House registered offices are not counted. Wikidata occupant links have no dates, so some are former tenants (marked "undated" in the record). Today: 18 buildings with finance occupants, 79 with shops, 144 with food and drink, 28 with leisure, 6 with entertainment. Known gaps: firms that no source places in a building (for example JPMorgan at 25 Bank Street) do not glow.
- The glow is drawn with the depth test (nearer towers hide it, as with real light) and once more faintly without it, so a hidden building still shows.
- Gaussian splats (Layers, "Gaussian splats"): `data/splats/cw-synth.splat.gz` holds 669,306 splats synthesised from this model by `tools/build-splats.mjs` (no training): ground discs coloured from the 2008 aerial photograph every 4 m, roofs every 4 m, wall discs per 3.6 m storey and 7.2 m of wall with a glass band in front. Standard 32-byte `.splat` records in model metres and axes, gzipped (4.5 MB; 20 MB unpacked); a standard 3DGS PLY copy is written to `data/raw/splats/` for other tools. The page draws them as instanced quads sorted back to front in a worker. "Splats only" keeps the model in the depth buffer without drawing it, so glow outlines, routes and labels pass in front of and behind the splats correctly. Needs WebGL instancing and gzip DecompressionStream (all current browsers). On SwiftShader (headless tests) one frame takes about 30 s; on a phone GPU it is real time but heavy: the set is sized for desktops first.
- Drone frames for training: the page has a free camera (`__docklands.setEye(eye, target, fovY)`), `?capture` (no overlays) and `renderNow()`; see `tools/drone-flight.mjs` and `tools/drone-capture.mjs`.

## Night (added 2026-10-04)

Layers, Style, "Night" (or `?night`): the map style as Canary Wharf looks from the river after dark. The owner's six night photos from the river (2026-10-03) are the reference; they are in the repo, in `reference/night-2026-10-03/` (kept with the owner's permission; the owner's copyright, not under an open licence), with the numbers measured from them (below).

- Lit windows (facade shader, `nightCol`): walls go dark and a share of the 1.8 m x 3.6 m window cells light up by what the building is used for. The use comes from the atlas index (`../atlas/data/atlas.json`): homes > 0 or an OSM type of residential, apartments, house: warm light (about 2700 to 3200 K), lit by flats of 3 windows, with a low-frequency noise so lit and dark flats cluster; about 5% of flats blue-white. Commercial, office, retail and similar: cool white, lit by whole floors (about a third) and by bands along a floor. Hotels: warm, more lit. Buildings with no registry record (outside the Canary Wharf box): a warm mix, fewer lit. Buildings under 30 m light fewer windows. The use and the roof top go to the shader as a fourth value of the per-vertex building attribute (`g.w` = use x 1000 + roof top in m OD), not in the vertex alpha byte. Far away a window is under one pixel: the shader uses the mean light of the windows (lit share x brightness; derivatives decide), first along a floor, so the lit floors of offices stay bands, then over all floors; not a dark average. Warm windows are tinted to the photos' #c1a573 (#f2c787 at full brightness). The facade and light shaders use `highp` where the GPU has it: in `mediump` the window hash `fract(sin(x) * 43758.5)` is 0 for 3,550 of 3,600 cells (checked with fp16 rounding in Node), and phone GPUs (Apple's at least) run `mediump` as fp16, so on the owner's phone no window was lit and the towers were black with red dots (2026-10-04). Works with photo facades on (the tile, dark, with the lit grid on top) and off. With a data colour mode the colours stay readable.
- Crowns: Newfoundland (cwb-0451) has a lit warm-white diagrid band in its top 13 m; One Canada Square (cwb-0413) has a pink-red band under the pyramid, the pyramid faintly lit from its base and a light at the apex; other towers over 90 m have a soft band at the top. Soft sprites round the two crowns add to the bloom pass.
- Red aviation lights (rule, not a survey): UK Air Navigation Order 2016 art. 222 asks for medium-intensity steady red lights on structures of 150 m or more, at the top and at intermediate levels no more than 52 m apart (CAA CAP 1210 / CAP 168 practice); towers near London City Airport below 150 m are often lit for aerodrome safeguarding, and the owner's photos show 2 to 4 small lights per roof from about 100 m. The page lights the roof corners (at most 4, where the outline turns by more than 35 degrees) of each building of 100 m or more above its ground, one roof per tower (a lower part inside a taller tower's outline is not lit; lights within 5 m merged): 84 roofs, and from 150 m also `ceil(h / 52) - 1` equally spaced intermediate levels with two opposite corners each: 587 lights in all (was 4,418 on 950 buildings over 45 m). Size: 0.6 m in the world, the core radius clamped to 0.8 to 1.4 CSS px and a halo of 3.2 times that; the clamp is in CSS pixels (the canvas is drawn at up to 2 device px per CSS px), so a 3x phone shows the same size as a 1x desktop (measured: median diameter 1.5 CSS px at 390 x 844 on DPR 1 and 3, 1.6 to 2.6 at 1600 x 900). Only roof lights within 150 m of water are reflected, fainter with the distance (exp(-d / 80 m)). `__docklands.AVL` holds the thresholds.
- Riverside lamps (1,449): every 16 to 26 m (at least 13 m apart) along the EA flood walls within 20 m of tidal water (3 m inland, where the Thames path runs) and along footpaths within 15 m of the tidal Thames or its creeks; none on inland roads or dock quays (they made the rows of white and yellow balls). Low-pressure sodium orange (65%) or warm white LED, 0.6 m, core 1.4 to 2.6 CSS px. Positions are drawn from these lines, not from a lamp survey. Trees within 10 m of a lamp are drawn again a little larger in an up-lit green (when the Trees layer is on).
- Water: near-black warm brown (#17120b). It marks its pixels in the stencil buffer; at night the LiDAR ground is pushed back in depth so ground lying at the water level no longer hides the water. Reflections are drawn after the scene, only where the stencil marks water, for the lights near the water: lamps, roof red lights within 150 m, the two crowns, and one column of window light for each building of 40 m or more within 15 m of the water plus its radius (160 columns; coloured by use, as bright as the mean window light). Each reflection follows the glitter path: from the water under the light (the bank) towards the viewer, to where the depression below the horizon is 0.16 (tangent) more than that of the mirror image about the water level (water slopes of up to about 5 degrees); brightest at the mirror image, fading towards the viewer (exp(-5.5 t)), broken into ripples that grow towards the viewer, 20 frames a second. Seen from the air the path is short, so the docks stay dark (the old rule stretched every streak to at least 85% of the way to the bottom of the view: the confetti over the docks and the bright smeared band at the foot of the skyline, where thousands of lamp and window streaks were squeezed together on the far river).
- Sky: near black at the top, a warm brown-grey glow at the horizon, a slight haze of the same colour on far buildings. The sky, the moon, the stars and the cloud are drawn by `sky.js` for the page clock: see "Sky, time, weather and tide" below. Splats are dimmed at night (they have no lit windows). Pixel art has no night; the Night chip is off there.
- Bloom: the frame is copied to a texture (`copyTexSubImage2D`), a bright pass averages it to a quarter of the width and height, a 9-tap Gaussian blurs it across and down, and it is added back (1.2 x). `__docklands.BL.on = false` turns it off.
- Lit signs: a short bar of cool white light near the top of the two longest faces of each office tower of 150 m or more (12 bars). Generic: no names or logos (trademarks), and which face carries a real sign is not in our data.
- Views (Layers, Views; or `?view=rotherhithe`, `?view=greenland`, `?view=pier`; each turns Night on). The owner took the photos "as Thames Clipper landed at Greenland Dock pier & shortly afterwards, a few metres west on promenade" (photos in `reference/night-2026-10-03/`). "Night from Rotherhithe" (`promenade-skyline-railing.jpg`): eye x -896, z 1150, 6.9 m OD (the Thames path a few metres west of Greenland Pier, 1.6 m above the walk by the river wall, crest 5.3 m OD), bearing 43.3 degrees from grid north, tilt -1 degree, 42 degrees horizontal field. "Night from Greenland Pier" (`promenade-skyline-bollard.jpg`): x -825, z 1160, 5.3 m OD (on the pontoon; the places list has Greenland Pier at x -830, z 1158), bearing 39.7, tilt +3.5, 44 degrees. "Night at Canary Wharf Pier" (`clipper-canary-wharf-pier.jpg`): on board at x -740, z 140, 6 m OD, bearing 83.6, tilt +11, 69 degrees. The field is horizontal, so a portrait phone sees the whole photo frame and more above and below. Method: the x positions in each photo of Newfoundland's diagrid crown, Landmark Pinnacle, One Canada Square's pyramid apex and One Park Drive's striped shaft (Newfoundland, One Bank Street and Landmark Pinnacle for the clipper photo) were read by eye; a grid search over eye position, heading and field of view minimised the bearing error (RMS 3.5 px of 2000 for the railing photo with the eye held on the promenade, 1.7 px for the bollard photo, whose best fit falls 6 m from the Greenland Pier point without being told where the pier is); side-by-side renders then fixed the tilt. The two Greenland photos are not 69-degree phone frames: only 41 to 45 degrees fit (a 2x lens or a crop); the clipper photo fits 69 to 75 degrees.
- Cost (headless SwiftShader on the CPU, median of 5 frames, 2026-10-04, after these changes): Rotherhithe view 1600 x 900 at DPR 1: day 1561 ms, night without bloom 1716 ms (+10%), night 1877 ms (+20%; bloom +161 ms, 9%); 390 x 844 at DPR 3 (780 x 1688 drawn) 1307 ms; 1000 x 750: 1214 to 1343 ms. Two sprite draw calls (about 2,900 lights and 1,800 reflections, against 11,000 before), a sky quad and the five bloom passes. Not yet measured on a phone GPU; the bloom passes there are a full-size copy and add plus three passes at a sixteenth of the pixels.

Measured from the photos (Pillow, medians of regions): sky at the top #101010 to #1f1e1c, sky just above the skyline #191919 to #3b3832 (one hazy photo #504c42); water between the streaks #191009 to #392c17; red lamps #d92821; warm windows #c1a573; pixels brighter than 55% luma are 64% warm and 36% neutral or cool (the neutral share includes overexposed warm windows). Facade area brighter than 35% luma on six tower and block crops: 3 to 12% (median about 9%); with window openings about 40% of a facade that is about 20 to 30% of windows lit. The same measure on the rendered towers from the river: 7 to 11%.

Calibration against the photos (in `reference/night-2026-10-03/`; `measure.py` in the session scratchpad: frames resized to 1000 px wide, luma = 0.2126 R + 0.7152 G + 0.0722 B of the sRGB values; red = R > 0.45 and R > 2 G and R > 2 B; warm = luma > 0.35, R >= G >= B, R - B > 0.12; skyline band = rows from 15% of the height to the bank line; points = red blobs of 2 px or more above the bank):

| measure | promenade-skyline-railing.jpg | render now (Rotherhithe view at x -886, z 1120) | render before | clipper-canary-wharf-pier.jpg | render now | render before |
|---|---|---|---|---|---|---|
| luma histogram %, bins <.05 / .1 / .2 / .35 / .5 / .75 / 1 | 25 / 44 / 23 / 5.1 / 1.4 / 1.1 / 0.6 | 32 / 50 / 11 / 3.7 / 1.5 / 1.3 / 0.8 | 54 / 11 / 23 / 4.5 / 3.7 / 3.4 / 1.2 | 9 / 20 / 35 / 27 / 4.9 / 3.2 / 1.6 | 48 / 34 / 10 / 2.6 / 0.6 / 2.5 / 1.9 | 46 / 32 / 8 / 4.7 / 3.0 / 4.8 / 1.4 |
| sky, top 12% (median) | #111110 | #0e0e0d | #1c1a17 | #2e2a1e (cloud) | #0b0b0b | #0d0c0c |
| red lights above the bank: points, median px | 36, 3.5 | 44, 2.0 | 120, 7 | 11, 2 | 24, 4 | 68, 10 |
| red pixels above the bank | 0.10% | 0.15% | 0.36% | 0.01% | 0.02% | 0.13% |
| warm / cool bright pixels above the bank | 2.5% / 1.5% | 4.4% / 1.7% | 6.3% / 1.8% | 4.4% / 5.3% | 3.1% / 3.7% | 3.3% / 3.4% |
| skyline band: mean luma, share brighter than sky + 0.04 | 0.121, 26% | 0.119, 21% | 0.138, 19% | 0.205, 38% | 0.105, 16% | 0.109, 25% |
| water: median luma, share > 0.3, red share | 0.076, 3.2%, 0.16% | 0.073, 1.9%, 0.02% | 0.043, 10.2%, 1.7% | 0.110, 13.6%, 0% | 0.080, 1.7%, 0.17% | 0.043, 18.4%, 2.9% |

The bollard photo (`promenade-skyline-bollard.jpg`, a longer exposure) against the Greenland Pier view: sky top #1f1f1d against #0b0b0b; red lights above the bank 72 points (0.24% of pixels) against 39 (0.11%); warm / cool bright pixels 5.3% / 1.8% against 3.0% / 1.2%; skyline band mean luma 0.207 against 0.100. The two Greenland photos bracket the model's red light count (36 and 72 points against 39 to 44): the count a photo shows depends on its exposure. Sky colours here are those of the sky shader as of 2026-10-04, which another piece of work now replaces.

Known differences from the photos: window light is drawn, not known (the real lit pattern changes every night), and at the photos' resolution windows are separate bright blobs, in the model sub-pixel speckle with its mean; the window grid is the same 1.8 m x 3.6 m everywhere; red lights still number more than the photos show (44 against 36 from Rotherhithe: the model lights every 100 m roof, and the rule, not a survey, places the intermediate levels); the LiDAR ground at Greenland Pier is foreshore at one tide state, so most of the water in front of the river wall and the pier is drawn as dark ground (the photos were taken near high water; the real tide level is separate work); the pier building and its lit sign are not in the model, and the pier photo was taken through a boat window under lit cloud (its sky, water glitter and haze are much brighter than any model view); reflections are of point lights and columns, not a mirror image of the facades; the moon is at its real place now, not where it was in the photos.

## Sky, time, weather and tide (added 2026-10-04)

Menu, "Sky" (or `?t=2026-10-03T22:30`, London wall-clock time; `?t=photo` for the solved photo time). One page clock for the
whole page: "now" (live, every 30 s) until a time is set; the address keeps the time. Code: `sky.js` (loaded before the main
script; the main script calls `DocklandsSky.draw()` behind the scene and `DocklandsSky.after()` at the end of a frame).

| part | how | library or data | licence |
|---|---|---|---|
| sun, moon, planets, rise/set, twilight, golden and blue hour | `Equator` + `Horizon(…, 'normal')` (refraction) for the viewpoint; `SearchRiseSet`, `SearchAltitude` (−4/+6 golden, −6/−4 blue, −6/−12/−18 twilight) | astronomy-engine 2.1.19, Don Cross, `vendor/astronomy.browser.min.js` | MIT |
| moon phase and bright limb | `Illumination` (fraction, phase angle), `MoonPhase`; the limb is the sun direction across the disc, as an angle from the top of the disc (zenith side), clockwise | astronomy-engine | MIT |
| Jupiter's moons | `JupiterMoons` offsets added to Jupiter's geocentric vector and placed round its refracted direction; magnitudes 4.6 to 5.7, so only "Sky as from a dark site" shows them | astronomy-engine | MIT |
| stars | 2,887 stars to V 5.5 (`data/sky/stars.json`), J2000 vectors rotated by `Rotation_EQJ_HOR` into model axes in the vertex shader, refraction added there; point size and brightness from V, colour from B−V, extinction by airmass | Yale Bright Star Catalogue 5th ed. (CDS V/50) | public domain (NASA ADC); cite |
| constellation lines | `data/sky/constellation-lines.json`, faint, only when stars to magnitude 1.5 or fainter show | d3-celestial (Olaf Frohn) | BSD-3-Clause |
| Milky Way | a band computed in the sky shader from galactic coordinates (`Rotation_EQJ_GAL`): Gaussian in latitude, brighter towards the centre, a dust lane, noise. Not an outline catalogue: d3-celestial's `mw.json` comes from J. R. Vieira's Milky Way Outline Catalog, which states no licence, so it is not used. Visible only when the star limit is fainter than 4.6 (a dark site) | own | — |
| satellites | OMM elements → `json2satrec`, SGP4 `propagate`, `ecfToLookAngles`; a point when above the horizon, sunlit (cylindrical Earth shadow, sun vector from astronomy-engine) and the sun 6° or more down; magnitude from range (ISS −1.3, Tiangong 0, others 4.0 at 1,000 km). Next ISS pass: 20 s steps over 3 days, above 10°, sunlit, dark sky | CelesTrak GP data (`data/sky/sats-2026-10-03.json`, live on request); satellite.js 7.1.0 subset bundled with esbuild (`vendor/satellite.min.js`) | CelesTrak: no licence stated, credit CelesTrak, at most one download per 2 hours (the page caches 2 h in localStorage); satellite.js MIT |
| weather | hourly, linear between hours: cloud low/mid/high drive three noise cloud layers at 1, 3.5 and 8 km (far away each tends to its mean cover; the EUMETSAT cloud mask places the cloud, below); visibility and humidity drive the haze and the star limit; wind moves the cloud with the clock | Open-Meteo (`data/sky/weather-2026-10-03.json`; live: forecast API for −85 to +15 days, archive API, without visibility, before that) | CC BY 4.0 |
| tide | Tower Pier (0007), Charlton (0003) and Silvertown (0001) 15-minute readings, faulty readings left out (F21), linear in time (gaps over 30 min: no value), then linear by distance along the Thames centreline (`data/river.json`) between the gauges; every vertex of the tidal Thames gets its own level (below) (`__docklands.setTidal`, the live panel's code path) and the night reflections move with it | EA flood-monitoring API (`data/sky/tide-2026-10-03.json`; live on request) | OGL v3.0 |

Rules and choices:
- Nothing is fetched until the visitor ticks "Fetch weather, tide and satellites for other times" (the same rule as the live panel). Without it the committed snapshots cover 3 and 4 October 2026; other times get a clear sky and no tide.
- Future tides: the EA publishes readings only. Published tide predictions (PLA tide tables, which come from UKHO) are not under an open licence, so the panel says "no prediction" (no level is drawn).
- Star limit (naked-eye limiting magnitude): 4.2 for London (Bortle 8 to 9), 6.3 for "a dark site"; twilight from −18° to −6° brings it to 2.2, the sun above the horizon to −4.5; the moon takes off up to 0.35 (city) or 1.2 (dark site) times its lit fraction; visibility under 12 km takes off up to 1.2. The photos show only a few stars: at the photo time the limit is 4.1.
- Night style (map) always shows the night sky (star limit as at −18°), whatever the hour; the sun disc is not drawn there.
- "Light and night follow the clock" (on with `?t=`, or after the time is changed): Night turns on when the sun is below −6°; by day the sky is drawn and `LIGHT` (the baked shading direction) follows the sun (elevation at least 7°), rebuilt at most when the sun moved 3°, 0.5 s after the change (terrain on the plain ground, greens and buildings). Ticking Night by hand turns this off.
- Directions: astronomy gives true azimuths; the model's −z is grid north. True north at the viewpoint comes from the derivative of the page's quadratic WGS84 fit (`area.js meta.geo`): 1.54° west of grid north at Greenland Pier. The old moon code ignored this.
- Map lines: from the viewpoint (Greenland Pier by default; Canary Wharf Pier, Masthouse Terrace Pier, One Canada Square, or the camera) solid lines to the sun and moon azimuths, dashed to their rise and set azimuths, on a 2D overlay (`#skyOv`, hidden in capture mode). Hidden when the camera is within 500 m of the viewpoint (from eye level they only confuse).
- Cost (SwiftShader on the CPU, 800 × 600, night photo view, median of 5, with readback): 1306 ms with the sky against 1117 ms without (+17%): two full-screen passes with noise, about 2,900 points and the constellation lines.

The photo time (method and numbers in `reference/night-2026-10-03/README.md`): the moon in `promenade-skyline-railing.jpg` and
`promenade-skyline-bollard.jpg` was measured (a circle through the lit limb and the two cusps), the camera was fitted to four
tower tops (Newfoundland, Landmark Pinnacle, One Canada Square horizontally only, One Park Drive) from eye points on the
river wall, and the moon direction from the fitted camera was matched to astronomy-engine. Result: 3 October 2026, 23:56 BST
(22:56 UTC), about ±4 min; the measured bright limb (227° from the top, clockwise) and lit fraction (46%) agree with the
computed ones at that time. Weather then (Open-Meteo, interpolated): cloud 15% (all low), visibility 14 km, humidity
87%, 15.4 °C, wind 1 km/h, no rain; Saturn 39° up in the south, the other planets down. Thames at Greenland Pier: −1.20 m OD
and falling 0.64 m an hour (Tower Pier −1.15, Charlton −1.27), about two hours before low water (Tower Pier −1.74 at 01:45 BST). The "Photo time (3 Oct)" button sets that time, Greenland Pier and the
Rotherhithe view.

Lessons:
- In a map view the camera looks down: the top of the screen is usually below the horizon. Below the horizon the sky shader
  draws distant hazy ground; clouds start above it. Check the sky from an eye-level view, not from the overview.
- `gl.finish()` does not wait in headless SwiftShader: time a frame with a readback (`toDataURL`) after `renderNow()`.
- Fit a moon in a phone photo by the limb and the cusps, not by the bright blob: the blob's centroid sits 0.4 radius towards
  the lit side, and bloom inflates it; a circle through the cusps and the limb fitted within 1.4 px.
- One Canada Square's apex in the model projects about 50 px (0.9°) above the photo's apex in both photos while the other
  tops agree within 10 px: its vertical was left out of the camera fit (horizontal kept). Investigated below ("One Canada
  Square's apex"): not the tower, the curvature, the eye or a lens distortion; no single pinhole camera fits the photo's
  landmarks better than about 0.5 degree.
- Node fetches through the agent proxy time out now and then (`UND_ERR_CONNECT_TIMEOUT` while curl works): the fetch tool
  retries three times.

Second pass (2026-10-04, the open issues):

- **Tide along the river.** The level is linear in chainage along `data/river.json` between the gauges with a reading at
  the time (Tower Pier 0007, Charlton 0003, Silvertown 0001), held flat beyond the end gauges; `__docklands.setTidal(v,
  field)` gives every vertex of the tidal water its own height (`field(x, z)`), and the night reflections use the level
  under the camera. The EA has no tidal gauge between Tower Pier and Charlton (station search, 15 km round the estate,
  2026-10-04: Westminster, Tower Pier, Charlton, Silvertown, the Barrier gauges, Barking): Greenland and Deptford are
  interpolated. Measured in the 3-4 October snapshot: Tower Pier minus Charlton from +0.36 m (ebb) to -0.53 m (flood);
  over the model's own river (west end held at Tower Pier) the level differs by up to about 0.3 m (21:00 BST on 3
  October: 1.73 m OD at the west end, 1.40 m at the east end; at the photo time -1.15 m and -1.26 m).
  Gauge faults: a reading is left out when its difference from the nearest other gauge departs by more than 0.45 m from
  the median of that difference over 2 h either side (fault F21: five Tower Pier readings, 4 October 00:00 to 01:15 UTC,
  0.4 to 0.9 m off). The LiDAR ground over the river is the survey's water surface (2.8 m OD); while a tide is set, the
  ground inside the tidal water (more than one 20 m cell from its edge) sinks to 0.8 m below the tide, so a low tide shows
  (before this, at the photo time the river was drawn as dark ground, with no reflections).
- **Moonlight** (Night only, sun below the horizon: full at -6 degrees, none above -0.8): strength = the moon's
  brightness relative to a full moon (10^(-0.4 (mag + 12.7)), astronomy-engine magnitude) x the light left after the
  airmass (0.25 mag per airmass) x up to 0.95 for low and mid cloud (Open-Meteo); a cool tint (0.62, 0.72, 0.95). Walls
  take it by the angle between their face and the moon (the face normal from the screen derivatives of the position,
  `OES_standard_derivatives`; without it roofs get the altitude term and walls a mean), roofs and the ground by the
  moon's altitude. The scale K = 0.16 is drawn, not measured: a full moon at 57 degrees (26 October 2026, 23:30) lifts the
  moonlit foreground from mean luma 12 to 19 (0-255) and the skyline rows by 1 to 3. At the photo time (moon 7 degrees up,
  46% lit) the strength is 0.017 of a high full moon: nothing shows, as in the photos.
- **The moon's glitter path**: one sprite through the lights' glitter-path shader, placed along the moon's azimuth so that
  the path starts where the depression below the horizon is tan(altitude) - 0.32 (at most 5 km away) and its brightest
  point is the mirror image at the moon's altitude; it ends 0.16 (tangent) below that, as for the lamps. Brightness
  3.2 x sqrt(relative brightness) x (0.4 + 0.6 x extinction) x cloud, at most 1; silver-white. At the photo time it adds
  8 to 11 (0-255) to the mean of the column under the moon (render, Rotherhithe view, 1600 x 900); the photos show a
  faint broad silvery column under the moon (railing photo: about +20 luma against the water beside it). Wave slopes
  are not modelled beyond the 0.16 rule; cloud only dims the path, it does not break it.
- **Star names and Messier objects** (Menu > Sky, on by default): 324 IAU-approved names (IAU WGSN catalogue, CC BY; joined
  by HR number to our 2,887 stars) and the 109 Messier objects of the NASA HEASARC table (US Government, no copyright;
  OpenNGC was not used: CC BY-SA). A star is named when its magnitude is within the star limit less 0.5 and no fainter
  than 2.5; a Messier object is shown when its integrated magnitude is 1.5 brighter than the star limit (an extended
  object needs a darker sky). From London at the photo time that leaves the brightest few stars and M 45; from "a dark
  site" about 40 names and the bright clusters. Labels are left out above 30, when they overlap, below 1 degree, and
  behind buildings: `__docklands.horizon(x, y, z)` gives the skyline from the eye (largest tangent of a roof edge per half
  degree of azimuth, from the outlines and roof heights; about 0.1 s, cached by 5 m of eye movement, at most every 0.4 s).
- **Clouds from the satellite**: the EUMETSAT Meteosat cloud mask (CLM, MSG 0 degree, every 15 minutes since September
  2020) through EUMETView WMS (CORS open). A Meteosat Derived Product is "Core" data: CC BY 4.0, free and unrestricted,
  redistribution allowed (EUMETSAT Data Policy, Articles 4 to 6); attribution "Contains modified EUMETSAT Meteosat data
  2026". The committed image is 23:00 UTC on 3 October (the slot nearest the photo time), 50.5-52.5 N, 1.6 W-1.6 E,
  256 px (about 0.9 km a pixel; the satellite pixel is about 3 x 5 km here). The page reads white pixels as cloud and
  raises each layer's Open-Meteo cover by 0.9 x (local mask - mean of the mask within 60 km), so the satellite places
  the cloud and Open-Meteo keeps the amount; the pattern moves with 2.2 x the 10 m wind for up to 90 minutes. Other
  times only with "Fetch" ticked (the mask appears about 25 minutes after its slot). At the photo time the mask shows
  6.8% cloud within 60 km (Open-Meteo: 15% low cloud). Not used: NASA GIBS (polar passes once or twice a day, no
  geostationary layer over Europe at night), Met Office DataHub imagery (account and DataHub terms), the Meteosat
  infrared images (only the hourly ones are Core; the mask is Core at every slot). Parallax (about 1.6 km north for cloud
  at 1 km) and the cloud height (the mask has none) are not handled; small cumulus under 3 km are missed.
- **Aircraft**: not shown, by licence. OpenSky Network: "Use of the REST API in any operational capacity - including
  integration into a live product, service, or automated system ... requires a previous written agreement"; adsb.fi:
  "personal, non-commercial use only"; ADS-B Exchange: commercial data products; adsb.lol: ODbL (share-alike: allowed
  for OSM only); airplanes.live: the terms page is behind a bot challenge and could not be read (checked 2026-10-04).
  The stub: Menu > Sky, "London City Airport approach paths": the extended centreline from each landing threshold (OSM way
  340355375, ODbL) rising at the published 5.5 degree glide path from 15 m over the threshold, a dot every kilometre,
  out to 12 km. Runway 09 approaches pass about 1 km south of One Canada Square at about 400 m.
- **One Canada Square's apex** (railing photo, 2576 x 1932, eye x -896, z 1150, 6.9 m OD; fit script in the session
  scratchpad, numbers here): with the four tower tops the pinhole fit (heading 43.35, tilt -1.35, roll -1.23 degrees,
  f 3319 px, rms 6.3 px) puts the model apex 50 px (0.87 degrees) above the photo's. The cause is not in the tower:
  (1) the pink band at the foot of the pyramid (213.8 m OD in the model, two corners read in the photo) is 40 to 46 px
  high too, so it is not the extrapolated apex; the pyramid itself is 65 px tall in the model and about 56 px in the photo
  (about 4 m, 0.17 degrees); (2) Earth curvature over 1.46 km is 0.17 m (0.007 degrees), less with refraction; (3) a 0.87
  degree error at 1,462 m would need the apex 22 m lower (Wikidata, OSM and the LiDAR top give 235 m above ground);
  (4) moving the eye: a free search over 800 x 800 m and 3 to 15 m OD gives at best rms 13 px, still Newfoundland +31 px
  and One Canada Square -17 px; (5) radial lens distortion: a free k1 gives an unphysical +0.39 and rms 14 px; (6) roll:
  the fit that leaves out One Park Drive puts Newfoundland, Landmark Pinnacle and both One Canada Square points within
  3.3 px rms but needs a roll of -4.8 degrees, and the railing posts near the image centre lean 1.0 to 1.9 degrees,
  which agrees with the four-tower fit (-1.2 to -1.5), not with -4.8. So the photo is not a single pinhole image of the
  model from one eye at the 0.5 degree level: Newfoundland and One Park Drive are about 0.5 degrees high and One Canada
  Square about 0.5 degrees low against a common camera. Candidates outside the model: the landmark points (One Park
  Drive's lit roof is below a darker, taller block; Newfoundland's lit crown may rise above the LiDAR roof), and the
  phone's processing (multi-frame night mode, crop; the files have no EXIF). Nothing in the model or the page view was
  changed. To settle it: a photo with EXIF (focal length, crop) or more landmarks of known height near the frame centre.
- **Phone GPUs**: `node magpie/cwplans/tools/check-fp16-shaders.mjs` captures every shader the page compiles (headless
  Chromium), counts uniform rows, varyings, samplers and attributes per program against the WebGL 1 minimums, and re-runs
  the risky maths in fp16. It found the glow pulse of the ground program (`mediump`, `time` = seconds since load) off by
  0.19 after 10 minutes and 0.37 after an hour on an fp16 GPU; `time` is now wrapped to 10 periods (largest error 0.018).
  Three programs declare more than 16 fragment uniform rows (the WebGL 1 minimum): buildings 25, the pixel-art pass 35,
  the sky 20 (counted without packing); phones offer far more (the minimum matters only for very old GPUs), but it is not
  checked on a phone. The skill lists what only a real phone can confirm.

Not done: real cloud heights and small clouds; aircraft (licence); a tide prediction for future times (no open source);
the moonlight's strength is drawn, not calibrated against a moonlit photo; the cause of the One Canada Square misfit.

## Drone flight and splat training frames (added 2026-10-03)

`tools/drone-flight.mjs` plans a smooth flight over the Canary Wharf estate and 300 m round it: centripetal Catmull-Rom splines through 127 eye waypoints and a second spline of look targets; turn rate under 10 deg/s, lateral acceleration under 1.5 m/s², along-track under 0.6 m/s²; yaw and pitch smoothed; 44 to 339 m above the ground, never nearer than 30 m to a building. The flight is 33.6 km, 51.5 minutes at 30 fps: a high overview loop, a spiral in, low passes over North and South Dock, orbits of Newfoundland and Landmark Pinnacle, Wood Wharf and the Canada Square towers, crossings over Heron Quays and Cabot Square, and a neighbourhood ring.

`tools/drone-capture.mjs` renders it in this page (`?capture`: photo style on the 2008 aerial photo) and writes a training set to `data/raw/drone/<run>/` (not committed): `images/`, `transforms.json` (nerfstudio, OPENCV without distortion, OpenGL camera-to-world in model metres and axes), `sparse_pc.ply` (182,830 points from the model), a COLMAP text model, coverage and pose checks, `preview.mp4`, `contact.jpg`. The run `cw-photo-480`: 480 frames at 960 × 540; 196 of the 197 estate buildings seen from 3 or more of 8 directions; projected roof outlines land within 0.34 px (median) of the rendered buildings. About 3 s a frame on SwiftShader.

    python3 -m http.server 8765 --bind 127.0.0.1
    node magpie/cwplans/tools/drone-flight.mjs --out path.json --svg plan.svg --coverage 480
    node magpie/cwplans/tools/drone-capture.mjs --run cw-photo-480 --frames 480

Found on the way: 28 model buildings belong to two registry records each, and the pick buffer answers with the later one (the parts of 8 Canada Square answer as an unnamed record): a registry duplicate class for the quality catalogue.

## Isometric pixel art (added 2026-10-03)

Layers, "Style": "Isometric pixel art" (or `?pixel`). An orthographic isometric camera (30 degrees down, turn in 90-degree steps with the arrows; drag moves, pinch or wheel zooms); the scene is drawn at one art pixel per 2 CSS pixels (1 when zoomed out beyond 700 m) and mapped to a 33-colour palette (`data/pixel-palette.json`: 24 colours extracted from a reference picture the owner supplied, 9 accents for trees, water and vehicles) with dark outlines where the brightness steps. Buildings take warm brick and stone colours, towers over 70 m blue and grey glass; windows are drawn on the art-pixel grid. Stylised trees line the minor roads and fill the parks (not surveyed trees). Animated and illustrative, not live data: walkers on the pavements, cyclists, cars, black cabs and red buses keeping left, now and then a police car, ambulance or fire engine with flashing lights; gulls; on the Thames (centreline from `data/river.json`, keeping to starboard) Thames Clipper catamarans, tourist boats, tugs towing waste barges, an aggregate barge and speedboats with wakes; swimmers in lanes in Eden Dock, the swimming area in Middle Dock opened in 2022 and relaunched as Eden Dock in October 2024 (https://www.timeout.com/london/news/canary-wharfs-open-water-swimming-spot-has-officially-reopened-070424, https://londonist.com/london/great-outdoors/open-water-swimming-canary-wharf-middle-dock).

## Music visualiser (added 2026-10-03)

Layers, "Music": the synthesised splats become a music visualiser. Each splat knows its building (`data/splats/cw-synth.groups.bin.gz`), and each building follows one of 24 frequency bands, from west (bass) to east (treble), so the skyline acts as a spectrum analyser. In the splat shader each building stretches up from its base with its band (Stretch), turns round its own axis, more at the top (Swirl), and shakes (Noise); loud bands also light up. The camera orbits slowly (switch off with "Orbit the camera"). Sources: three tracks by Kevin MacLeod (CC BY 3.0) streamed from Wikimedia Commons, which allows cross-origin analysis (`data/music.json`, credit shown while playing); your own file (played only in your browser); or the microphone (nothing is recorded or sent). Open with `#music` to go straight to the controls. The audio must start from a tap (browser rule). Limits: the splat order is sorted for the still model, so strong stretch can show small sorting errors; trained splat sets have no building groups yet, so they do not animate.

## Skyline by year (added 2026-10-03)

Layers, "Skyline by year": the buildings on the estate and 300 m round it take their measured height in each Environment Agency LiDAR surface model that flew them: 1999 (2 m), 2003 (1 m), 2007 (0.5 m), 2012 (0.5 and 1 m), 2018, 2020 and 2022 (1 m). The 2015 survey is left out: it flew under 20% of the box (its tile over the estate is 99% empty). Height = 90th percentile of the surface model inside today's OSM outline minus the model ground; a building under 3 m, or under a quarter of its height today (a cleared site with hoardings), is not standing that year. Checked against known dates: 8 Canada Square (2002) absent in 1999 and 209 m from 2007; Landmark Pinnacle 87 m in 2018 (under construction) and 234 m from 2020; One Park Drive measured 51 m in 2018, under a quarter of its 204 m, so it shows from 2020. The 2022 composite has no flight dates in its file names. Limits: today's outlines only, so buildings demolished before today do not appear; a building that a survey did not fly keeps today's height that year, drawn in slate blue (the note under the slider gives the count). Build: `bash magpie/cwplans/tools/fetch-dsm.sh` (1 GB into data/raw/dsm/, not committed) and `node --max-old-space-size=12000 magpie/cwplans/tools/build-skyline.mjs` (about 7 minutes). Output `data/skyline.json` with the survey dates.

## Walking network and routes (added 2026-10-03)

- `data/indoor.js` (built by `node magpie/cwplans/tools/build-indoor.mjs`, about 1 minute): the OSM walking network of the Canary Wharf area with each point on its level: 10,647 points, 13,044 links (277 stair, 46 escalator and 47 lift links), levels -4 to +2, and 789 named places (shops, food and drink, entertainment, services, platforms, entrances).
- How it is built: one network point per (OSM node, level); stairs and escalators are oriented by the levels their ends touch (or `incline`); lifts join their listed levels; walkable areas (platforms, concourses, indoor corridors and rooms) get a hub joined to every path end inside them or within 3 m of their edge; nodes that ways reach at two levels with no connector are joined and counted as faults.
- In the page (Route tab): "Show the walking network" draws it (pink indoor, orange stairs, yellow escalators, blue lifts); "Route from … to …" finds the quickest route (walking 1.3 m/s, stairs 0.5 m/s, escalators 0.75 m/s, lifts 25 s + 4 s a level), with a step-free option that uses lifts and ramps only, and lists the steps. A typed name with several branches resolves to the one nearest the start.
- Example: Jubilee line westbound platform (level -3) to Rituals (Jubilee Place, level -2): 192 m by escalator; step-free 284 m by lift.
- Stations: TfL's step-free topology (GTFS pathways, 2026-08-03) adds 68 station points and 51 lift links with TfL's level numbers; they join the OSM network at street level only, because TfL and OSM number levels below the street differently (audit NET-5). Routes read TfL's live lift faults (`api.tfl.gov.uk/Disruptions/Lifts/v2`) and avoid lifts that are out of service. Powered by TfL Open Data.
- Limits, measured by the audit (NET-1 to NET-5): 42 unjoined parts; 192 points where OSM joins two levels with no connector; 18 escalators and 11 lifts without their levels; 46 places with no corridor on their own level. Heights are ground + level × storey height. Estate and station plans are being collected to close these gaps.

## Known gaps

From `FACTS.md`, not found in any source fetched:
- the height of the DLR viaduct at Canary Wharf, Heron Quays and West India Quay
- platform depths at Wapping, Rotherhithe, Canning Town and Island Gardens
- depths of the Jubilee line under the Thames between stations (TfL refused tunnel alignments in FOI 1700-1213 on security grounds); Blackwall Tunnel inverts are known only from a desk study (about -20.4 and -24.4 m OD), not yet used
- the levels of the Canada Place, Cabot Place and Churchill Place malls, and the service roads under the estate
- present water depths of docks other than North Dock
- a numeric ground log at Canary Wharf itself

Jubilee line rail levels (added 2026-10-03): TfL FOI-0493-2223 gives the rail level in every Jubilee platform in London Underground Datum (OD - 100 m): Canary Wharf -15.6, Canada Water -13.3, North Greenwich -13.5, Bermondsey -12.5, London Bridge -23.2 (Northern line -19.6) m OD. They are tunnel controls now. They replace two rounded depths (Canada Water "22 m down", North Greenwich "25 m down"), which were 4 and 6 m deeper (audit AT-5). Source records for the whole underground estate: `../feeds/underground/README.md`.

The model also has these limits:
- The Jubilee line pit at Canary Wharf ("24 m deep", Wikipedia) has no stated reference level, so it is not used as a control.
- The Thames Tunnel and Rotherhithe Tunnel depths are given relative to high water, and no high-water level is sourced here, so they are not used.

## Live panel

The live panel sends no request until the visitor presses "Load live data". Each source sends CORS headers and needs no key (checked 2026-10-02, see `../feeds/feeds.json`):

- EA tide gauges 0007 Tower Pier and 0001 Silvertown (15-minute readings, m AOD)
- Open-Meteo current weather at Canary Wharf
- London Air Quality Network site TH4, Tower Hamlets – Blackwall
- TfL line status: Jubilee, DLR, Elizabeth line, Windrush, London Cable Car
- the Thames Water storm overflow feed for the box. The page reads status 1 as discharging, 0 as not discharging and −1 as offline.
- TfL JamCam traffic cameras in the box, shown as "cam" markers. Their stills are published by TfL for public viewing.

The feeds catalogue lists only official or openly licensed sources, and cameras that their owners publish. Its "excluded" section gives what was left out and why: directories of unsecured private cameras, people-search and face-recognition sites, personal social media, and records that name private individuals.
