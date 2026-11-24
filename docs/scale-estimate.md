# Size estimate per region before any build (issue 20, stage 1, 2026-11-24)

Issue: https://github.com/danbri/londat/issues/20 (moglob: show London, the UK and the world at scale). Owner decisions of
2026-11-24 (https://github.com/danbri/londat/issues/20#issuecomment-7135728004): we host the tile sets ourselves; more
GitHub repositories with Pages; no run-time fetch from the tile servers of open projects. This record answers stage 1:
how many repositories of about 900 MB each are needed for (a) Great Britain with building outlines, (b) Europe, (c) the
world at a coarse level.

## Result

Revised the same day by two built test cells: see "Stage 2 test cells" at the end. Outside dense cities each tile
adds about 3 kB, so the counts below are too low (Great Britain 2 repositories, Europe 19 to 26, the world 135 to 147
with today's tile format).

| region | buildings (Overture 2026-09-23.1) | London method, 34.8 B a building | one box a building, 9.8 B | squares only, 1.04 B |
|---|---|---|---|---|
| Great Britain | 24,661,980 | 858 MB: 1 repository (95 % full); 2 with room to rebuild | 242 MB | 26 MB |
| United Kingdom | 25,905,918 | 902 MB: 2 repositories | 254 MB | 27 MB |
| Europe without Russia (49 countries) | 343,979,836 | 11,971 MB: 14 repositories | 3,373 MB: 4 | 358 MB: 1 |
| Europe with Russia (50) | 415,365,493 | 14,455 MB: 17 repositories | 4,073 MB: 5 | 433 MB: 1 |
| World | 2,533,842,612 | 88,178 MB: 98 repositories | 24,845 MB: 28 | 2,640 MB: 3 |

Repositories = size / 900 MB, rounded up, with each repository full. A repository that holds a set and one rebuild of it
in its git history holds two copies; so either each repository is filled to about half, or a rebuild replaces the
history (a new orphan commit, as the `live-cache` branch does). With half-full repositories, double the counts.

The earlier upper rate (place-blocks 3, 79 B a building: every building an oriented box of 36 bytes, irregular ones as
outlines at level 14) gives Great Britain 1,949 MB (3 repositories), Europe with Russia 32,827 MB (37), the world
200,254 MB (223).

## Measurement 1: buildings per region

Tool: https://github.com/danbri/londat/blob/main/cwplans/tools/overture-building-counts.py . Output:
https://github.com/danbri/londat/blob/main/docs/scale/2026-11-24-overture-buildings-by-country.json .

- Source: the Overture buildings theme, release 2026-09-23.1 (the release of the London and UK lite builds): 512
  GeoParquet files, 276.9 GB.
- Method: the tool reads only the Parquet footers (DuckDB `parquet_metadata` over HTTPS; about one minute). For each row
  group it takes the row count and the bbox statistics. It gives all rows of the row group to the Natural Earth country
  (https://github.com/danbri/londat/blob/main/cwplans/docklands/data/world/countries.json) that holds the centre of the
  row group's box. A centre in the sea goes to the nearest country within 2 degrees (99.4 M rows), else to `NONE`
  (7.2 M rows, 0.3 %).
- Row groups are small because Overture sorts rows by place: 82,688 row groups, median 34,108 rows, median box 0.15 x
  0.19 degrees. Error: rows near a border can go to the neighbour country.
- Check against a per-record count: UK 25,836,202 by this method; 25,905,918 by the per-record DuckDB count of
  planet-architecture section 3b (17,701,452 OSM + 8,204,466 Microsoft only). Difference -0.27 %.
- Great Britain = the UK count of section 3b minus Northern Ireland (936,855 + 307,083).
- Europe = Natural Earth continent "Europe" (50 countries; Russia whole). Largest: Russia 71.4 M, France 55.9 M,
  Germany 45.3 M, UK 25.8 M, Ukraine 25.1 M, Poland 22.3 M, Italy 21.5 M, Spain 18.7 M.
- World by continent: Asia 1,127.1 M, Africa 481.1 M, Europe 415.4 M, North America 274.1 M, South America 210.8 M,
  Oceania 17.8 M, unassigned 7.2 M, open ocean 0.4 M.

## Measurement 2: bytes a building, from the sets already built

| rate | set | bytes | buildings | bytes a building |
|---|---|---|---|---|
| London method ("blocks with outlines") | Greater London, place-blocks 5 (planet-architecture §3b) | 48.7 MB in all (tiles, tileset.json, features.json, log) | 1,399,422 (1,330,253 compact boxes, 63,607 irregular outlines, 5,562 named outlines) | 34.8 |
| earlier upper rate | Greater London, place-blocks 3 | 110.6 MB | 1,399,437 | 79.0 |
| one box a building, no outline | UK lite v2, building boxes and squares (planet-architecture §3c; skill docklands-3d-page) | 222.2 MB of tiles | 22,661,675 | 9.8 |
| squares only (coarse) | UK lite v2, levels 7 to 10 (merged squares 200 m to 1.6 km and landmark boxes) | 23.7 MB | about 22.7 M | 1.04 |

What the London method draws: every building of 25 m2 or more; named buildings and irregular buildings (300 m2 or more,
less than 85 % of their oriented box) as outlines simplified at 2.5 m; all other buildings as 8-byte compact boxes with
true centroid, area, angle, aspect and height. The 63,607 irregular outlines are 4.5 % of the buildings and 26.1 MB
(54 %) of the bytes.

Bytes per km2 (the issue asked for it): London 48.7 MB on 1,572 km2 = 31 kB/km2; the UK lite set 294.8 MB on 242,495
km2 = 1.2 kB/km2. A per-km2 rate does not transfer: London has about 890 buildings/km2, Great Britain about 108. Great
Britain at London's per-km2 rate would be 7.1 GB, 8 times the per-building estimate. So the estimate scales by
buildings.

## Limits of the estimate (not measured)

- The London method's rate comes from London only. Its cost depends on the share of irregular buildings (4.5 % in
  London). The share in rural Britain, the rest of Europe and other continents is not measured. The first stage 2 build
  of a non-London cell gives the next measured rate.
- The squares-only rate scales merged squares by the number of buildings. Squares follow the settled area, not the
  building count. Not measured outside the UK.
- Repository limits are from the providers' pages, not measured
  (https://github.com/danbri/londat/blob/main/docs/hosting-options.md section 1): Pages site 1 GB (our workflow stops at
  950 MB), repository recommended under 1 GB, Pages traffic soft limit 100 GB a month per site.
- File count: London is 681 tiles for 1.4 M buildings, so about 12,000 tiles for Great Britain, 200,000 for Europe and
  1.2 M for the world at the London method (about 12,600 a repository). Not tested on Pages.
- Source volume for stage 2: the Overture files are 276.9 GB for the world. Europe is about 16 % of the rows (about
  45 GB). A builder by cell must read the row groups of its cell only (as `fetch-overture-theme.py` does by bbox), never
  a whole region to disk.

## Stage 2 test cells (2026-11-24): the estimate above is too low outside dense cities

Builder: https://github.com/danbri/londat/blob/main/cwplans/tools/build-cell-tiles.mjs (one level-8 cell of the geodetic
quadtree, 0.703 degrees; it writes a region config for the cell and runs build-place-tiles.mjs with the Greater London
parameters, tier `london`). Two cells built on 2026-11-24, Overture 2026-09-23.1:

| cell | area | Overture records in the cell | buildings drawn (25 m2 or more) | tiles (leaves) | outlines | size | bytes a building |
|---|---|---|---|---|---|---|---|
| 8-250-202 | mid Wales (Aberystwyth, Llandrindod Wells) | 68,864 | 60,881 | 1,109 (803) | 2,139 + 73 named | 5.37 MB | 88.1 |
| 8-255-201 | west London and the Chilterns (0.70 W to 0, 51.33 to 52.03 N) | 1,968,993 | 1,797,507 | 1,360 (1,024) | 74,705 + 6,973 named | 63.47 MB | 35.3 |

- The London cell agrees with the Greater London set (35.3 against 34.8 bytes a building).
- The Wales cell costs 2.5 times as much a building. Cause: a fixed cost for each tile. Each glb carries a glTF JSON
  header of about 2.7 kB (the full credit string, about 0.9 kB, is in every tile; accessors and block extras), and each
  tile has a node in tileset.json (about 0.4 kB). In Wales the JSON headers are 2.55 MB of the 5.37 MB.
- A fit through the two cells: size = 3,030 bytes a tile + 33.0 bytes a drawn building. Drawn buildings are 0.88 to 0.91
  of the Overture records (buildings under 25 m2 are not drawn).
- Rural cells are nearly full of tiles: Wales has a leaf in 803 of the 1,024 level-13 cells with only 60,881 buildings.

Revised estimate (tile cost included; level-8 cells with buildings counted from the row groups of measurement 1; a cell
has at most 1,360 tiles; the middle value assumes tiles grow with the square root of the buildings between the two
measured cells, which is a guess):

| region | level-8 cells with buildings | low (content only) | middle | high (every cell 1,360 tiles) | repositories of 900 MB (low / middle / high) |
|---|---|---|---|---|---|
| Great Britain | 103 | 0.7 GB | 1.1 GB | 1.1 GB | 1 / 2 / 2 |
| Europe without Russia | 1,771 | 10.2 GB | 16.4 GB | 17.4 GB | 12 / 19 / 20 |
| Europe with Russia | 2,652 | 12.4 GB | 21.2 GB | 23.1 GB | 14 / 24 / 26 |
| World | 13,871 | 75.3 GB | 120.9 GB | 131.6 GB | 84 / 135 / 147 |

Fixes that cut the tile cost (stage 6 work, needed before Europe):
1. A shorter glTF JSON for each tile: the credit once per tile set (tileset.json `asset` and features.json, which the
   page already shows), not in every glb; shorter block extras. Credit stays with the data: the decision is the owner's.
2. Leaves at a coarser level where buildings are sparse: stop dividing a node that holds fewer than about 2,000
   buildings. This cuts the tile count of rural cells by about 10 (Wales: 76 buildings a leaf tile). The page reader
   must then accept leaves at any level (places.js `refine_within_m` is set on the parents of level-13 leaves).
With both, the size goes towards the low column.

The two test cells are not committed (the page cannot read them before the tile index of stage 3; the London cell
repeats the London set). Rebuild: `node cwplans/tools/build-cell-tiles.mjs --cell 8-250-202` (about 2 minutes) and
`--cell 8-255-201` (about 12 minutes: fetch 2.0 M rows, select, heights, tiles 55 s).
