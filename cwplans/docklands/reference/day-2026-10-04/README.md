# Day reference photos, 4 October 2026

Eight photos of the Isle of Dogs west shore and Canary Wharf, taken by the owner (danbri) on Sunday 4 October 2026 in daylight
and given to the project as reference for the 3D page's day view and for the index of works in progress.

**Licence: CC0 1.0 Universal (public domain dedication) by the owner.** Owner, 2026-10-04: "I am copyright holder but will
CC0 them." Deed: https://creativecommons.org/publicdomain/zero/1.0/. No attribution is required; we credit the owner anyway.
The photos may be used as evidence in the data (for example the floor numbers painted on a building core).

Where and conditions (the owner's account): "from middle of Greenland Dock Surrey Quays clipper pier, blue skies, calm water,
low wind, direct October sun". Greenland Pier is on the Rotherhithe (Southwark) bank; the pontoon is at about x -830, z 1158 in
the 3D model's metres (BNG E 536720, N 179142). The camera looks north-east across the Thames to the Isle of Dogs west shore
(Westferry Road, Cuba Street, Marsh Wall) and the Canary Wharf towers behind.

The files are the originals as uploaded (no reduced copies: the page does not load them). They have **no EXIF**: no capture
time, GPS or lens data survived the upload (checked with exiftool 2026-10-04: image size only).

| file | what it shows (judged from the frame; tower names by bearing from the pier, see below) |
|---|---|
| `pier-wide-skyline.jpg` | wide (ultra-wide lens, horizontal field about 100°): the pontoon deck with two mooring bitts in front, the river, the Isle of Dogs west shore and the Canary Wharf skyline from Newfoundland and Landmark Pinnacle (left) past One Canada Square to the Millwall towers (right); two cranes and a concrete core left of One Canada Square |
| `zoom-one-canada-square-cranes-citi.jpg` | zoom: One Canada Square; to its left a concrete core with blue "TIDE" screens at the top and two tower cranes, and in front of it a wrapped building with "ballymore" / "PENTA" screens and a "25 CUBA" wrap; the Citi sign on the right; two more cranes far left behind the towers |
| `zoom-tide-core-cranes.jpg` | zoom on the "TIDE" core: floor numbers 24 to 31 painted on its east face, a loading platform marked "CBR"(?), two tower cranes with "TIDE" on the jibs, the "25" wrap with "ballymore" and "PENTA" screens in front; behind on the left a white luffing crane and a lattice crane over a building with scaffolding |
| `zoom-one-canada-square-core.jpg` | One Canada Square with the core and its cranes on the left (floor numbers 24 to 31 legible) |
| `zoom-newfoundland-landmark-pinnacle.jpg` | two tall towers: Newfoundland (white diagonal bracing) and, by bearing order, Landmark Pinnacle (dark glass) |
| `zoom-red-frame-riverside-block.jpg` | a riverside residential block with a red exposed frame and a projecting roof, the river wall and foreshore; towers behind |
| `zoom-dark-tower-citi.jpg` | a dark round-cornered residential tower, the Citigroup Centre ("citi") behind, riverside blocks with pitched roofs in front |
| `zoom-towers-pitched-roof-blocks.jpg` | two 1980s-90s residential blocks with pitched metal roofs in front of newer glass towers |

## The works in progress in these photos

Answer and sources: `registry/sources/construction/README.md`, "The sites in the owner's photos of 4 October 2026". In short:
the concrete core with the "TIDE" screens is **30 Marsh Wall** (Tide Construction, a 48-storey, 1,068-room student building for
Vita Group; Tower Hamlets PA/20/02588/A1; commenced October 2025); the "25 CUBA" wrap with the Ballymore and Penta screens is
**25 Cuba Street** (Ballymore and Penta Real Estate, a 52-storey, 421-home tower; PA/20/02128/A1 and PA/24/00733/S; commenced
September 2025). They are two schemes on neighbouring plots, on one line of sight from the pier (bearings 33.05° and 33.17° from
grid north; 30 Marsh Wall 60 m further away).

## The photo time, from shadows (2026-10-04)

Result: **4 October 2026, about 11:30 BST (10:29 UTC), between 11:05 and 12:10 BST**, for `pier-wide-skyline.jpg`.
The other photos were taken from the same place with a zoom lens and show the same lighting (south-south-east faces lit);
their order is not known.

Method (`node magpie/cwplans/tools/solve-photo-sun.mjs`, input `points.json` in this folder):
1. A pinhole camera (heading, tilt, roll, focal length) fitted by least squares to four tower tops of the model
   (`docklands/data/towers.json`: Newfoundland's crown, Landmark Pinnacle's roof, One Canada Square's apex, and the Citigroup
   Centre's roof sign horizontally only), eye on the pontoon at (-830, 4.5 m OD, 1158). Result: heading 51.9° from grid north,
   tilt +6.8°, roll +0.65°, focal 1,085 px, horizontal field 99.8°; rms 3.8 px (largest residual 3.9 px). The tilt puts the
   horizon at y 1,095 px; the far waterline in the photo is at about 1,088 px, an independent check.
2. Three shadows on the deck: the foot of a bitt post and the shadow of its cap, back-projected through the fitted camera onto
   a level deck 1.5 m below the eye. The bearing of the shadow plus 180° is the sun's grid azimuth; plus 1.54° (grid to true
   north here) the true azimuth. The azimuth does not depend on the camera height; the shadow length does.
3. astronomy-engine 2.1.19 (vendored, `docklands/vendor/`), topocentric, refraction "normal", gives the time of each azimuth.

| shadow | sun azimuth (true) | time (UTC) | sun altitude then |
|---|---|---|---|
| front bitt, left post | 168.4° | 11:10 | 33.5° |
| front bitt, right post | 151.7° | 10:11 | 30.4° |
| far bitt | 149.9° | 10:05 | 29.9° |
| mean | 156.7° | 10:29 | 31.6° |

Uncertainty: the spread of the three shadows (150° to 168°) is the error, about ±35 minutes. It comes from reading the foot of
each post, which is hidden by the base plate and the post's own shadow (a 10 px error in the foot moves the azimuth by about
8°). The shadow lengths agree with the altitude only if the bitts are about 0.23 m tall (0.38 m shadow at 31°): plausible for a
small pontoon bitt, not measured. The lit and dark faces agree: south-south-east faces lit, west faces dark (One Canada
Square's west face is darker than its south face in `zoom-one-canada-square-core.jpg`).
