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
| `materials.js` | TSL: buildings (day window grid; night windows, crowns, haze), terrain, water |
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

## Ported and not ported (2026-10-08)

Ported: terrain (with the three ground images), water (the ground sinks under water polygons), greens, open-air rail
and roads, all 41,803 buildings with the measured towers, the roof shapes and the Realistic colours, the Pacific Tavern
glTF model, the photo views, the clock with sun, moon and stars, night windows and crowns, picking with the OSM card,
place labels, the share hash.

Not yet ported: tunnels and below ground, station models, ships and AIS, river and tide, splats, pixel art, line
styles, photo facades, the night light sprites (aviation lights, lamps), reflections, routes, search, KML, Drone,
plotter, wind, music, WebXR, the One Canada Square crown campaign colours.
