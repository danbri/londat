---
name: cwplans-feed-discovery
description: >-
  Find London RSS, Atom, JSON Feed and iCalendar feeds at scale for cwplans and verify them: the tool
  tools/discover-feeds.mjs (stages seed, cc, autodiscover, verify, build), every discovery method and its rules
  (the earlier site crawl's 61 feeds, ooh.directory OPML, GitHub lists, Feedspot London lists, Wikipedia category and
  list to Wikidata P856 websites, the ICNN member map, hand lists of local news, hyperlocal, community, faith, school
  and venue sites, London borough ModernGov RSS, council and public-body pages, the GLA feed list, Mastodon hashtag
  feeds, Bluesky organisation accounts, Lemmy communities, groups.io search, Meetup iCal, and Common Crawl's columnar
  index read over HTTPS with range requests plus WARC records), politeness (robots.txt on every host and redirect, one
  request at a time per host >= 1 s apart), the zone-relevance counts (no item text kept), the merge rule into
  feeds/events.json (harvest: false so tools/fetch-works.mjs does not read news as programmes), the OPML export, and
  what is excluded and why (Facebook, Nextdoor, WhatsApp, X, Google Groups, Reddit by robots.txt, groups.io feeds by
  robots.txt, JISCMail behind Cloudflare, Meetup RSS). Reach for it before you look for more London feeds, refresh or
  extend feeds/discovery/, add a feed directory or social platform, or answer "where is a big stash of London feeds?".
---

# London feed discovery (cwplans)

Owner, 2026-10-04: "where we can find a huge stash of London-related rss/Atom feeds? Forums, mailing lists, FB groups
etc.?" Policy, the fault register and the activity log are in the hub skill `docklands-data-curation`; crawls (direct,
Internet Archive, Common Crawl) are allowed for scoping (owner, 2026-10-03). Append each session to its `ACTIVITY-LOG.md`.

