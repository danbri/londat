# ONS Open Geography Portal, walked for the zone

Portal: https://geoportal.statistics.gov.uk/ (ArcGIS Online organisation `ESMARspQHYMw9BZ9`). Catalogue through the
ArcGIS sharing search API (`orgid:ESMARspQHYMw9BZ9`, feature services, CSV, file geodatabases, shapefiles,
GeoPackages, spreadsheets, GeoJSON). Licence: the ONS geography licences page (OGL v3.0; boundaries contain OS data).
Tool: `tools/walk-portals.mjs onsgeo walk | triage | harvest` (adapter `tools/portals/onsgeo.mjs`). Walked 2026-10-04.

- `catalogue.json`: 2,630 items (id, title, type, service URL, modified, licence text).
- `triage.json`: not-relevant 2,023 (coarser than the zone 1,776: local authorities, regions, health, police,
  constituencies, parishes...; Scotland, Wales or Northern Ireland only 134; vintages before 2011 113),
  listed-for-harvest 426 (small-area products: OA, LSOA, MSOA, workplace zones, wards, postcodes, built-up areas,
  grids; many are older versions of the same product), deferred 116 (family not recognised by title), not-open 56
  (items with no licence statement, mostly hosted maps and dashboards), harvested 6, held 3 (ONSPD August 2026; LSOA
  and MSOA 2021 polygons from the London Datastore).

## Harvested (zone only, 1.9 MB)

| key | item | items | size |
|---|---|---|---|
| `oa21-boundaries` | Output Areas (December 2021) Boundaries EW BGC (V2) and Rural Urban Classification | 1,538 polygons | 998 kB |
| `oa21-centroids` | Output Areas (December 2021) EW Population Weighted Centroids (V4) | 1,437 points | 298 kB |
| `oa21-lookup` | Output Area (2021) to LSOA to MSOA to LAD (December 2021) Exact Fit Lookup (V3) | 1,509 rows | 176 kB |
| `lsoa21-centroids` | LSOA (December 2021) EW Population Weighted Centroids | 259 points | 55 kB |
| `workplace-zones-2011` | Workplace Zones (December 2011) Boundaries EW BGC | 705 polygons | 352 kB |
| `wards-latest` | Wards (May 2026) Boundaries UK BGC | 69 polygons | 61 kB |

Polygons that meet the box are kept whole (the box test is the ArcGIS envelope query, then the same `meets` test as
every harvest). The lookup is read by the zone OA codes, in batches of 60 (a GET with 150 codes answered 404: the URL
was too long).
