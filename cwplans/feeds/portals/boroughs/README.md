# The zone borough portals

Tool: `tools/walk-portals.mjs boroughs walk | catalogue | triage | harvest` (adapter `tools/portals/boroughs.mjs`).
Walked 2026-10-04 (662 requests). What each borough publishes, and what was found:

| borough | portal | what it is | final states |
|---|---|---|---|
| City of London | INSPIRE map service, https://www.mapping.cityoflondon.gov.uk/arcgis/rest/services/INSPIRE/MapServer (176 feature layers) | the City's GIS layers; each layer's licence is on its INSPIRE record on data.gov.uk (matched by title): OGL for 35, the OS public-sector INSPIRE end-user licence for about 34 (restricted), none for 94 | harvested 27, held 3, deferred 13 (layers about people or their sites: toilets, polling places, clinics, contributor businesses, residential units 4,331), not-open 130, not-relevant 3 |
| Tower Hamlets | ArcGIS Hub "Planning Datasets", https://planning-datasets-towerhamlets.hub.arcgis.com/ (DCAT feed) | listed buildings, conservation areas, TPOs, Article 4 directions | held 6 (the same layers taken under OGL from planning.data.gov.uk: `../pdg/`), not-open 2. The hub names no licence: "No special restrictions or limitations ... except that data scraping tools should not be used" |
| Southwark | "Southwark Data", https://data.southwark.gov.uk/ (Esri UK InstantAtlas) | 16,897 indicators from the master table `Southwark_MasterTable` on Esri UK's ArcGIS organisation, with the InstantAtlas metadata service (Publisher, Rights) | walked-elsewhere 14,901 (re-served statistics of ONS, Nomis, OHID, DfE, DESNZ, MHCLG, NHS, DWP, GLA...: take them at source), not-open 1,981 (no rights statement), deferred 15 (Social Mobility Commission index, local authority level) |
| Greenwich | "Royal Greenwich Data Observatory", https://dataobservatory.royalgreenwich.gov.uk/ (the same platform) | 16,898 indicators (`Greenwich_MasterTable`): the same Esri UK indicator library as Southwark | walked-elsewhere 14,896, not-open 1,987, deferred 15 |
| Lewisham | "Open Data Lewisham" (JKAN), https://lb-lewisham.github.io/open-data-lewisham/ | 11 datasets with OGL in their source files | harvested 1 (EV charge points), listed 1 (air sensor history API), held 2, walked-elsewhere 3, deferred 3 (FixMyStreet and Commonplace records written by residents: ask the owner first; an interactive map), not-relevant 1 |
| Newham | none of its own | Newham Info is a London Datastore dataset (2k8jr, local authority level) | walked-elsewhere 1 |

The two observatories are not council data: they are one shared Esri UK library of national indicators, shown per
borough. No council-own open indicator was found in them.

## Harvested (zone only, 1.0 MB)

City of London (OGL by the layer's INSPIRE record): St Paul's Heights grid 538, points 635, setback 6 and policy area,
Historic Land Use 340, cultural spaces 237 (the service withholds geometry for this layer: names, addresses and types
only, `meta.geometry_withheld`), cycleways 23, grit bins 21, LVMF protected vistas 18, places of interest 17,
underground stations 15, Thames Tideway Tunnel safeguarding area 13, smoke control orders 8, rail stations 7, Thames
policy area 6, Monument views 6, highway-authority and permissive subways 9, principal shopping centres 4, special
Act land 5, riverside walk, protected squares, Tower of London WHS local setting area, airport and Crossrail
safeguarding areas, the City flood risk area, a coal tax post. Lewisham: 17 EV charge points (March 2022).
