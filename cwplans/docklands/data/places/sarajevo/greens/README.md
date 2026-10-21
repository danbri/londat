# Stari Grad, Sarajevo: water and trees

Made by [cwplans/tools/build-place-greens.mjs](https://github.com/danbri/londat/blob/main/cwplans/tools/build-place-greens.mjs) for the region config [docklands/geo/regions/sarajevo.js](https://github.com/danbri/londat/blob/main/docklands/geo/regions/sarajevo.js); drawn by the globe of the Three.js port ([docklands/globe/place-look.js](https://github.com/danbri/londat/blob/main/docklands/globe/place-look.js)). Generated from `log.json`: do not edit by hand.

- Live view: https://danbri.github.io/londat/docklands/?ll=43.85917,18.43335,1500&ht=0,55
- Area (WGS84 degrees, west, south, east, north): 18.4185791015625, 43.8519287109375, 18.446044921875, 43.868408203125 (the core of the place)
- Credit: © OpenStreetMap contributors (ODbL 1.0); trees in woods and parks without mapped trees placed by a rule (positions illustrative)
- OSM data as of 2026-10-20T20:57:33Z (newest element)

## Files

| path | what | bytes | SHA-256 |
|---|---|---|---|
| greens.json | water polygons (clipped to the area), trees (position, height and crown when tagged, species profile and its basis, source, setting), woods and parks | 519891 | `2f7185a584e3d76d` |
| log.json | fetch records (URL, date, SHA-256 as fetched) and the dataflow activity | | |

## Sources

| source | licence | request | fetched | SHA-256 as fetched | committed |
|---|---|---|---|---|---|
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=18.418579,43.851929,18.446045,43.868408 | 2026-10-21T10:12:13.718Z | `97549c5a9c06a691` | no (raw, cwplans/data/raw/places/sarajevo/greens/) |

## Operation (dataflow, skill cwplans-dataflow)

### place-greens version 1 (activity `19b67fef06e0e65c`, 2026-10-21T10:12:14.891Z)

Inputs:

- OSM map.json of the area: `data/raw/places/sarajevo/greens/osm-map.json.gz` (SHA-256 `bb1bf6498aa4d041`)

Parameters: {"area":[18.4185791015625,43.8519287109375,18.446044921875,43.868408203125],"row_m":8,"wood_m":6.5,"park_m":15,"water_side_m":25,"mix":["street","park","wood","water"],"about":"trees placed by rule: every wood_m in natural=wood / landuse=forest, every park_m in leisure=park and garden areas with no mapped tree inside (grass and meadow get none), on a grid jittered by a stable hash; never inside a building or water"} (mixes: the region config's place.greens.mix, else the model's MIXES of docklands/tree-species.js)

## Counts

```
{
 "water_polygons": 3,
 "trees": 8274,
 "osm_tree": 174,
 "osm_tree_row": 15,
 "rule_wood": 7730,
 "rule_park": 355,
 "skipped_blocked": 121,
 "by_basis": {
  "M": 8246,
  "L": 28
 },
 "by_profile": {
  "pine": 1194,
  "lime": 98,
  "conifer": 823,
  "plane": 53,
  "maple": 68,
  "horse-chestnut": 76,
  "willow": 9,
  "alder": 10,
  "cherry": 5,
  "birch": 51,
  "ash": 800,
  "poplar": 2,
  "hornbeam": 1197,
  "beech": 1907,
  "oak": 1981
 },
 "greens": 82
}
```

## Review

- OSM is share-alike (ODbL 1.0): registered with its credit (owner, 2026-10-03: "ODbL is ok for now"). Trees with source rule-wood or rule-park are placed by a stated rule in woods and parks that have no mapped trees: their positions are illustrative, not observations.
