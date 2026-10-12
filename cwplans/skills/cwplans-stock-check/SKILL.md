---
name: cwplans-stock-check
description: >-
  Which Canary Wharf shops have web tools that say whether a product is in stock at a physical shop, and how to call
  them with care: the survey of 2026-10-12 (77 product shops from the kgx cwg graph, registry/sources/stock/
  stock-check-survey.json), the probe tool tools/probe-stock-check.mjs, the endpoints found per platform (Shopify
  pickup-availability, SAP Commerce OCC stock, Salesforce Commerce Cloud FindInStore, Magento in-store pickup, Umbraco
  inventorysearch), GTIN and SKU lookup, search engines and facets, Canary Wharf store ids, the bot walls met (Akamai, Cloudflare, Imperva, DataDome, Netacea, AWS WAF)
  and the rules: robots.txt unless the owner approved that set of fetches, never evade a challenge, one search per user need, no basket or login. Also shop
  agent routes (agents.md, Shopify UCP/MCP) and why a static GitHub Pages site cannot host MCP or call shop endpoints.
  Reach for it before you call a shop's stock endpoint, add a shop, repeat the survey, or answer "is X in stock at
  Canary Wharf?".
---

# Stock in Canary Wharf shops (cwplans)

Owner, 2026-10-12: "find all shops in canary wharf whose websites might have 'is this product in stock' tools. Examine
their sites, summarize findings. We are working towards being able to (carefully eg headless browser on demand no ddos)
call these programmatically in service of concrete user needs. Use node for now".

- Data: https://github.com/danbri/londat/blob/main/cwplans/registry/sources/stock/stock-check-survey.json (one entry per
  brand: site, platform, stock_check {endpoint, response_shape, canary_wharf_store_id, needs_session, headless_ok},
  bot_protection, other_signals, verdict, notes, evidence_urls, robots_ai, cwg).
- Probe: `NODE_USE_ENV_PROXY=1 node cwplans/tools/probe-stock-check.mjs <url> [--wait=6000] [--click=text]
  [--postcode="E14 5AB"] [--locale=en-GB] [--input=css] [--submit=text] [--all-requests] [--out=f.json]`
  (`--locale=en-GB` for UK shops; the tool holds no place of its own: OKRS.md architecture rules).
  Chromium needs the proxy CA in its NSS store (skill `cwplans-web-harvest`, "Chromium behind the agent proxy"; run
  `certutil` with `</dev/null`, or it waits for a password).
- Policy: crawls for scoping (owner, 2026-10-03) and the store-finder exception (one UK postcode in a search box) in
  the `cwplans-web-harvest` skill. The survey used one stock-check search per brand with E14 5AB, the same rule.

## How the list was made

1. Node, kgx store handle (`kgx-query.mjs`): every entity of type `s:Store` and its subtypes (ClothingStore,
   JewelryStore, ElectronicsStore, GroceryStore, Florist, ShoeStore, MensClothingStore, HomeGoodsStore, BookStore,
   OnlineStore, HealthAndBeautyBusiness) with `s:url`, `s:brand`, `s:sameAs`: 361 rows, 250 names. Only 79 Store
   entities have `s:url`; the names in `cwg` are often page titles ("Coach - Luxury Accessories in Canary Wharf").