Output: https://github.com/danbri/londat/blob/main/cwplans/feeds/discovery/README.md
(`candidates.json`, `london-feeds.opml`); verified zone feeds also go into `feeds/events.json`
(https://danbri.github.io/londat/cwplans/feeds/ shows them).

## Run

    NODE_USE_ENV_PROXY=1 node cwplans/tools/discover-feeds.mjs seed          # directories, lists, hand lists (about 4 min)
    npm i --prefix /tmp/cclibs hyparquet hyparquet-compressors                      # once; not a project dependency
    CC_LIBS=/tmp/cclibs NODE_USE_ENV_PROXY=1 node cwplans/tools/discover-feeds.mjs cc
    NODE_USE_ENV_PROXY=1 node cwplans/tools/discover-feeds.mjs autodiscover  # home pages -> <link rel=alternate>
    NODE_USE_ENV_PROXY=1 node cwplans/tools/discover-feeds.mjs verify        # every feed: fetch, parse, count, CORS
    node cwplans/tools/discover-feeds.mjs build [--no-merge]                 # no network; writes the outputs
    node cwplans/tools/check-data-register.mjs --write

Stage results are cached in `data/raw/feed-discovery/` (gitignored): `seeds.json`, `cc-footers-<crawl>.json`,
`cc-feeds.json`, `autodiscover.json`, `verify.json`, `robots.json`. Delete a file, or pass `--refresh`, to redo a stage.
Without `NODE_USE_ENV_PROXY=1` Node fetch ignores the proxy here.

## Methods (each candidate keeps `found_by` and `sources`)

| found_by | how | rule |
|---|---|---|
| `site-crawl` | `registry/sources/web/discovered-feeds.json` (61 feeds from `tools/crawl-sites.mjs`) | verified like every other feed |
| `ooh-directory` | ooh.directory OPML exports of "London" and "Areas of London" | robots.txt allows all |
| `github-list` | GitHub code search (`london extension:opml`, `ianvisits extension:opml`, `londonist.com/feed`): feeeed-db (a mirror of ooh.directory) and AlbertAlert `data/sources/london/context.json` | neither repo has a licence file: URLs as facts only |
| `feedspot` | 22 guessed list slugs on rss.feedspot.com; 13 exist; only the feed link (`a.ext.wb-ba`) per entry | Feedspot copyright: URLs as facts |
| `wikipedia-wikidata` | Category:London newspapers + List of newspapers in London (MediaWiki API, titles) -> pageprops QID -> one SPARQL query for P856 without P576 (QLever, paced by `lib.mjs`; WDQS fallback) | titles only (CC BY-SA text never kept); P856 is CC0. robots.txt "Disallow: /w/" is for page crawlers: not applied to the Action API, which is used with a descriptive User-Agent, one call at a time, retry on 429 |
| `icnn-map` | ICNN interactive member map, Google My Maps KML export (`/maps/d/kml?mid=...&forcekml=1`), members inside a Greater London box | the members page itself has no list (script) |
| `hand-local-news`, `hand-community` | named publishers from the brief; zone community, faith, school and venue sites (web search) | `zone: true` marks publishers in or beside the zone |
| `moderngov` | the `mgRss.aspx` pattern on 31 London ModernGov hosts | many ModernGov robots.txt files disallow it: see below |
| `council-sites`, `public-bodies` | council news and Citizen Space pages; TfL, PLA, CRT, LCY, river bus; every feed on https://www.london.gov.uk/rss-feeds (former members' feeds, vacancies and school profiles left out) | |
| `mastodon` | `/tags/<tag>.rss` on mastodon.social and mastodon.london for 12 zone tags | counts only, no titles (posts of private people) |
| `bluesky` | `public.api.bsky.app` searchActors for 12 terms; keep a handle only when it is a registrable domain under .gov.uk, .nhs.uk, .police.uk, .ac.uk, .sch.uk or .london, or the domain of a publisher already found | first draft kept `.org` and `.org.uk` and caught private people (a councillor's subdomain, personal domains): tightened |
| `lemmy` | feddit.uk API community search "london" -> `/feeds/c/<name>.xml` | |
| `groups-io` | the public search page for 7 terms (allowed): group name, URL, archive public/private | feeds not fetched (robots.txt) |
| `reddit` | subreddit and search RSS URLs | not fetched (robots.txt Disallow: /) |
| `meetup` | group iCal (allowed) | RSS and Atom disallowed by robots.txt |
| `common-crawl` | see below | |

Autodiscovery reads each page once (robots.txt checked) and takes `<link rel="alternate">` RSS, Atom and JSON Feed
links (comment feeds dropped) and up to three `.ics` / webcal links; a hand-listed page with none is tried at
`/feed/`, `/rss.xml`, `/feed.xml`, `/rss`, `/news/rss/` until one parses. At most three feeds per page are kept.

## Common Crawl (one crawl, sampled)

The CDX server (index.commoncrawl.org) answered 504, reset or empty on 2026-10-04; the columnar index on
data.commoncrawl.org answered. So:
1. `crawl-data/CC-MAIN-2026-39/cc-index-table.paths.gz` -> the 300 `subset=warc` Parquet parts; footer of each
   (cached): url_surtkey min and max per row group. The parts are NOT in surt order by file name (part 0 holds
   `com,blogspot`, part 299 `cn,`): read every footer.
2. Row groups whose surt range covers `london,` (1) or `uk,` (33). Read only `url_host_name` there (about 16 MB for
   47 million .uk rows: the column is dictionary-encoded and sorted).
3. Hosts: every `.london` host (2,592), and `.uk` hosts whose name matches a London place (zone places, the five
   boroughs, or "london": 8,157). Deterministic sample by sha1(host): .london 200, zone-place .uk all (cap 500),
   borough .uk 100, "london" .uk 200.
4. The first capture of each host (surt order puts "/" first) with status 200 and an HTML MIME type: six small columns
   of each row group read as whole chunks (a few large range requests; `useOffsetIndex` single-row reads cost about
   0.45 MB and 15 requests each).
5. Its WARC record (one range request), `<link rel=alternate>` feeds, kept only when the page says "London" or has a
   London postcode (.london pages always). Every request to data.commoncrawl.org is queued one at a time, >= 1 s apart,
   with retries on 403/429/5xx: the first run sent column reads in parallel and CloudFront answered 403.

## Verification and scores

`verify` fetches every feed (robots.txt on every host and redirect; one request at a time per host, >= 1 s apart;
8 hosts at once; 30 s timeout; up to 3 tries on 429 and 503), parses RSS, Atom, RDF, JSON Feed and ICS, then sends a
second request with `Origin: https://danbri.github.io` for CORS. Statuses: verified, empty, not a feed, http error,
network error, blocked (Cloudflare, SiteGround, Imperva, Azure WAF pages), robots disallowed, robots unreachable,
not fetched (terms). `live` = verified with an item dated within 365 days.

Relevance counts every item's title, summary, content and categories: `zone_items` (zone place names and the E14,
SE16, SE10, SE8, E16, E1W districts), `zone_recent_items` (dated within 120 days), `borough_items`, `london_items`;
`score = 3 x zone_recent + zone + 5 x share`. Only counts are stored; `title_sample` holds at most two titles cut to
80 characters, and none for social, forum and mailing-list feeds. Traps: hashtag feeds match their own tag by
construction (listed apart from the best 20); "Greenwich" also matches Greenwich Village and Greenwich Mean Time;
"Poplar" a tree; a shop blog whose footer names Canary Wharf scores 100% (Ross Watch Repairs).

## Merge into events.json

Re-read `feeds/events.json` immediately before writing; append only; ids `disc-<slug>`; category `rss-atom` or
`ical`, `subject` = kind, `notes` = methods and zone counts; `counts` recomputed. A candidate goes in when live, not
already in events.json or feeds.json, and (a zone item, a zone publisher, or a council or transport body); social
feeds only with zone items. Every entry except kind `events` gets `harvest: false`, because `tools/fetch-works.mjs`
harvests every verified event feed in events.json at run time and would read news feeds as programmes.

## Findings that correct earlier text

- Time Out London has a feed (`/london/blog/feed.rss`); `events.json` excluded it as "no API or feed" on 2026-10-03.
- Many ModernGov hosts disallow `mgRss.aspx` in robots.txt (Southwark, Lambeth, Redbridge, Wandsworth, Hounslow,
  Bromley, City of London); `events.json` lists Southwark's as verified (checked without robots.txt). Not changed here:
  a decision for the feeds owner.
- Seven more ModernGov hosts answer 403 to scripts and Camden sends a Cloudflare challenge.

## Excluded (recorded in candidates.json `meta.excluded`)

Facebook groups and pages, Nextdoor, WhatsApp, X, Instagram, TikTok (no feed; terms forbid scraping; no workaround
tried); Google Groups (feeds removed); Reddit (robots.txt Disallow: /; one exploratory request was made before the
robots.txt was read, recorded); groups.io feeds (robots.txt, "AI crawlers must obtain a license"); JISCMail (Cloudflare
challenge on every page); Meetup RSS (robots.txt); Eventbrite (key); Google News RSS (terms).
