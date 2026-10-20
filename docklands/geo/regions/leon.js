// Region config: Casco Histórico, León, Spain. One of the three places of OKR KR1.2, chosen by the owner on 2026-10-11
// ("City hall / Spain https://leon.es/en/what-to-see/monuments/plaza-mayor/"). Pure data; read through region().
// Origin: Plaza Mayor, OSM way 46344511 (Nominatim, OSM, ODbL; checked 2026-10-11). h: approximate ellipsoidal height
// (ground about 838 m above sea level plus a geoid height of about 52 m; stated, +-10 m): replace at step 5.
import ghsl from '../adapters/world-ghsl.js';
import { overture, msBuildings } from '../adapters/world-buildings.js';

export default {
  id: 'leon',
  name: 'Casco Histórico, León',
  origin: { lon: -5.56654, lat: 42.59732, h: 890 },
  bbox: [-5.582, 42.590, -5.552, 42.605],
  timeZone: 'Europe/Madrid',
  locale: 'es-ES',
  locales: ['es-ES'],
  heightDatum: 'ellipsoid',
  // the 3D place on the globe (cwplans/tools/build-place-tiles.mjs; skill docklands-3d-page, "Three.js port: places as 3D
  // Tiles"): a square of size_m round the origin, cut by the geodetic quadtree at level (cells of 180 / 2^level degrees);
  // dem: the adapter whose `dem` block gives the terrain; heights: adapters whose `buildingHeights` block can give a
  // height to an OSM building that has none (the national cadastre); names: the OSM name keys in order
  // roof_rule: a building with no OSM roof:shape gets this roof when its kind is listed, its footprint is near a rectangle
  // (area / oriented box area >= min_rect), its area is at most max_area_m2 and its walls at most max_wall_m (the old
  // town's tiled roofs; counted as "rule" in the log, never as OSM)
  place: { size_m: 2000, level: 15, dem: 'es-ign', heights: ['es-catastro', 'world-overture', 'world-ms-buildings', 'world-ghsl'], names: ['name', 'name:es'], label: 'Plaza Mayor, León',
    search: ['Plaza Mayor', 'Casco Histórico', 'León'],
    roof_rule: { shape: 'hipped', pitch_deg: 28, kinds: ['yes', 'house', 'residential', 'apartments', 'detached', 'semidetached_house', 'terrace', 'school', 'retail', 'commercial', 'office', 'public', 'civic', 'hotel', 'church', 'chapel', 'convent', 'monastery', 'garage'], min_rect: 0.8, max_area_m2: 1500, max_wall_m: 24 } },
  services: { weatherPoint: { lon: -5.56654, lat: 42.59732 }, aircraft: { lon: -5.56654, lat: 42.59732, nm: 25 }, metar: 'LELN' },
  adapters: [
    { id: 'world-base', area: 'worldwide', about: 'OSM / Overture buildings, Copernicus DEM, Natural Earth', licence: 'per source', licenceClass: 'open', fallback: 'none (this is the fallback)' },
    { id: 'es-ign', status: 'in use (terrain of the place, MDT05 through the IDEE WCS)', area: 'Spain',
      about: 'IGN / CNIG: PNOA LiDAR point clouds, MDT (terrain) and MDS models, PNOA orthophotos (Centro de Descargas)',
      licence: 'CC BY 4.0 (Orden FOM/2807/2015; credit "© Instituto Geográfico Nacional"; PNOA: "PNOA cedido por © Instituto Geográfico Nacional")',
      licenceClass: 'open', crs: { horizontal: 'ETRS89 / UTM 30N (EPSG:25830)', vertical: 'orthometric (Alicante datum), geoid EGM08-REDNAP' }, fallback: 'world-base',
      // MDT05 (5 m terrain model, 1 m steps in this coverage) through the INSPIRE WCS 2.0 of the IDEE, in ETRS89 geographic
      dem: { kind: 'wcs20', source: 'ign-mdt05', url: 'https://servicios.idee.es/wcs-inspire/mdt', coverage: 'Elevacion4258_5', ringCoverage: 'Elevacion4258_25', lat: 'Lat', lon: 'Long', format: 'image/tiff', res_m: 5,
        datum: 'orthometric, REDNAP (geoid EGM08-REDNAP); ETRS89 taken as WGS84', credit: 'MDT05 © Instituto Geográfico Nacional (CC BY 4.0)' } },
    { id: 'es-catastro', status: 'approved-transformed-only', area: 'Spain (not the Basque Country, not Navarre)',
      about: 'Dirección General del Catastro INSPIRE buildings (BU), parcels (CP), addresses (AD)',
      licence: 'own licence (v1.0, July 2016): reuse, also commercial, only of data that the user has transformed; the original data may not be redistributed',
      licenceClass: 'review', approved: 'owner, 2026-10-11: "Catastro - yes" (publish only geometry and attributes we have transformed; never the original files)', fallback: 'world-base (OSM buildings)',
      // number of floors of the INSPIRE building parts (BU, building parts), used only to compute a height for an OSM
      // building that has none (floors x storey_m); the original files stay in the raw folder (never committed)
      buildingHeights: { kind: 'inspire-bu-parts', source: 'es-catastro-inspire-bu', url: 'https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/24/24900-LEON/A.ES.SDGC.BU.24900.zip',
        member: /buildingpart\.gml$/.source, proj4: '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', storey_m: 3,
        credit: 'Heights computed from the number of floors of the Dirección General del Catastro INSPIRE building parts (transformed data; the original data are not published)' } },
    overture, msBuildings, ghsl,
  ],
};
