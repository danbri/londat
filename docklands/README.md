# Docklands 3D, Three.js port (experimental)

Live: https://danbri.github.io/londat/docklands/ (top-level folder `docklands/`; owner, 2026-10-08: "Change it to serve
from top level /docklands/ folder, and merge")
The WebGL 1 page that it ports: https://danbri.github.io/londat/cwplans/docklands/

Started 2026-10-08. Owner, 2026-10-08: "Experimentally create a port of https://danbri.github.io/londat/cwplans/docklands/
in londat repo to use ThreeJS + its ecosystem (TSL etc.). Vendor latest threejs into third_party and for now duplicate
anything needing conversion (eg models), using 3js/ subdirs if that makes sense for the file system layout. We require
it to work on at least any WebGL 2 system but to be ready to exploit WebGPU for advanced performance, effects and other
improvements."

## How it works

- three.js r186 (npm `three` 0.186.1, published 2026-09-24), vendored in
  https://github.com/danbri/londat/tree/main/third_party/three (build files and all of `examples/jsm`, MIT). The import map
  in `index.html` maps `three`, `three/webgpu`, `three/tsl` and `three/addons/`. The Pages workflow publishes
  `third_party/three` (only that folder of `third_party/`).
- `THREE.WebGPURenderer`: the WebGPU backend where the browser has `navigator.gpu`, else the WebGL 2 backend. `?webgl`
  forces WebGL 2. The renderer in use is in Menu > About > Settings and in the line at the bottom left.
- Materials are TSL node graphs (`materials.js`): one graph compiles to WGSL on WebGPU and to GLSL ES 3.0 on WebGL 2.
- Tiers: on WebGPU, cascaded sun shadows (`CSMShadowNode`) and night bloom (`BloomNode` in a `RenderPipeline`) are on by
  default; on WebGL 2 they are off by default and can be switched on in the menu (`?shadows=1`, `?bloom=1`).
