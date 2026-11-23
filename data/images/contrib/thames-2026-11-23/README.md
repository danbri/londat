# Contributed photos: the Thames by river bus and Greenland Dock at night, 2026-11-23

Four photographs taken by danbri (the project owner) on 23 November 2026 on an iPhone 17 Pro (the same day and phone as
`../greenlandpier/`), given to the project under **CC0 1.0** (https://creativecommons.org/publicdomain/zero/1.0/). The
owner, 2026-11-23 18:08 GMT: "Four pairs of my cc0 photos from today. Group by filename. Analyze as before wrt lighting and
reflection - sun on City towers, moon in dock etc."

## Files

The owner sent each photo twice (`IMG_NNNN.jpeg` and `IMG_NNNN_2.jpeg`). Each pair is byte-identical: the chat upload gave
the same file for both, with no EXIF time, GPS, camera or lens (orientation, resolution and pixel size only) and a
**Display P3** profile (fault F51). One copy of each is kept. A zip of the originals keeps the EXIF
(`../greenlandpier/README.md`).

| # | file | IMG | SHA-256 (both copies) |
|---|---|---|---|
| 01 | `2026-11-23-th-01-IMG_2340-tower-of-london-from-river.jpg` (2016 x 1512) | 2340 | ef52708e798632ac3d31db77d5543b5786a1a0df558d758ffb36b1fb5b4d3ff3 |
| 02 | `2026-11-23-th-02-IMG_2347-city-sun-glint-from-river.jpg` (2016 x 1512) | 2347 | 26eef26c7965abd36602cbcf8825774a84a7b3a5a8a6a8702ff67f4cd08b74ca |
| 03 | `2026-11-23-th-03-IMG_2354-london-bridge-north-pier.jpg` (1932 x 2576) | 2354 | b1e371f11b5cf9d2b8955d9e65d70c1c07a617b03e0267eb0c90d61b1a1e272c |
| 04 | `2026-11-23-th-04-IMG_2587-greenland-dock-moon.jpg` (2016 x 1512) | 2587 | 90143aa0ce6e9ffeb68aadd17fc0097b72b960888e85d462baf5d42bd5c483e0 |

`compare-IMG_NNNN-photo-moglob.jpg`: the photo (left) and moglob at the solved camera and time (right), 2026-11-23, page
`docklands/` with the recorded weather, tide and wind (headless Chromium, SwiftShader).

People and vehicles: small figures on Tower Millennium Pier (01) and on the London Bridge walkway and parapet (03), none
recognisable at this size; parked cars far away in 04, no readable plate.

## The originals (zip, 2026-11-23 about 19:00 GMT) and their EXIF

The owner then sent `Incoming.zip`: the five HEIC originals (each also as a byte-identical copy without the extension),
including IMG_2337, not sent before. Committed unchanged as `2026-11-23-th-IMG_NNNN-original.heic`. Owner, same message:
"In future when given Apple-damaged uploads ask whether you can get them zipped before spending ages doing pointless
analysis." (now in CLAUDE.md and the `photo-view-reconstruction` skill).

| IMG | time (UTC) | lens, 35 mm equivalent | GPS (error) | model x, z | compass (magnetic) | speed | SHA-256 of the HEIC |
|---|---|---|---|---|---|---|---|
| 2337 | 09:37:24.061 | 16.891 mm f/2.8, 168 mm | 51.506947, -0.084381 (3.5 m) | -4509, -107 | 96.0 | 0.28 m/s | 63c819942bc2c6b4d6b79594a68e4ec877b7def07ca0e080d603e5ae1e87c79b |
| 2340 | 09:38:08.485 | 16.891 mm f/2.8, 244 mm | 51.507031, -0.084425 (3.1 m) | -4512, -117 | 68.9 | 0 | fe77643dd36222dca78a6031e8960f91be5d153f2262d45e89fcaa6c006418b0 |
| 2347 | 09:39:04.918 | 6.765 mm f/1.78, 24 mm | 51.507428, -0.085908 (3.3 m) | -4616, -158 | 295.9 | 6.2 m/s | 3cae27396fe3fb68d421aad458ff3bad9b97ffc8abc941b99fea3f6ae37fc3d8 |
| 2354 | 09:39:32.717 | 16.891 mm f/2.8, 114 mm | 51.507903, -0.088397 (3.9 m) | -4790, -207 | 279.6 | 6.1 m/s | 40216c4d8007964470172955811dff81b6b7a4324da10feaecbcf02bc2eff29a |
| 2587 | 17:41:52.400 | 6.765 mm f/1.78, 36 mm | 51.494897, -0.041953 (4.7 m) | -1529, 1155 | 106.1 | 0 | da4263244d31c96b153121d500e80a8e7b1fae260db1a3d7081b6e9eccb44a01 |

All iPhone 17 Pro, iOS 26.7.3. IMG_2337 and 2340: the boat stopped (speed 0) at London Bridge City Pier, by HMS Belfast;
IMG_2337 shows HMS Belfast and Tower Bridge against the light. 2347 and 2354: the boat under way westward at about 6 m/s
(170 m in 28 s), 2354 about 50 m west of London Bridge. Each HEIC holds, besides the image, Apple auxiliary images: an HDR
gain map (`urn:com:apple:photo:2020:aux:hdrgainmap`), a sky mask (`...:aux:semanticskymatte`), a linear thumbnail and a
style delta map (`tag:apple.com,2023:photo:aux:...`); no depth or disparity map.

My estimates made before the zip, against the EXIF (the sections below are those estimates, kept as the record):

- Times of 01 to 03, "about 09:30 to 09:50": right (09:38 to 09:40).
- 04 from the moon, "17:52 +-4 min": wrong by 10 minutes (17:41:52); the eye was 102 m from the GPS fix, which the render
  showed.
- 01 (Tower) eye 178 m east of the GPS fix, focal 10,400 px against 14,200 px for the 244 mm lens: distance and focal
  length traded, as the skill warns for features in one depth band.
- 02 (City) eye 28 m from the GPS fix: right within the error.
- 03 (London Bridge), "south-east of the pier, looking north-west": wrong side; the boat was west of the bridge.
- The phone's compass on the moving boat (295.9 and 279.6 magnetic for views that face north and east) is not usable; at
  the dock (106.1) it agreed with the moon solve (106.3 grid).

## Times

No EXIF. Photos 01 to 03 come after IMG_2323 (09:10:57 GMT, `../greenlandpier/`) and were taken from a westbound river bus
(below): about 09:30 to 09:50 GMT, sun 12 to 14 deg up at azimuth 147 to 152 true. Photo 04: from the moon (below), 17:52
GMT +-4 min; the owner sent the photos at 18:08.

## 01 IMG_2340: the Tower of London over Tower Millennium Pier

- Camera (solved, `tools/view-mcp` solveCamera, focal free): on the river at -0.08192, 51.50736 (model -4339, -158), 5 m OD
  (a boat deck, assumed), heading 76.7 deg grid (ENE), pitch 2.3, roll 0.7, focal 10,400 px on 2016 (about 7x zoom). rms 10
  px over the four turret tops of the White Tower and two pixels on the north bank waterline; of 24 assignments of the
  turrets, the best is, left to right, north-west, north-east (the round one), south-west, south-east. Checked: the weather
  vanes show their N and S letters across the view, N on the left, so the view faced roughly east.
- Light: low sun from the right (south-south-east, about 13 deg up): the south and west faces of the stone buildings warm
  and lit, the trees golden (autumn), long shadows on the curtain wall.
- moglob: the turret positions agree with the photo to about 40 px. Faults: the White Tower and the other medieval stone
  buildings have the generic office facade (rows of dark windows on a pale wall), no stone colour, no onion domes or
  battlements; a wide grey and brown band fills the lower half where the photo shows the pier and the water (not yet
  identified: the pier pontoon at this zoom, or the foreshore); the light is flat and cool.

## 02 IMG_2347: the City from the river, the sun in a glass front

- Camera (solved): on the river east of London Bridge at -0.08626, 51.50755 (model -4641, -172), heading 30 deg grid,
  pitch 3.1, roll 0.6, focal 1398 px (main lens assumed); rms 9.8 px over the tops of 22 Bishopsgate (model 39183, 294 m
  OD), 20 Fenchurch Street (40051, 177 m) and the Scalpel (39114, 201 m) and four pixels on the north bank waterline.
- Light: the sun is behind the camera (south-south-east). The bright spot at (1130, 625) is the sun mirrored in a glass
  front facing about south; it throws its own glitter path across the river to the camera, and a lens flare streak above
  it. South-facing fronts (Old Billingsgate, Custom House, the white stepped block) are warm and lit.
- The glint as a clock: with the facade normal of the model building the ray meets (185.5 deg grid), the mirrored
  direction is azimuth 157.6 true, which fits about 10:10; its altitude (8.5 deg) fits no time after 09:11, and the model
  building is in front of the glinting one by about 20 px. Not used for the time.
- Not in the model: the tower crane on the building right of the Scalpel.
- moglob: no glint on any glass front and so no second glitter path; fronts grey, not sunlit; long clean mirror
  reflections of the buildings where the photo shows broken ones; an orange-brown band along the river walls where the
  photo shows dark timber piles and stone.

## 03 IMG_2354: London Bridge, the north pier, "LONDON BRIDGE"

- Camera: not solved (no named roof against the sky). From the river, south-east of the north pier (model about -4742,
  -277, 50 m off the north bank), looking north-west, about 2x zoom. The render used an estimated camera and is for
  comparison by eye only.
- Light: low sun from the left (south-east): the east face of the pier lit, the shadow of the deck across the pier and the
  walkway, a green and wet band at the tide line, warm light reflected from the lit stone onto the water.
- moglob: the bridge piers are not in the model (the deck is a dark slab); the river wall is orange-brown.

## 04 IMG_2587: Greenland Dock at night under a nearly full moon

- Moon: 98.7% lit, azimuth 87.1 true, altitude 25.9 deg at 17:52 GMT (astronomy-engine); the sun 16 deg below the horizon.
- Time and camera: a search over 16:00 to 18:08 GMT fitting the camera (eye x, z, heading, pitch, roll; main lens) to the
  moon (523, 93), the top of Baltic Quay (1894, 729) and four pixels on the far waterline of the dock: best at 17:52 (rms
  2.7 px; 17:48 and 17:56 at 3.9 and 3.8 px). The view faces east along the dock (heading 106 grid) with Baltic Quay and the
  Surrey Docks Watersports Centre on the right. The eye position (-0.04072, 51.4954) is not right: the render from it shows
  a large building in the left half where the photo shows open water. The moon itself is drawn where the photo shows it.
- Light and reflection: moon glitter on the water below the moon (a broken patch at about x 400 to 640); long vertical
  streaks from lit windows and street lamps, warm (sodium-like) on the far quay and blue-white from the watersports centre;
  the sky deep blue, lighter at the horizon.
- moglob: no moon glitter; few streaks on the near water; constellation lines drawn over the sky (a layer that is on).

## Gaps found, for the next steps

1. Building material by type: historic stone buildings (castle, church, Victorian market) take the office facade.
2. Sunlit fronts: low winter sun should warm and brighten the faces it lights (Tower, Billingsgate, London Bridge).
3. Specular glass: sun glints on glass fronts and the glitter path they throw.
4. Moon glitter on water at night.
5. River walls and timber jetties: an orange-brown band in the model.
6. Bridge piers missing (London Bridge).
7. Cameras: 03 and 04 need better solves before their numbers are used.
8. Inputs of the day renders: the page used its stated default wind (4 m/s from 238 deg) and no weather for 01 to 03
   (tide 1.67 to 1.75 m OD rising, current 0.74 m/s flood, chop 0.06), against the airport's 1.5 m/s from the north-east
   used at Greenland Pier the same morning. Either the weather and the airport report did not load within 25 s or they are
   not applied at the City end of the model; not yet checked. 04: tide -1.99 m OD falling, wind 2.7 m/s from 127 deg, no
   cloud.
