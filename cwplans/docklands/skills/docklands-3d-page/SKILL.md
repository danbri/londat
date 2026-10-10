---
name: docklands-3d-page
description: >-
  Work on the Docklands 3D page, cwplans/docklands/index.html and its scripts (WebGL 1, 15 shader programs):
  vertex formats (the alpha byte is not opacity; g carries building use and roof top), picking by model index, the
  drawer, card, search, routes, gestures, phone audio; the styles (map, realistic ?look=real, pixel art, photo facades in a 32-slot atlas,
  splats, glow chips, Line drawing ?lines and Vector CRT ?vectrex); Night and the photo views
  (?view=rotherhithe|greenland|pier|greenlandday|plane); the fp16 fault; overlays, locate, ships, river, KML, Drone,
  station models; detailed building models; WebXR; wind (?wind); the plotter SVG (iDraw A3); building keys; the Three.js port (docklands/, WebGPU/WebGL 2); and the
  headless test recipe (two sizes x two pixel ratios). Sky, clock, weather and
  tide: skill docklands-sky. Reach for it before you edit the page or its scripts, add a layer or a style, change a
  shader, judge a render or a plot, or push a page change. Append to the curation skill's ACTIVITY-LOG.md.
---

# The Docklands 3D page

Live: https://danbri.github.io/londat/cwplans/docklands/
(night from the river: https://danbri.github.io/londat/cwplans/docklands/?view=rotherhithe).
Data and method notes: https://github.com/danbri/londat/blob/main/cwplans/docklands/README.md.
Data policy, the fault register and the activity log are in the hub skill `docklands-data-curation`
(`cwplans/skills/docklands-data-curation/`). Append what you did to its `ACTIVITY-LOG.md`.

The sections are dated: each was read from the code on its date. "Architecture" was checked again on 2026-10-07
(master a2781653). Counts marked "measured" were run with the recipe in "Testing". Commit ids from before 2026-10-07
are commits of danbri/glitchcan-minigam, where the page was `magpie/cwplans/docklands/` until it moved to this
repository that day: https://github.com/danbri/glitchcan-minigam/commits/7be94dc/magpie/cwplans .

## Ship at once, and re-read the whole line

Owner, 2026-10-03: "shipping immediately to live site is fine and urgent. Don't batch things up, as live site is my
only way to see progress." Commit and push each working change to main (since 2026-10-07; before, master of
danbri/glitchcan-minigam) as soon as it passes the load test below, then confirm that the live file is the commit:

    curl -s https://danbri.github.io/londat/cwplans/docklands/index.html | sha1sum
    git show HEAD:cwplans/docklands/index.html | sha1sum      # equal once Pages has deployed

The Pages workflow (`.github/workflows/pages.yml`) deploys each push to main; londat `CLAUDE.md`, "Always give the full
URL", says how to check that the site is on.