2. Clean names and websites from the graph's input, `registry/sources/brands/cwg-directory-typed.json` (`kind: shop`):
   120 retail entries; services, clinics, dentists, lockers and duplicate branches removed: 77 brands. 17 websites
   were missing or poor and were set by hand (in the survey file's `site`).
3. Four survey agents, about 20 brands each, 2026-10-12 14:55 to 15:35 UTC.

## Results (2026-10-12)

| verdict | brands |
|---|---:|
| per-store stock check, works headless | 12 (11 before the approved pass: Boss moved up) |
| per-store stock check, blocked or needs a browser session | 13 |
| click & collect only, no per-store visibility | 8 |
| online availability only | 22 |
| no online shop | 6 |
| unknown (blocked before any page) | 16 |

Per-store checks that answered, best first:

| brand | call | answer | Canary Wharf store | session |
|---|---|---|---|---|
| The White Company | GET `/TWCcommercewebservices/v2/twc-uk/products/{variantCode}/stock?fields=DEFAULT` (SAP Commerce OCC) | unit count for each of 69 UK shops | `jubilee-place` | none (curl works) |
| Crockett & Jones | POST `https://cj-app-152ce4da90df.herokuapp.com/stockcheck/` (form: product, fit, size from the SKU) | quantity for each of 10 shops ("current within the last hour") | 316 | none |
| Robert Dyas | POST `/rest/robertdyas_uk_main_en_gb/V1/inventory/in-store-pickup/pickup-locations`, then POST `/rest/robertdyas_uk_main_en_gb/V1/wct-fulfillment/location/get-inventory-availability` (Magento + Walmart BOPIS) | in stock yes/no per shop, "collect in 15 minutes" | `rd_6088` (16-19 Canada Square) | none |
| Søstrene Grene | GET `/umbraco/api/store/inventorysearch?sku={sku}&address={postcode}` | per shop 1 out, 2 few, 3 in stock, plus hours | 8039 (Jubilee Place) | en-gb cookie, else the Danish market |
| Watches of Switzerland | GET `/occ/v2/WatchesOfSwitzerland_UK/products/{code}/stock/{storeId}` (SAP Commerce OCC; set D, 2026-10-12) | `stockLevel` and `stockLevelStatus` (inStock / lowStock / outOfStock) for that showroom | 466 (a false id answers 400) | none (plain fetch). `storestock?locationQuery=` gives only the nearest one store (E14 5AB → Regent Street; lat/long → 578 Omega boutique): use the by-store route |
| Flowers & Plants Co. | GET `/variants/{variantId}/?section_id=pickup-availability` (Shopify) | HTML list of pickup shops | Canada Place, Jubilee Place (names, no ids) | none |
| Hobbs | GET `/on/demandware.store/Sites-HB-UK-Site/en/Product-StockCheck?pid&lat&long&dwvar_{pid}_color&dwvar_{pid}_size` (SFCC; set D, 2026-10-12) | HTML table: "<n> in stock" or "Out of Stock" per shop (counts) | 377 (Unit 20 Canada Place); test dress UK 12: 1 in stock | none (plain fetch); lat/long needed (the page geocodes the postcode); size codes internal (UK 12 = `004`) |
| Intimissimi | GET `FindInStore-GetStoresWithProductAvailability?lat&lon&rad=0&pid=<style>&color=<code>&size=<up to 3>&filterBopis=&currentHour=` (SFCC; set D, 2026-10-12) | per shop and size: none / low / high; shops without the item seem left out | IGJ4 (from `Stores-FindStores`); not in the one answer seen (item likely not stocked there) | none (plain fetch); the call is built in a lazily loaded script |
| Circle Collective | Shopify pickup-availability, as Flowers & Plants | pickup shops | not a pickup shop (Dalston, Lewisham only) | none |
| Space NK | GET `/on/demandware.store/Sites-spacenkgb-Site/en_GB/FindInStore-GetStores?productID&postcode&storesCount=5` | JSON `isAvailable` true/false per shop, courier flags, no count | "Canary Wharf" (the id is the name; E14 4QT), first | none (plain fetch); robots.txt disallows `/on/`: owner approval needed per set |
| Hotel Chocolat | Loqate geocode → SCAPI `shopper-stores/v1/.../store-search` (lat/long, 20 mi) → `shopper-products/v1/.../products/{id}?inventoryIds=` (through `/mobify/proxy/api/`) | unit count per shop (`ats`/`stockLevel`) | 305 (Jubilee Place), 160 (Canada Place) | SLAS guest token (no login); robots.txt disallows `/mobify/`: owner approval needed per set |
| Boss | GET `/on/demandware.store/Sites-UK-Site/en_GB/Retail-DoRetailAvailabilitySearch?skus=[[EAN,size],...]&pid&lat&lon` | HTML fragment, nearest 13 shops, sizes in stock yes/no | Unit 5 Cabot Place West (store-page slug, no number), first | none (plain fetch); robots.txt disallows `/*DoRetailAvailabilitySearch`: owner approval needed per set |

Blocked or session-bound per-store checks: Marks & Spencer (GraphQL `GetStores` at `experience.marksandspencer.app`,
level per shop, needs an anonymous bearer token and Akamai; Canary Wharf 3722 is a Simply Food shop), Accessorize (SFCC
`ProductStock-GetData`, one preferred store chosen by IP), Diptyque (SoCloz popup; `api.socloz.com/robots.txt` is
`Disallow: /`), Rituals (New Black EVA; no store list appeared headless), Holland & Barrett (AWS WAF token; the button
sent no request headless), Boss (robots.txt disallows `/*retailavailability`), Zara (robots.txt disallows
`/itxrest/*/availability`), Next and Russell & Bromley (Akamai; Russell & Bromley now on the Next platform), Currys,
Waterstones (Cloudflare), Boots (Imperva), COS (Akamai; robots.txt disallows `/api/`), Mango (Vercel checkpoint).

Unknown, blocked before any page: EE (Imperva), Coach, Swarovski, Reiss, Polo Ralph Lauren (Akamai), Monica Vinader,
Pandora, The Fragrance Shop, Ryman (Cloudflare; same owner and stack as Robert Dyas), L'Occitane (DataDome), Office
(Netacea), Boggi (Bunny Shield), Waitrose and John Lewis (`ERR_HTTP2_PROTOCOL_ERROR` headless), Weather and Palette
(`/api/` disallowed), Kitchen Jam (not identified).

## Lookup and search (second pass, 2026-10-12)

Owner: "Go back and look to see which require exact matches vs being search interfaces, which allow gtin exact
matching or templates/regex, and other functionality such as categories, filters, facets etc." 44 shops (those whose
sites answered); the `lookup` object of each survey entry and `lookup_survey` hold the details. A search ran only where
robots.txt allows the shop's search path (18 shops); 26 were read from page scripts, robots.txt and platform documents.

