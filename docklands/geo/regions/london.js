// Region config: Greater London, United Kingdom, as basic buildings on the globe (owner, 2026-10-22: "can we bring basic
// buildings to all of London, or all of UK now?"; GitHub Pages for now, owner 2026-10-20). Pure data; read through region().
// A place of kind "blocks": no core of its own and no ground of its own. The globe's terrain and imagery stay; the tile set
// holds only flat-topped building blocks (cwplans/tools/build-place-tiles.mjs, operations place-select-blocks,
// place-city-heights, place-blocks; skill docklands-3d-page, "Three.js port: Greater London as blocks (2026-10-22)").
// Origin: Charing Cross (the statue of Charles I, the point from which distances to London are measured; OSM, ODbL,
// 51.50735 N 0.12776 W). h: about 13 m above sea level plus a geoid height of about 45.6 m (stated, +-5 m).
import ghsl from '../adapters/world-ghsl.js';
import { overture, msBuildings } from '../adapters/world-buildings.js';
import { overtureOuter, msGeometry } from '../adapters/world-surround.js';

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
  // centroid is inside the box, 1 m in); geometry: OpenStreetMap records of the Overture buildings theme, and Microsoft ML
  // Buildings records where OSM has none (blocks.geometry, the class 'ms'); heights:
  // OSM height > OSM levels x 3 m > Overture height or floors of non-OSM records with an open licence > Microsoft >
  // GHSL cell mean > default (place-heights order, no national source in the UK yet: EA LiDAR is for the model box).
  place: {
    kind: 'blocks', label: 'Greater London', search: ['Greater London'],
    boundary: { skeleton: 'docklands/data/uk/', layer: 'regions', level: 6, code: 'E12000007' },
    exclude: ['docklands'],
    // views named in the README (deep links; ht = heading, tilt)
    views: [{ name: 'Holborn and the West End (3 km; the City east of it is in the model box)', ll: '51.5175,-0.1180,3000', ht: '250,55' }, { name: 'Croydon (2 km)', ll: '51.3762,-0.0982,2000', ht: '0,55' }, { name: 'BT Tower (700 m)', ll: '51.5215,-0.1389,700', ht: '200,60' }],
    heights: ['world-overture', 'world-ms-buildings', 'world-ghsl'],
    default_height_m: 7,
    blocks: {
      // the Overture query (the adapter's buildings query with the name added), the globe's ground (world-base height tiles)
      outer: 'world-overture-outer', query: 'buildings', ground: 'docklands/data/world-base/',
      columns: 'subtype,class,names.primary,height,num_floors,min_height,roof_shape,has_parts,is_underground', where: 'is_underground IS NOT TRUE',
      // height values of non-OSM records by dataset: Microsoft ML Buildings heights come through Overture (the same
      // Microsoft data as the world-ms-buildings quadkey files, no separate download) and count as class 'ms'
      footprint_classes: { 'Microsoft ML Buildings': 'ms' },
      // extra building geometry classes, drawn only where OSM has no building (owner, 2026-10-22: Microsoft footprints in
      // London "yes"); each removable by deleting its id here (then rebuild), as place.surround.geometry in leon.js
      geometry: ['overture-ms-geometry'],
      drop_m: 3,   // block bases this far under the lowest ground sample (the globe draws its terrain from coarser levels far away)
      // (since place-blocks 4, 2026-10-22, owner: "Yes, do all of London eventually": the UK lite v2 way) leaf_boxes
      // 'compact': at the leaves (level 13, about 1.5 x 2.4 km) every building that is not named is one 8-byte compact box
      // (layout cwplans-boxes-1: its true centroid, footprint area, the angle and long / short ratio of its rotated
      // rectangle, its height and height source, its class), the named ones keep their outlines and ids; the coarse
      // levels draw the tall or big buildings as boxes and the rest as one compact square a merge_m square, turned to the
      // grain of its buildings, its side from the built share (full at full_share, the UK lite rule).
      // Where the leaves show: a tile is refined while geometricError x K / distance > 24 (places.js MAX_SSE; K about 731
      // on a phone held upright, 693 on a 1280 x 800 screen), so err_m 420 at level 12 draws the leaves within about 12 to
      // 13 km of the eye (straight down from 11 km all of the view); leaf_within_m caps it on big screens and keeps the
      // turned squares in oblique whole-city views (the parents of the leaves are refined only within it).
      // leaf_outlines (place-blocks 5, 2026-10-22; architecture rule 6: no capability dropped for size): the place-blocks 3
      // leaf rule stays: a building of outline_min_m2 or more that fills less than box_fill of its oriented box (L shapes,
      // irregular blocks) is drawn as its outline simplified at simplify_m, not as a compact box
      leaf_boxes: 'compact', leaf_outlines: true, full_share: 0.5, grid_n: 17, leaf_within_m: 13000,
      history: 'place-blocks 3 (build of 2026-10-21, tileset london-1): 2,451 tiles, 110.62 MB in all (levels 10 to 14: 0.38, 1.31, 4.42, 14.35, 86.26 MB; the leaves: instance boxes, simplified outlines and their JSON block data, about 62 bytes a building); merged axis-aligned squares of 400 / 200 / 100 / 50 m at levels 10 to 13, so from 11 km a field of grey squares and every building only below about 2.5 km.',
      top_level: 10, leaf_level: 13,
      // what each coarse level draws: buildings at least big_m2 or tall_m as their own oriented boxes; the rest one
      // compact square of merge_m (its footprint the sum of their areas, its height their area-weighted mean)
      levels: { 10: { tall_m: 60, big_m2: 20000, merge_m: 400, err_m: 1680 }, 11: { tall_m: 40, big_m2: 8000, merge_m: 200, err_m: 840 },
        12: { tall_m: 25, big_m2: 3000, merge_m: 100, err_m: 420 } },
      // (place-blocks 3, until 2026-10-22: leaf_level 14; levels 10 to 13 merged axis-aligned squares of 400 / 200 / 100 /
      // 50 m, err_m 300 / 150 / 75 / 35, so from 11 km the view was a field of grey squares; the leaves drew boxes and
      // simplified outlines: 86 MB of the 110.6 MB)
      min_area_m2: 25, simplify_m: 2.5, box_fill: 0.85, outline_min_m2: 300,   // (the leaf outline rule: leaf_outlines above)
      // named buildings of at least named_min_m2 or named_min_h_m: drawn at the leaf level with their own id (the card names
      // them; features.json holds them for search and the text interface)
      named_min_m2: 1500, named_min_h_m: 20,
    },
  },
  services: { weatherPoint: { lon: -0.12776, lat: 51.50735 }, aircraft: { lon: -0.12776, lat: 51.50735, nm: 25 }, metar: 'EGLC' },
  adapters: [
    { id: 'world-base', area: 'worldwide', about: 'OSM / Overture buildings, Copernicus DEM, Natural Earth', licence: 'per source', licenceClass: 'open', fallback: 'none (this is the fallback)' },
    overture, msBuildings, ghsl, overtureOuter, msGeometry,
  ],
};
