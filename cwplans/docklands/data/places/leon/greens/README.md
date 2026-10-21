# Casco Histórico, León: water and trees

Made by [cwplans/tools/build-place-greens.mjs](https://github.com/danbri/londat/blob/main/cwplans/tools/build-place-greens.mjs) for the region config [docklands/geo/regions/leon.js](https://github.com/danbri/londat/blob/main/docklands/geo/regions/leon.js); drawn by the globe of the Three.js port ([docklands/globe/place-look.js](https://github.com/danbri/londat/blob/main/docklands/globe/place-look.js)). Generated from `log.json`: do not edit by hand.

- Live view: https://danbri.github.io/londat/docklands/?ll=42.59732,-5.56654,1500&ht=0,55
- Area (WGS84 degrees, west, south, east, north): -5.5810546875, 42.5885009765625, -5.5535888671875, 42.60498046875 (the core of the place)
- Credit: © OpenStreetMap contributors (ODbL 1.0); trees in woods and parks without mapped trees placed by a rule (positions illustrative)
- OSM data as of 2026-10-19T16:28:48Z (newest element)

## Files

| path | what | bytes | SHA-256 |
|---|---|---|---|
| greens.json | water polygons (clipped to the area), trees (position, height and crown when tagged, species profile and its basis, source, setting), woods and parks | 175408 | `76e6023846c0fd0b` |
| log.json | fetch records (URL, date, SHA-256 as fetched) and the dataflow activity | | |

## Sources

| source | licence | request | fetched | SHA-256 as fetched | committed |
|---|---|---|---|---|---|
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=-5.581055,42.588501,-5.553589,42.604980 | 2026-10-21T10:11:50.933Z | `d607774ce0b4ea59` | no (raw, cwplans/data/raw/places/leon/greens/) |
| OpenStreetMap relation 9423404 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/9423404/full.json | 2026-10-21T10:11:52.450Z | `662345b67e34fd48` | no |
| OpenStreetMap relation 9466257 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/9466257/full.json | 2026-10-21T10:11:53.795Z | `34507068801fbfa7` | no |
| OpenStreetMap relation 9466258 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/9466258/full.json | 2026-10-21T10:11:55.134Z | `e2578a31c51cf47c` | no |

## Operation (dataflow, skill cwplans-dataflow)

### place-greens version 1 (activity `120884c026414f03`, 2026-10-21T10:12:07.335Z)

Inputs:

- OSM map.json of the area: `data/raw/places/leon/greens/osm-map.json.gz` (SHA-256 `4d39aa32bef896a6`)
- OSM relation 9423404 (full): `data/raw/places/leon/greens/relation-9423404.json.gz` (SHA-256 `35118d26b1a73a32`)
- OSM relation 9466257 (full): `data/raw/places/leon/greens/relation-9466257.json.gz` (SHA-256 `aaa12f3c8677d04e`)
- OSM relation 9466258 (full): `data/raw/places/leon/greens/relation-9466258.json.gz` (SHA-256 `ba09b7fb1c87f2d7`)

Parameters: {"area":[-5.5810546875,42.5885009765625,-5.5535888671875,42.60498046875],"row_m":8,"wood_m":6.5,"park_m":15,"water_side_m":25,"mix":["street","park","wood","water"],"about":"trees placed by rule: every wood_m in natural=wood / landuse=forest, every park_m in leisure=park and garden areas with no mapped tree inside (grass and meadow get none), on a grid jittered by a stable hash; never inside a building or water"} (mixes: the region config's place.greens.mix, else the model's MIXES of docklands/tree-species.js)

## Counts

```
{
 "water_polygons": 38,
 "trees": 2280,
 "osm_tree": 569,
 "osm_tree_row": 367,
 "rule_wood": 99,
 "rule_park": 1245,
 "skipped_blocked": 18,
 "by_basis": {
  "M": 2080,
  "L": 53,
  "S": 142,
  "G": 5
 },
 "by_profile": {
  "horse-chestnut": 323,
  "plane": 343,
  "ash": 127,
  "broadleaf": 79,
  "conifer": 239,
  "pine": 206,
  "cherry-plum": 20,
  "poplar": 111,
  "maple": 204,
  "lime": 195,
  "cypress-columnar": 84,
  "oak": 199,
  "alder": 7,
  "willow": 21,
  "locust": 50,
  "birch": 72
 },
 "greens": 332
}
```

## Review

- OSM is share-alike (ODbL 1.0): registered with its credit (owner, 2026-10-03: "ODbL is ok for now"). Trees with source rule-wood or rule-park are placed by a stated rule in woods and parks that have no mapped trees: their positions are illustrative, not observations.
