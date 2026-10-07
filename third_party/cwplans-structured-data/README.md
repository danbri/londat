# cwplans structured data (schema.org from rendered web pages)

The schema.org structured data that the web pages of the entities tracked by the Canary Wharf / Docklands project
(`magpie/cwplans/`) publish about themselves: JSON-LD, HTML microdata and RDFa. This is the site owners' data,
published for search engines. It is kept here for scoping, under the owner's crawl rule (2026-10-03: "Website crawls -
direct and via IA or CommonCrawl etc are fair use for our scoping purposes."). Re-check it before anything leaves
the prototyping phase. **The full pages are not stored here**: only the structured-data blocks, the page title, the
final URL, the HTTP status and a SHA-256 of the rendered HTML (the rendered pages stay in the gitignored
`magpie/cwplans/data/raw/rendered/`).

## Files

| file | what it holds |
|---|---|
| `pages/<host>.jsonl` | one line per page that rendered: `url`, `final_url`, `fetched`, `status`, `method`, `title`, `lang`, `html_sha256`, `entity_keys` (the registry entries that link to the page), `sources` (the fields that named it), `jsonld_raw` (each `<script type="application/ld+json">` text as found in the rendered DOM), `jsonld_origin` (`server` when the same text is in the server HTML, `script` when only scripts made it or changed it), `microdata` (items as JSON: `type`, `id`, `properties`), `microdata_origin`, `rdfa_ntriples` (RDFa as N-Triples, page URL as base), `rdfa_script_only_triples`, `via` (store-finder pages: how they were reached), `consent_clicked` |
| `index.json` | every URL in scope with its outcome (status, failure class, block counts), the counts, the store-finder runs, the URL references by source field and the skipped references |
| `all.nq.gz` | all of it as RDF N-Quads (gzipped; the tool also writes `all.nq`, 12 MB, which is not committed), one named graph per page (graph IRI = page URL), made by `extract-structured-data.mjs` after cleaning the JSON-LD; `http://schema.org/` normalised to `https://schema.org/` |

Entity keys: `cwb-0411|Aesop` (registry building and occupant), `branch:<brand QID>@<OSM id | fhrs/<id> | cwg/<slug>>`
(chain branch), `cwg:<slug>` (Canary Wharf Group directory), `charity:<number>` (Charity Commission register).

## Method (2026-10-03)

- URLs: every entity URL the project tracks: `registry/buildings.json` occupants (`website`, `contact:website`,
  `cwg_website`, `store_url`), `registry/sources/brands/branches.json` (`website`, `cwg_website`, `store_url`),
  `storelocator.json` (`store_url`), `cwg-directory.json` (`website`), and the `website` of registered charities in
  `registry/sources/registers/charities.json`. Skipped: FSA ratings pages, OSM, Wikidata, Wikipedia (share-alike),
  Companies House, Land Registry, register pages, social networks, and the live canarywharf.com (it blocks scripts).
  Order: store pages first, then pages the plain crawl (`site-facts.json`) got no structured data from, then the rest.
- Rendering: headless Chromium (Playwright), User-Agent a desktop Chrome string plus
  ` glitchcan-cwplans/0.1 (+https://github.com/danbri/glitchcan-minigam)`; images, media and fonts not loaded;
  robots.txt obeyed (RFC 9309, token `glitchcan-cwplans`, checked for every page navigation and redirect; an
  unreachable robots.txt means no visit); at most 3 pages at once, one page at a time per host, at least 2 s between
  page loads on a host; wait for load and network idle (20 s cap), then 1.5 s for late JSON-LD. A cookie banner was
  accepted only when a page showed no structured data and had a known consent button. No logins.
- Store finders (owner, 2026-10-03: "we are permitted per industry convention to submit storefinder forms with UK
  postcodes"): for chain branches with no store page that gave data, the brand site (Wikidata P856, else the branch
  website) was searched for a store-finder link; a finder page that already lists the branch was followed with no
  form; else the branch's postcode (E14 4QT when the branch has none) was typed into the finder's search box, and the
  result link that names the branch's postcode, street or mall was followed. One search per brand and postcode.
  Those pages carry `via` (`storefinder-list` or `storefinder-search`, the postcode, the finder URL).
- Internet Archive copies of canarywharf.com directory pages (fetched earlier by `fetch-cwg.mjs`) were read from the
  local cache with scripts off and no network.
- Microdata follows the WHATWG HTML microdata algorithm (`itemref` followed; a `content` attribute on any itemprop
  element is used, as search engines do). RDFa follows RDFa 1.1 Core processing with the HTML+RDFa rules (initial
  context prefixes such as `og:` and `schema:`; HTML link types in `rel` ignored when `property` is present).
- Blocks over 200 kB are dropped and counted (`index.json` `counts.blocks_dropped_over_200kB`).

## Rebuild

    NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/render-structured-data.mjs                 # render (resumable)
    NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/render-structured-data.mjs --retry-failed  # transient failures again
    NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/render-structured-data.mjs --storefinder-only
    node magpie/cwplans/tools/render-structured-data.mjs --build-only                        # this folder, no network
    node magpie/cwplans/tools/extract-structured-data.mjs                                    # all.nq(.gz) + registry/sources/web/structured-facts.json

Chromium needs the proxy CA in its NSS store in the cloud container (see the curation skill).
Method, lessons and limits: `magpie/cwplans/skills/docklands-data-curation/SKILL.md`, "Structured data from rendered pages".
