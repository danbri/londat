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
| per-store stock check, works headless | 11 |
| per-store stock check, blocked or needs a browser session | 14 |
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
| Watches of Switzerland | GET `/occ/v2/WatchesOfSwitzerland_UK/products/{code}/storestock?locationQuery={q}&fields=FULL` (SAP Commerce OCC) | quantity per showroom | 466 (578, 579 same point) | none; E14 5AB geocoded wrong (only Regent Street came back): try "Canary Wharf" or lat/long |
| Flowers & Plants Co. | GET `/variants/{variantId}/?section_id=pickup-availability` (Shopify) | HTML list of pickup shops | Canada Place, Jubilee Place (names, no ids) | none |
| Hobbs | GET `/on/demandware.store/Sites-HB-UK-Site/en/Product-StockCheck?pid&lat&long&dwvar_{pid}_color&postalCode` (SFCC) | HTML table | not seen (the one-size item gave an empty table) | none |
| Intimissimi | GET `Stores-FindStores?lat&long&radius=1` works; the product call `FindInStore-GetStoresWithProductAvailability` needs a size | store list with pickup flags | IGJ4 (Unit 6 Canada Place) | none; robots.txt Crawl-delay 5 |
| Circle Collective | Shopify pickup-availability, as Flowers & Plants | pickup shops | not a pickup shop (Dalston, Lewisham only) | none |
| Space NK | GET `/on/demandware.store/Sites-spacenkgb-Site/en_GB/FindInStore-GetStores?productID&postcode&storesCount=5` (read from the page) | JSON `isAvailable` per shop | not run | robots.txt disallows `/on/`: do not call directly |
| Hotel Chocolat | Salesforce PWA Kit "Find In Store" through `/mobify/proxy/api/...` (inferred) | | not run | robots.txt disallows `/mobify/`: do not call directly |

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
- Open: The White Company OCC `/products/search` answered 400 with `fields=FULL` (try `fields=DEFAULT`); Wax test item
  was sold out (retest); Malin+Goetz robots.txt allows `/graphql?` but disallows `/catalogsearch/`: owner decision
  whether a GraphQL SKU lookup is acceptable.

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
