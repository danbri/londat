// Region config: central Dublin, Ireland (Baile Átha Cliath). Owner, 2026-10-22: "I'll like to add some information
// (bulk data in docklandia repo pls.) for more cities and countries. Ireland: Dublin especially". Pure data; read through
// region() (docklands/geo/region.js). Origin: O'Connell Bridge over the Liffey (OSM, ODbL; checked 2026-10-22). h:
// approximate ellipsoidal height (ground about 3 m above Malin Head datum plus a geoid height of about 57 m; stated, +-5 m).
// Locales: en-IE and ga (Irish). Irish is written in the Latin script, so the Latin-script rule (geo/script.js) keeps both:
// OSM `name` (mostly English in Dublin) first and `name:ga` beside it where they differ ("Grafton Street (Sráid
// Grafton)"); a Latin-script second name is never dropped (globe/places.js nameText, globe/landmarks.js shownName).
// The place's files are bulky: they live in the docklandia repository (place.outRepo, outPath; served at place.tileBase,
// the same origin as the londat site). The tool writes them to --out (a docklandia checkout); londat keeps only the
// index entries (places/index.json, greens.json, landmarks.json) and this config.
// Skill docklands-3d-page, "Three.js port: Dublin (2026-10-22)".
import ghsl from '../adapters/world-ghsl.js';
import { overture, msBuildings } from '../adapters/world-buildings.js';
import { worldcover, overtureOuter, msGeometry } from '../adapters/world-surround.js';