Other agents commit in the same working tree, often with files staged. Commit only your own content: build a temporary
index from the remote (`git fetch origin main`, `GIT_INDEX_FILE=... git read-tree origin/main`), add your blobs,
`git commit-tree -p origin/main`, and push that commit (`git push origin <commit>:refs/heads/main`; it is refused if
the remote moved, then start again). For a shared file (data-register.json, pipeline.json, ACTIVITY-LOG.md) apply your
insertion to `git show origin/main:<file>` at commit time (the coordinator's rule), never to a copy read earlier: on 2026-10-04 a copy read a few minutes before the commit undid another agent's register entries (repaired
in the next commit).

**Give your worktree a name no other agent will use.** The scratchpad directory is shared by every agent of the session:
on 2026-10-04 a worktree at `scratchpad/wt` was deleted by another agent mid-task (uncommitted edits lost; the server then
answered 404 and the tests timed out, which looked like a page fault). Use `scratchpad/<your-task>/wt`, keep each step's edits
as a re-runnable apply script (it also re-applies cleanly after `git rebase origin/main`), and commit each step at once.

Most of the page is long one-line statements. On 2026-10-03 a comment inserted in the middle of a line commented out
`gl.colorMask(true, ...)` and left the page black after "Splats only". `render()` now resets blend, depth mask,
colour mask and polygon offset at the start of every frame. After you edit a long line, read the whole line again.

## Architecture

- **One page, many scripts.** `docklands/index.html` (2,349 lines, 295 KB on 2026-10-07; 1,840 lines on 2026-10-04)
  holds the CSS, the HTML and one inline script. Script tags, in order: `vendor/earcut.min.js`, `data/area.js`,
  `data/under.js`, `opening-hours.js`, `vendor/astronomy.browser.min.js`, `vendor/satellite.min.js`, `sky.js`,
  `river-layer.js`, `ships-layer.js`, `stations-layer.js`, `roofs-layer.js`, `terrain-ring.js`, `../data-base.js`, `../live-cache.js`,
  `../feeds/london-datastore/lds-building.js`, `locate.js`, `building-keys.js`, `kml-layer.js` (module), `nav.js`,
  `drone.js`, `plotter-svg.js`, `line-styles.js`. The rest is fetched on demand (`data/indoor.js`, `data/splats/`,
  `data/tex/`, `data/towers.json`, `data/roofs.json`, `data/trees.json`, `data/building-keys.json`, `../atlas/data/atlas.json`,
  `data/music.json`, `data/pixel-palette.json`, `data/river.json`). A script tag added later in the page is not
  there when an inline timer fires (section "Line styles", fault b).
- **WebGL1.** `getContext('webgl', { antialias: true, alpha: false, stencil: true })` (the stencil marks night
  water). Required: `OES_element_index_uint` (32-bit indices; without it the page shows only the text tables).
  Optional: `EXT_shader_texture_lod` + `OES_standard_derivatives` (`FLOD`: facade mip levels),
  `ANGLE_instanced_arrays` (splats).
- **Programs.**

  | variable | draws | precision |
  |---|---|---|
  | `pr` | terrain (with the ground image), water, greens, lines, tunnels, under-ground detail, outlines, the pick pass | mediump |
  | `prF` | buildings: walls, roofs, window grid, night windows, photo facades, pixel-art materials, music deformation | `HIP` (highp where the GPU has it) |
  | `prS` | Gaussian splats, instanced quads | mediump |
  | `lpr` | light sprites: aviation lights, lamps, crowns, signs, and their reflections | `HIP` |
  | `BP.bright`, `BP.blur`, `BP.add` | night bloom | mediump |
  | `ppr` | pixel-art post pass: palette and outlines | mediump |
  | `LP` (line-styles.js) | Line drawing and Vector CRT: one instance a feature edge, widened on the screen | vertex highp, fragment mediump |
  | `PP`, `GP` (line-styles.js) | Vector CRT afterglow and glow source | mediump |
  | `S.P.sky`, `S.P.pt` (sky.js) | sky dome and sky points (stars, planets, satellites); skill `docklands-sky` | |
  | `LP`, `WP` (kml-layer.js) | My KML: screen-space lines (depth-tested against the buildings) and walls | fragment mediump |

  15 programs in all on 2026-10-07: 8 in index.html, 3 in line-styles.js, 2 in sky.js, 2 in kml-layer.js.
  `tools/check-fp16-shaders.mjs` captures the shaders that the page compiles in its test run (the line programs since
  2026-10-07) and counts uniforms, varyings and samplers; a program that is made only on demand (My KML) is in the
  check only when the run makes it.

- **Vertex formats.** `Mesh`: `[x y z]` float + `[r g b a]` bytes, 16 bytes a vertex. `MeshF` (buildings): `[x y z u]`
  float + rgba, 20 bytes, plus a second buffer `g` of 4 floats bound at attribute location 3. `u` is metres along the
  outline ring on walls and `-(1 + height)` on roofs, so the shader tells walls (`u >= 0`) from roofs and roofs of
  buildings under 40 m (`u > -41`) take the ground image.
- **The alpha byte of a building vertex is not opacity** (`alOf`): 255 plain; `100 + slot` a photo facade tile (slots
  0 to 31 since 2026-10-06); `200 + 8 x material` in pixel art (0 brick, 1 render, 2 glass, 3 ribbon windows, 4 metal, 5 glass with a
  measured facade colour). Opacity is the uniform `a` only.
- **`g` = [centre x, centre z, base m OD, night kind]** per vertex. The music deformation uses x, z and base. Night
  kind `g.w` = use x 1000 + roof top in m OD; use 0 unknown, 1 homes, 2 offices, 3 hotel, 4 Newfoundland (cwb-0451),
  5 One Canada Square (cwb-0413). Building use reaches the shader only through `g.w`, never through the alpha byte.
- **Picking.** `buildPick()` draws every building off screen in a colour that encodes its **model index** + 1 (24 bits:
  16.7 million buildings); `pickAt(x, y)` reads the pixel and returns the model index, or -1. `selectModel(i)` opens the
  registry card when `regOf[i] >= 0` (`selectBuilding(k)`), else the OpenStreetMap card (`building-keys.js`). Until
  2026-10-06 the colour was the registry ordinal, so a building outside the registry (all of Rotherhithe, Canada Water,
  Limehouse) could not be tapped. The cut-away applies, so a tap can reach underground. 28 model buildings belong to
  two registry records, and the registry card answers with the later one (README "Drone flight").
- **Coordinates.** Local metres x = E - 537550, z = -(N - 180300), y = m OD (README "Area and coordinates"). The page
  accepts `#at=x,z[,dist]`; the atlas links here that way.
- **Pixel-art frame buffer.** `pixBegin()` unbinds the frame's own texture before drawing into it: a texture that is
  bound while it is the render target is a feedback loop, and every draw fails.

URL switches: `?view=<name>` (any key of `VIEWS`: area, cw, under, plan, rotherhithe, greenland, pier, greenlandday,
plane), `?night`, `?pixel`, `?lines`, `?vectrex` (read in line-styles.js), `?look=real` (look-layer.js), `?capture` (no overlays, photo colours: drone
frames), `?t=` (page clock, sky.js; `?t=photo` also opens `rotherhithe`), `?drone=` (drone.js), `?kml=` (kml-layer.js),
`#music`, `#at=`, and the share hash `#v=1&c=…` (nav.js; `id=osm:w<id>` opens an OSM card).
Test hooks: `window.__docklands` (`cam`, `draw`, `renderNow`, `setView`, `setNight`, `setStyle`, `setSplatMode`,
`setGround`, `captureMode`, `pickAt` (model index), `selectBuilding`, `selectModel`, `MFP`, `modelAt`, `FT`, `ROOFS`, `searchItems`, `route`, `setEye`/`clearEye`, `screenOf`,
`NIGHT`, `AVL`, `BL`, `PIX`, `VIZ`, `SPL`, `AT`, `AUDst`, and `setTidal`, `relight` for sky.js).

## Interface (owner, 2026-10-03: "The city is the star not our endless word buttons")

- The screen holds the model, two round buttons at the top left (Menu, Search) and the OSM credit, which folds to an (i)
  button (see "Credits and the window lock"). Every other credit is in Menu > About > Credits.
- **Drawer** (Menu): views, then tabs Layers, Sky, Route, About (checked 2026-10-07). It closes with its cross, a
  tap on the dimmed map, Escape, or a swipe left of more than 70 px. On a phone (under 900 px) a view button closes it
  so the result shows; at 900 px and wider the map is not dimmed.
- **Record card** (`#sheet`): a tap on a building, a label or a pin opens it. Heights: 0, 38% and 80% of the screen on
  a phone; docked bottom right on a wide screen. Drag the grip to resize; a tap on the grip (moved under 6 px) steps to
  the next size; the cross closes it.
- **Card links** (registry card, last line): "full record in the atlas" (`../atlas/#map/b/cwb-NNNN`), "knowledge graph"
  (`../kg/#e=id:cwbNNNN`: the cwb id without its hyphen, added 2026-10-07), OSM, Wikidata, clear. Menu > About links
  `../kg/` after the atlas.
- **Search**: two characters or more; buildings with registry records, labelled places, and every routable place of the
  walking network (`data/indoor.js`, loaded when the box gets focus); prefix matches first; at most 14; Enter takes the
  first. A place below ground also cuts the model away above its level.
- **Press and hold** 550 ms on the model (cancelled by a move of 8 px or a second finger): "Route from here" /
  "Route to here" at the nearest mapped walkway or platform on screen.
- **Gestures** (pointer events). Map style: one finger turns and tilts, right or Shift drag pans, two fingers pinch to
  zoom, twist to turn and move to pan. Pixel art: one finger pans, two fingers up or down tilt. Wheel zooms; distance
  80 to 16,000 m. **A finger that lands on a label must still join a pinch or twist**: the label layer feeds the same
  pointer map, and a pointer that moved more than 8 px cancels the label's click (capture phase).
- **Below ground** shows the depth gauge: drag down to cut the model away above that level (60 to -40 m OD); arrow and
  Page keys move it.

### Music and phone audio

- 24 frequency bands, west (bass) to east (treble). Map style: the splat towers follow the bands (the page switches
  splats to "only"; a set with no `groups.bin.gz` cannot animate). Pixel art: the buildings themselves, in the facade
  vertex shader (stretch, swirl, noise about each building's centre and base).
- Sources: three CC BY 3.0 tracks streamed from Wikimedia Commons (`data/music.json`, credit shown while playing), the
  visitor's own file (plays only in the browser), or the microphone (nothing recorded or sent).
- **Phones play sound only as the direct result of a tap.** Create and resume the AudioContext and call `play()` in the
  tap handler, before any `await`. A file chosen in the picker arrives outside the tap, so a tap on the file button
  creates the context and plays a silent data URL on the audio element first. iOS: set
  `navigator.audioSession.type = 'playback'`, or the silent switch mutes Web Audio. The mini player retries a
  `blocked` start on its own tap.

## Styles

- **Map** (default): the facade program draws a window grid (3.6 m storeys, 1.8 m bays) that fades with distance;
  colour modes (`Colour buildings by`) use a square-root ramp.
- **Isometric pixel art** (`?pixel`): orthographic camera 30 degrees down at 45 degrees, quarter turns by the arrow
  buttons; the scene is drawn at one art pixel per 2 CSS px (1 when the camera is over 700 m away) into a frame
  buffer, then mapped to 33 palette colours (`data/pixel-palette.json`) with dark outlines (off when zoomed out, or
  small buildings become speckle). Colours come from **materials**, not height: a height ramp read as a heat map
  (owner, 2026-10-03). Measured facade colours snap to the palette's building colours, never to a tree green. Night
  is off in pixel art.
- **Photo facades**: `data/tex/facades.jpg` is 2048 x 1024, 8 x 4 tiles of 256 px: slots 0 to 15 the registry towers
  (`facades-registry.jpg/.json`, built by `tools/build-facade-atlas.py`, which cuts whole floors by whole bays so the
  tile repeats; photos and measurement: hub skill, "Trees and facades"), then contributed tiles (see "Building keys").
  On 2026-10-07, 23 of 32 slots are in use: 16 to 18 from set cwdock (the 17-storey brick tower, Decathlon, Dock Shed),
  19 to 22 from set cwlibrary (the library, Columbia and Regina Point sharing one slot, Ontario Point, The Founding).
  The compose step gives slots in set-name order, so a new set can move older tiles: refer to a tile by its OSM key,
  never by its slot number.
  `data/tex/facades.json` gives each building its slot and the tile size on the wall in metres (`w_m`, `h_m`); the
  shader reads the sizes from `uniform vec4 fslot[16]` (two slots a row: `.xy` even, `.zw` odd). Without mipmaps the far towers speckle. `fract()` on the tile coordinate makes the
  implicit mip level jump at every seam, so the level comes from `dFdx`/`dFdy` of the unwrapped coordinate
  (`texture2DLodEXT`); 256 px tiles in a power-of-two atlas keep every mip level inside its tile (level 8 is the tile's
  mean colour); the lookup is inset by half a texel of the level. Without `FLOD` the page falls back to plain
  `texture2D`.
- **Ground images** (aerial 2008, night 2012, LiDAR intensity 2020, Sentinel-2): drawn through the terrain's own x, z
  with the box in `data/tex/textures.json`, resampled to at most 2048 x 2048 on a canvas so the GPU can mipmap it.
  Sources and the ECW decoder: hub skill, "Imagery".
- **Gaussian splats** (Layers, "Gaussian splats"; off, with the model, or only). Sets: `data/splats/index.json`:
  `cw-synth` 669,306 splats synthesised by `tools/build-splats.mjs`; `cw-trained` 167,073 trained from drone frames.
  Standard 32-byte `.splat` records in model metres and axes (x east, y up, z south), gzipped, decoded with
  `DecompressionStream`. Instanced quads; a worker sorts them far to near (15 words a splat: centre, covariance,
  rgba, band, base, top, axis). Dimmed at night (splats have no lit windows).
  - "Splats only" draws the model into the depth buffer with the colour mask off and `polygonOffset(2, 8)` (splats lie
    on the walls and the ground), then the splats with the depth test and no depth write, then the glow. Without the
    offset, wall splats flicker against their own wall.
  - Synthesis (seconds, exact geometry): discs sampled straight from the model surfaces, colours from the aerial photo
    and the facade rule: ground and roof discs every 4 m, one wall disc per 3.6 m storey and 7.2 m of wall with a glass
    band in front: 669,306 splats, 20 MB, 4.5 MB gzipped. The first version (3 m ground, a disc per window) made 1.6
    million splats, 49 MB. A rotation built from three axis vectors must have determinant +1: the frame (t, up, n) with
    n = t x up flipped is a reflection and gives a wrong quaternion. Pick the normal sign for the frame and the outward
    side separately. Training on renders of our own model can only learn what the renders show: it gives a standard
    splat scene, not new information.
  - Drone frames: `tools/drone-flight.mjs` plans the flight, `tools/drone-capture.mjs` renders it with `?capture` and
    `setEye()`, about 3 s a frame on SwiftShader (README "Drone flight").
  - Training (measured 2026-10-03): OpenSplat 1.2.2 on libtorch CPU (`tools/train-splat.sh`). Poses go in as the
    nerfstudio camera-to-world matrices with no change; a wrong convention fails loudly ("No cameras see any sparse
    points"). Do not pass `--center`: without it the output stays in model metres. 480 frames at 480 x 270, 3,000
    steps: 33 min on a shared 4-core machine, 1.1 GB. With 2,000 steps or fewer set `--refine-every 250` or nothing
    densifies. `--val-render` leaks about 40 MB a render (the OOM killer stopped one run). Do not edit
    `train-splat.sh` while a run is going: bash reads the file as it runs, and the first run's conversion step died
    with a syntax error that the finished file does not have.
  - Trained output has floaters out to 2 km (OpenSplat trains on a black background, so sky becomes splats at random
    depths). `tools/publish-trained-splat.mjs` keeps the flown box plus 150 m, -30 to 260 m OD and axes up to 25 m
    (21,222 of 188,295 removed), gives each splat its building (so the music works on it) and adds the set to
    `index.json`.
- **Line drawing and Vector CRT** (`?lines`, `?vectrex`): the plotter's edges in real time; section "Line styles".
- **Glow chips** (Layers, "Glow: who is inside"): 11 categories (finance, shop, catering, leisure, entertainment, bar,
  education, health, sport, arts, charity) from `registry/categories.json` through the atlas index. Categories come
  only from stated classes (`tools/build-categories.mjs`), never from names. Drawn with the depth test, then once
  faintly without it, so a hidden building still shows.
- **Trees** load only when shown (pixel art or the Trees switch): 18,516 within 900 m of the estate; trees over 35 m
  are left out (cranes or structures). The whole file as boxes would be about 30 MB of vertices on a phone.

## Night (`?night`, Layers > Style > Night)

Method and every number: README "Night" (https://github.com/danbri/londat/blob/main/cwplans/docklands/README.md#night-added-2026-10-04).
The reference is the owner's six photos of 3 October 2026 in `docklands/reference/night-2026-10-03/` (owner,
2026-10-04: "Keep my photos"; the owner's copyright, not an open licence; no EXIF survived).

- **Lit windows** (`nightCol` in the facade shader): walls dark, window cells lit by use. Homes warm (tinted to the
  photos' #c1a573), lit by flats of three windows with low-frequency noise so flats cluster, about 5% blue-white;
  offices cool white by whole floors (about a third) and bands along a floor; hotels warm and more lit; no registry
  record: a warm mix, fewer lit; under 30 m fewer. A window under one pixel shows the mean light (lit share x
  brightness), first along a floor so lit office floors stay bands, then over all floors: not a dark average.
  Crowns: Newfoundland's diagrid in its top 13 m, One Canada Square's pink-red band and lit pyramid, a soft top band
  on other towers over 90 m.
- **Red aviation lights: a rule, not a survey.** UK Air Navigation Order 2016 art. 222: medium-intensity steady red
  lights on structures of 150 m or more, at the top and at intermediate levels no more than 52 m apart (CAA CAP 1210 /
  CAP 168 practice); the owner's photos show 2 to 4 lights per roof from about 100 m (aerodrome safeguarding near
  London City Airport). Code: `AVL = { min: 100, mid: 150, step: 52 }`. Roof corners (outline turns over 35 degrees,
  at most 4) of every building 100 m or more above its ground, one roof per tower, lights within 5 m merged; from
  150 m also `ceil(h / 52) - 1` intermediate levels with two opposite corners. Measured: 587 lights on 84 roofs (an
  earlier rule gave 4,418 on 950 buildings). Core radius clamped to 0.8 to 1.4 CSS px with a halo of 3.2 times; the
  clamp is in CSS pixels, so a 3x phone shows the size a 1x desktop shows.
- **Riverside lamps** (measured 1,449): every 16 to 26 m, at least 13 m apart, along the EA flood walls within 20 m of
  tidal water (3 m inland) and footpaths within 15 m of the tidal Thames or its creeks; none on inland roads or dock
  quays (they made rows of white and yellow balls). 65% low-pressure sodium orange, the rest warm white LED. Trees
  within 10 m of a lamp are drawn again, up-lit.
- **Reflections**: water marks its pixels in the stencil buffer; at night the LiDAR ground is pushed back in depth so
  ground at the water level does not hide the water. Reflected: lamps, roof lights within 150 m of water
  (exp(-d / 80 m)), the two crowns, and one column of window light per building of 40 m or more within 15 m of the
  water plus its radius (measured 160 columns, 1,769 reflection sprites in all). Each follows the glitter path: from the
  water under the light towards the viewer, to where the depression below the horizon is 0.16 (tangent) more than
  that of the mirror image (water slopes up to about 5 degrees); brightest at the mirror image, fading towards the
  viewer, rippled at about 20 frames a second. The old rule (every streak stretched to 85% of the way down the view)
  made confetti over the docks and a smeared band at the foot of the skyline.
- **Lit signs**: a short cool-white bar on the two longest faces of each office tower of 150 m or more (measured 12).
  No names or logos: the real signs are trademarks, and which face carries one is not in our data.
- **Moonlight** (`MOON`, `moonNow(nm)` once per frame before the sky): Night only and only while the sun is below the
  horizon (full at -6 degrees). Strength k = relative brightness (10^(-0.4 (mag + 12.7))) x extinction (0.25 mag per
  airmass) x altitude ramp x sun-down ramp x (1 - 0.7 low - 0.25 mid cloud). The ground program gets `ml` = tint x K x k x
  sin(altitude) added to `dim` (0 in the pick pass); the facade program gets `mlc` and `md` and adds base x `mlc` x
  max(N . moon, 0) inside `nightCol`, N from `cross(dFdx(wq), dFdy(wq))` (two new varyings `wq`, `ev`). K = 0.16 is a
  drawn choice. `__docklands.MOON` exposes the numbers.
- **The moon's glitter path** (`moonGlitter`): one sprite through the lights' reflection shader (refl = 1), placed along the
  moon's azimuth at D = min(5 km, he / (tan alt - 0.32)) and height so that the mirror image falls at the moon's altitude;
  width 0.03 rad; cached by position. `MOON.noGlitter = true` turns it off (A/B tests); `NIGHT.n.moonGlitter` is its
  intensity. Measured: +8 to +11 mean luma in the column under the moon at the photo time.
- **The river at a measured tide** (`terrainSink`, `tidalMask`): see the sky skill, second pass. `buildTerrain` remembers
  its argument (`terrainLast`) so the tide can rebuild it the same way.
- **Pick buffer was never cleared** (found 2026-10-04): the `gl.clear` of `pickAt` sat inside a `//` comment in the middle
  of its line, so every pick read a buffer holding the previous pick's colours and depth. Fixed; the lesson is the one at
  the top: re-read the whole line.
- **Bloom**: `copyTexSubImage2D` of the frame, a bright pass to a quarter of the width and height, a 9-tap Gaussian
  across then down, added back at 1.2 x. `__docklands.BL.on = false` turns it off (cost in the README: about 9% of a
  SwiftShader frame).
- **Views where the photos were taken** (`?view=rotherhithe|greenland|pier`; each turns Night on). `eyeView(eye, bearing
  from grid north, tilt, horizontal field)` puts the orbit centre 1.2 km along the line of sight. rotherhithe: eye
  (-896, 6.9 m OD, 1150), 43.3, -1, 42 degrees (`promenade-skyline-railing.jpg`); greenland: (-825, 5.3, 1160), 39.7,
  +3.5, 44 (`promenade-skyline-bollard.jpg`); pier: (-740, 6, 140), 83.6, +11, 69 (`clipper-canary-wharf-pier.jpg`).
  Fitted by reading the x positions of landmarks in each photo by eye and a grid search over eye, heading and field
  (RMS 3.5 px of 2000 for the railing photo); side-by-side renders fixed the tilt. The field is horizontal, so a
  portrait phone sees the whole photo frame and more.
- **Calibration**: compare render and photo by numbers (the README table: luma histogram, sky top colour, red points
  above the bank, warm and cool bright pixels, skyline band, water). The measuring script was a session scratchpad
  file, not committed; its definitions are in the README (frames 1000 px wide, luma = 0.2126 R + 0.7152 G + 0.0722 B,
  red = R > 0.45 and R > 2G and R > 2B). Commit the script next time you calibrate. The two Greenland photos bracket the
  model's red-point count (36 and 72 against 39 to 44): the count a photo shows depends on its exposure.

## fp16: why the towers were black on the owner's phone (2026-10-04)

Phone GPUs (Apple's at least) run `mediump` as 16-bit floats. The window hash
`fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453)` collapses there: almost every cell hashes to 0, so no window
lit and the towers showed only red dots. SwiftShader runs `mediump` as 32-bit, so **the headless renderer cannot
show this fault**. Rules: a shader that hashes world positions or large products uses `HIP` (highp where
`GL_FRAGMENT_PRECISION_HIGH`); test the maths with fp16 rounding in Node. Node 22 here has no `Math.f16round`;
round the float32 mantissa to 10 bits instead (exponent range not modelled; enough for this hash):

    node -e "const r=x=>{const b=new Float32Array([x]),u=new Uint32Array(b.buffer),m=u[0]&0x1fff;u[0]=(u[0]&~0x1fff)+((m>0x1000||(m===0x1000&&(u[0]&0x2000)))?0x2000:0);return b[0]},
      fr=x=>x-Math.floor(x),h=(x,y)=>r(fr(r(r(Math.sin(r(r(r(x)*r(12.9898))+r(r(y)*r(78.233)))))*r(43758.5453))));
      let z=0;for(let i=0;i<60;i++)for(let j=0;j<60;j++)if(h(i+7.3,j+7.3)===0)z++;console.log(z,'of 3600 cells hash to 0')"

Measured 2026-10-04: 3,554 of 3,600 cells hash to 0 in fp16 (README: 3,550 on its own grid), 0 in fp32.

### fp16 and WebGL 1 limits, checked without a phone (2026-10-04)

`node cwplans/tools/check-fp16-shaders.mjs` (about 40 s; `--no-browser` for the maths only) captures every shader
the page compiles in headless Chromium, prints per program its precision and its uniform rows, varyings, samplers and
attributes (counted without packing) against the WebGL 1 minimums, and re-runs the risky maths with every intermediate
rounded to binary16 (with exponent range, subnormals and overflow). It fails on a `mediump` case that goes wrong and on a
stale case (the quoted shader text is gone). SwiftShader reports `mediump` as 10 bits but computes in 32: its numbers say
nothing about phones.

Results 2026-10-04: the ground program's glow pulse (`mediump`, `time` unbounded) was off by 0.19 after 10 minutes and
0.37 after an hour: fixed by wrapping `time` to 10 periods of sin(3.3 t). Under the `HIP`/`PRE` fallback (a GPU with no
highp in fragment shaders) the window hash, the sky cloud noise (37 distinct values of 4,096), the ripples, far cloud
coordinates and the moonlight face normal (positions near 5 km step by 4 m) would all fail: every OpenGL ES 3 GPU has
highp, so this matters only for old GPUs. Fragment uniform rows above the WebGL 1 minimum of 16: buildings (prF) 25,
pixel-art pass (ppr) 35, sky 20; varyings: buildings 8 of 8 (the moonlight added 2 vec3).

Only a real phone can confirm: the frame time and the bloom cost on a phone GPU; that the derivative normal
(`OES_standard_derivatives`) gives clean moonlit faces; that `MAX_FRAGMENT_UNIFORM_VECTORS` and `MAX_VARYING_VECTORS` are
above what the programs use (read them with `gl.getParameter` on the phone); that `highp` is really used where `HIP`
asks for it (`getShaderPrecisionFormat`); the look of the glitter paths and the bloom on a small bright screen; memory
with the splats, trees and facade atlas loaded; audio and touch (separate rules above).

## Crown halo by date and overlays (2026-10-04)

Live: https://danbri.github.io/londat/cwplans/docklands/?t=photo (red halo, pyramid faces dark) and
https://danbri.github.io/londat/cwplans/docklands/?t=2022-05-26T22:00&night (purple, Elizabeth line week).

- **Crown halo** (`CROWN`, `crownFor(day)`, `crownNow()`; Layers > "Crown halo colour by date", on): for the page clock's
  *evening* (London date of the clock minus 6 h, so 01:00 belongs to the night before) take a One Canada Square campaign
  whose dates include it (month-only dates cover the month; `days` limits it to those days), else an observation of that
  date (one with a hex first; "pyramid faces" in `what_lit` lights the faces, "faces dark" or "not lit" does not), else a
  neutral warm white and "not known". Data: `registry/sources/lighting/crown-lighting.json` (skill
  `cwplans-crown-lighting`), loaded when Night is on or when the record card or Sky panel asks. The text goes to
  `#crownNote` (Layers, with Night), the record card of cwb-0413 and the Sky panel row "One Canada Square halo"
  (`__docklands.crownText()`). The white apex light is not touched.
- **No new uniform row.** The facade program's `night` became a `vec4`: x = 0 day, 1 night with dark pyramid faces, 2 with
  lit faces; yzw = the halo colour. `check-fp16-shaders.mjs` after the change: prF still 25 fragment uniform rows and 8 of 8
  varyings. A new `uniform vec3` would have been row 26; there is no varying left for anything.
- The halo's sprites (and their reflections) are in their own buffers `NIGHT.ocs`, `NIGHT.ocsR`, rebuilt by `ocsHalo()` only
  when the colour key changes; `buildNightLights()` keeps their positions in `NIGHT.ocsPts` (the counts in `NIGHT.n` are
  unchanged: 1,769 reflections).
- **Overlays** (`OV`, `OVL`, `buildOverlays()`; Layers > "Live state (snapshot)" and "London Datastore (GLA)", all off): one
  build for all ticked layers into four buffers: `OV.solid` (opaque, drawn with the pins, full brightness), `OV.glass`
  (see-through, blended, no depth write, dimmed to 0.5 at night), `OV.flat` (ground outlines, lit like the ground:
  max(night dim, 0.35)) and `OV.tips` (crane tip lights, through `drawLights` in `drawNight`). Heights are m OD as
  everywhere; feet above mean sea level x 0.3048 (`FT2M`), Newlyn datum within about 0.1 m of mean sea level.
- **Taps**: `ovTapPoint` (anchors within 22 CSS px on screen, nearest) runs before the building pick; `ovTapGround` (the
  ray from the tap meets the ground: `groundUnder`, three passes against `groundAt`; then point in ring, holes out, smaller
  layers first, EGR159 last) runs only when the pick finds no building. Each card gives the snapshot time in London time
  and the source's own credit line (`meta.attribution`): "Powered by TfL Open Data", "Source: UK AIS (NATS)", the GLA's
  OGL line with "The GLA cannot warrant the quality or accuracy of the data".
- Measured 2026-10-04 (all layers on): 135 docks, 3 lift outages, 10 cranes (5 lit tips), H4 110 centreline points,
  EGR159 80 ring points, 10 wharves, 623 open-space and 118 conservation-area polygons, 662 venues; 832 tap anchors and
  752 outlines; solid 113,870 triangles, glass 538; `buildOverlays` about 0.3 s with the files cached (SwiftShader host).
  Test matrix (map, `?night`, `?t=photo`, `?view=rotherhithe` x 1600 x 900 DPR 1 and 390 x 844 DPR 3) with every layer on:
  no console error; `?t=photo` mean luma 0.116 and 0.086 (0.094 and 0.066 with the layers off), red 0.086% and 0.061%.

What went wrong first (and the rule):
- **See-through fences round planning outlines** (12 m, alpha 0.45) washed the whole skyline green in `?t=photo`: the photo
  eye stands next to a designated open space outline on the Rotherhithe promenade. Outlines lie on the ground now
  (2.5 m ribbons, 0.7 m up). Check every new layer from the photo views, not only from above.
- **A lid on EGR159** (alpha 0.07 over 7 km2) tinted the whole Isle of Dogs and the sky behind it pink once the camera was
  inside the prism. No lid; walls fade from 0.09 at the top to 0 at the ground.
- **Outlines outside the model floated in the black sky**: `groundAt` clamps to the edge of the terrain grid, so a ring
  that leaves the model box gets walls hanging past the edge. Draw only segments with both ends inside the model.
- **Arc centres among the vertices** (F26): `feeds/live/helicopters.json` lists EGR159's two arc centres as vertices. The
  page draws, in their place, the arc clockwise (bearing from grid north increasing) from the vertex before to the vertex
  after, radius from `arcs` (0.3 NM, 0.55 NM), as UK AIP ENR 5.1 words it ("thence clockwise by the arc of a circle").
- H4 is drawn along `data/river.json`'s centreline from the model's west edge to the point nearest the Isle-of-Dogs
  reporting point; the AIP's precise line is on the 1:50 000 chart (not copied), and the card says so.
- Cultural venue positions are drawn as published; F25 (a constant offset in 10 venue layers) is not corrected here.

## River layer (2026-10-04)

Live: https://danbri.github.io/londat/cwplans/docklands/ (Menu > Layers > River). Data and methods:
skill `cwplans-river-and-water`, "On the 3D page and the atlas".

- **Its own file**, `docklands/river-layer.js` (like `sky.js`), so that agents working in parallel on `index.html` meet
  only seven one-line hooks: the script tag; `DocklandsRiver.load()` after the overlay files load and
  `DocklandsRiver.build({ S, G, F, tips, hits, polys, n })` before the upload in `buildOverlays()`; one draw line for
  `OV.rclock`; `DocklandsRiver.extendCard(l)` in `showInfo()`; `DocklandsRiver.init({...helpers})` before
  `window.__docklands`. The file adds the Layers section (after `#ovLdsNote`), the Credits block "River and water", a
  row in the Sky panel and its CSS itself. The main script binds `input[id^="ov_"]` before `init`, so the file binds its
  own six inputs.
- **Clock parts in their own buffer.** Boats and lock badges change with the page clock: `OV.rclock` (opaque, full
  brightness), rebuilt once a minute of page clock while either layer is on; their tap entries carry `rclk` and are
  swapped in `OV.hits` without rebuilding the other overlays. A new clock day rebuilds everything (PLA notices are by day).
- Static parts go to the shared overlay buffers: piers and badges in `S`, route lines and notice outlines in `F` (on the
  water: max(ground, tide level) + 0.5 to 0.6 m), notice areas in `polys` for the ground tap.
- Labels: Wikidata and OSM named ships and the two swim-water chips are `labels` entries with `river: true`, removed and
  added on each build. A null name broke `placeLabels` (it reads `name.length`): every label needs a string name.
- Measured 2026-10-04 (all six on, clock 12:45 BST Sunday): 8 piers, 11 route legs, 3 to 4 boats, 7 locks, 7 notice
  outlines (3 port-wide in the list), 2 swim markers, 134 moorings, 51 houseboats, 7 PLA visitor moorings, 19 ships,
  21 labels; 237 tap anchors, solid 2,464 triangles; build 6 to 20 s on SwiftShader including the first file loads.
  Test results of the photo views: README-style numbers in the ACTIVITY-LOG entry of that day.
- Tower Bridge's card (Wikidata Q83125) links the lift times page and says why they are not copied (terms).

## Credits and the window lock (2026-10-04)

Owner, 2026-10-04: "Move credits into main menus. Ensure user actions cant resize zoom dragdrop etc the containing os/app
window". Commits 6064852 (3D page) and 4405c42 (atlas, What's on).

### Credits

- **Where they are.** Menu > About > "Credits and data licences" (`#credits`), grouped: map data; ground, heights and river;
  buildings, occupants and registers; trees and facade photos; sky, weather and tide; live state and live data; London
  Datastore; music and software. Each source has its licence and link. The spans that say what is shown now
  (`#attribImg`, `#attribTrees`, `#attribFac`, `#attribSky`) live in its first line; `sky.js` finds `#attribSky` there and
  does not append to the corner. `#facCredit` and `#attrib` (the `A.meta.sources` line) are in the section too.
  A new layer or source adds its line here, not on the city. Record cards keep the credit of the record shown.
- **The corner.** `#attribLine` holds only `© OpenStreetMap contributors` (linked to https://www.openstreetmap.org/copyright)
  and "credits". `ATTR.start()` runs when the hud clears (the model is drawn); the line folds after 5 s, or at once on a
  pointer down on the canvas or a label or a wheel, to the round (i) button `#attribI` in the same corner, which opens the
  Credits section. Measured: shown from about 3 to 4 s after load to 7.5 to 9.5 s (headless, both sizes).
- **The rule followed:** OSMF Licence/Attribution Guidelines, "Interactive maps"
  (https://osmfoundation.org/wiki/Licence/Attribution_Guidelines, revision 14786 of 2026-09-10; adopted by the OSMF board
  2021-06-25): "You may use a mechanism to fade/collapse the attribution under certain conditions: [...] automatically on
  map interaction such as panning, clicking, or zooming; automatically after five seconds." and "If the attribution has
  been collapsed, the user must still be able to find the licence information if they look for it, for example from an
  '(i)' button in the corner of the map or an 'About' option in a menu." Text must be legible: the line is 11 px, #e8eaec
  on #0d1013d9. Keep the OSM link in the page source: `check-data-register.mjs` looks for it.
- **Other licences.** OGL v3.0 and CC BY ask for an attribution statement, not a place on the map: the Credits section is
  enough. Toasts are over the city, so they carry no credit text (ground image, trees, crime: the credit stays in the
  drawer note).
- **Atlas** (https://danbri.github.io/londat/cwplans/atlas/#map): Leaflet's attribution shows the OSM
  credit only (`setPrefix(false)`); it folds the same way to `#attrI` (map `movestart zoomstart click`, or 5 s); the (i)
  shows it again. EA, UKHO, ONS, HMLR, FSA, Historic England, Wikidata and Leaflet are listed in "Data and licences".

### Window lock

The page's own gestures are pointer events on the canvas and the labels. Everything else must leave the window alone:

- Viewport `width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover`.
- `html`, `body` fixed at `100dvh`, overflow hidden, `overscroll-behavior: none` (no rubber-band, no pull-to-refresh, no
  trackpad swipe-back in Chrome); `body` `touch-action: none`, `user-select: none`, `-webkit-touch-callout: none`;
  inputs, selects and text areas get `user-select: text` back.
- `touch-action: pan-y` on `#drawer`, `#drawerBody`, `#sheetBody`, `#qres` (native scroll; no pinch, no double-tap zoom).
  A scroll container resets the ancestors' touch-action, so the list scrolls although `body` is `none` (measured: a touch
  drag scrolled `#drawerBody` 467 px). Buttons and labels: `manipulation`.
- Listeners: `wheel` with ctrl or meta, capture, `{passive: false}` prevented (the canvas's own wheel zoom still runs);
  ctrl/meta + `+ = - _ 0` prevented; `gesturestart/change/end` prevented (Safari); `touchmove` with two fingers, or outside
  the three scroll lists, prevented; `contextmenu`, `selectstart`, `dblclick`, `dragstart` prevented outside fields; images
  and links `draggable=false`. `dragover` + `drop` on window always prevented; a dropped audio file goes to `vizStartFile`
  like "Play your own file" (a drop is not a user activation, so a phone may need the mini player's ▶ tap).
- A two-finger pinch on the open drawer closed it (the first finger's move read as a swipe left). The swipe now ignores a
  non-primary pointer.
- Atlas and What's on are documents: they keep page scroll (`touch-action: pan-x pan-y` on `html`, which forbids pinch and
  double-tap zoom) and selectable text; the same listeners otherwise; the atlas map area is `touch-action: none` and
  Leaflet keeps its own pinch zoom.

Test (CDP `Input.dispatchTouchEvent`; `synthesizePinchGesture` and `synthesizeScrollGesture` do nothing in this headless
Chromium, on the old page too, so they prove nothing): two fingers moving apart over the top bar, the corner credit and the
drawer gave `visualViewport.scale` 5 on the old page and 1 on the new. On the canvas: drag yaw -0.72 rad, pinch distance x
0.29, pinch with a finger starting on a label x 0.19, twist +0.50 rad, scale 1, `scrollY` 0. Ctrl+wheel over the city and
the drawer: scale 1, `devicePixelRatio` and `innerWidth` unchanged. Desktop 1600 x 900 and phone 390 x 844 DPR 3: no
console error.

Only a real phone can confirm: iOS Safari ignores `user-scalable=no` (since iOS 10); the lock there rests on `touch-action`
and the `gesture*` and `touchmove` listeners. The edge swipe back (iOS Safari, Android gesture navigation) is the operating
system's and a page cannot stop it. Pull-to-refresh, the long-press callout, text selection loupes and the drop of a file
from another app need a real device to see. The headless test shows the events are prevented, not what each OS does.

## Works in progress and the day view from Greenland Pier (2026-10-04)

Live: https://danbri.github.io/londat/cwplans/docklands/?view=greenlandday&t=2026-10-04T11:30 (then Menu >
Layers > Works in progress > Construction sites). Data and rules: skill `cwplans-construction`.

- **Layer** (`ov_works`, off; `OVL.works` = `../registry/sources/construction/sites.json`, 1.75 MB, loaded on first tick):
  `worksBuild()` inside `buildOverlays()`. Per site in the model box: the footprint as a ground ribbon (`ovRibbon`, `OV.flat`)
  coloured by status (orange on site, yellow approved, green completed in 2 years, blue proposed, grey commenced long ago);
  on site with a height: a frame of thin edges (outline at the top, four uprights at the outline's extreme points) when the
  footprint is 6,000 m² or less, else a thin mast at the centre; NOTAM cranes matched to the site; the height built so far
  (`current.top_m_od` from `facts.json`) as a grey prism, a core at 45% of the outline. Heights m OD: PLD `max_height` as
  entered, else storeys x 3.2 m above the ground, else the developer's height above the ground (`worksTop`).
  Measured (all on, 2026-10-04): 386 sites drawn, 74 frames, 10 cranes, 2 built prisms; no console error at 1600 x 900 DPR 1
  and 390 x 844 DPR 3 from `?view=rotherhithe`, `greenland`, `pier`, `greenlandday` and the default view.
- **What failed first:** see-through walls (`ovFence`, alpha 0.07) for the approved height: from the photo views the walls of
  74 sites stacked into orange blocks over the skyline. Edges only now. The built prism in `OV.solid` was full-bright white at
  night: it is in `OV.flat` (lit like the ground). A comment put at the end of a `prism(...)` call commented out the rest of
  its one-line block (`node --check` caught it): the rule at the top of this skill again.
- **Taps**: a hit point at the frame top (`OV.hits`) and the footprint as a ground polygon (`OV.polys`, priority 0, before the
  London Datastore outlines). The card (`worksCard`): status with rule and confidence, dates with their source record,
  approved figures (planning register and developer or press, with links), the frame height and where it came from, the built
  height with its photo method, developer and contractor with sources, NOTAM cranes, Street Manager, OSM ids, Wikidata items
  (not "low"), brownfield references, planning references linked to the borough register, the description, the footprint
  source and a one-line source note; the full credits are in Menu > About > Credits ("Works in progress").
- **`?view=greenlandday`** (no button): the owner's wide day photo `docklands/reference/day-2026-10-04/pier-wide-skyline.jpg`.
  Eye (-830, 4.5 m OD, 1158), heading 51.9° from grid north, tilt 6.45°, horizontal field 99.9°, `night: false`. The camera of
  `tools/solve-photo-sun.mjs` has a roll of +0.65° that `eyeView` cannot take; refitted with no roll over the same four tower
  tops: rms 2.7 px. Add `&t=2026-10-04T11:30` for the day sky at the photo time (11:30 BST from the bitt shadows).
- **Calibration against the photo** (render 1288 x 966 at DPR 2 = 2576 x 1932, the photo's size; landmark points projected
  with `__docklands.CAM`; photo pixels read by eye):

  | landmark | photo (px) | render (px) | dx, dy |
  |---|---|---|---|
  | Newfoundland crown top (cwb-0451) | 692, 856 | 688.5, 857.7 | -3.5, +1.7 |
  | Landmark Pinnacle roof (cwb-0577) | 751, 807 | 752.9, 807.3 | +1.9, +0.3 |
  | One Canada Square apex (cwb-0413) | 970, 903 | 974.0, 899.9 | +4.0, -3.1 |
  | Citigroup Centre roof sign, x only (cwb-0520) | 1100 | 1097.4 | -2.6 |
  | 22 Marsh Wall roof (cwb-0641, not in the fit) | 857, 917 | 856.9, 921.2 | -0.1, +4.2 |

  Before the refit (tilt 6.8 from the camera with roll): dy +3.4 to +10.7 px. Tones (frames 1000 px wide): mean luma photo
  0.466, render 0.462 (with `&t=` day sky); skyline band (rows 240 to 330) 0.558 and 0.540; sky top colour photo (49, 76, 128),
  render (68, 115, 198): the drawn sky is lighter and more saturated than the photo's polarised blue.
- **`?view=greenland` by day**: it is the night bollard photo's framing (heading 39.7°, field 44°), from an eye 5 m from the
  wide photo's. The bearings agree: the four landmarks' bearings from the two eyes differ by at most 0.3°. Not changed.
- **`?view=plane`** (no button; 2026-10-05): the owner's evening photo from an aircraft window,
  `docklands/reference/plane-2026-10/evening-thames-from-plane.jpg` (1195 x 689). Eye (211, 802 m OD, -845) over Poplar,
  heading 223.84° from grid north, pitch -13.56°, **roll +9.18°** (the first view with a roll: `cam.roll`, applied by
  `rolledUp` to the look-at up vector; `setView` and `setEye` clear it), horizontal field 56.9°, `night: false`. Add
  `&t=2026-10-05T17:40` for the evening sky. Solved with `tools/view-mcp/solve.mjs` (skill `photo-view-reconstruction`):

  | evidence | photo (px) | camera / page (px) | error |
  |---|---|---|---|
  | Newfoundland crown (cwb-0451) | 363, 600 | 356.3, 596.0 / 356.2, 595.7 | 7.8 |
  | Landmark Pinnacle roof (cwb-0577) | 301, 506 | 302.3, 517.0 | 11.1 |
  | Greenland Pier pontoon (weight 0.5) | 280, 421 | 274.9, 423.5 | 5.7 |
  | 32 shoreline pixels (Thames, Greenland Dock) | | distance to the OSM outline | 0.1 to 11.6 |
  | hold-out: Rotherhithe north shore, 7 pixels | | fitted without them | rms 7.7 |
  | hold-out: Greenland Dock west end | 578, 383 | 560.9, 382.8 | 16 |
  | hold-out: Sir John McDougall Gardens (fails: misidentified) | 107, 497 | 147.5, 493.3 | 41 |

  rms 4.8 px over 43 observations. The page's own MVP agrees with the solver to 0.2 px. Tones (1195 x 689, DPR 1, map style,
  `&t=` evening sky): mean luma photo 0.507, render 0.555; top third 0.651 and 0.850 (south London beyond the model box,
  4.5 km south of the eye, is the page's sky colour); lower two thirds 0.434 and 0.408. Side by side:
  `reference/plane-2026-10/compare-photo-render.jpg`. No console errors at 1600 x 900 DPR 1, 390 x 844 DPR 3, 1195 x 689.
- What the model lacks in this view: buildings finished after the LiDAR (the red-brick tower in front of One Canada Square and
  others) and every crane; the 30 Marsh Wall core and 25 Cuba Street are drawn only through this layer.

## Location and heading: the locate button (2026-10-04)

Owner, 2026-10-04: "Add a geopositioning position that takes permissioned device location/orientation via webplatform
APi and positions map/view accordingly, following conventions familiar from mainstream apps." Commits cc1ebabc (3D page)
and e78a8671 (atlas, and the hold fix on both).

- **Code**: `docklands/locate.js`, loaded after the inline script. It reaches the page only through `__docklands`
  (`geo`, `groundAt`, `toast`, `cam`, `draw`, `PIX`) and `DocklandsLocate.after(ctx)`, one line at the end of `render()`
  beside `DocklandsSky.after`. Its CSS and DOM are injected (`#locBtns`, `#locSvg`, `#locMsg`), hidden in `?capture`.
  Test hook: `DocklandsLocate.state` (mode, smoothed fix in model metres, grid heading, source, pitch, watching, orient,
  outside, message, last error code, grid convergence), `DocklandsLocate.off()`, `showEdge()`.
- **The button cycle** (Google Maps / Apple Maps): `off` (grey crosshair) -> tap: permission asked now, never on load ->
  `waiting` (pulsing) -> `centred` (blue crosshair, filled centre) -> tap: `heading` (filled arrow; the view turns with the
  compass) -> tap: `centred`. A drag, twist, view button, search or anything else that moves `cam.tx/tz/yaw` drops to
  `located` (blue outline; the dot stays); a tap centres again. Zoom (wheel, pinch without pan) and tilt keep following.
  Hold 0.8 s: off. The follow loop notices another mover by comparing the camera with what it last set (`S.set`): no
  hook in the gesture code was needed.
- **The eye button** (shown in `heading` and `eye`): "look through the phone". `cam.eye` at the fix, ground (`groundAt`,
  the LiDAR DTM, so the deck or the water on a pier) + 1.6 m; yaw from the heading, pitch from the elevation of the
  back camera, clamped to +/-63 degrees; vertical field 1.05 rad; no roll. Tap it again (or the locate button) to leave;
  a drag leaves it to `located`. Chosen over a long press because a long press is not discoverable.
- **Position**: `watchPosition` with `enableHighAccuracy`, timeout 20 s, `maximumAge` 5 s; stopped on `visibilitychange`
  hidden and restarted on visible. `geo(lon, lat)` is the page's own transform (`A.meta.geo`, a quadratic fit, max error
  0.03 m against its own source): checked against proj4 BNG (7-parameter Helmert): Canary Wharf DLR 51.5051,-0.0209 ->
  (-97.9, -19.4), proj4 (-96.0, -19.5); 51.4953,-0.0329 -> (-901.3, 1092.9), proj4 (-899.5, 1092.7). Note: 51.4953,-0.0329
  is the Greenland lock entrance; the pier pontoon is 51.4947,-0.0319 -> (-830.1, 1157.7), the places list's pier.
  Jitter: a jump over max(30 m, 2 x accuracy + current accuracy) or a fix older than 15 s snaps; else the dot moves by a
  share k = 0.25..0.8 that grows when the new fix is more accurate. A later timeout while a fix exists is ignored.
- **Heading**: grid bearing = true heading + grid convergence (`trueToGrid`: the grid bearing of true north from `geo` at
  the fix; -1.55 degrees at Canary Wharf). Magnetic declination (about 1 degree in London) is not applied: below compass
  error. Android/Chrome: `deviceorientationabsolute`, full W3C rotation R = Rz(alpha) Rx(beta) Ry(gamma); heading of the
  horizontal part of (screen-up + back-camera direction): the first serves a flat phone, the second an upright one, and
  for a tilt about the device x axis they agree, so the sum never vanishes. Screen-up in device axes is
  (sin a, cos a) for `screen.orientation.angle` a. iOS: `webkitCompassHeading` + screen angle, and
  `DeviceOrientationEvent.requestPermission()` called inside the tap (tap 2 or the eye button) before any await; Android
  needs no prompt, so the compass starts with tap 1 and the beam shows at once. No absolute heading: GPS `coords.heading`
  when `speed` > 1 m/s; else no beam, and a toast says so after 2.5 s.
- **Smoothing that failed first**: averaging unit vectors (v += (v' - v) k) stalls when a reading is opposite the mean:
  v(1 - 2k) keeps the old direction for ever (the headless test turned 270 -> 90 degrees and stayed at 62). Now: step
  along the shorter arc, r = c + angDiff(r, c) k. Camera easing is by time (k = 1 - exp(-dt / 0.25 s)), not per frame:
  SwiftShader draws a frame in about 2 s and per-frame easing took 20 s to settle.
- **A tap after the hold was swallowed**: the hold replaces the button's icon, so the pointerup lands on a removed node and
  no click follows; the "this click ends a hold" flag stayed set and ate the next tap. The flag is cleared on pointerdown.
- **Drawing**: an SVG overlay under the labels, from `MVP` each frame: the accuracy circle as 48 ground points projected
  (perspective-correct), the dot 8 px, the beam a 60-degree 56 px gradient wedge along the projected heading. Always on
  top of the buildings (as the apps). No shader code, so `check-fp16-shaders.mjs` is not affected.
- **Outside the model box** (`A.meta.extent`): `#locMsg` "You are outside the model area: 2.4 km west of it" (distance to
  the box, direction by grid bearing less convergence) and "Show where I am": camera at the nearest edge (60 m in),
  yaw towards the person, pitch 0.3, distance 900 m; mode `located`.
- **Errors**: code 1 -> how to allow it in the site settings (and iOS Location Services); 3 -> "took too long" with Try
  again; 2 -> "not available, check location is on" with Try again; `!isSecureContext` -> needs https; no
  `navigator.geolocation` -> said. Without permission the page works as before.
- **Privacy**: no request carries the position, nothing is stored, the URL does not change (About > "Your location"; the
  atlas says the same under the map and adds that map tiles around any place viewed come from tile.openstreetmap.org).
- **Atlas** (https://danbri.github.io/londat/cwplans/atlas/#map): a Leaflet control at the bottom right
  (38 px above the corner so the (i) stays clear), `map.locate({ watch: true, enableHighAccuracy: true })`, `L.circle` with
  the accuracy and an `L.circleMarker` dot; tap = ask and centre (zoom 17 or closer), `dragstart` -> located, tap = centre,
  hold = off; no heading (the map does not rotate). Hook `__atlasLocate.state`.

Test (headless Chromium, SwiftShader WebGL; Playwright `permissions: ['geolocation']`, `setGeolocation`, compass by
`dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha, beta, gamma, absolute: true }))`): 3D page
29 checks at 1600 x 900 DPR 1 and 28 at 390 x 844 DPR 3 touch (no wheel there), all pass on 2026-10-04 (after the Works in progress
layer landed): no geolocation call on load; denied message (the denial is stubbed: headless Chromium leaves the prompt
open and the mode stays `waiting`; CDP `Browser.setPermission` from a page session did not deny); first fix in under
60 ms and view centred in 3.3 to 7.7 s (SwiftShader frames); alpha 0/270/180/45 -> heading 358.45/88.38/178.38/313.35
grid, camera yaw error under 0.6 degrees once settled; tap 3 stops turning; touch drag (CDP touch events) and mouse drag
-> `located` with the dot; wheel keeps `centred`; eye mode east at 88.3 degrees grid with a level horizon, beta 120 ->
pitch 30; visibility hidden stops the watch and the compass; outside (Trafalgar Square) "2.4 km west" and the edge view at
x -5090 looking west; hold -> off and the next tap works; no request with the position; URL unchanged; no console error.
Atlas: 9 checks x 2 sizes pass. Wait for convergence by polling in tests, never a fixed sleep: SwiftShader frame times
change whenever another layer lands.

Only a real phone can confirm: the iOS motion permission prompt and the location prompt; that `webkitCompassHeading` is
right when the phone is upright (Apple documents it for the device top); compass calibration and magnetic interference
near steel towers; GPS accuracy among the towers (multipath often gives 30 to 100 m) and under the DLR; how the beam and
the eye mode feel with real sensor noise; that `deviceorientationabsolute` fires on the owner's Android browser; that the
watch restarts after the phone sleeps; battery use with high accuracy on.

## Ships (AIS) (2026-10-04)

Live: https://danbri.github.io/londat/cwplans/docklands/#at=-4330,-90,500 (the Pool of London: HANSEATIC
SPIRIT alongside HMS Belfast on 4 October 2026). Data, licences and the review flag: skill `cwplans-river-and-water`, "AIS:
Open Waters" and "Review before scaling" (AISHub and aisstream.io shown for scoping by the owner's decision of 2026-10-04).

- **File** `docklands/ships-layer.js` (like `river-layer.js`): `DocklandsShips.init(ctx)` gets the same helpers as the river
  layer; index.html draws `OV.ships` right after `OV.rclock` at full brightness. Layers > River > "Ships (AIS), live", **on by
  default** (owner: "Add to live by default now").
- **Data path.** On load: the committed `../feeds/river/ais.json` at once, then `GET https://ais.openwaters.io/v1/vessels?bbox=
  51.474,-0.095,51.528,0.085` from the browser (anonymous, `access-control-allow-origin: *`, no key), again every 60 s while
  the tab is visible and the layer is on; `visibilitychange` stops and restarts it; an error or 429 doubles the pause up to
  16 min. One request a minute is far under the 120-a-minute limit.
- **Private craft** are filtered in the page with the tool's rule (`DocklandsShips.isPrivate`): ITU 36/37, class B (from
  `msg_type`) without a commercial type, or no class and no commercial type. The live snapshot has no `class` field: class A
  is inferred from `PositionReport`/`ShipStaticData`. Counted in the note under the checkbox, never drawn.
- **Marker**: a white hull along the heading (else the course), length and beam from AIS (minimum 14 m x 4 m so small
  boats stay visible), a plate and a mast coloured by type (passenger orange, high-speed cyan, tug yellow, cargo green,
  tanker red, aids to navigation violet), and an arrow ahead of the bow, longer with speed, only when under way (not moored,
  at anchor or aground, and over 0.5 kn). Ships of 60 m or more get a label. Heading 0 = north = -z, east = +x.
- **Taps**: `OV.hits` entries with `ais: true`. `buildOverlays()` replaces `OV.hits`, so a 1 s timer puts the ship hits
  back when they are missing (the river layer's clock does the same through `rebuildClock`). The card: name, type, length,
  speed, course, heading, status, destination, last heard (London time), MMSI, IMO, call sign, flag, the event's source and
  its attribution, a scoping/review line for AISHub and aisstream.io, the Open Waters record link, "not for navigation".
- **Credits**: Menu > About > Credits, "Ships (AIS)" (Open Waters AIS; AISHub; aisstream.io; private craft not shown).
- **Measured** (2026-10-04, mocked live snapshot of 108 features): 87 in the list after the filter, 21 private craft not
  shown, 27 outside the model box (Royal Docks margin), 60 drawn; HANSEATIC SPIRIT 71 m from HMS Belfast's OSM point,
  moored, source aishub. Matrix and the real-fetch run: see the activity log of 2026-10-04.
- **Positions are now**, not the page clock (`?t=`): the card and the note say so. A track replay for the clock would need
  `/v1/vessels/{mmsi}/track` (48 h anonymous) per vessel: not built.

## London Datastore facts on the building card (2026-10-04)

`feeds/london-datastore/lds-building.js` (shared with the atlas dossier) and two lines in `selectBuilding`: a
`<div id="ldsB">` in the card and, after the card is written, `LdsBuilding.load('../')` then
`LdsBuilding.html(ab.id, esc)` (heat demand, solar potential, the LSOA and its 2021 Census figures, venues and other
records placed in the building, each with key and confidence; data `registry/sources/lds/`, made by
`tools/join-lds.mjs`, skill `cwplans-london-datastore`). Nothing is drawn in the city. Credit in Menu > About >
Credits, "London Datastore". Tested headless (SwiftShader): rotherhithe, greenland, pier x 1600x900 DPR 1 and 390x844
DPR 3, no console error; the card of cwb-0413 shows heat, solar and the LSOA context.

## Navigation: momentum, ground limit, share (2026-10-05)

Owner, 2026-10-05: "Also pls add momentum to visual navigation". Code: `docklands/nav.js`, loaded after `locate.js`. It
reaches the page through `__docklands` only, plus listeners added after the page's own (window capture to take a camera
snapshot before a move, `cv` and `#labels` bubble listeners to read the result after it). Test hook: `DocklandsNav`
(`state`, `fling(v, t)`, `tick(now)`, `stop()`; `state.manual = true` stops the rAF loop so a test can step time).

- **Momentum** (drag, pinch, twist; map and pixel art): the release velocity is the camera's own motion (tx, tz, yaw,
  pitch, ln dist) over the last 80 ms of moves, from `event.timeStamp`. No momentum when the finger was still for more than
  60 ms before it lifted, or when a part is slow (pan under 0.25 view distances a second, turn or tilt under 0.3 rad/s, zoom
  under 0.4 ln/s); caps 3 distances/s, 5 rad/s, 2 rad/s, 3 ln/s. Decay is by time: each part follows s0 + v TAU (1 - e^(-t/TAU)),
  TAU 0.35 s, ended 3.2 s after the release, so a frame rate of 2 (SwiftShader) and 120 (a phone) end in the same place.
  Stopped by any pointerdown (anywhere), a wheel, Escape, a hidden tab, `prefers-reduced-motion: reduce` (no momentum at
  all), the locate button's follow modes (centred, heading, eye: `fling` refuses), a free camera (`cam.eye`), and anything
  else that moves the camera (a view, a search, a flight, the locate follow loop): each step compares the camera with what
  it last set, the same rule `locate.js` uses. Two fingers that lift within 80 ms of each other keep the pinch's velocity.
- **Measured** (headless, SwiftShader; CDP input with explicit `timestamp`s, because at 2 frames a second each
  un-timed `page.mouse.move` waits about 3 s for a frame and every gesture reads as slow): one fling stepped at 2, 60 and
  120 steps a second ends within 2e-12 of the closed form; a fast drag flings (yaw -5 rad/s, capped) and a press stops it
  dead; hold 200 ms before release and a slow drag: no fling; a two-finger twist plus spread flings yaw and zoom (touch);
  `setView` during a fling stops it; in locate `centred` mode `fling` returns false and the follow still reaches the fix;
  reduced motion: no fling. 1600 x 900 DPR 1 (mouse) 7/7 and 390 x 844 DPR 3 (touch) 8/8, no console error.
- **Ground limit** (owner, 2026-10-05: "forbid view to very casually spin upside down so we look up from below at a place.
  But we will want to be able to force past that for looking at pools, docks, tube, underground mall"). The eye
  (`ty + dist sin(pitch) / vz`, at x, z of the orbit) stays 1 m above `groundAt` at its own x, z (the LiDAR DTM: the
  ground, a deck, or the water surface the LiDAR saw; a live tide above that is not used). Only a move that brings the eye
  closer is changed: within max(6 m, 2% of the distance) of the wall the tilt and zoom part is scaled by
  (clearance - 1 m) / zone (at least 0.06), and a move that would cross is cut at 1 m by bisection; pan and turn keep
  going unless they alone run into rising ground. Momentum meets the same wall and loses its tilt and zoom speed there.
  Views that start under 1 m (none of the photo views do) are left alone until a move goes further down.
  The page's drag clamp calls `DocklandsNav.pitchMin()`: -0.6 above ground (as before), -1.35 below ground, 0.2 in pixel art.
- **Pass-through**: a push against the wall for 0.6 s (3 or more blocked moves) or 480 px of blocked finger travel
  clicks: `navigator.vibrate(15)` where the browser has it, a ring in the middle of the screen that fills while the push
  lasts and snaps, a line "Below ground. Push up to come back.", and a `docklands-nav-pass` event (`detail.to`). Going
  down it does what the Below ground button does: opens the depth gauge and, if no level is set, cuts the model at the
  street level under the eye minus 1 m; the eye is put 1.5 m under the surface (pitch towards -1.35; the target moves
  down only when the pitch cannot reach). The rest of that gesture does not tilt or zoom on (`S.hold` until the fingers
  lift, or 400 ms with no wheel). Below ground the wall is 1 m under the surface and the same push brings the eye 1.5 m
  above it and closes the gauge (its cross takes the cut away). "Below ground" turned on from the menu with the eye
  above the surface: the eye goes down through the surface with no click (the visitor already chose it).
- **Measured** (`DocklandsNav.clearance()`, `isUnder()`, `state.passes`): a 300 px drag up in 0.3 s stops at clearance
  1.00 m, pitch 0.0041, no pass (19 blocked moves); 1.2 s more push: one pass, one event, gauge open, cut 4 m OD,
  clearance -1.5 m; a fling at -2 rad/s stops at 1.00 m; six wheel notches in: 2.29 m; a two-finger pinch with one finger
  on the "Limehouse" label: distance 1500 to 443 and no card opened. 1600 x 900 DPR 1 (mouse) and 390 x 844 DPR 3 (touch).
- **Only a real phone can confirm**: the click. `navigator.vibrate` is not in iOS Safari (any iOS browser: they all use
  WebKit), so iPhones get the ring and the line only; Android Chrome vibrates only after a user gesture on the page and
  not in battery saver or with touch vibration off in the system settings. Headless Chromium returns true and does nothing.
  Also how the soft wall feels at 60 to 120 frames a second, and whether 0.6 s is the right push.
- **Share this view** (owner, 2026-10-05: "add a share view action in side menu so we can share url with #blahblah").
  Menu > views group > "Share this view" (`#shareBtn`, injected after "Below ground"; the link is also shown under it,
  `#shareOut`, selectable). On a touch device with `navigator.share` the system share sheet opens; else the link is copied
  (`navigator.clipboard`, then `execCommand('copy')`) and a toast says so. The page URL's hash is replaced
  (`history.replaceState`) only when Share is tapped; nothing rewrites it while the camera moves. The shared URL drops
  `?view`, `?t`, `?night` and `?pixel` (the hash carries them) and keeps other parameters (`?capture`).
  Hash, `v=1` first, keys in this order, unknown keys ignored on load:

  | key | holds |
  |---|---|
  | `c` | target x, z, y (m, 0.1), distance (m), yaw, pitch (rad, 4 decimals) |
  | `f` | `h` + horizontal field (a photo view's lens) or the vertical field, rad |
  | `rl` | roll in degrees (`?view=plane`) |
  | `e` | free camera eye x,y,z and target x,y,z (drone flights; never the locate eye mode) |
  | `vw` | the view button that was pressed, applied first (its night, cut and building mode) |
  | `n` | Night 1/0; `t` the page clock (`2026-10-04T23:56`, London time) or `now`; `u` Below ground (gauge open) 1/0 |
  | `on`, `off` | every Menu checkbox whose state differs from its HTML default (id; Glow chips as `glow-<kind>`), so layers added later (KML, river, ships) are carried with no change here |
  | `r` | radio groups not at their default, `name:value` (style, ground image, buildings, splats) |
  | `s` | selects not at their default, `id:value` (colour by, splat set) |
  | `g` | ranges not at their default, `id:value` (cut, vertical scale, storey, ...; `skyYear` against its max) |
  | `id` | the record on the card: a `cwb-` id, a label's Wikidata id, or `l:` + label name |
  | `cap` | `?capture` look |

  Example (1600 x 900 test): `https://danbri.github.io/londat/cwplans/docklands/#v=1&c=-512.3,321.1,12.3,2345,1.1235,0.4321&f=0.9&n=1&t=2026-10-04T23:56&u=1&on=showTrees,glow-finance,ov_works&off=crownDate,showLabels&s=colourBy:height&g=cut:-5,vz:2&id=cwb-0413`.
  On load (`DOMContentLoaded`, after sky.js) the order is: view, clock, radios (waits for pixel art, which saves and
  replaces the camera), checkboxes, selects, gauge, ranges, Night, capture, camera, then the record (waits for the
  atlas). A bad number keeps the default; ranges are clamped to their min and max. `#at=x,z[,dist]` still works (no
  `v=1`: nav.js leaves it to the page). **Never the visitor's location**: `locate.js` state is not read except its mode;
  while the view follows the location (centred, heading, eye) the link has no camera and the toast says why.
- **Measured** (share test): the round trip restores camera to the rounding (0.05 m, 5e-5 rad), every Menu input,
  Night, gauge, clock and record; sharing the restored page gives the same hash; mean luma 41.04 and 41.13 (of 255),
  mean absolute difference 0.95 (live ships and rounding); `?view=plane` keeps its roll 9.18 and field; a hash of bad
  values (`c=abc`, `vz:999`, unknown keys, `cwb-99999`) loads with no error (camera default, vz 5); follow mode gives no
  `c=`. 1600 x 900 DPR 1 and 390 x 844 DPR 3.
- **Only a real phone can confirm**: the share sheet (`navigator.share` needs a secure context and a user tap; headless
  has none, so the clipboard path is what was tested), and clipboard permission prompts in Safari and Firefox.

## KML (2026-10-05)

Owner, 2026-10-05: "Also look into basic KML support". Live: https://danbri.github.io/londat/cwplans/docklands/
(Menu > Layers > My KML) and https://danbri.github.io/londat/cwplans/atlas/#map (Layers box, "KML").

- **Files.** `docklands/kml.js`: an ES module with no dependencies, shared by both pages (`readKml`, `parseKml`, `writeKml`,
  `toGeoJSON`, `placemarksFromGeoJSON`, `kmlColor`, `download`). `docklands/kml-layer.js`: the 3D page's layer, a module.
  `atlas/kml-atlas.js`: the atlas side. index.html has three hooks only: the module tag after `locate.js`; the line
  `globalThis.DocklandsKMLctx = {...helpers}` before `window.__docklands` (the page script is an IIFE, so a module can reach
  its helpers only this way; modules run after it, so the object exists when the layer starts); one draw line after
  `OV.glass` that draws `OV.kml` with the depth mask on and `OV.kmlA` (see-through) with it off. The atlas has one module tag.
- **Supported** (KML 2.2, any namespace, by local name): Placemark with Point, LineString, LinearRing, Polygon (outer and
  every inner boundary), MultiGeometry, gx:Track and gx:MultiTrack (as lines); name; description and Snippet as plain text;
  ExtendedData (Data with displayName, SchemaData/SimpleData with the Schema's displayName); Style and StyleMap by id (the
  "normal" pair), inline Style, LineStyle colour and width, PolyStyle colour, fill and outline, IconStyle colour and scale;
  colours are `aabbggrr`; Document and Folder nesting (the path shows on the card); `visibility` 0 on a feature or an ancestor
  (counted, not drawn); altitudeMode clampToGround, relativeToGround, absolute (gx: seafloor modes as ground); extrude for
  polygons and lines above the ground (walls); Camera and LookAt on the Document or a feature, with gx:horizFov; KMZ.
- **Not supported** (counted in the file's note): NetworkLink (listed with its href, never fetched), GroundOverlay,
  ScreenOverlay, PhotoOverlay, Tour, Model, Region and LOD, BalloonStyle templates, styles in another file
  (`other.kml#id`), icons from the file (a pin in the icon colour instead), time (TimeSpan, gx:Track `when`), ListStyle.
- **Parsing.** `DOMParser` with `application/xml`; a `parsererror` element means the file is refused with its first line in
  the toast. Only the coordinates text is split (white space between tuples, commas inside; a space after a comma is
  allowed). **Descriptions:** KML allows HTML, often in CDATA. `plainText()` parses it in a `text/html` document from
  `DOMParser`, which is inert (scripts do not run, images do not load), removes script, style, iframe, object, keeps line
  breaks for `br` and block elements and adds a link's URL in brackets; every card and popup puts text in with `textContent`.
  Tested: `<script>`, `<img onerror>` and escaped `&lt;script&gt;` in descriptions, names and data values: nothing ran, no
  element was made, the text shows. A description with no `<` is already plain (the XML parser decoded the entities): do not
  run it through the HTML parser, or its line breaks collapse (they did in the first round trip).
- **KMZ** without a library: the zip's end-of-central-directory record, the central directory, the local header, then
  `DecompressionStream('deflate-raw')` (Chrome 80, Safari 16.4, Firefox 113 and later; older browsers get "unzip it and
  open doc.kml"). The document is the `.kml` at the shallowest depth, `doc.kml` first. A file is a KMZ by its `PK\3\4`
  signature, not by its name. Encrypted entries and methods other than stored and deflate are refused.
- **3D drawing** (`featureMesh`): positions only through the page's `geo()`; heights in m OD: clampToGround = `groundAt` (+1 m
  for lines and outlines, +0.8 m for fills), relativeToGround = ground + altitude, absolute = altitude (KML "absolute" is
  above sea level; ODN is within about a metre of it here). Points and lines are **not** 3D meshes any more (see "Visible at
  any zoom" below). A clamped polygon fill is **draped**: one quad per 20 m terrain cell whose centre is inside the outer
  ring and outside the holes (an earcut fill at ground height crossed the ground on slopes and banks); a shape smaller than a
  cell falls back to earcut. Polygons in the air: earcut at their altitudes, extrude = walls to the ground. Fill alpha is the
  PolyStyle alpha held to 0.15 to 0.35 (a whole-box wards file at 0.4 yellow tinted the whole city); a file with no style is
  drawn yellow, as in Google Earth.
- **The model box.** Segments are clipped to `A.meta.extent` (Liang-Barsky); a point outside, or a shape with nothing
  inside, is not drawn. The file note and the toast say "n outside the model box (not drawn), n partly outside (cut at the
  edge)". Do not draw past the box: `groundAt` clamps to the grid edge, so outside shapes float (the overlay lesson above).
- **Taps.** One anchor per feature in `OV.hits` (`kml: true`) and each polygon in `OV.polys` (in front, so your own shape
  answers a ground tap first). `buildOverlays()` replaces both arrays: a 1 s timer (`sync`) puts them back, as the ships
  layer does. Names are drawn on the KML canvas (below), not as `.lb` labels.
- **Camera.** KML Camera to the page: eye = `geo(lon, lat)` at the altitude, heading = -yaw, tilt 90 = level, so the page's
  orbit point is 1.2 km along the line of sight (as `eyeView`); `ty` takes the vertical exaggeration into account. A Camera
  with no gx:horizFov gets 60° horizontal (Google Earth's default); without it a portrait phone showed 22°. LookAt: target,
  `dist = range` (80 to 16,000 m), pitch = 90 - tilt. Roll is not used (the page has no roll in this mode). Back: the drawn
  camera `CAM` (eye and target; y / VZ), lon and lat from the **inverse of `geo()`** by Newton steps (`lonLatOf`; no second
  transform), heading from north, tilt from straight down, gx:horizFov from `fovY` and the aspect.
- **Export** ("Export view as KML", a Blob download, no network): the camera as a KML Camera (absolute); the selected
  building (each model part's OSM outline at its LiDAR roof, absolute, extruded); works-in-progress sites in the box when
  that layer is on (status colour, dates and rule as ExtendedData; footprints from OSM marked ODbL); river items of the
  river layers that are on (points; OSM-derived positions marked ODbL); your own KML. The Document description holds the
  credits and licences of what is in the file (from the data's own `meta.sources` / `meta.attribution`). AIS ships are not
  exported (licence under review). Atlas: "Export <layer> as KML" writes the layer's features in the map window (Leaflet
  `toGeoJSON`, names from the tooltip, colours from the path options, `#333` short hex read too) with a LookAt of the map;
  the buildings layer is marked OSM. Leaflet `bindTooltip(string)` is HTML: the atlas gives KML names as text nodes.
- **Drop.** The window lock's `dragover` sets `dropEffect = 'none'` for anything but audio, and a drop with that effect never
  fires. The KML modules add their own `dragover` and `drop` listeners after the lock's (registration order: theirs set
  `copy` for a file item that is KML, has no type, or is XML or zip) and take `.kml`/`.kmz` drops; audio still goes to the
  player. `?kml=<url>` (http or https; the server must allow CORS) loads on open; a document view is taken, else the
  camera frames the drawn features.
- **Visible at any zoom** (owner, 2026-10-05, iPhone: "in the default view of a newly loaded KML view it is pretty hard to
  see anything at all"). Measured before (390 x 844 DPR 3, the fitted view, pixels changed by the file): Thames Path 0.14%,
  river piers 0.001% (16 pixels), listed buildings 0.10%, heritage at risk 0.07%. A 2.5 m beam is under a pixel at 12 km.
  - **Lines and outlines are screen-space ribbons** (`drawGL`, own WebGL program on the page's context, hook after
    `drawGlow()` in `render()`, then `gl.useProgram(pr)`): one segment = 6 vertices of [x y z | other end | side | metres |
    rgba] (36 bytes); the vertex shader projects both ends and offsets across the screen direction by
    max(2.5 CSS px x canvas DPR, KML width in metres x px per metre / w), plus a 1.25 px dark halo; square caps. Two passes:
    all halos, then all cores, so a halo never covers another line. Depth test on, depth write off, after the ground; each end
    is pulled towards the eye by min(d/2, 0.5 m + 0.4% of d) so the line wins over the ground it lies on but not over a tower
    in front. Ends behind the camera are moved to w = 0.05 (the photo views stand at street level). Clamped lines are
    resampled every 30 m along `groundAt`. The shader's `mode` is `uniform mediump float` in both stages: a highp vertex
    uniform with the same name as a mediump fragment one fails to link ("Precisions of uniform differ"). The program saves and
    restores the enabled vertex arrays 0 to 5, blend and depth mask.
  - **Colour**: the file's colour, its hue kept, lifted towards white until relative luminance is at least 0.42 (`vivid`);
    the dark halo gives contrast on light ground (satellite) and water.
  - **Points are pins on a 2D canvas** `#kmlOv` (over `#c`, under `#labels`, pointer-events none, hidden in `?capture`),
    redrawn by `DocklandsKML.after()` at the end of `render()`: 24 CSS px tall, tip at the point (at its altitude, with a stem
    to the ground), dark outline, white rim. **Clusters**: pins of one file in the same 48 CSS px screen cell are one circle
    (9 to 16 px radius by log2 n) with the count. A tap: the page's `ovTapPoint` finds the nearest anchor (22 px); a pin opens
    its card, a cluster flies in to its members, or lists them when they share one spot (under 25 m apart).
  - **Names** (no DOM labels any more: 1,732 buttons for listed buildings): on the canvas, white with a dark stroke; pins'
    names only when 40 or fewer single pins are on screen; line and area names at their anchor; greedy, no overlap, at most
    40, not under the top bar or the bottom controls; off with Layers > Labels.
  - Measured after (same views): Thames Path 2.3%, river piers 3.0% (9 pins, 1 cluster, 4 names), listed buildings 12% (53
    clusters, 7 pins, 1,649 on screen), conservation areas 10% lines + 5.7% names, wards 21% + 4.1%; 1600 x 900 DPR 1: 0.4%
    to 18% for every source. No KML: `?view=rotherhithe|greenland|pier&t=photo` and `?night` give the same mean luma as the
    old page to 4 decimals (0.0663, 0.0778, 0.0781, 0.0914; the sampled mean difference 0.1 to 0.8 of 255 is the moving water).
- **Fly to fit** (`fitCam`, `flyCam`): after a load (picker, drop, `?kml=`, the sources panel) the camera flies (0.9 s, eased,
  time-based) to the drawn features' box, unless the file has its own Camera or LookAt (then that view; "Fit" in the file
  row flies to the features). `DocklandsNav.stop()` first; any pointerdown or wheel ends the flight; reduced motion jumps.
  The fit projects the box corners with the page's own camera model (fovY 0.8, aspect of the canvas) and finds the distance
  by bisection so they sit inside the screen less 16 px at the sides, 12% at the top (search bar) and 13% at the bottom
  (locate, credit); three passes re-centre the target. Pitch: at least 0.95 on a tall screen, 0.72 on a wide one. The turn
  is kept unless a quarter turn needs 15% less distance (a long box on a tall screen). The page stops at 16 km: the whole
  model box on a 390 px portrait screen needs more, so whole-box files end at 16 km, slightly cut at the sides.
- **Show** (owner, 2026-10-05: "make all the KML visuals from a layer become bigger, colour cycle, jiggle, float or extrude
  upwards when a "show" button is pressed, then shrink back quickish to their location(s)"). `show(F)`: 2.2 s; 0.3 s in,
  hold, 0.4 s ease-out (cubic) back; every value from `performance.now()` (`emph`), so 2 and 120 frames a second end alike,
  and at the end the state is dropped and the next frame is the normal one. Pins and lines grow to x 2.6, colours turn about
  the grey axis (0.9 turns a second, scaled by the envelope so they unwind), the file floats up 60 to 150 m (1.2% of the view
  distance), a 3 px jiggle at 3.5 Hz; polygon outlines rise on translucent walls (`WP` program, wall quads built with the
  outlines, drawn only during Show). Reduced motion: 1.2 s, grow x 1.6 and brighten 45% towards white, no movement. Runs
  once by itself after the fly-to ends; "Show" in the load toast and in each file row (it flies there first if none of the
  file is on screen); "Fit" next to it. Measured: mid-animation 98k to 221k canvas pixels changed; after it, 1 to 7 pixels
  against 0 to 15 between two frames with no change (the water), feature positions identical, no console error, both sizes.
- **Toast**: shorter ("TfL River Piers in the zone: 12 shown, 3 outside the model." + a Show button); the cut and hidden
  counts are in the file row. On a phone it sits 48 px above the bottom and is at most 100vw - 124 px wide, clear of the
  locate buttons and the (i): measured at 390 x 844 toast [62, 717, 328, 796], locate [338, 762, 380, 804], (i)
  [358, 814, 384, 840], credit line from y 821.
- **KML sources panel** (Menu > Layers > My KML > "KML sources", replaces the 11 example buttons): `../feeds/kml/catalogue.json`
  (42 KB) fetched when the `details` first opens. Rows sorted Open, Link only, Not usable, then by features in the zone. Open =
  an open licence class (ogl, cc-by, odc-by, public-domain, cc0), `open_link` and `cors: yes`: it loads as a picked file
  does (closes the drawer on a phone, flies, Show); a file already open is shown again. Link only = share-alike: the publisher
  page in a new tab, never loaded (project rule). Not usable: the catalogue's reason (robots, no KML, no licence,
  restricted, ArcGIS on request). Filter chips are buttons with `aria-pressed`, not inputs, so "Share this view" does not
  carry them; text filter on title, publisher, licence and note; catalogue date and the README link. Rows flow in the drawer
  (no inner scroller: it scrolls with `#drawerBody`, touch-action pan-y). Measured: 40 rows (15 Open, 5 Link only), chips
  All 40 / Open licence 20 / Share-alike 5 / No licence 8 / Restricted 3 / Other 4, filter "historic" 5; no element wider
  than the 390 px screen; a touch drag scrolled the drawer 168 -> 977 px, visual viewport scale 1; all 15 Open rows loaded,
  drew and flew at 390 x 844 DPR 3 and 1600 x 900 DPR 1 (the native GLA schools KMZ, wards KML and BIDs zip too), no
  console error.
- **The 404 on first load** was `https://danbri.github.io/favicon.ico` (the page had no icon; seen on the live page with
  headless Chromium). `<link rel="icon" href="data:,">` in the head.
- **Only a real phone can confirm**: line widths at DPR 3 on a phone GPU (the shader uses highp in the vertex stage, which
  WebGL 1 guarantees there), the feel of the flight and of Show at 60 to 120 frames a second, and pin taps with a finger.
- **Measured** (2026-10-05, SwiftShader; fixtures in the scratchpad, not committed: 11 placemarks in 4 folders, 1 hidden, 1
  outside, 1 half outside, a polygon with a hole, an extruded polygon at 120 m, a StyleMap, Data and SchemaData, a Camera, a
  LookAt, a NetworkLink, a GroundOverlay; the same file as a KMZ): picker and drop both 9 drawn, 1 cut at the edge, 1
  outside, 1 hidden, NetworkLink and GroundOverlay reported; colours read as red ff0000ff -> (1, 0, 0, 1), blue 7fff0000 ->
  (0, 0, 1, 0.498); the document Camera came back from the page camera exactly (lon, lat, alt, heading, tilt); export ->
  import of the Rotherhithe view: lon and lat within 4e-8°, alt, heading, tilt and field equal; a broken file gives a toast;
  `?kml=` from another origin (CORS) and a KMZ by URL work; a tap on a pin's top opens its card; no console error at
  1600 x 900 DPR 1 and 390 x 844 DPR 3. Atlas, both sizes: 10 layers (the hidden one filtered), drop of the KMZ, popups
  text only, export of the buildings layer (141 features at zoom 17 at 1600 px, OSM licence on each) and of a KML layer
  (11), no console error.

## Drone (2026-10-05)

Owner, 2026-10-05: "Create a first person view "virtual drone" that can fly in tunnels, operate as a boat or copter/plane
etc. It must have sensible defaults, be highly automated but still respond to user input, and let us fly around
underground or on boats with v fast acceleration if needed." Code: `docklands/drone.js`, loaded after `nav.js`. It uses
the page only through `__docklands` (three new hooks: `tunnelY`, `par`, `tidalField`). Test hook: `DocklandsDrone`
(`start(mode, pose)`, `stop()`, `state`, `manual()`, `step(seconds, fps)`, `keys([...])`, `stick(x, y)`, `boost()`,
`goTo(x, z)`, `shareValue()`, `fromShare()`, and the model helpers `ground`, `surface`, `wdist`, `rails`, `buildings`,
`roofAt`, `inside`).

- **Entry.** Menu > views group > "Drone" (`#droneBtn`, after Below ground); `?drone=copter|plane|boat|tube|walk|under`;
  Share this view adds `dr=mode,x,y,z,heading,look-pitch` (nav.js reads it after the camera and calls `fromShare`; the
  shared link drops `?drone`). Leave with the cross, Esc, or any view button (the loop sees that `cam.eye` changed and
  stops without moving the camera).
- **The camera.** The drone writes `cam.eye`, `cam.target`, `cam.fov` and two new keys, `cam.near` and `cam.far`, that
  `render()` reads only when `cam.eye` is set (default 1 m and 20 km, as before). Near: copter clearance / 6 (0.5 to 4 m),
  plane 2, boat 1, tube and under 0.3, walk 0.25; far 6 km underground. Vertical field per vehicle (70 to 85 degrees),
  x 1.25 on a portrait screen. Roll only in the plane, and none with `prefers-reduced-motion`.
- **Physics.** Fixed steps of 1/120 s with an accumulator; the camera is put between the last two steps. A frame longer
  than 1 s is cut to 1 s (SwiftShader at about 0.5 frames a second runs slow, not wrong). Measured: 20 s of autopilot
  and input stepped at 2 and at 60 frames a second end at the same point (difference 0) for copter, plane, boat, tube.
- **Autopilot and the visitor.** The autopilot's share is 0 while any input is non-zero and for 3 s after, then back over
  1 s (`state.wa`). Looking around does not count as input: the path vehicles keep moving, and their look offset drifts
  back after 3 s. Auto button (or P) turns it off: the copter then holds position, the boat stops. A short tap on the city
  sets the target (`groundUnder`; walk: `vertexAt`); a search result picked while flying sets it where the page's fly-to ends.
- **Vehicles** (keys 1 to 6; speeds in m/s; boost x 10 for 2 s with a smooth ramp, capped at 300 m/s; x 4 with reduced motion):
  - Copter (30): stick = move and strafe, right drag = look and turn, lever or two fingers or Q/E = up/down (springs back),
    Space = brake to hover. Autopilot: a 450 m circle round One Canada Square at 70 m above ground, or to the target and
    hover 40 m over it; height = highest roof within 25 m of four points up to 130 m ahead + 25 m. Buildings: prisms from
    `A.buildings` (outline, holes, base + mh to base + h) in a 50 m grid; within 14 m the speed into a wall is cut in
    proportion and the rest slides; a step that enters the 2 m radius is pushed out (or onto the roof). Ground: soft wall
    1.5 m over the bilinear DTM; push down 0.6 s = pass Below ground (gauge open, cut at street level - 1 m), push up
    0.6 s from under = back up, like nav.js. Start: 300 m from the view target along the view, at least 25 m over the
    roofs within 60 m (the first start beside a 159 m tower pinned the copter at the wall).
  - Under (30): the copter below the street. Ceiling 1.5 m under the DTM, floor -60 m OD, no building collision.
    Autopilot: a 150 m circle round where it went under, at that depth.
  - Plane (22 to 80, never slower): stick x = bank (to 43 degrees), stick y or Q/E = climb, lever = speed. Turn rate
    g tan(bank) / V. Autopilot: a 1,300 m circle round the Isle of Dogs at 260 m (pure pursuit 300 m ahead), or a 400 m
    circle round the target. Pulls up when a roof or the ground within 320 m ahead is less than 40 m below.
  - Boat (10): stick y = throttle, stick x = rudder, lever = cruise speed (steering alone keeps it). An 8 m raster of
    `A.water` (scanline fill, the later polygon wins), lock gates (tidal next to impounded, or a level step over 0.5 m)
    count as bank, chamfer distance to the bank, connected bodies. Autopilot: keeps 0.45 x the body's widest distance
    (5 to 40 m) from the bank with the bank to starboard, so it follows the river or the dock round and turns at the
    model's edge; to a target it descends a breadth-first distance field over the water. Never closer than 5 m to the
    bank: it slides along it or stops. Height: the water surface (`surface`: the live tide or the sky.js tide field on
    tidal water, else the LiDAR level) + 2 m eye. No portage through locks yet: a boat stops at the gate.
  - Tube (25): rides every rail, subway and light-rail chain of `A.lines` (tunnels at `tunnelY` + 3 m, the centre of the
    6 m tunnel box; open lines on their smoothed deck + 3.5 m). Chain ends link when within 12 m and 8 m in height.
    Stick x = the turn at the next junction (remembered 6 s, else the straightest, else towards the target), stick y or
    lever = speed setting, Space = brake. Brakes to stop at a dead end and reverses after 2 s under autopilot. Below the
    street the model is cut 1.5 m above the eye (the tunnel floor and walls, and other tunnels and basements, show; the
    sky shows above). Starts on the nearest Jubilee tunnel (else any rail tunnel) within 1.5 km, eastward first.
  - Walk (1.4; 3 with the lever): the walking network (`data/indoor.js`) at 1.6 m eye, stairs 0.6, escalators 0.75,
    lifts 1.2 m/s. Autopilot: the page's `route()` from "Westbound platform 1" (Jubilee, level -3) to "Rituals" (Jubilee
    Place, level -2) when the view is at Canary Wharf, else the nearest platform; then 3 s, and back. Stick forward
    walks the edge nearest the look direction; back = turn round. Cut 2.6 m above the eye below the street.
- **Controls on the screen** (`#drone`, z-index 2 over the canvas and labels, under the top buttons and the drawer): a
  floating stick under a thumb in the lower left 70% of the left half; drag elsewhere to look (a mouse always looks); two
  fingers up or down on the right = the lever; the lever at the right edge; Boost at the bottom right (the locate
  buttons hide in drone mode); vehicle select, Auto and the cross at top right, 60 px down (the first build put them at
  8 px, under `#top`, which is full width on a phone: the cross could not be tapped). HUD at the bottom left: vehicle,
  auto / you (auto in N s) / manual, speed, height above ground, or m OD and depth below the street, or the water level.
  Keys: WASD / arrows (A/D strafe in the copter, arrows turn), Q/E up/down, Shift boost, Space brake, 1 to 6, P, Esc.
  Gamepad (standard mapping): left stick, right stick look, triggers up/down, A boost, B brake.
- **Measured** 2026-10-05 (headless Chromium, SwiftShader WebGL; 1600 x 900 DPR 1 and 390 x 844 DPR 3 touch): see
  the activity log for the numbers (each vehicle moves under autopilot; override and resume; boat 60 s on the water;
  tube within 1 m; walk route; no building entered; boost; 2 vs 60 fps; share round trip; touch stick, look, two-finger
  lift, boost, tap to go, pinch scale 1; views with the drone off unchanged).
- **Only a real phone can confirm**: how the stick and look feel at 60 to 120 frames a second and with a thumb; that the
  lever and Boost are reachable one-handed; the gamepad (not testable headless); depth precision with a 0.25 m near plane
  on a phone GPU (24-bit depth assumed; a 16-bit depth buffer would z-fight far away underground); `navigator.vibrate` on
  the pass (Android only); the frame cost of the 8 m water raster build (about 0.1 to 0.3 s once, on the first boat).
- **Not done**: lock portage for the boat; tunnel wall texture or rings (the inside of a tunnel box is flat colour, so
  speed is hard to feel); a wake; a stop at stations for the tube.

## Colours: blue is for water (2026-10-05)

Owner, 2026-10-05: "do try to keep blues for water-related". Blue and cyan in the city now mean water (the docks, the river,
the river layer's labels). Changed: indoor corridors and steps `--corr` #3fd0ff -> #e7d6ff (pale lilac); outdoor paths with a
level tag (podium decks, bridges: `out: 1` in `data/under.js`, set by `build-docklands.mjs` when a highway way or steps has a
level but no indoor, tunnel, covered or corridor tag and not every level is below 0: 580 of 1,689) `--path` #d8c49a (sand);
walking-network lifts light grey; glow chips Shops lime, Sport tan; "Colour buildings by" ramp magma (purple to pale yellow)
instead of blue to red; the station models' escalators, stairs, lifts, halls and canopies warm or grey. Kept: the DLR line
colour (TfL brand teal), the locate blue dot (phone-map convention), measured or photo facade colours, police vehicles,
UI chrome. Measured in the owner's screenshot view (Canary Wharf, cut 39 m OD, 390 x 844 DPR 3): cyan pixels 63,455 -> 0.
Two comments added at the end of a statement in long one-line code (`rampCol`, `buildUnder`) broke the script: `node --check`
caught both. Put no comment inside a one-line function.

## Plotter SVG (2026-10-06)

Owner, 2026-10-06: "Can you next make a vectorised version in SVG that I can send to my plotter?". Menu > views group >
"Plotter SVG of this view" with a paper select (A4, A3 default, "A2 (larger than an A3 plotter)"); the orientation follows
the screen. Code: `docklands/plotter-svg.js`; index.html gives it `globalThis.DocklandsPlotCtx` (A, dec, earcut, heightOf,
towerOf, groundAt, tunnelY, par, toast and getters for MVP, VZ, CAM, TOWERS) and one script tag after drone.js. Test hook:
`DocklandsPlot.make({ paper, minMm })` returns `{ svg, stats, ms, raster, occluders, paper }`; `stats` counts the lines
(pen lifts) per layer and of the credit.

- **What is drawn** (one numbered Inkscape layer per pen, each a top-level `<g>` carrying its own stroke: "1 Buildings
  and credit" black, "2 Water" blue, "3 Parks and greens" green, "4 Roads" grey, "5 Railways" red, "6 Paths with a level"
  brown, "7 Underground (tunnels, stations)" orange; the numbers stay fixed when a layer is empty): building and tower
  edges (roof and base rings, a vertical edge at a corner over about 26 degrees, pyramid edges), water and green
  outlines, both kerbs of each road, open railway centre lines, level-tagged paths (the page's heights, station floors
  inside the boxes); with the cut on, tunnel centre lines (cut out of the station boxes) and the station models' feature
  edges (a boundary, or faces more than 30 degrees apart). The credit (date, OSM ODbL, EA LiDAR OGL) is drawn in layer 1
  as single-stroke text, Hershey Roman Simplex, cap height 2.2 mm, under the drawing: from the drawing's left edge when
  it fits the drawing's width in one row or two, else from the page margin (portrait A4). A phone preview (Textastic)
  fits the page height and cuts the side margins, so a credit at the margin lost its first word there. The
  `<desc>` repeats it as text. No fills, stroke 0.3 mm, mm units, no `<text>` element.
- **Hidden lines**: a CPU z-buffer at 2 x the CSS size (long side at most 2,400 px) of the solids: building and tower
  walls and roofs, the terrain (only with the cut off; with the cut on the page draws the ground faint), and the opaque
  station parts. Triangles are clipped to the cut level and the near plane. Each edge is sampled every 0.75 px; its depth
  is that of the edge moved towards the eye by max(0.35 m, 0.3% of the distance), so an edge on a face wins against that
  face. Uses the page's own MVP, so photo views with a lens, roll and pixel art (orthographic) work too.
- **Lines on the ground are draped** on the same triangles as the terrain occluder (`surfY`): a point every half cell
  (10 m), at the line's own height or on the ground if that is higher (bridges keep theirs), plus 0.3 m (water 0.1 m).
  Before this, straight water, green, road and rail edges crossed many 20 m cells and the ground hid them where it bulged
  above the chord: in `?view=rotherhithe` 0.01 m of water edge was drawn, now 0.80 m (the far bank under the towers and
  the near river wall). `groundAt` on the page is the nearest cell, not these triangles; do not use it for draping.
- **Railway heights are smoothed** in the plot with the drone's tube rule (moving average over 5 points): open track
  heights come from the LiDAR surface model and jump between viaduct deck and ground (fault F50, up to 13 m on the DLR),
  which drew red zigzags in the owner's plot. The 3D page itself still draws the raw heights.
- **Road kerbs are mitred**: the kerb point at a bend lies on the mean of the two segment normals, at most 2 w out, so the
  two kerb pieces meet (one stroke, no notch or overlap).
- **Plotter tidy**: runs joined end to start (0.6 px), Douglas-Peucker 0.08 mm; then `join()`: line ends within 0.15 mm of
  a cluster's first end form one node, lines are edges, and Euler trails (odd nodes paired by virtual edges, Hierholzer,
  cut at the virtual edges) cover each part with max(1, odd / 2) trails. A bridge is at most 0.3 mm, the pen width, so it
  does not show. Then lines under 0.25 mm dropped, greedy nearest-end order per layer, shared walls drawn once. A building
  under 1 mm on the paper hides but is not drawn; under 3 mm only its roof outline.
- **Closed outlines were deleted (fixed 2026-10-06, owner's file "garbled, with missing lines")**. A fully visible roof,
  base, shore or park ring chains into a closed polyline whose first and last points are the same. Douglas-Peucker measured
  each point's distance to the line between the two ends; that line has zero length, the cross product is 0, so every
  distance was 0, only the two ends stayed and the ring became a zero-length line, then dropped. So the clearest buildings
  lost their roof and base outlines and kept their vertical edges: stubble and "transparent" blocks. Now a span whose ends
  meet measures the distance to that point. Default A3 view: 69.1 m -> 94.4 m drawn (25 m of outlines were lost); phone
  default view, buildings 30.0 m -> 40.3 m. Present from the first version; not seen because the tests counted lines and
  looked at whole pages, never laid the lines over the page's own image.
- **Each file names its view**: the `<desc>` holds the page's share link (`DocklandsNav.shareUrl()`, camera, layers, time)
  and the screen size in CSS px; not plotted. To reproduce an owner's plot, open that link in a headless page of that
  size and call `DocklandsPlot.make({ paper })`. Files made before 2026-10-06 22:40 UTC have no link: a closed-loop count
  dates them. Count the lines whose first and last points are the same: the outline fault left almost none (44 of
  17,513 lines in the owner's 22:18 file); the fixed code keeps every visible closed outline (809 of 12,393 lines in a
  test plot of the session, view not recorded). So an owner's "missing lines" report starts with that count, before
  any code is read.
- **Test a change by laying the plot over the page's own image** (that is how the fault above was found): render the page
  canvas (`?capture`, `renderNow`, `toDataURL`), call `DocklandsPlot.make()` in the same state, map the SVG back with the
  frame make() uses (k = min((PW - 24) / W, (PH - 30) / H) mm per raster px, ox = (PW - W k) / 2, oy = 12 + (PH - 30 -
  H k) / 2, raster = CSS size x min(2, 2400 / long side)), draw it in red over the grey image at DPR 3 and look at crops.
  A building with no red outline, or red on a face that should hide it, is a fault. To find where lines go, serve a copy of
  plotter-svg.js through `page.route` that keeps each stage (runs, chain, simplify, join, filter) and an id buffer beside
  the z-buffer (which solid won each pixel), and measure the distance from a traced edge to the nearest line per stage.
- **Measured** with the kerbs, the draping and the outline fix, default A3 view: 22,571 lines (pen lifts) for 94.4 m
  drawn; before all three, 29,501 lines for 66.6 m (with the outlines missing). Rotherhithe 570 -> 428 lines (its water
  edge comes from the draping: the old code with only the outline fix still draws 0.01 m). Canada Water phone view
  454 -> 353. Union-find clusters, with no bound on the bridge, gave buildings -58% in a simulation, but with bridges of
  any length. The greedy order is as good as the vendor's own reordering (its "full" reordering saves 2 to 3% more travel).

### The owner's plotter: iDraw 2.0 A3 (DrawCore V2.0), and how to test against its software

Owner, 2026-10-06: "verify that your plotter functionality is optimal for" an iDraw 2.0: DrawCore V2.0 board, GRBL
compatible, "iDraw 2.0 Control", working area 420 x 297 mm, 0.01 mm precision, 445 nm diode laser (fixed focus, PWM
S0-S1000, engraving 0-5,000 mm/min), writing 0-12,000 mm/min, 115200 baud.

- **The vendor path is SVG**: Inkscape 1.2+ with UUNA TEK's "iDraw 2.0 Control" extension (`idraw2_0.inx`; laser:
  `idraw2_0_laser.inx`, same SVG code with PWM). It is a fork of the AxiDraw extension (internals say 3.9.5), sending a
  GRBL dialect. A public copy of the shipped extension, with an analysis of every firmware command, is in
  https://github.com/TLausZ/plotter-studio (`extensions/`, "iDraw Extension Analysis 2026-09-02.md"; GPL-3, used only as a
  test tool, not committed). Model 2 (A3) has 430 x 297 mm of travel; a portrait page is turned (`auto_rotate`). A2
  pages are clipped ("iDraw movement was limited by its physical range of motion").
- **What it does with our SVG** (read in `digest_svg.py` and `path_objects.py`): only stroked paths plot; `<text>` and
  images are skipped with a warning (the first version's credit was text: it never plotted); a layer is a
  `groupmode="layer"` group met while no other layer is open; "plot layer N" needs a name that starts with N ("1 ...";
  our first names had none, so that tab plotted nothing); `%` names are never plotted; `!` pauses; `+s`, `+h`, `+d` set
  speed, height and delay per layer. Default `reordering = 0` (our order is used; ends within 0.2 mm joined, no reversal).
- **Run it headless** (no plotter needed): copy `extensions/`, delete `idraw_deps/lxml` (built for CPython 3.7), make a
  venv with lxml, pyserial, requests and mpmath, `cd` into the copy (it finds `idraw_deps` from the working directory),
  then `python idraw2_0_control.py --mode=plot --preview=true --model=2 --report_time=true file.svg > preview.svg`;
  `--mode=layers --layer=N` plots one layer; `--reordering=2` is its best ordering. It prints the estimated time, pen-down
  and pen-up distance, and every warning.
- **Its time estimate ignores pen lifts**: `raise_time` and `lower_time` stay 0 (the timing code is commented out). So 31%
  fewer pen lifts did not change the estimate (default A3 view 1:43:47 -> 1:44:08, with the credit's 169 strokes and the
  draped lines added; 2:08:50 once the outline fix put back 25 m of line). On the machine each lift moves the pen 4.5 mm down and up (Z at 5,000 mm/min by default), so the
  count of lines is the measure to use. Real plotting time is not measured; there is no plotter here.
- vpype (`vpype read x.svg stat`, 1.15) read the first version as one layer (the layers were inside a styling `<g>`); it
  reads the numbered top-level layers as layers.
- **Not done, on purpose**: a G-code export. The board takes GRBL G-code (UGS, LaserGRBL), but its axes are swapped and
  negated against the page (document x -> machine -Y, y -> -X, home rear right; from the extension's code) and the pen is a
  Z height; a file that is wrong on a machine nobody here can test can drive the pen into the paper edge. The vendor's
  extension takes the SVG and handles both.
- Measured after these changes and the outline fix (headless Chromium, A3 unless stated): default view at 1600 x 900 DPR 1:
  22,571 lines + 169 credit strokes, 94.4 m, 11 s, 1.4 MB, vendor estimate 2:08:50; default view at 390 x 844 DPR 3
  (portrait) 10,072 lines, 47.8 m, 550 kB, estimate 59:27, through the button and a real download; `?view=rotherhithe`
  428 lines; `?view=under` 9.5 m, estimate 6:44; 390 x 844 DPR 3 portrait A4 from `?view=greenland` through the button, 465
  lines, 33 kB, credit on two rows. No console error; xmllint well formed; no warnings from the vendor preview on A3 and A4.

## Line styles (2026-10-07)

Owner, 2026-10-07: "is this stylized view possible to add within the app itself? Ideally in realtime? Use webgpu and wasm
if needed. Possible variations: a crt style ui in tribute to classic vectrex console- which drew lines directly as needed".
Layers > Style > "Line drawing" (`?lines`) and "Vector CRT" (`?vectrex`). Live:
https://danbri.github.io/londat/cwplans/docklands/?lines
and https://danbri.github.io/londat/cwplans/docklands/?vectrex. Code: `docklands/line-styles.js`
(`DocklandsLines`). Hooks in index.html: the radios, `lineOn()` (`nightOn()` asks it: Night is off in these styles), a
branch at the top of `render()` after the fresh state, `setStyle()` (now a wrapper; pixel art is `setPixStyle()`),
`DocklandsLinesCtx`, and the script tag after plotter-svg.js. Check tool: `node cwplans/tools/check-line-styles.mjs
[--out DIR] [--style vectrex]` (about 2 min).

- **No WebGPU, no wasm.** WebGL 1 with `ANGLE_instanced_arrays` (the splats need it already) is enough: the edges are built
  once in JS and the depth test removes the hidden lines. Without the extension the style stays Map (toast).
- **One set of edge rules.** plotter-svg.js's `scene(P, opt)` is shared: `opt.emit(layer, a, b, g)` takes each edge with
  `g = [size m, rank]`; `opt.small(box)` is the plotter's 1 mm / 3 mm rule (`smallOf`); `opt.tri` takes the occluders (the
  line styles pass none: the page's own meshes hide the lines); `opt.under` adds the underground edges with no cut.
  `DocklandsPlot.scene` and `.LAYERS` are exported. After the refactor the SVG of `make({ paper: 'A3' })` was
  byte-identical at four views (default 1600 x 900, `?view=rotherhithe`, `?view=under`, 390 x 844 DPR 3) except the
  credit's date strokes. Check that again after any change to `scene()`.
- **Method.** (1) The solids go into the depth buffer with the colour mask off: buildings and fitted towers (`drawFacades`,
  only with Buildings: Solid), the terrain (no cut) or the opaque station parts (cut open). (2) Each edge is one instance
  of a 4-vertex strip. The vertex shader moves both ends towards the eye by max(0.35 m, 0.3% of the distance) (the
  plotter's depth tolerance; along the line of sight, so the picture does not move), clips at the near plane and widens
  the quad on the screen to 1.1 CSS px (Vector CRT 1.4), with a half-pixel soft edge; under 1 device px the alpha falls
  instead. No polygon offset was needed. The fragment shader drops the part above the cut. Pen colours from plotter-svg.js
  `LAYERS`, white paper. See-through buildings: no building occluders, building lines at 35%; Hidden: none.
- **Size rule (the real-time form of the plotter's 1 mm and 3 mm).** Each edge carries a size (its building's box: largest
  of width, depth and height; a water or green outline's box; a road's width) and a rank: 0 roof outline, 1 base ring and
  corner verticals, 2 water or green outline or kerb, 3 always (pyramid edges, railways, paths, underground). Projected
  size = size x focal / depth; the edge fades out from 1.6 x the limit down to the limit: 4 CSS px (rank 1: 12), which are
  1 mm and 3 mm on an A3 plot of a 1600 px screen. Vector CRT 6 px: at 4 px the far city ran into a glare. Far kerbs fade too (the plot
  draws them all): most of what the plot has and the line drawing lacks.
- **Tiles.** 400 m tiles by the edge's middle (285 tiles); inside a tile the edges are sorted by size (rank 1 a third of
  it, rank 3 first). Each frame the 8 corners of a tile's box go through MVP: a tile wholly outside one plane is skipped,
  else only the prefix of edges that are big enough at the box's least depth is drawn (depth is linear, so its least value
  over the box is at a corner; binary search). Default view 1600 x 900: 175,328 of 838,254 edges in 103 draw calls;
  390 x 844: 63,870 in 35. Same picture as drawing all edges (0.7% of pixels differ, where two colours cross and the order
  changed). SwiftShader frame 13-14 s -> 4.8-5.0 s at 1600 x 900.
- **Ground pieces merged.** Draped lines arrive in 10 m pieces; consecutive pieces of one line join while every point stays
  within 5 cm of the joined edge (at most 40 pieces): water, greens, kerbs and railways 244,166 -> 139,535 edges.
- **28 bytes an edge**: two float32 ends, then layer, rank and size (2 bytes, quarter metres). A 16-bit version (12.5 cm steps
  round the middle of the box, 16 bytes) put the near river wall 3 px off in `?view=rotherhithe` (1 px precision against the
  plot 95.5% -> 98.6% with floats): the photo views and the Drone look at lines a few metres from the eye.
- **Built once per state** (cut open or not, storey, tunnel shape, the Underground and Station-model switches, towers
  loaded, station boxes) in a timer after the "Drawing the lines…" toast: 1.8 to 2.9 s in this container's Chromium.
  The map style shows until the first build is done; a rebuild keeps drawing the old lines.
- **Measured** (2026-10-07, headless Chromium, SwiftShader): 838,254 edges (buildings 695,771; water 8,286; greens 24,369;
  kerbs 95,180; railways 11,700; paths 2,948): 23,471,112 bytes (22.4 MiB) in one buffer. Cut open: 868,232 (+27,813
  underground, +2,165 paths below ground). For scale: the building mesh is 1,226,712 vertices and 1,957,656 indices,
  52 MB. Frame (renderNow + a 1 px readPixels): 1600 x 900 map 2.0-2.2 s, Line drawing 4.8-5.0 s; 390 x 844 DPR 3 map
  1.0-1.2 s, Line drawing 1.9-2.0 s (the check tool's single frame read 6-13 s at 1600 x 900 on the shared machine).
  SwiftShader runs the vertex shader on the CPU; these numbers say nothing about a phone GPU. Not measured on a phone.
- **Against the plot** (check-line-styles.mjs: the line drawing, and the SVG drawn at the canvas size in make()'s frame;
  ink is luma under 0.8; recall = plot ink with a line-drawing line within 1 or 2 px, precision the other way): default
  1600 x 900 recall 94.8-95.0% and precision 99.9% at 1 px, 97.2-97.4% and 99.98% at 2 px; Rotherhithe 98.8-98.9% and
  98.6-98.7%, at 2 px 99.9% and 99.4-99.5%; 390 x 844 94.7-94.9% and 99.96%, at 2 px 97.9% and 99.99%. The tool's floors:
  recall 95% and precision 97% at 2 px.
- **Photo views unchanged** (Map style, mean luma, committed page / this change): Rotherhithe 0.09446 / 0.09446, Greenland
  0.10130 / 0.10131, pier 0.10909 / 0.10908 at 1600 x 900; 0.06629 / 0.06628, 0.07776 / 0.07777, 0.07811 / 0.07812 at
  390 x 844 DPR 3 (the ripples move with time).
- **Not drawn** in the line styles: sky, Night, splats, trees, overlays (live state, London Datastore, ships, river, My KML
  lines), glow chips, the faint ground of a cut. The tap highlight and the route are drawn on top. Labels: dark with a white halo on paper, blue-white glow on the CRT (`body.lstyle-lines`, `body.lstyle-crt`).
  Picking is the page's own pick pass and does not change. The cut draws no outline where it cuts a building.
- **Faults found on the way.** (a) The share link never carried a radio: `keyOf()` gives '' for an input with no id, and
  no radio has one, so the style (pixel art), ground image, buildings mode and splat mode were left out of every link
  since the share feature began. nav.js now keys a radio by its name (`r=style:lines`). (b) A `setTimeout(…, 50)` in the
  inline script can fire before a later `<script src>` has loaded (the parser waits on the network; timers run), so
  `?lines` set the radio while `DocklandsLines` did not exist yet. line-styles.js reads the switch itself.

### Vector CRT (2026-10-07)

- Lines added (blend ONE, ONE) on black, each layer a brightness of one blue-white phosphor (buildings .9, underground .8,
  railways .7, water .55, paths .5, greens .42, kerbs .34). "Colour overlay" (`crtOverlay`, in the share link) tints them
  per layer, as the Vectrex's plastic screen overlays did. No scanlines: a vector screen has none.
- Passes. The lines are drawn into the default framebuffer (for its 24-bit depth) and copied to a texture
  (`copyTexSubImage2D`, as the night bloom does), only when the view changed (key: MVP, size, buildings mode, cut,
  overlay, roads, and the highlight and route meshes). Afterglow: max(new, old x exp(-dt / 0.09 s) - 1.5/255) into one of
  two textures used in turn. Glow: a quarter-size 4-tap average without a threshold (the night bloom's `BP.bright`
  threshold leaves a 1 to 2 px line too dim to glow), blurred twice across and down with `BP.blur`. Screen: `BP.add` of the
  afterglow x flicker, then the glow x 0.8 added. Flicker: 0.955 + 0.03 sin(61 t) sin(19.5 t) + 0.02 noise.
- The 1.5/255: an 8-bit texture rounds 0.8 x 1/255 back up to 1/255, so without it a trail never fades to black.
  `check-fp16-shaders.mjs` runs the fade in fp16: a full pixel reaches 0 in 19 frames at 60 frames a second (11 at 30).
- Redraws all the time (requestAnimationFrame) only while this style is on. A still frame is only the afterglow, glow and
  screen passes: 0.06 to 0.19 s here at 390 x 844 DPR 3, 0.10 s at 1600 x 900; a moving frame adds a line frame.
  Afterglow measured at 390 x 844 DPR 3 with `DocklandsLines.testDt = 1/60` (a fixed frame time) and a turn of 0.06 rad
  between two frames, two runs (the flicker moves the counts): lit pixels (blue over 60) still 448,457 and 451,568,
  moving 707,297 and 716,058, after 40 more frames 457,775 and 459,014.
- First tuning (glow x 1.8, layer brightness 1, the 4 px size rule) made the far city a white haze; the values above are
  after the change, judged by eye on the 1600 x 900 frame.

## Station models (2026-10-05)

Layers > Show > "Station models" (on): the Blender boxes of Canary Wharf and Canada Water, `docklands/stations-layer.js` +
`data/stations.json`. Hooks in index.html: the script tag; `DocklandsStations.draw(0)` after `L.under` and `draw(1)` after
`OV.glass`; `init(...)` before `window.__docklands`; `buildTunnels`/`buildUnder` cut the station rectangles out
(`outside()`, `inside()`, keys with `hideKey()`); `vY` asks `levelY()` for negative levels. drone.js `vpos` too. Details,
measurements and the open Windrush-level finding: skill `blender-station-models`, section 8.

## Building keys: any building by OSM id or position (2026-10-06)

Owner, 2026-10-06 (after the Canada Water photos): "change the 3D page to find buildings by OSM id or position? ... Yes,
do our whole area and be mindful of possible future expansion". Live (tap any building, or search "Ontario Point"):
https://danbri.github.io/londat/cwplans/docklands/#v=1&c=-2040.8,823.4,0,249,2.0799,0.6315&n=0&u=0&id=osm:w204580680

- **The keys.** `tools/key-model-buildings.mjs` (operation `key-model-buildings`, skill `cwplans-dataflow`) gives every
  one of the 41,803 model buildings its OSM way or relation, exactly: each OSM outline of `osm-clip.json.gz` goes through
  build-docklands.mjs's own steps (`polysOf`, `toRings` with the focus-box tolerance, `poly`) and the encoded outline is
  compared with the model's. 85 outlines are equal for two elements (a multipolygon's outer that is also a building way,
  parts drawn twice): the build's order (outlines without parts, then parts) aligns them; 25 build outlines are not in
  the model (its height filter) and are passed over. Tags come from the full extract with `osmium getid` (the clip keeps
  no `addr:*`, so "Ontario Point", an `addr:housename`, was missing at first). Measured: 41,803 of 41,803 aligned, 42,464
  OSM elements, 4,022 names, 3,054 house names, 23,607 addresses; 5 min (Flow writes 183,485 triples).
- **`data/building-keys.json`** (2.6 MB, 448 kB gzip; loaded by `building-keys.js` on the first tap on a building with no
  registry record, the first search, or a link with `id=osm:`): `ids` (comma-joined, index-aligned with area.js),
  `osm[id]` = { n name, h house name, a house number and street, pc postcode, b building type other than yes, l levels,
  wd Wikidata, p parent of a part }, and `model` = { sha256, fp }. **`MFP`** (in the page) and `fp` are the same string,
  `<count>:<first 6 numbers of building 0's outline>:<same for the last>`: when they differ the keys are for another
  area.js and the page says so instead of naming the wrong building.
- **The OSM card**: name (OSM name, else house name, else the parent's for a part, else the address, else the type), OSM
  type and id, address, model height and its source, roof and ground in m OD, OSM levels, the facade tile if any,
  "No registry record", route buttons, OSM, knowledge graph (`../kg/#e=id:osmw<id>`) and Wikidata links. A part stands for its parent: every part is outlined.
  **Search** adds OSM names, house names and addresses of buildings with no registry record (at most 40, then the page's
  sort and cut at 14). **Share**: `id=osm:w204580680` (nav.js), restored after the keys load.
- **Facades for any building.** `tools/compose-facade-atlas.mjs` (operation `compose-facade-atlas`) writes the page's
  `facades.jpg/.json` from `facades-registry.*` plus every contributed tile set (`facade-tiles-<set>` graphs from
  `tools/contrib-photos.mjs`, operation `cut-facade-tiles`; hub skill, "Contributed photos"). A contributed entry is keyed
  `osm:w<id>` and carries `mi` (model indices, parts included), `model_fp` and `at` (a WGS84 point inside the building).
  The page uses `mi` when `model_fp === MFP`, else `modelAt(at)` (the highest model building whose outer ring holds the
  point; 13 to 17 ms each). Measured: the five cwlibrary entries give the same index both ways.
- **The first hook was wrong**: `Object.assign(window.__docklands, { get FT() {...} })` copies the getter's value (null)
  once. Use `Object.defineProperty` for a live value, as `selected` does.
- **Measured** (headless Chromium, SwiftShader, 2026-10-06): tap on Ontario Point at 1400 x 1000 DPR 1 and 390 x 844 DPR 3
  -> model index 6448 -> its card; search "regina" -> "Regina House (Regina Point)"; a registry building still gets its
  registry card; the share link round trip opens the same card; `check-fp16-shaders.mjs`: prF still 25 fragment uniform
  rows; ?view=rotherhithe, greenland, pier: mean luma equal to the old page to 1e-4 at both sizes; no console error.

**Future expansion** (rules, so a larger area or more photos need no new design):
- Keys are global (OSM type + id, WGS84 points); model indices are only a cache for one area.js, checked by `MFP`. After
  any rebuild of area.js run `key-model-buildings.mjs`, then `compose-facade-atlas.mjs`. If the model is ever split into
  tiles, write one ids list per tile with its own fingerprint; `osm` facts stay keyed by id.
- The key tool needs the clip area.js was built from: it stops when a model building has no OSM outline in it.
- Slots: 32 in the atlas and the shader (16 rows of `vec4`, the same rows the 16 `vec2` used). The compose step stops at
  33. Past 32: put the tile size into the vertex data (the `u` coordinate already carries metres along the wall), or a
  second 2048 x 1024 atlas page with its own sampler (one more texture unit), and check `check-fp16-shaders.mjs`.
- Pick colours hold 24 bits: room for 16.7 million buildings.
- A contributed set adds tiles without code: photos.json `tiles` (photo cut or vector pattern, metres, a point per
  building), then `contrib-photos.mjs <set>`, `compose-facade-atlas.mjs`, `build-kgx.mjs`.

## Detailed building models (2026-10-08)

Owner, 2026-10-08, with a CC0 photo of the Pacific Tavern, Redriff Road: "Extrapolate a full 3D model and add it to rep
as new default for that building." Live: https://danbri.github.io/londat/cwplans/docklands/#v=1&c=-1494.7,995.9,4,90,0.35,0.4&n=0&u=0&id=osm:w259277099

- **Files.** A hand-made description per building, `docklands/models/<osm id>-<name>.spec.json` (frames on the model
  outline, sizes, colours, and the evidence for each); `tools/lidar-roof-profile.py` writes the LiDAR roof profile
  beside it; `tools/build-building-models.mjs` (logged operation `build-building-models`, kgx graph `building-models`)
  writes `docklands/data/building-models.json` (the page file) and a `.glb` per building. `BM_DRY=1` writes the outputs
  without a log entry while you edit a description; commit the outputs of a logged run.
- **Frames.** A frame is three ring vertices of the area.js outline: origin, a second corner (u along the wall), and a
  corner inside (o into the building). Heights are above `b` (the model ground). A description is for one area.js
  (`model_fp`); the tool stops when the fingerprint differs. After an area.js rebuild, check the ring vertex numbers.
- **Builder parts** (in the tool, reusable): gabled wing with gable parapets, coping and kneelers; a wall with
  rectangular openings (grid cut, reveals 0.12 m, glass, frame and glazing bars 2 cm in front of the glass); boxes
  (fascia, sills, lintels, pipes, railings); a bay with a segmental lead hood that runs back to the roof; discs (a sign).
  Every triangle is wound with its normal outward, so the page shades from the winding.
- **Page.** `bmodF()` in index.html puts the model into the building mesh (`MeshF`) instead of the extruded outline of
  its model indices (`bmodOf`), when Layers > Show > "Detailed models" is on and no historic skyline is shown. Colours
  are the model's own in the default colouring (`colourBy` = source), Pixel art and Photo style; a data colouring gives
  the data colour to every part. `u = -1000` on every vertex (no window grid, no ground image), except glass: each pane
  gets `u = 0.9 + 1.8 k` (the middle of window cell k), so Night lights panes as it lights windows. Picking, Line drawing, the plotter and Drone still use the extruded outline. A selected detailed model gets no
  pink outline, and since 2026-10-08 every selection outline is depth-tested (owner: the boxes "are drawn even when
  occluded. Not needed."); the route line stays on top. The OSM card has a "Detailed model"
  row (`modelOf` in `DocklandsKeysCtx`). Hook: `__docklands.BMOD`.
- **Pacific Tavern** (OSM way 259277099, model index 7477): 24 parts, 2,080 triangles, top 14.72 m OD. The OSM outline
  is two wings at 57 deg. The photo shows the south wing's east-south-east face (ring 2 to 1, 19.93 m) nearly square on,
  at about 127 px a metre. LiDAR (DSM 2022 and 2020 minus DTM 2022): south wing ridge 8.7 m, eaves 6.1 m, 9.7 m deep
  (OSM says 11.4 m: the model keeps the LiDAR); north wing one storey, eaves 3.4 m, ridge 6.0 m. The rear face, the
  south gable end and the north wing's windows are not in the photo: marked "extrapolated" in each part's basis.
- **Measured** (headless Chromium, SwiftShader WebGL, 2026-10-08): no page error at 1400 x 900 DPR 1 and 390 x 844 DPR 3
  and with `?view=rotherhithe`; the card link above opens the card. A share link with `dist` under 80 is raised to 80
  by the page; at yaw 0.35 a building east-south-east of the tavern then hides it below pitch about 0.3.
- **Faults met.** Vertex positions rounded to cm put the sign's layers 5 mm apart on one plane (z-fighting): the page
  file is in mm; keep layers at least 5 mm apart. The bay was in shade in the photo: its colours are judged, not read.
- **Next building:** copy a spec, set the frames and sizes from a photo (`photos.json` in the contrib set) and the
  LiDAR profile, run the profile tool, the builder, `npm test` (building-models.test.mjs), the register check.

## Roof shapes (2026-10-08)

Owner, 2026-10-08: "the buildings without custom models are painfully flat and samey. We should try at a minimum to
guess roof types, but ultimately to get more realism." Live (terraces in Deptford, then Bow; then terraces with rear
outriggers and L-shaped blocks drawn in parts, near Deptford Park):
https://danbri.github.io/londat/cwplans/docklands/#v=1&c=-1450,3480,4,160,0.6,0.7&n=0&u=0 and
https://danbri.github.io/londat/cwplans/docklands/#v=1&c=-1425,1875,4,220,0.3,0.6&n=0&u=0 and
https://danbri.github.io/londat/cwplans/docklands/#v=1&c=1875,-1875,8,260,0.5,0.65&n=0&u=0

- **Files.** `tools/lidar-roofs.py` (the measurement), `tools/build-roofs.mjs` (logged operation `build-roofs`, kgx
  graph `roofs`, skill `cwplans-dataflow`), `docklands/data/roofs.json` (the page file, 641 kB, 235 kB gzip),
  `docklands/roofs-layer.js` (the page builder), `tools/test/roofs.test.mjs`.
- **Evidence.** EA LiDAR composite first-return DSM 2022 1 m and composite DTM 2022 1 m (OGL v3.0), tiles TQ3075,
  TQ3080, TQ3575, TQ3580 (5 km; the model box x -5150 to 2350, z -2000 to 3600 is E 532400 to 539900, N 176700 to
  182300). URL: `https://environment.data.gov.uk/tiles/collections/survey/<product>/2022/1/<tile>`; saved as
  `<product>-2022-1-<tile>.zip`, not committed (60 to 72 MB each), read from the zips. SHA-256 (also in the activity
  log): dsm TQ3075 c9f1aa1f..., TQ3080 efc1b560..., TQ3575 63198a13..., TQ3580 35b92868...; dtm TQ3075 88209ad5...,
  TQ3080 ac6d4197..., TQ3575 819827eb..., TQ3580 de716810... . OSM: `roof:shape`, `roof:height`, `roof:levels`,
  `roof:orientation` from the openstreetmap.fr Greater London extract of 2026-10-07 (osmium tags-filter), joined by the
  OSM id of each model index (`building-keys.json`).
- **Method.** For each model building with height 25 m or less, no holes and no min_height (38,674 of 41,803): the
  1 m cells whose centres are inside the outline and 0.75 m or more from its edges (8 or more cells, else "nodata"),
  DSM minus the model ground `b`. In the outline's minimum-area rectangle (u along the long side, bearing in 0 to 180
  deg; v across), four fits by least squares with one trimming pass (cells off by more than max(0.3 m, 2.5 robust
  sigma) out): flat; gable with the ridge along u; gable with the ridge along v (each with the ridge offset searched in
  0.5 m steps within 30 % of the span: a London house with a rear outrigger has its ridge off the middle); hipped
  (`R - k max(|t|, |s| - (L - W)/2)`, one slope on four sides). Score: median absolute residual (MAD).
- **Rules** (`P` in build-roofs.mjs, written into roofs.json `rules`): a pitched fit is kept when slope k is 0.18 to
  1.8 (10 to 61 deg), rise k x span/2 is 1 m or more, eave 2 m or more, MAD 0.45 m or less, MAD at most 0.7 x the flat
  fit's and at most a quarter of the rise. Hipped only when its MAD is under 0.8 x the best gable's; pyramidal when the
  rectangle's sides are within 1.2 of each other. Else flat (flat MAD 0.3 m or less) or complex. Eave = ridge - k x
  span/2 (with an offset ridge: the mean of the two sides). OSM `roof:shape` gabled / hipped / pyramidal is used only
  where the LiDAR gave no shape (complex, nodata) and the LiDAR gable fit in that ridge direction does not slope the
  wrong way (k >= 0.18); then ridge = model height, eave from `roof:height`, else `roof:levels` x 2.5 m, else 35 deg.
- **roofs.json.** `model` {fp = `MFP`, sha256 of area.js}; `s` (comma-joined codes g, h, p; `go`, `ho`, `po` from OSM);
  `r` (8 integers a row: model index as a delta, ridge centre x and z in dm, ridge bearing in 0.1 deg, eave and ridge in
  cm above `b`, half span in dm, half ridge length in dm or -1 for a gable); `counts`; `osm_vs_lidar`.
- **Page.** `roofs-layer.js` loads before the inline script; index.html loads `data/roofs.json` after the start,
  `DocklandsRoofs.decode(T, MFP)` (null and a console warning when the fingerprint differs), and `buildBld()` calls
  `DocklandsRoofs.prism(M, b, roof, col, alOf(mat), { dec, shade, earcut })` instead of `prismF` for those buildings
  when Layers > Show > "Roof shapes" (`#showRoofs`, on) is on and no skyline year is shown. The roof is the lower
  envelope of the planes (two, or four when hipped), never below the eave or above the ridge. Walls: each outline edge
  is cut where the envelope changes plane or meets the eave, so gable ends are the walls' sloped tops (window grid on
  them, as on any wall). Roof faces: the outline clipped (Sutherland-Hodgman) to the region where each plane is lowest,
  earcut, lifted onto the plane, u = -(1 + ridge) (no window grid; the ground image on roofs under 40 m). Night kind
  uses the ridge. Picking, Line drawing, the plotter, Drone and the selection outline keep the prism. Hook:
  `__docklands.ROOFS` (Map model index -> roof).
- **Measured** (logged run 2026-10-08, 9 min 52 s, of which lidar-roofs.py about 7.5 min; graph version
  `https://kgx.foaf.tv/id/graphroofsb45bbd1ff77f4146`, 90,735 triples): LiDAR gabled 17,167, hipped 433, pyramidal 183;
  OSM gabled 287, hipped 49, pyramidal 30 (18,149 roofs drawn); flat 7,052; complex 12,513 (stay flat); nodata 960.
  - **Hand check against the DSM** (two throwaway scripts, not committed: DSM height and hillshade with
    the outline and the ridge line, and the profile across the ridge; a random sample stratified by class, seed 11):
    pitched 17: 12 right (form and ridge direction), 4 doubtful or not checkable (a small outline on a larger roof,
    one OSM turret with no cells), 1 wrong ridge direction (index 33539, an outline on a T-shaped building). Flat 6 of
    6 right. Complex 6: 4 have pitched roofs in the DSM (missed), 2 unclear. An earlier sample (seed 7, rules before
    the eave change) gave 15 right and 2 doubtful of 17 pitched, 4 of 6 flat right (one terrace of pitched roofs classed
    flat), 4 of 6 complex missed pitched roofs.
  - **Fit against the raw cells** (29 LiDAR-pitched buildings of both samples): ridge height minus the 75th percentile
    of the cells within 0.75 m of the ridge line: median +0.08 m, median absolute 0.18 m, 90th percentile 0.38 m; the
    roof height at the outermost 1 m of cells minus their median: median absolute 0.10 m, 90th percentile 0.63 m.
  - **Pacific Tavern** (index 7477; known: gable, eave 6.1 m, ridge 8.7 m, 28 deg): as one L-shaped outline it is
    "complex" (stays flat; the page draws its detailed model anyway). Its south wing alone (frame S of the spec, 19.93
    x 9.7 m, as a one-building area.js): gable along the long side, ridge 8.82 m, eave 6.30 m, slope 0.516 (27.3 deg),
    MAD 0.08 m against flat 0.55 m.
  - **OSM `roof:shape` against the LiDAR class** (elements with both): OSM gabled 4,576: LiDAR gabled 3,546 (77 %),
    complex 749, flat 244 (5 %), hipped 17, pyramidal 8. OSM hipped 718: LiDAR gabled 507, hipped 20, complex 140, flat
    38. OSM flat 1,839: LiDAR flat 889, complex 655, gabled 149 (8 %), nodata 131. Of the LiDAR pitched roofs with an
    OSM flat / gabled / hipped / pyramidal tag, 3.7 % have OSM flat.
  - Page (headless Chromium, SwiftShader WebGL): no page error with `?view=rotherhithe` at 1600 x 900 DPR 1 and
    390 x 844 DPR 3, `?view=greenland` (1600 x 900), `?view=pier` (390 x 844 DPR 3) and the aerial links; Rotherhithe view mean luma with and
    without roof shapes 0.09340 / 0.09348 (1600) and 0.06705 / 0.06711 (390 DPR 3): the night photo view barely
    changes; the terraces in the aerial links show pitched roofs.
- **Faults met.** (a) `earcut` is not a global function on this page (`globalThis.earcut.default`, bound in the inline
  script): roofs-layer.js threw inside `buildBld()`, which runs in the `.then` of four loaders whose `.catch` only
  warns, so every building vanished with no console error. Pass page functions in the context; capture console
  warnings in headless runs. (b) The bearing was first written modulo 180, which flipped u for half the buildings and
  so the sign of the ridge offset: the profile check showed ridge cells lower than edge cells. u is now normalised to a
  bearing in 0 to 180 before the fits. (c) OSM `roof:shape=gabled` on buildings whose LiDAR fits slope down to the
  middle (valley or butterfly "London" roofs): the rule against the LiDAR fit removed 486 OSM roofs (852 to 366).
- **Parts (operation version 2, 2026-10-08).** Owner: the ordinary buildings are "painfully flat and samey". The
  12,513 complex outlines of version 1 (L and T shapes, wings, rear outriggers) are now cut into parts.
  - **Cut** (`lidar-roofs.py`, `decompose()`, rules `CUT`, written into roofs.json `cut_rules`): an outline whose area is
    under 0.9 of its minimum-area rectangle is cut by chords from its reflex corners (turn 20 deg or more; the extension
    of the edge before or after the corner to the first edge it meets; within 0.3 m of a vertex it snaps to it). A chord
    must run within 12 deg of an edge of 3 m or more (else a short skewed notch edge cut a long diagonal slice: index 6270,
    first run). Each piece is cut again while it is under 0.9 of its rectangle, up to 10 pieces, no piece under 10 m2 or
    2 m wide. Choice: the least waste (rectangle area minus piece area of the two pieces); cuts within 2 m2 (or 5 %) of
    the best are decided by the LiDAR (the summed error, cells x the best fit's median absolute error). Each piece is
    fitted like a building (cells 0.75 m from the outline and 0.4 m from the cuts).
  - **Fifth fit:** one inclined plane (skillion: `h = c + a s + b t`), kept when the slope is 0.08 to 1.0, the rise 0.6 m
    or more, and its error under 0.8 of the best gable's. The ridge is the high edge, through the outline vertex furthest
    uphill; bearing 0 to 360, the plane falls to the right of it.
  - **Choice** (`build-roofs.mjs`, `P.parts_gain` etc.): a complex building with at least one pitched part, or a LiDAR
    pitched building whose parts' summed error is under 0.75 of its one roof's (the rear outrigger fault), is drawn in
    parts. A part with no pitched fit is flat at its fitted level (at least 2 m, at most the model height + 1 m); a part
    with no cells at the highest eave of the others. A gable whose piece ends at a cut that crosses its ridge line,
    against a gabled or hipped wing whose ridge is 53 to 127 deg from its own (`cross_dot` 0.6) and no more than 0.3 m
    lower, runs on into that wing up to its ridge (`e0`, `e1`): the two roofs make a valley. A taller wing keeps its
    gable end at the cut.
  - **Same pieces in three places.** `roofs-layer.js` `pieces()` / `splitRing()` and `lidar-roofs.py` `split_ring()`
    must cut alike (a cut is `[piece, edge, t x 10000, edge, t x 10000]` on that piece's ring; the first piece is
    replaced, the second appended; a vertex within 1 mm of the next is dropped). `build-roofs.mjs` cuts with the page's
    code and stops when a piece differs from the Python ring by more than 1 cm. Change both or neither.
  - **roofs.json `m`:** per building: model index delta, number of cuts, the cuts, then 10 integers a part (shape code
    0 flat, 1 gabled, 2 hipped, 3 pyramidal, 4 skillion; x, z dm; bearing 0.1 deg; eave, ridge cm; half span dm; half
    ridge length dm or -1; run before / after the piece dm). Single roofs stay in `s`/`r` (code `k` = skillion).
    1,303 kB, 475 kB gzip (version 1: 641 kB, 235 kB).
  - **Page** (`prismParts()`): covers = each part's piece and its runs (the outline clipped to the band of the piece
    across the ridge, beyond the cut line, to the run's end). Outline walls go from the ground to the highest roof over
    each point (membership tested 2 cm inside); each cover's inner edges (cuts, run boundaries) get a wall only where its
    roof stands above every other cover there (tested 2 cm outside), so there are no gaps and no coplanar overlaps.
    Faces: each cover clipped per plane and at the eave and ridge; the depth test draws the union of the roofs. A run
    only crosses a wing with a different ridge direction, so faces never overlap in one plane (no z-fighting).
    `__docklands.ROOFS` gives `{ shape: 'parts', cuts, parts, eave, ridge }` for these.
  - **Measured** (logged run 2026-10-08, 21.5 min, of which lidar-roofs.py about 18 min; graph version
    `https://kgx.foaf.tv/id/graphroofsb6a65e444fa5affb`, 113,266 triples): 10,739 outlines cut; 5,331 buildings drawn in
    parts (2,679 were complex, 2,326 gabled, 302 skillion, 17 hipped, 7 pyramidal); parts: gabled 6,976, skillion 2,404,
    hipped 270, pyramidal 51, flat 5,054; 810 gable runs (valleys). Single roofs: gabled 14,704, skillion 1,745, hipped
    406, pyramidal 174, OSM 296; flat 6,464; complex 8,594; nodata 960. Of the 12,513 complex of version 1: 2,895 now in
    parts with a pitched part, 1,024 skillion, 8,594 still flat. 560 of the 7,052 flat became skillion (planes with a fall
    of 0.6 m or more; on a hand check 5 of 6 fit the DSM to 0.04 m or better).
  - **Fit against the DSM** (every building in parts; cells 0.75 m inside the outline; median absolute DSM minus drawn
    roof; a throwaway script, runs approximated as rectangles): were complex (2,923, drawn flat at the model height):
    median 1.15 m before, 0.24 m after, 90th percentile 2.76 m before, 1.02 m after; better for 2,721, worse for 175.
    Were one pitched roof (2,408): 0.22 m before, 0.10 m after; better 1,823, worse 132.
  - **Hand check** (DSM, drawn roof and difference side by side, outline and cuts drawn; random, seed 29): complex now
    in parts, 9: 5 right (form and ridge directions: 26063, 2254, 13789, 30659, 31078), 4 partly (one or two wings that
    are pitched in the DSM drawn flat: 11195, 2581, 23694, 13713). Pitched now in parts, 3 of 3 closer to the DSM (an
    outrigger as a skillion or a lower gable). Complex now skillion, 3: 2 fit, 1 doubtful (2630, a gable in the DSM).
    Still complex, earlier sample (seed 13) 6: mostly rectangles with no single roof (plant, a half-empty outline, an
    outline off the building); 1 or 2 look pitched.
  - **Pacific Tavern** (index 7477, known: south wing eave 6.1 m, ridge 8.7 m; north wing eave 3.4 m, ridge 6.0 m): one
    cut at ring vertex 4; south piece (with the corner) gabled, ridge 9.04 m, slope 0.665, eave 5.25 m at the OSM outline
    5.7 m from the ridge (the OSM wing is 11.4 m deep, the building 9.7 m: at 4.85 m from the ridge the plane gives
    5.8 m); north wing gabled, ridge 6.12 m, eave 3.29 m, and it runs 8 m into the south wing (a valley). Error against
    the DSM 1.62 m (flat) to 0.16 m. The page draws the detailed model there; turn off Layers > Show > "Detailed models"
    to see the roof data.
  - **Faults met.** (d) An oblique chord: the first gable-run rule took the cut's midpoint near the piece end; with wings
    at 57 deg (the tavern) the midpoint is 3 m short of the end and the run was skipped; `gableEnds()` now takes the
    point where the ridge line meets the cut, and the run is clipped beyond the cut line. (e) A flat part fitted at 0.2 m
    (an empty yard inside an outline, index 1838): flat parts are at least 2 m. (f) A skillion ridge centre at the
    rectangle's projection lay outside the outline box for a diagonal fall (index 1577): it is now the uphill vertex.
- **Limits, open.** 8,594 outlines stay complex (flat at the model height): mostly rectangles with no single roof shape
  (several roofs in one rectangle, plant, outlines that do not fit the building); next, grow planes from the cells
  (region growing or RANSAC) inside one outline. Parts that are pitched in the DSM but fail the rules are drawn flat
  (about 4 in 9 cut buildings have one). Cuts follow the outline only; a roof split that is not on a corner (a terrace
  row of one outline with steps in height) is not found. Semi-detached halves (hipped at one end only) come out gabled;
  no half-hip, mansard, butterfly or gambrel shapes. Heights are above the model ground `b`, not the DTM (median DTM
  minus `b` is about 0). Rerun after build-docklands.mjs and key-model-buildings.mjs; the fingerprint stops the page
  from using stale rows.
- **Rebuild:** `ROOFS_TILES=<dir of the 8 zips> ROOFS_PBF=<extract> node cwplans/tools/build-roofs.mjs` (default dirs:
  `cwplans/data/raw/docklands/lidar/` and `cwplans/data/raw/docklands/greater_london-latest.osm.pbf`, both ignored by
  git); `ROOFS_DRY=1 ROOFS_MEAS=<saved lidar-roofs.py output>` to tune the rules without a log entry. Then `npm test`,
  `node cwplans/tools/check-data-register.mjs --write`, a headless load.

## Realistic look (2026-10-08)

Owner, 2026-10-08 (after the headset test): "the buildings without custom models are painfully flat and samey. We
should try at a minimum to guess roof types, but ultimately to get more realism." Roofs: section "Roof shapes". This is
the second half: materials, colours and window rhythm, as a new option (Layers > Style > "Realistic buildings",
`?look=real`); the default Map look is unchanged. Live (terraces in Deptford, Canary Wharf):
https://danbri.github.io/londat/cwplans/docklands/?look=real#v=1&c=-1425,1875,4,90,0.3,0.25&n=0&u=0 and
https://danbri.github.io/londat/cwplans/docklands/?look=real&view=cw

- **Files.** `tools/build-materials.mjs` (logged operation `build-materials`, kgx graph `materials`, skill
  `cwplans-dataflow`), `docklands/data/materials.json` (the page file, about 510 kB, 96 kB gzip, loaded only when the
  look is turned on), `docklands/look-layer.js` (`DocklandsLook`), `tools/test/materials.test.mjs`.
- **Evidence and rules** (all in the tool; `rules` in materials.json): the OSM element of each model index
  (`building-keys.json`; a part also reads its parent's tags) gives the type and `building:levels`; the extract
  (osmium tags-filter) gives `building:material`, `building:colour`, `roof:material`, `roof:colour`, `shop`, `amenity`.
  OSM shop and amenity nodes are projected through OSTN15 (`node cwplans/tools/fetch-raw.mjs grid` first) and matched to
  the outline that holds them, else to the nearest outline edge within 2.5 m. The registry use (atlas.json, as
  `nightUse`) marks homes and offices where OSM says only "yes". Then:
  - **Style** (8; the shader's window patterns): house, flats, estate (slab or tower block), office (punched), ribbon,
    curtain wall, shed (industrial, warehouse, garages, big retail), civic (school, church, hall). From the type, height
    (flats to 21 m, estate to 60 m, curtain above for homes; offices curtain from 35 m), footprint (a "yes" under
    150 m2 and 12 m is a house; over 1,500 m2 retail under 16 m is a shed) and the registry use. A glass material
    makes a tall building ribbon or curtain.
  - **Wall material**: the OSM tag (brick is split stock / red / brown by hash), else a weighted pick by style (house:
    stock brick 45, red 14, brown 12, white render 15, cream 8, pastel 6; estate: concrete 40 ...; curtain: three
    glass tints and silver metal), seeded by an FNV hash of the OSM id, so neighbours differ. `building:colour` replaces
    the material colour (named values are toned to building colours: "brown" is brick brown, not #a52a2a; glass mixes
    55 % of the colour with its tint).
  - **Storey class**: the nearest of four storey heights of the style (house 2.6, 2.83, 3.06, 3.29 m; office and
    ribbon 3.3 to 4.3; curtain 3.5 to 4.5; shed 4 to 7.9; civic 3.3 to 4.6) to the wall height (to the eave of a
    roofs.json roof) over the OSM levels, else a hashed spread (25 / 50 / 25 %) round the default. The bay widths (house
    2.3 m, flats 3.0, estate 3.3, office 1.6, ribbon and curtain 1.5, civic 3.4) vary by +/- 10 % per building in the
    shader for the brick styles.
  - **Shopfront**: a shop or amenity point in or at the outline, or a shop tag on the building, on a building of 4 m or
    more that is not a shed or civic: a ground floor of max(3.8 m, 1.2 storeys) with glass bays of 2.6 m, mullions and
    a fascia (dark blue or dark red by hash); a house with a shop becomes flats over a shop.
  - **Roofs**: pitched (where roofs.json gives a shape) slate, clay tiles or brown concrete tiles for houses, slate,
    grey concrete tiles or clay for others; flat: felt, gravel or a light membrane (towers over 40 m: mostly membrane);
    `roof:material` and `roof:colour` first. The aerial roof image (`roofTex`, a ground image chosen) still replaces
    roof colours under 40 m, as in the Map look.
  - **Night use**: homes for house, flats and estate styles, offices for office styles, only where the registry gives
    no use: Night then lights the ordinary buildings by use too.
- **materials.json**: base-36 strings, one fixed-width cell per model index: `c` code (2 digits: style x 8 +
  shopfront x 4 + storey class, 0 to 63), `w` wall colour (2 digits into `wall`, 164 colours), `p` and `f` pitched and
  flat roof colour (2 digits into `roof`, 102), `u` Night use, `e` evidence bits (3 digits: 1 building:material, 2
  building:colour, 4 roof:material, 8 roof:colour, 32 shop tag, 64 shop point, 128 registry use, 256 storey from
  levels). Everything without a bit is a guess. `model.fp` = `MFP`; the page warns and does nothing when it differs.
- **Page.** index.html: the script tag, the checkbox, `DocklandsLook.init({ MFP, load, rebuild })` after the roofs
  loader, and in `buildBld()` a look building (no photo facade tile; Map style, not Pixel art or Photo; colour by
  height source; no skyline year) is built white, then `DocklandsLook.paint(M, first vertex, model index, pitched)`
  multiplies each vertex's face shading (the white colour times `shade()`) by the wall or roof colour (u >= 0 or < 0),
  with +/- 7 % brightness and a slight warm or cool shift per model index, writes the alpha byte 132 + code, and adds
  1000 x use to `g.w` where the use is 0. Detailed models keep their own parts; photo facade tiles stay.
- **Shader** (prF, no new uniform or varying): alpha 132 to 195 is a look vertex. `lookSet()` at the start of `main`
  sets the globals BW (bay), FH (storey), GF (shopfront height) and LST (style); `nightCol` uses BW, FH, GF (1.8, 3.6, 0
  for every other vertex, so the Map look is unchanged) and lights shopfronts warm (70 %); `lookWall()` by day: slow
  wall mottling (3 m noise, faded with distance), grime at the foot, a light coping line under flat roofs, then per
  style: house windows with white frames and a door (dark or red) on a third of the ground-floor bays; flats; estate
  with lighter spandrel panels; office; ribbon bands; curtain wall (the wall colour is the glass tint, sky in the upper
  part, spandrels, light mullions); shed (cladding ribs, a 1.2 m block plinth, roller doors every 14 m); civic (a
  mullion per window). Glass: a sky gradient, some blinds. A window under about 3 pixels fades to its mean.
- **API for other layers** (the headset view draws with the page's `render()`, so the look shows there too):
  `await DocklandsLook.set(true | false)` (loads the file on first use, ticks the box, rebuilds, resolves to the state in
  force); `DocklandsLook.on()`; `DocklandsLook.data` (decoded arrays). xr-layer.js does not call it yet.
- **Night.** Look buildings light by use (most ordinary buildings now have one); the per-building seed and the window
  derivatives in `nightCol` come from `floor(gk.xy)` and `DW` for look vertices only, so the Map look's night is the same
  as before. The Map look's own seed `h(gk.xy * .0137)` still changes from pixel to pixel: a fault still in the Map look.
- **Faults met.** (a) Derivatives taken inside `lookWall` (called in a branch, using globals set in another branch)
  came out as per-pixel noise on SwiftShader: `fwidth` is now taken once at the top of `main` (`DW`) and divided by
  the bay and storey. (b) `h(gk.xy * .0137)` (the per-building seed the Night code also uses) is noise per pixel: the
  interpolated building centre differs in its last bits from pixel to pixel and the hash multiplies that by 43,758.
  The look hashes `floor(gk.xy)` (also in `nightCol` for look vertices: lit flats were speckled before). Both were found by rendering the inputs as colours (vec3(far, det, mask)) and reading a crop at 3x.
- **Measured** (logged run 2026-10-08, 40 s; graph version `https://kgx.foaf.tv/id/graphmaterialsca718efee790144e`, 40,958 triples: the buildings with OSM evidence): of 41,803 model buildings: house
  23,092, flats 11,738, shed 2,126, estate 1,982, curtain 876, civic 761, ribbon 665, office 563; shopfronts 3,745 (OSM
  points 2,911 buildings, shop tags 1,168; 4,370 of 4,958 shop and amenity nodes in the box matched); OSM
  building:material 5,061, building:colour 2,923, roof:material 1,991, roof:colour 3,277; storey from levels 12,979;
  registry use 509. Walls: stock brick 14,704, brown 6,549, red 5,917, white render 5,203, concrete 2,513, cream 2,241,
  pastel 1,307, metal 1,596, glass 1,066, stone 674, timber 33. Headless (SwiftShader WebGL, 2026-10-08): no page error or
  console error at 1600 x 900 DPR 1 and 390 x 844 DPR 3 with and without `?look=real` (Deptford terraces, Bow, Rotherhithe,
  `?view=cw`, `?view=rotherhithe` at night, `?pixel`). Option off, `&t=2026-10-03T21:30` fixed (the page clock moves the
  sky and the river traffic between runs: without it two runs of the same page differed by 0.008 in mean luma):
  rotherhithe, pier, greenland at 390 x 844 DPR 3: 0.07341 / 0.07341, 0.09434 / 0.09434, 0.08736 / 0.08732 (old / new
  page); pier at 1600 x 900: 0.10969 / 0.10971; the 1600 x 900 rotherhithe and greenland frames differed only where boats
  stood. Cost: turning the look on rebuilds the building mesh, 1.1 s (1.3 s the first time, with the fetch); a frame of
  `?view=cw` 3.2 to 3.6 s on SwiftShader with and without the look (no measurable change). `check-fp16-shaders.mjs`:
  prF still 25 fragment uniform rows and 8 varyings; passes.
- **Open.** The guesses carry no era: Victorian stock brick and 1980s Docklands brown brick get the same weights
  everywhere (OSM `start_date`, the LDDC estates or the Historic England list could set them); no balconies, bay
  windows, chimneys, dormers or parapets in the geometry; windows run across party walls of an outline that holds
  several houses; the shopfront follows the whole outline, not the shop's own frontage; pitched roofs have no tile
  courses; curtain walls show no reflections of the neighbours; window light at night is still drawn, not known.
  Not tested on a phone GPU or in a headset.
- **Rebuild:** `MAT_PBF=<extract> node cwplans/tools/build-materials.mjs` (default `cwplans/data/raw/docklands/
  greater_london-latest.osm.pbf`, ignored by git; needs osmium and the OSTN15 grid); `MAT_DRY=1` to tune the rules
  without a log entry. Then `npm test`, `node cwplans/tools/check-data-register.mjs --write`, a headless load. Rerun after
  build-docklands.mjs, key-model-buildings.mjs and build-roofs.mjs.

## WebXR (2026-10-08)

Owner, 2026-10-08: "add a thoughtfully designed webXR interface which exploits the extra screen space to fully exploit
the treasure trove of contextual location and event data available, including ways to highlight businesses in
different categories, events coming up that are in view etc." Live: the headset button (bottom right, above the locate
button) appears when the browser has WebXR; on any screen https://danbri.github.io/londat/cwplans/docklands/?xr=preview&go
opens the one-eye preview (drag to look round, tap to select; iOS Safari has no WebXR).

- **Files.** `docklands/xr-layer.js` (the layer), `docklands/test/webxr-mock.js` (a WebXR mock for headless runs),
  `docklands/test/xr-check.mjs` (8 checks: the menu, a stereo session, the preview at phone size).
- **Hooks in index.html.** `render()` takes one eye from `DocklandsXR.view` = { fb, x, y, w, h, proj, view, eye,
  target, noSky, clear, after }: it binds the eye's framebuffer and scissor, uses the given matrices (`CAM` from the
  projection), and leaves out what needs the whole canvas or the DOM: Line styles, splats, bloom, My KML screen lines,
  the DOM labels. In a session the page's own frames return at once. `pickRay(o, d)` runs the page's pick pass through
  a 0.004 rad camera along a ray (model metres, y x VZ). `drawModelMesh(m)` draws a `Mesh` with the page program.
  `DocklandsXRCtx` gives the layer the page functions.
- **Frames.** W maps the model (x, y x VZ, z) into the reference space: T(O) Ry(yaw) S(s) T(-c). Each eye's VIEW is the
  XR view's inverse times W, so the page shaders run unchanged; the eye point for haze and light sprites is W^-1 of the
  eye. Table: s = 1/1500 at first (+/- by 1.5), O 1.05 m in front at 0.76 m (local-floor), the page's view direction
  made forward, depth 0.02 to 80 m. Street: s = 1, you stand on the ground at c, Higher/Lower lift you by 30 m, depth
  0.25 to 16,000 m. A bearing turns by -yaw.
- **Panels** (canvas textures, world-locked round the place you stood at the start; Recentre moves them):
  Places in view (left, 50 deg): 12 categories with counts in view / in the model, a tap lights beacons and labels;
  "Open now" uses the registry occupants' hours (buildings.json, categories.json, the card's `ohOf`), Canary Wharf
  only. What's on in view (right): dated events within Today / 7 days / 30 days, nearest direction and distance; a row
  gives a leader line to the venue and the focus; markets with their next opening; Roadworks shows works now as
  orange stubs. Focus (above the table): the page's own building card read as text (`#info`), or the event or market,
  with Stand there / Go there and Centre. Control bar (low, tilted): Table, Street, -/+, turn 30 deg, Night,
  Recentre, Exit.
- **Data.** Places: `AT.buildings[k].cat` (alcohol counts as bars), `registry/model-box-pois.json` outside the
  registry box (OSM classes bar, education, health, sport, arts), the GLA cultural venues (category "Cultural venues").
  Events: `feeds/works/works.json` sources venue-events, planning and th-licences (dates: ISO, a bare date = all day, or
  none = left out); markets: source markets (OSM opening hours); works: street-manager, tfl-road, tfl-bus. The works
  file is a snapshot (`tools/fetch-works.mjs`); the panel footer gives its build date.
- **In view** = within 52 deg of the head's forward direction, horizontally (street: within 4.5 km); recomputed every
  0.45 s; the panels redraw only when the lists change.
- **Input.** `select` (trigger, pinch, gaze and pinch on Vision Pro, a tap in the preview): panel rows first, then a
  label within about 1 deg of the ray, then the page pick, then the ground (table: centre there; street: go there).
  Squeeze: drag the table (table) or go to the ground point (street). Thumbsticks: turn and scale (table), snap turn
  and walk (street). Every function is on the panels, so a device with only select works.
- **Faults met.** A trailing `//` comment put into the middle of a one-line method (Panel.layout, then the check
  script's save) cut off the rest of the line: put comments on their own line in these files. Chromium has its own
  `navigator.xr` getter: a mock must use `Object.defineProperty`. The button box (`#locBtns`) is made by locate.js
  after this layer's first await: wait for it. Labels of one building in several categories stacked: one label a
  building. On a portrait phone the preview sets the panels 1.35 times farther (same directions).
- **Owner's first headset test (2026-10-08, Quest, hand gestures only: the controller batteries were dead)** and the
  changes made the same day: framerate "felt fine"; "some items flicker"; "the lovely gold river lighting at night
  spews out everywhere"; the control strip "below table height", unnoticed "for ages"; "clicks seem not to hit";
  wanted "a grab mechanism to move city around me or reposition windows", other styles, "option to drop or raise the
  floor", a night sky over passthrough, trees and greenspace by default.
  - Gold everywhere: the `XRWebGLLayer` had no stencil buffer (the default is `stencil: false`), and night reflections
    are drawn only where the water marked the stencil. Fix: `{ depth: true, stencil: true }`. The preview never showed
    it (the page canvas has a stencil).
  - Flicker: table depth range 0.08 to 60 m (was 0.02 to 80); with the stencil the layer gets a 24-bit depth buffer on
    most devices. Not verified on the Quest.
  - Presses (selectstart/selectend, also squeeze): a short press (< 2.5 cm of hand movement, < 0.9 s) is a click on the
    ray of the frame before the pinch (a hand's pinch moves its own ray); label hits within 0.045 rad. A press that
    moves drags: on empty space one hand moves the table in 3D (up and down raises or lowers it); two hands turn it and
    scale it about their midpoint (street: turn only, one hand pulls the ground 30x); a panel's title (the bar's left
    end, the dots) moves the panel, which turns to face you. Hand position: `gripSpace`, else the ray origin.
  - Control bar: two rows at 28 deg left, chest height, 0.78 m: Table, Street, -/+, turn, Exit / Floor up, Floor down,
    Style (Map, Lines, CRT), Sky (Dark: the dark-site sky with the Milky Way, the default, also over passthrough at
    night; City: London's sky glow; Off), Night/Day, Photo (the left eye as a PNG; the page offers the photos after
    Exit), Recentre. Places and What's on moved to 62 deg.
  - Styles: Line drawing and Vector CRT draw into the eye (line-styles.js `frame()` takes fb and viewport); the CRT has
    no afterglow or glow in a headset (they use whole-canvas buffers). Pixel art and its isometric camera are not
    offered: an orthographic view per eye does not make a stereo picture.
  - The sky in a table view uses the eye's rotation and the model's yaw, without the 1:1500 scale (`XV.skyView`).
  - Trees are on by default on the page (loaded quietly 1.5 s after start) and in a session.
  - Drone and views (owner: "Also dont forget Drone etc mode"): a third bar row. Drone cycles Off, Copter, Plane,
    Boat, Tube, Walk, Under (drone.js); in a session the drone is stepped from the headset frame (`manual(true)`,
    `step(dt, 120)`), because the window's own animation loop pauses in an immersive session; `manual(false)` at Exit.
    Ride (default) puts its eye at your head at 1:1 and turns the world with its heading (eased, 0.35 s); Watch keeps
    the table and marks the drone with a small cyan diamond. A thumbstick steers while riding. View cycles the page's
    named views: a view with an eye point puts you there at street level (lift = its eye height above the ground),
    the others centre the table. The drone starts from the table centre (the page camera is set there first).
  - Controllers (owner, 2026-10-08: "I can test with controllers"): xr-standard mapping. Right stick: turn and zoom
    (table), snap turn and walk (street), steer (ride). Left stick: move over the map (table: 1.2 cm a frame at the
    table's scale) or strafe (street). A Table/Street, B Night/Day, X Recentre, Y hide or show the side panels, right
    stick press Photo; Wind (bar row 3) switches the wind layer. A haptic pulse on a hover change (0.12, 12 ms) and on a click (0.35, 30 ms). The mock has
    `pads[i]`; xr-check.mjs closes the stereo page before the preview (they share the software GPU).
  - Look (bar row 3): Map or Real (`DocklandsLook.set`). A session starts with the Realistic look; the page's own
    look comes back at Exit. The night-window seed of the Map look now also hashes floor(gk.xy) (the interpolated
    building centre gave per-pixel noise; found by the Realistic-look work), so Map night windows change pattern.
  - The Quest system menu with hands: look at the palm, pinch and hold (the right hand gives the Meta menu, with
    the screenshot); the page cannot change that gesture.
- **Not done / open:** no real headset test (the owner has to try it on a Quest or Vision Pro); performance with two
  eyes of the full scene is not measured on a headset; trees and splats are not drawn in a session; panels are
  world-locked, not body-locked; event venues are postcode centroids (O2: one point).

- **Relief in the headset (2026-10-08).** Owner: "in Quest3 city still looks flat". At the 1:1500 table, 42 m of ground
  (Greenwich Park over the Isle of Dogs) was 28 mm against 157 mm for One Canada Square, at the page's vz 1. The table
  now sets the page's vz (input `#vz`) to `S.relief` (2.5 by default; bar button "Relief": 1, 1.5, 2.5, 4); street and
  ride set 1; Exit restores the page's value (`applyRelief`, `setVz` in xr-layer.js). xr-check tests it (14 of 14).
  Still open: the ground is drawn at alpha 0.5 and its slope shading is weak (no RELIEF factor as in terrain-ring.js).

## Wind (2026-10-08)

Owner, 2026-10-08: "it would be cool to have weather - can we get wind vectors too?" Live:
https://danbri.github.io/londat/cwplans/docklands/?wind&view=cw (Layers > Show > Wind; `?wind` ticks it at load).

- **File.** `docklands/wind-layer.js` (global `DocklandsWind`; `init(ctx)`, `drawGL()`, `S` for tests). Hooks in
  index.html: the script tag after `stations-layer.js`, `DocklandsWind.init({ gl, A, cam, geo, groundAt, draw, nightOn,
  PIX, MVP, CAM, VZ })` before the My KML context, and in `render()` after `drawGlow()`:
  `if (globalThis.DocklandsWind && DocklandsWind.drawGL()) gl.useProgram(pr);`. That line is before the WebXR return,
  so each headset eye draws the wind too. Not drawn in Line drawing / Vector CRT (render returns earlier) or pixel art.
- **Off by default.** The layer animates (a redraw every 40 ms while it is on and the tab is visible; it stops when the
  tab is hidden, when Wind is unticked, and in a WebXR session, whose own loop draws), and the page's rule is no
  third-party request before the visitor asks (skill `docklands-sky`, "Weather and tide"). The first request goes when
  Wind is ticked.
- **Data.** Open-Meteo forecast API in the browser (no key, CORS), CC BY 4.0; the link "Weather data by Open-Meteo.com"
  is in the readout, as Open-Meteo asks ("a link next to any location Open-Meteo data are displayed"), and in Credits
  (Sky, weather and tide). One request for 20 points: a 5 x 4 grid over `A.meta.extent` (corners included; points are
  page metres turned into lon/lat by Newton steps on `A.meta.geo`), `cell_selection=nearest`, `wind_speed_unit=ms`,
  `timeformat=unixtime`, `start_hour`/`end_hour` = 6 hours from 2 hours before the page clock (`DocklandsSky.t`, else
  now). Variables: wind speed and direction at 10, 80, 120, 180 m and 975 hPa, `geopotential_height_975hPa`,
  `wind_gusts_10m`, `temperature_2m`, `cloud_cover`, `precipitation`, `weather_code`. More than 85 days back: the
  `historical-forecast-api` host.
- **Model.** `icon_d2` (DWD ICON-D2, 0.02 deg, about 2 km, hourly, 2 days ahead, runs every 3 h; London is inside its
  Central Europe domain), then `icon_seamless` when ICON-D2 has no value for the hour (beyond 2 days) or fails. DWD
  re-use is CC BY 4.0 with the source acknowledged (https://www.dwd.de/EN/service/legal_notice/legal_notice_node.html);
  register source `dwd-icon`. **Not the UK Met Office 2 km model** (`ukmo_uk_deterministic_2km`, which Open-Meteo has):
  Open-Meteo states that UK Met Office data is CC BY-SA 4.0, and londat `CLAUDE.md` allows no share-alike source other
  than OSM without the owner's agreement. Météo-France AROME HD (1.5 km, Etalab open licence, covers London) is the
  other candidate; not used.
- **Fallback.** If both models fail: the 10 m wind of the londat cache (`CwLive.theme('weather', 180)`, one point,
  Open-Meteo best match) when the clock is within 90 minutes of its time; a uniform field, 10 m only, and the readout
  says so. Else the readout says why ("did not load: ..."). After a failure the next try is 10 minutes later or when
  the clock moves an hour.
- **Field.** Per hour and point, speed and the direction it blows FROM (true) become a vector in page metres through
  the local unit vectors of true east and true north from `geo()` (true north is about 1.5 deg off grid north). Linear
  in time between hours, bilinear between grid points, clamped at the box edge. The readout direction is the mean
  vector turned back to a true bearing (16 compass points and degrees).
- **Drawing.** Three levels: 10 m above the ground (`groundAt`), 120 m above the ground (80 m or 180 m if 120 m is
  missing), 975 hPa at its geopotential height (about 300 to 400 m, over the towers). Per level 140 streamlines: half
  seeded over the whole box, half in a square round the camera target (side 1.6 x the camera distance, 1.2 to 7 km),
  R2 low-discrepancy seeds; RK2, 14 steps; a line stops at the box edge. Line duration T = clamp(L / mean speed,
  20 s, 1500 s), L = 0.14 x the square's side (250 to 900 m). Rebuilt when the target moves a quarter of the side, the
  side changes 1.5 x, or the field changes (each minute of the clock, or new data). Static buffers; nothing is
  uploaded per frame. The animation is in the fragment shader: a comet head runs along each line at
  `S.spd` model seconds a real second (the 10 m level crosses its line in about 3.2 s; the same rate for all levels, so
  the upper streaks are faster on screen in the true ratio); the readout gives the rate ("streaks 31x real time").
- **Program.** Own program (attributes 0 to 2 bound by name; enabled state restored after). A ribbon a segment, turned
  to the eye (`cross(tangent, eye - p)`), width in metres = clamp(0.0032 x distance from the eye, 0.6 m, 16 m), so it
  is about 3 px on a 900 px view and a fixed angle in a headset (no screen-pixel term). Colour by speed (blue 0, cyan 3,
  green 6, yellow 9, orange 13, red 18, magenta 25 m/s and more; key 0 to 90 km/h). Night: additive blending. Day: a
  dark edge 2.4 x wider first, then the colour with normal blending. Depth test on, no depth write.
- **Readout** (`#windKey` in `#top`, under the HUD; a tap folds it to one line): speed in km/h and m/s, direction,
  gusts at 10 m, temperature, the WMO weather word, cloud, precipitation, the model and the clock time (London), the
  animation rate, the Open-Meteo link. `#windNote` under Layers > Show: the model and the streak count.
- **Cost (measured 2026-10-08, headless SwiftShader).** 5,880 segments, 12,600 vertices (40 bytes each), 575 kB of
  static buffers; a rebuild 20 to 120 ms of CPU; `drawGL()` 1 to 11 ms of CPU (two draw calls by day, one at night).
  Frame time with a readback, `?view=cw` 1600 x 900 DPR 1: 3.7 to 5.8 s with Wind, 3.5 to 5.1 s without (SwiftShader
  noise is as large as the difference). Not measured on a phone GPU.
- **Tests.** Mock the API with `page.route(/open-meteo\.com\/v1\/forecast/, ...)` (an array of 20 objects with
  `hourly.time` in Unix seconds from `start_hour`), then read `DocklandsWind.S` (`field`, `stats`, `data.model`,
  `tried`, `err`) and `#windKey`. Runs: `?view=rotherhithe&wind` 1600 x 900 DPR 1 (night), `?view=plan&wind` 390 x 844
  DPR 3, `?t=2026-10-08T13:00&view=rotherhithe&wind` (day), and `?view=cw&wind` with the real API: no page errors.
- **Faults met.** (a) In the container, `api.open-meteo.com` answered curl with "Daily API request limit exceeded"
  (shared address), yet the browser got `icon_seamless` data. Every `icon_d2` request from the container failed
  after about 30 s ("Failed to fetch" from a blank page, one point or 20; in the page, the 30 s header limit), and one
  `icon_seamless` body arrived cut. Cause not found (the agent proxy, or the API). So ICON-D2 for London was not seen
  from here; the fallback worked. The header limit is now 25 s (the body has none), so a visitor waits at most 25 s
  before the fallback. Check on a phone: the readout names the model. (b) The first seeding left a quarter of the box empty (stratified cells counted past the seed
  number): R2 sequence instead.
- **Open.** The wind grid is not in the hourly cache (the cache has one point, `current` only); a `wind_grid` theme
  in `cache-londat.mjs` (one request, 20 points x 5 levels, a few kB) would make the layer work with no third-party
  request and give a history. The streamlines are of the field at one time (no pathlines); 975 hPa is drawn flat at
  the mean geopotential height; vertical wind is not drawn; the grid (about 1.9 km by 1.9 km) does not resolve the
  towers' own wakes, which no open model gives.

## Terrain of London (2026-10-08)

Owner, 2026-10-08: "we should pull in open(ish) altitude data for all of London from whatever that API is we used on
the glitchcan-minigam trees bristol game. City would be less flat." That API is OpenTopoData
(https://www.opentopodata.org/), dataset `eudem25m`, as in danbri/glitchcan-minigam `trees/tools/fetch-elevation.mjs`.
Live (south over the model to the North Downs, vertical exaggeration 3):
https://danbri.github.io/londat/cwplans/docklands/#v=1&c=-1000,9000,50,14000,3.0,0.18&n=0&u=0&g=vz:3

- **Source and licence.** EU-DEM v1.1 (Copernicus Land Monitoring Service, 25 m, SRTM and ASTER merged, about 7 m RMSE
  vertical, EVRS2000, a surface model in part: woods and dense blocks lift it). Copernicus data policy, Regulation (EU)
  No 1159/2013: full, open and free access; tell the public the source, say that it is modified, do not suggest EU
  endorsement. Not share-alike. copernicus.eu stopped distributing EU-DEM in January 2024; OpenTopoData hosts v1.1
  (https://www.opentopodata.org/datasets/eudem/, read 2026-10-08). Register source `copernicus-eudem`. Credit line:
  page credits, "Ground, heights and river" (injected by terrain-ring.js).
- **Public API limits** (opentopodata.org, 2026-10-08): 100 locations a request, 1 call a second, 1,000 calls a day.
- **Files.** `tools/fetch-london-terrain.mjs` fetches, then runs the logged operation `fetch-london-terrain` (kgx graph
  `london-terrain`, named in `kgx/external-heads.json`; the store is not repacked). Raw: `data/raw/london-eudem25m-250m.json.gz`
  (398,550 bytes; heights keyed by "lat,lon"; it is also the request cache, saved every 10 requests, so a re-run
  fetches nothing; `--no-fetch` runs only the operation). Page file: `docklands/data/london-terrain.json` (179,002
  bytes; Pages serves it gzipped): `x0 -34550, z0 -20700, cell 250, nx 237, nz 185, dm[]` (decimetres, rows north to
  south as `A.terrain`).
- **Grid.** BNG E 503000-562000, N 155000-201000 (59 x 46 km: Hampstead, Alexandra Palace, Epping Forest edge, Shooters
  Hill, Crystal Palace, the North Downs scarp at the south edge). 250 m: 43,845 points, 439 requests, about 14 minutes
  (1.9 s a request with the 1.1 s wait), 0 no-data points. BNG to WGS84 by the OSGB36 Helmert (about 2 m out; enough
  for a 25 m DEM at 250 m). A finer grid costs requests by the square: 200 m would be 684 requests, 125 m 2,700 (three
  days of the public quota).
- **Measured heights** (max within 1.2 km of the summit): Hampstead Heath 138.0 m, Shooters Hill 128.3, Crystal Palace
  116.4, Alexandra Palace 108.6, Westerham Heights 247.4 (box maximum 272.7 at E 539250 N 155000, the south edge);
  minimum -9.4 (E 560000 N 173000, a pit). Thames at Tower Bridge 2.5.
- **EU-DEM against the LiDAR** inside the model box (690 lattice points, nearest 20 m LiDAR ground point): EU-DEM minus
  LiDAR median +2.0 m, 10th percentile -0.8, 90th +6.4 (EU-DEM sits on roofs and trees in part).
- **Page** (`docklands/terrain-ring.js`, Layers > Show > "Hills of London", on): the coarse grid outside the model box
  (cells that meet the box are left out), plus a strip that zips the box edge (all 1,310 LiDAR edge points, their own
  heights) to the first coarse grid line outside, so there is no gap and no step. Within 2,500 m of the box the coarse
  heights take the LiDAR-minus-EU-DEM offset of the nearest edge point (mean of +/- 7 edge points), faded with a
  smoothstep. Colour: the page's ground colour (`C.ground`, rebuilt when the style changes it), lighter with height
  above 10 m (up to x 1.45 at 160 m) and slope shading x 6 (a 250 m cell shades almost flat otherwise). Haze: vertex
  alpha falls from 1 at 2.5 km from the box to 0.2 at 37.5 km. Mesh: 44,465 vertices. Draw: in `render()` after the
  LiDAR terrain, with its alpha and the night dim (`nDim`); a depth pass, then colour with `LEQUAL`, so a near hill hides
  the one behind it although the ground is see-through. Not drawn in "Splats only" or Line drawing. VZ applies (page
  program).
- **Far plane.** `persp` far = max(cam.dist x 6 + 6000, `DocklandsRing.far()` = 60,000 m while the layer is on). Depth
  precision is set by the near plane (`max(2, dist / 400)`), not the far, so the change costs nothing measurable in
  24-bit depth. Free-camera views (`cam.eye`: drone, setEye, share `e=`) keep `cam.far || 20000`.
- **Measured** (headless Chromium, SwiftShader WebGL, 2026-10-08; before = layer off, after = on, same page): no page
  error at 1600 x 900 DPR 1 and 390 x 844 DPR 3 in `?view=rotherhithe`, `greenland`, `pier`, `area` and the share links.
  South view above at 1600 x 900: 34.8% of pixels change, mean luma 0.161 to 0.210. Night photo views: mean luma the
  same to 4 digits (0.0933, 0.0891, 0.1107 at 1600 x 900); the changed pixels are in the water glitter and the moving
  sky lines, not the ring (the skyline and the dark ground hide it). `test/xr-check.mjs`: menu and stereo checks pass;
  the preview step timed out on `page.goto` (30 s, the Python server was slow), not on a fault found.
- **From the river the ring is mostly hidden.** Greenwich Park (Observatory 46 m) is inside the LiDAR box (the box goes
  to N 176700), so it was on the page before. At river level (eye 6 m, Island Gardens) the ring changed 0.1% of the
  pixels: the park, Blackheath's edge and the riverside blocks hide what is behind. Shooters Hill shows from a height:
  https://danbri.github.io/londat/cwplans/docklands/#v=1&c=2642,1552,70,3000,-2.098,0.06&n=0&u=0 (from about 250 m over
  Canary Wharf; 9.9% of pixels change) and close to it
  https://danbri.github.io/londat/cwplans/docklands/#v=1&c=6200,3800,120,6000,-1.2,0.12&n=0&u=0&g=vz:2 .
- **Open:** no water, roads or buildings outside the box (the Thames stops at the box edge); EU-DEM in the river is
  ground, not water; the haze is by distance from the box, not from the eye; not looked at on a phone GPU.

## Three.js port (2026-10-08)

An experimental port to three.js r186 in the top-level folder `docklands/` (not under `cwplans/`; owner, 2026-10-08:
"Change it to serve from top level /docklands/ folder, and merge"): https://danbri.github.io/londat/docklands/ . It reads
the data, vendor scripts and models of the WebGL page through `../cwplans/docklands/`; the data register covers only
`cwplans/`, so the port's code files have no register entries. What it covers, the files and the URL
switches: https://github.com/danbri/londat/blob/main/docklands/README.md . three.js is vendored in
`third_party/three/` (its README says how to upgrade); the Pages workflow publishes that folder only.

- **One renderer, two backends.** `THREE.WebGPURenderer` takes WebGPU where `navigator.gpu` exists and falls back to
  WebGL 2 by itself; `?webgl` forces WebGL 2. Write materials in TSL (`three/tsl`), never in raw GLSL or WGSL, so one
  graph serves both. `renderer.backend.isWebGPUBackend` tells which one runs; the page shows it.
- **Tiers.** Cascaded shadows (`CSMShadowNode`) and night bloom (`BloomNode` in `THREE.RenderPipeline`; `PostProcessing`
  was renamed in r183) are on by default on WebGPU only. They work on WebGL 2 too (tested headless), at a higher cost.
- **Reuse, do not convert.** The port reads the WebGL page's data files unchanged. `build.js` `MeshF` keeps the vertex
  layout of `index.html` (f: x y z u packed-rgba; g: centre x, centre z, base, night kind) so `roofs-layer.js`
  (`DocklandsRoofs.prism`) and `look-layer.js` (`DocklandsLook.decode`, `attach`, `paint`) run on it as they are; then
  `toGeometry()` splits it into the attributes `position`, `uw`, `col` (normalised bytes; the alpha byte is the
  material code, never opacity) and `gk`. A detailed model loads as its glTF file (`../cwplans/docklands/models/*.glb`, page frame,
  origin at the model's `t` in building-models.json) with `GLTFLoader`.
- **Shading.** The builders pass an identity `shade()`: three.js lights the faces (`flatShading` normals from the
  derivatives, `DoubleSide` because the outline rings and the roofs come in both windings). The data colours are sRGB;
  the TSL graphs convert them with `sRGBTransferEOTF` before lighting.
- **Night** is the facade program's `nightCol` as `emissiveNode` (scaled by `U.night` from the sun's altitude, -2 to -8
  degrees), so the lit windows feed the bloom. The halo of One Canada Square is index.html `CROWN.NEUTRAL`; the campaign
  colours by date are not ported.
- **Water.** The LiDAR ground over the river is the survey's water surface and hid the water polygons in the first
  build. `terrainGeometry()` sinks the ground inside each water polygon (eroded by one 20 m cell) to 1.5 m below the
  water's level.
- **Sky.** `SkyMesh` (TSL) is scaled to 10 km, drawn first with no depth test (the camera's far plane is 20 km at
  least); stars are a `Sprite` with `PointsNodeMaterial` and instanced position and size (WebGPU draws points 1 px only).
- **Near plane.** For a photo view the eye is a few metres above the water: near = min(dist / 400, height above the
  ground / 2), clamped to 0.5 to 40 m. With dist / 400 alone the foreground was cut away.
- **Chromium 141 fault.** three.js r186 puts `swizzle: 'rgba'` in every texture view descriptor; Chromium 141 (the
  container's Playwright browser) throws a TypeError on it and every WebGPU frame failed. `main.js` wraps
  `GPUTexture.prototype.createView` to retry such a call without the member. Remove the wrapper when the browsers in use
  accept it.
- **Layers (2026-10-08).** Each layer is a module in `docklands/layers/` (`export default { id, label, on, async
  init(ctx, on) -> { object, setVisible, ownUi } }`), loaded by `loadLayers()` in main.js from `LAYER_IDS` (default: trees,
  ring, walls, riverbed, floors, under, stations, skyline; `?layers=a,b` loads only those, `?<id>=0|1` its state). `ctx`
  gives THREE, scene, camera, controls, A, U (with `U.cut`: fragments above it are discarded, for the cut-away), DATA,
  WEBGL, ui (toggle, slider, section, note into `#layersExtra`), meshes (terrain, water, greens, rail, roads, buildings,
  models), buildOpts (merged last into buildBuildings: heightOf, colourOf, towers, look, skip), rebuildBuildings, onFrame,
  showCard, stats. `LAYERS[id]` is `{ mod, api, on }`: the api is kept as returned, so its getters stay live (a spread
  copied them once). Group 1 was written by four subagents in parallel, one file each, tested with `?layers=`; the
  parity table is in docklands/README.md. `ctx.addPick(ray => null | { distance, open() })`: a tap opens the nearest of the
  building under the ray and the layers' hits (stations uses it); `ctx.setBuildingMode('ghost' | 'solid', who)`: the
  buildings see-through while any layer asks (floors). Water (2026-10-08, a subagent; streaks by the
  coordinator): docklands/water.js makes a depth map (750 x 560, 10 m cells, R8) from the UKHO soundings and the dock
  beds (North Dock from under.js; other docks 10 m, ponds 2 m: stated defaults); materials.js waterMaterial: colour by
  depth, two octaves of ripple normals, Schlick fresnel; layers/water.js: one TSL `reflector()` at the area-weighted mean
  level (2.74 m OD), on by default on WebGPU, `?water=1` on WebGL 2. One displaced mirror sample broke the lit window
  rows into zigzags; seven samples along screen y (weights 1 to 4) give the vertical streaks of a river at night.
  three.js r186 fault: a mesh first drawn with an empty BufferGeometry is never drawn after it gets a geometry
  ("position not found"): start with a real geometry and hide the mesh (main.js `sel`, layers/routes.js). Open framework
  item: a CSM `maxFar` fault (a faint band at the far edge of the shadow range on WebGPU).
- **Trees: species and seasons (2026-10-09).** Owner, 2026-10-09: "make trees more realistic including seasonality,
  ideally taking species from osm or elsewhere official data." `docklands/layers/trees.js` reads `data/trees.json` and
  `data/tree-species.json` (`cwplans/tools/build-tree-species.mjs`; activities `fetch-tree-leaf-tags`,
  `build-tree-species`): one profile letter and one basis letter per tree, in the order of trees.json (the page uses the
  file only if `n` matches; else it maps each taxon itself). Profiles, taxon rules and setting mixes are in
  `docklands/tree-species.js` (Node imports it too). Basis: S species, G genus or family (from the source), L OSM
  `leaf_type`/`leaf_cycle`, T street, P park or garden (and every TOW crown outside water and woods), W wood, R within 15 m
  of water: L, T, P, W, R are INFERRED (20,480 of 81,875 on 2026-10-09: all 12,670 TOW crowns, 7,471 OSM nodes, 224 GLA and 115
  TPO records with no usable taxon such as "New tree pit"; OSM leaf tags decided 437 of them). The GLA Public Realm Trees (Nov 2025) already hold the borough inventories (the older London Datastore "Local
  Authority Maintained Trees" is the same kind of data, older): 54,836 of 55,060 GLA trees have a taxon. Drawing: one
  InstancedMesh per shape class (broad 36 triangles, conical 21, columnar 48, weeping 70, small 20, birch 40), one for
  trunks (5-sided, 10), one for twigs (3 crossed quads, 6, alpha-tested branch pattern; deciduous only), one for the far
  form (10 triangles): 9 draw calls. **Level of detail** (coordinator, 2026-10-09: the first version cost about 5.4 M
  triangles a frame; budget 1.5 M for phones and the Quest 3): full trees within 380 m (3D) of the camera, at most the
  9,000 nearest; beyond, the far form to 6.5 km, no trunk, no shadow; re-selected when the camera has moved 25 m. The
  near meshes get the near trees copied into preallocated buffers (mesh.count, update ranges); the far mesh holds every
  tree once and its vertex stage collapses the ones within the near radius of the last re-select (`uSel`, `uNearR2`) and
  beyond 6.5 km, so a re-select costs a loop over the trees plus at most 9,000 copies (about 9 ms in software). Far
  forms of bare trees are a thin twig-coloured haze (holes at 45 % or more).
  The season is the uniform `uDay` (day of the year of the page clock in London, set in an `onFrame` hook when
  `ctx.clock` changes); per instance: leaf and autumn colours, (leaf-out, autumn, bare) days +-5 days a tree, evergreen,
  airiness, bloom colour and day. Leaf density = smoothstep(out - 12, out + 20) x (1 - smoothstep(autumn + 12, bare));
  fragments are discarded where 3D noise of the unit crown position is above it (leaf-fall holes, airy crowns); the crown
  shrinks to 0.6 and collapses below 0.04; twigs collapse behind a full closed crown. Wind: the crown tops sway by
  `WU.windSpeed` x 0.003 x crown height towards `WU.windDir` (TSL `time`, so only while frames run). **three.js r186: a
  material's `positionNode` replaces `positionLocal` AFTER the instance matrix** (the first try, written in unit space,
  drew every crown at the origin): work in model metres from `positionLocal`, with a per-instance crown centre; read
  `positionGeometry` in the fragment stage for noise fixed to the crown. To count a frame's triangles set
  `renderer.info.autoReset = false`, `reset()`, draw once (the default sums or resets per render call).
- **Second wave (2026-10-09, nine subagents and the coordinator).** Layers: tide (`tide.js`, own EA harmonic fit; skill
  docklands-sky "Tide prediction"), water surface (`layers/wind.js`, `debris.js`), ships (`layers/ships.js`), piers
  (`layers/piers.js`), aircraft (`layers/planes.js`, simulated), wildlife (`layers/wildlife.js`), night lights
  (`layers/nightlights.js`), weather (`layers/weather.js`), species trees with seasons and LOD (`layers/trees.js`,
  `tree-species.js`), the reveal sheet (`reveal.js`, called from loadLayers). Shared contract in `water.js`: WU.tideLevel,
  tideRate, windSpeed, windDir, and boat wake slots (setWakes, MAXW 16). The roof port was checked exact for all 22,654
  roof buildings. Faults met: in r186 a mesh's `positionNode` acts before the instance matrix only from `positionLocal`;
  WebGPU allows 8 vertex buffers; point sprites need their size scaled by `viewportSize.y / canvas height` or the mirror
  (0.35 scale) draws them 3x too big; an unlit (MeshBasic) part needs dimming by `U.night` or it glows at night;
  photo views stand on pontoons, so pier parts and vessels within a few metres of the camera hide; a layer that replaces
  `buildOpts` keys must restore the earlier values (skyline vs piers); concurrent writes to `pipeline.json` by subagents
  lost activities (integrate shared files once, at the end). Cost: trees with species crowns cost 5.4 M triangles a frame
  before LOD (0.8 to 0.9 M after). The full page in software WebGPU takes 70 to 120 s to a screenshot; under a load
  average of 25 to 50 it never got there: test when the container is quiet.
- **Third wave (2026-10-09).** Facades and the Realistic look in buildingMaterial (all derivatives taken at the top of
  the graph: WGSL allows derivatives only in uniform control flow), `crown.js`, `styles.js` (an `rtt()` graph cannot hold
  `If`, `.and()`, `.or()` in r186: use float masks), overlays (`overlay-kit.js`, `layers/overlays.js`, `river.js`,
  `kml.js`, `locate.js`, `keys.js`), `drone.js`, `plotter.js` (loads the WebGL page's plotter-svg.js), `music.js`, splats
  (own TSL renderer: no splat library works with WebGPURenderer r186), WebXR (`xr.js`: WebGL 2 backend in a session; the
  model stays in metres and the eye camera hangs under a rig with matrix W^-1, because the TSL materials read
  positionWorld; r186 Camera.updateMatrixWorld drops scale from the view matrix, so the preview camera is outside the
  scene with its matrices set by hand). Check: `node docklands/test/xr-check.mjs` (23 steps, WebXR mock).
- **Test.** `node docklands/test/load.mjs` (WebGL 2 in SwiftShader) and `--webgpu` (WebGPU on Dawn's
  SwiftShader adapter: `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader --enable-features=Vulkan
  --use-vulkan=swiftshader`). Server on the repository root at port 8188. It fails on a page error, a console error or
  an HTTP error, and writes screenshots to `docklands/test/out/` (ignored by git). Hook: `window.__docklands3` (`backend`,
  `STATS`, `setView`, `setCam`, `camState`, `setClock`, `pickAt`, `selectModel`, `shareHash`).
- Measured 2026-10-08 (headless, software): 41,803 buildings in 80 tiles, 1,127,712 triangles, built in 1.8 to 3.5 s;
  a frame submitted in 15 to 24 ms (WebGL 2) and 47 to 102 ms (WebGPU with shadows and bloom). Software numbers only;
  not yet measured on a phone GPU.

## Three.js port: menu, time wheels and defaults (2026-10-09)

Owner, 2026-10-09: "Ensure all functionality we had in original menus is available but through more intuitive structure.
Include a looping carousel at top for time of day, time of year."
- `docklands/menu.js`: the drawer has six tabs (Views, Look, Layers, Go, Time, About). `ctx.ui` methods take an optional
  `{tab}`; `ui.tab(place)` switches the place and returns the previous one. `MENU_PLACE` in `main.js` gives each layer
  its place; a module can override it with `menu:`. Layers groups: City, Below ground, Water and river, Live, Simulated,
  Data overlays, My KML. The drawer closes by its cross, Escape, a tap on the map and a swipe left.
- `docklands/carousel.js`: the two wheels at the top (time of day, day of year), both wrap; sun, night shading, moon
  phases, the daily tide range with S and N marks. A clock set by the visitor goes into the share hash as `t=`.
- Menu > Views > Share this view (as nav.js in the WebGL page): the share sheet on a touch screen, else the clipboard.
- The Menu map in https://github.com/danbri/londat/blob/main/docklands/README.md lists every old control and its new
  place ("WebGL only" where the port has none). Check: `node docklands/test/menu-check.mjs --base <server>`.
- Defaults (owner, 2026-10-09: "Default to realistic buildings and all wind/weather", "all checkbox datasets on by
  default (except kml feeds)", "Uncheck helicopter route default"): Realistic buildings (`?look=0` off), Open-Meteo wind
  and weather (`?weather=0` off), every Data overlays part except the helicopter route (`?ov=`), every River part
  (`?river=`). Floors and splats stay off.
- Faults met: all River parts on at load meant the day-change rebuild read `RV.data.pla` before it loaded (WebGPU page
  error "reading 'items'"); `buildPart` now returns until a part's files are in. With every layer on, a page takes
  longer than the load test's 180 s at 390 px on software WebGPU, and the menu check takes about 25 minutes: test the
  aircraft or one layer with `--query 'layers=...'`. Open-Meteo answers 429 after many test runs from one container.
- Open: at 1280 px the open drawer covers the left part of the wheels; the aircraft status note does not fold.

## Three.js port: parity checks and audit lessons (2026-10-09)

- Audit with evidence of the owner's goal items: https://github.com/danbri/londat/blob/main/docklands/AUDIT.md (tests
  `docklands/test/history-check.mjs`, `roofs-compare.mjs`, `piers-check.mjs`, `wildlife-check.mjs`, `trees-season.mjs`,
  `reveal-frames.mjs`; captures in `docklands/test/audit/`).
- Before you port a "partial" row of the README parity table, read `git log` for the file: the row can be older than the
  code (below ground, pixel art and WebXR were ported in ea16292f and 3976bbba while the table still said partial).
- Look > Model (`layers/model.js`): Buildings solid, see-through, hidden (`?bmode=`), Detailed models and Roof shapes
  (`?models=0`, `?roofshapes=0`), Satellite 2026 ground (`?ground=s2`), Key to colours. `main.js` calls
  `setGround(qs ground)` at start, so `s2` is skipped there and set by the layer. `buildOpts.skip` is one object that
  several layers replace: wrap the earlier value, never assign a plain Set.
- Recorded and live aircraft: the reported position is the aircraft, not its wheels. Lift the model only to keep the
  wheels above the ground, and lift trail points by the same rule (they were 2.75 to 5.1 m apart before 10a94413).
  `&planecam=<n>` follows recorded aircraft (`?t=2026-10-08T18:00&layers=planes&planecam=3&planecamd=70`).
- A camera moved in an onFrame hook must move before the labels are projected, with `camera.updateMatrixWorld()`.
- The open drawer sets `body.drawerOpen`; `--dw` is its width. At 900 px and wider the wheels and the bottom-left notes
  (`#blNotes`, ordered by CSS `order`) move right of it. At 390 px the wheels fill 60 to 124 px from the top: a fixed
  control at the right starts below 130 px.
- Wind and weather share one Open-Meteo request a day (`docklands/meteo.js`). The Open-Meteo daily limit is shared by all
  sessions in a cloud container (HTTP 429): test the data path with a Playwright route that answers api.open-meteo.com.
- Wildlife seasons: record counts by month measure recording effort; divide by all records of that month first.
- EA archive CSV rows are not in time order: sort before finding high water. Use EGLC METARs (Iowa Environmental
  Mesonet) as the truth for wind and low cloud, not ERA5 against Open-Meteo.

## Three.js port: second parity round (2026-10-09, afternoon)

- Layers > Who is inside (`layers/overlays.js`): the 14 chips of the WebGL page (11 occupant glows from the atlas `cat`,
  heritage, quality and live crime pins; `?glow=`, `?pins=`). The WebGL page's default orange buildings are not
  occupants: they are the Map look's height source colour (OSM levels or newer than LiDAR), shown with `?look=0`.
- Look > Windows (`U.win` in materials.js; put the gate in the branch condition so derivatives stay outside branches) and
  vertical exaggeration (`?vz=`): a y scale in `camera.matrixWorld`, never in the scene, so CPU projection, rays,
  positionWorld and cameraPosition stay in model metres. Wrap `Camera.updateMatrixWorld` and `updateWorldMatrix` (r186
  drops scale from matrixWorldInverse). Not applied yet: pixel art, the water mirror, Drone and planecam, headset.
- The cut view is dark (#0f1215) until the visitor sets the clock (main.js DRIVE), as the WebGL page.
- Sky (`layers/sky-extra.js`, Time tab), names (`layers/placenames.js`), walking network (`?walk=1`), About and the Live
  data box with traffic cameras (`about-extra.js`). A child of a group that follows the camera must have no translation of
  its own. Sky colours added in TSL with toneMapped false: wrap them in sRGBTransferEOTF.
- onFrame hooks run before the render updates `camera.matrixWorldInverse`: call `camera.updateMatrixWorld()` before
  `project()`, or labels go wrong after a camera jump with `animate=0`. `?layers=` loads any layer id.
- vz everywhere (96cfe48a): `Object3D.lookAt` reads the eye from `matrixWorld`, so make the matrix rigid during lookAt;
  mark wrapped cameras with a WeakSet (a clone copies userData, not the wrappers); keep the sky undistorted with
  `material.setupModelViewProjection` (not positionNode); mirror under a y scale: S·Rf_h = Rf_(vz·h)·S, wrap
  `ReflectorBaseNode.updateBefore`. The mirror is on by default on both backends (the water body nearest the eye).
- A link with `?layers=` loads only those layers. The owner opened a test link with `?layers=planes` and saw no trees;
  the page now shows "Test view: only the layers ..." with a link to the full page. Never give the owner a link with
  `?layers=` unless you say so.
- Phones: with every layer on, the page draws about 2.8 M triangles; the owner saw no trees after a reload on a device
  (2026-10-09, not yet diagnosed: memory is the first suspect).

## Three.js port: navigation (2026-10-09, evening)

Owner, 2026-10-09, iPhone, after the day's releases: "Orbit controls increasingly hard to use for fine grained
navigation. Drone modes have vanished as has snap to go upside down." `docklands/main.js` "navigation" now does what the
WebGL page's index.html gestures and `nav.js` do; three.js OrbitControls stays only as the holder of `camera` and
`controls.target` (other modules read them and `controls.enabled`), with `enableRotate`, `enableZoom`, `enablePan` and
`enableDamping` false and `maxPolarAngle` pi - 0.05 (the limits are the code's own). README "Navigation" lists the rules.

- **Why it was hard** (measured, `docklands/test/nav-feel.mjs`, synthetic events in the page, 1280 x 800, `?layers=`):
  the pointer-ray zoom of the afternoon moved eye and target together, so the orbit distance stayed (700 m after
  wheeling down to an eye 9.4 m over Mudchute). OrbitControls pans by the distance to the orbit target and turns about it:
  there a 40 px drag moved the ground under the pointer 604 px (0.305 m a pixel; grab would be 40 px) and the eye 2.04 m
  for each pixel of turn; a pinch did nothing to the distance (0.2 %) and the point between the fingers drifted 55 px.
  OrbitControls' damping (0.12 a frame: a lag of 0.13 s at 60 frames a second, 3.9 s at 2) went on 0.11 rad after a press.
- **After**, same places: turn 0.006 rad a pixel (OrbitControls 2 pi / height: 0.0079 at 800 px, 0.0074 at 844 px);
  pan by grab: the point under the pointer moves 40.8, 40.2, 39.7 and 37.8 px for a 40 px drag at eyes 10 m (placed),
  94 m (wheeled), 1500 m (placed) and 300 m (wheeled) (16 and 18 px where a building nearer than the ground was under the
  pointer: then the building is what is grabbed); eye movement per pixel of turn 0.057 m at 10 m (was 2.04); a wheel notch
  (dy 100) 9.5 % of the distance to the point under the pointer (2.2 m at 10 m, 7.6 to 17.9 m at 100 m, 248 m at 1500 m;
  OrbitControls 5 %), drift of that point 0 px; a pinch 100 -> 200 px takes 47 to 57 % of the distance (23 % with a building under the fingers) with 0.6 to 4.3 px
  drift; no motion after a press (0 rad). The orbit radius goes down to 10 m (the zoom is a homothety about the point
  under the pointer, eye and target both; the target moves on along the line of sight below 10 m).
- **Momentum, wall, pass**: nav.js's numbers unchanged (TAU 0.35 s, end 3.2 s, caps; W 1 m, zone max(6 m, 2 %), PUSH_MS
  600 with 3 moves, PUSH_PX 480, cool 900 ms, vibrate 15 ms, the ring). Differences: the ground of the wall is bilinear on
  the DTM (build.js `groundAt` and the WebGL page's are the nearest 20 m cell: steps of metres at cell edges); after the
  pass down the view turns up to -0.2 rad about the eye (nav.js stops the pitch where the eye reaches -1.5 m, often near
  level; the owner calls the pass "snap to go upside down"; at -0.5 the screen showed only sky through the cut); the guard interpolates `ty` with tilt and zoom (the zoom is a
  homothety and moves the target); with a finger down a push is one gesture however far apart the moves come.
- **Measured** (`docklands/test/nav-check.mjs`, WebGL 2 in software): a slow drag up stops at clearance 1.00 m, pitch
  0.0109; pushing on passes (gauge open, cut 9 m OD, clearance -1.50 m, pitch -0.200); a drag down from
  below passes back (gauge closed, cut off, clearance 1.50 m); six wheel notches in from a low eye: 3.77 m, no pass; a
  pinch 80 -> 200 px: orbit 400 -> 160 m, the point between the fingers 0.6 px off; a fast drag (mouse or touch) flings
  1.75 rad (the 5 rad/s cap x TAU) and a press or touch during a fling stops it dead; the touch pass at 390 x 844 the same.
  Drone (`nav-check.mjs`, both sizes): each of the six vehicles starts from its bar button, moves under autopilot (4 s:
  copter 39 to 42 m, plane 173, boat 15, tube 10, walk 5, under 25), the camera sits at the drone, the orbit is off,
  tube, walk and under cut the model (-11, 2, 9 m OD); the cross gives the orbit back.
  `photo-leave.mjs` (390 x 844, WebGL 2): field 70 deg, 45.8 deg after a drag, 15 wheel steps to 8.1 m from a tree, a
  drag up after `?view=rotherhithe` night: lowest eye 1.7 m (its limit is now 0.99 m: the wall is nav.js's 1 m; it was 1.5
  m for the old 1.6 m lift), no errors.
- **Faults met**: (1) OrbitControls.update's lift (the eye 1.6 m over the ground after any change) ate every push: the
  guard saw no move towards the wall. Updates from the navigation code (`NS.own`) skip the lift; other movers keep it.
  (2) The release velocity of the moves before a pass flung the eye 46 m under the street: a pass clears the samples and
  the rest of the gesture adds none. (3) In software Chromium delivers one pointermove a frame (0.5 to 5 s apart) and
  rAF does not fire while a frame renders: nav.js's 350 ms push window never filled and a 0.7 s wait saw no momentum; test
  with synthetic events in the page (`nav-feel.mjs`) or wait for the frames (4 s). (4) `pkill -f`/`pgrep -f` with a pattern
  that is also in your own command line kills your own shell (exit 144): kill by PID.
- **The drone and the round buttons** (superseded on 2026-10-10: both went into Menu > Go > Move; see "less clutter" below): the WebGL page has no round Drone button: Drone and Below ground are buttons in
  its Menu (views group; drone.js line ~649 puts Drone after `#digBtn` there) and the vehicle is a select in the drone bar.
  The port now has round buttons at the top left after Labels: `#digBtn` (Below ground: the gauge, `main.js syncDig`) and
  `#droneRound` (drone.js); under 480 px they go down the left edge at 132 and 184 px (the style select at the top right
  left no room); the bar `#drBar` has a row of six vehicle buttons, Auto and the cross, at 60 px from the top
  (the time wheels, `#locBtns` and the test note hide while the drone flies; before, the bar was at 132 px under the wheels
  and the only way in was Menu > Go > Move > Drone). Menu > Go keeps the Drone button.
- **Test state on 2026-10-09 23:40** (after a container restart): `nav-check.mjs` all pass on WebGL 2 (nav and drone) and
  WebGPU (drone); `photo-leave.mjs` passes; `load.mjs` passes on WebGL 2 (`view=cw&weather=0`, both sizes) and on WebGPU at
  1280 x 800; WebGPU at 390 x 844 was "not ready" in 180 s (the known slow full page in software). `menu-check.mjs` could
  not run: in this container every full-page frame took about 7 s in software and its first `page.click('#menu')` timed
  out at 30 s, on the changed page and on an unchanged copy alike (the same failure: not this change). Re-run it on a
  quiet container.
- **Only a real phone can confirm**: the feel at 60 to 120 frames a second; whether 0.006 rad a pixel is fine enough on
  an iPhone; the click (no `navigator.vibrate` on iOS: the ring only).

## Three.js port: less clutter, labels switch, label occlusion (2026-10-10)

Owner, 2026-10-10, iPhone, after the navigation release (6c0e0343): "Nav is good but too much clutter / Cam label ignores
depth / buildings in front / Drone and icon and day/night toggle belong in bamburger menu, and label toggle should hide
plane labels, cam labels. Also wind and other metadataand credits hidden when labels off". "Nav is good" is the owner's
confirmation of the navigation section above on a real phone. "Icon" was read as the Below ground button (`#digBtn`):
on a phone it was the unlabelled icon under the time wheels, beside Drone.

- **What moved.** On the map, top left, only Menu and Labels (`#labelsBtn`, layers/search.js, now at 62 px; `#hud` at
  114 px, under the wheels at 10 px on a phone). Night (`#nightBtn`, "☾ Night") is in Menu > Look; Drone (`#droneBtn`,
  drone.js, first in the row) and Below ground (`#digBtn`, labelled, with its icon) are in Menu > Go > Move. The round
  `#droneRound` is deleted; `#nightBtn` and `#digBtn` keep their ids, so main.js (`syncDig`, the night handler), styles.js
  (hides Night outside the Map style), xr.js (`nightBtn.click()`) and Time > Day or night work unchanged. Each shows its
  state with `aria-pressed` (Night: `NIGHT` set in `setClock`; Drone: `syncUi`/`stop`). Below ground and Drone close the
  menu on a screen under 900 px (the gauge and the vehicle bar must show); Night does not. Entry points that stay: `?night`,
  `n=1` in the share hash, `?drone=`, `#dr=`, `?view=under`, `?cut=`, the drone keys while it flies, Menu > Time > Day or night.
- **Labels switch.** `#showLabels` (Layers > City, now "Labels, notes and credits on the map") drives `body.noLabels`
  (main.js `syncLabelsUi`, also called each frame because styles.js sets the box with no change event). index.html:
  `body.noLabels #labels{visibility:hidden!important}` (every label of every layer lives in `#labels`: places, `.pnl`,
  `.lab.plane`, `.lab.ais`, `.lab.pier`, `.camLab`, `.ovLab`, `.lab.src`, `.rtEnd`; `visibility` with `!important`
  because styles.js and xr.js set `#labels.style.visibility` inline, and a hidden button takes no taps) and
  `display:none!important` for `#blNotes` (wind and water note, aircraft note and adsb.lol credit), `#credit`, `#attribI`,
  `#stat`, `#hud`. KML names on the canvas already followed the box. Not hidden: the drone bar and HUD, the route panel,
  toasts, `#testNote` (it warns of a `?layers=` link). The credits stay in Menu > About (`#credits`: the
  `<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>` link that
  `check-data-register.mjs` looks for, adsb.lol, Open Waters, Open-Meteo, TfL). Kept on the device (`localStorage`
  `d3.labels`); `?labels=0|1` wins. Before this, the box was not kept at all.
- **Occlusion** (`docklands/occlude.js`, `ctx.occluded(el, x, y, z)`, `ctx.occVersion()`; test hook
  `__docklands3.occ()`). Chosen over a depth readback (async, different on WebGPU and WebGL 2, a GPU stall on phones) and
  over three.js `Raycaster` on the tiles (no BVH: 16 to 17 ms a ray here, 1.1 M triangles in 80 tiles). A height grid of
  4 m cells over the model box (1875 x 1400 = 2,625,000 cells, Int16 decimetres, two arrays: 10.5 MB): the bilinear DTM at
  each centre, raised to the highest vertex of every roof-like triangle (|normal y| >= 0.25: 309,853 of the tiles'
  triangles) whose xz projection covers the centre (a triangle that covers no centre stamps its centroid's cell); the
  detailed models too (their matrixWorld). Built in 8 ms slices (`setTimeout`), again after each `rebuildBuildings`
  (skyline year, models, roofs). A ray marches from the anchor to the eye in 2 m steps and stops above the highest cell or
  6 m short of the eye; a cell 0.5 m or more above the ray hides the label; the solid cells the march starts in are the
  label's own structure and never hide it (area.js places sit 20 m up, inside their tower). Buildings hidden or
  see-through (`bmode`, Floors): ground only. The cut (`U.cut`) clips every cell. Results are cached per element and
  recomputed when the eye moves 0.5 m, the anchor 2 m, or the cut or building mode changes; at most 160 marches a frame
  (an answer older than 10 frames is recomputed anyway); `draw()` is asked while some wait. Applied to: place names
  (main.js), placenames.js, cameras (about-extra.js, anchor ground + 3 m), aircraft, ships, piers, overlay labels
  (overlay-kit.js). Not to the below-ground source labels (under.js: they are meant to be seen through the cut) or the
  route ends. placenames.js only re-places on a change of its key: the key now holds `ctx.occVersion()`.
- **Measured** (`docklands/test/labels-check.mjs`, WebGL 2 in software, 4-core container, 2026-10-10): one march 5.6 to
  10.8 µs (300 to 320 steps; 24 µs with a second headless test running); one exact three.js ray 15 to 17 ms (about 2,000
  times more); the grid: ground 0.66 to 1.27 s, roofs 0.38 to 1.08 s (3.4 s under the second test; in 8 ms slices, not
  one stall); the most march time in one frame 2.9 to 4.3 ms while the camera moved (1,680 to 1,743 marches in a run).
  Grid against the exact ray (own building = the footprint that holds the anchor): 77 of 80 and 80 of 83 labels agree in
  the test view; the 3 others are building names at the edge of a neighbouring tower (25 Bank
  Street, 25 and 1 Cabot Square): 4 m cells. Test runs 4 to 6: 22 of 22 checks pass, no page errors. At 390 x 844 the full page
  shows 31 labels at view=cw with 27 of 56 tested labels hidden by occlusion. Not measured on a phone.
- **Faults met.** (1) Playwright's `page.click` waits for a free frame; with the full page each software frame takes
  seconds and a click on a menu tab timed out at 30 s: click by `element.click()` in one `evaluate`. (2) `ctx.newPage()`
  of a shared context ignores `viewport`: the "390 px" run was 1280 x 720; make a context per size. (3) At 390 px the
  corner credit line (its first 5 s) lay over the frame line `#stat`; index.html now hides `#stat` while
  `#credit:not(.off)` on a screen of 600 px or less. (4) A first version limited the own-structure skip to 40 m: tall
  place labels (One Canada Square, 25 Bank Street, anchored 20 m up inside the tower) were hidden from 400 m up. (5)
  `pkill -f labels-check` and `ps | grep [l]abels-check | xargs kill` killed the agent's own shell (exit 144) because the
  pattern was in its command line: list with `pgrep -af "node docklands/test"` first and kill by PID.
  (6) A trailing `// comment` put inside a one-line block (`if (...) { // ... placed.push(r); ... } } }`) swallowed the
  rest of the line; `node --check` passed (the braces still balanced further down) but placenames.js drew no names and
  its menu row was missing (menu-check: "Station, district and dock names: not found"). Put a comment on its own line
  or at the true end of a line, and look at the diff. (7) The labels switch on again: the place names come back only on
  the next frame (5 to 10 s in software with the full page); a fixed 4 s wait saw only the camera labels (they are never
  hidden one by one): wait for the frame.
- **Open.** A thin building (under 4 m) or a gap between towers narrower than a cell can be wrong; trees, cranes and
  the station models do not occlude; the grid is per page load, about 10 MB; a phone must confirm the feel.
- Deep links: the occlusion test view
  https://danbri.github.io/londat/docklands/#v=1&c=-35,-10,100,698,0.2569,0.4446 (the TfL camera "Limehouse Tnl Aspen
  Way" behind One Canada Square: no label; "ASPEN WAY - UPPER BANK STREET": label); labels off
  https://danbri.github.io/londat/docklands/?labels=0 .

## Night windows by use and hour (Three.js port, 2026-10-09)

Owner, 2026-10-09: "the binary division of night lighting into warm-white grids of tiny square windows (residential) vs cold
blue white light horizontal bar shaped windows… this feels artificial and weird. Investigate a more realistic set of simple
patterns we could use." `docklands/materials.js` `nightNew` (default) replaces `nightOld` (the 2026-10-04 rule, kept with
`?nightstyle=old`). The WebGL page is unchanged. No new vertex attribute: use from `gk.w` (night kind), facade type from the
Realistic style code in `col.a`, height from `gk`, the clock from two uniforms.

What the photos show (`cwplans/docklands/reference/night-2026-10-03/`, Saturday 3 Oct 2026, about 23:56 BST): residential
towers dominate; lit rooms are irregular, mostly warm (the phone's white balance makes 2700 K read as yellow-white), with
some neutral and cool LED rooms and a few blue TV rooms; dim amber rooms behind curtains; one block shows a 2-window column
of green-white stair or corridor lights on every floor (the core); some towers have one or more whole floors lit (amenity
floors); offices still have many floors lit at midnight on a Saturday, and close up their glass shows rows of ceiling
panels; low-rise riverside blocks show few, separate warm windows; street and riverside lamps dominate at the ground.
General knowledge used (not measured here): UK time-use surveys (evening peak 19 to 22 h, fewer lights after 23 h and in the
small hours), office occupancy (cleaners and late work to about 22 h; floors left lit all night), hotels lit early evening
with lit corridors and lobby, shops lit to closing and display lights after.

| pattern | when (use code, style, height) | grid and window | lit rule | colour |
|---|---|---|---|---|
| office | use 2, One Canada Square (5); no record: Realistic office, ribbon, curtain | 1.5 m x 4.0 m, floor-to-ceiling glass (Realistic: its own bay and storey) | whole floors with p = U.nP.y, in zones of 6 to 11 bays (82 % of the zones of a lit floor); a few zones on dark floors; dark plant floor every 14 to 23 floors over 100 m, dark top storey over 45 m; lit lobby | 3700 to 5200 K by building, a little by floor; brighter to the ceiling, LED panel rows close up; 12 % of bays with a blind (x 0.45); dark floors a faint cool glow |
| homes | use 1, Newfoundland (4); no record: house, flats, estate | 2.3 to 3.4 m x 3.05 m by building, window 45 to 80 % of the bay wide, 55 to 77 % high (Realistic: its own box); a pier of at least 12 % of the bay on each side | flats of 2 to 4 windows (the same split on every floor) lit with p = U.nP.x x patch noise (0.4 to 1.6); 68 % of the rooms of a lit flat; a few lone rooms | per flat t = u^2: about 58 % 2200 to 3000 K, 24 % to 4000 K, 18 % to 6500 K; 35 % curtains (x 0.6, cloth tint); TV rooms blue-white, flickering (U.nQ.y: 7 % from 19 to 01 h) |
| core | homes and hotels over 24 m (35 % of blocks; every hotel) | a column two bays wide every 40 to 64 m of wall | 88 % of the floors | fluorescent green-white or LED warm white, dim |
| whole storeys | towers over 60 m (about 1 floor in 40, while p > 0.15); the ground storey of a block over 20 m (65 %; every hotel) | the storey's windows | always | 2800 K |
| hotel | use 3 | 3.6 m x 3.15 m, one room a window | p = U.nP.z, rooms independent, 60 % curtains | warmer (t x 0.55) |
| low-rise | homes under 15 m | as homes | ground floor x U.nQ.x (1.3 at 17 to 22 h, 0.4 after midnight), upper floors x (1 + 0.4 x lateness) | as homes |
| shed, civic | no record: Realistic shed (6), civic (7) | style box | 3 % (security); p_office x 0.15 | as homes |
| shopfront | Realistic shopfront band | 2.6 m units | lit with p = 0.85 x U.nP.w + 0.05 by unit | 2700 to 4000 K, brighter |
| no record, no style | use 0, Map look | as homes | p x 0.75 | as homes |

The clock: `nightClock(t)` (materials.js) gives `U.nP` = lit share of home rooms, office floors, hotel rooms, shopfronts, and
`U.nQ` = ground-floor factor, TV share, lateness, weekend, from a 24-value table per use (linear between hours, London time).
Weekend days: offices x 0.75 (at least 0.15); Friday and Saturday nights: homes x 1.15 from 21 to 03 h; weekend mornings
homes x 0.6; Sunday evening shops x 0.6. A uniform `onFrameUpdate` reads `__docklands3.clock` once a minute of clock time, so
no other file changes; before the page hook exists the defaults are a weekday at 22:00. Values at Saturday 23:56: homes 0.20,
offices 0.17. Far away (a window under a pixel) each pattern shows its mean light, offices first along a floor, so lit floors
stay bands. All branch-free (`select`, `mix`, `step`): derivatives stay in uniform control flow (WGSL).

Measured (`node docklands/test/night-windows.mjs --base <server>`; WebGL 2 in SwiftShader, 1400 x 1050, `t=2026-10-03T23:56`,
`layers=registry,nightlights,water,trees` so that data overlays do not count as light; region: the skyline box, the same
fractions of photo and render; lit = sRGB luma > 0.32, red aviation lights out; colour temperature by McCamy from the lit
pixels that are not clipped):

| view | frame | lit % | spots per Mpx (median px) | CCT p10 / p50 / p90 K | under 3000 K / over 5000 K |
|---|---|---|---|---|---|
| rotherhithe | photo | 5.13 | 2547 (10) | 3379 / 4434 / 6207 | 0.04 / 0.31 |
| rotherhithe | old | 8.10 | 5843 (8) | 4284 / 5101 / 7815 | 0.02 / 0.55 |
| rotherhithe | new | 6.19 | 3401 (8) | 2939 / 4816 / 6094 | 0.10 / 0.45 |
| greenland | photo | 6.28 | 1779 (9) | 3048 / 4018 / 5181 | 0.09 / 0.14 |
| greenland | old | 3.42 | 2284 (7) | 4296 / 5294 / 7450 | 0.04 / 0.60 |
| greenland | new | 2.89 | 1570 (8) | 2920 / 5119 / 5964 | 0.10 / 0.55 |
| pier | photo | 7.90 | 3155 (6) | 3274 / 4306 / 7163 | 0.03 / 0.40 |
| pier | old | 8.30 | 2897 (19) | 4648 / 5324 / 7558 | 0.00 / 0.70 |
| pier | new | 6.01 | 1513 (23) | 3337 / 5069 / 6433 | 0.07 / 0.55 |

By the hour (rotherhithe, new): Wednesday 19:30 11.2 % lit (5786 spots per Mpx), Saturday 23:56 6.2 %, Thursday 03:00 4.0 %
(mostly cores and office floors, so cooler: p50 5469 K). Read the numbers with care: the photo's auto white balance and the
render's AgX tone mapping both pull bright pixels to neutral, so CCT compares appearance, not lamps; the greenland render
has fewer buildings in the box than the photo (view fit), and the pier photo has haze lit by the city. The new pattern has
fewer, larger-spaced spots, a spread of colour temperatures instead of two colours, and a cooler tail from cores and offices.
A first try with saturated 2200 K colours and darker curtains read as pink-brown blotches on low-rise blocks; one core column
of one bay every 9 to 16 bays read as dotted lines up every tower: both changed.

Open: One Canada Square is now an office (it was lit as homes before) and reads darker than in the photo at Saturday midnight;
the registry layer's `NIGHT_USE` (layers/registry.js) has no car park, school or warehouse code (they fall to offices or
"no record"); balconies are only a darker strip at the foot of a window on the Map look; the CCT and lit-share numbers have no
camera model; not yet seen on a phone GPU.

## Water over the LiDAR ground (2026-10-08)

The LiDAR ground under the river and the docks is the survey's water surface (Thames median 2.8 m OD = the water level).
Drawn after the water at alpha 0.5, it painted over it on the 20 m grid: 26 to 66 % of the cells of the Thames, Lea and
Deptford Creek polygons, 7 % of Greenland Dock, 16 to 50 % of South Dock (owner, 2026-10-08: "blotchy and shallow").
Now `waterMask()` (index.html, was `tidalMask`) sinks the ground inside every water polygon, eroded by one cell, to the
water's level - 1.5 m, always (a set tide sinks the tidal part further, terrainSink), and the ground is drawn with
polygon offset (2, 8) by day as by night. Measured by eye on before and after renders (SwiftShader, 1600 x 900): the grey
patches on the Thames and in the docks are gone; the edge cells stay as a bank strip. Still open (the "shallow" part):
depth colour from the UKHO soundings and dock bed levels (Greenland Dock and South Dock have no bed level in under.js),
fresnel and sky reflection, moving ripples by day.

## Testing

Headless Chromium with SwiftShader (repo `CLAUDE.md`, "Development"), from a local server (fetch needs http):

    python3 -m http.server 8791 --bind 127.0.0.1      # from the repo root, in the background; stop it afterwards

```js
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const page = await ctx.newPage(), errors = [];
page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://127.0.0.1:8791/cwplans/docklands/index.html?view=rotherhithe');
await page.waitForFunction(() => window.__docklands?.AT && window.__docklands.NIGHT.built, null, { timeout: 240000 });
const png = await page.evaluate(() => { window.__docklands.renderNow(); return document.getElementById('c').toDataURL('image/png'); });
```

- **Load test before every push**: the page loads with no `pageerror` and no console error. The inline script can be
  syntax-checked alone: extract the one inline `<script>` block to a file and run `node --check` on it.
- **renderNow + toDataURL in one `evaluate`.** The canvas has no `preserveDrawingBuffer`, so read it in the same task
  as the render. `page.screenshot` re-renders and times out on heavy frames (a splat frame takes about 30 s).
- **`renderNow()` returns before SwiftShader has drawn**: measured 2 ms, then about 2.2 s in the next
  `readPixels`/`toDataURL` (1600 x 900, Rotherhithe view, 2026-10-04). Time a frame as renderNow plus a 1-pixel
  `readPixels`.
- **Two sizes x two pixel ratios x the photo views** for any visual change: 1600 x 900 at DPR 1 and 390 x 844 at
  DPR 3, from `?view=rotherhithe`, `greenland` and `pier`. The page draws at most 2 device px per CSS px, so 390 x 844 at
  DPR 3 is a 780 x 1688 canvas. The first night build passed one 800 x 600 low view by eye and failed on the owner's
  phone.
- **Compare numbers, not one look**: mean luma, the share of red pixels, counts of light points, and the counts in
  `__docklands.NIGHT.n` (tall, red, lamps, columns, reflections, signs). Measured 2026-10-04, Rotherhithe view:
  mean luma 0.100 and red pixels 0.077% at 1600 x 900 DPR 1; 0.073 and 0.064% at 390 x 844 DPR 3; `NIGHT.n` = 84 tall,
  587 red, 1,449 lamps, 160 columns, 1,769 reflections, 12 signs.
- Then look at the pictures as well, and say which renderer made them (SwiftShader WebGL here; fp16 faults do not show).
- **Mean luma is not always repeatable now.** On 881f5c98 (Line drawing added), three runs of `?view=greenland` with the
  same files gave 0.0925, 0.0925 and 0.211 (2026-10-07; cause not investigated; open). On a2781653 the same day, three
  fresh pages at 1600 x 900 DPR 1, each read 12 s after `__docklands.MVP` appeared (renderNow, toDataURL, Rec. 709
  luma of every pixel), gave 0.08836, 0.08835 and 0.08835: stable. The odd value may be a page read before it settled;
  wait the same time in every run. Run a photo view three times and compare the medians; report the spread, and do
  not call one odd value a regression or a pass.
- **Wait on a condition that can end.** A shell loop `while pgrep -f <script>; do sleep …; done` matched its own
  command line (the loop's text holds the script name) and never ended (2026-10-07). Wait on a PID (`wait $pid`,
  or `kill -0 $pid` in the loop), or run the wait as a background command that exits when its condition is met
  (a file that appears, a line in a log), with an upper time limit.

## Known limits (from the README and the code)

Window light is drawn, not known; the window grid is 1.8 m x 3.6 m everywhere in the Map look (the Realistic look has bays and storeys by style); red lights still outnumber the photos
(the model lights every 100 m roof); the LiDAR foreshore at Greenland Pier is one tide state; reflections are of point
lights and columns, not a mirror image of the facades; a level is a floor index, not a measured height; the splat order
is sorted for the still model, so strong music stretch shows small sorting errors. Not yet measured on a phone GPU.
