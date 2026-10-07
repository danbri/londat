# Evening view of the Thames from an aircraft (owner's photo, October 2026)

One photo, `evening-thames-from-plane.jpg` (1195 x 689 px), taken by the owner (danbri) through an aircraft window and
given to the project on 2026-10-05: "here is an evening view of nearby thames from a plane - can you reconstruct this view?"

**Licence: CC0 1.0 Universal** (https://creativecommons.org/publicdomain/zero/1.0/). Photographer and copyright holder: the owner, danbri, who dedicated it to the public domain on 2026-10-05: "Plane photo - yes cc0, record me as owner". It has **no EXIF**
(no time, GPS or lens data). The date is not known: the solve assumes 4 or 5 October 2026 (the day it was shared).

## What it shows

Looking south-west from above Poplar: Canary Wharf from above at the bottom left (Newfoundland, white diagonal bracing;
Landmark Pinnacle, dark; One Bank Street, the white-framed roof at the bottom edge), the Thames (Limehouse Reach) from the
bottom curving away to the upper left past Deptford, the Rotherhithe peninsula across the river with Greenland Pier,
Greenland Dock and the South Dock marina in the middle, the Surrey Quays shopping centre car park right of the dock, Russia
Dock Woodland, the Thames again at the right edge (the reach past Rotherhithe village towards Wapping, with moored boats),
the railway lines of New Cross and Deptford beyond, and south London to the hills on the horizon. The window frame cuts the
lower right corner. Low evening sun behind cloud at the right, out of the frame.

## The camera (solved 2026-10-05)

`node tools/view-mcp/solve.mjs cwplans/docklands/reference/plane-2026-10/points.json` (output: `solution.json`).
A pinhole camera with roll, fitted by Levenberg-Marquardt to 2 tower tops (`towers.json`), Greenland Pier (places list,
weight 0.5), 32 shoreline pixels (each one's distance to the projected OSM water outline: Greenland Dock's south bank,
both banks of Limehouse Reach, the Rotherhithe north shore) and 12 pixels on the visible horizon (the sea-level dip from
the eye height). 43 observations, 7 parameters.

| quantity | value | uncertainty (formal 1 sigma / judged from the variants below) |
|---|---|---|
| eye, model metres | x 210, y 803 m OD, z -846 | 16 / 100 m in x and z; 11 / 50 m in height |
| eye, WGS84 | 51.5125 N, 0.0161 W (over Poplar, between Poplar DLR and the Blackwall Tunnel approach) | about 100 m |
| altitude | about 800 m (2,630 ft) above sea level | +- 50 m |
| line of sight | 223.8 deg from grid north (225.3 deg true) | 0.4 / 1.5 deg |
| pitch | -13.6 deg (looking down) | 0.15 / 0.5 deg |
| roll | +9.2 deg (horizon falls to the right: the aircraft is banked, or the phone is tilted) | 0.2 / 1 deg |
| focal length | 1,102 px, horizontal field 56.9 deg | 13 px / 1.5 deg |
| rms | 4.8 px (of 1195) | |

Checks that were not fitted (hold-outs):
- **The Rotherhithe north shore** at the right edge (7 shoreline pixels, 2.5 km away): fitted without them, the camera puts
  them at 1 to 12 px from the photo shore, rms 7.7 px. Pass.
- **Greenland Dock, west end** (one point): 16 px. The end is rounded and read by eye; the dock's south bank in the fit is 2 to 10 px.
- **Sir John McDougall Gardens** (the playing field by the river at the left): 40 px. **Fail.** Put into the fit, it makes
  every other residual worse (rms 4.8 to 7.5 px, Greenland Pier 29 px), so the field in the photo is probably not that
  park's middle (or the OSM place node is not at it). Not used.
- Variants that set the "judged" uncertainty: with the park in the fit (eye 198, 750, -749); with a free principal point
  (277, 770, -850); with radial distortion k1 free (k1 = -0.11 +- 0.06, rms 4.6 px: not significant, the page has none).

The page's own projection agrees with the solver's to 0.2 px (render tool, `__docklands.MVP`).

## The time (from the sun, weak)

The sun is not in the frame and is behind cloud. The brightest sky along the horizon is at x 1,050 to 1,150 px, true azimuth
about 247 to 252 deg; the right edge of the frame at the horizon is 251.7 deg true. On 4 or 5 October 2026 the sun is at
azimuth 247 deg at 16:10 UTC and 258 deg at 17:00 UTC (astronomy-engine, from the eye). So: **about 17:10 to 18:10 BST, best
estimate 17:40 BST (sun azimuth about 255 deg, altitude about 6 deg), +-40 minutes**, if the date is 4 or 5 October.
Sunset that day is 18:31 BST. The sky is yellow, not red, and the ground still has light: the sun is above the horizon.
If the photo is from another date, redo it with `sun_at` / `time_from_sun` (view MCP).

## Which flight path

Not the London City Airport runway 09 final approach: that path (5.5 deg glide to the threshold at 0.0457 E,
`docklands/data/sky/lcy-approach.json`) is at about 440 m where the solved eye is (4.4 km before the threshold), and on the
runway centreline; the eye is 360 m higher and about 650 m north of the line, and an aircraft on that final heads east,
so a south-west view would be behind the right wing. The position fits a westbound aircraft looking out of the left side,
45 deg forward of abeam: for example a climb-out from London City runway 27 (the eye is 4.4 km past the runway's west
end at 800 m: a climb of about 15%, steep but within what London City jets fly). One photo gives no track, speed or
direction of flight; no published departure route was checked. Unproven.

## The view on the 3D page

https://danbri.github.io/londat/cwplans/docklands/?view=plane&t=2026-10-05T17:40

`plane` in `VIEWS` (index.html): `eyeView([211, 802, -845], 223.84, -13.56, 56.9)` with `roll: 9.18` and `night: false`.
The model ends at the box edge (x -5150 to 2350, z -2000 to 3600: from London Bridge to Leamouth, from Stepney to New
Cross): in this view the south edge is about 4.5 km from the eye, so everything in the photo above about y 200 px (south
London to the horizon, 5 to 40 km) is not modelled; the page's day sky fills it. Comparison (1195 x 689, DPR 1, map style,
SwiftShader WebGL): mean luma photo 0.507, render 0.555; top third 0.651 and 0.850 (the sky colour where London should be);
lower two thirds 0.434 and 0.408. Landmark errors are those of the camera (table above): the page reproduces it.
Side by side: `compare-photo-render.jpg` (the render shows OpenStreetMap data, © OpenStreetMap contributors, ODbL; LiDAR
heights © Environment Agency, OGL).
