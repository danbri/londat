---
name: cwplans-web-harvest
description: >-
  Web pages the Canary Wharf / Docklands registry links to (occupant sites, chain store pages, the Canary Wharf Group
  directory) and their schema.org data: crawl and headless render (robots.txt, politeness, the Chromium proxy CA fix),
  store finders with a UK postcode, JSON-LD repair, the N-Quads dataset, @factoidal/core and its known faults
  (tools/check-factoidal.mjs), branch / chain / organisation scopes, descriptive idioms (ShEx) and the canonical layer,
  sameAs groups, the typed CWG directory and its hours, site search (SearchAction), opening hours by mall and area,
  how far mall plans can be rebuilt from CWG and OSM, what the markup is for, and the reports. Reach for it before
  you crawl or render a site for cwplans, add a store finder, attribute a page fact to a branch, read hours or
  phone numbers from the web, or do RDF work on the harvest.
---

# Web harvest for cwplans

Policy, the fault register and the activity log are in the hub skill `docklands-data-curation`
(`cwplans/skills/docklands-data-curation/`). Append what you did to its `ACTIVITY-LOG.md`.
Checked against the code and the committed outputs on 2026-10-04; counts are from the runs of 2026-10-03 unless
marked otherwise.

## What is allowed

- **Crawls** (owner, 2026-10-03, repo `CLAUDE.md`): "Website crawls - direct and via IA or CommonCrawl etc are fair use
  for our scoping purposes." Pages fetched directly, from the Internet Archive or from Common Crawl, and data taken
  from them. Record each crawl in `data-register.json` with its method and date. Re-check before anything leaves the
  prototyping phase.
- **Store finders** (owner, 2026-10-03: "we are permitted per industry convention to submit storefinder forms with UK
  postcodes"): type a UK postcode into a brand's store-finder or store-locator search box and follow the result to the
  branch page. Nothing else: no other form, no names, emails, accounts or bookings, no login. robots.txt and the
  per-host gap still apply. Record how each page was reached (`via`: method, postcode, finder URL).
- **Kept**: structured data (JSON-LD, microdata, RDFa), page title, OpenGraph title, type and description (cut to 200
  characters), `lang`, links (tel:, booking, menu, events), feeds. No other page text. Rendered pages stay local.
- **Skipped by rule**: FSA ratings pages, OSM, Wikidata, Companies House and Land Registry pages (their data comes
  from APIs and bulk files), Wikipedia (CC BY-SA, share-alike), register pages, social networks, and the live
  canarywharf.com (Imperva challenge to scripts; its pages are read as Internet Archive `id_` copies that
  `registry/sources/brands/tools/fetch-cwg.mjs` saved).

## Order and commands

    NODE_USE_ENV_PROXY=1 node cwplans/tools/crawl-sites.mjs                  # plain fetch; --list, --no-fetch, --retry-failed, --refresh, --host=h
    NODE_USE_ENV_PROXY=1 node cwplans/tools/render-structured-data.mjs       # headless render, resumable
    NODE_USE_ENV_PROXY=1 node cwplans/tools/render-structured-data.mjs --retry-failed
    NODE_USE_ENV_PROXY=1 node cwplans/tools/render-structured-data.mjs --storefinder-only   # (--storefinder: after the render)
    node cwplans/tools/render-structured-data.mjs --build-only              # third_party copy, no network
    node cwplans/tools/extract-structured-data.mjs                          # all.nq(.gz) + registry/sources/web/structured-facts.json
    node cwplans/tools/join-web-facts.mjs                                   # after build-registry, before build-categories and build-atlas

Also: `--list` and `--list-missing` (render, no network), `--limit=N --host=h` (test runs). Without
`NODE_USE_ENV_PROXY=1`, Node `fetch` ignores `HTTPS_PROXY` here. Activities in `pipeline.json`: `crawl-sites` (area
crawl), `render-structured-data`, `extract-structured-data`, `join-web-facts` (area structured).

## The plain crawl (`tools/crawl-sites.mjs`)

- URLs from `registry/buildings.json` occupants (`website`, `store_url`, `cwg_archived`), `branches.json`,
  `storelocator.json` and `cwg-directory.json`: 859 URLs on 393 hosts (2026-10-03).
- Node fetch, redirects followed by hand (at most 8), final URL recorded; User-Agent
  `glitchcan-cwplans/0.1 (https://github.com/danbri/londat)`; one request at a time per host, 1.5 s apart,
  4 hosts at once, 20 s timeout, up to 4 tries with backoff (Retry-After, else 4, 12, 36 s) on 429, 5xx, timeouts and
  resets. Raw: `data/raw/crawl/<host>/<sha1(url)[0:16]>.html.gz` + `.json`, `robots.json` per host (gitignored).
- Out: `registry/sources/web/site-facts.json`, `discovered-feeds.json` (61 feed URLs, **not verified**: check each with
  `feeds/check-events.mjs` before it joins the catalogue). README: `registry/sources/web/README.md`.
- `names_branch`: does the page name the entry's place? Postcodes and address phrases (street, mall, branch name;
  numbers, unit and level words and "Canary Wharf" or "London" removed) are searched in the visible text and the
  structured data. `true` for a postcode, or a phrase on a page that is not the home page; `"home page lists the
  place"`; `"scripts only"`; `false`. `mentions_canary_wharf` is reported separately and is **not evidence**: a chain's
  home page says nothing about the branch. A postcode shared by many buildings (E14 5AB) can match a page about another
  branch: evidence, not proof.

