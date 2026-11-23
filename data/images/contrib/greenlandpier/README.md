# Contributed photo: Greenland (Surrey Quays) Pier, low November sun, 2026-11-23

One photograph taken by danbri (the project owner) at about 09:13 GMT on 23 November 2026 on an iPhone, given to the
project under **CC0 1.0** (https://creativecommons.org/publicdomain/zero/1.0/). The owner, 2026-11-23 09:16 GMT: "moglob
... has been built with occasional cczero photos I contribute through sessions like this, to tune the visual presentation
especially to day/time/season. Considering these and other properties including sun position here is a new contrib photo
I hereby donate. It was taken approx 3 mins ago."

| file | SHA-256 |
|---|---|
| `2026-11-23-gp-01-thames-east-morning-sun.jpg` (2576 x 1932, 611,691 bytes) | b68591ac817a1f7fea5d181186c9961b4c248aba3b4bcc5d2ef822c3daf5dabf |

The file is the JPEG as delivered, renamed only. It has no EXIF time, GPS, make or model (orientation, resolution and pixel
size only) and an embedded **Display P3** ICC profile: convert to sRGB before you measure a colour (fault F51 in the
curation skill). The time is from the owner's words: the photo arrived at 09:16:37 GMT, "approx 3 mins" after it was taken.

Place: the owner, 2026-11-23: "it was Greenland Surrey Quays clipper pier" (the Thames Clippers / Uber Boat pier
"Greenland (Surrey Quays)", OSM and `area.js` place "Greenland Pier"). The owner asked for the embedded location, but the
file as received has none: the EXIF GPS directory is absent and the Photoshop block holds only an empty IPTC record; the
upload path removed it. The camera solve below found the same pier from the photo alone, before the owner named it.

People and vehicles: none visible. No number plate. Optical artefacts: a green lens flare spot at (350, 1290) and an orange
blur in the lower-left corner (a finger or the case at the lens edge); do not read them as objects.

## Camera

Solved with `tools/view-mcp` (skill `photo-view-reconstruction`). Focal length fixed at 1785 px (the iPhone main lens, 24 mm
equivalent, as for the Greenland Dock photo). Eye height fixed at 3.9 m OD (the floating pontoon: the Environment Agency
gauge at Silvertown read 1.31 m OD at 09:00 GMT and rising about 0.3 m per 15 minutes, so water about 1.3 to 1.5 m OD, deck
about 1 m above water, eye 1.5 m above deck). Free: x, z, heading, pitch, roll.

- Eye (-824.2, 3.9, 1157.8) model metres: -0.03181, 51.49470, on the Greenland (Surrey Quays) Pier pontoon, 6 m from the mapped pier point (confirmed by the owner).
  Sigma x 3.0 m, z 1.2 m.
- Heading 119.82 deg grid (121.4 true; sigma 0.14), pitch 3.40 deg (0.06), roll -3.80 deg (0.23: the horizon falls to the
  left; the verticals of Riverview Court lean the same way), horizontal field 71.6 deg.
- rms 5.3 px over 19 observations (17 pixels, two of them with both coordinates): the sun's centre (1988, 660), set 20 km out along the computed direction (azimuth 143.81
  true, altitude 10.80 deg at 09:13:30 GMT, astronomy-engine with refraction); the top of Orion Point at its near rim; 11
  pixels on the Thames waterline (outline `water:tidal`); the horizontal centres of Riverview Court, Neptune Court, Collier
  Point and Knights Tower.
- Variants: eye height 2.9 or 4.9 m moves the eye less than 1 m and the heading 0.03 deg; focal length free gives 1849 px
  (sigma 35) and moves the eye 10 m; the spread of the variants is the error, about 10 m in position and 0.8 deg in heading.
- Hold-outs (fitted without them): Neptune Court 3.2 px (pass); Collier Point 18 px and Knights Tower 23 px at 1.2 to 1.8
  km (fail at that range: the fit without them has no feature beyond 600 m except the sun and the far waterline, so the
  heading trades against the eye position). An earlier fit with the eye free and Riverview Court left out put the eye 30 m
  north-east, off the pontoon, and missed Riverview Court by 131 px: that solution is rejected.
- The sun residual in the final fit is 10.7 px (0.34 deg in azimuth, about 1.5 minutes of time): the time is not solved
  from the photo, it is the owner's time, and the photo agrees with it to about 2 minutes.
- Orion Point's top in the photo is 11 px (about 3 m) above the model's top (51.9 m OD, EA LiDAR): the scaffold or the
  roof disc rises above the LiDAR fit.
- On the page: https://danbri.github.io/londat/docklands/?view=greenlandpier&t=2026-11-23T09:13

## What the photo shows

The Thames at Limehouse Reach, looking east-south-east from Rotherhithe to the west shore of the Isle of Dogs (Millwall),
with the low sun over Deptford and Greenwich. Model buildings, by OSM key (`cwplans/docklands/data/building-keys.json`):

