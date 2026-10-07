---
name: photo-view-reconstruction
description: >-
  Reconstruct the view of a photo of the magpie/cwplans Docklands zone (ground or air) on the 3D page: identify
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
   `container-improver` skill). Points read this way are good to about 3 to 5 px.
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
record me as owner" (2026-10-05 12:23 UTC; `docklands/reference/plane-2026-10/README.md`, commit 2f2772fb). The day
photos from Greenland Pier ("I am copyright holder but will CC0 them.", 2026-10-04; `docklands/reference/day-2026-10-04/`)
and the sets cwlibrary and cwdock (londat `data/images/contrib/`) are CC0 too. The night photos of 2026-10-03
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
https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/?view=plane&t=2026-10-05T17:40

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

Hand-rolled stdio JSON-RPC like `tools/game-mcp/server.mjs` (no SDK dependency). Cameras are objects
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