- **Stock calls are exact-id lookups, never searches.** Each needs the shop's own id: a variant SKU or code (The White
  Company variant code, Crockett & Jones SKU split into product, fit and size, Robert Dyas numeric SKU, Søstrene Grene
  `999999-999`, Accessorize 10-digit pid, Hobbs master id plus colour), or a Shopify variant id for the pickup section.
  No stock call takes a GTIN. So a caller goes words or barcode → search or catalogue → shop id → stock call.
- **GTIN lookup works at 5 shops:** Charbonnel et Walker (WooCommerce Store API `?sku=` and `?search=`; the SKU is the
  EAN), Moleskine (SFCC search; the SKU and URL id are the EAN), T.M.Lewin (Shopify search; EAN is SKU and barcode),
  Tashola (Shopify search on the variant barcode), PureSeoul (Searchanise). It fails at 28: no GTIN in the data, or the
  engine does not index it (Diptyque has real gtin13 but its Algolia index has no barcode; Newbie's Boost index finds
  the SKU, not the EAN). 11 unknown (search not run). GTINs that are not real: Flying Tiger gtin13 `020…` (in-store
  number), Malin+Goetz 12-digit POS code (bad check digit), Moss 13-digit internal code (prefix 965); Newbie labels
  EAN-13 as gtin12; Boss puts the EAN in `sku`. Real EANs also sit, unsearched, in The White Company OCC `variantOptions[].ean`,
  Space NK JSON-LD `gtin13` per variant, Barker and Scribbler Shopify variant JSON, JD Sports and Hotel Chocolat page data.
- **SKU lookup works at 16** (search or an exact route): Shopify `variants.sku:` field syntax (Circle Collective), Shopify
  predictive search with `fields=variants.sku` (iSmash), BigCommerce GraphQL `product(sku:)` (Lakrids), OCC
  `productCodes=` (Samsung), Søstrene Grene `productlistbyvariant?skus=`, Algolia (Fortnum & Mason, Diptyque: filter the
  exact SKU after the search, near matches come too), Ocado `retailerProductId` (Morrisons).
- **No wildcards or regex anywhere.** Shopify documents a trailing `*` prefix and field filters (`variants.sku:`,
  `variants.barcode:`, `tag:`, `product_type:`, `vendor:`; not tested); Algolia and Boost match prefixes. Typo tolerance
  seen: Shopify ("peonnies"), SFCC Moleskine ("clasic notebok"), Algolia Fortnum ("earl gery"), Søstrene Grene.