## The headless render (`tools/render-structured-data.mjs`, `tools/structured-dom.mjs`)

- Same URL fields plus `occupants[].cwg_website` and the `website` of registered charities
  (`registry/sources/registers/charities.json`): 1,025 URLs on 559 hosts. Order: store pages first, then pages the plain
  crawl got no structured data from, then the rest.
- Playwright Chromium (`/opt/pw-browsers/chromium-1194/...`), User-Agent a desktop Chrome string plus
  ` glitchcan-cwplans/0.1 (+https://github.com/danbri/londat)`; images, media and fonts not loaded.
  `PARALLEL = 3` pages, one page at a time per host, `HOST_GAP_MS = 2000` between page loads on a host, wait for load
  and network idle (`CAP_MS = 20000`), then `LATE_MS = 1500` for late JSON-LD; blocks over 200 kB dropped and counted.
- robots.txt is checked for **every document navigation, redirects included** (a route handler aborts a disallowed
  navigation); the crawl's cached `robots.json` is reused. An unreachable robots.txt means no visit.
- A cookie banner is accepted only when the page shows no structured data and one of a fixed list of consent buttons is
  present (41 pages). No logins.
- Internet Archive copies of canarywharf.com pages are read from the local cache with scripts off and no network.
- `structured-dom.mjs` runs inside the page through `page.evaluate`, so it must stay self-contained (no imports, no
  closures). JSON-LD: the raw text of each block, as found. Microdata: the WHATWG algorithm (`itemref` followed; a
  `content` attribute on any itemprop element is used, as search engines do), as JSON items. RDFa: RDFa 1.1 Core with
  the HTML+RDFa rules (initial context prefixes such as `og:` and `schema:`; HTML link types in `rel` ignored when
  `property` is present), as N-Triples with the document base. Each block is marked `server` or `script` by
  comparing with the server HTML.
- **RDFa is almost all OpenGraph** (798 pages; schema.org RDFa on 1). Microdata is on 72 pages, mostly old themes.
  JSON-LD is where the facts are (695 pages, 932 blocks).
- **A browser finds little that the plain crawl missed.** Of 363 pages the plain crawl got nothing from, 222 rendered
  and 78 had data; only 22 pages have JSON-LD that exists only after scripts (53 of 932 blocks), and some of those are
  server blocks that scripts rewrote (Pret: Next.js replaces the server WebSite block). The failures are the same
  sites: bot challenges 63, DNS 33, 404/410 21, TLS 10 (901 of 1,067 attempts rendered).
- Time: main render 43 min for 1,016 URLs (369 archive copies from cache in seconds), retries 4 min, store finders
  50 min first pass and 25 min for three corrected re-runs; extraction about 2 min.

### Store finders (the real gain, and easy to get wrong)

