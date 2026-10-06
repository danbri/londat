# Canary Wharf mall map (Living Map), archived as served: mallmap

The data behind https://map.canarywharf.com/ , the interactive estate and mall map that Canary Wharf Group publishes,
built and hosted by Living Map (livingmap.com). Archived unchanged for reference and for exploring physical
accessibility design in large pseudo-public spaces (owner, danbri, 2026-10-06: "Archive everything including all map
tiles into a mallmap subfolder, as is. It can be used for reference and exploring physical accessibility designs for
large pseudo-public spaces.").

## Status of use

- Rights holders: Canary Wharf Group and Living Map. No published licence or terms were found on 2026-10-06.
- The basemap tiles (`tiles/basemap/`) are derived from OpenStreetMap: © OpenStreetMap contributors, ODbL
  (https://www.openstreetmap.org/copyright), as the map's own style states.
- Use in this project: approved by the owner on 2026-10-06 for the scoping and prototyping phase of magpie/cwplans in
  danbri/glitchcan-minigam. Review before any use outside that phase.

## How it was made

`magpie/cwplans/tools/archive-cwg-mallmap.mjs` in the main repository (skill `cwplans-web-harvest`, "Mall plans").
robots.txt of map.canarywharf.com allows all. One request at a time per host: 1.1 s apart on the API hosts, 0.5 s on
the tile CDN. No key, no cookie, no login. Every file is the response body unchanged. `manifest.json` maps each URL to
its file with HTTP status, content type, size, SHA-256 and fetch time; URLs that answered 204 (an empty tile) or 404
are listed with no file.

## What is here

| folder | what |
|---|---|
| `app/` | the page: `index.html`, the React app bundle (`static/js`, `static/css`), manifest, icons |
| `api/maps.json` | map config: floors (Level -4 to Level 2, with -1M at -0.5 and M at 0.5), centre, extents, languages, search tags, bookmarks, regions, routing options. Its `access_token` (the Mapbox token the page serves) is replaced by a note: GitHub push protection refused it as a secret. The manifest keeps the SHA-256 and size of the file as served. |
| `api/feature-objects.json` | 536 named places: title, point, floor |
| `api/feature-names.json` | every searchable name |
| `api/features-by-name/` | `/v1/maps/canary_wharf/features?long_name=<name>&lang=en-GB` for every name (no position: with latitude and longitude the API also wants floor_id): full feature records (category, floor, centre, address, phone, opening hours, links, media) |
| `api/search-tag/<tag>/floor-<id>.json` | the search tags in the config (coffee, food and drink, parking, toilets, transport), one answer per floor (the API requires latitude, longitude and floor_id together) |
| `api/geofences.json`, `api/styles.json` | geofences; the Mapbox GL style (layers, colours per class) |
| `sprite/` | map icons (`icons.json`, `icons.png`, and the @2x pair) |
| `languages/en-GB.json` | interface strings |
| `tiles/indoor/{z}/{x}/{y}.pbf` | Mapbox Vector Tiles, zoom 0 to 19, layers `indoor` and `outdoor`: unit polygons per floor with name, class, mall (`location_name`), `floor_id`, `floor_level`, `floor_name`, opening times, telephone, address, URL; lifts, escalators, stairs, toilets, corridors, walls, entrances |
| `tiles/basemap/{z}/{x}/{y}.pbf` | the OSM-derived basemap, zoom 0 to 16 (ODbL) |
| `media/` | popup images named by tiles and features, by host and path |

Counts of the archive of 2026-10-06 (from `manifest.json`): 6,515 URLs; indoor tiles over zoom 0-19: 1,493 with data
and 4,101 empty (HTTP 204, no file); basemap tiles over zoom 0-16: 152 with data and one that answered 503 on three
runs (`canary_wharf_basemap/7/63/42`, zoom 7, not archived); 520 API answers (config, place lists, the 469
feature-name answers, the 45 tag searches: 5 tags x 9 floors); 237 images; the app; 240 MB in all.

Normalised copies (GeoJSON per floor, feature records, places) are in `../_TMI/mallmap/`.

Not archived: the Gotham font glyphs the style loads (a commercial typeface with its own licence), the session and
event POST calls (the page's usage logging), and third-party scripts (Mapbox GL, marker.io).

## Reading the tiles

Node: `@mapbox/vector-tile` and `pbf` (both in the main repository's devDependencies).

    import { VectorTile } from '@mapbox/vector-tile'; import Protobuf from 'pbf';
    const t = new VectorTile(new Protobuf(fs.readFileSync('tiles/indoor/17/65528/43586.pbf')));
    const f = t.layers.indoor.feature(0); f.properties; f.toGeoJSON(65528, 43586, 17);

GDAL and QGIS open a tile folder as an MVT dataset (`ogrinfo tiles/indoor/17` with the MVT driver, or add the folder
as a vector tile layer with a `file:///.../{z}/{x}/{y}.pbf` URL).
