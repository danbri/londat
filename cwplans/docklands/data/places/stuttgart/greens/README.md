# Mitte, Stuttgart: water and trees

Made by [cwplans/tools/build-place-greens.mjs](https://github.com/danbri/londat/blob/main/cwplans/tools/build-place-greens.mjs) for the region config [docklands/geo/regions/stuttgart.js](https://github.com/danbri/londat/blob/main/docklands/geo/regions/stuttgart.js); drawn by the globe of the Three.js port ([docklands/globe/place-look.js](https://github.com/danbri/londat/blob/main/docklands/globe/place-look.js)). Generated from `log.json`: do not edit by hand.

- Live view: https://danbri.github.io/londat/docklands/?ll=48.77847,9.17974,1500&ht=0,55
- Area (WGS84 degrees, west, south, east, north): 9.1571044921875, 48.7518310546875, 9.20654296875, 48.790283203125 (the core of the place)
- Credit: © OpenStreetMap contributors (ODbL 1.0); trees in woods and parks without mapped trees placed by a rule (positions illustrative)
- OSM data as of 2026-10-22T10:54:13Z (newest element)

## Files

| path | what | bytes | SHA-256 |
|---|---|---|---|
| greens.json | water polygons (clipped to the area), trees (position, height and crown when tagged, species profile and its basis, source, setting), woods and parks | 1750506 | `7b6b56f7582ec38c` |
| log.json | fetch records (URL, date, SHA-256 as fetched) and the dataflow activity | | |

## Sources

| source | licence | request | fetched | SHA-256 as fetched | committed |
|---|---|---|---|---|---|
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=9.157104,48.751831,9.181824,48.771057 | 2026-10-22T12:15:59.290Z | `f0282a25f7d8056d` | no (raw, cwplans/data/raw/places/stuttgart/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=9.181824,48.751831,9.206543,48.771057 | 2026-10-22T12:15:59.290Z | `b4e8e9c45f2da6b8` | no (raw, cwplans/data/raw/places/stuttgart/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=9.157104,48.771057,9.169464,48.780670 | 2026-10-22T12:15:59.290Z | `d9b9d5e5b5fc2803` | no (raw, cwplans/data/raw/places/stuttgart/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=9.169464,48.771057,9.181824,48.780670 | 2026-10-22T12:15:59.290Z | `d862335d74762ffa` | no (raw, cwplans/data/raw/places/stuttgart/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=9.157104,48.780670,9.169464,48.790283 | 2026-10-22T12:15:59.290Z | `1e7be0264ce4b09b` | no (raw, cwplans/data/raw/places/stuttgart/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=9.169464,48.780670,9.181824,48.790283 | 2026-10-22T12:15:59.290Z | `5abf29dee79fbe67` | no (raw, cwplans/data/raw/places/stuttgart/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=9.181824,48.771057,9.194183,48.780670 | 2026-10-22T12:15:59.290Z | `250a026436d0a2a7` | no (raw, cwplans/data/raw/places/stuttgart/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=9.194183,48.771057,9.206543,48.780670 | 2026-10-22T12:15:59.290Z | `bf4eb2332539b7d3` | no (raw, cwplans/data/raw/places/stuttgart/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=9.181824,48.780670,9.194183,48.790283 | 2026-10-22T12:15:59.290Z | `e74ae72b46e206e4` | no (raw, cwplans/data/raw/places/stuttgart/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=9.194183,48.780670,9.206543,48.790283 | 2026-10-22T12:15:59.290Z | `74d31d80c5b2341a` | no (raw, cwplans/data/raw/places/stuttgart/greens/) |
| OpenStreetMap relation 1505685 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/1505685/full.json | 2026-10-22T12:16:02.817Z | `613d5e9889d926fa` | no |
| OpenStreetMap relation 3756047 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/3756047/full.json | 2026-10-22T12:16:05.217Z | `9a0863bbeac28643` | no |
| OpenStreetMap relation 4135989 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/4135989/full.json | 2026-10-22T12:16:01.669Z | `da436ec87e0cb404` | no |
| OpenStreetMap relation 13624147 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/13624147/full.json | 2026-10-22T12:16:03.937Z | `57f488d029a3f9e1` | no |

## Operation (dataflow, skill cwplans-dataflow)

### place-greens version 1 (activity `731f39d05efb0f1e`, 2026-10-22T12:16:07.414Z)

Inputs:

- OSM map.json of the area: `data/raw/places/stuttgart/greens/osm-map.json.gz` (SHA-256 `77d1392ef4193c9f`)
- OSM relation 13624147 (full): `data/raw/places/stuttgart/greens/relation-13624147.json.gz` (SHA-256 `a80a9c3cd38a240d`)
- OSM relation 1505685 (full): `data/raw/places/stuttgart/greens/relation-1505685.json.gz` (SHA-256 `343db26af83ee8ee`)
- OSM relation 3756047 (full): `data/raw/places/stuttgart/greens/relation-3756047.json.gz` (SHA-256 `65b9ae4e4b393cde`)
- OSM relation 4135989 (full): `data/raw/places/stuttgart/greens/relation-4135989.json.gz` (SHA-256 `6d050f1d25518202`)

Parameters: {"area":[9.1571044921875,48.7518310546875,9.20654296875,48.790283203125],"row_m":8,"wood_m":12,"park_m":15,"water_side_m":25,"mix":["street","park","wood","water"],"about":"trees placed by rule: every wood_m in natural=wood / landuse=forest, every park_m in leisure=park and garden areas with no mapped tree inside (grass and meadow get none), on a grid jittered by a stable hash; never inside a building or water"} (mixes: the region config's place.greens.mix, else the model's MIXES of docklands/tree-species.js)

## Counts

```
{
 "water_polygons": 49,
 "trees": 28109,
 "osm_tree": 4295,
 "osm_tree_row": 708,
 "rule_wood": 21040,
 "rule_park": 2066,
 "skipped_blocked": 63,
 "by_basis": {
  "M": 28003,
  "G": 51,
  "S": 33,
  "L": 22
 },
 "by_profile": {
  "lime": 1435,
  "locust": 170,
  "maple": 1003,
  "plane": 1769,
  "horse-chestnut": 681,
  "birch": 510,
  "cherry": 172,
  "alder": 6,
  "ash": 2261,
  "broadleaf": 158,
  "oak": 5653,
  "conifer": 2310,
  "beech": 8785,
  "pine": 14,
  "willow": 19,
  "ginkgo": 25,
  "poplar": 13,
  "evergreen": 1,
  "apple": 1,
  "chestnut": 2,
  "hornbeam": 3121
 },
 "greens": 626
}
```

## Review

- OSM is share-alike (ODbL 1.0): registered with its credit (owner, 2026-10-03: "ODbL is ok for now"). Trees with source rule-wood or rule-park are placed by a stated rule in woods and parks that have no mapped trees: their positions are illustrative, not observations.