- **Engines:** Shopify native 11, SFCC native 8, Algolia 6 (Diptyque, Fortnum & Mason, JD Sports, Hawes & Curtis, Hotel
  Chocolat, Rituals through `search.rituals.com`; the pages hold search-only keys, not recorded), Boost 2, Bloomreach 2,
  Constructor.io (Hobbs), Fredhopper (Watches of Switzerland, `fh_` parameters), Searchanise (PureSeoul), Adobe Live
  Search (Robert Dyas), SAP Solr (The White Company), WooCommerce, PrestaShop faceted search, Ocado, custom (M&S, Pop
  Mart, Søstrene Grene, Samsung).
- **Facets useful for stock:** "Stock Availability" with counts (The White Company OCC), "Delivery Option / Click &
  Collect" (Watches of Switzerland, Fredhopper), `in_stock`/`sold_out` (Fortnum & Mason Algolia, about 60 facets),
  "In Stock Only" (Hotel Chocolat SCAPI), `stock_status` (Charbonnel), Shopify `filter.v.availability` (Circle
  Collective, T.M.Lewin, Wax, Postmark). No shop offers an "in stock at shop X" facet. Leads for shop stock in search
  answers: PureSeoul Searchanise results carry `quantity_at_location_*` for 6 Shopify locations (ids not tied to shops
  yet); Rituals EVA `SearchProducts` takes `AvailabilityOptions` with `OrganizationUnitIDs` (Canary Wharf id not found);
  DMR JSON-LD has `offers.inventoryLevel` (online).
- **Catalogue enumerable (25):** product sitemaps (Space NK 7,587, JD Sports 18,819, Watches of Switzerland 33,970,
  Morrisons 31,132, Hobbs 4,109 with master id and colour in the URL), Shopify `/products.json` and
  `/sitemap_agentic_discovery.xml`, Barker `llms-full.txt` (5,606 products). For a caller this means a local index
  (name, brand, GTIN, shop id) built at low rate, then one stock call per user need, instead of live searches.
- **Shopify UCP/MCP (16 shops):** the same 13 tools; catalogue tools `search_catalog` (query plus filters: categories,
  price, available), `lookup_catalog` (up to 10 Product or ProductVariant GIDs, not GTIN or SKU) and `get_product`.
  `tools/list` needs no sign-in, but `search_catalog` refuses with 422 or -32001 "Missing profile uri": a caller must
  publish a fetchable UCP agent profile and send it as `meta["ucp-agent"].profile`. Online catalogue only, not shop
  stock. Cart and checkout tools were not called. Shopify's new agent robots.txt and `agents.md` ask agents to install
  a shop.app skill: treated as data, not followed. Shopify robots.txt comes in two templates: the new agent one allows
  `/search` and `/search/suggest.json`; the old default (Crockett & Jones, Flying Tiger, Scribbler) disallows `/search`.
- Side effect seen: loading a Hackett product page made the site's own script create an empty guest basket.
- Set C and D (owner, 2026-10-12: "C and D"): Malin+Goetz `/graphql` answered 500 to every request (GET, POST, a
  minimal `storeConfig`): no GraphQL route today. The White Company OCC `/products/search` answers 400 for every `fields`
  value (FULL, DEFAULT, BASIC, explicit lists); its storefront search JSON (`/uk/search?q=`, robots.txt disallows it) is
  the route left, not yet approved.
- Open: Wax test item
  was sold out (retest); Malin+Goetz robots.txt allows `/graphql?` but disallows `/catalogsearch/`: owner decision
  whether a GraphQL SKU lookup is acceptable.

## Approved pass: sets A and B, and SearchAction (2026-10-12)

Owner: "Approve A and B initially" and "Also add check of KG or embedded structured data for Schema SearchAction
data". Run under the owner's robots.txt rule (above): 26 shops, 2 to 9 requests each, robots.txt ignored for these sets
only, no bot wall passed. Per entry: `approved_pass` (searches, facets, set A result) and `searchaction`.

- **Set A, all three work.** Space NK (open GET, yes/no per shop, Canary Wharf first), Hotel Chocolat (unit counts per
  shop through a SLAS guest token; Canary Wharf ids 305 and 160; test item 2 and 1 units), Boss (open GET with
  `[EAN,size]` pairs, sizes in stock per shop, Canary Wharf first). Table above.
