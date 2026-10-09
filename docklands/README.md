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
  forces WebGL 2. The renderer in use is in Menu > Renderer and in the line at the bottom left.
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
| `sky3.js` | sun and moon (Astronomy Engine), `SkyMesh`, stars (instanced sprites), the light rig |
| `test/load.mjs` | headless load test: two sizes, WebGL 2 or `--webgpu` in software (`node docklands/test/load.mjs` from the repository root) |

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
| model | water, greens, rail, roads | yes | water: depth colour, ripples, fresnel, sun glint; mirror on WebGPU by default (`layers/water.js`, `?water=0|1`), sky by fresnel on WebGL 2 |
| model | buildings, towers, roof shapes, Realistic look, photo facades | yes | roofs checked exact (22,654); `materials.js` buildingMaterial: the Realistic day patterns (styles 0-7), the 32-slot photo facade atlas (`?facades=0`), night windows by style |
| model | detailed models (glTF) | yes | |
| 1 data layers | trees | yes | `layers/trees.js`, `tree-species.js`: all 81,875 trees by default (`?trees=near`); 43 species profiles from the GLA London Public Realm Trees (OGL) and OSM leaf tags, 20,480 inferred from the setting (flagged); seasons (leaf-out, autumn colours, bare crowns, cherry blossom), wind sway; LOD: full crowns within 380 m (9,000 nearest), a 10-triangle far form to 6.5 km: about 0.8 to 0.9 M triangles a frame |
| 1 data layers | terrain ring (Hills of London) | yes | `layers/ring.js`; receives no shadows (a CSM step at the shadow range); not faint in the cut-away |
| 1 data layers | flood walls, riverbed, floor plates | yes | `layers/walls.js`, `riverbed.js`, `floors.js` (floors off by default; on, the buildings go see-through); no tap card |
| 1 data layers | tunnels, basements, indoor, cut-away gauge | partial | `layers/under.js`: tunnel model, basements, indoor levels, slabs, North Dock volume, gauge, Underground view (`?view=under`, `?cut=`); no station cut-outs, level labels or tap card; faint ground almost invisible at night |
| 1 data layers | station models | yes | `layers/stations.js`: 127 parts, tap card, a dim night light; seen from below ground |
| 1 data layers | skyline years | yes | `layers/skyline.js`: slider, Play, `?year=` |
| 2 interface | search | yes | `layers/search.js`: registry, places, walking network; flies there; a place below ground cuts away |
| 2 interface | registry card (atlas, kg links), night use from the registry | yes | `layers/registry.js`, ctx.addCard; no occupant labels at their floors, no London Datastore facts |
| 2 interface | routes, press and hold | yes | `layers/routes.js`: same network and weights; 4 test routes equal to the WebGL page |
| 2 interface | colour buildings by, building keys | yes | `layers/overlays.js` (6 modes, `?colour=`; no windows by night in a data colour), `layers/keys.js` |
| 2 interface | drawer tabs | no | the menus are to be reworked first (owner, 2026-10-08) |
| 3 night | windows, crowns, haze, stars, bloom | yes | `crown.js`: the halo colour by date (cwplans-crown-lighting rules); generic tower signs in `layers/nightlights.js` |
| 3 night | reflections | partial | WebGPU mirror (TSL reflector, one plane), streaks by seven vertical samples; WebGL 2: sky by fresnel only (mirror with `?water=1`) |
| 3 night | aviation lights, apex light, riverside lamps | yes | `layers/nightlights.js`: the WebGL page's rules and seeds; no tower signs |
| 3 sky | sun, moon, stars, clock, weather | yes | `sky3.js` (true north from the area.js geo, night by the geometric altitude, the moon disc with phase and limb), `layers/weather.js` (cloud, haze, rain and snow; Open-Meteo only on request, `?weather=meteo`); checked by `test/clock-check.mjs` (sun and moon within 0.02 deg) |
| 4 live | ships and AIS | yes | `layers/ships.js`, `ships-data.js`: the WebGL page's sources and privacy rule, cache history for past clocks, dead reckoning, navigation lights, wakes; `?ships=test` |
| 4 live | tide and foreshore | yes | `tide.js`, `layers/tide.js`: own harmonic prediction from EA readings (held-out rms about 0.2 m), the river at the tide level, the ground to the UKHO bed, walls vs mud and shingle |
| 4 live | water surface: wind, current, debris, wakes | yes | `layers/wind.js`, `debris.js`, `water.js`, `materials.js`: fetch-limited wind waves, a flow map from the tide rate, Kelvin wakes summed in the shader, reflection at walls; `?wind=`, `?current=`, `?wakes=test` |
| 4 live | piers, berths, berthed vessels | yes | `layers/piers.js`, `piers-models.js`: 275 piers and pontoons on the tide, HMS Belfast, 5 other vessels, simulated Clipper, ferry and tour boat calls |
| 4 live | aircraft (simulated) | yes | `layers/planes.js`: London City procedures and hours, Heathrow streams, H4 helicopters; no live ADS-B (licences) |
| 4 live | wildlife (simulated from records) | yes | `layers/wildlife.js`: 20 birds and the fox, weighted by NBN Atlas and GBIF records (CC0, CC-BY, OGL) |
| 4 live | overlays, river, locate, KML, building keys | yes | `overlay-kit.js` (shared builders, materials, taps, labels) and `layers/overlays.js` (bike docks, lift outages, cranes, H4 and EGR159, GLA outlines and venues, works in progress; `?ov=bikes,works`), `layers/river.js` (river buses, locks, PLA notices, swim water, moorings, ships; `?river=`), `layers/locate.js`, `layers/kml.js` (`?kml=`; screen-space lines with Line2NodeMaterial; the WebGL page's kml.js reused), `layers/keys.js` (OSM card with parts, kg, Wikidata); files load only when ticked. Not ported: the selected building in the KML export, the Tower Bridge note, Sky panel rows |
| framework | reveal sheet | yes | `reveal.js`: a frosted sheet with the layer drawn on it falls when a layer is ticked on; `?reveal=0` |
| 5 styles | pixel art, Line drawing, Vector CRT | yes | `styles.js`, `?style=pixel|lines|vectrex`; pixel art has no photo facades or animated actors |
| 5 styles | splats | yes | `layers/splats.js`, `splat-worker.js`: own TSL renderer (Spark 2.3.1 and gaussian-splats-3d 0.4.7, both MIT, need WebGL), off by default, `?splats=with|only`, `?splatset=`; music switches to "only" in the map style; a full page with splats takes 24 to 39 s a frame in software |
| 6 other | Drone, plotter SVG, music | yes | `drone.js`, `plotter.js` (the WebGL page's plotter-svg.js, A4/A3/A2), `music.js` (24 bands, phone audio rules) |
| 6 other | WebXR | partial | `xr.js`, `layers/xr.js`: table 1:1500 with relief 2.5x (Relief button), street 1:1, the four panels, rays, grab and pinch, passthrough, the one-eye preview (`?xr=preview&go`); on the WebGL 2 backend (three.js r186 WebXR on WebGPU needs an XR-compatible adapter at start and XRGPUBinding): from WebGPU it reloads with `?webgl&xr=1`; no Ride, Drone, Photo, Wind; `test/xr-check.mjs` 23 steps with the mock; not yet tried on a real headset |

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
- **Reflection.** WebGPU: `layers/water.js` puts one TSL `reflector()` (half resolution, no bounces) in a horizontal plane
  at 2.74 m OD + 0.1 m (the area-weighted mean level of the polygons from 2 to 5 m OD; the Thames is at 2.6 to 2.8 m,
  the docks at 3.3 to 4.2 m, so a reflected dock edge is out by up to 3 m; not visible at these distances), distorted by
  the ripples. At night the lit windows come back in the water and feed the bloom. WebGL 2: off by default; the
  material shows a sky gradient (day colours, darkened by `U.night`) by fresnel. `?water=1` (or Menu > "Water mirror")
  turns the mirror on in WebGL 2 too (tested headless), `?water=0` off on WebGPU. The mirror draws the scene a second time.

## Ported and not ported (2026-10-08)

Ported: terrain (with the three ground images), water (the ground sinks under water polygons), greens, open-air rail
and roads, all 41,803 buildings with the measured towers, the roof shapes and the Realistic colours, the Pacific Tavern
glTF model, the photo views, the clock with sun, moon and stars, night windows and crowns, picking with the OSM card,
place labels, the share hash.

Not yet ported: tunnels and below ground, station models, ships and AIS, river and tide, splats, pixel art, line
styles, photo facades, the night light sprites (aviation lights, lamps) and their reflection sprites, routes, search, KML, Drone,
plotter, wind, music, WebXR, the One Canada Square crown campaign colours.
