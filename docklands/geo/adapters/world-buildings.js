// Worldwide building adapters with footprints: Overture Maps buildings and Microsoft Global ML Building Footprints. Pure
// data, used by a region config whose `place.heights` names them (cwplans/tools/build-place-tiles.mjs): an OSM building
// with no OSM height or levels (and no national floors) takes the height, floors or roof of the footprint that matches
// it (the centroid of one inside the other and the smaller area at least `min_area_ratio` of the larger). Both are ODbL
// 1.0 (share-alike), allowed by the owner on 2026-10-20 ("Use ms/overture"; CLAUDE.md, data policy) and registered as
// share-alike next to OSM. Overture records carry a `sources` list with a licence per property: only the licences in
// `licences` are used; an OSM-sourced value is skipped (our own OSM extract is the first source already).
// Skill docklands-3d-page, "Three.js port: places as 3D Tiles".
export const overture = {
  id: 'world-overture', area: 'worldwide', status: 'in use (heights, floors, roofs of non-OSM records)',
  about: 'Overture Maps Foundation buildings theme (GeoParquet, one release), read by bounding box with DuckDB',
  licence: 'ODbL 1.0 (buildings theme; per record: the licence of each source in its sources list)', licenceClass: 'share-alike',
  fallback: 'world-ms-buildings, then world-ghsl',
  buildingHeights: {
    kind: 'overture-buildings', source: 'overture-buildings', label: 'overture', release: '2026-09-23.1',
    script: 'cwplans/tools/fetch-overture-buildings.py', python: 'CWPLANS_DUCKDB_PYTHON',
    licences: ['ODbL-1.0', 'CDLA-Permissive-2.0', 'CDLA-Permissive-1.0', 'CC-BY-4.0', 'CC0-1.0'], min_area_ratio: 0.5, top_includes_roof: true,
    credit: 'Building heights and floors from Overture Maps buildings © Overture Maps Foundation (ODbL 1.0; includes data © Microsoft, © OpenStreetMap contributors and others per record)',
  },
};
export const msBuildings = {
  id: 'world-ms-buildings', area: 'worldwide', status: 'in use (heights where given)',
  about: 'Microsoft Global ML Building Footprints (release of 2026-02-03): one gzip GeoJSON-lines file per zoom-9 quadkey; height in metres (-1 = none)',
  licence: 'ODbL 1.0', licenceClass: 'share-alike', fallback: 'world-ghsl',
  buildingHeights: {
    kind: 'ms-buildings', source: 'ms-buildings', label: 'ms',
    links: 'https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv', zoom: 9, min_area_ratio: 0.5, top_includes_roof: true,
    credit: 'Building heights from Microsoft Global ML Building Footprints © Microsoft (ODbL 1.0)',
  },
};
