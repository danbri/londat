// Region config: the Docklands (Canary Wharf, Isle of Dogs, Greenwich peninsula, Rotherhithe), London, United Kingdom.
// Pure data (JSON-compatible; `node -e "import('./docklands/geo/regions/docklands.js').then(m => console.log(JSON.stringify(m.default)))"`
// prints it as JSON for tools in other languages). Read through region() in docklands/geo/region.js. A JS module, not a
// .json file, so that the browser can import it without import attributes (older Safari and Firefox lack them).
// Every UK constant of the core is to move here or into docklands/geo/adapters/uk-os.js (OKR KR1.1; count:
// tools/check-locale.mjs). Design: https://github.com/danbri/londat/blob/main/docs/planet-architecture.md
export default {
  id: 'docklands',
  name: 'Docklands, London',
  // the model origin (BNG E 537,550 N 180,300, One Canada Square to about 20 m), from the area.js fit (geoLonLat(G, 0, 0));
  // h: the OSGM15 geoid height there, so ENU u = 0 is ODN 0 at the origin
  origin: { lon: -0.019497988, lat: 51.504902222, h: 45.448 },
  // the model box (BNG E 532,400 to 539,900, N 176,700 to 182,300) as the WGS84 box of cwplans/tools/fetch-docklands.mjs
  bbox: [-0.0950, 51.4740, 0.0150, 51.5220],
  timeZone: 'Europe/London',
  locale: 'en-GB',
  heightDatum: 'ODN',
  // fixed points for services that take one position (to move to the place in view: OKR KR5.3)
  services: {
    weatherPoint: { lon: -0.02, lat: 51.505 },          // Open-Meteo calls (docklands/meteo.js, about-extra.js, layers/wind.js)
    aircraft: { lon: -0.02, lat: 51.505, nm: 25 },      // adsb.lol /v2/point (docklands/planes-live.js ADSB)
    metar: 'EGLC',                                       // London City Airport (NOAA AWC; cwplans/tools/fetch-live-cache.mjs)
  },
  adapters: [
    {
      id: 'uk-os',
      module: 'docklands/geo/adapters/uk-os.js',
      about: 'British National Grid (EPSG:27700) through OSTN15, Ordnance Datum Newlyn heights through OSGM15, and the Docklands model frame (x = E - 537550, z = -(N - 180300), y = m above ODN).',
      area: 'Great Britain (OSTN15 / OSGM15 extent); the model frame only within the box',
      licence: 'OSTN15 / OSGM15: free to use (Ordnance Survey); EA LiDAR, OS OpenData: OGL v3.0',
      licenceClass: 'open',
      fallback: 'outside Great Britain: none (the core works in WGS84 / ECEF / ENU)',
      crs: { horizontal: 'EPSG:27700', vertical: 'EPSG:5701 (ODN)', compound: 'EPSG:7405', geographic: 'ETRS89 (EPSG:4258), used as WGS84: they differ by about 0.9 m in 2026 (plate motion since 1989), below the accuracy of the open data in use' },
      // ENU (origin above) -> model frame, fixed: x = a e - b n + tx, -z = b e + a n + tn, y = u + ty.
      // Fitted by fitModelFrame() to the area.js fit (21 x 21 grid over the box) on 2026-10-11; measured on 61 x 61 points:
      // horizontal max 0.086 m (at the SE corner, 0.015 E 51.474 N), rms 0.028 m; scale 0.999836 (the BNG point scale
      // factor here), rotation 1.5506 degrees (grid convergence: true north is 1.55 degrees west of grid north here, as
      // sky3.js GRID_CONV). Vertical: the flat model leaves out the curvature drop (up to
      // 3.08 m at the far corner, 6.3 km) and the geoid change (about +-0.07 m); use the adapter's exact functions there.
      modelFrame: { a: 0.9994702116731193, b: 0.02705486218699722, tx: 0.009070344521249834, tn: 0.003921958702577293, ty: 0,
        error: { horizontalMaxM: 0.086, horizontalRmsM: 0.028, verticalMaxDropM: 3.08, againstFitMaxM: 0.03 } },
      // UK tile cells: BNG 1 km squares (the LiDAR tiles); worldwide cells: docs/planet-architecture.md
      cells: { scheme: 'bng-1km', size: 1000 },
      // the model box in the model frame (BNG E 532,400 to 539,900, N 176,700 to 182,300): the model draws a building whose
      // centroid is at least inset_m inside it (cwplans/tools/build-docklands.mjs inside(x, z, 1)); a place around the model
      // (Greater London, regions/london.js place.exclude) draws the others, so no building is drawn twice
      modelBox: { x0: -5150, x1: 2350, z0: -2000, z1: 3600, inset_m: 1 },
    },
  ],
};
