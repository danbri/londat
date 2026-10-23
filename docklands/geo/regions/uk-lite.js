// Region config: the United Kingdom outside Greater London as a LITE building set on the globe (owner, 2026-10-22, about
// buildings for the whole UK: "can we pick a lite subset or slice somehow? Key landmarks, modest resolution?"). Pure data;
// read through region(). A place of kind "lite": no core and no ground of its own (as London's "blocks"); two classes:
//   (a) landmarks: buildings named by a stated rule (below), each with its own outline, id and card;
//   (b) every other building (OpenStreetMap and Microsoft footprints) as its own box at its true position at the leaves
//       (footprint area, orientation, height; no outline; since 2026-10-22, owner: "UK data looks like literal tiles"),
//       and as the merged mass at the coarse levels (one box a square: 200 m to 1.6 km).
// Tool: cwplans/tools/build-place-tiles.mjs --region uk-lite (operations place-lite-select per part, place-lite-tiles;
// module cwplans/tools/place-lite.mjs). Output: the docklandia repository (bulky data), data/gb/uk-lite/, served at
// place.tileBase. Skill docklands-3d-page, "Three.js port: the UK lite set (2026-10-22)".
// Greater London is its own place (region config london.js, kind "blocks"): a building whose centroid is in the ONS region
// E12000007 is drawn by London only (the same polygon of the UK skeleton, the same centroid rule), so no building is
// drawn twice; every other UK building belongs to the first part (in the order below) whose polygon holds its centroid.
// Origin: the middle of the UK box (as the uk region config). h: 0 (no ground of its own).
import ghsl from '../adapters/world-ghsl.js';
import { overture, msBuildings } from '../adapters/world-buildings.js';
import { overtureOuter } from '../adapters/world-surround.js';

