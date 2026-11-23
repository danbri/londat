---
name: photo-view-reconstruction
description: >-
  Reconstruct the view of a photo of the cwplans Docklands zone (ground or air) on the 3D page: identify
  landmarks (tower tops, river bends, docks, piers, rail), fit a camera by least squares (eye, heading, pitch, roll,
  focal, optional radial k1) to points, shorelines and the horizon, judge the error with hold-outs, place a camera from
  bearings, solve the time from the sun or moon, and add a ?view= entry or render and compare headless. Tools:
  tools/view-mcp (view-lib.mjs, solve.mjs, overlay.mjs, render.mjs) and the docklands-view MCP server. Worked cases:
  the owner's aircraft photo (?view=plane), the ground photo views (?view=rotherhithe|greenland|pier|greenlandday) and
  the cwdock 3x telephoto skyline. Reach for it when the owner sends a photo and asks "where was this taken / can you
  reconstruct this view", before you add a photo view to docklands/index.html, or when a solve looks wrong.
---

# Photo view reconstruction

Model metres everywhere: `x = E - 537550`, `z = -(N - 180300)` (north is -z), `y` = metres above ODN. Headings are
from **grid** north; true = grid + about 1.55 deg in the zone (BNG convergence). The model box is x -5150..2350,
z -2000..3600 (London Bridge to Leamouth, Stepney to New Cross); nothing outside it is drawn.

Worked case and numbers: `docklands/reference/plane-2026-10/README.md`. Ground cases: the `docklands-3d-page` skill
("Views where the photos were taken", "Calibration against the photo") and `tools/solve-photo-sun.mjs` (shadows).

## The method

1. **Read the photo first, then guess.** Note what is unmistakable: a tower by shape (Newfoundland = white diagonal
   grid; One Canada Square = pyramid; One Bank Street = white-framed roof), a dock by its outline, a river bend, a pier,
   the sun side. In an evening photo the bright sky is roughly toward the sun azimuth (west-south-west in October): that
   gives the rough heading before anything else. Get a rough camera by hand (eye, heading, pitch, roll, focal).
2. **Overlay the model on the photo** (`overlay.mjs` / MCP `overlay`): OSM water outlines (blue), rail (orange), tower
   tops and bases (yellow), the model box (red). This is how the aircraft photo was identified: the first guess (camera
   north-east of Canary Wharf, looking south-west) put the river roughly right, and the overlay showed which reach was
   which. Do not trust a correspondence you have not seen line up in an overlay.
3. **Back-project to name things**: `groundPoint(cam, u, v, y)` then look for places near that ground point
   (`list_landmarks near`). With the first rough solve this named Greenland Pier, the South Dock marina and the Surrey
   Quays car park in the aircraft photo, and showed the photo's "east end of Greenland Dock" was really the Steelyard
   cut: the east third of the dock is hidden behind the buildings on its north bank at an 18 deg look-down.
