# Wet areas: open data for the tidal Thames, docks, basins and creeks

Area: the Docklands box, WGS84 −0.0950, 51.4740 to 0.0150, 51.5220 (London Bridge to Cody Dock, Limehouse to Greenwich).
Collected 2026-10-03. All GeoJSON files are WGS84 (RFC 7946), clipped to the box unless the table says "not clipped".

Rebuild (from the repository root; raw responses go to `cwplans/data/raw/registry/pla/`, which is not committed):

    python3 cwplans/registry/sources/pla/fetch_wet.py             # everything
    python3 cwplans/registry/sources/pla/fetch_wet.py soundings   # or: pla, crt

`pla_tidal_flow_model.json` and the two `ukho_wrecks_obstructions_*.geojson` files were made by hand from raw downloads; the steps are in the sections below.

## Depth: what exists and its datum

| source | in the box | datum | date | open? |
|---|---|---|---|---|
| UKHO INSPIRE bathymetry: PLA multibeam survey RSDRA2018000117951, gridded | 6,090 soundings (3,537 at 25 m west of −0.0133, 2,553 at 50 m east of it) | **Admiralty Chart Datum** (EPSG::50000) | surveyed 2013-01-01 to 2017-12-31, published 2018-05-26 | yes, OGL v3.0 |
| UKHO INSPIRE bathymetry: HMS Belfast berth, Royal Navy single-beam | 29 soundings | Admiralty Chart Datum | 2015-11-07 | yes, OGL v3.0 |
| PLA main survey charts and GeoTIFFs (318–322, 376, 378A–C) | listed in `pla_hydrographic_product_areas.geojson` | chart datum | 2013–2017 editions | **blocked**: assets.pla.co.uk returns a Cloudflare challenge (HTTP 403) |
| EMODnet Bathymetry DTM (WCS `emodnet__mean`) | 105 × 46 cells of 1/16 arc-minute | LAT for sea cells | 2022 product | yes, but **no river depths here**: cells on the river hold land heights (for example +6.3 at Greenwich Reach, +10.3 in the Pool of London). Not used. |
| EA multibeam bathymetry (50 cm, m ODN) | **none**: the index has 4,188 tiles; none in TQ3075, TQ3080, TQ3575 or TQ3580 | ODN | — | OGL, but no coverage in the box |

**Chart Datum to ODN.** The PLA Tide Booklet 2025, page 19, table "Chart datums & standard levels in the Port of London", gives the level of chart datum below Ordnance Datum (Newlyn): London Bridge 3.20 m, North Woolwich 3.35 m. In the same table, at London Bridge, MHWS is 7.1 m and MLWS 0.5 m above chart datum (so MHWS is about +3.9 m ODN). So, in the box:

    height (m ODN) = z_cd − 3.20   near London Bridge
    height (m ODN) = z_cd − 3.35   at North Woolwich (just east of the box)

Interpolate along the river between the two. Source: https://www.skdocks.co.uk/wp-content/uploads/2025/01/PLA-Tide-Booklet-2025.pdf (a copy of the PLA booklet on the S&K Docks site; the 2026 booklet at https://pla.co.uk/sites/default/files/2025-12/PLA-Tide-Booklet-2026.pdf is behind the same Cloudflare challenge).

**Sign of the soundings.** In the files used here (the `25m` and `50m` CSVs, with a header line), a negative value is below chart datum. The check: the 25 m grid near HMS Belfast gives −5.6 to −7.0, and the separate Royal Navy berth survey gives −4.5 to −7.7 at the same place. The older comma-separated CSVs in the same UKHO folder (no header) hold the same points with the opposite sign; do not mix them. The GeoJSON field is `z_cd`: height above chart datum in metres (negative = below). Range in the box: −11.9 to +6.9 (positive values are drying foreshore). Median −2.4 m.

## Files

