# KML and KMZ resources for the Docklands zone

Owner question, 2026-10-05: "Can you find any kml resources for the area?" This folder holds the answer:
[catalogue.json](catalogue.json), one entry per resource (40 entries), made by
`tools/find-kml.mjs` (method and rules: skill `cwplans-open-portals`, section "KML sources").

- **Zone** = the 3D model box plus the Royal Docks and the Thames Barrier (WGS84 -0.095, 51.47, 0.08, 51.53).
  The 3D page draws only inside the model box (-0.095, 51.474, 0.015, 51.522).
- **"open"** links open the file in the 3D page with `?kml=`; every one was tested headless on the live site on
  2026-10-05 ("drawn" = features the page drew; no console error from the KML layer). The live site was then
  https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/; the links below go to
  https://danbri.github.io/londat/cwplans/docklands/ and work once the londat Pages site is on (the old links redirect to
  it with the query).
- **Copies** are zone-clipped KML files made by us from open layers, hosted in
  [danbri/londat](https://github.com/danbri/londat/tree/main/cwplans/feeds/kml) (raw.githubusercontent.com sends
  `Access-Control-Allow-Origin: *`). The source, licence and attribution are in each file's Document description.
- Share-alike, restricted and no-licence files are never copied. The share-alike Curio Canopy files open by link only;
  they are not examples. The National Cycle Network copy is OGL but contains OpenStreetMap data (ODbL).

## Open-licensed, ready to open (15)

| resource | publisher | licence class | features in zone / model box | drawn | kind | 3D page |
|---|---|---|---|---|---|---|
| London Schools Atlas: all schools (2016) | Greater London Authority (London Datastore) | ogl | 279 / 163 | 165 | native | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fdata.london.gov.uk%2Fdownload%2F29j4y%2F17d3df74-9338-43ed-813b-989d57689f88%2Fall_schools_2016.kmz) |
| London wards (KML from the GLA "Create your own mapping templates" add-in) | Greater London Authority (London Datastore) | ogl | 92 / 66 | 65 | native | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fdata.london.gov.uk%2Fdownload%2F2jx1l%2F495e0c34-5da1-4647-baac-c9cb974df3aa%2Fward-map-kml.kml) |
| London Plan: Business Improvement Districts (KML zip, 2024-10-14) | Greater London Authority (London Datastore) | cc-by | 7 / 7 | 7 | native | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fdata.london.gov.uk%2Fdownload%2Fvqmx7%2Fe521c1ed-9787-42da-b229-faff6d4b65e5%2Fbusiness_improvement_districts_kml.zip) |
| TfL Cycle Routes (Cycleways, Quietways, Superhighways) in the zone | Transport for London (GIS Open Data Hub) | ogl | 420 / 356 | 356 | copy | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fraw.githubusercontent.com%2Fdanbri%2Flondat%2Fmain%2Fcwplans%2Ffeeds%2Fkml%2Ftfl-cycle-routes.kml) |
| TfL River Piers in the zone | Transport for London (GIS Open Data Hub) | ogl | 15 / 12 | 12 | copy | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fraw.githubusercontent.com%2Fdanbri%2Flondat%2Fmain%2Fcwplans%2Ffeeds%2Fkml%2Ftfl-river-piers.kml) |
| TfL River Services (with stops) in the zone | Transport for London (GIS Open Data Hub) | ogl | 11 / 10 | 10 | copy | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fraw.githubusercontent.com%2Fdanbri%2Flondat%2Fmain%2Fcwplans%2Ffeeds%2Fkml%2Ftfl-river-services.kml) |
| National Cycle Network (Walk Wheel Cycle Trust, formerly Sustrans) in the zone | Walk Wheel Cycle Trust (Sustrans) | ogl + ODbL | 350 / 294 | 293 | copy | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fraw.githubusercontent.com%2Fdanbri%2Flondat%2Fmain%2Fcwplans%2Ffeeds%2Fkml%2Fsustrans-ncn.kml) |
| Canal & River Trust locks in the zone | Canal & River Trust | ogl | 13 / 8 | 8 | copy | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fraw.githubusercontent.com%2Fdanbri%2Flondat%2Fmain%2Fcwplans%2Ffeeds%2Fkml%2Fcrt-locks.kml) |
| Thames Path National Trail in the model box | Natural England (National Trails (England), via data.gov.uk) | ogl | 1 / 1 | 1 | copy | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fraw.githubusercontent.com%2Fdanbri%2Flondat%2Fmain%2Fcwplans%2Ffeeds%2Fkml%2Fne-thames-path.kml) |
| Listed buildings in the model box (Historic England, via planning.data.gov.uk) | Historic England / MHCLG planning.data.gov.uk | ogl | 1769 / 1769 | 1732 | copy | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fraw.githubusercontent.com%2Fdanbri%2Flondat%2Fmain%2Fcwplans%2Ffeeds%2Fkml%2Fhe-listed-buildings.kml) |
| World Heritage Sites and buffer zone in the model box (Tower of London, Maritime Greenwich) | Historic England / MHCLG planning.data.gov.uk | ogl | 3 / 3 | 3 | copy | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fraw.githubusercontent.com%2Fdanbri%2Flondat%2Fmain%2Fcwplans%2Ffeeds%2Fkml%2Fhe-world-heritage.kml) |
| Heritage at Risk in the model box | Historic England / MHCLG planning.data.gov.uk | ogl | 58 / 58 | 56 | copy | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fraw.githubusercontent.com%2Fdanbri%2Flondat%2Fmain%2Fcwplans%2Ffeeds%2Fkml%2Fhe-heritage-at-risk.kml) |
| Registered parks and gardens in the model box | Historic England / MHCLG planning.data.gov.uk | ogl | 6 / 6 | 5 | copy | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fraw.githubusercontent.com%2Fdanbri%2Flondat%2Fmain%2Fcwplans%2Ffeeds%2Fkml%2Fhe-parks-gardens.kml) |
| Conservation areas in the model box (GLA Planning Constraints Map) | Greater London Authority (London Datastore) | ogl | 107 / 107 | 107 | copy | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fraw.githubusercontent.com%2Fdanbri%2Flondat%2Fmain%2Fcwplans%2Ffeeds%2Fkml%2Fgla-conservation-areas.kml) |
| London wards 2014 (GLA ward KML) in the zone | Greater London Authority (London Datastore) | ogl | 92 / 66 | 65 | copy | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fraw.githubusercontent.com%2Fdanbri%2Flondat%2Fmain%2Fcwplans%2Ffeeds%2Fkml%2Flds-wards-2016-zone.kml) |

