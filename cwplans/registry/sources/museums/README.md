# Museum and archaeological records with coordinates in the Docklands box

Area: WGS84 −0.0950, 51.4740 to 0.0150, 51.5220. Collected 2026-10-03.

Rebuild (from the repository root; raw responses go to `cwplans/data/raw/registry/museums/`, not committed):

    python3 cwplans/registry/sources/museums/fetch_records.py

## Files

- `records.json`: 7,552 records, one per line, from six sources. Every record has `source`, `id`, `title`, `date` (with `date_meaning` where it is not a production date), `object_type`, `collection`, `place`, `relation` (how the coordinate relates to the object), `lon`, `lat`, `precision`, `url`, `licence`. Some records also have `sensitive` (see Ethics).
- `apa_greater_london.geojson`: 51 Greater London Archaeological Priority Areas that touch the box, clipped (Historic England, OGL v3.0; built from the Greater London Historic Environment Record). Fields: `designatio` (tier), `descriptio` (HTML summary), `primary_re`.
- `fetch_records.py`: the script.

| `source` in records.json | records | coordinates are | licence |
|---|---|---|---|
| `wikidata` | 5,965 | the coordinate of a Wikidata place item (5,897 museum or building where the object is kept; 62 places of creation; 1 place of discovery) or the object's own coordinate (5) | CC0 1.0 |
| `historic-england-nhle-scheduled-monuments` | 61 | the list NGR point of each scheduled monument (BNG converted by Helmert, about 2 m) | OGL v3.0 |
| `historic-england-scheduled-wrecks` | 1 | list point (Roman riverboat, 136 m west of Greenwood Theatre) | OGL v3.0 |
| `historic-england-research-reports` | 138 | the site point that Historic England gives for each research report | OGL v3.0 |
| `historic-england-heritage-harbours-inventory` | 75 | point per dock, lock, quay or other harbour asset | not stated on the item |
| `ads-ariadne` | 1,312 (sample) | a point from the record (1,114), or the centroid of a 1 km place box for Portable Antiquities Scheme finds (198) | per record: CC-BY (PAS), OGL v3.0, or ADS Terms of Use and Access |

**What `precision` means.** Read it before you place a record in the model.
- "coordinate of the holding building or site": the object is kept there. It says nothing about where the object was found or made. Most of these are paintings at the National Maritime Museum (3,939) and the Guildhall Art Gallery (1,345).
- "coordinate of the place item (district, yard or building), not of a findspot": for example ships built at Cubitt Town, Deptford, Rotherhithe, Limehouse or Blackwall, and bells cast at the Whitechapel Bell Foundry. The point is the centre of the district or the site.
- "centroid of a 1.0 x 1.0 km place box": PAS findspot, public precision (1 km square). Never closer.
- "point as given by the record": as precise as the source; for excavations this is usually the site, not the find.

## Each source: open or not, coordinates or names

