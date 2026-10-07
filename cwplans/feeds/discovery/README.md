# London feed discovery (2026-10-04)

Owner, 2026-10-04: "where we can find a huge stash of London-related rss/Atom feeds? Forums, mailing lists, FB groups
etc.?" This folder is the answer as data: every candidate London feed that 18 discovery methods found, each one
fetched and checked on 2026-10-04.

- [candidates.json](candidates.json): 945 candidates (867 feed URLs, 77 pages that advertise no feed, 1 member with no website). Per candidate:
  url, `found_by` (methods), `sources` (the list or page it came from), `kind`, verified status, HTTP status, format,
  item count, newest item date, `live`, update rate, CORS, zone relevance counts, terms note. `meta` holds the method
  log, the Common Crawl query and counts, the exclusions, the counts below and the best feeds for the zone.
- [london-feeds.opml](london-feeds.opml): the 414 live feeds (verified, an item in the last 365 days), grouped by kind,
  for any feed reader.
- [../events.json](../events.json): 179 of them were added as `disc-*` sources (rule below), which the feeds page
  shows: https://danbri.github.io/londat/cwplans/feeds/
- Tool: [../../tools/discover-feeds.mjs](../../tools/discover-feeds.mjs). Method in full: skill
  `cwplans-feed-discovery` (https://github.com/danbri/londat/blob/main/cwplans/skills/cwplans-feed-discovery/SKILL.md).

No feed item text is stored. Kept: feed URL, feed title, counts, dates, and for news, council, transport, events and
business feeds at most two item titles cut to 80 characters. Social, forum and mailing-list feeds keep counts only.

## Counts by method

A feed found by two methods counts under both.

| method (`found_by`) | candidates | verified | live |
|---|---:|---:|---:|
| `common-crawl`: CC-MAIN-2026-39 columnar index + WARC records, sampled | 277 | 159 | 72 |
| `feedspot`: 13 Feedspot London list pages | 254 | 231 | 183 |
| `github-list`: feeeed-db (ooh.directory mirror) and AlbertAlert London sources | 122 | 67 | 58 |
| `site-crawl`: the 61 feeds of the earlier registry crawl | 61 | 38 | 17 |
| `wikipedia-wikidata`: Category:London newspapers, List of newspapers in London, Wikidata P856 | 49 | 12 | 10 |
| `ooh-directory`: "London" and "Areas of London" OPML | 47 | 45 | 36 |
| `public-bodies`: GLA feed list (35), TfL, PLA, CRT, London City Airport, river bus | 41 | 36 | 28 |
| `moderngov`: 31 London ModernGov "what's new" feeds | 31 | 12 | 12 |
| `hand-local-news`: publishers named in the brief and zone hyperlocals | 31 | 20 | 14 |
| `mastodon`: 12 zone hashtags on mastodon.social and mastodon.london | 24 | 24 | 24 |
| `hand-community`: zone forum, church, school and venue sites | 21 | 5 | 4 |
| `icnn-map`: ICNN member map, members in London | 19 | 14 | 11 |
| `reddit`: subreddit and search RSS | 15 | not fetched | |
| `council-sites`: council news and consultation pages | 13 | 5 | 5 |
| `groups-io`: London groups from the public search | 11 | not fetched | |
| `lemmy`: feddit.uk London communities | 4 | 2 | 1 |
| `bluesky`: organisation accounts (public-body domains) | 3 | 1 | 1 |
| `meetup`: group iCal | 1 | 0 (empty) | |

Status of all 945: verified 594, empty 104, no feed advertised 77, blocked by a bot challenge 39, HTTP error 38, not
fetched by terms 26, robots.txt disallowed 24, network error 17, not a feed 13, robots.txt unreachable 12, no website 1.

## Verified feeds by kind

| kind | verified | live |
|---|---:|---:|
| news | 303 | 238 |
| business | 183 | 80 |
| council (councils and public bodies) | 71 | 61 |
| social | 25 | 25 |
| community forum | 5 | 3 |
| events | 4 | 4 |
| transport | 3 | 3 |

`kind` is the seed's kind (hand lists) or a URL heuristic; most Common Crawl sites are marked business, which includes
schools and parent groups (Poplar Farm School, Greenwich SEND Voice). Only 9 live feeds send CORS headers.

## Best 20 for the zone

Ranked by `score = 3 x zone items in the last 120 days + zone items + 5 x share`, over live content feeds (hashtag
feeds match their own tag by construction and are ranked apart). Zone terms: Canary Wharf, Isle of Dogs, Docklands,
Millwall, Cubitt Town, Poplar, Limehouse, Wapping, Rotherhithe, Canada Water, Deptford, Greenwich, Royal Docks,
Silvertown and others, and the E14, SE16, SE10, SE8, E16, E1W districts.

| # | feed | kind | items | zone items | in 120 days |
|---:|---|---|---:|---:|---:|
| 1 | Time Out London blog https://www.timeout.com/london/blog/feed.rss | news | 100 | 14 | 14 |
| 2 | Poplar Farm School https://poplar-cit.co.uk/feed/ | business | 10 | 10 | 10 |
| 3 | Ross Watch Repairs (Canary Wharf) https://rosswatchrepairs.co.uk/feed/ | business | 10 | 10 | 10 |
| 4 | Royal Borough of Greenwich news https://www.royalgreenwich.gov.uk/rss.xml | council | 10 | 9 | 9 |
| 5 | Greenwich SEND Voice https://greenwichsendvoice.co.uk/feed/ | business | 10 | 10 | 7 |
| 6 | Londonist https://londonist.com/feed | news | 20 | 7 | 7 |
| 7 | Londonist history https://londonist.com/category/features/history/feed | news | 40 | 7 | 7 |
| 8 | Docklands Academy London https://docklandsacademy.co.uk/feed/ | business | 10 | 10 | 4 |
| 9 | Royal Museums Greenwich https://www.rmg.co.uk/rss.xml | events | 10 | 6 | 6 |
| 10 | Diamond Geezer http://diamondgeezer.blogspot.com/atom.xml | news | 25 | 6 | 6 |
| 11 | Diamond Geezer (FeedBurner copy) https://feeds.feedburner.com/blogspot/HcFb | news | 25 | 6 | 6 |
| 12 | Old Deptford History https://www.olddeptfordhistory.com/feeds/posts/default | news | 25 | 19 | 0 |
| 13 | Millwall supporters' club https://www.millwallsupportersclub.co.uk/blog-feed.xml | business | 20 | 15 | 0 |
| 14 | Roman Road London / Tower Hamlets Slice https://towerhamletsslice.co.uk/feed/ | news | 10 | 4 | 4 |
| 15 | Murky Depths https://www.fromthemurkydepths.co.uk/feed/ | news | 10 | 4 | 4 |
| 16 | 853 / Greenwich Wire https://greenwichwire.co.uk/feed/ | news | 3 | 3 | 3 |
| 17 | Transpontine http://transpont.blogspot.com/feeds/posts/default | news | 25 | 6 | 3 |
| 18 | Poplar Union https://poplarunion.com/feed/ | events | 10 | 10 | 0 |
| 19 | CBT Canary Wharf https://www.cbtcanarywharf.co.uk/feed/ | business | 9 | 9 | 0 |
| 20 | Londonology https://luxeonlesslondon.com/feed/ | news | 78 | 10 | 1 |

Read the counts with care: "Millwall" in a football feed is the club, not the place; a shop blog whose footer names
Canary Wharf scores on every item; "Greenwich" also matches Greenwich Mean Time. Best social feeds: #greenwich,
#deptford, #rotherhithe and #docklands on mastodon.london and mastodon.social, #poplar and #limehouse on mastodon.social.

## The merge rule (events.json)

A live candidate is added when it is not already in events.json or feeds.json and: at least one item names a zone place,
or the publisher is in or beside the zone (hand lists, the registry crawl), or it is a council or transport body.
Social feeds only with zone items. Each entry gets `harvest: false` unless its kind is events, so
`tools/fetch-works.mjs` (which harvests every verified event feed in events.json) does not read news feeds as event
programmes. 179 added: council 51, news 70, business 30, social 20, community forum 3, transport 3, events 2.
Nothing else in events.json was changed except `counts`.

## Common Crawl

CC-MAIN-2026-39, columnar index on data.commoncrawl.org (the CDX server index.commoncrawl.org answered 504 or reset).
300 Parquet footers read; 34 row groups hold the `.london` and `.uk` hosts; their `url_host_name` columns (17 MB)
gave 2,592 `.london` hosts and 8,157 `.uk` hosts with a London place in the name (442 zone places, 876 boroughs,
6,839 "london"). Sampled by sha1(host): 942 hosts; 934 HTML captures; 755 pages about London (the word or a London
postcode); 225 with feed links; 278 feed URLs (277 after duplicates). 1,177 requests, 458 MB, 28 minutes, one request
at a time. Query in `candidates.json` `meta.common_crawl.query`.

## Excluded, and why

| what | why |
|---|---|
| Facebook groups and pages, Nextdoor, WhatsApp, X, Instagram, TikTok | no open feed; their terms forbid scraping; no workaround tried |
| Google Groups | Google removed group RSS and Atom feeds |
| Reddit | robots.txt "User-agent: * Disallow: /" and the Reddit Public Content Policy: 15 URLs recorded, not fetched. One exploratory request (/r/london/.rss, HTTP 200) was made before robots.txt was read |
| groups.io feeds | robots.txt disallows /g/*/rss and asks AI crawlers for a licence: 11 London groups from the public search recorded (name, URL, archive public or private), no feed fetched |
| JISCMail | every page, robots.txt included, is a Cloudflare challenge; not bypassed |
| Meetup RSS and Atom | disallowed by robots.txt; the allowed group iCal was empty |
| Eventbrite | needs a private token; search API removed |
| Google News RSS | terms |

Blocked or refused, recorded per candidate: Canary Wharf estate and CWG news (Imperva challenge), TfL press releases,
PLA, London City Airport, City of London news, Londonist home page (Cloudflare), Southwark News, Surrey Docks Farm,
Ragged School Museum (SiteGround captcha); The Wharf and St Anne's Limehouse (TLS name mismatch), Wharf Life (no
answer). Many London ModernGov hosts disallow `mgRss.aspx` in robots.txt (Southwark, Lambeth, Redbridge, Wandsworth,
Hounslow, Bromley, City of London) or answer 403 (Westminster, Bexley, Croydon, Havering, Islington, Merton, Waltham
Forest). Note: events.json lists the Southwark ModernGov feed as verified from a check that did not read robots.txt,
and says Time Out has no feed; both are left for the catalogue's owner.

## Re-run

    NODE_USE_ENV_PROXY=1 node cwplans/tools/discover-feeds.mjs seed
    npm i --prefix /tmp/cclibs hyparquet hyparquet-compressors
    CC_LIBS=/tmp/cclibs NODE_USE_ENV_PROXY=1 node cwplans/tools/discover-feeds.mjs cc
    NODE_USE_ENV_PROXY=1 node cwplans/tools/discover-feeds.mjs autodiscover
    NODE_USE_ENV_PROXY=1 node cwplans/tools/discover-feeds.mjs verify
    node cwplans/tools/discover-feeds.mjs build
    node cwplans/tools/check-data-register.mjs --write

Caches in `cwplans/data/raw/feed-discovery/` (gitignored); `--refresh` redoes a stage. Run times on
2026-10-04: seed 4 min, cc 28 min, autodiscover 6 min, verify about 15 min.
