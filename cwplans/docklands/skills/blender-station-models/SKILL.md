---
name: blender-station-models
description: >-
  Model underground station boxes (Canada Water, Canary Wharf and the next ones) in Blender, driven through the
  blender-mcp MCP server (PyPI blender-mcp, now mcp-for-blender, MIT) with Blender's GUI under Xvfb in this container:
  the install and start-up recipe, the stdio JSON-RPC client (tools/blender-stations/mcp_call.py), the screen-capture
  loop (10 s, or 5 s) with timelapse and contact sheet, the 3D page layer (converter, cut-outs, level table), the modelling conventions (the 3D page frame E0/N0 and m OD,
  one collection per station, names, materials by element class, the "uncertainty" property: OSM / sheet / published /
  judged), how the TfL axonometric sheets are used (topology and counts only, never positions), how OSM positions,
  escalator directions and published levels are read from the page's data, the export recipe (glb, obj+mtl, fbx, stl,
  usdc via usd-core because the Debian Blender has no USD), the deliverables in danbri/londat
  (third_party/tfl/am3d/models/), and what failed. Reach for it before you model a station or any other structure in
  Blender, drive Blender from an agent, or add a station to the models.
---

# Blender station models via MCP

Made 2026-10-05 for the owner's request: "Use the sheets as a layout guide to model the station boxes ... Use Blender
via its MCP running in your virtual machine. Take a screenshot of your work every 10 seconds ...".

Deliverables (danbri/londat, `third_party/tfl/am3d/models/`; README there):
https://github.com/danbri/londat/tree/main/third_party/tfl/am3d/models
Index in this repo: `magpie/cwplans/feeds/underground/station-models.json`.
Scripts: `magpie/cwplans/tools/blender-stations/`.

## 1. Setup (about 3 minutes, measured)

Disk: the container had 1.3 GB free. `rm -rf /root/.cache/pip /root/.cache/uv /root/.npm/_cacache` gave 0.6 GB back.
Do not remove `/root/.cache/ms-playwright`.

```sh
apt-get install -y --no-install-recommends blender python3-requests xdotool   # Blender 4.0.2, 88 MB download, about 300 MB installed
pip install --break-system-packages --no-cache-dir blender-mcp               # 2.0.0 = rename wrapper; pulls mcp-for-blender 2.1.8
mkdir -p ~/.config/blender/4.0/scripts/addons
cp /usr/local/lib/python3.11/dist-packages/blender_mcp/bundled/addon.py ~/.config/blender/4.0/scripts/addons/blender_mcp_addon.py
Xvfb :99 -screen 0 1600x1000x24 &
cd $WORK && DISPLAY=:99 LIBGL_ALWAYS_SOFTWARE=1 setsid nohup blender --python tools/blender-stations/start_addon.py > blender.log 2>&1 < /dev/null &
DISPLAY=:99 xdotool mousemove 800 150 click 1      # close the splash screen
```

- `start_addon.py` enables the add-on (`addon_utils.enable("blender_mcp_addon", persistent=True)`); the add-on starts
  its socket server on localhost:9876 by itself (`blendermcp_auto_start_server`). Log line: "BlenderMCP server started".
- Blender uses the system Python 3.12, not the pip Python 3.11: the add-on needs `python3-requests` from apt.
- Licence: MIT (`mcp_for_blender-*.dist-info/licenses/LICENSE`, Siddharth Ahuja). Telemetry: off by default in the
  add-on preferences; also set `DISABLE_TELEMETRY=1` for the server (mcp_call.py does).
- Software OpenGL (llvmpipe) is enough for the Solid viewport; do not use Material Preview or Eevee renders.
- Do not `pkill -f "blender --python"` from the shell tool: the pattern matches the shell's own command line and
  kills it. Use `pgrep -a blender` and `kill <pid>`.

## 2. Driving Blender through the MCP

`mcp_call.py TOOL [JSON | @file.py] [--png out.png]` starts `mcp-for-blender` over stdio with the official `mcp`
client, calls one tool and prints the result. Tools offered (2.1.8): get_addon_status, disable_telemetry,
get_scene_info, execute_blender_code, record_trajectory_feedback, look (viewport screenshot), generate_3d,
search_assets, import_asset. Only execute_blender_code, get_scene_info and look were used. About 1 s a call.

