# Contributed photo: Greenland Dock by day, 2026-10-11

One photograph taken by danbri (the project owner) at 12:45 BST on 11 October 2026 on an iPhone, given to the project
under **CC0 1.0** (https://creativecommons.org/publicdomain/zero/1.0/). The owner: "This cc0 contrib photo of Greenland
dock looking towards Thames and houseboats can be used to calibrate our lighting, nature, water, trees, and birds data.
... Photo taken 12:45 on an iphone."

| file | SHA-256 |
|---|---|
| `2026-10-11-gd-01-greenland-dock-east.jpg` (2576 x 1932, 1,951,461 bytes) | a048a043b63467e27951136595b2ebece6b03bb608c9ccbbeca2bfc19d98dd0b |

The file is the JPEG as delivered, renamed only. It has no EXIF time, GPS or camera model (ExifVersion 0221 only) and an
embedded **Display P3** ICC profile: convert to sRGB before you measure a colour (fault F51 in the curation skill). The
date is the upload date (the photo arrived at 12:48 BST, 3 minutes after the stated time).

People: two people walk on the quay at the left edge (about 25 px faces). They may be recognisable at full size. Reported
to the owner on 2026-10-11; not described or tagged here.

## Camera

Solved with `tools/view-mcp` (skill `photo-view-reconstruction`), focal length fixed at 1785 px (the iPhone main lens,
24 mm equivalent: 24 / 43.27 x the 3220 px diagonal), free: eye x, y, z, heading, pitch, roll.

- Eye (-1679.2, 6.5 m OD, 1234.1) in model metres: -0.04415, 51.49422, on the west end wall of Greenland Dock, about
  1.5 m over the quay (LiDAR ground 4.9 to 5.2 m OD). Sigma: x 2.2 m, z 1.0 m, y 0.4 m.
- Heading 85.65 deg from grid north (sigma 0.57), pitch -0.61 deg (0.29), roll -1.59 deg (0.52), horizontal field
  71.6 deg.
- rms 13.5 px over 12 observations: the top of Pan Peninsula (cwb-0801, 16.5 px), the corner of the projecting quay at
  the left (top and waterline, 16.2 and 7.1 px; position read from the OSM water outline at (-1663, 1227)), and seven
  pixels on the dock's waterline (outline `water:65`, 4 to 23 px; the OSM outline and the far waterline are both soft at
  this range). The dock's axis (heading 71) is 15 deg left of the view's centre.
- On the page: https://danbri.github.io/londat/docklands/?view=greenlanddock&t=2026-10-11T12:45

What the photo shows, by bearing: the dock's north quay (left) and south quay (right), both lined with London planes;
the Isle of Dogs skyline on the left (Pan Peninsula, the only cylinder, 15 deg left of centre); the white footbridge and
moored boats at the dock's east end by Greenland Lock; Baltic Quay (the tower with the arched top) on the right.

## Measurements (sRGB, medians; `docklands/test/photo-tones.mjs`)

| region (photo px) | photo | luma |
|---|---|---|
| sky, top band (1300..2500, 0..120: 25 to 28 deg up) | 117, 152, 205 | 0.582 |
| sky, middle (1500..1800, 420..560) | 156, 187, 222 | 0.717 |
| sky, low (1700..2100, 700..760) | 208, 222, 232 | 0.862 |
| water, middle distance | 134, 154, 175 | 0.593 |
| water, near (looking down) | 77, 87, 100 | 0.337 |
| trees, far right (shaded north faces) | 32, 35, 31 | 0.134 |

London plane foliage (pixels with g > b + 12): hue 0.13 to 0.16 (47 to 58 deg) on both quays and the near tree: the
leaves have started to turn yellow on 11 October.

Birds on the water of the west basin (about 3.4 ha): 18, about 12 gulls (white; small, probably black-headed gulls in
winter plumage) and 6 dark birds (coots or tufted ducks). Counted by eye on the full-size photo.

Sky: cirrus and small fair-weather cumulus, a contrail; the sun is behind the camera to the right (azimuth 179.5 true,
altitude 31.4 deg at 12:45 BST).