- **Set B, GTIN in the shop's own search:** found at Lakrids (BigCommerce `search.php`), Barker (Shopify `/search`,
  barcode and SKU exact), Boss (EAN redirects to the product). Not found at Space NK, Hotel Chocolat (EAN on the
  page, search gives 0: map EAN → product id from the product data), JD Sports (EAN 0, PLU found), Flying Tiger (its
  `020…` code is not a GTIN). So GTIN lookup by site search now works at 8 of 44 shops; elsewhere a caller keeps its
  own EAN → shop-id table from product pages.
- **Set B, SKU or style code:** exact at most shops; several redirect straight to the product page (M&S part number,
  product code and 8-digit "upc"; Charles Tyrwhitt style+colour `?singleRes=true`; Hackett; Boss; Läderach). Not found:
  Hobbs master id (loose matches), Moss (0), Watches of Switzerland 8-digit code (0; the item may be out of the index;
  its home page calls a Fredhopper `fh_location=…|secondid<{p<code>}>` form, a possible exact route, not tested),
  Samsung (search API `sribsrch.ecom.samsung.com/estoresearch-api/v1/scom/search` answered 403 headless).
- **Per-shop facets:** Accessorize search has a hidden facet "Available For Store" (`prefn1=storeAvailability&prefv1=1163`,
  1163 = Canary Wharf) with counts per store. Set E (owner, 2026-10-12: "AporoveB, E"; 2 plain-fetch requests): the
  filter works. "classic tote bag" gives 1 product with the filter (2 without); "bag" gives 176 products at the Canary
  Wharf shop, 40 per page (SFCC `sz`/`start`). No session, 0.7 to 1.0 s, server-rendered HTML with `data-pid` per tile.
  So one request lists what that shop holds for a query, with no stock level per product.
  JD Sports Algolia has `availability` and `inStock_Stores`, but they count all shops together. Hotel Chocolat Algolia has
  `in_stock` and "In Stock Only" (online).
- **Engine notes:** Rituals page `?q=` drops the term (whole catalogue); the Algolia request the page makes works
  (`search.rituals.com`, index `prd_products_b2cweb_gb`). Nicolas (PrestaShop) answers JSON to `Accept: application/json`.
  Hawes & Curtis searches through a first-party POST `/api/Site/AjaxProductsFromCategories` (Algolia behind it). Pop Mart
  search is POST `/rpc/search/public_search`; its `?keyword=` does nothing, `?q=` works. Hobbs results are SFCC native
  (sz=60), not Constructor.io.