For chain branches with no store page that gave data: find a store-finder link on the brand site (Wikidata P856, else
the branch website), **UK site first** (a `.uk` host or a `/uk`, `/en-gb` path, then `.com`, then other countries:
Wikidata's first website was jomalone.ru and pret.com/en-US). A finder page that already lists the branch is followed
with no form; else the branch's postcode (E14 4QT when it has none) goes in the search box, one search per brand and
postcode. 2026-10-03: 247 searches for 201 brands; 96 runs reached a finder (71 search, 25 list); 29 branch pages name
the branch; 100 brands had no finder link and 50 finders had no postcode box.

First drafts matched the wrong branch. The rules now:
- a result link counts by its own text and URL; its card only when the card is 300 characters or less (a 500-character
  card held several stores);
- brand names are not place phrases ("Pret A Manger", "Barclays" matched every page);
- with two or more branches here, "Canary Wharf" alone picks none;
- every result page is checked again (`names_branch`), and a page that does not name the branch is reported as such,
  not dropped silently.

## JSON-LD cleanup (`tools/jsonld-clean.mjs`)

`cleanJsonLd(text)` returns `{ docs, repairs, error }`; every change is counted by class. Classes in the code:
`html_comment_wrapper`, `cdata_wrapper`, `byte_order_mark`, `empty_block`, `js_comment`, `trailing_comma`,
`missing_comma`, `concatenated_values`, `control_char_in_string`, `invalid_escape`, `stray_semicolon`,
`unclosed_brackets`, `unterminated`, `html_entities_in_markup`, `html_entity_in_string`, `top_level_array_split`,
`graph_unwrapped`, `missing_context_added`, `remote_context_schema_org_inlined`, `remote_context_other_dropped`,
`http_schema_org_iri`, `context_schema_org_iri_normalised`.

Measured on 932 real blocks: remote schema.org context 929 (inlined as `{"@vocab": "https://schema.org/"}`),
`@graph` beside other keys 508 (unwrapped, or the nodes land in a named graph inside the page graph), HTML entities in
strings 411, top-level arrays 24, `http://schema.org/` IRIs 12, no context 7, raw control characters 2, missing
commas 2 (bigeasy.co.uk). After cleaning, Factoidal loaded all 932. Tests: `tools/test/jsonld-clean.test.mjs`
(`node --test cwplans/tools/test/*.test.mjs`: 15 of 15 pass, 2026-10-04). Add a class with a test, never a
silent fix.

## Factoidal and the N-Quads dataset

- `@factoidal/core` 0.7.1 (Apache-2.0, root `devDependencies`). The tool uses `jsonldToRdf`, `parse` and `query`.
- `parse` reads turtle, ntriples, nquads, trig, rdfxml and jsonld. It has **no microdata or RDFa reader**: microdata
  JSON is turned into N-Triples by `extract-structured-data.mjs` (schema.org vocabulary; URL-valued properties become
  IRIs), and RDFa arrives as N-Triples from `structured-dom.mjs`; both are then parsed.
- Remote `@context` URLs need a `documentLoader`, which Factoidal does not register (it fails honestly). So the cleaner
  inlines the schema.org context and drops other remote contexts (counted).
- One named graph per page (graph IRI = page URL). Blank nodes are relabelled per page and block, so graphs merged into
  one file never share a node. `http://schema.org/` is normalised to `https://schema.org/`.
- `third_party/cwplans-structured-data/all.nq` (12 MB, gitignored) and `all.nq.gz` (committed): 65,566 quads from 901
  pages; SPARQL over it took 62 s.

## Factoidal notes (2026-10-06)

Owner, 2026-10-06: "Please always try to use NPM Module Factoidal/core for RDF work, before falling back on other software
if needed" (also in the repo CLAUDE.md). What we learned with `@factoidal/core` 0.7.1 on this dataset:

- `parse` of `all.nq.gz` (65,566 quads, 824 graphs) takes 52 to 60 s. `graphs(ds)` then gives one Dataset per page.
- A query without `GRAPH` matches only the default graph; every harvest triple is in a named graph. For per-page work,
  rebuild each page as a default-graph Dataset (`new Dataset(q.map(x => dataFactory.quad(s, p, o, dataFactory.defaultGraph())))`).
- `shexValidate(data, shexC, focus, shape)` takes ShExC or ShExJ. Shape labels must be absolute or prefixed (`i:Branch`);
  a relative label (`<Branch>`) fails with "could not decode schema". Value sets, `EXTRA`, `@ref`, `|` alternatives,
  cardinalities and regex facets (`LITERAL /^https?:/`) work. A focus can be the RDF/JS term from a SPARQL binding,
  blank nodes included. About 30 ms a check on a page graph (16,143 checks in 9.5 minutes).
- **Check after any Factoidal upgrade:** `node cwplans/tools/check-factoidal.mjs` prints each fault below as
  STILL or FIXED (all STILL on 0.7.1, 2026-10-06). Remove a workaround only when its line says FIXED.
- **Fault, not yet filed:** the issue text is `factoidal-issue-2026-10-06.md` in this skill's folder. The session of
  2026-10-06 could not reach danbri/factoidal (add_repo refused); post it at https://github.com/danbri/factoidal/issues/new
  or ask the owner. Then write the issue URL here.
- **The fault itself:** in a CONSTRUCT, a
  blank node made by `BNODE()` gets a label like `p1__:fxbn…` (a colon, not a valid N-Quads label). `serialize()` drops
  every quad that uses it, silently, in nquads, ntriples and turtle; `toNQuads()` keeps them but writes the invalid
  label, and `parse()` of that output drops those lines, also silently. In a SELECT, a `BNODE()` term's `value` starts
  with `_:`. Workaround here: mint IRIs from a SHA-1 of the text (`IRI(CONCAT(base, SHA1(STR(?a))))`).
- **`toCottas()` of an N-Quads string writes an empty store** (73 bytes, no error); pass a parsed `Dataset`. COTTAS
  queries are also slow at 70k quads; the store to use is Shardborough (skill `cwplans-kgx`, measured there).
- **Blank nodes are renamed per query.** Each query result gives the data's own blank nodes a new prefix (`_:p20_…` in
  one CONSTRUCT, `_:p21_…` in the next, for the same node). SPARQL allows this, but two CONSTRUCT outputs merged into
  one file then lose every link between them: the first canonical layer had 341 `openingHoursSpecification` links and
  no branch reached its days. Fix in use in `web-idioms.mjs`: skolemize each page before any query, a blank node
  becoming `…/.well-known/genid/<sha1(page, label)>`.