| photo x (px) | building | OSM way | model index | top m OD | range m |
|---|---|---|---|---|---|
| 59 to 294 | Telstra London Hosting Centre, 5-6 Greenwich View Place (office block) | 115238481 | 3689 | 48.0 | 895 |
| 413 to 552 | Riverview Court, Old Bellgate Place (the brick tower) | 209688911 | 6629 | 33.8 | 330 |
| 882 to 1157 | Montcalm House, Westferry Road (brick blocks with chimneys) | 24951483 | 203 | 21.7 | 380 |
| 1107 to 1386 | Nova Building and Apollo Building, Newton Place | 24950118, 24950117 | 198, 197 | 30.6, 34.4 | 416, 466 |
| 1446 to 1566 | Orion Point, 7 Crews Street (the round tower, in scaffolding on 23 November 2026) | 24950157 | 199 | 51.9 | 509 |
| 1601 to 1716 | Neptune Court and Artemis Court, Homer Drive (steep roofs) | 369740120, 369740119 | 9940, 9939 | 39.8, 31.6 | 574, 595 |
| 2088 to 2138 | Collier Point | 503559548 | 14350 | 83.7 | 1826 |
| 2338 to 2413 | Knights Tower, 14 Wharf Street, Deptford | 450333025 | 13328 | 59.2 | 1223 |

Not in the model (findings, fault F52 in the curation skill):

- a block with glass balconies at the left edge (photo x 0 to 65, top at 5.7 deg elevation, bearing 86 deg true): 34 m OD
  if it stands on the Isle of Dogs shore 300 m away. No model building is on that line inside 5 km except one 1.1 km away
  whose top is below the photo's.
- a tower crane at bearing 92.6 deg true (photo x 310), top 33 to 43 m OD at 300 to 400 m.
- a tower crane over Deptford at bearing 144.9 deg true (photo x 2061), top about 58 m OD at 1 km.

Sky and weather: cirrus and thin altocumulus, no low cloud; Open-Meteo at 09:00 GMT: 4.4 deg C, cloud 39%, wind 2.5 km/h
from 128 deg, weather code 1 (mainly clear). The water is choppy (rising tide) with a long sun glitter path. The sun is 10.8
deg up, 22 deg right of the view's centre: the shore and buildings are silhouettes, so their colours here are not material
colours.

## Measurements (sRGB, medians; `docklands/test/photo-tones.mjs --set greenlandpier`)

Photo against the port's render of `?view=greenlandpier&t=2026-11-23T09:13` (WebGL in SwiftShader, Open-Meteo blocked so no
clouds drawn), 2026-11-23. The phone exposed for the sun, so the absolute lumas differ by exposure; the last column divides
each luma by the luma of `sky_near_sun` in the same image.

| region (photo px) | photo sRGB (luma) | render sRGB (luma) | ratio to sky_near_sun, photo / render |
|---|---|---|---|
| sky_top_left (100..1300, 0..120: about 30 deg up, away from the sun) | 59, 77, 103 (0.294) | 92, 135, 175 (0.505) | 0.40 / 0.54 |
| sky_mid_left (100..700, 600..760: about 12 deg up) | 76, 100, 124 (0.379) | 131, 168, 194 (0.635) | 0.51 / 0.67 |
| sky_near_sun (2150..2450, 480..600) | 192, 190, 179 (0.744) | 235, 241, 243 (0.941) | 1.00 / 1.00 |
| sky_low_sun_side (1900..2040, 840..920: 2 to 4 deg up, left of the sun) | 241, 206, 152 (0.822) | 251, 250, 246 (0.980) | 1.10 / 1.04 |
| shore_shade (1000..1200, 1000..1075: Montcalm House against the light) | 27, 26, 25 (0.103) | 59, 53, 40 (0.209) | 0.14 / 0.22 |
| water_glitter (1950..2150, 1150..1500) | 194, 181, 158 (0.714) | 238, 241, 237 (0.941) | 0.96 / 1.00 |
| water_mid_left (100..1300, 1250..1500) | 64, 68, 74 (0.265) | 118, 146, 159 (0.553) | 0.36 / 0.59 |
| water_near (300..1500, 1600..1850) | 40, 38, 38 (0.151) | 51, 85, 110 (0.312) | 0.20 / 0.33 |

What the render lacks against this photo (open; no renderer change made on 2026-11-23):

1. The warm low sky round a low sun: the photo is yellow-orange near the horizon on the sun side (241, 206, 152; b* strongly
   positive); the render is white (251, 250, 246).
2. The contrast of the sky away from the sun: photo 0.40 of the sun-side sky, render 0.54.
3. The water colour: the photo's Thames is neutral brown-grey (40, 38, 38 near; 64, 68, 74 mid); the render's is blue
   (51, 85, 110), and too bright against the sky (0.59 against 0.36).
4. The water surface: the photo shows short choppy waves on a rising tide with no building reflections; the render shows
   near-mirror water with long reflections of the shore buildings.
5. The sun: the photo shows a bright disc with a wide glare and a warm glitter path (194, 181, 158); the render shows a
   small white disc and a white glitter path.
6. The shore against the light: the photo's facades are silhouettes (0.14 of the sun-side sky); the render lights them
   (0.22) and shows brick colours.

The page's sun is at (1992, 659) in the 2576 x 1932 render, 4 px from the photo's: the page's clock, sun model and the
view agree with the solve. The render also shows a post with a white globe about 2 m from the eye that the photo does not
show at that place (the photo's near post is at its right edge, x 2280 to 2576): within the eye's 3 m error.
