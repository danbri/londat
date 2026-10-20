// Worldwide adapters for the city and the surroundings of a place (cwplans/tools/build-place-tiles.mjs, the operations
// place-select-outer, place-city-heights and place-lod; skill docklands-3d-page, "Three.js port: places, city and
// surroundings by level of detail (2026-10-20)"). Pure data, named by a region config's `place.surround` block.
//   world-worldcover: ESA WorldCover 10 m 2021 v200 land cover (CC BY 4.0), 3 x 3 degree Cloud Optimized GeoTIFFs on the
//     AWS open data registry, read as one window by HTTP range requests; it colours the ground texture of the
//     surroundings (trees, shrubs, grass, crops, built-up, bare, water, wetland).
//   world-overture-outer: Overture Maps themes read by bounding box with DuckDB (cwplans/tools/fetch-overture-theme.py):
//     road and rail segments, water, localities (divisions), peaks (base land), and the buildings of the city box. Only
//     records whose own source is OpenStreetMap are used for geometry (OSM data, ODbL, allowed since 2026-10-03); other
//     building sources give heights only, as in the core (world-buildings.js).
export const worldcover = {
  id: 'world-worldcover', area: 'worldwide', status: 'in use (ground colours of the surroundings)',
  about: 'ESA WorldCover 10 m 2021 v200: 11 land cover classes from Sentinel-1 and Sentinel-2',
  licence: 'CC BY 4.0', licenceClass: 'open', fallback: 'the globe colours by height',
  landCover: {
    kind: 'cog-tiles', source: 'esa-worldcover', tile_deg: 3,
    url: 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif',
    // class -> ground colour (sRGB) of the texture
    colours: { 10: '#4c6b3a', 20: '#8a8a52', 30: '#a3ab6c', 40: '#c8bf86', 50: '#a39b8f', 60: '#bdb3a0', 70: '#f2f2f2', 80: '#4f86ab', 90: '#6f9a8a', 95: '#3f6e4f', 100: '#b5b08a' },
    credit: 'Land cover © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium (CC BY 4.0)',
  },
};
export const overtureOuter = {
  id: 'world-overture-outer', area: 'worldwide', status: 'in use (roads, rail, water, place names, peaks, city buildings of the surroundings)',
  about: 'Overture Maps Foundation themes transportation (segment), base (water, land), divisions (division), buildings (building), one release, read by bounding box with DuckDB',
  licence: 'ODbL 1.0 (OpenStreetMap-derived records; the record sources list names each source and licence)', licenceClass: 'share-alike', fallback: 'none (the globe skeleton)',
  outer: {
    release: '2026-09-23.1', script: 'cwplans/tools/fetch-overture-theme.py', python: 'CWPLANS_DUCKDB_PYTHON',
    // what each query keeps (`box`: surround or city); columns are SQL expressions written as JSON
    queries: {
      roads: { theme: 'transportation', type: 'segment', box: 'surround', columns: 'subtype,class,names.primary,names.common,road_flags,rail_flags',
        where: "(subtype = 'road' AND class IN ('motorway','trunk','primary','secondary','tertiary')) OR subtype = 'rail'" },
      streets: { theme: 'transportation', type: 'segment', box: 'city', columns: 'subtype,class,names.primary,road_flags',
        where: "subtype = 'road' AND class IN ('residential','unclassified','living_street','pedestrian','service')" },
      water: { theme: 'base', type: 'water', box: 'surround', columns: 'subtype,class,names.primary,names.common,is_intermittent', where: '' },
      places: { theme: 'divisions', type: 'division', box: 'surround', columns: 'subtype,class,names.primary,names.common,population,cartography',
        where: "subtype IN ('locality','localadmin','borough','macrohood','neighborhood','microhood')" },
      peaks: { theme: 'base', type: 'land', box: 'surround', columns: 'subtype,class,names.primary,names.common,elevation', where: "class IN ('peak','volcano','saddle') AND names.primary IS NOT NULL" },
      buildings: { theme: 'buildings', type: 'building', box: 'city', columns: 'subtype,class,height,num_floors,min_height,roof_shape,roof_height,has_parts,is_underground', where: 'is_underground IS NOT TRUE' },
    },
    geometry_sources: ['OpenStreetMap'],
    credit: 'Roads, rail, water, place names and city buildings: OpenStreetMap data via Overture Maps © OpenStreetMap contributors, © Overture Maps Foundation (ODbL 1.0)',
  },
};
