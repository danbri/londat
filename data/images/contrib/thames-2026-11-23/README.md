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

### Second pass with the originals (2026-11-23, 22:30 to 23:40 GMT)

Photos decoded from the HEICs (Display P3 to sRGB, 2016 px on the long side). Cameras with the eye at the GPS fix (height
from the tide: 4.2 m OD on the boat; 5.5 m OD on the dock quay) and the focal length from the EXIF 35 mm equivalent
(f = f35 / 43.27 x the image diagonal in pixels); only heading, pitch and roll fitted:

| IMG | focal (px on 2016) | heading (grid) | pitch | roll | evidence | rms |
|---|---|---|---|---|---|---|
| 2337 | 9784 (168 mm) | 103.69 | 2.87 | 0 (fixed) | the Tower Bridge south tower peak (model 39872, 68 m OD) | exact (1 point) |
| 2340 | 14210 (244 mm) | 76.73 | 1.58 | 0.95 | the four White Tower turret tops | 11.0 px |
| 2347 | 1398 (24 mm) | 27.35 | 3.37 | 0.56 | 22 Bishopsgate, 20 Fenchurch Street, the Scalpel, 4 waterline pixels | 13.4 px |
| 2354 | 6639 (114 mm) | about 29 | about 3.0 | 0 | the pier's west corner and waterline, by hand | not fitted |
| 2587 | 2097 (36 mm) | 97.09 | 7.07 | -0.18 | the moon at the EXIF time, 4 dock waterline pixels | 7.3 px |

In 2587 the top of Baltic Quay, held out, misses by 100 px: the photo puts it about 47 m OD at 332 m, the model has 32.6 m
(fault F56 in the curation skill).