4. **Read pixels on a grid**: crop at 2x to 3x with lines every 25 px (ImageMagick installs in seconds: the
   `container-improver` skill in danbri/glitchcan-minigam,
   https://github.com/danbri/glitchcan-minigam/blob/master/.claude/skills/container-improver/SKILL.md). Points read
   this way are good to about 3 to 5 px.
5. **Fit** (`solve.mjs` / MCP `solve_camera`), with three kinds of evidence:
   - points: a pixel and a landmark id (`cwb-xxxx` tower top, `place:<name>`), or `xyz`, or `lonlat`;
   - **outlines**: a pixel anywhere on a shoreline, `outline: 'water:tidal'` (all Thames polygons), `'water:<name>'`
     or `'water:<index>'`; the residual is its distance to the projected outline. This is the strongest evidence from
     the air: the river and dock edges are long, sharp and well mapped, and no pixel has to be matched to a vertex.
     A shoreline point constrains only across the line, so use points on bends and on lines in several directions;
   - **horizon** pixels: the target elevation is the sea-level dip from the eye height (about -0.85 deg at 800 m),
     weight 0.5 because the visible horizon is hills 20 to 40 km away. It pins pitch and roll at the top of the frame,
     where there is no mapped feature.
   Free parameters: x, y, z, heading, pitch, roll, focal (7). Add `k1` only when it lowers the rms clearly; add the
   principal point (cx, cy) only with many points all over the frame (a screenshot crop moves it, but it trades off
   against heading and pitch).
6. **Judge it** (next section), then put it on the page (last section) and compare.

## The camera model

Pinhole: `a = (d.rt)/(d.fw)`, `b = (d.up)/(d.fw)`, `u = cx + f a`, `v = cy - f b`. Axes from heading H, pitch P, roll R:
`fw = (sin H cos P, sin P, -cos H cos P)`, `r0 = (cos H, 0, sin H)`, `u0 = r0 x fw`; `rt = cos R r0 + sin R u0`,
`up = cos R u0 - sin R r0`. **Roll +** = the horizon falls to the right in the image (the camera's right side tilts
up). Radial: `(a, b) *= 1 + k1 (a^2 + b^2)`; barrel is k1 < 0 (a line above the centre bows up, ends sag). Earth
curvature drop `d^2 / 2R x 0.87` is applied to every point (0.2 m at 2 km, 2 m at 6 km: small, but free).
`hfov = 2 atan(W / 2f)`.

Aircraft windows: the acrylic panes add little distortion near the middle; the frame and the scratched outer pane cut
and blur the corners (the aircraft photo's lower right). A phone's main lens is about 65 to 75 deg wide; the aircraft
photo fitted 56.9 deg at 1195 px, so it is probably a crop or a 1.x zoom. A wide (0.5x) lens is about 100 to 120 deg
and needs k1 (the Greenland day photo: 99.8 deg).

## The error budget

- **rms of the fit**: about what the pixel reading gives (3 to 5 px on a 1200 px photo). The aircraft fit: 4.8 px over
  43 observations.
- **Formal sigma** (from the covariance x the residual variance) is too small: it assumes the correspondences are right.
  The aircraft eye was +-11 m in height formally, but the variants (one more point, free principal point, k1) moved it
  by 50 m. **Report the spread of the variants, not the formal sigma alone.**
- **Hold-outs**: fit without a group of points and project them. A whole region held out is the best test (the
  aircraft photo's right-edge river, 2.5 km away: rms 7.7 px, pass). One hold-out that fails by 40 px (the park at the
  left of the aircraft photo) means the identification is wrong or the landmark's coordinate is not the feature you
  clicked: putting it into the fit made every other residual worse, which is the sign to drop it. Say so; do not hide it.
- **Range versus focal length**: with every point far away and in a narrow band of depth, eye distance and focal length
  trade (a closer, narrower camera looks the same). Near points (tower tops under the camera) break the trade.
- **Tower tops**: towers.json is a LiDAR fit (rms 1 to 2 m); "top tier centre" is the middle of the roof, not the
  crown edge you see. 5 to 10 px residuals at 1.2 km were normal.

## What fails

- **Too few landmarks**: 4 points (8 numbers) for 7 parameters leaves one degree of freedom; the first aircraft solve
  with 4 points gave roll +-10 deg. Use outlines and the horizon.
- **All landmarks collinear or in one depth band** (a skyline from the ground): heading, field and position trade;
  fix the eye from the photo's place (a pier, a promenade) and fit only heading, pitch, roll and focal, as the ground
  views did.
- **Misidentified features**: the dock end that was really a cut; the "park" that was not the park. Overlay and
  back-project before you believe a match.
- **Features beyond the model box**: they cannot be landmarks. In the aircraft view everything above about 200 px (south
  London, 5 to 40 km) is outside the box; the page fills it with its sky colour (top-third luma 0.85 in the render
  against 0.65 in the photo).
- **Buildings newer than the LiDAR and OSM** (cranes, towers built since 2022): not in the model; do not use them as
  landmarks. After the solve they are findings: a tower top that no model building explains is new (fault F52 in the
  hub skill). Trace the ray through its top and look for OSM outlines within a few metres of it (cwdock photo 01: a
  tower on Marsh Wall at Consort Place, about 216 m OD +-15 m, that the model draws as a pit).
- **The sun out of the frame or behind cloud**: the time is weak (see below).

## The owner's photos and their licence

The aircraft photo is CC0 1.0 with the owner (danbri) as photographer and copyright holder: "Plane photo - yes cc0,
record me as owner" (2026-10-05 12:23 UTC; `docklands/reference/plane-2026-10/README.md`, glitchcan-minigam commit
2f2772fb). The day
photos from Greenland Pier ("I am copyright holder but will CC0 them.", 2026-10-04; `docklands/reference/day-2026-10-04/`)
and the sets cwlibrary and cwdock (londat `data/images/contrib/`) are CC0 too, and so are greenlanddock (2026-10-11) and greenlandpier ("occasional cczero photos I contribute ... here is
a new contrib photo I hereby donate", 2026-11-23). The night photos of 2026-10-03
(`docklands/reference/night-2026-10-03/`) are not: the owner's copyright, kept with permission as reference ("Keep my
photos", 2026-10-04). A new photo: ask for the licence and the creator before you commit it, and write both, with the
owner's words and date, in its README.

## Telephoto skylines and bearings (set cwdock, 2026-10-07)

- **A 3x telephoto from the ground** (cwdock photo 01, focal 5,570 px, horizontal field 26 deg): the eye was not known
  (the phone map fix, +-10 m, is one moment of the walk, not this photo's place), so x and z were left free and fitted
  with heading, pitch, roll and focal on sure tower tops (a logo, a unique form). Three tops leave the eye free along a
  line (a valley of equal rms). Four gave rms 2.2 px, the eye to +-60 m, and a held-out fifth top (Hampton Tower) at
  8 px. Result: about 250 m south of the map fix; heading 63.9 deg grid (65.4 true), pitch 9.3, roll -1.3.
- **Bearings between identified buildings** place a judged camera when a photo shows three or more with the main lens
  (focal about 1,860 px on the 2,576 px side: an assumption, no EXIF). Photo 11's twin towers did not fit a camera at the
  map fix; the bearings put it on the pontoon ramp about 55 m west. Photo 18 repeats cwlibrary photo 1 and puts that
  camera about 65 m south-south-east of Ontario Point, not south-west as first judged: open, see the hub skill.
- Details per photo: londat `data/images/contrib/cwdock/photos.json` and the hub skill `docklands-data-curation`,
  "Contributed photos".

## Greenland Dock by day (2026-10-11): a calibration photo

The owner's CC0 photo `data/images/contrib/greenlanddock/2026-10-11-gd-01-greenland-dock-east.jpg` (12:45 BST, iPhone,
2576 x 1932, Display P3), given "to calibrate our lighting, nature, water, trees, and birds data". Camera and
measurements: https://github.com/danbri/londat/blob/main/data/images/contrib/greenlanddock/README.md . Port view
`?view=greenlanddock` (Menu > Views > "Greenland Dock, day"; roll -1.59 deg); only the Three.js port has it.

- **Few points from the ground.** Only one tower top (Pan Peninsula, cwb-0801) was sure; the others were under the near
  tree. Seven waterline pixels on the dock outline and the corner of the projecting quay (top and waterline) gave the
  rest. With the focal length free the fit went to 1413 px (85 deg, sigma 307 px) and put the eye in the water: fix the
  focal length from the phone lens when the frame has few points (iPhone main lens: 24 mm equivalent, f = 24 / 43.27 x the
  image diagonal in pixels = 1785 px at 2576 x 1932; check against the photo when a known pair of towers is in view).
- **Read the dock's axis.** The left bank vanished 15 deg left of the frame centre: heading = the dock axis (71 deg) +
  15 deg. The first guess (heading 70, the axis) was wrong by 15 deg; the overlay showed it at once.
- **Tones.** `docklands/test/photo-tones.mjs` measures named regions of the photo and of the port's render at the photo
  time (median sRGB; Chromium converts the photo's P3). Before the calibration the sky at 25 to 28 deg up was luma 0.82
  against 0.58 in the photo; after (docklands-sky, "Sky calibration") about 0.56.
- **What the model lacks here:** the near 20 m of water under the quay is ground (F54 in the curation skill); the big
  plane tree at the left is not in the tree data at that place; the boats at the east end are not drawn.

## Greenland Pier, low sun (2026-11-23): the sun as a landmark

The owner's CC0 photo `data/images/contrib/greenlandpier/2026-11-23-gp-01-thames-east-morning-sun.jpg` (09:10 GMT,
iPhone 17 Pro main lens, 2576 x 1932, Display P3), looking east-south-east across Limehouse Reach into a sun 10.8 deg up. Camera
and measurements: https://github.com/danbri/londat/blob/main/data/images/contrib/greenlandpier/README.md . Port view
`?view=greenlandpier` (Menu > Views > "Greenland Pier, morning"); only the Three.js port has it.

- **Get the camera's own time before you trust a sun solve.** The owner's "approx 3 mins ago" gave 09:13; the Photos
  panel said 09:10. The 3 minutes are 0.66 deg of sun azimuth: the fit hid them by moving the eye 6 m, and the far towers
  (1.2 to 1.8 km) failed as hold-outs by 18 and 23 px. With 09:10 they passed (0.2 and 6.7 px) and the eye came to 1.6 m
  from the pier point. A sun in the frame needs the time to the minute; ask for the Photos "Info" panel.
- **Ask for the zip before the analysis** (owner, 2026-11-23: "In future when given Apple-damaged uploads ask whether you
  can get them zipped before spending ages doing pointless analysis."). Cost of not asking: on 2026-11-23 four photos sent
  as images (set thames-2026-11-23) took about an hour of camera solves, a glint-as-clock attempt and moon-time searches
  that the EXIF would have answered at once; one solve (the night photo's eye) was wrong. First step for any new photo:
  read its EXIF; if there is none, ask for a zip and wait.
- **A zip keeps the EXIF; a chat image does not.** A photo sent as an image in the chat, also "as a file", arrives as a
  2576 x 1932 JPEG with no time, GPS or camera (every contributed photo before 2026-11-23 arrived that way: none of the 55
  JPEGs in `data/images/contrib/` and `docklands/reference/` has EXIF). A zip of the original HEIC keeps all of it: time to
  the millisecond, GPS with its error, compass, lens. Ask the owner for a zip. Read the HEIC's EXIF with Pillow: find the
  TIFF header (`MM\x00*`) after `Exif\x00\x00` and pass the bytes to `PIL.Image.Exif().load`.
- **GPS and compass are evidence, not the answer.** Here the GPS fix (3.07 m stated error) was 10 m from the solved eye, and
  holding the eye at the fix made the near buildings miss by 9 to 18 px; the compass (134 deg magnetic on a steel pontoon)
  was 14 deg off the sun-solved heading. Start the solve from them, then let the photo decide; record both.
- **The sun in the frame gives heading and pitch at once** when the time is known to a minute: put a point 20 km out along
  the computed direction (add the curvature drop d^2 / 2R x 0.87 back to its height, because `project` takes it off) and
  refit two or three times as the eye moves. With f fixed at 1785 px it gave heading 120 and pitch 3 before any building
  was named.
- **Find the eye from one sure tower before you trust the rest.** Orion Point (the only cylinder on the Isle of Dogs west
  shore, `area.js` 199, not in `towers.json`) on the sun's line gave the bearing line through Greenland Pier.
- **Two solutions with the same rms on a waterline**: the shoreline fixes only the vertical, so the eye can slide along the
  shore. A fit without Riverview Court put the eye 30 m north-east of the pier, in the river, at rms 1.6 px, and missed
  Riverview Court by 131 px when that was held out. The fit with it put the eye on the pontoon at rms 5.3 px. Use
  horizontal positions of named buildings (`px: [u, null]`) on both sides of the frame, near and far.
- **Eye height from the tide**: the pier floats. Read the river level of the hour from `cwplans/cache/latest.json` (theme
  `tide`, EA gauge Silvertown) and put the eye about 2.5 m above the water; 2.9 to 4.9 m OD moved the eye less than 1 m.
- **Tune live, then gate by the sun.** Load the page once and set uniforms from Playwright (`__docklands3.sky.sky` turbidity,
  mie, `userData.gain`; `__docklands3.renderer.toneMappingExposure`; modules by `import('/docklands/water.js')`), screenshot
  and measure each variant: five variants cost one page load (about 4 minutes in SwiftShader) instead of five. Make each
  change depend on the sun's altitude or the view's angle to the sun so earlier calibrations (other sun heights) stand.
  Look at the picture as well as the numbers: a hard luminance cap passed the region numbers but dimmed the sun's disc and
  drew a ring round it.
- **Tones against the light are exposure-bound**: the phone exposed for the sun (sky 0.29, shore 0.10 luma), so compare
  ratios to a reference region (`photo-tones.mjs --set greenlandpier`, column "÷ sky_near_sun"), not absolute luma. The
  README lists what the port lacks here: the warm horizon round a low sun, brown turbid water, choppy water without mirror
  reflections, and the glare round the sun.

## Rendering moglob at a photo's camera (2026-11-23)

- `tools/view-mcp/render.mjs` renders the old WebGL 1 page (`cwplans/docklands/`), not moglob. For moglob, open
  `docklands/?t=<time>&labels=0&webgl&animate=0`, wait for `__docklands3.ready`, then
  `__docklands3.setCam({ ...eyeView(eye, heading, pitch, hfov), roll })` with `eyeView` imported from `/docklands/views.js`;
  wait about 25 s; screenshot. About 8 minutes a view in SwiftShader; a background command stops at 30 minutes, so run at
  most three views a command.
- Read the page's inputs after the render (`WU.windSpeed`, `WU.windDir`, `sky.state.weather`): the weather sources fail in
  the container (Open-Meteo's daily limit after many loads; the live-cache METAR fetch aborts at 8 s while the page is
  busy) and the page falls back to 4 m/s from 240 without an error. Set the airport report by hand with `?wind=m/s,deg`.
- With the EXIF: eye at the GPS fix, focal = f35 / 43.27 x the image diagonal in pixels, fit only heading, pitch and roll.
  The phone compass on a boat was 14 to 120 deg wrong; do not use it there.
- Tune a colour live: one page load, change the exported constant or uniform from Playwright, `applyLight()` or
  `frameNow()`, screenshot, measure, repeat (night sky: three rounds, 2026-11-23). The tone mapping shifts colours (AgX made
  a dark blue more saturated and removed its red): measure the output, never assume input equals output.
- HDR from the HEIC: the gain map (`urn:com:apple:photo:2020:aux:hdrgainmap`) and Apple's headroom (maker-note tags 33 and
  48) give brightness above the SDR white: HDR = SDR x (1 + (headroom - 1) x gain). The sky mask
  (`...:aux:semanticskymatte`) selects sky pixels exactly. `pillow-heif` reads both (8-bit); the linear thumbnail and the
  style delta map are 10-bit and it does not read them.

## Ground versus air

Ground (a pier, a promenade): the eye is known to a few metres from where the photo was taken and its height from the
deck; landmarks are skyline tops, all far and in one band. Fix the eye; fit heading, pitch, roll, focal. Air: the eye is
the unknown that matters; the ground is a map seen obliquely: shorelines, docks, rail lines, roads. Fit everything; use
near tower tops (they fix range) and the horizon (it fixes pitch and roll).

## The time from the sun or moon

`sun_at(time)` and `time_from_sun(date, azimuth, altitude)` (MCP; `sunAt`/`timeFromSun` in view-lib, astronomy-engine
vendored, topocentric, refraction "normal"). Turn a pixel into a direction with `ray(cam, u, v)`; azimuth = atan2(x, -z)
in grid degrees, plus 1.55 for true. Evidence by strength: shadows on a level surface (`tools/solve-photo-sun.mjs`,
+-35 min in the Greenland day photo); the sun or moon in the frame (a few minutes: the night photo, docklands-sky skill);
the bright sky under cloud (aircraft photo: +-40 min, and only if the date is known). The date matters as much as the
azimuth: in October the sunset azimuth moves about 0.7 deg a day. Without EXIF, say which date you assumed.

## Flight paths

London City: `docklands/data/sky/lcy-approach.json` (thresholds 09 west and 27 east, 5.5 deg glide, 15 m crossing
height). The 09 final is on the runway centreline, about 440 m high 4.4 km out; check the eye's height and its offset from
the centreline before you say "on the approach". The aircraft photo's eye was 360 m above it and 650 m north: not the
final. No published departure or Heathrow procedures are in the repo; one photo gives no track or direction of flight.

## On the page

`VIEWS` in docklands/index.html: `name: { ...eyeView([x, y, z], heading, pitch, hfov), roll: R, night: false }`.
`eyeView` puts the orbit centre 1.2 km along the line of sight; `roll` turns the look-at up vector (`rolledUp`), and
`setView`/`setEye` clear it. The page has no k1: refit with `k1 = 0` for the page (the rms change says what it costs).
Add `&t=<London time>` for the sky clock (day light from the sun direction). URL:
https://danbri.github.io/londat/cwplans/docklands/?view=plane&t=2026-10-05T17:40

Check the page against the solver: `render.mjs` returns `page_projection` (landmarks through `__docklands.MVP`); for the
plane view it agreed with view-lib to 0.2 px. Test headless at 1600 x 900 DPR 1 and 390 x 844 DPR 3 plus the photo size,
no console errors, and look at the pictures (docklands-3d-page skill, "Testing").

## The tools

`tools/view-mcp/` (repo root; Node, no build):

| file | what |
|---|---|
| `view-lib.mjs` | model loading (area.js in a vm, towers.json), `geo`/`lonlat`, `groundAt`, `landmarks`, camera `project`/`ray`/`groundPoint`, `solveCamera` (Levenberg-Marquardt), `sunAt`/`timeFromSun` |
| `solve.mjs` | `node tools/view-mcp/solve.mjs <points.json> [--k1] [--out solution.json]` |
| `overlay.mjs` | `node tools/view-mcp/overlay.mjs <photo> <camera.json> <out.png>`: the model drawn over the photo |
| `render.mjs` | `node tools/view-mcp/render.mjs <camera.json or -> <out.png> [--view plane] [--t ...] [--width --height --dpr] [--base URL]`; also `compare()` |
| `server.mjs` | the MCP server "docklands-view" (.mcp.json) |
| `test.mjs` | drives the server over stdio and checks every tool (about 2 minutes) |

Points file (`reference/plane-2026-10/points.json` is the example): `width`, `height`, `initial` camera, `free`
parameters, `points` (`px` plus `id` | `xyz` | `lonlat` | `outline`; `w` weight; `holdout: true`), `horizon` pixels.

### The MCP server (docklands-view)

Hand-rolled stdio JSON-RPC like `tools/game-mcp/server.mjs` in danbri/glitchcan-minigam
(https://github.com/danbri/glitchcan-minigam/blob/master/tools/game-mcp/server.mjs; no SDK dependency). Cameras are objects
`{ eye:[x,y,z], heading_deg, pitch_deg, roll_deg, focal_px | hfov_deg, k1, width, height }`.

| tool | does |
|---|---|
| `list_landmarks` | named 3D points: tower tops (id `cwb-xxxx`), places (`place:<name>`); filter by `near` [x,z] + `radius`, `bbox`, `kinds`, `query` |
| `project` | camera + points (ids, xyz or lonlat) -> pixels |
| `ground_point` | camera + pixels -> ground points and the places near each (name things in the photo) |
| `solve_camera` | image size, correspondences, horizon, initial guess, free -> camera, rms, sigma, residuals, hold-outs, WGS84 eye |
| `overlay` | photo + camera -> PNG with the model's water, rail, towers and box drawn on it |
| `render_view` | camera or `view` name, `t`, size, `base` (local checkout or the live site) -> PNG path, console errors, page projection |
| `compare` | photo + render + correspondences -> side-by-side PNG, luma (mean, top third, lower two thirds), px errors |
| `sun_at` / `time_from_sun` | astronomy-engine sun or moon position at a time; times on a date when the body had an azimuth or altitude |
| `geo` | lon/lat <-> model metres |

Lessons in this file, not in the tool headers. Append each reconstruction to the curation skill's ACTIVITY-LOG.md.
