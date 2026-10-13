// Region config: the United Kingdom as a whole, for the UK skeleton of OKR KR2.7 (owner, 2026-10-12: "also skeleton of uk
// with more open data vector and factoid content. Then leiden after we can fly around uk and world without getting
// totally lost."). Pure data; read through region() (docklands/geo/region.js). The Docklands region stays the detailed
// box; this region is the national frame round it.
// The adapter 'uk-skeleton' names every source of cwplans/tools/build-uk-skeleton.mjs (hosts, products, layers, the CRS
// and the projector), so that the tool itself holds no UK constant (tools/check-locale.mjs). Its output, in WGS84 and
// cut by the worldwide geodetic quadtree of docs/planet-architecture.md, is cwplans/docklands/data/uk/ (manifest.json;
// reader docklands/geo/skeleton.js). Skill: cwplans-uk-skeleton.
// Origin: about the middle of the UK box (near Kirkby Stephen, Cumbria). h: 0 (the skeleton is 2D; terrain comes from
// the world DEM of the globe).
export default {
  id: 'uk',
  name: 'United Kingdom',
  origin: { lon: -2.5, lat: 54.4, h: 0 },
  // Great Britain and Northern Ireland with their islands (Scilly, Channel Islands are not UK: outside), Shetland to 60.9 N
  bbox: [-8.7, 49.85, 1.8, 60.9],
  timeZone: 'Europe/London',
  locale: 'en-GB',
  locales: ['en-GB', 'cy', 'gd'],
  heightDatum: 'ellipsoid',
  services: { weatherPoint: { lon: -2.5, lat: 54.4 }, aircraft: { lon: -0.02, lat: 51.505, nm: 25 }, metar: 'EGLL' },
  adapters: [
    { id: 'world-base', area: 'worldwide', about: 'Natural Earth, Copernicus / ETOPO terrain (the globe of KR2.2)', licence: 'per source', licenceClass: 'open', fallback: 'none (this is the fallback)' },
    {
      id: 'uk-skeleton',
      status: 'built',
      area: 'United Kingdom: Great Britain for the OS layers (OS OpenData has no Northern Ireland), the whole UK for the ONS boundaries and the Wikidata places',
      about: 'National skeleton: boundaries (ONS, clipped to the coastline), coastline and borders, motorways and A roads, railways and stations, rivers, lakes, built-up areas, national parks and landscapes, place labels, a gazetteer and place cards',
      licence: 'OGL v3.0 (OS OpenData, ONS, DfT NaPTAN, Natural England, NRW, Scottish Government); Wikidata CC0 1.0',
      licenceClass: 'open',
      fallback: 'world-base',
      crs: {
        horizontal: 'EPSG:27700 (British National Grid; ONS publishes Northern Ireland in it too)',
        transformation: 'OSTN15 (OS NTv2 grid uk_os_OSTN15_NTv2_OSGBtoETRS.tif) through proj4, both ways; ETRS89 used as WGS84 (about 0.9 m apart in 2026)',
        // the function of cwplans/tools/lib.mjs that gives (lon, lat) -> [E, N] with .inverse(E, N) -> [lon, lat]
        projector: 'bngProjector',
      },
      cells: { scheme: 'geodetic-quadtree', levels: [3, 6, 8], yFrom: 'south' },
      output: 'cwplans/docklands/data/uk/manifest.json',
      sources: {
        onsArcgis: {
          base: 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services',
          licence: 'OGL v3.0', attribution: 'Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2024',
          layers: {
            countriesCoarse: { service: 'Countries_December_2024_Boundaries_UK_BUC', code: 'CTRY24CD', name: 'CTRY24NM', nameCy: 'CTRY24NMW' },
            countries: { service: 'Countries_December_2024_Boundaries_UK_BGC', code: 'CTRY24CD', name: 'CTRY24NM', nameCy: 'CTRY24NMW' },
            regions: { service: 'Regions_December_2024_Boundaries_EN_BGC', code: 'RGN24CD', name: 'RGN24NM' },
            ctyua: { service: 'Counties_and_Unitary_Authorities_December_2024_Boundaries_UK_BGC', code: 'CTYUA24CD', name: 'CTYUA24NM', nameCy: 'CTYUA24NMW' },
            lad: { service: 'Local_Authority_Districts_December_2024_Boundaries_UK_BGC', code: 'LAD24CD', name: 'LAD24NM', nameCy: 'LAD24NMW' },
            nationalParks: { service: 'NPARK_DEC_2022_GB_BGC_V3', code: 'NPARK22CD', name: 'NPARK22NM', nameCy: 'NPARK22NMW' },
          },
          // census 2021 districts (2022 codes) to the current codes: the 2023 reorganisation merged districts
          lookup: { service: 'LAD22_LAD23_UK_LU_v1', from: 'LAD22CD', to: 'LAD23CD' },
        },
        landscapes: [
          { id: 'aonb-england', url: 'https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/Areas_of_Outstanding_Natural_Beauty_England/FeatureServer/0', code: 'CODE', name: 'NAME', designated: 'DESIG_DATE',
            designation: 'National Landscape (Area of Outstanding Natural Beauty), England', licence: 'OGL v3.0', attribution: '© Natural England copyright. Contains Ordnance Survey data © Crown copyright and database right' },
          { id: 'aonb-wales', url: 'https://services.arcgis.com/hQoYDJEEJMaPw8Sy/arcgis/rest/services/Area_of_Outstanding_Natural_Beauty/FeatureServer/0', code: 'ISIS_ID', name: 'AONB_NAME', designated: 'DESIG_DATE',
            designation: 'National Landscape (Area of Outstanding Natural Beauty), Wales', licence: 'OGL v3.0', attribution: 'Contains Natural Resources Wales information © Natural Resources Wales and database right. Contains Ordnance Survey data' },
          { id: 'nsa-scotland', url: 'https://maps.data.gov.scot/arcgis/rest/services/NationalScenicAreas/MapServer/0', code: 'nsacode', name: 'nsaname',
            designation: 'National Scenic Area, Scotland', licence: 'OGL v3.0', attribution: '© Scottish Government, contains Ordnance Survey data © Crown copyright and database right' },
        ],
        osDownloads: {
          base: 'https://api.os.uk/downloads/v1/products',
          licence: 'OGL v3.0 (OS OpenData)', attribution: 'Contains OS data © Crown copyright and database right 2026',
          products: {
            zoomstack: { product: 'OpenZoomstack', format: 'GeoPackage', file: 'zoomstack.zip',
              roads: { tables: ['roads_national', 'roads_regional'], class: 'type', name: 'name', number: 'number',
                levels: { national: ['Motorway'], regional: ['Motorway', 'Primary'], city: ['Motorway', 'Primary', 'A Road'] },
                kinds: { Motorway: 'motorway', Primary: 'primary A road', 'A Road': 'A road' } },
              rail: { table: 'rail', class: 'type', levels: { regional: ['Multi Track', 'Single Track', 'Tunnel'], city: ['Multi Track', 'Single Track', 'Tunnel', 'Narrow Gauge'] },
                kinds: { 'Multi Track': 'railway', 'Single Track': 'railway', Tunnel: 'railway', 'Narrow Gauge': 'narrow gauge railway' } },
              water: { table: 'surfacewater', class: 'type', keep: ['National', 'Regional', 'Local'], kinds: { National: 'water', Regional: 'water', Local: 'water' } } },
            names: { product: 'OpenNames', format: 'CSV', file: 'open-names.zip' },
            rivers: { product: 'OpenRivers', format: 'GeoPackage', file: 'open-rivers.zip' },
            builtUp: { product: 'BuiltUpAreas', format: 'GeoPackage', file: 'built-up-areas.zip' },
          },
        },
        naptan: { url: 'https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv', file: 'naptan.csv',
          stopTypes: { RLY: 'rail station', MET: 'metro or tram station' }, nameSuffix: ' (Rail|Railway|Underground|DLR|Tram|Metro|Light Rail) Station$', licence: 'OGL v3.0', attribution: 'Contains DfT NaPTAN data © Crown copyright, licensed under the Open Government Licence v3.0' },
        census: { url: 'https://www.nomisweb.co.uk/output/census/2021/census2021-ts001.zip', file: 'census2021-ts001.zip', member: 'census2021-ts001-ltla.csv',
          licence: 'OGL v3.0', attribution: 'Source: Office for National Statistics, Census 2021 (England and Wales), via Nomis, licensed under the Open Government Licence v3.0' },
        wikidata: { endpoint: 'qlever', country: 'Q145', settlementClass: 'Q486972', cityClass: 'Q515', minPopulation: 5000, licence: 'CC0 1.0',
          // parts of the country with no OS names: their settlements come from Wikidata (Northern Ireland)
          partsWithoutNames: [{ id: 'Q26', name: 'Northern Ireland' }],
          townClasses: ['Q3957'], villageClasses: ['Q532', 'Q5084'],
          units: { km2: 'Q712226', ha: 'Q35852', m2: 'Q25343', mi2: 'Q232291', acre: 'Q81292', m: 'Q11573', ft: 'Q3710' } },
        gazetteer: {
          about: 'Names for search: OS Open Names (settlements, hills, water, islands, stations, airports, ports, hospitals, universities, numbered roads; not the 0.9 million street names, woods or schools), postcode districts (mean of their postcodes), named rivers of 5 km or more (OS Open Rivers), ONS countries, regions, counties, districts and national parks, the landscape designations, and Wikidata settlements of Northern Ireland',
          kinds: { City: 'city', Town: 'town', Village: 'village', Hamlet: 'hamlet', 'Suburban Area': 'suburb', 'Other Settlement': 'settlement',
            'Hill Or Mountain': 'hill', 'Hill Or Mountain Ranges': 'range', Island: 'island', 'Group Of Islands': 'islands', 'Coastal Headland': 'headland', Valley: 'valley', Beach: 'beach',
            'Inland Water': 'water', Bay: 'bay', Estuary: 'estuary', Sea: 'sea', 'Tidal Water': 'tidal', Waterfall: 'waterfall',
            'Railway Station': 'station', Airport: 'airport', Airfield: 'airfield', Harbour: 'harbour', 'Port Consisting of Docks and Nautical Berthing': 'port',
            'Vehicular Ferry Terminal': 'ferry', 'Passenger Ferry Terminal': 'ferry', 'Bus Station': 'bus', 'Bus Station,Coach Station': 'bus', 'Coach Station': 'bus',
            Hospital: 'hospital', 'Higher or University Education': 'university', 'Numbered Road': 'road', 'Urban Greenspace': 'park' },
          kindLabels: { city: 'city', town: 'town', village: 'village', hamlet: 'hamlet', suburb: 'suburb or district of a town', settlement: 'settlement', pcd: 'postcode district',
            hill: 'hill or mountain', range: 'hills or mountain range', island: 'island', islands: 'group of islands', headland: 'headland', valley: 'valley', beach: 'beach',
            water: 'lake or reservoir', bay: 'bay', estuary: 'estuary', sea: 'sea', tidal: 'tidal water', waterfall: 'waterfall', river: 'river',
            station: 'railway station', airport: 'airport', airfield: 'airfield', harbour: 'harbour', port: 'port', ferry: 'ferry terminal', bus: 'bus or coach station',
            hospital: 'hospital', university: 'university or college', road: 'numbered road', park: 'urban park',
            country: 'country', region: 'region of England', county: 'county or unitary authority', district: 'local authority district', np: 'national park', landscape: 'national landscape or scenic area' },
          kindRank: { city: 100, country: 99, region: 92, town: 90, np: 88, county: 85, district: 84, landscape: 80, suburb: 70, station: 66, airport: 65, island: 64, village: 60,
            river: 58, islands: 57, range: 56, hill: 50, water: 48, estuary: 47, bay: 46, sea: 45, university: 44, hospital: 43, harbour: 42, port: 42, ferry: 41, headland: 40,
            pcd: 38, road: 36, airfield: 35, bus: 34, valley: 30, beach: 29, park: 28, waterfall: 27, tidal: 26, hamlet: 25, settlement: 20 },
          populatedKinds: ['city', 'town', 'village', 'hamlet', 'suburb', 'settlement'],
          partKinds: ['city', 'town', 'village'],
          minRiverM: 5000,
          // generic first words: a name is also filed and matched without them ('Thames' finds River Thames)
          prefixes: ['River', 'Afon', 'Abhainn', 'Loch', 'Lough', 'Llyn', 'Lake', 'Mount', 'Isle of', 'Isle', 'Ynys', 'The'],
          labels: { national: { kinds: ['city', 'town'], minPop: 100000, orKinds: ['city'] }, regional: { kinds: ['city', 'town'] }, city: { kinds: ['city', 'town', 'village', 'suburb', 'settlement'] } },
        },
        // what manifest.json says of each layer: title, geometry, properties, a sentence template for screen readers
        // ({key} from the properties; a [bracketed part] is left out when a key in it has no value), sources
        manifest: {
          about: 'Skeleton of the United Kingdom for the globe of the Three.js port (OKR KR2.7): open vector layers simplified for national to city scale, a gazetteer and place cards. Great Britain for the OS layers (OS OpenData has no Northern Ireland); the whole UK for the ONS boundaries and the Wikidata places.',
          layers: [
            { id: 'countries', title: 'Countries', geometry: 'Polygon', properties: { code: 'ONS code', name: 'name', nameCy: 'Welsh name' }, describe: '{name}, a country of the United Kingdom (ONS code {code}).', sources: ['ons-boundaries'],
              levelNotes: { 3: 'ONS ultra generalised (BUC) boundaries', 6: 'ONS generalised (BGC) boundaries' } },
            { id: 'regions', title: 'Regions of England', geometry: 'Polygon', properties: { code: 'ONS code', name: 'name' }, describe: '{name}, a region of England (ONS code {code}).', sources: ['ons-boundaries'] },
            { id: 'counties', title: 'Counties and unitary authorities', geometry: 'Polygon', properties: { code: 'ONS code', name: 'name', nameCy: 'Welsh name' }, describe: '{name}, a county or unitary authority (ONS code {code}).', sources: ['ons-boundaries'] },
            { id: 'districts', title: 'Local authority districts', geometry: 'Polygon', properties: { code: 'ONS code', name: 'name', nameCy: 'Welsh name', pop2021: 'usual residents, Census 2021 (England and Wales only)' }, describe: '{name}, a local authority district (ONS code {code})[; {pop2021} usual residents in the 2021 census].', sources: ['ons-boundaries', 'ons-census-2021'] },
            { id: 'boundaries', title: 'Coastline and boundary lines', geometry: 'LineString', properties: { kind: 'coast, country, region, county or district', name: 'the country of a coast line', left: 'area on one side', right: 'area on the other side' }, describe: 'A {kind} line[ of {name}][ between {left} and {right}].', sources: ['ons-boundaries'],
              levelNotes: { 3: 'coast and country lines only', 6: 'coast, country, region and county lines', 8: 'all, with district lines' } },
            { id: 'roads', title: 'Motorways and A roads', geometry: 'LineString', properties: { kind: 'motorway, primary A road or A road', ref: 'road number', name: 'road name' }, describe: '[{ref}, ]a {kind}[ ({name})].', sources: ['os-zoomstack'],
              levelNotes: { 3: 'motorways', 6: 'motorways and primary A roads', 8: 'motorways and all A roads' } },
            { id: 'rail', title: 'Railways', geometry: 'LineString', properties: { kind: 'railway or narrow gauge railway' }, describe: 'A {kind}.', sources: ['os-zoomstack'] },
            { id: 'stations', title: 'Rail, metro and tram stations', geometry: 'Point', properties: { name: 'name', kind: 'rail station or metro or tram station', atco: 'NaPTAN ATCO code' }, describe: '{name}, a {kind}.', sources: ['naptan'] },
            { id: 'rivers', title: 'Rivers and canals', geometry: 'LineString', properties: { name: 'name', nameAlt: 'name in Welsh or Gaelic', kind: 'river, tidal river or canal', lengthKm: 'length of the named watercourse' }, describe: '{name}, a {kind} of about {lengthKm} km.', sources: ['os-open-rivers'],
              levelNotes: { 6: 'named watercourses of 40 km or more', 8: 'named watercourses of 8 km or more' } },
            { id: 'lakes', title: 'Lakes, reservoirs and wide rivers', geometry: 'Polygon', properties: { kind: 'water', areaKm2: 'area in square kilometres' }, describe: 'Water, about {areaKm2} square kilometres.', sources: ['os-zoomstack'],
              levelNotes: { 6: 'areas of 2 km2 or more', 8: 'areas of 0.1 km2 or more' } },
            { id: 'built-up', title: 'Built-up areas', geometry: 'Polygon', properties: { code: 'ONS / OS code', name: 'name', nameAlt: 'other-language name', areaKm2: 'area' }, describe: '{name}, a built-up area of {areaKm2} square kilometres.', sources: ['os-built-up-areas'],
              levelNotes: { 6: 'areas of 5 km2 or more', 8: 'areas of 0.2 km2 or more' } },
            { id: 'national-parks', title: 'National parks', geometry: 'Polygon', properties: { code: 'ONS code', name: 'name', nameCy: 'Welsh name', designation: 'National Park' }, describe: '{name}, a national park.', sources: ['ons-boundaries'] },
            { id: 'landscapes', title: 'National landscapes and national scenic areas', geometry: 'Polygon', properties: { name: 'name', designation: 'designation', designated: 'date of designation', source: 'source id' }, describe: '{name}, a {designation}[, designated {designated}].', sources: ['natural-england-aonb', 'nrw-aonb', 'scotgov-nsa'] },
            { id: 'places', title: 'Place labels', geometry: 'Point', properties: { name: 'name', nameAlt: 'other-language name', kind: 'city, town, village, suburb or settlement', pop: 'population (Wikidata)', wd: 'Wikidata QID (card)', district: 'local authority district' }, describe: '{name}, a {kind}[ in {district}][, population {pop}].', sources: ['os-open-names', 'wikidata', 'ons-boundaries'],
              levelNotes: { 3: 'cities and towns of 100,000 or more', 6: 'cities and towns', 8: 'cities, towns, villages, suburbs and other settlements (not hamlets)' } },
          ],
          sources: {
            'ons-boundaries': { name: 'ONS Open Geography Portal: countries, regions, counties and unitary authorities, local authority districts (December 2024, BUC and BGC), national parks (December 2022, BGC), LAD22 to LAD23 lookup', licence: 'OGL v3.0', url: 'https://geoportal.statistics.gov.uk/', attribution: 'Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2024' },
            'ons-census-2021': { name: 'Census 2021 TS001, usual residents by local authority (England and Wales), Nomis bulk download', licence: 'OGL v3.0', url: 'https://www.nomisweb.co.uk/sources/census_2021_bulk', attribution: 'Source: Office for National Statistics, Census 2021, licensed under the Open Government Licence v3.0' },
            'os-zoomstack': { name: 'OS Open Zoomstack (roads_national, roads_regional, rail, surfacewater)', licence: 'OGL v3.0 (OS OpenData)', url: 'https://www.ordnancesurvey.co.uk/products/os-open-zoomstack', attribution: 'Contains OS data © Crown copyright and database right 2026' },
            'os-open-names': { name: 'OS Open Names', licence: 'OGL v3.0 (OS OpenData)', url: 'https://www.ordnancesurvey.co.uk/products/os-open-names', attribution: 'Contains OS data © Crown copyright and database right 2026; contains Royal Mail data © Royal Mail copyright and database right 2026 (postcodes)' },
            'os-open-rivers': { name: 'OS Open Rivers', licence: 'OGL v3.0 (OS OpenData)', url: 'https://www.ordnancesurvey.co.uk/products/os-open-rivers', attribution: 'Contains OS data © Crown copyright and database right 2026' },
            'os-built-up-areas': { name: 'OS Open Built Up Areas', licence: 'OGL v3.0 (OS OpenData)', url: 'https://www.ordnancesurvey.co.uk/products/os-open-built-up-areas', attribution: 'Contains OS data © Crown copyright and database right 2026' },
            naptan: { name: 'NaPTAN (National Public Transport Access Nodes), DfT', licence: 'OGL v3.0', url: 'https://beta-naptan.dft.gov.uk/', attribution: 'Contains DfT NaPTAN data © Crown copyright, licensed under the Open Government Licence v3.0' },
            'natural-england-aonb': { name: 'Areas of Outstanding Natural Beauty (England), Natural England', licence: 'OGL v3.0', url: 'https://naturalengland-defra.opendata.arcgis.com/', attribution: '© Natural England copyright. Contains Ordnance Survey data © Crown copyright and database right' },
            'nrw-aonb': { name: 'Areas of Outstanding Natural Beauty (Wales), Natural Resources Wales', licence: 'OGL v3.0', url: 'https://datamap.gov.wales/', attribution: 'Contains Natural Resources Wales information © Natural Resources Wales and database right. Contains Ordnance Survey data' },
            'scotgov-nsa': { name: 'National Scenic Areas, Scottish Government (spatialdata.gov.scot)', licence: 'OGL v3.0', url: 'https://www.spatialdata.gov.scot/', attribution: '© Scottish Government, contains Ordnance Survey data © Crown copyright and database right' },
            wikidata: { name: 'Wikidata (through QLever)', licence: 'CC0 1.0', url: 'https://www.wikidata.org/', attribution: 'Wikidata (CC0)' },
          },
          credits: 'Contains OS data © Crown copyright and database right 2026. Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains DfT NaPTAN data, Natural England, Natural Resources Wales and Scottish Government information, licensed under the Open Government Licence v3.0. Contains Royal Mail data © Royal Mail copyright and database right 2026. Place facts: Wikidata (CC0).',
        },
      },
    },
  ],
};
