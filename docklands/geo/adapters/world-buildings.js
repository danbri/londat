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
// The number of floors of Overture records whose own num_floors source is one named dataset with an EMPTY licence field
// (León: "Instituto Geográfico Nacional (España)", 1,009 buildings of the core), kept apart from world-overture so it
// can be removed: owner, 2026-10-20: "use the data but keep it distinct and easy to remove if requested. Use for
// validation at least". The switch: this adapter's id in the region's `place.heights` (remove it, delete
// sources/overture-ign-floors.json, rebuild). Its height class is "overture-ign-floors", after the national floors.
export const overtureIgnFloors = {
  id: 'overture-ign-floors', area: 'Spain', status: 'in use behind the region switch (place.heights); also a validation set (F55)',
  about: 'num_floors of Overture buildings records whose num_floors source is "Instituto Geográfico Nacional (España)" (Overture gives no licence for them)',
  licence: 'not stated (the Overture sources entry has an empty licence field); IGN data are generally CC BY 4.0, not confirmed for these records',
  licenceClass: 'review', approved: 'owner, 2026-10-20: "use the data but keep it distinct and easy to remove if requested. Use for validation at least"',
  fallback: 'world-overture (heights and floors with an open licence)',
  buildingHeights: {
    kind: 'overture-dataset-floors', source: 'overture-ign-floors', label: 'overture-ign-floors', from: 'world-overture',
    dataset: 'Instituto Geográfico Nacional (España)', min_area_ratio: 0.5, storey_m: 3,
    credit: 'Number of floors of some buildings from the Instituto Geográfico Nacional (España) via Overture Maps (licence not stated; kept apart, under review)',
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
