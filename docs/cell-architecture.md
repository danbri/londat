# Cells and extras: an architecture for London, the UK and the world

Written 2026-11-25 for issue https://github.com/danbri/londat/issues/20 (moglob at scale). Owner, 2026-11-25, verbatim:
"Make sure London core content is in cells and the more 'extra' stuff we did for London has a principled way of showing
up. Maybe it is extras in cell? Maybe KML-like? etc etc. Needs an architecture. Bear Enterprise Google Earth lessons in
mind but design for the new world of AI and Web-first."

This record proposes the design. Sections 6 and 7 list what is built, what is next and the decisions for the owner.
Related: https://github.com/danbri/londat/blob/main/docs/planet-architecture.md (frames, tile tree),
https://github.com/danbri/londat/blob/main/docs/scale-estimate.md (sizes), the tile index
https://github.com/danbri/londat/blob/main/cwplans/docklands/data/cells/index.json , the OKRs
https://github.com/danbri/londat/blob/main/OKRS.md (architecture rules).

## 0. Summary

- Two kinds of content. **Base**: every building, road and (later) the terrain, everywhere, made by one builder per
  layer from open data, cut by the geodetic quadtree into cells (level 8, 0.703 degrees), published in numbered
  repositories (`moglob/moglob-<n>.<m>`), listed in one tile index. **Extras**: everything else (the Docklands model,
  the places, trees, water, piers, ships, aircraft, crown lighting, occupants, photos, splats, user KML): packages
  that each declare where they are, what they add, what base content they replace, when they are valid, their sources
  and licences, and how a person and a machine read them.
- One registry of extras (a JSON-LD document, `extras/index.json`), keyed by quadtree cell, so the page asks "what is in
  this cell?" with one lookup, as it asks the tile index for the base. A package can live in any repository or on any
  host; the registry points to it.
- Replacement is declared, not baked: an extra says `replaces: { layer: "buildings", where: <polygon or id list> }`, and
  the page hides those base buildings at draw time. Today the Docklands model box is cut out of the cells at build time;
  that stays until the mask at draw time is built, then the build rule goes.
- Every package carries its description text, its facts as data and its tools (what an agent can ask), not only a
  picture. A cell has a card: counts, named places, sources, dates.
- KML stays as import and export (people have KML), not as the storage model. The registry keeps KML's good ideas
  (regions with level of detail, network links, folders, look-at views) in plain JSON-LD.

## 1. What we have (2026-11-25, measured)

| content | where | how many | how it reaches the page |
|---|---|---|---|
| base buildings, the UK | moglob/moglob-1.1 (south of 52.73 N), moglob/moglob-1.2 (north) | 129 level-8 cells, 24,397,838 buildings, 711 MB (363.3 + 347.7) | tile index, `?cells=1` (trial) |
| base roads, the UK | the same repositories, `data/roads/` | being built (one file a level-11 cell; test cell 5.73 MB) | the same index (`roads` per cell) |
| Greater London set | londat, `cwplans/docklands/data/places/london` | 1.4 M buildings, 48.7 MB | places index (default) |
| UK lite set | docklandia, `data/gb/uk-lite` | 22.7 M boxes + 82,784 landmarks, 294.8 MB | places index (default) |
| the Docklands model | londat, `cwplans/docklands/data/` (area.js, models, facades, tide terrain) | 54 cells of 1 km in the page | its own page mode (model) |
| places (León, Sarajevo, Dublin, Berlin, Stuttgart, Dagstuhl) | londat and docklandia | 6 places | places index |
| layers of the model (35 modules in `docklands/layers/`) | londat | trees, water, river, tide, piers, bridges, stations, under, ships, planes, wildlife, crown lighting, registry, routes, splats, KML, ... | each its own code, mostly London only |

The base is now general (any cell, one builder, one index). The extras are not: each one is its own code path with its own
idea of where it applies, and several are tied to the Docklands model frame (BNG), against architecture rule 1 (no
locale constants in the core).

## 2. Lessons from Google Earth Enterprise