| source | coordinates or names? | in the box | status |
|---|---|---|---|
| **Wikidata via QLever** (https://qlever.dev/api/wikidata) | coordinates of place items; few objects have their own | P276 + P195: 5,897 object–place pairs; P625 + P195: 5; P189 or P1071 to a place in the box: 63 (only 1 has P189: the Cheapside Hoard; none of the 63 has a P195 collection) | open, CC0; used |
| **Portable Antiquities Scheme** (finds.org.uk) | 1 km grid square (public) and parish | 6,961 finds in the ADS/ARIADNE catalogue (published there as "British Museum", owner PAS); 198 taken as a sample | finds.org.uk returns a Cloudflare challenge (HTTP 403) to scripted clients; the same records are open in ADS under CC-BY. No finder or landowner names are in the ADS records or in this file |
| **Archaeology Data Service catalogue** (ADS / ARIADNE, https://archaeologydataservice.ac.uk/data-catalogue-api/api/search) | points; some place boxes | 15,598 records in the box (5,776 artefacts, 3,868 fieldwork, 2,972 sites and monuments, 1,308 fieldwork reports, 1,233 coins, 543 maritime) | open API; robots.txt has no rule for it. Sample taken: PAS 198 of 6,961; Museum of London Archaeology 200 of 953; fieldwork reports 198 of 1,308; maritime 516 of 543 (mostly CITiZAN foreshore features recorded by MOLA, for example causeways, moorings, jetty timbers at Greenwich); Historic England as contributor 200 of 5,409 (excavation summaries from OASIS). Historic England as publisher: 283 records, none with a point in the box |
| **MOLA reports** | through ADS | 953 records with contributor "Museum of London Archaeology", 363 "MOLA (Museum of London Archaeology)", 302 "MOLA" | sampled through ADS |
| **Thames Discovery Programme** (now https://www.mola.org.uk/tdp) | web pages only | — | no data download or API found. CITiZAN foreshore records (MOLA) are in ADS: the `maritime` sample |
| **Historic England open data hub** (ArcGIS org `ZOdPfBS3aqqDYPUQ`, "Historic England") | points and polygons | scheduled monuments 61, scheduled wrecks 1, research reports 138, heritage harbours inventory 75, APAs 51, listed buildings 1,898 (not taken; see `../../../feeds/`), Heritage at Risk 2024: 43 (not taken) | open, OGL v3.0 (inventory: no licence stated); used |
| **Greater London HER (GLAAS)** | — | — | no open bulk data or API found. Its public front end (Heritage Gateway) now redirects to historicengland.org.uk, which returns a Cloudflare challenge. The APAs are the open derivative |
| **Historic England Archive** | — | — | historicengland.org.uk: Cloudflare challenge (HTTP 403). Not bypassed |
| **British Museum collection** (britishmuseum.org) | findspot and production place, as names | — | Cloudflare challenge (HTTP 403). BM-published PAS records come through ADS (above) |
| **London Museum** (formerly Museum of London) collections online | place names only ("Related places"); no coordinates on the object page checked (object-513130, "Foreshore find & tin") | — | robots.txt disallows `/collections/search/` and `/api/`, with crawl-delay 20, so there is no permitted way to list records by place. One search page was fetched before robots.txt was read; no records were taken. collections.londonmuseum.org.uk returned HTTP 525 |
| **Science Museum Group** (collection.sciencemuseumgroup.org.uk) | — | — | search returns a CloudFront 403 to this client, and robots.txt disallows `/api/` and every URL with a query string. Not used |
| **Royal Museums Greenwich** (rmg.co.uk/collections) | object pages give ID, creator, credit and measurements; no place field on the page checked (PAJ4096) | — | the server-side search page ignores the query (the same four objects for "Deptford Dockyard", "West India Docks", "Blackwall Yard", "Millwall", "Limehouse"); `?_format=json` gives HTTP 406. RMG objects reach this file through Wikidata (3,939 kept at the National Maritime Museum) |
| **Europeana API** (api.europeana.eu) | — | — | needs an API key (HTTP 401 without `wskey`). Not tested with a key; no key is stored |
| **Art UK** (artuk.org) | — | — | HTTP 403 to this client. Not used |

## QLever geo test (Wikidata)

Endpoint: `https://qlever.dev/api/wikidata` (the old `https://qlever.cs.uni-freiburg.de/api/wikidata` redirects there with HTTP 308). POST with `query=`, `Accept: application/sparql-results+json`.

What works (2026-10-03):
- `geof:distance(?coord, "POINT(-0.0195 51.5049)"^^geo:wktLiteral)` with `geo: <http://www.opengis.net/ont/geosparql#>` and `geof: <http://www.opengis.net/def/function/geosparql/>`: returns **kilometres**. 20 items within 0.3 km of One Canada Square in 0.75 s.
- A box with `FILTER(geof:longitude(?c) >= -0.095 && geof:longitude(?c) <= 0.015 && geof:latitude(?c) >= 51.474 && geof:latitude(?c) <= 51.522)`: 4,174 items with P625 in the box (COUNT, 1.8 s). The record queries use this form.
- The spatial-search service:

      PREFIX spatialSearch: <https://qlever.cs.uni-freiburg.de/spatialSearch/>
      SERVICE spatialSearch: {
        _:config spatialSearch:algorithm spatialSearch:s2 ;
                 spatialSearch:left ?ga ; spatialSearch:right ?gb ;
                 spatialSearch:maxDistance 300 ;          # metres
                 spatialSearch:payload ?b ; spatialSearch:bindDistance ?dist .
        { ?b wdt:P625 ?gb }
      }

  The 10 nearest items to the National Maritime Museum (Q1199924) within 300 m, 0.9 s.

What fails:
- Two queries about 1 s apart: HTTP 429 from nginx. Wait 8–10 s between queries.
- A slow query: HTTP 429 with JSON `"exception": "Operation timed out"`. A variable predicate (`VALUES ?prop { wdt:P189 wdt:P1071 wdt:P276 } ?o ?prop ?place`) with GROUP BY and labels timed out; use one triple pattern per property, joined by UNION.
- `BIND(?b AS ?place)` inside a UNION branch, with `VALUES ?b` outside, gave a cross product (49,212 rows with places such as Italy). Put the VALUES inside the branch.

## Ethics

- No names of finders, landowners, private donors or report authors are kept. Historic England report authors and ADS `creator`/`contributor` people are dropped; only organisations are kept in `collection`.
- Records of human remains are left out (one Wikidata item: a Roman-period burial found at Great Dover Street). Abstract "coin type" items (832 Roman coin types of the London mint) are left out because they are not objects.
- 44 records whose title, type or place mentions a burial, cemetery, grave, tomb, memorial, churchyard, crypt or skeleton carry `"sensitive": "burial or memorial context: leave out of game or story content"`. The word match is crude (it also flags portraits of people named Graves); check by hand before use.
- The PAS public precision is 1 km. Do not try to make PAS findspots more precise.

## How the model can use this

- Pins for "what was found or made here": the `ads-ariadne` maritime (CITiZAN) and fieldwork points, the scheduled monuments and the Roman riverboat, with the ships built at the Cubitt Town, Deptford, Rotherhithe and Blackwall yards at district level.
- Museum buildings as "collections" markers: the 5,897 held-at records cluster on 37 places (museums, galleries, halls, colleges); show a count per building, not one pin per object.
- APAs as a translucent ground layer; the PLA foreshore permit zones (`../pla/`) as the foreshore layer beside them.
- Links: `url` goes to the record page at the source. historicengland.org.uk and finds.org.uk pages are the official ones but show a Cloudflare challenge to scripts; they open in a browser.

## Published subset

Only `records-open.json` is published (6,629 records). It keeps the records under CC0 (Wikidata), OGL (Historic England, OGL-licensed ADS records) or CC-BY (Portable Antiquities Scheme), and leaves out the 44 records flagged `sensitive` (burials, memorials). Records under the ADS terms of use, and the Historic England heritage harbours inventory, which has no licence statement, stay in the local `records.json` and are not committed. `apa_greater_london.geojson` (OGL) is published.
