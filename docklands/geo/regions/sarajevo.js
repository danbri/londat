// Region config: Stari Grad (old city), Sarajevo, Bosnia and Herzegovina. One of the three places of OKR KR1.2, chosen by
// the owner on 2026-10-11 ("old city Sarajevo. City hall"). Pure data; read through region() (docklands/geo/region.js).
// Origin: Vijećnica (City Hall), OSM way 23723663 (Nominatim, OSM, ODbL; checked 2026-10-11). h: approximate ellipsoidal
// height (ground about 532 m above sea level plus a geoid height of about 45 m; stated, +-10 m): replace with Copernicus
// GLO-30 plus EGM2008 when the base builder exists (docs/planet-architecture.md, step 5).
// Locales: bs (Bosnian, Latin), hr, sr-Latn and sr-Cyrl (Serbian in Cyrillic: the non-Latin script case of KR1.2 / KR1.3).
export default {
  id: 'sarajevo',
  name: 'Stari Grad, Sarajevo',
  origin: { lon: 18.43335, lat: 43.85917, h: 577 },
  bbox: [18.418, 43.852, 18.446, 43.866],
  timeZone: 'Europe/Sarajevo',
  locale: 'bs',
  locales: ['bs', 'hr', 'sr-Latn', 'sr-Cyrl'],
  heightDatum: 'ellipsoid',
  services: { weatherPoint: { lon: 18.43335, lat: 43.85917 }, aircraft: { lon: 18.43335, lat: 43.85917, nm: 25 }, metar: 'LQSA' },
  adapters: [
    { id: 'world-base', area: 'worldwide', about: 'OSM / Overture buildings, Copernicus DEM, Natural Earth (docs/planet-architecture.md, "National open data")',
      licence: 'per source (OSM ODbL; Overture CDLA-Permissive-2.0 / ODbL by theme; Copernicus DEM free licence; Natural Earth public domain)', licenceClass: 'open', fallback: 'none (this is the fallback)' },
    { id: 'ba-fgu', status: 'unknown', area: 'Bosnia and Herzegovina',
      about: 'National LiDAR (EU IPA II 2019 project: DSM and DTM, due about the end of 2025) and the FGU / RGURS geoportals: no published open licence found on 2026-10-11',
      licence: 'unknown', licenceClass: 'none', fallback: 'world-base' },
  ],
};
