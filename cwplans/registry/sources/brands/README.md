# Brands: chain branches at Canary Wharf

One registry source: the branches of UK branded chains (shops, restaurants, cafés, banks, gyms,
pharmacies, supermarkets, hotels, offices) inside the Canary Wharf box
WGS84 [-0.0300, 51.4980, -0.0050, 51.5100]. Built 2026-10-03. Businesses only: no staff,
reviewers or other people are recorded.

| file | what it holds |
|---|---|
| `branches.json` | **271 branches of 211 brands**, one entry per branch, merged from OSM, FSA, the Canary Wharf Group directory, Wikidata and the brands' own store pages. Also `cwg_not_matched`: the CWG directory entries that are not a known brand. |
| `brands-uk.json` | the brand list used: 2,745 NSI brand items valid at One Canada Square |
| `wikidata-brands.json` | for the 2,267 brand QIDs: label, official website (P856), parent organisation (P749), number of Wikidata items anywhere that have `brand` (P1716) = the QID and a coordinate |
| `wikidata-near.json` | every Wikidata item within 1 km of One Canada Square (266), and the 6 that link to an NSI brand |
| `cwg-directory.json` | the Canary Wharf Group directory: 374 entries (174 shops, 168 eat & drink, 4 stay, 28 see & do), with title, CWG category, address lines, mall, level, postcode and website |
| `storelocator.json` | the store-page check for the 30 largest brands present |
| `tools/` | the scripts (below) and the two hand-decision files `fsa-decisions.json`, `cwg-decisions.json`, plus `storelocator-manual.json` |

Raw downloads (not committed) are in `magpie/cwplans/data/raw/registry/`: the NSI npm package, the OSM box
scan, FSA premises details, QLever responses, the CWG pages from the Internet Archive, the store-page cache.

## Method

Run from the repository root, in this order. Node's `fetch` does not use the proxy unless it is told to,
so the network steps need `NODE_USE_ENV_PROXY=1`.

```sh
(cd magpie/cwplans/data/raw/registry/nsi && npm install name-suggestion-index@8.0.20260918 @rapideditor/location-conflation @rapideditor/country-coder)
T=magpie/cwplans/registry/sources/brands/tools
node $T/build-uk-brands.mjs                              # 1. brands-uk.json
NODE_USE_ENV_PROXY=1 node $T/wikidata-brands.mjs         # 2. wikidata-brands.json, wikidata-near.json
node $T/osm-scan.mjs && node $T/match-osm.mjs            # 3a. OSM (local PBF)
NODE_USE_ENV_PROXY=1 node $T/match-fsa.mjs --fetch       # 3b. FSA
NODE_USE_ENV_PROXY=1 node $T/fetch-cwg.mjs               # 3d. CWG directory (about 30 min, archive.org)
node $T/build-branches.mjs                               # 4. first merge
node $T/london-brand-counts.mjs                          # brand size measure for 3c
NODE_USE_ENV_PROXY=1 node $T/storelocator.mjs            # 3c. store pages
node $T/build-branches.mjs                               # 4. final merge (attaches the store pages)
node $T/readme-tables.mjs                                # the table at the end of this file
```

### 1. The UK brand list (name-suggestion-index)

Source: NSI 8.0.20260918 (npm `name-suggestion-index`, BSD-3-Clause), `dist/json/nsi.json` and
`featureCollection.json`. Only the `brands/` tree is used (not `operators/`, `transit/`, `flags/`).

Rule: a brand item is kept when its `locationSet`, resolved by `@rapideditor/location-conflation`,
contains One Canada Square [-0.0195, 51.5049]. This takes in brands listed for `gb`, `gb-eng`,
`gb-lon.geojson` and the like, and also the brands valid here only through a world or continent code
(`001`, `150`) unless they exclude GB.

| count | |
|---|---|
| NSI brand items (all countries) | 19,119 |
| kept: valid at Canary Wharf | **2,745** |
| of these, scope `uk` (include list names GB, a GB subdivision or a London/England `.geojson`) | 1,328 |
| of these, scope `wider` (valid only through `001`, `150` ...; e.g. Starbucks, Tesco Express, McDonald's) | 1,417 |
| distinct `brand:wikidata` QIDs | 2,267 |
| OSM key=value categories | 201 |

Each row of `brands-uk.json` keeps the NSI id, display name, `kv` (category), `brand:wikidata`, `brand`,
`matchNames`, a few category tags, the locationSet, and the scope.

### 2. Wikidata through QLever

Endpoint: `https://qlever.dev/api/wikidata` (the old `https://qlever.cs.uni-freiburg.de/api/wikidata`
now answers 308 to it). POST, `Accept: application/sparql-results+json`.

* For the 2,267 QIDs, in batches of 400 with `VALUES`: English label, P856, P749 and its label.
  2,219 have an official website, 664 a parent organisation.
* Store locations in Wikidata: 132 of the 2,267 brands have at least one item anywhere with
  P1716 (brand) = the brand and a P625 coordinate. **Inside the box, no item has P1716 = an NSI brand.**
  Within 1 km of One Canada Square, 6 items link to an NSI brand through P127 (owned by), P749 or P137
  (operator): KPMG (United Kingdom) (P749 KPMG), London Marriott Hotel Canary Wharf (P137 Marriott),
  One Churchill Place (P127 Barclays), The Ledger Building pub (P127 Wetherspoon), Canary Riverside Plaza
  Hotel (P137 Four Seasons, probably historic) and DoubleTree Docklands Riverside (P137 Hilton; outside the box).
  Wikidata is therefore evidence for a few hotels and head offices, not a branch list.

**QLever geo test** (items with P625 within 1 km of One Canada Square, POINT(-0.0195 51.5049)):

| form | result |
|---|---|
| `FILTER(geof:distance(?c, "POINT(-0.0195 51.5049)"^^geo:wktLiteral) <= 1)` | works; the default unit is **km**; 268 rows, 2.7 s |
| `geof:distance(?c, ?p, uom:metre)` (OGC `http://www.opengis.net/def/uom/OGC/1.0/metre`) | **error**: "Unsupported unit of measurement for distance" |
| `geof:distance(?c, ?p, <http://qudt.org/vocab/unit/M>)` ... `<= 1000` | works, 268 rows, 0.6 s |
| `geof:metricDistance(?c, ?p) <= 1000` | works, 268 rows, 0.5 s |
| bounding box with `geof:latitude` / `geof:longitude` on the study box | works, 207 items, 1.9 s |
| `SERVICE spatialSearch: { ... spatialSearch:algorithm spatialSearch:s2 ; spatialSearch:maxDistance 1000 ; spatialSearch:bindDistance ?d ... }` | works, 268 rows (266 items), about 1 s. `maxDistance` is in metres but `bindDistance` comes back in **km**. The inner pattern's other variables (`?i`) are only bound with `spatialSearch:payload <all>`. |
| the spatial service plus OPTIONAL labels/P31/links in one query | **times out** (HTTP 429 "Operation timed out ... Sort on ?i"); run the spatial query alone, then a second query with `VALUES` |

### 3a. OSM

`osm-scan.mjs` streams the Greater London extract (`data/raw/docklands/greater_london-latest.osm.pbf`,
download.openstreetmap.fr extract, OSM data as of 2026-10-01T01:43:50Z, fetched 2026-10-02, ODbL) with `osm-pbf-parser` and keeps every node, way and relation in the box
that has shop, amenity, office, tourism, leisure, craft, healthcare, brand, brand:wikidata or name, with
all its tags (3,430 features; ways and relations at the mean of their nodes).

`match-osm.mjs`: a business feature is a branch when
1. its `brand:wikidata` is an NSI brand QID (200 branches), or
2. the NSI `Matcher` (from the npm package, location-aware at the feature's own position) matches its
   `name`, `brand`, `name:en` or `official_name` under its own key=value (9), or
3. it has `brand=*` or `brand:wikidata=*` that NSI does not list for here (5; kept with `nsi_id` null:
   Benefit, Crabtree & Evelyn, The Hagen Project, Trailfinders, Watches of Switzerland).

Street furniture is set aside, not counted (56 features): Royal Mail post boxes 18, Santander Cycles
docks 12, bank ATMs 11, parcel lockers 5, photo booths 3, EV chargers 2, a car-club bay, a vending
machine and an Oyster machine, Legible London signs.

Kept fields: osm id, name, brand, brand:wikidata, key=value, `addr:*` (unit, housename, housenumber,
street, place, postcode), `level`, `level:ref`, `website`, `fhrs:id`, position. **214 OSM branches.**

### 3b. FSA food premises

Input: `postcodes/queries.json`, `results[pc].fsa.items`, for the 658 postcodes in tiers `cw-core`,
`cw-ward`, `cw-box-other-ward`: **526 premises**.

Match rule (`match-fsa.mjs`): the NSI Matcher is run on the premises name against every brand
key=value valid here, for these name forms in order, first hit wins:
`full` (the whole name) → `cut` (text before ` - `, `(`, `,`, ` at `, ` @ `) → `strip` (a trailing
place or legal word removed: Canary Wharf, Cabot Place, ..., Ltd, PLC, UK) → `prefix` (leading words only).
The Matcher itself normalises case, punctuation and accents and refuses NSI's generic words
("Cafe", "Restaurant") and common names. Case and punctuation are therefore handled; "Caffe Nero" =
"Caffè Nero", "Laderach" = "Läderach".

False-positive checks: a hit needs a person's decision (`tools/fsa-decisions.json`, one line of reason
each) when it came from a `prefix` form, from an NSI *alternate* name, or when the FSA business type does
not fit the brand's category (e.g. a "Pub/bar" matched to a clothes brand). 54 decisions: 50 kept,
**4 rejected**: "Coco" (generic word, not shown to be the CoCo tea chain), "Chevron Staff Restaurant"
(NSI's Chevron here is a car wash), "Oasis Bar and Terrace" (NSI's Oasis is a clothes shop),
"C & A Seafoods (Billingsgate) Ltd" (not C&A). Staff restaurants of KPMG and Morgan Stanley, the WeWork
and Spaces coffee counters, a Wahaca van and a Shah's Halal Food cart are kept with notes.

**125 FSA premises matched**; each one's address and geocode were then read from
`https://api.ratings.food.gov.uk/Establishments/{fhrs_id}` (112 have a geocode).

### 3c. Brand store pages

The 30 brand families present with the most branches, measured by OSM branches across Greater London
(`london-brand-counts.mjs`; the GB extract is 1.9 GB, so London is the proxy for "UK branches"):
Post Office, Tesco, Costa, Pret, Starbucks, Boots, Co-op Food, Subway, Greggs, McDonald's, M&S, Caffè
Nero, NatWest, Fuller's, Coral, Paddy Power, Barclays, Nando's, Holland & Barrett, Premier Inn, Waitrose,
Lloyds Bank, Wetherspoon, GAIL's, Santander, HSBC UK, Halifax, PureGym, Snappy Snaps, itsu.

For their 64 branches in the box, the candidate page is the OSM `website=*` when it is a page below the
brand's own domain, else a page found by hand on the brand's locator (`storelocator-manual.json`).
Each was fetched once (GET, User-Agent `glitchcan-cwplans/0.1 (https://github.com/danbri/glitchcan-minigam)`,
redirects followed, at most 1 request/s per host). **verified** = 2xx, no bot-challenge page, and the page
text or the URL path names Canary Wharf, the postcode, the mall or the street.

| result | branches |
|---|---|
| verified | 28 |
| blocked (403 or a bot challenge): Tesco ×5, Boots ×2, Co-op ×2 | 9 |
| no answer (connection dropped): Premier Inn, Waitrose | 2 |
| broken (404): Halifax Cabot Place, HSBC "relationship management centre" | 2 |
| resolves, but the page does not name the place: Greggs `shop-code=5712` | 1 |
| no store page found | 22 |

Findings: Halifax's OSM URL is dead and `branches.halifax.co.uk/london` lists no Halifax at Canary Wharf
(2026-10-03), so the OSM Halifax may have closed. HSBC's old Canada Place URL is dead; HSBC now lists
Canada Place as self-service only. Pages not found: the locators of Costa, Caffè Nero, Barclays, NatWest,
Greggs and Pret build their lists with scripts (Pret's sitemap has no shop pages); McDonald's and Paddy
Power answer 403; `retail.coral.co.uk` and `branches.santander.co.uk` were refused at the proxy
(CONNECT 502). No login pages were touched.

### 3d. Canary Wharf Group directory

`canarywharf.com` answers every scripted request with an Imperva/Incapsula bot challenge (checked
2026-10-03, also for `robots.txt` and the sitemaps). The challenge was not worked around. Instead the
directory comes from the **Internet Archive**: CWG's own Yoast sitemaps as archived on 2026-03-04
(`shop-sitemap.xml`, `restaurant-sitemap.xml`, `stay-sitemap.xml`, `seedo-sitemap.xml`) give the list of
entries, and each entry's archived page (mostly November 2025; else its 2025 address under
`/eating-drinking/directory/` or `/shops-services/directory/`; captures of the challenge page skipped)
gives its title, CWG category, address lines (mall, level, postcode) and website. 369 of 374 entries
have a usable page. `cwg_url` is CWG's current address for the entry; `cwg_archived` is the copy read.

CWG titles are matched with the same NSI rule as FSA (decisions in `tools/cwg-decisions.json`, 38, of
which 9 rejected: Blink Brow Bar, Pure Sports Medicine, Browns Tanning, Mulberry Wood Wharf Primary,
Oasis Bar & Terrace, two photo booths, the Amazon Hub and InPost lockers). A title that is not an NSI
name joins a branch already found when it contains that branch's brand or name as whole words (≥ 5
letters): Rockar Land Rover, The Henry Addington (Nicholson's), Trailfinders, Watches of Switzerland.
**164 of 374 CWG entries are branches of a known brand**; the other 210 are listed in
`branches.json` → `cwg_not_matched`.

### 4. Merge

Records join only when they are the **same brand** (same QID, or a brand and its Wikidata parent:
FSA "Tesco" joins OSM "Tesco Express") **and the same place**:
1. an OSM feature whose `fhrs:id` tag is the FSA premises (102 OSM branches carry one), else
2. both name a mall and it is the same mall (Canada Place and the One Canada Square mall count as one), else
3. within 120 m (160 m when one position is only a postcode centroid or a mall centre), or the same postcode,
4. a CWG entry whose slug words appear in the branch's own website (`third-space-wood-wharf`), or a CWG
   entry for a brand with exactly one branch in the box.

Malls come from the CWG title ("Pret a Manger – Cabot Place"), else address text, else a postcode → mall
table learnt from CWG's own addresses (≥ 4 entries, ≥ 85 % agreeing: E14 5NY Jubilee Place, E14 4QT and
4QS Cabot Place, E14 5AH, 5EQ, 5HX Canada Place, E14 5AX One Canada Square, E14 5AR Crossrail Place,
E14 5RB, 5RE Churchill Place, E14 5FW The Park Pavilion). Positions: OSM feature, else FSA geocode,
else the mall centre (from the OSM mall features) or the ONSPD postcode centroid; `position` says which.

