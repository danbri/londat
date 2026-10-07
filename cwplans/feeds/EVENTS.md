# Event and real-time sources for Canary Wharf and the docks

This is the event-centric companion to [feeds.json](feeds.json) and [README.md](README.md), which cover tides, weather, air, transport and other measurements. This file covers calendars, event listings, news and notice feeds, and the data where a shop or venue opening or closing shows up.

Area: Canary Wharf and the Isle of Dogs (E14) first; then SE16 (Rotherhithe, Surrey Quays, Canada Water), Limehouse, Wapping, Greenwich and North Greenwich, the Royal Docks and ExCeL, and Cody Dock.

Every URL was fetched from this container on 2026-10-03: 124 sources, of which 107 verified, 6 need a key and 11 could not be verified. Each source records the HTTP status, content type, CORS, the number of items in the feed, the newest item date and up to three sample titles. The machine-readable version is [events.json](events.json). Re-check everything with:

    NODE_USE_ENV_PROXY=1 node magpie/cwplans/feeds/check-events.mjs          # all sources
    NODE_USE_ENV_PROXY=1 node magpie/cwplans/feeds/check-events.mjs --live   # only the ones a static page can read
    NODE_USE_ENV_PROXY=1 node magpie/cwplans/feeds/check-events.mjs --url <any feed URL>

In `events.json`, `machine_readable` uses one value outside the planned list: `xml`, for the ModernGov web service and for sitemaps, which are XML and nothing else.

"Newest" means the latest date in the feed. For calendars and event lists that is the furthest-ahead event, not the last update.

## Feeds a static web page can read live

No key, and the server sent `Access-Control-Allow-Origin` for `https://danbri.github.io`, so a page on GitHub Pages can fetch these directly.

