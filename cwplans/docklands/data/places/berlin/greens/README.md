# Mitte, Berlin: water and trees

Made by [cwplans/tools/build-place-greens.mjs](https://github.com/danbri/londat/blob/main/cwplans/tools/build-place-greens.mjs) for the region config [docklands/geo/regions/berlin.js](https://github.com/danbri/londat/blob/main/docklands/geo/regions/berlin.js); drawn by the globe of the Three.js port ([docklands/globe/place-look.js](https://github.com/danbri/londat/blob/main/docklands/globe/place-look.js)). Generated from `log.json`: do not edit by hand.

- Live view: https://danbri.github.io/londat/docklands/?ll=52.51627,13.3777,1500&ht=0,55
- Area (WGS84 degrees, west, south, east, north): 13.370361328125, 52.503662109375, 13.4197998046875, 52.525634765625 (the core of the place)
- Credit: © OpenStreetMap contributors (ODbL 1.0); trees in woods and parks without mapped trees placed by a rule (positions illustrative)
- OSM data as of 2026-10-22T13:35:50Z (newest element)

## Files

| path | what | bytes | SHA-256 |
|---|---|---|---|
| greens.json | water polygons (clipped to the area), trees (position, height and crown when tagged, species profile and its basis, source, setting), woods and parks | 609893 | `d4bef3fa04f7661d` |
| log.json | fetch records (URL, date, SHA-256 as fetched) and the dataflow activity | | |

## Sources

| source | licence | request | fetched | SHA-256 as fetched | committed |
|---|---|---|---|---|---|
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=13.370361,52.503662,13.395081,52.514648 | 2026-10-22T13:48:00.593Z | `3bb5b4c5161b40d3` | no (raw, cwplans/data/raw/places/berlin/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=13.395081,52.503662,13.419800,52.514648 | 2026-10-22T13:48:00.593Z | `878ab433e3e4755e` | no (raw, cwplans/data/raw/places/berlin/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=13.370361,52.514648,13.395081,52.525635 | 2026-10-22T13:48:00.593Z | `d2ac6a30ad456d8c` | no (raw, cwplans/data/raw/places/berlin/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=13.395081,52.514648,13.419800,52.525635 | 2026-10-22T13:48:00.593Z | `93c98a846497c46c` | no (raw, cwplans/data/raw/places/berlin/greens/) |
| OpenStreetMap relation 2178114 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/2178114/full.json | 2026-10-22T13:48:02.644Z | `48f6c0d40b519271` | no |
| OpenStreetMap relation 6529251 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/6529251/full.json | 2026-10-22T13:48:06.088Z | `46a0c8cc1b29adf3` | no |
| OpenStreetMap relation 7643526 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/7643526/full.json | 2026-10-22T13:48:03.831Z | `1814036516a3b1dc` | no |
| OpenStreetMap relation 7652618 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/7652618/full.json | 2026-10-22T13:48:04.952Z | `cf9119eb3b259815` | no |
| OpenStreetMap relation 14282254 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/14282254/full.json | 2026-10-22T13:48:07.211Z | `ca95c6696b05e2fa` | no |
| OpenStreetMap relation 15748242 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/15748242/full.json | 2026-10-22T13:48:09.463Z | `05aa434e00ad830c` | no |
| OpenStreetMap relation 17073039 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/17073039/full.json | 2026-10-22T13:48:08.333Z | `10972a70324caba4` | no |

## Operation (dataflow, skill cwplans-dataflow)

### place-greens version 1 (activity `7896256b4b725df3`, 2026-10-22T13:48:11.283Z)

Inputs:

- OSM map.json of the area: `data/raw/places/berlin/greens/osm-map.json.gz` (SHA-256 `b100e763041c8020`)
- OSM relation 14282254 (full): `data/raw/places/berlin/greens/relation-14282254.json.gz` (SHA-256 `b23a85a266f5e851`)
- OSM relation 15748242 (full): `data/raw/places/berlin/greens/relation-15748242.json.gz` (SHA-256 `a4ba0dcec8ea0750`)
- OSM relation 17073039 (full): `data/raw/places/berlin/greens/relation-17073039.json.gz` (SHA-256 `51bb9a1aeecd4530`)
- OSM relation 2178114 (full): `data/raw/places/berlin/greens/relation-2178114.json.gz` (SHA-256 `468396a0f61e0128`)
- OSM relation 6529251 (full): `data/raw/places/berlin/greens/relation-6529251.json.gz` (SHA-256 `c98adbbd2466ceb7`)
- OSM relation 7643526 (full): `data/raw/places/berlin/greens/relation-7643526.json.gz` (SHA-256 `986fdc9b03e59d5f`)
- OSM relation 7652618 (full): `data/raw/places/berlin/greens/relation-7652618.json.gz` (SHA-256 `34fc38dba674062d`)

Parameters: {"area":[13.370361328125,52.503662109375,13.4197998046875,52.525634765625],"row_m":8,"wood_m":12,"park_m":15,"water_side_m":25,"mix":["street","park","wood","water"],"about":"trees placed by rule: every wood_m in natural=wood / landuse=forest, every park_m in leisure=park and garden areas with no mapped tree inside (grass and meadow get none), on a grid jittered by a stable hash; never inside a building or water"} (mixes: the region config's place.greens.mix, else the model's MIXES of docklands/tree-species.js)

## Counts

```
{
 "water_polygons": 31,
 "trees": 8749,
 "osm_tree": 6829,
 "osm_tree_row": 170,
 "rule_wood": 1232,
 "rule_park": 518,
 "skipped_blocked": 6,
 "by_basis": {
  "G": 368,
  "M": 8269,
  "L": 12,
  "S": 100
 },
 "by_profile": {
  "maple": 1127,
  "oak": 897,
  "plane": 835,
  "lime": 2126,
  "ash": 384,
  "horse-chestnut": 712,
  "broadleaf": 806,
  "birch": 645,
  "beech": 368,
  "locust": 179,
  "alder": 168,
  "willow": 229,
  "poplar": 107,
  "pine": 150,
  "conifer": 11,
  "ginkgo": 2,
  "apple": 1,
  "chestnut": 1,
  "magnolia": 1
 },
 "greens": 920
}
```

## Review

- OSM is share-alike (ODbL 1.0): registered with its credit (owner, 2026-10-03: "ODbL is ok for now"). Trees with source rule-wood or rule-park are placed by a stated rule in woods and parks that have no mapped trees: their positions are illustrative, not observations.
