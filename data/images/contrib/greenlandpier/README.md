# Contributed photo: Greenland (Surrey Quays) Pier, low November sun, 2026-11-23

One photograph taken by danbri (the project owner) at 09:10:57 GMT on 23 November 2026 on an iPhone 17 Pro, given to the
project under **CC0 1.0** (https://creativecommons.org/publicdomain/zero/1.0/). The owner, 2026-11-23 09:16 GMT: "moglob
... has been built with occasional cczero photos I contribute through sessions like this, to tune the visual presentation
especially to day/time/season. Considering these and other properties including sun position here is a new contrib photo
I hereby donate. It was taken approx 3 mins ago."

| file | SHA-256 |
|---|---|
| `2026-11-23-gp-01-thames-east-morning-sun.jpg` (2576 x 1932, 611,691 bytes; the chat upload, no metadata) | b68591ac817a1f7fea5d181186c9961b4c248aba3b4bcc5d2ef822c3daf5dabf |
| `2026-11-23-gp-01-thames-east-morning-sun-original.heic` (5712 x 4284, 2,537,218 bytes; the original, with EXIF and GPS) | 7f5c1065fb670f5fa7420b8c8cf46c178e83cc389f7b4d67e0e33c5f873bd2ec |

The JPEG is the file as delivered by the chat upload, renamed only: no EXIF time, GPS, make or model (orientation,
resolution and pixel size only) and an embedded **Display P3** ICC profile: convert to sRGB before you measure a colour
(fault F51 in the curation skill). The owner sent it twice; both uploads gave the same bytes, so the chat upload converts
the HEIF and removes the metadata. The owner then sent `IMG_2323.zip` (13:2x GMT): a zip of the original HEIC, which kept
everything. The HEIC is committed unchanged (the zip's `__MACOSX/._IMG_2323.HEIC` resource fork is not).

EXIF of the original (read with Pillow from the HEIC's Exif item, 2026-11-23):

- Apple iPhone 17 Pro, iOS 26.7.3; lens "iPhone 17 Pro back triple camera 6.765mm f/1.78", 24 mm equivalent; 5712 x 4284;
  Orientation 3 (the phone was held upside down; the JPEG is already upright).
- DateTimeOriginal 2026-11-23 09:10:57.369, offset Z (UTC; GMT in November). GPS time 09:10:56.86.
- ISO 100, 1/32258 s, f/1.78, exposure bias 0, programme auto, metering pattern, no flash.
- GPS 51 deg 29' 40.87" N, 0 deg 01' 54.27" W (51.494686, -0.031742), horizontal error 3.07 m; altitude 2.66 m above sea
  level; speed 0.07 km/h; image direction 134.15 deg magnetic.

A screenshot of the iOS Photos "Info" panel (13:13 GMT; evidence only, not committed: Apple map tiles) shows the same
time to the minute and a map pin at Greenland Pier.

Place: the owner, 2026-11-23: "it was Greenland Surrey Quays clipper pier" (the Thames Clippers / Uber Boat pier
"Greenland (Surrey Quays)", OSM and `area.js` place "Greenland Pier"). The camera solve found the same pier from the photo
alone, before the owner named it.

People and vehicles: none visible. No number plate. Optical artefacts: a green lens flare spot at (350, 1290) and an orange
blur in the lower-left corner (a finger or the case at the lens edge); do not read them as objects.

## Camera

Solved with `tools/view-mcp` (skill `photo-view-reconstruction`). Focal length fixed at 1785 px (24 mm equivalent, now
confirmed by the Photos panel: 24 / 43.27 x the 3220 px diagonal). Eye height fixed at 3.9 m OD (the floating pontoon: the
Environment Agency gauge at Silvertown read 1.31 m OD at 09:00 GMT, rising about 0.3 m per 15 minutes; deck about 1 m above
the water, eye 1.5 m above the deck). Free: x, z, heading, pitch, roll.

- Eye (-829.1, 3.9, 1159.1) model metres: -0.03189, 51.49469, on the Greenland (Surrey Quays) Pier pontoon, 1 m from the
  mapped pier point. Sigma x 2.4 m, z 0.9 m.
- Heading 119.48 deg grid (121.0 true; sigma 0.11), pitch 3.35 deg (0.05), roll -3.82 deg (0.18: the horizon falls to the
  left; the verticals of Riverview Court lean the same way), horizontal field 71.6 deg.
- rms 4.2 px over 19 observations (17 pixels, two of them with both coordinates): the sun's centre (1988, 660), set 20 km
  out along the computed direction (azimuth 143.25 true, altitude 10.56 deg at 09:10:57.4 GMT, the EXIF time;
  astronomy-engine with refraction); the top of Orion Point at its near rim; 11 pixels on the Thames waterline (outline
  `water:tidal`); the horizontal centres of Riverview Court, Neptune Court, Collier Point and Knights Tower.
- Hold-outs (fitted without them): Neptune Court 0.9 px, Collier Point 2.6 px (1.8 km), Knights Tower 9.2 px (1.2 km).
- Against the EXIF GPS: the fix is 10 m east of the solved eye (further out on the pontoon), 3.3 times its stated 3.07 m
  error. With the eye held at the fix the rms rises to 6.5 px and the near buildings miss by 9 to 18 px (Orion Point 18,
  Neptune Court 12, Riverview Court 9); the far ones stay within 3 px. The page uses the solved eye. GPS altitude 2.66 m
  against the eye's 3.9 m OD (fixed from the tide).
- Against the EXIF compass: 134.15 deg magnetic is about 135.3 true (declination about +1.2 deg, an estimate, not computed
  here), 14 deg right of the solved 121.0 true. The phone's compass on a steel pontoon is not used.
- Variants: 09:10:00 and 09:10:59 moved the eye 1 m and the heading 0.07 deg; eye height 2.9 or 4.9 m moved the eye less
  than 1 m.
- The time matters. The first solve used 09:13:30 (the owner's "approx 3 mins ago" before the upload at 09:16:37): the eye
  went 6 m off the pier point, the sun missed by 10.7 px in azimuth, and the far towers failed as hold-outs by 18 and 23 px.
  The sun moves 0.22 deg in azimuth a minute here, so 3 minutes of clock error is 0.66 deg of heading, and the fit moved
  the eye to absorb it. With the camera's own time (09:10 from the Photos panel, then 09:10:57 from EXIF) the far towers pass.
- The sun residual is now 7 px, nearly all vertical: the photo's sun is 0.25 deg higher than computed (the centre of an
  overexposed disc with glare, or refraction above the standard value at 4 deg C).
- An earlier fit with the eye free and Riverview Court left out put the eye 30 m north-east, off the pontoon, at rms 1.6 px,
  and missed Riverview Court by 131 px: rejected.
- Orion Point's top in the photo is 11 px (about 3 m) above the model's top (51.9 m OD, EA LiDAR): the scaffold or the
  roof disc rises above the LiDAR fit.
- On the page: https://danbri.github.io/londat/docklands/?view=greenlandpier&t=2026-11-23T09:11

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

Photo against the port's render of `?view=greenlandpier&t=2026-11-23T09:13` (the first camera; re-run at 09:10 with the refitted camera, every ratio changed
by 0.01 or less) (WebGL in SwiftShader, Open-Meteo blocked so no
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

Renderer tuned to this photo on 2026-11-23 (`docklands/sky3.js`; the owner: "I thought point of this was you gently
nudging the moglob visuals towards reality by looking at photos"). Three changes, each only when the sun is low or in view,
so the Greenland Dock calibration (sun 31 deg, behind the camera) is not changed:

1. More haze when the sun is under 25 deg: turbidity 2 + 2.6 x lowSun (lowSun = 1 - smoothstep(4, 25 deg) of the sun's
   altitude; 0.77 here, turbidity 4.0).
2. The low sky near a low sun: a smooth roll-off of the sky's luminance (cap 1.5 / lowSun^2, 2.5 here) so the tone mapping
   does not turn it white, and a warm tint (1.0, 0.82, 0.60) x 2 lowSun x closeness to the sun x low in the sky. The sun's
   disc is kept as bright as before. A first version with a hard limit dimmed the disc and drew a ring round the sun;
   replaced the same day.
3. A lower exposure when the view faces a sun under about 30 deg (1 - 0.62 x facing x sun up; 0.46 here), as an eye or a
   camera adapts. 1 when the sun is behind the view, high or down.

Values found live on one loaded page (turbidity 2 to 6, exposure 0.45 to 1, cap 1 to 4, warm 1 to 3). Result, luma
difference from the photo, before (2026-11-23 render at 09:10) and after:

| region | before | after |
|---|---|---|
| sky_top_left | +0.207 | +0.081 |
| sky_mid_left | +0.256 | +0.114 |
| sky_near_sun | +0.189 | +0.082 |
| sky_low_sun_side | +0.158 (white, 251 250 246) | -0.021 (warm, 215 204 175) |
| shore_shade | +0.103 | +0.020 |
| water_glitter | +0.225 (white) | -0.001 (warm, 187 182 166) |
| water_mid_left | +0.272 | +0.137 |
| water_near | +0.164 | +0.043 |

Picture: [`compare-2026-11-23-photo-before-after.jpg`](compare-2026-11-23-photo-before-after.jpg) (photo, before, after).

Still open:

1. The sky and the water are too blue: photo sky at 12 deg 76 100 124, render 93 132 160; photo mid water 64 68 74
   (neutral), render 78 108 120. The water's colour is almost all reflection: a silt tint on tidal water (tried live, up to
   full strength) changed no region by more than 0.01 and was not kept.
2. The water surface: short choppy waves on a rising tide in the photo; long mirror reflections of the shore in the render.
3. The render shows a post with a white globe about 2 m from the eye and a grey column at the left that the photo does not
   show at those places.
4. Not tested: sunrise and sunset (sun under 4 deg, where the cap is 1.5 and the tint strongest) and the globe places (they
   share makeSkyMesh with warm 0, so no change there). The Greenland Dock tone test times out in this container (see the
   activity log), before and after the change.

The page's sun is at (1992, 659) in the 2576 x 1932 render, 4 px from the photo's: the page's clock, sun model and the
view agree with the solve. The render also shows a post with a white globe about 2 m from the eye that the photo does not
show at that place (the photo's near post is at its right edge, x 2280 to 2576): within the eye's 3 m error.
