// Region config: the centre of Leiden, Netherlands. One of the three places of OKR KR1.2, chosen by the owner on 2026-10-11
// ("Leiden nl annies bar"). Pure data; read through region().
// Origin: Annie's, Hoogstraat 1A, on the water where the Oude and Nieuwe Rijn meet, OSM node 2917023856 (Nominatim, OSM,
// ODbL; checked 2026-10-11). h: approximate ellipsoidal height (ground about 1 m above NAP plus about 43 m of geoid
// height; stated, +-5 m): replace at step 5.
export default {
  id: 'leiden',
  name: 'Leiden centre',
  origin: { lon: 4.49123, lat: 52.15948, h: 44 },
  bbox: [4.475, 52.152, 4.505, 52.168],
  timeZone: 'Europe/Amsterdam',
  locale: 'nl-NL',
  locales: ['nl-NL'],
  heightDatum: 'ellipsoid',
  services: { weatherPoint: { lon: 4.49123, lat: 52.15948 }, aircraft: { lon: 4.49123, lat: 52.15948, nm: 25 }, metar: 'EHAM' },
  adapters: [
    { id: 'world-base', area: 'worldwide', about: 'OSM / Overture buildings, Copernicus DEM, Natural Earth', licence: 'per source', licenceClass: 'open', fallback: 'none (this is the fallback)' },
    { id: 'nl-pdok', status: 'planned', area: 'Netherlands',
      about: 'AHN (Actueel Hoogtebestand Nederland) LiDAR DTM and DSM 0.5 m; BAG buildings and addresses (Kadaster); 3DBAG (LoD 1.2 to 2.2 buildings made from BAG and AHN)',
      licence: 'AHN: CC0 1.0 (data.overheid.nl); BAG: CC0 1.0 / public domain (Kadaster; delivery charges may apply to private parties for some extracts); 3DBAG: CC BY 4.0 (3D geoinformation group, TU Delft, and 3DGI)',
      licenceClass: 'open', crs: { horizontal: 'RD New (EPSG:28992) through RDNAPTRANS 2018', vertical: 'NAP (EPSG:5709)' }, fallback: 'world-base' },
  ],
};
