// Region config: Greater London, United Kingdom, as basic buildings on the globe (owner, 2026-10-22: "can we bring basic
// buildings to all of London, or all of UK now?"; GitHub Pages for now, owner 2026-10-20). Pure data; read through region().
// A place of kind "blocks": no core of its own and no ground of its own. The globe's terrain and imagery stay; the tile set
// holds only flat-topped building blocks (cwplans/tools/build-place-tiles.mjs, operations place-select-blocks,
// place-city-heights, place-blocks; skill docklands-3d-page, "Three.js port: Greater London as blocks (2026-10-22)").
// Origin: Charing Cross (the statue of Charles I, the point from which distances to London are measured; OSM, ODbL,
// 51.50735 N 0.12776 W). h: about 13 m above sea level plus a geoid height of about 45.6 m (stated, +-5 m).
import ghsl from '../adapters/world-ghsl.js';
import { overture, msBuildings } from '../adapters/world-buildings.js';
import { overtureOuter } from '../adapters/world-surround.js';

export default {
  id: 'london',
  name: 'Greater London',
  origin: { lon: -0.12776, lat: 51.50735, h: 58.6 },
  // the bounding box of the ONS region E12000007 (London) in the UK skeleton (layers/regions/6/63-50.json, BGC)
  bbox: [-0.5102, 51.2868, 0.334, 51.6919],
  timeZone: 'Europe/London',
  locale: 'en-GB',
  locales: ['en-GB'],
  heightDatum: 'ellipsoid',
  // kind 'blocks': the buildings of the boundary polygon as blocks by level of detail, on the globe's own ground (the
  // world-base height tiles the globe draws, plus the globe's geoid); boundary: a polygon of a skeleton set (the GLA
  // area = the ONS region "London"); exclude: regions whose model draws its own buildings (a building whose centroid is in
  // the Docklands model box is left to the model, by the model's own rule: build-docklands.mjs keeps a building whose
  // centroid is inside the box, 1 m in); geometry: OpenStreetMap records of the Overture buildings theme only; heights:
  // OSM height > OSM levels x 3 m > Overture height or floors of non-OSM records with an open licence > Microsoft >
  // GHSL cell mean > default (place-heights order, no national source in the UK yet: EA LiDAR is for the model box).
  place: {
    kind: 'blocks', label: 'Greater London', search: ['Greater London'],
    boundary: { skeleton: 'docklands/data/uk/', layer: 'regions', level: 6, code: 'E12000007' },
    exclude: ['docklands'],
    // views named in the README (deep links; ht = heading, tilt)
    views: [{ name: 'The West End and the City from Holborn (3 km)', ll: '51.5175,-0.1180,3000', ht: '60,55' }, { name: 'Croydon (2 km)', ll: '51.3762,-0.0982,2000', ht: '0,55' }, { name: 'BT Tower (700 m)', ll: '51.5215,-0.1389,700', ht: '200,60' }],
    heights: ['world-overture', 'world-ms-buildings', 'world-ghsl'],
    default_height_m: 7,
    blocks: {
      // the Overture query (the adapter's buildings query with the name added), the globe's ground (world-base height tiles)
      outer: 'world-overture-outer', query: 'buildings', ground: 'docklands/data/world-base/',
      columns: 'subtype,class,names.primary,height,num_floors,min_height,roof_shape,has_parts,is_underground', where: 'is_underground IS NOT TRUE',
      // height values of non-OSM records by dataset: Microsoft ML Buildings heights come through Overture (the same
      // Microsoft data as the world-ms-buildings quadkey files, no separate download) and count as class 'ms'
      footprint_classes: { 'Microsoft ML Buildings': 'ms' },
      drop_m: 3,   // block bases this far under the lowest ground sample (the globe draws its terrain from coarser levels far away)
      top_level: 10, leaf_level: 14,
      // what each level draws: buildings at least big_m2 or tall_m as their own oriented boxes; the rest merged into one
      // box per square of merge_m (its footprint the sum of their areas, its height their area-weighted mean); the leaf
      // level every building of min_area_m2 or more (an oriented box, or the outline simplified at simplify_m)
      levels: { 10: { tall_m: 60, big_m2: 20000, merge_m: 400, err_m: 300 }, 11: { tall_m: 40, big_m2: 8000, merge_m: 200, err_m: 150 },
        12: { tall_m: 25, big_m2: 3000, merge_m: 100, err_m: 75 }, 13: { tall_m: 18, big_m2: 600, merge_m: 50, err_m: 35 } },
      min_area_m2: 25, simplify_m: 2.5, box_fill: 0.85, outline_min_m2: 300,
      // named buildings of at least named_min_m2 or named_min_h_m: drawn at the leaf level with their own id (the card names
      // them; features.json holds them for search and the text interface)
      named_min_m2: 400, named_min_h_m: 15,
    },
  },
  services: { weatherPoint: { lon: -0.12776, lat: 51.50735 }, aircraft: { lon: -0.12776, lat: 51.50735, nm: 25 }, metar: 'EGLC' },
  adapters: [
    { id: 'world-base', area: 'worldwide', about: 'OSM / Overture buildings, Copernicus DEM, Natural Earth', licence: 'per source', licenceClass: 'open', fallback: 'none (this is the fallback)' },
    overture, msBuildings, ghsl, overtureOuter,
  ],
};