`step.sh steps/NN-x.py` wraps a step: it sets `BLENDER_STATIONS_WORK`, execs `stations_lib.py`, then the step,
through execute_blender_code. A work folder is a copy of `tools/blender-stations/` plus `osm-stations.json`
(`node magpie/cwplans/tools/blender-stations/extract-osm.mjs $WORK/osm-stations.json`). Exporter log lines come back
in the tool result (hundreds of lines for glTF): pipe through `head`.

## 3. Screenshots every 10 s

`shotloop.sh <dir>`: `import -silent -window root -resize 1280x800 -quality 60` of `:99` every 10 s, named
`shot-NNNN-<UTC>.jpg`, until `<dir>/.stop` exists. About 70 kB a frame (102 frames = 6.9 MB). Start it with
`setsid nohup` before the first step. At the end:
`ffmpeg -framerate 4 -pattern_type glob -i 'shot-*.jpg' -vf scale=1280:800,format=yuv420p -c:v libx264 -crf 28`
(timelapse, 0.4 MB) and `montage shot-*.jpg -tile 10x -geometry 256x160+2+2` (contact sheet). The MCP `look` tool
gives clean viewport stills for checking and for the making-of. Start the modelling soon after the loop: in the first
run 36 of 102 frames show only the splash while data was being read.

## 4. Conventions

- Frame: the 3D page's. Blender X = E - 537550, Y = N - 180300, Z = m OD. glTF/OBJ/FBX export Y up gives the page
  frame exactly (x, y = m OD, z = -(N - N0)). Vertices are written in world coordinates; then origins are moved to
  the bounding-box centre (positions unchanged). Axis empties carry E, N and bearing.
- One collection per station (`Canary Wharf`, `Canada Water`) with `params` (JSON: every level, its alternatives
  and the reason) and the frame as custom properties.
- Names `<station>.<class>.<what>` (`CWF.` Canary Wharf, `CW.` Canada Water). Materials by class: platform,
  escalator, stair, lift, hall, canopy, tunnel, track, box (12 % opaque structure), ground, entrance, label. Each
  material sets `diffuse_color` too, so the Solid viewport with color type MATERIAL shows the classes.
- Every object: `element_class`, `uncertainty`, `basis`, `level_m_od` (escalators and lifts: from and to levels).
  The glTF exporter writes them as `extras` with `export_extras=True`.
- Escalators and stairs: stepped (sawtooth) solids, 30 deg (stairs 33 deg, or the OSM slope for short flights),
  incline centred on the OSM line, flat landings. Canopies: half ellipsoids opened on the escalator side, solidified.
- Labels: text converted to meshes, upright, facing south.

## 5. Where each fact comes from

- Sheets (`londat third_party/tfl/am3d/stations/`): which levels exist, escalator counts and numbering, lifts,
  escape stairs, entrance letters. Not to scale; never a position.
- OSM through the page data: `docklands/data/under.js` indoor ways (platform and hall outlines, stairs and escalator
  lines with level lists), `area.js` (tracks and tunnel chains, buildings for canopy footprints), entrances and
  stations in `under.js` pois. Decode: `enc` in `tools/lib.mjs` (decimetres, running sums; tunnel chains are plain
  `pts`). `indoor.js` covers only the Canary Wharf box (-0.033..-0.002 E): its edges (stride 3: a, b, kind) between
  nodes (stride 4: x, z, level, ground) give escalator direction. Elsewhere, orient a step way by the levels of the
  ways that touch each end (step 23); both methods agreed.