- SPARQL scoping, not a Factoidal fault: a `FILTER` inside an inner `OPTIONAL` cannot see a variable bound only outside
  that group. Use `BIND(IF(...))` at the same level instead.

## Idioms (2026-10-06): `idioms/`, `tools/web-idioms.mjs`

Owner, 2026-10-06: "the shape specs here are intended to be used to capture common multi-triple descriptive idioms, not
necc for validation". An idiom is a recurring small group of triples (a node of one type, its usual properties, the
child nodes that hang from it). `idioms/idioms.shex` holds one open core shape per idiom and one small shape per known
form; `idioms/idioms.json` lists, per idiom, the candidate nodes (SPARQL), the core and form shapes, SPARQL forms (for
what ShEx cannot say, such as "the last breadcrumb item has no link") and the rewrite. The tool checks every candidate
with Factoidal ShEx and writes `page-idioms.json` (per page: idioms, nodes, forms), `summary.json` (sites per idiom and
form) and `canonical.nq.gz` (branch cards, weekly hours and organisation cards rewritten to one form each by the SPARQL
CONSTRUCT files in `idioms/rewrites/`; graph = page URL).

Measured (824 pages, 4,341 idiom nodes, 0 deferred ShEx answers, 57 schema.org namespace variants mapped):

| idiom | sites | nodes | forms (sites) |
|---|---|---|---|
| Social preview (Open Graph) | 270 | 698 | image size 92, article times 61 |
| Site identity | 187 | 588 | with publisher 73 |
| Organisation card | 162 | 642 | logo as ImageObject 61, as IRI 47, as text 68 (an image URL in a JSON-LD string), sameAs 110 |
| Branch card | 112 | 220 | address node 106, address text 22, hours nodes 38, hours text 37, geo 40, telephone 69, all parts 21 |
| Site search box | 109 | 502 | target EntryPoint 70, target as text 41, query-input spec 49, as text 62 |
| Breadcrumb trail | 105 | 502 | last item without a link 71 |
| Page frame | 85 | 471 | breadcrumb 66, primary image 43, about 44 |
| Weekly hours | 39 | 462 | day IRI as text 12, day name 27, special days 1 |
| Contact point, Person, Chain branch link | 25, 24, 24 | 32, 95, 45 | chain: parentOrganization 16, brand 7, branchCode 3 |
| Menu, FAQ, Rating badge, Service catalogue, Product offer | 18, 12, 9, 4, 4 | | one full menu tree (an ordering platform) |

JSON-LD without `@id` turns IRIs into text: day names arrive as the text "https://schema.org/Monday", logos and search
targets as URL strings. These are forms, not faults; the rewrites map them (hours.rq strips the namespace and
capitalises the day; org.rq makes any logo an ImageObject with a url; branch.rq writes E.164 UK telephones, ISO country
codes, and the postcode of a text address, with the address text kept as `cwp:addressText`).

IRIs: the `…` of the genids (above) and of the descriptions and rule graphs (below) is
`https://danbri.github.io/glitchcan-minigam/third_party/cwplans-structured-data/`, which also starts the idioms
namespace `i:`; `cwp:` is `https://danbri.github.io/glitchcan-minigam/magpie/cwplans/data-register.json#vocab/`. They
are names, not links. The files here keep them (upstream data of the harvest). Since 2026-10-07 `build-kgx.mjs` maps
them when it lifts them into kgx (`web`, `coref-<rule>`, lift version 2): a description becomes
`https://kgx.foaf.tv/id/desc<h>`, a genid `…/id/genid<h>`, an idiom node `…/id/node<rest>` (owner, 2026-10-07: "Use
https://kgx.foaf.tv/id/ prefix for IDs. i own the domain; nothing is hosted there yet. iDs should be alphanumeric";
`tools/kgx-ids.mjs`, skill `cwplans-kgx`). The `#address` nodes of `cwg-directory-typed.nq` become `…/id/addr<page path>`
the same way; the entity IRIs `https://canarywharf.com/<kind>/<slug>/#entity` stay. The vocabularies (`i:`, `cwp:`)
do not change. Three `s:addressCountry` values in the canonical layer are the text of a genid IRI, not an IRI (a
literal: not mapped; seen 2026-10-07, open).

## Same thing (2026-10-06): `coref/`, `tools/web-coref.mjs`

Organisation and place descriptions (types from the BranchCard and OrgCard candidate lists in `idioms.json`) get an
IRI from a hash of page and node (`…/desc/<sha1>`). Key rules are applied in this order, and each link goes into the
named graph of its rule (`…/coref/rule/<rule>`) in `coref/sameas.nq.gz`, so a bad rule is removed by dropping its graph:

