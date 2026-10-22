// Region config: Schloss Dagstuhl and Wadern, Saarland, Germany (owner, 2026-10-22: "Germany's most famous computer
// science castle meetings take place primarily at Schloss Dagstuhl – Leibniz Center for Informatics in Wadern, Saarland,
// let's add that too and surrounding locale."). Pure data; read through region().
// Origin: Schloss Dagstuhl, OSM way 81517428, Wikidata Q876507 (Nominatim, OSM, ODbL; checked 2026-10-22). h: approximate
// ellipsoidal height (ground about 330 m above sea level plus a geoid height of about 48 m; stated, +-10 m).
// The tile set is written to the docklandia repository (place.outRepo) and served from its Pages (place.tileBase).
// Skill docklands-3d-page, "Three.js port: German places".
import ghsl from '../adapters/world-ghsl.js';
import { overture, msBuildings } from '../adapters/world-buildings.js';
import { worldcover, overtureOuter, msGeometry } from '../adapters/world-surround.js';

export default {
  id: 'dagstuhl',
  name: 'Schloss Dagstuhl, Wadern',
  origin: { lon: 6.89863, lat: 49.53067, h: 378 },
  bbox: [6.868, 49.518, 6.935, 49.592],
  timeZone: 'Europe/Berlin',
  locale: 'de-DE',
  locales: ['de-DE'],
  heightDatum: 'ellipsoid',
  // core_bbox: Wadern town, Dagstuhl with the castle and its park, Lockweiler and Wadrill in the wooded Hunsrück hills;
  // dem: Copernicus GLO-30 opened (Saarland's LoD2 WFS answered a server fault to every spatial query on 2026-10-22; see the
  // de-sl-lvgl adapter); city: the municipality of Wadern as blocks; surround: 35 km (Saar, Prims, Hunsrück, Trier side)
  place: { size_m: 2000, level: 15, core_bbox: [6.868, 49.518, 6.935, 49.592], dem: 'world-base', heights: ['world-overture', 'world-ms-buildings', 'world-ghsl'], names: ['name', 'name:de'], label: 'Schloss Dagstuhl, Wadern',
    outRepo: 'docklandia', outPath: 'data/de/dagstuhl/', tileBase: 'https://danbri.github.io/docklandia/data/de/dagstuhl/',
    views: [{ name: 'Schloss Dagstuhl (600 m)', ll: '49.5307,6.8986,600', ht: '20,60' }, { name: 'Wadern and the villages (10 km)', ll: '49.5500,6.9000,10000', ht: '0,45' }],
    city: { bbox: [6.800, 49.470, 7.010, 49.630] },
    surround: { size_m: 70000, top_level: 10, refine: [[30000, 11], [16000, 12], [9000, 13]], land_cover: 'world-worldcover', outer: 'world-overture-outer', geometry: ['overture-ms-geometry'] },
    // the place's own words for search (the castle and the institute in it: OSM way 95917683, a research_institute area,
    // gives the site of its buildings on their cards)
    search: ['Schloss Dagstuhl', 'Dagstuhl', 'Schloss Dagstuhl – Leibniz-Zentrum für Informatik', 'Leibniz-Zentrum für Informatik', 'Leibniz Center for Informatics', 'Wadern'],
    // look and greens: stated assumptions. White and cream rendered houses, sandstone, dark Hunsrück slate roofs; beech and
    // oak woods, spruce plantations, orchards round the villages
    look: { wall: { house: { renderWhite: 35, renderCream: 30, renderPastel: 15, stone: 10, renderOchre: 10 }, flats: { renderWhite: 35, renderCream: 30, renderPastel: 20, concrete: 15 },
        estate: { concrete: 40, renderWhite: 40, renderPastel: 20 }, office: { renderWhite: 35, concrete: 30, glassS: 20, stone: 15 }, civic: { stone: 45, renderWhite: 35, renderCream: 20 }, shed: { metal: 55, concrete: 25, timber: 20 } },
      roof_pitched: { slate: 55, ctileG: 20, ctile: 15, clay: 10 }, roof_flat: { gravel: 40, membrane: 35, felt: 25 } },
    // wood_m 25: a sample of the Hunsrück woods (6.5 m, the default, gave 330,720 trees, 20 MB)
    greens: { wood_m: 25, mix: { street: [['lime', 30], ['maple', 20], ['horse-chestnut', 15], ['oak', 10], ['birch', 10], ['cherry', 10], ['ash', 5]],
      park: [['beech', 20], ['oak', 20], ['lime', 15], ['horse-chestnut', 10], ['maple', 10], ['conifer', 15], ['birch', 10]],
      wood: [['beech', 40], ['oak', 25], ['conifer', 25], ['birch', 5], ['ash', 5]], water: [['alder', 40], ['willow', 35], ['ash', 25]] } },
    roof_rule: { shape: 'gabled', pitch_deg: 42, kinds: ['yes', 'house', 'detached', 'semidetached_house', 'terrace', 'residential', 'farm', 'farm_auxiliary', 'barn', 'garage', 'church', 'chapel', 'school'], min_rect: 0.8, max_area_m2: 600, max_wall_m: 14 } },
  services: { weatherPoint: { lon: 6.89863, lat: 49.53067 }, aircraft: { lon: 6.89863, lat: 49.53067, nm: 25 }, metar: 'EDDR' },
  adapters: [
    { id: 'world-base', area: 'worldwide', about: 'OSM / Overture buildings, Copernicus DEM, Natural Earth', licence: 'per source (OSM ODbL; Overture by theme; Copernicus DEM free licence)', licenceClass: 'open', fallback: 'none (this is the fallback)',
      // Copernicus DEM GLO-30 is a SURFACE model: open_px 2 (about 60 m) takes the village roofs out; the woods stay in it
      dem: { kind: 'copernicus-glo30', source: 'copernicus-glo30', url: 'https://copernicus-dem-30m.s3.amazonaws.com/', res_m: 30, datum: 'EGM2008 orthometric (a surface model, DSM)', open_px: 2,
        credit: 'Copernicus DEM GLO-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA' } },
    { id: 'de-sl-lvgl', status: 'not reached (2026-10-22): the INSPIRE WFS "SL Gebäude - 3D LoD2" (https://geoportal.saarland.de/gdi-sl/inspirewfs_Gebaeude_3D_LoD2) answers any BBOX query with a server fault (PostgreSQL: failed to load summary postgis-3.index.bc); without a filter it answers, but the whole Land is too large to page through', area: 'Saarland',
      about: 'Landesamt für Vermessung, Geoinformation und Landentwicklung Saarland (LVGL): 3D building model LoD2 (INSPIRE bu-core3d with the full LoD2 geometry, EPSG:7423), ALKIS buildings',
      licence: 'Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2.0); credit "© GeoBasis DE/LVGL-SL (2026)" (the dataset metadata d1c7c303-ec71-4fd5-bb48-8b6d5ddfc67b, checked 2026-10-22)', licenceClass: 'open',
      fallback: 'world-base (OSM / Overture buildings, Copernicus GLO-30)' },
    overture, msBuildings, ghsl, worldcover, overtureOuter, msGeometry,
  ],
};
