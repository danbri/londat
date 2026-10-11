// Region config: Casco Histórico, León, Spain. One of the three places of OKR KR1.2, chosen by the owner on 2026-10-11
// ("City hall / Spain https://leon.es/en/what-to-see/monuments/plaza-mayor/"). Pure data; read through region().
// Origin: Plaza Mayor, OSM way 46344511 (Nominatim, OSM, ODbL; checked 2026-10-11). h: approximate ellipsoidal height
// (ground about 838 m above sea level plus a geoid height of about 52 m; stated, +-10 m): replace at step 5.
export default {
  id: 'leon',
  name: 'Casco Histórico, León',
  origin: { lon: -5.56654, lat: 42.59732, h: 890 },
  bbox: [-5.582, 42.590, -5.552, 42.605],
  timeZone: 'Europe/Madrid',
  locale: 'es-ES',
  locales: ['es-ES'],
  heightDatum: 'ellipsoid',
  services: { weatherPoint: { lon: -5.56654, lat: 42.59732 }, aircraft: { lon: -5.56654, lat: 42.59732, nm: 25 }, metar: 'LELN' },
  adapters: [
    { id: 'world-base', area: 'worldwide', about: 'OSM / Overture buildings, Copernicus DEM, Natural Earth', licence: 'per source', licenceClass: 'open', fallback: 'none (this is the fallback)' },
    { id: 'es-ign', status: 'planned', area: 'Spain',
      about: 'IGN / CNIG: PNOA LiDAR point clouds, MDT (terrain) and MDS models, PNOA orthophotos (Centro de Descargas)',
      licence: 'CC BY 4.0 (Orden FOM/2807/2015; credit "© Instituto Geográfico Nacional"; PNOA: "PNOA cedido por © Instituto Geográfico Nacional")',
      licenceClass: 'open', crs: { horizontal: 'ETRS89 / UTM 30N (EPSG:25830)', vertical: 'orthometric (Alicante datum), geoid EGM08-REDNAP' }, fallback: 'world-base' },
    { id: 'es-catastro', status: 'review', area: 'Spain (not the Basque Country, not Navarre)',
      about: 'Dirección General del Catastro INSPIRE buildings (BU), parcels (CP), addresses (AD)',
      licence: 'own licence (v1.0, July 2016): reuse, also commercial, only of data that the user has transformed; the original data may not be redistributed',
      licenceClass: 'review', fallback: 'world-base (OSM buildings)' },
  ],
};