- **SearchAction.** Since 2026-10-12 the kgx graph `web-search` holds them (operation `lift-site-search`, skill
  `cwplans-kgx`; query `kgx/queries/site-search.rq`); before that the kgx store had none. The stored harvest
  (`third_party/cwplans-structured-data/search/probe.json`, 2026-10-06) has a template for 23 of the 77 shops
  (`searchaction.stored_2026_10_06` per entry). Live check of 26 home pages: 14 declare one, and all 14 are real
  product searches; no WordPress `?s=`, no `utm_*` on these (Boggi's stored template has `utm_*`). Changes since the
  harvest: Crockett & Jones (the stored template was the US host, from the geo redirect), Flying Tiger (market path
  dropped), Accessorize (new), Boss (inside `Organization.mainEntityOfPage`), Läderach (two blocks; the root one opens the
  Swiss store in CHF: use the `/uk-en/` one), Hawes & Curtis (declared on Organization). A SearchAction template is a
  usable, published search entry point for a caller; most product shops (SFCC, Shopify themes) write one.
- Caller traps seen: a headless browser from the US exit is sent to US stores by script (Barker, Crockett & Jones);
  plain fetch stays on the UK store. Space NK's widget click timed out behind the cookie banner; the GET works.

## The MCP server `cwplans-stock` (2026-10-12)

Owner: "Approve f, g, mcp". `tools/stock-mcp/` (`server.mjs` JSON-RPC over stdio like `docklands-view`, `adapters/canary-wharf.mjs` one
adapter per shop, `policy.mjs` the fetch rules, `test.mjs`), registered in `.mcp.json` as `cwplans-stock`.
- Tools: `list_stock_shops` (shop, Canary Wharf store id, answer kind, id arguments) and `stock_check` (`shop` plus that
  shop's own product id: `variant_code`, `sku`, `product_code`, `product_id`, `pid`/`color`/`size`, `skus`, `query`).
- Shops (10): The White Company (`variant_code`; count, `jubilee-place`), Crockett & Jones (`sku` "<product>/<fit>/<size>";
  quantity, 316), Robert Dyas (`sku`, `qty`; in stock yes/no and collection time, `rd_6088`), Søstrene Grene (`sku`;
  3 levels, 8039; header and cookie `culture: en-GB`), Watches of Switzerland (`product_code`; level and status, 466),
  Space NK (`product_id`; yes/no), Hobbs (`pid`, `color`, `size` codes from the find-in-store form; count, 377), Boss
  (`pid`, `skus` [[EAN, size]]; sizes per shop), Accessorize (`query`; products the Canary Wharf shop holds, 1163).
  Intimissimi (`pid` style, `color`, `size` up to 3 joined by `_`; none/low/high per shop and size, IGJ4; each record
  nests the store details in `store`). Hotel Chocolat (SLAS guest token through `/mobify/`) is not in it yet.
- `policy.mjs` on every request: robots.txt read per host; a disallowed path (Space NK `/on/`, Boss, Accessorize
  search) is fetched only when the call carries `owner_approval` (the owner's words and date), which is logged; 6 s or
  more per host (`STOCK_MCP_GAP_MS`); 50 requests per host per process at most; a 401/403/429/503 ends the call (no
  retry, no bypass); the user agent names the project; every request logged to `data/raw/stock-mcp/calls.jsonl`
  (ignored by git). No basket, login or form code.
- Test: `node tools/stock-mcp/test.mjs` (protocol, no network: 5 checks pass); `--live --approval="..."` makes one
  call per shop. Live run of 2026-10-12 (approval "Approve f, g, mcp"), 8 shops, all with the Canary Wharf branch in the
  answer: The White Company CLDDSNNA 8 in stock; Crockett & Jones 20499A-J01L3/E/060 0; Robert Dyas 251735 in stock,
  collect tomorrow; Søstrene Grene 521893-002 out of stock; Watches of Switzerland 17631061 out of stock; Space NK
  UK200019905 not available; Hobbs dress UK 12 1 in stock; Accessorize "classic tote bag" 1 product. Boss not run (needs
  [EAN, size] pairs from a product page).
- Fault met: the first Hobbs parse took the store name from inside the label tag (the regex starts in the tag).
- Place rule (OKRS.md, `tools/check-locale.mjs`): the place (position, postcode, country) and the market locale are in
  `tools/stock-mcp/data/region.json`; the shop hosts and store ids are in the region adapter
  `tools/stock-mcp/adapters/canary-wharf.mjs` (`STOCK_MCP_ADAPTER`, `STOCK_MCP_REGION` name others). The check counts
  nothing in `tools/stock-mcp/adapters/`, like `docklands/adapters/`. A first commit (74057cc) went out with the locale
  check failing (a pipe hid the exit code); this layout fixes it.
- Sets F and G (same approval, 9 requests): Intimissimi CLD28B colour 019, S/M/L: IGJ4 "LONDON CANARY WHARF" first of 9
  shops, high for all three sizes (a listed shop can still give "none" for a size). The live MCP call gave the same.
  Watches of Switzerland: `/stock/466` and `/stock/579` (a valid id) gave 0 for two Tudor models; no positive answer
  seen yet in 4 reads (try a high-volume model). The White Company storefront search: `GET /uk/search/async/search?text=<q>`
  with `countryIsoCode=GB&currencyIsoCode=GBP` ( `?q=` gives 500; without the country parameters a US exit goes to
  `/us/`); "diffuser" 55 results, 48 per page, 5 sorts, 6 facets incl. Stock Availability `excludeStockInStore`; the SKU
  and EAN tests did not run (budget used by the two URL faults).

## Rules for a caller

- One call per concrete user need (a person asks "is X in stock at Canary Wharf?"); no polling, no catalogue sweeps,
  no pre-fetching. Cache an answer for minutes, not days: the sites say stock is "a guide only".
- **robots.txt and approval (owner, 2026-10-12, dev and eval phase):** "These tools will be user-assisting browser functionality and not unconstrained web crawling. For this dev and eval phase you can ignore robots.txt so long as EVERY set of fetches to a site is explicitly requested by me or approved.  If multiple files pulled they are in batches of max 50 and requests are staggered."
  So: (1) every set of fetches to a shop site needs the owner's explicit request or approval in the conversation, named
  by site and purpose, before it runs; with that approval robots.txt may be ignored, and the run records that it was
  (probe: `--ignore-robots --approved="<owner's words, date>"`). (2) Without that approval, robots.txt still decides:
  a disallowed path (Space NK `/on/`, Hotel Chocolat `/mobify/`, Boss, Zara, COS, JD Sports `*/stock/*`, SoCloz) is not
  called. (3) Several files: batches of 50 or fewer, requests staggered (5 s or more apart per host in this project).
  (4) The approval covers robots.txt only. It does not cover bot walls (next rule), logins, baskets or other forms.
  The surveys of 2026-10-12 (first and second pass) ran before this rule and obeyed robots.txt.
- Never evade a bot wall: no user-agent change, stealth plugin, captcha solving or residential proxy. A blocked brand
  stays blocked; ask the brand, or show the user the brand's page.
- No login, basket, reservation or checkout. "Reserve in store" and "Reserve & Collect" are forms: never submitted.
- robots.txt AI-agent groups were read on 2026-10-12 (`robots_ai` in the survey file). None of them disallows a stock
  path that the survey used. The White Company gives `Allow: /` to Anthropic-AI, GPTBot and ChatGPT-User under
  "# Explicitly allow AI crawlers" (a survey note said Disallow: wrong, corrected). Lakrids by Bülow and Swarovski
  disallow account, cart and checkout paths for AI agents. Read them again before a caller ships.
- The container's traffic leaves from the US: Crockett & Jones and The White Company redirect to US shops (The White
  Company: add `?countryIsoCode=GB&currencyIsoCode=GBP`), Accessorize picks a store by IP, TM Lewin's pickup section was
  empty. A UK exit would change some results.
- Every survey call is described by shape only; no response body is committed.

## Agent routes the shops publish

- Shopify UCP/MCP: Flowers & Plants Co. (`/agents.md`, `/.well-known/ucp`, `/api/ucp/mcp`), Circle Collective, Diptyque,
  David M Robinson, Tashola; Flying Tiger `/.well-known/ucp`; Barker `llms.txt`. They cover the online catalogue, cart
  and checkout ("Payment requires buyer approval"), not shop stock. Worth a look for OKR O3.
- Online availability (not per shop): schema.org `Offer.availability` in JSON-LD on most product pages; Shopify
  `/products/<handle>.js` and `/products.json` (`available` per variant).

## MCP and the static site

GitHub Pages serves static files only, so it cannot host a remote MCP server (MCP over HTTP needs a server that answers
POST). And the shop endpoints send no CORS headers, so a page cannot call them from the browser. Routes: WebMCP tools in
a page (the Three.js port registers 10, `docklands/README.md`), a local stdio MCP server (`tools/view-mcp/`), or a remote
MCP server on a host that runs code (Cloudflare Workers, Deno Deploy) that reads the Pages data. A stock tool must run
outside the page: a local MCP server, a hosted server, or the user's own browser.

## Probe tool faults met (fixed 2026-10-12)

- A robots.txt `Disallow: *product_list_order*` matched every path (the wildcard was cut, leaving ""): now a regex
  with `*` and `$`.
- A bot wall answered robots.txt with an HTML captcha page and status 200 (Office): now `robots.txt unreadable`, skipped.
- `challenge` was true on Shopify pages (inline captcha script text, and a 403 from a `shop.app` iframe): now the text
  test leaves out the bare word "captcha", and the status test uses the main-frame document only.
- Cloudflare's `challenge-platform` scripts load on many sites with no challenge: they name the vendor (`botManager`),
  they do not set `challenge`.
- Survey agents sharing one scratch folder overwrote each other's scripts once: give each agent its own folder.

## Open

- Hobbs: test a sized item to see the store table and the Canada Place id. Intimissimi: test with a size chosen.
  Watches of Switzerland: test "Canary Wharf" or lat/long.
- The Internet Archive answered 429 or reset the connection through the proxy all day: the blocked brands are not
  confirmed from archived copies.
- Owner decisions: whether to ask Space NK, Hotel Chocolat, Boss and the blocked brands for access; whether the first
  caller is a local MCP tool (`docklands-view` or a new server) for the five open endpoints (The White Company,
  Crockett & Jones, Robert Dyas, Søstrene Grene, Watches of Switzerland).