- No data are converted or copied. The page reads the WebGL page's own files in `../cwplans/docklands/data/`: `area.js`, `towers.json`,
  `roofs.json`, `materials.json` (with `?look=real`), `building-keys.json` (on the first tap), `building-models.json`,
  `tex/*.jpg`, `sky/stars.json`. The detailed building models load as glTF binary files from `../cwplans/docklands/models/*.glb`
  (already made by `cwplans/tools/build-building-models.mjs`, in the page frame with origin at the model's `t`).
- `roofs-layer.js` and `look-layer.js` of the WebGL page are reused unchanged: `build.js` keeps the vertex layout of
  `index.html` `MeshF` (5 numbers a vertex in `f`, 4 in `g`) and converts it to three.js attributes (`position`,
  `uw`, `col`, `gk`).

| file | what |
|---|---|
| `index.html` | page, import map, menu, card |
| `main.js` | renderer, camera and views, share hash, picking, card, labels, shadows, bloom, render loop |
| `build.js` | area.js decoding, buildings in 800 m tiles, towers, roofs, terrain, water, greens, rail and roads |
| `materials.js` | TSL: buildings (day window grid; night windows, crowns, haze), terrain, water (depth colour, ripples, fresnel, sky or mirror) |
| `water.js` | the water depth map (made at load time) and the water uniforms; `layers/water.js` is the mirror (TSL reflector) |
| `menu.js` | the drawer (tabs, closing, swipe), `ctx.ui` with a place for each control, the Go proxies and route finder, the corner credit and (i) |
| `carousel.js` | the time wheels at the top (time of day, day of the year) |
| `sky3.js` | sun and moon (Astronomy Engine), `SkyMesh`, stars (instanced sprites), the light rig |
| `about-extra.js` | Menu > About: the Live data box (londat cache or the sources' APIs, traffic camera markers) and the below-ground text |
| `test/menu-check.mjs` | headless check of the Menu map (every row by its click path), the four ways to close the drawer, and the time wheels |
| `test/load.mjs` | headless load test: two sizes, WebGL 2 or `--webgpu` in software (`node docklands/test/load.mjs` from the repository root) |
| `test/vz-check.mjs`, `test/vz-moves.mjs`, `test/mirror-cost.mjs` | vertical exaggeration and reflections: screenshots of the port and the WebGL page at the same view; numeric checks of the camera movers at `vz=3`; the mirror's frame cost |

## URL

`?view=` (area, cw, under, plan, rotherhithe, greenland, pier, greenlandday, plane: the WebGL page's numbers),
`?t=YYYY-MM-DDTHH:MM` (London wall clock), `?night`, `?webgl`, `?look=real`, `?ground=rgb2008|night2012|intensity2020`,
`?shadows=0|1`, `?bloom=0|1`, `?roads=0`, `?towers=0`, `?roofs=0`, `#at=x,z[,dist]`. The share hash is the WebGL page's
(`#v=1&c=tx,tz,ty,dist,yaw,pitch&n=1&t=…&id=osm:w…`), so a view opens on either page; Menu has a link to the same view
on the WebGL page.

Examples:
https://danbri.github.io/londat/docklands/?view=rotherhithe&t=2026-10-03T22:30 ,
https://danbri.github.io/londat/docklands/?view=cw&t=2026-10-08T13:00&ground=rgb2008 ,
https://danbri.github.io/londat/docklands/?view=greenlandday&webgl .

## Parity with the WebGL page

Status by feature (2026-10-08). "yes" = ported and tested headless on WebGL 2 and WebGPU; "partial" = ported in part (the note says
what is missing); "no" = not started. Layers are modules in `layers/` (`export default { id, label, on, init(ctx) }`);
`?layers=a,b` loads a layer that is not yet in the default list.

| group | feature | status | note |
|---|---|---|---|
| model | terrain, ground images | yes | ground sinks under water polygons |
| model | water, greens, rail, roads | yes | water: depth colour, ripples, fresnel, sun glint; mirror on both backends by default (`layers/water.js`, `?water=0|1`; sky by fresnel with `?water=0`) |
| model | buildings, towers, roof shapes, Realistic look, photo facades | yes | roofs checked exact (22,654); `materials.js` buildingMaterial: the Realistic day patterns (styles 0-7), the 32-slot photo facade atlas (`?facades=0`), night windows by style |
| model | detailed models (glTF) | yes | |
| model | windows on or off, vertical exaggeration | yes | `layers/model.js`: Windows (`materials.js` `U.win`: off gives the plain wall by day and no lit windows or shopfronts by night; photo facades and crowns stay; `?windows=0`); vertical exaggeration 1 to 5 (`?vz=`; `main.js` `setVz`: a y scale of 1 / vz in the camera's world matrix, so the scene stays in model metres and picking, labels, the share hash and the cut keep model heights). As the WebGL page's `vz` uniform (2026-10-09, `test/vz-check.mjs`, `test/vz-moves.mjs`): pixel art (`styles.js`: its orthographic camera gets the same wrapper, `ctx.vzCamera`), the water mirror (`layers/water.js`: the rigid camera mirrored in the plane at h x vz, then the scale), Drone and `&planecam` (eye and target x vz, as index.html `cam.eye[1] * VZ`), KML Go to view, fly-to and fit and the locate orbit (ty x vz; a KML Camera's eye at alt x vz, `kml-layer.js`), zoom to the cursor (the pointer ray in the exaggerated space), `Object3D.lookAt` (it read the scaled eye: the orbit target was off the screen centre before), the sky dome, stars, moon, planets, constellation lines and Milky Way (never exaggerated, as sky.js draws them with the view's rotation only: `sky3.js` `vzUndistort`) and the cloud deck (at 1 km in the unscaled view). The sun light needs nothing: the scene and its lighting stay in model metres, as the WebGL page shades in model metres. Not in a headset: `xr.js` shows the model at 1:1500 with its own relief (2.5x, the Relief button) and 1:1 in street mode under a rig with matrix W^-1; a second y scale would fight that relief and the real movement of the head, so `ctx.vzNow()` is 1 in a session. A photo view (`?view=rotherhithe`) with vz over 1 puts the eye under the water on both pages (its target is below the water, ty x vz) |
| 1 data layers | trees | yes | `layers/trees.js`, `tree-species.js`: all 81,875 trees by default (`?trees=near`); 43 species profiles from the GLA London Public Realm Trees (OGL) and OSM leaf tags, 20,480 inferred from the setting (flagged); seasons (leaf-out, autumn colours, bare crowns, cherry blossom), wind sway; LOD: full crowns within 380 m (9,000 nearest), a 10-triangle far form to 6.5 km: about 0.8 to 0.9 M triangles a frame |
| 1 data layers | terrain ring (Hills of London) | yes | `layers/ring.js`; receives no shadows (a CSM step at the shadow range); not faint in the cut-away |
| 1 data layers | flood walls, riverbed, floor plates | yes | `layers/walls.js`, `riverbed.js`, `floors.js` (floors off by default; on, the buildings go see-through); no tap card |
| 1 data layers | tunnels, basements, indoor, cut-away gauge | yes | `layers/under.js`: tunnel model, basements, indoor levels, slabs, North Dock volume, gauge, Underground view (`?view=under`, `?cut=`); the station cut-outs (with the station models shown, the OSM indoor floors and points inside each of the 2 station rectangles are left out and the tunnels stop at the box faces: stations-layer.js inside, outside, levelY), the yellow labels of published levels, a tap card for tunnels, indoor levels, basements, points and slabs, a fill light by night; with the cut on, a flat dark backdrop (#0f1215) in place of the day sky until the visitor sets the clock (wheels, slider, Day or night, `?t=`, a hash `t=`), as the WebGL page (`sky3.js` `setCutDark`) |
| 1 data layers | station models | yes | `layers/stations.js`: 127 parts, tap card, a dim night light; seen from below ground; gives `ctx.stationCut` (the cut-outs) to `layers/under.js` |
| 1 data layers | skyline years | yes | `layers/skyline.js`: slider, Play, `?year=` |
| 2 interface | search | yes | `layers/search.js`: registry, places, walking network; flies there; a place below ground cuts away |
| 2 interface | registry card (atlas, kg links), night use from the registry | yes | `layers/registry.js`, ctx.addCard; no occupant labels at their floors, no London Datastore facts |
| 2 interface | routes, press and hold, walking network | yes | `layers/routes.js`: same network and weights; 4 test routes equal to the WebGL page; Go > "Show the walking network" (`?walk=1`): every link but streets as coloured beams at the WebGL page's heights (vY: station floors while the station models show), lifts out of service now in red, cut away with the model |
| 2 interface | colour buildings by, building keys | yes | `layers/overlays.js` (6 modes, `?colour=`; no windows by night in a data colour), `layers/keys.js` |
| 2 interface | glow: who is inside; data on the model | yes | Layers > Who is inside, `layers/overlays.js`: the glow of the WebGL page (aura 4 m out to 6 m above the roof, lit edges, a faint pass through, the pulse; 11 kinds from the atlas index `cat`; `?glow=`); heritage, quality and crime pins (crime live from data.police.uk, OGL; `?pins=`), labels for heritage groups of 30 records or more, a tap card for each pin |
| 2 interface | drawer tabs | yes | reworked by task (owner, 2026-10-09): Views, Look, Layers, Go, Time, About; time wheels at the top; see "Menu map" |
| 3 night | windows, crowns, haze, stars, bloom | yes | `crown.js`: the halo colour by date (cwplans-crown-lighting rules); generic tower signs in `layers/nightlights.js` |
| 3 night | reflections | yes | `layers/water.js` (2026-10-09): the mirror (TSL reflector) on both backends by default (its cost on WebGL 2 in software was within the noise of the frame time: `test/mirror-cost.mjs`), streaks by seven vertical samples; the lit windows, lamps, aviation lights and the moon come back in it, as the WebGL page's reflection sprites (lights, window columns, the moon's glitter path). One plane, at the level of the water nearest to the eye (`water.js` `mirrorBody`: the Thames at the tide now, a dock at its own level); other water in view is out by twice the difference (the WebGL page uses one level, the Thames at the eye, for all its sprites). With the mirror off (`?water=0`), the moon's glitter path of index.html `moonGlitter` (`?glitter=0` off). The port reflects more than the WebGL page: the whole scene, by day too |
| 3 night | aviation lights, apex light, riverside lamps | yes | `layers/nightlights.js`: the WebGL page's rules and seeds; no tower signs |
| 3 sky | sun, moon, stars, clock, weather | yes | `sky3.js` (true north from the area.js geo, night by the geometric altitude, the moon disc with phase and limb), `layers/weather.js` (cloud, haze, rain and snow; Open-Meteo for wind and weather on by default since 2026-10-09, `?weather=0` switches it off; Realistic buildings on by default, `?look=0` for flat); checked by `test/clock-check.mjs` (sun and moon within 0.02 deg). The rest of the WebGL page's Sky tab: `layers/sky-extra.js` (planets and Jupiter's moons, CelesTrak satellites and the next ISS pass, constellation lines, IAU star names and Messier objects not behind buildings, the Milky Way band, the cloud mask as a cloud deck at 1 km (the WebGL page's low cloud layer: 5-octave value noise on 1.7 km, the mask placing it, both moving with the wind since 2026-10-09), London City approach paths, sun and moon azimuth lines from a viewpoint, Look at the moon or sun, the Sky panel rows) |
| 4 live | ships and AIS | yes | `layers/ships.js`, `ships-data.js`: the WebGL page's sources and privacy rule, cache history for past clocks, dead reckoning, navigation lights, wakes; `?ships=test` |
| 4 live | tide and foreshore | yes | `tide.js`, `layers/tide.js`: own harmonic prediction from EA readings (held-out rms about 0.2 m), the river at the tide level, the ground to the UKHO bed, walls vs mud and shingle |
| 4 live | water surface: wind, current, debris, wakes | yes | `layers/wind.js`, `debris.js`, `water.js`, `materials.js`: fetch-limited wind waves, a flow map from the tide rate, Kelvin wakes summed in the shader, reflection at walls; `?wind=`, `?current=`, `?wakes=test` |
| 4 live | piers, berths, berthed vessels | yes | `layers/piers.js`, `piers-models.js`: 275 piers and pontoons on the tide, HMS Belfast, 5 other vessels, simulated Clipper, ferry and tour boat calls |
| 4 live | aircraft (recorded, live, simulated) | yes | `layers/planes.js`, `planes-live.js`: by default RECORDED tracks from the 7-day adsb.lol history cache (ODbL; branch `adsb-cache`, `cwplans/tools/fetch-adsb-cache.mjs`, daily workflow `adsb-cache.yml`) for the clock's date, or the held day with the same weekday, at the same London time; live adsb.lol on request (blocked in browsers: no CORS header; `?adsb=<relay>`); SIMULATED London City procedures and hours, Heathrow streams and H4 helicopters as the fallback; `?adsbcache=<base>`, `?adsbrec=0` |
| 4 live | wildlife (simulated from records) | yes | `layers/wildlife.js`: 20 birds and the fox, weighted by NBN Atlas and GBIF records (CC0, CC-BY, OGL) |
| 4 live | overlays, river, locate, KML, building keys | yes | `overlay-kit.js` (shared builders, materials, taps, labels) and `layers/overlays.js` (bike docks, lift outages, cranes, H4 and EGR159, GLA outlines and venues, works in progress; `?ov=bikes,works`), `layers/river.js` (river buses, locks, PLA notices, swim water, moorings, ships; `?river=`), `layers/locate.js`, `layers/kml.js` (`?kml=`; screen-space lines with Line2NodeMaterial; the WebGL page's kml.js reused), `layers/keys.js` (OSM card with parts, kg, Wikidata); files load only when ticked. Not ported: the selected building in the KML export, the Tower Bridge note |
| framework | reveal sheet | yes | `reveal.js`: a frosted sheet with the layer drawn on it falls when a layer is ticked on; `?reveal=0` |
| 5 styles | pixel art, Line drawing, Vector CRT | yes | `styles.js`, `?style=pixel|lines|vectrex`; pixel art with the photo facade tiles, the measured facade colours (snapped to the palette), box trees and the 441 animated actors of the WebGL page (people, cyclists, traffic, river boats, gulls, swimmers); Vector CRT "Colour overlay" (`?crt=overlay`); the style note under Look > Style |
| 5 styles | splats | yes | `layers/splats.js`, `splat-worker.js`: own TSL renderer (Spark 2.3.1 and gaussian-splats-3d 0.4.7, both MIT, need WebGL), off by default, `?splats=with|only`, `?splatset=`; music switches to "only" in the map style; a full page with splats takes 24 to 39 s a frame in software |
| 6 other | Drone, plotter SVG, music | yes | `drone.js`, `plotter.js` (the WebGL page's plotter-svg.js, A4/A3/A2), `music.js` (24 bands, phone audio rules) |
| 6 other | WebXR | yes | `xr.js`, `layers/xr.js`: table 1:1500 with relief 2.5x (Relief button), street 1:1, the four panels, rays, grab and pinch, passthrough, the one-eye preview (`?xr=preview&go`); bar row 3 as xr-layer.js: Drone (Off, Copter, Plane, Boat, Tube, Walk, Under; stepped from the headset frame), Ride (your eye at the drone's, 1:1) or Watch (a cyan marker over the table), View (the page's named views; a photo view puts you at its eye), Wind (the wind layer and arrows); Photo (the left eye as a PNG, offered after Exit); on the WebGL 2 backend (three.js r186 WebXR on WebGPU needs an XR-compatible adapter at start and XRGPUBinding): from WebGPU it reloads with `?webgl&xr=1`; `test/xr-check.mjs` 26 steps with the mock (32 with `--webgpu`; all pass on 2026-10-09); not yet tried on a real headset |

## Menu map (2026-10-09)

Owner, 2026-10-09: "Ensure all functionality we had in original menus is available but through more intuitive structure.
Include a looping carousel at top for time of day, time of year." The drawer (`menu.js`) has six tabs, by task: **Views**,
**Look**, **Layers**, **Go**, **Time**, **About**. It closes by its cross, a tap on the dimmed map, Escape, or a swipe left
of more than 70 px; on a phone (under 900 px) a view button closes it; at 900 px and wider the map is not dimmed. The tab
last used opens next time (browser storage). Layer modules put controls through `ctx.ui` (`section`, `toggle`, `slider`,
`note`, `host`): the place of each layer is `MENU_PLACE` in `main.js` (or `menu:` in the module); `ctx.ui.tab(place)`
switches for a few controls and returns the previous place (`layers/overlays.js` puts "Colour buildings by" in Look). A
layer's own on/off switch comes first in its block. Groups with nothing in them are hidden.

The **time wheels** (`carousel.js`) are two looping strips under the round buttons: the time of day (24 h, wraps from 23:59
to 00:00 on the same date; night, twilight and day shading and sunrise and sunset from Astronomy Engine; snaps to 15
minutes, 5 on a wide screen) and the day of the year (wraps from 31 December to 1 January of the same year; months, moon
phases, the daily tide range from the tide layer's harmonic prediction with S spring and N neap marks). Drag or flick
(inertia), tap a point, or arrow keys (Shift: hours or weeks). "Now" returns to the time now; the cross hides them (Menu >
Time > "Time wheels at the top" shows them; `?wheels=0`). A clock set with the wheels, the hour slider or Day or night
goes into the share hash as `t=` (and replaces `?t=`). Test: `node docklands/test/menu-check.mjs` (every row below by its
click path at 390 and 1280 px, the four ways to close, the wheels).

Defaults (owner, 2026-10-09): Realistic buildings, Open-Meteo wind and weather (`?weather=0` off), every Data overlays
part except Helicopter route H4 (`?ov=` for none) and every River part (`?river=` for none) are on; My KML feeds stay off. Floors (see-through) and
Gaussian splats stay off: Floors turns the realistic buildings to glass, and splats take 24 to 39 s a frame in software.

"WebGL only" rows are controls of the WebGL page (https://danbri.github.io/londat/cwplans/docklands/) that the port does
not have yet; Views > "This view in the WebGL page" opens them at the same view.

| was (WebGL page drawer, or the port's old one long list) | now (tab > control) |
|---|---|
| views: Whole area, Canary Wharf, Underground, Plan | Views > Places |
| views: Night from Rotherhithe, Greenland Pier, Canary Wharf Pier; Greenland day; From a plane (port) | Views > Photo views |
| "Open this view in the WebGL page" (port) | Views > This view in the WebGL page |
| Share this view (nav.js) | Views > Share this view (system share sheet on a touch screen, else the clipboard; the link shows under the button) |
| Below ground button (depth gauge) | Layers > Below ground > Depth gauge; Views > Underground opens it too |
| Layers > Style (Map, pixel art, line drawing, vector CRT) | Look > Style (same as the selector at the top right) |
| Night | Time > Day or night (and the moon button at the top left) |
| Realistic buildings | Look > Realistic buildings (on by default since 2026-10-09; `?look=0`) |
| Crown halo colour by date | Layers > City > Night lights > Crown halo colour by date |
| Colour overlay (vector CRT), style notes | Look > Style ("Colour overlay" shows in Vector CRT, `?crt=overlay`; the style's note under it) |
| Ground image: plain, aerial 2008, night 2012, LiDAR intensity 2020 | Look > Ground |
| Ground image: Satellite 2026 | Look > Ground > Satellite 2026 (`?ground=s2`; `layers/model.js`) |
| Buildings: solid, see-through, hidden | Look > Buildings (`?bmode=solid|ghost|off`; `layers/model.js`); Layers > Below ground > Floors also makes them see-through |
| Colour by (height source, height, occupants, homes, companies, below ground, quality) | Look > Colour buildings by |
| Show: Windows, Detailed models, Roof shapes | Look > Detailed models (glTF), Roof shapes, Windows (`?models=0`, `?roofshapes=0`, `?windows=0`; `layers/model.js`) |
| Show: Labels | Layers > City > Place names; station (bold orange), district (italic) and dock names: Layers > City > Station, district and dock names (`layers/placenames.js`) |
| Show: Roads | Layers > City > Roads |
| Show: Underground | Layers > Below ground > Below ground (tunnels, basements, gauge, storey and tunnel settings) |
| Show: Floors | Layers > Below ground > Floors |
| Show: Flood walls, Riverbed | Layers > Water and river |
| Show: Trees (and all trees in the box) | Layers > City > Trees |
| Show: Photo facades | Look > Photo facades |
| Hills of London | Layers > City > Hills of London |
| Gaussian splats (off, with the model, only; splat set) | Look > Gaussian splats |
| Music (track, own file, stretch, noise, swirl, orbit) | Look > Music |
| Glow: who is inside | Layers > Who is inside (11 kinds, `?glow=finance,shop`; `layers/overlays.js`) |
| Data on the model: heritage, quality, crime | Layers > Who is inside (`?pins=heritage,quality,crime`; `layers/overlays.js`); also Look > Colour buildings by > data-quality issues |
| Live state: bike docks, lift outages, cranes, H4 and EGR159 | Layers > Data overlays |
| London Datastore: conservation areas, open space, wharves, venues | Layers > Data overlays |
| Works in progress | Layers > Data overlays |
| Skyline by year (slider, play) | Layers > City > Skyline by year |
| Shape: cut away above | Layers > Below ground > Below ground (cut slider; the depth gauge) |
| Model settings: storey height, tunnel dip, gradient, depth | Layers > Below ground > Below ground (sliders); vertical exaggeration: Look > Model settings (`?vz=1` to `5`; `layers/model.js`) |
| Key to colours | Look > Key to colours (`layers/model.js`) |
| Station models | Layers > Below ground > Station models |
| River (river buses, locks, notices, swim water, moorings) | Layers > Water and river > River |
| Piers and berthed vessels | Layers > Water and river |
| Ships (AIS), live | Layers > Live |
| Aircraft (recorded or simulated), Birds and foxes (simulated) | Layers > Simulated |
| Recorded aircraft (adsb.lol history, port only) | Layers > Simulated > Aircraft > Recorded aircraft |
| Live aircraft (adsb.lol, port only) | Layers > Simulated > Aircraft > Live aircraft |
| Night lights (aviation, riverside lamps) | Layers > City |
| My KML | Layers > My KML |
| Water mirror (reflections) | Look > Water mirror |
| Search (round button) | Go > Search (and the round button) |
| Route tab: from, to, swap, step-free, find | Go > Route on foot (and press and hold on the model) |
| Route tab: show the walking network | Go > Show the walking network (`?walk=1`; `layers/routes.js`) |
| Drone | Go > Move > Drone |
| My location (round button at the bottom right) | Go > Move > My location (and the round button) |
| Headset (WebXR button) | Go > Move > Headset |
| Sky tab: clock, hour slider | Time > Clock; the time wheels |
| Sky tab: sun, moon | Time > sunrise, sunset, moon line; the wheels |
| Sky tab: satellites, constellations, star names and Messier objects, Milky Way, dark site, cloud mask, planets list, next ISS pass, twilight and golden hours | Time > Planets, satellites, constellations, Milky Way (`layers/sky-extra.js`; `?sky-extra=0`, `?skydark=1`, `?skyfetch=1`): its switches, and "Sky now" for the panel rows |
| Sky tab: viewpoint, sun and moon lines on the map, London City approach paths, Look at the moon or sun, Photo time, Fetch | Time > Planets, satellites, constellations, Milky Way (`layers/sky-extra.js`); weather and tide are the port's own (Time > Weather, Tide) |
| Tide (level, rising or falling, next high and low, springs or neaps) | Time > Tide |
| Weather (cloud, haze, rain; Open-Meteo for other times) | Time > Weather |
| Wind, current, floating debris | Time > Water surface |
| About: links (atlas, knowledge graph, data notes) | About |
| About: how to use it | About > How to use it |
| About: your location text, Live data box, below ground text | About > Your location; About > Live data (`about-extra.js`: tide, weather, air, lines, overflows from the londat cache or, with "Live: ask the sources directly", the sources; "Tidal Thames at the Tower Pier level" sets the clock to now and the tide layer to EA readings; traffic camera markers on the model from page load, `?cams=0`); About > Canary Wharf below ground (text); the depth gauge and pixel art help under How to use it |
| Renderer: shadows, bloom, draw every frame, backend (port) | About > Settings |
| Plotter (SVG for a pen plotter) | About > Plotter |
| Credits and data licences; the OSM corner credit folds to (i) after 5 s or the first touch | About > Credits; the (i) button and "credits" in the corner open it |

## Water (2026-10-08)

Owner, 2026-10-08: "the thames and greenland south dock look blotchy and shallow, can we make it look more watery".
- **Depth.** `water.js` `waterDepth()` makes a 750 x 560 depth map (10 m cells over the model extent, R8 texture, 0.1 m a
  step, linear filtering, land 0) at load time (70 to 400 ms headless). Depth = the polygon's level (area.js `w.level`) minus
  the bed. Tidal polygons: the UKHO soundings (`A.riverbed`, m OD), inverse-distance mean within 30 m (42,465 of 50,790
  water cells); tidal cells with no sounding (foreshore, creeks): distance to the shore / 8, 0.5 to 4 m (a stated
  default). North Dock: the published bed, -5.365 m OD (`data/under.js`, Canal & River Trust). Other docks and basins:
  **10 m (a stated default; no published bed level for Greenland Dock, South Dock or the others)**. Ponds, lakes and
  fountains: 2 m (a stated default). Mean depth 8.3 m, deepest 17.4 m. The water mesh is not densified (4,077 vertices,
  3,819 triangles): the material samples the map by world position.
- **Material** (`materials.js` `waterMaterial`, TSL, both backends): colour from shallow sRGB (0.33, 0.45, 0.43) to deep
  (0.04, 0.14, 0.17), 1 - exp(-depth / 3.5 m); ripple normals from two octaves of value noise moving with `time`
  (wavelengths about 6 m and 1.8 m; they fade out from 40 to 450 m); fresnel (Schlick, F0 = 0.02); the sun's glint is
  the directional light's specular at roughness 0.05 (wider far away). The reflection is added as emitted light x fresnel.
- **Reflection.** `layers/water.js` puts one TSL `reflector()` (0.35 of the screen size, no bounces) in a horizontal
  plane at the level of the water nearest to the eye (`water.js` `mirrorBody`, re-chosen when the eye has moved 10 m:
  the tidal Thames at the tide now, a dock at its own level, 3.3 to 4.2 m OD; ponds are left out), distorted by the
  ripples. Other water in view is out by twice the difference of the levels. At night the lit windows come back in the
  water and feed the bloom. On by default on both backends since 2026-10-09 (WebGL 2 had only a sky gradient by fresnel);
  `?water=0` (or Look > "Water mirror") turns it off. The mirror draws the scene a second time; in software the cost was
  within the noise of the frame time (`node docklands/test/mirror-cost.mjs`: 3.1 s a frame off, 3.2 s on at
  `view=rotherhithe` with trees; 1.7 to 2.3 s either way at `view=cw`). With the mirror off, the moon's glitter path
  (index.html `moonGlitter`) is drawn on the water.

## Ported and not ported (2026-10-08)

Ported: terrain (with the three ground images), water (the ground sinks under water polygons), greens, open-air rail
and roads, all 41,803 buildings with the measured towers, the roof shapes and the Realistic colours, the Pacific Tavern
glTF model, the photo views, the clock with sun, moon and stars, night windows and crowns, picking with the OSM card,
place labels, the share hash.

Not yet ported: tunnels and below ground, station models, ships and AIS, river and tide, splats, pixel art, line
styles, photo facades, the night light sprites (aviation lights, lamps) and their reflection sprites, routes, search, KML, Drone,
plotter, wind, music, WebXR, the One Canada Square crown campaign colours.