Google Earth Enterprise (GEE, open-sourced in 2017, https://github.com/google/earthenterprise) built "globe databases"
with Fusion from imagery, terrain and vector projects, cut them into a quadtree of packets, and served them from its own
server; overlays came as KML. What we keep and what we change:

| GEE | lesson | here |
|---|---|---|
| one quadtree for imagery, terrain and vectors (packets by quad key) | one cell scheme for every layer makes lookup and caching simple | the geodetic quadtree for base, roads, terrain and the extras registry |
| a database is built and then **published** as a version | readers need a stable version; publishing must be atomic | each repository push is a version (commit in the index); the index points to the commit |
| Fusion rebuilt whole databases; small changes were slow | rebuild by cell, never the world | `populate-cells.mjs` builds and publishes cell by cell, resumable, one lock |
| server and formats were proprietary (the GEE server, packet formats); clients were Earth only | lock-in killed it when the server went away | open formats (3D Tiles 1.1, glTF, GeoJSON-like JSON, JSON-LD), static hosting (GitHub Pages; later any CDN), any client |
| KML NetworkLink with Region (lod min/max pixels) gave lazy, level-of-detail overlays ("superoverlays") | lazy loading by region and screen size is the right model for extras too | the registry gives each package a region and an LOD range; the page loads it only then |
| KML mixed data with presentation (styles, icons in the file) | data cannot be re-styled, read by machines or merged | architecture rule 6: packages hold data and attributes; the page makes every look |
| overlays drew on top of the base with no idea of what they replaced (a detailed model over the base buildings: both drawn) | double drawing and z-fighting | `replaces` in every package, a mask at draw time |
| no provenance per feature; licences were outside the data | the open-data world needs them in the data | sources, licence and hashes per package and per cell (the data register, provenance logs) |
| search came from a separate index on the server | search must work on static hosting | per-cell search rows (named features) in the cell files; the gazetteer of the skeleton |

## 3. The model

### 3.1 Base layers (one per kind, everywhere)

A base layer covers every cell it has data for, with one builder and one rule: buildings (`build-cell-tiles.mjs`, tier
london), roads (`build-cell-roads.mjs`), and later terrain (Copernicus GLO-30 by cell), water and land cover. A base
layer never holds hand-made or place-only content. Its index entry per cell holds the repository, the state, the counts,
the bytes, the release of the source and the commit. More detail in a place is never a fork of the base; it is an extra.

### 3.2 Extras (packages)

An extra is one package with one manifest. Types (each with its own reader in the page; new types need code, new
packages of a known type need none):

| type | holds | examples now | reader |
|---|---|---|---|
| `model` | a detailed 3D model of an area (3D Tiles or glTF) with its own building ids | the Docklands model (after section 3a of planet-architecture), Berlin LoD2 | places.js / model.js |
| `place` | a full place: core, ring, surroundings, its own ground | León, Sarajevo, Dublin, Berlin, Stuttgart, Dagstuhl | places.js |
| `features` | static vector features with attributes (points, lines, areas) and a style id | trees, piers, stations, bridges, crown lighting, construction sites, occupants | one generic reader by style id |
| `live` | a feed: endpoint, cache, refresh rule, the privacy rule | ships (AIS), aircraft (adsb.lol), METAR, tide | the live layers |
| `media` | photos, splats, panoramas with their camera | the owner's photos, splats | splats.js, photo views |
| `kml` | a KML or KMZ file as it is (user or third party) | the KML catalogue | kml.js |

Manifest fields (JSON-LD, `@context` schema.org plus our `cwk:` terms; sketch):

```json
{
  "@context": ["https://schema.org/", { "cwk": "https://kgx.foaf.tv/vocab#" }],
  "@id": "https://kgx.foaf.tv/id/extradocklandsmodel",
  "@type": ["Dataset", "cwk:Extra"],
  "name": "The Docklands model",
  "cwk:type": "model",
  "cwk:cells": ["8-255-201", "8-256-201"],
  "spatialCoverage": { "@type": "Place", "geo": { "@type": "GeoShape", "polygon": "51.487 -0.040 51.487 0.010 51.515 0.010 51.515 -0.040 51.487 -0.040" } },
  "cwk:lod": { "minEyeAltM": 0, "maxEyeAltM": 36000 },
  "cwk:replaces": [{ "layer": "buildings", "where": "spatialCoverage", "rule": "centroid at least 1 m inside" }],
  "cwk:priority": 100,
  "temporalCoverage": "2026-10/..",
  "distribution": [{ "@type": "DataDownload", "contentUrl": "https://danbri.github.io/londat/cwplans/docklands/data/", "encodingFormat": "application/x-moglob-model" }],
  "license": ["https://opendatacommons.org/licenses/odbl/1-0/", "http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"],
  "cwk:sources": ["osm", "ea-lidar", "own"],
  "cwk:provenance": "https://github.com/danbri/londat/blob/main/cwplans/pipeline.json",
  "description": "A hand-built model of the Isle of Dogs, Canary Wharf, Greenwich and the City: buildings with facades, piers, bridges, the tide on the foreshore.",
  "cwk:tools": ["featuresAt", "describeView", "buildingCard"]
}
```

### 3.3 The registry

`cwplans/docklands/data/extras/index.json`: every package's manifest (or its URL), and a derived map from level-8 cell
keys to package ids. The page reads it once (small: one line per package), then for the cells in view asks which
packages apply and loads each one inside its region and LOD range (KML's Region, without KML). A package may name
`cwk:cells` itself; the build step checks it against `spatialCoverage`. A cell's index entry in the tile index gets
`extras: [ids]` from the same map, so a tool reading one cell sees the whole picture.

### 3.4 Replacement and priority

Rule: the base draws everything; an extra with `replaces` hides the base content it covers; when two extras cover the
same place, the higher `priority` wins (a model over a place over features). Hiding is done in the page: a compact box or
an outline whose centroid is inside a replacing polygon is not drawn (a per-tile instance mask made when the tile loads;
cost one point-in-polygon test a building, measured later). Until that is built, the build-time cut stays for the
Docklands model (`--exclude docklands`) and the `?cells=1` switch leaves out the London and UK lite sets (they are
replaced as a whole).

### 3.5 Text and machine side (AI and Web first)

- A cell card (`<repo>/data/cells/<key>/card.json`, made at build): counts by class, named buildings, roads by class and
  the longest named roads, places in the cell from the gazetteer, sources with dates, the extras in it. One sentence of
  text per cell for a screen reader and for an LLM; the facts as JSON for tools. `describeView` merges the cards of the
  cells in view with what is drawn now.
- Every package has `description` and its facts as JSON-LD; `featuresAt(lon, lat)` answers from the base and from every
  extra that covers the point, with source and licence per answer.
- The same calls are MCP and WebMCP tools (the `docklands-view` MCP server exists): `listCells(bbox)`,
  `cellCard(key)`, `extrasAt(lon, lat)`, `featuresAt`, `describeView`. An agent can answer "what is at this corner"
  without drawing anything.
- Agents add extras by pull request: a manifest plus files; checks run in CI (licence class in the data register, bbox
  and cells agree, sizes, no visuals baked, the description present).
- Stable ids (`https://kgx.foaf.tv/id/...`) for packages and for named features, so the knowledge graph links to them.

## 4. London: what goes where

| content now | becomes | how |
|---|---|---|
| Greater London set (londat) | base: the cells 8-255-200, 8-255-201, 8-256-200, 8-256-201 already hold every London building | retire the London set when the cells are the default; its named-building rows move to the cell cards |
| UK lite set (docklandia) | base: the cells; its 82,784 landmarks become a `features` extra (landmark rule, towers, spires) or the landmark outlines go into the cells | retire the boxes; keep the landmark rows |
| the Docklands model | extra, type `model`, priority 100, replaces buildings in its box | after the model is 3D Tiles (planet-architecture 3a); until then its page mode stays as it is |
| trees, water, river, tide, piers, bridges, stations, under, crown lighting, wildlife, construction, registry | extras, type `features` (one package each), most in the model's box | move their data to the generic reader by style id one by one; each loses its BNG frame (rule 1) |
| ships, aircraft, METAR, weather | extras, type `live` (worldwide by nature; the cache region is London now) | already region-free in part; the manifest names the cache region |
| photos, splats | extras, type `media` | camera and licence in the manifest |
| places (León and others) | extras, type `place`, priority 50, replace the cells' buildings in their core | the places index becomes part of the registry |
| KML catalogue and user KML | extras, type `kml` | the KML layer reads the registry entry |

## 5. Base content in detail: what a cell holds

`data/cells/<key>/` (buildings: tileset.json, tiles, features.json, provenance), `data/roads/` (one file per level-11
cell; summary per level-8 cell), later `data/terrain/<key>/` and `card.json`. The page now draws:
buildings as compact boxes with pitched roofs on house-sized boxes (by rule, labelled not measured), irregular and named
buildings as outlines; roads as lines far away and at their width below 2.5 km (width by class, not measured); the
skeleton's labels and boundaries.

## 6. Built now (2026-11-25)

- Base buildings: 129 UK cells published (https://moglob.github.io/moglob-1.1/ , https://moglob.github.io/moglob-1.2/).
- Base roads: tool, driver, page layers (lines and widths); the UK roads run is going.
- `?cells=1`: the cells replace the London and UK lite sets as a whole (the simplest form of 3.4).
- Text side: `describeView` gives roads near the view centre and the nearest named road.

## 7. Next steps and decisions for the owner

Steps, in order (each one shippable):
1. Cell cards at build time and `cellCard` / `listCells` in the API and the MCP server.
2. The extras registry with the six existing places and the Docklands model as its first entries (no change in drawing).
3. The mask at draw time (3.4); then drop `--exclude docklands` from the cell builds; the cells become the default and
   the London and UK lite sets are retired.
4. Move the London layers to `features` packages one by one, starting with trees and piers (most visible).
5. The landmark rows of the UK lite set as a `features` extra.

Decisions:
- (a) Make the cells the default now (with the London and UK lite sets off), or after step 3? Recommended: after step 3.
- (b) Registry format: JSON-LD with schema.org and `cwk:` (recommended), or plain JSON with a separate context.
- (c) Where packages live: any repository the owner holds, listed in the registry (recommended), or all in moglob.