export default {
  id: 'uk-lite',
  name: 'United Kingdom (lite buildings)',
  origin: { lon: -2.5, lat: 54.4, h: 0 },
  bbox: [-8.7, 49.85, 1.8, 60.9],
  timeZone: 'Europe/London',
  locale: 'en-GB',
  locales: ['en-GB', 'cy', 'gd'],
  heightDatum: 'ellipsoid',
  place: {
    kind: 'lite', label: 'United Kingdom (lite buildings)', search: ['United Kingdom lite buildings'],
    // where the tile set is served (the docklandia repository's Pages, same origin as the londat site); the build writes
    // it to --out (default: a docklandia checkout next to this repository, data/gb/uk-lite/)
    tileBase: 'https://danbri.github.io/docklandia/data/gb/uk-lite/', outRepo: 'docklandia', outPath: 'data/gb/uk-lite/',
    // the reader loads it from this far (the whole UK from 300 to 800 km) and frees it beyond free_m
    load_m: 1200000, free_m: 1500000,
    // views named in the README (deep links; ht = heading, tilt)
    views: [{ name: 'The UK from 500 km', ll: '54.5,-3.0,500000', ht: '0,0' }, { name: 'Manchester from 20 km', ll: '53.4794,-2.2453,20000', ht: '0,45' },
      { name: 'Edinburgh from 20 km', ll: '55.9533,-3.1883,20000', ht: '0,45' }, { name: 'Durham Cathedral (700 m)', ll: '54.7735,-1.5765,700', ht: '200,60' },
      { name: 'York Minster (700 m)', ll: '53.9623,-1.0819,700', ht: '200,60' }, { name: 'York from 1.1 km (one box a building)', ll: '53.9620,-1.0793,1100', ht: '0,60' },
      { name: 'Salisbury Cathedral (700 m; spire 123 m from OSM parts)', ll: '51.0651,-1.7973,700', ht: '200,60' }],
    // parts: polygons of the UK skeleton (ONS BGC: English regions, then the countries); a building belongs to the first
    // part whose polygon holds its centroid; one outside every polygon (generalised coast, the England-Wales and
    // England-Scotland edges of two ONS products) to the nearest part within coast_m
    skeleton: 'docklands/data/uk/',
    parts: [
      { code: 'E12000001', layer: 'regions', level: 6 }, { code: 'E12000002', layer: 'regions', level: 6 },
      { code: 'E12000003', layer: 'regions', level: 6 }, { code: 'E12000004', layer: 'regions', level: 6 },
      { code: 'E12000005', layer: 'regions', level: 6 }, { code: 'E12000006', layer: 'regions', level: 6 },
      { code: 'E12000008', layer: 'regions', level: 6 }, { code: 'E12000009', layer: 'regions', level: 6 },
      { code: 'W92000004', layer: 'countries', level: 6 }, { code: 'S92000003', layer: 'countries', level: 6 },
      { code: 'N92000002', layer: 'countries', level: 6 },
    ],
    // drawn by another place (London: kind blocks, the same centroid rule)
    exclude_polygons: [{ code: 'E12000007', layer: 'regions', level: 6, place: 'london' }],
    coast_m: 250,
    // the Republic of Ireland: a building outside every UK polygon inside this Natural Earth country is never taken by
    // the coast rule (the land border of Northern Ireland)
    not_in_countries: { file: 'docklands/data/world/countries.json', iso2: ['IE'] },
    heights: ['world-overture', 'world-ms-buildings', 'world-ghsl'],
    default_height_m: 7,
    lite: {
      outer: 'world-overture-outer', query: 'buildings', ground: 'docklands/data/world-base/',
      columns: 'subtype,class,names.primary,height,num_floors', where: 'is_underground IS NOT TRUE',
      // geometry only for the landmark candidates (fetch-overture-theme.py slim mode; am = area in m2)
      geometry_when: "names.primary IS NOT NULL OR am >= 2000 OR height >= 20 OR class IN ('cathedral', 'castle', 'palace', 'stadium', 'grandstand', 'tower', 'lighthouse', 'windmill')",
      // footprint geometry used (Overture base dataset): OSM and Microsoft (owner, 2026-10-20: "Use ms/overture")
      geometry_classes: { OpenStreetMap: 'osm', 'Microsoft ML Buildings': 'ms' },
      // the landmark rule (README): OSM tags from the QLever OSM endpoint (planet 2026-09-21, the UK relation's
      // containment), joined to the Overture record by its OSM id
      tags: { endpoint: 'https://qlever.dev/api/osm-planet', area_relation: 62149 },
      // landmark heights (owner, 2026-10-22: "Yes do that"; operation place-lite-landmark-heights, module
      // cwplans/tools/place-lite-heights.mjs): OSM building:part heights via Overture's building_part theme (joined by
      // building_id) and Wikidata P2048 (QLever Wikidata, CC0). Rule: a part whose top is above the body by at least
      // max(rise_m, rise_share x body) is drawn as its own prism (at most max_parts a landmark); a Wikidata height above
      // the highest top by the same margin (and at most max_wd_m) is drawn as a spire on the tallest such part (side
      // spire_share x sqrt(its area)), else as a square tower at the centroid (side tower_share x sqrt(footprint), between
      // tower_min_m and tower_max_m); the body keeps its height
      heights: {
        part_columns: 'building_id,height,min_height,roof_shape,roof_height,num_floors', part_where: 'height IS NOT NULL',
        wikidata_endpoint: 'https://qlever.dev/api/wikidata', wikidata_chunk: 5000,
        rule: { rise_m: 3, rise_share: 0.15, max_parts: 64, max_wd_m: 330, spire_share: 0.35, tower_share: 0.2, tower_min_m: 4, tower_max_m: 15 },
      },
      landmark: {
        // (1) an encyclopaedia record: OSM wikidata or wikipedia on the building
        encyclopaedic: true,
        // (2) notable kinds (OSM building=, historic=, man_made=, leisure= on the building; Overture class)
        building: ['cathedral', 'castle', 'palace', 'stadium', 'grandstand', 'tower', 'lighthouse', 'windmill'],
        historic: ['castle', 'palace', 'fort', 'tower', 'monastery', 'abbey', 'city_gate'],
        man_made: ['tower', 'lighthouse', 'windmill', 'water_tower'],
        leisure: ['stadium'],
        // (3) named and big or tall: a name and (height >= tall_m from a measured source: OSM, Microsoft, Overture; not
        // the GHSL cell mean nor a default) or footprint >= big_m2
        named_tall_m: 25, named_big_m2: 3000,
        min_area_m2: 20,
      },
      top_level: 7, leaf_level: 11,
      // coarse levels: landmarks at least tall_m or big_m2 as their own boxes (card by id); everything else one box per
      // square of merge_m (side grown with the built share, full at full_share; height = area-weighted mean). err_m of
      // level 10 sets where the leaves (one box a building) are drawn: within about err_m x 731 / 24 m of the tile on a
      // phone (MAX_SSE 24 px), 160 m -> about 5 km, where a 10 m house is still about 1.5 px wide
      levels: { 7: { tall_m: 150, big_m2: 150000, merge_m: 1600, err_m: 2560 }, 8: { tall_m: 90, big_m2: 60000, merge_m: 800, err_m: 1280 },
        9: { tall_m: 60, big_m2: 25000, merge_m: 400, err_m: 640 }, 10: { tall_m: 40, big_m2: 10000, merge_m: 200, err_m: 160 } },
      // the leaves (level 11, about 9.8 x 5.6 km at 55 N): every landmark as its outline (simplified at simplify_m) with
      // its id; every other building as its own box (place-lite.mjs compactBoxes). town_m: the atoms of place-lite-select
      // (200 m squares, its counts); rural_m and town_share: the leaf rule of place-lite-tiles 2 (not used since version 3)
      leaf: { town_m: 200, rural_m: 400, town_share: 0.08, simplify_m: 1.5 },
      // far forms (place-lite-tiles 5, 2026-10-23, issue #13: from 20 km a town read as a lattice of squares; three options
      // measured, this one chosen): the coarse levels draw real buildings and street blocks at their true positions instead
      // of merged squares (place-lite.mjs streetBlocks: oriented boxes within gap_m and heights within max(h_abs_m, h_rel x
      // the taller) are one block, cut while they fill less than fill_min of it); each level draws the blocks whose seen
      // size sqrt(area) x max(sqrt(area), height) is at least min_m2 = (far end of its range / 1462 m)^2, about one device
      // pixel squared on a phone (level 10 drawn to about 19.5 km, 9 to 39 km, 8 to 78 km, 7 beyond). merge_m above is
      // used only without far (the squares of place-lite-tiles 3 and 4)
      far: { gap_m: 5, fill_min: 0.4, h_rel: 0.35, h_abs_m: 3, min_m2: { 7: 11400, 8: 2850, 9: 712, 10: 178 } },
      grid_n: 17,   // the ground grid of a tile's compact boxes (n x n)
      full_share: 0.5, drop_m: 8,   // (full_share: 0.35 until place-lite-tiles 3; 0.5 leaves street gaps between the turned squares)
      // (drop_m: bases deeper than London's 3 m: the globe's ground away from the world-base tiles is a 9.8 km texture drawn by 2.4 km patches)
      // external tile sets: the root holds levels 7 and 8; each level-8 cell's subtree (levels 9 to 11) is its own
      // tileset.json (3D Tiles 1.1 external tileset), fetched when the view needs it
      external_from: 9,
      colour: '#d6cbb6',
    },
  },
  services: { weatherPoint: { lon: -2.5, lat: 54.4 }, aircraft: { lon: -0.02, lat: 51.505, nm: 25 }, metar: 'EGLL' },
  adapters: [
    { id: 'world-base', area: 'worldwide', about: 'OSM / Overture buildings, Copernicus DEM, Natural Earth', licence: 'per source', licenceClass: 'open', fallback: 'none (this is the fallback)' },
    overture, msBuildings, ghsl, overtureOuter,
  ],
};
