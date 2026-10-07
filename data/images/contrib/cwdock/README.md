# Contributed photos: round the Canada Water dock, 2026-10-07

Twenty photographs taken by danbri (the project owner) at about 09:00 BST on 7 October 2026 round the Canada Water dock
(the lake by Canada Water Library), SE16, and given to the project under **CC0 1.0**
(https://creativecommons.org/publicdomain/zero/1.0/). The owner: "taken NOW near the Dock by the Library ... Weather at
9am is overcast, light drizzle." Photo 19 is the owner's white calibration photo (stickers on the library door).

The files are the JPEGs as delivered, renamed only. They carry no EXIF time, GPS or camera model; each has an embedded
**Display P3** ICC profile (the EXIF ColorSpace tag says sRGB, but the pixel values are Display P3). Convert to sRGB with
the embedded profile before any colour is measured (fault F51 in the curation skill).

Light: overcast with light drizzle (Open-Meteo in the londat cache, 08:30 UTC: cloud 100 %, 0.1 mm, WMO code 51,
14.9 C). The light is diffuse, so the facade colours are close to the materials, unlike the evening set
[`cwlibrary`](../cwlibrary/).

Where: the owner's phone map screenshot of 09:08:43 BST puts the owner at **-0.04740, 51.49760** (about ±10 m), on the
plaza at the south corner of Decathlon, 22 m east of the north-east corner of the dock. The screenshot is **not stored**
(it shows the map provider's imagery and the owner's profile picture); only this position, which we derived from it,
is recorded. Most photos were taken within about 60 m of that point; photo 01 (telephoto) was taken about 250 m south.

| # | file | shows | identified (confidence) |
|---|---|---|---|
| 01 | `2026-10-07-cw-01-canary-wharf-skyline.jpg` | the Isle of Dogs skyline over a hoarding (3x telephoto) | Newfoundland (certain), Citigroup Centre 25 Canada Square (certain), Landmark Pinnacle, One Canada Square, One Bank Street, 25 Bank Street, Wardian, One Park Drive, Hampton Tower (probable); a dark tower on Marsh Wall at Consort Place, OSM way 988728458 (guess) |
| 02 | `2026-10-07-cw-02-brick-tower-and-dock-x.jpg` | a 17-storey brick tower and its 8-storey wing | OSM ways 729958295 and 729958294 (probable); Dock X (probable) |
| 03 | `2026-10-07-cw-03-decathlon-and-the-founding.jpg` | west between Decathlon and Dock X | Decathlon (certain), The Founding, Three Deal Porters, Dock Shed |
| 04 | `2026-10-07-cw-04-decathlon-south.jpg` | Decathlon from the south | Decathlon (certain), 11 Maritime Street, the 17-storey tower |
| 05 | `2026-10-07-cw-05-dock-x-canopy.jpg` | the canopy of the old retail shed along the dock | Dock X, OSM way 23045192 (probable) |
| 06 | `2026-10-07-cw-06-surrey-quays-corner-corner.jpg` | across the dock to the south | Surrey Quays Shopping Centre with Corner Corner (certain) |
| 07 | `2026-10-07-cw-07-dock-panorama.jpg` | panorama from the north-east corner of the dock | as in 03, 08 and 11 |
| 08 | `2026-10-07-cw-08-library-and-11-maritime-street.jpg` | library, Ontario Point, red-brick tower | Canada Water Library, Ontario Point, 11 Maritime Street (certain) |
| 09 | `2026-10-07-cw-09-decathlon-entrance.jpg` | Decathlon's face to the dock | Decathlon (certain) |
| 10 | `2026-10-07-cw-10-11-maritime-street.jpg` | the red-brick tower, entrance "11" | 11 Maritime Street, OSM way 729958291 (certain) |
| 11 | `2026-10-07-cw-11-library-across-the-dock.jpg` | the library across the dock | library (certain), Columbia Point and Regina Point (probable), Ontario Point |
| 12 | `2026-10-07-cw-12-dock-shed.jpg` | black office with a saw-tooth roof across the dock | Dock Shed, OSM way 1427207669 (probable) |
| 13 | `2026-10-07-cw-13-three-deal-porters.jpg` | buff-brick office across the dock | Three Deal Porters (certain: name partly read) |
| 14 | `2026-10-07-cw-14-the-founding.jpg` | the three tower parts, light, red and charcoal | The Founding (certain) |
| 15 | `2026-10-07-cw-15-library-plaza.jpg` | the plaza north-east of the library | library, station drum, Regina Point, Ontario Point |
| 16 | `2026-10-07-cw-16-library-mesh-and-mast.jpg` | the library's mesh and a raking lighting mast | library (certain), Dock Shed behind |
| 17 | `2026-10-07-cw-17-library-theatre-fascia.jpg` | the library's north face, "CANADA WATER LIBRARY THEATRE" | library (certain) |
| 18 | `2026-10-07-cw-18-ontario-point.jpg` | Ontario Point from below | Ontario Point (certain: name on the base) |
| 19 | `2026-10-07-cw-19-white-calibration-stickers.jpg` | safety stickers on the library's glass door | **white calibration** (below) |
| 20 | `2026-10-07-cw-20-canada-water-station.jpg` | the station's glass drum and disc roof | Canada Water station (certain), Regina Point behind (probable) |

Each building's OSM way, model index, model height (above the ground, with the ground and roof in m OD) and the
evidence are in [`photos.json`](photos.json) (`buildings`). Photo 01 has a solved camera (four tower tops, rms 2.2 px,
Hampton Tower held out at 8 px); the other camera positions are judged from the faces seen and the bearings between
identified buildings.

## White calibration (photo 19)

The white backgrounds of the "Automatic door" sign are the white reference (two clean boxes, 257,400 pixels): mean
Display P3 RGB **216.1, 217.5, 212.4** (sd 2.1 to 2.3), sRGB 215.8, 217.6, 212.0, CIELAB (D65) L* 86.6, a* -1.6,
b* +2.5. The cast is slight: yellow-green, blue 5 % low against green in linear light. Linear gains that make it
neutral: **R x 1.015, G x 1, B x 1.055**. The printed safety yellow and blue are secondary references only (their print
colour is not known).

How to use it: the phone set white balance for each shot separately, so do not copy the gains to the other photos.
Balance each photo on a neutral in it (the overcast sky, white paint, the white van in 03 and 04) and use photo 19 to
check the method. Measured in every photo, the overcast sky came out within 4 CIELAB units of neutral (a* -3.8 to 0.0,
b* -2.9 to +1.3), so colours read from this set are within about 3 to 5 units of a balanced result. The sticker is on
the glass under the library's overhang, so some warm interior light may pass through it; a white card in open light
would be a better reference.

## Facade patterns

`rect/` holds rectified patches (CC0, cut from these photos) by the operation `rectify-facade-patches`:
`brick-tower-sse.jpg`, `decathlon-wsw.jpg`, `eleven-maritime-ssw.jpg`, `the-founding-red.jpg`,
`the-founding-grey.jpg`, `three-deal-porters-ene.jpg`, `dock-shed-ne.jpg`. Periods and colours per patch are in the kgx
graph `facade-patches-cwdock`; the judged patterns are in `photos.json` (`buildings.*.facade`). The autocorrelation
often picks a brick course (7 to 9 px); the floor periods that are floors are the 17-storey tower (67 px), The Founding's
red part (71 px), 11 Maritime Street (103 px) and Dock Shed (113 px).

## Found with this set

- The 3D model shows a pit where a tower of about 216 m OD now stands on Marsh Wall (OSM way 988728458; the 2022 LiDAR
  saw the excavation), and gives Three Deal Porters a guessed 6 m where the photo shows 6 storeys (fault F52).
- The photos are Display P3, and the facade tools read them as sRGB (fault F51).
- Photo 18 repeats the view of cwlibrary photo 1. The bearings of the brick chimney and the station drum put that camera
  about 65 m south-south-east of Ontario Point, not south-west: the cwlibrary face names and its 24.0 m tile width
  need a check (open; `photos.json` `buildings.ontario-point.facade.note`).

## Privacy

People and vehicles appear incidentally in several photos. Before any wider use (a page, a texture, a print), check
for faces and readable number plates and blur them. Nothing here describes or tags people.

## In the knowledge graph

The operations `rectify-facade-patches` and `lift-contrib-photos` (`magpie/cwplans/tools/contrib-photos.mjs` in
danbri/glitchcan-minigam) make the graphs `facade-patches-cwdock` and `photos-cwdock` in [`kgx/`](../../../../kgx/); the
activity log names the inputs (these photos and `photos.json`) by SHA-256. Buildings seen in both sets (the library,
Ontario Point, The Founding, the station, Columbia and Regina Point) have the same IRI in both graphs. OSM names and tags
quoted are © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).