1. `iri`: the same `@id` IRI. 2. `site-name`: same site and normalised name; for places also the same postcode (a chain's
branch pages all say "Pret A Manger"). 3. `sameAs`: the same profile URL. 4. `telephone`: the same normalised number.
5. `postcode-name`: same postcode and name.

Guards: telephone and sameAs join only the same kind (organisation, place); two places whose postcodes disagree are never
linked except by an identical IRI (a head-office number joined three Post Office branches; shared social links joined
two Bread & Truffle shops); empty and bare social URLs are not keys (an empty `sameAs` joined 13 sites).

Measured: 890 descriptions; entities after each rule 493, 401, 399, 396, 396; 151 organisations and 245 places; 14
entities across sites (Mildreds on its own site and a booking platform, Pret on two Pret hosts, Barry's, Charles Tyrwhitt,
atis, Social Pub & Kitchen); no place group with two postcodes. A page's registry keys belong to a description only
when it is the one place on that page; then 6 branches link to two registry buildings (`conflict` in `entities.json`).
Three are fault F46 (curation skill): Atis, Le Chalet Cryo, Charbonnel et Walker. Notes is two real branches seen from
the brand's home page; Flowers & Plants Co is to check.

## The canarywharf.com directory (2026-10-06): `tools/cwg-directory-typed.mjs`

The 369 archived directory pages type only the publisher (Yoast: WebPage, WebSite, BreadcrumbList, Organization). The
tool reads each page's name, `datePublished`, `dateModified` and breadcrumb section with Factoidal SPARQL, joins it to
`registry/sources/brands/cwg-directory.json` by URL, gives a schema.org type from the CWG kind and category (a fixed
table in the tool: "Grab & Go" FastFoodRestaurant, "Cafes & Bars" CafeOrCoffeeShop, "Hairdressing & Beauty" BeautySalon,
"Services" LocalBusiness, ...; cuisine categories also as `servesCuisine`), and adds the registry buildings that link to
the page. Output `registry/sources/brands/cwg-directory-typed.json` and `.nq`. Measured: 374 entries, 357 with page data,
321 with a registry building; first listed 2013 (90, the site launch) to 2025 (55); last edited mostly 2024 (155) and
2025 (153). The types are ours, from the category, not the publisher's.

## Site search (SearchAction, 2026-10-06): `tools/probe-site-search.mjs`, `search/probe.json`

111 sites publish a schema.org SearchAction. The tool fills each site's template with a nonsense control query,
"Canary Wharf" and "E14 5AB", fetches each result page once (robots.txt, the project User-Agent, 1.1 s per host), and
counts only what a place query adds over the control. Without the control every site "finds" Canary Wharf, because
menus and footers name it on every page. Asset links (`/cdn/…css`, `wp-content`) are not results.

- 68 sites use the WordPress default (`?s={search_term_string}`), written by an SEO plugin: post and page search,
  not branch search. One template points at a store finder (Nando's), and it answers 403.
- Result on 2026-10-06: finds a branch, location or menu page 18; other place content 44; no place result 17;
  robots.txt disallows 18 (most large retailers); results drawn by script 8; blocked 3; 202 with no page 2.
- 48 of the 51 branch-like hits are not in the harvest (`hits_new`): seeds for the next crawl. Checked by hand: about a
  third are blog or news posts.
- The postcode finds fewer new links than the place name on 36 sites, the same on 49 and more on 3.
- No template takes a location, and the result pages carry no branch markup. Use site search to find pages, never as
  a store finder. The store-finder exception (postcode forms) is a different route; see "What is allowed".
- `--offline` re-reads the cached result pages in `data/raw/site-search/`: change the counting rules without new requests.

## Mall plans (2026-10-06): `tools/mall-plan-evidence.mjs`

The CWG directory gives mall and level (signage number) for 209 of 223 mall occupants, but no unit number and no
position. The tool matches each one by name to an OSM point within 250 m of the mall anchor: 105 placed (47%), 90 with
an OSM level, 38 with `addr:unit`. Around the malls OSM has 506 levelled footways and indoor ways, and only 3
`indoor=room` ways. From open sources alone, a draft plan per level is possible (corridors plus about half the shops
as points). Unit outlines exist in two non-open sources found later the same day (below).

- Levels (fault F48): around the estate OSM `level` is the physical level and `level:ref` the CWG number. Compare the
  CWG level with `level:ref` first. Then 81 of 88 placed occupants agree.
- A chain with two branches within 250 m can match the wrong one: the nearest is taken.
- On 2026-10-06 web.archive.org and index.commoncrawl.org reset every connection from the container (agent-proxy
  `ws_closed_mid_exchange`, in `/__agentproxy/status` as `recentRelayFailures`). A later session may reach them.

### The CWG printed maps (owner, 2026-10-06): danbri/londat `third_party/cwg/maps/`

The owner downloaded the PDFs on https://canarywharf.com/maps/ by hand (the site challenges scripts) and asked for
them in londat: https://github.com/danbri/londat/tree/main/third_party/cwg (README with rights and status,
`manifest.json` with SHA-256, pages and dates). Source `cwg-maps`; manual step `cwg-maps-pdfs` in pipeline.json.
- `260720_store_guide_JULY_composite_v85_vec.pdf` (20 July 2026, 2 pages, Illustrator): p. 1 "Shopping Malls", a
  schematic plan of the five malls by level with unit outlines, colour per mall, and an index giving each shop its grid
  squares ("Boots 10C, 10H"; rows 1-16, columns A-Q); p. 2 "Canary Wharf Estate", street retail and office tenants on
  a 23 x 10 grid and the buildings by postal address. **All text is vector outlines** (`pdftotext` gives 0 words):
  read names by eye or OCR (render with `pdftoppm -r 150`); never guess a name from a shape.
