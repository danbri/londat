# Web: facts from the pages the registry links to

One registry source: the web pages that the registry and the brand sources already link to (occupant
websites, brand store pages, the Canary Wharf Group directory), fetched on 2026-10-03, with the structured
facts each page states about itself. Crawl for scoping, allowed by the owner (2026-10-03: "Website crawls -
direct and via IA or CommonCrawl etc are fair use for our scoping purposes."). Only short fields are kept;
re-check before anything leaves the prototyping phase.

| file | what it holds |
|---|---|
| `site-facts.json` | `meta` (method, date, counts, URL references by source, skipped references, robots-disallowed URLs, failures by class) and `pages`: one record per URL with `url`, `final_url`, `status`, `fetched`, `for` (the entries it serves), `sources` (the fields that named it), `archived` (Internet Archive copies), `error`, `facts`, `feeds`, `events` |
| `discovered-feeds.json` | RSS, Atom, JSON Feed and iCalendar URLs found in the pages and not yet in `feeds/events.json` or `feeds/feeds.json`. **Not fetched or verified**: check each with `feeds/check-events.mjs` before it joins `feeds/events.json` |
| `register-entries.json` | data-register and pipeline entries for this crawl, for the main session to merge |
| `structured-facts.json` | facts from the schema.org structured data of the rendered pages (`tools/extract-structured-data.mjs` over `third_party/cwplans-structured-data/`): per entity and page the types, name, opening hours (raw, specification, special, and OSM `opening_hours` syntax), telephone, address, geo, events, and the scope (branch with a confidence, chain, organisation) with how the node was matched |
| `structured-register-entries.json` | data-register and pipeline entries for the headless render and the extraction, for the main session to merge |

Tool: `NODE_USE_ENV_PROXY=1 node cwplans/tools/crawl-sites.mjs` (`--list` counts URLs without
fetching, `--no-fetch` extracts from the cache, `--retry-failed` fetches transient failures again,
`--refresh` fetches all, `--host=h` tests one host). Raw pages: `data/raw/crawl/<host>/<sha1(url)[0:16]>.html.gz`
with a `.json` record beside each and `robots.json` per host (not committed, 40 MB).

## Keys in `for`

- `cwb-0411|Aesop`: registry building id and occupant name (`registry/buildings.json`).
- `branch:Q4688560@node/11748160459`: brand Wikidata id and the branch's OSM id, else `fhrs/<id>`,
  `cwg/<slug>` or the Wikidata item (`registry/sources/brands/branches.json`, `storelocator.json`).
- `cwg:aesop`: Canary Wharf Group directory slug (`registry/sources/brands/cwg-directory.json`).

## Method

- URLs: `occupants[].website`, `.store_url`, `.cwg_archived` (buildings.json); `website`, `cwg_website`,
  `store_url`, `cwg_archived` (branches.json); `checked[].store_url` (storelocator.json); `website` and
  `archived` (cwg-directory.json). 859 distinct URLs on 393 hosts.
- Skipped, by rule: FSA ratings pages (445 references; the data comes from the FSA API), OSM element pages,
  Wikidata, Companies House and Land Registry search pages (the data comes from the extract, QLever and the
  bulk files), Wikipedia (30; CC BY-SA, share-alike), canarywharf.com links with no archived copy (24), CWG
  entries with no archived copy (5).
- canarywharf.com answers scripts with an Imperva challenge, so its pages are read as Internet Archive
  `id_` copies. All 369 were already saved by `registry/sources/brands/tools/fetch-cwg.mjs` earlier on
  2026-10-03 and were reused, so the crawl made no request to web.archive.org (a test at 15:43 UTC
  that day found that web.archive.org reset every connection from this container). A canarywharf.com URL found in a `website` field is mapped to its archived copy.
- Politeness: robots.txt per host (RFC 9309: our token `glitchcan-cwplans`, else `*`; longest match wins;
  a 4xx robots.txt allows all; a 5xx or unreachable one disallows all), checked again on every redirect to a
  new host. One request at a time per host, at least 1.5 s apart, at most 4 hosts at once, 20 s timeout,
  up to 4 tries with backoff (Retry-After, else 4, 12, 36 s) on 429, 5xx, timeouts and resets. User-Agent
  `glitchcan-cwplans/0.1 (https://github.com/danbri/londat)`. Redirects followed by hand; the
  final URL is recorded.
- Extracted (`facts`): schema.org JSON-LD and microdata, as `entities` (businesses and organisations: name,
  telephone, address, geo, opening hours, price range, cuisine, menu, reservations, sameAs) and `events`
  (name, start, end, location, URL); `schema_types`; page `title` and OpenGraph title and type (cut to 200
  characters) and OpenGraph description (cut to 200 characters); `lang` (html lang, else the header);
  `telephone_links` (tel: links); `links.booking`, `links.menu`, `links.events` (at most 8 each, by URL path,
  link text, or a booking or ticket host); `feeds` (`<link rel=alternate>` RSS, Atom, JSON Feed, iCalendar;
  `.ics`, `webcal:`, `.rss`, `/feed/` links; WordPress comment feeds left out). No other page text is kept.
- `names_location` / `names_branch`: does the page name the entry's Canary Wharf place? The entry's
  postcodes and address phrases (street, mall, branch name; numbers, unit and level words and generic
  names such as "Canary Wharf" or "London" removed) are searched in the visible text and the structured
  data. `names_branch` is `true` for a postcode, or for a phrase on a page that is not the site's home
  page; `"home page lists the place"` for a phrase only on a home page; `"scripts only"` when the match is
  only inside page scripts; `false` otherwise. `mentions_canary_wharf` is reported separately and is not
  evidence: a chain's home page is not evidence for the branch.

## Counts (2026-10-03)

| | Internet Archive CWG pages | direct pages | all |
|---|---|---|---|
| URLs | 369 | 490 | 859 |
| HTML read | 369 | 368 | 737 |
| with JSON-LD | 369 (Yoast site markup) | 246 | 615 |
| with microdata | 0 | 55 | 55 |
| a business with opening hours | 0 | 61 | 61 |
| a business with a telephone | 0 | 77 | 77 |
| tel: links | 172 | 109 | 281 |
| with schema.org events | 0 | 1 (6 events) | 1 |
| names the branch (`true`) | 365 | 154 | 519 |
| home page lists the place / scripts only | 0 / 0 | 17 / 7 | |
| mentions Canary Wharf only | 4 | 43 | |
| booking / menu / events links | 4 / 2 / 369 (site menu) | 145 / 155 / 68 | |

Direct pages: 235 of 368 are site home pages. Of the 61 with opening hours, 48 name the branch.
Entries with at least one page that names them: branches 174 of 203 (65 by a direct page), occupants 386
of 467 (94 direct), CWG entries 360 of 364 (69 direct).

Not read (122): bot challenge 59, 401/403 refused 15, 404/410 18, TLS 10 (certificate for another host,
or handshake refused; checked with curl), timeout 7, DNS 4, robots.txt disallows 4 (riverdrycleaners.co.uk,
facebook.com, londongrace.co.uk, uk.loccitane.com), 429 2, connection 2, 5xx 1.

Feeds: 61 new (55 RSS, 5 Atom, 1 iCalendar: `https://zata.uk/events/?ical=1`), none already catalogued.
`https://canarywharf.com/feed/` is on every archived CWG page. Two are GOV.UK organisation Atom feeds
(CMA, Olympic Delivery Authority).

Time: 686 s for the first pass and 317 s for the retry of transient failures (about 17 minutes).
URL counts moved between the two passes (853 → 859) because `registry/buildings.json` was rebuilt by
another session in between; the retry fetched the new URLs.

## Known limits

- Many chain sites render store pages with scripts; a page with no facts may still have them in a browser.
- `names_branch` is a text match: a postcode shared by many buildings (E14 5AB and others) can match a page
  about a different branch at the same postcode. Treat it as evidence, not proof.
- CWG archived pages are mostly November 2025 copies; their facts are as of the capture, not today.
