// Region config: Stari Grad (old city), Sarajevo, Bosnia and Herzegovina. One of the three places of OKR KR1.2, chosen by
// the owner on 2026-10-11 ("old city Sarajevo. City hall"). Pure data; read through region() (docklands/geo/region.js).
// Origin: Vijećnica (City Hall), OSM way 23723663 (Nominatim, OSM, ODbL; checked 2026-10-11). h: approximate ellipsoidal
// height (ground about 532 m above sea level plus a geoid height of about 45 m; stated, +-10 m): replace with Copernicus
// GLO-30 plus EGM2008 when the base builder exists (docs/planet-architecture.md, step 5).
// Locales: bs (Bosnian, Latin), hr, sr-Latn and sr-Cyrl (Serbian in Cyrillic: the non-Latin script case of KR1.2 / KR1.3).
import ghsl from '../adapters/world-ghsl.js';
import { overture, msBuildings } from '../adapters/world-buildings.js';
import { worldcover, overtureOuter } from '../adapters/world-surround.js';

export default {
  id: 'sarajevo',
  name: 'Stari Grad, Sarajevo',
  origin: { lon: 18.43335, lat: 43.85917, h: 577 },
  bbox: [18.418, 43.852, 18.446, 43.866],
  timeZone: 'Europe/Sarajevo',
  locale: 'bs',
  locales: ['bs', 'hr', 'sr-Latn', 'sr-Cyrl'],
  heightDatum: 'ellipsoid',
  // the 3D place on the globe (cwplans/tools/build-place-tiles.mjs; skill docklands-3d-page, "Three.js port: places as 3D
  // Tiles"): names in Latin (name, name:bs) and, where OSM has them, in Cyrillic (name:sr, name:sr-Cyrl) beside them
  // heights: no national source reached on 2026-10-20 (ba-fgu below), so after OSM: Overture (non-OSM records), Microsoft, then the GHSL cell estimate;
  // roof_rule: as leon.js (hipped tiled roofs of the old town and the Austro-Hungarian blocks; counted as "rule")
  place: { size_m: 2000, level: 15, dem: 'world-base', heights: ['world-overture', 'world-ms-buildings', 'world-ghsl'], names: ['name', 'name:bs', 'name:sr-Latn', 'name:hr'], alt_names: ['name:sr', 'name:sr-Cyrl'],
    label: 'Vijećnica, Stari Grad, Sarajevo',
    // city: the valley from Ilidža to Baščaršija, drawn as blocks; surround: terrain, land cover, roads, rail, water, place
    // names and peaks to about 35 km (place-lod)
    city: { bbox: [18.285, 43.815, 18.46, 43.875] },
    surround: { size_m: 70000, top_level: 10, refine: [[30000, 11], [16000, 12], [9000, 13]], land_cover: 'world-worldcover', outer: 'world-overture-outer' }, search: ['Vijećnica', 'Вијећница', 'Stari Grad', 'Baščaršija', 'Sarajevo'],
    roof_rule: { shape: 'hipped', pitch_deg: 32, kinds: ['yes', 'house', 'residential', 'apartments', 'detached', 'semidetached_house', 'terrace', 'school', 'retail', 'commercial', 'office', 'public', 'civic', 'hotel', 'church', 'chapel', 'mosque', 'garage'], min_rect: 0.8, max_area_m2: 1500, max_wall_m: 24 } },
  services: { weatherPoint: { lon: 18.43335, lat: 43.85917 }, aircraft: { lon: 18.43335, lat: 43.85917, nm: 25 }, metar: 'LQSA' },
  adapters: [
    { id: 'world-base', area: 'worldwide', about: 'OSM / Overture buildings, Copernicus DEM, Natural Earth (docs/planet-architecture.md, "National open data")',
      licence: 'per source (OSM ODbL; Overture CDLA-Permissive-2.0 / ODbL by theme; Copernicus DEM free licence; Natural Earth public domain)', licenceClass: 'open', fallback: 'none (this is the fallback)',
      // Copernicus DEM GLO-30 (a surface model: roofs and trees are in it), 1 x 1 degree COGs on the AWS open data registry
      dem: { kind: 'copernicus-glo30', source: 'copernicus-glo30', url: 'https://copernicus-dem-30m.s3.amazonaws.com/', res_m: 30, datum: 'EGM2008 orthometric (a surface model, DSM)',
        credit: 'Copernicus DEM GLO-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA' } },
    { id: 'ba-fgu', status: 'not reached (2026-10-20): katastar.ba lists WMS / WFS / WCS services (5 m DEM, cadastral buildings "Zgrada" per municipality, Stari Grad and Centar among them) behind a log-in; use needs a written request and a fee (katastar.ba/koristenje); geoportal.fgu.com.ba and gispp.zavodzpr-sa.ba refused the connection', area: 'Bosnia and Herzegovina',
      about: 'National LiDAR (EU IPA II 2019 project: DSM and DTM, due about the end of 2025) and the FGU / RGURS geoportals: no published open licence found on 2026-10-11',
      licence: 'unknown (a catalogue entry for the FGU geoportal says "No License Provided")', licenceClass: 'waived-prototype',
      waiver: 'owner, 2026-10-11: "Waive this, put it against my name to pursue license while in prototype phase." Usable during the prototyping phase; the owner (danbri) pursues a licence; re-check before the phase ends (issue #9)',
      fallback: 'world-base' },
    overture, msBuildings, ghsl, worldcover, overtureOuter,
  ],
};