- `AccesibilityMap_MAY-2025_v2.pdf` (step-free access: lifts, toilets in and outside the malls, ramps, car parks;
  has a text layer), children's art trail (June 2025, 3 pages), art guide (April 2025, 20 pages, over 100 artworks).
- Design © Ravenshaw Studios Limited and Paul & Linda Anthony 2026, for CWG. Facts only into `cwplans/`; the PDFs stay
  in `third_party/`, which the Pages workflow does not publish.

### The Living Map service behind map.canarywharf.com (probed 2026-10-06, not harvested)

`node cwplans/tools/probe-cwg-map.mjs` loads the page twice in headless Chromium (needs the NSS proxy CA fix
below) and logs every request to `data/raw/cwg-map/requests.json` (not committed). robots.txt allows all. The page is
a React app on Mapbox GL; its data comes from Living Map (livingmap.com):
- `GET https://map-api.prod.livingmap.com/v1/maps?host=map.canarywharf.com`: map config: floors (id, `floor` -4.0 to
  2.0, names "Level -4" to "Level 2", "Level -1M" at -0.5 and "Level M" at 0.5), centre, extents, languages, routing options, and
  an `access_token` (a public Mapbox key; do not copy it into the repo).
- `GET .../v1/maps/canary_wharf/feature-objects?lang=en-GB`: 536 named places (title, point, `floorId`).
- `GET .../v1/maps/canary_wharf/styles/styles.json`, `.../geofences`; `POST .../sessions` and `.../sessions/<id>/events`
  are the page's own usage logging: do not call them.
- Vector tiles `https://prod.cdn.livingmap.com/tiles/canary_wharf/{z}/{x}/{y}.pbf?lang=en-GB` (z16 seen; one central
  tile is 1 MB), layers `indoor` and `outdoor`. `indoor` holds unit **polygons** per floor with `name`, `class`
  (retail, food_and_drink, ...), `location_name` (the mall), `floor_id`, `floor_level`, `floor_name`, `opening_times`
  ("mon: 07:30 - 20:00, ..."), `tel_number`, `street_address`, `url`, plus lifts, escalators and corridors. In the 22
  tiles of one page load: 1,094 indoor polygons, 475 named (Cabot Place 95, Jubilee Place 73, Canada Place 72,
  Crossrail Place 28), 334 with opening times, 173 with a telephone. Decode with `@mapbox/vector-tile` and `pbf`.
- No key, no cookie; every answer sends `Access-Control-Allow-Origin: *`. No published licence or terms found
  (source `livingmap-cwg`).
- `/v1/maps/canary_wharf/features` is a name search (`long_name`, `latitude`, `longitude`, `floor_id`), not a full
  list: without `long_name` it returns the nearest 100. The full records come from one call per name in
  `feature-names`. Other GET endpoints in the app: `features/{id}`, `features-uid/{uid}`, `search?query=`,
  `search/tag/{id}`. Routing is a POST.
- **Archived as served (owner, 2026-10-06: "Archive everything including all map tiles into a mallmap subfolder, as
  is. It can be used for reference and exploring physical accessibility designs for large pseudo-public spaces."):**
  `tools/archive-cwg-mallmap.mjs` writes https://github.com/danbri/londat/tree/main/third_party/cwg/mallmap (README,
  manifest with SHA-256 per URL). Indoor tiles zoom 0-19 and basemap zoom 0-16 over the config extents (5,747 tile
  URLs), API answers, sprite, popup images, the app. The basemap is OSM-derived (ODbL). Not archived: Gotham glyphs
  (commercial font), usage-logging POSTs. Restartable; `--only=tiles|api|media|app`.
- **GitHub push protection** refused the archive: `api/maps.json` holds the page's Mapbox `access_token`, flagged as
  a "Mapbox Secret Access Token". The committed copy has that one value replaced by a note (text replacement, every
  other byte as served); the manifest keeps `sha256_as_served` and `bytes_as_served`. The owner can allow the original
  through the unblock link GitHub prints. A `git push -q` in a retry loop hid this refusal: read push output.
