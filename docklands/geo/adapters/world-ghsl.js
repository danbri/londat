// Worldwide adapter "world-ghsl": GHS-BUILT-H R2023A (European Commission, Joint Research Centre, Global Human Settlement
// Layer), the average net building height (ANBH) of each 3 arc-second cell (about 90 x 65 m at 44 N) for the epoch 2018,
// derived from AW3D30, SRTM30 and a Sentinel-2 composite. Pure data, used by any region config whose `place.heights`
// names it (cwplans/tools/build-place-tiles.mjs, kind `ghsl-raster`): an OSM building with no height, no
// building:levels and no national floors takes the ANBH of the cell under its centroid (a cell AVERAGE, not a measure of
// that building: tall buildings come out too low, sheds too high). Licence CC BY 4.0 (copyright.txt in the JRC folder).
// The tiles are 10 x 10 degrees on a grid offset by 9.5 pixels (west edge of column 1 = -180.0079167, north edge of
// row 1 = 89.0995833; read from the R5_C20 tile on 2026-10-20). Skill docklands-3d-page, "Three.js port: places as 3D Tiles".
export default {
  id: 'world-ghsl', area: 'worldwide', status: 'in use (building heights where OSM and national data have none)',
  about: 'GHS-BUILT-H R2023A average net building height, 3 arc-second grid (EPSG:4326), epoch 2018 (JRC GHSL)',
  licence: 'CC BY 4.0 (Commission Decision 2011/833/EU; copyright.txt: "(c) European Union, 1995-2026")', licenceClass: 'open',
  fallback: 'the place default height (place.default_height_m)',
  buildingHeights: {
    kind: 'ghsl-raster', source: 'ghsl-built-h', label: 'ghsl',
    url: 'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_H_GLOBE_R2023A/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss/V1-0/tiles/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss_V1_0_R{r}_C{c}.zip',
    tile_deg: 10, west: -180.0079166667, north: 89.0995833333, member: /\.tif$/.source,
    top_includes_roof: true,
    credit: 'Building heights (where OSM has none) from GHS-BUILT-H R2023A © European Union, 1995-2026, JRC (CC BY 4.0)',
  },
};
