// Region config: Stuttgart-Mitte, Germany (owner, 2026-10-22: "Germany: Berlin and Stuttgart."). Pure data; read through
// region(). Origin: Schlossplatz, OSM way 3933618 (Nominatim, OSM, ODbL; checked 2026-10-22). h: approximate ellipsoidal
// height (ground about 245 m above sea level in the valley plus a geoid height of about 48 m; stated, +-5 m).
// The tile set is written to the docklandia repository (place.outRepo) and served from its Pages (place.tileBase).
// Skill docklands-3d-page, "Three.js port: German places".
import ghsl from '../adapters/world-ghsl.js';
import { overture, msBuildings } from '../adapters/world-buildings.js';
import { worldcover, overtureOuter, msGeometry } from '../adapters/world-surround.js';

export default {
  id: 'stuttgart',
  name: 'Mitte, Stuttgart',
  origin: { lon: 9.17974, lat: 48.77847, h: 293 },
  bbox: [9.158, 48.752, 9.205, 48.792],
  timeZone: 'Europe/Berlin',
  locale: 'de-DE',
  locales: ['de-DE'],
  heightDatum: 'ellipsoid',
  // core_bbox: the valley of Mitte (Schlossplatz, Königstraße, Hauptbahnhof) with its steep sides up to the Fernsehturm on
  // the Hoher Bopser; dem: Copernicus GLO-30 opened (the state's DGM1 and LoD2 at opengeodata.lgl-bw.de, dl-de/by-2.0,
  // were not reachable from the build machine on 2026-10-22: every connection reset); heights: OSM, Overture, Microsoft,
  // GHSL; city: Stuttgart (Stadtkreis) as blocks; surround: 35 km (Neckar, vineyards and woods from land cover and OSM)
  place: { size_m: 3000, level: 15, core_bbox: [9.158, 48.752, 9.205, 48.792], dem: 'world-base', heights: ['world-overture', 'world-ms-buildings', 'world-ghsl'], names: ['name', 'name:de'], label: 'Schlossplatz, Stuttgart-Mitte',
    outRepo: 'docklandia', outPath: 'data/de/stuttgart/', tileBase: 'https://danbri.github.io/docklandia/data/de/stuttgart/',
    views: [{ name: 'The valley (3 km)', ll: '48.7784,9.1797,3000', ht: '200,50' }, { name: 'Fernsehturm on the Hoher Bopser (1 km)', ll: '48.7558,9.1902,1000', ht: '330,55' }],
    city: { bbox: [9.039, 48.692, 9.316, 48.866] },
    surround: { size_m: 70000, top_level: 10, refine: [[30000, 11], [16000, 12], [9000, 13]], land_cover: 'world-worldcover', outer: 'world-overture-outer', geometry: ['overture-ms-geometry'] },
    search: ['Stuttgart-Mitte', 'Stuttgart', 'Schlossplatz', 'Königstraße'],
    // look and greens: stated assumptions. Rendered post-war rebuilding and Gründerzeit (cream, white, ochre), sandstone
    // civic buildings (Neues Schloss), concrete offices; red clay and dark tiled roofs; plane and lime streets, beech and
    // oak woods on the valley sides, vineyards as land cover
    look: { wall: { house: { renderCream: 30, renderWhite: 30, renderOchre: 15, renderPastel: 15, stone: 10 }, flats: { renderWhite: 30, renderCream: 25, renderPastel: 15, renderOchre: 10, concrete: 20 },
        estate: { concrete: 50, renderWhite: 30, renderPastel: 20 }, office: { concrete: 35, stone: 20, glassS: 25, renderWhite: 20 }, civic: { stone: 60, renderCream: 25, renderOchre: 15 }, shed: { metal: 50, concrete: 30, brickBrown: 20 } },
      roof_pitched: { clay: 60, ctile: 30, slate: 10 }, roof_flat: { gravel: 40, membrane: 35, felt: 25 } },
    greens: { wood_m: 12, mix: { street: [['plane', 30], ['lime', 25], ['maple', 15], ['horse-chestnut', 10], ['locust', 5], ['birch', 5], ['ash', 5], ['cherry', 5]],
      park: [['plane', 20], ['lime', 15], ['maple', 15], ['beech', 10], ['oak', 10], ['horse-chestnut', 10], ['conifer', 10], ['birch', 10]],
      wood: [['beech', 40], ['oak', 25], ['hornbeam', 15], ['conifer', 10], ['ash', 10]], water: [['willow', 40], ['alder', 25], ['poplar', 20], ['ash', 15]] } },
    roof_rule: { shape: 'gabled', pitch_deg: 40, kinds: ['house', 'detached', 'semidetached_house', 'terrace', 'farm', 'farm_auxiliary', 'barn', 'garage'], min_rect: 0.8, max_area_m2: 400, max_wall_m: 12 } },
  services: { weatherPoint: { lon: 9.17974, lat: 48.77847 }, aircraft: { lon: 9.17974, lat: 48.77847, nm: 25 }, metar: 'EDDS' },
  adapters: [
    { id: 'world-base', area: 'worldwide', about: 'OSM / Overture buildings, Copernicus DEM, Natural Earth', licence: 'per source (OSM ODbL; Overture by theme; Copernicus DEM free licence)', licenceClass: 'open', fallback: 'none (this is the fallback)',
      // Copernicus DEM GLO-30 is a SURFACE model: open_px 3 (a morphological opening of about 90 m) takes buildings and
      // small groves out of the valley floor and keeps its slopes (stated rule)
      dem: { kind: 'copernicus-glo30', source: 'copernicus-glo30', url: 'https://copernicus-dem-30m.s3.amazonaws.com/', res_m: 30, datum: 'EGM2008 orthometric (a surface model, DSM)', open_px: 3,
        credit: 'Copernicus DEM GLO-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA' } },
    { id: 'de-bw-lgl', status: 'not reached (2026-10-22): opengeodata.lgl-bw.de, www.lgl-bw.de and owsproxy.lgl-bw.de reset every connection from the build machine (agent proxy: tunnel closed)', area: 'Baden-Württemberg',
      about: 'Landesamt für Geoinformation und Landentwicklung Baden-Württemberg (LGL) open data: LoD2 building models (CityGML, per municipality), DGM1 terrain, orthophotos',
      licence: 'Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2.0; credit "© LGL, www.lgl-bw.de"; from the LGL open data pages, not re-checked: the site was not reachable)', licenceClass: 'open',
      fallback: 'world-base (OSM / Overture buildings, Copernicus GLO-30)' },
    overture, msBuildings, ghsl, worldcover, overtureOuter, msGeometry,
  ],
};
