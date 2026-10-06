# Contributed photos: Canada Water Library, 2026-10-06

Four photographs taken by danbri (the project owner) at about 16:30 BST on 6 October 2026 round Canada Water Library,
SE16, and given to the project under **CC0 1.0** (https://creativecommons.org/publicdomain/zero/1.0/). The files carry
no EXIF time, GPS or camera data. They are for facade patterns and textures of these buildings in the 3D model:
https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/#v=1&c=-2040.8,823.4,0,249,2.0799,0.6315&n=0&t=now&u=0

| file | shows | identified as |
|---|---|---|
| `2026-10-06-cw-01-ontario-point.jpg` | a glazed residential tower from the south-west | **Ontario Point** (OSM way 204580680, 25 levels): the name is on the building |
| `2026-10-06-cw-02-canada-water-library.jpg` | the library's north face, the dock on the left | **Canada Water Library** (way 157137089, Wikidata Q55125811): the name is on the building; top right, probably The Founding |
| `2026-10-06-cw-03-canada-water-station.jpg` | the glass drum and bus station, two twin towers behind | **Canada Water station** drum (way 41599363) and **bus station** (way 140147695); **Columbia Point** (left, way 52588475) and **Regina Point** (right, way 52588474), 20 levels each |
| `2026-10-06-cw-04-dark-tower.jpg` | a dark tower with a red part, from below, in shade | **The Founding** (way 1330247335, 35 levels) |

How each was identified, with the evidence and a confidence, is in [`photos.json`](photos.json). In short:

- **Ontario Point:** the name "ONTARIO POIN(T)" at its base. The rectified face has about 12 two-floor units above the
  ground floor (25 levels); its LiDAR height is 82.2 m above the ground, roof frame included. The face is the south-west one, which the sun lit at
  16:30 (sun azimuth 239 deg).
- **Library:** its name and its inverted-pyramid form.
- **Station and the twin towers:** the glass drum with a disc roof. The only two towers of about 20 floors near it are
  OSM ways 52588475 and 52588474, 71 m apart, west of the drum. The photo is against the light, so the camera looked
  west; then the south tower (Columbia Point) is on the left.
- **The Founding:** 27 even floor rows are counted in part of the face, with more above and below, so 30 floors or more.
  Within about 1 km the only building with 30 or more levels in OSM is The Founding (35). Published descriptions give
  "a tripartite tower structure atop a five-storey podium" (https://www.gardiner.com/projects/plot-a1-canada-water);
  photo 4 shows two of the parts.

## Facade patterns

`rect/` holds affine-rectified patches of the facades (CC0, cut from these photos) by the operation
`rectify-facade-patches`: `ontario-point-sw-top.jpg` (the whole south-west face below the roof frame),
`ontario-point-sw-height.jpg` (left half, all floors), `library-north-wall.jpg`, `columbia-point-face.jpg`,
`the-founding-dark-face.jpg`. Periods and colours per patch are in the kgx graph `facade-patches-cwlibrary`; the judged
patterns are in `photos.json` (`buildings.*.facade`). Main points:

- **Ontario Point**, south-west face (24.0 m): corner pier, 3-pane bay, pier, then three times [pane, dark louvre strip,
  pane, pier], then 3-pane bay and corner pier: 12 panes, 3 louvre strips. Panes about 1.2 m, louvre pitch about 4.6 m.
  A thick slab band every two floors, a thin transom between. Open roof frame of thin fins. North-west face: glazed
  winter gardens, one row a floor.
- **Canada Water Library**: diamond expanded-metal panels, warm grey-brown, in a staggered grid; projecting framed
  windows 2 panes across; walls lean out.
- **Columbia Point / Regina Point**: cream concrete frame, red-brown panels either side of a window pair, a glazed column
  at one side, a recessed balcony row every fourth floor in one bay.
- **The Founding**: a red-framed part with projecting balconies and a taller dark charcoal part with a window grid
  (horizontal glazing bars), an open crown.

The colours measured are as photographed in evening shade or against the light; they are darker than the materials.

## Tiles on the 3D model

`tiles/` holds one 256 px tile per building (CC0), which the 3D page repeats on every wall at its size in metres:
`ontario-point.png` (the south-west face, its left half and the mirror image: 24.0 m by 8 floors), `the-founding.png`
(two bays by four floors of the dark part), `canada-water-library.png` (the bronze mesh only: the window boxes do not
repeat), and `columbia-regina-point.png` with its vector source `columbia-regina-point.svg` (a pattern drawn in metres:
one floor by one bay; the colours are judged, because the photo is against the sun). Sizes, crops and reasons are in
`photos.json` (`tiles`). The page draws them on the four buildings (and Regina Point) from the facade atlas:
https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/#v=1&c=-2040.8,823.4,0,249,2.0799,0.6315&n=0&u=0

## In the knowledge graph

The operations `rectify-facade-patches`, `lift-contrib-photos` and `cut-facade-tiles` (`magpie/cwplans/tools/contrib-photos.mjs`
in danbri/glitchcan-minigam) make the graphs `facade-patches-cwlibrary`, `photos-cwlibrary` and `facade-tiles-cwlibrary` in [`kgx/`](../../../../kgx/);
the activity log names the inputs (these photos and `photos.json`) by SHA-256. OSM names and tags quoted in the graph
are © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).