export default {
  id: 'dublin',
  name: 'Central Dublin',
  origin: { lon: -6.25916, lat: 53.34725, h: 60 },
  bbox: [-6.2975, 53.3335, -6.2265, 53.3555],
  timeZone: 'Europe/Dublin',
  locale: 'en-IE',
  locales: ['en-IE', 'ga'],
  heightDatum: 'ellipsoid',
  place: {
    // the core: a rectangle (core_bbox, instead of a size_m square round the origin) along both banks of the Liffey from
    // Heuston Station to the Docklands and Grand Canal Dock, Trinity College, Temple Bar and O'Connell Street to Parnell
    // Square; cut by the geodetic quadtree at level 15 (cells whose centre is inside)
    core_bbox: [-6.2975, 53.3335, -6.2265, 53.3555], level: 15,
    // terrain of the core: the OPW 2 m LiDAR DTM (bare earth) through Geological Survey Ireland; the city and the
    // surroundings: Copernicus GLO-30 (the adapter's dem.surround block)
    dem: 'ie-gsi-lidar',
    heights: ['world-overture', 'world-ms-buildings', 'world-ghsl'],
    names: ['name', 'name:en'], alt_names: ['name:ga'],
    label: "O'Connell Bridge, Dublin",
    search: ["O'Connell Bridge", "O'Connell Street", 'Temple Bar', 'Trinity College', 'Liffey', 'Dublin', 'Baile Átha Cliath'],
    // where the bulky files are served (docklandia repository, its own Pages; the same origin as the londat site)
    tileBase: 'https://danbri.github.io/docklandia/data/ie/dublin/', outRepo: 'docklandia', outPath: 'data/ie/dublin/',
    // views named in the README and the skill (deep links; ht = heading, tilt)
    views: [{ name: 'The Liffey core (1.5 km)', ll: '53.34725,-6.25916,1500', ht: '0,55' }, { name: 'The city (20 km)', ll: '53.34725,-6.25916,20000', ht: '0,45' },
      { name: 'Dublin Bay (40 km)', ll: '53.30,-6.10,40000', ht: '300,50' }, { name: 'The Spire and O\'Connell Street (600 m)', ll: '53.34980,-6.26031,600', ht: '200,65' },
      { name: 'Poolbeg chimneys (2 km)', ll: '53.3405,-6.1895,2000', ht: '270,60' }],
    // city: Dublin City and the built-up area of County Dublin (Swords to Bray, Lucan and Tallaght to Howth), drawn as
    // blocks; surround: terrain, land cover, roads, rail, water, place names and peaks to about 35 km (Dublin Bay, Howth,
    // Lambay, the Dublin and Wicklow mountains)
    city: { bbox: [-6.45, 53.21, -6.05, 53.46] },
    surround: { size_m: 70000, top_level: 10, refine: [[30000, 11], [16000, 12], [9000, 13]], land_cover: 'world-worldcover', outer: 'world-overture-outer',
      // extra building geometry classes of the city ring, each removable by deleting its id here (then rebuild)
      geometry: ['overture-ms-geometry'] },
    // landmarks (cwplans/tools/build-place-landmarks.mjs): church towers and spires, clock towers, and the tall thin
    // objects of the skyline from OSM tags with a height (the Spire, the Poolbeg chimneys, the Wellington Monument);
    // no estimated class here (estimate_minarets: false)
    landmarks: { box: 'city', estimate_minarets: false, tile_level: 13,
      // candidates (positions) from the QLever OSM endpoint over the country relation (Ireland, OSM relation 62273)
      tall_objects: { min_height_m: 25, man_made: ['chimney', 'obelisk', 'tower', 'monument', 'mast'], historic: ['monument', 'memorial'], exclude_tower_types: ['communication', 'cooling', 'lighting'],
        endpoint: 'https://qlever.dev/api/osm-planet', area_relation: 62273 },
      minaret_rule: { classes: [{ id: 'S', max_area_m2: 150, height_m: 15, base_d_m: 2.5 }, { id: 'M', max_area_m2: 500, height_m: 25, base_d_m: 3 }, { id: 'L', max_area_m2: 1e9, height_m: 35, base_d_m: 3.5 }],
        serefe_frac: 0.72, cap_frac: 0.2, corner_bearing_from_qibla: 135 } },
    // look and greens (globe/place-look.js, cwplans/tools/build-place-greens.mjs): stated assumptions, not data. look: red
    // and brown brick Georgian and Victorian terraces, granite and Portland stone civic buildings, rendered and pebble-dash
    // suburbs, concrete and glass offices in the Docklands; Welsh slate on pitched roofs. greens.mix: street lime, plane
    // and London plane, cherry and rowan; park beech, oak, horse chestnut, sycamore; woods ash, oak, sycamore, conifer;
    // willow and alder on the Liffey, the Dodder and the Tolka
    look: { wall: { house: { brickRed: 35, brickBrown: 20, renderCream: 15, renderWhite: 15, renderPastel: 10, stone: 5 }, flats: { brickRed: 30, brickBrown: 25, renderWhite: 15, concrete: 15, renderCream: 10, stone: 5 },
        estate: { brickBrown: 35, concrete: 35, renderWhite: 20, brickRed: 10 }, office: { concrete: 30, glassS: 25, stone: 25, brickRed: 10, renderWhite: 10 }, civic: { stone: 60, brickRed: 25, renderCream: 15 }, shed: { metal: 55, concrete: 30, brickBrown: 15 } },
      roof_pitched: { slate: 75, ctile: 15, clay: 10 }, roof_flat: { felt: 40, gravel: 30, membrane: 30 } },
    greens: { mix: { street: [['lime', 25], ['plane', 20], ['cherry', 12], ['maple', 10], ['rowan', 8], ['birch', 8], ['whitebeam', 7], ['hornbeam', 5], ['ash', 5]],
      park: [['beech', 15], ['oak', 15], ['horse-chestnut', 12], ['sycamore', 12], ['lime', 10], ['ash', 8], ['conifer', 8], ['holly', 5], ['birch', 5], ['hawthorn', 5], ['alder', 5]],
      wood: [['ash', 25], ['oak', 20], ['sycamore', 20], ['beech', 15], ['conifer', 10], ['birch', 10]], water: [['willow', 40], ['alder', 35], ['ash', 15], ['poplar', 10]] } },
    // roof_rule: the Georgian and Victorian terraces of the core have pitched slate roofs behind parapets; small detached
    // buildings get a gabled roof (counted as "rule")
    roof_rule: { shape: 'gabled', pitch_deg: 35, kinds: ['house', 'terrace', 'detached', 'semidetached_house', 'church', 'chapel'], min_rect: 0.8, max_area_m2: 400, max_wall_m: 15 } },
  services: { weatherPoint: { lon: -6.25916, lat: 53.34725 }, aircraft: { lon: -6.25916, lat: 53.34725, nm: 25 }, metar: 'EIDW' },
  adapters: [
    { id: 'world-base', area: 'worldwide', about: 'OSM / Overture buildings, Copernicus DEM, Natural Earth', licence: 'per source', licenceClass: 'open', fallback: 'none (this is the fallback)' },
    { id: 'ie-gsi-lidar', status: 'in use (terrain of the core: OPW 2 m LiDAR DTM tiles through Geological Survey Ireland)', area: 'Ireland (coverage of the OPW National Flood surveys and others: cities, coasts and rivers)',
      about: 'Geological Survey Ireland open topographic LiDAR data: 2 x 2 km GeoTIFF tiles of the OPW National Flood surveys (NASC, 2011; DTM and DSM, 2 m, Irish Transverse Mercator, heights above Malin Head), listed by an ArcGIS coverage layer whose rows hold the download URL and the licence',
      licence: 'CC BY 4.0 (the attribution statement of each tile: "Contains Irish Public Sector Data (Geological Survey Ireland & the Office of Public Works) licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence.")',
      licenceClass: 'open', crs: { horizontal: 'IRENET95 / Irish Transverse Mercator (EPSG:2157)', vertical: 'Malin Head (orthometric)' }, fallback: 'world-base (Copernicus GLO-30)',
      dem: { kind: 'arcgis-tile-zips', source: 'gsi-opw-lidar-dtm',
        index: 'https://gsi.geodata.gov.ie/server/rest/services/Lidar/IE_GSI_LiDAR_Coverage_OPW_NASC_IE26_ITM/FeatureServer/3/query', url_field: 'DATA_URL', licence_field: 'LICENCE',
        member: /_DTM\.tif$/.source, proj4: '+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=0.99982 +x_0=600000 +y_0=750000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', res_m: 5,
        datum: 'orthometric, Malin Head (IRENET95 taken as WGS84)', credit: 'Terrain of the core: Contains Irish Public Sector Data (Geological Survey Ireland & the Office of Public Works) licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence',
        // the city and the surroundings: Copernicus DEM GLO-30 (a surface model), 1 x 1 degree COGs on the AWS open data registry
        surround: { kind: 'copernicus-glo30', source: 'copernicus-glo30', url: 'https://copernicus-dem-30m.s3.amazonaws.com/', res_m: 30, datum: 'EGM2008 orthometric (a surface model, DSM)',
          credit: 'Copernicus DEM GLO-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA' } } },
    { id: 'ie-tailte', status: 'not used (2026-10-22)', area: 'Ireland',
      about: 'Tailte Éireann (formerly Ordnance Survey Ireland) open data on data.gov.ie: boundaries, the National Placenames Gazetteer, the 1:250k and 1:1M maps. No building heights or footprints in the open set (PRIME2 buildings are licensed, not open)',
      licence: 'CC BY 4.0 for the open datasets (data.gov.ie)', licenceClass: 'open', fallback: 'world-base (OSM, Overture)' },
    overture, msBuildings, ghsl, worldcover, overtureOuter, msGeometry,
  ],
};
