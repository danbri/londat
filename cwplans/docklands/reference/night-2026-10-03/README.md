# Night reference photos, 3 October 2026

Six photos of Canary Wharf at night, taken by the owner (danbri) on the evening of Saturday 3 October 2026 and given
to the project as the reference for the 3D page's Night mode (owner, 2026-10-04: "Keep my photos").
Copyright: the owner's. Kept here with the owner's permission as project reference material; not under an open licence.

Where and when (the owner's account): "as Thames Clipper landed at Greenland Dock pier & shortly afterwards, a few
metres west on promenade". The files have no EXIF: no capture time, GPS or lens data survived the upload. They were
uploaded at 00:43 BST on 4 October, so all were taken before that. The time and the bearing of each photo are to be
solved from the moon's position in the frame and the landmarks (method and results in docklands/README.md "Night").

| file | what it shows (judged from the frame) |
|---|---|
| `promenade-skyline-railing.jpg` | the skyline across the river from the riverside path, railing in front, moon low on the right |
| `promenade-skyline-bollard.jpg` | the same skyline from the river edge, mooring bollard in front, moon on the right |
| `promenade-zoom-moon-blur.jpg` | zoom on residential towers with the moon between them (out of focus) |
| `zoom-moon-towers.jpg` | zoom on the same towers and the moon, a lit "Hilton" sign low on the left |
| `river-warehouses-skyline.jpg` | the river with old warehouse buildings in front and the towers behind |
| `clipper-canary-wharf-pier.jpg` | from on board a Thames Clipper at Canary Wharf pier (the pier sign reads "CANARY WHARF") |

Measured tones and the calibration of the renders against these photos: docklands/README.md, "Night".

## The photo time, solved from the moon (2026-10-04)

Result: **3 October 2026, 23:56 BST (22:56 UTC), about ±4 minutes**, for `promenade-skyline-railing.jpg`; the bollard photo
fits the same few minutes. The 3D page shows it with `?t=photo` or Menu > Sky > "Photo time (3 Oct)":
https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/?t=photo

Method (scripts were run from the session scratchpad; the numbers are below so the result can be checked):
1. The moon's centre in the full-size frame (2576 x 1932): a least-squares circle through four points on the lit limb and the
   two cusps, read from an 8x enlargement. Railing photo: centre (2065.4, 481.9), radius 17.3 px (bloom included; the true
   disc is about 16 px), largest residual 1.4 px. The line through the cusps points 137° clockwise from image up, so the
   bright limb is at 227°. Bollard photo: centre (2250, 708.5), less sure (±4 px): a building edge cuts the disc.
2. A pinhole camera (heading, tilt, roll, focal length) fitted by least squares to four tower tops of the model
   (`docklands/data/towers.json`: Newfoundland cwb-0451, Landmark Pinnacle cwb-0577, One Canada Square cwb-0413 horizontally
   only, One Park Drive cwb-0590), with the eye on the river wall at 6.9 m OD. Photo points: Newfoundland's crown rim
   (230.5, 217.5), the middle of Landmark Pinnacle's roof corner lights (438, 89), One Canada Square's pyramid apex
   (973.5, 386), the middle of One Park Drive's roof lights (1957.5, 437.5). Eyes tried: (-896, 1150), (-930, 1140),
   (-860, 1150), (-830, 1158) in model metres (Greenland Pier is at -830, 1158; the Rotherhithe view's eye is -896, 1150).
3. The moon pixel through the fitted camera gives an altitude and a grid bearing; true azimuth = grid bearing + 1.54° (true
   north from the page's WGS84 fit). astronomy-engine 2.1.19 (topocentric, refraction "normal") then gives the time at which
   the moon had that altitude and that azimuth.

| photo, eye (x, z) | fit rms | moon altitude, true azimuth | time from altitude | time from azimuth | best (UTC) |
|---|---|---|---|---|---|
| railing, -896, 1150 | 10.2 px | 7.01°, 57.91° | 22:54:05 | 22:56:20 | 22:55:35 |
| railing, -930, 1140 | 6.1 px | 6.89°, 58.86° | 22:53:05 | 23:01:40 | 22:58:50 |
| railing, -860, 1150 | 18.1 px | 7.17°, 57.20° | 22:55:20 | 22:52:20 | 22:53:20 |
| bollard, -830, 1158 (5.5 m OD) | 6.7 px | 5.46°, 58.10° | 22:41:10 | 22:57:20 | 22:52:10 |

The azimuth is the better measure (the horizontal fit is good: Newfoundland, Landmark Pinnacle and One Park Drive agree within
5 to 10 px); the altitude depends on the roll and tilt, which the vertical inconsistency of One Canada Square disturbs (its
model apex is about 50 px, 0.9°, above the photo's in both photos). The railing times from altitude and from azimuth agree
within 2 to 9 minutes; the bollard altitude is low because the moon is cut by a building. Taken together: 22:56 UTC, with the
spread of the azimuth times (22:52 to 23:02) as the error, about ±4 min (0.7° of moon movement).

Checks: the bright limb measured at 227° from image up matches the computed 227.2° (from the zenith side) at 23:56; the lit
fraction then is 46% (last quarter was about 9 hours earlier, so the terminator is slightly concave, as in the photo);
moonrise was 22:47 BST at azimuth 45°, so the moon was 7° up and 58° east of north. The time agrees with the owner's account (the upload at 00:43 BST, after the Clipper landed at Greenland Pier).
Weather then (Open-Meteo): 15% low cloud, visibility 14 km, humidity 87%; the bollard photo shows small low clouds near the
moon. Thames at Greenland Pier: −1.20 m OD and falling (EA Tower Pier and Charlton readings, interpolated).

One Canada Square's apex, investigated (2026-10-04): not the tower (the pink band under the pyramid is also 40 to 46 px
high; a 0.87 degree error would need the apex 22 m lower), not curvature (0.17 m over 1.46 km), not the eye (best free
eye rms 13 px), not a radial lens distortion (k1 +0.39, rms 14 px). The railing posts give a roll of about 1.5 degrees,
which rules out the one fit (roll -4.8 degrees, without One Park Drive) that fits the other points within 3.3 px. The
photo is not a single pinhole image of the model at the 0.5 degree level; the numbers are in docklands/README.md, "Sky,
time, weather and tide", second pass. The photo time above rests on azimuths, which this does not change.
