// Region config: Berlin-Mitte, Germany (owner, 2026-10-22: "I'll like to add some information (bulk data in docklandia
// repo pls.) for more cities and countries. ... Germany: Berlin and Stuttgart."). Pure data; read through region().
// Origin: Brandenburger Tor, OSM way 518071791 (Nominatim, OSM, ODbL; checked 2026-10-22). h: approximate ellipsoidal
// height (ground about 35 m above sea level plus a geoid height of about 40 m; stated, +-3 m).
// The tile set is bulky: it is written to the docklandia repository (place.outRepo / outPath) and served from its Pages
// (place.tileBase); index.json and this config stay in londat. Skill docklands-3d-page, "Three.js port: German places".
import ghsl from '../adapters/world-ghsl.js';
import { overture, msBuildings } from '../adapters/world-buildings.js';
import { worldcover, overtureOuter, msGeometry } from '../adapters/world-surround.js';

export default {
  id: 'berlin',
  name: 'Mitte, Berlin',
  origin: { lon: 13.3777, lat: 52.51627, h: 75 },
  bbox: [13.370, 52.505, 13.418, 52.527],
  timeZone: 'Europe/Berlin',
  locale: 'de-DE',
  locales: ['de-DE'],
  heightDatum: 'ellipsoid',
  // the 3D place on the globe (cwplans/tools/build-place-tiles.mjs): core_bbox: Mitte from the Reichstag and Potsdamer Platz
  // to Alexanderplatz (Unter den Linden, Museumsinsel, the Fernsehturm); dem: Berlin DGM1 (1 m terrain model) for the
  // core; heights: the official LoD2 model's measured heights first after OSM height (whole Land Berlin, core and city),
  // then Overture, Microsoft, GHSL; the core buildings themselves are the LoD2 walls and roofs (place-tiles, input
  // lod2-core); city: Land Berlin (its bounding box: some Brandenburg suburbs too) as blocks; surround: 35 km of terrain
  // (Copernicus GLO-30, opened), land cover, roads, rail, water (Spree, Havel, the lakes), forests, names
  place: { size_m: 3400, level: 15, core_bbox: [13.370, 52.505, 13.418, 52.527], dem: 'de-be-dgm1', heights: ['de-be-lod2', 'world-overture', 'world-ms-buildings', 'world-ghsl'], names: ['name', 'name:de'], label: 'Unter den Linden, Berlin-Mitte',
    outRepo: 'docklandia', outPath: 'data/de/berlin/', tileBase: 'https://danbri.github.io/docklandia/data/de/berlin/',
    views: [{ name: 'Mitte (1.5 km)', ll: '52.5170,13.3940,1500', ht: '80,55' }, { name: 'Berlin (20 km)', ll: '52.5100,13.4000,20000', ht: '0,45' }, { name: 'Reichstag and Brandenburger Tor (600 m)', ll: '52.5170,13.3780,600', ht: '20,60' }],
    city: { bbox: [13.088, 52.338, 13.761, 52.675] },
    surround: { size_m: 70000, top_level: 10, refine: [[30000, 11], [16000, 12], [9000, 13]], land_cover: 'world-worldcover', outer: 'world-overture-outer', dem: 'world-base',
      ndjson: ['buildings'], geometry: ['overture-ms-geometry'] },
    search: ['Berlin-Mitte', 'Mitte', 'Berlin', 'Unter den Linden', 'Museumsinsel'],
    // look and greens (globe/place-look.js, cwplans/tools/build-place-greens.mjs): stated assumptions, not data. Rendered
    // Gründerzeit blocks (cream, white, ochre), sandstone civic buildings, post-war concrete and glass offices; mostly flat
    // and low-pitched roofs (zinc, membrane), some clay and slate; lime-lined streets (Unter den Linden), plane, maple,
    // chestnut; pine and oak in the Tiergarten and the forests
    look: { wall: { house: { renderCream: 30, renderWhite: 25, renderOchre: 15, brickRed: 15, renderPastel: 15 }, flats: { renderCream: 30, renderWhite: 20, renderOchre: 15, renderPastel: 15, concrete: 10, brickBrown: 10 },
        estate: { concrete: 55, renderWhite: 25, renderPastel: 20 }, office: { concrete: 30, stone: 25, glassS: 25, renderWhite: 20 }, civic: { stone: 60, renderCream: 25, brickRed: 15 }, shed: { metal: 50, concrete: 30, brickBrown: 20 } },
      roof_pitched: { metal: 30, clay: 30, slate: 25, ctile: 15 }, roof_flat: { membrane: 40, gravel: 35, felt: 25 } },
    greens: { wood_m: 12, mix: { street: [['lime', 40], ['plane', 15], ['maple', 15], ['horse-chestnut', 10], ['oak', 5], ['locust', 5], ['birch', 5], ['ash', 5]],
      park: [['lime', 15], ['oak', 15], ['maple', 15], ['horse-chestnut', 10], ['beech', 10], ['plane', 10], ['pine', 10], ['birch', 10], ['ash', 5]],
      wood: [['pine', 45], ['oak', 25], ['birch', 15], ['beech', 10], ['conifer', 5]], water: [['willow', 40], ['alder', 30], ['poplar', 20], ['ash', 10]] } } },
  services: { weatherPoint: { lon: 13.3777, lat: 52.51627 }, aircraft: { lon: 13.3777, lat: 52.51627, nm: 25 }, metar: 'EDDB' },
  adapters: [
    { id: 'world-base', area: 'worldwide', about: 'OSM / Overture buildings, Copernicus DEM, Natural Earth', licence: 'per source (OSM ODbL; Overture by theme; Copernicus DEM free licence)', licenceClass: 'open', fallback: 'none (this is the fallback)',
      // the surroundings' terrain: Copernicus DEM GLO-30, a SURFACE model (roofs and trees are in it); open_px: a
      // morphological opening of 3 cells (about 90 m) takes buildings and groves out and keeps slopes (stated rule)
      dem: { kind: 'copernicus-glo30', source: 'copernicus-glo30', url: 'https://copernicus-dem-30m.s3.amazonaws.com/', res_m: 30, datum: 'EGM2008 orthometric (a surface model, DSM)', open_px: 3,
        credit: 'Copernicus DEM GLO-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA' } },
    { id: 'de-be-dgm1', status: 'in use (terrain of the core)', area: 'Land Berlin (with a buffer into Brandenburg)',
      about: 'Senatsverwaltung für Stadtentwicklung, Bauen und Wohnen Berlin: ATKIS DGM1, the 1 m digital terrain model (airborne laser scan), 2 x 2 km tiles of XYZ text in an INSPIRE ATOM feed',
      licence: 'Datenlizenz Deutschland – Zero – Version 2.0 (dl-de/zero-2.0; the feed\'s rights element, checked 2026-10-22)', licenceClass: 'open', fallback: 'world-base',
      dem: { kind: 'xyz-zip-tiles', source: 'de-be-dgm1', feed: 'https://gdi.berlin.de/data/dgm1/atom/0.atom', zip_re: /https:\/\/gdi\.berlin\.de\/data\/dgm1\/atom\/DGM1_(\d+)_(\d+)\.zip/.source,
        proj4: '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', tile_m: 2000, res_src_m: 1, res_m: 4,
        datum: 'DHHN2016 normal heights (taken as orthometric); ETRS89 taken as WGS84',
        credit: 'Terrain of Mitte: Geoportal Berlin / ATKIS DGM1 (Digitales Geländemodell), dl-de/zero-2.0' } },
    { id: 'de-be-lod2', status: 'in use (core buildings: walls and roofs; heights of Land Berlin)', area: 'Land Berlin',
      about: 'Senatsverwaltung für Stadtentwicklung, Bauen und Wohnen Berlin: 3D-Gebäudemodelle im Level of Detail 2 (LoD2), CityGML 1.0 (AdV profile), footprints from the cadastre (ALKIS), roofs as generalised standard shapes from laser scanning, measuredHeight per building part; 1 x 1 km tiles in an INSPIRE ATOM feed',
      licence: 'Datenlizenz Deutschland – Zero – Version 2.0 (dl-de/zero-2.0; the feed\'s rights element, checked 2026-10-22)', licenceClass: 'open', fallback: 'OSM buildings (world-base)',
      buildingHeights: { kind: 'citygml-lod2-atom', source: 'de-be-lod2', label: 'lod2', feed: 'https://gdi.berlin.de/data/a_lod2/atom/0.atom', zip_re: /https:\/\/gdi\.berlin\.de\/data\/a_lod2\/atom\/LoD2_(\d+)_(\d+)\.zip/.source,
        proj4: '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', tile_m: 1000, top_includes_roof: true,
        credit: 'Buildings of Mitte and building heights of Berlin: Geoportal Berlin / 3D-Gebäudemodelle im Level of Detail 2 (LoD 2), dl-de/zero-2.0' } },
    overture, msBuildings, ghsl, worldcover, overtureOuter, msGeometry,
  ],
};