- Levels: `data/sourced-levels.json` and `docklands/facts.json`. TfL FOI-0493-2223 rail levels win; platform = rail
  + 1.0 m (judged). Canada Water: JL rail -13.3 (sheet 15.0 m and Wikipedia 22 m recorded as alternatives), ELL
  platform -5.6 (Wikipedia 11 m, the page's control; sheet 8.0 m). Canary Wharf: rail -15.6; the sheet's 23.0 m
  below street then puts the street at 8.4 m OD.
- Published sizes (facts.json) are placed on the OSM track axis (least-squares line through both tracks).

## 6. Exports

`steps/40-save-export.py`: `save_as_mainfile(compress=True)`; `export_scene.gltf(export_format="GLB",
export_extras=True, export_apply=True)` for both stations and each; `wm.obj_export(apply_modifiers=True,
export_materials=True)`; `export_scene.fbx(use_custom_props=True)`; `export_mesh.stl` per station (Z up, no
materials). USD: `bpy.app.build_options.usd` is False in the Debian build, so `41-dump-for-usd.py` dumps the evaluated
meshes and `to_usd.py` writes `stations.usdc` with usd-core 26.8 (`pip install usd-core`, 30 MB wheel): Z up, metres,
displayColor and displayOpacity, custom properties as customData. The glTF exporter prints a Draco library error:
harmless, compression is not asked for. Sizes (2026-10-05): glb 4.2 MB both, obj 8.3 MB, fbx 2.6 MB, stl 2.3 + 2.8 MB,
usdc 1.2 MB, blend 1.9 MB; the three zips 1.8, 8.9 and 8.3 MB.

## 7. What failed, and limits

- PyPI `blender-mcp` is a rename wrapper (2.0.0) for `mcp-for-blender`; the bundled add-on is in the package.
- First add-on start failed: no `requests` in Blender's Python (fixed with apt `python3-requests`).
- No OSM ELL platform outlines and no lifts at Canada Water; no OSM B1 canopy at Canary Wharf: those are judged and
  marked. OSM names the eastern Canary Wharf entrance "Fosterito Entrance"; the sheet puts that label on B.
- Box outlines are published sizes placed on the axis, not surveyed walls. Tunnel stubs are level (no gradient).

## 8. On the 3D page (2026-10-05)

Live: https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/?view=under (Menu > Layers > Show > Station
models, on by default). Pan to Canada Water (x -2077, z 832) or stay at Canary Wharf (x 143, z 167).

- **Converter** `tools/build-station-mesh.mjs --glb <stations-exports.zip | stations.glb>` -> `docklands/data/stations.json`.
  Reads the GLB chunks itself (no library; the page is WebGL1 with no glTF loader, and needs none: the model is already in
  the page frame). Per object: positions in cm relative to the node translation (the flat-shaded export splits vertices per
  face; equal positions are merged), indices, and the object's custom properties. Text labels (79,572 of 102,052
  triangles) and the street plane are left out. Result: 127 parts, 22,480 triangles, 416 kB (86 kB gzipped).
- **Layer** `docklands/stations-layer.js`: builds two `Mesh` objects (the page's 16-byte format) with one colour per
  triangle from `shade(col, norm3(...))`, so it is lit as the rest of the page. Opaque classes (platform, escalator,
  stair, lift, entrance, track) draw after the OSM underground; see-through classes (box 0.1, hall 0.32, canopy 0.4) in
  the blended pass. The page's `cut` and vertical scale apply (same program). One tap anchor per part (top centre) in
  `OV.hits`, put back every second (`buildOverlays()` replaces the array); the card gives level, uncertainty and basis.
- **Integration with the page's own data** (what the first renders showed):
  - The page's 6 m Jubilee tunnel boxes ran through the stations and hid the platforms; the OSM indoor floors were at
    level x storey (Canary Wharf platforms 12.9 m too high). The converter writes `hide`: the minimum-area plan rectangle
    (+1.5 m) of each `box` object (station boxes and hall volumes). With the layer on, `buildTunnels` keeps only the
    parts of each segment outside the rectangles (`outside()`, Liang-Barsky) and `buildUnder` skips OSM indoor ways and
    points inside them. Their cache keys carry `hideKey()`. Geometry, not a shader discard: the shaders are unchanged.
  - The converter writes `levels`: OSM level -3, -2, -1 -> the model floors (Canary Wharf -14.6, -3.1, 3.0; Canada Water
    -12.3, -5.6, 0.9); level 0 is the page's ground; fractions interpolate. `levelY()` is used by the page's `vY` (walking
    network, routes) and drone.js `vpos` (Walk) inside the rectangles only. Drone Walk on the Canary Wharf platform:
    eye -13.0 m OD (was -0.7).
  - The model's tunnel stubs (level, judged) are not drawn: the page's tunnels (graded, sourced levels) run to the box
    faces. Rail levels agree at Canary Wharf (-15.6) and within 0.2 m at Canada Water Jubilee.
  - Open: the page uses the Wikipedia Windrush *platform* depth as the tunnel floor at Canada Water (about 1 m high
    against the model); a 0.8 m step shows at the ELL slot ends. Recorded in the activity log, not fixed.
- **Rebuild**: unzip nothing; run the converter on the londat zip, check `meta.glb_sha256`, then the page tests below.
- **Tests** (SwiftShader; `scratchpad` scripts, not committed): close views on and off at both stations (under, side,
  street, night); the photo views x two sizes: no console error, mean luma unchanged; a mouse click and a touch tap open a
  part's card; drone Walk heights. Only a real phone can show the frame cost of the 22,480 extra triangles (small against
  the buildings) and whether the see-through boxes read well on a small screen.