| file | what | features | source | licence | date | how to use it in the model |
|---|---|---|---|---|---|---|
| `ukho_thames_teddington_greenwich_25m.geojson` | PLA multibeam soundings, gridded at 25 m, London Bridge to Greenwich Reach | 3,537 points | https://datahub.admiralty.co.uk/Bathy_Data/Prodbathy/bathymetry/ (file "2017 2018-117951 River Thames Teddington Lock to Greenwich Reach 25m.csv") | OGL v3.0; UKHO: "not suitable for use in marine navigation" | 2013–2017 | river bed surface: triangulate the points, convert with the CD→ODN offset, clip to the OSM river polygon |
| `ukho_thames_greenwich_coalhouse_50m.geojson` | the same survey, 50 m grid, Greenwich Reach to the east edge | 2,553 points | same folder, "...Greenwich Reach to Coalhouse Point 50m.csv" | OGL v3.0 | 2013–2017 | as above; the two grids meet at lon −0.0133 and do not overlap |
| `ukho_thames_hms_belfast_berth.geojson` | Royal Navy single-beam berth survey at HMS Belfast | 29 points | same folder, "2015 2015-255836 River Thames HMS Belfast.csv" | OGL v3.0 | 2015-11-07 | detail for the Pool of London; a check on the grid |
| `ukho_wrecks_obstructions_points.geojson` | UKHO INSPIRE wrecks and obstructions: `catobs` (30 foul ground under water, 15 foul ground that covers and uncovers, 1 diffuser), `catwrk`, `valsou` (depth over the feature, m below chart datum; mostly empty here), `watlev`, `objnam` | 50 points | https://datahub.admiralty.co.uk/portal/sharing/rest/content/items/9772df125f4c463f879537379782e760/data (zip, shapefile, EPSG:3857), clipped with `ogr2ogr -t_srs EPSG:4326 -spat -0.095 51.474 0.015 51.522 -spat_srs EPSG:4326` | OGL v3.0 (item licence text) | shapefile of 2020-11-12, "updated annually" | snags on the river bed; markers in the cut-away |
| `ukho_wrecks_obstructions_areas.geojson` | the same, areas | 2 polygons | item bc0b489b793f4b04b9d9116520f3dfd1 | OGL v3.0 | 2020-11-12 | as above |
| `pla_navigational_limit.geojson` | PLA navigational limit (the river area under PLA jurisdiction), clipped | 1 polygon | https://services8.arcgis.com/QgdzYlEcjteGD0VH/arcgis/rest/services/PLA_Navigational_Limit/FeatureServer/930 | not stated (public ArcGIS item of the "Port Of London Authority" organisation) | item modified 2023-08-21 | outline of the tidal river surface |
| `pla_navigation_channels.geojson` | navigation channel lines | 7 lines | .../PLA_Navigation_Channels/FeatureServer/947 | not stated | item modified 2023-09-04 | draw the fairway on the water |
| `pla_mhwm.geojson` | PLA mean high water mark, with `height` (3.2–3.3), `method` (vessel-based LiDAR 770, inferred from imagery 154, surveyed 32, other), `date` (2015-04-01 or July 2020), `type_2` (998 artificial, 14 natural) | 1,013 lines | .../MHWM_PLA/FeatureServer/543 | not stated | 2015 and 2020 | the river edge at mean high water. The height datum is not stated; 3.2–3.3 fits m ODN (MHWS 3.9 and MHWN 2.7 m ODN at London Bridge from the booklet), so read it as m ODN until the PLA confirms |
| `pla_hydrographic_product_areas.geojson` | footprints of PLA survey products: type, product code, name, date (epoch ms), scale, distribution (External, Internal, Non Distributed) | 27 polygons, not clipped | .../Hydrographic_Product_Areas/FeatureServer/873 | not stated | charts of 2013–2020 | index of which survey covers which reach and how old it is. The External main survey charts are 318 Upper Pool (2015-05), 319 Lower Pool to Limehouse Reach (2015-02), 320 Limehouse Reach to Greenwich Reach (2015-02), 321 Greenwich Reach to Blackwall Reach (2015-08), 322 Blackwall Reach to Bugsbys Reach (2017-07), 376 Deptford Creek (2013-04), 378A/B/C Bow Creek and River Lea (2017-06). The links to their PDFs and GeoTIFFs are in the raw layer; they are blocked (see above) |
| `pla_foreshore_digging_permit.geojson`, `pla_foreshore_standard_permit.geojson`, `pla_foreshore_restrictions.geojson` | foreshore permit zones: where digging is limited to 7.5 cm, prohibited, or where entry is prohibited (scheduled monuments such as Greenwich Palace and the SS Great Eastern launch ways, the Tower of London foreshore) | 8, 3, 5 polygons | .../Digging_Permit/FeatureServer/6, .../Standard_Permit/FeatureServer/4, .../Restrictions/FeatureServer/46 | not stated | items modified 2024-08-30 and earlier | foreshore archaeology layer; ties to `../museums/` |
| `pla_port_masterplan_sites.geojson` | wharves, piers and terminals of the Port Masterplan: site name, borough, site type (82 DT, 10 NT, 8 TT, 5 TTS, 3 CCT), existing use, future opportunity. The `site_info` field (current owner or operator) is left out | 108 polygons | .../Port_Master_Plan_Sites_New/FeatureServer/964 | not stated | — | piers and wharves on the river edge |
| `pla_sediment_samples.geojson` | sediment samples for dredging licences: site, dredge code, lab, date, BNG easting/northing, metals, organotins, PCBs | 132 points | .../Sediment_Samples/FeatureServer/784 | not stated | 2011-04-04 to 2019-04-24 | sampled berths and docks (for example West India Dock 20, Enderby Wharf 23) |
| `pla_vessel_licensing_areas.geojson` | vessel licensing area | 1 polygon | .../Vessel_Licensing_Areas/FeatureServer/69 | not stated | — | context only |
| `pla_limits_1968_removed_by_hro.geojson` | areas inside the 1968 port limits that a Harbour Revision Order removed: the enclosed docks and basins (Hermitage Basin, St Katharine Docks, Shadwell Basin, Surrey Water, West India docks, ...) | 30 polygons | .../Areas_within_limits_in_1968_being_removed_from_limits_following_the_HRO/FeatureServer/68 | not stated | — | a clean outline of the impounded docks, separate from the tidal river |
| `pla_tidal_flow_model.json` | PLA tidal flow model output: 4,160 model points in the box; current speed (`speed_cms` = Var5 × 100; Var5 is 0–2.02, presumed m/s) and direction (`dir_deg`, −180 to 180; "to" or "from" is not documented) at 25 of the 73 ten-minute steps (every third step, HW−7h50 to HW+4h20 at London Bridge) | 4,160 points × 25 steps | https://services8.arcgis.com/QgdzYlEcjteGD0VH/arcgis/rest/services/Tidal_flow_model/FeatureServer/0 (all 73 steps: `data/raw/registry/pla/tidal_flow_model_box.jsonl`, 307,840 rows) | not stated | item modified 2024-10-14; model times are set in 2001 | animated flow arrows on the river surface at a chosen tide state. Lon/lat come from the BNG X/Y by a Helmert transform (about 2 m from the ArcGIS positions) |
| `crt_docks.geojson` | Canal & River Trust docks: Blackwall Basin, Poplar Dock, Millwall Outer and Inner Docks, Middle Branch Dock, Northern Branch Dock, South Dock | 7 polygons | https://services.arcgis.com/DknzyjEEie5tEW0u/arcgis/rest/services/Docks_Public/FeatureServer/3 | Canal & River Trust data licence (see below) | — | the impounded water at 4.23 m OD (see `../../../docklands/README.md`) |
| `crt_waterway_basin.geojson` | Limehouse Basin | 1 polygon | .../Waterway_Basin_View_Public/FeatureServer/0 | CRT data licence | — | as above |
| `crt_locks.geojson` | locks (Limehouse Ship Lock, Regent's Canal and Limehouse Cut locks, ...) with gate angle | 8 points | .../CRT_Locks_Public/FeatureServer/0 | CRT data licence | — | lock gates between tidal and impounded water |
| `crt_bridges.geojson` | CRT bridges with angle | 35 points | .../CRT_Bridges_Public/FeatureServer/0 | CRT data licence | — | bridges over docks and canals |
| `crt_canals.geojson` | Bow Creek, Limehouse Basin, Limehouse Cut, Regent's Canal centre lines | 4 lines | .../CRT_Canals_Public/FeatureServer/1 | CRT data licence | — | canal routes |
| `crt_culverts.geojson`, `crt_outfalls.geojson`, `crt_stop_plank_grooves.geojson` | culverts (Marsh Wall, lock service culverts, sewer), outfalls, stop-plank grooves | 6, 18, 3 points | .../Culverts_Public/FeatureServer/5, .../Outfall_Discharge_Points_View_Public/FeatureServer/0, .../Stop_Plank_Grooves_View_Public/FeatureServer/0 | CRT data licence | — | below-water detail |
| `crt_mooring_sites.geojson` | mooring sites (Limehouse Basin, Poplar Dock, South Dock visitor moorings, Millwall, West India Quay, ...) | 19 points | .../Mooring_Site_View_Public/FeatureServer/0 | CRT data licence | — | where boats lie in the docks |
| `crt_towpath.geojson` | towpath centre lines (`land_ownership` CRT or empty) | 87 lines | .../Towpath_Centre_Line_Public/FeatureServer/4 | CRT data licence | — | paths beside the water |

## Licences

- **UKHO INSPIRE data** (soundings, wrecks): Open Government Licence v3.0. Attribution: "Contains public sector information, licensed under the Open Government Licence v3.0, from the UK Hydrographic Office" (the PLA collected the 2013–2017 survey; the HMS Belfast survey is Royal Navy / MOD). Not for navigation.
- **Port of London Authority ArcGIS layers**: public items in the ArcGIS Online organisation "Port Of London Authority" (urlKey `PortofLondon`, org id `QgdzYlEcjteGD0VH`). No item has licence text. Treat them as "public, licence not stated": ask the PLA before publishing a derived model. OS_MHWM (not fetched) says "Contains Ordnance Survey data © Crown copyright 2019".
- **Canal & River Trust**: "© Canal & River Trust copyright and database rights reserved"; the CRT data licence (https://www.arcgis.com/sharing/rest/content/items/f8387b382d2c4a549debedb154338a08/data, PDF) allows copying, publishing and adapting with attribution, and **excludes any Commercial Purpose**. This is not OGL. The link in the item metadata (canalrivertrust.org.uk/media/original/26503-crt-data-licence.pdf) returns 404.

## Not taken, and why

- **PLA survey charts and GeoTIFFs** (`assets.pla.co.uk/hydrographic-services/main-survey-geotiffs/319_msc.tif` etc.) and pla.co.uk pages: Cloudflare challenge ("Just a moment", HTTP 403). Not bypassed.
- **UKHO "Wrecks and Obstructions within UK EEZ" view layer** (https://datahub.admiralty.co.uk/server/rest/services/Hosted/Wrecks_and_Obstructions_within_UK_EEZ/FeatureServer): 91 points and 2 areas in the box, newer than the INSPIRE shapefile, but it has only names and the UKHO calls its sibling layers "view only datasets" for paid services. Not committed.
- **UKHO pipelines** (17 in the box): "view only dataset". Not taken.
- **PLA layers not taken**: OS_MHWM (OS-derived; the PLA's own MHWM replaces it), Historic_England_Site and Scheduled_Monuments_500mbuffer (copies of NHLE; `../museums/` uses Historic England's own layers), Sewage_Overflow_Map (EA data, already in `../../../feeds/`), Freehold_PLA (land title numbers; not needed), Berths_Owner tables (owner names), Putney/Estuary AIS tracks (outside the box or vessel identifiers), survey123 and test layers.
- **PLA tide predictions and gauges**: covered in `../../../feeds/feeds.json`; the EA tide gauge API gives the live level.

## Checks made

- ArcGIS Online search `q="Port of London Authority"` found the PLA organisation; `https://www.arcgis.com/sharing/rest/portals/QgdzYlEcjteGD0VH?f=json` returns name "Port Of London Authority". 49 services; 40 queried for counts in the box.
- ADMIRALTY data hub: `https://datahub.admiralty.co.uk/server/rest/services/Hosted?f=json` (28 services) and the open folder listing `https://datahub.admiralty.co.uk/Bathy_Data/Prodbathy/bathymetry/` (23,308 lines, 3,926 surveys); every survey whose name has "Thames" or "London" was listed, and only the three in this table touch the box.
- EMODnet: `https://ows.emodnet-bathymetry.eu/wcs` GetCoverage `emodnet__mean`, values sampled at six river points.
- EA: `https://environment.data.gov.uk/spatialdata/survey-index-files/wfs`, layer `Bathymetry_multibeam_index_catalogue`, all 4,188 index tiles read.

## Published subset

Only the UKHO files (`ukho_*.geojson`, Open Government Licence; not for navigation) are published. The PLA layers carry no licence statement, so they are not committed until the PLA confirms terms. The Canal & River Trust layers are under a licence that forbids commercial use, so they are held for the repository owner's decision. Both stay in this folder locally, with `fetch_wet.py` to fetch them again.