`confidence`: **high** = two or more independent sources (171); **medium** = one source
with an exact brand tag or name (94); **low** = one source and a weak match or a
note (staff catering, a van, a delivery kitchen, a historic Wikidata claim) (6).

Entry fields: `brand`, `nsi_id`, `brand_wikidata`, `name`, `category`, `kv`, `sources`
(osm, fsa, cwg, wikidata, storelocator), `osm_id`, `fhrs_id` (and `fhrs_ids` when several FSA records are
one branch, e.g. KPMG's kitchens), `cwg_url`, `store_url` (+ `store_url_status`), `address`,
`address_cwg`, `postcode`, `mall`, `mall_from`, `level` (OSM), `level_cwg` (CWG's words), `lat`, `lon`,
`position`, `confidence`, `notes`, and the source details (`fsa`, `website`, `cwg_website`, `wikidata_item`).

## Counts

**271 branches, 211 brands**; 266 entries carry an NSI id.

| category | branches | brands |
|---|---|---|
| shop | 65 | 62 |
| takeaway | 57 | 40 |
| cafe | 28 | 17 |
| restaurant | 23 | 22 |
| bank | 15 | 9 |
| office | 14 | 12 |
| supermarket | 13 | 7 |
| service | 11 | 7 |
| hotel | 10 | 9 |
| bar | 8 | 8 |
| gym | 7 | 6 |
| health | 5 | 3 |
| childcare | 5 | 1 |
| motoring | 5 | 5 |
| pharmacy | 2 | 1 |
| leisure | 2 | 2 |
| other | 1 | 1 |

| sources | branches |
|---|---|
| osm | 60 |
| cwg+osm | 51 |
| cwg+fsa+osm | 51 |
| cwg | 25 |
| fsa+osm | 23 |
| cwg+fsa | 15 |
| fsa | 14 |
| cwg+fsa+osm+storelocator | 12 |
| cwg+osm+storelocator | 9 |
| fsa+osm+storelocator | 3 |
| osm+storelocator | 2 |
| cwg+osm+wikidata | 1 |
| wikidata | 1 |
| fsa+osm+wikidata | 1 |
| cwg+wikidata | 1 |
| fsa+storelocator | 1 |
| osm+storelocator+wikidata | 1 |

Largest brands in the box: Pret A Manger 9, Bright Horizons 5, Tesco Express 5, Barclays 3, Bupa Dental Care 3, Coral 3, HSBC UK 3, Joe & The Juice 3, KPMG 3, Notes 3, Post Office (UK) 3, Starbucks 3, Subway 3, Bitesize Greggs 2, Black Sheep Coffee 2, Blank Street Coffee 2, Boots 2, Buns From Home 2, Caffè Nero 2, Co-op Food 2.

By mall: Cabot Place 42, Canada Place 36, Jubilee Place 36, Crossrail Place 17, One Canada Square 10,
Churchill Place 8, Wood Wharf 8, The Park Pavilion 4; the rest are on the streets of the box (South Quay,
Marsh Wall, Westferry Circus, West India Quay, Manchester Road, Poplar).

## Gaps and limits

* **Chains present but not in NSI.** CWG lists brands that NSI has no entry for here, so they are not in
  `branches.json` (they are in `cwg_not_matched`). By inspection, chains among them: Crockett & Jones,
  The White Company, Russell & Bromley, L.K.Bennett, Fortnum & Mason, Monica Vinader, Castore,
  Hawes & Curtis, Moleskine, Penhaligon's, Charbonnel et Walker, Barker, Lakrids by Bülow, Therapie,
  David Clulow, Smilepod, Ultimate Performance, Electric Shuffle, Fairgame, Clays, K1 Speed, GoBoat,
  Roka, Royal China, Big Easy, Boisdale, Blacklock, Six by Nico, Kricket, Humble Grape, Birley,
  Badiani, Café Brera, Obicà, Gallio, Paris Baguette, Thunderbird, Rudie's, Mercato Metropolitano,
  Market Halls, Randox Health, HCA Healthcare UK, House of Gods. OSM has more named businesses of this
  kind without brand tags (Aquascutum, Aspinal of London, Jaeger, Nails Inc, MoreYoga, Pasta
  Evangelists, Crussh, Bagel Factory, DF Tacos, Le Bab, Inamo, Point A Hotel, Fraser Place ...). This
  list is a judgement, not a check against a source; NSI is the open definition used here.
* **Costa** is found only through FSA and CWG, **McDonald's** only through OSM; neither store page was found.
* **Dates differ by source.** OSM 2026-10-02; FSA as fetched 2026-10-03 (ratings dates vary); the CWG
  directory as archived November 2025 – March 2026. A shop that opened or closed since is wrong in one
  of them. Single-source entries (100) are the ones to check first.
* **Offices.** Head offices and staff restaurants (KPMG, Morgan Stanley, Barclays at One Churchill Place,
  HSBC at 8 Canada Square, EY, Deutsche Bank, Citi, Société Générale, CBRE, WeWork, Spaces) are kept
  as `category: office` when a source tags them with a brand; office occupiers in general are not this
  source's job.
* **Positions** for 25 CWG-only and some FSA-only entries are a mall centre or a postcode centroid, not
  the unit. One entry (Locke) has no position.
* The Barclays Wikidata item (One Churchill Place, the head office) joined the nearest Barclays branch
  record by distance; read the note.

## Licences

NSI: BSD-3-Clause. OSM: ODbL (© OpenStreetMap contributors). FSA Food Hygiene Rating data: Open
Government Licence. Wikidata: CC0. CWG directory facts (names, malls, levels) were read from the
Internet Archive's copies of canarywharf.com; brand store-page URLs are links, not copied content.

## Branches

| brand | category | name | where | sources | conf. | links |
|---|---|---|---|---|---|---|
| Abokado | takeaway | Abokado | E14 9GE | osm | medium | [osm](https://www.openstreetmap.org/node/7144851379) |
| Accessorize | shop | Accessorize | Canada Place, Mall Level -1 | cwg | medium | [cwg](https://canarywharf.com/shop/accessorize-canarywharf/) |
| Aesop | shop | Aesop | Cabot Place, 1, E14 4QT | osm+cwg | high | [osm](https://www.openstreetmap.org/node/11748160459) [cwg](https://canarywharf.com/shop/aesop/) |
| ASICS | shop | ASICS | Jubilee Place, E14 5NY | cwg | medium | [cwg](https://canarywharf.com/shop/asics/) |
| Attendant | cafe | Attendant | E14 9GE | osm | medium | [osm](https://www.openstreetmap.org/node/8363925669) |
| Barclays | bank | Barclays | -1 | osm | medium | [osm](https://www.openstreetmap.org/node/1936163405) |
| Barclays | bank | Barclays | E14 4BB | osm | medium | [osm](https://www.openstreetmap.org/way/199358668) |
| Barclays | bank | Barclays | Churchill Place, Mall Level -1, E14 5HP | osm+wikidata+cwg | high | [osm](https://www.openstreetmap.org/way/5986929) [cwg](https://canarywharf.com/shop/barclays-bank/) |
| Barry's | gym | Barry's | Crossrail Place, Lower Mall -2, E14 5AR | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/1670263) [cwg](https://canarywharf.com/see-do/barrys/) |
| Benefit | service | Benefit Brow Bar | 0 | osm | medium | [osm](https://www.openstreetmap.org/node/6553275285) |
| Bitesize Greggs | takeaway | Greggs | -2, E14 5HL | osm+fsa | high | [osm](https://www.openstreetmap.org/node/6300338078) [fsa](https://ratings.food.gov.uk/business/1619008) |
| Bitesize Greggs | takeaway | Greggs | Cabot Place, 0, E14 4QS | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/3835356850) [fsa](https://ratings.food.gov.uk/business/1427215) [cwg](https://canarywharf.com/restaurant/greggs/) [store](https://www.greggs.com/shop-finder?shop-code=5712) |
| Black Sheep Coffee | cafe | Black Sheep Coffee | 1, E14 4PZ | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/3835357212) [fsa](https://ratings.food.gov.uk/business/1193508) [cwg](https://canarywharf.com/restaurant/black-sheep-coffee-south-colonnade/) |
| Black Sheep Coffee | cafe | Black Sheep Coffee | Jubilee Place, -2, E14 5NY | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/7178540970) [fsa](https://ratings.food.gov.uk/business/999159) [cwg](https://canarywharf.com/restaurant/black-sheep-coffee-jubilee-place/) |
| Blank Street Coffee | cafe | Blank Street Coffee | Canada Place, Mall Level -1, E14 5AH | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/10092221330) [fsa](https://ratings.food.gov.uk/business/1765688) [cwg](https://canarywharf.com/restaurant/blank-street/) |
| Blank Street Coffee | cafe | Blank Street | One Canada Square, - 1 Level, E14 5AB | osm+cwg | high | [osm](https://www.openstreetmap.org/node/13720877601) [cwg](https://canarywharf.com/restaurant/blank-street-coffee/) |
| Bobbi Brown | shop | Bobbi Brown | 1 | osm | medium | [osm](https://www.openstreetmap.org/node/3835356835) |
| BOGGI Milano | shop | Boggi Milano | Canada Place, Mall Level -1, E14 5AH | cwg | medium | [cwg](https://canarywharf.com/shop/boggi-milano/) |
| Boots | pharmacy | Boots | Canada Place, 0, E14 5AH | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/2942586702) [fsa](https://ratings.food.gov.uk/business/362458) [cwg](https://canarywharf.com/shop/boots-the-chemist-canada-place/) [store](https://www.boots.com/stores/190-london-canary-whf-canada-e14-5ax) |
| Boots | pharmacy | Boots | Jubilee Place, -1, E14 5NY | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/4558839860) [fsa](https://ratings.food.gov.uk/business/362486) [cwg](https://canarywharf.com/shop/boots-the-chemist-jubilee-place/) [store](https://www.boots.com/stores/700-london-canary-whf-jubile-e14-5ny) |
| Boots Opticians | health | Boots Opticians | Jubilee Place, E14 5NY | osm | medium | [osm](https://www.openstreetmap.org/node/4681592703) |
| BrewDog | bar | BrewDog | Churchill Place, Street Level 0, E14 5RB | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/2018688106) [fsa](https://ratings.food.gov.uk/business/102063) [cwg](https://canarywharf.com/restaurant/brewdog-canary-wharf/) |
| Bright Horizons | childcare | Canada Square Day Nursery | -1, E14 5NN | osm+fsa | high | [osm](https://www.openstreetmap.org/node/3835357182) [fsa](https://ratings.food.gov.uk/business/90830) |
| Bright Horizons | childcare | Bank Street Day Nursery | Mall Level 0, E14 5NS | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/3835357183) [fsa](https://ratings.food.gov.uk/business/925308) [cwg](https://canarywharf.com/shop/bright-horizons-bank-street-day-nursery-preschool/) |
| Bright Horizons | childcare | Heron Quays Day Nursery | E14 9AB | osm+fsa | high | [osm](https://www.openstreetmap.org/node/7165099086) [fsa](https://ratings.food.gov.uk/business/689161) |
| Bright Horizons | childcare | Westferry Circus Day Nursery | Mall level -1, E14 4HD | osm+cwg | high | [osm](https://www.openstreetmap.org/node/7171355121) [cwg](https://canarywharf.com/shop/bright-horizons-canada-square-day-nursery-preschool/) |
| Bright Horizons | childcare | Columbus Courtyard Day Nursery | Columbus Courtyard, Mall Level 0, E14 4DA | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/3835357184) [fsa](https://ratings.food.gov.uk/business/49846) [cwg](https://canarywharf.com/shop/bright-horizons-columbus-courtyard-day-nursery-preschool/) |
| Bronson's Burgers | takeaway | Bronson's Burgers | E14 4AS | fsa | medium | [fsa](https://ratings.food.gov.uk/business/1488386) |
| Browns | restaurant | Browns | E14 4AY | osm+fsa | high | [osm](https://www.openstreetmap.org/way/140144130) [fsa](https://ratings.food.gov.uk/business/90185) |
| Buns From Home | takeaway | Buns From Home | Cabot Place, Mall Level -1, E14 4QT | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/1648075) [cwg](https://canarywharf.com/restaurant/buns-from-home/) |
| Buns From Home | takeaway | Buns From Home | Canada Place, E14 5AH | fsa | medium | [fsa](https://ratings.food.gov.uk/business/1648076) |
| Bupa Dental Care | health | Bupa Dental Care | Columbus Courtyard, Mall Level 0, E14 4DA | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835356839) [cwg](https://canarywharf.com/shop/bupa-dental-centre-columbus-courtyard/) |
| Bupa Dental Care | health | Bupa Health and Dental Centre | Crossrail Place, Street Level 0, E14 5AR | osm+cwg | high | [osm](https://www.openstreetmap.org/node/12786402092) [cwg](https://canarywharf.com/shop/bupa-health-and-dental-centre-crossrail-place/) |
| Bupa Dental Care | health | Bupa Dental Care | Crossrail Place | osm | medium | [osm](https://www.openstreetmap.org/node/12804103270) |
| Burger & Lobster | restaurant | Burger & Lobster | E14 4AY | osm+fsa | high | [osm](https://www.openstreetmap.org/way/140144154) [fsa](https://ratings.food.gov.uk/business/73136) |
| Burger King | takeaway | Burger King | Cabot Place, 2, E14 4QT | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/13766365501) [fsa](https://ratings.food.gov.uk/business/1718292) [cwg](https://canarywharf.com/restaurant/burger-king/) |
| Butchies | takeaway | Butchies Canary Wharf | E14 5HD | fsa | medium | [fsa](https://ratings.food.gov.uk/business/1602826) |
| BYD | motoring | BYD | Cabot Place, Street Level 0, E14 4QT | osm+cwg | high | [osm](https://www.openstreetmap.org/node/12758117863) [cwg](https://canarywharf.com/shop/byd/) |
| Caffè Nero | cafe | Nero Express | Crossrail Place, -3, E14 5AR | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/12861063687) [fsa](https://ratings.food.gov.uk/business/1570332) [cwg](https://canarywharf.com/restaurant/caffe-nero-crossrail-place/) |
| Caffè Nero | cafe | Caffè Nero | Jubilee Place, -1, E14 5NY | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/12258191965) [fsa](https://ratings.food.gov.uk/business/81192) [cwg](https://canarywharf.com/restaurant/caffe-nero-jubilee-place/) |
| Calvin Klein | shop | Calvin Klein |  | osm | medium | [osm](https://www.openstreetmap.org/node/6553266679) |
| Caravan | restaurant | Caravan | E14 5AJ | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/9592077269) [fsa](https://ratings.food.gov.uk/business/1495365) [cwg](https://canarywharf.com/restaurant/caravan-canary-wharf/) |
| Carphone Warehouse | shop | Carphone Warehouse | 0 | osm | medium | [osm](https://www.openstreetmap.org/node/3835356842) |
| CBRE | office | CBRE | E14 8LW | osm | medium | [osm](https://www.openstreetmap.org/node/2722355772) |
| Change Please | cafe | Change Please | Reuters Plaza, E14 5AJ | cwg | medium | [cwg](https://canarywharf.com/restaurant/change-please-reuters-plaza/) |
| Charles Tyrwhitt | shop | Charles Tyrwhitt | Canada Place, 0, E14 5AH | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835356845) [cwg](https://canarywharf.com/shop/charles-tyrwhitt/) |
| Chestertons | office | Chestertons | E14 9GE | osm | medium | [osm](https://www.openstreetmap.org/node/7144851380) |
| Chicken Shop | takeaway | Chicken Shop | Jubilee Place, Mall Level -1, E14 5NY | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/80821) [cwg](https://canarywharf.com/restaurant/chicken-shop/) |
| Chipotle | takeaway | Chipotle | Jubilee Place, -1, E14 5NY | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/10196714709) [fsa](https://ratings.food.gov.uk/business/1468495) [cwg](https://canarywharf.com/restaurant/chipotle/) |
| Chisholm Hunter | shop | Chisholm Hunter | Canada Place, E14 5AH | osm | medium | [osm](https://www.openstreetmap.org/node/14212192133) |
| Chopstix | takeaway | Chopstix | Jubilee Place, E14 5NY | fsa | medium | [fsa](https://ratings.food.gov.uk/business/1535476) |
| Cineworld | leisure | Cineworld | E14 4AL | osm+fsa | high | [osm](https://www.openstreetmap.org/node/1950561370) [fsa](https://ratings.food.gov.uk/business/558272) |
| Citibank | bank | Citi | E14 5LQ | osm | medium | [osm](https://www.openstreetmap.org/way/190714752) |
| Clintons | shop | Clintons | 0 | osm | medium | [osm](https://www.openstreetmap.org/node/3835356848) |
| Co-op Food | supermarket | Co-op Food | E14 9GE | osm | medium | [osm](https://www.openstreetmap.org/node/3595325918) [store](https://www.coop.co.uk/store-finder/E14-9GE/harbour-exchange-square) |
| Co-op Food | supermarket | Co-op Food | E14 9LQ | osm | medium | [osm](https://www.openstreetmap.org/way/269439725) [store](https://www.coop.co.uk/store-finder/E14-9LQ/cassilis-road) |
| Coach | shop | Coach | Cabot Place, 0, E14 4QS | osm+cwg | high | [osm](https://www.openstreetmap.org/node/6553266680) [cwg](https://canarywharf.com/shop/coach/) |
| Coco di Mama | takeaway | Coco di Mama | One Canada Square, Mall Level -1, E14 5AB | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/1634304) [cwg](https://canarywharf.com/restaurant/coco-di-mama/) |
| Coral | service | Coral | 0, E14 0BE | osm | medium | [osm](https://www.openstreetmap.org/node/6005094229) |
| Coral | service | Coral | E14 8HP | osm | medium | [osm](https://www.openstreetmap.org/way/351862777) |
| Coral | service | Coral | One Canada Square, 0, E14 5AX | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835356849) [cwg](https://canarywharf.com/shop/coral/) |
| COS | shop | COS | Jubilee Place, Lower Mall -2, E14 5NY | cwg | medium | [cwg](https://canarywharf.com/shop/cos/) |
| Costa | cafe | Costa Limited | Cabot Place, Mall Level -1, E14 4QT | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/1224829) [cwg](https://canarywharf.com/restaurant/costa-coffee-cabot-place/) |
| Crabtree & Evelyn | shop | Crabtree & Evelyn | Cabot Place, E14 4QT | osm | medium | [osm](https://www.openstreetmap.org/node/2928975301) |
| Crosstown | takeaway | Crosstown | Jubilee Place, -2, E14 5NY | osm | medium | [osm](https://www.openstreetmap.org/node/7178540969) |
| Currys | shop | Currys | Canada Place, 0, E14 5AH | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835356853) [cwg](https://canarywharf.com/shop/currys/) |
| Deutsche Bank | office | Deutsche Bank | E14 5GW | osm | medium | [osm](https://www.openstreetmap.org/node/4711576872) |
| Devialet | shop | Devialet | 0 | osm | medium | [osm](https://www.openstreetmap.org/node/6553275289) |
| Dexters | office | Dexters | E14 8JH | osm | medium | [osm](https://www.openstreetmap.org/node/3599602612) |
| Din Tai Fung | restaurant | Din Tai Fung | Crossrail Place, Mall Level - 1, E14 5AR | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/13777282502) [fsa](https://ratings.food.gov.uk/business/770188) [cwg](https://canarywharf.com/restaurant/din-tai-fung/) |
| Diptyque' | shop | Diptyque | Cabot Place, Mall Level -1, E14 4QS | cwg | medium | [cwg](https://canarywharf.com/shop/diptyque/) |
| Dishoom | restaurant | Dishoom | Wood Wharf, E14 5GX | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/10217228029) [fsa](https://ratings.food.gov.uk/business/1644475) [cwg](https://canarywharf.com/restaurant/dishoom-canary-wharf/) |
| Dune London | shop | Dune London | Cabot Place, 0, E14 4QT | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835356855) [cwg](https://canarywharf.com/shop/dune-london/) |
| EE | shop | EE | One Canada Square, 0, E14 5AX | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357157) [cwg](https://canarywharf.com/shop/ee/) |
| Eggslut | takeaway | Eggslut | E14 5HD | fsa | medium | [fsa](https://ratings.food.gov.uk/business/1771346) |
| Everyman | leisure | Everyman | Crossrail Place, -2, E14 5AR | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/7182075445) [fsa](https://ratings.food.gov.uk/business/842612) [cwg](https://canarywharf.com/see-do/everyman-cinema/) |
| EY | office | EY | Churchill Place, E14 5EY | osm+fsa | high | [osm](https://www.openstreetmap.org/node/7043260791) [fsa](https://ratings.food.gov.uk/business/761677) |
| Farmer J | restaurant | Farmer J | Canada Place, Mall Level -1, E14 5AH | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/7118074386) [fsa](https://ratings.food.gov.uk/business/1176549) [cwg](https://canarywharf.com/restaurant/farmer-j-canada-place/) |
| Farmer J | takeaway | Farmer J Jubilee Place | Jubilee Place, Mall Level -1, E14 5NY | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/1498177) [cwg](https://canarywharf.com/restaurant/farmer-j-jubilee-place/) |
| Felicity J Lord | office | Felicity J Lord | E14 9GE | osm | medium | [osm](https://www.openstreetmap.org/node/3055294042) |
| Five Guys | takeaway | Five Guys | Jubilee Place, -1, E14 5NY | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/7098936634) [fsa](https://ratings.food.gov.uk/business/87264) [cwg](https://canarywharf.com/restaurant/five-guys/) |
| Flip Out (UK) | gym | Flip Out Canary Wharf | Cabot Place, Mall Level -1, E14 4QT | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/1711686) [cwg](https://canarywharf.com/see-do/flip-out/) |
| Flying Tiger Copenhagen | shop | Flying Tiger Copenhagen | Crossrail Place, Mall Level -1, E14 5AR | osm+cwg | high | [osm](https://www.openstreetmap.org/node/8812217588) [cwg](https://canarywharf.com/shop/flying-tiger-copenhagen/) |
| Four Seasons | hotel | Canary Riverside Plaza Hotel |  | wikidata | low |  |
| Franco Manca | restaurant | Franco Manca | Crossrail Place, 0, E14 5AR | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/7182075443) [fsa](https://ratings.food.gov.uk/business/807339) [cwg](https://canarywharf.com/restaurant/franco-manca/) |
| Fuller's | bar | The Gun | E14 9NS | osm+storelocator | high | [osm](https://www.openstreetmap.org/way/189811893) [store](https://www.thegundocklands.com/) |
| GAIL's | takeaway | GAIL's | Canada Place, 0, E14 5EQ | osm+fsa+storelocator | high | [osm](https://www.openstreetmap.org/node/12962155286) [fsa](https://ratings.food.gov.uk/business/1736241) [store](https://gails.com/pages/canary-wharf-waitrose) |
| Gaucho | restaurant | Gaucho | 0, E14 8RR | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/way/267333160) [fsa](https://ratings.food.gov.uk/business/624938) [cwg](https://canarywharf.com/restaurant/gaucho/) |
| German Doner Kebab | takeaway | German Doner Kebab | Cabot Place, 3, E14 4QS | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/10092576622) [fsa](https://ratings.food.gov.uk/business/1414122) [cwg](https://canarywharf.com/restaurant/german-doner-kebab/) |
| Goldsmiths | shop | Goldsmiths | 0 | osm | medium | [osm](https://www.openstreetmap.org/node/3835357163) |
| Grind | cafe | Grind | Cabot Place, Mall Level -1, E14 5HD | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/11110587498) [fsa](https://ratings.food.gov.uk/business/1582185) [cwg](https://canarywharf.com/restaurant/grind/) |
| Hackett London | shop | Hackett London | Cabot Place, 0, E14 4QS | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357166) [cwg](https://canarywharf.com/shop/hackett/) |
| Halifax | bank | Halifax | Cabot Place, 2, E14 4QT | osm | medium | [osm](https://www.openstreetmap.org/node/10092576620) [store](https://branches.halifax.co.uk/canary-wharf/350/355-cabot-place-east) |
| Hamptons International | office | Hamptons International | Canada Square, E14 5NN | cwg | medium | [cwg](https://canarywharf.com/shop/hamptons-international/) |
| Hawksmoor | restaurant | Hawksmoor | Wood Wharf, E14 5GX | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/way/967277709) [fsa](https://ratings.food.gov.uk/business/1490217) [cwg](https://canarywharf.com/restaurant/hawksmoor-bar/) |
| Heytea | cafe | Heytea |  | osm | medium | [osm](https://www.openstreetmap.org/node/13775396501) |
| Heytea | cafe | Hey Tea | Cabot Place, 0, E14 4QS | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/13775395901) [fsa](https://ratings.food.gov.uk/business/1732053) [cwg](https://canarywharf.com/restaurant/heytea/) |
| Hilton | hotel | Hilton London Canary Wharf | E14 9SH | osm | medium | [osm](https://www.openstreetmap.org/way/263787599) |
| Hilton | hotel | Lincoln Plaza London, Curio Collection by Hilton | E14 9BD | osm | medium | [osm](https://www.openstreetmap.org/way/655620902) |
| Hobbs | shop | Hobbs | Canada Place, 0, E14 5AH | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357167) [cwg](https://canarywharf.com/shop/hobbs/) |
| Holland & Barrett | shop | Holland & Barrett | Canada Place, 0, E14 5AX | osm+fsa+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/3835357168) [fsa](https://ratings.food.gov.uk/business/1002234) [cwg](https://canarywharf.com/shop/holland-barrett-canada-place/) [store](https://www.hollandandbarrett.com/stores/canary-wharf-3264/) |
| Holland & Barrett | shop | Holland & Barrett | Jubilee Place, -1, E14 5NY | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/7098936640) [fsa](https://ratings.food.gov.uk/business/1037483) [cwg](https://canarywharf.com/shop/holland-barrett-jubilee-place/) |
| Hotel Chocolat | takeaway | Hotel Chocolat | Canada Place, 0, E14 5EQ | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357169) [cwg](https://canarywharf.com/shop/hotel-chocolat/) |
| Hotel Chocolat | takeaway | Hotel Chocolat | Jubilee Place, Mall Level -1, E14 5NY | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/1880916) [cwg](https://canarywharf.com/restaurant/hotel-chocolat-cafe/) |
| HSBC UK | bank | HSBC UK | E14 5HQ | osm | medium | [osm](https://www.openstreetmap.org/way/5986805) [store](https://www.hsbc.co.uk/branch-list/canary-wharf-relationship-management-centre/) |
| HSBC UK | bank | HSBC UK | Canada Place, 0, E14 5AH | osm+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/3835357165) [cwg](https://canarywharf.com/shop/hsbc-canada-place/) [store](https://www.hsbc.co.uk/branch-list/canary-wharf-canada-place-cash-withdrawals-and-note-deposits-through-self-service/) |
| HSBC UK | bank | HSBC UK | Jubilee Place, -1, E14 5NY | osm+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/6466176064) [cwg](https://canarywharf.com/shop/hsbc-jubilee-place/) [store](https://www.hsbc.co.uk/branch-list/canary-wharf-jubilee-place-counter-service-available-monday-friday/) |
| Hugo Boss | shop | Hugo Boss | Cabot Place, 0, E14 4QS | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835356838) [cwg](https://canarywharf.com/shop/boss/) |
| Ibis | hotel | Ibis London Docklands | E14 9PE | osm+fsa | high | [osm](https://www.openstreetmap.org/way/201557327) [fsa](https://ratings.food.gov.uk/business/73371) |
| Intimissimi | shop | Intimissimi | Canada Place, Mall Level, -1 | cwg | medium | [cwg](https://canarywharf.com/shop/intimissimi/) |
| Ippudo | restaurant | Ippudo | Crossrail Place, 0, E14 5AR | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/6019685657) [fsa](https://ratings.food.gov.uk/business/750398) [cwg](https://canarywharf.com/restaurant/ippudo-canary-wharf/) |
| Island Poké | takeaway | Island Poké | Crossrail Place, 0, E14 5AR | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/7925251503) [fsa](https://ratings.food.gov.uk/business/1278819) [cwg](https://canarywharf.com/restaurant/island-poke/) |
| iSmash | other | iSmash | Canada Place, Mall Level -1, E14 5EQ | osm+cwg | high | [osm](https://www.openstreetmap.org/node/10092221331) [cwg](https://canarywharf.com/shop/ismash/) |
| itsu | takeaway | itsu | Canada Place, E14 5AH | osm+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/7118074388) [cwg](https://canarywharf.com/restaurant/itsu-kiosk-canada-place-2/) [store](https://www.itsu.com/location/east-london/canary-wharf-canada-place/) |
| itsu | takeaway | itsu | Jubilee Place, -1, E14 5NY | osm+fsa+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/7098936638) [fsa](https://ratings.food.gov.uk/business/87294) [cwg](https://canarywharf.com/restaurant/itsu-jubilee-place/) [store](https://www.itsu.com/location/east-london/jubilee-place/) |
| JD Sports | shop | JD Sports | Canada Place, 0, E14 5AH | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357172) [cwg](https://canarywharf.com/shop/jd-sports/) |
| Jo Malone | shop | Jo Malone London | Cabot Place, Mall Level -1, E14 4QS | cwg | medium | [cwg](https://canarywharf.com/shop/jo-malone-london/) |
| Joe & The Juice | cafe | Joe & The Juice | E14 4QW | fsa | medium | [fsa](https://ratings.food.gov.uk/business/1809174) |
| Joe & The Juice | cafe | Joe & The Juice | Cabot Place, Street Level 0, E14 4QT | cwg | medium | [cwg](https://canarywharf.com/restaurant/joe-the-juice-cabot-place/) |
| Joe & The Juice | cafe | Joe & The Juice | Churchill Place, -1, E14 5RB | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/11748054688) [fsa](https://ratings.food.gov.uk/business/1380798) [cwg](https://canarywharf.com/restaurant/joe-the-juice/) |
| John Lewis | shop | John Lewis | 1;2, E14 5EW | osm+cwg | high | [osm](https://www.openstreetmap.org/node/9872733865) [cwg](https://canarywharf.com/shop/john-lewis-partners/) |
| Jones Bootmaker | shop | Jones Bootmaker | 0 | osm | medium | [osm](https://www.openstreetmap.org/node/3835357176) |
| Keatons | office | Keatons | E14 8JT | osm | medium | [osm](https://www.openstreetmap.org/node/3607806797) |
| Kiehl's | shop | Kiehl’s, since 1851 | Jubilee Place, Mall Level -1, E14 5NY | cwg | medium | [cwg](https://canarywharf.com/shop/kiehls-since-1851/) |
| KIKO Milano | shop | KIKO MILANO | Cabot Place, Mall Level -1 | cwg | medium | [cwg](https://canarywharf.com/shop/kiko-milano/) |
| Knight Frank | office | Knight Frank | Churchill Place, E14 5RE | cwg | medium | [cwg](https://canarywharf.com/shop/knight-frank/) |
| KPMG | office | KPMG | 7, E14 9SH | osm | medium | [osm](https://www.openstreetmap.org/node/5909799877) |
| KPMG | office | KPMG | E14 5GL | osm+fsa+wikidata | high | [osm](https://www.openstreetmap.org/way/5986920) [fsa](https://ratings.food.gov.uk/business/428260) |
| KPMG | office | KPMG Fine Dining Restaurant | E14 5LB | fsa | low | [fsa](https://ratings.food.gov.uk/business/92851) |
| Krispy Kreme | takeaway | Krispy Kreme | Canada Place, Mall Level -1, E14 5AH | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/7118074387) [fsa](https://ratings.food.gov.uk/business/84970) [cwg](https://canarywharf.com/restaurant/krispy-kreme/) |
| L'Occitane | shop | L'Occitane | Jubilee Place, -1, E14 5NY | osm+cwg | high | [osm](https://www.openstreetmap.org/node/6553275295) [cwg](https://canarywharf.com/shop/loccitane/) |
| Läderach | takeaway | Laderach | Canada Place, Mall Level -1, E14 5AH | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/1870494) [cwg](https://canarywharf.com/shop/laderach/) |
| Land Rover | motoring | Rockar Jaguar Land Rover | Cabot Place, 1, E14 4QT | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357218) [cwg](https://canarywharf.com/shop/rockar-land-rover/) |
| Le Pain Quotidien | cafe | Le Pain Quotidien | Jubilee Place, -2, E14 5NY | osm | medium | [osm](https://www.openstreetmap.org/node/7178540971) |
| LEON | takeaway | LEON | 0, E14 4QS | osm | medium | [osm](https://www.openstreetmap.org/node/3835357180) |
| LEON | takeaway | LEON | Jubilee Place, -2, E14 5NY | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/7178540972) [fsa](https://ratings.food.gov.uk/business/842616) [cwg](https://canarywharf.com/restaurant/leon-jubilee-place/) |
| Lina Stores | restaurant | Lina Stores | Crossrail Place, Mall Level -1, E14 5AR | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/770189) [cwg](https://canarywharf.com/restaurant/lina-stores/) |
| Lloyds Bank | bank | Lloyds Bank | The Park Pavilion, 1, E14 5FW | osm+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/4307632691) [cwg](https://canarywharf.com/shop/lloyds-bank/) [store](https://branches.lloydsbank.com/london/40-canada-square) |
| Locke | hotel | Locke |  | cwg | medium | [cwg](https://canarywharf.com/stay/locke/) |
| Lola's Cupcakes | takeaway | Lola's Cupcakes | Canada Place, 0, E14 5EQ | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/4305939197) [fsa](https://ratings.food.gov.uk/business/770212) [cwg](https://canarywharf.com/restaurant/lolas-cupcakes/) |
| Lululemon | shop | lululemon | Canada Place, Mall Level -1, E14 5AH | cwg | medium | [cwg](https://canarywharf.com/shop/lululemon/) |
| M&S Food | supermarket | M&S Food | -3 | osm | medium | [osm](https://www.openstreetmap.org/node/10298319073) |
| M&S Food | supermarket | M&S Simply Food | Jubilee Place, -1, E14 5NY | osm+fsa+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/7098936632) [fsa](https://ratings.food.gov.uk/business/80579) [cwg](https://canarywharf.com/shop/marks-spencer-simply-food/) [store](https://www.marksandspencer.com/stores/canary-wharf-simply-food-3722) |
| Maison Nicolas | bar | Nicolas | One Canada Square, Mall Level -1, E14 5AX | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/70132) [cwg](https://canarywharf.com/shop/nicolas-wine-spirits-specialist/) |
| Majestic | bar | Majestic | E14 9QB | osm+fsa | high | [osm](https://www.openstreetmap.org/way/190717069) [fsa](https://ratings.food.gov.uk/business/50626) |
| Malin+Goetz | shop | Malin+Goetz | Cabot Place, 1, E14 4QT | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357217) [cwg](https://canarywharf.com/shop/malin-goetz/) |
| Mango | shop | Mango | Canada Place, 0, E14 5AH | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357185) [cwg](https://canarywharf.com/shop/mango/) |
| Marriott | hotel | London Marriott Hotel Canary Wharf | E14 4ED | wikidata+cwg | high | [cwg](https://canarywharf.com/stay/london-marriott-hotel-canary-wharf/) |
| Marriott Executive Apartments | hotel | Marriott Executive Apartments | E14 4ED | osm+cwg | high | [osm](https://www.openstreetmap.org/way/309188473) [cwg](https://canarywharf.com/shop/london-marriott-executive-apartments-canary-wharf/) |
| Marugame Udon | takeaway | Marugame Udon | Cabot Place, 3, E14 4QT | osm+cwg | high | [osm](https://www.openstreetmap.org/node/10092576621) [cwg](https://canarywharf.com/restaurant/marugame-udon/) |
| Massimo Dutti | shop | Massimo Dutti | Cabot Place, 1, E14 4QT | osm | medium | [osm](https://www.openstreetmap.org/node/3835357186) |
| McDonald's | takeaway | McDonald's | E14 5SP | osm | medium | [osm](https://www.openstreetmap.org/node/14211250640) |
| Mercedes-Benz | motoring | Mercedes Benz After Sales |  | osm | medium | [osm](https://www.openstreetmap.org/node/8996852021) |
| Mildreds | restaurant | Mildreds | Wood Wharf, E14 9ZW | osm+cwg | high | [osm](https://www.openstreetmap.org/way/1449335671) [cwg](https://canarywharf.com/restaurant/mildreds/) |
| Mooboo | takeaway | Mooboo | E14 0BB | osm+fsa | high | [osm](https://www.openstreetmap.org/node/8040648087) [fsa](https://ratings.food.gov.uk/business/1283586) |
| Morgan Stanley | bank | Morgan Stanley |  | osm | medium | [osm](https://www.openstreetmap.org/node/5015919524) |
| Morgan Stanley | bank | Morgan Stanley | E14 4QA | osm+fsa | high | [osm](https://www.openstreetmap.org/way/172886760) [fsa](https://ratings.food.gov.uk/business/100180) |
| Morrisons Daily | supermarket | Morrisons Daily | Wood Wharf, E14 9QH | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/11075101947) [fsa](https://ratings.food.gov.uk/business/1904851) [cwg](https://canarywharf.com/shop/morrisons-daily/) |
| Moss | shop | Moss Bros | Canada Place, 0, E14 5AH | osm+cwg | high | [osm](https://www.openstreetmap.org/node/6553266683) [cwg](https://canarywharf.com/shop/moss/) |
| Mr. Pretzels | takeaway | Mr Pretzels | Canada Place, Mall Level -1, E14 5AH | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/1616887) [cwg](https://canarywharf.com/restaurant/mr-pretzels/) |
| Nando's | restaurant | Nando's | Cabot Place, 3, E14 4QT | osm+fsa+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/7228285479) [fsa](https://ratings.food.gov.uk/business/67552) [cwg](https://canarywharf.com/restaurant/nandos-cabot-place/) [store](https://www.nandos.co.uk/restaurants/canary-wharf-cabot-place) |
| Nando's | restaurant | Nando's | Jubilee Place, -1, E14 5NY | osm+fsa+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/7098936637) [fsa](https://ratings.food.gov.uk/business/90864) [cwg](https://canarywharf.com/restaurant/nandos-jubilee-place/) [store](https://www.nandos.co.uk/restaurants/canary-wharf-jubilee-place) |
| NatWest | bank | NatWest |  | osm | medium | [osm](https://www.openstreetmap.org/node/1708718109) |
| NatWest | bank | NatWest | Crossrail Place, Mall Level -1, E14 5AR | osm+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/8812217587) [cwg](https://canarywharf.com/shop/natwest/) [store](https://www.natwest.com/search-results/locator/branch.html?sortcode=606015&name=Canary%20Wharf%20Crossrail) |
| Neat | takeaway | Neat | Cabot Place, 3, E14 4QT | osm | medium | [osm](https://www.openstreetmap.org/node/10092576623) |
| Nespresso | cafe | Nespresso | E14 5EW | osm | medium | [osm](https://www.openstreetmap.org/node/6553275294) |
| Next | shop | Next | Jubilee Place, Level - 2, E14 5NY | cwg | medium | [cwg](https://canarywharf.com/shop/next/) |
| Nicholson's | bar | The Henry Addington | 0, E14 4PH | osm+cwg | high | [osm](https://www.openstreetmap.org/node/573854610) [cwg](https://canarywharf.com/restaurant/the-henry-addington/) |
| Notes | cafe | Notes | -1, E14 5NN | osm+fsa | high | [osm](https://www.openstreetmap.org/node/7130352124) [fsa](https://ratings.food.gov.uk/business/1170596) |
| Notes | cafe | Notes | -2, E14 5HL | osm | medium | [osm](https://www.openstreetmap.org/node/11030817652) |
| Notes | cafe | Notes | Crossrail Place, 0, E14 5AR | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/6019685656) [fsa](https://ratings.food.gov.uk/business/770187) [cwg](https://canarywharf.com/restaurant/notes-coffee-roasters-bar/) |
| Novotel | hotel | Novotel London Canary Wharf | E14 9TP | osm | medium | [osm](https://www.openstreetmap.org/way/365809829) |
| Nuffield Health Fitness & Wellbeing | gym | Nuffield Health Fitness & Wellbeing | E14 9SH | osm | medium | [osm](https://www.openstreetmap.org/node/4865395494) |
| Office | shop | Office | Canada Place, Mall Level -1 | cwg | medium | [cwg](https://canarywharf.com/shop/office-shoes/) |
| Ole & Steen | takeaway | Ole & Steen | Crossrail Place, 0, E14 5AR | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/7182075444) [fsa](https://ratings.food.gov.uk/business/960844) [cwg](https://canarywharf.com/restaurant/ole-steen-crossrail-place/) |
| Ole & Steen | takeaway | Ole & Steen | Jubilee Place, Mall Level -2, E14 5NY | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/1603699) [cwg](https://canarywharf.com/restaurant/ole-steen-jubilee-place/) |
| Paddy Power | service | Paddy Power | 0 | osm | medium | [osm](https://www.openstreetmap.org/node/6553275299) |
| Pandora | shop | Pandora | Canada Place, 0, E14 5AH | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357197) [cwg](https://canarywharf.com/shop/pandora/) |
| Patty & Bun | restaurant | Patty & Bun | Wood Wharf, E14 9GG | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/10034149594) [fsa](https://ratings.food.gov.uk/business/1562924) [cwg](https://canarywharf.com/restaurant/patty-bun/) |
| Paul | takeaway | Paul | Cabot Place, -1, E14 4QS | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/3835357199) [fsa](https://ratings.food.gov.uk/business/99594) [cwg](https://canarywharf.com/restaurant/paul-cabot-place/) |
| Paul | takeaway | Paul | Jubilee Place, -2, E14 5NY | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/7178540966) [fsa](https://ratings.food.gov.uk/business/100557) [cwg](https://canarywharf.com/restaurant/paul-jubilee-place/) |
| Paul Smith | shop | Paul Smith | Cabot Place, 1, E14 4QT | osm | medium | [osm](https://www.openstreetmap.org/node/3835357198) |
| Pizza Pilgrims | restaurant | Pizza Pilgrims | E14 4AF | osm+fsa | high | [osm](https://www.openstreetmap.org/way/183091364) [fsa](https://ratings.food.gov.uk/business/960840) |
| Poke House | takeaway | Poke House | Jubilee Place, -2, E14 5NY | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/7579400265) [fsa](https://ratings.food.gov.uk/business/1229606) [cwg](https://canarywharf.com/restaurant/poke-house-wharf-kitchen/) |
| Polo Ralph Lauren | shop | Polo Ralph Lauren | Cabot Place, Mall Level -1, E14 4QS | cwg | medium | [cwg](https://canarywharf.com/shop/polo-ralph-lauren/) |
| Pop Mart | shop | Pop Mart | Canada Square, Mall Level -1, E14 5AB | cwg | medium | [cwg](https://canarywharf.com/shop/pop-mart/) |
| Porsche | motoring | Porsche Store |  | osm | medium | [osm](https://www.openstreetmap.org/node/1708719005) |
| Post Office (UK) | service | Cubitt Town Post Office | E14 3PQ | osm+storelocator | high | [osm](https://www.openstreetmap.org/node/1708662420) [store](https://www.postoffice.co.uk/branch-finder/0680028/cubitt-town) |
| Post Office (UK) | service | Canary Wharf Post Office | 1, E14 4PZ | osm+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/3835357215) [cwg](https://canarywharf.com/shop/the-post-office-chancellor-passage/) [store](https://www.postoffice.co.uk/branch-finder/1160028/canary-wharf) |
| Post Office (UK) | service | Churchill Place Post Office | Churchill Place, -1, E14 5RB | osm+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/1936163399) [cwg](https://canarywharf.com/shop/the-post-office-churchill-place/) [store](https://www.postoffice.co.uk/branch-finder/142002x/churchill-place) |
| Premier Inn | hotel | Premier Inn | E14 8QN | osm+fsa | high | [osm](https://www.openstreetmap.org/way/777288384) [fsa](https://ratings.food.gov.uk/business/1589893) [store](https://www.premierinn.com/gb/en/hotels/england/greater-london/london/london-canary-wharf-westferry.html) |
| Pret A Manger | takeaway | Pret A Manger | E14 9GE | osm+fsa | high | [osm](https://www.openstreetmap.org/node/1416436569) [fsa](https://ratings.food.gov.uk/business/960853) |
| Pret A Manger | takeaway | Pret A Manger | E14 9SH | osm+fsa+storelocator | high | [osm](https://www.openstreetmap.org/node/1708608213) [fsa](https://ratings.food.gov.uk/business/960854) [store](https://www.pret.co.uk/en-GB/shop-finder/l/london/marsh-wall/10581) |
| Pret A Manger | takeaway | Pret A Manger | 0, E14 5AA | osm | medium | [osm](https://www.openstreetmap.org/node/2466733313) |
| Pret A Manger | takeaway | Pret A Manger | 1, E14 4HD | osm+fsa+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/2926275227) [fsa](https://ratings.food.gov.uk/business/72047) [cwg](https://canarywharf.com/restaurant/pret-a-manger-westferry-circus/) [store](https://www.pret.co.uk/en-GB/shop-finder/l/london/7-westferry-circus/68) |
| Pret A Manger | takeaway | Pret A Manger | Cabot Place, 0, E14 4QS | osm+fsa+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/2768944961) [fsa](https://ratings.food.gov.uk/business/72303) [cwg](https://canarywharf.com/restaurant/pret-a-manger-cabot-place/) [store](https://www.pret.co.uk/en-GB/shop-finder/l/london/unit-320-(rt1)-cabot-place-canary-wharf/39) |
| Pret A Manger | takeaway | Pret A Manger | Canada Place, 0, E14 5AH | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357201) [cwg](https://canarywharf.com/restaurant/pret-a-manger-canada-place/) |
| Pret A Manger | takeaway | Pret A Manger | Canada Place, -1, E14 5NN | osm+cwg | high | [osm](https://www.openstreetmap.org/node/7130352123) [cwg](https://canarywharf.com/restaurant/pret-a-manger-canada-place-2/) |
| Pret A Manger | takeaway | Pret A Manger | Jubilee Place, -1, E14 5NY | osm+fsa+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/2926272920) [fsa](https://ratings.food.gov.uk/business/81194) [cwg](https://canarywharf.com/restaurant/pret-a-manger-jubilee-place/) [store](https://www.pret.co.uk/en-GB/shop-finder/l/london/bank-street/195) |
| Pret A Manger | takeaway | Pret A Manger | One Canada Square, 0, E14 5AH | osm+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/3835357158) [cwg](https://canarywharf.com/restaurant/pret-a-manger-one-canada-square/) [store](https://www.pret.co.uk/en-GB/shop-finder/l/london/canada-place/10742) |
| Pure | takeaway | Pure | Cabot Place, 0, E14 5AB | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/3835357202) [fsa](https://ratings.food.gov.uk/business/590791) [cwg](https://canarywharf.com/restaurant/pure/) |
| PureGym UK | gym | PureGym | E14 4AN | osm+fsa+storelocator | high | [osm](https://www.openstreetmap.org/way/315268196) [fsa](https://ratings.food.gov.uk/business/731076) [store](https://www.puregym.com/gyms/london-canary-wharf/) |
| Reiss | shop | Reiss | Jubilee Place, 0, E14 5NY | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357203) [cwg](https://canarywharf.com/shop/reiss-jubilee-place/) |
| Rexel | shop | Rexel |  | osm | medium | [osm](https://www.openstreetmap.org/node/10033638264) |
| Rituals | shop | Rituals | Jubilee Place, -2, E14 5NY | osm+cwg | high | [osm](https://www.openstreetmap.org/node/6453984569) [cwg](https://canarywharf.com/shop/rituals/) |
| Robert Dyas | shop | Robert Dyas | Canada Place, -1, E14 5EQ | osm+cwg | high | [osm](https://www.openstreetmap.org/node/10092160681) [cwg](https://canarywharf.com/shop/robert-dyas/) |
| Rolex | shop | Rolex at Watches of Switzerland | Canada Place, Mall Level -1, E14 5AH | cwg | medium | [cwg](https://canarywharf.com/shop/rolex-at-watches-of-switzerland/) |
| Rolex | shop | Rolex at DMR | Jubilee Place, Mall Level -1, E14 5NY | cwg | medium | [cwg](https://canarywharf.com/shop/rolex-at-dmr/) |
| Ryman | shop | Ryman | Cabot Place, 2, E14 4QT | osm+cwg | high | [osm](https://www.openstreetmap.org/node/6553275291) [cwg](https://canarywharf.com/shop/ryman-stationery/) |
| Samsung | shop | Samsung | Canada Place, 0, E14 5AH | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357220) [cwg](https://canarywharf.com/shop/samsung/) |
| Santander (UK) | bank | Santander | One Canada Square, 0, E14 4QS | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357205) [cwg](https://canarywharf.com/shop/santander/) |
| Scribbler | shop | Scribbler | One Canada Square, 0, E14 5AX | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357206) [cwg](https://canarywharf.com/shop/scribbler/) |
| Shah's Halal Food | takeaway | Shahs Halal Food | E14 9TS | fsa | low | [fsa](https://ratings.food.gov.uk/business/1881808) |
| Shake Shack | takeaway | Shake Shack | The Park Pavilion, 1, E14 5FW | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/1985574417) [fsa](https://ratings.food.gov.uk/business/66507) [cwg](https://canarywharf.com/restaurant/shake-shack/) |
| Sixt | motoring | SIXT | Level -3, E14 5EW | osm+cwg | high | [osm](https://www.openstreetmap.org/node/11052723162) [cwg](https://canarywharf.com/shop/sixt/) |
| Snappy Snaps | service | Snappy Snaps | One Canada Square, 0, E14 5AX | osm+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/3835357207) [cwg](https://canarywharf.com/shop/snappy-snaps/) [store](https://www.snappysnaps.co.uk/canarywharf/) |
| Société Générale | bank | Société Générale | E14 4SG | osm | medium | [osm](https://www.openstreetmap.org/node/6965670304) |
| Søstrene Grene | shop | Sostrene Grene | Jubilee Place, Level -2, E14 5NY | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/1902527) [cwg](https://canarywharf.com/shop/sostrene-grene/) |
| Space NK | shop | Space NK | Cabot Place, 1, E14 4QT | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357208) [cwg](https://canarywharf.com/shop/space-nk/) |
| Spaces | office | Spaces Coffee Club | E14 4QZ | fsa | low | [fsa](https://ratings.food.gov.uk/business/1570331) |
| Starbucks | cafe | Starbucks | Churchill Place, -1, E14 5RB | osm+fsa+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/2039163582) [fsa](https://ratings.food.gov.uk/business/101625) [cwg](https://canarywharf.com/restaurant/starbucks-coffee-co-churchill-place/) [store](https://www.starbucks.com/store-locator/store/1010101/canary-wharf-churchill-place-unit-14-2-churchill-place-london-eng-e-14-5-rb-gb) |
| Starbucks | cafe | Starbucks | Jubilee Place, -1, E14 5NY | osm+fsa+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/6466176063) [fsa](https://ratings.food.gov.uk/business/81181) [cwg](https://canarywharf.com/restaurant/starbucks-coffee-co-jubilee-place/) [store](https://www.starbucks.com/store-locator/store/1005366/canary-wharf-jubilee-place-unit-11-12-london-eng-e-14-5-ny-gb) |
| Starbucks | cafe | Starbucks | One Canada Square, Mall Level -1, E14 5AA | osm+fsa+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/2466728999) [fsa](https://ratings.food.gov.uk/business/72319) [cwg](https://canarywharf.com/restaurant/starbucks-coffee-co-one-canada-square/) [store](https://www.starbucks.com/store-locator/store/2644/canary-wharf-canada-square-unit-p-490-one-canada-square-london-eng-e-14-5-ab-) |
| Sticks'n'Sushi | restaurant | Sticks 'n' Sushi | Crossrail Place, 0, E14 5AR | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/7182075441) [fsa](https://ratings.food.gov.uk/business/770193) [cwg](https://canarywharf.com/restaurant/sticksnsushi/) |
| Subway | takeaway | Subway | E14 4HD | fsa+storelocator | high | [fsa](https://ratings.food.gov.uk/business/1965395) [store](https://restaurants.subway.com/united-kingdom/en/london/11-westferry-circus) |
| Subway | takeaway | Subway | E14 9SH | fsa | medium | [fsa](https://ratings.food.gov.uk/business/442208) |
| Subway | takeaway | Subway | Crossrail Place, -3, E14 5AR | osm+fsa+cwg+storelocator | high | [osm](https://www.openstreetmap.org/node/12861063688) [fsa](https://ratings.food.gov.uk/business/1651859) [cwg](https://canarywharf.com/restaurant/subway/) [store](https://restaurants.subway.com/united-kingdom/en/london/unit-cr66-crossrail-place) |
| Swarovski | shop | Swarovski | Jubilee Place, Mall Level - 1, E14 5NY | cwg | medium | [cwg](https://canarywharf.com/shop/swarovski/) |
| T.M.Lewin | shop | TM Lewin | Cabot Place, Mall Level 0, E14 4QT | cwg | medium | [cwg](https://canarywharf.com/shop/tm-lewin/) |
| T4 Tea House | cafe | T4 Bubble Tea | Canada Place, Mall Level -1, E14 5FU | cwg | medium | [cwg](https://canarywharf.com/restaurant/t4/) |
| T4 Tea House | cafe | T4 Tea For U | Crossrail Place, -1, E14 5AR | osm+fsa | high | [osm](https://www.openstreetmap.org/node/7230701003) [fsa](https://ratings.food.gov.uk/business/1201070) |
| Tesco | supermarket | Tesco | E14 9NA | fsa | medium | [fsa](https://ratings.food.gov.uk/business/99601) |
| Tesco Express | supermarket | Tesco Express | E14 9SH | osm+fsa | high | [osm](https://www.openstreetmap.org/node/1516641422) [fsa](https://ratings.food.gov.uk/business/67668) [store](https://www.tesco.com/store-locator/london/south-quay-plaza) |
| Tesco Express | supermarket | Tesco Express | E14 3NX | osm+fsa | high | [osm](https://www.openstreetmap.org/node/3239229105) [fsa](https://ratings.food.gov.uk/business/770190) [store](https://www.tesco.com/store-locator/isle-of-dogs/571-manchester-rd) |
| Tesco Express | supermarket | Tesco Express | 0, E14 0BB | osm+fsa | high | [osm](https://www.openstreetmap.org/node/4891741637) [fsa](https://ratings.food.gov.uk/business/66016) [store](https://www.tesco.com/store-locator/london/262-poplar-high-st) |
| Tesco Express | supermarket | Tesco Express | E14 9AB | osm+fsa | high | [osm](https://www.openstreetmap.org/way/223063426) [fsa](https://ratings.food.gov.uk/business/307970) [store](https://www.tesco.com/store-locator/london/landmark-tower) |
| Tesco Express | supermarket | Tesco Express | Cabot Place, 2, E14 4QT | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/2320089166) [fsa](https://ratings.food.gov.uk/business/44830) [cwg](https://canarywharf.com/shop/tesco-express/) [store](https://www.tesco.com/store-locator/london/15-cabot-square) |
| The Body Shop | shop | The Body Shop | 0 | osm | medium | [osm](https://www.openstreetmap.org/node/3835357214) |
| The Cocktail Club | bar | London Cocktail Club | E14 4EB | fsa+cwg | high | [fsa](https://ratings.food.gov.uk/business/1584788) [cwg](https://canarywharf.com/restaurant/the-cocktail-club/) |
| The Fragrance Shop | shop | The Fragrance Shop | Canada Place, Mall Level -1 | cwg | medium | [cwg](https://canarywharf.com/shop/the-fragrance-shop/) |
| The Hagen Project | cafe | Hagen | E14 5EZ | osm | medium | [osm](https://www.openstreetmap.org/node/14159942729) |
| The Ivy Collection | restaurant | The Ivy | The Park Pavilion, 1, E14 5FW | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/way/704927590) [fsa](https://ratings.food.gov.uk/business/938392) [cwg](https://canarywharf.com/restaurant/the-ivy-in-the-park/) |
| The Kooples | shop | The Kooples | 0 | osm | medium | [osm](https://www.openstreetmap.org/node/3835357216) |
| Third Space | gym | Third Space | 2;3;4, E14 5ER | osm+cwg | high | [osm](https://www.openstreetmap.org/node/8715135574) [cwg](https://canarywharf.com/see-do/third-space-recovery-spa/) |
| Third Space | gym | Third Space | Wood Wharf | osm+cwg | high | [osm](https://www.openstreetmap.org/node/13261927511) [cwg](https://canarywharf.com/see-do/third-space-wood-wharf/) |
| Thyme | restaurant | Thyme |  | osm | medium | [osm](https://www.openstreetmap.org/node/11177166974) |
| Toni & Guy | service | Toni & Guy | Jubilee Place, 0, E14 5NT | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357219) [cwg](https://canarywharf.com/shop/toni-guy/) |
| Tortilla | takeaway | Tortilla | 1, E14 4EU | osm+fsa | high | [osm](https://www.openstreetmap.org/node/6553275300) [fsa](https://ratings.food.gov.uk/business/66706) |
| Trailfinders | service | Trailfinders | Cabot Place, 2, E14 4QS | osm+cwg | high | [osm](https://www.openstreetmap.org/node/10092576624) [cwg](https://canarywharf.com/shop/trailfinders/) |
| TRIBE | hotel | TRIBE | Wood Wharf, E14 5GX | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/10034149593) [fsa](https://ratings.food.gov.uk/business/1582183) [cwg](https://canarywharf.com/see-do/tribe-canary-wharf/) |
| Vagabond | bar | Vagabond Wines | E14 9ZW | fsa | low | [fsa](https://ratings.food.gov.uk/business/1641216) |
| Virgin Active | gym | Virgin Active | Level 0, E14 8RR | osm+cwg | high | [osm](https://www.openstreetmap.org/way/190714751) [cwg](https://canarywharf.com/see-do/virgin-active-canary-riverside/) |
| Vision Express | health | Vision Express | Canada Place, 0, E14 5AH | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357222) [cwg](https://canarywharf.com/shop/vision-express/) |
| Vodafone | shop | Vodafone | 0 | osm | medium | [osm](https://www.openstreetmap.org/node/3835357223) |
| Wagamama | restaurant | Wagamama | Jubilee Place, -1, E14 5NY | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/7098936636) [fsa](https://ratings.food.gov.uk/business/80621) [cwg](https://canarywharf.com/restaurant/wagamama/) |
| Wahaca | restaurant | Wahaca | The Park Pavilion, 2, E14 5FW | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/4307632689) [fsa](https://ratings.food.gov.uk/business/1832799) [cwg](https://canarywharf.com/restaurant/wahaca/) |
| Waitrose | supermarket | Waitrose | 0, E14 5EW | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/1708718478) [fsa](https://ratings.food.gov.uk/business/75876) [cwg](https://canarywharf.com/shop/waitrose-partners/) [store](https://www.waitrose.com/find-a-store/canary-wharf) |
| Wasabi | takeaway | Wasabi | Cabot Place, -1, E14 4QS | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/3835357225) [fsa](https://ratings.food.gov.uk/business/101026) [cwg](https://canarywharf.com/restaurant/wasabi/) |
| Watches of Switzerland | shop | Watches of Switzerland | Canada Place, 0, E14 5AH | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357226) [cwg](https://canarywharf.com/shop/watches-of-switzerland/) |
| WatchHouse | cafe | WatchHouse | Cabot Place, 0, E14 4QT | osm+cwg | high | [osm](https://www.openstreetmap.org/node/11746870131) [cwg](https://canarywharf.com/restaurant/watchhouse-cabot-place/) |
| Waterstones | shop | Waterstones | Cabot Place, 2, E14 4QT | osm+cwg | high | [osm](https://www.openstreetmap.org/node/6553266684) [cwg](https://canarywharf.com/shop/waterstones-cabot-place/) |
| Wetherspoon | bar | The Ledger Building | E14 4AL | osm+wikidata+storelocator | high | [osm](https://www.openstreetmap.org/way/140144150) [store](https://www.jdwetherspoon.com/pubs/the-ledger-building-docklands) |
| WeWork | office | WeWork | Churchill Place, E14 5EU | osm+fsa | high | [osm](https://www.openstreetmap.org/node/7043260790) [fsa](https://ratings.food.gov.uk/business/1893603) |
| Whole Foods Market | supermarket | Whole Foods Market | Wood Wharf, E14 5GX | fsa | medium | [fsa](https://ratings.food.gov.uk/business/1988770) |
| Wraps & Wings | takeaway | Wraps & Wings, Wicked, EggsQuisite, Maida | E14 8LW | fsa | low | [fsa](https://ratings.food.gov.uk/business/1315044) |
| Yi Fang Tea | cafe | Yi Fang Tea | Jubilee Place, -1, E14 5NY | osm | medium | [osm](https://www.openstreetmap.org/node/7178540968) |
| Yolk | takeaway | Yolk | Cabot Place, 0, E14 4QT | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/14159942728) [fsa](https://ratings.food.gov.uk/business/1535477) [cwg](https://canarywharf.com/restaurant/yolk/) |
| Zara | shop | Zara | 1 | osm | medium | [osm](https://www.openstreetmap.org/node/3835357228) |
| Zara | shop | Zara | Cabot Place, 0, E14 4QT | osm+cwg | high | [osm](https://www.openstreetmap.org/node/3835357204) [cwg](https://canarywharf.com/shop/zara/) |
| Zia Lucia | restaurant | Zia Lucia | E14 9WS | osm+fsa | high | [osm](https://www.openstreetmap.org/node/12685740199) [fsa](https://ratings.food.gov.uk/business/1495346) |
| Zizzi | restaurant | Zizzi | Cabot Place, 3, E14 4QT | osm+fsa+cwg | high | [osm](https://www.openstreetmap.org/node/10611368182) [fsa](https://ratings.food.gov.uk/business/1561003) [cwg](https://canarywharf.com/restaurant/zizzi/) |

