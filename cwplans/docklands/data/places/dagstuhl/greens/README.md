# Schloss Dagstuhl, Wadern: water and trees

Made by [cwplans/tools/build-place-greens.mjs](https://github.com/danbri/londat/blob/main/cwplans/tools/build-place-greens.mjs) for the region config [docklands/geo/regions/dagstuhl.js](https://github.com/danbri/londat/blob/main/docklands/geo/regions/dagstuhl.js); drawn by the globe of the Three.js port ([docklands/globe/place-look.js](https://github.com/danbri/londat/blob/main/docklands/globe/place-look.js)). Generated from `log.json`: do not edit by hand.

- Live view: https://danbri.github.io/londat/docklands/?ll=49.53067,6.89863,1500&ht=0,55
- Area (WGS84 degrees, west, south, east, north): 6.866455078125, 49.515380859375, 6.932373046875, 49.59228515625 (the core of the place)
- Credit: © OpenStreetMap contributors (ODbL 1.0); trees in woods and parks without mapped trees placed by a rule (positions illustrative)
- OSM data as of 2026-10-22T12:00:16Z (newest element)

## Files

| path | what | bytes | SHA-256 |
|---|---|---|---|
| greens.json | water polygons (clipped to the area), trees (position, height and crown when tagged, species profile and its basis, source, setting), woods and parks | 1432049 | `ae3214f756833cd4` |
| log.json | fetch records (URL, date, SHA-256 as fetched) and the dataflow activity | | |

## Sources

| source | licence | request | fetched | SHA-256 as fetched | committed |
|---|---|---|---|---|---|
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=6.866455,49.515381,6.899414,49.553833 | 2026-10-22T12:04:57.771Z | `243c74d84fb8a59d` | no (raw, cwplans/data/raw/places/dagstuhl/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=6.899414,49.515381,6.932373,49.553833 | 2026-10-22T12:04:57.771Z | `ebc774651469363b` | no (raw, cwplans/data/raw/places/dagstuhl/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=6.866455,49.553833,6.899414,49.592285 | 2026-10-22T12:04:57.771Z | `c5103fd50ec3da4b` | no (raw, cwplans/data/raw/places/dagstuhl/greens/) |
| OpenStreetMap (OSM API 0.6 map.json) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/map.json?bbox=6.899414,49.553833,6.932373,49.592285 | 2026-10-22T12:04:57.771Z | `50d172143ed53522` | no (raw, cwplans/data/raw/places/dagstuhl/greens/) |
| OpenStreetMap relation 4665474 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/4665474/full.json | 2026-10-22T12:05:01.670Z | `ef9339e92a0354cf` | no |
| OpenStreetMap relation 6179656 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/6179656/full.json | 2026-10-22T12:04:59.293Z | `987f7c3d729d93e8` | no |
| OpenStreetMap relation 7085461 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/7085461/full.json | 2026-10-22T12:05:02.903Z | `df04a0e2c01eacfc` | no |
| OpenStreetMap relation 7582979 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/7582979/full.json | 2026-10-22T12:05:00.517Z | `aa8c07dd2c38517f` | no |
| OpenStreetMap relation 8249417 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/8249417/full.json | 2026-10-22T12:05:04.084Z | `b74ca2bc0ec0d6d2` | no |
| OpenStreetMap relation 9347501 (full) | ODbL 1.0, © OpenStreetMap contributors | https://api.openstreetmap.org/api/0.6/relation/9347501/full.json | 2026-10-22T12:05:05.253Z | `801a28f6ed035dce` | no |

## Operation (dataflow, skill cwplans-dataflow)

### place-greens version 1 (activity `bc5a4d500318b6c8`, 2026-10-22T12:05:51.109Z)

Inputs:

- OSM map.json of the area: `data/raw/places/dagstuhl/greens/osm-map.json.gz` (SHA-256 `9a7f55b74dbb3be6`)
- OSM relation 4665474 (full): `data/raw/places/dagstuhl/greens/relation-4665474.json.gz` (SHA-256 `2fa6c04748a19717`)
- OSM relation 6179656 (full): `data/raw/places/dagstuhl/greens/relation-6179656.json.gz` (SHA-256 `086490f7c305d6d3`)
- OSM relation 7085461 (full): `data/raw/places/dagstuhl/greens/relation-7085461.json.gz` (SHA-256 `fd5150bdde12f1c8`)
- OSM relation 7582979 (full): `data/raw/places/dagstuhl/greens/relation-7582979.json.gz` (SHA-256 `1c1a3da7b5684dda`)
- OSM relation 8249417 (full): `data/raw/places/dagstuhl/greens/relation-8249417.json.gz` (SHA-256 `e2903321cf181f81`)
- OSM relation 9347501 (full): `data/raw/places/dagstuhl/greens/relation-9347501.json.gz` (SHA-256 `285d76cb086b4a57`)

Parameters: {"area":[6.866455078125,49.515380859375,6.932373046875,49.59228515625],"row_m":8,"wood_m":25,"park_m":15,"water_side_m":25,"mix":["street","park","wood","water"],"about":"trees placed by rule: every wood_m in natural=wood / landuse=forest, every park_m in leisure=park and garden areas with no mapped tree inside (grass and meadow get none), on a grid jittered by a stable hash; never inside a building or water"} (mixes: the region config's place.greens.mix, else the model's MIXES of docklands/tree-species.js)

## Counts

```
{
 "water_polygons": 50,
 "trees": 22941,
 "osm_tree": 23,
 "osm_tree_row": 470,
 "rule_wood": 22312,
 "rule_park": 136,
 "skipped_blocked": 16,
 "by_basis": {
  "M": 22941
 },
 "by_profile": {
  "lime": 140,
  "horse-chestnut": 75,
  "oak": 5710,
  "maple": 84,
  "birch": 1200,
  "conifer": 4550,
  "beech": 9061,
  "cherry": 17,
  "ash": 1130,
  "broadleaf": 974
 },
 "greens": 475
}
```

## Review

- OSM is share-alike (ODbL 1.0): registered with its credit (owner, 2026-10-03: "ODbL is ok for now"). Trees with source rule-wood or rule-park are placed by a stated rule in woods and parks that have no mapped trees: their positions are illustrative, not observations.