| Source | Feed | Items | Newest | Sample |
|---|---|---:|---|---|
| Environment Agency flood warning summary, London (RSS) | [https://environment.data.gov.uk/flood-widgets/rss/feed-London.xml](https://environment.data.gov.uk/flood-widgets/rss/feed-London.xml) | 4 | 2026-10-03 | 0 Severe Flood Warning |
| Environment Agency flood warning summary, Greenwich (RSS) | [https://environment.data.gov.uk/flood-widgets/rss/feed-Greenwich.xml](https://environment.data.gov.uk/flood-widgets/rss/feed-Greenwich.xml) | 4 | 2026-10-03 | 0 Severe Flood Warning |
| OpenStreetMap notes in the Canary Wharf box (RSS) | [https://api.openstreetmap.org/api/0.6/notes/feed?bbox=-0.03,51.495,…](https://api.openstreetmap.org/api/0.6/notes/feed?bbox=-0.03,51.495,-0.005,51.51) | 18 | 2026-09-10 | new note (near Millwall, Isle of Dogs, London Borough of Tower Hamlets, Greater London, England, E14 9WZ, United Kingdom) |
| UK bank holidays (JSON) | [https://www.gov.uk/bank-holidays.json](https://www.gov.uk/bank-holidays.json) | 103 | 2028-12-26 | New Year’s Day |
| GOV.UK search API: "Canary Wharf", newest first | [https://www.gov.uk/api/search.json?q=%22Canary%20Wharf%22&order=-pu…](https://www.gov.uk/api/search.json?q=%22Canary%20Wharf%22&order=-public_timestamp&count=20&fields=title,public_timestamp,link,content_store_document_type&reject_content_store_document_type=employment_tribunal_decision) | 20 | 2026-10-02 | FOI Log - September 2026 |
| TfL planned closures by date range (Jubilee, DLR, Elizabeth line) | [https://api.tfl.gov.uk/Line/jubilee,dlr,elizabeth/Status/2026-10-03…](https://api.tfl.gov.uk/Line/jubilee,dlr,elizabeth/Status/2026-10-03T00:00:00/to/2026-12-31T00:00:00) | 13 | 2026-11-07 | JUBILEE LINE: From 0430 Saturday 3 until 0130 Sunday 4 October, no service between Green Park and Canary Wharf. If travelling between Centr… |
| TfL river-bus status (Uber Boat routes) | [https://api.tfl.gov.uk/Line/Mode/river-bus/Status?detail=true](https://api.tfl.gov.uk/Line/Mode/river-bus/Status?detail=true) | 4 | – | RB1: Good Service |
| TfL disruptions at Canary Wharf and Canada Water stations | [https://api.tfl.gov.uk/StopPoint/940GZZLUCYF,940GZZDLCAN,940GZZLUCW…](https://api.tfl.gov.uk/StopPoint/940GZZLUCYF,940GZZDLCAN,940GZZLUCWR,910GCANWHRF/Disruption) | 6 | 2026-10-03 | Canada Water Underground Station: CANADA WATER STATION: Until Spring 2027, no step-free access between street and ticket hall level at this… |
| The Space theatre (Isle of Dogs): events (WordPress REST) | [https://space.org.uk/wp-json/wp/v2/event?per_page=20](https://space.org.uk/wp-json/wp/v2/event?per_page=20) | 20 | 2026-09-22 | 2026-09-22 1938 |
| Wilton's Music Hall: what's on (WordPress REST) | [https://wiltons.org.uk/wp-json/wp/v2/whatson?per_page=20](https://wiltons.org.uk/wp-json/wp/v2/whatson?per_page=20) | 20 | 2026-09-29 | 2026-09-29 Post Mortem: The Post Office Horizon IT Scandal – in conversation with Private Eye’s Richard Brooks |
| Greenwich Theatre: events (WordPress REST) | [https://greenwichtheatre.org.uk/wp-json/wp/v2/events?per_page=20](https://greenwichtheatre.org.uk/wp-json/wp/v2/events?per_page=20) | 20 | 2026-09-29 | 2026-09-29 Mauvaise Dame, Mauvaise Chance |
| Food hygiene ratings within 1 mile of Canary Wharf (FHRS API) | [https://api.ratings.food.gov.uk/Establishments?latitude=51.505&long…](https://api.ratings.food.gov.uk/Establishments?latitude=51.505&longitude=-0.02&maxDistanceLimit=1&pageSize=5000) | 753 | 2026-09-23 | Colcol’s cafe & seafood (Restaurant/Cafe/Canteen, SE10 0QE; FHRSID 1994111, awaiting inspection) |
| Food hygiene ratings within 1 mile of Canada Water (FHRS API) | [https://api.ratings.food.gov.uk/Establishments?latitude=51.498&long…](https://api.ratings.food.gov.uk/Establishments?latitude=51.498&longitude=-0.05&maxDistanceLimit=1&pageSize=5000) | 533 | 2026-09-09 | Sushi revolution (Restaurant/Cafe/Canteen, SE16 2FR; FHRSID 1987803, awaiting inspection) |
| OpenStreetMap changesets in the Canary Wharf box (API 0.6) | [https://api.openstreetmap.org/api/0.6/changesets.json?bbox=-0.03,51…](https://api.openstreetmap.org/api/0.6/changesets.json?bbox=-0.03,51.495,-0.005,51.51) | 100 | 2026-10-02 | 2026-10-02 Greater London: Automatically update data on UK education establishments using Get Information About Schools … (325 changes) |
| Wikidata: items within 3 km with recent inception (P571) or dissolution (P576) | [https://query.wikidata.org/sparql?format=json&query=SELECT%20%3Fite…](https://query.wikidata.org/sparql?format=json&query=SELECT%20%3Fitem%20%3FitemLabel%20%3Finception%20%3Fdissolved%20WHERE%20%7B%20SERVICE%20wikibase%3Aaround%20%7B%20%3Fitem%20wdt%3AP625%20%3Floc%20.%20bd%3AserviceParam%20wikibase%3Acenter%20%22Point%28-0.02%2051.505%29%22%5E%5Egeo%3AwktLiteral%20.%20bd%3AserviceParam%20wikibase%3Aradius%20%223%22%20.%20%7D%20OPTIONAL%20%7B%20%3Fitem%20wdt%3AP571%20%3Finception%20%7D%20OPTIONAL%20%7B%20%3Fitem%20wdt%3AP576%20%3Fdissolved%20%7D%20FILTER%28BOUND%28%3Fdissolved%29%20%7C%7C%20%28BOUND%28%3Finception%29%20%26%26%20YEAR%28%3Finception%29%20%3E%3D%202015%29%29%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22en%22.%20%7D%20%7D%20ORDER%20BY%20DESC%28COALESCE%28%3Fdissolved%2C%20%3Finception%29%29%20LIMIT%2050) | 50 | 2025-01-01 | Blumont Annuity (inception 2025-01-01) |
| Canada Water Dockside: retailer directory (WordPress REST) | [https://canadawater.co.uk/wp-json/wp/v2/retailer?per_page=20&orderb…](https://canadawater.co.uk/wp-json/wp/v2/retailer?per_page=20&orderby=date) | 20 | 2026-03-10 | 2026-03-10 The Salt Quay |

The two FHRS entries need a request header: `x-api-version: 2` (allowed by its CORS preflight). Overpass (overpass-shops-newer) also sends CORS but answered only some of the time from here. Everything else needs a small server-side fetcher (a scheduled job that writes JSON into the repo works).

## iCalendar (ICS)

Real subscribable calendars are rare here. GOV.UK bank holidays is the only all-dates ICS. ModernGov councils publish one ICS per meeting, not a calendar feed, and Meetup group feeds now come back empty or need a signed URL.

| Source | Form | Status | Items | Newest | Sample or note |
|---|---|---|---:|---|---|
| [UK bank holidays, England and Wales (ICS)](https://www.gov.uk/bank-holidays/england-and-wales.ics) | ics | 200 | 83 | 2028-12-26 | 2026-12-25 Christmas Day |
| [Southwark Council meeting, single-meeting ICS (ModernGov)](https://moderngov.southwark.gov.uk/mgVCalendar.aspx?EID=8551&ET=51&RPID=0&FMT=ICS) | ics | 200 | 1 | 2026-10-13 | 2026-10-13 Executive meeting; 13/10/2026 |
| [Newham Council meeting, single-meeting ICS (ModernGov)](https://mgov.newham.gov.uk/mgVCalendar.aspx?EID=15573&ET=51&RPID=0&FMT=ICS) | ics | 200 | 1 | 2026-09-09 | 2026-09-09 CANCELLED - Licensing (2003 Act) Sub-Committee meeting; 09/09/2026 |
| [Tower Hamlets Council meeting, single-meeting ICS (ModernGov)](https://democracy.towerhamlets.gov.uk/mgVCalendar.aspx?EID=17875&ET=51&RPID=0&FMT=ICS) | ics | not verified | – | – |  |
| [Royal Greenwich meeting, single-meeting ICS (ModernGov)](https://greenwich.moderngov.co.uk/mgVCalendar.aspx?EID=2887&ET=51&RPID=0&FMT=ICS) | ics | not verified | – | – |  |
| [Meetup group calendar (Canary Wharf Coffee + Walk)](https://www.meetup.com/canary-wharf-coffee-walk/events/ical/) | ics | 200 | 0 | – |  |

## RSS and Atom

Council meeting feeds (ModernGov "what's new"), venue and event feeds, GLA feeds, warnings, Gazette notices, encyclopedia and map change feeds, and local news.

| Source | Form | Status | Items | Newest | Sample or note |
|---|---|---|---:|---|---|
| [Tower Hamlets democracy: what's new (RSS)](https://democracy.towerhamlets.gov.uk/mgRss.aspx) | rss | 200 | 20 | 2026-10-02 | Decision sheet published: Meeting of Wednesday, 30th September, 2026 5.30 p.m., Housing Management (Cabinet) Sub-Committee |
| [Southwark democracy: what's new (RSS)](https://moderngov.southwark.gov.uk/mgRss.aspx) | rss | 200 | 19 | 2026-10-02 | Issue Published: Approval to complete a lease of Northcott House, 259-263 Waterloo Road, London, SE1 8JU |
| [Royal Greenwich democracy: what's new (RSS)](https://greenwich.moderngov.co.uk/mgRss.aspx) | rss | 200 | 11 | 2026-10-02 | Agenda published: Meeting of Monday, 12th October, 2026 6.30 pm, Eltham Crematorium Joint Committee |
| [Lewisham democracy: what's new (RSS)](https://lewisham.moderngov.co.uk/mgRss.aspx) | rss | 200 | 5 | 2026-10-01 | Publication of plan: Key Decision Plan October 2026; Mayor and Cabinet |
| [Newham democracy: what's new (RSS)](https://mgov.newham.gov.uk/mgRss.aspx) | rss | 200 | 9 | 2026-10-02 | Agenda published: Meeting of Monday 12th October 2026 7.00 p.m., Health and Adult Social Care Scrutiny Committee |
| [London Assembly meetings: what's new (RSS)](https://www.london.gov.uk/about-us/londonassembly/meetings/mgRss.aspx) | rss | 200 | 8 | 2026-10-01 | Meeting held: Thursday 1 October 2026 10.00 am, Planning and Regeneration Committee |
| [Tower Hamlets Council events listing (RSS; Atom also)](https://www.towerhamlets.gov.uk/News_events/Events/Events.aspx?Calendar_List_SyndicationType=1) | rss | 200 | 205 | 2026-10-02 | Sugar Towers: A Black History Portrait Photography |
| [The O2: events (RSS)](https://www.theo2.co.uk/events/rss) | rss | 200 | 161 | 2027-12-11 | Niall Horan |
| [The O2: news (RSS)](https://www.theo2.co.uk/news/rss) | rss | 200 | 100 | 2025-12-02 | 'The Club is Alive', as JLS joins The O2's coveted 21 Club |
| [Royal Docks: events (Atom)](https://www.royaldocks.london/feeds/events.atom) | atom | 200 | 2306 | 2026-10-01 | UK Black Business Week & Show 2026 |
| [Royal Docks: articles and news (RSS)](https://www.royaldocks.london/feeds/articles.rss) | rss | 200 | 10 | 2026-10-01 | Help Shape Floating Residential at Royal Victoria Dock West |
| [GLA upcoming events (RSS)](https://www.london.gov.uk/rss-feeds/80117) | rss | 200 | 7 | 2026-07-06 | People's Question Time 2026 - Islington |
| [Cody Dock: news and events (RSS)](https://codydock.org.uk/feed/) | rss | 200 | 10 | 2026-09-25 | Common Threads |
| [Trinity Buoy Wharf: news (RSS)](https://www.trinitybuoywharf.com/feed.rss) | rss | 200 | 12 | 2026-05-13 | The 9th John Ruskin Prize Calls for Entries: Not for Present Delight |
| [Mayor of London press releases (RSS)](https://www.london.gov.uk/rss-feeds/80610) | rss | 200 | 20 | 2026-09-28 | Mayor sets out vision to end ‘Wild West’ of dockless bikes in London |
| [GLA consultations (RSS)](https://www.london.gov.uk/rss-feeds/80614) | rss | 200 | 20 | 2026-01-05 | Quarter 4 - Mayor's Action Plan for improving transparency, accountability and trust in policing |
| [Mayoral decisions (RSS)](https://www.london.gov.uk/rss-feeds/80606) | rss | 200 | 20 | 2026-09-24 | MD3531 Integrated Settlement for Social Housing Retrofit |
| [Newham Council news (RSS)](https://www.newham.gov.uk/rss/news) | rss | 200 | 20 | 2026-09-23 | £50,000 Lyle’s Local Fund launched to support a safe, prosperous and healthy Newham. |
| [Southwark Council site feed (RSS)](https://www.southwark.gov.uk/rss.xml) | rss | 200 | 10 | 2026-10-02 | Wolverton, Alvey Street 176-192 |
| [Metropolitan Police news (RSS)](https://news.met.police.uk/rss/current_news/66871) | rss | 200 | 20 | 2026-10-02 | Two men charged with suspected terror plot targeting Jewish Community in Manchester |
| [Met Office weather warnings, London and South East (RSS)](https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/se) | rss | 200 | 0 | – |  |
| [Environment Agency flood warning summary, London (RSS)](https://environment.data.gov.uk/flood-widgets/rss/feed-London.xml) | rss | 200, CORS | 4 | 2026-10-03 | 0 Severe Flood Warning |
| [Environment Agency flood warning summary, Greenwich (RSS)](https://environment.data.gov.uk/flood-widgets/rss/feed-Greenwich.xml) | rss | 200, CORS | 4 | 2026-10-03 | 0 Severe Flood Warning |
| [The Gazette: Road Traffic Act notices within 2 miles of E14 5AB (Atom)](https://www.thegazette.co.uk/all-notices/notice/data.feed?noticetypes=1501&location-postcode-1=E14+5AB&location-distance-1=2&numberOfLocationSearches=1&results-page-size=20) | atom | 200 | 20 | 2026-09-30 | 2026-09-30 Road Traffic Acts: ROYAL BOROUGH OF GREENWICH CHANGES TO PERMIT ELIGIBILITY – CAR FREE DEVELOPMENTS BATCH 3 [T15(26)] THE GREENWICH (CHARG… |
| [The Gazette: Town and Country Planning notices within 2 miles of E14 5AB (Atom)](https://www.thegazette.co.uk/all-notices/notice/data.feed?noticetypes=1601&location-postcode-1=E14+5AB&location-distance-1=2&numberOfLocationSearches=1&results-page-size=20) | atom | 200 | 20 | 2026-08-27 | 2026-08-27 Town and Country Planning: LONDON BOROUGH TOWER HAMLETS SECTION 247 TOWN AND COUNTRY PLANNING ACT 1990 (2A) & 251 NOTICE OF MAKING A STOPPING UP O… |
| [GOV.UK news and communications mentioning Canary Wharf (Atom)](https://www.gov.uk/search/news-and-communications.atom?keywords=canary+wharf) | atom | 200 | 20 | 2026-09-24 | UKHSA priorities in 2026 to 2027 |
| [Wikipedia: Canary Wharf article edit history (Atom)](https://en.wikipedia.org/w/index.php?title=Canary_Wharf&action=history&feed=atom) | atom | 200 | 10 | 2026-09-28 | Undid revision 1376669729 by [editor] (talk) - rv trivia (WP:TRHAT). This would be done with {{distinguish}} if there w… |
| [Wikipedia: Isle of Dogs article edit history (Atom)](https://en.wikipedia.org/w/index.php?title=Isle_of_Dogs&action=history&feed=atom) | atom | 200 | 10 | 2026-08-01 | "despite its name" is not appropriate for the lead sentence; move to a more natural location |
| [Wikipedia: Canada Water article edit history (Atom)](https://en.wikipedia.org/w/index.php?title=Canada_Water&action=history&feed=atom) | atom | 200 | 10 | 2026-06-06 | added Category:Planned communities in London using HotCat |
| [OpenStreetMap notes in the Canary Wharf box (RSS)](https://api.openstreetmap.org/api/0.6/notes/feed?bbox=-0.03,51.495,-0.005,51.51) | rss | 200, CORS | 18 | 2026-09-10 | new note (near Millwall, Isle of Dogs, London Borough of Tower Hamlets, Greater London, England, E14 9WZ, United Kingdom) |
| [MyLondon: east London news (RSS)](https://www.mylondon.news/news/east-london-news/?service=rss) | rss | 200 | 25 | 2026-10-02 | Reform UK Mayor candidate 'would run London like Tokyo on steroids' and automate Tube to stop strikes |
| [MyLondon: south London news (RSS)](https://www.mylondon.news/news/south-london-news/?service=rss) | rss | 200 | 25 | 2026-10-02 | Reform UK Mayor candidate 'would run London like Tokyo on steroids' and automate Tube to stop strikes |
| [Evening Standard: London news (RSS)](https://www.standard.co.uk/news/london/rss) | rss | 200 | 19 | 2026-10-02 | Police hunt man after woman sexually assaulted outside south London Tube station |
| [East London Advertiser (Docklands & East London Advertiser) news (RSS)](https://www.eastlondonadvertiser.co.uk/news/rss/) | rss | 200 | 50 | 2026-10-02 | Man charged with preparing terrorist acts, including against Nigel Farage |
| [News Shopper (south-east London) news (RSS)](https://www.newsshopper.co.uk/news/rss/) | rss | 200 | 50 | 2026-10-03 | 'Heartbreak' over Beckenham ODEON as over 8,000 sign petition to save cinema |
| [Greenwich Wire (formerly 853) (RSS)](https://greenwichwire.co.uk/feed/) | rss | 200 | 3 | 2026-10-02 | Tenants in Carbuncle Cup-winning Lewisham flats face another year away from home |
| [Southwark News (RSS)](https://www.southwarknews.co.uk/feed/) | rss | not verified | – | – |  |
| [Wharf Life (Canary Wharf local paper)](https://wharflife.com/feed/) | rss | not verified | – | – |  |

## REST and JSON APIs

Open JSON (several with CORS), the ModernGov web service that gives meeting dates by committee, Parliament, and the commercial event APIs that need a key.

| Source | Form | Status | Items | Newest | Sample or note |
|---|---|---|---:|---|---|
| [Southwark meetings by date range (ModernGov web service)](https://moderngov.southwark.gov.uk/mgWebService.asmx/GetMeetings?lCommitteeId=0&sFromDate=01/10/2026&sToDate=31/12/2026) | xml | 200 | 28 | 2026-12-16 | 2026-10-05 Overview & Scrutiny Committee (Confirmed) |
| [Tower Hamlets Licensing Sub Committee meetings (ModernGov web service)](https://democracy.towerhamlets.gov.uk/mgWebService.asmx/GetMeetings?lCommitteeId=366&sFromDate=01/09/2026&sToDate=31/12/2026) | xml | 200 | 10 | 2026-12-17 | 2026-10-15 Licensing Sub Committee (Cancelled) |
| [Royal Greenwich Local Planning Committee meetings (ModernGov web service)](https://greenwich.moderngov.co.uk/mgWebService.asmx/GetMeetings?lCommitteeId=270&sFromDate=01/09/2026&sToDate=31/12/2026) | xml | 200 | 4 | 2026-12-15 | 2026-10-27 Local Planning Committee (Confirmed) |
| [Lewisham Licensing Sub Committee A meetings (ModernGov web service)](https://lewisham.moderngov.co.uk/mgWebService.asmx/GetMeetings?lCommitteeId=508&sFromDate=01/09/2026&sToDate=31/12/2026) | xml | 200 | 1 | 2026-09-22 | 2026-09-22 Licensing Sub Committee A (Cancelled) |
| [Newham Licensing (2003 Act) Sub-Committee meetings (ModernGov web service)](https://mgov.newham.gov.uk/mgWebService.asmx/GetMeetings?lCommitteeId=927&sFromDate=01/09/2026&sToDate=31/12/2026) | xml | 200 | 6 | 2026-10-07 | 2026-10-07 Licensing (2003 Act) Sub-Committee (Confirmed) |
| [London Assembly plenary meetings (ModernGov web service)](https://www.london.gov.uk/about-us/londonassembly/meetings/mgWebService.asmx/GetMeetings?lCommitteeId=179&sFromDate=01/09/2026&sToDate=31/12/2026) | xml | 200 | 3 | 2026-12-03 | 2026-11-05 London Assembly (Plenary) (Confirmed) |
| [Tower Hamlets consultations, Let's Talk platform (JSON API)](https://talk.towerhamlets.gov.uk/web_api/v1/projects?page%5Bsize%5D=20) | json | 200 | 20 | 2026-09-23 | 2026-09-23 Growing Good Housing Practice (published) |
| [UK bank holidays (JSON)](https://www.gov.uk/bank-holidays.json) | json | 200, CORS | 103 | 2028-12-26 | New Year’s Day |
| [GOV.UK search API: "Canary Wharf", newest first](https://www.gov.uk/api/search.json?q=%22Canary%20Wharf%22&order=-public_timestamp&count=20&fields=title,public_timestamp,link,content_store_document_type&reject_content_store_document_type=employment_tribunal_decision) | json | 200, CORS | 20 | 2026-10-02 | FOI Log - September 2026 |
| [TfL planned closures by date range (Jubilee, DLR, Elizabeth line)](https://api.tfl.gov.uk/Line/jubilee,dlr,elizabeth/Status/2026-10-03T00:00:00/to/2026-12-31T00:00:00) | json | 200, CORS | 13 | 2026-11-07 | JUBILEE LINE: From 0430 Saturday 3 until 0130 Sunday 4 October, no service between Green Park and Canary Wharf. If travelling between Centr… |
| [TfL river-bus status (Uber Boat routes)](https://api.tfl.gov.uk/Line/Mode/river-bus/Status?detail=true) | json | 200, CORS | 4 | – | RB1: Good Service |
| [TfL disruptions at Canary Wharf and Canada Water stations](https://api.tfl.gov.uk/StopPoint/940GZZLUCYF,940GZZDLCAN,940GZZLUCWR,910GCANWHRF/Disruption) | json | 200, CORS | 6 | 2026-10-03 | Canada Water Underground Station: CANADA WATER STATION: Until Spring 2027, no step-free access between street and ticket hall level at this… |
| [Hansard: spoken contributions mentioning "Canary Wharf"](https://hansard-api.parliament.uk/search/contributions/Spoken.json?queryParameters.searchTerm=%22Canary%20Wharf%22&queryParameters.take=10&queryParameters.orderBy=SittingDateDesc) | json | 200 | 10 | 2026-09-16 | 2026-09-16 Lords: Procedure and Privileges |
| [Parliament written questions mentioning Canary Wharf](https://questions-statements-api.parliament.uk/api/writtenquestions/questions?searchTerm=Canary%20Wharf&take=10) | json | 200 | 10 | 2026-08-28 | 2026-08-28 Attorney General's Office: Remote Working |
| [The Space theatre (Isle of Dogs): events (WordPress REST)](https://space.org.uk/wp-json/wp/v2/event?per_page=20) | json | 200, CORS | 20 | 2026-09-22 | 2026-09-22 1938 |
| [Wilton's Music Hall: what's on (WordPress REST)](https://wiltons.org.uk/wp-json/wp/v2/whatson?per_page=20) | json | 200, CORS | 20 | 2026-09-29 | 2026-09-29 Post Mortem: The Post Office Horizon IT Scandal – in conversation with Private Eye’s Richard Brooks |
| [Greenwich Theatre: events (WordPress REST)](https://greenwichtheatre.org.uk/wp-json/wp/v2/events?per_page=20) | json | 200, CORS | 20 | 2026-09-29 | 2026-09-29 Mauvaise Dame, Mauvaise Chance |
| [Ticketmaster Discovery API (events by lat/long)](https://app.ticketmaster.com/discovery/v2/events.json?latlong=51.505,-0.02&radius=3&unit=km) | json | key required | 0 | – |  |
| [Skiddle events API](https://www.skiddle.com/api/v1/events/search/?latitude=51.505&longitude=-0.02&radius=2) | json | key required | 0 | – |  |
| [Songkick API](https://api.songkick.com/api/3.0/search/locations.json?query=London) | json | key required | 0 | – |  |
| [Data Thistle (The List) events API](https://api.datathistle.com/v1/events) | json | key required | 0 | – |  |

## What's-on pages

HTML pages. The "form" column says what a machine can read: json-ld-events (schema.org Event in a script block), microdata, a feed linked from the page, or html-only (scrape it).

| Source | Form | Status | Items | Newest | Sample or note |
|---|---|---|---:|---|---|
| [The O2: events listing page](https://www.theo2.co.uk/events) | json-ld-events | 200 | 5 | 2026-10-09 | 2026-10-03 Niall Horan |
| [Canada Water Dockside: latest / events](https://canadawater.co.uk/latest/?latest-type=event) | json-ld-events | 200 | 1 | 2026-06-14 | 2026-06-14 The World Cup at Corner Corner |
| [Greenwich Peninsula: what's on (sitemap + per-event JSON-LD)](https://www.greenwichpeninsula.co.uk/sitemap.xml) | json-ld-events | 200 | 350 | 2026-09-28 | 2026-09-28 autechre-magazine |
| [Visit Greenwich: what's on](https://www.visitgreenwich.org.uk/whats-on) | microdata | 200 | – | – | (page: What’s On - Visit Greenwich) |
| [Royal Museums Greenwich: what's on](https://www.rmg.co.uk/whats-on) | html-only | 200 | – | – | (page: What's on? \| Royal Museums Greenwich) |
| [Cutty Sark (Royal Museums Greenwich)](https://www.rmg.co.uk/cutty-sark) | html-only | 200 | – | – | (page: Cutty Sark \| Royal Museums Greenwich) |
| [London Museum Docklands: what's on](https://www.londonmuseum.org.uk/whats-on/) | html-only | 200 | – | – | (page: What's on \| London Museum) |
| [ExCeL London: what's on](https://www.excel.london/whats-on) | html-only | 200 | – | – | (page: What’s on \| Events at Excel London) |
| [Tower Hamlets Council: events](https://www.towerhamlets.gov.uk/News_events/Events/Events.aspx) | rss | 200 | – | – | (page: Events) |
| [Southwark Presents (council events)](https://www.southwark.gov.uk/southwark-presents) | html-only | 200 | – | – | (page: Southwark Presents \| Southwark Council) |
| [Royal Greenwich: events](https://www.royalgreenwich.gov.uk/events) | html-only | 200 | – | – | (page: Events \| Royal Borough of Greenwich) |
| [Royal Docks: what's on page](https://www.royaldocks.london/whats-on) | atom | 200 | – | – | (page: What's on \| Royal Docks) |
| [Trinity Buoy Wharf: what's on](https://www.trinitybuoywharf.com/whats-on/) | rss | 200 | – | – | (page: What's On - Trinity Buoy Wharf) |
| [Mudchute Park & Farm: what's on](https://www.mudchute.org/whats-on) | html-only | 200 | – | – | (page: What's On \| Mudchute Park and Farm) |
| [Docklands Sailing & Watersports Centre](https://www.dswc.org/) | html-only | 200 | – | – | (page: DSWC – Docklands Sailing and Watersports Centre) |
| [Brunel Museum](https://www.thebrunelmuseum.com/) | html-only | 200 | – | – | (page: Homepage - Brunel Museum) |
| [Limehouse Basin (Canal & River Trust)](https://canalrivertrust.org.uk/places-to-visit/limehouse-basin) | html-only | 200 | – | – | (page: Limehouse Basin \| Places to Visit) |
| [The Space (Isle of Dogs)](https://space.org.uk/) | json | 200 | – | – | (page: The Space - London's Performing Arts and Community Centre) |
| [Tobacco Dock](https://www.tobaccodocklondon.com/) | html-only | 200 | – | – | (page: Venue Hire London \| Creative Event Spaces \| Tobacco Dock) |
| [Sands Films Studios](https://www.sandsfilms.co.uk/) | html-only | 200 | – | – | (page: Sands Films Studio Home page) |
| [Idea Store (Tower Hamlets libraries) including Idea Store Canary Wharf](https://www.ideastore.co.uk/) | html-only | 200 | – | – | (page: Welcome to Idea Store) |
| [Royal Parks: what's on (Greenwich Park)](https://www.royalparks.org.uk/whats-on) | html-only | 200 | – | – | (page: What's on \| The Royal Parks) |
| [Totally Thames festival](https://totallythames.org/) | html-only | 200 | – | – | (page: Thames Festival Trust \| Arts, Culture, Education & Heritage \| Thames Festival Trust) |
| [Greenwich+Docklands International Festival](https://festival.org/) | html-only | 200 | – | – | (page: FESTIVAL.ORG) |
| [Greenwich Market](https://www.greenwichmarket.london/) | html-only | 200 | – | – | (page: Greenwich Market, the best of the borough & London) |
| [Trinity Laban: what's on](https://www.trinitylaban.ac.uk/whats-on/) | html-only | 200 | – | – | (page: Trinity Laban What's On) |
| [Ravensbourne University: events](https://www.ravensbourne.ac.uk/events) | html-only | 200 | – | – | (page: Events \| Ravensbourne University London) |
| [Millwall FC fixtures](https://www.millwallfc.co.uk/fixtures) | html-only | 200 | – | – |  |
| [Canary Wharf: what's on](https://canarywharf.com/whats-on/) | html-only | not verified | – | – |  |
| [Surrey Docks Farm](https://www.surreydocksfarm.org.uk/) | html-only | not verified | – | – |  |
| [St Anne's Limehouse](https://www.stanneslimehouse.org/) | html-only | not verified | – | – |  |
| [indigo at The O2](https://www.indigoattheo2.co.uk/) | html-only | not verified | – | – |  |
| [University of Greenwich: events](https://www.gre.ac.uk/events) | html-only | 200 | – | – | (page: Events \| University of Greenwich) |
| [Visit London: what's on](https://www.visitlondon.com/things-to-do/whats-on) | html-only | not verified | – | – |  |

## Openings and closings

Sources where a new or closed business, venue or unit shows up. See the next section for how each signal works.

| Source | Form | Status | Items | Newest | Sample or note |
|---|---|---|---:|---|---|
| [Food hygiene ratings within 1 mile of Canary Wharf (FHRS API)](https://api.ratings.food.gov.uk/Establishments?latitude=51.505&longitude=-0.02&maxDistanceLimit=1&pageSize=5000) | json | 200, CORS | 753 | 2026-09-23 | Colcol’s cafe & seafood (Restaurant/Cafe/Canteen, SE10 0QE; FHRSID 1994111, awaiting inspection) |
| [Food hygiene ratings within 1 mile of Canada Water (FHRS API)](https://api.ratings.food.gov.uk/Establishments?latitude=51.498&longitude=-0.05&maxDistanceLimit=1&pageSize=5000) | json | 200, CORS | 533 | 2026-09-09 | Sushi revolution (Restaurant/Cafe/Canteen, SE16 2FR; FHRSID 1987803, awaiting inspection) |
| [FHRS open data file, Tower Hamlets (XML)](https://ratings.food.gov.uk/api/open-data-files/FHRS530en-GB.json) | json | 200 | 3193 | 2026-09-28 | Nafsoor Somali Cuisine & Café (Restaurant/Cafe/Canteen, E14 6BT; FHRSID 1993581, awaiting inspection) |
| [Tower Hamlets: licence applications received this week](https://www.towerhamlets.gov.uk/lgnl/business/licences/alcohol_and_entertainment/Licence_applications_received_this_week.aspx) | html-only | 200 | 25 | 2026-09-28 | Temporary Events Notice TEN — Barbarella, 42 Mackenzie Walk, London, E14 5EH (31/12/2026 - 01/01/2027) |
| [Tower Hamlets licensing applications search (Idox Public Access)](https://development.towerhamlets.gov.uk/online-applications/search.do?action=weeklyList&searchType=LicencingApplication) | html-only | 200 | – | – | (page: Weekly List) |
| [Royal Greenwich licensing applications search (Idox Public Access)](https://planning.royalgreenwich.gov.uk/online-applications/search.do?action=simple&searchType=LicencingApplication) | html-only | 200 | – | – | (page: Simple Search) |
| [Southwark licensing register (premises applied / in progress)](https://app.southwark.gov.uk/) | html-only | 200 | – | – | (page: Home - Southwark Council) |
| [Planning London Datahub: "change of use" applications within 2 km of Canary Wharf](https://planningdata.london.gov.uk/api-guest/applications/_search) | json | 200 | 10 | 2026-10-02 | 26/2579/F Unit 4, Airy Pavilion, Peninsula Square, London, …: Change of use to Class C1 and / or Sui Generis, along with the erection of an external se… |
| [The Gazette: corporate insolvency notices within 1 mile of E14 5AB (Atom)](https://www.thegazette.co.uk/all-notices/notice/data.feed?categorycode=G205010000&location-postcode-1=E14+5AB&location-distance-1=1&numberOfLocationSearches=1&results-page-size=20) | atom | 200 | 20 | 2026-10-02 | 2026-10-02 Appointment of Liquidators: CPR ELECTRICAL CONTRACTING LIMITED |
| [The Gazette: corporate insolvency notices within 1 mile of SE16 7LL (Atom)](https://www.thegazette.co.uk/all-notices/notice/data.feed?categorycode=G205010000&location-postcode-1=SE16+7LL&location-distance-1=1&numberOfLocationSearches=1&results-page-size=20) | atom | 200 | 20 | 2026-09-27 | 2026-09-27 Winding-Up Orders: CYGNET FOOD GROUP (HOLDINGS) LIMITED |
| [OpenStreetMap changesets in the Canary Wharf box (API 0.6)](https://api.openstreetmap.org/api/0.6/changesets.json?bbox=-0.03,51.495,-0.005,51.51) | json | 200, CORS | 100 | 2026-10-02 | 2026-10-02 Greater London: Automatically update data on UK education establishments using Get Information About Schools … (325 changes) |
| [Wikidata: items within 3 km with recent inception (P571) or dissolution (P576)](https://query.wikidata.org/sparql?format=json&query=SELECT%20%3Fitem%20%3FitemLabel%20%3Finception%20%3Fdissolved%20WHERE%20%7B%20SERVICE%20wikibase%3Aaround%20%7B%20%3Fitem%20wdt%3AP625%20%3Floc%20.%20bd%3AserviceParam%20wikibase%3Acenter%20%22Point%28-0.02%2051.505%29%22%5E%5Egeo%3AwktLiteral%20.%20bd%3AserviceParam%20wikibase%3Aradius%20%223%22%20.%20%7D%20OPTIONAL%20%7B%20%3Fitem%20wdt%3AP571%20%3Finception%20%7D%20OPTIONAL%20%7B%20%3Fitem%20wdt%3AP576%20%3Fdissolved%20%7D%20FILTER%28BOUND%28%3Fdissolved%29%20%7C%7C%20%28BOUND%28%3Finception%29%20%26%26%20YEAR%28%3Finception%29%20%3E%3D%202015%29%29%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22en%22.%20%7D%20%7D%20ORDER%20BY%20DESC%28COALESCE%28%3Fdissolved%2C%20%3Finception%29%29%20LIMIT%2050) | json | 200, CORS | 50 | 2025-01-01 | Blumont Annuity (inception 2025-01-01) |
| [Canada Water Dockside: retailer directory (WordPress REST)](https://canadawater.co.uk/wp-json/wp/v2/retailer?per_page=20&orderby=date) | json | 200, CORS | 20 | 2026-03-10 | 2026-03-10 The Salt Quay |
| [Greenwich Peninsula: what's here directory (sitemap)](https://www.greenwichpeninsula.co.uk/sitemap.xml) | xml | 200 | 68 | 2026-09-10 | 2026-09-10 london-cable-car |
| [VOA business rates: rating list downloads and change files](https://voaratinglists.blob.core.windows.net/html/rlidata.htm) | html-only | 200 | – | – | (page: VO Rating List Downloads) |
| [Companies House streaming API (company profile events)](https://stream.companieshouse.gov.uk/companies) | json | key required | 0 | – |  |
| [Charity Commission register API](https://api.charitycommission.gov.uk/register/api/allcharitydetailsV2/1/0) | json | key required | 0 | – |  |
| [Overpass API: shops edited since a date in the box](https://overpass-api.de/api/interpreter?data=%5Bout%3Ajson%5D%5Btimeout%3A60%5D%3Bnwr%5B%22shop%22%5D%28newer%3A%222026-09-01T00%3A00%3A00Z%22%29%2851.49%2C-0.035%2C51.515%2C0.0%29%3Bout%20tags%20center%20200%3B) | json | 200 | 19 | 2026-10-03 | Nisa Local (shop=convenience) |

## Other calendars and pages

School term dates (HTML only, no ICS anywhere), the river-bus news page, and blocked river and airport pages.

| Source | Form | Status | Items | Newest | Sample or note |
|---|---|---|---:|---|---|
| [Tower Hamlets school term and holiday dates](https://www.towerhamlets.gov.uk/lgnl/education_and_learning/schools/term_and_holiday_dates.aspx) | html-only | 200 | – | – | School term dates 2026 to 2027 |
| [Southwark school term and holiday dates](https://www.southwark.gov.uk/schools-and-education/school-term-and-holiday-dates) | html-only | 200 | – | – | Academic year 2025 to 2026 |
| [Royal Greenwich school term dates](https://www.royalgreenwich.gov.uk/schools-and-education/school-term-dates) | html-only | 200 | – | – | Term dates 2024 to 2025 |
| [Lewisham school term dates](https://lewisham.gov.uk/myservices/education/schools/term-dates) | html-only | 200 | – | – | School term dates 2024-25 |
| [Uber Boat by Thames Clippers: news](https://www.thamesclippers.com/news) | html-only | 200 | – | – | (page: News - Uber Boat by Thames Clippers) |
| [Port of London Authority: notices to mariners](https://pla.co.uk/notices-to-mariners) | html-only | not verified | – | – |  |
| [London City Airport: media centre](https://www.londoncityairport.com/corporate/media) | html-only | not verified | – | – |  |

## How openings and closings show up

No single feed says "this shop opened" or "this café closed". Each source below shows one kind of trace. Combine them, and diff snapshots: most of these signals are a record that appears or disappears between two fetches.

**Food hygiene registrations (FHRS).** Every food business must register with the council 28 days before it opens. The FSA then lists it with `RatingValue: "AwaitingInspection"` and a placeholder `RatingDate` of 1901-01-01, until the first inspection. `FHRSID` numbers rise over time, so the highest ids are the newest registrations. A closure shows up as an FHRSID that is in yesterday's file and not in today's. Use the daily borough file (fhrs-tower-hamlets-open-data; Southwark 528, Greenwich 511, Newham 525, Lewisham 523) for completeness: new registrations often have no geocode yet, so the lat/long API search misses them.

Worked example, E14 5 (Canary Wharf estate), Tower Hamlets file of 2026-10-03: 232 food businesses in E14 5, 11 awaiting inspection. The newest by FHRSID:

| FHRSID | Business | Type | Postcode |
|---|---|---|---|
| 1992822 | Takusan | Restaurant/Cafe/Canteen | E14 5HD |
| 1992821 | Bartlett Mitchell c/o LSEG | Other catering premises | E14 5AQ |
| 1990700 | Arancino of Sicily | Retailers - other | E14 5AJ |
| 1987973 | Lexington @ State Street London | Restaurant/Cafe/Canteen | E14 5HJ |
| 1987972 | Isso | Restaurant/Cafe/Canteen | E14 5AB |
| 1987968 | Two Twins Tacos Canary Wharf | Restaurant/Cafe/Canteen | E14 5NY |

Takusan, Isso and Two Twins Tacos have no geocode, so the 1-mile API search did not return them. Within 1 mile of Canary Wharf the API returned 753 businesses, 47 awaiting inspection; the newest there were Colcol's cafe & seafood (SE10 0QE, FHRSID 1994111) and Nafsoor Somali Cuisine & Café (E14 6BT, 1993581). Recent first inspections in E14 5 (a sign that a place is trading) include The Ivy in the Park (23 September 2026) and Whole Foods Market (17 September). Show business name, type and postcode only: the FSA lists some home caterers under a person's name.

**Licence applications.** A new bar, restaurant serving alcohol, late-night takeaway or venue needs a premises licence, and the council must publish the application. Tower Hamlets lists every application received each week (th-licence-applications-weekly): a "Premise Licence" row is a new or changed venue, a "Review of Premises licence" row can come before a closure, and "Temporary Events Notice" rows are dated one-off events. The week of 21-28 September 2026 had 25 rows, including a TEN at Barbarella, Mackenzie Walk, E14 5EH for New Year's Eve and TENs at Pennington Street, E1W (Wapping) for 28-30 October. Southwark (register form, "Premises Licence (Applied / In Progress)") and Greenwich (Idox licensing search) have the same data behind forms. Licensing sub-committee hearings (ModernGov GetMeetings for committee 366 in Tower Hamlets, 172 in Southwark, 927 in Newham) show which applications are contested. The premises-name column sometimes holds a private licence holder's name: never keep that column.

**Planning: change of use.** A shop becoming a café, an office becoming a school, or a unit becoming a gym usually needs planning permission. The Planning London Datahub (pld-change-of-use) has every London application in one Elasticsearch index; a "change of use" phrase query within 2 km of Canary Wharf matched 678 applications, the newest updated 2026-10-02 (for example a change of use at Airy Pavilion, Peninsula Square, SE10). The decision date and later the completion date tell you when the new use can start.

**Landlord directories.** Canada Water Dockside publishes its retailers as a WordPress post type (canada-water-retailers-json, CORS): a new post is a new tenant, a removed post is a tenant gone. Its newest at check time were The Salt Quay, The Ship & Whale and The Watchhouse Café (March 2026). Greenwich Peninsula lists businesses under /whats-here/ in its sitemap with lastmod dates (68 URLs, newest 2026-09-10). Canary Wharf Group's directory would be the most useful of these, but canarywharf.com serves a bot challenge to scripts.

**OpenStreetMap.** Mappers record openings and closings as tag changes: a new `shop=*` or `amenity=*` node, `opening_date=*`, or a shop retagged `disused:shop=*` or deleted. The changeset list for the Canary Wharf box (osm-changesets-bbox, CORS) shows that edits happened, with their comments; download each changeset to see the tags. The OSM notes feed carries reports such as "this shop has closed" before anyone edits the map. Overpass can ask directly for shops edited since a date (19 since 1 September 2026 in a box around E14 and SE16, including Nisa Local and Heytea), but it was unreliable from this container. Drop mapper user names and ids.

**The Gazette, corporate insolvency.** Liquidations, administrations and winding-up orders for companies, searchable by distance from a postcode (gazette-corporate-insolvency-e14, -se16). Caution: the search matches any address in the notice, and Canary Wharf is full of insolvency practitioners' offices (for example 30 Churchill Place), so most E14 hits are companies from elsewhere whose liquidator sits here: 23,003 corporate notices matched within 1 mile of E14 5AB. Check the company's own registered or trading address in the notice text. SE16 hits are more often local. Personal insolvency and deceased-estates notices match the same searches and are excluded.

**Companies House.** The company-profile stream (key) emits an event for each incorporation, dissolution and registered-office change; filter on postcode. A registered office is not a shopfront: many E14 companies are registered at service addresses. Company-level data only; the officer and PSC streams are excluded.

**Business rates (VOA).** New and deleted entries in the rating list change files mark new, split, merged or demolished non-domestic units, with effective dates. Ratepayers are not named.

**Wikidata.** Items within 3 km with an inception (P571) since 2015 or a dissolution (P576). Few items, but well dated: buildings, health centres, stations (for example Wood Wharf Health Centre, inception 2023).

**Charity Commission.** Registration and removal dates per charity (key for the API; the bulk register download has no key).

## Not verified

- **Tower Hamlets Council meeting, single-meeting ICS (ModernGov)** — https://democracy.towerhamlets.gov.uk/mgCalendarMonthView.aspx (feed https://democracy.towerhamlets.gov.uk/mgVCalendar.aspx?EID=17875&ET=51&RPID=0&FMT=ICS). Azure WAF JavaScript challenge (HTTP 403) on HTML and ICS pages for scripted requests; the RSS feed and mgWebService are not challenged.
- **Royal Greenwich meeting, single-meeting ICS (ModernGov)** — https://committees.royalgreenwich.gov.uk/ (feed https://greenwich.moderngov.co.uk/mgVCalendar.aspx?EID=2887&ET=51&RPID=0&FMT=ICS). HTTP 403 for scripted requests on committees.royalgreenwich.gov.uk and on mgVCalendar.aspx; RSS and mgWebService answer.
- **Canary Wharf: what's on** — https://canarywharf.com/whats-on/. Imperva Incapsula challenge page (HTTP 200 with a 1 KB challenge body) for scripted requests.
- **Surrey Docks Farm** — https://www.surreydocksfarm.org.uk/. SiteGround captcha (HTTP 202, 169-byte challenge) for scripted requests.
- **St Anne's Limehouse** — https://www.stanneslimehouse.org/. TLS certificate does not match the host name (ERR_TLS_CERT_ALTNAME_INVALID); not bypassed.
- **indigo at The O2** — https://www.indigoattheo2.co.uk/. connection timed out from this container.
- **Visit London: what's on** — https://www.visitlondon.com/things-to-do/whats-on. Cloudflare challenge (HTTP 403).
- **Port of London Authority: notices to mariners** — https://pla.co.uk/notices-to-mariners. Cloudflare challenge (HTTP 403) on the page and on /rss.xml.
- **London City Airport: media centre** — https://www.londoncityairport.com/corporate/media. Cloudflare challenge (HTTP 403).
- **Southwark News (RSS)** — https://www.southwarknews.co.uk/ (feed https://www.southwarknews.co.uk/feed/). SiteGround captcha (HTTP 202) for scripted requests.
- **Wharf Life (Canary Wharf local paper)** — https://wharflife.com/ (feed https://wharflife.com/feed/). www.wharflife.com returned HTTP 403; wharflife.com/feed/ timed out.

Key required (endpoint checked, no key used or stored):

- **Ticketmaster Discovery API (events by lat/long)** — https://app.ticketmaster.com/discovery/v2/events.json?latlong=51.505,-0.02&radius=3&unit=km. HTTP 401 "Failed to resolve API Key variable" without apikey. API key (developer registration; apikey query parameter).
- **Skiddle events API** — https://www.skiddle.com/api/v1/events/search/?latitude=51.505&longitude=-0.02&radius=2. HTTP 400 "A valid API Key must be provided" (errorcode 998). API key (api_key parameter).
- **Songkick API** — https://api.songkick.com/api/3.0/search/locations.json?query=London. HTTP 401 "Invalid or missing apikey". API key (paid partnership).
- **Data Thistle (The List) events API** — https://api.datathistle.com/v1/events. HTTP 401 "Authentication is performed by passing your JWT". JWT bearer token (commercial).
- **Companies House streaming API (company profile events)** — https://stream.companieshouse.gov.uk/companies. HTTP 401 "Empty Authorization header". stream key (free registration).
- **Charity Commission register API** — https://api.charitycommission.gov.uk/register/api/allcharitydetailsV2/1/0. HTTP 401 "missing subscription key". subscription key (free registration).

## Excluded

- **The Gazette personal insolvency notices (category G206030000) and deceased estates (notice type 2903)** — https://www.thegazette.co.uk/all-notices/notice/data.feed?categorycode=G206030000. Personal data about private individuals (bankruptcy orders, deceased people). The same location filters return them; they are excluded by rule.
- **Companies House officer and PSC streams and endpoints** — https://developer-specs.company-information.service.gov.uk/streaming-api/guides/overview. Names, birth months and addresses of individuals. Only the company-profile stream is listed.
- **Personal licence registers (Southwark /LicencePersonal; Tower Hamlets Civica eLR personal licences)** — https://app.southwark.gov.uk/LicencePersonal. Lists named individuals who hold personal alcohol licences.
- **Meetup member lists and RSVP data** — https://www.meetup.com/. Personal data. Only group and event names are in scope; Meetup HTML also embeds member names, which must not be scraped.
- **GOV.UK employment tribunal decisions** — https://www.gov.uk/employment-tribunal-decisions. Titled with private individuals' names. They appear in an unfiltered GOV.UK "Canary Wharf" search; the listed JSON query rejects them.
- **Go Vocal (Let's Talk) ideas, comments and user endpoints** — https://talk.towerhamlets.gov.uk/. Carry residents' names and posts. Only the projects list is used.
- **London Datastore event datasets** — https://data.london.gov.uk/api/action/package_search?q=title:event*. No event-calendar dataset exists; the CKAN search ignored the query and returned all 1,305 datasets. Only survey/impact datasets mention events.
- **Time Out London** — https://www.timeout.com/london. No API or feed; editorial listings under publisher copyright. The weekend page URL tried returned 404.
- **Eventbrite search** — https://www.eventbriteapi.com/v3/events/search/. Endpoint removed (HTTP 404 "The path you requested does not exist"). Only events of known organisers can be read with a token; already in feeds.json.
- **The Wharf (wharf.co.uk)** — https://www.wharf.co.uk/feed/. TLS certificate does not match the host name (ERR_TLS_CERT_ALTNAME_INVALID); not bypassed, so the feed could not be read.
- **Love Wapping (lovewapping.org)** — https://lovewapping.org/feed/. TLS certificate expired (CERT_HAS_EXPIRED); not bypassed.
- **Stale venue feeds: GDIF /feed/ (newest 2018), Docklands Sailing /feed/ (2022), Greenwich Theatre /feed/ (2022), Royal Docks /feeds/events.rss (2019)**. Answer 200 but abandoned; listed sources point at the live alternatives (Royal Docks Atom, Greenwich Theatre REST).
- **Thames tide tables as ICS**. No official ICS found. PLA tide predictions and Admiralty EasyTide (feeds.json) publish HTML/JSON only; third-party tide ICS services are not official.
- **St Mary's Rotherhithe website** — https://www.stmaryrotherhithe.org/. Answered 200, but the page title served to this client was Thai online-slots spam: the site appears compromised (SEO spam injection). Its advertised /feed/ returns 404. Not listed until the parish site is clean.
- **Overpass mirror overpass.private.coffee** — https://overpass.private.coffee/api/interpreter. Answered, but its database was ten weeks old (osm_base 2026-07-24), so "newer than" queries give wrong answers.

## Things found on the way

- canarywharf.com, its sitemap, feed and REST paths, and group.canarywharf.com all return an Imperva Incapsula challenge page to scripts, with status 200. feeds.json records "cw-whats-on" as verified because the status was 200; the body was the challenge, not the listing.
- ModernGov councils each run two hosts. The council-branded host (committees.royalgreenwich.gov.uk, councilmeetings.lewisham.gov.uk, democracy.towerhamlets.gov.uk HTML pages) often blocks scripts; the vendor host (greenwich.moderngov.co.uk, lewisham.moderngov.co.uk) and the `mgRss.aspx` and `mgWebService.asmx` endpoints answer. GetMeetings with committee id 0 works only in Southwark; elsewhere query one committee at a time.
- mgov.newham.gov.uk does not send its intermediate TLS certificate. Browsers cope; curl and Node do not. It was verified by adding the intermediate named in the certificate, without turning TLS checks off.
- TfL's date-range status endpoint needs times in the dates (`2026-10-03T00:00:00`); plain dates give 404. At check time the Jubilee line was closed between Green Park and Canary Wharf on 3-4 October 2026.
- The Gazette's distance search is loose: a 2-mile search round E14 returned Westminster traffic orders. Filter on borough names in the text.
- A GOV.UK search for "Canary Wharf" returns employment tribunal decisions titled with private individuals' names. The listed query rejects that document type.
- WordPress sites send CORS on their REST API, so venue post types (The Space, Wilton's, Greenwich Theatre, Canada Water retailers) are readable from a static page even though the sites have no events plugin or ICS.
- St Mary's Rotherhithe's site served an online-slots spam title: it looks compromised, so it is excluded.

## Permits, works and closures (added 2026-10-04)

Sources fetched by `tools/fetch-works.mjs` into dated snapshots in [works/](works/) and shown by date and place on [whatson.html](https://danbri.github.io/glitchcan-minigam/magpie/cwplans/feeds/whatson.html). Items are counted in the zone (the 3D model box plus the Royal Docks). Method, gaps and rejected sources: [works/README.md](works/README.md).

| Source | Feed | Status | Items | Newest | Sample |
|---|---|---|---:|---|---|
| [TfL planned closures by date range, every line serving the zone (tube, DLR, Elizabeth line, Overground, river bus, cable car, national rail)](https://api.tfl.gov.uk/Line/jubilee,dlr,elizabeth,windrush,district,hammersmith-city,c2c,southeastern,rb1,rb4,rb6,london-cable-car/Status/2026-10-04T00:00:00/to/2027-01-02T23:59:00?detail=true) | json | 200, CORS | 29 | 2026-12-28 | Waterloo & City: Waterloo & City line: service operates 06:00 until 00:30, Monday to Friday only. There is no service on Saturdays, Sundays… |
| [TfL road disruptions by date range (works, planned events, incidents)](https://api.tfl.gov.uk/Road/all/Disruption?stripContent=true&startDate=2026-10-04T00:00:00&endDate=2027-01-02T23:59:00) | json | 200, CORS | 9 | 2026-11-08 | Procession - [A11] Whitechapel Road (Both directions) at the junction of [A107] Cambridge Heath Road - A procession to mark the Battle of C… |
| [TfL closed and restricted street segments by date range](https://api.tfl.gov.uk/Road/all/Street/Disruption?startDate=2026-10-04T00:00:00&endDate=2026-11-30T23:59:00) | json | 200, CORS | 321 | – | SELBORNE ROAD (E17): Closed, Both directions (Thames Water works) |
| [TfL bus route disruptions and diversions (all routes)](https://api.tfl.gov.uk/Line/Mode/bus/Status?detail=true) | json | 200, CORS | 28 | 2027-02-01 | Routes 133: KING WILLIAM STREET, City of London: Route 133 is on diversion towards Streatham only until 19:00 on 1 February 2027 due to maj… |
| [TfL bus stop closures (all modes: bus)](https://api.tfl.gov.uk/StopPoint/Mode/bus/Disruption?includeRouteBlockedStops=true) | json | 200, CORS | 25 | 2027-01-01 | Exning Road (->E); Star Lane Stn / Star Primary Sch (Stop E); Malmesbury Terrace (Stop R): Bus stop closed. Signal works. |
| [DfT Street Manager open-data archive: highway-authority activities (street events, cranes, hoardings)](https://opendata.manage-roadworks.service.gov.uk/activity/2026/09.zip) | json | 200 | 44 | 2027-06-03 | (24434) Hoarding for Christopher Street for external generators for refurbishment works. |
| [DfT Street Manager open-data archive: works permits](https://opendata.manage-roadworks.service.gov.uk/permit/2026/09.zip) | json | 200 | 316 | 2027-11-17 | Utility asset works by THAMES WATER: Road closure |
| [The Gazette: Road Traffic Acts notices by issuing authority (JSON search)](https://www.thegazette.co.uk/all-notices/notice/data.json?noticetypes=1501&text=%22Tower%20Hamlets%22&start-publish-date=2026-06-06&results-page-size=100) | json | 200 | 72 | 2028-07-31 | ROYAL BOROUGH OF GREENWICH ROAD TRAFFIC REGULATION ACT 1984 – SECTION 14(1) BRAMSHOT AVENUE – WAITING AND LOADING PROHIBITIONS AND PARKING … |
| [Planning London Datahub: applications for temporary events and structures in the zone](https://planningdata.london.gov.uk/api-guest/applications/_search) | json | 200 | 18 | 2026-09-25 | P2025/1393/FUL TEA GARDENS: Temporary Change of Use of Finsbury Square for event days of up to 93 (65 days in addition of the 28 allowed th… |
| [Tower Hamlets: Markets in Tower Hamlets (days, times, places)](https://www.towerhamlets.gov.uk/lgnl/business/markets/markets_in_tower_hamlets.aspx) | html-only | 200 | 7 | – | Brick Lane Market: Sundays, Sundays, 10am to 3pm |
