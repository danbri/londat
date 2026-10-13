# UK skeleton: data and loader contract

Open vector layers, a gazetteer and place cards for the whole United Kingdom, so that the globe of the Three.js port can
show the UK and find any place in it (OKR KR2.7, https://github.com/danbri/londat/blob/main/OKRS.md). Owner,
2026-10-12: "also skeleton of uk with more open data vector and factoid content. Then leiden after we can fly around uk
and world without getting totally lost."

- Built by `node cwplans/tools/build-uk-skeleton.mjs` (https://github.com/danbri/londat/blob/main/cwplans/tools/build-uk-skeleton.mjs)
  from the sources that the region adapter `uk-skeleton` names (https://github.com/danbri/londat/blob/main/docklands/geo/regions/uk.js).
- Read with `docklands/geo/skeleton.js` (https://github.com/danbri/londat/blob/main/docklands/geo/skeleton.js): plain ES
  module, no dependencies, no three.js; browser and Node.
- Live (when the Pages site is on): https://danbri.github.io/londat/cwplans/docklands/data/uk/manifest.json
- Skill: `cwplans-uk-skeleton` (https://github.com/danbri/londat/blob/main/cwplans/skills/cwplans-uk-skeleton/SKILL.md).
- Size: about 38 MB in 1,533 files (the budget is 40 MB; test `docklands/geo/test/skeleton.test.mjs` fails above it).

## Reader contract

```js
import { openSkeleton, levelForSpan } from '../geo/skeleton.js';
const sk = await openSkeleton('https://danbri.github.io/londat/cwplans/docklands/data/uk/');   // reads manifest.json
const level = levelForSpan(viewNorth - viewSouth);            // 3 national (> 6 degrees), 6 regional (> 1.2), else 8 city
const roads = await sk.features('roads', [w, s, e, n], level); // GeoJSON Features, WGS84 [lon, lat], each with .bbox
const hits = await sk.search('Leeds', { limit: 10, near: [lon, lat], kinds: null });
const card = await sk.card(hits[0]);                          // Wikidata facts with source and date, or null
const here = await sk.whereAmI(lon, lat);                     // { country, region, county, district, nationalPark, landscape, builtUp, nearest }
const text = sk.describe(roads[0], 'roads');                  // "M62, a motorway." (one sentence for a screen reader)
```

- `features(layer, bbox, level)` uses the layer's finest level at or below `level` (else its coarsest), reads only the
  files whose bbox meets the view, and returns the features whose bbox meets it. Lines come in pieces (one per cell, id
  `<feature>.<n>`, the same properties); polygons come whole; ids are unique within a layer and level.
- `search(text)` folds the text (no accents, lower case, `&` as "and"), reads one gazetteer file (the first two letters
  or digits; one letter reads every file of that letter) and ranks: exact name, then name start, then word start; then
  the kind (`manifest.gazetteer.kindRank`), the population, and the distance from `near`. A name is also filed under its
  other-language form (Welsh, Gaelic) and without a generic first word (River, Loch, Llyn, Lake, Isle of, The: "Thames"
  finds River Thames). Hit: `{ name, alt, kind, kindLabel, lon, lat, la (district), id, wd, population, score }`.
- `card(hit)` reads the card file of the regional-level cell of the hit (and the cells next to it).
- Pass `{ fetchJson }` to `openSkeleton` to read from disk (the test does).

## manifest.json

`layers[]`: `{ id, title, geometry, properties (name -> meaning), describe (sentence template: {key}; a [part] is left
out when a key in it is empty), sources[], levels: [{ level, note?, files: [{ cell: [x, y], path, bbox, features,
bytes }] }] }`. Also `gazetteer` (key rule, prefixes, fields, kinds, kindRank, files), `cards` (level, fields, files),
`sources` (name, licence, url, attribution), `fetches` (URL, date, SHA-256 of each raw input), `credits` (the text to
show with the data), `transformation`, `cells`, `size`.

**Cells.** The worldwide geodetic quadtree of https://github.com/danbri/londat/blob/main/docs/planet-architecture.md :
level L cells are 180 / 2^L degrees; x = floor((lon + 180) / size), y = floor((lat + 90) / size) counted from the south
(3D Tiles 1.1 implicit tiling, region volumes). Path `layers/<layer>/<level>/<x>-<y>.json`. Polygons are whole in the
cell of their bbox centre (the file bbox is their real extent); lines are clipped at cell edges; points are in their
cell.

**File format `skeleton-1`.** `{ format, q, features: [{ id, properties, geometry: { type, d } }] }`: `d` holds integer
coordinates (degrees x q, q = 10^decimals), every point after the first of a line or ring as the difference from the
point before. LineString `[x0, y0, dx1, dy1, ...]`; Polygon `[ring, ...]` (closed rings, the outer first);
MultiPolygon `[polygon, ...]`; Point `[x, y]`. `unpack(file)` in the reader gives a GeoJSON FeatureCollection. About
three times smaller than GeoJSON text.

## Layers (levels 3 national, 6 regional, 8 city)

| layer | levels | features (finest level) | source (licence) | notes |
|---|---|---|---|---|
| countries | 3, 6 | 4 | ONS Dec 2024 BUC / BGC (OGL) | England, Scotland, Wales, Northern Ireland |
| regions | 6 | 9 | ONS Dec 2024 BGC (OGL) | England only (the other countries have no regions) |
| counties | 6 | 218 | ONS Dec 2024 BGC (OGL) | counties and unitary authorities, UK |
| districts | 6, 8 | 361 | ONS Dec 2024 BGC (OGL); Census 2021 TS001 (OGL) | `pop2021`: usual residents, England and Wales only |
| boundaries | 3, 6, 8 | 8,142 lines | ONS (OGL) | `kind` coast / country / region / county / district, `left` / `right` or `name` |
| roads | 3, 6, 8 | 19,442 lines | OS Open Zoomstack (OGL) | 3: motorways; 6: + primary A roads; 8: + all A roads; `ref`, `name` |
| rail | 6, 8 | 16,865 lines | OS Open Zoomstack (OGL) | railway or narrow gauge railway |
| stations | 6 | 3,626 | NaPTAN (OGL) | active rail (RLY) and metro / tram (MET) station areas; id = ATCO code |
| rivers | 6, 8 | 7,580 lines | OS Open Rivers (OGL) | named; 6: 40 km or more; 8: 10 km or more (pieces of 1 km or more of a long river kept) |
| lakes | 6, 8 | 3,258 | OS Open Zoomstack surfacewater (OGL) | lakes, reservoirs, wide rivers; 2 km2 / 0.25 km2 or more |
| built-up | 6, 8 | 4,628 | OS Open Built Up Areas (OGL) | 500 ha / 50 ha or more, with names |
| national-parks | 3, 6, 8 | 15 | ONS Dec 2022 BGC (OGL) | Great Britain (Northern Ireland has none) |
| landscapes | 6, 8 | 79 | Natural England, NRW, Scottish Government (OGL) | National Landscapes (AONB) of England and Wales, National Scenic Areas of Scotland |
| places | 3, 6, 8 | 30,883 | OS Open Names (OGL), Wikidata (CC0) | 3: cities and towns of 100,000+; 6: cities and towns; 8: + villages, suburbs, settlements |

Gazetteer: 156,535 entries in 433 files (some entries are in two files): OS Open Names settlements (city, town, village,
hamlet, suburb, other settlement) and named places (hills, ranges, islands, headlands, valleys, beaches, lakes, bays,
estuaries, seas, waterfalls, stations, airports, airfields, harbours, ports, ferry and bus stations, hospitals,
universities, numbered roads, urban parks; not the 0.9 million street names, woods or schools), about 2,860 postcode
districts (the mean of their postcodes), named rivers of 5 km or more, ONS area names, landscape names, and Wikidata
settlements of Northern Ireland. Cards: 3,018 places (Wikidata).

## Accuracy

- Reprojection: every source is in British National Grid (ONS publishes Northern Ireland in it too). Vertices go to
  WGS84 through OSTN15 (the OS NTv2 grid in proj4, both ways; round trip 0.000 m on 4,107 NaPTAN points). OSTN15 is the
  definitive OS transformation (about 0.1 m against ETRS89 in Great Britain); ETRS89 is used as WGS84 (about 0.9 m apart
  in 2026). NaPTAN's own longitude and latitude differ from OSTN15 by 1.4 m (median, 99th percentile 3.5 m) and agree with
  a Helmert transform to 0.35 m: NaPTAN uses a Helmert transform. In Northern Ireland OSTN15 extrapolates: a few metres.
- Simplification dominates: Douglas-Peucker tolerances (metres) at levels 3 / 6 / 8: boundaries 800 / 150 / 60; roads
  500 / 150 / 50; rail and lakes 150 / 50; rivers 150 / 40; built-up areas 150 / 60; national parks and landscapes
  800 / 150 / 30. Then rounding to 3 decimals (level 3) or 4 decimals (about 11 m north-south, 7 m east-west).
  Boundaries keep their shared edges (arcs simplified once). The ONS BGC boundaries are already generalised to about
  20 m and clipped to the coastline (mean high water).
- Wikidata facts are as published (CC0), not checked; the population is the preferred-rank value, else the latest
  dated one, with its date.

## Left out

- Northern Ireland in the OS layers (roads, rail, rivers, lakes, built-up areas, OS names): OS OpenData covers Great
  Britain only. The OSNI gazetteer and 50k layers are published with "LPS licensing terms", not a clear open licence
  (checked 2026-10-12): not used. Northern Ireland has the ONS boundaries, Wikidata settlements (691 rows) and cards.
  Lough Neagh and other NI water and hills are not findable yet.
- Census population for Scotland (2022, NRS) and Northern Ireland (2021, NISRA): not fetched yet; the cards carry the
  Wikidata population.
- Terrain: left to the world DEM of the globe (Copernicus / ETOPO, KR2.2). OS Terrain 50 (OGL) is a candidate for a UK
  overview later.
- Street names, woods, schools, full postcodes: too large for a skeleton; by request.
- Knowledge graph: the cards are not yet lifted into kgx (skill cwplans-kgx); they are JSON with source and date.

## Credits

Contains OS data © Crown copyright and database right 2026. Source: Office for National Statistics licensed under the
Open Government Licence v3.0. Contains DfT NaPTAN data, Natural England, Natural Resources Wales and Scottish Government
information, licensed under the Open Government Licence v3.0. Contains Royal Mail data © Royal Mail copyright and
database right 2026. Place facts: Wikidata (CC0).