- The archive ended with 6,515 URLs: 1,493 indoor tiles with data, 4,101 empty (204), 152 basemap tiles, one basemap
  tile (zoom 7) that answered 503 on three runs, 520 API answers, 237 images, 240 MB. `tools/cwg-mallmap-tmi.mjs`
  normalises it into `_TMI/mallmap/` (GeoJSON per floor, whole geometries for 10,088 of 10,092 features).
- The style's indoor source declares `maxzoom` 19; the page opens at zoom 16. A z17 tile over Canada Square is
  420 kB, a z19 tile about 11 kB.

## What the markup is for (report of 2026-10-06)

Read before you decide what to extract or how much to trust a field. Counts from the rdflib pass of 2026-10-06.
- 65,566 quads from 824 pages (455 live pages on 378 sites, 369 archived canarywharf.com pages). JSON-LD carries almost
  all schema.org content (695 pages); microdata is mostly theme markup (WPHeader, SiteNavigationElement); RDFa is
  Open Graph, with schema.org in RDFa on one page only.
- Most nodes are site furniture written by SEO plugins: WebSite, WebPage, BreadcrumbList, SearchAction, ImageObject.
  They give a site name, page dates and a section path, little about the business.
- The useful entities: Organization (161 sites: name, url, logo, sameAs on 83 to 96% of nodes, an address on only 10%)
  and LocalBusiness with its subtypes (109 sites, 209 place descriptions). Only 69 of the 209 have name, structured
  address, telephone and hours together. Events are almost absent (1 site).
- What each pattern is written for, and whether it still pays (platform documentation as known on 2026-10-06; check
  before you depend on it): SearchAction is for the Google sitelinks search box, retired late 2024, still written by
  plugins (111 sites). BreadcrumbList: breadcrumb trail, desktop only since early 2025. Organization with logo and
  sameAs: logo and knowledge panel. LocalBusiness with address, geo, hours, telephone: local details, a secondary
  signal behind Google Business Profile. Self-published AggregateRating on a business: not shown by Google since 2019.
  FAQPage: limited to government and health sites since 2023. Product and Offer: product snippets.
- So: trust LocalBusiness facts as the publisher's own statement, expect plugin defaults (F47), and treat ratings and
  FAQs as marketing.

## Reports

| Report | On the site | Private artifact (owner) | How it is made |
|---|---|---|---|
| schema.org data: entities, search features, idioms, same-thing groups | https://danbri.github.io/londat/cwplans/reports/schema-org/ | https://claude.ai/artifact/8syFhnR1EaJEmJJQdqLmn5 | a snapshot (`reports/schema-org/index.html`), not rebuilt |
| site search, opening hours by mall, mall plans | https://danbri.github.io/londat/cwplans/reports/hours-and-plans/ | https://claude.ai/artifact/HX1DxWzvEvkXTnTauGGWFC | `node cwplans/reports/hours-and-plans/build.cjs` from the committed JSON (template.html + build.cjs) |

After a rebuild, republish the artifact with the Artifact tool, passing the artifact URL above as `url` (read it
first); the repo copy is the source. The report pages are not in the atlas or the 3D page.

## What is committed (`third_party/cwplans-structured-data/`)

**No full pages.** `pages/<host>.jsonl` (one line per rendered page: URL, final URL, status, method, title, lang,
`html_sha256`, entity keys, source fields, `jsonld_raw` and origin, `microdata`, `rdfa_ntriples`, `via`,
`consent_clicked`), `index.json` (every URL with its outcome, counts, store-finder runs), `all.nq.gz`, README. The
rendered DOMs stay in `cwplans/data/raw/rendered/` (gitignored). It is the site owners' data published for search
engines, kept for scoping under the crawl rule.

## Attribution: branch, chain, organisation (`tools/extract-structured-data.mjs`)

A node is attributed to the Canary Wharf entity:

| scope, confidence | when |
|---|---|
| branch, high | the node's postcode equals the entity's, or its geo is within 300 m of the building |
| branch, low | another E14/E20 postcode (and within 1.5 km when it has a geo): a sibling branch is possible |
| elsewhere | an address or geo anywhere else: not attributed (224 nodes on 2026-10-03) |
| branch, medium | no address, on the branch's own page (a `store_url`, a store-finder result, a URL path naming the place) |
| chain | no address, on a general page of a chain |
| organisation | no address, on a single-site organisation's own site |

Bank and head-office pages carry the head-office address in Canary Wharf: a postcode match there is the head office,
not a branch. Out: `registry/sources/web/structured-facts.json`: 232 records for 210 keys; branch 185 (high 143,
medium 19, low 23), chain 22, organisation 25; opening hours for 109 keys at branch scope (95 high), phone for 126.

## Joining facts to occupants (`tools/join-web-facts.mjs`)