## Open by link, not an example (2)

| resource | publisher | licence class | features in zone / model box | drawn | kind | 3D page |
|---|---|---|---|---|---|---|
| Curio Canopy: tree canopy cover by borough | Greater London Authority / Curio (London Datastore) | share-alike | 10 / 8 | 8 | native | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fdata.london.gov.uk%2Fdownload%2F2koz8%2F6c9b249b-9d02-42a7-bae9-67617fa4317c%2Fgla-boroughs-canopy-cover.kml) |
| Curio Canopy: tree canopy cover by ward | Greater London Authority / Curio (London Datastore) | share-alike | 71 / 45 | 47 | native | [open](https://danbri.github.io/londat/cwplans/docklands/?kml=https%3A%2F%2Fdata.london.gov.uk%2Fdownload%2F2koz8%2F30e728fc-d736-45d7-9853-5e1ac2ff4a3e%2Fgla-wards-canopy-cover.kml) |

## Looked at, not usable or not fetched (23)

| resource | licence | state | why |
|---|---|---|---|
| BGS Geology 625k (DiGMapGB-625) for Google Earth | not stated on the data.gov.uk record (BGS 625k data is offered under OGL on the BGS site) | status robots | robots.txt of ogc.bgs.ac.uk disallows all agents but Spatineo, so the tool does not fetch it. One manual fetch on 2026-10-05, before the robots.txt check, showed NetworkLinks (WMS overlays) and a ScreenOverlay only: the page would list the links and draw nothing |
| BGS Single Onshore Borehole Index for Google Earth | not stated on the data.gov.uk record | status robots | robots.txt disallows (see bgs-625k); the same manual fetch showed one NetworkLink only: nothing to draw |
| London river bus stops (Lambeth open mapping data, ArcGIS Hub) | none on the data.gov.uk record | status 400 | old Hub export URL from data.gov.uk answers 400 (retired Hub URL form); no licence: metadata only |
| planning.data.gov.uk entities | Open Government Licence v3.0 | not-kml | no KML: entity.kml answers 404; the API gives JSON, GeoJSON and CSV (the open layers we hold are copied above as KML) |
| ArcGIS Hub KML downloads (TfL, ONS, Sustrans, CRT, Historic England, Tower Hamlets hubs) | per item | unreliable | generated on request: the first call answers 202 "being generated"; a 3-polygon Tower Hamlets item stayed "PagingData" for over 15 minutes, TfL items answered 404 "Layer does not exist". A ?kml= link would open a JSON message. Hosted feature layers answer only JSON, GeoJSON and PBF to query (no f=kmz). So open layers are copied as KML instead |
| ArcGIS Server map services (City of London INSPIRE, GLA, PLA) | OGL (City of London); PLA not open | not-kml | supportedQueryFormats is JSON, geoJSON only: no f=kmz |
| ONS Open Geography Portal boundaries (2,367 data.gov.uk records with a KML resource) | Open Government Licence v3.0 (ONS terms) | unreliable | KML resources are ArcGIS Hub downloads (see arcgis-hub-download); the zone boundaries we need are held as GeoJSON (feeds/portals/onsgeo) |
| data.gov.uk: all datasets with a KML or KMZ resource | per dataset | walked | 4,499 of the 59,451 datasets have a KML/KMZ resource (raw walk of 2026-10-04): 2,367 ONS, 1,002 Northern Ireland, 237 NSTA; the only London ones are the GLA (above), Lambeth (no licence), BGS (NetworkLinks), DfT TEMPRO zones and NHS CCG boundaries (national, old) |
| Open Plaques | not checked | blocked | robots.txt: "User-agent: * Disallow: /"; not fetched |
| Wikimapia | CC BY-SA 3.0 | share-alike | share-alike: not allowed without the owner's agreement (CLAUDE.md); not fetched |
| Wikipedia "Attached KML" templates (e.g. Template:Attached KML/Docklands Light Railway) | CC BY-SA 4.0 (Wikipedia text) | share-alike | share-alike, often traced from OSM: listed only, not copied |
| Wikimedia Commons Data: .map pages | per page (CC0 or others) | not-kml | GeoJSON, not KML |
| Google My Maps (local history, walks) | Google terms; each map's author holds rights | restricted | not open data: list only |
| uMap maps (umap.openstreetmap.fr) | per map; OSM-based (ODbL) by default | not-fetched | KML export is made in the browser; licence per map; OSM layers we need are already derived from our own extract |
| National Trails website GPX (Thames Path) | not stated for the files | not-kml | GPX, not KML, terms not stated; the Natural England layer (OGL) is copied above as ne-thames-path |
| Saturday Walkers Club GPX & KML (Thames Path, Jubilee Walk) | free for non-commercial use only | restricted | non-commercial: not copied |
| Walking Englishman Jubilee Greenway KMZ | not stated | not-fetched | no licence: metadata only |
| OS OpenData products | Open Government Licence v3.0 | not-kml | no KML format (GeoPackage, shapefile, GML, vector tiles) |
| GeoNames | CC BY 4.0 | not-kml | no KML export from the web services (XML, JSON, RDF, dumps) |
| Environment Agency flood maps | Open Government Licence v3.0 | not-kml | WMS/WFS/GeoJSON, no KML; the flood layers are held as GeoJSON (feeds/portals/dgu) |
| Port of London Authority ArcGIS services | PLA terms (facts only) | restricted | not open: facts only (cwplans-river-and-water) |
| TfL stations (GIS Open Data Hub) | none on the item | not-copied | the item has no licence text: metadata only |
| Tower Hamlets: Canary Wharf Area | none on the item | not-copied | the item has no licence text: metadata only |

## Counts by licence class

- ogl: 18
- none: 8
- share-alike: 5
- restricted: 3
- cc-by: 2
- per item: 1
- per service: 1
- per dataset: 1
- per page: 1

Refresh: `NODE_USE_ENV_PROXY=1 KML_DOM_DIR=<dir> node cwplans/tools/find-kml.mjs all`, push the copies to
londat, run `probe` again (it reads the copies from raw.githubusercontent.com), then the headless page test in the
skill.
