# Open data feeds for a Docklands model

A catalogue of public data sources, feeds and APIs for an open-data 3D model of London Docklands. Generated 2026-10-02. Machine-readable version: [feeds.json](https://danbri.github.io/londat/cwplans/feeds/feeds.json). Re-check script: `node cwplans/feeds/check-feeds.mjs`.

**Survey of 2026-10-03:** 341 more sources in seven areas (courts and registers; national government and regulators; London and local government; police and safety; river and water; property and rentals; web data, dataset search and MCP servers), merged into feeds.json with an `area` field. Tables and the sources left out: [SURVEY-2026-10-03.md](SURVEY-2026-10-03.md).

Area: Canary Wharf and the Isle of Dogs (E14) first; SE16 (Rotherhithe, Surrey Quays, Canada Water, east Bermondsey), Limehouse, Wapping, Greenwich and North Greenwich (SE10), Deptford, Cody Dock and Bow Creek / Leamouth (E16), and the Thames from London Bridge to Canary Wharf. Reference point for samples: 51.505, -0.02 (Canary Wharf).

200 sources: 181 verified, 4 verified but needing a free key, 15 not verified. "Verified" means the page and the sample request were fetched on 2026-10-02 and returned HTTP 2xx (sample results below are from that check). "CORS" means the sample response carried `Access-Control-Allow-Origin` of `*` or `https://danbri.github.io`, so a page on GitHub Pages can call it directly. No API keys are stored here.

Only official, published or openly licensed sources are listed, and only cameras their owners publish for public viewing. See [Excluded](#excluded) for what was left out and why.

## Callable live from a static page

74 sources need no key and send CORS headers. A browser page can fetch the sample URL as it stands. Check each licence for attribution. Rate limits apply; cache where you can.

| Source | Category | Update | Sample request |
|---|---|---|---|
| EA flood-monitoring API: stations near Canary Wharf | tides and river levels | minutes | <https://environment.data.gov.uk/flood-monitoring/id/stations?lat=51.505&long=-0.02&dist=8> |
| Tower Pier tide gauge (0007), latest reading | tides and river levels | minutes | <https://environment.data.gov.uk/flood-monitoring/id/stations/0007/readings?latest> |
| Silvertown tide gauge (0001), latest reading | tides and river levels | minutes | <https://environment.data.gov.uk/flood-monitoring/id/stations/0001/readings?latest> |
| Charlton tide gauge (0003), latest reading | tides and river levels | minutes | <https://environment.data.gov.uk/flood-monitoring/id/stations/0003/readings?latest> |
| EA Hydrology API (historic levels, flows, rainfall) | tides and river levels | daily | <https://environment.data.gov.uk/hydrology/id/stations?lat=51.505&long=-0.02&dist=10> |
| Thames Barrier level differences (DIFF_* stations) | flood warnings and Thames Barrier | minutes | <https://environment.data.gov.uk/flood-monitoring/id/stations/DIFF_TB3_TB1/readings?latest> |
| EA live flood warnings near Canary Wharf | flood warnings and Thames Barrier | minutes | <https://environment.data.gov.uk/flood-monitoring/id/floods?lat=51.505&long=-0.02&dist=10> |
| EA flood warning areas (Isle of Dogs, Rotherhithe, Greenwich) | flood warnings and Thames Barrier | static | <https://environment.data.gov.uk/flood-monitoring/id/floodAreas?lat=51.505&long=-0.02&dist=3> |
| EA spatial flood defences (Thames river walls, crest levels) | flood warnings and Thames Barrier | daily | <https://environment.data.gov.uk/spatialdata/spatial-flood-defences-including-standardised-attributes/ogc/features/v1/collections/Spatial_Flood_Defences_Including_Standardised_Attributes/items?bbox=-0.03,51.49,-0.005,51.51&limit=5&f=json> |
| Thames Estuary 2100 extreme water level nodes | flood warnings and Thames Barrier | static | <https://environment.data.gov.uk/spatialdata/thames-estuary-2100-extreme-water-level-nodes/wfs?service=WFS&request=GetCapabilities> |
| EA rainfall gauge 289102TP (Greenwich) | weather and forecasts | minutes | <https://environment.data.gov.uk/flood-monitoring/id/stations/289102TP/readings?latest> |
| Open-Meteo forecast for Canary Wharf | weather and forecasts | hourly | <https://api.open-meteo.com/v1/forecast?latitude=51.505&longitude=-0.02&current=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover&hourly=temperature_2m,precipitation&timezone=Europe/London&forecast_days=2> |
| Open-Meteo historical weather | weather and forecasts | daily | <https://archive-api.open-meteo.com/v1/archive?latitude=51.505&longitude=-0.02&start_date=2026-09-01&end_date=2026-09-07&daily=temperature_2m_max,precipitation_sum&timezone=Europe/London> |
| MET Norway Locationforecast for Canary Wharf | weather and forecasts | hourly | <https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=51.505&lon=-0.02> |
| MET Norway Sunrise API (sun and moon times) | weather and forecasts | static (computed) | <https://api.met.no/weatherapi/sunrise/3.0/sun?lat=51.505&lon=-0.02&date=2026-10-02&offset=+01:00> |
| RainViewer radar tiles index | weather and forecasts | minutes | <https://api.rainviewer.com/public/weather-maps.json> |
| Open-Meteo air quality forecast | air quality | hourly | <https://air-quality-api.open-meteo.com/v1/air-quality?latitude=51.505&longitude=-0.02&current=pm10,pm2_5,nitrogen_dioxide,ozone,european_aqi> |
| London Air (LAQN) API: monitoring sites | air quality | hourly | <https://api.erg.ic.ac.uk/AirQuality/Information/MonitoringSites/GroupName=London/Json> |
| LAQN hourly index: Tower Hamlets – Blackwall (TH4) | air quality | hourly | <https://api.erg.ic.ac.uk/AirQuality/Hourly/MonitoringIndex/SiteCode=TH4/Json> |
| LAQN raw data: Tower Hamlets – Millwall Park (TH6) | air quality | hourly | <https://api.erg.ic.ac.uk/AirQuality/Data/Site/SiteCode=TH6/StartDate=2026-10-01/EndDate=2026-10-02/Json> |
| LAQN daily air quality index for London | air quality | daily | <https://api.erg.ic.ac.uk/AirQuality/Daily/MonitoringIndex/Latest/GroupName=London/Json> |
| DEFRA UK-AIR | air quality | hourly | <https://uk-air.defra.gov.uk/sos-ukair/api/v1/stations/1158> |
| Sensor.Community particulate sensors near Canary Wharf | air quality | minutes | <https://data.sensor.community/airrohr/v1/filter/area=51.505,-0.02,3> |
| TfL air quality forecast | air quality | daily | <https://api.tfl.gov.uk/AirQuality> |
| Thames Water storm overflow activity (National Storm Overflow Hub feature service) | water quality | minutes | <https://services2.arcgis.com/g6o32ZDQ33GpCIu3/arcgis/rest/services/Thames_Water_Storm_Overflow_Activity_(Production)_view/FeatureServer/0/query?geometry=-0.12%2C51.47%2C0.08%2C51.53&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=Id%2CStatus%2CStatusStart%2CLatestEventStart%2CLatestEventEnd%2CReceivingWaterCourse%2CLatitude%2CLongitude&returnGeometry=false&f=json> |
| EA Water Quality Archive | water quality | monthly | <https://environment.data.gov.uk/water-quality/sampling-point?latitude=51.505&longitude=-0.02&radius=3&limit=10> |
| data.police.uk street-level crime near Canary Wharf | safety and crime | monthly | <https://data.police.uk/api/crimes-street/all-crime?lat=51.505&lng=-0.02> |
| data.police.uk neighbourhood lookup | safety and crime | static | <https://data.police.uk/api/locate-neighbourhood?q=51.505,-0.02> |
| data.police.uk last updated date | safety and crime | monthly | <https://data.police.uk/api/crime-last-updated> |
| TfL Unified API | traffic and transport | realtime | <https://api.tfl.gov.uk/StopPoint/HUBCAW> |
| TfL arrivals: Canary Wharf (Jubilee line) | traffic and transport | realtime | <https://api.tfl.gov.uk/StopPoint/940GZZLUCYF/Arrivals> |
| TfL arrivals: Canary Wharf DLR | traffic and transport | realtime | <https://api.tfl.gov.uk/StopPoint/940GZZDLCAN/Arrivals> |
| TfL arrivals: Canary Wharf (Elizabeth line) | traffic and transport | realtime | <https://api.tfl.gov.uk/StopPoint/910GCANWHRF/Arrivals> |
| TfL arrivals: Canada Water (Jubilee line) | traffic and transport | realtime | <https://api.tfl.gov.uk/StopPoint/940GZZLUCWR/Arrivals> |
| TfL arrivals: Canary Wharf Pier (Uber Boat by Thames Clippers) | traffic and transport | realtime | <https://api.tfl.gov.uk/StopPoint/930GCAW/Arrivals> |
| TfL piers within 3 km of Canary Wharf | traffic and transport | static | <https://api.tfl.gov.uk/StopPoint?lat=51.505&lon=-0.02&stopTypes=NaptanFerryPort&radius=3000> |
| TfL line status (Jubilee, DLR, Elizabeth, Windrush, cable car) | traffic and transport | realtime | <https://api.tfl.gov.uk/Line/jubilee,dlr,elizabeth,windrush,london-cable-car/Status> |
| TfL road disruptions (London-wide; filter to E14 client-side) | traffic and transport | minutes | <https://api.tfl.gov.uk/Road/all/Disruption?stripContent=true> |
| Santander Cycles docks near Canary Wharf | traffic and transport | minutes | <https://api.tfl.gov.uk/Place?type=BikePoint&lat=51.505&lon=-0.02&radius=1000> |
| TfL station crowding (live) | traffic and transport | minutes | <https://api.tfl.gov.uk/crowding/940GZZLUCYF/Live> |
| TfL bus arrivals: Canary Wharf Station stop F | traffic and transport | realtime | <https://api.tfl.gov.uk/StopPoint/490000038F/Arrivals> |
| DfT road traffic counts (count points near Canary Wharf) | traffic and transport | yearly | <https://roadtraffic.dft.gov.uk/api/count-points?filter[local_authority_id]=93&page[size]=5> |
| TfL JamCam traffic cameras near Canary Wharf | webcams | minutes | <https://api.tfl.gov.uk/Place?type=JamCam&lat=51.505&lon=-0.02&radius=2000> |
| planning.data.gov.uk API (conservation areas, listed buildings, TPOs, Article 4) | planning applications | daily | <https://www.planning.data.gov.uk/entity.json?dataset=conservation-area&geometry=POLYGON((-0.03%2051.495,-0.005%2051.495,-0.005%2051.51,-0.03%2051.51,-0.03%2051.495))&geometry_relation=intersects&limit=10> |
| OS OpenData downloads | geodata | quarterly | <https://api.os.uk/downloads/v1/products> |
| EA LiDAR Composite DTM 1 m (WCS) | geodata | yearly | <https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs?service=WCS&version=2.0.1&request=DescribeCoverage&CoverageId=13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m> |
| EA LiDAR Composite first-return DSM 1 m (WCS) | geodata | yearly | <https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-first-return-dsm-1m/wcs?service=WCS&version=2.0.1&request=GetCapabilities> |
| OpenStreetMap API 0.6 (map call) | geodata | realtime | <https://api.openstreetmap.org/api/0.6/map.json?bbox=-0.0210,51.5040,-0.0180,51.5060> |
| Nominatim geocoder | geodata | minutes | <https://nominatim.openstreetmap.org/search?q=Canada+Square,+London&format=json&limit=1> |
| Wikidata Query Service (items within 500 m of Canary Wharf) | geodata | realtime | <https://query.wikidata.org/sparql?format=json&query=SELECT%20%3Fitem%20%3FitemLabel%20%3Fcoord%20WHERE%20%7B%20SERVICE%20wikibase%3Aaround%20%7B%20%3Fitem%20wdt%3AP625%20%3Fcoord%20.%20bd%3AserviceParam%20wikibase%3Acenter%20%22Point(-0.02%2051.505)%22%5E%5Egeo%3AwktLiteral%20.%20bd%3AserviceParam%20wikibase%3Aradius%20%220.5%22%20.%20%7D%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22en%22%20.%20%7D%20%7D%20LIMIT%2020> |
| Wikipedia GeoSearch (articles near Canary Wharf) | geodata | realtime | <https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=51.505%7C-0.02&gsradius=2000&gslimit=20&format=json&origin=*> |
| Wikimedia Commons photos near Canary Wharf | geodata | realtime | <https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gsnamespace=6&gscoord=51.505%7C-0.02&gsradius=1000&gslimit=20&format=json&origin=*> |
| BGS OGC API – Features (geology, boreholes) | geodata | irregular | <https://ogcapi.bgs.ac.uk/collections?f=json> |
| BGS geology 1:50k WMS | geodata | static | <https://map.bgs.ac.uk/arcgis/services/BGS_Detailed_Geology/MapServer/WMSServer?service=WMS&request=GetCapabilities> |
| postcodes.io (postcodes, wards, LSOAs near a point) | geodata | quarterly | <https://api.postcodes.io/postcodes?lon=-0.02&lat=51.505> |
| Copernicus Data Space Ecosystem STAC (Sentinel-2 over Docklands) | satellite and aerial imagery | daily (revisit ~5 days) | <https://stac.dataspace.copernicus.eu/v1/search?collections=sentinel-2-l2a&bbox=-0.08,51.48,0.03,51.52&limit=3&sortby=-datetime> |
| Copernicus Data Space OData catalogue | satellite and aerial imagery | daily | <https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=Collection/Name%20eq%20'SENTINEL-2'%20and%20OData.CSC.Intersects(area=geography'SRID=4326;POINT(-0.02%2051.505)')&$top=3&$orderby=ContentDate/Start%20desc> |
| Element 84 Earth Search STAC (Sentinel-2 COGs on AWS) | satellite and aerial imagery | daily | <https://earth-search.aws.element84.com/v1/search?collections=sentinel-2-l2a&bbox=-0.08,51.48,0.03,51.52&limit=3> |
| Microsoft Planetary Computer STAC | satellite and aerial imagery | daily | <https://planetarycomputer.microsoft.com/api/stac/v1/search?collections=sentinel-2-l2a&bbox=-0.08,51.48,0.03,51.52&limit=3> |
| NASA GIBS WMTS (daily global imagery) | satellite and aerial imagery | daily | <https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-09-30/GoogleMapsCompatible_Level9/6/21/31.jpg> |
| Carbon Intensity API: forecast for E14 | energy and environment | half-hourly | <https://api.carbonintensity.org.uk/regional/postcode/E14> |
| UK Power Networks Open Data Portal | energy and environment | daily | <https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets?limit=5> |
| UK Power Networks live faults (power cuts) | energy and environment | minutes | <https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-live-faults/records?limit=5> |
| Elexon Insights API (GB generation by fuel) | energy and environment | half-hourly | <https://data.elexon.co.uk/bmrs/api/v1/generation/outturn/summary> |
| NESO data portal | energy and environment | daily | <https://api.neso.energy/api/3/action/package_list> |
| GBIF species occurrences on the Isle of Dogs | nature and biodiversity | daily | <https://api.gbif.org/v1/occurrence/search?decimalLatitude=51.48,51.51&decimalLongitude=-0.04,0.0&limit=5> |
| NBN Atlas records near Canary Wharf | nature and biodiversity | weekly | <https://records-ws.nbnatlas.org/occurrences/search?lat=51.505&lon=-0.02&radius=1&pageSize=5> |
| data.gov.uk (CKAN API) | open data portals | daily | <https://ckan.publishing.service.gov.uk/api/3/action/package_search?q=docklands&rows=3> |
| Nomis API (Census 2021 and labour market by small area) | open data portals | monthly | <https://www.nomisweb.co.uk/api/v01/dataset/NM_2021_1.data.json?geography=E09000030&measures=20100> |
| ONS API | open data portals | daily | <https://api.beta.ons.gov.uk/v1/datasets?limit=3> |
| HM Land Registry Price Paid Data (linked data) | places and infrastructure (public records) | monthly | <https://landregistry.data.gov.uk/data/ppi/transaction-record.json?propertyAddress.street=WESTFERRY%20ROAD&propertyAddress.town=LONDON&_pageSize=5> |
| UK House Price Index (Tower Hamlets) | places and infrastructure (public records) | monthly | <https://landregistry.data.gov.uk/data/ukhpi/region/tower-hamlets/month/2025-06.json> |
| Food Standards Agency hygiene ratings near Canary Wharf | places and infrastructure (public records) | daily | <https://api.ratings.food.gov.uk/Establishments?latitude=51.505&longitude=-0.02&maxDistanceLimit=0.3&pageSize=5> |
| Listed buildings near Canary Wharf (planning.data.gov.uk) | places and infrastructure (public records) | weekly | <https://www.planning.data.gov.uk/entity.json?dataset=listed-building&geometry=POLYGON((-0.03%2051.495,-0.005%2051.495,-0.005%2051.51,-0.03%2051.51,-0.03%2051.495))&geometry_relation=intersects&limit=10> |

Caveats for some of these:

- FSA ratings needs the request header `x-api-version: 2` (its CORS preflight allows it).
- EA Water Quality needs `Accept: application/geo+json` (or `application/ld+json`); it refuses `application/json`.
- MET Norway asks for an identifying User-Agent; a browser cannot set one, so heavy use should go through a cache.
- Open-Meteo is free for non-commercial use only, and the shared proxy here hit its daily limit once (HTTP 429).
- Wikimedia APIs rate-limited this session's shared address (HTTP 429) on some checks.
- Not CORS-enabled although keyless: Aviation Weather METAR/TAF, NWS METAR text, DEFRA forecast RSS, NaPTAN, OpenSky (its header names its own origin), adsb.lol, USGS Landsat STAC (same), London Datastore CKAN, Planning London Datahub. These need a small server-side relay or a build-time fetch.

## Useful identifiers near Canary Wharf

- **Tide gauges (EA flood-monitoring API):** `0007` Tower Pier (51.5068, −0.0787), `0001` Silvertown (51.4975, 0.0526), `0003` Charlton (51.4969, 0.0204), `0006` Westminster. Readings are tidal level in m AOD every 15 minutes. At 21:30 UTC on 2026-10-02 Tower Pier read −1.038 m and Silvertown −1.483 m.
- **Thames Barrier signal:** stations `DIFF_TB3_TB1` (labelled "Silvertown and Tower Pier"), `DIFF_TB2_TB1`, `DIFF_TB3_TB9`, `DIFF_TB2_TB9` and the `DIFF_*UR_*DR` pairs (upriver/downriver at the barrier) publish level differences across the barrier. A large difference suggests a closure; that reading is ours, not EA documentation.
- **Flood warning areas:** `063FWT23IoDA` and `063FWT23IoDB` (Isle of Dogs north and south of South Dock), `063FWT23BermA`–`D` (Deptford Creek to London Bridge, south bank), `063FWT23City` (Limehouse Basin to Blackfriars), `063FWT23Greenwch` (Woolwich Arsenal to Deptford Creek).
- **Rainfall:** EA gauge `289102TP` at 51.4765, −0.0179 (returned no latest reading at check time).
- **Air quality (LAQN):** `TH4` Blackwall, `TH6` Millwall Park (Isle of Dogs), `TH7` King Edward Memorial Park (Wapping/Limehouse, next to the Tideway shaft), `TL5` Hoola Tower and `TL6` Britannia Gate (Royal Docks), `TL4` Tunnel Avenue and `GN6` John Harrison Way (Greenwich Peninsula), `GN5` Trafalgar Road, `SK5` Old Kent Road. DEFRA AURN: Tower Hamlets Roadside (Mile End Road; SOS station `1158` for NO2).
- **Storm overflows:** 26 Thames Water EDM monitors in the London Bridge–Greenwich box (e.g. `TWL00658` by King Edward Memorial Park, whose receiving water is now given as "River Thames (via the Tideway tunnel)"). None was discharging at the time of the check; 2 were offline.
- **Flood defences:** the EA spatial flood defences layer gives each tidal wall segment with design crest level (5.23 m AOD on the east Isle of Dogs) and surveyed crest level.
- **TfL stop points:** `HUBCAW` Canary Wharf hub; `940GZZLUCYF` Jubilee; `940GZZDLCAN` DLR; `910GCANWHRF` Elizabeth line; `940GZZLUCWR` Canada Water (Jubilee), `910GCNDAW` (Overground); bus `490000038F`. Piers: `930GCAW` Canary Wharf, `930GMHT` Masthouse Terrace, `930GGLP` Greenland (Surrey Quays), `930GNEL` Rotherhithe, `930GGNW` Greenwich, `930GMIL` North Greenwich, `930GEIB` East India, `930GWAP` Wapping.
- **JamCams:** 41 TfL cameras within 2 km, incl. Aspen Way, the Limehouse Link portals, Westferry Road and A13 junctions.
- **Police:** neighbourhood `E05009323` (Metropolitan Police). Latest street-level month at check time: 2026-08.
- **Carbon intensity:** E14 is region 13, "UKPN London".
- **Boroughs:** ONS `E09000030` Tower Hamlets, `E09000028` Southwark, `E09000011` Greenwich, `E09000025` Newham, `E09000023` Lewisham. DfT traffic-count authority ids: 93, 103, 105, 167, 104.
- **Conservation area:** `TH-19-WID` West India Dock.
- **Postcodes:** the reference point is nearest to E14 5AB, ward Canary Wharf, LSOA Tower Hamlets 033B.

## Tides and river levels

- **EA flood-monitoring API: stations near Canary Wharf** (Environment Agency). [page](https://environment.data.gov.uk/flood-monitoring/doc/reference) · API: `https://environment.data.gov.uk/flood-monitoring/id/stations`
  - Sample: <https://environment.data.gov.uk/flood-monitoring/id/stations?lat=51.505&long=-0.02&dist=8>
  - Auth: none. Licence: Open Government Licence v3.0. Update: minutes. CORS: yes. Status: verified.
  - Coverage: England; 26 stations within 8 km of Canary Wharf.
  - Returned: 26 stations within 8 km, incl. 0007 Tower Pier, 0001 Silvertown, 0003 Charlton, 0006 Westminster (Thames Tideway), DIFF_* barrier stations and 4 rainfall gauges.
  - Thames Tideway gauges near the area: 0007 Tower Pier, 0001 Silvertown, 0003 Charlton, 0006 Westminster. Also Thames Barrier differential stations (DIFF_*) and rainfall gauge 289102TP (Greenwich, 51.4765,-0.0179).
- **Tower Pier tide gauge (0007), latest reading** (Environment Agency). [page](https://check-for-flooding.service.gov.uk/river-and-sea-levels) · API: `https://environment.data.gov.uk/flood-monitoring/id/stations/0007`
  - Sample: <https://environment.data.gov.uk/flood-monitoring/id/stations/0007/readings?latest>
  - Auth: none. Licence: Open Government Licence v3.0. Update: minutes. CORS: yes. Status: verified.
  - Coverage: Thames at Tower Pier (51.5068,-0.0787), nearest upstream gauge to Canary Wharf.
  - Returned: Latest: 2026-10-02T21:30Z, −1.038 m AOD (measure 0007-level-tidal_level-i-15_min-mAOD).
  - Tidal level in metres; 15-minute readings.
- **Silvertown tide gauge (0001), latest reading** (Environment Agency). [page](https://environment.data.gov.uk/flood-monitoring/id/stations/0001.html) · API: `https://environment.data.gov.uk/flood-monitoring/id/stations/0001`
  - Sample: <https://environment.data.gov.uk/flood-monitoring/id/stations/0001/readings?latest>
  - Auth: none. Licence: Open Government Licence v3.0. Update: minutes. CORS: yes. Status: verified.
  - Coverage: Thames at Silvertown (51.4975,0.0526), downstream of the Isle of Dogs.
  - Returned: Latest: 2026-10-02T21:30Z, −1.483 m AOD.
- **Charlton tide gauge (0003), latest reading** (Environment Agency). [page](https://environment.data.gov.uk/flood-monitoring/id/stations/0003.html) · API: `https://environment.data.gov.uk/flood-monitoring/id/stations/0003`
  - Sample: <https://environment.data.gov.uk/flood-monitoring/id/stations/0003/readings?latest>
  - Auth: none. Licence: Open Government Licence v3.0. Update: minutes. CORS: yes. Status: verified.
  - Coverage: Thames at Charlton (51.4969,0.0204), just upstream of the Thames Barrier.
  - Returned: Latest: 2026-10-02T21:30Z, −1.364 m AOD.
- **EA Hydrology API (historic levels, flows, rainfall)** (Environment Agency). [page](https://environment.data.gov.uk/hydrology/doc/reference) · API: `https://environment.data.gov.uk/hydrology/id/stations`
  - Sample: <https://environment.data.gov.uk/hydrology/id/stations?lat=51.505&long=-0.02&dist=10>
  - Auth: none. Licence: Open Government Licence v3.0. Update: daily. CORS: yes. Status: verified.
  - Coverage: England; long archives of quality-checked readings.
  - Returned: 100 stations within 10 km, incl. Rotherhithe, Deptford, Charlton, Thames Barrier Gardens Pier.
  - Use for history; the flood-monitoring API is for the last 4 weeks.
- **PLA tide predictions and live gauges** (Port of London Authority). [page](https://tidepredictions.pla.co.uk/)
  - Auth: none (web page). Licence: PLA terms; not stated as open. Update: minutes. CORS: n/a. Status: **not verified** — HTTP 403 for page (Cloudflare browser challenge).
  - Coverage: PLA gauges incl. London Bridge and North Woolwich.
  - Site sits behind a Cloudflare browser challenge; scripted requests get 403.
- **PLA tidal information page** (Port of London Authority). [page](https://pla.co.uk/tidal-information)
  - Auth: none (web page). Licence: PLA terms. Update: minutes. CORS: n/a. Status: **not verified** — HTTP 403 for page (Cloudflare browser challenge).
  - Coverage: tidal Thames.
  - Cloudflare challenge for scripted requests.
- **ADMIRALTY EasyTide predictions** (UK Hydrographic Office). [page](https://easytide.admiralty.co.uk/) · API: `https://admiraltyapi.portal.azure-api.net/`
  - Auth: free key (UK Tidal API Discovery tier). Licence: UKHO terms (Crown copyright). Update: daily. CORS: no. Status: verified.
  - Coverage: Thames stations incl. 0113 London Bridge (Tower Pier).
  - API needs an Ocp-Apim-Subscription-Key header.
- **NTSLF real-time tide data (Sheerness, Thames estuary)** (National Oceanography Centre). [page](https://ntslf.org/tides/uk-network/realtime)
  - Auth: none. Licence: NOC/BODC terms. Update: minutes. CORS: n/a. Status: verified.
  - Coverage: UK National Tide Gauge Network; nearest gauge Sheerness.
  - Estuary context only; there is no NTSLF gauge in London.
- **PLA notices to mariners** (Port of London Authority). [page](https://pla.co.uk/notices-to-mariners)
  - Auth: none. Licence: PLA terms. Update: daily. CORS: n/a. Status: **not verified** — HTTP 403 for page (Cloudflare browser challenge).
  - Coverage: tidal Thames: river closures, events, works.
  - Cloudflare challenge for scripted requests.

## Flood warnings and Thames Barrier

- **Thames Barrier level differences (DIFF_* stations)** (Environment Agency). [page](https://environment.data.gov.uk/flood-monitoring/doc/reference) · API: `https://environment.data.gov.uk/flood-monitoring/id/stations/DIFF_TB3_TB1`
  - Sample: <https://environment.data.gov.uk/flood-monitoring/id/stations/DIFF_TB3_TB1/readings?latest>
  - Auth: none. Licence: Open Government Licence v3.0. Update: minutes. CORS: yes. Status: verified.
  - Coverage: Thames Barrier (51.4944,0.0264).
  - Returned: Latest: 2026-10-02T21:42Z, 0.41 m (station labelled "Silvertown and Tower Pier").
  - Level differences between gauges either side of the barrier (Silvertown–Tower Pier, Erith–Charlton, upriver/downriver sills). A large difference is a strong sign of a barrier closure. Interpretation is ours, not documented by the EA.
- **EA live flood warnings near Canary Wharf** (Environment Agency). [page](https://check-for-flooding.service.gov.uk/) · API: `https://environment.data.gov.uk/flood-monitoring/id/floods`
  - Sample: <https://environment.data.gov.uk/flood-monitoring/id/floods?lat=51.505&long=-0.02&dist=10>
  - Auth: none. Licence: Open Government Licence v3.0. Update: minutes. CORS: yes. Status: verified.
  - Coverage: England.
  - Returned: Empty items list (no warnings in force at the time).
  - Empty items list when no warning is in force.
- **EA flood warning areas (Isle of Dogs, Rotherhithe, Greenwich)** (Environment Agency). [page](https://environment.data.gov.uk/flood-monitoring/doc/reference) · API: `https://environment.data.gov.uk/flood-monitoring/id/floodAreas`
  - Sample: <https://environment.data.gov.uk/flood-monitoring/id/floodAreas?lat=51.505&long=-0.02&dist=3>
  - Auth: none. Licence: Open Government Licence v3.0. Update: static. CORS: yes. Status: verified.
  - Coverage: area codes 063FWT23IoDA, 063FWT23IoDB (Isle of Dogs), 063FWT23BermA–D (Deptford to London Bridge), 063FWT23City, 063FWT23Greenwch.
  - Returned: 22 areas within 3 km, e.g. 063FWT23IoDA "Tidal Thames at the Isle of Dogs north of South Dock".
  - Each area has a /polygon link for its outline.
- **Flood map for planning** (Environment Agency). [page](https://flood-map-for-planning.service.gov.uk/)
  - Auth: none. Licence: Open Government Licence v3.0. Update: static. CORS: n/a. Status: verified.
  - Coverage: England.
  - Flood zones; the data is also on the Defra data services platform.
- **The Thames Barrier (closures and operations)** (Environment Agency (GOV.UK)). [page](https://www.gov.uk/guidance/the-thames-barrier)
  - Auth: none. Licence: Open Government Licence v3.0. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: Thames Barrier.
  - Closure counts and schedule of test closures. No machine-readable closure feed was found; the DIFF_* gauge stations above are the nearest live signal.
- **EA spatial flood defences (Thames river walls, crest levels)** (Environment Agency). [page](https://environment.data.gov.uk/dataset/8e5be50f-d465-11e4-ba9a-f0def148f590) · API: `https://environment.data.gov.uk/spatialdata/spatial-flood-defences-including-standardised-attributes/ogc/features/v1`
  - Sample: <https://environment.data.gov.uk/spatialdata/spatial-flood-defences-including-standardised-attributes/ogc/features/v1/collections/Spatial_Flood_Defences_Including_Standardised_Attributes/items?bbox=-0.03,51.49,-0.005,51.51&limit=5&f=json>
  - Auth: none. Licence: Open Government Licence v3.0. Update: daily. CORS: yes. Status: verified.
  - Coverage: England; every tidal wall and embankment round the Isle of Dogs.
  - Returned: 5 tidal wall segments on the east side of the Isle of Dogs; design crest level 5.23 m AOD, surveyed crest 5.24–5.59 m AOD.
  - Each wall segment has protection_type (Tidal), design standard of protection and crest levels (design_ucl, actual_dcl, m AOD). Directly useful for modelling the river edge. Maintainer field can read "Private individual, Company or Charity" — do not try to identify them.
- **Thames Estuary 2100 extreme water level nodes** (Environment Agency). [page](https://environment.data.gov.uk/dataset/bf59ab69-d88e-4c3f-98cc-6cdb42627757) · API: `https://environment.data.gov.uk/spatialdata/thames-estuary-2100-extreme-water-level-nodes/wfs`
  - Sample: <https://environment.data.gov.uk/spatialdata/thames-estuary-2100-extreme-water-level-nodes/wfs?service=WFS&request=GetCapabilities>
  - Auth: none. Licence: Open Government Licence v3.0. Update: static. CORS: yes. Status: verified.
  - Coverage: Thames estuary to Teddington.
  - Returned: WFS capabilities for the TE2100 nodes layer.
  - Modelled extreme water levels with climate change, for flood scenes.
- **EA recorded flood outlines** (Environment Agency). [page](https://environment.data.gov.uk/dataset/8c75e700-d465-11e4-8b5b-f0def148f590)
  - Auth: none. Licence: Open Government Licence v3.0. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: England; includes the 1928 and 1953 Thames floods.

## Weather and forecasts

- **EA rainfall gauge 289102TP (Greenwich)** (Environment Agency). [page](https://environment.data.gov.uk/flood-monitoring/doc/rainfall) · API: `https://environment.data.gov.uk/flood-monitoring/id/stations/289102TP`
  - Sample: <https://environment.data.gov.uk/flood-monitoring/id/stations/289102TP/readings?latest>
  - Auth: none. Licence: Open Government Licence v3.0. Update: minutes. CORS: yes. Status: verified.
  - Coverage: tipping-bucket gauge at 51.4765,-0.0179.
  - Returned: Station record returned; readings?latest returned an empty items list at the time of the check.
  - 15-minute rainfall totals in mm.
- **Open-Meteo forecast for Canary Wharf** (Open-Meteo). [page](https://open-meteo.com/en/docs) · API: `https://api.open-meteo.com/v1/forecast`
  - Sample: <https://api.open-meteo.com/v1/forecast?latitude=51.505&longitude=-0.02&current=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover&hourly=temperature_2m,precipitation&timezone=Europe/London&forecast_days=2>
  - Auth: none (non-commercial). Licence: CC BY 4.0 (data); free API for non-commercial use. Update: hourly. CORS: yes. Status: verified.
  - Coverage: global; UK models incl. Met Office UKV.
  - Returned: Current temperature, wind and cloud plus 48 hourly values for 51.5,0.0 (grid cell).
- **Open-Meteo historical weather** (Open-Meteo). [page](https://open-meteo.com/en/docs/historical-weather-api) · API: `https://archive-api.open-meteo.com/v1/archive`
  - Sample: <https://archive-api.open-meteo.com/v1/archive?latitude=51.505&longitude=-0.02&start_date=2026-09-01&end_date=2026-09-07&daily=temperature_2m_max,precipitation_sum&timezone=Europe/London>
  - Auth: none (non-commercial). Licence: CC BY 4.0. Update: daily. CORS: yes. Status: verified.
  - Coverage: global reanalysis from 1940.
- **Met Office Weather DataHub (site-specific forecasts)** (Met Office). [page](https://datahub.metoffice.gov.uk/) · API: `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/hourly`
  - Sample: <https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/hourly?latitude=51.505&longitude=-0.02>
  - Auth: free key (account; apikey header). Licence: Met Office DataHub terms; free tier. Update: hourly. CORS: yes. Status: verified, needs a key (sample answered 401).
  - Coverage: global point forecasts.
  - Returned: 401 Missing Credentials.
  - Expect 401 without a key.
- **Met Office WOW (Weather Observations Website)** (Met Office). [page](https://wow.metoffice.gov.uk/)
  - Auth: none to view. Licence: WOW terms. Update: minutes. CORS: n/a. Status: verified.
  - Coverage: volunteer and official weather stations.
- **MET Norway Locationforecast for Canary Wharf** (Norwegian Meteorological Institute). [page](https://api.met.no/weatherapi/locationforecast/2.0/documentation) · API: `https://api.met.no/weatherapi/locationforecast/2.0/compact`
  - Sample: <https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=51.505&lon=-0.02>
  - Auth: none (identifying User-Agent required). Licence: CC BY 4.0 / NLOD. Update: hourly. CORS: yes. Status: verified.
  - Coverage: global.
  - Returned: GeoJSON Feature at -0.02,51.505 (elevation 7 m) with hourly timeseries.
  - Browsers send their own User-Agent; MET asks for an identifying one, so a server-side cache is the polite route.
- **MET Norway Sunrise API (sun and moon times)** (Norwegian Meteorological Institute). [page](https://api.met.no/weatherapi/sunrise/3.0/documentation) · API: `https://api.met.no/weatherapi/sunrise/3.0/sun`
  - Sample: <https://api.met.no/weatherapi/sunrise/3.0/sun?lat=51.505&lon=-0.02&date=2026-10-02&offset=+01:00>
  - Auth: none. Licence: CC BY 4.0. Update: static (computed). CORS: yes. Status: verified.
  - Coverage: global.
  - Returned: Sunrise, sunset and solar noon for 2026-10-02.
  - Useful for lighting the 3D model.
- **METAR for London City Airport (EGLC)** (NOAA Aviation Weather Center). [page](https://aviationweather.gov/data/api/) · API: `https://aviationweather.gov/api/data/metar`
  - Sample: <https://aviationweather.gov/api/data/metar?ids=EGLC&format=json>
  - Auth: none. Licence: US Government work (public domain). Update: hourly (half-hourly at EGLC). CORS: no. Status: verified.
  - Coverage: EGLC, 2.5 km east of Canary Wharf.
  - Returned: METAR EGLC 022220Z AUTO 22003KT 160V320 9999 NCD 15/11 Q1030
- **TAF for London City Airport (EGLC)** (NOAA Aviation Weather Center). [page](https://aviationweather.gov/data/api/) · API: `https://aviationweather.gov/api/data/taf`
  - Sample: <https://aviationweather.gov/api/data/taf?ids=EGLC&format=json>
  - Auth: none. Licence: public domain. Update: every 3–6 hours. CORS: no. Status: verified.
  - Coverage: EGLC.
  - Returned: Current TAF for EGLC issued 2026-10-02 17:00Z.
- **NWS raw METAR text file for EGLC** (US National Weather Service). [page](https://tgftp.nws.noaa.gov/data/observations/metar/stations/)
  - Sample: <https://tgftp.nws.noaa.gov/data/observations/metar/stations/EGLC.TXT>
  - Auth: none. Licence: public domain. Update: hourly. CORS: no. Status: verified.
  - Coverage: EGLC.
  - Returned: 2026/10/02 21:50 EGLC 022150Z AUTO 22003KT 160V250 9999 NCD 15/11 Q1030
- **RainViewer radar tiles index** (RainViewer). [page](https://www.rainviewer.com/api.html) · API: `https://api.rainviewer.com/public/weather-maps.json`
  - Sample: <https://api.rainviewer.com/public/weather-maps.json>
  - Auth: none. Licence: RainViewer terms (attribution; personal/educational use). Update: minutes. CORS: yes. Status: verified.
  - Coverage: global composite radar.
  - Returned: Index of past and nowcast radar frames on tilecache.rainviewer.com.
  - Check current terms before relying on it; free access has been reduced in the past.

## Air quality

- **Open-Meteo air quality forecast** (Open-Meteo (CAMS data)). [page](https://open-meteo.com/en/docs/air-quality-api) · API: `https://air-quality-api.open-meteo.com/v1/air-quality`
  - Sample: <https://air-quality-api.open-meteo.com/v1/air-quality?latitude=51.505&longitude=-0.02&current=pm10,pm2_5,nitrogen_dioxide,ozone,european_aqi>
  - Auth: none (non-commercial). Licence: CC BY 4.0; Copernicus CAMS. Update: hourly. CORS: yes. Status: verified.
  - Coverage: Europe at ~11 km.
  - Returned: Current PM10, PM2.5, NO2, O3 and European AQI for the grid cell.
  - Modelled, not measured.
- **London Air (LAQN) API: monitoring sites** (Imperial College London, Environmental Research Group). [page](https://www.londonair.org.uk/) · API: `https://api.erg.ic.ac.uk/AirQuality/`
  - Sample: <https://api.erg.ic.ac.uk/AirQuality/Information/MonitoringSites/GroupName=London/Json>
  - Auth: none. Licence: London Air terms (attribution to ERG; free for non-commercial). Update: hourly. CORS: yes. Status: verified.
  - Coverage: London; open sites near the area: TH4 Blackwall, TH6 Millwall Park, TH7 King Edward Memorial Park, TL5 Hoola Tower, TL6 Britannia Gate, TL4 Tunnel Avenue, GN6 John Harrison Way, GN5 Trafalgar Road, GR7 Blackheath, GR8 Woolwich Flyover, SK5 Old Kent Road.
  - Returned: All London sites with code, name, borough, coordinates and open/close dates.
- **LAQN hourly index: Tower Hamlets – Blackwall (TH4)** (Imperial College London, ERG). [page](https://www.londonair.org.uk/london/asp/publicdetails.asp?site=TH4) · API: `https://api.erg.ic.ac.uk/AirQuality/Hourly/MonitoringIndex/SiteCode=TH4/Json`
  - Sample: <https://api.erg.ic.ac.uk/AirQuality/Hourly/MonitoringIndex/SiteCode=TH4/Json>
  - Auth: none. Licence: London Air terms. Update: hourly. CORS: yes. Status: verified.
  - Coverage: Blackwall (51.5150,-0.0084), 1 km north of Canary Wharf.
  - Returned: Hourly index for TH4 Tower Hamlets – Blackwall (Roadside, 51.5150,-0.0084).
- **LAQN raw data: Tower Hamlets – Millwall Park (TH6)** (Imperial College London, ERG). [page](https://www.londonair.org.uk/london/asp/publicdetails.asp?site=TH6) · API: `https://api.erg.ic.ac.uk/AirQuality/Data/Site/SiteCode={code}/StartDate={d}/EndDate={d}/Json`
  - Sample: <https://api.erg.ic.ac.uk/AirQuality/Data/Site/SiteCode=TH6/StartDate=2026-10-01/EndDate=2026-10-02/Json>
  - Auth: none. Licence: London Air terms. Update: hourly. CORS: yes. Status: verified.
  - Coverage: Millwall Park, Isle of Dogs (51.4891,-0.0130).
  - Returned: Hourly NO2 at TH6 Millwall Park, e.g. 2026-10-01 00:00 8.7 µg/m³, 01:00 8.8, 02:00 5.5.
- **LAQN daily air quality index for London** (Imperial College London, ERG). [page](https://www.londonair.org.uk/LondonAir/Default.aspx) · API: `https://api.erg.ic.ac.uk/AirQuality/Daily/MonitoringIndex/Latest/GroupName=London/Json`
  - Sample: <https://api.erg.ic.ac.uk/AirQuality/Daily/MonitoringIndex/Latest/GroupName=London/Json>
  - Auth: none. Licence: London Air terms. Update: daily. CORS: yes. Status: verified.
  - Coverage: all London boroughs.
  - Returned: Daily index for every London borough, 2026-10-01.
- **Breathe London sensor network** (Breathe London (Imperial College / GLA)). [page](https://www.breathelondon.org/) · API: `https://api.breathelondon.org/api/ListSensors`
  - Auth: free key. Licence: Breathe London terms (open data with attribution). Update: hourly. CORS: yes. Status: verified.
  - Coverage: low-cost sensors across London incl. Tower Hamlets and Southwark.
- **OpenAQ v3 locations near Canary Wharf** (OpenAQ). [page](https://openaq.org/) · API: `https://api.openaq.org/v3/locations`
  - Sample: <https://api.openaq.org/v3/locations?coordinates=51.505,-0.02&radius=5000>
  - Auth: free key (X-API-Key). Licence: per-source licences (mostly OGL for UK). Update: hourly. CORS: no. Status: verified, needs a key (sample answered 401).
  - Coverage: global aggregator of official and sensor data.
  - Returned: 401 {"message":"Unauthorized. A valid API key must be provided in the X-API-Key header."}
  - 401 without a key.
- **DEFRA UK-AIR** (Defra). [page](https://uk-air.defra.gov.uk/) · API: `https://uk-air.defra.gov.uk/sos-ukair/api/v1/stations`
  - Sample: <https://uk-air.defra.gov.uk/sos-ukair/api/v1/stations/1158>
  - Auth: none. Licence: Open Government Licence v3.0. Update: hourly. CORS: yes. Status: verified.
  - Coverage: AURN national network; nearest: Tower Hamlets Roadside (Mile End Road, station 1158 for NO2), Southwark A2 Old Kent Road (1130), London Eltham (999).
  - Returned: Station 1158 "Tower Hamlets Roadside – Nitrogen dioxide", coordinates [51.5225, −0.0422] (lat, lon order).
  - The SOS stations list gives coordinates as [lat, lon], the reverse of GeoJSON order. One station id per pollutant.
- **DEFRA air pollution forecast (RSS)** (Defra). [page](https://uk-air.defra.gov.uk/forecasting/)
  - Sample: <https://uk-air.defra.gov.uk/assets/rss/forecast.xml>
  - Auth: none. Licence: Open Government Licence v3.0. Update: daily. CORS: no. Status: verified.
  - Coverage: UK regions incl. Greater London.
  - Returned: RSS "UK Air Pollution Forecast" with one item per region.
- **Sensor.Community particulate sensors near Canary Wharf** (Sensor.Community (Open Knowledge Lab Stuttgart)). [page](https://sensor.community/en/) · API: `https://data.sensor.community/airrohr/v1/filter/`
  - Sample: <https://data.sensor.community/airrohr/v1/filter/area=51.505,-0.02,3>
  - Auth: none. Licence: ODbL 1.0 (DbCL for contents). Update: minutes. CORS: yes. Status: verified.
  - Coverage: volunteer sensors; sparse in E14.
  - Returned: 6–8 sensors within 3 km with recent readings.
  - Volunteers publish these deliberately; locations are rounded. Use for aggregate or map display only.
- **World Air Quality Index (aqicn) API** (WAQI project). [page](https://aqicn.org/api/) · API: `https://api.waqi.info/feed/geo:51.505;-0.02/`
  - Auth: free key (token). Licence: WAQI terms (re-uses official data; non-commercial). Update: hourly. CORS: yes. Status: verified.
  - Coverage: global.
  - Redistributes LAQN/AURN; use the original sources where possible.
- **TfL air quality forecast** (Transport for London (data from King's/Imperial)). [page](https://api-portal.tfl.gov.uk/) · API: `https://api.tfl.gov.uk/AirQuality`
  - Sample: <https://api.tfl.gov.uk/AirQuality>
  - Auth: none (key optional, raises rate limits). Licence: TfL open data terms (powered by TfL Open Data). Update: daily. CORS: yes. Status: verified.
  - Coverage: London-wide forecast text.
  - Returned: LondonAirForecast object with today/tomorrow text and bands.

## Water quality

- **Thames Water storm overflow activity (National Storm Overflow Hub feature service)** (Thames Water via Water UK Stream). [page](https://portal-streamwaterdata.hub.arcgis.com/datasets/thameswater::thames-water-storm-overflow-activity) · API: `https://services2.arcgis.com/g6o32ZDQ33GpCIu3/arcgis/rest/services/Thames_Water_Storm_Overflow_Activity_(Production)_view/FeatureServer/0/query`
  - Sample: <https://services2.arcgis.com/g6o32ZDQ33GpCIu3/arcgis/rest/services/Thames_Water_Storm_Overflow_Activity_(Production)_view/FeatureServer/0/query?geometry=-0.12%2C51.47%2C0.08%2C51.53&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=Id%2CStatus%2CStatusStart%2CLatestEventStart%2CLatestEventEnd%2CReceivingWaterCourse%2CLatitude%2CLongitude&returnGeometry=false&f=json>
  - Auth: none. Licence: Stream / Thames Water open data terms (see dataset page). Update: minutes. CORS: yes. Status: verified.
  - Coverage: Thames Water region; 26 overflows in the London Bridge–Canary Wharf–Greenwich box, several now routed "via the Tideway tunnel".
  - Returned: 26 overflows in the box: 24 status 0 (not discharging), 2 status −1 (offline). TWL00658 discharges to "River Thames (via the Tideway tunnel)" near King Edward Memorial Park.
  - Status 1 = discharging, 0 = not, -1 = offline (per Stream FAQ). EDM indicates, it does not confirm, a discharge.
- **Thames Water open data portal (EDM API)** (Thames Water). [page](https://data.thameswater.co.uk/s/) · API: `https://api.thameswater.co.uk/opendata/v1/discharge/status`
  - Auth: free account (client_id + client_secret). Licence: Thames Water open data terms. Update: minutes. CORS: no. Status: verified.
  - Coverage: Thames Water region.
  - Same EDM data as the Stream feature service above, plus an alert history endpoint.
- **Thames Water storm discharge map and data page** (Thames Water). [page](https://www.thameswater.co.uk/about-us/performance/river-health/storm-discharge-and-flow-data)
  - Auth: none. Licence: Thames Water terms. Update: minutes. CORS: n/a. Status: verified.
  - Coverage: Thames Water region.
- **Stream: National Storm Overflow Hub** (Water UK / Stream). [page](https://www.streamwaterdata.co.uk/pages/storm-overflows-data)
  - Auth: none. Licence: per company. Update: minutes. CORS: n/a. Status: verified.
  - Coverage: England.
- **EA Water Quality Archive** (Environment Agency). [page](https://environment.data.gov.uk/water-quality/) · API: `https://environment.data.gov.uk/water-quality/sampling-point`
  - Sample: <https://environment.data.gov.uk/water-quality/sampling-point?latitude=51.505&longitude=-0.02&radius=3&limit=10>
  - Auth: none. Licence: Open Government Licence v3.0. Update: monthly. CORS: yes. Status: verified.
  - Coverage: England; tidal Thames sampling points.
  - Returned: 10 sampling points within 3 km, e.g. TH-PGWU1888 Greenwich Victoria Deep Water Terminal borehole (open), TH-PLER0056 Lee at Canning Town Bridge (closed).
  - Rebuilt in 2025 (legacy /id/ paths retired). The API refuses a plain application/json Accept header: send Accept: application/geo+json or application/ld+json. Docs: https://environment.data.gov.uk/water-quality/api-docs (JavaScript page).
- **EA Event Duration Monitoring annual returns** (Environment Agency). [page](https://www.data.gov.uk/dataset/19f6064d-7356-466f-844e-d20ea10ae9fd/event-duration-monitoring-storm-overflows-annual-returns)
  - Auth: none. Licence: Open Government Licence v3.0. Update: yearly. CORS: n/a. Status: verified.
  - Coverage: England.
- **Rivers Trust sewage map** (The Rivers Trust). [page](https://theriverstrust.org/sewage-map)
  - Auth: none. Licence: Rivers Trust terms. Update: yearly. CORS: n/a. Status: verified.
  - Coverage: England and Wales.
- **Tideway (Thames Tideway Tunnel)** (Bazalgette Tunnel Ltd). [page](https://www.tideway.london/)
  - Auth: none. Licence: site terms. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: Tideway tunnel; King Edward Memorial Park and Chambers Wharf sites are in the area.
  - No live data feed found.
- **Thames21 river monitoring** (Thames21). [page](https://www.thames21.org.uk/)
  - Auth: none. Licence: site terms. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: London rivers.

## Noise

- **Defra strategic noise mapping (Round 4)** (Defra). [page](https://www.gov.uk/government/publications/strategic-noise-mapping-2022)
  - Auth: none. Licence: Open Government Licence v3.0. Update: static (2022 round). CORS: n/a. Status: verified.
  - Coverage: England road, rail and airport noise.
- **England noise and air quality viewer** (Defra). [page](https://www.extrium.co.uk/noiseviewer.html)
  - Auth: none. Licence: Open Government Licence v3.0. Update: static. CORS: n/a. Status: **not verified** — page: curl: (35) OpenSSL/3.0.13: error:0A000438:SSL routines::tlsv1 alert internal error.
  - Coverage: England.
- **London City Airport WebTrak (flight tracks and noise)** (London City Airport (EMS Brüel & Kjær)). [page](https://webtrak.emsbk.com/lcy3)
  - Auth: none. Licence: site terms. Update: delayed (minutes). CORS: n/a. Status: verified.
  - Coverage: LCY flight paths and noise monitors over Docklands.
- **London City Airport noise information** (London City Airport). [page](https://www.londoncityairport.com/corporate/sustainability/noise)
  - Auth: none. Licence: site terms. Update: quarterly. CORS: n/a. Status: **not verified** — HTTP 403 for page (the server answered but refuses scripted requests; page content not seen).
  - Coverage: airport noise reports.

## Safety and crime

- **data.police.uk street-level crime near Canary Wharf** (Home Office / police forces). [page](https://data.police.uk/docs/) · API: `https://data.police.uk/api/crimes-street/all-crime`
  - Sample: <https://data.police.uk/api/crimes-street/all-crime?lat=51.505&lng=-0.02>
  - Auth: none. Licence: Open Government Licence v3.0. Update: monthly. CORS: yes. Status: verified.
  - Coverage: England and Wales; 1 mile radius of the point.
  - Returned: 1,310 records for 2026-08 within 1 mile; top categories violent crime 342, anti-social behaviour 341, other theft 120.
  - Locations are snapped to anonymised points. Use as aggregates.
- **data.police.uk neighbourhood lookup** (Home Office / police forces). [page](https://data.police.uk/docs/method/neighbourhood-locate/) · API: `https://data.police.uk/api/locate-neighbourhood`
  - Sample: <https://data.police.uk/api/locate-neighbourhood?q=51.505,-0.02>
  - Auth: none. Licence: Open Government Licence v3.0. Update: static. CORS: yes. Status: verified.
  - Coverage: England and Wales.
  - Returned: {"neighbourhood":"E05009323","force":"metropolitan"}
- **data.police.uk last updated date** (Home Office). [page](https://data.police.uk/docs/method/crime-last-updated/) · API: `https://data.police.uk/api/crime-last-updated`
  - Sample: <https://data.police.uk/api/crime-last-updated>
  - Auth: none. Licence: Open Government Licence v3.0. Update: monthly. CORS: yes. Status: verified.
  - Returned: {"date":"2026-08-01"} — latest month of street-level data.
- **data.police.uk bulk downloads** (Home Office). [page](https://data.police.uk/data/)
  - Auth: none. Licence: Open Government Licence v3.0. Update: monthly. CORS: n/a. Status: verified.
  - Coverage: England and Wales.
- **MPS recorded crime: geographic breakdown** (Metropolitan Police (London Datastore)). [page](https://data.london.gov.uk/dataset/recorded_crime_summary)
  - Auth: none. Licence: Open Government Licence v3.0. Update: monthly. CORS: n/a. Status: verified.
  - Coverage: London by borough and ward.
- **Met Police stats and data** (Metropolitan Police). [page](https://www.met.police.uk/sd/stats-and-data/)
  - Auth: none. Licence: site terms. Update: monthly. CORS: n/a. Status: **not verified** — HTTP 403 for page (Cloudflare browser challenge).
  - Coverage: London.

## Fire

- **London Fire Brigade incident records** (London Fire Brigade (London Datastore)). [page](https://data.london.gov.uk/dataset/london-fire-brigade-incident-records)
  - Auth: none. Licence: Open Government Licence v3.0. Update: monthly. CORS: n/a. Status: verified.
  - Coverage: London since 2009, with ward and rounded location.
  - Aggregate use only.
- **London Fire Brigade mobilisation records** (London Fire Brigade (London Datastore)). [page](https://data.london.gov.uk/dataset/london-fire-brigade-mobilisation-records)
  - Auth: none. Licence: Open Government Licence v3.0. Update: monthly. CORS: n/a. Status: verified.
  - Coverage: London; response times by station.
- **London Fire Brigade incident news** (London Fire Brigade). [page](https://www.london-fire.gov.uk/incidents/)
  - Auth: none. Licence: site terms. Update: daily. CORS: n/a. Status: verified.
  - Coverage: London.
- **Home Office fire statistics data tables** (Home Office). [page](https://www.gov.uk/government/statistical-data-sets/fire-statistics-data-tables)
  - Auth: none. Licence: Open Government Licence v3.0. Update: quarterly. CORS: n/a. Status: verified.
  - Coverage: England by fire authority.

## Traffic and transport

- **TfL Unified API** (Transport for London). [page](https://api-portal.tfl.gov.uk/) · API: `https://api.tfl.gov.uk/`
  - Sample: <https://api.tfl.gov.uk/StopPoint/HUBCAW>
  - Auth: none (free key raises rate limit). Licence: TfL open data terms (attribution "Powered by TfL Open Data"). Update: realtime. CORS: yes. Status: verified.
  - Coverage: London.
  - Returned: StopPoint HUBCAW with child stops for DLR, Jubilee, Elizabeth line and bus.
  - Canary Wharf hub HUBCAW (DLR, Jubilee, Elizabeth line, bus).
- **TfL arrivals: Canary Wharf (Jubilee line)** (Transport for London). [page](https://api-portal.tfl.gov.uk/) · API: `https://api.tfl.gov.uk/StopPoint/{id}/Arrivals`
  - Sample: <https://api.tfl.gov.uk/StopPoint/940GZZLUCYF/Arrivals>
  - Auth: none. Licence: TfL open data terms. Update: realtime. CORS: yes. Status: verified.
  - Coverage: Canary Wharf Underground station.
  - Returned: 8–10 predictions per check (late evening).
  - Public page: https://tfl.gov.uk/tube/stop/940GZZLUCYF/canary-wharf-underground-station (tfl.gov.uk answers 403 to scripted requests).
- **TfL arrivals: Canary Wharf DLR** (Transport for London). [page](https://api-portal.tfl.gov.uk/) · API: `https://api.tfl.gov.uk/StopPoint/{id}/Arrivals`
  - Sample: <https://api.tfl.gov.uk/StopPoint/940GZZDLCAN/Arrivals>
  - Auth: none. Licence: TfL open data terms. Update: realtime. CORS: yes. Status: verified.
  - Coverage: Canary Wharf DLR.
  - Returned: 16 DLR predictions (late evening).
  - Public page: https://tfl.gov.uk/dlr/ (tfl.gov.uk answers 403 to scripted requests).
- **TfL arrivals: Canary Wharf (Elizabeth line)** (Transport for London). [page](https://api-portal.tfl.gov.uk/) · API: `https://api.tfl.gov.uk/StopPoint/{id}/Arrivals`
  - Sample: <https://api.tfl.gov.uk/StopPoint/910GCANWHRF/Arrivals>
  - Auth: none. Licence: TfL open data terms. Update: realtime. CORS: yes. Status: verified.
  - Coverage: Canary Wharf Elizabeth line.
  - Returned: 8–9 predictions per check (late evening).
  - Elizabeth line predictions can be empty; Timetable endpoints are the fallback. Public page: https://tfl.gov.uk/modes/elizabeth-line/ (tfl.gov.uk answers 403 to scripted requests).
- **TfL arrivals: Canada Water (Jubilee line)** (Transport for London). [page](https://api-portal.tfl.gov.uk/) · API: `https://api.tfl.gov.uk/StopPoint/{id}/Arrivals`
  - Sample: <https://api.tfl.gov.uk/StopPoint/940GZZLUCWR/Arrivals>
  - Auth: none. Licence: TfL open data terms. Update: realtime. CORS: yes. Status: verified.
  - Coverage: Canada Water.
  - Returned: Live Jubilee line predictions returned.
  - Overground platform: 910GCNDAW. Public page: https://tfl.gov.uk/tube/stop/940GZZLUCWR/canada-water-underground-station (tfl.gov.uk answers 403 to scripted requests).
- **TfL arrivals: Canary Wharf Pier (Uber Boat by Thames Clippers)** (Transport for London). [page](https://api-portal.tfl.gov.uk/) · API: `https://api.tfl.gov.uk/StopPoint/{id}/Arrivals`
  - Sample: <https://api.tfl.gov.uk/StopPoint/930GCAW/Arrivals>
  - Auth: none. Licence: TfL open data terms. Update: realtime. CORS: yes. Status: verified.
  - Coverage: piers: 930GCAW Canary Wharf, 930GMHT Masthouse Terrace, 930GGLP Greenland (Surrey Quays), 930GNEL Rotherhithe, 930GGNW Greenwich, 930GMIL North Greenwich, 930GEIB East India, 930GWAP Wapping.
  - Returned: 1 prediction late in the evening (RB6 towards North Greenwich Pier).
  - River predictions are sparse; check the timetable endpoint too. Public page: https://tfl.gov.uk/modes/river/ (tfl.gov.uk answers 403 to scripted requests).
- **TfL piers within 3 km of Canary Wharf** (Transport for London). [page](https://api-portal.tfl.gov.uk/) · API: `https://api.tfl.gov.uk/StopPoint`
  - Sample: <https://api.tfl.gov.uk/StopPoint?lat=51.505&lon=-0.02&stopTypes=NaptanFerryPort&radius=3000>
  - Auth: none. Licence: TfL open data terms. Update: static. CORS: yes. Status: verified.
  - Coverage: river piers.
  - Returned: 8 piers: 930GCAW Canary Wharf, 930GNEL Rotherhithe, 930GEIB East India, 930GGLP Greenland Surrey Quays, 930GMHT Masthouse Terrace, 930GMIL North Greenwich, 930GGNW Greenwich, 930GWAP Wapping.
  - Public page: https://tfl.gov.uk/modes/river/ (tfl.gov.uk answers 403 to scripted requests).
- **TfL line status (Jubilee, DLR, Elizabeth, Windrush, cable car)** (Transport for London). [page](https://api-portal.tfl.gov.uk/) · API: `https://api.tfl.gov.uk/Line/{ids}/Status`
  - Sample: <https://api.tfl.gov.uk/Line/jubilee,dlr,elizabeth,windrush,london-cable-car/Status>
  - Auth: none. Licence: TfL open data terms. Update: realtime. CORS: yes. Status: verified.
  - Coverage: London.
  - Returned: One status per line (all five "Good Service" at the time) with disruption text when there is one.
  - Windrush is the Overground line through Wapping, Rotherhithe, Canada Water and Surrey Quays. The old id london-overground is silently ignored; list current ids with /Line/Mode/overground. Public page: https://tfl.gov.uk/tube-dlr-overground/status/ (tfl.gov.uk answers 403 to scripted requests).
- **TfL road disruptions (London-wide; filter to E14 client-side)** (Transport for London). [page](https://api-portal.tfl.gov.uk/) · API: `https://api.tfl.gov.uk/Road/all/Disruption`
  - Sample: <https://api.tfl.gov.uk/Road/all/Disruption?stripContent=true>
  - Auth: none. Licence: TfL open data terms. Update: minutes. CORS: yes. Status: verified.
  - Coverage: London (filter by point/geometry client-side).
  - Returned: London-wide list of current disruptions (TIMS ids, geometry, severity).
  - Public page: https://tfl.gov.uk/traffic/status/ (tfl.gov.uk answers 403 to scripted requests).
- **Santander Cycles docks near Canary Wharf** (Transport for London). [page](https://api-portal.tfl.gov.uk/) · API: `https://api.tfl.gov.uk/BikePoint`
  - Sample: <https://api.tfl.gov.uk/Place?type=BikePoint&lat=51.505&lon=-0.02&radius=1000>
  - Auth: none. Licence: TfL open data terms. Update: minutes. CORS: yes. Status: verified.
  - Coverage: docks with bikes and empty spaces.
  - Returned: 17 docks within 1 km, e.g. Jubilee Plaza, Import Dock, Heron Quays DLR.
  - Public page: https://tfl.gov.uk/modes/cycling/santander-cycles (tfl.gov.uk answers 403 to scripted requests).
- **TfL cycling open data (usage, counts, infrastructure)** (Transport for London). [page](https://cycling.data.tfl.gov.uk/)
  - Auth: none. Licence: TfL open data terms. Update: weekly. CORS: n/a. Status: verified.
  - Coverage: London.
  - Includes the Cycling Infrastructure Database.
- **TfL station crowding (live)** (Transport for London). [page](https://api-portal.tfl.gov.uk/) · API: `https://api.tfl.gov.uk/crowding/{naptan}/Live`
  - Sample: <https://api.tfl.gov.uk/crowding/940GZZLUCYF/Live>
  - Auth: none (key recommended). Licence: TfL open data terms. Update: minutes. CORS: yes. Status: verified.
  - Coverage: Underground stations.
  - Returned: {"dataAvailable":true,"percentageOfBaseline":0.10,…} at 23:21 local time.
- **TfL bus arrivals: Canary Wharf Station stop F** (Transport for London). [page](https://api-portal.tfl.gov.uk/) · API: `https://api.tfl.gov.uk/StopPoint/{id}/Arrivals`
  - Sample: <https://api.tfl.gov.uk/StopPoint/490000038F/Arrivals>
  - Auth: none. Licence: TfL open data terms. Update: realtime. CORS: yes. Status: verified.
  - Coverage: bus stop 490000038F.
  - Returned: Live bus predictions returned.
  - Public page: https://tfl.gov.uk/modes/buses/ (tfl.gov.uk answers 403 to scripted requests).
- **TfL open data users page** (Transport for London). [page](https://tfl.gov.uk/info-for/open-data-users/)
  - Auth: none. Licence: TfL open data terms. Update: static. CORS: n/a. Status: **not verified** — HTTP 403 for page (the server answered but refuses scripted requests; page content not seen).
  - Terms and the list of feeds.
- **NaPTAN stops (Greater London)** (Department for Transport). [page](https://beta-naptan.dft.gov.uk/) · API: `https://naptan.api.dft.gov.uk/v1/access-nodes`
  - Sample: <https://naptan.api.dft.gov.uk/v1/access-nodes?atcoAreaCodes=490&dataFormat=csv>
  - Auth: none. Licence: Open Government Licence v3.0. Update: daily. CORS: no. Status: verified.
  - Coverage: all public transport stops; 490 = London.
  - Returned: CSV of all Greater London stops (ATCOCode, NaptanCode, CommonName, …).
  - The London file is large (~10 MB).
- **Bus Open Data Service (timetables, live locations)** (Department for Transport). [page](https://www.gov.uk/government/collections/bus-open-data-service) · API: `https://data.bus-data.dft.gov.uk/api/v1/datafeed/`
  - Auth: free key (account). Licence: Open Government Licence v3.0. Update: realtime. CORS: no. Status: verified.
  - Coverage: England buses; London buses are in TfL feeds.
- **DfT road traffic counts (count points near Canary Wharf)** (Department for Transport). [page](https://roadtraffic.dft.gov.uk/) · API: `https://roadtraffic.dft.gov.uk/api/count-points`
  - Sample: <https://roadtraffic.dft.gov.uk/api/count-points?filter[local_authority_id]=93&page[size]=5>
  - Auth: none. Licence: Open Government Licence v3.0. Update: yearly. CORS: yes. Status: verified.
  - Coverage: Great Britain; local_authority_id 93 = Tower Hamlets, 103 Southwark, 104 Lewisham, 105 Greenwich, 167 Newham.
  - Returned: Count points in Tower Hamlets, e.g. id 6071 on the A12 between A13 and A11, AADF year 2025.
- **DfT Street Manager open data (roadworks permits)** (Department for Transport). [page](https://department-for-transport-streetmanager.github.io/street-manager-docs/open-data/)
  - Auth: none (subscription). Licence: Open Government Licence v3.0. Update: realtime. CORS: n/a. Status: verified.
  - Coverage: England.
- **Rail Data Marketplace (Darwin live departures)** (Rail Delivery Group). [page](https://raildata.org.uk/)
  - Auth: free account. Licence: RDM product licences (many OGL). Update: realtime. CORS: n/a. Status: verified.
  - Coverage: National Rail incl. Greenwich, Deptford, Maze Hill, London Bridge.
- **Realtime Trains API** (Realtime Trains). [page](https://api.rtt.io/) · API: `https://api.rtt.io/api/v1/json/search/GNW`
  - Auth: free account (non-commercial). Licence: RTT terms. Update: realtime. CORS: no. Status: verified.
  - Coverage: GB rail; GNW Greenwich, DEP Deptford.
- **London City Airport arrivals and departures** (London City Airport). [page](https://www.londoncityairport.com/flights/arrivals)
  - Auth: none. Licence: site terms. Update: minutes. CORS: n/a. Status: **not verified** — HTTP 403 for page (the server answered but refuses scripted requests; page content not seen).
  - Coverage: LCY.
- **OpenSky Network state vectors (aircraft over Docklands)** (OpenSky Network). [page](https://openskynetwork.github.io/opensky-api/rest.html) · API: `https://opensky-network.org/api/states/all`
  - Sample: <https://opensky-network.org/api/states/all?lamin=51.45&lomin=-0.15&lamax=51.56&lomax=0.10>
  - Auth: none (anonymous, low quota); free account for more. Licence: OpenSky terms (non-commercial research). Update: realtime (10 s). CORS: no. Status: verified.
  - Coverage: ADS-B receivers; London well covered.
  - Returned: {"time":…,"states":null} — no aircraft in the box at the time (late evening; LCY closed).
  - Aircraft, not people. Do not join to owner registries.
- **adsb.lol aircraft near London City Airport** (adsb.lol). [page](https://api.adsb.lol/docs) · API: `https://api.adsb.lol/v2/point/{lat}/{lon}/{radius_nm}`
  - Sample: <https://api.adsb.lol/v2/point/51.505/0.05/10>
  - Auth: none. Licence: ODbL 1.0. Update: realtime. CORS: no. Status: verified.
  - Coverage: community ADS-B network.
  - Returned: Aircraft within 10 nm of LCY with position, altitude, callsign and type; 0–1 aircraft late in the evening (e.g. a B738 overflight at 17,000 ft).
  - Aircraft, not people.
- **aisstream.io AIS ship positions** (aisstream.io). [page](https://aisstream.io/) · API: `wss://stream.aisstream.io/v0/stream`
  - Auth: free key. Licence: aisstream terms. Update: realtime. CORS: n/a. Status: verified.
  - Coverage: global terrestrial AIS; Thames coverage depends on volunteer receivers.
  - Key must stay server-side.
- **AISHub data sharing** (AISHub). [page](https://www.aishub.net/)
  - Auth: account (must contribute a receiver). Licence: AISHub terms. Update: realtime. CORS: n/a. Status: verified.
  - Coverage: global.
- **MarineTraffic (Thames vessel map)** (MarineTraffic (Kpler)). [page](https://www.marinetraffic.com/)
  - Auth: paid for API. Licence: commercial. Update: realtime. CORS: n/a. Status: verified.
  - Coverage: global.
  - View only without a paid plan.
- **Uber Boat by Thames Clippers** (Thames Clippers). [page](https://www.thamesclippers.com/)
  - Auth: none. Licence: site terms. Update: daily. CORS: n/a. Status: verified.
  - Coverage: river bus routes and service updates.
  - Live data comes through TfL (river-bus mode).
- **TfL station entry/exit and crowding data** (Transport for London). [page](https://crowding.data.tfl.gov.uk/)
  - Auth: none. Licence: TfL open data terms. Update: yearly. CORS: n/a. Status: verified.
  - Coverage: London stations.

## Webcams

- **Docklands Sailing and Watersports Centre weather and webcam** (Docklands Sailing and Watersports Centre). [page](https://www.dswc.org/livecam_weather/)
  - Auth: none. Licence: owner's site; view only. Update: minutes. CORS: n/a. Status: verified.
  - Coverage: Millwall Dock, Isle of Dogs: air and dock water temperature, wind, camera.
  - Published by the centre for sailors.
- **TfL JamCam traffic cameras near Canary Wharf** (Transport for London). [page](https://api-portal.tfl.gov.uk/) · API: `https://api.tfl.gov.uk/Place/Type/JamCam`
  - Sample: <https://api.tfl.gov.uk/Place?type=JamCam&lat=51.505&lon=-0.02&radius=2000>
  - Auth: none. Licence: TfL open data terms. Update: minutes. CORS: yes. Status: verified.
  - Coverage: Limehouse Link, Aspen Way, Westferry Road, Rotherhithe Tunnel, Blackwall Tunnel approaches.
  - Returned: 41 cameras within 2 km, e.g. "ASPEN WAY - UPPER BANK STREET", "Limehouse Tnl East Portal E/B", "A13 Burdett Rd"; each has imageUrl (JPG) and videoUrl (MP4) on s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk.
  - Official cameras that TfL publishes for public viewing. Public page: https://tfl.gov.uk/traffic/status/ (tfl.gov.uk answers 403 to scripted requests).
- **Windy Webcams API (published webcams near Canary Wharf)** (Windy.com). [page](https://api.windy.com/webcams) · API: `https://api.windy.com/webcams/api/v3/webcams`
  - Sample: <https://api.windy.com/webcams/api/v3/webcams?nearby=51.505,-0.02,10>
  - Auth: free key (X-WINDY-API-KEY header). Licence: Windy webcams terms (image URLs expire after 15 min on free tier). Update: minutes. CORS: no. Status: verified, needs a key (sample answered 403).
  - Coverage: global directory of webcams their owners register.
  - Returned: 403 Missing Header x-windy-api-key.
  - 403 without a key.
- **Camsecure Docklands webcam** (Camsecure). [page](https://www.camsecure.co.uk/docklands_london_webcam.html)
  - Auth: none. Licence: site terms; view only. Update: realtime. CORS: n/a. Status: verified.
  - Coverage: Millwall Dock, Isle of Dogs.
  - The page says the camera is at the Docklands Sailing and Watersports Centre; Camsecure hosts the stream. Same camera as the DSWC entry.
- **meteoblue webcams around Canary Wharf** (meteoblue (cams from Windy)). [page](https://www.meteoblue.com/en/weather/webcams/canary-wharf_united-kingdom_6692280)
  - Auth: none. Licence: site terms. Update: minutes. CORS: n/a. Status: verified.
  - Coverage: Canary Wharf area.

## Events

- **Canary Wharf: what's on** (Canary Wharf Group). [page](https://canarywharf.com/whats-on/)
  - Auth: none. Licence: site terms. Update: daily. CORS: n/a. Status: not verified. Corrected 2026-10-03: the site answers HTTP 200 with an Imperva Incapsula bot-challenge page, not the content; the first check counted the 200 as success.
  - Coverage: Canary Wharf estate.
- **The O2 events** (AEG / The O2). [page](https://www.theo2.co.uk/events)
  - Auth: none. Licence: site terms. Update: daily. CORS: n/a. Status: verified.
  - Coverage: North Greenwich.
  - Big crowds at North Greenwich and the Jubilee line.
- **ExCeL London events** (ExCeL London). [page](https://www.excel.london/whats-on)
  - Auth: none. Licence: site terms. Update: daily. CORS: n/a. Status: verified.
  - Coverage: Royal Victoria Dock.
- **Royal Museums Greenwich: what's on** (Royal Museums Greenwich). [page](https://www.rmg.co.uk/whats-on)
  - Auth: none. Licence: site terms. Update: daily. CORS: n/a. Status: verified.
  - Coverage: Greenwich.
- **Visit Greenwich: what's on** (Visit Greenwich). [page](https://www.visitgreenwich.org.uk/whats-on)
  - Auth: none. Licence: site terms. Update: daily. CORS: n/a. Status: verified.
  - Coverage: Royal Borough of Greenwich.
- **Greenwich Peninsula: what's on** (Greenwich Peninsula). [page](https://www.greenwichpeninsula.co.uk/whats-on/)
  - Auth: none. Licence: site terms. Update: weekly. CORS: n/a. Status: verified.
  - Coverage: North Greenwich.
- **Tower Hamlets Council events** (London Borough of Tower Hamlets). [page](https://www.towerhamlets.gov.uk/News_events/Events/Events.aspx)
  - Auth: none. Licence: site terms. Update: weekly. CORS: n/a. Status: verified.
  - Coverage: Tower Hamlets.
- **Southwark Council events** (London Borough of Southwark). [page](https://www.southwark.gov.uk/southwark-presents)
  - Auth: none. Licence: site terms. Update: weekly. CORS: n/a. Status: verified.
  - Coverage: Southwark.
- **Royal Borough of Greenwich events** (Royal Borough of Greenwich). [page](https://www.royalgreenwich.gov.uk/events)
  - Auth: none. Licence: site terms. Update: weekly. CORS: n/a. Status: verified.
  - Coverage: Greenwich.
- **London Museum Docklands** (London Museum). [page](https://www.londonmuseum.org.uk/docklands/)
  - Auth: none. Licence: site terms. Update: weekly. CORS: n/a. Status: verified.
  - Coverage: West India Quay.
- **Canada Water Dockside events** (British Land). [page](https://canadawater.co.uk/latest/?latest-type=event)
  - Auth: none. Licence: site terms. Update: weekly. CORS: n/a. Status: verified.
  - Coverage: Canada Water masterplan area.
- **Cody Dock** (Cody Dock (Gasworks Dock Partnership)). [page](https://www.codydock.org.uk/)
  - Auth: none. Licence: site terms. Update: weekly. CORS: n/a. Status: verified.
  - Coverage: Bow Creek.
- **Trinity Buoy Wharf** (Trinity Buoy Wharf Trust). [page](https://www.trinitybuoywharf.com/)
  - Auth: none. Licence: site terms. Update: weekly. CORS: n/a. Status: verified.
  - Coverage: Leamouth.
- **Totally Thames festival** (Thames Festival Trust). [page](https://totallythames.org/)
  - Auth: none. Licence: site terms. Update: yearly (September). CORS: n/a. Status: verified.
  - Coverage: tidal Thames.
- **Mudchute Park and Farm** (Mudchute Association). [page](https://www.mudchute.org/)
  - Auth: none. Licence: site terms. Update: weekly. CORS: n/a. Status: verified.
  - Coverage: Isle of Dogs.
- **Surrey Docks Farm** (Surrey Docks Farm). [page](https://www.surreydocksfarm.org.uk/)
  - Auth: none. Licence: site terms. Update: weekly. CORS: n/a. Status: verified.
  - Coverage: Rotherhithe.
- **Meetup (events near E14)** (Meetup). [page](https://www.meetup.com/find/?location=gb--17--London) · API: `https://api.meetup.com/gql-ext`
  - Auth: account (OAuth; Pro for API). Licence: Meetup terms. Update: realtime. CORS: yes. Status: verified.
  - Coverage: global.
  - Event listings only; do not collect member data.
- **Eventbrite API** (Eventbrite). [page](https://www.eventbrite.com/platform/docs/introduction) · API: `https://www.eventbriteapi.com/v3/`
  - Auth: free key (OAuth token). Licence: Eventbrite terms. Update: realtime. CORS: no. Status: verified.
  - Coverage: global.
  - Public event search was removed from the API in 2019/2020; only events by known organisers or venues can be read.
- **Tower Bridge lift times** (City of London Corporation (Tower Bridge)). [page](https://www.towerbridge.org.uk/lift-times)
  - Auth: none. Licence: site terms. Update: daily. CORS: n/a. Status: verified.
  - Coverage: Tower Bridge.
  - Scheduled bascule lifts with vessel names; ships then pass down to the Pool and Docklands.
- **Royal Docks: what's on** (Royal Docks Team (GLA / Newham)). [page](https://www.royaldocks.london/whats-on)
  - Auth: none. Licence: site terms. Update: weekly. CORS: n/a. Status: verified.
  - Coverage: Royal Docks, Silvertown.
- **Greenwich+Docklands International Festival** (Greenwich+Docklands Festivals). [page](https://festival.org/)
  - Auth: none. Licence: site terms. Update: yearly (summer). CORS: n/a. Status: verified.
  - Coverage: Greenwich and Docklands.

## Planning applications

- **Planning London Datahub (all London planning applications)** (Greater London Authority). [page](https://www.london.gov.uk/sites/default/files/planninglondondatahub_api_connection_technical_documentation_v1.pdf) · API: `https://planningdata.london.gov.uk/api-guest/applications/_search`
  - Auth: none (published guest header X-API-AllowRequest). Licence: Open Government Licence v3.0. Update: daily. CORS: no. Status: verified.
  - Coverage: all 35 London planning authorities incl. LLDC.
  - Returned: POST _search with the guest header returned Tower Hamlets applications with site name, description, decision date and centroid.
  - Guest access needs the header documented in the GLA connection PDF; a browser call needs that header to pass CORS preflight.
- **planning.data.gov.uk API (conservation areas, listed buildings, TPOs, Article 4)** (MHCLG). [page](https://www.planning.data.gov.uk/docs) · API: `https://www.planning.data.gov.uk/entity.json`
  - Sample: <https://www.planning.data.gov.uk/entity.json?dataset=conservation-area&geometry=POLYGON((-0.03%2051.495,-0.005%2051.495,-0.005%2051.51,-0.03%2051.51,-0.03%2051.495))&geometry_relation=intersects&limit=10>
  - Auth: none. Licence: Open Government Licence v3.0. Update: daily. CORS: yes. Status: verified.
  - Coverage: England, per authority.
  - Returned: Conservation areas in the Isle of Dogs box, e.g. TH-19-WID "West India Dock" with its MULTIPOLYGON.
- **Tower Hamlets planning applications search** (London Borough of Tower Hamlets). [page](https://development.towerhamlets.gov.uk/online-applications/)
  - Auth: none. Licence: site terms. Update: daily. CORS: n/a. Status: verified.
  - Coverage: Tower Hamlets incl. E14.
  - Personal details of applicants and objectors appear in documents; use application metadata only.
- **Southwark planning applications search** (London Borough of Southwark). [page](https://planning.southwark.gov.uk/online-applications/)
  - Auth: none. Licence: site terms. Update: daily. CORS: n/a. Status: **not verified** — page: curl: (35) Recv failure: Connection reset by peer (connection reset at the session proxy; may work from elsewhere).
  - Coverage: Southwark incl. SE16.
- **Royal Greenwich planning applications search** (Royal Borough of Greenwich). [page](https://planning.royalgreenwich.gov.uk/online-applications/)
  - Auth: none. Licence: site terms. Update: daily. CORS: n/a. Status: verified.
  - Coverage: Greenwich incl. SE10.
- **Newham planning applications search** (London Borough of Newham). [page](https://pa.newham.gov.uk/online-applications/)
  - Auth: none. Licence: site terms. Update: daily. CORS: n/a. Status: **not verified** — page: curl: (35) Recv failure: Connection reset by peer (connection reset at the session proxy; may work from elsewhere).
  - Coverage: Newham incl. Leamouth, Canning Town.
- **Lewisham planning applications search** (London Borough of Lewisham). [page](https://planning.lewisham.gov.uk/online-applications/)
  - Auth: none. Licence: site terms. Update: daily. CORS: n/a. Status: verified.
  - Coverage: Lewisham incl. Deptford.

## Geodata

- **OS OpenData downloads** (Ordnance Survey). [page](https://osdatahub.os.uk/downloads/open) · API: `https://api.os.uk/downloads/v1/products`
  - Sample: <https://api.os.uk/downloads/v1/products>
  - Auth: none for OpenData downloads. Licence: Open Government Licence v3.0. Update: quarterly. CORS: yes. Status: verified.
  - Coverage: Great Britain: OS Open Zoomstack, Open Roads, OpenMap Local, Terrain 50, Open UPRN, Open USRN, Boundary-Line.
  - Returned: JSON list of OS OpenData products with download links.
- **OS Data Hub APIs (Maps, Features, NGD, Names)** (Ordnance Survey). [page](https://osdatahub.os.uk/) · API: `https://api.os.uk/maps/raster/v1/zxy/`
  - Auth: free key (OpenData plan); premium data needs a plan. Licence: OGL for OpenData; OS licence for premium. Update: monthly. CORS: no. Status: verified.
  - Coverage: Great Britain.
- **EA LiDAR Composite DTM 1 m (WCS)** (Environment Agency). [page](https://environment.data.gov.uk/survey) · API: `https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs`
  - Sample: <https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs?service=WCS&version=2.0.1&request=DescribeCoverage&CoverageId=13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m>
  - Auth: none. Licence: Open Government Licence v3.0. Update: yearly. CORS: yes. Status: verified.
  - Coverage: England at 1 m; used by cwplans already.
  - Returned: WCS DescribeCoverage for the 1 m DTM coverage.
  - DSM (first return) at …/lidar-composite-digital-surface-model-first-return-dsm-1m/wcs.
- **EA LiDAR Composite first-return DSM 1 m (WCS)** (Environment Agency). [page](https://environment.data.gov.uk/survey) · API: `https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-first-return-dsm-1m/wcs`
  - Sample: <https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-first-return-dsm-1m/wcs?service=WCS&version=2.0.1&request=GetCapabilities>
  - Auth: none. Licence: Open Government Licence v3.0. Update: yearly. CORS: yes. Status: verified.
  - Coverage: England at 1 m.
  - Returned: WCS 2.0 capabilities document.
  - Building heights = DSM − DTM.
- **OpenStreetMap API 0.6 (map call)** (OpenStreetMap Foundation). [page](https://wiki.openstreetmap.org/wiki/API_v0.6) · API: `https://api.openstreetmap.org/api/0.6/map.json`
  - Sample: <https://api.openstreetmap.org/api/0.6/map.json?bbox=-0.0210,51.5040,-0.0180,51.5060>
  - Auth: none (read). Licence: ODbL 1.0. Update: realtime. CORS: yes. Status: verified.
  - Coverage: global.
  - Returned: OSM JSON for a 200 m box at Canary Wharf (nodes, ways, relations).
  - For editing tools; bulk reads belong on Overpass or extracts.
- **Overpass API** (Overpass (community instances)). [page](https://wiki.openstreetmap.org/wiki/Overpass_API) · API: `https://overpass-api.de/api/interpreter`
  - Sample: <https://overpass-api.de/api/interpreter?data=%5Bout%3Ajson%5D%3Bnode%5Bamenity%3Dpub%5D(51.49%2C-0.03%2C51.51%2C-0.01)%3Bout%3B>
  - Auth: none. Licence: ODbL 1.0. Update: minutes. CORS: no. Status: **not verified** — sample: curl: (35) Recv failure: Connection reset by peer (connection reset at the session proxy; may work from elsewhere).
  - Coverage: global.
  - From this container curl got a connection reset and Node fetch got HTTP 504 "OSM3S Response" (server busy or timed out) on 2026-10-02. Earlier cwplans work also found it unreachable. Use the OSM API or a Geofabrik extract instead for small boxes.
- **Geofabrik Greater London extract** (Geofabrik). [page](https://download.geofabrik.de/europe/united-kingdom/england/greater-london.html)
  - Auth: none. Licence: ODbL 1.0. Update: daily. CORS: n/a. Status: verified.
  - Coverage: Greater London.
- **Nominatim geocoder** (OpenStreetMap Foundation). [page](https://nominatim.org/release-docs/latest/api/Overview/) · API: `https://nominatim.openstreetmap.org/search`
  - Sample: <https://nominatim.openstreetmap.org/search?q=Canada+Square,+London&format=json&limit=1>
  - Auth: none (1 request/s, identifying UA). Licence: ODbL 1.0. Update: minutes. CORS: yes. Status: verified.
  - Coverage: global.
  - Returned: Canada Square, Canary Wharf, with OSM id and bounding box.
- **Wikidata Query Service (items within 500 m of Canary Wharf)** (Wikimedia Foundation). [page](https://query.wikidata.org/) · API: `https://query.wikidata.org/sparql`
  - Sample: <https://query.wikidata.org/sparql?format=json&query=SELECT%20%3Fitem%20%3FitemLabel%20%3Fcoord%20WHERE%20%7B%20SERVICE%20wikibase%3Aaround%20%7B%20%3Fitem%20wdt%3AP625%20%3Fcoord%20.%20bd%3AserviceParam%20wikibase%3Acenter%20%22Point(-0.02%2051.505)%22%5E%5Egeo%3AwktLiteral%20.%20bd%3AserviceParam%20wikibase%3Aradius%20%220.5%22%20.%20%7D%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22en%22%20.%20%7D%20%7D%20LIMIT%2020>
  - Auth: none. Licence: CC0. Update: realtime. CORS: yes. Status: verified.
  - Coverage: global.
  - Returned: 20 items within 0.5 km, e.g. Poplar DLR station, St Matthias Old Church, Canary Wharf railway station.
- **Wikipedia GeoSearch (articles near Canary Wharf)** (Wikimedia Foundation). [page](https://www.mediawiki.org/wiki/Extension:GeoData) · API: `https://en.wikipedia.org/w/api.php`
  - Sample: <https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=51.505%7C-0.02&gsradius=2000&gslimit=20&format=json&origin=*>
  - Auth: none. Licence: CC BY-SA 4.0 (text). Update: realtime. CORS: yes. Status: verified.
  - Coverage: global.
  - Returned: Articles within 2 km: UCL School of Management, One Canada Square, Canada Square, Canary Wharf DLR station, 25 North Colonnade, …
  - origin=* enables anonymous CORS.
- **Wikimedia Commons photos near Canary Wharf** (Wikimedia Foundation). [page](https://commons.wikimedia.org/wiki/Commons:Geocoding) · API: `https://commons.wikimedia.org/w/api.php`
  - Sample: <https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gsnamespace=6&gscoord=51.505%7C-0.02&gsradius=1000&gslimit=20&format=json&origin=*>
  - Auth: none. Licence: per file (CC BY-SA, CC BY, PD). Update: realtime. CORS: yes. Status: verified.
  - Coverage: global.
  - Returned: 20 geotagged files within 1 km.
  - Check each file's licence and attribution.
- **BGS OGC API – Features (geology, boreholes)** (British Geological Survey). [page](https://ogcapi.bgs.ac.uk/) · API: `https://ogcapi.bgs.ac.uk/collections`
  - Sample: <https://ogcapi.bgs.ac.uk/collections?f=json>
  - Auth: none. Licence: Open Government Licence v3.0. Update: irregular. CORS: yes. Status: verified.
  - Coverage: Great Britain.
  - Returned: List of BGS collections (e.g. scanned maps, boreholes, geology).
- **BGS geology 1:50k WMS** (British Geological Survey). [page](https://www.bgs.ac.uk/technologies/web-map-services-wms/) · API: `https://map.bgs.ac.uk/arcgis/services/BGS_Detailed_Geology/MapServer/WMSServer`
  - Sample: <https://map.bgs.ac.uk/arcgis/services/BGS_Detailed_Geology/MapServer/WMSServer?service=WMS&request=GetCapabilities>
  - Auth: none. Licence: Open Government Licence v3.0. Update: static. CORS: yes. Status: verified.
  - Coverage: Great Britain.
  - Returned: WMS 1.3.0 capabilities for BGS detailed geology.
- **BGS GeoIndex onshore (boreholes, scans)** (British Geological Survey). [page](https://www.bgs.ac.uk/map-viewers/geoindex-onshore/)
  - Auth: none. Licence: OGL for index; scans under BGS terms. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: Great Britain; dense borehole records on the Isle of Dogs.
- **BGS Geology Viewer** (British Geological Survey). [page](https://geologyviewer.bgs.ac.uk/)
  - Auth: none. Licence: Open Government Licence v3.0. Update: static. CORS: n/a. Status: verified.
  - Coverage: Great Britain.
- **National Library of Scotland historic maps (OS 25-inch London)** (National Library of Scotland). [page](https://maps.nls.uk/geo/explore/)
  - Auth: none to view; tile reuse under NLS terms. Licence: CC BY (NLS) for most OS maps; tile hosting terms apply. Update: static. CORS: n/a. Status: **not verified** — HTTP 405 for page (the server answered but refuses scripted requests; page content not seen).
  - Coverage: Great Britain; London 1890s–1950s.
- **Layers of London** (Institute of Historical Research). [page](https://www.layersoflondon.org/)
  - Auth: none. Licence: per layer. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: Greater London historic maps and records.
- **Colouring London (building attributes)** (Colouring Britain / Alan Turing Institute / UCL). [page](https://colouring.london/)
  - Auth: none. Licence: ODbL 1.0. Update: daily. CORS: n/a. Status: verified.
  - Coverage: London buildings: age, use, height.
- **postcodes.io (postcodes, wards, LSOAs near a point)** (Ideal Postcodes (open source)). [page](https://postcodes.io/) · API: `https://api.postcodes.io/postcodes`
  - Sample: <https://api.postcodes.io/postcodes?lon=-0.02&lat=51.505>
  - Auth: none. Licence: OGL / ONS (postcode data). Update: quarterly. CORS: yes. Status: verified.
  - Coverage: UK.
  - Returned: Nearest postcodes: E14 5AB, E14 5DX, E14 5AL; ward Canary Wharf; LSOA Tower Hamlets 033B.
- **ONS Open Geography Portal (boundaries)** (Office for National Statistics). [page](https://geoportal.statistics.gov.uk/)
  - Auth: none. Licence: Open Government Licence v3.0. Update: yearly. CORS: n/a. Status: verified.
  - Coverage: UK.
- **ADMIRALTY Marine Data Portal (bathymetry)** (UK Hydrographic Office). [page](https://datahub.admiralty.co.uk/portal/apps/sites/#/marine-data-portal)
  - Auth: none. Licence: OGL for INSPIRE bathymetry. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: UK waters; tidal Thames coverage limited.
- **Natural England open data** (Natural England). [page](https://naturalengland-defra.opendata.arcgis.com/)
  - Auth: none. Licence: Open Government Licence v3.0. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: England.
- **Overture Maps (buildings, places, transport)** (Overture Maps Foundation). [page](https://docs.overturemaps.org/)
  - Auth: none. Licence: ODbL / CDLA Permissive 2.0 per theme. Update: monthly. CORS: n/a. Status: verified.
  - Coverage: global.
  - Building heights where known.
- **Microsoft Global ML Building Footprints** (Microsoft). [page](https://planetarycomputer.microsoft.com/dataset/ms-buildings)
  - Auth: none. Licence: ODbL 1.0. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: global incl. UK.

## Satellite and aerial imagery

- **Copernicus Data Space Ecosystem STAC (Sentinel-2 over Docklands)** (European Commission / ESA). [page](https://dataspace.copernicus.eu/) · API: `https://stac.dataspace.copernicus.eu/v1/search`
  - Sample: <https://stac.dataspace.copernicus.eu/v1/search?collections=sentinel-2-l2a&bbox=-0.08,51.48,0.03,51.52&limit=3&sortby=-datetime>
  - Auth: none for search; free account to download. Licence: Copernicus open licence. Update: daily (revisit ~5 days). CORS: yes. Status: verified.
  - Coverage: global.
  - Returned: Latest Sentinel-2 L2A scenes, e.g. S2C_MSIL2A_20261002T110901 tiles T30UYC and T30UXC.
- **Copernicus Data Space OData catalogue** (European Commission / ESA). [page](https://documentation.dataspace.copernicus.eu/APIs/OData.html) · API: `https://catalogue.dataspace.copernicus.eu/odata/v1/Products`
  - Sample: <https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=Collection/Name%20eq%20'SENTINEL-2'%20and%20OData.CSC.Intersects(area=geography'SRID=4326;POINT(-0.02%2051.505)')&$top=3&$orderby=ContentDate/Start%20desc>
  - Auth: none for search. Licence: Copernicus open licence. Update: daily. CORS: yes. Status: verified.
  - Coverage: global.
  - Returned: Latest Sentinel-2 products intersecting the point.
- **Sentinel Hub (processing API)** (Planet / Sinergise (via CDSE)). [page](https://www.sentinel-hub.com/) · API: `https://sh.dataspace.copernicus.eu/api/v1/process`
  - Auth: free account (CDSE quota). Licence: Copernicus open licence for data. Update: daily. CORS: no. Status: verified.
  - Coverage: global.
- **Element 84 Earth Search STAC (Sentinel-2 COGs on AWS)** (Element 84). [page](https://element84.com/earth-search/) · API: `https://earth-search.aws.element84.com/v1/search`
  - Sample: <https://earth-search.aws.element84.com/v1/search?collections=sentinel-2-l2a&bbox=-0.08,51.48,0.03,51.52&limit=3>
  - Auth: none. Licence: Copernicus open licence. Update: daily. CORS: yes. Status: verified.
  - Coverage: global.
  - Returned: 3,771 matching scenes; latest S2C_30UXC_20261002 (33% cloud), S2A_30UXC_20261001 (17% cloud).
  - Cloud-optimised GeoTIFFs can be read in-browser with range requests.
- **Microsoft Planetary Computer STAC** (Microsoft). [page](https://planetarycomputer.microsoft.com/) · API: `https://planetarycomputer.microsoft.com/api/stac/v1/search`
  - Sample: <https://planetarycomputer.microsoft.com/api/stac/v1/search?collections=sentinel-2-l2a&bbox=-0.08,51.48,0.03,51.52&limit=3>
  - Auth: none for search; SAS token (free, anonymous) for assets. Licence: per collection. Update: daily. CORS: yes. Status: verified.
  - Coverage: global.
  - Returned: Sentinel-2 L2A STAC items for the box.
- **NASA GIBS WMTS (daily global imagery)** (NASA EOSDIS). [page](https://nasa-gibs.github.io/gibs-api-docs/) · API: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/`
  - Sample: <https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-09-30/GoogleMapsCompatible_Level9/6/21/31.jpg>
  - Auth: none. Licence: NASA open data (no restrictions; attribution requested). Update: daily. CORS: yes. Status: verified.
  - Coverage: global, 250 m to 1 km.
  - Returned: A 256×256 JPEG tile of MODIS Terra true colour for 2026-09-30 covering south-east England.
  - Too coarse for buildings; useful for weather and the estuary.
- **NASA Worldview** (NASA EOSDIS). [page](https://worldview.earthdata.nasa.gov/)
  - Auth: none. Licence: NASA open data. Update: daily. CORS: n/a. Status: verified.
  - Coverage: global.
- **USGS EarthExplorer** (US Geological Survey). [page](https://earthexplorer.usgs.gov/)
  - Auth: free account. Licence: public domain (Landsat). Update: daily. CORS: n/a. Status: verified.
  - Coverage: global.
- **USGS Landsat STAC server** (US Geological Survey). [page](https://landsatlook.usgs.gov/) · API: `https://landsatlook.usgs.gov/stac-server/search`
  - Sample: <https://landsatlook.usgs.gov/stac-server/search?collections=landsat-c2l2-sr&bbox=-0.08,51.48,0.03,51.52&limit=3>
  - Auth: none for search. Licence: public domain. Update: daily (revisit 8 days). CORS: no. Status: verified.
  - Coverage: global.
  - Returned: 2,277 Landsat Collection 2 L2 scenes match the box.
- **Historic England Aerial Photo Explorer** (Historic England). [page](https://historicengland.org.uk/images-books/archive/collections/aerial-photos/)
  - Auth: none. Licence: Historic England terms (non-commercial reuse). Update: irregular. CORS: n/a. Status: **not verified** — HTTP 403 for page (Cloudflare browser challenge).
  - Coverage: England; Docklands photographed from 1920s.
- **Britain from Above (Aerofilms 1919–2006)** (Historic England / RCAHMS / RCAHMW). [page](https://britainfromabove.org.uk/)
  - Auth: none to view. Licence: non-commercial terms. Update: static. CORS: n/a. Status: verified.
  - Coverage: Britain; many West India Docks views.
- **Copernicus Land Monitoring Service (Urban Atlas, building heights)** (European Environment Agency). [page](https://land.copernicus.eu/)
  - Auth: free account for downloads. Licence: Copernicus open licence. Update: static (2012, 2018 editions). CORS: n/a. Status: verified.
  - Coverage: Europe; London functional urban area.
- **Planet open data programs** (Planet Labs). [page](https://www.planet.com/industries/education-and-research/)
  - Auth: account (research/education application). Licence: Planet licence (not open). Update: daily. CORS: n/a. Status: verified.
  - Coverage: NICFI open basemaps are tropics only; London needs a research licence.
- **Mapillary street-level imagery** (Mapillary (Meta)). [page](https://www.mapillary.com/developer/api-documentation) · API: `https://graph.mapillary.com/images`
  - Auth: free key (client token). Licence: CC BY-SA 4.0. Update: daily. CORS: yes. Status: verified.
  - Coverage: global; good coverage in Docklands.
  - Faces and plates are blurred by Mapillary.
- **Geograph Britain and Ireland (photos by grid square)** (Geograph Project). [page](https://www.geograph.org.uk/) · API: `https://api.geograph.org.uk/syndicator.php`
  - Auth: free key. Licence: CC BY-SA 2.0. Update: daily. CORS: yes. Status: verified.
  - Coverage: Britain; TQ3779/TQ3879 cover Canary Wharf.
- **Copernicus Browser** (European Commission / ESA). [page](https://browser.dataspace.copernicus.eu/)
  - Auth: none to view; free account to download. Licence: Copernicus open licence. Update: daily. CORS: n/a. Status: verified.
  - Coverage: global.
- **EO Browser (Sentinel Hub)** (Planet / Sinergise). [page](https://apps.sentinel-hub.com/eo-browser/)
  - Auth: free account. Licence: source data licences. Update: daily. CORS: n/a. Status: verified.
  - Coverage: global.

## Energy and environment

- **Open Charge Map (EV charge points)** (Open Charge Map). [page](https://openchargemap.org/site/develop/api) · API: `https://api.openchargemap.io/v3/poi`
  - Auth: free key. Licence: CC BY 4.0 (most data). Update: daily. CORS: yes. Status: verified.
  - Coverage: global.
- **Carbon Intensity API: forecast for E14** (NESO with University of Oxford, WWF, EDF). [page](https://carbonintensity.org.uk/) · API: `https://api.carbonintensity.org.uk/regional/postcode/{outcode}`
  - Sample: <https://api.carbonintensity.org.uk/regional/postcode/E14>
  - Auth: none. Licence: CC BY 4.0. Update: half-hourly. CORS: yes. Status: verified.
  - Coverage: GB regions; E14 is in region 13 "UKPN London".
  - Returned: Region 13 "UKPN London": forecast 195–199 gCO2/kWh, index "high", with generation mix.
  - Includes the generation mix.
- **UK Power Networks Open Data Portal** (UK Power Networks). [page](https://ukpowernetworks.opendatasoft.com/) · API: `https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets`
  - Sample: <https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets?limit=5>
  - Auth: none for catalogue; free key for most records. Licence: UKPN open data licence (mostly CC BY 4.0). Update: daily. CORS: yes. Status: verified.
  - Coverage: London, South East and East networks.
  - Returned: Catalogue: 138 datasets.
- **UK Power Networks live faults (power cuts)** (UK Power Networks). [page](https://ukpowernetworks.opendatasoft.com/explore/dataset/ukpn-live-faults/) · API: `https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-live-faults/records`
  - Sample: <https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-live-faults/records?limit=5>
  - Auth: none (this dataset is open without a key). Licence: UKPN open data licence. Update: minutes. CORS: yes. Status: verified.
  - Coverage: UKPN area; postcode-aggregated points, cuts affecting 5 or fewer customers omitted.
  - Returned: 75 current planned and unplanned faults across UKPN area.
- **UK Power Networks grid and primary substation sites** (UK Power Networks). [page](https://ukpowernetworks.opendatasoft.com/explore/dataset/grid-and-primary-sites/) · API: `https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/grid-and-primary-sites/records`
  - Sample: <https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/grid-and-primary-sites>
  - Auth: free key for records (metadata is open). Licence: UKPN open data licence. Update: monthly. CORS: yes. Status: verified.
  - Coverage: UKPN area.
  - Returned: Dataset metadata (records need a key).
- **Energy performance of buildings data (EPC)** (MHCLG). [page](https://get-energy-performance-data.communities.gov.uk/)
  - Auth: account (GOV.UK One Login). Licence: OGL for most fields (address data under Royal Mail/OS terms). Update: monthly. CORS: n/a. Status: verified.
  - Coverage: England and Wales.
  - Replaced epc.opendatacommunities.org on 30 May 2026.
- **Elexon Insights API (GB generation by fuel)** (Elexon). [page](https://bmrs.elexon.co.uk/api-documentation) · API: `https://data.elexon.co.uk/bmrs/api/v1/generation/outturn/summary`
  - Sample: <https://data.elexon.co.uk/bmrs/api/v1/generation/outturn/summary>
  - Auth: none. Licence: BMRS data licence (open). Update: half-hourly. CORS: yes. Status: verified.
  - Coverage: Great Britain.
  - Returned: Half-hourly GB generation by fuel type.
- **NESO data portal** (National Energy System Operator). [page](https://www.neso.energy/data-portal) · API: `https://api.neso.energy/api/3/action/package_list`
  - Sample: <https://api.neso.energy/api/3/action/package_list>
  - Auth: none. Licence: NESO open data licence. Update: daily. CORS: yes. Status: verified.
  - Coverage: Great Britain.
  - Returned: List of NESO dataset names.
- **DESNZ sub-national electricity and gas consumption** (Department for Energy Security and Net Zero). [page](https://www.gov.uk/government/collections/sub-national-electricity-consumption-data)
  - Auth: none. Licence: Open Government Licence v3.0. Update: yearly. CORS: n/a. Status: verified.
  - Coverage: GB by LSOA/MSOA.
- **Open Infrastructure Map (power, telecoms, water from OSM)** (Open Infrastructure Map). [page](https://openinframap.org/)
  - Auth: none. Licence: ODbL 1.0 (OSM data). Update: daily. CORS: n/a. Status: verified.
  - Coverage: global.
  - Substations and cable routes as mapped in OSM.

## Nature and biodiversity

- **GBIF species occurrences on the Isle of Dogs** (GBIF). [page](https://techdocs.gbif.org/en/openapi/v1/occurrence) · API: `https://api.gbif.org/v1/occurrence/search`
  - Sample: <https://api.gbif.org/v1/occurrence/search?decimalLatitude=51.48,51.51&decimalLongitude=-0.04,0.0&limit=5>
  - Auth: none. Licence: per record: CC0, CC BY, CC BY-NC. Update: daily. CORS: yes. Status: verified.
  - Coverage: global.
  - Returned: 28,713 occurrences in the box, e.g. Viola odorata, Solanum dulcamara, Artemisia vulgaris.
  - Sensitive species locations are generalised by publishers.
- **NBN Atlas records near Canary Wharf** (National Biodiversity Network Trust). [page](https://nbnatlas.org/) · API: `https://records-ws.nbnatlas.org/occurrences/search`
  - Sample: <https://records-ws.nbnatlas.org/occurrences/search?lat=51.505&lon=-0.02&radius=1&pageSize=5>
  - Auth: none. Licence: per dataset (CC0, CC BY, OGL, CC BY-NC). Update: weekly. CORS: yes. Status: verified.
  - Coverage: UK.
  - Returned: 9,833 records within 1 km.

## Open data portals

- **Tower Hamlets planning datasets (ArcGIS hub)** (London Borough of Tower Hamlets). [page](https://planning-datasets-towerhamlets.hub.arcgis.com/)
  - Auth: none. Licence: Open Government Licence v3.0. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: conservation areas, listed buildings, Article 4, TPOs.
- **Defra Data Services Platform** (Defra). [page](https://environment.data.gov.uk/)
  - Auth: none. Licence: Open Government Licence v3.0. Update: daily. CORS: n/a. Status: verified.
  - Coverage: England.
- **London Datastore (CKAN API)** (Greater London Authority). [page](https://data.london.gov.uk/) · API: `https://data.london.gov.uk/api/3/action/package_search`
  - Sample: <https://data.london.gov.uk/api/3/action/package_search?q=tower%20hamlets&rows=3>
  - Auth: none. Licence: mostly OGL. Update: daily. CORS: no. Status: verified.
  - Coverage: London.
  - Returned: 1,305 datasets match "tower hamlets".
- **data.gov.uk (CKAN API)** (GDS / DSIT). [page](https://www.data.gov.uk/) · API: `https://ckan.publishing.service.gov.uk/api/3/action/package_search`
  - Sample: <https://ckan.publishing.service.gov.uk/api/3/action/package_search?q=docklands&rows=3>
  - Auth: none. Licence: mostly OGL. Update: daily. CORS: yes. Status: verified.
  - Coverage: UK.
  - Returned: Datasets matching "docklands".
- **Tower Hamlets transparency and open data** (London Borough of Tower Hamlets). [page](https://www.towerhamlets.gov.uk/lgnl/council_and_democracy/Transparency/Transparency.aspx)
  - Auth: none. Licence: per source. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: Tower Hamlets.
- **Southwark open data** (London Borough of Southwark). [page](https://www.southwark.gov.uk/about-council/transparency/freedom-information-data-protection-and-open-data)
  - Auth: none. Licence: OGL. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: Southwark.
- **Royal Greenwich Data Observatory** (Royal Borough of Greenwich). [page](https://dataobservatory.royalgreenwich.gov.uk/)
  - Auth: none. Licence: OGL. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: Greenwich.
- **Newham transparency and open data** (London Borough of Newham). [page](https://www.newham.gov.uk/homepage/259/transparency)
  - Auth: none. Licence: OGL. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: Newham.
- **Nomis API (Census 2021 and labour market by small area)** (ONS / Durham University). [page](https://www.nomisweb.co.uk/api/v01/help) · API: `https://www.nomisweb.co.uk/api/v01/dataset/`
  - Sample: <https://www.nomisweb.co.uk/api/v01/dataset/NM_2021_1.data.json?geography=E09000030&measures=20100>
  - Auth: none (key for large queries). Licence: Open Government Licence v3.0. Update: monthly. CORS: yes. Status: verified.
  - Coverage: UK; E09000030 = Tower Hamlets.
  - Returned: Census 2021 table NM_2021_1 for E09000030 Tower Hamlets.
- **ONS API** (Office for National Statistics). [page](https://developer.ons.gov.uk/) · API: `https://api.beta.ons.gov.uk/v1/datasets`
  - Sample: <https://api.beta.ons.gov.uk/v1/datasets?limit=3>
  - Auth: none. Licence: Open Government Licence v3.0. Update: daily. CORS: yes. Status: verified.
  - Coverage: UK.
  - Returned: First 3 ONS datasets with metadata.
- **UK government API catalogue** (GDS / CDDO). [page](https://www.api.gov.uk/)
  - Auth: none. Licence: Open Government Licence v3.0. Update: irregular. CORS: n/a. Status: verified.
  - Coverage: UK public sector APIs.
- **MHCLG Open Data Communities** (MHCLG). [page](https://opendatacommunities.org/)
  - Auth: none. Licence: Open Government Licence v3.0. Update: irregular. CORS: n/a. Status: **not verified** — page: curl: (60) SSL certificate problem: certificate has expired.
  - Coverage: England.

## Places and infrastructure (public records)

- **Companies House API (company records by address)** (Companies House). [page](https://developer.company-information.service.gov.uk/) · API: `https://api.company-information.service.gov.uk/advanced-search/companies`
  - Sample: <https://api.company-information.service.gov.uk/advanced-search/companies?location=E14>
  - Auth: free key (HTTP basic). Licence: Companies House terms (free reuse). Update: daily. CORS: yes. Status: verified, needs a key (sample answered 401).
  - Coverage: UK companies.
  - Returned: 401 Empty Authorization header.
  - Use company-level records only (counts per building, SIC codes). Do not pull officer or person-with-significant-control data.
- **Companies House basic company data (bulk)** (Companies House). [page](https://download.companieshouse.gov.uk/en_output.html)
  - Auth: none. Licence: Companies House terms. Update: monthly. CORS: n/a. Status: verified.
  - Coverage: UK companies, registered office addresses.
  - Company-level only; no officers.
- **HM Land Registry Price Paid Data (linked data)** (HM Land Registry). [page](https://landregistry.data.gov.uk/app/ppd) · API: `https://landregistry.data.gov.uk/data/ppi/transaction-record.json`
  - Sample: <https://landregistry.data.gov.uk/data/ppi/transaction-record.json?propertyAddress.street=WESTFERRY%20ROAD&propertyAddress.town=LONDON&_pageSize=5>
  - Auth: none. Licence: OGL (with Royal Mail/OS address caveats). Update: monthly. CORS: yes. Status: verified.
  - Coverage: England and Wales sales since 1995.
  - Returned: Sales on Westferry Road since 1995, e.g. £57,000 (June 1996), £168,500 (Sept 2005).
  - Show as aggregates (median price by postcode sector or building), not as lists of individual homes.
- **UK House Price Index (Tower Hamlets)** (HM Land Registry). [page](https://landregistry.data.gov.uk/app/ukhpi) · API: `https://landregistry.data.gov.uk/data/ukhpi/region/tower-hamlets.json`
  - Sample: <https://landregistry.data.gov.uk/data/ukhpi/region/tower-hamlets/month/2025-06.json>
  - Auth: none. Licence: Open Government Licence v3.0. Update: monthly. CORS: yes. Status: verified.
  - Coverage: by local authority.
  - Returned: Tower Hamlets, June 2025: average price £525,583; flats/maisonettes £506,369.
- **HM Land Registry INSPIRE Index Polygons** (HM Land Registry). [page](https://use-land-property-data.service.gov.uk/datasets/inspire)
  - Auth: none. Licence: INSPIRE licence (OGL-like with conditions). Update: monthly. CORS: n/a. Status: verified.
  - Coverage: freehold title extents, England and Wales.
- **Food Standards Agency hygiene ratings near Canary Wharf** (Food Standards Agency). [page](https://ratings.food.gov.uk/) · API: `https://api.ratings.food.gov.uk/Establishments`
  - Sample: <https://api.ratings.food.gov.uk/Establishments?latitude=51.505&longitude=-0.02&maxDistanceLimit=0.3&pageSize=5>
  - Auth: none (header x-api-version: 2). Licence: Open Government Licence v3.0. Update: daily. CORS: yes. Status: verified.
  - Coverage: UK food businesses.
  - Returned: 7,606 establishments within the radius (the API widens its search); first results rated 5.
  - Needs the x-api-version: 2 header; the sample was fetched with it.
- **Historic England open data hub (National Heritage List)** (Historic England). [page](https://opendata-historicengland.hub.arcgis.com/)
  - Auth: none. Licence: OGL (NHLE data). Update: weekly. CORS: n/a. Status: verified.
  - Coverage: England: listed buildings, scheduled monuments, parks and gardens.
- **Listed buildings near Canary Wharf (planning.data.gov.uk)** (MHCLG (data from Historic England)). [page](https://www.planning.data.gov.uk/dataset/listed-building) · API: `https://www.planning.data.gov.uk/entity.json`
  - Sample: <https://www.planning.data.gov.uk/entity.json?dataset=listed-building&geometry=POLYGON((-0.03%2051.495,-0.005%2051.495,-0.005%2051.51,-0.03%2051.51,-0.03%2051.495))&geometry_relation=intersects&limit=10>
  - Auth: none. Licence: Open Government Licence v3.0. Update: weekly. CORS: yes. Status: verified.
  - Coverage: England.
  - Returned: Listed buildings in the box, e.g. 1065068 "Sign on forecourt of White Horse public house", grade II.
- **Historic England: search the List** (Historic England). [page](https://historicengland.org.uk/listing/the-list/)
  - Auth: none. Licence: OGL for list entries. Update: weekly. CORS: n/a. Status: **not verified** — HTTP 403 for page (Cloudflare browser challenge).
  - Coverage: England.
- **Get Information about Schools (GIAS)** (Department for Education). [page](https://get-information-schools.service.gov.uk/)
  - Auth: none. Licence: Open Government Licence v3.0. Update: daily. CORS: n/a. Status: verified.
  - Coverage: England schools.

## Not verified

These were tried on 2026-10-02 and did not return a usable response from this container. They are kept because the owner publishes them; check them from a normal browser.

- PLA tide predictions and live gauges: HTTP 403 for page (Cloudflare browser challenge). <https://tidepredictions.pla.co.uk/>
- PLA tidal information page: HTTP 403 for page (Cloudflare browser challenge). <https://pla.co.uk/tidal-information>
- PLA notices to mariners: HTTP 403 for page (Cloudflare browser challenge). <https://pla.co.uk/notices-to-mariners>
- England noise and air quality viewer: page: curl: (35) OpenSSL/3.0.13: error:0A000438:SSL routines::tlsv1 alert internal error. <https://www.extrium.co.uk/noiseviewer.html>
- London City Airport noise information: HTTP 403 for page (the server answered but refuses scripted requests; page content not seen). <https://www.londoncityairport.com/corporate/sustainability/noise>
- Met Police stats and data: HTTP 403 for page (Cloudflare browser challenge). <https://www.met.police.uk/sd/stats-and-data/>
- TfL open data users page: HTTP 403 for page (the server answered but refuses scripted requests; page content not seen). <https://tfl.gov.uk/info-for/open-data-users/>
- London City Airport arrivals and departures: HTTP 403 for page (the server answered but refuses scripted requests; page content not seen). <https://www.londoncityairport.com/flights/arrivals>
- Southwark planning applications search: page: curl: (35) Recv failure: Connection reset by peer (connection reset at the session proxy; may work from elsewhere). <https://planning.southwark.gov.uk/online-applications/>
- Newham planning applications search: page: curl: (35) Recv failure: Connection reset by peer (connection reset at the session proxy; may work from elsewhere). <https://pa.newham.gov.uk/online-applications/>
- Overpass API: sample: curl: (35) Recv failure: Connection reset by peer (connection reset at the session proxy; may work from elsewhere). <https://wiki.openstreetmap.org/wiki/Overpass_API>
- National Library of Scotland historic maps (OS 25-inch London): HTTP 405 for page (the server answered but refuses scripted requests; page content not seen). <https://maps.nls.uk/geo/explore/>
- Historic England Aerial Photo Explorer: HTTP 403 for page (Cloudflare browser challenge). <https://historicengland.org.uk/images-books/archive/collections/aerial-photos/>
- MHCLG Open Data Communities: page: curl: (60) SSL certificate problem: certificate has expired. <https://opendatacommunities.org/>
- Historic England: search the List: HTTP 403 for page (Cloudflare browser challenge). <https://historicengland.org.uk/listing/the-list/>

## Excluded

Left out under the ethics limits for this catalogue: official, published or openly licensed sources only; no unsecured private cameras, people-search, face recognition, personal social media scraping or tracking of named private individuals. Aggregate crime and fire statistics are included.

- **Insecam and similar directories of unsecured private cameras**: Lists cameras whose owners never chose to publish them. Excluded by the ethics rules; not linked.
- **Third-party webcam re-hosts (e.g. worldcams.tv, geocam.ru, london-webcam.co.uk)**: Re-embed other people's streams; ownership and permission are unclear. Use the owner's page or TfL JamCams instead.
- **People-search and electoral-roll lookup sites (e.g. 192.com)**: Track named private individuals at addresses.
- **Face-recognition search engines (e.g. PimEyes)**: Identify individuals from images.
- **Scraping personal social media (geotagged posts, Instagram/X location feeds, Snap Map)**: Personal accounts; not published for reuse.
- **Strava global heatmap and activity segments** (https://www.strava.com/maps/global-heatmap): Built from individuals' tracked routes; has exposed sensitive locations before. Not fetched.
- **Companies House officer and PSC (person with significant control) data** (https://developer.company-information.service.gov.uk/): Names, birth dates and addresses of individuals. Only company-level records are in the catalogue.
- **Inside Airbnb and similar listing scrapes**: Scraped host data that identifies individuals and their homes.
- **Planning application documents (objector letters, applicant details)**: Contain personal details. The catalogue lists the portals for application metadata only.
- **Overpass mirror at maps.mail.ru** (https://maps.mail.ru/osm/tools/overpass/api/interpreter): Answered from this container when overpass-api.de did not, but it is run by VK and its terms for third-party use were not reviewed. Not listed as a source.
- **Huxley / unofficial National Rail JSON proxies**: Unofficial wrappers around Darwin with no service commitment; use the Rail Data Marketplace.

## Re-checking

```
node cwplans/feeds/check-feeds.mjs            # every page, sample and keyless api
node cwplans/feeds/check-feeds.mjs --live     # only the live-callable list above
node cwplans/feeds/check-feeds.mjs tfl-jamcams ea-tide-tower-pier
node cwplans/feeds/check-feeds.mjs --json > /tmp/feeds-check.json
```

The script prints the HTTP status, whether CORS allows a GitHub Pages origin, and marks any status that changed since feeds.json was generated. It never sends API keys; keyed sources answer 401 or 403, which is the expected result. Results can differ from the curl checks recorded here: some sites refuse one HTTP client and accept another, a few hosts were intermittently reset by the session proxy (shown as 503 or ERR), and the HM Land Registry INSPIRE page needs cookies, so a cookieless fetch loops on redirects.
