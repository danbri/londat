// Region config: the United Kingdom outside Greater London as a LITE building set on the globe (owner, 2026-10-22, about
// buildings for the whole UK: "can we pick a lite subset or slice somehow? Key landmarks, modest resolution?"). Pure data;
// read through region(). A place of kind "lite": no core and no ground of its own (as London's "blocks"); two classes:
//   (a) landmarks: buildings named by a stated rule (below), each with its own outline, id and card;
//   (b) the merged mass: every other building (OpenStreetMap and Microsoft footprints) only as one box a square
//       (200 m squares in towns, 400 m elsewhere at the leaves; 800 m to 6.4 km at the coarse levels).
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
      { name: 'York Minster (700 m)', ll: '53.9623,-1.0819,700', ht: '200,60' }],
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
      tags: { endpoint: 'https://qlever.cs.uni-freiburg.de/api/osm-planet', area_relation: 62149 },
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
      // square of merge_m (side grown with the built share, full at full_share; height = area-weighted mean)
      levels: { 7: { tall_m: 150, big_m2: 150000, merge_m: 6400, err_m: 4800 }, 8: { tall_m: 90, big_m2: 60000, merge_m: 3200, err_m: 2400 },
        9: { tall_m: 60, big_m2: 25000, merge_m: 1600, err_m: 1200 }, 10: { tall_m: 40, big_m2: 10000, merge_m: 800, err_m: 600 } },
      // the leaves (level 11, about 9.8 x 5.6 km at 55 N): every landmark as its outline (simplified at simplify_m) with
      // its id; the mass in 200 m squares where a 400 m square is a town (built share >= town_share), else 400 m
      leaf: { town_m: 200, rural_m: 400, town_share: 0.08, simplify_m: 1.5 },
      full_share: 0.35, drop_m: 8,   // (bases deeper than London's 3 m: the globe's ground away from the world-base tiles is a 9.8 km texture drawn by 2.4 km patches)
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