Render inputs: in this container the page's weather sources failed and it used its stated default wind (4 m/s from 240)
silently: Open-Meteo answered "Daily API request limit exceeded" (the day's many test loads from one address), and the
live-cache METAR request was aborted by its 8 s limit while the software-rendered page loaded (curl fetches it in 0.45 s);
`metar-history.json` ends on 2026-11-22. The renders therefore set the airport reports by hand: `?wind=1.5,60` (EGLC
230920Z 06003KT) and `?wind=3.1,110` (231750Z 11006KT). Cloud: none (METAR "NCD"); the photos show thin cirrus.

HDR measurements (Apple's published headroom rule from maker-note tags 33 and 48: 5.1x for 2347, 4.8x for 2587; HDR
linear = SDR linear x (1 + (headroom - 1) x gain map); ratios to the median of the sky, found with the HEIC's sky mask):

| photo | region | median | brightest 1% |
|---|---|---|---|
| 2347 | sun glint on the glass front | 7.7 | 9.7 |
| 2347 | glitter path on the river | 0.8 | 9.6 |
| 2347 | water beside the path | 0.39 | 1.8 |
| 2347 | sunlit front of Old Billingsgate | 1.95 | 4.9 |
| 2587 | moon | 150 | over 800 (clipped) |
| 2587 | moon glitter on the dock | 1.3 | 78 |
| 2587 | lamp and window streaks (far right) | 12 | 250 |
| 2587 | dark water | 0.47 | 3.3 |

What the renders at the right cameras show (`compare-IMG_NNNN-photo-moglob.jpg`, photo left):
(`compare-IMG_2354-photo-moglob.jpg`: photo, then moglob with the old orange walls, then with the new stone walls; `compare-IMG_2587-photo-moglob.jpg`: photo, then moglob with the new night sky.)

- 2337 Tower Bridge: the tower is in the right place; it has the office facade, and no high walkways or chains;
  HMS Belfast's sides that face the camera are in shade in the photo (the sun 45 deg to the right) and light grey in the
  render.
- 2340 Tower of London: the turrets are in the right place; office facades on the White Tower and its neighbours; a
  simulated river bus at Tower Millennium Pier (the pier layer draws one while the TfL timetable has a call; the photo
  shows none) fills the foreground.
- 2347 City: no glint on any glass front and so no second glitter path; grey, not sunlit, fronts; the building reflections
  bent too much by the chop.
- 2354 London Bridge: the river wall was a large salmon-orange slab (the flood wall layer's highlight colour) and coloured
  the water orange; the bridge piers are missing.
- 2587 Greenland Dock: the night sky was black (sRGB 1 2 3) against the photo's deep blue (3 9 21 high, 19 28 46 at the
  horizon); no moon glitter; constellation lines over the sky.

Changes made the same evening:

1. Flood walls (`docklands/layers/walls.js`): stone (sRGB 0.70 0.67 0.60) with a dark band (0.30 0.31 0.24) below 3.2 m OD,
   in place of the highlight orange; the legend says so. The layer, its switch and its data are unchanged.
2. Night sky (`docklands/sky3.js`, `makeNightDome`): a dome with a zenith and a horizon colour while the day sky is hidden,
   brightened by the moon (altitude x lit fraction) and by twilight (sun -18 to -6 deg), dimmed by cloud. Tuned live on
   2587 in three rounds; chosen: sRGB 2 8 22 at 20 to 28 deg up (photo 3 9 21), 5 18 37 at 10 to 15 deg (7 16 31), 12 29 50
   at the horizon (19 28 46).

### Third pass, 2026-11-24: the owner's list of fixes

The owner, 2026-11-23: "Follow your proposal", "Walkie talkie building has a complex shaped v reflective tiled building in
front of it", "London bridge looks approx sandstone (but look it up) and notably has "London Bridge" carved into it
underneath". Changes (`docklands/`), each checked by a render at the photo's camera:

1. Weather fallback: the live-cache METAR fetch has 30 s (was 8 s) and is retried after a failure (was kept 5 minutes);
   the wind note says DEFAULT and names the METAR and Open-Meteo errors.
2. Facades by type: `cwplans/tools/build-material-overrides.mjs` -> `cwplans/docklands/data/materials-overrides.json`
   (130 buildings): OSM building=castle and its parts (the Tower of London) masonry in Kentish ragstone; the Tower Bridge
   towers masonry in Portland stone; Custom House, Fishmongers' Hall, Adelaide House Portland stone; Old Billingsgate yellow
   brick; the Northern and Shell Building (10 Lower Thames Street, the stepped front in front of 20 Fenchurch Street)
   curtain glass, blue-silver and smooth (roughness 0.18, so the sun's highlight shows on it). A new facade style, masonry
   (stone, few small windows). Before: castle was in the rules' civic list, which gave the White Tower large windows in
   brick or concrete.
3. Light: the sky fill is 40 % when the sun shines through (all of it under overcast): the shaded face of the Tower Bridge
   tower in IMG_2337 is now 0.05 x the sky (photo 0.04; before 0.18). High cloud (cirrus) is drawn at 35 % of its fraction:
   Open-Meteo's 74 % mostly high cloud had drawn a grey sky where the photos show blue.
4. Moon glitter: a facet lobe on the water (slope spread about 11 deg) broken into separate glints; gain 2. It now shows at
   the far quay on the moon's side; it is still about five times wider than the photo's patch.
5. Constellation lines are off by default (`?skylines=1` or the menu box).
6. Simulated river buses at piers are not drawn when an AIS snapshot within 20 minutes of the clock is loaded. For a past
   time with no AIS (these photos) the simulation stays: IMG_2340 still shows one at Tower Millennium Pier.
7. London Bridge piers (`docklands/layers/bridges.js`): the two river piers from the holes in the OSM Thames polygon (102 m
   apart; the centre span is 103.6 m), Cornish granite facing drawn light grey (research: https://www.gracesguide.co.uk/London_Bridge;
   not sandstone; the warm colour in IMG_2354 is the low sun), a dark tide band below 3.5 m OD, a granite obelisk at each end
   to 13.6 m OD, the pier top at 7.8 m OD (both from IMG_2354, camera fitted to the obelisk top and the pier's waterline, rms
   10 px), and "LONDON BRIDGE" carved on the south face of the north pier, letters about 0.5 m high, 4 m above the water (from
   the photo; no written source found).

Still open: HMS Belfast's shaded side is light grey (the ship model's material or orientation, not the fill); the near water
lacks the photo's long light streaks and the near moon glitter (the model's ripples are too gentle); the bridge deck is a
dark slab; Tower Bridge has no spires, walkways or chains; a large model building behind Tower Bridge where IMG_2337 shows
sky; the City render's framing differs from IMG_2347 by about 10 to 20 px.

### Fourth pass, 2026-11-24: the open items

The owner, 2026-11-24: "Follow your proposal / Continue". Changes (`docklands/`):

1. The block behind Tower Bridge in IMG_2337: the two OSM parts between the towers (w367652753, w367653917; model
   indexes 38724, 38733) are extruded from 3.1 to 48.1 m OD. `layers/bridges.js` hides them and draws each outline from
   42.5 to 48.1 m OD as the high-level walkways, in the bridge's light blue-grey. The hide did not work at first: two
   other layers removed it (`layers/skyline.js` deleted the skip option at start; `layers/model.js` replaced it after a
   wait). Both are fixed; the rule is in the `docklands-3d-page` skill.
2. London Bridge deck: from bank to bank on the line of the two piers, 32 m wide, road at 14.0 m OD, a granite parapet
   1.1 m high, the underside haunched (7.8 m OD at the piers, 12.4 m mid centre span). The underside is drawn light
   (0.80) because the page has no light from below; in IMG_2354 the water lights it.
3. Water streaks: a control for the spacing of the mirror streaks (`SU.streak`). On IMG_2587, 0.0065 (the old value)
   against 0.02: 0.02 draws zig-zag bands in the reflections, so 0.0065 stays.

Still open: HMS Belfast's shaded side (in the model the camera of IMG_2337 is about 7 deg off the ship's axis on the
sunlit side; the photo shows the other side, so the ship's position or heading is off by about 10 deg or more); the near
water of IMG_2587 is flat black where the photo has glitter and long light streaks; Tower Bridge has no spires or chains.

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

## Gaps found, for the next steps (status after the second pass)

1. Building material by type: historic stone buildings (castle, church, Victorian market) take the office facade.
2. Sunlit fronts: low winter sun should warm and brighten the faces it lights (Tower, Billingsgate, London Bridge).
3. Specular glass: sun glints on glass fronts and the glitter path they throw.
4. Moon glitter on water at night. The night sky colour itself: done, 2026-11-23.
5. River walls: done (stone with a tide band), 2026-11-23. Timber jetties: open.
6. Bridge piers missing (London Bridge).
7. Cameras: 03 and 04 need better solves before their numbers are used.
8. Inputs of the day renders: the page used its stated default wind (4 m/s from 238 deg) and no weather for 01 to 03
   (tide 1.67 to 1.75 m OD rising, current 0.74 m/s flood, chop 0.06), against the airport's 1.5 m/s from the north-east
   used at Greenland Pier the same morning. Either the weather and the airport report did not load within 25 s or they are
   not applied at the City end of the model; not yet checked. 04: tide -1.99 m OD falling, wind 2.7 m/s from 127 deg, no
   cloud.