Keys: `cwb-NNNN|<occupant name>` (normalised), `branch:<brand QID>@<element>` (the occupant's OSM element, the
building's OSM way, `fhrs/<FSA id>` or a bare FSA id, `cwg/<slug>`), `charity:<number>`, `cwg:<directory slug>`.
Rank: branch beats organisation beats chain, then high > medium > low. Writes `occupants[].web` (page, fetch date,
scope, confidence, match, opening_hours in OSM syntax, phone, price range, cuisine, menu, up to 20 events) and
`summary.joins.web_facts`. On 2026-10-04 the registry holds 93 occupants with web facts: hours 70 (64 at branch scope),
phone 75, events 1; 14 fact records match no occupant.

## Opening hours
- CWG directory pages (2026-10-06, `tools/cwg-hours.mjs`): each archived page has a seven-row hours table ("mon: 9am
  - 8pm", "Closed", "Open 24hrs", "Coming Soon"). Read for 332 of 374 (328 whole, 4 with a typo row left out: "109am",
  "4m", "12pm - 10", "22:30pm"); 6 coming soon; 34 with no table. All 332 parse in `docklands/opening-hours.js`.
  The hours are as on the archive date.
- `tools/hours-by-place.mjs` puts every hours source on a 336-slot week and compares malls within one kind of place.
  Result on 2026-10-06: the mall explains 15% of the spread in weekday closing time (permutation p = 0.015) and 12% of
  hours per week (p = 0.085); mall or street explains 3%. Shops in Cabot Place and Canada Place close at 20:00, in
  Jubilee Place at 19:00. Restaurants at street level, in Wood Wharf and in Crossrail Place close at 22:00 to 22:30.
  Sources agree well (median overlap 0.9 or more). The exception is F47: a fixed "Mo-Su 09:00-17:00" on five sites.
- Parsed addresses: a postcode unit in the CWG list points at one mall in most units (E14 5NY Jubilee Place 95%,
  E14 5AH Canada Place 97%, E14 4QT Cabot Place 90%). 41 web branches have a parsed postcode and hours. 17 of the 35
  in E14/E16 get a CWG location from it, 14 of them one of the five malls.


- In the wild: `openingHours` text ("Mo-Fr 09:00-17:00", "Monday,Tuesday 09:00-17:00", "Friday06:30-20:00", empty
  strings, ", , , ,"), specifications with "13:00 PM", "9:30am", "6pm", days with no times, special hours dated
  "26 Nov 2026". Empty or comma-only text is no hours. The extractor writes OSM `opening_hours` syntax; all 54
  distinct strings it made parsed in the `opening_hours` library (a one-off check outside the repo, 2026-10-03).
- `docklands/opening-hours.js` (used by the 3D page and the atlas) reads a subset: day lists and ranges, times and time
  lists, `off`/`closed`, `24/7`, times past midnight, rules joined by `,` or `;` (a later rule for a day replaces an
  earlier one; `,` starts a new rule only after a time or `off` and before a day or date), and dated rules
  (`2026 Nov 26 16:00-02:00`). `PH` is read and not applied (no UK holiday table). Times are London local time,
  whatever the viewer's zone. `openState(text, date)` returns `{ open, until | from }`, or `null` for a form it does
  not know: show nothing then, never a guess. Checked 2026-10-04: it reads all 156 distinct strings in
  `registry/buildings.json` (OSM tags and web facts).

## Chromium behind the agent proxy

The NSS store `/root/.pki/nssdb` started empty, and every HTTPS page failed with `ERR_CERT_AUTHORITY_INVALID`.
Fix (`apt-get install -y libnss3-tools` if `certutil` is missing):

    certutil -d sql:/root/.pki/nssdb -A -t "C,," -n ccr-agent-proxy -i /root/.ccr/agent-proxy-ca.crt
    certutil -d sql:/root/.pki/nssdb -L        # check; on 2026-10-04 it listed ccr-agent-proxy and ccr-agent-proxy-2

A new container can bring a new CA file: add it again under a new nickname. Chromium takes the proxy from the
environment.

## Open (2026-10-06)

- Mall plans: decode the archived Living Map tiles (londat `third_party/cwg/mallmap/tiles/indoor/`) into unit polygons
  per floor and join them to the CWG directory (name, mall, level); compare their opening times with `cwg-hours.json`;
  study step-free routes (lifts, ramps, escalators per floor) against the step-free access map PDF.
- Crawl the 48 site-search hits that are not in the harvest (`search/probe.json`, `hits_new`), branch pages first.
- Mall plans without a new source: snap each placed point to the nearest corridor on its level and order shops along
  each corridor (a schematic plan, which shop is next to which).
- F47 rule: do not use a web value of exactly 09:00-17:00 every day when another source gives other hours.
- File the Factoidal issue (above) and write its URL here.
- From 2026-10-04: store finders for the 100 brands with no finder link and the 50 finders with no postcode box;
  verify the 61 discovered feeds. Done 2026-10-06: the check for web hours that disagree with OSM
  (`hours-by-place.json`, `agreement`).
